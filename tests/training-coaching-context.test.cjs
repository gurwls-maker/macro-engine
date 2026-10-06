"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/training-coaching.js");

const set = (id, kg, reps, extras = {}) => ({ id, loadKg: kg, reps, marker: null, rir: null, ...extras });
const row = (id, date, values, extras = {}) => ({ id, blockId: id, sessionId: "session-" + id, date,
  exerciseId: "squat", rawName: "합성 스쿼트", equipmentKey: "rack-one", loadConvention: "total", loadRole: "external", variantKey: null,
  sets: values.map(([kg, reps], index) => set(id + "-set-" + index, kg, reps)), ...extras });
const now = values => row("current", "2026-10-06", values);
const prior = values => row("previous", "2026-10-01", values);
const older = values => row("older", "2026-09-26", values);
const run = (current, previous = null, history = [], extras = {}) => C.interpret({ current, previous, history, profile: { goal: "recomp" }, ...extras });
const signal = (value, kind) => value.signals.find(item => item.kind === kind);
const text = value => [value.assessment, value.primaryAction?.body, ...value.supportingActions.map(item => item.body)].join(" ");

test("new heavy work and weaker backoff create two compatible tasks, not one RM verdict", () => {
  const current = now([[115, 3], [95, 7], [95, 5]]), previous = prior([[95, 11], [95, 10], [95, 9]]);
  const result = run(current, previous, [previous], { performance: { model: { current: { loadKg: 115, reps: 3 }, expectedRepsAtCurrentLoad: { min: 3, max: 6 } } } });
  assert.ok(signal(result, "new-heavy-exposure"));
  assert.equal(result.primaryAction.kind, "consolidate-heavy");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-0"]);
  assert.equal(result.supportingActions[0].kind, "restore-tail");
  assert.deepEqual(result.supportingActions[0].focusSetIds, ["current-set-1", "current-set-2"]);
  assert.match(result.assessment, /115kg.*3회/);
  assert.match(result.assessment, /3~6회/);
  assert.match(result.assessment, /95kg.*7·5/);
});

test("two heavy lead sets are both preserved in the action", () => {
  const result = run(now([[110, 5], [110, 5], [85, 8], [55, 16]]), prior([[85, 11], [85, 9], [85, 8]]));
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-0", "current-set-1"]);
  assert.match(result.primaryAction.body, /110kg × 5·5회/);
  assert.match(result.primaryAction.body, /85kg × 8회/);
  assert.match(result.primaryAction.body, /55kg × 16회/);
  assert.deepEqual(result.primaryAction.preservedSetIds, ["current-set-2", "current-set-3"]);
});

test("unchanged first set does not hide the removal of heavier work", () => {
  const current = now([[35, 11], [35, 11], [35, 10]]), previous = prior([[35, 11], [45, 11], [45, 9]]);
  const result = run(current, previous, [older([[35, 11], [45, 11], [45, 8]]), previous]);
  assert.ok(signal(result, "heavier-work-removed"));
  assert.equal(result.primaryAction.kind, "repeat-rebuilt-work");
  assert.match(result.assessment, /45kg.*35kg/s);
  assert.ok(signal(result, "stable-leading-only"));
  assert.equal(signal(result, "stable-whole-work"), undefined);
  assert.doesNotMatch(text(result), /12회를 시도/);
});

test("lower-load general sets moved to warmups stay source-bound while the heavier general segment expands", () => {
  const previous = prior([[55, 12], [70, 10], [100, 15], [100, 15]]), current = now([[100, 15], [100, 15], [100, 15]]);
  current.sets.unshift(set("current-warmup-55", 55, 12, { marker: "W" }), set("current-warmup-70", 70, 10, { marker: "W" }));
  const before = structuredClone({ current, previous }), result = run(current, previous, [previous]);
  assert.deepEqual(result.facts.current.warmupSets, [
    { id: "current-warmup-55", loadKg: 55, reps: 12, marker: "W" },
    { id: "current-warmup-70", loadKg: 70, reps: 10, marker: "W" }
  ]);
  assert.deepEqual(result.facts.current.source.setIds, ["current-set-0", "current-set-1", "current-set-2"]);
  assert.equal(result.facts.previous.setCount, 4); assert.equal(result.facts.current.setCount, 3);
  const reclassified = signal(result, "work-reclassified-as-warmup"), expanded = signal(result, "heavy-work-expanded");
  assert.ok(reclassified); assert.deepEqual(reclassified.loadKg, [55, 70]);
  assert.deepEqual(reclassified.currentWarmupSetIds, ["current-warmup-55", "current-warmup-70"]);
  assert.deepEqual(reclassified.sourceRefs[0].setIds, ["current-warmup-55", "current-warmup-70"]);
  assert.equal(reclassified.sourceRefs[0].sessionId, "session-current");
  assert.equal(reclassified.sourceRefs[1].sessionId, "session-previous");
  assert.ok(expanded); assert.equal(expanded.previousLoadSetCount, 2); assert.equal(expanded.currentLoadSetCount, 3);
  assert.equal(result.primaryAction.kind, "hold-redistributed-work");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-0", "current-set-1", "current-set-2"]);
  assert.match(result.assessment, /4개에서 3개.*100kg.*2세트에서 3세트.*55·70kg.*준비 세트/);
  assert.deepEqual({ current, previous }, before);
});

