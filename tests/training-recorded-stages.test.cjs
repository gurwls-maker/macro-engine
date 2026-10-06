"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const C = require("../src/training-coaching.js");

const dates = ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14", "2026-09-16", "2026-09-18",
  "2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02"];
const profile = { age: 30, healthContext: "general", goal: "performance", trainingYears: 2 };
function record(i, kg, repetitions) {
  return { id: "stage-session-" + i, date: dates[i], label: "합성 훈련", source: { kind: "manual" }, exercises: [{
    id: "stage-block-" + i, rawName: "바벨 오버헤드 프레스", exerciseId: "overhead_press", equipmentKey: "합성 바벨",
    loadConvention: "total", loadRole: "external", sets: repetitions.map((reps, j) => ({
      id: `stage-set-${i}-${j}`, loadKg: kg, reps, rir: null, marker: null
    }))
  }] };
}
function month() {
  return dates.map((_, i) => record(i, i < 6 ? 40 : 42.5, i < 3 ? [8, 8, 8] : i < 6 ? [9, 9, 9] : i < 9 ? [8, 8, 8] : [8, 8, 7]));
}
function sample(row) {
  return { ...row.exercises[0], date: row.date, sessionId: row.id, blockId: row.exercises[0].id,
    trainingIntent: row.trainingIntent, pain: row.pain, sourceKind: row.source.kind };
}
function direct(records) {
  const values = records.map(sample), before = JSON.stringify(records);
  const result = C.interpret({ current: values.at(-1), previous: values.at(-2), history: values.slice(0, -1), loadedMovement: true, profile });
  assert.equal(JSON.stringify(records), before);
  return result;
}
function review(records, options = {}) {
  const date = options.date || records.at(-1).date, selectedProfile = { ...profile, ...options.profile }, before = JSON.stringify(records);
  const result = T.coachSession(T.analyze(records, { date, profile: selectedProfile, checkins: options.checkins, includeCapacityHistory: true }), { profile: selectedProfile, ...options });
  assert.equal(JSON.stringify(records), before);
  return result.rows[0].interpretation.coaching;
}

test("gradual repeated work stages retain actual dates, complete set vectors and every stage source", () => {
  const records = month(), result = direct(records), stages = result.facts.recordedWorkStages;
  assert.equal(result.facts.recentChange, undefined);
  assert.equal(stages.scope, "same-exercise-equipment-42-days");
  assert.equal(stages.stageCount, 4); assert.equal(stages.retainedStageCount, 4); assert.equal(stages.sampled, false);
  assert.equal(stages.from, dates[0]); assert.equal(stages.to, dates.at(-1));
  assert.deepEqual(stages.stages.map(stage => stage.dates), [dates.slice(0, 3), dates.slice(3, 6), dates.slice(6, 9), dates.slice(9)]);
  assert.deepEqual(stages.stages.map(stage => stage.work.sets.map(set => [set.loadKg, set.reps])),
    [[[40, 8], [40, 8], [40, 8]], [[40, 9], [40, 9], [40, 9]], [[42.5, 8], [42.5, 8], [42.5, 8]], [[42.5, 8], [42.5, 8], [42.5, 7]]]);
  assert.deepEqual(stages.stages.flatMap(stage => stage.sourceRefs.map(ref => ref.sessionId)), records.map(row => row.id));
  for (const stage of stages.stages) assert.equal(stage.work.source.date, stage.dates.at(-1));
});

