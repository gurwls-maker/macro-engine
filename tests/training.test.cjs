"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");

const date = "2026-10-05";
const profile = { age: 35, sex: "unspecified", healthContext: "general", trainingYears: 3, sport: "strength", goal: "gain", weightKg: 75 };
const settings = { daysPerWeek: 3, sessionMinutes: 45, equipment: "gym", priorityMuscles: [] };
const set = (id, loadKg = 40, reps = 10, rir = 2, marker = null) => ({ id, loadKg, reps, rir, marker });
const ex = (sets = [set("s1")], overrides = {}) => ({ id: "e1", rawName: "벤치 프레스", exerciseId: "bench_press", equipmentKey: "synthetic-gym-bar-a", loadConvention: "total", durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets, notes: "", ...overrides });
const record = (id = "r1", day = date, exercises = [ex()], overrides = {}) => ({ id, date: day, time: "18:00", label: "합성 운동", durationMinutes: 45, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null }, exercises, notes: "", effort: null, pain: null, ...overrides });
const analyze = (records = [], options = {}) => T.analyze(records, { date, profile, ...options });
const muscle = (result, id) => result.muscles.find(row => row.id === id);
const neutral = { date, energy: "okay", hunger: "okay", sleep: "good", pain: "none" };

test("catalog is immutable, uses valid muscles, and resolves only exact aliases or confirmed mappings", () => {
  assert.ok(T.catalog.length >= 40);
  assert.equal(new Set(T.catalog.map(row => row.id)).size, T.catalog.length);
  for (const row of T.catalog) {
    assert.ok(Object.isFrozen(row));
    for (const id of [...row.primaryMuscles, ...row.secondaryMuscles]) assert.ok(T.muscleLabels[id]);
    for (const name of [row.id, row.label, ...row.aliases]) assert.equal(T.resolveExercise(name)?.id, row.id, `unique exact alias: ${name}`);
  }
  assert.equal(T.resolveExercise("  BENCH   PRESS ").id, "bench_press");
  assert.equal(T.resolveExercise("벤치프레스").id, "bench_press");
  assert.equal(T.resolveExercise("벤치 비슷한 머신"), null);
  assert.equal(T.resolveExercise("스미스 벤치 프레스"), null);
  const map = { rawName: "개인 별명", exerciseId: "machine_chest_press", equipmentKey: "machine-42", loadConvention: "total", confirmed: true };
  assert.equal(T.resolveExercise("개인 별명", [{ ...map, confirmed: false }]), null);
  assert.equal(T.resolveExercise("개인 별명", [map]).confidence, "confirmed");
  assert.equal(T.resolveExercise("개인 별명", [map]).comparableKey, "machine_chest_press|machine-42|total");
  assert.equal(T.resolveExercise("개인 별명", [map, { ...map, exerciseId: "leg_press" }]), null);
});

