"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const { performance } = require("node:perf_hooks");

const date = "2026-10-06";
const set = (id = "set-1", loadKg = 80, reps = 10, rir = 2) => ({ id, marker: null, loadKg, reps, rir });
const exercise = (id = "exercise-1", overrides = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press",
  equipmentKey: "synthetic-rack-A", loadConvention: "total", loadRole: "external", sets: [set()], ...overrides });
const record = (id, day, exercises = [exercise()], overrides = {}) => ({ id, date: day, time: "18:00", label: "합성 운동",
  sequence: { order: "listed", structure: "straight" }, source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, exercises, ...overrides });
const unknown = (id = "exercise-1", overrides = {}) => exercise(id, { rawName: "개인 프레스", exerciseId: null,
  equipmentKey: null, loadConvention: "as-recorded", loadRole: "unknown", ...overrides });
const rule = (overrides = {}) => ({ rawName: "개인 프레스", exerciseId: "machine_chest_press",
  equipmentKey: "synthetic-machine-A", loadConvention: "total", loadRole: "external", confirmed: true, ...overrides });
const selection = { recordId: "selected", exerciseId: "exercise-1" };
const analyze = records => T.analyze(records, { date });
const snapshot = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Independent full-scan oracle for the preview's selected values, rows and counters.
function brutePreview(records, mappings, proposed, selected = selection) {
  const text = value => typeof value === "string" ? value.trim() : "";
  const normalize = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");
  const equipmentName = value => {
    const label = text(value).normalize("NFKC").replace(/\s+/g, " ");
    return /^sta\s*7000$/i.test(label) ? "STA7000" : /^(디랙스|drax)$/i.test(label) ? "디랙스" : /^(인피니티|infinity)$/i.test(label) ? "인피니티" : label;
  };
  const ids = new Set(T.catalog.map(row => row.id));
  const ambiguous = (raw, rules) => {
    const parsed = T.parseExerciseName(raw.rawName), explicitId = text(raw.exerciseId), explicitEquipment = text(raw.equipmentKey);
    const explicitConvention = ["total", "per-side", "bodyweight"].includes(raw.loadConvention) ? raw.loadConvention : null;
    const sameEquipment = (a, b) => equipmentName(a).toLowerCase() === equipmentName(b).toLowerCase();
    const eligible = rules.filter(row => row?.confirmed === true && (!explicitId || row.exerciseId === explicitId)
      && (!explicitEquipment || sameEquipment(row.equipmentKey, explicitEquipment)) && (!explicitConvention || row.loadConvention === explicitConvention));
    let scoped = eligible.filter(row => normalize(row.rawName) === normalize(parsed.rawName));
    if (!scoped.length && parsed.equipmentKey) scoped = eligible.filter(row => normalize(row.rawName) === normalize(parsed.movementName)
      && sameEquipment(row.equipmentKey, explicitEquipment || parsed.equipmentKey));
    return new Set(scoped.filter(row => ids.has(row.exerciseId)).map(row => JSON.stringify([row.exerciseId, text(row.equipmentKey), row.loadConvention, row.loadRole || "unknown"]))).size > 1;
  };
  const metadata = value => ({ exerciseId: value.resolved?.id || null, equipmentKey: value.equipmentKey,
    loadConvention: value.loadConvention, loadRole: value.loadRole, equipmentSource: value.equipmentSource,
    loadConventionSource: value.loadConventionSource, loadRoleSource: value.loadRoleSource,
    confidence: value.resolved?.confidence || null, variantKey: value.variantKey, ruleConflict: value.ruleConflict });
  const changes = (before, after) => { const left = metadata(before), right = metadata(after); return Object.keys(left).filter(key => left[key] !== right[key]); };
  const mapping = { rawName: proposed.rawName, exerciseId: text(proposed.exerciseId), equipmentKey: text(proposed.equipmentKey) || null,
    loadConvention: proposed.loadConvention, loadRole: proposed.loadRole || "unknown", confirmed: proposed.confirmed === true };
  const nextMappings = mappings.filter(row => !(row.rawName === mapping.rawName && row.equipmentKey === mapping.equipmentKey)).map(row => ({ ...row }));
  nextMappings.push({ ...mapping });
  const selectedRecord = records.find(row => row.id === selected.recordId), selectedExercise = selectedRecord.exercises.find(row => row.id === selected.exerciseId);
  const before = T.describeExercise(selectedExercise, mappings), after = T.describeExercise({ ...selectedExercise, exerciseId: mapping.exerciseId,
    equipmentKey: mapping.equipmentKey, loadConvention: mapping.loadConvention, loadRole: mapping.loadRole }, nextMappings);
  const result = { mapping, nextMappings, selected: { recordId: selectedRecord.id, exerciseId: selectedExercise.id, before, after, changedFields: changes(before, after) }, rows: [],
    counts: { matchingExerciseCount: 0, affectedRecordCount: 0, affectedExerciseCount: 0, alreadyAppliedExerciseCount: 0,
      unchangedExerciseCount: 0, protectedExerciseCount: 0, conflictCount: 0, additionalAffectedExerciseCount: 0 }, futureConflict: false };
  const affectedRecords = new Set();
  for (const record of records) for (const raw of record.exercises) {
    if (record.id === selectedRecord.id && raw.id === selectedExercise.id) continue;
    const exactName = normalize(raw.rawName) === normalize(mapping.rawName), before = T.describeExercise(raw, mappings), after = T.describeExercise(raw, nextMappings);
    const changedFields = changes(before, after), conflictBefore = ambiguous(raw, mappings), conflict = ambiguous(raw, nextMappings);
    if (!exactName && !changedFields.length && conflictBefore === conflict) continue;
    const protectedFields = [text(raw.exerciseId) ? "exerciseId" : null, text(raw.equipmentKey) ? "equipmentKey" : null,
      ["total", "per-side", "bodyweight"].includes(raw.loadConvention) ? "loadConvention" : null,
      ["external", "assistance"].includes(raw.loadRole) ? "loadRole" : null].filter(Boolean);
    const alreadyApplied = !changedFields.length && after.resolved?.id === mapping.exerciseId && after.equipmentKey === mapping.equipmentKey
      && after.loadConvention === mapping.loadConvention && after.loadRole === mapping.loadRole && !conflict;
    const status = conflict ? "conflict" : changedFields.length ? "affected" : alreadyApplied ? "already-applied" : protectedFields.length ? "protected" : "unchanged";
    result.rows.push({ recordId: record.id, exerciseId: raw.id, date: record.date, rawName: raw.rawName,
      scope: exactName ? "exact-name" : "other-auto-change", before, after, changedFields, protectedFields, conflictBefore, conflict, status });
    if (exactName) result.counts.matchingExerciseCount++;
    if (changedFields.length) { result.counts.affectedExerciseCount++; affectedRecords.add(record.id); if (!exactName) result.counts.additionalAffectedExerciseCount++; }
    else result.counts.unchangedExerciseCount++;
    if (alreadyApplied) result.counts.alreadyAppliedExerciseCount++;
    if (protectedFields.length) result.counts.protectedExerciseCount++;
    if (conflict) result.counts.conflictCount++;
  }
  result.counts.affectedRecordCount = affectedRecords.size;
  result.futureConflict = ambiguous({ rawName: mapping.rawName }, nextMappings);
  return result;
}

