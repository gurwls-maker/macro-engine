"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const day = "2026-10-06";
const set = (id, kg, reps, extras = {}) => ({ id, loadKg: kg, reps, marker: null, rir: null, ...extras });
const exercise = (id, sets, extras = {}) => ({ id, rawName: "바벨 스쿼트", exerciseId: "squat", equipmentKey: "rack-A", loadConvention: "total", loadRole: "external", sets, ...extras });
const record = (id, date, ex, extras = {}) => ({ id, date, time: null, label: "합성 운동", exercises: [ex], source: { kind: "manual", hash: null, paths: [] }, pain: null, ...extras });
const coach = (records, options = {}) => T.coachSession(T.analyze(records, { date: day, includeCapacityHistory: true }), options);
const value = result => result.rows[0].interpretation;

test("performed-first RM connects a heavier top and all backoffs without requiring RIR", () => {
  const data = [record("old", "2026-09-18", exercise("old-ex", [set("old-set", 100, 10)])),
    record("new", day, exercise("new-ex", [set("top", 120, 3), set("back-1", 100, 6), set("back-2", 100, 4)]))];
  const before = structuredClone(data), result = value(coach(data));
  assert.deepEqual(result.performance.model.expectedRepsAtCurrentLoad, { min: 3, max: 5, basis: "formula-inversion", rangeMeaning: "formula-spread", rangeLimited: false });
  assert.match(result.performance.summary, /100kg × 10회.*120kg.*3~5회.*범위 안/s);
  assert.equal(result.performance.model.current.setId, "top");
  assert.equal(result.performance.model.previous.sessionId, "old");
  assert.equal(result.performance.model.previous.setId, "old-set");
  assert.equal(result.performance.model.current.reportedRir, null);
  assert.deepEqual(result.coaching.facts.current.segments.map(segment => [segment.loadKg, segment.reps, segment.setIds]),
    [[120, [3], ["top"]], [100, [6, 4], ["back-1", "back-2"]]]);
  assert.ok(result.coaching.signals.some(signal => signal.kind === "new-heavy-exposure"));
  assert.match(result.nextAction.body, /120kg × 3회.*100kg × 6·4회/s);
  assert.doesNotMatch(result.nextAction.body, /수행 테스트|분석할 수 없|RIR.*필요/);
  assert.deepEqual(data, before);
});

test("an old same-load experience survives the 28-day review window", () => {
  const result = value(coach([record("old", "2026-08-20", exercise("old-ex", [set("old-set", 120, 3)])), record("new", day, exercise("new-ex", [set("new-set", 120, 3)]))]));
  assert.equal(result.performance.model.sameLoadHistory.date, "2026-08-20");
  assert.equal(result.performance.model.previous, null);
  assert.deepEqual({ date: result.performance.loadExperience.date, daysAgo: result.performance.loadExperience.daysAgo, reps: result.performance.loadExperience.reps },
    { date: "2026-08-20", daysAgo: 47, reps: 3 });
  assert.equal(result.reference.sessionId, "old", "a useful old actual record remains separate from the 42-day RM comparison");
  assert.match(result.evidence.context.find(row => row.label === "같은 중량 경험").value, /2026-08-20.*47일 전/);
  assert.doesNotMatch(result.coaching.assessment + " " + result.observations.join(" "), /이번이 처음|120kg.*새 중량/);
});

test("future stronger records never leak into a selected historical RM", () => {
  const result = value(coach([record("selected", "2026-09-18", exercise("a", [set("a1", 100, 10)])), record("future", day, exercise("b", [set("b1", 200, 1)]))], { sessionId: "selected" }));
  assert.equal(result.performance.model.allTimeBest.loadKg, 100);
  assert.equal(result.performance.model.sameLoadHistory, null);
});

test("another device, convention, role, exercise or variant cannot supply a prior RM", () => {
  for (const extras of [{ equipmentKey: "rack-B" }, { loadConvention: "per-side" }, { loadRole: "assistance" }, { exerciseId: "bench_press", rawName: "바벨 벤치 프레스" }, { rawName: "바벨 스쿼트 정지", exerciseId: null }]) {
    const result = value(coach([record("old", "2026-09-18", exercise("old-ex", [set("old-set", 100, 10)], extras)), record("new", day, exercise("new-ex", [set("new-set", 120, 3)]))]));
    assert.equal(result.performance.model.previous, null);
  }
});

