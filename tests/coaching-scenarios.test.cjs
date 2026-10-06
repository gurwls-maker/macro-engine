"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");
const S = require("../src/storage.js");
const T = require("../src/training.js");
const Activity = require("../src/activity-coaching.js");
const Audit = require("../tools/audit-coaching-scenarios.cjs");

const all = Fixtures.buildScenarios({ richActivity: true });
const core = all.filter(scenario => !scenario.catalogExerciseId);
function byId(id) { return core.find(scenario => scenario.id === id); }
function numericWork(scenario, from = scenario.start, to = scenario.end) {
  return { activities: Object.entries(scenario.state.days).filter(([date]) => date >= from && date <= to).flatMap(([date, day]) => day.sessions.map(session => ({
    date, sport: session.sport, durationMin: session.durationMin, intensity: session.intensity, cardio: session.cardio || null,
    distanceM: session.details?.distanceM ?? null, movingMin: session.details?.movingMin ?? null,
    effortRpe: session.details?.effortRpe ?? null, avgHeartRateBpm: session.details?.avgHeartRateBpm ?? null, avgPowerW: session.details?.avgPowerW ?? null,
    segments: (session.details?.segments || []).map(segment => ({ kind: segment.kind, durationMin: segment.durationMin, distanceM: segment.distanceM, loadKg: segment.loadKg, reps: segment.reps })) }))),
    workouts: scenario.state.training.records.filter(row => row.date >= from && row.date <= to).map(row => ({ date: row.date, durationMinutes: row.durationMinutes,
      exercises: row.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, loadConvention: exercise.loadConvention,
        sets: exercise.sets.map(set => [set.loadKg, set.reps, set.marker, set.rir]) })) })) };
}

test("monthly scenario catalog preserves every requested sport/context and all actual catalog movements", () => {
  for (const family of Fixtures.FAMILIES) {
    const rows = core.filter(scenario => scenario.family === family && !scenario.id.startsWith("cross-"));
    assert.equal(rows.length, Fixtures.REQUIREMENT_CATALOG.length);
    assert.deepEqual(new Set(rows.map(row => row.branch)), new Set(Fixtures.REQUIREMENT_CATALOG.map(item => item.id)));
  }
  assert.deepEqual(new Set(all.filter(scenario => scenario.catalogExerciseId).map(scenario => scenario.catalogExerciseId)), new Set(T.catalog.map(item => item.id)));
  assert.equal(new Set(all.map(scenario => scenario.id)).size, all.length);
  for (const scenario of all) {
    assert.equal(scenario.syntheticOnly, true);
    assert.equal(scenario.checkpoints.length, 4);
    assert.doesNotThrow(() => S.validateState(scenario.state));
  }
});

test("the first week preserves the same actually performed baseline within each sport", () => {
  for (const family of Fixtures.FAMILIES) {
    const rows = core.filter(scenario => scenario.family === family && !scenario.id.startsWith("cross-"));
    const baseline = numericWork(rows[0], Fixtures.START, rows[0].checkpoints[0].date);
    for (const scenario of rows.slice(1)) assert.deepEqual(numericWork(scenario, Fixtures.START, scenario.checkpoints[0].date), baseline, scenario.id);
  }
});

test("counterfactual changes preserve the numeric performance while intent, illness, sleep and conditions differ", () => {
  for (const family of Fixtures.FAMILIES) for (const [left, right] of [
    ["planned-deload", "unplanned-same-downshift"], ["illness-active", "illness-recovering"],
    ["poor-sleep", "good-sleep-counterfactual"], ["sharp-improvement", "context-change"]
  ]) {
    const a = byId(`${family}-${left}`), b = byId(`${family}-${right}`);
    assert.deepEqual(numericWork(a), numericWork(b), `${family}: ${left} vs ${right}`);
    assert.notDeepEqual(a.checkpoints.at(-1).focusTags, b.checkpoints.at(-1).focusTags);
  }
});

test("rapid performance counterfactuals actually improve measured work and running speed agrees with distance/time", () => {
  for (const family of ["running", "cycling", "swimming", "team", "mixed", "walking"]) {
    const scenario = byId(`${family}-sharp-improvement`), first = scenario.state.days[Fixtures.START].sessions[0], second = scenario.state.days["2026-09-14"].sessions[0];
    if (["running", "walking"].includes(family)) {
      assert.ok(second.details.distanceM > first.details.distanceM);
      assert.equal(second.cardio.speedKmh, second.details.distanceM / 1000 / (second.details.movingMin / 60));
    }
    if (family === "cycling") assert.ok(second.details.avgPowerW > first.details.avgPowerW);
    if (family === "swimming") { assert.equal(second.details.distanceM, first.details.distanceM); assert.ok(second.details.movingMin < first.details.movingMin); }
    if (family === "team") assert.ok(second.details.segments[0].reps > first.details.segments[0].reps);
    if (family === "mixed") {
      const current = second.details.segments.find(segment => segment.kind === "run"), before = first.details.segments.find(segment => segment.kind === "run");
      assert.equal(current.distanceM, before.distanceM); assert.ok(current.durationMin < before.durationMin);
    }
  }
});

test("a sport transition changes actual recorded sport, not only the current profile", () => {
  for (const family of Fixtures.FAMILIES) {
    const scenario = byId(`${family}-multisport-transition`), target = family === "mixed" ? "running" : "mixed";
    assert.equal(scenario.state.profile.sport, target);
    for (const day of Object.values(scenario.state.days).filter(day => day.date >= "2026-09-28")) for (const session of day.sessions) {
      assert.equal(session.sport, target);
      if (target === "mixed") { assert.equal(session.cardio, undefined); assert.ok(session.details.segments.length > 0); }
      if (target === "running") { assert.ok(session.details.distanceM > 0); assert.equal(session.details.segments, undefined); }
      assert.equal(session.details.avgPowerW, undefined);
      assert.equal(session.details.stroke, undefined);
    }
  }
});

test("ordinary plateau and technique priority use equal actual work but distinct recorded purposes", () => {
  for (const family of Fixtures.FAMILIES) {
    const ordinary = byId(`${family}-plateau-regular`), technique = byId(`${family}-plateau-technique`);
    assert.deepEqual(numericWork(ordinary), numericWork(technique));
    const normalSession = ordinary.state.days["2026-10-02"].sessions[0], technicalSession = technique.state.days["2026-10-02"].sessions[0];
    assert.equal(normalSession.details.intent, "regular"); assert.equal(technicalSession.details.intent, "technique");
    assert.ok(ordinary.state.training.records.every(row => row.trainingIntent !== "technique"));
  }
});

test("as-of evaluation strips future actuals but preserves genuinely planned future dates", () => {
  const scenario = byId("strength-planned-deload"), date = scenario.checkpoints[1].date, state = Fixtures.asOf(scenario, date, { richActivity: true });
  assert.ok(Object.keys(state.days).every(key => key <= date));
  assert.ok(state.training.records.every(row => row.date <= date));
  assert.ok(state.training.planning.schedule.filter(row => row.date > date).every(row => row.status === "planned" && row.recordId === null));
  const prior = structuredClone(scenario);
  Fixtures.asOf(scenario, scenario.checkpoints[0].date, { richActivity: true });
  assert.deepEqual(scenario, prior);
});

