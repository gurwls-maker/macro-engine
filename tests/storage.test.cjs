"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Storage = require("../src/storage.js");

function snapshot() {
  return { status: "ready", reasons: [], version: "9.0.0", energy: { targetKcal: 2110, tdeeKcal: 2110, restingKcal: 1500, exerciseKcal: 200, range: [1900, 2400], method: "test estimate" }, macros: { protein: { target: 120, min: 100, max: 140 }, carbs: { target: 250, min: 200, max: 300 }, fat: { target: 70, min: 50, max: 80 } }, context: {}, guidance: [{ id: "goal", title: "유지", body: "최근 체중을 함께 확인해 주세요." }], sources: [{ label: "source", url: "https://example.com/source" }] };
}

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    get length() { return entries.size; },
    key(index) { return [...entries.keys()][index] ?? null; },
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
    entries
  };
}

function fixture() {
  const state = Storage.createEmpty();
  state.profile = { sex: "female", age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatMethod: "unknown", bodyFatDate: null, bodyFatWeightKg: null, trainingYears: 2, sport: "strength", goal: "maintain", activity: "active", healthContext: "general", proteinPreference: "standard" };
  state.days["2026-10-05"] = { date: "2026-10-05", weightKg: 64.8, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [{ id: "meal-1", name: "점심 식사", protein: 30, carbs: 80, fat: 15, otherKcal: 10, alcoholG: 0 }], sessions: [{ id: "session-1", sport: "strength", durationMin: 45, intensity: "moderate" }], complete: true, planSnapshot: snapshot() };
  return state;
}

test("current backup round trip preserves Korean, decimals, completion and snapshot", () => {
  const input = fixture();
  const text = Storage.exportBackup(input);
  const parsed = Storage.parseBackup(text);
  assert.deepEqual(parsed.state, input);
  assert.equal(parsed.kind, "current");
  assert.deepEqual(parsed.summary, { days: 1, meals: 1, sessions: 1, completedDays: 1, legacyDays: 0, hasProfile: true });
  assert.ok(text.includes("점심 식사"));
  parsed.state.profile.weightKg = 80;
  assert.equal(input.profile.weightKg, 65);
});

test("optional meal labels, notes, day notes and templates round trip without name merging", () => {
  const state = fixture();
  const day = state.days['2026-10-05'];
  day.note = '야근 후 식사\n수면은 별도로 기록';
  Object.assign(day.meals[0], { type: 'lunch', note: '밥 반 공기 추가' });
  state.mealTemplates = [
    { id: 'template-a', title: '점심', meal: structuredClone(day.meals[0]) },
    { id: 'template-b', title: '점심', meal: { ...structuredClone(day.meals[0]), carbs: 100 } }
  ];
  assert.deepEqual(Storage.parseBackup(Storage.exportBackup(state)).state, state);
  assert.equal(Storage.parseBackup(Storage.exportBackup(state)).state.mealTemplates.length, 2);
  const original = fixture();
  assert.equal(Object.hasOwn(Storage.validateState(original), 'mealTemplates'), false);
  assert.equal(Object.hasOwn(Storage.validateState(original).days['2026-10-05'], 'note'), false);
});

function sessionPreset(id = "preset-1", overrides = {}) {
  return { id, title: "평소 걷기", session: { sport: "walking", durationMin: 30, intensity: "moderate", ...overrides } };
}

test("optional session presets round trip without becoming performed sessions or changing old backups", () => {
  const old = fixture();
  assert.equal(Object.hasOwn(Storage.validateState(old), "sessionPresets"), false);
  assert.equal(Object.hasOwn(Storage.parseBackup(Storage.exportBackup(old)).summary, "sessionPresets"), false);
  const state = fixture();
  state.sessionPresets = [sessionPreset("session-1"), sessionPreset("preset-2", { durationMin: 45, cardio: { environment: "treadmill", speedKmh: null, gradePct: 0 } }), sessionPreset("preset-3", { sport: "strength", cardio: null })];
  const before = structuredClone(state.days);
  const parsed = Storage.parseBackup(Storage.exportBackup(state));
  assert.deepEqual(parsed.state, state);
  assert.equal(parsed.summary.sessionPresets, 3);
  assert.equal(parsed.summary.sessions, 1);
  assert.deepEqual(parsed.state.days, before);
  assert.equal(parsed.state.sessionPresets[1].session.cardio.speedKmh, null);
  const store = memoryStorage();
  const saved = Storage.save(state, store);
  assert.deepEqual(Storage.load(store).state, saved);
  saved.sessionPresets[0].session.durationMin = 50;
  assert.equal(state.sessionPresets[0].session.durationMin, 30);
  assert.equal(Storage.VERSION, 9);
  assert.equal(Storage.STORAGE_KEY, "macro-engine.v9");
});

