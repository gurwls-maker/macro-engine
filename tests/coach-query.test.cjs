"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../src/coach-query.js");
const T = require("../src/training.js");
const TS = require("../src/training-store.js");
const S = require("../src/storage.js");
const I = require("../src/insights.js");
const { summarizeState, promptFor, validateResult } = require("../tools/coach-runtime.cjs");

function state() { return { ...S.createEmpty(), updatedAt: "2026-10-06T00:00:00.000Z", training: TS.createEmpty() }; }
function day(date, extra = {}) {
  return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0,
    meals: [], sessions: [], complete: false, planSnapshot: null, ...extra };
}
function record(date, id = date, name = "바벨 로우", count = 1) {
  return { id, date, time: null, label: "합성 기록", durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, notes: "", pain: null, effort: null,
    exercises: [{ id: `${id}-exercise`, rawName: name, exerciseId: null, equipmentKey: "confirmed-row-1", loadConvention: "total", durationMinutes: null,
      repsTotal: null, reportedVolumeKg: null, notes: "", sets: Array.from({ length: count }, (_, index) => ({ id: `${id}-set-${index}`, loadKg: 30, reps: 10, marker: null, rir: null })) }] };
}
function answer(text, claims = []) {
  return { kind: "chat", answer: text, questions: [], uncertainties: [], workouts: [], meal: null, body: null, coaching: { claims, followUp: null } };
}

test("explicit periods, calendar dates, relative periods and comparisons are dated deterministically", () => {
  const cases = [
    ["2026-07-01부터 2026-09-30까지 등 기록", [["2026-07-01", "2026-09-30"]]],
    ["2026년 7월 1일~2026년 9월 30일", [["2026-07-01", "2026-09-30"]]],
    ["7월부터 9월까지 등 기록", [["2026-07-01", "2026-09-30"]]],
    ["지난 3개월 등 기록", [["2026-07-07", "2026-10-06"]]],
    ["최근 14일 기록", [["2026-09-23", "2026-10-06"]]],
    ["3개월간 기록", [["2026-07-07", "2026-10-06"]]],
    ["이번주", [["2026-10-05", "2026-10-06"]]],
    ["지난주", [["2026-09-28", "2026-10-04"]]],
    ["지난달 이번달 비교", [["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-06"]]],
    ["최근 2주와 그 전 2주 비교", [["2026-09-23", "2026-10-06"], ["2026-09-09", "2026-09-22"]]],
    ["2026-08-01과 2026-10-06 비교", [["2026-08-01", "2026-08-01"], ["2026-10-06", "2026-10-06"]]],
    ["2026-07-01~2026-07-31과 2026-09-01~2026-09-30 비교", [["2026-07-01", "2026-07-31"], ["2026-09-01", "2026-09-30"]]],
    ["3개월 전 기록", [["2026-07-06", "2026-07-06"]]],
    ["올해 기록", [["2026-01-01", "2026-10-06"]]]
  ];
  for (const [question, expected] of cases) assert.deepEqual(Q.plan(state(), "2026-10-06", question).periods.map(row => [row.from, row.to]), expected, question);
  const leap = Q.plan(state(), "2024-03-31", "최근 1개월 기록");
  assert.equal(leap.periods[0].from, "2024-03-01");
  assert.ok(Q.plan(state(), "2026-10-06", "2026-02-30 기록").needsClarification);
  assert.ok(Q.plan(state(), "2026-10-06", "지난 9999일 기록").needsClarification);
});

test("decimal quantities cannot silently become calendar dates or override the requested three-month range", () => {
  for (const quantity of ["9.10kg", "7.5 kg", "9.10%", "9.10g", "9.10 kcal", "9.10회", "9.10시간", "99.10kg", "9.100kg", "9.10인분", "1/2컵"]) {
    const result = Q.plan(state(), "2026-10-06", `지난 3개월 등 기록. ${quantity}로 했어`);
    assert.equal(result.periods[0].from, "2026-07-07", quantity); assert.equal(result.periods[0].to, "2026-10-06", quantity);
    assert.equal(result.needsClarification, false, quantity);
  }
  assert.deepEqual(Q.plan(state(), "2026-10-06", "9.10 기록").periods.map(row => [row.from, row.to]), [["2026-09-10", "2026-09-10"]]);
});

