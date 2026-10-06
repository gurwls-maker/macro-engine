"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Training = require("../src/training-store.js");

// Entirely synthetic data, never a copy of a personal diary or extracted image.
function context(overrides = {}) {
  const hash = "a".repeat(64);
  const session = {
    date: "2026-01-05", time: "09:00", label: "Synthetic training", durationMinutes: 45,
    reportedSetCount: 5, reportedVolumeKg: 240, reportedEnergyKcal: 150,
    exercises: [
      { rawName: "테스트 운동", loadConvention: "as-recorded", durationMinutes: null, repsTotal: 0, reportedVolumeKg: 240,
        sets: [{ loadKg: 20, reps: 5, marker: "W" }, { loadKg: 40, reps: 6, marker: null }, { loadKg: 20, reps: 7, marker: "D" }] },
      { rawName: "테스트 운동", loadConvention: "as-recorded", durationMinutes: null, repsTotal: 6, reportedVolumeKg: null,
        sets: [{ loadKg: null, reps: 6, marker: "A" }] },
      { rawName: "시간 운동", loadConvention: "as-recorded", durationMinutes: 5, repsTotal: null, reportedVolumeKg: null, sets: [] }
    ], uncertainties: ["독립 S 배지는 세트에 귀속하지 않음.", "헤더 시각의 시작·종료 의미는 알 수 없음."]
  };
  return { sessions: [{ id: `${hash}:0`, hash, date: session.date, time: session.time, label: session.label,
    method: "visual", parserVersion: "diary-vision-v1", corrected: false, correctionRevision: null, sourceAvailable: true,
    sourcePaths: ["synthetic/example.png"], baseDigest: "b".repeat(64), replaces: [], supersededBy: [], session }],
    archivedSessions: [], damaged: [], possibleDuplicates: [], ...overrides };
}
function record() { return Training.fromDiaryContext(context()).records[0]; }
test("an unscanned source path is unknown, not an observed missing original", () => {
  const value = context({ sourceAvailabilityAsOf: null }); value.sessions[0].sourceAvailable = false;
  const result = Training.fromDiaryContext(value).records[0];
  assert.ok(result.source.uncertainties.some(line => /원본 접근 여부는 미확인/.test(line)));
  assert.equal(result.source.uncertainties.some(line => /찾지 못했/.test(line)), false);
  value.sourceAvailabilityAsOf = "2026-01-06T00:00:00.000Z";
  assert.ok(Training.fromDiaryContext(value).records[0].source.uncertainties.some(line => /찾지 못했/.test(line)));
});
function workspace() { const value = Training.createEmpty(); value.records = [record()]; return value; }
function withFeedback(value = workspace(), feeling = "comfortable") {
  const exercise = value.records[0].exercises[0], set = exercise.sets.find(row => row.marker === null);
  exercise.feedback = { setId: set.id, feeling, loadKg: set.loadKg, reps: set.reps };
  return value;
}
function message(id = "question", overrides = {}) {
  return { id, role: "user", text: "어떤 기록이 필요한가요?", createdAt: "2026-01-05T12:00:00.000Z", source: "local", replyTo: null, contextDigest: null, status: "pending", ...overrides };
}

function plannedWorkspace() {
  const T = require("../src/training.js"), value = workspace();
  const saved = T.createProgram(T.recommendProgram({ age: 30, healthContext: "general", trainingYears: 1, sport: "strength", goal: "maintain" }, value.settings), { id: "plan", createdAt: "2026-01-01T00:00:00.000Z" });
  value.planning.programs.push(saved); value.planning.activeProgramId = saved.id;
  value.planning.schedule.push(T.createAssignment(saved, saved.days[0].id, "2026-01-05", "scheduled"));
  return value;
}

test("old workspaces normalize optional planning, memory and follow-ups without touching old records", () => {
  const value = workspace(), before = structuredClone(value.records);
  delete value.planning; delete value.memory; delete value.followUps;
  const normalized = Training.validate(value);
  assert.deepEqual(normalized.records, before); assert.deepEqual(normalized.planning, Training.createEmpty().planning);
  assert.deepEqual(normalized.memory, { constraints: "", focus: "", agreements: "", updatedAt: null }); assert.deepEqual(normalized.followUps, []);
  assert.equal(value.planning, undefined);
});