test("reclassifying a lower general set as warmup is recognized even without expanding heavier work", () => {
  const previous = prior([[55, 12], [100, 15], [100, 15]]), current = now([[100, 15], [100, 15]]);
  current.sets.unshift(set("current-warmup", 55, 12, { marker: "W" }));
  const result = run(current, previous, [previous]);
  const reclassified = signal(result, "work-reclassified-as-warmup");
  assert.ok(reclassified); assert.deepEqual(reclassified.loadKg, [55]);
  assert.deepEqual(reclassified.currentWarmupSetIds, ["current-warmup"]);
  assert.equal(result.facts.previous.setCount, 3); assert.equal(result.facts.current.setCount, 2);
  assert.match(result.assessment, /55kg.*준비/);
  assert.equal(signal(result, "heavy-work-expanded"), undefined);
});

test("partial warmup observations preserve unknown raw fields without entering general-set calculations", () => {
  const current = now([[100, 15]]);
  current.sets.unshift(set("unknown-reps", 55, null, { marker: "W" }), set("unknown-load", null, 10, { marker: "W" }));
  const before = structuredClone(current), result = run(current);
  assert.deepEqual(result.facts.current.warmupSets, [
    { id: "unknown-reps", loadKg: 55, reps: null, marker: "W" },
    { id: "unknown-load", loadKg: null, reps: 10, marker: "W" }
  ]);
  assert.equal(result.facts.current.setCount, 1); assert.equal(result.facts.current.totalReps, 15);
  assert.deepEqual(result.facts.current.source.setIds, ["current-set-0"]);
  assert.equal(result.facts.current.complete, true);
  assert.deepEqual(current, before);
});

test("stable base and one weaker heavy segment are read separately", () => {
  const result = run(now([[55, 11], [55, 11], [55, 11], [70, 5]]), prior([[55, 11], [55, 11], [55, 11], [70, 8]]));
  assert.ok(signal(result, "base-held-heavy-lower"));
  assert.equal(result.primaryAction.kind, "keep-base-check-heavy");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-3"]);
  assert.match(result.assessment, /55kg.*유지.*무거운 구간만/s);
  assert.match(result.primaryAction.body, /55kg.*그대로/s);
});

test("a heavy segment before the base does not invent an ending position or fatigue cause", () => {
  const result = run(now([[70, 5], [55, 11], [55, 11]]), prior([[70, 8], [55, 11], [55, 11]]));
  assert.ok(signal(result, "base-held-heavy-lower"));
  assert.doesNotMatch(text(result), /마지막 무거운|앞 구간 뒤|피로 때문에/);
  assert.match(result.primaryAction.body, /시도하기 전에/);
});

test("first set held and better tail are an improvement in completed work", () => {
  const result = run(now([[65, 11], [65, 10], [65, 9]]), prior([[65, 11], [65, 8], [65, 7]]));
  assert.ok(signal(result, "tail-improved"));
  assert.equal(result.primaryAction.kind, "confirm-improved-tail");
  assert.match(result.assessment, /26회에서 30회/);
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-1", "current-set-2"]);
});

test("first set held and a moderate tail loss targets the tail rather than increasing the first", () => {
  const result = run(now([[65, 11], [65, 10], [65, 8]]), prior([[65, 11], [65, 10], [65, 9]]));
  assert.ok(signal(result, "tail-lower"));
  assert.equal(result.primaryAction.kind, "restore-tail");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-2"]);
  assert.doesNotMatch(result.primaryAction.body, /12회를 시도/);
});