test("fresh numeric sleep reports remain raw self-report and the existing quantity guard can withhold direct quotation", () => {
  const value = state(); value.days["2026-10-06"] = day("2026-10-06", { coachCheckin: { sleep: "good", hunger: "low", energy: "good" } });
  const context = summarizeState(value, "2026-10-06", "어젯밤 3시간 잤어. 어떻게 하면 좋을까?");
  assert.match(context.retrieval.currentReport.text, /3시간 잤어/);
  assert.equal(context.retrieval.currentReport.savedCheckin.sleep, "good");
  assert.match(context.factValidationScope, /숫자의 직접 인용도 보류/);
  assert.throws(() => validateResult(answer("3시간 잤다는 새 진술을 확인했습니다."), "chat", context), /기록 근거 없이 새 수치/);
  assert.doesNotThrow(() => validateResult(answer("짧게 잤다는 이번 말씀과 저장된 수면 선택은 구분해서 보겠습니다."), "chat", context));
});

test("natural date ranges include both endpoints and unresolved mixed-period comparisons request clarification", () => {
  const result = Q.plan(state(), "2026-10-06", "어제부터 오늘까지 등 운동 기록");
  assert.equal(result.periods[0].from, "2026-10-05"); assert.equal(result.periods[0].to, "2026-10-06");
  const month = Q.plan(state(), "2026-10-06", "지난달부터 오늘까지 등 기록");
  assert.equal(month.periods[0].from, "2026-09-01"); assert.equal(month.periods[0].to, "2026-10-06");
  for (const question of ["이전 3개월과 최근 3개월 비교", "최근 3개월 기록과 어제 비교", "9월부터 오늘까지 등 기록"]) {
    const partial = Q.plan(state(), "2026-10-06", question);
    assert.equal(partial.needsClarification, true, question); assert.ok(partial.ambiguities.length, question);
    assert.equal(partial.periods.some(row => row.basis === "split-period"), false, question);
  }
});

test("exercise and muscle selectors narrow each other, and unhandled exclusions are not presented as resolved", () => {
  const value = state(); value.training.records = [record("2026-09-01", "row", "바벨 로우", 2), record("2026-09-02", "pull", "랫 풀 다운", 3), record("2026-09-03", "chest", "바벨 벤치 프레스", 4)];
  const result = Q.retrieve(value, "2026-10-06", "최근 3개월 등 운동 중 바벨 로우만 기록");
  assert.equal(result.periods[0].source.matchedWorkoutCount, 1); assert.equal(result.periods[0].training.coverage.workingSets, 2);
  assert.deepEqual(result.periods[0].details.workouts.map(row => row.id), ["row"]);
  const exclusion = Q.retrieve(value, "2026-10-06", "지난 3개월 등 말고 가슴 운동만");
  assert.equal(exclusion.needsClarification, true); assert.match(exclusion.ambiguities.join(" "), /제외 조건/);
});

