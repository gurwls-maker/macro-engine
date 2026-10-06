"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../src/insights.js");
const Context = require("../src/coach-context.js");
const Coach = require("../src/coach.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");
const end = "2026-10-04";
const scenarios = Fixtures.buildScenarios({ suite: "core", richActivity: true });
const input = id => Fixtures.asOf(scenarios.find(row => row.id === id), end, { richActivity: true });
const connection = (state, kind) => I.coachingConnections(state, end).connections.find(row => row.kind === kind);

for (const constraint of ["견과류와 생선에 알레르기가 있어 피한다.", "채식해서 동물성 식품을 먹지 않는다.",
  "신념에 따라 육류를 제외한다.", "유제품과 밀 식품을 먹으면 소화가 불편하다."]) {
  for (const recovering of [false, true]) test(`linked food actions keep actual familiar sources without certifying free-text constraints: ${constraint}/${recovering}`, () => {
    const state = input("cross-method-conflict");
    state.training.memory.constraints = constraint;
    for (const day of Object.values(state.days).filter(day => day.complete && day.planSnapshot?.status === "ready")) {
      day.meals = [{ id: `low-${day.date}`, name: "실제 식사", protein: 15, carbs: 30, fat: 5, alcoholG: 0, otherKcal: 0 }];
    }
    if (recovering) state.days[end].coachCheckin = { energy: null, hunger: null, sleep: null, illness: "recovering" };
    const before = structuredClone(state), rows = I.coachingConnections(state, end).connections;
    for (const kind of ["protein-distribution", "carb-fueling"]) {
      const row = rows.find(value => value.kind === kind);
      assert.ok(row, `${kind} remains actionable`);
      assert.match(row.body, /문제없이 먹어 온.*공급원/);
      assert.doesNotMatch(row.body, /달걀|두부|생선|고기|유제품|밥·빵|견과류|알레르기.*안전/);
      assert.equal(row.diagnostic, false);
      assert.ok(row.observations.length >= 3);
    }
    const day = Object.values(state.days).find(value => value.complete && value.planSnapshot?.status === "ready");
    const protein = I.dailyGuidance(day.planSnapshot, day).find(row => row.id === "protein");
    assert.ok(protein); assert.match(protein.body, /문제없이 먹어 온 단백질 공급원/);
    assert.deepEqual(state, before);
  });
}

test("small estimated macro-boundary differences are not turned into a repeated fueling intervention", () => {
  const state = input("cross-method-conflict"), result = I.coachingConnections(state, end);
  assert.ok(Object.values(state.days).filter(day => day.complete).length >= 3);
  assert.equal(result.connections.some(row => row.kind === "carb-fueling"), false);
  assert.equal(result.connections.some(row => row.kind === "protein-distribution"), false);
  for (const day of Object.values(state.days).filter(day => day.complete && day.planSnapshot?.status === "ready")) {
    day.meals = [{ id: `material-${day.date}`, name: "실제 식사", protein: 15, carbs: 30, fat: 5, alcoholG: 0, otherKcal: 0 }];
  }
  const low = I.coachingConnections(state, end).connections;
  assert.ok(low.some(row => row.kind === "carb-fueling")); assert.ok(low.some(row => row.kind === "protein-distribution"));
  assert.ok(low.some(row => row.kind === "fuel-recovery"));
  assert.ok(low.every(row => !row.diagnostic && row.basis === "product-choice"));
});

test("partial food supports a next meal without being a deficient complete day or a cause of poor training", () => {
  const state = input("cross-both-partial"), result = I.coachingConnections(state, end);
  assert.ok(result.partialMealDays > 0); assert.ok(!result.connections.some(row => row.kind === "partial-meal"), "no food is recorded on the selected final day");
  const selected = I.coachingConnections(state, "2026-10-03");
  assert.ok(selected.connections.some(row => row.kind === "partial-meal"));
  assert.ok(!result.connections.some(row => ["fuel-recovery", "carb-fueling", "protein-distribution"].includes(row.kind)));
  assert.ok(!JSON.stringify(result.connections).includes("때문에 수행이"));
});

test("unrecorded food and body measurements stay absent rather than becoming a prerequisite or zero intake", () => {
  const state = input("cross-training-only"), before = structuredClone(state), result = I.coachingConnections(state, end);
  assert.equal(result.completeMealDays, 0); assert.equal(result.partialMealDays, 0);
  assert.ok(!result.connections.some(row => /fuel|protein|carb|meal/.test(row.kind)));
  assert.deepEqual(state, before);
});

test("completed food with no stored target remains completed coverage without manufacturing a target comparison", () => {
  const state = input("cross-food-only");
  Object.values(state.days).forEach(day => { day.planSnapshot = null; });
  const result = I.coachingConnections(state, end);
  assert.equal(result.completeMealDays, 28); assert.equal(result.comparableTargetDays, 0);
  assert.ok(!result.connections.some(row => /fuel|protein|carb/.test(row.kind)));
});

test("food-only coaching stays on food and weight tasks even when older activity is preserved", () => {
  const state = input("cross-food-only");
  state.days["2026-09-07"].sessions = [{ id: "older-ride", sport: "cycling", durationMin: 40, intensity: "moderate" }];
  const row = connection(state, "weight-training");
  assert.ok(row); assert.equal(row.title, "체중 흐름과 식사 함께 보기");
  assert.doesNotMatch(row.body, /운동 반응|실제 운동 수행|수행과 허기/);
});

test("sustained rapid weight gain offers a concrete food review rather than escalating a surplus or calculating muscle", () => {
  const state = input("cross-surplus-fast-weight"), before = structuredClone(state), row = connection(state, "weight-training");
  assert.ok(row.observations[0].fastGainReview); assert.match(row.body, /식사량을 더 올리지/);
  assert.match(row.body, /추가분을 조금 줄이는 선택/); assert.match(row.body, /전부 근육으로 계산하지/);
  assert.equal(row.observations[0].followUpStage, "current-food-review");
  assert.ok(row.sources.some(source => source.date === "2026-09-07"));
  assert.deepEqual(state, before);
});

test("old paired profile measurement is a dated observation, not a newly paired current body composition", () => {
  const state = input("cross-old-paired-bia"), initial = Context.build(state, end);
  assert.equal(initial.body.calculationReference.usable, false);
  assert.ok(!connection(state, "body-training"), "one old observation alone is not a change");
  Object.assign(state.days[end], { weightKg: 78, bodyFatPct: 19, bodyFatMethod: "bia" });
  const before = structuredClone(state), result = I.coachingConnections(state, end);
  const row = result.connections.find(value => value.kind === "body-training");
  assert.ok(row); assert.ok(row.sources.some(source => source.kind === "profile-body-measurement"));
  assert.equal(row.observations[0].before.weightKg, state.profile.bodyFatWeightKg);
  assert.deepEqual(state, before);
});

test("same-date disagreeing profile and day body measurements are visible but not used as a fabricated change", () => {
  const state = input("cross-stable-paired-bia"), selected = state.days[end];
  Object.assign(selected, { weightKg: 78, bodyFatPct: 20, bodyFatMethod: "bia" });
  Object.assign(state.profile, { bodyFatDate: end, bodyFatWeightKg: selected.weightKg + 2,
    bodyFatPct: selected.bodyFatPct + 3, bodyFatMethod: selected.bodyFatMethod });
  const before = structuredClone(state), result = I.coachingConnections(state, end);
  const warning = result.connections.find(row => row.kind === "body-source-check");
  assert.ok(warning); assert.equal(warning.sources.length, 2);
  assert.equal(warning.observations[0].profile.weightKg, selected.weightKg + 2);
  assert.equal(warning.observations[0].day.weightKg, selected.weightKg);
  assert.ok(!result.connections.filter(row => row.kind === "body-training").some(row => row.sources.some(source => source.date === end)));
  assert.deepEqual(state, before);
});

