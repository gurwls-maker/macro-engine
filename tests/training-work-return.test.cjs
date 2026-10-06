"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/training-coaching.js");
const T = require("../src/training.js");
const Coach = require("../src/coach.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");

const profile = { age: 32, healthContext: "general", goal: "performance", trainingYears: 4 };
const dates = [["2026-09-07", "2026-09-09", "2026-09-11"], ["2026-09-14", "2026-09-16", "2026-09-18"],
  ["2026-09-21", "2026-09-23", "2026-09-25"], ["2026-09-28", "2026-09-30", "2026-10-02"]];
function work(prefix, date, values, extra = {}) {
  return { id: prefix, blockId: prefix, sessionId: prefix + ":session", date, exerciseId: "bench_press", rawName: "합성 벤치",
    equipmentKey: "synthetic:return-rack", loadConvention: "total", loadRole: "external", sourceKind: "manual",
    sets: values.map(([loadKg, reps, rir = null], index) => ({ id: prefix + ":set:" + index, loadKg, reps, rir, marker: null })), ...extra };
}
const vector = (kg, reps = 8, sets = 3) => Array.from({ length: sets }, () => [kg, reps]);
function returning(values = vector(80), middle = [[80, 8], [80, 6]], reduced = vector(55, 8, 2)) {
  return dates.flatMap((phaseDates, phase) => phaseDates.map((date, index) => work(`phase${phase}:${index}`, date,
    phase === 1 ? middle : phase === 2 ? reduced : values)));
}
function direct(rows, extra = {}) {
  return C.interpret({ current: rows.at(-1), previous: rows.at(-2), history: rows.slice(0, -1), loadedMovement: true, profile, ...extra });
}
function engine(rows, options = {}) {
  const records = rows.map(row => ({ id: row.sessionId, date: row.date, time: "18:00", label: "합성 운동", pain: row.pain || null,
    trainingIntent: row.trainingIntent, source: { kind: "manual", hash: null }, exercises: [{ ...row, id: row.blockId }] }));
  const date = records.at(-1).date, p = { ...profile, ...options.profile };
  return T.coachSession(T.analyze(records, { date, profile: p, checkins: options.checkins, includeCapacityHistory: true }),
    { sessionId: records.at(-1).id, profile: p, ...options }).rows[0].interpretation.coaching;
}

test("actual full-work return links the earlier normal stage, every reduced phase and the current performed source", () => {
  for (const [normal, middle, lower] of [
    [vector(80), [[80, 8], [80, 6]], vector(55, 8, 2)],
    [vector(105, 6), [[105, 6], [105, 4]], vector(70, 6, 2)],
    [vector(65, 10), vector(65, 10), vector(45, 10, 2)]
  ]) {
    const records = returning(normal, middle, lower), before = structuredClone(records);
    for (let count = 1; count <= 3; count++) {
      const selected = records.slice(0, 9 + count), result = direct(selected), episode = result.facts.recentChange;
      assert.equal(episode.kind, "returned"); assert.equal(episode.currentSince, "2026-09-28");
      assert.equal(episode.observationDays, count);
      assert.deepEqual(episode.baseline.sets.map(set => [set.loadKg, set.reps]), normal);
      assert.equal(episode.baseline.source.date, normal[0][0] === 65 ? "2026-09-18" : "2026-09-11");
      assert.equal(result.facts.current.source.date, dates[3][count - 1]);
      const signal = result.signals.find(signal => signal.kind === "recent-work-returned");
      assert.ok(signal); assert.ok(signal.sourceRefs.some(source => source.date === "2026-09-25"));
      assert.ok(signal.sourceRefs.some(source => source.date === dates[3][count - 1]));
      assert.match(result.assessment, /이전.*구성으로 돌아(?:와|왔)/);
      assert.doesNotMatch(result.assessment, /배분을 바꿔|우열을|새로 높인 부하|근력이 회복|회복 완료|완치/);
      assert.match(result.primaryAction.body, /돌아온/);
      if (count < 3) {
        assert.equal(result.primaryAction.kind, "reestablish-recorded-work");
        assert.equal(Object.hasOwn(result.primaryAction, "proposal"), false);
      } else {
        assert.equal(result.primaryAction.kind, "progression-option");
        assert.equal(result.primaryAction.proposal.loadKg, normal[0][0]);
        assert.equal(result.primaryAction.proposal.baseReps, normal[0][1]);
        assert.equal(result.primaryAction.proposal.targetReps, normal[0][1] + 1);
        assert.ok(result.facts.current.sets.some(set => set.id === result.primaryAction.proposal.setId));
        assert.match(result.primaryAction.body, /몸 상태와 세트 여유가 괜찮으면/);
      }
    }
    assert.deepEqual(records, before);
  }
});