test("three-month muscle lookup uses all matching saved records, not just the current 28-day context", () => {
  const value = state();
  value.training.records = [record("2026-07-06", "before", "바벨 로우", 9), record("2026-07-08", "old", "바벨 로우", 2),
    record("2026-08-01", "middle", "바벨 로우", 3), record("2026-09-20", "recent", "바벨 로우", 4),
    record("2026-10-05", "chest", "바벨 벤치 프레스", 5), record("2026-10-07", "future", "바벨 로우", 9)];
  const context = summarizeState(value, "2026-10-06", "지난 3개월 등 비교해줘"), lookup = context.retrieval;
  assert.deepEqual(lookup.muscleIds, ["back"]);
  assert.equal(lookup.periods[0].from, "2026-07-07");
  assert.equal(lookup.periods[0].to, "2026-10-06");
  assert.equal(lookup.periods[0].training.coverage.recordCount, 3);
  assert.equal(lookup.periods[0].training.coverage.workingSets, 9);
  assert.equal(lookup.periods[0].training.muscles.find(row => row.id === "back").directSets, 9);
  assert.equal(lookup.periods[0].source.rangedWorkoutCount, 4);
  assert.equal(context.trainingAnalysis.coverage.recordCount, 2, "generic background analysis remains the ordinary 28-day app calculation");
  assert.equal(lookup.periods[1].training.coverage.workingSets + lookup.periods[2].training.coverage.workingSets, 9);
  assert.equal(lookup.periods[0].training.coverage.unknownDays, 89);
  assert.equal(lookup.periods[0].available.training.from, "2026-07-08");
  assert.match(lookup.periods[0].training.progressionScope, /조각 사이/);
});

test("each selected chunk equals the existing app engine, preserving marker and missing effort semantics", () => {
  const value = state(); value.training.records = [record("2026-08-01", "first", "바벨 로우", 3), record("2026-10-01", "last", "바벨 로우", 2)];
  const first = value.training.records[0].exercises[0]; first.sets[0].marker = "W"; first.sets[1].marker = "D"; first.sets[2].reps = null;
  const lookup = Q.retrieve(value, "2026-10-06", "최근 3개월 등 기록"), aggregate = lookup.periods[0].training;
  const analyses = value.training.records.map(row => T.analyze([row], { date: row.date, mappings: [] }));
  for (const key of ["workingSets", "markedSets", "warmupSets", "unknownEffortSets", "invalidSets"]) assert.equal(aggregate.coverage[key], analyses.reduce((sum, row) => sum + row.coverage[key], 0), key);
  assert.equal(lookup.periods[0].details.workouts[0].exercises[0].sets[2].reps, null);
  assert.equal(lookup.periods[0].details.workouts[0].exercises[0].sets[0].rir, null);
});

test("named exercise lookup retains variant and equipment rather than matching all presses", () => {
  const value = state(); value.training.records = [record("2026-09-01", "bar", "바벨 벤치 프레스"), record("2026-09-02", "dumbbell", "덤벨 벤치 프레스"), record("2026-09-03", "shoulder", "덤벨 숄더 프레스")];
  const result = Q.retrieve(value, "2026-10-06", "최근 3개월 덤벨 벤치 프레스 기록");
  assert.deepEqual(result.exerciseIds, ["dumbbell_bench_press"]);
  assert.deepEqual(new Set(Q.plan(value, "2026-10-06", "덤벨 벤치 프레스와 벤치 프레스 비교").exerciseIds), new Set(["bench_press", "dumbbell_bench_press"]));
  assert.equal(result.periods[0].source.matchedWorkoutCount, 1);
  assert.equal(result.periods[0].details.workouts[0].id, "dumbbell");
  assert.equal(result.periods[0].details.workouts[0].exercises[0].loadConvention, "total", "confirmed explicit convention still wins over a name rule");
  assert.deepEqual(Q.plan(value, "2026-10-06", "운동 등등 뭐가 바뀌었지?").muscleIds, []);
});

