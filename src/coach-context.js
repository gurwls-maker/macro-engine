(function(root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./nutrition.js") : root.MacroNutrition,
    node ? require("./insights.js") : root.MacroInsights,
    node ? require("./training.js") : root.MacroTraining,
    node ? require("./storage.js") : root.MacroStorage,
    node ? require("./activity-coaching.js") : root.MacroActivity);
  if (node) module.exports = api;
  if (root) root.MacroCoachContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(N, I, T, S, Activity) {
  "use strict";
  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const dateNumber = date => S.isValidDate(date) ? Date.parse(`${date}T00:00:00Z`) : null;
  const knownMeals = day => Array.isArray(day?.meals) && day.meals.every(meal => meal &&
    ["protein", "carbs", "fat"].every(key => finite(meal[key]) && meal[key] >= 0) &&
    ["otherKcal", "alcoholG"].every(key => meal[key] === undefined || finite(meal[key]) && meal[key] >= 0))
    && Object.values(I.mealTotals(day.meals)).every(finite);
  const text = value => typeof value === "string" ? value.slice(0, 2000) : "";

  function selectedPlan(profile, day) {
    if (day?.complete) return day.planSnapshot
      ? { plan: day.planSnapshot, source: "saved-target" }
      : { plan: null, source: "missing-snapshot" };
    let plan = N.calculatePlan(N.profileForDay(profile, day || {}) || {}, day || {}, []);
    if (plan.status === "ready") plan = N.adjustAllocation(plan, finite(day?.carbAdjustmentG) ? day.carbAdjustmentG : 0);
    return { plan, source: "live-target" };
  }

  function measurementContext(profile, days, date, selected, calculation) {
    const candidates = days.filter(day => finite(day.weightKg) || finite(day.bodyFatPct) || finite(day.skeletalMuscleKg))
      .map(day => ({ date: day.date, weightKg: finite(day.weightKg) ? day.weightKg : null,
        bodyFatPct: finite(day.bodyFatPct) ? day.bodyFatPct : null,
        skeletalMuscleKg: finite(day.skeletalMuscleKg) ? day.skeletalMuscleKg : null,
        method: day.bodyFatMethod || "unknown", source: "day-measurement" }));
    if (finite(profile?.bodyFatPct) && S.isValidDate(profile.bodyFatDate) && profile.bodyFatDate <= date) {
      candidates.push({ date: profile.bodyFatDate, weightKg: finite(profile.bodyFatWeightKg) ? profile.bodyFatWeightKg : null,
        bodyFatPct: profile.bodyFatPct, skeletalMuscleKg: null, method: profile.bodyFatMethod || "unknown", source: "profile-measurement" });
    }
    const groups = new Map();
    for (const row of candidates) {
      if (!groups.has(row.date)) groups.set(row.date, []);
      groups.get(row.date).push(row);
    }
    const observations = [], compositionChoices = [], conflicts = [];
    const knownMethods = ["bia", "dxa", "caliper"];
    // A display tie-break never merges fields or resolves conflicting measurements.
    for (const [when, rows] of groups) {
      const day = rows.find(row => row.source === "day-measurement"), saved = rows.find(row => row.source === "profile-measurement");
      const choice = day || saved;
      const compositionChoice = day && finite(day.bodyFatPct) ? day : saved || null;
      const samePair = day && saved && day.weightKg === saved.weightKg && day.bodyFatPct === saved.bodyFatPct && day.method === saved.method;
      const fields = [];
      if (day && saved && !samePair) {
        for (const key of ["weightKg", "bodyFatPct"]) if (finite(day[key]) && finite(saved[key]) && day[key] !== saved[key]) fields.push(key);
        if (knownMethods.includes(day.method) && knownMethods.includes(saved.method) && day.method !== saved.method) fields.push("method");
        if (fields.length || finite(day.bodyFatPct)) conflicts.push({ date: when, fields,
          status: fields.length ? "conflicting-values" : "incomplete-match", chosenSource: choice.source,
          observations: rows.map(copy), resolution: "같은 날짜의 하루 측정 기록을 우선 표시하지만 자료 차이는 해결됐다고 판단하지 않습니다." });
      }
      const resolved = { ...choice, sources: samePair ? ["day-measurement", "profile-measurement"] : [choice.source] };
      observations.push(resolved);
      if (compositionChoice) compositionChoices.push({ ...compositionChoice,
        sources: samePair ? ["day-measurement", "profile-measurement"] : [compositionChoice.source] });
    }
    observations.sort((a, b) => a.date.localeCompare(b.date));
    compositionChoices.sort((a, b) => a.date.localeCompare(b.date));
    const latest = observations.at(-1) || null;
    const paired = compositionChoices.filter(row => finite(row.weightKg) && finite(row.bodyFatPct)).at(-1) || null;
    const profileReference = candidates.find(row => row.source === "profile-measurement") || null;
    const selectedReference = finite(selected?.bodyFatPct) ? {
      date: selected.date, weightKg: finite(selected.weightKg) ? selected.weightKg : null,
      bodyFatPct: selected.bodyFatPct, method: selected.bodyFatMethod || "unknown", source: "day-measurement"
    } : profileReference;
    const pairedHasConflict = !!paired && conflicts.some(row => row.date === paired.date);
    return { optional: true, requiredForRecordUse: false, weightKnown: finite(profile?.weightKg) || candidates.some(row => finite(row.weightKg)),
      bodyFatKnown: candidates.some(row => finite(row.bodyFatPct)), pairedMeasurementAvailable: paired !== null,
      pairedMethodKnown: !!paired && knownMethods.includes(paired.method), pairedObservationUnambiguous: !!paired && !pairedHasConflict,
      latest, paired, hasConflicts: conflicts.length > 0, conflicts,
      authoritativeSelectedSource: calculation.source === "saved-target" ? "saved-target" : selectedReference?.source || null,
      selectedReference, selectedReferencePaired: !!selectedReference && finite(selectedReference.weightKg) && finite(selectedReference.bodyFatPct),
      calculationReference: { source: calculation.source, date: calculation.plan?.context?.bodyFatReferenceDate || null,
        weightKg: finite(calculation.plan?.context?.bodyFatReferenceWeightKg) ? calculation.plan.context.bodyFatReferenceWeightKg : null,
        usable: calculation.plan?.context?.bodyFatUsable === true },
      interpretation: "측정값은 관찰입니다. 같은 날짜의 출처가 다르면 하루 기록을 우선 표시하되 차이를 보존하고, 값을 평균내거나 서로 다른 출처의 숫자로 측정 쌍을 만들지 않습니다. 체성분 미입력은 기록과 상담을 막지 않습니다." };
  }

  function build(state, date, options = {}) {
    if (!S.isValidDate(date)) throw new Error("코칭 기준 날짜를 확인해 주세요.");
    state = state && typeof state === "object" ? state : {};
    const end = dateNumber(date), from = new Date(end - 6 * DAY).toISOString().slice(0, 10);
    const allDays = Object.values(state.days || {}).filter(day => S.isValidDate(day?.date) && day.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const days = allDays.filter(day => day.date >= from), selected = allDays.find(day => day.date === date) || null;
    const mealDays = days.filter(day => knownMeals(day) && day.meals.length);
    const completed = mealDays.filter(day => day.complete === true);
    const profile = state.profile || null;
    const records = (state.training?.records || []).filter(record => S.isValidDate(record?.date) && record.date <= date);
    const rangedRecords = records.filter(record => record.date >= from);
    const trainingAnalysis = T.analyze(records, { date, profile, mappings: state.training?.mappings || [], checkins: state.days || {} });
    const weekAnalysis = T.analyze(rangedRecords, { date, profile, mappings: state.training?.mappings || [], checkins: state.days || {} });
    const activityDays = days.filter(day => Array.isArray(day.sessions) && day.sessions.length);
    const savedPrograms = state.training?.planning?.programs || [], schedule = state.training?.planning?.schedule || [];
    const observed = { nutrition: mealDays.length > 0, training: weekAnalysis.coverage.recordCount > 0 || activityDays.length > 0 };
    const historicalObserved = { nutrition: allDays.some(day => knownMeals(day) && day.meals.length),
      training: records.length > 0 || allDays.some(day => Array.isArray(day.sessions) && day.sessions.length) || savedPrograms.length > 0 || schedule.length > 0 };
    const preference = ["auto", "nutrition", "training", "both"].includes(state.trackingScope) ? state.trackingScope : "auto";
    // An automatic scope describes available records, not what the user did on missing days.
    const effective = preference !== "auto" ? preference : historicalObserved.nutrition && historicalObserved.training ? "both"
      : historicalObserved.nutrition ? "nutrition" : historicalObserved.training ? "training" : "none";
    const scope = { preference, effective, explicit: preference !== "auto", observed, historicalObserved,
      nutritionEnabled: ["nutrition", "both"].includes(effective), trainingEnabled: ["training", "both"].includes(effective) };
    const { plan, source } = selectedPlan(profile, selected);
    const currentGoal = profile?.goal || null, selectedTargetGoal = source === "saved-target" ? plan?.context?.goal || null : currentGoal;
    const priorTargets = allDays.filter(day => day.complete && day.planSnapshot?.context?.goal);
    const prior = priorTargets.at(-1) || null;
    const savedGoal = prior?.planSnapshot.context.goal || null;
    const checkinRows = days.filter(day => day.coachCheckin && Object.values(day.coachCheckin).some(value => value !== null))
      .map(day => ({ date: day.date, ...copy(day.coachCheckin), source: "saved-checkin" }));
    const sets = weekAnalysis.sessions.flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
    const currentStatus = !selected?.meals?.length ? "none" : knownMeals(selected) ? selected.complete ? "complete" : "partial" : "invalid";
    const nutrition = { coverage: { daysWithMeals: mealDays.length, completeMealDays: completed.length,
      partialMealDays: mealDays.length - completed.length, daysWithoutMeals: 7 - mealDays.length,
      invalidMealDays: days.filter(day => Array.isArray(day.meals) && day.meals.length && !knownMeals(day)).length },
      selectedDayStatus: currentStatus, selectedIntake: knownMeals(selected) && selected.meals.length ? I.mealTotals(selected.meals) : null,
      canAssessSelectedWholeDay: currentStatus === "complete", wholeDayMissingIsUnknown: true,
      target: { status: plan?.status || "incomplete", source, goal: selectedTargetGoal,
        kcal: plan?.status === "ready" && finite(plan.energy?.targetKcal) ? plan.energy.targetKcal : null, estimated: true },
      interpretation: "일부 식사와 미기록으로 하루 섭취 부족·과잉 또는 수행 저하의 원인을 판정하지 않습니다." };
    const trainingDates = new Set([...weekAnalysis.coverage.trainingDates, ...activityDays.map(day => day.date)]);
    const todayPlans = schedule.filter(row => row.date === date);
    const planRows = todayPlans.slice(0, 6).map(row => {
      const comparison = T.evaluateAssignment(row, records, state.training?.mappings || []);
      return { id: row.id, status: row.status, recordId: row.recordId || null,
        comparison: { ...comparison, rows: comparison.rows.slice(0, 8), originalRowCount: comparison.rows.length, sampled: comparison.rows.length > 8 } };
    });
    const training = { coverage: { ...copy(weekAnalysis.coverage), unknownDays: 7 - trainingDates.size,
      daysWithAnyTrainingRecord: trainingDates.size, activityOnlyDays: activityDays.filter(day => !weekAnalysis.coverage.trainingDates.includes(day.date)).length,
      setsWithKnownLoad: sets.filter(set => finite(set.loadKg)).length, setsWithUnknownLoad: sets.filter(set => !finite(set.loadKg)).length,
      setsWithKnownReps: sets.filter(set => finite(set.reps)).length, setsWithUnknownReps: sets.filter(set => !finite(set.reps)).length },
      actualRecordIds: weekAnalysis.sessions.map(row => row.id), lastSession: weekAnalysis.lastSession
        ? { id: weekAnalysis.lastSession.id, date: weekAnalysis.lastSession.date, label: weekAnalysis.lastSession.label,
          ...(weekAnalysis.lastSession.trainingIntent ? { trainingIntent: weekAnalysis.lastSession.trainingIntent } : {}) } : null,
      todayPlans: planRows, todayPlanCount: todayPlans.length, todayPlansSampled: todayPlans.length > 6,
      hasUnlinkedTodayPlan: todayPlans.some(row => row.status === "planned"),
      recovery: copy(trainingAnalysis.recovery), recoveryWindow: { from: trainingAnalysis.windowStart, to: date },
      missingIsRest: false, interpretation: "세트 수와 계획 조건의 일치는 실제 자극·근성장·완전한 회복의 측정이 아닙니다." };
    const question = text(options.question);
    const currentReport = { text: question, textTruncated: typeof options.question === "string" && options.question.length > question.length,
      source: "current-user-question", persisted: false,
      savedCheckin: selected?.coachCheckin ? copy(selected.coachCheckin) : null,
      contextChangeRequested: /취소|철회|잊어|기억.*(?:빼|지워)|목표.*(?:바꿨|변경|바뀌|바꿀)|증량.*(?:바꿨|전환)|감량.*(?:바꿨|전환)/.test(question),
      reportedSituationKeywords: { travel: /여행|출장|원정|다른\s*헬스장/.test(question),
        returnFromBreak: /복귀|다시\s*(?:시작|운동)|쉬었다|쉬었|오랜만/.test(question) },
      interpretation: "새 진술과 키워드는 확인할 맥락이며 확정 기록이나 이미 적용한 변경이 아닙니다." };
    const goal = { current: currentGoal, selectedTarget: selectedTargetGoal, selectedTargetSource: source,
      lastCompletedTarget: savedGoal, lastCompletedTargetDate: prior?.date || null,
      changeObserved: !!currentGoal && !!savedGoal && currentGoal !== savedGoal,
      effectiveSince: null, historicalTargetsPreserved: true };
    const constraints = { healthContext: profile?.healthContext || "unknown", recordingAvailable: true,
      numericNutritionPlanAvailable: plan?.status === "ready", numericNutritionPlanSource: source,
      currentGeneralAdultPlanSupported: !!profile && profile.healthContext === "general" && profile.age >= 18 && profile.age <= 80,
      generalAdultTrainingPlanSupported: !!profile && profile.healthContext === "general" && profile.age >= 18 && profile.age <= 80,
      nutritionCauseEstablished: false, saved: { constraints: text(state.training?.memory?.constraints),
        focus: text(state.training?.memory?.focus), agreements: text(state.training?.memory?.agreements),
        truncated: ["constraints", "focus", "agreements"].some(key => (state.training?.memory?.[key] || "").length > 2000) },
      currentReportOverridesSavedState: false };
    const activity = Activity.build(state, date);
    const nextObservations = [];
    const ask = (id, reason, question, action, priority = "decision") => nextObservations.push({ id, reason, question, action, priority, optional: true });
    if (["stop", "mild"].includes(training.recovery.pain)) ask("current-pain", "통증 기록은 중량 상승보다 먼저 확인합니다.", "지금도 통증이 있나요? 통증을 유발하는 동작은 중단하고 현재 상태를 확인해 주세요.", "nav-training", "safety");
    else if (profile && !constraints.currentGeneralAdultPlanSupported) ask("care-context", "일반 성인용 숫자 계획의 지원 범위 밖입니다.", "현재 전문가와 정한 식사·운동 제한이 있나요? 기록은 계속 사용하며 새로운 숫자 계획은 개별적으로 확인해 주세요.", "nav-profile", "safety");
    else if (["watch", "review"].includes(training.recovery.status)) ask("current-recovery", "수행과 회복 자기보고를 함께 살펴볼 조건이 있습니다.", "최근 수면·피로·통증이나 이전과 달라진 수행 조건 중 무엇이 가장 달랐나요?", "coach-checkin", "safety");
    if (currentReport.contextChangeRequested || goal.changeObserved) ask("current-goal", "현재 목표나 합의가 저장된 과거 기준과 다를 수 있습니다.", "앞으로 적용할 목표와 계속 유지할 제약을 확인해 주세요. 완료한 날의 목표는 바꾸지 않습니다.", profile ? "nav-profile" : "coach-memory");
    if (scope.trainingEnabled && !currentGoal && !constraints.saved.focus && !/근육|근비대|체중|감량|증량|수행|목표/.test(question))
      ask("training-focus", "운동의 우선순위가 아직 확인되지 않았습니다.", "지금 운동에서 가장 원하는 변화나 지켜야 할 제약 하나를 남길까요? 식사 계산용 신체 수치를 모두 입력할 필요는 없습니다.", "coach-memory");
    if (scope.nutritionEnabled && currentStatus === "partial") ask("meal-coverage", "현재 일부 식사만으로 하루 섭취를 평가하지 않습니다.", "이 기록은 오늘 먹은 전부인가요, 일부인가요? 다음 식사를 정할 때 필요한 내용만 남겨 주세요.", "meal-add");
    if (scope.trainingEnabled && training.hasUnlinkedTodayPlan) ask("plan-actual", "예정 운동과 실제 수행은 다릅니다.", "예정 운동 중 실제로 한 부분이 있나요? 일부만 했다면 실제 일지를 연결하고 남은 계획은 따로 결정해 주세요.", "nav-training");
    if (scope.trainingEnabled && /수행|부진|저하|중량|반복|비교|디로드/.test(question) && training.coverage.unknownEffortSets > 0)
      ask("comparison-conditions", "기록값의 변화는 볼 수 있고, 세트 느낌을 남기면 다음 시도를 더 세밀하게 맞출 수 있어요.", "다음 운동은 같은 장비의 최근 수행에서 이어가 보세요. 더 맞추고 싶다면 마지막 일반 세트가 여유로웠는지, 힘들었는지만 선택해서 남길 수 있어요.", "nav-training");
    if (scope.trainingEnabled && !observed.training) ask("training-coverage", "최근 운동 기록 공백은 휴식이나 실패의 증거가 아닙니다.", "최근 실제로 운동했나요? 했으면 지난 일지 재사용이나 사진 보관으로 남기고, 쉬었다면 복귀 계획을 따로 정할 수 있습니다.", "nav-training");
    if (scope.nutritionEnabled && !observed.nutrition) ask("nutrition-coverage", "식사를 기록하지 않았다는 것과 먹지 않았다는 것은 다릅니다.", "식사도 함께 볼까요? 원하면 자주 먹는 식사나 실제 먹은 한 끼부터 남길 수 있습니다.", "meal-add");
    if (scope.effective === "none") ask("record-scope", "아직 활용할 식사·운동 기록이 없습니다.", "식사, 운동 또는 둘 다 중 먼저 관리할 범위를 고르고 평소 방식의 기록부터 시작할 수 있습니다.", "tracking-scope");
    const limits = ["자동 기록 범위는 관찰 가능한 자료의 종류이며 실제 운동·식사 여부나 사용자의 의도를 확정하지 않습니다.",
      "체성분은 선택 사항이고 골격근량을 제지방량으로 대신 넣지 않습니다.",
      "새 진술·상황 키워드·과거 목표 차이에서 변경 시점이나 질환·회복 원인을 만들어 내지 않습니다.",
      "식사·훈련 기록은 같은 입력의 오류를 공유할 수 있으며 상담과 요약은 독립적인 검증이 아닙니다."];
    return { schemaVersion: 2, date, window: { from, to: date, days: 7 }, scope, nutrition, training, activity,
      checkins: { daysWithAnyCheckin: checkinRows.length, rows: checkinRows, selected: selected?.coachCheckin ? copy(selected.coachCheckin) : null },
      body: measurementContext(profile, allDays, date, selected, { plan, source }), goal, constraints, currentReport,
      nextObservations: nextObservations.slice(0, 3), limits };
  }
  return Object.freeze({ build });
});
