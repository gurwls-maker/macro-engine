"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const C = require("../src/training-coaching.js");
const Store = require("../src/training-store.js");

const day = "2026-10-06";
const dates = ["2026-09-21", "2026-09-28", day];
const progression = new Set(["progression-option", "reps-option", "load-option"]);
function block(prefix, exerciseId, count, loadKg = 25, reps = 12, extra = {}) {
  return {
    id: prefix + "-" + exerciseId, rawName: T.catalog.find(row => row.id === exerciseId).label, exerciseId,
    equipmentKey: "synthetic:" + exerciseId, loadConvention: "total", loadRole: "external",
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: "",
    sets: Array.from({ length: count }, (_, index) => ({ id: prefix + "-" + exerciseId + "-" + index, loadKg, reps, marker: null, rir: null })), ...extra
  };
}
function record(id, date, exercises, extra = {}) {
  return { id, date, time: "18:00", label: "Upper", durationMinutes: null, reportedSetCount: null,
    reportedVolumeKg: null, reportedEnergyKcal: null, notes: "", effort: null, pain: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    sequence: { order: "unknown", structure: "unknown" }, exercises, ...extra };
}
function shoulders(prefix) {
  return [block(prefix, "dumbbell_shoulder_press", 2), block(prefix, "dumbbell_lateral_raise", 3, 12, 15)];
}
function history(currentExtra = [], previousExtra = [], currentRecord = {}) {
  const records = dates.map((date, index) => record("day" + index, date,
    [...shoulders("day" + index), ...(index === 2 ? currentExtra : previousExtra.map(ex => {
      const copy = structuredClone(ex); copy.id = "day" + index + "-" + ex.exerciseId;
      copy.sets = copy.sets.map((set, position) => ({ ...set, id: copy.id + "-" + position })); return copy;
    }))], index === 2 ? currentRecord : {}));
  Store.validate({ ...Store.createEmpty(), records });
  return records;
}
function review(records) {
  const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
  return T.coachSession(T.analyze(records, { date: day, profile, includeCapacityHistory: true }), { sessionId: records.at(-1).id, profile });
}
function getRow(value, exerciseId) { return value.rows.find(row => row.blockId === "day2-" + exerciseId); }
function assertShoulderChoices(value) {
  for (const exerciseId of ["dumbbell_shoulder_press", "dumbbell_lateral_raise"]) {
    const row = getRow(value, exerciseId), coaching = row.interpretation.coaching;
    assert.ok(progression.has(row.interpretation.nextAction.kind), exerciseId + " keeps its recorded local progression choice");
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.doesNotMatch(coaching.primaryAction.body, /세트가 늘었|익스터널.*먼저|회전.*안정/);
  }
}

test("coordination exposure follows catalog movement roles, not labels, while leaving observed sets untouched", () => {
  const catalog = [
    { id: "neutral-control", label: "Heavy press", pattern: "rotation", primaryMuscles: ["shoulders"] },
    { id: "neutral-mobility", label: "Chest strength", pattern: "mobility", primaryMuscles: ["chest"] },
    { id: "neutral-cardio", label: "Leg press", pattern: "cardio", primaryMuscles: ["quads"] },
    { id: "neutral-scapular-control", label: "Shoulder strength", pattern: "scapular-control", primaryMuscles: ["shoulders"] },
    { id: "rotation-in-name", label: "Band rotation", pattern: "vertical-push", primaryMuscles: ["shoulders"] }
  ];
  const exercises = catalog.map((row, index) => ({ id: "block" + index, exerciseId: row.id,
    sets: [{ id: "set" + index, loadKg: index ? 30 : 8, reps: 10, marker: null, rir: null }] }));
  const before = structuredClone({ catalog, exercises });
  assert.deepEqual(C.coordinationExposure(exercises, catalog), { workingSets: 1, byMuscle: { shoulders: 1 },
    blockIds: ["block4"], excludedBlockIds: ["block0", "block1", "block2", "block3"] });
  assert.deepEqual({ catalog, exercises }, before);
});