test("historical completed targets remain attached to their profile rather than the new goal", () => {
  const scenario = byId("cross-goal-history"), before = Fixtures.asOf(scenario, scenario.checkpoints[1].date, { richActivity: true }), after = Fixtures.asOf(scenario, scenario.end, { richActivity: true });
  assert.equal(before.profile.goal, "lose"); assert.equal(after.profile.goal, "maintain");
  for (const [date, day] of Object.entries(before.days)) if (day.complete) {
    assert.equal(day.planSnapshot.context.goal, "lose");
    assert.deepEqual(after.days[date].planSnapshot, day.planSnapshot);
  }
  assert.ok(Object.values(after.days).some(day => day.complete && day.planSnapshot.context.goal === "maintain"));
});

test("unknown food, profile, body measures, RIR and recorded gaps stay unknown", () => {
  const foodOnly = byId("cross-food-only"); assert.equal(foodOnly.state.training.records.length, 0);
  assert.ok(Object.values(foodOnly.state.days).every(day => day.sessions.length === 0));
  const trainingOnly = byId("cross-training-only"); assert.ok(Object.values(trainingOnly.state.days).every(day => !day.complete && !day.meals.length));
  const noProfile = byId("cross-no-profile"); assert.equal(noProfile.state.profile, null);
  assert.ok(Object.values(noProfile.state.days).every(day => day.planSnapshot === null && !day.complete));
  const noMeasures = byId("cross-no-measurements"); assert.ok(Object.values(noMeasures.state.days).every(day => day.weightKg === null && day.bodyFatPct === null));
  const travel = byId("running-travel-gap"), omitted = "2026-09-18";
  assert.equal(travel.state.days[omitted].sessions.length, 0);
  assert.ok(travel.events.find(event => event.date === omitted).tags.includes("unrecorded-gap"));
  assert.ok(all.flatMap(scenario => scenario.state.training.records).flatMap(row => row.exercises).flatMap(exercise => exercise.sets).every(set => set.rir === null));
});

test("paired body methods, transient weight change and old profile measurements are explicitly distinct", () => {
  const old = byId("cross-old-paired-bia"); assert.equal(old.state.profile.bodyFatWeightKg, 80); assert.equal(old.state.profile.weightKg, 78);
  assert.equal(old.state.profile.bodyFatDate, "2026-01-01");
  const conflict = Object.values(byId("cross-method-conflict").state.days).filter(day => day.bodyFatPct !== null);
  assert.deepEqual(conflict.map(day => day.bodyFatMethod), ["bia", "dxa"]);
  const stable = Object.values(byId("cross-stable-paired-bia").state.days).filter(day => day.bodyFatPct !== null);
  assert.ok(stable.length >= 3 && stable.every(day => day.weightKg !== null && day.bodyFatMethod === "bia"));
  const water = byId("cross-water-change").state.days;
  assert.equal(water["2026-09-16"].weightKg, 78); assert.equal(water["2026-09-17"].weightKg, 80.8); assert.equal(water["2026-09-18"].weightKg, 78.1);
});

test("hybrid segments are inside the session duration and RPE never becomes set RIR", () => {
  for (const scenario of core.filter(row => row.family === "mixed")) for (const day of Object.values(scenario.state.days)) for (const session of day.sessions.filter(session => session.sport === "mixed")) {
    assert.ok(session.details.segments.reduce((sum, row) => sum + row.durationMin, 0) <= session.durationMin);
    assert.ok(session.details.effortRpe >= 1);
  }
  const bodyweight = all.filter(scenario => scenario.catalogExerciseId && T.catalog.find(item => item.id === scenario.catalogExerciseId).equipment === "bodyweight");
  assert.ok(bodyweight.flatMap(scenario => scenario.state.training.records).flatMap(row => row.exercises).flatMap(exercise => exercise.sets).every(set => set.loadKg === null));
});

test("fixture schema rejects wrong units, unsupported metric placement, duplicate segments and excess time", () => {
  const scenario = byId("mixed-gradual"), source = scenario.state;
  const corrupt = patch => { const state = structuredClone(source); patch(state.days[Fixtures.START].sessions[0]); return state; };
  assert.throws(() => S.validateState(corrupt(session => { session.details.distanceM = "5km"; })), /수치|숫자/);
  assert.throws(() => S.validateState(corrupt(session => { session.details.avgPowerW = 200; })), /종목/);
  assert.throws(() => S.validateState(corrupt(session => { session.details.segments[1].id = session.details.segments[0].id; })), /중복/);
  assert.throws(() => S.validateState(corrupt(session => { session.details.movingMin = session.durationMin + 1; })), /수치|숫자/);
  assert.throws(() => S.validateState(corrupt(session => { session.details.segments[0].durationMin = session.durationMin; })), /시간/);
});

test("sentence audits preserve hypotheses/actions and source candidates without claiming semantic verification", () => {
  const action = { kind: "repeat", focusSetIds: ["sample-set"] }, source = { date: "2026-09-10", sessionId: "sample-session", blockId: "sample-block", setIds: ["sample-set"] };
  const facts = [{ id: "actual-load", value: 42, unit: "kg", source: "saved", date: source.date, estimated: false }];
  const rows = Audit.sentenceAudit("42kg을 유지해요. 근거 없는 99kg은 확인해요.", facts, [source], action, ["plateau"], "product-choice");
  assert.equal(rows.length, 2); assert.equal(rows[0].requiresHumanReview, true); assert.equal(rows[0].basis, "product-choice");
  assert.equal(rows[0].quantitySourceCandidates[0].candidates[0].estimated, false);
  assert.deepEqual(rows[0].action.focusSetIds, ["sample-set"]);
  assert.deepEqual(rows[1].quantitySourceCandidates[0].candidates, []);
  assert.deepEqual(rows[0].linkedSources[0].setIds, ["sample-set"]);
});

test("meaning oracles retain genuine unsafe/missing/future failures rather than turning every frame green", () => {
  const scenario = byId("running-pain-stop"), checkpoint = scenario.checkpoints.at(-1), state = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true });
  const output = { sections: [{ text: "과훈련입니다." }], coach: { context: {} }, analysis: { sessions: [] }, review: null, activity: { current: [] } };
  const flags = Audit.checkMeaning(state, checkpoint, output, { trainingProposals: [{ scope: "current-option" }], facts: [{ id: "actual-observation", date: "2026-10-05", estimated: false }] });
  for (const id of ["clinical-or-growth-certainty", "progression-with-stop-pain", "no-sport-coaching", "future-observation-leak"]) assert.ok(flags.some(flag => flag.id === id && flag.severity === "error"), id);
});

