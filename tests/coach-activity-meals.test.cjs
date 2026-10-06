"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/coach.js");
const D = require("../src/coach-context.js");
const F = require("./fixtures/coaching-scenarios.cjs");
const N = require("../src/nutrition.js");

function fixture(id, week, actualDay = false) {
  const scenario = F.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === id);
  let date = scenario.checkpoints[week - 1].date;
  let state = F.asOf(scenario, date, { richActivity: true });
  if (actualDay) {
    date = Object.values(state.days).filter(day => day.sessions.length).map(day => day.date).sort().at(-1);
    state = F.asOf(scenario, date, { richActivity: true });
  }
  return { state, date };
}
function build(state, date) {
  const before = structuredClone(state), decision = D.build(state, date);
  const coach = C.buildCoach(state.profile, state.days[date], Object.values(state.days).filter(row => row.date < date), { state, decisionContext: decision });
  assert.deepEqual(state, before);
  return { coach, decision, question: coach.questions.find(row => row.id === "training") };
}

test("post-cycling meal answer starts with a usable meal and retains the actual lower-work context", () => {
  const { state, date } = fixture("cycling-unexpected-decline", 3), { question, decision } = build(state, date);
  assert.match(question.answer, /^운동 뒤 다음 끼니.*평소 문제없이 먹어 온 주식과 단백질/);
  assert.match(question.answer, /자전거 23분/);
  assert.match(question.answer, /2026-09-11.*45분.*줄어들었어요/);
  assert.match(question.answer, /끼니를 건너뛰거나 추가 운동으로 맞추지/);
  assert.match(question.answer, /목표에 다시 더하지/);
  assert.doesNotMatch(question.answer, /긴 라이딩|전부 확인|기록을 남기면/);
  assert.deepEqual(question.evidence.sources, decision.activity.current[0].sources);
  assert.ok(question.answer.length < decision.activity.current[0].assessment.length + decision.activity.current[0].action.body.length);
});

test("intended deload keeps its purpose rather than turning the lower duration into an unexpected decline", () => {
  const { state, date } = fixture("cycling-planned-deload", 2, true);
  state.days[date].coachCheckin = { ...state.days[date].coachCheckin, energy: "good", sleep: "good", sleepHours: 8,
    fatigue: "usual", performance: "steady", illness: "none", pain: "none" };
  const { question, decision } = build(state, date);
  assert.equal(decision.activity.current[0].action.kind, "deload");
  assert.match(question.answer, /^운동 뒤 다음 끼니/);
  assert.match(question.answer, /디로드/);
  assert.doesNotMatch(question.answer, /평소처럼 했지만|예상 밖|수행 저하|근력 퇴보/);
});

test("return from a temporary expansion keeps the established-return interpretation in the meal answer", () => {
  const { state, date } = fixture("running-sharp-improvement", 4, true);
  state.days[date].coachCheckin = { ...state.days[date].coachCheckin, energy: "good", sleep: "good", sleepHours: 8,
    fatigue: "usual", performance: "steady", illness: "none", pain: "none" };
  const { question, decision } = build(state, date);
  assert.equal(decision.activity.current[0].action.kind, "return-established-work");
  assert.match(question.answer, /전에 여러 날 했던 구성.*다시 남겼어요/);
  assert.match(question.answer, /달리기 30분/);
  assert.doesNotMatch(question.answer, /평소처럼 했지만.*줄어들|수행 저하|근력 퇴보/);
});

for (const illness of ["active", "recovering"]) test(`current ${illness} remains first in a post-workout food answer`, () => {
  const { state, date } = fixture("cycling-unexpected-decline", 3);
  state.days[date].coachCheckin.illness = illness;
  const { question, coach } = build(state, date);
  assert.ok(coach.context.currentHealthAdvice);
  assert.match(question.answer, illness === "active" ? /쉬며 현재 증상/ : /회복 중/);
  assert.match(question.answer, /끼니와 물은 챙겨/);
  assert.doesNotMatch(question.answer, /평소처럼 했지만|원래 시간.*시도/);
});

test("current food-only and profileless scopes do not create a numeric exercise-fueling FAQ", () => {
  for (const mode of ["food-only", "no-profile"]) {
    const { state, date } = fixture("cycling-unexpected-decline", 3);
    if (mode === "food-only") state.trackingScope = "nutrition";
    else { state.profile = null; state.days[date].planSnapshot = null; state.days[date].complete = false; }
    const { coach, question } = build(state, date);
    assert.equal(question, undefined);
    assert.ok(!coach.questions.some(row => row.id === "training"));
  }
});

test("an unrecorded selected day does not borrow the previous workout as today's completed activity", () => {
  const { state, date } = fixture("running-sharp-improvement", 4);
  assert.equal(state.days[date].sessions.length, 0);
  const { question, decision } = build(state, date);
  assert.equal(decision.activity.current.length, 0);
  assert.ok(decision.activity.latest.length);
  assert.doesNotMatch(question.answer, /오늘 실제 기록한 운동은|오늘.*30분.*마쳤/);
});

for (const sport of ["swimming", "team"]) test(`completed ${sport} snapshot estimate is not represented as a new estimate for edited actual time`, () => {
  const { state, date } = fixture(`${sport}-plateau-regular`, 3), snapshot = structuredClone(state.days[date].planSnapshot);
  assert.equal(state.days[date].complete, true);
  const { coach, question } = build(state, date);
  assert.match(question.answer, sport === "swimming" ? /수영 30분/ : /구기.*60분/);
  assert.match(question.answer, /완료 당시 목표에 포함했던 운동 순소모 추정/);
  assert.match(question.answer, /당시 입력으로 저장한 값/);
  assert.match(question.answer, /현재 표시된 실제 수행 시간을 새로 계산한 소모량은 아니에요/);
  assert.equal(coach.context.exerciseKcal, snapshot.energy.exerciseKcal);
  assert.deepEqual(state.days[date].planSnapshot, snapshot);
});

test("matching saved time still labels the saved estimate while an unfinished day uses the current estimate", () => {
  const profile = { sex: "female", age: 35, heightCm: 168, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
    bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 3, sport: "swimming", goal: "performance", activity: "light", healthContext: "general", proteinPreference: "standard" };
  const day = { date: "2026-10-05", weightKg: null, meals: [{ id: "meal", protein: 25, carbs: 55, fat: 15, otherKcal: 0, alcoholG: 0 }],
    sessions: [{ sport: "swimming", durationMin: 30, intensity: "moderate" }], complete: false, carbAdjustmentG: 0 };
  const unfinished = C.buildCoach(profile, day).questions.find(row => row.id === "training").answer;
  assert.match(unfinished, /운동의 순소모 추정/); assert.doesNotMatch(unfinished, /완료 당시/);
  const snapshot = N.calculatePlan(profile, day); snapshot.context.goal = profile.goal;
  const savedDay = { ...day, complete: true, planSnapshot: snapshot }, before = structuredClone(savedDay);
  const saved = C.buildCoach(profile, savedDay).questions.find(row => row.id === "training").answer;
  assert.match(saved, /수영 30분/); assert.match(saved, /완료 당시 목표에 포함했던/);
  assert.deepEqual(savedDay, before);
});