test("body-method changes and short-term water changes remain separate observed tasks, never growth calculations", () => {
  const method = connection(input("cross-method-conflict"), "body-method-change");
  assert.ok(method); assert.match(method.body, /같은 방법/);
  const waterState = input("cross-water-change");
  const water = I.coachingConnections(waterState, "2026-09-18").connections.find(row => row.kind === "weight-fluctuation");
  assert.ok(water); assert.match(water.body, /비슷한 시간·수분 상태/);
  assert.match(water.body, /근육·지방이 그만큼 바뀌었다/);
  assert.ok(!connection(waterState, "weight-fluctuation"), "a past transient episode is not reported as an ongoing abrupt change");
});

test("changed goals preserve completed targets and no repeated connection rewrites the stored state", () => {
  const state = input("cross-goal-history"), before = structuredClone(state);
  const first = I.coachingConnections(state, end), second = I.coachingConnections(state, end);
  assert.equal(first.goalCount, 2); assert.deepEqual(first, second); assert.deepEqual(state, before);
  const context = Context.build(state, end);
  assert.equal(context.scope.nutritionEnabled, true);
  assert.deepEqual(state, before);
});

test("native linked topics retain every available meal/body connection and the trend answer offers the actual rapid-gain action", () => {
  const state = input("cross-surplus-fast-weight"), before = structuredClone(state), decision = Context.build(state, end);
  const coach = Coach.buildCoach(state.profile, state.days[end], state.days, { state, decisionContext: decision, training: state.training });
  const body = decision.activity.connections.find(row => row.kind === "weight-training");
  assert.ok(body.observations[0].fastGainReview);
  for (const row of decision.activity.connections) assert.ok(coach.questions.some(question => question.id === `linked-${row.kind}` && question.answer === row.body));
  assert.equal(coach.questions.find(row => row.id === "trend").answer, body.body);
  assert.ok(coach.priorities.some(row => row.id === "linked-weight-training"));
  assert.deepEqual(state, before);
});

test("daily guidance and historical coach comparisons share the substantial protein gap boundary without turning missing values into zero", () => {
  assert.equal(I.meaningfulMacroGap(null, 100), false); assert.equal(I.meaningfulMacroGap(0, null), false);
  assert.equal(I.meaningfulMacroGap(98, 100), false); assert.equal(I.meaningfulMacroGap(89, 100), true);
  assert.equal(I.meaningfulMacroGap(24, 30, 5), true); assert.equal(I.meaningfulMacroGap(28, 30, 5), false);
  const state = input("cross-method-conflict");
  for (const day of Object.values(state.days).filter(day => day.planSnapshot?.status === "ready")) {
    const plan = day.planSnapshot;
    day.meals = [{ id: `near-${day.date}`, name: "실제 식사", protein: plan.macros.protein.min - 2,
      carbs: plan.macros.carbs.target, fat: plan.macros.fat.target, alcoholG: 0, otherKcal: 0 }];
    assert.ok(!I.dailyGuidance(plan, day).some(row => row.id === "protein"));
  }
  const coach = Coach.buildCoach(state.profile, state.days[end], state.days, { state });
  assert.equal(coach.context.recent.lowProteinDays, 0);
});

function bodyPair(priorDate, beforeBody, afterBody) {
  const state = weightState([priorDate], [end], 70, 70, "performance");
  for (const [date, values] of [[priorDate, beforeBody], [end, afterBody]])
    Object.assign(state.days[date], { bodyFatMethod: "bia", bodyFatPct: null, skeletalMuscleKg: null, ...values });
  return state;
}

for (const scenario of [
  { name: "unchanged fat and muscle", before: { bodyFatPct: 20, skeletalMuscleKg: 30 }, after: { bodyFatPct: 20, skeletalMuscleKg: 30 },
    expected: [/체지방률은 20%로 같아요/, /골격근량은 30kg으로 같아요/], changed: false },
  { name: "only muscle differs", before: { bodyFatPct: 20, skeletalMuscleKg: 30 }, after: { bodyFatPct: 20, skeletalMuscleKg: 31 },
    expected: [/체지방률은 20%로 같아요/, /골격근량은 30kg에서 31kg으로 기록됐어요/], changed: true },
  { name: "only body fat differs", before: { bodyFatPct: 20, skeletalMuscleKg: 30 }, after: { bodyFatPct: 19, skeletalMuscleKg: 30 },
    expected: [/체지방률은 20%에서 19%로 기록됐어요/, /골격근량은 30kg으로 같아요/], changed: true },
  { name: "both measurements differ", before: { bodyFatPct: 20, skeletalMuscleKg: 30 }, after: { bodyFatPct: 19, skeletalMuscleKg: 31 },
    expected: [/체지방률은 20%에서 19%로 기록됐어요/, /골격근량은 30kg에서 31kg으로 기록됐어요/], changed: true }
]) test(`body coaching describes ${scenario.name} without inventing a change in the unchanged metric`, () => {
  const state = bodyPair("2026-09-27", scenario.before, scenario.after), before = structuredClone(state), row = connection(state, "body-training");
  assert.ok(row); scenario.expected.forEach(pattern => assert.match(row.body, pattern));
  assert.equal(row.body.includes("수치가 바뀐 항목"), scenario.changed);
  assert.doesNotMatch(row.body, /\d{2}와|%으로|짧은 간격의 변화|근육이 늘었|지방이 줄었/);
  assert.deepEqual(row.sources.map(source => source.date), ["2026-09-27", end]);
  assert.equal(row.observations[0].before.bodyFatPct, scenario.before.bodyFatPct);
  assert.equal(row.observations[0].after.skeletalMuscleKg, scenario.after.skeletalMuscleKg);
  assert.deepEqual(state, before);
});

for (const scenario of [
  { date: "2026-09-21", elapsed: 13, short: true },
  { date: "2026-09-20", elapsed: 14, short: false }
]) test(`body ${scenario.elapsed}-day follow-up preserves numbers without treating the interval as a growth diagnosis`, () => {
  const row = connection(bodyPair(scenario.date, { bodyFatPct: 20 }, { bodyFatPct: 19 }), "body-training");
  assert.equal(row.body.includes("수치가 바뀐 항목"), scenario.short);
  assert.match(row.body, /체지방률은 20%에서 19%로 기록됐어요/);
  assert.doesNotMatch(row.body, /골격근량|근성장|성장률|지방이 줄었/);
  assert.equal(row.observations[0].method, "bia");
});

test("a sole comparable muscle measurement is not given a fabricated body fat observation", () => {
  const row = connection(bodyPair("2026-09-27", { skeletalMuscleKg: 30 }, { skeletalMuscleKg: 30 }), "body-training");
  assert.match(row.body, /골격근량은 30kg으로 같아요/);
  assert.doesNotMatch(row.body, /체지방률|수치가 바뀐 항목/);
  assert.equal(row.observations[0].before.bodyFatPct, null);
});

