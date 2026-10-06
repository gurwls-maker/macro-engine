"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Storage = require("../src/storage.js");
const Query = require("../src/coach-query.js");
const Activity = require("../src/activity-coaching.js");
const Runtime = require("../tools/coach-runtime.cjs");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");

const date = "2026-10-04";
const session = (id, sport = "running", details) => ({ id, sport, durationMin: 30, intensity: "moderate", ...(details === undefined ? {} : { details }) });
const day = (when, sessions = []) => ({ date: when, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null,
  bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [], sessions, complete: false, planSnapshot: null });
const state = sessions => { const value = Storage.createEmpty(); value.days[date] = day(date, sessions); return value; };
const chat = (answer, claims) => ({ kind: "chat", answer, questions: [], uncertainties: [], workouts: [], meal: null, body: null,
  coaching: { claims: claims.map(fact => ({ factId: fact.id, value: fact.value })), followUp: null } });

test("optional activity details and current recovery round trip without fabricating missing fields", () => {
  const input = state([session("old"), session("null", "walking", null), session("empty", "cycling", {}),
    session("swim", "swimming", { label: "자유형", distanceM: 1000.125, movingMin: 23.125, stroke: "자유형", poolLengthM: 25,
      effortRpe: null, avgHeartRateBpm: null, notes: "휴식 포함\n기술 연습", intent: "technique" })]);
  input.days[date].coachCheckin = { energy: "okay", hunger: "okay", sleep: "good", illness: "recovering",
    pain: "none", fatigue: "usual", sleepHours: 7.25, interruptionReason: "illness" };
  const before = structuredClone(input), restored = Storage.parseBackup(Storage.exportBackup(input)).state;
  assert.deepEqual(restored, before); assert.deepEqual(input, before);
  assert.equal(Object.hasOwn(restored.days[date].sessions[0], "details"), false);
  assert.equal(restored.days[date].sessions[1].details, null);
  assert.equal(restored.days[date].sessions[3].details.effortRpe, null);
});

test("activity metric schema rejects coercion, unsupported units and unbounded or contradictory values", () => {
  for (const details of [{ distanceM: "5000" }, { distanceM: -1 }, { movingMin: 31 }, { effortRpe: 0 },
    { effortRpe: 11 }, { avgHeartRateBpm: 250 }, { avgPowerW: 200 }, { poolLengthM: 25 }, { stroke: "자유형" },
    { pace: 5 }, { sequenceConfirmed: "true" }, { segments: null }]) {
    assert.throws(() => Storage.validateState(state([session("bad", "running", details)])), JSON.stringify(details));
  }
  const zero = Storage.validateState(state([session("valid", "cycling", { distanceM: 0, movingMin: 0, avgPowerW: 0 })]));
  assert.equal(zero.days[date].sessions[0].details.avgPowerW, 0);
});

test("segment totals are inside the parent time, not a second workout, and aliases are not silently merged", () => {
  const details = { label: "HYROX", format: "hybrid", sequenceConfirmed: true,
    segments: [{ id: "run", label: "달리기", kind: "run", durationMin: 12.125, distanceM: 2000 },
      { id: "carry", label: "운반", kind: "carry", durationMin: 8.25, loadKg: 24, reps: null }] };
  const input = state([session("mixed", "mixed", details)]);
  const result = Storage.parseBackup(Storage.exportBackup(input)).state;
  assert.deepEqual(result.days[date].sessions[0].details, details);
  const period = Query.retrieve(result, date, "오늘 하이록스 기록").periods[0].activities;
  assert.equal(period.durationMin, 30); assert.equal(period.sessionCount, 1);
  for (const parts of [[details.segments[0], { ...details.segments[1], id: "run" }],
    [{ ...details.segments[0], durationMin: 20 }, { ...details.segments[1], durationMin: 20 }],
    [{ ...details.segments[1], reps: 2.5 }]]) {
    assert.throws(() => Storage.validateState(state([session("bad", "mixed", { ...details, segments: parts })])));
  }
});