test("opposing tail changes are not cancelled by the unchanged total repetitions", () => {
  const result = run(now([[65, 11], [65, 12], [65, 6]]), prior([[65, 11], [65, 10], [65, 8]]));
  assert.ok(signal(result, "mixed-tail-change"));
  assert.equal(result.primaryAction.kind, "rebalance-tail");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-2"]);
  assert.deepEqual(result.supportingActions[0].focusSetIds, ["current-set-1"]);
});

test("a whole set-count expansion is itself a workload change", () => {
  const result = run(now([[65, 11], [65, 11], [65, 11], [65, 11]]), prior([[65, 11], [65, 11]]));
  assert.ok(signal(result, "work-expanded"));
  assert.equal(result.primaryAction.kind, "hold-expanded-work");
  assert.match(result.assessment, /2개에서 4개/);
});

test("a changed load segment is not falsely called a total set expansion", () => {
  const result = run(now([[90, 14], [90, 14], [90, 14]]), prior([[50, 14], [70, 14], [90, 14]]));
  assert.equal(signal(result, "work-expanded"), undefined);
  assert.equal(result.facts.current.setCount, 3);
  assert.equal(result.facts.previous.setCount, 3);
  assert.equal(result.facts.loadComparisons[0].current.setCount, 3);
  assert.ok(signal(result, "heavy-work-expanded"));
  assert.equal(result.primaryAction.kind, "hold-redistributed-work");
});

test("fewer total sets can still expand work at the highest actual load", () => {
  const result = run(now([[90, 14], [90, 14], [90, 14]]), prior([[50, 14], [65, 14], [90, 14], [90, 14]]));
  const changed = signal(result, "heavy-work-expanded");
  assert.equal(changed.previousTotalSetCount, 4);
  assert.equal(changed.currentTotalSetCount, 3);
  assert.equal(changed.previousLoadSetCount, 2);
  assert.equal(changed.currentLoadSetCount, 3);
  assert.equal(result.primaryAction.kind, "hold-redistributed-work");
  assert.match(result.assessment, /4개에서 3개.*2세트에서 3세트/s);
});

test("higher rear repetitions stay visible after moving more sets to the highest load", () => {
  const result = run(now([[90, 14], [90, 14], [90, 14], [90, 24]]), prior([[90, 14], [90, 14], [80, 14], [80, 14]]));
  assert.equal(result.primaryAction.kind, "hold-redistributed-work");
  assert.equal(result.supportingActions[0].kind, "preserve-rep-distribution");
  assert.match(text(result), /마지막 24회/);
  assert.match(result.supportingActions[0].body, /모든 세트.*맞출 필요는 없/);
});

test("higher load with maintained high-repetition work is recognized without an RM model", () => {
  const current = now([[19, 14], [19, 14], [19, 14], [19, 14]]), previous = prior([[16, 14], [16, 14], [16, 14], [16, 14]]);
  const result = run(current, previous);
  assert.ok(signal(result, "load-raised-held-work"));
  assert.equal(result.primaryAction.kind, "consolidate-raised-load");
  assert.match(result.assessment, /16kg에서 19kg/);
  assert.match(result.assessment, /14·14·14·14회/);
  assert.doesNotMatch(text(result), /1RM|최대 능력/);
});

test("recent recovery is emphasized instead of measuring current work against the old peak", () => {
  const current = now([[75, 8], [75, 7]]), previous = prior([[75, 6], [75, 5]]), old = older([[75, 11], [75, 9]]);
  const result = run(current, previous, [old, previous], { performance: { model: { current: { loadKg: 75, reps: 8 }, expectedRepsAtCurrentLoad: { min: 10, max: 12 } } } });
  assert.ok(signal(result, "recovering-working-performance"));
  assert.equal(result.primaryAction.kind, "continue-recovery");
  assert.match(result.assessment, /6·5회보다.*8·7회/s);
  assert.doesNotMatch(text(result), /예상보다 적|저하|부진/);
});

test("an actual first-set and rear-set improvement is recognized without an older peak", () => {
  const result = run(now([[65, 12], [65, 11], [65, 10]]), prior([[65, 10], [65, 9], [65, 8]]));
  assert.ok(signal(result, "whole-work-improved"));
  assert.equal(result.primaryAction.kind, "consolidate-improved-work");
  assert.match(result.assessment, /27회에서 33회/);
});