test("session presets require exact metadata and distinct IDs within the bounded optional list", () => {
  const good = fixture(); good.sessionPresets = [sessionPreset()];
  const serialized = Storage.exportBackup(good);
  const changes = [
    state => { state.sessionPresets = null; }, state => { state.sessionPresets = {}; },
    state => { state.sessionPresets[0].id = " "; }, state => { state.sessionPresets[0].id = "a".repeat(129); },
    state => { state.sessionPresets[0].title = ""; }, state => { state.sessionPresets[0].title = "a".repeat(201); },
    state => { state.sessionPresets[0].title = "bad\u0000title"; }, state => { state.sessionPresets[0].enabled = true; },
    state => { state.sessionPresets[0].session.id = "not-a-performed-session"; }, state => { delete state.sessionPresets[0].session.intensity; },
    state => { state.sessionPresets.push(structuredClone(state.sessionPresets[0])); },
    state => { state.sessionPresets = Array.from({ length: 101 }, (_, index) => sessionPreset(`preset-${index}`)); }
  ];
  let writes = 0;
  const store = memoryStorage({ [Storage.STORAGE_KEY]: serialized });
  store.setItem = () => { writes++; };
  for (const change of changes) {
    const invalid = structuredClone(good); change(invalid);
    assert.throws(() => Storage.validateState(invalid));
    assert.throws(() => Storage.parseBackup(JSON.stringify(invalid)));
    assert.throws(() => Storage.save(invalid, store));
    assert.equal(store.getItem(Storage.STORAGE_KEY), serialized);
  }
  assert.equal(writes, 0);
  const full = fixture(); full.sessionPresets = Array.from({ length: 100 }, (_, index) => sessionPreset(`preset-${index}`));
  assert.equal(Storage.validateState(full).sessionPresets.length, 100);
  const empty = fixture(); empty.sessionPresets = [];
  assert.deepEqual(Storage.parseBackup(Storage.exportBackup(empty)).state.sessionPresets, []);
});

test("presets and actual sessions share numeric and cardio validation without coercing unknowns", () => {
  const changes = [
    value => { value.sport = "none"; }, value => { value.sport = "__proto__"; },
    value => { value.durationMin = null; }, value => { value.durationMin = "30"; }, value => { value.durationMin = 0; }, value => { value.durationMin = 1441; },
    value => { value.intensity = "fast"; }, value => { value.complete = true; },
    value => { value.cardio = {}; }, value => { value.cardio = { environment: "outdoor", speedKmh: "5", gradePct: 0 }; },
    value => { value.cardio = { environment: "outdoor", speedKmh: 5, gradePct: 21 }; },
    value => { value.cardio = { environment: "outdoor", speedKmh: 31, gradePct: 0 }; },
    value => { value.cardio = { environment: "pool", speedKmh: 5, gradePct: 0 }; },
    value => { value.cardio = { environment: "outdoor", speedKmh: 5, gradePct: 0, estimate: 50 }; },
    value => { value.sport = "cycling"; value.cardio = { environment: "treadmill", speedKmh: 10, gradePct: 0 }; }
  ];
  for (const change of changes) {
    const presetState = fixture(); presetState.sessionPresets = [sessionPreset()];
    change(presetState.sessionPresets[0].session);
    assert.throws(() => Storage.validateState(presetState));
    const actualState = fixture(); actualState.days["2026-10-05"].sessions = [{ id: "actual", ...sessionPreset().session }];
    change(actualState.days["2026-10-05"].sessions[0]);
    assert.throws(() => Storage.validateState(actualState));
  }
  for (const durationMin of [1, 1.25, 1440]) {
    const state = fixture(); state.sessionPresets = [sessionPreset("preset", { durationMin, cardio: { environment: "treadmill", speedKmh: null, gradePct: null } })];
    assert.equal(Storage.validateState(state).sessionPresets[0].session.durationMin, durationMin);
  }
  const missingId = fixture(); delete missingId.days["2026-10-05"].sessions[0].id;
  assert.throws(() => Storage.validateState(missingId));
});

test("preset merge previews conflicts, adds only new IDs and never matches by title", () => {
  const current = fixture(); current.sessionPresets = [sessionPreset("shared"), sessionPreset("unchanged")];
  const incoming = fixture(); incoming.sessionPresets = [sessionPreset("shared", { durationMin: 90 }), sessionPreset("unchanged"), sessionPreset("new", { durationMin: 60 })];
  const original = structuredClone(current), source = structuredClone(incoming);
  const preview = Storage.previewMerge(current, incoming);
  assert.deepEqual(preview.presets.map(row => [row.id, row.status]), [["shared", "conflict"], ["unchanged", "identical"], ["new", "added"]]);
  const merged = Storage.mergeBackup(current, incoming);
  assert.equal(merged.sessionPresets.length, 3);
  assert.equal(merged.sessionPresets.find(row => row.id === "shared").session.durationMin, 30);
  assert.equal(merged.sessionPresets.find(row => row.id === "new").session.durationMin, 60);
  assert.deepEqual(merged.days, original.days);
  assert.deepEqual(merged.profile, original.profile);
  assert.deepEqual(Storage.mergeBackup(merged, incoming), merged);
  assert.deepEqual(current, original);
  assert.deepEqual(incoming, source);
  merged.sessionPresets[2].session.durationMin = 120;
  assert.equal(incoming.sessionPresets[2].session.durationMin, 60);
  assert.equal(Object.hasOwn(Storage.mergeBackup(fixture(), fixture()), "sessionPresets"), false);
});

