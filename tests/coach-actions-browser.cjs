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
  return { id, exerciseId, rawName, equipmentKey, loadConvention: 'total', loadRole: 'external', groupKey: null, notes: '합성 원문 종목 메모',
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
function workingSets(row, values) {
  row.sets = [row.sets[0], ...values.map(([loadKg, reps], index) => ({ id: `${row.id}-work-${index + 1}`, loadKg, reps, rir: null, marker: null }))];
  return row;
}
function fixture(kind) {
  const state = S.createEmpty(); state.profile = null; state.trackingScope = 'training'; state.training = TS.createEmpty();
  state.training.reviewPreferences = { order: 'diary', mainExerciseKeys: [] };
  let latest;
  if (['timed-only', 'timed-evidence'].includes(kind)) {
    const timed = [
      exercise('timed-treadmill', 'treadmill', '런닝머신', '합성 트레드밀', null, null, { sets: [], durationMinutes: 15.25 }),
      exercise('timed-foam', 'foam_rolling', '폼 롤링 스트레칭', '합성 폼 롤러', null, null, { sets: [], durationMinutes: 5.5 }),
      exercise('timed-stretch', 'back_stretch', '등 근육 스트레칭', '맨몸', null, null, { sets: [], durationMinutes: 10 })
    ];
    const mixed = [
      exercise('timed-mixed', 'bench_press', '바벨 벤치 프레스', '합성 벤치', 40, 8, { durationMinutes: 7.25 }),
      exercise('timed-named', 'leg_curl', '레그 컬', '합성 레그컬', null, null, { sets: [] }),
      exercise('timed-marked', 'overhead_press', '바벨 오버 헤드 프레스', '합성 바벨', 20, 8,
        { sets: [{ id: 'timed-marked-w', loadKg: 10, reps: 10, marker: 'W', rir: null },
          { id: 'timed-marked-a', loadKg: 20, reps: 8, marker: 'A', rir: null }] })
    ];
    latest = record(`synthetic-${kind}`, currentDate, [...timed, ...(kind === 'timed-evidence' ? mixed : [])]);
    state.training.records = [latest];
  } else if (kind.startsWith('capacity-')) {
    const prior = [-20, -13, -6].map((offset, index) => record(`synthetic-capacity-prior-${index + 1}`, I.shiftDate(today, offset), [
      workingSets(exercise(`capacity-prior-${index + 1}-squat`, 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 100, 10), [[100, 10], [100, 10], [100, 10]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } }));
    latest = record(`synthetic-${kind}`, currentDate, [
      workingSets(exercise(`${kind}-squat`, 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', kind === 'capacity-plateau' ? 100 : 120, kind === 'capacity-plateau' ? 10 : 3),
        kind === 'capacity-plateau' ? [[100, 10], [100, 10], [100, 10]] : [[120, 3], [100, 6], [100, 4]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } });
    if (kind === 'capacity-recurrence') prior.unshift(record('synthetic-capacity-older-heavy', I.shiftDate(today, -45), [
      workingSets(exercise('capacity-older-heavy-squat', 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 120, 3), [[120, 3], [100, 8], [100, 8]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } }));
    state.training.records = [...prior, latest];
    state.training.records.push(record('synthetic-capacity-future', I.shiftDate(today, 2), [
      workingSets(exercise('capacity-future-squat', 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 150, 1), [[150, 1]])
    ]));
  } else if (kind === 'local-coordination') {
    const movements = (prefix, benchReps) => [
      workingSets(exercise(`${prefix}-bench`, 'bench_press', '바벨 벤치 프레스', '합성 헬스장 / 벤치 2', 80, 10), benchReps.map(reps => [80, reps])),
      workingSets(exercise(`${prefix}-row`, 'barbell_row', '바벨 로우', '합성 헬스장 / 바벨 4', 60, 10), [[60, 10], [60, 10], [60, 10]]),
      workingSets(exercise(`${prefix}-press`, 'machine_chest_press', '머신 체스트 프레스', '합성 헬스장 / 체스트 2', 70, 10), [[70, 10], [70, 10], [70, 10]])
    ];
    const prior = [-20, -13, -7].map((offset, index) => record(`synthetic-local-prior-${index + 1}`, I.shiftDate(today, offset), movements(`local-prior-${index + 1}`, [10, 10, 10])));
    latest = record('synthetic-local-coordination', currentDate, movements('local', [10, 7, 6]));
    state.training.records = [...prior, latest];
  } else if (kind === 'top-backoff') {
    const previous = record('synthetic-before-top-backoff', previousDate, [
      workingSets(exercise('previous-squat', 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 100, 10), [[100, 10], [100, 8], [100, 7]]),
      workingSets(exercise('previous-press', 'leg_press', '인피니티 레그 프레스', '합성 헬스장 / 프레스 1', 110, 15), [[110, 15], [110, 15]]),
      workingSets(exercise('previous-curl', 'leg_curl', '레그 컬', '합성 헬스장 / 레그컬 1', 40, 10), [[40, 10], [40, 10]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } });
    latest = record('synthetic-top-backoff', currentDate, [
      workingSets(exercise('top-squat', 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 120, 3), [[120, 3], [100, 6], [100, 4]]),
      workingSets(exercise('top-press', 'leg_press', '인피니티 레그 프레스', '합성 헬스장 / 프레스 1', 110, 15), [[110, 15], [110, 15]]),
      workingSets(exercise('top-curl', 'leg_curl', '레그 컬', '합성 헬스장 / 레그컬 1', 40, 10), [[40, 10], [40, 10]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } });
    state.training.records = [previous, latest];
  } else if (kind === 'low-rep' || kind === 'test') {
    latest = record(`synthetic-${kind}`, currentDate, [
      workingSets(exercise(`${kind}-squat`, 'squat', '바벨 스쿼트', '합성 헬스장 / 랙 1', 120, 3), [[120, 3], [120, 3], [120, 3]])
    ], kind === 'test' ? { trainingIntent: 'test' } : {});
    state.training.records = [latest];
  } else if (kind === 'unknown-context') {
    latest = record('synthetic-unknown-context', currentDate, [
      workingSets(exercise('unknown-bench', 'bench_press', '바벨 벤치 프레스', '합성 헬스장 / 벤치 1', 55, 10), [[55, 10], [55, 9]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } });
    state.training.records = [record('synthetic-before-unknown-context', previousDate, [
      workingSets(exercise('previous-unknown-bench', 'bench_press', '바벨 벤치 프레스', '합성 헬스장 / 벤치 1', 55, 8), [[55, 8], [55, 8]])
    ], { sequence: { order: 'unknown', structure: 'unknown' } }), latest];
  } else if (['question-load-change', 'question-rep-target', 'question-scope-invalidation', 'question-scope-auto'].includes(kind)) {
    const loadChange = kind !== 'question-rep-target';
    const exerciseId = loadChange ? 'overhead_press' : 'lat_pulldown';
    const name = loadChange ? '바벨 오버헤드 프레스' : '랫 풀다운';
    const equipment = loadChange ? '합성 헬스장 / 바벨 2' : '합성 헬스장 / 풀다운 1';
    const priorSets = loadChange ? [[40, 10], [50, 10], [50, 9]] : [[60, 12], [60, 12], [60, 12], [75, 8]];
    const currentSets = loadChange ? [[40, 10], [40, 10], [40, 9]] : [[60, 12], [60, 12], [60, 12], [75, 5]];
    const old = workingSets(exercise(`previous-${kind}`, exerciseId, name, equipment, ...priorSets[0]), priorSets);
    const current = workingSets(exercise(`${kind}-movement`, exerciseId, name, equipment, ...currentSets[0]), currentSets);
    latest = record(`synthetic-${kind}`, currentDate, [current,
      workingSets(exercise(`${kind}-curl`, 'leg_curl', '레그 컬', '합성 헬스장 / 레그컬 1', 40, 10), [[40, 10], [40, 10]])]);
    state.training.records = [record(`synthetic-before-${kind}`, previousDate, [old,
      workingSets(exercise(`previous-${kind}-curl`, 'leg_curl', '레그 컬', '합성 헬스장 / 레그컬 1', 40, 10), [[40, 10], [40, 10]])]), latest];
    if (kind === 'question-scope-invalidation') {
      old.id = current.id;
      old.sets.forEach((set, index) => { set.id = current.sets[index].id; });
    }
    if (kind === 'question-scope-auto') {
      for (const row of [old, current]) Object.assign(row, { exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', loadRole: 'unknown' });
      old.coachingAnswer = TS.createCoachingAnswer(old, 'load-change', 'planned');
      for (const saved of state.training.records) saved.exercises[1].coachingAnswer = TS.createCoachingAnswer(saved.exercises[1], 'rep-target', 'planned');
    }
  } else if (kind === 'drop') {
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
async function coachingAnswer(page, topic, answer, keyboard = false) {
  const selector = `#coachReviewDetail [data-action="training-coaching-answer"][data-topic="${topic}"][data-answer="${answer}"]`;
  const button = page.locator(selector);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true');
  if (keyboard) assert.equal(await page.locator(selector).evaluate(element => document.activeElement === element), true,
    'keyboard confirmation retains focus on the chosen response after the advice updates');
}
async function editField(page, recordId, name, value) {
  await openTrainingRecord(page, recordId);
  await page.locator(`.workout-heading [data-action="training-edit"][data-id="${recordId}"]`).click();
  const field = page.locator(`#entryForm [name="${name}"]`);
  if (!await field.isVisible()) await field.locator('xpath=ancestor::details').last().locator('summary').first().click();
  if (await field.evaluate(element => element.tagName) === 'SELECT') await field.selectOption(value); else await field.fill(value);
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
async function mapExercise(page, recordId, exerciseId, values) {
  await openTrainingRecord(page, recordId);
  await page.locator(`[data-action="training-map"][data-record="${recordId}"][data-exercise="${exerciseId}"]`).click();
  for (const [name, value] of Object.entries(values)) {
    const field = page.locator(`#entryForm [name="${name}"]`);
    if (await field.evaluate(element => element.tagName) === 'SELECT') await field.selectOption(value); else await field.fill(value);
  }
  await page.locator('#entryForm [name="confirmed"]').check();
  await page.locator('#entryForm button[type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
function assertActualRecordsUnchanged(before, after) {
  const actual = state => state.training.records.map(record => ({
    id: record.id, date: record.date, time: record.time, label: record.label, source: record.source, notes: record.notes,
    durationMinutes: record.durationMinutes, reportedSetCount: record.reportedSetCount, reportedVolumeKg: record.reportedVolumeKg,
    exercises: record.exercises.map(exercise => ({ id: exercise.id, rawName: exercise.rawName, notes: exercise.notes, sets: exercise.sets }))
  }));
  assert.deepEqual(actual(after), actual(before), 'metadata confirmation cannot rewrite any date, original name, source or actual set values');
  assert.deepEqual(after.days, before.days, 'exercise scope confirmation cannot change completed nutrition records');
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
    const buttons = [...review.querySelectorAll('[data-action="training-feedback"], [data-action="training-intent"], [data-action="training-coaching-answer"]')]
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
  assert.match(await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), /55kg.*8회/,
    'a first-day assessment starts with the performed work rather than demanding an earlier baseline');
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
  await page.locator('#coachReviewDetail .coach-review-comparison summary').click();
  const observation = await page.locator('#coachReviewDetail .coach-review-comparison').innerText();
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

async function evidenceText(page) {
  const comparison = page.locator('#coachReviewDetail .coach-review-comparison');
  assert.equal(await comparison.count(), 1, 'the next action and its observed comparison have one shared evidence area');
  if (!await comparison.evaluate(element => element.open)) await comparison.locator('summary').click();
  const evidence = await comparison.innerText();
  assert.match(evidence, /이번 기록과 이전 기록/);
  assert.doesNotMatch(evidence, /같은 조건 이전|같은 기록 조건|수행 판정과 참고 조건|RIR이 비어 있거나 달라 같은 노력 수준인지 확인할 수 없어요/,
    'unknown effort or order never creates a falsely confirmed condition label or a defensive comparison wall');
  return evidence;
}

async function assertRenderedActualSets(page, exercise) {
  const visible = await page.locator('#coachReviewDetail .set-table-row').evaluateAll(rows => rows.map(row => {
    const values = [...row.querySelectorAll('[role="cell"]')].map(cell => cell.textContent.trim());
    const number = value => value === '미확인' ? null : Number(value.replace(/,/g, ''));
    return { loadKg: number(values[1]), reps: number(values[2]), rir: number(values[3]) };
  }));
  assert.deepEqual(visible, exercise.sets.map(({ loadKg, reps, rir }) => ({ loadKg, reps, rir })),
    'the source table displays every actual warmup and working set, with no estimated kg or invented effort');
}

async function wholeSessionAnswer(page) {
  await page.locator('[data-action="coach-question"][data-question="training-progression"]').click();
  await page.locator('#coachAnswer').waitFor({ state: 'visible' });
  return page.locator('#coachAnswer').innerText();
}

async function ordinaryLowRep(page, data) {
  const unchanged = await storedText(page); await selectBlock(page, 'low-rep-squat');
  const meaning = await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), trial = await nextTrial(page);
  assert.match(meaning, /120kg/); assert.match(meaning, /3/);
  assert.match(trial, /120kg/); assert.match(trial, /3회/);
  assert.doesNotMatch(`${meaning} ${trial}`, /고중량 기록과 평소 운동 나누기|낮은 반복의 기록이에요|곧바로 다음 시작값으로 쓰지|테스트 세트|테스트 기록/,
    'three-repetition work is not automatically reclassified as a test or excluded from normal progression');
  const answer = await wholeSessionAnswer(page);
  assert.match(answer, new RegExp((await page.locator('#coachReviewDetail .coach-review-next-trial h4').innerText()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'whole-session coaching and movement detail use the same chosen next-action direction');
  assert.doesNotMatch(answer, /고중량 기록과 평소 운동 나누기|곧바로 다음 시작값으로 쓰지/);
  await evidenceText(page);
  assert.equal(await storedText(page), unchanged, 'a low-repetition interpretation cannot save an invented test purpose');
  assert.equal(Object.hasOwn((await stored(page)).training.records[0], 'trainingIntent'), false);
}

async function topBackoff(page, data, width, artifacts) {
  const unchanged = await storedText(page); await selectBlock(page, 'top-squat');
  const interpretation = await movementInterpretation(page, 'top-squat');
  assertActualCoachingFacts(data, 'top-squat', interpretation);
  await assertRenderedActualSets(page, data.latest.exercises[0]);
  const meaning = await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), trial = await nextTrial(page);
  assert.ok(meaning.includes(interpretation.coaching.assessment), 'the main paragraph explains the chosen whole-set coaching context');
  assert.match(meaning, /무거운/); assert.match(meaning, /낮춘|반복 세트/);
  assert.match(meaning, /120kg.*3회/); assert.match(meaning, /100kg.*6.*4/);
  assert.match(meaning, /10.*8.*7/);
  assert.doesNotMatch(meaning, /첫 일반 세트가 .*100kg.*10회.*120kg.*3회/,
    'a new heavier top set is not treated as the same kind of set as the previous straight-set start');
  assert.equal(interpretation.nextAction.kind, 'consolidate-heavy');
  assert.deepEqual(interpretation.nextAction.focusSetIds, ['top-squat-work-1'], 'the primary trial targets the actual heavier set');
  assert.deepEqual(interpretation.nextAction.preservedSetIds, ['top-squat-work-2', 'top-squat-work-3'], 'the primary trial preserves both actual backoffs');
  const supporting = interpretation.coaching.supportingActions.find(action => action.kind === 'restore-tail');
  assert.deepEqual(supporting.focusSetIds, ['top-squat-work-2', 'top-squat-work-3'], 'the supporting trial addresses the observed backoff decline, not the heavier set');
  assert.ok(trial.includes(interpretation.nextAction.body) && trial.includes(supporting.body), 'both distinct next actions are visible together');
  assert.match(trial, /120kg.*3회/); assert.match(trial, /100kg/);
  assert.doesNotMatch(trial, /고중량 기록과 평소 운동 나누기|곧바로 다음 시작값으로 쓰지|근력이 떨어|근력 감소|회복 부족/,
    'a candidate top/backoff structure does not become a test or a causal recovery diagnosis');
  const evidence = await evidenceText(page);
  assert.match(evidence, /100kg/); assert.match(evidence, /10.*8.*7/); assert.match(evidence, /6.*4/);
  assert.match(evidence, new RegExp(previousDate));
  const answer = await wholeSessionAnswer(page);
  assert.equal((answer.match(/일반 7세트/g) || []).length, 1, 'session counts are presented once instead of repeated as a substitute for analysis');
  assert.match(answer, /무릎|대퇴|앞쪽|하체/); assert.match(answer, /햄스트링|뒤쪽/,
    'the full-session composition reflects the third movement rather than only the two action rows');
  assert.ok(answer.includes(interpretation.nextAction.title) && answer.includes(supporting.body), 'whole-session advice retains the selected primary and supporting directions');
  assert.equal(answer.split(supporting.body).length - 1, 1, 'the supporting action is stated once rather than repeated after an already-combined primary action');
  assert.doesNotMatch(answer, /고중량 기록과 평소 운동 나누기|RIR이 비어 있거나 달라|근력이 떨어/);
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`[data-action="training-reference"][data-record="${data.latest.id}"][data-exercise="top-squat"]`).click();
  await page.locator('#entryForm [name="referenceRepsMin"]').fill('6');
  await page.locator('#entryForm [name="referenceRepsMax"]').fill('6');
  await page.locator('#entryForm button[type="submit"]').click();
  const reference = page.locator('#startingReferenceResult');
  const referenceMain = reference.locator('.reference-main'), referenceText = await referenceMain.innerText();
  assert.match(referenceText, /일반 세트 2\/3/); assert.match(referenceText, /100(?:\.0)?kg\s*×\s*6회/);
  assert.match(referenceText, /조회 조건 6회/);
  assert.match(referenceText, /선택한 반복에 맞는 세트/);
  assert.equal(await reference.locator('details').count(), 1, 'selection rules and other-equipment limits share one optional evidence area');
  assert.equal(await reference.locator('details').evaluate(element => element.open), false);
  assert.equal(await reference.locator('.reference-selected-set').isVisible(), true, 'the selected actual set is primary content, not hidden in evidence');
  assert.doesNotMatch(referenceText, /미확인|확정하지|사용하지 않습니다|조건에 맞는 세트가 없는|처방|보장|추정이며/,
    'a usable same-equipment record shows its actual baseline and next trial instead of a generic caveat wall');
  assert.doesNotMatch(await reference.locator('.starting-reference-range').innerText(), /120/,
    'requesting backoff repetitions selects the actual matching second set instead of the unrelated heavier first set');
  const referenceLayout = await page.locator('#entryDialog').evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right,
      clipped: [...dialog.querySelectorAll('p,h2,h3,button,.reference-row')].filter(element => element.getClientRects().length)
        .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim()) };
  });
  assert.ok(referenceLayout.left >= -1 && referenceLayout.right <= width + 1, 'the set-aware reference fits the viewport');
  assert.deepEqual(referenceLayout.clipped, [], 'actual set position, purpose and selection labels wrap without clipping');
  await screenshot(page, path.join(artifacts, `coach-actions-reference-${width}.png`), '#startingReferenceResult');
  await reference.getByText('선택 기준과 다른 장비 참고').click();
  assert.match(await reference.innerText(), /순서|노력|등가 저항|잠정 추정/,
    'source limitations remain available without replacing the primary selected-set interpretation');
  await page.locator('#entryForm [name="referenceRepsMin"]').fill('20');
  await page.locator('#entryForm [name="referenceRepsMax"]').fill('20');
  await page.locator('#entryForm button[type="submit"]').click();
  const mismatched = await reference.locator('.reference-main').innerText();
  assert.match(mismatched, /조회 조건 20회/); assert.match(mismatched, /120(?:\.0)?kg\s*×\s*3회/);
  assert.match(mismatched, /실제 3회.*같은 kg를 그대로 적용하기보다/,
    'a requested repetition range absent from the records is not hidden behind a falsely applicable kg baseline');
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
  await navigate(page, 'training'); await page.locator('[data-action="training-tab"][data-tab="analysis"]').click();
  const directions = await page.locator('.training-next-directions').innerText();
  assert.ok(directions.includes(interpretation.nextAction.title), 'the analysis tab uses the same context-selected primary direction');
  assert.doesNotMatch(directions, /고중량 기록과 평소 운동 나누기|곧바로 다음 시작값으로 쓰지/,
    'the analysis tab cannot retain the superseded low-repetition rule');
  await coach(page); await selectBlock(page, 'top-squat'); await evidenceText(page);
  await layout(page, width); await screenshot(page, path.join(artifacts, `coach-actions-top-backoff-${width}.png`), '#coachReviewDetail');
  assert.equal(await storedText(page), unchanged, 'set-role candidates and observations are read-only, not invented confirmed annotations');
  assert.deepEqual((await stored(page)).training.records, data.state.training.records);
}

async function unknownContext(page, data) {
  const unchanged = await storedText(page); await selectBlock(page, 'unknown-bench');
  const meaning = await page.locator('#coachReviewDetail .coach-review-meaning').innerText();
  assert.match(meaning, /55kg/); assert.match(meaning, /10.*9/); assert.match(meaning, /8.*8/);
  const interpretation = await movementInterpretation(page, 'unknown-bench');
  assertActualCoachingFacts(data, 'unknown-bench', interpretation);
  assert.equal(interpretation.coaching.facts.previous.source.date, previousDate, 'a usable observation retains the exact prior source without an RIR prerequisite');
  const trial = await nextTrial(page); assert.match(trial, /55kg/);
  assert.doesNotMatch(trial, /분석할 수 없|알 수 있는 게 없|RIR.*필요|비교.*보류/,
    'missing optional effort and order cannot replace practical next steps with an unavailable-analysis message');
  const evidence = await evidenceText(page);
  assert.match(evidence, new RegExp(previousDate), 'the date of the actual comparison remains visible in its evidence');
  assert.match(evidence, /순서|배치/); assert.match(evidence, /55kg/);
  assert.doesNotMatch(evidence, /숫자 관찰과 근력 판정을 구분했어요|미기록 기간을 휴식으로 간주하지 않았어요|저장한 프로그램을 자동으로 바꾸지/,
    'the expanded comparison answers what changed, without repeating generic non-actions as evidence');
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`[data-action="training-reference"][data-record="${data.latest.id}"][data-exercise="unknown-bench"]`).click();
  assert.doesNotMatch(await page.locator('#entryForm').innerText(), /순서.*환산 근거로는 사용하지|RIR.*필수/,
    'unknown order does not put an unrelated transfer prerequisite in front of a same-equipment lookup');
  await page.locator('#entryForm [name="referenceRole"]').selectOption('unknown');
  await page.locator('#entryForm button[type="submit"]').click();
  const missingRole = await page.locator('#startingReferenceResult .reference-main').innerText();
  assert.match(missingRole, /들어 올린 중량인지 보조 중량인지/);
  assert.doesNotMatch(missingRole, /RIR.*필수|RIR.*확인해야|순서.*확인해야|회복.*평가/,
    'an unsupported kg-role request names the specific missing input instead of requiring unrelated optional records');
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click(); await coach(page);
  assert.equal(await storedText(page), unchanged);
  assert.ok((await stored(page)).training.records.every(row => row.exercises.every(ex => ex.sets.every(set => set.rir === null))),
    'usable advice does not require fabricating actual RIR or performance order');
}

async function explicitTest(page, data) {
  const unchanged = await storedText(page); await selectBlock(page, 'test-squat');
  assert.match(await nextTrial(page), /테스트|기록 확인|목적/,
    'an explicitly recorded test remains distinct from ordinary low-repetition work');
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`[data-action="training-reference"][data-record="${data.latest.id}"][data-exercise="test-squat"]`).click();
  await page.locator('#entryForm button[type="submit"]').click();
  const reference = page.locator('#startingReferenceResult');
  assert.match(await reference.locator('h3').innerText(), /별도 목적의 실제 세트/,
    'a test-only equipment history is not presented as the normal training baseline');
  const testMain = await reference.locator('.reference-main').innerText();
  assert.match(testMain, /일반 세트 1\/3/); assert.match(testMain, /수행 테스트/);
  assert.match(testMain, /별도 목적으로 남긴 기록.*평소 일반 세트/);
  assert.doesNotMatch(testMain, /같은 장비에서 이 반복을 재현|여유가 남으면.*더 시도/,
    'test-only observation does not inherit ordinary baseline progression instructions');
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
  await coach(page);
  assert.equal(await storedText(page), unchanged);
}

async function movementInterpretation(page, blockId) {
  return page.evaluate(({ key, date, blockId }) => {
    const state = JSON.parse(localStorage.getItem(key));
    const analysis = window.MacroTraining.analyze(state.training.records, { date, profile: state.profile, checkins: state.days,
      mappings: state.training.mappings, includeCapacityHistory: true });
    return window.MacroTraining.coachSession(analysis, { sessionId: document.getElementById('coachReviewSession').value, preferences: state.training.reviewPreferences,
      priorityMuscles: state.training.settings.priorityMuscles, profile: state.profile, planning: state.training.planning })
      .rows.find(row => row.blockId === blockId)?.interpretation || null;
  }, { key: S.STORAGE_KEY, date: today, blockId });
}
async function capacityInterpretation(page, blockId) { return (await movementInterpretation(page, blockId))?.performance || null; }

function assertActualCoachingFacts(data, blockId, interpretation) {
  const actual = data.latest.exercises.find(row => row.id === blockId), fact = interpretation?.coaching?.facts?.current;
  assert.ok(actual && fact, 'contextual coaching exposes its actual whole-movement facts');
  const working = actual.sets.filter(set => set.marker === null);
  assert.deepEqual(fact.source, { date: data.latest.date, sessionId: data.latest.id, blockId, setIds: working.map(set => set.id) },
    'the coaching context has exact current date, session, block and actual working-set sources');
  assert.deepEqual(fact.sets.map(set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps, rir: set.rir })),
    working.map(set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps, rir: set.rir })),
    'whole-set interpretation preserves each performed value instead of replacing it with an RM estimate');
  assert.equal(fact.equipmentKey, actual.equipmentKey); assert.equal(fact.loadConvention, actual.loadConvention);
  assert.equal(fact.loadRole, actual.loadRole);
  for (const signal of interpretation.coaching.signals) for (const source of signal.sourceRefs || []) {
    const record = data.state.training.records.find(row => row.id === source.sessionId);
    const exercise = record?.exercises.find(row => row.id === source.blockId);
    assert.ok(record && exercise, 'every contextual signal resolves to an actual record and block');
    assert.equal(source.date, record.date); assert.ok(source.date <= data.latest.date, 'context cannot borrow later records');
    assert.ok(source.setIds.every(id => exercise.sets.some(set => set.id === id && set.marker === null)), 'signal sources contain actual working sets only');
  }
}

async function performedCapacity(page, data, kind, width, artifacts) {
  const unchanged = await storedText(page), blockId = `${kind}-squat`;
  await selectBlock(page, blockId);
  assert.equal(await page.evaluate(() => typeof window.MacroTrainingCapacity?.compareHistory), 'function',
    'direct index.html execution loads the local capacity model before the training interpreter');
  let performance = await capacityInterpretation(page, blockId);
  assert.ok(performance?.summary && performance.model?.current, 'a performed set has an explicit estimated-performance interpretation');
  const interpretation = await movementInterpretation(page, blockId);
  assertActualCoachingFacts(data, blockId, interpretation);
  await assertRenderedActualSets(page, data.latest.exercises[0]);
  const meaning = await page.locator('#coachReviewDetail .coach-review-meaning').innerText();
  assert.ok(meaning.includes(interpretation.coaching.assessment), 'the first substantive paragraph explains the entire performed-set context');
  assert.ok((await page.locator('#coachReviewDetail .coach-review-meaning p').first().innerText()).includes(interpretation.coaching.assessment),
    'a model-only RM paragraph cannot displace the selected whole-set assessment');
  const evidence = await evidenceText(page);
  assert.ok(evidence.includes(performance.summary), 'the provisional RM reference remains available alongside the actual source evidence');
  assert.match(evidence, /Epley.*Brzycki/); assert.match(evidence, /이번 1RM 추정/);
  assert.notEqual(performance.model.allTimeBest?.loadKg, 150, 'future heavy work cannot enter the current capacity interpretation');
  assert.match(performance.summary, /추정|예상|가늠/);
  assert.doesNotMatch(meaning, /실제\s*1RM(?:은|이|:)\s*\d|확정(?:된)?\s*1RM|근성장률\s*\d|RIR.*(?:필수|입력해야.*분석)/,
    'a model estimate neither claims a true 1RM or growth rate nor makes optional effort a prerequisite');
  assert.equal(await storedText(page), unchanged, 'estimating performance never saves a fabricated actual strength measurement');
  if (kind === 'capacity-plateau') {
    assert.equal(performance.model.stableWorking.detected, true);
    assert.ok(performance.model.stableWorking.observationDays >= 3);
    assert.equal(performance.model.stableWorking.loadKg, 100); assert.equal(performance.model.stableWorking.reps, 10);
    const trial = await nextTrial(page);
    assert.match(trial, /11회|1회 더|작은 폭|최소 단위|한 세트/,
      'repeating a working standard gives a small concrete next attempt rather than another missing-information gate');
    assert.doesNotMatch(trial, /RIR.*필수|목표.*입력.*먼저|질문에.*답.*후|확인해야.*조언/);
    await layout(page, width); await screenshot(page, path.join(artifacts, `coach-actions-capacity-plateau-${width}.png`), '#coachReviewDetail');
    assert.equal(await storedText(page), unchanged); return;
  }
  assert.deepEqual({ min: performance.model.expectedRepsAtCurrentLoad.min, max: performance.model.expectedRepsAtCurrentLoad.max }, { min: 3, max: 5 },
    'the three prior 100kg ten-repetition days give a bounded formula-based three-to-five-repetition reference at 120kg');
  assert.match(meaning, /3\s*(?:~|-)\s*5회/); assert.match(meaning, /120kg/);
  assert.match(meaning, /100kg.*6.*4/, 'the heavier set does not hide the performed backoffs in the main interpretation');
  assert.deepEqual(interpretation.nextAction.focusSetIds, [`${blockId}-work-1`]);
  assert.deepEqual(interpretation.nextAction.preservedSetIds, [`${blockId}-work-2`, `${blockId}-work-3`]);
  if (kind === 'capacity-recurrence') {
    const olderDate = I.shiftDate(today, -45);
    assert.equal(performance.model.sameLoadHistory.date, olderDate,
      'an older 120kg occurrence remains part of load familiarity outside the visible 28-day session selector');
    assert.ok(performance.model.sameLoadHistory.daysAgo > 28);
    assert.doesNotMatch(meaning, /120kg.*(?:처음 시도|첫 시도|처음 사용|새 중량)/,
      'returning to an older load is not mistaken for first exposure because the UI window hid that day');
    assert.match(evidence, new RegExp(`${olderDate}|${performance.model.sameLoadHistory.daysAgo}일`), 'older familiarity is dated in the detailed evidence, without crowding out the current coaching');
  } else assert.equal(performance.model.sameLoadHistory, null, 'a genuinely new load has no invented earlier occurrence');
  const wholeAnswer = await wholeSessionAnswer(page);
  assert.match(wholeAnswer, /3\s*(?:~|-)\s*5회/,
    'whole-session coaching uses the same estimated performed-capacity reference as the movement detail');
  await layout(page, width); await screenshot(page, path.join(artifacts, `coach-actions-${kind}-${width}.png`), '#coachReviewDetail');
  if (kind === 'capacity-recurrence') { assert.equal(await storedText(page), unchanged); return; }

  const select = page.locator('#coachFeedbackSet'), setId = `${blockId}-work-1`, estimates = performance.model.current;
  const actions = new Map();
  for (const feeling of ['comfortable', 'limit']) {
    await select.selectOption(setId); await feedback(page, feeling);
    const saved = await stored(page);
    expectOnlyRecordFields(data.state, saved, data.latest.id, row => {
      row.exercises[0].feedback = { setId, feeling, loadKg: 120, reps: 3 };
    });
    assert.ok(saved.training.records.every(row => row.exercises.every(ex => ex.sets.every(set => set.rir === null))),
      'qualitative effort on one set never supplies an actual RIR for that set, its backoffs or other days');
    performance = await capacityInterpretation(page, blockId);
    assert.equal(performance.model.current.reportedRir, null); assert.equal(performance.model.current.rirApplied, false);
    assert.equal(performance.model.current.effortBasis, feeling === 'comfortable' ? 'comfortable' : 'near-limit');
    assert.equal(performance.model.current.minKg, estimates.minKg); assert.equal(performance.model.current.maxKg, estimates.maxKg,
      'qualitative feeling changes the interpretation without inventing a numeric repetition reserve');
    actions.set(feeling, await nextTrial(page));
  }
  assert.notEqual(actions.get('comfortable'), actions.get('limit'), 'recorded comfortable versus near-limit performance leads to different next attempts');

  await openTrainingRecord(page, data.latest.id);
  await page.locator(`.workout-heading [data-action="training-edit"][data-id="${data.latest.id}"]`).click();
  await page.locator('#entryForm [name="0-1-rir"]').fill('1');
  await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  const withRir = await stored(page), latest = withRir.training.records.find(row => row.id === data.latest.id);
  assert.equal(latest.exercises[0].sets[1].rir, 1);
  assert.ok(latest.exercises[0].sets.filter((_, index) => index !== 1).every(set => set.rir === null),
    'editing one actual RIR does not imply a shared effort level for the warmup or backoff sets');
  assert.deepEqual(withRir.training.records.filter(row => row.id !== data.latest.id), data.state.training.records.filter(row => row.id !== data.latest.id));
  assert.deepEqual(withRir.days, data.state.days);
  await coach(page); await selectBlock(page, blockId); performance = await capacityInterpretation(page, blockId);
  assert.equal(performance.model.current.reportedRir, 1); assert.equal(performance.model.current.rirApplied, true);
  assert.ok(performance.model.current.minKg > estimates.minKg && performance.model.current.maxKg > estimates.maxKg,
    'explicit one-set numerical RIR refines the estimate while remaining separate from performed repetitions');
  const withRirEvidence = await evidenceText(page);
  assert.match(withRirEvidence, /RIR\s*1/); assert.match(withRirEvidence, /추정|예상|가늠/);
}

async function clarificationLoop(page, data, kind, width, artifacts) {
  const blockId = `${kind}-movement`, topic = kind === 'question-load-change' ? 'load-change' : 'rep-target';
  const actual = data.latest.exercises[0], originalBytes = await storedText(page);
  await selectBlock(page, blockId, true);
  const initial = await movementInterpretation(page, blockId), initialTrial = await nextTrial(page);
  assertActualCoachingFacts(data, blockId, initial);
  await assertRenderedActualSets(page, actual);
  assert.equal(initial.coaching.question.topic, topic); assert.equal(initial.coaching.question.selectedAnswer, null);
  assert.equal(await page.locator('#coachReviewDetail .coach-review-question').count(), 1);
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"]').count(), 2);
  assert.equal(await storedText(page), originalBytes, 'an optional clarification never writes an inferred intention');
  for (const answer of ['planned', 'unexpected']) {
    const button = page.locator(`#coachReviewDetail [data-action="training-coaching-answer"][data-answer="${answer}"]`);
    assert.equal(await button.getAttribute('data-record'), data.latest.id);
    assert.equal(await button.getAttribute('data-block-id'), blockId);
    assert.equal(await button.getAttribute('data-topic'), topic);
  }
  const responses = new Map();
  for (const answer of ['planned', 'unexpected']) {
    await coachingAnswer(page, topic, answer, answer === 'planned');
    const saved = await stored(page), snapshot = { topic, answer,
      sets: actual.sets.map(({ id, loadKg, reps, marker }) => ({ id, loadKg, reps, marker })) };
    expectOnlyRecordFields(data.state, saved, data.latest.id, row => { row.exercises[0].coachingAnswer = snapshot; });
    const interpreted = await movementInterpretation(page, blockId);
    assert.equal(interpreted.coaching.question.selectedAnswer, answer);
    assert.deepEqual(interpreted.coaching.userAnswer, { topic, answer, setIds: actual.sets.map(set => set.id) });
    assert.equal(interpreted.nextAction.kind, answer === 'planned' ? 'maintain-intended-work' : 'recheck-unexpected-work',
      'the response changes the chosen local next action, not just the pressed state');
    assert.deepEqual(interpreted.coaching.facts.current.sets, initial.coaching.facts.current.sets,
      'the declared intention is kept separate from all actual performed numbers');
    await assertRenderedActualSets(page, actual);
    const meaning = await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), trial = await nextTrial(page);
    assert.ok(meaning.includes(interpreted.coaching.assessment) && trial.includes(interpreted.nextAction.body));
    assert.notEqual(trial, initialTrial, 'answering the clarification materially refines the practical advice');
    assert.doesNotMatch(`${meaning} ${trial}`, /과훈련(?:입니다|이에요)|근손실(?:입니다|이에요)|영양 부족(?:입니다|이에요)/);
    assert.ok(saved.training.records.every(row => row.exercises.every(ex => ex.sets.every(set => set.rir === null))),
      'planned or unexpectedly hard work never fabricates an actual RIR');
    responses.set(answer, { meaning, trial });
    await layout(page, width);
  }
  assert.notEqual(responses.get('planned').meaning, responses.get('unexpected').meaning);
  assert.notEqual(responses.get('planned').trial, responses.get('unexpected').trial,
    'planned lower-load work and unexpectedly early stopping lead to distinct local directions');
  const afterAnswer = await stored(page), savedBytes = await storedText(page);
  assert.deepEqual(S.parseBackup(S.exportBackup(afterAnswer)).state, afterAnswer,
    'the confirmed whole-set answer survives complete backup validation and restoration');
  await page.reload(); await coach(page); await selectBlock(page, blockId);
  assert.equal(await storedText(page), savedBytes);
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][data-answer="unexpected"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await nextTrial(page), responses.get('unexpected').trial, 'reload repeats the saved answer-driven advice without AI');
  await screenshot(page, path.join(artifacts, `coach-actions-${kind}-answered-${width}.png`), '#coachReviewDetail');

  await page.evaluate(key => {
    window.syntheticCoachSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('합성 저장 오류', 'QuotaExceededError');
      return window.syntheticCoachSetItem.call(this, name, value);
    };
  }, S.STORAGE_KEY);
  await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][data-answer="planned"]').click();
  assert.equal(await storedText(page), savedBytes, 'a failed clarification save preserves the exact stored answer and raw record');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][data-answer="unexpected"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await nextTrial(page), responses.get('unexpected').trial, 'unsaved intentions cannot change the displayed next action');
  assert.equal(await page.locator('#toast').evaluate(element => !element.hidden && element.classList.contains('toast-error')), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.syntheticCoachSetItem; delete window.syntheticCoachSetItem; });

  await page.locator('#coachReviewDetail [data-action="training-coaching-answer-clear"]').click();
  expectOnlyRecordFields(data.state, await stored(page), data.latest.id, () => {});
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][aria-pressed="true"]').count(), 0);
  assert.equal(await nextTrial(page), initialTrial, 'clearing a response returns to the original record-only next action');
  await coachingAnswer(page, topic, 'unexpected');
  const beforeRir = await stored(page), confirmed = beforeRir.training.records.find(row => row.id === data.latest.id).exercises[0].coachingAnswer;
  await editField(page, data.latest.id, '0-1-rir', '1');
  const afterRir = await stored(page), rirRecord = afterRir.training.records.find(row => row.id === data.latest.id);
  expectOnlyRecordFields(beforeRir, afterRir, data.latest.id, row => { row.exercises[0].sets[1].rir = 1; });
  assert.deepEqual(rirRecord.exercises[0].coachingAnswer, confirmed,
    'adding optional RIR alone does not invalidate the confirmed intent of unchanged load, repetitions and markers');
  await coach(page); await selectBlock(page, blockId);
  assert.equal((await movementInterpretation(page, blockId)).coaching.question.selectedAnswer, 'unexpected');
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][data-answer="unexpected"]').getAttribute('aria-pressed'), 'true');

  const changedIndex = topic === 'rep-target' ? 4 : 1;
  const changedReps = rirRecord.exercises[0].sets[changedIndex].reps + 1;
  await editField(page, data.latest.id, `0-${changedIndex}-reps`, String(changedReps));
  const afterNumeric = await stored(page), edited = afterNumeric.training.records.find(row => row.id === data.latest.id);
  expectOnlyRecordFields(afterRir, afterNumeric, data.latest.id, row => {
    row.exercises[0].sets[changedIndex].reps = changedReps; delete row.exercises[0].coachingAnswer;
  });
  assert.equal(Object.hasOwn(edited.exercises[0], 'coachingAnswer'), false,
    'an actual repetition edit invalidates an answer bound to the old complete set snapshot');
  await coach(page); await selectBlock(page, blockId);
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][aria-pressed="true"]').count(), 0);
  await coachingAnswer(page, topic, 'planned');
  const beforeReuse = await stored(page);
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`.workout-heading [data-action="training-reuse"][data-id="${data.latest.id}"]`).click();
  await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  const afterReuse = await stored(page), copied = afterReuse.training.records.find(row => !beforeReuse.training.records.some(old => old.id === row.id));
  assert.ok(copied && copied.date === today, 'reuse creates a distinct new workout on the selected date');
  assert.ok(copied.exercises.every(row => !Object.hasOwn(row, 'coachingAnswer')),
    'last workout intention is never inherited as the answer for a new workout');
  assert.ok(copied.exercises.every(row => row.sets.every(set => set.rir === null)), 'reuse does not copy actual RIR into an unperformed workout');
  assert.deepEqual(afterReuse.training.records.filter(row => row.id !== copied.id), beforeReuse.training.records,
    'reuse preserves every older record and its own confirmed answer');
  assert.deepEqual(afterReuse.days, data.state.days);
}

