"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const TS = require("../src/training-store.js");

const day = "2026-10-06";
const set = (id, kg = 40, reps = 10, rir = 2, marker = null) => ({ id, loadKg: kg, reps, rir, marker });
const exercise = (id = "bench", overrides = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "gym-a/bench-1", loadConvention: "total", loadRole: "external", groupKey: null,
  durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [set(`${id}-set`)], notes: "", ...overrides });
const record = (id = "record", date = day, exercises = [exercise()], overrides = {}) => ({ id, date, time: null, label: "합성 세션", durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null,
  reportedEnergyKcal: null, source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, exercises, notes: "", pain: null, effort: null,
  sequence: { order: "listed", structure: "straight" }, ...overrides });
const referenceRequest = { exerciseId: "bench_press", equipmentKey: "gym-a/bench-1", loadConvention: "total", loadRole: "external", repsMin: 8, repsMax: 12, rir: 2, contextKey: "[]" };
const sourceExercise = (kg, overrides = {}) => exercise("db", { rawName: "덤벨 벤치 프레스", exerciseId: "dumbbell_bench_press", equipmentKey: "gym-b/dumbbells", loadConvention: "per-side", sets: [set("db-set", kg)], ...overrides });
function calibration() {
  return [record("target-1", "2026-08-01", [exercise("bench", { sets: [set("a", 40)] })]), record("source-1", "2026-08-02", [sourceExercise(20)]),
    record("target-2", "2026-08-15", [exercise("bench", { sets: [set("b", 44)] })]), record("source-2", "2026-08-16", [sourceExercise(22)]),
    record("target-3", "2026-08-29", [exercise("bench", { sets: [set("c", 48)] })]), record("source-3", "2026-08-30", [sourceExercise(24)]),
    record("source-latest", "2026-10-05", [sourceExercise(22)])];
}

test("optional session sequence, load role and group keys round trip without changing old records", () => {
  const old = record(); delete old.sequence; delete old.exercises[0].loadRole; delete old.exercises[0].groupKey;
  const workspace = TS.createEmpty(); workspace.records = [old];
  assert.deepEqual(TS.validate(workspace).records, [old]);
  const fresh = record("new"); workspace.records.push(fresh);
  workspace.mappings.push({ rawName: "별명", exerciseId: "bench_press", equipmentKey: "gym-a/bench-1", loadConvention: "total", loadRole: "external", confirmed: true });
  assert.deepEqual(TS.validate(workspace), workspace);
  for (const change of [r => { r.sequence.order = true; }, r => { r.sequence.structure = "superset-inferred"; }, r => { r.sequence.extra = 1; }, r => { r.exercises[0].loadRole = null; }, r => { r.exercises[0].groupKey = ""; }, r => { r.exercises[0].groupKey = 0; }]) {
    const invalid = structuredClone(workspace); change(invalid.records[1]); assert.throws(() => TS.validate(invalid));
  }
});