function compareWithBrute(records, mappings, proposed, selected = selection) {
  const actual = T.previewMapping(records, mappings, proposed, selected), expected = brutePreview(records, mappings, proposed, selected);
  assert.equal(actual.valid, true);
  for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], "indexed preview mismatch: " + key);
  return actual;
}

test("two days suffice for a confirmed comparison and coverage leaves the numeric judgment unchanged", () => {
  const records = freeze([record("before", "2026-09-27"), record("after", "2026-10-04", [exercise("exercise-1", { sets: [set("set-1", 82.5)] })])]);
  const before = snapshot(records), row = analyze(records).progression[0];
  assert.equal(row.status, "improved");
  assert.equal(row.previous.loadKg, 80); assert.equal(row.current.loadKg, 82.5);
  assert.deepEqual(row.historyCoverage, { exerciseRecordCount: 2, exerciseDayCount: 2, equipmentRecordCount: 2, equipmentDayCount: 2,
    conditionRecordCount: 2, conditionDayCount: 2, conditionObservationRecordCount: 2, conditionObservationDayCount: 2,
    otherEquipmentRecordCount: 0, otherEquipmentDayCount: 0, otherConditionRecordCount: 0, otherConditionDayCount: 0, otherConditionGroupCount: 0 });
  assert.deepEqual(records, before);
});

