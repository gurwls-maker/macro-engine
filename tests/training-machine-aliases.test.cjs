"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const exercise = (id, rawName, extra = {}) => ({ id, rawName, exerciseId: null, equipmentKey: null,
  loadConvention: "as-recorded", loadRole: "unknown", sets: [{ id: id + "-set", loadKg: 25, reps: 10, marker: null, rir: null }], ...extra });
const record = (id, date, exercises) => ({ id, date, time: "18:00", label: "합성 운동", exercises,
  source: { kind: "manual", hash: null }, sequence: { order: "unknown", structure: "unknown" } });

test("exact butterfly machine names resolve to chest pec deck without inventing model or load units", () => {
  for (const rawName of ["STA7000 버터플라이 머신", "STA 7000 버터플라이머신", "디랙스 머신 버터플라이",
    "[합성 모델 A] 버터플라이 머신", "합성 모델 B | pec deck machine", "Infinity butterfly machine"]) {
    const description = T.describeExercise(rawName);
    assert.equal(description.resolved.id, "machine_pec_deck", rawName);
    assert.equal(description.resolved.equipment, "machine");
    assert.deepEqual(description.resolved.primaryMuscles, ["chest"]);
    assert.equal(description.loadConvention, "as-recorded");
    assert.equal(description.loadRole, "unknown");
    assert.equal(description.resolved.comparableKey, null);
    assert.ok(description.equipmentKey);
    assert.equal(description.variantKey, description.movementName.toLowerCase().replace(/[\s_-]+/g, ""));
  }
});

test("exact Drax arm curl aliases resolve a machine curl, never a dumbbell curl", () => {
  for (const rawName of ["디랙스 암 컬", "  디랙스  암컬  ", "Drax arm curl", "DRAX BICEPS CURL",
    "STA7000 머신 암 컬", "[합성 모델 A] 머신 바이셉스 컬"]) {
    const description = T.describeExercise(rawName);
    assert.equal(description.resolved.id, "machine_arm_curl", rawName);
    assert.equal(description.resolved.equipment, "machine");
    assert.equal(description.resolved.pattern, "elbow-flexion");
    assert.deepEqual(description.resolved.primaryMuscles, ["biceps"]);
    assert.equal(description.loadConvention, "as-recorded");
    assert.equal(description.resolved.comparableKey, null);
  }
});

test("compact known-brand prefixes are split only when the remaining movement is an exact known alias", () => {
  for (const [rawName, equipmentKey, movementName, exerciseId] of [
    ["STA7000버터플라이머신", "STA7000", "버터플라이머신", "machine_pec_deck"],
    ["디랙스암컬", "디랙스", "암컬", "machine_arm_curl"],
    ["디랙스암컬해머원암", "디랙스", "암컬해머원암", "machine_hammer_curl"],
    ["Drax머신해머컬", "디랙스", "머신해머컬", "machine_hammer_curl"],
    ["Infinity머신플라이", "인피니티", "머신플라이", "machine_pec_deck"]
  ]) {
    const description = T.describeExercise(rawName);
    assert.equal(description.rawName, rawName); assert.equal(description.equipmentKey, equipmentKey, rawName);
    assert.equal(description.movementName, movementName); assert.equal(description.equipmentSource, "name-prefix");
    assert.equal(description.resolved.id, exerciseId); assert.equal(description.resolved.comparableKey, null);
  }
  for (const rawName of ["Draxish머신플라이", "STA70001머신플라이", "디랙스미확인머신", "STA7000", "인피니티unknownmodel"]) {
    assert.equal(T.parseExerciseName(rawName).equipmentKey, null, rawName);
    assert.equal(T.resolveExercise(rawName), null, rawName);
  }
});

test("a specific machine hammer one-arm name preserves its movement and per-side raw load", () => {
  for (const rawName of ["디랙스 암 컬 해머 원 암", "DRAX arm curl hammer one arm", "디랙스 암컬 해머 원암",
    "STA7000 머신 원 암 해머 컬", "[합성 모델 A] 원 암 머신 해머 컬", "합성 모델 B | machine hammer curl one-arm"]) {
    const raw = exercise("hammer", rawName), before = structuredClone(raw);
    const description = T.describeExercise(raw);
    assert.equal(description.resolved.id, "machine_hammer_curl", rawName);
    assert.equal(description.resolved.equipment, "machine");
    assert.equal(description.loadConvention, "per-side");
    assert.equal(description.loadConventionSource, "name-rule");
    assert.equal(description.loadRole, "unknown");
    const result = T.analyze([record("current", "2026-10-05", [raw])], { date: "2026-10-05", includeCapacityHistory: true });
    assert.equal(result.lastSession.exercises[0].sets[0].loadKg, 25);
    assert.equal(result.capacityHistory.samples[0].sets[0].loadKg, 25);
    assert.equal(result.capacityHistory.samples[0].loadConvention, "per-side");
    assert.deepEqual(raw, before);
  }
});

