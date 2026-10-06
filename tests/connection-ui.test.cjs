'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const I = require('../src/insights.js');

function harness(options = {}) {
  const state = S.createEmpty(); state.training = TS.createEmpty();
  state.training.messages.push({ id: 'old-question', role: 'user', text: '<script>stored question</script>', status: 'answered' });
  const saved = new Map(options.saved || []), notices = [], dialogs = [], elements = new Map(), listeners = new Map();
  const bridge = { status: options.status || { connected: true, runtime: { available: false, readiness: 'missing-binary' } }, checks: 0,
    async checkRuntime() { this.checks++; this.status.runtime = { available: true, readiness: 'ready', auth: { status: 'authenticated', method: 'chatgpt' } }; } };
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const app = { getState: () => state, getDay: () => ({ complete: false }), getView: () => 'coach', escape, fmt: String, icon: () => '',
    command: (action, label, icon, attributes = '') => `<button data-action="${action}" ${attributes}>${label}</button>`,
    iconButton: (action, label, icon, attributes = '') => `<button data-action="${action}" aria-label="${label}" ${attributes}></button>`,
    openDialog: (title, html) => dialogs.push({ title, html }), closeDialog() {}, render() {}, icons() {}, toast: (text, error) => notices.push({ text, error }) };
  const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { if (options.saveFailure) throw new Error('synthetic quota'); saved.set(key, value); } };
  const sandbox = { window: { MacroTraining: {}, MacroTrainingStore: TS, MacroStorage: S, MacroInsights: I, MacroBridge: { create: () => bridge } },
    localStorage, location: options.location || { protocol: 'http:', hostname: '127.0.0.1' },
    document: { addEventListener(type, handler) { const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list); },
      getElementById: id => elements.get(id) || (id === 'entryDialog' ? { open: false } : null) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/training-ui.js'), 'utf8'), sandbox);
  return { ui: sandbox.window.MacroTrainingUI.create(app), state, saved, notices, dialogs, bridge, elements, listeners };
}

