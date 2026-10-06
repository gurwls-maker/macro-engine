const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const Nutrition = require('../src/nutrition.js');
const Insights = require('../src/insights.js');
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const baseProfile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
const today = Insights.dateKey();
async function fillProfile(page, profile = baseProfile) {
  await page.locator('[data-view="profile"]').click();
  for (let step = 0; step < 3; step += 1) {
    for (const [key, value] of Object.entries(profile)) {
      const input = page.locator(`#profileForm [name="${key}"]`);
      if (!await input.count() || !await input.isVisible()) continue;
      if (['sex', 'sport', 'goal', 'activity', 'healthContext', 'proteinPreference', 'bodyFatMethod'].includes(key)) await input.selectOption(value);
      else await input.fill(value == null ? '' : String(value));
    }
    if (!await page.locator('[data-action="profile-next"]').isVisible()) break;
    await page.locator('[data-action="profile-next"]').click();
  }
  await page.locator('#profileForm button[type="submit"]').click();
  await page.locator('#view-today').waitFor({ state: 'visible' });
}
async function appState(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), Storage.STORAGE_KEY); }
async function addMeal(page, name = '점심 <script>기록</script>', values = { protein: 35, carbs: 80, fat: 20 }) {
  await page.locator('#view-today .meal-section [data-action="meal-add"]').click();
  await page.locator('#entryForm [name="name"]').fill(name);
  for (const [key, value] of Object.entries(values)) await page.locator(`#entryForm [name="${key}"]`).fill(String(value));
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
async function confirm(page, action) {
  await page.locator(`#view-today .meal-section [data-action="${action}"]`).click();
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
async function noHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({ viewport: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(result.actual <= result.viewport + 1, `${label}: ${JSON.stringify(result)}`);
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  let page;
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url);
    assert.equal(await page.locator('#view-profile').isVisible(), true);
    assert.equal(await appState(page), null, 'fresh page must not save an invented profile');
    await page.screenshot({ path: path.join(artifacts, 'desktop-profile.png'), fullPage: true });
    await page.locator('#profileForm [name="age"]').fill('34');
    await page.locator('[data-view="coach"]').click();
    assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0, 'offline file mode cannot present a local free-chat alternative');
    assert.equal(await page.locator('#coachChatInput').isDisabled(), true);
    assert.equal(await page.locator('#coachChatForm button[type="submit"]').isDisabled(), true);
    await page.locator('[data-view="profile"]').click();
    assert.equal(await page.locator('#profileForm [name="age"]').inputValue(), '34', 'onboarding draft must survive tab navigation');
    assert.equal(await appState(page), null, 'an unfinished profile must not be persisted');
    await fillProfile(page);
    await page.locator('[data-view="profile"]').click();
    await page.locator('#profileForm [name="weightKg"]').fill('66.7');
    await page.locator('[data-view="today"]').click();
    await page.locator('[data-view="profile"]').click();
    assert.equal(await page.locator('#profileForm [name="weightKg"]').inputValue(), '66.7', 'saved-profile edit draft must survive tab navigation');
    assert.equal((await appState(page)).profile.weightKg, baseProfile.weightKg, 'draft edits must not change the saved profile');
    await fillProfile(page);
    const initialTarget = await page.evaluate(() => MacroNutrition.calculatePlan(JSON.parse(localStorage.getItem(MacroStorage.STORAGE_KEY)).profile, { date: MacroInsights.dateKey(), sessions: [] }).energy.targetKcal);
    await page.locator('#view-today .movement-section [data-action="session-add"]').click();
    await page.locator('#entryForm [name="sport"]').selectOption('cycling');
    await page.locator('#entryForm [name="durationMin"]').fill('60');
    await page.locator('#entryForm [name="intensity"]').selectOption('moderate');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    await addMeal(page);
    assert.equal(await page.locator('.item-main script').count(), 0, 'food names must be escaped');
    const expectedCheckin = { energy: 'okay', hunger: 'high', sleep: 'poor', trainingPlan: 'planned', mealConstraint: 'busy', performance: 'down' };
    const sessionsBeforeCheckin = (await appState(page)).days[today].sessions;
    await page.locator('[data-view="coach"]').click();
    await page.locator('.coach-checkin [data-action="coach-checkin"]').click();
    for (const key of ['energy', 'hunger', 'sleep']) {
      await page.locator(`#entryForm label:has(input[name="${key}"][value="${expectedCheckin[key]}"])`).click();
    }
    await page.locator('#entryForm .checkin-more > summary').click();
    for (const key of ['trainingPlan', 'mealConstraint', 'performance']) await page.locator(`#entryForm [name="${key}"]`).selectOption(expectedCheckin[key]);
    await page.locator('#entryForm button[type="submit"]').click();
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    assert.deepEqual((await appState(page)).days[today].coachCheckin, expectedCheckin);
    assert.deepEqual((await appState(page)).days[today].sessions, sessionsBeforeCheckin, 'planned training must not become performed exercise');
    await page.reload();
    await page.locator('[data-view="coach"]').click();
    await page.locator('.coach-checkin [data-action="coach-checkin"]').click();
    for (const key of ['energy', 'hunger', 'sleep']) assert.equal(await page.locator(`#entryForm input[name="${key}"][value="${expectedCheckin[key]}"]`).isChecked(), true);
    for (const key of ['trainingPlan', 'mealConstraint', 'performance']) assert.equal(await page.locator(`#entryForm [name="${key}"]`).inputValue(), expectedCheckin[key]);
    await page.keyboard.press('Escape');
    await page.locator('[data-view="today"]').click();
    await page.locator('details.target-details > summary').click();
    await page.locator('#allocation').fill('10');
    await page.locator('#allocation').dispatchEvent('change');
    await confirm(page, 'complete');
    let stored = await appState(page);
    const snapshot = stored.days[today].planSnapshot;
    assert.ok(snapshot.energy.targetKcal > initialTarget);
    assert.ok(Math.abs(snapshot.energy.targetKcal - 4 * snapshot.macros.protein.target - 4 * snapshot.macros.carbs.target - 9 * snapshot.macros.fat.target) < 1e-6);
    assert.equal(stored.days[today].complete, true);
    await page.locator('[data-view="coach"]').click();
    assert.equal(await page.locator('.coach-checkin [data-action="coach-checkin"]').count(), 0, 'completed check-in must not offer editing');
    assert.equal(await page.locator('#view-coach [data-action="coach-checkin"]:visible').count(), 0);
    const reopenActions = page.locator('#view-coach [data-action="reopen"]:visible');
    if (await reopenActions.count()) {
      await reopenActions.first().click();
      assert.equal(await page.locator('#entryDialog').isVisible(), true, 'completed coaching offers explicit reopening rather than a dead-end edit');
      await page.keyboard.press('Escape');
      assert.equal((await appState(page)).days[today].complete, true, 'canceling reopening preserves the completed record');
    }
    assert.deepEqual((await appState(page)).days[today].coachCheckin, expectedCheckin);
    await fillProfile(page, { ...baseProfile, weightKg: 80, goal: 'lose' });
    stored = await appState(page);
    assert.deepEqual(stored.days[today].planSnapshot, snapshot, 'profile edit must preserve completed plan');
    await page.reload();
    assert.deepEqual((await appState(page)).days[today].planSnapshot, snapshot);
    await confirm(page, 'reopen');
    assert.equal((await appState(page)).days[today].planSnapshot, null);
    await page.locator('[data-action="meal-edit"]').click();
    await page.locator('#entryForm [name="protein"]').fill('45');
    await page.locator('#entryForm button[type="submit"]').click();
    assert.equal((await appState(page)).days[today].meals[0].protein, 45);
    await page.locator('[data-action="meal-copy"]').click();
    assert.equal((await appState(page)).days[today].meals.length, 2);
    await page.locator('[data-action="meal-delete"]').first().click();
    await page.keyboard.press('Escape');
    assert.equal((await appState(page)).days[today].meals.length, 2);
    await page.locator('#view-today .body-summary [data-action="measurement"]').click();
    await page.locator('#entryForm [name="weightKg"]').fill('79.5');
    await page.locator('#entryForm [name="bodyFatPct"]').fill('30');
    await page.locator('#entryForm [name="skeletalMuscleKg"]').fill('25');
    await page.locator('#entryForm [name="bodyFatMethod"]').selectOption('bia');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    stored = await appState(page);
    assert.equal(stored.days[today].weightKg, 79.5);
    assert.equal(stored.profile.bodyFatWeightKg, 79.5);
    const nutritionBeforeManualWorkout = stored.days;
    await page.locator('[data-view="training"]').click();
    await page.locator('#trainingContent [data-action="training-add"]').first().click();
    await page.locator('[name="label"]').fill('파일 주소에서 직접 기록한 운동');
    await page.locator('[name="exercise-0"]').fill('바벨 로우');
    await page.locator('[name="0-0-loadKg"]').fill('30');
    await page.locator('[name="0-0-reps"]').fill('10');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    stored = await appState(page);
    assert.equal(stored.training.records.length, 1, 'manual workout input remains usable at a file URL');
    assert.equal(stored.training.records[0].exercises[0].sets[0].loadKg, 30);
    assert.equal(stored.training.records[0].exercises[0].sets[0].rir, null);
    assert.deepEqual(stored.days, nutritionBeforeManualWorkout, 'offline manual workout does not silently recalculate food or expenditure');
    await page.locator('[data-view="today"]').click();
    await confirm(page, 'complete');
    await page.screenshot({ path: path.join(artifacts, 'desktop-today.png'), fullPage: true });
    await page.locator('[data-view="data"]').click();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download = await downloadEvent;
    const downloadFile = path.join(artifacts, download.suggestedFilename());
    await download.saveAs(downloadFile);
    const backup = fs.readFileSync(downloadFile, 'utf8');
    assert.equal(Storage.parseBackup(backup).state.days[today].complete, true);
    const beforeInvalid = await appState(page);
    await page.locator('#backupFile').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await page.locator('#importPreview [role="alert"]').waitFor();
    assert.deepEqual(await appState(page), beforeInvalid, 'invalid import must preserve all existing state');
    await page.locator('#backupFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.locator('#importPreview summary').filter({ hasText: '전체 데이터를 백업으로 교체' }).click();
    await page.locator('[data-action="import-confirm"]').waitFor();
    await page.locator('[data-action="import-cancel"]').first().click();
    assert.deepEqual(await appState(page), beforeInvalid);
    await page.locator('#backupFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.locator('#importPreview summary').filter({ hasText: '전체 데이터를 백업으로 교체' }).click();
    await page.locator('[data-action="import-confirm"]').click();
    assert.deepEqual((await appState(page)).days, beforeInvalid.days);

    // Synthetic history only. Each frozen target was calculated for that day's actual profile.
    const seeded = Storage.createEmpty(); seeded.profile = baseProfile;
    for (let n = 0; n < 18; n++) {
      const date = Insights.shiftDate(today, -n);
      const day = { date, weightKg: 65 + n * 0.035, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [{ id: `test-meal-${n}`, name: '기록한 하루 식사', protein: 105, carbs: 230, fat: 65, otherKcal: 0, alcoholG: 0 }], sessions: [], complete: true, planSnapshot: null };
      day.planSnapshot = Nutrition.calculatePlan(baseProfile, day, []); day.planSnapshot.context.goal = baseProfile.goal;
      seeded.days[date] = day;
    }
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: Storage.STORAGE_KEY, value: JSON.stringify(Storage.validateState(seeded)) });
    await page.reload();
    await page.locator('[data-view="trends"]').click();
    const coloredPixels = await page.locator('#weightChart').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0; for (let n = 0; n < data.length; n += 4) if (data[n + 1] > data[n] * 1.5 && data[n] < 100) count++; return count;
    });
    assert.ok(coloredPixels > 100, 'weight chart must draw nonblank real data');
    await page.screenshot({ path: path.join(artifacts, 'desktop-trends.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ['today', 'coach', 'trends', 'profile', 'data']) {
        await page.locator(`[data-view="${tab}"]`).click();
        await noHorizontalOverflow(page, `${width}/${tab}`);
        await page.screenshot({ path: path.join(artifacts, `mobile-${width}-${tab}.png`), fullPage: true });
      }
    }
    await fillProfile(page, { ...baseProfile, age: 16 });
    await page.locator('[data-action="previous-day"]').click();
    await page.locator('#dayDate').fill(Insights.shiftDate(today, -20));
    await page.locator('#dayDate').dispatchEvent('change');
    assert.match(await page.locator('#todayContent').innerText(), /개별 영양 계획/);
    await addMeal(page, '기록 전용 식사');
    await confirm(page, 'complete');
    const review = (await appState(page)).days[Insights.shiftDate(today, -20)];
    assert.equal(review.planSnapshot.status, 'review');
    assert.equal(review.planSnapshot.energy.targetKcal, null);
    assert.deepEqual(errors, [], 'no browser runtime/console errors');
    console.log('Browser acceptance passed: first-run wizard, profile draft retention, personal plan, exercise, meal CRUD, six-field check-in round trip and completion lock, body composition, allocation, snapshot ownership, downloads, restore, trends and coach at 320/390/1280px, unsupported population, offline file opening.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