test("changed preceding work remains insufficient in each context but reports the existing two-day history", () => {
  const preceding = load => exercise("prior", { rawName: "덤벨 플라이", exerciseId: "dumbbell_fly", equipmentKey: "synthetic-dumbbell-A",
    loadConvention: "per-side", sets: [set("prior-set", load)] });
  const rows = analyze([record("a", "2026-09-27", [preceding(10), exercise()]), record("b", "2026-10-04", [preceding(12), exercise()])])
    .progression.filter(row => row.exerciseId === "bench_press");
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.status, "insufficient"); assert.equal(row.previous, null);
    assert.equal(row.historyCoverage.exerciseDayCount, 2); assert.equal(row.historyCoverage.equipmentDayCount, 2);
    assert.equal(row.historyCoverage.conditionRecordCount, 1); assert.equal(row.historyCoverage.otherConditionGroupCount, 1);
    assert.match(row.reason, /2일·2개 일지/); assert.match(row.reason, /수행 순서 조건/); assert.match(row.reason, /기록은 1회/);
  }
});

test("equipment, load convention, variant and load role remain distinct comparison groups", () => {
  const records = [record("a", "2026-09-27"), record("b", "2026-09-29", [exercise("exercise-1", { equipmentKey: "synthetic-rack-B" })]),
    record("c", "2026-10-01", [exercise("exercise-1", { loadConvention: "per-side" })]),
    record("d", "2026-10-04", [exercise("exercise-1", { loadRole: "assistance" })])];
  for (const row of analyze(records).progression) {
    assert.equal(row.status, "insufficient");
    assert.equal(row.historyCoverage.exerciseRecordCount, 4); assert.equal(row.historyCoverage.exerciseDayCount, 4);
    assert.equal(row.historyCoverage.equipmentRecordCount, 1); assert.equal(row.historyCoverage.conditionRecordCount, 1);
    assert.equal(row.historyCoverage.otherEquipmentRecordCount, 3); assert.equal(row.historyCoverage.otherConditionRecordCount, 3);
  }
  const variants = analyze([record("curl-1", "2026-10-01", [unknown("exercise-1", { rawName: "STA7000 케이블 컬1" })]),
    record("curl-2", "2026-10-04", [unknown("exercise-1", { rawName: "STA7000 케이블 컬2" })])]).progression;
  assert.equal(variants.length, 2);
  assert.ok(variants.every(row => row.historyCoverage.exerciseDayCount === 2 && row.historyCoverage.equipmentDayCount === 1));
});

test("presence coverage counts distinct sessions and dates rather than repeated exercise blocks or duplicate records", () => {
  const a = record("a", "2026-10-04", [exercise("first"), exercise("second")], { sequence: { order: "unknown", structure: "unknown" } });
  const b = record("b", "2026-10-04", [exercise("first"), exercise("second")], { time: "20:00", sequence: { order: "unknown", structure: "unknown" } });
  const result = analyze([a, b, snapshot(a)]);
  assert.equal(result.coverage.recordCount, 2); assert.equal(result.coverage.duplicateRecords, 1);
  for (const row of result.progression) {
    assert.equal(row.status, "incomparable");
    assert.equal(row.historyCoverage.exerciseRecordCount, 2); assert.equal(row.historyCoverage.exerciseDayCount, 1);
    assert.equal(row.historyCoverage.equipmentRecordCount, 2); assert.equal(row.historyCoverage.conditionRecordCount, 2);
    assert.equal(row.historyCoverage.conditionDayCount, 1); assert.equal(row.historyCoverage.otherConditionRecordCount, 2);
  }
});

test("coverage includes empty exercise blocks while comparison counts only blocks with recorded sets", () => {
  const records = freeze([record("empty", "2026-09-27", [exercise("exercise-1", { sets: [] })]), record("current", "2026-10-04")]);
  const row = analyze(records).progression[0];
  assert.equal(row.status, "insufficient"); assert.equal(row.previous, null);
  assert.equal(row.historyCoverage.exerciseRecordCount, 2); assert.equal(row.historyCoverage.conditionRecordCount, 2);
  assert.equal(row.historyCoverage.conditionObservationRecordCount, 1);
  assert.match(row.reason, /원문 세트가 남아 있는 기록은 1회/);
  assert.equal(records[0].exercises[0].sets.length, 0);
});

