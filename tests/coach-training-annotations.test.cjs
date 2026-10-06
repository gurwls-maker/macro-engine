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
const Coach = require("../src/coach.js");

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
function performed(row, vector) {
  row.exercises[0].sets = vector.map(([loadKg, reps], index) => ({ id: `${row.id}:s:${index}`, loadKg, reps, marker: null, rir: null }));
  return row;
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
  assert.match(context.trainingAnalysis.progressionDetailScope, /일부 수행 비교/);
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
  const answer = structuredClone(image); answer.workouts[0].exercises[0].coachingAnswer = { topic: "rep-target", answer: "planned", sets: [] };
  assert.throws(() => Runtime.validateResult(answer, "workout"), /구조/);
  assert.equal(Object.hasOwn(Runtime.schema.properties.workouts.items.properties, "trainingIntent"), false);
  assert.equal(Object.hasOwn(Runtime.schema.properties.workouts.items.properties.exercises.items.properties, "feedback"), false);
  assert.equal(Object.hasOwn(Runtime.schema.properties.workouts.items.properties.exercises.items.properties, "coachingAnswer"), false);
});

test("AI capacity context separates actual sets from formula estimates with correct dates and units", () => {
  const old = record("prior", "2026-09-18"), current = record("latest");
  old.exercises[0].sets[0].loadKg = 100;
  current.exercises[0].sets[0].loadKg = 120; current.exercises[0].sets[0].reps = 3;
  const input = state([old, current]), before = structuredClone(input);
  const context = Runtime.summarizeState(input, date, "오늘 바벨 로우 다음 운동");
  const capacity = context.trainingCapacity[0];
  assert.equal(capacity.exerciseId, "barbell_row"); assert.equal(capacity.equipmentKey, "confirmed-row");
  assert.equal(capacity.loadConvention, "total"); assert.equal(capacity.loadRole, "external");
  assert.equal(capacity.current.source.loadKg, 120);
  assert.equal(capacity.previous.source.date, "2026-09-18");
  assert.deepEqual(capacity.expectedReps, { estimated: true, repsMin: 3, repsMax: 5, basis: "formula-inversion" });
  const facts = context.facts.filter(fact => fact.id.startsWith("packet.trainingCapacity."));
  const source = facts.find(fact => fact.id.endsWith("current.source.loadKg"));
  assert.equal(source.value, 120); assert.equal(source.estimated, false); assert.equal(source.date, date);
  const estimate = facts.find(fact => fact.id.endsWith("previous.estimate.minKg"));
  assert.equal(estimate.estimated, true); assert.equal(estimate.source, "record-performance-estimate");
  assert.equal(estimate.date, "2026-09-18"); assert.equal(estimate.unit, "kg");
  for (const fact of facts.filter(fact => /expectedReps.reps(Min|Max)$/.test(fact.id))) {
    assert.equal(fact.estimated, true); assert.equal(fact.unit, "회");
  }
  assert.equal(Object.hasOwn(context.trainingAnalysis, "capacityHistory"), false, "all-history raw index stays local rather than bloating each AI request");
  assert.match(Runtime.promptFor({ kind: "chat", context }), /전체 세트 구성.*무거운 뒤 세트/s);
  assert.deepEqual(input, before);
});

