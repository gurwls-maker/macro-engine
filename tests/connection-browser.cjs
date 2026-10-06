'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const { createServer } = require('../tools/serve.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), Storage.STORAGE_KEY);
async function overflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); }
async function closeDialog(page) { await page.locator('#entryDialog [data-action="dialog-close"]').first().click(); }
function runtimeStub() {
  return { mode: 'missing-binary', checks: 0, requests: 0,
    status() { return { available: this.mode !== 'missing-binary', readiness: this.mode,
      auth: { status: this.mode === 'ready' ? 'authenticated' : this.mode === 'login-required' ? 'signed-out' : 'unknown', method: 'chatgpt' }, checkedAt: null, running: null, busy: false }; },
    async checkRuntime() { this.checks += 1; return { ...this.status(), checkedAt: new Date().toISOString() }; },
    list: () => [], start() { this.requests += 1; throw new Error('AI must not run during setup'); }, close() {} };
}
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-connection-browser-'));
  const data = path.join(root, 'private'), source = path.join(root, '원본 일지');
  fs.mkdirSync(source); const image = path.join(source, 'synthetic.png'); fs.writeFileSync(image, PNG);
  const runtime = runtimeStub(), server = createServer({ bridge: { data, runtime } });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
      await page.locator('.daily-quick-records [data-action="training-add"]').click();
      await page.locator('[name="exercise-0"]').fill('덤벨 로우');
      await page.locator('[name="0-0-loadKg"]').fill('20'); await page.locator('[name="0-0-reps"]').fill('10');
      await submit(page); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
      assert.equal((await state(page)).profile, null); assert.equal((await state(page)).training.records.length, 1);
      await page.locator('[data-view="coach"]').click();
      assert.equal(await page.locator('#coachChatInput').count(), 0);
      const positions = await page.evaluate(() => ({ summary: document.querySelector('.coach-brief').getBoundingClientRect().top,
        offline: document.querySelector('.conversation-offline').getBoundingClientRect().top }));
      assert.ok(positions.summary < positions.offline && positions.summary < 600, 'record summary is immediately available without AI');
      const before = await state(page);
      await page.locator('#headerActions [data-action="connection-setup"]').focus(); await page.keyboard.press('Enter');
      assert.match(await page.locator('.connection-setup-panel').innerText(), /파일로 열려|Macro Engine.cmd/);
      assert.equal(await page.locator('[data-action="connection-refresh"]').isDisabled(), true);
      await overflow(page); await page.screenshot({ path: path.join(artifacts, `connection-file-${width}.png`), fullPage: true });
      await closeDialog(page);
      assert.equal(await page.locator('#headerActions [data-action="connection-setup"]').evaluate(element => element === document.activeElement), true);
      assert.deepEqual(await state(page), before);
      await page.locator('[data-view="today"]').click(); await page.locator('.daily-quick-records [data-action="training-image"]').click();
      await page.locator('.connection-setup-panel').waitFor(); assert.match(await page.locator('#dialogTitle').innerText(), /연결/);
      await closeDialog(page); assert.deepEqual(await state(page), before);
      assert.deepEqual(errors, []); await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('[data-view="coach"]').click(); await page.locator('#headerActions [data-action="connection-setup"]').click();
    for (const [mode, label] of [['missing-binary', /Codex 설치가 필요/], ['login-required', /로그인이 필요/], ['check-failed', /확인하지 못/], ['ready', /설치·로그인 확인됨/]]) {
      runtime.mode = mode; const response = page.waitForResponse(item => item.url().endsWith('/api/runtime/check'));
      await page.locator('[data-action="connection-check"]').click(); assert.equal((await response).status(), 200);
      await page.waitForFunction(() => !document.querySelector('[data-action="connection-check"]').disabled);
      assert.match(await page.locator('.connection-setup-status').innerText(), label);
      assert.equal(runtime.requests, 0);
    }
    assert.equal(runtime.checks, 4);
    await closeDialog(page); await page.locator('#coachChatInput').fill('작성하던 합성 질문');
    await page.locator('#headerActions [data-action="connection-setup"]').click(); await page.locator('#codexUseEnabled').uncheck();
    await closeDialog(page); assert.equal(await page.locator('#coachChatInput').count(), 0);
    assert.match(await page.locator('.conversation-offline').innerText(), /사용을 꺼두었/);
    await page.locator('#headerActions [data-action="connection-setup"]').click(); await page.locator('#codexUseEnabled').check();
    await closeDialog(page); assert.equal(await page.locator('#coachChatInput').inputValue(), '작성하던 합성 질문');
    await page.locator('#view-coach [data-action="diary-folder"]').click();
    await page.locator('#diarySourceRoot').fill(source); await submit(page); await page.locator('[data-action="diary-folder-apply"]').waitFor();
    assert.equal(fs.existsSync(path.join(data, 'config.json')), false, 'preview must not configure or scan');
    await page.locator('[data-action="diary-folder-apply"]').click();
    await page.waitForFunction(() => document.querySelector('#diaryFolderPreview').textContent.includes('저장했어요'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8')).sourceRoot, fs.realpathSync(source));
    const beforeScan = await state(page); await page.locator('[data-action="diary-scan"]').click();
    await page.waitForFunction(() => document.querySelector('#diaryFolderStatus').textContent.includes('판독 대기 1개'));
    assert.deepEqual(fs.readFileSync(image), PNG); assert.deepEqual(await state(page), beforeScan);
    assert.equal(runtime.requests, 0); await overflow(page);
    await page.screenshot({ path: path.join(artifacts, 'connection-folder-390.png'), fullPage: true });
    await page.locator('#entryDialog [data-action="image-inbox-open"]').click();
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    assert.match(await page.locator('.image-inbox').innerText(), /새.*폴더|미판독|외부/);
    await page.locator('#headerActions [data-action="connection-setup"]').click(); await page.locator('#codexUseEnabled').uncheck();
    await closeDialog(page); await page.reload(); await page.locator('[data-view="coach"]').click();
    assert.equal(await page.locator('#coachChatInput').count(), 0); assert.equal(runtime.requests, 0);
    assert.deepEqual(errors, []); await context.close();
    console.log('Connection setup: file/HTTP states, keyboard, no-profile records, explicit checks, optional AI, draft preservation, folder preview/scan and 320/390/1280 screens passed');
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('macro-connection-browser-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
