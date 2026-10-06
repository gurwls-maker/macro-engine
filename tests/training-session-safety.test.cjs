"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");

const date = "2026-10-06";
const profile = { age: 30, healthContext: "general", goal: "gain", trainingYears: 2 };
const intents = [undefined, "regular", "return", "deload", "light", "technique", "time-limited", "test"];
const set = (id, loadKg, reps, marker = null) => ({ id, loadKg, reps, marker, rir: null });
function record(id, day, extra = {}) {
  return { id, date: day, label: "합성 Upper", pain: null, source: { kind: "manual" },
    sequence: { order: "unknown", structure: "unknown" }, exercises: [
      { id: id + ":bench", rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "synthetic-rack",
        loadConvention: "total", loadRole: "external", sets: [set(id + ":warmup", 20, 10, "W"),
          set(id + ":heavy", 80, 8), set(id + ":tail", 80, 7), set(id + ":marked", 60, 10, "A")] },
      { id: id + ":row", rawName: "시티드 케이블 로우", exerciseId: "seated_cable_row", equipmentKey: "synthetic-row",
        loadConvention: "total", loadRole: "external", sets: [set(id + ":row-set", 50, 10)] },
      { id: id + ":walk", rawName: "트레드밀", exerciseId: "treadmill", durationMinutes: 15, sets: [] }
    ], ...extra };
}
function sample(extra = {}, checkins = {}, options = {}) {
  const actual = options.records || [record("first", "2026-09-22"), record("second", "2026-09-29"), record("current", date, extra)];
  const before = structuredClone({ actual, checkins });
  const p = { ...profile, ...(options.profile || {}) };
  const analysis = T.analyze(actual, { date: options.date || date, profile: p, checkins, includeCapacityHistory: true });
  const result = T.coachSession(analysis, { profile: p, sessionId: options.sessionId });
  assert.deepEqual({ actual, checkins }, before);
  assert.deepEqual(result.session.exercises.map(ex => ex.sets.map(s => [s.id, s.loadKg, s.reps, s.marker, s.rir])),
    actual.find(row => row.id === result.session.id).exercises.map(ex => ex.sets.map(s => [s.id, s.loadKg, s.reps, s.marker, s.rir])));
  return { actual, analysis, result };
}
const current = fields => ({ [date]: { date, coachCheckin: fields } });
const primaryText = result => [result.sessionCoaching.summary, ...result.sessionCoaching.actions.map(action => action.body),
  ...result.rows.map(row => row.interpretation.nextAction.body)].join(" ");
function noCurrentIncrease(result) {
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
  assert.equal(result.sessionCoaching.coordination.selectedAdjustmentBlockId, null);
  for (const row of result.rows) {
    const coaching = row.interpretation.coaching;
    assert.equal(row.interpretation.nextAction.proposal, undefined);
    assert.deepEqual(coaching.supportingActions, []);
    assert.equal(coaching.progressionCandidate, undefined);
    assert.equal(coaching.question, null);
  }
}

test("session pain takes priority over every stated purpose without assigning pain to every movement", () => {
  for (const pain of ["mild", "stop"]) for (const trainingIntent of intents) {
    const { result } = sample({ pain, trainingIntent });
    assert.match(result.sessionCoaching.summary, /통증을 유발하는 운동은 멈추고/);
    assert.doesNotMatch(result.sessionCoaching.summary, /목적에 맞춰.*이어가|이번에는.*변화부터/);
    assert.equal(result.sessionCoaching.intent, trainingIntent || "unknown");
    assert.equal(result.sessionCoaching.question, null);
    for (const row of result.rows) {
      assert.equal(row.interpretation.nextAction.kind, "individual-care");
      assert.match(row.interpretation.nextAction.body, /통증을 유발하는 운동은 멈추고/);
      assert.deepEqual(row.interpretation.nextAction.focusSetIds, []);
    }
    noCurrentIncrease(result);
    assert.doesNotMatch(primaryText(result), /모든 운동.*통증|벤치.*아프|로우.*아프|통증.*회복됐|진단|근성장/);
    assert.equal(result.session.workingSets, 3);
    assert.equal(result.session.warmupSets, 1);
    assert.equal(result.session.markedSets, 1);
    assert.equal(result.sessionCoaching.composition.blocks.find(block => block.blockId === "current:walk").durationMinutes, 15);
  }
});

