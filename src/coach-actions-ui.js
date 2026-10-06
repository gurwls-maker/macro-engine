(function(root) {
  'use strict';
  function create(app) {
    const A = root.MacroCoachActions, I = root.MacroInsights, N = root.MacroNutrition, TS = root.MacroTrainingStore;
    const { escape: e, fmt, command, iconButton, id, field, actions, openDialog, closeDialog } = app;
    const names = { program: '프로그램 선택', schedule: '운동 날짜 이동', allocation: '탄수·지방 배분', burden: '훈련 부담 선택' };
    const statuses = { draft: '확인 전 초안', applied: '선택한 행동', cancelled: '취소한 초안', undone: '변경 복구함' };
    const outcomes = { maintain: '유지', change: '다음 변경 검토', insufficient: '판단 보류' };
    const rows = () => app.getState().training?.actions || [];
    const planning = () => app.getState().training?.planning || TS.createEmpty().planning;
    const options = (values, selected) => values.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
    const num = (form, key, fallback = null) => { const value = form.get(key); return value === null || String(value).trim() === '' ? fallback : Number(value); };
    const planned = () => planning().schedule.filter(row => row.status === 'planned' && row.recordId === null && !app.getState().days[row.date]?.complete);
    const buttonData = action => `data-id="${e(action.id)}"`;
    const actionDialog = (title, content, onSubmit) => openDialog(title, `<div class="coach-action-form">${content}</div>`, onSubmit);
    function changeHTML(action) {
      const programName = value => planning().programs.find(row => row.id === value)?.name || value || '선택 없음';
      if (action.kind === 'program') return `<p>${e(programName(action.before.activeProgramId))} → ${e(programName(action.after.activeProgramId))}</p><p class="form-help">저장한 프로그램 선택만 바뀝니다. 이미 배치한 훈련과 실제 일지는 그대로예요.</p>`;
      if (action.kind === 'schedule') return `<p>${action.before.date} → ${action.after.date}</p>${action.before.adjustmentReviewDate ? `<p class="form-help">기존 훈련 조정 점검 ${action.before.adjustmentReviewDate} → ${action.after.adjustmentReviewDate}</p>` : ''}<p class="form-help">계획 날짜만 이동하며 실제 운동 기록을 옮기지 않습니다.</p>`;
      if (action.kind === 'allocation') return `<div class="conflict-comparison"><section><h3>변경 전</h3><p>탄수 ${fmt(action.before.carbsG)}g · 지방 ${fmt(action.before.fatG, 1)}g</p></section><section><h3>선택한 배분</h3><p>탄수 ${fmt(action.after.carbsG)}g · 지방 ${fmt(action.after.fatG, 1)}g</p></section></div><p class="form-help">${action.targetId} · 총열량 ${fmt(action.after.kcal)}kcal와 단백질 ${fmt(action.after.proteinG)}g은 유지됩니다. 앱의 허용 배분 범위 안에서 계산한 선택이며 실제 섭취나 최적 식단이 아닙니다.</p>`;
      return `<p>${action.after.date} · ${e(action.after.prescription.label)}</p><ul class="item-list">${action.before.prescription.exercises.map(before => { const after = action.after.prescription.exercises.find(row => row.id === before.id); return `<li class="item-row"><div class="item-main"><strong>${e(before.label)}</strong><p>${before.sets}세트 · RIR ${fmt(before.rir, 1)}${before.loadKg !== null ? ` · ${fmt(before.loadKg, 1)}kg` : ''} → ${after.sets}세트 · RIR ${fmt(after.rir, 1)}${after.loadKg !== null ? ` · ${fmt(after.loadKg, 1)}kg` : ''}</p></div></li>`; }).join('')}</ul><p class="form-help">사용자가 고른 예정 훈련의 값입니다. 실제 수행·통증 원인·회복 여부를 판정한 결과는 아닙니다.</p>`;
    }
    function itemHTML(action, compact) {
      const data = buttonData(action), latest = action.reviews.at(-1);
      return `<li class="item-row coach-action-row" data-coach-action-id="${e(action.id)}"><div class="item-main"><span class="source-badge">${statuses[action.status]}${action.status === 'applied' ? ` · ${action.reviewDate}${action.reviewDate <= I.dateKey() ? ' 점검' : ' 다시 확인'}` : ''}</span><strong>${names[action.kind]}</strong><p>${e(action.reason)}</p>${latest ? `<small>${latest.date} · ${outcomes[latest.outcome]} · ${e(latest.note)}</small>` : ''}${compact ? '' : `<details class="source-details"><summary>선택한 변경과 점검 이력</summary>${changeHTML(action)}${action.reviews.map(review => `<p class="form-help">${review.date} · ${outcomes[review.outcome]} · 실행 ${{ yes: '했다는 사용자 확인', no: '하지 않았다는 사용자 확인', unknown: '미확인' }[review.execution]} · ${e(review.note)} · 다음 ${review.nextReviewDate}</p>`).join('')}</details>`}</div><div class="item-actions">${action.status === 'draft' ? command('coach-action-preview', '변경 전후 확인', 'arrow-right', data) : action.status === 'applied' ? command('coach-action-review', '실행 결과 점검', 'clipboard-check', data) + (compact ? '' : iconButton('coach-action-undo', '선택 전 값으로 복구', 'undo-2', data)) : ''}</div></li>`;
    }
    function renderHTML({ compact = false } = {}) {
      const active = rows().filter(row => ['draft', 'applied'].includes(row.status));
      const ordered = [...active].sort((a, b) => (a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1) || a.reviewDate.localeCompare(b.reviewDate));
      if (compact && !ordered.length) return '';
      const state = app.getState(), hasPrograms = !!planning().programs.length, hasPlan = !!planned().length;
      const controls = compact ? '' : `<div class="toolbar-actions">${command('coach-action-create-program', '프로그램 선택', 'list-checks', hasPrograms ? '' : 'disabled')}${command('coach-action-create-schedule', '운동 날짜 변경', 'calendar-days', hasPlan ? '' : 'disabled')}${command('coach-action-create-allocation', '탄수·지방 목표 조절', 'utensils', state.profile && !state.days[app.getDate()]?.complete ? '' : 'disabled')}${command('coach-action-create-burden', '예정 운동 조절', 'sliders-horizontal', hasPlan ? '' : 'disabled')}</div>`;
      return `<section ${compact ? '' : 'id="coachActionLoop" tabindex="-1"'} class="coach-action-loop ${compact ? 'coach-action-compact' : ''}" aria-label="선택한 행동과 다음 점검"><div class="section-header"><h${compact ? '3' : '2'}>${compact ? '이어갈 선택' : '선택과 다음 점검'}</h${compact ? '3' : '2'}>${controls}</div>${ordered.length ? `<ul class="item-list">${ordered.slice(0, compact ? 3 : 12).map(row => itemHTML(row, compact)).join('')}</ul>` : '<p class="empty-state">함께 정한 방향이 생기면 실행할 변경과 다시 확인할 날짜를 남겨요.</p>'}${!compact && ordered.length > 12 ? `<details class="source-details"><summary>나머지 선택 ${ordered.length - 12}개</summary><ul class="item-list">${ordered.slice(12).map(row => itemHTML(row, false)).join('')}</ul></details>` : ''}${!compact && rows().some(row => ['cancelled', 'undone'].includes(row.status)) ? `<details class="source-details"><summary>취소·복구한 선택</summary><ul class="item-list">${rows().filter(row => ['cancelled', 'undone'].includes(row.status)).slice(-6).reverse().map(row => itemHTML(row, false)).join('')}</ul></details>` : ''}</section>`;
    }
    function createDialog(kind, preset = {}) {
      if (!names[kind]) throw new Error('앱이 지원하지 않는 행동 종류예요.');
      const state = app.getState(), currentPlanning = planning(), plan = planned(), selected = preset.targetId || plan.find(row => row.date >= app.getDate())?.id || plan[0]?.id;
      let fields = '';
      if (kind === 'program') {
        if (!currentPlanning.programs.length) throw new Error('운동 화면에서 먼저 프로그램을 저장해 주세요.');
        fields = `<label class="field"><span>저장한 프로그램</span><select name="programId">${options(currentPlanning.programs.map(row => [row.id, row.name]), preset.choice?.programId || currentPlanning.activeProgramId)}</select></label>`;
      } else if (kind === 'allocation') {
        const date = preset.targetId || app.getDate(), day = state.days[date] || app.emptyDay(date);
        const base = N.calculatePlan(N.profileForDay(state.profile, day) || {}, day, Object.values(state.days));
        if (day.complete || base.status !== 'ready') throw new Error('완료하지 않은 날짜의 영양 목표 기준을 먼저 확인해 주세요.');
        const bounds = N.adjustAllocation(base, day.carbAdjustmentG || 0).context.allocation;
        fields = `<p>${date} · 총열량과 단백질 유지</p>${field('기본 배분 대비 탄수 조정 g', 'deltaG', preset.choice?.deltaG ?? day.carbAdjustmentG ?? 0, { min: Math.max(-500, Math.ceil(bounds.minCarbDeltaG)), max: Math.min(500, Math.floor(bounds.maxCarbDeltaG)), step: 1, required: true })}<p class="form-help">탄수를 늘리면 지방을 같은 열량만큼 줄이며, 음수는 그 반대입니다. 저장 전에 실제 변경 전후를 확인합니다.</p>`;
      } else {
        if (!plan.length) throw new Error('운동 화면에서 아직 수행하지 않은 계획을 먼저 배치해 주세요.');
        fields = `<label class="field"><span>예정한 운동</span><select name="targetId">${options(plan.map(row => [row.id, `${row.date} · ${row.prescription.label}`]), selected)}</select></label>`;
        if (kind === 'schedule') fields += `<label class="field"><span>옮길 날짜</span><input name="date" type="date" value="${e(preset.choice?.date || app.getDate())}" required></label><label class="field"><span>기존 훈련 조정의 점검 날짜 · 조정한 계획만</span><input name="adjustmentReviewDate" type="date" value="${e(preset.choice?.adjustmentReviewDate || '')}"></label>`;
        else fields += `<label class="field"><span>선택</span><select name="burdenKind">${options([['maintain', '현재 값 유지하고 다시 확인'], ['deload', '훈련 부담 낮추기 · 직접 선택'], ['progression', '다음 중량 · 직접 선택']], preset.choice?.kind || 'maintain')}</select></label><div class="form-grid" data-action-burden="deload">${field('각 운동에서 줄일 세트', 'setReduction', preset.choice?.setReduction ?? '', { min: 0, max: 19, step: 1 })}${field('늘릴 RIR 여유', 'rirIncrease', preset.choice?.rirIncrease ?? '', { min: 0, max: 10 })}</div><div class="form-grid" data-action-burden="progression"><label class="field"><span>운동</span><select name="exerciseId">${options(plan.flatMap(row => row.prescription.exercises.map(exercise => [exercise.id, `${row.date} · ${exercise.label}`])), preset.choice?.exerciseId)}</select></label>${field('확인한 같은 장비의 중량 kg', 'loadKg', preset.choice?.loadKg ?? '', { min: 0, max: 10000 })}</div><p class="form-help">중량 선택에는 같은 장비·중량 기준 확인이 필요합니다. 통증·건강·회복 맥락에서 지원하지 않는 수치 변경은 보류합니다.</p>`;
      }
      actionDialog(names[kind], `${fields}<label class="field"><span>이번 선택의 이유</span><textarea name="reason" maxlength="2000" required>${e(preset.reason || '')}</textarea></label><label class="field"><span>다시 확인할 날짜</span><input name="reviewDate" type="date" min="${I.dateKey()}" value="${e(preset.reviewDate && preset.reviewDate >= I.dateKey() ? preset.reviewDate : I.shiftDate(I.dateKey(), 7))}" required></label>${actions('변경 초안 확인')}`, form => {
        const targetId = kind === 'program' ? 'active-program' : kind === 'allocation' ? preset.targetId || app.getDate() : String(form.get('targetId'));
        const target = planning().schedule.find(row => row.id === targetId);
        const choice = kind === 'program' ? { programId: String(form.get('programId')) } : kind === 'allocation' ? { deltaG: num(form, 'deltaG') } : kind === 'schedule' ? { date: String(form.get('date')), adjustmentReviewDate: target?.adjustment ? String(form.get('adjustmentReviewDate') || form.get('reviewDate')) : null } : { kind: String(form.get('burdenKind')), setReduction: num(form, 'setReduction', 0), rirIncrease: num(form, 'rirIncrease', 0), exerciseId: form.get('exerciseId') ? String(form.get('exerciseId')) : null, loadKg: num(form, 'loadKg') };
        const actionId = id();
        let next = A.createDraft(app.getState(), { kind, targetId, choice }, { id: actionId, reason: String(form.get('reason')), reviewDate: String(form.get('reviewDate')) });
        if (preset.replacesId) next = A.cancelDraft(next, preset.replacesId);
        if (app.save(next, '변경 초안을 저장했어요. 아직 계획이나 목표는 바뀌지 않았습니다.')) previewDialog(actionId);
      });
      if (kind === 'burden') {
        const form = document.getElementById('entryForm');
        const updateKind = () => form.querySelectorAll('[data-action-burden]').forEach(group => {
          const visible = group.dataset.actionBurden === form.elements.burdenKind.value;
          group.hidden = !visible; group.querySelectorAll('input,select').forEach(input => { input.disabled = !visible; });
        });
        const updateExercise = () => {
          const assignment = plan.find(row => row.id === form.elements.targetId.value), selectedId = form.elements.exerciseId.value;
          form.elements.exerciseId.innerHTML = options((assignment?.prescription.exercises || []).map(row => [row.id, row.label]), selectedId);
        };
        form.elements.burdenKind.addEventListener('change', updateKind);
        form.elements.targetId.addEventListener('change', updateExercise);
        updateKind(); updateExercise();
      }
    }
    function previewDialog(actionId) {
      const action = rows().find(row => row.id === actionId);
      if (!action || action.status !== 'draft') throw new Error('현재 확인할 초안이 없어요.');
      actionDialog('선택한 변경 확인', `<h3>${names[action.kind]}</h3>${changeHTML(action)}<p><strong>이유</strong> ${e(action.reason)}</p><p><strong>다시 확인</strong> ${action.reviewDate}</p><label class="checkbox-field"><input type="checkbox" required>변경 전후를 확인했고 이 선택을 적용할게요.</label>${actions('확인한 변경 적용')}<div class="toolbar-actions">${command('coach-action-rebase', '현재 기준으로 다시 비교', 'refresh-cw', buttonData(action))}${command('coach-action-cancel', '초안 취소', 'x', buttonData(action))}</div>`, () => {
        if (app.save(A.applyDraft(app.getState(), actionId), '선택한 변경과 다음 점검을 저장했어요. 실제 수행과 완료한 목표는 유지됩니다.')) closeDialog();
      });
    }
    function reviewDialog(action) {
      const date = I.dateKey(), summary = A.summarizeEvidence(app.getState(), action.id, date), value = summary.evidence;
      const detail = summary.detail, labels = { met: '기록 조건 내 목표 확인', different: '계획과 다른 수행', partial: '일부 세트 기록', unknown: '반복·RIR·장비 일부 미확인', unrecorded: '일지 연결 미확인' };
      const comparison = detail ? `<p>${e(detail.message)}</p>${detail.date !== detail.chosenDate ? `<p class="notice">선택 당시 예정일은 ${detail.chosenDate}, 현재 예정일은 ${detail.date}입니다. 변경된 일정과 실제 일지를 구분해서 살펴봐요.</p>` : ''}${detail.rows.length ? `<details class="source-details" open><summary>${detail.comparison === 'chosen-prescription' ? '선택 당시 훈련 목표' : '현재 배치한 훈련 목표'}와 실제 기록</summary>${detail.rows.map(row => `<p><strong>${e(row.label)}</strong> · 계획 ${row.plannedSets}세트 / 실제 일반 ${row.recordedSets}세트 · ${labels[row.status]}</p>`).join('')}</details>` : ''}` : '';
      const nutrition = summary.meals.length ? `<details class="source-details"><summary>기록한 식사 · 미완료는 일부 기록</summary>${summary.meals.map(row => `<p>${row.date} · ${row.complete ? '완료' : '일부 기록'} · ${fmt(row.kcal)}kcal · 단백질 ${fmt(row.protein)}g · 탄수 ${fmt(row.carbs)}g · 지방 ${fmt(row.fat, 1)}g</p>`).join('')}</details>` : '';
      const checkins = summary.checkins.length ? `<details class="source-details"><summary>기록한 현재 상태</summary>${summary.checkins.map(row => `<p>${row.date} · 수면 ${{ poor: '잘 못 잠', okay: '보통', good: '잘 잠' }[row.sleep] || '미확인'} · 수행 ${{ down: '평소보다 떨어짐', steady: '비슷함', up: '좋아짐' }[row.performance] || '미확인'}</p>`).join('')}</details>` : '';
      const header = `<h3>${names[action.kind]}</h3><p>${e(action.reason)}</p><p class="form-help">${value.from} ~ ${value.to} · 운동 일지 ${value.recordIds.length}개 · 식사·상태 기록 ${value.dayDates.length}일 · 완료 ${value.completedDays}일</p>${summary.comparisonNotice ? `<p class="notice">${e(summary.comparisonNotice)}</p>` : ''}${comparison}${nutrition}${checkins}<p class="form-help">${e(summary.message)}</p>`;
      const choices = `<label class="field"><span>선택한 행동을 실제로 했나요?</span><select name="execution">${options([['unknown', '아직 확인하지 못함'], ['yes', '실제로 했음'], ['no', '하지 않았음']], 'unknown')}</select></label><label class="field"><span>다음 방향</span><select name="outcome">${options(Object.entries(outcomes), 'insufficient')}</select></label>`;
      const notes = `<label class="field"><span>실제 경험과 관찰</span><textarea name="note" maxlength="4000" required></textarea></label><label class="field"><span>다음 점검 날짜</span><input name="nextReviewDate" type="date" min="${date}" value="${I.shiftDate(date, 7)}" required></label><p class="form-help">점검을 저장해도 새로운 처방을 자동 적용하지 않습니다. 바꾸기로 했다면 현재 계획에서 새 변경을 확인해 주세요.</p>`;
      actionDialog('지난 선택 다시 살펴보기', `${header}${choices}${notes}${actions('점검과 다음 방향 저장')}`, form => {
        const next = A.reviewAction(app.getState(), action.id, { id: id(), date, outcome: String(form.get('outcome')), execution: String(form.get('execution')), note: String(form.get('note')), nextReviewDate: String(form.get('nextReviewDate')) });
        if (app.save(next, '관찰한 경험과 다음 점검을 저장했어요.')) closeDialog();
      });
    }
    function handleAction(name, button) {
      if (!name.startsWith('coach-action-')) return false;
      if (name.startsWith('coach-action-create-')) { createDialog(name.slice('coach-action-create-'.length)); return true; }
      const action = rows().find(row => row.id === button.dataset.id);
      if (!action) throw new Error('현재 행동 기록을 찾을 수 없어요.');
      if (name === 'coach-action-preview') previewDialog(action.id);
      else if (name === 'coach-action-rebase') createDialog(action.kind, { targetId: action.targetId, choice: action.choice, reason: action.reason, reviewDate: action.reviewDate, replacesId: action.id });
      else if (name === 'coach-action-cancel') { if (app.save(A.cancelDraft(app.getState(), action.id), '변경하지 않고 초안을 취소했어요.')) closeDialog(); }
      else if (name === 'coach-action-review') reviewDialog(action);
      else if (name === 'coach-action-undo') actionDialog('선택 전 값으로 복구', `<p>${e(action.reason)}</p><p class="form-help">이 행동이 바꾼 항목만 복구합니다. 이후 같은 항목을 수정했거나 운동을 수행·하루를 완료했다면 덮어쓰지 않습니다.</p><label class="checkbox-field"><input type="checkbox" required>이 선택 전 값으로 복구할게요.</label>${actions('변경 복구')}`, () => { if (app.save(A.undoAction(app.getState(), action.id), '선택한 변경만 복구했어요. 실제 기록과 다른 변경은 유지됩니다.')) closeDialog(); });
      else return false;
      return true;
    }
    return Object.freeze({ renderHTML, handleAction, createDialog });
  }
  root.MacroCoachActionsUI = Object.freeze({ create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