test("AI whole-work context keeps the new heavy segment and lower-load work separate from RM estimates", () => {
  const prior = performed(record("whole-prior", "2026-09-30"), [[95, 10], [95, 10], [95, 8]]);
  const latest = performed(record("whole-latest"), [[115, 3], [95, 7], [95, 5]]);
  const input = state([prior, latest]), before = structuredClone(input);
  const context = Runtime.summarizeState(input, date, "오늘 로우 다음 운동을 어떻게 할까");
  const exercise = context.trainingCoaching.exerciseContexts[0];
  assert.equal(exercise.blockId, latest.exercises[0].id);
  assert.equal(exercise.actual.current.source.sessionId, latest.id);
  assert.equal(exercise.actual.previous.source.sessionId, prior.id);
  assert.equal(exercise.actual.previous.date, prior.date);
  assert.deepEqual(exercise.actual.current.sets.map(set => [set.loadKg, set.reps]), [[115, 3], [95, 7], [95, 5]]);
  assert.deepEqual(exercise.actual.previous.sets.map(set => [set.loadKg, set.reps]), [[95, 10], [95, 10], [95, 8]]);
  assert.equal(exercise.hypotheses.basis, "product-interpretation");
  const newHeavy = exercise.hypotheses.signals.find(signal => signal.kind === "new-heavy-exposure");
  assert.ok(newHeavy);
  assert.deepEqual(new Set(newHeavy.sourceRefs.map(source => source.sessionId)), new Set([latest.id, prior.id]));
  assert.ok(newHeavy.sourceRefs.every(source => source.setIds.length === 3));
  assert.equal(exercise.advice.basis, "product-choice");
  assert.equal(exercise.advice.primaryAction.kind, "consolidate-heavy");
  assert.deepEqual(exercise.advice.primaryAction.focusSetIds, [latest.exercises[0].sets[0].id]);
  assert.deepEqual(exercise.advice.primaryAction.preservedSetIds, latest.exercises[0].sets.slice(1).map(set => set.id));
  assert.ok(exercise.advice.supportingActions.some(action => action.kind === "restore-tail" && action.focusSetIds.includes(latest.exercises[0].sets[2].id)));
  const observed = context.facts.find(fact => fact.id === "packet.trainingCoaching.exerciseContexts.0.actual.previous.sets.0.loadKg");
  assert.equal(observed.value, 95); assert.equal(observed.date, prior.date);
  assert.equal(observed.estimated, false); assert.equal(observed.source, "training-coaching-observation");
  assert.ok(!context.facts.some(fact => /trainingCoaching.*(?:hypotheses|advice)/.test(fact.id)), "product interpretation and proposed changes never become performed facts");
  assert.ok(context.facts.some(fact => fact.id.startsWith("packet.trainingCapacity.") && fact.estimated), "model estimates retain their own namespace");
  assert.equal(Object.hasOwn(context.trainingAnalysis, "capacityHistory"), false);
  assert.deepEqual(input, before);
});

test("AI user answers retain the exact performed snapshot and change the interpretation without manufacturing RIR", () => {
  const previous = performed(record("answer-prior", "2026-09-30"), [[45, 12], [45, 12], [45, 12], [65, 8]]);
  const latest = performed(record("answer-latest"), [[45, 12], [45, 12], [45, 12], [65, 5]]);
  const original = state([previous, latest]);
  const answers = {};
  for (const answer of ["planned", "unexpected"]) {
    const input = structuredClone(original), exercise = input.training.records[1].exercises[0];
    exercise.coachingAnswer = TS.createCoachingAnswer(exercise, "rep-target", answer);
    const before = structuredClone(input), context = Runtime.summarizeState(input, date, "오늘 로우 뒤 세트 조언");
    const detailed = context.trainingCoaching.exerciseContexts[0];
    assert.equal(detailed.actual.coachingAnswer.topic, "rep-target");
    assert.equal(detailed.actual.coachingAnswer.answer, answer);
    assert.deepEqual(detailed.actual.coachingAnswer.sets, exercise.coachingAnswer.sets);
    assert.deepEqual(detailed.advice.userAnswer, { topic: "rep-target", answer, setIds: exercise.sets.map(set => set.id) });
    assert.deepEqual(context.recentWorkouts[0].exercises[0].coachingAnswer.sets, exercise.coachingAnswer.sets);
    assert.ok(detailed.actual.current.sets.every(set => set.rir === null));
    assert.equal(Object.hasOwn(context.recentWorkouts[0], "trainingIntent"), false);
    answers[answer] = detailed.advice.primaryAction.kind;
    assert.deepEqual(input, before);
  }
  assert.equal(answers.planned, "maintain-intended-work");
  assert.equal(answers.unexpected, "recheck-unexpected-work");
  assert.notEqual(answers.planned, answers.unexpected);
  assert.match(Runtime.promptFor({ kind: "chat", context: Runtime.summarizeState(original, date) }), /topic은 load-change.*rep-target.*answer는 planned.*unexpected/s);
});

