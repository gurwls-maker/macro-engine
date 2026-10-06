"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const date = "2026-10-06";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
const set = (id, loadKg, reps, marker = null) => ({ id, loadKg, reps, marker, rir: null });
function review(trainingIntent, work, timed = false) {
  const records = ["2026-09-22", "2026-09-29", date].map((day, i) => ({ id: `record-${i}`, date: day,
    label: "합성 운동", source: { kind: "manual" }, pain: null,
    ...(i === 2 ? { trainingIntent } : {}), exercises: [timed
      ? { id: `walk-${i}`, rawName: "트레드밀", exerciseId: "treadmill", durationMinutes: 15, sets: [] }
      : { id: `bench-${i}`, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "합성 랙",
        loadConvention: "total", loadRole: "external", sets: [set(`warm-${i}`, 20, 10, "W"),
          ...(i === 2 ? work : [[80, 8], [80, 8], [80, 8]]).map(([kg, reps], j) => set(`set-${i}-${j}`, kg, reps)),
          set(`marked-${i}`, 40, 12, "A")] }] }));
  const before = structuredClone(records);
  const analysis = T.analyze(records, { date, profile, includeCapacityHistory: true });
  const result = T.coachSession(analysis, { profile });
  assert.deepEqual(records, before);
  assert.equal(result.sessionCoaching.intent, trainingIntent);
  assert.equal(result.session.date, date);
  assert.deepEqual(result.session.exercises[0].sets.map(value => [value.id, value.loadKg, value.reps, value.marker, value.rir]),
    records.at(-1).exercises[0].sets.map(value => [value.id, value.loadKg, value.reps, value.marker, value.rir]));
  return { result, interpretation: result.rows[0].interpretation };
}

for (const [name, work] of [["unchanged whole work", [[80, 8], [80, 8], [80, 8]]],
  ["higher load without fewer sets", [[90, 6], [90, 6], [90, 6]]]]) {
  test(`a stated lighter or time-limited purpose does not invent a reduction in ${name}`, () => {
    for (const intent of ["deload", "light", "time-limited"]) {
      const { result, interpretation } = review(intent, work);
      assert.equal(interpretation.nextAction.kind, intent);
      assert.equal(interpretation.nextAction.proposal, undefined);
      assert.match(interpretation.nextAction.body, /목적을 남겼|날로 남겼/);
      assert.match(interpretation.nextAction.body, /못한 운동이 있어도/);
      assert.doesNotMatch(interpretation.nextAction.body, /이번 가벼운 기록|목적에 맞게 운동했|시간 때문에 줄인|빠진 볼륨|이번.*줄였|짧게 마쳤/);
      assert.deepEqual(interpretation.coaching.facts.current.sets.map(value => [value.loadKg, value.reps]), work);
      assert.equal(result.session.workingSets, 3);
      assert.equal(result.session.warmupSets, 1);
      assert.equal(result.session.markedSets, 1);
    }
  });
}

test("a test purpose does not claim the recorded load was a successful maximum", () => {
  const { interpretation } = review("test", [[80, 8], [80, 8], [80, 8]]);
  assert.equal(interpretation.nextAction.kind, "test");
  assert.match(interpretation.nextAction.body, /테스트에서 쓴 부하.*평소 수행/);
  assert.doesNotMatch(interpretation.nextAction.body, /테스트 최고 중량|최대.*성공|최고 기록.*달성/);
  assert.equal(interpretation.nextAction.proposal, undefined);
});

test("time-only purpose coaching keeps its real minutes without inventing shortened duration or strength sets", () => {
  for (const intent of ["deload", "light", "time-limited", "test"]) {
    const { result, interpretation } = review(intent, [], true);
    assert.equal(result.sessionCoaching.composition.blocks[0].durationMinutes, 15);
    assert.equal(interpretation.nextAction.kind, intent);
    assert.doesNotMatch(interpretation.nextAction.body, /시간 때문에 줄인|짧게 마친|일반 세트|연습 세트|빠진 볼륨|이번 가벼운 기록|0분/);
    assert.equal(interpretation.nextAction.proposal, undefined);
    assert.deepEqual(interpretation.coaching.facts.current.sets, []);
  }
});