test("preset capacity and corruption fail without partial merge or original data loss", () => {
  const current = fixture(); current.sessionPresets = Array.from({ length: 100 }, (_, index) => sessionPreset(`preset-${index}`));
  const incoming = fixture(); incoming.sessionPresets = [sessionPreset("new")];
  const original = JSON.stringify(current), source = JSON.stringify(incoming);
  assert.throws(() => Storage.mergeBackup(current, incoming), /100개/);
  assert.equal(JSON.stringify(current), original);
  assert.equal(JSON.stringify(incoming), source);
  const corrupt = structuredClone(current); corrupt.sessionPresets[0].session.durationMin = null;
  const raw = JSON.stringify(corrupt), store = memoryStorage({ [Storage.STORAGE_KEY]: raw });
  const loaded = Storage.load(store);
  assert.equal(loaded.storageBlocked, true);
  assert.equal(loaded.corruptedRaw, raw);
  assert.equal(store.getItem(Storage.STORAGE_KEY), raw);
});

test("invalid template and note metadata never writes or coerces unknown nutrition", () => {
  const mutations = [
    state => { state.days['2026-10-05'].note = 0; },
    state => { state.days['2026-10-05'].meals[0].type = 'unknown'; },
    state => { state.days['2026-10-05'].meals[0].note = 'a'.repeat(4001); },
    state => { state.mealTemplates = [{ id: 'x', title: '예시', meal: { ...state.days['2026-10-05'].meals[0], protein: null } }]; },
    state => { const template = { id: 'x', title: '예시', meal: state.days['2026-10-05'].meals[0] }; state.mealTemplates = [template, structuredClone(template)]; },
    state => { state.mealTemplates = [{ id: 'x', title: '', meal: state.days['2026-10-05'].meals[0] }]; }
  ];
  for (const change of mutations) {
    const original = fixture(), state = structuredClone(original), store = memoryStorage({ [Storage.STORAGE_KEY]: JSON.stringify(original) });
    change(state);
    assert.throws(() => Storage.save(state, store));
    assert.equal(store.getItem(Storage.STORAGE_KEY), JSON.stringify(original));
  }
});

test("explicit activity, weekday overrides, preferences and cardio drafts preserve nulls", () => {
  const state = fixture(), snapshotBefore = structuredClone(state.days['2026-10-05'].planSnapshot);
  const activity = { sleepHours: 8, workHours: 8, workType: 'seated', lifestyleHours: null, lifestyleType: null };
  Object.assign(state.profile, { activityMode: 'detailed', dailyActivity: activity, weekdayActivity: { '0': null, '1': { ...activity, workHours: 6 } }, goalPreference: 'conservative', proteinPreference: 'lower' });
  state.days['2026-10-05'].dailyActivity = { ...activity, sleepHours: null };
  state.days['2026-10-05'].sessions[0] = { id: 'cardio', sport: 'walking', durationMin: 20, intensity: 'easy', cardio: { environment: 'treadmill', speedKmh: null, gradePct: 0 } };
  const result = Storage.parseBackup(Storage.exportBackup(state)).state;
  assert.deepEqual(result, state);
  assert.deepEqual(result.days['2026-10-05'].planSnapshot, snapshotBefore);
  assert.equal(result.days['2026-10-05'].sessions[0].cardio.speedKmh, null);
  for (const change of [
    value => { value.profile.weekdayActivity['7'] = activity; },
    value => { value.profile.dailyActivity.sleepHours = '8'; },
    value => { value.profile.activityMode = 'automatic'; },
    value => { value.days['2026-10-05'].sessions[0].cardio.gradePct = 21; },
    value => { value.days['2026-10-05'].sessions[0].sport = 'strength'; }
  ]) { const invalid = structuredClone(state); change(invalid); assert.throws(() => Storage.validateState(invalid)); }
});

test("dietary merge previews every conflict, protects complete days, and leaves unrelated context intact", () => {
  const before = fixture();
  before.training = require('../src/training-store.js').createEmpty();
  before.legacy = Storage.importLegacy({ version: 4, records: [] }).legacy;
  before.days['2026-10-04'] = { ...structuredClone(before.days['2026-10-05']), date: '2026-10-04', complete: false, planSnapshot: null, meals: [{ ...before.days['2026-10-05'].meals[0], id: 'open-meal' }], sessions: [] };
  const incoming = structuredClone(before);
  incoming.profile.weightKg = 80;
  incoming.legacy = null;
  incoming.days['2026-10-05'].meals[0].carbs = 100;
  incoming.days['2026-10-04'].meals[0].carbs = 50;
  incoming.days['2026-10-03'] = { ...structuredClone(incoming.days['2026-10-04']), date: '2026-10-03', meals: [{ ...incoming.days['2026-10-04'].meals[0], id: 'new-meal' }] };
  incoming.mealTemplates = [{ id: 't', title: '점심', meal: structuredClone(incoming.days['2026-10-04'].meals[0]) }];
  const original = structuredClone(before), source = structuredClone(incoming);
  const preview = Storage.previewMerge(before, incoming);
  assert.deepEqual(preview.counts, { added: 1, identical: 0, conflict: 1, protected: 1, 'id-conflict': 0 });
  const keep = Storage.mergeBackup(before, incoming);
  assert.deepEqual(keep.days['2026-10-04'], before.days['2026-10-04']);
  const replace = Storage.mergeBackup(before, incoming, ['2026-10-04']);
  assert.deepEqual(replace.days['2026-10-04'], incoming.days['2026-10-04']);
  assert.deepEqual(replace.days['2026-10-05'], before.days['2026-10-05']);
  assert.deepEqual(replace.profile, before.profile);
  assert.deepEqual(replace.legacy, before.legacy);
  assert.deepEqual(replace.training, before.training);
  assert.equal(replace.mealTemplates.length, 1);
  assert.throws(() => Storage.mergeBackup(before, incoming, ['2026-10-05']));
  assert.throws(() => Storage.mergeBackup(before, incoming, ['2026-10-04', '2026-10-04']));
  assert.deepEqual(Storage.mergeBackup(replace, incoming), replace);
  assert.deepEqual(before, original);
  assert.deepEqual(incoming, source);
});