test("additional generic movements resolve exact Korean and English names without guessing brand models", () => {
  const cases = [
    ["머신 플라이", "pec deck", "machine_pec_deck", "chest"],
    ["머신 숄더 프레스", "machine shoulder press", "machine_shoulder_press", "shoulders"],
    ["머신 암 컬", "machine arm curl", "machine_arm_curl", "biceps"],
    ["덤벨 불가리안 스플릿 스쿼트", "dumbbell bulgarian split squat", "dumbbell_bulgarian_split_squat", "quads"],
    ["덤벨 스티프 레그 데드리프트", "dumbbell stiff leg deadlift", "dumbbell_stiff_leg_deadlift", "hamstrings"],
    ["케이블 암 풀 다운", "straight arm pulldown", "straight_arm_pulldown", "back"],
    ["스미스 시티드 숄더 프레스", "smith seated shoulder press", "smith_seated_shoulder_press", "shoulders"],
    ["뉴트럴 그립 랫 풀 다운", "neutral grip lat pulldown", "neutral_grip_lat_pulldown", "back"],
    ["스미스 언더그립 벤트 오버 로우", "smith underhand bent over row", "smith_underhand_row", "back"],
    ["케이블 로프 푸시 다운", "cable rope pushdown", "rope_triceps_pushdown", "triceps"]
  ];
  for (const [korean, english, id, primary] of cases) {
    for (const rawName of [korean, korean.replaceAll(" ", ""), english, english.toUpperCase()]) {
      const resolved = T.resolveExercise(rawName);
      assert.equal(resolved.id, id);
      assert.ok(resolved.primaryMuscles.includes(primary));
      assert.equal(resolved.comparableKey, null, "movement identity does not establish the actual machine or load convention");
    }
  }
  for (const rawName of ["Drax 머신 플라이", "Infinity 머신 숄더 프레스", "STA7000 머신 암 컬", "STA7000 unknown model", "리버스 머신 플라이", "불가리안 스쿼트 같은 운동", "머신 컬"]) assert.equal(T.resolveExercise(rawName), null, rawName);
  const unknown = "Drax 머신 플라이";
  const mapping = { rawName: unknown, exerciseId: "machine_pec_deck", equipmentKey: "confirmed-pec-deck-a", loadConvention: "total", confirmed: true };
  assert.equal(T.resolveExercise(unknown, [mapping]).confidence, "confirmed");
  assert.equal(T.resolveExercise(unknown, [{ ...mapping, confirmed: false }]), null);

  const rows = cases.map(([rawName], index) => ex([set(`set-${index}`, 20, 10, null)], { id: `exercise-${index}`, rawName, exerciseId: null, equipmentKey: null, loadConvention: "as-recorded" }));
  const source = [record("generic", date, rows)];
  const before = structuredClone(source), result = analyze(source);
  assert.equal(result.coverage.unresolvedExercises, 0);
  assert.equal(result.coverage.workingSets, 10);
  assert.equal(result.coverage.unknownEffortSets, 10);
  for (const [id, count] of Object.entries({ chest: 1, shoulders: 2, biceps: 1, quads: 1, glutes: 2, hamstrings: 1, back: 3, triceps: 1 })) assert.equal(muscle(result, id).directSets, count, id);
  assert.deepEqual(source, before);
  assert.equal(result.growthRate, undefined);
});

test("generic variants remain separate exercises and never authorize cross-machine load comparisons", () => {
  for (const [a, b] of [["lat_pulldown", "neutral_grip_lat_pulldown"], ["smith_row", "smith_underhand_row"], ["dumbbell_rdl", "dumbbell_stiff_leg_deadlift"], ["triceps_pushdown", "rope_triceps_pushdown"], ["dumbbell_lunge", "dumbbell_bulgarian_split_squat"]]) {
    const result = analyze([record("a", "2026-10-01", [ex([set("a")], { rawName: a, exerciseId: null })]), record("b", date, [ex([set("b", 50)], { rawName: b, exerciseId: null })])]);
    assert.equal(result.progression.length, 2);
    assert.ok(result.progression.every(row => row.status === "insufficient"));
  }
  for (const id of ["machine_pec_deck", "machine_shoulder_press", "machine_arm_curl", "smith_seated_shoulder_press"]) {
    const rows = [record("a", "2026-10-01", [ex([set("a")], { rawName: id, exerciseId: null, equipmentKey: "machine-a" })]), record("b", date, [ex([set("b", 60)], { rawName: id, exerciseId: null, equipmentKey: "machine-b" })])];
    assert.equal(analyze(rows).progression.length, 2);
    rows.forEach(row => { row.exercises[0].equipmentKey = null; });
    assert.equal(analyze(rows).progression[0].status, "incomparable");
    rows.forEach(row => { row.exercises[0].equipmentKey = "same-machine"; row.exercises[0].loadConvention = "as-recorded"; });
    assert.equal(analyze(rows).progression[0].status, "incomparable");
  }
  const straightArm = T.resolveExercise("케이블 암 풀 다운");
  assert.equal(straightArm.pattern, "shoulder-extension");
  assert.equal(straightArm.secondaryMuscles.includes("biceps"), false, "straight-arm shoulder extension is not an elbow-flexion pulldown");
});

