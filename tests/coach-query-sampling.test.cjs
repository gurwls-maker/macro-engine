"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../src/coach-query.js");
const T = require("../src/training.js");
const TS = require("../src/training-store.js");
const S = require("../src/storage.js");
const Runtime = require("../tools/coach-runtime.cjs");

function fixture(count = 10, dates = ["2026-09-14", "2026-09-18"]) {
  const value = { ...S.createEmpty(), updatedAt: "2026-10-06T00:00:00.000Z", training: TS.createEmpty() };
  value.training.records = dates.map(date => ({ id: `sample-${date}`, date, time: null, label: "합성 장비별 수행",
    durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, notes: "", pain: null, effort: null,
    exercises: Array.from({ length: count }, (_, position) => ({ id: `sample-${date}-${position}`, rawName: "벤치프레스",
      exerciseId: "bench_press", equipmentKey: `synthetic/distinct-equipment/${position}`, loadConvention: "total", loadRole: "external",
      durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: "",
      sets: [{ id: `sample-set-${date}-${position}`, loadKg: 47, reps: 9, marker: null, rir: null }] })) }));
  return value;
}

test("query comparison sample keeps the true pre-sample count and whole-period source aggregates", () => {
  const value = fixture(), before = structuredClone(value);
  const period = Q.retrieve(value, "2026-09-18", "최근 기록에서 다음 운동").periods[0];
  const full = T.analyze(value.training.records, { date: "2026-09-18", mappings: [] });
  assert.equal(full.progression.length, 10);
  assert.equal(period.training.progression.length, 8);
  assert.equal(period.training.originalProgressionSummaryCount, 10);
  assert.equal(period.training.progressionSampled, true);
  assert.match(period.training.progressionDetailScope, /최대 8개.*기간 전체 세트 집계/);
  assert.equal(period.training.coverage.workingSets, 20);
  assert.equal(period.training.muscles.find(row => row.id === "chest").directSets, 20);
  assert.equal(new Set(period.training.progression.map(row => row.equipmentKey)).size, 8);
  for (const row of period.training.progression) {
    assert.equal(row.windowStart, period.from); assert.equal(row.windowEnd, period.to);
    assert.ok(value.training.records.some(record => record.date === row.current.date));
  }
  assert.deepEqual(value, before);
});

test("non-overlapping query chunks disclose all comparison rows before choosing recent detail samples", () => {
  const value = fixture(10, ["2026-08-03", "2026-08-06", "2026-09-03", "2026-09-06"]), before = structuredClone(value);
  const period = Q.retrieve(value, "2026-09-18", "2026-08-01부터 2026-09-18까지 운동 기록").periods[0];
  assert.equal(period.training.chunkCount, 2);
  assert.equal(period.training.originalProgressionSummaryCount, 20);
  assert.equal(period.training.progression.length, 8);
  assert.equal(period.training.coverage.recordCount, 4);
  assert.equal(period.training.coverage.workingSets, 40);
  assert.ok(period.training.progression.every(row => row.windowStart === "2026-08-29" && row.windowEnd === "2026-09-18"));
  assert.match(period.training.progressionScope, /조각 사이 수행 변화.*계산하지 않습니다/);
  assert.deepEqual(value, before);
});

test("runtime budget trimming cannot replace the original query count with its already limited eight comparisons", () => {
  const F = require("./fixtures/coaching-scenarios.cjs");
  const scenario = F.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === "cross-deficit-preserved");
  const date = scenario.checkpoints[3].date;
  const value = F.asOf(scenario, date, { richActivity: true });
  value.training = fixture(16, ["2026-09-30", "2026-10-02"]).training;
  for (const record of value.training.records) for (const exercise of record.exercises) {
    exercise.sets = Array.from({ length: 3 }, (_, index) => ({ ...exercise.sets[0], id: `${exercise.sets[0].id}-${index}` }));
  }
  for (const key of ["constraints", "focus", "agreements"]) value.training.memory[key] = "합성 저장 맥락입니다. ".repeat(500).slice(0, 5900);
  value.training.memory.updatedAt = "2026-10-02T00:00:00.000Z";
  const before = structuredClone(value);
  const raw = Q.retrieve(value, date, "최근 기록에서 다음 운동"), rawBefore = structuredClone(raw);
  const context = Runtime.summarizeState(value, date, "최근 기록에서 다음 운동");
  const actual = context.retrieval.periods[0].training;
  assert.ok(actual.progression.length < raw.periods[0].training.progression.length, "synthetic packet exercises an additional runtime sampling step");
  assert.equal(actual.originalProgressionSummaryCount, 16);
  assert.equal(actual.progressionSampled, true);
  assert.match(actual.progressionDetailScope, /일부 수행 비교.*전체 기간의 모든 종목·장비 비교는 아니/);
  assert.deepEqual(actual.coverage, raw.periods[0].training.coverage);
  assert.deepEqual(actual.muscles, raw.periods[0].training.muscles);
  assert.equal(context.trainingCoaching.exerciseContexts.length, 16);
  for (const row of context.trainingCoaching.exerciseContexts) {
    assert.equal(row.actual.current.sampled, false);
    assert.equal(row.actual.current.originalSetCount, 3);
    assert.equal(row.actual.current.sets.length, 3);
  }
  assert.deepEqual(value, before); assert.deepEqual(raw, rawBefore);
});

test("an untrimmed query does not manufacture a sampled scope or a larger original comparison count", () => {
  for (const count of [0, 1, 8]) {
    const value = fixture(count), period = Q.retrieve(value, "2026-09-18", "최근 기록에서 다음 운동").periods[0];
    assert.equal(period.training.progression.length, count);
    assert.equal(period.training.originalProgressionSummaryCount, undefined);
    assert.equal(period.training.progressionSampled, undefined);
    assert.equal(period.training.progressionDetailScope, undefined);
  }
});