test("a missing selected-day activity uses the actual last date and current condition, never fabricating today's workout", () => {
  const scenario = byId("running-travel-gap"), checkpoint = scenario.checkpoints[1], { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true });
  assert.deepEqual(output.activity.current, []);
  assert.ok(output.activity.latest.length > 0);
  assert.equal(output.activity.latest[0].date, "2026-09-14");
  assert.ok(output.sections.some(section => section.surface === "activity-review" && section.temporalScope === "last-recorded-activity" && section.actualDate === "2026-09-14"));
  assert.ok(!output.findings.some(finding => ["no-sport-coaching", "past-activity-as-current", "invented-latest-activity"].includes(finding.id)));
  const modified = structuredClone(output);
  modified.activity.current = [{ ...modified.activity.latest[0], date: "2026-09-14" }];
  modified.activity.latest = [{ ...modified.activity.latest[0], date: checkpoint.date }];
  const flags = Audit.checkMeaning(Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), checkpoint, modified, { facts: [] });
  assert.ok(flags.some(flag => flag.id === "past-activity-as-current"));
  assert.ok(flags.some(flag => flag.id === "invented-latest-activity"));
});

test("the month keeps an earlier ordinary workload when a lower workload repeats, without filling missing food", () => {
  for (const family of Fixtures.FAMILIES.filter(family => !["strength", "mixed"].includes(family))) {
    const scenario = byId(`${family}-unplanned-same-downshift`), { output } = Audit.evaluateFrame(scenario, scenario.checkpoints[2], { richActivity: true });
    const row = output.activity.current[0], baseline = scenario.state.days[Fixtures.START].sessions[0];
    assert.ok(row.sources.some(source => source.date <= scenario.checkpoints[0].date), `${family}: earlier ordinary source was lost`);
    assert.ok(row.assessment.includes(`${baseline.durationMin}분`), `${family}: repeated lower work erased ordinary duration`);
    assert.match(row.action.body, /다음|시작|상태/);
    assert.ok(!/식사.{0,10}부족.{0,10}(때문|원인)/.test(row.assessment + row.action.body));
  }
});

test("team task repetitions and recent actual sport transitions remain visible after three sessions", () => {
  const scenario = byId("team-sharp-improvement"), { output } = Audit.evaluateFrame(scenario, scenario.checkpoints[1], { richActivity: true });
  const row = output.activity.current[0], text = row.assessment + row.action.body;
  assert.ok(text.includes("패스") && text.includes("30") && text.includes("40"), "reported practice task was discarded into a duration-only answer");
  assert.ok(!/성공률.{0,10}(향상|좋아|상승|늘었)/.test(text));
  for (const family of Fixtures.FAMILIES) {
    const transition = byId(`${family}-multisport-transition`), { output: after } = Audit.evaluateFrame(transition, transition.checkpoints.at(-1), { richActivity: true });
    const last = [...after.activity.current, ...after.activity.latest][0];
    assert.equal(last.action.kind, "sport-transition", `${family}: three repeated sessions erased recent sport transition`);
    assert.match(last.action.body, /기존 종목|겹치는|새 종목/);
  }
});

test("a planned/light episode never presents its third actual day as its first", () => {
  for (const family of Fixtures.FAMILIES) for (const suffix of ["planned-deload", "time-limited"]) {
    const scenario = byId(`${family}-${suffix}`), { output } = Audit.evaluateFrame(scenario, scenario.checkpoints[2], { richActivity: true });
    const row = output.activity.current[0];
    for (const episode of row.comparison.observations.filter(observation => observation.kind === "working-episode")) {
      assert.equal(episode.currentDays, 3, `${family}/${suffix}: ordinary baseline exclusion changed actual repeat count`);
      assert.equal(episode.currentSince, "2026-09-21");
    }
    assert.ok(!/2026-09-25부터 1일/.test(row.assessment));
  }
});

test("the runner keeps bounded AI execution explicit and selected scenarios cannot erase the requirement catalog", () => {
  assert.equal(Audit.cliOptions(["--live"]).maxLive, 8);
  assert.equal(Audit.cliOptions([]).checkpoint, "all");
  assert.equal(Audit.cliOptions(["--live"]).checkpoint, "final");
  assert.equal(Audit.cliOptions(["--neutral-question"]).neutralQuestion, true);
  assert.throws(() => Audit.cliOptions(["--max-live=-1"]));
  assert.throws(() => Audit.cliOptions(["--suite=unknown"]));
  const report = { generatedAt: "synthetic", scenarioCatalog: all, requirements: Fixtures.REQUIREMENT_CATALOG, results: [], counterfactuals: [], summary: { errors: 0, reviewItems: 0, liveCompleted: 0 } };
  const text = Audit.markdown(report);
  assert.match(text, /아직|검토|타당성/);
  assert.ok(text.includes("illness-active") && text.includes("multisport-transition") && text.includes("time-limited"));
});

test("a neutral consultation preserves original scenario intent and observations without handing the answer to the question", () => {
  const scenario = byId("running-sharp-improvement"), checkpoint = scenario.checkpoints[1], original = structuredClone(checkpoint);
  const specific = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true }).output;
  const neutral = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true }).output;
  assert.equal(neutral.checkpoint.question, "최근 기록을 보고 다음 운동과 식사에서 무엇을 유지하고 무엇을 바꾸면 좋을까?");
  assert.equal(neutral.checkpoint.originalQuestion, specific.checkpoint.question);
  assert.equal(neutral.checkpoint.questionMode, "neutral");
  assert.equal(specific.checkpoint.questionMode, "scenario-specific");
  assert.deepEqual(neutral.checkpoint.requiredMeaning, specific.checkpoint.requiredMeaning);
  assert.equal(neutral.inputDigest, specific.inputDigest);
  assert.deepEqual(neutral.activity, specific.activity);
  assert.deepEqual(checkpoint, original);
});

test("monthly audits retain every actual native question answer instead of checking only the leading cards", () => {
  const scenario = Fixtures.buildScenarios({ suite: "core", richActivity: true }).find(row => row.id === "cross-both-partial");
  const { output } = Audit.evaluateFrame(scenario, scenario.checkpoints.at(-1), { richActivity: true });
  const sections = output.sections.filter(section => section.surface === "app-coach-faq");
  assert.ok(sections.length > 0);
  assert.deepEqual(sections.map(section => [section.questionId, section.text]), output.coach.questions.map(row => [row.id, row.answer]));
  assert.ok(sections.every(section => section.sentences.length > 0));
});

test("the final checkpoint includes all 28 days without moving the last workout or inventing current conditions", () => {
  const scenario = byId("running-gradual"), final = scenario.checkpoints.at(-1), { output } = Audit.evaluateFrame(scenario, final, { richActivity: true });
  assert.equal(final.date, Fixtures.END); assert.equal(output.coverage.through, Fixtures.END);
  assert.equal(Object.values(scenario.state.days).filter(day => day.complete).length, 28);
  assert.equal(scenario.state.days[Fixtures.END].sessions.length, 0);
  assert.deepEqual(output.activity.current, []); assert.equal(output.activity.latest[0].date, "2026-10-02");
  assert.equal(output.activity.latest[0].id, "running-gradual:activity:25");
  const unknown = byId("running-travel-gap");
  assert.equal(unknown.state.days[Fixtures.END].coachCheckin, undefined);
  assert.equal(unknown.checkpointReports.at(-1).kind, "condition-unknown");
  const active = byId("running-illness-active"), pain = byId("running-pain-stop");
  assert.equal(active.state.days[Fixtures.END].coachCheckin.illness, "active");
  assert.equal(active.state.days[Fixtures.END].coachCheckin.pain, null);
  assert.equal(active.checkpointReports.at(-1).kind, "explicit-current-self-report");
  assert.equal(pain.state.days[Fixtures.END].coachCheckin.pain, "stop");
});

