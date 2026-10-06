'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../src/coach-actions.js');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const T = require('../src/training.js');
const N = require('../src/nutrition.js');
const I = require('../src/insights.js');
const today = '2026-01-06', createdAt = '2026-01-06T09:00:00.000Z', appliedAt = '2026-01-06T09:01:00.000Z';
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
function day(date = today) { return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null }; }
function complete(state, date = today) { state.days[date].meals = [{ id: 'synthetic-meal', name: '합성 식사', protein: 20, carbs: 50, fat: 10, otherKcal: 0, alcoholG: 0 }]; state.days[date].complete = true; state.days[date].planSnapshot = N.calculatePlan(profile, state.days[date]); }
function fixture() {
  const state = S.createEmpty(); state.updatedAt = createdAt; state.profile = structuredClone(profile); state.training = TS.createEmpty(); state.days[today] = day();
  const template = T.recommendProgram(profile, state.training.settings);
  for (const id of ['program-a', 'program-b']) state.training.planning.programs.push(T.createProgram(template, { id, createdAt }));
  state.training.planning.activeProgramId = 'program-a';
  state.training.planning.schedule.push(T.createAssignment(state.training.planning.programs[0], state.training.planning.programs[0].days[0].id, today, 'assignment-a'));
  return S.validateState(state);
}
function draft(state, kind = 'schedule', overrides = {}) {
  const targetId = kind === 'program' ? 'active-program' : kind === 'allocation' ? today : 'assignment-a';
  const choice = kind === 'program' ? { programId: 'program-b' } : kind === 'allocation' ? { deltaG: 20 } : kind === 'schedule' ? { date: '2026-01-07', adjustmentReviewDate: null } : { kind: 'deload', setReduction: 1, rirIncrease: 1, exerciseId: null, loadKg: null };
  return A.createDraft(state, { kind, targetId, choice: overrides.choice || choice }, { id: overrides.id || 'action-a', reason: '합성 사용자 선택', reviewDate: '2026-01-13', now: createdAt, today, ...overrides.meta });
}
const apply = (state, id = 'action-a') => A.applyDraft(state, id, { now: appliedAt, today });

test('old workspace and full backup normalize actions without changing records or old follow-ups', () => {
  const state = fixture(); delete state.training.actions;
  state.training.followUps.push({ id: 'old-followup', topic: 'general', note: '기존 약속', reviewDate: '2026-01-13', status: 'open', createdAt });
  const copy = structuredClone(state), normalized = S.validateState(state);
  assert.deepEqual(normalized.training.actions, []); assert.deepEqual(normalized.training.followUps, copy.training.followUps);
  assert.deepEqual(state, copy);
  assert.deepEqual(S.parseBackup(S.exportBackup(normalized)).state, normalized);
});

test('drafts preview supported before-after values without changing actual or planned data', () => {
  for (const kind of ['program', 'schedule', 'allocation', 'burden']) {
    const state = fixture(), before = structuredClone(state), next = draft(state, kind);
    assert.deepEqual(state, before); assert.deepEqual(next.days, before.days);
    assert.deepEqual(next.training.planning, before.training.planning); assert.deepEqual(next.training.records, before.training.records);
    assert.equal(next.training.actions[0].status, 'draft'); assert.equal(next.training.followUps.length, 0);
  }
});

test('program selection changes only active selection and retains completed day snapshots', () => {
  const state = fixture(); complete(state);
  const next = apply(draft(state, 'program'));
  assert.equal(next.training.planning.activeProgramId, 'program-b');
  assert.deepEqual(next.training.planning.schedule, state.training.planning.schedule); assert.deepEqual(next.days, state.days);
  assert.equal(next.training.actions[0].status, 'applied'); assert.equal(next.training.followUps[0].reviewDate, '2026-01-13');
});

test('equal-calorie allocation preserves protein and calories, touches one date only', () => {
  const state = fixture(), before = structuredClone(state.days);
  const next = apply(draft(state, 'allocation')), action = next.training.actions[0];
  assert.equal(next.days[today].carbAdjustmentG, 20); assert.equal(action.before.proteinG, action.after.proteinG); assert.equal(action.before.kcal, action.after.kcal);
  assert.ok(Math.abs((action.after.carbsG - action.before.carbsG) * 4 + (action.after.fatG - action.before.fatG) * 9) < 1e-7);
  assert.deepEqual({ ...next.days[today], carbAdjustmentG: 0 }, before[today]);
  assert.deepEqual(next.training.planning, state.training.planning);
});

