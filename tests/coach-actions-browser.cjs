'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const N = require('../src/nutrition.js');
const I = require('../src/insights.js');

const today = I.dateKey(), currentDate = I.shiftDate(today, -2), previousDate = I.shiftDate(today, -7);
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };

function exercise(id, exerciseId, rawName, equipmentKey, loadKg, reps, extra = {}) {
  return { id, exerciseId, rawName, equipmentKey, loadConvention: 'total', loadRole: 'external', notes: '합성 원문 종목 메모',
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
    sets: [{ id: `${id}-warmup`, loadKg: 10, reps: 5, rir: null, marker: 'W' },
      { id: `${id}-work`, loadKg, reps, rir: null, marker: null }], ...extra };
}
function record(id, date, exercises, extra = {}) {
  return { id, date, time: '19:30', label: `합성 ${id}`, durationMinutes: 40,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [`synthetic/${id}.png`], uncertainties: ['합성 출처 유지'], revision: null },
    notes: '합성 일지 메모 유지', effort: null, pain: 'none', sequence: { order: 'listed', structure: 'straight' }, exercises, ...extra };
}
function legs(prefix, scale = 1) {
  return [exercise(`${prefix}-curl`, 'leg_curl', '레그 컬', '합성 헬스장 / 레그컬 1', 40 * scale, 10),
    exercise(`${prefix}-extension`, 'leg_extension', '레그 익스텐션', '합성 헬스장 / 익스텐션 1', 80 * scale, 10)];
}
function fixture(kind) {
  const state = S.createEmpty(); state.profile = null; state.trackingScope = 'training'; state.training = TS.createEmpty();
  state.training.reviewPreferences = { order: 'diary', mainExerciseKeys: [] };
  let latest;
  if (kind === 'drop') {
    latest = record('synthetic-drop', currentDate, legs('drop', 0.5));
    state.training.records = [record('synthetic-before-drop', previousDate, legs('before')), latest];
  } else if (kind === 'return') {
    const baseline = record('synthetic-regular-baseline', I.shiftDate(today, -12), legs('baseline'), { trainingIntent: 'regular' });
    const deload = record('synthetic-declared-deload', previousDate, legs('deload', 0.5), { trainingIntent: 'deload' });
    latest = record('synthetic-regular-return', currentDate, legs('return', 1.05), { trainingIntent: 'regular' });
    state.training.records = [baseline, deload, latest];
  } else {
    latest = record(`synthetic-${kind}`, currentDate,
      [exercise(`${kind}-bench`, 'bench_press', '바벨 벤치 프레스', '합성 헬스장 / 벤치 1', 55, 8),
        exercise(`${kind}-row`, 'barbell_row', '바벨 로우', '합성 헬스장 / 바벨 1', 35, 10)], kind === 'pain' ? { pain: 'stop' } : {});
    if (kind === 'sets') latest.exercises[0].sets.push({ id: 'sets-bench-backoff', loadKg: 50, reps: 10, rir: null, marker: null });
    state.training.records = [latest];
  }
  const frozen = { date: I.shiftDate(today, -14), weightKg: 65, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown',
    carbAdjustmentG: 0, meals: [{ id: 'synthetic-frozen-meal', name: '합성 완료 식사', protein: 90, carbs: 210, fat: 55, alcoholG: 0, otherKcal: 0 }],
    sessions: [], complete: false, planSnapshot: null };
  frozen.planSnapshot = N.calculatePlan(profile, frozen, []); frozen.planSnapshot.context.goal = profile.goal;
  frozen.complete = true; state.days[frozen.date] = frozen;
  return { state: S.validateState(state), latest };
}
async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function stored(page) { return JSON.parse(await storedText(page)); }
async function navigate(page, view) {
  await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function coach(page) {
  await navigate(page, 'coach'); await page.locator('#coachWorkoutReview').waitFor({ state: 'visible' });
}
async function selectBlock(page, blockId, keyboard = false) {
  const button = page.locator(`.coach-review-list [data-action="coach-review-select"][data-block-id="${blockId}"]`);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  await page.locator('#coachReviewDetail').waitFor({ state: 'visible' });
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  if (keyboard) assert.equal(await page.locator('#coachReviewDetail').evaluate(element => document.activeElement === element), true);
}
async function nextTrial(page) {
  const next = page.locator('#coachReviewDetail .coach-review-next-trial');
  assert.equal(await next.count(), 1, 'a selected actual movement has one distinct next-trial area');
  const text = (await next.innerText()).trim();
  assert.ok(text.length > 10, 'the next trial contains a usable action, not an empty label');
  return text;
}
async function feedback(page, feeling, keyboard = false) {
  const button = page.locator(`#coachReviewDetail [data-action="training-feedback"][data-feeling="${feeling}"]`);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  assert.equal(await page.locator(`#coachReviewDetail [data-action="training-feedback"][data-feeling="${feeling}"]`).getAttribute('aria-pressed'), 'true');
  if (keyboard) assert.equal(await page.locator(`#coachReviewDetail [data-action="training-feedback"][data-feeling="${feeling}"]`).evaluate(element => document.activeElement === element), true, 'keyboard feedback keeps focus on the activated response after rendering');
}
async function intent(page, value, keyboard = false) {
  const button = page.locator(`#coachWorkoutReview [data-action="training-intent"][data-intent="${value}"]`);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
}
function expectOnlyRecordFields(initial, saved, id, mutate) {
  const expected = JSON.parse(JSON.stringify(initial));
  mutate(expected.training.records.find(row => row.id === id)); expected.updatedAt = saved.updatedAt;
  assert.deepEqual(saved, expected, 'coaching responses change only the selected actual response and save timestamp');
  assert.deepEqual(saved.days, initial.days, 'completed nutrition targets are immutable while coaching changes');
  assert.equal(saved.profile, null, 'training help does not invent a nutrition or body-composition profile');
}
async function layout(page, width) {
  const result = await page.evaluate(() => {
    const review = document.getElementById('coachWorkoutReview'), bounds = review.getBoundingClientRect();
    const bad = [...review.querySelectorAll('button,h2,h3,p,strong')].filter(element => element.getClientRects().length)
      .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim());
    const buttons = [...review.querySelectorAll('[data-action="training-feedback"], [data-action="training-intent"]')]
      .filter(element => element.getClientRects().length).map(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    return { document: document.documentElement.scrollWidth, left: bounds.left, right: bounds.right, bad, buttons };
  });
  assert.ok(result.document <= width + 1 && result.left >= -1 && result.right <= width + 1, `coach actions ${width}: horizontal overflow ${JSON.stringify(result)}`);
  assert.deepEqual(result.bad, [], `coach actions ${width}: clipped text`);
  for (const [index, a] of result.buttons.entries()) for (const b of result.buttons.slice(index + 1)) {
    assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, 'coaching response buttons do not overlap');
  }
}
async function screenshot(page, filename, selector = '#coachWorkoutReview') {
  await page.locator(selector).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: filename });
}
async function openTrainingRecord(page, id) {
  await navigate(page, 'training');
  await page.locator('[data-action="training-tab"][data-tab="log"]').click();
  await page.locator(`.workout-list-item[data-id="${id}"]`).click();
  await page.locator(`.workout-heading [data-action="training-edit"][data-id="${id}"]`).waitFor({ state: 'visible' });
}

