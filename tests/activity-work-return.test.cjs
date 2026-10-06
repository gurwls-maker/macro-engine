"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Activity = require("../src/activity-coaching.js");
const Storage = require("../src/storage.js");
const Fixtures = require("./fixtures/coaching-scenarios.cjs");
const scenarios = Fixtures.buildScenarios({ richActivity: true });
const families = ["running", "cycling", "swimming", "walking", "team", "mixed"];
const timeFamilies = ["strength", ...families];
const currentDate = "2026-10-02";

function example(family, factor = 1.6) {
  const scenario = scenarios.find(row => row.id === `${family}-gradual`);
  const original = scenario.state.days["2026-09-07"].sessions[0];
  const state = Storage.createEmpty(); state.profile = structuredClone(scenario.state.profile);
  const add = (date, scale = 1, suffix = "actual") => {
    const row = structuredClone(original); row.id = `${family}:${date}:${suffix}`;
    row.durationMin *= scale;
    for (const key of ["distanceM", "movingMin"]) if (typeof row.details[key] === "number") row.details[key] *= scale;
    for (const [index, segment] of (row.details.segments || []).entries()) {
      segment.id = `${row.id}:${index}`;
      for (const key of ["durationMin", "distanceM", "reps"]) if (typeof segment[key] === "number") segment[key] *= scale;
    }
    if (!state.days[date]) state.days[date] = { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null,
      bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [], complete: false, planSnapshot: null, sessions: [], coachCheckin: null };
    state.days[date].sessions.push(row);
    return row;
  };
  add("2026-09-01"); add("2026-09-04"); add("2026-09-18", factor); add("2026-09-25", factor); add(currentDate);
  return { state, add, original };
}
function row(input, date = currentDate) {
  const output = Activity.build(input, date);
  return output.current[0] || output.latest[0];
}

test("historical work and its purpose question do not masquerade as today's activity while current checkins remain current", () => {
  const scenario = scenarios.find(item => item.id === "running-gradual");
  const input = Fixtures.asOf(scenario, "2026-09-11", { richActivity: true });
  const before = structuredClone(input), output = Activity.build(input, "2026-09-13");
  assert.deepEqual(output.current, []);
  assert.equal(output.latest[0].date, "2026-09-11");
  assert.equal(output.latest[0].actual.distanceM, 5000);
  assert.match(output.latest[0].action.body, /이번 거리가 편했다면/);
  assert.doesNotMatch(output.latest[0].action.body, /오늘 거리/);
  assert.deepEqual(input, before);
  const reduced = structuredClone(input), actual = reduced.days["2026-09-11"].sessions[0];
  actual.durationMin = 15; actual.details.movingMin = 15; actual.details.distanceM = 2500; actual.details.intent = "unknown";
  const purpose = Activity.build(reduced, "2026-09-13").latest[0];
  assert.equal(purpose.date, "2026-09-11");
  assert.equal(purpose.question.kind, "session-purpose");
  assert.match(purpose.question.body, /^이 기록은 디로드/);
  assert.doesNotMatch(purpose.question.body, /오늘은/);
  const checked = structuredClone(input);
  checked.days["2026-09-13"] = { ...structuredClone(checked.days["2026-09-11"]), date: "2026-09-13", sessions: [],
    coachCheckin: { fatigue: "high", sleepHours: 5 } };
  const currentHealth = Activity.build(checked, "2026-09-13").latest[0];
  assert.equal(currentHealth.date, "2026-09-11");
  assert.equal(currentHealth.action.kind, "current-recovery");
  assert.match(currentHealth.action.body, /오늘 알려준 피로·컨디션/);
});

