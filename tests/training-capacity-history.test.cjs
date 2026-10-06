"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const day = "2026-10-06";
const set = (id, loadKg = 100, reps = 8, extras = {}) => ({ id, loadKg, reps, marker: null, rir: null, ...extras });
const exercise = (id, extras = {}) => ({ id, rawName: "바벨 스쿼트", exerciseId: "squat", equipmentKey: "rack-A", loadConvention: "total", loadRole: "external", sets: [set(id + "-set")], notes: "", ...extras });
const record = (id, date = day, exercises = [exercise(id + "-block")], extras = {}) => ({ id, date, time: null, label: "합성 운동", exercises,
  source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, notes: "", pain: null, effort: null,
  sequence: { order: "unknown", structure: "unknown" }, ...extras });
const analyze = (records, extras = {}) => T.analyze(records, { date: day, includeCapacityHistory: true, ...extras });
const history = (records, extras = {}) => analyze(records, extras).capacityHistory;

test("full capacity history is explicit opt-in and does not alter the default 28-day analysis", () => {
  const records = [record("old", "2026-06-01", [exercise("old", { sets: [set("old-set", 120, 3)] })], { pain: "stop", trainingIntent: "test" }), record("current")];
  const normal = T.analyze(records, { date: day }), extended = analyze(records), { capacityHistory, ...sameAnalysis } = extended;
  assert.deepEqual(sameAnalysis, normal);
  assert.equal(Object.hasOwn(normal, "capacityHistory"), false);
  for (const includeCapacityHistory of [false, null, 0, 1, "true", undefined]) assert.equal(Object.hasOwn(T.analyze(records, { date: day, includeCapacityHistory }), "capacityHistory"), false);
  assert.equal(capacityHistory.scope, "all-recorded-history");
  assert.equal(capacityHistory.from, "2026-06-01");
  assert.equal(capacityHistory.to, day);
  assert.deepEqual(capacityHistory.samples.map(row => row.sessionId), ["old", "current"]);
  assert.deepEqual(normal.sessions.map(row => row.id), ["current"]);
  assert.equal(capacityHistory.samples[0].pain, "stop");
  assert.equal(capacityHistory.samples[0].trainingIntent, "test");
  assert.equal(extended.recovery.pain, null);
});

test("full history honors the chosen cutoff and never reads later records as historical capacity", () => {
  const result = history([record("old", "2026-06-01"), record("cutoff", "2026-10-01"), record("future", day, [exercise("future", { sets: [set("future-set", 999, 1)] })])], { date: "2026-10-01" });
  assert.equal(result.to, "2026-10-01");
  assert.deepEqual(result.samples.map(row => row.sessionId), ["old", "cutoff"]);
  assert.equal(result.excludedRecords, 1);
  assert.doesNotMatch(JSON.stringify(result), /future|999/);
});

test("invalid dates and an absent end date return an empty explicit history instead of using arbitrary records", () => {
  for (const date of [null, "invalid", "2026-02-30"]) {
    const result = history([record("record")], { date });
    assert.equal(result.from, null);
    assert.equal(result.to, null);
    assert.deepEqual(result.samples, []);
    assert.equal(result.excludedRecords, 1);
  }
  const inferredEmpty = T.analyze([], { includeCapacityHistory: true }).capacityHistory;
  assert.deepEqual(inferredEmpty, { scope: "all-recorded-history", from: null, to: null, samples: [], excludedRecords: 0 });
  assert.deepEqual(history([]), { scope: "all-recorded-history", from: null, to: day, samples: [], excludedRecords: 0 });
});

test("whole history keeps chronological records and original exercise block order without deriving exercise execution order", () => {
  const early = record("early", "2026-06-01", [exercise("A-first"), exercise("B", { equipmentKey: "rack-B" }), exercise("A-again")]), late = record("late");
  const result = history([late, early]);
  assert.deepEqual(result.samples.map(row => row.blockId), ["A-first", "B", "A-again", "late-block"]);
  assert.deepEqual(result.samples.slice(0, 3).map(row => row.equipmentKey), ["rack-A", "rack-B", "rack-A"]);
  assert.ok(result.samples.every(row => !Object.hasOwn(row, "executionPosition")));
});