test("clinical and age-support boundaries govern the whole session rather than allowing purpose-led progression", () => {
  for (const context of [{ healthContext: "clinical" }, { age: 16 }, { age: 81 }]) for (const trainingIntent of intents) {
    const { result } = sample({ trainingIntent }, {}, { profile: context });
    assert.match(result.sessionCoaching.summary, /현재 상태를 아는 전문가의 개별 계획/);
    assert.doesNotMatch(result.sessionCoaching.summary, /목적에 맞춰.*이어가/);
    for (const row of result.rows) {
      assert.equal(row.interpretation.nextAction.kind, "individual-care");
      assert.match(row.interpretation.nextAction.body, /전문가의 개별 계획/);
    }
    noCurrentIncrease(result);
  }
  const pain = sample({ pain: "stop", trainingIntent: "return" }, {}, { profile: { healthContext: "clinical" } }).result;
  assert.match(pain.sessionCoaching.summary, /통증을 유발하는 운동은 멈추고/);
  assert.ok(pain.rows.every(row => /통증을 유발하는 운동은 멈추고/.test(row.interpretation.nextAction.body)));
});

test("current active illness guards every purpose and time-only action while keeping actual work and purpose intact", () => {
  for (const trainingIntent of intents) {
    const { result } = sample({ trainingIntent }, current({ illness: "active" }));
    assert.match(result.sessionCoaching.summary, /회복을 우선.*의료진/);
    assert.doesNotMatch(result.sessionCoaching.summary, /목적에 맞춰.*이어가|변화부터 챙겨/);
    assert.equal(result.sessionCoaching.intent, trainingIntent || "unknown");
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
    for (const row of result.rows) {
      assert.match(row.interpretation.nextAction.body, /쉬는 쪽을 우선.*의료진.*회복한 뒤/);
      assert.equal(row.interpretation.nextAction.proposal, undefined);
      assert.deepEqual(row.interpretation.coaching.supportingActions, []);
      assert.doesNotMatch(row.interpretation.nextAction.body, /15분을 기준으로|1회 더|9회를 시도|이번 복귀 수행을/);
    }
  }
});

test("recovering illness applies next-day and recurrent-symptom checks even to saved return, test and limited-time purposes", () => {
  for (const trainingIntent of intents) {
    const { result } = sample({ trainingIntent }, current({ illness: "recovering" }));
    assert.match(result.sessionCoaching.summary, /잠정 출발점.*다음 날 반응.*증상이 다시 나타나면 멈추/);
    assert.equal(result.sessionCoaching.intent, trainingIntent || "unknown");
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
    for (const row of result.rows) {
      assert.match(row.interpretation.nextAction.body, /다음 날 반응/);
      assert.match(row.interpretation.nextAction.body, /증상이 다시 나타나면 멈추/);
      assert.equal(row.interpretation.nextAction.proposal, undefined);
      assert.doesNotMatch(row.interpretation.nextAction.body, /한 가지씩 늘려|평소 구성으로 이어가|1회 더|최소 부하 증가/);
      if (trainingIntent && trainingIntent !== "regular") assert.equal(row.interpretation.nextAction.kind, trainingIntent);
    }
    assert.doesNotMatch(primaryText(result), /완치|회복 완료|이전 중량의.*%|최고 기록.*바로 시도/);
  }
});

test("unsafe review and clinical active-illness overlap do not accidentally recommend practicing while ill", () => {
  const actual = [record("first", "2026-09-28"), record("second", "2026-10-01"), record("current", date)];
  actual.forEach(rec => { rec.sequence = { order: "listed", structure: "straight" }; });
  actual.forEach((rec, index) => rec.exercises[1].sets[0].reps = [10, 8, 6][index]);
  actual.forEach(rec => { rec.exercises[1].sets[0].rir = 2; });
  for (const options of [{ records: actual }, { profile: { healthContext: "clinical" } }]) {
    const { result } = sample({}, current({ illness: "active", sleep: "poor", energy: "low" }), options);
    assert.match(result.sessionCoaching.summary, /회복을 우선/);
    for (const row of result.rows) {
      assert.equal(row.interpretation.nextAction.kind, "individual-care");
      assert.match(row.interpretation.nextAction.body, /쉬는 쪽을 우선/);
      assert.doesNotMatch(row.interpretation.nextAction.body, /다음에는 가볍게 연습/);
    }
    noCurrentIncrease(result);
  }
});

