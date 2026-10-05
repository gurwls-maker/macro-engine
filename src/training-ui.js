(function (root) {
  'use strict';
  function create(app) {
    const T = root.MacroTraining, TS = root.MacroTrainingStore, S = root.MacroStorage, I = root.MacroInsights;
    const { escape: e, fmt, icon, command, iconButton, id, field, actions, openDialog, closeDialog, toast } = app;
    const $ = name => document.getElementById(name);
    const copy = value => JSON.parse(JSON.stringify(value));
    const sourceNames = { visual: '이미지 판독', 'legacy-ocr': '과거 OCR · 미검증', manual: '직접 기록' };
    const statusNames = { improved: '비교 조건 내 향상', declined: '비교 조건 내 감소', stable: '비슷함', mixed: '변화 혼재', incomparable: '비교 조건 확인', insufficient: '이전 기록 부족' };
    let tab = 'log', chosen = null, pendingImport = null, filter = '', currentJob = null, jobTimer = null, provider = 'local', imageDraft = null;
    let editor = null, editorIsDraft = false, chatDraft = '', jobs = [], unprocessedImages = [], jobStarting = false;
    let chatScrollTop = 0, lastChatMessage = null, chatNearBottom = true, chatScrollToLatest = false;
    let analyzedState = null, analyzedDate = null, cachedAnalysis = null, cachedProgram = null;
    const bridge = root.MacroBridge.create(() => { if (bridge.status?.runtime?.available && !bridge.status.storageError && provider === 'local' && !workspace().messages.length) provider = 'codex'; app.render(); });
    function workspace() { return app.getState().training || TS.createEmpty(); }
    function saveWorkspace(value, message) { const next = copy(app.getState()); next.training = TS.validate(value); return app.save(next, message); }
    function analysis() {
      const state = app.getState(), date = app.getDate();
      if (state !== analyzedState || date !== analyzedDate) {
        const value = workspace(); cachedAnalysis = T.analyze(value.records, { date, profile: state.profile, checkins: state.days, mappings: value.mappings });
        analyzedState = state; analyzedDate = date; cachedProgram = null;
      }
      return cachedAnalysis;
    }
    function program() { const report = analysis(); if (!cachedProgram) cachedProgram = T.recommendProgram(app.getState().profile, workspace().settings, report); return cachedProgram; }
    function options(values, selected) { return values.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join(''); }
    function sourceBadge(record) { return `<span class="source-badge ${record.source.kind === 'legacy-ocr' ? 'source-unverified' : ''}">${e(sourceNames[record.source.kind])}</span>`; }
    function dateControl() { return `<label class="field compact-date"><span>분석 기준일</span><input type="date" id="trainingDate" min="1900-01-01" max="${I.dateKey()}" value="${app.getDate()}"></label>`; }
    function imageThumbnail(hash, className = '') { return bridge.status?.connected && hash ? `<img class="diary-thumbnail ${className}" src="/api/images/${e(hash)}" alt="운동 기록 원본" loading="lazy" data-image-fallback>` : ''; }
    function connectionPanel() {
      const status = bridge.status;
      if (!status?.connected) return `<div class="connection-note">${icon('hard-drive')}<div><strong>기기 기록 모드</strong><span>개인 코치 연결 주소: http://127.0.0.1:4173</span></div>${location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname) ? command('bridge-refresh', '서버 다시 확인', 'refresh-cw') : ''}</div>`;
      const error = status.storageError || status.syncError;
      if (status.syncError && !status.storageError && !bridge.enabled) return `<div class="connection-note connection-error">${icon('shield-alert')}<div><strong>PC 연결 확인 필요</strong><span>${e(status.syncError)} 브라우저 기록은 유지됩니다.</span></div>${command('bridge-connect', '기록 다시 확인', 'refresh-cw')}</div>`;
      return `<div class="connection-note ${error ? 'connection-error' : ''}">${icon(error ? 'shield-alert' : bridge.enabled ? 'circle-check' : 'link')}<div><strong>${error ? 'PC 원본 보호 중' : bridge.enabled ? '이 브라우저와 PC 기록 연결됨' : 'PC 기록 연결 대기'}</strong><span>${e(error || (bridge.enabled ? '변경은 이 PC의 개인 기록 폴더에도 저장됩니다.' : status.stored ? `PC에 ${status.stored.days}일 · 운동 ${status.stored.workouts}개가 있어요. 먼저 확인해 주세요.` : '기존 브라우저 기록을 확인한 뒤 연결해 주세요.'))}</span></div>${!bridge.enabled && !error ? command('bridge-connect', status.stored ? '기록 확인' : '현재 기록 연결', 'link') : ''}</div>`;
    }
    function render() {
      const data = workspace(), report = analysis();
      const rows = data.records.filter(record => !filter || `${record.label} ${record.date} ${record.exercises.map(exercise => exercise.rawName).join(' ')}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
      if (!rows.some(record => record.id === chosen)) chosen = rows[0]?.id || null;
      const record = rows.find(item => item.id === chosen);
      $('trainingContent').innerHTML = `<div class="training-toolbar"><div class="segmented" role="group" aria-label="운동 보기">${[['log', '일지'], ['analysis', '분석'], ['program', '프로그램']].map(([value, label]) => `<button type="button" data-action="training-tab" data-tab="${value}" aria-pressed="${tab === value}">${label}</button>`).join('')}</div><div class="toolbar-actions">${command('training-image', '이미지', 'image-plus')}${command('training-add', '운동 기록', 'plus', '', true)}</div></div>${tab === 'log' ? `<div class="training-log-grid"><aside class="workout-index"><div class="section-header"><h2>운동 일지 <small>${data.records.length}</small></h2>${iconButton('training-import', '일지 가져오기', 'folder-input')}</div><label class="search-field">${icon('search')}<span class="sr-only">운동 기록 검색</span><input type="search" id="trainingSearch" value="${e(filter)}" placeholder="날짜 · 종목 검색"></label><div class="workout-list">${rows.slice(0, 150).map(item => `<button type="button" class="workout-list-item ${item.id === chosen ? 'selected' : ''}" data-action="training-open" data-id="${e(item.id)}" aria-pressed="${item.id === chosen}"><span>${item.date}<small>${e(item.time || '')}</small></span><strong>${e(item.label)}</strong><small>${item.exercises.length}종목 · ${item.durationMinutes == null ? '시간 미확인' : `${fmt(item.durationMinutes)}분`}</small>${sourceBadge(item)}</button>`).join('') || '<p class="empty-state">아직 운동 일지가 없어요.</p>'}</div>${rows.length > 150 ? '<p class="form-help">검색으로 이전 기록을 찾을 수 있어요.</p>' : ''}${command('training-import', '폴더·JSON 가져오기', 'folder-input')}${data.records.length ? command('training-export', '일지 내보내기', 'download') : ''}</aside><section class="workout-detail">${record ? renderRecord(record) : `<div class="workout-empty">${icon('dumbbell')}<h2>다음 운동을 이어갈 기록</h2><div class="form-actions">${command('training-import', '기존 일지 가져오기', 'folder-input', '', true)}${command('training-add', '직접 기록', 'plus')}</div></div>`}</section></div>` : tab === 'analysis' ? renderAnalysis(report) : renderProgram(program())}${connectionPanel()}`;
      $('trainingContent').insertAdjacentHTML('beforeend', jobHTML());
      if (bridge.status?.connected) $('trainingContent').insertAdjacentHTML('beforeend', inboxHTML());
      if (pendingImport) renderImportPreview();
      if (imageDraft) renderImagePreview();
      app.icons();
    }
    function renderRecord(record) {
      const linked = app.getState().days[record.date]?.sessions.some(session => session.id === linkedId(record.id));
      return `<div class="workout-heading"><div><span class="eyebrow">${record.date}${record.time ? ` · ${e(record.time)}` : ''}</span><h2>${e(record.label)}</h2>${sourceBadge(record)}</div><div class="toolbar-actions">${iconButton('training-reuse', '이 운동 다시 기록', 'copy', `data-id="${e(record.id)}"`)}${iconButton('training-edit', '운동 수정', 'pencil', `data-id="${e(record.id)}"`)}${iconButton('training-delete', '운동 삭제', 'trash-2', `data-id="${e(record.id)}"`)}</div></div><div class="workout-facts"><div><span>기록 시간</span><strong>${fmt(record.durationMinutes)}<small> 분</small></strong></div><div><span>종목</span><strong>${record.exercises.length}<small> 개</small></strong></div><div><span>원문 세트</span><strong>${fmt(record.reportedSetCount)}<small> 세트</small></strong></div><div><span>체감 강도</span><strong>${fmt(record.effort)}<small> / 10</small></strong></div></div>${record.pain === 'stop' || record.pain === 'mild' ? `<p class="notice notice-warning">${record.pain === 'stop' ? '중단이 필요한 통증' : '통증'}을 기록했어요. 새 증량보다 증상 확인과 개별 평가가 먼저예요.</p>` : ''}<div class="workout-source-row">${imageThumbnail(record.source.hash)}<div>${record.source.paths.map(name => `<span class="source-filename">${e(name.split(/[\\/]/).at(-1))}</span>`).join('')}${record.source.uncertainties.length ? `<details class="source-details"><summary>확인할 원문 ${record.source.uncertainties.length}개</summary><ul>${record.source.uncertainties.map(item => `<li>${e(item)}</li>`).join('')}</ul></details>` : ''}</div></div>${record.exercises.length ? record.exercises.map(exercise => {
        const resolved = exercise.exerciseId ? T.catalog.find(item => item.id === exercise.exerciseId) : T.resolveExercise(exercise.rawName, workspace().mappings);
        return `<section class="exercise-block"><div class="section-header"><div><h3>${e(exercise.rawName)}</h3><span class="secondary-text">${resolved ? resolved.primaryMuscles.map(muscle => T.muscleLabels[muscle]).join(' · ') : '부위 미확인'}${exercise.equipmentKey ? ` · ${e(exercise.equipmentKey)}` : ' · 장비 미확인'}</span></div>${iconButton('training-map', '종목과 장비 확인', 'link', `data-record="${e(record.id)}" data-exercise="${e(exercise.id)}"`)}</div>${exercise.sets.length ? `<div class="set-table" role="table" aria-label="${e(exercise.rawName)} 세트"><div class="set-table-head" role="row"><span role="columnheader">세트</span><span role="columnheader">원문 kg</span><span role="columnheader">반복</span><span role="columnheader">RIR</span></div>${exercise.sets.map((set, index) => `<div class="set-table-row ${set.marker === 'W' ? 'set-warmup' : ''}" role="row"><span role="cell">${e(set.marker || String(index + 1))}</span><strong role="cell">${fmt(set.loadKg, 1)}</strong><strong role="cell">${fmt(set.reps)}</strong><span role="cell">${fmt(set.rir)}</span></div>`).join('')}</div>` : `<p class="form-help">${exercise.durationMinutes == null ? '세트 상세가 없는 기록이에요.' : `${fmt(exercise.durationMinutes)}분 기록`}</p>`}${exercise.notes ? `<p class="form-help">${e(exercise.notes)}</p>` : ''}</section>`;
      }).join('') : '<p class="empty-state">과거 요약에 종목별 세트가 없어요. 전체 세트를 부위별로 임의 배분하지 않습니다.</p>'}${record.notes ? `<p class="workout-note">${e(record.notes)}</p>` : ''}<div class="workout-link"><span>${linked ? '이 운동 시간은 식사 목표에 이미 연결됐어요.' : '일지의 kg·Cal 표기는 식사 목표에 자동 합산되지 않습니다.'}</span>${command('training-link', linked ? '영양 연결 확인' : '운동 시간 연결', 'utensils', `data-id="${e(record.id)}"`)}</div>`;
    }
    function renderAnalysis(report) {
      const muscleRows = report.muscles.filter(row => row.directSets || row.indirectSets).sort((a, b) => b.directSets - a.directSets);
      const max = Math.max(1, ...muscleRows.map(row => row.directSets + row.indirectSets));
      return `<div class="section-header"><div><h2>최근 28일의 운동</h2><span class="secondary-text">${report.windowStart} – ${report.windowEnd}</span></div>${dateControl()}</div>
        <div class="training-summary"><div><span>기록한 날짜</span><strong>${report.coverage.daysWithRecords}<small>일</small></strong></div><div><span>일반 세트</span><strong>${report.coverage.workingSets}<small>세트</small></strong></div><div><span>준비 세트</span><strong>${report.coverage.warmupSets}<small>세트</small></strong></div><div><span>부위 미확인</span><strong>${report.coverage.unresolvedExercises}<small>종목</small></strong></div></div>
        <div class="training-analysis-grid"><section><div class="section-header"><h2>부위별 기록 세트</h2><span class="chart-legend"><i class="direct-key"></i>직접 <i class="indirect-key"></i>간접</span></div>${muscleRows.length ? `<div class="muscle-chart" role="img" aria-label="부위별 직접·간접 기록 세트">${muscleRows.map(row => `<div class="muscle-row"><strong>${e(row.label)}</strong><div class="muscle-track"><span class="muscle-direct" style="width:${row.directSets / max * 100}%"></span><span class="muscle-indirect" style="width:${row.indirectSets / max * 100}%"></span></div><span>${row.directSets} / ${row.indirectSets}</span></div>`).join('')}</div>` : '<p class="empty-state">종목을 확인한 세트 기록이 필요해요.</p>'}<p class="form-help">직접·간접은 자극 부위 분류이며 서로 같은 효과로 합산하지 않아요. RIR 미확인 ${report.coverage.unknownEffortSets}세트는 성장 유효량이 아닙니다.</p></section>
        <section class="recovery-section"><span class="eyebrow">회복 맥락</span><h2>${{ stop: '통증 확인이 먼저예요', review: '계획을 조정하기 전 확인', watch: '변화를 함께 살펴봐요', insufficient: '회복 정보가 더 필요해요', okay: '현재 경고 기록은 없어요' }[report.recovery.status]}</h2>${report.recovery.reasons.map(reason => `<p>${e(reason)}</p>`).join('')}${report.recovery.questions.map(question => `<p class="recovery-question">${e(question)}</p>`).join('')}${command('coach-checkin', '컨디션 알려주기', 'heart-pulse')}</section></div>
        <section class="progression-section"><div class="section-header"><h2>종목별 수행 변화</h2></div><p class="form-help">일반 세트 중 가장 높은 표시 중량의 반복을 비교한 관찰값이에요. 같은 중량이면 가장 많은 반복을 표시하며, 근성장률이나 최대근력 측정은 아닙니다.</p>${report.progression.length ? report.progression.map(renderProgression).join('') : '<p class="empty-state">비교할 일반 세트 기록이 아직 없어요.</p>'}</section>
        <details class="source-details"><summary>이 분석의 근거와 한계</summary><ul>${report.limitations.map(line => `<li>${e(line)}</li>`).join('')}</ul></details>`;
    }
    function renderProgression(row) {
      const point = value => value ? `${value.loadKg == null ? '부하 미확인' : `${fmt(value.loadKg, 1)}kg`} × ${value.reps == null ? '반복 미확인' : `${value.reps}회`}` : '기록 없음';
      return `<div class="progression-row"><div><strong>${e(row.label)}</strong><span>${e(row.equipmentKey || '장비 미확인')}</span></div>
        <div><strong>${e(row.previous ? `${point(row.previous)} → ${point(row.current)}` : `현재 ${point(row.current)}`)}</strong><span>${row.previous ? `${row.previous.date} → ` : ''}${row.current?.date || ''}</span><details class="progression-conditions"><summary>비교 조건</summary><p>${e(row.reason)}</p></details></div>
        <div class="progression-actions"><span class="source-badge">${e(statusNames[row.status] || row.status)}</span>${row.current ? iconButton('training-open', '원문 운동 보기', 'arrow-up-right', `data-id="${e(row.current.sessionId)}"`) : ''}</div></div>`;
    }
    function renderProgram(value) {
      const settings = workspace().settings;
      return `<div class="section-header"><div><span class="eyebrow">다음 훈련의 출발점</span><h2>${e(value.name)}</h2></div>${command('program-settings', '훈련 기준', 'sliders-horizontal')}</div><div class="program-meta"><span>주 ${fmt(settings.daysPerWeek)}회</span><span>회당 ${fmt(settings.sessionMinutes)}분</span><span>${e({ gym: '헬스장', home: '홈 · 덤벨', bodyweight: '맨몸' }[settings.equipment] || settings.equipment)}</span></div><p class="program-reason">${e(value.reason)}</p>${value.days.length ? `<div class="program-days">${value.days.map((item, index) => `<section class="program-day"><div class="section-header"><h3>${e(item.label)}</h3>${iconButton('program-start', '이 계획으로 운동 기록', 'notebook-pen', `data-index="${index}"`)}</div>${item.exercises.map(exercise => `<div class="program-exercise"><strong>${e(exercise.label)}</strong><span>${exercise.sets} × ${e(exercise.reps)} · RIR ${exercise.rir}</span><small>휴식 ${exercise.restSeconds}초</small></div>`).join('')}</section>`).join('')}</div>` : ''}<div class="program-principles"><section><h3>다음 중량</h3><p>${e(value.progression)}</p></section><section><h3>휴식과 디로딩</h3><p>${e(value.deload)}</p></section></div><details class="source-details"><summary>적용 범위와 한계</summary><ul>${value.limitations.map(line => `<li>${e(line)}</li>`).join('')}</ul></details>`;
    }
    function blankSet() { return { id: id(), loadKg: null, reps: null, marker: null, rir: null }; }
    function blankExercise() { return { id: id(), rawName: '', exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [blankSet()], notes: '' }; }
    function blankRecord() { return { id: id(), date: app.getDate(), time: null, label: '오늘 운동', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, exercises: [], notes: '', effort: null, pain: null }; }
    function numeric(form, name) { const raw = String(form.get(name) ?? '').trim(); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Error('유효한 숫자를 입력해 주세요.'); return value; }
    function captureEditor(form = new FormData($('entryForm'))) {
      editor.date = String(form.get('date')); editor.label = String(form.get('label') || '').trim(); editor.time = String(form.get('time') || '') || null;
      editor.durationMinutes = numeric(form, 'durationMinutes'); editor.effort = numeric(form, 'effort'); editor.pain = form.get('pain') || null; editor.notes = String(form.get('notes') || '');
      editor.exercises.forEach((exercise, x) => {
        exercise.rawName = String(form.get(`exercise-${x}`) || '').trim();
        exercise.sets.forEach((set, y) => { for (const key of ['loadKg', 'reps', 'rir']) set[key] = numeric(form, `${x}-${y}-${key}`); set.marker = String(form.get(`${x}-${y}-marker`) || '').trim() || null; });
      });
    }
    function drawEditor(existing = true) {
      openDialog(existing ? '운동 기록 확인' : '새 운동 기록', `<div class="form-grid"><label class="field"><span>날짜</span><input name="date" type="date" min="1900-01-01" max="${I.dateKey()}" value="${e(editor.date)}" required></label>${field('운동 이름', 'label', editor.label, { type: 'text', required: true })}<label class="field"><span>시작 시각 · 선택</span><input name="time" type="time" value="${e(editor.time || '')}"></label>${field('전체 시간 (분) · 선택', 'durationMinutes', editor.durationMinutes ?? '', { min: 1, max: 720 })}${field('체감 강도 0–10 · 선택', 'effort', editor.effort ?? '', { max: 10, step: 1 })}<label class="field"><span>통증</span><select name="pain">${options([['', '미확인'], ['none', '없음'], ['mild', '있음 · 확인 필요'], ['stop', '운동 중단 필요']], editor.pain || '')}</select></label></div><div class="workout-editor">${editor.exercises.map((exercise, x) => `<section class="editor-exercise"><div class="editor-exercise-heading"><label class="field"><span>종목 ${x + 1}</span><input name="exercise-${x}" list="exerciseNames" value="${e(exercise.rawName)}" maxlength="300" required></label>${iconButton('editor-remove-exercise', '종목 삭제', 'trash-2', `data-index="${x}"`)}</div><div class="set-editor-head"><span>kg</span><span>반복</span><span>RIR</span><span>표기</span><span></span></div>${exercise.sets.map((set, y) => `<div class="set-editor-row">${[['loadKg', 10000, 0.1, '부하 kg'], ['reps', 100000, 1, '반복 수'], ['rir', 10, 1, '남길 수 있었던 반복']].map(([key, max, step, label]) => `<input aria-label="종목 ${x + 1} 세트 ${y + 1} ${label}" name="${x}-${y}-${key}" type="number" min="0" max="${max}" step="${step}" value="${set[key] ?? ''}" inputmode="decimal">`).join('')}<input aria-label="종목 ${x + 1} 세트 ${y + 1} 표기" name="${x}-${y}-marker" value="${e(set.marker || '')}" maxlength="32" list="setMarkers">${iconButton('editor-remove-set', '세트 삭제', 'minus', `data-exercise="${x}" data-set="${y}"`)}</div>`).join('')}${command('editor-add-set', '세트', 'plus', `data-index="${x}"`)}</section>`).join('')}${command('editor-add-exercise', '종목', 'plus')}</div><datalist id="exerciseNames">${T.catalog.map(exercise => `<option value="${e(exercise.label)}"></option>`).join('')}</datalist><datalist id="setMarkers"><option value="W"></option><option value="D"></option><option value="A"></option></datalist><label class="field"><span>메모 · 선택</span><textarea name="notes" rows="2" maxlength="10000">${e(editor.notes)}</textarea></label><p class="form-help">빈 숫자는 미확인으로 남습니다. RIR은 마지막 반복 이후 더 할 수 있었던 횟수예요. W·D·A 원문 표기는 그대로 보관합니다.</p>${actions('기록 저장')}`, form => {
        captureEditor(form);
        if (!S.isValidDate(editor.date) || editor.date > I.dateKey()) throw new Error('오늘까지의 운동 날짜를 입력해 주세요.');
        if (!editor.exercises.length && editor.source.kind === 'manual') throw new Error('운동 종목을 하나 이상 추가해 주세요.');
        const next = copy(workspace()), index = next.records.findIndex(item => item.id === editor.id);
        if (editorIsDraft) {
          TS.validate({ ...next, records: [copy(editor)] });
          pendingImport.records = pendingImport.records.map(record => record.id === editor.id ? copy(editor) : record);
          pendingImport.result = TS.mergeRecords(workspace(), pendingImport.records); closeDialog(); render(); toast('초안을 수정했어요. 아직 앱 기록에 저장하지 않았습니다.'); return;
        }
        if (index >= 0) next.records[index] = copy(editor); else next.records.push(copy(editor));
        if (saveWorkspace(next, '운동 일지와 코칭에 반영했어요.')) { chosen = editor.id; closeDialog(); }
      });
      $('entryDialog').classList.add('dialog-wide');
    }
    function recordDialog(record = null, reuse = false) {
      editorIsDraft = false;
      editor = record ? copy(record) : blankRecord();
      if (reuse) {
        editor.id = id(); editor.date = app.getDate(); editor.time = null; editor.durationMinutes = null; editor.effort = null; editor.pain = null;
        editor.source = blankRecord().source; editor.reportedSetCount = null; editor.reportedEnergyKcal = null; editor.reportedVolumeKg = null; editor.notes = '';
        editor.exercises.forEach(exercise => { exercise.id = id(); exercise.reportedVolumeKg = null; exercise.sets.forEach(set => { set.id = id(); set.rir = null; }); });
      }
      if (!editor.exercises.length && !record) editor.exercises.push(blankExercise());
      drawEditor(Boolean(record && !reuse));
    }
    function mappingDialog(record, exercise) {
      const resolved = exercise.exerciseId ? T.catalog.find(row => row.id === exercise.exerciseId) : T.resolveExercise(exercise.rawName, workspace().mappings);
      openDialog('종목과 중량 기준 확인', `<p><strong>${e(exercise.rawName)}</strong></p><div class="form-grid"><label class="field full-width"><span>실제 수행한 운동</span><select name="exerciseId" required><option value="">선택해 주세요</option>${options(T.catalog.map(row => [row.id, row.label]), resolved?.id || '')}</select></label>${field('장비 이름 · 브랜드/위치 · 선택', 'equipmentKey', exercise.equipmentKey || '', { type: 'text' })}<label class="field"><span>기록한 kg 기준</span><select name="loadConvention">${options([['as-recorded', '아직 모름 · 원문 그대로'], ['total', '양쪽/전체 중량'], ['per-side', '한쪽 중량'], ['bodyweight', '맨몸/추가 부하']], exercise.loadConvention)}</select></label></div><p class="form-help">중량 숫자는 환산하지 않아요. 같은 원문명·장비에 이 연결을 기억하지만, 다른 머신의 표시 kg를 동등하게 보지 않습니다.</p><label class="checkbox-field"><input type="checkbox" name="confirmed" required>실제 동작과 기록 기준을 확인했어요.</label>${actions('연결 기억하기')}`, form => {
        const next = copy(workspace()), target = next.records.find(row => row.id === record.id).exercises.find(row => row.id === exercise.id);
        const mapping = { rawName: exercise.rawName, exerciseId: String(form.get('exerciseId')), equipmentKey: String(form.get('equipmentKey') || '').trim() || null, loadConvention: String(form.get('loadConvention')), confirmed: form.get('confirmed') === 'on' };
        if (!T.catalog.some(row => row.id === mapping.exerciseId)) throw new Error('실제 종목을 선택해 주세요.');
        Object.assign(target, { exerciseId: mapping.exerciseId, equipmentKey: mapping.equipmentKey, loadConvention: mapping.loadConvention });
        next.mappings = next.mappings.filter(row => !(row.rawName === mapping.rawName && row.equipmentKey === mapping.equipmentKey)); next.mappings.push(mapping);
        if (saveWorkspace(next, '이 종목과 장비 기준을 기억했어요.')) closeDialog();
      });
    }
    function settingsDialog() {
      const settings = workspace().settings;
      openDialog('훈련 기준', `<div class="form-grid">${field('주당 가능한 날', 'daysPerWeek', settings.daysPerWeek, { min: 1, max: 6, step: 1, required: true })}${field('회당 가능한 시간 (분)', 'sessionMinutes', settings.sessionMinutes, { min: 20, max: 150, step: 5, required: true })}<label class="field full-width"><span>장비</span><select name="equipment">${options([['gym', '헬스장'], ['home', '홈 · 덤벨 보유'], ['bodyweight', '맨몸 · 추가 장비 없음']], settings.equipment)}</select></label></div><fieldset class="priority-muscles"><legend>우선 부위 · 선택</legend>${Object.entries(T.muscleLabels).map(([value, label]) => `<label><input type="checkbox" name="priorityMuscles" value="${value}" ${settings.priorityMuscles.includes(value) ? 'checked' : ''}>${label}</label>`).join('')}</fieldset>${actions()}`, form => {
        const next = copy(workspace()); next.settings = { daysPerWeek: numeric(form, 'daysPerWeek'), sessionMinutes: numeric(form, 'sessionMinutes'), equipment: String(form.get('equipment')), priorityMuscles: form.getAll('priorityMuscles') };
        if (saveWorkspace(next, '시간과 장비에 맞춰 시작 계획을 바꿨어요.')) closeDialog();
      });
    }
    function linkedId(value) { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `workout:${(hash >>> 0).toString(16)}:${value.slice(0, 80)}`; }
    function linkDialog(record) {
      const state = app.getState(), date = record.date;
      if (state.days[date]?.complete) { toast('완료한 날짜의 식사 목표는 유지돼요. 해당 날짜에서 기록을 다시 연 뒤 연결해 주세요.', true); return; }
      const otherSessions = state.days[date]?.sessions || [], existing = otherSessions.find(session => session.id === linkedId(record.id));
      openDialog('식사 목표에 운동 시간 연결', `<p>${e(record.date)} · ${e(record.label)}</p>${otherSessions.some(session => session.id !== linkedId(record.id)) ? '<p class="notice notice-warning">이미 다른 운동 시간이 기록돼 있어요. 같은 운동을 중복 입력하지 않았는지 확인해 주세요.</p>' : ''}<div class="form-grid">${field('실제 세션 시간 (분)', 'durationMin', existing?.durationMin ?? record.durationMinutes ?? '', { min: 1, max: 720, required: true })}<label class="field"><span>실제 운동 종목</span><select name="sport">${options([['strength', '근력운동'], ['running', '달리기'], ['cycling', '사이클'], ['swimming', '수영'], ['walking', '걷기'], ['team', '구기·팀'], ['mixed', '복합 운동']], existing?.sport || 'strength')}</select></label><label class="field"><span>세션 강도</span><select name="intensity">${options([['easy', '가볍게'], ['moderate', '보통'], ['hard', '힘들게']], existing?.intensity || 'moderate')}</select></label></div><p class="form-help">원문의 Cal을 실측값으로 쓰지 않고, 확인한 시간·종목·강도로 순운동 에너지를 추정합니다.</p><label class="checkbox-field"><input type="checkbox" name="confirmed" required>이 운동은 다른 시간 기록과 중복되지 않아요.</label>${actions(existing ? '연결 수정' : '연결')}`, form => {
        const next = copy(app.getState()); if (!next.days[date]) next.days[date] = app.emptyDay(date);
        if (next.days[date].complete) throw new Error('완료한 날짜의 기록을 먼저 열어 주세요.');
        const entry = { id: linkedId(record.id), sport: String(form.get('sport')), durationMin: numeric(form, 'durationMin'), intensity: String(form.get('intensity')) };
        const index = next.days[date].sessions.findIndex(row => row.id === entry.id);
        if (index >= 0) next.days[date].sessions[index] = entry; else next.days[date].sessions.push(entry);
        if (app.save(next, '확인한 운동 시간만 영양 목표에 반영했어요.')) closeDialog();
      });
    }
    function previewRecords(records, warnings = []) {
      const result = TS.mergeRecords(workspace(), records); pendingImport = { records, warnings: [...warnings, ...result.warnings], result };
      tab = 'log'; app.selectView('training'); render();
    }
    function renderImportPreview() {
      if (!$('trainingImportPreview')) { const section = document.createElement('section'); section.id = 'trainingImportPreview'; section.className = 'import-review'; $('trainingContent').prepend(section); }
      const data = pendingImport, result = data.result;
      $('trainingImportPreview').innerHTML = `<div class="section-header"><h2>일지 가져오기 확인</h2>${iconButton('training-import-cancel', '가져오기 취소', 'x')}</div><p>추가 ${result.added} · 경로 갱신 ${result.updated} · 동일 ${result.unchanged} · 보류 ${result.conflicts.length}</p>${[...new Set(data.warnings)].map(line => `<p class="form-help">${e(line)}</p>`).join('')}<div class="import-record-list">${data.records.slice(0, 20).map(record => `<div><span>${record.date}</span><strong>${e(record.label)}</strong><small>${record.exercises.length}종목 · ${sourceNames[record.source.kind]}</small></div>`).join('')}</div>${data.records.length > 20 ? `<p class="form-help">총 ${data.records.length}개 기록입니다.</p>` : ''}${result.conflicts.length ? `<details open><summary>보류한 기록 ${result.conflicts.length}개</summary>${result.conflicts.map((conflict, index) => `<div class="conflict-row"><div><strong>${conflict.incoming.date} · ${e(conflict.incoming.label)}</strong><p>${e(conflict.reason)}</p></div>${command('training-conflict', '비교', 'git-compare-arrows', `data-index="${index}"`)}</div>`).join('')}</details>` : ''}<div class="form-actions">${command('training-import-confirm', '확인한 비충돌 기록 가져오기', 'check', '', true)}${command('training-import-cancel', '취소', 'x')}</div>`;
      $('trainingImportPreview').querySelectorAll('.import-record-list > div').forEach((row, index) => row.insertAdjacentHTML('beforeend', iconButton('training-import-detail', '원문 세트 초안 확인', 'list-checks', `data-id="${e(data.records[index].id)}"`)));
      app.icons();
    }
    function importDialog() {
      openDialog('운동 일지 가져오기', `<div class="import-source-options">${bridge.status?.diaryConfigured ? `<h3>연결된 기존 폴더</h3><div class="form-grid"><label class="field"><span>시작일</span><input type="date" name="from" value="${I.shiftDate(I.dateKey(), -60)}" min="1900-01-01" max="${I.dateKey()}" required></label><label class="field"><span>종료일</span><input type="date" name="to" value="${I.dateKey()}" min="1900-01-01" max="${I.dateKey()}" required></label></div>${actions('폴더 기록 확인')}` : '<p>연결된 폴더가 없어요. JSON 일지 교환 파일을 선택해 주세요.</p>'}<div class="form-divider"></div><label class="field"><span>JSON 일지 교환 파일</span><input id="trainingImportFile" type="file" accept="application/json,.json"></label></div>`, async form => {
        try { const entry = $('entryForm'); const result = await bridge.request('/api/diary/context', { from: String(form.get('from')), to: String(form.get('to')) }); if (!entry.isConnected || !$('entryDialog').open) return; unprocessedImages = result.scan.pending || []; const parsed = TS.fromDiaryContext(result.context); closeDialog(); previewRecords(parsed.records, [...parsed.warnings, ...(result.scan.warning ? [result.scan.warning] : [])]); }
        catch (error) { toast(error.message, true); }
      });
    }
    function conflictDialog(conflict) {
      const describe = record => record ? `${record.date} · ${record.label}\n${sourceNames[record.source.kind]} · ${record.exercises.map(row => `${row.rawName}: ${row.sets.map(set => `${set.loadKg ?? '?'}kg×${set.reps ?? '?'}${set.marker ? `(${set.marker})` : ''}`).join(', ')}`).join('\n')}` : '현재 기록 없음';
      openDialog('겹치는 기록 비교', `<p>${e(conflict.reason)}</p><div class="conflict-comparison"><section><h3>현재 기록</h3><p>${e(describe(conflict.existing))}</p>${imageThumbnail(conflict.existing?.source.hash)}</section><section><h3>가져오는 기록</h3><p>${e(describe(conflict.incoming))}</p>${imageThumbnail(conflict.incoming.source.hash)}</section></div><p class="form-help">변경하기 전 현재 전체 백업을 보관합니다. 같은 운동의 중복이면 하나만 사용해 주세요.</p><label class="checkbox-field"><input name="replace" type="checkbox" required>원문을 확인했고 가져오는 기록 하나를 사용할게요.</label>${actions('이 기록을 명시적으로 선택')}`, () => {
        app.download(S.exportBackup(app.getState()), `macro-engine-before-conflict-${I.dateKey()}.json`);
        const next = copy(workspace());
        const same = next.records.filter(record => record.id === conflict.incoming.id || (record.date === conflict.incoming.date && record.time === conflict.incoming.time && record.label === conflict.incoming.label));
        next.records = next.records.filter(record => !same.some(row => row.id === record.id)); next.records.push(copy(conflict.incoming));
        if (saveWorkspace(next, '확인한 원문으로 이 기록을 선택했어요.')) { pendingImport.records = pendingImport.records.filter(row => row.id !== conflict.incoming.id); pendingImport.result = TS.mergeRecords(workspace(), pendingImport.records); closeDialog(); render(); }
      });
    }
    function imageDialog() {
      if (!bridge.status?.connected) { toast('이미지 코칭은 로컬 앱 주소에서 연결할 수 있어요. 수동 기록과 JSON 가져오기는 지금도 사용할 수 있습니다.', true); return; }
      openDialog('이미지로 기록', `<div class="form-grid"><label class="field"><span>기록 종류</span><select id="imageKind" name="kind">${options([['workout', '운동 일지'], ['meal', '식사 · 영양 라벨'], ['body', '체성분 · 인바디']], 'workout')}</select></label><label class="field"><span>이미지</span><input id="coachImageFile" type="file" accept="image/png,image/jpeg,image/webp" required></label><label class="field full-width"><span>분량·날짜 등 맥락 · 선택</span><textarea id="imageNote" name="note" rows="2" maxlength="6000" placeholder="예: 라벨의 1회 분량 중 절반을 먹었어요"></textarea></label></div><p class="form-help">이미지는 Codex에 전송돼 계정 사용량을 사용합니다. 판독 결과를 확인한 뒤에만 기록에 반영해요.</p>${bridge.status.runtime.available ? actions('이미지 해석 요청') : '<p class="notice notice-warning">Codex 실행 파일을 찾지 못했어요. 직접 기록하거나 JSON 결과를 가져와 주세요.</p>'}`, async form => {
        const entry = $('entryForm'), file = $('coachImageFile').files[0]; if (!file) return;
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 PNG, JPG, WebP를 선택해 주세요.');
          const buffer = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of buffer) binary += String.fromCharCode(byte);
          const uploaded = await bridge.request('/api/inbox', { name: file.name, kind: String(form.get('kind')), base64: btoa(binary) });
          if (!entry.isConnected || !$('entryDialog').open) return;
          closeDialog(); await startJob(String(form.get('kind')), String(form.get('note') || ''), uploaded.hash);
        } catch (error) { toast(error.message, true); }
      });
    }
    async function refreshJobs() {
      if (!bridge.status?.connected) return;
      try { const result = await bridge.request('/api/jobs'); jobs = result.jobs || []; unprocessedImages = unprocessedImages.filter(source => !jobs.some(job => job.imageHash === source.hash && job.status === 'completed')); if (app.getView?.() === 'training') render(); } catch {}
    }
    function inboxHTML() {
      const images = jobs.filter(job => job.kind !== 'chat' && job.kind !== 'unknown');
      return `<details class="image-inbox"><summary>이미지 확인함 <span>${images.length + unprocessedImages.length}</span></summary>${images.length ? images.map(job => `<div class="inbox-row">${imageThumbnail(job.imageHash)}<div><strong>${{ workout: '운동 일지', meal: '식사', body: '몸 상태' }[job.kind]}</strong><span>${e(job.createdAt?.slice(0, 10) || '')} · ${{ completed: '판독 초안', running: '판독 중', cancelled: '취소됨', failed: '확인 필요', interrupted: '중단됨' }[job.status] || '확인 필요'}</span></div>${command('image-job-open', '확인', 'arrow-up-right', `data-id="${e(job.id)}"`)}</div>`).join('') : '<p class="form-help">보관된 이미지 초안이 없어요.</p>'}${unprocessedImages.length ? `<h3>새 폴더 이미지 · 미판독</h3>${unprocessedImages.map(source => `<div class="inbox-row">${imageThumbnail(source.hash)}<div><strong>${e(source.paths[0]?.split(/[\\/]/).at(-1) || '새 이미지')}</strong><span>기존 판독 캐시 없음</span></div>${command('image-source-start', '판독 요청', 'scan-text', `data-hash="${source.hash}"`)}</div>`).join('')}` : ''}</details>`;
    }
    function enhanceChat() {
      if (!$('coachChatInput')) return;
      $('coachChatInput').value = chatDraft;
      $('coachChatForm').querySelector('[type="submit"]').disabled = jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending';
      if (bridge.status?.runtime?.available) {
        const messages = workspace().messages.slice(-40);
        $('coachContent').querySelectorAll('.conversation-message').forEach((element, index) => {
          const item = messages[index];
          if (item.role === 'coach' && item.source === 'local' && item.replyTo && !/119|즉시|응급/.test(item.text)) element.insertAdjacentHTML('beforeend', command('coach-continue', '개인 코치로 이어 묻기', 'messages-square', `data-user="${e(item.replyTo)}"`));
        });
      }
      const log = $('coachContent').querySelector('.conversation-log'), latest = workspace().messages.at(-1)?.id || null;
      log.scrollTop = latest !== lastChatMessage && (chatNearBottom || chatScrollToLatest || lastChatMessage === null) ? log.scrollHeight : chatScrollTop;
      chatScrollToLatest = false;
      lastChatMessage = latest;
    }
    function captureChatScroll() {
      const log = $('coachContent').querySelector('.conversation-log');
      if (log && app.getView?.() === 'coach') { chatScrollTop = log.scrollTop; chatNearBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 32; }
    }
    function renderImagePreview() {
      if (!$('imageDraftPreview')) { const section = document.createElement('section'); section.id = 'imageDraftPreview'; section.className = 'import-review'; $('trainingContent').prepend(section); }
      const result = imageDraft.result;
      $('imageDraftPreview').innerHTML = `<div class="section-header"><h2>이미지 판독 확인</h2>${iconButton('image-draft-dismiss', '초안 닫기', 'x')}</div><div class="image-draft-summary">${imageThumbnail(imageDraft.imageHash)}<div><p class="conversation-text">${e(result.answer)}</p>${result.uncertainties.map(line => `<p class="form-help">${e(line)}</p>`).join('')}${result.questions.map(line => `<p>${e(line)}</p>`).join('')}</div></div>${result.kind === 'workout' ? command('image-workout-preview', '세트 초안 확인', 'list-checks', '', true) : result.kind === 'meal' ? command('image-meal-confirm', '식사 숫자 확인', 'utensils', '', true) : command('image-body-confirm', '측정값 확인', 'scale', '', true)}`;
      app.icons();
    }
    function workoutDraftRecords() {
      return imageDraft.result.workouts.map((session, index) => ({ id: `${imageDraft.imageHash}:${index}`, date: session.date, time: session.time, label: session.label,
        durationMinutes: session.durationMinutes, reportedSetCount: session.reportedSetCount, reportedVolumeKg: session.reportedVolumeKg, reportedEnergyKcal: session.reportedEnergyKcal,
        source: { kind: 'visual', hash: imageDraft.imageHash, paths: [], uncertainties: [...session.uncertainties, ...imageDraft.result.uncertainties, 'Codex 이미지 해석 초안 · 사용자 확인 필요'], revision: imageDraft.id },
        exercises: session.exercises.map((exercise, x) => ({ id: `exercise-${x}`, rawName: exercise.rawName, exerciseId: null, equipmentKey: null, loadConvention: exercise.loadConvention,
          durationMinutes: exercise.durationMinutes, repsTotal: exercise.repsTotal, reportedVolumeKg: exercise.reportedVolumeKg, notes: '', sets: exercise.sets.map((set, y) => ({ id: `set-${x}-${y}`, ...set, rir: null })) })), notes: '', effort: null, pain: null }));
    }
    function confirmMeal() {
      const value = imageDraft.result.meal, job = imageDraft;
      openDialog('画像 식사 초안 확인'.replace('画像', '이미지'), `<p class="form-help">${e(value.note)} ${value.basis === 'estimate' ? '사진 추정값이며 정확한 계량값이 아니에요.' : '먹은 분량이 라벨과 맞는지 확인해 주세요.'}</p><div class="form-grid"><label class="field"><span>먹은 날짜</span><input name="date" type="date" max="${I.dateKey()}" value="${e(value.date)}" required></label>${field('식사 이름', 'name', value.name, { type: 'text', required: true })}${['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG'].map((key, index) => field(['단백질 g', '탄수화물 g', '지방 g', '기타 열량 kcal', '알코올 g'][index], key, value[key] ?? '', { max: key === 'otherKcal' ? 10000 : key === 'alcoholG' ? 500 : 2000, required: true })).join('')}</div><p class="form-help">미확인 숫자는 비워 두었습니다. 추정 근거나 실제 분량을 확인한 뒤 채워 주세요. 모르는 값을 0으로 바꾸지 않아요.</p><label class="checkbox-field"><input name="confirmed" type="checkbox" required>먹은 분량과 숫자를 확인했어요.</label>${actions('확인한 식사 저장')}`, form => {
        const date = String(form.get('date')); if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('먹은 날짜를 확인해 주세요.');
        const next = copy(app.getState()); if (!next.days[date]) next.days[date] = app.emptyDay(date); if (next.days[date].complete) throw new Error('완료한 날짜는 먼저 기록을 다시 열어 주세요.');
        const entry = { id: `image-meal:${job.id}`, name: String(form.get('name')).trim(), source: { kind: value.basis === 'label' ? 'label' : 'image', confidence: value.basis === 'label' ? 'known' : 'estimated', note: value.note, hash: job.imageHash } };
        for (const key of ['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG']) { entry[key] = numeric(form, key); if (entry[key] === null) throw new Error('아직 확인하지 않은 영양 숫자가 있어요.'); }
        if (next.days[date].meals.some(meal => meal.id === entry.id)) throw new Error('이미 저장한 이미지 식사예요. 식사 기록에서 수정해 주세요.');
        next.days[date].meals.push(entry);
        if (app.save(next, '확인한 식사를 출처와 함께 저장했어요.')) { imageDraft = null; closeDialog(); app.setDate(date); app.selectView('today'); }
      });
    }
    function confirmBody() {
      const value = imageDraft.result.body;
      openDialog('측정값 확인', `<div class="form-grid"><label class="field"><span>측정 날짜</span><input name="date" type="date" max="${I.dateKey()}" value="${e(value.date)}" required></label>${field('측정 체중 kg', 'weightKg', value.weightKg ?? '', { min: 20, max: 350 })}${field('체지방률 % · 선택', 'bodyFatPct', value.bodyFatPct ?? '', { min: 2, max: 65 })}${field('골격근량 kg · 선택', 'skeletalMuscleKg', value.skeletalMuscleKg ?? '', { min: 1, max: 200 })}<label class="field"><span>측정 방법</span><select name="bodyFatMethod">${options([['unknown', '모름'], ['bia', '인바디 · 체성분 체중계'], ['dxa', 'DXA'], ['caliper', '피하지방']], value.method)}</select></label></div><label class="checkbox-field"><input name="confirmed" type="checkbox" required>이미지의 측정 날짜와 값을 확인했어요.</label>${actions('측정값 저장')}`, form => {
        const date = String(form.get('date')), weightKg = numeric(form, 'weightKg'), bodyFatPct = numeric(form, 'bodyFatPct'), skeletalMuscleKg = numeric(form, 'skeletalMuscleKg');
        if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('측정 날짜를 확인해 주세요.');
        if ((bodyFatPct !== null || skeletalMuscleKg !== null) && weightKg === null) throw new Error('같은 측정의 체중이 필요해요.');
        const next = copy(app.getState()); if (!next.days[date]) next.days[date] = app.emptyDay(date); if (next.days[date].complete) throw new Error('완료한 날짜는 먼저 기록을 다시 열어 주세요.');
        const existing = next.days[date];
        const hasExisting = ['weightKg', 'bodyFatPct', 'skeletalMuscleKg'].some(key => existing[key] !== null);
        if (hasExisting && form.get('bodyMergeConfirmed') !== 'on') throw new Error('같은 날짜에 이미 측정값이 있어요. 기존값과의 관계를 확인해 주세요.');
        const replacement = form.get('bodyMode') === 'replace';
        Object.assign(existing, {
          weightKg: weightKg === null && !replacement ? existing.weightKg : weightKg,
          bodyFatPct: bodyFatPct === null && !replacement ? existing.bodyFatPct : bodyFatPct,
          skeletalMuscleKg: skeletalMuscleKg === null && !replacement ? existing.skeletalMuscleKg : skeletalMuscleKg,
          bodyFatMethod: bodyFatPct === null && !replacement ? existing.bodyFatMethod : String(form.get('bodyFatMethod'))
        });
        if (app.save(next, '확인한 측정값을 저장했어요.')) { imageDraft = null; closeDialog(); app.setDate(date); app.selectView('today'); }
      });
      const showExisting = () => {
        $('bodyExistingReview')?.remove(); const date = $('entryForm').elements.date.value, previous = app.getState().days[date];
        if (!previous || !['weightKg', 'bodyFatPct', 'skeletalMuscleKg'].some(key => previous[key] !== null)) return;
        const section = document.createElement('section'); section.id = 'bodyExistingReview'; section.className = 'notice notice-warning';
        section.innerHTML = `<strong>이 날짜에 이미 측정값이 있어요.</strong><p>체중 ${fmt(previous.weightKg, 1)}kg · 체지방 ${fmt(previous.bodyFatPct, 1)}% · 골격근 ${fmt(previous.skeletalMuscleKg, 1)}kg</p><label class="field"><span>기존값 처리</span><select name="bodyMode"><option value="merge">미판독 항목은 기존값 유지 · 같은 측정일 때만</option><option value="replace">새 측정으로 교체 · 빈 항목은 지우기</option></select></label><label class="checkbox-field"><input type="checkbox" name="bodyMergeConfirmed" required>유지하는 값은 같은 측정의 값이거나, 새 측정으로 교체할 것을 확인했어요.</label>`;
        $('entryForm').querySelector('.form-actions').before(section);
      };
      $('entryForm').elements.date.addEventListener('change', showExisting); showExisting();
    }
    function chatHTML() {
      const messages = workspace().messages.slice(-40);
      return `<section class="personal-conversation"><div class="section-header"><h2>코치와 대화</h2><div class="segmented compact-segmented" role="group" aria-label="응답 방식"><button type="button" data-action="coach-provider" data-provider="local" aria-pressed="${provider === 'local'}">기록 코치</button><button type="button" data-action="coach-provider" data-provider="codex" aria-pressed="${provider === 'codex'}" ${!bridge.status?.runtime?.available ? 'disabled' : ''}>Codex</button></div></div><span class="conversation-provider">${provider === 'codex' ? '개인 AI · 현재 기록을 전송 · 계정 사용량 사용' : '확인된 기록과 규칙에 기반한 응답 · 개인 AI 아님'}</span><div class="conversation-log" role="log" aria-label="코치 대화">${messages.map(message => `<div class="conversation-message conversation-${message.role}"><span>${message.role === 'user' ? '나' : message.source === 'codex' ? '개인 코치 · Codex' : '기록 코치'}${message.status === 'pending' ? ' · 답변 대기' : ''}</span><p class="conversation-text">${e(message.text)}</p></div>`).join('') || '<div class="conversation-empty"><strong>지금 가장 걸리는 것은 무엇인가요?</strong><span>최근 운동과 식사, 오늘 몸 상태를 함께 살펴볼게요.</span></div>'}</div><form id="coachChatForm" class="conversation-compose"><label class="sr-only" for="coachChatInput">코치에게 질문</label><textarea id="coachChatInput" rows="2" maxlength="6000" placeholder="운동 수행이 떨어지고 허기가 심해. 오늘은 어떻게 할까?" required></textarea><button class="icon-button send-button" type="submit" aria-label="코치에게 보내기" title="코치에게 보내기" ${currentJob?.status === 'running' ? 'disabled' : ''}>${icon('arrow-up')}</button></form>${jobHTML()}<div class="conversation-actions">${command('training-image', '이미지 기록', 'image-plus')}${command('nav-training', '운동 일지', 'dumbbell')}${command('nav-program', '다음 운동', 'calendar-days')}</div>${connectionPanel()}</section>`;
    }
    function jobHTML() {
      if (jobStarting) return `<div class="job-status" role="status"><span>${icon('loader-circle')}코치 요청 연결 중…</span></div>`;
      return currentJob ? `<div class="job-status" role="status"><span>${icon(currentJob.status === 'running' ? 'loader-circle' : currentJob.status === 'completed' ? 'circle-check' : 'circle-alert')}${currentJob.status === 'running' ? '기록을 연결해 생각 중…' : currentJob.status === 'completed' ? '응답 완료' : e(currentJob.error || '요청이 중단됐어요.')}</span>${currentJob.status === 'running' ? iconButton('coach-job-cancel', '코치 요청 취소', 'x') : currentJob.status !== 'completed' ? command('coach-job-retry', '다시 요청', 'rotate-cw') : ''}</div>` : '';
    }
    function coachContextHTML() {
      const report = analysis(), last = report.lastSession;
      return `<section class="coach-training-context"><div class="section-header"><h2>최근 훈련</h2>${iconButton('nav-training', '운동 일지 보기', 'arrow-up-right')}</div>${last ? `<strong>${last.date} · ${e(last.label)}</strong><p>${last.exercises.map(exercise => e(exercise.label || exercise.rawName || '')).filter(Boolean).slice(0, 4).join(' · ')}</p><span class="secondary-text">일반 ${last.workingSets}세트 · RIR 미확인 ${last.unknownEffortSets}세트</span>` : '<p>최근 운동 세트는 아직 확인하지 못했어요.</p>'}<p class="form-help">${e(report.recovery.reasons[0] || '')}</p>${command('nav-program', '다음 훈련 살펴보기', 'calendar-days')}</section>`;
    }
    function message(role, text, source, replyTo = null, status = 'answered', contextDigest = null) { return { id: id(), role, text, createdAt: new Date().toISOString(), source, replyTo, contextDigest, status }; }
    async function sendChat(text) {
      if (!text.trim()) return;
      const local = root.MacroConversation.respond(text, { profile: app.getState().profile, day: app.getDay(), history: app.getState().days, coach: app.coachFor(), trainingAnalysis: analysis(), program: program() });
      const safetyFirst = /safety|urgent|pain|clinical/.test(local.topic);
      const source = safetyFirst ? 'local' : provider;
      if (source === 'codex' && (jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending')) throw new Error('현재 코치 요청이 끝난 뒤 진행해 주세요.');
      const next = copy(workspace()), user = message('user', text.trim(), source, null, source === 'codex' ? 'pending' : 'answered');
      next.messages.push(user);
      chatScrollToLatest = true;
      if (source === 'local') {
        next.messages.push(message('coach', local.text, 'local', user.id)); if (saveWorkspace(next)) chatDraft = ''; app.selectView('coach', false); return;
      }
      if (!saveWorkspace(next)) return;
      chatDraft = '';
      try { await startJob('chat', text.trim(), null, user.id); } catch (error) { answerFailure(user.id, error.message); }
    }
    function answerFailure(replyTo, text) {
      if (!replyTo) { toast(text, true); return; }
      const next = copy(workspace()), user = next.messages.find(row => row.id === replyTo); if (user) user.status = 'answered';
      next.messages.push(message('coach', text, 'codex', replyTo)); saveWorkspace(next);
    }
    async function startJob(kind, question, imageHash = null, replyTo = null, retry = false) {
      if (jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending') throw new Error('현재 코치 요청이 끝난 뒤 진행해 주세요.');
      jobStarting = true; app.render();
      try {
        const job = await bridge.request('/api/jobs', { kind, question, imageHash, state: app.getState(), date: app.getDate(), retry });
        currentJob = { ...job, replyTo };
        if (replyTo) { const next = copy(workspace()); const user = next.messages.find(row => row.id === replyTo); if (user) { user.contextDigest = job.contextDigest; saveWorkspace(next); } }
        if (kind !== 'chat') { tab = 'log'; app.selectView('training'); }
        await pollJob();
      } finally { jobStarting = false; app.render(); }
    }
    async function pollJob() {
      clearTimeout(jobTimer); if (!currentJob) return;
      try {
        const replyTo = currentJob.replyTo, result = await bridge.request(`/api/jobs/${currentJob.id}`); currentJob = { ...result, replyTo };
        if (result.status === 'running' || result.status === 'pending') { app.renderJob?.(); jobTimer = setTimeout(pollJob, 1500); return; }
        if (result.status === 'completed') {
          if (result.kind === 'chat') {
            const next = copy(workspace()), user = next.messages.find(row => row.id === replyTo);
            if (user && !next.messages.some(row => row.replyTo === replyTo && row.contextDigest === result.contextDigest)) {
              user.status = 'answered'; next.messages.push(message('coach', [result.result.answer, ...result.result.questions.map(question => `확인할 것: ${question}`), ...result.result.uncertainties.map(line => `판단의 한계: ${line}`)].join('\n\n'), 'codex', replyTo, 'answered', result.contextDigest)); saveWorkspace(next);
            }
          } else { imageDraft = result; render(); }
        } else if (replyTo) answerFailure(replyTo, result.error || '응답이 중단됐어요. 다시 요청해 주세요.');
        else toast(result.error || '이미지를 읽지 못했어요.', true);
        app.render(); void refreshJobs();
      } catch (error) { currentJob = { ...currentJob, status: 'failed', error: error.message }; if (currentJob.replyTo) answerFailure(currentJob.replyTo, error.message); app.render(); }
    }
    async function connectDialog() {
      await bridge.refresh();
      if (!bridge.status?.connected) throw new Error('로컬 앱 서버에 연결하지 못했어요. 서버를 확인한 뒤 다시 연결해 주세요.');
      const stored = await bridge.request('/api/state');
      const current = app.getState();
      if (!stored.state) { await bridge.attach(current, null); toast('현재 브라우저 기록을 PC 개인 폴더와 연결했어요.'); return; }
      openDialog('PC 기록과 현재 브라우저 확인', `<div class="conflict-comparison"><section><h3>현재 브라우저</h3><p>${current.profile ? '프로필 있음' : '프로필 없음'} · ${Object.keys(current.days).length}일 · 운동 ${current.training?.records.length || 0}개</p></section><section><h3>PC 개인 기록</h3><p>${stored.state.profile ? '프로필 있음' : '프로필 없음'} · ${Object.keys(stored.state.days).length}일 · 운동 ${stored.state.training?.records.length || 0}개</p><p>${e(stored.state.updatedAt)}</p></section></div><p class="form-help">다른 주소의 브라우저 저장소는 서로 분리됩니다. 교체 전 현재 전체 백업을 내려받고 원본 PC 파일의 이전본도 보관합니다.</p><label class="field"><span>사용할 기록</span><select name="choice"><option value="restore">PC 기록을 이 브라우저로 복원</option><option value="upload">현재 브라우저 기록을 PC에 연결</option></select></label><label class="checkbox-field"><input name="confirmed" type="checkbox" required>두 기록을 확인했고 선택한 원본을 사용할게요.</label>${actions('확인한 기록으로 연결')}`, async form => {
        try {
          app.download(S.exportBackup(app.getState()), `macro-engine-before-connect-${I.dateKey()}.json`);
          const choice = form.get('choice');
          if (choice === 'restore') { if (!app.save(stored.state, 'PC 기록을 복원했어요.', true)) return; await bridge.attach(app.getState(), stored.digest); app.resetProfile(); }
          else await bridge.attach(app.getState(), stored.digest);
          closeDialog(); app.render(); toast('PC 기록과 연결됐어요.');
        } catch (error) { toast(error.message, true); }
      });
    }
    async function handleAction(button) {
      const action = button.dataset.action, data = workspace();
      const record = data.records.find(row => row.id === (button.dataset.id || button.dataset.record));
      if (action === 'nav-training' || action === 'nav-program') { tab = action === 'nav-program' ? 'program' : 'log'; app.selectView('training'); }
      else if (action === 'training-tab') { tab = button.dataset.tab; render(); $(`trainingContent`).querySelector(`[data-action="training-tab"][data-tab="${tab}"]`)?.focus(); }
      else if (action === 'training-open') { chosen = button.dataset.id; tab = 'log'; render(); }
      else if (action === 'training-add') recordDialog();
      else if (action === 'training-edit') recordDialog(record);
      else if (action === 'training-reuse') recordDialog(record, true);
      else if (action === 'training-delete') app.confirmDialog('운동 일지 삭제', '이 앱의 일지만 삭제해요. 원본 이미지와 판독 캐시는 유지됩니다. 식사 목표에 연결한 운동 시간은 해당 날짜에서 별도로 확인해 주세요.', '삭제', () => { const next = copy(data); next.records = next.records.filter(row => row.id !== record.id); return saveWorkspace(next, '앱 일지를 삭제했어요. 원본은 유지됩니다.'); });
      else if (action === 'training-map') mappingDialog(record, record.exercises.find(row => row.id === button.dataset.exercise));
      else if (action === 'training-link') linkDialog(record);
      else if (action === 'program-settings') settingsDialog();
      else if (action === 'program-start') {
        const value = program(), selected = value.days[Number(button.dataset.index)]; if (!selected || value.status !== 'ready') throw new Error('현재 적용 가능한 프로그램을 먼저 확인해 주세요.');
        editorIsDraft = false; editor = blankRecord(); editor.label = selected.label; editor.exercises = selected.exercises.map(exercise => ({ ...blankExercise(), rawName: exercise.label, exerciseId: exercise.exerciseId, sets: Array.from({ length: exercise.sets }, blankSet) })); drawEditor(false);
      } else if (action.startsWith('editor-')) {
        captureEditor();
        if (action === 'editor-add-exercise') editor.exercises.push(blankExercise());
        if (action === 'editor-remove-exercise') editor.exercises.splice(Number(button.dataset.index), 1);
        if (action === 'editor-add-set') editor.exercises[Number(button.dataset.index)].sets.push(blankSet());
        if (action === 'editor-remove-set') editor.exercises[Number(button.dataset.exercise)].sets.splice(Number(button.dataset.set), 1);
        $('entryDialog').close(); drawEditor();
        if (action === 'editor-add-set') { const index = Number(button.dataset.index), set = editor.exercises[index].sets.length - 1; $('entryForm').elements[`${index}-${set}-loadKg`]?.focus(); }
        else if (action === 'editor-add-exercise') $('entryForm').elements[`exercise-${editor.exercises.length - 1}`]?.focus();
        else $('entryForm').querySelector('[data-action="editor-add-exercise"]')?.focus();
      } else if (action === 'training-import') importDialog();
      else if (action === 'training-export') app.download(TS.exportExchange(app.getState()), `macro-training-${I.dateKey()}.json`);
      else if (action === 'training-import-cancel') { pendingImport = null; render(); }
      else if (action === 'training-import-detail') { editorIsDraft = true; editor = copy(pendingImport.records.find(record => record.id === button.dataset.id)); drawEditor(); }
      else if (action === 'training-import-confirm') {
        if (!pendingImport) return true;
        const fresh = TS.mergeRecords(workspace(), pendingImport.records);
        const oldConflicts = pendingImport.result.conflicts.map(row => `${row.id}:${row.reason}`).sort().join('|'), newConflicts = fresh.conflicts.map(row => `${row.id}:${row.reason}`).sort().join('|');
        if (oldConflicts !== newConflicts) { pendingImport.result = fresh; render(); toast('미리보기 이후 기록이 바뀌어 충돌을 다시 확인했어요.'); return true; }
        if (saveWorkspace(fresh.workspace, '충돌 없는 기록을 가져왔어요. 보류한 원문은 그대로 남아 있어요.')) { if (fresh.conflicts.length) { pendingImport.records = fresh.conflicts.map(row => row.incoming); pendingImport.result = TS.mergeRecords(workspace(), pendingImport.records); } else pendingImport = null; render(); }
      }
      else if (action === 'training-conflict') conflictDialog(pendingImport.result.conflicts[Number(button.dataset.index)]);
      else if (action === 'training-image') imageDialog();
      else if (action === 'image-source-start') {
        openDialog('새 이미지 판독', `<div class="image-draft-summary">${imageThumbnail(button.dataset.hash)}<label class="field"><span>기록 종류</span><select name="kind">${options([['workout', '운동 일지'], ['meal', '식사'], ['body', '체성분']], 'workout')}</select></label></div><label class="field"><span>날짜·분량 맥락 · 선택</span><textarea name="note" rows="2" maxlength="6000"></textarea></label><p class="form-help">이 이미지를 Codex에 전송해 계정 사용량을 사용합니다. 확인 후에만 기록에 반영해요.</p>${actions('이 이미지 판독 요청')}`, async form => { try { closeDialog(); await startJob(String(form.get('kind')), String(form.get('note') || ''), button.dataset.hash); } catch (error) { toast(error.message, true); } });
      }
      else if (action === 'image-workout-preview') { const records = workoutDraftRecords(); if (!records.length) { toast('판독한 세트가 없어요. 더 선명한 원본이나 날짜를 확인해 주세요.', true); return true; } previewRecords(records); imageDraft = null; render(); }
      else if (action === 'image-meal-confirm') confirmMeal();
      else if (action === 'image-body-confirm') confirmBody();
      else if (action === 'image-draft-dismiss') { imageDraft = null; render(); }
      else if (action === 'coach-provider') { provider = button.dataset.provider; app.render(); }
      else if (action === 'coach-continue') { const user = workspace().messages.find(row => row.id === button.dataset.user); if (user) { provider = 'codex'; chatDraft = user.text; app.selectView('coach'); $('coachChatInput').value = chatDraft; $('coachChatInput').focus(); } }
      else if (action === 'image-job-open') { currentJob = await bridge.request(`/api/jobs/${button.dataset.id}`); if (currentJob.status === 'completed') { imageDraft = currentJob; tab = 'log'; app.selectView('training'); render(); } else { app.selectView('training'); await pollJob(); } }
      else if (action === 'bridge-connect') await connectDialog();
      else if (action === 'bridge-refresh') await bridge.refresh();
      else if (action === 'coach-job-cancel') { await bridge.request(`/api/jobs/${currentJob.id}/cancel`, {}); await pollJob(); }
      else if (action === 'coach-job-retry') { const previous = currentJob; await startJob(previous.kind, previous.question, previous.imageHash, previous.replyTo, true); }
      else return false;
      return true;
    }
    async function handleChange(event) {
      if (event.target.id === 'trainingDate') { const date = event.target.value; if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('오늘까지의 날짜를 선택해 주세요.'); app.setDate(date); return true; }
      if (event.target.id === 'trainingImportFile') {
        const file = event.target.files[0]; if (!file) return true; if (file.size > 8 * 1024 * 1024) throw new Error('일지 JSON은 8MB 이하로 선택해 주세요.');
        const parsed = TS.parseImport(await file.text()); closeDialog(); previewRecords(parsed.records, parsed.warnings); return true;
      }
      return false;
    }
    document.addEventListener('submit', event => { if (event.target.id === 'coachChatForm') { event.preventDefault(); const text = $('coachChatInput').value; void sendChat(text).catch(error => toast(error.message, true)); } });
    document.addEventListener('input', event => { if (event.target.id === 'trainingSearch') { const cursor = event.target.selectionStart; filter = event.target.value; render(); $('trainingSearch').focus(); $('trainingSearch').setSelectionRange(cursor, cursor); } });
    document.addEventListener('input', event => { if (event.target.id === 'coachChatInput') chatDraft = event.target.value; });
    document.addEventListener('error', event => { if (event.target.matches?.('[data-image-fallback]')) { const fallback = document.createElement('span'); fallback.className = 'image-unavailable'; fallback.textContent = '원본 연결 없음'; event.target.replaceWith(fallback); } }, true);
    async function init() {
      await bridge.refresh();
      try { await bridge.resume(app.getState()); } catch (error) { toast(error.message, true); }
      await refreshJobs();
      const pending = workspace().messages.findLast(message => message.role === 'user' && message.status === 'pending' && message.contextDigest);
      if (pending && bridge.status?.connected) { currentJob = { id: pending.contextDigest.slice(0, 32), replyTo: pending.id, status: 'running' }; await pollJob(); }
    }
    return { render, analysis, program, handleAction, handleChange, chatHTML, coachContextHTML, connectionPanel,
      onSave(state) { bridge.sync(state); }, init, jobHTML, enhanceChat, captureChatScroll };
  }
  root.MacroTrainingUI = { create };
})(window);
