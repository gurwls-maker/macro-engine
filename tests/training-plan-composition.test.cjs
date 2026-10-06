"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const Store = require("../src/training-store.js");

const date = "2026-10-06";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
const block = (id, values) => ({ id, exerciseId: "bench_press", rawName: "바벨 벤치 프레스",
  equipmentKey: "합성 랙", loadConvention: "total", loadRole: "external",
  sets: values.map(([loadKg, reps, rir = null], i) => ({ id: `${id}-${i}`, loadKg, reps, rir, marker: null })) });
function fixture(values = [[90, 4], [80, 8], [80, 7]], extra = {}) {
  const records = ["2026-09-21", "2026-09-28", date].map((day, i) => ({ id: `record-${i}`, date: day,
    label: "합성 Upper", source: { kind: "manual" }, exercises: [block(`bench-${i}`, values)],
    ...(i === 2 ? extra.record : {}) }));
  const current = records.at(-1), exercise = current.exercises[0];
  if (extra.feedback) { const chosen = exercise.sets[extra.feedback.index];
    exercise.feedback = { setId: chosen.id, loadKg: chosen.loadKg, reps: chosen.reps, feeling: extra.feedback.feeling }; }
  if (extra.answer) exercise.coachingAnswer = Store.createCoachingAnswer(exercise, extra.answer.topic, extra.answer.value);
  const planning = { schedule: [{ id: "assignment", date, recordId: current.id, status: "performed",
    prescription: { exercises: [{ id: "target", exerciseId: "bench_press", equipmentKey: exercise.equipmentKey,
      loadConvention: "total", sets: extra.plannedSets || 3, repsMin: 6, repsMax: 10, rir: 2 }] } }] };
  const p = { ...profile, ...extra.profile }, before = structuredClone({ records, planning });
  const analysis = T.analyze(records, { date, profile: p, includeCapacityHistory: true,
    checkins: extra.checkin ? { [date]: { date, coachCheckin: extra.checkin } } : {} });
  const result = T.coachSession(analysis, { profile: p, planning: extra.noPlan ? undefined : planning });
  assert.deepEqual({ records, planning }, before);
  return { result, row: result.rows[0], current: exercise };
}
const coaching = sample => sample.row.interpretation.coaching;
const text = sample => [coaching(sample).assessment, coaching(sample).primaryAction.body,
  ...coaching(sample).supportingActions.map(action => action.body)].join(" ");

test("plan review targets the actual outside set while preserving the two compliant backoff sets", () => {
  const sample = fixture(), c = coaching(sample), ids = sample.current.sets.map(set => set.id);
  assert.equal(c.primaryAction.kind, "plan-check");
  assert.deepEqual(c.primaryAction.focusSetIds, [ids[0]]);
  assert.equal(c.primaryAction.proposal, undefined);
  const preserved = c.supportingActions.find(action => action.kind === "preserve-plan-work");
  assert.ok(preserved); assert.deepEqual(preserved.focusSetIds, ids.slice(1));
  assert.match(preserved.body, /80kg × 8회.*80kg × 7회/);
  assert.doesNotMatch(preserved.body, /90kg/);
  assert.match(c.assessment, /전체 일반 세트 구성을.*3일/);
  assert.match(c.assessment, /90kg × 4회.*6~10회/);
  assert.doesNotMatch(c.assessment, /이제 한 세트에서 작은 변화를 시험/);
  assert.deepEqual(c.facts.current.sets.map(set => [set.id, set.loadKg, set.reps]),
    sample.current.sets.map(set => [set.id, set.loadKg, set.reps]));
});

test("below and above plan sets are both reviewed instead of focusing on a comfortable compliant set", () => {
  const sample = fixture([[90, 4], [80, 12], [70, 8]], { feedback: { index: 2, feeling: "comfortable" } }),
    c = coaching(sample), ids = sample.current.sets.map(set => set.id);
  assert.equal(c.primaryAction.kind, "plan-check");
  assert.deepEqual(c.primaryAction.focusSetIds, ids.slice(0, 2));
  assert.match(c.primaryAction.body, /90kg × 4회.*80kg × 12회/);
  assert.deepEqual(c.supportingActions.find(action => action.kind === "preserve-plan-work").focusSetIds, [ids[2]]);
  assert.equal(c.primaryAction.proposal, undefined);
  assert.doesNotMatch(text(sample), /9회를 시도|13회를 시도/);
});

test("plan-counted work and extra actual sets keep separate identities", () => {
  const sample = fixture([[90, 4], [80, 8], [70, 15]], { plannedSets: 2 }), c = coaching(sample),
    ids = sample.current.sets.map(set => set.id);
  assert.deepEqual(c.primaryAction.focusSetIds, [ids[0]]);
  assert.deepEqual(c.supportingActions.find(action => action.kind === "preserve-plan-work").focusSetIds, [ids[1]]);
  const extra = c.supportingActions.find(action => action.kind === "keep-extra-work-separate");
  assert.ok(extra); assert.deepEqual(extra.focusSetIds, [ids[2]]);
  assert.match(extra.body, /70kg × 15회.*임의로 적용하지/);
  assert.doesNotMatch(c.primaryAction.body, /70kg × 15회/);
});

