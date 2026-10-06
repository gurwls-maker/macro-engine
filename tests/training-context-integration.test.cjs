"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../src/training.js");
const Store = require("../src/training-store.js");

const day = "2026-10-06";
const profile = extra => ({ age: 30, healthContext: "general", goal: "gain", trainingYears: 2, ...extra });
const exercise = (id, values, extra = {}) => ({ id, rawName: "바벨 벤치 프레스", exerciseId: "bench_press",
  equipmentKey: "합성 랙 A", loadConvention: "total", loadRole: "external",
  sets: values.map(([loadKg, reps, rir = null], index) => ({ id: id + "-set-" + index, loadKg, reps, rir, marker: null })), ...extra });
const record = (id, date, blocks, extra = {}) => ({ id, date, time: "18:00", label: "합성 운동",
  source: { kind: "manual", hash: null }, sequence: { order: "unknown", structure: "unknown" }, exercises: blocks, ...extra });
const one = (id, date, values, extra = {}) => record(id, date, [exercise(id + "-bench", values)], extra);
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function review(records, options = {}) {
  const p = profile(options.profile);
  return T.coachSession(T.analyze(records, { date: day, profile: p, includeCapacityHistory: true }), {
    profile: p, ...options, ...(options.profile ? { profile: p } : {}) });
}
const signals = row => row.interpretation.coaching.signals.map(signal => signal.kind);
const allActions = row => [row.interpretation.coaching.primaryAction, ...row.interpretation.coaching.supportingActions];
const incrementKinds = new Set(["progression-option", "reps-option", "load-option"]);
const actionText = row => allActions(row).map(action => action.body).join(" ");
function assertContract(row, current) {
  const coaching = row.interpretation.coaching;
  assert.ok(coaching, "record coaching includes the composed context decision");
  assert.equal(typeof coaching.assessment, "string"); assert.ok(coaching.assessment.length);
  assert.ok(coaching.facts && typeof coaching.facts === "object");
  assert.ok(Array.isArray(coaching.signals)); assert.ok(Array.isArray(coaching.supportingActions));
  assert.equal(typeof coaching.priority, "number"); assert.ok(Number.isFinite(coaching.priority));
  assert.equal(row.interpretation.nextAction.kind, coaching.primaryAction.kind);
  assert.equal(row.interpretation.nextAction.body, coaching.primaryAction.body);
  const ids = new Set(current.sets.map(set => set.id));
  for (const action of allActions(row)) {
    assert.equal(typeof action.kind, "string"); assert.equal(typeof action.title, "string"); assert.equal(typeof action.body, "string");
    assert.ok(Array.isArray(action.focusSetIds));
    assert.ok(action.focusSetIds.every(id => ids.has(id)), "next actions target only actual sets in this exercise block");
    if (action.proposal) {
      const proposal = action.proposal, source = current.sets.find(set => set.id === proposal.setId);
      assert.ok(source); assert.equal(source.marker, null);
      assert.equal(proposal.kind, "single-set-reps");
      assert.equal(proposal.loadKg, source.loadKg); assert.equal(proposal.baseReps, source.reps);
      assert.equal(proposal.targetReps, source.reps + 1); assert.ok(proposal.targetReps <= 100000);
      assert.ok(action.focusSetIds.includes(proposal.setId));
    }
  }
  for (const signal of coaching.signals) {
    assert.equal(typeof signal.kind, "string"); assert.ok(Array.isArray(signal.sourceRefs));
    for (const source of signal.sourceRefs) {
      assert.equal(typeof source.date, "string"); assert.equal(typeof source.sessionId, "string");
      assert.equal(typeof source.blockId, "string"); assert.ok(Array.isArray(source.setIds));
    }
  }
  return coaching;
}

test("composed coaching keeps actual source references and a compatible next action without mutating records", () => {
  const records = freeze([one("old", "2026-09-28", [[50, 10], [50, 8]]), one("current", day, [[50, 10], [50, 10]])]);
  const before = structuredClone(records), row = review(records).rows[0];
  const coaching = assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("tail-improved"));
  const sourceIds = new Set(coaching.signals.flatMap(signal => signal.sourceRefs.map(source => source.sessionId)));
  assert.ok(sourceIds.has("old")); assert.ok(sourceIds.has("current"));
  assert.deepEqual(records, before);
});

test("a first ordinary same-load improvement stays visible without older peaks or recorded RIR", () => {
  const records = [one("old", "2026-09-28", [[40, 10]]), one("current", day, [[40, 12]])];
  const row = review(records).rows[0], coaching = assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("whole-work-improved"));
  assert.ok(!signals(row).includes("recovering-working-performance"));
  assert.match(coaching.assessment, /40kg.*10회.*40kg.*12회/);
  assert.equal(coaching.primaryAction.kind, "consolidate-improved-work");
  assert.match(coaching.primaryAction.body, /40kg.*12회/);
  assert.doesNotMatch(coaching.assessment + " " + actionText(row), /근력이 늘|근성장률|익숙한 구성을 이어간/);
  assert.ok(records.every(record => record.exercises[0].sets[0].rir === null));
  assert.equal(row.progression.status, "incomparable", "useful recorded changes do not turn missing effort into a matched strength judgment");
});

test("repeated same-load decreases keep the latest performed baseline and source-bound trend without a causal diagnosis", () => {
  const records = [one("first", "2026-09-21", [[50, 12]]), one("second", "2026-09-28", [[50, 10]]),
    one("current", day, [[50, 8]])];
  const row = review(records).rows[0], coaching = assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("whole-work-lower"));
  assert.equal(coaching.primaryAction.kind, "reestablish-working-reps");
  assert.match(coaching.assessment, /50kg.*10회.*50kg.*8회/);
  assert.match(coaching.primaryAction.body, /50kg.*8회/);
  assert.ok(!incrementKinds.has(coaching.primaryAction.kind));
  assert.doesNotMatch(coaching.assessment + " " + actionText(row), /부상|회복 실패|디로드해야|피로가 누적됐/);
  assert.ok(coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "second"));
});

test("recent painful and legacy OCR sessions remain recorded facts rather than ordinary coaching baselines", () => {
  for (const excluded of [{ pain: "mild" }, { pain: "stop" }, { source: { kind: "legacy-ocr", hash: null } }]) {
    const records = [one("ordinary", "2026-09-21", [[50, 10]]), one("excluded", "2026-09-28", [[50, 4]], excluded),
      one("current", day, [[50, 8]])], before = structuredClone(records);
    const analysis = T.analyze(records, { date: day, includeCapacityHistory: true });
    assert.ok(analysis.sessions.some(session => session.id === "excluded"), "the actual session is retained for diary review");
    const row = T.coachSession(analysis, { profile: profile() }).rows[0], coaching = assertContract(row, records[2].exercises[0]);
    assert.equal(row.interpretation.reference.sessionId, "ordinary");
    assert.ok(signals(row).includes("whole-work-lower"));
    assert.ok(!signals(row).includes("whole-work-improved"));
    assert.ok(!coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "excluded"));
    assert.deepEqual(records, before);
  }
});

test("a conflicting historical load interpretation cannot become a normal performance baseline", () => {
  const block = (id, values, rawName = "벤치 프레스") => exercise(id, values, { rawName, loadConvention: "as-recorded" });
  const records = [record("ordinary", "2026-09-21", [block("ordinary-bench", [[50, 10]])]),
    record("conflicting", "2026-09-28", [block("conflicting-bench", [[50, 4]], "[바벨] 덤벨 벤치 프레스")]),
    record("current", day, [block("current-bench", [[50, 8]])])], before = structuredClone(records);
  const analysis = T.analyze(records, { date: day, includeCapacityHistory: true });
  assert.equal(analysis.sessions.find(session => session.id === "conflicting").exercises[0].ruleConflict, true);
  const row = T.coachSession(analysis, { profile: profile() }).rows[0], coaching = assertContract(row, records[2].exercises[0]);
  assert.equal(row.interpretation.reference.sessionId, "ordinary");
  assert.ok(signals(row).includes("whole-work-lower"));
  assert.ok(!coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "conflicting"));
  assert.deepEqual(records, before);
});

test("an unchanged first set cannot trigger progression after the heavier work disappeared", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [70, 5]]),
    one("second", "2026-09-28", [[50, 10], [70, 5]]), one("current", day, [[50, 10]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("heavier-work-removed"));
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.ok(!incrementKinds.has(row.interpretation.nextAction.kind));
  assert.match(row.interpretation.coaching.assessment + " " + actionText(row), /70kg|무거운/);
});

