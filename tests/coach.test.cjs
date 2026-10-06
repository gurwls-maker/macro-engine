const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../src/nutrition.js");
const T = require("../src/training.js");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const { buildCoach, buildFacts, summarizeTraining } = require("../src/coach.js");

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
  assert.equal(result.priorities[0].id, "current-care");
  assert.equal(result.priorities[0].kind, "safety");
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
  const expected = { busy: /준비가 덜 필요한/, "low-appetite": /조금씩 나눠/, digestive: /잘 견디는 음식/ };
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

function syntheticTraining(overrides = {}) {
  const previous = { date: "2026-09-24", loadKg: 50, reps: 10, rir: null, equipmentKey: "fixture-machine-a", loadConvention: "as-recorded", rawName: "합성 프레스" };
  const current = { ...previous, date: "2026-10-02", reps: 12 };
  return {
    windowStart: "2026-09-08", windowEnd: day.date,
    coverage: { recordCount: 2, daysWithRecords: 2, unknownDays: 26, workingSets: 6, warmupSets: 2, markedSets: 0, unknownEffortSets: 6, unresolvedExercises: 0 },
    sessions: [], lastSession: { date: "2026-10-02", time: "12:00", label: "Synthetic A", totalSets: 4, workingSets: 3, durationMinutes: 30 },
    muscles: [{ id: "chest", label: "가슴", directSets: 6, indirectSets: 0, unknownEffortSets: 6 }, { id: "triceps", label: "삼두", directSets: 0, indirectSets: 6, unknownEffortSets: 6 }],
    progression: [{ exerciseId: "fixture-press", label: "합성 프레스", equipmentKey: "fixture-machine-a", current, previous, status: "incomparable", reason: "노력 수준이 미확인이라 수행 향상으로 단정하지 않아요.", observed: { current, previous, description: "동일 원문 운동의 기록값" } }],
    recovery: { status: "insufficient", reasons: [], questions: ["마지막 세트에 몇 회 정도 여유가 있었나요?"], repeatedDeclines: 0, selfReportSignals: [] },
    limitations: ["테스트 합성 기록"], ...overrides
  };
}

