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
  function historySummary(days, endDate, goal) {
    const list = Object.values(days || {}).filter(day => day.date <= endDate && day.date >= shiftDate(endDate, -27)).sort((a, b) => a.date.localeCompare(b.date));
    const firstStart = shiftDate(endDate, -13);
    const split = shiftDate(endDate, -6);
    const weights = list.filter(day => finite(day.weightKg) && day.weightKg > 0);
    const earlier = weights.filter(day => day.date >= firstStart && day.date < split);
    const later = weights.filter(day => day.date >= split);
    const completed = list.filter(day => day.complete && day.planSnapshot?.status === 'ready' && day.planSnapshot?.context?.goal === goal);
    const comparable = completed.filter(day => day.date >= firstStart);
    const enoughWeights = earlier.length >= 3 && later.length >= 3;
    const earlierWeight = median(earlier.map(day => day.weightKg));
    const laterWeight = median(later.map(day => day.weightKg));
    const earlierDate = median(earlier.map(day => Date.parse(`${day.date}T12:00:00Z`)));
    const laterDate = median(later.map(day => Date.parse(`${day.date}T12:00:00Z`)));
    const intervalDays = enoughWeights ? (laterDate - earlierDate) / DAY : 0;
    const weeklyChange = enoughWeights && intervalDays >= 5 ? (laterWeight - earlierWeight) * 7 / intervalDays : null;
    let trendMessage = '최근 2주 동안 각 주에 체중을 3번 이상 기록하면 하루 변동을 줄인 추세를 볼 수 있어요.';
    if (weeklyChange !== null) {
      const direction = weeklyChange > 0.05 ? '증가' : weeklyChange < -0.05 ? '감소' : '유지';
      trendMessage = `최근 체중은 주당 약 ${Math.abs(weeklyChange).toFixed(2)}kg ${direction} 추세예요. 수분·염분·월경·측정 시간에 따른 변화도 함께 포함돼요.`;
      if (comparable.length < 10) trendMessage += ' 같은 목표로 완료한 식사 기록이 10일 미만이라 열량 조정은 아직 제안하지 않아요.';
      else trendMessage += ' 같은 조건으로 2~4주 더 살펴보고, 운동 수행과 허기·회복 상태까지 함께 판단해 주세요. 목표는 자동으로 바뀌지 않아요.';
    }
    return { list, weights, completed, comparable, weeklyChange, earlierWeight, laterWeight, trendMessage, averageKcal: completed.length ? completed.reduce((sum, day) => sum + mealTotals(day.meals).kcal, 0) / completed.length : null };
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
      else items.push({ id: 'energy-ok', title: '계획한 섭취량에 가까운 하루예요', body: '열량이 비슷해도 식품의 질과 미량영양소까지 확인한 것은 아니에요. 다양한 식품과 채소·과일을 함께 챙겨 주세요.' });
      if (totals.protein < plan.macros.protein.min) items.push({ id: 'protein', title: '단백질을 식사마다 나누어 보세요', body: '기록된 단백질이 계획 범위 아래예요. 생선·달걀·두부·콩·유제품처럼 평소 먹는 식품으로 다음 식사부터 보완해 주세요.' });
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
  return { dateKey, shiftDate, mealTotals, median, historySummary, dailyGuidance, alcoholGrams, mealSignature, copyMealPreview, observationSummary, suggestAllocation };
});