test("warm-up wording identifies the movement but does not invent set markers or bodyweight loads", () => {
  const rows = [record("warm-name", date, [ex([set("unmarked", null, 10, null), set("marked", null, 5, null, "W")], { rawName: "W웜업풀업", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded" })])];
  const result = analyze(rows);
  assert.equal(T.resolveExercise("W웜업풀업").id, "pull_up");
  assert.equal(result.coverage.workingSets, 1, "only explicit set-level W is excluded");
  assert.equal(result.coverage.warmupSets, 1);
  assert.equal(result.coverage.unknownEffortSets, 1);
  assert.equal(muscle(result, "back").directSets, 1);
  assert.equal(result.lastSession.exercises[0].sets[0].marker, null);
  assert.equal(result.lastSession.exercises[0].sets[0].loadKg, null);
  assert.equal(result.progression[0].current.loadKg, null);
});

test("direct, indirect, unknown effort, warm-up and marked sets remain separate observations", () => {
  const result = analyze([record("r", date, [ex([set("w", 20, 10, null, "W"), set("normal"), set("drop", 30, 12, 1, "D"), set("assist", 30, 12, null, "A"), set("unknown", 40, 10, null)])])]);
  assert.equal(result.coverage.workingSets, 2);
  assert.equal(result.coverage.warmupSets, 1);
  assert.equal(result.coverage.markedSets, 2);
  assert.equal(result.coverage.unknownEffortSets, 2);
  assert.equal(muscle(result, "chest").directSets, 2);
  assert.equal(muscle(result, "chest").indirectSets, 0);
  assert.equal(muscle(result, "triceps").indirectSets, 2);
  assert.equal(muscle(result, "triceps").directSets, 0);
  assert.equal(muscle(result, "chest").markedSets, 2);
  assert.equal(result.lastSession.exercises[0].sets[2].marker, "D");
  assert.equal(result.lastSession.exercises[0].sets[3].marker, "A");
  assert.equal(result.score, undefined);
  assert.equal(result.growthRate, undefined);
});

test("unrecognized names and historical aggregate sets are never invented muscle volume", () => {
  const unknown = record("unknown", date, [ex([set("u")], { rawName: "확인 안 된 기계", exerciseId: null, equipmentKey: null })]);
  const legacy = record("legacy", "2026-10-01", [], { reportedSetCount: 40, source: { kind: "legacy-ocr", hash: "legacy", paths: [], uncertainties: ["미검증"], revision: null } });
  const result = analyze([unknown, legacy]);
  assert.equal(result.coverage.unresolvedExercises, 1);
  assert.equal(result.coverage.legacyOnlySessions, 1);
  assert.equal(result.coverage.workingSets, 1);
  assert.equal(result.muscles.reduce((sum, row) => sum + row.directSets, 0), 0);
  assert.equal(result.progression[0].exerciseId, null);
  assert.match(result.progression[0].observed.description, /40kg/);
});

test("window boundaries exclude future records and missing dates never become rest days", () => {
  const result = analyze([record("old", "2026-09-07"), record("first", "2026-09-08"), record("last", date), record("future", "2026-10-06"), record("invalid", "2026-02-30")]);
  assert.equal(result.windowStart, "2026-09-08");
  assert.equal(result.windowEnd, date);
  assert.equal(result.coverage.recordCount, 2);
  assert.equal(result.coverage.daysWithRecords, 2);
  assert.equal(result.coverage.unknownDays, 26);
  assert.equal(result.coverage.excludedRecords, 3);
  assert.equal(T.analyze([]).windowEnd, null);
  assert.equal(analyze([record()], { date: "bad" }).sessions.length, 0);
  assert.equal(analyze([]).lastSession, null);
  assert.equal(analyze([]).recovery.status, "insufficient");
});

test("exact duplicate IDs/source copies do not double count, conflicting IDs are quarantined", () => {
  const a = record();
  assert.equal(analyze([a, structuredClone(a)]).coverage.recordCount, 1);
  const conflict = analyze([a, { ...a, label: "다른 내용" }]);
  assert.equal(conflict.coverage.recordCount, 0);
  assert.equal(conflict.coverage.excludedRecords, 2);
  const visual = record("image-a", date, [ex()], { source: { kind: "visual", hash: "same-image", paths: ["a.png"], uncertainties: [], revision: null } });
  const copied = { ...structuredClone(visual), id: "image-b" };
  copied.source.paths = ["b.png"];
  copied.exercises[0].sets[0].id = "copy-set-id";
  const result = analyze([visual, copied]);
  assert.equal(result.coverage.recordCount, 1);
  assert.equal(result.coverage.duplicateRecords, 1);
});

test("same-day sessions and repeated exercise blocks stay distinct without false longitudinal decline", () => {
  const a = record("am", date, [ex([set("a", 50)])], { time: "09:00" });
  const b = record("pm", date, [ex([set("b", 40)]), ex([set("c", 35)], { id: "e2" })], { time: "18:00" });
  const result = analyze([b, a]);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.coverage.daysWithRecords, 1);
  assert.equal(result.coverage.workingSets, 3);
  assert.equal(result.lastSession.id, "pm");
  assert.equal(result.lastSession.exercises.length, 2);
  assert.equal(result.progression.length, 1);
  assert.equal(result.progression[0].current.setCount, 2);
  assert.equal(result.progression[0].status, "incomparable");
  assert.match(result.progression[0].reason, /같은 날/);
  assert.equal(result.recovery.repeatedDeclines, 0);
});

test("comparable load and repetition changes are observations, never estimated growth or 1RM", () => {
  for (const [before, after, expected] of [
    [set("a", 40, 10), set("b", 45, 10), "improved"],
    [set("a", 45, 10), set("b", 40, 10), "declined"],
    [set("a", 40, 10), set("b", 40, 10), "stable"],
    [set("a", 40, 10), set("b", 40, 12), "improved"],
    [set("a", 40, 10), set("b", 45, 8), "mixed"]
  ]) {
    const result = analyze([record("before", "2026-10-01", [ex([before])]), record("after", date, [ex([after])])]);
    assert.equal(result.progression[0].status, expected);
    assert.equal(result.progression[0].current.loadKg, after.loadKg);
    assert.equal(result.progression[0].previous.reps, before.reps);
    assert.match(result.progression[0].observed.description, /근성장률이 아니/);
    assert.equal(result.progression[0].estimated1RM, undefined);
  }
});

test("unknown RIR or convention blocks judgments but never hides readable before-and-after sets", () => {
  const result = analyze([record("a", "2026-10-01", [ex([set("a", 50, 10, null)], { equipmentKey: null, loadConvention: "as-recorded" })]), record("b", date, [ex([set("b", 50, 12, null)], { equipmentKey: null, loadConvention: "as-recorded" })])]);
  const p = result.progression[0];
  assert.equal(p.status, "incomparable");
  assert.equal(p.previous.reps, 10);
  assert.equal(p.current.reps, 12);
  assert.equal(p.current.rir, null);
  assert.match(p.observed.description, /50kg × 10회 → 50kg × 12회/);
  for (const rir of [null, 0, 1, 3, 10]) {
    const r = analyze([record("a", "2026-10-01", [ex([set("a", 40, 10, 2)])]), record("b", date, [ex([set("b", 50, 10, rir)])])]);
    assert.equal(r.progression[0].status, "incomparable");
  }
});

test("different machines, load conventions and unconfirmed brand names are never merged for comparison", () => {
  for (const override of [{ equipmentKey: "different-machine" }, { loadConvention: "per-side" }]) {
    const result = analyze([record("a", "2026-10-01", [ex()]), record("b", date, [ex([set("b", 80)], override)])]);
    assert.equal(result.progression.length, 2);
    assert.ok(result.progression.every(row => row.status === "insufficient"));
  }
  const a = ex([set("a", 60)], { rawName: "브랜드A 머신", exerciseId: "machine_chest_press", equipmentKey: null, loadConvention: "as-recorded" });
  const b = ex([set("b", 90)], { rawName: "브랜드B 머신", exerciseId: "machine_chest_press", equipmentKey: null, loadConvention: "as-recorded" });
  assert.equal(analyze([record("a", "2026-10-01", [a]), record("b", date, [b])]).progression.length, 2);
});

test("same alias may have different equipment mappings and explicit record selections remain authoritative", () => {
  const mappings = [
    { rawName: "내 프레스", exerciseId: "machine_chest_press", equipmentKey: "machine-a", loadConvention: "total", confirmed: true },
    { rawName: "내 프레스", exerciseId: "dumbbell_shoulder_press", equipmentKey: "dumbbells-b", loadConvention: "per-side", confirmed: true }
  ];
  assert.equal(T.resolveExercise("내 프레스", mappings), null);
  const rows = [
    record("a", "2026-10-01", [ex([set("a", 40)], { rawName: "내 프레스", exerciseId: null, equipmentKey: "machine-a", loadConvention: "as-recorded" })]),
    record("b", date, [ex([set("b", 20)], { rawName: "내 프레스", exerciseId: null, equipmentKey: "dumbbells-b", loadConvention: "as-recorded" })])
  ];
  const result = analyze(rows, { mappings });
  assert.equal(result.coverage.unresolvedExercises, 0);
  assert.equal(result.progression.length, 2);
  assert.equal(muscle(result, "chest").directSets, 1);
  assert.equal(muscle(result, "shoulders").directSets, 1);
  assert.equal(result.lastSession.exercises[0].loadConvention, "per-side");
  const explicit = analyze([record("r", date, [ex([set("r")], { rawName: "벤치 프레스", exerciseId: "machine_chest_press", equipmentKey: "confirmed-machine" })])]);
  assert.equal(explicit.lastSession.exercises[0].exerciseId, "machine_chest_press");
});

test("warm-ups and unknown marker sets cannot create false personal records", () => {
  const a = record("a", "2026-10-01", [ex([set("a", 40)])]);
  const b = record("b", date, [ex([set("warm", 200, 10, 2, "W"), set("marked", 150, 10, 2, "D"), set("b", 40)])]);
  const p = analyze([a, b]).progression[0];
  assert.equal(p.status, "stable");
  assert.equal(p.current.loadKg, 40);
  const onlyMarked = analyze([record("a", "2026-10-01", [ex([set("a", 40, 10, 2, "A")])]), record("b", date, [ex([set("b", 50, 10, 2, "A")])])]).progression[0];
  assert.equal(onlyMarked.current.loadKg, 50);
  assert.equal(onlyMarked.current.marker, "A");
  assert.equal(onlyMarked.status, "incomparable");
});

test("zero RIR and zero external load stay known; unknown values never become numeric zero", () => {
  const result = analyze([record("r", date, [ex([set("zero", 0, 12, 0), set("unknown", null, 8, null), set("invalid", 40, 0, 2), set("string", "50", 10, "2")])])]);
  const rows = result.lastSession.exercises[0].sets;
  assert.equal(rows[0].rir, 0);
  assert.equal(rows[0].loadKg, 0);
  assert.equal(rows[1].loadKg, null);
  assert.equal(rows[1].rir, null);
  assert.equal(rows[2].reps, null);
  assert.equal(rows[3].loadKg, null);
  assert.equal(rows[3].rir, null);
  assert.equal(result.coverage.invalidSets, 1);
});

test("bodyweight and old OCR observations do not become comparable loaded strength", () => {
  for (const override of [{ loadConvention: "bodyweight" }, { sourceKind: "legacy-ocr" }]) {
    const a = record("a", "2026-10-01", [ex([set("a", 0, 10)], override)]);
    const b = record("b", date, [ex([set("b", 0, 15)], override)]);
    if (override.sourceKind) { a.source.kind = override.sourceKind; b.source.kind = override.sourceKind; }
    assert.equal(analyze([a, b]).progression[0].status, "incomparable");
  }
});

test("pain stop takes precedence over every positive metric and blocks automatic programs", () => {
  const result = analyze([record("a", "2026-10-01", [ex([set("a", 40)])]), record("b", date, [ex([set("b", 50)])], { pain: "stop" })], { checkins: [neutral] });
  assert.equal(result.progression[0].status, "improved");
  assert.equal(result.recovery.status, "stop");
  assert.equal(result.recovery.pain, "stop");
  const program = T.recommendProgram(profile, settings, result);
  assert.equal(program.status, "review");
  assert.equal(program.days.length, 0);
  assert.match(program.progression, /자동 증량이나 운동량 증가를 제안하지/);
  const mild = analyze([record("mild", date, [ex()], { pain: "mild" })]);
  assert.equal(mild.recovery.status, "review");
  assert.equal(mild.recovery.pain, "mild");
});

test("deload is only a review after repeated comparable declines plus recent recovery self-report", () => {
  const records = [record("a", "2026-09-28", [ex([set("a", 50)])]), record("b", "2026-10-01", [ex([set("b", 45)])]), record("c", date, [ex([set("c", 40)])])];
  const without = analyze(records);
  assert.equal(without.recovery.status, "watch");
  assert.equal(without.recovery.repeatedDeclines, 1);
  assert.equal(without.recovery.deloadCandidate, false);
  const withReport = analyze(records, { checkins: [{ ...neutral, sleep: "poor" }] });
  assert.equal(withReport.recovery.status, "review");
  assert.equal(withReport.recovery.deloadCandidate, true);
  assert.match(withReport.recovery.reasons.join(" "), /진단은 아니/);
  assert.equal(analyze(records.slice(1), { checkins: [{ ...neutral, sleep: "poor" }] }).recovery.deloadCandidate, false);
  assert.equal(analyze(records, { checkins: [{ ...neutral, date: "2026-09-01", sleep: "poor" }] }).recovery.deloadCandidate, false);
  assert.equal(analyze(records, { checkins: [{ ...neutral, date: "2026-10-06", sleep: "poor" }] }).recovery.deloadCandidate, false);
});

test("unanswered/invalid check-ins cannot become recovery okay; date-map and nested check-ins are supported", () => {
  for (const checkins of [[], [{ date }], [{ date, energy: null, sleep: null, hunger: null }], { [date]: { coachCheckin: { sleep: "good" } } }]) assert.equal(analyze([record()], { checkins }).recovery.status, "insufficient");
  assert.equal(analyze([record()], { checkins: [neutral] }).recovery.status, "okay");
  assert.equal(analyze([record()], { checkins: { [date]: { coachCheckin: { ...neutral, sleep: "poor" } } } }).recovery.status, "watch");
  assert.equal(analyze([record()], { checkins: { energy: "low" } }).recovery.status, "watch");
});

test("later explicit pain resolution is honored without inferring resolution from missing records", () => {
  const old = record("pain", "2026-10-01", [ex()], { pain: "stop" });
  assert.equal(analyze([old, record("later")]).recovery.status, "stop");
  assert.equal(analyze([old, record("later", date, [ex()], { pain: "none" })], { checkins: [neutral] }).recovery.status, "okay");
});

test("clinical/age scope is independent of pain and program generation requires complete settings", () => {
  for (const healthContext of ["pregnancy", "breastfeeding", "clinical", "eating_disorder"]) {
    const p = { ...profile, healthContext };
    assert.equal(analyze([record()], { profile: p }).recovery.status, "review");
    assert.equal(analyze([record()], { profile: p }).recovery.pain, null);
    assert.equal(T.recommendProgram(p, settings).status, "review");
  }
  for (const age of [17.99, 80.01]) assert.equal(T.recommendProgram({ ...profile, age }, settings).status, "review");
  for (const bad of [{ daysPerWeek: 0 }, { daysPerWeek: 7 }, { daysPerWeek: "3" }, { sessionMinutes: 19.99 }, { sessionMinutes: 150.01 }, { sessionMinutes: Infinity }, { equipment: "unknown" }, { priorityMuscles: ["madeup"] }]) assert.equal(T.recommendProgram(profile, { ...settings, ...bad }).status, "incomplete");
  assert.equal(T.recommendProgram(null, settings).status, "incomplete");
  assert.equal(T.recommendProgram({}, settings).status, "incomplete");
});

test("all program day/equipment/goal/experience/time combinations have usable bounded exercises", () => {
  let count = 0;
  for (const daysPerWeek of [1, 2, 3, 4, 5, 6])
  for (const equipment of ["gym", "home", "bodyweight"])
  for (const goal of ["lose", "maintain", "gain", "recomp", "performance"])
  for (const trainingYears of [null, 0, 0.999, 1, 10])
  for (const sessionMinutes of [20, 35, 60, 150]) {
    const result = T.recommendProgram({ ...profile, goal, trainingYears }, { ...settings, daysPerWeek, equipment, sessionMinutes });
    assert.equal(result.status, "ready");
    assert.equal(result.days.length, daysPerWeek);
    for (const d of result.days) {
      assert.ok(d.exercises.length >= 2 && d.exercises.length <= 6);
      assert.ok(d.estimatedMinutes <= sessionMinutes);
      assert.equal(new Set(d.exercises.map(row => row.exerciseId)).size, d.exercises.length);
      for (const e of d.exercises) {
        assert.ok(T.catalog.some(row => row.id === e.exerciseId));
        assert.ok([2, 3].includes(e.sets));
        assert.ok([2, 3].includes(e.rir));
        assert.ok(e.restSeconds >= 90);
        if (equipment === "bodyweight") assert.equal(T.catalog.find(row => row.id === e.exerciseId).equipment, "bodyweight");
      }
    }
    assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
    count++;
  }
  assert.equal(count, 1800);
});

test("increasing time budgets never removes planned sets and adding recorded sets increases counts exactly", () => {
  for (const equipment of ["gym", "home", "bodyweight"])
  for (const trainingYears of [null, 5]) {
    let previous = 0;
    for (let sessionMinutes = 20; sessionMinutes <= 150; sessionMinutes++) {
      const result = T.recommendProgram({ ...profile, trainingYears }, { ...settings, equipment, sessionMinutes });
      const count = result.days.reduce((sum, day) => sum + day.exercises.reduce((n, e) => n + e.sets, 0), 0);
      assert.ok(count >= previous, `${equipment} ${sessionMinutes}`);
      previous = count;
    }
  }
  for (let count = 0; count <= 50; count++) {
    const result = analyze([record("r", date, [ex(Array.from({ length: count }, (_, i) => set(`s${i}`, 40.000001 + i / 100, 10, null)))])]);
    assert.equal(muscle(result, "chest").directSets, count);
    assert.equal(muscle(result, "triceps").indirectSets, count);
    assert.equal(muscle(result, "chest").unknownEffortSets, count);
  }
});

test("priorities influence optional exercises without creating unsupported bodyweight equipment", () => {
  const p = T.recommendProgram(profile, { ...settings, sessionMinutes: 150, priorityMuscles: ["hip_adductors", "calves"] });
  assert.ok(p.days[0].exercises.some(row => row.exerciseId === "hip_adduction"));
  const bodyweight = T.recommendProgram(profile, { ...settings, equipment: "bodyweight", priorityMuscles: ["back", "biceps"] });
  assert.match(bodyweight.limitations.join(" "), /동등한 대체 운동이 아니/);
  const home = T.recommendProgram(profile, { ...settings, equipment: "home" });
  assert.match(home.limitations.join(" "), /덤벨을 보유/);
  const unknown = T.recommendProgram({ ...profile, trainingYears: null }, settings);
  assert.ok(unknown.days.flatMap(day => day.exercises).every(row => row.sets === 2 && row.rir === 3));
});

test("analysis and recommendations never mutate records, mappings, check-ins or supplied analysis", () => {
  const records = [record("a", "2026-10-01"), record("b")];
  const mappings = [], checkins = [neutral];
  const before = JSON.stringify({ records, mappings, checkins, profile, settings });
  const result = analyze(records, { mappings, checkins });
  const snapshot = JSON.stringify(result);
  T.recommendProgram(profile, settings, result);
  assert.equal(JSON.stringify(result), snapshot);
  assert.equal(JSON.stringify({ records, mappings, checkins, profile, settings }), before);
  result.sessions[0].exercises[0].sets[0].reps = 99;
  assert.equal(records[0].exercises[0].sets[0].reps, 10);
});

test("malformed optional containers fail softly without coercing unknown records into training", () => {
  assert.equal(T.analyze(null, null).sessions.length, 0);
  const damaged = record("damaged", date, [null, ex(null), ex([null])], { source: { kind: "visual", hash: "synthetic-hash" } });
  const result = analyze([damaged]);
  assert.equal(result.coverage.workingSets, 0);
  assert.equal(result.coverage.invalidSets, 3);
  assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(result)));
  assert.equal(T.recommendProgram(profile, null, null).status, "incomplete");
  const decimal = T.recommendProgram(profile, { ...settings, sessionMinutes: 20.01 });
  assert.ok(decimal.days.every(row => row.estimatedMinutes <= 20.01));
});