test("recovery fields remain optional and fail closed on unknown numeric or choice values", () => {
  const input = state([]);
  assert.equal(Object.hasOwn(Storage.validateState(input).days[date], "coachCheckin"), false);
  for (const extra of [{ sleepHours: "8" }, { sleepHours: -1 }, { sleepHours: 25 }, { illness: "diagnosed" },
    { pain: "severe" }, { fatigue: "overtrained" }, { interruptionReason: "rest-confirmed" }]) {
    input.days[date].coachCheckin = { energy: "okay", hunger: "okay", sleep: "good", ...extra };
    assert.throws(() => Storage.validateState(input));
  }
});

test("sport query uses its entire requested period and only known distances, while retaining other sports separately", () => {
  const input = state([]);
  for (let index = 1; index <= 30; index++) {
    const when = `2026-09-${String(index).padStart(2, "0")}`;
    input.days[when] = day(when, [session(`run-${index}`, "running", index % 2 ? { distanceM: 5000 } : {}),
      session(`bike-${index}`, "cycling", { distanceM: 10000 })]);
  }
  input.days["2026-10-05"] = day("2026-10-05", [session("future", "running", { distanceM: 90000 })]);
  const before = structuredClone(input), query = Query.retrieve(input, date, "2026-09-01부터 2026-09-30까지 달리기 기록을 봐줘");
  assert.deepEqual(query.sports, ["running"]);
  const activity = query.periods[0].activities;
  assert.equal(activity.sessionCount, 30); assert.equal(activity.dayCount, 30); assert.equal(activity.durationMin, 900);
  assert.equal(activity.bySport[0].distanceKnownSessionCount, 15); assert.equal(activity.bySport[0].recordedDistanceM, 75000);
  assert.deepEqual(activity.actualRange, { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(activity.sampled, true); assert.equal(activity.samples.length, 3);
  assert.deepEqual(input, before);
});

test("time-only activity retrieval cannot become a zero distance or no-training result", () => {
  const input = state([session("ride", "cycling")]);
  const period = Query.retrieve(input, date, "오늘 사이클 운동").periods[0];
  assert.equal(period.activities.sessionCount, 1); assert.equal(period.activities.bySport[0].recordedDistanceM, null);
  assert.equal(period.activities.bySport[0].distanceKnownSessionCount, 0);
  assert.ok(!period.missingSignals.some(text => text.includes("저장 운동 기록이 없습니다")));
});

test("a repeated changed work episode retains its older ordinary baseline and true repeated purpose days", () => {
  const input = state([]);
  for (const [when, durationMin, intent] of [["2026-09-07", 30, "regular"], ["2026-09-09", 30, "regular"],
    ["2026-09-21", 15, "deload"], ["2026-09-23", 15, "deload"], [date, 15, "deload"]]) {
    input.days[when] = day(when, [{ ...session(when, "walking", { intent }), durationMin }]);
  }
  const result = Activity.build(input, date).current[0];
  assert.match(result.assessment, /2026-09-21부터 3일/);
  assert.equal(result.action.kind, "deload"); assert.deepEqual(result.alternatives, []);
  assert.ok(result.sources.some(source => source.date === "2026-09-09"));
});

test("derived swim pace is citeable as an activity estimate without inventing RIR or accepting unrelated numbers", () => {
  const input = state([session("swim", "swimming", { distanceM: 1000, movingMin: 25, effortRpe: 6 })]);
  const context = Runtime.summarizeState(input, date, "오늘 수영 분석");
  const fact = context.facts.find(item => item.id.endsWith("paceMinPer100M"));
  assert.equal(fact.value, 2.5); assert.equal(fact.unit, "분/100m"); assert.equal(fact.estimated, true);
  assert.equal(fact.source, "activity-record-estimate");
  for (const text of ["100m당 평균은 150초/100m예요.", "평균은 2분 30초/100m예요.", "평균은 2:30/100m예요.", "평균은 2.5분/100m예요."]) {
    assert.doesNotThrow(() => Runtime.validateResult(chat(text, [fact]), "chat", context));
  }
  assert.throws(() => Runtime.validateResult(chat("120초/100m였어요.", [fact]), "chat", context));
  assert.throws(() => Runtime.validateResult(chat("RIR 6이었어요.", [fact]), "chat", context));
  assert.throws(() => Runtime.validateResult(chat("500W였어요.", [fact]), "chat", context));
});

test("a richly linked full-month AI context fits the actual prompt budget without shrinking period aggregates", () => {
  const cases = Fixtures.buildScenarios({ suite: "core", richActivity: true });
  for (const id of ["mixed-gradual", "strength-gradual", "swimming-sharp-improvement", "mixed-recent-load-fatigue"]) {
    const scenario = cases.find(value => value.id === id);
    assert.ok(scenario, id);
    const input = Fixtures.asOf(scenario, date, { richActivity: true }), before = structuredClone(input);
    const context = Runtime.summarizeState(input, date, scenario.question);
    assert.ok(Buffer.byteLength(Runtime.promptFor({ kind: "chat", question: scenario.question, context }), "utf8") <= 245 * 1024);
    const expected = Query.retrieve(input, date, scenario.question).periods;
    context.retrieval.periods.forEach((period, index) => {
      assert.deepEqual(period.training.coverage, expected[index].training.coverage);
      assert.deepEqual(period.activities.bySport, expected[index].activities.bySport);
      assert.deepEqual(period.nutrition, expected[index].nutrition);
    });
    assert.deepEqual(input, before);
  }
  const fatigue = cases.find(value => value.id === "mixed-recent-load-fatigue"), checkpoint = fatigue.checkpoints[2];
  const input = Fixtures.asOf(fatigue, checkpoint.date, { richActivity: true });
  const context = Runtime.summarizeState(input, checkpoint.date, checkpoint.question);
  assert.ok(Buffer.byteLength(Runtime.promptFor({ kind: "chat", question: checkpoint.question, context }), "utf8") <= 245 * 1024);
  assert.equal(context.trainingCoaching.exerciseContexts.length, context.trainingCoaching.coverage.originalContextCount);
  for (const row of context.trainingCoaching.exerciseContexts) {
    const record = input.training.records.find(record => record.id === row.actual.current.source.sessionId);
    const original = record.exercises.find(exercise => exercise.id === row.blockId).sets.filter(set => set.marker === null);
    assert.deepEqual(row.actual.current.sets.map(set => [set.id, set.loadKg, set.reps]), original.map(set => [set.id, set.loadKg, set.reps]));
  }
});

test("compact prompt facts restore every identifier, label, value, unit, source, date and estimate without changing the server context", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "strength-unexpected-decline");
  const at = scenario.checkpoints[2].date, input = Fixtures.asOf(scenario, at, { richActivity: true });
  const context = Runtime.summarizeState(input, at, "최근 기록을 함께 봐줘"), before = structuredClone(context);
  const request = JSON.parse(Runtime.promptFor({ kind: "chat", context }).split("REQUEST_JSON (데이터):\n")[1]);
  const { restore } = require("./fixtures/coach-prompt-decoder.cjs");
  const restored = restore(request).context;
  assert.deepEqual(restored, context);
  assert.deepEqual(context, before);
  assert.ok(restored.facts.some(fact => fact.source === "training-coaching-observation" && fact.date === "2026-09-11" && fact.value === 105 && fact.unit === "kg"));
  assert.equal(new Set(restored.facts.map(fact => fact.id)).size, restored.facts.length);
});