test("a broad monthly consultation keeps every current movement's reduction episode and next action under the real packet budget", () => {
  const scenario = byId("strength-unexpected-decline"), checkpoint = scenario.checkpoints[2];
  const { output, context } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
  assert.equal(output.contextStatus, "ready");
  const rows = context.trainingCoaching.exerciseContexts;
  assert.deepEqual(new Set(rows.map(row => row.blockId)), new Set(context.trainingCoaching.coverage.coveredBlockIds), "coverage names cannot replace actual interpretation of omitted movements");
  const expected = { bench_press: [55, 16, 80, 24], squat: [70, 12, 105, 18], barbell_row: [45, 20, 65, 30] };
  for (const row of rows) {
    const [currentLoad, currentReps, ordinaryLoad, ordinaryReps] = expected[row.exerciseId];
    assert.equal(row.actual.current.setCount, 2);
    assert.equal(row.actual.current.maxLoadKg, currentLoad);
    assert.equal(row.actual.current.totalReps, currentReps);
    assert.equal(row.actual.recentChange.baseline.setCount, 3);
    assert.equal(row.actual.recentChange.baseline.maxLoadKg, ordinaryLoad);
    assert.equal(row.actual.recentChange.baseline.totalReps, ordinaryReps);
    assert.equal(row.hypotheses.recentChange.kind, "reduced");
    assert.ok(row.advice.primaryAction.body.length > 0);
    assert.equal(row.date, checkpoint.date);
  }
  assert.ok(!output.findings.some(finding => finding.id === "training-interpretation-coverage-reduced"));
  const incomplete = structuredClone(context);
  incomplete.trainingCoaching.exerciseContexts = rows.slice(0, 1);
  const flags = Audit.checkMeaning(Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), checkpoint, output, incomplete);
  assert.ok(flags.some(finding => finding.id === "training-interpretation-coverage-reduced" && finding.severity === "error"));
});

test("a faster average over shorter swimming work is not the same counterfactual as faster completion of the same distance", () => {
  const lower = byId("swimming-good-sleep-counterfactual"), checkpoint = lower.checkpoints[1];
  const { output } = Audit.evaluateFrame(lower, checkpoint, { richActivity: true, neutralQuestion: true });
  const row = output.activity.current[0], baseline = row.comparison.observations.find(value => value.kind === "working-episode").baseline;
  assert.equal(row.actual.distanceM, 667); assert.equal(baseline.distanceM, 1000);
  assert.equal(row.actual.movingMin, 15); assert.equal(baseline.movingMin, 25);
  assert.ok(row.actual.paceMinPer100M < baseline.paceMinPer100M);
  assert.notEqual(row.action.kind, "sustain-new-performance", "shorter work cannot silently become an overall improvement because its pace is faster");
  assert.match(row.assessment + row.action.body, /짧|줄|낮/);
  assert.match(row.assessment + row.action.body, /평균 페이스/);
  assert.doesNotMatch(row.assessment + row.action.body, /파워/);
  assert.ok(!output.findings.some(finding => finding.id === "shorter-work-promoted-to-performance"));
  const sameDistance = byId("swimming-sharp-improvement"), { output: improved } = Audit.evaluateFrame(sameDistance, sameDistance.checkpoints[1], { richActivity: true, neutralQuestion: true });
  const better = improved.activity.current[0], ordinary = better.comparison.observations.find(value => value.kind === "working-episode").baseline;
  assert.equal(better.actual.distanceM, ordinary.distanceM);
  assert.equal(better.actual.movingMin, 20); assert.equal(ordinary.movingMin, 25);
  assert.equal(better.action.kind, "sustain-new-performance");
  assert.ok(!improved.findings.some(finding => finding.id === "shorter-work-promoted-to-performance"));
});

test("higher speed or cycling power over shorter work preserves both axes instead of promoting the whole session", () => {
  for (const family of ["running", "cycling"]) {
    const scenario = structuredClone(byId(`${family}-good-sleep-counterfactual`));
    for (const entry of scenario.richActivityDetails.filter(entry => entry.date >= "2026-09-14" && entry.date <= "2026-09-18")) {
      if (family === "cycling") entry.details.avgPowerW = 200;
      else {
        entry.details.distanceM = 4000;
        scenario.state.days[entry.date].sessions.find(row => row.id === entry.sessionId).cardio.speedKmh = 12;
      }
    }
    const { output } = Audit.evaluateFrame(scenario, scenario.checkpoints[1], { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0], baseline = row.comparison.observations.find(value => value.kind === "working-episode").baseline;
    assert.ok(row.actual.durationMin < baseline.durationMin);
    assert.ok(row.actual.distanceM < baseline.distanceM);
    if (family === "cycling") {
      assert.equal(row.actual.avgPowerW, 200); assert.equal(baseline.avgPowerW, 155);
      assert.match(row.action.body, /29분/); assert.match(row.action.body, /45분/);
      assert.match(row.assessment + row.action.body, /평균 파워/);
      assert.doesNotMatch(row.assessment + row.action.body, /평균 페이스/);
    } else {
      assert.equal(row.actual.distanceM, 4000); assert.ok(row.actual.paceMinPerKm < baseline.paceMinPerKm);
      assert.match(row.assessment + row.action.body, /평균 페이스/);
      assert.doesNotMatch(row.assessment + row.action.body, /파워/);
    }
    assert.notEqual(row.action.kind, "sustain-new-performance", family);
    assert.match(row.assessment + row.action.body, /짧|줄|낮/);
    assert.ok(!output.findings.some(finding => finding.id === "shorter-work-promoted-to-performance"));
    const sameTask = byId(`${family}-sharp-improvement`), { output: improved } = Audit.evaluateFrame(sameTask, sameTask.checkpoints[1], { richActivity: true, neutralQuestion: true });
    assert.equal(improved.activity.current[0].action.kind, "sustain-new-performance");
  }
});

test("a better hybrid segment cannot erase the next choice for a continuing whole-session reduction", () => {
  const scenario = byId("mixed-unexpected-decline"), checkpoint = scenario.checkpoints[2];
  const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
  const row = output.activity.current[0], episode = row.comparison.observations.find(value => value.kind === "working-episode");
  assert.equal(row.actual.durationMin, 30); assert.equal(row.comparison.previous.actual.durationMin, 30);
  assert.equal(episode.baseline.durationMin, 39);
  assert.match(row.assessment, /60분/); assert.match(row.assessment, /이전 11분, 이번 9분/);
  assert.match(row.action.body, /30분/); assert.match(row.action.body, /60분/);
  assert.match(row.action.body, /줄|짧/); assert.match(row.action.body, /편하게|반응|상태/);
  assert.match(row.action.body, /달리기 구간/); assert.match(row.action.body, /뒤 구간|다음 구간/);
  assert.ok(row.question || /의도|평소처럼/.test(row.action.body), "unknown purpose must leave a usable conditional choice, not require an answer before doing anything");
  assert.ok(!output.findings.some(finding => finding.id === "segment-task-erased-whole-reduction"));
  const weakened = structuredClone(output);
  weakened.activity.current[0].action = { kind: "hybrid-task", body: "달리기 구간의 바뀐 과제를 다음에 이어가요." };
  const flags = Audit.checkMeaning(Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), checkpoint, weakened, {});
  assert.ok(flags.some(finding => finding.id === "segment-task-erased-whole-reduction"));
});