test("every sport reads an exact established composition after temporary expansion or reduction as a return, not physiological recovery", () => {
  for (const family of timeFamilies) for (const factor of [1.6, 0.6]) {
    const { state, original } = example(family, factor), before = structuredClone(state), result = row(state);
    assert.equal(result.action.kind, "return-established-work", `${family}/${factor}`);
    assert.equal(result.actual.durationMin, original.durationMin);
    assert.match(result.action.body, /전에 여러 날 했던 구성.*다시 남겼어요/);
    assert.match(result.action.body, /마무리까지.*이후·다음날 반응/);
    assert.doesNotMatch(result.action.body, /회복 완료|체력.*회복했|바로.*늘려|일부를 못|원래 시간.*돌아/);
    const returned = result.comparison.observations.find(item => item.kind === "established-work-return");
    assert.deepEqual(returned.referenceDates, ["2026-09-01", "2026-09-04"]);
    assert.deepEqual(returned[factor > 1 ? "expandedDates" : "reducedDates"], ["2026-09-18", "2026-09-25"]);
    for (const date of ["2026-09-01", "2026-09-04", "2026-09-18", "2026-09-25", currentDate]) {
      assert.ok(result.sources.some(source => source.kind === "activity-session" && source.date === date), `${family}/${date}`);
    }
    assert.deepEqual(state, before);
    const afterGap = row(state, "2026-10-04");
    assert.equal(afterGap.date, currentDate); assert.deepEqual(afterGap.action, result.action);
    const future = structuredClone(state); future.days["2026-10-05"] = { ...structuredClone(future.days[currentDate]), date: "2026-10-05",
      sessions: [{ ...structuredClone(future.days[currentDate].sessions[0]), id: "future-work", durationMin: original.durationMin * 2 }], coachCheckin: { pain: "stop" } };
    assert.deepEqual(Activity.build(future, currentDate), Activity.build(state, currentDate));
  }
});

test("actual monthly paths restore earlier work only when its confirmed conditions also return", () => {
  for (const family of families.filter(value => value !== "mixed")) {
    const scenario = scenarios.find(item => item.id === `${family}-sharp-improvement`), checkpoint = scenario.checkpoints[3];
    const input = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), output = Activity.build(input, checkpoint.date), latest = output.latest[0];
    assert.deepEqual(output.current, []); assert.equal(latest.date, currentDate);
    assert.equal(latest.action.kind, "return-established-work", family);
    const returned = latest.comparison.observations.find(item => item.kind === "established-work-return");
    assert.ok(returned.expandedDates.includes("2026-09-25"), family);
    assert.match(latest.action.body, /시간·거리나 구간 과제.*늘/);
    assert.doesNotMatch(latest.action.body, /일부를 못|이전 시간을 맞추/);
  }
  const scenario = scenarios.find(item => item.id === "mixed-sharp-improvement"), checkpoint = scenario.checkpoints[3];
  const input = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), latest = Activity.build(input, checkpoint.date).latest[0];
  assert.equal(latest.action.kind, "hybrid");
  assert.match(latest.action.body, /월볼 구간 → 파머 캐리 구간 → 로잉 구간 → 달리기 구간/);
  assert.match(latest.assessment, /조건을 나눠 새 구성의 재현/);
  assert.ok(!latest.comparison.observations.some(item => item.kind === "established-work-return"));
  assert.equal(latest.actual.durationMin, 60);
});

test("small temporary expansions and task changes do not make the established return look like unfinished work", () => {
  for (const family of timeFamilies) for (const factor of [4 / 3, 1.1, 0.9]) {
    const result = row(example(family, factor).state);
    assert.equal(result.action.kind, "return-established-work", `${family}/${factor}`);
    assert.doesNotMatch(result.action.body, /일부를 못|이전 시간을 맞추|부담이.*줄었|수행이.*떨어졌/);
    assert.equal(result.question, null);
    assert.match(result.action.body, /마무리까지.*이후·다음날 반응/);
  }
});

test("unchanged work does not become a configuration return when a new health report changes eligibility", () => {
  for (const family of timeFamilies) for (const report of [{ pain: "stop" }, { pain: "mild" }, { illness: "active" }, { illness: "recovering" }]) {
    const { state } = example(family, 1);
    state.days[currentDate].coachCheckin = report;
    const before = structuredClone(state), result = row(state);
    assert.ok(!result.comparison.observations.some(item => item.kind === "established-work-return"), `${family}/${JSON.stringify(report)}`);
    assert.doesNotMatch(result.assessment, /다시 이어진 기록|원래 구성.*복귀/);
    assert.notEqual(result.action.kind, "return-established-work");
    assert.match(result.action.body, /통증|증상|회복|쉬|중단/);
    assert.deepEqual(state, before);
    const resolved = structuredClone(state);
    resolved.days["2026-09-25"].coachCheckin = report;
    resolved.days[currentDate].coachCheckin = { pain: "none", illness: "none" };
    const healthy = row(resolved);
    assert.ok(!healthy.comparison.observations.some(item => item.kind === "established-work-return"));
    assert.doesNotMatch(healthy.assessment, /다시 이어진 기록|회복.*완료/);
    assert.notEqual(healthy.action.kind, "stop");
  }
});

