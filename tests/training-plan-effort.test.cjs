"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const Coaching = require("../src/training-coaching.js");

const date = "2026-10-06";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
function fixture(rirs = [1, 1, 1], options = {}) {
  const records = ["2026-09-22", "2026-09-29", date].map((day, i) => ({ id: `record-${i}`, date: day,
    label: "합성 Upper", pain: null, source: { kind: "manual" }, exercises: [{ id: `bench-${i}`,
      rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "합성 랙", loadConvention: "total", loadRole: "external",
      sets: rirs.map((rir, j) => ({ id: `set-${i}-${j}`, loadKg: 80, reps: 8, rir, marker: null })), ...(options.exercise || {}) }],
    ...(i === 2 ? options.record || {} : {}) }));
  const current = records.at(-1), block = current.exercises[0];
  const planned = { id: "target", exerciseId: "bench_press", equipmentKey: "합성 랙", loadConvention: "total",
    sets: 3, repsMin: 8, repsMax: 10, rir: 3, restSeconds: 180, loadKg: 80, ...(options.planned || {}) };
  const planning = { schedule: [{ id: "assignment", date, recordId: current.id, status: "performed",
    prescription: { exercises: [planned] }, ...(options.assignment || {}) }] };
  if (options.edit) options.edit({ records, current, block, planning, planned });
  const p = { ...profile, ...(options.profile || {}) }, checkins = options.checkin ? { [date]: { date, coachCheckin: options.checkin } } : {};
  const before = structuredClone({ records, planning, checkins });
  const analysis = T.analyze(records, { date, profile: p, checkins, includeCapacityHistory: true });
  const result = T.coachSession(analysis, { profile: p, planning });
  assert.deepEqual({ records, planning, checkins }, before);
  assert.deepEqual(result.session.exercises.map(row => row.sets.map(set => [set.id, set.loadKg, set.reps, set.rir, set.marker])),
    current.exercises.map(row => row.sets.map(set => [set.id, set.loadKg, set.reps, set.rir, set.marker])));
  return { result, row: result.rows.find(row => row.blockId === block.id), block, planned, analysis };
}
const action = sample => sample.row.interpretation.nextAction;
const coaching = sample => sample.row.interpretation.coaching;
const body = sample => [coaching(sample).assessment, action(sample).body,
  ...coaching(sample).supportingActions.map(value => value.body)].join(" ");

test("known actual reserve below the exact linked plan first restores the intended effort, not another repetition", () => {
  const sample = fixture(), c = coaching(sample);
  assert.equal(action(sample).kind, "plan-effort-check");
  assert.equal(action(sample).proposal, undefined);
  assert.deepEqual(action(sample).focusSetIds, sample.block.sets.map(set => set.id));
  assert.match(body(sample), /80kg × 8회 RIR 1.*RIR 3/);
  assert.match(action(sample).body, /부하를 낮추거나.*반복을 줄여.*계획도 다시 정/);
  assert.doesNotMatch(body(sample), /9회를 시도|이제 한 세트에서 작은 변화|피로.*확정|능력.*손실|\d+kg으로 낮추/);
  assert.deepEqual(c.planEffort.source, { assignmentId: "assignment", date, recordId: "record-2", targetId: "target" });
  assert.equal(c.planEffort.targetRir, 3);
  assert.ok(c.planEffort.belowSets.every(set => set.rir === 1));
  assert.ok(sample.row.interpretation.performance.model.current.rirApplied);
  assert.deepEqual(c.facts.current.sets.map(set => set.rir), [1, 1, 1]);
});