function trainingPoint(sessionId, date, extra = {}) {
  return { sessionId, blockId: `${sessionId}-block`, date, time: null, rawName: "합성 프레스", loadKg: 50, reps: 10, rir: 2,
    equipmentKey: "합성 장비 A", loadConvention: "total", basis: "highest-recorded-load-then-reps", ...extra };
}
function progressionRow(label, current, previous = null, extra = {}) {
  return { exerciseId: "bench_press", label, equipmentKey: current?.equipmentKey || "합성 장비 A", current, previous,
    observed: { current, previous, description: "합성 관찰" }, status: previous ? "incomparable" : "insufficient",
    reason: previous ? "RIR과 수행 조건을 확인해야 해요." : "이 조건의 앞선 숫자 기록이 더 필요해요.", ...extra };
}
function latestTraining(progression, last = {}) {
  return syntheticTraining({ lastSession: { id: "latest", date: "2026-10-04", time: "20:00", label: "최신 실제 일지", sourceKind: "manual", totalSets: 2, workingSets: 2, durationMinutes: null, ...last }, progression });
}
function trainingCoach(trainingAnalysis) {
  return buildCoach(profile, { ...day, meals: [meal(1)], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good" } }, [], { trainingAnalysis });
}
function workout(id, date, label, exerciseId, loadKg, extra = {}) {
  return { id, date, time: null, label, sequence: { order: "listed", structure: "straight" }, durationMinutes: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, pain: "none",
    exercises: [{ id: `${id}-exercise`, rawName: label, exerciseId, equipmentKey: "합성 실제 기구", loadConvention: "total", loadRole: "external",
      sets: [{ id: `${id}-set`, loadKg, reps: 10, rir: 2, marker: null }] }], ...extra };
}

test("set-level training observes incomparable raw progression without changing nutrition", () => {
  const trainingAnalysis = syntheticTraining();
  const d = { ...day, meals: [meal(1)], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good" } };
  const before = JSON.stringify({ profile, d, trainingAnalysis });
  const result = buildCoach(profile, d, [], { trainingAnalysis, training: { settings: { daysPerWeek: 3, sessionMinutes: 45 } } });
  assert.equal(result.priorities[0].id, "training-progression");
  assert.match(result.priorities[0].title, /최근 운동 전체 관찰/);
  assert.match(result.priorities[0].body, /한 종목을 전체 운동의 향상이나 저하로 대신하지/);
  assert.match(result.priorities[0].body, /근육 증가량이나 다음 목표 중량을 뜻하지/);
  assert.doesNotMatch(result.priorities[0].body, /50kg|50kg × 12회/);
  const progression = result.context.training.progression[0];
  assert.equal(progression.current.reps, 12); assert.equal(progression.previous.reps, 10);
  assert.equal(progression.status, "incomparable"); assert.match(progression.reason, /노력 수준이 미확인/);
  assert.equal(result.context.targetKcal, N.calculatePlan(profile, d).energy.targetKcal);
  assert.equal(result.context.training.coverage.unknownDays, 26);
  assert.equal(JSON.stringify({ profile, d, trainingAnalysis }), before);
});

test("direct and indirect exposure remain separate with unknown effort and missing days", () => {
  const result = buildCoach(profile, day, [], { trainingAnalysis: syntheticTraining() });
  const muscles = result.questions.find(row => row.id === "training-muscles");
  assert.match(muscles.answer, /가슴 직접 6·간접 0세트/);
  assert.match(muscles.answer, /삼두 직접 0·간접 6세트/);
  assert.match(muscles.answer, /같은 효과의 세트로 합치지/);
  assert.match(muscles.answer, /노력 수준 미확인 6세트/);
  assert.ok(result.context.limitations.some(text => /기록하지 않은 날은 휴식일로 판단하지/.test(text)));
});

test("training safety outranks progression and blocks new program suggestions", () => {
  for (const status of ["stop", "review", "watch"]) {
    const trainingAnalysis = syntheticTraining({ recovery: { status, reasons: ["입력한 통증 또는 반복된 수행 변화 확인"], questions: ["현재 상태를 알려 주세요."], repeatedDeclines: 2, selfReportSignals: [] } });
    const result = buildCoach(profile, { ...day, meals: [meal(1)] }, [], { trainingAnalysis, program: { status: "ready", name: "합성 계획", reason: "주 3회" } });
    assert.equal(result.priorities[0].kind, "safety");
    if (status !== "watch") assert.ok(!result.questions.some(row => row.id === "training-program"));
    assert.match(result.questions.find(row => row.id === "training-deload").answer, /단일 일지.*디로드를 단정하지/);
  }
});

test("completed nutrition snapshot survives training integration and current clinical profile blocks program", () => {
  const plan = N.calculatePlan(profile, day);
  const d = completed(matchingMeals(plan));
  const before = JSON.stringify(d);
  const result = buildCoach({ ...profile, healthContext: "clinical", weightKg: 100 }, d, [], { trainingAnalysis: syntheticTraining(), program: { status: "ready", name: "합성 계획", reason: "조건 확인" } });
  assert.equal(result.status, "complete");
  assert.equal(result.context.targetKcal, plan.energy.targetKcal);
  assert.ok(!result.questions.some(row => row.id === "training-program"));
  assert.equal(JSON.stringify(d), before);
});

test("future training windows cannot reinterpret a selected historical date", () => {
  const result = buildCoach(profile, day, [], { trainingAnalysis: syntheticTraining({ windowEnd: "2026-10-06" }) });
  assert.equal(result.context.training.available, false);
  assert.equal(result.context.training.lastSession, null);
  assert.deepEqual(result.context.training.progression, []);
  assert.ok(!result.questions.some(row => row.id === "training-progression"));
});

test("partial training payload remains unknown rather than zero or malformed numeric output", () => {
  const analysis = syntheticTraining({ coverage: { recordCount: "2", unknownDays: Infinity }, muscles: [null, { id: "x", label: "부위", directSets: null, indirectSets: 1 }], progression: [null, {}], recovery: { status: "unexpected", reasons: "not an array" } });
  const result = buildCoach(profile, day, [], { trainingAnalysis: analysis });
  assert.equal(result.context.training.coverage.recordCount, null);
  assert.equal(result.context.training.coverage.unknownDays, null);
  assert.equal(result.context.training.muscles[0].directSets, null);
  assert.equal(result.context.training.recovery.status, "insufficient");
  assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
});

test("detailed activity explains replacement of rest without relabeling net exercise as the TDEE increment", () => {
  const time = { sleepHours: 8, workHours: 8, workType: "seated", lifestyleHours: 2, lifestyleType: "light" };
  const p = { ...profile, activityMode: "detailed", dailyActivity: time, weekdayActivity: { "1": { ...time, workHours: 6 } } };
  const d = { ...day, meals: [meal(1)], sessions: [{ sport: "running", durationMin: 60, intensity: "moderate" }] };
  const result = buildCoach(p, d);
  const expected = N.calculatePlan(p, d);
  const answer = result.questions.find(row => row.id === "training").answer;
  assert.match(answer, /순소모/);
  assert.match(answer, /휴식을 운동으로 바꿔 계산/);
  assert.match(answer, /목표에 이미 포함/);
  assert.ok(!answer.includes("추가 소모 추정"));
  assert.notEqual(expected.context.dailyActivity.exerciseIncrementKcal, expected.energy.exerciseKcal);
  assert.equal(result.context.exerciseKcal, expected.energy.exerciseKcal);
  assert.match(result.context.observations.find(row => row.id === "daily-activity").value, /요일별 시간표.*남은 휴식 7시간/);
  assert.match(result.questions.find(row => row.id === "target").answer, /요일별 시간표/);
  const fact = buildFacts(result, d).find(row => row.id === "today.exercise.kcal");
  assert.equal(fact.value, expected.energy.exerciseKcal);
  assert.equal(fact.source, "exercise-model");
  assert.equal(fact.estimated, true);
  assert.equal(fact.label, "운동 순소모 추정");
  const saved = completed(d.meals, { sessions: d.sessions }, p);
  const historical = buildCoach({ ...profile, activityMode: "simple", weightKg: 100 }, saved);
  assert.equal(historical.context.targetKcal, saved.planSnapshot.energy.targetKcal);
  assert.match(historical.context.observations.find(row => row.id === "daily-activity").label, /완료 당시/);
  assert.match(historical.questions.find(row => row.id === "training").answer, /휴식을 운동으로 바꿔 계산/);
});

test("a just-recorded meal stays ahead of ordinary training commentary, while safety still comes first", () => {
  const d = { ...day, meals: [meal(1), meal(2)], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good" } };
  const options = { trainingAnalysis: syntheticTraining(), lastMutation: { type: "meal-added", date: day.date, mealId: 2 } };
  const result = buildCoach(profile, d, [], options);
  assert.equal(result.priorities[0].id, "next-meal");
  assert.equal(result.priorities[0].source, "session-only");
  assert.ok(result.priorities.some(row => row.id === "training-progression"));
  const tired = buildCoach(profile, { ...d, coachCheckin: { ...d.coachCheckin, energy: "low" } }, [], options);
  assert.equal(tired.priorities[0].kind, "safety");
  assert.ok(tired.priorities.some(row => row.id === "next-meal"));
  assert.ok(result.priorities.length <= 3 && tired.priorities.length <= 3);
});

test("non-pain recovery review does not invent a painful movement in the priority card", () => {
  const result = buildCoach(profile, day, [], { trainingAnalysis: syntheticTraining({ recovery: { status: "review", pain: "none", reasons: ["수행 저하와 낮은 수면이 반복됐어요."], questions: [] } }) });
  assert.equal(result.priorities[0].id, "training-safety");
  assert.match(result.priorities[0].body, /수행 저하와 낮은 수면/);
  assert.ok(!/통증이 있는 동작|통증이 생기는 동작/.test(result.priorities[0].title + result.priorities[0].body));
  assert.equal(result.context.training.recovery.pain, "none");
});

test("an empty completed day requests reopening instead of pretending meals were missed or are editable", () => {
  const result = buildCoach(profile, completed([]));
  assert.equal(result.status, "complete");
  assert.equal(result.priorities[0].id, "start");
  assert.equal(result.priorities[0].action, "reopen");
  assert.equal(result.context.dayAssessmentAvailable, false);
  assert.ok(!result.priorities.some(row => row.id === "low-energy"));
  assert.match(result.priorities[0].body, /먹지 않았다는 뜻으로 보지/);
});

test("current individual-care scope changes advice but never the completed historical facts or target", () => {
  const snapshot = N.calculatePlan(profile, day);
  const d = completed(matchingMeals(snapshot));
  const before = JSON.stringify(d);
  const ordinary = buildCoach(profile, d);
  for (const change of [{ healthContext: "clinical" }, { healthContext: "pregnancy" }, { healthContext: "breastfeeding" }, { healthContext: "eating_disorder" }, { age: 17 }, { age: 81 }]) {
    const current = buildCoach({ ...profile, ...change }, d, [], { trainingAnalysis: syntheticTraining() });
    assert.equal(current.status, "complete");
    assert.equal(current.context.planSource, "saved-target");
    assert.equal(current.context.targetKcal, snapshot.energy.targetKcal);
    assert.equal(current.priorities[0].id, "current-care");
    assert.equal(current.priorities[0].kind, "safety");
    assert.ok(current.priorities.length <= 3);
    assert.ok(!current.priorities.some(row => ["balanced", "protein", "low-energy", "high-energy"].includes(row.id)));
    assert.match(current.questions.find(row => row.id === "target").answer, /지금의 처방으로 사용하지/);
    const retained = buildFacts(current, d).filter(row => !row.id.startsWith("training.") && !row.id.startsWith("muscle.") && !row.id.startsWith("progression."));
    assert.deepEqual(retained, buildFacts(ordinary, d));
    assert.equal(JSON.stringify(d), before);
  }
});

test("direct coach calls use the selected day's paired measurements without rewriting prior snapshots", () => {
  const d = { ...day, weightKg: 80, bodyFatPct: 25, bodyFatMethod: "bia", meals: [meal(1)] };
  const p = { ...profile, goal: "lose", bodyFatPct: 15, bodyFatWeightKg: 75, bodyFatDate: "2026-09-01", bodyFatMethod: "dxa" };
  const original = JSON.stringify({ p, d });
  const result = buildCoach(p, d);
  const effective = N.profileForDay(p, d);
  const expected = N.calculatePlan(effective, d);
  assert.equal(result.context.targetKcal, expected.energy.targetKcal);
  assert.equal(result.context.weightKg, 80);
  assert.match(result.questions.find(row => row.id === "composition").answer, /80kg.*60kg/);
  assert.equal(JSON.stringify({ p, d }), original);
  const saved = { ...d, complete: true, planSnapshot: N.calculatePlan(profile, day) };
  assert.equal(buildCoach(p, saved).context.targetKcal, saved.planSnapshot.energy.targetKcal);
});

test("whole-session coaching follows actual analyzed session IDs without choosing a historical exercise as its representative", () => {
  const records = [workout("old-pullup", "2026-09-09", "이전 풀업", "pullup", 15),
    workout("prior-press", "2026-09-24", "벤치 프레스", "bench_press", 50),
    workout("latest-press", "2026-10-04", "벤치 프레스", "bench_press", 55)];
  records.at(-1).exercises[0].sets[0].rir = null;
  const input = JSON.stringify(records), analysis = T.analyze(records, { date: day.date });
  assert.equal(analysis.progression[0].current.sessionId, "old-pullup", "fixture reproduces chronological group insertion");
  const result = trainingCoach(analysis), selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(result.context.training.lastSession.id, "latest-press");
  assert.equal(selected.evidence.scope, "whole-session"); assert.equal(selected.evidence.latestSessionId, "latest-press");
  assert.equal(selected.evidence.current, null); assert.equal(selected.evidence.previous, null);
  assert.equal(selected.evidence.exerciseCount, 1); assert.equal(selected.evidence.workingSets, 1); assert.equal(selected.evidence.unknownEffortSets, 1);
  assert.equal(selected.action, "training-open"); assert.equal(selected.actionRecordId, "latest-press");
  assert.equal(selected.actionLabel, "2026-10-04 일지 보기"); assert.equal(selected.title, "2026-10-04 최근 운동 전체 관찰");
  assert.doesNotMatch(selected.title + selected.body, /이전 풀업|2026-09-09|최근 대표 세트/);
  assert.match(selected.body, /운동 블록 1개.*일반 1세트.*RIR 미확인 1세트/);
  assert.doesNotMatch(selected.body, /50kg|55kg|2026-09-24/);
  const raw = result.context.training.progression.find(row => row.current?.sessionId === "latest-press");
  assert.equal(raw.current.loadKg, 55); assert.equal(raw.previous.loadKg, 50); assert.equal(raw.previous.sessionId, "prior-press");
  assert.match(raw.reason, /RIR이 비어 있거나 달라/);
  assert.ok(buildFacts(result, day).some(row => row.id.startsWith("progression.") && row.value === 55));
  const question = result.questions.find(row => row.id === "training-log");
  assert.equal(question.actionRecordId, "latest-press"); assert.match(question.answer, /2026-10-04/);
  assert.equal(JSON.stringify(records), input);
});

test("a whole-session summary does not rank individual movements by prior observation availability or historical group order", () => {
  const current = trainingPoint("latest", "2026-10-04"), previous = trainingPoint("prior", "2026-09-24");
  const analysis = latestTraining([progressionRow("처음 기록한 운동", current), progressionRow("비교할 숫자가 있는 프레스", current, previous)]);
  const input = JSON.stringify(analysis), result = trainingCoach(analysis), selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.title, "2026-10-04 최근 운동 전체 관찰"); assert.equal(selected.evidence.previous, null);
  assert.equal(selected.evidence.selection, "latest-session-id"); assert.equal(selected.evidence.current, null);
  assert.doesNotMatch(selected.title + selected.body, /비교할 숫자가 있는 프레스|처음 기록한 운동|50kg/);
  const reordered = trainingCoach(latestTraining([...analysis.progression].reverse())).priorities.find(row => row.id === "training-progression");
  assert.deepEqual(reordered, selected, "a top-level summary must not depend on an arbitrary individual group order");
  assert.equal(JSON.stringify(analysis), input);
});

test("a latest unpaired observation does not borrow a stronger comparison from an old exercise", () => {
  const older = progressionRow("오래된 풀업", trainingPoint("old", "2026-09-09", { loadKg: 99 }), trainingPoint("older", "2026-09-08"));
  const latest = progressionRow("새 운동", trainingPoint("latest", "2026-10-04", { loadKg: 25, reps: 12 }));
  const result = trainingCoach(latestTraining([older, latest])), selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.evidence.latestSessionId, "latest"); assert.equal(selected.evidence.previous, null);
  assert.equal(selected.title, "2026-10-04 최근 운동 전체 관찰");
  assert.match(selected.body, /한 종목을 전체 운동의 향상이나 저하로 대신하지/);
  const preserved = result.context.training.progression.find(row => row.current?.sessionId === "latest");
  assert.equal(preserved.current.loadKg, 25); assert.equal(preserved.current.reps, 12); assert.equal(preserved.previous, null);
  assert.doesNotMatch(selected.body, /→/);
  assert.doesNotMatch(selected.body, /오래된 풀업|99kg|2026-09-09/);
});

test("same-day sessions require the latest exact ID and never substitute another session or missing source ID", () => {
  const morning = trainingPoint("morning", "2026-10-04", { time: "08:00", loadKg: 30 });
  const evening = trainingPoint("latest", "2026-10-04", { time: "20:00", loadKg: 42.5, reps: 13, rir: null });
  const prior = trainingPoint("prior", "2026-09-24");
  const result = trainingCoach(latestTraining([progressionRow("오전 프레스", morning, prior), progressionRow("저녁 프레스", evening, morning,
    { reason: "같은 날의 두 세션은 장기 수행 변화로 판정하지 않아요." })]));
  const selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.actionRecordId, "latest"); assert.equal(selected.evidence.latestSessionId, "latest");
  assert.equal(selected.evidence.current, null); assert.equal(selected.evidence.previous, null);
  assert.match(selected.body, /2026-10-04 20:00 최신 실제 일지/);
  assert.doesNotMatch(selected.body, /42.5kg|30kg|08:00/);
  const preserved = result.context.training.progression.find(row => row.current?.sessionId === "latest");
  assert.equal(preserved.current.rir, null); assert.equal(preserved.current.loadKg, 42.5); assert.equal(preserved.current.reps, 13);
  assert.equal(preserved.previous.sessionId, "morning"); assert.match(preserved.reason, /같은 날의 두 세션/);
  for (const point of [morning, { ...evening, sessionId: null }]) {
    const rejected = trainingCoach(latestTraining([progressionRow("다른 세션", point, prior)]));
    assert.ok(!rejected.questions.some(row => row.id === "training-progression"));
    assert.equal(rejected.priorities.find(row => row.id === "training-log").actionRecordId, "latest");
  }
});

test("latest sessions without known load or reps summarize that session instead of reviving older comparisons", () => {
  const older = progressionRow("오래된 프레스", trainingPoint("old", "2026-09-24"), trainingPoint("older", "2026-09-20"));
  const unknown = progressionRow("숫자 미확인", trainingPoint("latest", "2026-10-04", { loadKg: null, reps: null, rir: null }));
  for (const progression of [[older], [older, unknown]]) {
    const result = trainingCoach(latestTraining(progression)), summary = result.priorities.find(row => row.id === "training-log");
    assert.ok(!result.questions.some(row => row.id === "training-progression"));
    assert.equal(summary.title, "2026-10-04 최근 운동 전체 관찰"); assert.match(summary.body, /최신 실제 일지.*숫자를 대신 보여주지 않았/);
    assert.equal(summary.actionRecordId, "latest"); assert.equal(summary.actionLabel, "2026-10-04 일지 보기");
    assert.equal(summary.evidence.current, null); assert.doesNotMatch(summary.body, /50kg|2026-09-24/);
  }
});

test("normalization rejects invalid and future points and retains exact IDs for valid observations", () => {
  const badDates = ["2026-02-30", "invalid", null, "2026-10-06"];
  for (const date of badDates) {
    const point = trainingPoint("latest", date), analysis = latestTraining([progressionRow("확인 불가", point, point)]);
    const normalized = summarizeTraining(analysis, null, null, day.date);
    assert.equal(normalized.progression[0].current, null); assert.equal(normalized.progression[0].observed.previous, null);
    assert.ok(!trainingCoach(analysis).questions.some(row => row.id === "training-progression"));
    assert.ok(!buildFacts(trainingCoach(analysis), day).some(row => row.id.startsWith("progression.")));
    assert.equal(summarizeTraining(latestTraining([], { date }), null, null, day.date).lastSession, null);
  }
  const valid = trainingPoint("latest", "2026-10-04"), normalized = summarizeTraining(latestTraining([progressionRow("정상", valid)]), null, null, day.date);
  assert.equal(normalized.lastSession.id, "latest"); assert.equal(normalized.progression[0].observed.current.sessionId, "latest");
});

test("whole-session fallback never pairs a current record with an unrelated observed point", () => {
  const current = trainingPoint("latest", "2026-10-04", { loadKg: 55 }), previous = trainingPoint("prior", "2026-09-24");
  const unrelated = trainingPoint("old", "2026-09-09", { loadKg: 999 });
  const result = trainingCoach(latestTraining([progressionRow("최신 프레스", current, previous,
    { observed: { current: unrelated, previous: unrelated, description: "다른 세션 원문" } })]));
  const selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.evidence.current, null); assert.equal(selected.evidence.previous, null);
  assert.doesNotMatch(selected.body, /50kg|55kg|999kg/);
  const preserved = result.context.training.progression[0];
  assert.equal(preserved.current.loadKg, 55); assert.equal(preserved.previous.sessionId, "prior");
  assert.equal(preserved.observed.current.loadKg, 999);
});