test("shorter team work with more practice repetitions preserves the smaller whole task without certifying skill", () => {
  const scenario = structuredClone(byId("team-good-sleep-counterfactual")), checkpoint = scenario.checkpoints[2];
  for (const entry of scenario.richActivityDetails.filter(entry => entry.date >= "2026-09-21" && entry.date <= checkpoint.date)) {
    entry.details.segments.find(part => part.label === "기록한 패스 반복").reps = 40;
  }
  const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
  const row = output.activity.current[0];
  assert.equal(row.actual.durationMin, 30);
  assert.match(row.assessment, /60분/); assert.match(row.assessment, /이전 30회, 이번 40회/);
  assert.match(row.action.body, /30분/); assert.match(row.action.body, /60분/);
  assert.match(row.action.body, /줄|짧/); assert.match(row.action.body, /반복.*성공률.*별개/);
  assert.match(row.action.body, /동작.*흐트러지지/);
  assert.ok(!output.findings.some(finding => finding.id === "segment-task-erased-whole-reduction"));
  const planned = byId("mixed-planned-deload");
  const { output: lighter } = Audit.evaluateFrame(planned, planned.checkpoints[2], { richActivity: true, neutralQuestion: true });
  assert.equal(lighter.activity.current[0].action.kind, "deload");
  assert.match(lighter.activity.current[0].action.body, /디로드 목적|몰아 채우지/);
  assert.doesNotMatch(lighter.activity.current[0].action.body, /평소처럼.*줄어들/);
});

test("a carry-load change does not become a load change of a separately faster running segment", () => {
  const scenario = structuredClone(byId("mixed-context-change")), checkpoint = scenario.checkpoints[1];
  const entry = scenario.richActivityDetails.find(entry => entry.date === checkpoint.date);
  entry.details.segments.find(part => part.kind === "run").durationMin = 7;
  entry.details.segments.find(part => part.kind === "carry").loadKg = 30;
  const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
  const row = output.activity.current[0];
  assert.match(row.assessment, /파머 캐리 구간: 표시 부하는 20kg → 30kg/);
  assert.match(row.action.body, /달리기 구간의 같은 거리에서 달라진 시간/);
  assert.match(row.action.body, /다른 구간의 부하도 바뀌/);
  assert.doesNotMatch(row.action.body, /달리기 구간의 부하가 달라진/);
  assert.doesNotMatch(row.action.body, /피로 때문에|캐리.*때문에.*달리기/);
  const run = row.comparison.observations.find(value => value.kind === "hybrid-segment" && value.label === "달리기 구간");
  assert.equal(run.current.durationMin, 7); assert.equal(run.current.distanceM, 2000);
  assert.equal(run.current.loadKg, undefined);
});

test("a repeated hybrid segment improvement keeps its task without inventing a confirmed exercise sequence", () => {
  for (const currentConfirmed of [false, undefined]) {
    const scenario = structuredClone(byId("mixed-sharp-improvement")), checkpoint = scenario.checkpoints[1];
    for (const entry of scenario.richActivityDetails) {
      if (currentConfirmed === undefined) delete entry.details.sequenceConfirmed;
      else entry.details.sequenceConfirmed = currentConfirmed;
    }
    const before = structuredClone(scenario);
    const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0];
    assert.equal(row.actual.durationMin, 60);
    assert.equal(row.action.kind, "hybrid-task");
    assert.match(row.assessment, /이전 12분, 이번 9분/);
    assert.match(row.action.body, /기록한 구간별 과제와 부하를 유지/);
    assert.match(row.action.body, /실제 구간 순서를 확인/);
    assert.doesNotMatch(row.action.body, /이번 구간 순서·부하|확인한 이번 구간/);
    assert.ok(row.comparison.observations.filter(value => value.kind === "hybrid-segment").every(value => value.orderMatched === false));
    assert.deepEqual(scenario, before);
  }
  const confirmed = byId("mixed-sharp-improvement"), { output } = Audit.evaluateFrame(confirmed, confirmed.checkpoints[1], { richActivity: true, neutralQuestion: true });
  assert.match(output.activity.current[0].action.body, /확인한 이번 구간 구성·부하/);
  assert.doesNotMatch(output.activity.current[0].action.body, /실제 구간 순서를 확인/);
  const newlyConfirmed = structuredClone(confirmed), checkpoint = newlyConfirmed.checkpoints[1];
  for (const entry of newlyConfirmed.richActivityDetails) entry.details.sequenceConfirmed = entry.date === checkpoint.date;
  const { output: fresh } = Audit.evaluateFrame(newlyConfirmed, checkpoint, { richActivity: true, neutralQuestion: true });
  assert.equal(fresh.activity.current[0].comparison.contextMatched, false, "a newly confirmed sequence cannot certify the earlier unconfirmed episode");
  assert.match(fresh.activity.current[0].action.body, /확인한 순서대로/);
  assert.doesNotMatch(fresh.activity.current[0].assessment, /이전 12분, 이번 9분/);
});

test("a shorter repeated whole configuration remains in the next choice without declaring reduced physiological load", () => {
  for (const family of ["mixed", "walking", "team"]) {
    const scenario = structuredClone(byId(`${family}-unexpected-decline`)), checkpoint = scenario.checkpoints[1];
    Object.assign(scenario.state.days[checkpoint.date].coachCheckin, { energy: "okay", sleep: "good", performance: "steady", fatigue: "usual", sleepHours: 8, illness: "none", pain: "none" });
    scenario.richCheckins = scenario.richCheckins.filter(entry => entry.date !== checkpoint.date);
    const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0];
    assert.equal(row.actual.durationMin, family === "walking" ? 16 : 39);
    assert.equal(row.action.kind, "shortened-configuration");
    assert.match(row.action.body, family === "walking" ? /25분/ : /60분/);
    assert.match(row.action.body, /전체 시간이 짧아/);
    assert.match(row.action.body, /구성을 의도적으로 짧게.*유지/);
    assert.match(row.action.body, /평소 운동의 일부를 못.*하나부터 돌아/);
    assert.doesNotMatch(row.action.body, /부담이 낮|부담.*감소|근력.*퇴보|운동량.*부족/);
    assert.equal(row.question.kind, "session-configuration");
    if (family === "mixed") {
      assert.match(row.action.body, /달리기 구간/);
      assert.match(row.assessment, /이전 12분, 이번 11분/);
    }
    assert.ok(!output.findings.some(finding => finding.id === "segment-task-erased-whole-reduction"));
  }
});