test('app-limited allocation displays clamped macros rather than inventing a target', () => {
  const next = draft(fixture(), 'allocation', { choice: { deltaG: 500 } }), action = next.training.actions[0];
  const calculated = N.adjustAllocation(N.calculatePlan(profile, next.days[today]), 500);
  assert.equal(action.after.carbsG, calculated.macros.carbs.target); assert.equal(action.after.fatG, calculated.macros.fat.target);
  assert.equal(action.after.carbAdjustmentG, 500);
});

test('changed target or physiological basis rejects stale draft but unrelated chat does not', () => {
  for (const kind of ['program', 'schedule', 'allocation', 'burden']) {
    const next = draft(fixture(), kind), original = structuredClone(next);
    next.profile.goal = 'gain'; assert.throws(() => apply(next), /기준이 달라/); assert.equal(next.training.actions[0].status, 'draft');
    const unrelated = structuredClone(original);
    unrelated.training.messages.push({ id: 'unrelated', role: 'user', text: '새 질문', createdAt, source: 'codex', replyTo: null, contextDigest: null, status: 'pending' });
    assert.equal(apply(unrelated).training.actions[0].status, 'applied');
  }
});

test('tampered previews and arbitrary unsupported values are rejected at apply or validation', () => {
  for (const change of [state => { state.training.actions[0].after.date = '2026-01-08'; }, state => { state.training.actions[0].before.date = '2026-01-05'; }, state => { state.training.actions[0].basis = '0'.repeat(16); }]) {
    const state = draft(fixture()); change(state); assert.throws(() => apply(state), /기준이 달라|일치하지/);
  }
  for (const change of [state => { state.training.actions[0].extra = true; }, state => { state.training.actions[0].choice.date = '2026-02-30'; }, state => { state.training.actions[0].status = 'applied'; }, state => { state.training.actions[0].after.date = null; }, state => { state.training.actions.push(structuredClone(state.training.actions[0])); }]) {
    const state = draft(fixture()); change(state); assert.throws(() => S.validateState(state));
  }
  assert.throws(() => draft(fixture(), 'allocation', { choice: { deltaG: null } }));
  assert.throws(() => draft(fixture(), 'allocation', { choice: { deltaG: 501 } }));
  assert.throws(() => draft(fixture(), 'burden', { choice: { kind: 'deload', setReduction: 0, rirIncrease: 0, exerciseId: null, loadKg: null } }));
});

test('cancel does not apply anything and cannot cancel an already applied choice', () => {
  const state = draft(fixture()), next = A.cancelDraft(state, 'action-a', { now: appliedAt });
  assert.equal(next.training.actions[0].status, 'cancelled'); assert.deepEqual(next.training.planning, state.training.planning);
  assert.equal(next.training.followUps.length, 0); assert.throws(() => apply(next));
  assert.throws(() => A.cancelDraft(apply(state), 'action-a', { now: appliedAt }));
});

test('completed dates and performed assignments cannot be changed by drafts or rollback', () => {
  for (const kind of ['schedule', 'allocation', 'burden']) {
    const state = draft(fixture(), kind); complete(state);
    assert.throws(() => apply(state), /완료한 날짜/);
  }
  const state = apply(draft(fixture(), 'allocation')); complete(state);
  assert.throws(() => A.undoAction(state, 'action-a', { now: appliedAt }), /완료한 날짜/);
  const moved = apply(draft(fixture())), row = moved.training.planning.schedule[0];
  moved.training.records.push({ id: 'performed', date: row.date, time: null, label: '실제 합성 기록', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, exercises: [], notes: '', effort: null, pain: null });
  row.status = 'performed'; row.recordId = 'performed';
  assert.throws(() => A.undoAction(moved, 'action-a', { now: appliedAt }), /수행하거나/);
});

test('date move checks duplicate assignments and preserves prescription and actual records', () => {
  const state = fixture(), moved = apply(draft(state));
  assert.equal(moved.training.planning.schedule[0].date, '2026-01-07');
  assert.deepEqual(moved.training.planning.schedule[0].prescription, state.training.planning.schedule[0].prescription);
  assert.deepEqual(moved.training.records, state.training.records);
  const duplicate = draft(fixture());
  duplicate.training.planning.schedule.push({ ...structuredClone(duplicate.training.planning.schedule[0]), id: 'other', date: '2026-01-07' });
  assert.throws(() => apply(duplicate), /같은 세션/);
});

