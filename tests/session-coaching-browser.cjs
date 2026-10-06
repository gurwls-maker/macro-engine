'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const I = require('../src/insights.js');
const N = require('../src/nutrition.js');
const today = I.dateKey(), yesterday = I.shiftDate(today, -1);
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const emptyDay = date => ({ date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null,
  bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null });
function exercise(id, device, load) {
  return { id, rawName: '머신 체스트 프레스', exerciseId: 'machine_chest_press', equipmentKey: device,
    loadConvention: 'total', loadRole: 'external', groupKey: null, durationMinutes: null, repsTotal: null,
    reportedVolumeKg: null, notes: '', sets: [{ id: `${id}-set`, loadKg: load, reps: 10, marker: null, rir: 2 }] };
}
function fixture() {
  const value = S.createEmpty(); value.trackingScope = 'training'; value.training = TS.createEmpty();
  value.training.records = [{ id: 'rotation', date: yesterday, time: null, label: 'A B A 실제 블록',
    sequence: { order: 'listed', structure: 'straight' }, durationMinutes: null,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: null, pain: 'none',
    exercises: [exercise('first-A', '첫 헬스장 / 머신 A', 40), exercise('middle-B', '둘째 헬스장 / 머신 B', 35), exercise('last-A', '첫 헬스장 / 머신 A', 20)] }];
  const prescription = { id: 'parallel-day', label: '합성 장비 계획', exercises: [{ id: 'parallel-target', exerciseId: 'machine_chest_press', label: '머신 체스트 프레스', sets: 2, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 40, equipmentKey: '첫 헬스장 / 머신 A', loadConvention: 'total' }] };
  value.training.planning.programs = [{ id: 'parallel-program', name: '합성 계획', createdAt: `${yesterday}T00:00:00.000Z`, source: 'user', days: [prescription] }];
  value.training.planning.activeProgramId = 'parallel-program';
  value.training.planning.schedule = [{ id: 'old-assignment', date: yesterday, programId: 'parallel-program', dayId: 'parallel-day', prescription: structuredClone(prescription), recordId: null, status: 'planned', adjustment: null }];
  value.days[yesterday] = { ...emptyDay(yesterday), meals: [{ id: 'past-food', name: '합성 식사', protein: 20, carbs: 30, fat: 10, alcoholG: 0, otherKcal: 0 }], complete: true,
    planSnapshot: N.calculatePlan({}, emptyDay(yesterday), []) };
  return S.validateState(value);
}
async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), S.STORAGE_KEY); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); }
(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const initial = fixture(), errors = [];
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: S.STORAGE_KEY, value: initial });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        assert.equal(await page.locator('#view-today').isVisible(), true);
        assert.equal(await page.locator('.nutrition-overview').isVisible(), false, 'training-only does not lead with empty diet targets');
        assert.match(await page.locator('.record-coverage').innerText(), /측정 없어도/);
        assert.doesNotMatch(await page.locator('.coach-rail').innerText(), /성별, 나이, 키|섭취 부족|인바디.*필수/);
        await page.locator('#trackingScope').selectOption('both');
        assert.equal((await stored(page)).trackingScope, 'both');
        assert.match(await page.locator('.energy-dial').innerText(), /미기록/);
        assert.match(await page.locator('.record-coverage').innerText(), /먹지 않았다는 뜻은 아님/);
        assert.equal((await stored(page)).profile, null, 'scope selection does not invent a nutrition profile');
        await page.locator('#trackingScope').selectOption('nutrition');
        assert.equal(await page.locator('.daily-quick-records [data-action="training-add"]').count(), 0);
        await page.locator('#trackingScope').selectOption('training');
        assert.equal(await page.locator('.daily-quick-records [data-action="meal-add"]').count(), 0);
        assert.deepEqual((await stored(page)).days[yesterday], initial.days[yesterday]);
        await page.locator('[data-view="coach"]').click();
        assert.match(await page.locator('.coach-context').innerText(), /미기록 · 섭취량 미확인/);
        assert.doesNotMatch(await page.locator('.coach-context').innerText(), /식사\s*0개 · 0kcal/);
        await page.locator('[data-view="training"]').click();
        assert.equal(await page.locator('.exercise-block').count(), 3, 'A B A remains three blocks');
        assert.match(await page.locator('.exercise-block').nth(2).innerText(), /앞선 일반 2세트/);
        await page.locator('[data-action="training-reference"]').first().focus(); await page.keyboard.press('Enter');
        await page.locator('#entryForm [name="sameContext"]').check();
        await page.locator('#entryForm button[type="submit"]').click();
        assert.match(await page.locator('#startingReferenceResult').innerText(), /40.*kg/);
        assert.doesNotMatch(await page.locator('.starting-reference-range').innerText(), /20/);
        assert.match(await page.locator('#startingReferenceResult').innerText(), /오늘 해야 할 중량.*아닙니다/);
        await page.locator('#entryForm [name="referenceEquipment"]').fill('원정 / 처음 쓰는 머신');
        assert.equal(await page.locator('.starting-reference-range').count(), 0, 'changing target removes the prior device load immediately');
        assert.match(await page.locator('#startingReferenceResult').innerText(), /다시 조회/);
        await page.locator('#entryForm button[type="submit"]').click();
        assert.equal(await page.locator('.starting-reference-range').count(), 0, 'new machine without calibration has no fabricated load');
        assert.match(await page.locator('#startingReferenceResult').innerText(), /첫 실제 세션/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(artifacts, `session-reference-${width}.png`), fullPage: true });
        await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
        await page.locator('[data-action="training-edit"]').click();
        await page.locator('[data-action="editor-move-up"][data-index="2"]').click();
        assert.equal(await page.locator('#entryForm [name="1-0-loadKg"]').inputValue(), '20', 'moving a block preserves its actual sets');
        await page.locator('#entryForm [name="sessionStructure"]').selectOption('grouped');
        await page.locator('#entryForm .editor-exercise').nth(1).locator('details').click();
        await page.locator('#entryForm [name="group-1"]').fill('교차 A');
        await submit(page);
        const saved = await stored(page);
        assert.deepEqual(saved.training.records[0].exercises.map(row => row.id), ['first-A', 'last-A', 'middle-B']);
        assert.equal(saved.training.records[0].sequence.structure, 'grouped');
        assert.equal(saved.training.records[0].exercises[1].groupKey, '교차 A');
        assert.deepEqual(saved.days[yesterday], initial.days[yesterday], 'context correction does not rewrite completed nutrition');
        await page.locator('[data-action="training-reuse"]').click();
        assert.equal(await page.locator('#entryForm [name="orderConfirmed"]').isChecked(), false, 'reuse never confirms a new session order');
        assert.equal(await page.locator('#entryForm [name="sessionStructure"]').inputValue(), 'unknown');
        await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
        await page.locator('[data-action="training-tab"][data-tab="program"]').click();
        await page.locator('[data-action="program-edit-day"]').click();
        await page.locator('#entryForm [name="0-equipmentKey"]').fill('원정 / 다른 머신');
        await submit(page);
        let changedPlan = await stored(page);
        assert.equal(changedPlan.training.planning.programs[0].days[0].exercises[0].loadKg, null, 'new physical device does not inherit the prior load');
        assert.deepEqual(changedPlan.training.planning.schedule, initial.training.planning.schedule, 'program changes preserve assigned prescription snapshots');
        await page.locator('[data-action="training-tab"][data-tab="log"]').click();
        await page.reload(); await page.locator('[data-view="today"]').click();
        assert.equal(await page.locator('#trackingScope').inputValue(), 'training');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow ${width}`);
        await page.screenshot({ path: path.join(artifacts, `session-today-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    const fresh = await browser.newContext({ viewport: { width: 390, height: 850 } });
    try {
      const page = await fresh.newPage(); await page.goto(url);
      await page.locator('#trackingScope').selectOption('training');
      await page.locator('.daily-quick-records [data-action="training-add"]').click();
      await page.locator('#entryForm [name="exercise-0"]').fill('덤벨 로우');
      await page.locator('#entryForm [name="0-0-loadKg"]').fill('20');
      await page.locator('#entryForm [name="0-0-reps"]').fill('10');
      await submit(page);
      const saved = await stored(page);
      assert.equal(saved.profile, null); assert.equal(saved.training.records.length, 1);
      assert.equal(saved.training.records[0].exercises[0].sets[0].rir, null);
      assert.equal(saved.training.records[0].sequence.order, 'unknown');
      await page.locator('#trackingScope').selectOption('both');
      await page.locator('.daily-quick-records [data-action="meal-add"]').click();
      for (const nutrient of ['protein', 'carbs', 'fat']) assert.equal(await page.locator(`#entryForm [name="${nutrient}"]`).inputValue(), '');
      await page.locator('#entryForm [name="name"]').fill('합성 식사');
      await page.locator('#entryForm [name="protein"]').fill('20');
      assert.match(await page.locator('#mealPreview').innerText(), /아직 계산하지/);
      await page.locator('#entryForm button[type="submit"]').click();
      assert.equal(await page.locator('#entryDialog').isVisible(), true, 'missing macros cannot be silently saved as zero');
      assert.equal((await stored(page)).days[today]?.meals.length || 0, 0);
      await page.locator('#entryForm [name="carbs"]').fill('0');
      await page.locator('#entryForm [name="fat"]').fill('0');
      await submit(page);
      assert.equal((await stored(page)).days[today].meals[0].carbs, 0, 'explicit absent nutrients remain known zero');
      assert.equal((await stored(page)).profile, null, 'manual nutrition records need no calculation profile');
      await page.locator('#trackingScope').selectOption('training');
      await page.evaluate(() => { Storage.prototype.setItem = function() { throw new Error('synthetic save failure'); }; });
      await page.locator('#trackingScope').selectOption('both');
      assert.equal(await page.locator('#trackingScope').inputValue(), 'training');
      assert.equal((await stored(page)).trackingScope, 'training', 'failed preference save cannot apply only in memory');
    } finally { await fresh.close(); }
    console.log('Session coaching: scopes, unknown InBody, preserved snapshots, A B A, starting references, order edit/reuse, offline recording and save failure at 320/390/1280 passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