test('unavailable coaching exposes direct recording and preserves history without a disabled composer', () => {
  const h = harness(), before = structuredClone(h.state);
  const html = h.ui.chatHTML();
  assert.match(html, /conversation-offline/);
  for (const action of ['training-add', 'meal-add', 'connection-setup', 'bridge-refresh']) assert.match(html, new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(html, /coachChatInput|conversation-compose/);
  assert.match(html, /conversation-saved/); assert.match(html, /&lt;script&gt;stored question&lt;\/script&gt;/);
  assert.deepEqual(h.state, before); assert.equal(h.bridge.checks, 0);
});

test('file photo action opens double-click launch setup instead of discarding the click', async () => {
  const h = harness({ location: { protocol: 'file:', hostname: '' }, status: { connected: false } });
  await h.ui.handleAction({ dataset: { action: 'training-image' } });
  assert.equal(h.dialogs.length, 1); assert.match(h.dialogs[0].html, /Macro Engine\.cmd/);
  assert.match(h.dialogs[0].html, /파일로 열려/); assert.match(h.dialogs[0].html, /설치나 로그인을 자동 실행하지/);
  assert.equal(h.notices.length, 0); assert.equal(h.bridge.checks, 0);
});

test('connection setup distinguishes checked blockers from unverified and ready installations', () => {
  const cases = [
    ['missing-binary', false, null, false, /Codex 설치가 필요/],
    ['login-required', true, { status: 'signed-out' }, false, /Codex 로그인이 필요/],
    ['check-failed', true, { status: 'unknown' }, false, /로그인 상태를 확인하지 못/],
    ['unchecked', true, { status: 'unchecked' }, true, /로그인 상태는 아직 미확인/],
    ['ready', true, { status: 'authenticated' }, true, /Codex 설치·로그인 확인됨/]
  ];
  for (const [readiness, available, auth, allowed, label] of cases) {
    const h = harness({ status: { connected: true, runtime: { readiness, available, auth } } });
    assert.equal(h.ui.canAskAI(), allowed, readiness); h.ui.setupDialog();
    assert.match(h.dialogs[0].html, label); assert.equal(h.bridge.checks, 0);
    assert.match(h.dialogs[0].html, /사진이나 기록을 보내지 않고 AI 상담을 시작하지/);
  }
});

test('explicit installation check does not require profile or modify app records', async () => {
  const h = harness(), before = structuredClone(h.state);
  await h.ui.handleAction({ dataset: { action: 'connection-check' } });
  assert.equal(h.bridge.checks, 1); assert.equal(h.ui.canAskAI(), true);
  assert.deepEqual(h.state, before); assert.equal(h.state.profile, null);
});

test('turning Codex off persists only a local preference and can be reversed without deleting records', async () => {
  const status = { connected: true, runtime: { available: true, readiness: 'ready' } }, h = harness({ status });
  const before = structuredClone(h.state);
  await h.ui.handleChange({ target: { id: 'codexUseEnabled', checked: false } });
  assert.equal(h.saved.get('macro-engine.codex-use'), 'disabled'); assert.equal(h.ui.canAskAI(), false);
  assert.match(h.ui.chatHTML(), /Codex 사용을 꺼두었어요/);
  const reopened = harness({ status, saved: [...h.saved] }); assert.equal(reopened.ui.canAskAI(), false);
  await h.ui.handleChange({ target: { id: 'codexUseEnabled', checked: true } });
  assert.equal(h.ui.canAskAI(), true); assert.deepEqual(h.state, before); assert.equal(h.bridge.checks, 0);
});

test('preference save failure restores the previous selection and does not hide working AI', async () => {
  const h = harness({ saveFailure: true, status: { connected: true, runtime: { available: true, readiness: 'ready' } } });
  const target = { id: 'codexUseEnabled', checked: false };
  await h.ui.handleChange({ target });
  assert.equal(target.checked, true); assert.equal(h.ui.canAskAI(), true);
  assert.match(h.notices[0].text, /저장하지 못/); assert.equal(h.notices[0].error, true);
});

test('API-key authentication is not presented as ChatGPT account allowance', () => {
  const h = harness({ status: { connected: true, runtime: { available: true, readiness: 'ready', auth: { status: 'authenticated', method: 'api-key' } } } });
  assert.match(h.ui.chatHTML(), /API 키 인증/); assert.doesNotMatch(h.ui.chatHTML(), /계정 사용량/);
});

test('folder scans expose unresolved images without requesting AI or changing numeric records', () => {
  const h = harness(), before = structuredClone(h.state);
  h.ui.onDiaryScan({ pending: [{ hash: 'a'.repeat(64), paths: ['synthetic/2026-10-06/workout.png'] }] });
  const html = h.ui.inboxHTML();
  assert.match(html, /새 폴더 이미지 · 미판독/); assert.match(html, /workout\.png/);
  assert.match(html, /data-action="image-source-start"/); assert.match(html, /AI 판독 연결이 필요/);
  assert.equal(h.bridge.checks, 0); assert.deepEqual(h.state, before);
  h.ui.onDiaryScan({ pending: [] }); assert.doesNotMatch(h.ui.inboxHTML(), /새 폴더 이미지 · 미판독/);
});

test('offline history keeps its reading position when a closed details element has no layout', () => {
  const h = harness();
  const log = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400, visible: true,
    getClientRects() { return this.visible ? [{}] : []; } };
  h.elements.set('coachContent', { querySelector: () => log });
  h.ui.enhanceChat(); assert.equal(log.scrollTop, 1000);
  log.scrollTop = 200; h.ui.captureChatScroll();
  log.visible = false; log.scrollTop = 0; h.ui.captureChatScroll(); h.ui.enhanceChat();
  log.visible = true;
  for (const handler of h.listeners.get('toggle')) handler({ target: { matches: () => true, open: true } });
  assert.equal(log.scrollTop, 200);
});

test('an in-memory question draft remains readable when Codex is turned off', async () => {
  const h = harness({ status: { connected: true, runtime: { available: true, readiness: 'ready' } } });
  for (const handler of h.listeners.get('input')) handler({ target: { id: 'coachChatInput', value: 'temporary <question>' } });
  await h.ui.handleChange({ target: { id: 'codexUseEnabled', checked: false } });
  assert.match(h.ui.chatHTML(), /작성 중인 질문/); assert.match(h.ui.chatHTML(), /temporary &lt;question&gt;/);
  await h.ui.handleChange({ target: { id: 'codexUseEnabled', checked: true } });
  const input = { value: '' }; h.elements.set('coachChatInput', input);
  h.elements.set('coachChatForm', { querySelector: () => ({}) });
  h.elements.set('coachContent', { querySelectorAll: () => [], querySelector: () => null });
  h.ui.enhanceChat(); assert.equal(input.value, 'temporary <question>');
});

test('a busy runtime does not present the previously checked login as a new diagnostic', async () => {
  const h = harness({ status: { connected: true, runtime: { available: true, readiness: 'ready', busy: true, checkedAt: '2026-10-05T12:00:00.000Z' } } });
  h.bridge.checkRuntime = async () => { h.bridge.checks++; return h.bridge.status.runtime; };
  const content = { innerHTML: '', querySelector: () => null };
  h.elements.set('entryDialog', { open: true }); h.elements.set('connectionSetupContent', content);
  await h.ui.handleAction({ dataset: { action: 'connection-check' } });
  assert.equal(h.bridge.checks, 1); assert.match(content.innerHTML, /이번에는 로그인 확인을 새로 하지 않았/);
  assert.match(content.innerHTML, /마지막 확인/); assert.equal(h.ui.canAskAI(), true);
});
