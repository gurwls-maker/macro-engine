const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findCodex } = require('../tools/codex-binary.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-codex-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, value) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); return file;
  };
  const pe = relative => write(relative, Buffer.from([0x4d, 0x5a, 0, 0]));
  const json = (relative, value) => write(relative, JSON.stringify(value));
  const lookup = output => findCodex({ platform: 'win32', arch: 'x64', env: {}, lookup: () => output });
  return { root, write, pe, json, lookup };
}

function npmPackage(f, prefix = '', metadata = {}) {
  const root = path.join(prefix, 'node_modules', '@openai', 'codex');
  f.json(path.join(root, 'package.json'), { name: '@openai/codex', bin: { codex: 'bin/codex.js' }, ...metadata });
  f.write(path.join(root, 'bin/codex.js'), '#!/usr/bin/env node\n');
  return root;
}

test('native PATH executable is returned without executing it or a shell', t => {
  const f = fixture(t), executable = f.pe('native/codex.exe');
  assert.equal(f.lookup(executable), fs.realpathSync(executable));
});

test('Windows npm shim resolves the official optional native package with Unicode and spaces', t => {
  const f = fixture(t), prefix = '내 도구 폴더';
  npmPackage(f, prefix, { optionalDependencies: { '@openai/codex-win32-x64': 'npm:@openai/codex@1-win32-x64' } });
  const optional = path.join(prefix, 'node_modules', '@openai', 'codex-win32-x64');
  f.json(path.join(optional, 'package.json'), { name: '@openai/codex', os: ['win32'], cpu: ['x64'] });
  const executable = f.pe(path.join(optional, 'vendor/x86_64-pc-windows-msvc/bin/codex.exe'));
  const shim = f.write(path.join(prefix, 'codex.cmd'), 'do not execute this wrapper');
  assert.equal(f.lookup(shim), fs.realpathSync(executable));
});

test('older npm bundled binaries and PowerShell shims stay supported', t => {
  const f = fixture(t), root = npmPackage(f);
  const executable = f.pe(path.join(root, 'vendor/x86_64-pc-windows-msvc/codex/codex.exe'));
  const shim = f.write('codex.ps1', 'do not execute this wrapper');
  assert.equal(f.lookup(shim), fs.realpathSync(executable));
});

test('JavaScript entrypoint resolves a native executable rather than spawning the wrapper', t => {
  const f = fixture(t), root = npmPackage(f);
  const executable = f.pe(path.join(root, 'vendor/x86_64-pc-windows-msvc/bin/codex.exe'));
  assert.equal(f.lookup(path.join(f.root, root, 'bin/codex.js')), fs.realpathSync(executable));
});

test('unknown package identity, entrypoint and missing binary stay unavailable', t => {
  for (const metadata of [{ name: 'other' }, { bin: { codex: 'evil.js' } }, {}]) {
    const f = fixture(t), root = npmPackage(f, '', metadata);
    if (metadata.name || metadata.bin) f.pe(path.join(root, 'vendor/x86_64-pc-windows-msvc/bin/codex.exe'));
    assert.equal(f.lookup(f.write('codex.cmd', '@echo off')), null);
  }
});

test('wrong architecture optional package never resolves a native executable', t => {
  const f = fixture(t);
  npmPackage(f, '', { optionalDependencies: { '@openai/codex-win32-x64': 'npm:@openai/codex@1' } });
  f.json('node_modules/@openai/codex-win32-x64/package.json', { name: '@openai/codex', os: ['win32'], cpu: ['arm64'] });
  f.pe('node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
  assert.equal(f.lookup(f.write('codex.cmd', '@echo off')), null);
});

test('lookup failures and unknown wrappers can fall back only to a real native PATH entry', t => {
  const f = fixture(t), shim = f.write('unknown/codex.cmd', 'not run'), executable = f.pe('native/codex.exe');
  assert.equal(f.lookup(`${shim}\r\n${executable}\r\n`), fs.realpathSync(executable));
  assert.equal(findCodex({ env: {}, lookup: () => { throw new Error('No PATH match'); } }), null);
  assert.equal(f.lookup('codex.exe'), null);
});

test('explicit override is validated and an invalid override never silently falls back', t => {
  const f = fixture(t), executable = f.pe('custom/tool.exe');
  const options = { platform: 'win32', arch: 'x64', lookup: () => { throw new Error('Must not look up'); } };
  assert.equal(findCodex({ ...options, env: { MACRO_CODEX_BIN: executable } }), fs.realpathSync(executable));
  for (const file of [f.write('codex.cmd', 'not executed'), f.write('fake.exe', '#!/usr/bin/env node'), path.join(f.root, 'missing.exe'), f.root]) {
    assert.equal(findCodex({ ...options, env: { MACRO_CODEX_BIN: file } }), null);
  }
});

test('Linux executable signatures and execute permissions distinguish native binaries from JS wrappers', t => {
  const f = fixture(t), executable = f.write('native/codex', Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  fs.chmodSync(executable, 0o755);
  assert.equal(findCodex({ platform: 'linux', env: {}, lookup: () => executable }), fs.realpathSync(executable));
  assert.equal(findCodex({ platform: 'linux', env: {}, lookup: () => f.write('wrapper/codex', '#!/usr/bin/env node') }), null);
});
