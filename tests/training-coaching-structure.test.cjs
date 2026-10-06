"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const day = "2026-10-06";
const set = (id, loadKg, reps, extras = {}) => ({ id, loadKg, reps, marker: null, rir: null, ...extras });
const exercise = (id, sets, extras = {}) => ({ id, rawName: "바벨 스쿼트", exerciseId: "squat", equipmentKey: "rack-A", loadConvention: "total", loadRole: "external", sets, notes: "", ...extras });
const record = (id, date, exercises, extras = {}) => ({ id, date, time: null, label: "합성 하체", exercises,
  source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, notes: "", pain: null, effort: null,
  sequence: { order: "unknown", structure: "unknown" }, ...extras });
const topBackoff = (prefix = "current", tail = [[100, 6], [100, 4]]) => [set(prefix + "-top", 120, 3), ...tail.map(([load, reps], index) => set(prefix + "-backoff-" + index, load, reps))];
const coach = (records, options = {}) => T.coachSession(T.analyze(records, { date: day, profile: options.profile, checkins: options.checkins }), options);
const meaning = (result, blockId = null) => (blockId ? result.rows.find(row => row.blockId === blockId) : result.rows[0]).interpretation;
const target = (id = "target", extras = {}) => ({ id, exerciseId: "squat", label: "스쿼트", sets: 1, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: null, equipmentKey: null, loadConvention: "as-recorded", ...extras });
const assignment = (actual, extras = {}) => ({ id: "assignment", date: actual.date, recordId: actual.id, status: "performed", prescription: { id: "planned-day", label: "계획", exercises: [target()] }, ...extras });
const hasPlan = interpretation => interpretation.evidence.context.some(row => row.label === "연결한 계획");
const paired = (prefix, values) => [
  exercise(prefix + "-press", values.map(([load, reps], index) => set(prefix + "-press-" + index, load, reps)), { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "press-A" }),
  exercise(prefix + "-curl", values.map(([load, reps], index) => set(prefix + "-curl-" + index, load / 2, reps)), { rawName: "레그 컬", exerciseId: "leg_curl", equipmentKey: "curl-A" })
];

test("one heavy set and one lower-load set remain a top/backoff candidate rather than losing their separate roles", () => {
  const result = coach([record("two-sets", day, [exercise("squat", topBackoff("two", [[100, 6]]))])]);
  const value = meaning(result);
  assert.equal(value.structure.kind, "top-backoff-candidate");
  assert.deepEqual(value.structure.segments.map(row => row.kind), ["heavy-lead", "lower-load"]);
  assert.match(value.nextAction.body, /120kg × 3회/);
  assert.match(value.nextAction.body, /100kg × 6회/);
  assert.notEqual(value.nextAction.kind, "practice");
});

test("two backoff sets are interpreted together but not falsely matched to a previous top set", () => {
  const records = [record("prior", "2026-09-18", [exercise("prior-squat", [set("prior-1", 100, 10), set("prior-2", 100, 8), set("prior-3", 100, 6)])]),
    record("current", "2026-10-04", [exercise("current-squat", topBackoff())])];
  const before = structuredClone(records), result = coach(records), value = meaning(result);
  assert.equal(value.structure.kind, "top-backoff-candidate");
  assert.equal(value.reference.sessionId, "prior");
  assert.equal(value.evidence.comparisons.length, 1);
  const pair = value.evidence.comparisons[0];
  assert.equal(pair.label, "100kg 구간");
  assert.deepEqual(pair.setIds, ["current-backoff-0", "current-backoff-1"]);
  assert.deepEqual(pair.previousSetIds, ["prior-1", "prior-2", "prior-3"]);
  assert.equal(pair.sameRole, false);
  assert.match(pair.current, /100kg.*6·4회/);
  assert.match(pair.previous, /100kg.*10·8·6회/);
  assert.doesNotMatch(value.observations.join(" "), /100kg × 10회에서 120kg × 3회/);
  assert.match(value.nextAction.body, /120kg × 3회/);
  assert.match(value.nextAction.body, /100kg.*6·4회/);
  assert.deepEqual(records, before);
});