test("an above-range first set does not retain the old last-set progression focus", () => {
  const sample = fixture([[80, 12], [80, 8], [80, 7]]), c = coaching(sample);
  assert.equal(c.primaryAction.kind, "plan-check");
  assert.deepEqual(c.primaryAction.focusSetIds, [sample.current.sets[0].id]);
  assert.doesNotMatch(c.assessment, /이제 한 세트에서 작은 변화를 시험/);
  assert.ok(c.supportingActions.every(action => !action.focusSetIds.includes(sample.current.sets[0].id)));
});

test("a limit response and actual zero RIR stay stronger than plan review or stable progress", () => {
  for (const entry of [{ feedback: { index: 2, feeling: "limit" } }, { zeroRir: true }]) {
    const sample = fixture([[90, 4], [80, 8], [80, 7, entry.zeroRir ? 0 : null]], entry), c = coaching(sample);
    assert.equal(c.primaryAction.kind, "ease");
    assert.deepEqual(c.primaryAction.focusSetIds, [sample.current.sets[2].id]);
    assert.equal(c.primaryAction.proposal, undefined);
    assert.ok(c.supportingActions.every(action => !action.focusSetIds.includes(sample.current.sets[0].id)),
      "the plan-outside heavy set is not silently preserved by a different-set limit decision");
  }
});

test("clinical, pain, explicit purpose and legacy verification remain stronger than plan mismatch", () => {
  for (const entry of [{ profile: { healthContext: "clinical" }, expected: "individual-care" },
    { record: { pain: "stop" }, expected: "individual-care" },
    { record: { pain: "mild" }, expected: "individual-care" },
    { record: { trainingIntent: "deload" }, expected: "deload" },
    { record: { trainingIntent: "return" }, expected: "return" },
    { record: { source: { kind: "legacy-ocr" } }, expected: "verify-record" }]) {
    const sample = fixture(undefined, entry), c = coaching(sample);
    assert.equal(c.primaryAction.kind, entry.expected);
    assert.equal(c.primaryAction.proposal, undefined);
    assert.equal(c.supportingActions.length, 0);
    assert.ok(sample.row.interpretation.observations.some(line => /6~10회/.test(line)), "actual plan observation is not erased");
  }
});

test("active illness suppresses the plan task, while recovering illness preserves the exact plan review without progress", () => {
  for (const illness of ["active", "recovering"]) {
    const sample = fixture(undefined, { checkin: { illness } }), c = coaching(sample);
    assert.equal(c.primaryAction.kind, illness === "active" ? "maintain-recovery-work" : "plan-check");
    assert.equal(c.primaryAction.proposal, undefined);
    assert.doesNotMatch(c.assessment, /이제 한 세트에서 작은 변화를 시험/);
    if (illness === "active") assert.equal(c.supportingActions.length, 0);
    else { assert.deepEqual(c.primaryAction.focusSetIds, [sample.current.sets[0].id]); assert.match(c.primaryAction.body, /회복 중/); }
  }
});

test("without a linked plan a source-bound intended-work answer is still honored", () => {
  const values = [[80, 8], [80, 8], [80, 8]];
  const records = ["2026-09-21", "2026-09-28", date].map((day, i) => ({ id: `r-${i}`, date: day,
    label: "Upper", source: { kind: "manual" }, exercises: [block(`b-${i}`, i < 2 ? [[100, 8], [100, 8], [100, 8]] : values)] }));
  const current = records.at(-1).exercises[0]; current.coachingAnswer = Store.createCoachingAnswer(current, "load-change", "planned");
  const before = structuredClone(records), result = T.coachSession(T.analyze(records, { date, profile, includeCapacityHistory: true }), { profile });
  const c = result.rows[0].interpretation.coaching;
  assert.equal(c.primaryAction.kind, "maintain-intended-work");
  assert.match(c.assessment, /의도적으로/); assert.equal(c.primaryAction.proposal, undefined);
  assert.deepEqual(records, before); assert.equal(c.userAnswer.answer, "planned");
});

test("an unrelated or ambiguous assignment cannot create a plan-mismatch action", () => {
  const records = ["2026-09-21", "2026-09-28", date].map((day, i) => ({ id: `r-${i}`, date: day,
    source: { kind: "manual" }, exercises: [block(`b-${i}`, [[90, 4], [80, 8], [80, 7]])] }));
  const actual = records.at(-1), prescription = { exercises: [{ exerciseId: "bench_press", sets: 3, repsMin: 6, repsMax: 10 }] };
  for (const schedule of [[{ id: "wrong", date, recordId: "another-record", status: "performed", prescription }],
    [{ id: "planned", date, recordId: null, status: "planned", prescription }],
    ["a", "b"].map(id => ({ id, date, recordId: actual.id, status: "performed", prescription }))]) {
    const result = T.coachSession(T.analyze(records, { date, profile, includeCapacityHistory: true }), { profile, planning: { schedule } });
    assert.equal(result.rows[0].interpretation.nextAction.kind, "progression-option");
    assert.ok(!result.rows[0].interpretation.evidence.context.some(item => item.label === "연결한 계획"));
  }
});

