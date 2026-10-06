(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./nutrition.js") : root.MacroNutrition, node ? require("./insights.js") : root.MacroInsights,
    node ? require("./coach-context.js") : root.MacroCoachContext);
  if (node) module.exports = api;
  root.MacroCoach = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Nutrition, Insights, DecisionContext) {
  "use strict";

  const VERSION = "9.3-evidence-coach-v2";
  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const fmt = (value, digits = 0) => finite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "미확인";
  const goalNames = { lose: "체지방 감량", maintain: "체중 유지", gain: "근육 증가", recomp: "체성분 개선", performance: "운동 수행" };
  const sportNames = { none: "일상 활동", strength: "근력 운동", running: "달리기", cycling: "자전거", swimming: "수영", team: "구기 운동", mixed: "복합 운동", walking: "걷기" };
  const actionLabels = { "nav-profile": "내 기준 확인", "meal-add": "식사 기록", "session-add": "운동 시간 기록", measurement: "체중·체성분 기록", complete: "하루 기록 완료", "nav-trends": "기록과 추세 보기", reopen: "이 날 기록 확인", "coach-checkin": "오늘 상태 알려주기", "nav-training": "훈련 기록 살펴보기", "nav-program": "훈련 계획 살펴보기", "coach-memory": "목표와 제약 남기기", "tracking-scope": "기록 범위 선택" };
  const checkinOptions = { energy: ["low", "okay", "good"], hunger: ["low", "okay", "high"], sleep: ["poor", "okay", "good"], trainingPlan: ["rest", "planned"], mealConstraint: ["none", "busy", "low-appetite", "digestive"], performance: ["down", "steady", "up"] };
  const finiteRange = value => value && [value.min, value.target, value.max].every(finite) && value.min >= 0 && value.min <= value.target && value.target <= value.max;
  const readyPlan = plan => plan?.status === "ready" && finite(plan.energy?.targetKcal) && plan.energy.targetKcal > 0 && ["protein", "carbs", "fat"].every(key => finiteRange(plan.macros?.[key]));

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
  }

  function validMeals(meals) {
    return Array.isArray(meals) && meals.every(meal => meal && ["protein", "carbs", "fat"].every(key => finite(meal[key]) && meal[key] >= 0) && ["otherKcal", "alcoholG"].every(key => meal[key] === undefined || (finite(meal[key]) && meal[key] >= 0))) && Object.values(Insights.mealTotals(meals)).every(finite);
  }

  function readCheckin(value) {
    return Object.fromEntries(Object.entries(checkinOptions).map(([key, values]) => [key, values.includes(value?.[key]) ? value[key] : null]));
  }

  function mealConstraintAdvice(checkin) {
    if (checkin.mealConstraint === "busy") return "바쁜 날에는 준비가 덜 필요한 식사부터 정해 두죠. 평소 먹는 주식과 단백질 식품 한 가지씩이면 시작하기 편해요.";
    if (checkin.mealConstraint === "low-appetite") return "입맛이 없다면 한 번에 몰아 먹지 말고, 잘 먹히는 음식으로 조금씩 나눠 보세요. 식욕 저하가 계속된다면 식단 조정만으로 넘기지는 마세요.";
    if (checkin.mealConstraint === "digestive") return "속이 불편하다면 목표량을 억지로 채우기보다 잘 견디는 음식과 양부터 찾죠. 불편이 심하거나 반복되면 원인을 따로 확인해야 해요.";
    return "";
  }

  function item(id, title, body, action, options = {}) {
    return { id, title, body, action: action || null, actionLabel: actionLabels[action] || null, tone: "info", kind: "context", confidence: "medium", source: "day", evidence: {}, ...options };
  }

  function historyContext(history, date, goal) {
    const end = dateNumber(date);
    const byDate = new Map();
    const conflicted = new Set();
    const rows = Array.isArray(history) ? history : history && typeof history === "object" ? Object.values(history) : [];
    for (const row of rows) {
      const time = dateNumber(row?.date);
      if (end === null || time === null || time >= end || time < end - 28 * DAY) continue;
      if (byDate.has(row.date)) conflicted.add(row.date);
      else byDate.set(row.date, row);
    }
    for (const date of conflicted) byDate.delete(date);
    const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const complete = all.filter(row => row.complete === true && validMeals(row.meals) && row.meals.length > 0);
    const comparable = complete.filter(row => goal && readyPlan(row.planSnapshot) && row.planSnapshot.context?.goal === goal);
    const lowEnergy = [], highEnergy = [], lowProtein = [];
    for (const row of comparable) {
      const totals = Insights.mealTotals(row.meals);
      const target = row.planSnapshot;
      // These are display triage bands, not physiological thresholds or score penalties.
      if (totals.kcal < target.energy.targetKcal * 0.8) lowEnergy.push(row.date);
      if (totals.kcal > target.energy.targetKcal * 1.2) highEnergy.push(row.date);
      if (totals.protein < target.macros.protein.min) lowProtein.push(row.date);
    }
    const summary = Insights.historySummary(Object.fromEntries(all.map(row => [row.date, { date: row.date, weightKg: row.weightKg, complete: false, meals: [] }])), date, goal);
    return {
      windowDays: 28, completedDays: complete.length, comparableDays: comparable.length,
      lowEnergyDays: lowEnergy.length, highEnergyDays: highEnergy.length, lowProteinDays: lowProtein.length,
      dates: { lowEnergy, highEnergy, lowProtein },
      weightObservations: summary.weights.length, weeklyWeightChangeKg: summary.weeklyChange,
      averageKcal: comparable.length ? comparable.reduce((sum, row) => sum + Insights.mealTotals(row.meals).kcal, 0) / comparable.length : null,
      excludedDuplicateDates: conflicted.size, includesSelectedDay: false
    };
  }

  function getPlan(profile, day, history) {
    if (day.complete === true) {
      if (readyPlan(day.planSnapshot) || ["review", "incomplete"].includes(day.planSnapshot?.status)) return { plan: day.planSnapshot, source: "saved-target" };
      return { plan: { status: "incomplete", reasons: ["완료한 날의 저장 목표가 없거나 읽을 수 없어요. 현재 설정으로 과거의 목표를 대신 만들지 않았어요."], guidance: [] }, source: "missing-snapshot" };
    }
    let plan = Nutrition.calculatePlan(Nutrition.profileForDay(profile, day) || {}, day, []);
    if (plan.status === "ready") plan = Nutrition.adjustAllocation(plan, finite(day.carbAdjustmentG) ? day.carbAdjustmentG : 0);
    return { plan, source: "live-target" };
  }

  const text = value => typeof value === "string" ? value.slice(0, 2000) : "";
  const texts = value => Array.isArray(value) ? value.filter(value => typeof value === "string").slice(0, 30).map(text) : [];
  const knownCount = value => finite(value) && value >= 0 ? value : null;

  function summarizeTraining(analysis, workspace, program, date) {
    const end = dateNumber(analysis?.windowEnd), selected = dateNumber(date);
    const available = !!analysis && typeof analysis === "object" && end !== null && (selected === null || end <= selected);
    const source = available ? analysis : {};
    const last = source.lastSession && dateNumber(source.lastSession.date) !== null && dateNumber(source.lastSession.date) <= end ? source.lastSession : null;
    const unknownLegacySets = last?.sourceKind === "legacy-ocr" && last.totalSets === 0;
    const exerciseCount = last && !unknownLegacySets && Array.isArray(last.exercises) && last.exercises.length <= 200
      && last.exercises.every(row => row && typeof row === "object" && !Array.isArray(row)) ? last.exercises.length : null;
    const matchesLast = value => last && value?.date === last.date && (!text(last.id) || text(value.sessionId) === text(last.id));
    const point = value => value && typeof value === "object" && dateNumber(value.date) !== null && dateNumber(value.date) <= end ? {
      sessionId: text(value.sessionId) || null, blockId: text(value.blockId) || null, date: value.date, time: text(value.time) || null,
      loadKg: knownCount(value.loadKg), reps: knownCount(value.reps), rir: knownCount(value.rir),
      equipmentKey: text(value.equipmentKey), loadConvention: text(value.loadConvention), rawName: text(value.rawName),
      basis: text(value.basis), marker: text(value.marker) || null, sourceKind: text(value.sourceKind)
    } : null;
    const progression = (Array.isArray(source.progression) ? source.progression : []).filter(row => row && typeof row === "object")
      .sort((a, b) => Number(matchesLast(b.observed?.current) || matchesLast(b.current)) - Number(matchesLast(a.observed?.current) || matchesLast(a.current)))
      .slice(0, 100).map(row => ({
      exerciseId: text(row.exerciseId), label: text(row.label), equipmentKey: text(row.equipmentKey),
      status: ["improved", "declined", "stable", "mixed", "incomparable", "insufficient"].includes(row.status) ? row.status : "insufficient",
      reason: text(row.reason), current: point(row.current), previous: point(row.previous),
      observed: { current: point(row.observed?.current), previous: point(row.observed?.previous), description: text(row.observed?.description) }
    }));
    const recovery = {
      status: ["stop", "review", "watch", "insufficient", "okay"].includes(source.recovery?.status) ? source.recovery.status : "insufficient",
      pain: ["none", "mild", "stop"].includes(source.recovery?.pain) ? source.recovery.pain : null,
      reasons: texts(source.recovery?.reasons), questions: texts(source.recovery?.questions),
      repeatedDeclines: knownCount(source.recovery?.repeatedDeclines), selfReportSignals: texts(source.recovery?.selfReportSignals)
    };
    const coverage = Object.fromEntries(["recordCount", "daysWithRecords", "unknownDays", "workingSets", "warmupSets", "markedSets", "unknownEffortSets", "unresolvedExercises", "excludedRecords", "duplicateRecords", "invalidSets", "legacyOnlySessions"].map(key => [key, knownCount(source.coverage?.[key])]));
    coverage.trainingDates = Array.isArray(source.coverage?.trainingDates) ? source.coverage.trainingDates.filter(date => dateNumber(date) !== null && dateNumber(date) <= end).slice(0, 28) : [];
    const muscles = (Array.isArray(source.muscles) ? source.muscles : []).slice(0, 50).filter(row => row && typeof row === "object").map(row => ({ id: text(row.id), label: text(row.label), directSets: knownCount(row.directSets), indirectSets: knownCount(row.indirectSets), unknownEffortSets: knownCount(row.unknownEffortSets) }));
    const limitations = texts(source.limitations);
    if (analysis && !available) limitations.push("선택한 날짜까지의 훈련 분석이 확인되지 않아 이후 기록으로 과거를 평가하지 않았어요.");
    return {
      available, windowStart: available && dateNumber(source.windowStart) !== null ? source.windowStart : null, windowEnd: available ? source.windowEnd : null,
      lastSession: last ? { id: text(last.id) || null, date: last.date, time: text(last.time) || null, label: text(last.label), sourceKind: text(last.sourceKind) || "unknown",
        exerciseCount, totalSets: unknownLegacySets ? null : knownCount(last.totalSets), workingSets: unknownLegacySets ? null : knownCount(last.workingSets),
        warmupSets: unknownLegacySets ? null : knownCount(last.warmupSets), markedSets: unknownLegacySets ? null : knownCount(last.markedSets),
        unknownEffortSets: unknownLegacySets ? null : knownCount(last.unknownEffortSets), durationMinutes: knownCount(last.durationMinutes) } : null,
      coverage, muscles, progression, recovery, limitations,
      settings: { daysPerWeek: knownCount(workspace?.settings?.daysPerWeek), sessionMinutes: knownCount(workspace?.settings?.sessionMinutes) },
      programStatus: ["ready", "review", "incomplete"].includes(program?.status) ? program.status : null,
      programName: text(program?.name), programReason: text(program?.reason)
    };
  }

  function progressionObservation(row) {
    const current = row?.observed?.current || row?.current, previous = row?.observed?.previous || row?.previous;
    const describe = point => point && (finite(point.loadKg) || finite(point.reps)) ? `${point.date || "날짜 미확인"} ${finite(point.loadKg) ? `${fmt(point.loadKg, 1)}kg` : "부하 미확인"} × ${finite(point.reps) ? `${fmt(point.reps)}회` : "반복 미확인"}` : null;
    const now = describe(current), before = describe(previous);
    if (!now && !before) return row?.observed?.description || "비교할 중량·반복 수가 아직 확인되지 않았어요.";
    if (now && !before) return `관찰 기록 ${now}`;
    return `${before || "이전 대표 세트 미확인"} → ${now || "최근 대표 세트 미확인"}`;
  }

  function hasLatestObservation(training) {
    const last = training.lastSession;
    if (!last) return false;
    const matches = point => point?.date === last.date && (!last.id || point.sessionId === last.id);
    return training.progression.some(row => {
      const current = matches(row.observed.current) ? row.observed.current : matches(row.current) ? row.current : null;
      return current && (finite(current.loadKg) || finite(current.reps));
    });
  }

  function trainingLogAction(last) {
    return last ? { action: "training-open", actionRecordId: last.id, actionRecordDate: last.date, actionLabel: `${last.date} 일지 보기` }
      : { action: "nav-training", actionLabel: actionLabels["nav-training"] };
  }

  function exerciseEnergyText(plan) {
    return plan.context?.dailyActivity?.mode === "detailed"
      ? `운동 순소모는 약 ${fmt(plan.energy.exerciseKcal)}kcal로 추정돼요. 상세 시간표에서는 그 시간의 휴식을 운동으로 바꿔 계산했고, 결과는 목표에 이미 포함했어요.`
      : `운동의 순소모 추정 ${fmt(plan.energy.exerciseKcal)}kcal는 목표에 이미 포함돼요.`;
  }

  function connectTraining(result, profile, options, date) {
    if (!options?.trainingAnalysis && !options?.training && !options?.program) return result;
    const training = summarizeTraining(options.trainingAnalysis, options.training, options.program, date);
    result.context.training = training;
    result.context.limitations.push("세트 일지의 kg 합계·표시 Cal은 근성장이나 측정된 소모량이 아니며 식사 목표에 다시 더하지 않아요.", "기록하지 않은 날은 휴식일로 판단하지 않아요.", ...training.limitations);
    if (!training.available) return result;
    const last = training.lastSession;
    const logSummary = last ? `최근 기록은 ${last.date}${last.time ? ` ${last.time}` : ""} ${last.label || "훈련"}${last.totalSets !== null ? `, ${fmt(last.totalSets)}세트` : ""}예요.${last.sourceKind === "legacy-ocr" ? " 이전 OCR 요약이며 원본을 새로 검증한 기록은 아니에요." : ""}` : "이 기간에는 확인된 세트 일지가 없어요. 기록이 없다는 뜻이지 쉬었다는 뜻은 아니에요.";
    if (last?.time) result.context.limitations.push("일지 헤더의 시각은 시작·종료 중 어느 시각인지 확인되지 않았어요.");
    result.context.observations.push({ id: "training-diary", label: "세트 일지", value: logSummary, source: "training-records", confidence: "high" });
    const logAction = trainingLogAction(last);
    result.questions.push({ id: "training-log", label: last ? `${last.date} ${last.label || "훈련"} 일지에서 무엇이 확인됐나요?` : "최근 훈련에서 무엇이 확인됐나요?", answer: logSummary, ...logAction });
    const trainingItems = [];
    const currentClinical = profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80);
    const recovery = training.recovery;
    if (["stop", "review"].includes(recovery.status)) {
      const pain = ["mild", "stop"].includes(recovery.pain) || recovery.status === "stop";
      trainingItems.push(item("training-safety", pain ? "통증이 있는 동작은 멈춰 주세요" : "훈련을 늘리기 전에 회복부터 확인해요", `${recovery.reasons.join(" ")} ${pain ? "통증이 생기는 동작은 중단하고, 심하거나 계속되는 증상은 의료진에게 확인해 주세요." : "수면·피로·최근 식사를 함께 확인한 뒤 다음 훈련을 정하죠. 이 기록만으로 통증이나 원인을 단정하지 않아요."}`, "nav-training", { kind: "safety", tone: "attention", confidence: "high", source: "training-self-report" }));
    } else if (recovery.status === "watch") {
      trainingItems.push(item("training-recovery", "최근 수행과 회복을 함께 확인해요", `${recovery.reasons.join(" ")} ${recovery.questions[0] || "수면·피로·통증과 실제 세트의 남은 반복 여유를 알려 주세요."} 한 번의 기록만으로 디로드를 확정하거나 칼로리를 더 줄이지 않아요.`, "coach-checkin", { kind: "safety", tone: "attention", confidence: "medium", source: "training-pattern" }));
    }
    if (["onboarding", "incomplete", "review"].includes(result.status)) {
      result.priorities = [...trainingItems, ...result.priorities].slice(0, 3);
      result.headline = result.priorities[0]?.title || result.headline;
      return result;
    }
    if (last) {
      const numericObservation = hasLatestObservation(training);
      const counts = [`운동 블록 ${last.exerciseCount === null ? "수 미확인" : `${fmt(last.exerciseCount)}개`}`,
        last.workingSets === null ? "일반 세트 수 미확인" : `일반 ${fmt(last.workingSets)}세트`];
      if (last.warmupSets !== null) counts.push(`준비 ${fmt(last.warmupSets)}세트`);
      if (last.markedSets !== null) counts.push(`별도 표시 ${fmt(last.markedSets)}세트`);
      if (last.unknownEffortSets !== null) counts.push(`RIR 미확인 ${fmt(last.unknownEffortSets)}세트`);
      const explanation = `${last.date}${last.time ? ` ${last.time}` : ""} ${last.label || "훈련"}의 전체 기록이에요. ${counts.join(" · ")}. ${last.sourceKind === "legacy-ocr" ? "이전 OCR 자료는 원문을 새로 검증한 기록이 아니에요. " : ""}${numericObservation
        ? "중량·반복 관찰이 있어도 한 종목을 전체 운동의 향상이나 저하로 대신하지 않아요. 각 운동 블록의 장비·중량 표기·RIR·수행 순서 조건을 따로 확인해야 해요."
        : "이 일지에서 중량·반복 수가 확인되지 않아 이전 종목의 숫자를 대신 보여주지 않았어요. 숫자 없는 운동도 기록에 남겨 두고 확인하죠."} 세트 수와 원문 숫자는 기록상 관찰이며 근육 증가량이나 다음 목표 중량을 뜻하지 않아요.`;
      const evidence = { scope: "whole-session", latestSessionId: last.id, latestSessionDate: last.date,
        selection: last.id ? "latest-session-id" : "latest-date-fallback", exerciseCount: last.exerciseCount,
        workingSets: last.workingSets, warmupSets: last.warmupSets, markedSets: last.markedSets,
        unknownEffortSets: last.unknownEffortSets, current: null, previous: null };
      trainingItems.push(item(numericObservation ? "training-progression" : "training-log", `${last.date} 최근 운동 전체 관찰`, explanation, logAction.action,
        { ...logAction, kind: "training", confidence: "medium", source: "training-records", evidence }));
      if (numericObservation) result.questions.push({ id: "training-progression", label: `${last.date} 전체 운동 기록은 무엇이 확인됐나요?`, answer: explanation, ...logAction, evidence });
    }
    const muscles = training.muscles.filter(row => (row.directSets || 0) + (row.indirectSets || 0) > 0).slice(0, 4);
    result.questions.push({ id: "training-muscles", label: "부위별로 어떤 훈련이 쌓였나요?", answer: muscles.length ? `${training.windowStart || "기간 시작 미확인"}~${training.windowEnd}: ${muscles.map(row => `${row.label || row.id} 직접 ${fmt(row.directSets)}·간접 ${fmt(row.indirectSets)}세트`).join(", ")}. 운동 분류에 따른 노출 집계이며 둘을 같은 효과의 세트로 합치지 않아요. ${training.coverage.unknownEffortSets !== null ? `노력 수준 미확인 ${fmt(training.coverage.unknownEffortSets)}세트가 있어요.` : "실제 노력 수준도 함께 확인해야 해요."}` : "분류된 부위 기록이 아직 충분하지 않아요. 원문 운동명·기구와 실제 세트를 확인하면 직접·간접 노출을 나누어 볼 수 있어요.", action: "nav-training", actionLabel: actionLabels["nav-training"] });
    result.questions.push({ id: "training-deload", label: "쉬거나 디로드할 때인가요?", answer: `${recovery.reasons.join(" ") || "현재 기록만으로 회복 상태를 확정하지 않았어요."} ${recovery.questions.join(" ")} 단일 일지의 총볼륨으로 디로드를 단정하지 않아요. 반복되는 수행 변화와 수면·피로·통증, 같은 운동의 노력 수준을 함께 확인해요.`, action: "nav-training", actionLabel: actionLabels["nav-training"] });
    if (!currentClinical && !["stop", "review"].includes(recovery.status) && training.programStatus) {
      result.questions.push({ id: "training-program", label: "내 일정에 맞는 훈련 계획은 무엇인가요?", answer: `${training.programName || "훈련 계획"}: ${training.programReason || "확인된 일정·장비·목표를 기준으로 계획을 살펴볼 수 있어요."} ${training.programStatus === "ready" ? "설정 기반 초안이며 실제 통증·피로와 수행 기록에 맞춰 확인해야 해요." : "빠진 일정과 장비 조건을 확인한 뒤 계획을 정해요."}`, action: "nav-program", actionLabel: actionLabels["nav-program"] });
    }
    const existingSafety = result.priorities.filter(row => row.kind === "safety");
    const ordinary = result.priorities.filter(row => row.kind !== "safety");
    const newSafety = trainingItems.filter(row => row.kind === "safety");
    const newOrdinary = trainingItems.filter(row => row.kind !== "safety");
    const mealFeedback = ordinary.filter(row => row.source === "session-only");
    result.priorities = [...newSafety, ...existingSafety, ...mealFeedback, ...newOrdinary, ...ordinary.filter(row => row.source !== "session-only")].slice(0, 3);
    result.headline = result.priorities[0]?.title || result.headline;
    result.summary += last ? ` · 세트 일지 ${last.date}` : " · 세트 일지 미확인";
    return result;
  }

  function adaptDecisionScope(result, decision) {
    if (!decision?.scope) return result;
    const scope = decision.scope;
    result.context.decisionContext = decision;
    result.context.limitations.push(...decision.limits);
    result.context.missingSignals = result.context.missingSignals.filter(row => !["composition", "clinical-context", "checkin", "experience", "performance", "training-plan", "meal-constraint"].includes(row.id));
    result.priorities = result.priorities.filter(row => row.id !== "composition-confidence"
      && (scope.trainingEnabled || row.kind !== "training" && !/^training-|^rest-plan$/.test(row.id) || row.kind === "safety"));
    result.questions = result.questions.filter(row => (scope.trainingEnabled || !/^training/.test(row.id))
      && (scope.nutritionEnabled || !["next-meal", "target", "composition", "trend", "allocation", "finish"].includes(row.id)));
    const safety = result.priorities.filter(row => row.kind === "safety");
    const ordinary = result.priorities.filter(row => row.kind !== "safety");
    if (!safety.length) {
      const concern = decision.nextObservations.find(row => row.priority === "safety");
      if (concern) safety.push(item(concern.id, concern.id === "current-pain" ? "통증이 있는 동작은 멈춰 주세요" : concern.id === "care-context" ? "기록은 계속 쓰고 계획은 개별적으로 정해요" : "현재 회복 상태부터 확인해요",
        concern.question, concern.action, { kind: "safety", tone: "attention", source: "decision-context", confidence: "high" }));
    }
    const pending = decision.nextObservations.filter(row => !(row.priority === "safety" && safety.length));
    const direction = pending.find(row => ["current-goal", "record-scope"].includes(row.id));
    if (direction && !ordinary.some(row => row.id === direction.id)) ordinary.unshift(item(direction.id,
      direction.id === "record-scope" ? "먼저 관리할 기록부터 정해요" : "앞으로 적용할 목표를 확인해요",
      direction.question, direction.action, { kind: "data", source: "decision-context", confidence: "high" }));
    pending.slice(0, 2).forEach(row => {
      if (!result.context.missingSignals.some(value => value.id === row.id)) result.context.missingSignals.push({
        id: row.id, label: row.reason, question: row.question, action: row.action, actionLabel: actionLabels[row.action] || "기록 범위 선택" });
    });
    result.priorities = [...safety, ...ordinary].slice(0, 3);
    result.headline = result.priorities[0]?.title || result.headline;
    return result;
  }

  function buildCoach(profile, day = {}, history = [], options = {}) {
    const d = day && typeof day === "object" && !Array.isArray(day) ? day : {};
    const meals = d.meals === undefined ? [] : d.meals;
    const complete = d.complete === true;
    const { plan, source } = getPlan(profile, { ...d, meals }, history);
    const saved = source === "saved-target";
    const goal = saved ? plan.context?.goal || null : profile?.goal || null;
    const recent = historyContext(history, d.date, goal);
    const checkin = readCheckin(d.coachCheckin);
    const decision = options.decisionContext || (options.state && DecisionContext ? DecisionContext.build(options.state, d.date, { question: options.question }) : null);
    const missingCore = ["energy", "hunger", "sleep"].filter(key => checkin[key] === null);
    const context = {
      date: d.date || null, complete, planSource: source, goal, recent, targetsChanged: false, modelVersion: VERSION,
      checkin, observations: [], missingSignals: [],
      limitations: ["기록과 자기보고를 해석하는 영양·회복 코치이며 진단이나 운동 자세·부상 평가를 대신하지 않아요.", "식사·운동 시각과 다음 운동까지 남은 시간을 모르므로 정확한 전후 보급 시점을 정하지 않아요.", "진행 중인 식사 기록은 하루의 부족·과잉 판정이 아니에요. 식품의 다양성·알레르기·미량영양소는 매크로 합계만으로 평가할 수 없어요."]
    };
    const observe = (id, label, value, source, confidence = "high") => context.observations.push({ id, label, value, source, confidence });
    const missing = (id, label, question, action) => context.missingSignals.push({ id, label, question, action, actionLabel: actionLabels[action] });
    if (missingCore.length) missing("checkin", "몸 상태 미확인", "컨디션, 허기와 수면은 어땠나요? 아는 항목만 알려 주세요.", "coach-checkin");
    if (!complete && checkin.trainingPlan === null) missing("training-plan", "운동 계획 미확인", "오늘은 운동 예정인가요, 쉬는 날인가요? 실제 완료 기록과 구분해서 알려 주세요.", "coach-checkin");
    if (checkin.mealConstraint === null) missing("meal-constraint", "식사 여건 미확인", "시간 부족, 낮은 식욕이나 소화 불편 때문에 식사하기 어렵나요?", "coach-checkin");
    missing("clinical-context", "개별 평가 범위", "질환·치료 식이나 지속적인 통증·회복 저하가 있나요? 해당되면 내 기준의 건강 상태를 확인하고 전문가 계획을 우선해 주세요.", "nav-profile");
    const questions = [];
    const question = (id, label, answer, action) => questions.push({ id, label, answer, action: action || null, actionLabel: actionLabels[action] || null });
    const finish = (status, priorities, summary) => {
      const currentCare = saved && (profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80));
      let selected = priorities.slice(0, 3), selectedQuestions = questions;
      if (status === "complete" && currentCare) {
        selected = [item("current-care", "지금은 전문가와 정한 계획이 우선이에요", "이 날의 식사와 저장 목표는 과거 기록으로 남겨 둘게요. 현재 건강 상태에는 자동 감량·증량 계획을 적용하지 않아요. 담당 전문가의 식사·운동 지침부터 확인해 주세요.", "nav-profile", { kind: "safety", tone: "attention", source: "current-profile", confidence: "high" }), ...priorities.filter(row => ["allocation", "recent-intake", "weight-trend", "composition-confidence"].includes(row.id))].slice(0, 3);
        const retrospective = {
          "next-meal": `이 날에는 ${fmt(context.totals?.kcal)}kcal, 단백질 ${fmt(context.totals?.protein)}g이 기록됐어요. 과거 식사를 설명하는 값이며 지금 먹을 양을 권하는 뜻은 아니에요. 현재 식사는 담당 전문가와 정한 계획을 우선해 주세요.`,
          target: `이 날 완료할 때 저장한 목표는 ${fmt(context.targetKcal)}kcal, 단백질 ${fmt(context.macroTargets?.protein?.target)}g이에요. 현재 프로필로 다시 계산하지 않았고, 지금의 처방으로 사용하지 않아요.`,
          training: `이 날 기록된 운동 시간은 ${fmt(context.sessionMinutes)}분이에요. 과거 기록은 유지하되 현재 훈련과 운동 전후 식사는 담당 전문가의 지침을 먼저 확인해 주세요.`,
          allocation: "완료 당시의 탄수·지방 배분을 그대로 보여 주고 있어요. 현재의 치료 식이나 영양 제한에 이 배분을 새로 적용하지 않아요."
        };
        selectedQuestions = questions.map(row => Object.hasOwn(retrospective, row.id) ? { ...row, answer: retrospective[row.id], action: "nav-trends", actionLabel: actionLabels["nav-trends"] } : row);
      }
      return adaptDecisionScope(connectTraining({ status, headline: selected[0]?.title || "기록을 함께 살펴볼게요", summary, priorities: selected, questions: selectedQuestions, context }, profile, options, d.date), decision);
    };

    if (decision && (!decision.scope.nutritionEnabled || !profile && !saved)) {
      const usesTraining = decision.scope.trainingEnabled, usesNutrition = decision.scope.nutritionEnabled;
      const priorities = [];
      context.goal = profile?.goal || null;
      context.mealCount = Array.isArray(meals) ? meals.length : null;
      context.totals = usesNutrition && validMeals(meals) && meals.length ? Insights.mealTotals(meals) : null;
      context.dayAssessmentAvailable = usesNutrition && decision.nutrition.canAssessSelectedWholeDay;
      if (usesTraining) {
        const coverage = decision.training.coverage, last = decision.training.lastSession;
        const body = last ? `최근 기록은 ${last.date} ${last.label || "훈련"}이에요. 장비·순서·세트 조건을 구분해서 다음 수행을 이어가요.`
          : "실제로 한 운동은 직접 입력하거나 지난 일지를 재사용할 수 있어요. 기록 공백을 휴식이나 실패로 판단하지 않아요.";
        priorities.push(item("training-record-scope", last ? "지난 수행에서 다음 운동을 이어가요" : "실제 운동 기록부터 이어가요", body, "nav-training", { kind: "training", confidence: "high", source: "training-records" }));
        question("training-record-scope", "식사나 체성분 없이도 운동을 볼 수 있나요?", "실제 운동·장비·세트 기록은 그대로 볼 수 있어요. 식사 자료가 없으면 수행 변화의 영양 원인을 판정하지 않고, 체성분 없이 적정 중량이나 성장률을 만들어 내지 않아요.", "nav-training");
        observe("training-week", "최근 운동 기록", `최근 7일 세트 일지 ${fmt(coverage.recordCount)}건 · 일반 세트 ${fmt(coverage.workingSets)}개`, "training-records");
      }
      if (usesNutrition) {
        priorities.push(item("nutrition-record-scope", meals.length ? "기록한 식사부터 확인해요" : "먹은 식사부터 남겨요",
          meals.length ? "기록한 식사는 확인할 수 있어요. 개인 섭취 목표가 없거나 식사가 일부만 기록됐으면 부족·과잉으로 평가하지 않아요."
            : "자주 먹는 식사나 실제 먹은 한 끼부터 남길 수 있어요. 운동 일지와 체성분은 반드시 입력할 항목이 아니에요.", "meal-add", { kind: "data", confidence: "high", source: "meal-record" }));
        question("nutrition-record-scope", "숫자 목표 없이도 식사를 기록할 수 있나요?", "실제 식사는 먼저 남길 수 있어요. 개인 열량·단백질 목표를 계산하려는 때에 필요한 내 기준을 확인하면 됩니다. 체성분은 선택 사항이에요.", "meal-add");
      }
      if (profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80)) {
        priorities.unshift(item("recording-care", "기록은 계속 쓰고 계획은 개별적으로 정해요", "현재 건강·연령 조건에서는 일반 숫자 처방을 만들지 않아요. 기록과 기존 전문가 계획을 보존하면서 필요한 조정을 확인해 주세요.", "nav-profile", { kind: "safety", tone: "attention", confidence: "high", source: "current-profile" }));
      }
      if (!priorities.length) {
        priorities.push(item("record-scope", "먼저 관리할 기록부터 정해요", "식사·운동 또는 둘 다 중 먼저 관리할 범위를 정하고 평소 방식의 기록부터 시작할 수 있어요.", "tracking-scope", { kind: "data", confidence: "high" }));
      }
      if (decision.scope.effective === "none") question("record-scope", "어떻게 시작할까요?", "먹은 식사나 실제로 한 운동 중 먼저 관리할 기록부터 정하면 돼요. 내 기준이 있어도 아직 기록하지 않은 식사·운동을 부족이나 휴식으로 판단하지 않아요. 직접 기록하거나 지난 기록을 재사용할 수 있고, 사진의 숫자는 AI 판독 뒤 확인한 내용만 일지로 사용해요. AI 연결이 없어도 기록을 이어갈 수 있어요.", "tracking-scope");
      if (!usesNutrition) context.limitations.push("식사 기록 범위를 사용하지 않아 수행 변화의 영양 원인이나 섭취 부족을 판정하지 않아요.");
      const summary = decision.scope.effective === "training" ? "운동 기록 중심 · 식사·체성분은 선택 사항"
        : decision.scope.effective === "nutrition" ? "식사 기록 중심 · 운동 일지는 선택 사항"
          : decision.scope.effective === "both" ? "식사와 운동 기록 · 숫자 목표 없이도 기록 가능" : "활용할 기록 범위를 선택해 주세요";
      return finish("tracking", priorities, summary);
    }

    if (!profile && !saved && source !== "missing-snapshot") {
      question("start", "무엇부터 알려주면 될까요?", "성별, 나이, 키·체중, 평소 활동과 목표부터 알려 주세요. 체성분과 운동 경력은 모르면 비워 둘 수 있어요.", "nav-profile");
      question("record-first", "계산 없이도 기록할 수 있나요?", "먹은 식사와 운동은 먼저 기록할 수 있어요. 내 기준을 입력하기 전에는 개인 섭취 목표나 부족 여부를 판단하지 않아요.", "meal-add");
      return finish("onboarding", [item("onboarding", "내 기준부터 함께 맞춰요", "몸과 운동, 목표를 알려 주면 기록에 맞춰 다음 식사와 회복을 함께 살펴볼게요.", "nav-profile", { kind: "data", confidence: "high", source: "profile" })], "식사 기록은 지금 시작할 수 있어요.");
    }
    if (plan.status !== "ready" || !readyPlan(plan)) {
      const review = plan.status === "review";
      const reasons = (plan.reasons || []).filter(reason => typeof reason === "string");
      question("scope", review ? "왜 자동 목표가 없나요?" : "무엇을 확인해야 하나요?", reasons.join(" ") || "계산에 필요한 기준을 확인해 주세요.", source === "missing-snapshot" ? "reopen" : "nav-profile");
      question("tracking", "지금 할 수 있는 일은 무엇인가요?", review ? "전문가와 정한 계획을 우선하면서 식사와 몸 상태를 기록해 주세요. 여기서는 체중 감량이나 숫자 변경을 권하지 않아요." : "확인되지 않은 값은 비워 두고 실제로 먹은 식사와 측정값부터 남겨 주세요.", complete ? "nav-trends" : "meal-add");
      question("recovery", "몸이 힘든 날은 무엇을 남길까요?", "컨디션·허기·수면과 식사를 어렵게 하는 상황을 아는 만큼 남겨 주세요. 원인을 진단하거나 섭취량을 자동으로 바꾸지 않아요.", "coach-checkin");
      return finish(review ? "review" : "incomplete", [item("scope", review ? "개별 계획을 우선해 주세요" : "계산 기준을 먼저 확인해요", reasons.join(" ") || "기록의 계산 기준이 확인되지 않았어요.", source === "missing-snapshot" ? "reopen" : "nav-profile", { kind: review ? "safety" : "data", tone: "attention", confidence: "high", source })], "기록은 유지하면서, 확인되지 않은 목표로 식사를 평가하지 않아요.");
    }
    if (!validMeals(meals)) {
      question("invalid-meals", "왜 식사를 평가하지 않나요?", "영양소가 비어 있거나 음수·잘못된 숫자가 포함돼 있어요. 모르는 값을 0으로 처리하면 섭취량을 과소평가할 수 있어요.", complete ? "reopen" : "meal-add");
      return finish("incomplete", [item("meal-data", "식사 숫자를 확인해 주세요", "입력값을 확인한 뒤 누적 섭취와 다음 식사를 살펴볼게요.", complete ? "reopen" : "meal-add", { kind: "data", tone: "attention", confidence: "high" })], "불확실한 식사 입력을 결핍으로 판단하지 않았어요.");
    }

    const totals = Insights.mealTotals(meals);
    const target = plan.energy.targetKcal;
    const ratio = totals.kcal / target;
    const leftProtein = Math.max(0, plan.macros.protein.target - totals.protein);
    const leftEnergy = Math.max(0, target - totals.kcal);
    const sessionRows = Array.isArray(d.sessions) ? d.sessions.filter(session => session && finite(session.durationMin) && session.durationMin > 0 && Object.hasOwn(Nutrition.METS, session.sport)) : [];
    const sessionMinutes = sessionRows.reduce((sum, session) => sum + session.durationMin, 0);
    const sports = [...new Set(sessionRows.map(session => session.sport))];
    const trainingYears = saved ? plan.context?.trainingYears : profile?.trainingYears;
    const lowEnergy = complete && meals.length > 0 && ratio < 0.8;
    const highEnergy = complete && meals.length > 0 && ratio > 1.2;
    const proteinLow = complete && meals.length > 0 && totals.protein < plan.macros.protein.min;
    const carbLowFatHigh = totals.carbs < plan.macros.carbs.min && totals.fat > plan.macros.fat.max;
    const fatLowCarbHigh = totals.fat < plan.macros.fat.min && totals.carbs > plan.macros.carbs.max;
    const reportedConcerns = [checkin.energy === "low" ? "낮은 컨디션" : null, checkin.hunger === "high" ? "강한 허기" : null, checkin.sleep === "poor" ? "좋지 않은 수면" : null, checkin.performance === "down" ? "최근 운동 수행 저하" : null].filter(Boolean);
    const recoveryConcern = reportedConcerns.length > 0;
    const constraintAdvice = mealConstraintAdvice(checkin);
    const recovery = (plan.guidance || []).find(row => row.id === "availability");
    const priorities = [];
    const add = value => { if (!priorities.some(row => row.id === value.id)) priorities.push(value); };
    Object.assign(context, {
      mealCount: meals.length, totals, targetKcal: target, macroTargets: plan.macros, exerciseKcal: plan.energy.exerciseKcal, intakeToTargetRatio: ratio,
      weightKg: plan.context?.weightKg ?? null, trainingYears: finite(trainingYears) ? trainingYears : null,
      sessionMinutes, sports, bodyCompositionConfidence: plan.context?.measurementConfidence || "unknown",
      allocation: plan.context?.allocation || null, dayAssessmentAvailable: complete && meals.length > 0,
      recoveryConcern, reportedConcerns, plannedExerciseIncluded: false
    });

    observe("intake", "기록된 식사", `${meals.length}건 · ${fmt(totals.kcal)}kcal · 단백질 ${fmt(totals.protein)}g`, "meal-record");
    observe("target", saved ? "완료 당시 목표" : "계산 시작점", `${fmt(target)}kcal`, source, "estimate");
    observe("exercise", "실제로 기록한 운동", sessionRows.length ? `${sports.map(sport => sportNames[sport]).join("·")} ${fmt(sessionMinutes)}분` : "기록 없음 · 휴식 여부는 별도", "session-record");
    const dailyActivity = plan.context?.dailyActivity;
    if (dailyActivity?.mode === "detailed") {
      const sourceLabel = dailyActivity.source === "day" ? "이 날 별도 입력" : dailyActivity.source === "weekday" ? "요일별 시간표" : "기본 시간표";
      observe("daily-activity", saved ? "완료 당시 활동 시간표" : "적용한 활동 시간표", `${sourceLabel} · 수면 ${fmt(dailyActivity.sleepHours, 1)}시간 · 업무 ${fmt(dailyActivity.workHours, 1)}시간 · 생활 ${fmt(dailyActivity.lifestyleHours, 1)}시간 · 운동 ${fmt(dailyActivity.exerciseHours, 1)}시간 · 남은 휴식 ${fmt(dailyActivity.restHours, 1)}시간`, source, "estimate");
      context.limitations.push("상세 시간표는 하루의 각 시간을 한 번씩 계산해요. 운동 순소모를 하루 소모에 그대로 덧붙이는 방식이 아니며, 활동 대표값을 조합한 추정이에요.");
    }
    if (reportedConcerns.length) observe("checkin", "직접 알려 준 상태", reportedConcerns.join(" · "), "self-report");
    else if (!missingCore.length) observe("checkin", "직접 알려 준 상태", "컨디션·허기·수면 응답 확인", "self-report");
    if (checkin.trainingPlan) observe("plan", "운동 계획", checkin.trainingPlan === "planned" ? "운동 예정 · 실제 완료와 별개" : "휴식 계획 · 기록된 실제 운동은 별도 반영", "self-report");
    if (finite(trainingYears)) observe("experience", "입력한 운동 경력", `${fmt(trainingYears, 1)}년`, saved ? "saved-profile" : "profile");
    else missing("experience", "운동 경력 미확인", "운동을 시작한 지 얼마나 됐나요? 주간 횟수와 별개로 실제 경력을 알려 주세요.", "nav-profile");
    if (!plan.context?.bodyFatUsable) missing("composition", "체성분 신뢰도 제한", "체지방률을 측정했다면 그날 체중·날짜·방법도 함께 남길 수 있나요? 몰라도 계산은 시작할 수 있어요.", "measurement");
    if (checkin.performance === null) missing("performance", "운동 수행 변화 미확인", "최근 운동 수행은 나아졌나요, 비슷한가요, 떨어졌나요?", "coach-checkin");
    if (recent.comparableDays < 3) context.limitations.push("같은 목표로 완료한 비교 기록이 적어 반복되는 섭취 양상으로 해석하지 않았어요.");
    if (!saved && profile?.sex === "unspecified") context.limitations.push("성별을 지정하지 않아 안정시대사량은 두 공식의 중간 추정이에요.");

    if (recoveryConcern) add(item("checkin-recovery", "오늘은 알려 준 몸 상태부터 챙겨요", `${reportedConcerns.join("·")}를 알려 주셨어요. ${sessionRows.length ? `${fmt(sessionMinutes)}분 운동과 ${fmt(totals.kcal)}kcal의 식사 기록을 함께 보되, ` : ""}이 정보만으로 원인을 정할 수는 없어요. 식사를 더 깎거나 추가 운동으로 보상하지 말고, 빠진 식사와 쉴 여유를 먼저 확인해 주세요. ${constraintAdvice || "상태가 계속 나쁘거나 회복·월경 변화가 이어지면 개별 평가를 받아 주세요."}`, !meals.length ? "meal-add" : "coach-checkin", { kind: "safety", tone: "attention", confidence: "high", source: "self-report", evidence: { reportedConcerns: [...reportedConcerns], diagnostic: false } }));
    if (recovery && !recoveryConcern) add(item("recovery", "회복 상태를 먼저 확인해요", "목표와 측정 당시 체성분을 참고하면 운동을 제외하고 남는 에너지가 적을 수 있어요. 지속적인 피로나 회복 저하, 해당되는 경우 월경 변화가 있다면 식사를 더 줄이기보다 개별 평가를 받아 주세요. 현재 증상이 있다는 뜻은 아니에요.", "nav-profile", { kind: "safety", tone: "attention", confidence: "low", source: "measurement", evidence: { energyAvailability: plan.context?.energyAvailability ?? null, diagnostic: false } }));
    if (totals.alcoholG > 0) add(item("alcohol", "술의 열량과 회복은 따로 봐요", `기록한 순알코올 ${fmt(totals.alcoholG, 1)}g의 ${fmt(totals.alcoholG * 7)}kcal가 총열량에 포함돼요. 열량에 맞았다고 수면에 미치는 영향이 없어지는 것은 아니에요. 술 때문에 다음 식사를 굶거나 운동으로 상쇄하지 마세요.`, complete ? "nav-trends" : "meal-add", { kind: "safety", tone: "attention", confidence: "high", source: "day", evidence: { alcoholG: totals.alcoholG, alcoholKcal: totals.alcoholG * 7, sourceUrl: "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/hangovers" } }));

    const mutation = options?.lastMutation;
    const mutationValid = !complete && mutation?.date === d.date && ["meal-added", "meal-updated", "meal-deleted"].includes(mutation.type);
    const changedMeal = mutationValid ? meals.find(meal => meal.id === mutation.mealId) : null;
    const mutationPrefix = mutationValid && (changedMeal || mutation.type === "meal-deleted")
      ? mutation.type === "meal-deleted" ? "식사 삭제를 반영했어요. " : `방금 ${mutation.type === "meal-added" ? "추가" : "수정"}한 ${String(changedMeal.name || "식사").slice(0, 80)}의 ${fmt(Insights.mealTotals([changedMeal]).kcal)}kcal, 단백질 ${fmt(changedMeal.protein)}g까지 반영했어요. ` : "";
    context.lastMealFeedback = mutationPrefix ? { type: mutation.type, mealId: changedMeal?.id ?? null, source: "session-only" } : null;

    if (!complete && meals.length && !mutationPrefix && missingCore.length && !recoveryConcern) add(item("checkin", "지금 허기와 컨디션은 어때요?", `지금까지 ${fmt(totals.kcal)}kcal${sessionRows.length ? `, 운동 ${fmt(sessionMinutes)}분` : ""}을 기록했어요. 다음 식사를 정하기 전에 컨디션·허기·수면 중 아는 것부터 알려 주세요.`, "coach-checkin", { kind: "data", confidence: "high", source: "missing-self-report", evidence: { missing: missingCore } }));

    if (!meals.length) add(item("start", complete ? "완료 기록에 식사가 없어요" : "먹은 식사부터 남겨 볼까요?", complete ? "이 날 식사 기록이 비어 있어요. 먹지 않았다는 뜻으로 보지 않을게요. 빠진 기록이 있다면 하루를 다시 열어 확인해 주세요." : "먹은 식사를 남기면 다음 식사를 함께 살펴볼 수 있어요. 기록이 없다는 이유로 먹지 않았다고 판단하지 않아요.", complete ? "reopen" : "meal-add", { kind: "data", confidence: "high" }));
    else if (meals.length === 1 && !complete) add(item("one-meal", mutationPrefix ? "방금 식사를 확인했어요" : "다음 식사도 같이 준비해요", `${mutationPrefix}지금까지 ${fmt(totals.kcal)}kcal, 단백질 ${fmt(totals.protein)}g이에요. ${ratio < 1 ? `하루 목표까지 약 ${fmt(leftEnergy)}kcal가 남았지만 한 번에 채울 양은 아니에요. ` : "하루 목표만큼 기록됐어도 남은 식사를 무조건 건너뛰지는 마세요. "}${constraintAdvice || "다음 식사가 있다면 평소 먹는 주식과 단백질 식품을 함께 준비해 보세요."}`, "meal-add", { kind: "today", confidence: "medium", source: mutationPrefix ? "session-only" : "day", evidence: { remainingKcal: leftEnergy, remainingProteinG: leftProtein, provisional: true } }));
    else if (!complete) {
      const next = ratio >= 1 ? "시작 목표만큼의 열량이 기록됐어요. 더 먹거나 굶어 맞추기보다 빠진 기록이 없는지 확인하고, 남은 식사는 허기와 계획을 함께 살펴보세요." : leftProtein > 10 ? `시작 목표까지 약 ${fmt(leftEnergy)}kcal, 단백질 ${fmt(leftProtein)}g이 남아 있어요. 다음 식사가 있다면 평소 먹는 단백질 식품과 탄수화물을 함께 구성해 보세요.` : `시작 목표까지 약 ${fmt(leftEnergy)}kcal가 남아 있어요. 단백질만 더 채우려 하기보다 다음 식사에서 채소·과일과 필요한 탄수화물을 함께 챙겨 보세요.`;
      add(item("next-meal", mutationPrefix ? "방금 기록한 식사까지 반영했어요" : "다음 식사는 이 부분을 챙겨요", `${mutationPrefix}${next}${constraintAdvice ? " " + constraintAdvice : ""}`, "meal-add", { kind: "today", confidence: "medium", source: mutationPrefix ? "session-only" : "day", evidence: { remainingKcal: leftEnergy, remainingProteinG: leftProtein, provisional: true } }));
    } else if (lowEnergy) add(item("low-energy", "빠진 식사가 없다면 충분한 식사가 먼저예요", `${fmt(totals.kcal)}kcal가 기록되어 저장 목표 ${fmt(target)}kcal보다 적어요. 기록 누락을 먼저 확인하고, 누락이 없다면 다음 식사부터 충분히 챙겨 주세요. 감량 목표여도 이 차이를 더 키우려 하지 마세요.`, "reopen", { kind: "today", tone: "attention", confidence: "medium", source, evidence: { kcal: totals.kcal, targetKcal: target } }));
    else if (highEnergy) add(item("high-energy", "한 번의 초과를 급하게 보상하지 마세요", `${fmt(totals.kcal)}kcal가 기록되어 저장 목표 ${fmt(target)}kcal보다 많아요. 굶거나 추가 운동으로 상쇄하기보다 다음 식사부터 평소 계획으로 돌아가세요. 반복 여부는 최근 기록에서 따로 확인해요.`, "nav-trends", { kind: "today", confidence: "medium", source, evidence: { kcal: totals.kcal, targetKcal: target } }));
    else if (proteinLow) add(item("protein", "단백질 식품을 끼니마다 나눠 보세요", `기록된 단백질은 ${fmt(totals.protein)}g으로, 당시 계획 범위의 아래쪽인 ${fmt(plan.macros.protein.min)}g보다 적어요. 다음 식사에는 평소 먹는 생선·달걀·두부·콩 같은 식품을 함께 담아 보세요.`, "nav-trends", { kind: "today", confidence: "medium", source }));
    else if (carbLowFatHigh || fatLowCarbHigh) add(item("macro-balance", "열량뿐 아니라 탄수·지방 구성도 살펴요", `열량은 저장 목표와 가깝지만 탄수 ${fmt(totals.carbs)}g, 지방 ${fmt(totals.fat)}g의 구성은 선택한 배분 범위와 달라요. ${carbLowFatHigh ? "다음 식사는 전체 양을 줄이기보다 지방 위주 식품 일부를 평소 먹는 주식으로 바꾸는 구성을 살펴보세요." : "다음 식사는 탄수화물만 더하기보다 견과류·생선처럼 평소 먹는 지방 공급원도 함께 살펴보세요."} 범위 이탈이 곧 건강 문제라는 뜻은 아니에요.`, "nav-trends", { kind: "today", confidence: "medium", source, evidence: { carbs: totals.carbs, fat: totals.fat, direction: carbLowFatHigh ? "carbs-for-fat" : "fat-for-carbs" } }));
    else add(item("balanced", "지금 구성을 이어가며 몸 상태를 보죠", `${fmt(totals.kcal)}kcal와 단백질 ${fmt(totals.protein)}g을 기록했어요. ${recoveryConcern ? "목표와 가까워도 알려 준 몸 상태는 따로 확인해야 해요." : "계획과 큰 차이는 없어요. 당장 양을 바꾸기보다 허기와 운동 수행이 어떤지 함께 보죠."}`, "nav-trends", { kind: "optimization", tone: recoveryConcern ? "info" : "positive", confidence: "medium", source }));

    const recentDirection = recent.lowEnergyDays >= 3 && recent.lowEnergyDays > recent.highEnergyDays ? "low" : recent.highEnergyDays >= 3 && recent.highEnergyDays > recent.lowEnergyDays ? "high" : null;
    if (recent.comparableDays >= 3 && recentDirection && !((lowEnergy && recentDirection === "high") || (highEnergy && recentDirection === "low"))) {
      const count = recentDirection === "low" ? recent.lowEnergyDays : recent.highEnergyDays;
      const evidence = { windowDays: 28, completedDays: recent.comparableDays, matchingDays: count, consecutive: false };
      const message = `선택한 날 전 최근 28일, 같은 목표로 완료한 ${recent.comparableDays}일 중 ${count}일이 당시 목표보다 ${recentDirection === "low" ? "적게" : "많이"} 기록됐어요. 빠진 기록이 있는지, 실제 식사도 이랬는지 같이 확인해 주세요.`;
      const existing = priorities.find(row => row.id === (recentDirection === "low" ? "low-energy" : "high-energy"));
      if (existing) { existing.body += ` ${message}`; existing.evidence.recent = evidence; }
      else add(item("recent-intake", "비슷한 기록이 반복되는지 확인해요", message, "nav-trends", { kind: "recent", confidence: "medium", source: "recent-completed", evidence }));
    }

    const allocation = plan.context?.allocation;
    if (allocation && Math.abs(allocation.appliedCarbDeltaG) > 0.5) add(item("allocation", "고른 탄수·지방 배분을 기준으로 보고 있어요", `기본 배분에서 탄수화물 ${allocation.appliedCarbDeltaG >= 0 ? "+" : ""}${fmt(allocation.appliedCarbDeltaG, 1)}g, 지방 ${allocation.appliedFatDeltaG >= 0 ? "+" : ""}${fmt(allocation.appliedFatDeltaG, 1)}g을 바꿨어요. 총열량과 단백질은 그대로예요.${allocation.limited ? " 선택량이 가능한 범위를 넘어 실제 적용량은 범위 안으로 제한됐어요." : ""}`, null, { kind: "allocation", confidence: "high", source, evidence: { ...allocation } }));
    if (sessionRows.length) {
      const training = (plan.guidance || []).find(row => row.id === "fueling") || (plan.guidance || []).find(row => row.id === "sport");
      add(item("training", `${sports.map(sport => sportNames[sport]).join("·")} ${fmt(sessionMinutes)}분을 반영했어요`, `${exerciseEnergyText(plan)} ${training?.body || "운동 뒤에는 식사를 지나치게 미루지 말고 허기와 회복을 함께 확인해 주세요."}`, complete ? "nav-trends" : "session-add", { kind: "training", confidence: "medium", source: "day", evidence: { sports, minutes: sessionMinutes, exerciseKcal: plan.energy.exerciseKcal } }));
    } else if (!complete && checkin.trainingPlan === "planned") add(item("training-planned", "예정 운동과 완료 운동을 구분해요", "운동할 계획이라고 알려 주셨어요. 아직 실제 운동 시간·강도가 없어서 목표 열량에 운동 소모를 더하지 않았어요. 운동을 마치면 실제 기록을 남겨 주세요. 전후 식사 시각을 모르므로 지금 보급량을 따로 처방하지 않아요.", "session-add", { kind: "training", confidence: "high", source: "self-report" }));
    else if (!complete && checkin.trainingPlan === "rest") add(item("rest-plan", "쉬는 날에도 식사와 회복은 이어가요", "휴식 계획이라고 알려 주셨어요. 기록된 추가 운동이 없어 기본 활동에 맞춘 목표를 보고 있어요. 쉬는 날이라는 이유만으로 식사를 건너뛰지는 마세요.", "coach-checkin", { kind: "training", confidence: "high", source: "self-report" }));
    else if (!complete) add(item("training-unknown", "오늘 운동 계획도 알려 주세요", "기록이 없다고 쉰 날로 판단하지 않았어요. 운동 예정인지 휴식 계획인지 먼저 알려 주세요. 실제로 마친 운동만 종목·시간·강도로 기록하면 돼요.", "coach-checkin", { kind: "data", confidence: "high" }));

    if (priorities.length < 3 && recent.weeklyWeightChangeKg !== null) add(item("weight-trend", "체중은 최근 측정의 흐름으로 봐요", `최근 두 주의 측정 중앙값을 비교한 변화는 주당 ${recent.weeklyWeightChangeKg >= 0 ? "+" : ""}${fmt(recent.weeklyWeightChangeKg, 2)}kg이에요. 체지방·근육의 변화량으로 해석할 수는 없어요. 식사 기록과 회복 상태를 같이 확인해 주세요.`, "nav-trends", { kind: "recent", confidence: "low", source: "recent-measurements" }));
    if (priorities.length < 3 && !plan.context?.bodyFatUsable) add(item("composition-confidence", "체성분은 확인된 측정만 참고해요", (plan.reasons || []).find(text => /체성분|체지방/.test(text)) || "측정 당시 체중과 날짜·방법이 확인되면 목표의 참고 자료로 사용할 수 있어요. 없어도 기본 계산은 가능해요.", "measurement", { kind: "profile", confidence: "high", source: "measurement" }));

    const firstMealAdvice = priorities.find(row => ["start", "one-meal", "next-meal", "low-energy", "high-energy", "protein", "macro-balance", "balanced"].includes(row.id));
    question("next-meal", complete ? "이 날 식사에서 무엇을 보면 될까요?" : "다음 식사에서 무엇을 챙길까요?", firstMealAdvice?.body || "기록된 식사와 몸 상태를 먼저 확인해 주세요.", complete ? "nav-trends" : "meal-add");
    const goalText = goalNames[goal] || "저장된 목표";
    const experienceText = finite(trainingYears) ? `입력한 운동 경력은 ${fmt(trainingYears, 1)}년이에요.${trainingYears === 0 ? " 막 시작했다면 꾸준히 먹을 수 있는 식사 구성부터 맞춰 보죠." : ""}` : "운동 경력은 확인되지 않아 운동 횟수로 숙련도를 추정하지 않았어요.";
    const sexText = !saved ? profile?.sex === "unspecified" ? " 성별을 지정하지 않아 열량은 두 공식의 중간 추정이에요." : ` ${profile?.sex === "female" ? "여성" : "남성"} 기준과 나이 ${fmt(profile?.age)}세를 안정시대사 추정에 반영했어요.` : "";
    const activityText = dailyActivity?.mode === "detailed" ? ` ${dailyActivity.source === "day" ? "이 날 따로 입력한" : dailyActivity.source === "weekday" ? "요일별" : "기본"} 시간표를 사용했고, 남은 휴식은 ${fmt(dailyActivity.restHours, 1)}시간이에요. 운동 시간은 이 휴식과 겹치지 않게 계산했어요.` : "";
    const goalAdvice = { lose: "최근 체중과 허기·회복을 함께 보며 조정하죠.", maintain: "매일 같은 체중을 맞추기보다 몇 주의 흐름을 보죠.", gain: "체중뿐 아니라 같은 조건의 운동 수행도 함께 보죠.", recomp: "단기 체중보다 식사의 지속성과 운동 수행을 함께 보죠.", performance: "훈련을 이어갈 식사와 회복을 먼저 챙기죠." };
    question("target", "현재 목표와 최근 변화는 어떻게 볼까요?", `${saved ? "이 날 완료할 때 저장한" : "현재"} ${goalText} 기준은 ${fmt(target)}kcal, 단백질 ${fmt(plan.macros.protein.target)}g이에요. ${experienceText}${sexText}${activityText} ${goalAdvice[goal] || "저장된 기록을 기준으로 살펴볼게요."} ${recovery || recoveryConcern || lowEnergy ? "회복이나 섭취 부족 신호가 있으면 감량 수치를 밀어붙이지 않아요." : "계산은 시작점이며 실제 필요량은 다를 수 있어요."}${saved ? " 현재 프로필로 다시 계산하지 않았어요." : ""}`, saved ? "nav-trends" : "nav-profile");
    const sport = sports.length > 1 ? "mixed" : sports[0] || plan.context?.guidanceSport || "none";
    const sportAdvice = {
      strength: "근력 운동은 하루 단백질을 식사에 나누어 챙기고 탄수화물도 빠뜨리지 않는 구성이 좋아요. 세트·중량이나 통증 정보 없이 훈련량을 늘리라고 하지는 않아요.",
      running: "달리기는 식사에서 탄수화물을 빠뜨리지 않으면서 운동 중 소화 반응도 확인해 주세요.",
      cycling: "자전거는 이동 시간과 강도에 따라 보급 여건이 달라요. 긴 라이딩의 세부 보급량은 출발 시각·기간·평소 소화 경험을 확인한 뒤 정해야 해요.",
      swimming: "수영을 마친 뒤 먹을 수 있는 식사를 미리 준비해 두면 실제 식사로 이어가기 쉬워요. 수영 중 느낀 허기만으로 하루 섭취를 판단하지 않아요.",
      team: "구기 운동은 경기·훈련의 길이와 휴식이 달라요. 탄수화물과 단백질이 함께 있는 익숙한 식사를 준비하고 경기 일정은 별도로 확인해야 해요.",
      mixed: "여러 종목은 각각 실제로 한 시간만 반영했어요. 같은 시간대를 두 세션으로 중복 기록하지 않았는지 확인해 주세요.",
      walking: "걷기 기록만으로 장거리 경기용 보급이나 보충제가 필요하다고 판단하지 않아요. 평소 식사를 유지하며 허기를 살펴보세요.",
      none: "실제 운동 기록은 아직 없어요. 운동 여부와 별개로 평소 식사는 챙기고, 운동했다면 기록을 더해 주세요."
    }[sport];
    const trainingAnswer = sessionRows.length ? `기록한 운동은 ${sports.map(sport => sportNames[sport]).join("·")} ${fmt(sessionMinutes)}분이에요. ${exerciseEnergyText(plan)} 같은 운동 열량을 한 번 더 더하지 마세요. ${sportAdvice}` : `${checkin.trainingPlan === "planned" ? "운동 예정이라고 알려 주셨지만 실제 완료한 운동이 아니라 소모량에 더하지 않았어요." : checkin.trainingPlan === "rest" ? "휴식 계획이고 실제 운동 기록이 없어 기본 활동 목표를 보고 있어요." : "입력된 운동이 없어 추가 운동 소모를 계산하지 않았어요. 평소 종목을 고른 것만으로 오늘 운동을 했다고 판단하지 않아요."} ${sportAdvice}`;
    question("training", sessionRows.length ? "오늘 운동 후 식사는 어떻게 챙길까요?" : "오늘 운동 계획에 맞춰 준비할까요?", `${trainingAnswer}${constraintAdvice ? " " + constraintAdvice : ""}${recoveryConcern ? " 알려 준 회복 신호가 있어 식사를 줄이거나 운동을 더해 맞추지는 마세요." : ""}`, complete ? "nav-trends" : sessionRows.length ? "meal-add" : checkin.trainingPlan === "planned" ? "session-add" : "coach-checkin");
    const compositionAnswer = plan.context?.bodyFatUsable
      ? `${plan.context.bodyFatReferenceDate || "기록된 날짜"}의 체중 ${fmt(plan.context.bodyFatReferenceWeightKg, 1)}kg과 체지방률을 짝지어 제지방 참고량 ${fmt(plan.context.ffmKg, 1)}kg을 계산했어요. 측정 오차와 경과 시간·체중 변화에 따라 반영 정도를 낮춰요. 이 값으로 근육이 늘거나 줄었다고 단정하지 않아요.`
      : "측정 당시 체중, 날짜와 측정 방법이 함께 확인된 체성분만 목표 보정에 써요. 정보가 없거나 오래되면 현재 체중으로 과거 체지방률을 재계산하지 않아요. 골격근량도 제지방량으로 환산하지 않아요.";
    question("composition", "체성분은 얼마나 믿어도 되나요?", compositionAnswer, complete ? "nav-trends" : "measurement");
    question("trend", "최근 흐름을 보면 목표를 바꿔야 하나요?", `선택한 날 전 최근 28일에 완료한 식사 기록은 ${recent.completedDays}일, 같은 목표로 비교 가능한 기록은 ${recent.comparableDays}일이에요. ${recent.weeklyWeightChangeKg === null ? "체중은 최근 두 주에 각각 3회 이상, 충분히 떨어진 날짜의 측정이 더 필요해요." : `체중 추세는 주당 ${recent.weeklyWeightChangeKg >= 0 ? "+" : ""}${fmt(recent.weeklyWeightChangeKg, 2)}kg이지만 수분과 측정 조건도 포함돼요.`} 현재 정보로 섭취량을 자동 변경하거나 체지방 증감을 단정하지 않아요.`, "nav-trends");
    question("allocation", "탄수·지방 배분을 바꾸면 어떻게 되나요?", allocation && Math.abs(allocation.appliedCarbDeltaG) > 0.5 ? `선택한 배분을 반영해 탄수 ${fmt(plan.macros.carbs.target)}g, 지방 ${fmt(plan.macros.fat.target)}g을 기준으로 보고 있어요. 탄수와 지방을 열량 기준으로 교환하므로 총열량과 단백질은 그대로예요. 이미 먹은 양을 따라 자동으로 목표를 옮기지는 않아요.` : "탄수화물 25g과 지방 약 11.1g은 각각 약 100kcal예요. 가능한 범위 안에서 둘을 교환하면 총열량과 단백질을 유지할 수 있어요. 먹기 편한 배분을 직접 고르는 설정이에요.", null);
    question("recovery", "몸이 힘든 날은 어떻게 할까요?", recoveryConcern ? `${reportedConcerns.join("·")}를 알려 주셨어요. 지금은 식사를 더 깎거나 추가 운동으로 맞출 때가 아니라, 식사 누락과 쉬는 시간을 확인할 때예요. ${constraintAdvice || "알려 준 상태가 지속되거나 일상·운동에 지장을 주면 전문가와 개별적으로 살펴 주세요."} 이 앱은 원인이나 질환을 진단하지 않아요.` : `${missingCore.length ? "오늘 컨디션·허기·수면이 아직 전부 확인되지 않았어요." : "알려 준 체크인에서 낮은 컨디션·강한 허기·낮은 수면 신호는 없지만 건강하다는 판정은 아니에요."} ${constraintAdvice || "몸이 힘들다면 먼저 아는 상태를 알려 주세요. 숫자에 맞추기 위해 식사를 거르거나 운동으로 보상하지 않도록 같이 확인해요."}`, "coach-checkin");
    if (!complete && meals.length) question("finish", "오늘 기록은 언제 마무리할까요?", "먹은 식사·간식·음료와 실제 운동이 모두 기록됐는지 확인해 주세요. 전부 맞으면 하루를 완료하면 돼요. 그때의 목표를 함께 저장하므로 나중에 기준이 바뀌어도 이 날의 비교 기준은 남아요.", "complete");
    const summary = `${saved ? "저장 당시 기준" : goalText} · 식사 ${meals.length}건 ${complete ? "완료" : "기록 중"} · ${sessionRows.length ? `운동 ${fmt(sessionMinutes)}분` : "운동 기록 없음"}`;
    return finish(complete ? "complete" : "recording", priorities, summary);
  }

  function buildFacts(coach, day = {}) {
    const context = coach?.context || {}, facts = [];
    const add = (id, label, value, unit, source, date = context.date, estimated = false) => {
      if (finite(value)) facts.push({ id, label, value, unit, source, date: dateNumber(date) === null ? null : date, estimated });
    };
    add("today.mealCount", "기록된 식사 수", context.mealCount, "건", "meal-record");
    if (context.mealCount > 0) for (const key of ["kcal", "protein", "carbs", "fat", "alcoholG"]) add(`today.intake.${key}`, `기록된 ${key}`, context.totals?.[key], key === "kcal" ? "kcal" : "g", "meal-record");
    add("today.target.kcal", "섭취 시작 목표", context.targetKcal, "kcal", context.planSource, context.date, true);
    for (const key of ["protein", "carbs", "fat"]) for (const bound of ["min", "target", "max"]) add(`today.target.${key}.${bound}`, `${key} ${bound}`, context.macroTargets?.[key]?.[bound], "g", context.planSource, context.date, true);
    add("today.exercise.kcal", "운동 순소모 추정", context.exerciseKcal, "kcal", "exercise-model", context.date, true);
    add("today.exercise.minutes", "기록한 실제 운동 시간", context.sessionMinutes, "분", "session-record");
    add("profile.trainingYears", "입력한 실제 운동 경력", context.trainingYears, "년", "profile");
    for (const key of ["weightKg", "bodyFatPct", "skeletalMuscleKg"]) add(`measurement.${key}`, key, day[key], key === "bodyFatPct" ? "%" : "kg", "measurement");
    add("recent.completedDays", "최근 완료한 식사 기록", context.recent?.completedDays, "일", "completed-days");
    add("recent.comparableDays", "같은 목표로 비교 가능한 날짜", context.recent?.comparableDays, "일", "saved-targets");
    add("recent.windowDays", "영양 비교 기간", context.recent?.windowDays, "일", "record-window");
    if (context.training?.available) add("training.windowDays", "훈련 집계 기간", 28, "일", "record-window");
    add("recent.weeklyWeightChangeKg", "측정 체중의 주간 변화 추정", context.recent?.weeklyWeightChangeKg, "kg", "weight-observations", context.date, true);
    const training = context.training;
    for (const key of ["workingSets", "unknownEffortSets", "unresolvedExercises", "daysWithRecords"]) add(`training.${key}`, key, training?.coverage?.[key], key === "daysWithRecords" ? "일" : key === "unresolvedExercises" ? "종목" : "세트", "training-records");
    (training?.muscles || []).forEach(row => {
      for (const key of ["directSets", "indirectSets"]) add(`muscle.${row.id}.${key}`, `${row.label} ${key === "directSets" ? "직접" : "간접"} 기록`, row[key], "세트", "exercise-classification");
    });
    (training?.progression || []).slice(0, 12).forEach((row, index) => {
      for (const period of ["previous", "current"]) {
        const point = row.observed?.[period] || row[period];
        for (const key of ["loadKg", "reps", "rir"]) add(`progression.${index}.${period}.${key}`, `${row.label} ${period === "current" ? "최근" : "이전"} ${key}`, point?.[key], key === "loadKg" ? "kg" : "회", "training-records", point?.date);
      }
    });
    return facts;
  }

  return Object.freeze({ VERSION, buildCoach, buildFacts, summarizeTraining, progressionObservation });
});
