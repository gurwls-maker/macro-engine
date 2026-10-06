"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const date = "2026-10-06";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
const block = (id, extra = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press",
  equipmentKey: "합성 랙", loadConvention: "total", loadRole: "external",
  sets: [{ id: id + "-set", loadKg: 50, reps: 10, rir: null, marker: null }], ...extra });
const record = (id, day, extra = {}) => ({ id, date: day, label: "합성 Upper", source: { kind: "manual" },
  sequence: { order: "unknown", structure: "unknown" }, pain: null, exercises: [block(id + "-bench")], ...extra });
const records = () => [record("first", "2026-09-21"), record("second", "2026-09-28"), record("current", date)];
const good = { energy: "good", hunger: "okay", sleep: "good", performance: "up", fatigue: "usual", illness: "none" };
function analyze(actual, checkins, options = {}) {
  return T.analyze(actual, { date, profile, checkins, includeCapacityHistory: true, ...options });
}
function review(checkin, options = {}) {
  const actual = options.records || records();
  const analysis = analyze(actual, options.checkins || { [date]: { date, coachCheckin: checkin } }, options.analysis);
  return { actual, analysis, result: T.coachSession(analysis, { profile, ...(options.coach || {}) }) };
}
const primary = result => result.rows[0].interpretation.nextAction;
const coaching = result => result.rows[0].interpretation.coaching;
function assertHeld(result, actual) {
  const action = primary(result), decision = coaching(result);
  assert.equal(action.kind, "maintain-recovery-work");
  assert.equal(action.proposal, undefined);
  assert.equal(decision.primaryAction, action);
  assert.deepEqual(decision.facts.current.sets.map(set => [set.id, set.loadKg, set.reps]),
    actual.at(-1).exercises[0].sets.map(set => [set.id, set.loadKg, set.reps]));
  assert.equal(decision.progressionCandidate.kind, "progression-option");
  assert.deepEqual(decision.progressionCandidate.proposal, {
    kind: "single-set-reps", setId: "current-bench-set", loadKg: 50, baseReps: 10, targetReps: 11
  });
  assert.match(decision.progressionCandidate.body, /몸 상태가 돌아오고/);
  assert.doesNotMatch(action.body, /11회|1RM|과훈련|수면 부족 때문에|질병 때문에/);
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
}

test("current low energy, poor sleep and lower performance defer the real source-bound progression option", () => {
  const input = { energy: "low", hunger: "okay", sleep: "poor", performance: "down" };
  const before = structuredClone(input), sample = review(input);
  assert.equal(sample.analysis.recovery.status, "watch");
  assert.equal(sample.analysis.recovery.current.strong, true);
  assertHeld(sample.result, sample.actual);
  assert.match(primary(sample.result).body, /50kg × 10회.*평소처럼 제어/);
  assert.doesNotMatch(coaching(sample.result).assessment, /이제 한 세트에서 작은 변화를 시험/);
  assert.deepEqual(input, before);
});

test("one poor sleep report retains a conditional small progression without a blanket or lasting hold", () => {
  const sample = review({ ...good, sleep: "poor" });
  assert.equal(sample.analysis.recovery.current.strong, false);
  assert.equal(primary(sample.result).kind, "progression-option");
  assert.equal(primary(sample.result).proposal.targetReps, 11);
  assert.match(primary(sample.result).body, /몸풀기.*상태가 평소와 비슷/);
  assert.equal(coaching(sample.result).progressionCandidate, undefined);
});

test("short hours and poor sleep describe one sleep domain rather than two independent warning signals", () => {
  const sample = review({ ...good, sleep: "poor", sleepHours: 4 });
  assert.equal(sample.analysis.recovery.current.strong, false);
  assert.equal(primary(sample.result).kind, "progression-option");
  assert.doesNotMatch(primary(sample.result).body, /의학적|수면장애|반드시 쉬/);
});

test("zero reported sleep with low energy is an actual combined signal while null hours are unknown", () => {
  const zero = review({ ...good, energy: "low", sleepHours: 0 });
  assertHeld(zero.result, zero.actual);
  for (const value of [null, undefined, "0", -1, NaN]) {
    const sample = review({ ...good, sleepHours: value });
    assert.equal(sample.analysis.recovery.current.strong, false);
    assert.equal(primary(sample.result).kind, "progression-option");
    assert.ok(!sample.analysis.recovery.current.signals.includes("짧게 기록한 수면"));
  }
});

