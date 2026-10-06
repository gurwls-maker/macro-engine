'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const N = require('../src/nutrition.js');
const T = require('../src/training.js');
const I = require('../src/insights.js');

const today = I.dateKey(), selectedDate = I.shiftDate(today, -6);
const rawName = '합성 커스텀 프레스';
const machineA = '합성 헬스장 A / 프레스 1번', machineB = '합성 헬스장 B / 프레스 2번';
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };

function exercise(id, extra = {}) {
  return { id, rawName, exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', loadRole: 'unknown',
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: '합성 원문 메모',
    sets: [{ id: `${id}-warmup`, loadKg: 10, reps: 5, marker: 'W', rir: null },
      { id: `${id}-set`, loadKg: 25, reps: 10, marker: null, rir: 2 }], ...extra };
}
function record(id, date, label, exercises, sequence = { order: 'listed', structure: 'straight' }) {
  return { id, date, time: '12:00', label, durationMinutes: 50, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [`synthetic/${id}.png`], uncertainties: ['합성 출처 메모'], revision: null },
    notes: '원문 일지 메모', effort: 6, pain: 'none', sequence, exercises };
}
function fixture(ambiguous) {
  const state = S.createEmpty(); state.profile = profile; state.training = TS.createEmpty();
  const selected = record('synthetic-selected', selectedDate, '합성 선택 일지', [exercise('selected-exercise'),
    exercise('same-record-unrelated', { rawName: '바벨 로우', exerciseId: 'barbell_row', equipmentKey: '합성 바벨 장비', loadConvention: 'total', loadRole: 'external' })]);
  const past = record('synthetic-past', I.shiftDate(today, -4), '합성 미확인 과거 일지', [exercise('past-exercise')], { order: 'unknown', structure: 'unknown' });
  const future = record('synthetic-future', I.shiftDate(today, 2), '합성 미확인 향후 일지', [exercise('future-exercise')]);
  const explicit = record('synthetic-explicit', I.shiftDate(today, -1), '합성 다른 머신 지정', [exercise('explicit-exercise',
    { exerciseId: 'machine_chest_press', equipmentKey: machineB, loadConvention: 'total', loadRole: 'assistance' })]);
  const partial = record('synthetic-partial', I.shiftDate(today, -3), '합성 전체 중량만 지정', [exercise('partial-exercise', { loadConvention: 'total' })]);
  const unrelated = record('synthetic-unrelated', I.shiftDate(today, -2), '합성 다른 운동명', [exercise('unrelated-exercise', { rawName: '합성 다른 원문 종목' })]);
  state.training.records = [future, unrelated, selected, past, explicit, partial];
  if (ambiguous) state.training.mappings = [
    { rawName, exerciseId: 'machine_chest_press', equipmentKey: machineA, loadConvention: 'per-side', loadRole: 'external', confirmed: true },
    { rawName, exerciseId: 'machine_chest_press', equipmentKey: machineB, loadConvention: 'total', loadRole: 'assistance', confirmed: true }
  ];
  const frozen = { date: selectedDate, weightKg: 65, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0,
    meals: [{ id: 'synthetic-completed-meal', name: '합성 완료 식사', protein: 90, carbs: 210, fat: 55, alcoholG: 0, otherKcal: 0 }],
    sessions: [], complete: false, planSnapshot: null };
  frozen.planSnapshot = N.calculatePlan(profile, frozen, []); frozen.complete = true; state.days[selectedDate] = frozen;
  return S.validateState(state);
}

