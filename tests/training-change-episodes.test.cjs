"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/training-coaching.js");
const T = require("../src/training.js");
const Store = require("../src/training-store.js");

const day = "2026-09-25";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
const block = (id, values, extra = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "episode-rack",
  loadConvention: "total", loadRole: "external", sets: values.map(([loadKg, reps, rir = null], index) => ({ id: id + ":set-" + index, loadKg, reps, rir, marker: null })), ...extra });
const record = (id, date, values, extra = {}) => ({ id, date, time: "18:00", label: "합성 운동", source: { kind: "manual", hash: null },
  sequence: { order: "unknown", structure: "unknown" }, exercises: [block(id + ":bench", values)], ...extra });
const phase = (prefix, dates, values, extra = {}) => dates.map((date, index) => record(prefix + "-" + index, date, values, extra));
const values = (load, count = 3, reps = 8) => Array.from({ length: count }, () => [load, reps]);
const baseline = () => phase("base", ["2026-09-07", "2026-09-09", "2026-09-11"], values(80));
const decreased = () => [...baseline(), ...phase("middle", ["2026-09-14", "2026-09-16", "2026-09-18"], [[80, 8], [80, 6]]),
  ...phase("lower", ["2026-09-21", "2026-09-23", day], values(55, 2))];
const expanded = count => [...baseline(), ...phase("expanded", ["2026-09-21", "2026-09-23", day], values(80, count))];
function sample(record) { return { ...record.exercises[0], date: record.date, sessionId: record.id, blockId: record.exercises[0].id,
  trainingIntent: record.trainingIntent, pain: record.pain, sourceKind: record.source.kind }; }
function direct(records, extra = {}) {
  const rows = records.map(sample);
  return C.interpret({ current: rows.at(-1), previous: rows.at(-2), history: rows.slice(0, -1), loadedMovement: true, profile, ...extra });
}
function review(records, options = {}) {
  const date = records.at(-1).date, p = { ...profile, ...options.profile };
  return T.coachSession(T.analyze(records, { date, profile: p, checkins: options.checkins, includeCapacityHistory: true }), { profile: p, ...options });
}
const decision = result => result.rows[0].interpretation.coaching;
const proposed = action => Object.hasOwn(action, "proposal");

test("a sustained higher-load mixed composition retains its real old baseline without a decline-restoration instruction", () => {
  const old = phase("old", ["2026-09-07", "2026-09-09", "2026-09-11"], values(15, 4, 20));
  const current = phase("higher", ["2026-09-21", "2026-09-23", day], [[15, 20], [20, 20], [20, 20], [20, 20]]);
  const records = [...old, ...current], before = structuredClone(records), result = direct(records);
  assert.equal(result.facts.recentChange.kind, "raised-load");
  assert.deepEqual(result.facts.recentChange.baseline.sets.map(set => [set.loadKg, set.reps]), values(15, 4, 20));
  assert.equal(result.facts.recentChange.baseline.source.sessionId, "old-2");
  assert.equal(result.facts.recentChange.baseline.setCount, 4);
  assert.equal(result.facts.current.setCount, 4);
  assert.match(result.assessment, /15kg.*20kg.*새로 높인 부하/);
  assert.match(result.assessment, /높여 온 부하에서 반복·세트까지 한꺼번에 더하지는/);
  assert.doesNotMatch(result.assessment, /차이를.*메우|되찾|줄었던|회복했다|이미 바꾼 부하와 세트 수|세트 수를.*늘렸/);
  assert.deepEqual(records, before);
});

test("three repeated lower workloads preserve the earlier stable full work and the intervening decline phase", () => {
  const records = decreased(), before = structuredClone(records), result = direct(records), episode = result.facts.recentChange;
  assert.equal(result.primaryAction.kind, "review-recent-reduction"); assert.equal(proposed(result.primaryAction), false);
  assert.equal(episode.kind, "reduced"); assert.equal(episode.since, "2026-09-14"); assert.equal(episode.currentSince, "2026-09-21");
  assert.equal(episode.observationDays, 3); assert.equal(episode.spanDays, 4);
  assert.deepEqual(episode.baseline.sets.map(set => [set.loadKg, set.reps]), values(80));
  assert.equal(episode.baseline.source.sessionId, "base-2");
  assert.deepEqual(episode.stages.map(stage => stage.work.sets.map(set => [set.loadKg, set.reps])), [[[80, 8], [80, 6]], values(55, 2)]);
  const signal = result.signals.find(signal => signal.kind === "recent-work-reduced");
  assert.deepEqual(new Set(signal.sourceRefs.map(source => source.sessionId)), new Set(records.map(record => record.id)));
  assert.match(result.assessment, /80kg.*55kg/); assert.match(result.primaryAction.body, /한 번에.*채우지/);
  assert.deepEqual(records, before);
});