test("explicit high fatigue can hold today's increase without assigning a physiological cause", () => {
  const sample = review({ ...good, fatigue: "high" });
  assertHeld(sample.result, sample.actual);
  assert.match(primary(sample.result).body, /높게 기록한 피로/);
  assert.doesNotMatch(primary(sample.result).body, /피로가 누적|과훈련|탄수화물 부족 때문/);
});

test("active illness preserves recorded work but does not tell the user to reproduce or increase it now", () => {
  const sample = review({ ...good, illness: "active" });
  assertHeld(sample.result, sample.actual);
  assert.match(primary(sample.result).body, /쉬는 쪽.*의료진/);
  assert.doesNotMatch(primary(sample.result).body, /50kg|다음에는.*10회/);
  assert.equal(coaching(sample.result).supportingActions.length, 0);
  assert.doesNotMatch(resultText(sample.result), /감염.*확정|심근염|몇.*일.*회복/);
});

function resultText(result) {
  return [result.sessionCoaching.summary, ...result.rows.flatMap(row => [row.interpretation.coaching.assessment,
    row.interpretation.nextAction.body, ...row.interpretation.coaching.supportingActions.map(action => action.body)])].join(" ");
}

test("recovering after illness uses the performed baseline and next-day response without an invented percentage", () => {
  const sample = review({ ...good, illness: "recovering" });
  assertHeld(sample.result, sample.actual);
  assert.match(primary(sample.result).body, /50kg × 10회.*잠정 출발점/);
  assert.match(primary(sample.result).body, /운동 뒤와 다음 날 반응/);
  assert.doesNotMatch(resultText(sample.result), /60~70%|10~20분|이전 중량의.*%|완전히 회복/);
});

test("a current good report restores local progression while dated past concerns remain in history", () => {
  const sample = review(good, { checkins: {
    "2026-10-02": { date: "2026-10-02", coachCheckin: { energy: "low", hunger: "okay", sleep: "poor", performance: "down" } },
    [date]: { date, coachCheckin: good }
  } });
  assert.equal(sample.analysis.recovery.status, "okay");
  assert.equal(sample.analysis.recovery.current.strong, false);
  assert.equal(sample.analysis.recovery.historicalSignalRows[0].date, "2026-10-02");
  assert.ok(sample.analysis.recovery.selfReportSignals.includes("좋지 않은 수면"));
  assert.equal(primary(sample.result).kind, "progression-option");
  assert.equal(primary(sample.result).proposal.targetReps, 11);
  assert.doesNotMatch(primary(sample.result).body, /오늘은.*좋지 않은 수면/);
});

test("past-only concerns stay dated and cannot be converted into current strong symptoms", () => {
  const sample = review({}, { checkins: { "2026-10-02": { date: "2026-10-02", coachCheckin: {
    energy: "low", hunger: "okay", sleep: "poor", performance: "down", illness: "active"
  } } } });
  assert.equal(sample.analysis.recovery.status, "watch");
  assert.equal(sample.analysis.recovery.current.present, false);
  assert.equal(sample.analysis.recovery.current.illness, null);
  assert.equal(primary(sample.result).kind, "health-follow-up");
  assert.equal(primary(sample.result).proposal, undefined);
  assert.deepEqual(coaching(sample.result).healthFollowUp.reports, [{ field: "illness", date: "2026-10-02", value: "active" }]);
  assert.match(primary(sample.result).body, /2026-10-02.*아직 새로 확인되지/);
  assert.doesNotMatch(primary(sample.result).body, /지금 아픈|오늘은/);
});

test("the same current readiness is not retroactively attached to an explicitly selected older session", () => {
  const sample = review({ ...good, illness: "active" }, { coach: { sessionId: "second" } });
  assert.equal(sample.result.session.id, "second");
  assert.equal(coaching(sample.result).recoveryContext, undefined);
  assert.notEqual(primary(sample.result).kind, "maintain-recovery-work");
  assert.doesNotMatch(primary(sample.result).body, /지금 아픈/);
});

test("clinical care and pain remain above a future progression option", () => {
  for (const options of [{ records: [...records().slice(0, -1), record("current", date, { pain: "stop" })] },
    { coach: { profile: { ...profile, healthContext: "other" } } }]) {
    const sample = review({ ...good, illness: "recovering" }, options);
    assert.equal(primary(sample.result).kind, "individual-care");
    assert.equal(primary(sample.result).proposal, undefined);
    assert.equal(coaching(sample.result).progressionCandidate, undefined);
  }
});

