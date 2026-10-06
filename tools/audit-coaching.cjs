'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const I = require('../src/insights.js');

const root = path.resolve(__dirname, '..'), artifactRoot = path.join(root, 'tests', 'artifacts', 'private-coaching');
const { values } = parseArgs({ options: { state: { type: 'string', default: path.join(root, 'user-data', 'coach', 'app-state.json') }, out: { type: 'string', default: artifactRoot } } });
const input = path.resolve(values.state), output = path.resolve(values.out);
assert.ok(output === artifactRoot || output.startsWith(artifactRoot + path.sep), 'Audit output must stay inside ignored tests/artifacts/private-coaching.');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceBytes = fs.readFileSync(input), sourceHash = digest(sourceBytes);
const state = S.validateState(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes).replace(/^\uFEFF/, '')));
const storedValue = JSON.stringify(state), storedHash = digest(storedValue), today = I.dateKey();
const families = ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER'];
const records = state.training?.records || [];
const latest = families.map(mode => ({ mode, record: records.filter(record => record.date <= today && new RegExp(`\\b${mode}\\b`, 'i').test(record.label))
  .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id)).at(-1) }));
assert.ok(latest.every(row => row.record), 'Each PUSH/PULL/LEGS/UPPER/LOWER family needs an actual dated record.');
const engineHash = () => {
  const hash = crypto.createHash('sha256');
  for (const name of ['index.html', ...fs.readdirSync(path.join(root, 'src')).filter(name => /\.(?:js|css)$/.test(name)).sort().map(name => `src/${name}`)]) {
    hash.update(name); hash.update(fs.readFileSync(path.join(root, name)));
  }
  return hash.digest('hex');
};
const beforeEngineHash = engineHash(), runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
const runDirectory = path.join(output, runId); fs.mkdirSync(runDirectory, { recursive: true });
const report = { generatedAt: new Date().toISOString(), source: { path: input, bytes: sourceBytes.length, sha256: sourceHash },
  engineHash: beforeEngineHash, recordingDay: today, sessions: [], errors: [], verification: null };

