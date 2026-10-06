const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/coach-context.js");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const T = require("../src/training.js");
const N = require("../src/nutrition.js");
const Coach = require("../src/coach.js");

const date = "2026-10-06";
const profile = { sex: "male", age: 35, heightCm: 175, weightKg: 75, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 3, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
const emptyDay = date => ({ date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown",
  carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null });
const meal = id => ({ id, name: "평소 식사", protein: 30, carbs: 50, fat: 10, otherKcal: 0, alcoholG: 0 });
function state(scope = "auto", p = profile) {
  return { ...S.createEmpty(), profile: p ? structuredClone(p) : null, training: TS.createEmpty(), trackingScope: scope, days: { [date]: emptyDay(date) } };
}
function record(id, day = date, pain = null) {
  return { id, date: day, time: null, label: "상체", durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, relativePath: null, extractionVersion: null },
    exercises: [{ id: `${id}:e`, rawName: "바벨 벤치 프레스", exerciseId: "barbell-bench-press", equipmentKey: "gym-a:bench", loadConvention: "total", notes: "",
      sets: [{ id: `${id}:s`, loadKg: 40, reps: 10, marker: null, rir: null }] }], notes: "", effort: null, pain };
}
function completed(day, p = profile) {
  day.meals = [meal(`${day.date}:meal`)]; day.planSnapshot = N.calculatePlan(p, day); day.planSnapshot.context.goal = p.goal; day.complete = true; return day;
}
function coach(raw, question = "") {
  const decisionContext = C.build(raw, date, { question });
  const analysis = T.analyze(raw.training.records, { date, profile: raw.profile, checkins: raw.days, mappings: raw.training.mappings });
  return Coach.buildCoach(raw.profile, raw.days[date], Object.values(raw.days), { decisionContext, trainingAnalysis: analysis, training: raw.training });
}

test("scope preference is optional, strict, round-trippable, and dietary merge retains current preference", () => {
  const legacy = state(); delete legacy.trackingScope;
  assert.equal(C.build(legacy, date).scope.preference, "auto");
  assert.equal(Object.hasOwn(S.validateState(legacy), "trackingScope"), false);
  for (const scope of ["auto", "nutrition", "training", "both"]) {
    const raw = state(scope);
    assert.equal(S.parseBackup(S.exportBackup(raw)).state.trackingScope, scope);
  }
  for (const value of [null, 0, "food", {}, ["both"]]) assert.throws(() => S.validateState({ ...state(), trackingScope: value }), /기록 활용/);
  assert.equal(S.mergeBackup(state("training"), state("nutrition")).trackingScope, "training");
  assert.equal(S.createEmpty().trackingScope, "auto");
});

test("food-only automatic scope describes data without turning missing exercise into rest", () => {
  const raw = state(); raw.days[date].meals.push(meal("m"));
  const context = C.build(raw, date);
  assert.equal(context.scope.effective, "nutrition");
  assert.equal(context.scope.trainingEnabled, false);
  assert.equal(context.training.missingIsRest, false);
  assert.equal(context.nutrition.selectedDayStatus, "partial");
  assert.equal(context.nutrition.canAssessSelectedWholeDay, false);
  const result = coach(raw);
  assert.ok(!result.questions.some(row => /^training/.test(row.id)));
  assert.ok(!result.priorities.some(row => /^training/.test(row.id)));
  assert.ok(!result.context.missingSignals.some(row => ["composition", "training-plan", "performance"].includes(row.id)));
});

test("training-only works without numeric nutrition profile, food records, RIR, or body composition", () => {
  const raw = state("training", null); raw.training.records.push(record("r"));
  const context = C.build(raw, date);
  assert.equal(context.scope.effective, "training");
  assert.equal(context.body.optional, true);
  assert.equal(context.body.pairedMeasurementAvailable, false);
  assert.equal(context.nutrition.selectedIntake, null);
  assert.equal(context.constraints.nutritionCauseEstablished, false);
  assert.equal(context.training.coverage.unknownEffortSets, 1);
  const result = coach(raw);
  assert.equal(result.status, "tracking");
  assert.equal(result.context.targetKcal, undefined);
  assert.equal(result.context.totals, null);
  assert.ok(!result.priorities.some(row => ["onboarding", "start", "one-meal", "low-energy"].includes(row.id)));
  assert.ok(!/성별.*나이.*키/.test(JSON.stringify(result)));
  assert.ok(!result.questions.some(row => ["next-meal", "target", "composition"].includes(row.id)));
});