test("weekly weight aggregates retain the actual measurement period rather than the selected day as a measurement date", () => {
  const state = weightState(["2026-09-21", "2026-09-23", "2026-09-24"], ["2026-09-28", "2026-09-30", "2026-10-02"], 70, 70.4);
  const observation = connection(state, "weight-training").observations[0];
  assert.equal(observation.from, "2026-09-21"); assert.equal(observation.to, "2026-10-02");
  assert.deepEqual(observation.earlierDates, ["2026-09-21", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(observation.laterDates, ["2026-09-28", "2026-09-30", "2026-10-02"]);
  assert.ok(!connection(state, "weight-training").sources.some(source => source.date === end));
});

test("history weight metadata identifies its actual caller-supplied window without replacing the historical scalar", () => {
  const date = "2026-09-18", state = Fixtures.asOf(scenarios.find(row => row.id === "cross-surplus-fast-weight"), date, { richActivity: true });
  const before = structuredClone(state), history = Object.values(state.days).filter(day => day.date < date);
  const summary = I.historySummary(history, date, state.profile.goal), current = I.coachingConnections(state, date).connections.find(row => row.kind === "weight-training").observations[0];
  assert.equal(summary.weightChangeSource.from, "2026-09-07"); assert.equal(summary.weightChangeSource.to, "2026-09-17");
  assert.deepEqual(summary.weightChangeSource.earlierDates, ["2026-09-07", "2026-09-09", "2026-09-10", "2026-09-11"]);
  assert.deepEqual(summary.weightChangeSource.laterDates, ["2026-09-14", "2026-09-16", "2026-09-17"]);
  assert.equal(summary.weightChangeSource.intervalDays, 6.5);
  assert.ok(Math.abs(summary.weeklyChange - 1.2 * 7 / 6.5) < 1e-10);
  assert.ok(Math.abs(current.weeklyChangeKg - 1.2) < 1e-10);
  assert.equal(current.to, date); assert.notEqual(summary.weeklyChange, current.weeklyChangeKg);
  assert.deepEqual(state, before);
});

test("insufficient history retains real date arrays and unknown comparison endpoints without fabricating a rate", () => {
  for (const scenario of [
    { dates: [], source: { from: null, to: null, earlierDates: [], laterDates: [], intervalDays: null } },
    { dates: ["2026-09-23"], source: { from: "2026-09-23", to: null, earlierDates: ["2026-09-23"], laterDates: [], intervalDays: null } },
    { dates: ["2026-10-02"], source: { from: null, to: "2026-10-02", earlierDates: [], laterDates: ["2026-10-02"], intervalDays: null } },
    { dates: ["2026-09-23", "2026-10-02"], source: { from: "2026-09-23", to: "2026-10-02", earlierDates: ["2026-09-23"], laterDates: ["2026-10-02"], intervalDays: null } }
  ]) {
    const days = scenario.dates.map(date => ({ date, weightKg: 70, meals: [], complete: false })), before = structuredClone(days);
    const result = I.historySummary(days, end, "maintain");
    assert.equal(result.weeklyChange, null); assert.deepEqual(result.weightChangeSource, scenario.source);
    assert.deepEqual(days, before);
  }
});

function weightState(earlierDates, laterDates, beforeKg, afterKg, goal = "gain") {
  const rows = [...earlierDates.map(date => ({ date, weightKg: beforeKg })), ...laterDates.map(date => ({ date, weightKg: afterKg }))];
  return { profile: { age: 30, healthContext: "general", goal }, trackingScope: "nutrition", training: { records: [] },
    days: Object.fromEntries(rows.map(row => [row.date, { ...row, meals: [], sessions: [], complete: false }])) };
}
const nearEarlier = ["2026-09-25", "2026-09-26", "2026-09-27"], nearLater = ["2026-09-28", "2026-09-29", "2026-09-30"];
const fiveEarlier = ["2026-09-23", "2026-09-24", "2026-09-25"], fiveLater = nearLater;
const farEarlier = ["2026-09-21", "2026-09-22", "2026-09-23"], farLater = ["2026-10-02", "2026-10-03", end];
function saveGoal(day, goal) {
  day.complete = true;
  day.meals = [{ id: "meal-" + day.date, name: "합성 식사", protein: 150, carbs: 300, fat: 70, otherKcal: 0, alcoholG: 0 }];
  day.planSnapshot = { status: "ready", energy: { targetKcal: 2500 }, macros: {
    protein: { min: 100, target: 150, max: 200 }, carbs: { min: 200, target: 300, max: 400 }, fat: { min: 50, target: 70, max: 90 }
  }, context: { goal } };
}

test("three-day clustered measurements preserve the observed difference without inventing a weekly rate or food reduction", () => {
  for (const [goal, laterWeight] of [["gain", 80.6], ["lose", 79]]) {
    const state = weightState(nearEarlier, nearLater, 80, laterWeight, goal), original = structuredClone(state);
    const row = connection(state, "weight-training"), observation = row.observations[0];
    assert.equal(observation.intervalDays, 3); assert.equal(observation.weeklyChangeKg, null);
    assert.equal(observation.weeklyChangePct, null); assert.equal(observation.rateComparable, false);
    assert.equal(observation.fastGainReview, false); assert.equal(observation.fastLossReview, false);
    assert.ok(Math.abs(observation.differenceKg - (laterWeight - 80)) < 1e-12);
    assert.match(row.body, /평소 끼니를 이어가며.*다음 체중을 확인/);
    assert.doesNotMatch(row.body, /주당 약|추가분을 조금 줄|감량 목표를 더 완만/);
    assert.equal(I.historySummary(state.days, end, goal).weeklyChange, null);
    assert.deepEqual(state, original);
  }
});

test("longer representative intervals normalize the same raw gain instead of labeling a slower two-week gain fast", () => {
  const state = weightState(farEarlier, farLater, 80, 80.6), original = structuredClone(state), row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.intervalDays, 11);
  assert.ok(Math.abs(value.differenceKg - 0.6) < 1e-12);
  assert.ok(Math.abs(value.weeklyChangeKg - 0.6 * 7 / 11) < 1e-12);
  assert.ok(Math.abs(value.weeklyChangePct - (0.6 * 7 / 11 / 80 * 100)) < 1e-12);
  assert.equal(value.fastGainReview, false);
  assert.match(row.body, /주당 약 \+0\.38kg/);
  assert.doesNotMatch(row.body, /추가분을 조금 줄이는/);
  assert.equal(I.historySummary(state.days, end, "gain").weeklyChange, value.weeklyChangeKg);
  assert.deepEqual(value.earlierDates, farEarlier); assert.deepEqual(value.laterDates, farLater);
  assert.deepEqual(row.sources.map(source => source.date), [...farEarlier, ...farLater]);
  assert.deepEqual(state, original);
});

test("five-day measurements use the same seven-day rate as history rather than underestimating current gain or loss", () => {
  for (const [goal, beforeWeight, laterWeight, expected] of [["gain", 80, 80.3, "fastGainReview"], ["lose", 80, 79.4, "fastLossReview"]]) {
    const state = weightState(fiveEarlier, fiveLater, beforeWeight, laterWeight, goal), row = connection(state, "weight-training"), value = row.observations[0];
    assert.equal(value.intervalDays, 5); assert.equal(value[expected], true);
    assert.equal(value.weeklyChangeKg, I.historySummary(state.days, end, goal).weeklyChange);
    assert.ok(Math.abs(value.weeklyChangeKg - (laterWeight - beforeWeight) * 7 / 5) < 1e-12);
  }
});

test("review-rate boundaries remain numerical product choices rather than turning decimal rounding into inconsistent decisions", () => {
  const earlier = ["2026-09-21", "2026-09-22", "2026-09-23"], later = ["2026-09-28", "2026-09-29", "2026-09-30"];
  for (const [goal, after, property, expected] of [["gain", 70.35, "fastGainReview", true], ["gain", 70.349, "fastGainReview", false],
    ["lose", 69.3, "fastLossReview", true], ["lose", 69.301, "fastLossReview", false]]) {
    const row = connection(weightState(earlier, later, 70, after, goal), "weight-training");
    assert.equal(row.observations[0][property], expected, goal + " " + after);
    assert.equal(row.basis, "product-choice"); assert.equal(row.diagnostic, false);
    assert.doesNotMatch(row.body, /근육이.*늘었|지방이.*줄었|진단|안전한 감량률/);
  }
});

test("even measurement counts retain a half-day representative interval without rounding its weekly normalization", () => {
  const earlier = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25"], later = ["2026-09-28", "2026-09-29", "2026-10-01"];
  const state = weightState(earlier, later, 80, 80.4), value = connection(state, "weight-training").observations[0];
  assert.equal(value.intervalDays, 6.5);
  assert.equal(value.weeklyChangeKg, I.historySummary(state.days, end, "gain").weeklyChange);
  assert.ok(Math.abs(value.weeklyChangeKg - 0.4 * 7 / 6.5) < 1e-12);
});

test("a current goal cannot apply its gain or loss review to measurements under a different stored goal", () => {
  const earlier = ["2026-09-21", "2026-09-22", "2026-09-23"], later = ["2026-09-28", "2026-09-29", "2026-09-30"];
  for (const [goal, oldGoal, after] of [["gain", "maintain", 80.6], ["lose", "gain", 79]]) {
    const state = weightState(earlier, later, 80, after, goal);
    for (const day of Object.values(state.days)) saveGoal(day, day.date < "2026-09-28" ? oldGoal : goal);
    const original = structuredClone(state), row = connection(state, "weight-training"), value = row.observations[0];
    assert.equal(value.goal, goal); assert.equal(value.goalContextMismatch, true);
    assert.equal(value.fastGainReview, false); assert.equal(value.fastLossReview, false);
    assert.equal(value.observedGoals.length, 6);
    assert.match(row.body, /저장한 목표와 현재 목표가 달라/);
    assert.doesNotMatch(row.body, /추가분을 조금 줄|감량 목표를 더 완만/);
    assert.ok(row.sources.some(source => source.kind === "completed-meals-and-saved-target"));
    assert.deepEqual(state, original);
  }
});

test("a profile goal changed after all measured snapshots stays distinct without inventing its start date", () => {
  const state = weightState(fiveEarlier, fiveLater, 80, 80.5);
  for (const day of Object.values(state.days)) saveGoal(day, "lose");
  const row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.goalContextMismatch, true); assert.equal(value.fastGainReview, false);
  assert.deepEqual(new Set(value.observedGoals.map(row => row.goal)), new Set(["lose"]));
  assert.doesNotMatch(row.body, /2026-10-04부터 증량|9월.*증량 시작|추가분을 조금 줄/);
});

