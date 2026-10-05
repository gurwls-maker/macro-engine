const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePlan, adjustAllocation, validateProfile, summarizeWeightTrend, ACTIVITY_PARS, CARDIO_LIMITS } = require("../src/nutrition.js");

const profile = Object.freeze({ sex: "male", age: 35, heightCm: 175, weightKg: 75, bodyFatPct: null, bodyFatWeightKg: null, bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: null, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" });
const day = Object.freeze({ date: "2026-10-05", meals: [], sessions: [], complete: false });
const plan = (overrides = {}, dayOverrides = {}) => calculatePlan({ ...profile, ...overrides }, { ...day, ...dayOverrides });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const activity = Object.freeze({ sleepHours: 8, workHours: 8, workType: "seated", lifestyleHours: 2, lifestyleType: "light" });
const detailed = (overrides = {}, dayOverrides = {}) => plan({ activityMode: "detailed", dailyActivity: activity, ...overrides }, dayOverrides);
const cardio = (sport = "walking", overrides = {}) => ({ sport, intensity: "moderate", durationMin: 30, cardio: { environment: "treadmill", speedKmh: sport === "walking" ? 4.8 : 10, gradePct: 0, ...overrides } });

test("missing body composition never becomes full body weight or a calorie floor", () => {
  const result = plan({ sex: "female", age: 45, heightCm: 165, weightKg: 100, sport: "none", goal: "lose", activity: "sedentary" });
  assert.equal(result.status, "ready");
  assert.equal(result.context.ffmKg, null);
  assert.equal(result.context.energyAvailability, null);
  near(result.energy.restingKcal, 1645.25);
  assert.ok(result.energy.targetKcal < result.energy.tdeeKcal);
  assert.ok(result.energy.targetKcal < 2000);
});

test("unsupported health and age groups get no numeric prescription", () => {
  for (const override of [{ age: 17 }, { age: 81 }, { weightKg: 50 }, { weightKg: 180 }, ...["pregnancy", "breastfeeding", "clinical", "eating_disorder"].map(healthContext => ({ healthContext })), { sex: "female", bodyFatPct: 8 }]) {
    const result = plan(override);
    assert.equal(result.status, "review", JSON.stringify(override));
    assert.equal(result.energy.targetKcal, null);
    assert.equal(result.macros.protein.target, null);
    assert.ok(result.reasons.length);
  }
});

test("validation rejects missing, coercible, nonfinite, extreme, and impossible data", () => {
  for (const override of [{ weightKg: "75" }, { weightKg: Infinity }, { age: NaN }, { bodyFatPct: 100 }, { trainingYears: -1 }, { trainingYears: 40 }, { bodyFatDate: "2026-02-30" }, { sex: "" }, { activity: "toString" }]) {
    assert.equal(validateProfile({ ...profile, ...override }).valid, false, JSON.stringify(override));
    assert.equal(plan(override).status, "incomplete");
  }
  assert.equal(calculatePlan(null).status, "incomplete");
  assert.equal(plan({}, { weightKg: 0 }).status, "incomplete");
  assert.equal(plan({}, { sessions: [{ sport: "running", intensity: "fast", durationMin: 20 }] }).status, "incomplete");
  assert.equal(plan({}, { sessions: [{ sport: "__proto__", intensity: "hard", durationMin: 20 }] }).status, "incomplete");
  assert.equal(plan({}, { sessions: [{ sport: "cycling", intensity: "hard", durationMin: 361 }] }).status, "review");
});

test("sex unspecified uses a transparent middle estimate with greater uncertainty", () => {
  const male = plan();
  const female = plan({ sex: "female" });
  const unknown = plan({ sex: "unspecified" });
  near(unknown.energy.restingKcal, (male.energy.restingKcal + female.energy.restingKcal) / 2);
  assert.ok(unknown.energy.range[1] - unknown.energy.range[0] > male.energy.range[1] - male.energy.range[0]);
  assert.match(unknown.reasons.join(" "), /중간값/);
});

test("actual FFM uses weight minus fat; stale, unknown, future measurements have no numeric authority", () => {
  const measured = plan({ bodyFatPct: 20, bodyFatWeightKg: 75, bodyFatMethod: "bia", bodyFatDate: "2026-10-01" });
  near(measured.context.ffmKg, 60);
  assert.equal(measured.context.bodyFatUsable, true);
  assert.equal(measured.context.measurementConfidence, "low");
  const missing = plan({ goal: "lose" });
  for (const bodyFatDate of [null, "2026-01-01", "2026-10-06"]) {
    const result = plan({ bodyFatPct: 20, bodyFatMethod: "dxa", bodyFatDate, goal: "lose" });
    assert.equal(result.context.bodyFatUsable, false);
    assert.equal(result.context.energyAvailability, null);
    near(result.energy.targetKcal, missing.energy.targetKcal);
  }
});

test("exercise is net, additive, independent of session splitting, and preserves training fuel", () => {
  const session = { sport: "running", intensity: "moderate", durationMin: 60 };
  const rest = plan({ goal: "lose" });
  const run = plan({ goal: "lose" }, { sessions: [session] });
  const split = plan({ goal: "lose" }, { sessions: [{ ...session, durationMin: 20 }, { ...session, durationMin: 40 }] });
  near(run.energy.exerciseKcal, (8.5 - 1) * 75);
  near(run.energy.targetKcal - rest.energy.targetKcal, run.energy.exerciseKcal);
  near(split.energy.targetKcal, run.energy.targetKcal);
  near(split.macros.carbs.target, run.macros.carbs.target);
  const mixed = plan({}, { sessions: [session, { sport: "strength", intensity: "moderate", durationMin: 45 }] });
  near(mixed.energy.exerciseKcal, 562.5 + 140.625);
  assert.equal(mixed.context.guidanceSport, "mixed");
  assert.equal(plan({}, { sessions: [{ ...session, durationMin: 0 }] }).energy.exerciseKcal, 0);
});

test("experience changes gain conservatively and continuously, never inferred from frequency", () => {
  const novice = plan({ goal: "gain", trainingYears: 0 });
  const advanced = plan({ goal: "gain", trainingYears: 10 });
  assert.ok(novice.energy.targetKcal > advanced.energy.targetKcal);
  assert.equal(plan({ weeklyTrainingDays: 7 }).context.trainingYears, null);
  let last = Infinity;
  for (let years = 0; years <= 20; years += 0.025) {
    const current = plan({ goal: "gain", trainingYears: years }).energy.targetKcal;
    assert.ok(current <= last + 1e-8);
    if (last !== Infinity) assert.ok(last - current < 2);
    last = current;
  }
});

test("numeric scenario matrix closes energy and contains targets for all supported profiles", () => {
  let checked = 0;
  for (const sex of ["male", "female", "unspecified"])
  for (const age of [18, 35, 60, 80])
  for (const weightKg of [58, 80, 120])
  for (const bodyFatPct of [null, 20, 40])
  for (const sport of ["none", "strength", "running", "cycling", "swimming", "team", "mixed"])
  for (const goal of ["lose", "maintain", "gain", "recomp", "performance"])
  for (const durationMin of [0, 60, 180]) {
    const result = plan({ sex, age, weightKg, bodyFatPct, bodyFatWeightKg: weightKg, bodyFatMethod: "bia", bodyFatDate: "2026-10-01", sport, goal }, { sessions: sport === "none" ? [] : [{ sport, durationMin, intensity: "moderate" }] });
    assert.equal(result.status, "ready");
    const { protein, carbs, fat } = result.macros;
    near(4 * protein.target + 4 * carbs.target + 9 * fat.target, result.energy.targetKcal, 1e-6);
    for (const macro of [protein, carbs, fat]) {
      assert.ok([macro.min, macro.target, macro.max].every(value => Number.isFinite(value) && value >= 0));
      assert.ok(macro.min <= macro.target + 1e-8 && macro.target <= macro.max + 1e-8);
    }
    assert.ok(result.energy.range[0] < result.energy.targetKcal && result.energy.range[1] > result.energy.targetKcal);
    assert.equal(result.context.energyAvailabilityIsDiagnostic, false);
    assert.equal(result.context.macroRangesAreIndependent, false);
    checked++;
  }
  assert.equal(checked, 11340);
});

test("exercise duration and near-boundary body fat values have continuous numeric effects", () => {
  let previous = null;
  for (let durationMin = 0; durationMin <= 180; durationMin += 0.1) {
    const result = plan({}, { sessions: [{ sport: "cycling", durationMin, intensity: "moderate" }] });
    if (previous) {
      assert.ok(result.energy.targetKcal >= previous.energy.targetKcal);
      assert.ok(result.macros.carbs.target >= previous.macros.carbs.target - 1e-8);
      assert.ok(result.energy.targetKcal - previous.energy.targetKcal < 1);
    }
    previous = result;
  }
  for (const boundary of [8, 15, 20, 22, 28, 30, 35, 40]) {
    const a = plan({ goal: "lose", bodyFatPct: boundary - 0.00001, bodyFatWeightKg: 75, bodyFatMethod: "bia", bodyFatDate: "2026-10-01" });
    const b = plan({ goal: "lose", bodyFatPct: boundary + 0.00001, bodyFatWeightKg: 75, bodyFatMethod: "bia", bodyFatDate: "2026-10-01" });
    assert.ok(Math.abs(a.energy.targetKcal - b.energy.targetKcal) < 0.01);
    assert.ok(b.energy.targetKcal <= a.energy.targetKcal + 1e-8);
  }
});

test("sport guidance follows actual sessions, not just preferred sport; long fueling is not extra kcal", () => {
  for (const sport of ["strength", "running", "cycling", "swimming", "team", "mixed"]) {
    const result = plan({ sport: "none" }, { sessions: [{ sport, intensity: "moderate", durationMin: 120 }] });
    assert.equal(result.context.guidanceSport, sport);
    assert.ok(result.guidance.some(item => item.id === "sport"));
    if (sport !== "strength") assert.match(result.guidance.find(item => item.id === "fueling").body, /추가로 더하는 양이 아니/);
  }
});

test("trend needs sufficient dated weights and does not infer tissue change or auto-adjust calories", () => {
  const history = [0, 7, 14, 21].map((offset, index) => ({ date: `2026-09-${String(7 + offset).padStart(2, "0")}`, weightKg: 76 - index * 0.3 }));
  const result = summarizeWeightTrend(history, { date: "2026-10-05", weightKg: 74.8 });
  assert.equal(result.available, true);
  near(result.kgPerWeek, -0.3);
  assert.equal(result.automaticallyApplied, false);
  assert.equal(summarizeWeightTrend(history.slice(0, 2), day).available, false);
  const duplicate = summarizeWeightTrend([...history, { ...history[0], weightKg: 150 }], day);
  assert.equal(duplicate.available, false);
  near(calculatePlan(profile, day, history).energy.targetKcal, plan().energy.targetKcal);
});

test("calculatePlan never mutates profile, day, history or earlier results", () => {
  const history = Object.freeze([Object.freeze({ date: "2026-09-25", weightKg: 75 })]);
  const input = JSON.stringify({ profile, day, history });
  const result = calculatePlan(profile, day, history);
  result.sources[0].label = "changed";
  assert.notEqual(plan().sources[0].label, "changed");
  assert.equal(JSON.stringify({ profile, day, history }), input);
});

test("walking and a first tiny session do not produce an athlete protein cliff", () => {
  const baseline = plan({ sport: "none" });
  for (const sport of ["walking", "strength", "running"]) {
    const tiny = plan({ sport: "none" }, { sessions: [{ sport, intensity: "moderate", durationMin: 0.00001 }] });
    assert.ok(Math.abs(tiny.macros.protein.target - baseline.macros.protein.target) < 0.001);
    assert.ok(Math.abs(tiny.energy.targetKcal - baseline.energy.targetKcal) < 0.001);
  }
  const walk = plan({ sport: "none" }, { sessions: [{ sport: "walking", intensity: "moderate", durationMin: 120 }] });
  assert.equal(walk.context.guidanceSport, "walking");
  assert.ok(!walk.guidance.some(item => item.id === "fueling"));
  near(walk.energy.exerciseKcal, (3.8 - 1) * 75 * 2);
  for (const sport of ["walking", "strength", "running", "cycling", "swimming", "mixed", "team"])
  for (const intensity of ["easy", "moderate", "hard"]) {
    let prior = baseline;
    for (let durationMin = 0.5; durationMin <= 180; durationMin += 0.5) {
      const current = plan({ sport: "none" }, { sessions: [{ sport, intensity, durationMin }] });
      assert.ok(current.macros.carbs.target >= prior.macros.carbs.target - 1e-8, `${sport} ${intensity} ${durationMin}`);
      prior = current;
    }
  }
});

test("carb-fat exchange preserves protein and kcal at all boundaries without mutation", () => {
  for (const goal of ["lose", "maintain", "gain", "recomp", "performance"]) {
    const base = plan({ goal });
    const before = JSON.stringify(base);
    for (const delta of [-10000, -50, -0.00001, 0, 0.00001, 50, 10000]) {
      const adjusted = adjustAllocation(base, delta);
      const { protein, carbs, fat } = adjusted.macros;
      near(4 * protein.target + 4 * carbs.target + 9 * fat.target, base.energy.targetKcal, 1e-6);
      near(protein.target, base.macros.protein.target);
      assert.ok(carbs.target >= carbs.min - 1e-8 && carbs.target <= carbs.max + 1e-8);
      assert.ok(fat.target >= fat.min - 1e-8 && fat.target <= fat.max + 1e-8);
      near(adjusted.context.allocation.appliedCarbDeltaG * 4 + adjusted.context.allocation.appliedFatDeltaG * 9, 0);
      near(adjustAllocation(adjusted, 0).macros.carbs.target, base.macros.carbs.target);
    }
    assert.equal(JSON.stringify(base), before);
  }
  assert.throws(() => adjustAllocation(plan(), Infinity), TypeError);
  assert.equal(adjustAllocation(plan({ age: 17 }), 20).energy.targetKcal, null);
});

test("body composition remains paired to measured weight and fades continuously with age or change", () => {
  const composition = { bodyFatPct: 20, bodyFatWeightKg: 80, bodyFatMethod: "bia", bodyFatDate: "2026-10-05", weightKg: 80, goal: "lose" };
  const measured = plan(composition);
  const changed = plan(composition, { weightKg: 70 });
  near(measured.context.ffmKg, 64);
  near(changed.context.ffmKg, 64);
  assert.equal(changed.context.ffmIsCurrentMeasurement, false);
  assert.equal(changed.context.bodyFatUsable, false);
  assert.equal(changed.context.energyAvailability, null);
  const unpaired = plan({ ...composition, bodyFatWeightKg: null });
  assert.equal(unpaired.context.ffmKg, null);
  assert.equal(unpaired.context.bodyFatUsable, false);
  const absent = { ...profile, ...composition };
  delete absent.bodyFatWeightKg;
  assert.equal(calculatePlan(absent, day).context.ffmKg, null);
  let prior = null;
  for (let daysOld = 0; daysOld <= 181; daysOld++) {
    const date = new Date(Date.parse(day.date) - daysOld * 86400000).toISOString().slice(0, 10);
    const current = plan({ ...composition, bodyFatDate: date });
    if (prior) assert.ok(Math.abs(current.energy.targetKcal - prior.energy.targetKcal) < 2);
    if (daysOld === 180) {
      assert.equal(current.context.bodyCompositionInfluence, 0);
      near(current.energy.targetKcal, plan({ ...composition, bodyFatPct: null }).energy.targetKcal);
    }
    prior = current;
  }
  const justBefore = plan(composition, { weightKg: 72.00001 });
  const justAfter = plan(composition, { weightKg: 71.99999 });
  assert.ok(Math.abs(justBefore.energy.targetKcal - justAfter.energy.targetKcal) < 0.01);
});

test("simple activity and omitted preferences preserve the established numeric path", () => {
  const base = plan();
  near(base.energy.restingKcal, 1673.75);
  near(base.energy.tdeeKcal, 2259.5625);
  near(base.macros.protein.target, 127.5);
  near(base.macros.carbs.target, 267.9234375);
  near(base.macros.fat.target, 75.31875);
  const explicit = plan({ activityMode: "simple", goalPreference: "standard", dailyActivity: { sleepHours: null, workHours: null, workType: null, lifestyleHours: null, lifestyleType: null }, weekdayActivity: { "1": activity } }, { dailyActivity: activity });
  assert.deepEqual(explicit.energy, base.energy);
  assert.deepEqual(explicit.macros, base.macros);
  assert.deepEqual(explicit.context.dailyActivity, { mode: "simple" });
  for (const goal of ["lose", "gain", "recomp", "maintain", "performance"]) {
    const ordinary = plan({ goal }, { sessions: [{ sport: "strength", intensity: "hard", durationMin: 31.25 }] });
    const optionalOff = plan({ goal, activityMode: "simple", goalPreference: "standard" }, { sessions: [{ sport: "strength", intensity: "hard", durationMin: 31.25, cardio: null }] });
    assert.deepEqual(ordinary.energy, optionalOff.energy);
    assert.deepEqual(ordinary.macros, optionalOff.macros);
  }
});

test("detailed time owns all 24 hours and adds gross exercise only over unoccupied time", () => {
  const session = { sport: "running", intensity: "moderate", durationMin: 60 };
  const rest = detailed({ goal: "lose" });
  const trained = detailed({ goal: "lose" }, { sessions: [session] });
  const time = trained.context.dailyActivity;
  assert.equal(time.source, "profile");
  assert.equal(time.restHours, 5);
  near(time.sleepHours + time.workHours + time.lifestyleHours + time.exerciseHours + time.restHours, 24);
  near(time.nonExerciseKcal, trained.energy.restingKcal / 24 * (8 + 8 * 1.5 + 2 * 2.1 + 5 * 1.4));
  near(trained.energy.tdeeKcal, time.nonExerciseKcal + 8.5 * 75);
  near(trained.energy.exerciseKcal, 7.5 * 75);
  near(time.replacedRestKcal, trained.energy.restingKcal / 24 * 1.4);
  near(trained.energy.tdeeKcal - rest.energy.tdeeKcal, 8.5 * 75 - time.replacedRestKcal);
  near(trained.context.goalDeltaKcal, rest.context.goalDeltaKcal);
  near(time.baselineWithoutTrainingKcal, rest.energy.tdeeKcal);
  const repeatedPal = detailed({ activity: "physical" }, { sessions: [session] });
  near(repeatedPal.energy.tdeeKcal, trained.energy.tdeeKcal);
  assert.match(trained.reasons.join(" "), /정확하다고 보장하지/);
});

test("detailed activity distinguishes explicit zero, missing, malformed, and overbooked time", () => {
  for (const dailyActivity of [undefined, null, {}, { ...activity, sleepHours: null }, { ...activity, workHours: "8" }, { ...activity, lifestyleHours: NaN }, { ...activity, workType: null }, { ...activity, lifestyleType: null }, { ...activity, sleepHours: 25 }]) {
    const result = detailed({ dailyActivity });
    assert.equal(result.status, "incomplete", JSON.stringify(dailyActivity));
    assert.equal(result.energy.targetKcal, null);
  }
  const zero = detailed({ dailyActivity: { sleepHours: 8, workHours: 0, workType: null, lifestyleHours: 0, lifestyleType: null } });
  assert.equal(zero.status, "ready");
  assert.equal(zero.context.dailyActivity.restHours, 16);
  assert.equal(zero.context.dailyActivity.coefficients.work, null);
  const full = { ...activity, lifestyleHours: 8 };
  assert.equal(detailed({ dailyActivity: full }).context.dailyActivity.restHours, 0);
  const tooMuch = detailed({ dailyActivity: full }, { sessions: [{ sport: "walking", intensity: "easy", durationMin: 0.001 }] });
  assert.equal(tooMuch.status, "incomplete");
  assert.match(tooMuch.reasons.join(" "), /24시간을 넘/);
  assert.equal(detailed({}, { dailyActivity: [] }).status, "incomplete");
  for (const override of [{ activityMode: "auto" }, { goalPreference: "aggressive" }, { weekdayActivity: [] }, { weekdayActivity: { "7": activity } }, { dailyActivity: { ...activity, workType: "__proto__" } }]) assert.equal(plan(override).status, "incomplete");
});

test("today overrides weekday overrides defaults without merging missing fields or assuming a date", () => {
  const monday = { ...activity, workHours: 4, workType: "standing" };
  const sunday = { ...activity, workHours: 0, workType: null };
  const override = { ...activity, sleepHours: 9, workHours: 0, workType: null };
  const p = { weekdayActivity: { "0": sunday, "1": monday, "2": null } };
  const week = detailed(p);
  assert.equal(week.context.dailyActivity.source, "weekday");
  assert.equal(week.context.dailyActivity.weekday, 1);
  assert.equal(week.context.dailyActivity.workHours, 4);
  assert.equal(detailed(p, { date: "2026-10-04" }).context.dailyActivity.workHours, 0);
  const today = detailed(p, { dailyActivity: override });
  assert.equal(today.context.dailyActivity.source, "day");
  assert.equal(today.context.dailyActivity.sleepHours, 9);
  assert.equal(today.context.dailyActivity.workHours, 0);
  assert.equal(detailed(p, { dailyActivity: { sleepHours: 9 } }).status, "incomplete");
  assert.equal(detailed(p, { dailyActivity: null }).context.dailyActivity.source, "weekday");
  assert.equal(detailed(p, { date: "2026-10-06" }).context.dailyActivity.source, "profile");
  assert.equal(detailed(p, { date: undefined }).status, "incomplete");
  assert.equal(detailed(p, { date: undefined, dailyActivity: override }).status, "ready");
  assert.equal(detailed({}, { date: undefined }).context.dailyActivity.source, "profile");
});

test("time boundaries and activity intensity change continuously without inflating a second session", () => {
  let previous = detailed();
  for (let i = 1; i <= 360; i++) {
    const result = detailed({}, { sessions: [{ sport: "walking", intensity: "easy", durationMin: i }] });
    assert.equal(result.status, "ready");
    assert.ok(result.energy.tdeeKcal > previous.energy.tdeeKcal);
    assert.ok(result.energy.tdeeKcal - previous.energy.tdeeKcal < 3);
    previous = result;
  }
  assert.equal(previous.context.dailyActivity.restHours, 0);
  const mixedSessions = [cardio("walking", { gradePct: 5 }), { sport: "strength", intensity: "hard", durationMin: 45 }, cardio("running")];
  const mixed = detailed({}, { sessions: mixedSessions });
  const split = detailed({}, { sessions: mixedSessions.flatMap(session => [{ ...session, durationMin: session.durationMin / 3 }, { ...session, durationMin: session.durationMin * 2 / 3 }]) });
  near(mixed.energy.tdeeKcal, split.energy.tdeeKcal);
  near(mixed.energy.exerciseKcal, split.energy.exerciseKcal);
  near(mixed.macros.carbs.target, split.macros.carbs.target);
  const base = detailed();
  const shifted = detailed({ dailyActivity: { ...activity, workHours: activity.workHours + 0.0001 } });
  near(shifted.energy.tdeeKcal - base.energy.tdeeKcal, base.energy.restingKcal / 24 * 0.0001 * (1.5 - 1.4));
  const standing = detailed({ dailyActivity: { ...activity, workType: "standing" } });
  const physical = detailed({ dailyActivity: { ...activity, workType: "physical" } });
  assert.ok(base.energy.tdeeKcal < standing.energy.tdeeKcal && standing.energy.tdeeKcal < physical.energy.tdeeKcal);
});

test("ACSM speed and grade are unit-correct, net of their own resting term, and not VO2max", () => {
  const walk = plan({}, { sessions: [cardio("walking", { gradePct: 5 })] });
  const run = plan({}, { sessions: [cardio("running", { gradePct: 3 })] });
  const walkingOxygen = 3.5 + 0.1 * 80 + 1.8 * 80 * 0.05;
  near(walk.context.sessionBreakdown[0].met, walkingOxygen / 3.5);
  near(walk.energy.exerciseKcal, (walkingOxygen - 3.5) * 75 / 1000 * 5 * 30);
  near(walk.context.sessionBreakdown[0].grossKcal, walkingOxygen * 75 / 1000 * 5 * 30);
  near(run.energy.exerciseKcal, (0.2 * (10000 / 60) + 0.9 * (10000 / 60) * 0.03) * 75 / 1000 * 5 * 30);
  const identicalButHard = { ...cardio("walking", { gradePct: 5 }), intensity: "hard" };
  near(plan({}, { sessions: [identicalButHard] }).energy.exerciseKcal, walk.energy.exerciseKcal);
  const outdoor = plan({}, { sessions: [cardio("running", { environment: "outdoor" })] });
  const indoor = plan({}, { sessions: [cardio("running")] });
  near(outdoor.energy.targetKcal, indoor.energy.targetKcal);
  assert.equal(outdoor.context.sessionBreakdown[0].method, "acsm_level_outdoor_approximation");
  assert.ok(outdoor.energy.range[1] - outdoor.energy.range[0] > indoor.energy.range[1] - indoor.energy.range[0]);
  assert.match(outdoor.guidance.find(item => item.id === "cardio-details").body, /바람·지면/);
});

test("detailed cardio rejects missing and unsupported conditions instead of inventing zero or changing gait", () => {
  for (const invalid of [
    cardio("walking", { speedKmh: null }), cardio("walking", { gradePct: null }), cardio("walking", { gradePct: "0" }),
    cardio("walking", { speedKmh: 2.99 }), cardio("walking", { speedKmh: 6.01 }), cardio("running", { speedKmh: 8 }), cardio("running", { speedKmh: 20.01 }),
    cardio("walking", { gradePct: -1 }), cardio("walking", { gradePct: 15.01 }), cardio("running", { environment: "outdoor", gradePct: 2 }),
    cardio("walking", { environment: "pool" }), { ...cardio(), sport: "cycling" }, { ...cardio(), cardio: [] }
  ]) {
    const result = plan({}, { sessions: [invalid] });
    assert.equal(result.status, "incomplete", JSON.stringify(invalid));
    assert.equal(result.energy.exerciseKcal, null);
  }
  for (const sport of ["walking", "running"]) for (const speedKmh of [CARDIO_LIMITS[sport].minSpeedKmh, CARDIO_LIMITS[sport].maxSpeedKmh]) for (const gradePct of [0, 15]) {
    assert.equal(plan({}, { sessions: [cardio(sport, { speedKmh, gradePct })] }).status, "ready");
  }
  assert.equal(plan({}, { sessions: [{ ...cardio(), cardio: null }] }).context.sessionBreakdown[0].method, "representative_met");
});

test("cardio speed, grade, duration and body weight are continuous and monotonic in the supported model", () => {
  for (const sport of ["walking", "running"]) {
    const limits = CARDIO_LIMITS[sport];
    let previous = null;
    for (let i = 0; i <= 100; i++) {
      const speedKmh = limits.minSpeedKmh + (limits.maxSpeedKmh - limits.minSpeedKmh) * i / 100;
      const result = detailed({}, { sessions: [cardio(sport, { speedKmh, gradePct: 3 })] });
      if (previous) assert.ok(result.energy.targetKcal >= previous.energy.targetKcal);
      const plus = detailed({}, { sessions: [cardio(sport, { speedKmh, gradePct: 3.00001 })] });
      assert.ok(plus.energy.targetKcal >= result.energy.targetKcal);
      assert.ok(plus.energy.targetKcal - result.energy.targetKcal < 0.01);
      previous = result;
    }
    const empty = detailed();
    const tiny = detailed({}, { sessions: [{ ...cardio(sport), durationMin: 0.00001 }] });
    assert.ok(tiny.energy.targetKcal - empty.energy.targetKcal < 0.001);
    for (const sex of ["male", "female", "unspecified"]) for (const goal of ["lose", "maintain", "gain", "recomp", "performance"]) {
      let previousWeight = null;
      for (let weightKg = 58; weightKg <= 140; weightKg += 0.5) {
        const current = detailed({ sex, goal, weightKg }, { sessions: [cardio(sport)] });
        assert.equal(current.status, "ready");
        if (previousWeight) assert.ok(current.energy.targetKcal > previousWeight.energy.targetKcal);
        near(current.macros.protein.target * 4 + current.macros.carbs.target * 4 + current.macros.fat.target * 9, current.energy.targetKcal, 1e-6);
        previousWeight = current;
      }
    }
  }
});

test("protein preference stays inside the existing range and conservative goals only reduce the chosen offset", () => {
  for (const age of [18, 35, 60, 80]) for (const sport of ["none", "strength", "running"]) for (const goal of ["lose", "maintain", "gain", "recomp", "performance"]) {
    const standard = detailed({ age, sport, goal });
    const lower = detailed({ age, sport, goal, proteinPreference: "lower" });
    const higher = detailed({ age, sport, goal, proteinPreference: "higher" });
    near(lower.macros.protein.target, standard.macros.protein.min);
    assert.ok(lower.macros.protein.target <= standard.macros.protein.target);
    assert.ok(standard.macros.protein.target <= higher.macros.protein.target);
    assert.ok(higher.macros.protein.target <= standard.macros.protein.max);
    near(lower.energy.targetKcal, standard.energy.targetKcal);
    near(lower.macros.carbs.target - standard.macros.carbs.target, standard.macros.protein.target - lower.macros.protein.target);
    const conservative = detailed({ age, sport, goal, goalPreference: "conservative" });
    near(conservative.context.goalDeltaKcal, standard.context.goalDeltaKcal * (["lose", "gain"].includes(goal) ? 0.5 : 1));
    near(conservative.energy.tdeeKcal, standard.energy.tdeeKcal);
    for (const result of [lower, standard, higher, conservative]) near(result.macros.protein.target * 4 + result.macros.carbs.target * 4 + result.macros.fat.target * 9, result.energy.targetKcal, 1e-6);
  }
});

test("digestive and appetite constraints change guidance, never make an unsupported numeric prescription", () => {
  const base = detailed();
  for (const mealConstraint of ["digestive", "low-appetite"]) {
    const result = detailed({}, { coachCheckin: { energy: null, hunger: null, sleep: null, mealConstraint } });
    assert.deepEqual(result.energy, base.energy);
    assert.deepEqual(result.macros, base.macros);
    assert.ok(result.guidance.some(item => item.id === "meal-constraint"));
    const unsupported = detailed({ healthContext: "clinical" }, { coachCheckin: { mealConstraint } });
    assert.equal(unsupported.status, "review");
    assert.equal(unsupported.energy.targetKcal, null);
  }
});

test("new nested activity, weekday and cardio inputs remain immutable and result objects are detached", () => {
  const p = { ...profile, activityMode: "detailed", dailyActivity: { ...activity }, weekdayActivity: { "1": { ...activity } } };
  const d = { ...day, sessions: [cardio("walking", { gradePct: 4 })], dailyActivity: { ...activity } };
  const before = JSON.stringify({ p, d });
  const result = calculatePlan(p, d);
  result.context.dailyActivity.sleepHours = 999;
  result.context.dailyActivity.coefficients.sleep = 999;
  result.context.sessionBreakdown[0].cardio.gradePct = 999;
  assert.equal(JSON.stringify({ p, d }), before);
  assert.equal(ACTIVITY_PARS.sleep, 1);
  const another = calculatePlan(p, d);
  assert.equal(another.context.dailyActivity.sleepHours, 8);
  assert.equal(another.context.sessionBreakdown[0].cardio.gradePct, 4);
});