test("optional training intent and selected-set feelings preserve old records and full backup exchange", () => {
  const S = require("../src/storage.js"), old = workspace(), before = structuredClone(old);
  assert.deepEqual(Training.validate(old), old);
  assert.equal(Object.hasOwn(Training.validate(old).records[0], "trainingIntent"), false);
  assert.equal(Object.hasOwn(Training.validate(old).records[0].exercises[0], "feedback"), false);
  assert.deepEqual(old, before);
  for (const intent of Training.TRAINING_INTENTS) for (const feeling of Training.FEEDBACK_FEELINGS) {
    const value = withFeedback(workspace(), feeling); value.records[0].trainingIntent = intent;
    const original = structuredClone(value), validated = Training.validate(value);
    assert.deepEqual(validated, value);
    assert.deepEqual(validated.records[0].exercises[0].sets.map(set => set.rir), [null, null, null]);
    assert.deepEqual(Training.parseImport(Training.exportExchange(value)).records, value.records);
    const state = S.createEmpty(); state.training = value;
    assert.deepEqual(S.parseBackup(S.exportBackup(state)).state.training, value);
    assert.deepEqual(value, original);
  }
  assert.ok(Object.isFrozen(Training.TRAINING_INTENTS));
  assert.ok(Object.isFrozen(Training.FEEDBACK_FEELINGS));
});

test("intent and feeling contracts reject coercion, invented RIR, unknown values and extra keys", () => {
  for (const intent of [null, undefined, "", "unknown", "rest", 0, true, { kind: "deload" }]) {
    const value = workspace(); value.records[0].trainingIntent = intent;
    assert.throws(() => Training.validate(value));
  }
  const changes = [
    value => { value.records[0].exercises[0].feedback = null; },
    value => { value.records[0].exercises[0].feedback.feeling = "easy"; },
    value => { value.records[0].exercises[0].feedback.feeling = 0; },
    value => { value.records[0].exercises[0].feedback.setId = " "; },
    value => { value.records[0].exercises[0].feedback.loadKg = "40"; },
    value => { value.records[0].exercises[0].feedback.loadKg = -1; },
    value => { value.records[0].exercises[0].feedback.loadKg = 10001; },
    value => { value.records[0].exercises[0].feedback.reps = "6"; },
    value => { value.records[0].exercises[0].feedback.reps = 6.5; },
    value => { value.records[0].exercises[0].feedback.reps = -1; },
    value => { value.records[0].exercises[0].feedback.reps = 100001; },
    value => { value.records[0].exercises[0].feedback.rir = 3; },
    value => { delete value.records[0].exercises[0].feedback.reps; }
  ];
  for (const change of changes) { const value = withFeedback(); change(value); assert.throws(() => Training.validate(value)); }
});

test("feedback belongs to the selected current general set and stale or cross-block snapshots fail", () => {
  const changes = [
    value => { value.records[0].exercises[0].feedback.setId = "missing"; },
    value => { value.records[0].exercises[0].sets.splice(1, 1); },
    value => { value.records[0].exercises[0].sets[1].loadKg = 41; },
    value => { value.records[0].exercises[0].sets[1].reps = 7; },
    value => { value.records[0].exercises[0].sets[1].marker = "W"; },
    value => { value.records[0].exercises[0].sets[1].marker = "D"; },
    value => { value.records[0].exercises[0].feedback.loadKg = null; },
    value => { value.records[0].exercises[0].feedback.reps = null; },
    value => { const set = value.records[0].exercises[1].sets[0]; set.marker = null; value.records[0].exercises[0].feedback = { setId: set.id, feeling: "hard", loadKg: set.loadKg, reps: set.reps }; },
    value => { const set = value.records[0].exercises[0].sets[0]; value.records[0].exercises[0].feedback = { setId: set.id, feeling: "limit", loadKg: set.loadKg, reps: set.reps }; }
  ];
  for (const change of changes) { const value = withFeedback(); change(value); assert.throws(() => Training.validate(value), /체감/); }
  const corrected = withFeedback(); corrected.records[0].exercises[0].sets[1].loadKg = 41;
  delete corrected.records[0].exercises[0].feedback;
  assert.deepEqual(Training.validate(corrected), corrected);
});