test("an old different goal outside the actual comparison period does not indefinitely suppress a current comparable review", () => {
  const state = weightState(fiveEarlier, fiveLater, 80, 80.3);
  for (const day of Object.values(state.days)) saveGoal(day, "gain");
  state.days["2026-09-10"] = { date: "2026-09-10", meals: [], sessions: [] }; saveGoal(state.days["2026-09-10"], "lose");
  const result = I.coachingConnections(state, end), row = result.connections.find(row => row.kind === "weight-training");
  assert.equal(result.goalCount, 2); assert.equal(row.observations[0].goalContextMismatch, false);
  assert.equal(row.observations[0].fastGainReview, true);
  assert.ok(row.observations[0].observedGoals.every(value => value.goal === "gain"));
});

test("a recent short change is still visible after a matching later weight instead of prompting a conflicting food reduction", () => {
  const state = weightState(farEarlier, ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"], 80, 82);
  state.days["2026-09-29"].weightKg = 80;
  const original = structuredClone(state), rows = I.coachingConnections(state, end).connections;
  const trend = rows.find(row => row.kind === "weight-training"), short = rows.find(row => row.kind === "weight-fluctuation");
  assert.equal(trend.observations[0].aboveGainReviewRate, true); assert.equal(trend.observations[0].fastGainReview, false);
  assert.deepEqual(trend.observations[0].recentShortChange, { from: "2026-09-29", to: "2026-09-30", beforeKg: 80, afterKg: 82, elapsedDays: 1 });
  assert.match(trend.body, /평소 끼니를 이어가며/); assert.doesNotMatch(trend.body, /추가분을 조금 줄/);
  assert.ok(short); assert.equal(short.observations[0].latestRecorded.date, "2026-10-02");
  assert.equal(short.observations[0].latestRecorded.weightKg, 82);
  assert.deepEqual(short.sources.map(source => source.date), ["2026-09-29", "2026-09-30", "2026-10-02"]);
  assert.deepEqual(state, original);
});

test("an older temporary shift cannot keep blocking a later gradual weight review", () => {
  const state = weightState(farEarlier, farLater, 80, 80.7);
  state.days["2026-09-10"] = { date: "2026-09-10", weightKg: 82, meals: [], sessions: [] };
  state.days["2026-09-11"] = { date: "2026-09-11", weightKg: 80, meals: [], sessions: [] };
  const rows = I.coachingConnections(state, end).connections, trend = rows.find(row => row.kind === "weight-training");
  assert.equal(trend.observations[0].recentShortChange, null); assert.equal(trend.observations[0].fastGainReview, true);
  assert.ok(!rows.some(row => row.kind === "weight-fluctuation"));
});

test("a change of body-composition method does not invent a change of weight scale or combine body-fat measurements", () => {
  const state = weightState(fiveEarlier, fiveLater, 80, 80.3), plain = connection(state, "weight-training").observations[0];
  Object.assign(state.days[fiveEarlier[0]], { bodyFatPct: 20, bodyFatMethod: "bia" });
  Object.assign(state.days[fiveLater.at(-1)], { bodyFatPct: 17, bodyFatMethod: "dxa" });
  const original = structuredClone(state), rows = I.coachingConnections(state, end).connections, value = rows.find(row => row.kind === "weight-training").observations[0];
  assert.equal(value.weeklyChangeKg, plain.weeklyChangeKg); assert.equal(value.fastGainReview, true);
  assert.ok(rows.some(row => row.kind === "body-method-change"));
  assert.ok(!rows.some(row => row.kind === "body-training"));
  assert.ok(!JSON.stringify(rows).includes("지방 3% 감소"));
  assert.deepEqual(state, original);
});

test("current symptoms and individual-care scope remain stronger than an observed fast weight rate", () => {
  const state = weightState(fiveEarlier, fiveLater, 80, 79.4, "lose");
  state.days[end] = { date: end, meals: [], sessions: [], coachCheckin: { performance: "down", energy: "low" } };
  const row = connection(state, "weight-training");
  assert.match(row.body, /알려준 컨디션도 떨어졌으니.*평소 식사·수면/);
  assert.doesNotMatch(row.body, /추가분을 조금 줄/);
  const clinical = weightState(fiveEarlier, fiveLater, 80, 80.5);
  clinical.profile.healthContext = "treatment";
  const care = connection(clinical, "weight-training");
  assert.equal(care.observations[0].aboveGainReviewRate, true); assert.equal(care.observations[0].fastGainReview, false);
  assert.match(care.body, /개별 지침 안에서/); assert.doesNotMatch(care.body, /추가분을 조금 줄/);
});

test("duplicate dates, conflicting copies and invalid dates cannot fabricate three independent weekly measurements", () => {
  for (const variant of ["duplicate", "conflict", "invalid"]) {
    const state = weightState(["2026-09-24"], farLater, 80, 80.6);
    if (variant === "duplicate") {
      state.days.copy1 = structuredClone(state.days["2026-09-24"]); state.days.copy2 = structuredClone(state.days["2026-09-24"]);
    } else if (variant === "conflict") {
      state.days["2026-09-23"] = { date: "2026-09-23", weightKg: 80, meals: [], sessions: [] };
      state.days["2026-09-25"] = { date: "2026-09-25", weightKg: 80, meals: [], sessions: [] };
      state.days.copy = { date: "2026-09-24", weightKg: 90, meals: [], sessions: [] };
    } else {
      state.days["2026-09-23"] = { date: "2026-09-23", weightKg: 80, meals: [], sessions: [] };
      state.days.invalid = { date: "2026-09-25x", weightKg: 80, meals: [], sessions: [] };
    }
    const original = structuredClone(state);
    assert.equal(connection(state, "weight-training"), undefined, variant);
    assert.equal(I.historySummary(state.days, end, "gain").weeklyChange, null, variant);
    assert.deepEqual(state, original);
  }
});

test("future weight measurements never alter the actual period's normalized rate or current action", () => {
  const state = weightState(fiveEarlier, fiveLater, 80, 80.3), original = I.coachingConnections(state, end);
  state.days["2026-10-05"] = { date: "2026-10-05", weightKg: 90, meals: [], sessions: [], complete: false };
  assert.deepEqual(I.coachingConnections(state, end), original);
});

test("optional absolute macro margins reject missing, nonnumeric and negative values without coercing them to zero", () => {
  for (const margin of [null, "5", NaN, Infinity, -1, false, {}]) assert.equal(I.meaningfulMacroGap(0, 100, margin), false);
  assert.equal(I.meaningfulMacroGap(89, 100), true);
  assert.equal(I.meaningfulMacroGap(24, 30, 5), true); assert.equal(I.meaningfulMacroGap(26, 30, 5), false);
  assert.equal(I.meaningfulMacroGap(24, 30, 0), true);
});

const monthWindows = [
  ["2026-09-07", "2026-09-09", "2026-09-11"], ["2026-09-14", "2026-09-16", "2026-09-18"],
  ["2026-09-21", "2026-09-23", "2026-09-25"], ["2026-09-28", "2026-09-30", "2026-10-02"]
];
function monthlyWeightState(values = [80, 80.6, 80.6, 81.2], goal = "gain", windows = monthWindows) {
  const state = weightState(windows[2], windows[3], values[2], values[3], goal);
  Object.assign(state.days, weightState(windows[0], windows[1], values[0], values[1], goal).days);
  return state;
}
function checkin(state, date, values) {
  state.days[date] ||= { date, meals: [], sessions: [] };
  state.days[date].coachCheckin = values;
}

test("two disjoint actual comparisons advance a repeated gain observation to a current food review with dated source quantities", () => {
  const state = monthlyWeightState(), original = structuredClone(state), row = connection(state, "weight-training"), observation = row.observations[0];
  const trend = observation.repeatedWeightTrend;
  assert.equal(trend.kind, "fast-gain"); assert.equal(trend.independentComparisonCount, 2);
  assert.equal(trend.scope, "non-overlapping-recorded-comparisons-28-days");
  assert.equal(observation.followUpStage, "current-food-review");
  assert.deepEqual(trend.comparisons.map(value => [value.from, value.to, value.intervalDays]),
    [["2026-09-07", "2026-09-18", 7], ["2026-09-21", "2026-10-02", 7]]);
  trend.comparisons.forEach((value, index) => {
    assert.deepEqual(value.earlierDates, monthWindows[index * 2]); assert.deepEqual(value.laterDates, monthWindows[index * 2 + 1]);
    assert.ok(Math.abs(value.weeklyChangeKg - 0.6) < 1e-10);
  });
  const dates = trend.comparisons.flatMap(value => [...value.earlierDates, ...value.laterDates]);
  assert.equal(new Set(dates).size, 12); assert.deepEqual(row.sources.map(value => value.date), dates);
  assert.match(row.body, /2026-09-07~2026-09-18.*80\.0kg에서 80\.6kg/);
  assert.match(row.body, /최근 더한 식사·간식이 있다면 그 추가분을 조금 줄이는 선택/);
  assert.doesNotMatch(row.body, /이 흐름이 계속되면|매일|근육이.*늘었|\d+kcal.*줄/);
  assert.deepEqual(state, original);
});

test("three populated windows cannot double-count two overlapping comparisons as persistent change", () => {
  const state = monthlyWeightState(); monthWindows[0].forEach(date => { delete state.days[date]; });
  const row = connection(state, "weight-training");
  assert.equal(row.observations[0].repeatedWeightTrend, null); assert.equal(row.observations[0].followUpStage, "repeat-measurement");
  assert.match(row.body, /이 흐름이 계속되면/);
});

for (const variant of ["thin", "duplicate", "conflicting", "invalid", "clustered"]) test(`the earlier independent comparison must contain actual sufficient spaced observations: ${variant}`, () => {
  const state = monthlyWeightState();
  if (variant === "thin") delete state.days[monthWindows[0][2]];
  if (variant === "duplicate") { delete state.days[monthWindows[0][2]]; state.days.copy = structuredClone(state.days[monthWindows[0][0]]); }
  if (variant === "conflicting") state.days.copy = { ...state.days[monthWindows[0][1]], weightKg: 90 };
  if (variant === "invalid") { delete state.days[monthWindows[0][2]]; state.days.invalid = { date: "2026-09-11x", weightKg: 80 }; }
  if (variant === "clustered") {
    [...monthWindows[0], ...monthWindows[1]].forEach(date => { delete state.days[date]; });
    Object.assign(state.days, weightState(["2026-09-11", "2026-09-12", "2026-09-13"], ["2026-09-14", "2026-09-15", "2026-09-16"], 80, 80.6).days);
  }
  const original = structuredClone(state), row = connection(state, "weight-training");
  assert.equal(row.observations[0].repeatedWeightTrend, null); assert.equal(row.observations[0].followUpStage, "repeat-measurement");
  assert.deepEqual(state, original);
});

test("a longer first measurement interval cannot turn two raw gains into two fast normalized gains", () => {
  const windows = [["2026-09-07", "2026-09-08", "2026-09-09"], ["2026-09-18", "2026-09-19", "2026-09-20"], ...monthWindows.slice(2)];
  const state = monthlyWeightState(undefined, "gain", windows), row = connection(state, "weight-training");
  assert.equal(row.observations[0].fastGainReview, true); assert.equal(row.observations[0].repeatedWeightTrend, null);
  assert.equal(row.observations[0].followUpStage, "repeat-measurement");
});

for (const values of [[80, 80.2, 80.6, 81.2], [81, 80.6, 80.6, 81.2]]) test(`ordinary or opposing earlier movement remains a single current comparison: ${values.join("-")}`, () => {
  const row = connection(monthlyWeightState(values), "weight-training");
  assert.equal(row.observations[0].repeatedWeightTrend, null); assert.equal(row.observations[0].followUpStage, "repeat-measurement");
});

test("rising comparisons separated by a real reversal preserve both observations without claiming continued rapid gain", () => {
  const state = monthlyWeightState([80, 80.6, 79.8, 80.4]), row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.repeatedWeightTrend.kind, "fast-gain");
  assert.equal(value.repeatedWeightTrend.betweenComparisons.directionCompatible, false);
  assert.ok(Math.abs(value.repeatedWeightTrend.betweenComparisons.differenceKg + 0.8) < 1e-10);
  assert.equal(value.followUpStage, "repeat-measurement"); assert.match(row.body, /두 비교 사이에는 체중이 반대 방향/);
  assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택/);
});