test("actual reserve descriptions use a stable noun before the particle for every numeric ending", () => {
  for (const rir of [0, 1, 2]) {
    const sample = fixture([rir, rir, rir]), c = coaching(sample);
    assert.match(body(sample), new RegExp(`RIR ${rir} 기록에서는 정한 RIR 3보다 여유가 적었으니`));
    assert.doesNotMatch(body(sample), /RIR \d+(?:는|은)/);
    assert.equal(action(sample).kind, rir === 0 ? "ease" : "plan-effort-check");
    assert.equal(c.planEffort.targetRir, 3);
    assert.deepEqual(c.facts.current.sets.map(set => set.rir), [rir, rir, rir]);
    if (rir > 0) assert.match(action(sample).body, new RegExp(`RIR ${rir} 기록에서는 계획한 RIR 3보다 여유가 적었어요`));
  }
});

test("a different sufficient-reserve set keeps its conditional progression while the harder tail gets its own action", () => {
  const sample = fixture([4, 1, 4]);
  assert.equal(action(sample).kind, "progression-option");
  assert.equal(action(sample).proposal.setId, sample.block.sets[0].id);
  assert.equal(action(sample).proposal.targetReps, 9);
  assert.match(action(sample).body, /RIR 3.*때만 다음 변화를/);
  const support = coaching(sample).supportingActions.find(value => value.kind === "plan-effort-check");
  assert.ok(support); assert.deepEqual(support.focusSetIds, [sample.block.sets[1].id]);
  assert.match(support.body, /RIR 1.*여유가 적었어요/);
});

test("unknown RIR remains unknown and does not stop a usable, plan-conditioned trial", () => {
  const sample = fixture([null, null, null]);
  assert.equal(action(sample).kind, "progression-option");
  assert.equal(action(sample).proposal.targetReps, 9);
  assert.match(action(sample).body, /RIR 3.*여유를 남길 수 있을 때만/);
  assert.deepEqual(coaching(sample).planEffort.unknownSetIds, sample.block.sets.map(set => set.id));
  assert.deepEqual(coaching(sample).planEffort.belowSets, []);
  assert.doesNotMatch(body(sample), /여유가 적었|RIR 0|실패|입력.*먼저/);
});

test("a separate exercise keeps its own progression instead of inheriting another exercise's plan deficit", () => {
  const sample = fixture([1, 1, 1], { edit({ records }) {
    for (const record of records) record.exercises.push({ id: `row-${record.id}`, rawName: "시티드 케이블 로우",
      exerciseId: "seated_cable_row", equipmentKey: "합성 로우", loadConvention: "total", loadRole: "external",
      sets: [{ id: `row-set-${record.id}`, loadKg: 50, reps: 10, rir: 4, marker: null }] });
  } });
  assert.equal(action(sample).kind, "plan-effort-check");
  const row = sample.result.rows.find(value => value.blockId === "row-record-2");
  assert.equal(row.interpretation.nextAction.kind, "progression-option");
  assert.equal(row.interpretation.nextAction.proposal.targetReps, 11);
  assert.equal(row.interpretation.coaching.planEffort, undefined);
});

test("a comfortable extra set progresses independently without borrowing the counted sets' target reserve", () => {
  const sample = fixture([1, 4], { planned: { sets: 1 }, edit({ records, block }) {
    for (const record of records) record.exercises[0].sets[1].reps = 10;
    const extra = block.sets[1]; block.feedback = { setId: extra.id, loadKg: extra.loadKg, reps: extra.reps, feeling: "comfortable" };
  } });
  assert.equal(action(sample).kind, "reps-option");
  assert.equal(action(sample).proposal.setId, sample.block.sets[1].id);
  assert.equal(action(sample).proposal.targetReps, 11);
  assert.doesNotMatch(action(sample).body, /계획한 RIR 3/);
  assert.deepEqual(coaching(sample).planEffort.matchedSets.map(set => set.id), [sample.block.sets[0].id]);
  assert.deepEqual(coaching(sample).supportingActions.find(value => value.kind === "plan-effort-check").focusSetIds,
    [sample.block.sets[0].id]);
});

