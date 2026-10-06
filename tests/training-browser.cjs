'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const TrainingStore = require('../src/training-store.js');
const Insights = require('../src/insights.js');
const { createServer } = require('../tools/serve.cjs');

const today = Insights.dateKey();
const yesterday = Insights.shiftDate(today, -1);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };

function fixtureImage(kind) {
  // A valid ancillary PNG chunk gives each record type a distinct synthetic source hash.
  const value = Buffer.from(`fixture\0${kind}`, 'latin1'), chunk = Buffer.alloc(value.length + 12);
  chunk.writeUInt32BE(value.length); chunk.write('tEXt', 4); value.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + value.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + value.length);
  return Buffer.concat([PNG.subarray(0, PNG.length - 12), chunk, PNG.subarray(PNG.length - 12)]);
}

// This boundary stub never starts Codex or reads the user's diary directory.
function fakeRuntime() {
  const jobs = [];
  return {
    jobs,
    status: () => ({ available: true, running: jobs.find(job => job.status === 'running')?.id || null }),
    start(input, imageFile, retry) {
      assert.equal(jobs.some(job => job.status === 'running'), false, 'only one AI request may be active');
      const contextDigest = crypto.createHash('sha256').update(JSON.stringify({ input, attempt: jobs.length })).digest('hex');
      const job = { id: contextDigest.slice(0, 32), contextDigest, kind: input.kind, question: input.question, imageHash: input.imageHash, createdAt: new Date().toISOString(), status: 'running', result: null, error: null, retry: Boolean(retry) };
      jobs.push(job);
      return { ...job };
    },
    get: id => jobs.find(job => job.id === id) || null,
    list: () => jobs.map(({ result, question, ...summary }) => summary).reverse(),
    cancel(id) { const job = jobs.find(value => value.id === id); if (job) Object.assign(job, { status: 'cancelled', error: '검증용 요청이 취소됐어요.' }); return job; },
    complete(result) { const job = jobs.at(-1); assert.equal(job.status, 'running'); Object.assign(job, { status: 'completed', result }); },
    close() {}
  };
}
function result(kind = 'chat', extra = {}) {
  return { kind, answer: '합성 기록을 확인한 테스트 응답입니다.', questions: [], uncertainties: [], workouts: [], meal: null, body: null, ...extra };
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), Storage.STORAGE_KEY); }
async function navigate(page, view) { await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' }); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); }
async function waitState(page, predicate, argument) {
  await page.waitForFunction(({ key, source, argument }) => {
    const value = JSON.parse(localStorage.getItem(key));
    return new Function('value', 'argument', `return (${source})(value, argument)`)(value, argument);
  }, { key: Storage.STORAGE_KEY, source: predicate.toString(), argument });
}
async function overflow(page, label) {
  const size = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(size.actual <= size.width + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
}
async function importFile(page, text) {
  await page.locator('#trainingContent [data-action="training-import"]').first().click();
  await page.locator('#trainingImportFile').setInputFiles({ name: 'synthetic-training.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
}
async function sendChat(page, text) {
  await page.locator('#coachChatInput').fill(text);
  await page.locator('#coachChatForm button[type="submit"]').click();
}
async function uploadImage(page, kind) {
  await navigate(page, 'training');
  await page.locator('#trainingContent [data-action="training-image"]').click();
  await page.locator('#imageKind').selectOption(kind);
  await page.locator('#coachImageFile').setInputFiles({ name: `synthetic-${kind}.png`, mimeType: 'image/png', buffer: fixtureImage(kind) });
  await page.locator('#imageAnalyze').check();
  const started = page.waitForResponse(response => response.url().endsWith('/api/jobs') && response.request().method() === 'POST');
  await submit(page);
  assert.equal((await started).status(), 200);
}

async function verifyProgramWorkflow(browser, temporary, artifacts) {
  const server = createServer({ bridge: { data: path.join(temporary, 'program-workflow'), runtime: fakeRuntime() } });
  let context;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const initial = Storage.createEmpty(); initial.profile = profile; initial.training = TrainingStore.createEmpty();
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: Storage.STORAGE_KEY, value: initial });
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await navigate(page, 'training');
    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    await page.locator('[data-action="program-settings"]').click();
    await page.locator('[name="daysPerWeek"]').fill('1'); await submit(page);
    await page.locator('[data-action="program-save"]').click();
    await page.locator('[name="name"]').fill('합성 PT 계획'); await submit(page);
    await page.locator('[data-action="program-edit-day"]').click();
    const exerciseCount = await page.locator('#entryForm input[name$="-remove"]').count();
    for (let index = 1; index < exerciseCount; index++) await page.locator(`[name="${index}-remove"]`).check();
    for (const [key, value] of Object.entries({ sets: 2, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 50 })) await page.locator(`[name="0-${key}"]`).fill(String(value));
    await page.locator('[name="0-equipmentKey"]').fill('합성 장비'); await page.locator('[name="0-loadConvention"]').selectOption('total'); await submit(page);
    await page.locator('[data-action="program-schedule"]').click(); await page.locator('[name="date-0"]').fill(today); await submit(page);
    let saved = await state(page), assigned = saved.training.planning.schedule[0];
    assert.equal(assigned.prescription.exercises[0].loadKg, 50); assert.equal(assigned.status, 'planned'); assert.equal(assigned.recordId, null);
    assert.equal(saved.training.records.length, 0); assert.equal(Object.keys(saved.days).length, 0, 'planning creates neither exercise nor nutrition days');
    await page.locator('[data-action="program-edit-day"]').click();
    await page.locator('[name="0-repsMin"]').fill('10'); await page.locator('[name="0-repsMax"]').fill('14'); await page.locator('[name="0-loadKg"]').fill('55'); await submit(page);
    saved = await state(page); assert.equal(saved.training.planning.programs[0].days[0].exercises[0].loadKg, 55);
    assert.equal(saved.training.planning.schedule[0].prescription.exercises[0].loadKg, 50, 'saved edits do not rewrite dated targets');
    await page.locator('[data-action="schedule-adjust"]').click();
    await page.locator('[name="kind"]').selectOption('progression'); await page.locator('[name="reason"]').fill('확인한 장비의 단계 직접 선택');
    await page.locator('[name="reviewDate"]').fill(today);
    await page.locator('#entryForm summary').filter({ hasText: '다음 중량' }).click(); await page.locator('[name="loadKg"]').fill('52.5');
    await page.locator('#entryForm input[type="checkbox"]').check(); await submit(page);
    saved = await state(page); assigned = saved.training.planning.schedule[0];
    assert.equal(assigned.prescription.exercises[0].loadKg, 52.5); assert.equal(assigned.adjustment.originalPrescription.exercises[0].loadKg, 50);
    await page.locator('[data-action="schedule-start"]').click();
    assert.match(await page.locator('#entryForm').innerText(), /배치 당시 목표/);
    for (const key of ['loadKg', 'reps', 'rir']) assert.equal(await page.locator(`[name="0-0-${key}"]`).inputValue(), '');
    for (const [name, value] of Object.entries({ '0-0-loadKg': 52.5, '0-0-reps': 10, '0-0-rir': 2, '0-1-loadKg': 52.5, '0-1-reps': 12 })) await page.locator(`[name="${name}"]`).fill(String(value));
    await page.locator('[name="pain"]').selectOption('none'); await submit(page);
    saved = await state(page); assert.equal(saved.training.records.length, 1); assert.equal(saved.training.planning.schedule[0].status, 'performed');
    assert.equal(saved.training.records[0].exercises[0].sets[1].rir, null); assert.equal(Object.keys(saved.days).length, 0);
    await page.locator('.scheduled-session summary').click(); assert.match(await page.locator('.scheduled-session').innerText(), /비교할 숫자·기준 미확인/);
    await page.locator('.scheduled-session [data-action="training-open"]').click(); await page.locator('[data-action="training-edit"]').click();
    await page.locator('[name="0-1-rir"]').fill('2'); await submit(page);
    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    assert.match(await page.locator('.scheduled-session summary').innerText(), /기록 조건 확인/);
    await page.locator('[data-action="schedule-review"]').click();
    await page.locator('#entryForm input[type="checkbox"]').check(); await submit(page);
    assert.equal((await state(page)).training.planning.schedule[0].adjustment.reviewed, true, 'review records an explicit check rather than automatically declaring recovery');
    const nextDate = Insights.shiftDate(today, 1);
    await page.locator('[data-action="program-schedule"]').click(); await page.locator('[name="date-0"]').fill(nextDate); await submit(page);
    await page.locator('[data-action="schedule-adjust"]').click(); await page.locator('[name="kind"]').selectOption('deload');
    await page.locator('[name="reason"]').fill('다음 훈련 부담을 직접 낮추고 다시 확인');
    await page.locator('#entryForm summary').filter({ hasText: '부담 낮추기' }).click(); await page.locator('[name="setReduction"]').fill('1'); await page.locator('[name="rirIncrease"]').fill('1');
    await page.locator('#entryForm input[type="checkbox"]').check(); await submit(page);
    saved = await state(page); const future = saved.training.planning.schedule[1];
    assert.equal(future.prescription.exercises[0].sets, 1); assert.equal(future.prescription.exercises[0].rir, 3);
    assert.equal(future.adjustment.originalPrescription.exercises[0].sets, 2); assert.equal(future.adjustment.reviewed, false);
    assert.equal(saved.training.records.length, 1, 'adjusting the future plan does not fabricate another performance');
    await page.reload(); await navigate(page, 'training'); await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    assert.equal((await state(page)).training.planning.schedule.length, 2);
    await page.locator('[data-action="schedule-week"][data-offset="7"]').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'schedule-week');
    await page.locator('[data-action="schedule-week"][data-offset="-7"]').click();
    await page.screenshot({ path: path.join(artifacts, 'program-workflow-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 820 }); await overflow(page, 'saved program narrow');
    await page.locator('[data-action="program-edit-day"]').click(); await overflow(page, 'program edit narrow');
    await page.screenshot({ path: path.join(artifacts, 'program-workflow-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    const unknownId = 'synthetic_future_exercise', unknownLabel = '합성 원문 <img src=x onerror=alert(1)>';
    await page.evaluate(({ key, unknownId, unknownLabel }) => {
      const value = JSON.parse(localStorage.getItem(key)), target = value.training.planning.programs[0].days[0].exercises[0];
      target.exerciseId = unknownId; target.label = unknownLabel;
      localStorage.setItem(key, JSON.stringify(window.MacroStorage.validateState(value)));
    }, { key: Storage.STORAGE_KEY, unknownId, unknownLabel });
    await page.reload(); await navigate(page, 'training'); await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    const unknownBefore = (await state(page)).training.planning.programs[0].days[0].exercises[0];
    await page.locator('[data-action="program-edit-day"]').click();
    assert.equal(await page.locator('[name="0-exercise"]').inputValue(), unknownId, 'an imported unknown ID remains selected rather than becoming the first catalog option');
    assert.match(await page.locator('[name="0-exercise"] option:checked').innerText(), /합성 원문.*카탈로그 미등록/);
    assert.equal(await page.locator('#entryForm img').count(), 0, 'unknown exercise labels are escaped');
    await page.locator('[name="programName"]').fill('다른 항목만 수정한 합성 계획'); await submit(page);
    assert.deepEqual((await state(page)).training.planning.programs[0].days[0].exercises[0], unknownBefore, 'editing another field preserves unknown ID, label, personal load and equipment');
    await page.locator('[data-action="program-edit-day"]').click();
    await page.locator('[name="0-exercise"]').selectOption('bench_press'); await submit(page);
    const replaced = (await state(page)).training.planning.programs[0].days[0].exercises[0];
    assert.equal(replaced.exerciseId, 'bench_press'); assert.equal(replaced.loadKg, null); assert.equal(replaced.equipmentKey, null); assert.equal(replaced.loadConvention, 'as-recorded');
    const pastDate = Insights.shiftDate(today, -7);
    await page.evaluate(({ key, pastDate }) => {
      const value = JSON.parse(localStorage.getItem(key));
      value.training.records[0].pain = 'stop';
      const day = { date: pastDate, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0,
        meals: [{ id: 'past-snapshot-meal', name: '과거 확인한 식사', protein: 100, carbs: 250, fat: 60, otherKcal: 0, alcoholG: 0 }], sessions: [], complete: false, planSnapshot: null };
      day.planSnapshot = window.MacroNutrition.calculatePlan(value.profile, day, []); day.complete = true;
      value.days[pastDate] = day;
      localStorage.setItem(key, JSON.stringify(window.MacroStorage.validateState(value)));
    }, { key: Storage.STORAGE_KEY, pastDate });
    await page.reload(); await navigate(page, 'today');
    await page.locator('#dayDate').fill(pastDate); await page.locator('#dayDate').dispatchEvent('change');
    const beforeSafetyChecks = await state(page);
    await navigate(page, 'training'); await page.locator('[data-action="training-tab"][data-tab="analysis"]').click();
    assert.equal(await page.locator('#trainingDate').inputValue(), pastDate);
    assert.doesNotMatch(await page.locator('.recovery-section h2').innerText(), /통증 확인/, 'historical analysis must not import a later pain report');
    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    assert.equal(await page.locator('[data-action="program-save"]').count(), 0, 'past analysis selection cannot bypass current pain for a new program');
    assert.match(await page.locator('.program-template .program-reason').innerText(), /통증/);
    assert.equal(await page.locator('[data-action="program-edit-day"]').count(), 1, 'saved programs remain readable and editable instead of being removed');
    for (const kind of ['maintain', 'progression', 'deload']) {
      await page.locator('[data-action="schedule-adjust"]').click();
      await page.locator('[name="kind"]').selectOption(kind); await page.locator('[name="reason"]').fill('과거 기준일에서 미래 계획 조정 안전 검증');
      if (kind === 'progression') { await page.locator('#entryForm summary').filter({ hasText: '다음 중량' }).click(); await page.locator('[name="loadKg"]').fill('60'); }
      if (kind === 'deload') { await page.locator('#entryForm summary').filter({ hasText: '부담 낮추기' }).click(); await page.locator('[name="setReduction"]').fill('1'); }
      await page.locator('#entryForm input[type="checkbox"]').check(); await page.locator('#entryForm button[type="submit"]').click();
      assert.match(await page.locator('#entryErrors').innerText(), /현재 건강·통증·회복 맥락/);
      assert.deepEqual(await state(page), beforeSafetyChecks, `${kind}: blocked future adjustment preserves actual records, saved plans and completed snapshots`);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
  } finally { await context?.close(); await new Promise(resolve => server.close(resolve)); server.bridge?.close?.(); }
}

async function verifyConversationRecovery(browser, temporary, artifacts) {
  const data = path.join(temporary, 'conversation-recovery');
  const runtime = fakeRuntime();
  const makeServer = () => createServer({ bridge: { data, runtime } });
  let server = makeServer(), context, page, releaseStart, releaseAttach;
  const errors = [], expectedErrors = [];
  let initialOffline = true, staleTokenExpected = false;
  const waitListening = port => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const scrollState = () => page.locator('.conversation-log').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, visible: element.clientHeight }));
  const assertLatestVisible = async label => {
    const scroll = await scrollState();
    assert.ok(scroll.height > scroll.visible, `${label}: fixture needs a scrolling conversation`);
    assert.ok(scroll.height - scroll.visible - scroll.top <= 2, `${label}: newest message must remain visible ${JSON.stringify(scroll)}`);
  };
  try {
    await waitListening(0);
    const port = server.address().port, url = `http://127.0.0.1:${port}`;
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const initial = Storage.createEmpty(); initial.profile = profile; initial.training = TrainingStore.createEmpty();
    initial.training.messages = Array.from({ length: 20 }, (_, index) => ({
      id: `synthetic-history-${index}`, role: index % 2 ? 'coach' : 'user',
      text: `합성 과거 대화 ${index}. ${'이 문장은 스크롤 검증용 합성 기록입니다. '.repeat(16)}`,
      createdAt: `${today}T00:00:00.000Z`, source: 'codex', replyTo: null, contextDigest: null, status: 'answered'
    }));
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: Storage.STORAGE_KEY, value: JSON.stringify(Storage.validateState(initial)) });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (initialOffline && message.text().includes('net::ERR_FAILED') || staleTokenExpected && message.text().includes('403')) expectedErrors.push(message.text());
      else errors.push(message.text());
    });
    const offline = route => route.abort('failed');
    await page.route('**/api/bridge/status', offline);
    await page.goto(url);
    await navigate(page, 'coach');
    await page.locator('.conversation-unavailable [data-action="bridge-refresh"]').waitFor();
    assert.equal(await page.locator('#coachChatInput').isDisabled(), true);
    assert.equal(await page.locator('#coachChatForm button[type="submit"]').isDisabled(), true);
    assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0);
    await assertLatestVisible('first conversation opening');
    const beforeRecovery = await state(page);
    await page.unroute('**/api/bridge/status', offline);
    initialOffline = false;
    const recovered = page.waitForResponse(response => response.url().endsWith('/api/bridge/status'));
    await page.locator('.conversation-unavailable [data-action="bridge-refresh"]').click();
    assert.equal((await recovered).status(), 200);
    await page.locator('#view-coach [data-action="bridge-connect"]').waitFor();
    assert.equal(await page.locator('#coachChatInput').isDisabled(), false);
    assert.deepEqual(await state(page), beforeRecovery, 'server retry must not replace browser records');
    assert.equal(expectedErrors.length, 1, 'only the injected first-connection failure is expected');

    await page.locator('.conversation-log').evaluate(element => { element.scrollTop = 130; });
    const readingTop = (await scrollState()).top;
    await page.locator('#view-coach [data-action="coach-question"]').first().click();
    assert.ok(Math.abs((await scrollState()).top - readingTop) <= 2, 'unchanged-history render preserves the message being read');
    await sendChat(page, '최근 운동 기록을 함께 확인해 줘.');
    await page.locator('#view-coach [data-action="coach-job-cancel"]').waitFor();
    runtime.complete(result('chat', { answer: '새 질문에 대한 합성 AI 응답입니다.' }));
    await waitState(page, value => value.training.messages.length === 22);
    await assertLatestVisible('new AI question and answer');

    const delayed = new Promise(resolve => { releaseStart = resolve; });
    let startRequests = 0;
    const delayStart = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      startRequests += 1; await delayed; await route.continue();
    };
    await page.route('**/api/jobs', delayStart);
    const question = '합성 기록을 연결해서 다음 운동의 확인 항목을 알려 줘.';
    await sendChat(page, question);
    await page.locator('#view-coach .job-status').filter({ hasText: '연결 중' }).waitFor();
    assert.equal(await page.locator('#coachChatForm button[type="submit"]').isDisabled(), true);
    assert.equal(await page.locator('#coachChatInput').inputValue(), '', 'a submitted draft clears before the start response');
    const pendingCount = (await state(page)).training.messages.length;
    await page.locator('#coachChatInput').fill(question);
    await page.locator('#coachChatForm').dispatchEvent('submit');
    await page.locator('#toast.toast-error').waitFor();
    assert.equal(startRequests, 1, 'a second submit cannot create a second start request');
    assert.equal(runtime.jobs.length, 1, 'the intentionally held start has not reached the fake runtime');
    assert.equal((await state(page)).training.messages.length, pendingCount, 'a blocked repeat cannot append another pending message');
    releaseStart();
    await page.locator('#view-coach [data-action="coach-job-cancel"]').waitFor();
    await page.unroute('**/api/jobs', delayStart);
    assert.equal(runtime.jobs.length, 2);
    await page.locator('.conversation-log').evaluate(element => { element.scrollTop = 95; });
    const waitingTop = (await scrollState()).top;
    runtime.complete(result('chat', { answer: '과거 대화를 읽는 동안 도착한 합성 AI 응답입니다.' }));
    await waitState(page, value => value.training.messages.at(-1).text.includes('과거 대화를 읽는 동안'));
    assert.ok(Math.abs((await scrollState()).top - waitingTop) <= 2, 'an arriving AI answer must not pull the user away from older messages');
    await sendChat(page, '최근 운동 기록을 다시 확인해 줘.');
    await page.locator('#view-coach [data-action="coach-job-cancel"]').waitFor();
    runtime.complete(result('chat', { answer: '가장 최근 질문에 대한 합성 AI 응답입니다.' }));
    await waitState(page, value => value.training.messages.length === 26);
    await assertLatestVisible('new question returns from older messages to the latest answer');

    await navigate(page, 'training');
    const attached = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'POST');
    await page.locator('#trainingContent [data-action="bridge-connect"]').click();
    assert.equal((await attached).status(), 200);
    const oldStatus = await (await page.request.get(`${url}/api/bridge/status`)).json();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    server = makeServer(); await waitListening(port);
    const newStatus = await (await page.request.get(`${url}/api/bridge/status`)).json();
    assert.notEqual(newStatus.token, oldStatus.token, 'restarting the synthetic server rotates its request token');
    staleTokenExpected = true;
    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    await page.locator('[data-action="program-settings"]').click();
    await page.locator('#entryForm [name="sessionMinutes"]').fill('45');
    const expired = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'POST');
    await submit(page);
    assert.equal((await expired).status(), 403);
    await page.locator('#trainingContent .connection-error [data-action="bridge-connect"]').waitFor();
    staleTokenExpected = false;
    const refreshed = page.waitForResponse(response => response.url().endsWith('/api/bridge/status'));
    await page.locator('#trainingContent .connection-error [data-action="bridge-connect"]').click();
    assert.equal((await refreshed).status(), 200, 'reconnection requests a fresh server token before attaching');
    await page.locator('#entryForm [name="choice"]').selectOption('upload');
    await page.locator('#entryForm [name="confirmed"]').check();
    const heldAttach = new Promise(resolve => { releaseAttach = resolve; });
    let attachRequests = 0, markAttach;
    const attachStarted = new Promise(resolve => { markAttach = resolve; });
    const delayAttach = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attachRequests += 1; markAttach(); await heldAttach; await route.continue();
    };
    await page.route('**/api/state', delayAttach);
    const restored = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'POST');
    const backup = page.waitForEvent('download');
    await page.locator('#entryForm button[type="submit"]').click();
    await Promise.race([attachStarted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('PC reconnect POST did not start within 10s')), 10000); timer.unref(); })]);
    assert.equal(await page.locator('#entryForm').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#entryForm button[type="submit"]').isDisabled(), true);
    assert.match(await page.locator('#entryForm button[type="submit"]').innerText(), /처리 중/);
    await page.locator('#entryForm').dispatchEvent('submit');
    assert.equal(attachRequests, 1, 'the busy confirmation form cannot submit PC attachment twice');
    releaseAttach();
    assert.equal((await restored).status(), 200);
    await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    await page.unroute('**/api/state', delayAttach);
    await backup;
    assert.equal(await page.locator('#trainingContent .connection-error').count(), 0);
    assert.deepEqual(Storage.validateState(JSON.parse(fs.readFileSync(path.join(data, 'app-state.json'), 'utf8'))), await state(page), 'reconnection preserves and uploads the explicitly selected synthetic browser state');
    assert.equal(expectedErrors.length, 2, 'only the first-connection failure and expired-token response were injected');
    assert.deepEqual(errors, [], 'conversation recovery has no unexpected browser errors');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'training-recovery-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    releaseStart?.();
    releaseAttach?.();
    await context?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-training-browser-'));
  const artifacts = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const runtime = fakeRuntime();
  const server = createServer({ bridge: { data: path.join(temporary, 'private'), runtime } });
  let browser, page;
  const errors = [];
  const expectedNetworkErrors = [];
  let allowNetworkFailure = false;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    if (process.argv.includes('--program-only')) { await verifyProgramWorkflow(browser, temporary, artifacts); console.log('Saved program workflow browser acceptance passed.'); return; }
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const initial = Storage.createEmpty(); initial.profile = profile; initial.training = TrainingStore.createEmpty();
    const localQuestion = '최근 운동 수행 기록과 다음 훈련은 어떻게 봐야 하나요? <script>test</script>';
    initial.training.messages = [
      { id: 'synthetic-old-local-user', role: 'user', text: localQuestion, createdAt: `${today}T00:00:00.000Z`, source: 'local', replyTo: null, contextDigest: null, status: 'answered' },
      { id: 'synthetic-old-local-reply', role: 'coach', text: '이전 기록 코치가 남긴 합성 안내이며 자유 대화의 응답은 아닙니다.', createdAt: `${today}T00:00:01.000Z`, source: 'local', replyTo: 'synthetic-old-local-user', contextDigest: null, status: 'answered' }
    ];
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: Storage.STORAGE_KEY, value: JSON.stringify(Storage.validateState(initial)) });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (allowNetworkFailure && message.text().includes('net::ERR_FAILED')) expectedNetworkErrors.push(message.text());
      else errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.locator('[data-view]').count(), 6);
    await navigate(page, 'training');
    await page.locator('#trainingContent [data-action="bridge-connect"]').waitFor();
    await page.locator('#trainingContent [data-action="training-add"]').first().click();
    await page.locator('#entryForm [name="date"]').fill(yesterday);
    await page.locator('#entryForm [name="label"]').fill('합성 Push <script>금지</script>');
    await page.locator('#entryForm [name="time"]').fill('19:30');
    await page.locator('#entryForm [name="durationMinutes"]').fill('45');
    await page.locator('#entryForm [name="exercise-0"]').fill('테스트 체스트 머신');
    await page.locator('#entryForm [name="0-0-loadKg"]').fill('50');
    await page.locator('#entryForm [name="0-0-reps"]').fill('10');
    await page.locator('#entryForm [name="0-0-rir"]').fill('2');
    await page.locator('[data-action="editor-add-set"]').click();
    assert.equal(await page.evaluate(() => document.activeElement.name), '0-1-loadKg', 'adding a set moves keyboard focus to its new load field');
    assert.equal(await page.locator('#entryForm [name="0-0-loadKg"]').inputValue(), '50', 'adding a set preserves the draft');
    await page.locator('#entryForm [name="0-1-loadKg"]').fill('20');
    await page.locator('#entryForm [name="0-1-reps"]').fill('10');
    await page.locator('#entryForm [name="0-1-marker"]').fill('W');
    await submit(page);
    let saved = await state(page), original = saved.training.records[0];
    assert.equal(original.exercises[0].sets[1].rir, null);
    assert.equal(saved.days[today]?.sessions?.length || 0, 0, 'manual workout must not automatically add nutrition expenditure');
    assert.equal(await page.locator('.workout-detail script').count(), 0, 'workout names must be escaped');

    await page.locator('[data-action="training-map"]').click();
    await page.locator('#entryForm [name="exerciseId"]').selectOption('machine_chest_press');
    await page.locator('#entryForm [name="equipmentKey"]').fill('합성 머신 A');
    await page.locator('#entryForm [name="loadConvention"]').selectOption('total');
    await page.locator('#entryForm [name="confirmed"]').check();
    await submit(page);
    saved = await state(page); original = saved.training.records[0];
    assert.equal(original.exercises[0].equipmentKey, '합성 머신 A');
    assert.equal(saved.training.mappings[0].confirmed, true);
    await page.locator('[data-action="training-reuse"]').click();
    assert.equal(await page.locator('#entryForm [name="date"]').inputValue(), today);
    assert.equal(await page.locator('#entryForm [name="durationMinutes"]').inputValue(), '');
    assert.equal(await page.locator('#entryForm [name="0-0-rir"]').inputValue(), '', 'a previous RIR is not today\'s observed effort');
    await page.locator('#entryForm [name="label"]').fill('오늘 합성 Push');
    await page.locator('#entryForm [name="durationMinutes"]').fill('40');
    await page.locator('#entryForm [name="0-0-reps"]').fill('12');
    await page.locator('#entryForm [name="0-0-rir"]').fill('2');
    await submit(page);
    saved = await state(page);
    assert.equal(saved.training.records.length, 2);
    const copied = saved.training.records.find(record => record.id !== original.id);
    assert.notEqual(copied.exercises[0].sets[0].id, original.exercises[0].sets[0].id);
    assert.equal(copied.source.kind, 'manual');
    await page.locator('[data-action="training-tab"][data-tab="analysis"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'analysis', 're-rendered tabs retain keyboard focus instead of losing it to BODY');
    assert.match(await page.locator('.training-summary').innerText(), /2/);
    assert.ok(await page.locator('.muscle-row').count() > 0, 'mapped exercises have visible muscle analysis');
    assert.match(await page.locator('.progression-section').innerText(), /50.*10.*50.*12/s, 'actual sets remain visible in progression');
    await page.locator('[data-action="training-tab"][data-tab="log"]').click();
    await page.locator('[data-action="training-link"]').click();
    await page.locator('#entryForm [name="confirmed"]').check();
    await submit(page);
    saved = await state(page);
    assert.equal(saved.days[today].sessions.length, 1);
    assert.equal(saved.days[today].sessions[0].durationMin, 40);
    await page.locator('[data-action="training-link"]').click();
    await page.locator('#entryForm [name="durationMin"]').fill('42');
    await page.locator('#entryForm [name="confirmed"]').check();
    await submit(page);
    assert.equal((await state(page)).days[today].sessions.length, 1, 'relink updates the same session instead of counting it twice');

    await navigate(page, 'today');
    await page.locator('#view-today .meal-section [data-action="meal-add"]').click();
    await page.locator('#entryForm [name="name"]').fill('합성 식사');
    for (const [key, value] of Object.entries({ protein: 30, carbs: 60, fat: 15 })) await page.locator(`#entryForm [name="${key}"]`).fill(String(value));
    await submit(page);
    await page.locator('#view-today .meal-section [data-action="complete"]').click();
    await submit(page);
    const frozenDay = (await state(page)).days[today];
    assert.equal(frozenDay.complete, true);
    await navigate(page, 'training');
    await page.locator('[data-action="training-edit"]').click();
    await page.locator('#entryForm [name="durationMinutes"]').fill('55');
    await submit(page);
    await page.locator('[data-action="training-link"]').click();
    assert.equal(await page.locator('#entryDialog').isVisible(), false, 'completed nutrition cannot be relinked silently');
    assert.deepEqual((await state(page)).days[today], frozenDay, 'editing workout history preserves completed nutrition and its snapshot');

    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    await page.locator('[data-action="program-settings"]').click();
    await page.locator('#entryForm [name="daysPerWeek"]').fill('2');
    await page.locator('#entryForm [name="sessionMinutes"]').fill('30');
    await page.locator('#entryForm [name="equipment"]').selectOption('home');
    await submit(page);
    assert.equal(await page.locator('.program-day').count(), 2);
    const beforeProgram = (await state(page)).training.records;
    await page.locator('[data-action="program-start"]').first().click();
    for (const key of ['loadKg', 'reps', 'rir']) assert.equal(await page.locator(`#entryForm [name="0-0-${key}"]`).inputValue(), '', 'a plan must not masquerade as a performed set');
    await page.keyboard.press('Escape');
    assert.deepEqual((await state(page)).training.records, beforeProgram);

    await navigate(page, 'coach');
    assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0, 'free conversation has one AI path rather than a local answer selector');
    assert.match(await page.locator('.coach-record-summary').innerText(), /기록 요약/);
    const draftQuestion = '아직 보내지 않은 질문: 지난 운동 다음에는 무엇을 확인하나요?';
    await page.locator('#coachChatInput').fill(draftQuestion);
    await navigate(page, 'training');
    await navigate(page, 'coach');
    assert.equal(await page.locator('#coachChatInput').inputValue(), draftQuestion, 'unsent question survives view navigation');
    const beforeChat = await state(page);
    saved = await state(page);
    assert.equal(saved.training.messages[1].source, 'local');
    assert.ok(saved.training.messages[1].text.length > 30);
    assert.deepEqual(saved.training.messages, initial.training.messages, 'older local conversation remains readable without generating another local answer');
    assert.match(await page.locator('.conversation-message').last().innerText(), /이전 기록 안내/);
    assert.deepEqual(saved.days, beforeChat.days, 'opening existing conversation is read-only');
    assert.equal(await page.locator('.conversation-log script').count(), 0);
    await page.locator('[data-action="coach-continue"]').first().click();
    assert.equal(await page.locator('#coachChatInput').inputValue(), localQuestion, 'AI continuation preserves the actual user question');
    assert.equal(runtime.jobs.length, 0, 'continuation only prepares the question; it does not spend an AI request');
    for (const question of ['운동 중 무릎에 통증이 생겼어요.', '지금 흉통과 호흡곤란이 있어요.']) {
      const messageCount = (await state(page)).training.messages.length;
      await sendChat(page, question);
      await waitState(page, (value, count) => value.training.messages.length === count + 2, messageCount);
      const answer = (await state(page)).training.messages.at(-1);
      assert.equal(answer.source, 'local', 'safety routing takes priority in the AI-only conversation');
      assert.equal(runtime.jobs.length, 0);
      assert.match(answer.text, question.includes('흉통') ? /119/ : /중단/);
    }

    await navigate(page, 'training');
    await page.locator('[data-action="training-tab"][data-tab="log"]').click();
    const beforeImport = await state(page);
    await importFile(page, '{broken synthetic JSON');
    await page.locator('#toast.toast-error').waitFor();
    assert.deepEqual(await state(page), beforeImport, 'malformed training JSON cannot erase existing records');
    assert.equal(await page.locator('#trainingImportPreview').count(), 0);
    await page.keyboard.press('Escape');
    const incoming = structuredClone(beforeImport.training);
    incoming.records = [structuredClone(incoming.records.find(record => record.id === copied.id))];
    incoming.records[0].exercises[0].sets[0].reps = 13;
    const exchange = TrainingStore.exportExchange(incoming);
    await importFile(page, exchange);
    await page.locator('#trainingImportPreview').waitFor();
    assert.deepEqual(await state(page), beforeImport, 'preview must not commit a conflicting JSON record');
    assert.match(await page.locator('#trainingImportPreview').innerText(), /보류 1/);
    await page.locator('[data-action="training-conflict"]').click();
    await page.keyboard.press('Escape');
    assert.deepEqual(await state(page), beforeImport);
    await page.locator('#trainingImportPreview [data-action="training-import-cancel"]').first().click();
    await importFile(page, exchange);
    await page.locator('[data-action="training-conflict"]').click();
    await page.locator('#entryForm [name="replace"]').check();
    const backupEvent = page.waitForEvent('download');
    await submit(page);
    const backupDownload = await backupEvent;
    const backupPath = path.join(temporary, 'before-conflict.json');
    await backupDownload.saveAs(backupPath);
    assert.deepEqual(Storage.parseBackup(fs.readFileSync(backupPath, 'utf8')).state.training.records, beforeImport.training.records, 'explicit conflict resolution exports the previous records');
    saved = await state(page);
    assert.equal(saved.training.records.length, 2);
    assert.equal(saved.training.records.find(record => record.id === copied.id).exercises[0].sets[0].reps, 13);
    assert.deepEqual(saved.days[today], frozenDay);
    if (await page.locator('#trainingImportPreview').count()) await page.locator('#trainingImportPreview [data-action="training-import-cancel"]').first().click();

    await navigate(page, 'coach');
    await sendChat(page, '합성 기록으로 AI 완료 흐름 확인');
    await page.locator('[data-action="coach-job-cancel"]').waitFor();
    assert.equal(runtime.jobs.length, 1);
    runtime.complete(result('chat', { answer: '테스트 AI 완료 응답', questions: ['장비 기준을 확인했나요?'], uncertainties: ['같은 머신인지 확인되지 않았어요.'], coaching: { claims: [], followUp: { topic: 'training', note: '같은 장비와 표기 기준 다시 확인', reviewDate: today } } }));
    await page.getByText('테스트 AI 완료 응답', { exact: false }).waitFor();
    assert.equal((await state(page)).training.messages.at(-1).source, 'codex');
    assert.match((await state(page)).training.messages.at(-1).text, /판단의 한계: 같은 머신인지 확인되지 않았어요\./, 'AI uncertainty is persisted with the answer');
    assert.equal((await state(page)).training.followUps.length, 0, 'AI proposal cannot silently create an agreed follow-up');
    await page.locator('[data-action="coach-followup-proposal"]').click();
    assert.equal(await page.locator('#entryForm [name="note"]').inputValue(), '같은 장비와 표기 기준 다시 확인');
    await submit(page);
    assert.equal((await state(page)).training.followUps.length, 1);
    assert.equal(await page.locator('[data-action="coach-followup-proposal"]').count(), 0);
    await sendChat(page, '합성 기록으로 AI 취소 및 재시도 확인');
    await page.locator('[data-action="coach-job-cancel"]').waitFor();
    await page.locator('[data-action="coach-job-cancel"]').click();
    await page.locator('[data-action="coach-job-retry"]').waitFor();
    assert.equal(runtime.jobs.at(-1).status, 'cancelled');
    await page.locator('[data-action="coach-job-retry"]').click();
    await page.locator('[data-action="coach-job-cancel"]').waitFor();
    assert.equal(runtime.jobs.at(-1).retry, true);
    runtime.complete(result('chat', { answer: '테스트 AI 재시도 완료 응답' }));
    await page.getByText('테스트 AI 재시도 완료 응답', { exact: false }).waitFor();

    const beforeImage = await state(page);
    await uploadImage(page, 'workout');
    await page.waitForFunction(() => document.querySelector('#view-training')?.hidden === false);
    assert.equal(runtime.jobs.at(-1).kind, 'workout');
    runtime.complete(result('workout', { uncertainties: ['중량은 읽을 수 없어요.'], workouts: [{ date: yesterday, time: null, label: '이미지 합성 운동', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, uncertainties: [], exercises: [{ rawName: '미확인 이미지 종목', reportedVolumeKg: null, loadConvention: 'as-recorded', durationMinutes: null, repsTotal: null, sets: [{ loadKg: null, reps: 12, marker: 'A' }] }] }] }));
    await page.locator('[data-action="image-workout-preview"]').waitFor();
    assert.deepEqual((await state(page)).training.records, beforeImage.training.records, 'AI completion only creates a preview');
    await page.locator('[data-action="image-workout-preview"]').click();
    assert.equal(await page.locator('[data-action="training-import-confirm"]').isDisabled(), true, 'whole image draft must be reviewed before saving');
    await page.locator('#imageWorkoutReviewed').check();
    await page.locator('[data-action="training-import-confirm"]').click();
    saved = await state(page);
    const imageRecord = saved.training.records.find(record => record.label === '이미지 합성 운동');
    assert.ok(imageRecord);
    assert.equal(imageRecord.exercises[0].sets[0].loadKg, null);
    assert.equal(imageRecord.exercises[0].sets[0].rir, null);
    assert.equal(imageRecord.exercises[0].sets[0].marker, 'A');
    assert.equal(imageRecord.source.kind, 'visual');
    assert.equal(imageRecord.source.hash.length, 64);
    assert.deepEqual(saved.days, beforeImage.days, 'image workouts cannot silently change food or expenditure');

    await uploadImage(page, 'meal');
    assert.equal(runtime.jobs.at(-1).kind, 'meal');
    runtime.complete(result('meal', { meal: { date: yesterday, name: '미확인 이미지 식사', protein: null, carbs: null, fat: null, otherKcal: null, alcoholG: null, basis: 'estimate', note: '분량을 확인하지 못한 합성 초안' } }));
    await page.locator('[data-action="image-meal-confirm"]').waitFor();
    await page.locator('[data-action="image-meal-confirm"]').click();
    for (const key of ['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG']) assert.equal(await page.locator(`#entryForm [name="${key}"]`).inputValue(), '', 'unknown nutrients stay blank');
    await page.locator('#entryForm [name="confirmed"]').check();
    await page.locator('#entryForm button[type="submit"]').click();
    assert.equal(await page.locator('#entryDialog').isVisible(), true, 'unknown required nutrients must not save as zero');
    assert.deepEqual((await state(page)).days, beforeImage.days);
    for (const [key, value] of Object.entries({ protein: 20, carbs: 30, fat: 10, otherKcal: 0, alcoholG: 0 })) await page.locator(`#entryForm [name="${key}"]`).fill(String(value));
    await submit(page);
    await page.locator('#view-today').waitFor({ state: 'visible' });
    assert.match(await page.locator('.meal-section .source-badge').innerText(), /이미지 판독.*추정값/, 'saved image estimates remain visibly distinguished from known label values');
    assert.equal((await state(page)).days[yesterday].meals.at(-1).source.confidence, 'estimated');

    await navigate(page, 'today');
    await page.locator('#dayDate').fill(yesterday);
    await page.locator('#dayDate').dispatchEvent('change');
    await page.locator('#view-today .body-summary [data-action="measurement"]').click();
    for (const [key, value] of Object.entries({ weightKg: 65, bodyFatPct: 30, skeletalMuscleKg: 25 })) await page.locator(`#entryForm [name="${key}"]`).fill(String(value));
    await page.locator('#entryForm [name="bodyFatMethod"]').selectOption('bia');
    await submit(page);
    const beforeBody = await state(page);
    await uploadImage(page, 'body');
    const bodyJob = runtime.jobs.at(-1);
    runtime.complete(result('body', { body: { date: yesterday, weightKg: 64, bodyFatPct: null, skeletalMuscleKg: null, method: 'bia' } }));
    await page.locator('[data-action="image-body-confirm"]').waitFor();
    assert.deepEqual((await state(page)).days, beforeBody.days);
    const jobsBeforeReload = runtime.jobs.length;
    const listedAfterReload = page.waitForResponse(response => response.url().endsWith('/api/jobs') && response.request().method() === 'GET');
    await page.reload();
    assert.equal((await listedAfterReload).status(), 200);
    await navigate(page, 'training');
    await page.locator('.image-inbox > summary').click();
    await page.locator(`[data-action="image-job-open"][data-id="${bodyJob.id}"]`).click();
    await page.locator('[data-action="image-body-confirm"]').click();
    assert.equal(runtime.jobs.length, jobsBeforeReload, 'reopening an image draft reuses the cached result without new AI calls');
    assert.equal(await page.locator('#entryForm [name="bodyMode"]').inputValue(), 'merge');
    await page.locator('#entryForm [name="confirmed"]').check();
    await page.locator('#entryForm button[type="submit"]').click();
    assert.equal(await page.locator('#entryDialog').isVisible(), true, 'same-date measurements require an explicit relation review');
    assert.deepEqual((await state(page)).days, beforeBody.days);
    await page.locator('#entryForm [name="bodyMergeConfirmed"]').check();
    await submit(page);
    let bodyDay = (await state(page)).days[yesterday];
    assert.equal(bodyDay.weightKg, 64);
    assert.equal(bodyDay.bodyFatPct, 30, 'unread body fat does not erase the existing same-measurement value');
    assert.equal(bodyDay.skeletalMuscleKg, 25);
    assert.equal(bodyDay.bodyFatMethod, 'bia');
    await navigate(page, 'training');
    await page.locator('.image-inbox > summary').click();
    await page.locator(`[data-action="image-job-open"][data-id="${bodyJob.id}"]`).click();
    await page.locator('[data-action="image-body-confirm"]').click();
    await page.locator('#entryForm [name="bodyMode"]').selectOption('replace');
    await page.locator('#entryForm [name="bodyMergeConfirmed"]').check();
    await page.locator('#entryForm [name="confirmed"]').check();
    await submit(page);
    bodyDay = (await state(page)).days[yesterday];
    assert.equal(bodyDay.weightKg, 64);
    assert.equal(bodyDay.bodyFatPct, null, 'only explicit replacement clears an unread previous measurement');
    assert.equal(bodyDay.skeletalMuscleKg, null);
    assert.deepEqual((await state(page)).days[today], frozenDay);
    await page.locator('#dayDate').fill(today);
    await page.locator('#dayDate').dispatchEvent('change');
    await page.locator('#toast').waitFor({ state: 'hidden', timeout: 12000 });

    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['today', 'coach', 'training', 'trends', 'profile', 'data']) {
        await navigate(page, view);
        await overflow(page, `${width}/${view}`);
        if (view === 'training') {
          for (const tab of ['log', 'analysis', 'program']) {
            await page.locator(`[data-action="training-tab"][data-tab="${tab}"]`).click();
            await overflow(page, `${width}/training/${tab}`);
            await page.screenshot({ path: path.join(artifacts, `training-${width}-${tab}.png`), fullPage: true });
          }
        } else if (view === 'coach') await page.screenshot({ path: path.join(artifacts, `training-${width}-coach.png`), fullPage: true });
      }
      await navigate(page, 'training');
      await page.locator('#trainingContent [data-action="training-add"]').click();
      await overflow(page, `${width}/workout-editor`);
      const formSize = await page.locator('#entryDialog').evaluate(element => ({ width: element.clientWidth, actual: element.scrollWidth }));
      assert.ok(formSize.actual <= formSize.width + 1, `workout editor overflow at ${width}px`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#entryDialog').isVisible(), false, 'keyboard Escape closes editor without saving');
    }
    const beforeReload = await state(page);
    await page.reload();
    assert.deepEqual(await state(page), beforeReload, 'records, mappings, settings, conversation and snapshots survive reload');
    const diskStatePath = path.join(temporary, 'private', 'app-state.json');
    assert.equal(fs.existsSync(diskStatePath), false, 'opening the app must not silently replace a PC record');
    await navigate(page, 'training');
    const attached = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'POST');
    await page.locator('#trainingContent [data-action="bridge-connect"]').click();
    assert.equal((await attached).status(), 200);
    assert.deepEqual(Storage.validateState(JSON.parse(fs.readFileSync(diskStatePath, 'utf8'))), beforeReload, 'explicit connection writes only the synthetic private directory');

    allowNetworkFailure = true;
    const failSync = route => route.request().method() === 'POST' ? route.abort('failed') : route.continue();
    await page.route('**/api/state', failSync);
    await page.locator('[data-action="training-tab"][data-tab="program"]').click();
    await page.locator('[data-action="program-settings"]').click();
    await page.locator('#entryForm [name="sessionMinutes"]').fill('35');
    await submit(page);
    await page.locator('#trainingContent .connection-error [data-action="bridge-connect"]').waitFor();
    assert.equal((await state(page)).training.settings.sessionMinutes, 35, 'failed PC sync preserves the new browser record');
    assert.equal(JSON.parse(fs.readFileSync(diskStatePath, 'utf8')).training.settings.sessionMinutes, 30, 'failed sync preserves the previous PC record');
    await page.unroute('**/api/state', failSync);
    allowNetworkFailure = false;
    assert.equal(expectedNetworkErrors.length, 1, 'only the intentionally injected network failure is tolerated');
    await page.locator('#trainingContent .connection-error [data-action="bridge-connect"]').click();
    await page.locator('#entryForm [name="choice"]').selectOption('upload');
    await page.locator('#entryForm [name="confirmed"]').check();
    const reattached = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'POST');
    const reconnectBackup = page.waitForEvent('download');
    await submit(page);
    assert.equal((await reattached).status(), 200);
    await reconnectBackup;
    assert.deepEqual(Storage.validateState(JSON.parse(fs.readFileSync(diskStatePath, 'utf8'))), await state(page), 'visible reconnection uploads the selected browser version');
    assert.equal(await page.locator('#trainingContent .connection-error').count(), 0);
    assert.deepEqual(errors, [], 'no browser runtime or console errors');
    console.log('Primary training browser flow passed; checking saved programs and connection recovery.');
    await verifyProgramWorkflow(browser, temporary, artifacts);
    await verifyConversationRecovery(browser, temporary, artifacts);
    console.log('Training browser acceptance passed: synthetic private server; manual workout, set draft/focus, equipment mapping, reuse, observed progression, nutrition link deduplication and completed snapshot lock; program drafts; separate record summary, AI-only chat draft retention, preserved legacy-local original-question continuation and urgent safety; delayed-start lock, conversation scrolling and token/initial-connection recovery; JSON preview/conflict backup; fake AI completion/cancellation/retry and uncertainty; explicitly selected image analysis, cached image resume, unknown values, body measurement merge/replacement review; PC sync failure/reconnection; six views and training tabs at 320/390/1280px; keyboard and reload.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'training-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    const target = path.resolve(temporary);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('macro-training-browser-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