test("varying backoff loads retain each actual load segment and chosen set identities", () => {
  const result = coach([record("varying", day, [exercise("squat", topBackoff("varying", [[100, 6], [90, 8]]))])]);
  const value = meaning(result);
  assert.equal(value.structure.kind, "top-backoff-candidate");
  assert.deepEqual(value.structure.segments.map(row => row.loadKg), [120, 100, 90]);
  assert.deepEqual(value.structure.segments.flatMap(row => row.setIds), ["varying-top", "varying-backoff-0", "varying-backoff-1"]);
  assert.match(value.nextAction.body, /100kg × 6회.*90kg × 8회/);
});

test("multiple heavy lead sets followed by lower work retain the heavy segment rather than only its first set", () => {
  const result = coach([record("multiple-heavy", day, [exercise("squat", [set("top-1", 120, 3), set("top-2", 120, 3), set("backoff-1", 100, 6), set("backoff-2", 100, 5)])])]);
  const value = meaning(result);
  assert.equal(value.structure.kind, "top-backoff-candidate");
  assert.deepEqual(value.structure.segments[0].setIds, ["top-1", "top-2"]);
  assert.deepEqual(value.structure.segments[0].reps, [3, 3]);
  assert.match(value.nextAction.body, /120kg.*3·3회/);
  assert.match(value.nextAction.body, /100kg.*6·5회/);
});

test("mixed returning load segments are preserved in the default next action instead of only the first load", () => {
  const result = coach([record("mixed", day, [exercise("squat", [set("first-100", 100, 10), set("middle-80", 80, 15), set("last-100", 100, 8)])])]);
  const value = meaning(result);
  assert.equal(value.structure.kind, "mixed");
  assert.deepEqual(value.structure.segments.map(row => row.loadKg), [100, 80, 100]);
  assert.deepEqual(value.structure.segments.flatMap(row => row.setIds), ["first-100", "middle-80", "last-100"]);
  const coaching = value.coaching;
  assert.deepEqual(coaching.facts.current.segments.map(segment => [segment.loadKg, segment.reps, segment.setIds]),
    [[100, [10], ["first-100"]], [80, [15], ["middle-80"]], [100, [8], ["last-100"]]]);
  assert.equal(coaching.primaryAction.kind, "restore-tail");
  assert.deepEqual(coaching.primaryAction.focusSetIds, ["first-100", "last-100"]);
  assert.match(coaching.primaryAction.body, /100kg.*10·8회/);
  assert.match([coaching.primaryAction, ...coaching.supportingActions].map(action => action.body).join(" "), /80kg.*15회/,
    "pacing the returning load segment does not leave the intervening segment out of the next-session advice");
  assert.doesNotMatch(coaching.assessment, /회복 실패|앞 운동 때문에/);
});

test("ramp comparisons name their load segment rather than calling every segment the first set", () => {
  const records = [record("prior", "2026-10-01", [exercise("prior", [set("prior-60", 60, 10), set("prior-80", 80, 8)])]),
    record("current", day, [exercise("current", [set("current-60", 60, 11), set("current-80", 80, 9)])])];
  const value = meaning(coach(records));
  assert.equal(value.structure.kind, "ramp");
  assert.deepEqual(value.evidence.comparisons.map(row => row.label), ["60kg 구간", "80kg 구간"]);
  assert.ok(value.evidence.comparisons.every(row => row.sameRole));
  assert.doesNotMatch(value.observations.join(" "), /첫 일반 세트/);
  assert.match(value.observations.join(" "), /80kg 구간/);
  assert.match(value.nextAction.body, /60kg × 11회.*80kg × 9회/);
});

test("unknown or assistance pull-up kg are displayed without invented heavy/backoff load direction", () => {
  for (const loadRole of ["unknown", "assistance"]) {
    const result = coach([record("pull-" + loadRole, day, [exercise("pull", [set("assisted-first", 60, 3), set("assisted-second", 40, 6), set("assisted-third", 40, 6)],
      { rawName: "보조 풀업", exerciseId: "assisted_pull_up", equipmentKey: "assisted-A", loadConvention: "as-recorded", loadRole })])]);
    const value = meaning(result);
    assert.equal(value.structure.kind, "mixed");
    assert.doesNotMatch(value.summary + " " + value.nextAction.body, /탑세트|백오프|무거운 구간|중량을 낮춘/);
    assert.equal(result.rows[0].sets[0].loadKg, 60);
    if (loadRole === "assistance") assert.ok(value.evidence.context.some(row => row.label === "kg 의미"));
  }
});