test("rejected prior provenance cannot leave an improvement claim attached to a lone current observation", () => {
  const current = trainingPoint("latest", "2026-10-04"), future = trainingPoint("future", "2026-10-06");
  const result = trainingCoach(latestTraining([progressionRow("최신 프레스", current, future,
    { status: "improved", reason: "반복 수가 늘었어요." })]));
  const selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.evidence.previous, null); assert.match(selected.body, /한 종목을 전체 운동의 향상이나 저하로 대신하지/);
  assert.doesNotMatch(selected.body, /반복 수가 늘었어요/);
  assert.equal(result.context.training.progression[0].status, "improved", "source judgment remains intact; display must not use it after rejecting its prior evidence");
});

test("date-only external fixtures may match latest date but cannot replace a real latest ID", () => {
  const analysis = syntheticTraining(), result = trainingCoach(analysis), selected = result.priorities.find(row => row.id === "training-progression");
  assert.equal(selected.evidence.selection, "latest-date-fallback"); assert.equal(selected.actionRecordId, null);
  assert.equal(selected.actionRecordDate, "2026-10-02"); assert.equal(selected.actionLabel, "2026-10-02 일지 보기");
  const exact = trainingCoach(syntheticTraining({ ...analysis, lastSession: { ...analysis.lastSession, id: "real-latest" } }));
  assert.ok(!exact.questions.some(row => row.id === "training-progression"));
  assert.equal(exact.priorities.find(row => row.id === "training-log").actionRecordId, "real-latest");
});