test("AI carries the old ordinary sets and intermediate work stages as source-bound observations, not hypothesis facts", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "strength-unexpected-decline");
  const at = "2026-09-27", input = Fixtures.asOf(scenario, at, { richActivity: true });
  const context = Runtime.summarizeState(input, at, scenario.question);
  const movement = context.trainingCoaching.exerciseContexts[0], episode = movement.actual.recentChange;
  assert.equal(episode.baseline.date, "2026-09-11"); assert.equal(episode.baseline.setCount, 3);
  assert.equal(episode.baseline.totalReps, 24); assert.equal(episode.baseline.maxLoadKg, 80);
  assert.equal(episode.currentSince, "2026-09-21"); assert.equal(episode.observationDays, 3);
  assert.equal(movement.hypotheses.recentChange.kind, "reduced");
  for (const observation of [episode.baseline, ...episode.stages.map(stage => stage.work)]) {
    const source = input.training.records.find(record => record.id === observation.source.sessionId && record.date === observation.date);
    const block = source.exercises.find(exercise => exercise.id === observation.source.blockId);
    assert.deepEqual(observation.source.setIds, observation.sets.map(set => set.id));
    observation.sets.forEach(set => {
      const original = block.sets.find(value => value.id === set.id);
      assert.equal(set.loadKg, original.loadKg); assert.equal(set.reps, original.reps); assert.equal(set.rir, original.rir);
    });
    assert.equal(observation.setCount, block.sets.filter(set => set.marker === null).length);
  }
  assert.ok(context.facts.some(fact => fact.date === "2026-09-11" && fact.value === 80 && fact.unit === "kg" && fact.source === "training-coaching-observation" && !fact.estimated));
  assert.ok(!context.facts.some(fact => fact.id.includes("hypotheses")));
});