test("ordinary low reps and a user-confirmed test lead to different actions without rewriting the sets", () => {
  const ordinary = record("ordinary", day, [exercise("ordinary", [set("ordinary-set", 120, 3)])]);
  const testing = record("testing", day, [exercise("testing", [set("test-set", 120, 3)])], { trainingIntent: "test" });
  const normal = meaning(coach([ordinary])), confirmed = meaning(coach([testing]));
  assert.equal(normal.nextAction.kind, "repeat");
  assert.doesNotMatch(normal.nextAction.body, /곧바로 다음 시작값으로 쓰지 말고|테스트 기록/);
  assert.match(normal.nextAction.body, /3회가 목표였다면/);
  assert.equal(confirmed.nextAction.kind, "test");
  assert.match(confirmed.nextAction.body, /테스트 기록/);
  assert.equal(ordinary.exercises[0].sets[0].rir, null);
  assert.equal(testing.exercises[0].sets[0].reps, 3);
});

test("low reps with actual zero RIR keep the selected effort information instead of hiding it behind a low-rep policy", () => {
  const result = coach([record("zero-rir", day, [exercise("squat", [set("hard-low", 120, 3, { rir: 0 })])])]);
  assert.equal(meaning(result).nextAction.kind, "ease");
  assert.match(meaning(result).nextAction.body, /RIR 0/);
});

test("missing RIR and sequence still produce useful comparisons and one concrete next action", () => {
  const records = [record("prior", "2026-10-01", [exercise("prior", [set("prior-set", 100, 8)])]),
    record("current", day, [exercise("current", [set("current-set", 100, 10)])])];
  const result = coach(records), value = meaning(result);
  assert.equal(value.reference.sessionId, "prior");
  assert.equal(value.reference.contextMatched, false);
  assert.equal(value.evidence.referenceStatus, "matched");
  assert.deepEqual(value.evidence.comparisons[0].setIds, ["current-set"]);
  assert.match(value.observations.join(" "), /8회에서 10회로 늘었어요/);
  assert.match(value.nextAction.body, /100kg × 10회/);
  assert.doesNotMatch(value.evidence.summary + " " + value.observations.join(" "), /같은 조건|분석.*못|없어서.*안/);
  assert.ok(value.evidence.context.some(row => row.label === "노력 기록" && /선택/.test(row.value)));
  assert.ok(result.rows[0].sets.every(row => row.rir === null));
});

test("unknown loads stay unknown while actual repetitions remain actionable", () => {
  const result = coach([record("unknown-load", day, [exercise("squat", [set("unknown", null, 8), set("unknown-tail", null, 7)])])]);
  const value = meaning(result);
  assert.equal(value.structure.segments[0].loadKg, null);
  assert.match(value.summary, /8·7회/);
  assert.doesNotMatch(value.summary + " " + value.nextAction.body, /0kg/);
  assert.ok(result.rows[0].sets.every(row => row.loadKg === null));
});

test("repeated current blocks do not falsely announce a new device baseline or pick an arbitrary old block", () => {
  const records = [record("other-device", "2026-10-01", [exercise("other", [set("other-set", 200, 10)], { equipmentKey: "rack-B" })]),
    record("same-device", "2026-10-02", [exercise("old", [set("old-set", 100, 10)])]),
    record("current", day, [exercise("first", [set("first-set", 100, 8)]), exercise("second", [set("second-set", 100, 6)])])];
  const result = coach(records);
  for (const row of result.rows) {
    assert.equal(row.interpretation.reference, null);
    assert.equal(row.interpretation.evidence.referenceStatus, "ambiguous");
    assert.equal(row.interpretation.evidence.comparisons.length, 0);
    assert.doesNotMatch(row.interpretation.observations.join(" "), /이 장비의 출발 기록이 생겼/);
    assert.match(row.interpretation.nextAction.body, new RegExp("100kg × " + row.sets[0].reps + "회"));
  }
});