test("a later lower-load phase with recovered tail repetitions does not erase an earlier stable full-work reduction", () => {
  const normal = phase("normal", ["2026-09-07", "2026-09-09", "2026-09-11"], [[105, 6], [105, 6], [105, 6]]),
    middle = phase("middle", ["2026-09-14", "2026-09-16", "2026-09-18"], [[105, 6], [105, 4]]),
    current = phase("lower", ["2026-09-21", "2026-09-23", day], [[70, 6], [70, 6]]), records = [...normal, ...middle, ...current];
  const before = structuredClone(records), result = direct(records), episode = result.facts.recentChange;
  assert.equal(episode.kind, "reduced"); assert.equal(episode.baseline.source.sessionId, "normal-2");
  assert.equal(episode.since, "2026-09-14"); assert.equal(episode.currentSince, "2026-09-21");
  assert.deepEqual(episode.baseline.sets.map(set => [set.loadKg, set.reps]), [[105, 6], [105, 6], [105, 6]]);
  assert.deepEqual(episode.stages.map(stage => stage.work.sets.map(set => [set.loadKg, set.reps])), [[[105, 6], [105, 4]], [[70, 6], [70, 6]]]);
  assert.equal(result.primaryAction.kind, "review-recent-reduction"); assert.equal(proposed(result.primaryAction), false);
  assert.match(result.assessment, /105kg.*6·6·6회.*70kg.*6·6회/);
  assert.doesNotMatch(result.assessment, /근력이.*하락|회복.*실패|디로드해야/);
  assert.deepEqual(records, before);
});

test("a deliberate large repetition-target exchange after fewer sets keeps reconfiguration rather than treating kilograms as equivalent work", () => {
  const records = [...phase("normal", ["2026-09-07", "2026-09-09", "2026-09-11"], [[105, 6], [105, 6], [105, 6]]),
    ...phase("middle", ["2026-09-14", "2026-09-16", "2026-09-18"], [[105, 6], [105, 4]]),
    ...phase("new-rep-target", ["2026-09-21", "2026-09-23", day], [[70, 15], [70, 15]])];
  const result = direct(records);
  assert.equal(result.facts.recentChange.kind, "reconfigured");
  assert.equal(result.facts.recentChange.baseline.source.sessionId, "middle-2");
  assert.notEqual(result.primaryAction.kind, "review-recent-reduction");
  assert.match(result.assessment, /중량과 반복의 배분/);
  assert.doesNotMatch(result.assessment, /근력.*하락|차이를.*메우/);
});

test("a source-bound purpose answer may explain the chained reduction without deleting the normal or middle source", () => {
  const records = [...phase("normal", ["2026-09-07", "2026-09-09", "2026-09-11"], [[105, 6], [105, 6], [105, 6]]),
    ...phase("middle", ["2026-09-14", "2026-09-16", "2026-09-18"], [[105, 6], [105, 4]]),
    ...phase("lower", ["2026-09-21", "2026-09-23", day], [[70, 6], [70, 6]])];
  const current = records.at(-1).exercises[0]; current.coachingAnswer = Store.createCoachingAnswer(current, "load-change", "planned");
  const c = decision(review(records));
  assert.equal(c.primaryAction.kind, "maintain-intended-work"); assert.equal(proposed(c.primaryAction), false);
  assert.equal(c.facts.recentChange.baseline.source.sessionId, "normal-2");
  assert.equal(c.facts.recentChange.stages[0].work.source.sessionId, "middle-2");
  assert.match(c.assessment, /의도적으로/);
});

test("a repeated large set reduction at unchanged load is not just a fresh +1 plateau", () => {
  const records = [...baseline(), ...phase("lower", ["2026-09-21", "2026-09-23", day], values(80, 2))], result = direct(records);
  assert.equal(result.facts.recentChange.kind, "reduced"); assert.equal(result.primaryAction.kind, "review-recent-reduction");
  assert.equal(result.facts.recentChange.baseline.setCount, 3); assert.equal(result.facts.current.setCount, 2);
  assert.equal(proposed(result.primaryAction), false);
});