test("purpose and health remain distinct from an actual intervening work change", () => {
  for (const family of timeFamilies) {
    const unchanged = example(family, 1).state;
    for (const date of ["2026-09-18", "2026-09-25"]) unchanged.days[date].sessions[0].details.intent = "deload";
    const sameWork = row(unchanged);
    assert.ok(!sameWork.comparison.observations.some(item => item.kind === "established-work-return"), `${family}: changed intent is not changed actual configuration`);
    assert.doesNotMatch(sameWork.assessment, /다시 이어진 기록/);
    const changed = example(family, 0.65).state;
    for (const date of ["2026-09-18", "2026-09-25"]) {
      changed.days[date].sessions[0].details.intent = "deload";
      changed.days[date].coachCheckin = { illness: "recovering" };
    }
    changed.days[currentDate].coachCheckin = { illness: "none", pain: "none" };
    const returned = row(changed);
    assert.equal(returned.action.kind, "return-established-work");
    assert.deepEqual(returned.comparison.observations.find(item => item.kind === "established-work-return").reducedDates, ["2026-09-18", "2026-09-25"]);
    assert.doesNotMatch(returned.action.body, /회복 완료|바로.*늘려/);
  }
});

test("otherwise identical headline values expose the recorded speed or selected intensity that changed", () => {
  const scenario = scenarios.find(item => item.id === "running-volume-surge"), checkpoint = scenario.checkpoints[1];
  const state = Fixtures.asOf(scenario, checkpoint.date, { richActivity: true }), before = structuredClone(state), result = row(state, checkpoint.date);
  assert.match(result.assessment, /30분 · 5km/);
  assert.match(result.assessment, /입력 속도는 10km\/h → 11km\/h/);
  assert.match(result.assessment, /거리·활동시간.*같은 기준.*확인/);
  assert.match(result.assessment, /일부 구간 속도.*실제 향상.*판정하지/);
  assert.ok(result.comparison.observations.some(item => item.kind === "recorded-speed" && item.previousDate === "2026-09-11" && item.previousKmh === 10 && item.currentKmh === 11));
  assert.deepEqual(state, before);
  const changed = example("cycling", 1).state;
  for (const date of ["2026-09-18", "2026-09-25", currentDate]) changed.days[date].sessions[0].intensity = "hard";
  assert.match(row(changed).assessment, /선택 강도.*보통 → 강함/);
});

test("matched-time context changes name their actual pool, equipment or confirmed segment-order difference", () => {
  const cases = [
    ["swimming", session => { session.details.poolLengthM = 50; }, /풀 길이 25m → 50m/],
    ["running", session => { session.details.environment = "treadmill"; session.cardio.environment = "treadmill"; }, /환경 .* → 트레드밀/],
    ["cycling", session => { session.details.equipmentKey = "alternative-power-meter"; }, /기구 .* → alternative-power-meter/],
    ["mixed", session => { session.details.segments.reverse(); }, /확인한 순서: 이전 \[.*\] \/ 이번 \[.*월볼.*\]/]
  ];
  for (const [family, mutate, expected] of cases) {
    const state = example(family, 1).state, before = structuredClone(state);
    mutate(state.days[currentDate].sessions[0]);
    const immutable = structuredClone(state), result = row(state);
    assert.match(result.assessment, expected, family);
    assert.notEqual(result.action.kind, "return-established-work");
    assert.ok(!result.comparison.observations.some(item => item.kind === "established-work-return"));
    assert.deepEqual(state, immutable); assert.notDeepEqual(state, before);
  }
});

test("changed condition names remain readable without attaching an incorrect Korean particle", () => {
  for (const [field, value, expected] of [
    ["label", "새 달리기", /활동 이름 .* → 새 달리기/],
    ["environment", "different", /환경 .* → 다른 환경/],
    ["equipmentKey", "새 기구", /기구 .* → 새 기구/],
    ["format", "interval", /운동 형식 .* → 인터벌/],
    ["routeKey", "새 코스", /코스 .* → 새 코스/],
    ["conditions", "different", /기록 조건 .* → 다른 조건/]
  ]) {
    const state = example("running", 1).state;
    state.days[currentDate].sessions[0].details[field] = value;
    const before = structuredClone(state), result = row(state);
    assert.match(result.assessment, /비교 조건이 달라졌어요:/);
    assert.match(result.assessment, expected);
    assert.doesNotMatch(result.assessment, /그때와 달라진 입력은 .*예요/);
    assert.deepEqual(state, before);
    assert.notEqual(result.action.kind, "return-established-work");
  }
});