async function firstSession(page, data, width, artifacts) {
  const originalBytes = await storedText(page);
  await selectBlock(page, 'first-bench', true);
  const detail = await page.locator('#coachReviewDetail').innerText();
  assert.match(detail, /55/); assert.match(detail, /8/);
  assert.match(await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), /출발|기준|첫|시작|현재/);
  const initialTrial = await nextTrial(page);
  assert.match(initialTrial, /55/); assert.match(initialTrial, /8/);
  assert.equal(await storedText(page), originalBytes, 'opening a first-day interpretation is read-only');
  await layout(page, width);
  await screenshot(page, path.join(artifacts, `coach-actions-first-${width}.png`), '#coachReviewDetail');

  const trials = new Map();
  for (const feeling of ['comfortable', 'hard', 'limit']) {
    await feedback(page, feeling, feeling === 'comfortable');
    const saved = await stored(page), expectedFeedback = { setId: 'first-bench-work', feeling, loadKg: 55, reps: 8 };
    expectOnlyRecordFields(data.state, saved, data.latest.id, row => { row.exercises[0].feedback = expectedFeedback; });
    assert.deepEqual(saved.training.records[0].exercises[0].feedback, expectedFeedback, 'feeling applies to one actual set, with its original values');
    assert.ok(saved.training.records[0].exercises.every(row => row.sets.every(set => set.rir === null)), 'feelings never manufacture a numerical RIR');
    assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][aria-pressed="true"]').count(), 1);
    trials.set(feeling, await nextTrial(page));
  }
  assert.notEqual(trials.get('comfortable'), trials.get('hard'), 'an easy reference and unexpectedly hard reference lead to different trials');
  assert.notEqual(trials.get('comfortable'), trials.get('limit'), 'near-limit feedback is not treated as spare capacity');
  const afterFeedback = await stored(page);
  assert.deepEqual(S.parseBackup(S.exportBackup(afterFeedback)).state, afterFeedback, 'backup roundtrip retains chosen feedback and frozen targets');
  const feedbackBytes = await storedText(page); await page.reload(); await coach(page); await selectBlock(page, 'first-bench');
  assert.equal(await storedText(page), feedbackBytes);
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][data-feeling="limit"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await nextTrial(page), trials.get('limit'), 'reload uses the saved actual response');
  await screenshot(page, path.join(artifacts, `coach-actions-feedback-${width}.png`), '#coachReviewDetail');

  await page.evaluate(key => {
    window.syntheticCoachSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('합성 저장 오류', 'QuotaExceededError');
      return window.syntheticCoachSetItem.call(this, name, value);
    };
  }, S.STORAGE_KEY);
  await page.locator('#coachReviewDetail [data-action="training-feedback"][data-feeling="comfortable"]').click();
  assert.equal(await storedText(page), feedbackBytes, 'a failed feedback save preserves exact stored bytes');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][data-feeling="limit"]').getAttribute('aria-pressed'), 'true', 'failed feedback is not presented as saved');
  assert.equal(await page.locator('#toast').evaluate(element => !element.hidden && element.classList.contains('toast-error')), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.syntheticCoachSetItem; delete window.syntheticCoachSetItem; });

  await openTrainingRecord(page, data.latest.id);
  await page.locator(`.workout-heading [data-action="training-edit"][data-id="${data.latest.id}"]`).click();
  await page.locator('#entryForm [name="0-1-loadKg"]').fill('57.5');
  assert.equal(await storedText(page), feedbackBytes, 'changing an editor draft is not an actual record change');
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  const afterEdit = await stored(page), edited = afterEdit.training.records.find(row => row.id === data.latest.id);
  assert.equal(edited.exercises[0].sets[1].loadKg, 57.5);
  assert.equal(Object.hasOwn(edited.exercises[0], 'feedback'), false, 'old-set feedback is invalidated when its load changes');
  assert.deepEqual(edited.source, data.latest.source); assert.deepEqual(afterEdit.days, data.state.days);
  await coach(page); await selectBlock(page, 'first-bench'); await feedback(page, 'comfortable');
  const beforeReuse = await stored(page);
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`.workout-heading [data-action="training-reuse"][data-id="${data.latest.id}"]`).click();
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  const afterReuse = await stored(page), copied = afterReuse.training.records.find(row => !beforeReuse.training.records.some(old => old.id === row.id));
  assert.ok(copied, 'reuse creates a separate actual record');
  assert.equal(copied.date, today); assert.equal(Object.hasOwn(copied, 'trainingIntent'), false, 'old session purpose is not copied as a new actual intent');
  assert.ok(copied.exercises.every(row => !Object.hasOwn(row, 'feedback')), 'old effort feedback is never copied into a new session');
  assert.ok(copied.exercises.every(row => row.sets.every(set => set.rir === null)));
  assert.deepEqual(afterReuse.training.records.filter(row => row.id !== copied.id), beforeReuse.training.records, 'reusing does not change previous actual records');
  assert.deepEqual(afterReuse.days, data.state.days);
}

