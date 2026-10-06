'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const I = require('../src/insights.js');

const today = I.dateKey(), latestDate = I.shiftDate(today, -2), historicalDate = I.shiftDate(today, -20);
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };

function exercise(id, exerciseId, rawName, loadKg, reps, rir) {
  return { id, rawName, exerciseId, equipmentKey: exerciseId === 'pull_up' ? '합성 풀업 장비' : '합성 바벨 장비',
    loadConvention: 'total', loadRole: 'external', durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: '',
    sets: [{ id: `${id}-set`, loadKg, reps, rir, marker: null }] };
}
function record(id, date, time, label, exercises, extra = {}) {
  return { id, date, time, label, durationMinutes: 40, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: 6, pain: 'none',
    sequence: { order: 'listed', structure: 'straight' }, exercises, ...extra };
}
function fixture(kind) {
  const state = S.createEmpty(); state.profile = profile; state.trackingScope = 'both'; state.training = TS.createEmpty();
  for (const date of [today, historicalDate]) state.days[date] = { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null,
    bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null,
    coachCheckin: { energy: 'good', hunger: 'okay', sleep: 'good', trainingPlan: null, mealConstraint: null, performance: 'steady' } };
  const oldFirst = record('synthetic-old-first', I.shiftDate(today, -26), '09:00', '합성 오래된 첫 풀업',
    [exercise('old-first-pullup', 'pull_up', '풀업', 0, 7, 2)]);
  const oldCurrent = record('synthetic-old-current', historicalDate, '10:00', '합성 오래된 선택 풀업',
    [exercise('old-current-pullup', 'pull_up', '풀업', 0, 9, 2)]);
  const previous = record('synthetic-bench-previous', I.shiftDate(today, -9), '12:00', '합성 앞선 벤치',
    [exercise('previous-bench', 'bench_press', '바벨 벤치 프레스', 40, 11, 2)]);
  const latest = record('synthetic-latest', latestDate, '20:00', '합성 최신 벤치',
    [exercise('latest-bench', 'bench_press', '바벨 벤치 프레스', 42.5, 13, null)]);
  const future = record('synthetic-future', I.shiftDate(today, 1), '20:00', '합성 미래 벤치',
    [exercise('future-bench', 'bench_press', '바벨 벤치 프레스', 99, 2, 2)]);
  let earlier = oldCurrent;
  if (kind === 'same-day') {
    earlier = record('synthetic-same-day-earlier', latestDate, '08:00', '합성 같은 날 이른 벤치',
      [exercise('early-bench', 'bench_press', '바벨 벤치 프레스', 90, 1, 2)]);
  }
  if (kind === 'aggregate') {
    latest.label = '합성 최신 OCR 요약'; latest.exercises = [];
    latest.reportedSetCount = 21; latest.reportedVolumeKg = 5000; latest.reportedEnergyKcal = 340;
    latest.source.kind = 'legacy-ocr'; latest.source.hash = 'a'.repeat(64);
  } else if (kind === 'missing-numbers') {
    latest.label = '합성 최신 숫자 미확인'; latest.exercises[0].sets[0].loadKg = null; latest.exercises[0].sets[0].reps = null;
  }
  const chronological = [oldFirst, oldCurrent, previous, ...(kind === 'same-day' ? [earlier] : []), latest, future];
  state.training.records = kind === 'latest-first' ? [latest, future, oldFirst, oldCurrent, previous] : chronological;
  return { state: S.validateState(state), latest, earlier, historical: oldCurrent };
}