test("a qualitative comfortable response cannot erase the same set's explicitly lower reported reserve", () => {
  const sample = fixture([1, 1, 1], { edit({ block }) { const set = block.sets[0];
    block.feedback = { setId: set.id, loadKg: set.loadKg, reps: set.reps, feeling: "comfortable" }; } });
  assert.equal(action(sample).kind, "plan-effort-check");
  assert.equal(action(sample).proposal, undefined);
  assert.equal(sample.block.feedback.feeling, "comfortable");
});

test("a planned easier tail cannot retain a supporting instruction to add a repetition", () => {
  const sample = fixture([4, 4, 1], { planned: { loadKg: null }, edit({ records }) {
    for (const record of records) {
      const sets = record.exercises[0].sets;
      sets[0].loadKg = 100; sets[0].reps = 4;
      sets[1].reps = 8; sets[2].reps = record.date === date ? 7 : 8;
    }
  } });
  const deficitId = sample.block.sets[2].id, c = coaching(sample);
  assert.equal(action(sample).proposal, undefined);
  assert.ok(c.supportingActions.some(value => value.kind === "plan-effort-check" && value.focusSetIds.includes(deficitId)));
  for (const value of c.supportingActions.filter(value => value.focusSetIds.includes(deficitId))) {
    assert.doesNotMatch(value.body, /1회 더|8회를 시도|반복을 되찾/);
  }
  assert.doesNotMatch(body(sample), /피로가 누적|근력.*저하|계획.*자동.*변경/);
});

test("actual zero reserve stays stronger than the plan effort comparison", () => {
  const sample = fixture([0, 1, 1]);
  assert.equal(action(sample).kind, "ease");
  assert.match(action(sample).body, /RIR 0/);
  assert.equal(action(sample).proposal, undefined);
});

for (const [name, options] of [
  ["different equipment", { planned: { equipmentKey: "다른 랙" } }],
  ["different convention", { exercise: { loadConvention: "per-side" } }],
  ["different actual load", { planned: { loadKg: 70 } }],
  ["unconfirmed load-specific equipment", { planned: { equipmentKey: null } }],
  ["load-specific assistance role", { exercise: { loadRole: "assistance" } }],
  ["different selected date", { assignment: { date: "2026-10-05" } }],
  ["different actual record", { assignment: { recordId: "record-1" } }],
  ["unperformed plan", { assignment: { status: "planned" } }]
]) test(`${name} does not spread a prescribed reserve into another actual context`, () => {
  const sample = fixture([1, 1, 1], options);
  assert.equal(coaching(sample).planEffort, undefined);
  assert.notEqual(action(sample).kind, "plan-effort-check");
  assert.doesNotMatch(body(sample), /계획한 RIR 3|정한 RIR 3/);
});

test("multiple indistinguishable actual blocks and multiple targets do not arbitrarily receive one plan", () => {
  for (const duplicate of ["actual", "target"]) {
    const sample = fixture([1, 1, 1], { edit({ current, planned, planning }) {
      if (duplicate === "actual") { const copy = structuredClone(current.exercises[0]); copy.id = "other-block";
        copy.sets.forEach(set => { set.id += "-other"; }); current.exercises.push(copy); }
      else planning.schedule[0].prescription.exercises.push({ ...planned, id: "other-target" });
    } });
    assert.ok(sample.result.rows.every(row => row.interpretation.coaching.planEffort === undefined));
  }
});

test("ordinary reserve goals may apply without a fixed kg and never fabricate an exact easier load", () => {
  for (const loadRole of ["external", "assistance"]) {
    const sample = fixture([1, 1, 1], { planned: { loadKg: null }, exercise: { loadRole } });
    assert.equal(action(sample).kind, "plan-effort-check");
    assert.match(action(sample).body, loadRole === "assistance" ? /보조를 더 받거나/ : /부하를 낮추거나/);
    assert.doesNotMatch(action(sample).body, /\d+kg으로|\d+회로 줄여/);
  }
});