test("missing food days and unfinished meals are not included as zero in completed intake averages", () => {
  const value = state(), meal = { name: "합성 식사", protein: 20, carbs: 40, fat: 10, otherKcal: 0, alcoholG: 0 };
  value.days["2026-10-04"] = day("2026-10-04", { meals: [meal], complete: true });
  value.days["2026-10-05"] = day("2026-10-05", { meals: [{ ...meal, protein: 10 }], complete: false });
  value.days["2026-10-06"] = day("2026-10-06");
  const result = Q.retrieve(value, "2026-10-06", "최근 3일 식사 기록").periods[0].nutrition;
  assert.equal(result.daysWithMeals, 2); assert.equal(result.completeMealDays, 1); assert.equal(result.partialMealDays, 1); assert.equal(result.daysWithoutMeals, 1);
  assert.equal(result.averageCompletedIntake.kcal, I.mealTotals([meal]).kcal);
  assert.equal(Q.retrieve(value, "2026-10-06", "오늘 기록").periods[0].nutrition.recordedIntakeTotals, null);
  assert.equal(Q.retrieve(value, "2026-10-06", "오늘 기록").periods[0].nutrition.averageCompletedIntake, null);
});

test("current poor sleep, revoked agreements and corrected records are fresh context without silent persistence", () => {
  const value = state(); value.training.records = [record("2026-07-15", "old", "바벨 로우", 2)];
  value.training.memory = { constraints: "", focus: "감량", agreements: "당분간 기존 프로그램을 유지", updatedAt: "2026-10-05T00:00:00.000Z" };
  value.days["2026-10-06"] = day("2026-10-06", { coachCheckin: { sleep: "good", hunger: "low", energy: "good", performance: "steady" } });
  const before = structuredClone(value), question = "어젯밤 잠을 못 잤고 배고파. 감량에서 증량으로 목표를 바꿨고 이전 합의는 취소해줘. 지난 3개월 등 기록";
  const first = summarizeState(value, "2026-10-06", question);
  assert.equal(first.retrieval.currentReport.text, question);
  assert.equal(first.retrieval.currentReport.savedCheckin.sleep, "good");
  assert.equal(first.retrieval.currentReport.contextChangeRequested, true);
  assert.equal(first.recall.memory.agreements, "당분간 기존 프로그램을 유지");
  assert.match(promptFor({ kind: "chat", question, context: first }), /새로 말한 수면 저하/);
  assert.deepEqual(value, before);
  value.training.records[0].exercises[0].sets[0].reps = 0;
  const revised = summarizeState(value, "2026-10-06", "지난 3개월 등 기록");
  assert.equal(first.retrieval.periods[0].training.coverage.workingSets, 2);
  assert.equal(revised.retrieval.periods[0].training.coverage.workingSets, 1);
});

test("ambiguous followups and unknown time phrases disclose fallback scope instead of claiming resolved intent", () => {
  for (const question of ["그걸 주3회로 바꿔줘", "그때랑 비교해줘", "예전보다 좋아졌나?", "지난 세 달 등 비교해줘"]) {
    const result = Q.retrieve(state(), "2026-10-06", question);
    assert.equal(result.needsClarification, true, question);
    assert.equal(result.periods[0].basis, "default-context", question);
    assert.ok(result.ambiguities.length, question);
  }
  const clipped = Q.plan(state(), "2026-10-06", "2026-10-01부터 2026-12-01까지 기록");
  assert.equal(clipped.periods[0].to, "2026-10-06"); assert.ok(clipped.assumptions.length);
});

test("bounded raw samples preserve full source coverage and permit explicit dates and sourced period quantities", () => {
  const value = state();
  value.training.records = Array.from({ length: 60 }, (_, index) => record(I.shiftDate("2026-08-01", index), `record-${index}`, "바벨 로우", 8));
  const context = summarizeState(value, "2026-10-06", "최근 3개월 등 기록");
  const period = context.retrieval.periods[0];
  assert.equal(period.source.matchedWorkoutCount, 60);
  assert.equal(period.training.coverage.workingSets, 480);
  assert.equal(period.details.workouts.length, 3);
  assert.equal(period.details.workouts[0].sampled, true);
  assert.ok(period.details.workouts[0].exercises[0].sets.length <= 4);
  assert.ok(Buffer.byteLength(promptFor({ kind: "chat", question: "최근 3개월 등 기록", context }), "utf8") <= 245 * 1024);
  const months = context.facts.find(row => row.id === "packet.retrieval.periods.0.durationMonths");
  const sets = context.facts.find(row => row.id === "packet.retrieval.periods.0.training.coverage.workingSets");
  assert.equal(months.unit, "개월"); assert.equal(sets.source, "selected-confirmed-records");
  assert.doesNotThrow(() => validateResult(answer("최근 3개월인 2026-07-07부터 2026-10-06까지의 저장 세트는 480세트입니다.", [
    { factId: months.id, value: months.value }, { factId: sets.id, value: sets.value }
  ]), "chat", context));
});