async function rejectedStaleAction(page, selector, changedData) {
  const button = page.locator(selector), before = await storedText(page);
  const originalData = await button.evaluate(element => ({ record: element.dataset.record, blockId: element.dataset.blockId }));
  await button.evaluate((element, values) => Object.assign(element.dataset, values), changedData);
  await button.click();
  assert.equal(await storedText(page), before, 'a stale action cannot write to a different date or movement with a colliding block ID');
  assert.equal(await page.locator('#toast').evaluate(element => !element.hidden && element.classList.contains('toast-error')), true);
  await button.evaluate((element, values) => Object.assign(element.dataset, values), originalData);
}

async function scopeInvalidation(page, data, width, artifacts) {
  const kind = 'question-scope-invalidation', blockId = `${kind}-movement`, beforeId = `synthetic-before-${kind}`;
  const originalScope = { exerciseId: 'overhead_press', equipmentKey: data.latest.exercises[0].equipmentKey, loadConvention: 'total', loadRole: 'external' };
  const currentMovement = state => state.training.records.find(row => row.id === data.latest.id).exercises[0];
  const answerAgain = async () => { await coach(page); await selectBlock(page, blockId); await coachingAnswer(page, 'load-change', 'planned'); };
  await selectBlock(page, blockId); await coachingAnswer(page, 'load-change', 'planned', true);
  const answerSelector = '#coachReviewDetail [data-action="training-coaching-answer"][data-answer="unexpected"]';
  const feedbackSelector = '#coachReviewDetail [data-action="training-feedback"][data-feeling="comfortable"]';
  for (const selector of [answerSelector, feedbackSelector]) {
    await rejectedStaleAction(page, selector, { record: beforeId });
    await rejectedStaleAction(page, selector, { blockId: `${kind}-curl` });
  }
  await rejectedStaleAction(page, '#coachReviewDetail [data-action="training-coaching-answer-clear"]', { record: beforeId });
  let saved = await stored(page);
  assert.equal(currentMovement(saved).coachingAnswer.answer, 'planned');
  assert.ok(!saved.training.records.find(row => row.id === beforeId).exercises[0].coachingAnswer,
    'cross-date collision protection does not silently annotate the earlier workout');
  assert.ok(saved.training.records.every(row => row.exercises.every(exercise => !exercise.feedback)),
    'stale feedback cannot annotate either the earlier workout or an unselected movement');

  for (const [field, changed, restored] of [['equipment-0', '합성 헬스장 / 바벨 3', originalScope.equipmentKey],
    ['convention-0', 'per-side', 'total'], ['role-0', 'assistance', 'external']]) {
    const before = await stored(page);
    await editField(page, data.latest.id, field, changed); saved = await stored(page);
    assertActualRecordsUnchanged(before, saved);
    assert.equal(Object.hasOwn(currentMovement(saved), 'coachingAnswer'), false,
      `${field}: an answer cannot survive a change to its actual comparison scope`);
    await editField(page, data.latest.id, field, restored); await answerAgain();
  }
  const beforeClassification = await stored(page);
  await mapExercise(page, data.latest.id, blockId, { ...originalScope, exerciseId: 'bench_press' }); saved = await stored(page);
  assertActualRecordsUnchanged(beforeClassification, saved);
  assert.equal(Object.hasOwn(currentMovement(saved), 'coachingAnswer'), false, 'a different exercise classification invalidates the old intention question');
  await mapExercise(page, data.latest.id, blockId, originalScope); await answerAgain();
  const beforeConfirmation = await stored(page), confirmed = currentMovement(beforeConfirmation).coachingAnswer;
  await mapExercise(page, data.latest.id, blockId, originalScope); saved = await stored(page);
  assertActualRecordsUnchanged(beforeConfirmation, saved);
  assert.deepEqual(currentMovement(saved).coachingAnswer, confirmed, 'confirming unchanged effective exercise, equipment and units retains a valid answer');
  const beforeRir = saved;
  await editField(page, data.latest.id, '0-1-rir', '1'); saved = await stored(page);
  expectOnlyRecordFields(beforeRir, saved, data.latest.id, row => { row.exercises[0].sets[1].rir = 1; });
  assert.deepEqual(currentMovement(saved).coachingAnswer, confirmed, 'a one-set RIR addition refines effort without changing the answered load-change context');
  assert.deepEqual(S.parseBackup(S.exportBackup(saved)).state, saved);
  await page.reload(); await coach(page); await selectBlock(page, blockId);
  assert.equal(await page.locator('#coachReviewDetail [data-action="training-coaching-answer"][data-answer="planned"]').getAttribute('aria-pressed'), 'true');
}