test("returning to established work after illness does not make temporary recovery work the normal volume baseline", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-illness-partial-food");
  const input = Fixtures.asOf(scenario, date, { richActivity: true }), result = Activity.build(input, date);
  for (const row of [...result.current, ...result.latest]) {
    assert.notEqual(row.action.kind, "consolidate-volume");
    assert.doesNotMatch(row.action.body, /익숙한 20분/);
  }
});

test("return after a low-work sleep/fatigue episode keeps the earlier ordinary work instead of defining fifteen minutes as normal", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-deficit-sleep-decline");
  const input = Fixtures.asOf(scenario, date, { richActivity: true }), result = Activity.build(input, date);
  assert.equal(result.current.length, 0);
  const row = result.latest[0];
  assert.equal(row.date, "2026-10-02"); assert.equal(row.action.kind, "return-established-work");
  assert.match(row.action.body, /30분/); assert.doesNotMatch(row.action.body, /익숙한 15분/);
  assert.ok(row.sources.some(source => source.date === "2026-09-11"));
  assert.ok(row.sources.some(source => source.date === "2026-09-25"));
});

test("multiple differently configured past same-day activities never select an arbitrary last segment baseline", () => {
  const input = state([session("now", "mixed", { label: "HYROX", format: "hybrid", sequenceConfirmed: true,
    segments: [{ id: "current-part", label: "운반", kind: "carry", loadKg: 24, durationMin: 10 }] })]);
  input.days["2026-09-28"] = day("2026-09-28", [
    session("morning", "mixed", { label: "다른 구성 A", format: "hybrid", sequenceConfirmed: true,
      segments: [{ id: "a-part", label: "운반", kind: "carry", loadKg: 12, durationMin: 5 }] }),
    session("evening", "mixed", { label: "HYROX", format: "hybrid", sequenceConfirmed: true,
      segments: [{ id: "b-part", label: "운반", kind: "carry", loadKg: 30, durationMin: 15 }, { id: "b-run", label: "달리기", kind: "run", durationMin: 5 }] })]);
  const result = Activity.build(input, date).current[0];
  assert.equal(result.comparison.previous, null);
  assert.equal(result.comparison.lastSportDate, "2026-09-28");
  assert.ok(result.comparison.observations.filter(row => row.kind === "hybrid-segment").every(row => row.previous === null));
  assert.notEqual(result.action.kind, "hybrid-segment-review");
});

test("missing current health input does not erase a dated illness or pain report, while explicit recovery changes the action", () => {
  const input = state([]);
  input.days["2026-09-25"] = day("2026-09-25", [session("last-swim", "swimming", { distanceM: 1000 })]);
  input.days["2026-09-25"].coachCheckin = { energy: "okay", hunger: "okay", sleep: "okay", illness: "active", pain: "stop" };
  const unknown = Activity.build(input, date).latest[0];
  assert.equal(unknown.action.kind, "health-follow-up"); assert.match(unknown.action.body, /2026-09-25/);
  assert.match(unknown.action.body, /지금도 증상이나 통증이 남아 있다면/);
  assert.deepEqual(unknown.alternatives, []); assert.ok(unknown.sources.some(source => source.kind === "health-checkin"));
  input.days[date].coachCheckin = { energy: "good", hunger: "okay", sleep: "good", illness: "none", pain: "none" };
  const resolved = Activity.build(input, date).latest[0];
  assert.equal(resolved.action.kind, "repeat"); assert.equal(resolved.date, "2026-09-25");
});

