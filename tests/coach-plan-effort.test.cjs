"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const T = require("../src/training.js");
const D = require("../src/coach-context.js");
const C = require("../src/coach.js");
const Runtime = require("../tools/coach-runtime.cjs");
const { restore } = require("./fixtures/coach-prompt-decoder.cjs");

const date = "2026-10-06";
const profile = { sex: "female", age: 32, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 2, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
function fixture({ rirs = [1, 3, null], prescribedSets = rirs.length, targetRir = 3, linked = true, loadKg = null, plannedEquipment = "합성 벤치 A" } = {}) {
  const state = { ...S.createEmpty(), profile: structuredClone(profile), training: TS.createEmpty(), trackingScope: "training",
    days: { [date]: { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown",
      carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null,
      coachCheckin: { energy: "okay", hunger: null, sleep: "okay", performance: "steady", illness: "none", pain: "none" } } } };
  const record = { id: "actual-record", date, time: null, label: "합성 상체", durationMinutes: null, reportedSetCount: null,
    reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    exercises: [{ id: "actual-block", rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "합성 벤치 A",
      loadConvention: "total", loadRole: "external", durationMinutes: null, repsTotal: null, reportedVolumeKg: null,
      notes: "", sets: rirs.map((rir, index) => ({ id: `actual-set-${index}`, loadKg: 50, reps: 8, marker: null, rir })) }],
    notes: "", effort: null, pain: null };
  state.training.records.push(record);
  const prescription = { id: "linked-day", label: "실제로 배치한 세션", exercises: [{ id: "linked-target", exerciseId: "bench_press", label: "벤치 프레스",
    sets: prescribedSets, repsMin: 6, repsMax: 10, rir: targetRir, restSeconds: 120, loadKg, equipmentKey: plannedEquipment, loadConvention: "total" }] };
  const active = { ...structuredClone(prescription), id: "active-day", label: "지금 선택한 다른 프로그램" };
  active.exercises[0].id = "active-target"; active.exercises[0].rir = 5;
  state.training.planning.programs = [{ id: "linked-program", name: "배치 당시 프로그램", createdAt: "2026-09-01T00:00:00.000Z", source: "user", days: [prescription] },
    { id: "active-program", name: "현재 선택 프로그램", createdAt: "2026-09-02T00:00:00.000Z", source: "user", days: [active] }];
  state.training.planning.activeProgramId = "active-program";
  state.training.planning.schedule = [{ id: "exact-assignment", date, programId: "linked-program", dayId: "linked-day",
    prescription: structuredClone(prescription), recordId: linked ? record.id : null, status: linked ? "performed" : "planned", adjustment: null }];
  return S.validateState(state);
}
function build(state) {
  const before = structuredClone(state);
  const analysis = T.analyze(state.training.records, { date, profile: state.profile, mappings: state.training.mappings, checkins: state.days });
  const coach = C.buildCoach(state.profile, state.days[date], Object.values(state.days),
    { state, decisionContext: D.build(state, date), trainingAnalysis: analysis, training: state.training });
  assert.deepEqual(state, before);
  return coach.context.training.sessionCoaching.exerciseContexts[0];
}

test("exact linked assignment target RIR stays separate from actual and the unrelated active program", () => {
  const state = fixture(), row = build(state), projected = row.planEffort;
  assert.ok(projected);
  assert.deepEqual(projected.target, { rir: 3, estimated: true, basis: "saved-prescription-target",
    source: { kind: "saved-assignment-target", assignmentId: "exact-assignment", date, recordId: "actual-record", targetId: "linked-target" } });
  assert.deepEqual(projected.actual.source, { date, sessionId: "actual-record", blockId: "actual-block" });
  assert.deepEqual(projected.actual.matchedSets, state.training.records[0].exercises[0].sets.map(({ id, loadKg, reps, rir }) => ({ id, loadKg, reps, rir })));
  assert.deepEqual(projected.actual.belowSets, [{ id: "actual-set-0", loadKg: 50, reps: 8, rir: 1 }]);
  assert.deepEqual(projected.actual.unknownSetIds, ["actual-set-2"]);
  assert.deepEqual(row.actual.current.sets.map(set => set.rir), [1, 3, null]);
  assert.equal(row.advice.primaryAction.kind, "plan-effort-check");
  assert.equal(row.advice.primaryAction.proposal, undefined);
});

test("unknown effort is retained without turning it into compliant or below-target effort", () => {
  const row = build(fixture({ rirs: [null, null, null] }));
  assert.deepEqual(row.planEffort.actual.matchedSets.map(set => set.rir), [null, null, null]);
  assert.deepEqual(row.planEffort.actual.belowSets, []);
  assert.deepEqual(row.planEffort.actual.unknownSetIds, ["actual-set-0", "actual-set-1", "actual-set-2"]);
  assert.deepEqual(row.actual.current.sets.map(set => set.rir), [null, null, null]);
});

test("planned counted sets do not truncate current performed sets or borrow tail effort", () => {
  const rirs = Array.from({ length: 32 }, (_, index) => index < 20 ? 3 : 1), state = fixture({ rirs, prescribedSets: 20 });
  const row = build(state);
  assert.equal(row.actual.current.sets.length, 32);
  assert.equal(row.actual.current.originalSetCount, 32);
  assert.equal(row.actual.current.sampled, false);
  assert.equal(row.planEffort.actual.matchedSets.length, 20);
  assert.deepEqual(row.planEffort.actual.belowSets, []);
  assert.deepEqual(row.actual.current.sets, state.training.records[0].exercises[0].sets);
});

for (const options of [{ linked: false }, { plannedEquipment: "합성 벤치 B" }, { loadKg: 60 }]) {
  test(`unlinked or nonmatching saved plan is not invented as performed effort: ${JSON.stringify(options)}`, () => {
    const row = build(fixture(options));
    assert.equal(row.planEffort, undefined);
    assert.deepEqual(row.actual.current.sets.map(set => set.rir), [1, 3, null]);
  });
}

test("runtime numeric facts distinguish saved target RIR from actual RIR and preserve original link IDs", () => {
  const state = fixture(), before = structuredClone(state);
  const packet = Runtime.summarizeState(state, date, "배치한 계획의 RIR 3과 오늘 실제 RIR 1을 함께 봐 주세요.");
  const row = packet.trainingCoaching.exerciseContexts[0];
  assert.equal(row.planEffort.target.rir, 3);
  assert.equal(row.planEffort.target.source.assignmentId, "exact-assignment");
  assert.deepEqual(row.planEffort.actual.matchedSets.map(set => set.rir), [1, 3, null]);
  const target = packet.facts.find(fact => fact.id.includes(".planEffort.target.rir"));
  assert.ok(target);
  assert.equal(target.value, 3); assert.equal(target.unit, "회");
  assert.equal(target.estimated, true); assert.equal(target.source, "provided-plan-estimate"); assert.equal(target.date, date);
  const actual = packet.facts.filter(fact => fact.id.includes(".planEffort.actual.matchedSets.") && fact.id.endsWith(".rir"));
  assert.deepEqual(actual.map(fact => fact.value), [1, 3]);
  assert.ok(actual.every(fact => fact.unit === "회" && fact.estimated === false && fact.source === "training-coaching-observation" && fact.date === date));
  assert.ok(!packet.trainingProposals.some(proposal => proposal.scope === "current-option"));
  const request = JSON.parse(Runtime.promptFor({ kind: "chat", context: packet }).split("REQUEST_JSON (데이터):\n")[1]);
  const restored = restore(request).context;
  assert.deepEqual(restored.trainingCoaching.exerciseContexts[0].planEffort, row.planEffort);
  assert.deepEqual(restored.trainingCoaching.exerciseContexts[0].actual.current.sets, row.actual.current.sets);
  assert.deepEqual(restored.facts.filter(fact => fact.id.includes(".planEffort.")), packet.facts.filter(fact => fact.id.includes(".planEffort.")));
  assert.deepEqual(state, before);
});