test("machine, dumbbell, standard and neutral-grip curls remain separate movement identities", () => {
  for (const [rawName, id, convention] of [["디랙스 암 컬", "machine_arm_curl", "as-recorded"],
    ["디랙스 암 컬 해머", "machine_hammer_curl", "as-recorded"], ["디랙스 암 컬 해머 원 암", "machine_hammer_curl", "per-side"],
    ["덤벨 컬", "dumbbell_curl", "per-side"], ["덤벨 해머 컬", "hammer_curl", "per-side"],
    ["[머신] 해머 컬", "machine_hammer_curl", "as-recorded"], ["[덤벨] 해머 컬", "hammer_curl", "per-side"]]) {
    const description = T.describeExercise(rawName);
    assert.equal(description.resolved.id, id, rawName); assert.equal(description.loadConvention, convention, rawName);
  }
  assert.deepEqual(T.relatedExerciseIds("machine_hammer_curl"), ["machine_hammer_curl"]);
  assert.deepEqual(T.relatedExerciseIds("machine_arm_curl"), ["machine_arm_curl"]);
});

test("reverse butterfly, rear-delt fly and vague arm names never become forward chest or machine curl aliases", () => {
  for (const rawName of ["STA7000 리버스 버터플라이 머신", "디랙스 리버스 머신 플라이", "Drax reverse butterfly machine",
    "[합성 모델 A] rear delt pec deck", "리어 델트 버터플라이 머신", "암 컬", "원 암 컬", "머신 컬",
    "개인브랜드 암 컬", "디랙스 암 컬 새로운 그립", "디랙스 암 컬 해머 원 암 변형", "[바벨] 해머 컬", "[덤벨] 머신 해머 컬"]) {
    assert.equal(T.resolveExercise(rawName), null, rawName);
  }
});

test("three resolved machine movements contribute only recorded muscle sets and never fabricate growth or conversion", () => {
  const records = [record("current", "2026-10-05", [exercise("fly", "STA7000 버터플라이 머신"),
    exercise("curl", "디랙스 암 컬"), exercise("hammer", "디랙스 암 컬 해머 원 암")])];
  const before = structuredClone(records), result = T.analyze(records, { date: "2026-10-05", includeCapacityHistory: true });
  assert.equal(result.coverage.unresolvedExercises, 0); assert.equal(result.coverage.workingSets, 3);
  assert.equal(result.muscles.find(row => row.id === "chest").directSets, 1);
  assert.equal(result.muscles.find(row => row.id === "biceps").directSets, 2);
  assert.equal(result.growthRate, undefined);
  assert.equal(result.capacityHistory.samples.length, 3);
  assert.deepEqual(records, before);
});

test("same manufacturer never merges arm curl versus hammer or two individual machine models", () => {
  const samples = [exercise("curl", "디랙스 암 컬"), exercise("hammer", "디랙스 암 컬 해머 원 암"),
    exercise("model-A", "[합성 모델 A] 머신 해머 컬"), exercise("model-B", "[합성 모델 B] 머신 해머 컬")];
  const result = T.analyze([record("current", "2026-10-05", samples)], { date: "2026-10-05" });
  assert.equal(result.progression.length, 4);
  assert.equal(result.progression.filter(row => row.exerciseId === "machine_arm_curl").length, 1);
  assert.equal(result.progression.filter(row => row.exerciseId === "machine_hammer_curl").length, 3);
});

test("explicit confirmed record and mapping choices still override newly recognized name aliases", () => {
  const rawName = "디랙스 암 컬 해머 원 암", raw = exercise("custom", rawName, { exerciseId: "cable_curl",
    equipmentKey: "합성 케이블 A", loadConvention: "total", loadRole: "external" });
  const before = structuredClone(raw), description = T.describeExercise(raw);
  assert.equal(description.resolved.id, "cable_curl"); assert.equal(description.equipmentKey, "합성 케이블 A");
  assert.equal(description.loadConvention, "total"); assert.equal(description.loadRole, "external");
  const mapping = { rawName, exerciseId: "cable_curl", equipmentKey: "합성 케이블 B", loadConvention: "as-recorded", loadRole: "unknown", confirmed: true };
  const mapped = T.describeExercise(rawName, [mapping]);
  assert.equal(mapped.resolved.id, "cable_curl"); assert.equal(mapped.loadConvention, "as-recorded");
  assert.deepEqual(raw, before);
});
