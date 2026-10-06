"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(protocol = "http:") {
  const calls = [], values = new Map();
  let status = { connected: true, token: "first-token", runtime: { available: false }, stored: { digest: "pc-digest" } };
  let fail = false;
  const window = {};
  const context = vm.createContext({ window, location: { protocol, hostname: "127.0.0.1" },
    localStorage: { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) || null },
    fetch: async (route, options) => {
      calls.push({ route, options });
      const result = route === "/api/bridge/status" ? status : route === "/api/state" ? { digest: "attached-digest" }
        : fail ? { error: "synthetic diagnostic failure" } : { runtime: { available: true, readiness: "ready", auth: { status: "authenticated", method: "chatgpt" } } };
      return { ok: !(fail && route === "/api/runtime/check"), json: async () => result };
    } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/client-bridge.js"), "utf8"), context);
  return { bridge: window.MacroBridge.create(), calls, values,
    setStatus: value => { status = value; }, setFailure: value => { fail = value; } };
}

test("explicit runtime check refreshes token without attaching or changing a stored digest", async () => {
  const f = fixture();
  await f.bridge.refresh();
  const digest = f.bridge.digest;
  f.setStatus({ connected: true, token: "new-token", runtime: { available: false }, stored: { digest: "new-pc-digest" } });
  f.calls.length = 0;
  const runtime = await f.bridge.checkRuntime();
  assert.equal(runtime.readiness, "ready");
  assert.equal(f.bridge.digest, digest); assert.equal(f.bridge.enabled, false);
  assert.deepEqual(f.calls.map(value => value.route), ["/api/bridge/status", "/api/runtime/check"]);
  assert.equal(f.calls[1].options.headers["X-Macro-Token"], "new-token");
  assert.equal(f.calls[1].options.body, "{}");
  assert.equal(f.values.size, 0);
});

test("diagnostic failure keeps an attached PC connection and its revision", async () => {
  const f = fixture();
  await f.bridge.refresh(); await f.bridge.attach({ synthetic: true }, "pc-digest");
  const digest = f.bridge.digest, remembered = [...f.values];
  f.setFailure(true); f.calls.length = 0;
  await assert.rejects(f.bridge.checkRuntime(), /synthetic diagnostic failure/);
  assert.equal(f.bridge.digest, digest); assert.equal(f.bridge.enabled, true);
  assert.deepEqual([...f.values], remembered);
  assert.deepEqual(f.calls.map(value => value.route), ["/api/bridge/status", "/api/runtime/check"]);
});

test("file-address diagnosis does not contact a server or alter the current connection", async () => {
  const f = fixture("file:");
  await assert.rejects(f.bridge.checkRuntime(), /로컬 앱 주소/);
  assert.equal(f.calls.length, 0); assert.equal(f.bridge.digest, null); assert.equal(f.bridge.enabled, false);
});