test("same-distance faster completion and shorter high-power work are not held by a whole-duration-only change", () => {
  for (const family of ["running", "swimming", "cycling"]) {
    const scenario = structuredClone(byId(`${family}-sharp-improvement`)), checkpoint = scenario.checkpoints[1];
    const changed = scenario.richActivityDetails.filter(entry => entry.date >= "2026-09-14" && entry.date <= checkpoint.date);
    for (const entry of changed) {
      const session = scenario.state.days[entry.date].sessions.find(row => row.id === entry.sessionId);
      session.durationMin = family === "cycling" ? 30 : 20;
      entry.details.movingMin = session.durationMin;
      entry.details.distanceM = family === "running" ? 5000 : family === "swimming" ? 1000 : 14000;
      if (family === "running") session.cardio.speedKmh = 15;
    }
    const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0];
    assert.notEqual(row.action.kind, "shortened-configuration", family);
    assert.notEqual(row.action.kind, "reduced-work", family);
    if (family === "cycling") {
      assert.equal(row.action.kind, "shorter-faster-work");
      assert.match(row.action.body, /30분/); assert.match(row.action.body, /45분/);
      assert.match(row.action.body, /200W/); assert.match(row.action.body, /155W/);
      assert.match(row.action.body, /의도한 짧고 강한 훈련.*이어가/);
    } else {
      assert.equal(row.action.kind, "sustain-new-performance", family);
      assert.match(row.action.body, /좋아진 수행/);
      assert.match(row.action.body, /편해지면.*하나만/);
      assert.equal(row.actual.distanceM, family === "running" ? 5000 : 1000);
    }
    assert.doesNotMatch(row.action.body, /원래 시간.*돌아가.*먼저|낮춘 부담/);
  }
  for (const family of ["running", "swimming"]) {
    const scenario = structuredClone(byId(`${family}-sharp-improvement`)), checkpoint = scenario.checkpoints[1];
    for (const entry of scenario.richActivityDetails.filter(entry => entry.date >= "2026-09-14" && entry.date <= checkpoint.date)) {
      const session = scenario.state.days[entry.date].sessions.find(row => row.id === entry.sessionId);
      session.durationMin = 18;
      entry.details.movingMin = family === "running" ? 18 : 15;
      entry.details.distanceM = family === "running" ? 5000 : 1000;
      if (family === "running") session.cardio.speedKmh = 5000 / 1000 / (18 / 60);
    }
    const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0];
    assert.equal(row.action.kind, "sustain-new-performance", family);
    assert.match(row.action.body, /좋아진 수행/);
    assert.doesNotMatch(row.action.body, /줄인 양.*메우|익숙한 구성.*돌아가/);
    assert.equal(row.actual.distanceM, family === "running" ? 5000 : 1000);
  }
});

test("all supported sports preserve a repeated shorter ordinary configuration without overriding specialized or set-based work", () => {
  const families = ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"];
  function changed(family) {
    const scenario = structuredClone(byId(`${family}-unexpected-decline`)), checkpoint = scenario.checkpoints[1];
    for (const entry of scenario.richActivityDetails.filter(entry => entry.date <= checkpoint.date)) {
      const reduced = entry.date >= "2026-09-14", duration = reduced ? 39 : 60;
      const session = scenario.state.days[entry.date].sessions.find(row => row.id === entry.sessionId);
      session.durationMin = duration;
      entry.details.movingMin = duration;
      if (["running", "cycling", "swimming", "walking"].includes(family)) {
        const speed = family === "walking" ? 5 : family === "running" ? 10 : family === "cycling" ? 20 : 1;
        entry.details.distanceM = duration / 60 * speed * 1000;
        if (session.cardio) session.cardio.speedKmh = speed;
      }
    }
    Object.assign(scenario.state.days[checkpoint.date].coachCheckin, { energy: "okay", sleep: "good", performance: "steady", fatigue: "usual", sleepHours: 8, illness: "none", pain: "none" });
    scenario.richCheckins = scenario.richCheckins.filter(entry => entry.date !== checkpoint.date);
    return { scenario, checkpoint };
  }
  for (const family of families) {
    const { scenario, checkpoint } = changed(family), before = structuredClone(scenario);
    const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
    const row = output.activity.current[0];
    assert.equal(row.actual.durationMin, 39, family);
    if (family === "strength") {
      assert.equal(row.action.kind, "time-record");
      assert.match(row.action.body, /같은 날짜의 세트 일지.*실제 수행/);
      assert.ok(output.review.rows.every(exercise => exercise.interpretation.coaching?.facts.current.sets.length > 0));
      const timeOnly = structuredClone(scenario); timeOnly.state.training.records = []; timeOnly.state.training.planning.schedule = [];
      const { output: only } = Audit.evaluateFrame(timeOnly, checkpoint, { richActivity: true, neutralQuestion: true });
      assert.equal(only.activity.current[0].action.kind, "shortened-configuration");
      assert.match(only.activity.current[0].action.body, /동작·시간/);
      assert.match(only.activity.current[0].action.body, /중량이나 세트 수/);
      assert.doesNotMatch(only.activity.current[0].action.body, /시간·거리|속도나 강도/);
      assert.equal(only.review, null);
    } else {
      assert.equal(row.action.kind, "shortened-configuration", family);
      assert.match(row.action.body, /39분/); assert.match(row.action.body, /60분/);
      assert.match(row.action.body, /구성을 의도적으로 짧게/);
      assert.match(row.action.body, /일부를 못.*하나부터 돌아/);
      assert.doesNotMatch(row.action.body, /근력.*퇴보|부담이 낮|능력.*저하/);
    }
    assert.deepEqual(scenario, before);
    for (const context of ["race", "technique", "pain", "illness", "deload"]) {
      const counterfactual = structuredClone(scenario), entry = counterfactual.richActivityDetails.find(entry => entry.date === checkpoint.date);
      if (context === "race") entry.details.format = family === "team" ? "match" : "race";
      if (context === "technique") entry.details.format = "technique";
      if (context === "pain") counterfactual.state.days[checkpoint.date].coachCheckin.pain = "stop";
      if (context === "illness") counterfactual.state.days[checkpoint.date].coachCheckin.illness = "active";
      if (context === "deload") entry.details.intent = "deload";
      const { output: alternative } = Audit.evaluateFrame(counterfactual, checkpoint, { richActivity: true, neutralQuestion: true });
      const expected = { race: "post-event", technique: "technique", pain: "stop", illness: "stop", deload: "deload" }[context];
      assert.equal(alternative.activity.current[0].action.kind, expected, `${family}/${context}`);
      assert.equal(alternative.activity.current[0].alternatives.length, 0, `${family}/${context}`);
    }
  }
});

test("a same-distance faster walk is a completed current task rather than a forced compression or missing-work question", () => {
  const scenario = structuredClone(byId("walking-gradual")), checkpoint = scenario.checkpoints[1];
  for (const entry of scenario.richActivityDetails.filter(entry => entry.date <= checkpoint.date)) {
    const duration = entry.date >= "2026-09-14" ? 20 : 25;
    const session = scenario.state.days[entry.date].sessions.find(row => row.id === entry.sessionId);
    session.durationMin = duration; session.intensity = "moderate";
    session.cardio.speedKmh = 2 / (duration / 60);
    Object.assign(entry.details, { distanceM: 2000, movingMin: duration, effortRpe: 6, avgHeartRateBpm: 145 });
  }
  const { output } = Audit.evaluateFrame(scenario, checkpoint, { richActivity: true, neutralQuestion: true });
  const row = output.activity.current[0];
  assert.equal(row.actual.distanceM, 2000); assert.equal(row.actual.durationMin, 20);
  assert.equal(row.action.kind, "repeat");
  assert.match(row.action.body, /20분.*2km/);
  assert.equal(row.question, null);
  assert.doesNotMatch(row.action.body, /일부를 못|구성을 압축|원래.*돌아/);
});

