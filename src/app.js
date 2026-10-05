(function () {
  'use strict';
  const N = window.MacroNutrition;
  const S = window.MacroStorage;
  const I = window.MacroInsights;
  const C = window.MacroCoach;
  const loaded = S.load();
  let state = loaded.state;
  let blocked = loaded.storageBlocked === true;
  let selectedDate = I.dateKey();
  let view = state.profile ? 'today' : 'profile';
  let pendingImport = null;
  let toastTimer;
  let dialogReturnFocus;
  let lastMutation = null;
  let coachQuestion = null;
  let onboardingStep = 0;
  let profileInitialized = false;
  let profileDirty = false;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const id = () => window.crypto?.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sportNames = { none: '운동 없음', strength: '근력운동', running: '달리기', cycling: '사이클', swimming: '수영', team: '구기·팀 스포츠', mixed: '복합 운동', walking: '걷기' };
  const goalNames = { lose: '체지방 감량', maintain: '체중 유지', gain: '근육 증가', recomp: '체성분 개선', performance: '운동 수행' };
  const intensityNames = { easy: '가볍게', moderate: '보통', hard: '힘들게' };
  const titles = { today: '오늘의 기록', coach: '앱코치', trends: '기록과 추세', profile: '내 기준', data: '데이터' };
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const command = (action, text, symbol = 'plus', extra = '', primary = false) => `<button type="button" class="button ${primary ? 'button-primary' : 'button-secondary'}" data-action="${action}" ${extra}>${icon(symbol)}<span>${text}</span></button>`;
  const iconButton = (action, name, symbol, extra = '') => `<button type="button" class="icon-button" data-action="${action}" title="${name}" aria-label="${name}" ${extra}>${icon(symbol)}</button>`;
  function emptyDay(date = selectedDate) { return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null }; }
  function day() { return state.days[selectedDate] || emptyDay(); }
  function effectiveProfile(date = selectedDate) {
    if (!state.profile) return null;
    const profile = { ...state.profile };
    const measurement = state.days[date];
    if (measurement?.weightKg != null) profile.weightKg = measurement.weightKg;
    if (measurement?.bodyFatPct != null) {
      profile.bodyFatPct = measurement.bodyFatPct;
      profile.bodyFatDate = measurement.date;
      profile.bodyFatMethod = measurement.bodyFatMethod;
      profile.bodyFatWeightKg = measurement.weightKg;
    }
    return profile;
  }
  function planFor(current = day()) {
    if (current.complete && current.planSnapshot) return current.planSnapshot;
    const profile = effectiveProfile(current.date);
    const plan = N.calculatePlan(profile || {}, current, Object.values(state.days));
    return N.adjustAllocation && plan.status === 'ready' ? N.adjustAllocation(plan, current.carbAdjustmentG || 0) : plan;
  }
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').hidden = false;
    $('toast').className = `toast${error ? ' toast-error' : ''}`;
    $('toast').textContent = message;
    if (error && $('entryDialog').open && $('entryErrors')) {
      $('entryErrors').hidden = false;
      $('entryErrors').textContent = message;
      $('entryErrors').tabIndex = -1;
      $('entryErrors').focus();
    }
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 10000 : 4500);
  }
  function save(next, message, allowReplace = false, mutation = null) {
    if (blocked && !allowReplace) { toast('저장된 원본을 보호하고 있어요. 데이터 화면에서 원본을 내보내거나 검증된 백업을 복원해 주세요.', true); return false; }
    try {
      state = S.save(next);
      lastMutation = mutation;
      if (allowReplace) blocked = false;
      if (message) toast(message);
      render();
      return true;
    } catch (error) { toast(error.message, true); return false; }
  }
  function mutateDay(change, message, mutation = null) {
    const next = clone(state);
    if (!next.days[selectedDate]) next.days[selectedDate] = emptyDay();
    change(next.days[selectedDate]);
    return save(next, message, false, mutation);
  }
  function selectView(next, focus = true) {
    view = titles[next] ? next : 'today';
    document.querySelectorAll('[data-page]').forEach(element => { element.hidden = element.dataset.page !== view; });
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('pageTitle').textContent = titles[view];
    if ($('pageSubtitle')) {
      const frozen = day().complete ? day().planSnapshot : null;
      $('pageSubtitle').textContent = view === 'today' && state.profile
        ? `${goalNames[frozen?.context?.goal || state.profile.goal]} · ${frozen ? '저장 당시 기준' : sportNames[state.profile.sport]}` : '';
    }
    if (view === 'profile') { if (!profileInitialized) populateProfile(); updateProfileStage(); }
    if (view === 'coach') renderCoach();
    if (view === 'trends') drawChart();
    $('headerActions').innerHTML = view !== 'profile' ? iconButton('nav-profile', '내 기준', 'sliders-horizontal') : '';
    $('sidebarContext').innerHTML = state.profile ? `<span>나의 방향</span><strong>${goalNames[state.profile.goal]}</strong><small>${sportNames[state.profile.sport]} · ${state.profile.trainingYears == null ? '경력 미입력' : `${fmt(state.profile.trainingYears, 1)}년`}</small>` : '<span>나의 방향</span><strong>내 몸에서 시작하기</strong><small>목표와 일상을 함께 살펴봐요.</small>';
    if (focus) { $('pageTitle').tabIndex = -1; $('pageTitle').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
    icons();
  }
  function metric(label, value, unit, detail, className = '', progress = null) {
    return `<div class="metric ${className}"><div class="metric-label">${label}</div><div class="metric-value">${fmt(value, unit === 'kg' ? 1 : 0)} <span class="metric-unit">${unit}</span></div><div class="metric-detail">${detail}</div>${progress === null ? '' : `<div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, progress))}%"></div></div>`}</div>`;
  }
  function macroMetric(label, key, plan, totals, className) {
    const target = plan.status === 'ready' ? plan.macros[key].target : null;
    const left = target === null ? null : target - totals[key];
    const detail = target === null ? '개별 목표 미설정' : `목표 ${fmt(target)}g · ${fmt(Math.abs(left))}g ${left >= 0 ? '남음' : '초과'}`;
    return metric(label, totals[key], 'g', detail, className, target ? totals[key] / target * 100 : null);
  }
  function coachFor(current = day()) {
    return C.buildCoach(effectiveProfile(current.date), current, state.days, { lastMutation });
  }
  function coachAction(item, primary = false) {
    if (day().complete && ['meal-add', 'session-add', 'measurement', 'coach-checkin', 'complete'].includes(item?.action)) return command('reopen', '기록을 다시 열어 확인', 'pencil', '', primary);
    return item?.action ? command(item.action, item.actionLabel || '함께 확인하기', { 'meal-add': 'plus', 'session-add': 'dumbbell', measurement: 'scale', 'coach-checkin': 'heart-pulse', 'nav-profile': 'sliders-horizontal', 'nav-trends': 'chart-line', complete: 'check', reopen: 'pencil' }[item.action] || 'arrow-right', '', primary) : '';
  }
  function coachRail(coach) {
    const first = coach.priorities[0];
    return `<aside class="coach-rail" aria-label="오늘의 앱코치"><div class="coach-label">${icon('messages-square')}<strong>앱코치</strong><span>${day().complete ? '하루 돌아보기' : '지금의 방향'}</span></div><h2>${escape(coach.headline)}</h2><p class="coach-summary">${escape(coach.summary)}</p>${first ? `<div class="coach-next ${first.tone === 'attention' ? 'coach-attention' : ''}"><span class="eyebrow">먼저 함께 할 일</span><strong>${escape(first.title)}</strong><p>${escape(first.body)}</p>${coachAction(first, true)}</div>` : ''}<button type="button" class="coach-open" data-action="nav-coach">코치와 더 살펴보기${icon('arrow-up-right')}</button></aside>`;
  }
  function renderCoach() {
    const current = day(), coach = coachFor(current), plan = planFor(current);
    const selected = coach.questions.find(item => item.id === coachQuestion);
    const checkin = current.coachCheckin;
    const labels = { energy: { low: '많이 지침', okay: '보통', good: '좋음' }, hunger: { low: '별로 없음', okay: '보통', high: '많이 배고픔' }, sleep: { poor: '잘 못 잠', okay: '보통', good: '잘 잠' } };
    const first = coach.priorities[0];
    $('coachContent').innerHTML = `<div class="coach-session-meta"><span class="coach-label">${icon('messages-square')}<strong>나의 영양 · 회복 코치</strong></span><span>${selectedDate} · ${current.complete ? '저장 당시 기준' : '기록 중'}</span></div><div class="coaching-grid"><div class="coaching-main"><section class="coach-brief"><span class="eyebrow">지금 함께 살펴볼 것</span><h2>${escape(coach.headline)}</h2><p>${escape(coach.summary)}</p></section>${first ? `<section class="coach-priority ${first.tone === 'attention' ? 'coach-attention' : ''}"><div class="coach-priority-heading"><span class="priority-number">01</span><h3>${escape(first.title)}</h3></div><p>${escape(first.body)}</p>${coachAction(first, true)}</section>` : ''}<section class="coach-checkin"><div class="section-header"><h2>오늘 몸은 어때요?</h2>${!current.complete ? command('coach-checkin', checkin ? '상태 수정' : '컨디션 체크', 'heart-pulse') : ''}</div><div class="checkin-summary">${['energy', 'hunger', 'sleep'].map((key, index) => `<div><span>${['에너지', '허기', '수면'][index]}</span><strong>${labels[key][checkin?.[key]] || '아직 모름'}</strong></div>`).join('')}</div>${!checkin ? '<p class="form-help">기록된 섭취량만으로 허기나 회복 상태를 알 수는 없어요.</p>' : ''}</section><section class="coach-conversation"><div class="section-header"><h2>함께 짚어보기</h2></div><div class="coach-topics" aria-label="코치에게 확인할 주제">${coach.questions.map(item => `<button type="button" data-action="coach-question" data-question="${escape(item.id)}" aria-pressed="${item.id === coachQuestion}">${escape(item.label)}${icon('arrow-up-right')}</button>`).join('')}</div>${selected ? `<div id="coachAnswer" class="coach-answer" role="region" tabindex="-1" aria-label="${escape(selected.label)}"><span class="eyebrow">지금 기록을 기준으로</span><h3>${escape(selected.label)}</h3><p>${escape(selected.answer)}</p>${coachAction(selected)}</div>` : ''}</section>${coach.priorities.length > 1 ? `<section class="coach-supporting"><h2>그다음에 볼 것</h2>${coach.priorities.slice(1).map(item => `<details><summary>${escape(item.title)}</summary><p>${escape(item.body)}</p>${coachAction(item)}</details>`).join('')}</section>` : ''}</div><aside class="coach-context"><span class="eyebrow">코치가 보고 있는 맥락</span><h2>내 기록에서 시작해요</h2><dl><div><dt>목표</dt><dd>${goalNames[plan.context?.goal || state.profile?.goal] || '아직 모름'}</dd></div><div><dt>운동</dt><dd>${current.sessions.length ? current.sessions.map(item => `${sportNames[item.sport]} ${fmt(item.durationMin)}분`).join(' · ') : '오늘 입력한 운동 없음'}</dd></div><div><dt>식사</dt><dd>${current.meals.length}개 · ${fmt(I.mealTotals(current.meals).kcal)}kcal</dd></div><div><dt>하루 상태</dt><dd>${current.complete ? '완료 · 저장 당시 목표' : '진행 중 · 하루 평가 전'}</dd></div></dl><p class="form-help">코치는 입력한 정보와 기록을 해석해요. 통증·질환의 진단, 운동 자세 평가, 음식의 질과 미량영양소는 이 기록만으로 판단할 수 없어요.</p>${command('nav-trends', '최근 변화 함께 보기', 'chart-line')}${command('nav-profile', '내 기준 살펴보기', 'sliders-horizontal')}</aside></div>`;
  }
  function energyOverview(plan, totals, frozen) {
    const target = plan.status === 'ready' ? plan.energy.targetKcal : null;
    const ratio = target ? Math.max(0, Math.min(1, totals.kcal / target)) : 0;
    const left = target === null ? null : target - totals.kcal;
    return `<section class="nutrition-overview"><div class="section-header"><div><span class="eyebrow">${frozen ? '저장 당시의 기준' : '오늘의 섭취'}</span><h2>오늘의 균형</h2></div><span class="muted">${target === null ? '개별 목표 미설정' : '추정 시작점'}</span></div><div class="nutrition-grid"><div class="energy-summary"><div class="energy-dial"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="dial-track" cx="80" cy="80" r="70"/><circle class="dial-progress" cx="80" cy="80" r="70" stroke-dasharray="439.823" stroke-dashoffset="${439.823 * (1 - ratio)}"/></svg><div><strong>${fmt(totals.kcal)}</strong><span>섭취 kcal</span></div></div><div class="energy-caption"><strong>${left === null ? '기록하는 하루' : `${fmt(Math.abs(left))}kcal ${left >= 0 ? '남음' : '초과'}`}</strong><span>${target === null ? '먹은 양을 함께 살펴봐요' : `시작 목표 ${fmt(target)}kcal`}</span></div></div><div class="macro-rows">${[['protein', '단백질', 'P'], ['carbs', '탄수화물', 'C'], ['fat', '지방', 'F']].map(([key, label, initial]) => { const macro = plan.status === 'ready' ? plan.macros[key] : null; return `<div class="macro-row macro-${key}"><div class="macro-row-top"><span><i>${initial}</i>${label}</span><strong>${fmt(totals[key], 1)} <small>/ ${macro ? fmt(macro.target) : '—'}g</small></strong></div><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${macro ? Math.min(100, totals[key] / macro.target * 100) : 0}%"></div></div><span class="macro-range">${macro ? `계획 범위 ${fmt(macro.min)}–${fmt(macro.max)}g` : '목표 미설정'}</span></div>`; }).join('')}</div></div></section>`;
  }
  function renderToday() {
    const current = day(), plan = planFor(current), totals = I.mealTotals(current.meals), ready = plan.status === 'ready', frozen = current.complete;
    const recent = frozen ? [] : previousMeals();
    const basePlan = ready && !frozen ? N.calculatePlan(effectiveProfile(), current, []) : plan;
    const minimum = ready ? Math.ceil(Math.max(basePlan.macros.carbs.min - basePlan.macros.carbs.target, (basePlan.macros.fat.target - basePlan.macros.fat.max) * 9 / 4)) : 0;
    const maximum = ready ? Math.floor(Math.min(basePlan.macros.carbs.max - basePlan.macros.carbs.target, (basePlan.macros.fat.target - basePlan.macros.fat.min) * 9 / 4)) : 0;
    $('todayContent').innerHTML = `<div class="daily-toolbar"><div class="date-control">${iconButton('previous-day', '이전 날짜', 'chevron-left', selectedDate <= '1900-01-01' ? 'disabled' : '')}<label class="sr-only" for="dayDate">기록 날짜</label><input id="dayDate" type="date" min="1900-01-01" max="${I.dateKey()}" value="${selectedDate}">${iconButton('next-day', '다음 날짜', 'chevron-right', selectedDate >= I.dateKey() ? 'disabled' : '')}</div><span class="day-status">${icon(frozen ? 'circle-check' : 'circle-dashed')}${frozen ? '하루 기록 완료' : '기록 중'}</span></div><div class="today-grid"><div class="today-main">${state.profile && !ready ? `<div class="notice notice-warning"><strong>개별 영양 계획이 필요한 상태예요.</strong><p>${(plan.reasons || []).map(escape).join(' ')}</p><p>자동 목표 없이 식사와 몸 상태를 기록할 수 있어요.</p></div>` : ''}${energyOverview(plan, totals, frozen)}<section class="section meal-section"><div class="section-header"><div><span class="eyebrow">FOOD LOG</span><h2>식사 기록 <small>${current.meals.length}</small></h2></div>${command(frozen ? 'reopen' : 'meal-add', frozen ? '기록 수정' : '식사 추가', frozen ? 'pencil' : 'plus', '', true)}</div>${current.meals.length ? `<ul class="item-list">${current.meals.map((meal, index) => `<li class="item-row"><span class="entry-index">${String(index + 1).padStart(2, '0')}</span><div class="item-main"><strong>${escape(meal.name)}</strong><div class="secondary-text"><b>${fmt(I.mealTotals([meal]).kcal)}kcal</b><span>단 ${fmt(meal.protein, 1)} · 탄 ${fmt(meal.carbs, 1)} · 지 ${fmt(meal.fat, 1)}g${meal.alcoholG ? ` · 알코올 ${fmt(meal.alcoholG, 1)}g` : ''}</span></div></div>${frozen ? '' : `<div class="item-actions">${iconButton('meal-edit', `${escape(meal.name)} 수정`, 'pencil', `data-id="${escape(meal.id)}"`)}${iconButton('meal-copy', `${escape(meal.name)} 한 번 더 추가`, 'copy', `data-id="${escape(meal.id)}"`)}${iconButton('meal-delete', `${escape(meal.name)} 삭제`, 'trash-2', `data-id="${escape(meal.id)}"`)}</div>`}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('utensils')}<div><strong>오늘의 첫 식사를 남겨볼까요?</strong><p>먹은 양을 알면 다음 식사를 함께 계획할 수 있어요.</p></div></div>`}${recent.length ? `<div class="recent-meals"><span class="muted">최근 식사</span>${recent.map(meal => `<button class="text-button" type="button" data-action="meal-reuse" data-id="${escape(meal.id)}">${icon('plus')}${escape(meal.name)}</button>`).join('')}</div>` : ''}${!frozen && current.meals.length ? `<div class="day-completion"><p>오늘 먹은 식사를 모두 기록했나요?</p>${command('complete', '하루 기록 완료', 'check')}</div>` : ''}</section><section class="section movement-section"><div class="section-header"><div><span class="eyebrow">MOVEMENT & BODY</span><h2>운동과 몸 상태</h2></div>${!frozen ? command('session-add', '운동 추가', 'plus') : ''}</div>${current.sessions.length ? `<ul class="item-list">${current.sessions.map(session => `<li class="item-row"><span class="entry-symbol">${icon(session.sport === 'strength' ? 'dumbbell' : 'activity')}</span><div class="item-main"><strong>${sportNames[session.sport] || escape(session.sport)}</strong><div class="secondary-text">${fmt(session.durationMin)}분 · ${intensityNames[session.intensity]}</div></div>${frozen ? '' : `<div class="item-actions">${iconButton('session-edit', '운동 수정', 'pencil', `data-id="${escape(session.id)}"`)}${iconButton('session-delete', '운동 삭제', 'trash-2', `data-id="${escape(session.id)}"`)}</div>`}</li>`).join('')}</ul>` : '<p class="muted movement-empty">아직 입력한 운동이 없어요. 운동했다면 함께 남겨주세요.</p>'}<div class="body-summary"><div><span>체중</span><strong>${fmt(current.weightKg, 1)}<small> kg</small></strong></div><div><span>체지방률</span><strong>${fmt(current.bodyFatPct, 1)}<small> %</small></strong></div><div><span>골격근량</span><strong>${fmt(current.skeletalMuscleKg, 1)}<small> kg</small></strong></div>${!frozen ? iconButton('measurement', '몸 상태 기록', 'scale') : ''}</div></section>${ready ? `<section class="section target-section"><details class="target-details"><summary><span>${icon('sliders-horizontal')}목표와 배분 살펴보기</span><span>${fmt(plan.energy.targetKcal)}kcal</span></summary><div class="facts-grid"><div><span>안정시대사 추정</span><strong>${fmt(plan.energy.restingKcal)}kcal</strong></div><div><span>오늘 운동 추가 소모</span><strong>${fmt(plan.energy.exerciseKcal)}kcal</strong></div><div><span>총소모 추정</span><strong>${fmt(plan.energy.tdeeKcal)}kcal</strong></div><div><span>섭취 시작 목표</span><strong>${fmt(plan.energy.targetKcal)}kcal</strong></div></div><p class="form-help">${escape(plan.energy.method)}. 실제 필요량은 추세와 회복 상태로 함께 확인해요.</p>${!frozen && maximum - minimum > 1 ? `<div class="allocation-control"><label for="allocation"><strong>탄수화물·지방 배분</strong></label><div class="allocation-labels"><span>지방 쪽으로</span><span>탄수화물 쪽으로</span></div><input id="allocation" type="range" min="${minimum}" max="${maximum}" step="1" value="${Math.max(minimum, Math.min(maximum, current.carbAdjustmentG || 0))}" aria-describedby="allocationNote"><p id="allocationNote" class="form-help">단백질과 총열량은 유지해요. 탄수 25g ↔ 지방 약 11g.</p>${command('allocation-reset', '기본 배분', 'rotate-ccw')}</div>` : ''}<details class="source-details"><summary>계산 근거와 적용 범위</summary><p class="form-help">측정값이나 진단이 아닌 시작 추정이에요. 식품의 질·알레르기·질환별 식이 처방은 따로 판단해야 해요.</p><ul>${(plan.sources || []).filter(source => /^https:\/\//.test(source.url)).map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a></li>`).join('')}</ul></details></details></section>` : ''}</div>${coachRail(coachFor(current))}</div>`;
  }
  function previousMeals() {
    const names = new Set(), result = [];
    const dates = Object.keys(state.days).filter(date => date < selectedDate).sort().reverse();
    for (const date of dates) for (const meal of state.days[date].meals) {
      if (names.has(meal.name)) continue;
      names.add(meal.name); result.push(meal);
      if (result.length === 4) return result;
    }
    return result;
  }
  function renderTrends() {
    const summary = I.historySummary(state.days, I.dateKey(), state.profile?.goal);
    const dates = Object.values(state.days).sort((a, b) => b.date.localeCompare(a.date));
    $('trendsContent').innerHTML = `<section class="section"><div class="section-header"><div><div class="section-kicker">최근 28일</div><h2>하루 숫자보다 꾸준한 변화</h2></div><span class="badge">체중 ${summary.weights.length}회</span></div><div class="metrics-grid">${metric('최근 주간 체중 중앙값', summary.laterWeight, 'kg', '최근 7일의 측정값', 'metric-energy')}${metric('이전 주간 체중 중앙값', summary.earlierWeight, 'kg', '그 이전 7일의 측정값')}${metric('식사 기록 완료', summary.completed.length, '일', '현재 목표와 같은 기준')}${metric('완료 기록 평균 섭취', summary.averageKcal, 'kcal', '완료한 날만 계산')}</div><div class="chart-wrap"><canvas id="weightChart" role="img" aria-label="최근 28일 체중 추세. 각 측정값은 아래 날짜별 기록에서 확인할 수 있습니다."></canvas></div><p class="notice notice-info">${escape(summary.trendMessage)}</p></section><section class="section"><div class="section-header"><h2>날짜별 기록</h2><span class="muted">${dates.length}일</span></div>${dates.length ? `<div class="table-wrap"><table class="data-table history-table"><thead><tr><th scope="col">날짜</th><th scope="col">상태</th><th scope="col">체중</th><th scope="col">체지방 / 골격근</th><th scope="col">섭취 / 목표</th><th scope="col"><span class="sr-only">열기</span></th></tr></thead><tbody>${dates.map(item => `<tr><th scope="row"><button type="button" class="date-link" data-action="open-day" data-date="${item.date}" aria-label="${item.date} 기록 열기">${escape(item.date)}</button></th><td>${item.complete ? '완료' : '기록 중'}</td><td>${fmt(item.weightKg, 1)}kg</td><td>${fmt(item.bodyFatPct, 1)}% / ${fmt(item.skeletalMuscleKg, 1)}kg</td><td>${fmt(I.mealTotals(item.meals).kcal)} / ${fmt(item.planSnapshot?.energy?.targetKcal)}kcal</td><td>${iconButton('open-day', `${item.date} 기록 열기`, 'arrow-up-right', `data-date="${item.date}"`)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('chart-no-axes-combined')}<p>기록이 쌓이면 이곳에서 함께 볼 수 있어요.</p>${command('go-today', '오늘 기록하기', 'arrow-right')}</div>`}</section>`;
  }
  function drawChart() {
    const canvas = $('weightChart');
    if (!canvas || view !== 'trends') return;
    const data = I.historySummary(state.days, I.dateKey(), state.profile?.goal).weights;
    const width = Math.max(240, canvas.parentElement.clientWidth);
    const height = 230;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = '100%'; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.font = '12px "Malgun Gothic", sans-serif';
    if (!data.length) { ctx.fillStyle = '#62716e'; ctx.textAlign = 'center'; ctx.fillText('체중을 기록하면 변화가 보여요', width / 2, height / 2); return; }
    const values = data.map(item => item.weightKg);
    const minimum = Math.floor(Math.min(...values) - 0.5), maximum = Math.ceil(Math.max(...values) + 0.5);
    const left = 48, right = width - 16, top = 20, bottom = height - 35;
    const start = Date.parse(I.shiftDate(I.dateKey(), -27) + 'T12:00:00Z');
    const x = item => left + (Date.parse(item.date + 'T12:00:00Z') - start) / (27 * 86400000) * (right - left);
    const y = item => bottom - (item.weightKg - minimum) / (maximum - minimum) * (bottom - top);
    for (let step = 0; step <= 3; step++) {
      const pos = top + (bottom - top) * step / 3;
      ctx.strokeStyle = '#e3e9e6'; ctx.beginPath(); ctx.moveTo(left, pos); ctx.lineTo(right, pos); ctx.stroke();
      ctx.fillStyle = '#62716e'; ctx.textAlign = 'right'; ctx.fillText((maximum - (maximum - minimum) * step / 3).toFixed(1), left - 8, pos + 4);
    }
    ctx.strokeStyle = '#146857'; ctx.lineWidth = 2.5; ctx.beginPath();
    data.forEach((item, index) => index ? ctx.lineTo(x(item), y(item)) : ctx.moveTo(x(item), y(item))); ctx.stroke();
    data.forEach(item => { ctx.beginPath(); ctx.arc(x(item), y(item), 4, 0, Math.PI * 2); ctx.fillStyle = '#146857'; ctx.fill(); });
    ctx.fillStyle = '#62716e'; ctx.textAlign = 'left'; ctx.fillText(I.shiftDate(I.dateKey(), -27).slice(5).replace('-', '/'), left, height - 8);
    ctx.textAlign = 'right'; ctx.fillText(I.dateKey().slice(5).replace('-', '/'), right, height - 8);
  }
  function renderData() {
    const legacy = state.legacy;
    $('dataContent').innerHTML = `${blocked ? `<div class="notice notice-danger"><strong>기존 데이터 보호 중</strong><p>${loaded.warnings.map(escape).join(' ')}</p>${loaded.corruptedRaw ? command('corrupt-export', '보존된 원본 내보내기', 'download') : ''}</div>` : ''}<section class="section"><div class="section-header"><h2>내 기기에 저장된 기록</h2><span class="badge">로컬 저장</span></div><p class="muted">이 브라우저에만 저장돼요. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에는 전체 백업을 내려받아 주세요.</p><div class="facts-grid"><div><span class="muted">기록한 날짜</span><strong>${Object.keys(state.days).length}일</strong></div><div><span class="muted">마지막 저장</span><strong>${Object.keys(state.days).length || state.profile ? escape(new Date(state.updatedAt).toLocaleString('ko-KR')) : '아직 없음'}</strong></div></div><div class="form-actions">${command('export', '전체 백업', 'download', blocked ? 'disabled' : '', true)}${command('import-select', '백업 불러오기', 'upload')}${command('csv-export', '기록 CSV', 'file-down', !Object.keys(state.days).length ? 'disabled' : '')}</div><input id="backupFile" type="file" accept="application/json,.json" hidden><div id="importPreview"></div></section>${loaded.legacyAvailable && !legacy ? `<section class="section"><div class="section-header"><h2>이전 버전의 기록을 찾았어요</h2></div><p class="muted">원본을 보관함에 복사해 읽을 수 있어요. 기존 값과 저장 당시 점수는 새 기준으로 다시 계산하지 않아요.</p><div class="form-actions">${command('legacy-preview', '이전 기록 확인', 'archive')}</div></section>` : ''}${legacy ? `<section class="section"><div class="section-header"><h2>이전 기록 보관함</h2>${command('legacy-export', '이전 원본 내보내기', 'download')}</div><p class="form-help">${legacy.records.length}건 · 읽기 전용 · 저장 당시 값이에요. 이전 설정·운동 초안·체성분 원본도 전체 백업에 보존돼요.</p>${legacy.records.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>날짜</th><th>체중</th><th>섭취</th><th>당시 점수</th></tr></thead><tbody>${legacy.records.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map(item => `<tr><th>${escape(item.date)}</th><td>${fmt(item.weightKg, 1)}kg</td><td>${fmt(item.intake?.kcal)}kcal</td><td>${fmt(item.score)}</td></tr>`).join('')}</tbody></table></div>` : ''}${legacy.records.length > 100 ? '<p class="form-help">최근 100건을 표시해요. 전체 기록은 백업에 포함돼요.</p>' : ''}</section>` : ''}<section class="section"><div class="section-header"><h2>기록 초기화</h2></div><p class="muted">이 버전의 프로필과 기록을 지워요. 이전 버전의 브라우저 원본에는 영향을 주지 않아요.</p><div class="form-actions">${command('reset', '이 버전 초기화', 'trash-2')}</div></section>`;
    if (pendingImport) showImportPreview();
  }
  function render() {
    renderToday(); renderTrends(); renderData();
    if (blocked) {
      let banner = $('storageWarning');
      if (!banner) { banner = document.createElement('div'); banner.id = 'storageWarning'; banner.className = 'notice notice-danger'; banner.setAttribute('role', 'alert'); $('pageTitle').parentElement.after(banner); }
      banner.textContent = '저장소를 읽지 못해 원본을 보호하고 있어요. 데이터 화면에서 복구해 주세요.';
    } else $('storageWarning')?.remove();
    selectView(view, false); icons();
  }
  function populateProfile() {
    const form = $('profileForm');
    form.reset();
    if (state.profile) Object.entries(state.profile).forEach(([key, value]) => { if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? ''; });
    if (form.elements.bodyFatDate) form.elements.bodyFatDate.max = I.dateKey();
    profileInitialized = true;
    profileDirty = false;
    updateProfileStage();
  }
  function updateProfileStage() {
    const onboarding = !state.profile;
    $('profileSteps').hidden = !onboarding;
    document.querySelectorAll('[data-profile-step]').forEach(section => { section.hidden = onboarding && Number(section.dataset.profileStep) !== onboardingStep; });
    $('profileBack').hidden = !onboarding || onboardingStep === 0;
    $('profileNext').hidden = !onboarding || onboardingStep === 2;
    $('profileSubmit').hidden = onboarding && onboardingStep !== 2;
    document.querySelectorAll('[data-action="profile-step"]').forEach(button => {
      button.disabled = Number(button.dataset.step) > onboardingStep + 1;
      if (Number(button.dataset.step) === onboardingStep) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    $('profileIntro').textContent = onboarding ? ['먼저 내 몸을 알려주세요. 모르는 체성분은 나중에 살펴봐도 괜찮아요.', '운동과 일상, 그리고 가장 중요한 목표를 함께 정해요.', '측정한 체성분이 있다면 더해주세요. 없어도 시작할 수 있어요.'][onboardingStep] : '몸, 일상, 목표. 코치가 함께 살펴볼 출발점이에요.';
    $('profileSaveNote').textContent = onboarding ? `${onboardingStep + 1} / 3 단계${onboardingStep === 2 ? ' · 체성분은 선택 사항이에요.' : ''}` : profileDirty ? '아직 저장하지 않은 변경이 있어요.' : '완료한 과거 기록의 목표는 바뀌지 않아요.';
    renderProfileSummary();
  }
  function moveProfileStep(next) {
    if (next > onboardingStep) {
      const inputs = $('profileForm').querySelectorAll(`fieldset[data-profile-step="${onboardingStep}"] [required]`);
      for (const input of inputs) if (!input.checkValidity()) { input.reportValidity(); return; }
    }
    onboardingStep = Math.max(0, Math.min(2, next)); updateProfileStage();
    $('profileSteps').scrollIntoView({ block: 'start' });
    $('profileForm').querySelector('fieldset:not([hidden]) input, fieldset:not([hidden]) select')?.focus({ preventScroll: true });
  }
  function renderProfileSummary() {
    const form = new FormData($('profileForm')), goal = goalNames[form.get('goal')], sport = sportNames[form.get('sport')];
    const profile = Object.fromEntries(form);
    for (const key of ['age', 'heightCm', 'weightKg', 'trainingYears', 'bodyFatPct', 'bodyFatWeightKg']) profile[key] = form.get(key) === '' ? null : Number(form.get(key));
    profile.bodyFatDate = form.get('bodyFatDate') || null;
    const plan = N.calculatePlan(profile, { date: I.dateKey(), sessions: [] }, []);
    $('profileSummary').innerHTML = `<span class="eyebrow">MY STARTING POINT</span><h2>${goal || '내 몸에 맞는 출발점'}</h2><dl><div><dt>현재 체중</dt><dd>${profile.weightKg == null ? '아직 모름' : `${fmt(profile.weightKg, 1)}kg`}</dd></div><div><dt>주로 하는 운동</dt><dd>${sport || '아직 모름'}</dd></div><div><dt>운동 경력</dt><dd>${profile.trainingYears == null ? '아직 모름' : `${fmt(profile.trainingYears, 1)}년`}</dd></div></dl>${plan.status === 'ready' ? `<div class="profile-estimate"><span>휴식일 섭취 시작 목표</span><strong>${fmt(plan.energy.targetKcal)}<small> kcal</small></strong><p>운동한 날은 실제 세션을 따로 반영해요.</p></div>` : '<div class="profile-estimate"><span>먼저 알아야 할 것</span><p>체중뿐 아니라 일상 활동과 운동, 목표를 함께 봐요. 정보가 모이면 시작 목표를 살펴볼 수 있어요.</p></div>'}<p class="form-help">모르는 값은 추측해 넣지 않아도 돼요. 숫자는 시작점이고, 이후 몸의 변화와 컨디션으로 함께 확인해요.</p>`;
  }
  function checkinDialog() {
    const value = day().coachCheckin || {};
    const choices = { energy: [['low', '많이 지침'], ['okay', '보통'], ['good', '좋음']], hunger: [['low', '별로 없음'], ['okay', '보통'], ['high', '많이 배고픔']], sleep: [['poor', '잘 못 잠'], ['okay', '보통'], ['good', '잘 잠']] };
    const selects = { trainingPlan: [['rest', '오늘은 쉬기로 했어요'], ['planned', '아직 할 운동이 있어요']], mealConstraint: [['none', '특별한 어려움 없음'], ['busy', '바빠서 챙겨 먹기 어려움'], ['low-appetite', '입맛이 없어 먹기 어려움'], ['digestive', '속이 불편해서 먹기 어려움']], performance: [['down', '평소보다 떨어짐'], ['steady', '평소와 비슷함'], ['up', '평소보다 좋아짐']] };
    openDialog('오늘 몸은 어때요?', `<p class="form-help">지금 느끼는 상태를 알려주세요. 모르는 항목은 비워두셔도 돼요.</p><div class="checkin-fields">${Object.entries(choices).map(([key, options], index) => `<fieldset><legend>${['에너지와 피로', '허기', '지난밤 수면'][index]}</legend><div class="checkin-options">${[['', '아직 모름'], ...options].map(([id, label]) => `<label><input type="radio" name="${key}" value="${id}" ${(!value[key] && !id) || value[key] === id ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset>`).join('')}</div><details class="checkin-more"><summary>오늘의 계획과 식사 여건도 알려주기</summary><div class="form-grid">${Object.entries(selects).map(([key, options], index) => `<label class="field ${index === 1 ? 'full-width' : ''}"><span>${['앞으로 할 운동', '식사를 챙기는 여건', '최근 운동 수행'][index]}</span><select name="${key}"><option value="">아직 모름</option>${options.map(([id, label]) => `<option value="${id}" ${value[key] === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}</div></details>${actions('코치에게 알려주기')}`, form => {
      const checkin = Object.fromEntries(['energy', 'hunger', 'sleep', 'trainingPlan', 'mealConstraint', 'performance'].map(key => [key, form.get(key) || null]));
      if (!Object.values(checkin).some(Boolean)) throw new Error('오늘 느끼는 상태나 여건을 한 가지 이상 알려주세요.');
      if (mutateDay(current => { current.coachCheckin = checkin; }, '오늘 상태를 저장하고 코칭에 반영했어요.')) closeDialog();
    });
  }
  function field(label, name, value = '', options = {}) {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${options.type || 'number'}" ${options.type === 'text' ? 'maxlength="200"' : `min="${options.min ?? 0}" max="${options.max ?? 1000}" step="${options.step ?? 0.1}" inputmode="decimal"`} value="${escape(value)}" ${options.required ? 'required' : ''}></label>`;
  }
  function openDialog(title, content, onSubmit) {
    dialogReturnFocus = document.activeElement;
    $('dialogContent').innerHTML = `<div class="dialog-header"><h2 id="dialogTitle">${title}</h2>${iconButton('dialog-close', '닫기', 'x')}</div><form id="entryForm">${content}<div id="entryErrors" class="notice notice-danger" role="alert" hidden></div></form>`;
    $('entryDialog').setAttribute('aria-labelledby', 'dialogTitle');
    $('entryForm').addEventListener('submit', event => {
      event.preventDefault();
      try { onSubmit(new FormData(event.target)); }
      catch (error) { $('entryErrors').hidden = false; $('entryErrors').textContent = error.message; $('entryErrors').tabIndex = -1; $('entryErrors').focus(); }
    });
    icons(); $('entryDialog').showModal();
    const first = $('entryForm').querySelector('input,select,button'); if (first) first.focus();
  }
  function closeDialog() { $('entryDialog').close(); if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); else $('pageTitle').focus(); }
  function actions(label = '저장') { return `<div class="form-actions"><button class="button button-primary" type="submit">${icon('check')}<span>${label}</span></button>${command('dialog-close', '취소', 'x')}</div>`; }
  function readNumber(form, name, nullable = false) {
    const raw = String(form.get(name) ?? '').trim();
    if (!raw) { if (nullable) return null; throw new Error('빈 숫자 항목을 확인해 주세요.'); }
    const value = Number(raw); if (!Number.isFinite(value)) throw new Error('유효한 숫자를 입력해 주세요.'); return value;
  }
  function mealDialog(existing = null, copy = false) {
    const meal = existing || { name: '', protein: 0, carbs: 0, fat: 0, otherKcal: 0, alcoholG: 0 };
    openDialog(copy ? '최근 식사 가져오기' : existing ? '식사 수정' : '식사 추가', `<div class="form-grid">${field('식사 이름', 'name', meal.name, { type: 'text', required: true })}${field('단백질 (g)', 'protein', meal.protein, { required: true })}${field('탄수화물 (g)', 'carbs', meal.carbs, { required: true })}${field('지방 (g)', 'fat', meal.fat, { required: true })}</div><details class="source-details"><summary>기타 열량·술</summary><div class="form-grid">${field('탄단지·알코올 외 열량 (kcal)', 'otherKcal', meal.otherKcal, { max: 10000, required: true })}${field('순알코올 (g)', 'alcoholG', meal.alcoholG, { max: 500, required: true })}</div><p class="form-help">알코올은 1g당 7kcal로 별도 합산해요. 술의 탄수화물과 안주는 각 영양소에 기록해 주세요.</p></details><p id="mealPreview" class="notice notice-info"></p>${actions()}`, form => {
      const entry = { id: existing && !copy ? existing.id : id(), name: String(form.get('name')).trim(), protein: readNumber(form, 'protein'), carbs: readNumber(form, 'carbs'), fat: readNumber(form, 'fat'), otherKcal: readNumber(form, 'otherKcal'), alcoholG: readNumber(form, 'alcoholG') };
      if (!entry.name || I.mealTotals([entry]).kcal <= 0) throw new Error('식사 이름과 먹은 양을 입력해 주세요.');
      if (mutateDay(current => { const index = current.meals.findIndex(item => item.id === entry.id); if (index < 0) current.meals.push(entry); else current.meals[index] = entry; }, '식사를 저장했어요.', { date: selectedDate, type: existing && !copy ? 'meal-updated' : 'meal-added', mealId: entry.id })) closeDialog();
    });
    const update = () => { const form = new FormData($('entryForm')); const numbers = {}; ['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG'].forEach(key => { numbers[key] = Math.max(0, Number(form.get(key)) || 0); }); $('mealPreview').textContent = `총 ${fmt(I.mealTotals([numbers]).kcal)}kcal`; };
    $('entryForm').addEventListener('input', update); update();
  }
  function sessionDialog(existing = null) {
    const session = existing || { sport: state.profile?.sport === 'none' || !state.profile ? 'walking' : state.profile.sport, durationMin: 30, intensity: 'moderate' };
    openDialog(existing ? '운동 수정' : '운동 추가', `<div class="form-grid"><label class="field"><span>운동 종목</span><select name="sport">${Object.entries(sportNames).filter(([key]) => key !== 'none').map(([key, label]) => `<option value="${key}" ${session.sport === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('운동 시간 (분)', 'durationMin', session.durationMin, { min: 1, max: 720, step: 1, required: true })}<label class="field"><span>강도</span><select name="intensity">${Object.entries(intensityNames).map(([key, label]) => `<option value="${key}" ${session.intensity === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><p class="form-help">실제 운동한 시간만 기록해요. 쉬는 시간을 포함한 근력운동은 전체 세션 시간으로 적어 주세요. 일상 걷기를 생활 활동량에 반영했다면 중복 추가하지 마세요.</p>${actions()}`, form => {
      const entry = { id: existing?.id || id(), sport: String(form.get('sport')), durationMin: readNumber(form, 'durationMin'), intensity: String(form.get('intensity')) };
      if (mutateDay(current => { const index = current.sessions.findIndex(item => item.id === entry.id); if (index < 0) current.sessions.push(entry); else current.sessions[index] = entry; }, '운동을 저장하고 오늘 목표에 반영했어요.')) closeDialog();
    });
  }
  function measurementDialog() {
    const current = day();
    openDialog('몸 상태 기록', `<p class="form-help">${selectedDate} 측정값이에요. 모르는 항목은 비워 두세요. 골격근량은 추세 기록용이며 제지방량으로 환산하지 않아요.</p><div class="form-grid">${field('체중 (kg)', 'weightKg', current.weightKg ?? '', { min: 20, max: 350 })}${field('체지방률 (%) · 선택', 'bodyFatPct', current.bodyFatPct ?? '', { min: 2, max: 65 })}${field('골격근량 (kg) · 선택', 'skeletalMuscleKg', current.skeletalMuscleKg ?? '', { min: 1, max: 200 })}<label class="field"><span>체성분 측정 방식</span><select name="bodyFatMethod"><option value="unknown">모름</option><option value="bia">체성분 체중계·인바디</option><option value="dxa">DXA</option><option value="caliper">피하지방 측정</option></select></label></div>${actions()}`, form => {
      const weightKg = readNumber(form, 'weightKg', true), bodyFatPct = readNumber(form, 'bodyFatPct', true), skeletalMuscleKg = readNumber(form, 'skeletalMuscleKg', true);
      if ((bodyFatPct !== null || skeletalMuscleKg !== null) && weightKg === null) throw new Error('체성분과 함께 측정한 체중도 입력해 주세요.');
      const next = clone(state);
      if (!next.days[selectedDate]) next.days[selectedDate] = emptyDay();
      const bodyFatMethod = String(form.get('bodyFatMethod'));
      Object.assign(next.days[selectedDate], { weightKg, bodyFatPct, skeletalMuscleKg, bodyFatMethod });
      if (selectedDate === I.dateKey() && next.profile) {
        if (weightKg !== null) next.profile.weightKg = weightKg;
        if (bodyFatPct !== null) Object.assign(next.profile, { bodyFatPct, bodyFatMethod, bodyFatDate: selectedDate, bodyFatWeightKg: weightKg });
      }
      if (save(next, '몸 상태를 저장했어요.')) closeDialog();
    });
    $('entryForm').elements.bodyFatMethod.value = current.bodyFatMethod || 'unknown';
  }
  function confirmDialog(title, body, label, callback, word = null) {
    openDialog(title, `<p>${escape(body)}</p>${word ? `<label class="field"><span>확인하려면 ${word} 입력</span><input name="confirmation" autocomplete="off" required></label>` : ''}${actions(label)}`, form => {
      if (word && form.get('confirmation') !== word) throw new Error(`${word}을 정확히 입력해 주세요.`);
      if (callback() !== false) closeDialog();
    });
  }
  function download(text, filename, mime = 'application/json;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function showImportPreview() {
    if (!pendingImport) return;
    const current = pendingImport.kind === 'current';
    const imported = pendingImport.state;
    $('importPreview').innerHTML = `<div class="notice notice-warning"><h3>${current ? '전체 백업 복원 확인' : '이전 기록 보관 확인'}</h3><p>${current ? `프로필 ${imported.profile ? '있음' : '없음'} · 날짜별 기록 ${Object.keys(imported.days).length}일. 현재 이 버전의 데이터 전체를 바꿉니다.` : `이전 기록 ${imported.legacy?.records.length || 0}건과 원본을 보관함에 복사합니다. 현재 프로필과 새 기록은 유지합니다.${state.legacy ? ' 기존 이전 기록 보관함은 교체됩니다.' : ''}`}</p><p>계속하기 전에 현재 데이터의 백업을 내려받을 수 있어요.</p><div class="form-actions">${command('export', '현재 전체 백업', 'download', blocked ? 'disabled' : '')}${command('import-confirm', current ? '확인한 백업으로 교체' : '보관함에 가져오기', 'check', '', true)}${command('import-cancel', '취소', 'x')}</div></div>`;
    icons();
  }
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 JSON 백업을 선택해 주세요.');
      pendingImport = S.parseBackup(await file.text()); showImportPreview();
      $('importPreview').scrollIntoView({ block: 'nearest' });
    } catch (error) { pendingImport = null; $('importPreview').innerHTML = `<p class="notice notice-danger" role="alert">${escape(error.message)}</p>`; }
  }
  $('profileForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
    const form = new FormData(event.target);
    try {
      const profile = {};
      for (const key of ['sex', 'bodyFatMethod', 'sport', 'goal', 'activity', 'healthContext', 'proteinPreference']) profile[key] = String(form.get(key) || '');
      for (const key of ['age', 'heightCm', 'weightKg']) profile[key] = readNumber(form, key);
      profile.trainingYears = readNumber(form, 'trainingYears', true);
      profile.bodyFatPct = readNumber(form, 'bodyFatPct', true);
      profile.bodyFatWeightKg = readNumber(form, 'bodyFatWeightKg', true);
      profile.bodyFatDate = String(form.get('bodyFatDate') || '') || null;
      if (profile.bodyFatDate && profile.bodyFatDate > I.dateKey()) throw new Error('체성분 측정일은 오늘까지의 날짜로 입력해 주세요.');
      if (profile.bodyFatPct === null) { profile.bodyFatDate = null; profile.bodyFatMethod = 'unknown'; profile.bodyFatWeightKg = null; }
      const plan = N.calculatePlan(profile, { date: I.dateKey(), sessions: [] }, []);
      if (plan.status === 'incomplete') throw new Error((plan.reasons || []).join(' '));
      const next = clone(state); next.profile = profile;
      const todayDraft = next.days[I.dateKey()];
      if (todayDraft && !todayDraft.complete) {
        todayDraft.weightKg = profile.weightKg;
        todayDraft.bodyFatPct = profile.bodyFatDate === I.dateKey() && profile.bodyFatWeightKg === profile.weightKg ? profile.bodyFatPct : null;
        todayDraft.bodyFatMethod = todayDraft.bodyFatPct === null ? 'unknown' : profile.bodyFatMethod;
        if (todayDraft.skeletalMuscleKg !== null && todayDraft.skeletalMuscleKg > profile.weightKg * (1 - (todayDraft.bodyFatPct || 0) / 100)) todayDraft.skeletalMuscleKg = null;
      }
      if (save(next, '내 기준을 저장했어요. 완료한 과거 기록은 그대로예요.')) { $('profileErrors').hidden = true; profileInitialized = false; profileDirty = false; selectedDate = I.dateKey(); render(); selectView('today'); }
    } catch (error) { $('profileErrors').hidden = false; $('profileErrors').textContent = error.message; $('profileErrors').tabIndex = -1; $('profileErrors').focus(); }
  });
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]');
    if (nav) { selectView(nav.dataset.view); return; }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const current = day();
    const edits = ['meal-add', 'meal-edit', 'meal-copy', 'meal-delete', 'meal-reuse', 'session-add', 'session-edit', 'session-delete', 'measurement', 'allocation-reset', 'coach-checkin'];
    if (current.complete && edits.includes(action)) { toast('완료한 기록은 먼저 기록 수정을 눌러 주세요.'); return; }
    try {
      if (action === 'go-profile' || action === 'nav-profile') selectView('profile');
      else if (action === 'nav-coach') selectView('coach');
      else if (action === 'nav-trends') selectView('trends');
      else if (action === 'coach-checkin') checkinDialog();
      else if (action === 'coach-question') { coachQuestion = button.dataset.question; selectView('coach', false); $('coachAnswer')?.focus({ preventScroll: true }); }
      else if (action === 'profile-next') moveProfileStep(onboardingStep + 1);
      else if (action === 'profile-back') moveProfileStep(onboardingStep - 1);
      else if (action === 'profile-step') moveProfileStep(Number(button.dataset.step));
      else if (action === 'go-today') { selectedDate = I.dateKey(); render(); selectView('today'); }
      else if (action === 'dialog-close') closeDialog();
      else if (action === 'previous-day' || action === 'next-day') { selectedDate = I.shiftDate(selectedDate, action === 'previous-day' ? -1 : 1); if (selectedDate > I.dateKey()) selectedDate = I.dateKey(); if (selectedDate < '1900-01-01') selectedDate = '1900-01-01'; render(); }
      else if (action === 'open-day') { selectedDate = button.dataset.date; render(); selectView('today'); }
      else if (action === 'meal-add') mealDialog();
      else if (action === 'meal-edit') mealDialog(current.meals.find(item => item.id === button.dataset.id));
      else if (action === 'meal-reuse') mealDialog(previousMeals().find(item => item.id === button.dataset.id), true);
      else if (action === 'meal-copy') mutateDay(item => item.meals.push({ ...item.meals.find(meal => meal.id === button.dataset.id), id: id() }), '같은 식사를 추가했어요.');
      else if (action === 'meal-delete' || action === 'session-delete') confirmDialog('기록 삭제', '선택한 기록을 삭제하고 오늘 합계를 다시 계산할까요?', '삭제', () => mutateDay(item => { const key = action === 'meal-delete' ? 'meals' : 'sessions'; item[key] = item[key].filter(entry => entry.id !== button.dataset.id); }, '기록을 삭제했어요.'));
      else if (action === 'session-add') sessionDialog();
      else if (action === 'session-edit') sessionDialog(current.sessions.find(item => item.id === button.dataset.id));
      else if (action === 'measurement') measurementDialog();
      else if (action === 'allocation-reset') mutateDay(item => { item.carbAdjustmentG = 0; }, '기본 배분으로 돌아왔어요.');
      else if (action === 'complete') confirmDialog('하루 기록 완료', '빠진 식사가 없는지 확인해 주세요. 지금의 목표와 식사 기록을 함께 보관하고, 이후 프로필을 바꿔도 이 날의 목표는 유지해요.', '완료', () => mutateDay(item => { const snapshot = planFor(item); if (snapshot.context) snapshot.context.goal = state.profile?.goal || null; item.planSnapshot = clone(snapshot); item.complete = true; }, '하루 기록을 완료했어요.'));
      else if (action === 'reopen') confirmDialog('완료한 기록 수정', '이 날을 다시 열면 현재 프로필과 이 날짜의 몸 상태·운동으로 목표를 다시 계산해요. 이전 기준을 보관하려면 먼저 전체 백업을 내려받아 주세요.', '다시 열기', () => mutateDay(item => { item.complete = false; item.planSnapshot = null; }, '기록을 다시 열었어요.'));
      else if (action === 'export') { download(S.exportBackup(state), `macro-engine-${I.dateKey()}.json`); toast('백업 다운로드를 요청했어요. 저장된 파일을 확인해 주세요.'); }
      else if (action === 'import-select') $('backupFile').click();
      else if (action === 'import-cancel') { pendingImport = null; renderData(); icons(); }
      else if (action === 'import-confirm') {
        const incoming = pendingImport;
        if (!incoming) return;
        if (blocked && incoming.kind !== 'current') throw new Error('보호 중인 저장소는 검증된 전체 백업으로 복원하거나 초기화해야 해요.');
        const next = incoming.kind === 'current' ? incoming.state : { ...clone(state), legacy: incoming.state.legacy };
        if (save(next, '백업을 복원했어요.', incoming.kind === 'current')) { pendingImport = null; profileInitialized = false; profileDirty = false; render(); }
      }
      else if (action === 'legacy-preview') { pendingImport = { kind: 'legacy', state: S.importLegacy(S.detectLegacy()) }; showImportPreview(); }
      else if (action === 'legacy-export') download(JSON.stringify(state.legacy.raw, null, 2), `macro-engine-previous-${I.dateKey()}.json`);
      else if (action === 'corrupt-export') download(loaded.corruptedRaw, `macro-engine-recovery-${I.dateKey()}.txt`, 'text/plain;charset=utf-8');
      else if (action === 'csv-export') {
        const rows = [['날짜', '기록상태', '체중kg', '체지방률', '골격근kg', '섭취kcal', '단백질g', '탄수g', '지방g', '알코올g', '목표kcal']];
        Object.values(state.days).sort((a, b) => a.date.localeCompare(b.date)).forEach(item => { const totals = I.mealTotals(item.meals); rows.push([item.date, item.complete ? '완료' : '기록 중', item.weightKg ?? '', item.bodyFatPct ?? '', item.skeletalMuscleKg ?? '', totals.kcal, totals.protein, totals.carbs, totals.fat, totals.alcoholG, item.planSnapshot?.energy?.targetKcal ?? '']); });
        download('\uFEFF' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'), `macro-engine-records-${I.dateKey()}.csv`, 'text/csv;charset=utf-8');
      }
      else if (action === 'reset') confirmDialog('이 버전의 기록 초기화', '프로필과 식사·운동·몸 상태·이전 기록 보관함을 삭제합니다. 먼저 전체 백업을 보관했는지 확인해 주세요.', '초기화', () => {
        if (!save(S.createEmpty(), '초기화했어요.', true)) return false;
        pendingImport = null; profileInitialized = false; profileDirty = false; onboardingStep = 0; selectedDate = I.dateKey(); render(); selectView('profile'); return true;
      }, '초기화');
    } catch (error) { toast(error.message, true); }
  });
  $('profileForm').addEventListener('input', () => { profileDirty = true; renderProfileSummary(); $('profileSaveNote').textContent = '아직 저장하지 않은 변경이 있어요.'; });
  document.addEventListener('change', event => {
    if (event.target.id === 'dayDate') {
      if (S.isValidDate(event.target.value) && event.target.value <= I.dateKey()) { selectedDate = event.target.value; render(); }
      else { toast('오늘까지의 올바른 날짜를 선택해 주세요.', true); event.target.value = selectedDate; }
    } else if (event.target.id === 'allocation' && !day().complete) {
      mutateDay(item => { item.carbAdjustmentG = Number(event.target.value); }, '총열량을 유지하며 배분을 바꿨어요.');
      $('allocation')?.focus();
    } else if (event.target.id === 'backupFile') importFile(event.target.files[0]);
  });
  $('entryDialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  window.addEventListener('resize', drawChart);
  window.addEventListener('storage', event => {
    if (event.key === S.STORAGE_KEY) { blocked = true; render(); toast('다른 탭에서 기록이 바뀌었어요. 충돌을 막기 위해 저장을 멈췄어요. 새로고침해 최신 기록을 불러와 주세요.', true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { const input = $('dayDate'); if (input) input.max = I.dateKey(); }
  });
  render();
  if (loaded.warnings.length && !blocked) toast(loaded.warnings.join(' '), true);
})();