test("the intervening median comparison dates include every input measurement rather than pretending its median was known on the first later day", () => {
  const state = monthlyWeightState();
  state.days["2026-09-14"].weightKg = 80.4; state.days["2026-09-18"].weightKg = 80.8;
  state.days["2026-09-21"].weightKg = 80.4; state.days["2026-09-25"].weightKg = 80.8;
  const original = structuredClone(state), row = connection(state, "weight-training"), trend = row.observations[0].repeatedWeightTrend;
  assert.ok(trend); const middle = trend.betweenComparisons;
  assert.deepEqual(middle.earlierDates, monthWindows[1]); assert.deepEqual(middle.laterDates, monthWindows[2]);
  assert.equal(middle.from, "2026-09-14"); assert.equal(middle.to, "2026-09-25");
  assert.equal(middle.gapFrom, "2026-09-18"); assert.equal(middle.gapTo, "2026-09-21");
  assert.equal(middle.differenceKg, 0); assert.equal(row.observations[0].followUpStage, "current-food-review");
  assert.deepEqual(state, original);
});

for (const scope of ["nutrition", "training", "both"]) test(`missing food and historical goals do not block a current conditional weight action: ${scope}`, () => {
  const state = monthlyWeightState(); state.trackingScope = scope;
  if (scope !== "nutrition") state.training.records = [{ id: "recorded-training", date: "2026-10-02" }];
  const row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.repeatedWeightTrend.goalContext.sameGoalConfirmed, false);
  assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, false);
  assert.deepEqual(value.repeatedWeightTrend.goalContext.observedGoals, []);
  assert.equal(value.followUpStage, "current-food-review");
  assert.match(row.body, /지금 증량 목표에서는/); assert.match(row.body, /최근 더한 식사·간식이 있다면/);
  if (scope === "nutrition") assert.doesNotMatch(row.body, /실제 수행과|수행·회복/);
});

