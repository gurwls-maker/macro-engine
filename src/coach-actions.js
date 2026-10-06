(function(root, factory) {
  'use strict';
  const api = typeof module === 'object' && module.exports
    ? factory(require('./training.js'), require('./training-store.js'), require('./nutrition.js'), require('./storage.js'), require('./insights.js'))
    : factory(root.MacroTraining, root.MacroTrainingStore, root.MacroNutrition, root.MacroStorage, root.MacroInsights);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MacroCoachActions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(T, TS, N, S, I) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const fail = message => { throw new Error(message); };
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  // This detects changed calculation inputs, not ownership or cryptographic authenticity.
  function fingerprint(value) {
    const input = canonical(value); let a = 2166136261, b = 2246822519;
    for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b ^ input.charCodeAt(i), 3266489917); }
    return [a, b].map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const now = options => options?.now || new Date().toISOString();
  function emptyDay(date) {
    return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
  }
  function ensureDate(state, date) {
    if (!S.isValidDate(date)) fail('변경할 날짜를 확인해 주세요.');
    if (state.days[date]?.complete) fail('완료한 날짜의 계획과 목표는 바꾸지 않아요. 다른 날짜를 선택해 주세요.');
  }
  function assignmentFor(state, id) {
    const row = state.training.planning.schedule.find(value => value.id === id);
    if (!row) fail('변경할 배치 계획이 없어졌어요. 현재 계획에서 다시 선택해 주세요.');
    if (row.status !== 'planned' || row.recordId !== null) fail('이미 수행하거나 건너뛴 계획은 바꾸지 않아요. 다음 계획에서 선택해 주세요.');
    ensureDate(state, row.date); return row;
  }
  function allocationValue(plan, deltaG) {
    const adjusted = N.adjustAllocation(plan, deltaG);
    return { carbAdjustmentG: deltaG, carbsG: adjusted.macros.carbs.target, fatG: adjusted.macros.fat.target, proteinG: adjusted.macros.protein.target, kcal: adjusted.energy.targetKcal };
  }
  function proposal(state, kind, targetId, choice, reason, reviewDate, options = {}) {
    const planning = state.training.planning;
    if (!S.isValidDate(reviewDate)) fail('다시 확인할 날짜를 입력해 주세요.');
    const today = options.today || I.dateKey();
    if (reviewDate < today) fail('다음 점검 날짜는 오늘 이후로 선택해 주세요.');
    if (kind === 'program') {
      const selected = planning.programs.find(row => row.id === choice.programId);
      if (!selected || targetId !== 'active-program') fail('저장한 프로그램 중에서 선택해 주세요.');
      return { before: { activeProgramId: planning.activeProgramId }, after: { activeProgramId: selected.id }, basis: fingerprint({ profile: state.profile, selected, current: planning.activeProgramId }) };
    }
    if (kind === 'allocation') {
      ensureDate(state, targetId);
      const day = state.days[targetId] || emptyDay(targetId), profile = N.profileForDay(state.profile, day);
      const plan = N.calculatePlan(profile || {}, day, Object.values(state.days));
      if (plan.status !== 'ready') fail('현재 영양 목표의 기준 확인이 먼저예요. 숫자 배분을 적용하지 않았어요.');
      if (reviewDate < targetId) fail('식사 배분을 사용할 날짜 이후에 다시 확인해 주세요.');
      const before = allocationValue(plan, day.carbAdjustmentG), after = allocationValue(plan, choice.deltaG);
      return { before, after, basis: fingerprint({ profile, energy: plan.energy, macros: plan.macros, context: plan.context, complete: day.complete }) };
    }
    const row = assignmentFor(state, targetId);
    if (kind === 'schedule') {
      ensureDate(state, choice.date);
      if (reviewDate < choice.date) fail('옮긴 운동 날짜 이후에 다시 확인해 주세요.');
      if (planning.schedule.some(item => item.id !== row.id && item.date === choice.date && item.programId === row.programId && item.dayId === row.dayId && item.status !== 'skipped')) fail('그 날짜에 같은 세션이 이미 배치되어 있어요.');
      if (row.adjustment && (!S.isValidDate(choice.adjustmentReviewDate) || choice.adjustmentReviewDate < choice.date)) fail('기존 훈련 조정의 점검 날짜도 옮긴 날짜 이후로 선택해 주세요.');
      if (!row.adjustment && choice.adjustmentReviewDate !== null) fail('없는 훈련 조정의 점검 날짜를 바꾸지 않아요.');
      return { before: { date: row.date, adjustmentReviewDate: row.adjustment?.reviewDate || null }, after: { date: choice.date, adjustmentReviewDate: choice.adjustmentReviewDate }, basis: fingerprint({ row, profile: state.profile }) };
    }
    if (kind !== 'burden') fail('앱이 지원하지 않는 행동 종류예요.');
    if (reviewDate < row.date) fail('예정한 운동 날짜 이후에 다시 확인해 주세요.');
    const recovery = T.analyze(state.training.records, { date: today, profile: state.profile, checkins: state.days, mappings: state.training.mappings }).recovery;
    const adjusted = T.adjustAssignment(row, { ...choice, reason, reviewDate }, { profile: state.profile, recovery, completed: state.days[row.date]?.complete });
    return { before: { date: row.date, prescription: copy(row.prescription), adjustment: copy(row.adjustment) }, after: { date: row.date, prescription: adjusted.prescription, adjustment: adjusted.adjustment }, basis: fingerprint({ row, profile: state.profile, recovery }) };
  }
  function createDraft(rawState, request, meta = {}) {
    const state = S.validateState(rawState);
    if (!request || typeof request !== 'object') fail('선택할 행동을 확인해 주세요.');
    const { kind, targetId, choice } = request, reason = String(meta.reason || '').trim(), reviewDate = meta.reviewDate;
    if (!['program', 'schedule', 'allocation', 'burden'].includes(kind)) fail('앱이 지원하지 않는 행동 종류예요.');
    state.training ||= TS.createEmpty();
    if (!reason) fail('이번 선택의 이유를 남겨 주세요.');
    const result = proposal(state, kind, targetId, choice, reason, reviewDate, meta);
    const action = { id: meta.id, kind, targetId, choice: copy(choice), ...result, reason, reviewDate, status: 'draft', createdAt: now(meta), appliedAt: null, resolvedAt: null, reviews: [] };
    state.training.actions.push(action); return S.validateState(state);
  }
  function actionFor(state, id, status) {
    const action = (state.training?.actions || []).find(row => row.id === id);
    if (!action || status && action.status !== status) fail('행동 상태가 달라졌어요. 현재 목록에서 다시 확인해 주세요.');
    return action;
  }
  function writeValue(state, action, value) {
    if (action.kind === 'program') state.training.planning.activeProgramId = value.activeProgramId;
    else if (action.kind === 'allocation') { state.days[action.targetId] ||= emptyDay(action.targetId); state.days[action.targetId].carbAdjustmentG = value.carbAdjustmentG; }
    else {
      const row = state.training.planning.schedule.find(item => item.id === action.targetId);
      if (action.kind === 'schedule') { row.date = value.date; if (row.adjustment) row.adjustment.reviewDate = value.adjustmentReviewDate; }
      else { row.prescription = copy(value.prescription); row.adjustment = copy(value.adjustment); }
    }
  }
  const followUpId = (action, index = 0) => `${action.id}:followup:${index}`;
  const topicFor = action => action.kind === 'allocation' ? 'nutrition' : 'training';
  function followUpNote(outcome, note) {
    const value = `${{ maintain: '유지', change: '다음 변경 검토', insufficient: '판단 보류' }[outcome] || ''} · ${note}`;
    if (value.length <= 4000) return value;
    let shortened = value.slice(0, 3997);
    if (/[\uD800-\uDBFF]$/.test(shortened)) shortened = shortened.slice(0, -1);
    return `${shortened}...`;
  }
  function applyDraft(rawState, id, options = {}) {
    const state = S.validateState(rawState), action = actionFor(state, id, 'draft');
    const fresh = proposal(state, action.kind, action.targetId, action.choice, action.reason, action.reviewDate, options);
    if (fresh.basis !== action.basis || !same(fresh.before, action.before) || !same(fresh.after, action.after)) fail('미리보기 이후 기준이 달라졌어요. 현재 기록으로 새 초안을 만들고 변경 전후를 다시 확인해 주세요.');
    writeValue(state, action, action.after); action.status = 'applied'; action.appliedAt = now(options);
    const followId = followUpId(action);
    if (state.training.followUps.some(row => row.id === followId)) fail('행동 점검 식별자가 이미 있어요. 새 초안에서 다시 선택해 주세요.');
    state.training.followUps.push({ id: followId, topic: topicFor(action), note: action.reason, reviewDate: action.reviewDate, status: 'open', createdAt: action.appliedAt });
    return S.validateState(state);
  }
  function cancelDraft(rawState, id, options = {}) {
    const state = S.validateState(rawState), action = actionFor(state, id, 'draft');
    action.status = 'cancelled'; action.resolvedAt = now(options); return S.validateState(state);
  }
  function changedBurdenFields(action) {
    const rows = [];
    action.before.prescription.exercises.forEach(before => {
      const after = action.after.prescription.exercises.find(row => row.id === before.id);
      if (!after) fail('조정 전후 운동 연결을 확인할 수 없어요.');
      for (const key of ['sets', 'rir', 'loadKg']) if (before[key] !== after[key]) rows.push({ id: before.id, key, before: before[key], after: after[key] });
    }); return rows;
  }
  function undoAction(rawState, id, options = {}) {
    const state = S.validateState(rawState), action = actionFor(state, id, 'applied');
    const conflict = () => fail('이 행동 이후 같은 항목이 바뀌었어요. 새 기록을 덮어쓰지 않고 복구를 중단했어요.');
    if (action.kind === 'program') {
      if (state.training.planning.activeProgramId !== action.after.activeProgramId || action.before.activeProgramId !== null && !state.training.planning.programs.some(row => row.id === action.before.activeProgramId)) conflict();
      writeValue(state, action, action.before);
    } else if (action.kind === 'allocation') {
      ensureDate(state, action.targetId);
      if (state.days[action.targetId]?.carbAdjustmentG !== action.after.carbAdjustmentG) conflict();
      writeValue(state, action, action.before);
    } else {
      const row = assignmentFor(state, action.targetId);
      if (action.kind === 'schedule') {
        ensureDate(state, action.before.date);
        if (row.date !== action.after.date || (row.adjustment?.reviewDate || null) !== action.after.adjustmentReviewDate) conflict();
        if (state.training.planning.schedule.some(item => item.id !== row.id && item.date === action.before.date && item.programId === row.programId && item.dayId === row.dayId && item.status !== 'skipped')) conflict();
        writeValue(state, action, action.before);
      } else {
        if (!same(row.adjustment, action.after.adjustment)) conflict();
        const fields = changedBurdenFields(action);
        for (const field of fields) {
          const exercise = row.prescription.exercises.find(value => value.id === field.id), original = action.after.prescription.exercises.find(value => value.id === field.id);
          if (!exercise || exercise[field.key] !== field.after || exercise.exerciseId !== original.exerciseId
            || exercise.equipmentKey !== original.equipmentKey || exercise.loadConvention !== original.loadConvention) conflict();
        }
        for (const field of fields) row.prescription.exercises.find(value => value.id === field.id)[field.key] = field.before;
        row.adjustment = copy(action.before.adjustment);
      }
    }
    action.status = 'undone'; action.resolvedAt = now(options);
    state.training.followUps.filter(row => row.id.startsWith(`${action.id}:followup:`) && row.status === 'open').forEach(row => { row.status = 'done'; });
    return S.validateState(state);
  }
  function summarizeEvidence(rawState, rawAction, date = I.dateKey()) {
    const state = S.validateState(rawState), action = typeof rawAction === 'string' ? actionFor(state, rawAction) : rawAction;
    if (!S.isValidDate(date) || !action.appliedAt) fail('적용한 행동의 점검 날짜를 확인해 주세요.');
    const from = action.kind === 'allocation' ? action.targetId : ['schedule', 'burden'].includes(action.kind) ? action.after.date : I.dateKey(new Date(action.appliedAt));
    if (date < from) fail('아직 행동을 살펴볼 날짜가 아니에요. 예정한 날짜 이후에 다시 확인해 주세요.');
    const records = state.training.records.filter(row => row.date >= from && row.date <= date);
    const days = Object.values(state.days).filter(row => row.date >= from && row.date <= date);
    const performed = state.training.planning.schedule.filter(row => row.date >= from && row.date <= date && row.status === 'performed');
    const evidence = { from, to: date, recordIds: records.map(row => row.id), dayDates: days.filter(row => row.meals.length || row.sessions.length || row.complete || row.coachCheckin || row.weightKg !== null || row.bodyFatPct !== null || row.skeletalMuscleKg !== null).map(row => row.date).sort(), performedAssignments: performed.length, completedDays: days.filter(row => row.complete).length };
    let detail = null, comparisonNotice = null;
    if (['schedule', 'burden'].includes(action.kind)) {
      const row = state.training.planning.schedule.find(item => item.id === action.targetId);
      if (row && row.date >= from && row.date <= date) {
        const comparisonRow = action.kind === 'burden' ? { ...row, prescription: action.after.prescription } : row;
        detail = { date: row.date, chosenDate: action.after.date, comparison: action.kind === 'burden' ? 'chosen-prescription' : 'current-prescription', assignmentStatus: row.status, ...T.evaluateAssignment(comparisonRow, state.training.records, state.training.mappings) };
      } else if (row) {
        comparisonNotice = `현재 계획이 ${row.date}로 이동해 이 점검 범위(${from} ~ ${date}) 밖에 있어요. 이 범위에서는 연결한 실제 수행과 훈련 목표를 비교하지 않았습니다.`;
      }
    }
    return { evidence, detail, comparisonNotice, checkins: days.filter(row => row.coachCheckin).map(row => ({ date: row.date, ...copy(row.coachCheckin) })), meals: days.filter(row => row.meals.length).map(row => ({ date: row.date, complete: row.complete, ...I.mealTotals(row.meals) })), message: '미기록은 미실행이나 효과 없음이 아닙니다. 아래 관찰과 실제 경험을 함께 보고 다음 선택을 정해요.' };
  }
  function reviewAction(rawState, id, review, options = {}) {
    const state = S.validateState(rawState), action = actionFor(state, id, 'applied');
    const { evidence } = summarizeEvidence(state, action, review.date);
    if (!evidence.recordIds.length && !evidence.dayDates.length && review.execution === 'unknown' && review.outcome !== 'insufficient') fail('수행 여부와 비교할 기록이 아직 없어요. 판단 보류로 남기거나 실제 경험을 먼저 확인해 주세요.');
    action.reviews.push({ id: review.id, date: review.date, outcome: review.outcome, execution: review.execution, note: String(review.note || '').trim(), nextReviewDate: review.nextReviewDate, createdAt: now(options), evidence });
    const previousFollow = state.training.followUps.find(row => row.id === followUpId(action, action.reviews.length - 1));
    if (previousFollow) previousFollow.status = 'done';
    action.reviewDate = review.nextReviewDate;
    const nextId = followUpId(action, action.reviews.length);
    if (state.training.followUps.some(row => row.id === nextId)) fail('다음 점검 식별자가 이미 있어요. 기존 점검을 확인해 주세요.');
    state.training.followUps.push({ id: nextId, topic: topicFor(action), note: followUpNote(review.outcome, action.reviews.at(-1).note), reviewDate: review.nextReviewDate, status: 'open', createdAt: now(options) });
    return S.validateState(state);
  }
  return Object.freeze({ createDraft, applyDraft, cancelDraft, undoAction, reviewAction, summarizeEvidence, fingerprint });
});
