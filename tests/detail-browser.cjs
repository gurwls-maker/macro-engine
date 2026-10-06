const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const N = require('../src/nutrition.js');
const I = require('../src/insights.js');
const TS = require('../src/training-store.js');
const today = I.dateKey();
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
const emptyDay = date => ({ date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null });
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), S.STORAGE_KEY); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); }
async function activity(page, sleep, work, lifestyle) {
  await page.locator('#entryForm [name="sleepHours"]').fill(String(sleep));
  await page.locator('#entryForm [name="workHours"]').fill(String(work));
  await page.locator('#entryForm [name="workType"]').selectOption('seated');
  await page.locator('#entryForm [name="lifestyleHours"]').fill(String(lifestyle));
  await page.locator('#entryForm [name="lifestyleType"]').selectOption('light');
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [1280, 360]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const state = S.createEmpty(); state.profile = profile; state.training = TS.createEmpty();
      state.sessionPresets = [{ id: 'unknown-grade', title: '경사 미확인', session: { sport: 'walking', durationMin: 30, intensity: 'moderate', cardio: { environment: 'treadmill', speedKmh: 5, gradePct: null } } }];
      state.days[today] = { ...emptyDay(today), weightKg: 64.5, bodyFatPct: 25, skeletalMuscleKg: 23, bodyFatMethod: 'bia' };
      for (let offset = 1; offset <= 4; offset += 1) {
        const date = I.shiftDate(today, -offset), row = emptyDay(date);
        row.meals = [{ id: `meal-${offset}`, name: '확인한 식사', protein: 120, carbs: 300, fat: 40, otherKcal: 0, alcoholG: 0 }];
        row.planSnapshot = N.calculatePlan(profile, row, []); row.planSnapshot.context.goal = profile.goal; row.complete = true; state.days[date] = row;
      }
      await context.addInitScript(({ key, state }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, { key: S.STORAGE_KEY, state });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message)); await page.goto(url);
      await page.locator('[data-view="profile"]').click();
      await page.locator('#profileForm [name="weightKg"]').fill('66');
      await page.locator('#profileForm [name="activityMode"]').selectOption('detailed');
      await page.locator('[data-action="profile-activity"]').click(); await activity(page, 8, 8, 2);
      await page.locator('#entryForm [name="sleepHours"]').fill('25'); await page.locator('#activityScope').selectOption('1');
      assert.equal(await page.locator('#activityScope').inputValue(), 'default', 'failed switch must keep visible and internal scope aligned');
      assert.match(await page.locator('#entryErrors').textContent(), /24시간/); await page.locator('#entryForm [name="sleepHours"]').fill('8');
      await page.locator('#activityScope').selectOption(String(new Date(today + 'T00:00:00Z').getUTCDay())); await activity(page, 7, 7, 2); await submit(page);
      await page.locator('#profileForm [name="proteinPreference"]').selectOption('lower');
      await page.locator('#profileForm [name="goalPreference"]').selectOption('conservative');
      await page.locator('#profileForm button[type="submit"]').click(); await page.locator('#view-today').waitFor({ state: 'visible' });
      let data = await stored(page); assert.equal(data.profile.dailyActivity.sleepHours, 8); assert.equal(data.days[today].weightKg, 64.5); assert.equal(data.days[today].bodyFatPct, 25); assert.equal(data.days[today].skeletalMuscleKg, 23);
      assert.equal(data.profile.goalPreference, 'conservative');
      const frozenBefore = data.days[I.shiftDate(today, -1)];
      await page.locator('#dayDate').fill(I.shiftDate(today, -1)); await page.locator('#dayDate').dispatchEvent('change');
      assert.equal(await page.locator('.daily-activity-summary').count(), 0, 'old simple snapshot cannot display current detailed profile');
      assert.deepEqual((await stored(page)).days[I.shiftDate(today, -1)], frozenBefore);
      await page.locator('#dayDate').fill(today); await page.locator('#dayDate').dispatchEvent('change');
      await page.locator('[data-action="day-activity"]').click(); await activity(page, 9, 5, 2); await submit(page);
      await page.locator('.movement-section [data-action="session-add"]').click();
      await page.locator('#entryForm [name="sport"]').selectOption('walking');
      await page.locator('#cardioOptions summary').click(); await page.locator('#entryForm [name="useCardio"]').check();
      await page.locator('#entryForm [name="speedKmh"]').fill('7'); await page.locator('#entryForm [name="gradePct"]').fill('0'); await page.locator('#entryForm button[type="submit"]').click();
      assert.equal(await page.locator('#entryDialog').isVisible(), true); assert.match(await page.locator('#entryErrors').textContent(), /지원 범위/);
      await page.locator('#entryForm [name="speedKmh"]').fill('5'); await page.locator('#entryForm [name="gradePct"]').fill('3'); await submit(page);
      data = await stored(page); assert.equal(data.days[today].sessions[0].cardio.speedKmh, 5);
      await page.locator('[data-action="session-preset-save"]').click(); await page.locator('#entryForm [name="title"]').fill('아침 경사 걷기'); await submit(page);
      await page.locator('[data-action="session-presets"]').click(); await page.locator('#entryForm .item-row').filter({ hasText: '아침 경사 걷기' }).locator('[data-action="session-preset-use"]').click();
      assert.equal(await page.locator('#entryForm [name="speedKmh"]').inputValue(), '5'); await submit(page);
      data = await stored(page); assert.equal(data.days[today].sessions.length, 2); assert.notEqual(data.days[today].sessions[0].id, data.days[today].sessions[1].id);
      await page.locator('[data-action="session-presets"]').click(); await page.locator('[data-action="session-preset-use"][data-id="unknown-grade"]').click();
      assert.equal(await page.locator('#entryForm [name="gradePct"]').inputValue(), '', 'unknown grade must not become level terrain');
      await page.locator('#entryForm button[type="submit"]').click(); assert.equal(await page.locator('#entryDialog').isVisible(), true); await page.keyboard.press('Escape');
      assert.equal((await stored(page)).sessionPresets[0].session.cardio.gradePct, null);
      await page.locator('.target-details > summary').click(); await page.locator('[data-action="allocation-suggest"]').click();
      assert.match(await page.locator('#entryDialog').textContent(), /총열량/); const before = await stored(page); await submit(page);
      data = await stored(page); const p1 = N.calculatePlan(N.profileForDay(data.profile, data.days[today]), data.days[today], []), p2 = N.adjustAllocation(p1, data.days[today].carbAdjustmentG);
      assert.equal(p1.energy.targetKcal, p2.energy.targetKcal); assert.equal(p1.macros.protein.target, p2.macros.protein.target); assert.notEqual(data.days[today].carbAdjustmentG, before.days[today].carbAdjustmentG);
      await page.locator('[data-view="coach"]').click();
      assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0);
      assert.equal(await page.locator('#coachChatInput').count(), 0, 'offline mode offers records without an unusable AI compose box');
      assert.match(await page.locator('.coach-record-summary').textContent(), /기록 요약/);
      await page.locator('[data-action="coach-memory"]').click();
      await page.locator('#entryForm [name="focus"]').fill('무리한 증량보다 같은 조건의 수행 확인'); await page.locator('#entryForm [name="constraints"]').fill('브랜드가 다른 머신의 중량은 비교하지 않기'); await submit(page);
      await page.locator('[data-action="coach-followup-add"]').click(); await page.locator('#entryForm [name="note"]').fill('수면과 같은 장비의 반복 기록 함께 확인'); await submit(page);
      await page.locator('[data-action="coach-followup-edit"]').click(); await page.locator('#entryForm [name="note"]').fill('수면과 반복 기록 다시 확인'); await submit(page);
      await page.locator('[data-action="coach-followup-done"]').click(); data = await stored(page); assert.equal(data.training.followUps[0].status, 'done'); assert.match(data.training.memory.focus, /수행/);
      await page.reload(); await page.locator('[data-view="coach"]').click(); assert.match(await page.locator('.coach-continuity').textContent(), /무리한 증량/);
      await page.locator('[data-action="coach-memory"]').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#entryDialog').isVisible(), true); await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-action="coach-memory"]').evaluate(element => element === document.activeElement), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow ${width}`);
      await page.screenshot({ path: path.join(artifacts, `details-coach-${width}.png`), fullPage: true }); assert.deepEqual(errors, []);
      await page.locator('[data-view="today"]').click();
      await page.locator('.meal-section [data-action="meal-add"]').click(); await page.locator('#entryForm [name="name"]').fill('완료 확인용 식사'); await page.locator('#entryForm [name="protein"]').fill('20'); await page.locator('#entryForm [name="carbs"]').fill('0'); await page.locator('#entryForm [name="fat"]').fill('0'); await submit(page);
      await page.locator('.meal-section [data-action="complete"]').click(); await submit(page);
      const frozen = (await stored(page)).days[today];
      await page.locator('[data-view="profile"]').click(); await page.locator('[data-action="profile-activity"]').click(); await activity(page, 6, 10, 3); await submit(page);
      await page.locator('#profileForm button[type="submit"]').click(); await page.locator('#view-today').waitFor({ state: 'visible' });
      assert.match(await page.locator('.daily-activity-summary').textContent(), /수면 9\.0h/);
      assert.deepEqual((await stored(page)).days[today], frozen, 'detailed snapshot and visible ownership must remain frozen after profile edits');
      await context.close();
    }
    console.log('Detail browser: desktop/mobile time ownership, cardio bounds, presets, profile measurement preservation, allocation preview, memory/follow-up and keyboard passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
