const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../src/nutrition.js");
const { buildCoach } = require("../src/coach.js");

const profile = { sex: "male", age: 35, heightCm: 175, weightKg: 75, bodyFatPct: null, bodyFatWeightKg: null, bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 3, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
const day = { date: "2026-10-05", weightKg: null, meals: [], sessions: [], complete: false, carbAdjustmentG: 0 };
function meal(id, protein = 30, carbs = 60, fat = 20, alcoholG = 0) { return { id, name: `식사 ${id}`, protein, carbs, fat, alcoholG, otherKcal: 0 }; }
function completed(meals, overrides = {}, profileOverride = {}) {
  const p = { ...profile, ...profileOverride };
  const d = { ...day, ...overrides, meals };
  const planSnapshot = N.adjustAllocation(N.calculatePlan(p, d), d.carbAdjustmentG || 0);
  planSnapshot.context.goal = p.goal;
  return { ...d, complete: true, planSnapshot };
}
function matchingMeals(plan) {
  return [1, 2].map(id => meal(id, plan.macros.protein.target / 2, plan.macros.carbs.target / 2, plan.macros.fat.target / 2));
}
const textOf = result => result.priorities.map(row => `${row.title} ${row.body}`).join(" ");

test("no profile gives actionable onboarding without invented targets", () => {
  const result = buildCoach(null, day, []);
  assert.equal(result.status, "onboarding");
  assert.equal(result.priorities[0].action, "nav-profile");
  assert.equal(result.context.targetKcal, undefined);
  assert.ok(result.questions.some(row => row.action === "meal-add"));
});

test("clinical scope is prioritized and does not offer calorie or weight-change advice", () => {
  for (const healthContext of ["pregnancy", "breastfeeding", "clinical", "eating_disorder"]) {
    const result = buildCoach({ ...profile, healthContext }, day, []);
    assert.equal(result.status, "review");
    assert.equal(result.priorities[0].kind, "safety");
    assert.equal(result.context.targetKcal, undefined);
    assert.ok(!/\d+\s*(kcal|g)/.test(JSON.stringify(result.questions)));
  }
});

test("zero, one, and incomplete meals never become a whole-day deficit", () => {
  for (const meals of [[], [meal(1)], [meal(1), meal(2)]]) {
    const result = buildCoach(profile, { ...day, meals });
    assert.equal(result.context.dayAssessmentAvailable, false);
    assert.ok(!result.priorities.some(row => row.id === "low-energy"));
    assert.ok(["meal-add", "coach-checkin"].includes(result.priorities[0].action));
  }
  const one = buildCoach(profile, completed([meal(1, 10, 10, 5)]));
  assert.equal(one.priorities[0].id, "low-energy");
  assert.equal(one.context.dayAssessmentAvailable, true);
});

test("draft interprets actual remaining intake and identifies current meal only from explicit mutation", () => {
  const d = { ...day, meals: [meal("a"), meal("b")] };
  const plain = buildCoach(profile, d);
  assert.equal(plain.priorities[0].id, "checkin");
  assert.ok(plain.priorities.find(row => row.id === "next-meal").evidence.remainingKcal > 0);
  assert.ok(!textOf(plain).includes("방금"));
  const updated = buildCoach(profile, d, [], { lastMutation: { date: d.date, type: "meal-added", mealId: "b" } });
  assert.equal(updated.priorities[0].id, "next-meal");
  assert.equal(updated.context.lastMealFeedback.source, "session-only");
  assert.match(textOf(updated), /방금 추가한 식사 b/);
  const stale = buildCoach(profile, d, [], { lastMutation: { date: "2026-10-04", type: "meal-added", mealId: "b" } });
  assert.ok(!textOf(stale).includes("방금"));
  const nonexistent = buildCoach(profile, d, [], { lastMutation: { date: d.date, type: "meal-added", mealId: "unknown" } });
  assert.ok(!textOf(nonexistent).includes("방금"));
});

test("completed records use saved targets even when current profile differs or is absent", () => {
  const p = N.calculatePlan(profile, day);
  const d = completed(matchingMeals(p));
  const result = buildCoach({ ...profile, weightKg: 130, goal: "gain", healthContext: "clinical" }, d);
  assert.equal(result.status, "complete");
  assert.equal(result.context.planSource, "saved-target");
  assert.equal(result.context.targetKcal, p.energy.targetKcal);
  assert.equal(result.context.goal, "maintain");
  assert.equal(result.priorities[0].id, "balanced");
  assert.equal(buildCoach(null, d).status, "complete");
  const missing = buildCoach(profile, { ...d, planSnapshot: null });
  assert.equal(missing.status, "incomplete");
  assert.equal(missing.context.planSource, "missing-snapshot");
});

test("completed low intake cannot coexist with instructions to push a deficit", () => {
  const result = buildCoach({ ...profile, goal: "lose" }, completed([meal(1, 15, 20, 5), meal(2, 15, 20, 5)], {}, { goal: "lose" }));
  assert.equal(result.priorities[0].id, "low-energy");
  assert.match(textOf(result), /충분히/);
  assert.ok(!/적자로 시작|흑자로 시작/.test(textOf(result)));
  assert.ok(result.questions.find(row => row.id === "target").answer.includes("감량 수치를 밀어붙이지"));
});

test("high intake never recommends compensatory exercise or skipping meals", () => {
  const result = buildCoach(profile, completed([meal(1, 80, 300, 80), meal(2, 80, 300, 80)]));
  assert.equal(result.priorities[0].id, "high-energy");
  assert.match(result.priorities[0].body, /굶거나 추가 운동으로 상쇄하기보다/);
  assert.equal(result.priorities[0].action, "nav-trends");
});

test("recovery and alcohol cannot be crowded out by generic goal or sport advice", () => {
  const p = { ...profile, weightKg: 100, bodyFatPct: 15, bodyFatWeightKg: 100, bodyFatMethod: "dxa", bodyFatDate: day.date, goal: "lose", activity: "sedentary" };
  const result = buildCoach(p, { ...day, meals: [meal(1, 20, 20, 10, 30), meal(2)], sessions: [{ sport: "running", durationMin: 120, intensity: "hard" }] });
  assert.equal(result.priorities[0].id, "recovery");
  assert.equal(result.priorities[1].id, "alcohol");
  assert.equal(result.priorities.length, 3);
  assert.match(result.priorities[0].body, /현재 증상이 있다는 뜻은 아니/);
});

test("recent patterns use completed same-goal dated snapshots and never imply consecutive days", () => {
  const history = ["2026-09-08", "2026-09-12", "2026-09-26"].map(date => completed([meal(1, 10, 10, 5), meal(2, 10, 10, 5)], { date }));
  history.push({ ...completed([meal(1), meal(2)], { date: "2026-09-27" }), complete: false });
  history.push(completed([meal(1), meal(2)], { date: "2026-09-28" }, { goal: "gain" }));
  history.push(completed([meal(1), meal(2)], { date: "2026-10-06" }));
  const result = buildCoach(profile, { ...day, meals: [meal(1), meal(2)] }, history);
  assert.equal(result.context.recent.comparableDays, 3);
  assert.equal(result.context.recent.lowEnergyDays, 3);
  assert.match(textOf(result), /3일 중 3일/);
  assert.ok(!textOf(result).includes("3일 연속"));
  assert.equal(result.priorities.find(row => row.id === "recent-intake").evidence.consecutive, false);
  const duplicated = buildCoach(profile, day, [...history, history[0]]);
  assert.equal(duplicated.context.recent.comparableDays, 2);
});

test("opposing today's and recent intake directions do not generate conflicting advice", () => {
  const history = ["2026-09-08", "2026-09-12", "2026-09-26"].map(date => completed([meal(1, 80, 300, 80), meal(2, 80, 300, 80)], { date }));
  const result = buildCoach(profile, completed([meal(1, 10, 10, 5), meal(2, 10, 10, 5)]), history);
  assert.equal(result.priorities[0].id, "low-energy");
  assert.ok(!result.priorities.some(row => row.id === "recent-intake"));
  assert.equal(result.context.recent.highEnergyDays, 3);
});

test("mixed sessions are actual facts and exercise is already included in the target", () => {
  const result = buildCoach(profile, { ...day, meals: [meal(1), meal(2)], sessions: [{ sport: "strength", durationMin: 45, intensity: "moderate" }, { sport: "cycling", durationMin: 60, intensity: "moderate" }] });
  assert.equal(result.context.sessionMinutes, 105);
  assert.deepEqual(result.context.sports, ["strength", "cycling"]);
  const question = result.questions.find(row => row.id === "training");
  assert.match(question.answer, /목표에 이미 포함/);
  assert.match(question.answer, /한 번 더 더하지/);
});

test("unknown experience, unspecified sex and body composition remain unknown", () => {
  const result = buildCoach({ ...profile, sex: "unspecified", trainingYears: null }, day);
  const target = result.questions.find(row => row.id === "target").answer;
  assert.match(target, /운동 횟수로 숙련도를 추정하지/);
  assert.match(target, /중간 추정/);
  assert.equal(result.context.trainingYears, null);
  assert.match(result.questions.find(row => row.id === "composition").answer, /현재 체중으로 과거 체지방률을 재계산하지/);
});

test("chosen allocation is reflected in coaching without target or penalty mutation", () => {
  const d = { ...day, carbAdjustmentG: 25, meals: [meal(1), meal(2)] };
  const input = JSON.stringify({ profile, d });
  const result = buildCoach(profile, d);
  const expected = N.adjustAllocation(N.calculatePlan(profile, d), 25);
  assert.equal(result.context.targetKcal, expected.energy.targetKcal);
  assert.equal(result.context.allocation.appliedCarbDeltaG, 25);
  assert.match(result.questions.find(row => row.id === "allocation").answer, /선택한 배분/);
  assert.equal(result.context.targetsChanged, false);
  assert.equal(JSON.stringify({ profile, d }), input);
  assert.equal(result.score, undefined);
});

test("malformed meal values do not become silently missing calories or zero deficiency", () => {
  for (const meals of [[{ ...meal(1), protein: null }], [{ ...meal(1), carbs: -10 }], [{ ...meal(1), fat: Infinity }], "bad"]) {
    const result = buildCoach(profile, { ...day, meals });
    assert.equal(result.status, "incomplete");
    assert.equal(result.priorities[0].id, "meal-data");
  }
});

test("supported sex goal sport state combinations give one primary and at most two supporting actions", () => {
  const allowed = new Set([null, "nav-profile", "meal-add", "session-add", "measurement", "complete", "nav-trends", "reopen", "coach-checkin"]);
  for (const sex of ["male", "female", "unspecified"])
  for (const goal of ["lose", "maintain", "gain", "recomp", "performance"])
  for (const sport of ["none", "strength", "running", "cycling", "swimming", "team", "mixed"])
  for (const isComplete of [false, true]) {
    const p = { ...profile, sex, goal, sport };
    const d = isComplete ? completed([meal(1), meal(2)], {}, p) : { ...day, meals: [meal(1), meal(2)] };
    const result = buildCoach(p, d);
    assert.ok(result.priorities.length >= 1 && result.priorities.length <= 3);
    assert.equal(result.headline, result.priorities[0].title);
    assert.equal(new Set(result.priorities.map(row => row.id)).size, result.priorities.length);
    [...result.priorities, ...result.questions].forEach(row => assert.ok(allowed.has(row.action)));
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
  }
});

test("missing, partial, and neutral checkins never invent recovery trouble", () => {
  for (const coachCheckin of [undefined, null, { energy: null, hunger: null, sleep: null }, { energy: "okay", hunger: null, sleep: "good" }]) {
    const result = buildCoach(profile, { ...day, meals: [meal(1)], coachCheckin });
    assert.equal(result.context.recoveryConcern, false);
    assert.equal(result.context.checkin.hunger, null);
    assert.equal(result.priorities[0].id, "checkin");
    assert.ok(result.context.missingSignals.some(row => row.id === "checkin"));
  }
  const neutral = buildCoach(profile, { ...day, meals: [meal(1)], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good" } });
  assert.equal(neutral.context.recoveryConcern, false);
  assert.equal(neutral.priorities[0].id, "one-meal");
  assert.ok(!neutral.context.missingSignals.some(row => row.id === "checkin"));
  assert.match(neutral.questions.find(row => row.id === "recovery").answer, /건강하다는 판정은 아니/);
});

test("recovery self-report takes priority over goals, compensation and post-meal optimization", () => {
  for (const field of ["energy", "hunger", "sleep", "performance"]) {
    const concern = { energy: "low", hunger: "high", sleep: "poor", performance: "down" }[field];
    const coachCheckin = { energy: "good", hunger: "okay", sleep: "good", [field]: concern };
    const d = { ...day, meals: [meal("a", 100, 300, 80), meal("b", 100, 300, 80)], coachCheckin, sessions: [{ sport: "running", durationMin: 120, intensity: "moderate" }] };
    const input = JSON.stringify(d);
    const result = buildCoach({ ...profile, goal: "lose" }, d, [], { lastMutation: { date: d.date, type: "meal-added", mealId: "b" } });
    assert.equal(result.priorities[0].id, "checkin-recovery");
    assert.equal(result.context.recoveryConcern, true);
    assert.equal(result.context.reportedConcerns.length, 1);
    assert.match(result.priorities[0].body, /식사를 더 깎거나 추가 운동으로 보상하지/);
    assert.match(result.questions.find(row => row.id === "target").answer, /감량 수치를 밀어붙이지/);
    assert.match(result.questions.find(row => row.id === "training").answer, /식사를 줄이거나 운동을 더해/);
    assert.equal(JSON.stringify(d), input);
    assert.equal(result.context.targetKcal, N.calculatePlan({ ...profile, goal: "lose" }, d).energy.targetKcal);
  }
});

test("planned exercise and rest are user plans, never completed exercise or calories", () => {
  const baseline = N.calculatePlan(profile, day).energy.targetKcal;
  for (const trainingPlan of ["planned", "rest", null]) {
    const d = { ...day, coachCheckin: { energy: "good", hunger: "okay", sleep: "good", trainingPlan } };
    const result = buildCoach(profile, d);
    assert.equal(result.context.targetKcal, baseline);
    assert.equal(result.context.sessionMinutes, 0);
    assert.equal(result.context.plannedExerciseIncluded, false);
    const answer = result.questions.find(row => row.id === "training").answer;
    assert.match(answer, trainingPlan === "planned" ? /실제 완료한 운동이 아니라/ : trainingPlan === "rest" ? /휴식 계획/ : /평소 종목을 고른 것만으로/);
  }
  const conflict = buildCoach(profile, { ...day, sessions: [{ sport: "walking", durationMin: 40, intensity: "easy" }], coachCheckin: { energy: "good", hunger: "okay", sleep: "good", trainingPlan: "rest" } });
  assert.equal(conflict.context.sessionMinutes, 40);
  assert.ok(conflict.context.targetKcal > baseline);
  assert.match(conflict.context.observations.find(row => row.id === "plan").value, /실제 운동은 별도/);
});

test("meal constraints change executable advice without fabricating allergies or meal timing", () => {
  const expected = { busy: /바로 먹을 수 있는/, "low-appetite": /작은 식사로 나누어/, digestive: /평소 잘 견디는/ };
  for (const [mealConstraint, pattern] of Object.entries(expected)) {
    const result = buildCoach(profile, { ...day, meals: [meal(1)], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good", mealConstraint } });
    assert.match(result.priorities[0].body, pattern);
    assert.match(result.questions.find(row => row.id === "training").answer, pattern);
    assert.ok(!result.context.missingSignals.some(row => row.id === "meal-constraint"));
    assert.ok(result.context.limitations.some(row => /시각/.test(row)));
  }
});

test("explicitly completed one-meal days are not rejected by a fixed meal-count gate", () => {
  const plan = N.calculatePlan(profile, day);
  const d = completed([meal(1, plan.macros.protein.target, plan.macros.carbs.target, plan.macros.fat.target)]);
  const result = buildCoach(profile, d, [{ ...d, date: "2026-10-03" }]);
  assert.equal(result.priorities[0].id, "balanced");
  assert.equal(result.context.dayAssessmentAvailable, true);
  assert.equal(result.context.recent.comparableDays, 1);
});

test("matching energy cannot hide an extreme carb-fat split", () => {
  const plan = N.calculatePlan(profile, day);
  for (const fatShare of [0.05, 0.7]) {
    const protein = plan.macros.protein.target;
    const fat = plan.energy.targetKcal * fatShare / 9;
    const carbs = (plan.energy.targetKcal - protein * 4 - fat * 9) / 4;
    const result = buildCoach(profile, completed([meal(1, protein / 2, carbs / 2, fat / 2), meal(2, protein / 2, carbs / 2, fat / 2)]));
    assert.equal(result.priorities[0].id, "macro-balance");
    assert.equal(result.priorities[0].evidence.direction, fatShare > 0.5 ? "carbs-for-fat" : "fat-for-carbs");
    assert.ok(!textOf(result).includes("크게 보완할 신호는"));
  }
});

test("history is exactly the preceding 28 calendar days and malformed meals cannot break weight trends", () => {
  const days = ["2026-09-06", "2026-09-07", "2026-10-04", "2026-10-05", "2026-10-06"].map(date => completed([meal(1)], { date }));
  days.push({ ...completed([meal(1)], { date: "2026-10-03", weightKg: 75 }), meals: null });
  const result = buildCoach(profile, day, days);
  assert.equal(result.context.recent.completedDays, 2);
  assert.equal(result.context.recent.comparableDays, 2);
  assert.equal(result.context.recent.weightObservations, 1);
  assert.equal(result.context.recent.includesSelectedDay, false);
});

test("goal, experience and sport explanations respond to known inputs without inventing unrecorded facts", () => {
  for (const goal of ["lose", "maintain", "gain", "recomp", "performance"])
  for (const trainingYears of [null, 0, 12])
  for (const sport of ["strength", "running", "cycling", "swimming", "team", "mixed", "none"]) {
    const result = buildCoach({ ...profile, goal, trainingYears, sport }, day);
    const target = result.questions.find(row => row.id === "target").answer;
    assert.equal(result.context.trainingYears, trainingYears);
    if (trainingYears === null) assert.match(target, /숙련도를 추정하지/);
    if (trainingYears === 0) assert.match(target, /막 시작했다면/);
    if (trainingYears === 12) assert.match(target, /12년/);
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
    assert.ok(result.context.missingSignals.some(row => row.id === "clinical-context"));
    assert.equal(result.questions.find(row => row.id === "target").action, "nav-profile");
  }
});

test("all 3840 valid checkin combinations preserve numeric targets and actionable finite output", () => {
  const base = { ...day, meals: [meal(1), meal(2)] };
  const target = N.calculatePlan(profile, base).energy.targetKcal;
  let count = 0;
  for (const energy of [null, "low", "okay", "good"])
  for (const hunger of [null, "low", "okay", "high"])
  for (const sleep of [null, "poor", "okay", "good"])
  for (const trainingPlan of [null, "rest", "planned"])
  for (const mealConstraint of [null, "none", "busy", "low-appetite", "digestive"])
  for (const performance of [null, "down", "steady", "up"]) {
    const result = buildCoach(profile, { ...base, coachCheckin: { energy, hunger, sleep, trainingPlan, mealConstraint, performance } });
    const concern = energy === "low" || hunger === "high" || sleep === "poor" || performance === "down";
    assert.equal(result.context.recoveryConcern, concern);
    assert.equal(result.context.targetKcal, target);
    assert.equal(result.priorities[0].id === "checkin-recovery", concern);
    assert.ok(result.priorities.length <= 3);
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
    assert.equal(result.context.targetsChanged, false);
    count++;
  }
  assert.equal(count, 3840);
});

test("overflowing macro totals are rejected rather than rendered as infinite intake", () => {
  const result = buildCoach(profile, { ...day, meals: [meal(1, Number.MAX_VALUE, Number.MAX_VALUE, 0)] });
  assert.equal(result.status, "incomplete");
  assert.equal(result.priorities[0].id, "meal-data");
});
