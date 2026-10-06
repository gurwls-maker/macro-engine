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

const today = I.dateKey(), url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'running', goal: 'performance', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };
const sports = ['running', 'cycling', 'swimming', 'team', 'mixed'];
function day(date) {
  return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0,
    meals: [], sessions: [], complete: false, planSnapshot: null };
}
function fixture(kind) {
  const state = S.createEmpty(); state.trackingScope = 'training';
  if (kind !== 'quick') {
    state.profile = { ...profile, sport: sports.includes(kind) ? kind : 'mixed' };
    for (let offset = 1; offset <= 31; offset++) {
      const date = I.shiftDate(today, -offset), value = day(date);
      if (offset % 7 !== 0) value.sessions.push({ id: `synthetic-activity-${offset}`, sport: offset > 20 ? 'strength' : state.profile.sport,
        durationMin: offset % 5 === 0 ? 75 : 35, intensity: offset % 5 === 0 ? 'hard' : 'easy' });
      state.days[date] = value;
    }
    const frozen = state.days[I.shiftDate(today, -31)];
    frozen.weightKg = 65; frozen.meals = [{ id: 'synthetic-frozen-meal', name: '합성 완료 식사', protein: 110, carbs: 250, fat: 70, alcoholG: 0, otherKcal: 0 }];
    frozen.planSnapshot = N.calculatePlan(state.profile, frozen, []); frozen.planSnapshot.context.goal = state.profile.goal; frozen.complete = true;
  }
  if (['multi', 'scopes', 'training-time', 'training-mixed', 'query'].includes(kind)) {
    state.profile.bodyFatPct = 24; state.profile.bodyFatDate = I.shiftDate(today, -4); state.profile.bodyFatMethod = 'bia';
    const current = day(today); current.weightKg = 64.5; current.bodyFatPct = 24; current.skeletalMuscleKg = 27; current.bodyFatMethod = 'bia';
    current.meals = [{ id: 'synthetic-current-meal', name: '합성 오늘 식사', protein: 35, carbs: 80, fat: 15, alcoholG: 0, otherKcal: 0 }];
    current.sessions = [
      { id: 'synthetic-today-run', sport: 'running', durationMin: 35, intensity: 'easy', details: { label: '아침 조깅', distanceM: 5000, movingMin: 30, environment: 'outdoor', conditions: 'usual' } },
      { id: 'synthetic-today-bike', sport: 'cycling', durationMin: 60, intensity: 'hard', details: { label: '실내 사이클', distanceM: 20000, avgPowerW: 220, equipmentKey: '기구 A', environment: 'indoor' } },
      { id: 'synthetic-today-swim', sport: 'swimming', durationMin: 40, intensity: 'moderate', details: { label: '자유형', distanceM: 1250, stroke: '자유형', poolLengthM: 25, environment: 'pool' } },
      { id: 'synthetic-today-team', sport: 'team', durationMin: 90, intensity: 'hard', details: { label: '축구 경기', format: 'match' } },
      { id: 'synthetic-today-hybrid', sport: 'mixed', durationMin: 45, intensity: 'moderate', details: { label: 'HYROX 혼합', format: 'hybrid', segments: [
        { id: 'synthetic-run-segment', label: '달리기', kind: 'run', distanceM: 1000, durationMin: 6 },
        { id: 'synthetic-sled-segment', label: '썰매 밀기', kind: 'strength', loadKg: 100, distanceM: 50, durationMin: 5 },
        { id: 'synthetic-unknown-segment', label: '추가 운동' }
      ] } }
    ]; state.days[today] = current;
  }
  if (kind === 'training-mixed') {
    state.training = TS.createEmpty();
    state.training.records = [I.shiftDate(today, -3), today].map((date, index) => ({ id: `synthetic-strength-${index}`, date, time: '18:00', label: '합성 근력 보완', durationMinutes: 90,
      reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
      source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: null, pain: 'none', sequence: { order: 'listed', structure: 'straight' },
      exercises: [{ id: `synthetic-bench-${index}`, exerciseId: 'bench_press', rawName: '바벨 벤치 프레스', equipmentKey: '합성 벤치 A', loadConvention: 'total', loadRole: 'external',
        notes: '', durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
        sets: [8, 8, 7].map((reps, setIndex) => ({ id: `synthetic-bench-${index}-set-${setIndex}`, loadKg: 40, reps, rir: null, marker: null })) }]
    }));
    state.training = TS.validate(state.training);
  }
  if (kind === 'query') {
    state.training = TS.createEmpty();
    state.training.messages.push({ id: 'synthetic-sport-question', role: 'user', text: '최근 4주 달리기와 수영 기록 비교', createdAt: `${today}T01:00:00.000Z`,
      source: 'codex', replyTo: null, contextDigest: null, status: 'answered' });
  }
  if (kind === 'precise') {
    const current = day(today);
    current.sessions = [
      { id: 'synthetic-precise-bike', sport: 'cycling', durationMin: 45.25, intensity: 'moderate', details: { effortRpe: 6.2, avgHeartRateBpm: 145.4, avgPowerW: 185.75, distanceM: 20125, movingMin: 43.333 } },
      { id: 'synthetic-precise-swim', sport: 'swimming', durationMin: 30.5, intensity: 'easy', details: { stroke: '자유형', poolLengthM: 25.5, distanceM: 1250 } }
    ];
    current.coachCheckin = { energy: null, hunger: null, sleep: null, trainingPlan: null, mealConstraint: null, performance: null, sleepHours: 7.55 };
    state.days[today] = current;
  }
  if (['purpose', 'latest-purpose', 'frozen-purpose'].includes(kind)) {
    state.profile.sport = 'running';
    for (const value of Object.values(state.days)) value.sessions = [];
    const sourceDate = kind === 'purpose' ? today : I.shiftDate(today, -1);
    const previousDate = I.shiftDate(sourceDate, -5), previous = day(previousDate), current = day(sourceDate);
    previous.sessions = [{ id: 'synthetic-purpose-previous', sport: 'running', durationMin: 60, intensity: 'moderate', details: { label: '같은 코스', distanceM: 10000 } }];
    current.sessions = [{ id: 'synthetic-purpose-collision', sport: 'running', durationMin: 30, intensity: 'moderate', details: { label: '같은 코스', distanceM: 5000, effortRpe: 6, notes: '합성 원문 메모' } }];
    if (kind === 'frozen-purpose') {
      current.meals = [{ id: 'synthetic-frozen-purpose-meal', name: '합성 완료 식사', protein: 35, carbs: 80, fat: 15, alcoholG: 0, otherKcal: 0 }];
      current.planSnapshot = N.calculatePlan(state.profile, current, []); current.complete = true;
    }
    state.days[previousDate] = previous; state.days[sourceDate] = current;
  }
  return S.validateState(state);
}
async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), S.STORAGE_KEY); }
async function bytes(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function openSession(page) {
  const button = page.locator('.daily-quick-actions [data-action="session-add"]');
  await button.focus(); await page.keyboard.press('Enter');
  await page.locator('#entryDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#activityDetails').evaluate(element => element.open), false,
    'detailed sports metrics never obstruct the default fast record');
}
async function details(page) {
  await page.locator('#activityDetails > summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#activityDetails').evaluate(element => element.open), true);
}
async function fill(page, name, value) {
  const element = page.locator(`#entryForm [name="${name}"]`);
  if (await element.evaluate(element => element.tagName) === 'SELECT') await element.selectOption(value);
  else await element.fill(String(value));
}
async function submit(page) {
  await page.locator('#entryForm [type="submit"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
async function layout(page, width) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('dialog[open]') || document.querySelector('[data-page]:not([hidden])');
    return { width: document.documentElement.scrollWidth, clipped: [...root.querySelectorAll('input,select,button,summary,h2,h3,h4,p')]
      .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 2)
      .map(element => element.textContent.trim()) };
  });
  assert.ok(result.width <= width + 1, `sports UI ${width}: horizontal overflow`);
  assert.deepEqual(result.clipped, [], `sports UI ${width}: clipped controls or advice`);
}
function unchangedHistory(initial, saved) {
  for (const [date, value] of Object.entries(initial.days)) assert.deepEqual(saved.days[date], value,
    'new sport records preserve all prior actual activity and completed body/nutrition targets');
  assert.deepEqual(saved.profile, initial.profile); assert.deepEqual(saved.training, initial.training);
}
function unchangedEnergy(state, current) {
  if (!state.profile) return;
  const plain = { ...current, sessions: current.sessions.map(session => ({ id: session.id, sport: session.sport, durationMin: session.durationMin, intensity: session.intensity,
    ...(session.cardio ? { cardio: session.cardio } : {}) })) };
  const actual = N.calculatePlan(state.profile, current, []), basic = N.calculatePlan(state.profile, plain, []);
  assert.deepEqual(actual.energy, basic.energy, 'distance, power, observed effort and segment times are not silently counted as additional exercise calories');
  assert.deepEqual(actual.macros, basic.macros);
}
async function localReview(page, width, artifacts, filename) {
  const before = await bytes(page);
  await page.locator('[data-view="coach"]').click();
  const review = page.locator('#activityWorkoutReview');
  assert.equal(await review.count(), 1, 'actual time records always have a local sport-specific coaching surface');
  {
    assert.equal(await review.isVisible(), true);
    assert.ok((await review.innerText()).length > 40);
    assert.doesNotMatch(await review.locator('#activityReviewDetail').innerText(), /1RM|e1RM|남길 수 있었던 반복|최대 중량/,
      'time/distance sports do not inherit bodybuilding capacity or RIR requirements');
    const selector = page.locator('#activityReviewSelect');
    const options = await selector.locator('option').evaluateAll(elements => elements.map(element => element.value));
    const expected = await page.evaluate(({ key, date }) => {
      const value = window.MacroActivity.build(JSON.parse(localStorage.getItem(key)), date);
      return (value.current.length ? value.current : value.latest).map(row => row.id);
    }, { key: S.STORAGE_KEY, date: today });
    assert.deepEqual(options, expected, 'every actual current or latest-source session is selectable');
    for (const id of options) {
      await selector.focus(); await selector.selectOption(id);
      assert.equal(await page.locator('#activityReviewDetail').evaluate(element => document.activeElement === element), true);
      await layout(page, width);
    }
    await review.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(artifacts, filename) });
  }
  assert.equal(await bytes(page), before, 'reading or selecting sports coaching never rewrites a goal, actual workout or food record');
  await page.locator('[data-view="today"]').click();
}
async function quick(page, initial) {
  await openSession(page); await fill(page, 'sport', 'running'); await fill(page, 'durationMin', 35); await submit(page);
  let saved = await stored(page), session = saved.days[today].sessions[0];
  assert.deepEqual(Object.keys(session).sort(), ['durationMin', 'id', 'intensity', 'sport']);
  assert.equal(session.durationMin, 35); assert.equal(session.sport, 'running'); assert.equal(saved.profile, null);
  unchangedHistory(initial, saved);
  const before = await bytes(page);
  await page.locator('.movement-section [data-action="session-edit"]').click();
  await fill(page, 'durationMin', 36);
  await page.evaluate(key => {
    window.syntheticActivitySetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('합성 저장 실패', 'QuotaExceededError');
      return window.syntheticActivitySetItem.call(this, name, value);
    };
  }, S.STORAGE_KEY);
  await page.locator('#entryForm [type="submit"]').click();
  assert.equal(await bytes(page), before); assert.equal(await page.locator('#entryDialog').evaluate(element => element.open), true);
  assert.equal(await page.locator('#entryErrors').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.syntheticActivitySetItem; delete window.syntheticActivitySetItem; });
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
  saved = await stored(page); assert.equal(saved.days[today].sessions[0].durationMin, 35);
}
async function detailedSport(page, initial, sport, width, artifacts) {
  await openSession(page); await fill(page, 'sport', sport); await fill(page, 'durationMin', sport === 'team' ? 80 : 45); await details(page);
  const label = { running: '합성 하천 조깅', cycling: '합성 실내 라이딩', swimming: '합성 자유형 수영', team: '합성 축구 경기', mixed: '합성 HYROX 전환' }[sport];
  await fill(page, 'activity-label', label); await fill(page, 'activity-format', sport === 'team' ? 'match' : sport === 'mixed' ? 'hybrid' : 'continuous');
  await fill(page, 'activity-intent', 'regular'); await fill(page, 'activity-effortRpe', 6);
  await fill(page, 'activity-routeKey', '합성 코스 A'); await fill(page, 'activity-conditions', 'usual');
  await fill(page, 'activity-environment', sport === 'swimming' ? 'pool' : sport === 'cycling' ? 'indoor' : 'outdoor');
  await fill(page, 'activity-notes', '합성 실제 원문 메모');
  if (sport !== 'team' && sport !== 'mixed') {
    await fill(page, 'activity-distance', sport === 'swimming' ? 1250 : sport === 'cycling' ? 20 : 5);
    await fill(page, 'activity-movingMin', 30); await fill(page, 'activity-avgHeartRateBpm', 150);
  }
  if (sport === 'cycling') await fill(page, 'activity-avgPowerW', 180);
  if (sport === 'swimming') { await fill(page, 'activity-stroke', '자유형'); await fill(page, 'activity-poolLengthM', 25); }
  if (sport === 'mixed') {
    await page.locator('[data-action="activity-segment-add"]').click();
    await fill(page, 'segment-0-label', '달리기 1km'); await fill(page, 'segment-0-kind', 'run');
    await fill(page, 'segment-0-durationMin', 6); await fill(page, 'segment-0-distanceM', 1000);
    assert.equal(await page.locator('[name="segment-0-loadKg"]').isVisible(), false);
    await page.locator('[data-action="activity-segment-add"]').click();
    await fill(page, 'segment-1-label', '썰매 밀기'); await fill(page, 'segment-1-kind', 'strength');
    await fill(page, 'segment-1-durationMin', 5); await fill(page, 'segment-1-distanceM', 50); await fill(page, 'segment-1-loadKg', 100);
    await page.locator('[data-action="activity-segment-add"]').click();
    await fill(page, 'segment-2-label', '기억나는 추가 구간');
    assert.equal(await page.locator('[name="segment-2-reps"]').isVisible(), false, 'unknown segment details do not force repetitions or load');
    await page.locator('[name="activity-sequenceConfirmed"]').check();
  }
  await layout(page, width); await page.screenshot({ path: path.join(artifacts, `activity-${sport}-form-${width}.png`) });
  await submit(page);
  const saved = await stored(page), current = saved.days[today], session = current.sessions[0];
  unchangedHistory(initial, saved); unchangedEnergy(saved, current);
  assert.equal(session.details.label, label); assert.equal(session.details.effortRpe, 6);
  assert.equal(session.details.format, sport === 'team' ? 'match' : sport === 'mixed' ? 'hybrid' : 'continuous');
  if (sport === 'running') assert.equal(session.details.distanceM, 5000);
  if (sport === 'cycling') { assert.equal(session.details.distanceM, 20000); assert.equal(session.details.avgPowerW, 180); }
  if (sport === 'swimming') { assert.equal(session.details.distanceM, 1250); assert.equal(session.details.poolLengthM, 25); }
  if (sport === 'team') assert.ok(!Object.hasOwn(session.details, 'distanceM'), 'a match without GPS remains a usable record');
  if (sport === 'mixed') {
    assert.equal(session.details.segments.length, 3); assert.equal(session.details.sequenceConfirmed, true);
    assert.ok(!Object.hasOwn(session.details.segments[1], 'reps'), 'unknown repetitions are not fabricated as zero or one');
    assert.deepEqual(Object.keys(session.details.segments[2]).sort(), ['id', 'label']);
  }
  assert.deepEqual(S.parseBackup(S.exportBackup(saved)).state, saved);
  await localReview(page, width, artifacts, `activity-${sport}-coach-${width}.png`);
  const beforeReload = await bytes(page); await page.reload(); assert.equal(await bytes(page), beforeReload);
  await page.locator('.movement-section [data-action="session-preset-save"]').click(); await submit(page);
  const withPreset = await stored(page), preset = withPreset.sessionPresets[0];
  assert.equal(preset.session.details.label, label);
  for (const key of ['distanceM', 'movingMin', 'effortRpe', 'avgPowerW', 'avgHeartRateBpm', 'intent', 'conditions', 'notes', 'segments', 'sequenceConfirmed'])
    assert.ok(!Object.hasOwn(preset.session.details, key), `a new workout cannot inherit previous actual ${key}`);
  await page.locator('.movement-section [data-action="session-presets"]').click();
  await page.locator('[data-action="session-preset-use"]').click(); await details(page);
  assert.equal(await page.locator('[name="activity-effortRpe"]').inputValue(), '');
  assert.equal(await page.locator('[name="activity-intent"]').inputValue(), '');
  assert.equal(await page.locator('[name="activity-distance"]').inputValue(), '');
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click();
  assert.equal((await stored(page)).days[today].sessions.length, 1, 'opening a reusable draft does not record an unperformed workout');
}
async function multipleSports(page, initial, width, artifacts) {
  await localReview(page, width, artifacts, `activity-multiple-coach-${width}.png`);
  await page.locator('[data-view="coach"]').click();
  const selector = page.locator('#activityReviewSelect'); assert.equal(await selector.locator('option').count(), 5);
  await selector.selectOption('synthetic-today-swim');
  assert.match(await page.locator('.activity-conditions').innerText(), /자유형/);
  assert.match(await page.locator('.activity-conditions').innerText(), /25m 풀/);
  assert.match(await page.locator('.activity-actual').innerText(), /1,250m|1250m/);
  await selector.selectOption('synthetic-today-hybrid');
  const composition = page.locator('.activity-composition');
  assert.match(await composition.innerText(), /달리기.*6.*1,?000m/s);
  assert.match(await composition.innerText(), /썰매 밀기.*5.*50m.*100/s);
  assert.match(await composition.locator('li').last().innerText(), /^추가 운동$/);
  assert.equal(await composition.locator('h4').innerText(), '기록한 구간', 'unconfirmed source order is not claimed as performed sequence');
  assert.deepEqual(await stored(page), initial);
  await layout(page, width); await page.locator('[data-view="today"]').click();
}
async function scopes(page, initial, width, artifacts) {
  const rawDay = initial.days[today], frozen = initial.days[I.shiftDate(today, -31)];
  for (const scope of ['nutrition', 'both', 'training']) {
    await page.locator('#trackingScope').selectOption(scope);
    assert.equal(await page.locator('.daily-quick-actions [data-action="session-add"]').count(), scope === 'nutrition' ? 0 : 1);
    await page.locator('[data-view="coach"]').click();
    assert.equal(await page.locator('#activityWorkoutReview').count(), scope === 'nutrition' ? 0 : 1);
    assert.deepEqual((await stored(page)).days[today], rawDay); assert.deepEqual((await stored(page)).days[I.shiftDate(today, -31)], frozen);
    await layout(page, width); await page.locator('[data-view="today"]').click();
  }
  await localReview(page, width, artifacts, `activity-scope-coach-${width}.png`);
}
async function preciseEdit(page, initial) {
  for (const id of initial.days[today].sessions.map(row => row.id)) {
    await page.locator(`.movement-section [data-action="session-edit"][data-id="${id}"]`).click();
    await details(page); assert.equal(await page.locator('#entryForm').evaluate(form => form.checkValidity()), true);
    await submit(page); assert.deepEqual((await stored(page)).days[today].sessions, initial.days[today].sessions,
      'an unchanged valid imported decimal observation survives ordinary editing');
  }
  await page.locator('.daily-condition [data-action="coach-checkin"]').click();
  await page.locator('#entryForm .checkin-more').last().locator('summary').click();
  assert.equal(await page.locator('[name="sleepHours"]').inputValue(), '7.55'); await submit(page);
  assert.deepEqual((await stored(page)).days[today].coachCheckin, initial.days[today].coachCheckin);
}
async function purposeAnswer(page, initial, kind, width, artifacts) {
  const sourceDate = kind === 'purpose' ? today : I.shiftDate(today, -1), id = 'synthetic-purpose-collision';
  await page.locator('[data-view="coach"]').click();
  assert.match(await page.locator('#activityWorkoutReview').innerText(), new RegExp(sourceDate));
  const buttons = page.locator('[data-action="activity-intent-answer"]');
  if (kind === 'frozen-purpose') { assert.equal(await buttons.count(), 0); assert.deepEqual(await stored(page), initial); return; }
  assert.equal(await buttons.count(), 4); assert.match(await page.locator('.activity-question h4').innerText(), new RegExp(sourceDate));
  const source = initial.days[sourceDate].sessions[0], before = await bytes(page);
  const deload = page.locator('[data-action="activity-intent-answer"][data-answer="deload"]');
  await deload.evaluate((button, date) => { button.dataset.date = date; button.dataset.id = 'synthetic-purpose-previous'; }, I.shiftDate(sourceDate, -5));
  await deload.click(); assert.equal(await bytes(page), before, 'a button aimed at another actual day and session cannot change that workout');
  await deload.evaluate((button, { date, id }) => { button.dataset.date = date; button.dataset.id = id; }, { date: sourceDate, id });
  await page.evaluate(key => {
    window.syntheticActivitySetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('합성 저장 실패', 'QuotaExceededError'); return window.syntheticActivitySetItem.call(this, name, value); };
  }, S.STORAGE_KEY);
  await page.locator('[data-action="activity-intent-answer"][data-answer="deload"]').click();
  assert.equal(await bytes(page), before); assert.equal(await page.locator('[data-answer="deload"]').getAttribute('aria-pressed'), 'false');
  await page.evaluate(() => { Storage.prototype.setItem = window.syntheticActivitySetItem; delete window.syntheticActivitySetItem; });
  const regular = page.locator('[data-action="activity-intent-answer"][data-answer="regular"]'); await regular.focus(); await page.keyboard.press('Enter');
  let saved = await stored(page); assert.equal(saved.days[sourceDate].sessions[0].details.intent, 'regular');
  assert.equal(await buttons.count(), 0, 'an explicit purpose is not repeatedly asked as if unknown');
  assert.match(await page.locator('.activity-question').innerText(), /평소처럼/);
  await page.locator('[data-action="activity-session-edit"]').click(); await details(page);
  await fill(page, 'activity-intent', ''); await submit(page);
  assert.equal(await buttons.count(), 4, 'the source purpose can be cleared and explicitly answered again');
  await page.locator('[data-action="activity-intent-answer"][data-answer="deload"]').click(); saved = await stored(page);
  assert.equal(saved.days[sourceDate].sessions[0].details.intent, 'deload');
  const { intent, ...unchangedDetails } = saved.days[sourceDate].sessions[0].details;
  assert.deepEqual({ ...saved.days[sourceDate].sessions[0], details: unchangedDetails }, source,
    'a direct coaching answer changes only the actual source session intent, never its observed numbers or notes');
  assert.deepEqual(saved.days[I.shiftDate(sourceDate, -5)], initial.days[I.shiftDate(sourceDate, -5)], 'the earlier source-reference day is untouched');
  assert.match(await page.locator('.activity-next').innerText(), /디로드/);
  assert.equal(await buttons.count(), 0); assert.deepEqual(S.parseBackup(S.exportBackup(saved)).state, saved);
  await page.reload(); await page.locator('[data-view="coach"]').click();
  assert.match(await page.locator('.activity-next').innerText(), /디로드/);
  assert.equal(await page.locator('#activityReviewSelect').inputValue(), id);
  await layout(page, width); await page.screenshot({ path: path.join(artifacts, `activity-purpose-${kind}-${width}.png`) });
  await page.locator('[data-view="today"]').click();
}
async function trainingSurface(page, initial, kind, width, artifacts) {
  const before = await bytes(page);
  await page.locator('[data-view="training"]').click();
  assert.equal(await page.locator('.training-toolbar [data-action="session-add"]').isVisible(), true);
  assert.match(await page.locator('.workout-index > .section-header').innerText(), /세트 일지/);
  assert.equal(await page.locator('.training-activity-index').count(), 1);
  await page.locator('.training-toolbar [data-action="session-add"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#entryDialog').evaluate(element => element.open), true);
  assert.equal(await page.locator('[name="durationMin"]').isVisible(), true);
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click(); assert.equal(await bytes(page), before);
  const tab = page.locator('[data-action="training-tab"][data-tab="analysis"]'); await tab.focus(); await page.keyboard.press('Enter');
  const surface = page.locator('#trainingActivityAnalysis'); assert.equal(await surface.isVisible(), true);
  const expectedMinutes = Object.values(initial.days).filter(day => day.date >= I.shiftDate(today, -27) && day.date <= today)
    .reduce((sum, day) => sum + day.sessions.reduce((part, session) => part + session.durationMin, 0), 0);
  const observedMinutes = await surface.locator('.training-summary > div').last().locator('strong').innerText();
  assert.equal(Number(observedMinutes.replace(/[^0-9.]/g, '')), expectedMinutes,
    'the monthly time total counts each parent activity once, not hybrid segments or a separate strength diary duration');
  if (kind === 'training-time') assert.doesNotMatch(await page.locator('#trainingContent').innerText(), /일반 세트|준비 세트|부위별 기록 세트|다음 연습 세트|RIR|1RM/,
    'a time-only athlete is not given zero-set bodybuilding analytics or strength-specific recovery requirements');
  else assert.equal(await page.getByRole('heading', { name: '세트 일지 분석', exact: true }).isVisible(), true,
    'mixed users retain actual sets analysis alongside activity analysis');
  const selector = page.locator('#trainingActivitySelect'); assert.equal(await selector.locator('option').count(), 5);
  for (const id of await selector.locator('option').evaluateAll(rows => rows.map(row => row.value))) {
    await selector.selectOption(id); assert.equal(await page.locator('#trainingActivityDetail').evaluate(element => document.activeElement === element), true);
    const expected = await page.evaluate(({ key, date, id }) => window.MacroActivity.build(JSON.parse(localStorage.getItem(key)), date).current.find(row => row.id === id), { key: S.STORAGE_KEY, date: today, id });
    assert.ok((await page.locator('#trainingActivityDetail').innerText()).includes(expected.action.body));
    assert.match(await page.locator('#trainingActivityTitle').innerText(), new RegExp(today)); await layout(page, width);
  }
  await page.screenshot({ path: path.join(artifacts, `training-activity-${kind}-${width}.png`) });
  await page.locator('#trainingDate').fill(I.shiftDate(today, -7)); await page.locator('#trainingDate').dispatchEvent('change');
  const sourceDate = I.shiftDate(today, -8);
  assert.match(await page.locator('#trainingActivityTitle').innerText(), new RegExp(sourceDate), 'an unrecorded day continues from the actual last source date without inventing today activity');
  assert.equal(await bytes(page), before);
  const program = page.locator('[data-action="training-tab"][data-tab="program"]'); await program.focus(); await page.keyboard.press('Enter');
  assert.match(await page.locator('.program-template > .section-header').innerText(), /근력 보완/);
  assert.match(await page.locator('.program-meta').innerText(), /근력.*회\/주/);
  assert.match(await page.locator('.program-template > .program-reason').first().innerText(), /본훈련 일정.*근력 보완/);
  await layout(page, width); await page.screenshot({ path: path.join(artifacts, `training-complement-${kind}-${width}.png`) });
  await page.locator('[data-action="program-settings"]').click();
  assert.match(await page.locator('#dialogTitle').innerText(), /근력운동/);
  assert.match(await page.locator('[name="daysPerWeek"]').locator('..').innerText(), /주당 근력운동/);
  await page.locator('#entryDialog [data-action="dialog-close"]').first().click(); assert.equal(await bytes(page), before);
  await page.locator('[data-view="today"]').click();
}
async function queryScope(page, initial, width, artifacts) {
  const before = await bytes(page); await page.locator('[data-view="coach"]').click();
  const scope = page.locator('.coach-query-scope'); await scope.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await scope.evaluate(element => element.open), true);
  const value = await page.evaluate(({ key, date }) => window.MacroCoachQuery.retrieve(JSON.parse(localStorage.getItem(key)), date, '최근 4주 달리기와 수영 기록 비교'), { key: S.STORAGE_KEY, date: today });
  assert.deepEqual(value.sports.sort(), ['running', 'swimming']);
  assert.match(await scope.innerText(), /달리기 · 수영/);
  const period = scope.locator('.query-period').first(), activity = value.periods[0].activities;
  assert.match(await period.innerText(), new RegExp(`시간·거리 기록 ${activity.sessionCount}회`));
  assert.match(await period.innerText(), new RegExp(`${activity.durationMin}분`));
  assert.match(await period.innerText(), /달리기.*5km.*수영.*1,250m/s);
  assert.doesNotMatch(await period.innerText(), /해당 운동 기록 0건|기간 내 해당 운동 기록 없음/,
    'sport retrieval labels actual time and distance records rather than reporting an empty strength diary as no workout');
  assert.equal(await bytes(page), before); assert.deepEqual(await stored(page), initial);
  await layout(page, width); await scope.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(artifacts, `activity-query-scope-${width}.png`) });
  await page.locator('[data-view="today"]').click();
}
async function unitAndValidation(page, initial) {
  await openSession(page); await fill(page, 'sport', 'running'); await details(page);
  await fill(page, 'activity-distance', 1.25); await fill(page, 'sport', 'swimming');
  assert.equal(await page.locator('[name="activity-distance"]').inputValue(), '1250');
  await fill(page, 'sport', 'running'); assert.equal(await page.locator('[name="activity-distance"]').inputValue(), '1.25');
  await fill(page, 'durationMin', 30); await fill(page, 'activity-movingMin', 31);
  const before = await bytes(page); await page.locator('#entryForm [type="submit"]').click();
  assert.equal(await bytes(page), before); assert.match(await page.locator('#entryErrors').innerText(), /전체 세션 시간/);
  await fill(page, 'activity-movingMin', 0); await submit(page);
  let saved = await stored(page); assert.equal(saved.days[today].sessions[0].details.movingMin, 0); unchangedHistory(initial, saved);
  await page.locator('.movement-section [data-action="session-edit"]').click(); await details(page);
  await page.locator('[data-action="activity-segment-add"]').click(); await fill(page, 'segment-0-label', '앞 구간'); await fill(page, 'segment-0-durationMin', 20);
  await page.locator('[data-action="activity-segment-add"]').click(); await fill(page, 'segment-1-label', '뒤 구간'); await fill(page, 'segment-1-durationMin', 20);
  const savedBytes = await bytes(page); await page.locator('#entryForm [type="submit"]').click();
  assert.equal(await bytes(page), savedBytes); assert.match(await page.locator('#entryErrors').innerText(), /구간 시간/);
  await page.locator('[data-action="activity-segment-remove"]').first().click();
  await page.locator('[data-action="activity-segment-remove"]').first().click(); await submit(page);
  saved = await stored(page); assert.ok(!saved.days[today].sessions[0].details.segments);
}
async function checkin(page, initial) {
  await page.locator('.daily-condition [data-action="coach-checkin"]').click();
  const more = page.locator('#entryForm .checkin-more').last(); await more.locator('summary').click();
  await fill(page, 'sleepHours', 0); await submit(page);
  let saved = await stored(page); assert.equal(saved.days[today].coachCheckin.sleepHours, 0);
  assert.ok(['energy', 'hunger', 'sleep', 'trainingPlan', 'mealConstraint', 'performance'].every(key => saved.days[today].coachCheckin[key] === null));
  unchangedHistory(initial, saved);
  await page.locator('.daily-condition [data-action="coach-checkin"]').click();
  await page.locator('#entryForm .checkin-more').last().locator('summary').click();
  await fill(page, 'sleepHours', 7.5); await fill(page, 'fatigue', 'high'); await fill(page, 'illness', 'recovering'); await fill(page, 'pain', 'mild'); await fill(page, 'interruptionReason', 'illness');
  await submit(page); saved = await stored(page);
  assert.deepEqual(saved.days[today].coachCheckin, { energy: null, hunger: null, sleep: null, trainingPlan: null, mealConstraint: null, performance: null,
    sleepHours: 7.5, fatigue: 'high', illness: 'recovering', pain: 'mild', interruptionReason: 'illness' });
  assert.match(await page.locator('.daily-condition').innerText(), /회복 중|피로가 큼/);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const kinds = process.env.ACTIVITY_UI_KINDS ? process.env.ACTIVITY_UI_KINDS.split(',') : ['quick', ...sports, 'units', 'checkin', 'multi', 'scopes', 'precise', 'purpose', 'latest-purpose', 'frozen-purpose', 'training-time', 'training-mixed', 'query'];
  try {
    for (const width of [390, 1280]) for (const kind of kinds) {
      const state = fixture(kind), context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(), errors = [], requests = [];
      try {
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: S.STORAGE_KEY, value: JSON.stringify(state) });
        page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(url); page.setDefaultTimeout(10000);
        assert.equal(await page.locator('.daily-quick-actions [data-action="session-add"]').isVisible(), true,
          'training-only users can directly record time/distance sports without a nutrition profile or strength diary');
        if (kind === 'quick') await quick(page, state);
        else if (kind === 'units') await unitAndValidation(page, state);
        else if (kind === 'checkin') await checkin(page, state);
        else if (kind === 'multi') await multipleSports(page, state, width, artifacts);
        else if (kind === 'scopes') await scopes(page, state, width, artifacts);
        else if (kind === 'precise') await preciseEdit(page, state);
        else if (['purpose', 'latest-purpose', 'frozen-purpose'].includes(kind)) await purposeAnswer(page, state, kind, width, artifacts);
        else if (kind.startsWith('training-')) await trainingSurface(page, state, kind, width, artifacts);
        else if (kind === 'query') await queryScope(page, state, width, artifacts);
        else await detailedSport(page, state, kind, width, artifacts);
        await layout(page, width);
        assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'sports recording and local coaching work offline without Codex');
      } catch (error) { await page.screenshot({ path: path.join(artifacts, `activity-ui-failure-${kind}-${width}.png`), fullPage: true }).catch(() => {}); throw error; }
      finally { await context.close(); }
    }
    console.log(`Activity UI: ${kinds.length} scenarios at 390/1280px passed. Fast no-profile recording, optional sport-specific details and hybrid segments, units, null/zero boundaries, condition checkins, backup/reload, immutable monthly history and energy, reusable context without copied effort, keyboard and offline operation.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
