"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("./fixtures/coaching-scenarios.cjs");
const C = require("../src/coach.js");
const T = require("../src/training.js");
const N = require("../src/nutrition.js");
const S = require("../src/storage.js");
const D = require("../src/coach-context.js");
const Runtime = require("../tools/coach-runtime.cjs");
const original = F.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === "strength-plateau-regular");
const DATE = original.checkpoints[2].date;

function setup({ scope = "both", profileMode = "ready", timed = true, checkin = { illness: "active", pain: "none" }, intent = "regular" } = {}) {
  const state = F.asOf(original, DATE, { richActivity: true });
  state.trackingScope = scope;
  if (profileMode === "none") state.profile = null;
  if (profileMode === "review") state.profile.healthContext = "clinical";
  const day = state.days[DATE];
  day.complete = false; day.planSnapshot = null;
  if (profileMode === "incomplete") {
    day.complete = true;
    day.planSnapshot = N.calculatePlan({ ...state.profile, age: null }, day);
    day.planSnapshot.context.goal = state.profile.goal;
  }
  day.coachCheckin = { energy: "okay", hunger: "okay", sleep: "okay", performance: "steady", fatigue: "usual", ...checkin };
  if (!timed) day.sessions = [];
  state.training.records.filter(row => row.date === DATE).forEach(row => { row.trainingIntent = intent; });
  return S.validateState(state);
}
function run(state) {
  const day = state.days[DATE], before = structuredClone(state);
  const analysis = T.analyze(state.training.records, { date: DATE, mappings: state.training.mappings, checkins: state.days });
  const decisionContext = D.build(state, DATE);
  const coach = C.buildCoach(state.profile, day, Object.values(state.days).filter(row => row.date < DATE),
    { state, decisionContext, trainingAnalysis: analysis, training: state.training });
  assert.deepEqual(state, before);
  return coach;
}
const texts = coach => [...coach.priorities.map(row => row.body), ...coach.questions.map(row => row.answer)].join("\n");
const ordinaryResume = /다음 운동은 현재 구성을 출발점|다음 운동은 지난 구성에서|운동을 마치면 실제 기록|마친 뒤에는 실제 수행에서|다음 운동은 같은 장비의 기록|이번 수행에서 시작하고/;

for (const scope of ["nutrition", "training", "both"]) for (const profileMode of ["ready", "review", "incomplete", "none"]) for (const timed of [false, true]) {
  test(`active illness stays consistent across ${scope}, ${profileMode}, ${timed ? "timed activity" : "set diary only"}`, () => {
    const state = setup({ scope, profileMode, timed }), coach = run(state);
    assert.equal(coach.priorities[0].id, "current-health");
    assert.equal(coach.context.currentHealthAdvice.kind, "stop");
    assert.match(coach.priorities[0].body, /2026-09-25.*아픈 상태/);
    assert.match(coach.questions.find(row => row.id === "recovery").answer, /쉬며 현재 증상/);
    assert.doesNotMatch(texts(coach), ordinaryResume);
    if (scope !== "nutrition") {
      const log = coach.questions.find(row => row.id === "training-log");
      assert.match(log.answer, /80kg × 8·8·8회/);
      assert.match(log.answer, /운동 블록 3개/);
    }
    if (profileMode === "review") assert.match(coach.questions.find(row => row.id === "recovery").answer, /담당 전문가/);
  });
}

for (const intent of ["return", "deload", "technique"]) test(`stop pain overrides ${intent} wording while actual work stays recorded`, () => {
  const state = setup({ intent, checkin: { illness: "none", pain: "stop" } }), coach = run(state);
  assert.equal(coach.context.currentHealthAdvice.kind, "stop");
  assert.match(coach.questions.find(row => row.id === "training-deload").answer, /운동을 멈춰야 할 정도/);
  assert.doesNotMatch(texts(coach), ordinaryResume);
  assert.doesNotMatch(coach.priorities[0].body, /아픈 상태라고/);
  assert.match(coach.questions.find(row => row.id === "training-log").answer, /80kg × 8·8·8회/);
});

