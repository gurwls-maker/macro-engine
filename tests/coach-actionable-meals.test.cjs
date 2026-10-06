"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/coach.js");
const N = require("../src/nutrition.js");
const T = require("../src/training.js");
const D = require("../src/coach-context.js");
const F = require("./fixtures/coaching-scenarios.cjs");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const profile = { sex: "female", age: 35, heightCm: 168, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 3, sport: "strength", goal: "performance", activity: "light", healthContext: "general", proteinPreference: "standard" };
const day = { date: "2026-10-05", weightKg: null, meals: [], sessions: [], complete: false, carbAdjustmentG: 0 };
const meal = { id: "actual-meal", name: "실제 한 끼", protein: 25, carbs: 55, fat: 15, alcoholG: 0, otherKcal: 0 };
const priorGate = /다음 식사를 정하기 전에|먹은 식사를 남기면 다음 식사|기록이 없다는 이유로 먹지 않았다고/;

for (const coachCheckin of [undefined, null, { energy: null, hunger: null, sleep: null }, { energy: "okay", hunger: null, sleep: "good" }]) {
  test(`missing recovery fields do not gate the next meal: ${JSON.stringify(coachCheckin)}`, () => {
    const input = { ...day, meals: [structuredClone(meal)], coachCheckin }, before = structuredClone(input);
    const result = C.buildCoach(profile, input), primary = result.priorities[0];
    assert.equal(primary.id, "checkin");
    assert.equal(primary.action, "meal-add");
    assert.match(primary.body, /다음 끼니.*주식과 단백질 식품/);
    assert.match(primary.body, /나중에 허기·컨디션/);
    assert.doesNotMatch(primary.body, priorGate);
    assert.equal(result.context.recoveryConcern, false);
    assert.deepEqual(input, before);
  });
}

for (const mealConstraint of ["busy", "low-appetite", "digestive"]) test(`known ${mealConstraint} changes the practical food choice without asking before helping`, () => {
  const input = { ...day, meals: [structuredClone(meal)], coachCheckin: { energy: null, hunger: null, sleep: null, mealConstraint } };
  const result = C.buildCoach(profile, input), primary = result.priorities[0];
  assert.doesNotMatch(primary.body, priorGate);
  assert.match(primary.body, mealConstraint === "busy" ? /준비가 덜 필요한 식사/ : mealConstraint === "low-appetite" ? /조금씩 나눠/ : /잘 견디는 음식과 양/);
});

test("no food record still gets a useful next meal, not a statement about missing intake", () => {
  const result = C.buildCoach(profile, day), answer = result.questions.find(row => row.id === "next-meal").answer;
  assert.match(answer, /다음 끼니.*주식과 단백질 식품/);
  assert.doesNotMatch(answer, priorGate);
  assert.equal(result.context.dayAssessmentAvailable, false);
  assert.ok(!result.priorities.some(row => row.id === "low-energy"));
});

for (const concern of [{ fatigue: "high" }, { sleep: "poor" }, { illness: "active" }, { pain: "stop" }]) test(`balanced recorded food has a next meal action while ${JSON.stringify(concern)} remains first`, () => {
  const input = { ...day, coachCheckin: { energy: "okay", hunger: "okay", sleep: "okay", ...concern }, sessions: [{ sport: "strength", durationMin: 45, intensity: "moderate" }] };
  const snapshot = N.calculatePlan(profile, input); snapshot.context.goal = profile.goal;
  input.meals = [{ ...meal, protein: snapshot.macros.protein.target, carbs: snapshot.macros.carbs.target, fat: snapshot.macros.fat.target }];
  input.complete = true; input.planSnapshot = snapshot;
  const before = structuredClone(input), result = C.buildCoach(profile, input), answer = result.questions.find(row => row.id === "next-meal").answer;
  assert.match(answer, /다음 끼니.*주식과 단백질 식품/);
  assert.match(answer, /식사를 더 깎거나 추가 운동으로 맞추지/);
  assert.doesNotMatch(answer, /따로 확인해야 해요/);
  if (concern.illness || concern.pain) {
    assert.equal(result.context.currentHealthAdvice.kind, "stop");
    assert.match(result.priorities[0].body, /쉬며|운동을 멈춰/);
  }
  assert.deepEqual(input, before);
});