test("whole-activity summaries put current health and dated unresolved health above every sport or planned purpose", () => {
  for (const family of ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"]) {
    const scenario = byId(`${family}-gradual`), date = scenario.checkpoints[1].date;
    const base = Fixtures.asOf(scenario, date, { richActivity: true });
    for (const day of Object.values(base.days)) day.coachCheckin = { illness: "none", pain: "none", fatigue: "usual", energy: "okay", hunger: "okay", performance: "steady", sleep: "good", trainingPlan: "planned" };
    for (const intent of ["return", "deload", "regular"]) for (const condition of ["illness", "pain", "recovering", "mild-pain", "fatigue", "clinical", "unknown-health"]) {
      const state = structuredClone(base), day = state.days[date];
      day.sessions[0].details.intent = intent;
      if (condition === "illness") day.coachCheckin.illness = "active";
      if (condition === "pain") day.coachCheckin.pain = "stop";
      if (condition === "recovering") day.coachCheckin.illness = "recovering";
      if (condition === "mild-pain") day.coachCheckin.pain = "mild";
      if (condition === "fatigue") day.coachCheckin.fatigue = "high";
      if (condition === "clinical") state.profile.healthContext = "clinical";
      if (condition === "unknown-health") {
        for (const [, entry] of Object.entries(state.days).filter(([when]) => when >= "2026-09-16")) { delete entry.coachCheckin.illness; delete entry.coachCheckin.pain; }
        Object.assign(state.days["2026-09-16"].coachCheckin, { illness: "recovering", pain: "stop" });
      }
      const before = structuredClone(state), result = Activity.build(state, date);
      const kinds = { illness: "stop", pain: "stop", recovering: "illness-return", "mild-pain": "pain-review", fatigue: "current-recovery", clinical: "individual-care", "unknown-health": "health-follow-up" };
      assert.equal(result.priority.kind, kinds[condition], `${family}/${intent}/${condition}`);
      assert.ok(result.current.every(row => row.action.kind === result.priority.kind));
      assert.match(result.summary, new RegExp(date));
      assert.ok(result.current.every(row => result.summary.includes(`${row.actual.durationMin}분`)));
      assert.doesNotMatch(result.summary, /실제로 남긴 활동에서 다음 운동을 이어가|복귀 운동의 목적에 맞춰/);
      if (["illness", "pain"].includes(condition)) assert.match(result.summary, /중단.*현재 증상/);
      if (condition === "recovering") assert.match(result.summary, /회복 중.*바로 늘리지/);
      if (condition === "mild-pain") assert.match(result.summary, /통증.*빼거나 쉬고/);
      if (condition === "clinical") assert.match(result.summary, /개인 지침.*범위/);
      if (condition === "unknown-health") {
        assert.match(result.summary, /마지막 불편 기록과 지금 상태.*증상이 남아 있다면.*가라앉았다면/);
        assert.ok(result.current.every(row => row.sources.some(source => source.kind === "health-checkin" && source.date === "2026-09-16")));
        assert.doesNotMatch(result.summary, /현재 질병|현재 통증|지금 아픈/);
        const withoutCurrent = structuredClone(state); withoutCurrent.days[date].sessions = [];
        const latest = Activity.build(withoutCurrent, date);
        assert.equal(latest.current.length, 0); assert.equal(latest.latest[0].date, "2026-09-16");
        assert.match(latest.summary, /마지막 활동 2026-09-16/);
        assert.equal(latest.priority.kind, "health-follow-up");
      }
      assert.deepEqual(state, before);
    }
  }
});

test("illness recovery distinguishes a completed current return from an earlier pre-illness workout in every sport", () => {
  for (const family of ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"]) {
    const scenario = byId(`${family}-illness-recovering`);
    for (const week of [2, 3, 4]) {
      const checkpoint = scenario.checkpoints[week - 1], state = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), before = structuredClone(state);
      const result = Activity.build(state, checkpoint.date), row = [...result.current, ...result.latest][0];
      assert.equal(result.priority.kind, "illness-return", `${family}/${week}`);
      assert.ok(row.sources.some(source => source.kind === "health-checkin" && source.date === checkpoint.date && source.field === "illness"));
      assert.ok(row.sources.some(source => source.kind === "activity-session" && source.date === row.date));
      assert.match(row.action.body, new RegExp(checkpoint.date));
      if (week === 3) {
        assert.equal(row.date, checkpoint.date); assert.equal(result.current.length, 1);
        assert.match(row.action.body, /같은 날 실제 수행/);
        assert.match(row.action.body, /이번 구성에서 바로 늘리기보다.*다음날 반응/);
      } else {
        assert.equal(result.current.length, 0); assert.ok(row.date < checkpoint.date);
        assert.match(row.action.body, new RegExp(`마지막 실제 활동은 ${row.date}`));
        assert.match(row.action.body, /현재 회복 상태에 맞춰 쉬운 익숙한 구성부터/);
        assert.doesNotMatch(row.action.body, /이번 기록.*에서 바로|이번 구성에서 바로/);
        assert.match(result.summary, new RegExp(`마지막 활동 ${row.date}`));
      }
      assert.deepEqual(state, before);
      const future = structuredClone(state), futureDate = "2026-10-05";
      future.days[futureDate] = { date: futureDate, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0,
        meals: [], sessions: [], complete: false, planSnapshot: null, coachCheckin: { energy: null, hunger: null, sleep: null, illness: "active", pain: "stop" } };
      S.validateState(future);
      assert.deepEqual(Activity.build(future, checkpoint.date), result, "later health information cannot change an earlier recovery recommendation");
    }
  }
});