async function scopeAutoInvalidation(page, data) {
  const kind = 'question-scope-auto', blockId = `${kind}-movement`, beforeId = `synthetic-before-${kind}`;
  const scope = { exerciseId: 'overhead_press', equipmentKey: '합성 헬스장 / 공용 바벨 3', loadConvention: 'total', loadRole: 'external' };
  await selectBlock(page, blockId); await coachingAnswer(page, 'load-change', 'planned');
  const before = await stored(page), previous = before.training.records.find(row => row.id === beforeId);
  assert.ok(previous.exercises[0].coachingAnswer && before.training.records.every(row => row.exercises[1].coachingAnswer));
  await mapExercise(page, data.latest.id, blockId, scope);
  let saved = await stored(page);
  assertActualRecordsUnchanged(before, saved);
  for (const row of saved.training.records) {
    assert.equal(Object.hasOwn(row.exercises[0], 'coachingAnswer'), false,
      'an automatically changed older effective scope invalidates its own old answer as well as the selected workout answer');
    assert.deepEqual(row.exercises[1].coachingAnswer, before.training.records.find(old => old.id === row.id).exercises[1].coachingAnswer,
      'unrelated movements keep their own unchanged confirmed answers');
  }
  const old = saved.training.records.find(row => row.id === beforeId).exercises[0];
  assert.equal(old.exerciseId, null); assert.equal(old.equipmentKey, null); assert.equal(old.loadConvention, 'as-recorded'); assert.equal(old.loadRole, 'unknown');
  const automatic = await page.evaluate(({ recordId, blockId, key }) => {
    const state = JSON.parse(localStorage.getItem(key)), exercise = state.training.records.find(row => row.id === recordId).exercises.find(row => row.id === blockId);
    const result = window.MacroTraining.describeExercise(exercise, state.training.mappings);
    return { exerciseId: result.resolved.id, equipmentKey: result.equipmentKey, loadConvention: result.loadConvention, loadRole: result.loadRole };
  }, { recordId: beforeId, blockId: old.id, key: S.STORAGE_KEY });
  assert.deepEqual(automatic, scope, 'the prior answer is cleared for an actual inherited scope change, not merely for an unrelated mapping edit');
  await coach(page); await selectBlock(page, blockId); await coachingAnswer(page, 'load-change', 'planned');
  const beforeSame = await stored(page), answer = beforeSame.training.records.find(row => row.id === data.latest.id).exercises[0].coachingAnswer;
  await mapExercise(page, data.latest.id, blockId, scope); saved = await stored(page);
  assertActualRecordsUnchanged(beforeSame, saved);
  assert.deepEqual(saved.training.records.find(row => row.id === data.latest.id).exercises[0].coachingAnswer, answer);
  assert.deepEqual(saved.training.records.find(row => row.id === beforeId), beforeSame.training.records.find(row => row.id === beforeId),
    'reconfirming the same mapping does not rewrite the earlier original record');
}