test("active illness and pain together do not imply that replacing the painful movement is enough", () => {
  for (const pain of ["mild", "stop"]) for (const trainingIntent of intents) {
    const { result } = sample({ pain, trainingIntent }, current({ illness: "active" }));
    assert.match(result.sessionCoaching.summary, /통증을 유발하는 운동은 멈추고.*다른 운동으로.*회복을 우선/);
    for (const row of result.rows) {
      assert.match(row.interpretation.nextAction.body, /통증을 유발하는 운동은 멈추고.*다른 운동으로.*회복을 우선/);
    }
    noCurrentIncrease(result);
  }
});

test("current check-in pain guards an otherwise pain-unknown workout, but missing pain does not mean no pain", () => {
  for (const pain of ["mild", "stop"]) for (const trainingIntent of intents) {
    const { result } = sample({ trainingIntent }, current({ pain }));
    assert.match(result.sessionCoaching.summary, /통증을 유발하는 운동은 멈추고/);
    assert.ok(result.rows.every(row => row.interpretation.nextAction.kind === "individual-care"));
    noCurrentIncrease(result);
  }
  const unknown = sample({}, current({ illness: null, pain: null })).result;
  assert.doesNotMatch(primaryText(unknown), /통증이 없|회복 완료|통증을 유발하는 운동은 멈추고/);
});

test("active illness also guards old OCR verification without trusting or reproducing its numbers", () => {
  const { result } = sample({ source: { kind: "legacy-ocr" }, trainingIntent: "return" }, current({ illness: "active" }));
  assert.match(result.sessionCoaching.summary, /회복을 우선/);
  for (const row of result.rows) {
    assert.equal(row.interpretation.nextAction.kind, "verify-record");
    assert.match(row.interpretation.nextAction.body, /쉬는 쪽을 우선.*회복한 뒤.*원문과 실제 세트를 확인한 뒤/);
    assert.equal(row.interpretation.nextAction.proposal, undefined);
    assert.deepEqual(row.interpretation.coaching.supportingActions, []);
  }
});

test("pure timed, unquantified and empty sessions retain safety summaries without inventing prescribed sets", () => {
  for (const exercises of [[record("only", date).exercises[2]], [{ id: "unknown", rawName: "미분류 동작", sets: [] }], []]) {
    for (const context of [{ pain: "stop", checkin: {} }, { pain: null, checkin: { illness: "active" } }]) {
      const { result } = sample({ exercises, pain: context.pain, trainingIntent: "return" }, current(context.checkin));
      assert.equal(result.session.workingSets, 0);
      assert.match(result.sessionCoaching.summary, context.pain ? /통증을 유발하는 운동은 멈추고/ : /회복을 우선/);
      assert.doesNotMatch(primaryText(result), /준비 세트로 이어가|15분을 기준으로|실제로 한 운동과 세트를 남기면|1회 더/);
    }
  }
});

test("past-only illness and later explicit none do not create current illness restrictions or claim confirmed recovery", () => {
  for (const illness of ["active", "recovering"]) for (const trainingIntent of intents) {
    const { result } = sample({ trainingIntent, pain: "none" }, {
      "2026-10-02": { coachCheckin: { illness, pain: "stop" } },
      ...current({ illness: "none", pain: "none", energy: "good", sleep: "good", hunger: "okay", performance: "up" })
    });
    assert.equal(result.rows[0].interpretation.coaching.recoveryContext.illness, "none");
    assert.doesNotMatch(primaryText(result), /지금 아픈 상태|질병 뒤 회복 중|통증을 유발하는 운동은 멈추|회복 완료|완치/);
    assert.ok(result.rows.every(row => row.interpretation.nextAction.kind !== "individual-care"));
  }
  const pastOnly = sample({}, { "2026-10-02": { coachCheckin: { illness: "active" } } }).result;
  assert.equal(pastOnly.rows[0].interpretation.coaching.recoveryContext, undefined);
  assert.doesNotMatch(primaryText(pastOnly), /지금 아픈 상태|질병 뒤 회복 중/);
});