test("full-month body variation and exact dates survive AI background trimming without calling it water or fat", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-water-change");
  const input = Fixtures.asOf(scenario, date, { richActivity: true });
  const context = Runtime.summarizeState(input, date, "2026-09-07부터 2026-10-04까지 체중과 운동 흐름을 같이 봐줘");
  const history = context.retrieval.periods[0].body.history;
  assert.equal(history.originalWeightChangeCount, 2);
  assert.ok(history.weightChanges.some(row => row.from === "2026-09-16" && row.to === "2026-09-17" && row.after.weightKg === 80.8));
  assert.ok(history.weightChanges.some(row => row.from === "2026-09-17" && row.to === "2026-09-18" && row.after.weightKg === 78.1));
  assert.equal(history.metrics.find(row => row.key === "weightKg").max.date, "2026-09-17");
  assert.ok(context.facts.some(fact => fact.value === 80.8 && fact.unit === "kg" && fact.date === "2026-09-17" && !fact.estimated));
  assert.ok(!JSON.stringify(history).includes('"cause"'));
  assert.ok(Buffer.byteLength(Runtime.promptFor({ kind: "chat", context }), "utf8") <= 245 * 1024);
});

test("normalized weekly weight changes retain calculation provenance and cannot masquerade as individual body weights", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-surplus-fast-weight");
  const input = Fixtures.asOf(scenario, date, { richActivity: true });
  const context = Runtime.summarizeState(input, date, "최근 체중 흐름과 식사를 봐줘");
  const link = context.decisionContext.activity.connections.find(row => row.kind === "weight-training");
  const observed = link.observations[0];
  const rate = context.facts.find(fact => fact.id.endsWith(".weeklyChangeKg"));
  const percent = context.facts.find(fact => fact.id.endsWith(".weeklyChangePct"));
  assert.equal(rate.value, observed.weeklyChangeKg); assert.equal(rate.unit, "kg/주");
  assert.equal(percent.value, observed.weeklyChangePct); assert.equal(percent.unit, "%/주");
  assert.equal(rate.estimated, true); assert.equal(rate.source, "measurement-summary-estimate");
  assert.equal(rate.date, observed.to); assert.equal(percent.date, observed.to);
  for (const key of ["earlierMedianKg", "laterMedianKg", "differenceKg"]) {
    const fact = context.facts.find(row => row.id.endsWith(`.${key}`));
    assert.equal(fact.estimated, true); assert.equal(fact.source, "measurement-summary-estimate");
    assert.equal(fact.date, observed.to);
  }
  for (const text of ["측정 간격을 맞춘 흐름은 주당 약 +1.2kg이에요.", "주간 변화는 1.2kg예요.", "변화는 1200g/주예요.", "흐름은 1.5%/주예요."]) {
    assert.doesNotThrow(() => Runtime.validateResult(chat(text, [rate, percent]), "chat", context));
  }
  assert.throws(() => Runtime.validateResult(chat("몸무게는 1.2kg예요.", [rate]), "chat", context));
  assert.throws(() => Runtime.validateResult(chat("주당 3kg씩 바뀌었어요.", [rate]), "chat", context));
  const raw = context.facts.find(fact => fact.unit === "kg" && !fact.estimated);
  assert.ok(raw);
  assert.throws(() => Runtime.validateResult(chat(`주당 ${raw.value}kg씩 바뀌었어요.`, [raw]), "chat", context));
});