test("a repeated large repetition reduction at unchanged complete load layout preserves its prior work", () => {
  const result = direct([...baseline(), ...phase("lower", ["2026-09-21", "2026-09-23", day], values(80, 3, 5))]);
  assert.equal(result.facts.recentChange.kind, "reduced"); assert.equal(result.primaryAction.kind, "review-recent-reduction");
  assert.deepEqual(result.facts.recentChange.baseline.sets.map(set => set.reps), [8, 8, 8]);
});

for (const currentWork of [[[80, 8], [80, 6]], [[80, 8], [80, 8]], values(80, 3, 5)]) {
  test(`unchanged kilograms are not described as a lowered load in a repeated reduced composition ${JSON.stringify(currentWork)}`, () => {
    const records = [...baseline(), ...phase("reduced", ["2026-09-14", "2026-09-16", "2026-09-18"], currentWork)];
    const before = structuredClone(records), result = direct(records), native = decision(review(records));
    for (const value of [result, native]) {
      assert.equal(value.facts.recentChange.kind, "reduced");
      assert.equal(value.facts.recentChange.baseline.maxLoadKg, 80);
      assert.equal(value.facts.current.maxLoadKg, 80);
      assert.match(value.assessment, /80kg × 8·8·8회.*80kg/);
      assert.match(value.assessment, /전체 구성보다 줄어든 부분/);
      assert.doesNotMatch(value.assessment, /낮춘 중량|중량을 낮|중량.*줄였|중량·세트·반복/);
      assert.equal(value.primaryAction.kind, "review-recent-reduction");
      assert.equal(value.primaryAction.proposal, undefined);
      assert.deepEqual(value.primaryAction.focusSetIds, records.at(-1).exercises[0].sets.map(set => set.id));
      assert.deepEqual(value.facts.current.sets.map(set => [set.loadKg, set.reps]), currentWork);
      const signal = value.signals.find(signal => signal.kind === "recent-work-reduced");
      assert.deepEqual(new Set(signal.sourceRefs.map(source => source.sessionId)), new Set(records.map(row => row.id)));
    }
    assert.deepEqual(records, before);
  });
}

test("a lower load with a much higher repetition target is reconfigured work rather than an automatic decline", () => {
  const result = direct([...baseline(), ...phase("higher-reps", ["2026-09-21", "2026-09-23", day], values(55, 3, 15))]);
  assert.equal(result.facts.recentChange.kind, "reconfigured"); assert.notEqual(result.primaryAction.kind, "review-recent-reduction");
  assert.match(result.assessment, /중량과 반복의 배분/); assert.doesNotMatch(result.assessment, /근력.*줄|부진|체력.*저하/);
});

test("a heavier low-repetition emphasis is not certified as the same previous higher-repetition capacity", () => {
  const result = direct([...baseline(), ...phase("heavy", ["2026-09-21", "2026-09-23", day], values(110, 3, 3))]);
  assert.equal(result.facts.recentChange.kind, "reconfigured"); assert.match(result.assessment, /80kg.*110kg/);
  assert.doesNotMatch(result.assessment, /근력.*향상|새로 높인 부하를 뒤 세트까지 이어낸/);
});

for (const count of [5, 6]) test(`repeating an expansion from three to ${count} sets in four days still addresses the new whole workload`, () => {
  const result = direct(expanded(count));
  assert.equal(result.primaryAction.kind, "consolidate-recent-expansion"); assert.equal(proposed(result.primaryAction), false);
  assert.equal(result.facts.recentChange.baseline.setCount, 3); assert.equal(result.facts.recentChange.observationDays, 3);
  assert.match(result.assessment, new RegExp(`3개에서 ${count}개`)); assert.match(result.primaryAction.body, /마지막 세트|다음 날/);
});

test("lowering load while doubling sets keeps both changes instead of calling it only a lighter decline", () => {
  const result = direct([...baseline(), ...phase("redistributed", ["2026-09-21", "2026-09-23", day], values(55, 6))]);
  assert.equal(result.facts.recentChange.kind, "redistributed"); assert.equal(result.primaryAction.kind, "consolidate-recent-expansion");
  assert.match(result.assessment, /중량을 낮추고 세트를 늘린/); assert.equal(proposed(result.primaryAction), false);
});

