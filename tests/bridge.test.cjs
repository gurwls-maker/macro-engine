"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const { spawn } = require("node:child_process");
const S = require("../src/storage.js");
const D = require("../tools/diary.cjs");
const { createBridge, imageType } = require("../tools/bridge.cjs");
const { createServer } = require("../tools/serve.cjs");
const { CoachRuntime, validateResult, summarizeState, digest } = require("../tools/coach-runtime.cjs");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
const hash = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const cleanupActions = new WeakMap();
function cleanup(t, action) { cleanupActions.get(t).push(action); }
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "macro-bridge-test-"));
  cleanupActions.set(t, []);
  t.after(async () => {
    for (const action of cleanupActions.get(t).reverse()) await action();
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith("macro-bridge-test-"));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return directory;
}
function state() {
  return { ...S.createEmpty(), updatedAt: "2026-10-05T00:00:00.000Z" };
}
function day(date, weightKg = null) {
  return { date, weightKg, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
}
function request(port, target, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = options.raw === undefined ? (options.body === undefined ? null : JSON.stringify(options.body)) : options.raw;
    const headers = { ...(payload === null ? {} : { "Content-Type": "application/json" }), ...options.headers };
    if (payload !== null) headers["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({ hostname: "127.0.0.1", port, path: target, method: options.method || "GET", headers }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(bytes.toString("utf8")); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, bytes, json });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
async function server(t) {
  const root = temporary(t);
  const data = path.join(root, "private");
  const instance = createServer({ bridge: { data, runtimeOptions: { bin: null } } });
  await new Promise((resolve, reject) => { instance.once("error", reject); instance.listen(0, "127.0.0.1", resolve); });
  cleanup(t, () => new Promise(resolve => instance.close(resolve)));
  const port = instance.address().port;
  const initial = await request(port, "/api/bridge/status");
  assert.equal(initial.status, 200);
  const headers = { "x-macro-token": initial.json.token };
  return { root, data, port, token: initial.json.token, get: (url, opts) => request(port, url, opts), post: (url, body, opts = {}) => request(port, url, { ...opts, method: "POST", body, headers: { ...headers, ...opts.headers } }) };
}
function sourceFixture(t, paths = ["nested/source.png"]) {
  const root = temporary(t), data = path.join(root, "private"), sourceRoot = path.join(root, "originals");
  fs.mkdirSync(path.join(sourceRoot, "nested"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "nested", "source.png"), PNG);
  const imageHash = hash(PNG);
  D.init(data, sourceRoot);
  D.atomicJson(path.join(data, "manifest.json"), { schemaVersion: 1, sources: { [imageHash]: { paths, status: "pending", bytes: PNG.length } }, baselineAt: null });
  const bridge = createBridge({ data, runtimeOptions: { bin: null } });
  cleanup(t, () => bridge.close());
  return { root, data, sourceRoot, imageHash, bridge };
}
function result(kind = "chat") {
  return { kind, answer: "확인한 기록을 바탕으로 답합니다.", questions: [], uncertainties: [], workouts: [], meal: null, body: null };
}
function runtimeFixture(t, options = {}) {
  const data = temporary(t), launches = [];
  function fakeSpawn(bin, args, settings) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.prompt = "";
    child.stdin = new Writable({ write(chunk, encoding, callback) { child.prompt += chunk.toString(); callback(); } });
    child.kill = () => { child.killRequested = true; return true; };
    launches.push({ child, bin, args, settings });
    return child;
  }
  const runtime = new CoachRuntime(data, { bin: "synthetic-codex", spawn: fakeSpawn, timeoutMs: 5000, ...options });
  cleanup(t, () => runtime.close());
  const input = { kind: "chat", question: "오늘 기록에서 확인할 점은?", imageHash: null, context: { date: "2026-10-05" } };
  function complete(index = 0, output = result()) {
    const launch = launches[index];
    fs.writeFileSync(launch.args[launch.args.indexOf("--output-last-message") + 1], JSON.stringify(output), "utf8");
    launch.child.emit("close", 0);
  }
  return { data, launches, runtime, input, complete, spawn: fakeSpawn };
}

test("bridge token and private API reject foreign host, origin, fetch site and missing POST token", async t => {
  const api = await server(t);
  for (const headers of [
    { Host: "attacker.invalid:4173" },
    { Origin: "https://attacker.invalid" },
    { Origin: "null" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" }
  ]) {
    const response = await api.get("/api/bridge/status", { headers });
    assert.equal(response.status, 403);
    assert.equal(response.json.token, undefined);
  }
  for (const token of [undefined, "incorrect"]) {
    const response = await request(api.port, "/api/state", { method: "POST", body: { state: state(), expectedDigest: null }, headers: token ? { "x-macro-token": token } : {} });
    assert.equal(response.status, 403);
  }
  const sameOrigin = await api.get("/api/bridge/status", { headers: { Origin: `http://127.0.0.1:${api.port}`, "Sec-Fetch-Site": "same-origin" } });
  assert.equal(sameOrigin.status, 200);
  assert.match(sameOrigin.json.token, /^[a-f0-9]{64}$/);
  assert.equal(sameOrigin.headers["cache-control"], "no-store");
  assert.equal(sameOrigin.headers["access-control-allow-origin"], undefined);
});

test("bridge rejects non-JSON, malformed, unsupported-method and unknown API requests", async t => {
  const api = await server(t);
  assert.equal((await api.post("/api/state", {}, { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await api.post("/api/state", {}, { raw: "{" })).status, 400);
  assert.equal((await api.get("/api/state", { method: "OPTIONS" })).status, 405);
  assert.equal((await api.get("/api/unknown")).status, 404);
  assert.equal((await api.post("/api/diary/context", { from: "2026-02-30", to: "2026-10-05" })).status, 400);
});

test("static server never exposes private data, tools, repository metadata or encoded traversal", async t => {
  const api = await server(t);
  for (const target of ["/user-data/coach/app-state.json", "/tools/bridge.cjs", "/.git/config", "/%2e%2e/package.json", "/src/%2e%2e/package.json", "/assets/../../package.json"]) {
    assert.equal((await api.get(target)).status, 404, target);
  }
  assert.equal((await api.get("/index.html")).status, 200);
  const head = await api.get("/src/storage.js", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(head.bytes.length, 0);
});

test("state CAS accepts first save and rejects a stale writer without replacing stored state", async t => {
  const api = await server(t), initial = state();
  assert.deepEqual((await api.get("/api/state")).json, { state: null, digest: null });
  const first = await api.post("/api/state", { state: initial, expectedDigest: null });
  assert.equal(first.status, 200); assert.equal(first.json.digest, digest(initial));
  const change = structuredClone(initial); change.days["2026-10-05"] = day("2026-10-05", 70);
  const stale = await api.post("/api/state", { state: change, expectedDigest: null });
  assert.equal(stale.status, 409); assert.equal(stale.json.digest, first.json.digest);
  assert.deepEqual((await api.get("/api/state")).json.state, initial);
  const saved = await api.post("/api/state", { state: change, expectedDigest: first.json.digest });
  assert.equal(saved.status, 200);
  assert.deepEqual(D.readJson(path.join(api.data, "app-state.json.previous")), initial);
});

test("unchanged reconnect never rewrites state or rotates the last different backup", async t => {
  const api = await server(t), initial = state();
  const first = await api.post("/api/state", { state: initial, expectedDigest: null });
  const change = structuredClone(initial); change.days["2026-10-05"] = day("2026-10-05", 70);
  const saved = await api.post("/api/state", { state: change, expectedDigest: first.json.digest });
  const file = path.join(api.data, "app-state.json"), previous = `${file}.previous`;
  const currentBytes = fs.readFileSync(file), backupBytes = fs.readFileSync(previous), mtime = fs.statSync(file).mtimeMs;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reconnect = await api.post("/api/state", { state: change, expectedDigest: saved.json.digest });
    assert.equal(reconnect.status, 200); assert.equal(reconnect.json.digest, saved.json.digest);
    assert.deepEqual(fs.readFileSync(file), currentBytes); assert.deepEqual(fs.readFileSync(previous), backupBytes);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
  }
  assert.deepEqual(D.readJson(previous), initial);
  const stale = await api.post("/api/state", { state: change, expectedDigest: first.json.digest });
  assert.equal(stale.status, 409, "identical content does not waive an explicit stale CAS revision");
});

test("simultaneous same-version state writes have one winner and one visible conflict", async t => {
  const api = await server(t), initial = state();
  const first = await api.post("/api/state", { state: initial, expectedDigest: null });
  const alternatives = [70, 71].map(weight => ({ ...initial, days: { "2026-10-05": day("2026-10-05", weight) } }));
  const responses = await Promise.all(alternatives.map(value => api.post("/api/state", { state: value, expectedDigest: first.json.digest })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = alternatives[responses.findIndex(response => response.status === 200)];
  assert.deepEqual((await api.get("/api/state")).json.state, winner);
});

test("two local-server processes sharing private storage cannot both accept the same CAS revision", async t => {
  const root = temporary(t), data = path.join(root, "private"), barrier = path.join(root, "release");
  const initial = state();
  D.atomicJson(path.join(data, "app-state.json"), initial);
  const code = `
    const fs = require('node:fs');
    const path = require('node:path');
    const D = require(${JSON.stringify(require.resolve("../tools/diary.cjs"))});
    const createServer = require(${JSON.stringify(require.resolve("../tools/serve.cjs"))}).createServer;
    const data = process.argv[1], barrier = process.argv[2] + '-' + process.pid;
    const atomic = D.atomicJson;
    D.atomicJson = (file, value) => {
      if (file === path.join(data, 'app-state.json')) {
        process.send({ writing: true });
        const deadline = Date.now() + 5000;
        const wait = new Int32Array(new SharedArrayBuffer(4));
        while (!fs.existsSync(barrier) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 5);
        if (!fs.existsSync(barrier)) throw new Error('synthetic test barrier timed out');
      }
      return atomic(file, value);
    };
    const server = createServer({ bridge: { data, runtimeOptions: { bin: null } } });
    server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
    process.on('message', message => { if (message === 'close') server.close(() => process.exit(0)); });
  `;
  const children = [];
  function worker() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["-e", code, data, barrier], { windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
      const entry = { child, writing: false, output: "" }; children.push(entry);
      child.stderr.on("data", chunk => { entry.output += chunk.toString(); });
      child.once("error", reject);
      child.once("exit", code => { if (code) reject(new Error(entry.output || `Synthetic worker exited ${code}`)); });
      child.on("message", message => { if (message.writing) entry.writing = true; if (message.port) resolve({ ...entry, port: message.port }); });
    });
  }
  cleanup(t, async () => {
    for (const { child } of children) fs.writeFileSync(`${barrier}-${child.pid}`, "release");
    await Promise.all(children.map(({ child }) => new Promise(resolve => {
      if (child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => child.kill(), 2000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.send("close");
    })));
  });
  const workers = await Promise.all([worker(), worker()]);
  const tokens = await Promise.all(workers.map(({ port }) => request(port, "/api/bridge/status")));
  const inputs = [70, 71].map(weight => ({ ...initial, days: { "2026-10-05": day("2026-10-05", weight) } }));
  const pending = workers.map(({ port }, index) => request(port, "/api/state", { method: "POST", headers: { "x-macro-token": tokens[index].json.token }, body: { state: inputs[index], expectedDigest: digest(initial) } }));
  const deadline = Date.now() + 300;
  while (!children.every(entry => entry.writing) && Date.now() < deadline) await delay(5);
  const firstWriter = children.findIndex(entry => entry.writing);
  assert.ok(firstWriter >= 0, "one worker must have reached the atomic replacement");
  fs.writeFileSync(`${barrier}-${children[firstWriter].child.pid}`, "release");
  await pending[firstWriter];
  for (const { child } of children) fs.writeFileSync(`${barrier}-${child.pid}`, "release");
  const responses = await Promise.all(pending);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = inputs[responses.findIndex(response => response.status === 200)];
  assert.deepEqual(D.readJson(path.join(data, "app-state.json")), winner);
});

test("invalid state and damaged persisted JSON cannot erase the previous data", async t => {
  const api = await server(t), initial = state();
  const saved = await api.post("/api/state", { state: initial, expectedDigest: null });
  const file = path.join(api.data, "app-state.json"), before = fs.readFileSync(file, "utf8");
  assert.equal((await api.post("/api/state", { state: { ...initial, version: 999 }, expectedDigest: saved.json.digest })).status, 400);
  assert.equal(fs.readFileSync(file, "utf8"), before);
  fs.writeFileSync(file, "{damaged synthetic backup", "utf8");
  assert.equal((await api.get("/api/state")).status, 400);
  assert.ok((await api.get("/api/bridge/status")).json.storageError);
  assert.equal((await api.post("/api/state", { state: initial, expectedDigest: null })).status, 400);
  assert.equal(fs.readFileSync(file, "utf8"), "{damaged synthetic backup");
});

test("failed atomic state replacement preserves the old file and releases temporary files", async t => {
  const api = await server(t), initial = state();
  const saved = await api.post("/api/state", { state: initial, expectedDigest: null });
  const file = path.join(api.data, "app-state.json"), originalRename = fs.renameSync;
  const change = { ...initial, days: { "2026-10-05": day("2026-10-05", 72) } };
  try {
    fs.renameSync = (source, target) => { if (target === file) throw Object.assign(new Error("synthetic replacement denied"), { code: "EACCES" }); return originalRename(source, target); };
    const failed = await api.post("/api/state", { state: change, expectedDigest: saved.json.digest });
    assert.notEqual(failed.status, 200);
  } finally { fs.renameSync = originalRename; }
  assert.deepEqual(D.readJson(file), initial);
  assert.deepEqual(D.readJson(`${file}.previous`), initial);
  assert.equal(fs.readdirSync(api.data).some(name => name.endsWith(".tmp")), false);
  assert.equal((await api.post("/api/state", { state: change, expectedDigest: saved.json.digest })).status, 200);
});

test("diary API honors the CLI write lock and clearly identifies its unchanged cached fallback", async t => {
  const api = await server(t), source = path.join(api.root, "originals");
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, "synthetic.png"), PNG);
  D.init(api.data, source);
  const manifest = path.join(api.data, "manifest.json"), before = fs.readFileSync(manifest, "utf8");
  const lock = path.join(api.data, ".write-lock"); fs.writeFileSync(lock, "synthetic CLI owner\n", "utf8");
  const response = await api.post("/api/diary/context", { from: "2026-10-01", to: "2026-10-05" });
  assert.equal(response.status, 200);
  assert.ok(response.json.scan.warning);
  assert.equal(response.json.context.sessions.length, 0);
  assert.equal(fs.readFileSync(manifest, "utf8"), before);
  assert.equal(fs.readFileSync(lock, "utf8"), "synthetic CLI owner\n");
});

test("private image lookup accepts actual manifest paths arrays and verifies the current bytes", t => {
  const fixture = sourceFixture(t);
  assert.equal(fixture.bridge.imageFile(fixture.imageHash), path.join(fixture.sourceRoot, "nested", "source.png"));
  fs.writeFileSync(path.join(fixture.sourceRoot, "nested", "source.png"), Buffer.from("changed"));
  assert.throws(() => fixture.bridge.imageFile(fixture.imageHash));
  assert.throws(() => fixture.bridge.imageFile("../manifest.json"));
});

test("private image lookup rejects traversal and junction paths even when their hash matches", t => {
  const fixture = sourceFixture(t, ["../outside.png"]);
  fs.writeFileSync(path.join(fixture.root, "outside.png"), PNG);
  assert.throws(() => fixture.bridge.imageFile(fixture.imageHash));
  const outside = path.join(fixture.root, "outside"); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "source.png"), PNG);
  fs.symlinkSync(outside, path.join(fixture.sourceRoot, "link"), process.platform === "win32" ? "junction" : "dir");
  D.atomicJson(path.join(fixture.data, "manifest.json"), { schemaVersion: 1, sources: { [fixture.imageHash]: { paths: ["link/source.png"], status: "pending" } } });
  assert.throws(() => fixture.bridge.imageFile(fixture.imageHash));
});

test("malformed manifest paths cannot be interpreted as a sequence of single-character filenames", t => {
  const fixture = sourceFixture(t, "a.png");
  fs.writeFileSync(path.join(fixture.sourceRoot, "a"), PNG);
  assert.throws(() => fixture.bridge.imageFile(fixture.imageHash));
});

test("image upload is content-addressed, preserves duplicate bytes and rejects ambiguous encodings", async t => {
  const api = await server(t), imageHash = hash(PNG);
  const input = { kind: "meal", name: "synthetic.png", base64: PNG.toString("base64") };
  const upload = await api.post("/api/inbox", input);
  assert.equal(upload.status, 200); assert.equal(upload.json.hash, imageHash);
  assert.equal((await api.post("/api/inbox", input)).status, 200);
  const files = fs.readdirSync(path.join(api.data, "inbox"));
  assert.deepEqual(files.sort(), [`${imageHash}.json`, `${imageHash}.png`].sort());
  const preview = await api.get(`/api/images/${imageHash}`);
  assert.equal(preview.status, 200); assert.equal(preview.headers["content-type"], "image/png");
  assert.equal(preview.headers["x-content-type-options"], "nosniff"); assert.deepEqual(preview.bytes, PNG);
  for (const inputChange of [{ base64: "PHNjcmlwdD4=" }, { base64: `${input.base64}\n` }, { base64: input.base64.replace(/=+$/, "") }, { kind: "unknown" }, { name: " " }]) {
    assert.equal((await api.post("/api/inbox", { ...input, ...inputChange })).status, 400);
  }
  fs.writeFileSync(path.join(api.data, "inbox", `${imageHash}.png`), Buffer.from("modified"));
  assert.equal((await api.get(`/api/images/${imageHash}`)).status, 400);
  assert.equal(imageType(Buffer.from("<svg></svg>")), null);
});

test("an upload metadata-write failure can be retried without replacing its original image", async t => {
  const api = await server(t), imageHash = hash(PNG), originalAtomic = D.atomicJson;
  const input = { kind: "workout", name: "synthetic.png", base64: PNG.toString("base64") };
  try {
    D.atomicJson = (file, value) => { if (file === path.join(api.data, "inbox", `${imageHash}.json`)) throw new Error("synthetic metadata write failure"); return originalAtomic(file, value); };
    assert.equal((await api.post("/api/inbox", input)).status, 400);
  } finally { D.atomicJson = originalAtomic; }
  assert.deepEqual(fs.readFileSync(path.join(api.data, "inbox", `${imageHash}.png`)), PNG);
  assert.equal((await api.post("/api/inbox", input)).status, 200);
  assert.equal((await api.get("/api/inbox")).json.images.length, 1);
});

test("runtime launches only an ephemeral read-only isolated Codex process and caches completed context", t => {
  const fixture = runtimeFixture(t);
  const job = fixture.runtime.start(fixture.input);
  const launch = fixture.launches[0];
  assert.equal(job.status, "running"); assert.equal(fixture.launches.length, 1);
  for (const flag of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"]) assert.ok(launch.args.includes(flag), flag);
  assert.equal(launch.args[launch.args.indexOf("--sandbox") + 1], "read-only");
  assert.equal(launch.settings.shell, false); assert.equal(launch.settings.windowsHide, true);
  assert.ok(D.inside(fixture.data, launch.settings.cwd));
  assert.ok(launch.child.prompt.includes(JSON.stringify(fixture.input)));
  assert.throws(() => fixture.runtime.start({ ...fixture.input, question: "another" }));
  fixture.complete();
  assert.equal(fixture.runtime.get(job.id).status, "completed");
  assert.equal(fixture.runtime.status().running, null);
  assert.deepEqual(fixture.runtime.start(fixture.input), fixture.runtime.get(job.id));
  assert.equal(fixture.launches.length, 1);
  assert.equal(fixture.runtime.get(job.id).process, undefined);
  assert.equal(fixture.runtime.get(job.id).timer, undefined);
});

test("another runtime distinguishes a live owner from an interrupted persisted job", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input);
  const restarted = new CoachRuntime(fixture.data, { bin: null });
  cleanup(t, () => restarted.close());
  assert.equal(restarted.get(job.id).status, "running");
  const lockFile = path.join(fixture.data, ".ai-lock"), lock = D.readJson(lockFile);
  fs.writeFileSync(lockFile, JSON.stringify({ ...lock, ownerPid: 2147483647 }), "utf8");
  assert.equal(restarted.get(job.id).status, "interrupted");
  assert.equal(restarted.status().running, null);
  assert.equal(restarted.get("a".repeat(32)), null);
  assert.throws(() => restarted.get("../job.json"));
});

test("runtime instances sharing storage cannot start a second child until the first exits", t => {
  const fixture = runtimeFixture(t);
  const other = new CoachRuntime(fixture.data, { bin: "synthetic-codex", spawn: fixture.spawn, timeoutMs: 5000 });
  cleanup(t, () => other.close());
  fixture.runtime.start(fixture.input);
  const nextInput = { ...fixture.input, question: "다른 서버에서 요청한 질문" };
  assert.throws(() => other.start(nextInput));
  assert.equal(fixture.launches.length, 1);
  fixture.complete();
  const next = other.start(nextInput);
  assert.equal(next.status, "running"); assert.equal(fixture.launches.length, 2);
  fixture.complete(1);
  assert.equal(other.get(next.id).status, "completed");
});

test("cancelled child retains the shared runtime lock until its process close is observed", t => {
  const fixture = runtimeFixture(t);
  const other = new CoachRuntime(fixture.data, { bin: "synthetic-codex", spawn: fixture.spawn, timeoutMs: 5000 });
  cleanup(t, () => other.close());
  const job = fixture.runtime.start(fixture.input);
  fixture.runtime.cancel(job.id);
  const nextInput = { ...fixture.input, question: "취소 후 새 요청" };
  assert.throws(() => other.start(nextInput));
  assert.equal(fixture.launches.length, 1);
  fixture.launches[0].child.emit("close", null);
  const next = other.start(nextInput);
  assert.equal(next.status, "running"); assert.equal(fixture.launches.length, 2);
  fixture.complete(1);
  assert.equal(other.get(next.id).status, "completed");
});

test("an old failed child's late close cannot release a newer child's shared lock", t => {
  const fixture = runtimeFixture(t);
  const other = new CoachRuntime(fixture.data, { bin: "synthetic-codex", spawn: fixture.spawn, timeoutMs: 5000 });
  cleanup(t, () => other.close());
  fixture.runtime.start(fixture.input);
  fixture.launches[0].child.emit("error", new Error("synthetic failed spawn"));
  const next = fixture.runtime.start({ ...fixture.input, question: "두 번째 작업" });
  fixture.launches[0].child.emit("close", -1);
  assert.equal(fixture.runtime.status().running, next.id);
  assert.throws(() => other.start({ ...fixture.input, question: "다른 서버의 세 번째 작업" }));
  assert.equal(fixture.launches.length, 2);
  fixture.complete(1);
});

test("post-spawn lock metadata failure keeps other runtimes blocked until the child exits", t => {
  const fixture = runtimeFixture(t), writeSync = fs.writeSync;
  const other = new CoachRuntime(fixture.data, { bin: "synthetic-codex", spawn: fixture.spawn, timeoutMs: 5000 });
  cleanup(t, () => other.close());
  try {
    fs.writeSync = (fd, ...args) => {
      if (fixture.launches.length && fd === fixture.runtime.lock?.fd) throw new Error("synthetic lock metadata failure after truncation");
      return writeSync(fd, ...args);
    };
    fixture.runtime.start(fixture.input);
  } finally { fs.writeSync = writeSync; }
  assert.equal(fixture.launches.length, 1);
  assert.throws(() => other.start({ ...fixture.input, question: "다른 서버의 작업" }));
  fixture.launches[0].child.emit("close", -1);
  const next = other.start({ ...fixture.input, question: "원래 child 종료 후 요청" });
  assert.equal(next.status, "running");
  fixture.complete(1);
});

test("runtime cancels without accepting a late result from the cancelled process", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input);
  fixture.runtime.cancel(job.id);
  assert.equal(fixture.runtime.get(job.id).status, "cancelled");
  fixture.complete();
  assert.equal(fixture.runtime.get(job.id).status, "cancelled");
  assert.equal(fixture.runtime.get(job.id).result, null);
});