test("three working days permit a small trial without declaring repeated work a true maximum", () => {
  const records = ["2026-09-01", "2026-09-20", day].map((date, i) => record("r" + i, date, exercise("x" + i, [set("s" + i, 100, 10)])));
  const result = value(coach(records, { profile: { goal: "performance", trainingYears: 3 } }));
  assert.equal(result.performance.model.stableWorking.observationDays, 3);
  assert.equal(result.nextAction.kind, "progression-option");
  const stable = result.coaching.signals.find(signal => signal.kind === "stable-whole-work");
  assert.ok(stable); assert.equal(stable.observationDays, 3);
  assert.deepEqual(stable.dates, ["2026-09-01", "2026-09-20", day]);
  assert.deepEqual(new Set(stable.sourceRefs.map(source => source.sessionId)), new Set(["r0", "r1", "r2"]));
  assert.deepEqual(result.coaching.primaryAction.focusSetIds, ["s2"]);
  assert.match(result.nextAction.body, /100kg × 10회.*한 세트에서만 11회.*가장 작은.*반복과 부하를 동시에 높이지/s);
  assert.deepEqual(result.nextAction.proposal, { kind: "single-set-reps", setId: "s2", loadKg: 100, baseReps: 10, targetReps: 11 });
  assert.doesNotMatch(result.nextAction.body, /세트를 추가해|최대 중량을 시도|한계로 확정|나머지 세트|다른 세트/);
  assert.equal(result.performance.model.current.reportedRir, null);
  assert.doesNotMatch(result.coaching.assessment, /실제 1RM|최대 능력이 확정|정체/);
});

test("qualitative feedback changes advice without inventing numerical reserve", () => {
  const source = record("new", day, exercise("new-ex", [set("top", 120, 3)]));
  const initial = value(coach([source]));
  for (const feeling of ["comfortable", "limit"]) {
    const input = structuredClone(source); input.exercises[0].feedback = { setId: "top", loadKg: 120, reps: 3, feeling };
    const result = value(coach([input]));
    assert.equal(result.performance.model.current.minKg, initial.performance.model.current.minKg);
    assert.equal(result.performance.model.current.reportedRir, null);
    assert.equal(result.nextAction.kind, feeling === "comfortable" ? "reps-option" : "ease");
  }
});

test("explicit RIR refines only its actual set while assistance and bodyweight have no kg RM", () => {
  const result = value(coach([record("new", day, exercise("new-ex", [set("top", 120, 3, { rir: 1 })]))]));
  assert.equal(result.performance.model.current.effectiveReps, 4);
  assert.match(result.observations.join(" "), /RIR 1/);
  for (const extras of [{ loadRole: "assistance" }, { loadConvention: "bodyweight" }]) assert.equal(value(coach([record("new", day, exercise("new-ex", [set("top", 120, 3)], extras))])).performance, null);
});

test("a lower later heavy ramp estimate does not erase the preceding work or become the starting load", () => {
  const data = [record("old", "2026-09-18", exercise("old-ex", [set("old-set", 75, 8)])),
    record("new", day, exercise("new-ex", [set("base1", 60, 12), set("base2", 60, 12), set("heavy", 75, 5)]))];
  const result = value(coach(data));
  assert.match(result.nextAction.body, /60kg × 12·12회.*75kg × 5회/s);
  assert.doesNotMatch(result.nextAction.body, /첫 일반 세트는 75kg|시작 중량은 75kg/);
});

test("Smith performance is estimated within its own device, not translated into barbell kg", () => {
  const result = value(coach([record("new", day, exercise("row", [set("row1", 80, 10)], { rawName: "스미스 벤트 오버 로우", exerciseId: "smith_row", equipmentKey: "smith-A" }))]));
  assert.ok(result.performance);
  assert.equal(result.performance.model.current.loadKg, 80);
  assert.equal(result.performance.model.previous, null);
});

