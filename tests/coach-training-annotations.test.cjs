"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const T = require("../src/training.js");
const C = require("../src/coach-context.js");
const Q = require("../src/coach-query.js");
const I = require("../src/insights.js");
const Runtime = require("../tools/coach-runtime.cjs");

const date = "2026-10-06";
function record(id, when = date, count = 1) {
  return { id, date: when, time: null, label: "합성 로우 기록", durationMinutes: null,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    notes: "", pain: null, effort: null,
    exercises: [{ id: `${id}:e`, rawName: "바벨 로우", exerciseId: "barbell_row",
      equipmentKey: "confirmed-row", loadConvention: "total", loadRole: "external",
      reportedVolumeKg: null, durationMinutes: null, repsTotal: null, notes: "",
      sets: Array.from({ length: count }, (_, index) => ({ id: `${id}:s:${index}`, loadKg: 30, reps: 10, marker: null, rir: null })) }] };
}
function annotate(row, intent = "deload", feeling = "comfortable") {
  row.trainingIntent = intent;
  const exercise = row.exercises[0], set = exercise.sets.at(-1);
  exercise.feedback = { setId: set.id, feeling, loadKg: set.loadKg, reps: set.reps };
  return row;
}
function state(records) {
  return { ...S.createEmpty(), updatedAt: "2026-10-06T00:00:00.000Z", training: { ...TS.createEmpty(), records } };
}

test("exact query preserves user intent and last-set feeling even outside the raw set sample", () => {
  const row = annotate(record("annotated", date, 8)), value = state([row]), before = structuredClone(value);
  const detail = Q.retrieve(value, date, "오늘 바벨 로우 기록").periods[0].details.workouts[0];
  assert.equal(detail.trainingIntent, "deload");
  assert.deepEqual(detail.exercises[0].feedback, row.exercises[0].feedback);
  assert.equal(detail.exercises[0].sets.some(set => set.id === detail.exercises[0].feedback.setId), false);
  assert.equal(detail.exercises[0].sampled, true);
  assert.ok(detail.exercises[0].sets.every(set => set.rir === null));
  assert.equal(C.build(value, date).training.lastSession.trainingIntent, "deload");
  detail.exercises[0].feedback.feeling = "limit";
  assert.deepEqual(value, before, "query annotations must be independent copies of saved records");
});

test("AI background, source index, decision context and query retain intent without promoting feeling to RIR", () => {
  const row = annotate(record("latest", date, 8), "technique", "hard"), value = state([row]), before = structuredClone(value);
  const context = Runtime.summarizeState(value, date, "오늘 바벨 로우 기록");
  for (const projected of [context.workoutIndex[0], context.recentWorkouts[0], context.trainingAnalysis.lastSession,
    context.trainingAnalysis.sessions[0], context.decisionContext.training.lastSession, context.retrieval.periods[0].details.workouts[0]]) {
    assert.equal(projected.trainingIntent, "technique");
  }
  const projected = context.recentWorkouts[0].exercises[0];
  assert.deepEqual(projected.feedback, row.exercises[0].feedback);
  assert.ok(projected.sets.every(set => set.rir === null));
  const snapshot = context.facts.find(fact => fact.id === "packet.recentWorkouts.0.exercises.0.feedback.loadKg");
  assert.equal(snapshot.value, 30); assert.equal(snapshot.estimated, false);
  assert.ok(!context.facts.some(fact => /feedback.*(?:rir|feeling)$/.test(fact.id)));
  assert.match(Runtime.promptFor({ kind: "chat", context }), /숫자 RIR로 환산하거나 다른 세트·세션 전체에 확대하지/);
  assert.deepEqual(value, before);
});

test("intent remains attached to strict progression rather than intentional light work becoming a decline", () => {
  const previous = record("previous", "2026-10-05"), current = annotate(record("current"), "deload");
  previous.trainingIntent = "regular";
  for (const row of [previous, current]) { row.sequence = { order: "listed", structure: "straight" }; row.exercises[0].sets[0].rir = 2; }
  current.exercises[0].sets[0].loadKg = 20; current.exercises[0].feedback.loadKg = 20;
  const context = Runtime.summarizeState(state([previous, current]), date, "최근 2일 바벨 로우 비교");
  for (const result of [context.trainingAnalysis, context.retrieval.periods[0].training]) {
    assert.equal(result.progression[0].current.trainingIntent, "deload");
    assert.equal(result.progression[0].status, "incomparable");
    assert.equal(result.progression[0].repeatedDecline, false);
    assert.match(result.progression[0].reason, /의도한 부담 조절/);
  }
  assert.equal(T.analyze([previous, current], { date }).recovery.status, "insufficient");
});

test("old question-relevant annotations survive recalled workout projection", () => {
  const old = annotate(record("old", "2026-09-01", 8), "return", "limit");
  const recent = Array.from({ length: 12 }, (_, index) => {
    const row = record(`recent:${index}`, I.shiftDate(date, -index));
    row.label = "최근 운동"; row.exercises[0].rawName = "바벨 벤치 프레스"; row.exercises[0].exerciseId = null;
    return row;
  });
  const context = Runtime.summarizeState(state([old, ...recent]), date, "로우 복귀 기록");
  assert.equal(context.recall.workouts.length, 1);
  assert.equal(context.recall.workouts[0].trainingIntent, "return");
  assert.deepEqual(context.recall.workouts[0].exercises[0].feedback, old.exercises[0].feedback);
});