test("merge does not identify meals by name or permit IDs reused on different dates", () => {
  const current = fixture();
  const incoming = fixture();
  const row = incoming.days['2026-10-05'];
  delete incoming.days[row.date];
  row.date = '2026-10-04'; incoming.days[row.date] = row;
  assert.equal(Storage.previewMerge(current, incoming).rows[0].status, 'id-conflict');
  assert.deepEqual(Storage.mergeBackup(current, incoming), current);
  row.meals[0].id = 'different-meal'; row.sessions[0].id = 'different-session';
  assert.equal(Storage.previewMerge(current, incoming).rows[0].status, 'added');
  assert.equal(Object.keys(Storage.mergeBackup(current, incoming).days).length, 2);
  const reordered = { ...current, days: { '2026-10-05': Object.fromEntries(Object.entries(current.days['2026-10-05']).reverse()) } };
  assert.equal(Storage.previewMerge(current, reordered).rows[0].status, 'identical');
});

test("optional coach check-in preserves older v9 days and explicit unanswered states", () => {
  const original = fixture();
  const store = memoryStorage({ [Storage.STORAGE_KEY]: JSON.stringify(original) });
  const loaded = Storage.load(store);
  assert.deepEqual(loaded.state, original);
  assert.equal(Object.hasOwn(loaded.state.days["2026-10-05"], "coachCheckin"), false);
  assert.deepEqual(Storage.parseBackup(Storage.exportBackup(loaded.state)).state, original);
  for (const coachCheckin of [null, { energy: null, hunger: null, sleep: null }]) {
    const state = fixture();
    state.days["2026-10-05"].coachCheckin = coachCheckin;
    const saved = Storage.save(state, store);
    assert.deepEqual(Storage.load(store).state, saved);
    assert.deepEqual(Storage.parseBackup(Storage.exportBackup(state)).state, state);
  }
  assert.equal(Storage.VERSION, 9);
  assert.equal(Storage.STORAGE_KEY, "macro-engine.v9");
});

test("all coach check-in response combinations round trip without changing completed snapshots", () => {
  let count = 0;
  for (const energy of [null, "low", "okay", "good"]) {
    for (const hunger of [null, "low", "okay", "high"]) {
      for (const sleep of [null, "poor", "okay", "good"]) {
        const state = fixture();
        const day = state.days["2026-10-05"];
        const planBefore = structuredClone(day.planSnapshot);
        day.coachCheckin = { energy, hunger, sleep };
        const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
        assert.deepEqual(restored, state);
        assert.deepEqual(restored.days[day.date].planSnapshot, planBefore);
        assert.equal(restored.days[day.date].complete, true);
        restored.days[day.date].coachCheckin.energy = "low";
        assert.equal(day.coachCheckin.energy, energy);
        count += 1;
      }
    }
  }
  assert.equal(count, 64);
});

test("optional coaching context keys preserve older three-answer check-ins and individual additions", () => {
  const originalCheckin = { energy: "okay", hunger: "high", sleep: "poor" };
  for (const addition of [{}, { trainingPlan: null }, { mealConstraint: null }, { performance: null }, { trainingPlan: "planned" }, { mealConstraint: "busy" }, { performance: "down" }]) {
    const state = fixture();
    const checkin = { ...originalCheckin, ...addition };
    state.days["2026-10-05"].coachCheckin = checkin;
    const saved = Storage.save(state, memoryStorage());
    assert.deepEqual(saved.days["2026-10-05"].coachCheckin, checkin);
    const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
    assert.deepEqual(restored, state);
    assert.deepEqual(Object.keys(restored.days["2026-10-05"].coachCheckin), Object.keys(checkin));
  }
});