test("unknown or opposite current goals retain the repeated raw weight observation without inventing an old bulking intention", () => {
  for (const goal of [null, "lose", "maintain"]) {
    const state = monthlyWeightState(undefined, goal), row = connection(state, "weight-training"), value = row.observations[0];
    assert.equal(value.repeatedWeightTrend.kind, "fast-gain"); assert.equal(value.followUpStage, "repeat-measurement");
    assert.match(row.body, /두 기간의 같은 방향 변화가 반복/); assert.match(row.body, /지금 원하는 목표/);
    assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택|그때도 증량/);
  }
});

test("two independent rapid-loss comparisons give a current gentler-goal action, not another indefinite wait or numeric calorie change", () => {
  const state = monthlyWeightState([80, 79, 79, 78], "lose"), original = structuredClone(state), row = connection(state, "weight-training");
  const value = row.observations[0]; assert.equal(value.repeatedWeightTrend.kind, "fast-loss"); assert.equal(value.followUpStage, "current-food-review");
  assert.match(row.body, /2026-09-07~2026-09-18.*80\.0kg에서 79\.0kg/);
  assert.match(row.body, /식사를 더 줄이거나 운동을 더해 맞추지 말고 감량 목표를 더 완만/);
  assert.match(row.body, /최근 줄인 끼니나 추가한 활동이 있다면/);
  assert.doesNotMatch(row.body, /이 흐름이 계속되면|\d+kcal|지방이.*줄었/); assert.deepEqual(state, original);
});

test("a confirmed earlier goal switch preserves independent observations but prioritizes the present goal without an invented start date", () => {
  const state = monthlyWeightState();
  for (const day of Object.values(state.days)) saveGoal(day, day.date <= "2026-09-18" ? "lose" : "gain");
  const original = structuredClone(state), row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.goalContextMismatch, false); assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, true);
  assert.equal(value.followUpStage, "current-goal-follow-up"); assert.match(row.body, /저장한 목표와 현재 목표가 달라/);
  assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택|9월.*증량 시작/); assert.deepEqual(state, original);
});

test("saved completed goal context does not require an accompanying food log, and older out-of-period goals do not permanently block follow-up", () => {
  const state = monthlyWeightState();
  for (const day of Object.values(state.days)) { saveGoal(day, "gain"); day.meals = []; }
  state.days["2026-09-06"] = { date: "2026-09-06", meals: [], sessions: [] }; saveGoal(state.days["2026-09-06"], "lose");
  const row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.repeatedWeightTrend.goalContext.sameGoalConfirmed, true);
  assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, false); assert.equal(value.followUpStage, "current-food-review");
  assert.ok(value.repeatedWeightTrend.goalContext.observedGoals.every(item => item.date >= "2026-09-07"));
  state.days["2026-09-09"].planSnapshot.context.goal = "lose";
  const changed = connection(state, "weight-training");
  assert.equal(changed.observations[0].followUpStage, "current-goal-follow-up");
  assert.ok(changed.sources.some(source => source.kind === "completed-day-saved-target" && source.date === "2026-09-09"));
});

for (const currentGoal of ["lose", "maintain", "gain", "recomp", "performance"])
  for (const historicalGoal of ["lose", "maintain", "gain", "recomp", "performance"])
    test(`all supported saved goals remain known in weight coaching: ${historicalGoal} -> ${currentGoal}`, () => {
      const values = currentGoal === "lose" ? [80, 79, 79, 78] : [80, 80.6, 80.6, 81.2];
      const state = monthlyWeightState(values, currentGoal);
      for (const day of Object.values(state.days)) saveGoal(day, historicalGoal);
      const original = structuredClone(state), row = connection(state, "weight-training"), value = row.observations[0];
      const goalContext = value.repeatedWeightTrend.goalContext;
      assert.equal(goalContext.observedGoals.length, 12);
      assert.ok(goalContext.observedGoals.every(item => item.goal === historicalGoal));
      assert.equal(goalContext.confirmedMismatch, historicalGoal !== currentGoal);
      assert.equal(goalContext.sameGoalConfirmed, historicalGoal === currentGoal);
      assert.equal(value.goalContextMismatch, historicalGoal !== currentGoal);
      const expected = historicalGoal !== currentGoal ? "current-goal-follow-up"
        : ["gain", "lose"].includes(currentGoal) ? "current-food-review" : "repeat-measurement";
      assert.equal(value.followUpStage, expected);
      if (historicalGoal !== currentGoal) {
        assert.match(row.body, /저장한 목표와 현재 목표가 달라/);
        assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택|감량 목표를 더 완만하게 잡는 선택/);
      }
      assert.deepEqual(state, original);
    });

test("a known recomp phase differs from missing targets and falls out of scope without permanently blocking the new goal", () => {
  const state = monthlyWeightState();
  monthWindows[0].forEach(date => saveGoal(state.days[date], "recomp"));
  let value = connection(state, "weight-training").observations[0];
  assert.equal(value.goalContextMismatch, false);
  assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, true);
  assert.equal(value.followUpStage, "current-goal-follow-up");
  monthWindows[0].forEach(date => { state.days[date].planSnapshot = null; });
  value = connection(state, "weight-training").observations[0];
  assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, false);
  assert.equal(value.followUpStage, "current-food-review");
  state.days["2026-09-06"] = { date: "2026-09-06", meals: [], sessions: [] };
  saveGoal(state.days["2026-09-06"], "recomp");
  assert.equal(connection(state, "weight-training").observations[0].followUpStage, "current-food-review");
});

for (const status of ["review", "incomplete"])
  for (const historicalGoal of ["lose", "maintain", "gain", "recomp", "performance"])
    for (const currentGoal of ["gain", "lose"])
      test(`a completed ${status} snapshot preserves its known ${historicalGoal} goal without inventing numbers for ${currentGoal}`, () => {
        const state = monthlyWeightState(currentGoal === "lose" ? [80, 79, 79, 78] : undefined, currentGoal);
        for (const day of Object.values(state.days)) {
          saveGoal(day, historicalGoal);
          day.planSnapshot = { status, context: { goal: historicalGoal }, energy: { targetKcal: null }, macros: {} };
        }
        const original = structuredClone(state), result = I.coachingConnections(state, end);
        const row = result.connections.find(value => value.kind === "weight-training"), value = row.observations[0];
        assert.equal(result.comparableTargetDays, 0);
        assert.ok(!result.connections.some(item => ["fuel-recovery", "protein-distribution", "carb-fueling"].includes(item.kind)));
        assert.equal(value.repeatedWeightTrend.goalContext.observedGoals.length, 12);
        assert.equal(value.repeatedWeightTrend.goalContext.confirmedMismatch, historicalGoal !== currentGoal);
        assert.equal(value.followUpStage, historicalGoal === currentGoal ? "current-food-review" : "current-goal-follow-up");
        if (historicalGoal !== currentGoal) {
          assert.match(row.body, /저장한 목표와 현재 목표가 달라/);
          assert.equal(row.sources.filter(source => source.kind === "completed-day-saved-goal").length, 12);
        }
        assert.deepEqual(state, original);
      });

