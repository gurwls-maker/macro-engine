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

const today = I.dateKey(), date = I.shiftDate(today, -2), previousDate = I.shiftDate(today, -5);
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };
const benchKey = 'exercise:bench_press', legKey = 'exercise:leg_curl', rowKey = 'exercise:barbell_row';
const rawBenchKey = 'raw:개인프레스';
const diaryIds = ['latest-a-first', 'latest-leg', 'latest-a-last', 'latest-row', 'latest-lateral', 'latest-unknown'];
const initialPriority = ['latest-leg', 'latest-lateral', 'latest-a-first', 'latest-a-last', 'latest-row', 'latest-unknown'];

function exercise(id, exerciseId, rawName, equipmentKey, loadKg, reps, rir, extra = {}) {
  return { id, exerciseId, rawName, equipmentKey, loadConvention: 'total', loadRole: 'external', notes: '합성 원문 유지',
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
    sets: [{ id: `${id}-w`, loadKg: 15, reps: 5, rir: null, marker: 'W' }, { id: `${id}-set`, loadKg, reps, rir, marker: null }], ...extra };
}
function record(id, date, time, label, exercises) {
  return { id, date, time, label, durationMinutes: 50, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [`synthetic/${id}.png`], uncertainties: ['합성 원문 출처'], revision: null },
    notes: '합성 일지 메모 보존', effort: 6, pain: 'none', sequence: { order: 'listed', structure: 'straight' }, exercises };
}
function blocks(prefix) {
  const rows = [
    exercise(`${prefix}-a-first`, 'bench_press', '바벨 벤치 프레스', '합성 바벨 A', 80, 4, 1),
    exercise(`${prefix}-leg`, 'leg_curl', '레그 컬', '합성 레그컬', 15, 18, null),
    exercise(`${prefix}-a-last`, 'bench_press', '바벨 벤치 프레스', '합성 바벨 B', 34.5, 7, 3),
    exercise(`${prefix}-row`, 'barbell_row', '바벨 로우', '합성 로우 바벨', 55, 9, 2),
    exercise(`${prefix}-lateral`, 'dumbbell_lateral_raise', '덤벨 사이드 레터럴 레이즈', '합성 덤벨', 7.5, 16, 2, { loadConvention: 'per-side' }),
    exercise(`${prefix}-unknown`, null, '합성 미확인 운동', null, null, null, null, { loadConvention: 'as-recorded', loadRole: 'unknown' })
  ];
  rows[2].sets.push({ id: `${prefix}-a-last-d`, loadKg: 20, reps: 10, rir: null, marker: 'D' });
  return rows;
}
function fixture(kind = 'normal') {
  const state = S.createEmpty(); state.profile = kind === 'no-profile' ? null : profile; state.training = TS.createEmpty();
  state.training.settings.priorityMuscles = ['shoulders'];
  state.training.reviewPreferences = { order: 'priority', mainExerciseKeys: [legKey] };
  const previous = record('synthetic-review-previous', previousDate, '12:00', '합성 이전 운동', blocks('previous'));
  const early = record('synthetic-review-early', date, '07:00', '합성 같은 날 이른 운동', [exercise('early-pullup', 'pull_up', '풀업', '합성 풀업', 0, 8, null)]);
  const latest = record('synthetic-review-latest', date, '19:30', '합성 같은 날 늦은 A-B-A 운동', blocks('latest'));
  const future = record('synthetic-review-future', I.shiftDate(today, 2), '20:00', '합성 미래 운동', blocks('future'));
  if (kind === 'no-numbers') latest.exercises.forEach(row => { row.sets = [{ id: `${row.id}-unknown-set`, loadKg: null, reps: null, rir: null, marker: null }]; });
  if (kind === 'safety') latest.pain = 'stop';
  if (kind === 'legacy') { latest.source.kind = 'legacy-ocr'; latest.source.hash = 'd'.repeat(64); latest.exercises = []; }
  if (kind === 'grouped') { latest.sequence = { order: 'listed', structure: 'grouped' }; latest.exercises.forEach(row => { row.groupKey = 'superset'; }); }
  if (kind === 'unknown-order') {
    latest.sequence = previous.sequence = { order: 'unknown', structure: 'unknown' };
  }
  if (kind.startsWith('alias')) {
    latest.exercises[0].rawName = '개인프레스';
    state.training.reviewPreferences.mainExerciseKeys = [rawBenchKey, benchKey];
  }
  if (kind === 'marked') for (const row of [latest.exercises[2], previous.exercises[2]]) {
    row.sets = [{ id: `${row.id}-only-d`, loadKg: 34.5, reps: 7, rir: 3, marker: 'D' }];
  }
  state.training.records = [latest, future, previous, early];
  if (kind === 'unknown-order') {
    const older = record('synthetic-review-older', I.shiftDate(today, -10), '19:30', '합성 순서 없는 앞선 운동', blocks('older'));
    older.sequence = { order: 'unknown', structure: 'unknown' }; state.training.records.push(older);
  }
  const frozen = { date: previousDate, weightKg: 65, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0,
    meals: [{ id: 'synthetic-review-frozen-meal', name: '합성 완료 식사', protein: 90, carbs: 210, fat: 55, alcoholG: 0, otherKcal: 0 }],
    sessions: [], complete: false, planSnapshot: null };
  frozen.planSnapshot = N.calculatePlan(profile, frozen, []); frozen.complete = true; state.days[previousDate] = frozen;
  return { state: S.validateState(state), latest, early, previous };
}