test("cancellation retains the single-child boundary until that child actually exits", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input);
  fixture.runtime.cancel(job.id);
  assert.throws(() => fixture.runtime.start({ ...fixture.input, question: "next question" }));
  fixture.launches[0].child.emit("close", null);
  const next = fixture.runtime.start({ ...fixture.input, question: "next question" });
  assert.equal(next.status, "running");
  fixture.runtime.cancel(next.id);
  fixture.launches[1].child.emit("close", null);
});

test("runtime timeout is a terminal failure and late process success does not resurrect it", async t => {
  const fixture = runtimeFixture(t, { timeoutMs: 10 }), job = fixture.runtime.start(fixture.input);
  await delay(40);
  assert.equal(fixture.runtime.get(job.id).status, "failed");
  fixture.complete();
  assert.equal(fixture.runtime.get(job.id).status, "failed");
  assert.equal(fixture.runtime.get(job.id).result, null);
});

test("runtime spawn and invalid-output failures do not return an apparently completed answer", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input);
  fixture.complete(0, { ...result(), unexpected: true });
  assert.equal(fixture.runtime.get(job.id).status, "failed");
  assert.equal(fixture.runtime.get(job.id).result, null);
  const failure = fixture.runtime.start({ ...fixture.input, question: "retry with another context" });
  fixture.launches[1].child.emit("error", new Error("synthetic spawn failure"));
  assert.equal(fixture.runtime.get(failure.id).status, "failed");
});

