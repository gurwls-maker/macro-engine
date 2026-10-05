(function () {
  'use strict';
  const N = window.MacroNutrition;
  const S = window.MacroStorage;
  const I = window.MacroInsights;
  const loaded = S.load();
  let state = loaded.state;
  let blocked = loaded.storageBlocked === true;
  let selectedDate = I.dateKey();
  let view = state.profile ? 'today' : 'profile';
  let pendingImport = null;
  let toastTimer;
  let dialogReturnFocus;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const id = () => window.crypto?.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sportNames = { none: '운동 없음', strength: '근력운동', running: '달리기', cycling: '사이클', swimming: '수영', team: '구기·팀 스포츠', mixed: '복합 운동', walking: '걷기' };
  const goalNames = { lose: '체지방 감량', maintain: '체중 유지', gain: '근육 증가', recomp: '체성분 개선', performance: '운동 수행' };
  const intensityNames = { easy: '가볍게', moderate: '보통', hard: '힘들게' };
  const titles = { today: '오늘', trends: '기록과 추세', profile: '내 기준', data: '데이터' };
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
  function save(next, message, allowReplace = false) {
    if (blocked && !allowReplace) { toast('저장된 원본을 보호하고 있어요. 데이터 화면에서 원본을 내보내거나 검증된 백업을 복원해 주세요.', true); return false; }
    try {
      state = S.save(next);
      if (allowReplace) blocked = false;
      if (message) toast(message);
      render();
      return true;
    } catch (error) { toast(error.message, true); return false; }
  }
  function mutateDay(change, message) {
    const next = clone(state);
    if (!next.days[selectedDate]) next.days[selectedDate] = emptyDay();
    change(next.days[selectedDate]);
    return save(next, message);
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
    if (view === 'profile') populateProfile();
    if (view === 'trends') drawChart();
    if (focus) { $('pageTitle').tabIndex = -1; $('pageTitle').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
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
  function renderToday() {
    const current = day();
    const plan = planFor(current);
    const totals = I.mealTotals(current.meals);
    const ready = plan.status === 'ready';
    const frozen = current.complete;
    const target = ready ? plan.energy.targetKcal : null;
    const calorieDetail = ready ? `목표 ${fmt(target)}kcal · ${fmt(Math.abs(target - totals.kcal))}kcal ${target >= totals.kcal ? '남음' : '초과'}` : '섭취한 양만 기록해요';
    const problems = (plan.reasons || []).filter(Boolean);
    const basePlan = ready && !frozen ? N.calculatePlan(effectiveProfile(), current, []) : plan;
    const allocationMin = ready ? Math.max(basePlan.macros.carbs.min - basePlan.macros.carbs.target, (basePlan.macros.fat.target - basePlan.macros.fat.max) * 9 / 4) : 0;
    const allocationMax = ready ? Math.min(basePlan.macros.carbs.max - basePlan.macros.carbs.target, (basePlan.macros.fat.target - basePlan.macros.fat.min) * 9 / 4) : 0;
    $('todayContent').innerHTML = `
      <div class="toolbar"><div class="date-control">${iconButton('previous-day', '이전 날짜', 'chevron-left', selectedDate <= '1900-01-01' ? 'disabled' : '')}<label class="sr-only" for="dayDate">기록 날짜</label><input id="dayDate" type="date" min="1900-01-01" max="${I.dateKey()}" value="${selectedDate}">${iconButton('next-day', '다음 날짜', 'chevron-right', selectedDate >= I.dateKey() ? 'disabled' : '')}</div><span class="badge ${frozen ? 'badge-complete' : ''}">${frozen ? '기록 완료' : '기록 중'}</span></div>
      ${!state.profile ? `<div class="notice notice-info"><strong>먼저 내 기준을 알려 주세요.</strong><p>몸과 운동에 맞는 시작 목표를 계산할 수 있어요. 식사 기록은 바로 남길 수 있어요.</p>${command('go-profile', '내 기준 입력', 'sliders-horizontal', '', true)}</div>` : ''}
      ${state.profile && !ready ? `<div class="notice notice-warning"><strong>개별 영양 계획이 필요한 상태예요.</strong><p>${problems.map(escape).join(' ')}</p><p>자동 섭취 목표는 제시하지 않지만 식사와 몸 상태는 계속 기록할 수 있어요.</p></div>` : ''}
      <section class="section"><div class="section-header"><div><div class="section-kicker">${frozen ? '저장 당시의 기준' : '오늘의 섭취'}</div><h2>먹은 양과 남은 양</h2></div>${!frozen ? command('meal-add', '식사 추가', 'plus', '', true) : command('reopen', '기록 수정', 'pencil')}</div><div class="metrics-grid">${metric('총열량', totals.kcal, 'kcal', calorieDetail, 'metric-energy', target ? totals.kcal / target * 100 : null)}${macroMetric('단백질', 'protein', plan, totals, 'metric-protein')}${macroMetric('탄수화물', 'carbs', plan, totals, 'metric-carbs')}${macroMetric('지방', 'fat', plan, totals, 'metric-fat')}</div></section>
      <div class="split-layout"><section class="section"><div class="section-header"><h2>식사 기록</h2><span class="muted">${current.meals.length}개</span></div>${current.meals.length ? `<ul class="item-list">${current.meals.map(meal => `<li class="item-row"><div class="item-main"><strong>${escape(meal.name)}</strong><div class="secondary-text">${fmt(I.mealTotals([meal]).kcal)}kcal · 단 ${fmt(meal.protein, 1)} · 탄 ${fmt(meal.carbs, 1)} · 지 ${fmt(meal.fat, 1)}g${meal.alcoholG ? ` · 알코올 ${fmt(meal.alcoholG, 1)}g` : ''}</div></div>${frozen ? '' : `<div class="item-actions">${iconButton('meal-edit', `${escape(meal.name)} 수정`, 'pencil', `data-id="${escape(meal.id)}"`)}${iconButton('meal-copy', `${escape(meal.name)} 한 번 더 추가`, 'copy', `data-id="${escape(meal.id)}"`)}${iconButton('meal-delete', `${escape(meal.name)} 삭제`, 'trash-2', `data-id="${escape(meal.id)}"`)}</div>`}</li>`).join('')}</ul>` : `<div class="empty-state">${icon('utensils')}<p>기록한 식사가 없어요.</p></div>`}${!frozen && previousMeals().length ? `<div class="recent-meals"><span class="muted">최근 식사</span>${previousMeals().map(meal => `<button class="text-button" type="button" data-action="meal-reuse" data-id="${escape(meal.id)}">${icon('plus')}${escape(meal.name)}</button>`).join('')}</div>` : ''}${!frozen && current.meals.length ? `<div class="form-actions">${command('complete', '하루 기록 완료', 'check', '', true)}</div>` : ''}</section>
      <section class="section"><div class="section-header"><h2>운동과 몸 상태</h2>${!frozen ? command('session-add', '운동 추가', 'plus') : ''}</div>${current.sessions.length ? `<ul class="item-list">${current.sessions.map(session => `<li class="item-row"><div class="item-main"><strong>${sportNames[session.sport] || escape(session.sport)}</strong><div class="secondary-text">${fmt(session.durationMin)}분 · ${intensityNames[session.intensity]}</div></div>${frozen ? '' : `<div class="item-actions">${iconButton('session-edit', '운동 수정', 'pencil', `data-id="${escape(session.id)}"`)}${iconButton('session-delete', '운동 삭제', 'trash-2', `data-id="${escape(session.id)}"`)}</div>`}</li>`).join('')}</ul>` : '<p class="muted">오늘 입력한 운동이 없어요. 휴식일 목표를 사용해요.</p>'}<div class="body-summary"><span>체중 <strong>${fmt(current.weightKg, 1)}kg</strong></span><span>체지방 <strong>${fmt(current.bodyFatPct, 1)}%</strong></span><span>골격근 <strong>${fmt(current.skeletalMuscleKg, 1)}kg</strong></span></div>${!frozen ? command('measurement', '몸 상태 기록', 'scale') : ''}</section></div>
      <section class="section"><div class="section-header"><div><div class="section-kicker">${frozen ? '하루 돌아보기' : '다음 식사를 위해'}</div><h2>지금 챙길 것</h2></div></div><ul class="guidance-list">${I.dailyGuidance(plan, current).map(item => `<li><strong>${escape(item.title)}</strong><p>${escape(item.body)}</p></li>`).join('')}</ul></section>
      ${ready ? `<section class="section"><div class="section-header"><h2>목표의 기준</h2><span class="badge">추정 시작점</span></div><div class="facts-grid"><div><span class="muted">안정시대사 추정</span><strong>${fmt(plan.energy.restingKcal)}kcal</strong></div><div><span class="muted">오늘 운동 추가 소모</span><strong>${fmt(plan.energy.exerciseKcal)}kcal</strong></div><div><span class="muted">총소모 추정</span><strong>${fmt(plan.energy.tdeeKcal)}kcal</strong></div><div><span class="muted">섭취 시작 목표</span><strong>${fmt(target)}kcal</strong></div></div><p class="form-help">${escape(plan.energy.method)} · 체성분은 감량 조정·단백질 기준·회복 참고에 반영해요. 안정시대사량에 골격근량을 임의로 더하지 않아요. 실제 필요량은 체중 추세와 회복 상태에 따라 달라져요. ${frozen ? '이 날 완료할 때의 목표를 보존하고 있어요.' : '일상 활동과 입력한 오늘 운동만 반영해요.'}</p>${problems.length ? `<p class="notice notice-info">${problems.map(escape).join(' ')}</p>` : ''}
      ${!frozen && allocationMax - allocationMin > 1 ? `<div class="allocation-control"><label for="allocation"><strong>탄수화물·지방 배분</strong></label><div class="allocation-labels"><span>지방 쪽으로</span><span>탄수화물 쪽으로</span></div><input id="allocation" type="range" min="${Math.ceil(allocationMin)}" max="${Math.floor(allocationMax)}" step="1" value="${Math.max(Math.ceil(allocationMin), Math.min(Math.floor(allocationMax), current.carbAdjustmentG || 0))}" aria-describedby="allocationNote"><p id="allocationNote" class="form-help">단백질과 총열량을 유지해요. 탄수화물 25g과 지방 약 11g은 각각 100kcal예요.</p>${command('allocation-reset', '기본 배분', 'rotate-ccw')}</div>` : ''}
      <details class="source-details"><summary>계산 근거와 적용 범위</summary><p class="form-help">열량·영양소 목표는 진단이나 최적 섭취량의 확정값이 아니에요. 식품의 질, 알레르기, 약물, 질환별 식이 처방은 별도로 판단해야 해요.</p><ul>${(plan.sources || []).filter(source => /^https:\/\//.test(source.url)).map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a></li>`).join('')}</ul></details></section>` : ''}`;
  }
  function previousMeals() {
    const names = new Set();
    return Object.values(state.days).filter(item => item.date < selectedDate).sort((a, b) => b.date.localeCompare(a.date)).flatMap(item => item.meals).filter(meal => {
      if (names.has(meal.name)) return false;
      names.add(meal.name); return true;
    }).slice(0, 4);
  }
  function renderTrends() {
    const summary = I.historySummary(state.days, I.dateKey(), state.profile?.goal);
    const dates = Object.values(state.days).sort((a, b) => b.date.localeCompare(a.date));
    $('trendsContent').innerHTML = `<section class="section"><div class="section-header"><div><div class="section-kicker">최근 28일</div><h2>하루 숫자보다 꾸준한 변화</h2></div><span class="badge">체중 ${summary.weights.length}회</span></div><div class="metrics-grid">${metric('최근 주간 체중 중앙값', summary.laterWeight, 'kg', '최근 7일의 측정값', 'metric-energy')}${metric('이전 주간 체중 중앙값', summary.earlierWeight, 'kg', '그 이전 7일의 측정값')}${metric('식사 기록 완료', summary.completed.length, '일', '현재 목표와 같은 기준')}${metric('완료 기록 평균 섭취', summary.averageKcal, 'kcal', '완료한 날만 계산')}</div><div class="chart-wrap"><canvas id="weightChart" role="img" aria-label="최근 28일 체중 추세. 각 측정값은 아래 날짜별 기록에서 확인할 수 있습니다."></canvas></div><p class="notice notice-info">${escape(summary.trendMessage)}</p></section><section class="section"><div class="section-header"><h2>날짜별 기록</h2><span class="muted">${dates.length}일</span></div>${dates.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">날짜</th><th scope="col">상태</th><th scope="col">체중</th><th scope="col">체지방 / 골격근</th><th scope="col">섭취 / 목표</th><th scope="col"><span class="sr-only">열기</span></th></tr></thead><tbody>${dates.map(item => `<tr><th scope="row">${escape(item.date)}</th><td>${item.complete ? '완료' : '기록 중'}</td><td>${fmt(item.weightKg, 1)}kg</td><td>${fmt(item.bodyFatPct, 1)}% / ${fmt(item.skeletalMuscleKg, 1)}kg</td><td>${fmt(I.mealTotals(item.meals).kcal)} / ${fmt(item.planSnapshot?.energy?.targetKcal)}kcal</td><td>${iconButton('open-day', `${item.date} 기록 열기`, 'arrow-up-right', `data-date="${item.date}"`)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('chart-no-axes-combined')}<p>기록이 쌓이면 이곳에서 함께 볼 수 있어요.</p>${command('go-today', '오늘 기록하기', 'arrow-right')}</div>`}</section>`;
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
      if (mutateDay(current => { const index = current.meals.findIndex(item => item.id === entry.id); if (index < 0) current.meals.push(entry); else current.meals[index] = entry; }, '식사를 저장했어요.')) closeDialog();
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
      if (save(next, '내 기준을 저장했어요. 완료한 과거 기록은 그대로예요.')) { $('profileErrors').hidden = true; selectedDate = I.dateKey(); render(); selectView('today'); }
    } catch (error) { $('profileErrors').hidden = false; $('profileErrors').textContent = error.message; $('profileErrors').tabIndex = -1; $('profileErrors').focus(); }
  });
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-view]');
    if (nav) { selectView(nav.dataset.view); return; }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const current = day();
    const edits = ['meal-add', 'meal-edit', 'meal-copy', 'meal-delete', 'meal-reuse', 'session-add', 'session-edit', 'session-delete', 'measurement', 'allocation-reset'];
    if (current.complete && edits.includes(action)) { toast('완료한 기록은 먼저 기록 수정을 눌러 주세요.'); return; }
    try {
      if (action === 'go-profile') selectView('profile');
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
        if (save(next, '백업을 복원했어요.', incoming.kind === 'current')) { pendingImport = null; render(); }
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
        pendingImport = null; selectedDate = I.dateKey(); render(); selectView('profile'); return true;
      }, '초기화');
    } catch (error) { toast(error.message, true); }
  });
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