test("all six-signal coach check-ins round trip without inventing performed sessions or changing snapshots", () => {
  const Nutrition = require("../src/nutrition.js");
  const input = fixture();
  const day = input.days["2026-10-05"];
  day.sessions = [];
  const planBefore = Nutrition.calculatePlan(input.profile, day, []);
  day.planSnapshot = planBefore;
  let count = 0;
  for (const energy of [null, "low", "okay", "good"]) for (const hunger of [null, "low", "okay", "high"]) {
    for (const sleep of [null, "poor", "okay", "good"]) for (const trainingPlan of [null, "rest", "planned"]) {
      for (const mealConstraint of [null, "none", "busy", "low-appetite", "digestive"]) for (const performance of [null, "down", "steady", "up"]) {
        day.coachCheckin = { energy, hunger, sleep, trainingPlan, mealConstraint, performance };
        const restored = Storage.parseBackup(Storage.exportBackup(input)).state;
        assert.deepEqual(restored, input);
        assert.deepEqual(restored.days[day.date].sessions, []);
        assert.deepEqual(restored.days[day.date].planSnapshot, planBefore);
        count += 1;
      }
    }
  }
  assert.equal(count, 3840);
  const afterCheckin = Nutrition.calculatePlan(input.profile, day, []);
  assert.deepEqual(afterCheckin.energy, planBefore.energy);
  assert.deepEqual(afterCheckin.macros, planBefore.macros);
  assert.deepEqual(afterCheckin.context, planBefore.context);
});

test("invalid coach check-in shapes, enums and unknown keys fail before any write", () => {
  const invalidCheckins = [
    false, 0, "okay", [], {},
    { energy: "good", hunger: "okay" },
    { energy: "good", hunger: "okay", sleep: "good", mood: "good" },
    { energy: "high", hunger: "okay", sleep: "good" },
    { energy: "good", hunger: "good", sleep: "good" },
    { energy: "good", hunger: "okay", sleep: "low" },
    { energy: 1, hunger: "okay", sleep: "good" },
    { energy: "good", hunger: [], sleep: "good" },
    { energy: "good", hunger: "okay", sleep: {} },
    { energy: "good", hunger: "okay", sleep: "good", trainingPlan: "completed" },
    { energy: "good", hunger: "okay", sleep: "good", mealConstraint: "unknown" },
    { energy: "good", hunger: "okay", sleep: "good", performance: "good" },
    { energy: "good", hunger: "okay", sleep: "good", trainingPlan: true },
    { energy: "good", hunger: "okay", sleep: "good", mealConstraint: [] },
    { energy: "good", hunger: "okay", sleep: "good", performance: {} },
    { trainingPlan: "planned", mealConstraint: "busy", performance: "down" },
    { energy: "good", hunger: "okay", sleep: "good", trainingPlan: "planned", mealConstraint: "busy", performance: "down", unexpected: null }
  ];
  const original = Storage.exportBackup(fixture());
  const store = memoryStorage({ [Storage.STORAGE_KEY]: original });
  let writes = 0;
  store.setItem = () => { writes += 1; };
  for (const coachCheckin of invalidCheckins) {
    const state = fixture();
    state.days["2026-10-05"].coachCheckin = coachCheckin;
    assert.throws(() => Storage.parseBackup(JSON.stringify(state)), /코치 체크인/);
    assert.throws(() => Storage.save(state, store), /코치 체크인/);
    assert.equal(store.getItem(Storage.STORAGE_KEY), original);
  }
  const unknownDayField = fixture();
  unknownDayField.days["2026-10-05"].coachCheckin = null;
  unknownDayField.days["2026-10-05"].unexpected = true;
  assert.throws(() => Storage.save(unknownDayField, store), /하루 기록/);
  assert.equal(writes, 0);
});

test("save performs one atomic write and never mutates the input", () => {
  const store = memoryStorage();
  const input = fixture();
  input.updatedAt = "2026-01-01T00:00:00.000Z";
  const saved = Storage.save(input, store);
  assert.equal(input.updatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(store.length, 1);
  assert.deepEqual(Storage.load(store).state, saved);
  const previous = store.getItem(Storage.STORAGE_KEY);
  store.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => Storage.save(fixture(), store), /저장하지 못했습니다/);
  assert.equal(store.getItem(Storage.STORAGE_KEY), previous);
});

test("corrupt and inaccessible storage remains intact and blocks automatic writes in caller", () => {
  const store = memoryStorage({ [Storage.STORAGE_KEY]: "{broken" });
  const loaded = Storage.load(store);
  assert.equal(loaded.storageBlocked, true);
  assert.equal(loaded.corruptedRaw, "{broken");
  assert.equal(store.getItem(Storage.STORAGE_KEY), "{broken");
  assert.ok(loaded.warnings.length);
  assert.equal(Storage.load({ getItem() { throw new Error("denied"); } }).storageBlocked, true);
});

test("strict schema rejects coercion, unsupported versions, non-finite numbers and extra fields before storage write", () => {
  const mutations = [
    state => { state.version = 10; },
    state => { state.profile.age = "35"; },
    state => { state.profile.weightKg = NaN; },
    state => { state.profile.bodyFatPct = 85; },
    state => { state.profile.trainingYears = 40; },
    state => { state.days["2026-10-05"].complete = "true"; },
    state => { state.days["2026-10-05"].meals[0].protein = -1; },
    state => { state.extra = true; },
    state => { state.days["2026-10-05"].meals[0].unexpected = 1; },
    state => { state.days["2026-10-05"].planSnapshot = null; },
    state => { state.days["2026-10-05"].meals = []; },
    state => { state.updatedAt = "2026-02-30T00:00:00.000Z"; }
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state);
    assert.throws(() => Storage.validateState(state));
  }
  const store = memoryStorage({ [Storage.STORAGE_KEY]: "original" });
  const invalid = fixture();
  invalid.profile.age = "35";
  assert.throws(() => Storage.save(invalid, store));
  assert.equal(store.getItem(Storage.STORAGE_KEY), "original");
});