test("the bounded coach summary does not truncate a latest session behind many older exercise groups", () => {
  const older = Array.from({ length: 101 }, (_, index) => progressionRow(`이전 운동 ${index}`, trainingPoint(`old-${index}`, "2026-09-24")));
  const latest = progressionRow("최신 마지막 운동", trainingPoint("latest", "2026-10-04"));
  const result = trainingCoach(latestTraining([...older, latest]));
  assert.equal(result.context.training.progression.length, 100);
  assert.equal(result.priorities.find(row => row.id === "training-progression").title, "2026-10-04 최근 운동 전체 관찰");
  assert.ok(result.context.training.progression.some(row => row.current?.sessionId === "latest"));
});

test("latest session selection remains retrospective at historical dates and names nutrition input actions precisely", () => {
  const records = [workout("historical", "2026-09-24", "벤치 프레스", "bench_press", 50), workout("future", "2026-10-04", "벤치 프레스", "bench_press", 55)];
  const selectedDay = { ...day, date: "2026-09-25", meals: [meal(1)] };
  const result = buildCoach(profile, selectedDay, [], { trainingAnalysis: T.analyze(records, { date: selectedDay.date }) });
  const question = result.questions.find(row => row.id === "training-log");
  assert.equal(question.actionRecordId, "historical"); assert.equal(question.actionLabel, "2026-09-24 일지 보기");
  assert.doesNotMatch(question.answer, /2026-10-04/);
  const planned = buildCoach(profile, { ...day, coachCheckin: { trainingPlan: "planned" } });
  assert.equal(planned.questions.find(row => row.id === "training").actionLabel, "운동 시간 기록");
  assert.equal(planned.questions.find(row => row.id === "composition").actionLabel, "체중·체성분 기록");
});