test("later full reproductions with a controlled tail restore an optional progression after expansion rather than suppressing it forever", () => {
  const records = [...expanded(6), record("continued", "2026-09-28", values(80, 6))], result = direct(records);
  assert.equal(result.facts.recentChange.spanDays, 7); assert.equal(result.primaryAction.kind, "progression-option");
  assert.equal(result.primaryAction.proposal.baseReps, 8); assert.equal(result.primaryAction.proposal.targetReps, 9);
  assert.match(result.assessment, /80kg.*여러 날|늘린 전체 구성/);
});

test("a stable but steeply falling expanded tail is not treated as fully controlled adaptation merely because a week elapsed", () => {
  const expandedValues = [[80, 8], [80, 8], [80, 8], [80, 6], [80, 5], [80, 4]];
  const records = [...baseline(), ...phase("expanded", ["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28"], expandedValues)], result = direct(records);
  assert.equal(result.primaryAction.kind, "consolidate-recent-expansion"); assert.equal(proposed(result.primaryAction), false);
});

test("current strong fatigue still holds recently expanded work after enough recorded days", () => {
  const records = [...expanded(6), record("continued", "2026-09-28", values(80, 6))], result = direct(records, { readiness: { strong: true } });
  assert.equal(result.primaryAction.kind, "consolidate-recent-expansion"); assert.equal(proposed(result.primaryAction), false);
});

test("a lowered baseline can be rebuilt gradually after continued controlled recorded exposures without demanding the old load first", () => {
  const records = [...decreased(), ...phase("continued", ["2026-09-28", "2026-09-30", "2026-10-02", "2026-10-06"], values(55, 2))], result = direct(records);
  assert.equal(result.primaryAction.kind, "progression-option"); assert.equal(result.facts.recentChange.kind, "reduced");
  assert.equal(result.primaryAction.proposal.loadKg, 55); assert.equal(result.primaryAction.proposal.targetReps, 9);
  assert.match(result.assessment, /예전 구성과 차이.*차근차근/); assert.equal(result.facts.recentChange.baseline.maxLoadKg, 80);
});

test("a good large load increase remembers the earlier routine while recognizing three complete new performances", () => {
  const result = direct([...baseline(), ...phase("higher", ["2026-09-14", "2026-09-16", "2026-09-18"], values(95))]);
  assert.equal(result.facts.recentChange.kind, "raised-load"); assert.equal(result.primaryAction.kind, "progression-option");
  assert.match(result.assessment, /80kg.*95kg.*3일/); assert.match(result.assessment, /뒤 세트까지 이어낸/);
  assert.equal(result.primaryAction.proposal.loadKg, 95); assert.equal(result.primaryAction.proposal.targetReps, 9);
  assert.doesNotMatch(result.assessment, /근성장률|근력.*확정|회복.*완료/);
});

test("a single old heavier observation cannot be relabelled an established ordinary-work baseline", () => {
  const result = direct([record("spike", "2026-09-07", values(100)), ...phase("current", ["2026-09-21", "2026-09-23", day], values(55, 2))]);
  assert.equal(Object.hasOwn(result.facts, "recentChange"), false); assert.equal(result.primaryAction.kind, "progression-option");
});

test("nonregular, painful, conflicting and different-equipment history cannot become an episode baseline", () => {
  const variations = [{ trainingIntent: "test" }, { pain: "mild" }, { source: { kind: "legacy-ocr", hash: null } }];
  for (const extra of variations) {
    const records = [...phase("old", ["2026-09-07", "2026-09-09", "2026-09-11"], values(100), extra),
      ...phase("current", ["2026-09-21", "2026-09-23", day], values(55, 2))];
    assert.equal(Object.hasOwn(direct(records).facts, "recentChange"), false);
  }
  for (const extra of [{ ruleConflict: true }, { equipmentKey: "other-rack" }]) {
    const records = [...baseline(), ...phase("current", ["2026-09-21", "2026-09-23", day], values(55, 2))];
    for (const old of records.slice(0, 3)) Object.assign(old.exercises[0], extra);
    assert.equal(Object.hasOwn(direct(records).facts, "recentChange"), false);
  }
});

test("unrecorded calendar time cannot supply new controlled repetitions or return progression after a recent reduction", () => {
  const records = decreased(), before = structuredClone(records), result = review(records);
  const later = T.coachSession(T.analyze(records, { date: "2026-10-06", profile, includeCapacityHistory: true }), { profile });
  assert.equal(decision(result).primaryAction.kind, "review-recent-reduction");
  assert.equal(decision(later).primaryAction.kind, "review-recent-reduction");
  assert.equal(decision(later).facts.recentChange.spanDays, 4); assert.deepEqual(records, before);
});