test("feedback snapshots distinguish unknown values from numeric zero without filling RIR", () => {
  for (const loadKg of [null, 0]) for (const reps of [null, 0]) {
    const value = workspace(), set = value.records[0].exercises[0].sets[1];
    set.loadKg = loadKg; set.reps = reps;
    withFeedback(value, "hard");
    const saved = Training.validate(value).records[0].exercises[0];
    assert.equal(saved.feedback.loadKg, loadKg); assert.equal(saved.feedback.reps, reps);
    assert.equal(saved.sets[1].rir, null);
    const mismatch = structuredClone(value);
    mismatch.records[0].exercises[0].feedback.loadKg = loadKg === null ? 0 : null;
    assert.throws(() => Training.validate(mismatch), /체감/);
  }
});

test("source reimport keeps confirmed intent and feedback without changing image observation identity", () => {
  const value = withFeedback(); value.records[0].trainingIntent = "light";
  value.records[0].notes = "사용자 선택 보존";
  const before = structuredClone(value), incoming = record();
  const unchanged = Training.mergeRecords(value, [incoming]);
  assert.equal(unchanged.unchanged, 1); assert.equal(unchanged.conflicts.length, 0);
  assert.deepEqual(unchanged.workspace, before); assert.deepEqual(value, before);
  incoming.trainingIntent = "deload";
  withFeedback({ records: [incoming] }, "limit");
  incoming.source.paths = ["moved/example.png"];
  const moved = Training.mergeRecords(value, [incoming]);
  assert.equal(moved.updated, 1); assert.equal(moved.conflicts.length, 0);
  assert.equal(moved.workspace.records[0].trainingIntent, "light");
  assert.deepEqual(moved.workspace.records[0].exercises[0].feedback, before.records[0].exercises[0].feedback);
  assert.equal(moved.workspace.records[0].notes, "사용자 선택 보존");
  const changed = record(); changed.exercises[0].sets[1].loadKg = 41;
  const conflict = Training.mergeRecords(value, [changed]);
  assert.equal(conflict.conflicts.length, 1); assert.deepEqual(conflict.workspace, before);
});

test("different image candidates remain separate conflicts regardless of user annotations", () => {
  const incoming = record(); incoming.id = "c".repeat(64) + ":0"; incoming.source.hash = "c".repeat(64);
  incoming.trainingIntent = "test";
  withFeedback({ records: [incoming] }, "limit");
  const value = withFeedback(); value.records[0].trainingIntent = "regular";
  const result = Training.mergeRecords(value, [incoming]);
  assert.equal(result.conflicts.length, 1); assert.equal(result.added, 0);
  assert.deepEqual(result.workspace, value);
});

test("image extraction cannot create training intent, feelings or set RIR", () => {
  const clean = Training.fromDiaryContext(context()).records[0];
  assert.equal(Object.hasOwn(clean, "trainingIntent"), false);
  assert.ok(clean.exercises.every(exercise => !Object.hasOwn(exercise, "feedback")));
  for (const change of [
    value => { value.sessions[0].session.trainingIntent = "deload"; },
    value => { value.sessions[0].session.exercises[0].feedback = { setId: "invented", feeling: "comfortable", loadKg: 40, reps: 6 }; },
    value => { value.sessions[0].session.exercises[0].sets[1].rir = 3; }
  ]) { const value = context(); change(value); assert.throws(() => Training.fromDiaryContext(value)); }
});

test("stored programs, snapshot assignments and explicit reviews survive exchange without record invention", () => {
  const T = require("../src/training.js"), value = plannedWorkspace();
  value.planning.schedule[0] = T.adjustAssignment(value.planning.schedule[0], { kind: "deload", reason: "합성 선택", reviewDate: "2026-01-12", setReduction: 1, rirIncrease: 1 });
  const snapshot = structuredClone(value.planning.schedule[0].prescription);
  value.planning.programs[0].days[0].exercises[0].sets = 6;
  const normalized = Training.validate(value);
  assert.deepEqual(normalized.planning.schedule[0].prescription, snapshot);
  assert.equal(normalized.planning.schedule[0].recordId, null);
  assert.deepEqual(JSON.parse(Training.exportExchange(normalized)).training, normalized);
  normalized.planning.schedule[0].recordId = normalized.records[0].id;
  normalized.planning.schedule[0].status = "performed";
  assert.deepEqual(Training.validate(normalized), normalized);
});

