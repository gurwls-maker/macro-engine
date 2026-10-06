"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("./fixtures/coaching-scenarios.cjs");
const C = require("../src/coach.js");
const D = require("../src/coach-context.js");
const S = require("../src/storage.js");
const T = require("../src/training.js");
const TS = require("../src/training-store.js");
const scenario = F.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === "cross-both-partial");
const DATE = scenario.checkpoints[3].date;

function clean(sport, noProfile = false) {
  const state = F.asOf(scenario, DATE, { richActivity: true });
  state.days = { [DATE]: state.days[DATE] };
  state.training = TS.createEmpty();
  state.trackingScope = "both";
  if (noProfile) state.profile = null;
  else state.profile.sport = sport === "walking" ? "none" : sport;
  state.days[DATE].sessions = [{ id: "actual-session", sport, durationMin: 30, intensity: "moderate" }];
  return S.validateState(state);
}
function run(state) {
  const before = structuredClone(state), day = state.days[DATE];
  const trainingAnalysis = T.analyze(state.training.records, { date: DATE, mappings: state.training.mappings, checkins: state.days });
  const result = C.buildCoach(state.profile, day, Object.values(state.days).filter(row => row.date < DATE), {
    state, trainingAnalysis, training: state.training, decisionContext: D.build(state, DATE)
  });
  assert.deepEqual(state, before);
  return result;
}
function sourceExercise(changes = {}) {
  const source = structuredClone(scenario.state.training.records[0]);
  source.id = "actual-diary"; source.date = DATE; source.label = "실제 종목 기록";
  source.durationMinutes = null;
  source.exercises = [{ ...source.exercises[0], id: "actual-block", ...changes }];
  return source;
}

for (const sport of ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"]) for (const noProfile of [false, true]) {
  test(`${sport} actual time without set diary does not ask for muscle mapping (${noProfile ? "no profile" : "profile"})`, () => {
    const result = run(clean(sport, noProfile));
    assert.ok(!result.questions.some(row => row.id === "training-muscles"));
    assert.ok(result.questions.some(row => row.id.startsWith("activity-")));
    assert.equal(result.context.training.coverage.workingSets, 0);
  });
}

test("the actual cross W4 with mixed guidance and no selected-day activity gives preparation, not reflected time", () => {
  const state = F.asOf(scenario, DATE, { richActivity: true });
  assert.equal(state.days[DATE].sessions.length, 0);
  const result = run(state), question = result.questions.find(row => row.id === "training");
  assert.match(question.answer, /여러 종목을 할 예정이라면/);
  assert.match(question.answer, /운동을 마친 뒤에는 실제로 한 시간/);
  assert.doesNotMatch(question.answer, /각각 실제로 한 시간만 반영했어요/);
  assert.ok(result.questions.some(row => row.id === "training-muscles"), "past real set work still has a useful muscle view");
});

test("actual mixed activities retain duplicate-time protection and original duration", () => {
  const state = clean("mixed");
  state.days[DATE].sessions = [{ id: "running", sport: "running", durationMin: 20, intensity: "easy" },
    { id: "strength", sport: "strength", durationMin: 40, intensity: "moderate" }];
  const result = run(state), question = result.questions.find(row => row.id === "training");
  assert.match(question.answer, /60분/);
  assert.match(question.answer, /각각 실제로 한 시간만 반영했어요/);
  assert.match(question.answer, /같은 시간대를 두 세션으로 중복 기록/);
  assert.ok(!result.questions.some(row => row.id === "training-muscles"));
});

test("an unresolved empty exercise block keeps the mapping question without invented sets", () => {
  const state = clean("running");
  state.training.records = [sourceExercise({ rawName: "개인 기구 운동", exerciseId: null, equipmentKey: null, sets: [] })];
  const result = run(state), question = result.questions.find(row => row.id === "training-muscles");
  assert.ok(question);
  assert.match(question.answer, /운동명·기구를 한 번 연결/);
  assert.equal(result.context.training.coverage.workingSets, 0);
  assert.equal(result.context.training.coverage.unresolvedExercises, 1);
});

test("an unresolved timed-only block is not turned into a muscle-set mapping request", () => {
  const state = clean("running");
  state.training.records = [sourceExercise({ rawName: "개인 야외 코스", exerciseId: null, equipmentKey: null, durationMinutes: 30, sets: [] })];
  const result = run(state);
  assert.ok(!result.questions.some(row => row.id === "training-muscles"));
  assert.equal(result.context.training.coverage.workingSets, 0);
  assert.equal(result.context.training.lastSession.durationMinutes, null);
});

test("a real set diary alongside time-only activity keeps its muscle analysis", () => {
  const state = clean("swimming");
  state.training.records = [sourceExercise()];
  const result = run(state);
  assert.ok(result.questions.some(row => row.id === "training-muscles"));
  assert.equal(result.context.training.coverage.workingSets, 3);
  assert.ok(result.questions.some(row => row.id.startsWith("activity-")));
});

test("partial external analysis with null session and exercise entries does not create a muscle question", () => {
  const state = clean("running"), day = state.days[DATE];
  const trainingAnalysis = T.analyze([], { date: DATE });
  trainingAnalysis.sessions = [null, { exercises: [null] }];
  const result = C.buildCoach(state.profile, day, [], { state, training: state.training, trainingAnalysis,
    decisionContext: D.build(state, DATE) });
  assert.ok(!result.questions.some(row => row.id === "training-muscles"));
});
