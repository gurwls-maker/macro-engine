"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const C = require("../src/training-coaching.js");

const date = "2026-10-06", profile = { age: 30, healthContext: "general", goal: "performance", trainingYears: 2 };
const exercise = (id, extra = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press",
  equipmentKey: "합성 랙", loadConvention: "total", loadRole: "external",
  sets: [{ id: id + "-set", loadKg: 50, reps: 10, marker: null, rir: null }], ...extra });
function review(extra = {}, feeling = null, planning = null) {
  const records = ["2026-09-21", "2026-09-28", date].map((day, i) => ({ id: `r-${i}`, date: day,
    source: { kind: "manual" }, exercises: [exercise(`e-${i}`, extra)] }));
  const current = records.at(-1).exercises[0];
  if (feeling) current.feedback = { setId: current.sets[0].id, loadKg: current.sets[0].loadKg, reps: current.sets[0].reps, feeling };
  const result = T.coachSession(T.analyze(records, { date, profile, includeCapacityHistory: true }), { profile,
    planning: planning ? { schedule: [{ id: "assignment", date, recordId: "r-2", status: "performed", prescription: {
      exercises: [{ exerciseId: current.exerciseId, equipmentKey: current.equipmentKey, sets: 1, repsMin: 6, repsMax: 10 }] } }] } : undefined });
  return result.rows[0].interpretation.coaching;
}
const noInventedOthers = c => assert.doesNotMatch([c.assessment, c.primaryAction.body,
  ...c.supportingActions.map(action => action.body)].join(" "), /나머지 세트|다른 세트|다른 계획 세트|나머지 구간/);

test("a stable one-set bodyweight repetition choice does not invent other sets", () => {
  const c = review({ rawName: "풀업", exerciseId: "pull_up", equipmentKey: "합성 철봉", loadConvention: "bodyweight", loadRole: "bodyweight",
    sets: [{ id: "pull-up-set", loadKg: null, reps: 14, marker: null, rir: null }] });
  assert.equal(c.primaryAction.kind, "progression-option");
  assert.equal(c.primaryAction.proposal.targetReps, 15); noInventedOthers(c);
});

test("external, assistance, comfortable and hard one-set choices do not invent other sets", () => {
  for (const entry of [{}, { feeling: "comfortable" }, { feeling: "hard" },
    { extra: { rawName: "어시스트 풀업", exerciseId: "assisted_pull_up", loadConvention: "assistance", loadRole: "assistance" } }]) {
    const c = review(entry.extra, entry.feeling); noInventedOthers(c);
    assert.ok(c.primaryAction.body.includes("10회"));
    if (entry.feeling !== "hard") assert.equal(c.primaryAction.proposal.targetReps, 11);
  }
});

test("one counted plan set at the upper bound checks that actual set's reserve rather than nonexistent peers", () => {
  for (const feeling of [null, "comfortable"]) {
    const c = review({}, feeling, true);
    assert.equal(c.primaryAction.kind, "load-option"); assert.equal(c.primaryAction.proposal, undefined);
    assert.match(c.primaryAction.body, /이 세트의 동작과 의도한 여유/); noInventedOthers(c);
  }
});

test("a one-set new heavy exposure does not invent a lower or remaining set", () => {
  const previous = { ...exercise("old"), date: "2026-09-28", sessionId: "old-session" },
    current = { ...exercise("current", { sets: [{ id: "current-set", loadKg: 70, reps: 5, marker: null, rir: null }] }), date, sessionId: "current-session" };
  const c = C.interpret({ current, previous, history: [previous], loadedMovement: true, profile });
  assert.equal(c.primaryAction.kind, "consolidate-heavy"); noInventedOthers(c);
  assert.match(c.assessment, /높인 부하/);
});