test("a failed initial job save leaves no active ghost and starts no child", t => {
  const fixture = runtimeFixture(t), originalAtomic = D.atomicJson;
  try {
    D.atomicJson = (file, value) => { if (file.endsWith(`${path.sep}job.json`)) throw new Error("synthetic job write failure"); return originalAtomic(file, value); };
    assert.throws(() => fixture.runtime.start(fixture.input));
    assert.equal(fixture.runtime.status().running, null);
    assert.equal(fixture.launches.length, 0);
    assert.equal(fs.existsSync(path.join(fixture.data, ".ai-lock")), false);
  } finally { D.atomicJson = originalAtomic; }
});

test("failed initial lock content write removes only the uninitialized lock owned by this attempt", t => {
  const fixture = runtimeFixture(t), writeFile = fs.writeFileSync;
  try {
    fs.writeFileSync = (file, ...args) => {
      if (typeof file === "number" && file === fixture.runtime.lock?.fd) throw new Error("synthetic initial lock write failure");
      return writeFile(file, ...args);
    };
    assert.throws(() => fixture.runtime.start(fixture.input));
  } finally { fs.writeFileSync = writeFile; }
  assert.equal(fixture.launches.length, 0);
  assert.equal(fixture.runtime.status().running, null);
  assert.equal(fs.existsSync(path.join(fixture.data, ".ai-lock")), false);
  assert.equal(fixture.runtime.start(fixture.input).status, "running");
  fixture.complete();
});