test("calendar dates, cross-day duplicate IDs and total session duration are validated", () => {
  for (const valid of ["2024-02-29", "2026-10-05", "2000-02-29"]) assert.equal(Storage.isValidDate(valid), true);
  for (const invalid of ["2025-02-29", "2026-04-31", "2026-13-01", "26-10-05", "2026-10-05T00:00:00Z"]) assert.equal(Storage.isValidDate(invalid), false);
  let state = fixture();
  state.days["2026-10-05"].date = "2026-10-06";
  assert.throws(() => Storage.validateState(state));
  state = fixture();
  state.days["2026-10-06"] = { ...structuredClone(state.days["2026-10-05"]), date: "2026-10-06" };
  assert.throws(() => Storage.validateState(state), /중복/);
  state = fixture();
  state.days["2026-10-05"].sessions = [{ id: "a", sport: "walking", durationMin: 800, intensity: "easy" }, { id: "b", sport: "walking", durationMin: 800, intensity: "easy" }];
  assert.throws(() => Storage.validateState(state), /24시간/);
});

test("prototype pollution, cycles, oversized payloads and excessive nesting are rejected", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    assert.throws(() => Storage.parseBackup(`{"${key}":{"polluted":true}}`), /허용하지 않는/);
  }
  assert.equal({}.polluted, undefined);
  const state = fixture();
  state.days["2026-10-05"].planSnapshot.loop = state;
  assert.throws(() => Storage.validateState(state), /순환/);
  assert.throws(() => Storage.parseBackup(" ".repeat(Storage.MAX_BYTES + 1)), /10MB/);
  let deep = {};
  for (let index = 0; index < 26; index += 1) deep = { child: deep };
  assert.throws(() => Storage.parseBackup(JSON.stringify(deep)), /복잡/);
});

test("dated body composition needs same-day weight and physically consistent skeletal mass", () => {
  const state = fixture();
  const day = state.days["2026-10-05"];
  day.bodyFatPct = 25;
  day.bodyFatMethod = "bia";
  day.skeletalMuscleKg = 30;
  assert.equal(Storage.validateState(state).days[day.date].skeletalMuscleKg, 30);
  day.weightKg = null;
  assert.throws(() => Storage.validateState(state), /체중/);
  day.weightKg = 64.8;
  day.skeletalMuscleKg = 60;
  assert.throws(() => Storage.validateState(state), /제지방량/);
  day.skeletalMuscleKg = 30;
  day.bodyFatMethod = "guessed";
  assert.throws(() => Storage.validateState(state), /측정 방법/);
});

test("body-fat measurement weight is optional and never inferred from current weight", () => {
  const state = fixture();
  delete state.profile.bodyFatWeightKg;
  state.profile.bodyFatPct = 25;
  state.profile.bodyFatDate = "2026-06-01";
  assert.equal(Storage.validateState(state).profile.bodyFatWeightKg, null);
  state.profile.bodyFatWeightKg = 80;
  assert.equal(Storage.validateState(state).profile.bodyFatWeightKg, 80);
  state.profile.bodyFatWeightKg = 400;
  assert.throws(() => Storage.validateState(state), /측정 당시/);
  state.profile.bodyFatWeightKg = 80;
  state.profile.bodyFatPct = null;
  assert.throws(() => Storage.validateState(state), /체지방률/);
});

test("unknown training experience, supported contexts and default allocation round trip", () => {
  const state = fixture();
  state.profile.trainingYears = null;
  delete state.days["2026-10-05"].carbAdjustmentG;
  assert.equal(Storage.validateState(state).days["2026-10-05"].carbAdjustmentG, 0);
  assert.equal(Storage.validateState(state).profile.trainingYears, null);
  state.days["2026-10-05"].carbAdjustmentG = 501;
  assert.throws(() => Storage.validateState(state), /조정량/);
  state.days["2026-10-05"].carbAdjustmentG = -500;
  state.profile.healthContext = "pregnancy";
  state.profile.age = 16;
  assert.equal(Storage.validateState(state).profile.healthContext, "pregnancy");
  state.profile.sex = "unexpected";
  assert.throws(() => Storage.validateState(state), /선택값/);
});

test("malicious or inconsistent plan snapshots are rejected before they can reach rendering", () => {
  const mutations = [
    plan => { plan.status = "unknown"; },
    plan => { plan.energy.targetKcal = "2110"; },
    plan => { plan.macros.protein = null; },
    plan => { plan.macros.carbs.min = 500; },
    plan => { plan.macros.fat.target = 60; },
    plan => { plan.reasons = "not an array"; },
    plan => { plan.guidance[0].body = {}; },
    plan => { plan.sources[0].url = "javascript:alert(1)"; },
    plan => { plan.sources[0].url = "https://user:password@example.com"; },
    plan => { plan.context.energyAvailability = "bad"; }
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state.days["2026-10-05"].planSnapshot);
    assert.throws(() => Storage.parseBackup(JSON.stringify(state)));
  }
});

