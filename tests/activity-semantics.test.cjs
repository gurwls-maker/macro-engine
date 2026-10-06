"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Activity = require("../src/activity-coaching.js");

const date = "2026-10-06";
const session = (id, sport = "running", durationMin = 60, details = {}, extra = {}) => ({ id, sport, durationMin, intensity: "moderate", details, ...extra });
const state = (entries, checkin = {}, profile = {}) => ({ profile: { age: 30, healthContext: "general", goal: "performance", ...profile },
  days: Object.fromEntries(entries.map(([day, sessions]) => [day, { date: day, sessions, ...(day === date ? { coachCheckin: checkin } : {}) }])) });
const latest = (value, at = date) => { const result = Activity.build(value, at); return result.current[0] || result.latest[0]; };
const text = row => [row.assessment, row.action.body, ...row.alternatives.map(action => action.body)].join(" ");
const series = (sport, details = {}) => [["2026-09-01", [session("first", sport, 60, details)]],
  ["2026-09-20", [session("second", sport, 60, details)]], [date, [session("current", sport, 60, details)]]];

test("a time-only first activity is useful without making missing metrics zero or confirming its purpose", () => {
  const input = state([[date, [session("first", "cycling", 35)]]]); input.profile = null;
  const row = latest(input);
  assert.equal(row.intent, "unknown"); assert.equal(row.action.kind, "repeat");
  assert.match(row.action.body, /35분/);
  for (const key of ["distanceM", "movingMin", "effortRpe", "avgHeartRateBpm", "avgPowerW", "paceMinPerKm"]) assert.equal(row.actual[key], null);
});

test("activity interpretation preserves original metrics and source dates without changing saved input", () => {
  const input = state([["2026-09-28", [session("prior", "running", 60, { distanceM: 10000, effortRpe: 5 })]],
    [date, [session("actual", "running", 55, { distanceM: 10000, effortRpe: 6 })]]]);
  const before = structuredClone(input), row = latest(input);
  assert.deepEqual(row.sources, [{ kind: "activity-session", date, sessionId: "actual" }, { kind: "activity-session", date: "2026-09-28", sessionId: "prior" }]);
  assert.equal(row.actual.distanceM, 10000); assert.equal(row.comparison.previous.actual.durationMin, 60);
  assert.deepEqual(input, before);
});

test("the current performed duration rather than the older smaller session starts a normal next trial", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 50)]], [date, [session("current", "cycling", 55)]]]));
  assert.equal(row.action.kind, "repeat"); assert.match(row.action.body, /55분/); assert.doesNotMatch(row.action.body, /50분/);
});

test("a newly supplied distance cannot be called a repeatedly stable distance from older time-only rows", () => {
  const row = latest(state([["2026-09-01", [session("first")]], ["2026-09-20", [session("second")]],
    [date, [session("current", "running", 60, { distanceM: 10000 })]]]));
  assert.notEqual(row.action.kind, "one-variable-option"); assert.doesNotMatch(row.action.body, /10km 기록이 여러 날/);
  assert.equal(row.comparison.previous.actual.distanceM, null);
});

test("multiple past sessions on one day do not manufacture repeated independent training days", () => {
  const row = latest(state([["2026-09-01", [session("first", "cycling"), session("second", "cycling")]], [date, [session("current", "cycling")]]]));
  assert.equal(row.comparison.previous, null); assert.equal(row.comparison.sameContextDays, 1);
  assert.notEqual(row.action.kind, "one-variable-option");
  assert.equal(new Set(row.sources.map(source => source.sessionId)).size, 3);
});

test("elapsed and moving-time pace records remain separate measurement contexts", () => {
  const row = latest(state([["2026-09-28", [session("prior", "running", 60, { distanceM: 10000 })]],
    [date, [session("current", "running", 60, { distanceM: 10000, movingMin: 50 })]]]));
  assert.equal(row.comparison.contextMatched, false); assert.equal(row.comparison.previous, null);
  assert.equal(row.actual.paceMinPerKm, 5); assert.ok(!row.comparison.observations.some(value => value.kind === "pace"));
});

test("different treadmill grades cannot turn a faster distance-time record into a same-condition comparison", () => {
  const cardio = gradePct => ({ environment: "treadmill", speedKmh: 10, gradePct });
  const row = latest(state([["2026-09-28", [session("prior", "running", 60, { distanceM: 10000 }, { cardio: cardio(0) })]],
    [date, [session("current", "running", 50, { distanceM: 10000 }, { cardio: cardio(5) })]]]));
  assert.equal(row.comparison.contextMatched, false); assert.notEqual(row.action.kind, "confirm-improvement");
  assert.equal(row.actual.cardio.gradePct, 5);
});