test("an ambiguous preceding day does not collapse two same-device blocks into a false first baseline", () => {
  const result = coach([record("prior", "2026-10-01", [exercise("prior-first", [set("prior-one", 100, 10)]), exercise("prior-second", [set("prior-two", 80, 10)])]),
    record("current", day, [exercise("current", [set("current-one", 90, 10)])])]);
  assert.equal(meaning(result).reference, null);
  assert.equal(meaning(result).evidence.referenceStatus, "ambiguous");
  assert.doesNotMatch(meaning(result).evidence.summary, /출발 기록.*생겼|앞선 기록.*없/);
});

test("a newer presence-only block does not hide an older usable actual reference", () => {
  for (const unavailable of [[], [set("unreadable", 100, null)], [set("warmup-only", 100, 8, { marker: "W" })], [set("marked-only", 100, 8, { marker: "D" })]]) {
    const records = [record("usable", "2026-09-28", [exercise("usable", [set("usable-set", 100, 10)])]),
      record("presence-only", "2026-10-02", [exercise("presence-only", unavailable)]),
      record("current", day, [exercise("current", [set("current-set", 100, 12)])])];
    const result = coach(records), value = meaning(result);
    assert.equal(value.reference.sessionId, "usable");
    assert.equal(value.evidence.comparisons[0].date, "2026-09-28");
    assert.deepEqual(value.evidence.comparisons[0].previousSetIds, ["usable-set"]);
    assert.match(value.observations.join(" "), /10회에서 12회/);
    assert.equal(result.rows[0].progression.historyCoverage.exerciseDayCount, 3);
    assert.equal(records[1].exercises[0].sets.length, unavailable.length);
  }
});

test("presence-only regular history is not falsely described as a different training purpose", () => {
  const result = coach([record("presence-only", "2026-10-02", [exercise("presence-only", [])], { trainingIntent: "regular" }),
    record("current", day, [exercise("current", [set("current-set", 100, 12)])])]);
  const value = meaning(result);
  assert.equal(value.reference, null);
  assert.notEqual(value.evidence.referenceStatus, "purpose-only");
  assert.doesNotMatch(value.evidence.summary + " " + value.observations.join(" "), /다른 목적|디로드|테스트/);
  assert.match(value.nextAction.body, /100kg × 12회/);
});

test("historical observation and actions do not borrow subsequent pain or sets", () => {
  const records = [record("historical", "2026-10-01", [exercise("historical-squat", [set("historical-set", 100, 8)])]),
    record("future-pain", day, [exercise("future-squat", [set("future-set", 999, 2)])], { pain: "stop" })];
  const older = coach(records, { sessionId: "historical" }), current = coach(records);
  assert.notEqual(meaning(older).nextAction.kind, "individual-care");
  assert.doesNotMatch(JSON.stringify(older), /future-pain|future-set|999/);
  assert.equal(meaning(current).nextAction.kind, "individual-care");
  assert.match(meaning(current).nextAction.body, /통증/);
});

test("an exact performed assignment distinguishes intended low reps from missed higher-rep targets", () => {
  const actual = record("actual", day, [exercise("squat", [set("actual-set", 120, 3)])]);
  const expectedLow = coach([actual], { planning: { schedule: [assignment(actual, { prescription: { exercises: [target("low", { repsMin: 3, repsMax: 3 })] } })] } });
  const missedHigh = coach([actual], { planning: { schedule: [assignment(actual)] } });
  assert.ok(hasPlan(meaning(expectedLow)));
  assert.notEqual(meaning(expectedLow).nextAction.kind, "plan-check");
  assert.match(meaning(expectedLow).observations.join(" "), /3~3회 범위 안/);
  assert.equal(meaning(missedHigh).nextAction.kind, "plan-check");
  assert.match(meaning(missedHigh).nextAction.body, /8~12회.*120kg × 3회/);
  assert.equal(actual.exercises[0].sets[0].reps, 3);
});