async function globalDrop(page, data, width, artifacts) {
  const originalBytes = await storedText(page);
  assert.match(await page.locator('#coachWorkoutReview').innerText(), /의도적으로 가볍게/);
  assert.equal(await page.locator('#coachWorkoutReview [data-action="training-intent"]').count(), 4, 'a broad session change asks about intent before guessing its cause');
  for (const value of ['deload', 'technique', 'time-limited', 'regular']) {
    await intent(page, value, value === 'deload');
    const saved = await stored(page);
    expectOnlyRecordFields(data.state, saved, data.latest.id, row => { row.trainingIntent = value; });
    assert.deepEqual(S.parseBackup(S.exportBackup(saved)).state, saved, 'session intent survives backup without altering actual sets');
    await selectBlock(page, 'drop-curl');
    const trial = await nextTrial(page);
    if (value === 'deload' || value === 'technique') {
      assert.match(trial, /디로드|연습|가볍|부담|목적|의도/);
      assert.doesNotMatch(trial, /중량을 올리세요|증량하세요|바로.*증량|원래 중량으로.*복귀하세요/, 'an intentional light session does not compel load progression');
    } else if (value === 'regular') {
      assert.match(await page.locator('#coachWorkoutReview').innerText(), /평소|다시 확인|예상|줄|낮/);
      assert.doesNotMatch(await page.locator('#coachWorkoutReview').innerText(), /과훈련(?:입니다|이에요)|근손실(?:입니다|이에요)|영양 부족(?:입니다|이에요)/);
    }
    await layout(page, width);
    const savedBytes = await storedText(page); await page.reload(); await coach(page);
    assert.equal(await storedText(page), savedBytes);
    assert.equal((await stored(page)).training.records.find(row => row.id === data.latest.id).trainingIntent, value);
    if (value === 'deload' || value === 'regular') {
      await selectBlock(page, 'drop-curl');
      await screenshot(page, path.join(artifacts, `coach-actions-${value}-${width}.png`), '#coachReviewDetail');
    }
    await page.locator('#coachWorkoutReview [data-action="training-intent-clear"]').click();
    const cleared = await stored(page);
    expectOnlyRecordFields(data.state, cleared, data.latest.id, () => {});
    assert.match(await page.locator('#coachWorkoutReview').innerText(), /의도적으로 가볍게/);
  }
  assert.equal(JSON.parse(originalBytes).training.records.find(row => row.id === data.latest.id).trainingIntent, undefined);
}

