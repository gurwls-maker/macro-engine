"use strict";

const S = require("../../src/storage.js");
const TS = require("../../src/training-store.js");
const T = require("../../src/training.js");
const N = require("../../src/nutrition.js");
const I = require("../../src/insights.js");

const START = "2026-09-07";
const END = I.shiftDate(START, 27);
const SESSION_OFFSETS = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25];
const FAMILIES = ["strength", "running", "cycling", "swimming", "team", "mixed", "walking"];
const FAMILY_LABELS = { strength: "보디빌딩·근력", running: "달리기", cycling: "자전거", swimming: "수영", team: "구기", mixed: "복합·HYROX", walking: "걷기" };
const BRANCHES = ["gradual", "downshift", "interruption", "technique-volume"];
const REQUIREMENT_CATALOG = Object.freeze([
  { id: "gradual", prototype: "gradual", tags: ["gradual-progress", "whole-work", "independent-progress"], note: "점진적 진행을 하고 있다. 최고 한 세트뿐 아니라 뒤 수행과 독립 종목의 다음 선택을 함께 봐줘." },
  { id: "plateau-regular", prototype: "gradual", tags: ["plateau", "whole-work-stable", "unknown-rir"], fixedBaseline: true, note: "한 달 동안 같은 전체 구성을 반복했고 특별히 기술 연습이나 디로드를 계획한 것은 아니다. 이미 수행한 기록에서 한 가지 변화와 다음 확인을 정해줘." },
  { id: "plateau-technique", prototype: "gradual", tags: ["plateau", "technique-priority", "unknown-rir"], fixedBaseline: true, intent: "technique", note: "같은 수행을 반복 중이며 지금은 기법과 제어가 우선이다. 기록이 같다는 이유만으로 최대 한계나 근성장 중단으로 정하지 말아줘." },
  { id: "unexpected-decline", prototype: "downshift", tags: ["unexpected-decline", "same-reduced-work"], unplanned: true, note: "반복과 작업량 감소는 의도한 것이 아니었다. 이미 수행한 전체 기록에서 유지되는 구간과 다시 확인할 구간을 나눠줘." },
  { id: "planned-deload", prototype: "downshift", tags: ["intentional-deload", "same-reduced-work"], intent: "deload", note: "이번 감소는 계획한 디로드였다. 같은 숫자의 미의도 감소와 다르게 판단하고 보충 훈련을 강요하지 말아줘." },
  { id: "unplanned-same-downshift", prototype: "downshift", tags: ["unexpected-decline", "same-reduced-work"], unplanned: true, note: "작업량이 줄었지만 디로드를 계획한 것은 아니다. 식사가 일부만 기록됐다는 이유로 영양 부족을 원인으로 확정하지 말아줘." },
  { id: "illness-active", prototype: "interruption", tags: ["illness-active", "same-return-work", "return"], illness: "active", note: "현재 몸살 증상이 남아 있다고 보고한다. 회복이 끝났다고 보지 말고 오늘 운동 부담과 도움을 받아야 하는 조건을 먼저 정해줘." },
  { id: "illness-recovering", prototype: "interruption", tags: ["illness-recovering", "same-return-work", "return"], illness: "recovering", note: "몸살 뒤 회복 중이라고 보고한다. 완치 판정이나 예전 부담 자동 복귀 없이 실제 복귀 기록에서 다음 행동을 정해줘." },
  { id: "travel-gap", prototype: "interruption", tags: ["travel", "unrecorded-gap", "equipment-switch", "route-switch"], note: "출장 중 기록이 비었다. 기록 없는 날을 휴식·운동량 없음·섭취 없음으로 채우지 말고 다른 장비나 경로의 기록을 구분해줘." },
  { id: "poor-sleep", prototype: "downshift", tags: ["poor-sleep", "same-sleep-work", "recovery"], sleep: "poor", unplanned: true, note: "최근 수면이 좋지 않고 피로도 높다고 보고했다. 오늘 기록의 변화와 함께 조정하되 수면 때문에 생긴 저하로 확정하지 말아줘." },
  { id: "good-sleep-counterfactual", prototype: "downshift", tags: ["good-sleep", "same-sleep-work", "unexpected-decline"], sleep: "good", unplanned: true, note: "최근 수면은 좋다고 보고했다. 감소한 숫자는 수면이 나쁜 비교 사례와 같지만 수면 원인으로 설명하지 말아줘." },
  { id: "recent-load-fatigue", prototype: "technique-volume", tags: ["recent-load", "fatigue-high", "volume-surge"], fatigue: "high", note: "최근 작업량을 갑자기 늘렸고 체감 피로도 높다고 보고한다. 단일 주간을 과훈련 진단으로 만들지 않고 다음 부담 선택을 정해줘." },
  { id: "sharp-improvement", prototype: "technique-volume", tags: ["apparent-rapid-improvement", "same-fast-performance"], usualTechnique: true, note: "표면적 수행 숫자가 갑자기 좋아졌다. 평소 기법과 조건을 유지했다고 보고하지만 이 기록을 성장량이나 최대 능력 확정으로 바꾸지 말아줘." },
  { id: "volume-surge", prototype: "technique-volume", tags: ["volume-surge", "mixed-workload"], note: "이번에는 작업 시간·세트가 급증했다. 최고 숫자만으로 다음 부하까지 올리기보다 현재 총 작업을 함께 평가해줘." },
  { id: "time-limited", prototype: "downshift", tags: ["time-limited", "planned-vs-actual"], intent: "time-limited", note: "시간이 부족해 의도적으로 계획 일부만 했다. 실제 수행 감소를 실패로 규정하거나 다음 날 몰아서 보충하라고 하지 말아줘." },
  { id: "context-change", prototype: "technique-volume", tags: ["technique-rom-change", "conditions-change", "same-fast-performance"], changedConditions: true, note: "더 좋은 숫자가 나왔지만 가동범위·기법 또는 장비·코스·수영 측정 조건도 바뀌었다. 평소 조건의 능력 향상과 구분해줘." },
  { id: "multisport-transition", prototype: "interruption", tags: ["sport-goal-transition", "mixed-workload", "planned-vs-actual"], transition: true, note: "기존 종목에서 복합 종목 수행으로 목적을 전환 중이다. 기존 기록은 보존하되 새로운 목적에 맞춰 다음 선택을 연결해줘." },
  { id: "pain-stop", prototype: "interruption", tags: ["pain-stop", "same-return-work", "return"], pain: "stop", note: "현재 운동 중 멈춰야 할 정도의 통증을 보고한다. 기록의 숫자나 목표가 좋다는 이유로 계속 수행하거나 증량하지 말아줘." }
]);
const SCHEMA_LIMITS = [
  "legacy-activity 검증은 종목·시간·범주 강도만 전달하며 달리기·걷기에만 속도·경사를 저장한다.",
  "기본 검증은 저장 스키마의 선택 입력인 거리·심박·파워·RPE·구간·질병·수면시간을 실제 자기보고로 전달한다.",
  "기법·ROM·기상·수면의 원인이 결과를 만든 정도는 입력값만으로 확정하지 않는다.",
  "걷기는 실제 활동으로 지원되지만 현재 프로필 주종목에 걷기 선택값은 없어 주종목 none인 사람의 걷기 기록으로 재현한다.",
  "프로필 변경의 유효시점은 fixture timeline으로 재현하며 앱의 완료 목표 snapshot은 그대로 보존한다."
];