test("explicit both never becomes training-only because food records are absent", () => {
  const raw = state("both"); raw.training.records.push(record("r"));
  const context = C.build(raw, date);
  assert.equal(context.scope.effective, "both");
  assert.equal(context.scope.explicit, true);
  assert.equal(context.scope.observed.nutrition, false);
  assert.equal(context.scope.nutritionEnabled, true);
  assert.equal(context.nutrition.coverage.daysWithoutMeals, 7);
  assert.equal(context.nutrition.selectedIntake, null);
  assert.ok(context.nextObservations.some(row => row.id === "nutrition-coverage"));
});

test("automatic scope retains historical covered types over a current record gap", () => {
  const raw = state(); raw.days["2026-09-01"] = { ...emptyDay("2026-09-01"), meals: [meal("old-meal")] };
  raw.training.records.push(record("old-record", "2026-09-01"));
  const context = C.build(raw, date);
  assert.equal(context.scope.effective, "both");
  assert.deepEqual(context.scope.observed, { nutrition: false, training: false });
  assert.equal(context.training.coverage.unknownDays, 7);
  assert.equal(context.nutrition.coverage.daysWithoutMeals, 7);
  assert.equal(context.training.missingIsRest, false);
});

test("seven-day coverage includes boundaries, separates completed/partial meals and ignores future", () => {
  const raw = state("both");
  raw.days["2026-09-30"] = completed(emptyDay("2026-09-30"));
  raw.days["2026-10-01"] = { ...emptyDay("2026-10-01"), meals: [meal("partial")] };
  raw.days["2026-09-29"] = completed(emptyDay("2026-09-29"));
  raw.days["2026-10-07"] = completed(emptyDay("2026-10-07"));
  raw.training.records.push(record("boundary", "2026-09-30"), record("before", "2026-09-29"), record("future", "2026-10-07"));
  const context = C.build(raw, date);
  assert.deepEqual(context.window, { from: "2026-09-30", to: date, days: 7 });
  assert.equal(context.nutrition.coverage.completeMealDays, 1);
  assert.equal(context.nutrition.coverage.partialMealDays, 1);
  assert.equal(context.training.coverage.recordCount, 1);
  assert.deepEqual(context.training.actualRecordIds, ["boundary"]);
  assert.throws(() => C.build(raw, "2026-02-30"), /날짜/);
});

test("activity records count as actual coverage without invented strength sets", () => {
  const raw = state("training"); raw.days[date].sessions.push({ id: "run", sport: "running", durationMin: 30, intensity: "easy" });
  const context = C.build(raw, date);
  assert.equal(context.scope.observed.training, true);
  assert.equal(context.training.coverage.daysWithAnyTrainingRecord, 1);
  assert.equal(context.training.coverage.activityOnlyDays, 1);
  assert.equal(context.training.coverage.workingSets, 0);
  assert.equal(context.training.coverage.unknownDays, 6);
});

test("missing load/reps/effort remain unknown and confirmed zero load remains known", () => {
  const raw = state("training"); const r = record("r");
  r.exercises[0].sets = [{ id: "zero", loadKg: 0, reps: 10, marker: null, rir: 0 },
    { id: "unknown", loadKg: null, reps: null, marker: null, rir: null }]; raw.training.records.push(r);
  const context = C.build(raw, date);
  assert.equal(context.training.coverage.setsWithKnownLoad, 1);
  assert.equal(context.training.coverage.setsWithUnknownLoad, 1);
  assert.equal(context.training.coverage.setsWithKnownReps, 1);
  assert.equal(context.training.coverage.setsWithUnknownReps, 1);
});