test("previous illness and pain keep separate actual dates without asserting illness today", () => {
  const state = setup({ checkin: { illness: null, pain: null } });
  state.days["2026-09-18"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-18"].coachCheckin, illness: "recovering", pain: "none" };
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-23"].coachCheckin, illness: null, pain: "mild" };
  const coach = run(state), advice = coach.context.currentHealthAdvice;
  assert.equal(advice.kind, "health-follow-up");
  assert.deepEqual(advice.reports, [{ field: "illness", date: "2026-09-18", value: "recovering" }, { field: "pain", date: "2026-09-23", value: "mild" }]);
  assert.match(advice.body, /2026-09-18.*2026-09-23/);
  assert.match(advice.body, /지금도 이어지는지는 아직 새로 확인되지/);
  assert.doesNotMatch(texts(coach), ordinaryResume);
});

test("explicit none only resolves its own health field", () => {
  const state = setup({ checkin: { illness: "none", pain: null } });
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-23"].coachCheckin, illness: "active", pain: "stop" };
  const coach = run(state);
  assert.deepEqual(coach.context.currentHealthAdvice.reports, [{ field: "pain", date: "2026-09-23", value: "stop" }]);
  assert.doesNotMatch(coach.priorities[0].body, /질병|아픈 상태/);
});

test("illness follow-up keeps real report dates in training and AI projections without a current repetition proposal", () => {
  const state = setup({ checkin: { illness: null, pain: "none" } });
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-23"].coachCheckin, illness: "active", pain: "none" };
  const coach = run(state);
  const reports = [{ field: "illness", date: "2026-09-23", value: "active" }];
  assert.deepEqual(coach.context.training.recovery.healthReports, reports);
  assert.deepEqual(coach.context.training.recovery.unresolvedHealthReports, reports);
  assert.deepEqual(coach.context.currentHealthAdvice.reports, reports);
  for (const row of coach.context.training.sessionCoaching.exerciseContexts) {
    assert.deepEqual(row.hypotheses.healthFollowUp.reports, reports.map(row => ({ ...row, source: "reported-health" })));
    assert.equal(row.hypotheses.healthFollowUp.basis, "product-choice");
    assert.equal(row.hypotheses.healthFollowUp.currentStatusVerified, false);
    assert.equal(row.advice.primaryAction.kind, "health-follow-up");
    assert.equal(row.advice.primaryAction.proposal, undefined);
  }
  const packet = Runtime.summarizeState(state, DATE, "현재 기록에서 다음 운동을 어떻게 정할까요?");
  assert.deepEqual(packet.trainingAnalysis.recovery.unresolvedHealthReports, reports);
  assert.ok(!packet.trainingProposals.some(row => row.scope === "current-option"));
  assert.match(coach.priorities.find(row => /^training-progression|training-log$/.test(row.id)).body, /80kg × 8·8·8회/);
});

test("a pain-only follow-up does not create an illness report or lose the original null illness", () => {
  const state = setup({ checkin: { illness: "none", pain: null } });
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-23"].coachCheckin, illness: null, pain: "stop" };
  const coach = run(state), reports = [{ field: "pain", date: "2026-09-23", value: "stop" }];
  assert.deepEqual(coach.context.training.recovery.unresolvedHealthReports, reports);
  assert.deepEqual(coach.context.currentHealthAdvice.reports, reports);
  assert.equal(state.days["2026-09-23"].coachCheckin.illness, null);
  assert.ok(!coach.context.training.sessionCoaching.exerciseContexts.some(row => row.advice.primaryAction.proposal));
});

test("explicit no pain in the current actual diary resolves the older check-in report", () => {
  const state = setup({ checkin: { illness: "none", pain: null } });
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, pain: "mild" };
  state.training.records.find(row => row.date === DATE).pain = "none";
  const coach = run(state);
  assert.equal(coach.context.currentHealthAdvice, undefined);
  assert.equal(coach.context.training.recovery.healthReports, undefined);
  assert.equal(coach.context.training.recovery.unresolvedHealthReports, undefined);
});

test("a current diary stop pain is not hidden by a blank or same-day none check-in", () => {
  for (const pain of [null, "none"]) {
    const state = setup({ checkin: { illness: "none", pain } });
    state.training.records.find(row => row.date === DATE).pain = "stop";
    const coach = run(state), reports = [{ field: "pain", date: DATE, value: "stop" }];
    assert.deepEqual(coach.context.currentHealthAdvice.reports, reports);
    assert.deepEqual(coach.context.training.recovery.healthReports, reports);
    assert.equal(coach.context.currentHealthAdvice.kind, "stop");
    assert.doesNotMatch(texts(coach), ordinaryResume);
    assert.ok(!coach.context.training.sessionCoaching.exerciseContexts.some(row => row.advice.primaryAction.proposal));
  }
});