async function regularReturn(page, data) {
  const untouched = await storedText(page); await selectBlock(page, 'return-curl');
  const observation = await page.locator('#coachReviewDetail .coach-review-comparison p').filter({ hasText: '최고 표시 세트' }).textContent();
  assert.match(observation, new RegExp(I.shiftDate(today, -12)), 'returning regular work uses the prior regular session as its reference');
  assert.doesNotMatch(observation, new RegExp(previousDate), 'a declared deload is not the baseline for fabricated recovery improvement');
  assert.match(observation, /40/); assert.match(observation, /42/);
  const detail = await page.locator('#coachReviewDetail').innerText();
  assert.doesNotMatch(detail, /근성장률\s*\d|회복률\s*\d|성장률\s*\d/);
  await nextTrial(page); assert.equal(await storedText(page), untouched);
  await page.locator('#coachReviewSession').selectOption('synthetic-declared-deload');
  await selectBlock(page, 'deload-curl');
  assert.match(await nextTrial(page), /디로드|가볍|목적|부담/);
  assert.equal(await storedText(page), untouched, 'looking back at an intentional session does not change its interpretation or actual values');
}

async function painSafety(page, data) {
  const untouched = await storedText(page); await selectBlock(page, 'pain-bench');
  const trial = await nextTrial(page);
  assert.match(trial, /통증|중단|증상|평가/);
  assert.doesNotMatch(trial, /중량을 올리세요|증량하세요|반복을 늘려|더 무겁게/);
  const response = page.locator('#coachReviewDetail [data-action="training-feedback"][data-feeling="comfortable"]');
  if (await response.count() && await response.isEnabled()) {
    await feedback(page, 'comfortable');
    assert.match(await nextTrial(page), /통증|중단|증상|평가/, 'easy feedback cannot override recorded stop-level pain');
    assert.doesNotMatch(await nextTrial(page), /중량을 올리세요|증량하세요|반복을 늘려|더 무겁게/);
    assert.deepEqual((await stored(page)).days, data.state.days);
  } else assert.equal(await storedText(page), untouched);
}

