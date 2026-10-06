"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Coach = require("../src/coach.js");
const T = require("../src/training.js");
const TS = require("../src/training-store.js");
const N = require("../src/nutrition.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");

const date = "2026-10-06";
const profile = { sex: "male", age: 35, heightCm: 175, weightKg: 75, bodyFatPct: null,
  bodyFatWeightKg: null, bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 3,
  sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };

function exercise(id, exerciseId, durationMinutes = null, sets = []) {
  return { id, rawName: T.catalog.find(row => row.id === exerciseId)?.label || exerciseId || "이름만 남긴 운동",
    exerciseId, equipmentKey: `synthetic:${id}`, loadConvention: "total", loadRole: "external",
    reportedVolumeKg: null, durationMinutes, repsTotal: null, notes: "", sets };
}

function record(id, exercises, when = date, durationMinutes = null) {
  return { id, date: when, time: "17:00", label: "합성 운동", durationMinutes,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    notes: "", pain: null, effort: null, exercises };
}

function sets(id, count = 3) {
  return Array.from({ length: count }, (_, index) => ({ id: `${id}:s:${index}`, loadKg: 30,
    reps: 10, rir: null, marker: null }));
}

function review(records, when = date) {
  const training = TS.validate({ ...TS.createEmpty(), records });
  const before = structuredClone(training);
  const day = { date: when, weightKg: null, meals: [{ id: "meal", name: "합성 식사", protein: 30, carbs: 60, fat: 20, otherKcal: 0, alcoholG: 0 }],
    sessions: [], complete: false, carbAdjustmentG: 0 };
  const result = Coach.buildCoach(profile, day, [], { training, trainingAnalysis: T.analyze(training.records, { date: when }) });
  assert.deepEqual(training, before, "coaching must not alter the saved workout or source record");
  return { result, card: result.priorities.find(row => ["training-log", "training-progression"].includes(row.id)),
    coaching: result.context.training.sessionCoaching };
}

test("activity-only users receive their actual training advice rather than a misleading absent-training answer", () => {
  const cases = Fixtures.buildScenarios({ suite: "core", richActivity: true });
  for (const id of ["cross-training-only", "cross-stable-paired-bia"]) {
    const scenario = cases.find(row => row.id === id), when = "2026-10-04";
    const state = Fixtures.asOf(scenario, when, { richActivity: true }), before = structuredClone(state);
    assert.equal(state.training.records.length, 0);
    const result = Coach.buildCoach(state.profile, state.days[when], Object.values(state.days), {
      state, training: state.training, trainingAnalysis: T.analyze(state.training.records, { date: when })
    });
    const questions = result.questions.filter(row => row.id.startsWith("activity-"));
    assert.ok(questions.length > 0);
    assert.ok(questions.every(row => row.answer.includes("분")));
    assert.doesNotMatch(result.questions.map(row => row.answer).join("\n"), /확인된 운동 일지가 없어요|0세트/);
    assert.ok(!result.context.observations.some(row => row.id === "training-diary"));
    assert.deepEqual(state, before);
  }
});

test("source-backed timed movement retains its duration and next action in the whole-session coach and AI projection", () => {
  for (const exerciseId of ["treadmill", "foam_rolling", "back_stretch"]) {
    const block = exercise(`timed:${exerciseId}`, exerciseId, 15);
    const row = record(`record:${exerciseId}`, [block]);
    const { result, card, coaching } = review([row]);
    assert.ok(card);
    assert.match(card.body, /15분/);
    assert.doesNotMatch(card.body, /일반 0세트|준비 0세트|별도 표시 0세트/);
    assert.equal(card.evidence.recordMode, "time");
    assert.deepEqual(card.evidence.actionBlockIds, [block.id]);
    assert.ok(card.body.includes(coaching.actions[0].body));
    assert.equal(coaching.composition.blocks[0].durationMinutes, 15);
    const projected = coaching.exerciseContexts[0];
    assert.equal(projected.actual.current.durationMinutes, 15);
    assert.equal(projected.actual.current.date, date);
    assert.deepEqual(projected.actual.current.source, { date, sessionId: row.id, blockId: block.id, setIds: [] });
    assert.ok(projected.advice.primaryAction.body);
    assert.match(projected.advice.primaryAction.body, /15분/);
    assert.equal(projected.actual.current.sets.length, 0);
    assert.equal(projected.actual.previous, null);
    assert.doesNotMatch(result.context.observations.find(value => value.id === "training-diary").value, /0세트/);
  }
});