function answeredPlan(currentValues, topic, answer, range = [6, 12], options = {}) {
  const previousValues = options.previousValues || [[60, 12], [60, 12], [60, 12], [75, 8]];
  const records = [{ id: "old", date: "2026-09-28", source: { kind: "manual" }, exercises: [block("old-block", previousValues)] },
    { id: "current", date, source: { kind: "manual" }, exercises: [block("current-block", currentValues)], ...(options.record || {}) }];
  const current = records[1].exercises[0]; current.coachingAnswer = Store.createCoachingAnswer(current, topic, answer);
  const planning = { schedule: [{ id: "answered-plan", date, recordId: "current", status: "performed", prescription: { exercises: [
    { exerciseId: "bench_press", equipmentKey: current.equipmentKey, sets: currentValues.length, repsMin: range[0], repsMax: range[1] }
  ] } }] }, before = structuredClone({ records, planning }), p = { ...profile, ...options.profile };
  const result = T.coachSession(T.analyze(records, { date, profile: p, includeCapacityHistory: true }), { profile: p, planning });
  assert.deepEqual({ records, planning }, before);
  return { result, row: result.rows[0], current };
}

test("a source-bound confirmed heavy repetition goal remains distinct from an older linked plan", () => {
  const sample = answeredPlan([[60, 12], [60, 12], [60, 12], [75, 5]], "rep-target", "planned"), c = coaching(sample);
  assert.equal(c.primaryAction.kind, "maintain-intended-work");
  assert.equal(c.primaryAction.proposal, undefined);
  assert.match(c.primaryAction.body, /75kg × 5회.*6~12회.*목표대로/);
  assert.match(c.primaryAction.body, /실패로 보거나.*억지로 채우지/);
  assert.equal(c.question.selectedAnswer, "planned"); assert.equal(c.userAnswer.topic, "rep-target");
  assert.ok(sample.row.interpretation.observations.some(line => /계획.*범위와 다른/.test(line)), "the saved plan discrepancy is still visible");
});

test("confirmation of the heavy target cannot authorize a different base segment outside its own planned range", () => {
  const sample = answeredPlan([[60, 15], [60, 15], [60, 15], [75, 5]], "rep-target", "planned", [6, 12],
    { previousValues: [[60, 15], [60, 15], [60, 15], [75, 8]] }), c = coaching(sample), ids = sample.current.sets.map(set => set.id);
  assert.equal(c.primaryAction.kind, "plan-check");
  assert.deepEqual(c.primaryAction.focusSetIds, ids.slice(0, 3));
  const intended = c.supportingActions.find(action => action.kind === "preserve-intended-target");
  assert.ok(intended); assert.deepEqual(intended.focusSetIds, [ids[3]]);
  assert.match(intended.body, /75kg × 5회.*목표대로/);
  assert.doesNotMatch(c.primaryAction.body, /75kg × 5회/);
  assert.equal(c.primaryAction.proposal, undefined);
});

test("a planned load reduction does not by itself confirm changing the linked repetition goal", () => {
  const sample = answeredPlan([[70, 6], [70, 6]], "load-change", "planned", [8, 10],
    { previousValues: [[100, 6], [100, 6], [100, 6]] }), c = coaching(sample);
  assert.equal(c.primaryAction.kind, "plan-check");
  assert.deepEqual(c.primaryAction.focusSetIds, sample.current.sets.map(set => set.id));
  assert.match(c.assessment, /의도적으로 중량을 낮춰/);
  assert.match(c.assessment, /8~10회/); assert.equal(c.primaryAction.proposal, undefined);
  assert.ok(!c.supportingActions.some(action => action.kind === "preserve-intended-target"));
});

test("an answer to an unrelated topic does not override a linked repetition target", () => {
  const sample = answeredPlan([[60, 12], [60, 12], [60, 12], [75, 5]], "load-change", "planned"), c = coaching(sample);
  assert.equal(c.primaryAction.kind, "plan-check"); assert.equal(c.question, null);
  assert.equal(c.userAnswer.topic, "load-change");
  assert.deepEqual(c.primaryAction.focusSetIds, [sample.current.sets[3].id]);
});

test("pain, clinical care and a saved deload purpose outrank even a confirmed heavy repetition target", () => {
  for (const entry of [{ record: { pain: "stop" }, expected: "individual-care" },
    { profile: { healthContext: "clinical" }, expected: "individual-care" }, { record: { trainingIntent: "deload" }, expected: "deload" }]) {
    const c = coaching(answeredPlan([[60, 12], [60, 12], [60, 12], [75, 5]], "rep-target", "planned", [6, 12], entry));
    assert.equal(c.primaryAction.kind, entry.expected); assert.equal(c.primaryAction.proposal, undefined);
    assert.equal(c.supportingActions.length, 0);
  }
});