test("clinical restrictions stay above familiar-food suggestions", () => {
  const result = C.buildCoach({ ...profile, healthContext: "clinical" }, { ...day, meals: [meal] });
  assert.equal(result.status, "review");
  assert.match(result.questions.find(row => row.id === "tracking").answer, /전문가와 정한 계획/);
  assert.doesNotMatch(result.questions.find(row => row.id === "tracking").answer, /주식과 단백질 식품/);
});

function scenarioCoach(id, week) {
  const scenario = F.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === id);
  const date = scenario.checkpoints[week - 1].date, state = F.asOf(scenario, date, { richActivity: true });
  const before = structuredClone(state), analysis = T.analyze(state.training.records, { date, mappings: state.training.mappings, checkins: state.days });
  const result = C.buildCoach(state.profile, state.days[date], Object.values(state.days).filter(row => row.date < date), {
    state, training: state.training, trainingAnalysis: analysis, decisionContext: D.build(state, date)
  });
  assert.deepEqual(state, before);
  return result;
}
test("actual strength decline questions keep the current lower work and prior context instead of a generic deload answer", () => {
  const result = scenarioCoach("strength-unexpected-decline", 3), answer = result.questions.find(row => row.id === "training-deload").answer;
  assert.match(answer, /55kg.*8/);
  assert.match(answer, /80kg|낮아진|줄어든/);
  assert.doesNotMatch(answer, /별도 경고 신호|건강이 검증/);
});
test("actual running decline questions use the recorded 30-to-15-minute flow and next action", () => {
  const result = scenarioCoach("running-unexpected-decline", 3), question = result.questions.find(row => row.id === "training-deload");
  assert.match(question.answer, /30분/);
  assert.match(question.answer, /15분/);
  assert.match(question.answer, /한꺼번에 메우기보다/);
  assert.ok(question.evidence.sources.length > 0);
});
test("active illness still replaces the recorded-activity deload answer with rest", () => {
  const result = scenarioCoach("running-illness-active", 3), answer = result.questions.find(row => row.id === "training-deload").answer;
  assert.match(answer, /쉬며 현재 증상/);
  assert.doesNotMatch(answer, /이번 기록.*출발점|한 가지씩 돌아가/);
});

for (const constraints of ["견과류 알레르기가 있어 피한다.", "채식을 하며 동물성 식품은 먹지 않는다.", "신념에 따라 돼지고기를 먹지 않는다.", "유제품은 소화가 불편해서 피한다."]) {
  for (const direction of ["protein", "fat", "carbs"]) test(`${direction} food choice does not certify or override free-text memory: ${constraints}`, () => {
    const input = structuredClone(day), snapshot = N.calculatePlan(profile, input);
    snapshot.context.goal = profile.goal;
    let protein = direction === "protein" ? snapshot.macros.protein.min / 2 : snapshot.macros.protein.target;
    let fat = direction === "fat" ? 5 : snapshot.macros.fat.target;
    let carbs = direction === "carbs" ? 10 : (snapshot.energy.targetKcal - protein * 4 - fat * 9) / 4;
    if (direction === "carbs") fat = (snapshot.energy.targetKcal - protein * 4 - carbs * 4) / 9;
    input.meals = [{ ...meal, protein, carbs, fat }]; input.complete = true; input.planSnapshot = snapshot;
    const state = S.createEmpty(); state.profile = structuredClone(profile); state.days[input.date] = input; state.training = TS.createEmpty();
    state.training.memory = { constraints, focus: "", agreements: "", updatedAt: "2026-10-05T00:00:00.000Z" };
    const before = structuredClone(state), result = C.buildCoach(state.profile, input, [], { state });
    const answer = result.questions.find(row => row.id === "next-meal").answer;
    assert.match(answer, /평소 문제없이 먹어 온/);
    assert.match(answer, direction === "protein" ? /단백질 식품/ : direction === "fat" ? /지방 공급원/ : /주식으로 바꾸는/);
    assert.doesNotMatch(answer, /견과류|생선|달걀|두부|콩|돼지고기|우유|유제품/);
    assert.doesNotMatch(answer, /알레르기.{0,10}(?:안전|적합)|제약.{0,10}(?:해석했|반영했|검증했)/);
    assert.equal(result.context.checkin.mealConstraint, null, "free text is not promoted into a structured digestive or food-safety finding");
    assert.equal(result.context.recoveryConcern, false);
    assert.deepEqual(state, before);
  });
}
