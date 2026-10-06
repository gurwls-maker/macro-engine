const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/insights.js');
test('alcohol conversion uses volume, ABV and quantity without treating blanks as zero', () => {
  assert.ok(Math.abs(I.alcoholGrams(500, 5, 2) - 39.45) < 1e-9);
  assert.equal(I.alcoholGrams(500, 0, 2), 0);
  for (const values of [[null, 5, 1], ['', 5, 1], [500, '5', 1], [500, 101, 1], [500, 5, -1], [Infinity, 5, 1]]) assert.equal(I.alcoholGrams(...values), null);
});
test('previous-day preview matches complete meal content and duplicate multiplicity, not names', () => {
  const meal = { id: 'one', name: '밥', protein: 20, carbs: 50, fat: 10, otherKcal: 0, alcoholG: 0 };
  const source = [meal, { ...meal, id: 'two' }, { ...meal, id: 'three', carbs: 80 }, { ...meal, id: 'four', note: '운동 후' }];
  const before = structuredClone(source);
  const preview = I.copyMealPreview(source, [{ ...meal, id: 'existing' }]);
  assert.deepEqual(preview.map(row => row.possibleDuplicate), [true, false, false, false]);
  assert.deepEqual(source, before);
});
test('observation periods use paired completed targets and do not zero-fill missing days', () => {
  const base = { date: '2026-10-05', weightKg: 70, bodyFatPct: 20, skeletalMuscleKg: null, bodyFatMethod: 'bia', complete: true,
    meals: [{ protein: 100, carbs: 200, fat: 50, otherKcal: 0, alcoholG: 0 }],
    planSnapshot: { status: 'ready', energy: { targetKcal: 2000 }, macros: { protein: { target: 120 }, carbs: { target: 230 }, fat: { target: 60 } }, context: { goal: 'maintain' } } };
  const days = { '2026-10-05': base,
    '2026-10-04': { ...base, date: '2026-10-04', complete: false },
    '2026-10-03': { ...base, date: '2026-10-03', planSnapshot: { status: 'review' } },
    '2026-10-06': { ...base, date: '2026-10-06' },
    '2026-09-25': { ...base, date: '2026-09-25', planSnapshot: { ...base.planSnapshot, context: { goal: 'gain' } } } };
  const before = structuredClone(days), result = I.observationSummary(days, '2026-10-05', 7);
  assert.equal(result.paired.length, 1);
  assert.equal(result.openCount, 1);
  assert.equal(result.missingCount, 4);
  assert.equal(result.withoutTargetCount, 1);
  assert.deepEqual(result.averages.kcal, { intake: 1650, target: 2000, difference: -350 });
  assert.equal(result.averages.protein.intake, 100);
  assert.equal(result.body.skeletalMuscleKg.length, 0);
  assert.equal(result.body.bodyFatPct[0].method, 'bia');
  for (const period of [14, 28, 42]) {
    const summary = I.observationSummary(days, '2026-10-05', period);
    assert.equal(summary.paired.length, 2);
    assert.equal(summary.goalCount, 2);
  }
  assert.deepEqual(days, before);
  assert.throws(() => I.observationSummary(days, '2026-10-05', 30));
});
test('empty observation periods preserve unknown averages and measurements', () => {
  const result = I.observationSummary({}, '2026-10-05', 42);
  assert.equal(result.missingCount, 42);
  assert.deepEqual(result.averages.fat, { intake: null, target: null, difference: null });
  assert.deepEqual(result.body, { weightKg: [], bodyFatPct: [], skeletalMuscleKg: [] });
});
test('allocation preference is an opt-in observation preserving energy and protein within joint bounds', () => {
  const plan = { status: 'ready', context: { goal: 'maintain' }, energy: { targetKcal: 2110 }, macros: { protein: { target: 120 }, carbs: { target: 250, min: 200, max: 300 }, fat: { target: 70, min: 50, max: 80 } } };
  const days = {};
  for (let index = 1; index <= 4; index++) {
    const date = I.shiftDate('2026-10-05', -index);
    days[date] = { date, complete: true, planSnapshot: plan, meals: [{ protein: 150, carbs: 400, fat: 10, otherKcal: 0, alcoholG: 0 }] };
  }
  const before = structuredClone({ plan, days });
  const result = I.suggestAllocation(days, '2026-10-05', plan);
  assert.equal(result.status, 'ready');
  assert.equal(result.count, 4);
  assert.equal(result.proposed.protein, 120);
  assert.equal(result.proposed.kcal, 2110);
  assert.ok(Math.abs(result.proposed.carbs * 4 + result.proposed.fat * 9 + 480 - 2110) < 1e-8);
  assert.ok(result.proposed.carbs <= 300 && result.proposed.carbs >= 200);
  assert.ok(result.proposed.fat >= 50 && result.proposed.fat <= 80);
  assert.deepEqual({ plan, days }, before);
  assert.equal(I.suggestAllocation(days, '2026-10-05', { status: 'review' }).status, 'unavailable');
  assert.equal(I.suggestAllocation(days, '2026-10-05', plan, 'gain').status, 'insufficient');
  for (const change of [day => { day.complete = false; }, day => { day.meals[0].alcoholG = 1; }, day => { day.meals[0].otherKcal = 1; }]) {
    const changed = structuredClone(days); change(changed['2026-10-04']);
    assert.equal(I.suggestAllocation(changed, '2026-10-05', plan).status, 'insufficient');
  }
});
test('nutrition totals keep alcohol and other energy separate', () => {
  const total = I.mealTotals([{ protein: 25, carbs: 50, fat: 10, alcoholG: 14, otherKcal: 12 }]);
  assert.equal(total.kcal, 500);
  assert.equal(total.alcoholG, 14);
});
test('calendar boundaries do not shift due to UTC/local conversion', () => {
  assert.equal(I.shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(I.shiftDate('2026-01-01', -1), '2025-12-31');
});
test('weight-only and unfinished days never become completed diet evidence', () => {
  const days = {};
  for (let i = 0; i < 14; i++) {
    const date = I.shiftDate('2026-10-05', -i);
    days[date] = { date, weightKg: 70 + i / 10, meals: [], complete: false };
  }
  const result = I.historySummary(days, '2026-10-05', 'lose');
  assert.ok(Math.abs(result.weeklyChange + 0.7) < 1e-8);
  assert.equal(result.comparable.length, 0);
  assert.equal(result.averageKcal, null);
  assert.match(result.trendMessage, /평소 끼니.*허기·컨디션/);
  assert.doesNotMatch(result.trendMessage, /기록이.*미만이라|조정은 아직 제안하지|2~4주 더/);
});
test('future dates and changed goals cannot support the active trend', () => {
  const days = {
    '2026-10-06': { date: '2026-10-06', weightKg: 80, complete: true, meals: [], planSnapshot: { status: 'ready', context: { goal: 'lose' } } },
    '2026-10-04': { date: '2026-10-04', weightKg: 70, complete: true, meals: [], planSnapshot: { status: 'ready', context: { goal: 'gain' } } }
  };
  const result = I.historySummary(days, '2026-10-05', 'lose');
  assert.equal(result.list.length, 1);
  assert.equal(result.completed.length, 0);
  assert.equal(result.weeklyChange, null);
});
test('incomplete meals never trigger full-day shortage advice', () => {
  const plan = { status: 'ready', energy: { targetKcal: 2000 }, macros: { protein: { min: 100 } }, guidance: [] };
  const day = { complete: false, meals: [{ protein: 10, carbs: 10, fat: 3 }] };
  assert.deepEqual(I.dailyGuidance(plan, day).map(x => x.id), ['open']);
  assert.ok(I.dailyGuidance(plan, { ...day, complete: true }).some(x => x.id === 'low-energy'));
});
test('recovery warning survives the advice budget and suppresses conflicting deficit advice', () => {
  const plan = { status: 'ready', energy: { targetKcal: 2000 }, macros: { protein: { min: 100 } }, guidance: ['goal', 'sport', 'fueling', 'protein-basis', 'availability', 'female-athlete'].map(id => ({ id, title: id, body: id })) };
  const result = I.dailyGuidance(plan, { complete: true, meals: [{ protein: 10, carbs: 10, fat: 3 }] });
  assert.equal(result[0].id, 'availability');
  assert.equal(result.length, 5);
  assert.equal(result.some(item => item.id === 'goal'), false);
  assert.ok(result.some(item => item.id === 'low-energy'));
});