test("mixed sessions preserve a real timed action alongside strength work without adding parent and child durations", () => {
  const blocks = [exercise("mixed:bench", "bench_press", null, sets("bench")),
    exercise("mixed:row", "barbell_row", null, sets("row")), exercise("mixed:run", "treadmill", 15)];
  const { card, coaching } = review([record("mixed", blocks, date, 60)]);
  assert.equal(card.evidence.recordMode, "mixed");
  assert.match(card.body, /일반 6세트/);
  assert.match(card.body, /15분/);
  assert.match(card.body, /전체 기록 시간 60분/);
  assert.doesNotMatch(card.body, /75분/);
  assert.equal(coaching.actions.length, 3);
  assert.ok(coaching.actions.some(row => row.blockId === "mixed:run"));
  assert.ok(coaching.actions.some(row => row.blockId === "mixed:bench"));
  assert.ok(coaching.actions.some(row => row.blockId === "mixed:row"));
  assert.equal(coaching.exerciseContexts.length, 3);
  assert.deepEqual(coaching.exerciseContexts.find(row => row.blockId === "mixed:run").actual.current.sets, []);
  assert.equal(coaching.exerciseContexts.find(row => row.blockId === "mixed:bench").actual.current.durationMinutes, null);
});

test("a timed accessory never displaces either of two important source-bound strength tasks in the whole-session card", () => {
  const make = (id, exerciseId, values) => exercise(id, exerciseId, null, values.map(([loadKg, reps], index) => ({
    id: `${id}:s:${index}`, loadKg, reps, rir: null, marker: null
  })));
  const previous = record("mixed:previous", [make("bench", "bench_press", [[45, 8], [45, 8], [45, 8]]),
    make("lat", "lat_pulldown", [[35, 11], [35, 11], [35, 11], [55, 9]])], "2026-10-01");
  const current = record("mixed:current", [make("bench", "bench_press", [[45, 8], [45, 8], [45, 5]]),
    make("lat", "lat_pulldown", [[35, 11], [35, 11], [35, 11], [55, 6]]), exercise("stretch", "back_stretch", 10)]);
  const { card, coaching } = review([previous, current]);
  assert.deepEqual(new Set(coaching.actions.map(row => row.blockId)), new Set(["bench", "lat", "stretch"]));
  for (const action of coaching.actions) assert.ok(card.body.includes(action.body));
  assert.match(card.body, /55kg.*6/); assert.match(card.body, /35kg.*11/);
  assert.match(card.body, /45kg/); assert.match(card.body, /10분/);
});

test("cross-split reference dates appear once in the lead instead of duplicated introductory clauses", () => {
  const previous = record("upper:previous", [exercise("bench", "bench_press", null, sets("before"))], "2026-09-18");
  previous.label = "Upper";
  const previousPush = record("push:middle", [exercise("row", "barbell_row", null, sets("row"))], "2026-10-01");
  previousPush.label = "Push";
  const current = record("push:current", [exercise("bench", "bench_press", null, sets("after"))]);
  current.label = "Push";
  const { card, coaching } = review([previous, previousPush, current]);
  assert.ok(coaching.exerciseContexts[0].hypotheses.assessment.includes("2026-09-18"));
  assert.match(card.body, /2026-09-18 Upper/);
  assert.doesNotMatch(card.body, /2026-09-18 기록에 비춰 보면, 2026-09-18/);
});