test("timed mobility and cardio retain actual minutes instead of requesting a lifting set", () => {
  for (const [exerciseId, rawName, durationMinutes] of [["foam_rolling", "폼 롤링 스트레칭", 5], ["back_stretch", "등 근육 스트레칭", 10], ["treadmill", "런닝머신", 10]]) {
    const result = coach([record("new", day, exercise("timed", [], { exerciseId, rawName, durationMinutes }))]);
    assert.match(value(result).summary, new RegExp(durationMinutes + "분"));
    assert.match(result.sessionCoaching.composition.summary, new RegExp(durationMinutes + "분"));
    assert.doesNotMatch(value(result).nextAction.body, /한 세트의 반복|실제 한 세트|중량을 올리/);
  }
});

test("later larger rep work is used without assigning it to every set or extrapolating high-rep RM", () => {
  const result = value(coach([record("new", day, exercise("press", [set("1", 100, 15), set("2", 100, 15), set("3", 100, 25)], { rawName: "레그 프레스", exerciseId: "leg_press" }))]));
  assert.equal(result.performance, null);
  assert.equal(result.nextAction.kind, "working-range");
  assert.match(result.nextAction.body, /15·15·25회.*모든 세트를 25회로 맞출 필요는 없/s);
});

test("marked pull-up sets stay visible without pretending their unknown marker is assistance or ordinary work", () => {
  const result = value(coach([record("new", day, exercise("pull", [set("1", null, 14), set("2", null, 11, { marker: "A" }), set("3", null, 8, { marker: "A" })], { exerciseId: "pull_up", rawName: "풀 업", equipmentKey: null, loadConvention: "bodyweight", loadRole: "unknown" }))]));
  assert.equal(result.performance, null);
  assert.match(result.observations.join(" "), /A 11회.*A 8회/);
  assert.doesNotMatch(result.observations.join(" "), /보조받은 11회|일반 3세트/);
});

test("band rotation does not blindly progress repetitions just because they repeat", () => {
  const result = value(coach([record("new", day, exercise("rotation", [set("1", null, 20)], { exerciseId: "external_rotation", rawName: "밴드 외회전", equipmentKey: "밴드", loadRole: "unknown" }))]));
  assert.equal(result.nextAction.kind, "technique-control");
  assert.doesNotMatch(result.nextAction.body, /21회|1회 더 시도/);
});

test("actual pain always overrides repeated-work and positive RM progression", () => {
  const data = ["2026-09-01", "2026-09-20", day].map((date, i) => record("r" + i, date, exercise("x" + i, [set("s" + i, 100, 10)]), i === 2 ? { pain: "stop" } : {}));
  assert.equal(value(coach(data)).nextAction.kind, "individual-care");
});

test("past nonregular or painful load exposure is remembered without becoming a performance baseline", () => {
  for (const extras of [{ trainingIntent: "deload" }, { pain: "mild" }, { pain: "stop" }]) {
    const data = [record("old", "2026-09-18", exercise("old-ex", [set("old-set", 120, 3)]), extras),
      record("new", day, exercise("new-ex", [set("new-set", 120, 3)]))], before = structuredClone(data);
    const result = value(coach(data));
    assert.equal(result.performance.model.previous, null);
    assert.equal(result.performance.model.sameLoadHistory, null, "exposure memory is not an ordinary-performance comparison");
    assert.equal(result.reference, null);
    assert.equal(result.coaching.facts.previous, null);
    assert.equal(result.performance.loadExperience.date, "2026-09-18");
    assert.equal(result.performance.loadExperience.pain, extras.pain || null);
    assert.equal(result.performance.loadExperience.trainingIntent, extras.trainingIntent || null);
    assert.equal(result.performance.loadExperience.daysAgo, 18);
    assert.equal(result.performance.loadExperience.reps, 3);
    const exposure = result.evidence.context.find(row => row.label === "같은 중량 경험");
    assert.ok(exposure); assert.match(exposure.value, /2026-09-18.*120kg|120kg.*2026-09-18/);
    if (extras.pain) assert.match(exposure.value, /통증.*평소 수행 기준.*구분/);
    assert.doesNotMatch(result.observations.join(" "), /이번에 처음/);
    assert.deepEqual(data, before);
  }
});

test("a conflicting current set ID does not use an arbitrary first numeric copy for RM", () => {
  const result = value(coach([record("new", day, exercise("duplicate", [set("same", 60, 10), set("same", 90, 3)]))]));
  assert.equal(result.performance, null);
});
