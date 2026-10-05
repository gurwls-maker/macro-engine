const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePlan, adjustAllocation, validateProfile, summarizeWeightTrend } = require("../src/nutrition.js");

const profile = Object.freeze({ sex: "male", age: 35, heightCm: 175, weightKg: 75, bodyFatPct: null, bodyFatWeightKg: null, bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: null, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" });
const day = Object.freeze({ date: "2026-10-05", meals: [], sessions: [], complete: false });
const plan = (overrides = {}, dayOverrides = {}) => calculatePlan({ ...profile, ...overrides }, { ...day, ...dayOverrides });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

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