test("segment changes separate original labels from metric names and preserve both confirmed order vectors", () => {
  const state = example("mixed", 1).state;
  for (const day of Object.values(state.days)) {
    const part = day.sessions[0].details.segments[0];
    part.label = "패스 반복"; part.reps = 30;
  }
  state.days[currentDate].sessions[0].details.segments[0].reps = 40;
  const before = structuredClone(state), result = row(state);
  assert.match(result.assessment, /구간 변화: 패스 반복: 반복 30회 → 40회/);
  assert.doesNotMatch(result.assessment, /패스 반복 반복|구간 입력은/);
  assert.deepEqual(state, before);
  const changedOrder = example("mixed", 1).state;
  changedOrder.days[currentDate].sessions[0].details.segments.reverse();
  const ordered = row(changedOrder);
  assert.match(ordered.assessment, /확인한 순서: 이전 \[.*\] \/ 이번 \[.*\]/);
  assert.doesNotMatch(ordered.assessment, /구간로 변경/);
  assert.deepEqual(ordered.actual.details.segments, changedOrder.days[currentDate].sessions[0].details.segments);
});

test("cardio-only context and same-time segment changes retain the actual input behind the comparison", () => {
  for (const [change, expected] of [
    [session => { session.cardio.gradePct = 4; }, /입력 경사 0% → 4%/],
    [session => { session.cardio.environment = "treadmill"; session.details.environment = null; }, /유산소 환경 실외 → 트레드밀/]
  ]) {
    const state = example("running", 1).state;
    for (const day of Object.values(state.days)) day.sessions[0].details.environment = null;
    change(state.days[currentDate].sessions[0]);
    const before = structuredClone(state), result = row(state);
    assert.match(result.assessment, expected);
    assert.notEqual(result.action.kind, "return-established-work");
    assert.deepEqual(state, before);
  }
  for (const [field, value, expected] of [["reps", 50, /반복 .*회 → 50회/], ["loadKg", 12.25, /표시 부하 .*kg → 12\.25kg/],
    ["durationMin", 9, /시간 .*분 → 9분/], ["distanceM", 333, /거리 .*m → 333m/]]) {
    const state = example("mixed", 1).state;
    const current = state.days[currentDate].sessions[0].details.segments;
    const target = current.find(part => typeof part[field] === "number");
    assert.ok(target, field); target[field] = value;
    const before = structuredClone(state), result = row(state);
    assert.match(result.assessment, expected, field);
    assert.ok(result.sources.some(source => source.date === "2026-09-25"));
    assert.deepEqual(state, before);
  }
  const unknown = example("mixed", 1).state;
  for (const day of Object.values(unknown.days)) day.sessions[0].details.segments[0].reps = null;
  unknown.days[currentDate].sessions[0].details.segments[0].reps = 7;
  assert.match(row(unknown).assessment, /반복 미입력 → 7회/);
  const duplicates = example("mixed", 1).state;
  for (const day of Object.values(duplicates.days)) {
    const parts = day.sessions[0].details.segments;
    parts.push({ ...structuredClone(parts.at(-1)), id: `${day.date}:duplicate`, reps: 10 });
  }
  duplicates.days[currentDate].sessions[0].details.segments.at(-1).reps = 13;
  const before = structuredClone(duplicates), result = row(duplicates);
  assert.match(result.assessment, /같은 이름의 구간이 여러 개.*각각 보존.*임의로 짝짓지/);
  assert.equal(result.actual.details.segments.length, 5);
  assert.equal(result.actual.details.segments.at(-1).reps, 13);
  assert.deepEqual(duplicates, before);
});

