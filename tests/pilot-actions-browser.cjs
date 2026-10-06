'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const T = require('../src/training.js');
const I = require('../src/insights.js');
const { createServer } = require('../tools/serve.cjs');
const today = I.dateKey(), tomorrow = I.shiftDate(today, 1);
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
function fixture() {
  const state = S.createEmpty(); state.profile = profile; state.training = TS.createEmpty();
  for (const id of ['program-a', 'program-b']) {
    const value = T.createProgram(T.recommendProgram(profile, state.training.settings), { id, createdAt: new Date().toISOString() });
    value.name = id === 'program-a' ? '합성 기존 프로그램' : '합성 변경 프로그램'; state.training.planning.programs.push(value);
  }
  state.training.planning.activeProgramId = 'program-a';
  state.training.planning.schedule.push(T.createAssignment(state.training.planning.programs[0], state.training.planning.programs[0].days[0].id, today, 'assignment-a'));
  return S.validateState(state);
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), S.STORAGE_KEY); }
async function coach(page) { await page.locator('[data-view="coach"]').click(); await page.locator('#coachActionLoop').waitFor({ state: 'visible' }); }
async function submit(page, closes = true) {
  await page.locator('#entryForm button[type="submit"]').click();
  if (closes) await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  else await page.locator('#dialogTitle').filter({ hasText: '선택한 변경 확인' }).waitFor();
}
async function createDraft(page, kind, values = {}) {
  await page.locator(`#coachActionLoop [data-action="coach-action-create-${kind}"]`).click();
  for (const [key, value] of Object.entries(values)) {
    const field = page.locator(`#entryForm [name="${key}"]`);
    if (await field.evaluate(element => element.tagName === 'SELECT')) await field.selectOption(String(value)); else await field.fill(String(value));
  }
  await page.locator('#entryForm [name="reason"]').fill('실제로 선택한 합성 방향'); await submit(page, false);
  return (await state(page)).training.actions.at(-1).id;
}
async function apply(page) { await page.locator('#entryForm input[type="checkbox"]').check(); await submit(page); }
async function undo(page, id) {
  await page.locator(`#coachActionLoop [data-action="coach-action-undo"][data-id="${id}"]`).click();
  await page.locator('#entryForm input[type="checkbox"]').check(); await submit(page);
}
async function overflow(page, label) {
  const value = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(value.actual <= value.width + 1, `${label}: ${JSON.stringify(value)}`);
}