test("episode interpretation reaches the real coaching action and purpose question without modifying the original numeric record", () => {
  const records = decreased(), before = structuredClone(records), result = review(records), value = decision(result);
  assert.equal(value.primaryAction.kind, "review-recent-reduction"); assert.equal(result.rows[0].interpretation.nextAction.kind, value.primaryAction.kind);
  assert.equal(value.question.topic, "load-change"); assert.match(value.question.title, /최근 낮춘/);
  assert.deepEqual(value.facts.current.sets.map(set => [set.loadKg, set.reps]), values(55, 2));
  assert.deepEqual(records, before);
});

test("a source-bound answer can explain a repeated reduced episode without deleting its original established history", () => {
  for (const [answer, kind] of [["planned", "maintain-intended-work"], ["unexpected", "recheck-unexpected-work"]]) {
    const records = decreased(), current = records.at(-1).exercises[0];
    current.coachingAnswer = Store.createCoachingAnswer(current, "load-change", answer);
    const before = structuredClone(records), value = decision(review(records));
    assert.equal(value.primaryAction.kind, kind); assert.equal(value.userAnswer.answer, answer); assert.equal(proposed(value.primaryAction), false);
    assert.equal(value.facts.recentChange.baseline.maxLoadKg, 80); assert.deepEqual(records, before);
  }
});

test("specific comfortable, hard and limit feedback adjusts the chosen set without erasing the recent episode", () => {
  for (const [feeling, kind] of [["comfortable", "reps-option"], ["hard", "repeat"], ["limit", "ease"]]) {
    const records = decreased(), current = records.at(-1).exercises[0];
    current.feedback = { setId: current.sets[1].id, loadKg: 55, reps: 8, feeling };
    const value = decision(review(records));
    assert.equal(value.primaryAction.kind, kind); assert.equal(value.facts.recentChange.kind, "reduced");
    if (feeling === "comfortable") assert.equal(value.primaryAction.proposal.setId, current.sets[1].id);
    else assert.equal(proposed(value.primaryAction), false);
  }
});

test("pain, clinical care, saved purpose and current illness retain final priority over episode progression", () => {
  const baseRecords = [...baseline(), ...phase("higher", ["2026-09-21", "2026-09-23", day], values(95))];
  const cases = [{ current: { pain: "mild" }, kind: "individual-care" }, { profile: { healthContext: "clinical" }, kind: "individual-care" },
    { current: { trainingIntent: "deload" }, kind: "deload" }, { checkins: { [day]: { illness: "active" } }, kind: "maintain-recovery-work" }];
  for (const entry of cases) {
    const records = structuredClone(baseRecords); Object.assign(records.at(-1), entry.current);
    const value = decision(review(records, entry));
    assert.equal(value.primaryAction.kind, entry.kind); assert.equal(proposed(value.primaryAction), false);
  }
});

test("time-only mobility and treadmill records do not claim completed sets in the whole-session summary", () => {
  for (const exerciseId of ["foam_rolling", "back_stretch", "treadmill"]) {
    const current = record("timed", day, []); current.exercises = [block("timed-block", [], { rawName: exerciseId, exerciseId, durationMinutes: 15 })];
    const result = review([current]);
    assert.equal(result.session.workingSets, 0); assert.match(result.sessionCoaching.summary, /시간|동작/);
    assert.doesNotMatch(result.sessionCoaching.summary, /해낸 세트|수행한 세트/);
  }
});

test("an external-rotation control action is not contradicted by whole-session instructions to increase work", () => {
  const records = phase("rotation", ["2026-09-21", "2026-09-23", day], [[3, 8], [3, 8], [3, 7]]);
  for (const record of records) Object.assign(record.exercises[0], { exerciseId: "external_rotation", rawName: "밴드 외회전", equipmentKey: "band" });
  const result = review(records);
  assert.equal(decision(result).primaryAction.kind, "technique-control"); assert.match(result.sessionCoaching.summary, /제어/);
  assert.doesNotMatch(result.sessionCoaching.summary, /작은 변화|증량|다른 종목|겹치는 운동/);
});

test("a single-exercise summary does not fabricate other exercises or overlap coordination", () => {
  const result = review(baseline());
  assert.equal(result.rows.length, 1); assert.equal(decision(result).primaryAction.kind, "progression-option");
  assert.doesNotMatch(result.sessionCoaching.summary + result.sessionCoaching.coordination.summary, /다른 종목|겹치는 운동끼리|겹치는 운동의/);
});