test("one set improvement receives an actual prior-to-current assessment", () => {
  const result = run(now([[45, 12]]), prior([[45, 10]]));
  assert.equal(result.primaryAction.kind, "consolidate-improved-work");
  assert.match(result.assessment, /45kg × 10회.*45kg × 12회/);
  assert.match(result.assessment, /2회를 더/);
});

test("a changed mixed-load pattern still connects the full actual old work", () => {
  const result = run(now([[42, 7], [36, 9], [31, 8]]), prior([[42, 12], [42, 10], [31, 10]]));
  assert.ok(signal(result, "work-composition-rebuilt"));
  assert.equal(result.primaryAction.kind, "repeat-rebuilt-work");
  assert.match(result.assessment, /42kg × 12·10회/);
  assert.match(result.assessment, /36kg × 9회/);
});

test("three complete matching vectors establish a stable working standard", () => {
  const values = [[65, 11], [65, 10], [65, 9]], previous = prior(values), old = older(values);
  const result = run(now(values), previous, [old, previous]);
  assert.equal(signal(result, "stable-whole-work").observationDays, 3);
  assert.equal(result.primaryAction.kind, "progression-option");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-2"]);
  assert.match(result.primaryAction.body, /10회를 시도/);
});

test("stable entry and dominant working segments progress a working set rather than the entry set", () => {
  const values = [[12, 18], [18, 18], [18, 18], [18, 18]], previous = prior(values);
  const result = run(now(values), previous, [older(values), previous]);
  assert.equal(result.primaryAction.kind, "progression-option");
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-1"]);
  assert.match(result.primaryAction.body, /18kg × 18회.*19회를 시도/);
  assert.doesNotMatch(result.primaryAction.body, /12kg × 18회 한 세트/);
});

test("stable low-repetition lead work is not forced upward when backoff is the dominant segment", () => {
  const values = [[110, 3], [85, 8], [85, 7]], previous = prior(values);
  const result = run(now(values), previous, [older(values), previous]);
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-2"]);
  assert.match(result.primaryAction.body, /85kg × 7회.*8회를 시도/);
  assert.doesNotMatch(result.primaryAction.body, /110kg.*4회를 시도/);
});

test("a zero-RIR dominant rear set is not prescribed another repetition", () => {
  const values = [[65, 11], [65, 9]], current = now(values), previous = prior(values), old = older(values);
  current.sets[1].rir = 0;
  const result = run(current, previous, [old, previous]);
  assert.equal(result.primaryAction.kind, "maintain-work");
  assert.doesNotMatch(result.primaryAction.body, /10회를 시도/);
});

test("one ordinary set does not claim that unclassified marked rear sets were also stable", () => {
  const current = now([[null, 13]]), previous = prior([[null, 13]]), old = older([[null, 13]]);
  for (const value of [current, previous, old]) {
    value.loadConvention = "bodyweight"; value.loadRole = "unknown";
    value.sets.push(set(value.id + "-marked", null, 8, { marker: "A" }));
  }
  const result = run(current, previous, [old, previous]);
  assert.ok(signal(result, "stable-whole-work"));
  assert.match(result.assessment, /일반 세트를/);
  assert.doesNotMatch(result.assessment, /뒤 세트까지 유지/);
});

for (const goal of ["lose", "maintain"]) test(`a ${goal} weight goal permits a source-bound optional progression after whole-work stability`, () => {
  const values = [[65, 11], [65, 10], [65, 9]], previous = prior(values);
  const result = run(now(values), previous, [older(values), previous], { profile: { goal } });
  assert.equal(result.primaryAction.kind, "progression-option");
  assert.match(result.primaryAction.body, /회복과 세트 여유|유지하는 것도 선택/);
  assert.deepEqual(result.primaryAction.proposal, { kind: "single-set-reps", setId: "current-set-2", loadKg: 65, baseReps: 9, targetReps: 10 });
  assert.doesNotMatch(result.primaryAction.body, /12회를 시도/);
});