test("legacy backup is preserved separately without inventing completion, profile or new scores", () => {
  const raw = { app: "macro-engine", kind: "full-backup", backupVersion: 2, appVersion: "v8.3", data: { settings: { weight: 75 }, records: [{ date: "2026-07-15", weight: 74.12, adherencePercent: 83, adherenceScoringVersion: "v8.4", goalSnapshot: { targetCal: 2400, protein: 140, carbs: 300, fat: 80 }, meals: [{ id: "old", mealLabel: "김밥", protein: 20, carbs: 50, fat: 10, alcoholKcal: 70, otherKcal: 0 }] }], inbodyRecords: [{ date: "2026-07-15", skeletalMuscle: 35.123 }] } };
  const parsed = Storage.parseBackup(JSON.stringify(raw));
  assert.equal(parsed.kind, "legacy");
  assert.equal(parsed.state.profile, null);
  assert.deepEqual(parsed.state.days, {});
  assert.deepEqual(parsed.state.legacy.raw, raw);
  const old = parsed.state.legacy.records[0];
  assert.equal(old.completion, "unconfirmed");
  assert.equal(old.score, 83);
  assert.equal(old.intake.kcal, 440);
  assert.equal(old.readOnly, true);
  assert.deepEqual(Storage.parseBackup(Storage.exportBackup(parsed.state)).state, parsed.state);
  const corrupted = structuredClone(parsed.state);
  corrupted.legacy.records[0].score = {};
  assert.throws(() => Storage.parseBackup(JSON.stringify(corrupted)), /점수/);
});

test("legacy localStorage detection never writes or imports silently", () => {
  const raw = [{ date: "2026-07-15", weight: 75, meals: [] }];
  const entries = { runstep_macro_v1_records: JSON.stringify(raw), runstep_macro_v1_weight: "75", unrelated: "leave" };
  const store = memoryStorage(entries);
  const loaded = Storage.load(store);
  assert.equal(loaded.legacyAvailable, true);
  assert.equal(loaded.state.legacy, null);
  assert.equal(store.length, 3);
  const detected = Storage.detectLegacy(store);
  assert.equal(detected.entries.unrelated, undefined);
  const imported = Storage.importLegacy(detected);
  assert.equal(imported.legacy.records.length, 1);
  assert.equal(imported.legacy.records[0].score, null);
  assert.deepEqual(Object.fromEntries(store.entries), entries);
});

test("invalid legacy records retain original bytes as data but do not become interpreted records", () => {
  const raw = { kind: "legacy-local-storage", entries: { runstep_macro_v1_records: "broken JSON" } };
  const state = Storage.importLegacy(raw);
  assert.deepEqual(state.legacy.raw, raw);
  assert.deepEqual(state.legacy.records, []);
  assert.throws(() => Storage.parseBackup('{"version":99,"records":[]}'), /지원하지 않는/);
  const invalidNutrition = { version: 4, records: [{ date: "2026-10-05", meals: [{ protein: 10, carbs: 30, fat: 5, alcoholKcal: -1 }] }] };
  assert.equal(Storage.importLegacy(invalidNutrition).legacy.records[0].intake, null);
});

test("real nutrition snapshots round trip across sexes, goals, sports and body sizes", () => {
  const Nutrition = require("../src/nutrition.js");
  let count = 0;
  for (const sex of Nutrition.ENUMS.sex) for (const goal of Nutrition.ENUMS.goal) {
    for (const sport of Nutrition.ENUMS.sport) for (const weightKg of [45, 75, 120]) {
      const state = fixture();
      Object.assign(state.profile, { sex, goal, sport, weightKg, heightCm: 170, trainingYears: null });
      const day = state.days["2026-10-05"];
      day.weightKg = null;
      day.sessions = sport === "none" ? [] : [{ id: "training", sport, durationMin: 45, intensity: "moderate" }];
      day.planSnapshot = Nutrition.calculatePlan(state.profile, day, []);
      day.complete = day.planSnapshot.status === "ready";
      const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
      assert.deepEqual(restored.days[day.date].planSnapshot, day.planSnapshot);
      count += 1;
    }
  }
  assert.equal(count, 315);
});

test("completed diary can preserve review or incomplete plan without inventing calorie targets", () => {
  const Nutrition = require("../src/nutrition.js");
  for (const profile of [{ ...fixture().profile, healthContext: "pregnancy" }, null]) {
    const state = fixture();
    state.profile = profile;
    const day = state.days["2026-10-05"];
    day.planSnapshot = Nutrition.calculatePlan(profile, day, []);
    assert.notEqual(day.planSnapshot.status, "ready");
    const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
    assert.equal(restored.days[day.date].complete, true);
    assert.equal(restored.days[day.date].planSnapshot.energy.targetKcal, null);
    assert.equal(restored.days[day.date].planSnapshot.macros.protein.target, null);
  }
});

function trainingFixture() {
  const Training = require("../src/training-store.js");
  const training = Training.createEmpty();
  training.records.push({
    id: "manual-training", date: "2026-01-05", time: null, label: "테스트 운동",
    durationMinutes: 30, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    exercises: [{ id: "manual-exercise", rawName: "테스트 종목", exerciseId: null, equipmentKey: null,
      loadConvention: "as-recorded", durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
      sets: [{ id: "manual-set", loadKg: null, reps: 8, marker: null, rir: 2 }], notes: "부하 확인 필요" }],
    notes: "사용자 메모", effort: 7, pain: "none"
  });
  training.mappings.push({ rawName: "테스트 종목", exerciseId: "sample", equipmentKey: null, loadConvention: "as-recorded", confirmed: true });
  training.messages.push({ id: "question-1", role: "user", text: "이 기록을 확인해 주세요.", createdAt: "2026-01-05T10:00:00.000Z", source: "local", replyTo: null, contextDigest: null, status: "pending" });
  return training;
}