test("a known reserve goal can apply to actual bodyweight work without constructing a kilogram reduction", () => {
  const sample = fixture([1, 1, 1], { planned: { exerciseId: "push_up", equipmentKey: null, loadConvention: "bodyweight", loadKg: null },
    exercise: { rawName: "푸시업", exerciseId: "push_up", equipmentKey: null, loadConvention: "bodyweight", loadRole: "external" },
    edit({ records }) { for (const record of records) for (const set of record.exercises[0].sets) set.loadKg = null; } });
  assert.equal(action(sample).kind, "plan-effort-check");
  assert.match(action(sample).body, /더 제어하기 쉬운 조건/);
  assert.doesNotMatch(action(sample).body, /kg|부하를 낮추/);
});

test("a program-template exclusion is not silently converted into a current medical restriction", () => {
  const sample = fixture([4, 4, 4], { edit({ planning }) {
    planning.preferences = { preferredExerciseIds: [], excludedExerciseIds: ["bench_press"] };
  } });
  assert.equal(action(sample).kind, "progression-option");
  assert.doesNotMatch(body(sample), /의료진|금지|제외.*진단/);
  const draft = T.recommendProgram({ ...profile, sport: "strength" },
    { daysPerWeek: 3, sessionMinutes: 60, equipment: "gym", priorityMuscles: [] },
    null, { preferredExerciseIds: [], excludedExerciseIds: ["bench_press"] });
  assert.ok(draft.days.every(day => day.exercises.every(value => value.exerciseId !== "bench_press")));
});

test("pain, illness, clinical scope and special purposes stay above a plan reserve mismatch", () => {
  for (const options of [{ record: { pain: "stop" } }, { record: { pain: "mild" } },
    { checkin: { illness: "active" } }, { checkin: { illness: "recovering" } },
    { profile: { healthContext: "clinical" } }, ...["deload", "light", "technique", "return", "test", "time-limited"].map(trainingIntent => ({ record: { trainingIntent } }))]) {
    const sample = fixture([1, 1, 1], options);
    assert.notEqual(action(sample).kind, "plan-effort-check");
    assert.equal(action(sample).proposal, undefined);
    assert.ok(coaching(sample).supportingActions.every(value => value.kind !== "plan-effort-check"));
  }
});

test("the pure plan comparison excludes preparation, marked, unknown and unmatched loads without mutating source", () => {
  const exercise = { exerciseId: "bench_press", equipmentKey: "rack", equipmentSource: "record", loadConvention: "total", loadRole: "external",
    sets: [{ id: "w", marker: "W", loadKg: 80, reps: 8, rir: 0 }, { id: "a", marker: "A", loadKg: 80, reps: 8, rir: 0 },
      { id: "unknown", marker: null, loadKg: 80, reps: null, rir: 0 }, { id: "other", marker: null, loadKg: 70, reps: 8, rir: 1 },
      { id: "actual", marker: null, loadKg: 80, reps: 8, rir: 1 }, { id: "extra", marker: null, loadKg: 80, reps: 8, rir: 0 }] };
  const planned = { exerciseId: "bench_press", equipmentKey: "rack", loadConvention: "total", loadKg: 80, sets: 3, rir: 3, repsMin: 8, repsMax: 10 };
  const before = structuredClone({ exercise, planned });
  const result = Coaching.plannedEffort(exercise, planned);
  assert.deepEqual(result.belowSets.map(set => set.id), ["actual"]);
  assert.deepEqual({ exercise, planned }, before);
  for (const rir of [null, undefined, "3", -1, 11]) assert.equal(Coaching.plannedEffort(exercise, { ...planned, rir }), null);
  assert.equal(Coaching.plannedEffort({ ...exercise, equipmentSource: "name-prefix" }, planned), null);
  assert.equal(Coaching.plannedEffort({ ...exercise, ruleConflict: true }, planned), null);
});