test("measurement pairs require historical matching weight, not current weight or skeletal muscle", () => {
  const raw = state("training", { ...profile, bodyFatPct: 20, bodyFatDate: "2026-10-01", bodyFatWeightKg: null, bodyFatMethod: "bia" });
  let context = C.build(raw, date);
  assert.equal(context.body.bodyFatKnown, true);
  assert.equal(context.body.pairedMeasurementAvailable, false);
  raw.profile.bodyFatWeightKg = 72;
  context = C.build(raw, date);
  assert.equal(context.body.pairedMeasurementAvailable, true);
  assert.equal(context.body.paired.weightKg, 72);
  assert.equal(context.body.pairedMethodKnown, true);
  raw.profile.bodyFatDate = "2026-10-07";
  assert.equal(C.build(raw, date).body.pairedMeasurementAvailable, false);
});

test("new goal is distinguished from completed target without inventing a transition date", () => {
  const raw = state("both", { ...profile, goal: "gain" });
  raw.days["2026-10-05"] = completed(emptyDay("2026-10-05"), { ...profile, goal: "lose" });
  const before = JSON.stringify(raw);
  const context = C.build(raw, date, { question: "이제 목표를 바꿀래. 지난 합의는 취소하고 여행 중이야." });
  assert.equal(context.goal.changeObserved, true);
  assert.equal(context.goal.lastCompletedTarget, "lose");
  assert.equal(context.goal.current, "gain");
  assert.equal(context.goal.effectiveSince, null);
  assert.equal(context.currentReport.contextChangeRequested, true);
  assert.equal(context.currentReport.reportedSituationKeywords.travel, true);
  assert.equal(context.currentReport.persisted, false);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(coach(raw).priorities[0].id, "current-goal");
});

test("completed target remains intact under current scope/profile changes", () => {
  const raw = state("both", { ...profile, goal: "gain", weightKg: 100 });
  raw.days[date] = completed(emptyDay(date), { ...profile, goal: "lose" });
  const snapshot = structuredClone(raw.days[date].planSnapshot);
  const context = C.build(raw, date);
  const result = coach(raw);
  assert.equal(context.nutrition.target.source, "saved-target");
  assert.equal(context.nutrition.target.goal, "lose");
  assert.equal(context.nutrition.target.kcal, snapshot.energy.targetKcal);
  assert.equal(result.context.targetKcal, snapshot.energy.targetKcal);
  assert.equal(result.context.goal, "lose");
  assert.deepEqual(raw.days[date].planSnapshot, snapshot);
});

test("pain safety dominates nutrition-only and missing-profile training summaries", () => {
  for (const scope of ["nutrition", "training", "both"]) {
    const raw = state(scope, null); raw.training.records.push(record("pain", date, "stop"));
    if (scope === "nutrition") raw.days[date].meals.push(meal("m"));
    const result = coach(raw);
    assert.equal(result.priorities[0].kind, "safety");
    assert.match(result.priorities[0].body, /중단|멈/);
  }
  const raw = state("training", null); raw.training.records.push(record("pain", date, "stop"));
  const result = Coach.buildCoach(null, raw.days[date], [], { decisionContext: C.build(raw, date) });
  assert.equal(result.priorities[0].id, "current-pain");
});

test("clinical numeric planning restriction does not block recording", () => {
  const raw = state("training", { ...profile, healthContext: "clinical" });
  raw.training.records.push(record("r"));
  const context = C.build(raw, date), result = coach(raw);
  assert.equal(context.constraints.recordingAvailable, true);
  assert.equal(context.constraints.numericNutritionPlanAvailable, false);
  assert.equal(context.constraints.generalAdultTrainingPlanSupported, false);
  assert.equal(result.status, "tracking");
  assert.equal(result.priorities[0].kind, "safety");
  assert.ok(result.questions.some(row => row.action === "nav-training"));
});