async function navigate(page, view) {
  await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function browserBytes(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function layout(page) {
  return page.locator('#coachWorkoutReview').evaluate(review => {
    const r = review.getBoundingClientRect();
    const clipped = [...review.querySelectorAll('button,h2,h3,h4,p,strong,dd,.coach-review-row')].filter(element => element.getClientRects().length)
      .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, text: element.textContent.trim() }));
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, left: r.left, right: r.right, clipped };
  });
}
function assertLayout(value) {
  assert.ok(value.documentWidth <= value.viewport + 1 && value.left >= -1 && value.right <= value.viewport + 1, 'Workout review extends beyond the viewport.');
  assert.deepEqual(value.clipped, [], 'Workout review text or controls are clipped.');
}
async function auditSession(browser, mode, record, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(), errors = [], requests = [], result = { mode, viewport: width, sessionId: record.id, date: record.date, time: record.time,
    label: record.label, blocks: [], browserSnapshotUnchanged: false, errors, requests };
  report.sessions.push(result);
  try {
    // Isolated browser storage and file execution cannot access or write the PC bridge.
    await context.route(/^https?:\/\//, async route => { await route.abort('blockedbyclient'); });
    await context.addInitScript(({ key, value }) => { localStorage.setItem(key, value); }, { key: S.STORAGE_KEY, value: storedValue });
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#dayDate').fill(record.date); await page.locator('#dayDate').dispatchEvent('change');
    await navigate(page, 'coach'); await page.locator('#coachWorkoutReview').waitFor({ state: 'visible' });
    await page.locator('#coachReviewSession').selectOption(record.id);
    assert.equal(await page.locator('#coachReviewSession').inputValue(), record.id, 'Historical audit must use the exact selected session.');
    assert.equal(await browserBytes(page), storedValue, 'Selecting the historical review changed the browser snapshot.');
    const rows = await page.locator('.coach-review-list .coach-review-row').evaluateAll(rows => rows.map(row => row.dataset.blockId));
    assert.deepEqual([...rows].sort(), record.exercises.map(row => row.id).sort(), 'Every actual block, including repeated exercises, must remain individually reviewable.');
    result.listLayout = await layout(page); assertLayout(result.listLayout);
    result.sessionSummary = await page.locator('.coach-review-session-meaning').innerText();
    for (const [index, blockId] of rows.entries()) {
      const select = page.locator('.coach-review-list [data-action="coach-review-select"]').nth(index);
      await select.focus(); await page.keyboard.press('Enter'); await page.locator('#coachReviewDetail').waitFor({ state: 'visible' });
      assert.equal(await select.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#coachReviewDetail').evaluate(element => document.activeElement === element), true, 'Keyboard selection must focus the named movement detail.');
      const detail = page.locator('#coachReviewDetail'), comparison = detail.locator('.coach-review-comparison');
      if (await comparison.count()) await comparison.locator('summary').click();
      const alternative = detail.locator('.coach-review-alternative');
      if (await alternative.count()) await alternative.locator('summary').click();
      const interpretation = await page.evaluate(({ key, date, sessionId, blockId }) => {
        const state = JSON.parse(localStorage.getItem(key));
        const analysis = window.MacroTraining.analyze(state.training.records, { date, profile: state.profile, checkins: state.days,
          mappings: state.training.mappings, includeCapacityHistory: true });
        const review = window.MacroTraining.coachSession(analysis, { sessionId, preferences: state.training.reviewPreferences,
          priorityMuscles: state.training.settings.priorityMuscles, profile: state.profile, planning: state.training.planning });
        const row = review.rows.find(row => row.blockId === blockId);
        return { rawName: row.rawName, label: row.label, diaryPosition: row.diaryPosition, interpretation: row.interpretation };
      }, { key: S.STORAGE_KEY, date: record.date, sessionId: record.id, blockId });
      const block = { blockId, ...interpretation, renderedMeaning: await detail.locator('.coach-review-meaning').innerText(),
        renderedNext: await detail.locator('.coach-review-next-trial').innerText(),
        renderedAlternative: await alternative.count() ? await alternative.innerText() : null,
        renderedEvidence: await comparison.innerText(), layout: await layout(page) };
      result.blocks.push(block); assertLayout(block.layout);
      assert.equal(await browserBytes(page), storedValue, 'A movement interpretation changed actual records or completed snapshots.');
      const screenshot = path.join(runDirectory, `${mode.toLowerCase()}-${width}-block-${String(block.diaryPosition).padStart(2, '0')}.png`);
      await detail.evaluate(element => element.scrollIntoView({ block: 'start' }));
      const skipLink = await page.locator('.skip-link').evaluate(element => ({ focused: document.activeElement === element, bottom: element.getBoundingClientRect().bottom }));
      assert.equal(skipLink.focused, false); assert.ok(skipLink.bottom <= 0, 'A non-focused skip link overlaps the coaching viewport.');
      await page.screenshot({ path: screenshot }); block.screenshot = screenshot;
      const evidenceScreenshot = path.join(runDirectory, `${mode.toLowerCase()}-${width}-block-${String(block.diaryPosition).padStart(2, '0')}-evidence.png`);
      await comparison.evaluate(element => element.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: evidenceScreenshot }); block.evidenceScreenshot = evidenceScreenshot;
    }
    result.browserSnapshotUnchanged = digest(await browserBytes(page)) === storedHash;
    assert.equal(result.browserSnapshotUnchanged, true); assert.deepEqual(errors, [], 'Actual coaching produced a browser error.');
    assert.deepEqual(requests, [], 'Read-only coaching attempted an AI or PC bridge network request.');
  } catch (error) {
    result.failure = error.message; report.errors.push({ mode, viewport: width, message: error.message });
    await page.screenshot({ path: path.join(runDirectory, `${mode.toLowerCase()}-${width}-failure.png`), fullPage: true }).catch(() => {});
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  try { for (const { mode, record } of latest) for (const width of [390, 1280]) await auditSession(browser, mode, record, width); }
  finally { await browser.close(); }
  const afterHash = digest(fs.readFileSync(input)), afterEngineHash = engineHash();
  report.verification = { sourceUnchanged: afterHash === sourceHash, afterSourceSha256: afterHash,
    engineUnchanged: beforeEngineHash === afterEngineHash, afterEngineHash,
    browserSnapshotsUnchanged: report.sessions.every(row => row.browserSnapshotUnchanged),
    blockedNetworkRequests: report.sessions.reduce((total, row) => total + row.requests.length, 0),
    reviewedBlocks: report.sessions.reduce((total, row) => total + row.blocks.length, 0) };
  const outputFile = path.join(runDirectory, 'report.json'); fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ report: outputFile, sourceSha256: sourceHash, verification: report.verification,
    sessions: report.sessions.map(row => ({ mode: row.mode, date: row.date, viewport: row.viewport, blocks: row.blocks.length, failure: row.failure || null })) }, null, 2));
  assert.equal(report.verification.sourceUnchanged, true, 'The PC app-state changed during the read-only audit.');
  assert.equal(report.verification.engineUnchanged, true, 'The engine changed during the audit; rerun against a stable revision.');
  assert.deepEqual(report.errors, [], 'Actual-session browser audit found errors.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
