const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/insights.js');
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