test("new statements never replace saved checkins and missing checkins do not become good recovery", () => {
  const raw = state("training"); raw.days[date].coachCheckin = { energy: "good", hunger: null, sleep: "good" };
  const before = JSON.stringify(raw);
  const context = C.build(raw, date, { question: "오늘 잠은 별로야. 오래 쉬었다가 복귀했어." });
  assert.equal(context.checkins.selected.sleep, "good");
  assert.match(context.currentReport.text, /잠은 별로/);
  assert.equal(context.currentReport.reportedSituationKeywords.returnFromBreak, true);
  assert.equal(context.constraints.currentReportOverridesSavedState, false);
  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(C.build(state("training"), date).training.recovery.status, "okay");
});

test("scope none chooses an actual record flow and supplied state works without manual context", () => {
  const raw = state("auto", null);
  const result = Coach.buildCoach(null, raw.days[date], [], { state: raw });
  assert.equal(result.status, "tracking");
  assert.equal(result.priorities[0].id, "record-scope");
  assert.ok(!result.priorities.some(row => row.id === "onboarding"));
  assert.equal(result.context.decisionContext.scope.effective, "none");
  assert.ok(result.context.missingSignals.length <= 2);
  assert.equal(result.questions.find(row => row.id === "record-scope").action, "tracking-scope");
  const withProfile = state("auto");
  const profiled = coach(withProfile);
  assert.equal(profiled.context.decisionContext.scope.effective, "none");
  assert.equal(profiled.questions.find(row => row.id === "record-scope").label, "어떻게 시작할까요?");
  assert.match(profiled.questions.find(row => row.id === "record-scope").answer, /AI 판독 뒤 확인/);
  assert.equal(profiled.context.totals, null);
});

test("partial actual exercise and an unlinked plan remain separate without recording an obligatory catch-up", () => {
  const raw = state("training"); const actual = record("partial"); raw.training.records.push(actual);
  const prescription = { id: "day-one", name: "상체", exercises: [{ id: "target", exerciseId: "barbell-bench-press", label: "벤치 프레스",
    sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 90, loadKg: null, equipmentKey: "gym-a:bench", loadConvention: "total" }] };
  raw.training.planning.schedule.push({ id: "done-part", date, programId: "p", dayId: "day-one", prescription, recordId: actual.id, status: "performed", adjustment: null },
    { id: "unlinked", date, programId: "p", dayId: "day-one", prescription, recordId: null, status: "planned", adjustment: null });
  const before = JSON.stringify(raw), context = C.build(raw, date);
  assert.equal(context.training.todayPlans[0].comparison.rows[0].status, "partial");
  assert.equal(context.training.todayPlans[1].comparison.status, "unrecorded");
  assert.equal(context.training.todayPlans[1].comparison.restVerified, false);
  assert.ok(context.nextObservations.some(row => row.id === "plan-actual"));
  assert.equal(JSON.stringify(raw), before);
});

test("invalid and overflowing food totals remain unknown rather than numerical zero", () => {
  const raw = state("nutrition"); raw.days[date].meals = [{ ...meal("invalid"), protein: Number.MAX_VALUE }];
  const context = C.build(raw, date);
  assert.equal(context.nutrition.selectedDayStatus, "invalid");
  assert.equal(context.nutrition.selectedIntake, null);
  assert.equal(context.nutrition.coverage.invalidMealDays, 1);
  assert.equal(context.nutrition.canAssessSelectedWholeDay, false);
});

test("large plan detail is explicitly bounded but hidden unlinked plans still request actual confirmation", () => {
  const raw = state("training");
  for (let i = 0; i < 7; i++) raw.training.planning.schedule.push({ id: `a:${i}`, date, status: i === 6 ? "planned" : "skipped", recordId: null });
  const context = C.build(raw, date);
  assert.equal(context.training.todayPlans.length, 6);
  assert.equal(context.training.todayPlanCount, 7);
  assert.equal(context.training.todayPlansSampled, true);
  assert.equal(context.training.hasUnlinkedTodayPlan, true);
  assert.ok(context.nextObservations.some(row => row.id === "plan-actual"));
});