test("adding rotation, mobility and cardio does not turn unchanged shoulder work into an added-load conflict", () => {
  const records = history([block("day2", "external_rotation", 2, 20, 20),
    block("day2", "foam_rolling", 0, null, 0, { durationMinutes: 5 }),
    block("day2", "treadmill", 0, null, 0, { durationMinutes: 60 })]);
  const before = structuredClone(records), value = review(records);
  assertShoulderChoices(value);
  const observed = value.sessionCoaching.sessionChanges;
  assert.equal(observed.previousWorkingSets, 5); assert.equal(observed.currentWorkingSets, 7);
  assert.deepEqual(observed.muscles.find(row => row.id === "shoulders"),
    { id: "shoulders", label: "어깨", previousDirectSets: 5, currentDirectSets: 7 });
  assert.equal(value.sessionCoaching.coordination.mode, "local-progression-options");
  assert.equal(getRow(value, "external_rotation").interpretation.nextAction.kind, "technique-control");
  assert.equal(getRow(value, "treadmill").interpretation.nextAction.kind, "cardio");
  assert.deepEqual(records, before);
});

test("adding actual shoulder pressing still coordinates related progression and preserves its alternative", () => {
  const records = history([block("day2", "machine_shoulder_press", 2, 40, 10)]), before = structuredClone(records);
  const value = review(records);
  for (const exerciseId of ["dumbbell_shoulder_press", "dumbbell_lateral_raise"]) {
    const row = getRow(value, exerciseId), coaching = row.interpretation.coaching;
    assert.equal(coaching.primaryAction.kind, "maintain-coordinated-work");
    assert.ok(progression.has(coaching.progressionCandidate.kind));
    assert.match(coaching.primaryAction.body, /어깨 직접 운동 세트가 늘었/);
  }
  assert.equal(value.sessionCoaching.coordination.mode, "consolidate-changes");
  assert.deepEqual(records, before);
});

test("replacing control sets with actual press work coordinates added main loading even when raw shoulder totals are equal", () => {
  const records = history([block("day2", "machine_shoulder_press", 2, 40, 10)],
    [block("old", "external_rotation", 2, 20, 20)]), value = review(records);
  const muscle = value.sessionCoaching.sessionChanges.muscles.find(row => row.id === "shoulders");
  assert.equal(muscle.currentDirectSets, 7); assert.equal(muscle.previousDirectSets, 7);
  assert.equal(value.sessionCoaching.sessionChanges.currentWorkingSets, value.sessionCoaching.sessionChanges.previousWorkingSets);
  assert.equal(getRow(value, "dumbbell_shoulder_press").interpretation.nextAction.kind, "maintain-coordinated-work");
  assert.match(getRow(value, "dumbbell_shoulder_press").interpretation.nextAction.body, /어깨 주 운동 세트가 늘었/);
});

test("removing main work and adding control work does not manufacture an increased shoulder load", () => {
  const records = history([block("day2", "external_rotation", 3, 8, 20)],
    [block("old", "machine_shoulder_press", 2, 40, 10)]), value = review(records);
  assertShoulderChoices(value);
  assert.equal(value.sessionCoaching.sessionChanges.muscles.find(row => row.id === "shoulders").currentDirectSets, 8);
  assert.equal(value.sessionCoaching.sessionChanges.muscles.find(row => row.id === "shoulders").previousDirectSets, 7);
  assert.equal(value.sessionCoaching.coordination.mode, "local-progression-options");
});

test("a cuff load change retains its own source-backed observation without blocking stable main shoulder work", () => {
  const records = history([block("day2", "external_rotation", 2, 8, 10)],
    [block("old", "external_rotation", 2, 4, 20)]), value = review(records), cuff = getRow(value, "external_rotation");
  assertShoulderChoices(value);
  assert.equal(cuff.interpretation.nextAction.kind, "technique-control");
  assert.deepEqual(cuff.interpretation.coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), [[8, 10], [8, 10]]);
  assert.deepEqual(cuff.interpretation.coaching.facts.previous.sets.map(set => [set.loadKg, set.reps]), [[4, 20], [4, 20]]);
  assert.ok(cuff.interpretation.coaching.signals.length);
});