test("a complete A-B-A multi-machine session remains a whole-session summary with distinct raw progression facts", () => {
  const latest = workout("whole-session", "2026-10-04", "합성 전체 세션", "bench_press", 80, { time: "19:30" });
  const first = latest.exercises[0];
  first.equipmentKey = "합성 장비 A";
  first.sets.push({ id: "warmup", marker: "W", loadKg: 20, reps: 10, rir: null },
    { id: "marked", marker: "D", loadKg: 60, reps: 12, rir: 2 });
  latest.exercises.push({ ...first, id: "middle-B", rawName: "합성 두 번째 장비 프레스", equipmentKey: "합성 장비 B",
    sets: [{ id: "middle-set", marker: null, loadKg: 45, reps: 12, rir: 2 }] },
  { ...first, id: "return-A", rawName: "합성 다시 장비 A", sets: [{ id: "return-set", marker: null, loadKg: 65, reps: 8, rir: null }] });
  const input = JSON.stringify(latest), analysis = T.analyze([latest], { date: day.date }), result = trainingCoach(analysis);
  const priority = result.priorities.find(row => row.id === "training-progression");
  assert.equal(priority.evidence.scope, "whole-session"); assert.equal(priority.evidence.exerciseCount, 3);
  assert.equal(priority.evidence.workingSets, 3); assert.equal(priority.evidence.warmupSets, 1);
  assert.equal(priority.evidence.markedSets, 1); assert.equal(priority.evidence.unknownEffortSets, 1);
  assert.match(priority.body, /2026-10-04 19:30 합성 전체 세션/);
  assert.match(priority.body, /운동 블록 3개.*일반 3세트.*준비 1세트.*별도 표시 1세트.*RIR 미확인 1세트/);
  assert.doesNotMatch(priority.body, /80kg|45kg|65kg|향상됐|저하됐|합성 장비 A|합성 장비 B/);
  const rows = result.context.training.progression.filter(row => row.current?.sessionId === latest.id);
  assert.deepEqual(new Set(rows.map(row => row.current.blockId)), new Set([first.id, "middle-B", "return-A"]));
  for (const value of [80, 45, 65]) assert.ok(buildFacts(result, day).some(row => row.id.startsWith("progression.") && row.value === value));
  assert.equal(result.questions.find(row => row.id === "training-progression").actionRecordId, latest.id);
  assert.equal(JSON.stringify(latest), input);
});

