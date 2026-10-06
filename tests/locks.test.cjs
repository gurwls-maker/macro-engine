"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Locks = require("../tools/locks.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "macro-locks-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, ".write-lock") };
}
function withProbe(action, statuses = {}) {
  const original = process.kill;
  process.kill = (pid, signal) => {
    assert.equal(signal, 0);
    const status = statuses[pid] || "ESRCH";
    if (status === "alive") return true;
    throw Object.assign(new Error(status), { code: status });
  };
  try { return action(); } finally { process.kill = original; }
}
function ai(ownerPid = 100, childPid = 101) {
  return { ownerPid, childPid, nonce: "12345678-1234-1234-1234-123456789abc", jobId: "a".repeat(32) };
}

test("legacy writer lock is reclaimed only after its PID is known to have exited", t => {
  const { file } = fixture(t);
  fs.writeFileSync(file, "100\n");
  withProbe(() => {
    assert.equal(Locks.inspect(file).state, "exited");
    const fd = Locks.acquire(file);
    fs.writeFileSync(fd, `${process.pid}\n`);
    Locks.release(file, fd);
  });
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(`${file}.recovery`), false);
});

test("a live writer or an unqueryable PID remains untouched", t => {
  const { file } = fixture(t);
  fs.writeFileSync(file, "100\n");
  for (const status of ["alive", "EPERM", "EINVAL"]) {
    withProbe(() => {
      assert.equal(Locks.inspect(file).state, status === "alive" ? "held" : "unknown");
      assert.throws(() => Locks.acquire(file), { code: "EEXIST" });
      assert.equal(fs.readFileSync(file, "utf8"), "100\n");
    }, { 100: status });
  }
});

test("AI recovery requires the recorded owner and child both to have exited", t => {
  const { file } = fixture(t);
  fs.writeFileSync(file, JSON.stringify(ai()));
  withProbe(() => {
    const observed = Locks.inspect(file, { kind: "ai" });
    assert.equal(observed.state, "exited");
    assert.equal(observed.jobId, "a".repeat(32));
    const fd = Locks.acquire(file, { kind: "ai" });
    Locks.release(file, fd);
  });
  assert.equal(fs.existsSync(file), false);
});

test("live or unqueryable AI child survives an exited owner", t => {
  const { file } = fixture(t), text = JSON.stringify(ai());
  fs.writeFileSync(file, text);
  for (const status of ["alive", "EPERM"]) {
    withProbe(() => {
      assert.equal(Locks.inspect(file, { kind: "ai" }).state, status === "alive" ? "held" : "unknown");
      assert.throws(() => Locks.acquire(file, { kind: "ai" }), { code: "EEXIST" });
      assert.equal(fs.readFileSync(file, "utf8"), text);
    }, { 101: status });
  }
});

test("a null child PID is unresolved, not proof that no AI process exists", t => {
  const { file } = fixture(t), text = JSON.stringify(ai(100, null));
  fs.writeFileSync(file, text);
  withProbe(() => {
    assert.equal(Locks.inspect(file, { kind: "ai" }).state, "unknown");
    assert.throws(() => Locks.acquire(file, { kind: "ai" }), { code: "EEXIST" });
    assert.equal(fs.readFileSync(file, "utf8"), text);
  });
});

test("empty, malformed, implausible and oversized metadata fails closed", t => {
  const { file } = fixture(t);
  for (const text of ["", "synthetic owner", "0\n", "-1\n", "2147483648\n", "100\n101\n", "x".repeat(4097)]) {
    fs.writeFileSync(file, text);
    withProbe(() => {
      assert.equal(Locks.inspect(file).state, "unknown");
      assert.throws(() => Locks.acquire(file), { code: "EEXIST" });
      assert.equal(fs.readFileSync(file, "utf8"), text);
    });
  }
  fs.writeFileSync(file, JSON.stringify({ ...ai(), nonce: "bad" }));
  withProbe(() => assert.throws(() => Locks.acquire(file, { kind: "ai" }), { code: "EEXIST" }));
});

test("a lock changed during PID inspection is not reclaimed", t => {
  const { file } = fixture(t), original = process.kill;
  fs.writeFileSync(file, "100\n");
  process.kill = (pid, signal) => {
    assert.equal(pid, 100); assert.equal(signal, 0);
    fs.writeFileSync(file, "200\n");
    throw Object.assign(new Error("exited"), { code: "ESRCH" });
  };
  try { assert.throws(() => Locks.acquire(file), { code: "EEXIST" }); }
  finally { process.kill = original; }
  assert.equal(fs.readFileSync(file, "utf8"), "200\n");
});

test("a concurrent or damaged recovery guard is preserved instead of guessed away", t => {
  const { file } = fixture(t);
  fs.writeFileSync(file, "100\n");
  fs.writeFileSync(`${file}.recovery`, "existing guard");
  withProbe(() => assert.throws(() => Locks.acquire(file), { code: "EEXIST" }));
  assert.equal(fs.readFileSync(file, "utf8"), "100\n");
  assert.equal(fs.readFileSync(`${file}.recovery`, "utf8"), "existing guard");
});

test("release closes its own handle without deleting a replacement lock", t => {
  const { file } = fixture(t), fd = Locks.acquire(file);
  fs.writeFileSync(fd, "100\n");
  fs.unlinkSync(file);
  fs.writeFileSync(file, "200\n");
  Locks.release(file, fd);
  assert.equal(fs.readFileSync(file, "utf8"), "200\n");
});

test("independent recovering processes can acquire only one writer lock", async t => {
  const { file } = fixture(t);
  fs.writeFileSync(file, "2147483647\n");
  const worker = `const fs=require('node:fs'), L=require(process.argv[2]); let fd; process.on('message', message=>{if(message==='start'){try{fd=L.acquire(process.argv[1]);fs.writeFileSync(fd,process.pid+'\\n');process.send('acquired');}catch(error){process.send(error.code==='EEXIST'?'blocked':'error:'+error.code);}}else if(message==='release'){if(fd!==undefined)L.release(process.argv[1],fd);process.exit(0);}});process.send('ready');`;
  const children = [0, 1].map(() => spawn(process.execPath, ["-e", worker, file, path.resolve(__dirname, "../tools/locks.cjs")], { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true }));
  t.after(() => children.forEach(child => { if (child.exitCode === null) child.kill(); }));
  function message(child) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("lock worker timed out")), 10000);
      child.once("message", value => { clearTimeout(timer); resolve(value); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
    });
  }
  const readyA = message(children[0]), readyB = message(children[1]);
  assert.equal(await readyA, "ready"); assert.equal(await readyB, "ready");
  const resultA = message(children[0]), resultB = message(children[1]);
  children.forEach(child => child.send("start"));
  assert.deepEqual([await resultA, await resultB].sort(), ["acquired", "blocked"]);
  const closed = children.map(child => new Promise(resolve => child.once("exit", resolve)));
  children.forEach(child => child.send("release"));
  await closed[0]; await closed[1];
  assert.equal(fs.existsSync(file), false);
});