test("stable first sets alone do not manufacture whole-work stability", () => {
  const result = run(now([[65, 11], [65, 8], [65, 6]]), prior([[65, 11], [65, 9], [65, 7]]),
    [older([[65, 11], [65, 10], [65, 9]]), prior([[65, 11], [65, 9], [65, 7]])]);
  assert.ok(signal(result, "stable-leading-only"));
  assert.equal(signal(result, "stable-whole-work"), undefined);
  assert.equal(result.primaryAction.kind, "restore-tail");
});

test("a different device cannot enter the baseline even at matching load and reps", () => {
  const current = now([[65, 11], [65, 10]]), previous = prior([[65, 11], [65, 10]]);
  const result = run(current, { ...previous, equipmentKey: "rack-two" }, [older([[65, 11], [65, 10]]), { ...previous, equipmentKey: "rack-two" }]);
  assert.equal(result.facts.previous, null);
  assert.deepEqual(result.facts.historyDays, ["2026-09-26"]);
  assert.equal(signal(result, "stable-whole-work"), undefined);
});

for (const changed of [{ loadConvention: "per-side" }, { loadRole: "assistance" }, { variantKey: "paused" }, { exerciseId: "bench_press" }]) {
  test(`different scope ${JSON.stringify(changed)} is not reused`, () => {
    const values = [[65, 11]], previous = prior(values);
    const result = run(now(values), { ...previous, ...changed }, [{ ...older(values), ...changed }, { ...previous, ...changed }]);
    assert.equal(result.facts.previous, null);
    assert.deepEqual(result.facts.historyDays, []);
  });
}

test("same-day repeated blocks are not counted as two independent observations", () => {
  const values = [[65, 11]], first = row("repeat-one", "2026-10-01", values), second = row("repeat-two", "2026-10-01", values);
  const result = run(now(values), null, [older(values), first, second]);
  assert.deepEqual(result.facts.historyDays, ["2026-09-26"]);
  assert.equal(signal(result, "stable-whole-work"), undefined);
});

test("a repeated current block does not claim stable historical progression", () => {
  const values = [[65, 11]], previous = prior(values);
  const result = run(now(values), previous, [older(values), previous], { currentAmbiguous: true });
  assert.equal(result.facts.previous, null);
  assert.deepEqual(result.facts.historyDays, []);
  assert.equal(signal(result, "stable-whole-work"), undefined);
});

test("source copies are deduplicated, conflicts quarantined and future days excluded", () => {
  const values = [[65, 11]], previous = prior(values), old = older(values);
  const result = run(now(values), previous, [old, structuredClone(old), previous, { ...structuredClone(previous), sets: [set("conflict", 65, 9)] }, row("future", "2026-10-07", values)]);
  assert.deepEqual(result.facts.historyDays, ["2026-09-26"]);
  assert.equal(signal(result, "stable-whole-work"), undefined);
});

test("old matching work is remembered but does not establish recent stability or demand old load", () => {
  const values = [[65, 11], [65, 10]], old = row("old", "2026-07-01", values), previous = row("old-next", "2026-08-01", [[85, 11], [85, 10]]);
  const result = run(now(values), previous, [old, previous]);
  assert.equal(signal(result, "stable-whole-work"), undefined);
  assert.deepEqual(result.facts.recentHistoryDays, []);
  assert.match(result.assessment, /2026-08-01의 오래된 기록/);
  assert.equal(result.primaryAction.kind, "reestablish-current-work");
  assert.doesNotMatch(result.primaryAction.body, /85kg|재도입/);
});

test("old comparison never erases a current backoff task", () => {
  const current = now([[115, 3], [95, 7], [95, 5]]), previous = row("old", "2026-07-01", [[95, 11], [95, 10], [95, 9]]);
  const result = run(current, previous, [previous]);
  assert.equal(result.primaryAction.kind, "reestablish-current-work");
  assert.equal(result.supportingActions[0].kind, "restore-tail");
  assert.deepEqual(result.supportingActions[0].focusSetIds, ["current-set-1", "current-set-2"]);
});

test("first session advice reads the rear sets without requiring effort feedback", () => {
  const result = run(now([[22, 9], [22, 9], [22, 6]]));
  assert.equal(result.primaryAction.kind, "restore-tail");
  assert.match(result.assessment, /9·9·6회/);
  assert.doesNotMatch(text(result), /RIR|알 수 없|부족/);
});