function profile(sport, changes = {}) {
  return { sex: "male", age: 32, heightCm: 178, weightKg: 78, bodyFatPct: null, bodyFatWeightKg: null,
    bodyFatDate: null, bodyFatMethod: "unknown", trainingYears: 4, sport: sport === "walking" ? "none" : sport, goal: "performance", activity: "light",
    healthContext: "general", proteinPreference: "standard", ...changes };
}
function emptyDay(date) {
  return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown",
    carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
}
function movement(id, exerciseId, vector, changes = {}) {
  const item = T.catalog.find(row => row.id === exerciseId);
  const perSide = item?.equipment === "dumbbell";
  return { id, rawName: item?.label || exerciseId, exerciseId, equipmentKey: `synthetic/${exerciseId}/a`,
    loadConvention: perSide ? "per-side" : item?.equipment === "bodyweight" ? "bodyweight" : "total",
    loadRole: "external", durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: "",
    sets: vector.map(([loadKg, reps], index) => ({ id: `${id}:s:${index}`, loadKg, reps, marker: null, rir: null })), ...changes };
}
function record(id, date, exercises, changes = {}) {
  return { id, date, time: "18:00", label: "합성 전신", durationMinutes: 60,
    reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: [], revision: null },
    exercises, notes: "", effort: null, pain: null, sequence: { order: "listed", structure: "straight" }, ...changes };
}
function strengthExercises(id, week, branch, offset) {
  let bench = [[80, 8], [80, 8], [80, 8]], squat = [[105, 6], [105, 6], [105, 6]], row = [[65, 10], [65, 10], [65, 10]];
  if (week > 0 && branch === "gradual") {
    if (week === 1) bench = [[80, 9], [80, 8], [80, 8]];
    if (week === 2) { bench = [[90, 4], [80, 7], [80, 5]]; row = [[67.5, 10], [67.5, 10], [67.5, 10]]; }
    if (week === 3) { bench = [[90, 4], [80, 8], [80, 7]]; row = [[67.5, 10], [67.5, 10], [67.5, 10]]; }
  }
  if (week === 1 && branch === "downshift") { bench = [[80, 8], [80, 6]]; squat = [[105, 6], [105, 4]]; }
  if (week === 2 && branch === "downshift") { bench = [[55, 8], [55, 8]]; squat = [[70, 6], [70, 6]]; row = [[45, 10], [45, 10]]; }
  if (week === 2 && branch === "interruption") { bench = [[60, 8], [60, 8]]; squat = [[80, 6], [80, 6]]; row = [[50, 10], [50, 10]]; }
  if (branch === "technique-volume" && week === 1) bench = [[95, 8], [95, 8], [95, 8]];
  if (branch === "technique-volume" && week === 2) { bench = Array.from({ length: 6 }, () => [80, 8]); squat = Array.from({ length: 5 }, () => [105, 6]); }
  const exercises = [movement(`${id}:bench`, "bench_press", bench), movement(`${id}:squat`, "squat", squat), movement(`${id}:row`, "barbell_row", row)];
  if (branch === "interruption" && week === 1) {
    exercises[0] = movement(`${id}:press-b`, "machine_chest_press", [[40, 10], [40, 10]], { equipmentKey: "synthetic/travel-machine/b" });
    exercises[1].equipmentKey = "synthetic/travel-rack/b";
  }
  if (branch === "technique-volume" && week === 1) exercises[0].notes = "오늘은 가동범위를 줄인 반복. 평소 전체 가동범위 기록과 직접 비교하지 말 것.";
  if (branch === "technique-volume" && week === 3) {
    exercises.reverse();
    if (offset === 25) exercises.find(ex => ex.exerciseId === "bench_press").coachingAnswer = TS.createCoachingAnswer(exercises.find(ex => ex.exerciseId === "bench_press"), "load-change", "planned");
  }
  return exercises;
}
function activity(id, sport, week, branch) {
  const durations = { strength: 60, running: 30, cycling: 45, swimming: 30, team: 60, mixed: 60, walking: 25 };
  let durationMin = durations[sport], intensity = "moderate";
  if (branch === "gradual" && week >= 2) durationMin += sport === "team" ? 10 : 5;
  if (branch === "downshift" && week === 1) { durationMin = Math.round(durationMin * 0.65); intensity = "easy"; }
  if (branch === "downshift" && week === 2) { durationMin = Math.round(durationMin * 0.5); intensity = "easy"; }
  if (branch === "interruption" && week === 2) { durationMin = Math.round(durationMin * 0.65); intensity = "easy"; }
  if (branch === "technique-volume" && week === 2) { durationMin = Math.round(durationMin * 1.6); intensity = "hard"; }
  const result = { id, sport, durationMin, intensity };
  if (sport === "running") result.cardio = { environment: "outdoor", speedKmh: branch === "technique-volume" && week === 1 ? 11 : 10, gradePct: 0 };
  if (sport === "walking") result.cardio = { environment: "outdoor", speedKmh: 5, gradePct: 0 };
  return result;
}
function detailsFor(session, week, branch, id) {
  const rate = { running: 10000 / 60, cycling: 26000 / 60, swimming: 1000 / 30, walking: 5000 / 60 }[session.sport];
  const result = { label: `${FAMILY_LABELS[session.sport]} 실제 수행`, intent: "regular", format: session.sport === "mixed" ? "hybrid" : session.sport === "team" ? "practice" : "continuous",
    conditions: "usual", notes: "합성 자기보고이며 측정된 최대 능력이나 의료 평가가 아님." };
  if (rate) result.distanceM = Math.round(session.durationMin * rate);
  result.movingMin = session.sport === "swimming" ? Math.max(1, session.durationMin - 5) : session.durationMin;
  result.effortRpe = session.intensity === "easy" ? 4 : session.intensity === "hard" ? 8 : 6;
  if (session.sport !== "strength") result.avgHeartRateBpm = session.intensity === "easy" ? 125 : session.intensity === "hard" ? 160 : 145;
  if (session.sport === "cycling") { result.avgPowerW = branch === "gradual" && week >= 2 ? 165 : 155; result.equipmentKey = "synthetic/cycle-meter/a"; }
  if (session.sport === "swimming") { result.stroke = "자유형"; result.poolLengthM = 25; result.environment = "pool"; }
  if (["running", "cycling", "walking"].includes(session.sport)) result.routeKey = branch === "interruption" && week === 1 ? "synthetic/travel-route/b" : "synthetic/flat-route/a";
  if (session.sport === "team") result.segments = [{ id: `${id}:passes`, label: "기록한 패스 반복", kind: "other", durationMin: 10, reps: 30 }];
  if (session.sport === "mixed") {
    result.sequenceConfirmed = true;
    result.segments = [
      { id: `${id}:run`, label: "달리기 구간", kind: "run", durationMin: 12, distanceM: 2000 },
      { id: `${id}:row`, label: "로잉 구간", kind: "row", durationMin: 10, distanceM: 2000 },
      { id: `${id}:carry`, label: "파머 캐리 구간", kind: "carry", durationMin: 8, distanceM: 200, loadKg: 20 },
      { id: `${id}:station`, label: "월볼 구간", kind: "strength", durationMin: 10, reps: 40, loadKg: 6 }
    ].map(segment => session.durationMin < 40 ? { ...segment, durationMin: Math.floor(segment.durationMin * session.durationMin / 40) } : segment);
    if (branch === "technique-volume" && week === 3) result.segments.reverse();
  }
  return result;
}
function eventFor(branch, week) {
  if (!week) return { tags: ["shared-baseline", "unknown-rir"], note: "첫 주는 같은 조건으로 반복한 실제 기록. 세트의 한계 여부는 별도 입력하지 않았다." };
  if (branch === "gradual") return { tags: week === 2 ? ["new-heavy", "independent-progress"] : ["working-progress", "recent-vs-long-term"], note: "종목별로 한 가지를 바꾸며 수행을 확인했다. 이전 최고를 반드시 다시 채우려는 목적은 아니다." };
  if (branch === "downshift" && week === 1) return { tags: ["poor-sleep", "time-limited", "planned-vs-actual"], note: "이번 주는 잠이 부족하고 운동 시간이 짧아 계획보다 적게 했다. 일부 기록 감소를 실패라고 정하지 말 것." };
  if (branch === "downshift" && week === 2) return { tags: ["intentional-deload", "nutrition-partial"], note: "이번 주의 감소는 의도한 부담 조절. 운동을 못 해낸 기록이나 다음 날 보충할 빚이 아니다." };
  if (branch === "downshift") return { tags: ["regular-after-deload", "return-to-baseline"], note: "의도한 가벼운 주간 뒤 평소 구성으로 돌아왔다." };
  if (branch === "interruption" && week === 1) return { tags: ["travel", "unrecorded-gap", "equipment-switch", "route-switch"], note: "출장으로 일부 날짜를 기록하지 않았다. 그 날짜에 쉬었거나 아무것도 먹지 않았다고 확인한 것은 아니다. 다른 장비나 경로를 쓴 날도 있다." };
  if (branch === "interruption" && week === 2) return { tags: ["illness-recovering", "pain", "return"], note: "몸살 뒤 회복 중이라고 본인이 보고했다. 불편한 동작은 줄였으며 병이 완치됐다거나 손상 종류가 확인됐다는 뜻은 아니다." };
  if (branch === "interruption") return { tags: ["sport-goal-transition", "nutrition-missing", "return"], note: "운동 목적을 근력 수치 중심에서 복합 운동 수행으로 옮겨 보려 한다. 복귀했다고 자동으로 과거 부담을 모두 적용하지 않는다." };
  if (branch === "technique-volume" && week === 1) return { tags: ["technique-rom-change", "apparent-rapid-improvement", "conditions-change"], note: "기법·가동범위 또는 코스 조건을 바꾼 주간. 표면적 숫자 향상을 같은 기술의 능력 상승으로 취급하지 말 것." };
  if (branch === "technique-volume" && week === 2) return { tags: ["volume-surge", "mixed-workload"], note: "세션의 총 작업량이 갑자기 늘었다. 시간·반복·중량과 종목별 노출을 같은 한 점수로 합치지 말 것." };
  return { tags: ["order-change", "planned-vs-actual", "purpose-change"], note: "평소와 실제 수행 순서를 바꾸고 동작 제어를 우선했다. 같은 숫자의 목표 계획과 실제 관찰은 별개다." };
}
function makePlanning(scenario, records) {
  if (!records.length) return TS.createEmpty().planning;
  const first = records[0];
  const prescription = { id: `${scenario.id}:plan-day`, label: "기준 전신 계획", exercises: first.exercises.slice(0, 3).map(ex => ({
    id: `${scenario.id}:target:${ex.exerciseId}`, exerciseId: ex.exerciseId, label: ex.rawName, sets: 3, repsMin: 6, repsMax: 10,
    rir: 2, restSeconds: 120, loadKg: ex.sets[0]?.loadKg ?? null, equipmentKey: ex.equipmentKey, loadConvention: ex.loadConvention })) };
  if (!prescription.exercises.length) return TS.createEmpty().planning;
  const program = { id: `${scenario.id}:program`, name: "합성 기준 계획", createdAt: `${START}T00:00:00.000Z`, source: "user", days: [prescription] };
  return { ...TS.createEmpty().planning, activeProgramId: program.id, programs: [program], schedule: records.map(row => ({
    id: `${scenario.id}:assignment:${row.date}`, date: row.date, programId: program.id, dayId: prescription.id,
    prescription: structuredClone(prescription), recordId: row.id, status: "performed", adjustment: null })) };
}
function buildScenario(family, branch, changes = {}) {
  const id = changes.id || `${family}-${branch}`, nutritionMode = changes.nutritionMode || (branch === "interruption" ? "none" : branch === "downshift" ? "partial" : "complete");
  const firstProfile = profile(family, changes.profile || {});
  const scenario = { id, family, branch, label: `${FAMILY_LABELS[family]} / ${branch}`, baselineGroup: `${family}:same-first-week`,
    syntheticOnly: true, start: START, end: END, schemaLimitations: [...SCHEMA_LIMITS],
    profileTimeline: [{ date: START, profile: firstProfile }], events: [], richActivityDetails: [], richCheckins: [], checkpoints: [], checkpointReports: [], state: S.createEmpty() };
  scenario.state.profile = structuredClone(firstProfile); scenario.state.training = TS.createEmpty();
  scenario.state.trackingScope = changes.trackingScope || (nutritionMode === "none" ? "training" : "both");
  scenario.state.updatedAt = `${END}T23:00:00.000Z`;
  if (branch === "interruption") scenario.profileTimeline.push({ date: I.shiftDate(START, 21), profile: { ...firstProfile, sport: "mixed", goal: "performance" } });
  if (changes.goalTransition) scenario.profileTimeline.push({ date: I.shiftDate(START, 14), profile: { ...firstProfile, goal: "maintain" } });
  for (let offset = 0; offset < 28; offset++) {
    const date = I.shiftDate(START, offset), week = Math.floor(offset / 7), event = eventFor(branch, week), isTrainingDay = SESSION_OFFSETS.includes(offset);
    const gap = branch === "interruption" && [9, 11].includes(offset);
    const mealsRecorded = nutritionMode === "complete" || nutritionMode === "partial" && offset % 2 === 0;
    const existedEvidence = isTrainingDay || mealsRecorded || [3, 10, 17, 24].includes(offset);
    if (!existedEvidence && offset !== 27) continue;
    const day = emptyDay(date); day.note = existedEvidence ? event.note : "";
    if (mealsRecorded) day.meals.push({ id: `${id}:meal:${offset}`, name: nutritionMode === "partial" ? "일부 식사(합성)" : "하루 식사 합계(합성)",
      protein: nutritionMode === "partial" ? 55 : 150, carbs: nutritionMode === "partial" ? 90 : changes.surplus && week >= 2 ? 390 : changes.deficit ? 210 : 300,
      fat: nutritionMode === "partial" ? 20 : 75, otherKcal: 0, alcoholG: 0 });
    if (isTrainingDay && !gap && changes.trackingScope !== "nutrition") {
      const session = activity(`${id}:activity:${offset}`, family, week, branch); day.sessions.push(session);
      scenario.richActivityDetails.push({ date, sessionId: session.id, details: detailsFor(session, week, branch, session.id) });
      if (family === "strength" || family === "mixed") {
        const exercises = strengthExercises(`${id}:record:${offset}`, week, branch, offset);
        const rec = record(`${id}:record:${offset}`, date, exercises, { label: `${FAMILY_LABELS[family]} 실제 세션`, durationMinutes: session.durationMin, notes: event.note });
        if (branch === "downshift" && week === 1) rec.trainingIntent = "time-limited";
        if (branch === "downshift" && week === 2) rec.trainingIntent = "deload";
        if (branch === "interruption" && week >= 2) rec.trainingIntent = "return";
        if (branch === "technique-volume" && [1, 3].includes(week)) rec.trainingIntent = "technique";
        if (branch === "interruption" && week === 2 && offset === 16) rec.pain = "stop";
        else if (branch === "interruption" && week === 2) rec.pain = "mild";
        scenario.state.training.records.push(rec);
      }
    }
    if (existedEvidence && offset >= 7 && branch === "downshift") day.coachCheckin = { energy: week === 1 ? "low" : "okay", hunger: "okay", sleep: week === 1 ? "poor" : "okay", performance: week === 1 ? "down" : "steady", trainingPlan: isTrainingDay ? "planned" : "rest" };
    if (existedEvidence && offset >= 14 && branch === "interruption") {
      day.coachCheckin = { energy: week === 2 ? "low" : "okay", hunger: "okay", sleep: "okay", performance: week === 2 ? "down" : "steady" };
      scenario.richCheckins.push({ date, fields: { illness: week === 2 ? "recovering" : "none", pain: offset === 16 ? "stop" : week === 2 ? "mild" : "none", fatigue: week === 2 ? "high" : "usual", interruptionReason: "illness" } });
    }
    if (existedEvidence && week === 1 && branch === "downshift") scenario.richCheckins.push({ date, fields: { sleepHours: 5, fatigue: "high", pain: "none", illness: "none" } });
    if (existedEvidence && week === 1 && branch === "interruption") scenario.richCheckins.push({ date, fields: { interruptionReason: "travel" } });
    if (!changes.noMeasurements && (isTrainingDay || [3, 10, 17, 24].includes(offset))) day.weightKg = changes.rapidWater && offset === 10 ? 80.8 : changes.surplus ? 78 + week * 1.2 : changes.deficit ? 78 - week * 0.25 : 78;
    if (changes.rapidWater && [9, 11].includes(offset)) day.weightKg = offset === 9 ? 78 : 78.1;
    if (changes.stableBody && [0, 7, 14, 21].includes(offset)) { day.bodyFatPct = 20; day.bodyFatMethod = "bia"; }
    if (changes.measurementConflict && [10, 17].includes(offset)) {
      day.bodyFatPct = offset === 10 ? 22 : 17; day.bodyFatMethod = offset === 10 ? "bia" : "dxa";
      day.note += offset === 10 ? " 식후·수분 조건이 평소와 다른 BIA 측정." : " 이전 BIA와 다른 방법인 DXA 기록이며 둘의 차이를 지방 변화로 단정하지 말 것.";
    }
    if (mealsRecorded && nutritionMode === "complete") {
      const activeProfile = scenario.profileTimeline.filter(item => item.date <= date).at(-1).profile;
      day.planSnapshot = N.calculatePlan(activeProfile, day, Object.values(scenario.state.days));
      day.planSnapshot.context.goal = activeProfile.goal; day.complete = true;
    }
    scenario.state.days[date] = day;
    if (isTrainingDay) scenario.events.push({ date, tags: event.tags, note: event.note, recorded: !gap, sourcePaths: [`days.${date}.note`, `days.${date}.sessions`] });
  }
  scenario.state.training.planning = makePlanning(scenario, scenario.state.training.records);
  scenario.state.profile = structuredClone(scenario.profileTimeline.at(-1).profile);
  for (const offset of [4, 11, 18, 27]) {
    const date = I.shiftDate(START, offset), week = Math.floor(offset / 7), event = eventFor(branch, week);
    scenario.checkpoints.push({ id: `${id}:week:${week + 1}`, date, week: week + 1, focusTags: event.tags,
      question: `${event.note} 최근 기록 전체와 식사·몸 상태를 함께 보고 다음 운동이나 식사에서 무엇을 유지하고 무엇을 바꾸면 좋을까? 없는 식사나 측정값을 채워 넣지 말고, 중요한 다음 행동부터 말해줘.`,
      requiredMeaning: event.tags.map(tag => ({ tag, status: "requires-human-review" })) });
  }
  scenario.state = S.validateState(scenario.state);
  return scenario;
}
function buildCatalogScenario(item) {
  const scenario = buildScenario("strength", "gradual", { id: `catalog-${item.id}`, nutritionMode: "none" });
  const loaded = ["barbell", "dumbbell", "machine", "cable", "smith"].includes(item.equipment);
  const timeOnly = ["cardio", "mobility"].includes(item.pattern);
  scenario.label = `전 종목 월간 순회 / ${item.label}`; scenario.catalogExerciseId = item.id;
  scenario.baselineGroup = `${item.id}:same-first-week`;
  for (const rec of scenario.state.training.records) {
    const week = Math.floor((Date.parse(rec.date + "T00:00:00Z") - Date.parse(START + "T00:00:00Z")) / 604800000), reps = week === 1 ? 9 : 8;
    const ex = movement(`${rec.id}:${item.id}`, item.id, timeOnly ? [] : Array.from({ length: 3 }, (_, index) => [loaded ? week >= 2 ? 42.5 : 40 : null, week === 3 && index === 2 ? reps - 1 : reps]),
      { rawName: item.label, loadRole: loaded ? "external" : "unknown", durationMinutes: timeOnly ? 15 : null });
    rec.exercises = [ex]; rec.label = `${item.label} 합성 일지`;
  }
  scenario.state.training.planning = TS.createEmpty().planning;
  scenario.state = S.validateState(scenario.state);
  return scenario;
}
function buildCounterfactual(family, specification) {
  const scenario = buildScenario(family, specification.prototype, { id: `${family}-${specification.id}` });
  scenario.branch = specification.id; scenario.label = `${FAMILY_LABELS[family]} / ${specification.id}`;
  scenario.requirementIds = specification.tags.slice();
  scenario.counterfactualGroups = specification.tags.filter(tag => tag.startsWith("same-")).map(tag => `${family}:${tag}`);
  if (!specification.transition) scenario.profileTimeline = scenario.profileTimeline.slice(0, 1);
  const transitionSport = family === "mixed" ? "running" : "mixed";
  if (specification.transition) scenario.profileTimeline.at(-1).profile.sport = transitionSport;
  for (const [date, day] of Object.entries(scenario.state.days)) {
    const week = Math.floor((Date.parse(date + "T00:00:00Z") - Date.parse(START + "T00:00:00Z")) / 604800000);
    if (!week) continue;
    day.note = specification.note;
    if (specification.fixedBaseline) for (const session of day.sessions) Object.assign(session, activity(session.id, family, 0, "gradual"));
    if (specification.sleep) day.coachCheckin = { energy: date === END ? null : "okay", hunger: date === END ? null : "okay", sleep: specification.sleep, performance: date === END ? null : "steady" };
    if (specification.transition && week === 3) for (const session of day.sessions) {
      delete session.cardio;
      Object.assign(session, activity(session.id, transitionSport, 0, "gradual"));
    }
    for (const row of scenario.state.training.records.filter(row => row.date === date)) {
      row.notes = specification.note;
      if (specification.unplanned || specification.usualTechnique) delete row.trainingIntent;
      if (specification.intent) row.trainingIntent = week === 3 && specification.intent === "deload" ? "regular" : specification.intent;
      if (specification.pain) row.pain = specification.pain;
      if (specification.illness) { row.trainingIntent = "return"; row.pain = null; }
      if (specification.fixedBaseline) row.exercises = strengthExercises(row.id, 0, "gradual", 0);
      if (specification.usualTechnique) for (const exercise of row.exercises) exercise.notes = "평소 기법·가동범위를 유지했다고 본인이 보고함.";
      if (specification.changedConditions) for (const exercise of row.exercises) exercise.notes = "이 날은 기법·가동범위를 바꿔 수행한 기록. 평소 조건과 구분.";
    }
    const rich = scenario.richActivityDetails.filter(item => item.date === date);
    for (const entry of rich) {
      const session = day.sessions.find(item => item.id === entry.sessionId);
      if (specification.transition && week === 3) entry.details = detailsFor(session, 0, "gradual", entry.sessionId);
      entry.details.notes = specification.note;
      if (specification.intent) entry.details.intent = week === 3 && specification.intent === "deload" ? "regular" : specification.intent;
      if (specification.unplanned || specification.usualTechnique) entry.details.intent = "regular";
      if (specification.illness) entry.details.intent = "return";
      if (specification.fixedBaseline) {
        entry.details = detailsFor(session, 0, "gradual", entry.sessionId); entry.details.intent = specification.intent || "regular";
      }
      // The same improved work is reported under ordinary versus changed conditions.
      if (week === 1 && (specification.usualTechnique || specification.changedConditions)) {
        if (family === "running") { session.cardio.speedKmh = 11; entry.details.distanceM = 5500; }
        if (family === "walking") { session.cardio.speedKmh = 6; entry.details.distanceM = 2500; }
        if (family === "cycling") entry.details.avgPowerW = 200;
        if (family === "swimming") entry.details.movingMin = 20;
        if (family === "team") entry.details.segments[0].reps = 40;
        if (family === "mixed") entry.details.segments.find(segment => segment.kind === "run").durationMin = 9;
      }
      if (specification.changedConditions) {
        entry.details.conditions = "different";
        if (["running", "cycling", "walking"].includes(family)) { entry.details.routeKey = "synthetic/changed-route/c"; entry.details.environment = "different"; }
        if (family === "cycling") entry.details.equipmentKey = "synthetic/other-trainer/c";
        if (family === "swimming") { entry.details.stroke = "평영"; entry.details.poolLengthM = 50; }
      }
    }
    const checkin = {};
    if (specification.illness) { checkin.illness = specification.illness; checkin.pain = null; }
    if (specification.pain) checkin.pain = specification.pain;
    if (specification.fatigue) checkin.fatigue = specification.fatigue;
    if (specification.sleep) { checkin.sleepHours = specification.sleep === "poor" ? 5 : 8; checkin.fatigue = specification.sleep === "poor" ? "high" : "usual"; }
    if (Object.keys(checkin).length) scenario.richCheckins.push({ date, fields: checkin });
    if (date === END) scenario.checkpointReports.push({ date, kind: Object.keys(checkin).length ? "explicit-current-self-report" : "condition-unknown",
      fields: Object.keys(checkin).length ? structuredClone(checkin) : null, sourcePaths: Object.keys(checkin).length ? [`days.${date}.coachCheckin`] : [] });
    if (specification.transition && week === 3 && day.complete) {
      const activeProfile = scenario.profileTimeline.at(-1).profile;
      day.planSnapshot = N.calculatePlan(activeProfile, day, Object.values(scenario.state.days).filter(item => item.date < date));
      day.planSnapshot.context.goal = activeProfile.goal;
    }
  }
  for (const checkpoint of scenario.checkpoints) if (checkpoint.week > 1) {
    checkpoint.focusTags = specification.tags.slice();
    checkpoint.requiredMeaning = specification.tags.map(tag => ({ tag, status: "requires-human-review" }));
    checkpoint.question = `${specification.note} 최근 실제 운동·식사·체중 기록을 함께 보고 지금 가장 중요한 다음 행동을 정해줘. 계획은 실제 기록이 아니고, 입력하지 않은 식사·체성분·RIR은 모르는 상태야.`;
  }
  for (const event of scenario.events) if (event.date >= I.shiftDate(START, 7)) { event.tags = specification.tags.slice(); event.note = specification.note; }
  scenario.state.profile = structuredClone(scenario.profileTimeline.at(-1).profile);
  scenario.state = S.validateState(scenario.state);
  return scenario;
}
function buildScenarios(options = {}) {
  const core = FAMILIES.flatMap(family => REQUIREMENT_CATALOG.map(specification => buildCounterfactual(family, specification)));
  const crossDomain = [
    { id: "cross-food-only", family: "strength", nutritionMode: "complete", trackingScope: "nutrition" },
    { id: "cross-training-only", family: "running", nutritionMode: "none", trackingScope: "training" },
    { id: "cross-both-partial", family: "mixed", nutritionMode: "partial", trackingScope: "both" },
    { id: "cross-old-paired-bia", family: "strength", profile: { bodyFatPct: 20, bodyFatWeightKg: 80, bodyFatDate: "2026-01-01", bodyFatMethod: "bia" } },
    { id: "cross-stable-paired-bia", family: "cycling", stableBody: true, profile: { bodyFatPct: 20, bodyFatWeightKg: 78, bodyFatDate: START, bodyFatMethod: "bia" } },
    { id: "cross-no-measurements", family: "swimming", noMeasurements: true, nutritionMode: "partial" },
    { id: "cross-water-change", family: "running", rapidWater: true },
    { id: "cross-method-conflict", family: "mixed", measurementConflict: true },
    { id: "cross-goal-history", family: "strength", goalTransition: true, profile: { goal: "lose" } },
    { id: "cross-deficit-preserved", family: "strength", deficit: true, profile: { goal: "lose", sex: "female" } },
    { id: "cross-deficit-sleep-decline", family: "running", deficit: true, branch: "downshift", profile: { goal: "lose", sex: "female" } },
    { id: "cross-surplus-fast-weight", family: "strength", surplus: true, profile: { goal: "gain" } },
    { id: "cross-unspecified-no-composition", family: "cycling", nutritionMode: "partial", profile: { sex: "unspecified", trainingYears: null } },
    { id: "cross-illness-partial-food", family: "swimming", nutritionMode: "partial", branch: "interruption" },
    { id: "cross-no-profile", family: "team", nutritionMode: "partial", noProfile: true }
  ].map(config => {
    const scenario = buildScenario(config.family, config.branch || "gradual", config);
    scenario.requirementIds = [config.id];
    if (config.noProfile) {
      scenario.profileTimeline = [{ date: START, profile: null }]; scenario.state.profile = null;
      for (const day of Object.values(scenario.state.days)) { day.complete = false; day.planSnapshot = null; }
    }
    return scenario;
  });
  const catalog = options.includeCatalog === false ? [] : T.catalog.map(buildCatalogScenario);
  const selected = options.suite === "catalog" ? catalog : options.suite === "core" ? [...core, ...crossDomain] : [...core, ...crossDomain, ...catalog];
  return selected.map(scenario => ({ ...scenario, state: asOf(scenario, scenario.end, options) }));
}
function asOf(scenario, date, options = {}) {
  if (!S.isValidDate(date) || date < scenario.start || date > scenario.end) throw new Error("합성 snapshot 날짜 범위를 확인해 주세요.");
  const state = structuredClone(scenario.state);
  state.profile = structuredClone(scenario.profileTimeline.filter(item => item.date <= date).at(-1).profile);
  state.updatedAt = `${date}T23:00:00.000Z`;
  state.days = Object.fromEntries(Object.entries(state.days).filter(([key]) => key <= date));
  state.training.records = state.training.records.filter(row => row.date <= date);
  state.training.planning.schedule = state.training.planning.schedule.map(row => row.date > date ? { ...row, recordId: null, status: "planned" } : row);
  if (options.richActivity) {
    for (const entry of scenario.richActivityDetails.filter(item => item.date <= date)) {
      const session = state.days[entry.date]?.sessions.find(item => item.id === entry.sessionId);
      if (session) session.details = structuredClone(entry.details);
    }
    for (const entry of scenario.richCheckins.filter(item => item.date <= date)) {
      const day = state.days[entry.date];
      if (day) day.coachCheckin = { energy: null, hunger: null, sleep: null, ...day.coachCheckin, ...entry.fields };
    }
  }
  return S.validateState(state);
}

module.exports = { START, END, SESSION_OFFSETS, FAMILIES, BRANCHES, REQUIREMENT_CATALOG, SCHEMA_LIMITS, buildScenarios, buildScenario, buildCounterfactual, buildCatalogScenario, asOf };