test("a repeatedly lower tail is a source-bound repetition recovery choice, not a fresh load increase", () => {
  const result = direct(month()), signal = result.signals.find(signal => signal.kind === "repeated-tail-below-recorded-work");
  assert.match(result.assessment, /40kg에서 반복을 더 이어간 뒤 42\.5kg으로 부하를 올렸/);
  assert.match(result.assessment, /2026-09-21~2026-09-25.*42\.5kg × 8·8·8회/);
  assert.match(result.assessment, /8회에서 7회로 바뀐 뒤 세트/);
  assert.equal(result.primaryAction.kind, "progression-option");
  assert.deepEqual(result.primaryAction.proposal, { kind: "single-set-reps", setId: "stage-set-11-2", loadKg: 42.5, baseReps: 7, targetReps: 8 });
  assert.deepEqual(signal.lowerSetIds, ["stage-set-11-2"]);
  assert.deepEqual(signal.previousSetIds, ["stage-set-8-2"]);
  assert.equal(new Set(signal.sourceRefs.map(ref => ref.sessionId)).size, 10);
  assert.match(result.primaryAction.body, /충분히 쉬어/);
  assert.doesNotMatch(result.primaryAction.body, /작은 단계로|최소 증량|40kg.*돌아|9회를/);
});

test("the final engine preserves the same current last-set proposal and the previous repeated work source", () => {
  const result = review(month());
  assert.deepEqual(result.primaryAction.focusSetIds, ["stage-set-11-2"]);
  assert.equal(result.primaryAction.proposal.targetReps, 8);
  assert.equal(result.facts.recordedWorkStages.stages[2].work.source.sessionId, "stage-session-8");
  assert.doesNotMatch(result.assessment, /근력.*저하|근성장|생리학.*확정|피로.*원인/);
});

test("an improved peer tail stays at its actual value while the lower tail is selected separately", () => {
  const records = month();
  for (const row of records.slice(9)) row.exercises[0].sets[1].reps = 9;
  const result = direct(records);
  assert.equal(result.facts.current.totalReps, 24);
  assert.match(result.assessment, /8·9·7회/);
  assert.deepEqual(result.primaryAction.focusSetIds, ["stage-set-11-2"]);
  assert.equal(result.primaryAction.proposal.targetReps, 8);
  assert.match(result.primaryAction.body, /잘 이어간 구간은 이번 구성에/);
});

test("adding or removing warmups does not misalign actual ordinary-set reference IDs", () => {
  const records = month();
  for (const row of records.slice(9)) row.exercises[0].sets.unshift({ id: row.id + "-W", loadKg: 20, reps: 5, marker: "W", rir: null });
  const result = direct(records), signal = result.signals.find(signal => signal.kind === "repeated-tail-below-recorded-work");
  assert.deepEqual(signal.lowerSetIds, ["stage-set-11-2"]);
  assert.deepEqual(signal.previousSetIds, ["stage-set-8-2"]);
  assert.equal(result.primaryAction.proposal.setId, "stage-set-11-2");
  assert.equal(result.facts.current.warmupSets[0].id, "stage-session-11-W");
});

test("explicit comfortable or hard feedback keeps its selected set above the remembered tail context", () => {
  for (const [feeling, selected, targetReps] of [["comfortable", 0, 9], ["comfortable", 2, 8], ["hard", 2, null]]) {
    const records = month(), current = records.at(-1).exercises[0], selectedSet = current.sets[selected];
    current.feedback = { setId: selectedSet.id, loadKg: selectedSet.loadKg, reps: selectedSet.reps, feeling };
    const result = review(records);
    assert.equal(result.primaryAction.focusSetIds[0], selectedSet.id);
    assert.equal(result.primaryAction.proposal?.targetReps ?? null, targetReps);
    assert.equal(result.facts.recordedWorkStages.stageCount, 4);
    if (feeling === "hard") assert.match(result.primaryAction.body, /힘들었다/);
  }
});

test("RIR zero, clinical care, actual pain and current illness do not expose the remembered increase as today's action", () => {
  for (const variant of ["rir", "clinical", "pain", "illness"]) {
    const records = month(), date = records.at(-1).date, options = {};
    if (variant === "rir") records.at(-1).exercises[0].sets[2].rir = 0;
    if (variant === "clinical") options.profile = { age: 17 };
    if (variant === "pain") records.at(-1).pain = "stop";
    if (variant === "illness") options.checkins = { [date]: { illness: "active", energy: "okay", sleep: "okay", performance: "steady" } };
    const result = review(records, options);
    assert.equal(result.primaryAction.proposal, undefined, variant);
    assert.notEqual(result.primaryAction.kind, "progression-option", variant);
    assert.equal(result.facts.recordedWorkStages.stageCount, 4);
  }
});

