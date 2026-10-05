const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../src/nutrition.js");
const Coach = require("../src/coach.js");
const Conversation = require("../src/coach-conversation.js");

const profile = { sex: "female", age: 32, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatMethod: "unknown", bodyFatDate: null, trainingYears: 2, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
const day = { date: "2026-10-05", complete: false, sessions: [], meals: [{ id: "synthetic-meal", name: "합성 식사", protein: 30, carbs: 60, fat: 15, otherKcal: 0, alcoholG: 0 }], coachCheckin: { energy: "okay", hunger: "okay", sleep: "good" } };
function analysis() {
  const previous = { date: "2026-09-26", loadKg: 50, reps: 10, rir: null, equipmentKey: "fixture-machine-a", loadConvention: "as-recorded", rawName: "합성 벤치 프레스" };
  const current = { ...previous, date: "2026-10-03", reps: 12 };
  return {
    windowStart: "2026-09-08", windowEnd: day.date,
    coverage: { recordCount: 2, daysWithRecords: 2, unknownDays: 26, workingSets: 6, unknownEffortSets: 6, unresolvedExercises: 1 },
    lastSession: { date: "2026-10-03", time: "10:00", label: "Synthetic A", totalSets: 4, workingSets: 3, durationMinutes: 35 }, sessions: [],
    muscles: [{ id: "chest", label: "가슴", directSets: 6, indirectSets: 0, unknownEffortSets: 6 }, { id: "triceps", label: "삼두", directSets: 0, indirectSets: 6, unknownEffortSets: 6 }],
    progression: [{ exerciseId: "fixture-press", label: "합성 벤치 프레스", equipmentKey: "fixture-machine-a", current, previous, status: "incomparable", reason: "RIR이 미확인이라 같은 노력 수준인지 확인할 수 없어요.", observed: { current, previous, description: "기록상 대표 세트 차이" } }],
    recovery: { status: "insufficient", reasons: [], questions: ["최근 세트의 반복 여유를 알려 주세요."], repeatedDeclines: 0, selfReportSignals: [] }, limitations: ["합성 테스트 자료"]
  };
}
function program() {
  return { status: "ready", name: "합성 주 2회", reason: "확인된 일정과 기구 기준", days: [{ label: "A", exercises: [{ exerciseId: "fixture-press", label: "합성 프레스", sets: 3, reps: "8~12", rir: 2, restSeconds: 120 }] }], progression: "같은 기구의 실제 반복 수와 여유를 함께 확인해요.", deload: "반복되는 변화와 자기보고 확인", limitations: ["실행 전 개별 조건 확인"] };
}
function context(overrides = {}) { return { profile, day, history: [], trainingAnalysis: analysis(), program: program(), ...overrides }; }

test("local answers are deterministic, pure and explicitly bounded", () => {
  const ctx = context();
  const before = JSON.stringify(ctx);
  const first = Conversation.respond("최근 운동 기록을 알려줘", ctx);
  assert.deepEqual(Conversation.respond("최근 운동 기록을 알려줘", ctx), first);
  assert.equal(JSON.stringify(ctx), before);
  assert.equal(first.topic, "training");
  assert.match(first.text, /2026-10-03.*Synthetic A/);
  assert.match(first.text, /확인된 일지 2개/);
  assert.match(first.text, /미기록일은 휴식일로 채우지/);
  assert.equal(first.requiresPersonalReview, false);
  assert.deepEqual(first.actions, [{ action: "nav-training", label: "훈련 기록 보기" }]);
});

test("raw observed reps are useful even when physiological comparison is unavailable", () => {
  const result = Conversation.respond("벤치 중량은 늘었어?", context());
  assert.equal(result.topic, "progression");
  assert.match(result.text, /50kg × 10회.*50kg × 12회/);
  assert.match(result.text, /RIR이 미확인/);
  assert.match(result.text, /근육 증가량.*확정하지/);
  assert.equal(result.requiresPersonalReview, false);
});

test("exercise-specific questions do not silently select unrelated progression rows", () => {
  const ctx = context();
  const other = { ...ctx.trainingAnalysis.progression[0], label: "합성 스쿼트", exerciseId: "fixture-squat", current: null, previous: null, observed: { current: null, previous: null, description: "하체 기록" } };
  ctx.trainingAnalysis.progression.unshift(other);
  const result = Conversation.respond("벤치 중량 변화", ctx);
  assert.match(result.text, /벤치/);
  assert.ok(!result.text.includes("스쿼트"));
});

test("direct and indirect muscles are shown separately without growth scores", () => {
  const result = Conversation.respond("가슴과 삼두 직접 간접 세트 수", context());
  assert.equal(result.topic, "muscles");
  assert.match(result.text, /가슴: 직접 6세트, 간접 0세트/);
  assert.match(result.text, /삼두: 직접 0세트, 간접 6세트/);
  assert.match(result.text, /노력 수준 미확인 6세트/);
  assert.match(result.text, /분류 미확인 운동 1개/);
  assert.match(result.text, /효과 점수로 만들지/);
});

test("program answer describes supplied draft rather than inventing new prescription", () => {
  const result = Conversation.respond("내 루틴 알려줘", context());
  assert.equal(result.topic, "program");
  assert.match(result.text, /설정에 맞춘 초안/);
  assert.match(result.text, /3세트 × 8~12회, RIR 2, 휴식 120초/);
  assert.equal(result.requiresPersonalReview, false);
  const missing = Conversation.respond("루틴 알려줘", context({ program: null }));
  assert.equal(missing.requiresPersonalReview, true);
  assert.match(missing.text, /가능한 주당 횟수/);
});

test("unconfirmed profile blocks new programs but still allows record observations", () => {
  const ctx = context({ profile: null });
  assert.equal(Conversation.respond("루틴 만들어줘", ctx).requiresPersonalReview, true);
  assert.match(Conversation.respond("루틴 만들어줘", ctx).text, /건강 맥락/);
  assert.match(Conversation.respond("최근 운동 기록", ctx).text, /Synthetic A/);
});

test("single-session or incomplete recovery cannot produce a definitive deload", () => {
  const result = Conversation.respond("디로드 해야 해?", context());
  assert.equal(result.topic, "recovery");
  assert.equal(result.requiresPersonalReview, true);
  assert.match(result.text, /한 번의 일지.*디로드를 확정하지/);
  assert.match(result.text, /반복 여유/);
});

test("recovery watch keeps useful reasons while stopping automatic program increases", () => {
  const ctx = context();
  ctx.trainingAnalysis.recovery = { status: "watch", reasons: ["비교 가능한 기록에서 수행 저하가 반복됐어요."], questions: ["수면은 어땠나요?"], repeatedDeclines: 2, selfReportSignals: [] };
  const result = Conversation.respond("훈련 계획 알려줘", ctx);
  assert.equal(result.topic, "recovery");
  assert.match(result.text, /수행 저하가 반복/);
  assert.ok(!result.text.includes("3세트 ×"));
  assert.equal(result.requiresPersonalReview, true);
});

test("pain overrides diet and routine intents without diagnosis or replacement exercises", () => {
  const result = Conversation.respond("어깨가 아파. 운동 루틴과 감량 식사도 알려줘", context());
  assert.equal(result.topic, "pain");
  assert.equal(result.requiresPersonalReview, true);
  assert.match(result.text, /통증이 생기는 동작은 지금 중단/);
  assert.ok(!/\d+\s*(kcal|kg|세트)/.test(result.text));
  assert.ok(!result.actions.some(row => row.action === "nav-program"));
});

test("urgent symptoms do not tell the user to wait for a personal coach answer", () => {
  const result = Conversation.respond("가슴이 아프고 숨이 차요", context());
  assert.equal(result.topic, "pain");
  assert.match(result.text, /기다리지 말고 즉시 119/);
  assert.deepEqual(result.actions, []);
});

test("explicit absent pain does not override an ordinary recorded-training question", () => {
  const result = Conversation.respond("통증은 없어요. 최근 운동 기록은?", context());
  assert.equal(result.topic, "training");
});

test("recorded pain routes to safety even without pain words in the new question", () => {
  for (const status of ["stop", "review"]) {
    const ctx = context();
    ctx.trainingAnalysis.recovery = { status, pain: status === "stop" ? "stop" : "mild", reasons: ["일지에 통증이 입력됐어요."], questions: [], repeatedDeclines: 0, selfReportSignals: [] };
    assert.equal(Conversation.respond("감량 식사와 루틴", ctx).topic, "pain");
  }
});

test("current clinical context blocks new nutrition advice despite an old ready snapshot", () => {
  const planSnapshot = N.calculatePlan(profile, day);
  const complete = { ...day, complete: true, planSnapshot };
  for (const healthContext of ["clinical", "pregnancy", "breastfeeding", "eating_disorder"]) {
    const p = { ...profile, healthContext };
    const ctx = context({ profile: p, day: complete, coach: Coach.buildCoach(p, complete) });
    const result = Conversation.respond("감량 칼로리는?", ctx);
    assert.equal(result.topic, "clinical");
    assert.equal(result.requiresPersonalReview, true);
    assert.ok(!/\d+\s*(kcal|g|세트)/.test(result.text));
    assert.equal(complete.planSnapshot, planSnapshot);
  }
});

test("compound causal questions honestly require personal review with useful observed facts", () => {
  for (const prompt of ["왜 벤치 중량이 정체됐어?", "운동 수행과 식사를 동시에 바꿔줘", "운동 계획과 식사도 알려줘", "내 근육이 얼마나 성장했어?"]) {
    const result = Conversation.respond(prompt, context());
    assert.equal(result.topic, "personal-review");
    assert.equal(result.requiresPersonalReview, true);
    assert.match(result.text, /자유대화 AI가 전체 맥락을 검토한 답변은 아니/);
    assert.match(result.text, /기록/);
  }
});

test("unknown and non-string requests never masquerade as a free-form AI answer", () => {
  const result = Conversation.respond("경기 전 심리 전략을 상세 분석해줘", context());
  assert.equal(result.topic, "personal-review");
  assert.equal(result.confidence, "limited");
  assert.equal(result.requiresPersonalReview, true);
  for (const input of [null, undefined, 1, {}, " "]) assert.equal(Conversation.respond(input).topic, "empty");
  assert.equal(Conversation.respond("긴 질문".repeat(2000), context()).requiresPersonalReview, true);
});

test("food and weight replies reuse completed targets rather than current profile calculations", () => {
  const planSnapshot = N.calculatePlan(profile, day);
  const complete = { ...day, complete: true, planSnapshot };
  const ctx = context({ profile: { ...profile, weightKg: 100, goal: "gain" }, day: complete });
  const weight = Conversation.respond("체중 목표는?", ctx);
  assert.equal(weight.topic, "weight");
  assert.match(weight.text, /완료할 때 저장한/);
  const food = Conversation.respond("다음 식사에서 뭘 먹어?", ctx);
  assert.equal(food.topic, "nutrition");
  assert.ok(food.actions.every(action => action.action !== "meal-add"));
});

test("missing and malformed training input stays unknown and never renders numeric garbage", () => {
  for (const trainingAnalysis of [null, {}, { windowEnd: "2026-10-05", progression: [null, {}], muscles: [null], recovery: null }]) {
    for (const prompt of ["운동 기록", "중량 변화", "가슴 부위", "디로드"]) {
      const result = Conversation.respond(prompt, context({ trainingAnalysis }));
      assert.ok(!/NaN|Infinity|undefined/.test(result.text));
      assert.equal(typeof result.requiresPersonalReview, "boolean");
      assert.ok(Array.isArray(result.actions));
    }
  }
});

test("recovery review is not falsely described as recorded pain", () => {
  const ctx = context();
  ctx.trainingAnalysis.recovery = { status: "review", pain: "none", reasons: ["수행 저하와 피로가 반복돼 확인이 필요해요."], questions: [], repeatedDeclines: 2, selfReportSignals: ["낮은 컨디션"] };
  const result = Conversation.respond("오늘 루틴 알려줘", ctx);
  assert.equal(result.topic, "recovery");
  assert.match(result.text, /통증이나 질환이 있다고 판단하지/);
  assert.equal(result.requiresPersonalReview, true);
});

test("known bodyweight repetitions remain visible without inventing zero load", () => {
  const ctx = context();
  const row = ctx.trainingAnalysis.progression[0];
  row.current.loadKg = null;
  row.previous.loadKg = null;
  const result = Conversation.respond("중량 수행 변화", ctx);
  assert.match(result.text, /부하 미확인 × 10회.*부하 미확인 × 12회/);
  assert.ok(!result.text.includes("0kg"));
});

test("meal plans and diet plans do not accidentally select the training program", () => {
  assert.equal(Conversation.respond("오늘 식사 계획 알려줘", context()).topic, "nutrition");
  assert.equal(Conversation.respond("감량 계획 알려줘", context()).topic, "weight");
});

test("actual training API interoperates with local coach and supplied program", () => {
  const Training = require("../src/training.js");
  const records = ["2026-09-25", "2026-10-02"].map((date, index) => ({ id: `synthetic-session-${index}`, date, time: "12:00", label: "Synthetic strength", pain: "none", source: { kind: "manual" }, exercises: [{ id: `synthetic-exercise-${index}`, rawName: "벤치 프레스", exerciseId: "bench_press", equipmentKey: "fixture-barbell-a", loadConvention: "total", sets: [{ id: `synthetic-set-${index}`, loadKg: 50, reps: 10 + index, marker: null, rir: 2 }] }] }));
  const trainingAnalysis = Training.analyze(records, { date: day.date, profile, checkins: [{ date: day.date, ...day.coachCheckin, pain: "none" }] });
  const recommended = Training.recommendProgram(profile, { daysPerWeek: 2, sessionMinutes: 45, equipment: "gym", priorityMuscles: [] }, trainingAnalysis);
  const ctx = context({ trainingAnalysis, program: recommended });
  const result = Conversation.respond("벤치 중량 변화", ctx);
  assert.match(result.text, /50kg × 10회.*50kg × 11회/);
  assert.equal(result.topic, "progression");
  const built = Coach.buildCoach(profile, day, [], { trainingAnalysis, program: recommended });
  assert.deepEqual(built.context.training.coverage.trainingDates, ["2026-09-25", "2026-10-02"]);
  assert.equal(built.context.training.recovery.pain, "none");
  assert.equal(Conversation.respond("훈련 계획", ctx).topic, "program");
});

test("legacy summary-only sessions do not become verified zero-set workouts", () => {
  const ctx = context();
  ctx.trainingAnalysis.lastSession = { date: "2026-10-03", label: "Synthetic old summary", sourceKind: "legacy-ocr", totalSets: 0, workingSets: 0 };
  const result = Conversation.respond("최근 운동 기록", ctx);
  assert.match(result.text, /이전 OCR 요약/);
  assert.match(result.text, /새로 검증한 기록은 아니/);
  assert.ok(!result.text.includes("0개"));
});
