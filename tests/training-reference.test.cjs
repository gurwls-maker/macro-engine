"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const today = "2026-10-06";
const set = (id, loadKg, reps, rir = null, marker = null) => ({ id, loadKg, reps, rir, marker });
const exercise = (id, sets, extras = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "bench-A", loadConvention: "total", loadRole: "external", sets, ...extras });
const record = (id, date, sets, extras = {}) => ({ id, date, time: null, label: "합성 운동", source: { kind: "manual", hash: null },
  exercises: [exercise(id + "-block", sets)], sequence: { order: "listed", structure: "straight" }, ...extras });
const request = { exerciseId: "bench_press", equipmentKey: "bench-A", loadConvention: "total", loadRole: "external", repsMin: 6, repsMax: 10 };
const reference = (records, changes = {}) => T.startingReference(records, { ...request, ...changes }, { date: today });

function calibration(transform = () => {}) {
  const records = [];
  for (const [index, date, nextDate, load] of [[1, "2026-08-01", "2026-08-02", 40], [2, "2026-08-15", "2026-08-16", 44], [3, "2026-08-29", "2026-08-30", 48]]) {
    const target = record("target-" + index, date, [set("target-set-" + index, load, 10, 2)]);
    transform(target, index);
    records.push(target, record("source-" + index, nextDate, [set("source-set-" + index, load / 2, 10, 2)], {
      exercises: [exercise("source-block-" + index, [set("source-set-" + index, load / 2, 10, 2)], { rawName: "덤벨 벤치 프레스", exerciseId: "dumbbell_bench_press", equipmentKey: "dumbbells-B", loadConvention: "per-side" })]
    }));
  }
  records.push(record("source-latest", "2026-10-05", [], { exercises: [exercise("source-block-latest", [set("source-set-latest", 22, 10, 2)], { rawName: "덤벨 벤치 프레스", exerciseId: "dumbbell_bench_press", equipmentKey: "dumbbells-B", loadConvention: "per-side" })] }));
  return records;
}

test("requested repetitions find the actual later working set instead of an unrelated first heavy set", () => {
  const records = [record("top-backoff", "2026-10-04", [set("top", 120, 3), set("backoff-1", 100, 6), set("backoff-2", 100, 4)])];
  const before = structuredClone(records), result = reference(records);
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.range, { minKg: 100, maxKg: 100, source: "observed-target" });
  assert.equal(result.references[0].setId, "backoff-1");
  assert.equal(result.references[0].generalSetPosition, 2);
  assert.equal(result.references[0].generalSetCount, 3);
  assert.equal(result.references[0].selection, "requested-reps");
  assert.equal(result.references[0].rir, null);
  assert.deepEqual(records, before);
});

test("a current matching working set remains visible alongside a previous matching record", () => {
  const result = reference([record("prior", "2026-09-18", [set("prior-first", 100, 10)]),
    record("current", "2026-10-04", [set("current-top", 120, 3), set("current-work", 100, 6)])]);
  assert.deepEqual(result.references.map(row => row.setId), ["current-work", "prior-first"]);
  assert.deepEqual(result.references.map(row => row.date), ["2026-10-04", "2026-09-18"]);
});

test("explicit repetition and RIR requests select matching raw values without translating feedback into RIR", () => {
  const records = [record("matching", "2026-10-04", [set("first", 80, 10, 0), set("second", 60, 8), set("third", 70, 8, 2)])];
  const result = reference(records, { rir: 2 });
  assert.equal(result.references[0].setId, "third");
  assert.equal(result.references[0].generalSetPosition, 3);
  assert.equal(result.references[0].selection, "requested-reps-and-rir");
  assert.equal(result.references[0].loadKg, 70);
  assert.equal(result.references[0].rir, 2);
});

test("missing RIR does not prevent actual repetition-matched sets from being shown", () => {
  const result = reference([record("missing-rir", "2026-10-04", [set("top", 120, 3), set("work", 100, 8)])], { rir: 2 });
  assert.equal(result.references[0].setId, "work");
  assert.equal(result.references[0].rir, null);
  assert.equal(result.references[0].selection, "requested-reps");
  assert.equal(result.transfer, null);
});

test("without requested repetition or effort conditions the first actual general set remains the direct reference", () => {
  const result = reference([record("first", "2026-10-04", [set("warm", 20, 10, null, "W"), set("start", 60, 10), set("peak", 100, 1)])], { repsMin: null, repsMax: null });
  assert.equal(result.references[0].setId, "start");
  assert.equal(result.references[0].generalSetPosition, 1);
  assert.equal(result.references[0].selection, "first-general");
  assert.equal(result.range.maxKg, 60);
});

