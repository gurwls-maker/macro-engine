"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const T = require("../src/training.js");
const Store = require("../src/training-store.js");
const Storage = require("../src/storage.js");

// Synthetic observations only; no private diary or image source is read.
const normalize = value => value.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function set(id, loadKg = 80, reps = 10, rir = 2) { return { id, loadKg, reps, marker: null, rir }; }
function exercise(id = "bench", overrides = {}) {
  return { id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "synthetic-rack-A", loadConvention: "total", loadRole: "external",
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [set(id + ":set")], notes: "", ...overrides };
}
function record(id = "last", date = "2026-10-06", exercises = [exercise()], overrides = {}) {
  return { id, date, time: "18:00", label: "합성 훈련", durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, exercises, notes: "", effort: null, pain: null,
    sequence: { order: "listed", structure: "straight" }, ...overrides };
}
function unknown(id = "unknown", overrides = {}) {
  return exercise(id, { rawName: "개인 특수 운동", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded", loadRole: "unknown", ...overrides });
}
function analyzed(records, date = "2026-10-06", mappings = []) { return T.analyze(records, { date, mappings }); }
function workspace(records = []) { const value = Store.createEmpty(); value.records = records; return value; }

test("review defaults are independent, tolerate absent legacy preferences and retain explicit main order", () => {
  assert.deepEqual(T.getReviewPreferences(), { order: "priority", mainExerciseKeys: [] });
  const prefs = freeze({ order: "diary", mainExerciseKeys: ["exercise:bench_press", "raw:개인운동", "exercise:bench_press"] });
  const value = T.getReviewPreferences(prefs);
  assert.deepEqual(value, { order: "diary", mainExerciseKeys: ["exercise:bench_press", "raw:개인운동"] });
  value.mainExerciseKeys.push("exercise:leg_curl");
  assert.equal(prefs.mainExerciseKeys.length, 3);
  assert.deepEqual(T.getReviewPreferences({ order: "volume", mainExerciseKeys: ["raw: ", "raw:Upper Case", "bad:key", null, "exercise:"] }), { order: "priority", mainExerciseKeys: [] });
});

test("missing analysis, empty sessions and invalid explicit selection do not invent a session", () => {
  for (const analysis of [null, {}, { sessions: [] }, { lastSession: record() }]) {
    assert.equal(T.reviewSession(analysis).session, null);
    assert.deepEqual(T.reviewSession(analysis).rows, []);
  }
  const analysis = analyzed([record()]);
  assert.equal(T.reviewSession(analysis, { sessionId: "absent" }).session, null);
  assert.equal(T.reviewSession(analysis, { sessionId: null }).session.id, "last");
});

test("default chooses the existing lastSession and does not use a detached session snapshot", () => {
  const analysis = analyzed([record("earlier", "2026-10-05"), record()]);
  analysis.lastSession = analysis.sessions[0];
  assert.equal(T.reviewSession(analysis).session.id, "earlier");
  analysis.lastSession = { id: "detached" };
  assert.equal(T.reviewSession(analysis).session.id, "last");
});

test("every original block remains visible including empty, incomplete and unresolved main exercises", () => {
  const analysis = analyzed([record("last", "2026-10-06", [exercise("empty", { sets: [] }), unknown("unknown", { sets: [set("missing", null, null, null)] }), exercise("partial", { sets: [set("partial:set", null, 10, null)] })])]);
  const value = T.reviewSession(analysis, { preferences: { order: "diary", mainExerciseKeys: ["raw:개인특수운동"] } });
  assert.deepEqual(value.rows.map(row => row.blockId), ["empty", "unknown", "partial"]);
  assert.deepEqual(value.rows.map(row => row.diaryPosition), [1, 2, 3]);
  assert.equal(value.rows[0].progression, null);
  assert.equal(value.rows[1].priorityKind, "main");
  assert.equal(value.rows[1].sets[0].reps, null);
  assert.equal(value.rows[1].progression.status, "incomparable");
  assert.equal(value.rows[2].progression.current.loadKg, null);
  assert.equal(value.rows[2].progression.current.rir, null);
  assert.deepEqual(value.rows.map(row => row.key), value.rows.map(row => JSON.stringify(["last", row.blockId])));
});

test("priority is main selection order, primary focus, compound, then diary ties rather than load or volume", () => {
  const ex = [
    exercise("bench-low", { sets: [set("bench-low:set", 1)] }),
    exercise("curl-high", { rawName: "덤벨 컬", exerciseId: "dumbbell_curl", equipmentKey: "db-A", loadConvention: "per-side", sets: [set("curl-high:set", 500)] }),
    exercise("lateral", { rawName: "덤벨 레터럴 레이즈", exerciseId: "dumbbell_lateral_raise" }),
    exercise("row", { rawName: "시티드 케이블 로우", exerciseId: "seated_cable_row" }),
    exercise("leg", { rawName: "레그 컬", exerciseId: "leg_curl" }), unknown("other", { sets: [] }),
    exercise("bench-second", { equipmentKey: "synthetic-rack-B" })
  ];
  const analysis = analyzed([record("last", "2026-10-06", ex)]);
  const value = T.reviewSession(analysis, { preferences: { order: "priority", mainExerciseKeys: ["exercise:leg_curl", "exercise:dumbbell_curl"] }, priorityMuscles: ["shoulders"] });
  assert.deepEqual(value.rows.map(row => row.blockId), ["leg", "curl-high", "lateral", "bench-low", "row", "bench-second", "other"]);
  assert.deepEqual(value.rows.map(row => row.priorityKind), ["main", "main", "focus", "suggested", "suggested", "suggested", "other"]);
  const chest = T.reviewSession(analysis, { priorityMuscles: ["triceps"] });
  assert.notEqual(chest.rows.find(row => row.blockId === "bench-low").priorityKind, "focus");
});

test("diary order retains A-B-A block identity while one resolved main key serves all machines", () => {
  const analysis = analyzed([record("last", "2026-10-06", [exercise("A1"), exercise("B", { equipmentKey: "synthetic-rack-B" }), exercise("A2")])]);
  const value = T.reviewSession(analysis, { preferences: { order: "diary", mainExerciseKeys: ["exercise:bench_press"] } });
  assert.deepEqual(value.rows.map(row => row.blockId), ["A1", "B", "A2"]);
  assert.deepEqual(value.rows.map(row => row.equipmentKey), ["synthetic-rack-A", "synthetic-rack-B", "synthetic-rack-A"]);
  assert.equal(new Set(value.rows.map(row => row.key)).size, 3);
  assert.ok(value.rows.every(row => row.mainKey === "exercise:bench_press" && row.priorityKind === "main"));
  assert.ok(value.rows.every(row => row.progression.previous === null));
});

test("raw main keeps exact normalized original name after mapping but never strips brand or transfers movement aliases", () => {
  const rawName = "[합성 장비] 개인 프레스", rawKey = "raw:" + normalize(rawName);
  const prefs = { order: "priority", mainExerciseKeys: [rawKey] };
  const records = [record("last", "2026-10-06", [unknown("unclassified", { rawName }), unknown("different-original", { rawName: "개인 프레스" })])];
  const before = T.reviewSession(analyzed(records), { preferences: prefs });
  assert.equal(before.rows.find(row => row.blockId === "unclassified").mainKey, rawKey);
  const mappings = [{ rawName, exerciseId: "machine_chest_press", equipmentKey: "synthetic-device", loadConvention: "total", loadRole: "external", confirmed: true }];
  const after = T.reviewSession(analyzed(records, "2026-10-06", mappings), { preferences: prefs });
  const selected = after.rows.find(row => row.blockId === "unclassified");
  assert.equal(selected.exerciseKey, "exercise:machine_chest_press");
  assert.equal(selected.mainKey, rawKey);
  assert.equal(selected.priorityKind, "main");
  assert.equal(after.rows.find(row => row.blockId === "different-original").mainKey, null);
});

test("main aliases use the first saved matching key and do not guess another resolved exercise ID", () => {
  const rawKey = "raw:" + normalize("바벨 벤치 프레스");
  const analysis = analyzed([record("last", "2026-10-06", [exercise(), exercise("incline", { rawName: "인클라인 바벨 프레스", exerciseId: "incline_barbell_press" })])]);
  const value = T.reviewSession(analysis, { preferences: { order: "priority", mainExerciseKeys: [rawKey, "exercise:bench_press"] } });
  assert.equal(value.rows.find(row => row.blockId === "bench").mainKey, rawKey);
  assert.equal(value.rows.find(row => row.blockId === "incline").mainKey, null);
  assert.equal(T.reviewSession(analysis, { preferences: { order: "priority", mainExerciseKeys: ["exercise:bench_press", rawKey] } }).rows.find(row => row.blockId === "bench").mainKey, "exercise:bench_press");
});

test("a row exposes all saved main keys in preference order so unpinning all aliases fully removes the main", () => {
  const rawKey = "raw:개인프레스", preferences = freeze({ order: "priority", mainExerciseKeys: [rawKey, "exercise:bench_press"] });
  const analysis = freeze(analyzed([record("last", "2026-10-06", [exercise("selected", { rawName: "개인 프레스" })])]));
  const row = T.reviewSession(analysis, { preferences }).rows[0];
  assert.deepEqual(row.mainKeys, [rawKey, "exercise:bench_press"]);
  assert.equal(row.mainKey, rawKey);
  const remaining = { ...preferences, mainExerciseKeys: preferences.mainExerciseKeys.filter(key => !row.mainKeys.includes(key)) };
  const unpinned = T.reviewSession(analysis, { preferences: remaining }).rows[0];
  assert.equal(unpinned.mainKey, null);
  assert.deepEqual(unpinned.mainKeys, []);
  assert.notEqual(unpinned.priorityKind, "main");
  row.mainKeys.push("exercise:leg_curl");
  assert.deepEqual(preferences.mainExerciseKeys, [rawKey, "exercise:bench_press"]);
});

test("a uniquely resolved raw main is derived across equivalent exercises on different machines without writing preferences", () => {
  const preferences = freeze({ order: "priority", mainExerciseKeys: ["raw:개인프레스"] });
  const mappings = [{ rawName: "개인 프레스", exerciseId: "bench_press", equipmentKey: "synthetic-rack-A", loadConvention: "total", loadRole: "external", confirmed: true }];
  const analysis = analyzed([record("prior", "2026-10-04", [unknown("original", { rawName: "개인 프레스", sets: [] })]),
    record("last", "2026-10-06", [exercise("different-machine", { rawName: "B 장비의 다른 원문", equipmentKey: "synthetic-rack-B" }),
      unknown("not-mapped", { rawName: "개인 프레스 비슷한 이름" }), exercise("other-id", { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press" })])], "2026-10-06", mappings);
  const before = copy(analysis), value = T.reviewSession(freeze(analysis), { preferences });
  const same = value.rows.find(row => row.blockId === "different-machine");
  assert.deepEqual(same.mainKeys, ["raw:개인프레스"]);
  assert.equal(same.mainKey, "raw:개인프레스");
  assert.equal(same.priorityKind, "main");
  assert.equal(same.equipmentKey, "synthetic-rack-B");
  assert.deepEqual(value.rows.find(row => row.blockId === "not-mapped").mainKeys, []);
  assert.deepEqual(value.rows.find(row => row.blockId === "other-id").mainKeys, []);
  assert.deepEqual(preferences.mainExerciseKeys, ["raw:개인프레스"]);
  assert.deepEqual(analysis, before);
});

test("conflicting raw-name resolved identities do not promote a main and future conflicts do not leak into historical selection", () => {
  const preferences = { order: "priority", mainExerciseKeys: ["raw:개인프레스"] };
  const analysis = analyzed([record("first", "2026-10-02", [exercise("raw:first", { rawName: "개인 프레스" })]),
    record("middle", "2026-10-04", [exercise("bench:B", { rawName: "장비 B 원문", equipmentKey: "synthetic-rack-B" })]),
    record("last", "2026-10-06", [exercise("raw:conflict", { rawName: "개인_프레스", exerciseId: "machine_chest_press", equipmentKey: "synthetic-device-C" }),
      exercise("bench:B", { rawName: "장비 B 원문", equipmentKey: "synthetic-rack-B" })])]);
  assert.equal(T.reviewSession(analysis, { sessionId: "middle", preferences }).rows[0].mainKey, "raw:개인프레스");
  const latest = T.reviewSession(analysis, { preferences });
  assert.deepEqual(latest.rows.find(row => row.blockId === "bench:B").mainKeys, []);
  assert.equal(latest.rows.find(row => row.blockId === "bench:B").mainKey, null);
  assert.equal(latest.rows.find(row => row.blockId === "raw:conflict").mainKey, "raw:개인프레스");
});

test("known movement and normalized unresolved keys can be reused in future records without equipment inference", () => {
  const preferences = { order: "priority", mainExerciseKeys: ["raw:개인특수운동", "exercise:bench_press"] };
  const analysis = analyzed([record("future", "2026-10-06", [exercise("new-device", { equipmentKey: "synthetic-rack-X" }), unknown("new-unknown", { rawName: " 개인_특수-운동 " })])]);
  const value = T.reviewSession(analysis, { preferences });
  assert.deepEqual(value.rows.map(row => row.blockId), ["new-unknown", "new-device"]);
  assert.equal(value.rows[0].equipmentKey, null);
  assert.equal(value.rows[0].exerciseKey, "raw:개인특수운동");
});

test("selected historical session derives its own previous exact block and excludes newer global progression", () => {
  const records = [record("first", "2026-10-02", [exercise("first:block", { sets: [set("first:set", 80)] })]),
    record("middle", "2026-10-04", [exercise("middle:block", { sets: [set("middle:set", 85)] })]),
    record("last", "2026-10-06", [exercise("last:block", { sets: [set("last:set", 90)] })])];
  const analysis = analyzed(records);
  assert.equal(analysis.progression[0].current.sessionId, "last");
  const value = T.reviewSession(analysis, { sessionId: "middle" });
  assert.equal(value.rows[0].progression.current.sessionId, "middle");
  assert.equal(value.rows[0].progression.current.blockId, "middle:block");
  assert.equal(value.rows[0].progression.previous.sessionId, "first");
  assert.equal(value.rows[0].progression.previous.loadKg, 80);
  assert.equal(value.rows[0].progression.status, "improved");
  assert.equal(value.rows[0].progression.historyCoverage.exerciseDayCount, 2);
  assert.equal(value.windowEnd, "2026-10-04");
  assert.equal(value.rows[0].progression.observed.current.blockId, "middle:block");
});

test("conditions stay device and actual preceding-work specific even after display priority changes", () => {
  const prior = record("prior", "2026-10-04", [exercise("bench", { sets: [set("bench:set", 80)] }), exercise("row", { rawName: "시티드 케이블 로우", exerciseId: "seated_cable_row", sets: [set("row:set", 60)] })]);
  const last = record("last", "2026-10-06", [exercise("bench", { sets: [set("bench:set", 85)] }), exercise("row", { rawName: "시티드 케이블 로우", exerciseId: "seated_cable_row", sets: [set("row:set", 65)] }), exercise("bench-B", { equipmentKey: "synthetic-rack-B" })]);
  const analysis = analyzed([prior, last]);
  const value = T.reviewSession(analysis, { preferences: { order: "priority", mainExerciseKeys: ["exercise:seated_cable_row"] } });
  assert.equal(value.rows[0].blockId, "row");
  assert.equal(value.rows[0].diaryPosition, 2);
  assert.equal(value.rows[0].progression.status, "insufficient");
  assert.equal(value.rows.find(row => row.blockId === "bench").progression.status, "improved");
  assert.equal(value.rows.find(row => row.blockId === "bench-B").progression.previous, null);
  assert.deepEqual(value.rows[0].progression.current.context, analysis.lastSession.exercises[1].context);
});

test("same-session repeated blocks never become each other's previous occurrence", () => {
  const analysis = analyzed([record("prior", "2026-10-04", [exercise("A1"), exercise("B", { equipmentKey: "synthetic-rack-B" }), exercise("A2")]),
    record("last", "2026-10-06", [exercise("A1"), exercise("B", { equipmentKey: "synthetic-rack-B" }), exercise("A2")])]);
  const value = T.reviewSession(analysis, { preferences: { order: "diary", mainExerciseKeys: [] } });
  for (const row of value.rows) {
    assert.equal(row.progression.previous.sessionId, "prior");
    assert.equal(row.progression.previous.blockId, row.blockId);
    assert.equal(row.progression.current.blockId, row.blockId);
  }
});

test("separate same-day sessions remain preserved and incomparable without exposing later same-day sessions", () => {
  const analysis = analyzed([record("early", "2026-10-06", [exercise()], { time: "09:00" }), record("late", "2026-10-06", [exercise()], { time: "18:00" })]);
  const early = T.reviewSession(analysis, { sessionId: "early" }), late = T.reviewSession(analysis, { sessionId: "late" });
  assert.equal(early.rows[0].progression.previous, null);
  assert.equal(early.rows[0].progression.historyCoverage.exerciseRecordCount, 1);
  assert.equal(late.rows[0].progression.previous.sessionId, "early");
  assert.equal(late.rows[0].progression.status, "incomparable");
  assert.match(late.rows[0].progression.reason, /같은 날/);
  assert.equal(late.rows[0].progression.historyCoverage.exerciseDayCount, 1);
});

test("historical review reports only the available cutoff range and never claims a full earlier 28 days", () => {
  const analysis = analyzed([record("earlier", "2026-09-10"), record("last", "2026-10-06")]);
  const value = T.reviewSession(analysis, { sessionId: "earlier" });
  assert.equal(value.windowStart, "2026-09-09");
  assert.equal(value.windowEnd, "2026-09-10");
  assert.match(value.limitations[0], /28일 전체/);
  assert.equal(value.rows[0].progression.historyCoverage.exerciseRecordCount, 1);
});

test("a wider supplied analysis never brings records older than the selected session's 28-day window", () => {
  const analysis = analyzed([record("old", "2026-08-01")], "2026-08-01");
  const next = analyzed([record("last", "2026-10-06")]);
  const wide = { ...next, windowStart: "2026-08-01", sessions: [...analysis.sessions, ...next.sessions] };
  const value = T.reviewSession(wide);
  assert.equal(value.windowStart, "2026-09-09");
  assert.equal(value.rows[0].progression.previous, null);
  assert.equal(value.rows[0].progression.historyCoverage.exerciseRecordCount, 1);
});

test("review and returned edits cannot mutate original analysis, recovery, contexts, observations or sets", () => {
  const analysis = analyzed([record("prior", "2026-10-04"), record()]);
  const before = copy(analysis), preferences = freeze({ order: "priority", mainExerciseKeys: ["exercise:bench_press"] });
  const value = T.reviewSession(freeze(analysis), { preferences, priorityMuscles: freeze(["chest"]) });
  value.session.exercises[0].sets[0].loadKg = 999;
  value.rows[0].sets[0].loadKg = 888;
  value.rows[0].progression.current.context.preceding.workingSets = 999;
  value.rows[0].progression.observed.previous.loadKg = 777;
  assert.deepEqual(analysis, before);
  assert.deepEqual(preferences.mainExerciseKeys, ["exercise:bench_press"]);
});

test("legacy workspaces normalize display preferences without changing original records or version", () => {
  const value = workspace([record()]), before = copy(value.records);
  delete value.reviewPreferences;
  const normalized = Store.validate(freeze(value));
  assert.deepEqual(normalized.reviewPreferences, { order: "priority", mainExerciseKeys: [] });
  assert.deepEqual(normalized.records, before);
  assert.equal(normalized.version, 1);
  assert.equal(value.reviewPreferences, undefined);
  normalized.reviewPreferences.mainExerciseKeys.push("exercise:bench_press");
  assert.deepEqual(Store.createEmpty().reviewPreferences.mainExerciseKeys, []);
});

test("display preference store rejects corrupt orders, duplicates, unknown fields and malformed movement keys", () => {
  const invalid = [null, { order: "volume", mainExerciseKeys: [] }, { order: "priority", mainExerciseKeys: [], other: true },
    { order: "priority", mainExerciseKeys: ["exercise:bench_press", "exercise:bench_press"] }, { order: "priority", mainExerciseKeys: ["device:A"] },
    { order: "priority", mainExerciseKeys: ["raw:"] }, { order: "priority", mainExerciseKeys: ["raw:Upper Case"] },
    { order: "priority", mainExerciseKeys: ["exercise: "] }, { order: "priority", mainExerciseKeys: ["exercise:bench\npress"] },
    { order: "priority", mainExerciseKeys: ["raw:" + "a".repeat(5997)] }, { order: "priority", mainExerciseKeys: Array.from({ length: 501 }, (_, i) => "raw:" + i) }];
  for (const prefs of invalid) { const value = workspace(); value.reviewPreferences = prefs; assert.throws(() => Store.validate(value)); }
  const valid = workspace(); valid.reviewPreferences = { order: "diary", mainExerciseKeys: ["exercise:old-id-no-longer-listed", "raw:개인운동"] };
  assert.deepEqual(Store.validate(valid), valid);
});

test("every supported raw-name normalization can be persisted despite compatibility-character expansion", () => {
  const rawName = "\ufdfa".repeat(300), key = "raw:" + normalize(rawName), value = workspace([record("last", "2026-10-06", [unknown("expanded", { rawName })])]);
  assert.ok(key.length > 512 && key.length <= 6000);
  value.reviewPreferences.mainExerciseKeys = [key];
  assert.deepEqual(Store.validate(value).reviewPreferences, value.reviewPreferences);
  assert.equal(T.reviewSession(analyzed(value.records), { preferences: value.reviewPreferences }).rows[0].priorityKind, "main");
});

test("exchange, full backups and record merging preserve preferences and completed nutrition snapshots", () => {
  const value = workspace([record()]); value.reviewPreferences = { order: "diary", mainExerciseKeys: ["exercise:bench_press", "raw:개인운동"] };
  assert.deepEqual(JSON.parse(Store.exportExchange(value)).training, value);
  assert.deepEqual(Store.mergeRecords(value, [record("additional", "2026-10-05")]).workspace.reviewPreferences, value.reviewPreferences);
  const state = Storage.createEmpty(); state.training = value;
  state.days["2026-10-05"] = { date: "2026-10-05", weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0,
    meals: [{ id: "synthetic-meal", name: "합성 식사", protein: 20, carbs: 50, fat: 10, otherKcal: 0, alcoholG: 0 }], sessions: [], complete: true,
    planSnapshot: { status: "incomplete", reasons: ["합성 완료 당시 미확인"], version: "9.0.0",
      energy: { targetKcal: null, tdeeKcal: null, restingKcal: null, exerciseKcal: null, range: [null, null], method: null },
      macros: { protein: { target: null, min: null, max: null }, carbs: { target: null, min: null, max: null }, fat: { target: null, min: null, max: null } }, context: {}, guidance: [], sources: [] } };
  const completed = copy(state.days["2026-10-05"]);
  const restored = Storage.parseBackup(Storage.exportBackup(state)).state;
  assert.deepEqual(restored.training.reviewPreferences, value.reviewPreferences);
  assert.deepEqual(restored.days["2026-10-05"], completed);
  const old = copy(state); delete old.training.reviewPreferences;
  const normalized = Storage.parseBackup(JSON.stringify(old)).state;
  assert.deepEqual(normalized.training.reviewPreferences, { order: "priority", mainExerciseKeys: [] });
  assert.deepEqual(normalized.days["2026-10-05"], completed);
});

test("500 sessions with eight blocks use a bounded grouped review without per-block whole-history scans", t => {
  const sessions = Array.from({ length: 500 }, (_, i) => record("synthetic:" + String(i).padStart(3, "0"), "2026-10-06", Array.from({ length: 8 }, (_, j) => exercise("block:" + j, { equipmentKey: "synthetic-device:" + j })), { time: null }));
  const analysis = analyzed(sessions), original = copy(analysis), preferences = { order: "priority", mainExerciseKeys: ["exercise:bench_press"] };
  const timings = [];
  for (let i = 0; i < 5; i++) { const begin = performance.now(); const value = T.reviewSession(analysis, { preferences }); timings.push(performance.now() - begin); assert.equal(value.rows.length, 8); assert.equal(value.rows[0].progression.historyCoverage.exerciseRecordCount, 500); }
  assert.deepEqual(analysis, original);
  t.diagnostic("500 x 8 grouped review milliseconds: " + timings.map(value => value.toFixed(2)).join(", "));
  assert.ok(timings.every(Number.isFinite));
});