for (const [priorWarmup, currentWarmup] of [[true, false], [false, true]]) {
  test("adding or removing a warmup does not hide the unchanged first ordinary set when heavier work was removed (" + priorWarmup + "/" + currentWarmup + ")", () => {
    const prior = one("old", "2026-09-28", [[40, 10], [50, 5]]), current = one("current", day, [[40, 10]]);
    if (priorWarmup) prior.exercises[0].sets.unshift({ id: "old-warmup", loadKg: 20, reps: 12, rir: null, marker: "W" });
    if (currentWarmup) current.exercises[0].sets.unshift({ id: "current-warmup", loadKg: 20, reps: 12, rir: null, marker: "W" });
    const records = [prior, current], row = review(records).rows[0], coaching = assertContract(row, current.exercises[0]);
    assert.ok(signals(row).includes("heavier-work-removed"));
    assert.ok(!signals(row).includes("stable-whole-work"));
    assert.match(coaching.assessment, /첫 10회가 같아도/);
    assert.equal(coaching.facts.current.setCount, 1); assert.equal(coaching.facts.previous.setCount, 2);
    assert.ok(coaching.facts.current.source.setIds.every(id => !id.includes("warmup")));
    assert.ok(!incrementKinds.has(coaching.primaryAction.kind));
  });
}

test("lower loads with additional sets are described as a changed dose rather than only a lighter session", () => {
  const records = [one("old", "2026-09-28", [[20, 15], [20, 15]]), one("current", day, [[17, 15], [17, 15], [17, 15]])];
  const row = review(records).rows[0], coaching = assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("heavier-work-removed"));
  assert.match(coaching.assessment, /중량은 낮췄지만.*2개에서 3개로 늘/);
  assert.equal(coaching.facts.previous.setCount, 2); assert.equal(coaching.facts.current.setCount, 3);
  assert.equal(coaching.facts.previous.totalReps, 30); assert.equal(coaching.facts.current.totalReps, 45);
  assert.ok(!incrementKinds.has(coaching.primaryAction.kind));
  assert.doesNotMatch(coaching.assessment + " " + actionText(row), /운동량이 줄었|볼륨.*감소|회복 실패/);
});

test("warmup role changes preserve exact raw sets while four ordinary sets become three heavier ordinary sets", () => {
  const prior = one("old", "2026-09-28", [[55, 12], [70, 10], [100, 15], [100, 15]]), current = one("current", day, [[100, 15], [100, 15], [100, 15]]);
  current.exercises[0].sets.unshift({ id: "current-warmup-55", loadKg: 55, reps: 12, marker: "W", rir: null },
    { id: "current-warmup-70", loadKg: 70, reps: 10, marker: "W", rir: null });
  const records = [prior, current], before = structuredClone(records), result = review(records), row = result.rows[0];
  const coaching = assertContract(row, current.exercises[0]);
  assert.equal(result.session.workingSets, 3); assert.equal(result.session.warmupSets, 2);
  assert.equal(result.sessionCoaching.sessionChanges.previousWorkingSets, 4);
  assert.deepEqual(coaching.facts.current.warmupSets.map(set => [set.id, set.loadKg, set.reps, set.marker]),
    [["current-warmup-55", 55, 12, "W"], ["current-warmup-70", 70, 10, "W"]]);
  const reclassified = coaching.signals.find(signal => signal.kind === "work-reclassified-as-warmup");
  assert.ok(reclassified);
  assert.deepEqual(reclassified.sourceRefs[0], { date: day, sessionId: "current", blockId: "current-bench", setIds: ["current-warmup-55", "current-warmup-70"] });
  assert.deepEqual(coaching.primaryAction.focusSetIds, current.exercises[0].sets.filter(set => set.marker === null).map(set => set.id));
  assert.equal(coaching.primaryAction.kind, "hold-redistributed-work");
  assert.match(coaching.assessment, /총 일반 세트는 4개에서 3개.*100kg.*2세트에서 3세트.*준비 세트/);
  assert.deepEqual(records, before);
});

for (const upperDate of ["2026-09-18", "2026-09-21"]) {
  test("exercise history names its separate Upper source rather than the whole-session Push comparison (" + upperDate + ")", () => {
    const records = [record("old-upper", upperDate, [exercise("upper-bench", [[50, 10]])], { label: "Upper", time: "17:00" }),
      record("old-push", "2026-09-21", [exercise("push-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 C" })], { label: "Push", time: "18:00" }),
      record("current-push", day, [exercise("current-bench", [[55, 10]]),
        exercise("current-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 C" })], { label: "Push" })];
    const before = structuredClone(records), result = review(records), row = result.rows.find(row => row.blockId === "current-bench");
    const coaching = assertContract(row, records[2].exercises[0]);
    assert.equal(result.sessionCoaching.sessionChanges.previousSessionId, "old-push");
    assert.equal(result.sessionCoaching.sessionChanges.previousDate, "2026-09-21");
    assert.equal(row.interpretation.reference.sessionId, "old-upper");
    assert.equal(row.interpretation.reference.date, upperDate);
    assert.equal(row.interpretation.reference.label, "Upper");
    assert.match(coaching.assessment, new RegExp(upperDate + " Upper.*50kg.*55kg"));
    assert.ok(coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "old-upper" && source.blockId === "upper-bench"));
    assert.ok(!coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "old-push"));
    assert.deepEqual(records, before);
  });
}

test("an unchanged first set and better tail sets are improvement, not a whole-work plateau", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 8], [50, 6]]),
    one("second", "2026-09-28", [[50, 10], [50, 9], [50, 8]]), one("current", day, [[50, 10], [50, 10], [50, 10]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("tail-improved"));
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.match(row.interpretation.coaching.assessment, /늘|좋아|개선|채웠|올라/);
  assert.doesNotMatch(row.interpretation.coaching.assessment + " " + actionText(row), /정체/);
});

test("a modest tail decline is not hidden by the first set being unchanged or a 70-percent pacing threshold", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10], [50, 10]]),
    one("second", "2026-09-28", [[50, 10], [50, 9], [50, 9]]), one("current", day, [[50, 10], [50, 9], [50, 8]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("tail-lower"));
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.ok(!incrementKinds.has(row.interpretation.nextAction.kind));
  assert.ok(allActions(row).some(action => action.kind === "restore-tail"));
});

test("doubling recorded sets is itself a dosage change and does not suggest another immediate increase", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10]]),
    one("second", "2026-09-28", [[50, 10], [50, 10]]), one("current", day, [[50, 10], [50, 10], [50, 10], [50, 10]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("work-expanded"));
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.equal(row.interpretation.nextAction.kind, "hold-expanded-work");
  assert.ok(!allActions(row).some(action => incrementKinds.has(action.kind)));
  assert.match(row.interpretation.coaching.assessment, /세트|늘|추가/);
});

test("an unreadable additional general set cannot fall back to a first-set-only whole-work progression", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10]]),
    one("second", "2026-09-28", [[50, 10], [50, 10]]), one("current", day, [[50, 10], [50, 10], [50, null]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.ok(!incrementKinds.has(row.interpretation.nextAction.kind), "a partial block cannot revive legacy first-set-only progression");
  assert.match(actionText(row), /50kg|10회/);
  assert.equal(records[2].exercises[0].sets[2].reps, null);
});

test("a new heavy set and falling backoff repetitions preserve both contexts in the next decision", () => {
  const records = [one("old", "2026-09-28", [[80, 10], [80, 10], [80, 8]]), one("current", day, [[100, 3], [80, 6], [80, 4]])];
  const row = review(records).rows[0]; assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).some(kind => ["new-heavy-exposure", "changed-load-emphasis"].includes(kind)));
  assert.ok(allActions(row).some(action => action.kind === "restore-tail"));
  assert.match(actionText(row), /80kg/);
  assert.match(actionText(row), /휴식|쉬|세트 사이|회복 시간/);
  assert.match(row.interpretation.coaching.assessment + " " + actionText(row), /100kg/);
  assert.doesNotMatch(actionText(row), /추정 1RM.*목표|최고 중량.*시도/);
});

test("unchanged base sets plus fewer reps only in the later heavy segment lead to a local heavy-set adjustment", () => {
  const records = [one("old", "2026-09-28", [[60, 12], [60, 12], [60, 12], [75, 8]]),
    one("current", day, [[60, 12], [60, 12], [60, 12], [75, 5]])];
  const row = review(records).rows[0]; assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("base-held-heavy-lower"));
  assert.equal(row.interpretation.nextAction.kind, "keep-base-check-heavy");
  assert.match(actionText(row), /60kg/); assert.match(actionText(row), /75kg/);
  assert.doesNotMatch(row.interpretation.coaching.assessment, /전체 수행.*떨어|전반.*저하|피로가 누적됐|회복이 부족해/);
});

test("unknown exercise order permits local performance interpretation without inventing actual fatigue or sequence", () => {
  const records = [one("old", "2026-09-28", [[60, 12], [60, 12], [75, 8]]), one("current", day, [[60, 12], [60, 12], [75, 5]])];
  const row = review(records).rows[0]; assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("base-held-heavy-lower"));
  assert.doesNotMatch(row.interpretation.coaching.assessment + " " + actionText(row), /앞 운동 때문에|선행 운동 때문에|피로가 누적됐|회복이 부족해졌|먼저 .*운동했기 때문에/);
});