test("plan schema rejects unknown keys, impossible dates, duplicate IDs and inconsistent performed links", () => {
  const cases = [
    value => { value.planning.extra = true; },
    value => { value.planning.programs[0].days[0].exercises[0].sets = "3"; },
    value => { value.planning.programs[0].days[0].exercises[0].repsMax = 0; },
    value => { value.planning.programs[0].days[0].exercises[0].rir = null; },
    value => { value.planning.programs[0].days[0].exercises.push(structuredClone(value.planning.programs[0].days[0].exercises[0])); },
    value => { value.planning.activeProgramId = "unknown"; },
    value => { value.planning.schedule[0].date = "2026-02-30"; },
    value => { value.planning.schedule[0].status = "performed"; },
    value => { value.planning.schedule[0].recordId = value.records[0].id; },
    value => { value.planning.schedule[0].recordId = "missing"; value.planning.schedule[0].status = "performed"; },
    value => { value.planning.schedule[0].recordId = value.records[0].id; value.planning.schedule[0].status = "performed"; value.planning.schedule[0].date = "2026-01-06"; },
    value => { value.planning.schedule[0].prescription.id = "unrelated"; },
    value => { value.planning.preferences.preferredExerciseIds = ["bench_press"]; value.planning.preferences.excludedExerciseIds = ["bench_press"]; }
  ];
  for (const change of cases) { const value = plannedWorkspace(); change(value); assert.throws(() => Training.validate(value)); }
});

test("personal memory and agreed follow-ups are bounded explicit data with strict optional contracts", () => {
  const value = workspace(); value.memory = { constraints: "합성 제약", focus: "합성 초점", agreements: "확인한 합의", updatedAt: "2026-01-05T12:00:00.000Z" };
  value.followUps.push({ id: "follow-1", topic: "training", note: "다음 운동 후 함께 확인", reviewDate: "2026-01-12", status: "open", createdAt: "2026-01-05T12:00:00.000Z" });
  assert.deepEqual(Training.validate(value), value);
  for (const change of [v => { v.memory.constraints = "x".repeat(6001); }, v => { v.memory.extra = "no"; }, v => { v.followUps[0].reviewDate = "2026-02-30"; }, v => { v.followUps[0].status = "automatic"; }, v => { v.followUps.push(structuredClone(v.followUps[0])); }]) { const invalid = structuredClone(value); change(invalid); assert.throws(() => Training.validate(invalid)); }
});

test("empty workspace and browser UMD expose the same data boundary", () => {
  const empty = Training.createEmpty();
  assert.deepEqual(Training.validate(empty), empty);
  assert.equal(Training.VERSION, 1);
  const sandbox = { TextEncoder };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/training-store.js"), "utf8"), sandbox);
  assert.equal(typeof sandbox.MacroTrainingStore.parseImport, "function");
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.MacroTrainingStore.createEmpty())), empty);
});

test("diary details preserve raw blocks, header totals, null loads and literal markers", () => {
  const input = context();
  const before = structuredClone(input);
  const { records, warnings } = Training.fromDiaryContext(input);
  assert.deepEqual(input, before);
  assert.deepEqual(warnings, []);
  assert.equal(records.length, 1);
  const result = records[0];
  assert.equal(result.reportedSetCount, 5);
  assert.equal(result.exercises.length, 3);
  assert.equal(result.exercises[0].rawName, result.exercises[1].rawName);
  assert.notEqual(result.exercises[0].id, result.exercises[1].id);
  assert.deepEqual(result.exercises[0].sets.map(s => s.marker), ["W", null, "D"]);
  assert.equal(result.exercises[1].sets[0].marker, "A");
  assert.equal(result.exercises[1].sets[0].loadKg, null);
  assert.equal(result.exercises[0].repsTotal, 0);
  assert.equal(result.exercises[2].durationMinutes, 5);
  assert.deepEqual(result.exercises[2].sets, []);
  assert.ok(result.source.uncertainties.some(value => value.includes("S")));
  assert.ok(result.exercises.every(e => e.exerciseId === null && e.equipmentKey === null && e.sets.every(s => s.rir === null)));
});