test("added scapular control sets do not defer stable main work and their observed shoulder totals remain intact", () => {
  const records = history([block("day2", "prone_w_raise", 4, null, 12, { loadRole: "unknown" })],
    [block("old", "prone_w_raise", 2, null, 12, { loadRole: "unknown" })]);
  const before = structuredClone(records), value = review(records), control = getRow(value, "prone_w_raise");
  assertShoulderChoices(value);
  assert.deepEqual(value.sessionCoaching.sessionChanges.muscles.find(row => row.id === "shoulders"),
    { id: "shoulders", label: "어깨", previousDirectSets: 7, currentDirectSets: 9 });
  assert.equal(control.interpretation.nextAction.kind, "technique-control");
  assert.match(control.interpretation.nextAction.body, /12·12·12·12회로 4세트/);
  assert.match(control.interpretation.nextAction.body, /견갑/);
  assert.doesNotMatch(control.interpretation.nextAction.body, /밴드|한 세트에서만 13회|세트가 늘었.*소화/);
  assert.equal(control.interpretation.performance, null);
  assert.deepEqual(records, before);
});

test("scapular-control coaching retains the full unequal vector, actual markers and individual load-change facts", () => {
  const control = block("day2", "prone_w_raise", 3, 8, 8);
  control.sets[2].reps = 7;
  control.sets.unshift({ id: "scapular-warmup", loadKg: null, reps: 10, marker: "W", rir: null });
  control.sets.push({ id: "scapular-assistance", loadKg: null, reps: 6, marker: "A", rir: null });
  const records = history([control], [block("old", "prone_w_raise", 3, 4, 10)]), before = structuredClone(records);
  const value = review(records), row = getRow(value, "prone_w_raise");
  assertShoulderChoices(value);
  assert.equal(row.interpretation.nextAction.kind, "technique-control");
  assert.match(row.interpretation.nextAction.body, /8kg × 8·8·7회로 3세트/);
  assert.match(row.interpretation.nextAction.body, /뒤 세트는 첫 세트의 횟수에 억지로 맞추지/);
  assert.deepEqual(row.interpretation.coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), [[8, 8], [8, 8], [8, 7]]);
  assert.deepEqual(row.interpretation.coaching.facts.previous.sets.map(set => [set.loadKg, set.reps]), [[4, 10], [4, 10], [4, 10]]);
  assert.equal(row.interpretation.coaching.facts.current.warmupSets[0].id, "scapular-warmup");
  assert.equal(value.session.markedSets, 1);
  assert.ok(row.interpretation.coaching.signals.length);
  assert.deepEqual(records, before);
});

test("scapular-control RIR zero and individual hard or limiting feedback remain protective, not whole-session conflicts", () => {
  for (const feeling of [null, "hard", "limit", "comfortable"]) {
    const control = block("day2", "prone_w_raise", 2, null, 10, { loadRole: "unknown" });
    if (feeling) control.feedback = { setId: control.sets[0].id, feeling, loadKg: null, reps: 10 };
    else control.sets[0].rir = 0;
    const records = history([control]), before = structuredClone(records), value = review(records), row = getRow(value, "prone_w_raise");
    assertShoulderChoices(value);
    if (feeling === "comfortable") assert.equal(row.interpretation.nextAction.kind, "technique-control");
    else if (feeling === "hard") assert.match(row.interpretation.nextAction.body, /힘들었다고/);
    else {
      assert.equal(row.interpretation.nextAction.kind, "ease");
      assert.match(row.interpretation.nextAction.body, feeling === "limit" ? /한계에 가까웠다고/ : /RIR 0/);
    }
    assert.match(row.interpretation.nextAction.body, /견갑/);
    assert.deepEqual(row.interpretation.nextAction.focusSetIds, [control.sets[0].id]);
    assert.equal(row.interpretation.coaching.facts.current.sets[1].rir, null);
    assert.deepEqual(records, before);
  }
});