test("a failed completion save cannot be reported as a durable completed answer", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input), originalAtomic = D.atomicJson;
  try {
    D.atomicJson = (file, value) => { if (file.endsWith(`${path.sep}job.json`)) throw new Error("synthetic completion write failure"); return originalAtomic(file, value); };
    assert.doesNotThrow(() => fixture.complete());
    assert.notEqual(fixture.runtime.get(job.id).status, "completed");
    assert.ok(fixture.runtime.get(job.id).error);
  } finally { D.atomicJson = originalAtomic; }
});

test("a failed error-status save does not throw from a child event into the local server", t => {
  const fixture = runtimeFixture(t), job = fixture.runtime.start(fixture.input), originalAtomic = D.atomicJson;
  try {
    D.atomicJson = (file, value) => { if (file.endsWith(`${path.sep}job.json`)) throw new Error("synthetic failure-status write failure"); return originalAtomic(file, value); };
    assert.doesNotThrow(() => fixture.launches[0].child.emit("error", new Error("synthetic child error")));
    assert.equal(fixture.runtime.get(job.id).status, "failed");
  } finally { D.atomicJson = originalAtomic; }
});

test("AI meal drafts preserve unknown nutrition rather than converting it to zero", () => {
  const draft = { ...result("meal"), meal: { date: "2026-10-05", name: "사진 속 식사", protein: null, carbs: null, fat: null, otherKcal: null, alcoholG: null, basis: "estimate", note: "분량 확인 전 초안" } };
  assert.equal(validateResult(draft, "meal").meal.protein, null);
  assert.throws(() => validateResult({ ...draft, meal: { ...draft.meal, protein: "0" } }, "meal"));
  assert.throws(() => validateResult(draft, "chat"));
  assert.throws(() => validateResult({ ...result(), meal: draft.meal }, "chat"));
});