test("same-date body disagreements prefer day values consistently with calculation but retain both sources", () => {
  const raw = state("both", { ...profile, bodyFatDate: date, bodyFatPct: 30, bodyFatWeightKg: 80, bodyFatMethod: "bia" });
  Object.assign(raw.days[date], { weightKg: 80, bodyFatPct: 12, bodyFatMethod: "dxa" });
  const before = JSON.stringify(raw), context = C.build(raw, date);
  const actualPlan = N.calculatePlan(N.profileForDay(raw.profile, raw.days[date]), raw.days[date]);
  assert.equal(context.body.latest.bodyFatPct, 12);
  assert.equal(context.body.latest.method, "dxa");
  assert.equal(context.body.paired.bodyFatPct, 12);
  assert.equal(context.body.hasConflicts, true);
  assert.equal(context.body.pairedObservationUnambiguous, false);
  assert.deepEqual(context.body.conflicts[0].fields, ["bodyFatPct", "method"]);
  assert.deepEqual(context.body.conflicts[0].observations.map(row => row.bodyFatPct), [12, 30]);
  assert.equal(context.body.authoritativeSelectedSource, "day-measurement");
  assert.equal(context.body.selectedReference.bodyFatPct, 12);
  assert.equal(context.body.calculationReference.weightKg, actualPlan.context.bodyFatReferenceWeightKg);
  assert.equal(context.nutrition.target.kcal, actualPlan.energy.targetKcal);
  assert.equal(JSON.stringify(raw), before);
});

test("same-date method disagreements remain explicit even when body numbers match", () => {
  const raw = state("both", { ...profile, bodyFatDate: date, bodyFatPct: 20, bodyFatWeightKg: 80, bodyFatMethod: "bia" });
  Object.assign(raw.days[date], { weightKg: 80, bodyFatPct: 20, bodyFatMethod: "dxa" });
  const body = C.build(raw, date).body;
  assert.equal(body.paired.method, "dxa");
  assert.equal(body.pairedMethodKnown, true, "the recorded method is known, not proof of a unique physiological measurement");
  assert.equal(body.pairedObservationUnambiguous, false);
  assert.deepEqual(body.conflicts[0].fields, ["method"]);
});

test("identical same-date pairs deduplicate without losing the daily skeletal-muscle observation", () => {
  const raw = state("both", { ...profile, bodyFatDate: date, bodyFatPct: 20, bodyFatWeightKg: 80, bodyFatMethod: "bia" });
  Object.assign(raw.days[date], { weightKg: 80, bodyFatPct: 20, bodyFatMethod: "bia", skeletalMuscleKg: 35 });
  const body = C.build(raw, date).body;
  assert.equal(body.hasConflicts, false);
  assert.equal(body.conflicts.length, 0);
  assert.equal(body.pairedObservationUnambiguous, true);
  assert.equal(body.latest.skeletalMuscleKg, 35);
  assert.equal(body.paired.skeletalMuscleKg, 35);
  assert.deepEqual(body.paired.sources, ["day-measurement", "profile-measurement"]);
});

test("an unpaired day body-fat observation never borrows profile weight to form a pair", () => {
  const raw = state("both", { ...profile, bodyFatDate: date, bodyFatPct: 30, bodyFatWeightKg: 80, bodyFatMethod: "bia" });
  Object.assign(raw.days[date], { weightKg: null, bodyFatPct: 20, bodyFatMethod: "dxa" });
  const body = C.build(raw, date).body;
  assert.equal(body.latest.weightKg, null);
  assert.equal(body.paired, null);
  assert.equal(body.pairedMeasurementAvailable, false);
  assert.equal(body.selectedReference.weightKg, null);
  assert.equal(body.selectedReferencePaired, false);
  assert.equal(body.authoritativeSelectedSource, "day-measurement");
  assert.equal(body.hasConflicts, true);
  assert.equal(body.conflicts[0].observations[1].weightKg, 80, "the original profile evidence is retained, not silently merged");
});