test('existing adjustment review date follows the explicit date move', () => {
  const state = fixture(); state.training.planning.schedule[0] = T.adjustAssignment(state.training.planning.schedule[0], { kind: 'maintain', reason: '기존 합성 조정', reviewDate: '2026-01-13' });
  const choice = { date: '2026-01-10', adjustmentReviewDate: '2026-01-17' };
  const next = apply(draft(state, 'schedule', { choice, meta: { reviewDate: '2026-01-17' } }));
  assert.equal(next.training.planning.schedule[0].adjustment.reviewDate, '2026-01-17');
  const undo = A.undoAction(next, 'action-a', { now: appliedAt });
  assert.equal(undo.training.planning.schedule[0].date, today); assert.equal(undo.training.planning.schedule[0].adjustment.reviewDate, '2026-01-13');
});

test('undo guards only changed fields and never erases newer unrelated data', () => {
  const state = apply(draft(fixture(), 'burden')), row = state.training.planning.schedule[0];
  row.prescription.exercises[0].restSeconds += 15;
  state.training.memory.focus = '새 메모'; state.days[today].weightKg = 65.3;
  const next = A.undoAction(state, 'action-a', { now: appliedAt }), before = state.training.actions[0].before;
  assert.equal(next.training.planning.schedule[0].prescription.exercises[0].sets, before.prescription.exercises[0].sets);
  assert.equal(next.training.planning.schedule[0].prescription.exercises[0].restSeconds, row.prescription.exercises[0].restSeconds);
  assert.equal(next.training.memory.focus, '새 메모'); assert.equal(next.days[today].weightKg, 65.3);
  assert.equal(next.training.actions[0].status, 'undone'); assert.equal(next.training.followUps[0].status, 'done');
  const conflict = structuredClone(state); conflict.training.planning.schedule[0].prescription.exercises[0].sets += 1;
  assert.throws(() => A.undoAction(conflict, 'action-a', { now: appliedAt }), /덮어쓰지 않고/);
});

test('undo allocation keeps new meals and program changes and rejects own-field conflict', () => {
  const state = apply(draft(fixture(), 'allocation')); state.days[today].weightKg = 65.2; state.training.planning.activeProgramId = 'program-b';
  const next = A.undoAction(state, 'action-a', { now: appliedAt });
  assert.equal(next.days[today].carbAdjustmentG, 0); assert.equal(next.days[today].weightKg, 65.2); assert.equal(next.training.planning.activeProgramId, 'program-b');
  state.days[today].carbAdjustmentG = 30; assert.throws(() => A.undoAction(state, 'action-a', { now: appliedAt }), /같은 항목이 바뀌/);
});

test('later schedule movement retains the original burden date and chosen prescription in review evidence', () => {
  const state = apply(draft(fixture(), 'burden'));
  const moved = apply(draft(state, 'schedule', { id: 'action-move', choice: { date: '2026-01-10', adjustmentReviewDate: '2026-01-13' } }), 'action-move');
  moved.training.planning.schedule[0].prescription.exercises[0].sets = 4;
  const summary = A.summarizeEvidence(moved, 'action-a', '2026-01-13');
  assert.equal(summary.evidence.from, today); assert.equal(summary.detail.chosenDate, today); assert.equal(summary.detail.date, '2026-01-10');
  assert.equal(summary.detail.comparison, 'chosen-prescription');
  const undo = A.undoAction(apply(draft(state, 'schedule', { id: 'action-move', choice: { date: '2026-01-10', adjustmentReviewDate: '2026-01-13' } }), 'action-move'), 'action-move', { now: appliedAt });
  assert.equal(undo.training.planning.schedule[0].date, today);
});

test('a performed assignment moved outside the chosen review period does not leak into its comparison', () => {
  const state = apply(draft(fixture(), 'burden'));
  const moved = apply(draft(state, 'schedule', { id: 'action-move', choice: { date: '2026-01-05', adjustmentReviewDate: '2026-01-13' } }), 'action-move');
  const row = moved.training.planning.schedule[0];
  moved.training.records.push({ id: 'outside-period', date: row.date, time: null, label: '기간 밖 실제 수행', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, exercises: row.prescription.exercises.map(target => ({ id: `actual:${target.id}`, rawName: target.label, exerciseId: target.exerciseId, equipmentKey: target.equipmentKey, loadConvention: target.loadConvention, durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: '', sets: Array.from({ length: target.sets }, (_, index) => ({ id: `actual:${target.id}:${index}`, loadKg: null, reps: target.repsMin, marker: null, rir: target.rir })) })), notes: '', effort: null, pain: null });
  row.recordId = 'outside-period'; row.status = 'performed';
  assert.equal(T.evaluateAssignment(row, moved.training.records).status, 'met');
  const summary = A.summarizeEvidence(moved, 'action-a', '2026-01-13');
  assert.equal(summary.evidence.from, today); assert.deepEqual(summary.evidence.recordIds, []); assert.equal(summary.evidence.performedAssignments, 0);
  assert.equal(summary.detail, null); assert.match(summary.comparisonNotice, /2026-01-05.*범위.*밖/);
});