test("individual-care recovery questions keep professional routing instead of a generic workout return", () => {
  const coach = run(setup({ profileMode: "review", checkin: { illness: "none", pain: "none" } }));
  const recovery = coach.questions.find(row => row.id === "recovery");
  assert.match(recovery.answer, /담당 전문가의 지침/);
  assert.equal(recovery.action, "nav-profile");
  assert.doesNotMatch(recovery.answer, ordinaryResume);
});

test("direct coach fallbacks cannot choose a no-pain duplicate ID to clear an older actual report", () => {
  const state = setup({ checkin: { illness: "none", pain: null } });
  const old = { date: "2026-09-23", coachCheckin: { energy: null, hunger: null, sleep: null, pain: "mild" } };
  const record = structuredClone(state.training.records.find(row => row.date === DATE));
  state.training.records.push({ ...record, id: "conflicting-health-id", date: "2026-09-24", pain: "stop" },
    { ...record, id: "conflicting-health-id", date: DATE, pain: "none" });
  const coach = C.buildCoach(state.profile, state.days[DATE], [old], { training: state.training });
  assert.deepEqual(coach.context.currentHealthAdvice.reports, [{ field: "pain", date: old.date, value: "mild" }]);
});

test("same-day disagreeing health reports do not silently select none in a direct fallback", () => {
  const state = setup({ checkin: { illness: "none", pain: "none" } });
  const other = { date: DATE, coachCheckin: { energy: null, hunger: null, sleep: null, illness: "active", pain: "stop" } };
  const coach = C.buildCoach(state.profile, state.days[DATE], [other]);
  assert.deepEqual(coach.context.currentHealthAdvice.reports, [{ field: "illness", date: DATE, value: "active" }, { field: "pain", date: DATE, value: "stop" }]);
  assert.equal(coach.context.currentHealthAdvice.kind, "stop");
});

test("future and blank diary health cannot clear a past health report in a direct fallback", () => {
  const state = setup({ checkin: { illness: "none", pain: null } });
  const old = { date: "2026-09-23", coachCheckin: { energy: null, hunger: null, sleep: null, pain: "mild" } };
  const record = structuredClone(state.training.records.find(row => row.date === DATE));
  state.training.records.push({ ...record, id: "future-no-pain", date: "2026-09-26", pain: "none" },
    { ...record, id: "blank-current-pain", date: DATE, pain: null });
  const coach = C.buildCoach(state.profile, state.days[DATE], [old], { training: state.training });
  assert.deepEqual(coach.context.currentHealthAdvice.reports, [{ field: "pain", date: old.date, value: "mild" }]);
});

test("explicit recovery of both fields does not become an endless historical health hold", () => {
  const state = setup({ checkin: { illness: "none", pain: "none" } });
  state.days["2026-09-23"].coachCheckin = { energy: null, hunger: null, sleep: null, ...state.days["2026-09-23"].coachCheckin, illness: "active", pain: "stop" };
  const coach = run(state);
  assert.equal(coach.context.currentHealthAdvice, undefined);
  assert.ok(!coach.priorities.some(row => row.id === "current-health"));
});

for (const checkin of [{ illness: "recovering", pain: "none" }, { illness: "none", pain: "mild" }, { illness: "none", pain: "none", fatigue: "high" }]) {
  test(`recovery questions use the same present state as activity actions: ${JSON.stringify(checkin)}`, () => {
    const coach = run(setup({ checkin }));
    const advice = coach.context.currentHealthAdvice;
    assert.ok(advice);
    assert.ok(coach.questions.find(row => row.id === "recovery").answer.startsWith(advice.body));
    assert.ok(coach.questions.find(row => row.id === "training-deload").answer.startsWith(advice.body));
    assert.ok(!coach.questions.some(row => row.id === "training-program"));
  });
}

test("saved nutrition quantities remain retrospective during active illness", () => {
  const state = setup(), day = state.days[DATE];
  const plan = N.calculatePlan(state.profile, day);
  plan.context.goal = state.profile.goal;
  day.complete = true; day.planSnapshot = plan;
  const coach = run(state);
  assert.equal(coach.context.targetKcal, plan.energy.targetKcal);
  assert.equal(coach.context.planSource, "saved-target");
  assert.match(coach.questions.find(row => row.id === "target").answer, /완료할 때 저장한/);
  assert.match(coach.questions.find(row => row.id === "training").answer, /이 날 실제로 기록한 운동은 60분/);
  assert.doesNotMatch(texts(coach), ordinaryResume);
});