test("a return requires independent earlier days, exact work and matched recording conditions", () => {
  for (const family of timeFamilies) {
    const single = example(family).state; delete single.days["2026-09-04"];
    single.days["2026-09-01"].sessions.push({ ...structuredClone(single.days["2026-09-01"].sessions[0]), id: "same-day-not-independent" });
    assert.notEqual(row(single).action.kind, "return-established-work");
    const changedIntensity = example(family).state; changedIntensity.days[currentDate].sessions[0].intensity = "high";
    assert.notEqual(row(changedIntensity).action.kind, "return-established-work");
    const changedEquipment = example(family).state; changedEquipment.days[currentDate].sessions[0].details.equipmentKey = "new-measurement-device";
    assert.notEqual(row(changedEquipment).action.kind, "return-established-work");
    const missingMetric = example(family).state; delete missingMetric.days[currentDate].sessions[0].details.movingMin;
    assert.notEqual(row(missingMetric).action.kind, "return-established-work");
    const reduced = example(family).state; reduced.days[currentDate].sessions[0].durationMin *= 0.5;
    assert.notEqual(row(reduced).action.kind, "return-established-work", "a genuinely different lower work vector does not become the old original");
    const first = example(family).state; first.days = { [currentDate]: first.days[currentDate] };
    assert.notEqual(row(first).action.kind, "return-established-work");
    const ambiguous = example(family).state;
    ambiguous.days["2026-09-25"].sessions.push({ ...structuredClone(ambiguous.days["2026-09-25"].sessions[0]), id: "opposing-work-same-day", durationMin: 17 });
    assert.notEqual(row(ambiguous).action.kind, "return-established-work", "same-day opposing configurations have no inferred sequence");
  }
  for (const family of ["running", "walking"]) {
    const changedSpeed = example(family).state;
    changedSpeed.days[currentDate].sessions[0].cardio = { environment: "outdoor", speedKmh: 9, gradePct: 0 };
    assert.notEqual(row(changedSpeed).action.kind, "return-established-work", "a new recorded speed is not the same original work");
  }
});

test("rate-only changes return to an established actual task without claiming volume or ability recovery", () => {
  const cycling = example("cycling", 1).state;
  for (const date of ["2026-09-18", "2026-09-25"]) cycling.days[date].sessions[0].details.avgPowerW = 210;
  const cycleResult = row(cycling);
  assert.equal(cycleResult.action.kind, "return-established-work");
  assert.equal(cycleResult.actual.avgPowerW, 155);
  assert.match(cycleResult.action.body, /평균 155W/);
  const cyclingReturn = cycleResult.comparison.observations.find(item => item.kind === "established-work-return");
  assert.deepEqual(cyclingReturn.expandedDates, []); assert.deepEqual(cyclingReturn.reducedDates, []);
  assert.deepEqual(cyclingReturn.evolvedDates, ["2026-09-18", "2026-09-25"]);
  const swimming = example("swimming", 1).state;
  for (const date of ["2026-09-18", "2026-09-25"]) swimming.days[date].sessions[0].details.movingMin = 20;
  const swimResult = row(swimming);
  assert.equal(swimResult.action.kind, "return-established-work");
  assert.equal(swimResult.actual.movingMin, 25); assert.equal(swimResult.actual.distanceM, 1000);
  assert.match(swimResult.action.body, /1000m.*실제 활동 25분/);
  for (const result of [cycleResult, swimResult]) {
    assert.match(result.action.body, /수행 구성이나 목적을 달리했던/);
    assert.doesNotMatch(result.action.body, /크게 늘|최근 짧게|회복 완료|체력.*회복했|다시.*210W|20분.*맞추/);
    assert.equal(result.question, null);
  }
});

test("segment task expansion at unchanged whole time returns to an established task without inventing skill recovery", () => {
  for (const family of ["team", "mixed"]) {
    const { state } = example(family, 1);
    for (const date of ["2026-09-18", "2026-09-25"]) {
      const segment = state.days[date].sessions[0].details.segments.find(part => typeof part.reps === "number");
      segment.reps *= 1.6;
    }
    const result = row(state);
    assert.equal(result.action.kind, "return-established-work");
    assert.match(result.action.body, /구간 과제가 늘었던/);
    assert.doesNotMatch(result.action.body, /기술.*회복했|경기 실력.*회복/);
    const target = state.days[currentDate].sessions[0].details.segments.find(part => typeof part.reps === "number");
    assert.ok(result.action.body.includes(target.label));
    assert.ok(result.action.body.includes(`${target.reps}회`));
  }
});

test("returning one session to original work cannot hide a newly expanded week of repeated sessions", () => {
  for (const family of timeFamilies) for (const factor of [1.6, 0.6]) {
    const { state, add, original } = example(family, factor);
    add("2026-09-28"); add("2026-09-28", 1, "second"); add("2026-09-30"); add("2026-09-30", 1, "second"); add(currentDate, 1, "second");
    const result = row(state);
    assert.ok(result.comparison.observations.some(item => item.kind === "established-work-return"));
    assert.equal(result.action.kind, "consolidate-volume", family);
    assert.ok(result.action.body.includes(`익숙한 ${original.durationMin}분 구성`));
  }
});