test("a good current condition does not resolve an earlier illness field left blank, but conditional coaching stays useful", () => {
  for (const illness of ["active", "recovering"]) for (const trainingIntent of intents) {
    const checkins = { "2026-09-23": { coachCheckin: { illness, pain: "none" } },
      ...current({ illness: null, pain: null, energy: "okay", sleep: "okay", hunger: "okay" }) };
    const { analysis, result } = sample({ trainingIntent }, checkins);
    assert.equal(analysis.recovery.current.positiveReport, true);
    assert.equal(analysis.recovery.current.illness, null);
    assert.equal(analysis.recovery.current.strong, false);
    assert.equal(analysis.recovery.status, "watch");
    assert.deepEqual(analysis.recovery.unresolvedHealthReports, [{ field: "illness", date: "2026-09-23", value: illness }]);
    assert.match(result.sessionCoaching.summary, /2026-09-23.*컨디션과 수면이 괜찮다고.*아직 새로 확인되지/);
    assert.match(result.sessionCoaching.summary, /증상이 남아 있다면.*가라앉았다면.*이번 구성을 잠정 기준으로/);
    assert.doesNotMatch(result.sessionCoaching.summary, /지금 아픈 상태|질병 뒤 회복 중이니|회복 완료|완치|운동 불가/);
    assert.equal(result.sessionCoaching.intent, trainingIntent || "unknown");
    for (const row of result.rows) {
      assert.equal(row.interpretation.nextAction.kind, "health-follow-up");
      assert.deepEqual(row.interpretation.coaching.healthFollowUp.reports, analysis.recovery.unresolvedHealthReports);
      assert.equal(row.interpretation.coaching.facts.current.source.date, date);
      assert.doesNotMatch(row.interpretation.coaching.assessment, /작은 변화를 시험|한 세트.*9회/);
    }
    noCurrentIncrease(result);
  }
});

test("none resolves only its own health field and clearing both restores the actual stable-work progression", () => {
  const actual = ["2026-09-22", "2026-09-29", date].map((day, index) => record("stable:" + index, day));
  actual.forEach(rec => { rec.exercises[0].sets[2].reps = 8; });
  for (const cleared of ["illness", "pain", "both"]) {
    const checkins = { "2026-09-23": { coachCheckin: { illness: "active", pain: "stop" } },
      ...current({ illness: cleared === "illness" || cleared === "both" ? "none" : null,
        pain: cleared === "pain" || cleared === "both" ? "none" : null,
        energy: "okay", sleep: "okay", hunger: "okay" }) };
    const { result, analysis } = sample({}, checkins, { records: actual });
    if (cleared === "both") {
      assert.deepEqual(analysis.recovery.unresolvedHealthReports, []);
      assert.equal(result.rows[0].interpretation.nextAction.kind, "progression-option");
      assert.equal(result.rows[0].interpretation.nextAction.proposal.targetReps, 9);
      assert.equal(result.rows[1].interpretation.nextAction.proposal.targetReps, 11);
      assert.doesNotMatch(primaryText(result), /아직 새로 확인되지|2026-09-23|회복 완료/);
    } else {
      const remaining = cleared === "illness" ? "pain" : "illness";
      assert.deepEqual(analysis.recovery.unresolvedHealthReports.map(row => row.field), [remaining]);
      assert.ok(result.rows.every(row => row.interpretation.nextAction.kind === "health-follow-up"));
      assert.match(result.sessionCoaching.summary, remaining === "pain" ? /2026-09-23.*통증이 있다고/ : /2026-09-23.*아픈 상태라고/);
      assert.doesNotMatch(result.sessionCoaching.summary, remaining === "pain" ? /질병|아픈 상태라고/ : /통증이 있다고/);
      noCurrentIncrease(result);
    }
  }
});

