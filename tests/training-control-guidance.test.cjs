"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const date = "2026-10-06", profile = { age: 30, healthContext: "general", goal: "performance" };
function review(sets, extra = {}) {
  const records = [{ id: "control-session", date, source: { kind: "manual" }, exercises: [{
    id: "control-block", rawName: "밴드 외회전", exerciseId: "external_rotation", equipmentKey: "합성 밴드",
    loadConvention: "as-recorded", loadRole: "unknown", sets, ...extra
  }] }];
  const before = JSON.stringify(records);
  const result = T.coachSession(T.analyze(records, { date, profile, includeCapacityHistory: true }), { profile });
  assert.equal(JSON.stringify(records), before);
  return result.rows[0].interpretation;
}
const set = (id, reps, loadKg = null, marker = null) => ({ id, reps, loadKg, marker, rir: null });

test("rotation guidance keeps every actual repetition and set count, including the lower final set", () => {
  const result = review([set("control-1", 8), set("control-2", 8), set("control-3", 7)]);
  assert.equal(result.nextAction.kind, "technique-control");
  assert.match(result.nextAction.body, /8·8·7회로 3세트/);
  assert.match(result.nextAction.body, /뒤 세트는 첫 세트의 횟수에 억지로 맞추지/);
  assert.equal(result.nextAction.proposal, undefined);
  assert.deepEqual(result.coaching.facts.current.sets.map(value => value.id), ["control-1", "control-2", "control-3"]);
  assert.deepEqual(result.coaching.facts.current.sets.map(value => value.reps), [8, 8, 7]);
});

test("single-set rotation guidance does not invent later sets or a repetition increase", () => {
  const result = review([set("only-set", 8)]);
  assert.match(result.nextAction.body, /이번에는 8회를 남겼/);
  assert.doesNotMatch(result.nextAction.body, /뒤 세트|나머지|3세트|9회/);
  assert.equal(result.nextAction.proposal, undefined);
});

test("rotation guidance preserves distinct raw loads and repeats without converting them", () => {
  const result = review([set("loaded-1", 8, 2), set("loaded-2", 8, 2), set("loaded-3", 7, 1)]);
  assert.match(result.nextAction.body, /2kg × 8·8회 \/ 1kg × 7회로 3세트/);
  assert.deepEqual(result.coaching.facts.current.sets.map(value => value.loadKg), [2, 2, 1]);
  assert.equal(result.nextAction.proposal, undefined);
});

test("missing repetitions and marked preparation sets do not become invented ordinary work", () => {
  for (const sets of [[], [set("unknown-set", null)], [set("warmup-set", 8, null, "W")]]) {
    const result = review(sets);
    assert.match(result.nextAction.body, /이번 동작을 통증 없는 범위/);
    assert.doesNotMatch(result.nextAction.body, /이번에는|뒤 세트|\d+세트/);
    assert.equal(result.nextAction.proposal, undefined);
  }
});

test("time-only mobility keeps its recorded duration instead of acquiring rotation sets", () => {
  const result = review([], { rawName: "폼 롤링", exerciseId: "foam_rolling", durationMinutes: 15 });
  assert.equal(result.nextAction.kind, "mobility");
  assert.match(result.nextAction.body, /15분 정도/);
  assert.doesNotMatch(result.nextAction.body, /3세트|8·8·7|뒤 세트/);
});