test("whole-session counts preserve unknowns and bound malformed external exercise summaries", () => {
  const point = trainingPoint("latest", "2026-10-04"), progression = [progressionRow("숫자 운동", point)];
  for (const exercises of [undefined, null, [null], ["bad"], Array.from({ length: 201 }, () => ({}))]) {
    const result = trainingCoach(latestTraining(progression, { exercises, workingSets: null, warmupSets: null, markedSets: null, unknownEffortSets: null }));
    const summary = result.priorities.find(row => row.id === "training-progression");
    assert.equal(summary.evidence.exerciseCount, null); assert.equal(summary.evidence.workingSets, null);
    assert.match(summary.body, /운동 블록 수 미확인.*일반 세트 수 미확인/);
    assert.doesNotMatch(summary.body, /운동 블록 0개|일반 0세트|준비 0세트|별도 표시 0세트|RIR 미확인 0세트/);
  }
  const empty = trainingCoach(latestTraining([], { exercises: [], workingSets: 0, warmupSets: 0, markedSets: 0, unknownEffortSets: 0 }));
  assert.equal(empty.priorities.find(row => row.id === "training-log").evidence.exerciseCount, 0, "a confirmed empty manual session is known, not missing");
});

test("a legacy aggregate cannot become zero performed exercises or a single older representative", () => {
  const older = progressionRow("옛 운동", trainingPoint("older", "2026-09-24", { loadKg: 999 }));
  const result = trainingCoach(latestTraining([older], { sourceKind: "legacy-ocr", totalSets: 0, workingSets: 0,
    warmupSets: 0, markedSets: 0, unknownEffortSets: 0, exercises: [] }));
  const summary = result.priorities.find(row => row.id === "training-log");
  assert.equal(summary.evidence.exerciseCount, null); assert.equal(summary.evidence.workingSets, null);
  assert.equal(summary.evidence.unknownEffortSets, null); assert.equal(summary.actionRecordId, "latest");
  assert.match(summary.body, /운동 블록 수 미확인.*이전 OCR.*새로 검증한 기록이 아니/);
  assert.doesNotMatch(summary.body, /옛 운동|999kg|2026-09-24|운동 블록 0개|일반 0세트/);
  assert.ok(!result.questions.some(row => row.id === "training-progression"));
});