test("an active template without an exact performed link is not treated as the actual session target", () => {
  const actual = record("actual", day, [exercise("squat", [set("actual-set", 120, 3)])]);
  for (const planning of [
    { activeProgramId: "program", programs: [{ id: "program", days: [{ exercises: [target()] }] }], schedule: [] },
    { schedule: [assignment(actual, { date: "2026-10-05" })] },
    { schedule: [assignment(actual, { status: "planned" })] },
    { schedule: [assignment(actual, { recordId: "different-record" })] },
    { schedule: [assignment(actual), assignment(actual, { id: "duplicate-link" })] }
  ]) {
    const value = meaning(coach([actual], { planning }));
    assert.equal(hasPlan(value), false);
    assert.notEqual(value.nextAction.kind, "plan-check");
  }
});

test("a device-unspecified planned exercise does not assign one goal to multiple actual device blocks", () => {
  const actual = record("actual", day, [exercise("device-A", [set("device-A-set", 120, 3)]), exercise("device-B", [set("device-B-set", 90, 5)], { equipmentKey: "rack-B" })]);
  const result = coach([actual], { planning: { schedule: [assignment(actual)] } });
  assert.ok(result.rows.every(row => !hasPlan(row.interpretation)));
  assert.ok(result.rows.every(row => row.interpretation.nextAction.kind !== "plan-check"));
});

test("a device-specific planned exercise is applied only to its unique actual block", () => {
  const actual = record("actual", day, [exercise("device-A", [set("device-A-set", 120, 3)]), exercise("device-B", [set("device-B-set", 90, 5)], { equipmentKey: "rack-B" })]);
  const result = coach([actual], { planning: { schedule: [assignment(actual, { prescription: { exercises: [target("target-A", { equipmentKey: "rack-A", loadConvention: "total" })] } })] } });
  assert.equal(meaning(result, "device-A").nextAction.kind, "plan-check");
  assert.ok(hasPlan(meaning(result, "device-A")));
  assert.equal(hasPlan(meaning(result, "device-B")), false);
  assert.notEqual(meaning(result, "device-B").nextAction.kind, "plan-check");
});

test("repeated actual blocks or repeated planned targets do not acquire an arbitrary goal association", () => {
  const actual = record("actual", day, [exercise("first", [set("first-set", 120, 3)]), exercise("second", [set("second-set", 100, 6)])]);
  const repeatedActual = coach([actual], { planning: { schedule: [assignment(actual)] } });
  assert.ok(repeatedActual.rows.every(row => !hasPlan(row.interpretation)));
  const single = record("single", day, [exercise("only", [set("only-set", 120, 3)])]);
  const repeatedPlan = coach([single], { planning: { schedule: [assignment(single, { prescription: { exercises: [target("first-target"), target("second-target")] } })] } });
  assert.equal(hasPlan(meaning(repeatedPlan)), false);
});

test("extra general sets do not become failed planned sets after the prescribed work was completed", () => {
  const actual = record("actual", day, [exercise("squat", [set("planned-1", 100, 10), set("planned-2", 100, 10), set("planned-3", 100, 10), set("extra", 100, 4)])]);
  const result = coach([actual], { planning: { schedule: [assignment(actual, { prescription: { exercises: [target("three-work-sets", { sets: 3 })] } })] } });
  const value = meaning(result);
  assert.ok(hasPlan(value));
  assert.notEqual(value.nextAction.kind, "plan-check");
  assert.doesNotMatch(value.observations.join(" "), /계획의 8~12회 범위와 다른 세트/);
  assert.equal(result.rows[0].sets[3].reps, 4);
});

test("known planned upper repetitions are respected even when the latest set has no feedback", () => {
  const actual = record("actual", day, [exercise("squat", [set("above-range", 100, 15)])]);
  const value = meaning(coach([actual], { planning: { schedule: [assignment(actual)] } }));
  assert.ok(hasPlan(value));
  assert.doesNotMatch(value.nextAction.body, /1회 더|16회/);
  assert.match(value.nextAction.body, /8~12회|반복 상단|반복 범위/);
});

