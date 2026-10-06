'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const TrainingStore = require('../src/training-store.js');
const Insights = require('../src/insights.js');
const { createServer } = require('../tools/serve.cjs');

const today = Insights.dateKey(), yesterday = Insights.shiftDate(today, -1);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };

// A mutable boundary stub tests connection changes without starting AI or reading a diary.
function fakeRuntime() {
  const jobs = [];
  return {
    available: false, jobs, startError: null, attempts: [],
    status() { return { available: this.available, running: jobs.find(row => row.status === 'running')?.id || null }; },
    start(input, imageFile, retry) {
      assert.equal(this.available, true, 'unavailable AI must not be invoked');
      this.attempts.push({ kind: input.kind, question: input.question, imageHash: input.imageHash });
      if (this.startError) { const error = this.startError; this.startError = null; throw new Error(error); }
      assert.equal(jobs.some(row => row.status === 'running'), false);
      const contextDigest = crypto.createHash('sha256').update(JSON.stringify({ input, attempt: jobs.length })).digest('hex');
      const job = { id: contextDigest.slice(0, 32), contextDigest, kind: input.kind, question: input.question, imageHash: input.imageHash, createdAt: new Date().toISOString(), status: 'running', result: null, error: null, retry: Boolean(retry) };
      jobs.push(job); return { ...job };
    },
    get: id => jobs.find(row => row.id === id) || null,
    list: () => jobs.map(({ result, question, ...summary }) => summary).reverse(),
    complete(answer) { Object.assign(jobs.at(-1), { status: 'completed', result: { kind: 'chat', answer, questions: [], uncertainties: [], workouts: [], meal: null, body: null } }); },
    fail(error = '합성 AI 연결 실패: 원문 질문은 남아 있어요.') { Object.assign(jobs.at(-1), { status: 'failed', result: null, error }); },
    cancel(id) { const row = jobs.find(job => job.id === id); if (row) Object.assign(row, { status: 'cancelled', error: '합성 요청 취소' }); return row; },
    close() {}
  };
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), Storage.STORAGE_KEY); }
async function navigate(page, view) { await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' }); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); }
async function openInbox(page) { if (!await page.locator('.image-inbox').evaluate(element => element.open)) await page.locator('.image-inbox > summary').click(); }
async function overflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(size.actual <= size.viewport + 1, `${label}: ${JSON.stringify(size)}`);
}
async function send(page, question) { await page.locator('#coachChatInput').fill(question); await page.locator('#coachChatForm button[type="submit"]').click(); }

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-offline-intake-'));
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const runtime = fakeRuntime(), server = createServer({ bridge: { data: path.join(temporary, 'private'), runtime } });
  let browser, page, jobPosts = 0, expectedListFailure = false, expectedStartFailure = false, releaseOldImage;
  const errors = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const initial = Storage.createEmpty(); initial.profile = profile; initial.training = TrainingStore.createEmpty();
    const oldQuestion = '이전 합성 자유 질문 <script>실행 금지</script>';
    initial.training.messages = [
      { id: 'offline-history-user', role: 'user', text: oldQuestion, createdAt: `${today}T00:00:00.000Z`, source: 'local', replyTo: null, contextDigest: null, status: 'answered' },
      { id: 'offline-history-local', role: 'coach', text: '과거 로컬 안내를 그대로 보존하는 합성 기록입니다.', createdAt: `${today}T00:00:01.000Z`, source: 'local', replyTo: 'offline-history-user', contextDigest: null, status: 'answered' }
    ];
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: Storage.STORAGE_KEY, value: Storage.validateState(initial) });
    page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !(expectedListFailure && /503/.test(message.text()) || expectedStartFailure && /400/.test(message.text()))) errors.push(message.text()); });
    page.on('request', request => { if (request.url().endsWith('/api/jobs') && request.method() === 'POST') jobPosts += 1; });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url); await navigate(page, 'coach');
    await page.locator('.conversation-unavailable').waitFor();
    assert.match(await page.locator('.conversation-unavailable').innerText(), /Codex 없이 사용할 수/);
    assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0);
    assert.equal(await page.locator('#coachChatInput').count(), 0);
    assert.equal(await page.locator('#coachChatForm').count(), 0);
    assert.match(await page.locator('.coach-record-summary').innerText(), /기록 요약/);
    assert.match(await page.locator('.conversation-message').last().textContent(), /이전 기록 안내/);
    assert.deepEqual((await state(page)).training.messages, initial.training.messages);
    assert.equal(await page.locator('.conversation-log script').count(), 0);
    await page.locator('.conversation-saved > summary').first().click();
    await page.evaluate(() => {
      const form = document.createElement('form'); form.id = 'coachChatForm';
      const input = document.createElement('textarea'); input.id = 'coachChatInput'; form.append(input);
      document.body.append(form);
    });
    await page.locator('#coachChatInput').evaluate(element => { element.value = 'AI가 없을 때 상세한 훈련 조언을 만들어 줘'; });
    await page.locator('#coachChatForm').dispatchEvent('submit');
    await page.locator('#toast.toast-error').waitFor();
    assert.deepEqual((await state(page)).training.messages, initial.training.messages, 'a guarded submit cannot masquerade as a local AI answer');
    assert.equal(jobPosts, 0);
    await page.locator('#coachChatForm').evaluate(element => element.remove());

    await navigate(page, 'training');
    await page.locator('#trainingContent [data-action="training-add"]').first().focus(); await page.keyboard.press('Enter');
    await page.locator('[name="date"]').fill(yesterday); await page.locator('[name="label"]').fill('AI 없이 직접 기록한 합성 운동');
    await page.locator('[name="exercise-0"]').fill('바벨 로우');
    for (const [name, value] of Object.entries({ '0-0-loadKg': 30, '0-0-reps': 10, '0-0-rir': 2 })) await page.locator(`#entryForm [name="${name}"]`).fill(String(value));
    await submit(page);
    const original = (await state(page)).training.records[0];
    assert.equal(original.source.kind, 'manual');
    await page.locator('[data-action="training-reuse"]').click();
    assert.equal(await page.locator('[name="date"]').inputValue(), today);
    assert.equal(await page.locator('[name="0-0-rir"]').inputValue(), '', 'reusing a workout cannot copy an observed RIR');
    await page.locator('[name="0-0-reps"]').fill('12'); await submit(page);
    let saved = await state(page);
    assert.equal(saved.training.records.length, 2);
    assert.notEqual(saved.training.records[1].exercises[0].sets[0].id, original.exercises[0].sets[0].id);
    assert.equal(Object.keys(saved.days).length, 0, 'manual training and reuse do not fabricate nutrition days');

    await navigate(page, 'today'); await page.locator('.meal-section [data-action="meal-add"]').click();
    await page.locator('[name="name"]').fill('AI 없이 직접 기록한 합성 식사');
    for (const [name, value] of Object.entries({ protein: 25, carbs: 50, fat: 10 })) await page.locator(`#entryForm [name="${name}"]`).fill(String(value));
    await submit(page); await page.locator('#view-today .body-summary [data-action="measurement"]').click();
    for (const [name, value] of Object.entries({ weightKg: 65.3, bodyFatPct: 24, skeletalMuscleKg: 22.5 })) await page.locator(`#entryForm [name="${name}"]`).fill(String(value));
    await page.locator('#entryForm [name="bodyFatMethod"]').selectOption('bia'); await submit(page);
    saved = await state(page); assert.equal(saved.days[today].meals[0].protein, 25);
    assert.equal(saved.days[today].weightKg, 65.3); assert.equal(saved.days[today].bodyFatPct, 24); assert.equal(saved.days[today].skeletalMuscleKg, 22.5);
    assert.equal(saved.days[today].sessions.length, 0); assert.equal(runtime.jobs.length, 0);

    const beforePhoto = saved;
    await navigate(page, 'training'); await page.locator('#trainingContent [data-action="training-image"]').click();
    await page.locator('#imageKind').selectOption('workout');
    const note = '합성 보관 메모: 한쪽 중량인지 다음 판독 때 확인 <script>실행 금지</script>';
    await page.locator('#imageNote').fill(note);
    assert.equal(await page.locator('#imageAnalyze').isChecked(), false);
    assert.equal(await page.locator('#imageAnalyze').isDisabled(), true);
    assert.match(await page.locator('#entryForm button[type="submit"]').innerText(), /사진 보관/);
    await page.locator('#coachImageFile').setInputFiles({ name: 'synthetic-offline-workout.png', mimeType: 'image/png', buffer: PNG });
    const upload = page.waitForResponse(response => response.url().endsWith('/api/inbox') && response.request().method() === 'POST');
    await submit(page); assert.equal((await upload).status(), 200);
    await openInbox(page);
    const row = page.locator('.inbox-row[data-image-hash]'); await row.waitFor();
    assert.match(await row.innerText(), /사진만 보관.*미판독/);
    assert.equal(await row.locator('[data-action="image-source-start"]').isDisabled(), true);
    assert.equal(await page.locator('[data-action="image-workout-preview"]').count(), 0);
    assert.equal(await page.locator('[data-action="image-meal-confirm"]').count(), 0);
    assert.equal(await page.locator('[data-action="image-body-confirm"]').count(), 0);
    assert.deepEqual(await state(page), beforePhoto, 'a stored photo is not an extracted or confirmed diary');
    assert.equal(runtime.jobs.length, 0); assert.equal(jobPosts, 0);
    await row.locator('[data-action="image-source-start"]').evaluate(element => { element.disabled = false; });
    await row.locator('[data-action="image-source-start"]').dispatchEvent('click');
    await page.locator('#toast.toast-error').waitFor();
    assert.equal(runtime.jobs.length, 0, 'a forged unavailable analyze click is also guarded');
    assert.equal(await page.locator('#entryDialog').isVisible(), false);

    await page.locator('#trainingContent [data-action="training-image"]').click();
    await page.locator('#imageKind').selectOption('meal'); await page.locator('#imageNote').fill('중복 사진에 새로 적은 다른 메모');
    await page.locator('#coachImageFile').setInputFiles({ name: 'synthetic-duplicate.png', mimeType: 'image/png', buffer: PNG });
    const repeated = page.waitForResponse(response => response.url().endsWith('/api/inbox') && response.request().method() === 'POST');
    await submit(page);
    const repeatedResult = await (await repeated).json();
    assert.equal(repeatedResult.reused, true); assert.equal(repeatedResult.metadataConflict, true);
    assert.equal(repeatedResult.kind, 'workout'); assert.equal(repeatedResult.note, note);
    assert.match(await page.locator('#toast').innerText(), /기존 종류와 메모를 유지/);
    assert.deepEqual(await state(page), beforePhoto); assert.equal(jobPosts, 0);

    const listed = page.waitForResponse(response => response.url().endsWith('/api/inbox') && response.request().method() === 'GET');
    await page.reload(); assert.equal((await listed).status(), 200); await navigate(page, 'training');
    await openInbox(page);
    assert.equal(await page.locator('.inbox-row[data-image-hash]').count(), 1);
    const inbox = await (await page.request.get(`${url}/api/inbox`)).json();
    assert.equal(inbox.images.length, 1); assert.equal(inbox.images[0].note, note); assert.equal(inbox.images[0].kind, 'workout');
    assert.equal(inbox.images[0].hash, crypto.createHash('sha256').update(PNG).digest('hex'));
    assert.deepEqual(await state(page), beforePhoto); assert.equal(jobPosts, 0);
    assert.equal(await page.locator('.image-inbox script').count(), 0, 'stored metadata is not executable HTML');
    assert.equal(await page.locator('.inbox-row[data-image-hash]').innerText().then(text => text.includes(note)), true);

    let failedLists = 0;
    const failList = route => {
      if (route.request().method() === 'GET' && failedLists === 0) {
        failedLists += 1;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '합성 보관 목록 조회 실패' }) });
      }
      return route.continue();
    };
    await page.route('**/api/inbox', failList); expectedListFailure = true;
    await navigate(page, 'coach');
    const failedList = page.waitForResponse(response => response.url().endsWith('/api/inbox') && response.status() === 503);
    await page.locator('.conversation-unavailable [data-action="bridge-refresh"]').click(); await failedList;
    await navigate(page, 'training'); await openInbox(page);
    await page.locator('.image-inbox .notice-warning[role="alert"]').waitFor();
    assert.match(await page.locator('.image-inbox').innerText(), /보관 목록을 불러오지 못했어요/);
    assert.doesNotMatch(await page.locator('.image-inbox').innerText(), /보관한 이미지가 없어요/);
    assert.equal(await page.locator('.inbox-row[data-image-hash]').count(), 1, 'a failed list read preserves the previously confirmed photo');
    assert.match(await page.locator('.image-inbox > summary').innerText(), /조회 확인 필요/);
    const retriedList = page.waitForResponse(response => response.url().endsWith('/api/inbox') && response.status() === 200);
    await page.locator('.image-inbox [data-action="bridge-refresh"]').click(); await retriedList;
    await page.waitForFunction(() => !document.querySelector('.image-inbox .notice-warning[role="alert"]'));
    expectedListFailure = false; await page.unroute('**/api/inbox', failList); await openInbox(page);
    assert.equal(await page.locator('.inbox-row[data-image-hash]').count(), 1);
    assert.deepEqual(await state(page), beforePhoto); assert.equal(jobPosts, 0);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await overflow(page, `${width}/stored-photo`);
      await page.screenshot({ path: path.join(artifacts, `offline-intake-${width}-training.png`), fullPage: true });
      await navigate(page, 'coach'); await overflow(page, `${width}/unavailable-coach`);
      await page.locator('[data-action="coach-memory"]').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#entryDialog').isVisible(), true); await overflow(page, `${width}/offline-memory`);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-action="coach-memory"]').evaluate(element => element === document.activeElement), true);
      await page.screenshot({ path: path.join(artifacts, `offline-intake-${width}-coach.png`), fullPage: true });
      await navigate(page, 'training');
      await openInbox(page);
    }

    runtime.available = true;
    await navigate(page, 'coach');
    await page.locator('.conversation-unavailable [data-action="bridge-refresh"]').click();
    await page.waitForFunction(() => document.querySelector('#coachChatInput')?.disabled === false);
    assert.equal(await page.locator('[data-action="coach-provider"]').count(), 0);
    assert.equal(await page.locator('#coachChatForm button[type="submit"]').isDisabled(), false);
    assert.deepEqual((await state(page)).training.messages, initial.training.messages);
    await navigate(page, 'training');
    await openInbox(page);
    const availableSource = page.locator('.inbox-row[data-image-hash] [data-action="image-source-start"]');
    assert.equal(await availableSource.isDisabled(), false);
    await availableSource.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#entryForm [name="kind"]').inputValue(), 'workout');
    assert.equal(await page.locator('#entryForm [name="note"]').inputValue(), note, 'an eventual AI read starts with the note retained alongside the photo');
    assert.equal(jobPosts, 0, 'opening a stored-photo review does not start a paid AI request');
    const editedReadNote = '보관 메모와 별개인 합성 후속 판독 요청: 실제 분량은 절반';
    await page.locator('#entryForm [name="kind"]').selectOption('meal'); await page.locator('#entryForm [name="note"]').fill(editedReadNote);
    runtime.startError = '합성 계정 한도 또는 로그인 확인이 필요해요.'; expectedStartFailure = true;
    const rejectedRead = page.waitForResponse(response => response.url().endsWith('/api/jobs') && response.request().method() === 'POST');
    await page.locator('#entryForm button[type="submit"]').click(); assert.equal((await rejectedRead).status(), 400);
    await page.locator('#entryErrors').filter({ hasText: '합성 계정 한도 또는 로그인 확인이 필요해요.' }).waitFor();
    expectedStartFailure = false;
    assert.equal(await page.locator('#entryDialog').isVisible(), true, 'a rejected read retains its form instead of discarding the retry context');
    assert.equal(await page.locator('#entryForm [name="kind"]').inputValue(), 'meal');
    assert.equal(await page.locator('#entryForm [name="note"]').inputValue(), editedReadNote);
    assert.deepEqual(runtime.attempts.at(-1), { kind: 'meal', question: editedReadNote, imageHash: inbox.images[0].hash });
    assert.equal(runtime.jobs.length, 0); assert.deepEqual(await state(page), beforePhoto);
    const afterRejectedRead = await (await page.request.get(`${url}/api/inbox`)).json();
    assert.equal(afterRejectedRead.images[0].kind, 'workout'); assert.equal(afterRejectedRead.images[0].note, note, 'retry edits do not rewrite the original stored photo metadata');
    assert.deepEqual((await state(page)).training.messages, initial.training.messages, 'an image-start failure does not create a fake coach answer');
    const rejectedReadPosts = jobPosts;
    await page.keyboard.press('Escape'); await navigate(page, 'coach');
    await page.locator('[data-action="coach-continue"]').first().click();
    assert.equal(await page.locator('#coachChatInput').inputValue(), oldQuestion);
    assert.equal(jobPosts, rejectedReadPosts, 'continuing an old local question only prepares the original question');
    await send(page, '합성 기록과 함께 원인을 자세히 검토해 줘');
    await page.locator('[data-action="coach-job-cancel"]').waitFor(); assert.equal(runtime.jobs.length, 1); assert.equal(jobPosts, rejectedReadPosts + 1);
    runtime.complete('합성 AI만 제공하는 자유 질문 응답입니다.');
    await page.getByText('합성 AI만 제공하는 자유 질문 응답입니다.', { exact: true }).waitFor();
    assert.equal((await state(page)).training.messages.at(-1).source, 'codex');
    const beforeFailure = await state(page);
    await send(page, '합성 AI 실패를 검사할 상세 질문'); await page.locator('[data-action="coach-job-cancel"]').waitFor();
    runtime.fail(); await page.locator('.conversation-message').last().filter({ hasText: '합성 AI 연결 실패: 원문 질문은 남아 있어요.' }).waitFor();
    saved = await state(page); assert.equal(saved.training.messages.length, beforeFailure.training.messages.length + 2);
    assert.equal(saved.training.messages.at(-1).source, 'codex'); assert.match(saved.training.messages.at(-1).text, /실패/);
    assert.deepEqual(saved.days, beforeFailure.days); assert.deepEqual(saved.training.records, beforeFailure.training.records);
    assert.equal(saved.training.messages.filter(row => row.role === 'coach' && row.source === 'local').length, 1, 'an AI failure never substitutes a fabricated local coach answer');

    const languageQuestion = '최근 걷기 기록에서 다음 운동을 어떻게 이어갈까요?', beforeLanguageFailure = await state(page);
    await send(page, languageQuestion); await page.locator('[data-action="coach-job-cancel"]').waitFor();
    const rejectedJob = runtime.jobs.at(-1);
    runtime.fail('한국어 상담 답변이 아니어서 표시하지 않았어요. 기록과 원본 응답은 유지됩니다. 다시 요청해 주세요.');
    await page.locator('.conversation-message').last().filter({ hasText: '한국어 상담 답변이 아니어서' }).waitFor();
    const rejectedState = await state(page);
    assert.equal(rejectedState.training.messages.at(-2).text, languageQuestion);
    assert.equal(rejectedState.training.messages.at(-1).text, rejectedJob.error, 'the failed answer states the actual reason without adding misleading connection instructions');
    assert.doesNotMatch(rejectedState.training.messages.at(-1).text, /연결을 확인/);
    assert.deepEqual(rejectedState.days, beforeLanguageFailure.days);
    assert.deepEqual(rejectedState.training.records, beforeLanguageFailure.training.records);
    assert.equal(rejectedJob.result, null);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await overflow(page, `${width}/language-failure`);
      assert.equal(await page.locator('[data-action="coach-job-retry"]').isVisible(), true);
      const retryBounds = await page.locator('[data-action="coach-job-retry"]').boundingBox();
      assert.ok(retryBounds.width >= 72 && retryBounds.height <= 52, `retry label stays horizontal at ${width}px: ${JSON.stringify(retryBounds)}`);
      assert.equal(await page.getByText('优先维持最近的步行安排。', { exact: true }).count(), 0);
      const skipLink = await page.locator('.skip-link').evaluate(element => ({ focused: element === document.activeElement, bottom: element.getBoundingClientRect().bottom }));
      assert.ok(skipLink.focused || skipLink.bottom <= 0, 'the skip link is only visible while keyboard-focused');
      await page.locator('.job-status').screenshot({ path: path.join(artifacts, `offline-intake-language-retry-${width}.png`) });
      await page.screenshot({ path: path.join(artifacts, `offline-intake-language-viewport-${width}.png`) });
      await page.locator('.personal-conversation').screenshot({ path: path.join(artifacts, `offline-intake-language-panel-${width}.png`) });
      await page.screenshot({ path: path.join(artifacts, `offline-intake-language-failure-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 900 });
    const requestsBeforeRetry = jobPosts;
    await page.locator('[data-action="coach-job-retry"]').focus(); await page.keyboard.press('Enter');
    await page.locator('[data-action="coach-job-cancel"]').waitFor();
    assert.equal(jobPosts, requestsBeforeRetry + 1);
    assert.equal(runtime.jobs.at(-1).question, languageQuestion, 'retry preserves the original question');
    assert.equal(runtime.jobs.at(-1).retry, true);
    runtime.complete('최근 걷기 구성을 이어가고, 끝날 때의 호흡과 다음 날 몸 상태를 보고 다음 변화를 고르세요.');
    await page.getByText('최근 걷기 구성을 이어가고, 끝날 때의 호흡과 다음 날 몸 상태를 보고 다음 변화를 고르세요.', { exact: true }).waitFor();
    assert.deepEqual((await state(page)).training.records, beforeLanguageFailure.training.records);
    const requestsBeforeSafety = jobPosts;
    await send(page, '지금 흉통과 호흡곤란이 있어요.');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).training.messages.at(-1).text.includes('119'), Storage.STORAGE_KEY);
    saved = await state(page); assert.equal(saved.training.messages.at(-1).source, 'local'); assert.equal(jobPosts, requestsBeforeSafety);
    assert.match(await page.locator('.conversation-message').last().innerText(), /즉시 안전 안내/);
    await overflow(page, '320/AI-only-coach');
    await page.screenshot({ path: path.join(artifacts, 'offline-intake-320-ai-coach.png'), fullPage: true });

    const olderDigest = crypto.createHash('sha256').update('synthetic-old-image-open-race').digest('hex');
    const olderImage = { id: olderDigest.slice(0, 32), contextDigest: olderDigest, kind: 'workout', question: '과거 합성 이미지', imageHash: inbox.images[0].hash, createdAt: new Date().toISOString(), status: 'completed', error: null,
      result: { kind: 'workout', answer: '지연된 과거 이미지 초안', questions: [], uncertainties: [], workouts: [], meal: null, body: null } };
    runtime.jobs.push(olderImage);
    await page.reload(); await navigate(page, 'training'); await openInbox(page);
    const heldRead = new Promise(resolve => { releaseOldImage = resolve; });
    const delayRead = async route => { await heldRead; await route.continue(); };
    await page.route(`**/api/jobs/${olderImage.id}`, delayRead);
    const oldReadStarted = page.waitForRequest(request => request.url().endsWith(`/api/jobs/${olderImage.id}`));
    await page.locator(`[data-action="image-job-open"][data-id="${olderImage.id}"]`).click(); await oldReadStarted;
    await navigate(page, 'coach');
    const beforeRace = await state(page), racePosts = jobPosts;
    await send(page, '이전 이미지 조회와 경합하는 새 합성 AI 상담'); await page.locator('[data-action="coach-job-cancel"]').waitFor();
    const activeChat = runtime.jobs.at(-1); assert.equal(activeChat.kind, 'chat'); assert.equal(activeChat.status, 'running');
    assert.equal(jobPosts, racePosts + 1);
    const lateRead = page.waitForResponse(response => response.url().endsWith(`/api/jobs/${olderImage.id}`));
    releaseOldImage(); assert.equal((await lateRead).status(), 200); await page.unroute(`**/api/jobs/${olderImage.id}`, delayRead);
    await page.locator('#toast').filter({ hasText: '새 요청이 시작되어 이전 초안은 열지 않았어요' }).waitFor();
    assert.equal(await page.locator('#view-coach [data-action="coach-job-cancel"]').count(), 1, 'the late image response must not replace the active chat job');
    assert.equal(await page.locator('[data-action="image-workout-preview"]').count(), 0, 'a stale result cannot appear as the current image draft');
    assert.deepEqual((await state(page)).days, beforeRace.days); assert.deepEqual((await state(page)).training.records, beforeRace.training.records);
    runtime.complete('경합 후에도 새 합성 AI 상담을 정상 완료했어요.');
    await page.getByText('경합 후에도 새 합성 AI 상담을 정상 완료했어요.', { exact: true }).waitFor();
    saved = await state(page); assert.equal(saved.training.messages.at(-1).source, 'codex');
    assert.equal(saved.training.messages.at(-1).replyTo, saved.training.messages.at(-2).id);
    assert.equal(saved.training.messages.at(-1).contextDigest, activeChat.contextDigest);
    assert.equal(activeChat.status, 'completed');
    assert.deepEqual(errors, []);
    console.log('Offline intake browser passed: unavailable AI keeps manual workouts/reuse/food/body inputs; photos and notes persist without analysis, drafts or state changes; guarded unavailable actions; legacy local history; stored-photo review and rejected-read form retention; one AI conversation after reconnect, failure without fake fallback, immediate safety; late image reads cannot overwrite a new chat; keyboard and 320/390/1280px.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'offline-intake-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    releaseOldImage?.();
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    server.bridge?.close?.();
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('macro-offline-intake-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