test("a comfortable top set keeps the separate tail action and its actual target IDs in AI context", () => {
  const prior = performed(record("feel-prior", "2026-09-30"), [[105, 4], [85, 9], [85, 8]]);
  const latest = performed(record("feel-latest"), [[105, 4], [85, 7], [85, 5]]);
  const top = latest.exercises[0].sets[0];
  latest.exercises[0].feedback = { setId: top.id, feeling: "comfortable", loadKg: top.loadKg, reps: top.reps };
  const input = state([prior, latest]), before = structuredClone(input);
  const exercise = Runtime.summarizeState(input, date, "오늘 로우 여유 있던 탑세트와 뒤 세트를 함께 봐줘").trainingCoaching.exerciseContexts[0];
  assert.equal(exercise.advice.primaryAction.kind, "reps-option");
  assert.deepEqual(exercise.advice.primaryAction.focusSetIds, [top.id]);
  const tail = exercise.advice.supportingActions.find(action => action.kind === "restore-tail");
  assert.ok(tail); assert.ok(tail.focusSetIds.includes(latest.exercises[0].sets[2].id));
  assert.ok(!tail.focusSetIds.includes(top.id));
  assert.equal(exercise.actual.feedback.feeling, "comfortable");
  assert.ok(exercise.actual.current.sets.every(set => set.rir === null));
  assert.deepEqual(input, before);
});

test("AI keeps every current movement, set and annotation snapshot when lossless encoding fits the budget", () => {
  const latest = record("many-blocks", date, 18);
  latest.exercises = Array.from({ length: 20 }, (_, index) => {
    const exercise = record(`many-blocks:${index}`, date, 18).exercises[0];
    exercise.equipmentKey = `confirmed-row:${index}`;
    exercise.coachingAnswer = TS.createCoachingAnswer(exercise, "rep-target", "planned");
    return exercise;
  });
  const input = state([latest]), before = structuredClone(input), context = Runtime.summarizeState(input, date, "오늘 전체 운동");
  assert.equal(context.trainingCoaching.coverage.originalContextCount, 20);
  assert.deepEqual(new Set(context.trainingCoaching.coverage.coveredBlockIds), new Set(latest.exercises.map(exercise => exercise.id)));
  assert.equal(context.trainingCoaching.exerciseContexts.length, 20);
  assert.equal(context.trainingCoaching.contextsSampled, false);
  for (const exercise of context.trainingCoaching.exerciseContexts) {
    assert.equal(exercise.actual.current.originalSetCount, 18);
    assert.equal(exercise.actual.current.sampled, false);
    assert.equal(exercise.actual.current.sets.length, 18);
    const original = latest.exercises.find(row => row.id === exercise.blockId);
    assert.deepEqual(exercise.actual.current.sets.map(set => [set.id, set.loadKg, set.reps]), original.sets.map(set => [set.id, set.loadKg, set.reps]));
    assert.equal(exercise.actual.coachingAnswer.originalSetCount, 18);
    assert.equal(exercise.actual.coachingAnswer.sampled, false);
    assert.equal(exercise.actual.coachingAnswer.answer, "planned");
    assert.equal(exercise.actual.coachingAnswer.sets.length, 18);
    assert.deepEqual(exercise.actual.coachingAnswer.sets.map(set => [set.id, set.loadKg, set.reps]), original.sets.map(set => [set.id, set.loadKg, set.reps]));
  }
  assert.deepEqual(input, before);
});

test("AI keeps explicitly reclassified warmup source sets instead of treating them as removed work", () => {
  const previous = performed(record("warm-prior", "2026-09-30"), [[35, 10], [55, 8], [75, 6], [75, 6]]);
  const latest = performed(record("warm-latest"), [[35, 10], [55, 8], [75, 6], [75, 6], [75, 8], [75, 8]]);
  latest.exercises[0].sets[0].marker = "W"; latest.exercises[0].sets[1].marker = "W";
  const input = state([previous, latest]), before = structuredClone(input);
  const context = Runtime.summarizeState(input, date, "오늘 로우 앞 세트는 준비 세트로 표시했어");
  const exercise = context.trainingCoaching.exerciseContexts[0];
  assert.deepEqual(exercise.actual.current.sets.map(set => [set.loadKg, set.reps]), [[75, 6], [75, 6], [75, 8], [75, 8]]);
  assert.deepEqual(exercise.actual.current.warmupSets.map(set => [set.id, set.loadKg, set.reps, set.marker]), latest.exercises[0].sets.slice(0, 2).map(set => [set.id, set.loadKg, set.reps, set.marker]));
  assert.equal(exercise.actual.current.originalWarmupSetCount, 2);
  assert.ok(exercise.hypotheses.signals.some(signal => signal.kind === "work-reclassified-as-warmup"));
  const observed = context.facts.find(fact => fact.id === "packet.trainingCoaching.exerciseContexts.0.actual.current.warmupSets.0.loadKg");
  assert.equal(observed.value, 35); assert.equal(observed.estimated, false); assert.equal(observed.date, date);
  assert.deepEqual(input, before);
});