test("month-long unexpected decline and good-sleep counterfactual coach all three movements as a return, not a new rep-load exchange", () => {
  for (const id of ["unexpected-decline", "good-sleep-counterfactual"]) {
    const specification = Fixtures.REQUIREMENT_CATALOG.find(row => row.id === id);
    const scenario = Fixtures.buildCounterfactual("strength", specification);
    const state = Fixtures.asOf(scenario, Fixtures.END, { richActivity: true }), before = structuredClone(state);
    const current = state.training.records.at(-1);
    const analysis = T.analyze(state.training.records, { date: current.date, profile: state.profile,
      checkins: state.days, mappings: state.training.mappings, includeCapacityHistory: true });
    const result = T.coachSession(analysis, { sessionId: current.id, profile: state.profile, planning: state.training.planning });
    assert.equal(result.rows.length, 3);
    for (const row of result.rows) {
      const coaching = row.interpretation.coaching;
      assert.equal(coaching.facts.recentChange.kind, "returned");
      assert.match(coaching.assessment, /2026-09-28부터 이전.*구성으로 돌아와/);
      assert.match(coaching.primaryAction.body, /돌아온/);
      assert.doesNotMatch(coaching.assessment + coaching.primaryAction.body, /우열을|배분을 바꿔|수면 때문에|근력.*회복했|회복 완료/);
      assert.deepEqual(coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), current.exercises.find(ex => ex.id === row.blockId).sets.map(set => [set.loadKg, set.reps]));
    }
    assert.deepEqual(state, before);
  }
});

test("return matching requires the earlier whole vector rather than only the maximum load or first set", () => {
  const rows = returning().map((row, index) => index >= 9
    ? { ...row, sets: work(row.id, row.date, [[80, 8], [80, 8], [80, 7]]).sets } : row);
  assert.notEqual(direct(rows).facts.recentChange?.kind, "returned");
});

test("returning to established work after an expansion, load rise or redistribution does not make the temporary work a deficit to restore", () => {
  for (const [middle, next] of [
    [vector(80, 8, 6), vector(80, 8, 5)],
    [vector(95), vector(90)],
    [vector(55, 15, 2), vector(55, 15, 2)],
    [vector(55, 8, 6), vector(55, 8, 6)],
    [[[95, 3], [80, 8], [80, 6]], [[90, 5], [80, 8]]],
    [vector(80, 9), [[80, 9], [80, 8], [80, 8]]]
  ]) {
    const rows = returning(vector(80), middle, next), before = structuredClone(rows);
    for (let count = 1; count <= 3; count++) {
      const result = direct(rows.slice(0, 9 + count)), change = result.facts.recentChange;
      assert.equal(change.kind, "returned"); assert.equal(change.intermediateWorkReduced, false);
      assert.ok(result.priority < 70, "an ordinary return must not become an urgent adjustment just because it has a matching older vector");
      assert.deepEqual(change.baseline.sets.map(set => [set.loadKg, set.reps]), vector(80));
      assert.match(result.assessment, /구성을 바꿔 수행.*이전.*구성으로 돌아/);
      assert.doesNotMatch(result.assessment + result.primaryAction.body, /줄여 수행|줄였던|빠졌던|되찾|낮춘 구성|근력.*회복/);
      assert.deepEqual(result.facts.current.sets.map(set => [set.loadKg, set.reps]), vector(80));
      const signal = result.signals.find(signal => signal.kind === "recent-work-returned");
      assert.equal(signal.sourceRefs.length, 9 + count);
      assert.ok(signal.sourceRefs.some(source => source.date === "2026-09-11"));
      assert.ok(signal.sourceRefs.some(source => source.date === "2026-09-25"));
      if (count < 3) {
        assert.equal(result.primaryAction.kind, "reestablish-recorded-work");
        assert.match(result.primaryAction.body, /꼭 다시 채울 필요는 없/);
      } else assert.equal(result.primaryAction.proposal.targetReps, 9);
    }
    assert.deepEqual(rows, before);
  }
});

