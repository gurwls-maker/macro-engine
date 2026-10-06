'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const TrainingStore = require('../src/training-store.js');
const Training = require('../src/training.js');
const Insights = require('../src/insights.js');
const { createServer } = require('../tools/serve.cjs');

const today = Insights.dateKey();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
function image(name) {
  const value = Buffer.from(`fixture\0${name}`, 'latin1'), chunk = Buffer.alloc(value.length + 12);
  chunk.writeUInt32BE(value.length); chunk.write('tEXt', 4); value.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + value.length)) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + value.length);
  return { name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.concat([PNG.subarray(0, PNG.length - 12), chunk, PNG.subarray(PNG.length - 12)]) };
}
function runtimeStub() {
  const jobs = [];
  return {
    available: false, jobs,
    status() { return { available: this.available, running: jobs.find(row => row.status === 'running')?.id || null }; },
    start(input, file, retry) {
      assert.equal(this.available, true); assert.equal(jobs.some(row => row.status === 'running'), false, 'AI requests are sequential');
      const contextDigest = crypto.createHash('sha256').update(JSON.stringify({ input, attempt: jobs.length })).digest('hex');
      const job = { id: contextDigest.slice(0, 32), contextDigest, kind: input.kind, question: input.question, imageHash: input.imageHash, date: input.context.date, createdAt: new Date().toISOString(), status: 'running', result: null, error: null, retry: Boolean(retry) };
      jobs.push(job); return { ...job };
    },
    get: id => jobs.find(row => row.id === id) || null,
    list: () => jobs.map(({ result, question, ...summary }) => summary).reverse(),
    complete(index, result) { Object.assign(jobs[index], { status: 'completed', result }); },
    cancel(id) { const row = jobs.find(job => job.id === id); if (row) Object.assign(row, { status: 'cancelled', error: '합성 취소' }); return row; },
    close() {}
  };
}
function workoutResult() {
  return { kind: 'workout', answer: '합성 원문 전체 세트 초안', questions: [], uncertainties: ['마지막 세트 중량은 흐려 확인 필요'], meal: null, body: null,
    workouts: [{ date: today, time: null, label: '합성 원암 운동', durationMinutes: 40, reportedSetCount: 22, reportedVolumeKg: null, reportedEnergyKcal: null, uncertainties: [],
      exercises: [{ rawName: 'STA7000 케이블 원 암 시티드 로우', loadConvention: 'total', durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
        sets: Array.from({ length: 22 }, (_, index) => ({ loadKg: index === 21 ? null : 20, reps: index === 21 ? 7 : 10, marker: null })) }] }] };
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), Storage.STORAGE_KEY); }
async function navigate(page, view) { await page.locator(`[data-view="${view}"]`).click(); await page.locator(`#view-${view}`).waitFor({ state: 'visible' }); }
async function openInbox(page) { if (!await page.locator('.image-inbox').evaluate(element => element.open)) await page.locator('.image-inbox > summary').click(); }
async function addPhotos(page, files, analyze = false) {
  await page.locator('#trainingContent [data-action="training-image"]').click();
  await page.locator('#coachImageFile').setInputFiles(files); await page.locator('#imageNote').fill('합성 한쪽 원암 일지 <script>실행 금지</script>');
  if (analyze) await page.locator('#imageAnalyze').check();
  await page.locator('#entryForm button[type="submit"]').click();
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-pilot-intake-')), artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const runtime = runtimeStub(), server = createServer({ bridge: { data: path.join(temporary, 'private'), runtime } });
  let browser, page, uploadCount = 0;
  const errors = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const initial = Storage.createEmpty(); initial.profile = profile; initial.training = TrainingStore.createEmpty();
    initial.training.mappings.push({ rawName: 'STA7000 케이블 원 암 시티드 로우', exerciseId: 'one_arm_cable_row', equipmentKey: 'STA7000 왼쪽 케이블', loadConvention: 'per-side', confirmed: true });
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: Storage.STORAGE_KEY, value: Storage.validateState(initial) });
    page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('/api/inbox') && request.method() === 'POST') uploadCount += 1; });
    const url = `http://127.0.0.1:${server.address().port}`, first = image('first'), second = image('second'), third = image('third');
    await page.goto(url); await navigate(page, 'training');
    let failSecond = true;
    await page.route('**/api/inbox', route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON().name === second.name && failSecond) { failSecond = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '합성 두 번째 사진 보관 실패' }) }); }
      return route.continue();
    });
    await addPhotos(page, [first, second]);
    await page.locator('#entryErrors').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#entryDialog').isVisible(), true);
    assert.match(await page.locator('#imageUploadList').innerText(), /PC에 보관됨/); assert.match(await page.locator('#imageUploadList').innerText(), /보관 실패/);
    assert.equal((await (await page.request.get(`${url}/api/inbox`)).json()).images.length, 1);
    await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    assert.equal(uploadCount, 3, 'retry sends only the previously failed photo');
    assert.equal(runtime.jobs.length, 0); assert.deepEqual(await state(page), Storage.validateState(initial));
    await page.unroute('**/api/inbox');

    await page.locator('#trainingContent [data-action="training-image"]').click();
    await page.locator('#entryForm').evaluate((form, file) => {
      const transfer = new DataTransfer(), bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
      transfer.items.add(new File([bytes], file.name, { type: 'image/png' })); form.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, { name: third.name, base64: third.buffer.toString('base64') });
    assert.equal(await page.locator('.image-upload-row').count(), 1);
    await page.locator('#imageNote').fill('붙여넣기 합성 메모'); await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    await page.reload(); await navigate(page, 'training'); await openInbox(page);
    assert.equal(await page.locator('.inbox-row[data-image-hash]').count(), 3, 'saved-only photos recover from server without AI');
    assert.equal(runtime.jobs.length, 0); assert.deepEqual(await state(page), Storage.validateState(initial));
    assert.equal(await page.locator('.image-inbox script').count(), 0);

    runtime.available = true; await navigate(page, 'coach'); await page.locator('.conversation-unavailable [data-action="bridge-refresh"]').click(); await navigate(page, 'training');
    const delayed = image('delayed-closed-dialog'); let releaseUpload, sawUpload;
    const uploadStarted = new Promise(resolve => { sawUpload = resolve; });
    await page.route('**/api/inbox', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON().name === delayed.name) { sawUpload(); await new Promise(resolve => { releaseUpload = resolve; }); }
      return route.continue();
    });
    await addPhotos(page, [delayed], true); await uploadStarted;
    await page.keyboard.press('Escape'); await page.locator('#trainingContent [data-action="training-image"]').click();
    assert.equal(await page.locator('#entryDialog').isVisible(), false, 'opening another intake cannot replace the in-flight selection');
    assert.match(await page.locator('#toast').innerText(), /사진 보관이 아직 진행 중/);
    releaseUpload();
    await page.waitForFunction(() => document.querySelectorAll('.inbox-row[data-image-hash]').length === 4);
    assert.equal(runtime.jobs.length, 0, 'closing during upload never starts the optional AI request');
    await page.unroute('**/api/inbox');
    await addPhotos(page, [first, second], true); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`${window.MacroStorage.STORAGE_KEY}.image-queue`)).rows.filter(row => row.status === 'running').length === 1);
    assert.equal(runtime.jobs.length, 1); assert.equal(runtime.jobs[0].kind, 'workout');
    await navigate(page, 'today'); await page.locator('#dayDate').fill(Insights.shiftDate(today, -1)); await page.locator('#dayDate').dispatchEvent('change'); await navigate(page, 'training');
    runtime.complete(0, workoutResult());
    await page.locator('#imageDraftPreview').waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`${window.MacroStorage.STORAGE_KEY}.image-queue`)).rows.filter(row => row.status === 'running').length === 1 && JSON.parse(localStorage.getItem(`${window.MacroStorage.STORAGE_KEY}.image-queue`)).rows.filter(row => row.status === 'completed').length === 1);
    assert.equal(runtime.jobs.length, 2);
    assert.equal(runtime.jobs[1].date, today, 'queued transcription keeps the date selected when the user requested it');
    assert.equal(await page.locator('#imageDraftPreview .set-table-row').count(), 22, 'every interpreted set is visible beside the source');
    assert.match(await page.locator('#imageDraftPreview').innerText(), /확인한 연결 재사용/);
    assert.match(await page.locator('#imageDraftPreview').innerText(), /한쪽 중량/);
    assert.match(await page.locator('#imageDraftPreview .set-table-row').last().innerText(), /미확인/);
    assert.equal(await page.locator('#imageDraftPreview .image-source-review a').count(), 1);
    assert.equal((await state(page)).training.records.length, 0, 'AI draft is not confirmed diary data');

    await navigate(page, 'today'); await page.locator('#dayDate').fill(today); await page.locator('#dayDate').dispatchEvent('change'); await navigate(page, 'training');
    await addPhotos(page, [third], true); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); await openInbox(page);
    await page.locator('[data-action="image-queue-pause"]').click();
    runtime.complete(1, workoutResult());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`${window.MacroStorage.STORAGE_KEY}.image-queue`)).rows.filter(row => row.status === 'completed').length === 2);
    assert.equal(runtime.jobs.length, 2, 'pausing does not start the next paid request');
    await page.reload(); await navigate(page, 'training'); await openInbox(page);
    assert.equal(runtime.jobs.length, 2, 'reload restores queue but never automatically starts new AI');
    assert.match(await page.locator('.intake-queue').innerText(), /계속하기 전에는 새 AI 요청/);
    await page.locator(`[data-action="image-job-open"][data-id="${runtime.jobs[0].id}"]`).click();
    await page.locator('[data-action="image-workout-preview"]').click();
    assert.equal(await page.locator('#trainingImportPreview .set-table-row').count(), 22);
    assert.equal(await page.locator('[data-action="training-import-confirm"]').isDisabled(), true);
    await page.locator('#imageWorkoutReviewed').check();
    await page.locator('#trainingImportPreview [data-action="image-review-detail"]').click();
    assert.equal(await page.locator('#entryForm [name="0-21-loadKg"]').inputValue(), '');
    await page.locator('#entryForm [name="0-21-reps"]').fill('8'); await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-action="training-import-confirm"]').isDisabled(), true, 'editing invalidates the prior whole-result confirmation');
    assert.equal((await state(page)).training.records.length, 0, 'editing a transcription is still only a draft');
    await page.locator('#imageWorkoutReviewed').check();
    await page.locator('[data-action="training-import-confirm"]').click();
    const saved = await state(page), record = saved.training.records[0];
    assert.equal(record.exercises[0].sets.length, 22); assert.equal(record.exercises[0].sets[0].loadKg, 20); assert.equal(record.exercises[0].sets[21].loadKg, null);
    assert.equal(record.exercises[0].sets[21].reps, 8, 'only the explicitly edited number changes');
    assert.equal(record.exercises[0].sets.every(row => row.rir === null), true);
    assert.equal(Training.describeExercise(record.exercises[0], saved.training.mappings).loadConvention, 'per-side', 'confirmed mapping outranks AI total-load guess without doubling kg');
    assert.equal(record.exercises[0].equipmentKey, null, 'name-derived device is not promoted to physical-machine confirmation');

    await openInbox(page); await page.locator('[data-action="image-queue-continue"]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`${window.MacroStorage.STORAGE_KEY}.image-queue`)).rows.filter(row => row.status === 'running').length === 1);
    assert.equal(runtime.jobs.length, 3);
    await page.reload(); await navigate(page, 'training'); await openInbox(page);
    assert.equal(runtime.jobs.length, 3, 'reload observes the existing running request without submitting another');
    runtime.complete(2, workoutResult());
    await page.locator('#imageDraftPreview').waitFor();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
      assert.ok(dimensions.actual <= dimensions.width + 1, `review overflow ${width}: ${JSON.stringify(dimensions)}`);
      await page.screenshot({ path: path.join(artifacts, `pilot-intake-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('[data-action="image-draft-dismiss"]').click();
    await addPhotos(page, [first], true); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
    assert.equal(runtime.jobs.length, 3, 'existing completed image transcription is reused, never silently re-read');
    assert.deepEqual(await state(page), saved);
    assert.deepEqual(errors, []);
    console.log('Pilot intake browser passed: multi-select/paste, partial-save retry, server recovery, explicit sequential AI queue, pause/reload/resume without duplicate requests, whole-source 22-set review, unknown values and confirmed load mappings, no silent reanalysis, 320/390/1280px.');
  } catch (error) {
    if (page) console.error('Browser errors:', errors, 'Toast:', await page.locator('#toast').innerText().catch(() => 'unavailable'), 'Queue:', await page.evaluate(key => localStorage.getItem(`${key}.image-queue`), Storage.STORAGE_KEY), 'Jobs:', runtime.jobs);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