test("comfortable feedback on the last backoff set changes only that set without turning every RIR into known effort", () => {
  const sets = topBackoff(), actual = record("actual", day, [exercise("squat", sets, { feedback: { setId: sets[2].id, feeling: "comfortable", loadKg: sets[2].loadKg, reps: sets[2].reps } })]);
  const before = structuredClone(actual), result = coach([actual]), value = meaning(result);
  assert.equal(value.nextAction.kind, "reps-option");
  assert.match(value.nextAction.body, /100kg × 4회.*이 세트만 5회/);
  assert.doesNotMatch(value.nextAction.body, /120kg × 4회|120kg.*여유가 있었/);
  assert.ok(result.rows[0].sets.every(row => row.rir === null));
  assert.deepEqual(result.rows[0].sets.map(row => row.reps), [3, 6, 4]);
  assert.equal(value.nextAction.provisional, true);
  assert.equal(result.sessionCoaching.composition.blocks[0].workingSets, 3);
  assert.deepEqual(actual, before);
});

test("comfortable feedback on the earlier backoff set anchors pacing to that load segment, not to the heavy lead", () => {
  const sets = topBackoff(), actual = record("actual", day, [exercise("squat", sets, { feedback: { setId: sets[1].id, feeling: "comfortable", loadKg: sets[1].loadKg, reps: sets[1].reps } })]);
  const value = meaning(coach([actual]));
  assert.equal(value.nextAction.kind, "repeat");
  assert.match(value.nextAction.body, /100kg × 6회.*같은 중량의 뒤 기록은 4회/);
  assert.doesNotMatch(value.nextAction.body, /120kg × 3회에는 여유/);
});

test("comfortable heavy-lead feedback does not get misread as comfortable feedback on the first backoff set", () => {
  const sets = topBackoff(), actual = record("actual", day, [exercise("squat", sets, { feedback: { setId: sets[0].id, feeling: "comfortable", loadKg: sets[0].loadKg, reps: sets[0].reps } })]);
  const value = meaning(coach([actual]));
  assert.equal(value.nextAction.kind, "reps-option");
  assert.match(value.nextAction.body, /120kg × 3회.*이 세트만 4회/);
  assert.doesNotMatch(value.nextAction.body, /같은 중량의 뒤 기록은 4회/);
});

test("stable heavy and backoff structures retain both roles rather than being overwritten by a first-set-only trend", () => {
  const records = [record("first", "2026-09-28", [exercise("first", topBackoff("first"))]), record("second", "2026-10-02", [exercise("second", topBackoff("second"))]),
    record("third", day, [exercise("third", topBackoff("third"))])];
  const value = meaning(coach(records, { profile: { goal: "lose" } }));
  assert.match(value.coaching.assessment, /120kg × 3회/);
  assert.match(value.coaching.assessment, /100kg.*6·4회/);
  assert.deepEqual(value.nextAction.proposal, { kind: "single-set-reps", setId: "third-backoff-1", loadKg: 100, baseReps: 4, targetReps: 5 });
  assert.deepEqual(value.coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), [[120, 3], [100, 6], [100, 4]]);
  assert.doesNotMatch(value.observations.join(" "), /최근 세 번의 첫 일반 세트/);
});

test("stable straight sets with a losing-weight goal allow a small choice while keeping maintenance valid", () => {
  const records = ["2026-09-28", "2026-10-02", day].map((date, index) => record("stable-" + index, date, [exercise("squat-" + index, [set("set-" + index, 100, 8)])]));
  const value = meaning(coach(records, { profile: { goal: "lose" } }));
  assert.match(value.nextAction.body, /감량 중/);
  assert.match(value.nextAction.body, /유지하는 것도 선택|회복과 세트 여유/);
  assert.deepEqual(value.nextAction.proposal, { kind: "single-set-reps", setId: "set-2", loadKg: 100, baseReps: 8, targetReps: 9 });
});