test("coverage uses exactly the existing 28-day window, including its boundary and excluding future history", () => {
  const records = Array.from({ length: 120 }, (_, index) => {
    const when = new Date(date + "T00:00:00Z"); when.setUTCDate(when.getUTCDate() - index);
    return record("history-" + index, when.toISOString().slice(0, 10));
  });
  records.push(record("future", "2026-10-07"));
  const result = analyze(freeze(records)), row = result.progression[0];
  assert.equal(result.windowStart, "2026-09-09"); assert.equal(result.coverage.recordCount, 28);
  assert.equal(row.historyCoverage.exerciseRecordCount, 28); assert.equal(row.historyCoverage.exerciseDayCount, 28);
  assert.equal(row.current.date, date);
});

test("unknown exercise coverage is exact normalized raw-name identity, never a guessed catalog movement", () => {
  const rows = analyze([record("a", "2026-09-27", [unknown()]), record("b", "2026-10-01", [unknown("exercise-1", { rawName: "개인_프레스" })]),
    record("c", "2026-10-04", [unknown("exercise-1", { rawName: "개인 프레스 2" })])]).progression;
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.exerciseId === null && row.status === "incomparable"));
  assert.equal(rows.find(row => row.label === "개인_프레스").historyCoverage.exerciseRecordCount, 2);
  assert.equal(rows.find(row => row.label === "개인 프레스 2").historyCoverage.exerciseRecordCount, 1);
});

test("missing numbers and RIR keep incomparable judgments despite multiple recorded days", () => {
  for (const patch of [{ reps: null }, { rir: null }]) {
    const row = analyze([record("before", "2026-09-27"), record("current", "2026-10-04", [exercise("exercise-1", { sets: [{ ...set(), ...patch }] })])]).progression[0];
    assert.equal(row.status, "incomparable"); assert.equal(row.historyCoverage.exerciseDayCount, 2);
    assert.equal(row.historyCoverage.conditionObservationRecordCount, 2);
    assert.match(row.reason, patch.reps === null ? /반복 수가 확인되지/ : /RIR이 비어 있거나/);
  }
});

test("mapping preview reuses one confirmed rule for missing metadata without writing records, originals or numbers", () => {
  const records = freeze([record("selected", "2026-10-01", [unknown()]), record("past", "2026-09-27", [unknown()])]);
  const mappings = freeze([]), proposed = freeze(rule()), original = snapshot({ records, mappings, proposed });
  const result = T.previewMapping(records, mappings, proposed, selection);
  assert.equal(result.valid, true); assert.equal(result.selected.after.resolved.id, "machine_chest_press");
  assert.equal(result.selected.after.equipmentSource, "record");
  assert.equal(result.counts.matchingExerciseCount, 1); assert.equal(result.counts.affectedExerciseCount, 1);
  assert.equal(result.counts.affectedRecordCount, 1); assert.equal(result.rows[0].after.equipmentSource, "mapping");
  assert.equal(result.rows[0].after.loadConvention, "total"); assert.equal(result.rows[0].after.loadRole, "external");
  const future = T.describeExercise(unknown(), result.nextMappings);
  assert.equal(future.resolved.id, "machine_chest_press"); assert.equal(future.equipmentKey, "synthetic-machine-A");
  assert.equal(result.futureConflict, false); assert.deepEqual({ records, mappings, proposed }, original);
});

test("mapping preview protects explicitly confirmed metadata on other exercises even when it conflicts", () => {
  const explicit = unknown("exercise-1", { exerciseId: "dumbbell_bench_press", equipmentKey: "synthetic-machine-B",
    loadConvention: "per-side", loadRole: "assistance" });
  const records = freeze([record("selected", "2026-10-01", [unknown()]), record("explicit", "2026-09-27", [explicit])]);
  const result = T.previewMapping(records, [], rule(), selection), row = result.rows[0];
  assert.equal(result.counts.affectedExerciseCount, 0); assert.equal(result.counts.protectedExerciseCount, 1);
  assert.equal(row.status, "protected"); assert.deepEqual(row.changedFields, []);
  assert.deepEqual(row.protectedFields, ["exerciseId", "equipmentKey", "loadConvention", "loadRole"]);
  assert.equal(row.after.resolved.id, "dumbbell_bench_press"); assert.equal(row.after.equipmentKey, "synthetic-machine-B");
  assert.equal(row.after.loadConvention, "per-side"); assert.equal(row.after.loadRole, "assistance");
});