async function localCoordination(page, data, width, artifacts) {
  const originalBytes = await storedText(page);
  await selectBlock(page, 'local-bench', true);
  const bench = await movementInterpretation(page, 'local-bench');
  assertActualCoachingFacts(data, 'local-bench', bench);
  await assertRenderedActualSets(page, data.latest.exercises[0]);
  assert.equal(bench.nextAction.kind, 'restore-tail');
  assert.ok((await nextTrial(page)).includes(bench.nextAction.body));
  assert.ok(bench.nextAction.focusSetIds.includes('local-bench-work-2') && bench.nextAction.focusSetIds.includes('local-bench-work-3'),
    'the bench priority is its actual reduced later sets, not an invented whole-session fatigue verdict');

  await selectBlock(page, 'local-row', true);
  const row = await movementInterpretation(page, 'local-row'), rowTrial = await nextTrial(page);
  assertActualCoachingFacts(data, 'local-row', row);
  await assertRenderedActualSets(page, data.latest.exercises[1]);
  assert.ok(['progression-option', 'reps-option', 'load-option', 'repeat'].includes(row.nextAction.kind));
  assert.ok(rowTrial.includes(row.nextAction.body));
  assert.match(rowTrial, /11회|1회 더/, 'independent stable rowing keeps its own one-set progression choice despite reduced bench repetitions');
  assert.ok(!row.coaching.progressionCandidate, 'a summary emphasis on bench restoration cannot defer an independent back movement');
  assert.equal(await page.locator('#coachReviewDetail .coach-review-alternative').count(), 0);
  assert.doesNotMatch(rowTrial, /벤치.*(?:먼저|미루)|달라진 구간을 먼저/,
    'secondary shoulder overlap alone cannot suppress an independent primary-back movement');
  await layout(page, width);
  await screenshot(page, path.join(artifacts, `coach-actions-local-row-${width}.png`), '#coachReviewDetail');

  await selectBlock(page, 'local-press', true);
  const press = await movementInterpretation(page, 'local-press'), primary = await nextTrial(page);
  assertActualCoachingFacts(data, 'local-press', press);
  await assertRenderedActualSets(page, data.latest.exercises[2]);
  assert.equal(press.nextAction.kind, 'maintain-coordinated-work');
  assert.ok(press.coaching.progressionCandidate, 'stable chest pressing retains a later choice while the overlapping bench tail is the current priority');
  assert.ok(primary.includes(press.nextAction.body)); assert.match(primary, /벤치/);
  assert.ok(!primary.includes(press.coaching.progressionCandidate.body), 'a related deferred choice is not a second simultaneous primary instruction');
  const alternative = page.locator('#coachReviewDetail .coach-review-alternative');
  assert.equal(await alternative.count(), 1); assert.equal(await alternative.evaluate(element => element.open), false);
  await alternative.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await alternative.evaluate(element => element.open), true);
  assert.ok((await alternative.innerText()).includes(press.coaching.progressionCandidate.body));
  assert.match(press.coaching.progressionCandidate.body, /11회|1회 더/);
  assert.equal(await nextTrial(page), primary, 'opening the related progression alternative cannot replace the current coordinated action');
  await layout(page, width);
  await screenshot(page, path.join(artifacts, `coach-actions-local-chest-alternative-${width}.png`), '#coachReviewDetail');
  await alternative.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await alternative.evaluate(element => element.open), false);
  assert.equal(await storedText(page), originalBytes, 'choosing, reading or folding any local recommendation never changes the actual workout or intention');
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
  const beforeReference = await storedText(page);
  await openTrainingRecord(page, data.latest.id);
  await page.locator(`[data-action="training-reference"][data-record="${data.latest.id}"][data-exercise="pain-bench"]`).click();
  await page.locator('#entryForm button[type="submit"]').click();
  const referenceMain = page.locator('#startingReferenceResult .reference-main');
  assert.match(await referenceMain.innerText(), /55(?:\.0)?kg\s*×\s*8회/);
  assert.match(await referenceMain.locator('.notice').innerText(), /통증|중단|평가/,
    'actual stop-pain remains a primary reference warning rather than an optional hidden limit');
  assert.doesNotMatch(await referenceMain.innerText(), /여유가 남으면.*더 시도|반복을 재현해/,
    'an observed load is not also a progression instruction when stop-pain is recorded');
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click(); await coach(page);
  assert.equal(await storedText(page), beforeReference, 'pain-aware reference lookup remains read-only');
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