test("source path and identity are stable and source revision is explicit", () => {
  const input = context();
  const initial = Training.fromDiaryContext(input).records[0];
  input.sessions[0].sourcePaths = ["moved/example.png"];
  const moved = Training.fromDiaryContext(input).records[0];
  assert.equal(moved.id, initial.id);
  assert.deepEqual(moved.exercises, initial.exercises);
  input.sessions[0].corrected = true;
  input.sessions[0].correctionRevision = "revision-2";
  assert.equal(Training.fromDiaryContext(input).records[0].source.revision, "revision-2");
});

test("legacy source uncertainty survives and summaries without actual details cannot masquerade as sets", () => {
  const input = context();
  input.sessions[0].method = "legacy-ocr";
  input.sessions[0].parserVersion = "legacy-import-v1";
  input.sessions[0].session.exercises = [];
  input.sessions[0].session.legacy = { sets_method: "estimate", arbitrary: "raw source remains outside browser cache" };
  const result = Training.fromDiaryContext(input);
  assert.equal(result.records[0].source.kind, "legacy-ocr");
  assert.deepEqual(result.records[0].exercises, []);
  assert.match(result.warnings.join(" "), /미검증/);
  assert.match(result.records[0].source.uncertainties.join(" "), /추정/);
  delete input.sessions[0].session;
  assert.throws(() => Training.fromDiaryContext(input), /--details/);
});

test("archived and damaged cache records are excluded while missing original is not a rest day", () => {
  const input = context();
  input.archivedSessions.push(structuredClone(input.sessions[0]));
  input.sessions[0].sourceAvailable = false;
  input.sessions[0].sourcePaths = [];
  const available = Training.fromDiaryContext(input);
  assert.equal(available.records.length, 1);
  assert.match(available.warnings.join(" "), /제외/);
  assert.match(available.records[0].source.uncertainties.join(" "), /미운동/);
  input.damaged = [{ hash: input.sessions[0].hash, reason: "cache invalid" }];
  const damaged = Training.fromDiaryContext(input);
  assert.deepEqual(damaged.records, []);
  assert.match(damaged.warnings.join(" "), /손상/);
});

test("context rejects mismatches, unsupported cache versions, coercion and invented missing values", () => {
  const changes = [
    c => { c.schemaVersion = 2; }, c => { c.format = "unrelated"; },
    c => { c.sessions[0].parserVersion = "diary-vision-v99"; }, c => { c.sessions[0].method = "guessed"; },
    c => { c.sessions[0].date = "2026-01-06"; }, c => { c.sessions[0].time = null; },
    c => { c.sessions[0].id = "other:0"; }, c => { c.sessions[0].sourceAvailable = "true"; },
    c => { c.sessions[0].corrected = true; }, c => { c.sessions[0].session.durationMinutes = "45"; },
    c => { delete c.sessions[0].session.exercises[0].sets[0].loadKg; },
    c => { c.sessions[0].session.exercises[0].sets[0].rir = 2; },
    c => { delete c.sessions[0].session.reportedEnergyKcal; },
    c => { c.sessions[0].session.exercises[0].unexpected = true; }
  ];
  for (const change of changes) { const value = context(); change(value); assert.throws(() => Training.fromDiaryContext(value)); }
});

test("validate is a safe independent clone and numeric unknown is not zero", () => {
  const input = workspace();
  const output = Training.validate(input);
  output.records[0].notes = "changed";
  assert.equal(input.records[0].notes, "");
  assert.equal(output.records[0].exercises[1].sets[0].loadKg, null);
  input.records[0].exercises[1].sets[0].loadKg = 0;
  assert.equal(Training.validate(input).records[0].exercises[1].sets[0].loadKg, 0);
  for (const value of ["0", undefined, NaN, Infinity, -1]) {
    input.records[0].exercises[1].sets[0].loadKg = value;
    assert.throws(() => Training.validate(input));
  }
});

