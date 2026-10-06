(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MacroInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function shiftDate(key, amount) {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }
  function mealTotals(meals = []) {
    const result = { protein: 0, carbs: 0, fat: 0, otherKcal: 0, alcoholG: 0, kcal: 0 };
    for (const meal of meals) {
      for (const key of ['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG']) {
        if (finite(meal[key]) && meal[key] >= 0) result[key] += meal[key];
      }
    }
    result.kcal = result.protein * 4 + result.carbs * 4 + result.fat * 9 + result.otherKcal + result.alcoholG * 7;
    return result;
  }
  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function alcoholGrams(volumeMl, abvPct, count) {
    if (![volumeMl, abvPct, count].every(finite) || volumeMl < 0 || volumeMl > 10000 || abvPct < 0 || abvPct > 100 || count < 0 || count > 100) return null;
    return volumeMl * abvPct / 100 * count * 0.789;
  }
  function mealSignature(meal) {
    return JSON.stringify([meal.name, meal.protein, meal.carbs, meal.fat, meal.otherKcal, meal.alcoholG, meal.type ?? null, meal.note ?? '']);
  }
  function copyMealPreview(sourceMeals, currentMeals) {
    const counts = new Map();
    currentMeals.forEach(meal => { const key = mealSignature(meal); counts.set(key, (counts.get(key) || 0) + 1); });
    return sourceMeals.map(meal => {
      const signature = mealSignature(meal), remaining = counts.get(signature) || 0;
      if (remaining) counts.set(signature, remaining - 1);
      return { meal, possibleDuplicate: remaining > 0 };
    });
  }
  function observationSummary(days, endDate, period = 28) {
    if (![7, 14, 28, 42].includes(period)) throw new Error('관찰 기간을 확인해 주세요.');
    const from = shiftDate(endDate, 1 - period);
    const list = Object.values(days || {}).filter(day => day.date >= from && day.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
    const completed = list.filter(day => day.complete && day.meals?.length);
    const paired = completed.filter(day => day.planSnapshot?.status === 'ready' && finite(day.planSnapshot.energy?.targetKcal));
    const keys = ['kcal', 'protein', 'carbs', 'fat'];
    const averages = Object.fromEntries(keys.map(key => {
      const intake = paired.map(day => mealTotals(day.meals)[key]);
      const target = paired.map(day => key === 'kcal' ? day.planSnapshot.energy.targetKcal : day.planSnapshot.macros[key].target);
      const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const intakeMean = mean(intake), targetMean = mean(target);
      return [key, { intake: intakeMean, target: targetMean, difference: intakeMean === null ? null : intakeMean - targetMean }];
    }));
    return { from, to: endDate, period, list, completed, paired, averages,
      openCount: list.filter(day => !day.complete).length,
      missingCount: period - list.length,
      withoutTargetCount: completed.length - paired.length,
      goalCount: new Set(paired.map(day => day.planSnapshot.context?.goal).filter(Boolean)).size,
      body: Object.fromEntries(['weightKg', 'bodyFatPct', 'skeletalMuscleKg'].map(key => [key, list.filter(day => finite(day[key]) && day[key] > 0).map(day => ({ date: day.date, value: day[key], method: day.bodyFatMethod || 'unknown' }))])) };
  }
  function suggestAllocation(days, endDate, plan, goal = plan?.context?.goal) {
    if (plan?.status !== 'ready' || !goal) return { status: 'unavailable', count: 0, deltaG: null, dates: [], reason: '현재 목표의 계산 기준이 필요해요.' };
    const from = shiftDate(endDate, -28);
    const eligible = Object.values(days || {}).filter(day => day.date >= from && day.date < endDate && day.complete
      && day.planSnapshot?.status === 'ready' && day.planSnapshot.context?.goal === goal).map(day => ({ day, totals: mealTotals(day.meals) }))
      .filter(({ totals }) => totals.alcoholG === 0 && totals.otherKcal === 0 && totals.carbs * 4 + totals.fat * 9 > 0);
    const dates = eligible.map(item => item.day.date).sort();
    if (eligible.length < 4) return { status: 'insufficient', count: eligible.length, deltaG: null, dates, reason: '최근 28일 안에 같은 목표로 완료한 비교 가능한 식사가 4일 이상 필요해요. 술·기타 열량이 있는 날은 제외해요.' };
    const share = median(eligible.map(({ totals }) => totals.carbs * 4 / (totals.carbs * 4 + totals.fat * 9)));
    const macros = plan.macros, remainder = plan.energy.targetKcal - macros.protein.target * 4;
    const lower = Math.max(macros.carbs.min, (remainder - macros.fat.max * 9) / 4);
    const upper = Math.min(macros.carbs.max, (remainder - macros.fat.min * 9) / 4);
    if (![remainder, lower, upper].every(finite) || remainder <= 0 || lower > upper) return { status: 'unavailable', count: eligible.length, deltaG: null, dates, reason: '현재 목표에서 교환 가능한 범위를 확인할 수 없어요.' };
    const carbs = Math.max(lower, Math.min(upper, remainder * share / 4));
    const deltaG = carbs - macros.carbs.target;
    return { status: Math.abs(deltaG) < 1 ? 'unchanged' : 'ready', count: eligible.length, dates, deltaG, carbEnergyShare: share,
      proposed: { kcal: plan.energy.targetKcal, protein: macros.protein.target, carbs, fat: (remainder - carbs * 4) / 9 },
      reason: '완료 기록에서 관찰한 탄수·지방 배분을 현재 범위에 맞춘 선택안이에요. 최적 비율이나 건강 판정이 아니며 총열량과 단백질은 그대로예요.' };
  }
  function weightWindowComparison(weights, endDate) {
    const byDate = new Map();
    for (const day of weights) {
      if (!isValidMeasurementDate(day.date) || !finite(day.weightKg) || day.weightKg <= 0) continue;
      if (!byDate.has(day.date)) byDate.set(day.date, []);
      byDate.get(day.date).push(day);
    }
    const observations = [...byDate.values()].filter(rows => rows.every(row => row.weightKg === rows[0].weightKg))
      .map(rows => rows[0]).sort((a, b) => a.date.localeCompare(b.date));
    const previous = observations.filter(day => day.date >= shiftDate(endDate, -13) && day.date < shiftDate(endDate, -6));
    const latest = observations.filter(day => day.date >= shiftDate(endDate, -6) && day.date <= endDate);
    const before = median(previous.map(day => day.weightKg)), after = median(latest.map(day => day.weightKg));
    const enough = previous.length >= 3 && latest.length >= 3;
    const middleDate = rows => median(rows.map(day => Date.parse(`${day.date}T12:00:00Z`)));
    const intervalDays = enough ? (middleDate(latest) - middleDate(previous)) / DAY : null;
    // Adjacent calendar weeks can contain measurements only a few days apart.
    const weeklyChangeKg = enough && intervalDays >= 5 && finite(before) && finite(after) ? (after - before) * 7 / intervalDays : null;
    return { observations, previous, latest, enough, before, after, intervalDays, weeklyChangeKg,
      weeklyChangePct: weeklyChangeKg === null ? null : weeklyChangeKg / before * 100 };
  }

  function recentShortWeightChange(weights, endDate) {
    const lastDate = weights.at(-1)?.date;
    if (!lastDate) return null;
    const changes = [];
    for (let index = 1; index < weights.length; index++) {
      const before = weights[index - 1], after = weights[index], elapsedDays = (Date.parse(after.date) - Date.parse(before.date)) / DAY;
      if (elapsedDays > 0 && elapsedDays <= 3 && Math.abs(after.weightKg - before.weightKg) / before.weightKg >= 0.02
        && after.date >= shiftDate(endDate, -6) && after.date >= shiftDate(lastDate, -3)) changes.push({ before, after, elapsedDays });
    }
    return changes.at(-1) || null;
  }

  function weightComparisonObservation(comparison) {
    return { from: comparison.previous[0]?.date || null, to: comparison.latest.at(-1)?.date || null,
      earlierDates: comparison.previous.map(day => day.date), laterDates: comparison.latest.map(day => day.date),
      earlierMedianKg: comparison.before, laterMedianKg: comparison.after, differenceKg: comparison.after - comparison.before,
      intervalDays: comparison.intervalDays, weeklyChangeKg: comparison.weeklyChangeKg, weeklyChangePct: comparison.weeklyChangePct };
  }

  function repeatedWeightObservation(weights, endDate, current, goal, savedGoals) {
    const prior = weightWindowComparison(weights, shiftDate(endDate, -14));
    if (prior.weeklyChangePct === null || current.weeklyChangePct === null) return null;
    const kind = prior.weeklyChangePct + 1e-10 >= 0.5 && current.weeklyChangePct + 1e-10 >= 0.5 ? "fast-gain"
      : -prior.weeklyChangePct + 1e-10 >= 1 && -current.weeklyChangePct + 1e-10 >= 1 ? "fast-loss" : null;
    if (!kind) return null;
    const comparisons = [prior, current].map(weightComparisonObservation);
    const observedGoals = savedGoals.filter(row => row.date >= comparisons[0].from && row.date <= comparisons[1].to);
    const dates = comparisons.flatMap(row => [...row.earlierDates, ...row.laterDates]);
    const differenceKg = current.before - prior.after;
    // Two independently rising windows need not form one continuing rise if the intervening readings fell back.
    const directionCompatible = kind === "fast-gain" ? differenceKg >= -0.05 : differenceKg <= 0.05;
    return { scope: "non-overlapping-recorded-comparisons-28-days", kind, independentComparisonCount: 2, comparisons,
      betweenComparisons: { from: prior.latest[0].date, to: current.previous.at(-1).date,
        earlierDates: prior.latest.map(day => day.date), laterDates: current.previous.map(day => day.date),
        gapFrom: prior.latest.at(-1).date, gapTo: current.previous[0].date, differenceKg, directionCompatible },
      goalContext: { current: goal || null, observedGoals,
        sameGoalConfirmed: !!goal && dates.every(date => observedGoals.some(row => row.date === date && row.goal === goal)) && observedGoals.every(row => row.goal === goal),
        confirmedMismatch: !!goal && observedGoals.some(row => row.goal !== goal) } };
  }

  function reportedHealthHistory(days, endDate, records = []) {
    if (!isValidMeasurementDate(endDate)) throw new Error("몸 상태를 살펴볼 기준 날짜를 확인해 주세요.");
    const observations = Object.values(days || {}).filter(day => isValidMeasurementDate(day.date) && day.date <= endDate);
    const workoutReports = new Map(), conflicts = new Set();
    for (const row of Array.isArray(records) ? records : []) {
      if (!isValidMeasurementDate(row?.date) || row.date > endDate || typeof row.id !== "string" || !row.id
        || !["none", "mild", "stop"].includes(row.pain)) continue;
      const value = { date: row.date, status: row.pain, source: { kind: "training-record-health", date: row.date, sessionId: row.id } };
      if (workoutReports.has(row.id) && JSON.stringify(workoutReports.get(row.id)) !== JSON.stringify(value)) conflicts.add(row.id);
      else workoutReports.set(row.id, value);
    }
    const fields = {};
    for (const [field, values] of [["illness", ["none", "active", "recovering"]], ["pain", ["none", "mild", "stop"]]]) {
      const rows = observations.filter(day => values.includes(day.coachCheckin?.[field]))
        .map(day => ({ date: day.date, status: day.coachCheckin[field], source: { kind: `reported-${field}`, date: day.date } }));
      if (field === "pain") rows.push(...[...workoutReports].filter(([id]) => !conflicts.has(id)).map(([, value]) => value));
      rows.sort((a, b) => a.date.localeCompare(b.date));
      const latest = rows.at(-1);
      if (!latest) continue;
      const sameDate = rows.filter(day => day.date === latest.date), statuses = [...new Set(sameDate.map(day => day.status))];
      fields[field] = { date: latest.date, status: statuses.length === 1 ? statuses[0] : "conflicting", reportedValues: statuses,
        ...(sameDate.some(row => row.source.kind === "training-record-health") ? { sources: sameDate.map(row => row.source) } : {}) };
    }
    return { fields, unresolved: Object.values(fields).some(row => row.status !== "none") };
  }

  function historySummary(days, endDate, goal) {
    const list = Object.values(days || {}).filter(day => day.date <= endDate && day.date >= shiftDate(endDate, -27)).sort((a, b) => a.date.localeCompare(b.date));
    const firstStart = shiftDate(endDate, -13);
    const weights = list.filter(day => finite(day.weightKg) && day.weightKg > 0);
    const comparison = weightWindowComparison(weights, endDate);
    const completed = list.filter(day => day.complete && day.planSnapshot?.status === 'ready' && day.planSnapshot?.context?.goal === goal);
    const comparable = completed.filter(day => day.date >= firstStart);
    const earlierWeight = comparison.before, laterWeight = comparison.after, weeklyChange = comparison.weeklyChangeKg;
    let trendMessage = '최근 2주 동안 각 주에 체중을 3번 이상 기록하면 하루 변동을 줄인 추세를 볼 수 있어요.';
    if (weeklyChange !== null) {
      const direction = weeklyChange > 0.05 ? '증가' : weeklyChange < -0.05 ? '감소' : '유지';
      trendMessage = `최근 체중은 주당 약 ${Math.abs(weeklyChange).toFixed(2)}kg ${direction} 추세예요. 수분·염분·월경·측정 시간에 따른 변화도 함께 포함돼요.`;
      trendMessage += ' 평소 끼니를 이어가며 현재 목표와 허기·컨디션을 함께 살펴보세요.';
    }
    const weightChangeSource = { from: comparison.previous[0]?.date || null, to: comparison.latest.at(-1)?.date || null,
      earlierDates: comparison.previous.map(day => day.date), laterDates: comparison.latest.map(day => day.date), intervalDays: comparison.intervalDays };
    return { list, weights, completed, comparable, weeklyChange, weightChangeSource, earlierWeight, laterWeight, trendMessage, averageKcal: completed.length ? completed.reduce((sum, day) => sum + mealTotals(day.meals).kcal, 0) / completed.length : null };
  }
  function dailyGuidance(plan, day) {
    if (plan.status !== 'ready') return (plan.reasons || []).map((body, index) => ({ id: `review-${index}`, title: plan.status === 'review' ? '개별 계획이 필요해요' : '내 기준을 확인해 주세요', body }));
    const totals = mealTotals(day.meals);
    const items = [];
    if (!day.meals.length) items.push({ id: 'start', title: '첫 식사부터 기록해 주세요', body: '오늘 먹은 양이 쌓이면 남은 섭취량과 다음 식사에서 보완할 내용을 함께 볼 수 있어요.' });
    else if (!day.complete) items.push({ id: 'open', title: '아직 기록 중인 하루예요', body: '남은 양은 다음 식사를 위한 참고예요. 하루 기록을 완료하기 전에는 오늘 식사를 부족하다고 평가하지 않아요.' });
    else {
      const ratio = totals.kcal / plan.energy.targetKcal;
      if (ratio < 0.8) items.push({ id: 'low-energy', title: '총섭취량을 먼저 확인해 주세요', body: '목표보다 적게 기록됐어요. 빠진 식사가 없다면 다음 날에는 식사를 충분히 챙기고, 허기와 운동 회복도 함께 살펴보세요.' });
      else if (ratio > 1.2) items.push({ id: 'high-energy', title: '하루 초과분을 급하게 보상하지 마세요', body: '목표보다 많이 기록됐어요. 굶거나 추가 운동으로 상쇄하기보다 다음 식사부터 평소 계획으로 돌아가세요.' });
      else items.push({ id: 'energy-ok', title: '계획한 섭취량에 가까운 하루예요', body: '다음 끼니도 평소 문제없이 먹어 온 식품으로 다양하게 챙겨 보세요. 열량이 비슷하다는 관찰은 식품 적합성이나 미량영양소 평가와는 별개예요.' });
      if (meaningfulMacroGap(totals.protein, plan.macros.protein.min)) items.push({ id: 'protein', title: '단백질을 식사마다 나누어 보세요', body: '기록된 단백질이 계획 범위 아래예요. 평소 문제없이 먹어 온 단백질 공급원으로 다음 식사부터 보완해 주세요.' });
    }
    if (totals.alcoholG > 0) items.push({ id: 'alcohol', title: '술의 열량과 회복 영향은 따로 봐요', body: `순알코올 ${Math.round(totals.alcoholG)}g의 ${Math.round(totals.alcoholG * 7)}kcal가 총열량에 포함돼요. 열량 목표에 맞았다고 수면·회복에 미치는 영향이 없어지는 것은 아니에요.` });
    const contextual = plan.guidance || [];
    const recovery = contextual.filter(item => item.id === 'availability');
    const isLowEnergy = items.some(item => item.id === 'low-energy');
    const ranked = contextual.filter(item => item.id !== 'availability' && !(item.id === 'goal' && (isLowEnergy || recovery.length)))
      .sort((a, b) => {
        const priority = { fueling: 0, 'female-athlete': 1, sport: 2, goal: 3, 'protein-basis': 4, trend: 5, 'body-composition': 6 };
        return (priority[a.id] ?? 9) - (priority[b.id] ?? 9);
      });
    const result = [...recovery, ...items];
    for (const item of ranked) if (!result.some(existing => existing.id === item.id)) result.push(item);
    return result.slice(0, 5);
  }
  function meaningfulMacroGap(actual, minimum, absoluteGapG = 10) {
    return finite(actual) && finite(minimum) && finite(absoluteGapG) && absoluteGapG >= 0
      && minimum > 0 && actual < minimum * 0.9 && minimum - actual >= absoluteGapG;
  }
  function coachingConnections(state, endDate) {
    const from = shiftDate(endDate, -27);
    const days = Object.values(state?.days || {}).filter(day => day.date >= from && day.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
    const selected = days.find(day => day.date === endDate), checkin = selected?.coachCheckin || {};
    const hasTraining = (state?.training?.records || []).some(row => row.date >= from && row.date <= endDate)
      || days.some(day => day.sessions?.length);
    const trainingFocus = hasTraining && state?.trackingScope !== "nutrition";
    const sportRows = days.flatMap(day => (day.sessions || []).map(session => ({ date: day.date, ...session })));
    const endurance = sportRows.some(row => ["running", "cycling", "swimming", "team", "mixed"].includes(row.sport));
    const badCurrent = checkin.energy === "low" || checkin.performance === "down" || checkin.fatigue === "high" || ["active", "recovering"].includes(checkin.illness);
    const reportedHealth = reportedHealthHistory(state?.days, endDate, state?.training?.records);
    const currentContextFirst = badCurrent || reportedHealth.unresolved;
    const healthSources = Object.entries(reportedHealth.fields).filter(([, row]) => row.status !== "none")
      .flatMap(([field, row]) => row.sources || [{ kind: `reported-${field}`, date: row.date }]);
    const healthReminder = Object.entries(reportedHealth.fields).filter(([, row]) => row.status !== "none").map(([field, row]) => {
      if (row.status === "conflicting") return `${row.date}의 ${field === "illness" ? "질병" : "통증"} 기록이 서로 달라요.`;
      const report = field === "illness" ? row.status === "recovering" ? "질병 뒤 회복 중이라고" : "질병 중이라고"
        : row.status === "stop" ? "통증 때문에 운동을 멈춰야 한다고" : "통증이 있다고";
      return `${row.date}에 ${report} 남겼어요.`;
    }).join(" ");
    const validMeals = day => day?.meals?.length && day.meals.every(meal => ["protein", "carbs", "fat"].every(key => finite(meal[key]) && meal[key] >= 0));
    const paired = days.filter(day => day.complete && validMeals(day) && day.planSnapshot?.status === "ready")
      .map(day => ({ date: day.date, totals: mealTotals(day.meals), plan: day.planSnapshot }));
    const savedGoals = days.filter(day => day.complete && ["ready", "review", "incomplete"].includes(day.planSnapshot?.status)
      && ["gain", "lose", "maintain", "recomp", "performance"].includes(day.planSnapshot.context?.goal))
      .map(day => ({ date: day.date, goal: day.planSnapshot.context.goal }));
    const recent = paired.filter(row => row.date >= shiftDate(endDate, -13));
    const lowEnergy = recent.filter(row => row.totals.kcal < row.plan.energy.targetKcal * 0.8);
    const lowProtein = recent.filter(row => meaningfulMacroGap(row.totals.protein, row.plan.macros.protein.min));
    const lowCarbs = recent.filter(row => meaningfulMacroGap(row.totals.carbs, row.plan.macros.carbs.min));
    const connections = [];
    const add = (kind, title, body, observations, sources) => connections.push({ kind, title, body, observations, sources, basis: "product-choice", diagnostic: false });
    const foodSources = rows => rows.map(row => ({ kind: "completed-meals-and-saved-target", date: row.date }));
    if (lowEnergy.length >= 3) add("fuel-recovery", "평소 식사를 다시 채우기",
      `최근 완료한 식사 중 ${lowEnergy.length}일은 그날 저장한 열량 목표보다 적게 기록됐어요.${currentContextFirst ? " 몸 상태를 확인하는 동안 식사는 더 줄이지 말고 평소 양부터 챙겨 보세요. 식사 차이를 운동으로 맞추려고 하지는 않아요." : " 빠진 식사가 없다면 끼니를 건너뛰기보다 평소 식사를 챙겨 보세요."} 목표도 시작 기준이니 허기와 ${trainingFocus && !currentContextFirst ? "다음 운동 때의 컨디션" : "평소 컨디션"}을 보며 조절해요.`,
      lowEnergy.map(row => ({ date: row.date, intakeKcal: row.totals.kcal, savedTargetKcal: row.plan.energy.targetKcal, goal: row.plan.context?.goal || null })), foodSources(lowEnergy).concat(currentContextFirst ? healthSources : []));
    if (lowProtein.length >= 3) add("protein-distribution", "다음 끼니에도 단백질 챙기기",
      `최근 완료 식사 ${lowProtein.length}일에서 단백질이 당시 계획 범위 아래였어요. 다음 끼니에는 평소 문제없이 먹어 온 단백질 공급원을 곁들여 보세요. 한 끼에 몰아먹기보다 평소 끼니에 나눠 챙겨요.`,
      lowProtein.map(row => ({ date: row.date, proteinG: row.totals.protein, savedMinimumG: row.plan.macros.protein.min })), foodSources(lowProtein));
    if (endurance && lowCarbs.length >= 3) add("carb-fueling", currentContextFirst ? "평소 끼니의 탄수화물 챙기기" : "운동 전후 연료를 챙기기",
      `유산소·경기·복합 운동 기록과 함께, 완료 식사 ${lowCarbs.length}일의 탄수화물이 당시 계획 범위 아래였어요.${currentContextFirst ? " 지금은 평소 끼니에 문제없이 먹어 온 탄수화물 공급원을 챙기고 몸 상태를 먼저 확인해요. 운동 재개와 보급은 상태를 확인한 뒤 따로 정해요." : " 다음 운동 전후 식사에 평소 문제없이 먹어 온 탄수화물 공급원을 챙겨 보세요. 장시간 운동은 물과 운동 중 먹을 음식도 미리 준비해요."}`,
      lowCarbs.map(row => ({ date: row.date, carbsG: row.totals.carbs, savedMinimumG: row.plan.macros.carbs.min })), foodSources(lowCarbs).concat(currentContextFirst ? healthSources : []));
    if (validMeals(selected) && !selected.complete) {
      const totals = mealTotals(selected.meals);
      add("partial-meal", "지금 남긴 식사에서 다음 끼니로 이어가기",
        `지금까지 식사 ${selected.meals.length}건을 남겼어요. 다음 끼니에는 평소 문제없이 먹어 온 단백질 공급원을 나눠 챙겨요.${sportRows.some(row => row.date === endDate) ? " 오늘 운동 후라면 문제없이 먹어 온 탄수화물 공급원과 물도 함께 챙겨요." : " 남은 끼니는 평소 구성으로 이어가 보세요."} 먹은 전부를 남긴 뒤 하루 완료를 하면 그날 목표와도 비교할 수 있어요.`,
        [{ date: endDate, status: "partial", ...totals }], [{ kind: "partial-meals", date: endDate }]);
    }
    const profileBody = finite(state?.profile?.bodyFatPct) && isValidMeasurementDate(state.profile.bodyFatDate) && state.profile.bodyFatDate <= endDate
      ? { date: state.profile.bodyFatDate, weightKg: state.profile.bodyFatWeightKg, bodyFatPct: state.profile.bodyFatPct,
        skeletalMuscleKg: null, bodyFatMethod: state.profile.bodyFatMethod || "unknown", sourceKind: "profile-body-measurement" } : null;
    const conflicting = days.filter(day => profileBody?.date === day.date && (finite(day.weightKg) || finite(day.bodyFatPct) || finite(day.skeletalMuscleKg)) &&
      !(day.weightKg === profileBody.weightKg && day.bodyFatPct === profileBody.bodyFatPct && day.bodyFatMethod === profileBody.bodyFatMethod) &&
      (finite(day.weightKg) && finite(profileBody.weightKg) && day.weightKg !== profileBody.weightKg
        || finite(day.bodyFatPct)
        || ["bia", "dxa", "caliper"].includes(day.bodyFatMethod) && ["bia", "dxa", "caliper"].includes(profileBody.bodyFatMethod) && day.bodyFatMethod !== profileBody.bodyFatMethod));
    const conflictDates = new Set(conflicting.map(day => day.date));
    if (conflicting.length) add("body-source-check", "같은 날짜의 측정 원본 맞추기",
      `${profileBody.date}의 프로필 체성분과 날짜별 측정이 서로 달라요. 원본에서 체중·체지방률·측정 방법을 함께 확인해 한 측정의 값으로 맞춰 주세요. 그동안 식사나 운동을 이 두 값의 차이 때문에 바꾸지는 않아요.`,
      [{ profile: profileBody, day: { date: conflicting[0].date, weightKg: conflicting[0].weightKg, bodyFatPct: conflicting[0].bodyFatPct,
        skeletalMuscleKg: conflicting[0].skeletalMuscleKg, bodyFatMethod: conflicting[0].bodyFatMethod } }],
      [{ kind: "profile-body-measurement", date: profileBody.date }, { kind: "day-body-measurement", date: conflicting[0].date }]);
    const weights = days.filter(day => finite(day.weightKg) && day.weightKg > 0 && !conflictDates.has(day.date));
    const weightComparison = weightWindowComparison(weights, endDate);
    const { previous, latest, before, after, intervalDays, weeklyChangeKg, weeklyChangePct } = weightComparison;
    const shortChange = recentShortWeightChange(weightComparison.observations, endDate);
    if (weightComparison.enough) {
      const delta = after - before, goal = state?.profile?.goal;
      const direction = delta > 0.05 ? "올랐어요" : delta < -0.05 ? "내렸어요" : "비슷해요";
      const observedGoals = savedGoals.filter(row => row.date >= previous[0].date && row.date <= latest.at(-1).date);
      const goalContextMismatch = !!goal && observedGoals.some(row => row.goal !== goal);
      const repeatedWeightTrend = repeatedWeightObservation(weights, endDate, weightComparison, goal, savedGoals);
      const repeatedGoalMismatch = !!repeatedWeightTrend?.goalContext.confirmedMismatch;
      const rateComparable = weeklyChangeKg !== null;
      const aboveGainReviewRate = rateComparable && weeklyChangePct + 1e-10 >= 0.5, aboveLossReviewRate = rateComparable && -weeklyChangePct + 1e-10 >= 1;
      const individualCare = !!state?.profile && (state.profile.healthContext && state.profile.healthContext !== "general"
        || finite(state.profile.age) && (state.profile.age < 18 || state.profile.age > 80));
      const fastGain = goal === "gain" && aboveGainReviewRate && !goalContextMismatch && !shortChange && !individualCare;
      const fastLoss = goal === "lose" && aboveLossReviewRate && !goalContextMismatch && !shortChange && !individualCare;
      const repeatedReview = !!repeatedWeightTrend && repeatedWeightTrend.betweenComparisons.directionCompatible
        && !repeatedGoalMismatch && !shortChange && !individualCare && !currentContextFirst;
      const priorWeightText = repeatedWeightTrend ? `앞선 ${repeatedWeightTrend.comparisons[0].from}~${repeatedWeightTrend.comparisons[0].to} 측정에서도 중앙값이 ${repeatedWeightTrend.comparisons[0].earlierMedianKg.toFixed(1)}kg에서 ${repeatedWeightTrend.comparisons[0].laterMedianKg.toFixed(1)}kg으로 ${repeatedWeightTrend.kind === "fast-gain" ? "올랐어요" : "내렸어요"}. ` : "";
      let advice = badCurrent && delta < -0.05 && !reportedHealth.unresolved ? "알려준 컨디션도 떨어졌으니 체중을 더 내리기보다 평소 식사·수면부터 안정시켜 보세요."
        : individualCare ? "지금은 이 체중 변화에 맞춰 식사량을 새로 줄이거나 늘리지 말고, 개별 지침 안에서 같은 시간·조건의 측정을 이어가요. 정해진 지침이 없다면 현재 몸 상태와 식사를 전문가와 함께 살펴보세요."
        : currentContextFirst ? `${reportedHealth.unresolved ? `${healthReminder} 지금 상태부터 다시 확인해요.` : "오늘 알려준 피로·컨디션부터 챙겨요."} 지금은 체중 속도에 맞춰 식사를 더 줄이거나 늘리기보다 평소 끼니와 수면을 이어가며 몸 상태를 살펴요.`
        : shortChange ? `${shortChange.before.date}~${shortChange.after.date}의 짧고 큰 변화도 이 흐름에 포함돼요. 식사량을 급히 바꾸기보다 평소 끼니를 이어가며 비슷한 시간·수분 조건에서 다시 측정해요. 다음 측정들에서도 이어지는지 본 뒤 식사와 ${trainingFocus ? "수행" : "허기·컨디션"}을 함께 맞춰요.`
        : !rateComparable ? "두 묶음의 측정일이 며칠 사이에 모여 있어요. 지금은 이 차이를 한 주의 증량·감량 속도로 삼지 말고, 평소 끼니를 이어가며 비슷한 시간·조건에서 다음 체중을 확인해요."
        : goalContextMismatch || repeatedGoalMismatch ? "이 측정 기간에 저장한 목표와 현재 목표가 달라요. 그전 체중 흐름에 맞춰 새 목표의 식사량을 바로 바꾸기보다, 현재 정한 끼니를 이어가며 같은 조건의 체중과 허기·컨디션을 함께 확인해요."
        : repeatedWeightTrend && !repeatedWeightTrend.betweenComparisons.directionCompatible ? `${priorWeightText}다만 두 비교 사이에는 체중이 반대 방향으로 움직였어요. 빠른 변화가 계속된 것으로 삼아 식사량을 더 조정하기보다 현재 끼니를 이어가며 다음 측정과 허기·컨디션을 함께 확인해요.`
        : repeatedReview && fastGain ? `${priorWeightText}두 기간에서 빠른 증가가 반복됐으니, 지금 증량 목표에서는 식사량을 더 올리지 말고 최근 더한 식사·간식이 있다면 그 추가분을 조금 줄이는 선택을 해보세요. 평소 끼니 전체를 급히 줄이기보다 ${trainingFocus ? "실제 수행과 허기·회복" : "허기·컨디션"}을 함께 보며 조절해요. 체중 증가를 전부 근육으로 계산하지는 않아요.`
        : repeatedReview && fastLoss ? `${priorWeightText}두 기간에서 빠른 감소가 반복됐으니, 지금 감량 목표에서는 식사를 더 줄이거나 운동을 더해 맞추지 말고 감량 목표를 더 완만하게 잡는 선택을 해보세요. 최근 줄인 끼니나 추가한 활동이 있다면 그 부분부터 살펴 평소 식사와 ${trainingFocus ? "수행·회복" : "허기·수면"}을 챙겨요.`
        : repeatedReview ? `${priorWeightText}두 기간의 같은 방향 변화가 반복됐어요. 지금 원하는 목표와 이 흐름을 먼저 맞춰 보고, 평소 끼니를 이어가며 ${trainingFocus ? "실제 수행·회복" : "허기·컨디션"}을 함께 확인해요.`
        : fastGain ? `증량 중이지만 지금은 식사량을 더 올리지 말고 같은 시간·조건에서 체중을 이어서 확인해요. 이 흐름이 계속되면 최근 더한 식사·간식이 있는지 살펴 그 추가분을 조금 줄이는 선택을 해보세요.${trainingFocus ? " 실제 수행이 좋아지는지도 함께 보고" : " 허기와 평소 끼니도 함께 보고"}, 체중 증가를 전부 근육으로 계산하지는 않아요.`
        : fastLoss ? `감량 중이라도 지금은 식사를 더 줄이지 말고 허기·수면${trainingFocus ? "·다음 운동 반응" : "·컨디션"}을 살펴요. 같은 조건에서 이 흐름이 계속되면 감량 목표를 더 완만하게 잡는 선택을 해보세요.`
        : goal === "gain" && delta > 0.05 ? `증량 중이라면 현재 식사에서 이어가되 몸무게를 더 빨리 올리기보다 ${trainingFocus ? "실제 운동 수행" : "허기·컨디션"}을 함께 살펴보세요.`
        : goal === "lose" && delta < -0.05 ? `감량 중이라면 당장 식사를 더 줄이지 않고 현재 구성을 이어가며 ${trainingFocus ? "수행과 허기" : "허기·컨디션"}를 살펴보세요.`
        : `체중만 보고 식사량을 바꾸기보다 같은 측정 조건을 이어가며 현재 목표에 맞는지, ${trainingFocus ? "운동할 때 몸이 어떻게 반응하는지" : "실제 식사와 허기가 어떤지"} 함께 보세요.`;
      add("weight-training", trainingFocus ? "체중 흐름과 지금 수행 함께 보기" : "체중 흐름과 식사 함께 보기", `최근 두 주에 남긴 체중의 중앙값은 ${before.toFixed(1)}kg에서 ${after.toFixed(1)}kg으로 ${direction}.${rateComparable ? ` 측정 간격을 맞춰 보면 주당 약 ${weeklyChangeKg >= 0 ? "+" : ""}${weeklyChangeKg.toFixed(2)}kg의 흐름이에요.` : ""} ${advice}`,
        [{ from: previous[0].date, to: latest.at(-1).date,
          earlierMedianKg: before, laterMedianKg: after, differenceKg: delta, earlierDates: previous.map(day => day.date), laterDates: latest.map(day => day.date),
          intervalDays, weeklyChangeKg, weeklyChangePct, rateComparable, goal: goal || null, observedGoals, goalContextMismatch,
          currentRecoveryReported: badCurrent, aboveGainReviewRate, aboveLossReviewRate, fastGainReview: fastGain, fastLossReview: fastLoss,
          repeatedWeightTrend, reportedHealth,
          followUpStage: currentContextFirst || individualCare ? "current-context-first" : shortChange || !rateComparable ? "repeat-measurement"
            : goalContextMismatch || repeatedGoalMismatch ? "current-goal-follow-up" : repeatedReview && (fastGain || fastLoss) ? "current-food-review" : "repeat-measurement",
          recentShortChange: shortChange ? { from: shortChange.before.date, to: shortChange.after.date,
            beforeKg: shortChange.before.weightKg, afterKg: shortChange.after.weightKg, elapsedDays: shortChange.elapsedDays } : null }],
        [...new Set(repeatedWeightTrend ? repeatedWeightTrend.comparisons.flatMap(row => [...row.earlierDates, ...row.laterDates]) : [...previous, ...latest].map(day => day.date))]
          .map(date => ({ kind: "weight-measurement", date })).concat((goalContextMismatch || repeatedGoalMismatch ? repeatedWeightTrend?.goalContext.observedGoals || observedGoals : [])
            .map(row => {
              const day = days.find(day => day.date === row.date);
              return { kind: day?.planSnapshot?.status !== "ready" ? "completed-day-saved-goal"
                : validMeals(day) ? "completed-meals-and-saved-target" : "completed-day-saved-target", date: row.date };
            }))
          .concat(healthSources));
    }
    if (shortChange) {
      const a = shortChange.before, b = shortChange.after;
      add("weight-fluctuation", "급한 체중 변화부터 다시 확인하기",
        `${a.date} ${a.weightKg}kg에서 ${b.date} ${b.weightKg}kg으로 짧은 기간에 체중이 크게 바뀌었어요. 다음 측정은 비슷한 시간·수분 상태로 확인하고, 식사는 평소대로 챙겨 보세요. 이 변화만으로 근육·지방이 그만큼 바뀌었다고 보고 식사나 운동을 급히 조정하지는 않아요.`,
        [{ from: a.date, to: b.date, before: { date: a.date, weightKg: a.weightKg }, after: { date: b.date, weightKg: b.weightKg },
          latestRecorded: { date: weightComparison.observations.at(-1).date, weightKg: weightComparison.observations.at(-1).weightKg } }],
        [a, b, weightComparison.observations.at(-1)].filter((day, index, rows) => rows.findIndex(row => row.date === day.date) === index)
          .map(day => ({ kind: "weight-measurement", date: day.date })));
    }
    const body = days.filter(day => finite(day.weightKg) && (finite(day.bodyFatPct) || finite(day.skeletalMuscleKg)) && !conflictDates.has(day.date))
      .map(day => ({ ...day, sourceKind: "day-body-measurement" }));
    if (profileBody && finite(profileBody.weightKg) && !conflictDates.has(profileBody.date) && !body.some(day => day.date === profileBody.date)) body.push(profileBody);
    body.sort((a, b) => a.date.localeCompare(b.date));
    if (body.length >= 2) {
      const current = body.at(-1), prior = body.slice(0, -1).reverse().find(day => day.bodyFatMethod === current.bodyFatMethod && ["bia", "dxa", "caliper"].includes(day.bodyFatMethod) &&
        ((finite(current.bodyFatPct) && finite(day.bodyFatPct)) || (finite(current.skeletalMuscleKg) && finite(day.skeletalMuscleKg))));
      if (prior) {
        const elapsed = (Date.parse(current.date) - Date.parse(prior.date)) / DAY;
        const measurements = [
          { label: "체지방률", key: "bodyFatPct", unit: "%", particle: "로" },
          { label: "골격근량", key: "skeletalMuscleKg", unit: "kg", particle: "으로" }
        ].filter(metric => finite(prior[metric.key]) && finite(current[metric.key]));
        const changed = measurements.some(metric => prior[metric.key] !== current[metric.key]);
        const details = measurements.map(metric => prior[metric.key] === current[metric.key]
          ? `${metric.label}은 ${current[metric.key]}${metric.unit}${metric.particle} 같아요.`
          : `${metric.label}은 ${prior[metric.key]}${metric.unit}에서 ${current[metric.key]}${metric.unit}${metric.particle} 기록됐어요.`).join(" ");
        const followUp = changed && elapsed < 14
          ? " 수치가 바뀐 항목은 다음에도 비슷한 시간·식사·수분 조건에서 확인해 보세요."
          : trainingFocus ? " 같은 측정 조건을 이어가고 체중 흐름과 실제 수행도 나란히 보세요." : " 같은 측정 조건을 이어가고 체중 흐름과 실제 식사도 나란히 보세요.";
        add("body-training", "체성분 숫자를 다음 행동과 함께 보기",
          `같은 방법으로 측정한 두 기록(${prior.date}, ${current.date})을 보면, ${details}${followUp}${currentContextFirst ? " 지금은 측정 숫자를 쫓아 식사나 운동을 더 밀지 말고, 평소 끼니와 수면을 챙기며 알려준 몸 상태부터 확인해요." : trainingFocus ? " 최근 수행이 유지되거나 나아진다면 측정 한 번에 프로그램을 뒤집지 않고 현재 운동을 이어가 보세요." : " 체성분 숫자 하나보다 현재 식사와 체중 흐름을 함께 확인해요."}`,
          [{ before: { date: prior.date, weightKg: prior.weightKg, bodyFatPct: prior.bodyFatPct, skeletalMuscleKg: prior.skeletalMuscleKg }, after: { date: current.date, weightKg: current.weightKg, bodyFatPct: current.bodyFatPct, skeletalMuscleKg: current.skeletalMuscleKg }, method: current.bodyFatMethod }], [prior, current].map(day => ({ kind: day.sourceKind, date: day.date })).concat(currentContextFirst ? healthSources : []));
      } else add("body-method-change", "측정 방법별로 다시 출발점 잡기", `최근 체성분은 측정 방법이나 함께 기록된 항목이 달라요. 다음에는 같은 방법·비슷한 조건으로 측정해 그 방법의 기준을 이어가 보세요.${currentContextFirst ? " 지금은 평소 끼니와 수면을 챙기며 알려준 몸 상태부터 확인해요." : " 지금 운동·식사는 실제 수행과 체중 흐름을 기준으로 이어가요."}`,
        body.map(day => ({ date: day.date, method: day.bodyFatMethod })), body.map(day => ({ kind: day.sourceKind, date: day.date })).concat(currentContextFirst ? healthSources : []));
    }
    return { from, to: endDate, completeMealDays: days.filter(day => day.complete && validMeals(day)).length, comparableTargetDays: paired.length, partialMealDays: days.filter(day => validMeals(day) && !day.complete).length,
      goalCount: new Set(paired.map(row => row.plan.context?.goal).filter(Boolean)).size, connections };
  }
  function isValidMeasurementDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
  function measurementHistory(input) {
    const days = input.filter(day => isValidMeasurementDate(day.date)).slice().sort((a, b) => a.date.localeCompare(b.date));
    const metrics = [];
    for (const key of ["weightKg", "bodyFatPct", "skeletalMuscleKg"]) {
      const rows = days.filter(day => finite(day[key]));
      const methods = key === "weightKg" ? ["recorded-weight"] : [...new Set(rows.map(day => day.bodyFatMethod || "unknown"))];
      for (const method of methods) {
        const observed = key === "weightKg" ? rows : rows.filter(day => (day.bodyFatMethod || "unknown") === method);
        if (!observed.length) continue;
        const point = day => ({ date: day.date, [key]: day[key], source: "day-measurement" });
        const min = Math.min(...observed.map(day => day[key])), max = Math.max(...observed.map(day => day[key]));
        metrics.push({ key, method, observationCount: observed.length, first: point(observed[0]), last: point(observed.at(-1)),
          min: point(observed.find(day => day[key] === min)), max: point(observed.find(day => day[key] === max)) });
      }
    }
    const weights = days.filter(day => finite(day.weightKg) && day.weightKg > 0), changes = [];
    for (let index = 1; index < weights.length; index++) {
      const before = weights[index - 1], after = weights[index], span = (Date.parse(after.date) - Date.parse(before.date)) / DAY;
      if (span > 0 && span <= 3 && Math.abs(after.weightKg - before.weightKg) / before.weightKg >= 0.02) changes.push({
        kind: "short-weight-change-observation", from: before.date, to: after.date,
        before: { date: before.date, weightKg: before.weightKg }, after: { date: after.date, weightKg: after.weightKg },
        elapsedDays: span, nextRecorded: weights[index + 1] ? { date: weights[index + 1].date, weightKg: weights[index + 1].weightKg } : null,
        basis: "record-observation", diagnostic: false });
    }
    return { metrics, originalWeightChangeCount: changes.length, weightChanges: changes.length <= 6 ? changes : [changes[0], ...changes.slice(-5)],
      weightChangesSampled: changes.length > 6,
      interpretation: "조회 기간 전체의 측정 관찰 범위와 짧은 체중 변화입니다. 최저·최고도 실제 날짜의 관찰이지 지방·근육 변화량이 아닙니다. 다음 관찰은 회복·수분 원인의 확인이 아니며 다른 체성분 방법은 분리합니다." };
  }
  return { dateKey, shiftDate, mealTotals, median, historySummary, dailyGuidance, alcoholGrams, mealSignature, copyMealPreview, observationSummary, suggestAllocation, coachingConnections, measurementHistory, meaningfulMacroGap, reportedHealthHistory };
});