test("AI workout drafts preserve raw block identity, nullable numbers and literal set markers", () => {
  const exercise = { rawName: "원문 운동", reportedVolumeKg: null, loadConvention: "as-recorded", durationMinutes: null, repsTotal: null, sets: [{ loadKg: 0, reps: null, marker: "W" }, { loadKg: null, reps: 8, marker: "A" }, { loadKg: 30, reps: 10, marker: "D" }, { loadKg: null, reps: null, marker: "S" }] };
  const workout = { date: "2026-10-05", time: null, label: "원문 분류", durationMinutes: null, reportedSetCount: null, reportedEnergyKcal: null, reportedVolumeKg: null, exercises: [exercise, structuredClone(exercise)], uncertainties: ["독립 표기의 뜻은 확인하지 못함"] };
  const draft = { ...result("workout"), workouts: [workout] };
  const validated = validateResult(draft, "workout");
  assert.equal(validated.workouts[0].exercises.length, 2);
  assert.deepEqual(validated.workouts[0].exercises[0].sets, exercise.sets);
  assert.equal(validated.workouts[0].reportedSetCount, null);
  for (const modify of [
    value => { value.workouts[0].extra = true; },
    value => { value.workouts[0].exercises[0].extra = true; },
    value => { value.workouts[0].exercises[0].sets[0].extra = true; },
    value => { value.workouts[0].exercises[0].sets[0].loadKg = "0"; },
    value => { value.workouts[0].exercises[0].loadConvention = "per-side"; }
  ]) {
    const invalid = structuredClone(draft); modify(invalid);
    assert.throws(() => validateResult(invalid, "workout"));
  }
  assert.equal(validateResult({ ...result("workout"), uncertainties: ["운동 기록이 보이지 않아 판독하지 않음"] }, "workout").workouts.length, 0);
});

test("coaching context excludes future day observations and validates the selected date", () => {
  const input = state();
  input.days["2026-10-04"] = day("2026-10-04", 70);
  input.days["2026-10-06"] = day("2026-10-06", 71);
  const context = summarizeState(input, "2026-10-05");
  assert.deepEqual(context.recentDays.map(item => item.date), ["2026-10-04"]);
  assert.equal(context.today.complete, false);
  assert.equal(context.today.weightKg, undefined);
  assert.throws(() => summarizeState(input, "2026-02-30"));
});