test("exact reimport preserves all user notes, mapping, effort, pain, RIR and settings", () => {
  const input = workspace();
  const r = input.records[0];
  r.notes = "사용자 기록"; r.effort = 8; r.pain = "mild";
  r.exercises[0].notes = "장비 메모"; r.exercises[0].exerciseId = "press";
  r.exercises[0].equipmentKey = "station-2"; r.exercises[0].loadConvention = "per-side";
  r.exercises[0].sets[0].rir = 3;
  input.settings.daysPerWeek = 4;
  input.mappings = [{ rawName: "테스트 운동", exerciseId: "press", equipmentKey: "station-2", loadConvention: "per-side", confirmed: true }];
  const before = structuredClone(input);
  const result = Training.mergeRecords(input, [record()]);
  assert.deepEqual({ added: result.added, updated: result.updated, unchanged: result.unchanged }, { added: 0, updated: 0, unchanged: 1 });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.workspace, input);
  assert.deepEqual(input, before);
  result.workspace.records[0].notes = "different";
  assert.equal(input.records[0].notes, "사용자 기록");
});

test("moving an image updates provenance only and merging is idempotent", () => {
  const original = workspace();
  original.records[0].notes = "keep";
  const incoming = record(); incoming.source.paths = ["renamed/new.png"];
  const changed = Training.mergeRecords(original, [incoming]);
  assert.equal(changed.updated, 1);
  assert.equal(changed.workspace.records[0].notes, "keep");
  assert.deepEqual(changed.workspace.records[0].source.paths, incoming.source.paths);
  const again = Training.mergeRecords(changed.workspace, [incoming]);
  assert.equal(again.unchanged, 1);
  assert.equal(again.workspace.records.length, 1);
});

test("source revisions and changed raw observations are conflicts, never silent replacements", () => {
  for (const mutate of [r => { r.source.revision = "new-revision"; }, r => { r.exercises[0].sets[1].loadKg = 60; }, r => { r.label = "new"; }]) {
    const input = workspace(); input.records[0].notes = "keep private observation";
    const incoming = record(); mutate(incoming);
    const result = Training.mergeRecords(input, [incoming]);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.added + result.updated + result.unchanged, 0);
    assert.deepEqual(result.workspace, input);
    assert.deepEqual(result.conflicts[0].incoming, incoming);
    assert.equal(result.conflicts[0].existing.notes, "keep private observation");
  }
});

test("different same-day sessions remain separate; possible duplicate images never select the first implicitly", () => {
  const first = record();
  const input = context();
  const copy = structuredClone(input.sessions[0]);
  copy.hash = "c".repeat(64); copy.id = `${copy.hash}:0`;
  copy.time = copy.session.time = "19:00";
  input.sessions.push(copy);
  let records = Training.fromDiaryContext(input).records;
  const mixed = Training.mergeRecords(Training.createEmpty(), records);
  assert.equal(mixed.added, 2);
  assert.equal(mixed.conflicts.length, 0);
  copy.time = copy.session.time = "09:00";
  input.possibleDuplicates = [[first.id, copy.id]];
  const parsed = Training.fromDiaryContext(input);
  assert.ok(parsed.warnings.length);
  assert.ok(parsed.records.every(r => r.source.uncertainties.some(value => value.includes("중복"))));
  const pending = Training.mergeRecords(Training.createEmpty(), parsed.records);
  assert.equal(pending.added, 0);
  assert.equal(pending.conflicts.length, 2);
  assert.deepEqual(pending.workspace.records, []);
  const againstExisting = Training.mergeRecords(workspace(), [parsed.records[1]]);
  assert.equal(againstExisting.conflicts.length, 1);
  assert.equal(againstExisting.workspace.records.length, 1);
});

test("same image with two indexed sessions is not merged by calendar date", () => {
  const input = context();
  const second = structuredClone(input.sessions[0]);
  second.id = `${second.hash}:1`;
  second.time = second.session.time = "18:30";
  input.sessions.push(second);
  const result = Training.mergeRecords(Training.createEmpty(), Training.fromDiaryContext(input).records);
  assert.equal(result.added, 2);
});