test("mapping preview can fill missing fields while preserving an explicit load role", () => {
  const result = T.previewMapping([record("selected", "2026-10-01", [unknown()]),
    record("other", "2026-09-27", [unknown("exercise-1", { loadRole: "assistance" })])], [], rule(), selection);
  assert.equal(result.counts.affectedExerciseCount, 1); assert.equal(result.counts.protectedExerciseCount, 1);
  assert.equal(result.rows[0].after.loadRole, "assistance"); assert.equal(result.rows[0].after.loadRoleSource, "record");
  assert.ok(!result.rows[0].changedFields.includes("loadRole"));
});

test("a record with an unsupported explicit exercise ID is not guessed or overwritten by a new mapping", () => {
  const records = freeze([record("selected", date, [unknown()]),
    record("custom", "2026-10-01", [unknown("exercise-1", { exerciseId: "unsupported-custom-movement" })])]);
  const result = T.previewMapping(records, [], rule(), selection);
  assert.equal(result.rows[0].after.resolved, null); assert.deepEqual(result.rows[0].changedFields, []);
  assert.equal(result.rows[0].status, "protected"); assert.equal(result.counts.affectedExerciseCount, 0);
  assert.equal(records[1].exercises[0].exerciseId, "unsupported-custom-movement");
});

test("multiple physical equipment rules are reported as ambiguous without replacing already declared records", () => {
  const records = freeze([record("selected", "2026-10-01", [unknown()]), record("missing", "2026-09-27", [unknown()]),
    record("declared", "2026-09-29", [unknown("exercise-1", { exerciseId: "machine_chest_press", equipmentKey: "synthetic-machine-A", loadConvention: "total", loadRole: "external" })])]);
  const result = T.previewMapping(records, [rule()], rule({ equipmentKey: "synthetic-machine-B" }), selection);
  assert.equal(result.futureConflict, true); assert.equal(result.counts.conflictCount, 1);
  const missing = result.rows.find(row => row.recordId === "missing"), declared = result.rows.find(row => row.recordId === "declared");
  assert.equal(missing.status, "conflict"); assert.equal(missing.after.resolved, null); assert.equal(missing.after.equipmentKey, null);
  assert.equal(declared.after.equipmentKey, "synthetic-machine-A"); assert.deepEqual(declared.changedFields, []);
  assert.equal(declared.conflict, false); assert.equal(result.selected.after.equipmentKey, "synthetic-machine-B");
});

test("preview reports already-applied rules distinctly and preserves the original strict replacement key", () => {
  const mappings = freeze([rule({ loadRole: "unknown" }), rule({ rawName: "개인_프레스", equipmentKey: "other-machine" })]);
  const result = T.previewMapping([record("selected", "2026-10-01", [unknown()]), record("past", "2026-09-27", [unknown("exercise-1", { equipmentKey: "synthetic-machine-A" })])], mappings, rule(), selection);
  assert.equal(result.nextMappings.length, 2);
  assert.equal(result.nextMappings[0].rawName, "개인_프레스"); assert.equal(result.nextMappings[1].loadRole, "external");
  const already = T.previewMapping([record("selected", "2026-10-01", [unknown()]), record("past", "2026-09-27", [unknown()])], [rule()], rule(), selection);
  assert.equal(already.counts.affectedExerciseCount, 0); assert.equal(already.counts.alreadyAppliedExerciseCount, 1);
  assert.equal(already.counts.unchangedExerciseCount, 1); assert.equal(already.rows[0].status, "already-applied");
});

