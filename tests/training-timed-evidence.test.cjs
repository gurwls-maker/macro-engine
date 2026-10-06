"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const Store = require("../src/training-store.js");

const date = "2026-10-06";
function exercise(id, durationMinutes, sets = []) {
  return { id: "current-" + id, exerciseId: id, rawName: T.catalog.find(row => row.id === id).label,
    equipmentKey: "synthetic:" + id, loadConvention: "as-recorded", loadRole: "unknown",
    durationMinutes, repsTotal: null, reportedVolumeKg: null, notes: "", sets };
}
function record(exercises, extra = {}) {
  return { id: "current", date, time: "18:00", label: "Synthetic", durationMinutes: 60,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    notes: "", effort: null, pain: null, exercises, ...extra };
}
function review(exercises) {
  const records = [record(exercises)];
  Store.validate({ ...Store.createEmpty(), records });
  const before = structuredClone(records);
  const value = T.coachSession(T.analyze(records, { date, includeCapacityHistory: true }), { sessionId: "current" });
  assert.deepEqual(records, before);
  return value;
}
const noStrengthExpectation = /준비·별도|다음 일반 세트|근력·근성장|kg|RM/;

test("time-only mobility and cardio evidence uses its own actual date and minutes without invented sets", () => {
  const value = review([exercise("treadmill", 15.25), exercise("foam_rolling", 5.5), exercise("back_stretch", 10)]);
  for (const row of value.rows) {
    const raw = value.session.exercises.find(ex => ex.id === row.blockId), evidence = row.interpretation.evidence;
    assert.equal(evidence.referenceStatus, "time-only");
    assert.equal(evidence.title, "기록한 운동 시간");
    assert.ok(evidence.summary.includes(date));
    assert.ok(evidence.summary.includes(raw.durationMinutes + "분"));
    assert.deepEqual(evidence.context, [], "the dated actual minutes are not repeated as a second identical field");
    assert.doesNotMatch(JSON.stringify(evidence), noStrengthExpectation);
    assert.match(row.interpretation.nextAction.body, new RegExp(raw.durationMinutes + "분"));
    assert.equal(row.interpretation.performance, null);
    assert.deepEqual(raw.sets, []);
  }
});

test("time plus actual sets retains both domains without turning minutes into sets", () => {
  const set = { id: "mixed-work", loadKg: 40, reps: 8, marker: null, rir: null };
  const value = review([exercise("bench_press", 7.25, [set])]), row = value.rows[0];
  assert.equal(row.interpretation.evidence.referenceStatus, "first");
  assert.equal(row.interpretation.structure.kind, "straight");
  assert.deepEqual(row.sets, [set]);
  assert.deepEqual(row.interpretation.evidence.context.filter(item => item.label === "기록한 운동 시간"),
    [{ label: "기록한 운동 시간", value: `${date} · 7.25분` }]);
  assert.match(row.interpretation.summary, /40kg.*8회/);
});

test("named-only and marked-only records do not imply absent warmups or require general sets", () => {
  const marked = [{ id: "warmup", loadKg: 20, reps: 10, marker: "W", rir: null },
    { id: "special", loadKg: 20, reps: 8, marker: "A", rir: null }];
  const value = review([exercise("leg_curl", null), exercise("overhead_press", null, marked)]);
  const named = value.rows.find(row => row.blockId === "current-leg_curl"), markedRow = value.rows.find(row => row.blockId === "current-overhead_press");
  assert.equal(named.interpretation.evidence.summary, "이번에 남긴 운동 기록에서 이어가요.");
  assert.match(markedRow.interpretation.evidence.summary, /2개 세트/);
  for (const row of value.rows) {
    assert.equal(row.interpretation.evidence.referenceStatus, "raw-only");
    assert.doesNotMatch(row.interpretation.evidence.summary, /다음 일반 세트|준비·별도/);
    assert.deepEqual(row.interpretation.evidence.context, []);
  }
  assert.deepEqual(markedRow.sets, marked);
});

test("historical time evidence retains the selected original date and does not inherit later illness or durations", () => {
  const current = exercise("treadmill", 12.75), value = review([current]);
  const records = [record([current]), record([exercise("treadmill", 90)], { id: "future", date: "2026-10-07" })];
  Store.validate({ ...Store.createEmpty(), records });
  const analysis = T.analyze(records, { date, checkins: { "2026-10-07": { coachCheckin: { illness: "active" } } } });
  const historical = T.coachSession(analysis, { sessionId: "current" }).rows[0];
  assert.deepEqual(historical.interpretation.evidence, value.rows[0].interpretation.evidence);
  assert.doesNotMatch(JSON.stringify(historical.interpretation.evidence), /2026-10-07|90분/);
});