test("ordinary full-work returns do not displace a new heavy compound or important redistribution in the whole-session focus", () => {
  const restored = returning(vector(17, 15), vector(19, 15), vector(19, 15)).slice(0, 10);
  const records = restored.map(row => ({ id: row.sessionId, date: row.date, time: "18:00", label: "합성 Push", pain: null,
    source: { kind: "manual", hash: null }, exercises: [
      { ...row, id: row.blockId, exerciseId: "pullover", rawName: "풀오버" },
      { ...work(row.id + ":bench", row.date, row.date < "2026-09-28" ? vector(80) : [[100, 5], [80, 8], [80, 6]]),
        rawName: "바벨 벤치 프레스", exerciseId: "bench_press" },
      { ...work(row.id + ":ohp", row.date, row.date < "2026-09-28" ? vector(50, 8) : vector(35, 8, 6)),
        rawName: "바벨 오버헤드 프레스", exerciseId: "overhead_press" }
    ] }));
  const date = records.at(-1).date, before = structuredClone(records);
  const result = T.coachSession(T.analyze(records, { date, profile, includeCapacityHistory: true }), { profile });
  assert.equal(result.rows.length, 3);
  const returned = result.rows.find(row => row.rawName === "풀오버");
  assert.equal(returned.interpretation.coaching.facts.recentChange.kind, "returned");
  assert.match(returned.interpretation.nextAction.body, /돌아온/);
  assert.equal(returned.interpretation.coaching.priority, 55);
  const focus = result.sessionCoaching.actions.map(action => records.at(-1).exercises.find(exercise => exercise.id === action.blockId).exerciseId);
  assert.deepEqual(new Set(focus), new Set(["bench_press", "overhead_press"]));
  assert.deepEqual(records, before);
});

test("small source-bound tail reductions can return to the exact earlier whole work without requiring a large decline threshold", () => {
  const rows = [...dates[0].map((date, index) => work("base:" + index, date, vector(80))),
    ...dates[1].map((date, index) => work("tail:" + index, date, [[80, 8], [80, 8], [80, 7]])),
    ...dates[3].map((date, index) => work("return:" + index, date, vector(80)))];
  const result = direct(rows);
  assert.equal(result.facts.recentChange.kind, "returned");
  assert.match(result.assessment, /8·8·7회.*줄여 수행.*8·8·8회.*돌아와/);
  assert.equal(result.primaryAction.proposal.targetReps, 9);
  assert.doesNotMatch(result.assessment, /장기 부진|큰 하락|부상|회복 완료/);
});

test("different equipment, conventions, roles, isolated old work, future dates and old history cannot manufacture a returned-work baseline", () => {
  for (const change of [
    rows => { rows.splice(0, 2); },
    rows => { rows.slice(0, 3).forEach(row => { row.equipmentKey = "synthetic:other-rack"; }); },
    rows => { rows.slice(0, 3).forEach(row => { row.loadConvention = "per-side"; }); },
    rows => { rows.slice(0, 3).forEach(row => { row.loadRole = "assistance"; }); },
    rows => { rows.slice(0, 3).forEach(row => { row.ruleConflict = true; }); },
    rows => { rows.slice(0, 3).forEach(row => { row.date = "2026-10-03"; }); },
    rows => { rows.slice(0, 3).forEach((row, index) => { row.date = "2026-08-0" + (index + 1); }); }
  ]) {
    const rows = returning(); change(rows);
    assert.notEqual(direct(rows).facts.recentChange?.kind, "returned");
  }
});