test("AI separates a postponed progression alternative from the selected whole-session adjustment", () => {
  const previous = performed(record("coord-prior", "2026-09-30"), [[95, 10], [95, 10], [95, 8]]);
  const latest = performed(record("coord-latest"), [[115, 3], [95, 7], [95, 5]]);
  for (const row of [previous, latest]) {
    row.exercises[0].rawName = "바벨 벤치 프레스"; row.exercises[0].exerciseId = "bench_press"; row.exercises[0].equipmentKey = "confirmed-bench";
  }
  const row = record("coord-chest").exercises[0], set = row.sets[0];
  row.rawName = "덤벨 벤치 프레스"; row.exerciseId = "dumbbell_bench_press"; row.equipmentKey = "confirmed-db-bench"; row.loadConvention = "per-side";
  latest.exercises.push(row);
  const input = state([previous, latest]), before = structuredClone(input);
  const context = Runtime.summarizeState(input, date, "오늘 전체 운동에서 먼저 뭘 해야 할까");
  assert.equal(context.trainingCoaching.coordination.basis, "product-choice");
  assert.equal(context.trainingCoaching.coordination.selectedAdjustmentBlockId, latest.exercises[0].id);
  const movement = context.trainingCoaching.exerciseContexts.find(exercise => exercise.blockId === row.id);
  assert.equal(movement.advice.primaryAction.kind, "maintain-coordinated-work");
  assert.equal(movement.advice.progressionCandidate.kind, "repeat");
  assert.deepEqual(movement.advice.progressionCandidate.focusSetIds, [set.id]);
  assert.equal(movement.actual.current.sets[0].reps, 10);
  assert.ok(!context.facts.some(fact => fact.id.includes("progressionCandidate")));
  assert.match(Runtime.promptFor({ kind: "chat", context }), /progressionCandidate는 이번에 모두 실행할 지시가 아닌 미룬 대안/);
  assert.match(Runtime.promptFor({ kind: "chat", context }), /selectedProgressionBlockId는 요약에서 강조할 초점이지 미선택 운동의 진행을 금지하는 규칙이 아닙니다/);
  assert.deepEqual(input, before);
});