test("unfinished and unsupported snapshots cannot invent a confirmed historical goal switch", () => {
  for (const invalid of ["unfinished", "invalid-goal", "invalid-status"]) {
    const state = monthlyWeightState();
    for (const day of Object.values(state.days)) {
      saveGoal(day, "recomp");
      if (invalid === "unfinished") day.complete = false;
      if (invalid === "invalid-goal") day.planSnapshot.context.goal = "not-a-goal";
      if (invalid === "invalid-status") day.planSnapshot.status = "not-a-status";
    }
    const value = connection(state, "weight-training").observations[0];
    assert.deepEqual(value.repeatedWeightTrend.goalContext.observedGoals, []);
    assert.equal(value.followUpStage, "current-food-review");
  }
});

for (const health of [{ illness: "active" }, { illness: "recovering" }, { pain: "mild" }, { pain: "stop" }, { fatigue: "high" }, { energy: "low" }])
  test(`current reported health takes priority over persistent food adjustment: ${JSON.stringify(health)}`, () => {
    const state = monthlyWeightState(); checkin(state, end, health);
    const row = connection(state, "weight-training"), value = row.observations[0];
    assert.ok(value.repeatedWeightTrend); assert.equal(value.followUpStage, "current-context-first");
    assert.match(row.body, /몸 상태를 살펴/); assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택/);
  });

test("missing later health fields do not resolve an earlier illness, and resolving a different field cannot clear it", () => {
  const state = monthlyWeightState(); checkin(state, "2026-09-18", { illness: "active", pain: "mild" });
  checkin(state, end, { illness: null, pain: "none", energy: "okay", performance: "steady" });
  let row = connection(state, "weight-training"), value = row.observations[0];
  assert.equal(value.reportedHealth.fields.illness.date, "2026-09-18"); assert.equal(value.reportedHealth.fields.illness.status, "active");
  assert.equal(value.reportedHealth.fields.pain.status, "none"); assert.equal(value.followUpStage, "current-context-first");
  assert.ok(row.sources.some(source => source.kind === "reported-illness" && source.date === "2026-09-18"));
  checkin(state, end, { illness: "none", pain: "none", energy: "okay", performance: "steady" });
  row = connection(state, "weight-training");
  assert.equal(row.observations[0].followUpStage, "current-food-review");
  assert.equal(row.observations[0].reportedHealth.unresolved, false);
});

test("conflicting same-date explicit health reports do not silently select the recovered version", () => {
  const state = monthlyWeightState(); checkin(state, end, { illness: "none" });
  state.days.copy = { date: end, meals: [], sessions: [], coachCheckin: { illness: "active" } };
  const value = connection(state, "weight-training").observations[0];
  assert.equal(value.reportedHealth.fields.illness.status, "conflicting"); assert.equal(value.followUpStage, "current-context-first");
});

test("a later explicit pain-free workout resolves older check-in pain for linked weight coaching, not the separate illness field", () => {
  const state = monthlyWeightState(); checkin(state, "2026-09-18", { illness: "none", pain: "mild" });
  state.training.records = [{ id: "pain-clear", date: "2026-09-25", pain: "none" }];
  const before = structuredClone(state);
  let value = connection(state, "weight-training").observations[0];
  assert.equal(value.reportedHealth.fields.pain.status, "none");
  assert.equal(value.reportedHealth.fields.pain.date, "2026-09-25");
  assert.deepEqual(value.reportedHealth.fields.pain.sources, [{ kind: "training-record-health", date: "2026-09-25", sessionId: "pain-clear" }]);
  assert.equal(value.followUpStage, "current-food-review"); assert.deepEqual(state, before);
  checkin(state, "2026-09-18", { illness: "active", pain: "mild" });
  value = connection(state, "weight-training").observations[0];
  assert.equal(value.reportedHealth.fields.pain.status, "none");
  assert.equal(value.reportedHealth.fields.illness.status, "active");
  assert.equal(value.followUpStage, "current-context-first");
});

test("new workout pain is connected to weight advice even without a new check-in", () => {
  for (const pain of ["mild", "stop"]) {
    const state = monthlyWeightState(); checkin(state, "2026-09-18", { pain: "none" });
    state.training.records = [{ id: "pain-now", date: end, pain }];
    const row = connection(state, "weight-training"), value = row.observations[0];
    assert.equal(value.reportedHealth.fields.pain.status, pain);
    assert.equal(value.followUpStage, "current-context-first");
    assert.match(row.body, /2026-10-04.*통증/);
    assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택/);
    assert.ok(row.sources.some(source => source.kind === "training-record-health" && source.sessionId === "pain-now"));
  }
});

test("contradictory same-day workout and check-in reports keep the unresolved condition instead of selecting pain-free", () => {
  const state = monthlyWeightState(); checkin(state, end, { pain: "none" });
  state.training.records = [{ id: "pain-observed", date: end, pain: "mild" }];
  const value = connection(state, "weight-training").observations[0];
  assert.equal(value.reportedHealth.fields.pain.status, "conflicting");
  assert.deepEqual(value.reportedHealth.fields.pain.reportedValues, ["none", "mild"]);
  assert.equal(value.followUpStage, "current-context-first");
});

test("future, invalid, blank and conflicting workout reports cannot erase a known health report", () => {
  for (const records of [
    [{ id: "future", date: "2026-10-05", pain: "none" }],
    [{ id: "invalid", date: "2026-09-31", pain: "none" }],
    [{ id: "blank", date: end, pain: null }],
    [{ id: "collision", date: "2026-09-25", pain: "none" }, { id: "collision", date: end, pain: "mild" }]
  ]) {
    const state = monthlyWeightState(); checkin(state, "2026-09-18", { pain: "mild" });
    state.training.records = records;
    const value = connection(state, "weight-training").observations[0];
    assert.equal(value.reportedHealth.fields.pain.status, "mild");
    assert.equal(value.reportedHealth.fields.pain.date, "2026-09-18");
    assert.equal(value.followUpStage, "current-context-first");
  }
});

test("the shared explicit-health history rejects an invalid cutoff without coercing missing fields into none", () => {
  for (const date of [null, undefined, "invalid", "2026-09-31"]) assert.throws(() => I.reportedHealthHistory({}, date), /기준 날짜/);
  assert.deepEqual(I.reportedHealthHistory({ [end]: { date: end, coachCheckin: { pain: null, illness: null } } }, end),
    { fields: {}, unresolved: false });
});

test("a health reminder names only actual unresolved fields with their own recorded dates", () => {
  const illness = monthlyWeightState(); checkin(illness, "2026-09-18", { illness: "recovering", pain: "none" });
  let row = connection(illness, "weight-training");
  assert.match(row.body, /2026-09-18에 질병 뒤 회복 중이라고 남겼어요/);
  assert.doesNotMatch(row.body, /통증|질병·통증/);
  const pain = monthlyWeightState(); checkin(pain, "2026-09-25", { pain: "mild", illness: "none" });
  row = connection(pain, "weight-training");
  assert.match(row.body, /2026-09-25에 통증이 있다고 남겼어요/); assert.doesNotMatch(row.body, /질병/);
  checkin(illness, "2026-10-02", { pain: "mild", illness: null });
  row = connection(illness, "weight-training");
  assert.match(row.body, /2026-09-18에 질병 뒤 회복 중이라고 남겼어요.*2026-10-02에 통증이 있다고 남겼어요/);
  assert.equal(row.observations[0].followUpStage, "current-context-first");
  assert.deepEqual(row.sources.filter(source => source.kind.startsWith("reported-")).map(source => [source.kind, source.date]),
    [["reported-illness", "2026-09-18"], ["reported-pain", "2026-10-02"]]);
});