test("confirmed role mappings are reused, explicit assistance wins, and conflicting roles are not guessed", () => {
  const raw = exercise("x", { rawName: "별명", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded" }); delete raw.loadRole;
  const mapping = { rawName: "별명", exerciseId: "bench_press", equipmentKey: "gym-a/bench-1", loadConvention: "total", loadRole: "external", confirmed: true };
  assert.equal(T.describeExercise(raw, [mapping]).loadRole, "external");
  assert.equal(T.describeExercise({ ...raw, loadRole: "assistance" }, [mapping]).loadRole, "assistance");
  assert.equal(T.describeExercise(raw).loadRole, "unknown");
  assert.equal(T.describeExercise(raw, [mapping, { ...mapping, loadRole: "assistance" }]).loadRole, "unknown");
});

test("whole session preserves A-B-A blocks and separates marked, warmup, related and unresolved work", () => {
  const rows = [exercise("a", { sets: [set("warm", 20, 10, null, "W"), set("a1"), set("drop", 20, 10, null, "D")] }),
    exercise("b", { rawName: "덤벨 숄더 프레스", exerciseId: "dumbbell_shoulder_press", equipmentKey: "gym-a/dumbbell", loadConvention: "per-side", sets: [set("b1", 15)] }), exercise("a-again")];
  const original = record("aba", day, rows), before = structuredClone(original), context = T.sessionContext(original);
  assert.equal(context.blocks.length, 3);
  assert.deepEqual(context.blocks.map(row => row.blockId), ["a", "b", "a-again"]);
  assert.deepEqual(context.blocks[2].preceding, { workingSets: 2, relatedSets: 2, sameExerciseSets: 1, markedSets: 1, warmupSets: 1, unresolvedBlocks: 0 });
  assert.notEqual(context.blocks[0].contextKey, context.blocks[2].contextKey);
  assert.equal(context.wholeSession.workingSets, 3); assert.equal(context.wholeSession.markedSets, 1); assert.equal(context.wholeSession.warmupSets, 1);
  assert.deepEqual(original, before);
  original.exercises.splice(1, 0, exercise("unresolved", { rawName: "알 수 없는 운동", exerciseId: null }));
  const unresolved = T.sessionContext(original);
  assert.equal(unresolved.blocks[3].preceding.unresolvedBlocks, 1); assert.equal(unresolved.blocks[3].contextKey, null);
});

test("display order and grouped blocks never invent preceding work or chronological certainty", () => {
  for (const sequence of [undefined, { order: "unknown", structure: "straight" }, { order: "listed", structure: "grouped" }, { order: "listed", structure: "unknown" }]) {
    const value = record("unknown", day, [exercise("a"), exercise("b")]);
    if (sequence) value.sequence = sequence; else delete value.sequence;
    const context = T.sessionContext(value);
    assert.equal(context.blocks[1].displayPosition, 2); assert.equal(context.blocks[1].executionPosition, null);
    assert.equal(context.blocks[1].preceding.workingSets, null); assert.equal(context.blocks[1].contextKey, null);
  }
  const grouped = record("g", day, [exercise("a", { groupKey: "pair" }), exercise("b", { groupKey: "pair" })]);
  assert.equal(T.sessionContext(grouped).blocks[0].contextKey, null);
});

test("unknown sequence, load role and same-day sessions cannot create decline or deload", () => {
  const values = [record("one", "2026-10-02", [exercise("x", { sets: [set("x1", 50)] })]), record("two", "2026-10-04", [exercise("x", { sets: [set("x2", 45)] })]), record("three", day, [exercise("x", { sets: [set("x3", 40)] })])];
  const checkins = { [day]: { date: day, energy: "low", hunger: "high", sleep: "poor" } };
  for (const change of [r => { delete r.sequence; }, r => { r.sequence.structure = "grouped"; }, r => { delete r.exercises[0].loadRole; }, r => { r.exercises[0].loadRole = "assistance"; }]) {
    const sample = structuredClone(values); sample.forEach(change);
    const result = T.analyze(sample, { date: day, checkins });
    assert.ok(result.progression.every(row => row.status !== "declined")); assert.equal(result.recovery.repeatedDeclines, 0); assert.equal(result.recovery.deloadCandidate, false);
  }
  const sameDay = [...values, record("earlier", day, [exercise("z")], { time: null })];
  const result = T.analyze(sameDay, { date: day, checkins });
  assert.equal(result.progression[0].current.context.contextKey, null); assert.equal(result.recovery.repeatedDeclines, 0);
});

test("changed preceding work remains a separate observed block context, not an apparent strength decline", () => {
  const baseline = record("fresh", "2026-10-04", [exercise("a", { sets: [set("a", 50)] })]);
  const later = record("after", day, [exercise("prior", { exerciseId: "machine_chest_press", rawName: "머신 체스트 프레스", equipmentKey: "gym-a/chest", sets: [set("p1"), set("p2")] }), exercise("a", { sets: [set("a", 40)] })]);
  const result = T.analyze([baseline, later], { date: day });
  assert.ok(result.progression.every(row => row.status !== "declined"));
  assert.equal(result.sessions[1].exercises[1].context.preceding.relatedSets, 2);
  const lowerPrior = record("lower", "2026-10-03", [exercise("prior", { sets: [set("p", 20)] }), exercise("target", { sets: [set("t", 50)] })]);
  const higherPrior = record("higher", day, [exercise("prior", { sets: [set("p", 60)] }), exercise("target", { sets: [set("t", 40)] })]);
  const differentLoads = T.analyze([lowerPrior, higherPrior], { date: day });
  assert.notEqual(T.sessionContext(lowerPrior).blocks[1].contextKey, T.sessionContext(higherPrior).blocks[1].contextKey);
  assert.ok(differentLoads.progression.filter(row => row.current.blockId === "target").every(row => row.status !== "declined"));
});

test("filtered analysis may reuse current full-session contexts without persisting derived fields", () => {
  const original = record("full", day, [exercise("prior", { exerciseId: "machine_chest_press", rawName: "머신 체스트 프레스" }), exercise("target")]);
  const projected = { ...original, exercises: [original.exercises[1]] };
  const result = T.analyze([projected], { date: day, sessionContexts: { full: T.sessionContext(original) }, sessionRecordCounts: { [day]: 1 } });
  assert.equal(result.sessions[0].exercises[0].context.displayPosition, 2); assert.equal(result.sessions[0].exercises[0].context.preceding.workingSets, 1);
  assert.equal(projected.sessionContext, undefined);
});

test("repeated prescription blocks are valid but one actual set cannot fulfill multiple targets", () => {
  const prescription = { id: "plan-day", label: "반복 벤치 블록", exercises: ["first", "second"].map(id => ({ id, exerciseId: "bench_press", label: "벤치", sets: 2, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 40, equipmentKey: "gym-a/bench-1", loadConvention: "total" })) };
  const actual = record("actual", day, [exercise("bench", { sets: [set("s1"), set("s2")] })]);
  const workspace = TS.createEmpty(); workspace.records = [actual];
  workspace.planning.programs = [{ id: "program", name: "블록", createdAt: "2026-10-01T00:00:00.000Z", source: "user", days: [prescription] }];
  workspace.planning.activeProgramId = "program";
  const assignment = T.createAssignment(workspace.planning.programs[0], "plan-day", day, "scheduled"); assignment.recordId = "actual"; assignment.status = "performed";
  workspace.planning.schedule = [assignment]; assert.deepEqual(TS.validate(workspace), workspace);
  const result = T.evaluateAssignment(assignment, [actual]);
  assert.equal(result.status, "review"); assert.equal(result.rows[0].status, "met"); assert.equal(result.rows[1].recordedSets, 0); assert.equal(result.rows[1].status, "unrecorded");
  actual.exercises.push(exercise("bench-later", { sets: [set("s3"), set("s4")] }));
  assert.equal(T.evaluateAssignment(assignment, [actual]).status, "met");
  actual.sequence.order = "unknown";
  assert.equal(T.evaluateAssignment(assignment, [actual]).rows[0].status, "unknown");
  workspace.planning.programs[0].days[0].exercises[1].id = "first";
  assert.throws(() => TS.validate(workspace));
});

test("two venues and multiple machines remain parallel observations without a primary device", () => {
  const values = [record("a", "2026-10-03", [exercise("a", { exerciseId: "machine_chest_press", equipmentKey: "gym-a/Drax-1" })]), record("b", "2026-10-04", [exercise("b", { exerciseId: "machine_chest_press", equipmentKey: "gym-b/Drax-1", sets: [set("b", 60)] })])];
  const result = T.analyze(values, { date: day });
  assert.deepEqual(result.progression.map(row => row.equipmentKey).sort(), ["gym-a/Drax-1", "gym-b/Drax-1"]);
  assert.equal(result.muscles.find(row => row.id === "chest").directSets, 2);
  assert.ok(result.progression.every(row => row.status === "insufficient"));
});

test("starting reference prioritizes recent target first general sets, not a later highest set", () => {
  const values = calibration(); values.push(record("target-recent", "2026-10-04", [exercise("bench", { sets: [set("warm", 20, 10, null, "W"), set("start", 40), set("top", 60)] })]));
  const before = structuredClone(values), result = T.startingReference(values, referenceRequest, { date: day });
  assert.equal(result.status, "recorded"); assert.equal(result.range.minKg, 40); assert.equal(result.range.maxKg, 40); assert.equal(result.references[0].setId, "start"); assert.equal(result.transfer, null);
  assert.deepEqual(values, before);
});

test("target observations remain visible when recorded order or effort is unknown rather than inventing equality", () => {
  const value = record("target", "2026-10-04", [exercise("bench", { sets: [set("s", 40, 10, null)] })]); delete value.sequence;
  const result = T.startingReference([value], referenceRequest, { date: day });
  assert.equal(result.status, "recorded"); assert.equal(result.range.minKg, 40); assert.equal(result.references[0].rir, null);
  assert.equal(result.references[0].contextKey, null); assert.ok(result.reasons.some(reason => /미확인/.test(reason)));
});

test("personal transfer uses distinct-date within-person pairs only and preserves raw per-side kg", () => {
  const result = T.startingReference(calibration(), referenceRequest, { date: day });
  assert.equal(result.status, "personal-transfer"); assert.equal(result.range.minKg, 44); assert.equal(result.range.maxKg, 44);
  assert.equal(result.transfer.pairCount, 3); assert.equal(result.references[0].loadKg, 22); assert.equal(result.references[0].loadConvention, "per-side");
  assert.equal(new Set(result.transfer.pairs.map(pair => pair.source.date)).size, 3); assert.equal(new Set(result.transfer.pairs.map(pair => pair.target.date)).size, 3);
});

test("insufficient, unknown-context, missing-effort or mismatched family pairs never invent a transfer", () => {
  const values = calibration();
  for (const change of [rows => { rows.splice(0, 2); }, rows => { rows.forEach(row => delete row.sequence); }, rows => { rows.forEach(row => { row.exercises[0].sets[0].rir = null; }); }, rows => { rows.filter(row => row.id.startsWith("source")).forEach(row => { row.exercises[0].exerciseId = "incline_dumbbell_press"; }); }]) {
    const sample = structuredClone(values); change(sample);
    assert.notEqual(T.startingReference(sample, referenceRequest, { date: day }).status, "personal-transfer");
  }
  assert.notEqual(T.startingReference(values, { ...referenceRequest, contextKey: null }, { date: day }).status, "personal-transfer");
  assert.deepEqual(T.relatedExerciseIds("bench_press"), ["bench_press", "dumbbell_bench_press", "machine_chest_press"]);
  assert.deepEqual(T.relatedExerciseIds("incline_dumbbell_press"), ["incline_dumbbell_press"]);
});

test("transfer rejects extrapolation, assistance, current pain and recovery conflicts", () => {
  const values = calibration(), outOfRange = structuredClone(values); outOfRange.at(-1).exercises[0].sets[0].loadKg = 26;
  assert.notEqual(T.startingReference(outOfRange, referenceRequest, { date: day }).status, "personal-transfer");
  for (const options of [{ pain: "mild" }, { pain: "stop" }, { recovery: { status: "watch" } }, { recovery: { status: "okay", pain: "mild" } }]) assert.notEqual(T.startingReference(values, referenceRequest, { date: day, ...options }).status, "personal-transfer");
  assert.equal(T.startingReference(values, { ...referenceRequest, loadRole: "assistance" }, { date: day }).status, "unsupported");
  assert.equal(T.startingReference(values, { ...referenceRequest, loadConvention: "bodyweight" }, { date: day }).status, "unsupported");
  const painHistory = structuredClone(values); painHistory.at(-1).pain = "mild";
  assert.notEqual(T.startingReference(painHistory, referenceRequest, { date: day }).status, "personal-transfer");
});

test("copied image identities do not make extra calibration dates and conflicting interpretations are quarantined", () => {
  const values = calibration(); values.forEach((row, index) => { row.source = { ...row.source, kind: "visual", hash: String(index + 1).repeat(64) }; });
  const copy = structuredClone(values[0]); copy.id = "image-copy"; copy.exercises[0].id = "copied-block"; copy.exercises[0].sets[0].id = "copied-set";
  const result = T.startingReference([...values, copy], referenceRequest, { date: day });
  assert.equal(result.status, "personal-transfer"); assert.equal(result.transfer.pairCount, 3);
  copy.sequence.order = "unknown";
  assert.notEqual(T.startingReference([...values, copy], referenceRequest, { date: day }).status, "personal-transfer");
  const analysis = T.analyze([values[0], copy], { date: "2026-08-02" });
  assert.equal(analysis.coverage.recordCount, 0); assert.equal(analysis.coverage.excludedRecords, 2);
});

test("first-session fallback keeps family observations while returning no ungrounded kg", () => {
  const result = T.startingReference([record("source", "2026-10-05", [sourceExercise(22)])], referenceRequest, { date: day });
  assert.equal(result.status, "first-session"); assert.equal(result.range, null); assert.equal(result.transfer, null); assert.equal(result.references.length, 1);
  const missing = T.startingReference([], referenceRequest, { date: day }); assert.equal(missing.range, null); assert.equal(missing.references.length, 0);
});