test("current pain, clinical care, illness, declared purpose and precise set effort retain final priority over an observed work return", () => {
  const rows = returning();
  for (const config of [
    { change: row => { row.pain = "mild"; }, options: {}, expected: "individual-care" },
    { change: row => { row.pain = "stop"; }, options: {}, expected: "individual-care" },
    { change: () => {}, options: { profile: { healthContext: "clinical" } }, expected: "individual-care" },
    { change: () => {}, options: { checkins: [{ date: "2026-10-02", illness: "active" }] }, expected: "maintain-recovery-work" },
    { change: () => {}, options: { checkins: [{ date: "2026-10-02", illness: "recovering" }] }, expected: "maintain-recovery-work" },
    { change: () => {}, options: { checkins: [{ date: "2026-10-02", fatigue: "high" }] }, expected: "maintain-recovery-work" },
    { change: row => { row.trainingIntent = "technique"; }, options: {}, expected: "technique" },
    { change: row => { row.trainingIntent = "deload"; }, options: {}, expected: "deload" },
    { change: row => { row.sets[0].rir = 0; }, options: {}, expected: "ease" },
    { change: row => { row.feedback = { setId: row.sets[0].id, feeling: "limit", loadKg: 80, reps: 8 }; }, options: {}, expected: "ease" }
  ]) {
    const copy = structuredClone(rows); config.change(copy.at(-1)); const before = structuredClone(copy), result = engine(copy, config.options);
    assert.equal(result.primaryAction.kind, config.expected);
    assert.equal(Object.hasOwn(result.primaryAction, "proposal"), false);
    assert.deepEqual(copy, before);
    assert.deepEqual(result.facts.current.sets.map(set => [set.loadKg, set.reps]), vector(80));
  }
});

test("repeated declared returns do not call each latest record the first return", () => {
  const rows = returning(); rows.slice(9).forEach(row => { row.trainingIntent = "return"; });
  const result = engine(rows);
  assert.equal(result.primaryAction.kind, "return");
  assert.match(result.primaryAction.body, /이번 복귀 수행/);
  assert.doesNotMatch(result.primaryAction.body, /복귀 첫 수행|첫 복귀/);
});

test("bodyweight work return preserves performed repetition sources without producing kilogram capacity or growth claims", () => {
  const rows = returning(vector(null, 10), vector(null, 8, 2), vector(null, 6, 2));
  rows.forEach(row => { row.exerciseId = "pull_up"; row.loadConvention = "bodyweight"; row.loadRole = "unknown"; });
  const result = direct(rows, { loadedMovement: false });
  assert.equal(result.facts.recentChange.kind, "returned");
  assert.equal(result.facts.current.maxLoadKg, null);
  assert.equal(result.primaryAction.proposal.loadKg, null);
  assert.match(result.primaryAction.body, /10회.*11회/);
  assert.doesNotMatch(result.assessment + result.primaryAction.body, /kg|근성장|최대 능력/);
});

test("assistance and bodyweight expansions return to their own whole vector without interpreting displayed load as external capacity", () => {
  for (const type of ["bodyweight", "assistance"]) {
    const load = type === "bodyweight" ? null : 35;
    const rows = returning(vector(load, 10), vector(load, 10, 6), vector(load, 10, 5));
    rows.forEach(row => { row.exerciseId = "pull_up"; row.loadConvention = type === "bodyweight" ? type : "total";
      row.loadRole = type === "bodyweight" ? "unknown" : type; });
    const result = direct(rows, { loadedMovement: false });
    assert.equal(result.facts.recentChange.kind, "returned");
    assert.equal(result.facts.recentChange.intermediateWorkReduced, false);
    assert.equal(result.facts.current.maxLoadKg, null);
    assert.doesNotMatch(result.assessment, /줄여 수행|최대 능력|근성장|근력.*회복/);
    assert.equal(result.primaryAction.proposal.targetReps, 11);
    assert.equal(result.primaryAction.proposal.loadKg, load);
  }
});

