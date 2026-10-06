"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/storage.js");
const TS = require("../src/training-store.js");
const T = require("../src/training.js");
const D = require("../src/coach-context.js");
const C = require("../src/coach.js");
const F = require("./fixtures/coaching-scenarios.cjs");

const scenarios = F.buildScenarios({ suite: "core", richActivity: true });
function coach(state, date) {
  const before = structuredClone(state);
  const analysis = T.analyze(state.training.records, { date, profile: state.profile, mappings: state.training.mappings, checkins: state.days });
  const result = C.buildCoach(state.profile, state.days[date], Object.values(state.days),
    { state, training: state.training, trainingAnalysis: analysis, decisionContext: D.build(state, date) });
  assert.deepEqual(state, before, "answer composition must not change actual work, saved targets, or check-ins");
  return result;
}
const question = result => result.questions.find(row => row.id === "training-deload");
function scenario(id, date = "2026-09-27") {
  return coach(F.asOf(scenarios.find(row => row.id === id), date, { richActivity: true }), date);
}
function custom(vectors, { intents = [], health = {}, profile = {}, planned = null } = {}) {
  const state = S.createEmpty(); state.trackingScope = "training"; state.training = TS.createEmpty();
  state.profile = { sex: "female", age: 31, heightCm: 166, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
    bodyFatMethod: "unknown", trainingYears: null, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", ...profile };
  vectors.forEach((vector, index) => {
    const date = new Date(Date.UTC(2026, 8, 21) + index * 2 * 86400000).toISOString().slice(0, 10), id = `synthetic-${index}`;
    state.days[date] = { date, meals: [], sessions: [], complete: false, coachCheckin: index === vectors.length - 1 ? health : {} };
    state.training.records.push({ id, date, label: "합성 세트 운동", time: null, durationMinutes: null,
      source: { kind: "manual", paths: [], hash: null, revision: null, uncertainties: [] }, pain: null,
      trainingIntent: intents[index] || null,
      exercises: [{ id: `${id}:bench`, rawName: "바벨 벤치 프레스", exerciseId: "bench_press", equipmentKey: "합성 벤치 A",
        loadConvention: "total", loadRole: "external", durationMinutes: null, notes: "", sets: vector.map(([loadKg, reps, rir = null], setIndex) =>
          ({ id: `${id}:set:${setIndex}`, loadKg, reps, rir, marker: null })) }] });
  });
  const record = state.training.records.at(-1);
  if (planned) {
    const prescription = { id: "saved-day", label: "배치한 계획", exercises: [{ id: "saved-target", exerciseId: "bench_press", label: "벤치 프레스",
      sets: record.exercises[0].sets.length, repsMin: 6, repsMax: 10, rir: 3, restSeconds: 120,
      loadKg: null, equipmentKey: "합성 벤치 A", loadConvention: "total", ...planned }] };
    state.training.planning.programs = [{ id: "saved-program", name: "합성 실제 계획", createdAt: "2026-09-01T00:00:00.000Z", source: "user", days: [prescription] }];
    state.training.planning.activeProgramId = "saved-program";
    state.training.planning.schedule = [{ id: "saved-assignment", date: record.date, programId: "saved-program", dayId: "saved-day",
      prescription, recordId: record.id, status: "performed", adjustment: null }];
  }
  return { state, date: record.date };
}

test("stable whole work answers the rest decision first and groups identical planned effort once", () => {
  const result = scenario("strength-plateau-regular"), faq = question(result), session = result.context.training.sessionCoaching;
  assert.match(faq.answer, /^전체를 낮추는 디로드보다는 지금 구성을 이어가며/);
  assert.match(faq.answer, /80kg × 8·8·8회/); assert.match(faq.answer, /9회를 시험/);
  assert.equal(faq.answer.match(/계획한 RIR 2/g)?.length, 1);
  assert.match(faq.answer, /여유가 없으면 이번 수행을 유지/);
  assert.ok(!faq.answer.includes(session.summary));
  assert.ok(!faq.answer.includes(session.actions[0].body));
  assert.doesNotMatch(faq.answer, /같은 노력인지 확인할 수 없|건강이 검증|무조건 디로드/);
  assert.equal(result.context.training.sessionCoaching.exerciseContexts[0].planEffort.actual.matchedSets[0].rir, null);
  assert.ok(faq.evidence.sources.some(source => source.kind === "saved-assignment-target" && source.date === "2026-09-25"));
});

test("known effort below a linked target is a local adjustment, not a whole-session compulsory deload", () => {
  const { state, date } = custom([[[50, 8, 1], [50, 8, 3], [50, 8, null]]], { planned: {} });
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.match(faq.answer, /^전체 운동을 디로드하기보다는/);
  assert.match(faq.answer, /50kg × 8회 RIR 1/); assert.match(faq.answer, /계획한 RIR 3/);
  assert.match(faq.answer, /부하를 낮추거나 반복을 줄여/);
  assert.doesNotMatch(faq.answer, /9회를 시험|전체를 절반|모든 세트가 한계/);
  assert.deepEqual(row.planEffort.actual.matchedSets.map(set => set.rir), [1, 3, null]);
  assert.equal(row.planEffort.target.estimated, true);
});

test("planned repetition differences preserve compliant work and independent progression choices", () => {
  const result = scenario("strength-gradual"), faq = question(result);
  assert.match(faq.answer, /^전체 운동을 줄이기보다 계획과 달랐던 구간/);
  assert.match(faq.answer, /90kg × 4회 \/ 80kg × 5회/);
  assert.match(faq.answer, /6~10회/); assert.match(faq.answer, /80kg × 7회는 계획한 반복 범위 안/);
  assert.match(faq.answer, /105kg × 6회 한 세트에서만 7회를 시험/);
  assert.doesNotMatch(faq.answer, /스쿼트도 함께 줄|다른 종목도 모두 쉬/);
});

test("a repeated lowered episode retains its original normal reference, not only the immediately lower session", () => {
  const result = scenario("strength-unexpected-decline"), faq = question(result);
  assert.match(faq.answer, /^지금은 더 늘리기보다 줄어든 구성을 먼저/);
  assert.match(faq.answer, /2026-09-11의 80kg × 8·8·8회/);
  assert.match(faq.answer, /2026-09-25 바벨 벤치 프레스.*55kg × 8·8회/);
  assert.match(faq.answer, /105kg.*70kg/);
  assert.equal(faq.answer.match(/줄여서 하는 목적이면 이번 구성을 지키고/g)?.length, 1,
    "the common rest-and-purpose condition is not repeated for each lowered movement");
  assert.doesNotMatch(faq.answer, /부상 때문|영양 부족 때문|반드시 디로드/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-09-11"));
});

test("heavier low-rep work and lowered tail are not presented as a globally reduced session", () => {
  const { state, date } = custom([[[100, 10], [100, 8], [100, 7]], [[120, 3], [100, 6], [100, 4]]]);
  const faq = question(coach(state, date));
  assert.match(faq.answer, /^지금은 전체를 낮추기보다/);
  assert.match(faq.answer, /2026-09-21의 100kg × 10·8·7회/);
  assert.match(faq.answer, /120kg.*3회/); assert.match(faq.answer, /100kg.*6·4회/);
  assert.match(faq.answer, /충분히 쉬|마지막 4회/);
  assert.doesNotMatch(faq.answer, /이번.*120kg.*로 줄어든 흐름|첫 세트가 실패|전체를 절반/);
});

test("normal first input still provides a useful actual choice without waiting for RIR or more diary days", () => {
  const { state, date } = custom([[[40, 9], [40, 9], [40, 6]]]);
  const faq = question(coach(state, date));
  assert.match(faq.answer, /40kg.*9·9·6회|40kg.*9회/);
  assert.match(faq.answer, /충분히 쉬|마지막 6회/);
  assert.doesNotMatch(faq.answer, /RIR을 입력해야|분석할 수 없|기록이 더 필요/);
});

for (const intent of ["deload", "light", "technique", "time-limited", "return", "test"]) {
  test(`explicit ${intent} shapes the next choice without inventing a performed reduction or maximum`, () => {
    const { state, date } = custom([[[50, 8], [50, 8], [50, 8]]], { intents: [intent] });
    const result = coach(state, date), faq = question(result);
    const words = { deload: /계획한 디로드/, light: /가볍게 운동하려는 목적/, technique: /동작 연습/, "time-limited": /시간이 부족/, return: /복귀 단계/, test: /기록 확인용/ };
    assert.match(faq.answer.split("\n\n")[0], words[intent]);
    assert.match(faq.answer, /50kg × 8·8·8회/);
    assert.doesNotMatch(faq.answer, /이전보다 줄였|이번.*로 줄어든 흐름|줄인 날|최대 능력을 달성|못한 운동을 모두 보충/);
    assert.equal(faq.actionRecordId, "synthetic-0");
  });
}

test("unconfirmed broad reduction offers a current action before the shared purpose question", () => {
  const { state, date } = custom([[[80, 8], [80, 8]], [[40, 8], [40, 8]]]);
  for (const record of state.training.records) {
    const second = structuredClone(record.exercises[0]); second.id += ":leg"; second.rawName = "레그 프레스";
    second.exerciseId = "leg_press"; second.equipmentKey = "합성 레그 프레스 A";
    second.sets.forEach(set => { set.id += ":leg"; set.loadKg *= 2; }); record.exercises.push(second);
  }
  const result = coach(state, date), faq = question(result), clarification = result.context.training.sessionCoaching.question;
  assert.match(faq.answer, /^지금은 더 늘리기보다/);
  if (clarification) assert.ok(faq.answer.indexOf(clarification.title) > faq.answer.indexOf("편하게 이어가는"));
  assert.doesNotMatch(faq.answer, /회복이 나쁘다고|부상이 있다고|무조건 디로드/);
});

for (const health of [{ illness: "active" }, { pain: "stop" }, { illness: "recovering" }, { fatigue: "high", sleep: "poor" }]) {
  test(`current ${JSON.stringify(health)} remains above numeric progress and saved purpose`, () => {
    const { state, date } = custom(Array.from({ length: 3 }, () => [[50, 8], [50, 8], [50, 8]]), { health, intents: [null, null, "return"] });
    const result = coach(state, date), faq = question(result);
    assert.ok(faq.answer.startsWith(result.context.currentHealthAdvice.body));
    assert.ok(result.questions.find(row => row.id === "recovery").answer.startsWith(result.context.currentHealthAdvice.body));
    assert.doesNotMatch(faq.answer, /9회를 시험|전체를 낮추는 디로드보다는/);
    assert.match(faq.answer, health.illness === "active" || health.pain === "stop" ? /쉬며 현재 증상/ : /반응|편한 준비/);
  });
}

test("unresolved old illness keeps its report date and does not become today's illness or a healthy clearance", () => {
  const { state, date } = custom(Array.from({ length: 3 }, () => [[50, 8], [50, 8], [50, 8]]), { health: { energy: "good", sleep: "good" } });
  state.days["2026-09-21"].coachCheckin = { illness: "active" };
  let faq = question(coach(state, date));
  assert.match(faq.answer, /2026-09-21에 아픈 상태라고/);
  assert.match(faq.answer, /지금도 이어지는지는 아직/);
  assert.doesNotMatch(faq.answer, /9회를 시험|2026-09-25에 아픈 상태/);
  state.days[date].coachCheckin.illness = "none";
  faq = question(coach(state, date));
  assert.match(faq.answer, /9회를 시험/);
});

test("running decrease answers from actual baseline and current time without dumping the activity report", () => {
  const result = scenario("running-unexpected-decline"), faq = question(result), actual = result.context.activityCoaching.latest[0];
  assert.match(faq.answer, /^지금은 더 늘리기보다/); assert.match(faq.answer, /30분/); assert.match(faq.answer, /15분/);
  assert.match(faq.answer, /한꺼번에 메우기보다/);
  assert.ok(!faq.answer.includes(actual.assessment));
  assert.ok(faq.evidence.sources.some(source => source.date === actual.date));
});

test("mixed HYROX plus sets keeps local tasks without repeating every station or every RIR condition", () => {
  const result = scenario("mixed-plateau-regular"), faq = question(result);
  assert.match(faq.answer, /80kg.*9회를 시험/); assert.match(faq.answer, /복합·HYROX.*60분/);
  assert.doesNotMatch(faq.answer, /달리기 구간 → 로잉 구간 → 파머 캐리 구간 → 월볼 구간/);
  assert.match(faq.answer, /뒤 구간까지|전체 시간.*한꺼번에/);
  assert.equal(faq.answer.match(/계획한 RIR 2/g)?.length, 1);
  assert.ok(faq.answer.length < 950);
});

test("a previously completed return is distinguished from a current decline and never relabelled as today", () => {
  const result = scenario("running-unexpected-decline", "2026-10-04"), faq = question(result);
  assert.match(faq.answer, /2026-10-02.*달리기/);
  assert.match(faq.answer, /다시 남겼/);
  assert.doesNotMatch(faq.answer, /지금은 더 늘리기보다 줄어든|오늘 실제.*30분|2026-10-04.*30분/);
});

test("no performed work still offers a preparation choice rather than fabricated sets or an assessment gate", () => {
  const state = S.createEmpty(), date = "2026-10-04";
  state.profile = custom([[[40, 8]]]).state.profile; state.trackingScope = "training"; state.training = TS.createEmpty();
  state.days[date] = { date, meals: [], sessions: [], complete: false };
  const faq = question(coach(state, date));
  assert.match(faq.answer, /^운동을 시작한다면 편한 준비 구간부터/);
  assert.doesNotMatch(faq.answer, /지난 구성|지금 구성을 출발점|kg|3세트|기록이 없어 분석할 수|더 입력해야/);
  assert.deepEqual(faq.evidence.sources, []);
});

test("recorded activity retains its actual starting work while a blank first-use day does not invent a previous configuration", () => {
  const result = scenario("running-gradual"), faq = question(result);
  assert.match(faq.answer, /^다음 운동은 지난 구성에서 이어갈 수/);
  assert.match(faq.answer, /2026-09-25 달리기 실제 수행.*35분/s);
  assert.doesNotMatch(faq.answer, /^운동을 시작한다면/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-09-25"));
});

test("time-limited intent with unchanged full work never asserts that time or work was reduced", () => {
  const result = scenario("strength-time-limited", "2026-10-04"), faq = question(result);
  assert.match(faq.answer, /^2026-10-02에 시간이 부족한 날로 남겼어요/);
  assert.match(faq.answer, /2026-10-02.*80kg × 8·8·8회/);
  assert.doesNotMatch(faq.answer, /줄인 날|운동량을 줄였|시간을 줄였|줄어든 흐름/);
});

test("comfortable heavy-set advice keeps the lower-load rest task without stacking a second increase", () => {
  const { state, date } = custom([[[80, 10], [80, 8], [80, 7]], [[100, 3], [80, 6], [80, 4]]]);
  const block = state.training.records.at(-1).exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 100, reps: 3, feeling: "comfortable" };
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.equal(row.advice.primaryAction.proposal.targetReps, 4);
  assert.match(faq.answer, /100kg × 3회 한 세트에서만 4회를 시험/);
  assert.match(faq.answer, /80kg.*6·4회/);
  assert.match(faq.answer, /충분히 쉬/);
  assert.doesNotMatch(faq.answer, /뒤 세트에서만 1회 더|80kg.*5회를 시험/);
  assert.deepEqual(row.actual.current.sets.map(set => set.reps), [3, 6, 4]);
});

test("a fractional planned RIR and decimal load retain their source values in the answer", () => {
  const { state, date } = custom(Array.from({ length: 3 }, () => [[42.25, 8], [42.25, 8], [42.25, 8]]), { planned: { rir: 2.5 } });
  const result = coach(state, date), faq = question(result);
  assert.match(faq.answer, /42\.25kg × 8·8·8회/);
  assert.match(faq.answer, /계획한 RIR 2\.5, 즉 2\.5회 여유/);
  assert.doesNotMatch(faq.answer, /계획한 RIR 3,|42\.3kg/);
});

test("activity-only stable work retains its specific progression choice instead of only the opening observation", () => {
  const faq = question(scenario("cycling-plateau-regular", "2026-10-04"));
  assert.match(faq.answer, /45분/); assert.match(faq.answer, /155W/);
  assert.match(faq.answer, /시간 또는 힘을 주는 구간 중 한 가지만 늘려/);
  assert.doesNotMatch(faq.answer, /전체 세트|바벨|RIR/);
});

test("a comfortable compliant set does not hide below-target effort on another actual planned set", () => {
  const { state, date } = custom([[[50, 8, 3], [50, 8, 1], [50, 8, null]]], { planned: {} });
  const block = state.training.records[0].exercises[0];
  block.feedback = { setId: block.sets[0].id, loadKg: 50, reps: 8, feeling: "comfortable" };
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.match(faq.answer, /^전체 운동을 디로드하기보다는/);
  assert.match(faq.answer, /한 세트에서만 9회를 시험/);
  assert.match(faq.answer, /RIR 1.*계획한 RIR 3/);
  assert.match(faq.answer, /이 세트는 반복이나 부하를 더 늘리지/);
  assert.equal(row.advice.primaryAction.proposal.setId, block.sets[0].id);
  assert.deepEqual(row.planEffort.actual.unknownSetIds, [block.sets[2].id]);
});

test("time-only movement evidence does not invent general sets or resistance progression", () => {
  const { state, date } = custom([[]]);
  const block = state.training.records[0].exercises[0];
  Object.assign(block, { rawName: "폼 롤링", exerciseId: "foam_rolling", equipmentKey: "폼 롤러", durationMinutes: 15 });
  const faq = question(coach(state, date));
  assert.match(faq.answer, /15분/); assert.match(faq.answer, /편안하게|편한|부드러/);
  assert.doesNotMatch(faq.answer, /kg|일반 세트|근성장|RIR|1회 더/);
});

test("profileless recorded work remains actionable and preserves dated facts without nutrition targets", () => {
  const { state, date } = custom([[[40, 9], [40, 9], [40, 6]]]); state.profile = null;
  const result = coach(state, date), faq = question(result);
  assert.match(faq.answer, /2026-09-21.*40kg/); assert.match(faq.answer, /마지막 6회|충분히 쉬/);
  assert.doesNotMatch(faq.answer, /kcal|성별을 입력해야|체성분을 입력해야/);
  assert.deepEqual(result.context.training.sessionCoaching.exerciseContexts[0].actual.current.sets, state.training.records[0].exercises[0].sets);
});

for (const intent of ["deload", "light", "technique", "time-limited", "return", "test"]) {
  test(`older ${intent} remains a dated reported purpose rather than an ongoing current period`, () => {
    const { state } = custom([[[50, 8], [50, 8], [50, 8]]], { intents: [intent] });
    const date = "2026-10-14"; state.days[date] = { date, meals: [], sessions: [], complete: false, coachCheckin: {} };
    const result = coach(state, date), faq = question(result);
    assert.match(faq.answer.split("\n\n")[0], /^2026-09-21/);
    assert.doesNotMatch(faq.answer, /^계획한 디로드를 이어가세요|^복귀 단계에서는|지금도 디로드 중이에요|오늘.*수행 확인/);
    assert.match(faq.answer, /다음에는|다음 부담|다음에도|다음 단계/);
    assert.match(faq.answer, /2026-09-21 바벨 벤치 프레스.*50kg × 8·8·8회/);
    assert.ok(faq.evidence.sources.every(source => source.date !== date), "the selected blank day is not a performed source date");
    if (intent === "deload" || intent === "return") assert.match(faq.answer, /지금도.*중이라면/);
    assert.equal(result.context.training.lastSession.date, "2026-09-21");
  });
}

test("an older activity deload purpose is not promoted to a current deload period", () => {
  const scenario = scenarios.find(row => row.id === "cycling-planned-deload"), date = "2026-09-27";
  const result = coach(F.asOf(scenario, date, { richActivity: true }), date), faq = question(result);
  assert.match(faq.answer, /^2026-09-25 기록은 디로드 목적으로 남겼어요/);
  assert.match(faq.answer, /지금도 그 기간을 이어가는 중이라면/);
  assert.match(faq.answer, /2026-09-25 자전거/);
  assert.doesNotMatch(faq.answer, /오늘.*디로드를 진행|오늘.*기록한.*분/);
});

test("return to an established full vector retains original and intermediate actual sources without a false change", () => {
  const original = [[50, 8], [50, 8], [50, 8]], expanded = [...original, [50, 8]];
  const { state, date } = custom([original, original, original, expanded, expanded, expanded, original]);
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.equal(row.hypotheses.recentChange.kind, "returned");
  assert.equal(row.advice.primaryAction.kind, "reestablish-recorded-work");
  assert.match(faq.answer, /2026-09-25의 50kg × 8·8·8회 구성을 다시 이어냈어요/);
  assert.match(faq.answer, /중간 2026-10-01에는 50kg × 8·8·8·8회/);
  assert.match(faq.answer, /이번 전체 구간과 운동 뒤·다음 날 반응/);
  assert.doesNotMatch(faq.answer, /50kg × 8·8·8회에서 이번 50kg × 8·8·8회로 바뀌었/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-09-25" && source.sessionId === "synthetic-2"));
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-10-01" && source.sessionId === "synthetic-5"));
  assert.deepEqual(row.actual.current.sets, state.training.records.at(-1).exercises[0].sets);
});

test("local heavy-set adjustment uses the immediate matching work instead of replacing it with an older lighter episode", () => {
  const base = [[40, 12], [40, 12], [40, 12]];
  const original = [...base, [30, 12]], heavier = [...base, [55, 8]], latest = [...base, [55, 5]];
  const { state, date } = custom([original, original, original, heavier, heavier, heavier, latest]);
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.equal(row.advice.primaryAction.kind, "keep-base-check-heavy");
  assert.ok(row.actual.recentChange.baseline);
  assert.match(faq.answer, /2026-10-01의 40kg × 12·12·12회 \/ 55kg × 8회에서 이번 40kg × 12·12·12회 \/ 55kg × 5회/);
  assert.match(faq.answer, /40kg × 12·12·12회는 그대로/);
  assert.match(faq.answer, /55kg × 5회를 시도하기 전에 충분히 쉬/);
  assert.doesNotMatch(faq.answer, /2026-09-25의 .*30kg × 12회에서 이번/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-10-01" && source.sessionId === "synthetic-5"));
});

test("equal displayed work with changed actual RIR does not receive a fabricated work-change prefix", () => {
  const { state, date } = custom([[[50, 8, 3], [50, 8, 3]], [[50, 8, 0], [50, 8, 3]]]);
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.ok(["ease", "hold-limit-set"].includes(row.advice.primaryAction.kind));
  assert.doesNotMatch(faq.answer, /50kg × 8·8회에서 이번 50kg × 8·8회로 바뀌었/);
  assert.match(faq.answer, /한계|더 밀지|늘리기보다|억지로 넘기지/);
  assert.deepEqual(row.actual.current.sets.map(set => set.rir), [0, 3]);
  assert.doesNotMatch(faq.answer, /9회를 시험/);
});

test("a compressed five-set summary exposes the actual middle-set change that explains the local action", () => {
  const { state, date } = custom([[[50, 10], [50, 9], [50, 8], [50, 6], [50, 4]], [[50, 10], [50, 8], [50, 8], [50, 6], [50, 4]]]);
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.equal(row.advice.primaryAction.kind, "restore-tail");
  assert.match(faq.answer, /기록의 2번째 일반 세트는 2026-09-21의 50kg × 9회에서 이번 50kg × 8회로 달라졌어요/);
  assert.match(faq.answer, /충분히 쉬/);
  assert.doesNotMatch(faq.answer, /10회부터 마지막 4회까지 5세트에서 이번 50kg × 10회부터 마지막 4회까지 5세트로 바뀌었/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-09-21" && source.sessionId === "synthetic-0"));
  assert.deepEqual(row.actual.current.sets.map(set => set.reps), [10, 8, 8, 6, 4]);
});

test("a second lower stage keeps the earlier full baseline and the actual intervening work instead of flattening the decline", () => {
  const original = [[60, 8], [60, 8], [60, 8]], reduced = [[60, 8], [60, 6]], latest = [[40, 8], [40, 8]];
  const { state, date } = custom([original, original, original, reduced, reduced, reduced, latest, latest, latest]);
  const result = coach(state, date), faq = question(result), row = result.context.training.sessionCoaching.exerciseContexts[0];
  assert.equal(row.advice.primaryAction.kind, "review-recent-reduction");
  assert.match(faq.answer, /2026-09-25의 60kg × 8·8·8회에서 이번 40kg × 8·8회로 줄어든 흐름/);
  assert.match(faq.answer, /중간 2026-10-01에는 60kg × 8·6회를 남겼어요/);
  assert.ok(faq.evidence.sources.some(source => source.date === "2026-10-01" && source.sessionId === "synthetic-5"));
  assert.doesNotMatch(faq.answer, /9회를 시험|41kg/);
  assert.deepEqual(row.actual.current.sets, state.training.records.at(-1).exercises[0].sets);
});