test("unmatched requested repetitions fall back to the raw first set with an explicit selection basis", () => {
  const result = reference([record("unmatched", "2026-10-04", [set("first", 120, 3), set("second", 100, 4)])]);
  assert.equal(result.references[0].setId, "first");
  assert.equal(result.references[0].selection, "first-general");
  assert.ok(result.reasons.some(line => /조건에 맞는 세트가 없는 일지는 첫 일반 세트/.test(line)));
});

test("preparation and marked sets are not silently promoted to repetition-matched general work", () => {
  const result = reference([record("marked", "2026-10-04", [set("warm", 100, 8, 2, "W"), set("drop", 100, 8, 2, "D"), set("actual", 120, 3)])]);
  assert.equal(result.references[0].setId, "actual");
  assert.equal(result.references[0].generalSetCount, 1);
});

test("an unreadable earlier general set is preserved in the selected set position rather than silently renumbered", () => {
  const result = reference([record("partial", "2026-10-04", [set("unknown", null, null), set("known", 60, 8)])], { repsMin: null, repsMax: null });
  assert.equal(result.references[0].setId, "known");
  assert.equal(result.references[0].generalSetPosition, 2);
  assert.equal(result.references[0].generalSetCount, 2);
  assert.equal(result.references[0].selection, "first-known-general");
  assert.equal(result.transfer, null);
});

test("ordinary low repetition training is a real baseline, not an automatically inferred test", () => {
  const result = reference([record("low-reps", "2026-10-04", [set("low-rep-work", 120, 3)])], { repsMin: 3, repsMax: 3 });
  assert.equal(result.references[0].setId, "low-rep-work");
  assert.equal(result.referencePurpose, "regular-baseline");
  assert.equal(result.references[0].trainingIntent, null);
});

test("a known test or deload does not replace an available regular starting baseline", () => {
  for (const trainingIntent of ["test", "deload", "return", "technique", "time-limited", "light"]) {
    const result = reference([record("ordinary", "2026-09-24", [set("ordinary-set", 100, 8)]),
      record("special", "2026-10-04", [set("special-set", 50, 8)], { trainingIntent })]);
    assert.deepEqual(result.references.map(row => row.setId), ["ordinary-set"]);
    assert.equal(result.referencePurpose, "regular-baseline");
  }
});

test("when only special-purpose records exist their actual values remain visible but not as a regular baseline", () => {
  const records = [record("test-only", "2026-10-04", [set("test-set", 120, 3)], { trainingIntent: "test" })], before = structuredClone(records);
  const result = reference(records, { repsMin: 3, repsMax: 3 });
  assert.equal(result.status, "recorded");
  assert.equal(result.range.minKg, 120);
  assert.equal(result.references[0].trainingIntent, "test");
  assert.equal(result.referencePurpose, "nonregular-observation");
  assert.ok(result.reasons.some(line => /평소 운동의 시작 기준으로 쓰지는 않아요/.test(line)));
  assert.equal(result.transfer, null);
  assert.deepEqual(records, before);
});

test("later matched sets do not become first-set calibration pairs for a new load conversion", () => {
  const records = calibration(target => { target.exercises[0].sets.unshift(set(target.id + "-top", 100, 3, 2)); });
  const result = reference(records, { repsMin: 8, repsMax: 12, rir: 2, contextKey: "[]" });
  assert.notEqual(result.status, "personal-transfer");
  assert.equal(result.transfer, null);
  assert.ok(result.references.every(row => row.generalSetPosition === 2));
  assert.ok(result.references.every(row => row.loadConvention === "total"));
});

test("a missing earlier general load cannot make a later set look like a first-set transfer observation", () => {
  const records = calibration(target => { target.exercises[0].sets.unshift(set(target.id + "-unknown", null, 10, 2)); });
  const result = reference(records, { repsMin: 8, repsMax: 12, rir: 2, contextKey: "[]" });
  assert.notEqual(result.status, "personal-transfer");
  assert.ok(result.references.every(row => row.generalSetPosition === 2));
});

test("known nonregular observations cannot supply a missing calibration pair", () => {
  const records = calibration((target, index) => { if (index === 2) target.trainingIntent = "deload"; });
  const result = reference(records, { repsMin: 8, repsMax: 12, rir: 2, contextKey: "[]" });
  assert.notEqual(result.status, "personal-transfer");
  assert.equal(result.transfer, null);
  assert.ok(result.references.every(row => row.trainingIntent === null));
});