test("whole-session composition contains every block while focused advice remains explicitly bounded", () => {
  const exercises = [exercise("squat", topBackoff()), exercise("press", [set("press-set", 110, 15)], { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "press-A" }),
    exercise("curl", [set("curl-set", 30, 12)], { rawName: "레그 컬", exerciseId: "leg_curl", equipmentKey: "curl-A" }), exercise("extension", [], { rawName: "레그 익스텐션", exerciseId: "leg_extension", equipmentKey: "extension-A" }),
    exercise("calf", [set("calf-set", 50, null)], { rawName: "카프 레이즈", exerciseId: "calf_raise", equipmentKey: "calf-A" }), exercise("unknown", [set("unknown-set", null, 10)], { rawName: "개인 운동", exerciseId: null, equipmentKey: null, loadRole: "unknown" })];
  const result = coach([record("whole", day, exercises)]);
  assert.deepEqual(result.sessionCoaching.composition.blocks.map(row => row.blockId), exercises.map(row => row.id));
  assert.equal(result.sessionCoaching.composition.blocks.find(row => row.blockId === "calf").workingSets, 0);
  for (const block of result.sessionCoaching.composition.blocks) assert.ok(result.sessionCoaching.composition.summary.includes(block.label));
  assert.equal(result.rows.length, 6);
  assert.equal(result.sessionCoaching.focus.length, 2);
  assert.equal(result.sessionCoaching.actions.length, 2);
  assert.equal(meaning(result, "extension").nextAction.kind, "log");
  assert.equal(result.rows.find(row => row.blockId === "calf").sets[0].reps, null);
});

test("record structure and numeric change do not manufacture growth, strength, fatigue or energy estimates", () => {
  const records = [record("prior", "2026-10-01", [exercise("prior", [set("prior-set", 100, 10)])]),
    record("current", day, [exercise("current", topBackoff())])];
  const result = coach(records), value = meaning(result), serialized = JSON.stringify(value);
  assert.equal(value.basis, "record-observation");
  assert.doesNotMatch(serialized, /e1rm|estimated1rm|growthRate|fatigueRate|estimatedStrength|estimatedKcal/i);
  assert.doesNotMatch(value.summary + " " + value.observations.join(" ") + " " + value.nextAction.body, /근성장.*\d.*%|근력.*\d.*%|피로.*\d.*%/);
  assert.equal(result.rows[0].progression.status, "incomparable");
  assert.ok(value.nextAction.provisional);
  for (const pair of value.evidence.comparisons) {
    assert.ok(pair.setIds.every(id => records[1].exercises[0].sets.some(row => row.id === id)));
    assert.ok(pair.previousSetIds.every(id => records[0].exercises[0].sets.some(row => row.id === id)));
  }
});

test("plan-aware advice is read-only for both saved targets and the actual performed set values", () => {
  const sets = [set("actual-set", 120, 3)], actual = record("actual", day, [exercise("squat", sets, { feedback: { setId: sets[0].id, feeling: "comfortable", loadKg: 120, reps: 3 } })]);
  const planning = { schedule: [assignment(actual, { prescription: { exercises: [target("low", { repsMin: 3, repsMax: 3, loadKg: 120, equipmentKey: "rack-A", loadConvention: "total" })] } })] };
  const beforeActual = structuredClone(actual), beforePlanning = structuredClone(planning), result = coach([actual], { planning }), value = meaning(result);
  assert.equal(value.nextAction.kind, "load-option");
  assert.match(value.nextAction.body, /이 세트의 동작과 의도한 여유를 유지했다면/);
  assert.doesNotMatch(value.nextAction.body, /다른 계획 세트|나머지 세트/);
  assert.match(value.nextAction.body, /최소 부하 증가.*한꺼번에 올리지는/);
  assert.equal(Object.hasOwn(value.nextAction, "proposal"), false);
  assert.equal(value.nextAction.provisional, true);
  assert.equal(result.rows[0].sets[0].reps, 3);
  assert.equal(result.rows[0].sets[0].loadKg, 120);
  assert.equal(result.rows[0].sets[0].rir, null);
  assert.deepEqual(actual, beforeActual);
  assert.deepEqual(planning, beforePlanning);
});

test("marked-only blocks keep their actual numbers but do not become invented general-set baselines", () => {
  const actual = record("marked", day, [exercise("squat", [set("warm", 100, 8, { marker: "W" }), set("drop", 80, 12, { marker: "D" }), set("custom", 90, 6, { marker: "A" })])]);
  const result = coach([actual]), value = meaning(result);
  assert.equal(value.structure.kind, "empty");
  assert.equal(value.nextAction.kind, "log");
  assert.equal(result.sessionCoaching.composition.blocks[0].workingSets, 0);
  assert.match(value.summary, /80kg.*12회/);
  assert.match(value.summary, /90kg.*6회/);
  assert.equal(result.rows[0].sets[2].marker, "A");
  assert.doesNotMatch(value.nextAction.body, /첫 일반 세트는 100kg/);
});

