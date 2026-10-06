"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const rule = (extra = {}) => ({ rawName: "합성 스쿼트", exerciseId: "squat", equipmentKey: null,
  loadConvention: "total", loadRole: "unknown", confirmed: true, ...extra });
const exercise = (id = "block", extra = {}) => ({ id, rawName: "합성 스쿼트", exerciseId: null,
  equipmentKey: null, loadConvention: "as-recorded", loadRole: "unknown",
  sets: [{ id: id + "-set", loadKg: 60, reps: 10, marker: null, rir: null }], ...extra });
const record = (id, date, block = exercise()) => ({ id, date, time: "18:00", label: "합성 운동",
  source: { kind: "manual", hash: null }, sequence: { order: "unknown", structure: "unknown" }, exercises: [block] });
const completed = rule({ equipmentKey: "합성 바벨 랙 A" });
function frozen(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test("an otherwise identical completed device rule supplements its older blank device rule in either order", () => {
  for (const mappings of [[rule(), completed], [completed, rule()]]) {
    const result = T.describeExercise(exercise(), frozen(mappings));
    assert.equal(result.resolved.id, "squat");
    assert.equal(result.resolved.confidence, "confirmed");
    assert.equal(result.equipmentKey, completed.equipmentKey);
    assert.equal(result.equipmentSource, "mapping");
    assert.equal(result.loadConvention, "total");
    assert.equal(result.loadConventionSource, "mapping");
    assert.equal(result.loadRole, "unknown");
  }
});

test("completed mappings restore actual old observations without altering source records or deriving loads", () => {
  const records = frozen([record("old", "2026-10-01"), record("current", "2026-10-05", exercise("current-block", {
    exerciseId: "squat", equipmentKey: completed.equipmentKey, loadConvention: "total",
    sets: [{ id: "current-set", loadKg: 70, reps: 3, marker: null, rir: null }] }))]);
  const before = structuredClone(records), mappings = frozen([rule(), completed]);
  const result = T.analyze(records, { date: "2026-10-05", mappings, includeCapacityHistory: true });
  assert.deepEqual(result.capacityHistory.samples.map(row => [row.sessionId, row.exerciseId, row.equipmentKey, row.loadConvention,
    row.sets[0].loadKg, row.sets[0].reps]), [
    ["old", "squat", completed.equipmentKey, "total", 60, 10],
    ["current", "squat", completed.equipmentKey, "total", 70, 3]
  ]);
  assert.deepEqual(records, before);
});

test("a completed device rule resolves mapping previews without inventing a conflict or deleting saved rules", () => {
  const records = frozen([record("selected", "2026-10-05"), record("past", "2026-10-01")]);
  const mappings = frozen([rule()]), before = structuredClone({ records, mappings });
  const result = T.previewMapping(records, mappings, completed, { recordId: "selected", exerciseId: "block" });
  assert.equal(result.valid, true); assert.equal(result.futureConflict, false);
  assert.equal(result.counts.conflictCount, 0); assert.equal(result.rows[0].status, "affected");
  assert.equal(result.rows[0].after.equipmentKey, completed.equipmentKey);
  assert.equal(result.nextMappings.length, 2, "interpretation completion never rewrites prior saved rules");
  assert.deepEqual({ records, mappings }, before);
});

test("two real physical devices remain ambiguous even with an older incomplete rule", () => {
  const second = rule({ equipmentKey: "합성 바벨 랙 B" });
  for (const mappings of [[rule(), completed, second], [second, completed, rule()]]) {
    const result = T.describeExercise(exercise(), mappings);
    assert.equal(result.resolved, null); assert.equal(result.equipmentKey, null);
    const explicit = T.describeExercise(exercise("block", { equipmentKey: completed.equipmentKey }), mappings);
    assert.equal(explicit.resolved.id, "squat"); assert.equal(explicit.equipmentKey, completed.equipmentKey);
    const preview = T.previewMapping([record("selected", "2026-10-05"), record("past", "2026-10-01")], mappings,
      second, { recordId: "selected", exerciseId: "block" });
    assert.equal(preview.futureConflict, true); assert.equal(preview.rows[0].status, "conflict");
  }
});

test("different movements, conventions, load roles and variants cannot be repaired by device completion", () => {
  for (const incomplete of [rule({ exerciseId: "deadlift" }), rule({ loadConvention: "per-side" }),
    rule({ loadConvention: "as-recorded" }), rule({ loadRole: "assistance" }), rule({ loadRole: "external" }),
    rule({ variantKey: "custom-variant" })]) {
    for (const mappings of [[incomplete, completed], [completed, incomplete]]) {
      assert.equal(T.describeExercise(exercise(), mappings).resolved, null, JSON.stringify(incomplete));
    }
  }
});

test("unconfirmed or unsupported completions do not supplement confirmed blank equipment", () => {
  for (const supplement of [rule({ equipmentKey: "합성 랙", confirmed: false }),
    rule({ equipmentKey: "합성 랙", exerciseId: "unknown-id" })]) {
    const result = T.describeExercise(exercise(), [rule(), supplement]);
    assert.equal(result.resolved.id, "squat"); assert.equal(result.equipmentKey, null);
    assert.equal(result.resolved.comparableKey, null);
  }
});

test("explicit record identity and numbers remain authoritative over mapping completion", () => {
  const raw = frozen(exercise("block", { exerciseId: "deadlift", equipmentKey: "합성 랙 B", loadConvention: "per-side", loadRole: "assistance" }));
  const before = structuredClone(raw), result = T.describeExercise(raw, [rule(), completed]);
  assert.equal(result.resolved.id, "deadlift"); assert.equal(result.equipmentKey, "합성 랙 B");
  assert.equal(result.loadConvention, "per-side"); assert.equal(result.loadRole, "assistance");
  assert.deepEqual(raw, before);
});

test("a stem rule cannot fill device-specific names for a different brand", () => {
  const mappings = [rule({ equipmentKey: null }), rule({ equipmentKey: "디랙스" })];
  assert.equal(T.describeExercise("Drax 합성 스쿼트", mappings).resolved.id, "squat");
  assert.equal(T.describeExercise("Infinity 합성 스쿼트", mappings).resolved, null);
});