test("return and deload purposes remain explicit rather than replaced by a generic readiness action", () => {
  for (const trainingIntent of ["return", "deload"]) {
    const sample = review({ energy: "low", hunger: "okay", sleep: "poor" }, {
      records: [...records().slice(0, -1), record("current", date, { trainingIntent })]
    });
    assert.equal(primary(sample.result).kind, trainingIntent);
    assert.equal(primary(sample.result).proposal, undefined);
    assert.equal(coaching(sample.result).progressionCandidate, undefined);
  }
});

test("an active illness guards even a saved return or deload purpose without reclassifying that purpose", () => {
  for (const trainingIntent of ["return", "deload", "light", "technique", "time-limited", "test"]) {
    const sample = review({ ...good, illness: "active" }, {
      records: [...records().slice(0, -1), record("current", date, { trainingIntent })]
    });
    assert.equal(primary(sample.result).kind, trainingIntent);
    assert.match(primary(sample.result).body, /지금 아픈 상태.*쉬는 쪽.*회복한 뒤/);
    assert.equal(primary(sample.result).proposal, undefined);
    assert.equal(coaching(sample.result).progressionCandidate, undefined);
    assert.equal(coaching(sample.result).supportingActions.length, 0);
    assert.equal(sample.actual[2].trainingIntent, trainingIntent);
  }
});

test("effort easing remains explicit while recovering-illness readiness is not lost from its primary text", () => {
  const actual = records();
  actual[2].exercises[0].sets[0].rir = 0;
  const sample = review({ ...good, illness: "recovering" }, { records: actual });
  assert.equal(primary(sample.result).kind, "ease");
  assert.match(primary(sample.result).body, /질병 뒤 회복 중.*다음 날 반응.*RIR 0/);
  assert.equal(primary(sample.result).proposal, undefined);
  assert.equal(coaching(sample.result).progressionCandidate, undefined);
});

test("a selected comfortable set remains the future option while its backoff support does not add repetitions now", () => {
  const actual = [record("first", "2026-09-28", { exercises: [block("first-bench", {
    sets: [{ id: "first-set", loadKg: 80, reps: 10, rir: null, marker: null }]
  })] }), record("current", date, { exercises: [block("current-bench", {
    sets: [{ id: "heavy", loadKg: 100, reps: 3, rir: null, marker: null },
      { id: "backoff-1", loadKg: 80, reps: 6, rir: null, marker: null },
      { id: "backoff-2", loadKg: 80, reps: 4, rir: null, marker: null }],
    feedback: { setId: "heavy", loadKg: 100, reps: 3, feeling: "comfortable" }
  })] })];
  const sample = review({ ...good, fatigue: "high" }, { records: actual });
  assert.equal(primary(sample.result).kind, "maintain-recovery-work");
  assert.equal(primary(sample.result).proposal, undefined);
  assert.equal(coaching(sample.result).progressionCandidate.proposal.setId, "heavy");
  assert.equal(coaching(sample.result).progressionCandidate.proposal.targetReps, 4);
  assert.ok(coaching(sample.result).supportingActions.some(action => action.kind === "restore-tail"));
  assert.doesNotMatch(resultText(sample.result), /1회 더|4회를 시도/);
  assert.deepEqual(actual[1].exercises[0].sets.map(set => set.reps), [3, 6, 4]);
});

test("a month of history crosses bad and recovered days without permanently suppressing the stable-work option", () => {
  const actual = ["2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30", "2026-10-06", "2026-10-08"]
    .map((day, index) => record("month-" + index, day));
  const days = { "2026-10-06": { date: "2026-10-06", coachCheckin: { energy: "low", sleep: "poor", hunger: "okay" } },
    "2026-10-08": { date: "2026-10-08", coachCheckin: good } };
  const before = structuredClone({ actual, days });
  const bad = T.coachSession(analyze(actual, days), { profile });
  assert.equal(primary(bad).kind, "maintain-recovery-work");
  const recovered = T.coachSession(analyze(actual, days, { date: "2026-10-08" }), { profile });
  assert.equal(recovered.session.id, "month-5");
  assert.equal(primary(recovered).kind, "progression-option");
  assert.equal(primary(recovered).proposal.setId, "month-5-bench-set");
  assert.equal(primary(recovered).proposal.targetReps, 11);
  assert.deepEqual({ actual, days }, before);
});