test("fixed native one-set repetition proposals are citeable future choices, never observed performance", () => {
  const records = ["2026-10-01", "2026-10-03", date].map((when, index) => performed(record(`proposal:${index}`, when), [[30, 10], [30, 10], [30, 10]]));
  const input = state(records), before = structuredClone(input), context = Runtime.summarizeState(input, date, "같은 기록에서 다음 변화를 줄까");
  assert.equal(context.trainingProposals.length, 1);
  const proposal = context.trainingProposals[0], facts = context.facts.filter(fact => fact.id.startsWith("packet.trainingProposals."));
  assert.equal(proposal.scope, "current-option"); assert.equal(proposal.basis, "product-choice"); assert.equal(proposal.estimated, true);
  assert.equal(proposal.baseReps, 10); assert.equal(proposal.targetReps, 11); assert.equal(proposal.incrementReps, 1); assert.equal(proposal.changedSetCount, 1);
  assert.equal(proposal.setId, records.at(-1).exercises[0].sets[0].id);
  const target = facts.find(fact => fact.id.endsWith("targetReps"));
  assert.equal(target.value, 11); assert.equal(target.unit, "회"); assert.equal(target.source, "product-choice"); assert.equal(target.estimated, true);
  assert.ok(context.facts.filter(fact => fact.id.includes(".actual.")).every(fact => fact.value !== 11));
  const observed = context.facts.find(fact => fact.id.endsWith("actual.current.sets.0.reps"));
  assert.equal(observed.value, 10); assert.equal(observed.estimated, false);
  const output = { kind: "chat", answer: "다음에는 30kg에서 1세트만 1회 추가해 11회를 시도하고 나머지는 그대로 이어가세요.",
    questions: [], uncertainties: [], workouts: [], meal: null, body: null,
    coaching: { claims: facts.filter(fact => /(?:loadKg|targetReps|incrementReps|changedSetCount)$/.test(fact.id)).map(fact => ({ factId: fact.id, value: fact.value })), followUp: null } };
  assert.doesNotThrow(() => Runtime.validateResult(output, "chat", context));
  const listedDates = structuredClone(output); listedDates.answer = `10월 1일·3일·6일의 기록이 같으므로 ${output.answer}`;
  assert.doesNotThrow(() => Runtime.validateResult(listedDates, "chat", context));
  const explicitDates = structuredClone(listedDates); explicitDates.answer = listedDates.answer.replace("10월 1일·3일·6일", "2026년 10월 1일, 3일, 6일");
  assert.doesNotThrow(() => Runtime.validateResult(explicitDates, "chat", context));
  const inventedDate = structuredClone(listedDates); inventedDate.answer = listedDates.answer.replace("3일", "4일");
  assert.throws(() => Runtime.validateResult(inventedDate, "chat", context), /날짜/);
  const otherMonthProof = structuredClone(context); otherMonthProof.otherSnapshot = { date: "2026-11-04" };
  assert.throws(() => Runtime.validateResult(inventedDate, "chat", otherMonthProof), /날짜/);
  const inventedFuture = structuredClone(listedDates); inventedFuture.answer = listedDates.answer.replace("6일", "7일");
  assert.throws(() => Runtime.validateResult(inventedFuture, "chat", context), /날짜/);
  const otherMonth = structuredClone(listedDates); otherMonth.answer = listedDates.answer.replace("10월", "11월");
  assert.throws(() => Runtime.validateResult(otherMonth, "chat", context), /날짜/);
  const wrongYear = structuredClone(explicitDates); wrongYear.answer = explicitDates.answer.replace("2026년", "2025년");
  assert.throws(() => Runtime.validateResult(wrongYear, "chat", context), /날짜/);
  const inventedDuration = structuredClone(listedDates); inventedDuration.answer += " 6일 동안 계속하세요.";
  assert.throws(() => Runtime.validateResult(inventedDuration, "chat", context), /수치|출처|숫자/);
  const restDuration = structuredClone(listedDates); restDuration.answer += " 3일 쉬세요.";
  assert.throws(() => Runtime.validateResult(restDuration, "chat", context), /수치|출처|숫자/);
  const arbitrary = structuredClone(output); arbitrary.answer = "다음에는 32kg에서 12회를 시도하세요.";
  assert.throws(() => Runtime.validateResult(arbitrary, "chat", context), /수치|출처|숫자/);
  const fabricatedActual = structuredClone(output); fabricatedActual.coaching.claims = [{ factId: observed.id, value: 11 }];
  assert.throws(() => Runtime.validateResult(fabricatedActual, "chat", context), /수치|출처|숫자/);
  assert.match(Runtime.promptFor({ kind: "chat", context }), /targetReps는 아직 하지 않은 다음 목표.*product-choice.*실제 수행이 아닙니다/s);
  assert.deepEqual(input, before);
});

test("independent stable movements keep their local future choices rather than one global progression permission", () => {
  const records = ["2026-10-01", "2026-10-03", date].map((when, index) => {
    const row = performed(record(`independent:${index}`, when), [[30, 10], [30, 10], [30, 10]]);
    const bench = performed(record(`independent-bench:${index}`, when), [[55, 10], [55, 10], [55, 10]]).exercises[0];
    bench.rawName = "바벨 벤치 프레스"; bench.exerciseId = "bench_press"; bench.equipmentKey = "confirmed-bench";
    row.exercises.push(bench); return row;
  });
  const input = state(records), before = structuredClone(input), context = Runtime.summarizeState(input, date, "전체 운동 다음 변화를 줄까");
  assert.equal(context.trainingCoaching.coordination.mode, "local-progression-options");
  assert.ok(context.trainingCoaching.coordination.selectedProgressionBlockId);
  assert.deepEqual(context.trainingCoaching.coordination.alternativeProgressionBlockIds, []);
  assert.equal(context.trainingProposals.length, 2);
  assert.ok(context.trainingProposals.every(proposal => proposal.scope === "current-option" && proposal.targetReps === 11 && proposal.estimated));
  for (const exercise of context.trainingCoaching.exerciseContexts) {
    assert.equal(exercise.advice.primaryAction.kind, "progression-option");
    assert.equal(exercise.advice.progressionCandidate, null);
    const proposal = context.trainingProposals.find(value => value.blockId === exercise.blockId);
    assert.ok(exercise.actual.current.sets.some(set => set.id === proposal.setId && set.loadKg === proposal.loadKg && set.reps === proposal.baseReps));
  }
  assert.ok(context.facts.filter(fact => fact.id.includes(".actual.")).every(fact => fact.value !== 11));
  assert.deepEqual(input, before);
});