test("unknown role with a known loaded movement supports displayed-load composition without changing the role", () => {
  const current = { ...now([[35, 11], [35, 11], [35, 10]]), loadRole: "unknown" };
  const previous = { ...prior([[35, 11], [45, 11], [45, 9]]), loadRole: "unknown" };
  const result = run(current, previous, [], { loadedMovement: true });
  assert.ok(signal(result, "heavier-work-removed"));
  assert.equal(result.facts.current.loadRole, "unknown");
  assert.equal(result.facts.current.maxLoadKg, 35);
  assert.equal(current.loadRole, "unknown");
});

test("unknown movement does not infer external kg or use null equality as a highest-load match", () => {
  const current = { ...now([[35, 11], [35, 11]]), exerciseId: null, rawName: "알 수 없는 동작", loadRole: "unknown" };
  const previous = { ...prior([[45, 11]]), exerciseId: null, rawName: "알 수 없는 동작", loadRole: "unknown" };
  const result = run(current, previous);
  assert.equal(result.facts.current.maxLoadKg, null);
  assert.equal(signal(result, "heavier-work-removed"), undefined);
  assert.equal(signal(result, "work-expanded"), undefined);
  assert.doesNotMatch(text(result), /같은 최고/);
});

test("assistance load is not read as an external-load increase even if caller marks movement loaded", () => {
  const current = { ...now([[55, 11], [55, 11]]), loadRole: "assistance" }, previous = { ...prior([[45, 11], [45, 11]]), loadRole: "assistance" };
  const result = run(current, previous, [], { loadedMovement: true });
  assert.equal(result.facts.current.maxLoadKg, null);
  assert.equal(signal(result, "load-raised-held-work"), undefined);
  assert.equal(signal(result, "new-heavy-exposure"), undefined);
});

test("unknown bodyweight loads remain unknown and do not create tonnage", () => {
  const current = { ...now([[null, 13], [null, 11]]), loadConvention: "bodyweight", loadRole: "unknown" };
  const result = run(current);
  assert.equal(result.facts.current.maxLoadKg, null);
  assert.equal(result.facts.current.displayedLoadReps, null);
  assert.equal(result.facts.current.sets[0].loadKg, null);
});

test("warmups and unresolved markers are preserved outside general-work interpretation", () => {
  const current = now([[65, 11], [65, 10]]);
  current.sets.unshift(set("warmup", 25, 15, { marker: "W" }));
  current.sets.push(set("marked", null, 8, { marker: "A" }));
  const result = run(current);
  assert.equal(result.facts.current.setCount, 2);
  assert.deepEqual(result.facts.current.source.setIds, ["current-set-0", "current-set-1"]);
  assert.equal(current.sets.length, 4);
});

test("missing ordinary repetitions cannot masquerade as a complete stable workload", () => {
  const current = now([[65, 11], [65, null]]), values = [[65, 11]];
  const result = run(current, prior(values), [older(values), prior(values)]);
  assert.equal(result.facts.current.complete, false);
  assert.equal(result.primaryAction, null);
  assert.equal(signal(result, "stable-whole-work"), undefined);
});

test("different returning load segments keep all source set identities", () => {
  const current = now([[65, 11], [50, 15], [65, 9]]), previous = prior([[65, 11], [50, 15], [65, 8]]);
  const result = run(current, previous);
  assert.deepEqual(result.facts.current.segments.map(value => value.setIds), [["current-set-0"], ["current-set-1"], ["current-set-2"]]);
  assert.deepEqual(result.facts.loadComparisons[0].current.setIds, ["current-set-0", "current-set-2"]);
  assert.deepEqual(result.primaryAction.focusSetIds, ["current-set-2"]);
});

test("interpretation is pure and all action/source IDs come from actual input sets", () => {
  const current = now([[115, 3], [95, 7], [95, 5]]), previous = prior([[95, 11], [95, 10], [95, 9]]);
  const input = { current, previous, history: [previous], profile: { goal: "recomp" } }, before = structuredClone(input);
  const result = C.interpret(input);
  assert.deepEqual(input, before);
  const currentIds = new Set(current.sets.map(value => value.id));
  for (const item of [result.primaryAction, ...result.supportingActions]) for (const id of item.focusSetIds) assert.ok(currentIds.has(id));
  for (const item of result.signals) for (const source of item.sourceRefs) {
    assert.ok(source.date); assert.ok(source.sessionId); assert.ok(source.blockId);
    assert.ok(source.setIds.every(id => current.sets.some(set => set.id === id) || previous.sets.some(set => set.id === id)));
  }
});