test("activity health uses the latest explicit diary pain without replacing stored checkins or missing values", () => {
  const record = structuredClone(byId("strength-gradual").state.training.records[0]);
  for (const family of ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"]) {
    const scenario = byId(`${family}-gradual`), date = scenario.checkpoints[1].date;
    const base = Fixtures.asOf(scenario, date, { richActivity: true });
    for (const day of Object.values(base.days)) { day.coachCheckin = { ...(day.coachCheckin || {}) }; delete day.coachCheckin.pain; delete day.coachCheckin.illness; }
    base.training.records = [];
    base.days["2026-09-16"].coachCheckin.pain = "mild";
    base.days[date].sessions[0].details.intent = "deload";
    const add = (input, when, pain, id = `synthetic-health-${when}`) => input.training.records.push({ ...structuredClone(record), id, date: when, pain });
    for (const status of ["none", "mild", "stop", null]) {
      const input = structuredClone(base); add(input, date, status);
      const before = structuredClone(input), result = Activity.build(input, date), row = result.current[0];
      assert.deepEqual(input, before);
      assert.equal(input.days["2026-09-16"].coachCheckin.pain, "mild");
      assert.equal(input.days[date].coachCheckin.pain, undefined);
      const expected = { none: "deload", mild: "pain-review", stop: "stop", null: "health-follow-up" }[status];
      assert.equal(row.action.kind, expected, `${family}/${status}`);
      if (status !== null) assert.ok(row.sources.some(source => source.kind === "training-record-health" && source.date === date && source.field === "pain"));
      if (status === "none") assert.doesNotMatch(row.action.body + result.summary, /통증을 유발|증상이 남아|중단.*현재 증상/);
      if (status === "stop") { assert.deepEqual(row.alternatives, []); assert.match(result.summary, /중단.*현재 증상/); }
      if (status === null) assert.ok(row.sources.some(source => source.kind === "health-checkin" && source.date === "2026-09-16"));
      const future = structuredClone(input); add(future, "2026-10-05", "stop");
      assert.deepEqual(Activity.build(future, date), result);
    }
    const historical = structuredClone(base); add(historical, "2026-09-17", "none");
    assert.equal(Activity.build(historical, date).priority.kind, "deload", "a later explicit diary resolution also clears older checkin pain");
    const unresolved = structuredClone(base); add(unresolved, "2026-09-17", "stop");
    const unresolvedResult = Activity.build(unresolved, date);
    assert.equal(unresolvedResult.priority.kind, "health-follow-up");
    assert.ok(unresolvedResult.current[0].sources.some(source => source.kind === "training-record-health" && source.date === "2026-09-17"));
    assert.doesNotMatch(unresolvedResult.summary, /현재 질병|현재 통증|지금 아픈/);
    const conflicting = structuredClone(base); conflicting.days[date].coachCheckin.pain = "none"; add(conflicting, date, "stop");
    const conflictResult = Activity.build(conflicting, date), conflict = conflictResult.current[0];
    assert.equal(conflict.action.kind, "health-follow-up");
    assert.match(conflict.action.body, /통증 보고가 서로 달라/);
    assert.deepEqual(conflict.alternatives, []); assert.equal(conflict.question, null);
    assert.ok(conflict.sources.some(source => source.kind === "reported-pain" && source.date === date));
    assert.ok(conflict.sources.some(source => source.kind === "training-record-health" && source.date === date));
    const duplicateConflict = structuredClone(base); add(duplicateConflict, date, "stop", "same-health-id"); add(duplicateConflict, "2026-09-17", "none", "same-health-id");
    assert.equal(Activity.build(duplicateConflict, date).priority.kind, "health-follow-up", "conflicting duplicate IDs are quarantined rather than selected as a new stop or resolution");
  }
});

test("unknown age or unselected health context never becomes a clinical population by coercion", () => {
  const scenario = byId("cycling-gradual"), date = scenario.checkpoints[1].date;
  const base = Fixtures.asOf(scenario, date, { richActivity: true });
  const ordinary = Activity.build(base, date);
  for (const profile of [null, { ...base.profile, age: null }, { ...base.profile, age: undefined },
    { ...base.profile, age: null, healthContext: "" }, { ...base.profile, age: null, healthContext: undefined }]) {
    const input = structuredClone(base); input.profile = profile;
    const result = Activity.build(input, date);
    assert.equal(result.priority.kind, ordinary.priority.kind);
    assert.deepEqual(result.current[0].actual, ordinary.current[0].actual);
    assert.doesNotMatch(result.summary + result.priority.body, /성장기·고령|개인 지침을 먼저/);
  }
  for (const profile of [{ ...base.profile, age: 17 }, { ...base.profile, age: 81 },
    ...["pregnancy", "breastfeeding", "clinical", "eating_disorder"].map(healthContext => ({ ...base.profile, age: null, healthContext }))]) {
    const input = structuredClone(base); input.profile = profile;
    assert.equal(Activity.build(input, date).priority.kind, "individual-care");
  }
});

test("activity health indexing visits each diary and day once instead of rescanning history per activity", () => {
  const I = require("../src/insights.js"), original = I.reportedHealthHistory;
  const date = "2026-10-06", days = {}, records = [];
  const sports = ["strength", "running", "cycling", "swimming", "team", "mixed", "walking", "cycling"];
  for (let i = 0; i < 500; i++) {
    const when = new Date(Date.parse(date) - i * 86400000).toISOString().slice(0, 10);
    days[when] = { date: when, coachCheckin: { pain: "none", illness: "none" },
      sessions: sports.map((sport, j) => ({ id: `${when}:${j}`, sport, durationMin: 45, intensity: "moderate", details: { label: `Synthetic ${sport}` } })) };
    records.push({ id: `record:${when}`, date: when, pain: "none", exercises: [] });
  }
  const input = { profile: { age: 32, healthContext: "general" }, days, training: { records } }, before = structuredClone(input);
  let visits = 0, dayVisits = 0, calls = 0;
  I.reportedHealthHistory = (history, at, diaries = []) => {
    calls++; visits += diaries.length; dayVisits += Object.keys(history || {}).length;
    return original(history, at, diaries);
  };
  try {
    const result = Activity.build(input, date);
    assert.equal(result.current.length, 8); assert.equal(result.history.sessionCount, 4000);
    assert.equal(calls, 501); assert.equal(visits, 1000); assert.equal(dayVisits, 1000);
    assert.ok(result.current.every(row => row.sources.some(source => source.kind === "training-record-health" && source.date === date)));
    assert.deepEqual(input, before);
  } finally { I.reportedHealthHistory = original; }
});

test("large audit report output chunks scenarios without changing JSON and keeps every duplicated text reference", () => {
  const frame = { checkpoint: { date: "2026-09-11", week: 1 }, inputDigest: "synthetic", coverage: {}, findings: [], contextStatus: "ready",
    sections: [{ surface: "activity-review", label: "한글·인용", text: "기록한 값을 유지해요.", sentences: [{ linkedSources: [{ date: "2026-09-11", sessionId: "actual" }] }] }] };
  const report = { generatedAt: "synthetic", options: {}, sources: {}, summary: { errors: 0 }, sourceChangedDuringRun: false,
    results: [{ id: "first", family: "running", frames: [frame] }, { id: "second", family: "running", frames: [structuredClone(frame)] }], counterfactuals: [] };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "macro-monthly-report-")), filename = path.join(directory, "report.json");
  try {
    Audit.writeReportJson(filename, report);
    assert.deepEqual(JSON.parse(fs.readFileSync(filename, "utf8")), report);
    const reading = Audit.semanticReading(report, filename);
    assert.equal(reading.frames.length, 2); assert.equal(reading.distinctTexts.length, 1);
    assert.deepEqual(reading.distinctTexts[0].references.map(reference => reference.scenarioId), ["first", "second"]);
    assert.deepEqual(reading.distinctTexts[0].sources, [{ date: "2026-09-11", sessionId: "actual" }]);
    assert.equal(reading.frames[1].sections[0].text, frame.sections[0].text);
    assert.match(reading.note, /자동 의미 통과.*아님/);
  } finally { fs.unlinkSync(filename); fs.rmdirSync(directory); }
});
