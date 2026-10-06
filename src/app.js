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
  let view = 'today';
  let pendingImport = null;
  let toastTimer;
  let dialogReturnFocus;
  let lastMutation = null;
  let coachQuestion = null;
  let onboardingStep = 0;
  let profileInitialized = false;
  let profileDirty = false;
  let trendPeriod = 28;
  let bodyMetric = 'weightKg';
  let intakeMetric = 'kcal';
  let profileActivityDraft = null;
  let profileWeekdayDraft = {};
  let retrievalCache = null;
  let contextCache = null;
  let activityReviewId = null;
  let activityQuestionSnapshot = null;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const activityNumber = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 20 });
  const id = () => window.crypto?.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sportNames = { none: '운동 없음', strength: '근력운동', running: '달리기', cycling: '사이클', swimming: '수영', team: '구기·팀 스포츠', mixed: '복합 운동', walking: '걷기' };
  const goalNames = { lose: '체지방 감량', maintain: '체중 유지', gain: '근육 증가', recomp: '체성분 개선', performance: '운동 수행' };
  const intensityNames = { easy: '가볍게', moderate: '보통', hard: '힘들게' };
  const activityFormats = { continuous: '일정하게 이어감', interval: '인터벌', technique: '기술 연습', practice: '훈련·연습', match: '경기', race: '대회', hybrid: '종목을 섞어서 수행' };
  const activityIntents = { regular: '평소 훈련', deload: '부담을 낮춘 기간', light: '가볍게', technique: '기술 연습', 'time-limited': '시간이 부족했음', return: '쉬었다가 복귀', test: '기록·수행 확인' };
  const activityConditions = { usual: '평소와 비슷함', hot: '더웠음', cold: '추웠음', windy: '바람이 강했음', hilly: '오르내림이 많았음', different: '다른 조건' };
  const activityEnvironments = { usual: '평소 환경', outdoor: '야외', treadmill: '트레드밀', indoor: '실내', pool: '수영장', 'open-water': '오픈워터', different: '다른 환경' };
  const segmentKinds = { run: '달리기', strength: '근력', row: '로잉', ski: '스키에르그', carry: '운반', other: '기타' };
  const mealTypes = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식', drinks: '술', other: '기타' };
  const titles = { today: '오늘의 기록', coach: '앱코치', training: '운동', trends: '기록과 추세', profile: '내 기준', data: '데이터' };
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const command = (action, text, symbol = 'plus', extra = '', primary = false) => `<button type="button" class="button ${primary ? 'button-primary' : 'button-secondary'}" data-action="${action}" ${extra}>${icon(symbol)}<span>${text}</span></button>`;
  const iconButton = (action, name, symbol, extra = '') => `<button type="button" class="icon-button" data-action="${action}" title="${name}" aria-label="${name}" ${extra}>${icon(symbol)}</button>`;
  const trainingUI = window.MacroTrainingUI.create({ getState: () => state, getDate: () => selectedDate,
    getDay: day, getView: () => view, setDate: date => { selectedDate = date; render(); }, save, render, selectView,
    escape, fmt, icon, command, iconButton, id, field, actions, openDialog, closeDialog, toast,
    confirmDialog, emptyDay, download, icons, coachFor,
    retrievalHTML,
    resetProfile: () => { profileInitialized = false; profileDirty = false; } });
  const coachActionsUI = window.MacroCoachActionsUI?.create({ getState: () => state, getDate: () => selectedDate,
    getDay: day, save, render, selectView, escape, fmt, icon, command, iconButton, id, field, actions,
    openDialog, closeDialog, toast, emptyDay });
  const diaryUI = window.MacroDiaryUI.create({ bridge: trainingUI.bridge, setupDialog: trainingUI.setupDialog,
    onScan: result => trainingUI.onDiaryScan(result), escape, command, iconButton, openDialog, closeDialog, toast, icons });
  function emptyDay(date = selectedDate) { return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null }; }
  function day() { return state.days[selectedDate] || emptyDay(); }
  function effectiveProfile(date = selectedDate) {
    return N.profileForDay(state.profile, state.days[date] || {});
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
      trainingUI.onSave(state);
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
    if (view === 'training') trainingUI.render();
    if (view === 'trends') drawChart();
    $('headerActions').innerHTML = command('connection-setup', '연결 설정', 'plug') + (view !== 'profile' ? command('nav-profile', '내 기준', 'sliders-horizontal') : '');
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
    return C.buildCoach(effectiveProfile(current.date), current, state.days, { lastMutation, decisionContext: decisionContext(current.date), training: state.training, trainingAnalysis: trainingUI.analysis(), program: trainingUI.coachingProgram() });
  }
  function decisionContext(date = selectedDate) {
    if (!contextCache || contextCache.state !== state || contextCache.date !== date) contextCache = { state, date, value: window.MacroCoachContext.build(state, date) };
    return contextCache.value;
  }
  function scopeControlHTML() {
    const scope = state.trackingScope || 'auto';
    return `<label class="tracking-scope"><span>기록 범위</span><select id="trackingScope" aria-label="기록 범위">${[['auto', '기록에 맞춰'], ['nutrition', '식단 중심'], ['training', '운동 중심'], ['both', '식단과 운동']].map(([value, label]) => `<option value="${value}" ${scope === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  }
  function coachAction(item, primary = false) {
    if (day().complete && ['meal-add', 'session-add', 'measurement', 'coach-checkin', 'complete'].includes(item?.action)) return command('reopen', '기록을 다시 열어 확인', 'pencil', '', primary);
    if (!item?.action) return '';
    const opensRecord = item.action === 'training-open' && item.actionRecordId;
    const action = item.action === 'training-open' && !opensRecord ? 'nav-training' : item.action;
    const label = item.action === 'training-open' && !opensRecord ? '전체 운동 일지' : item.actionLabel || '함께 확인하기';
    return command(action, label, { 'meal-add': 'plus', 'session-add': 'dumbbell', measurement: 'scale', 'coach-checkin': 'heart-pulse', 'nav-profile': 'sliders-horizontal', 'nav-trends': 'chart-line', 'training-open': 'notebook-pen', complete: 'check', reopen: 'pencil' }[action] || 'arrow-right', opensRecord ? `data-id="${escape(item.actionRecordId)}"` : '', primary);
  }
  function coachRail(coach) {
    const first = coach.priorities[0];
    return `<aside class="coach-rail" aria-label="오늘의 기록 요약"><div class="coach-label">${icon('notebook-pen')}<strong>기록 요약</strong><span>${day().complete ? '하루 돌아보기' : '현재 기록 기준'}</span></div><h2>${escape(coach.headline)}</h2><p class="coach-summary">${escape(coach.summary)}</p>${first ? `<div class="coach-next ${first.tone === 'attention' ? 'coach-attention' : ''}"><span class="eyebrow">먼저 확인할 것</span><strong>${escape(first.title)}</strong><p>${escape(first.body)}</p>${coachAction(first, true)}</div>` : ''}<button type="button" class="coach-open" data-action="nav-coach">상담 · 기록 요약 열기${icon('arrow-up-right')}</button></aside>`;
  }
  function retrievalHTML(question) {
    if (!question?.trim() || !window.MacroCoachQuery) return '';
    if (!retrievalCache || retrievalCache.state !== state || retrievalCache.date !== selectedDate || retrievalCache.question !== question) {
      retrievalCache = { state, date: selectedDate, question, value: window.MacroCoachQuery.retrieve(state, selectedDate, question) };
    }
    const value = retrievalCache.value;
    const targets = [...new Set([...(value.sports || []).map(key => sportNames[key] || key), ...(value.exercises || []).map(row => row.label), ...(value.rawNames || []), ...(value.muscleIds || []).map(key => window.MacroTraining.muscleLabels[key] || key)])];
    const periods = (value.periods || []).map(period => {
      const source = period.source || {}, coverage = period.training?.coverage, activity = period.activities;
      const available = period.available?.training, ranges = [], counts = [];
      if (activity?.sessionCount) {
        counts.push(`시간·거리 기록 ${fmt(activity.sessionCount)}회 · ${fmt(activity.dayCount)}일 · ${activityNumber(activity.durationMin)}분`);
        if (activity.actualRange) ranges.push(`시간·거리 기록 날짜: ${activity.actualRange.from} ~ ${activity.actualRange.to}`);
      }
      if (source.matchedWorkoutCount || !activity?.sessionCount) counts.push(`세트 일지 ${fmt(source.matchedWorkoutCount)}건${source.matchedWorkoutCount && coverage ? ` · 일반 ${fmt(coverage.workingSets)}세트` : ''}`);
      counts.push(`식사 기록 ${fmt(period.nutrition?.daysWithMeals)}일`);
      if (available) ranges.push(`세트 일지 날짜: ${available.from} ~ ${available.to}`);
      const distances = (activity?.bySport || []).filter(row => row.distanceKnownSessionCount && typeof row.recordedDistanceM === 'number')
        .map(row => `${sportNames[row.sport]} · 거리를 남긴 ${row.distanceKnownSessionCount}회 합계 ${row.sport === 'swimming' ? `${activityNumber(row.recordedDistanceM)}m` : `${activityNumber(row.recordedDistanceM / 1000)}km`}`);
      return `<div class="query-period"><strong>${escape(period.label)} · ${escape(period.from)} ~ ${escape(period.to)}</strong><p>${counts.map(escape).join(' · ')}</p>${distances.length ? `<p>${distances.map(escape).join(' · ')}</p>` : ''}<p class="form-help">${ranges.length ? ranges.map(escape).join(' · ') : '이 기간에 저장된 해당 운동 기록 없음'} · 빈 날짜는 휴식이나 섭취 0으로 채우지 않습니다.</p></div>`;
    }).join('');
    const notes = [...(value.ambiguities || []), ...(value.assumptions || []), ...(value.limits || [])];
    return `<details class="coach-query-scope"><summary>마지막 질문을 현재 기준으로 조회${value.needsClarification ? ' · 조건 확인 필요' : ''}</summary><div class="coach-query-detail"><p class="form-help">조회 기준일 ${escape(selectedDate)} · 현재 저장된 기록. 이전 답변 당시의 자료 범위를 뜻하지 않습니다.</p>${targets.length ? `<p>${targets.map(escape).join(' · ')}</p>` : ''}${periods}<p class="form-help">사진 원본을 다시 판독하거나 이전 답변을 자동 수정하지 않습니다.</p>${notes.map(line => `<p class="form-help">${escape(line)}</p>`).join('')}</div></details>`;
  }
  function quickRecordsHTML(current) {
    const frozen = current.complete;
    const scope = state.trackingScope || 'auto';
    const entries = frozen ? `${scope !== 'nutrition' ? command('nav-training', '운동 일지', 'dumbbell') : ''}${command('reopen', '기록 다시 열기', 'pencil')}` : `${scope !== 'nutrition' ? command('session-add', '운동 시간 기록', 'timer') + command('training-add', '세트 일지 기록', 'dumbbell') : ''}${scope !== 'training' ? command('meal-add', '식사 추가', 'utensils') + command('meal-templates', '자주 먹는 식사', 'bookmark') : ''}`;
    return `<section class="daily-quick-records" aria-labelledby="dailyQuickRecordsTitle"><div class="section-header"><h2 id="dailyQuickRecordsTitle">빠르게 기록</h2>${frozen ? '<span class="muted">완료한 기록은 다시 열어 수정</span>' : ''}</div><div class="daily-quick-actions">${entries}${command('training-image', '사진 추가', 'image-plus')}</div></section>`;
  }
  function dailyConditionHTML(current) {
    const checkin = current.coachCheckin;
    const labels = { energy: { low: '많이 지침', okay: '보통', good: '좋음' }, hunger: { low: '별로 없음', okay: '보통', high: '많이 배고픔' }, sleep: { poor: '잘 못 잠', okay: '보통', good: '잘 잠' } };
    return `<section class="daily-condition" aria-labelledby="dailyConditionTitle"><div class="section-header"><h2 id="dailyConditionTitle">컨디션</h2>${current.complete ? '' : command('coach-checkin', checkin ? '컨디션 수정' : '컨디션 기록', 'heart-pulse')}</div><div class="checkin-summary">${['energy', 'hunger', 'sleep'].map((key, index) => `<div><span>${['에너지', '허기', '수면'][index]}</span><strong>${labels[key][checkin?.[key]] || '미기록'}</strong></div>`).join('')}</div>${checkinDetailHTML(checkin)}${checkin?.note ? `<p class="form-help">${escape(checkin.note)}</p>` : ''}</section>`;
  }
  function checkinDetailHTML(value) {
    if (!value) return '';
    const labels = { fatigue: { low: '피로가 적음', usual: '평소 정도의 피로', high: '피로가 큼' }, illness: { none: '아프지 않음', active: '현재 아픈 상태', recovering: '아팠다가 회복 중' }, pain: { none: '통증 없음', mild: '통증 있음', stop: '멈춰야 할 통증' }, interruptionReason: { travel: '여행·출장으로 쉬었음', illness: '아파서 쉬었음', schedule: '일정 때문에 쉬었음', 'planned-break': '계획한 휴식', other: '다른 이유로 쉬었음' } };
    const rows = Object.entries(labels).map(([key, options]) => options[value[key]]).filter(Boolean);
    if (typeof value.sleepHours === 'number') rows.unshift(`지난밤 ${activityNumber(value.sleepHours)}시간 수면`);
    return rows.length ? `<p class="checkin-detail">${rows.map(escape).join(' · ')}</p>` : '';
  }
  function activityReviewHTML() {
    activityQuestionSnapshot = null;
    const value = window.MacroActivity?.build(state, selectedDate);
    if (!value || !value.current?.length && !value.latest?.length && !value.history?.sessionCount) return '';
    const rows = value.current?.length ? value.current : Array.isArray(value.latest) ? value.latest : [];
    const selected = rows.find(row => row.id === activityReviewId) || rows[0] || null;
    if (selected) activityReviewId = selected.id;
    const actual = selected?.actual || {}, metrics = [];
    if (typeof actual.durationMin === 'number') metrics.push(`전체 ${activityNumber(actual.durationMin)}분`);
    if (typeof actual.distanceM === 'number') metrics.push(selected.sport === 'swimming' ? `${activityNumber(actual.distanceM)}m` : `${activityNumber(actual.distanceM / 1000)}km`);
    if (typeof actual.movingMin === 'number') metrics.push(`이동 ${activityNumber(actual.movingMin)}분`);
    if (typeof actual.effortRpe === 'number') metrics.push(`RPE ${activityNumber(actual.effortRpe)}`);
    if (typeof actual.avgPowerW === 'number') metrics.push(`${activityNumber(actual.avgPowerW)}W`);
    if (typeof actual.avgHeartRateBpm === 'number') metrics.push(`${activityNumber(actual.avgHeartRateBpm)}bpm`);
    const connections = (Array.isArray(value.connections) ? value.connections : []).map(row => typeof row === 'string' ? row : row.body || row.summary || '').filter(Boolean);
    const alternatives = (Array.isArray(selected?.alternatives) ? selected.alternatives : []).filter(row => row?.body);
    const sources = (Array.isArray(selected?.sources) ? selected.sources : []).map(row => typeof row === 'string' ? row : [row.date, row.label].filter(Boolean).join(' · ')).filter(Boolean);
    const edit = selected && !state.days[selected.date]?.complete ? command('activity-session-edit', '이 운동 기록 보완', 'pencil', `data-id="${escape(selected.id)}" data-date="${escape(selected.date)}"`) : '';
    const context = activityContextText(actual.details), segments = activitySegmentText(actual.details);
    const composition = segments.length ? `<section class="activity-composition" aria-label="기록한 운동 구간"><h4>${actual.details.sequenceConfirmed ? '수행한 순서와 구간' : '기록한 구간'}</h4><ul>${segments.map(segment => `<li>${segment}</li>`).join('')}</ul></section>` : '';
    const question = selected?.question;
    const options = question?.topic === 'intent' && !state.days[selected.date]?.complete ? (question.options || []).filter(option => activityIntents[option?.value] && typeof option.label === 'string') : [];
    if (options.length) activityQuestionSnapshot = { viewDate: selectedDate, date: selected.date, id: selected.id, source: JSON.stringify(state.days[selected.date]?.sessions.find(row => row.id === selected.id)) };
    const questionHTML = question?.body ? `<div class="activity-question">${options.length ? `<h4>${escape(selected.date)} 운동의 목적</h4>` : ''}<p>${escape(question.body)}</p>${options.length ? `<div class="segmented" aria-label="이 운동의 목적">${options.map(option => `<button type="button" data-action="activity-intent-answer" data-date="${escape(selected.date)}" data-id="${escape(selected.id)}" data-answer="${escape(option.value)}" aria-pressed="${actual.details.intent === option.value}">${escape(option.label)}</button>`).join('')}</div>` : ''}</div>` : '';
    return `<section id="activityWorkoutReview" class="activity-coaching" aria-labelledby="activityWorkoutReviewTitle"><div class="section-header"><h2 id="activityWorkoutReviewTitle">시간·거리 운동 살펴보기</h2></div>${value.summary ? `<p class="activity-overview">${escape(value.summary)}</p>` : ''}${rows.length ? `<label class="field activity-review-selector"><span>살펴볼 운동 기록</span><select id="activityReviewSelect">${rows.map(row => `<option value="${escape(row.id)}" ${row.id === selected.id ? 'selected' : ''}>${escape(row.date)} · ${escape(row.label || sportNames[row.sport])}</option>`).join('')}</select></label><div id="activityReviewDetail" tabindex="-1" role="region" aria-labelledby="activityReviewDetailTitle"><h3 id="activityReviewDetailTitle">${escape(selected.label || sportNames[selected.sport])}</h3>${metrics.length ? `<p class="activity-actual">${metrics.map(escape).join(' · ')}</p>` : ''}${context.length ? `<p class="activity-conditions">${context.map(escape).join(' · ')}</p>` : ''}${composition}${selected.assessment ? `<p class="activity-assessment">${escape(selected.assessment)}</p>` : ''}${selected.action?.body ? `<div class="activity-next"><h4>${escape(selected.action.title)}</h4><p>${escape(selected.action.body)}</p></div>` : ''}${alternatives.length ? `<details class="activity-alternatives"><summary>다른 선택지</summary>${alternatives.map(row => `<h4>${escape(row.title)}</h4><p>${escape(row.body)}</p>`).join('')}</details>` : ''}${questionHTML}${edit ? `<div class="form-actions">${edit}</div>` : ''}${sources.length ? `<details class="source-details"><summary>참고한 기록</summary>${[...new Set(sources)].map(source => `<p>${escape(source)}</p>`).join('')}</details>` : ''}</div>` : ''}${connections.length ? `<div class="activity-connections">${connections.map(body => `<p>${escape(body)}</p>`).join('')}</div>` : ''}</section>`;
  }
  function coverageHTML() {
    const value = decisionContext(), food = value.nutrition.coverage, training = value.training.coverage, body = value.body;
    const foodRow = value.scope.nutritionEnabled ? `<div><dt>식사</dt><dd>완료 ${food.completeMealDays}일 · 일부 ${food.partialMealDays}일<br>미기록 ${food.daysWithoutMeals}일 · 먹지 않았다는 뜻은 아님</dd></div>` : '';
    const trainingRow = value.scope.trainingEnabled ? `<div><dt>운동</dt><dd>기록 ${training.daysWithAnyTrainingRecord}일 · 일반 ${training.workingSets}세트<br>미기록 ${training.unknownDays}일 · 휴식 여부 미확인</dd></div>` : '';
    const bodyRow = `<div><dt>체성분 · 선택</dt><dd>${body.pairedMeasurementAvailable ? `${escape(body.paired.date)} · 체중과 체지방률 기록${body.pairedMethodKnown ? '' : '<br>측정 방법 미확인'}` : body.latest ? `${escape(body.latest.date)} · 일부 측정 기록<br>짝지은 체중·체지방률은 미확인` : '측정 없어도 기록·코칭 가능'}${body.hasConflicts ? '<br>같은 날짜의 측정 출처가 충돌 · 하나의 확정값으로 판단 안 함' : ''}</dd></div>`;
    return `<section class="record-coverage" aria-labelledby="recordCoverageTitle"><div class="section-header"><h2 id="recordCoverageTitle">이번 주의 출발점</h2><span class="muted">${value.window.from} ~ ${value.window.to}</span></div><dl>${foodRow}${trainingRow}${bodyRow}</dl>${value.goal.changeObserved ? '<p class="form-help">현재 목표가 완료한 과거 기록의 목표와 다릅니다. 과거 목표는 그대로 두고 앞으로의 선택을 점검해요.</p>' : ''}</section>`;
  }
  function renderCoach() {
    trainingUI.captureChatScroll();
    const current = day(), coach = coachFor(current), plan = planFor(current);
    const selected = coach.questions.find(item => item.id === coachQuestion);
    const checkin = current.coachCheckin;
    const labels = { energy: { low: '많이 지침', okay: '보통', good: '좋음' }, hunger: { low: '별로 없음', okay: '보통', high: '많이 배고픔' }, sleep: { poor: '잘 못 잠', okay: '보통', good: '잘 잠' } };
    const first = coach.priorities[0];
    $('coachContent').innerHTML = `<div class="coaching-grid"><div class="coaching-main">${trainingUI.chatHTML()}<section class="coach-record-summary" aria-labelledby="coachRecordSummaryTitle"><div class="coach-session-meta"><span class="coach-label">${icon('notebook-pen')}<strong id="coachRecordSummaryTitle">기록 요약</strong></span><span>${selectedDate} · ${current.complete ? '저장 당시 기준' : '기록 중'}</span></div><section class="coach-brief"><span class="eyebrow">앱 계산 · 기록된 상태 기준</span><h2>${escape(coach.headline)}</h2><p>${escape(coach.summary)}</p></section>${first ? `<section class="coach-priority ${first.tone === 'attention' ? 'coach-attention' : ''}"><div class="coach-priority-heading"><span class="priority-number">01</span><h3>${escape(first.title)}</h3></div><p>${escape(first.body)}</p>${coachAction(first, true)}</section>` : ''}<section class="coach-checkin"><div class="section-header"><h2>오늘 몸은 어때요?</h2>${!current.complete ? command('coach-checkin', checkin ? '컨디션 수정' : '컨디션 기록', 'heart-pulse') : ''}</div><div class="checkin-summary">${['energy', 'hunger', 'sleep'].map((key, index) => `<div><span>${['에너지', '허기', '수면'][index]}</span><strong>${labels[key][checkin?.[key]] || '아직 모름'}</strong></div>`).join('')}</div>${!checkin ? '<p class="form-help">기록된 섭취량만으로 허기나 회복 상태를 알 수는 없어요.</p>' : ''}</section><section class="coach-conversation"><div class="section-header"><h2>기록에서 확인할 항목</h2></div><div class="coach-topics" aria-label="기록 요약 항목">${coach.questions.map(item => `<button type="button" data-action="coach-question" data-question="${escape(item.id)}" aria-pressed="${item.id === coachQuestion}">${escape(item.label)}${icon('arrow-up-right')}</button>`).join('')}</div>${selected ? `<div id="coachAnswer" class="coach-answer" role="region" tabindex="-1" aria-label="${escape(selected.label)}"><span class="eyebrow">현재 기록 · 앱 계산 기준</span><h3>${escape(selected.label)}</h3><p>${escape(selected.answer)}</p>${coachAction(selected)}</div>` : ''}</section>${coach.priorities.length > 1 ? `<section class="coach-supporting"><h2>그다음에 확인할 것</h2>${coach.priorities.slice(1).map(item => `<details><summary>${escape(item.title)}</summary><p>${escape(item.body)}</p>${coachAction(item)}</details>`).join('')}</section>` : ''}</section></div><aside class="coach-context"><span class="eyebrow">선택한 날짜의 기록</span><h2>내 기록에서 시작해요</h2><dl><div><dt>목표</dt><dd>${goalNames[plan.context?.goal || state.profile?.goal] || '아직 모름'}</dd></div><div><dt>목표에 반영한 운동 시간</dt><dd>${current.sessions.length ? current.sessions.map(item => `${sportNames[item.sport]} ${fmt(item.durationMin)}분`).join(' · ') : '연결한 시간 없음 · 세트 일지는 별도'}</dd></div><div><dt>식사</dt><dd>${current.meals.length}개 · ${fmt(I.mealTotals(current.meals).kcal)}kcal</dd></div><div><dt>하루 상태</dt><dd>${current.complete ? '완료 · 저장 당시 목표' : '진행 중 · 하루 평가 전'}</dd></div></dl><p class="form-help">입력한 정보와 앱 계산을 요약합니다. 통증·질환의 진단, 운동 자세 평가, 음식의 질과 미량영양소는 이 기록만으로 판단할 수 없어요.</p>${command('nav-trends', '최근 변화 보기', 'chart-line')}${command('nav-profile', '내 기준 살펴보기', 'sliders-horizontal')}</aside></div>`;
    $('coachContent').querySelector('.personal-conversation')?.insertAdjacentHTML('beforeend', trainingUI.memoryHTML());
    $('coachContent').querySelector('.coach-checkin')?.insertAdjacentHTML('beforeend', checkinDetailHTML(checkin));
    if (decisionContext().scope.trainingEnabled) $('coachContent').querySelector('.coach-record-summary .coach-brief')?.insertAdjacentHTML('afterend', activityReviewHTML());
    const reviewAnchor = $('coachContent').querySelector('.coach-record-summary > .coach-priority') || $('coachContent').querySelector('.coach-record-summary > .coach-brief');
    if (decisionContext().scope.trainingEnabled) reviewAnchor?.insertAdjacentHTML('afterend', trainingUI.workoutReviewHTML());
    if (!trainingUI.canAskAI()) {
      const conversation = $('coachContent').querySelector('.personal-conversation');
      if (conversation) $('coachContent').querySelector('.coach-record-summary .coach-brief')?.after(conversation);
    }
    $('coachContent').querySelector('.coach-context')?.insertAdjacentHTML('beforeend', trainingUI.coachContextHTML());
    $('coachContent').querySelector('.coaching-main')?.insertAdjacentHTML('beforeend', coachActionsUI?.renderHTML() || '');
    if (!current.meals.length) {
      const food = [...$('coachContent').querySelectorAll('.coach-context dt')].find(element => element.textContent === '식사');
      if (food) food.nextElementSibling.textContent = '미기록 · 섭취량 미확인';
    }
    if (coachActionsUI) $('coachContent').querySelector('.conversation-actions')?.insertAdjacentHTML('beforeend', command('nav-coach-actions', '계획 조정·결과 점검', 'clipboard-list'));
    trainingUI.enhanceChat();
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
    $('todayContent').innerHTML = `<div class="daily-toolbar"><div class="date-control">${iconButton('previous-day', '이전 날짜', 'chevron-left', selectedDate <= '1900-01-01' ? 'disabled' : '')}<label class="sr-only" for="dayDate">기록 날짜</label><input id="dayDate" type="date" min="1900-01-01" max="${I.dateKey()}" value="${selectedDate}">${iconButton('next-day', '다음 날짜', 'chevron-right', selectedDate >= I.dateKey() ? 'disabled' : '')}</div><span class="day-status">${icon(frozen ? 'circle-check' : 'circle-dashed')}${frozen ? '하루 기록 완료' : '기록 중'}</span></div><div class="today-grid"><div class="today-main">${state.profile && !ready ? `<div class="notice notice-warning"><strong>개별 영양 계획이 필요한 상태예요.</strong><p>${(plan.reasons || []).map(escape).join(' ')}</p><p>자동 목표 없이 식사와 몸 상태를 기록할 수 있어요.</p></div>` : ''}${energyOverview(plan, totals, frozen)}<section class="section meal-section"><div class="section-header"><div><span class="eyebrow">FOOD LOG</span><h2>식사 기록 <small>${current.meals.length}</small></h2></div>${command(frozen ? 'reopen' : 'meal-add', frozen ? '기록 수정' : '식사 추가', frozen ? 'pencil' : 'plus', '', true)}</div>${current.meals.length ? `<ul class="item-list">${current.meals.map((meal, index) => `<li class="item-row"><span class="entry-index">${String(index + 1).padStart(2, '0')}</span><div class="item-main"><strong>${escape(meal.name)}</strong><div class="secondary-text"><b>${fmt(I.mealTotals([meal]).kcal)}kcal</b><span>단 ${fmt(meal.protein, 1)} · 탄 ${fmt(meal.carbs, 1)} · 지 ${fmt(meal.fat, 1)}g${meal.alcoholG ? ` · 알코올 ${fmt(meal.alcoholG, 1)}g` : ''}</span></div></div>${frozen ? '' : `<div class="item-actions">${iconButton('meal-edit', `${escape(meal.name)} 수정`, 'pencil', `data-id="${escape(meal.id)}"`)}${iconButton('meal-copy', `${escape(meal.name)} 한 번 더 추가`, 'copy', `data-id="${escape(meal.id)}"`)}${iconButton('meal-delete', `${escape(meal.name)} 삭제`, 'trash-2', `data-id="${escape(meal.id)}"`)}</div>`}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('utensils')}<div><strong>오늘의 첫 식사를 남겨볼까요?</strong><p>먹은 양을 알면 다음 식사를 함께 계획할 수 있어요.</p></div></div>`}${recent.length ? `<div class="recent-meals"><span class="muted">최근 식사</span>${recent.map(meal => `<button class="text-button" type="button" data-action="meal-reuse" data-id="${escape(meal.id)}">${icon('plus')}${escape(meal.name)}</button>`).join('')}</div>` : ''}${!frozen && current.meals.length ? `<div class="day-completion"><p>오늘 먹은 식사를 모두 기록했나요?</p>${command('complete', '하루 기록 완료', 'check')}</div>` : ''}</section><section class="section movement-section"><div class="section-header"><div><span class="eyebrow">MOVEMENT & BODY</span><h2>운동과 몸 상태</h2></div>${!frozen ? command('session-add', '운동 시간 기록', 'plus') : ''}</div>${current.sessions.length ? `<ul class="item-list">${current.sessions.map(session => `<li class="item-row"><span class="entry-symbol">${icon(session.sport === 'strength' ? 'dumbbell' : 'activity')}</span><div class="item-main"><strong>${sportNames[session.sport] || escape(session.sport)}</strong><div class="secondary-text">${fmt(session.durationMin)}분 · ${intensityNames[session.intensity]}</div></div>${frozen ? '' : `<div class="item-actions">${iconButton('session-edit', '운동 수정', 'pencil', `data-id="${escape(session.id)}"`)}${iconButton('session-delete', '운동 삭제', 'trash-2', `data-id="${escape(session.id)}"`)}</div>`}</li>`).join('')}</ul>` : '<p class="muted movement-empty">아직 입력한 운동이 없어요. 운동했다면 함께 남겨주세요.</p>'}<div class="body-summary"><div><span>체중</span><strong>${fmt(current.weightKg, 1)}<small> kg</small></strong></div><div><span>체지방률</span><strong>${fmt(current.bodyFatPct, 1)}<small> %</small></strong></div><div><span>골격근량</span><strong>${fmt(current.skeletalMuscleKg, 1)}<small> kg</small></strong></div>${!frozen ? command('measurement', '체중·체성분 기록', 'scale') : ''}</div></section>${ready ? `<section class="section target-section"><details class="target-details"><summary><span>${icon('sliders-horizontal')}목표와 배분 살펴보기</span><span>${fmt(plan.energy.targetKcal)}kcal</span></summary><div class="facts-grid"><div><span>안정시대사 추정</span><strong>${fmt(plan.energy.restingKcal)}kcal</strong></div><div><span>오늘 운동 추가 소모</span><strong>${fmt(plan.energy.exerciseKcal)}kcal</strong></div><div><span>총소모 추정</span><strong>${fmt(plan.energy.tdeeKcal)}kcal</strong></div><div><span>섭취 시작 목표</span><strong>${fmt(plan.energy.targetKcal)}kcal</strong></div></div><p class="form-help">${escape(plan.energy.method)}. 실제 필요량은 추세와 회복 상태로 함께 확인해요.</p>${!frozen && maximum - minimum > 1 ? `<div class="allocation-control"><label for="allocation"><strong>탄수화물·지방 배분</strong></label><div class="allocation-labels"><span>지방 쪽으로</span><span>탄수화물 쪽으로</span></div><input id="allocation" type="range" min="${minimum}" max="${maximum}" step="1" value="${Math.max(minimum, Math.min(maximum, current.carbAdjustmentG || 0))}" aria-describedby="allocationNote"><p id="allocationNote" class="form-help">단백질과 총열량은 유지해요. 탄수 25g ↔ 지방 약 11g.</p>${command('allocation-reset', '기본 배분으로 되돌리기', 'rotate-ccw')}</div>` : ''}<details class="source-details"><summary>계산 근거와 적용 범위</summary><p class="form-help">측정값이나 진단이 아닌 시작 추정이에요. 식품의 질·알레르기·질환별 식이 처방은 따로 판단해야 해요.</p><ul>${(plan.sources || []).filter(source => /^https:\/\//.test(source.url)).map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a></li>`).join('')}</ul></details></details></section>` : ''}</div>${coachRail(coachFor(current))}</div>`;
    $('todayContent').querySelectorAll('.meal-section .item-main').forEach((element, index) => {
      const source = current.meals[index].source;
      if (!source) return;
      const badge = document.createElement('span'); badge.className = 'source-badge';
      badge.textContent = `${{ manual: '직접 입력', label: '영양 라벨', image: '이미지 판독', estimate: '분량 추정' }[source.kind]} · ${source.confidence === 'estimated' ? '추정값' : '확인한 숫자'}`;
      if (source.note) badge.title = source.note;
      element.append(badge);
    });
    const movement = $('todayContent').querySelector('.movement-section');
    if ((!frozen && state.profile?.activityMode === 'detailed') || plan.context?.dailyActivity?.mode === 'detailed') {
      const activity = plan.context?.dailyActivity;
      const observedActivity = frozen ? activity : current.dailyActivity || state.profile?.weekdayActivity?.[new Date(selectedDate + 'T00:00:00Z').getUTCDay()] || state.profile?.dailyActivity;
      movement.insertAdjacentHTML('beforeend', `<div class="daily-activity-summary"><div><strong>생활 시간${frozen ? ' · 저장 당시' : ''}</strong><p class="form-help">${activitySummary(observedActivity)}</p></div>${!frozen ? command('day-activity', '이 날만 변경', 'clock-3') : ''}</div>`);
      if (ready && activity?.mode === 'detailed') {
        const exercise = $('todayContent').querySelector('.facts-grid > div:nth-child(2)');
        exercise.querySelector('span').textContent = '휴식 대신 운동한 차이';
        exercise.querySelector('strong').textContent = `${fmt(activity.exerciseIncrementKcal)}kcal`;
        $('todayContent').querySelector('.target-details').insertAdjacentHTML('beforeend', `<details class="source-details"><summary>24시간 배분</summary><p>수면 ${fmt(activity.sleepHours, 1)}h · 업무 ${fmt(activity.workHours, 1)}h · 생활 ${fmt(activity.lifestyleHours, 1)}h · 운동 ${fmt(activity.exerciseHours, 1)}h · 나머지 휴식 ${fmt(activity.restHours, 1)}h</p><p class="form-help">${{ day: '이 날짜의 입력', weekday: '요일 설정', profile: '기본 설정' }[activity.source]} 기준입니다. 운동이 차지한 시간을 휴식에서 빼므로 운동 총소모를 다시 더하지 않습니다. 시간·활동계수로 만든 추정이며 실제 소모량 측정은 아닙니다.</p></details>`);
      }
    }
    if (ready && !frozen) $('todayContent').querySelector('.target-details').insertAdjacentHTML('beforeend', `<div class="form-actions">${command('allocation-suggest', '최근 식사 배분 참고', 'chart-no-axes-combined')}</div>`);
    if (!frozen && (state.sessionPresets || []).length) movement.insertAdjacentHTML('beforeend', `<div class="form-actions">${command('session-presets', '자주 하는 운동', 'bookmark')}</div>`);
    movement.querySelectorAll('.item-row').forEach((row, index) => {
      const session = current.sessions[index];
      if (session.details?.label) row.querySelector('.item-main > strong').textContent = session.details.label;
      row.querySelector('.item-main').insertAdjacentHTML('beforeend', activitySummaryHTML(session));
      if (session.cardio) row.querySelector('.item-main').insertAdjacentHTML('beforeend', `<p class="form-help">${session.cardio.environment === 'treadmill' ? '트레드밀' : '야외 평지'} · ${fmt(session.cardio.speedKmh, 1)}km/h · 경사 ${fmt(session.cardio.gradePct, 1)}%</p>`);
      if (!frozen) row.querySelector('.item-actions').insertAdjacentHTML('beforeend', iconButton('session-preset-save', '자주 하는 운동으로 저장', 'bookmark-plus', `data-id="${escape(session.id)}"`));
    });
    const main = $('todayContent').querySelector('.today-main');
    $('todayContent').querySelector('.daily-toolbar').insertAdjacentHTML('beforeend', scopeControlHTML());
    main.insertAdjacentHTML('afterbegin', `${trainingUI.todayHTML?.() || ''}${coachActionsUI?.renderHTML({ compact: true }) || ''}${quickRecordsHTML(current)}`);
    main.querySelector('.nutrition-overview').insertAdjacentHTML('afterend', dailyConditionHTML(current));
    if (!current.meals.length) {
      main.querySelector('.energy-dial strong').textContent = '미기록';
      main.querySelector('.energy-dial div > span').textContent = '섭취량 미확인';
      main.querySelector('.energy-caption > strong').textContent = '하루 섭취 평가는 기록 후';
      main.querySelectorAll('.macro-row-top > strong').forEach(element => { element.innerHTML = '미기록'; });
    }
    if (state.trackingScope === 'training' && !current.meals.length) {
      main.querySelectorAll('.nutrition-overview, .meal-section, .target-section, .notice-warning').forEach(element => { element.hidden = true; });
      main.querySelector('.movement-empty')?.remove();
    }
    if (state.trackingScope === 'nutrition' && !state.training?.records.some(row => row.date === selectedDate) && !state.training?.planning?.schedule.some(row => row.date === selectedDate) && !state.training?.followUps.some(row => row.status === 'open' && row.reviewDate <= selectedDate)) main.querySelector('.today-training-lanes')?.remove();
    const unresolved = trainingUI.intakeSummaryHTML?.() || '';
    if (unresolved) main.insertAdjacentHTML('beforeend', unresolved);
    main.insertAdjacentHTML('beforeend', coverageHTML());
  }
  function previousMeals() {
    const result = [];
    const dates = Object.keys(state.days).filter(date => date < selectedDate).sort().reverse();
    for (const date of dates) for (const meal of state.days[date].meals.slice().reverse()) {
      result.push(meal);
      if (result.length === 8) return result;
    }
    return result;
  }
  function renderMealTools(current) {
    const section = $('todayContent').querySelector('.meal-section');
    section.querySelectorAll('.item-row').forEach((row, index) => {
      const meal = current.meals[index];
      if (meal.type || meal.note) row.querySelector('.item-main').insertAdjacentHTML('beforeend', `<p class="form-help">${meal.type ? `<span class="badge">${mealTypes[meal.type]}</span> ` : ''}${escape(meal.note || '')}</p>`);
      const actions = row.querySelector('.item-actions');
      if (actions) actions.insertAdjacentHTML('beforeend', iconButton('meal-template-save', `${escape(meal.name)} 자주 먹는 식사로 저장`, 'bookmark-plus', `data-id="${escape(meal.id)}"`));
    });
    const recent = section.querySelector('.recent-meals');
    if (recent) recent.querySelectorAll('[data-action="meal-reuse"]').forEach((button, index) => {
      const meal = previousMeals()[index];
      button.insertAdjacentHTML('beforeend', `<small>${fmt(I.mealTotals([meal]).kcal)}kcal · 단 ${fmt(meal.protein)}g</small>`);
    });
    const previous = state.days[I.shiftDate(selectedDate, -1)];
    section.insertAdjacentHTML('beforeend', `<div class="form-actions">${!current.complete && previous?.meals.length ? command('meal-copy-previous', '전날 식사 가져오기', 'copy-plus') : ''}${command('day-note', current.note ? '하루 메모 보기' : '하루 메모', 'notebook-pen', current.complete && !current.note ? 'disabled' : '')}</div>${current.note ? `<p class="form-help">${escape(current.note)}</p>` : ''}`);
  }
  function renderTrends() {
    const summary = I.observationSummary(state.days, selectedDate, trendPeriod);
    const trend = I.historySummary(state.days, selectedDate, state.profile?.goal);
    const weightConnection = I.coachingConnections(state, selectedDate).connections.find(row => row.kind === 'weight-training');
    if (weightConnection) trend.trendMessage = weightConnection.body;
    const dates = summary.list.slice().reverse();
    const nutrientNames = { kcal: '열량', protein: '단백질', carbs: '탄수화물', fat: '지방' };
    const bodyNames = { weightKg: '체중 (kg)', bodyFatPct: '체지방률 (%)', skeletalMuscleKg: '골격근량 (kg)' };
    $('trendsContent').innerHTML = `<section class="section"><div class="section-header"><div><span class="section-kicker">${summary.from} ~ ${summary.to}</span><h2>기록한 만큼 살펴보기</h2></div><div class="inline-fields"><label class="field"><span>기간</span><select id="trendPeriod">${[7, 14, 28, 42].map(value => `<option value="${value}" ${trendPeriod === value ? 'selected' : ''}>${value}일</option>`).join('')}</select></label><label class="field"><span>마지막 날짜</span><input id="trendsDate" type="date" value="${selectedDate}" min="1900-02-12" max="${I.dateKey()}"></label></div></div><div class="metrics-grid">${metric('완료한 식사', summary.completed.length, '일', `목표 비교 ${summary.paired.length}일`)}${metric('기록 중', summary.openCount, '일', '평균 비교에서 제외')}${metric('미기록', summary.missingCount, '일', '섭취 0으로 세지 않음')}${metric('최근 주간 체중 중앙값', trend.laterWeight, 'kg', '선택일 기준 최근 7일', 'metric-energy')}</div></section><section class="section"><div class="section-header"><h2>섭취와 당시 목표</h2><label class="field"><span class="sr-only">그래프 영양소</span><select id="intakeMetric">${Object.entries(nutrientNames).map(([key, label]) => `<option value="${key}" ${intakeMetric === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><p class="form-help">완료한 날 중 목표가 함께 저장된 ${summary.paired.length}일의 관찰이에요.${summary.withoutTargetCount ? ` 목표 없는 완료 ${summary.withoutTargetCount}일은 비교에서 제외했어요.` : ''}${summary.goalCount > 1 ? ' 목표가 다른 날도 포함되어 각 날짜의 당시 목표와 비교해요.' : ''}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>하루 평균</th><th>섭취</th><th>당시 목표</th><th>차이</th></tr></thead><tbody>${Object.entries(nutrientNames).map(([key, label]) => { const value = summary.averages[key], unit = key === 'kcal' ? 'kcal' : 'g'; return `<tr><th>${label}</th><td>${fmt(value.intake, 1)} ${unit}</td><td>${fmt(value.target, 1)} ${unit}</td><td>${value.difference > 0 ? '+' : ''}${fmt(value.difference, 1)} ${unit}</td></tr>`; }).join('')}</tbody></table></div><div class="chart-wrap"><canvas id="intakeChart" role="img" aria-label="완료한 날짜의 ${nutrientNames[intakeMetric]} 섭취와 저장 당시 목표. 아래 날짜별 표에서 값을 확인할 수 있습니다."></canvas></div><p class="form-help">초록은 섭취, 주황은 당시 목표예요. 목표와의 차이는 건강 점수나 다음 날 보상할 양이 아니에요.</p></section><section class="section"><div class="section-header"><h2>몸 상태 관찰</h2><label class="field"><span class="sr-only">몸 상태 항목</span><select id="bodyMetric">${Object.entries(bodyNames).map(([key, label]) => `<option value="${key}" ${bodyMetric === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><span class="badge">${summary.body[bodyMetric].length}회 측정</span><div class="chart-wrap"><canvas id="weightChart" role="img" aria-label="${bodyNames[bodyMetric]} 측정 관찰. 측정 날짜와 값은 아래 기록 표에 있습니다."></canvas></div><p class="form-help">${bodyMetric === 'weightKg' ? escape(trend.trendMessage) : '측정 방법·시간·수분 상태가 다르면 직접 비교하기 어려워요. 이 변화만으로 체지방 감소나 근육 성장을 확정하지 않아요.'}</p></section><section class="section"><div class="section-header"><h2>기간 내 날짜별 기록</h2><span class="muted">${dates.length}일</span></div>${dates.length ? `<div class="table-wrap"><table class="data-table history-table"><thead><tr><th scope="col">날짜</th><th scope="col">상태</th><th scope="col">체중 kg</th><th scope="col">체지방 % / 골격근 kg</th><th scope="col">측정 방식</th><th scope="col">섭취 / 목표 kcal</th><th scope="col">단백질 g</th><th scope="col">탄수 g</th><th scope="col">지방 g</th></tr></thead><tbody>${dates.map(item => { const totals = I.mealTotals(item.meals), plan = item.complete ? item.planSnapshot : null; return `<tr><th scope="row"><button type="button" class="date-link" data-action="open-day" data-date="${item.date}">${escape(item.date)}</button></th><td>${item.complete ? '완료' : '기록 중'}</td><td>${fmt(item.weightKg, 1)}</td><td>${fmt(item.bodyFatPct, 1)} / ${fmt(item.skeletalMuscleKg, 1)}</td><td>${({ bia: 'BIA', dxa: 'DXA', caliper: '피하지방', unknown: '미확인' })[item.bodyFatMethod]}</td><td>${item.meals.length ? fmt(totals.kcal) : '미기록'} / ${fmt(plan?.energy?.targetKcal)}</td>${['protein', 'carbs', 'fat'].map(key => `<td>${item.meals.length ? fmt(totals[key], 1) : '미기록'} / ${fmt(plan?.macros?.[key]?.target, 1)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('chart-no-axes-combined')}<p>선택한 기간에 기록이 없어요.</p>${command('go-today', '오늘 기록하기', 'arrow-right')}</div>`}</section>`;
  }
  function drawChart() {
    if (view !== 'trends') return;
    const summary = I.observationSummary(state.days, selectedDate, trendPeriod);
    drawObservationChart('weightChart', [{ data: summary.body[bodyMetric], color: '#146857' }], summary);
    drawObservationChart('intakeChart', [
      { color: '#146857', data: summary.paired.map(item => ({ date: item.date, value: I.mealTotals(item.meals)[intakeMetric] })) },
      { color: '#b36a34', data: summary.paired.map(item => ({ date: item.date, value: intakeMetric === 'kcal' ? item.planSnapshot.energy.targetKcal : item.planSnapshot.macros[intakeMetric].target })) }
    ], summary);
  }
  function drawObservationChart(canvasId, series, summary) {
    const canvas = $(canvasId);
    if (!canvas) return;
    const values = series.flatMap(item => item.data.map(point => point.value));
    const width = Math.max(160, canvas.parentElement.clientWidth);
    const height = 230;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = '100%'; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.font = '12px "Malgun Gothic", sans-serif';
    if (!values.length) { ctx.fillStyle = '#62716e'; ctx.textAlign = 'center'; ctx.fillText('이 기간의 관찰값이 없어요', width / 2, height / 2); return; }
    const minimum = Math.floor(Math.min(...values) - 0.5), maximum = Math.ceil(Math.max(...values) + 0.5);
    const left = 48, right = width - 16, top = 20, bottom = height - 35;
    const start = Date.parse(summary.from + 'T12:00:00Z');
    const x = item => left + (Date.parse(item.date + 'T12:00:00Z') - start) / ((summary.period - 1) * 86400000) * (right - left);
    const y = item => bottom - (item.value - minimum) / (maximum - minimum) * (bottom - top);
    for (let step = 0; step <= 3; step++) {
      const pos = top + (bottom - top) * step / 3;
      ctx.strokeStyle = '#e3e9e6'; ctx.beginPath(); ctx.moveTo(left, pos); ctx.lineTo(right, pos); ctx.stroke();
      ctx.fillStyle = '#62716e'; ctx.textAlign = 'right'; ctx.fillText((maximum - (maximum - minimum) * step / 3).toFixed(1), left - 8, pos + 4);
    }
    series.forEach((line, index) => line.data.forEach(item => { ctx.beginPath(); ctx.fillStyle = line.color; if (index) ctx.fillRect(x(item) - 3, y(item) - 3, 6, 6); else { ctx.arc(x(item), y(item), 4, 0, Math.PI * 2); ctx.fill(); } }));
    ctx.fillStyle = '#62716e'; ctx.textAlign = 'left'; ctx.fillText(summary.from.slice(5).replace('-', '/'), left, height - 8);
    ctx.textAlign = 'right'; ctx.fillText(summary.to.slice(5).replace('-', '/'), right, height - 8);
  }
  function renderData() {
    const legacy = state.legacy;
    $('dataContent').innerHTML = `${blocked ? `<div class="notice notice-danger"><strong>기존 데이터 보호 중</strong><p>${loaded.warnings.map(escape).join(' ')}</p>${loaded.corruptedRaw ? command('corrupt-export', '보존된 원본 내보내기', 'download') : ''}</div>` : ''}<section class="section"><div class="section-header"><h2>내 기기에 저장된 기록</h2><span class="badge">로컬 저장</span></div><p class="muted">이 브라우저에만 저장돼요. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에는 전체 백업을 내려받아 주세요.</p><div class="facts-grid"><div><span class="muted">기록한 날짜</span><strong>${Object.keys(state.days).length}일</strong></div><div><span class="muted">마지막 저장</span><strong>${Object.keys(state.days).length || state.profile ? escape(new Date(state.updatedAt).toLocaleString('ko-KR')) : '아직 없음'}</strong></div></div><div class="form-actions">${command('export', '전체 백업 다운로드', 'download', blocked ? 'disabled' : '', true)}${command('import-select', '백업 불러오기', 'upload')}${command('csv-export', '기록 CSV 다운로드', 'file-down', !Object.keys(state.days).length ? 'disabled' : '')}</div><input id="backupFile" type="file" accept="application/json,.json" hidden><div id="importPreview"></div></section>${loaded.legacyAvailable && !legacy ? `<section class="section"><div class="section-header"><h2>이전 버전의 기록을 찾았어요</h2></div><p class="muted">원본을 보관함에 복사해 읽을 수 있어요. 기존 값과 저장 당시 점수는 새 기준으로 다시 계산하지 않아요.</p><div class="form-actions">${command('legacy-preview', '이전 기록 확인', 'archive')}</div></section>` : ''}${legacy ? `<section class="section"><div class="section-header"><h2>이전 기록 보관함</h2>${command('legacy-export', '이전 원본 내보내기', 'download')}</div><p class="form-help">${legacy.records.length}건 · 읽기 전용 · 저장 당시 값이에요. 이전 설정·운동 초안·체성분 원본도 전체 백업에 보존돼요.</p>${legacy.records.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>날짜</th><th>체중</th><th>섭취</th><th>당시 점수</th></tr></thead><tbody>${legacy.records.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map(item => `<tr><th>${escape(item.date)}</th><td>${fmt(item.weightKg, 1)}kg</td><td>${fmt(item.intake?.kcal)}kcal</td><td>${fmt(item.score)}</td></tr>`).join('')}</tbody></table></div>` : ''}${legacy.records.length > 100 ? '<p class="form-help">최근 100건을 표시해요. 전체 기록은 백업에 포함돼요.</p>' : ''}</section>` : ''}<section class="section"><div class="section-header"><h2>기록 초기화</h2></div><p class="muted">이 버전의 프로필과 기록을 지워요. 이전 버전의 브라우저 원본에는 영향을 주지 않아요.</p><div class="form-actions">${command('reset', '이 버전 초기화', 'trash-2')}</div></section>`;
    if (pendingImport) showImportPreview();
    $('dataContent').insertAdjacentHTML('afterbegin', trainingUI.connectionPanel());
    $('dataContent').querySelector('section.section > p.muted').textContent = '이 브라우저에 저장하며, PC 기록을 연결하면 개인 기록 폴더에도 함께 보관돼요. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에는 전체 백업을 내려받아 주세요.';
  }
  function render() {
    renderToday(); renderMealTools(day()); renderTrends(); renderData();
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
    profileActivityDraft = state.profile?.dailyActivity ? clone(state.profile.dailyActivity) : null;
    profileWeekdayDraft = clone(state.profile?.weekdayActivity || {});
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
    profile.dailyActivity = profileActivityDraft;
    profile.weekdayActivity = profileWeekdayDraft;
    $('profileActivityDetails').hidden = profile.activityMode !== 'detailed';
    $('profileDailyActivitySummary').textContent = `${activitySummary(profileActivityDraft)} · 요일 예외 ${Object.values(profileWeekdayDraft).filter(Boolean).length}개`;
    const plan = N.calculatePlan(profile, { date: I.dateKey(), sessions: [] }, []);
    $('profileSummary').innerHTML = `<span class="eyebrow">MY STARTING POINT</span><h2>${goal || '내 몸에 맞는 출발점'}</h2><dl><div><dt>현재 체중</dt><dd>${profile.weightKg == null ? '아직 모름' : `${fmt(profile.weightKg, 1)}kg`}</dd></div><div><dt>주로 하는 운동</dt><dd>${sport || '아직 모름'}</dd></div><div><dt>운동 경력</dt><dd>${profile.trainingYears == null ? '아직 모름' : `${fmt(profile.trainingYears, 1)}년`}</dd></div></dl>${plan.status === 'ready' ? `<div class="profile-estimate"><span>휴식일 섭취 시작 목표</span><strong>${fmt(plan.energy.targetKcal)}<small> kcal</small></strong><p>운동한 날은 실제 세션을 따로 반영해요.</p></div>` : '<div class="profile-estimate"><span>먼저 알아야 할 것</span><p>체중뿐 아니라 일상 활동과 운동, 목표를 함께 봐요. 정보가 모이면 시작 목표를 살펴볼 수 있어요.</p></div>'}<p class="form-help">모르는 값은 추측해 넣지 않아도 돼요. 숫자는 시작점이고, 이후 몸의 변화와 컨디션으로 함께 확인해요.</p>`;
  }
  function activitySummary(value) {
    if (!value) return '생활 시간 미입력';
    return `수면 ${fmt(value.sleepHours, 1)}h · 업무 ${fmt(value.workHours, 1)}h · 생활 ${fmt(value.lifestyleHours, 1)}h`;
  }
  function activityFields(value) {
    const work = [['', '선택'], ['seated', '주로 앉아서 하는 업무'], ['standing', '서서 가볍게 이동·물건 옮김'], ['physical', '실제로 계속 몸을 쓰는 작업']];
    const lifestyle = [['', '선택'], ['light', '요리·가벼운 집안 활동'], ['active', '걷기 등 활동적인 생활']];
    const select = (name, label, options) => `<label class="field"><span>${label}</span><select name="${name}">${options.map(([key, text]) => `<option value="${key}" ${value?.[name] === key ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    return `<div class="form-grid">${field('수면 시간', 'sleepHours', value?.sleepHours ?? '', { max: 24, required: true })}${field('업무 시간', 'workHours', value?.workHours ?? '', { max: 24, required: true })}${select('workType', '업무 중 활동', work)}${field('업무 외 생활활동 시간', 'lifestyleHours', value?.lifestyleHours ?? '', { max: 24, required: true })}${select('lifestyleType', '생활활동 종류', lifestyle)}</div>`;
  }
  function readActivity(form, required = true) {
    const value = Object.fromEntries(['sleepHours', 'workHours', 'lifestyleHours'].map(key => [key, readNumber(form, key, !required)]));
    value.workType = form.get('workType') || null; value.lifestyleType = form.get('lifestyleType') || null;
    if (required && ((value.workHours > 0 && !value.workType) || (value.lifestyleHours > 0 && !value.lifestyleType))) throw new Error('시간을 입력한 활동의 종류도 선택해 주세요. 하지 않은 활동만 0시간입니다.');
    if (Object.values(value).some(item => typeof item === 'number' && (item < 0 || item > 24))) throw new Error('활동 시간은 0~24시간으로 입력해 주세요.');
    const sum = value.sleepHours + value.workHours + value.lifestyleHours;
    if (required && sum > 24) throw new Error('수면·업무·생활 시간 합계가 24시간을 넘어요. 겹친 시간을 확인해 주세요.');
    return value;
  }
  function profileActivityDialog() {
    let scope = 'default';
    const working = { default: clone(profileActivityDraft), ...clone(profileWeekdayDraft) };
    openDialog('생활 시간과 요일', `<label class="field"><span>적용할 날</span><select id="activityScope" name="scope"><option value="default">기본값</option>${['일', '월', '화', '수', '목', '금', '토'].map((name, index) => `<option value="${index}">${name}요일${working[index] ? ' · 예외 있음' : ''}</option>`).join('')}</select></label><div id="activityEditor">${activityFields(working.default)}</div><p class="form-help">업무·생활·운동은 서로 겹치지 않는 시간으로 적어요. 실제 운동은 날짜별로 따로 반영하며, 남은 시간은 가벼운 휴식으로 계산합니다. 개인의 측정 소모량은 아닙니다.</p><label class="checkbox-field" id="activityReset" hidden><input name="resetWeekday" type="checkbox">이 요일은 기본값 사용</label>${actions('입력한 생활 시간 유지')}`, form => {
      if (scope !== 'default' && form.get('resetWeekday') === 'on') delete working[scope]; else working[scope] = readActivity(form);
      profileActivityDraft = working.default;
      profileWeekdayDraft = Object.fromEntries(Object.entries(working).filter(([key]) => key !== 'default'));
      profileDirty = true; renderProfileSummary(); $('profileSaveNote').textContent = '생활 시간 변경도 내 기준 저장 후 반영됩니다.'; closeDialog();
    });
    const form = $('entryForm');
    $('activityScope').addEventListener('change', event => {
      try {
        const current = new FormData(form);
        if (current.get('resetWeekday') === 'on') delete working[scope]; else working[scope] = readActivity(current, false);
        scope = event.target.value;
        $('activityEditor').innerHTML = activityFields(working[scope] || working.default);
        $('activityReset').hidden = scope === 'default'; form.elements.resetWeekday.checked = false;
      } catch (error) { event.target.value = scope; toast(error.message, true); }
    });
    form.elements.resetWeekday.addEventListener('change', event => {
      $('activityEditor').querySelectorAll('input,select').forEach(input => { input.disabled = event.target.checked; });
    });
  }
  function dayActivityDialog() {
    const weekday = new Date(selectedDate + 'T00:00:00Z').getUTCDay();
    const inherited = state.profile?.weekdayActivity?.[weekday] || state.profile?.dailyActivity;
    openDialog('이 날의 생활 시간', `<p class="form-help">${selectedDate} · ${day().dailyActivity ? '이 날짜의 별도 입력' : '기본·요일 설정'}</p>${activityFields(day().dailyActivity || inherited)}<p class="form-help">실제 운동 ${fmt(day().sessions.reduce((sum, row) => sum + row.durationMin, 0) / 60, 1)}시간과 합쳐 24시간을 넘지 않아야 합니다.</p>${day().dailyActivity ? command('day-activity-reset', '기본·요일 설정으로', 'rotate-ccw') : ''}${actions('이 날짜에 저장')}`, form => {
      const dailyActivity = readActivity(form);
      if (dailyActivity.sleepHours + dailyActivity.workHours + dailyActivity.lifestyleHours + day().sessions.reduce((sum, row) => sum + row.durationMin / 60, 0) > 24) throw new Error('생활 시간과 실제 운동을 합쳐 24시간을 넘어요. 겹친 시간을 확인해 주세요.');
      if (mutateDay(current => { current.dailyActivity = dailyActivity; }, '이 날짜의 생활 시간을 반영했어요.')) closeDialog();
    });
  }
  function allocationSuggestionDialog() {
    const basePlan = N.calculatePlan(effectiveProfile(), day(), []), current = planFor();
    const suggestion = I.suggestAllocation(state.days, selectedDate, basePlan, state.profile?.goal);
    const proposed = suggestion.status === 'ready' ? N.adjustAllocation(basePlan, suggestion.deltaG) : null;
    openDialog('기록에서 본 탄수·지방 배분', `<p>${escape(suggestion.reason)}</p>${proposed ? `<div class="conflict-comparison"><section><h3>현재 배분</h3><p>탄수 ${fmt(current.macros.carbs.target)}g · 지방 ${fmt(current.macros.fat.target)}g</p></section><section><h3>기록 선호를 참고한 배분</h3><p>탄수 ${fmt(proposed.macros.carbs.target)}g · 지방 ${fmt(proposed.macros.fat.target)}g</p></section></div><p class="form-help">총열량 ${fmt(proposed.energy.targetKcal)}kcal와 단백질 ${fmt(proposed.macros.protein.target)}g은 그대로입니다. 관찰한 식사 비율이지 최적 영양 처방은 아닙니다.</p><details class="source-details"><summary>참고한 완료 날짜 ${suggestion.count}일</summary><p>${suggestion.dates.join(' · ')}</p></details>${actions('이 배분 선택')}` : `<div class="form-actions">${command('dialog-close', '닫기', 'x')}</div>`}`, () => {
      if (!proposed) return;
      const latestBase = N.calculatePlan(effectiveProfile(), day(), []);
      if (day().complete || JSON.stringify(latestBase) !== JSON.stringify(basePlan)) throw new Error('미리보기 이후 계산 기준이 달라졌어요. 제안을 다시 확인해 주세요.');
      if (mutateDay(current => { current.carbAdjustmentG = suggestion.deltaG; }, '열량과 단백질을 유지한 배분을 선택했어요.')) closeDialog();
    });
  }
  function checkinDialog() {
    const value = day().coachCheckin || {};
    const choices = { energy: [['low', '많이 지침'], ['okay', '보통'], ['good', '좋음']], hunger: [['low', '별로 없음'], ['okay', '보통'], ['high', '많이 배고픔']], sleep: [['poor', '잘 못 잠'], ['okay', '보통'], ['good', '잘 잠']] };
    const selects = { trainingPlan: [['rest', '오늘은 쉬기로 했어요'], ['planned', '아직 할 운동이 있어요']], mealConstraint: [['none', '특별한 어려움 없음'], ['busy', '바빠서 챙겨 먹기 어려움'], ['low-appetite', '입맛이 없어 먹기 어려움'], ['digestive', '속이 불편해서 먹기 어려움']], performance: [['down', '평소보다 떨어짐'], ['steady', '평소와 비슷함'], ['up', '평소보다 좋아짐']] };
    const recoveryChoices = { fatigue: ['피로', [['low', '적음'], ['usual', '평소 정도'], ['high', '많음']]], illness: ['질병·몸살 등', [['none', '현재 아프지 않음'], ['active', '현재 아픈 상태'], ['recovering', '아팠다가 회복 중']]], pain: ['현재 통증', [['none', '없음'], ['mild', '있음 · 확인 필요'], ['stop', '운동을 멈춰야 함']]], interruptionReason: ['최근 운동을 쉬었던 이유', [['travel', '여행·출장'], ['illness', '질병'], ['schedule', '일정'], ['planned-break', '계획한 휴식'], ['other', '다른 이유']]] };
    openDialog('오늘 몸은 어때요?', `<p class="form-help">지금 느끼는 상태를 알려주세요. 모르는 항목은 비워두셔도 돼요.</p><div class="checkin-fields">${Object.entries(choices).map(([key, options], index) => `<fieldset><legend>${['에너지와 피로', '허기', '지난밤 수면'][index]}</legend><div class="checkin-options">${[['', '아직 모름'], ...options].map(([id, label]) => `<label><input type="radio" name="${key}" value="${id}" ${(!value[key] && !id) || value[key] === id ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></fieldset>`).join('')}</div><details class="checkin-more"><summary>오늘의 계획과 식사 여건도 알려주기</summary><div class="form-grid">${Object.entries(selects).map(([key, options], index) => `<label class="field ${index === 1 ? 'full-width' : ''}"><span>${['앞으로 할 운동', '식사를 챙기는 여건', '최근 운동 수행'][index]}</span><select name="${key}"><option value="">아직 모름</option>${options.map(([id, label]) => `<option value="${id}" ${value[key] === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}</div></details><details class="checkin-more"><summary>수면 시간·통증·회복 상태</summary><div class="form-grid">${field('실제로 잔 시간 · 지난밤 (시간)', 'sleepHours', value.sleepHours ?? '', { max: 24, step: 0.1 })}${Object.entries(recoveryChoices).map(([key, [label, options]]) => `<label class="field"><span>${label} · 선택</span><select name="${key}"><option value="">선택 안 함</option>${options.map(([id, label]) => `<option value="${id}" ${value[key] === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}</div></details>${actions('코치에게 알려주기')}`, form => {
      const checkin = Object.fromEntries(['energy', 'hunger', 'sleep', 'trainingPlan', 'mealConstraint', 'performance'].map(key => [key, form.get(key) || null]));
      for (const key of Object.keys(recoveryChoices)) if (form.get(key)) checkin[key] = String(form.get(key));
      const sleepHours = readNumber(form, 'sleepHours', true);
      if (sleepHours !== null) checkin.sleepHours = sleepHours;
      if (!Object.values(checkin).some(value => value !== null)) throw new Error('오늘 느끼는 상태나 여건을 한 가지 이상 알려주세요.');
      if (mutateDay(current => { current.coachCheckin = checkin; }, '오늘 상태를 저장하고 코칭에 반영했어요.')) closeDialog();
    });
    $('entryForm').elements.sleepHours.step = 'any';
  }
  function field(label, name, value = '', options = {}) {
    return `<label class="field"><span>${label}</span><input name="${name}" type="${options.type || 'number'}" ${options.type === 'text' ? 'maxlength="200"' : `min="${options.min ?? 0}" max="${options.max ?? 1000}" step="${options.step ?? 0.1}" inputmode="decimal"`} value="${escape(value)}" ${options.required ? 'required' : ''}></label>`;
  }
  function openDialog(title, content, onSubmit) {
    $('entryDialog').classList.remove('dialog-wide');
    dialogReturnFocus = document.activeElement;
    $('dialogContent').innerHTML = `<div class="dialog-header"><h2 id="dialogTitle">${title}</h2>${iconButton('dialog-close', '닫기', 'x')}</div><form id="entryForm">${content}<div id="entryErrors" class="notice notice-danger" role="alert" hidden></div></form>`;
    $('entryDialog').setAttribute('aria-labelledby', 'dialogTitle');
    let submitting = false;
    $('entryForm').addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting) return;
      const form = event.target, data = new FormData(form), submit = form.querySelector('[type="submit"]'), label = submit?.querySelector('span');
      const original = label?.textContent;
      submitting = true; form.setAttribute('aria-busy', 'true');
      if (submit) submit.disabled = true;
      if (label) label.textContent = '처리 중…';
      try { await onSubmit(data, form); }
      catch (error) {
        const errors = form.querySelector('#entryErrors');
        if (form.isConnected && $('entryDialog').open) { errors.hidden = false; errors.textContent = error.message; errors.tabIndex = -1; errors.focus(); }
        else toast(error.message, true);
      } finally {
        submitting = false; form.removeAttribute('aria-busy');
        if (submit) submit.disabled = false;
        if (label) label.textContent = original;
      }
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
    const meal = existing || { name: '', protein: '', carbs: '', fat: '', otherKcal: 0, alcoholG: 0 };
    openDialog(copy ? '최근 식사 가져오기' : existing ? '식사 수정' : '식사 추가', `<div class="form-grid">${field('식사 이름', 'name', meal.name, { type: 'text', required: true })}${field('단백질 (g)', 'protein', meal.protein, { required: true })}${field('탄수화물 (g)', 'carbs', meal.carbs, { required: true })}${field('지방 (g)', 'fat', meal.fat, { required: true })}</div><details class="source-details"><summary>기타 열량·술</summary><div class="form-grid">${field('탄단지·알코올 외 열량 (kcal)', 'otherKcal', meal.otherKcal, { max: 10000, required: true })}${field('순알코올 (g)', 'alcoholG', meal.alcoholG, { max: 500, required: true })}</div><p class="form-help">알코올은 1g당 7kcal로 별도 합산해요. 술의 탄수화물과 안주는 각 영양소에 기록해 주세요.</p></details><p id="mealPreview" class="notice notice-info"></p>${actions()}`, form => {
      const entry = { id: existing && !copy ? existing.id : id(), name: String(form.get('name')).trim(), protein: readNumber(form, 'protein'), carbs: readNumber(form, 'carbs'), fat: readNumber(form, 'fat'), otherKcal: readNumber(form, 'otherKcal'), alcoholG: readNumber(form, 'alcoholG') };
      if (form.get('type')) entry.type = String(form.get('type'));
      if (String(form.get('note') || '').trim()) entry.note = String(form.get('note')).trim();
      if (meal.source) entry.source = clone(meal.source);
      if (!entry.name || I.mealTotals([entry]).kcal <= 0) throw new Error('식사 이름과 먹은 양을 입력해 주세요.');
      if (mutateDay(current => { const index = current.meals.findIndex(item => item.id === entry.id); if (index < 0) current.meals.push(entry); else current.meals[index] = entry; }, '식사를 저장했어요.', { date: selectedDate, type: existing && !copy ? 'meal-updated' : 'meal-added', mealId: entry.id })) closeDialog();
    });
    $('entryForm').querySelector('.form-grid').insertAdjacentHTML('beforeend', `<label class="field"><span>식사 구분</span><select name="type"><option value="">선택하지 않음</option>${Object.entries(mealTypes).map(([key, label]) => `<option value="${key}" ${meal.type === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field full-width"><span>식사 메모</span><textarea name="note" rows="2" maxlength="4000">${escape(meal.note || '')}</textarea></label>`);
    $('entryForm').querySelector('details').insertAdjacentHTML('beforeend', `<div class="form-grid">${field('술 한 개의 양 (ml)', 'alcoholVolume', '', { max: 10000 })}${field('도수 (%)', 'alcoholAbv', '', { max: 100 })}${field('마신 개수', 'alcoholCount', '', { max: 100, step: 0.1 })}</div><div class="form-actions">${command('alcohol-calculate', '순알코올 g 계산', 'calculator')}</div><p id="alcoholCalculation" class="form-help" role="status"></p>`);
    $('entryForm').elements.alcoholG.step = 'any';
    $('entryForm').querySelector('[data-action="alcohol-calculate"]').addEventListener('click', () => {
      try {
        const form = new FormData($('entryForm'));
        const grams = I.alcoholGrams(readNumber(form, 'alcoholVolume'), readNumber(form, 'alcoholAbv'), readNumber(form, 'alcoholCount'));
        if (grams === null || grams > 500) throw new Error('술의 양·도수·개수를 확인해 주세요. 계산한 순알코올은 500g 이하여야 해요.');
        $('entryForm').elements.alcoholG.value = (Math.round(grams * 100) / 100).toString();
        $('alcoholCalculation').textContent = `${fmt(grams, 2)}g을 입력했어요. 실제 마신 양과 도수를 확인한 뒤 저장해 주세요.`;
        update();
      } catch (error) { toast(error.message, true); }
    });
    const update = () => {
      const form = new FormData($('entryForm')), numbers = {};
      for (const key of ['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG']) {
        const raw = String(form.get(key) ?? '').trim(), value = Number(raw);
        if (!raw || !Number.isFinite(value) || value < 0) { $('mealPreview').textContent = '빈 영양소가 있어 총열량을 아직 계산하지 않았어요. 실제로 없는 항목만 0으로 입력해 주세요.'; return; }
        numbers[key] = value;
      }
      $('mealPreview').textContent = `총 ${fmt(I.mealTotals([numbers]).kcal)}kcal`;
    };
    $('entryForm').addEventListener('input', update); update(); icons();
  }
  function saveMealTemplate(meal) {
    if (!meal) return;
    openDialog('자주 먹는 식사 저장', `${field('저장 이름', 'title', meal.name, { type: 'text', required: true })}<p class="form-help">${escape(meal.name)} · ${fmt(I.mealTotals([meal]).kcal)}kcal · 단 ${fmt(meal.protein, 1)} / 탄 ${fmt(meal.carbs, 1)} / 지 ${fmt(meal.fat, 1)}g</p>${actions('저장')}`, form => {
      const next = clone(state);
      next.mealTemplates ||= [];
      next.mealTemplates.push({ id: id(), title: String(form.get('title')).trim(), meal: clone(meal) });
      if (save(next, '자주 먹는 식사에 저장했어요.')) closeDialog();
    });
  }
  function mealTemplatesDialog() {
    const templates = state.mealTemplates || [];
    openDialog('자주 먹는 식사', `${templates.length ? `<ul class="item-list">${templates.map(template => `<li class="item-row"><div class="item-main"><strong>${escape(template.title)}</strong><p>${escape(template.meal.name)} · ${fmt(I.mealTotals([template.meal]).kcal)}kcal</p><small>단 ${fmt(template.meal.protein, 1)} / 탄 ${fmt(template.meal.carbs, 1)} / 지 ${fmt(template.meal.fat, 1)}g</small></div><div class="item-actions">${iconButton('meal-template-use', `${escape(template.title)} 가져오기`, 'plus', `data-id="${escape(template.id)}"`)}${iconButton('meal-template-delete', `${escape(template.title)} 저장 목록에서 삭제`, 'trash-2', `data-id="${escape(template.id)}"`)}</div></li>`).join('')}</ul>` : '<p class="empty-state">식사 기록 옆 북마크 버튼으로 자주 먹는 식사를 저장해 보세요.</p>'}<div class="form-actions">${command('dialog-close', '닫기', 'x')}</div>`, () => {});
  }
  function previousDayDialog() {
    const previousDate = I.shiftDate(selectedDate, -1);
    const rows = I.copyMealPreview(state.days[previousDate]?.meals || [], day().meals);
    if (!rows.length) return;
    openDialog('전날 식사 가져오기', `<p class="form-help">${previousDate}에서 ${selectedDate}로 선택한 식사만 추가해요. 같은 내용이 있는 항목은 직접 선택해 주세요.</p><ul class="item-list">${rows.map((row, index) => `<li class="item-row"><label class="item-main"><input type="checkbox" name="copyMeal" value="${index}" ${row.possibleDuplicate ? '' : 'checked'}> <strong>${escape(row.meal.name)}</strong><p>${fmt(I.mealTotals([row.meal]).kcal)}kcal · 단 ${fmt(row.meal.protein, 1)} / 탄 ${fmt(row.meal.carbs, 1)} / 지 ${fmt(row.meal.fat, 1)}g${row.possibleDuplicate ? ' · 오늘 같은 내용 있음' : ''}</p>${row.meal.note ? `<small>${escape(row.meal.note)}</small>` : ''}</label></li>`).join('')}</ul>${actions('선택한 식사 추가')}`, form => {
      const selected = form.getAll('copyMeal').map(value => rows[Number(value)]?.meal).filter(Boolean);
      if (!selected.length) throw new Error('추가할 식사를 하나 이상 선택해 주세요.');
      if (day().complete) throw new Error('완료한 날짜는 먼저 다시 열어 주세요.');
      if (mutateDay(current => current.meals.push(...selected.map(meal => ({ ...clone(meal), id: id() }))), `${selected.length}개 식사를 추가했어요.`)) closeDialog();
    });
  }
  function dayNoteDialog() {
    const current = day();
    openDialog('하루 메모', `<label class="field"><span>${selectedDate}</span><textarea name="note" rows="6" maxlength="8000" ${current.complete ? 'readonly' : ''}>${escape(current.note || '')}</textarea></label>${current.complete ? `<div class="form-actions">${command('dialog-close', '닫기', 'x')}</div>` : actions()}`, form => {
      if (day().complete) return;
      if (mutateDay(item => { item.note = String(form.get('note') || '').trim(); }, '하루 메모를 저장했어요.')) closeDialog();
    });
  }
  function optionalSelect(name, label, values, value = '') {
    return `<label class="field"><span>${label}</span><select name="${name}"><option value="">선택 안 함</option>${Object.entries(values).map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`;
  }
  function activityDetailFields(session) {
    const value = session.details || {}, distanceUnit = session.sport === 'swimming' ? 'm' : 'km', distanceFactor = distanceUnit === 'm' ? 1 : 1000;
    return `<details id="activityDetails" class="source-details activity-details"><summary>상세 기록 · 선택</summary><div class="form-grid">${field('구체적인 종목·훈련 이름', 'activity-label', value.label || '', { type: 'text' })}${optionalSelect('activity-format', '훈련 구성', activityFormats, value.format)}${optionalSelect('activity-intent', '오늘의 목적', activityIntents, value.intent)}<label class="field activity-distance-field"><span id="activityDistanceLabel">거리 (${distanceUnit})</span><input name="activity-distance" type="number" min="0" max="1000000" step="any" inputmode="decimal" value="${value.distanceM == null ? '' : value.distanceM / distanceFactor}"></label>${field('실제로 움직인 시간 (분)', 'activity-movingMin', value.movingMin ?? '', { max: 1440, step: 0.1 })}${field('전체 체감 강도 · RPE 1–10', 'activity-effortRpe', value.effortRpe ?? '', { min: 1, max: 10, step: 0.5 })}${field('평균 심박수 (bpm)', 'activity-avgHeartRateBpm', value.avgHeartRateBpm ?? '', { min: 30, max: 240, step: 1 })}<div class="activity-power-field">${field('평균 파워 (W)', 'activity-avgPowerW', value.avgPowerW ?? '', { max: 3000, step: 1 })}</div>${field('코스·수영장·경기장 이름', 'activity-routeKey', value.routeKey || '', { type: 'text' })}${field('사용한 기구·장비', 'activity-equipmentKey', value.equipmentKey || '', { type: 'text' })}${optionalSelect('activity-environment', '운동 환경', activityEnvironments, value.environment)}${optionalSelect('activity-conditions', '운동할 때의 조건', activityConditions, value.conditions)}<div class="activity-swimming-fields">${field('영법·수영 구성', 'activity-stroke', value.stroke || '', { type: 'text' })}${field('수영장 길이 (m)', 'activity-poolLengthM', value.poolLengthM ?? '', { min: 10, max: 100, step: 1 })}</div><label class="field full-width"><span>운동 메모</span><textarea name="activity-notes" rows="2" maxlength="4000">${escape(value.notes || '')}</textarea></label></div><div class="activity-segments-section"><div class="section-header"><h3>종목별 구간</h3>${command('activity-segment-add', '구간 추가', 'plus')}</div><label class="checkbox-field"><input type="checkbox" name="activity-sequenceConfirmed" ${value.sequenceConfirmed ? 'checked' : ''}>아래 구간 순서대로 수행했어요.</label><div id="activitySegments"></div></div></details>`;
  }
  function activitySegmentFields(index, segment = {}) {
    const prefix = `segment-${index}-`;
    return `<fieldset class="activity-segment" data-segment-index="${index}"><legend>구간 ${index + 1}</legend><div class="activity-segment-heading">${field('구간 이름', prefix + 'label', segment.label || '', { type: 'text', required: true })}${iconButton('activity-segment-remove', '이 구간 삭제', 'trash-2', `data-segment-index="${index}"`)}</div><div class="form-grid">${optionalSelect(prefix + 'kind', '구간 종목', segmentKinds, segment.kind)}${field('구간 시간 (분)', prefix + 'durationMin', segment.durationMin ?? '', { max: 1440, step: 0.1 })}${field('구간 거리 (m)', prefix + 'distanceM', segment.distanceM ?? '', { max: 1000000, step: 1 })}<div class="activity-segment-strength-fields">${field('실제 반복 수', prefix + 'reps', segment.reps ?? '', { max: 100000, step: 1 })}${field('실제 부하 (kg)', prefix + 'loadKg', segment.loadKg ?? '', { max: 2000, step: 0.1 })}</div></div></fieldset>`;
  }
  function activitySummaryHTML(session) {
    const value = session.details;
    if (!value) return '';
    const metrics = [];
    if (value.distanceM !== null && typeof value.distanceM === 'number') metrics.push(session.sport === 'swimming' ? `${activityNumber(value.distanceM)}m` : `${activityNumber(value.distanceM / 1000)}km`);
    if (typeof value.movingMin === 'number') metrics.push(`이동 ${activityNumber(value.movingMin)}분`);
    if (typeof value.effortRpe === 'number') metrics.push(`RPE ${activityNumber(value.effortRpe)}`);
    if (typeof value.avgHeartRateBpm === 'number') metrics.push(`${activityNumber(value.avgHeartRateBpm)}bpm`);
    if (typeof value.avgPowerW === 'number') metrics.push(`${activityNumber(value.avgPowerW)}W`);
    metrics.push(...activityContextText(value));
    const segments = activitySegmentText(value);
    return `${metrics.length ? `<p class="form-help activity-record-metrics">${metrics.map(escape).join(' · ')}</p>` : ''}${segments.length || value.notes ? `<details class="activity-record-details"><summary>${segments.length ? `구간 ${segments.length}개` : '운동 메모'}</summary>${segments.map(segment => `<p>${segment}</p>`).join('')}${value.notes ? `<p>${escape(value.notes)}</p>` : ''}</details>` : ''}`;
  }
  function activityContextText(value = {}) {
    return [activityFormats[value.format], activityIntents[value.intent], value.routeKey, value.equipmentKey,
      activityEnvironments[value.environment], activityConditions[value.conditions], value.stroke,
      typeof value.poolLengthM === 'number' ? `${activityNumber(value.poolLengthM)}m 풀` : ''].filter(Boolean);
  }
  function activitySegmentText(value = {}) {
    return value.segments?.map(segment => [segment.label,
      typeof segment.durationMin === 'number' ? `${activityNumber(segment.durationMin)}분` : '',
      typeof segment.distanceM === 'number' ? `${activityNumber(segment.distanceM)}m` : '',
      typeof segment.reps === 'number' ? `${activityNumber(segment.reps)}회` : '',
      typeof segment.loadKg === 'number' ? `${activityNumber(segment.loadKg)}kg` : ''].filter(Boolean).map(escape).join(' · ')) || [];
  }
  function sessionDialog(existing = null, preset = null) {
    const session = existing || (preset ? reusableActivity(preset) : null) || { sport: state.profile?.sport === 'none' || !state.profile ? 'walking' : state.profile.sport, durationMin: 30, intensity: 'moderate' };
    const segments = (session.details?.segments || []).map((segment, index) => ({ index, id: segment.id, segment }));
    let nextSegmentIndex = segments.length, distanceFactor = session.sport === 'swimming' ? 1 : 1000;
    const cardioFields = `<details id="cardioOptions" class="source-details" ${session.cardio ? 'open' : ''}>
      <summary>걷기·달리기 속도와 경사</summary><label class="checkbox-field"><input type="checkbox" name="useCardio" ${session.cardio ? 'checked' : ''}>속도·경사로 추정하기</label>
      <div class="form-grid"><label class="field"><span>환경</span><select name="environment"><option value="treadmill">트레드밀</option><option value="outdoor">야외 평지</option></select></label>
      ${field('속도 (km/h)', 'speedKmh', session.cardio?.speedKmh ?? '', { min: 0, max: 30 })}${field('경사 (%)', 'gradePct', session.cardio?.gradePct ?? '', { min: 0, max: 20 })}</div>
      <p class="form-help">걷기 3~6km/h, 달리기 8.1~20km/h, 트레드밀 경사 0~15% 안에서 식을 적용해요. 그 밖은 상세 추정을 끄고 강도로 기록해 주세요. 평지는 경사 0%를 입력합니다. 야외는 평지만 지원해요. 손잡이 지지·바람은 반영하지 못합니다.</p></details>`;
    openDialog(existing ? '운동 수정' : '운동 추가', `<div class="form-grid"><label class="field"><span>운동 종목</span><select name="sport">${Object.entries(sportNames).filter(([key]) => key !== 'none').map(([key, label]) => `<option value="${key}" ${session.sport === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('전체 운동 시간 (분)', 'durationMin', session.durationMin, { min: 1, max: 720, step: 1, required: true })}<label class="field"><span>강도</span><select name="intensity">${Object.entries(intensityNames).map(([key, label]) => `<option value="${key}" ${session.intensity === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${activityDetailFields(session)}${cardioFields}<p class="form-help">실제로 한 전체 세션 시간을 적어 주세요. 구간을 나눠도 소모량에는 전체 시간을 한 번만 반영합니다.</p>${actions()}`, form => {
      const entry = { ...existing, id: existing?.id || id(), sport: String(form.get('sport')), durationMin: readNumber(form, 'durationMin'), intensity: String(form.get('intensity')) };
      const details = {};
      for (const key of ['label', 'intent', 'format', 'routeKey', 'equipmentKey', 'environment', 'conditions', 'stroke', 'notes']) {
        const value = String(form.get(`activity-${key}`) || '').trim();
        if (value) details[key] = value;
      }
      const distance = readNumber(form, 'activity-distance', true);
      if (distance !== null) details.distanceM = distance * distanceFactor;
      for (const key of ['movingMin', 'effortRpe', 'avgHeartRateBpm', 'avgPowerW', 'poolLengthM']) {
        if (!form.has(`activity-${key}`)) continue;
        const value = readNumber(form, `activity-${key}`, true);
        if (value !== null) details[key] = value;
      }
      if (details.movingMin > entry.durationMin) throw new Error('실제로 움직인 시간은 전체 세션 시간을 넘을 수 없어요.');
      const recordedSegments = segments.map(row => {
        const prefix = `segment-${row.index}-`, segment = { id: row.id, label: String(form.get(prefix + 'label') || '').trim() };
        if (!segment.label) throw new Error('추가한 구간의 이름을 적거나 사용하지 않는 구간을 삭제해 주세요.');
        if (form.get(prefix + 'kind')) segment.kind = String(form.get(prefix + 'kind'));
        for (const key of ['durationMin', 'distanceM', 'reps', 'loadKg']) {
          if (!form.has(prefix + key)) continue;
          const value = readNumber(form, prefix + key, true);
          if (value !== null) segment[key] = value;
        }
        return segment;
      });
      if (recordedSegments.length) details.segments = recordedSegments;
      if (form.get('activity-sequenceConfirmed') === 'on') details.sequenceConfirmed = true;
      if (Object.keys(details).length) entry.details = details; else delete entry.details;
      if (['walking', 'running'].includes(entry.sport) && form.get('useCardio') === 'on') entry.cardio = { environment: String(form.get('environment')), speedKmh: readNumber(form, 'speedKmh'), gradePct: readNumber(form, 'gradePct') };
      else delete entry.cardio;
      if (entry.cardio) {
        const range = N.CARDIO_LIMITS[entry.sport];
        if (entry.cardio.speedKmh < range.minSpeedKmh || entry.cardio.speedKmh > range.maxSpeedKmh || entry.cardio.gradePct > 15 || (entry.cardio.environment === 'outdoor' && entry.cardio.gradePct !== 0)) throw new Error('지원 범위 밖의 속도·경사입니다. 값이 맞다면 상세 추정을 끄고 강도 기반으로 기록해 주세요.');
      }
      if (state.profile?.activityMode === 'detailed') {
        const candidate = { ...day(), sessions: [...day().sessions.filter(row => row.id !== entry.id), entry] };
        const check = N.calculatePlan(effectiveProfile(), candidate, []);
        if (check.status === 'incomplete' && check.reasons.some(reason => /24시간/.test(reason))) throw new Error(check.reasons.join(' '));
      }
      if (mutateDay(current => { const index = current.sessions.findIndex(item => item.id === entry.id); if (index < 0) current.sessions.push(entry); else current.sessions[index] = entry; }, '운동을 저장하고 오늘 목표에 반영했어요.')) closeDialog();
    });
    const form = $('entryForm'); form.elements.environment.value = session.cardio?.environment || 'treadmill';
    form.elements.durationMin.max = '1440'; form.elements.durationMin.step = 'any';
    for (const key of ['movingMin', 'effortRpe', 'avgHeartRateBpm', 'avgPowerW', 'poolLengthM']) form.elements[`activity-${key}`].step = 'any';
    const update = () => {
      const supported = ['walking', 'running'].includes(form.elements.sport.value);
      $('cardioOptions').hidden = !supported;
      for (const key of ['speedKmh', 'gradePct']) { form.elements[key].disabled = !supported || !form.elements.useCardio.checked; form.elements[key].required = supported && form.elements.useCardio.checked; }
      const factor = form.elements.sport.value === 'swimming' ? 1 : 1000, distance = form.elements['activity-distance'];
      if (factor !== distanceFactor && distance.value.trim()) distance.value = String(Number(distance.value) * distanceFactor / factor);
      distanceFactor = factor; $('activityDistanceLabel').textContent = `거리 (${factor === 1 ? 'm' : 'km'})`;
      distance.max = String(1000000 / factor);
      const powerSupported = form.elements.sport.value === 'cycling';
      form.querySelector('.activity-power-field').hidden = !powerSupported; form.elements['activity-avgPowerW'].disabled = !powerSupported;
      const swimming = form.elements.sport.value === 'swimming'; form.querySelector('.activity-swimming-fields').hidden = !swimming;
      for (const key of ['stroke', 'poolLengthM']) form.elements[`activity-${key}`].disabled = !swimming;
    };
    const updateSegment = element => {
      const kind = element.querySelector('select').value, fields = element.querySelector('.activity-segment-strength-fields');
      const strength = ['strength', 'carry', 'other'].includes(kind) || [...fields.querySelectorAll('input')].some(input => input.value.trim());
      fields.hidden = !strength;
      fields.querySelectorAll('input').forEach(input => { input.disabled = !strength; });
      element.querySelectorAll('input[type="number"]').forEach(input => { if (!input.name.endsWith('-reps')) input.step = 'any'; });
    };
    for (const row of segments) $('activitySegments').insertAdjacentHTML('beforeend', activitySegmentFields(row.index, row.segment));
    $('activitySegments').querySelectorAll('.activity-segment').forEach(updateSegment);
    form.addEventListener('change', event => { if (event.target.closest('.activity-segment') && event.target.tagName === 'SELECT') updateSegment(event.target.closest('.activity-segment')); });
    form.querySelector('[data-action="activity-segment-add"]').addEventListener('click', () => {
      if (segments.length >= 20) { toast('한 세션에는 구간을 20개까지 남길 수 있어요.', true); return; }
      const index = nextSegmentIndex++, row = { index, id: id(), segment: {} }; segments.push(row);
      $('activitySegments').insertAdjacentHTML('beforeend', activitySegmentFields(index));
      const element = $('activitySegments').lastElementChild; updateSegment(element); icons(); element.querySelector('input').focus();
    });
    form.addEventListener('click', event => {
      const button = event.target.closest('[data-action="activity-segment-remove"]');
      if (!button) return;
      const element = button.closest('.activity-segment'), index = Number(element.dataset.segmentIndex), position = segments.findIndex(row => row.index === index);
      if (position < 0) return;
      segments.splice(position, 1); element.remove(); form.querySelector('[data-action="activity-segment-add"]').focus();
    });
    form.elements.sport.addEventListener('change', update); form.elements.useCardio.addEventListener('change', update); update();
  }
  function saveSessionPreset(session) {
    if (!session) return;
    openDialog('자주 하는 운동 저장', `${field('이름', 'title', `${session.details?.label || sportNames[session.sport]} ${session.durationMin}분`, { type: 'text', required: true })}${actions()}`, form => {
      const next = clone(state), value = reusableActivity(session);
      next.sessionPresets ||= []; next.sessionPresets.push({ id: id(), title: String(form.get('title')).trim(), session: value });
      if (save(next, '자주 하는 운동으로 저장했어요. 사용 시 실제 시간은 다시 확인해 주세요.')) closeDialog();
    });
  }
  function reusableActivity(session) {
    const value = { sport: session.sport, durationMin: session.durationMin, intensity: session.intensity };
    if (session.cardio) value.cardio = clone(session.cardio);
    const details = Object.fromEntries(['label', 'format', 'routeKey', 'equipmentKey', 'environment', 'stroke', 'poolLengthM'].filter(key => session.details?.[key] != null).map(key => [key, session.details[key]]));
    if (Object.keys(details).length) value.details = details;
    return value;
  }
  function sessionPresetsDialog() {
    openDialog('자주 하는 운동', `<ul class="item-list">${(state.sessionPresets || []).map(preset => `<li class="item-row"><div class="item-main"><strong>${escape(preset.title)}</strong><p class="form-help">${sportNames[preset.session.sport]} · ${fmt(preset.session.durationMin)}분</p></div><div class="item-actions">${iconButton('session-preset-use', '입력값 확인 후 사용', 'plus', `data-id="${escape(preset.id)}"`)}${iconButton('session-preset-delete', '목록에서 삭제', 'trash-2', `data-id="${escape(preset.id)}"`)}</div></li>`).join('')}</ul><div class="form-actions">${command('dialog-close', '닫기', 'x')}</div>`, () => {});
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
    if (current && !blocked) {
      const preview = S.previewMerge(state, imported);
      const labels = { added: '새 날짜 추가', identical: '같은 기록 · 유지', conflict: '내용 다름 · 현재 유지', protected: '완료한 날짜 · 현재 보호', 'id-conflict': '다른 날짜와 식별자 중복 · 제외' };
      const describe = value => value ? `${value.complete ? '완료' : '기록 중'} · 식사 ${value.meals.length}개 / ${fmt(I.mealTotals(value.meals).kcal)}kcal · 운동 ${value.sessions.length}개 · 체중 ${fmt(value.weightKg, 1)}kg · 체지방 ${fmt(value.bodyFatPct, 1)}% · 골격근 ${fmt(value.skeletalMuscleKg, 1)}kg${value.note ? ` · 메모: ${value.note}` : ''}` : '현재 기록 없음';
      $('importPreview').insertAdjacentHTML('afterbegin', `<section class="section"><h3>날짜별 기록 합치기</h3><p>새 날짜 ${preview.counts.added}일 · 같은 기록 ${preview.counts.identical}일 · 선택할 충돌 ${preview.counts.conflict}일 · 완료 보호 ${preview.counts.protected}일${preview.counts['id-conflict'] ? ` · 식별자 충돌 제외 ${preview.counts['id-conflict']}일` : ''}</p><p class="form-help">현재 프로필·운동 일지·대화·이전 보관함은 유지해요. 교체 선택은 식사뿐 아니라 해당 날짜의 운동·몸 상태·메모 전체를 바꿔요. 완료한 날짜는 교체하지 않아요.</p><div class="item-list">${preview.rows.map(row => `<details class="source-details"><summary>${row.date} · ${labels[row.status]}</summary><p><strong>현재</strong> ${escape(describe(row.current))}</p><p><strong>백업</strong> ${escape(describe(row.incoming))}</p><p class="form-help">백업 식사: ${row.incoming.meals.map(meal => `${escape(meal.name)} ${fmt(I.mealTotals([meal]).kcal)}kcal`).join(' · ') || '없음'}</p>${row.status === 'conflict' ? `<label><input type="checkbox" name="mergeReplace" value="${row.date}"> 이 날짜 전체를 백업으로 교체</label>` : ''}</details>`).join('')}</div>${preview.templates.length ? `<p class="form-help">자주 먹는 식사: 새 항목 ${preview.templates.filter(item => item.status === 'added').length}개 추가, 같은 식별자의 기존 항목은 유지해요.</p>` : ''}<div class="form-actions">${command('import-merge', '선택한 기록 합치기', 'combine', '', true)}${command('import-cancel', '취소', 'x')}</div></section>`);
      const replace = $('importPreview').querySelector('.notice-warning');
      const disclosure = document.createElement('details');
      disclosure.className = 'source-details';
      const title = document.createElement('summary'); title.textContent = '전체 데이터를 백업으로 교체';
      disclosure.append(title); replace.replaceWith(disclosure); disclosure.append(replace);
      if (preview.presets?.length) $('importPreview').querySelector('.section').insertAdjacentHTML('beforeend', `<p class="form-help">자주 하는 운동: 새 항목 ${preview.presets.filter(item => item.status === 'added').length}개 추가, 같은 식별자의 기존 항목은 유지해요.</p>`);
    }
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
      const profile = { ...state.profile };
      for (const key of ['sex', 'bodyFatMethod', 'sport', 'goal', 'activity', 'healthContext', 'proteinPreference', 'activityMode', 'goalPreference']) profile[key] = String(form.get(key) || '');
      profile.dailyActivity = clone(profileActivityDraft);
      profile.weekdayActivity = clone(profileWeekdayDraft);
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
      if (save(next, '내 기준을 저장했어요. 완료한 과거 기록은 그대로예요.')) { $('profileErrors').hidden = true; profileInitialized = false; profileDirty = false; selectedDate = I.dateKey(); render(); selectView('today'); }
    } catch (error) { $('profileErrors').hidden = false; $('profileErrors').textContent = error.message; $('profileErrors').tabIndex = -1; $('profileErrors').focus(); }
  });
  document.addEventListener('click', async event => {
    const nav = event.target.closest('[data-view]');
    if (nav) { selectView(nav.dataset.view); return; }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const current = day();
    const edits = ['meal-add', 'meal-edit', 'meal-copy', 'meal-delete', 'meal-reuse', 'meal-copy-previous', 'meal-template-use', 'session-add', 'session-edit', 'session-delete', 'session-preset-use', 'measurement', 'allocation-reset', 'allocation-suggest', 'day-activity', 'day-activity-reset', 'coach-checkin'];
    if (current.complete && edits.includes(action)) { toast('완료한 기록은 먼저 기록 수정을 눌러 주세요.'); return; }
    try {
      if (coachActionsUI && await coachActionsUI.handleAction(action, button)) return;
      if (await diaryUI.handleAction(button)) return;
      if (await trainingUI.handleAction(button)) return;
      if (action === 'go-profile' || action === 'nav-profile') selectView('profile');
      else if (action === 'tracking-scope') { selectView('today'); $('trackingScope')?.focus(); }
      else if (action === 'nav-coach') selectView('coach');
      else if (action === 'nav-coach-actions') {
        selectView('coach', false);
        const section = $('coachContent').querySelector('.coach-action-loop');
        if (section) { section.tabIndex = -1; section.focus({ preventScroll: true }); section.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      }
      else if (action === 'nav-trends') selectView('trends');
      else if (action === 'coach-checkin') checkinDialog();
      else if (action === 'coach-question') { coachQuestion = button.dataset.question; selectView('coach', false); $('coachAnswer')?.focus({ preventScroll: true }); }
      else if (action === 'profile-next') moveProfileStep(onboardingStep + 1);
      else if (action === 'profile-back') moveProfileStep(onboardingStep - 1);
      else if (action === 'profile-step') moveProfileStep(Number(button.dataset.step));
      else if (action === 'profile-activity') profileActivityDialog();
      else if (action === 'day-activity') dayActivityDialog();
      else if (action === 'day-activity-reset') { if (mutateDay(item => { item.dailyActivity = null; }, '기본·요일 생활 시간으로 돌아왔어요.')) closeDialog(); }
      else if (action === 'go-today') { selectedDate = I.dateKey(); render(); selectView('today'); }
      else if (action === 'dialog-close') closeDialog();
      else if (action === 'previous-day' || action === 'next-day') { selectedDate = I.shiftDate(selectedDate, action === 'previous-day' ? -1 : 1); if (selectedDate > I.dateKey()) selectedDate = I.dateKey(); if (selectedDate < '1900-01-01') selectedDate = '1900-01-01'; render(); }
      else if (action === 'open-day') { selectedDate = button.dataset.date; render(); selectView('today'); }
      else if (action === 'meal-add') mealDialog();
      else if (action === 'meal-edit') mealDialog(current.meals.find(item => item.id === button.dataset.id));
      else if (action === 'meal-reuse') mealDialog(previousMeals().find(item => item.id === button.dataset.id), true);
      else if (action === 'meal-template-save') saveMealTemplate(current.meals.find(item => item.id === button.dataset.id));
      else if (action === 'meal-templates') mealTemplatesDialog();
      else if (action === 'meal-template-use') { const template = state.mealTemplates?.find(item => item.id === button.dataset.id); if (template) { closeDialog(); mealDialog(template.meal, true); } }
      else if (action === 'meal-template-delete') { const next = clone(state); next.mealTemplates = (next.mealTemplates || []).filter(item => item.id !== button.dataset.id); if (save(next, '저장 목록에서 삭제했어요. 기존 식사 기록은 그대로예요.')) mealTemplatesDialog(); }
      else if (action === 'meal-copy-previous') previousDayDialog();
      else if (action === 'day-note') dayNoteDialog();
      else if (action === 'meal-copy') mutateDay(item => item.meals.push({ ...item.meals.find(meal => meal.id === button.dataset.id), id: id() }), '같은 식사를 추가했어요.');
      else if (action === 'meal-delete' || action === 'session-delete') confirmDialog('기록 삭제', '선택한 기록을 삭제하고 오늘 합계를 다시 계산할까요?', '삭제', () => mutateDay(item => { const key = action === 'meal-delete' ? 'meals' : 'sessions'; item[key] = item[key].filter(entry => entry.id !== button.dataset.id); }, '기록을 삭제했어요.'));
      else if (action === 'session-add') sessionDialog();
      else if (action === 'session-edit') sessionDialog(current.sessions.find(item => item.id === button.dataset.id));
      else if (action === 'activity-session-edit') {
        const date = button.dataset.date;
        if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('조건을 보완할 실제 운동 기록을 다시 선택해 주세요.');
        const entry = state.days[date]?.sessions.find(item => item.id === button.dataset.id);
        if (!entry || state.days[date].complete) throw new Error('조건을 보완할 실제 운동 기록을 다시 선택해 주세요.');
        selectedDate = date; render(); sessionDialog(entry);
      }
      else if (action === 'activity-intent-answer') {
        const date = button.dataset.date, sessionId = button.dataset.id, answer = button.dataset.answer;
        if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('답할 운동 기록을 다시 선택해 주세요.');
        const snapshot = activityQuestionSnapshot, entry = state.days[date]?.sessions.find(row => row.id === sessionId);
        const review = window.MacroActivity?.build(state, selectedDate), rows = review?.current?.length ? review.current : review?.latest || [];
        const reviewed = rows.find(row => row.id === sessionId && row.date === date);
        if (state.days[date]?.complete || !entry
          || !button.closest('#activityReviewDetail') || !decisionContext().scope.trainingEnabled || snapshot?.viewDate !== selectedDate || snapshot.date !== date || snapshot.id !== sessionId
          || snapshot.source !== JSON.stringify(entry) || reviewed?.question?.topic !== 'intent' || !reviewed.question.options?.some(option => option.value === answer))
          throw new Error('답할 운동 기록을 다시 선택해 주세요.');
        const next = clone(state), record = next.days[date].sessions.find(row => row.id === sessionId);
        record.details = { ...record.details, intent: answer };
        if (save(next, '알려준 운동 목적에 맞춰 다음 운동을 다시 정했어요.')) $('activityReviewDetail')?.focus();
      }
      else if (action === 'session-presets') sessionPresetsDialog();
      else if (action === 'session-preset-save') saveSessionPreset(current.sessions.find(item => item.id === button.dataset.id));
      else if (action === 'session-preset-use') { const preset = state.sessionPresets?.find(item => item.id === button.dataset.id); if (preset) { closeDialog(); sessionDialog(null, preset.session); } }
      else if (action === 'session-preset-delete') { const next = clone(state); next.sessionPresets = next.sessionPresets.filter(item => item.id !== button.dataset.id); if (save(next, '자주 하는 운동 목록에서 삭제했어요. 기존 기록은 유지합니다.')) sessionPresetsDialog(); }
      else if (action === 'measurement') measurementDialog();
      else if (action === 'allocation-reset') mutateDay(item => { item.carbAdjustmentG = 0; }, '기본 배분으로 돌아왔어요.');
      else if (action === 'allocation-suggest') allocationSuggestionDialog();
      else if (action === 'complete') confirmDialog('하루 기록 완료', '빠진 식사가 없는지 확인해 주세요. 지금의 목표와 식사 기록을 함께 보관하고, 이후 프로필을 바꿔도 이 날의 목표는 유지해요.', '완료', () => mutateDay(item => { const snapshot = planFor(item); if (snapshot.context) snapshot.context.goal = state.profile?.goal || null; item.planSnapshot = clone(snapshot); item.complete = true; }, '하루 기록을 완료했어요.'));
      else if (action === 'reopen') confirmDialog('완료한 기록 수정', '이 날을 다시 열면 현재 프로필과 이 날짜의 몸 상태·운동으로 목표를 다시 계산해요. 이전 기준을 보관하려면 먼저 전체 백업을 내려받아 주세요.', '다시 열기', () => mutateDay(item => { item.complete = false; item.planSnapshot = null; }, '기록을 다시 열었어요.'));
      else if (action === 'export') { download(S.exportBackup(state), `macro-engine-${I.dateKey()}.json`); toast('백업 다운로드를 요청했어요. 저장된 파일을 확인해 주세요.'); }
      else if (action === 'import-select') $('backupFile').click();
      else if (action === 'import-cancel') { pendingImport = null; renderData(); icons(); }
      else if (action === 'import-merge') {
        if (blocked || pendingImport?.kind !== 'current') throw new Error('합칠 수 있는 백업을 먼저 확인해 주세요.');
        const replaceDates = [...$('importPreview').querySelectorAll('[name="mergeReplace"]:checked')].map(input => input.value);
        const next = S.mergeBackup(state, pendingImport.state, replaceDates);
        if (save(next, '선택한 날짜별 기록을 합쳤어요. 현재 프로필과 완료 기록은 유지했어요.')) { pendingImport = null; render(); }
      }
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
        Object.values(state.days).sort((a, b) => a.date.localeCompare(b.date)).forEach(item => { const totals = I.mealTotals(item.meals); rows.push([item.date, item.complete ? '완료' : '기록 중', item.weightKg ?? '', item.bodyFatPct ?? '', item.skeletalMuscleKg ?? '', ...['kcal', 'protein', 'carbs', 'fat', 'alcoholG'].map(key => item.meals.length ? totals[key] : ''), item.planSnapshot?.energy?.targetKcal ?? '']); });
        download('\uFEFF' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'), `macro-engine-records-${I.dateKey()}.csv`, 'text/csv;charset=utf-8');
      }
      else if (action === 'reset') confirmDialog('이 버전의 기록 초기화', '프로필과 식사·운동·몸 상태·이전 기록 보관함을 삭제합니다. 먼저 전체 백업을 보관했는지 확인해 주세요.', '초기화', () => {
        if (!save(S.createEmpty(), '초기화했어요.', true)) return false;
        pendingImport = null; profileInitialized = false; profileDirty = false; onboardingStep = 0; selectedDate = I.dateKey(); render(); selectView('profile'); return true;
      }, '초기화');
    } catch (error) { toast(error.message, true); }
  });
  $('profileForm').addEventListener('input', () => { profileDirty = true; renderProfileSummary(); $('profileSaveNote').textContent = '아직 저장하지 않은 변경이 있어요.'; });
  document.addEventListener('change', async event => {
    try { if (await trainingUI.handleChange(event)) return; } catch (error) { toast(error.message, true); return; }
    if (event.target.id === 'activityReviewSelect') {
      const value = window.MacroActivity?.build(state, selectedDate);
      const rows = value?.current?.length ? value.current : value?.latest || [];
      if (!rows.some(row => row.id === event.target.value)) { toast('현재 조회에 포함된 운동을 선택해 주세요.', true); return; }
      activityReviewId = event.target.value; renderCoach(); $('activityReviewDetail')?.focus();
    } else if (event.target.id === 'trackingScope') {
      const next = clone(state); next.trackingScope = event.target.value;
      if (save(next, '기록 범위를 바꿨어요. 기존 기록과 완료 당시 목표는 그대로입니다.')) $('trackingScope')?.focus();
      else { event.target.value = state.trackingScope || 'auto'; }
    } else if (event.target.id === 'dayDate') {
      if (S.isValidDate(event.target.value) && event.target.value <= I.dateKey()) { selectedDate = event.target.value; render(); }
      else { toast('오늘까지의 올바른 날짜를 선택해 주세요.', true); event.target.value = selectedDate; }
    } else if (event.target.id === 'trendPeriod') {
      trendPeriod = Number(event.target.value); renderTrends(); drawChart(); icons(); $('trendPeriod').focus();
    } else if (event.target.id === 'bodyMetric' || event.target.id === 'intakeMetric') {
      const control = event.target.id;
      if (control === 'bodyMetric') bodyMetric = event.target.value; else intakeMetric = event.target.value;
      renderTrends(); drawChart(); icons(); $(control).focus();
    } else if (event.target.id === 'trendsDate') {
      if (S.isValidDate(event.target.value) && event.target.value <= I.dateKey() && event.target.value >= '1900-02-12') { selectedDate = event.target.value; render(); $('trendsDate').focus(); }
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
  void trainingUI.init();
  if (loaded.warnings.length && !blocked) toast(loaded.warnings.join(' '), true);
})();