test("switching from straight work to a heavier top/backoff structure is not automatically called a lighter session", () => {
  const records = [record("prior", "2026-10-01", paired("prior", [[100, 10], [100, 8], [100, 7]])),
    record("current", day, paired("current", [[120, 3], [100, 6], [100, 4]]))];
  const result = coach(records);
  assert.equal(result.sessionCoaching.pattern, "ordinary");
  assert.equal(result.sessionCoaching.question, null);
  assert.ok(result.rows.every(row => row.interpretation.nextAction.kind !== "check-intent"));
  assert.ok(result.rows.every(row => row.interpretation.structure.kind === "top-backoff-candidate"));
});

test("same-structure higher loads and lower repetitions are a dosage tradeoff, not an automatic deload prompt", () => {
  const result = coach([record("prior", "2026-10-01", paired("prior", [[50, 12], [50, 12]])),
    record("current", day, paired("current", [[60, 6], [60, 6]]))]);
  assert.equal(result.sessionCoaching.pattern, "ordinary");
  assert.equal(result.sessionCoaching.question, null);
  assert.ok(result.rows.every(row => row.interpretation.evidence.comparisons.some(pair => pair.sameRole === false)));
});

test("substantially lowered loads or fewer sets across multiple exercises still invite a brief purpose clarification", () => {
  for (const current of [[[50, 10], [50, 10], [50, 10]], [[100, 10]]]) {
    const result = coach([record("prior", "2026-10-01", paired("prior", [[100, 10], [100, 10], [100, 10]])),
      record("current", day, paired("current", current))]);
    assert.equal(result.sessionCoaching.pattern, "broad-reduction");
    assert.equal(result.sessionCoaching.question.id, "session-intent");
    assert.ok(result.rows.every(row => row.interpretation.nextAction.kind === "check-intent"));
    assert.doesNotMatch(result.sessionCoaching.summary, /부상|과훈련|회복 실패/);
  }
});

test("less assistance and fewer sets are a difficulty-volume tradeoff rather than automatically lighter work", () => {
  const assisted = (prefix, help, count) => ["assisted_pull_up", "assisted_dip"].map((exerciseId, index) => exercise(prefix + "-" + index,
    Array.from({ length: count }, (_, setIndex) => set(prefix + "-" + index + "-" + setIndex, help, 10)),
    { rawName: index ? "보조 딥" : "보조 풀업", exerciseId, equipmentKey: "assisted-machine-" + index, loadConvention: "as-recorded", loadRole: "assistance" }));
  const result = coach([record("prior", "2026-10-01", assisted("prior", 60, 3)), record("current", day, assisted("current", 40, 1))]);
  assert.equal(result.sessionCoaching.pattern, "ordinary");
  assert.equal(result.sessionCoaching.question, null);
  assert.ok(result.rows.every(row => row.interpretation.evidence.context.some(item => item.label === "kg 의미")));
});

test("more assistance and fewer sets may ask the purpose of reduced work without treating helper kg as lifted kg", () => {
  const assisted = (prefix, help, count) => ["assisted_pull_up", "assisted_dip"].map((exerciseId, index) => exercise(prefix + "-" + index,
    Array.from({ length: count }, (_, setIndex) => set(prefix + "-" + index + "-" + setIndex, help, 10)),
    { rawName: index ? "보조 딥" : "보조 풀업", exerciseId, equipmentKey: "assisted-machine-" + index, loadConvention: "as-recorded", loadRole: "assistance" }));
  const result = coach([record("prior", "2026-10-01", assisted("prior", 60, 3)), record("current", day, assisted("current", 80, 1))]);
  assert.equal(result.sessionCoaching.pattern, "broad-reduction");
  assert.equal(result.sessionCoaching.question.id, "session-intent");
  assert.ok(result.sessionCoaching.reducedExercises.every(row => row.loadRatio === null));
  assert.ok(result.rows.every(row => row.sets[0].loadKg === 80));
});