test("the month-long improvement scenario keeps the original full work as the return reference after temporary heavier or longer work", () => {
  const scenario = Fixtures.buildCounterfactual("strength", Fixtures.REQUIREMENT_CATALOG.find(row => row.id === "sharp-improvement"));
  const state = Fixtures.asOf(scenario, Fixtures.END, { richActivity: true }), current = state.training.records.at(-1);
  const result = T.coachSession(T.analyze(state.training.records, { date: current.date, profile: state.profile,
    checkins: state.days, includeCapacityHistory: true }), { sessionId: current.id, profile: state.profile });
  const selected = result.rows.filter(row => ["bench_press", "squat"].includes(
    current.exercises.find(exercise => exercise.id === row.blockId)?.exerciseId));
  assert.equal(selected.length, 2);
  for (const row of selected) {
    assert.equal(row.interpretation.coaching.facts.recentChange.kind, "returned");
    assert.doesNotMatch(row.interpretation.coaching.assessment + row.interpretation.coaching.primaryAction.body,
      /빠졌던 세트|줄었던 구간|낮춘 구성을|되찾/);
  }
});

test("redistributed-work wording attaches the correct particle without changing its actual lower-load higher-set distinction", () => {
  const rows = [...dates[0].map((date, index) => work("base:" + index, date, vector(80))),
    ...dates[2].map((date, index) => work("more:" + index, date, vector(55, 8, 6)))];
  const result = direct(rows);
  assert.equal(result.facts.recentChange.kind, "redistributed");
  assert.match(result.assessment, /부담 배분을 최근/);
  assert.doesNotMatch(result.assessment, /배분를/);
});

test("the shared coach projection preserves each actual return stage date and source rather than presenting the old normal work as current evidence", () => {
  const scenario = Fixtures.buildCounterfactual("strength", Fixtures.REQUIREMENT_CATALOG.find(row => row.id === "unexpected-decline"));
  const state = Fixtures.asOf(scenario, Fixtures.END, { richActivity: true }), before = structuredClone(state);
  const current = state.training.records.at(-1), analysis = T.analyze(state.training.records, { date: current.date,
    profile: state.profile, checkins: state.days, mappings: state.training.mappings, includeCapacityHistory: true });
  const result = Coach.buildCoach(state.profile, state.days[current.date], Object.values(state.days),
    { state, training: state.training, trainingAnalysis: analysis });
  const contexts = result.context.training.sessionCoaching.exerciseContexts;
  assert.equal(contexts.length, 3);
  for (const row of contexts) {
    assert.equal(row.hypotheses.recentChange.kind, "returned");
    const change = row.actual.recentChange;
    assert.equal(change.currentSince, "2026-09-28"); assert.equal(change.observationDays, 3);
    assert.ok(change.baseline.date < change.currentSince);
    assert.equal(change.baseline.date, change.baseline.source.date);
    assert.equal(row.actual.current.date, current.date);
    assert.equal(row.actual.current.source.sessionId, current.id);
    for (const stage of change.stages) {
      assert.equal(stage.work.date, stage.dates.at(-1));
      assert.equal(stage.work.source.date, stage.work.date);
      const source = state.training.records.find(record => record.id === stage.work.source.sessionId);
      assert.equal(source.date, stage.work.date);
      const block = source.exercises.find(exercise => exercise.id === stage.work.source.blockId);
      assert.deepEqual(stage.work.sets.map(set => [set.id, set.loadKg, set.reps]), block.sets.map(set => [set.id, set.loadKg, set.reps]));
    }
  }
  assert.deepEqual(state, before);
});
