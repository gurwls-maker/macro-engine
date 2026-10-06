"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { CoachRuntime } = require("../tools/coach-runtime.cjs");

function fixture(t, options = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "macro-runtime-diagnostic-")), calls = [];
  const spawn = (bin, args, settings) => {
    if (options.throwSpawn) throw new Error("synthetic spawn error with a secret");
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.killed = 0;
    child.kill = () => { child.killed += 1; if (!options.delayClose) queueMicrotask(() => child.emit("close", null)); return true; };
    calls.push({ bin, args, settings, child }); return child;
  };
  const runtime = new CoachRuntime(data, { bin: "synthetic-codex", spawn, diagnosticTimeoutMs: 1000, ...options });
  t.after(() => {
    runtime.close(); calls.forEach(call => call.child.emit("close", null));
    fs.rmSync(data, { recursive: true, force: true });
  });
  return { runtime, calls, data, finish(text, code = 0) { const child = calls.at(-1).child; child.stderr.write(text); child.emit("close", code); } };
}
const chat = { kind: "chat", question: "합성 질문", context: { facts: [] } };

test("cached status does not probe authentication or re-discover the executable", t => {
  let searches = 0;
  const f = fixture(t, { bin: undefined, findBin: () => { searches += 1; return "synthetic-native"; } });
  for (let i = 0; i < 5; i += 1) {
    const status = f.runtime.status();
    assert.equal(status.installation, "found"); assert.equal(status.readiness, "unchecked");
    assert.equal(status.checkedAt, null); assert.equal(status.auth.status, "unchecked");
  }
  assert.equal(searches, 1); assert.equal(f.calls.length, 0);
});

test("explicit check re-discovers a newly installed binary and runs only login status", async t => {
  let installed = false, searches = 0;
  const f = fixture(t, { bin: undefined, findBin: () => { searches += 1; return installed ? "synthetic-new-native" : null; } });
  assert.equal(f.runtime.status().readiness, "missing-binary");
  installed = true;
  const pending = f.runtime.checkRuntime(); await Promise.resolve();
  assert.equal(f.runtime.status().checking, true);
  const call = f.calls[0];
  assert.equal(call.bin, "synthetic-new-native");
  assert.deepEqual(call.args, ["login", "status"]);
  assert.equal(call.settings.shell, false); assert.equal(call.settings.windowsHide, true);
  assert.deepEqual(call.settings.stdio, ["ignore", "pipe", "pipe"]);
  f.finish("Logged in using ChatGPT\n");
  const status = await pending;
  assert.equal(status.readiness, "ready"); assert.equal(status.auth.method, "chatgpt");
  assert.equal(status.checking, false); assert.ok(Number.isFinite(Date.parse(status.checkedAt)));
  assert.equal(searches, 2);
  assert.deepEqual(fs.readdirSync(path.join(f.data, "jobs")), []);
  assert.ok(!JSON.stringify(status).includes("synthetic-new-native"));
});

test("injected bin:null remains offline and never calls discovery or a real CLI", async t => {
  const f = fixture(t, { bin: null, findBin: () => { assert.fail("explicit offline injection must not discover Codex"); } });
  const status = await f.runtime.checkRuntime();
  assert.equal(status.installation, "missing"); assert.equal(status.readiness, "missing-binary");
  assert.equal(status.auth.status, "unchecked"); assert.equal(f.calls.length, 0);
});

test("authentication methods and signed-out state are distinct without exposing raw output", async t => {
  const f = fixture(t);
  for (const [text, code, expected, method] of [
    ["Logged in using an API key - sk-synthetic-secret", 0, "ready", "api-key"],
    ["Logged in with another supported method", 0, "ready", "unknown"],
    ["Not logged in", 1, "login-required", "unknown"],
    ["unsupported CLI error C:/private/auth.json sk-synthetic-secret", 1, "check-failed", "unknown"],
    ["", 0, "check-failed", "unknown"]
  ]) {
    const pending = f.runtime.checkRuntime(); await Promise.resolve(); f.finish(text, code);
    const status = await pending;
    assert.equal(status.readiness, expected); assert.equal(status.auth.method, method);
    assert.ok(!JSON.stringify(status).includes("sk-synthetic-secret"));
    assert.ok(!JSON.stringify(status).includes("auth.json"));
  }
});

test("simultaneous checks reuse one probe and prevent a coaching launch until it closes", async t => {
  const f = fixture(t), first = f.runtime.checkRuntime(), second = f.runtime.checkRuntime();
  assert.equal(first, second); await Promise.resolve();
  assert.equal(f.calls.length, 1);
  assert.throws(() => f.runtime.start(chat), /확인하고 있어요/);
  f.finish("Logged in using ChatGPT");
  await first;
  assert.equal(f.runtime.status().checking, false);
});

test("active AI requests and live shared locks are not disturbed by a check", async t => {
  const f = fixture(t);
  const job = f.runtime.start(chat);
  const status = await f.runtime.checkRuntime();
  assert.equal(status.running, job.id); assert.equal(status.checkedAt, null); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].args[0], "exec");
  const other = fixture(t);
  fs.writeFileSync(path.join(other.data, ".ai-lock"), JSON.stringify({ ownerPid: process.pid, childPid: null, nonce: "12345678-1234-1234-1234-123456789abc", jobId: "a".repeat(32) }));
  assert.equal((await other.runtime.checkRuntime()).checkedAt, null); assert.equal(other.calls.length, 0);
});

test("an exited shared lock permits read-only diagnosis without deleting the old lock", async t => {
  const f = fixture(t), file = path.join(f.data, ".ai-lock");
  const text = JSON.stringify({ ownerPid: 2147483647, childPid: 2147483646, nonce: "12345678-1234-1234-1234-123456789abc", jobId: "a".repeat(32) });
  fs.writeFileSync(file, text);
  const pending = f.runtime.checkRuntime(); await Promise.resolve();
  f.finish("Logged in using ChatGPT");
  assert.equal((await pending).readiness, "ready");
  assert.equal(fs.readFileSync(file, "utf8"), text);
});

test("timeout and excessive output stop diagnosis without leaking content or launching AI", async t => {
  const timed = fixture(t, { diagnosticTimeoutMs: 15, delayClose: true });
  const pending = timed.runtime.checkRuntime(); await Promise.resolve();
  const status = await pending;
  assert.equal(status.readiness, "check-failed"); assert.equal(timed.calls[0].child.killed, 1);
  assert.equal(timed.runtime.status().checking, true, "a killed process stays guarded until its close is observed");
  assert.throws(() => timed.runtime.start(chat), /확인하고 있어요/);
  timed.calls[0].child.emit("close", null);
  assert.equal(timed.runtime.status().checking, false);
  const large = fixture(t, { diagnosticMaxBytes: 16 });
  const capped = large.runtime.checkRuntime(); await Promise.resolve();
  large.calls[0].child.stdout.write("sk-synthetic-secret-output".repeat(20));
  assert.equal((await capped).readiness, "check-failed"); assert.equal(large.calls[0].child.killed, 1);
  assert.ok(!JSON.stringify(large.runtime.status()).includes("synthetic-secret"));
});

test("spawn failures stay unknown and server close stops a pending diagnostic", async t => {
  const failed = fixture(t, { throwSpawn: true });
  assert.equal((await failed.runtime.checkRuntime()).readiness, "check-failed");
  assert.equal(failed.runtime.status().checking, false);
  const closed = fixture(t), pending = closed.runtime.checkRuntime(); await Promise.resolve();
  closed.runtime.close();
  assert.equal((await pending).readiness, "check-failed");
  assert.equal(closed.calls[0].child.killed, 1);
});