(async () => {
  const server = createServer(), artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const errors = []; let browser, page;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    const fresh = await browser.newContext({ viewport: { width: 320, height: 900 } });
    const freshPage = await fresh.newPage(); freshPage.on('pageerror', error => errors.push(error.message));
    await freshPage.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await freshPage.locator('#view-today').isVisible(), true);
    assert.equal(await state(freshPage), null, 'fresh app must not save a fabricated profile or training workspace');
    await coach(freshPage);
    for (const kind of ['program', 'schedule', 'allocation', 'burden']) assert.equal(await freshPage.locator(`#coachActionLoop [data-action="coach-action-create-${kind}"]`).isDisabled(), true);
    assert.equal(await freshPage.locator('#coachChatInput').isDisabled(), true);
    assert.equal(await state(freshPage), null); await overflow(freshPage, 'fresh empty actions');
    await fresh.close();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const initial = fixture();
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: S.STORAGE_KEY, value: initial });
    page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await coach(page);

    await page.locator('#coachActionLoop [data-action="coach-action-create-program"]').focus(); await page.keyboard.press('Enter');
    await page.locator('#entryForm [name="programId"]').selectOption('program-b');
    await page.locator('#entryForm [name="reason"]').fill('새 프로그램을 선택하고 다음 주 점검'); await submit(page, false);
    let saved = await state(page), actionId = saved.training.actions.at(-1).id;
    assert.equal(saved.training.planning.activeProgramId, 'program-a'); assert.deepEqual(saved.training.planning.schedule, initial.training.planning.schedule);
    assert.match(await page.locator('#entryForm').innerText(), /합성 기존 프로그램.*합성 변경 프로그램/s);
    assert.equal(saved.training.followUps.length, 0);
    await apply(page); saved = await state(page);
    assert.equal(saved.training.planning.activeProgramId, 'program-b'); assert.equal(saved.training.actions.at(-1).status, 'applied'); assert.equal(saved.training.followUps.length, 1);
    await undo(page, actionId); saved = await state(page);
    assert.equal(saved.training.planning.activeProgramId, 'program-a'); assert.equal(saved.training.actions.at(-1).status, 'undone'); assert.equal(saved.training.followUps[0].status, 'done');

    actionId = await createDraft(page, 'program', { programId: 'program-b' });
    await page.locator('#entryForm [data-action="coach-action-cancel"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    saved = await state(page); assert.equal(saved.training.actions.at(-1).status, 'cancelled'); assert.equal(saved.training.planning.activeProgramId, 'program-a');

    actionId = await createDraft(page, 'allocation', { deltaG: 10 });
    const preview = (await state(page)).training.actions.at(-1);
    assert.equal(preview.before.kcal, preview.after.kcal); assert.equal(preview.before.proteinG, preview.after.proteinG);
    await page.locator('#entryForm input[type="checkbox"]').check();
    await page.evaluate(key => { window.__pilotSetItem = window.Storage.prototype.setItem; window.Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('synthetic quota', 'QuotaExceededError'); return window.__pilotSetItem.call(this, name, value); }; }, S.STORAGE_KEY);
    await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryErrors').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#entryDialog').evaluate(element => element.open), true);
    saved = await state(page); assert.equal(saved.training.actions.at(-1).status, 'draft'); assert.equal(saved.days[today], undefined);
    await page.evaluate(() => { window.Storage.prototype.setItem = window.__pilotSetItem; delete window.__pilotSetItem; });
    await submit(page); saved = await state(page); assert.equal(saved.days[today].carbAdjustmentG, 10);

    await page.locator(`#coachActionLoop [data-action="coach-action-review"][data-id="${actionId}"]`).click();
    assert.match(await page.locator('#entryForm').innerText(), /미기록은 미실행이나 효과 없음이 아닙니다/);
    assert.equal(await page.locator('#entryForm [name="execution"]').inputValue(), 'unknown');
    assert.equal(await page.locator('#entryForm [name="outcome"]').inputValue(), 'insufficient');
    await page.locator('#entryForm [name="note"]').fill('비교할 식사 기록이 없어 아직 판단하지 않음'); await submit(page);
    saved = await state(page); assert.equal(saved.training.actions.at(-1).reviews[0].outcome, 'insufficient');
    assert.equal(saved.training.actions.at(-1).reviews[0].evidence.dayDates.length, 0); assert.equal(saved.days[today].carbAdjustmentG, 10);

    actionId = await createDraft(page, 'schedule', { date: tomorrow }); await apply(page);
    saved = await state(page); assert.equal(saved.training.planning.schedule[0].date, tomorrow); assert.deepEqual(saved.training.records, []);
    await undo(page, actionId); assert.equal((await state(page)).training.planning.schedule[0].date, today);

    const beforeBurden = structuredClone((await state(page)).training.planning.schedule[0].prescription);
    actionId = await createDraft(page, 'burden', { burdenKind: 'deload', setReduction: 1, rirIncrease: 1 });
    assert.match(await page.locator('#entryForm').innerText(), /세트 · RIR/); await apply(page);
    saved = await state(page); assert.ok(saved.training.planning.schedule[0].prescription.exercises[0].sets < beforeBurden.exercises[0].sets);
    await undo(page, actionId); assert.deepEqual((await state(page)).training.planning.schedule[0].prescription, beforeBurden);

    actionId = await createDraft(page, 'program', { programId: 'program-b' });
    await page.evaluate(key => { const value = JSON.parse(localStorage.getItem(key)); value.profile.goal = 'gain'; localStorage.setItem(key, JSON.stringify(value)); }, S.STORAGE_KEY);
    await page.reload(); await coach(page);
    await page.locator(`#coachActionLoop [data-action="coach-action-preview"][data-id="${actionId}"]`).click();
    await page.locator('#entryForm input[type="checkbox"]').check(); await page.locator('#entryForm button[type="submit"]').click();
    await page.locator('#entryErrors').filter({ hasText: '기준이 달라졌어요' }).waitFor();
    assert.equal((await state(page)).training.planning.activeProgramId, 'program-a');
    await page.locator('#entryForm [data-action="coach-action-rebase"]').click();
    assert.equal(await page.locator('#entryForm [name="programId"]').inputValue(), 'program-b');
    await submit(page, false); saved = await state(page); assert.equal(saved.training.actions.find(row => row.id === actionId).status, 'cancelled');
    await apply(page); assert.equal((await state(page)).training.planning.activeProgramId, 'program-b');

    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('#coachActionLoop').scrollIntoViewIfNeeded(); await overflow(page, `action loop ${width}`);
      await page.screenshot({ path: path.join(artifacts, `pilot-actions-${width}.png`) });
      await page.locator('#coachActionLoop [data-action="coach-action-create-burden"]').click(); await overflow(page, `action dialog ${width}`);
      await page.screenshot({ path: path.join(artifacts, `pilot-action-dialog-${width}.png`) }); await page.keyboard.press('Escape');
      assert.equal(await page.locator('#entryDialog').evaluate(element => element.open), false);
    }
    await page.locator('[data-view="today"]').click(); assert.equal(await page.locator('#view-today .coach-action-compact').count(), 1); await overflow(page, 'today actions');
    assert.deepEqual(errors, []);
    console.log('Pilot action browser passed: user-selected program/date/allocation/burden drafts, explicit preview/apply/cancel, guarded undo, stale-base replacement, quota failure keeps preview and original state, review unknown is not zero effect, next follow-up, keyboard and 320/390/1280px. No AI or private data.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'pilot-actions-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser?.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