async function selectedSetFeedback(page, data) {
  await selectBlock(page, 'sets-bench');
  const choice = page.locator('#coachFeedbackSet');
  await choice.selectOption('sets-bench-work'); await feedback(page, 'hard');
  let saved = await stored(page);
  expectOnlyRecordFields(data.state, saved, data.latest.id, row => {
    row.exercises[0].feedback = { setId: 'sets-bench-work', feeling: 'hard', loadKg: 55, reps: 8 };
  });
  const beforeChoice = await storedText(page);
  await choice.selectOption('sets-bench-backoff');
  assert.equal(await storedText(page), beforeChoice, 'choosing another set is a read-only display operation');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][aria-pressed="true"]').count(), 0, 'another selected set cannot display the saved feeling of the previous set');
  await feedback(page, 'comfortable'); saved = await stored(page);
  expectOnlyRecordFields(data.state, saved, data.latest.id, row => {
    row.exercises[0].feedback = { setId: 'sets-bench-backoff', feeling: 'comfortable', loadKg: 50, reps: 10 };
  });
  const trial = await nextTrial(page); assert.match(trial, /50kg.*10회/); assert.match(trial, /11회/);
  assert.ok(saved.training.records[0].exercises[0].sets.every(set => set.rir === null), 'choosing a later set does not manufacture effort numbers for any set');
  await choice.selectOption('sets-bench-work');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][aria-pressed="true"]').count(), 0);
  await choice.selectOption('sets-bench-backoff');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][data-feeling="comfortable"]').getAttribute('aria-pressed'), 'true', 'returning to the exact saved set restores only its own feeling');
  await page.locator('#coachReviewDetail [data-action="training-feedback-clear"]').click();
  expectOnlyRecordFields(data.state, await stored(page), data.latest.id, () => {});
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"][aria-pressed="true"]').count(), 0);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [390, 1280]) for (const kind of ['first', 'drop', 'return', 'pain', 'sets']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }); let page;
      try {
        const data = fixture(kind), errors = [], requests = [], untouched = JSON.stringify(data.state);
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: S.STORAGE_KEY, value: untouched });
        page = await context.newPage(); page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(url); await coach(page);
        assert.equal(await page.locator('#coachReviewSession').inputValue(), data.latest.id);
        assert.equal(await storedText(page), untouched, 'observing stored records never writes fabricated facts');
        if (kind === 'first') await firstSession(page, data, width, artifacts);
        else if (kind === 'drop') await globalDrop(page, data, width, artifacts);
        else if (kind === 'return') await regularReturn(page, data);
        else if (kind === 'pain') await painSafety(page, data);
        else await selectedSetFeedback(page, data);
        await coach(page); await layout(page, width);
        await screenshot(page, path.join(artifacts, `coach-actions-${kind}-final-${width}.png`));
        assert.deepEqual(errors, [], 'coaching interactions have no page errors');
        assert.deepEqual(requests, [], 'local actionable coaching does not need AI, image reads or a network connection');
      } catch (error) {
        await page?.screenshot({ path: path.join(artifacts, `coach-actions-failure-${kind}-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    console.log('Coach actions browser: profile-free first-session next trials, set-bound comfortable/hard/limit feedback and read-only selection without leaking another set\'s feeling, RIR-null preservation, backup/reload/save failure, feedback invalidation on edited sets and reuse, session-wide load decline intent and reset, regular baseline skipping declared deload, stop-pain priority, keyboard response controls and 390/1280px passed. Synthetic local records only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