test("unknown duration stays unknown while an explicitly saved zero remains an actual zero", () => {
  const unknown = review([record("unknown", [exercise("unknown:e", null)])]);
  assert.equal(unknown.card.evidence.recordMode, "unquantified");
  assert.equal(unknown.coaching.exerciseContexts[0].actual.current.durationMinutes, null);
  assert.equal(unknown.coaching.composition.blocks[0].durationMinutes, null);
  assert.doesNotMatch(unknown.card.body, /0分|0분|일반 0세트/);
  const zero = review([record("zero", [exercise("zero:e", "treadmill", 0)])]);
  assert.equal(zero.card.evidence.recordMode, "time");
  assert.equal(zero.coaching.exerciseContexts[0].actual.current.durationMinutes, 0);
  assert.equal(zero.coaching.composition.blocks[0].durationMinutes, 0);
  assert.match(zero.card.body, /0분/);
  assert.doesNotMatch(zero.card.body, /일반 0세트/);
});

test("selected historical coaching keeps the real old session date and never assigns its time to previous sets", () => {
  const old = record("old", [exercise("old:e", "barbell_row", 40, sets("old"))], "2026-10-01", 50);
  const current = record("current", [exercise("current:e", "barbell_row", 10, sets("current"))], "2026-10-03", 25);
  old.exercises[0].equipmentKey = current.exercises[0].equipmentKey;
  const future = record("future", [exercise("future:e", "treadmill", 99)], "2026-10-07", 99);
  const { card, coaching, result } = review([old, current, future], "2026-10-04");
  assert.equal(card.evidence.latestSessionDate, "2026-10-03");
  assert.equal(result.context.training.lastSession.durationMinutes, 25);
  const projected = coaching.exerciseContexts[0];
  assert.equal(projected.actual.current.durationMinutes, 10);
  assert.equal(projected.actual.current.source.date, "2026-10-03");
  assert.equal(projected.actual.previous.source.date, "2026-10-01");
  assert.notEqual(projected.actual.previous.durationMinutes, 10);
  assert.doesNotMatch(card.body, /99분|2026-10-07/);
});

test("all current blocks and their complete actual set vectors survive the Coach projection", () => {
  const blocks = Array.from({ length: 15 }, (_, index) => exercise(`complete:${index}`, "barbell_row", null,
    [...sets(`complete:${index}`, 18),
      { id: `complete:${index}:warm`, loadKg: 20, reps: 5, rir: null, marker: "W" },
      { id: `complete:${index}:additional`, loadKg: 20, reps: 4, rir: null, marker: "A" },
      { id: `complete:${index}:drop`, loadKg: 15, reps: 6, rir: null, marker: "D" }]));
  const { coaching } = review([record("complete", blocks)]);
  assert.equal(coaching.exerciseContexts.length, 15);
  assert.equal(coaching.originalContextCount, 15);
  assert.equal(coaching.contextsSampled, false);
  for (const projected of coaching.exerciseContexts) {
    const source = blocks.find(block => block.id === projected.blockId);
    assert.equal(projected.actual.current.sets.length, 18);
    assert.equal(projected.actual.current.sampled, false);
    assert.deepEqual(projected.actual.current.sets.map(set => [set.id, set.loadKg, set.reps]), source.sets.slice(0, 18).map(set => [set.id, set.loadKg, set.reps]));
    assert.equal(projected.actual.current.warmupSets.length, 1);
    assert.deepEqual(projected.actual.current.markedSets, source.sets.slice(-2));
  }
});

test("an unfinished set remains in the complete current vector without becoming zero repetitions", () => {
  const block = exercise("unfinished:e", "barbell_row", null, [...sets("unfinished", 18),
    { id: "unfinished:unknown", loadKg: 40, reps: null, rir: null, marker: null }]);
  const { coaching } = review([record("unfinished", [block])]);
  const current = coaching.exerciseContexts[0].actual.current;
  assert.equal(current.sets.length, 19);
  assert.equal(current.originalSetCount, 19);
  assert.equal(current.sampled, false);
  assert.equal(current.totalReps, null);
  assert.deepEqual(current.sets.at(-1), block.sets.at(-1));
  assert.ok(current.source.setIds.includes("unfinished:unknown"));
});