test("an exact linked repetition plan keeps outside sets as the primary review without forcing tail recovery", () => {
  const records = month(), current = records.at(-1), date = current.date;
  const result = review(records, { planning: { schedule: [{ id: "stage-plan", date, recordId: current.id, status: "performed", prescription: {
    exercises: [{ exerciseId: "overhead_press", equipmentKey: "합성 바벨", sets: 3, repsMin: 6, repsMax: 7 }]
  } }] } });
  assert.equal(result.primaryAction.kind, "plan-check");
  assert.deepEqual(result.primaryAction.focusSetIds, ["stage-set-11-0", "stage-set-11-1"]);
  assert.equal(result.primaryAction.proposal, undefined);
  assert.equal(result.facts.recordedWorkStages.stages[2].work.source.date, "2026-09-25");
});

test("deload purpose and legacy verification do not become ordinary repeated-stage progression", () => {
  for (const variant of ["deload", "legacy-ocr"]) {
    const records = month();
    if (variant === "deload") records.at(-1).trainingIntent = "deload";
    else records.at(-1).source.kind = "legacy-ocr";
    const result = review(records);
    assert.equal(result.primaryAction.proposal, undefined);
    assert.equal(result.facts.recordedWorkStages, undefined);
  }
});

test("different equipment, ambiguous current blocks and incomplete actual repetitions cannot borrow a repeated baseline", () => {
  for (const variant of ["equipment", "ambiguous", "incomplete"]) {
    const records = month();
    if (variant === "equipment") for (const row of records.slice(9)) row.exercises[0].equipmentKey = "다른 합성 바벨";
    if (variant === "ambiguous") records.at(-1).exercises.push({ ...structuredClone(records.at(-1).exercises[0]), id: "second-current-block",
      sets: records.at(-1).exercises[0].sets.map(set => ({ ...set, id: set.id + "-second" })) });
    if (variant === "incomplete") records.at(-1).exercises[0].sets[2].reps = null;
    const result = review(records);
    assert.equal(result.facts.recordedWorkStages, undefined, variant);
    assert.ok(!result.signals.some(signal => signal.kind === "repeated-tail-below-recorded-work"), variant);
  }
});

test("selected historical stages stop at their actual date instead of absorbing future tail records", () => {
  const result = review(month(), { date: "2026-09-25" });
  assert.equal(result.facts.recordedWorkStages.to, "2026-09-25");
  assert.equal(result.facts.recordedWorkStages.stageCount, 3);
  assert.ok(result.facts.recordedWorkStages.stages.every(stage => stage.dates.every(date => date <= "2026-09-25")));
  assert.ok(!result.signals.some(signal => signal.kind === "repeated-tail-below-recorded-work"));
});

test("bounded stage memory explicitly labels older omitted stages while retaining current exact IDs", () => {
  const records = Array.from({ length: 18 }, (_, i) => {
    const row = record(i % dates.length, 40, [8 + Math.floor(i / 2), 8 + Math.floor(i / 2), 8 + Math.floor(i / 2)]);
    row.id = "bounded-session-" + i; row.exercises[0].id = "bounded-block-" + i;
    row.exercises[0].sets.forEach((set, j) => { set.id = `bounded-set-${i}-${j}`; });
    row.date = `2026-09-${String(7 + i).padStart(2, "0")}`;
    return row;
  });
  const result = direct(records), memory = result.facts.recordedWorkStages;
  assert.equal(memory.stageCount, 9); assert.equal(memory.retainedStageCount, 6); assert.equal(memory.sampled, true);
  assert.equal(memory.from, "2026-09-13"); assert.equal(memory.to, "2026-09-24");
  assert.equal(memory.stages.at(-1).work.source.sessionId, "bounded-session-17");
  assert.deepEqual(memory.stages.at(-1).work.source.setIds, ["bounded-set-17-0", "bounded-set-17-1", "bounded-set-17-2"]);
});
