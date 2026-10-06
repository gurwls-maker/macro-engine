"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const C = require("../src/training-capacity.js");
const set = (loadKg = 100, reps = 10, rir = null, id = "set", marker = null) => ({ id, loadKg, reps, rir, marker });
const sample = (date, sets = [set()], extra = {}) => ({ sessionId: `session:${date}`, blockId: `block:${date}`, date, sets, ...extra });
const compare = (sets, history = [], extra = {}) => C.compareHistory(sets, history, { date: "2026-10-06", ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("missing RIR permits a provisional formula estimate, not a measured maximum", () => {
  const value = C.estimateSet(set());
  close(value.minKg, 100 * 4 / 3); close(value.maxKg, 100 * 4 / 3);
  assert.equal(value.basis, "estimated-performance"); assert.equal(value.rangeMeaning, "formula-spread");
  assert.equal(value.effortBasis, "record-only"); assert.equal(value.reportedRir, null); assert.equal(value.rirApplied, false);
  assert.equal(Object.hasOwn(value, "confidence"), false);
});

test("one performed repetition uses the recorded load and ordinary low reps remain estimable", () => {
  const one = C.estimateSet(set(120, 1)); assert.equal(one.minKg, 120); assert.equal(one.maxKg, 120);
  const three = C.estimateSet(set(120, 3)); close(three.minKg, 120 * 36 / 34); close(three.maxKg, 132);
  assert.equal(three.performedReps, 3);
});

test("actual numeric RIR refines effective repetitions only inside the model range", () => {
  const refined = C.estimateSet(set(100, 6, 2)); assert.equal(refined.effectiveReps, 8); assert.equal(refined.rirApplied, true);
  assert.equal(refined.effortBasis, "reported-rir"); close(refined.maxKg, 100 * (1 + 8 / 30));
  const zero = C.estimateSet(set(100, 6, 0)); assert.equal(zero.reportedRir, 0); assert.equal(zero.rirApplied, true);
  const long = C.estimateSet(set(100, 10, 2)); assert.equal(long.effectiveReps, 10); assert.equal(long.rangeLimited, true); assert.equal(long.rirApplied, false);
  const fractional = C.estimateSet(set(100, 6, 0.5)); assert.equal(fractional.effectiveReps, 6.5);
});

test("qualitative comfortable or near-limit feelings never become numeric RIR", () => {
  const ordinary = C.estimateSet(set(100, 6));
  for (const [feeling, basis] of [["comfortable", "comfortable"], ["limit", "near-limit"], ["hard", "record-only"]]) {
    const value = C.estimateSet(set(100, 6), { feeling });
    assert.equal(value.minKg, ordinary.minKg); assert.equal(value.maxKg, ordinary.maxKg);
    assert.equal(value.effortBasis, basis); assert.equal(value.reportedRir, null); assert.equal(value.effectiveReps, 6);
  }
});

test("unsupported, unknown, malformed, non-general and overflowing set values do not create estimates", () => {
  for (const value of [null, {}, set(null), set(0), set(-1), set("100"), set(Infinity), set(Number.MAX_VALUE),
    set(100, null), set(100, 0), set(100, 11), set(100, 1.5), set(100, "10"), set(100, 8, null, "warm", "W"), set(100, 8, null, "drop", "D")]) {
    assert.equal(C.estimateSet(value), null);
  }
  for (const rir of [undefined, null, "2", -1, Infinity, 11]) assert.equal(C.estimateSet(set(100, 6, rir)).effectiveReps, 6);
});

test("formula estimates increase with recorded load and with valid repetitions", () => {
  for (let reps = 1; reps <= 10; reps++) {
    const light = C.estimateSet(set(80, reps)), heavy = C.estimateSet(set(100, reps));
    assert.ok(heavy.minKg > light.minKg); assert.ok(heavy.maxKg > light.maxKg);
    if (reps > 1) {
      const previous = C.estimateSet(set(100, reps - 1));
      assert.ok(heavy.minKg > previous.minKg); assert.ok(heavy.maxKg > previous.maxKg);
    }
  }
});

test("best estimate uses actual valid set performance rather than highest displayed load", () => {
  const value = compare([set(120, 3, null, "heavy"), set(100, 10, null, "working")]);
  assert.equal(value.current.setId, "working"); assert.equal(value.current.loadKg, 100);
  assert.equal(value.previous, null); assert.equal(value.allTimeBest.setId, "working");
});

test("recent reference is the strongest eligible source within 42 days, not an unrelated old lifetime peak", () => {
  const value = compare([set(120, 3)], [sample("2026-08-01", [set(200, 5)]), sample("2026-09-18", [set(100, 10)]), sample("2026-10-01", [set(90, 8)])]);
  assert.equal(value.previous.date, "2026-09-18"); assert.equal(value.allTimeBest.date, "2026-08-01");
  assert.equal(value.current.date, "2026-10-06"); assert.equal(value.expectedRepsAtCurrentLoad.min, 3); assert.equal(value.expectedRepsAtCurrentLoad.max, 5);
});

test("42-day reference boundary is inclusive and same-date, future or malformed history cannot enter", () => {
  const value = compare([set()], [sample("2026-08-25", [set(80)]), sample("2026-08-24", [set(200)]),
    sample("2026-10-06", [set(300)]), sample("2026-10-07", [set(400)]), sample("2026-02-30", [set(500)])]);
  assert.equal(value.previous.date, "2026-08-25"); assert.equal(value.allTimeBest.date, "2026-08-24");
  const invalid = compare([set()], [sample("2026-09-18")], { date: "bad" });
  assert.equal(invalid.previous, null); assert.equal(invalid.current.date, null);
});

test("nonregular light work is excluded from reference, while an explicit performance test remains an observation", () => {
  const history = ["deload", "light", "technique", "time-limited", "return"].map((trainingIntent, index) => sample(`2026-09-${10 + index}`, [set(300)], { trainingIntent }));
  history.push(sample("2026-09-18", [set(120, 3)], { trainingIntent: "test" }));
  const value = compare([set(100, 8)], history);
  assert.equal(value.previous.trainingIntent, "test"); assert.equal(value.previous.loadKg, 120);
  assert.equal(value.stableWorking.detected, false);
});

test("same-load history remains useful independently of RM formula eligibility and exposes its exact source date", () => {
  const value = compare([set(100, 8)], [sample("2026-09-01", [set(100, 12)]), sample("2026-10-02", [set(100, 15)])]);
  assert.equal(value.previous, null); assert.equal(value.sameLoadHistory.date, "2026-10-02");
  assert.equal(value.sameLoadHistory.daysAgo, 4); assert.equal(value.sameLoadHistory.reps, 15);
  assert.equal(value.sameLoadHistory.observationDays, 2); assert.equal(value.sameLoadHistory.totalObservationDays, 3);
});

test("three repeated working days establish a working standard without proving maximal effort", () => {
  const value = compare([set(100, 10)], [sample("2026-09-09"), sample("2026-09-18")]);
  assert.equal(value.stableWorking.detected, true); assert.equal(value.stableWorking.basis, "repeated-working-standard");
  assert.equal(value.stableWorking.observationDays, 3); assert.deepEqual(value.stableWorking.dates, ["2026-09-09", "2026-09-18", "2026-10-06"]);
  assert.equal(value.current.effortBasis, "record-only");
  assert.equal(compare([set()], [sample("2026-09-18")]).stableWorking.detected, false);
});

test("working-standard continuity uses leading actual sets, not high-load tails, RIR equality or test days", () => {
  const history = [sample("2026-09-09", [set(100, 10, 2)]), sample("2026-09-18", [set(100, 10, null)]), sample("2026-10-01", [set(200, 1)], { trainingIntent: "test" })];
  const value = compare([set(100, 10, 0, "lead"), set(200, 1, null, "tail")], history);
  assert.equal(value.current.setId, "tail"); assert.equal(value.stableWorking.detected, true); assert.equal(value.stableWorking.loadKg, 100);
  assert.equal(compare([set()], history, { trainingIntent: "test" }).stableWorking.detected, false);
  assert.equal(compare([set()], [sample("2026-09-09"), sample("2026-09-18", [set(90)])]).stableWorking.detected, false);
});

test("formula inversion refuses loads above the prior range or wholly above the supported repetition range", () => {
  const history = [sample("2026-09-18", [set(100, 10)])];
  assert.equal(compare([set(150, 1)], history).expectedRepsAtCurrentLoad, null);
  assert.equal(compare([set(40, 10)], history).expectedRepsAtCurrentLoad, null);
  const atLimit = compare([set(100 * 4 / 3, 1)], history).expectedRepsAtCurrentLoad;
  assert.equal(atLimit.min, 1); assert.equal(atLimit.max, 1);
  const identical = compare([set(100, 10)], history).expectedRepsAtCurrentLoad;
  assert.equal(identical.min, 10); assert.equal(identical.max, 10, "floating-point roundoff must not invent a lower repetition band");
});

test("identical copied source IDs are deduplicated and conflicting copies are excluded", () => {
  const old = sample("2026-09-18"), value = compare([set()], [old, structuredClone(old)]);
  assert.equal(value.sameLoadHistory.observationDays, 1); assert.deepEqual(value.excluded.ambiguousDays, []);
  const conflict = structuredClone(old); conflict.sets[0].loadKg = 200;
  const rejected = compare([set()], [old, conflict]);
  assert.equal(rejected.previous, null); assert.equal(rejected.sameLoadHistory, null); assert.equal(rejected.excluded.conflictingSamples, 1);
  const purposeConflict = structuredClone(old); purposeConflict.trainingIntent = "deload";
  assert.equal(compare([set()], [old, purposeConflict]).previous, null);
  const annotated = sample("2026-09-18", [set()], { feedback: { setId: "set", loadKg: 100, reps: 10, feeling: "comfortable" } });
  const reordered = structuredClone(annotated); reordered.feedback = { feeling: "comfortable", reps: 10, loadKg: 100, setId: "set" };
  assert.ok(compare([set()], [annotated, reordered]).previous, "property order is not a conflicting annotation");
});

test("parallel sessions and repeated blocks on one day are not silently chosen as comparable history", () => {
  for (const extra of [{ sessionId: "parallel" }, { blockId: "repeated" }]) {
    const value = compare([set()], [sample("2026-09-18"), sample("2026-09-18", [set(200)], extra)]);
    assert.equal(value.previous, null); assert.equal(value.sameLoadHistory, null); assert.deepEqual(value.excluded.ambiguousDays, ["2026-09-18"]);
  }
});

test("duplicate and conflicting set IDs cannot manufacture repeated sets or larger peaks", () => {
  const value = compare([set(100, 8, null, "same"), set(100, 8, null, "same")]); assert.equal(value.current.reps, 8);
  const invalid = compare([set(100, 8, null, "same"), set(200, 8, null, "same")]); assert.equal(invalid.current, null);
});

test("selected-set qualitative feedback applies only to its unchanged numeric snapshot", () => {
  const value = compare([set(100, 8, null, "set")], [], { feedback: { setId: "set", loadKg: 100, reps: 8, feeling: "comfortable" } });
  assert.equal(value.current.effortBasis, "comfortable");
  assert.equal(compare([set(100, 8)], [], { feedback: { setId: "set", loadKg: 100, reps: 9, feeling: "comfortable" } }).current.effortBasis, "record-only");
});

test("capacity interpretation preserves inputs and exports the same browser and Node API", () => {
  const sets = [set(120, 3), set(100, 10, null, "back")], history = [sample("2026-09-18")], options = { date: "2026-10-06" };
  const before = JSON.stringify({ sets, history, options }); C.compareHistory(sets, history, options);
  assert.equal(JSON.stringify({ sets, history, options }), before);
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve("../src/training-capacity.js"), "utf8"), context);
  assert.equal(typeof context.MacroTrainingCapacity.estimateSet, "function");
  close(context.MacroTrainingCapacity.estimateSet(set()).minKg, C.estimateSet(set()).minKg);
  assert.doesNotThrow(() => C.compareHistory(null, null, null));
});