async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function noOverflow(page, context) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(size.actual <= size.viewport + 1, `${context}: ${JSON.stringify(size)}`);
}
async function navigate(page, view) {
  await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function selectAndFilter(page, record) {
  await navigate(page, 'training');
  await page.locator('[data-action="training-tab"][data-tab="log"]').click();
  await page.locator('#trainingSearch').fill('');
  await page.locator(`.workout-list-item[data-id="${record.id}"]`).click();
  await page.locator('#trainingSearch').fill(record.label);
  assert.equal(await page.locator('.workout-list-item.selected').getAttribute('data-id'), record.id);
  assert.equal(await page.locator('#trainingSearch').inputValue(), record.label);
  assert.equal(await page.locator('.workout-list-item').count(), 1, 'the stale search must really exclude the latest record');
}
async function assertOpened(page, expected) {
  await page.locator('#view-training').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workout-heading h2').innerText(), expected.label, 'record link opens its exact displayed session');
  assert.equal(await page.locator('.workout-list-item.selected').getAttribute('data-id'), expected.id);
  assert.equal(await page.locator('#trainingSearch').inputValue(), '', 'explicit record navigation clears an unrelated stale filter');
  await noOverflow(page, 'opened record');
}
async function answer(page, questionId) {
  await page.locator(`[data-action="coach-question"][data-question="${questionId}"]`).click();
  await page.locator('#coachAnswer').waitFor({ state: 'visible' });
  return page.locator('#coachAnswer');
}
async function recordLink(page, container, expected) {
  const link = container.locator(`[data-action="training-open"][data-id="${expected.id}"]`);
  assert.equal(await link.count(), 1, `${expected.label}: record link carries the exact session ID`);
  await link.scrollIntoViewIfNeeded();
  assert.equal(await link.innerText(), `${expected.date} 일지 보기`, 'the action label names the displayed record date');
  await noOverflow(page, `${expected.label}: coaching link`);
  return link;
}
async function assertPriority(page, expected, hasNumbers) {
  const cards = page.locator('.coach-record-summary .coach-priority, .coach-record-summary .coach-supporting details');
  const card = cards.filter({ has: page.locator(`[data-action="training-open"][data-id="${expected.id}"]`) });
  assert.ok(await card.count() > 0, 'a recent-record card must target the latest eligible session');
  const text = await card.first().innerText();
  assert.match(text, new RegExp(expected.date));
  assert.match(text, new RegExp(expected.label));
  if (hasNumbers) {
    assert.match(text, /전체|운동 블록/);
    assert.match(text, new RegExp(expected.exercises[0].rawName), 'a movement-specific next action names its actual movement rather than claiming to represent every exercise');
    assert.match(text, /42\.5kg/);
    assert.doesNotMatch(text, /90kg|99kg|풀 업|풀업/, 'a whole-session summary cannot substitute an unrelated earlier, same-day or future record');
  }
}
async function latestObservation(page, expected) {
  return page.evaluate(({ key, recordId, date }) => {
    const state = JSON.parse(localStorage.getItem(key));
    const analysis = window.MacroTraining.analyze(state.training.records, { date, profile: state.profile, checkins: state.days, mappings: state.training.mappings });
    return analysis.progression.find(row => row.current?.sessionId === recordId) || null;
  }, { key: S.STORAGE_KEY, recordId: expected.id, date: today });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [320, 390, 1280]) {
      for (const kind of ['latest-first', 'latest-last', 'same-day', 'aggregate', 'missing-numbers']) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        let page;
        try {
          const data = fixture(kind), untouched = JSON.stringify(data.state), errors = [], requests = [];
          await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
            { key: S.STORAGE_KEY, value: untouched });
          page = await context.newPage(); page.setDefaultTimeout(10000);
          page.on('pageerror', error => errors.push(error.message));
          page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
          await page.goto(url);
          await selectAndFilter(page, data.earlier); await navigate(page, 'coach');
          const hasNumbers = !['aggregate', 'missing-numbers'].includes(kind);
          await assertPriority(page, data.latest, hasNumbers);
          const questionId = kind === 'aggregate' || kind === 'missing-numbers' ? 'training-log' : 'training-progression';
          const currentAnswer = await answer(page, questionId), answerText = await currentAnswer.innerText();
          assert.match(answerText, new RegExp(data.latest.date));
          assert.doesNotMatch(answerText, /99kg/, 'future observations cannot be used before their date');
          if (hasNumbers) {
            assert.match(answerText, new RegExp(data.latest.label));
            assert.match(answerText, /운동 블록|전체|1종목/);
            assert.match(answerText, new RegExp(data.latest.exercises[0].rawName), 'the actionable comparison identifies the specific movement inside its session');
            assert.match(answerText, /42\.5kg/);
            assert.doesNotMatch(answerText, /90kg|풀 업|풀업/, 'the question cannot substitute an unrelated old movement or same-day session');
            const observation = await latestObservation(page, data.latest);
            assert.ok(observation, 'latest numeric observations remain available for individual review');
            assert.equal(observation.current.loadKg, 42.5); assert.equal(observation.current.reps, 13); assert.equal(observation.current.rir, null);
            assert.match(observation.reason, kind === 'same-day' ? /같은 날.*두 세션/ : /RIR/);
          } else {
            assert.equal(await page.locator('[data-action="coach-question"][data-question="training-progression"]').count(), 0,
              'latest aggregate or numeric-unknown session must not fall back to an older exercise progression');
            assert.match(answerText, new RegExp(data.latest.label));
            assert.doesNotMatch(answerText, /40kg|42\.5kg|풀 업|풀업/);
          }
          const link = await recordLink(page, currentAnswer, data.latest);
          assert.equal(await storedText(page), untouched, 'viewing a coaching comparison must not save or migrate records');
          await link.click(); await assertOpened(page, data.latest);

          await selectAndFilter(page, data.earlier); await navigate(page, 'coach');
          const sidebar = page.locator('.coach-training-context');
          assert.match(await sidebar.innerText(), new RegExp(data.latest.date));
          assert.match(await sidebar.innerText(), new RegExp(data.latest.label));
          const sidebarLink = await recordLink(page, sidebar, data.latest);
          await sidebarLink.click(); await assertOpened(page, data.latest);

          if (kind === 'latest-first' || kind === 'latest-last') {
            await navigate(page, 'today');
            await page.locator('#dayDate').fill(historicalDate); await page.locator('#dayDate').dispatchEvent('change');
            await navigate(page, 'coach');
            const past = await answer(page, 'training-progression');
            assert.match(await past.innerText(), new RegExp(historicalDate));
            assert.doesNotMatch(await past.innerText(), /42\.5kg|99kg|합성 최신|합성 미래/);
            const pastLink = await recordLink(page, past, data.historical);
            await pastLink.click(); await assertOpened(page, data.historical);
            await navigate(page, 'coach');
            const pastSidebar = page.locator('.coach-training-context');
            assert.match(await pastSidebar.innerText(), new RegExp(data.historical.label));
            assert.doesNotMatch(await pastSidebar.innerText(), /합성 최신|합성 미래/);
            await recordLink(page, pastSidebar, data.historical);
          }
          await noOverflow(page, `${kind} ${width}`);
          if (kind === 'same-day') {
            await navigate(page, 'coach'); await answer(page, 'training-progression');
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(artifacts, `recent-coach-${width}.png`), fullPage: true });
          }
          assert.equal(await storedText(page), untouched, 'record selection, stale filter reset and historical navigation are read-only');
          assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'synthetic coach review must not call AI or private APIs');
        } catch (error) {
          await page?.screenshot({ path: path.join(artifacts, `recent-coach-failure-${kind}-${width}.png`), fullPage: true }).catch(() => {});
          throw error;
        } finally { await context.close(); }
      }
    }
    console.log('Recent coach browser: latest whole-session summary with explicitly named movement actions, exact-ID card/question/sidebar links, stale selection and search reset, historical cutoffs, same-day sessions, retained unknown-RIR observations and summary/numeric-unknown no-old-comparison fallback at 320/390/1280px passed. State unchanged; no AI or private data.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