test("context-budget reductions retain complete selected aggregates instead of aborting on large valid histories", () => {
  const value = state();
  value.training.records = Array.from({ length: 12 }, (_, index) => {
    const row = record(I.shiftDate("2026-09-01", index), `large-${index}`); row.notes = "한".repeat(5000);
    row.exercises = Array.from({ length: 20 }, (_, exerciseIndex) => {
      const exercise = record(row.date, `large-${index}-${exerciseIndex}`, "바벨 로우", 100).exercises[0];
      exercise.equipmentKey = `row-${exerciseIndex}`; exercise.notes = "한".repeat(1000); return exercise;
    });
    return row;
  });
  const context = summarizeState(value, "2026-10-06", "최근 3개월 등 비교");
  assert.equal(context.samplingReducedForBudget, true);
  assert.match(context.textScope, /기간 전체 집계/);
  assert.equal(context.retrieval.periods[0].source.matchedWorkoutCount, 12);
  assert.equal(context.retrieval.periods[0].training.coverage.workingSets, 24000);
  assert.ok(Buffer.byteLength(promptFor({ kind: "chat", question: "최근 3개월 등 비교", context }), "utf8") <= 245 * 1024);
  assert.equal(value.training.records[0].notes.length, 5000, "budget trimming must not rewrite saved raw records");
});