test("preview preserves raw mapping text and never silently broadens the strict replacement filter", () => {
  const rawName = " 개인 프레스 ";
  const mappings = [rule({ rawName }), rule({ rawName: "개인 프레스", equipmentKey: "other-machine" })];
  const result = T.previewMapping([record("selected", date, [unknown("exercise-1", { rawName })])], mappings, rule({ rawName }), selection);
  assert.equal(result.mapping.rawName, rawName); assert.equal(result.nextMappings.length, 2);
  assert.equal(result.nextMappings[0].rawName, "개인 프레스"); assert.equal(result.nextMappings[1].rawName, rawName);
});

test("preview counts multiple affected blocks in one record once and includes same-record nonselected blocks", () => {
  const result = T.previewMapping([record("selected", date, [unknown(), unknown("second")]),
    record("other", "2026-10-01", [unknown("first"), unknown("second", { rawName: "개인_프레스" })])], [], rule(), selection);
  assert.equal(result.counts.matchingExerciseCount, 3); assert.equal(result.counts.affectedExerciseCount, 3);
  assert.equal(result.counts.affectedRecordCount, 2); assert.equal(result.rows.length, 3);
});

test("preview reports changes reached through equipment-prefix aliases separately from exact raw-name matches", () => {
  const plain = unknown("exercise-1", { rawName: "체스트 프레스" }), prefixed = unknown("exercise-1", { rawName: "STA7000 체스트 프레스" });
  const result = T.previewMapping([record("selected", date, [plain]), record("prefixed", "2026-10-01", [prefixed])], [],
    rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" }), selection);
  assert.equal(result.counts.matchingExerciseCount, 0); assert.equal(result.counts.additionalAffectedExerciseCount, 1);
  assert.equal(result.counts.affectedExerciseCount, 1); assert.equal(result.rows[0].scope, "other-auto-change");
  assert.equal(result.rows[0].before.equipmentSource, "name-prefix"); assert.equal(result.rows[0].after.equipmentSource, "mapping");
});

test("an explicit unknown mapping keeps the existing as-recorded binding instead of guessing a dumbbell convention", () => {
  const rawName = "덤벨 개인 프레스", original = freeze([record("selected", date, [unknown("exercise-1", { rawName })]),
    record("other", "2026-10-01", [unknown("exercise-1", { rawName })])]);
  const result = T.previewMapping(original, [], rule({ rawName, exerciseId: "dumbbell_bench_press", loadConvention: "as-recorded", loadRole: "unknown" }), selection);
  assert.equal(result.rows[0].before.loadConvention, "per-side"); assert.equal(result.rows[0].after.loadConvention, "as-recorded");
  assert.equal(result.rows[0].after.loadConventionSource, "mapping"); assert.equal(original[1].exercises[0].sets[0].loadKg, 80);
});

test("invalid or unconfirmed proposals never create a fake resolved exercise or mutate existing mapping lists", () => {
  const records = freeze([record("selected", date, [unknown()])]), mappings = freeze([rule()]);
  for (const proposed of [rule({ exerciseId: "not-a-real-exercise" }), rule({ rawName: "다른 원문" }),
    rule({ loadConvention: "invented" }), rule({ loadRole: "invented" }), rule({ equipmentKey: {} }), rule({ confirmed: false }), null]) {
    const result = T.previewMapping(records, mappings, proposed, selection);
    assert.equal(result.valid, false); assert.equal(result.selected, null); assert.deepEqual(result.nextMappings, mappings);
    assert.equal(result.counts.affectedExerciseCount, 0); assert.ok(result.error);
  }
  assert.equal(T.previewMapping(records, mappings, rule(), { ...selection, exerciseId: "missing" }).valid, false);
  assert.equal(T.previewMapping(records, mappings, rule(), null).valid, false);
});

test("indexed preview matches a full-scan reference for aliases, fallback eligibility, ambiguity and explicit metadata", () => {
  const names = ["체스트 프레스", "체스트_프레스", "STA7000 체스트 프레스", "[STA7000] 체스트 프레스",
    "STA 7000 | 체스트 프레스", "디랙스 체스트 프레스", "[A헬스장] 체스트 프레스", "STA7000 다른 프레스", "덤벨 플라이"];
  const patches = [{}, { exerciseId: "machine_chest_press" }, { exerciseId: "dumbbell_bench_press" },
    { equipmentKey: "STA7000" }, { equipmentKey: "A헬스장" }, { loadConvention: "per-side" },
    { loadRole: "assistance" }, { exerciseId: "unsupported-custom" }, { equipmentKey: "STA7000", loadConvention: "total", loadRole: "external" }];
  const records = freeze([record("selected", date, [unknown("exercise-1", { rawName: "체스트 프레스" })]), ...names.flatMap((rawName, nameIndex) => patches.map((patch, patchIndex) =>
    record("case-" + nameIndex + "-" + patchIndex, "2026-10-01", [unknown("exercise-1", { rawName, ...patch })])))]);
  const mappingSets = [[], [rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" })],
    [rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" }), rule({ rawName: "체스트 프레스", equipmentKey: "A헬스장" })],
    [rule({ rawName: "STA7000 체스트 프레스", equipmentKey: "STA7000", loadConvention: "per-side" }),
      rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" })],
    [rule({ rawName: "체스트 프레스", equipmentKey: "STA7000", confirmed: false }),
      rule({ rawName: "STA7000 체스트 프레스", equipmentKey: "STA7000", exerciseId: "unsupported-custom" }),
      rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" })]];
  const proposals = [rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" }), rule({ rawName: "체스트 프레스", equipmentKey: "A헬스장" }),
    rule({ rawName: "체스트 프레스", equipmentKey: "STA7000", loadConvention: "as-recorded", loadRole: "unknown" }),
    rule({ rawName: "체스트 프레스", equipmentKey: null, loadRole: "assistance" })];
  const originals = snapshot({ records, mappingSets, proposals });
  for (const mappings of mappingSets) for (const proposed of proposals) compareWithBrute(records, mappings, proposed);
  assert.deepEqual({ records, mappingSets, proposals }, originals);
});

test("indexed preview also matches the full scan when the changed rule itself has an equipment prefix", () => {
  const records = [record("selected", date, [unknown("exercise-1", { rawName: "STA7000 체스트 프레스" })]),
    record("outer", "2026-10-01", [unknown("exercise-1", { rawName: "[A헬스장] STA7000 체스트 프레스" })]),
    record("plain", "2026-10-01", [unknown("exercise-1", { rawName: "체스트 프레스" })]),
    record("other", "2026-10-01", [unknown("exercise-1", { rawName: "STA7000 케이블 컬1" })])];
  const mappings = [rule({ rawName: "체스트 프레스", equipmentKey: "STA7000" }), rule({ rawName: "STA7000 체스트 프레스", equipmentKey: "A헬스장" })];
  for (const proposed of [rule({ rawName: "STA7000 체스트 프레스", equipmentKey: "A헬스장" }),
    rule({ rawName: "STA7000 체스트 프레스", equipmentKey: "STA7000", loadConvention: "as-recorded" })]) compareWithBrute(records, mappings, proposed);
});

test("500 records with eight exercises and 500 rules retain full-scan results without scanning every rule per unrelated block", t => {
  const mappings = Array.from({ length: 500 }, (_, index) => rule({ rawName: "개인 운동 " + index, equipmentKey: "machine-" + index }));
  const records = Array.from({ length: 500 }, (_, index) => record("record-" + index, "2026-10-01", Array.from({ length: 8 }, (_, exerciseIndex) =>
    unknown("exercise-" + exerciseIndex, { rawName: "개인 운동 " + exerciseIndex }))));
  const proposed = { ...mappings[0], loadRole: "assistance" }, selected = { recordId: "record-0", exerciseId: "exercise-0" };
  const before = performance.now(), expected = brutePreview(records, mappings, proposed, selected), bruteMs = performance.now() - before;
  const times = [], result = [];
  for (let index = 0; index < 3; index++) {
    const start = performance.now(); result.push(T.previewMapping(records, mappings, proposed, selected)); times.push(performance.now() - start);
  }
  for (const actual of result) for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], key);
  const medianMs = [...times].sort((a, b) => a - b)[1];
  t.diagnostic(JSON.stringify({ fullScanMs: +bruteMs.toFixed(2), indexedMs: times.map(value => +value.toFixed(2)), medianSpeedup: +(bruteMs / medianMs).toFixed(1) }));
  assert.ok(medianMs < bruteMs / 5, "indexing must remove the rule-count multiplier from preview work");
});