test("contradictory environment fields ask for the actual environment while preserving completed work", () => {
  const row = latest(state([[date, [session("current", "running", 40, { environment: "outdoor", distanceM: 6000 },
    { cardio: { environment: "treadmill", speedKmh: 9, gradePct: 0 } })]]]));
  assert.equal(row.action.kind, "confirm-environment"); assert.equal(row.actual.durationMin, 40);
  assert.equal(row.comparison.contextMatched, false); assert.deepEqual(row.alternatives, []);
});

test("a different cycling power measurement device does not supply an improvement baseline", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 60, { equipmentKey: "meter-A", avgPowerW: 180 })]],
    [date, [session("current", "cycling", 60, { equipmentKey: "meter-B", avgPowerW: 240 })]]]));
  assert.equal(row.comparison.contextMatched, false); assert.equal(row.comparison.previous, null);
  assert.ok(!row.comparison.observations.some(value => value.kind === "power")); assert.equal(row.actual.avgPowerW, 240);
});

test("swimming pool length and stroke form part of the observation context", () => {
  const row = latest(state([["2026-09-28", [session("prior", "swimming", 40, { distanceM: 2000, stroke: "freestyle", poolLengthM: 25 })]],
    [date, [session("current", "swimming", 35, { distanceM: 2000, stroke: "freestyle", poolLengthM: 50 })]]]));
  assert.equal(row.comparison.contextMatched, false); assert.ok(!row.comparison.observations.some(value => value.kind === "swim-pace"));
  assert.equal(row.actual.details.poolLengthM, 50);
});

test("open-water coaching prioritizes actual environment instead of instructing a pool pace", () => {
  const row = latest(state([[date, [session("current", "swimming", 40, { environment: "open-water", distanceM: 1500, stroke: "freestyle" })]]]));
  assert.match(row.action.body, /오픈워터|조류|시야|안전/); assert.doesNotMatch(row.action.body, /같은 영법·풀 조건/);
});

test("heart-rate changes alone preserve observations but do not diagnose disease, fitness or complete recovery", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 60, { avgHeartRateBpm: 130, effortRpe: 5 })]],
    [date, [session("current", "cycling", 60, { avgHeartRateBpm: 160, effortRpe: 5 })]]]));
  const observation = row.comparison.observations.find(value => value.kind === "avgHeartRateBpm");
  assert.equal(observation.previous, 130); assert.equal(observation.current, 160);
  assert.notEqual(row.action.kind, "higher-effort"); assert.doesNotMatch(text(row), /질병 때문|체력 향상 확정|회복 완료|위험률/);
});

test("higher reported effort with higher heart rate changes the next task without certifying its cause", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 60, { avgHeartRateBpm: 130, effortRpe: 5 })]],
    [date, [session("current", "cycling", 60, { avgHeartRateBpm: 160, effortRpe: 9 })]]]));
  assert.equal(row.action.kind, "higher-effort"); assert.match(row.action.body, /느낌 강도|심박수|시작 구간/);
  assert.doesNotMatch(text(row), /질병 때문|과훈련입니다|위험률/);
});

test("a faster race remains an event exposure rather than a command to repeat race intensity", () => {
  const row = latest(state([["2026-09-28", [session("prior", "running", 60, { format: "race", distanceM: 10000 })]],
    [date, [session("current", "running", 50, { format: "race", distanceM: 10000 })]]]));
  assert.equal(row.action.kind, "post-event"); assert.deepEqual(row.alternatives, []); assert.equal(row.question, null);
  assert.equal(row.actual.paceMinPerKm, 5); assert.match(row.action.body, /쉬운 운동|회복/);
});

test("an explicit reduced-work purpose does not become an unexplained decline or demand missed work be replaced", () => {
  const row = latest(state([["2026-09-28", [session("prior", "running", 60, { distanceM: 10000 })]],
    [date, [session("current", "running", 30, { distanceM: 5000, intent: "deload" })]]]));
  assert.equal(row.action.kind, "deload"); assert.equal(row.intent, "deload"); assert.equal(row.question, null);
  assert.match(row.action.body, /몰아 채우지/); assert.equal(row.actual.distanceM, 5000);
});

test("active illness or stop-level pain removes every exercise increase or reproduction alternative", () => {
  for (const checkin of [{ illness: "active" }, { pain: "stop" }]) {
    const row = latest(state(series("cycling"), checkin));
    assert.equal(row.action.kind, "stop"); assert.deepEqual(row.alternatives, []); assert.equal(row.question, null);
    assert.equal(row.actual.durationMin, 60); assert.match(row.action.body, /쉬|의료/);
  }
});