async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function stored(page) { return JSON.parse(await storedText(page)); }
async function navigate(page) {
  await page.locator('[data-view="training"]').click(); await page.locator('#view-training').waitFor({ state: 'visible' });
  await page.locator('[data-action="training-tab"][data-tab="log"]').click();
}
async function openMapping(page) {
  await page.locator('.workout-list-item[data-id="synthetic-selected"]').click();
  await page.locator('[data-action="training-map"][data-exercise="selected-exercise"]').click();
  await page.locator('#entryDialog').waitFor({ state: 'visible' });
}
async function chooseMapping(page, convention = 'per-side') {
  const form = page.locator('#entryForm');
  await form.locator('[name="exerciseId"]').selectOption('machine_chest_press');
  await form.locator('[name="equipmentKey"]').fill(machineA);
  await form.locator('[name="loadConvention"]').selectOption(convention);
  await form.locator('[name="loadRole"]').selectOption('external');
}
async function previewText(page, { matching, affected, protectedCount, conflicts }) {
  const value = await page.locator('#mappingReusePreview').innerText();
  assert.match(value, new RegExp(`이 운동 외 같은 이름 ${matching}건`));
  assert.match(value, new RegExp(`자동 반영 ${affected}건`));
  assert.match(value, new RegExp(`별도 지정 ${protectedCount}건.*유지`));
  if (conflicts) {
    assert.match(value, new RegExp(`기존 ${conflicts}건은 기준을 자동 선택하지 않습니다`));
    assert.match(value, /다음 기록도 장비 등 구분할 정보가 없으면 한 기준을 임의로 고르지 않습니다/);
  } else {
    assert.doesNotMatch(value, /서로 다른 기준|기준을 자동 선택하지|임의로 고르지/, 'one unambiguous confirmed rule must not invent a conflict');
    assert.match(value, /다음에도 같은 이름이면 저장한 기준을 자동으로 재사용/);
  }
  assert.match(value, /원문 이름·중량·반복·RIR은 바꾸지/);
}
async function readableDialog(page, width) {
  const sizes = await page.evaluate(() => {
    const dialog = document.getElementById('entryDialog'), rect = dialog.getBoundingClientRect();
    const textNodes = [...dialog.querySelectorAll('#mappingReusePreview p, .field > span, .checkbox-field, .form-actions button > span')].filter(element => element.getClientRects().length);
    const text = textNodes.map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const container = element.matches('.field > span') ? element.parentElement : element.matches('button > span') ? element.parentElement : element;
      const bounds = container.getBoundingClientRect();
      return { value: element.textContent.trim(), left: bounds.left, right: bounds.right,
        rects: [...range.getClientRects()].filter(value => value.width > 0 && value.height > 0).map(value => ({ left: value.left, right: value.right })) };
    });
    const paragraphs = [...dialog.querySelectorAll('#mappingReusePreview > p')].map(element => element.getBoundingClientRect()).map(value => ({ top: value.top, bottom: value.bottom }));
    const role = dialog.querySelector('select[name="loadRole"]'), roleStyle = getComputedStyle(role);
    const canvas = document.createElement('canvas'), measure = canvas.getContext('2d');
    measure.font = `${roleStyle.fontWeight} ${roleStyle.fontSize} ${roleStyle.fontFamily}`;
    const roleOption = { text: role.selectedOptions[0].textContent, width: measure.measureText(role.selectedOptions[0].textContent).width,
      available: role.clientWidth - parseFloat(roleStyle.paddingLeft) - parseFloat(roleStyle.paddingRight) - 24 };
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, dialog: { left: rect.left, right: rect.right, width: rect.width },
      previewOverflow: document.getElementById('mappingReusePreview').scrollWidth > document.getElementById('mappingReusePreview').clientWidth + 1, text, paragraphs, roleOption };
  });
  assert.ok(sizes.document <= sizes.viewport + 1 && sizes.dialog.width <= width + 1, `mapping ${width}: horizontal overflow ${JSON.stringify(sizes)}`);
  assert.ok(sizes.dialog.left >= -1 && sizes.dialog.right <= width + 1, `mapping ${width}: dialog outside viewport`);
  assert.equal(sizes.previewOverflow, false, 'mapping preview text must fit its container');
  assert.ok(sizes.roleOption.width <= sizes.roleOption.available + 1, `mapping ${width}: selected load role is clipped ${JSON.stringify(sizes.roleOption)}`);
  for (const text of sizes.text) for (const rect of text.rects) {
    assert.ok(rect.left >= text.left - 1 && rect.right <= text.right + 1, `mapping ${width}: text clipped ${JSON.stringify(text)}`);
  }
  for (let index = 1; index < sizes.paragraphs.length; index++) {
    assert.ok(sizes.paragraphs[index].top >= sizes.paragraphs[index - 1].bottom - 1, 'preview paragraphs cannot overlap');
  }
}
async function rapidEquipmentEdit(page, ambiguous) {
  const finalEquipment = `${machineA} / 입력 확인 최종`;
  const burst = await page.evaluate(finalEquipment => {
    const field = document.querySelector('#entryForm [name="equipmentKey"]'), before = window.__mappingPreviewCalls.length;
    for (const value of ['합성 임시', '합성 빠른 두 번째 입력', finalEquipment]) {
      field.value = value; field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { before, after: window.__mappingPreviewCalls.length, text: document.getElementById('mappingReusePreview').textContent };
  }, finalEquipment);
  assert.equal(burst.after, burst.before, 'rapid equipment typing should not synchronously run the whole mapping preview');
  assert.match(burst.text, /입력한 기준의 적용 범위를 확인 중/);
  assert.doesNotMatch(burst.text, /자동 반영 \d+건/, 'pending text input immediately removes old scope counts');
  await page.waitForFunction(({ before, finalEquipment }) => window.__mappingPreviewCalls.length > before
    && window.__mappingPreviewCalls.at(-1).equipmentKey === finalEquipment
    && !document.getElementById('mappingReusePreview').textContent.includes('확인 중'), { before: burst.before, finalEquipment });
  const calls = await page.evaluate(before => window.__mappingPreviewCalls.slice(before), burst.before);
  assert.equal(calls.length, 1, 'one rapid typing burst must settle to one latest-input calculation');
  assert.equal(calls[0].equipmentKey, finalEquipment);
  await previewText(page, { matching: 4, affected: ambiguous ? 0 : 2, protectedCount: 2, conflicts: ambiguous ? 2 : 0 });
  await page.locator('#entryForm [name="equipmentKey"]').press('Tab');
  const callsBeforeCheckbox = await page.evaluate(() => window.__mappingPreviewCalls.length);
  await page.locator('#entryForm [name="confirmed"]').check(); await page.locator('#entryForm [name="confirmed"]').uncheck();
  assert.equal(await page.evaluate(() => window.__mappingPreviewCalls.length), callsBeforeCheckbox, 'confirmation checkbox does not recalculate unchanged mapping scope');
  await page.locator('#entryForm [name="equipmentKey"]').fill(machineA);
  await page.waitForFunction(machineA => window.__mappingPreviewCalls.at(-1).equipmentKey === machineA
    && !document.getElementById('mappingReusePreview').textContent.includes('확인 중'), machineA);
}
async function cancelledTimerCannotReplaceDialog(page, width, ambiguous) {
  const replacement = await page.evaluate(async () => {
    const until = predicate => predicate() ? Promise.resolve() : new Promise(resolve => {
      const observer = new MutationObserver(() => { if (predicate()) { observer.disconnect(); resolve(); } });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    const before = window.__mappingPreviewCalls.length;
    const oldField = document.querySelector('#entryForm [name="equipmentKey"]');
    oldField.value = '합성 취소한 창의 오래된 장비'; oldField.dispatchEvent(new Event('input', { bubbles: true }));
    const pending = document.getElementById('mappingReusePreview').textContent;
    document.querySelector('#entryForm [data-action="dialog-close"]').click();
    await until(() => !document.getElementById('entryDialog').open);
    document.querySelector('.workout-list-item[data-id="synthetic-explicit"]').click();
    await until(() => document.querySelector('[data-action="training-map"][data-exercise="explicit-exercise"]'));
    document.querySelector('[data-action="training-map"][data-exercise="explicit-exercise"]').click();
    await until(() => document.getElementById('entryDialog').open && document.querySelector('#entryForm [name="equipmentKey"]')?.value === '합성 헬스장 B / 프레스 2번');
    return { before, calls: window.__mappingPreviewCalls.length, pending,
      value: document.querySelector('#entryForm [name="equipmentKey"]').value,
      preview: document.getElementById('mappingReusePreview').textContent };
  });
  assert.match(replacement.pending, /확인 중/);
  assert.equal(replacement.value, machineB, 'the replacement dialog shows its own explicit device');
  assert.equal(replacement.calls, replacement.before + 1, 'opening the replacement dialog calculates only its own preview');
  await page.waitForFunction(() => window.__mappingTimers.every(timer => timer.settled));
  assert.equal(await page.locator('#entryForm [name="equipmentKey"]').inputValue(), machineB);
  assert.equal(await page.locator('#mappingReusePreview').textContent(), replacement.preview,
    'a cancelled dialog timer must not replace the current dialog scope');
  assert.equal(await page.evaluate(() => window.__mappingPreviewCalls.length), replacement.calls,
    'the old debounce callback must not calculate using a replacement form');
  await readableDialog(page, width);
  if (!ambiguous) await page.screenshot({ path: path.join(__dirname, 'artifacts', `mapping-reuse-protected-${width}.png`) });
  await page.keyboard.press('Escape'); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
}
async function describe(page, recordId, exerciseId) {
  return page.evaluate(({ key, recordId, exerciseId }) => {
    const state = JSON.parse(localStorage.getItem(key));
    const exercise = state.training.records.find(row => row.id === recordId).exercises.find(row => row.id === exerciseId);
    return window.MacroTraining.describeExercise(exercise, state.training.mappings);
  }, { key: S.STORAGE_KEY, recordId, exerciseId });
}
function assertMachine(value, { equipment = machineA, convention = 'per-side', role = 'external', movement = 'machine_chest_press' } = {}) {
  assert.equal(value.resolved?.id || null, movement); assert.equal(value.equipmentKey, equipment);
  assert.equal(value.loadConvention, convention); assert.equal(value.loadRole, role);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [320, 390, 1280]) for (const ambiguous of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } }); let page;
      try {
        const initial = fixture(ambiguous), untouched = JSON.stringify(initial), errors = [], requests = [];
        await context.addInitScript(({ key, value }) => {
          if (!localStorage.getItem(key)) localStorage.setItem(key, value);
          window.__mappingPreviewCalls = []; window.__mappingTimers = [];
          let engine;
          Object.defineProperty(window, 'MacroTraining', { configurable: true, get: () => engine, set: api => {
            engine = Object.freeze({ ...api, previewMapping(...args) {
              const result = api.previewMapping(...args);
              window.__mappingPreviewCalls.push({ equipmentKey: args[2]?.equipmentKey, recordId: args[3]?.recordId, counts: result.counts });
              return result;
            } });
          } });
          const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
          window.setTimeout = (callback, delay, ...args) => {
            if (delay !== 180 || typeof callback !== 'function') return schedule(callback, delay, ...args);
            const timer = { id: null, settled: false };
            timer.id = schedule(() => { try { callback(...args); } finally { timer.settled = true; } }, delay);
            window.__mappingTimers.push(timer); return timer.id;
          };
          window.clearTimeout = id => {
            const timer = window.__mappingTimers.find(timer => timer.id === id && !timer.settled);
            if (timer) timer.settled = true;
            return cancel(id);
          };
        },
          { key: S.STORAGE_KEY, value: untouched });
        page = await context.newPage(); page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(url); await navigate(page); await openMapping(page); await chooseMapping(page);
        await previewText(page, { matching: 4, affected: ambiguous ? 0 : 2, protectedCount: 2, conflicts: ambiguous ? 2 : 0 });
        await readableDialog(page, width);
        await rapidEquipmentEdit(page, ambiguous);
        await cancelledTimerCannotReplaceDialog(page, width, ambiguous);
        assert.equal(await storedText(page), untouched, 'debouncing and switching cancelled dialogs do not write app records');
        await openMapping(page); await chooseMapping(page);
        await page.locator('#entryForm [name="loadConvention"]').selectOption('total');
        await previewText(page, { matching: 4, affected: ambiguous ? 1 : 3, protectedCount: 2, conflicts: ambiguous ? 3 : 0 });
        await page.locator('#entryForm [name="exerciseId"]').selectOption('');
        assert.match(await page.locator('#mappingReusePreview').innerText(), /실제 종목·장비·중량 기준을 확인/);
        assert.doesNotMatch(await page.locator('#mappingReusePreview').innerText(), /자동 반영 \d+건/, 'invalid input must not keep an old valid preview');
        await chooseMapping(page); await readableDialog(page, width);
        assert.equal(await storedText(page), untouched, 'preview input changes must not save derived metadata');
        await page.locator('#entryForm [data-action="dialog-close"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
        assert.equal(await storedText(page), untouched, 'cancelling mapping confirmation preserves every original byte');

        await openMapping(page); await chooseMapping(page);
        await previewText(page, { matching: 4, affected: ambiguous ? 0 : 2, protectedCount: 2, conflicts: ambiguous ? 2 : 0 });
        await page.locator('#entryForm [name="confirmed"]').check();
        await page.screenshot({ path: path.join(artifacts, `mapping-reuse-${ambiguous ? 'conflict' : 'normal'}-${width}.png`), fullPage: true });
        await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
        const saved = await stored(page), mapping = { rawName, exerciseId: 'machine_chest_press', equipmentKey: machineA,
          loadConvention: 'per-side', loadRole: 'external', confirmed: true };
        const expected = JSON.parse(untouched);
        const preview = T.previewMapping(initial.training.records, initial.training.mappings, mapping,
          { recordId: 'synthetic-selected', exerciseId: 'selected-exercise' });
        Object.assign(expected.training.records.find(row => row.id === 'synthetic-selected').exercises[0],
          { exerciseId: mapping.exerciseId, equipmentKey: mapping.equipmentKey, loadConvention: mapping.loadConvention, loadRole: mapping.loadRole });
        expected.training.mappings = preview.nextMappings; expected.updatedAt = saved.updatedAt;
        assert.deepEqual(saved, expected, 'one confirmation changes only selected metadata, confirmed rules and save timestamp');
        assert.deepEqual(saved.days, initial.days, 'completed dates and frozen nutrition targets must not be recalculated by a mapping change');
        assertMachine(await describe(page, 'synthetic-selected', 'selected-exercise'));
        assertMachine(await describe(page, 'synthetic-explicit', 'explicit-exercise'), { equipment: machineB, convention: 'total', role: 'assistance' });
        for (const [recordId, exerciseId] of [['synthetic-past', 'past-exercise'], ['synthetic-future', 'future-exercise']]) {
          const value = await describe(page, recordId, exerciseId);
          if (ambiguous) { assert.equal(value.resolved, null); assert.equal(value.equipmentKey, null); assert.equal(value.loadConvention, 'as-recorded'); }
          else { assertMachine(value); assert.equal(value.equipmentSource, 'mapping'); assert.equal(value.loadConventionSource, 'mapping'); assert.equal(value.loadRoleSource, 'mapping'); }
        }
        assert.equal((await describe(page, 'synthetic-partial', 'partial-exercise')).loadConvention, 'total', 'an explicit convention cannot be changed by reuse');

        const savedText = await storedText(page); await page.reload(); await navigate(page);
        assert.equal(await storedText(page), savedText, 'reload must not materialize derived metadata into historical records');
        const futureInput = await page.evaluate(({ key, rawName }) => {
          const state = JSON.parse(localStorage.getItem(key));
          return window.MacroTraining.describeExercise({ rawName, exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', loadRole: 'unknown' }, state.training.mappings);
        }, { key: S.STORAGE_KEY, rawName });
        if (ambiguous) assert.equal(futureInput.resolved, null, 'a future unknown record must not arbitrarily choose among confirmed rules');
        else assertMachine(futureInput);
        await page.locator('#trainingContent [data-action="training-add"]').click();
        await page.locator('#entryForm [name="exercise-0"]').fill(rawName);
        await page.keyboard.press('Escape'); await page.locator('#entryDialog').waitFor({ state: 'hidden' });
        assert.equal(await storedText(page), savedText, 'drafting a future same-name entry and cancelling does not alter records');

        if (!ambiguous) {
          await page.locator('[data-action="training-tab"][data-tab="analysis"]').click();
          const separated = page.locator('.progression-row').filter({ hasText: machineA }).filter({ has: page.locator('.source-badge').filter({ hasText: '기록 있음 · 조건별 분리' }) }).first();
          await separated.waitFor({ state: 'visible' });
          assert.match(await separated.locator('.progression-coverage').innerText(), /같은 운동 3일.*이 장비·표기 2일.*같은 기록 조건 1일/);
          assert.match(await separated.locator('.progression-explanation').innerText(), /같은 종목은 3일.*이 장비·중량 표기·수행 순서 조건.*앞뒤 비교를 보류/);
          assert.ok(await separated.locator('[data-action="training-open"]').count() > 0, 'condition-limited comparison must still link the actual stored record');
        }
        assert.equal(await storedText(page), savedText, 'analysis and future reuse checks must not rewrite raw records');
        const dimensions = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(dimensions.actual <= dimensions.viewport + 1, `mapping analysis ${width}: ${JSON.stringify(dimensions)}`);
        assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'mapping reuse tests must not contact AI or private APIs');
      } catch (error) {
        await page?.screenshot({ path: path.join(artifacts, `mapping-reuse-failure-${ambiguous ? 'conflict' : 'normal'}-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    console.log('Mapping reuse browser: live scope counts, debounced latest input and stale-timer isolation, no checkbox recalculation, protected explicit fields, honest ambiguity, one confirmed save, past/future derived reuse, exact original/source/sets/RIR/completed-day preservation, condition-separated history, unclipped load-role options, reload and cancel at 320/390/1280px passed. No AI or private data.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