test("recorded monthly work stages retain each real source date instead of adopting the selected date", () => {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const when = `2026-10-0${index + 1}`;
    const block = exercise(`stage:${index}:e`, "barbell_row", null,
      sets(`stage:${index}`).map((set, position) => ({ ...set, loadKg: index < 2 ? 40 : 42.5,
        reps: index < 4 || position !== 2 ? 8 : 7 })));
    block.equipmentKey = "synthetic:same-row";
    return record(`stage:${index}`, [block], when);
  });
  const { coaching } = review(rows);
  const stages = coaching.exerciseContexts[0].actual.recordedWorkStages;
  assert.ok(stages);
  assert.equal(stages.scope, "same-exercise-equipment-42-days");
  assert.equal(stages.stageCount, 3);
  assert.equal(stages.retainedStageCount, 3);
  assert.equal(stages.sampled, false);
  assert.deepEqual(stages.stages.map(stage => stage.dates), [["2026-10-01", "2026-10-02"], ["2026-10-03", "2026-10-04"], ["2026-10-05", "2026-10-06"]]);
  for (const stage of stages.stages) {
    assert.equal(stage.work.source.date, stage.dates.at(-1));
    const original = rows.find(row => row.id === stage.work.source.sessionId);
    assert.equal(original.date, stage.work.source.date);
    assert.deepEqual(stage.work.sets.map(set => [set.loadKg, set.reps]), original.exercises[0].sets.map(set => [set.loadKg, set.reps]));
    assert.deepEqual(stage.sourceRefs.map(source => source.date), stage.dates);
  }
});

test("small macro gaps do not become a corrective daily priority and substantial completed-day gaps still do", () => {
  const day = { date, weightKg: null, meals: [], sessions: [], complete: false, carbAdjustmentG: 0 };
  const planSnapshot = N.calculatePlan(profile, day);
  const meal = (protein, carbs, fat) => ({ id: "macro-meal", name: "합성 식사", protein, carbs, fat, otherKcal: 0, alcoholG: 0 });
  const completed = meals => Coach.buildCoach(profile, { ...day, meals, complete: true, planSnapshot });
  const smallProtein = completed([meal(planSnapshot.macros.protein.min - 3, planSnapshot.macros.carbs.target, planSnapshot.macros.fat.target)]);
  assert.equal(smallProtein.context.totals.protein, planSnapshot.macros.protein.min - 3);
  assert.equal(smallProtein.context.macroTargets.protein.min, planSnapshot.macros.protein.min);
  assert.ok(!smallProtein.priorities.some(row => row.id === "protein"));
  const smallCarbs = completed([meal(planSnapshot.macros.protein.target, planSnapshot.macros.carbs.min - 3, planSnapshot.macros.fat.max + 1)]);
  assert.ok(!smallCarbs.priorities.some(row => row.id === "macro-balance"));
  const largeProtein = completed([meal(planSnapshot.macros.protein.min * 0.75, planSnapshot.macros.carbs.target, planSnapshot.macros.fat.target)]);
  assert.ok(largeProtein.priorities.some(row => row.id === "protein"));
  const largeCarbs = completed([meal(planSnapshot.macros.protein.target, planSnapshot.macros.carbs.min * 0.75, planSnapshot.macros.fat.max + 5)]);
  assert.ok(largeCarbs.priorities.some(row => row.id === "macro-balance"));
  const draft = Coach.buildCoach(profile, { ...day, meals: [meal(20, 20, planSnapshot.macros.fat.max + 5)] });
  assert.equal(draft.context.dayAssessmentAvailable, false);
  assert.ok(!draft.priorities.some(row => ["protein", "macro-balance"].includes(row.id)));
});