test("unresolved report dates stop at the selected historical cutoff and invalid dates cannot create a follow-up", () => {
  const actual = [record("first", "2026-09-22"), record("second", "2026-09-29")];
  for (const checkins of [{ "2026-10-01": { coachCheckin: { illness: "active", pain: "stop" } } },
    { "not-a-date": { coachCheckin: { illness: "active", pain: "stop" } } }]) {
    const { analysis, result } = sample({}, checkins, { records: actual, date: "2026-09-29" });
    assert.deepEqual(analysis.recovery.healthReports, []);
    assert.ok(result.rows.every(row => row.interpretation.nextAction.kind !== "health-follow-up"));
  }
  const checkins = { "2026-09-23": { coachCheckin: { illness: "active", pain: "none" } },
    "2026-10-01": { coachCheckin: { illness: "none", pain: "none" } } };
  const { analysis, result } = sample({}, checkins, { records: actual, date: "2026-09-29" });
  assert.deepEqual(analysis.recovery.unresolvedHealthReports, [{ field: "illness", date: "2026-09-23", value: "active" }]);
  assert.ok(result.rows.every(row => row.interpretation.nextAction.kind === "health-follow-up"));
  assert.doesNotMatch(primaryText(result), /2026-10-01|회복 완료/);
});

test("future illness, pain and fitness records cannot affect an explicitly selected historical session", () => {
  const baseline = [record("first", "2026-09-22"), record("second", "2026-09-29", { trainingIntent: "return", pain: "none" })];
  const future = [...baseline, record("future", date, { pain: "stop" })];
  const fields = current({ illness: "active", pain: "stop" });
  const early = sample({}, {}, { records: baseline, date: "2026-09-29", sessionId: "second" }).result;
  const selected = sample({}, fields, { records: future, sessionId: "second" }).result;
  assert.equal(selected.session.date, "2026-09-29");
  assert.equal(selected.sessionCoaching.summary, early.sessionCoaching.summary);
  assert.deepEqual(selected.rows.map(row => row.interpretation.nextAction), early.rows.map(row => row.interpretation.nextAction));
  assert.doesNotMatch(primaryText(selected), /지금 아픈|통증을 유발하는 운동은 멈추/);
  assert.ok(selected.rows.every(row => row.interpretation.coaching.recoveryContext === undefined));
});

test("today's illness may guide the latest earlier work without rewriting that work's source date", () => {
  const actual = [record("first", "2026-09-22"), record("second", "2026-09-29"), record("last-work", "2026-10-05", { trainingIntent: "return" })];
  const { result } = sample({}, current({ illness: "active" }), { records: actual });
  assert.equal(result.session.date, "2026-10-05");
  assert.match(result.sessionCoaching.summary, /회복을 우선/);
  for (const row of result.rows) {
    assert.equal(row.interpretation.coaching.recoveryContext.date, date);
    assert.equal(row.interpretation.coaching.facts.current.source.date, "2026-10-05");
    assert.match(row.interpretation.nextAction.body, /쉬는 쪽을 우선/);
  }
});

test("the actual month-long pain and illness counterfactuals keep session summaries and individual next actions consistent", () => {
  for (const id of ["pain-stop", "illness-active", "illness-recovering"]) {
    const specification = Fixtures.REQUIREMENT_CATALOG.find(row => row.id === id);
    const scenario = Fixtures.buildCounterfactual("strength", specification);
    for (const checkpoint of scenario.checkpoints.slice(2)) {
      const state = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), before = structuredClone(state);
      const actual = state.training.records.at(-1);
      const analysis = T.analyze(state.training.records, { date: checkpoint.date, profile: state.profile,
        checkins: state.days, mappings: state.training.mappings, includeCapacityHistory: true });
      const result = T.coachSession(analysis, { profile: state.profile, sessionId: actual.id, planning: state.training.planning });
      assert.equal(result.rows.length, 3);
      assert.doesNotMatch(result.sessionCoaching.summary, /복귀 운동의 목적에 맞춰 다음 운동을 이어가요/);
      const pattern = id === "pain-stop" ? /통증을 유발하는 운동은 멈추고/ : id === "illness-active" ? /회복을 우선/ : /질병 뒤 회복 중/;
      assert.match(result.sessionCoaching.summary, pattern);
      for (const row of result.rows) {
        assert.match(row.interpretation.nextAction.body, id === "pain-stop" ? /통증을 유발하는 운동은 멈추고/ : id === "illness-active" ? /쉬는 쪽을 우선/ : /다음 날 반응/);
        const raw = actual.exercises.find(ex => ex.id === row.blockId);
        assert.deepEqual(row.interpretation.coaching.facts.current.sets.map(s => [s.id, s.loadKg, s.reps]),
          raw.sets.filter(s => s.marker === null).map(s => [s.id, s.loadKg, s.reps]));
      }
      assert.deepEqual(state, before);
    }
  }
});