async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function stored(page) { return JSON.parse(await storedText(page)); }
async function navigate(page, view) {
  await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function coach(page) { await navigate(page, 'coach'); await page.locator('#coachWorkoutReview').waitFor({ state: 'visible' }); }
async function ids(page) { return page.locator('#coachWorkoutReview .coach-review-row').evaluateAll(rows => rows.map(row => row.dataset.blockId)); }
async function assertIds(page, expected) {
  assert.deepEqual(await ids(page), expected, 'all workout blocks remain separate in the requested display order');
  assert.equal(new Set(await ids(page)).size, expected.length, 'repeated movements must not collapse block identities');
}
async function assertPrefsOnly(page, initial, preferences) {
  const saved = await stored(page), expected = JSON.parse(JSON.stringify(initial));
  expected.training.reviewPreferences = preferences; expected.updatedAt = saved.updatedAt;
  assert.deepEqual(saved, expected, 'review controls may change only preferences and the save timestamp');
  assert.deepEqual(saved.training.records, initial.training.records, 'review does not rewrite source, sets, RIR, sequence, raw names or exercise metadata');
  assert.deepEqual(saved.days, initial.days, 'review preferences do not change completed days or their nutrition snapshots');
}
async function order(page, mode) {
  await page.locator(`[data-action="coach-review-order"][data-order="${mode}"]`).click();
  assert.equal(await page.locator(`[data-action="coach-review-order"][data-order="${mode}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator(`[data-action="coach-review-order"][data-order="${mode === 'diary' ? 'priority' : 'diary'}"]`).getAttribute('aria-pressed'), 'false');
}
async function toggle(page, blockId) {
  await page.locator(`[data-action="coach-review-main"][data-block-id="${blockId}"]`).click();
}
async function selectBlock(page, blockId, equipment, keyboard = false) {
  const button = page.locator(`.coach-review-list [data-action="coach-review-select"][data-block-id="${blockId}"]`);
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
  await page.locator('#coachReviewDetail').waitFor({ state: 'visible' });
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.getAttribute('aria-controls'), 'coachReviewDetail');
  assert.equal(await page.locator('#coachWorkoutReview [data-action="coach-review-select"][aria-pressed="true"]').count(), 1);
  assert.match(await page.locator('#coachReviewDetail').innerText(), new RegExp(equipment));
  if (keyboard) assert.equal(await page.locator('#coachReviewDetail').evaluate(element => document.activeElement === element), true, 'keyboard selection moves focus to its named detail');
}
async function layout(page, width) {
  const value = await page.evaluate(() => {
    const review = document.getElementById('coachWorkoutReview'), bounds = review.getBoundingClientRect();
    const badText = [...review.querySelectorAll('button, h2, h3, p, strong, .coach-review-row')].filter(element => element.getClientRects().length).filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, text: element.textContent.trim() }));
    const rows = [...review.querySelectorAll('.coach-review-row')].map(row => {
      const rect = row.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, left: bounds.left, right: bounds.right, badText, rows };
  });
  assert.ok(value.document <= width + 1 && value.left >= -1 && value.right <= width + 1, `review ${width}: horizontal overflow ${JSON.stringify(value)}`);
  assert.deepEqual(value.badText, [], `review ${width}: overflowing labels`);
  for (let index = 1; index < value.rows.length; index++) assert.ok(value.rows[index].top >= value.rows[index - 1].bottom - 1, 'workout review rows do not overlap');
}
async function screenshotStart(page, locator, filename) {
  await page.locator(locator).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: filename });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [320, 390, 1280]) for (const kind of width === 320 ? ['normal', 'no-numbers', 'no-profile', 'safety', 'legacy', 'grouped', 'unknown-order', 'scope', 'alias', 'alias-management', 'marked'] : ['normal', 'no-numbers', 'no-profile', 'safety']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }); let page;
      try {
        const data = fixture(kind), untouched = JSON.stringify(data.state), errors = [], requests = [];
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: S.STORAGE_KEY, value: untouched });
        page = await context.newPage(); page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(url); await coach(page);
        assert.equal(await page.locator('#coachReviewSession').inputValue(), data.latest.id);
        const sessions = await page.locator('#coachReviewSession option').evaluateAll(options => options.map(option => ({ id: option.value, text: option.textContent })));
        for (const current of [data.latest, data.early, data.previous]) {
          const option = sessions.find(option => option.id === current.id); assert.ok(option, 'recent session appears as an explicit option');
          assert.ok(option.text.includes(current.date) && option.text.includes(current.time) && option.text.includes(current.label), 'session choices show date, time and label');
        }
        assert.equal(sessions.some(option => option.id === 'synthetic-review-future'), false, 'a future record cannot become the current review');
        if (kind === 'legacy') {
          await assertIds(page, []);
          for (const locator of ['.coach-review-session-summary', '.coach-training-context']) {
            const text = await page.locator(locator).innerText();
            assert.match(text, /종목별 세트 미확인/); assert.doesNotMatch(text, /0종목|0세트/, 'missing historical OCR detail is not zero exercise or zero sets');
          }
          assert.match(await page.locator('#coachWorkoutReview').innerText(), /종목별 세트가 없|세트 미확인/);
          assert.equal(await storedText(page), untouched, 'opening summary-only legacy OCR preserves exact original bytes');
          await layout(page, width);
          await screenshotStart(page, '#coachWorkoutReview', path.join(artifacts, `coach-review-list-${kind}-${width}.png`));
          assert.deepEqual(errors, []); assert.deepEqual(requests, []); continue;
        }
        await assertIds(page, kind.startsWith('alias') ? ['latest-a-first', 'latest-a-last', 'latest-lateral', 'latest-row', 'latest-leg', 'latest-unknown'] : initialPriority);
        await layout(page, width);
        assert.equal(await storedText(page), untouched, 'initial full-session review is read-only');
        await screenshotStart(page, '#coachWorkoutReview', path.join(artifacts, `coach-review-list-${kind}-${width}.png`));
        if (kind.startsWith('alias')) {
          for (const block of ['latest-a-first', 'latest-a-last']) {
            const pin = page.locator(`.coach-review-list [data-action="coach-review-main"][data-block-id="${block}"]`);
            assert.equal(await pin.getAttribute('aria-pressed'), 'true', 'a uniquely classified personal alias shares main designation across equipment and other raw labels');
            assert.equal(await pin.getAttribute('data-exercise-key'), rawBenchKey);
          }
          if (kind === 'alias-management') {
            await page.locator('.coach-review-mains summary').click();
            await page.locator(`.coach-review-mains [data-action="coach-review-main"][data-exercise-key="${benchKey}"]`).click();
            await assertPrefsOnly(page, data.state, { order: 'priority', mainExerciseKeys: [rawBenchKey] });
            assert.equal(await page.locator('.coach-review-list [data-action="coach-review-main"][aria-pressed="true"]').count(), 2, 'individual management removal keeps a separate shared alias designation');
          } else {
            await toggle(page, 'latest-a-last');
            await assertPrefsOnly(page, data.state, { order: 'priority', mainExerciseKeys: [] });
            assert.equal(await page.locator('.coach-review-list [data-action="coach-review-main"][aria-pressed="true"]').count(), 0, 'row unpin removes both the matching raw and canonical designation');
            assert.equal(await page.locator('.coach-review-mains').count(), 0);
          }
          assert.match(await page.locator('#toast').innerText(), /메인 운동 지정을 해제했어요/);
          assert.equal(await page.locator('#toast').evaluate(element => !element.hidden && !element.classList.contains('toast-error')), true);
          await layout(page, width); assert.deepEqual(errors, []); assert.deepEqual(requests, []); continue;
        }
        if (kind === 'scope') {
          for (const scope of ['nutrition', 'training', 'both']) {
            await navigate(page, 'today'); await page.locator('#trackingScope').selectOption(scope); await navigate(page, 'coach');
            assert.equal(await page.locator('#coachWorkoutReview').count(), scope === 'nutrition' ? 0 : 1, 'whole-workout review follows the explicit recording scope');
            if (scope !== 'nutrition') { await assertIds(page, initialPriority); await layout(page, width); }
            const saved = await stored(page), expected = JSON.parse(untouched);
            expected.trackingScope = scope; expected.updatedAt = saved.updatedAt;
            assert.deepEqual(saved, expected, 'scope selection changes only the recording scope and save timestamp, not original records or review preferences');
            const currentBytes = await storedText(page); await navigate(page, 'training');
            assert.equal(await storedText(page), currentBytes, 'existing workout records remain accessible without rewriting them in nutrition-only mode');
          }
          assert.deepEqual(errors, []); assert.deepEqual(requests, []); continue;
        }
        const beforeSelection = await storedText(page);
        await selectBlock(page, 'latest-a-last', '합성 바벨 B', true);
        const detail = await page.locator('#coachReviewDetail').innerText(); assert.match(detail, new RegExp(date));
        if (kind === 'no-numbers') {
          assert.match(detail, /미확인|확인되지|아직.*모름/);
          assert.doesNotMatch(detail, /0kg|0회|0세트|근성장률\s*\d/);
        } else {
          const table = page.locator('#coachReviewDetail').getByRole('table');
          assert.equal(await table.count(), 1, 'the selected block exposes actual sets in a semantic table');
          assert.match(await table.innerText(), /34\.5/); assert.match(await table.innerText(), /\b7\b/); assert.match(await table.innerText(), /\b3\b/);
          assert.doesNotMatch(await table.innerText(), /\b80\b/, 'the last A block cannot show the first A block numbers');
          assert.doesNotMatch(detail, /근성장률\s*\d|환산 최대중량\s*\d/);
        }
        if (kind === 'safety') {
          assert.match(await page.locator('.coach-priority').innerText(), /통증|중단/);
          assert.match(await page.locator('#coachWorkoutReview').innerText(), /통증|중단/);
        }
        if (kind === 'grouped' || kind === 'unknown-order') {
          await page.locator('#coachReviewDetail .coach-review-comparison summary').click();
          const comparison = await page.locator('#coachReviewDetail .coach-review-comparison').innerText();
          assert.match(comparison, /이번 기록과 이전 기록/);
          assert.match(comparison, /순서|배치/);
          assert.doesNotMatch(comparison, /실제 순차 수행으로 확인된|같은 조건 이전|같은 기록 조건/,
            'grouped or unknown-order records preserve observed history without presenting matched sequential conditions');
          assert.doesNotMatch(comparison, /숫자 관찰과 근력 판정을 구분했어요|미기록 기간을 휴식으로 간주하지 않았어요|저장한 프로그램을 자동으로 바꾸지/,
            'evidence explains this comparison rather than repeating non-actions and generic defensive conditions');
          if (kind === 'unknown-order') {
            assert.match(comparison, /장비.*3일|3일.*장비/,
              'three actual days on the equipment remain available even though execution order was not recorded');
            assert.match(await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), /34\.5kg/);
            assert.match(await page.locator('#coachReviewDetail .coach-review-next-trial').innerText(), /34\.5kg/,
              'missing order does not turn all actionable record interpretation into a comparison hold');
          }
        }
        if (kind === 'marked') {
          assert.match(await page.locator('#coachReviewDetail .coach-review-meaning').innerText(), /D.*34\.5kg.*7회/);
          assert.match(await page.locator('#coachReviewDetail .coach-review-next-trial').innerText(), /별도 표기.*일반 세트/);
          assert.equal(await page.locator('#coachReviewDetail [data-action="training-feedback"]').count(), 0, 'marked-only records cannot receive ordinary-set effort feedback');
          await page.locator('#coachReviewDetail .coach-review-comparison summary').click();
          const markedEvidence = await page.locator('#coachReviewDetail .coach-review-comparison').innerText();
          assert.match(markedEvidence, /D|별도 표기/);
          assert.doesNotMatch(markedEvidence, /같은 조건 이전|같은 기록 조건|수행 향상|향상으로/,
            'marked-set source evidence remains visible without pretending it is an ordinary-set progression judgement');
          assert.doesNotMatch(detail, /수행이 늘|수행 증가|같은.*중량.*늘었|일반 세트 관찰/, 'marked-only observations are not ordinary-set performance improvement');
        }
        if (kind === 'no-profile') assert.equal((await stored(page)).profile, null, 'review works without creating a fabricated profile');
        assert.equal(await storedText(page), beforeSelection, 'block detail selection never persists or rewrites raw records');
        await page.locator('#coachReviewDetail [data-action="coach-review-select"][data-block-id="latest-a-first"]').click();
        assert.match(await page.locator('#coachReviewDetail').innerText(), /합성 바벨 A/);
        await page.locator('#coachReviewDetail [data-action="coach-review-select"][data-block-id="latest-a-last"]').click();
        assert.match(await page.locator('#coachReviewDetail').innerText(), /합성 바벨 B/);
        await page.locator('#coachReviewDetail [data-action="coach-review-list"]').click();
        assert.equal(await page.locator('.coach-review-list [data-action="coach-review-select"][data-block-id="latest-a-last"]').evaluate(element => document.activeElement === element), true, 'list return restores focus to the exact repeated block');
        assert.equal(await storedText(page), beforeSelection, 'next/previous and list navigation are read-only');
        if (kind !== 'normal') {
          await layout(page, width);
          await screenshotStart(page, '#coachReviewDetail', path.join(artifacts, `coach-review-${kind}-${width}.png`));
          assert.deepEqual(errors, []); assert.deepEqual(requests, []); continue;
        }

        await page.evaluate(key => {
          window.syntheticReviewSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new DOMException('합성 저장 공간 오류', 'QuotaExceededError');
            return window.syntheticReviewSetItem.call(this, name, value);
          };
        }, S.STORAGE_KEY);
        await toggle(page, 'latest-a-first');
        assert.equal(await storedText(page), untouched, 'failed main preference save leaves exact persisted bytes unchanged');
        assert.equal(await page.locator(`[data-action="coach-review-main"][data-exercise-key="${benchKey}"][aria-pressed="true"]`).count(), 0, 'failed save does not leave an unsaved main movement active');
        assert.equal(await page.locator('#toast').evaluate(element => !element.hidden && element.classList.contains('toast-error')), true);
        await assertIds(page, initialPriority);
        await page.evaluate(() => { Storage.prototype.setItem = window.syntheticReviewSetItem; delete window.syntheticReviewSetItem; });
        await toggle(page, 'latest-a-first');
        let preferences = { order: 'priority', mainExerciseKeys: [legKey, benchKey] };
        await assertPrefsOnly(page, data.state, preferences);
        assert.equal(await page.locator(`[data-action="coach-review-main"][data-exercise-key="${benchKey}"][aria-pressed="true"]`).count(), 2, 'main movement applies across repeated blocks and equipment');
        await assertIds(page, ['latest-leg', 'latest-a-first', 'latest-a-last', 'latest-lateral', 'latest-row', 'latest-unknown']);
        await toggle(page, 'latest-row'); preferences.mainExerciseKeys.push(rowKey);
        await assertPrefsOnly(page, data.state, preferences);
        assert.equal(await page.locator(`[data-action="coach-review-main-up"][data-exercise-key="${benchKey}"]`).count(), 1, 'main reorder controls appear once per saved movement rather than once per repeated block');
        await page.locator('.coach-review-mains summary').click();
        await page.locator(`[data-action="coach-review-main-up"][data-exercise-key="${rowKey}"]`).click();
        preferences.mainExerciseKeys = [legKey, rowKey, benchKey]; await assertPrefsOnly(page, data.state, preferences);
        await assertIds(page, ['latest-leg', 'latest-row', 'latest-a-first', 'latest-a-last', 'latest-lateral', 'latest-unknown']);
        await page.locator(`[data-action="coach-review-main-down"][data-exercise-key="${rowKey}"]`).click();
        preferences.mainExerciseKeys = [legKey, benchKey, rowKey]; await assertPrefsOnly(page, data.state, preferences);
        await toggle(page, 'latest-row'); preferences.mainExerciseKeys = [legKey, benchKey];
        await order(page, 'diary'); preferences.order = 'diary'; await assertIds(page, diaryIds); await assertPrefsOnly(page, data.state, preferences);
        const savedText = await storedText(page); await page.reload(); await coach(page);
        assert.equal(await storedText(page), savedText, 'reload must keep exact stored review preferences without migration');
        await assertIds(page, diaryIds); assert.equal(await page.locator('[data-action="coach-review-order"][data-order="diary"]').getAttribute('aria-pressed'), 'true');
        await order(page, 'priority'); preferences.order = 'priority'; await assertPrefsOnly(page, data.state, preferences);
        await toggle(page, 'latest-a-last'); preferences.mainExerciseKeys = [legKey];
        await assertPrefsOnly(page, data.state, preferences);
        assert.equal(await page.locator(`[data-action="coach-review-main"][data-exercise-key="${benchKey}"][aria-pressed="true"]`).count(), 0, 'unmarking either A block removes the shared main preference');
        await assertIds(page, initialPriority);

        const currentText = await storedText(page);
        await page.locator('#coachReviewSession').selectOption(data.early.id);
        await assertIds(page, ['early-pullup']);
        await selectBlock(page, 'early-pullup', '합성 풀업');
        assert.match(await page.locator('#coachReviewDetail').innerText(), /07:00/);
        assert.doesNotMatch(await page.locator('#coachReviewDetail').innerText(), /34\.5|합성 바벨 B/);
        await page.locator('#coachReviewSession').selectOption(data.latest.id);
        await assertIds(page, initialPriority); await selectBlock(page, 'latest-a-last', '합성 바벨 B');
        assert.match(await page.locator('#coachReviewDetail').innerText(), /19:30/);
        assert.equal(await storedText(page), currentText, 'same-day session changes are read-only and preserve main preference persistence');
        await layout(page, width);
        await screenshotStart(page, '#coachReviewDetail', path.join(artifacts, `coach-review-${width}.png`));

        await navigate(page, 'today'); await page.locator('#dayDate').fill(previousDate); await page.locator('#dayDate').dispatchEvent('change'); await coach(page);
        assert.equal(await page.locator('#coachReviewSession').inputValue(), data.previous.id);
        const pastSessions = await page.locator('#coachReviewSession option').evaluateAll(options => options.map(option => option.value));
        assert.deepEqual(pastSessions, [data.previous.id], 'historical review does not offer future-of-selected-date sessions');
        await selectBlock(page, 'previous-a-last', '합성 바벨 B');
        assert.match(await page.locator('#coachReviewDetail').innerText(), new RegExp(previousDate));
        assert.match(await page.locator('.coach-review-range').innerText(), new RegExp(previousDate));
        assert.doesNotMatch(await page.locator('#coachReviewDetail').innerText(), new RegExp(date), 'historical detail cannot cite a later same-movement observation');
        assert.equal(await storedText(page), currentText, 'historical review does not mutate current preferences or completed day snapshots');
        assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'synthetic whole-session review never contacts AI or private APIs');
      } catch (error) {
        await page?.screenshot({ path: path.join(artifacts, `coach-review-failure-${kind}-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    console.log('Coach review browser: all A-B-A blocks, explicit date/time session choices, priority and diary order, persisted shared main movement and reorder, alias/canonical unpin, marked-set source evidence, save-failure preservation, keyboard detail/list/neighbor navigation, same-day sessions and historical cutoffs, no numbers/profile/safety, legacy OCR unknown-not-zero, grouped and unknown-order honest evidence with usable equipment history, explicit recording scopes, immutable sources/sets/RIR/frozen targets and 320/390/1280px passed. No AI or private data.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