test("fatigue after a doubled session leaves only explicitly post-recovery alternatives, not the doubled repeat", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 60)]], [date, [session("current", "cycling", 120)]]], { fatigue: "high" }));
  assert.equal(row.action.kind, "current-recovery"); assert.ok(row.alternatives.length);
  assert.ok(row.alternatives.every(action => /돌아온 뒤|돌아오고/.test(action.title + action.body)));
  assert.ok(row.alternatives.every(action => !/이번 120분을 다음 출발점/.test(action.body)));
  assert.equal(row.actual.durationMin, 120);
});

test("illness recovery keeps symptom and next-day checks above an ordinary progression alternative", () => {
  const row = latest(state(series("running", { distanceM: 10000 }), { illness: "recovering" }));
  assert.equal(row.action.kind, "illness-return"); assert.deepEqual(row.alternatives, []);
  assert.match(row.action.body, /다음날|직후/); assert.doesNotMatch(row.action.body, /60~70%|10~20분/);
});

test("weight-maintenance and loss goals do not suppress an otherwise usable local sport progression option", () => {
  for (const goal of ["maintain", "lose", "performance"]) {
    const row = latest(state(series("cycling"), {}, { goal }));
    assert.equal(row.action.kind, "one-variable-option"); assert.match(row.action.body, /여유롭다면|한 가지만/);
  }
});

test("unrecorded time passing cannot change historical exposure into newly demonstrated repeated stability", () => {
  const input = state([["2026-09-23", [session("first", "cycling")]], ["2026-09-27", [session("second", "cycling")]],
    ["2026-09-30", [session("last", "cycling")]]]);
  const atPerformance = latest(input, "2026-09-30"), afterGap = latest(input, "2026-10-07");
  assert.equal(afterGap.date, "2026-09-30"); assert.equal(afterGap.action.kind, atPerformance.action.kind);
  assert.notEqual(afterGap.action.kind, "one-variable-option");
  assert.deepEqual(afterGap.sources, atPerformance.sources);
});

test("the latest historical activity stays historical with its real source date when today has no activity", () => {
  const value = Activity.build(state([["2026-09-28", [session("last", "swimming", 35)]]]), date);
  assert.deepEqual(value.current, []); assert.equal(value.latest[0].date, "2026-09-28");
  assert.equal(value.latest[0].sources[0].date, "2026-09-28"); assert.match(value.summary, /마지막 활동 2026-09-28/);
});

test("a change of sport preserves experience without converting previous-sport work into new-sport capacity", () => {
  const row = latest(state([["2026-09-28", [session("prior", "cycling", 90, { avgPowerW: 240 })]],
    [date, [session("current", "running", 30, { distanceM: 4500 })]]]));
  assert.equal(row.action.kind, "sport-transition"); assert.equal(row.comparison.previous, null);
  assert.match(row.action.body, /기존 종목.*바꾸지는/); assert.doesNotMatch(text(row), /240W.*환산|90분.*동등/);
});

const segment = (id, label, durationMin, extra = {}) => ({ id, label, kind: label === "Run" ? "running" : "station", durationMin, ...extra });
test("changed hybrid order and load are explicit context, not a fatigue explanation for slower station time", () => {
  const details = { label: "합성 복합 운동", format: "hybrid", sequenceConfirmed: true };
  const input = state([["2026-09-28", [session("prior", "mixed", 60, { ...details, segments: [segment("run-old", "Run", 10, { distanceM: 2000 }), segment("sled-old", "Sled", 10, { distanceM: 50, loadKg: 100 })] })]],
    [date, [session("current", "mixed", 60, { ...details, segments: [segment("sled-new", "Sled", 15, { distanceM: 50, loadKg: 150 }), segment("run-new", "Run", 10, { distanceM: 2000 })] })]]]);
  const before = structuredClone(input), row = latest(input), sled = row.comparison.observations.find(value => value.segmentId === "sled-new");
  assert.equal(row.comparison.contextMatched, false); assert.equal(sled.orderMatched, false);
  assert.deepEqual(sled.previous, { durationMin: 10, distanceM: 50, loadKg: 100 });
  assert.deepEqual(sled.current, { durationMin: 15, distanceM: 50, loadKg: 150 });
  assert.match(text(row), /100kg.*150kg/); assert.match(row.action.body, /순서.*바뀌/);
  assert.doesNotMatch(row.action.body, /앞 구간에서 힘을 모두 쓰지/); assert.deepEqual(input, before);
});

test("unknown hybrid sequence does not present its listed segments as confirmed performance order", () => {
  const row = latest(state([[date, [session("current", "mixed", 40, { format: "hybrid", sequenceConfirmed: false,
    segments: [segment("run", "Run", 15, { distanceM: 2000 }), segment("station", "Station", 10, { reps: 20, loadKg: 30 })] })]]]));
  assert.match(row.action.body, /실제 순서를 확인/); assert.doesNotMatch(row.action.body, /Run → Station|확인한 순서대로/);
  assert.equal(row.comparison.sameDaySequenceInferred, false);
});