test("budget trimming keeps saved annotations and their set snapshots while reducing only raw samples", () => {
  const records = Array.from({ length: 12 }, (_, index) => {
    const row = annotate(record(`large:${index}`, I.shiftDate(date, -index), 100), "time-limited", "hard");
    row.notes = "한".repeat(5000);
    row.exercises = Array.from({ length: 20 }, (_, block) => {
      const exercise = record(`large:${index}:${block}`, row.date, 100).exercises[0];
      exercise.equipmentKey = `confirmed-row:${block}`; exercise.notes = "한".repeat(1000);
      const set = exercise.sets.at(-1);
      exercise.feedback = { setId: set.id, feeling: "hard", loadKg: set.loadKg, reps: set.reps };
      return exercise;
    });
    return row;
  });
  const value = state(records), before = structuredClone(value);
  for (let index = 0; index < 21; index++) {
    const when = I.shiftDate(date, -index);
    value.days[when] = { date: when, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown",
      carbAdjustmentG: 0, complete: false, planSnapshot: null, sessions: [],
      meals: [{ id: `meal:${index}`, name: "합성 식사", protein: 30, carbs: 40, fat: 10, otherKcal: 0, alcoholG: 0 }] };
  }
  const saved = structuredClone(value);
  const context = Runtime.summarizeState(value, date, "최근 3개월 바벨 로우 비교");
  assert.equal(context.samplingReducedForBudget, true);
  assert.equal(context.trainingAnalysis.sessionsSampled, true);
  assert.equal(context.trainingAnalysis.originalSessionSummaryCount, 12);
  assert.ok(context.trainingAnalysis.sessions.length < 12);
  assert.match(context.trainingAnalysis.detailScope, /최근일부요약/);
  assert.equal(context.trainingAnalysis.progressionSampled, true);
  assert.ok(context.trainingAnalysis.progression.length < context.trainingAnalysis.originalProgressionSummaryCount);
  assert.match(context.trainingAnalysis.progressionDetailScope, /일부수행비교/);
  assert.equal(context.recentDaysSampled, true);
  assert.equal(context.originalRecentDayCount, 21);
  assert.ok(context.recentDays.length < 21);
  assert.match(context.contextScope, /맥락예산에맞춘일부표본/);
  const samples = [...context.recentWorkouts, ...context.recall.workouts,
    ...context.retrieval.periods.flatMap(period => [...period.details.workouts, ...period.relatedContext.records])];
  assert.ok(samples.length);
  for (const row of samples) {
    assert.equal(row.trainingIntent, "time-limited");
    const source = records.find(record => record.id === row.id);
    for (const exercise of row.exercises) {
      assert.deepEqual(exercise.feedback, source.exercises.find(block => block.id === exercise.id).feedback);
      assert.ok(exercise.sets.every(set => set.rir === null));
    }
  }
  const bytes = Buffer.byteLength(Runtime.promptFor({ kind: "chat", context }), "utf8");
  assert.ok(bytes <= 245 * 1024, `context exceeds its budget: ${bytes} bytes`);
  assert.equal(context.retrieval.periods[0].training.coverage.workingSets, 24000);
  assert.equal(context.retrieval.periods[0].nutrition.daysWithMeals, 21);
  assert.equal(context.retrieval.periods[0].nutrition.recordedIntakeTotals.protein, 630);
  assert.deepEqual(value, saved);
  assert.deepEqual(value.training, before.training);
});

test("absent annotations stay absent and observed null/zero snapshots are not coerced", () => {
  const legacy = record("legacy"), unknown = record("unknown", "2026-10-05");
  const set = unknown.exercises[0].sets[0]; set.loadKg = null; set.reps = 0; annotate(unknown, "light", "limit");
  const context = Runtime.summarizeState(state([legacy, unknown]), date, "최근 2일 바벨 로우 기록");
  const noAnnotation = context.recentWorkouts.find(row => row.id === legacy.id);
  assert.equal(Object.hasOwn(noAnnotation, "trainingIntent"), false);
  assert.equal(Object.hasOwn(noAnnotation.exercises[0], "feedback"), false);
  const feedback = context.recentWorkouts.find(row => row.id === unknown.id).exercises[0].feedback;
  assert.equal(feedback.loadKg, null); assert.equal(feedback.reps, 0);
  assert.equal(Object.hasOwn(feedback, "rir"), false);
});

test("image response schema remains observation-only and rejects user annotation fields", () => {
  const image = { kind: "workout", answer: "원문 확인", questions: [], uncertainties: [], meal: null, body: null, coaching: null,
    workouts: [{ date, time: null, label: "운동", durationMinutes: null, reportedSetCount: null,
      reportedEnergyKcal: null, reportedVolumeKg: null, uncertainties: [],
      exercises: [{ rawName: "바벨 로우", reportedVolumeKg: null, loadConvention: "as-recorded", durationMinutes: null,
        repsTotal: null, sets: [{ loadKg: 30, reps: 10, marker: null }] }] }] };
  assert.doesNotThrow(() => Runtime.validateResult(image, "workout"));
  const intent = structuredClone(image); intent.workouts[0].trainingIntent = "deload";
  assert.throws(() => Runtime.validateResult(intent, "workout"), /구조/);
  const feedback = structuredClone(image); feedback.workouts[0].exercises[0].feedback = { setId: "invented", feeling: "comfortable", loadKg: 30, reps: 10 };
  assert.throws(() => Runtime.validateResult(feedback, "workout"), /구조/);
  const rir = structuredClone(image); rir.workouts[0].exercises[0].sets[0].rir = 2;
  assert.throws(() => Runtime.validateResult(rir, "workout"), /구조/);
  assert.equal(Object.hasOwn(Runtime.schema.properties.workouts.items.properties, "trainingIntent"), false);
  assert.equal(Object.hasOwn(Runtime.schema.properties.workouts.items.properties.exercises.items.properties, "feedback"), false);
});