test("optional training preserves old v9 shape and full backup restores set diary, mapping and conversation", () => {
  const old = fixture();
  assert.equal(Object.hasOwn(Storage.validateState(old), "training"), false);
  const state = fixture(); state.training = trainingFixture();
  const before = structuredClone(state.days["2026-10-05"].planSnapshot);
  const restored = Storage.parseBackup(Storage.exportBackup(state));
  assert.deepEqual(restored.state, state);
  assert.equal(restored.summary.trainingRecords, 1);
  assert.equal(restored.summary.trainingMappings, 1);
  assert.equal(restored.summary.coachMessages, 1);
  const store = memoryStorage();
  const saved = Storage.save(state, store);
  assert.deepEqual(Storage.load(store).state, saved);
  assert.deepEqual(saved.days["2026-10-05"].planSnapshot, before);
  assert.equal(saved.days["2026-10-05"].sessions.length, 1);
  assert.equal(saved.training.records[0].exercises[0].sets[0].loadKg, null);
  saved.training.records[0].notes = "다른 값";
  assert.equal(state.training.records[0].notes, "사용자 메모");
  assert.equal(Storage.VERSION, 9);
  assert.equal(Storage.STORAGE_KEY, "macro-engine.v9");
});

test("invalid training cannot overwrite stored state or completed day snapshot", () => {
  const good = fixture(); good.training = trainingFixture();
  const original = Storage.exportBackup(good);
  const store = memoryStorage({ [Storage.STORAGE_KEY]: original });
  let writes = 0; store.setItem = () => { writes += 1; };
  const mutations = [
    state => { state.training = null; }, state => { state.training.version = 2; },
    state => { state.training.records[0].effort = "7"; },
    state => { state.training.records[0].exercises[0].sets[0].rir = 11; },
    state => { state.training.messages[0].replyTo = "missing"; },
    state => { state.training.inbox = []; }
  ];
  for (const mutate of mutations) {
    const state = structuredClone(good); mutate(state);
    assert.throws(() => Storage.save(state, store));
    assert.equal(store.getItem(Storage.STORAGE_KEY), original);
  }
  assert.equal(writes, 0);
  const broken = structuredClone(good); broken.training.version = 2;
  const corrupted = JSON.stringify(broken);
  const result = Storage.load(memoryStorage({ [Storage.STORAGE_KEY]: corrupted }));
  assert.equal(result.storageBlocked, true);
  assert.equal(result.corruptedRaw, corrupted);
});

test("optional meal provenance round trips while older meals remain unchanged", () => {
  const original = fixture();
  assert.equal(Object.hasOwn(Storage.validateState(original).days["2026-10-05"].meals[0], "source"), false);
  for (const kind of ["manual", "label", "image", "estimate"]) {
    for (const confidence of kind === "estimate" ? ["estimated"] : ["known", "estimated"]) {
      const state = fixture();
      const source = { kind, confidence, note: "사용자가 확인한 입력 출처", hash: kind === "image" ? "a".repeat(64) : null };
      state.days["2026-10-05"].meals[0].source = source;
      const before = structuredClone(state.days["2026-10-05"].planSnapshot);
      const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
      assert.deepEqual(restored, state);
      assert.deepEqual(restored.days["2026-10-05"].planSnapshot, before);
      restored.days["2026-10-05"].meals[0].source.note = "changed";
      assert.equal(source.note, "사용자가 확인한 입력 출처");
    }
  }
});

test("unconfirmed image drafts and invalid provenance cannot enter permanent meals", () => {
  const original = Storage.exportBackup(fixture());
  const store = memoryStorage({ [Storage.STORAGE_KEY]: original });
  let writes = 0; store.setItem = () => { writes += 1; };
  const source = { kind: "image", confidence: "estimated", note: "사진 추정", hash: "a".repeat(64) };
  const changes = [
    meal => { meal.protein = null; }, meal => { meal.carbs = "80"; },
    meal => { meal.source = null; }, meal => { meal.source = { ...source, kind: "ocr" }; },
    meal => { meal.source = { ...source, confidence: "certain" }; },
    meal => { meal.source = { ...source, kind: "estimate", confidence: "known" }; },
    meal => { meal.source = { ...source, hash: "not-a-hash" }; },
    meal => { meal.source = { ...source, note: {} }; },
    meal => { meal.source = { ...source, approved: false }; }
  ];
  for (const change of changes) {
    const state = fixture(); const meal = state.days["2026-10-05"].meals[0];
    meal.source = structuredClone(source); change(meal);
    assert.throws(() => Storage.save(state, store));
    assert.throws(() => Storage.parseBackup(JSON.stringify(state)));
    assert.equal(store.getItem(Storage.STORAGE_KEY), original);
  }
  assert.equal(writes, 0);
});