test("a new abrupt weight shift preserves monthly observation but prevents conflicting food reduction", () => {
  const state = monthlyWeightState([80, 80.6, 80.6, 83]); state.days["2026-09-28"].weightKg = 80.6;
  const row = connection(state, "weight-training"), value = row.observations[0];
  assert.ok(value.repeatedWeightTrend); assert.equal(value.followUpStage, "repeat-measurement");
  assert.ok(value.recentShortChange); assert.match(row.body, /짧고 큰 변화/);
  assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택/);
});

test("body-composition method changes do not fabricate a weight-scale change or tissue growth when independent raw weight trends repeat", () => {
  const state = monthlyWeightState(), originalRate = connection(state, "weight-training").observations[0].repeatedWeightTrend;
  Object.assign(state.days[monthWindows[0][0]], { bodyFatPct: 20, bodyFatMethod: "bia" });
  Object.assign(state.days[monthWindows[3][2]], { bodyFatPct: 18, bodyFatMethod: "dxa" });
  const rows = I.coachingConnections(state, end).connections, row = rows.find(value => value.kind === "weight-training");
  assert.deepEqual(row.observations[0].repeatedWeightTrend, originalRate); assert.equal(row.observations[0].followUpStage, "current-food-review");
  assert.ok(rows.some(value => value.kind === "body-method-change")); assert.ok(!rows.some(value => value.kind === "body-training"));
  assert.doesNotMatch(row.body, /체중계가 바뀌|근육이.*늘었|지방이.*줄었/);
});

test("individual-care populations preserve repeated observation without a new food adjustment, and future records cannot change it", () => {
  const state = monthlyWeightState(); state.profile.healthContext = "treatment";
  const original = I.coachingConnections(state, end), row = original.connections.find(value => value.kind === "weight-training");
  assert.ok(row.observations[0].repeatedWeightTrend); assert.equal(row.observations[0].followUpStage, "current-context-first");
  assert.match(row.body, /개별 지침 안에서/); assert.doesNotMatch(row.body, /그 추가분을 조금 줄이는 선택/);
  checkin(state, "2026-10-05", { illness: "active" }); state.days["2026-10-05"].weightKg = 90;
  assert.deepEqual(I.coachingConnections(state, end), original);
});

for (const symptom of ["illness-active", "pain-stop"]) for (const method of ["same", "changed"])
  test(`all meal/body links, questions and coach cards agree with an acute activity stop: ${symptom}, ${method} method`, () => {
    const scenario = scenarios.find(row => row.id === `cycling-${symptom}`), date = scenario.checkpoints[2].date;
    const state = Fixtures.asOf(scenario, date, { richActivity: true });
    for (const dayDate of ["2026-09-21", "2026-09-23", date]) {
      saveGoal(state.days[dayDate], state.profile.goal);
      state.days[dayDate].meals = [{ id: `meal-${dayDate}`, name: "합성 식사", protein: 15, carbs: 30, fat: 5, otherKcal: 0, alcoholG: 0 }];
    }
    for (const [dayDate, bodyMethod] of [["2026-09-18", "bia"], [date, method === "same" ? "bia" : "dxa"]])
      Object.assign(state.days[dayDate], { bodyFatPct: 20, skeletalMuscleKg: 30, bodyFatMethod: bodyMethod });
    state.days[date].coachCheckin.energy = "low";
    for (const day of Object.values(state.days)) if (typeof day.weightKg === "number" && day.date >= "2026-09-19") day.weightKg -= 0.5;
    const original = structuredClone(state), decision = Context.build(state, date), result = I.coachingConnections(state, date);
    assert.equal(decision.activity.current[0].action.kind, "stop");
    const kinds = result.connections.map(row => row.kind);
    for (const kind of ["fuel-recovery", "protein-distribution", "carb-fueling", "weight-training", method === "same" ? "body-training" : "body-method-change"])
      assert.ok(kinds.includes(kind), kind);
    const unsafeContinuation = /다음 운동은 익숙한|불편하지 않은 부담에서 확인|현재 운동을 이어가|지금 운동·식사는.*이어가|익숙한 운동 부담|다음 운동 전후 식사|장시간 운동은 물/;
    const coach = Coach.buildCoach(state.profile, state.days[date], Object.values(state.days).filter(day => day.date < date),
      { state, decisionContext: decision, training: state.training });
    for (const row of result.connections) {
      assert.doesNotMatch(row.body, unsafeContinuation, row.kind);
      const question = coach.questions.find(question => question.id === `linked-${row.kind}`);
      assert.equal(question.answer, row.body); assert.doesNotMatch(question.answer, unsafeContinuation, question.id);
      const card = coach.priorities.find(priority => priority.id === `linked-${row.kind}`);
      if (card) { assert.equal(card.body, row.body); assert.doesNotMatch(card.body, unsafeContinuation, card.id); }
    }
    coach.priorities.forEach(card => assert.doesNotMatch(card.body, unsafeContinuation, card.id));
    coach.questions.forEach(question => assert.doesNotMatch(question.answer, unsafeContinuation, question.id));
    assert.match(result.connections.find(row => row.kind === "carb-fueling").body, /운동 재개와 보급은 상태를 확인한 뒤/);
    const weight = result.connections.find(row => row.kind === "weight-training");
    assert.equal(weight.observations[0].followUpStage, "current-context-first");
    assert.match(weight.body, new RegExp(date + "에")); assert.doesNotMatch(weight.body, /추가분을 조금 줄이는 선택/);
    assert.ok(weight.observations[0].differenceKg < 0); assert.deepEqual(state, original);
  });

test("older unresolved stop reports keep their actual dates without claiming today is ill or offering a conflicting light workout", () => {
  const state = monthlyWeightState(); state.trackingScope = "both";
  state.days[end] = { date: end, meals: [], sessions: [] };
  state.days["2026-10-02"].sessions = [{ id: "earlier-ride", sport: "cycling", durationMin: 30, intensity: "moderate" }];
  for (const date of ["2026-09-28", "2026-09-30", "2026-10-02"]) {
    saveGoal(state.days[date], "gain"); state.days[date].meals[0].carbs = 30; state.days[date].meals[0].protein = 15; state.days[date].meals[0].fat = 5;
  }
  checkin(state, "2026-09-25", { illness: "active", pain: "stop" });
  checkin(state, end, { illness: null, pain: null, energy: "okay", performance: "steady" });
  const original = structuredClone(state), result = I.coachingConnections(state, end), row = result.connections.find(row => row.kind === "weight-training");
  assert.match(row.body, /2026-09-25에 질병 중이라고 남겼어요.*2026-09-25에 통증 때문에 운동을 멈춰야 한다고 남겼어요.*지금 상태부터 다시 확인/);
  for (const connection of result.connections) assert.doesNotMatch(connection.body, /오늘 질병|현재 질병|오늘.*통증이 있어|익숙한 부담으로 확인|현재 운동을 이어가|불편하지 않은 부담/);
  assert.equal(row.observations[0].followUpStage, "current-context-first");
  assert.deepEqual(row.observations[0].repeatedWeightTrend.comparisons.map(value => [value.from, value.to]),
    [["2026-09-07", "2026-09-18"], ["2026-09-21", "2026-10-02"]]);
  assert.deepEqual(state, original);
});
