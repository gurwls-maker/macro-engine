'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const Storage = require('../src/storage.js');
const TrainingStore = require('../src/training-store.js');
const Insights = require('../src/insights.js');

const today = Insights.dateKey();
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };

function exercise(id, rawName, extra = {}) {
  return { id, rawName, exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', durationMinutes: null,
    repsTotal: null, reportedVolumeKg: null, notes: '',
    sets: [{ id: `${id}-warmup`, loadKg: 10, reps: 5, marker: 'W', rir: null },
      { id: `${id}-working`, loadKg: 25, reps: 12, marker: null, rir: 2 }], ...extra };
}

function fixture() {
  const state = Storage.createEmpty(); state.profile = profile; state.training = TrainingStore.createEmpty();
  state.training.records.push({ id: 'synthetic-equipment-record', date: today, time: '12:00', label: '합성 장비 표기 회귀',
    durationMinutes: 50, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: null, pain: 'none',
    exercises: [
      exercise('prefix-one-arm', 'STA7000 케이블 원 암 시티드 로우'),
      exercise('prefix-known', 'Drax 머신 플라이'),
      exercise('prefix-unknown', 'Infinity 합성 미등록 운동'),
      exercise('delimiter-dumbbell', '[합성 장비 B] 덤벨 원 암 로우'),
      exercise('delimiter-barbell', '합성 랙 C | 바벨 벤치 프레스'),
      exercise('explicit-device', 'Drax 덤벨 로우', { exerciseId: 'dumbbell_row', equipmentKey: '사용자가 확인한 장비 A', loadConvention: 'total' }),
      exercise('mapped-device', 'Infinity 덤벨 로우'),
      exercise('conflicting-load', '원 암 바벨 로우'),
      exercise('bare-movement', '벤치 프레스'),
      exercise('typed-dumbbell-bench', '[덤벨] 벤치 프레스'),
      exercise('typed-dumbbell-rdl', '덤벨 | 루마니안 데드리프트'),
      exercise('typed-incompatible', '[바벨] 해머 컬'),
      exercise('escaped-device', '[장비 <img src=x onerror=alert(1)>] 덤벨 로우')
    ] });
  state.training.mappings.push({ rawName: 'Infinity 덤벨 로우', exerciseId: 'dumbbell_row', equipmentKey: '사용자가 확인한 장비 B', loadConvention: 'total', confirmed: true });
  return Storage.validateState(state);
}