test('unknown execution and no records yields explicit insufficient evidence, not zero effect', () => {
  const state = apply(draft(fixture(), 'allocation')), before = structuredClone(state);
  const summary = A.summarizeEvidence(state, 'action-a', '2026-01-13');
  assert.equal(summary.evidence.recordIds.length, 0); assert.equal(summary.evidence.dayDates.length, 0); assert.match(summary.message, /미기록은/);
  const review = { id: 'review-a', date: '2026-01-13', execution: 'unknown', outcome: 'insufficient', note: '기록이 없어 아직 판단하지 않음', nextReviewDate: '2026-01-20' };
  const next = A.reviewAction(state, 'action-a', review, { now: '2026-01-13T09:00:00.000Z' });
  assert.deepEqual(state, before); assert.equal(next.training.actions[0].reviews[0].execution, 'unknown');
  assert.equal(next.training.actions[0].reviewDate, '2026-01-20'); assert.equal(next.training.followUps[0].status, 'done'); assert.equal(next.training.followUps[1].status, 'open');
  assert.deepEqual(next.days, state.days); assert.throws(() => A.reviewAction(state, 'action-a', { ...review, outcome: 'maintain' }, { now: appliedAt }), /판단 보류/);
});

test('user-reported execution remains distinct from recorded evidence and change does not auto-prescribe', () => {
  const state = apply(draft(fixture(), 'program'));
  const next = A.reviewAction(state, 'action-a', { id: 'review-a', date: '2026-01-13', execution: 'yes', outcome: 'change', note: '실제로 해보니 일정을 바꾸고 싶음', nextReviewDate: '2026-01-20' }, { now: '2026-01-13T09:00:00.000Z' });
  const review = next.training.actions[0].reviews[0];
  assert.equal(review.execution, 'yes'); assert.deepEqual(review.evidence.recordIds, []);
  assert.deepEqual(next.training.planning, state.training.planning); assert.equal(next.training.actions.length, 1);
});

test('a full 4000-character review remains intact while generated follow-up notes are bounded summaries', () => {
  for (const outcome of ['maintain', 'change', 'insufficient']) {
    const state = apply(draft(fixture(), 'program')), note = '가'.repeat(3991) + '🎯'.repeat(4) + 'x';
    assert.equal(note.length, 4000);
    const next = A.reviewAction(state, 'action-a', { id: 'review-a', date: '2026-01-13', execution: 'yes', outcome, note, nextReviewDate: '2026-01-20' }, { now: '2026-01-13T09:00:00.000Z' });
    assert.equal(next.training.actions[0].reviews[0].note, note);
    const displayed = next.training.followUps.at(-1).note;
    assert.ok(displayed.length <= 4000); assert.ok(displayed.endsWith('...'));
    assert.equal(/[\uD800-\uDBFF]\./.test(displayed), false);
    assert.deepEqual(S.parseBackup(S.exportBackup(next)).state, next);
  }
});

test('new pain/recovery status is checked again before a burden draft applies', () => {
  const state = draft(fixture(), 'burden');
  state.days[today].coachCheckin = { energy: 'low', hunger: null, sleep: 'poor', trainingPlan: null, mealConstraint: null, performance: 'down' };
  assert.throws(() => apply(state), /기준이 달라|맥락|확인/);
  state.profile.healthContext = 'clinical'; assert.throws(() => apply(state), /건강|확인/);
});

test('action backup validates bounded review evidence and roundtrips without screenshots', () => {
  const state = apply(draft(fixture(), 'program'));
  const next = A.reviewAction(state, 'action-a', { id: 'review-a', date: '2026-01-13', execution: 'yes', outcome: 'maintain', note: '합성 확인', nextReviewDate: '2026-01-20' }, { now: '2026-01-13T09:00:00.000Z' });
  assert.deepEqual(S.parseBackup(S.exportBackup(next)).state, next);
  for (const change of [value => { value.training.actions[0].reviews[0].evidence.dayDates.push('2026-02-30'); }, value => { value.training.actions[0].reviews[0].evidence.completedDays = null; }, value => { value.training.actions[0].reviews[0].outcome = 'recovered'; }, value => { value.training.actions[0].reviews[0].execution = false; }, value => { value.training.actions[0].reviews[0].extra = true; }]) {
    const invalid = structuredClone(next); change(invalid); assert.throws(() => S.validateState(invalid));
  }
});