test("a returned strength duration cannot replace the current actual sets with a time-based progression task", () => {
  const { state } = example("strength");
  state.training = { records: [{ id: "current-sets", date: currentDate, exercises: [{ id: "bench-current", exerciseId: "bench-press",
    sets: [{ id: "actual-current-set", marker: null, loadKg: 60, reps: 7, rir: null }] }] }] };
  const before = structuredClone(state), result = row(state);
  assert.ok(result.comparison.observations.some(item => item.kind === "established-work-return"));
  assert.equal(result.action.kind, "time-record");
  assert.match(result.action.body, /같은 날짜의 세트 일지.*실제 수행/);
  assert.doesNotMatch(result.action.body, /시간·거리·강도 중 하나.*다음 과제/);
  assert.deepEqual(state, before);
});

test("reduced-work observations name only the actual duration, distance and moving-time changes", () => {
  const make = (sport, details) => {
    const { state } = example(sport, 1);
    for (const date of ["2026-09-18", "2026-09-25"]) delete state.days[date];
    for (const date of ["2026-09-01", "2026-09-04", currentDate]) state.days[date].sessions[0].details = {
      label: "측정된 구성", intent: "regular", format: "continuous", conditions: "usual", ...details(date === currentDate) };
    state.days[currentDate].sessions[0].durationMin *= 0.5;
    return { state, result: row(state) };
  };
  const time = make("team", () => ({}));
  assert.equal(time.result.action.kind, "reduced-work");
  assert.match(time.result.assessment, /전체 시간 60분 → 30분/);
  assert.doesNotMatch(time.result.assessment, /시간·거리|거리.*줄|거리.*낮|실제 활동시간/);
  const both = make("running", reduced => ({ distanceM: reduced ? 2000 : 5000 }));
  assert.equal(both.result.action.kind, "reduced-work");
  assert.match(both.result.assessment, /전체 시간 30분 → 15분.*거리 5km → 2km/);
  assert.doesNotMatch(both.result.assessment, /실제 활동시간/);
  const moving = make("swimming", reduced => ({ distanceM: reduced ? 500 : 1000, movingMin: reduced ? 10 : 25,
    stroke: "자유형", environment: "pool", poolLengthM: 25 }));
  assert.equal(moving.result.action.kind, "reduced-work");
  assert.match(moving.result.assessment, /전체 시간 30분 → 15분.*거리 1000m → 500m.*실제 활동시간 25분 → 10분/);
  for (const { state, result } of [time, both, moving]) {
    assert.doesNotMatch(result.assessment, /생리.*부담|시간·거리 부담|체력.*퇴보|건강.*회복/);
    assert.equal(result.actual.durationMin, state.days[currentDate].sessions[0].durationMin);
  }
});

test("a time constraint is a reported purpose, not proof that a matching full session was shortened", () => {
  for (const family of timeFamilies) {
    const { state, original } = example(family, 1), current = state.days[currentDate].sessions[0];
    current.details.intent = "time-limited";
    const before = structuredClone(state), result = row(state);
    assert.equal(result.action.kind, "time-limited");
    assert.equal(result.actual.durationMin, original.durationMin);
    assert.match(result.action.body, /시간이 부족한 날로 남겼어요/);
    assert.match(result.action.body, /못 한 운동이 있어도.*보충하지/);
    assert.doesNotMatch(result.action.body, /짧게 마친 날|시간 때문에 줄인|빠진 .*채워|미완료/);
    assert.deepEqual(state, before);
  }
});

test("current health, purpose, event and technique still outrank the factual return configuration", () => {
  for (const family of timeFamilies) for (const [kind, change] of [
    ["stop", value => { value.coachCheckin = { pain: "stop" }; }],
    ["stop", value => { value.coachCheckin = { illness: "active" }; }],
    ["illness-return", value => { value.coachCheckin = { illness: "recovering" }; }],
    ["current-recovery", value => { value.coachCheckin = { fatigue: "high" }; }],
    ["deload", value => { value.sessions[0].details.intent = "deload"; }],
    ["technique", value => { value.sessions[0].details.intent = "technique"; }],
    ["post-event", value => { value.sessions[0].details.format = "race"; }]
  ]) {
    const { state } = example(family); change(state.days[currentDate]);
    const result = row(state);
    assert.equal(result.action.kind, kind, `${family}/${kind}`);
    if (["stop", "illness-return", "deload", "post-event"].includes(kind)) assert.deepEqual(result.alternatives, []);
    assert.doesNotMatch(result.action.body, /회복 완료|체력.*회복했/);
  }
});