test("proposal registration requires an exact current ordinary set, focused identity and fixed plus-one boundary", () => {
  const source = { id: "proof-set", loadKg: 30, reps: 10, marker: null }, proposal = { kind: "single-set-reps", setId: source.id, loadKg: 30, baseReps: 10, targetReps: 11 };
  const original = structuredClone({ source, proposal });
  assert.deepEqual(Coach.projectSingleSetProposal(proposal, [source], [source.id]), proposal);
  const invalid = [{ ...proposal, targetReps: 12 }, { ...proposal, loadKg: 32 }, { ...proposal, baseReps: 9 },
    { ...proposal, setId: "other-set" }, { ...proposal, kind: "arbitrary-load" }, { ...proposal, rir: 2 },
    { ...proposal, targetReps: 11.5 }, { ...proposal, baseReps: null }];
  for (const value of invalid) assert.equal(Coach.projectSingleSetProposal(value, [source], [source.id]), null);
  assert.equal(Coach.projectSingleSetProposal(proposal, [{ ...source, marker: "W" }], [source.id]), null);
  assert.equal(Coach.projectSingleSetProposal(proposal, [source], [source.id, "other-set"]), null);
  assert.equal(Coach.projectSingleSetProposal(proposal, [source], ["other-set"]), null);
  assert.equal(Coach.projectSingleSetProposal({ ...proposal, baseReps: 100000, targetReps: 100001 }, [{ ...source, reps: 100000 }], [source.id]), null);
  assert.deepEqual({ source, proposal }, original);
});

test("postponed native proposals keep alternative scope and disappear if their current proof is sampled away", () => {
  const records = ["2026-10-01", "2026-10-03", date].map((when, index) => {
    const value = performed(record(`parallel:${index}`, when), index === 2 ? [[115, 3], [95, 7], [95, 5]] : [[95, 10], [95, 10], [95, 8]]);
    value.exercises[0].rawName = "바벨 벤치 프레스"; value.exercises[0].exerciseId = "bench_press"; value.exercises[0].equipmentKey = "confirmed-bench";
    const bench = performed(record(`parallel-db-bench:${index}`, when), [[30, 10], [30, 10], [30, 10]]).exercises[0];
    bench.rawName = "덤벨 벤치 프레스"; bench.exerciseId = "dumbbell_bench_press"; bench.equipmentKey = "confirmed-db-bench"; bench.loadConvention = "per-side";
    value.exercises.push(bench); return value;
  });
  const input = state(records), before = structuredClone(input), context = Runtime.summarizeState(input, date, "전체 운동 다음 변화를 줄까");
  assert.equal(context.trainingProposals.filter(value => value.scope === "current-option").length, 0);
  assert.equal(context.trainingProposals.filter(value => value.scope === "deferred-option").length, 1);
  const deferred = context.trainingProposals.find(value => value.scope === "deferred-option");
  const movement = context.trainingCoaching.exerciseContexts.find(value => value.blockId === deferred.blockId);
  assert.equal(movement.advice.primaryAction.kind, "maintain-coordinated-work");
  assert.equal(Object.hasOwn(movement.advice.primaryAction, "proposal"), false);
  assert.equal(movement.advice.progressionCandidate.proposal.targetReps, 11);
  const reduced = structuredClone(context.trainingCoaching);
  for (const exercise of reduced.exerciseContexts) {
    exercise.actual.current.sets = [];
    exercise.actual.current.source.setIds = [];
  }
  assert.deepEqual(Runtime.projectTrainingProposals(reduced), []);
  const wrongDate = structuredClone(context.trainingCoaching); wrongDate.date = "2026-10-05";
  assert.deepEqual(Runtime.projectTrainingProposals(wrongDate), []);
  const unsupported = structuredClone(context.trainingCoaching);
  for (const exercise of unsupported.exerciseContexts) {
    for (const action of [exercise.advice.primaryAction, exercise.advice.progressionCandidate].filter(Boolean)) action.kind = "individual-care";
  }
  assert.deepEqual(Runtime.projectTrainingProposals(unsupported), []);
  assert.deepEqual(input, before);
});