test('UI save failure retains draft, unchanged target and open preview', () => {
  let state = fixture(), dialog = null, closes = 0, saveFails = true;
  const sandbox = { MacroCoachActions: A, MacroInsights: I, MacroNutrition: N, MacroTrainingStore: TS };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/coach-actions-ui.js'), 'utf8'), sandbox);
  const app = { getState: () => state, getDate: () => I.dateKey(), emptyDay: day, escape: String, fmt: String, command: () => '', iconButton: () => '', id: () => 'ui-action', field: () => '', actions: () => '', openDialog: (title, html, callback) => { dialog = { title, html, callback }; }, closeDialog: () => { closes++; }, save: next => { if (saveFails) return false; state = next; return true; } };
  const ui = sandbox.MacroCoachActionsUI.create(app); ui.createDialog('program');
  const form = new Map([['programId', 'program-b'], ['reason', '실제 사용자 선택'], ['reviewDate', I.shiftDate(I.dateKey(), 7)]]);
  dialog.callback(form); assert.equal(state.training.actions.length, 0); assert.equal(closes, 0);
  saveFails = false; dialog.callback(form); assert.equal(state.training.actions[0].status, 'draft'); assert.equal(dialog.title, '선택한 변경 확인');
  saveFails = true; dialog.callback(); assert.equal(state.training.actions[0].status, 'draft'); assert.equal(state.training.planning.activeProgramId, 'program-a'); assert.equal(closes, 0);
  saveFails = false; dialog.callback(); assert.equal(state.training.actions[0].status, 'applied'); assert.equal(closes, 1);
});

test('fresh empty state renders disabled action controls without creating training or saved records', () => {
  const state = S.createEmpty(), before = structuredClone(state);
  const sandbox = { MacroCoachActions: A, MacroInsights: I, MacroNutrition: N, MacroTrainingStore: TS };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/coach-actions-ui.js'), 'utf8'), sandbox);
  const ui = sandbox.MacroCoachActionsUI.create({ getState: () => state, getDate: () => I.dateKey(), emptyDay: day, escape: String, fmt: String, command: (action, label, symbol, extra) => `<button data-action="${action}" ${extra}>${label}</button>`, iconButton: () => '', id: () => 'fresh-action', field: () => '', actions: () => '', openDialog: () => { throw new Error('fresh state cannot open an unsupported prescription'); }, closeDialog: () => {}, save: () => { throw new Error('fresh state must not auto-save'); } });
  assert.equal(ui.renderHTML({ compact: true }), '');
  const html = ui.renderHTML();
  for (const kind of ['program', 'schedule', 'allocation', 'burden']) assert.match(html, new RegExp(`data-action="coach-action-create-${kind}" disabled`));
  assert.throws(() => ui.createDialog('program'), /먼저 프로그램/); assert.throws(() => ui.createDialog('schedule'), /먼저 배치/);
  assert.throws(() => ui.createDialog('allocation'), /기준을 먼저/); assert.throws(() => ui.createDialog('unknown'), /지원하지/);
  assert.deepEqual(state, before); assert.equal(Object.hasOwn(state, 'training'), false);
  assert.throws(() => A.createDraft(state, { kind: 'program', targetId: 'active-program', choice: { programId: 'missing' } }, { id: 'fresh', reason: '합성', reviewDate: '2026-01-13', now: createdAt, today }), /저장한 프로그램/);
  assert.throws(() => A.applyDraft(state, 'missing'), /현재 목록/); assert.deepEqual(state, before);
});

test('browser UMD exposes the same supported pure draft engine', () => {
  const sandbox = vm.createContext({ TextEncoder, URL, input: JSON.stringify(fixture()) });
  for (const name of ['training', 'training-store', 'nutrition', 'storage', 'insights', 'coach-actions']) vm.runInContext(fs.readFileSync(require.resolve(`../src/${name}.js`), 'utf8'), sandbox);
  assert.equal(typeof sandbox.MacroCoachActions.createDraft, 'function');
  const output = vm.runInContext("JSON.stringify(MacroCoachActions.createDraft(JSON.parse(input), { kind: 'program', targetId: 'active-program', choice: { programId: 'program-b' } }, { id: 'action-a', reason: '합성 사용자 선택', reviewDate: '2026-01-13', now: '2026-01-06T09:00:00.000Z', today: '2026-01-06' }))", sandbox);
  assert.deepEqual(JSON.parse(output), draft(fixture(), 'program'));
});
