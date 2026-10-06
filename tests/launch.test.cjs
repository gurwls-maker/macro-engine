'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { launch, probe } = require('../tools/launch.cjs');
const { createServer, workspaceId, buildId } = require('../tools/serve.cjs');
const close = server => new Promise(resolve => server.close(resolve));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-launch-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('macro-launch-test-'));
    fs.rmSync(root, { force: true, recursive: true });
  });
  return () => createServer({ bridge: { data: path.join(root, 'private'), runtimeOptions: { bin: null } } });
}
test('launcher opens a loopback app without Codex and reuses the same workspace server', async t => {
  const factory = fixture(t), opened = [];
  const spare = http.createServer(); await new Promise(resolve => spare.listen(0, '127.0.0.1', resolve));
  const port = spare.address().port; await close(spare);
  const result = await launch({ port, createServer: factory, probe: async () => false, open: async url => opened.push(url) });
  t.after(() => close(result.server));
  assert.equal(result.reused, false); assert.equal(await probe(port), true);
  const again = await launch({ port, createServer: () => { throw new Error('must reuse'); }, open: async url => opened.push(url) });
  assert.equal(again.reused, true); assert.equal(again.url, result.url); assert.deepEqual(opened, [result.url, result.url]);
  const response = await fetch(`${result.url}/api/app`); assert.deepEqual(await response.json(), { product: 'macro-engine', workspaceId, buildId, bridge: true });
});
test('launcher does not reuse unrelated services and chooses a free loopback port', async t => {
  const factory = fixture(t);
  const other = http.createServer((req, res) => res.end(JSON.stringify({ product: 'macro-engine', workspaceId: 'different-copy' })));
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve)); t.after(() => close(other));
  assert.equal(await probe(other.address().port), false);
  const result = await launch({ port: other.address().port, createServer: factory, open: async () => {} });
  t.after(() => close(result.server));
  assert.notEqual(Number(new URL(result.url).port), other.address().port);
  assert.equal(result.server.address().address, '127.0.0.1');
});
test('launcher failure closes only its newly started server', async t => {
  const factory = fixture(t); let own;
  const spare = http.createServer(); await new Promise(resolve => spare.listen(0, '127.0.0.1', resolve));
  const port = spare.address().port; await close(spare);
  await assert.rejects(launch({ port, probe: async () => false, createServer: () => (own = factory()), open: async () => { throw new Error('synthetic browser failure'); } }), /synthetic browser failure/);
  assert.equal(own.listening, false);
  await assert.rejects(launch({ port: 80 }), /local port/);
});
test('launcher probe has a total deadline for incomplete and oversized service responses', async t => {
  const server = http.createServer((req, res) => { res.writeHead(200); res.write('{'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => close(server));
  const start = Date.now(); assert.equal(await probe(server.address().port, 80), false);
  assert.ok(Date.now() - start < 600, 'an incomplete response cannot hang app startup');
  server.removeAllListeners('request'); server.on('request', (req, res) => { res.writeHead(200); res.write('x'.repeat(5000)); });
  assert.equal(await probe(server.address().port, 80), false);
});
test('launcher cannot mistake a static-only or stale runtime for the connected app', async t => {
  const staticServer = createServer();
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve)); t.after(() => close(staticServer));
  assert.equal(await probe(staticServer.address().port), false);
  const stale = http.createServer((req, res) => res.end(JSON.stringify({ product: 'macro-engine', workspaceId, buildId: 'old-runtime', bridge: true })));
  await new Promise(resolve => stale.listen(0, '127.0.0.1', resolve)); t.after(() => close(stale));
  assert.equal(await probe(stale.address().port), false);
});
