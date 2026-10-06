"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const T = require("../src/training.js");
const set = (id, loadKg = 50, reps = 10, extras = {}) => ({ id, loadKg, reps, marker: null, rir: null, ...extras });
function exercise(id = "bench", extras = {}) {
  return { id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "rack-A", loadConvention: "total", loadRole: "external", durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [set(id + ":s")], notes: "", ...extras };
}
function record(id, date, exercises = [exercise()], extras = {}) {
  return { id, date, time: null, label: "합성 운동", durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, exercises, notes: "", effort: null, pain: null, sequence: { order: "listed", structure: "straight" }, ...extras };
}
const leg = (id, load = 100, count = 3, reps = 10) => [exercise(id + "p", { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "press-A", sets: Array.from({ length: count }, (_, i) => set(id + "p" + i, load, reps)) }), exercise(id + "c", { rawName: "레그 컬", exerciseId: "leg_curl", equipmentKey: "curl-A", sets: Array.from({ length: count }, (_, i) => set(id + "c" + i, load / 2, reps)) })];
const coach = (records, options = {}) => T.coachSession(T.analyze(records, { date: "2026-10-06", profile: options.profile, checkins: options.checkins }), options);
const first = value => value.rows[0].interpretation;

test("first records produce a concrete next trial without profile, RIR or earlier sessions", () => {
  const records = [record("first", "2026-10-06")], before = JSON.stringify(records);
  const value = coach(records);
  assert.match(first(value).summary, /50kg.*10회/);
  assert.match(first(value).nextAction.body, /50kg × 10회/);
  assert.equal(first(value).nextAction.provisional, true);
  assert.equal(value.rows[0].progression.status, "insufficient");
  assert.equal(value.rows[0].sets[0].rir, null);
  assert.equal(JSON.stringify(records), before);
});
test("all sets, not a highest load test, define the next starting point", () => {
  const value = coach([record("last", "2026-10-06", [exercise("b", { sets: [set("a", 50, 12), set("b", 50, 10), set("c", 50, 8), set("peak", 100, 1)] })])]);
  assert.match(first(value).summary, /50kg × 12회.*100kg × 1회/);
  assert.match(first(value).nextAction.body, /첫 일반 세트는 50kg × 12회/);
  assert.equal(value.rows[0].progression.current.loadKg, 100);
});
test("a first low-rep maximum-like record does not become an instruction to repeat its load", () => {
  const value = coach([record("test", "2026-10-06", [exercise("b", { sets: [set("s", 100, 1)] })])]);
  assert.equal(first(value).nextAction.kind, "practice");
  assert.match(first(value).nextAction.body, /곧바로 다음 시작값으로 쓰지 말고/);
});
test("RIR missing keeps raw change and current trial useful, without promoting strict strength judgment", () => {
  const value = coach([record("a", "2026-10-01"), record("b", "2026-10-06", [exercise("b", { sets: [set("b:s", 50, 12)] })])]);
  assert.match(first(value).observations.join(" "), /10회에서 12회로 늘었어요/);
  assert.equal(value.rows[0].progression.status, "incomparable");
  assert.equal(first(value).reference.sessionId, "a");
  assert.match(first(value).nextAction.body, /50kg × 12회/);
});
test("one preceding rep change no longer erases the later exercise observation history", () => {
  const rows = [record("a", "2026-10-01", [exercise("a1"), exercise("a2", { exerciseId: "leg_curl", rawName: "레그 컬", equipmentKey: "curl-A" })]), record("b", "2026-10-06", [exercise("b1", { sets: [set("b1s", 50, 11)] }), exercise("b2", { exerciseId: "leg_curl", rawName: "레그 컬", equipmentKey: "curl-A", sets: [set("b2s", 50, 12)] })])];
  const value = coach(rows).rows.find(row => row.blockId === "b2");
  assert.equal(value.progression.previous, null);
  assert.equal(value.interpretation.reference.sessionId, "a");
  assert.equal(value.interpretation.reference.contextMatched, false);
  assert.match(value.interpretation.observations.join(" "), /10회에서 12회/);
});
test("separate machines keep parallel personal starting points", () => {
  const rows = [record("a", "2026-10-01", [exercise("a", { equipmentKey: "machine-A" })]), record("b", "2026-10-02", [exercise("b", { equipmentKey: "machine-B", sets: [set("bs", 80)] })]), record("last", "2026-10-06", [exercise("lastA", { equipmentKey: "machine-A" }), exercise("lastB", { equipmentKey: "machine-B", sets: [set("lastBs", 80)] })])];
  const value = coach(rows);
  assert.deepEqual(value.rows.map(row => row.interpretation.reference.sessionId), ["a", "b"]);
  assert.match(value.rows[0].interpretation.nextAction.body, /50kg/);
  assert.match(value.rows[1].interpretation.nextAction.body, /80kg/);
});
test("new machine uses its actual baseline without converting the old machine's kg", () => {
  const value = coach([record("old", "2026-10-01"), record("new", "2026-10-06", [exercise("n", { equipmentKey: "rack-B", sets: [set("ns", 30)] })])]);
  assert.equal(first(value).reference, null);
  assert.match(first(value).observations.join(" "), /이 장비의 출발 기록/);
  assert.match(first(value).nextAction.body, /30kg/);
});
test("repeated same-device blocks do not select an arbitrary historical counterpart", () => {
  for (const rows of [
    [record("a", "2026-10-01"), record("last", "2026-10-06", [exercise("one"), exercise("two")])],
    [record("a", "2026-10-01", [exercise("one"), exercise("two")]), record("last", "2026-10-06")]
  ]) assert.equal(first(coach(rows)).reference, null);
});
test("same-day sessions, future sessions and historical review do not borrow later or same-day performance", () => {
  const records = [record("older", "2026-10-01"), record("early", "2026-10-06"), record("late", "2026-10-06", [exercise("late", { sets: [set("lateS", 999)] })]), record("future", "2026-10-07")];
  assert.equal(first(coach(records, { sessionId: "early" })).reference.sessionId, "older");
  assert.doesNotMatch(JSON.stringify(coach(records, { sessionId: "older" })), /999|future|lateS/);
});
test("session-wide halved loads ask intent rather than diagnose injury or force deload", () => {
  const value = coach([record("a", "2026-10-01", leg("a")), record("b", "2026-10-06", leg("b", 50))]);
  assert.equal(value.sessionCoaching.pattern, "broad-reduction");
  assert.equal(value.sessionCoaching.question.id, "session-intent");
  assert.deepEqual(value.sessionCoaching.question.choices.map(row => row.value), ["deload", "technique", "time-limited", "regular"]);
  assert.doesNotMatch(value.sessionCoaching.summary, /부상|통증|회복 실패/);
});
test("each declared purpose changes next actions without changing the recorded loads", () => {
  for (const intent of Object.keys(T.intentLabels)) {
    const records = [record("a", "2026-10-01", leg("a")), record("b", "2026-10-06", leg("b", 50), { trainingIntent: intent })];
    const value = coach(records);
    assert.equal(value.sessionCoaching.question, null);
    assert.equal(value.sessionCoaching.intent, intent);
    assert.equal(value.rows[0].sets[0].loadKg, 50);
    assert.equal(first(value).nextAction.kind, intent === "regular" ? "check-intent" : intent);
  }
});
test("planned deloads do not replace the later regular baseline or count as strict repeated decline", () => {
  const records = [record("a", "2026-09-26", leg("a")), record("d", "2026-10-01", leg("d", 50), { trainingIntent: "deload" }), record("r", "2026-10-06", leg("r"), { trainingIntent: "regular" })];
  const value = coach(records);
  assert.equal(first(value).reference.sessionId, "a");
  assert.equal(value.rows[0].progression.previous.sessionId, "a");
  assert.equal(value.rows[0].progression.repeatedDecline, false);
  assert.equal(value.sessionCoaching.pattern, "ordinary");
});
test("reduced sets or reps across multiple exercises can ask the same purpose question", () => {
  for (const reduced of [leg("b", 100, 1), leg("b", 100, 3, 5)]) {
    assert.equal(coach([record("a", "2026-10-01", leg("a")), record("b", "2026-10-06", reduced)]).sessionCoaching.question.id, "session-intent");
  }
});
test("ordinary diary labels can suggest intent before load-role and physical-machine confirmation", () => {
  const unknown = exercises => exercises.map(ex => ({ ...ex, loadRole: "unknown", equipmentKey: null, loadConvention: "as-recorded" }));
  const value = coach([record("a", "2026-10-01", unknown(leg("a"))), record("b", "2026-10-06", unknown(leg("b", 50)))]);
  assert.equal(value.sessionCoaching.question.id, "session-intent");
  assert.equal(value.rows[0].progression.status, "incomparable");
  assert.equal(value.session.exercises[0].loadRole, "unknown");
});
test("one exercise drop, changed machines, assistance, ambiguous repetitions and incomplete reps do not create broad-deload detection", () => {
  const scenarios = [
    [exercise("b", { sets: [set("s", 25)] })],
    leg("b", 50).map(ex => ({ ...ex, equipmentKey: ex.equipmentKey + "different" })),
    leg("b", 50).map(ex => ({ ...ex, loadRole: "assistance" })),
    [leg("b", 50)[0], leg("b", 50)[0], leg("b", 50)[1]],
    leg("b", 50).map(ex => ({ ...ex, sets: [...ex.sets, set(ex.id + "unknown", null, null)] }))
  ];
  for (const reduced of scenarios) assert.equal(coach([record("a", "2026-10-01", leg("a")), record("b", "2026-10-06", reduced)]).sessionCoaching.question, null);
});
test("set-bound feeling changes one provisional trial, never all-set RIR", () => {
  for (const [feeling, kind] of [["comfortable", "reps-option"], ["hard", "repeat"], ["limit", "ease"]]) {
    const ex = exercise("b", { sets: [set("first", 60, 12), set("last", 50, 8)], feedback: { setId: "last", feeling, loadKg: 50, reps: 8 } });
    const value = coach([record("a", "2026-10-06", [ex])]);
    assert.equal(first(value).nextAction.kind, kind);
    assert.match(first(value).nextAction.body, /50kg × 8회/);
    if (feeling === "comfortable") assert.match(first(value).nextAction.body, /이 세트만 9회/);
    assert.deepEqual(value.rows[0].sets.map(set => set.rir), [null, null]);
  }
});
test("stale, missing, marked and changed feedback does not affect advice", () => {
  for (const feedback of [null, { setId: "missing", feeling: "comfortable", loadKg: 50, reps: 10 }, { setId: "b:s", feeling: "comfortable", loadKg: 55, reps: 10 }]) {
    assert.equal(first(coach([record("a", "2026-10-06", [exercise("b", { feedback })])])).nextAction.kind, "repeat");
  }
});
test("assistance and unknown roles never receive external-weight easing or minimum increase direction", () => {
  for (const role of ["assistance", "unknown"]) {
    for (const feeling of ["limit", "comfortable"]) {
      const ex = exercise("b", { loadRole: role, feedback: { setId: "b:s", feeling, loadKg: 50, reps: 10 } });
      const action = first(coach([record("a", "2026-10-06", [ex])])).nextAction;
      assert.doesNotMatch(action.body, /중량을 낮춰|최소 증량/);
      if (role === "assistance" && feeling === "limit") assert.match(action.body, /보조를 더 받는/);
    }
  }
});
test("bodyweight/null loads remain unknown and still permit repetition coaching", () => {
  const ex = exercise("b", { rawName: "푸쉬 업", exerciseId: "push_up", equipmentKey: null, loadConvention: "bodyweight", loadRole: "unknown", sets: [set("s", null, 12)] });
  const value = coach([record("a", "2026-10-06", [ex])]);
  assert.equal(value.rows[0].sets[0].loadKg, null);
  assert.match(first(value).summary, /12회/);
  assert.doesNotMatch(first(value).nextAction.body, /0kg|체중.*kg/);
});
test("more assistance with fewer reps never recommends the old smaller assistance as an easier fallback", () => {
  const build = (id, loadKg, reps) => exercise(id, { exerciseId: "pull_up", rawName: "어시스트 풀업", equipmentKey: "assist-A", loadRole: "assistance", sets: [set(id + "s", loadKg, reps)] });
  const value = first(coach([record("a", "2026-10-01", [build("a", 30, 10)]), record("b", "2026-10-06", [build("b", 50, 6)])]));
  assert.doesNotMatch(value.nextAction.body, /이전 30kg|무게와 반복을 동시에 올리지/);
  assert.match(value.nextAction.body, /50kg × 6회/);
});
test("a steep set repetition fall suggests pacing rather than asserting fatigue causation", () => {
  const ex = exercise("b", { sets: [set("a", 50, 12), set("b", 50, 8), set("c", 50, 6)] });
  const value = first(coach([record("a", "2026-10-06", [ex])]));
  assert.match(value.summary, /12·8·6회/);
  assert.match(value.nextAction.body, /회복 시간을 충분히/);
  assert.doesNotMatch(value.observations.join(" "), /피로 때문에|회복 실패/);
});
test("comfortable first set plus steep later rep loss gives one coherent pacing action", () => {
  const ex = exercise("b", { sets: [set("first", 40, 12), set("last", 40, 8)], feedback: { setId: "first", feeling: "comfortable", loadKg: 40, reps: 12 } });
  const value = first(coach([record("a", "2026-10-06", [ex])]));
  assert.equal(value.nextAction.kind, "repeat");
  assert.match(value.nextAction.body, /첫 세트를 늘리기보다/);
  assert.doesNotMatch(value.nextAction.body, /13회|최소 증량/);
  ex.feedback = { setId: "last", feeling: "comfortable", loadKg: 40, reps: 8 };
  const tail = first(coach([record("a", "2026-10-06", [ex])]));
  assert.equal(tail.nextAction.kind, "reps-option");
  assert.match(tail.nextAction.body, /이 세트만 9회/);
});
test("three stable starts reflect maintain/cut goals without calling stagnation", () => {
  for (const goal of ["maintain", "cut", "gain"]) {
    const value = first(coach([record("a", "2026-09-26"), record("b", "2026-10-01"), record("c", "2026-10-06")], { profile: { goal } }));
    assert.match(value.observations.join(" "), /최근 세 번/);
    assert.match(value.nextAction.body, goal === "gain" ? /한 세트에만 1회/ : /매번 중량을 올릴 필요는/);
    assert.doesNotMatch(value.summary, /정체/);
  }
});
test("repeated raw decreases without RIR still give a practical review, not a diagnosis", () => {
  const rows = [12, 10, 8].map((reps, index) => record(String(index), ["2026-09-26", "2026-10-01", "2026-10-06"][index], [exercise("b", { sets: [set("s", 50, reps)] })]));
  const value = first(coach(rows));
  assert.equal(value.nextAction.kind, "review-recovery");
  assert.match(value.nextAction.body, /50kg × 8회/);
  assert.doesNotMatch(value.nextAction.body, /부상|디로드해야|회복 실패/);
});
test("zero RIR and test-like low reps are not overridden by stable-history suggestions", () => {
  for (const [reps, rir, kind] of [[10, 0, "ease"], [1, null, "practice"]]) {
    const rows = ["2026-09-26", "2026-10-01", "2026-10-06"].map((date, index) => record(String(index), date, [exercise("b", { sets: [set("s", 50, reps, { rir })] })]));
    assert.equal(first(coach(rows)).nextAction.kind, kind);
  }
});
test("pain and clinical care override positive feedback and detected deload questions", () => {
  for (const [extras, profile] of [[{ pain: "stop" }, {}], [{ pain: "mild" }, {}], [{}, { age: 16 }], [{}, { healthContext: "clinical" }]]) {
    const value = coach([record("a", "2026-10-01", leg("a")), record("b", "2026-10-06", leg("b", 50), extras)], { profile });
    assert.equal(value.sessionCoaching.question, null);
    assert.equal(first(value).nextAction.kind, "individual-care");
    assert.doesNotMatch(first(value).nextAction.body, /1회 더|증량을/);
  }
});
test("empty, warmup-only, marked-only and missing rep records retain observations and actionable intake", () => {
  for (const sets of [[], [set("s", 50, 10, { marker: "W" })], [set("s", 50, 10, { marker: "D" })], [set("s", null, null)]]) {
    const value = coach([record("a", "2026-10-06", [exercise("b", { sets })])]);
    assert.equal(first(value).nextAction.kind, "log");
    assert.doesNotMatch(first(value).nextAction.body, /1회 더|증량/);
  }
});
test("invalid optional options and empty analysis return safely", () => {
  assert.equal(T.coachSession(null, null).sessionCoaching, null);
  assert.equal(T.coachSession({}, []).session, null);
});
test("duplicate source copies preserve annotation conflicts instead of choosing a deload purpose or feeling", () => {
  const source = { kind: "image", hash: "a".repeat(64), paths: [], uncertainties: [], revision: null };
  for (const [left, right] of [["regular", "deload"], [undefined, "deload"]]) {
    const rows = [record("a", "2026-10-06", [exercise()], { source, ...(left ? { trainingIntent: left } : {}) }), record("b", "2026-10-06", [exercise()], { source, trainingIntent: right })];
    assert.equal(T.analyze(rows, { date: "2026-10-06" }).coverage.excludedRecords, 2);
  }
  const a = exercise("a", { feedback: { setId: "a:s", feeling: "hard", loadKg: 50, reps: 10 } });
  const b = exercise("b", { feedback: { setId: "b:s", feeling: "hard", loadKg: 50, reps: 10 } });
  const rows = [record("a", "2026-10-06", [a], { source }), record("b", "2026-10-06", [b], { source })];
  assert.equal(T.analyze(rows, { date: "2026-10-06" }).coverage.duplicateRecords, 1);
  b.feedback.feeling = "comfortable";
  assert.equal(T.analyze(rows, { date: "2026-10-06" }).coverage.excludedRecords, 2);
});
test("legacy aggregate and missing repetitions never become a claim of zero work", () => {
  const legacy = coach([record("a", "2026-10-06", [], { source: { kind: "legacy-ocr" } })]);
  assert.doesNotMatch(legacy.sessionCoaching.summary, /0종목|0세트/);
  const partial = coach([record("a", "2026-10-06", [exercise("b", { sets: [set("s", null, null)] })])]);
  assert.doesNotMatch(partial.sessionCoaching.summary, /0세트/);
});
test("coaching handles a dense window without mutating the source or blocking the UI", () => {
  const records = Array.from({ length: 80 }, (_, day) => record("r" + day, day < 79 ? "2026-10-01" : "2026-10-06", Array.from({ length: 8 }, (_, index) => exercise(day + ":" + index, { equipmentKey: "rack" + index }))));
  const analysis = T.analyze(records, { date: "2026-10-06" }), before = JSON.stringify(analysis), start = performance.now();
  const value = T.coachSession(analysis);
  assert.equal(value.rows.length, 8);
  assert.ok(performance.now() - start < 1000);
  assert.equal(JSON.stringify(analysis), before);
});