test("actual applied choices and last review are recalled as plans, while undo revokes their applied status", () => {
  const A = require("../src/coach-actions.js"), value = state(), date = "2026-10-01", now = "2026-10-01T00:00:00.000Z";
  value.profile = { sex: "female", age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: "unknown",
    trainingYears: 2, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
  value.days[date] = day(date);
  const draft = A.createDraft(value, { kind: "allocation", targetId: date, choice: { deltaG: 20 } }, { id: "allocation-choice", reason: "사용자가 확인한 배분", reviewDate: "2026-10-06", now, today: date });
  assert.equal(summarizeState(draft, "2026-10-06", "지난번 선택").recall.actions.length, 0);
  const applied = A.applyDraft(draft, "allocation-choice", { now, today: date });
  const reviewed = A.reviewAction(applied, "allocation-choice", { id: "review-1", date: "2026-10-06", outcome: "insufficient", execution: "unknown", note: "아직 기록 부족", nextReviewDate: "2026-10-13" }, { now: "2026-10-06T00:00:00.000Z" });
  const context = summarizeState(reviewed, "2026-10-06", "지난번 선택의 결과는?");
  assert.equal(context.recall.actions.length, 1);
  assert.equal(context.recall.actions[0].status, "applied");
  assert.equal(context.recall.actions[0].review.execution, "unknown");
  assert.deepEqual(context.recall.actions[0].review.evidence.recordIds, []);
  assert.equal(context.recall.actions[0].review.evidence.completedDays, 0);
  assert.equal(context.facts.find(row => row.id === "packet.recall.actions.0.after.carbsG").estimated, true);
  assert.match(context.recall.actions[0].executionScope, /실제 운동 수행이나 실제 식사량이 아니며/);
  const undone = A.undoAction(reviewed, "allocation-choice", { now: "2026-10-06T01:00:00.000Z", today: "2026-10-06" });
  const revoked = summarizeState(undone, "2026-10-06", "지난번 선택은 복구했지?");
  assert.equal(revoked.recall.actions.length, 0); assert.equal(revoked.recall.actionStatus[0].status, "undone");
});

test("exercise-only lookup derives preceding work from the original whole session, not its filtered subset", () => {
  const value = state(), row = record("2026-10-06", "whole-session", "레그 익스텐션", 2);
  row.sequence = { order: "listed", structure: "straight" };
  row.exercises.push(record(row.date, "prior-chest", "머신 체스트 프레스", 3).exercises[0], record(row.date, "target-bench", "바벨 벤치 프레스", 1).exercises[0]);
  value.training.records = [row];
  const before = structuredClone(value), result = Q.retrieve(value, row.date, "오늘 바벨 벤치 프레스 기록");
  const selected = result.periods[0], detail = selected.details.workouts[0], context = detail.sessionContext;
  assert.equal(selected.training.coverage.workingSets, 1);
  assert.equal(detail.originalExerciseCount, 3); assert.equal(detail.originalSetCount, 6);
  assert.equal(detail.matchedExerciseCount, 1); assert.equal(detail.matchedSetCount, 1);
  assert.equal(detail.exercises[0].sourceExercisePosition, 3);
  assert.equal(context.wholeSession.workingSets, 6);
  assert.equal(context.blocks.length, 1); assert.equal(context.orderConfirmed, true);
  assert.equal(context.blocks[0].executionPosition, 3);
  assert.equal(context.blocks[0].preceding.workingSets, 5);
  assert.equal(context.blocks[0].preceding.relatedSets, 3);
  assert.equal(context.blocks[0].preceding.sameExerciseSets, 0);
  assert.deepEqual(value, before, "context must not persist into raw records");
});

test("A-B-A blocks remain distinct in query context and related movement references never enlarge exact aggregates", () => {
  const value = state(), row = record("2026-10-06", "return-to-a", "바벨 벤치 프레스", 1);
  row.sequence = { order: "listed", structure: "straight" };
  row.exercises.push(record(row.date, "machine-b", "머신 체스트 프레스", 2).exercises[0], record(row.date, "bench-a-again", "바벨 벤치 프레스", 3).exercises[0]);
  value.training.records = [row, record("2026-10-05", "incline-excluded", "덤벨 인클라인 벤치 프레스", 8)];
  const selected = Q.retrieve(value, row.date, "최근 7일 바벨 벤치 프레스 기록").periods[0];
  assert.equal(selected.training.coverage.workingSets, 4);
  const blocks = selected.details.workouts[0].sessionContext.blocks;
  assert.deepEqual(blocks.map(block => block.displayPosition), [1, 3]);
  assert.equal(blocks[1].preceding.sameExerciseSets, 1);
  assert.equal(blocks[1].preceding.workingSets, 3);
  assert.deepEqual(new Set(selected.relatedContext.exerciseIds), new Set(["dumbbell_bench_press", "machine_chest_press"]));
  assert.equal(selected.relatedContext.coverage.workingSets, 2);
  assert.equal(selected.relatedContext.records[0].exercises[0].exerciseId, "machine_chest_press");
  assert.match(selected.relatedContext.interpretation, /집계에 더하지/);
});

test("old diaries keep execution order and preceding work unknown, even after question filtering", () => {
  const value = state(), row = record("2026-10-06", "old-unconfirmed", "머신 체스트 프레스", 3);
  row.exercises.push(record(row.date, "old-target", "바벨 벤치 프레스", 1).exercises[0]); value.training.records = [row];
  const context = Q.retrieve(value, row.date, "오늘 바벨 벤치 프레스 기록").periods[0].details.workouts[0].sessionContext;
  assert.equal(context.orderConfirmed, false);
  assert.equal(context.blocks[0].displayPosition, 2);
  assert.equal(context.blocks[0].executionPosition, null);
  assert.ok(Object.values(context.blocks[0].preceding).every(value => value === null));
  assert.equal(context.blocks[0].contextKey, null);
  assert.equal(context.wholeSession.workingSets, 4);
});