async function timedEvidence(page, data, kind, width, artifacts) {
  const untouched = await storedText(page);
  if (kind === 'timed-only') {
    const counts = await page.locator('.coach-review-session-summary').innerText();
    assert.match(counts, /3종목.*시간 기록 3종목/);
    assert.doesNotMatch(counts, /일반 0세트|준비 0세트/);
  }
  for (const exercise of data.latest.exercises) {
    await selectBlock(page, exercise.id, true);
    const comparison = page.locator('#coachReviewDetail .coach-review-comparison');
    await comparison.locator('summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await comparison.evaluate(element => element.open), true);
    const evidence = await comparison.innerText();
    assert.doesNotMatch(evidence, /준비·별도 표기와 숫자 없는|다음 일반 세트가 기록되면/,
      'evidence never invents absent sets or makes additional strength logging the condition for usable advice');
    if (exercise.durationMinutes !== null) {
      assert.ok(evidence.includes(currentDate), 'minutes stay attached to their original date');
      assert.ok(evidence.includes(exercise.durationMinutes + '분'), 'decimal minutes keep their actual unit and value');
    }
    if (!exercise.sets.length) {
      assert.equal(await comparison.locator('.form-help').count(), 0, 'time and name-only evidence has no strength measurement footer');
      assert.doesNotMatch(evidence, /근력·근성장|일반 세트|준비 세트|1RM 추정/);
      if (exercise.durationMinutes !== null) {
        assert.match(evidence, /기록한 운동 시간/);
        assert.ok((await nextTrial(page)).includes(exercise.durationMinutes + '분'));
        assert.equal(evidence.split(exercise.durationMinutes + '분').length - 1, 1, 'actual minutes appear once in time-only evidence');
      }
    } else {
      await assertRenderedActualSets(page, exercise);
      assert.equal(await comparison.locator('.form-help').count(), exercise.id === 'timed-mixed' ? 1 : 0);
      if (exercise.id === 'timed-mixed') assert.match(evidence, /40kg.*8회/);
      if (exercise.id === 'timed-marked') assert.match(evidence, /2개 세트/);
    }
    await layout(page, width);
    await screenshot(page, path.join(artifacts, `coach-actions-${kind}-${exercise.id}-${width}.png`), '#coachReviewDetail');
  }
  assert.equal(await storedText(page), untouched, 'reading time, marked and mixed evidence never changes source records');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    const allKinds = ['first', 'drop', 'return', 'pain', 'sets', 'low-rep', 'top-backoff', 'unknown-context', 'test', 'capacity-transfer', 'capacity-recurrence', 'capacity-plateau', 'question-load-change', 'question-rep-target', 'question-scope-invalidation', 'question-scope-auto', 'local-coordination', 'timed-only', 'timed-evidence'];
    const kinds = process.env.COACH_ACTION_KINDS ? process.env.COACH_ACTION_KINDS.split(',') : allKinds;
    assert.ok(kinds.length && kinds.every(kind => allKinds.includes(kind)), 'targeted coach scenarios must name supported fixtures');
    for (const width of [390, 1280]) for (const kind of kinds) {
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
        else if (kind === 'sets') await selectedSetFeedback(page, data);
        else if (kind === 'low-rep') await ordinaryLowRep(page, data);
        else if (kind === 'top-backoff') await topBackoff(page, data, width, artifacts);
        else if (kind === 'unknown-context') await unknownContext(page, data);
        else if (kind === 'test') await explicitTest(page, data);
        else if (kind === 'question-scope-invalidation') await scopeInvalidation(page, data, width, artifacts);
        else if (kind === 'question-scope-auto') await scopeAutoInvalidation(page, data);
        else if (kind === 'local-coordination') await localCoordination(page, data, width, artifacts);
        else if (kind.startsWith('timed-')) await timedEvidence(page, data, kind, width, artifacts);
        else if (kind.startsWith('question-')) await clarificationLoop(page, data, kind, width, artifacts);
        else await performedCapacity(page, data, kind, width, artifacts);
        await coach(page); await layout(page, width);
        await screenshot(page, path.join(artifacts, `coach-actions-${kind}-final-${width}.png`));
        assert.deepEqual(errors, [], 'coaching interactions have no page errors');
        assert.deepEqual(requests, [], 'local actionable coaching does not need AI, image reads or a network connection');
      } catch (error) {
        await page?.screenshot({ path: path.join(artifacts, `coach-actions-failure-${kind}-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    console.log(`Coach actions browser: ${kinds.length} scenarios at 390/1280px passed. Whole-set contextual assessment, exact actual/model source separation, primary/supporting actions and folded alternatives, local clarification with backup/reload/save failure, numeric/reuse/effective-scope invalidation, unchanged confirmation and RIR preservation, cross-date/block collision rejection, pain safety, keyboard and offline operation. Synthetic local records only.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