test("selected-day and prior-history weight rates carry distinct actual measurement windows instead of one apparent observation", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-surplus-fast-weight");
  const at = "2026-09-18", input = Fixtures.asOf(scenario, at, { richActivity: true }), before = structuredClone(input);
  const context = Runtime.summarizeState(input, at, "최근 체중과 식사를 봐줘");
  const observation = context.decisionContext.activity.connections.find(row => row.kind === "weight-training").observations[0];
  const legacy = context.facts.find(row => row.id === "recent.weeklyWeightChangeKg");
  const linked = context.facts.find(row => row.id.endsWith(".weeklyChangeKg"));
  assert.notEqual(legacy.value, linked.value);
  assert.equal(legacy.date, "2026-09-17");
  assert.equal(linked.date, "2026-09-18"); assert.equal(linked.date, observation.to);
  assert.equal(context.priorWeightComparison.includesSelectedDay, false);
  assert.equal(context.priorWeightComparison.from, "2026-09-07");
  assert.equal(context.priorWeightComparison.to, legacy.date);
  assert.ok(!context.priorWeightComparison.laterDates.includes(at));
  assert.ok(observation.laterDates.includes(at));
  assert.match(legacy.label, /선택일 제외.*2026-09-07~2026-09-17/);
  assert.ok([legacy, linked].every(row => row.estimated && row.unit === "kg/주"));
  assert.deepEqual(input, before);
});

test("repeated weight comparisons preserve independent dates, units and source facts through the AI round trip", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(value => value.id === "cross-surplus-fast-weight");
  const at = "2026-10-04", input = Fixtures.asOf(scenario, at, { richActivity: true }), before = structuredClone(input);
  const context = Runtime.summarizeState(input, at, "최근 체중과 식사를 봐줘");
  const observation = context.decisionContext.activity.connections.find(row => row.kind === "weight-training").observations[0];
  const repeated = observation.repeatedWeightTrend;
  assert.equal(observation.followUpStage, "current-food-review");
  assert.equal(repeated.independentComparisonCount, 2);
  assert.equal(new Set(repeated.comparisons.flatMap(row => [...row.earlierDates, ...row.laterDates])).size, 16);
  for (const [index, comparison] of repeated.comparisons.entries()) {
    for (const key of ["earlierMedianKg", "laterMedianKg", "differenceKg", "weeklyChangeKg", "weeklyChangePct"]) {
      const fact = context.facts.find(row => row.label.endsWith(`repeatedWeightTrend.comparisons.${index} ${key}`));
      assert.ok(fact, `${index} ${key}`);
      assert.equal(fact.value, comparison[key]); assert.equal(fact.date, comparison.to);
      assert.equal(fact.unit, key === "weeklyChangeKg" ? "kg/주" : key === "weeklyChangePct" ? "%/주" : "kg");
      assert.equal(fact.estimated, true); assert.equal(fact.source, "measurement-summary-estimate");
    }
  }
  const middle = context.facts.find(row => row.label.endsWith("repeatedWeightTrend.betweenComparisons differenceKg"));
  assert.equal(middle.date, repeated.betweenComparisons.to);
  assert.equal(middle.value, repeated.betweenComparisons.differenceKg);
  assert.equal(repeated.betweenComparisons.from, repeated.comparisons[0].laterDates[0]);
  assert.equal(repeated.betweenComparisons.to, repeated.comparisons[1].earlierDates.at(-1));
  assert.deepEqual(repeated.betweenComparisons.earlierDates, repeated.comparisons[0].laterDates);
  assert.deepEqual(repeated.betweenComparisons.laterDates, repeated.comparisons[1].earlierDates);
  assert.equal(repeated.betweenComparisons.gapFrom, repeated.comparisons[0].to);
  assert.equal(repeated.betweenComparisons.gapTo, repeated.comparisons[1].from);
  const encoded = JSON.parse(Runtime.promptFor({ kind: "chat", question: "최근 체중과 식사를 봐줘", context }).split("REQUEST_JSON (데이터):\n")[1]);
  const { restore } = require("./fixtures/coach-prompt-decoder.cjs");
  const restored = restore(encoded).context;
  assert.deepEqual(restored.decisionContext.activity.connections, context.decisionContext.activity.connections);
  assert.deepEqual(restored.facts, context.facts);
  assert.deepEqual(input, before);
});