test("schema rejects duplicate IDs, unsupported versions, invalid dates, mappings and bounds", () => {
  const changes = [
    w => { w.version = 2; }, w => { w.unexpected = true; },
    w => { w.records.push(structuredClone(w.records[0])); },
    w => { w.records[0].date = "2026-02-29"; }, w => { w.records[0].time = "24:00"; },
    w => { w.records[0].pain = "diagnosed"; }, w => { w.records[0].effort = 11; },
    w => { w.records[0].exercises[0].sets[0].rir = -1; },
    w => { w.records[0].exercises[0].sets[0].reps = 2.5; },
    w => { w.records[0].exercises[0].sets[1].id = w.records[0].exercises[0].sets[0].id; },
    w => { w.records[0].source.hash = null; }, w => { w.records[0].source.paths = "path"; },
    w => { w.settings.daysPerWeek = 8; }, w => { w.settings.daysPerWeek = "3"; },
    w => { w.settings.priorityMuscles = ["back", "back"]; },
    w => { w.mappings = [{ rawName: "x", exerciseId: "y", equipmentKey: null, loadConvention: "guessed", confirmed: true }]; }
  ];
  for (const mutate of changes) { const value = workspace(); mutate(value); assert.throws(() => Training.validate(value)); }
  const value = workspace(); value.records[0].date = "2024-02-29";
  assert.equal(Training.validate(value).records[0].date, "2024-02-29");
});

test("conversation preserves question, attributed response and unanswered state", () => {
  const input = workspace();
  input.messages = [message(), message("answer", { role: "coach", text: "추가 확인이 필요해요.", source: "codex", replyTo: "question", contextDigest: "context-v1", status: "answered" })];
  const result = Training.validate(input);
  assert.deepEqual(result.messages, input.messages);
  assert.equal(result.messages[0].status, "pending");
  for (const mutate of [
    w => { w.messages[1].replyTo = "missing"; }, w => { w.messages[1].replyTo = "answer"; },
    w => { w.messages[1].role = "system"; }, w => { w.messages[1].source = "unknown"; },
    w => { w.messages[1].status = "failed"; }, w => { w.messages[1].createdAt = "2026-02-30T12:00:00.000Z"; },
    w => { w.messages[1].text = " "; }
  ]) { const value = structuredClone(input); mutate(value); assert.throws(() => Training.validate(value)); }
});

test("JSON parse and exchange round trip do not apply imports or import settings implicitly", () => {
  const input = workspace(); input.messages = [message()];
  const parsed = Training.parseImport(Training.exportExchange({ training: input }));
  assert.deepEqual(parsed.records, input.records);
  assert.match(parsed.warnings.join(" "), /전체 앱 백업/);
  assert.deepEqual(Training.parseImport(JSON.stringify(input)).records, input.records);
  assert.deepEqual(Training.parseImport(JSON.stringify(context())).records, [record()]);
  assert.deepEqual(Training.parseImport("\uFEFF" + JSON.stringify(context())).records, [record()]);
  assert.throws(() => Training.parseImport("not JSON"), /JSON/);
  assert.throws(() => Training.parseImport('{"format":"macro-engine-training-exchange","version":2,"training":{}}'), /버전/);
  assert.throws(() => Training.parseImport(" ".repeat(Training.MAX_BYTES + 1)), /8MB/);
});

test("prototype keys, cyclic trees, getters, sparse arrays and non-JSON values are blocked", () => {
  for (const key of ["__proto__", "prototype", "constructor"]) assert.throws(() => Training.parseImport(`{"${key}":{}}`), /키/);
  assert.equal({}.polluted, undefined);
  const input = workspace(); input.records[0].loop = input;
  assert.throws(() => Training.validate(input), /순환/);
  const getter = workspace(); let touched = false;
  Object.defineProperty(getter.records[0], "notes", { enumerable: true, get() { touched = true; return ""; } });
  assert.throws(() => Training.validate(getter), /속성/); assert.equal(touched, false);
  const sparse = workspace(); sparse.records = new Array(1);
  assert.throws(() => Training.validate(sparse), /배열/);
  const inherited = Object.create({ bad: true });
  assert.throws(() => Training.validate(inherited), /형식/);
  let deep = {};
  for (let i = 0; i < 26; i++) deep = { child: deep };
  assert.throws(() => Training.parseImport(JSON.stringify(deep)), /복잡/);
});
