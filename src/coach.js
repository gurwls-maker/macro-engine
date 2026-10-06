(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./nutrition.js") : root.MacroNutrition, node ? require("./insights.js") : root.MacroInsights,
    node ? require("./coach-context.js") : root.MacroCoachContext, node ? require("./training.js") : root.MacroTraining);
  if (node) module.exports = api;
  root.MacroCoach = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Nutrition, Insights, DecisionContext, Training) {
  "use strict";

  const VERSION = "9.3-evidence-coach-v2";
  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const fmt = (value, digits = 0) => finite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "미확인";
  const goalNames = { lose: "체지방 감량", maintain: "체중 유지", gain: "근육 증가", recomp: "체성분 개선", performance: "운동 수행" };
  const sportNames = { none: "일상 활동", strength: "근력 운동", running: "달리기", cycling: "자전거", swimming: "수영", team: "구기 운동", mixed: "복합 운동", walking: "걷기" };
  const actionLabels = { "nav-profile": "내 기준 확인", "meal-add": "식사 기록", "session-add": "운동 시간 기록", measurement: "체중·체성분 기록", complete: "하루 기록 완료", "nav-trends": "기록과 추세 보기", reopen: "이 날 기록 확인", "coach-checkin": "오늘 상태 알려주기", "nav-training": "훈련 기록 살펴보기", "nav-program": "훈련 계획 살펴보기", "coach-memory": "목표와 제약 남기기", "tracking-scope": "기록 범위 선택" };
  const checkinOptions = { energy: ["low", "okay", "good"], hunger: ["low", "okay", "high"], sleep: ["poor", "okay", "good"], trainingPlan: ["rest", "planned"], mealConstraint: ["none", "busy", "low-appetite", "digestive"], performance: ["down", "steady", "up"], illness: ["none", "active", "recovering"], pain: ["none", "mild", "stop"], fatigue: ["low", "usual", "high"], interruptionReason: ["travel", "illness", "schedule", "planned-break", "other"] };
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
    return { ...Object.fromEntries(Object.entries(checkinOptions).map(([key, values]) => [key, values.includes(value?.[key]) ? value[key] : null])),
      sleepHours: finite(value?.sleepHours) ? value.sleepHours : null };
  }

  function mealConstraintAdvice(checkin) {
    if (checkin.mealConstraint === "busy") return "바쁜 날에는 준비가 덜 필요한 식사부터 정해 두죠. 평소 문제없이 먹어 온 주식과 단백질 식품 한 가지씩이면 시작하기 편해요.";
    if (checkin.mealConstraint === "low-appetite") return "입맛이 없다면 한 번에 몰아 먹지 말고, 잘 먹히는 음식으로 조금씩 나눠 보세요. 식욕 저하가 계속된다면 식단 조정만으로 넘기지는 마세요.";
    if (checkin.mealConstraint === "digestive") return "속이 불편하다면 목표량을 억지로 채우기보다 잘 견디는 음식과 양부터 찾죠. 불편이 심하거나 반복되면 원인을 따로 확인해야 해요.";
    return "";
  }

  function item(id, title, body, action, options = {}) {
    return { id, title, body, action: action || null, actionLabel: actionLabels[action] || null, tone: "info", kind: "context", confidence: "medium", source: "day", evidence: {}, ...options };
  }

  function healthAdvice(profile, day, history, options, decision) {
    const date = day.date, days = [];
    for (const row of [...(Array.isArray(history) ? history : Object.values(history || {})), ...Object.values(options.state?.days || {}), day]) {
      if (dateNumber(row?.date) !== null && row.date <= date) days.push(row);
    }
    const recordsById = new Map(), conflictingIds = new Set();
    for (const row of options.state?.training?.records || options.training?.records || []) {
      if (!text(row?.id) || dateNumber(row?.date) === null || row.date > date) continue;
      const previous = recordsById.get(row.id);
      if (previous && (previous.date !== row.date || previous.pain !== row.pain)) conflictingIds.add(row.id);
      else recordsById.set(row.id, row);
    }
    const records = [...recordsById.values()].filter(row => !conflictingIds.has(row.id));
    let reports = ["illness", "pain"].map(field => {
      const allowed = field === "illness" ? ["none", "recovering", "active"] : ["none", "mild", "stop"];
      const entries = days.filter(row => allowed.includes(row.coachCheckin?.[field])).map(row => ({ date: row.date, value: row.coachCheckin[field] }));
      if (field === "pain") entries.push(...records.filter(row => dateNumber(row?.date) !== null && row.date <= date && allowed.includes(row.pain)).map(row => ({ date: row.date, value: row.pain })));
      const row = entries.sort((a, b) => a.date.localeCompare(b.date) || allowed.indexOf(a.value) - allowed.indexOf(b.value)).at(-1);
      return row && row.value !== "none" ? { field, date: row.date, value: row.value } : null;
    }).filter(Boolean);
    const canonicalRecovery = decision?.training?.recoveryWindow?.to === date ? decision.training.recovery
      : options.state && options.trainingAnalysis?.windowEnd === date ? options.trainingAnalysis.recovery : null;
    if (Array.isArray(canonicalRecovery?.healthReports)) reports = canonicalRecovery.healthReports.filter(row => dateNumber(row?.date) !== null
      && row.date <= date && ["illness", "pain"].includes(row.field) && checkinOptions[row.field].includes(row.value) && row.value !== "none")
      .map(row => ({ field: row.field, date: row.date, value: row.value }));
    const current = reports.filter(row => row.date === date), unresolved = reports.filter(row => row.date < date);
    const descriptions = reports.map(row => `${row.date}에 ${row.field === "illness" ? row.value === "active" ? "아픈 상태라고" : "질병 뒤 회복 중이라고" : row.value === "stop" ? "운동을 멈춰야 할 정도의 통증이 있다고" : "통증이 있다고"} 알려 주셨어요.`).join(" ");
    let kind, title, body;
    if (current.some(row => row.value === "active" || row.value === "stop")) {
      kind = "stop"; title = "지금은 운동보다 쉬며 상태 확인이 먼저예요";
      body = `${descriptions} 운동으로 만회하지 말고 쉬며 현재 증상을 확인해요. 흉통·호흡 곤란·실신이나 심한 증상이 있으면 즉시 의료 도움을 받아요. 회복 후 운동은 개별 지침과 증상 반응에 맞춰 다시 시작해요.`;
    } else if (unresolved.length) {
      kind = "health-follow-up"; title = "마지막으로 알려 준 몸 상태부터 확인해요";
      body = `${descriptions} 그때 알려 준 몸 상태가 지금도 이어지는지는 아직 새로 확인되지 않았어요. 이전 기록을 회복이 끝났다는 뜻으로 보지 않고, 다음 운동 전에 현재 상태부터 확인해요. 아프거나 불편한 동작은 쉬고, 계속되거나 심해지는 증상은 개별 평가를 받아요.`;
    } else if (current.some(row => row.field === "pain")) {
      kind = "pain-review"; title = "아픈 동작은 멈추고 다음 부담을 정해요";
      body = `${descriptions} 아픈 동작은 계속 밀거나 더 늘리지 말고 빼거나 쉬어가요. 통증이 지속되거나 악화하면 개별 평가를 받아 다음 운동을 정해요.`;
    } else if (current.some(row => row.value === "recovering")) {
      kind = "illness-return"; title = "회복 중에는 다음날 반응까지 보고 이어가요";
      body = `${descriptions} 바로 운동량을 늘리기보다 운동 중·직후와 다음날 반응부터 확인해요. 증상이 다시 심해지면 쉬고 개별 평가를 받아요. 안정적으로 회복되면 익숙한 구성부터 차근차근 이어가요.`;
    } else {
      const readiness = options.trainingAnalysis?.recovery?.current || decision?.training?.recovery?.current;
      const activity = [...(decision?.activity?.current || []), ...(decision?.activity?.latest || [])]
        .find(row => row.action?.kind === "current-recovery");
      if ((readiness?.date === date && readiness.strong) || activity) {
        kind = "current-recovery"; title = "오늘 알려 준 몸 상태에 맞춰 부담을 확인해요";
        body = decision?.scope.trainingEnabled === false
          ? "오늘 알려 준 피로·컨디션을 먼저 챙겨요. 식사를 더 줄이기보다 평소 끼니와 수면을 이어가며 쉴 여유를 두세요. 상태가 계속 나쁘면 개별적으로 살펴 주세요."
          : "오늘 알려 준 피로·컨디션을 먼저 챙겨요. 다음 운동은 편한 준비 구간에서 호흡·동작을 확인하고, 평소보다 버거우면 짧게 마치거나 쉬어가요. 몸 상태가 돌아온 뒤에 진행 선택을 이어갈 수 있어요.";
      }
    }
    const clinical = profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80);
    if (clinical) {
      if (!kind) { kind = "individual-care"; title = "지금은 개별 지침에 맞춰 부담을 정해요"; body = "실제로 한 운동과 식사 기록은 그대로 남겨 둘게요."; }
      body += " 현재 건강·연령 조건에 맞는 운동과 식사는 담당 전문가의 지침을 우선해 주세요.";
    }
    return kind ? { kind, title, body, reports, suppressRecordedActions: ["stop", "health-follow-up"].includes(kind) } : null;
  }

  function alignHealthAdvice(result, advice) {
    if (!advice) return result;
    result.context.currentHealthAdvice = advice;
    const action = advice.kind === "individual-care" ? "nav-profile" : "coach-checkin";
    const id = advice.reports.length && advice.reports.every(row => row.field === "pain" && row.date === result.context.date) ? "current-pain" : "current-health";
    const existingCare = advice.kind === "individual-care" ? result.priorities.find(row => ["current-care", "recording-care", "scope"].includes(row.id) && row.kind === "safety") : null;
    const safety = existingCare || item(id, advice.title, advice.body, action, {
      kind: "safety", tone: "attention", confidence: "high", source: "reported-health", evidence: { reports: advice.reports, diagnostic: false } });
    result.priorities = [safety, ...result.priorities.filter(row => row !== existingCare && !["training-safety", "training-recovery", "checkin-recovery", "current-health", "current-pain", "current-recovery"].includes(row.id)
      && (!advice.suppressRecordedActions || !["training-record-scope", "training-planned", "training-unknown", "rest-plan"].includes(row.id)))].slice(0, 3);
    result.questions = result.questions.filter(row => row.id !== "training-program").map(row => {
      if (["recovery", "training-deload"].includes(row.id)) return { ...row, answer: `${advice.body} 평소 끼니는 챙기고, 식사를 더 깎거나 추가 운동으로 맞추지는 마세요.`, action, actionLabel: actionLabels[action] };
      if (row.id === "training") return { ...row, answer: `${finite(result.context.sessionMinutes) && result.context.sessionMinutes > 0 ? `이 날 실제로 기록한 운동은 ${fmt(result.context.sessionMinutes)}분이에요. ` : ""}${advice.body} 운동 여부와 별개로 평소 먹는 끼니와 물은 챙겨 주세요.`, action, actionLabel: actionLabels[action] };
      return row;
    });
    if (!result.questions.some(row => row.id === "recovery")) result.questions.push({ id: "recovery", label: "몸이 힘든 날은 어떻게 할까요?", answer: `${advice.body} 평소 끼니도 챙겨 주세요.`, action, actionLabel: actionLabels[action] });
    result.headline = safety.title;
    return result;
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
      if (Insights.meaningfulMacroGap(totals.protein, target.macros.protein.min)) lowProtein.push(row.date);
    }
    const summary = Insights.historySummary(Object.fromEntries(all.map(row => [row.date, { date: row.date, weightKg: row.weightKg, complete: false, meals: [] }])), date, goal);
    return {
      windowDays: 28, completedDays: complete.length, comparableDays: comparable.length,
      lowEnergyDays: lowEnergy.length, highEnergyDays: highEnergy.length, lowProteinDays: lowProtein.length,
      dates: { lowEnergy, highEnergy, lowProtein },
      weightObservations: summary.weights.length, weeklyWeightChangeKg: summary.weeklyChange,
      weightChangeSource: { ...summary.weightChangeSource, includesSelectedDay: false },
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
  const exerciseDuration = (exercise, sourceExercise) => knownCount(exercise?.durationMinutes ?? sourceExercise?.durationMinutes);

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
      repeatedDeclines: knownCount(source.recovery?.repeatedDeclines), selfReportSignals: texts(source.recovery?.selfReportSignals),
      current: source.recovery?.current ? JSON.parse(JSON.stringify(source.recovery.current)) : null,
      historicalSignalRows: Array.isArray(source.recovery?.historicalSignalRows) ? JSON.parse(JSON.stringify(source.recovery.historicalSignalRows)) : []
    };
    for (const field of ["healthReports", "unresolvedHealthReports"]) {
      const reports = (Array.isArray(source.recovery?.[field]) ? source.recovery[field] : []).filter(row => dateNumber(row?.date) !== null
        && dateNumber(row.date) <= end && ["illness", "pain"].includes(row.field) && checkinOptions[row.field].includes(row.value));
      if (reports.length) recovery[field] = reports.map(row => ({ field: row.field, date: row.date, value: row.value }));
    }
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

  function exerciseEnergyText(plan, saved = false) {
    if (saved) return `완료 당시 목표에 포함했던 운동 순소모 추정은 약 ${fmt(plan.energy.exerciseKcal)}kcal예요. 당시 입력으로 저장한 값이며, 현재 표시된 실제 수행 시간을 새로 계산한 소모량은 아니에요.${plan.context?.dailyActivity?.mode === "detailed" ? " 당시 상세 시간표에서는 휴식을 운동으로 바꿔 계산했어요." : ""}`;
    return plan.context?.dailyActivity?.mode === "detailed"
      ? `운동 순소모는 약 ${fmt(plan.energy.exerciseKcal)}kcal로 추정돼요. 상세 시간표에서는 그 시간의 휴식을 운동으로 바꿔 계산했고, 결과는 목표에 이미 포함했어요.`
      : `운동의 순소모 추정 ${fmt(plan.energy.exerciseKcal)}kcal는 목표에 이미 포함돼요.`;
  }

  function projectSingleSetProposal(value, sets, focusSetIds) {
    const keys = ["kind", "setId", "loadKg", "baseReps", "targetReps"];
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
      || !keys.every(key => Object.hasOwn(value, key)) || value.kind !== "single-set-reps") return null;
    const source = (Array.isArray(sets) ? sets : []).find(set => set.id === value.setId && set.marker === null);
    if (!source || !Array.isArray(focusSetIds) || focusSetIds.length !== 1 || focusSetIds[0] !== source.id || source.loadKg !== value.loadKg || source.reps !== value.baseReps
      || !Number.isInteger(value.baseReps) || value.baseReps < 1 || !Number.isInteger(value.targetReps)
      || value.targetReps !== value.baseReps + 1 || value.targetReps > 100000
      || value.loadKg !== null && (!finite(value.loadKg) || value.loadKg < 0)) return null;
    return { kind: "single-set-reps", setId: source.id, loadKg: source.loadKg, baseReps: source.reps, targetReps: value.targetReps };
  }

  function projectPlanEffort(value, exercise, date, sessionId, blockId) {
    const source = value?.source;
    if (!source || source.date !== date || source.recordId !== sessionId || !text(source.assignmentId) || !text(source.targetId)
      || !finite(value.targetRir) || value.targetRir < 0 || value.targetRir > 10 || !Array.isArray(value.matchedSets) || !value.matchedSets.length
      || !Array.isArray(value.belowSets) || !Array.isArray(value.unknownSetIds)) return null;
    const current = new Map(exercise.sets.filter(set => set.marker === null).map(set => [set.id, set]));
    const ids = new Set();
    const matchesActual = set => {
      const actual = current.get(set?.id);
      return actual && actual.loadKg === set.loadKg && actual.reps === set.reps && actual.rir === set.rir;
    };
    for (const set of value.matchedSets) {
      if (!matchesActual(set) || ids.has(set.id)) return null;
      ids.add(set.id);
    }
    const below = value.matchedSets.filter(set => finite(set.rir) && set.rir < value.targetRir);
    const unknown = value.matchedSets.filter(set => set.rir === null).map(set => set.id);
    if (below.length !== value.belowSets.length || value.belowSets.some((set, index) => !matchesActual(set) || set.id !== below[index].id)
      || unknown.length !== value.unknownSetIds.length || value.unknownSetIds.some((id, index) => id !== unknown[index])) return null;
    const project = set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps, rir: set.rir });
    return { basis: "saved-prescription-comparison",
      target: { rir: value.targetRir, estimated: true, basis: "saved-prescription-target",
        source: { kind: "saved-assignment-target", assignmentId: source.assignmentId, date: source.date,
          recordId: source.recordId, targetId: source.targetId } },
      actual: { source: { date, sessionId, blockId }, matchedSets: value.matchedSets.map(project),
        belowSets: value.belowSets.map(project), unknownSetIds: unknown } };
  }

  function summarizeExerciseCoaching(row, exercise, sourceExercise, date, sessionId) {
    const coaching = row.interpretation.coaching;
    const action = value => {
      if (!value) return null;
      const projected = { kind: text(value.kind), title: text(value.title), body: text(value.body),
        focusSetIds: texts(value.focusSetIds).slice(0, 24), preservedSetIds: texts(value.preservedSetIds).slice(0, 24) };
      const proposal = ["reps-option", "progression-option"].includes(value.kind) ? projectSingleSetProposal(value.proposal, exercise.sets, projected.focusSetIds) : null;
      return proposal ? { ...projected, proposal } : projected;
    };
    const primary = action(coaching?.primaryAction || row.interpretation.nextAction);
    const candidate = action(coaching?.progressionCandidate);
    const originalSupport = Array.isArray(coaching?.supportingActions) ? coaching.supportingActions : [];
    const support = originalSupport.slice(0, 12).map(action);
    const wanted = new Set([primary?.proposal?.setId, candidate?.proposal?.setId, ...(primary?.focusSetIds || []), ...(primary?.preservedSetIds || []), ...support.flatMap(value => value.focusSetIds)].filter(Boolean));
    const observation = (value, preserveAll = false) => {
      if (!value) return null;
      const original = Array.isArray(value.sets) ? value.sets : [];
      const selectedIds = new Set([...original.filter(set => wanted.has(set.id)), ...original].slice(0, 12).map(set => set.id));
      const chosen = preserveAll ? original : original.filter(set => selectedIds.has(set.id));
      const warmup = Array.isArray(value.warmupSets) ? value.warmupSets : [];
      const chosenWarmup = preserveAll ? warmup : warmup.slice(0, 12);
      const source = value.source || {};
      return { date: source.date || date, source: { date: source.date || date,
        sessionId: text(source.sessionId) || sessionId, blockId: text(source.blockId) || row.blockId,
        setIds: chosen.map(set => text(set.id)).filter(Boolean) },
        setCount: knownCount(value.setCount ?? original.length), totalReps: knownCount(value.totalReps),
        maxLoadKg: knownCount(value.maxLoadKg), originalSetCount: original.length, sampled: chosen.length < original.length,
        sets: chosen.map(set => ({ id: text(set.id), loadKg: knownCount(set.loadKg), reps: knownCount(set.reps), rir: knownCount(set.rir), marker: null })),
        originalWarmupSetCount: warmup.length, warmupSampled: chosenWarmup.length < warmup.length,
        warmupSets: chosenWarmup.map(set => ({ id: text(set.id), loadKg: knownCount(set.loadKg), reps: knownCount(set.reps), marker: "W" })),
        ...(knownCount(value.durationMinutes) !== null ? { durationMinutes: knownCount(value.durationMinutes) } : {}) };
    };
    const current = observation(coaching?.facts?.current, true) || { date, source: { date, sessionId, blockId: row.blockId,
      setIds: exercise.sets.map(set => text(set.id)) }, originalSetCount: exercise.sets.length,
      sampled: false, sets: exercise.sets.map(set => ({ ...set })) };
    if (current.source.date === date && current.source.sessionId === sessionId && current.source.blockId === row.blockId) {
      current.durationMinutes = exerciseDuration(exercise, sourceExercise);
      const general = exercise.sets.filter(set => set.marker === null);
      current.sets = general.map(set => ({ ...set }));
      current.source.setIds = general.map(set => text(set.id)).filter(Boolean);
      current.setCount = general.length;
      current.originalSetCount = general.length;
      current.sampled = false;
      current.totalReps = general.every(set => finite(set.reps)) ? general.reduce((sum, set) => sum + set.reps, 0) : null;
      current.warmupSets = exercise.sets.filter(set => set.marker === "W").map(set => ({ ...set }));
      current.originalWarmupSetCount = current.warmupSets.length;
      current.warmupSampled = false;
      const marked = exercise.sets.filter(set => set.marker !== null && set.marker !== "W");
      if (marked.length) current.markedSets = marked.map(set => ({ ...set }));
    }
    const sourceAnswer = sourceExercise?.coachingAnswer || exercise.coachingAnswer;
    const annotation = sourceAnswer ? { topic: text(sourceAnswer.topic), answer: text(sourceAnswer.answer),
      originalSetCount: sourceAnswer.sets.length, sampled: false,
      sets: sourceAnswer.sets.map(set => ({ ...set })) } : null;
    const episode = coaching?.facts?.recentChange;
    const recentChange = episode ? { since: episode.since, currentSince: episode.currentSince,
      currentDays: episode.currentDays.slice(), observationDays: episode.observationDays, spanDays: episode.spanDays,
      baseline: observation(episode.baseline), baselineDates: episode.baselineDates.slice(),
      originalStageCount: episode.stages.length, stagesSampled: episode.stages.length > 6,
      stages: episode.stages.slice(-6).map(stage => ({ dates: stage.dates.slice(), work: observation(stage.work) })) } : null;
    const workStages = coaching?.facts?.recordedWorkStages;
    const recordedWorkStages = workStages ? { scope: text(workStages.scope), from: workStages.from, to: workStages.to,
      stageCount: knownCount(workStages.stageCount), retainedStageCount: knownCount(workStages.retainedStageCount), sampled: workStages.sampled === true,
      stages: workStages.stages.map(stage => ({ dates: stage.dates.slice(),
        work: observation(stage.work, stage.work?.source?.date === date && stage.work?.source?.sessionId === sessionId && stage.work?.source?.blockId === row.blockId),
        sourceRefs: stage.sourceRefs.map(source => ({ ...source, setIds: source.setIds.slice() })) })) } : null;
    const planEffort = projectPlanEffort(coaching?.planEffort, exercise, date, sessionId, row.blockId);
    return { blockId: row.blockId, label: row.label, rawName: row.rawName, date,
      exerciseId: exercise.exerciseId, equipmentKey: exercise.equipmentKey, loadConvention: exercise.loadConvention,
      loadRole: exercise.loadRole, variantKey: exercise.variantKey,
      ...(planEffort ? { planEffort } : {}),
      actual: { current, previous: observation(coaching?.facts?.previous),
        ...(recentChange ? { recentChange } : {}),
        ...(recordedWorkStages ? { recordedWorkStages } : {}),
        ...(exercise.feedback ? { feedback: { ...exercise.feedback } } : {}), ...(annotation ? { coachingAnswer: annotation } : {}) },
      hypotheses: { basis: "product-interpretation", assessment: text(coaching?.assessment || row.interpretation.summary),
        ...(episode ? { recentChange: { kind: episode.kind, since: episode.since, basis: "product-interpretation" } } : {}),
        ...(coaching?.healthFollowUp?.reports?.length ? { healthFollowUp: { basis: "product-choice", currentStatusVerified: false,
          reports: coaching.healthFollowUp.reports.map(report => ({ field: report.field, date: report.date, value: report.value, source: "reported-health" })) } } : {}),
        signals: (Array.isArray(coaching?.signals) ? coaching.signals : []).slice(0, 16).map(signal => ({ kind: text(signal.kind),
          sourceRefs: (Array.isArray(signal.sourceRefs) ? signal.sourceRefs : []).slice(0, 6).map(source => ({ date: source.date,
            sessionId: text(source.sessionId), blockId: text(source.blockId), originalSetCount: Array.isArray(source.setIds) ? source.setIds.length : null, setIds: texts(source.setIds).slice(0, 12) })) })) },
      advice: { basis: "product-choice", primaryAction: primary, supportingActions: support,
        originalSupportingActionCount: originalSupport.length, supportsSampled: originalSupport.length > support.length,
        progressionCandidate: candidate,
        userAnswer: coaching?.userAnswer ? { topic: text(coaching.userAnswer.topic), answer: text(coaching.userAnswer.answer), setIds: texts(coaching.userAnswer.setIds).slice(0, 24) } : null,
        question: coaching?.question || null } };
  }

  function sessionCompositionMeaning(review, actions, sourceExercises) {
    const selected = new Set(actions.map(action => action.blockId)), muscles = new Map();
    for (const exercise of review.session.exercises) {
      const movement = Training.catalog.find(item => item.id === exercise.exerciseId);
      const sets = exercise.sets.filter(set => set.marker === null && set.reps > 0).length;
      if (!sets) continue;
      for (const id of movement?.primaryMuscles || []) muscles.set(id, (muscles.get(id) || 0) + sets);
    }
    const labels = [...muscles].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => Training.muscleLabels[id] || id);
    const others = review.rows.filter(row => !selected.has(row.blockId) && row.sets.some(set => set.marker === null && set.reps > 0)).slice(0, 2);
    const sourceById = new Map((Array.isArray(sourceExercises) ? sourceExercises : []).map(exercise => [exercise.id, exercise]));
    const timed = review.session.exercises.map(exercise => ({ ...exercise, durationMinutes: exerciseDuration(exercise, sourceById.get(exercise.id)) }))
      .filter(exercise => exercise.durationMinutes !== null);
    const focus = labels.length ? `${timed.length ? "세트 운동은" : "이번 운동 전체는"} ${labels.join("·")} 중심 구성이에요.` : "";
    const otherWork = others.length ? `${others.map(row => row.rawName || row.label).join("·")}도 실제 수행에 함께 남겼어요.` : "";
    const timedWork = timed.length ? `시간 기록은 ${timed.map(exercise => `${exercise.rawName || Training.catalog.find(item => item.id === exercise.exerciseId)?.label || "운동"} ${fmt(exercise.durationMinutes, 1)}분`).join(" · ")}이에요.` : "";
    return [focus, otherWork, timedWork].filter(Boolean).join(" ");
  }

  function restDeloadAnswer(training, activities = [], selectedDate = null) {
    const session = training?.sessionCoaching, recovery = training?.recovery;
    const rows = (session?.exerciseContexts || []).filter(row => row.advice?.primaryAction);
    const progress = new Set(["progression-option", "reps-option", "load-option"]);
    const reduction = new Set(["review-recent-reduction", "reestablish-working-reps", "keep-reduced-work", "check-intent"]);
    const adjustment = new Set(["plan-check", "plan-effort-check", "plan-set-recovery", "hold-limit-set", "ease", "restore-tail", "keep-base-check-heavy", "rebalance-tail", "recheck-unexpected-work"]);
    const changed = new Set(["consolidate-heavy", "consolidate-raised-load", "consolidate-recent-expansion", "consolidate-recent-performance", "hold-expanded-work", "hold-redistributed-work", "repeat-rebuilt-work", "maintain-base", "reestablish-recorded-work"]);
    const activityReduction = new Set(["reduced-work", "shortened-configuration", "shorter-faster-work"]);
    const activityProgress = new Set(["one-variable-option", "practice-task", "hybrid-task"]);
    const kinds = rows.map(row => row.advice.primaryAction.kind);
    const purpose = { deload: "계획한 디로드를 이어가세요. 빠진 운동을 보충하지 말고, 정한 기간 뒤 편한 준비 운동에서 다음 부담을 확인해요.",
      light: "가볍게 운동하려는 목적을 지키세요. 편하게 마칠 수 있는 부담으로 운동하고, 평소 운동으로 돌아갈 때 상태를 확인하면 돼요.",
      technique: "지금은 디로드나 증량보다 동작 연습을 이어가는 쪽이 맞아요. 같은 가동범위와 제어를 재현하는 데 집중하세요.",
      "time-limited": "시간이 부족한 날로 남겼어요. 다음에는 가능한 시간에 우선할 운동부터 이어가면 돼요. 못한 운동이 있어도 몰아서 보충하지 않아요.",
      return: "복귀 단계에서는 바로 더 늘리지 말고, 편한 준비 운동부터 이어가세요. 실제로 해낸 부담과 운동 중·다음 날의 반응을 보고 다음 단계를 정해요.",
      test: "기록 확인용 운동 뒤에는 그 중량을 곧바로 평소 운동의 시작값으로 삼지 마세요. 다음에는 여러 번 제어할 수 있는 익숙한 부담부터 확인해요." };
    const purposeAtDate = (intent, sourceDate) => {
      if (!selectedDate || !sourceDate || sourceDate === selectedDate) return purpose[intent];
      const previousPurpose = {
        deload: `${sourceDate} 기록은 디로드 목적으로 남겼어요. 지금도 그 기간을 이어가는 중이라면 부담을 낮추려는 목적을 지키고, 기간을 마쳤다면 편한 준비 운동에서 다음 부담을 확인해요. 못한 운동이 있어도 몰아서 보충하지 않아요.`,
        light: `${sourceDate} 기록은 가볍게 운동하려는 목적으로 남겼어요. 다음에도 가볍게 할 생각이라면 편하게 마칠 수 있는 부담으로 이어가고, 평소 운동으로 돌아간다면 준비 운동에서 상태를 확인해요.`,
        technique: `${sourceDate} 기록은 동작 연습 목적으로 남겼어요. 다음에도 연습이 우선이라면 같은 가동범위와 제어에 집중하고, 평소 수행을 목표로 할 때는 익숙한 부담에서 따로 확인해요.`,
        "time-limited": `${sourceDate}에 시간이 부족한 날로 남겼어요. 다음에는 가능한 시간에 우선할 운동부터 배치하고, 못한 운동이 있어도 몰아서 보충하지 않아요.`,
        return: `${sourceDate} 기록은 복귀 단계로 남겼어요. 지금도 복귀를 이어가는 중이라면 편한 준비 운동부터 시작하고, 실제로 해낸 부담과 운동 중·다음 날의 반응을 보고 다음 단계를 정해요.`,
        test: `${sourceDate} 기록은 수행 확인용으로 남겼어요. 그 중량을 평소 운동의 시작값으로 옮기기보다, 다음에는 여러 번 제어할 수 있는 익숙한 부담부터 확인해요.`
      };
      return previousPurpose[intent];
    };
    const declining = rows.filter(row => reduction.has(row.advice.primaryAction.kind));
    const effortRows = rows.filter(row => row.planEffort?.actual.belowSets.length);
    const altered = rows.filter(row => adjustment.has(row.advice.primaryAction.kind) || changed.has(row.advice.primaryAction.kind) || effortRows.includes(row));
    const advancing = rows.filter(row => progress.has(row.advice.primaryAction.kind));
    const activeReduction = activities.filter(row => activityReduction.has(row.action?.kind));
    let lead;
    if (recovery?.status === "stop" || ["mild", "stop"].includes(recovery?.pain)) lead = "통증이 생기는 동작은 중단하고, 심하거나 계속되는 증상은 의료진에게 확인해 주세요.";
    else if (recovery?.status === "review") lead = "다음에는 더 늘리기보다 부담을 낮추거나 쉴 여유를 두세요. 편한 준비 운동에서도 버겁다면 짧게 마치고, 최근 수면·피로와 함께 다음 부담을 정해요.";
    else if (purpose[session?.intent]) lead = `${activities.length ? "세트 운동: " : ""}${purposeAtDate(session.intent, training.lastSession?.date)}`;
    else if (activities.some(row => purpose[row.intent])) {
      const row = activities.find(row => purpose[row.intent]);
      lead = `${activities.length > 1 || rows.length ? `${row.label}: ` : ""}${purposeAtDate(row.intent, row.date)}`;
    }
    else if (declining.length || activeReduction.length || session?.pattern === "broad-reduction") lead = "지금은 더 늘리기보다 줄어든 구성을 먼저 편하게 이어가는 쪽을 권해요. 다음 준비 운동과 마지막 구간의 반응을 보고, 버겁다면 더 짧게 마치거나 쉬어가세요. 의도한 디로드였다면 줄인 양을 한꺼번에 되채우지 않아요.";
    else if (effortRows.length || kinds.includes("plan-effort-check")) lead = "전체 운동을 디로드하기보다는, 계획보다 여유가 적었던 세트의 부담부터 맞춰 보세요. 그 세트는 더 늘리지 않고 충분히 쉰 뒤, 정한 동작과 여유를 유지할 수 있게 조절해요.";
    else if (kinds.includes("plan-check")) lead = "전체 운동을 줄이기보다 계획과 달랐던 구간부터 맞춰 보세요. 의도해서 목표를 바꾼 것이라면 새 구성으로 이어가고, 목표를 채우기 버거웠다면 그 구간의 부담을 조절해요.";
    else if (altered.length) lead = "지금은 전체를 낮추기보다 바뀌었거나 버거웠던 구간을 먼저 다듬는 쪽을 권해요. 무거운 세트와 뒤 수행을 함께 보고, 추가 변화는 한꺼번에 겹치지 않아요.";
    else if (!rows.length && !activities.length) lead = "운동을 시작한다면 편한 준비 구간부터 호흡과 동작을 확인해 보세요. 몸이 힘든 날에는 쉬거나 짧게 마치고, 편하게 제어할 수 있는 범위에서 이어가면 돼요.";
    else if (recovery?.status === "watch") lead = "다음에는 지금 구성을 출발점으로 두고, 늘리기 전에 몸 상태를 살펴보세요. 유난히 힘들면 쉬거나 부담을 낮추고, 편하게 마쳤다면 다음 진행 선택을 이어가면 돼요.";
    else if (advancing.length || activities.some(row => activityProgress.has(row.action?.kind))) lead = "전체를 낮추는 디로드보다는 지금 구성을 이어가며, 여유가 있는 종목에서 작은 변화를 시험하는 쪽을 먼저 권해요. 반복·부하·시간을 한꺼번에 높이지 않아요.";
    else lead = "다음 운동은 지난 구성에서 이어갈 수 있어요. 몸이 힘든 날에는 쉬거나 부담을 낮추는 선택을 하고, 편하게 마칠 수 있는 범위부터 확인해요.";

    const sentences = body => text(body).match(/[\s\S]*?[.!?](?=\s|$)|[\s\S]+$/g)?.map(value => value.trim()).filter(Boolean) || [];
    const workText = (fact, row, ids) => {
      const sets = (fact?.sets || []).filter(set => !ids?.length || ids.includes(set.id));
      if (!sets.length) return finite(fact?.durationMinutes) ? `${fmt(fact.durationMinutes, 1)}분` : "";
      const groups = [];
      for (const set of sets) {
        const group = groups.at(-1);
        if (group && group.loadKg === set.loadKg) group.reps.push(set.reps);
        else groups.push({ loadKg: set.loadKg, reps: [set.reps] });
      }
      return groups.map(group => {
        const load = finite(group.loadKg) ? `${row.loadRole === "assistance" ? "보조 표기 " : ""}${group.loadKg}kg × ` : "";
        const reps = group.reps.length > 4 && group.reps.every(value => value === group.reps[0])
          ? `${fmt(group.reps[0])}회 ${group.reps.length}세트`
          : group.reps.length > 4 ? `${fmt(group.reps[0])}회부터 마지막 ${fmt(group.reps.at(-1))}회까지 ${group.reps.length}세트`
            : `${group.reps.map(value => fmt(value)).join("·")}회`;
        return load + reps;
      }).join(" / ");
    };
    const sameRecordedWork = (left, right) => {
      const leftSets = left?.sets || [], rightSets = right?.sets || [];
      if (leftSets.length || rightSets.length) return leftSets.length === rightSets.length
        && leftSets.every((set, index) => set.loadKg === rightSets[index].loadKg && set.reps === rightSets[index].reps);
      return finite(left?.durationMinutes) && left.durationMinutes === right?.durationMinutes;
    };
    const selected = [];
    const ordered = [...declining, ...altered, ...advancing, ...rows];
    const first = ordered[0];
    if (first) selected.push(first);
    const second = ordered.find(row => row !== first && row.advice.primaryAction.kind !== first?.advice.primaryAction.kind)
      || (declining.length > 1 ? declining[1] : null);
    if (second) selected.push(second);
    const conditions = new Map(), evidenceSources = [], snippets = [], sharedDirections = new Set();
    for (const row of selected) {
      const action = row.advice.primaryAction, current = row.actual?.current;
      const currentText = workText(current, row);
      if (current?.source) evidenceSources.push({ kind: "training-record", ...current.source });
      if (row.planEffort?.target?.source) evidenceSources.push(row.planEffort.target.source);
      const episode = row.actual?.recentChange;
      const returned = row.hypotheses?.recentChange?.kind === "returned";
      const episodeAction = returned || ["review-recent-reduction", "consolidate-recent-expansion", "consolidate-recent-performance"].includes(action.kind);
      const previous = episodeAction ? episode?.baseline || row.actual?.previous : row.actual?.previous;
      if (previous?.source) evidenceSources.push({ kind: "training-record", ...previous.source });
      const intermediate = returned || action.kind === "review-recent-reduction"
        ? (episode?.stages || []).map(stage => stage.work).filter(work => work?.source?.date < current?.source?.date
          && workText(work, row) && !sameRecordedWork(work, current) && !sameRecordedWork(work, previous)).at(-1) : null;
      if (intermediate?.source) evidenceSources.push({ kind: "training-record", ...intermediate.source });
      const returnedEvidence = returned && currentText && workText(previous, row)
        ? `${previous.source?.date || previous.date}의 ${workText(previous, row)} 구성을 다시 이어냈어요.${intermediate ? ` 중간 ${intermediate.source.date}에는 ${workText(intermediate, row)}를 남겼어요.` : ""} ` : "";
      let detail;
      if (purpose[session?.intent]) detail = currentText ? `${currentText}를 남겼어요.` : sentences(action.body).slice(0, 1).join(" ");
      else if (reduction.has(action.kind)) {
        const before = workText(previous, row), beforeDate = previous?.source?.date || previous?.date;
        detail = `${before && beforeDate ? `${beforeDate}의 ${before}에서 ` : ""}이번 ${currentText || "구성"}로 줄어든 흐름이에요.${intermediate ? ` 중간 ${intermediate.source.date}에는 ${workText(intermediate, row)}를 남겼어요.` : ""} ${sentences(action.body).slice(0, 2).join(" ")}`;
      } else if (progress.has(action.kind)) {
        const planned = row.planEffort?.target;
        const knownCondition = finite(planned?.rir) && action.body.startsWith(`계획한 RIR ${planned.rir},`);
        if (knownCondition) {
          if (!conditions.has(planned.rir)) conditions.set(planned.rir, []);
          conditions.get(planned.rir).push(row.rawName || row.label);
        }
        const body = knownCondition ? sentences(action.body).filter(value => !value.startsWith("계획한 RIR ") && !value.startsWith("그 여유가 남지 않으면")) : sentences(action.body);
        const proposal = action.proposal;
        detail = proposal ? `${currentText}에서 이어가며, 다음에는 ${finite(proposal.loadKg) ? `${proposal.loadKg}kg × ` : ""}${fmt(proposal.baseReps)}회 한 세트에서만 ${fmt(proposal.targetReps)}회를 시험해 볼 수 있어요.${current?.sets?.length > 1 ? " 나머지 세트는 이번 구성에 둬요." : ""}`
          : body.slice(0, 2).join(" ");
        if (action.kind === "reps-option" && row.actual?.feedback) detail += " 여유가 있었다고 남긴 세트만 다음 선택에 반영해요.";
        const supports = row.advice.supportingActions.filter(value => ["plan-effort-check", "restore-tail", "preserve-other-work", "hold-limit-set"].includes(value.kind));
        for (const support of supports.slice(0, 2)) detail += ` ${sentences(support.body).slice(0, support.kind === "plan-effort-check" ? 3 : 2).join(" ")}`;
      } else {
        const beforeText = workText(previous, row);
        const changedSets = current?.sets?.length === previous?.sets?.length
          ? (current?.sets || []).map((set, index) => ({ current: set, previous: previous.sets[index], position: index + 1 }))
            .filter(pair => pair.previous.loadKg === pair.current.loadKg && finite(pair.previous.reps) && finite(pair.current.reps)
              && pair.previous.reps !== pair.current.reps)
            .sort((left, right) => Number(action.focusSetIds?.includes(right.current.id)) - Number(action.focusSetIds?.includes(left.current.id)))
          : [];
        const changedMiddle = !returned && beforeText && beforeText === currentText && changedSets.length
          ? changedSets.slice(0, 2).map(pair => `기록의 ${pair.position}번째 일반 세트는 ${previous.source?.date || previous.date}의 ${workText({ sets: [pair.previous] }, row)}에서 이번 ${workText({ sets: [pair.current] }, row)}로 달라졌어요.`).join(" ") + " " : "";
        const comparison = !returned && !["plan-check", "plan-effort-check"].includes(action.kind) && (adjustment.has(action.kind) || changed.has(action.kind))
          && beforeText && currentText && beforeText !== currentText
          ? `${previous.source?.date || previous.date}의 ${beforeText}에서 이번 ${currentText}로 바뀌었어요. ` : "";
        detail = comparison + changedMiddle + sentences(action.body).slice(0, ["plan-check", "plan-effort-check"].includes(action.kind) ? 3 : 2).join(" ");
        const support = row.advice.supportingActions.find(value => ["preserve-plan-work", "restore-tail", "preserve-other-work", "hold-limit-set"].includes(value.kind));
        if (support) detail += ` ${sentences(support.body).slice(0, support.kind === "restore-tail" ? 2 : 1).join(" ")}`;
      }
      if (returnedEvidence && !purpose[session?.intent]) detail = returnedEvidence + detail;
      if (detail) {
        const selectedDetail = sentences(detail).filter(sentence => {
          if (/\d/.test(sentence)) return true;
          if (sharedDirections.has(sentence)) return false;
          sharedDirections.add(sentence);
          return true;
        }).join(" ");
        if (selectedDetail) snippets.push(`${row.date} ${row.rawName || row.label}: ${selectedDetail}`);
      }
    }
    for (const [rir, labels] of conditions) snippets.push(`${labels.join("·")}의 진행 선택은 계획한 RIR ${rir}, 즉 ${rir}회 여유를 남길 수 있을 때만 골라요. 그 여유가 없으면 이번 수행을 유지하세요.`);
    const activityRows = activities.filter(row => activityReduction.has(row.action?.kind)).concat(activities);
    const activity = activityRows[0];
    if (activity) {
      const body = sentences(activity.action?.body);
      const task = body.filter(value => !value.startsWith("구간 과제도 ") && !value.startsWith("기록한 구간("));
      const selectedTask = activityProgress.has(activity.action.kind) && task.length > 2 ? [task[0], task.at(-1)] : task.slice(0, 2);
      snippets.push(`${activity.date} ${activity.label}: ${selectedTask.join(" ")}`);
      evidenceSources.push(...(activity.sources || []));
    }
    const question = session?.question?.title;
    return { answer: [lead, snippets.join("\n"), question || ""].filter(Boolean).join("\n\n"),
      evidence: { scope: "rest-deload-decision", sources: evidenceSources, diagnostic: false } };
  }

  function connectTraining(result, profile, options, date) {
    if (!options?.trainingAnalysis && !options?.training && !options?.program) return result;
    const training = summarizeTraining(options.trainingAnalysis, options.training, options.program, date);
    result.context.training = training;
    result.context.limitations.push("세트 일지의 kg 합계·표시 Cal은 근성장이나 측정된 소모량이 아니며 식사 목표에 다시 더하지 않아요.", "기록하지 않은 날은 휴식일로 판단하지 않아요.", ...training.limitations);
    if (!training.available) return result;
    const last = training.lastSession;
    const latestSource = (options.training || options.state?.training)?.records?.find(record => record?.id === last?.id && record?.date === last?.date)
      || (last && options.trainingAnalysis?.lastSession?.id === last.id && options.trainingAnalysis.lastSession.date === last.date ? options.trainingAnalysis.lastSession : null);
    const latestExercises = Array.isArray(latestSource?.exercises) ? latestSource.exercises : [];
    const hasActualSets = latestExercises.some(exercise => Array.isArray(exercise?.sets) && exercise.sets.length) || last?.totalSets > 0;
    const hasTimedBlocks = latestExercises.some(exercise => knownCount(exercise?.durationMinutes) !== null);
    const timeOnly = !!last && !hasActualSets && (hasTimedBlocks || last.durationMinutes !== null);
    const logSummary = last ? `최근 기록은 ${last.date}${last.time ? ` ${last.time}` : ""} ${last.label || "훈련"}${hasActualSets && last.totalSets !== null ? `, ${fmt(last.totalSets)}세트` : ""}${timeOnly && last.durationMinutes !== null ? `, 기록 시간 ${fmt(last.durationMinutes, 1)}분` : ""}예요.${last.sourceKind === "legacy-ocr" ? " 이전 OCR 요약이며 원본을 새로 검증한 기록은 아니에요." : ""}` : null;
    if (last?.time) result.context.limitations.push("일지 헤더의 시각은 시작·종료 중 어느 시각인지 확인되지 않았어요.");
    if (last) result.context.observations.push({ id: "training-diary", label: "세트 일지", value: logSummary, source: "training-records", confidence: "high" });
    const logAction = trainingLogAction(last);
    if (last) result.questions.push({ id: "training-log", label: `${last.date} ${last.label || "훈련"} 일지에서 무엇이 확인됐나요?`, answer: logSummary, ...logAction });
    const trainingItems = [];
    const currentClinical = profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80);
    const recovery = training.recovery;
    if (["stop", "review"].includes(recovery.status)) {
      const pain = ["mild", "stop"].includes(recovery.pain) || recovery.status === "stop";
      trainingItems.push(item("training-safety", pain ? "통증이 있는 동작은 멈춰 주세요" : "훈련을 늘리기 전에 회복부터 확인해요", `${recovery.reasons.join(" ")} ${pain ? "통증이 생기는 동작은 중단하고, 심하거나 계속되는 증상은 의료진에게 확인해 주세요." : "수면·피로·최근 식사를 함께 확인한 뒤 다음 훈련을 정하죠. 이 기록만으로 통증이나 원인을 단정하지 않아요."}`, "nav-training", { kind: "safety", tone: "attention", confidence: "high", source: "training-self-report" }));
    } else if (recovery.status === "watch" && !options.currentHealthAdvice) {
      trainingItems.push(item("training-recovery", "늘리기 전에 회복을 살펴봐요", `다음 운동은 현재 구성을 출발점으로 두고, 오늘 유난히 힘들면 쉬거나 부담을 낮추는 선택을 해요. ${recovery.reasons[0] || "수면·피로 중 평소와 가장 달라진 한 가지를 알려 주세요."}`, "coach-checkin", { kind: "safety", tone: "attention", confidence: "medium", source: "training-pattern" }));
    }
    if (last) {
      const numericObservation = hasLatestObservation(training);
      const analysis = options.trainingAnalysis;
      const hasSession = last.id && Array.isArray(analysis?.sessions) && analysis.sessions.some(row => row?.id === last.id && row.date === last.date);
      const workspace = options.training || options.state?.training;
      const review = hasSession && typeof Training?.coachSession === "function" ? Training.coachSession(analysis, {
        preferences: workspace?.reviewPreferences, priorityMuscles: workspace?.settings?.priorityMuscles, planning: workspace?.planning, profile
      }) : null;
      const coaching = review?.session?.id === last.id ? review.sessionCoaching : null;
      const interpretedRows = coaching ? review.rows.filter(row => row.interpretation) : [];
      const byBlock = new Map(interpretedRows.map(row => [row.blockId, row]));
      const rawSession = workspace?.records?.find(record => record.id === last.id && record.date === last.date);
      const rawExercises = new Map((rawSession?.exercises || []).map(exercise => [exercise.id, exercise]));
      const focusedActions = coaching ? (Array.isArray(coaching.actions) ? coaching.actions : []).filter(row => byBlock.has(row.blockId)) : [];
      const timedActions = coaching ? interpretedRows.filter(row => exerciseDuration(review.session.exercises.find(exercise => exercise.id === row.blockId), rawExercises.get(row.blockId)) !== null
        && !focusedActions.some(action => action.blockId === row.blockId)).map(row => ({ blockId: row.blockId,
          title: `${row.rawName || row.label}: ${row.interpretation.nextAction.title}`, body: row.interpretation.nextAction.body })) : [];
      const actions = [...focusedActions.slice(0, 2), ...timedActions.slice(0, 1)]
        .map(row => ({ title: text(row.title), body: text(row.body), blockId: text(row.blockId), kind: text(byBlock.get(row.blockId)?.interpretation?.nextAction?.kind),
          focusSetIds: texts(byBlock.get(row.blockId)?.interpretation?.coaching?.primaryAction?.focusSetIds).slice(0, 24) }));
      const detailedCoaching = coaching ? interpretedRows.slice().sort((a, b) => Number(actions.some(action => action.blockId === b.blockId)) - Number(actions.some(action => action.blockId === a.blockId)))
        .map(row => summarizeExerciseCoaching(row, review.session.exercises.find(exercise => exercise.id === row.blockId), rawSession?.exercises.find(exercise => exercise.id === row.blockId), last.date, last.id)) : [];
      const compositionMeaning = coaching ? sessionCompositionMeaning(review, actions, rawSession?.exercises) : "";
      if (coaching) training.sessionCoaching = {
        summary: text(coaching.summary), intent: text(coaching.intent), pattern: text(coaching.pattern),
        coordination: coaching.coordination ? { ...coaching.coordination,
          priorityBlockIds: texts(coaching.coordination.priorityBlockIds), alternativeProgressionBlockIds: texts(coaching.coordination.alternativeProgressionBlockIds) } : null,
        compositionMeaning,
        composition: {
          summary: text(coaching.composition?.summary),
          blocks: (Array.isArray(coaching.composition?.blocks) ? coaching.composition.blocks : []).filter(row => byBlock.has(row.blockId)).slice(0, 200)
            .map(row => ({ blockId: text(row.blockId), label: text(row.label), workingSets: knownCount(row.workingSets), pattern: text(row.pattern),
              durationMinutes: exerciseDuration(review.session.exercises.find(exercise => exercise.id === row.blockId), rawExercises.get(row.blockId)) }))
        },
        focus: texts(coaching.focus).slice(0, 6), actions, question: coaching.question || null,
        exerciseContexts: detailedCoaching, originalContextCount: interpretedRows.length,
        contextsSampled: interpretedRows.length > detailedCoaching.length,
        capacity: interpretedRows.filter(row => row.interpretation.performance).slice(0, 12).map(row => {
          const performance = row.interpretation.performance, model = performance.model;
          const exercise = review.session.exercises.find(exercise => exercise.id === row.blockId);
          const project = point => point ? { date: point.date, source: { sessionId: point.sessionId, blockId: point.blockId, setId: point.setId, date: point.date, loadKg: point.loadKg, reps: point.reps, rir: point.rir },
            estimate: { estimated: true, minKg: point.minKg, maxKg: point.maxKg, basis: point.basis, rangeMeaning: point.rangeMeaning, rirApplied: point.rirApplied } } : null;
          const samePoint = (a, b) => a && b && a.sessionId === b.sessionId && a.blockId === b.blockId && a.setId === b.setId;
          const best = samePoint(model.allTimeBest, model.current) ? { sameAs: "current" } : samePoint(model.allTimeBest, model.previous) ? { sameAs: "previous" } : project(model.allTimeBest);
          return { blockId: row.blockId, label: row.label, date: last.date, exerciseId: exercise.exerciseId, equipmentKey: exercise.equipmentKey, loadConvention: exercise.loadConvention, loadRole: exercise.loadRole, variantKey: exercise.variantKey,
            summary: performance.summary, current: project(model.current), previous: project(model.previous), bestInRecordedHistory: best,
            expectedReps: model.expectedRepsAtCurrentLoad ? { estimated: true, repsMin: model.expectedRepsAtCurrentLoad.min, repsMax: model.expectedRepsAtCurrentLoad.max, basis: "formula-inversion" } : null,
            loadExperience: performance.loadExperience, stableWorking: model.stableWorking };
        })
      };
      const counts = [`운동 블록 ${last.exerciseCount === null ? "수 미확인" : `${fmt(last.exerciseCount)}개`}`];
      if (hasActualSets || last.workingSets === null) counts.push(last.workingSets === null ? "일반 세트 수 미확인" : `일반 ${fmt(last.workingSets)}세트`);
      if (hasActualSets && last.warmupSets !== null) counts.push(`준비 ${fmt(last.warmupSets)}세트`);
      if (hasActualSets && last.markedSets !== null) counts.push(`별도 표시 ${fmt(last.markedSets)}세트`);
      if (last.durationMinutes !== null) counts.push(`전체 기록 시간 ${fmt(last.durationMinutes, 1)}분`);
      const fallback = numericObservation ? "종목별 중량·반복은 아래 일지에서 이어서 볼 수 있어요. 다음 운동은 같은 장비의 기록과 나란히 두고 확인해 보세요."
        : "숫자 없는 운동도 기록에 남겨 두었어요. 다음에는 지난 일지를 재사용하고 실제로 한 세트만 채우면 됩니다.";
      const sessionMeaning = coaching ? text(coaching.summary) : "";
      const actionGroups = new Map();
      for (const action of actions) {
        if (!actionGroups.has(action.body)) actionGroups.set(action.body, []);
        actionGroups.get(action.body).push(action);
      }
      const nextChoices = [...actionGroups.values()].map(group => {
        const first = group[0], heading = group.length === 1 ? first.title
          : `${group.map(row => text(byBlock.get(row.blockId)?.rawName || byBlock.get(row.blockId)?.label)).join("·")} · ${text(byBlock.get(first.blockId)?.interpretation?.nextAction?.title)}`;
        const interpretation = byBlock.get(first.blockId)?.interpretation;
        const assessment = text(interpretation?.coaching?.assessment), referenceDate = interpretation?.reference?.date;
        const referenceLead = referenceDate && !assessment.includes(referenceDate) ? `${referenceDate} 기록에 비춰 보면, ` : "";
        const meaning = group.length === 1 ? first.kind === "individual-care" ? text(interpretation?.summary)
          : ["deload", "light", "technique", "time-limited", "return", "test", "check-intent"].includes(first.kind) ? ""
            : `${referenceLead}${assessment}` : "";
        const supports = group.length === 1 ? texts(byBlock.get(first.blockId)?.interpretation?.coaching?.supportingActions?.map(action => action.body)).filter(body => !first.body.includes(body)) : [];
        return [...new Set([`${heading}.`, meaning, first.body, ...supports].filter(Boolean))].join("\n");
      });
      const recordedMeaning = options.currentHealthAdvice?.suppressRecordedActions || options.currentHealthAdvice?.kind === "individual-care" && !coaching
        ? [options.currentHealthAdvice.body, compositionMeaning, ...interpretedRows.map(row => `${row.rawName || row.label}: ${text(row.interpretation.summary)}`)].filter(Boolean).join("\n\n")
        : coaching ? [sessionMeaning, compositionMeaning, ...nextChoices].filter(Boolean).join("\n\n") : fallback;
      const explanation = `${last.date}${last.time ? ` ${last.time}` : ""} ${last.label || "훈련"}.${last.sourceKind === "legacy-ocr" ? " 이전 OCR 자료는 원문을 새로 검증한 기록이 아니에요." : ""}\n\n${recordedMeaning}\n\n${counts.join(" · ")}.`;
      const evidence = { scope: "whole-session", latestSessionId: last.id, latestSessionDate: last.date,
        selection: last.id ? "latest-session-id" : "latest-date-fallback", exerciseCount: last.exerciseCount,
        workingSets: last.workingSets, warmupSets: last.warmupSets, markedSets: last.markedSets,
        unknownEffortSets: last.unknownEffortSets, current: null, previous: null,
        recordMode: hasActualSets ? hasTimedBlocks || last.durationMinutes !== null ? "mixed" : "sets" : timeOnly ? "time" : "unquantified",
        durationMinutes: last.durationMinutes,
        coveredBlockIds: coaching ? review.rows.map(row => row.blockId) : [],
        interpretedBlockIds: interpretedRows.map(row => row.blockId), actionBlockIds: actions.map(row => row.blockId),
        interpretationSource: coaching ? "record-observations" : "session-counts" };
      trainingItems.push(item(numericObservation ? "training-progression" : "training-log", `${last.date} 최근 운동 전체 관찰`, explanation, logAction.action,
        { ...logAction, kind: "training", confidence: "medium", source: "training-records", evidence }));
      const logQuestion = result.questions.find(row => row.id === "training-log");
      if (logQuestion && coaching) { logQuestion.answer = explanation; logQuestion.evidence = evidence; }
      if (numericObservation) result.questions.push({ id: "training-progression", label: `${last.date} 전체 운동 기록은 무엇이 확인됐나요?`, answer: explanation, ...logAction, evidence });
    }
    const muscles = training.muscles.filter(row => (row.directSets || 0) + (row.indirectSets || 0) > 0).slice(0, 4);
    const hasSetDiary = hasActualSets || muscles.length > 0 || (Array.isArray(options.trainingAnalysis?.sessions) ? options.trainingAnalysis.sessions : []).some(session =>
      session && Array.isArray(session.exercises) && session.exercises.some(exercise => exercise && (Array.isArray(exercise.sets) && exercise.sets.length > 0
        || !exercise.exerciseId && text(exercise.rawName) && exerciseDuration(exercise) === null)));
    if (hasSetDiary) result.questions.push({ id: "training-muscles", label: "부위별로 어떤 훈련이 쌓였나요?", answer: muscles.length ? `${training.windowStart || "기간 시작 미확인"}~${training.windowEnd}: ${muscles.map(row => `${row.label || row.id} 직접 ${fmt(row.directSets)}·간접 ${fmt(row.indirectSets)}세트`).join(", ")}. 다음 계획에서는 우선 부위에 직접 해당하는 운동이 어떻게 배치됐는지 확인해 보세요. 직접·간접 세트는 서로 다른 노출로 봅니다.` : "운동명·기구를 한 번 연결하면 같은 이름의 기록에서 부위별 세트를 이어서 볼 수 있어요. 연결 전에도 원문 일지는 그대로 사용할 수 있습니다.", action: "nav-training", actionLabel: actionLabels["nav-training"] });
    const recoveryAction = ["mild", "stop"].includes(recovery.pain) || recovery.status === "stop"
      ? "통증이 생기는 동작은 중단하고, 심하거나 계속되는 증상은 의료진에게 확인해 주세요."
      : recovery.status === "review" ? "다음 계획을 늘리기 전에 부담을 낮추거나 쉴 여유를 검토해요. 수면·피로 중 최근 가장 달라진 한 가지부터 확인해 주세요."
        : recovery.status === "watch" ? "다음 운동은 현재 구성을 출발점으로 두고, 늘리기 전에 회복을 살펴보세요. 오늘 유난히 힘들다면 부담을 낮추는 선택도 가능합니다."
          : "다음 운동은 지난 구성에서 이어갈 수 있어요. 몸이 힘든 날에는 쉬거나 부담을 낮추는 선택을 하고, 실제로 한 부분만 기록해 주세요.";
    const sessionAdvice = training.sessionCoaching;
    const hasRecoveryConcern = ["stop", "review", "watch"].includes(recovery.status);
    const clinicalAdvice = currentClinical ? sessionAdvice?.actions.find(row => row.kind === "individual-care")?.body
      || "지금의 건강 상태를 아는 전문가의 훈련 계획에 맞춰 휴식과 부담을 정해 주세요. 실제 운동 기록은 그대로 이어갈 수 있어요." : "";
    const purposeAdvice = !hasRecoveryConcern && sessionAdvice && (sessionAdvice.intent !== "unknown" && sessionAdvice.intent !== "regular" || sessionAdvice.pattern === "broad-reduction");
    const restAnswer = sessionAdvice || !last ? restDeloadAnswer(training, [], date) : { answer: recoveryAction, evidence: { sources: [], diagnostic: false } };
    result.questions.push({ id: "training-deload", label: "쉬거나 디로드할 때인가요?", answer: clinicalAdvice || restAnswer.answer,
      evidence: restAnswer.evidence, action: clinicalAdvice ? "nav-profile" : purposeAdvice ? logAction.action : hasRecoveryConcern ? "coach-checkin" : "nav-training",
      ...(clinicalAdvice ? { actionLabel: actionLabels["nav-profile"] } : purposeAdvice ? logAction : { actionLabel: actionLabels[hasRecoveryConcern ? "coach-checkin" : "nav-training"] }) });
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

  function connectActivity(result, decision, plan) {
    if (!decision?.activity) return result;
    const activity = decision.activity;
    result.context.activityCoaching = activity;
    const items = [], safetyKinds = ["stop", "pain-review", "illness-return", "individual-care", "current-recovery", "health-follow-up"];
    if (decision.scope.trainingEnabled) {
      const activities = activity.current.length ? activity.current : activity.latest || [];
      const linkedActivities = [];
      for (const row of activities) {
        if (row.sport === "strength" && result.context.training?.lastSession?.date >= row.date) continue;
        linkedActivities.push(row);
        const safety = safetyKinds.includes(row.action.kind);
        const action = safety ? "coach-checkin" : "session-add";
        items.push(item(`activity-${row.id}`, `${row.label} · ${row.action.title}`, `${row.assessment} ${row.action.body}`, action, {
          kind: safety ? "safety" : "training", tone: safety ? "attention" : "info", confidence: "medium", source: "activity-records", evidence: { sources: row.sources, observations: row.comparison.observations, diagnosis: false } }));
        result.questions.push({ id: `activity-${row.id}`, label: `${row.date} ${row.label}의 다음 운동은 어떻게 이어갈까요?`, answer: `${row.assessment} ${row.action.body}`, action, actionLabel: actionLabels[action], evidence: { sources: row.sources } });
      }
      if (activities.length) {
        result.priorities = result.priorities.filter(row => !["training-record-scope", "training-plan", "session-only", "rest-plan"].includes(row.id));
        result.questions = result.questions.filter(row => row.id !== "training-record-scope");
      }
      if (linkedActivities.length && !result.context.currentHealthAdvice) {
        const question = result.questions.find(row => row.id === "training-deload");
        if (question) {
          const answer = restDeloadAnswer(result.context.training, linkedActivities, result.context.date);
          question.answer = answer.answer;
          question.evidence = answer.evidence;
        }
      }
      const mealQuestion = result.questions.find(row => row.id === "training");
      const currentActivities = linkedActivities.filter(row => row.date === result.context.date);
      if (mealQuestion && decision.scope.nutritionEnabled && currentActivities.length && !result.context.currentHealthAdvice) {
        const food = mealConstraintAdvice(result.context.checkin || {})
          || "운동 뒤 다음 끼니는 평소 문제없이 먹어 온 주식과 단백질 식품을 챙겨요. 허기가 크거나 끼니가 오래 떨어져 있다면 먹기 편한 양으로 나눠 드세요.";
        const meaningful = currentActivities.filter(row => !["repeat", "time-record", "practice", "hybrid", "one-variable-option"].includes(row.action.kind));
        const firstSentence = body => text(body).match(/^.*?[.!?](?=\s|$)/)?.[0] || text(body);
        const flow = meaningful.slice(0, 2).map(row => firstSentence(row.action.body)).join(" ");
        const actual = `오늘 실제 기록한 운동은 ${currentActivities.map(row => `${sportNames[row.sport] || row.label} ${fmt(row.actual.durationMin)}분`).join(" · ")}이에요.${currentActivities.length > 1 ? ` 시간 기록 합계는 ${fmt(result.context.sessionMinutes)}분이에요.` : ""}`;
        const energy = finite(plan?.energy?.exerciseKcal) ? exerciseEnergyText(plan, result.context.planSource === "saved-target") : "";
        const mixed = result.context.sports?.length > 1 ? "여러 종목은 각각 실제로 한 시간만 반영했어요. 같은 시간대를 두 세션으로 중복 기록하지 않았는지 확인해 주세요." : "";
        mealQuestion.answer = [food, actual, flow, "운동량이 달라졌다는 이유만으로 끼니를 건너뛰거나 추가 운동으로 맞추지 않아요.", energy, energy ? "이 추정값을 목표에 다시 더하지 않아요." : "", mixed].filter(Boolean).join(" ");
        mealQuestion.evidence = { sources: currentActivities.flatMap(row => row.sources || []),
          observations: currentActivities.flatMap(row => row.comparison.observations || []), diagnosis: false };
      }
    }
    const conflicts = decision.body?.conflicts || [];
    for (const row of activity.connections) {
      if (/body-/.test(row.kind) && row.kind !== "body-source-check" && row.sources.some(source => conflicts.some(conflict => conflict.date === source.date))) continue;
      const action = decision.scope.nutritionEnabled && /meal|fuel|protein|carb/.test(row.kind) ? "meal-add" : "nav-trends";
      const focused = row.kind === "body-source-check" || row.observations.some(observation => observation.fastGainReview || observation.fastLossReview);
      items.push(item(`linked-${row.kind}`, row.title, row.body, action, {
        kind: "context", confidence: "medium", source: "linked-records", evidence: { observations: row.observations, sources: row.sources, diagnostic: false } }));
      items.at(-1).reviewPriority = focused ? 0 : /fuel|carb/.test(row.kind) ? 1 : /protein/.test(row.kind) ? 2 : 3;
      result.questions.push({ id: `linked-${row.kind}`, label: row.title, answer: row.body, action, actionLabel: actionLabels[action],
        evidence: { observations: row.observations, sources: row.sources, diagnostic: false } });
      if (row.kind === "weight-training") {
        result.priorities = result.priorities.filter(priority => priority.id !== "weight-trend");
        const trend = result.questions.find(question => question.id === "trend");
        if (trend) trend.answer = row.body;
      }
    }
    const existingSafety = result.priorities.filter(row => row.kind === "safety"), ordinary = result.priorities.filter(row => row.kind !== "safety");
    const newSafety = items.filter(row => row.kind === "safety"), activities = items.filter(row => row.kind === "training"), links = items.filter(row => row.kind === "context").sort((a, b) => a.reviewPriority - b.reviewPriority);
    result.priorities = [...newSafety, ...existingSafety, ...activities.slice(0, 1), ...links.slice(0, 1), ...ordinary, ...activities.slice(1), ...links.slice(1)].slice(0, 3);
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
    const currentHealthAdvice = healthAdvice(profile, d, history, options, decision);
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
    const familiarMealAdvice = profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80)
      ? "다음 끼니는 담당 전문가와 정한 식사 구성과 제한을 먼저 따라 주세요."
      : mealConstraintAdvice(checkin) || "다음 끼니는 평소 문제없이 먹어 온 주식과 단백질 식품을 함께 준비해 보세요. 먹을 양은 허기와 소화가 편한 정도에 맞춰 나눠요.";
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
      return connectActivity(adaptDecisionScope(alignHealthAdvice(connectTraining({ status, headline: selected[0]?.title || "기록을 함께 살펴볼게요", summary, priorities: selected, questions: selectedQuestions, context }, profile, { ...options, currentHealthAdvice }, d.date), currentHealthAdvice), decision), decision, plan);
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
          `${familiarMealAdvice} ${meals.length ? "기록한 식사는 남겨 두고, 실제 먹은 다음 끼니를 이어서 기록할 수 있어요." : "자주 먹는 식사나 실제 먹은 한 끼부터 남길 수 있어요."}`, "meal-add", { kind: "data", confidence: "high", source: "meal-record" }));
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
      question("tracking", "지금 할 수 있는 일은 무엇인가요?", review ? "전문가와 정한 계획을 우선하면서 식사와 몸 상태를 기록해 주세요. 여기서는 체중 감량이나 숫자 변경을 권하지 않아요." : `${familiarMealAdvice} 실제로 먹은 식사와 측정값부터 남기고, 모르는 값은 비워 둘 수 있어요.`, complete ? "nav-trends" : "meal-add");
      question("recovery", "몸이 힘든 날은 어떻게 할까요?", "쉬거나 훈련 부담을 낮추고, 평소 식사를 챙길 여유를 두세요. 상태를 더 남긴다면 수면·허기·피로 중 평소와 가장 달라진 한 가지만 알려 주세요. 전문가와 정한 계획이 있다면 그 지침을 우선해요.", "coach-checkin");
      return finish(review ? "review" : "incomplete", [item("scope", review ? "개별 계획을 우선해 주세요" : "계산 기준을 먼저 확인해요", reasons.join(" ") || "기록의 계산 기준이 확인되지 않았어요.", source === "missing-snapshot" ? "reopen" : "nav-profile", { kind: review ? "safety" : "data", tone: "attention", confidence: "high", source })], "기록은 유지하면서, 확인되지 않은 목표로 식사를 평가하지 않아요.");
    }
    if (!validMeals(meals)) {
      question("invalid-meals", "왜 식사를 평가하지 않나요?", "영양소가 비어 있거나 음수·잘못된 숫자가 포함돼 있어요. 모르는 값을 0으로 처리하면 섭취량을 과소평가할 수 있어요.", complete ? "reopen" : "meal-add");
      return finish("incomplete", [item("meal-data", "식사 숫자를 확인해 주세요", `${complete ? "이 날 입력한 식사 숫자를 다시 확인해 주세요." : familiarMealAdvice} 모르는 숫자를 0으로 채우지 말고 확인할 값만 고쳐 주세요.`, complete ? "reopen" : "meal-add", { kind: "data", tone: "attention", confidence: "high" })], "불확실한 식사 입력을 결핍으로 판단하지 않았어요.");
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
    const proteinLow = complete && meals.length > 0 && Insights.meaningfulMacroGap(totals.protein, plan.macros.protein.min);
    const carbLowFatHigh = complete && meals.length > 0 && Insights.meaningfulMacroGap(totals.carbs, plan.macros.carbs.min) && totals.fat > plan.macros.fat.max;
    const fatLowCarbHigh = complete && meals.length > 0 && Insights.meaningfulMacroGap(totals.fat, plan.macros.fat.min, 5) && totals.carbs > plan.macros.carbs.max;
    const reportedConcerns = [checkin.energy === "low" ? "낮은 컨디션" : null, checkin.hunger === "high" ? "강한 허기" : null, checkin.sleep === "poor" ? "좋지 않은 수면" : null, checkin.performance === "down" ? "최근 운동 수행 저하" : null, checkin.fatigue === "high" ? "높은 피로" : null, checkin.illness === "active" ? "현재 질병" : checkin.illness === "recovering" ? "질병 뒤 회복 중" : null, ["mild", "stop"].includes(checkin.pain) ? "통증" : null].filter(Boolean);
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

    if (recoveryConcern) add(item("checkin-recovery", "오늘은 알려 준 몸 상태부터 챙겨요", `${reportedConcerns.join("·")} 상태를 알려 주셨어요. 다음 식사는 평소 구성을 챙기고 쉴 여유를 확보해 보세요. 식사를 더 깎거나 추가 운동으로 맞추는 변경은 미뤄요.${sessionRows.length ? ` 기록한 운동 ${fmt(sessionMinutes)}분${meals.length ? `과 식사 ${fmt(totals.kcal)}kcal` : ""}에서 이어가며 다음 상태를 살펴봐요.` : ""}${constraintAdvice ? ` ${constraintAdvice}` : " 상태가 계속 나쁘거나 일상에 지장이 생기면 개별 평가를 받아 주세요."}`, !meals.length ? "meal-add" : "coach-checkin", { kind: "safety", tone: "attention", confidence: "high", source: "self-report", evidence: { reportedConcerns: [...reportedConcerns], diagnostic: false } }));
    if (recovery && !recoveryConcern) add(item("recovery", "회복 상태를 먼저 확인해요", "목표와 측정 당시 체성분을 참고하면 운동을 제외하고 남는 에너지가 적을 수 있어요. 지속적인 피로나 회복 저하, 해당되는 경우 월경 변화가 있다면 식사를 더 줄이기보다 개별 평가를 받아 주세요. 현재 증상이 있다는 뜻은 아니에요.", "nav-profile", { kind: "safety", tone: "attention", confidence: "low", source: "measurement", evidence: { energyAvailability: plan.context?.energyAvailability ?? null, diagnostic: false } }));
    if (totals.alcoholG > 0) add(item("alcohol", "술의 열량과 회복은 따로 봐요", `기록한 순알코올 ${fmt(totals.alcoholG, 1)}g의 ${fmt(totals.alcoholG * 7)}kcal가 총열량에 포함돼요. 열량에 맞았다고 수면에 미치는 영향이 없어지는 것은 아니에요. 술 때문에 다음 식사를 굶거나 운동으로 상쇄하지 마세요.`, complete ? "nav-trends" : "meal-add", { kind: "safety", tone: "attention", confidence: "high", source: "day", evidence: { alcoholG: totals.alcoholG, alcoholKcal: totals.alcoholG * 7, sourceUrl: "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/hangovers" } }));

    const mutation = options?.lastMutation;
    const mutationValid = !complete && mutation?.date === d.date && ["meal-added", "meal-updated", "meal-deleted"].includes(mutation.type);
    const changedMeal = mutationValid ? meals.find(meal => meal.id === mutation.mealId) : null;
    const mutationPrefix = mutationValid && (changedMeal || mutation.type === "meal-deleted")
      ? mutation.type === "meal-deleted" ? "식사 삭제를 반영했어요. " : `방금 ${mutation.type === "meal-added" ? "추가" : "수정"}한 ${String(changedMeal.name || "식사").slice(0, 80)}의 ${fmt(Insights.mealTotals([changedMeal]).kcal)}kcal, 단백질 ${fmt(changedMeal.protein)}g까지 반영했어요. ` : "";
    context.lastMealFeedback = mutationPrefix ? { type: mutation.type, mealId: changedMeal?.id ?? null, source: "session-only" } : null;

    if (!complete && meals.length && !mutationPrefix && missingCore.length && !recoveryConcern) add(item("checkin", "다음 끼니는 평소 구성으로 준비해요", `지금까지 ${fmt(totals.kcal)}kcal${sessionRows.length ? `, 운동 ${fmt(sessionMinutes)}분` : ""}을 기록했어요. ${familiarMealAdvice} 나중에 허기·컨디션을 더 알려 주면 그에 맞춰 조절할 수 있어요.`, "meal-add", { kind: "today", confidence: "medium", source: "missing-self-report", evidence: { missing: missingCore, provisional: true } }));

    if (!meals.length) add(item("start", complete ? "완료 기록에 식사가 없어요" : "다음 끼니를 준비하고 실제 식사를 남겨요", complete ? "이 날 식사 기록이 비어 있어요. 먹지 않았다는 뜻으로 보지 않을게요. 빠진 기록이 있다면 하루를 다시 열어 확인해 주세요." : `${familiarMealAdvice} 이미 먹은 식사가 있다면 그 기록도 이어서 남길 수 있어요.`, complete ? "reopen" : "meal-add", { kind: "data", confidence: "high" }));
    else if (meals.length === 1 && !complete) add(item("one-meal", mutationPrefix ? "방금 식사를 확인했어요" : "다음 식사도 같이 준비해요", `${mutationPrefix}지금까지 ${fmt(totals.kcal)}kcal, 단백질 ${fmt(totals.protein)}g이에요. ${ratio < 1 ? `하루 목표까지 약 ${fmt(leftEnergy)}kcal가 남았지만 한 번에 채울 양은 아니에요. ` : "하루 목표만큼 기록됐어도 남은 식사를 무조건 건너뛰지는 마세요. "}${constraintAdvice || "다음 식사가 있다면 평소 문제없이 먹어 온 주식과 단백질 식품을 함께 준비해 보세요."}`, "meal-add", { kind: "today", confidence: "medium", source: mutationPrefix ? "session-only" : "day", evidence: { remainingKcal: leftEnergy, remainingProteinG: leftProtein, provisional: true } }));
    else if (!complete) {
      const next = ratio >= 1 ? "시작 목표만큼의 열량이 기록됐어요. 더 먹거나 굶어 맞추기보다 빠진 기록이 없는지 확인하고, 남은 식사는 허기와 계획을 함께 살펴보세요." : leftProtein > 10 ? `시작 목표까지 약 ${fmt(leftEnergy)}kcal, 단백질 ${fmt(leftProtein)}g이 남아 있어요. 다음 식사가 있다면 평소 문제없이 먹어 온 단백질 식품과 탄수화물을 함께 구성해 보세요.` : `시작 목표까지 약 ${fmt(leftEnergy)}kcal가 남아 있어요. 단백질만 더 채우려 하기보다 다음 식사에서 평소 문제없이 먹어 온 채소·과일과 필요한 탄수화물을 함께 챙겨 보세요.`;
      add(item("next-meal", mutationPrefix ? "방금 기록한 식사까지 반영했어요" : "다음 식사는 이 부분을 챙겨요", `${mutationPrefix}${next}${constraintAdvice ? " " + constraintAdvice : ""}`, "meal-add", { kind: "today", confidence: "medium", source: mutationPrefix ? "session-only" : "day", evidence: { remainingKcal: leftEnergy, remainingProteinG: leftProtein, provisional: true } }));
    } else if (lowEnergy) add(item("low-energy", "빠진 식사가 없다면 충분한 식사가 먼저예요", `${fmt(totals.kcal)}kcal가 기록되어 저장 목표 ${fmt(target)}kcal보다 적어요. 기록 누락을 먼저 확인하고, 누락이 없다면 다음 식사부터 충분히 챙겨 주세요. 감량 목표여도 이 차이를 더 키우려 하지 마세요.`, "reopen", { kind: "today", tone: "attention", confidence: "medium", source, evidence: { kcal: totals.kcal, targetKcal: target } }));
    else if (highEnergy) add(item("high-energy", "한 번의 초과를 급하게 보상하지 마세요", `${fmt(totals.kcal)}kcal가 기록되어 저장 목표 ${fmt(target)}kcal보다 많아요. 굶거나 추가 운동으로 상쇄하기보다 다음 식사부터 평소 계획으로 돌아가세요. 반복 여부는 최근 기록에서 따로 확인해요.`, "nav-trends", { kind: "today", confidence: "medium", source, evidence: { kcal: totals.kcal, targetKcal: target } }));
    else if (proteinLow) add(item("protein", "단백질 식품을 끼니마다 나눠 보세요", `기록된 단백질은 ${fmt(totals.protein)}g으로, 당시 계획 범위의 아래쪽인 ${fmt(plan.macros.protein.min)}g보다 적어요. 다음 식사에는 평소 문제없이 먹어 온 단백질 식품을 함께 담아 보세요.`, "nav-trends", { kind: "today", confidence: "medium", source }));
    else if (carbLowFatHigh || fatLowCarbHigh) add(item("macro-balance", "열량뿐 아니라 탄수·지방 구성도 살펴요", `열량은 저장 목표와 가깝지만 탄수 ${fmt(totals.carbs)}g, 지방 ${fmt(totals.fat)}g의 구성은 선택한 배분 범위와 달라요. ${carbLowFatHigh ? "다음 식사는 전체 양을 줄이기보다 지방 위주 식품 일부를 평소 문제없이 먹어 온 주식으로 바꾸는 구성을 살펴보세요." : "다음 식사는 탄수화물만 더하기보다 평소 문제없이 먹어 온 지방 공급원도 함께 살펴보세요."} 범위 이탈이 곧 건강 문제라는 뜻은 아니에요.`, "nav-trends", { kind: "today", confidence: "medium", source, evidence: { carbs: totals.carbs, fat: totals.fat, direction: carbLowFatHigh ? "carbs-for-fat" : "fat-for-carbs" } }));
    else {
      const weightReview = decision?.activity?.connections.find(row => row.kind === "weight-training"
        && row.observations.some(observation => observation.followUpStage === "current-food-review"));
      const followUp = recoveryConcern ? `${constraintAdvice || "다음 끼니도 평소 문제없이 먹어 온 주식과 단백질 식품을 챙겨요. 허기가 크다면 끼니 간격이나 운동 뒤 식사를 너무 미뤘는지도 살펴보세요."} 식사를 더 깎거나 추가 운동으로 맞추지 말고 쉴 여유를 두세요.`
        : weightReview ? "이 날의 저장 목표와 가까운 식사예요. 다음 끼니는 최근 체중 흐름을 함께 보고 조절하죠. 하루 목표에 맞았다는 이유만으로 반복된 변화를 넘기지는 않아요."
          : `계획과 큰 차이는 없어요. 당장 양을 바꾸기보다 허기와 ${decision?.scope.trainingEnabled === false ? "컨디션" : "운동 수행"}이 어떤지 함께 보죠.`;
      add(item("balanced", weightReview ? "이 날 식사는 저장 목표와 가까웠어요" : "지금 구성을 이어가며 몸 상태를 보죠",
        `${fmt(totals.kcal)}kcal와 단백질 ${fmt(totals.protein)}g을 기록했어요. ${followUp}`, "nav-trends",
        { kind: "optimization", tone: recoveryConcern || weightReview ? "info" : "positive", confidence: "medium", source }));
    }

    const recentDirection = recent.lowEnergyDays >= 3 && recent.lowEnergyDays > recent.highEnergyDays ? "low" : recent.highEnergyDays >= 3 && recent.highEnergyDays > recent.lowEnergyDays ? "high" : null;
    if (recent.comparableDays >= 3 && recentDirection && !((lowEnergy && recentDirection === "high") || (highEnergy && recentDirection === "low"))) {
      const count = recentDirection === "low" ? recent.lowEnergyDays : recent.highEnergyDays;
      const evidence = { windowDays: 28, completedDays: recent.comparableDays, matchingDays: count, consecutive: false };
      const message = `이 날 이전 28일, 같은 목표로 완료한 ${recent.comparableDays}일 중 ${count}일이 당시 목표보다 ${recentDirection === "low" ? "적게" : "많이"} 기록됐어요. ${recentDirection === "low" ? "모두 남긴 식사가 맞다면 끼니를 더 줄이지 말고 평소 양부터 챙겨 보세요." : "일부 큰 식사·간식이 반복됐는지 살펴보고, 굶어 보상하지 말고 다음 끼니부터 평소 구성으로 이어가 보세요."}`;
      const existing = priorities.find(row => row.id === (recentDirection === "low" ? "low-energy" : "high-energy"));
      if (existing) { existing.body += ` ${message}`; existing.evidence.recent = evidence; }
      else add(item("recent-intake", "비슷한 기록이 반복되는지 확인해요", message, "nav-trends", { kind: "recent", confidence: "medium", source: "recent-completed", evidence }));
    }

    const allocation = plan.context?.allocation;
    if (allocation && Math.abs(allocation.appliedCarbDeltaG) > 0.5) add(item("allocation", "고른 탄수·지방 배분을 기준으로 보고 있어요", `기본 배분에서 탄수화물 ${allocation.appliedCarbDeltaG >= 0 ? "+" : ""}${fmt(allocation.appliedCarbDeltaG, 1)}g, 지방 ${allocation.appliedFatDeltaG >= 0 ? "+" : ""}${fmt(allocation.appliedFatDeltaG, 1)}g을 바꿨어요. 총열량과 단백질은 그대로예요.${allocation.limited ? " 선택량이 가능한 범위를 넘어 실제 적용량은 범위 안으로 제한됐어요." : ""}`, null, { kind: "allocation", confidence: "high", source, evidence: { ...allocation } }));
    if (sessionRows.length) {
      const training = (plan.guidance || []).find(row => row.id === "fueling") || (plan.guidance || []).find(row => row.id === "sport");
      add(item("training", `${sports.map(sport => sportNames[sport]).join("·")} ${fmt(sessionMinutes)}분을 반영했어요`, `${exerciseEnergyText(plan, saved)} ${training?.body || "운동 뒤에는 식사를 지나치게 미루지 말고 허기와 회복을 함께 확인해 주세요."}`, complete ? "nav-trends" : "session-add", { kind: "training", confidence: "medium", source: "day", evidence: { sports, minutes: sessionMinutes, exerciseKcal: plan.energy.exerciseKcal } }));
    } else if (!complete && checkin.trainingPlan === "planned") add(item("training-planned", "예정 운동에 맞춰 식사를 준비해요", "운동할 계획이라고 알려 주셨어요. 평소 먹는 주식과 단백질 식품, 물을 준비하고 운동 중 속이 불편하지 않을 만큼 식사를 나눠요. 마친 뒤에는 실제 운동 시간·강도를 남겨 다음 식사와 운동을 이어갈 수 있어요.", "session-add", { kind: "training", confidence: "high", source: "self-report" }));
    else if (!complete && checkin.trainingPlan === "rest") add(item("rest-plan", "쉬는 날에도 식사와 회복은 이어가요", "휴식 계획이라고 알려 주셨어요. 기록된 추가 운동이 없어 기본 활동에 맞춘 목표를 보고 있어요. 쉬는 날이라는 이유만으로 식사를 건너뛰지는 마세요.", "coach-checkin", { kind: "training", confidence: "high", source: "self-report" }));
    else if (!complete && !decision?.training.daysWithAnyTrainingRecord) add(item("training-unknown", "다음 운동과 식사를 준비하기", "운동할 날이라면 평소 먹는 주식과 단백질 식품을 준비하고, 쉬는 날에도 끼니는 평소대로 이어가요. 실제로 운동을 마쳤다면 그 기록에서 다음 운동을 정할 수 있어요.", "session-add", { kind: "data", confidence: "high" }));

    if (priorities.length < 3 && recent.weeklyWeightChangeKg !== null) add(item("weight-trend", "체중은 최근 측정의 흐름으로 봐요", `최근 두 주의 측정 중앙값을 비교한 변화는 주당 ${recent.weeklyWeightChangeKg >= 0 ? "+" : ""}${fmt(recent.weeklyWeightChangeKg, 2)}kg이에요. 체지방·근육의 변화량으로 해석할 수는 없어요. 식사 기록과 회복 상태를 같이 확인해 주세요.`, "nav-trends", { kind: "recent", confidence: "low", source: "recent-measurements" }));
    if (priorities.length < 3 && !plan.context?.bodyFatUsable) add(item("composition-confidence", "체성분은 확인된 측정만 참고해요", (plan.reasons || []).find(text => /체성분|체지방/.test(text)) || "측정 당시 체중과 날짜·방법이 확인되면 목표의 참고 자료로 사용할 수 있어요. 없어도 기본 계산은 가능해요.", "measurement", { kind: "profile", confidence: "high", source: "measurement" }));

    const firstMealAdvice = priorities.find(row => ["start", "one-meal", "next-meal", "low-energy", "high-energy", "protein", "macro-balance", "balanced"].includes(row.id));
    question("next-meal", complete ? "이 날 식사에서 무엇을 보면 될까요?" : "다음 식사에서 무엇을 챙길까요?", firstMealAdvice?.body || "기록된 식사와 몸 상태를 먼저 확인해 주세요.", complete ? "nav-trends" : "meal-add");
    const goalText = goalNames[goal] || "저장된 목표";
    const experienceText = finite(trainingYears) ? `입력한 운동 경력은 ${fmt(trainingYears, 1)}년이에요.${trainingYears === 0 ? " 막 시작했다면 꾸준히 먹을 수 있는 식사 구성부터 맞춰 보죠." : ""}` : "운동 경력은 확인되지 않아 운동 횟수로 숙련도를 추정하지 않았어요.";
    const sexText = !saved ? profile?.sex === "unspecified" ? " 성별을 지정하지 않아 열량은 두 공식의 중간 추정이에요." : ` ${profile?.sex === "female" ? "여성" : "남성"} 기준과 나이 ${fmt(profile?.age)}세를 안정시대사 추정에 반영했어요.` : "";
    const activityText = dailyActivity?.mode === "detailed" ? ` ${dailyActivity.source === "day" ? "이 날 따로 입력한" : dailyActivity.source === "weekday" ? "요일별" : "기본"} 시간표를 사용했고, 남은 휴식은 ${fmt(dailyActivity.restHours, 1)}시간이에요. 운동 시간은 이 휴식과 겹치지 않게 계산했어요.` : "";
    const trainingRelevant = decision?.scope.trainingEnabled !== false;
    const goalAdvice = { lose: "최근 체중과 허기·회복을 함께 보며 조정하죠.", maintain: "매일 같은 체중을 맞추기보다 몇 주의 흐름을 보죠.", gain: trainingRelevant ? "체중뿐 아니라 같은 조건의 운동 수행도 함께 보죠." : "체중의 몇 주 흐름과 꾸준히 먹을 수 있는 식사 구성을 함께 보죠.", recomp: trainingRelevant ? "단기 체중보다 식사의 지속성과 운동 수행을 함께 보죠." : "단기 체중보다 끼니를 꾸준히 챙길 수 있는지 함께 보죠.", performance: trainingRelevant ? "훈련을 이어갈 식사와 회복을 먼저 챙기죠." : "평소 컨디션을 유지할 식사와 회복을 먼저 챙기죠." };
    question("target", "현재 목표와 최근 변화는 어떻게 볼까요?", `${saved ? "이 날 완료할 때 저장한" : "현재"} ${goalText} 기준은 ${fmt(target)}kcal, 단백질 ${fmt(plan.macros.protein.target)}g이에요. ${experienceText}${sexText}${activityText} ${goalAdvice[goal] || "저장된 기록을 기준으로 살펴볼게요."} ${recovery || recoveryConcern || lowEnergy ? "회복이나 섭취 부족 신호가 있으면 감량 수치를 밀어붙이지 않아요." : "계산은 시작점이며 실제 필요량은 다를 수 있어요."}${saved ? " 현재 프로필로 다시 계산하지 않았어요." : ""}`, saved ? "nav-trends" : "nav-profile");
    const sport = sports.length > 1 ? "mixed" : sports[0] || plan.context?.guidanceSport || "none";
    const sportAdvice = {
      strength: "근력 운동을 한 날에는 단백질을 끼니에 나눠 챙기고, 다음 운동을 이어갈 탄수화물 식품도 함께 준비해요.",
      running: "달리기는 식사에서 탄수화물을 빠뜨리지 않으면서 운동 중 소화 반응도 확인해 주세요.",
      cycling: "긴 라이딩이라면 물과 평소 잘 소화되는 음식을 미리 준비해요. 출발 전 식사와 이동 중 먹을 것을 나눠 두면 챙기기 편해요.",
      swimming: "수영을 마친 뒤 먹을 수 있는 식사를 미리 준비해 두면 끼니를 지나치게 미루지 않고 이어가기 쉬워요.",
      team: "경기나 연습 전후에는 탄수화물과 단백질이 함께 있는 익숙한 식사를 준비해요. 다음 경기·훈련까지 가까우면 식사와 쉴 시간도 함께 확보해요.",
      mixed: sessionRows.length ? "여러 종목은 각각 실제로 한 시간만 반영했어요. 같은 시간대를 두 세션으로 중복 기록하지 않았는지 확인해 주세요." : "여러 종목을 할 예정이라면 각 운동에 쓸 시간과 중간에 먹을 음식·물을 준비해요. 운동을 마친 뒤에는 실제로 한 시간만 남겨 주세요.",
      walking: "걷기 뒤에도 평소 식사를 이어가며 허기를 살펴보세요. 더운 날이나 오래 걷는 날에는 마실 물도 준비해요.",
      none: "실제 운동 기록은 아직 없어요. 운동 여부와 별개로 평소 식사는 챙기고, 운동했다면 기록을 더해 주세요."
    }[sport];
    const trainingAnswer = sessionRows.length ? `기록한 운동은 ${sports.map(sport => sportNames[sport]).join("·")} ${fmt(sessionMinutes)}분이에요. ${exerciseEnergyText(plan, saved)} 이 값을 목표에 다시 더하지 않아요. ${sportAdvice}` : `${checkin.trainingPlan === "planned" ? "운동할 계획이라면 평소 먹는 식사와 물부터 준비해요. 마친 뒤에는 실제 수행에서 다음 운동을 이어가세요." : checkin.trainingPlan === "rest" ? "쉬는 날에도 끼니는 평소대로 챙기고, 다음 운동을 편하게 시작할 수 있게 휴식을 이어가요." : decision?.training.daysWithAnyTrainingRecord ? "최근 운동 기록에서 다음 수행을 이어가고, 운동할 날에는 평소 먹는 주식과 단백질 식품을 준비해요." : "운동 여부와 별개로 평소 식사는 챙기고, 마친 운동이 있다면 기록에서 다음 운동을 이어가 보세요."} ${sport === "none" ? "" : sportAdvice}`;
    question("training", sessionRows.length ? "오늘 운동 후 식사는 어떻게 챙길까요?" : "오늘 운동 계획에 맞춰 준비할까요?", `${trainingAnswer}${constraintAdvice ? " " + constraintAdvice : ""}${recoveryConcern ? " 알려 준 회복 신호가 있어 식사를 줄이거나 운동을 더해 맞추지는 마세요." : ""}`, complete ? "nav-trends" : sessionRows.length ? "meal-add" : checkin.trainingPlan === "planned" ? "session-add" : "coach-checkin");
    const compositionAnswer = plan.context?.bodyFatUsable
      ? `${plan.context.bodyFatReferenceDate || "기록된 날짜"}의 체중 ${fmt(plan.context.bodyFatReferenceWeightKg, 1)}kg과 체지방률을 짝지어 제지방 참고량 ${fmt(plan.context.ffmKg, 1)}kg을 계산했어요. 측정 오차와 경과 시간·체중 변화에 따라 반영 정도를 낮춰요. 이 값으로 근육이 늘거나 줄었다고 단정하지 않아요.`
      : "측정 당시 체중, 날짜와 측정 방법이 함께 확인된 체성분만 목표 보정에 써요. 정보가 없거나 오래되면 현재 체중으로 과거 체지방률을 재계산하지 않아요. 골격근량도 제지방량으로 환산하지 않아요.";
    question("composition", "체성분은 얼마나 믿어도 되나요?", compositionAnswer, complete ? "nav-trends" : "measurement");
    question("trend", "최근 흐름을 보면 목표를 바꿔야 하나요?", `이 날 이전 28일에 완료한 식사 기록은 ${recent.completedDays}일, 같은 목표로 비교 가능한 기록은 ${recent.comparableDays}일이에요. ${recent.weeklyWeightChangeKg === null ? "지금은 체중 숫자를 맞추려고 식사량을 바꾸기보다 현재 끼니를 이어가며 허기·컨디션을 보세요. 체중을 남긴다면 비슷한 시간·조건으로 이어서 확인해요." : `체중의 주간 변화는 ${recent.weeklyWeightChangeKg >= 0 ? "+" : ""}${fmt(recent.weeklyWeightChangeKg, 2)}kg이에요. 당장 식사를 더 줄이거나 늘리기보다 같은 측정 조건에서 현재 식사와 ${trainingRelevant ? "운동 수행" : "허기·컨디션"}을 함께 살펴보세요.`}`, "nav-trends");
    question("allocation", "탄수·지방 배분을 바꾸면 어떻게 되나요?", allocation && Math.abs(allocation.appliedCarbDeltaG) > 0.5 ? `선택한 배분을 반영해 탄수 ${fmt(plan.macros.carbs.target)}g, 지방 ${fmt(plan.macros.fat.target)}g을 기준으로 보고 있어요. 탄수와 지방을 열량 기준으로 교환하므로 총열량과 단백질은 그대로예요. 이미 먹은 양을 따라 자동으로 목표를 옮기지는 않아요.` : "탄수화물 25g과 지방 약 11.1g은 각각 약 100kcal예요. 가능한 범위 안에서 둘을 교환하면 총열량과 단백질을 유지할 수 있어요. 먹기 편한 배분을 직접 고르는 설정이에요.", null);
    question("recovery", "몸이 힘든 날은 어떻게 할까요?", recoveryConcern ? `${reportedConcerns.join("·")} 상태를 알려 주셨어요. 다음 식사는 평소 구성으로 챙기고, 오늘 운동에는 쉴 여유를 두세요. 식사를 더 깎거나 추가 운동으로 맞추는 변경은 미뤄요. ${constraintAdvice || "알려 준 상태가 지속되거나 일상·운동에 지장을 주면 전문가와 개별적으로 살펴 주세요."}` : `평소 식사와 운동 구성을 출발점으로 이어갈 수 있어요. 몸이 힘든 날에는 쉬거나 훈련 부담을 낮추는 선택을 하고, 실제로 한 부분만 기록해 주세요. ${constraintAdvice || "추가 정보를 남긴다면 수면·허기·피로 중 평소와 가장 달랐던 한 가지만 알려 주세요."}`, "coach-checkin");
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
    const weightSource = context.recent?.weightChangeSource;
    add("recent.weeklyWeightChangeKg", `선택일 제외 ${weightSource?.from || ""}~${weightSource?.to || ""} 측정의 주간 변화 추정`, context.recent?.weeklyWeightChangeKg, "kg/주", "measurement-summary-estimate", weightSource?.to || context.date, true);
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

  return Object.freeze({ VERSION, buildCoach, buildFacts, summarizeTraining, progressionObservation, projectSingleSetProposal });
});