test("replacing scapular control with actual presses still recognizes new main loading despite equal observed shoulder sets", () => {
  const records = history([block("day2", "machine_shoulder_press", 2, 40, 10)],
    [block("old", "prone_w_raise", 2, null, 12, { loadRole: "unknown" })]), value = review(records);
  const muscle = value.sessionCoaching.sessionChanges.muscles.find(row => row.id === "shoulders");
  assert.equal(muscle.currentDirectSets, 7); assert.equal(muscle.previousDirectSets, 7);
  assert.equal(getRow(value, "dumbbell_shoulder_press").interpretation.nextAction.kind, "maintain-coordinated-work");
  assert.match(getRow(value, "dumbbell_shoulder_press").interpretation.nextAction.body, /어깨 주 운동 세트가 늘었/);
});

test("pain still overrides scapular-control guidance and no exercise is converted into a rehabilitation diagnosis", () => {
  const records = history([block("day2", "prone_w_raise", 2, null, 12, { loadRole: "unknown" })], [], { pain: "mild" });
  const value = review(records), row = getRow(value, "prone_w_raise");
  assert.equal(row.interpretation.nextAction.kind, "individual-care");
  assert.match(row.interpretation.nextAction.body, /통증/);
  assert.doesNotMatch(row.interpretation.nextAction.body, /재활|충돌증후군|회전근개.*손상/);
  assert.equal(Object.hasOwn(row.interpretation.coaching, "progressionCandidate"), false);
});

test("cuff RIR zero and difficult or limiting feedback survive control guidance without becoming a global conflict", () => {
  for (const feeling of [null, "hard", "limit"]) {
    const cuff = block("day2", "external_rotation", 2, 8, 10);
    if (feeling) cuff.feedback = { setId: cuff.sets[0].id, feeling, loadKg: 8, reps: 10 };
    else cuff.sets[0].rir = 0;
    const records = history([cuff]), before = structuredClone(records), value = review(records), row = getRow(value, "external_rotation");
    assertShoulderChoices(value);
    if (feeling === "hard") assert.match(row.interpretation.nextAction.body, /힘들었다고/);
    else {
      assert.equal(row.interpretation.nextAction.kind, "ease");
      assert.match(row.interpretation.nextAction.body, feeling === "limit" ? /한계에 가까웠다고/ : /RIR 0/);
    }
    assert.match(row.interpretation.nextAction.body, /반동|가동범위/);
    assert.deepEqual(row.interpretation.nextAction.focusSetIds, [cuff.sets[0].id]);
    assert.deepEqual(records, before);
  }
});

test("reported pain continues to override cuff and other exercises rather than being ignored by the exposure distinction", () => {
  const records = history([block("day2", "external_rotation", 2, 8, 10)], [], { pain: "mild" });
  const value = review(records);
  for (const row of value.rows) {
    assert.equal(row.interpretation.nextAction.kind, "individual-care");
    assert.match(row.interpretation.nextAction.body, /통증/);
    assert.equal(Object.hasOwn(row.interpretation.coaching, "progressionCandidate"), false);
  }
});

test("a first session has no inferred load expansion and invalid or marked sets do not enter the pure coordination count", () => {
  const first = record("day2", day, shoulders("day2")), value = review([first]);
  assert.equal(value.rows.length, 2); assert.equal(value.sessionCoaching.coordination.mode, "local-progression-options");
  const movement = { id: "main", pattern: "horizontal-push", primaryMuscles: ["chest"] };
  const sets = [
    { id: "body", loadKg: null, reps: 10, marker: null, rir: null },
    { id: "zero", loadKg: 0, reps: 10, marker: null, rir: null },
    { id: "unknown", loadKg: 20, reps: null, marker: null, rir: null },
    { id: "warm", loadKg: 20, reps: 10, marker: "W", rir: null },
    { id: "alternate", loadKg: 20, reps: 10, marker: "A", rir: null },
    { id: "negative", loadKg: -1, reps: 10, marker: null, rir: null },
    { id: "conflict", loadKg: 20, reps: 10, marker: null, rir: null },
    { id: "conflict", loadKg: 20, reps: 9, marker: null, rir: null }
  ];
  assert.deepEqual(C.coordinationExposure([{ id: "mixed", exerciseId: "main", sets }, { id: "unknown-movement", exerciseId: null, sets }], [movement]),
    { workingSets: 2, byMuscle: { chest: 2 }, blockIds: ["mixed"], excludedBlockIds: ["unknown-movement"] });
});