async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), Storage.STORAGE_KEY); }
async function stored(page) { return JSON.parse(await storedText(page)); }
async function navigate(page) { await page.locator('[data-view="training"]').click(); await page.locator('#view-training').waitFor({ state: 'visible' }); }
function block(page, id) { return page.locator('.exercise-block').filter({ has: page.locator(`[data-action="training-map"][data-exercise="${id}"]`) }); }
async function mapping(page, id) { await block(page, id).locator('[data-action="training-map"]').click(); await page.locator('#entryDialog').waitFor({ state: 'visible' }); }
async function submit(page) { await page.locator('#entryForm button[type="submit"]').click(); await page.locator('#entryDialog').waitFor({ state: 'hidden' }); }
async function metadata(page, recordId, exerciseId) {
  return page.evaluate(({ key, recordId, exerciseId }) => {
    const value = JSON.parse(localStorage.getItem(key));
    const row = value.training.records.find(record => record.id === recordId).exercises.find(exercise => exercise.id === exerciseId);
    return window.MacroTraining.describeExercise(row, value.training.mappings);
  }, { key: Storage.STORAGE_KEY, recordId, exerciseId });
}
async function noOverflow(page, context) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, `${context}: horizontal overflow ${JSON.stringify(size)}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  try {
    for (const width of [1280, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const initial = fixture();
        await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: Storage.STORAGE_KEY, value: JSON.stringify(initial) });
        const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { errors.push(`unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });
        await page.goto(url); await navigate(page);
        const untouched = JSON.stringify(initial), originalExercises = initial.training.records[0].exercises;
        assert.equal(await storedText(page), untouched, 'reading equipment names must not migrate or rewrite old records');
        assert.match(await block(page, 'prefix-one-arm').innerText(), /STA7000.*이름 표기/s);
        assert.match(await block(page, 'prefix-one-arm').innerText(), /한쪽 중량.*이름 기준/s);
        assert.match(await block(page, 'prefix-known').innerText(), /가슴.*디랙스.*이름 표기/s);
        assert.match(await block(page, 'prefix-unknown').innerText(), /부위 미확인.*인피니티.*이름 표기/s);
        assert.match(await block(page, 'delimiter-dumbbell').innerText(), /합성 장비 B.*이름 표기.*한쪽 중량/s);
        assert.match(await block(page, 'delimiter-barbell').innerText(), /합성 랙 C.*이름 표기.*전체 중량/s);
        assert.match(await block(page, 'explicit-device').innerText(), /사용자가 확인한 장비 A.*전체 중량/s);
        assert.doesNotMatch(await block(page, 'explicit-device').innerText(), /이름 표기|이름 기준/);
        assert.match(await block(page, 'mapped-device').innerText(), /사용자가 확인한 장비 B.*전체 중량/s);
        assert.doesNotMatch(await block(page, 'mapped-device').innerText(), /이름 표기|이름 기준/);
        assert.match(await block(page, 'conflicting-load').innerText(), /중량 기준 미확인/);
        assert.match(await block(page, 'bare-movement').innerText(), /장비 미확인.*중량 기준 미확인/s);
        assert.match(await block(page, 'typed-dumbbell-bench').innerText(), /가슴.*덤벨.*이름 표기.*한쪽 중량/s);
        assert.match(await block(page, 'typed-dumbbell-rdl').innerText(), /덤벨.*이름 표기.*한쪽 중량/s);
        assert.match(await block(page, 'typed-incompatible').innerText(), /부위 미확인.*바벨.*이름 표기/s);
        assert.equal(await block(page, 'escaped-device').locator('img').count(), 0, 'equipment text must not become executable markup');
        assert.match(await block(page, 'escaped-device').innerText(), /<img src=x onerror=alert\(1\)>/);
        await noOverflow(page, `record ${width}`);

        for (const [id, expectedEquipment, expectedLoad] of [
          ['prefix-one-arm', 'STA7000', 'per-side'], ['delimiter-dumbbell', '합성 장비 B', 'per-side'],
          ['delimiter-barbell', '합성 랙 C', 'total'], ['explicit-device', '사용자가 확인한 장비 A', 'total'],
          ['mapped-device', '사용자가 확인한 장비 B', 'total'], ['conflicting-load', '', 'as-recorded'],
          ['bare-movement', '', 'as-recorded']
        ]) {
          await mapping(page, id);
          assert.equal(await page.locator('#entryForm [name="equipmentKey"]').inputValue(), expectedEquipment);
          assert.equal(await page.locator('#entryForm [name="loadConvention"]').inputValue(), expectedLoad);
          await noOverflow(page, `mapping ${id} ${width}`);
          await page.keyboard.press('Escape');
        }
        for (const [id, expectedExerciseId, expectedEquipment, expectedLoad] of [
          ['typed-dumbbell-bench', 'dumbbell_bench_press', '덤벨', 'per-side'],
          ['typed-dumbbell-rdl', 'dumbbell_rdl', '덤벨', 'per-side'],
          ['typed-incompatible', '', '바벨', 'total']
        ]) {
          await mapping(page, id);
          assert.equal(await page.locator('#entryForm [name="exerciseId"]').inputValue(), expectedExerciseId, `${id}: declared equipment type must survive movement resolution`);
          assert.equal(await page.locator('#entryForm [name="equipmentKey"]').inputValue(), expectedEquipment);
          assert.equal(await page.locator('#entryForm [name="loadConvention"]').inputValue(), expectedLoad);
          await page.keyboard.press('Escape');
        }
        await block(page, 'prefix-unknown').locator('[data-action="training-map"]').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('#entryForm [name="exerciseId"]').inputValue(), '', 'unknown movement must not select the first catalog entry');
        assert.equal(await page.locator('#entryForm [name="equipmentKey"]').inputValue(), '인피니티');
        await page.keyboard.press('Escape');
        assert.equal(await block(page, 'prefix-unknown').locator('[data-action="training-map"]').evaluate(element => element === document.activeElement), true, 'mapping dialog restores keyboard focus');
        assert.equal(await storedText(page), untouched, 'opening and cancelling confirmation dialogs must not save derived metadata');
        await page.reload(); await navigate(page);
        assert.equal(await storedText(page), untouched, 'reload keeps the exact existing record JSON');
        assert.match(await block(page, 'prefix-one-arm').innerText(), /한쪽 중량.*이름 기준/s);

        const recordId = initial.training.records[0].id;
        let description = await metadata(page, recordId, 'prefix-one-arm');
        assert.equal(description.resolved.id, 'one_arm_cable_row'); assert.equal(description.loadConventionSource, 'name-rule');
        description = await metadata(page, recordId, 'explicit-device');
        assert.equal(description.equipmentSource, 'record'); assert.equal(description.loadConventionSource, 'record');
        description = await metadata(page, recordId, 'mapped-device');
        assert.equal(description.equipmentSource, 'mapping'); assert.equal(description.loadConventionSource, 'mapping');
        description = await metadata(page, recordId, 'conflicting-load');
        assert.equal(description.loadConvention, 'as-recorded'); assert.equal(description.ruleConflict, true);
        description = await metadata(page, recordId, 'bare-movement');
        assert.equal(description.resolved.id, 'bench_press'); assert.equal(description.loadConvention, 'as-recorded');
        assert.equal(description.loadConventionSource, null, 'a catalog equipment category cannot invent words missing from the original name');
        for (const [id, expectedExerciseId] of [['typed-dumbbell-bench', 'dumbbell_bench_press'], ['typed-dumbbell-rdl', 'dumbbell_rdl']]) {
          description = await metadata(page, recordId, id);
          assert.equal(description.resolved.id, expectedExerciseId, 'delimited dumbbell type cannot resolve to a bare barbell alias');
          assert.equal(description.equipmentKey, '덤벨'); assert.equal(description.equipmentSource, 'name-delimiter');
          assert.equal(description.loadConvention, 'per-side'); assert.equal(description.loadConventionSource, 'name-rule');
        }
        description = await metadata(page, recordId, 'typed-incompatible');
        assert.equal(description.resolved, null, 'an incompatible declared equipment type remains unresolved');

        await mapping(page, 'prefix-one-arm');
        await page.locator('#entryForm [name="loadConvention"]').selectOption('as-recorded');
        await page.locator('#entryForm [name="confirmed"]').check(); await submit(page);
        let value = await stored(page), confirmed = value.training.records[0].exercises.find(row => row.id === 'prefix-one-arm');
        assert.equal(confirmed.rawName, originalExercises[0].rawName); assert.deepEqual(confirmed.sets, originalExercises[0].sets);
        assert.equal(confirmed.equipmentKey, 'STA7000'); assert.equal(confirmed.loadConvention, 'as-recorded');
        assert.equal(value.training.mappings.find(row => row.rawName === confirmed.rawName).loadConvention, 'as-recorded');
        description = await metadata(page, recordId, 'prefix-one-arm');
        assert.equal(description.loadConvention, 'as-recorded'); assert.equal(description.loadConventionSource, 'mapping');
        await page.reload(); await navigate(page); await mapping(page, 'prefix-one-arm');
        assert.equal(await page.locator('#entryForm [name="loadConvention"]').inputValue(), 'as-recorded', 'confirmed unknown overrides name rules after reload');
        await page.keyboard.press('Escape');
        assert.match(await block(page, 'prefix-one-arm').innerText(), /중량 기준 미확인/);
        assert.doesNotMatch(await block(page, 'prefix-one-arm').innerText(), /한쪽 중량/);

        await page.locator('#trainingContent [data-action="training-add"]').click();
        const newName = 'STA7000 케이블 원 암 레터럴 레이즈';
        await page.locator('#entryForm [name="label"]').fill('새 합성 접두어 기록');
        await page.locator('#entryForm [name="exercise-0"]').fill(newName);
        await page.locator('#entryForm [name="0-0-loadKg"]').fill('7.5');
        await page.locator('#entryForm [name="0-0-reps"]').fill('13');
        await page.locator('#entryForm [name="0-0-rir"]').fill('2');
        await page.locator('#entryForm [data-action="editor-add-exercise"]').click();
        await page.locator('#entryForm [name="exercise-1"]').fill(originalExercises[0].rawName);
        await page.locator('#entryForm [name="1-0-loadKg"]').fill('12');
        await page.locator('#entryForm [name="1-0-reps"]').fill('8');
        await submit(page);
        value = await stored(page);
        const added = value.training.records.find(row => row.label === '새 합성 접두어 기록');
        assert.ok(added?.id); assert.equal(added.exercises[0].rawName, newName); assert.equal(added.exercises[0].exerciseId, 'cable_lateral_raise');
        assert.equal(await page.locator('.workout-heading h2').innerText(), added.label, 'saving a new record must display that new record rather than the previous selection');
        assert.equal(added.exercises[0].sets[0].loadKg, 7.5, 'name-based load convention must not double or halve kg');
        assert.equal(added.exercises[0].sets[0].reps, 13); assert.equal(added.exercises[0].sets[0].rir, 2);
        description = await metadata(page, added.id, added.exercises[0].id);
        assert.equal(description.equipmentKey, 'STA7000'); assert.equal(description.loadConvention, 'per-side');
        assert.equal(description.equipmentSource, 'name-prefix'); assert.equal(description.loadConventionSource, 'name-rule');
        description = await metadata(page, added.id, added.exercises[1].id);
        assert.equal(description.resolved.id, 'one_arm_cable_row'); assert.equal(description.equipmentSource, 'mapping');
        assert.equal(description.loadConvention, 'as-recorded'); assert.equal(description.loadConventionSource, 'mapping', 'confirmed unknown also applies to later records with the same name');
        assert.match(await page.locator('.workout-detail').innerText(), /STA7000.*이름 표기.*한쪽 중량.*이름 기준/s);
        await noOverflow(page, `new record ${width}`);
        await page.screenshot({ path: path.join(artifacts, `equipment-${width}.png`), fullPage: true });
        const afterSave = await storedText(page); await page.reload(); await navigate(page);
        assert.equal(await storedText(page), afterSave, 'new records are not rewritten during display or reload');
        const oldRows = (await stored(page)).training.records.find(row => row.id === recordId).exercises;
        assert.deepEqual(oldRows.slice(1), originalExercises.slice(1), 'unrelated existing raw names, metadata and numbers remain untouched');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('Equipment browser: name-derived metadata, no automatic writes, explicit precedence, unknown override, keyboard and 320/390/1280px passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
