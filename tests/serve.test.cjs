'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-server-build-test-'));
  for (const [directory, extension] of [['tools', '.cjs'], ['src', '.js']]) {
    const target = path.join(root, directory);
    fs.mkdirSync(target);
    for (const name of fs.readdirSync(path.join(project, directory)).filter(name => name.endsWith(extension))) {
      fs.copyFileSync(path.join(project, directory, name), path.join(target, name));
    }
  }
  fs.copyFileSync(path.join(project, 'src', 'styles.css'), path.join(root, 'src', 'styles.css'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('macro-server-build-test-'));
    fs.rmSync(root, { force: true, recursive: true });
  });
  return root;
}
function identity(root) {
  const output = execFileSync(process.execPath, ['-e',
    'const {workspaceId,buildId}=require("./tools/serve.cjs");process.stdout.write(JSON.stringify({workspaceId,buildId}));'],
  { cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true });
  const result = JSON.parse(output);
  assert.match(result.workspaceId, /^[a-f0-9]{64}$/);
  assert.match(result.buildId, /^[a-f0-9]{64}$/);
  return result;
}

test('server build identity includes every directly and transitively loaded domain module', t => {
  const root = fixture(t), original = identity(root);
  const files = ['storage.js', 'training-store.js', 'nutrition.js', 'insights.js', 'coach.js', 'training.js', 'coach-query.js', 'coach-context.js'];
  for (const name of files) {
    const file = path.join(root, 'src', name), before = fs.readFileSync(file);
    fs.appendFileSync(file, '\n// Synthetic server build identity regression.\n');
    const changed = identity(root);
    assert.equal(changed.workspaceId, original.workspaceId, name + ': workspace identity stays stable');
    assert.notEqual(changed.buildId, original.buildId, name + ': a cached domain update needs a new server');
    fs.writeFileSync(file, before);
    assert.deepEqual(identity(root), original, name + ': restoring code restores its content identity');
  }
  assert.equal(fs.existsSync(path.join(root, 'user-data')), false, 'hashing must not initialize private state');
});

test('browser-only script and CSS updates do not invalidate the running server build', t => {
  const root = fixture(t), original = identity(root);
  for (const name of ['app.js', 'training-ui.js', 'styles.css']) {
    fs.appendFileSync(path.join(root, 'src', name), '\n/* Synthetic browser asset update. */\n');
    assert.deepEqual(identity(root), original, name + ': browser assets are read from disk, not cached domain code');
  }
  assert.equal(fs.existsSync(path.join(root, 'user-data')), false);
});

test('server build identity still covers its runtime, bridge, diary and lock helpers', t => {
  const root = fixture(t), original = identity(root);
  for (const name of ['serve.cjs', 'bridge.cjs', 'coach-runtime.cjs', 'codex-binary.cjs', 'diary.cjs', 'diary-settings.cjs', 'locks.cjs']) {
    const file = path.join(root, 'tools', name), before = fs.readFileSync(file);
    fs.appendFileSync(file, '\n// Synthetic server helper update.\n');
    const changed = identity(root);
    assert.equal(changed.workspaceId, original.workspaceId);
    assert.notEqual(changed.buildId, original.buildId, name + ': server helper updates retain build invalidation');
    fs.writeFileSync(file, before);
  }
});