test("a heavy-first layout does not acquire an invented last-heavy position when lighter work was maintained", () => {
  const records = [one("old", "2026-09-28", [[75, 8], [60, 12], [60, 12]]),
    one("current", day, [[75, 5], [60, 12], [60, 12]])];
  const row = review(records).rows[0]; assertContract(row, records[1].exercises[0]);
  assert.ok(signals(row).includes("base-held-heavy-lower"));
  assert.doesNotMatch(row.interpretation.coaching.assessment, /마지막 무거운/);
  assert.doesNotMatch(actionText(row), /앞 구간 뒤에|기본 구간 뒤에/);
});

test("opposite tail changes do not cancel out into whole-work stability merely because total reps are equal", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10], [50, 8]]),
    one("second", "2026-09-28", [[50, 10], [50, 10], [50, 8]]), one("current", day, [[50, 10], [50, 12], [50, 6]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(!signals(row).includes("stable-whole-work"));
  assert.ok(signals(row).some(kind => ["mixed-tail-change", "mixed-working-change", "tail-lower"].includes(kind)));
  assert.match(row.interpretation.coaching.assessment + " " + actionText(row), /12|6/);
  assert.ok(allActions(row).some(action => /휴식|쉬|세트 사이|회복 시간/.test(action.body)));
});

test("actual zero RIR on a tail set remains a local effort constraint even without subjective feedback", () => {
  const records = [one("old", "2026-09-28", [[50, 10], [50, 9], [50, 8]]),
    one("current", day, [[50, 10], [50, 9], [50, 8, 0]])], block = records[1].exercises[0];
  const row = review(records).rows[0]; assertContract(row, block);
  const localLimit = allActions(row).find(action => action.kind === "ease" && action.focusSetIds.includes(block.sets[2].id));
  assert.ok(localLimit, "known tail-set RIR zero is not lost because the first set has no RIR");
  assert.ok(allActions(row).filter(action => incrementKinds.has(action.kind)).every(action => !action.focusSetIds.includes(block.sets[2].id)));
  assert.equal(block.sets[0].rir, null); assert.equal(block.sets[1].rir, null); assert.equal(block.sets[2].rir, 0);
});

test("comfortable feedback on one set does not hide actual zero RIR on another set", () => {
  const current = one("current", day, [[50, 10], [50, 9, 0]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 50, reps: 10, feeling: "comfortable" };
  const row = review([one("old", "2026-09-28", [[50, 10], [50, 9]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "reps-option");
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[0].id]);
  assert.ok(coaching.supportingActions.some(action => ["ease", "maintain-work", "hold-limit-set"].includes(action.kind)
    && action.focusSetIds.includes(block.sets[1].id)), "a separately recorded limit has its own local non-increase action");
  assert.ok(allActions(row).filter(action => incrementKinds.has(action.kind)).every(action => !action.focusSetIds.includes(block.sets[1].id)));
  assert.deepEqual(block.sets.map(set => set.rir), [null, 0]);
});

test("comfortable feedback on the heavy set changes only that set while backoff rest advice survives", () => {
  const current = one("current", day, [[100, 3], [80, 6], [80, 4]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 100, reps: 3, feeling: "comfortable" };
  const records = [one("old", "2026-09-28", [[80, 10], [80, 10], [80, 8]]), current];
  const row = review(records).rows[0], coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "reps-option");
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[0].id]);
  assert.match(coaching.primaryAction.body, /100kg/); assert.match(coaching.primaryAction.body, /4회/);
  const backoff = coaching.supportingActions.find(action => action.kind === "restore-tail");
  assert.ok(backoff, "selected heavy-set comfort does not erase an independent backoff action");
  assert.ok(backoff.focusSetIds.some(id => block.sets.slice(1).some(set => set.id === id)));
  assert.match(backoff.body, /80kg/); assert.match(backoff.body, /휴식|쉬|세트 사이|회복 시간/);
  assert.ok(block.sets.every(set => set.rir === null), "subjective feeling is never converted into numeric RIR");
});

test("comfortable heavy feedback preserves backoff advice when the heavy load was already used before", () => {
  const current = one("current", day, [[100, 3], [80, 6], [80, 4]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 100, reps: 3, feeling: "comfortable" };
  const row = review([one("old", "2026-09-28", [[100, 3], [80, 8], [80, 8]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "reps-option");
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[0].id]);
  const backoff = coaching.supportingActions.find(action => action.kind === "restore-tail");
  assert.ok(backoff, "feedback replacement also retains an independent contextual primary action as support");
  assert.match(backoff.body, /휴식|쉬|세트 사이|회복 시간/);
  assert.ok(backoff.focusSetIds.every(id => block.sets.slice(1).some(set => set.id === id)));
});

test("a selected backoff set reported at the limit cannot become a whole-exercise load reduction", () => {
  const current = one("current", day, [[100, 3], [80, 6], [80, 4]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[2].id, loadKg: 80, reps: 4, feeling: "limit" };
  const row = review([one("old", "2026-09-28", [[80, 10], [80, 10], [80, 8]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "ease");
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[2].id]);
  assert.match(coaching.primaryAction.body, /80kg/);
  assert.ok(coaching.signals.some(signal => signal.sourceRefs.some(source => source.setIds.includes(block.sets[0].id))),
    "the heavy-set evidence is retained after selected backoff feedback");
});

test("recent recovery from six to eight reps remains the main trend even below a prior 42-day best of ten", () => {
  const records = [one("peak", "2026-09-14", [[80, 10], [80, 8]]),
    one("recent", "2026-09-28", [[80, 6], [80, 6]]), one("current", day, [[80, 8], [80, 8]])];
  const row = review(records).rows[0]; assertContract(row, records[2].exercises[0]);
  assert.ok(signals(row).includes("recovering-working-performance"));
  assert.match(row.interpretation.coaching.assessment, /늘|좋아|개선|회복|올라|되찾|더 이어/);
  assert.notEqual(row.interpretation.nextAction.title, "이번 수행부터 다시 맞추기");
  assert.equal(row.interpretation.performance.model.previous.date, "2026-09-14", "peak estimate remains available as a separate reference");
  assert.ok(row.interpretation.coaching.signals.flatMap(signal => signal.sourceRefs).some(source => source.sessionId === "recent"));
});

test("whole-work stability separates weight maintenance or loss from an optional source-bound training progression", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10]]), one("second", "2026-09-28", [[50, 10], [50, 10]]),
    one("current", day, [[50, 10], [50, 10]])];
  for (const goal of ["maintain", "lose"]) {
    const row = review(records, { profile: { goal } }).rows[0]; assertContract(row, records[2].exercises[0]);
    assert.ok(signals(row).includes("stable-whole-work"));
    assert.equal(row.interpretation.nextAction.kind, "progression-option");
    assert.match(row.interpretation.nextAction.body, /유지하는 것도 선택|회복과 세트 여유/);
    assert.deepEqual(row.interpretation.nextAction.proposal, { kind: "single-set-reps", setId: "current-bench-set-0", loadKg: 50, baseReps: 10, targetReps: 11 });
  }
  const gain = review(records, { profile: { goal: "gain" } }).rows[0];
  assert.ok(signals(gain).includes("stable-whole-work"));
  assert.equal(gain.interpretation.nextAction.kind, "progression-option");
});

test("two machines used in parallel keep independent raw histories and scoped actions, not a pooled kilogram baseline", () => {
  const currentA = exercise("current-A", [[50, 10]], { rawName: "합성 머신 A 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 A" });
  const currentB = exercise("current-B", [[80, 6]], { rawName: "합성 머신 B 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 B" });
  const records = [record("old", "2026-09-28", [exercise("old-A", [[45, 10]], { rawName: currentA.rawName, exerciseId: currentA.exerciseId, equipmentKey: currentA.equipmentKey }),
    exercise("old-B", [[80, 8]], { rawName: currentB.rawName, exerciseId: currentB.exerciseId, equipmentKey: currentB.equipmentKey })]), record("current", day, [currentA, currentB])];
  const result = review(records);
  for (const block of [currentA, currentB]) {
    const row = result.rows.find(row => row.blockId === block.id), coaching = assertContract(row, block);
    const previousBlocks = coaching.signals.flatMap(signal => signal.sourceRefs).filter(source => source.sessionId === "old").map(source => source.blockId);
    assert.ok(previousBlocks.every(id => id === (block === currentA ? "old-A" : "old-B")));
    assert.ok(allActions(row).every(action => action.focusSetIds.every(id => block.sets.some(set => set.id === id))));
  }
});