test("exercise descriptions reuse current confirmed mappings while actual per-side load values are preserved", () => {
  const raw = exercise("alias", { rawName: "내 덤벨 운동", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded", loadRole: "unknown", sets: [set("side-set", 30, 10)] });
  const mappings = [{ rawName: raw.rawName, exerciseId: "dumbbell_bench_press", equipmentKey: "dumbbells-A", loadConvention: "per-side", loadRole: "external", confirmed: true }];
  const described = T.describeExercise(raw, mappings), result = history([record("mapped", "2026-06-01", [raw])], { mappings }), sample = result.samples[0];
  assert.equal(sample.exerciseId, described.resolved.id);
  assert.equal(sample.equipmentKey, described.equipmentKey);
  assert.equal(sample.loadConvention, "per-side");
  assert.equal(sample.loadRole, "external");
  assert.equal(sample.variantKey, described.variantKey);
  assert.equal(sample.ruleConflict, described.ruleConflict);
  assert.equal(sample.sets[0].loadKg, 30);
});

test("unsupported or unresolved exercise records remain raw history without inventing a model classification", () => {
  const result = history([record("unresolved", "2026-06-01", [exercise("unknown", { rawName: "커스텀 동작", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded", loadRole: "unknown" })])]);
  assert.equal(result.samples[0].exerciseId, null);
  assert.equal(result.samples[0].rawName, "커스텀 동작");
  assert.equal(result.samples[0].loadRole, "unknown");
  assert.equal(result.samples[0].sets[0].loadKg, 100);
  assert.doesNotMatch(JSON.stringify(result), /e1rm|estimatedStrength|growthRate/i);
});

test("null, actual zero, missing values and invalid numeric strings stay distinct without coercion", () => {
  const sets = [set("null", null, 8), set("zero", 0, 8, { rir: 0 }), { id: "missing", marker: null },
    set("strings", "100", "8", { rir: "2" }), set("invalid", -10, 0, { rir: 11 })];
  const result = history([record("values", day, [exercise("values", { sets })])]), values = result.samples[0].sets;
  assert.deepEqual(values.map(row => row.loadKg), [null, 0, null, null, null]);
  assert.deepEqual(values.map(row => row.reps), [8, 8, null, null, null]);
  assert.deepEqual(values.map(row => row.rir), [null, 0, null, null, null]);
  assert.equal(sets[3].loadKg, "100");
});

test("bodyweight, assistance and marked sets are preserved for downstream eligibility rather than converted", () => {
  const exercises = [exercise("bodyweight", { rawName: "풀 업", exerciseId: "pull_up", loadConvention: "bodyweight", loadRole: "unknown", sets: [set("bodyweight-set", null, 8)] }),
    exercise("assisted", { rawName: "보조 풀업", exerciseId: "assisted_pull_up", loadRole: "assistance", sets: [set("assisted-set", 40, 8)] }),
    exercise("marked", { sets: [set("warmup", 20, 10, { marker: "W" }), set("drop", 60, 12, { marker: "D" })] })];
  const result = history([record("unsupported", "2026-06-01", exercises)]);
  assert.equal(result.samples[0].loadConvention, "bodyweight");
  assert.equal(result.samples[0].sets[0].loadKg, null);
  assert.equal(result.samples[1].loadRole, "assistance");
  assert.equal(result.samples[1].sets[0].loadKg, 40);
  assert.deepEqual(result.samples[2].sets.map(row => row.marker), ["W", "D"]);
});

test("identical record IDs collapse once and conflicting record IDs are fully quarantined", () => {
  const original = record("same", "2026-06-01"), exact = structuredClone(original);
  const duplicate = history([original, exact]);
  assert.equal(duplicate.samples.length, 1);
  assert.equal(duplicate.excludedRecords, 1);
  exact.exercises[0].sets[0].loadKg = 999;
  const conflict = history([original, exact, record("independent")]);
  assert.deepEqual(conflict.samples.map(row => row.sessionId), ["independent"]);
  assert.equal(conflict.excludedRecords, 2);
  assert.doesNotMatch(JSON.stringify(conflict), /999/);
});

test("copied image observations cannot vote twice and conflicting source interpretations remain excluded", () => {
  const original = record("image", "2026-06-01", [exercise("image-block")], { source: { kind: "visual", hash: "a".repeat(64), paths: [], uncertainties: [], revision: null } });
  const copy = structuredClone(original); copy.id = "image-copy"; copy.exercises[0].id = "copied-block"; copy.exercises[0].sets[0].id = "copied-set";
  const collapsed = history([original, copy]);
  assert.equal(collapsed.samples.length, 1);
  assert.equal(collapsed.excludedRecords, 1);
  copy.exercises[0].loadRole = "assistance";
  const conflict = history([original, copy]);
  assert.deepEqual(conflict.samples, []);
  assert.equal(conflict.from, null);
  assert.equal(conflict.excludedRecords, 2);
});

test("different feedback interpretations of the same image are not silently resolved by input order", () => {
  const original = record("image", "2026-06-01", [exercise("image-block")], { source: { kind: "visual", hash: "b".repeat(64) } });
  original.exercises[0].feedback = { setId: "image-block-set", feeling: "comfortable", loadKg: 100, reps: 8 };
  const copy = structuredClone(original); copy.id = "copy"; copy.exercises[0].feedback.feeling = "limit";
  for (const records of [[original, copy], [copy, original]]) assert.equal(history(records).samples.length, 0);
});

test("valid feedback follows only its matching actual general set and never creates RIR values", () => {
  const raw = exercise("feedback", { sets: [set("first", 120, 3), set("selected", 100, 8)], feedback: { setId: "selected", feeling: "comfortable", loadKg: 100, reps: 8, inventedRir: 5 } });
  const sample = history([record("feedback", "2026-06-01", [raw])]).samples[0];
  assert.deepEqual(sample.feedback, { setId: "selected", feeling: "comfortable", loadKg: 100, reps: 8 });
  assert.ok(sample.sets.every(row => row.rir === null));
  assert.equal(sample.sets[0].reps, 3);
  assert.equal(sample.sets[1].reps, 8);
});

test("deleted, changed, marked, unreadable or unmatched feedback snapshots do not enter capacity history", () => {
  const baseline = exercise("feedback", { sets: [set("selected", 100, 8)], feedback: { setId: "selected", feeling: "hard", loadKg: 100, reps: 8 } });
  for (const change of [raw => { raw.sets = []; }, raw => { raw.sets[0].loadKg = 90; }, raw => { raw.sets[0].reps = 9; }, raw => { raw.sets[0].marker = "D"; },
    raw => { raw.sets[0].reps = null; }, raw => { raw.feedback.setId = "missing"; }, raw => { raw.feedback.feeling = "unknown"; }]) {
    const raw = structuredClone(baseline); change(raw);
    assert.equal(Object.hasOwn(history([record("feedback", "2026-06-01", [raw])]).samples[0], "feedback"), false);
  }
});

test("conflicting duplicated set identities do not create a fabricated best set or retain stale feedback", () => {
  const raw = exercise("conflicted", { sets: [set("same-set", 100, 8), set("same-set", 999, 1), set("independent", 80, 10)], feedback: { setId: "same-set", feeling: "comfortable", loadKg: 100, reps: 8 } });
  const sample = history([record("conflicted", "2026-06-01", [raw])]).samples[0];
  assert.deepEqual(sample.sets.map(row => row.id), ["independent"]);
  assert.equal(Object.hasOwn(sample, "feedback"), false);
  assert.equal(raw.sets.length, 3);
});

test("capacity history is detached from saved records and preserves all purposes, pain and source kind as observations", () => {
  const raw = exercise("raw", { sets: [set("selected", 100, 8)], feedback: { setId: "selected", feeling: "limit", loadKg: 100, reps: 8 } });
  const records = [record("raw", "2026-06-01", [raw], { trainingIntent: "deload", pain: "mild", source: { kind: "legacy-ocr", hash: null } })], before = structuredClone(records);
  const sample = history(records).samples[0];
  assert.equal(sample.trainingIntent, "deload");
  assert.equal(sample.pain, "mild");
  assert.equal(sample.sourceKind, "legacy-ocr");
  sample.sets[0].loadKg = 999; sample.feedback.feeling = "comfortable";
  assert.deepEqual(records, before);
});

test("invalid records cannot extend the history range or introduce future capacity samples", () => {
  const records = [null, {}, record("invalid-date", "wrong"), record("no-exercises", day, null), record("future", "2026-10-07"), record("valid", "2026-06-01")];
  const result = history(records);
  assert.equal(result.from, "2026-06-01");
  assert.deepEqual(result.samples.map(row => row.sessionId), ["valid"]);
  assert.equal(result.excludedRecords, 5);
});