test("profileless training scope retains whole-session observation while pain safety stays first", () => {
  const latest = workout("profileless", "2026-10-04", "프로필 없는 실제 기록", "bench_press", 40);
  const state = S.createEmpty(); state.trackingScope = "training"; state.training = TS.createEmpty(); state.training.records = [latest];
  const before = JSON.stringify(state), selectedDay = { ...day, meals: [] };
  const analysis = T.analyze(state.training.records, { date: selectedDay.date });
  const ordinary = buildCoach(null, selectedDay, [], { state, training: state.training, trainingAnalysis: analysis });
  assert.equal(ordinary.status, "tracking"); assert.equal(ordinary.context.targetKcal, undefined);
  assert.equal(ordinary.priorities.find(row => row.id === "training-progression").evidence.exerciseCount, 1);
  assert.equal(ordinary.questions.find(row => row.id === "training-progression").actionRecordId, latest.id);
  const painAnalysis = T.analyze([{ ...latest, pain: "stop" }], { date: selectedDay.date });
  const pain = buildCoach(null, selectedDay, [], { state, training: state.training, trainingAnalysis: painAnalysis });
  assert.equal(pain.priorities[0].kind, "safety"); assert.match(pain.priorities[0].body, /통증/);
  assert.ok(pain.priorities.some(row => row.id === "training-progression"));
  assert.equal(pain.context.targetKcal, undefined); assert.equal(JSON.stringify(state), before);
});