test("repeated same-machine blocks preserve separate current facts rather than choosing an arbitrary prior block", () => {
  const A = (id, values) => exercise(id, values, { rawName: "합성 머신 A 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 A" });
  const B = (id, values) => exercise(id, values, { rawName: "합성 머신 B 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 B" });
  const records = [record("old", "2026-09-28", [A("old-A1", [[50, 10]]), B("old-B", [[80, 10]]), A("old-A2", [[50, 6]])]),
    record("current", day, [A("current-A1", [[50, 10]]), B("current-B", [[80, 10]]), A("current-A2", [[50, 8]])])];
  const result = review(records); assert.equal(result.rows.length, 3);
  for (const block of records[1].exercises.filter(block => block.equipmentKey === "합성 머신 A")) {
    const row = result.rows.find(row => row.blockId === block.id), coaching = assertContract(row, block);
    assert.equal(row.interpretation.reference, null);
    assert.ok(!coaching.signals.flatMap(signal => signal.sourceRefs).some(source => ["old-A1", "old-A2"].includes(source.blockId)),
      "an ambiguous prior pairing is not promoted to a numeric coaching signal");
    assert.ok(!signals(row).includes("stable-whole-work"));
  }
});

test("an exact linked plan may constrain the primary action without erasing independent backoff support", () => {
  const current = one("current", day, [[100, 3], [80, 6], [80, 4]]), block = current.exercises[0];
  const planning = { schedule: [{ id: "assignment", date: day, recordId: current.id, status: "performed",
    prescription: { exercises: [{ id: "target", exerciseId: "bench_press", equipmentKey: block.equipmentKey, loadConvention: "total", sets: 3, repsMin: 8, repsMax: 10, rir: 2 }] } }] };
  const row = review([one("old", "2026-09-28", [[80, 10], [80, 10], [80, 8]]), current], { planning }).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "plan-check");
  assert.match(coaching.primaryAction.body, /8.*10/);
  const support = coaching.supportingActions.find(action => action.kind === "plan-set-recovery");
  assert.ok(support);
  assert.deepEqual(coaching.primaryAction.focusSetIds, block.sets.map(set => set.id));
  assert.deepEqual(support.focusSetIds, block.sets.slice(1).map(set => set.id));
  assert.match(support.body, /8~10회를 제어할 수 있는 부담/);
  assert.doesNotMatch(support.body, /이번 반복으로 이어가|1회 더/);
  assert.match(coaching.supportingActions.map(action => action.body).join(" "), /휴식|쉬|세트 사이|회복 시간/);
});

test("training purpose and pain constrain actions while keeping the actual context signals and facts", () => {
  const old = one("old", "2026-09-28", [[80, 10], [80, 8]]);
  for (const extra of [{ trainingIntent: "time-limited" }, { trainingIntent: "deload" }, { pain: "stop" }]) {
    const current = one("current", day, [[80, 6]], extra), row = review([old, current]).rows[0];
    const coaching = assertContract(row, current.exercises[0]);
    assert.ok(coaching.signals.length, "purpose or safety changes do not delete the observed exercise evidence");
    assert.ok(coaching.facts.current && coaching.facts.previous);
    assert.equal(coaching.primaryAction.kind, extra.pain ? "individual-care" : extra.trainingIntent);
    assert.ok(!allActions(row).some(action => incrementKinds.has(action.kind)));
  }
});

