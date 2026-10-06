'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const N = require('../src/nutrition.js');
const I = require('../src/insights.js');
const TS = require('../src/training-store.js');
const A = require('../src/coach-actions.js');
const today = I.dateKey(), yesterday = I.shiftDate(today, -1);
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain',
  activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
const emptyDay = date => ({ date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null,
  bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null });
function fixture() {
  const value = S.createEmpty(); value.profile = profile; value.training = TS.createEmpty();
  const prescription = { id: 'pilot-day', label: '등 중심 훈련', exercises: [{ id: 'pilot-row', exerciseId: 'dumbbell_row',
    label: '덤벨 로우', sets: 2, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: null,
    equipmentKey: null, loadConvention: 'per-side' }] };
  value.training.planning = { ...value.training.planning, activeProgramId: 'pilot-program',
    programs: [{ id: 'pilot-program', name: '내 합성 프로그램', createdAt: `${yesterday}T00:00:00.000Z`, source: 'user', days: [prescription] }],
    schedule: [{ id: 'pilot-assignment', date: today, programId: 'pilot-program', dayId: prescription.id,
      prescription, recordId: null, status: 'planned', adjustment: null }] };
  value.training.followUps = [{ id: 'pilot-followup', topic: 'recovery', note: '수면과 다음 운동 수행 함께 확인',
    reviewDate: today, status: 'open', createdAt: `${yesterday}T00:00:00.000Z` }];
  value.training.followUps.push({ id: 'pilot-long-followup', topic: 'training', note: 'a'.repeat(200),
    reviewDate: today, status: 'open', createdAt: `${yesterday}T00:00:00.000Z` });
  const meal = { id: 'pilot-meal', name: '자주 먹는 합성 식사', protein: 25, carbs: 40, fat: 10, alcoholG: 0, otherKcal: 0 };
  value.mealTemplates = [{ id: 'pilot-template', title: '내 아침', meal }];
  value.days[yesterday] = { ...emptyDay(yesterday), meals: [meal] };
  value.days[yesterday].planSnapshot = N.calculatePlan(profile, value.days[yesterday], []);
  value.days[yesterday].complete = true;
  const withDraft = A.createDraft(value, { kind: 'allocation', targetId: today, choice: { deltaG: 20 } },
    { id: 'pilot-action', reason: '식사 배분과 실제 기록 함께 점검', reviewDate: today, today });
  return A.applyDraft(withDraft, 'pilot-action', { today });
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
        await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
        await page.locator('.daily-quick-records').waitFor();
        assert.match(await page.locator('.today-training-lanes').innerText(), /등 중심 훈련/);
        assert.match(await page.locator('.today-training-lanes').innerText(), /수면과 다음 운동 수행/);
        assert.doesNotMatch(await page.locator('.today-training-lanes').innerText(), /식사 배분과 실제 기록 함께 점검/, 'action appointment is not duplicated as a generic follow-up');
        assert.equal(await page.locator('.coach-action-compact [data-coach-action-id="pilot-action"]').count(), 1);
        assert.match(await page.locator('.daily-condition').innerText(), /미기록/);
        const order = await page.locator('.today-main').evaluate(element => [...element.children].map(child => child.className));
        assert.ok(order.indexOf('today-training-lanes') < order.indexOf('daily-quick-records'), 'today plan precedes quick entry');
        assert.ok(order.indexOf('daily-quick-records') < order.indexOf('nutrition-overview'), 'quick entry precedes nutrition details');
        if (width <= 960) {
          const directionBeforeSummary = await page.evaluate(() => document.querySelector('.today-training-lanes').getBoundingClientRect().top < document.querySelector('.coach-rail').getBoundingClientRect().top);
          assert.ok(directionBeforeSummary, 'small screens keep the actual next action before record summary');
        }
        await page.locator('.daily-quick-records [data-action="meal-templates"]').focus(); await page.keyboard.press('Enter');
        await page.locator('[data-action="meal-template-use"][data-id="pilot-template"]').click();
        assert.equal(await page.locator('#entryForm [name="name"]').inputValue(), '자주 먹는 합성 식사');
        await submit(page);
        assert.equal((await stored(page)).days[today].meals.length, 1);
        await page.locator('.daily-condition [data-action="coach-checkin"]').click();
        await page.locator('#entryForm [name="sleep"][value="poor"]').check(); await submit(page);
        assert.match(await page.locator('.daily-condition').innerText(), /잘 못 잠/);
        assert.equal((await stored(page)).days[today].coachCheckin.energy, null);
        assert.equal((await stored(page)).days[today].coachCheckin.hunger, null);
        assert.deepEqual((await stored(page)).days[yesterday], initial.days[yesterday], 'quick entry preserves completed snapshots');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow ${width}`);
        await page.locator('#toast').evaluate(element => { element.hidden = true; });
        await page.screenshot({ path: path.join(artifacts, `pilot-today-${width}.png`), fullPage: true });
        await page.locator('[data-view="coach"]').click();
        assert.equal(await page.locator('#coachChatInput').isDisabled(), true, 'offline pilot does not invent AI counselling');
        assert.match(await page.locator('.coach-continuity').innerText(), /수면과 다음 운동 수행/);
        assert.doesNotMatch(await page.locator('.coach-continuity').innerText(), /식사 배분과 실제 기록 함께 점검/);
        assert.equal((await stored(page)).training.followUps.length, 3, 'both action-compatible and ordinary follow-up data are preserved');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `coach no overflow ${width}`);
        await page.screenshot({ path: path.join(artifacts, `pilot-coach-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []);
        await page.reload(); await page.locator('[data-view="today"]').click();
        assert.match(await page.locator('.daily-condition').innerText(), /잘 못 잠/);
        assert.equal((await stored(page)).training.planning.schedule[0].recordId, null, 'opening plans is not performance');
      } finally { await context.close(); }
    }
    console.log('Pilot dashboard: today priorities, quick meals, optional condition, completed snapshots, reload and 320/390/1280 screens passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