test("a major accessory change enters session coaching even after two unchanged main exercises", () => {
  const blocks = (prefix, curl) => [exercise(prefix + "-bench", [[50, 10], [50, 10]]),
    exercise(prefix + "-row", [[60, 10], [60, 10]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" }),
    exercise(prefix + "-curl", curl, { rawName: "케이블 컬", exerciseId: "cable_curl", equipmentKey: "합성 케이블 A" })];
  const records = [record("old", "2026-09-28", blocks("old", [[40, 10], [40, 10]])),
    record("current", day, blocks("current", [[20, 8], [20, 8]]))];
  const result = review(records, { preferences: { order: "diary", mainExerciseKeys: ["exercise:bench_press", "exercise:barbell_row"] } });
  const curl = result.rows.find(row => row.blockId === "current-curl"); assertContract(curl, records[1].exercises[2]);
  assert.match([result.sessionCoaching.summary, ...result.sessionCoaching.focus].join(" "), /케이블 컬/);
  assert.ok(result.sessionCoaching.actions.some(action => action.blockId === "current-curl"));
  assert.doesNotMatch(curl.interpretation.coaching.assessment, /앞 운동 때문에|피로가 누적됐|회복이 부족해졌/);
});

test("a local load-change question follows a usable next action rather than blocking coaching", () => {
  const records = [one("old", "2026-09-28", [[50, 10], [70, 5]]), one("current", day, [[50, 10]])];
  const row = review(records).rows[0], coaching = assertContract(row, records[1].exercises[0]);
  assert.equal(coaching.question.topic, "load-change");
  assert.equal(coaching.question.selectedAnswer, null);
  assert.equal(coaching.userAnswer, null);
  assert.deepEqual(coaching.question.choices.map(choice => choice.value), ["planned", "unexpected"]);
  assert.match(coaching.primaryAction.body, /50kg/);
  assert.doesNotMatch(coaching.primaryAction.body, /답.*먼저|답.*후에만|분석.*보류/);
});

for (const [answer, kind] of [["planned", "maintain-intended-work"], ["unexpected", "recheck-unexpected-work"]]) {
  test("a source-bound " + answer + " load-change answer changes the next action without changing the recorded work", () => {
    const current = one("current", day, [[50, 10]]), block = current.exercises[0];
    block.coachingAnswer = Store.createCoachingAnswer(block, "load-change", answer);
    const records = [one("old", "2026-09-28", [[50, 10], [70, 5]]), current], before = structuredClone(records);
    const row = review(records).rows[0], coaching = assertContract(row, block);
    assert.equal(coaching.question.topic, "load-change");
    assert.equal(coaching.question.selectedAnswer, answer);
    assert.deepEqual(coaching.userAnswer, { topic: "load-change", answer, setIds: [block.sets[0].id] });
    assert.equal(coaching.primaryAction.kind, kind);
    assert.match(coaching.primaryAction.body, /50kg.*10회/);
    assert.ok(signals(row).includes("heavier-work-removed"));
    assert.deepEqual(records, before);
  });
}

test("a chosen heavy repetition target keeps base sets and does not ask the same unresolved question again", () => {
  const current = one("current", day, [[60, 12], [60, 12], [75, 5]]), block = current.exercises[0];
  block.coachingAnswer = Store.createCoachingAnswer(block, "rep-target", "planned");
  const row = review([one("old", "2026-09-28", [[60, 12], [60, 12], [75, 8]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.question.topic, "rep-target"); assert.equal(coaching.question.selectedAnswer, "planned");
  assert.equal(coaching.primaryAction.kind, "maintain-intended-work");
  assert.match(coaching.primaryAction.body, /60kg.*12·12회.*75kg.*5회/);
  assert.ok(signals(row).includes("base-held-heavy-lower"));
  assert.deepEqual(coaching.facts.current.source.setIds, block.sets.map(set => set.id));
});

test("editing the performed numbers invalidates an old coaching answer instead of keeping its original intent", () => {
  const current = one("current", day, [[50, 10]]), block = current.exercises[0];
  block.coachingAnswer = Store.createCoachingAnswer(block, "load-change", "planned");
  block.sets[0].reps = 9;
  const row = review([one("old", "2026-09-28", [[50, 10], [70, 5]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.question.topic, "load-change"); assert.equal(coaching.question.selectedAnswer, null);
  assert.equal(coaching.userAnswer, null);
  assert.notEqual(coaching.primaryAction.kind, "maintain-intended-work");
  assert.equal(coaching.facts.current.sets[0].reps, 9);
});

test("an answer about another question is retained as user data but not applied to the current question", () => {
  const current = one("current", day, [[50, 10]]), block = current.exercises[0];
  block.coachingAnswer = Store.createCoachingAnswer(block, "rep-target", "planned");
  const row = review([one("old", "2026-09-28", [[50, 10], [70, 5]]), current]).rows[0];
  const coaching = assertContract(row, block);
  assert.equal(coaching.question.topic, "load-change"); assert.equal(coaching.question.selectedAnswer, null);
  assert.equal(coaching.userAnswer.topic, "rep-target");
  assert.notEqual(coaching.primaryAction.kind, "maintain-intended-work");
});

const stableBlocks = prefix => [exercise(prefix + "-bench", [[50, 10]]),
  exercise(prefix + "-row", [[60, 10]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
const stableSessionHistory = blocks => [record("first", "2026-09-21", blocks("first")),
  record("second", "2026-09-28", blocks("second")), record("current", day, blocks("current"))];

test("several stable exercises keep local progression choices while selecting one summary focus", () => {
  const records = stableSessionHistory(stableBlocks), result = review(records), coordination = result.sessionCoaching.coordination;
  assert.equal(coordination.basis, "product-choice"); assert.equal(coordination.mode, "local-progression-options");
  assert.equal(result.rows.filter(row => incrementKinds.has(row.interpretation.nextAction.kind)).length, 2);
  const selected = result.rows.find(row => row.blockId === coordination.selectedProgressionBlockId);
  assert.ok(selected); assertContract(selected, records[2].exercises.find(block => block.id === selected.blockId));
  const other = result.rows.find(row => row.blockId !== selected.blockId), coaching = assertContract(other, records[2].exercises.find(block => block.id === other.blockId));
  assert.equal(coaching.primaryAction.kind, "progression-option");
  assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
  assert.equal(coaching.primaryAction.proposal.targetReps, 11);
  assert.deepEqual(coordination.alternativeProgressionBlockIds, []);
  assert.ok(signals(other).includes("stable-whole-work"));
});

test("a changed heavy movement defers overlapping progression but not an unrelated stable movement", () => {
  const blocks = (prefix, heavy) => [exercise(prefix + "-bench", heavy),
    exercise(prefix + "-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 C" }),
    exercise(prefix + "-leg", [[80, 10]], { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "합성 머신 D" })];
  const records = [record("first", "2026-09-21", blocks("first", [[50, 10], [50, 8]])),
    record("second", "2026-09-28", blocks("second", [[50, 10], [50, 8]])), record("current", day, blocks("current", [[70, 3], [50, 6]]))];
  const result = review(records), machine = result.rows.find(row => row.blockId === "current-machine"), leg = result.rows.find(row => row.blockId === "current-leg");
  assert.equal(machine.interpretation.nextAction.kind, "maintain-coordinated-work");
  assert.equal(machine.interpretation.coaching.progressionCandidate.kind, "progression-option");
  assert.ok(incrementKinds.has(leg.interpretation.nextAction.kind));
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, leg.blockId);
  assert.ok(result.sessionCoaching.coordination.priorityBlockIds.includes("current-bench"));
  assert.doesNotMatch(machine.interpretation.nextAction.body, /피로 때문에|회복 실패|앞 운동 때문에/);
});

test("adding work for another primary muscle does not erase independent stable progression", () => {
  const records = stableSessionHistory(stableBlocks);
  records[2].exercises.push(exercise("current-leg", [[80, 10]], { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "합성 머신 D" }));
  const result = review(records);
  assert.equal(result.sessionCoaching.coordination.mode, "consolidate-changes");
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-bench");
  assert.equal(result.rows.filter(row => incrementKinds.has(row.interpretation.nextAction.kind)).length, 2);
  for (const blockId of ["current-bench", "current-row"]) {
    const row = result.rows.find(row => row.blockId === blockId);
    assert.equal(row.interpretation.nextAction.kind, "progression-option");
    assert.equal(Object.hasOwn(row.interpretation.coaching, "progressionCandidate"), false);
    assert.equal(row.interpretation.nextAction.proposal.targetReps, 11);
    assert.ok(signals(row).includes("stable-whole-work"));
  }
});

test("explicit comfortable-set feedback takes priority over an automatic candidate without changing other recorded effort", () => {
  const records = stableSessionHistory(stableBlocks), current = records[2].exercises[1];
  current.feedback = { setId: current.sets[0].id, loadKg: 60, reps: 10, feeling: "comfortable" };
  const result = review(records), chosen = result.rows.find(row => row.blockId === current.id);
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, current.id);
  assert.equal(chosen.interpretation.nextAction.kind, "reps-option");
  assert.deepEqual(chosen.interpretation.nextAction.focusSetIds, [current.sets[0].id]);
  assert.equal(result.rows.find(row => row.blockId === "current-bench").interpretation.nextAction.kind, "progression-option");
  assert.ok(records.every(record => record.exercises.every(block => block.sets.every(set => set.rir === null))));
});

test("the user's main exercise determines the chosen automatic progression independently of display order", () => {
  const records = stableSessionHistory(stableBlocks);
  for (const [order, mainExerciseKeys] of [["diary", ["exercise:barbell_row"]], ["priority", ["exercise:barbell_row"]],
    ["diary", ["exercise:barbell_row", "exercise:bench_press"]], ["priority", ["exercise:barbell_row", "exercise:bench_press"]]]) {
    const result = review(records, { preferences: { order, mainExerciseKeys } });
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-row");
    assert.equal(result.rows.find(row => row.blockId === "current-bench").interpretation.nextAction.kind, "progression-option");
  }
});

test("priority muscles guide automatic candidates when no main is pinned, while an explicit main remains first", () => {
  const records = stableSessionHistory(stableBlocks);
  for (const order of ["diary", "priority"]) {
    const focused = review(records, { preferences: { order }, priorityMuscles: ["back"] });
    assert.equal(focused.sessionCoaching.coordination.selectedProgressionBlockId, "current-row");
    const main = review(records, { preferences: { order, mainExerciseKeys: ["exercise:bench_press"] }, priorityMuscles: ["back"] });
    assert.equal(main.sessionCoaching.coordination.selectedProgressionBlockId, "current-bench");
  }
});

test("a latest legacy OCR record keeps its raw sets but cannot become a performed-capacity or progression prescription", () => {
  const records = [one("first", "2026-09-21", [[50, 10]]), one("second", "2026-09-28", [[50, 10]]),
    one("current", day, [[50, 12]], { source: { kind: "legacy-ocr", hash: null } })], before = structuredClone(records);
  const row = review(records).rows[0], coaching = assertContract(row, records[2].exercises[0]);
  assert.equal(coaching.primaryAction.kind, "verify-record");
  assert.equal(row.interpretation.performance, null);
  assert.equal(row.progression.status, "incomparable");
  assert.equal(coaching.question, null);
  assert.ok(!signals(row).includes("whole-work-improved"));
  assert.ok(!allActions(row).some(action => incrementKinds.has(action.kind)));
  assert.deepEqual(coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), [[50, 12]]);
  assert.deepEqual(records, before);
});

test("a generic conditional repetition choice survives an independent movement's raised load", () => {
  const blocks = (prefix, benchLoad) => [exercise(prefix + "-bench", [[benchLoad, 10]]),
    exercise(prefix + "-leg", [[80, 10]], { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "합성 머신 D" })];
  const records = [record("old", "2026-09-28", blocks("old", 50)), record("current", day, blocks("current", 55))], before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:leg_press"] } });
    const row = result.rows.find(row => row.blockId === "current-leg"), coaching = assertContract(row, records[1].exercises[1]);
    assert.equal(coaching.primaryAction.kind, "repeat");
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.deepEqual(coaching.primaryAction.focusSetIds, ["current-leg-set-0"]);
    assert.match(coaching.primaryAction.body, /여유가 있으면.*1회 더/);
    assert.doesNotMatch(actionText(row), /벤치.*먼저|이 운동까지 함께 올리지는/);
    assert.ok(signals(row).every(kind => kind !== "stable-whole-work"));
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
    assert.equal(result.sessionCoaching.coordination.selectedAdjustmentBlockId, null);
    assert.ok(result.sessionCoaching.coordination.priorityBlockIds.includes("current-bench"));
  }
  assert.deepEqual(records, before);
});

test("two independent falling tail contexts keep local tasks despite one selected summary adjustment", () => {
  const blocks = (prefix, tail) => [exercise(prefix + "-bench", [[50, 10], [50, tail]]),
    exercise(prefix + "-row", [[60, 10], [60, tail]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
  const records = [record("old", "2026-09-28", blocks("old", 9)), record("current", day, blocks("current", 7))], before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:barbell_row", "exercise:bench_press"] } });
    assert.equal(result.sessionCoaching.coordination.selectedAdjustmentBlockId, "current-row");
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, null);
    const selected = result.rows.find(row => row.blockId === "current-row"), other = result.rows.find(row => row.blockId === "current-bench");
    assertContract(selected, records[1].exercises[1]); const coaching = assertContract(other, records[1].exercises[0]);
    assert.equal(selected.interpretation.nextAction.kind, "restore-tail");
    assert.deepEqual(selected.interpretation.nextAction.focusSetIds, ["current-row-set-1"]);
    assert.equal(coaching.primaryAction.kind, "restore-tail");
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.deepEqual(coaching.primaryAction.focusSetIds, ["current-bench-set-1"]);
    assert.match(coaching.primaryAction.body, /충분히 쉬.*7회.*여유가 있으면.*1회 더/);
    assert.doesNotMatch(actionText(other), /바벨 로우.*먼저|다른 운동.*안정시켜/);
    assert.ok(signals(other).includes("tail-lower"));
  }
  assert.deepEqual(records, before);
});

test("two independent heavy-set declines retain both local tasks independently of display order", () => {
  const blocks = (prefix, heavyReps) => [exercise(prefix + "-bench", [[40, 12], [40, 12], [55, heavyReps]]),
    exercise(prefix + "-row", [[50, 12], [50, 12], [65, heavyReps]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
  const records = [record("old", "2026-09-28", blocks("old", 8)), record("current", day, blocks("current", 5))], before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:barbell_row"] } });
    assert.equal(result.sessionCoaching.coordination.selectedAdjustmentBlockId, "current-row");
    const selected = result.rows.find(row => row.blockId === "current-row"), other = result.rows.find(row => row.blockId === "current-bench");
    assertContract(selected, records[1].exercises[1]); const coaching = assertContract(other, records[1].exercises[0]);
    assert.equal(selected.interpretation.nextAction.kind, "keep-base-check-heavy");
    assert.deepEqual(selected.interpretation.nextAction.focusSetIds, ["current-row-set-2"]);
    assert.equal(coaching.primaryAction.kind, "keep-base-check-heavy");
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.deepEqual(coaching.primaryAction.focusSetIds, ["current-bench-set-2"]);
    assert.match(coaching.primaryAction.body, /40kg.*12·12회.*55kg.*5회/);
    assert.match(actionText(other), /충분히 쉬.*여유|동작이 잘 유지되면.*1회 더/);
    assert.doesNotMatch(actionText(other), /바벨 로우.*먼저|다른 운동.*안정시켜/);
    assert.ok(signals(other).includes("base-held-heavy-lower"));
  }
  assert.deepEqual(records, before);
});

test("an explicit comfortable-set focus does not erase another primary muscle's local tail task", () => {
  const blocks = (prefix, tail) => [exercise(prefix + "-bench", [[50, 10]]),
    exercise(prefix + "-row", [[60, 10], [60, tail]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
  const records = [record("old", "2026-09-28", blocks("old", 9)), record("current", day, blocks("current", 7))];
  const chosen = records[1].exercises[0]; chosen.feedback = { setId: chosen.sets[0].id, loadKg: 50, reps: 10, feeling: "comfortable" };
  const before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:barbell_row"] } });
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-bench");
    assert.equal(result.sessionCoaching.coordination.selectedAdjustmentBlockId, null);
    const current = result.rows.find(row => row.blockId === chosen.id), other = result.rows.find(row => row.blockId === "current-row");
    assertContract(current, chosen); const coaching = assertContract(other, records[1].exercises[1]);
    assert.equal(current.interpretation.nextAction.kind, "reps-option");
    assert.equal(coaching.primaryAction.kind, "restore-tail");
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.deepEqual(coaching.primaryAction.focusSetIds, ["current-row-set-1"]);
    assert.match(actionText(other), /여유가 있으면.*1회 더/);
    assert.match(coaching.primaryAction.body, /충분히 쉬/);
    assert.doesNotMatch(coaching.primaryAction.body, /벤치 프레스.*먼저|한 종목만|다른 운동.*안정시켜/);
  }
  assert.deepEqual(records, before);
});

test("stable whole-work progression describes one future repetition without recording it as performed", () => {
  const records = [one("first", "2026-09-21", [[50, 10], [50, 10]]), one("second", "2026-09-28", [[50, 10], [50, 10]]),
    one("current", day, [[50, 10], [50, 10]])], before = structuredClone(records);
  const row = review(records).rows[0], coaching = assertContract(row, records[2].exercises[0]);
  assert.deepEqual(row.interpretation.nextAction.proposal, { kind: "single-set-reps", setId: "current-bench-set-0", loadKg: 50, baseReps: 10, targetReps: 11 });
  assert.deepEqual(coaching.primaryAction.proposal, row.interpretation.nextAction.proposal);
  assert.deepEqual(coaching.facts.current.sets.map(set => set.reps), [10, 10]);
  assert.equal(row.progression.current.reps, 10);
  assert.equal(row.interpretation.performance.model.current.reps, 10);
  assert.deepEqual(coaching.facts.current.source.setIds, ["current-bench-set-0", "current-bench-set-1"]);
  assert.deepEqual(records, before);
});

test("comfortable feedback proposes a repetition on its exact chosen set without changing the larger performed set", () => {
  const current = one("current", day, [[50, 10], [50, 8]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[1].id, loadKg: 50, reps: 8, feeling: "comfortable" };
  const before = structuredClone(current), row = review([current]).rows[0], coaching = assertContract(row, block);
  assert.deepEqual(coaching.primaryAction.proposal, { kind: "single-set-reps", setId: block.sets[1].id, loadKg: 50, baseReps: 8, targetReps: 9 });
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[1].id]);
  assert.deepEqual(coaching.facts.current.sets.map(set => set.reps), [10, 8]);
  assert.equal(row.progression.current.reps, 10);
  assert.equal(row.interpretation.performance.model.current.reps, 10);
  assert.deepEqual(current, before);
});

test("final effort, safety, intent and legacy actions do not expose a numeric progression proposal", () => {
  const cases = [{ rir: 0 },
    { profile: { healthContext: "clinical" } }, { profile: { age: 16 } }, { current: { pain: "mild" } }, { current: { pain: "stop" } },
    { current: { trainingIntent: "deload" } }, { current: { trainingIntent: "technique" } },
    { current: { source: { kind: "legacy-ocr", hash: null } } }];
  for (const entry of cases) {
    const values = [[50, 10, entry.rir ?? null]], records = [one("first", "2026-09-21", values),
      one("second", "2026-09-28", values), one("current", day, values, entry.current)], before = structuredClone(records);
    const row = review(records, { profile: entry.profile }).rows[0], coaching = assertContract(row, records[2].exercises[0]);
    assert.ok(!incrementKinds.has(coaching.primaryAction.kind));
    assert.equal(Object.hasOwn(row.interpretation.nextAction, "proposal"), false);
    assert.equal(Object.hasOwn(coaching.primaryAction, "proposal"), false);
    assert.ok(coaching.supportingActions.every(action => !Object.hasOwn(action, "proposal")));
    assert.deepEqual(records, before);
  }
});

test("exact plan bounds remove a repetition proposal from below-range, above-range and upper-range choices", () => {
  for (const reps of [5, 10, 11]) {
    const records = [one("first", "2026-09-21", [[50, reps]]), one("second", "2026-09-28", [[50, reps]]), one("current", day, [[50, reps]])];
    const block = records[2].exercises[0];
    if (reps >= 10) block.feedback = { setId: block.sets[0].id, loadKg: 50, reps, feeling: "comfortable" };
    const planning = { schedule: [{ id: "assignment", date: day, recordId: "current", status: "performed", prescription: { exercises: [
      { id: "target", exerciseId: "bench_press", equipmentKey: block.equipmentKey, loadConvention: "total", sets: 1, repsMin: 8, repsMax: 10, rir: 2 }
    ] } }] }, before = structuredClone({ records, planning });
    const row = review(records, { planning }).rows[0], coaching = assertContract(row, block);
    assert.equal(coaching.primaryAction.kind, reps === 10 ? "load-option" : "plan-check");
    assert.equal(Object.hasOwn(row.interpretation.nextAction, "proposal"), false);
    assert.equal(Object.hasOwn(coaching.primaryAction, "proposal"), false);
    assert.equal(coaching.facts.current.sets[0].reps, reps);
    assert.deepEqual({ records, planning }, before);
  }
});

test("a deferred stable increment has a proposal only in its future candidate, not in the current maintenance action", () => {
  const blocks = (prefix, heavy) => [exercise(prefix + "-bench", [[heavy, heavy === 50 ? 10 : 3]]),
    exercise(prefix + "-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신 C" }),
    exercise(prefix + "-row", [[60, 10]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
  const records = [record("first", "2026-09-21", blocks("first", 50)), record("second", "2026-09-28", blocks("second", 50)),
    record("current", day, blocks("current", 70))], before = structuredClone(records);
  const result = review(records, { preferences: { order: "diary", mainExerciseKeys: ["exercise:barbell_row"] } });
  const row = result.rows.find(row => row.blockId === "current-machine"), coaching = assertContract(row, records[2].exercises[1]);
  assert.equal(coaching.primaryAction.kind, "maintain-coordinated-work");
  assert.equal(Object.hasOwn(row.interpretation.nextAction, "proposal"), false);
  assert.equal(Object.hasOwn(coaching.primaryAction, "proposal"), false);
  assert.deepEqual(coaching.progressionCandidate.proposal, { kind: "single-set-reps", setId: "current-machine-set-0", loadKg: 40, baseReps: 10, targetReps: 11 });
  assert.deepEqual(coaching.facts.current.sets.map(set => set.reps), [10]);
  assert.equal(row.progression.current.reps, 10);
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-row");
  assert.deepEqual(records, before);
});

test("the chosen heavy-set fourth repetition does not add a second increment to its backoff support", () => {
  const current = one("current", day, [[100, 3], [80, 6], [80, 4]]), block = current.exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 100, reps: 3, feeling: "comfortable" };
  const records = [one("old", "2026-09-28", [[80, 10], [80, 10], [80, 8]]), current], before = structuredClone(records);
  const row = review(records).rows[0], coaching = assertContract(row, block);
  assert.deepEqual(coaching.primaryAction.proposal, { kind: "single-set-reps", setId: block.sets[0].id, loadKg: 100, baseReps: 3, targetReps: 4 });
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[0].id]);
  const support = coaching.supportingActions.find(action => action.kind === "restore-tail");
  assert.ok(support); assert.deepEqual(support.focusSetIds, [block.sets[1].id, block.sets[2].id]);
  assert.match(support.body, /80kg × 6회.*80kg × 4회.*충분히 쉬/);
  assert.doesNotMatch(support.body, /1회 더|7회를.*시도|5회를.*시도|증량/);
  assert.equal(Object.hasOwn(support, "proposal"), false);
  assert.deepEqual(coaching.facts.current.sets.map(set => set.reps), [3, 6, 4]);
  assert.equal(row.interpretation.performance.model.current.reps, 3);
  assert.deepEqual(records, before);
});

test("a comfortable-set proposal never crosses the maximum supported repetition count", () => {
  for (const reps of [99999, 100000]) {
    const current = one("current", day, [[50, reps]]), block = current.exercises[0];
    block.feedback = { setId: block.sets[0].id, loadKg: 50, reps, feeling: "comfortable" };
    const row = review([current]).rows[0], coaching = assertContract(row, block);
    if (reps === 99999) assert.deepEqual(coaching.primaryAction.proposal,
      { kind: "single-set-reps", setId: block.sets[0].id, loadKg: 50, baseReps: 99999, targetReps: 100000 });
    else assert.equal(Object.hasOwn(coaching.primaryAction, "proposal"), false);
    assert.equal(coaching.facts.current.sets[0].reps, reps);
  }
});

test("an automatic stable-work proposal respects the exact linked plan's repetition upper bound", () => {
  for (const reps of [9, 10, 11]) {
    const records = [one("first", "2026-09-21", [[50, reps]]), one("second", "2026-09-28", [[50, reps]]),
      one("current", day, [[50, reps]])], block = records[2].exercises[0];
    const planning = { schedule: [{ id: "assignment", date: day, recordId: "current", status: "performed", prescription: { exercises: [
      { id: "target", exerciseId: "bench_press", equipmentKey: block.equipmentKey, loadConvention: "total", sets: 1, repsMin: 8, repsMax: 10, rir: 2 }
    ] } }] }, before = structuredClone({ records, planning });
    const row = review(records, { planning }).rows[0], coaching = assertContract(row, block);
    assert.ok(signals(row).includes("stable-whole-work"));
    if (reps === 9) {
      assert.equal(coaching.primaryAction.kind, "progression-option");
      assert.deepEqual(coaching.primaryAction.proposal,
        { kind: "single-set-reps", setId: block.sets[0].id, loadKg: 50, baseReps: 9, targetReps: 10 });
    } else {
      assert.equal(coaching.primaryAction.kind, reps === 10 ? "load-option" : "plan-check");
      assert.equal(Object.hasOwn(row.interpretation.nextAction, "proposal"), false);
      assert.equal(Object.hasOwn(coaching.primaryAction, "proposal"), false);
      if (reps === 10) {
        assert.match(coaching.primaryAction.body, /계획한 반복 상단 10회/);
        assert.match(coaching.primaryAction.body, /최소 부하 증가/);
        assert.doesNotMatch(coaching.primaryAction.body, /11회|51kg|52kg|55kg/);
      }
    }
    assert.equal(coaching.facts.current.sets[0].reps, reps);
    if (reps <= 10) assert.equal(row.interpretation.performance.model.current.reps, reps);
    else assert.equal(row.interpretation.performance, null);
    assert.deepEqual({ records, planning }, before);
  }
});

test("a stable dominant set outside the linked plan's counted sets keeps its own repetition proposal", () => {
  const values = [[50, 10], [60, 10], [60, 10]], records = [one("first", "2026-09-21", values),
    one("second", "2026-09-28", values), one("current", day, values)], block = records[2].exercises[0];
  const planning = { schedule: [{ id: "assignment", date: day, recordId: "current", status: "performed", prescription: { exercises: [
    { id: "target", exerciseId: "bench_press", equipmentKey: block.equipmentKey, loadConvention: "total", sets: 1, repsMin: 8, repsMax: 10, rir: 2 }
  ] } }] }, before = structuredClone({ records, planning });
  const row = review(records, { planning }).rows[0], coaching = assertContract(row, block);
  assert.equal(coaching.primaryAction.kind, "progression-option");
  assert.deepEqual(coaching.primaryAction.proposal,
    { kind: "single-set-reps", setId: block.sets[1].id, loadKg: 60, baseReps: 10, targetReps: 11 });
  assert.deepEqual(coaching.primaryAction.focusSetIds, [block.sets[1].id]);
  assert.deepEqual(coaching.facts.current.sets.map(set => set.reps), [10, 10, 10]);
  assert.deepEqual({ records, planning }, before);
});

test("a bench tail adjustment leaves stable Smith rowing usable while coordinating chest fly work", () => {
  const blocks = (prefix, tail) => [exercise(prefix + "-bench", [[50, 10], [50, tail]]),
    exercise(prefix + "-row", [[60, 10], [60, 10], [60, 10]], { rawName: "스미스 벤트 오버 로우", exerciseId: "smith_row", equipmentKey: "합성 스미스" }),
    exercise(prefix + "-fly", [[15, 15], [15, 15]], { rawName: "케이블 플라이", exerciseId: "cable_fly", equipmentKey: "합성 케이블" })];
  const records = [record("first", "2026-09-21", blocks("first", 9)), record("second", "2026-09-28", blocks("second", 9)),
    record("current", day, blocks("current", 7))], before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:bench_press"] } });
    const bench = result.rows.find(row => row.blockId === "current-bench"), row = result.rows.find(row => row.blockId === "current-row"),
      fly = result.rows.find(row => row.blockId === "current-fly");
    assertContract(bench, records[2].exercises[0]); const coaching = assertContract(row, records[2].exercises[1]);
    assertContract(fly, records[2].exercises[2]);
    assert.equal(bench.interpretation.nextAction.kind, "restore-tail");
    assert.equal(coaching.primaryAction.kind, "progression-option");
    assert.deepEqual(coaching.primaryAction.proposal,
      { kind: "single-set-reps", setId: "current-row-set-0", loadKg: 60, baseReps: 10, targetReps: 11 });
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.doesNotMatch(actionText(row), /벤치.*먼저|벤치.*안정|한 종목만/);
    assert.equal(fly.interpretation.nextAction.kind, "maintain-coordinated-work");
    assert.equal(fly.interpretation.coaching.progressionCandidate.kind, "progression-option");
    assert.match(fly.interpretation.nextAction.body, /벤치/);
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-row");
  }
  assert.deepEqual(records, before);
});

test("a new heavy squat does not turn stable hip adduction or abduction into forbidden progression", () => {
  const blocks = (prefix, load, reps) => [exercise(prefix + "-squat", [[load, reps]], { rawName: "바벨 스쿼트", exerciseId: "squat" }),
    exercise(prefix + "-adduction", [[30, 15], [30, 15]], { rawName: "머신 힙 어덕션", exerciseId: "hip_adduction", equipmentKey: "합성 내전 머신" }),
    exercise(prefix + "-abduction", [[20, 15], [20, 15]], { rawName: "케이블 힙 어브덕션", exerciseId: "hip_abduction", equipmentKey: "합성 외전 케이블" })];
  const records = [record("first", "2026-09-21", blocks("first", 40, 10)), record("second", "2026-09-28", blocks("second", 40, 10)),
    record("current", day, blocks("current", 55, 3))], before = structuredClone(records);
  for (const order of ["diary", "priority"]) {
    const result = review(records, { preferences: { order, mainExerciseKeys: ["exercise:squat"] } });
    assert.ok(signals(result.rows.find(row => row.blockId === "current-squat")).includes("new-heavy-exposure"));
    for (const id of ["adduction", "abduction"]) {
      const block = records[2].exercises.find(ex => ex.id === "current-" + id), row = result.rows.find(row => row.blockId === block.id),
        coaching = assertContract(row, block);
      assert.equal(coaching.primaryAction.kind, "progression-option");
      assert.equal(coaching.primaryAction.proposal.targetReps, 16);
      assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
      assert.doesNotMatch(actionText(row), /스쿼트.*먼저|스쿼트.*안정|한 종목만/);
    }
    assert.deepEqual(result.sessionCoaching.coordination.alternativeProgressionBlockIds, []);
  }
  assert.deepEqual(records, before);
});

test("multiple stable exercises for the same primary muscle retain local choices rather than manufacturing a change conflict", () => {
  const blocks = prefix => [exercise(prefix + "-bench", [[50, 10]]),
    exercise(prefix + "-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신" })];
  const records = stableSessionHistory(blocks), before = structuredClone(records);
  const result = review(records, { preferences: { mainExerciseKeys: ["exercise:machine_chest_press"] } });
  assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, "current-machine");
  for (const row of result.rows) {
    const coaching = assertContract(row, records[2].exercises.find(block => block.id === row.blockId));
    assert.equal(coaching.primaryAction.kind, "progression-option");
    assert.equal(coaching.primaryAction.proposal.targetReps, 11);
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
  }
  assert.deepEqual(result.sessionCoaching.coordination.alternativeProgressionBlockIds, []);
  assert.deepEqual(records, before);
});

test("added primary chest work defers a chest candidate but preserves stable back work", () => {
  const blocks = (prefix, sets) => [exercise(prefix + "-bench", Array.from({ length: sets }, () => [50, 10])),
    exercise(prefix + "-machine", [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신" }),
    exercise(prefix + "-row", [[60, 10]], { rawName: "바벨 로우", exerciseId: "barbell_row", equipmentKey: "합성 랙 B" })];
  const records = [record("first", "2026-09-21", blocks("first", 2)), record("second", "2026-09-28", blocks("second", 2)),
    record("current", day, blocks("current", 3))], before = structuredClone(records), result = review(records);
  const machine = result.rows.find(row => row.blockId === "current-machine"), row = result.rows.find(row => row.blockId === "current-row");
  assertContract(machine, records[2].exercises[1]); const coaching = assertContract(row, records[2].exercises[2]);
  assert.equal(machine.interpretation.nextAction.kind, "maintain-coordinated-work");
  assert.equal(machine.interpretation.coaching.progressionCandidate.kind, "progression-option");
  assert.equal(coaching.primaryAction.kind, "progression-option");
  assert.equal(coaching.primaryAction.proposal.targetReps, 11);
  assert.doesNotMatch(actionText(row), /전체 운동 세트가 늘었으니|벤치.*안정|한 종목만/);
  assert.deepEqual(records, before);
});

test("increased lower-body set count does not globally stop independent arm or core choices", () => {
  const blocks = (prefix, sets) => [exercise(prefix + "-leg", Array.from({ length: sets }, () => [80, 10]),
    { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "합성 다리 머신" }),
    exercise(prefix + "-curl", [[20, 10]], { rawName: "케이블 컬", exerciseId: "cable_curl", equipmentKey: "합성 팔 케이블" }),
    exercise(prefix + "-core", [[30, 15]], { rawName: "케이블 닐링 크런치", exerciseId: "cable_crunch", equipmentKey: "합성 복부 케이블" })];
  const records = [record("first", "2026-09-21", blocks("first", 2)), record("second", "2026-09-28", blocks("second", 2)),
    record("current", day, blocks("current", 3))], before = structuredClone(records), result = review(records);
  for (const id of ["curl", "core"]) {
    const block = records[2].exercises.find(ex => ex.id === "current-" + id), row = result.rows.find(row => row.blockId === block.id),
      coaching = assertContract(row, block);
    assert.equal(coaching.primaryAction.kind, "progression-option");
    assert.equal(coaching.primaryAction.proposal.targetReps, block.sets[0].reps + 1);
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
    assert.doesNotMatch(actionText(row), /전체 운동 세트가 늘었으니|레그 프레스.*먼저|함께 올리지는/);
  }
  assert.deepEqual(records, before);
});

test("continued stable records do not repeatedly suppress an independent non-main exercise's usable choice", () => {
  const dates = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", day];
  const records = dates.map((date, index) => record("stable-" + index, date, stableBlocks("stable-" + index))), before = structuredClone(records);
  for (let count = 3; count <= records.length; count++) {
    const selectedRecords = records.slice(0, count), p = profile(), date = selectedRecords.at(-1).date;
    const result = T.coachSession(T.analyze(selectedRecords, { date, profile: p, includeCapacityHistory: true }),
      { profile: p, preferences: { mainExerciseKeys: ["exercise:bench_press"] } });
    const current = selectedRecords.at(-1).exercises[1], row = result.rows.find(row => row.blockId === current.id), coaching = assertContract(row, current);
    assert.equal(result.sessionCoaching.coordination.selectedProgressionBlockId, selectedRecords.at(-1).exercises[0].id);
    assert.equal(coaching.primaryAction.kind, "progression-option");
    assert.equal(coaching.primaryAction.proposal.targetReps, 11);
    assert.equal(Object.hasOwn(coaching, "progressionCandidate"), false);
  }
  assert.deepEqual(records, before);
});

test("a new muscle group in Lower names that split comparison separately from its unchanged Upper exercise reference", () => {
  const leg = prefix => exercise(prefix + "-leg", [[80, 10], [80, 10]],
    { rawName: "레그 프레스", exerciseId: "leg_press", equipmentKey: "합성 다리 머신" });
  const curl = prefix => exercise(prefix + "-curl", [[20, 10]],
    { rawName: "케이블 컬", exerciseId: "cable_curl", equipmentKey: "합성 팔 케이블" });
  const records = [record("prior-lower", "2026-09-10", [leg("prior-lower")], { label: "Lower" }),
    record("first-upper", "2026-09-20", [curl("first-upper")], { label: "Upper" }),
    record("last-upper", "2026-09-27", [curl("last-upper")], { label: "Upper" }),
    record("current", day, [leg("current"), curl("current")], { label: "Lower" })], before = structuredClone(records);
  const result = review(records), block = records[3].exercises[1], row = result.rows.find(row => row.blockId === block.id),
    coaching = assertContract(row, block);
  assert.equal(row.interpretation.reference.date, "2026-09-27");
  assert.equal(row.interpretation.reference.label, "Upper");
  assert.match(coaching.assessment, /2026-09-27 Upper 기록에서 이어보면/);
  assert.equal(coaching.primaryAction.kind, "maintain-coordinated-work");
  assert.match(coaching.primaryAction.body, /2026-09-10 Lower에는 없던 이두 직접 운동을 이번 Lower에 넣었어요/);
  assert.doesNotMatch(coaching.primaryAction.body, /전체 운동 세트가 늘었으니|2026-09-27 Upper.*직접 운동.*늘/);
  assert.equal(coaching.progressionCandidate.kind, "progression-option");
  assert.deepEqual(coaching.progressionCandidate.proposal,
    { kind: "single-set-reps", setId: block.sets[0].id, loadKg: 20, baseReps: 10, targetReps: 11 });
  assert.deepEqual(coaching.facts.current.sets.map(set => [set.loadKg, set.reps]), [[20, 10]]);
  assert.deepEqual(coaching.facts.previous.sets.map(set => [set.loadKg, set.reps]), [[20, 10]]);
  const biceps = result.sessionCoaching.sessionChanges.muscles.find(muscle => muscle.id === "biceps");
  assert.equal(biceps.previousDirectSets, 0); assert.equal(biceps.currentDirectSets, 1);
  assert.deepEqual(records, before);
});

test("a related chest candidate resumes after the changed bench work is repeated rather than remaining deferred forever", () => {
  const dates = ["2026-09-21", "2026-09-28", day, "2026-10-13"];
  const records = dates.map((date, index) => record("session-" + index, date, [
    exercise("bench-" + index, [[50, 10], [50, index < 2 ? 9 : 7]]),
    exercise("machine-" + index, [[40, 10]], { rawName: "머신 체스트 프레스", exerciseId: "machine_chest_press", equipmentKey: "합성 머신" })])),
    before = structuredClone(records), p = profile();
  const reviewThrough = count => T.coachSession(T.analyze(records.slice(0, count),
    { date: dates[count - 1], profile: p, includeCapacityHistory: true }), { profile: p });
  const changed = reviewThrough(3), deferred = changed.rows.find(row => row.blockId === "machine-2");
  const initial = assertContract(deferred, records[2].exercises[1]);
  assert.equal(initial.primaryAction.kind, "maintain-coordinated-work");
  assert.equal(initial.progressionCandidate.kind, "progression-option");
  assert.equal(Object.hasOwn(initial.primaryAction, "proposal"), false);
  assert.deepEqual(initial.progressionCandidate.proposal,
    { kind: "single-set-reps", setId: "machine-2-set-0", loadKg: 40, baseReps: 10, targetReps: 11 });
  const repeated = reviewThrough(4), bench = repeated.rows.find(row => row.blockId === "bench-3"),
    machine = repeated.rows.find(row => row.blockId === "machine-3"), resumed = assertContract(machine, records[3].exercises[1]);
  assert.equal(bench.interpretation.nextAction.kind, "repeat");
  assert.ok(!signals(bench).includes("tail-lower"));
  assert.equal(resumed.primaryAction.kind, "progression-option");
  assert.equal(Object.hasOwn(resumed, "progressionCandidate"), false);
  assert.deepEqual(resumed.primaryAction.proposal,
    { kind: "single-set-reps", setId: "machine-3-set-0", loadKg: 40, baseReps: 10, targetReps: 11 });
  assert.doesNotMatch(actionText(machine), /벤치.*먼저|달라진 구간.*안정/);
  assert.deepEqual(resumed.facts.current.sets.map(set => [set.loadKg, set.reps]), [[40, 10]]);
  assert.equal(repeated.sessionCoaching.coordination.selectedProgressionBlockId, "machine-3");
  assert.deepEqual(repeated.sessionCoaching.coordination.alternativeProgressionBlockIds, []);
  assert.deepEqual(records, before);
});
