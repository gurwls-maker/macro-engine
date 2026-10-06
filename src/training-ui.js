(function (root) {
  'use strict';
  function create(app) {
    const T = root.MacroTraining, TS = root.MacroTrainingStore, S = root.MacroStorage, I = root.MacroInsights;
    const { escape: e, fmt, icon, command, iconButton, id, field, actions, openDialog, closeDialog, toast } = app;
    const $ = name => document.getElementById(name);
    const copy = value => JSON.parse(JSON.stringify(value));
    const sourceNames = { visual: '이미지 판독', 'legacy-ocr': '과거 OCR · 미검증', manual: '직접 기록' };
    const statusNames = { improved: '비교 조건 내 향상', declined: '비교 조건 내 감소', stable: '비슷함', mixed: '변화 혼재', incomparable: '기록 있음 · 비교 보류', insufficient: '같은 조건의 앞선 기록 없음' };
    let tab = 'log', chosen = null, pendingImport = null, filter = '', currentJob = null, jobTimer = null, imageDraft = null;
    let editor = null, editorIsDraft = false, editorAssignmentId = null, chatDraft = '', jobs = [], uploadedImages = [], unprocessedImages = [], inboxError = null, jobStarting = false, followUpDraft = null;
    let scheduleWeek = I.dateKey();
    let editorNewProgram = null, editorNewAssignment = null;
    const intakeQueueKey = `${S.STORAGE_KEY}.image-queue`;
    let intakeQueue = [], intakeQueuePaused = true, intakeQueueError = null, queuePumping = false, imageUploads = [], imageUploadBusy = false;
    let chatScrollTop = 0, lastChatMessage = null, chatNearBottom = true, chatScrollToLatest = false;
    let setupChecking = false, setupNotice = '';
    let reviewDate = null, reviewSessionId = null, reviewBlockId = null, reviewedSessionId = null;
    const aiPreferenceKey = 'macro-engine.codex-use';
    let aiEnabled = true;
    try { aiEnabled = localStorage.getItem(aiPreferenceKey) !== 'disabled'; } catch {}
    let analyzedState = null, analyzedDate = null, cachedAnalysis = null, cachedProgram = null, cachedProgramDate = null;
    const bridge = root.MacroBridge.create(() => app.render());
    function canAskAI() {
      const runtime = bridge.status?.runtime;
      return aiEnabled && bridge.status?.connected === true && runtime?.available === true
        && !['missing-binary', 'login-required', 'check-failed'].includes(runtime.readiness) && runtime.auth?.status !== 'signed-out';
    }
    function aiUsageNote() {
      return bridge.status?.runtime?.auth?.method === 'api-key' ? 'API 키 인증을 사용합니다.' : '사용량은 현재 Codex 인증과 계정 설정을 따릅니다.';
    }
    function connectionState() {
      if (!aiEnabled) return { kind: 'disabled', title: 'Codex 사용을 꺼두었어요', detail: '직접 기록과 기록 요약을 사용합니다. 서버로 실행하면 사진도 보관할 수 있어요. 다시 켜기 전에는 새 상담이나 사진 판독을 요청하지 않으며, 진행 중인 요청과 기존 자료는 그대로 둡니다.' };
      if (location.protocol === 'file:') return { kind: 'file', title: '파일로 열려 있어요', detail: '직접 기록과 계산은 지금 사용할 수 있어요. 사진 보관과 Codex 상담은 이 컴퓨터에서 앱 서버를 실행한 뒤 연결합니다.' };
      if (location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname)) return { kind: 'remote', title: '로컬 앱 주소에서 연결해 주세요', detail: 'Codex와 사진 폴더는 이 컴퓨터의 로컬 서버에 연결합니다. 다른 컴퓨터의 localhost 주소는 이 컴퓨터에 연결되지 않아요.' };
      if (!bridge.status?.connected) return { kind: 'server', title: '앱 서버를 확인해 주세요', detail: '이 주소에서 로컬 서버에 연결하지 못했어요. 프로젝트 폴더에서 앱을 실행하고 터미널에 표시된 주소를 열어 주세요. 브라우저 기록은 유지됩니다.' };
      const runtime = bridge.status.runtime || {};
      if (runtime.readiness === 'missing-binary' || runtime.available !== true) return { kind: 'missing-binary', title: 'Codex 설치가 필요해요', detail: '앱 서버와 사진 보관은 연결됐어요. 자유 상담과 사진 숫자 판독에는 이 컴퓨터에 Codex CLI를 설치해야 합니다.' };
      if (runtime.readiness === 'login-required' || runtime.auth?.status === 'signed-out') return { kind: 'login-required', title: 'Codex 로그인이 필요해요', detail: 'Codex 실행 파일은 찾았지만 로그인되지 않았어요. 이 컴퓨터의 터미널에서 로그인한 뒤 설치·로그인을 다시 확인해 주세요.' };
      if (runtime.readiness === 'check-failed') return { kind: 'check-failed', title: '로그인 상태를 확인하지 못했어요', detail: '설치 확인과 로그인 응답을 끝내지 못했어요. 터미널에서 Codex 로그인 상태를 확인해 주세요. 직접 기록과 사진 보관은 계속 사용할 수 있습니다.' };
      if (runtime.readiness === 'ready') return { kind: 'ready', title: 'Codex 설치·로그인 확인됨', detail: '이 컴퓨터의 설치와 로그인 상태를 확인했어요. 계정 한도나 개별 요청 오류 때문에 실제 상담이 실패할 수 있으며, 질문과 사진은 사용자가 요청할 때만 전송합니다.' };
      return { kind: 'unchecked', title: 'Codex 로그인 상태는 아직 미확인', detail: 'Codex 실행 파일은 찾았어요. 설치·로그인 확인은 AI 상담을 시작하지 않고, 기록이나 사진도 보내지 않습니다.' };
    }
    function connectionCommand(label, value) {
      return `<div class="connection-command"><span>${e(label)}</span><code>${e(value)}</code>${iconButton('connection-copy-command', `${e(label)} 명령 복사`, 'copy', `data-command="${e(value)}"`)}</div>`;
    }
    function setupHTML() {
      const state = connectionState(), runtime = bridge.status?.runtime;
      const local = bridge.status?.connected === true && location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
      const checked = runtime?.checkedAt && Number.isFinite(Date.parse(runtime.checkedAt)) ? new Date(runtime.checkedAt).toLocaleString('ko-KR') : null;
      return `<section class="connection-setup-panel">
        <label class="checkbox-field"><input id="codexUseEnabled" type="checkbox" ${aiEnabled ? 'checked' : ''}>Codex 상담·사진 판독 사용</label>
        <p class="form-help">끄면 새 AI 요청만 중지해요. 진행 중인 요청·기록·사진·대화는 삭제하거나 취소하지 않습니다.</p>
        <div class="connection-setup-status" role="status"><strong>${e(state.title)}</strong><p>${e(state.detail)}</p>${checked ? `<small>마지막 확인 ${e(checked)}</small>` : ''}${setupNotice ? `<p>${e(setupNotice)}</p>` : ''}</div>
        <div class="form-actions">${local ? command('connection-check', setupChecking || runtime?.checking ? '설치·로그인 확인 중' : '설치·로그인 확인', 'refresh-cw', setupChecking || runtime?.checking ? 'disabled' : '', true) : command('connection-refresh', '앱 서버 다시 확인', 'refresh-cw', location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname) ? 'disabled' : '')}</div>
        ${!local ? `<section><h3>앱 실행</h3><p>프로젝트 폴더의 <strong>Macro Engine.cmd</strong>를 더블클릭하면 서버와 브라우저가 열립니다. Node.js는 필요하며 Codex 연결은 선택 사항입니다.</p><details class="source-details"><summary>터미널 실행 대안</summary>${connectionCommand('처음 개발 설치', 'npm ci')}${connectionCommand('앱 시작', 'npm start')}</details><p>파일 주소와 서버 주소는 브라우저 기록이 서로 달라요. 기존 기록은 전체 백업 또는 PC 기록 미리보기로 확인한 뒤 복원합니다.</p></section>` : ''}
        <section><h3>Codex 연결 · 선택</h3>${connectionCommand('Codex CLI 설치', 'npm install -g @openai/codex')}${connectionCommand('계정 로그인', 'codex login')}<p><a href="https://learn.chatgpt.com/docs/cli" target="_blank" rel="noopener noreferrer">공식 CLI 설치 안내</a> · <a href="https://learn.chatgpt.com/docs/auth" target="_blank" rel="noopener noreferrer">공식 로그인 안내</a></p></section>
        <p class="form-help">설치·로그인 확인은 사진이나 기록을 보내지 않고 AI 상담을 시작하지 않아요. 설치나 로그인을 자동 실행하지 않습니다. PC 파일 저장에는 숫자 기록·프로필·계획·대화가 포함되며 원본 사진은 변경하지 않습니다.</p>
        <div class="form-actions">${command('diary-folder', '사진 폴더 설정', 'folder-cog')}${command('training-add', '운동 직접 기록', 'dumbbell')}${command(app.getDay()?.complete ? 'reopen' : 'meal-add', app.getDay()?.complete ? '완료 기록 다시 열기' : '식사 직접 기록', app.getDay()?.complete ? 'pencil' : 'utensils')}${command('dialog-close', '닫기', 'x')}</div>
      </section>`;
    }
    function setupDialog() {
      setupNotice = '';
      openDialog('앱·Codex 연결 설정', `<div id="connectionSetupContent">${setupHTML()}</div>`, () => closeDialog());
    }
    function refreshSetup() {
      if (!$('entryDialog')?.open || !$('connectionSetupContent')) return;
      $('connectionSetupContent').innerHTML = setupHTML(); app.icons();
    }
    function workspace() { return app.getState().training || TS.createEmpty(); }
    function planning(value = workspace()) { return value.planning || TS.createEmpty().planning; }
    function actionLinkedFollowUp(row) { return (workspace().actions || []).some(action => action.status === 'applied' && row.id.startsWith(`${action.id}:followup:`)); }
    function activeProgram() { const value = planning(); return value.programs.find(row => row.id === value.activeProgramId) || null; }
    function saveWorkspace(value, message) { const next = copy(app.getState()); next.training = TS.validate(value); return app.save(next, message); }
    function analysis() {
      const state = app.getState(), date = app.getDate();
      if (state !== analyzedState || date !== analyzedDate) {
        const value = workspace(); cachedAnalysis = T.analyze(value.records, { date, profile: state.profile, checkins: state.days, mappings: value.mappings });
        analyzedState = state; analyzedDate = date; cachedProgram = null;
      }
      return cachedAnalysis;
    }
    // Historical views stay retrospective; new plans use today's recovery context.
    function currentAnalysis() {
      const date = I.dateKey();
      if (app.getDate() === date) return analysis();
      const value = workspace();
      return T.analyze(value.records, { date, profile: app.getState().profile, checkins: app.getState().days, mappings: value.mappings });
    }
    function program() {
      analysis();
      const date = I.dateKey();
      if (!cachedProgram || cachedProgramDate !== date) {
        cachedProgram = T.recommendProgram(app.getState().profile, workspace().settings, currentAnalysis(), planning().preferences);
        cachedProgramDate = date;
      }
      return cachedProgram;
    }
    function coachingProgram() {
      const draft = program(), saved = activeProgram();
      if (!saved || draft.status !== 'ready') return draft;
      const assigned = planning().schedule.filter(row => row.programId === saved.id && row.status === 'planned' && row.date >= app.getDate()).sort((a, b) => a.date.localeCompare(b.date))[0];
      const days = assigned ? [assigned.prescription] : saved.days;
      return { ...draft, source: 'saved', name: saved.name, reason: assigned ? `${assigned.date}에 배치한 처방입니다. 실제 수행은 아직 확인 전이에요.` : '직접 저장한 현재 구성입니다. 날짜를 배치한 계획과 실제 수행은 따로 확인해요.',
        days: days.map(row => ({ label: row.label, exercises: row.exercises.map(exercise => ({ ...exercise, reps: `${exercise.repsMin}~${exercise.repsMax}` })) })) };
    }
    function options(values, selected) { return values.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join(''); }
    function sourceBadge(record) { return `<span class="source-badge ${record.source.kind === 'legacy-ocr' ? 'source-unverified' : ''}">${e(sourceNames[record.source.kind])}</span>`; }
    function dateControl() { return `<label class="field compact-date"><span>분석 기준일</span><input type="date" id="trainingDate" min="1900-01-01" max="${I.dateKey()}" value="${app.getDate()}"></label>`; }
    function imageThumbnail(hash, className = '') { return bridge.status?.connected && hash ? `<img class="diary-thumbnail ${className}" src="/api/images/${e(hash)}" alt="기록 원본" loading="lazy" data-image-fallback>` : ''; }
    function sourceReviewHTML(hash) { return bridge.status?.connected && hash ? `<figure class="image-source-review"><a href="/api/images/${e(hash)}" target="_blank" rel="noopener" aria-label="원본 이미지 크게 보기"><img src="/api/images/${e(hash)}" alt="확인할 원본 이미지" data-image-fallback></a><figcaption>원본</figcaption></figure>` : '<p class="form-help">원본 연결이 없어 숫자를 대조할 수 없어요.</p>'; }
    function todayHTML() {
      const date = app.getDate(), data = workspace(), actual = data.records.filter(row => row.date === date), assigned = planning().schedule.filter(row => row.date === date), due = (data.followUps || []).filter(row => row.status === 'open' && row.reviewDate <= date && !actionLinkedFollowUp(row)).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate)), complete = app.getState().days[date]?.complete === true;
      const latest = data.records.filter(row => row.date <= date).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''))[0];
      return `<section class="today-training-lanes"><div class="section-header"><h2>이어갈 운동·점검</h2><div class="toolbar-actions">${!complete ? command('coach-checkin', '컨디션 기록', 'heart-pulse') : ''}${command('nav-program', '운동 계획 보기', 'calendar-days')}</div></div>${due.map(row => `<div class="today-training-row"><div><strong>${e(row.note)}</strong><span>${row.reviewDate} · 다시 확인할 점검</span></div>${command('coach-followup-edit', '점검 내용 보기', 'arrow-up-right', `data-id="${e(row.id)}"`)}</div>`).join('')}${assigned.map(row => `<div class="today-training-row"><div><strong>${e(row.prescription.label)}</strong><span>${row.status === 'performed' ? '계획에 실제 일지 연결됨' : row.status === 'skipped' ? '건너뛰기로 표시한 계획' : '예정 · 실제 수행 미확인'}</span></div>${row.status === 'planned' && date <= I.dateKey() && !complete ? command('today-schedule-start', '실제 운동 기록', 'plus', `data-id="${e(row.id)}"`) : ''}</div>`).join('')}${actual.map(row => `<div class="today-training-row"><div><strong>${e(row.label)}</strong><span>실제 기록 · ${row.exercises.length}종목${row.time ? ` · ${e(row.time)}` : ''}</span></div>${command('today-workout-open', '일지 보기', 'arrow-up-right', `data-id="${e(row.id)}"`)}</div>`).join('')}${!assigned.length && !actual.length ? '<p class="secondary-text">이 날짜에 배치한 계획과 실제 일지가 없어요.</p>' : ''}${latest && !complete ? `<div class="today-training-reuse"><span>${latest.date} · ${e(latest.label)}</span>${command('today-workout-reuse', '지난 운동으로 새 기록', 'copy', `data-id="${e(latest.id)}"`)}</div>` : ''}</section>`;
    }
    function intakeSummaryHTML() {
      const imageJobs = jobs.filter(row => row.kind !== 'chat' && row.kind !== 'unknown'), hashes = new Set([...uploadedImages, ...unprocessedImages].map(row => row.hash));
      imageJobs.forEach(row => hashes.add(row.imageHash));
      const unconfirmed = imageJobs.filter(row => row.status === 'completed' && !hasStoredImageRecord(row)).length, waiting = intakeQueue.filter(row => ['queued', 'running', 'requesting', 'failed'].includes(row.status)).length;
      return `<section class="today-intake-summary"><div><strong>${unconfirmed ? `확인할 판독 초안 ${unconfirmed}개` : hashes.size ? `보관 사진 ${hashes.size}개` : '사진으로 기록 남기기'}</strong><span>${waiting ? `판독 대기·확인 ${waiting}개` : '확인해 저장하기 전에는 숫자 기록에 포함하지 않아요.'}</span></div><div class="toolbar-actions">${command('training-image', '사진 추가', 'image-plus')}${hashes.size || waiting || inboxError ? command('image-inbox-open', '사진·판독 확인', 'inbox') : ''}</div></section>`;
    }
    function connectionPanel() {
      const status = bridge.status;
      const settings = command('connection-setup', '앱·Codex 연결 설정', 'settings-2'), folder = command('diary-folder', '사진 폴더 설정', 'folder-cog');
      if (!status?.connected) return `<div class="connection-note">${icon('hard-drive')}<div><strong>브라우저 기록 모드</strong><span>직접 기록은 이 브라우저에 저장돼요. 사진 보관·Codex 연결은 앱 서버가 필요합니다.</span></div>${settings}${folder}</div>`;
      const error = status.storageError || status.syncError;
      if (status.syncError && !status.storageError && !bridge.enabled) return `<div class="connection-note connection-error">${icon('shield-alert')}<div><strong>PC 기록 저장 확인 필요</strong><span>${e(status.syncError)} 브라우저 기록과 원본 사진은 유지됩니다.</span></div>${command('bridge-connect', '기록 다시 확인', 'refresh-cw')}${settings}${folder}</div>`;
      return `<div class="connection-note ${error ? 'connection-error' : ''}">${icon(error ? 'shield-alert' : bridge.enabled ? 'circle-check' : 'link')}<div><strong>${error ? 'PC 앱 기록 보호 중' : bridge.enabled ? '앱 기록을 PC 파일에도 저장 중' : 'PC 파일 저장은 선택 사항'}</strong><span>${e(error || (bridge.enabled ? '앱의 숫자 기록·대화·설정을 저장합니다. 원본 사진은 변경하지 않아요.' : status.stored ? `PC에 ${status.stored.days}일 · 운동 ${status.stored.workouts}개가 있어요. 두 기록을 미리보고 선택합니다. 원본 사진은 변경하지 않아요.` : '직접 기록은 지금도 가능합니다. PC 파일에도 저장하려면 현재 기록을 확인한 뒤 연결하세요. 원본 사진은 변경하지 않아요.'))}</span></div>${!bridge.enabled && !error ? command('bridge-connect', status.stored ? 'PC 기록 확인' : '현재 기록을 PC에도 저장', 'link') : ''}${settings}${folder}</div>`;
    }
    function render() {
      const data = workspace(), report = analysis();
      const rows = data.records.filter(record => !filter || `${record.label} ${record.date} ${record.exercises.map(exercise => exercise.rawName).join(' ')}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
      if (!rows.some(record => record.id === chosen)) chosen = rows[0]?.id || null;
      const record = rows.find(item => item.id === chosen);
      $('trainingContent').innerHTML = `<div class="training-toolbar"><div class="segmented" role="group" aria-label="운동 보기">${[['log', '일지'], ['analysis', '분석'], ['program', '프로그램']].map(([value, label]) => `<button type="button" data-action="training-tab" data-tab="${value}" aria-pressed="${tab === value}">${label}</button>`).join('')}</div><div class="toolbar-actions">${command('training-image', '사진 추가', 'image-plus')}${command('training-add', '운동 직접 기록', 'plus', '', true)}</div></div>${tab === 'log' ? `<div class="training-log-grid"><aside class="workout-index"><div class="section-header"><h2>운동 일지 <small>${data.records.length}</small></h2></div><label class="search-field">${icon('search')}<span class="sr-only">운동 기록 검색</span><input type="search" id="trainingSearch" value="${e(filter)}" placeholder="날짜 · 종목 검색"></label><div class="workout-list">${rows.slice(0, 150).map(item => `<button type="button" class="workout-list-item ${item.id === chosen ? 'selected' : ''}" data-action="training-open" data-id="${e(item.id)}" aria-pressed="${item.id === chosen}"><span>${item.date}<small>${e(item.time || '')}</small></span><strong>${e(item.label)}</strong><small>${item.exercises.length}종목 · ${item.durationMinutes == null ? '시간 미확인' : `${fmt(item.durationMinutes)}분`}</small>${sourceBadge(item)}</button>`).join('') || '<p class="empty-state">아직 운동 일지가 없어요.</p>'}</div>${rows.length > 150 ? '<p class="form-help">검색으로 이전 기록을 찾을 수 있어요.</p>' : ''}${command('training-import', '저장된 일지 가져오기', 'folder-input')}${data.records.length ? command('training-export', '일지 내보내기', 'download') : ''}</aside><section class="workout-detail">${record ? renderRecord(record) : `<div class="workout-empty">${icon('dumbbell')}<h2>다음 운동을 이어갈 기록</h2><div class="form-actions">${command('training-import', '판독 기록 가져오기', 'folder-input', '', true)}${command('training-add', '직접 기록', 'plus')}</div></div>`}</section></div>` : tab === 'analysis' ? renderAnalysis(report) : renderProgram(program())}${connectionPanel()}`;
      $('trainingContent').insertAdjacentHTML('beforeend', jobHTML());
      if (bridge.status?.connected) $('trainingContent').insertAdjacentHTML('beforeend', inboxHTML());
      if (pendingImport) renderImportPreview();
      if (imageDraft) renderImagePreview();
      if (tab === 'log' && record) enhanceRecord(record);
      app.icons();
    }
    function enhanceRecord(record) {
      const context = T.sessionContext(record, workspace().mappings);
      const detail = $('trainingContent').querySelector('.workout-detail');
      detail.querySelector('.workout-facts').insertAdjacentHTML('afterend', `<p class="session-block-context">${context.orderConfirmed ? '표시 순서대로 수행 확인' : '표시 순서 · 실제 수행 순서 미확인'} · ${{ straight: '종목별 순차 수행', grouped: '교차·순환 수행', unknown: '수행 방식 미확인' }[context.structure]}${record.sequence?.structure !== 'straight' ? ' · 세트 사이 실제 휴식은 미확인' : ''}</p>`);
      detail.querySelectorAll('.exercise-block').forEach((element, index) => {
        const block = context.blocks[index], exercise = record.exercises[index];
        const role = { external: '외부 중량', assistance: '보조 중량 · 감소가 부하 감소라는 뜻은 아님', unknown: 'kg 의미 미확인' }[block.loadRole];
        const preceding = block.preceding.relatedSets === null ? '선행 세트 수는 순서·순차 수행을 확인해야 해석' : `앞선 일반 ${fmt(block.preceding.workingSets)}세트 · 관련 부위 ${fmt(block.preceding.relatedSets)}세트${block.preceding.sameExerciseSets ? ` · 같은 종목 ${fmt(block.preceding.sameExerciseSets)}세트` : ''}`;
        element.querySelector('.section-header').insertAdjacentHTML('afterend', `<p class="session-block-context">블록 ${block.displayPosition} · ${e(role)} · ${e(preceding)}${block.groupKey ? ` · 묶음 ${e(block.groupKey)}` : ''}</p>`);
        if (block.exerciseId) element.querySelector('.exercise-actions').insertAdjacentHTML('beforeend', command('training-reference', '장비별 중량 기록 보기', 'history', `data-record="${e(record.id)}" data-exercise="${e(exercise.id)}"`));
      });
    }
    function referenceResultHTML(result) {
      const title = { recorded: '선택한 장비의 최근 실제 기록', 'personal-transfer': '개인 기록으로 본 잠정 시작 범위', 'first-session': '첫 실제 기록부터 기준 잡기', unsupported: '숫자 참고보다 조건 확인이 먼저' }[result.status];
      return `<div class="starting-reference-result" aria-live="polite"><h3>${e(title)}</h3>${result.range ? `<p class="starting-reference-range">${fmt(result.range.minKg, 1)}${result.range.maxKg === result.range.minKg ? '' : ` ~ ${fmt(result.range.maxKg, 1)}`} <small>kg · 표시 기준</small></p><p class="form-help">${result.status === 'personal-transfer' ? '서로 다른 장비에서 관찰한 개인 기록의 잠정 관계입니다. 당일 수행이나 적정 중량을 보장하지 않아요.' : '실제로 기록했던 작업 세트 범위입니다. 오늘 해야 할 중량이나 최고 기록 목표가 아닙니다.'}</p>` : ''}${result.reasons.map(line => `<p>${e(line)}</p>`).join('')}${result.transfer ? `<p class="form-help">서로 다른 날의 관찰 짝 ${fmt(result.transfer.pairCount)}개 · 덤벨/바벨 두 배 공식과 무관한 개인 표시 중량 관계</p>` : ''}${result.references.length ? `<details class="source-details"><summary>참고한 실제 세트 ${result.references.length}개</summary>${result.references.slice(0, 12).map(row => `<div class="reference-row"><strong>${e(row.date)}</strong> · ${fmt(row.loadKg, 1)}kg × ${fmt(row.reps)}회 · RIR ${row.rir === null ? '미확인' : fmt(row.rir)}${row.contextKey ? ' · 순서 맥락 확인' : ' · 순서 맥락 미확인'}</div>`).join('')}</details>` : ''}<details class="source-details"><summary>이 참고의 한계</summary>${result.limits.map(line => `<p class="form-help">${e(line)}</p>`).join('')}</details></div>`;
    }
    function referenceDialog(record, exercise) {
      const description = T.describeExercise(exercise, workspace().mappings), context = T.sessionContext(record, workspace().mappings), block = context.blocks.find(row => row.blockId === exercise.id);
      const devices = [...new Set(workspace().records.flatMap(row => row.exercises.map(item => T.describeExercise(item, workspace().mappings).equipmentKey)).filter(Boolean))];
      const general = exercise.sets.filter(row => !row.marker), knownReps = general.map(row => row.reps).filter(value => value !== null), knownRir = general.map(row => row.rir).filter(value => value !== null);
      openDialog('다음 운동에 참고할 중량', `<div class="form-grid"><label class="field full-width"><span>다음에 할 운동</span><select name="referenceExercise">${options(T.catalog.map(row => [row.id, row.label]), description.resolved.id)}</select></label><label class="field full-width"><span>다음에 쓸 장비 · 헬스장과 실제 기구</span><input name="referenceEquipment" maxlength="128" list="referenceDevices" value="${e(description.equipmentKey || '')}" placeholder="예: A헬스장 / 체스트프레스 1번"></label><datalist id="referenceDevices">${devices.map(device => `<option value="${e(device)}"></option>`).join('')}</datalist><label class="field"><span>중량 표기 · 한쪽인지 전체인지</span><select name="referenceConvention">${options([['as-recorded', '미확인'], ['total', '전체 중량'], ['per-side', '한쪽 중량'], ['bodyweight', '맨몸·추가 부하']], description.loadConvention)}</select></label><label class="field"><span>중량 종류</span><select name="referenceRole">${options([['unknown', '미확인'], ['external', '들어 올린 중량'], ['assistance', '몸을 도와주는 보조 중량']], description.loadRole)}</select></label>${field('최소 반복 수 · 선택', 'referenceRepsMin', knownReps.length ? Math.min(...knownReps) : '', { min: 1, max: 100000 })}${field('최대 반복 수 · 선택', 'referenceRepsMax', knownReps.length ? Math.max(...knownReps) : '', { min: 1, max: 100000 })}${field('더 할 수 있었던 반복 (RIR) · 선택', 'referenceRir', knownRir.length && new Set(knownRir).size === 1 ? knownRir[0] : '', { min: 0, max: 10, step: 0.5 })}</div>${block?.contextKey ? '<label class="checkbox-field"><input type="checkbox" name="sameContext">이 블록과 비슷한 순서·선행 운동 구성으로 할 예정이에요.</label>' : '<p class="form-help">이 기록의 순서·수행 방식이 미확인이라 같은 맥락의 환산 근거로는 사용하지 않습니다.</p>'}<div id="startingReferenceResult"></div>${actions('중량 기록 조회')}`, form => {
        const request = { exerciseId: String(form.get('referenceExercise')), equipmentKey: String(form.get('referenceEquipment') || '').trim() || null, loadConvention: String(form.get('referenceConvention')), loadRole: String(form.get('referenceRole')), repsMin: numeric(form, 'referenceRepsMin'), repsMax: numeric(form, 'referenceRepsMax'), rir: numeric(form, 'referenceRir'), contextKey: form.get('sameContext') === 'on' ? block.contextKey : null,
          source: { exerciseId: description.resolved.id, equipmentKey: description.equipmentKey, loadConvention: description.loadConvention, loadRole: description.loadRole } };
        if (request.repsMin !== null && request.repsMax !== null && request.repsMin > request.repsMax) throw new Error('최소 반복이 최대 반복보다 큽니다.');
        const result = T.startingReference(workspace().records, request, { date: I.dateKey(), mappings: workspace().mappings, recovery: currentAnalysis().recovery });
        $('startingReferenceResult').innerHTML = referenceResultHTML(result);
        $('startingReferenceResult').scrollIntoView({ block: 'nearest' });
      });
      $('entryForm').insertAdjacentHTML('afterbegin', `<p class="form-help">${I.dateKey()} 기준 · 선택한 장비에서 실제로 들었던 중량을 우선합니다. 다른 장비는 충분한 개인 기록이 있을 때만 잠정 범위를 보여 줍니다. 오늘의 목표 중량은 아닙니다.</p>`);
      const invalidate = () => {
        if ($('startingReferenceResult').children.length) $('startingReferenceResult').innerHTML = '<p class="form-help" role="status">선택한 조건이 바뀌었어요. 참고 기록을 다시 조회해 주세요.</p>';
      };
      $('entryForm').addEventListener('input', invalidate);
      $('entryForm').addEventListener('change', invalidate);
      $('entryDialog').classList.add('dialog-wide');
    }
    function renderRecord(record) {
      const linked = app.getState().days[record.date]?.sessions.some(session => session.id === linkedId(record.id));
      return `<div class="workout-heading"><div><span class="eyebrow">${record.date}${record.time ? ` · ${e(record.time)}` : ''}</span><h2>${e(record.label)}</h2>${sourceBadge(record)}</div><div class="toolbar-actions">${command('training-reuse', '복사해 새 기록', 'copy', `data-id="${e(record.id)}"`)}${command('training-edit', '일지 수정', 'pencil', `data-id="${e(record.id)}"`)}${iconButton('training-delete', '운동 일지 삭제', 'trash-2', `data-id="${e(record.id)}"`)}</div></div><div class="workout-facts"><div><span>기록 시간</span><strong>${fmt(record.durationMinutes)}<small> 분</small></strong></div><div><span>종목</span><strong>${record.exercises.length}<small> 개</small></strong></div><div><span>원문 세트</span><strong>${fmt(record.reportedSetCount)}<small> 세트</small></strong></div><div><span>체감 강도</span><strong>${fmt(record.effort)}<small> / 10</small></strong></div></div>${record.pain === 'stop' || record.pain === 'mild' ? `<p class="notice notice-warning">${record.pain === 'stop' ? '중단이 필요한 통증' : '통증'}을 기록했어요. 새 증량보다 증상 확인과 개별 평가가 먼저예요.</p>` : ''}<div class="workout-source-row">${imageThumbnail(record.source.hash)}<div>${record.source.paths.map(name => `<span class="source-filename">${e(name.split(/[\\/]/).at(-1))}</span>`).join('')}${record.source.uncertainties.length ? `<details class="source-details"><summary>확인할 원문 ${record.source.uncertainties.length}개</summary><ul>${record.source.uncertainties.map(item => `<li>${e(item)}</li>`).join('')}</ul></details>` : ''}</div></div>${record.exercises.length ? record.exercises.map(exercise => {
        const description = T.describeExercise(exercise, workspace().mappings);
        const resolved = description.resolved;
        const basis = { total: '전체 중량', 'per-side': '한쪽 중량', bodyweight: '맨몸·추가 부하', 'as-recorded': '중량 기준 미확인' }[description.loadConvention];
        const metadata = [
          ['운동 분류', resolved?.label || '미확인'],
          ['장비', `${description.equipmentKey || '미확인'}${description.equipmentSource?.startsWith('name-') ? ' · 운동명에서 읽음' : ''}`],
          ['중량 표기', `${basis}${description.loadConventionSource === 'name-rule' ? ' · 운동명 기준' : description.ruleConflict ? ' · 운동명 기준과 충돌' : ''}`],
          ['자극 부위', resolved ? resolved.primaryMuscles.map(muscle => T.muscleLabels[muscle]).join(' · ') : '미확인']
        ];
        return `<section class="exercise-block"><div class="section-header"><h3>${e(exercise.rawName)}</h3></div><dl class="exercise-details">${metadata.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>${exercise.sets.length ? `<div class="set-table" role="table" aria-label="${e(exercise.rawName)} 세트"><div class="set-table-head" role="row"><span role="columnheader">세트</span><span role="columnheader">중량 kg</span><span role="columnheader">반복</span><span role="columnheader">RIR</span></div>${exercise.sets.map((set, index) => `<div class="set-table-row ${set.marker === 'W' ? 'set-warmup' : ''}" role="row"><span role="cell">${e(set.marker || String(index + 1))}</span><strong role="cell">${fmt(set.loadKg, 1)}</strong><strong role="cell">${fmt(set.reps)}</strong><span role="cell">${fmt(set.rir)}</span></div>`).join('')}</div>` : `<p class="form-help">${exercise.durationMinutes == null ? '세트 상세가 없는 기록이에요.' : `${fmt(exercise.durationMinutes)}분 기록`}</p>`}${exercise.notes ? `<p class="form-help">${e(exercise.notes)}</p>` : ''}<div class="form-actions exercise-actions">${command('training-map', '운동·장비 수정', 'pencil', `data-record="${e(record.id)}" data-exercise="${e(exercise.id)}"`)}</div></section>`;
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
      const coverage = row.historyCoverage;
      const status = row.status === 'insufficient' && coverage?.otherConditionGroupCount > 0 ? '기록 있음 · 조건별 분리' : statusNames[row.status] || row.status;
      const links = [row.previous, row.current].filter(value => value?.sessionId).map(value => command('training-open', `${value.date} 일지 보기`, 'notebook-pen', `data-id="${e(value.sessionId)}"`)).join('');
      return `<div class="progression-row"><div><strong>${e(row.label)}</strong><span>${e(row.equipmentKey || '장비 미확인')}</span></div>
        <div><strong>${e(row.previous ? `${point(row.previous)} → ${point(row.current)}` : `현재 ${point(row.current)}`)}</strong><span>${row.previous ? `${row.previous.date} → ` : ''}${row.current?.date || ''}</span>${coverage ? `<p class="progression-coverage">최근 28일 · 같은 운동 ${coverage.exerciseDayCount}일 · 이 장비·표기 ${coverage.equipmentDayCount}일 · 같은 기록 조건 ${coverage.conditionDayCount}일</p>` : ''}<p class="progression-explanation">${e(row.reason)}</p></div>
        <div class="progression-actions"><span class="source-badge">${e(status)}</span>${links}</div></div>`;
    }
    function renderProgram(value) {
      const settings = workspace().settings;
      return `${savedProgramHTML()}<section class="program-template"><div class="section-header"><div><span class="eyebrow">새 시작 초안 · 아직 저장 전</span><h2>${e(value.name)}</h2></div><div class="toolbar-actions">${command('program-settings', '운동 일정·환경 설정', 'sliders-horizontal')}${command('program-preferences', '선호·제외 운동', 'list-filter')}${value.status === 'ready' ? command('program-save', '이 초안 저장', 'save', '', true) : ''}</div></div><div class="program-meta"><span>주 ${fmt(settings.daysPerWeek)}회</span><span>회당 ${fmt(settings.sessionMinutes)}분</span><span>${e({ gym: '헬스장', home: '홈 · 덤벨', bodyweight: '맨몸' }[settings.equipment] || settings.equipment)}</span></div><p class="program-reason">${e(value.reason)}</p>${value.days.length ? `<details class="source-details" ${activeProgram() ? '' : 'open'}><summary>시작 초안의 운동 구성</summary><div class="program-days">${value.days.map((item, index) => `<section class="program-day"><div class="section-header"><h3>${e(item.label)}</h3>${command('program-start', '이 구성으로 기록', 'notebook-pen', `data-index="${index}"`)}</div>${item.exercises.map(exercise => `<div class="program-exercise"><strong>${e(exercise.label)}</strong><span>${exercise.sets} × ${e(exercise.reps)} · RIR ${exercise.rir}</span><small>휴식 ${exercise.restSeconds}초</small></div>`).join('')}</section>`).join('')}</div></details>` : ''}<div class="program-principles"><section><h3>다음 중량</h3><p>${e(value.progression)}</p></section><section><h3>휴식과 디로딩</h3><p>${e(value.deload)}</p></section></div><details class="source-details"><summary>적용 범위와 한계</summary><ul>${value.limitations.map(line => `<li>${e(line)}</li>`).join('')}</ul></details></section>`;
    }
    const targetText = row => `${row.sets}세트 × ${row.repsMin}–${row.repsMax}회 · RIR ${row.rir} 이상 · 휴식 ${row.restSeconds}초${row.loadKg === null ? ' · 중량 미지정' : ` · ${fmt(row.loadKg, 1)}kg`}`;
    function savedProgramHTML() {
      const value = planning(), saved = activeProgram(), end = I.shiftDate(scheduleWeek, 6);
      const scheduled = value.schedule.filter(row => row.date >= scheduleWeek && row.date <= end).sort((a, b) => a.date.localeCompare(b.date));
      const due = value.schedule.filter(row => row.adjustment && !row.adjustment.reviewed && row.adjustment.reviewDate <= I.dateKey());
      return `<section class="saved-program"><div class="section-header"><h2>내 프로그램</h2>${saved ? command('program-schedule', '날짜에 배치', 'calendar-plus', '', true) : ''}</div>${value.programs.length ? `<label class="field"><span>저장한 프로그램</span><select id="savedProgramSelect">${options(value.programs.map(row => [row.id, row.name]), value.activeProgramId)}</select></label>` : '<p class="empty-state">저장한 프로그램이 아직 없어요.</p>'}${saved ? `<div class="program-days">${saved.days.map(day => `<section class="program-day"><div class="section-header"><h3>${e(day.label)}</h3>${command('program-edit-day', '운동 구성 수정', 'pencil', `data-day="${e(day.id)}"`)}</div>${day.exercises.map(row => `<div class="program-exercise"><strong>${e(row.label)}</strong><span>${e(targetText(row))}</span></div>`).join('')}</section>`).join('')}</div>` : ''}
        <div class="section-header"><h3>배치한 훈련</h3><div class="toolbar-actions">${iconButton('schedule-week', '이전 주', 'chevron-left', 'data-offset="-7"')}<label class="field compact-date"><span>주 시작일</span><input type="date" id="scheduleWeek" value="${scheduleWeek}" min="1900-01-01" max="2199-12-25"></label>${iconButton('schedule-week', '다음 주', 'chevron-right', 'data-offset="7"')}</div></div><span class="secondary-text">${scheduleWeek} ~ ${end}</span>${scheduled.length ? scheduled.map(scheduleHTML).join('') : '<p class="empty-state">배치한 계획이 없어요. 비어 있는 날은 휴식일이 아닙니다.</p>'}${due.length ? `<section class="recovery-section"><h3>다시 확인할 조정</h3>${due.map(row => `<div class="progression-row"><div><strong>${row.adjustment.reviewDate} · ${e(row.prescription.label)}</strong><span>${e(row.adjustment.reason)}</span></div>${command('schedule-review', '조정 결과 기록', 'clipboard-check', `data-id="${e(row.id)}"`)}</div>`).join('')}</section>` : ''}</section>`;
    }
    function scheduleHTML(row) {
      const evaluation = T.evaluateAssignment(row, workspace().records, workspace().mappings), locked = app.getState().days[row.date]?.complete;
      const status = { planned: '예정 · 수행 미확인', skipped: '사용자가 건너뜀', performed: '실제 일지 연결됨' }[row.status];
      const data = `data-id="${e(row.id)}"`;
      const recordActions = row.status === 'planned' && row.date <= I.dateKey() ? command('schedule-start', '실제 운동 기록', 'notebook-pen', data) + command('schedule-link', '기존 일지 연결', 'link', data) : '';
      const planActions = row.status === 'planned' && !locked ? command('schedule-move', '날짜 변경', 'calendar-days', data) + command('schedule-adjust', '세트·중량 조정', 'sliders-horizontal', data) + command('schedule-skip', '건너뛰기', 'circle-slash', data) : '';
      return `<section class="program-day scheduled-session" data-schedule-id="${e(row.id)}"><div class="section-header"><div><span class="eyebrow">${row.date}</span><h3>${e(row.prescription.label)}</h3><span class="source-badge">${status}</span></div><div class="toolbar-actions">${recordActions}${planActions}${row.recordId ? command('training-open', '수행 일지', 'arrow-up-right', `data-id="${e(row.recordId)}"`) : ''}</div></div>${row.adjustment ? `<p class="form-help">${{ maintain: '유지', progression: '사용자 중량 선택', deload: '훈련 부담 낮추기' }[row.adjustment.kind]} · ${e(row.adjustment.reason)} · ${row.adjustment.reviewDate} 다시 확인${row.adjustment.reviewed ? ' · 검토 완료' : ''}</p>` : ''}<details class="source-details"><summary>계획과 실제 기록 ${evaluation.status === 'met' ? '· 기록 조건 확인' : ''}</summary>${row.prescription.exercises.map(target => { const actual = evaluation.rows.find(item => item.id === target.id); return `<div class="program-exercise"><strong>${e(target.label)}</strong><span>${e(targetText(target))}</span><small>${actual ? `실제 일반 ${actual.recordedSets}세트 · ${{ met: '반복 범위·RIR 여유 확인', different: '계획과 차이 있음', partial: '일부 세트만 기록', unknown: '비교할 숫자·기준 미확인', unrecorded: '연결된 종목 미확인' }[actual.status]}` : '실제 수행 미확인'}</small></div>`; }).join('')}<p class="form-help">${e(evaluation.message)}</p></details>${locked && row.status === 'planned' ? '<p class="form-help">완료한 날짜의 처방과 영양 목표는 유지됩니다. 실제 수행 일지는 별도로 연결할 수 있어요.</p>' : ''}</section>`;
    }
    function ensurePlanDate(date, allowCompleted = false) {
      if (!S.isValidDate(date)) throw new Error('계획 날짜를 확인해 주세요.');
      if (!allowCompleted && app.getState().days[date]?.complete) throw new Error('완료한 날짜에는 계획을 바꾸지 않아요. 다른 날짜를 선택해 주세요.');
    }
    function saveProgramDialog() {
      const draft = program(); if (draft.status !== 'ready') throw new Error('현재 저장 가능한 시작 초안이 없어요.');
      openDialog('시작 초안 저장', `${field('프로그램 이름', 'name', draft.name, { type: 'text', required: true })}<p class="form-help">저장한 뒤 운동별 구성과 날짜를 직접 정할 수 있어요. 실제 수행으로 기록되지 않습니다.</p>${actions('프로그램 저장')}`, form => {
        const next = copy(workspace()); next.planning = copy(planning());
        const saved = T.createProgram(draft, { id: id(), name: String(form.get('name')), createdAt: new Date().toISOString() });
        next.planning.programs.push(saved); next.planning.activeProgramId = saved.id;
        if (saveWorkspace(next, '시작 프로그램을 저장했어요. 실제 훈련은 별도로 기록합니다.')) closeDialog();
      });
    }
    function editProgramDay(dayId) {
      const saved = activeProgram(), day = saved?.days.find(row => row.id === dayId); if (!day) throw new Error('수정할 세션을 찾을 수 없어요.');
      const exerciseSelect = (name, value, blank = false) => {
        const original = day.exercises.find(row => row.exerciseId === value);
        const unknown = original && !T.catalog.some(row => row.id === value);
        const preserved = unknown ? `<option value="${e(value)}" selected>${e(original.label)} · 카탈로그 미등록 (${e(value)})</option>` : '';
        return `<label class="field full-width"><span>운동</span><select name="${name}">${blank ? '<option value="">추가 안 함</option>' : ''}${preserved}${options(T.catalog.map(row => [row.id, row.label]), value)}</select></label>`;
      };
      openDialog('저장 프로그램 구성', `${field('프로그램 이름', 'programName', saved.name, { type: 'text', required: true })}${field('세션 이름', 'label', day.label, { type: 'text', required: true })}${day.exercises.map((row, index) => `<section class="editor-exercise"><h3>운동 ${index + 1}</h3><div class="form-grid">${exerciseSelect(`${index}-exercise`, row.exerciseId)}${field('세트', `${index}-sets`, row.sets, { min: 1, max: 20, step: 1, required: true })}${field('최소 반복', `${index}-repsMin`, row.repsMin, { min: 1, max: 100, step: 1, required: true })}${field('최대 반복', `${index}-repsMax`, row.repsMax, { min: 1, max: 100, step: 1, required: true })}${field('최소 RIR 여유', `${index}-rir`, row.rir, { min: 0, max: 10, required: true })}${field('휴식 (초)', `${index}-restSeconds`, row.restSeconds, { min: 0, max: 1800, step: 1, required: true })}${field('중량 kg · 선택', `${index}-loadKg`, row.loadKg ?? '', { min: 0, max: 10000 })}${field('기구·브랜드·위치 · 선택', `${index}-equipmentKey`, row.equipmentKey || '', { type: 'text' })}<label class="field"><span>중량 표기 기준</span><select name="${index}-loadConvention">${options([['as-recorded', '아직 모름'], ['total', '전체 중량'], ['per-side', '한쪽 중량'], ['bodyweight', '맨몸·추가 부하']], row.loadConvention)}</select></label></div><label class="checkbox-field"><input type="checkbox" name="${index}-remove">이 운동 제외</label></section>`).join('')}<section class="editor-exercise"><h3>운동 추가 · 선택</h3>${exerciseSelect('addExercise', '', true)}</section><p class="form-help">변경은 앞으로 배치할 계획에 적용됩니다. 이미 배치한 날짜의 처방과 실제 일지는 그대로 보존해요. 다른 기구로 교체하면 기존 중량은 가져오지 않습니다.</p>${actions('구성 저장')}`, form => {
        const next = copy(workspace()), target = next.planning.programs.find(row => row.id === saved.id), selected = target.days.find(row => row.id === day.id);
        target.name = String(form.get('programName')).trim(); target.source = 'user'; selected.label = String(form.get('label')).trim();
        selected.exercises = day.exercises.filter((row, index) => form.get(`${index}-remove`) !== 'on').map(row => {
          const index = day.exercises.indexOf(row), chosenId = String(form.get(`${index}-exercise`)), exercise = T.catalog.find(item => item.id === chosenId);
          if (!exercise && chosenId !== row.exerciseId) throw new Error('기존 원문 운동을 유지하거나 확인한 카탈로그 운동을 선택해 주세요.');
          const changed = chosenId !== row.exerciseId;
          const result = { ...row, exerciseId: chosenId, label: exercise?.label || row.label };
          for (const key of ['sets', 'repsMin', 'repsMax', 'rir', 'restSeconds', 'loadKg']) result[key] = numeric(form, `${index}-${key}`);
          result.equipmentKey = String(form.get(`${index}-equipmentKey`) || '').trim() || null; result.loadConvention = String(form.get(`${index}-loadConvention`));
          if ((result.equipmentKey !== row.equipmentKey || result.loadConvention !== row.loadConvention) && row.loadKg !== null && result.loadKg === row.loadKg) result.loadKg = null;
          if (changed) { result.loadKg = null; result.equipmentKey = null; result.loadConvention = 'as-recorded'; }
          return result;
        });
        const added = T.catalog.find(row => row.id === form.get('addExercise'));
        if (added) selected.exercises.push({ id: id(), exerciseId: added.id, label: added.label, sets: 2, repsMin: 8, repsMax: 12, rir: 3, restSeconds: 120, loadKg: null, equipmentKey: null, loadConvention: 'as-recorded' });
        if (saveWorkspace(next, '저장한 구성을 바꿨어요. 이미 배치한 처방은 유지됩니다.')) closeDialog();
      });
      $('entryDialog').classList.add('dialog-wide');
    }
    function scheduleProgramDialog() {
      const saved = activeProgram(); if (!saved) throw new Error('프로그램을 먼저 저장해 주세요.');
      openDialog('날짜에 훈련 배치', `<h3>${e(saved.name)}</h3>${saved.days.map((day, index) => `<label class="field"><span>${e(day.label)} · 선택</span><input name="date-${index}" type="date" min="1900-01-01" max="2200-12-31"></label>`).join('')}<p class="form-help">선택한 날짜에만 계획을 배치합니다. 빈 날짜와 운동 예정은 실제 수행·휴식 기록이 아닙니다.</p>${actions('선택한 날짜에 배치')}`, form => {
        const next = copy(workspace()); let first = null;
        saved.days.forEach((day, index) => { const date = String(form.get(`date-${index}`) || ''); if (!date) return; ensurePlanDate(date);
          if (next.planning.schedule.some(row => row.date === date && row.programId === saved.id && row.dayId === day.id && row.status !== 'skipped')) throw new Error('같은 날짜에 같은 세션이 이미 배치되어 있어요.');
          next.planning.schedule.push(T.createAssignment(saved, day.id, date, id())); if (!first || date < first) first = date;
        });
        if (!first) throw new Error('배치할 날짜를 하나 이상 선택해 주세요.');
        if (saveWorkspace(next, '선택한 날짜에 계획만 배치했어요.')) { scheduleWeek = first; closeDialog(); render(); }
      });
    }
    function preferencesDialog() {
      const prefs = planning().preferences;
      openDialog('선호·제외 운동', `<div class="form-grid">${T.catalog.map(row => `<label class="field"><span>${e(row.label)}</span><select name="pref-${row.id}">${options([['neutral', '기본'], ['preferred', '선호'], ['excluded', '제외']], prefs.excludedExerciseIds.includes(row.id) ? 'excluded' : prefs.preferredExerciseIds.includes(row.id) ? 'preferred' : 'neutral')}</select></label>`).join('')}</div><p class="form-help">새 시작 초안에 반영합니다. 저장·배치한 프로그램은 자동으로 바꾸지 않아요. 선호 운동은 가능한 장비·동작 유형 안에서 적용하며 동등한 자극을 보장하지 않습니다.</p>${actions('선호 저장')}`, form => {
        const next = copy(workspace()); next.planning = copy(planning()); next.planning.preferences = { preferredExerciseIds: [], excludedExerciseIds: [] };
        T.catalog.forEach(row => { const value = form.get(`pref-${row.id}`); if (value === 'preferred') next.planning.preferences.preferredExerciseIds.push(row.id); if (value === 'excluded') next.planning.preferences.excludedExerciseIds.push(row.id); });
        if (saveWorkspace(next, '다음 시작 초안에 운동 선호를 반영했어요.')) closeDialog();
      });
      $('entryDialog').classList.add('dialog-wide');
    }
    function assignmentDialog(row, mode) {
      ensurePlanDate(row.date, mode === 'link');
      if (row.status !== 'planned') throw new Error('아직 수행하지 않은 계획만 변경할 수 있어요.');
      if (mode === 'move') {
        openDialog('계획 날짜 변경', `<label class="field"><span>새 날짜</span><input name="date" type="date" value="${row.date}" required></label>${row.adjustment ? `<label class="field"><span>다시 확인할 날짜</span><input name="reviewDate" type="date" value="${row.adjustment.reviewDate}" required></label>` : ''}${actions('날짜 변경')}`, form => { const date = String(form.get('date')); ensurePlanDate(date); const next = copy(workspace()), target = next.planning.schedule.find(item => item.id === row.id); if (next.planning.schedule.some(item => item.id !== row.id && item.date === date && item.programId === row.programId && item.dayId === row.dayId && item.status !== 'skipped')) throw new Error('그 날짜에 같은 세션이 이미 배치되어 있어요.'); target.date = date; if (target.adjustment) target.adjustment.reviewDate = String(form.get('reviewDate')); if (saveWorkspace(next, '계획 날짜만 바꿨어요.')) { scheduleWeek = date; closeDialog(); render(); } });
      } else if (mode === 'link') {
        const linked = new Set(planning().schedule.map(item => item.recordId)), records = workspace().records.filter(item => item.date === row.date && !linked.has(item.id));
        if (!records.length) throw new Error('이 날짜에 연결할 실제 일지가 없어요. 먼저 수행 기록을 남겨 주세요.');
        openDialog('실제 수행 일지 연결', `<label class="field"><span>같은 날짜의 실제 운동</span><select name="recordId">${options(records.map(item => [item.id, `${item.time || ''} ${item.label}`]), records[0].id)}</select></label><label class="checkbox-field"><input type="checkbox" required>이 계획에 대응하는 실제 일지를 확인했어요.</label>${actions('일지 연결')}`, form => { const next = copy(workspace()), target = next.planning.schedule.find(item => item.id === row.id); target.recordId = String(form.get('recordId')); target.status = 'performed'; if (saveWorkspace(next, '실제 기록을 연결했어요. 계획과 수행은 따로 보존됩니다.')) closeDialog(); });
      } else if (mode === 'adjust') {
        openDialog('다음 훈련 조정 선택', `<p>${row.date} · ${e(row.prescription.label)}</p><div class="form-grid"><label class="field"><span>조정 종류</span><select name="kind">${options([['maintain', '유지하고 다시 확인'], ['deload', '부담 낮추기 · 직접 선택'], ['progression', '다음 중량 · 직접 선택']], 'maintain')}</select></label><label class="field"><span>다시 확인할 날짜</span><input name="reviewDate" type="date" min="${row.date}" value="${I.shiftDate(row.date, 7)}" required></label></div><label class="field"><span>선택 이유</span><textarea name="reason" maxlength="2000" required></textarea></label><details class="source-details"><summary>부담 낮추기 값 · 직접 선택</summary><div class="form-grid">${field('각 운동에서 줄일 세트', 'setReduction', '', { min: 0, max: 19, step: 1 })}${field('늘릴 RIR 여유', 'rirIncrease', '', { min: 0, max: 10 })}</div></details><details class="source-details"><summary>다음 중량 · 직접 선택</summary><label class="field"><span>운동</span><select name="exerciseId">${options(row.prescription.exercises.map(item => [item.id, item.label]), row.prescription.exercises[0].id)}</select></label>${field('선택한 중량 kg', 'loadKg', '', { min: 0, max: 10000 })}</details><p class="form-help">자동 처방이 아닌 사용자의 선택입니다. 총 kg나 하루 수행 저하만으로 조정하지 않아요. 중량 선택에는 해당 계획의 장비·표기 기준 확인이 필요합니다.</p><label class="checkbox-field"><input type="checkbox" required>변경값과 이유를 확인했고 실제 수행 후 다시 살펴볼게요.</label>${actions('선택한 조정 적용')}`, form => {
          const next = copy(workspace()), index = next.planning.schedule.findIndex(item => item.id === row.id);
          next.planning.schedule[index] = T.adjustAssignment(next.planning.schedule[index], { kind: String(form.get('kind')), reason: String(form.get('reason')), reviewDate: String(form.get('reviewDate')), exerciseId: String(form.get('exerciseId')), loadKg: numeric(form, 'loadKg'), setReduction: numeric(form, 'setReduction') ?? 0, rirIncrease: numeric(form, 'rirIncrease') ?? 0 }, { profile: app.getState().profile, recovery: currentAnalysis().recovery, completed: app.getState().days[row.date]?.complete });
          if (saveWorkspace(next, '선택한 조정과 다시 확인할 날짜를 저장했어요.')) closeDialog();
        });
      }
    }
    function blankSet() { return { id: id(), loadKg: null, reps: null, marker: null, rir: null }; }
    function blankExercise() { return { id: id(), rawName: '', exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded', loadRole: 'unknown', groupKey: null, durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [blankSet()], notes: '' }; }
    function blankRecord() { return { id: id(), date: app.getDate(), time: null, label: '오늘 운동', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null, source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, exercises: [], notes: '', effort: null, pain: null }; }
    function numeric(form, name) { const raw = String(form.get(name) ?? '').trim(); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Error('유효한 숫자를 입력해 주세요.'); return value; }
    function captureEditor(form = new FormData($('entryForm'))) {
      editor.date = String(form.get('date')); editor.label = String(form.get('label') || '').trim(); editor.time = String(form.get('time') || '') || null;
      editor.durationMinutes = numeric(form, 'durationMinutes'); editor.effort = numeric(form, 'effort'); editor.pain = form.get('pain') || null; editor.notes = String(form.get('notes') || '');
      editor.sequence = { order: form.get('orderConfirmed') === 'on' ? 'listed' : 'unknown', structure: String(form.get('sessionStructure') || 'unknown') };
      editor.exercises.forEach((exercise, x) => {
        const name = String(form.get(`exercise-${x}`) || '').trim();
        if (name !== exercise.rawName) { exercise.exerciseId = T.resolveExercise(name, workspace().mappings)?.id || null; exercise.equipmentKey = null; exercise.loadConvention = 'as-recorded'; exercise.loadRole = 'unknown'; }
        exercise.rawName = name;
        if (form.has(`equipment-${x}`)) exercise.equipmentKey = String(form.get(`equipment-${x}`) || '').trim() || null;
        if (form.has(`convention-${x}`)) exercise.loadConvention = String(form.get(`convention-${x}`));
        if (form.has(`role-${x}`)) exercise.loadRole = String(form.get(`role-${x}`));
        if (form.has(`group-${x}`)) exercise.groupKey = String(form.get(`group-${x}`) || '').trim() || null;
        exercise.sets.forEach((set, y) => { for (const key of ['loadKg', 'reps', 'rir']) set[key] = numeric(form, `${x}-${y}-${key}`); set.marker = String(form.get(`${x}-${y}-marker`) || '').trim() || null; });
      });
    }
    function drawEditor(existing = true) {
      openDialog(existing ? '운동 일지 수정' : '새 운동 기록', `<div class="form-grid"><label class="field"><span>날짜</span><input name="date" type="date" min="1900-01-01" max="${I.dateKey()}" value="${e(editor.date)}" required></label>${field('운동 이름', 'label', editor.label, { type: 'text', required: true })}<label class="field"><span>시작 시각 · 선택</span><input name="time" type="time" value="${e(editor.time || '')}"></label>${field('전체 시간 (분) · 선택', 'durationMinutes', editor.durationMinutes ?? '', { min: 1, max: 720 })}${field('체감 강도 0–10 · 선택', 'effort', editor.effort ?? '', { max: 10, step: 1 })}<label class="field"><span>통증</span><select name="pain">${options([['', '미확인'], ['none', '없음'], ['mild', '있음 · 확인 필요'], ['stop', '운동 중단 필요']], editor.pain || '')}</select></label></div><div class="workout-editor">${editor.exercises.map((exercise, x) => `<section class="editor-exercise"><div class="editor-exercise-heading"><label class="field"><span>종목 ${x + 1}</span><input name="exercise-${x}" list="exerciseNames" value="${e(exercise.rawName)}" maxlength="300" required></label>${iconButton('editor-remove-exercise', '종목 삭제', 'trash-2', `data-index="${x}"`)}</div><div class="set-editor-head"><span>kg</span><span>반복</span><span>RIR</span><span>표기</span><span></span></div>${exercise.sets.map((set, y) => `<div class="set-editor-row">${[['loadKg', 10000, 0.1, '부하 kg'], ['reps', 100000, 1, '반복 수'], ['rir', 10, 1, '남길 수 있었던 반복']].map(([key, max, step, label]) => `<input aria-label="종목 ${x + 1} 세트 ${y + 1} ${label}" name="${x}-${y}-${key}" type="number" min="0" max="${max}" step="${step}" value="${set[key] ?? ''}" inputmode="decimal">`).join('')}<input aria-label="종목 ${x + 1} 세트 ${y + 1} 표기" name="${x}-${y}-marker" value="${e(set.marker || '')}" maxlength="32" list="setMarkers">${iconButton('editor-remove-set', '세트 삭제', 'minus', `data-exercise="${x}" data-set="${y}"`)}</div>`).join('')}${command('editor-add-set', '세트 추가', 'plus', `data-index="${x}"`)}</section>`).join('')}${command('editor-add-exercise', '운동 추가', 'plus')}</div><datalist id="exerciseNames">${T.catalog.map(exercise => `<option value="${e(exercise.label)}"></option>`).join('')}</datalist><datalist id="setMarkers"><option value="W"></option><option value="D"></option><option value="A"></option></datalist><label class="field"><span>메모 · 선택</span><textarea name="notes" rows="2" maxlength="10000">${e(editor.notes)}</textarea></label><p class="form-help">빈 숫자는 미확인으로 남습니다. RIR은 마지막 반복 이후 더 할 수 있었던 횟수예요. W·D·A 원문 표기는 그대로 보관합니다.</p>${actions('기록 저장')}`, form => {
        captureEditor(form);
        if (!S.isValidDate(editor.date) || editor.date > I.dateKey()) throw new Error('오늘까지의 운동 날짜를 입력해 주세요.');
        if (!editor.exercises.length && editor.source.kind === 'manual') throw new Error('운동 종목을 하나 이상 추가해 주세요.');
        const next = copy(workspace()), index = next.records.findIndex(item => item.id === editor.id);
        if (editorIsDraft) {
          TS.validate({ ...next, records: [copy(editor)] });
          pendingImport.records = pendingImport.records.map(record => record.id === editor.id ? copy(editor) : record);
          pendingImport.result = TS.mergeRecords(workspace(), pendingImport.records); pendingImport.reviewed = false; closeDialog(); render(); toast('초안을 수정했어요. 아직 앱 기록에 저장하지 않았습니다.'); return;
        }
        if (index >= 0) next.records[index] = copy(editor); else next.records.push(copy(editor));
        if (editorNewProgram) { next.planning.programs.push(copy(editorNewProgram)); next.planning.activeProgramId = editorNewProgram.id; next.planning.schedule.push(copy(editorNewAssignment)); }
        if (editorAssignmentId) {
          const assignment = next.planning.schedule.find(row => row.id === editorAssignmentId);
          if (!assignment || assignment.date !== editor.date) throw new Error('배치한 계획과 수행 날짜가 달라요. 계획 날짜를 먼저 옮긴 뒤 기록해 주세요.');
          ensurePlanDate(assignment.date, true); assignment.recordId = editor.id; assignment.status = 'performed';
        }
        if (saveWorkspace(next, '운동 일지와 코칭에 반영했어요.')) { chosen = editor.id; closeDialog(); render(); }
      });
      $('entryForm').querySelector('.workout-editor').insertAdjacentHTML('beforebegin', `<div class="session-context-input"><label class="checkbox-field"><input type="checkbox" name="orderConfirmed" ${editor.sequence?.order === 'listed' ? 'checked' : ''}>아래 종목 순서대로 수행했어요.</label><label class="field"><span>수행 방식 · 선택</span><select name="sessionStructure">${options([['unknown', '미확인'], ['straight', '종목별로 마친 후 다음 종목'], ['grouped', '슈퍼세트·순환·종목 교차']], editor.sequence?.structure || 'unknown')}</select></label></div>`);
      $('entryForm').querySelectorAll('.editor-exercise').forEach((element, index) => {
        const exercise = editor.exercises[index], description = T.describeExercise(exercise, workspace().mappings);
        element.querySelector('.editor-exercise-heading').insertAdjacentHTML('beforeend', `<div class="editor-order-actions">${iconButton('editor-move-up', '종목을 앞 순서로', 'arrow-up', `data-index="${index}" ${index === 0 ? 'disabled' : ''}`)}${iconButton('editor-move-down', '종목을 뒤 순서로', 'arrow-down', `data-index="${index}" ${index === editor.exercises.length - 1 ? 'disabled' : ''}`)}</div>`);
        element.querySelector('.editor-exercise-heading').insertAdjacentHTML('afterend', `<details class="source-details"><summary>장비·중량 기준${description.equipmentKey ? ` · ${e(description.equipmentKey)}` : ''}</summary><div class="form-grid"><label class="field"><span>실제 장비 · 확인할 때만</span><input name="equipment-${index}" type="text" maxlength="128" value="${e(exercise.equipmentKey || '')}" placeholder="이름의 브랜드만으로 같은 머신을 확정하지 않아요"></label><label class="field"><span>직접 지정한 kg 기준</span><select name="convention-${index}">${options([['as-recorded', '직접 지정 없음 · 확인한 연결/이름 규칙'], ['total', '전체 중량'], ['per-side', '한쪽 중량'], ['bodyweight', '맨몸·추가 부하']], exercise.loadConvention)}</select></label></div></details>`);
        element.querySelector('.source-details .form-grid').insertAdjacentHTML('beforeend', `<label class="field"><span>kg의 의미</span><select name="role-${index}">${options([['unknown', '미확인 · 확인한 연결 사용'], ['external', '들어 올린 외부 중량'], ['assistance', '몸을 도와주는 보조 중량']], exercise.loadRole || 'unknown')}</select></label><label class="field"><span>교차 수행 묶음 · 해당할 때만</span><input name="group-${index}" maxlength="128" value="${e(exercise.groupKey || '')}" placeholder="같은 묶음은 같은 이름"></label><p class="form-help full-width">장비는 헬스장과 실제 머신을 구분해 주세요. 같은 모델도 다른 기계라면 별도 기록선입니다. 계획의 휴식은 실제 휴식으로 간주하지 않아요.</p>`);
      });
      if (editorIsDraft && editor.source.hash) $('entryForm').insertAdjacentHTML('afterbegin', sourceReviewHTML(editor.source.hash));
      const assignment = editorNewAssignment || planning().schedule.find(row => row.id === editorAssignmentId || row.recordId === editor.id);
      if (assignment) $('entryForm').insertAdjacentHTML('afterbegin', `<details class="source-details" open><summary>배치 당시 목표 · 실제 값과 별도</summary>${assignment.prescription.exercises.map(row => `<p><strong>${e(row.label)}</strong> ${e(targetText(row))}</p>`).join('')}<p class="form-help">아래에는 실제 수행한 숫자만 입력해 주세요. 권장 반복·RIR을 실제 값으로 미리 채우지 않았어요.</p></details>`);
      $('entryDialog').classList.add('dialog-wide');
    }
    function recordDialog(record = null, reuse = false) {
      editorIsDraft = false; editorAssignmentId = null; editorNewProgram = null; editorNewAssignment = null;
      editor = record ? copy(record) : blankRecord();
      if (reuse) {
        editor.id = id(); editor.date = app.getDate(); editor.time = null; editor.durationMinutes = null; editor.effort = null; editor.pain = null;
        editor.sequence = { order: 'unknown', structure: 'unknown' };
        editor.source = blankRecord().source; editor.reportedSetCount = null; editor.reportedEnergyKcal = null; editor.reportedVolumeKg = null; editor.notes = '';
        editor.exercises.forEach(exercise => { exercise.id = id(); exercise.reportedVolumeKg = null; exercise.sets.forEach(set => { set.id = id(); set.rir = null; }); });
      }
      if (!editor.exercises.length && !record) editor.exercises.push(blankExercise());
      drawEditor(Boolean(record && !reuse));
    }
    function startAssignment(row) {
      ensurePlanDate(row.date, true);
      if (row.date > I.dateKey()) throw new Error('미래 계획은 아직 실제 수행으로 기록할 수 없어요.');
      if (row.status !== 'planned') throw new Error('아직 수행하지 않은 계획을 선택해 주세요.');
      editorIsDraft = false; editorAssignmentId = row.id; editor = blankRecord(); editor.date = row.date; editor.label = row.prescription.label;
      editor.exercises = row.prescription.exercises.map(exercise => ({ ...blankExercise(), rawName: exercise.label, exerciseId: exercise.exerciseId, equipmentKey: exercise.equipmentKey, loadConvention: exercise.loadConvention, sets: Array.from({ length: exercise.sets }, blankSet) }));
      drawEditor(false);
    }
    function mappingDialog(record, exercise) {
      const description = T.describeExercise(exercise, workspace().mappings);
      const resolved = description.resolved;
      exercise = { ...exercise, equipmentKey: description.equipmentKey, loadConvention: description.loadConvention };
      const readMapping = form => ({ rawName: exercise.rawName, exerciseId: String(form.get('exerciseId')), equipmentKey: String(form.get('equipmentKey') || '').trim() || null, loadConvention: String(form.get('loadConvention')), loadRole: String(form.get('loadRole') || 'unknown'), confirmed: form.get('confirmed') === 'on' });
      openDialog('운동·장비 정보 수정', `<p><strong>${e(exercise.rawName)}</strong></p><div class="form-grid"><label class="field full-width"><span>실제 수행한 운동</span><select name="exerciseId" required><option value="">선택해 주세요</option>${options(T.catalog.map(row => [row.id, row.label]), resolved?.id || '')}</select></label>${field('장비 이름 · 헬스장/실제 기구 · 선택', 'equipmentKey', exercise.equipmentKey || '', { type: 'text' })}<label class="field"><span>중량 표기 · 한쪽인지 전체인지</span><select name="loadConvention">${options([['as-recorded', '미확인 · 원문'], ['total', '전체 중량'], ['per-side', '한쪽 중량'], ['bodyweight', '맨몸·추가 부하']], exercise.loadConvention)}</select></label></div><p class="form-help">이름과 세트 숫자는 그대로 두고 운동 분류·장비·중량 표기만 저장합니다. 같은 운동명·장비의 기록에도 이 기준을 사용하며, 다른 머신의 표시 kg를 같다고 보지 않습니다.</p><label class="checkbox-field"><input type="checkbox" name="confirmed" required>실제 운동과 중량 표기가 맞아요.</label>${actions('운동·장비 정보 저장')}`, form => {
        const next = copy(workspace()), target = next.records.find(row => row.id === record.id).exercises.find(row => row.id === exercise.id);
        const mapping = readMapping(form);
        if (!T.catalog.some(row => row.id === mapping.exerciseId)) throw new Error('실제 종목을 선택해 주세요.');
        const preview = T.previewMapping(next.records, next.mappings, mapping, { recordId: record.id, exerciseId: exercise.id });
        if (!preview.valid) throw new Error(preview.error || '저장할 운동·장비 정보를 확인해 주세요.');
        Object.assign(target, { exerciseId: mapping.exerciseId, equipmentKey: mapping.equipmentKey, loadConvention: mapping.loadConvention, loadRole: mapping.loadRole });
        next.mappings = preview.nextMappings;
        if (saveWorkspace(next, '운동·장비 정보를 저장했어요. 세트 숫자는 그대로입니다.')) closeDialog();
      });
      $('entryForm').querySelector('.form-grid').insertAdjacentHTML('beforeend', `<label class="field full-width"><span>중량 종류</span><select name="loadRole">${options([['unknown', '미확인'], ['external', '들어 올린 외부 중량'], ['assistance', '몸을 도와주는 보조 중량']], description.loadRole || 'unknown')}</select></label><p class="form-help full-width">예: A헬스장 / 체스트프레스 1번. 같은 브랜드라도 실제 기계가 다르면 장비 이름을 나눠 주세요.</p>`);
      $('entryForm').querySelector('.checkbox-field').insertAdjacentHTML('beforebegin', '<section class="mapping-reuse-preview" aria-labelledby="mappingReuseTitle"><h3 id="mappingReuseTitle">같은 운동명에 적용할 기준</h3><div id="mappingReusePreview" aria-live="polite"></div></section>');
      const previewForm = $('entryForm');
      let previewTimer = null;
      const updatePreview = () => {
        clearTimeout(previewTimer);
        if ($('entryForm') !== previewForm || !$('entryDialog').open) return;
        const data = workspace(), mapping = { ...readMapping(new FormData($('entryForm'))), confirmed: true };
        const preview = T.previewMapping(data.records, data.mappings, mapping, { recordId: record.id, exerciseId: exercise.id });
        if (!preview.valid) { $('mappingReusePreview').innerHTML = `<p class="form-help">${e(preview.error || '실제 운동을 선택하면 적용 범위를 확인할 수 있어요.')}</p>`; return; }
        const counts = preview.counts;
        $('mappingReusePreview').innerHTML = `<p>이 운동 외 같은 이름 ${fmt(counts.matchingExerciseCount)}건 · 자동 반영 ${fmt(counts.affectedExerciseCount)}건 · 이미 적용 ${fmt(counts.alreadyAppliedExerciseCount)}건</p>${counts.protectedExerciseCount ? `<p class="form-help">별도 지정 ${fmt(counts.protectedExerciseCount)}건의 확인한 값은 유지합니다.</p>` : ''}${counts.conflictCount || preview.futureConflict ? `<p class="notice notice-warning">같은 이름에 서로 다른 기준이 있습니다.${counts.conflictCount ? ` 기존 ${fmt(counts.conflictCount)}건은 기준을 자동 선택하지 않습니다.` : ''}${preview.futureConflict ? ' 다음 기록도 장비 등 구분할 정보가 없으면 한 기준을 임의로 고르지 않습니다.' : ''}</p>` : '<p class="form-help">다음에도 같은 이름이면 저장한 기준을 자동으로 재사용합니다.</p>'}${counts.additionalAffectedExerciseCount ? `<p class="form-help">자동 반영에는 장비 접두어로 연결되는 다른 이름 ${fmt(counts.additionalAffectedExerciseCount)}건도 포함됩니다.</p>` : ''}<p class="form-help">다른 날짜의 확인한 값은 우선합니다. 원문 이름·중량·반복·RIR은 바꾸지 않습니다.</p>`;
      };
      previewForm.addEventListener('input', event => {
        if (event.target.name === 'confirmed') return;
        clearTimeout(previewTimer);
        if (event.target.name !== 'equipmentKey') { updatePreview(); return; }
        $('mappingReusePreview').innerHTML = '<p class="form-help">입력한 기준의 적용 범위를 확인 중입니다.</p>';
        previewTimer = setTimeout(updatePreview, 180);
      });
      previewForm.addEventListener('change', event => { if (event.target.name !== 'confirmed') updatePreview(); });
      updatePreview();
      $('entryDialog').classList.add('dialog-wide');
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
    function previewRecords(records, warnings = [], imageJob = null) {
      const result = TS.mergeRecords(workspace(), records); pendingImport = { records, warnings: [...warnings, ...result.warnings], result, imageJob, reviewed: false };
      tab = 'log'; app.selectView('training'); render();
    }
    function renderImportPreview() {
      if (!$('trainingImportPreview')) { const section = document.createElement('section'); section.id = 'trainingImportPreview'; section.className = 'import-review'; $('trainingContent').prepend(section); }
      const data = pendingImport, result = data.result;
      $('trainingImportPreview').innerHTML = `<div class="section-header"><h2>일지 가져오기 확인</h2>${iconButton('training-import-cancel', '가져오기 취소', 'x')}</div><p>추가 ${result.added} · 경로 갱신 ${result.updated} · 동일 ${result.unchanged} · 보류 ${result.conflicts.length}</p>${[...new Set(data.warnings)].map(line => `<p class="form-help">${e(line)}</p>`).join('')}${data.imageJob ? `<div class="image-review-layout">${sourceReviewHTML(data.imageJob.imageHash)}<div>${data.records.map(draftRecordHTML).join('')}</div></div><label class="checkbox-field"><input id="imageWorkoutReviewed" type="checkbox" ${data.reviewed ? 'checked' : ''}>모든 운동의 날짜·세트 숫자와 중량 기준을 원본과 대조했어요. 빈 숫자는 미확인으로 남길게요.</label>` : ''}<div class="import-record-list">${data.records.slice(0, data.imageJob ? data.records.length : 20).map(record => `<div><span>${record.date}</span><strong>${e(record.label)}</strong><small>${record.exercises.length}종목 · ${sourceNames[record.source.kind]}</small></div>`).join('')}</div>${data.records.length > 20 && !data.imageJob ? `<p class="form-help">총 ${data.records.length}개 기록입니다.</p>` : ''}${result.conflicts.length ? `<details open><summary>보류한 기록 ${result.conflicts.length}개</summary>${result.conflicts.map((conflict, index) => `<div class="conflict-row"><div><strong>${conflict.incoming.date} · ${e(conflict.incoming.label)}</strong><p>${e(conflict.reason)}</p></div>${command('training-conflict', '두 기록 비교', 'git-compare-arrows', `data-index="${index}"`)}</div>`).join('')}</details>` : ''}<div class="form-actions">${command('training-import-confirm', '보류 제외하고 저장', 'check', data.imageJob && !data.reviewed ? 'disabled' : '', true)}${command('training-import-cancel', '취소', 'x')}</div>`;
      $('trainingImportPreview').querySelectorAll('.import-record-list > div').forEach((row, index) => row.insertAdjacentHTML('beforeend', command('training-import-detail', '초안 확인·수정', 'list-checks', `data-id="${e(data.records[index].id)}"`)));
      app.icons();
    }
    function importDialog() {
      openDialog('판독 기록·JSON 가져오기', `<div class="import-source-options"><p>이미 판독해 보관한 숫자 기록이나 JSON 일지 파일을 미리보고 가져옵니다. 폴더 지정과 새 사진 판독은 별도이며 원본 사진을 수정하지 않아요.</p>${command('diary-folder', '사진 폴더 설정', 'folder-cog')}${bridge.status?.diaryConfigured ? `<h3>기존 폴더의 판독 캐시</h3><div class="form-grid"><label class="field"><span>시작일</span><input type="date" name="from" value="${I.shiftDate(I.dateKey(), -60)}" min="1900-01-01" max="${I.dateKey()}" required></label><label class="field"><span>종료일</span><input type="date" name="to" value="${I.dateKey()}" min="1900-01-01" max="${I.dateKey()}" required></label></div>${actions('판독 캐시 확인')}` : '<p>아직 지정한 사진 폴더가 없어요. 폴더를 설정하거나 JSON 일지 교환 파일을 선택할 수 있습니다.</p>'}<div class="form-divider"></div><label class="field"><span>JSON 일지 교환 파일</span><input id="trainingImportFile" type="file" accept="application/json,.json"></label></div>`, async form => {
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
      if (imageUploadBusy) { toast('사진 보관이 아직 진행 중이에요. 보관 결과는 확인함에 남습니다. 끝난 뒤 다음 사진을 추가해 주세요.', true); return; }
      if (!bridge.status?.connected) { setupDialog(); return; }
      imageUploads.forEach(row => URL.revokeObjectURL(row.url)); imageUploads = [];
      openDialog('사진 추가', `<div class="form-grid"><label class="field"><span>기록 종류</span><select id="imageKind" name="kind">${options([['workout', '운동 일지'], ['meal', '식사 · 영양 라벨'], ['body', '체성분 · 인바디']], 'workout')}</select></label><label class="field"><span>이미지 · 여러 장 선택</span><input id="coachImageFile" type="file" accept="image/png,image/jpeg,image/webp" multiple required></label><label class="field full-width"><span>분량·날짜 등 메모 · 선택</span><textarea id="imageNote" name="note" rows="2" maxlength="6000" placeholder="예: 라벨의 1회 분량 중 절반을 먹었어요"></textarea></label></div><div id="imageUploadList" class="image-upload-list" aria-live="polite"></div><label class="checkbox-field"><input id="imageAnalyze" name="analyze" type="checkbox" ${canAskAI() ? '' : 'disabled'}>보관 후 Codex 판독도 요청</label>${!canAskAI() ? '<p class="notice notice-warning">지금은 AI 판독에 연결할 수 없어요. 사진과 메모만 보관하거나 숫자를 직접 기록할 수 있습니다.</p>' : `<p class="form-help">선택한 사진과 메모를 하나씩 Codex에 전송합니다. ${aiUsageNote()} 같은 사진의 기존 판독은 다시 읽지 않아요.</p>`}<p class="form-help">사진 보관만으로 세트·섭취량·측정값이 추가되지는 않아요. 판독 초안도 확인한 뒤에만 기록에 반영합니다.</p>${actions('사진 보관')}`, async form => {
        const entry = $('entryForm'); if (!imageUploads.length || imageUploadBusy) return;
        const kind = String(form.get('kind')), note = String(form.get('note') || ''), analyze = form.get('analyze') === 'on';
        if (note.length > 6000) throw new Error('메모는 6,000자 이내로 줄여 주세요.');
        imageUploadBusy = true; const failures = [];
        try {
          for (const row of imageUploads) {
            if (row.status === 'stored') continue;
            row.status = 'uploading'; row.error = null; drawImageUploads();
            try {
              const buffer = new Uint8Array(await row.file.arrayBuffer()); let binary = ''; for (const byte of buffer) binary += String.fromCharCode(byte);
              const uploaded = await bridge.request('/api/inbox', { name: row.file.name, kind, note, base64: btoa(binary) });
              uploadedImages = [...uploadedImages.filter(source => source.hash !== uploaded.hash), uploaded];
              Object.assign(row, { status: 'stored', uploaded, kind, note });
            } catch (error) { row.status = 'failed'; row.error = error.message; failures.push(`${row.file.name}: ${error.message}`); }
            drawImageUploads();
          }
        } finally { imageUploadBusy = false; drawImageUploads(); }
        if (failures.length) throw new Error(`보관한 사진은 유지했고 실패한 사진만 다시 시도할 수 있어요. ${failures.join(' · ')}`);
        const storedRows = imageUploads.slice();
        const stillOpen = entry.isConnected && $('entryDialog').open;
        if (stillOpen) closeDialog();
        if (stillOpen) { tab = 'log'; app.selectView('training'); }
        await refreshJobs();
        const stored = storedRows.some(row => row.uploaded.metadataConflict) ? '같은 사진이 이미 보관되어 기존 종류와 메모를 유지했어요.' : storedRows.every(row => row.uploaded.reused) ? '이미 보관한 사진을 다시 확인했어요.' : `${storedRows.length}장의 사진과 메모를 이 PC에 보관했어요.`;
        toast(`${stored} 사진 보관만으로 숫자 기록을 새로 추가하지는 않았습니다.${inboxError ? ' 보관 목록을 불러오지 못했어요. 서버를 다시 확인해 주세요.' : ''}`, !!inboxError);
        if (!analyze || !stillOpen) return;
        enqueueImages(storedRows.map(row => ({ hash: row.uploaded.hash, kind: row.kind, note: row.note, name: row.file.name })));
        intakeQueuePaused = false; void pumpImageQueue();
      });
      $('entryForm').addEventListener('paste', event => {
        const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
        if (files.length && !imageUploadBusy) { event.preventDefault(); addImageUploads(files); }
      });
    }
    function addImageUploads(files) {
      const errors = [];
      for (const file of files) {
        if (imageUploads.length >= 50) { errors.push('한 번에 50장까지 선택해 주세요.'); break; }
        if (file.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { errors.push(`${file.name}: 10MB 이하의 PNG, JPG, WebP를 선택해 주세요.`); continue; }
        if (imageUploads.some(row => row.file.name === file.name && row.file.size === file.size && row.file.lastModified === file.lastModified)) continue;
        imageUploads.push({ id: id(), file, url: URL.createObjectURL(file), status: 'selected', error: null });
      }
      if ($('coachImageFile')) $('coachImageFile').required = !imageUploads.length;
      drawImageUploads(); if (errors.length) toast(errors.join(' '), true);
    }
    function drawImageUploads() {
      const list = $('imageUploadList'); if (!list) return;
      list.innerHTML = imageUploads.map(row => `<div class="image-upload-row"><img src="${e(row.url)}" alt="선택한 이미지"><div><strong>${e(row.file.name)}</strong><span>${{ selected: '보관 전', uploading: '보관 중', stored: 'PC에 보관됨', failed: '보관 실패 · 재시도 가능' }[row.status]}</span>${row.error ? `<p>${e(row.error)}</p>` : ''}</div>${!imageUploadBusy && row.status !== 'stored' ? iconButton('image-upload-remove', '선택에서 제외', 'x', `data-id="${e(row.id)}"`) : ''}</div>`).join('');
      app.icons();
    }
    async function refreshJobs() {
      if (!bridge.status?.connected) return;
      const errors = []; let jobsRead = false;
      try { const result = await bridge.request('/api/jobs'); jobs = result.jobs || []; jobsRead = true; unprocessedImages = unprocessedImages.filter(source => !jobs.some(job => job.imageHash === source.hash && job.status === 'completed')); } catch (error) { errors.push(`판독 요청 목록: ${error.message}`); }
      try { const result = await bridge.request('/api/inbox'); uploadedImages = result.images || []; } catch (error) { errors.push(`사진 보관 목록: ${error.message}`); }
      inboxError = errors.join(' ') || null;
      if (jobsRead) reconcileImageQueue();
      if (app.getView?.() === 'training') render();
    }
    function persistImageQueue() {
      try { localStorage.setItem(intakeQueueKey, JSON.stringify({ version: 1, rows: intakeQueue })); intakeQueueError = null; }
      catch (error) { intakeQueuePaused = true; intakeQueueError = '이 브라우저에 판독 대기를 저장하지 못했어요. 사진 원본과 서버 초안은 유지되지만 새로고침 전 대기 목록을 확인해 주세요.'; }
    }
    function loadImageQueue() {
      try {
        const raw = localStorage.getItem(intakeQueueKey); if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || !Array.isArray(parsed.rows) || parsed.rows.length > 100 || parsed.rows.some(row => !row || !/^[a-f0-9]{64}$/.test(row.hash) || !['workout', 'meal', 'body'].includes(row.kind) || typeof row.note !== 'string' || row.note.length > 6000 || typeof row.id !== 'string' || row.id.length > 128 || typeof row.name !== 'string' || row.name.length > 300 || !S.isValidDate(row.date) || row.date > I.dateKey() || !['queued', 'requesting', 'running', 'failed', 'completed', 'cancelled'].includes(row.status) || (row.jobId !== null && (typeof row.jobId !== 'string' || !/^[a-f0-9]{32}$/.test(row.jobId))) || typeof row.queuedAt !== 'string' || !Number.isFinite(Date.parse(row.queuedAt)))) throw new Error('invalid queue');
        intakeQueue = parsed.rows; intakeQueuePaused = true;
      } catch (error) { intakeQueueError = '판독 대기 저장본을 읽지 못했어요. 이 저장본을 덮어쓰지 않고 사진·서버 요청 목록에서 확인합니다.'; }
    }
    function enqueueImages(sources) {
      if (intakeQueueError) { toast(intakeQueueError, true); return; }
      for (const source of sources) {
        if (intakeQueue.some(row => row.hash === source.hash && ['queued', 'requesting', 'running'].includes(row.status))) continue;
        if (jobs.some(row => row.imageHash === source.hash && ['completed', 'running', 'pending'].includes(row.status))) continue;
        if (intakeQueue.length >= 100) intakeQueue = intakeQueue.filter(row => !['completed', 'cancelled'].includes(row.status));
        if (intakeQueue.length >= 100) { toast('판독 대기가 100개입니다. 기존 대기를 확인한 뒤 추가해 주세요. 사진은 보관되어 있어요.', true); break; }
        intakeQueue.push({ id: id(), hash: source.hash, kind: source.kind, note: source.note, name: source.name.slice(0, 300), date: app.getDate(), status: 'queued', queuedAt: new Date().toISOString(), jobId: null, retry: false, error: null });
      }
      persistImageQueue(); app.render();
    }
    function reconcileImageQueue() {
      if (intakeQueueError) return;
      let changed = false;
      for (const row of intakeQueue) {
        if (!['requesting', 'running'].includes(row.status)) continue;
        const job = row.jobId ? jobs.find(item => item.id === row.jobId) : jobs.find(item => item.imageHash === row.hash && item.kind === row.kind && Date.parse(item.createdAt) >= Date.parse(row.queuedAt));
        if (!job) {
          if (jobStarting || queuePumping || currentJob?.id === row.jobId && ['running', 'pending'].includes(currentJob?.status)) continue;
          row.status = 'failed'; row.error = '요청 결과가 확인되지 않아요. 서버 목록을 다시 확인한 뒤 명시적으로 재시도해 주세요.'; changed = true; continue;
        }
        row.jobId = job.id; row.status = ['pending', 'running'].includes(job.status) ? 'running' : job.status === 'completed' ? 'completed' : 'failed'; row.error = job.error || null; changed = true;
      }
      if (changed) persistImageQueue();
    }
    async function pumpImageQueue() {
      if (intakeQueuePaused || intakeQueueError || queuePumping || jobStarting || ['running', 'pending'].includes(currentJob?.status)) return;
      const row = intakeQueue.find(item => item.status === 'queued'); if (!row) return;
      const existing = !row.retry && jobs.find(job => job.imageHash === row.hash && ['completed', 'pending', 'running'].includes(job.status));
      if (existing) {
        row.jobId = existing.id; row.status = existing.status === 'completed' ? 'completed' : 'running'; persistImageQueue();
        if (existing.status !== 'completed') { currentJob = { ...existing, queueId: row.id }; await pollJob(); }
        else setTimeout(() => void pumpImageQueue(), 0);
        app.render(); return;
      }
      if (!canAskAI()) { intakeQueuePaused = true; app.render(); return; }
      queuePumping = true; row.status = 'requesting'; persistImageQueue();
      if (intakeQueuePaused) { row.status = 'queued'; queuePumping = false; app.render(); return; }
      try { await startJob(row.kind, row.note, row.hash, null, row.retry, row); }
      catch (error) { row.status = 'failed'; row.error = error.message; intakeQueuePaused = true; persistImageQueue(); toast(`사진은 보관됐지만 AI 판독을 시작하지 못했어요. ${error.message}`, true); }
      finally { queuePumping = false; app.render(); if (!['running', 'pending'].includes(currentJob?.status)) setTimeout(() => void pumpImageQueue(), 0); }
    }
    function queueHTML() {
      const rows = intakeQueue.filter(row => !['completed', 'cancelled'].includes(row.status));
      if (!rows.length && !intakeQueueError) return '';
      return `<section class="intake-queue"><div class="section-header"><h3>선택한 판독 대기 ${rows.length}개</h3>${intakeQueuePaused ? command('image-queue-continue', '대기 판독 계속', 'play', canAskAI() && !intakeQueueError && rows.some(row => row.status === 'queued') ? '' : 'disabled') : command('image-queue-pause', '대기 일시정지', 'pause')}</div>${intakeQueueError ? `<p class="notice notice-warning">${e(intakeQueueError)}</p>` : ''}${intakeQueuePaused && rows.some(row => row.status === 'queued') ? '<p class="form-help">대기는 보존했어요. 계속하기 전에는 새 AI 요청을 보내지 않습니다.</p>' : ''}${rows.map(row => `<div class="intake-queue-row"><div><strong>${e(row.name)}</strong><span>${{ queued: '판독 대기', requesting: '요청 결과 확인 중', running: 'AI 판독 중', failed: '요청 실패 · 사진 보관' }[row.status]}</span>${row.error ? `<p>${e(row.error)}</p>` : ''}</div><div class="toolbar-actions">${row.status === 'failed' ? command('image-queue-retry', '다시 요청', 'rotate-cw', `data-id="${e(row.id)}" ${canAskAI() ? '' : 'disabled'}`) : ''}${row.status === 'queued' || row.status === 'failed' ? iconButton('image-queue-remove', '대기에서 제외 · 사진 유지', 'x', `data-id="${e(row.id)}"`) : ''}</div></div>`).join('')}</section>`;
    }
    function hasStoredImageRecord(job) { return job.kind === 'workout' ? workspace().records.some(row => row.source.hash === job.imageHash) : job.kind === 'meal' ? Object.values(app.getState().days).some(day => day.meals.some(meal => meal.source?.hash === job.imageHash)) : false; }
    function inboxHTML() {
      const images = jobs.filter(job => job.kind !== 'chat' && job.kind !== 'unknown');
      const pending = uploadedImages.filter(source => !images.some(job => job.imageHash === source.hash));
      const external = unprocessedImages.filter(source => !uploadedImages.some(row => row.hash === source.hash) && !images.some(job => job.imageHash === source.hash));
      const kinds = { workout: '운동 일지', meal: '식사', body: '체성분' };
      const requestButton = source => command('image-source-start', '판독 요청', 'scan-text', `data-hash="${e(source.hash)}" ${source.damaged ? 'disabled title="사진 보관 정보 확인이 필요해요"' : intakeQueue.some(row => row.hash === source.hash && ['queued', 'requesting', 'running'].includes(row.status)) ? 'disabled title="선택한 판독 대기에 있어요"' : canAskAI() ? '' : 'disabled title="AI 판독 연결이 필요해요"'}`);
      const jobStatus = job => job.status === 'completed' ? job.kind === 'body' ? 'AI 판독 결과 · 저장 여부는 기록에서 확인' : hasStoredImageRecord(job) ? '관련 저장 기록 있음 · AI 원문 초안' : 'AI 판독 초안 · 반영 전 확인 필요' : ({ running: 'AI 판독 중', pending: 'AI 판독 대기', cancelled: '취소됨 · 사진 보관', failed: '판독 실패 · 사진 보관', interrupted: '중단됨 · 사진 보관' }[job.status] || '확인 필요');
      return `<details class="image-inbox"><summary>이미지 확인함 <span>${images.length + pending.length + external.length}${inboxError ? ' · 조회 확인 필요' : ''}</span></summary>
        ${queueHTML()}
        ${inboxError ? `<div class="notice notice-warning" role="alert"><strong>보관 목록을 불러오지 못했어요.</strong><p>${e(inboxError)}</p><p>사진이 없는 것으로 처리하지 않습니다. 마지막 확인 목록은 그대로 남겨요.</p>${command('bridge-refresh', '서버 다시 확인', 'refresh-cw')}</div>` : ''}
        ${images.length ? `<h3>판독 요청과 초안</h3>${images.map(job => `<div class="inbox-row" data-image-hash="${e(job.imageHash)}">${imageThumbnail(job.imageHash)}<div><strong>${kinds[job.kind]}</strong><span>${e(job.createdAt?.slice(0, 10) || '')} · ${jobStatus(job)}</span></div>${command('image-job-open', '확인', 'arrow-up-right', `data-id="${e(job.id)}"`)}</div>`).join('')}` : ''}
        ${pending.length ? `<h3>사진만 보관 · 미판독</h3>${pending.map(source => `<div class="inbox-row" data-image-hash="${e(source.hash)}">${imageThumbnail(source.hash)}<div><strong>${e(source.name || '사진 보관 정보 확인 필요')}</strong><span>${source.damaged ? '보관 정보 손상 · 숫자 기록에 반영되지 않음' : `${e(source.createdAt?.slice(0, 10) || '')} · ${kinds[source.kind] || '종류 미확인'} · 사진만 보관 · 미판독`}</span>${source.note ? `<p class="inbox-note">${e(source.note)}</p>` : ''}</div>${requestButton(source)}</div>`).join('')}` : ''}
        ${external.length ? `<h3>새 폴더 이미지 · 미판독</h3>${external.map(source => `<div class="inbox-row" data-image-hash="${e(source.hash)}">${imageThumbnail(source.hash)}<div><strong>${e(source.paths[0]?.split(/[\\/]/).at(-1) || '새 이미지')}</strong><span>기존 판독 캐시 없음</span></div>${requestButton(source)}</div>`).join('')}` : ''}
        ${!inboxError && !images.length && !pending.length && !external.length ? '<p class="form-help">보관한 이미지가 없어요.</p>' : ''}${!canAskAI() ? '<p class="form-help">AI 판독은 현재 연결할 수 없어요. 사진 보관과 직접 기록은 가능합니다.</p>' : ''}<p class="form-help">보관한 사진과 AI 초안은 확인해 저장한 숫자 기록과 별개입니다.</p></details>`;
    }
    function enhanceChat() {
      const input = $('coachChatInput');
      if (input) {
        input.value = chatDraft;
        $('coachChatForm').querySelector('[type="submit"]').disabled = !canAskAI() || jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending';
      }
      if (canAskAI()) {
        const messages = workspace().messages.slice(-40);
        $('coachContent').querySelectorAll('.conversation-message').forEach((element, index) => {
          const item = messages[index];
          if (item.role === 'coach' && item.source === 'local' && item.replyTo && !/안전 안내|119|즉시|응급/.test(item.text)) element.insertAdjacentHTML('beforeend', command('coach-continue', '이 질문을 AI와 다시 살펴보기', 'messages-square', `data-user="${e(item.replyTo)}"`));
        });
      }
      restoreChatScroll();
    }
    function restoreChatScroll() {
      const log = $('coachContent').querySelector('.conversation-log'), latest = workspace().messages.at(-1)?.id || null;
      if (!log || !log.getClientRects().length) return;
      log.scrollTop = latest !== lastChatMessage && (chatNearBottom || chatScrollToLatest || lastChatMessage === null) ? log.scrollHeight : chatScrollTop;
      chatScrollToLatest = false;
      lastChatMessage = latest;
    }
    function captureChatScroll() {
      const log = $('coachContent').querySelector('.conversation-log');
      if (log?.getClientRects().length && app.getView?.() === 'coach') { chatScrollTop = log.scrollTop; chatNearBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 32; }
    }
    function renderImagePreview() {
      if (!$('imageDraftPreview')) { const section = document.createElement('section'); section.id = 'imageDraftPreview'; section.className = 'import-review'; $('trainingContent').prepend(section); }
      const result = imageDraft.result;
      const allValues = result.kind === 'workout' ? workoutDraftRecords().map(draftRecordHTML).join('') : result.kind === 'meal' ? `<h3>${e(result.meal.name)}</h3><p>${e(result.meal.date)} · ${result.meal.basis === 'label' ? '영양 라벨' : '분량 추정'}</p><dl class="image-draft-values">${[['protein', '단백질', 'g'], ['carbs', '탄수화물', 'g'], ['fat', '지방', 'g'], ['otherKcal', '기타 열량', 'kcal'], ['alcoholG', '알코올', 'g']].map(([key, label, unit]) => `<div><dt>${label}</dt><dd>${result.meal[key] == null ? '미확인' : `${fmt(result.meal[key], 1)}${unit}`}</dd></div>`).join('')}</dl><p>${e(result.meal.note)}</p>` : `<h3>체성분 측정 초안</h3><p>${e(result.body.date)} · ${e(result.body.method)}</p><dl class="image-draft-values">${[['weightKg', '체중', 'kg'], ['bodyFatPct', '체지방률', '%'], ['skeletalMuscleKg', '골격근량', 'kg']].map(([key, label, unit]) => `<div><dt>${label}</dt><dd>${result.body[key] == null ? '미확인' : `${fmt(result.body[key], 1)}${unit}`}</dd></div>`).join('')}</dl>`;
      $('imageDraftPreview').innerHTML = `<div class="section-header"><h2>이미지 판독 확인</h2>${iconButton('image-draft-dismiss', '초안 닫기', 'x')}</div><div class="image-review-layout">${sourceReviewHTML(imageDraft.imageHash)}<div><p class="conversation-text">${e(result.answer)}</p>${result.uncertainties.map(line => `<p class="notice notice-warning">${e(line)}</p>`).join('')}${result.questions.map(line => `<p>${e(line)}</p>`).join('')}${allValues}</div></div>${result.kind === 'workout' ? command('image-workout-preview', '세트 초안 확인', 'list-checks', '', true) : result.kind === 'meal' ? command('image-meal-confirm', '식사 숫자 확인', 'utensils', '', true) : command('image-body-confirm', '측정값 확인', 'scale', '', true)}`;
      app.icons();
    }
    function draftRecordHTML(record) {
      const conventions = { total: '전체 중량', 'per-side': '한쪽 중량', bodyweight: '맨몸·추가 부하', 'as-recorded': '중량 기준 미확인' };
      return `<section class="image-record-review"><div class="section-header"><h3>${e(record.date)} · ${e(record.label)}</h3>${command('image-review-detail', '숫자 수정', 'pencil', `data-id="${e(record.id)}"`)}</div><p class="secondary-text">시각 ${record.time || '미확인'} · 시간 ${record.durationMinutes == null ? '미확인' : `${fmt(record.durationMinutes)}분`} · 원문 세트 ${fmt(record.reportedSetCount)} · 볼륨 ${record.reportedVolumeKg == null ? '미확인' : `${fmt(record.reportedVolumeKg, 1)}kg`} · 원문 열량 ${record.reportedEnergyKcal == null ? '미확인' : `${fmt(record.reportedEnergyKcal)}kcal`}</p>${record.source.uncertainties.map(line => `<p class="form-help">${e(line)}</p>`).join('')}${record.exercises.map(exercise => {
        const description = T.describeExercise(exercise, workspace().mappings), flags = [];
        if (description.ruleConflict) flags.push('이름과 중량 기준 충돌');
        if (!description.resolved) flags.push('운동·부위 연결 미확인');
        if (!['record', 'mapping'].includes(description.equipmentSource) && description.equipmentKey) flags.push('새 장비 표기 · 같은 물리적 머신인지 미확인');
        if (!description.equipmentKey) flags.push('장비 미확인');
        if (description.loadConvention === 'as-recorded') flags.push('중량 기준 미확인');
        if (exercise.sets.some(set => set.loadKg == null || set.reps == null)) flags.push('중량·반복에 미확인 숫자');
        if (exercise.sets.some(set => set.rir == null)) flags.push('RIR 미확인 · 원문에 없으면 입력 불필요');
        return `<section class="exercise-block"><h4>${e(exercise.rawName)}</h4><p class="secondary-text">${e(description.equipmentKey || '장비 미확인')} · ${e(conventions[description.loadConvention])}${description.equipmentSource === 'mapping' || description.resolved?.confidence === 'confirmed' ? ' · 확인한 연결 재사용' : ''}</p>${flags.length ? `<ul class="image-review-flags">${flags.map(line => `<li>${e(line)}</li>`).join('')}</ul>` : ''}${exercise.sets.length ? `<div class="set-table" role="table" aria-label="${e(exercise.rawName)} 전체 판독 세트"><div class="set-table-head" role="row"><span role="columnheader">세트</span><span role="columnheader">원문 kg</span><span role="columnheader">반복</span><span role="columnheader">RIR</span></div>${exercise.sets.map((set, index) => `<div class="set-table-row" role="row"><span role="cell">${e(set.marker || String(index + 1))}</span><strong role="cell">${set.loadKg == null ? '미확인' : fmt(set.loadKg, 1)}</strong><strong role="cell">${set.reps == null ? '미확인' : fmt(set.reps)}</strong><span role="cell">${set.rir == null ? '미확인' : fmt(set.rir)}</span></div>`).join('')}</div>` : '<p class="form-help">세트 상세 없음</p>'}${exercise.durationMinutes != null || exercise.repsTotal != null ? `<p>종목 시간 ${fmt(exercise.durationMinutes)}분 · 총 반복 ${fmt(exercise.repsTotal)}</p>` : ''}</section>`;
      }).join('')}</section>`;
    }
    function workoutDraftRecords() {
      return imageDraft.result.workouts.map((session, index) => ({ id: `${imageDraft.imageHash}:${index}`, date: session.date, time: session.time, label: session.label,
        durationMinutes: session.durationMinutes, reportedSetCount: session.reportedSetCount, reportedVolumeKg: session.reportedVolumeKg, reportedEnergyKcal: session.reportedEnergyKcal,
        source: { kind: 'visual', hash: imageDraft.imageHash, paths: [], uncertainties: [...session.uncertainties, ...imageDraft.result.uncertainties, 'Codex 이미지 해석 초안 · 사용자 확인 필요'], revision: imageDraft.id },
        exercises: session.exercises.map((exercise, x) => ({ id: `exercise-${x}`, rawName: exercise.rawName, exerciseId: null, equipmentKey: null, loadConvention: 'as-recorded',
          durationMinutes: exercise.durationMinutes, repsTotal: exercise.repsTotal, reportedVolumeKg: exercise.reportedVolumeKg, notes: '', sets: exercise.sets.map((set, y) => ({ id: `set-${x}-${y}`, ...set, rir: null })) })), notes: '', effort: null, pain: null }));
    }
    function confirmMeal() {
      const value = imageDraft.result.meal, job = imageDraft;
      openDialog('이미지 식사 초안 확인', `${sourceReviewHTML(job.imageHash)}<p class="form-help">${e(value.note)} ${value.basis === 'estimate' ? '사진 추정값이며 정확한 계량값이 아니에요.' : '먹은 분량이 라벨과 맞는지 확인해 주세요.'}</p><div class="form-grid"><label class="field"><span>먹은 날짜</span><input name="date" type="date" max="${I.dateKey()}" value="${e(value.date)}" required></label>${field('식사 이름', 'name', value.name, { type: 'text', required: true })}${['protein', 'carbs', 'fat', 'otherKcal', 'alcoholG'].map((key, index) => field(['단백질 g', '탄수화물 g', '지방 g', '기타 열량 kcal', '알코올 g'][index], key, value[key] ?? '', { max: key === 'otherKcal' ? 10000 : key === 'alcoholG' ? 500 : 2000, required: true })).join('')}</div><p class="form-help">미확인 숫자는 비워 두었습니다. 추정 근거나 실제 분량을 확인한 뒤 채워 주세요. 모르는 값을 0으로 바꾸지 않아요.</p><label class="checkbox-field"><input name="confirmed" type="checkbox" required>먹은 분량과 숫자를 확인했어요.</label>${actions('확인한 식사 저장')}`, form => {
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
      openDialog('측정값 확인', `${sourceReviewHTML(imageDraft.imageHash)}<div class="form-grid"><label class="field"><span>측정 날짜</span><input name="date" type="date" max="${I.dateKey()}" value="${e(value.date)}" required></label>${field('측정 체중 kg', 'weightKg', value.weightKg ?? '', { min: 20, max: 350 })}${field('체지방률 % · 선택', 'bodyFatPct', value.bodyFatPct ?? '', { min: 2, max: 65 })}${field('골격근량 kg · 선택', 'skeletalMuscleKg', value.skeletalMuscleKg ?? '', { min: 1, max: 200 })}<label class="field"><span>측정 방법</span><select name="bodyFatMethod">${options([['unknown', '모름'], ['bia', '인바디 · 체성분 체중계'], ['dxa', 'DXA'], ['caliper', '피하지방']], value.method)}</select></label></div><label class="checkbox-field"><input name="confirmed" type="checkbox" required>이미지의 측정 날짜와 값을 확인했어요.</label>${actions('측정값 저장')}`, form => {
        const date = String(form.get('date')), weightKg = numeric(form, 'weightKg'), bodyFatPct = numeric(form, 'bodyFatPct'), skeletalMuscleKg = numeric(form, 'skeletalMuscleKg');
        if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('측정 날짜를 확인해 주세요.');
        if ((bodyFatPct !== null || skeletalMuscleKg !== null) && weightKg === null) throw new Error('같은 측정의 체중이 필요해요.');
        if (weightKg === null && bodyFatPct === null && skeletalMuscleKg === null) throw new Error('확인한 측정 숫자가 아직 없어요. 초안으로 남겨 둘 수 있습니다.');
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
      const available = canAskAI(), busy = jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending';
      const sourceLabel = row => row.role === 'user' ? '나' : row.text.startsWith('상담 요청을 완료하지 못했어요.') ? '연결 안내' : row.source === 'codex' ? '개인 코치 · Codex' : /안전 안내|119|즉시|응급/.test(row.text) ? '즉시 안전 안내' : '이전 기록 안내';
      const reconnect = location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname) ? command('bridge-refresh', '서버 다시 확인', 'refresh-cw') : '';
      if (!available) {
        const status = connectionState();
        return `<section class="personal-conversation conversation-offline"><div class="conversation-unavailable" role="status"><strong>기록은 지금 시작할 수 있어요</strong><p>식사·운동 직접 기록과 기록 요약은 Codex 없이 사용할 수 있어요. 자유 상담과 사진 숫자 판독만 별도 연결이 필요합니다.</p><div class="conversation-offline-actions">${command('training-add', '운동 직접 기록', 'dumbbell')}${command(app.getDay()?.complete ? 'reopen' : 'meal-add', app.getDay()?.complete ? '완료 기록 다시 열기' : '식사 직접 기록', app.getDay()?.complete ? 'pencil' : 'utensils')}${command('connection-setup', 'Codex 연결 설정', 'settings-2')}${reconnect}</div><p class="form-help">${e(status.title)}</p></div>${messages.length ? `<details class="conversation-saved"><summary>지난 대화 ${messages.length}개</summary><div class="conversation-log" role="log" aria-label="이전 코치 대화">${messages.map(row => `<div class="conversation-message conversation-${row.role}"><span>${sourceLabel(row)}${row.status === 'pending' ? ' · 답변 확인 필요' : ''}</span><p class="conversation-text">${e(row.text)}</p></div>`).join('')}</div></details>` : ''}${chatDraft ? `<details class="conversation-saved"><summary>작성 중인 질문</summary><p class="conversation-text">${e(chatDraft)}</p></details>` : ''}${jobHTML()}${connectionPanel()}</section>`;
      }
      const providerLabel = bridge.status.runtime?.readiness === 'ready' ? 'Codex 설치·로그인 확인됨' : 'Codex 사용 가능 · 로그인 미확인';
      return `<section class="personal-conversation"><div class="section-header"><h2>코치 상담</h2><div class="toolbar-actions"><span class="source-badge">${providerLabel}</span>${command('connection-setup', 'Codex 연결 설정', 'settings-2')}</div></div><span class="conversation-provider">${available ? `선택한 기록과 대화 일부를 전송 · ${aiUsageNote()}` : '상담은 AI 연결이 필요해요 · 이전 대화는 유지됩니다'}</span>
        <div class="conversation-log" role="log" aria-label="코치 대화">${messages.map(row => `<div class="conversation-message conversation-${row.role}"><span>${sourceLabel(row)}${row.status === 'pending' ? ' · 답변 대기' : ''}</span><p class="conversation-text">${e(row.text)}</p></div>`).join('') || (available ? '<div class="conversation-empty"><strong>지금 가장 걸리는 것은 무엇인가요?</strong><span>최근 운동과 식사, 오늘 몸 상태를 함께 살펴볼게요.</span></div>' : '')}</div>
        ${!available ? `<div class="conversation-unavailable" role="status"><strong>상담 연결이 없어요</strong><p>기록 요약·직접 기록·지난 운동 재사용·저장한 계획은 계속 사용할 수 있습니다. AI 대신 규칙 문장을 상담 답변으로 내보내지는 않아요.</p>${reconnect}</div>` : ''}
        ${app.retrievalHTML?.(messages.findLast(row => row.role === 'user')?.text || '') || ''}<form id="coachChatForm" class="conversation-compose"><label class="sr-only" for="coachChatInput">코치에게 질문</label><textarea id="coachChatInput" rows="2" maxlength="6000" placeholder="${available ? '운동 수행이 떨어지고 허기가 심해. 오늘은 어떻게 할까?' : 'AI 연결 후 질문할 수 있어요'}" required ${available ? '' : 'disabled'}></textarea><button class="icon-button send-button" type="submit" aria-label="코치에게 보내기" title="코치에게 보내기" ${!available || busy ? 'disabled' : ''}>${icon('arrow-up')}</button></form>${jobHTML()}<div class="conversation-actions">${command('training-image', '사진 추가', 'image-plus')}${command('nav-training', '운동 일지 보기', 'dumbbell')}${command('nav-program', '운동 계획 보기', 'calendar-days')}</div>${connectionPanel()}</section>`;
    }
    function memoryHTML() {
      const data = workspace(), memory = data.memory || TS.createEmpty().memory;
      const visibleFollowUps = (data.followUps || []).filter(row => !actionLinkedFollowUp(row));
      const open = visibleFollowUps.filter(row => row.status === 'open').sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
      return `<section class="coach-continuity"><div class="section-header"><h3>이어갈 약속</h3><div class="toolbar-actions">${command('coach-memory', '기억할 내용 수정', 'notebook-pen')}${command('coach-followup-add', '점검 일정 추가', 'calendar-plus')}</div></div>${memory.focus ? `<p class="coach-focus">${e(memory.focus)}</p>` : ''}${open.length ? `<ul class="item-list">${open.slice(0, 8).map(row => `<li class="item-row"><div class="item-main"><span class="source-badge">${row.reviewDate}${row.reviewDate <= I.dateKey() ? ' · 확인할 때' : ''}</span><p>${e(row.note)}</p></div><div class="item-actions">${iconButton('coach-followup-edit', '점검 내용 수정', 'pencil', `data-id="${e(row.id)}"`)}${command('coach-followup-done', '점검 완료', 'check', `data-id="${e(row.id)}"`)}</div></li>`).join('')}</ul>` : ''}${followUpDraft ? `<div class="form-actions">${command('coach-followup-proposal', '코치가 제안한 다음 점검 확인', 'calendar-check')}</div>` : ''}<details class="source-details"><summary>기억과 점검 기록</summary><dl>${[['constraints', '주의할 사항'], ['focus', '지금의 우선순위'], ['agreements', '함께 정한 방향']].map(([key, label]) => `<div><dt>${label}</dt><dd>${e(memory[key] || '아직 없음')}</dd></div>`).join('')}</dl>${visibleFollowUps.filter(row => row.status === 'done').slice(-8).reverse().map(row => `<p class="form-help">${row.reviewDate} · 확인함 · ${e(row.note)}</p>`).join('')}</details></section>`;
    }
    function memoryDialog() {
      const current = workspace().memory || TS.createEmpty().memory;
      openDialog('코치가 기억할 것', `${[['constraints', '주의할 사항'], ['focus', '지금의 우선순위'], ['agreements', '함께 정한 방향']].map(([key, label]) => `<label class="field"><span>${label}</span><textarea name="${key}" rows="3" maxlength="6000">${e(current[key])}</textarea></label>`).join('')}<p class="form-help">직접 확인한 내용만 남겨요. Codex 대화에서는 이 내용을 함께 전송하며, 진단이나 자동 처방으로 사용하지 않습니다.</p>${actions('확인한 내용 저장')}`, form => {
        const next = copy(workspace()); next.memory = { ...Object.fromEntries(['constraints', 'focus', 'agreements'].map(key => [key, String(form.get(key) || '').trim()])), updatedAt: new Date().toISOString() };
        if (saveWorkspace(next, '코치가 기억할 내용을 저장했어요.')) closeDialog();
      });
    }
    function followUpDialog(existing = null, proposal = null) {
      const value = existing || proposal || { topic: 'general', note: '', reviewDate: I.shiftDate(I.dateKey(), 7) };
      openDialog(existing ? '다음 점검 수정' : '다음에 함께 확인할 것', `<div class="form-grid"><label class="field"><span>주제</span><select name="topic">${options([['training', '운동'], ['nutrition', '식사'], ['recovery', '회복'], ['general', '전체']], value.topic)}</select></label><label class="field"><span>확인할 날짜</span><input type="date" name="reviewDate" min="1900-01-01" max="2200-12-31" value="${e(value.reviewDate)}" required></label><label class="field full-width"><span>확인할 내용</span><textarea name="note" rows="3" maxlength="4000" required>${e(value.note)}</textarea></label></div><p class="form-help">날짜는 점검 약속입니다. 회복 완료나 계획 자동 변경을 뜻하지 않아요.</p>${actions('이 점검 저장')}`, form => {
        const next = copy(workspace()); next.followUps ||= [];
        const row = { id: existing?.id || id(), topic: String(form.get('topic')), note: String(form.get('note') || '').trim(), reviewDate: String(form.get('reviewDate')), status: existing?.status || 'open', createdAt: existing?.createdAt || new Date().toISOString() };
        const index = next.followUps.findIndex(item => item.id === row.id); if (index < 0) next.followUps.push(row); else next.followUps[index] = row;
        if (saveWorkspace(next, '다음에 확인할 내용을 남겼어요.')) { if (proposal) followUpDraft = null; closeDialog(); app.render(); }
      });
    }
    function jobHTML() {
      if (jobStarting) return `<div class="job-status" role="status"><span>${icon('loader-circle')}코치 요청 연결 중…</span></div>`;
      const active = ['running', 'pending'].includes(currentJob?.status);
      return currentJob ? `<div class="job-status" role="status"><span>${icon(active ? 'loader-circle' : currentJob.status === 'completed' ? 'circle-check' : 'circle-alert')}${active ? '기록을 연결해 생각 중…' : currentJob.status === 'completed' ? '응답 완료' : e(currentJob.error || '요청이 중단됐어요.')}</span>${active ? iconButton('coach-job-cancel', '코치 요청 취소', 'x') : currentJob.status !== 'completed' ? command('coach-job-retry', '다시 요청', 'rotate-cw', canAskAI() ? '' : 'disabled title="AI 연결이 필요해요"') : ''}</div>` : '';
    }
    function coachContextHTML() {
      const report = analysis(), last = report.lastSession;
      return `<section class="coach-training-context"><div class="section-header"><h2>마지막 운동 일지</h2>${last ? command('training-open', `${last.date} 일지 보기`, 'notebook-pen', `data-id="${e(last.id)}"`) : ''}</div>${last ? `<strong>${last.date} · ${e(last.label)}</strong><p>${last.exercises.map(exercise => e(exercise.label || exercise.rawName || '')).filter(Boolean).slice(0, 4).join(' · ')}</p><span class="secondary-text">${e(reviewSessionCounts(last))}</span>` : '<p>최근 운동 세트는 아직 확인하지 못했어요.</p>'}<p class="form-help">${e(report.recovery.reasons[0] || '')}</p>${command('nav-program', '다음 훈련 살펴보기', 'calendar-days')}</section>`;
    }
    function reviewSessionCounts(session) {
      if (session.sourceKind === 'legacy-ocr' && session.totalSets === 0) return '종목별 세트 미확인 · 과거 OCR 원문 미검증';
      const unknownReps = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => set.reps == null).length, 0);
      return `${session.exercises.length}종목 · 일반 ${session.workingSets}세트 · 준비 ${session.warmupSets}세트${session.markedSets ? ` · 별도 표기 ${session.markedSets}세트` : ''}${unknownReps ? ` · 반복 미확인 ${unknownReps}세트` : ''}`;
    }
    function workoutReview() {
      if (reviewDate !== app.getDate()) {
        reviewDate = app.getDate(); reviewSessionId = null; reviewBlockId = null; reviewedSessionId = null;
      }
      const report = analysis();
      if (reviewSessionId && !report.sessions.some(row => row.id === reviewSessionId)) reviewSessionId = null;
      const value = T.reviewSession(report, { sessionId: reviewSessionId, preferences: workspace().reviewPreferences, priorityMuscles: workspace().settings.priorityMuscles });
      if (value.session?.id !== reviewedSessionId) { reviewedSessionId = value.session?.id || null; reviewBlockId = null; }
      if (!value.rows.some(row => row.blockId === reviewBlockId)) reviewBlockId = value.rows[0]?.blockId || null;
      return value;
    }
    function reviewPoint(value) {
      return value ? `${value.loadKg == null ? '중량 미확인' : `${fmt(value.loadKg, 1)}kg`} × ${value.reps == null ? '반복 미확인' : `${fmt(value.reps)}회`}` : '앞선 같은 조건 기록 없음';
    }
    function reviewStatus(row) {
      const value = row.progression, current = value?.current;
      if (!current || (current.loadKg == null && current.reps == null)) return '숫자 미확인';
      if (value.status === 'insufficient' && value.historyCoverage?.otherConditionGroupCount > 0) return '기록 있음 · 조건별 분리';
      return statusNames[value.status] || '비교 조건 미확인';
    }
    function mainExerciseLabel(key) {
      return key.startsWith('exercise:') ? T.catalog.find(row => row.id === key.slice(9))?.label || key.slice(9) : key.slice(4);
    }
    function reviewMainHTML(value) {
      const keys = T.getReviewPreferences(workspace().reviewPreferences).mainExerciseKeys;
      if (!keys.length) return '';
      return `<details class="coach-review-mains source-details"><summary>메인 운동 ${keys.length}개</summary><ol>${keys.map((key, index) => {
        const label = mainExerciseLabel(key), extra = `data-exercise-key="${e(key)}"`;
        return `<li><span><strong>${e(label)}</strong>${value.rows.some(row => row.exerciseKey === key || row.mainKeys.includes(key)) ? '' : '<small>이 일지에 없음</small>'}</span><div class="toolbar-actions">${iconButton('coach-review-main-up', `${e(label)} 메인 우선순위 올리기`, 'arrow-up', `${extra} ${index ? '' : 'disabled'}`)}${iconButton('coach-review-main-down', `${e(label)} 메인 우선순위 내리기`, 'arrow-down', `${extra} ${index < keys.length - 1 ? '' : 'disabled'}`)}${iconButton('coach-review-main', `${e(label)} 메인 운동 해제`, 'pin-off', extra)}</div></li>`;
      }).join('')}</ol></details>`;
    }
    function reviewDetailHTML(value, row) {
      if (!row) return '';
      const session = value.session, progression = row.progression, current = progression?.current, previous = progression?.previous;
      const convention = { total: '전체 중량', 'per-side': '한쪽 중량', bodyweight: '맨몸·추가 부하', 'as-recorded': '중량 표기 미확인' }[row.loadConvention];
      const raw = workspace().records.find(record => record.id === session.id)?.exercises.find(exercise => exercise.id === row.blockId);
      const resolved = row.exerciseKey.startsWith('exercise:') ? T.catalog.find(exercise => exercise.id === row.exerciseKey.slice(9)) : null;
      const coverage = progression?.historyCoverage;
      const contextBlock = session.context?.blocks.find(block => block.blockId === row.blockId);
      const index = value.rows.indexOf(row), neighbor = offset => value.rows[index + offset];
      const navigation = `<div class="coach-review-navigation">${command('coach-review-list', '운동 목록', 'list', `data-block-id="${e(row.blockId)}"`)}<div class="toolbar-actions">${iconButton('coach-review-select', '목록의 이전 운동 분석', 'chevron-left', neighbor(-1) ? `data-block-id="${e(neighbor(-1).blockId)}"` : 'disabled')}${iconButton('coach-review-select', '목록의 다음 운동 분석', 'chevron-right', neighbor(1) ? `data-block-id="${e(neighbor(1).blockId)}"` : 'disabled')}</div></div>`;
      return `<div id="coachReviewDetail" class="coach-review-detail" role="region" tabindex="-1" aria-labelledby="coachReviewDetailTitle">${navigation}<div class="section-header"><div><span class="eyebrow">${session.date}${session.time ? ` · ${e(session.time)}` : ''} · 일지 ${row.diaryPosition}</span><h3 id="coachReviewDetailTitle">${e(row.rawName || row.label)}</h3></div><span class="source-badge">${e(reviewStatus(row))}</span></div><dl class="exercise-details"><div><dt>장비</dt><dd>${e(row.equipmentKey || '미확인')}</dd></div><div><dt>중량 표기</dt><dd>${e(convention)}</dd></div><div><dt>운동 분류</dt><dd>${e(resolved?.label || '미확인')}</dd></div><div><dt>직접 자극 부위</dt><dd>${resolved ? resolved.primaryMuscles.map(key => e(T.muscleLabels[key])).join(' · ') : '미확인'}</dd></div></dl><div class="coach-review-observation"><span>${current?.marker ? '별도 표기 세트 관찰' : '표시 세트 관찰'}</span><strong>${current ? reviewPoint(current) : '비교할 숫자 미확인'}</strong>${previous ? `<p>이전 ${previous.date}${previous.time ? ` ${e(previous.time)}` : ''} · ${e(reviewPoint(previous))}</p>` : '<p>앞선 같은 조건의 세트 관찰 없음</p>'}</div><p class="coach-review-reason">${e(progression?.reason || '세트 숫자가 없어 수행 변화를 비교하지 않았어요. 빈 운동 블록도 원문 순서대로 남겨 두었습니다.')}</p>${coverage ? `<p class="form-help">${e(value.windowStart)} ~ ${e(value.windowEnd)} · 같은 운동 ${coverage.exerciseDayCount}일 · 이 장비·표기 ${coverage.equipmentDayCount}일 · 같은 기록 조건 ${coverage.conditionDayCount}일</p>` : ''}<p class="form-help">${Number.isInteger(contextBlock?.executionPosition) ? `실제 순차 수행으로 확인된 일지의 ${contextBlock.executionPosition}번째 블록` : `원문 일지의 ${row.diaryPosition}번째 블록 · 실제 순차 수행 미확인`}${session.context?.sameDaySessions > 1 ? ' · 같은 날 여러 세션의 피로 맥락은 미확인' : ''}. 다른 장비·표기·순서의 중량은 합치지 않습니다.</p>${row.sets.length ? `<div class="set-table" role="table" aria-label="${e(row.rawName || row.label)} 기록 세트"><div class="set-table-head" role="row"><span role="columnheader">세트</span><span role="columnheader">원문 kg</span><span role="columnheader">반복</span><span role="columnheader">RIR</span></div>${row.sets.map((set, index) => `<div class="set-table-row ${set.marker === 'W' ? 'set-warmup' : ''}" role="row"><span role="cell">${e(set.marker || String(index + 1))}</span><strong role="cell">${set.loadKg == null ? '미확인' : fmt(set.loadKg, 1)}</strong><strong role="cell">${set.reps == null ? '미확인' : fmt(set.reps)}</strong><span role="cell">${set.rir == null ? '미확인' : fmt(set.rir)}</span></div>`).join('')}</div>` : '<p class="form-help">세트 상세 없음</p>'}${raw?.notes ? `<p class="form-help">${e(raw.notes)}</p>` : ''}<div class="form-actions">${command('training-open', `${session.date} 일지 보기`, 'notebook-pen', `data-id="${e(session.id)}"`)}${previous?.sessionId && previous.sessionId !== session.id ? command('training-open', `${previous.date} 비교 일지 보기`, 'history', `data-id="${e(previous.sessionId)}"`) : ''}</div></div>`;
    }
    function workoutReviewHTML() {
      const report = analysis(), value = workoutReview(), session = value.session;
      if (!session) return `<section id="coachWorkoutReview" class="coach-workout-review" aria-labelledby="coachWorkoutReviewTitle"><div class="section-header"><h2 id="coachWorkoutReviewTitle">운동별 기록 살펴보기</h2></div><p class="secondary-text">${report.windowStart} ~ ${report.windowEnd}에 저장된 세트 일지가 없어요. 운동 미기록은 휴식했다는 뜻이 아닙니다.</p>${command('training-add', '운동 직접 기록', 'dumbbell')}</section>`;
      const preferences = T.getReviewPreferences(workspace().reviewPreferences), selected = value.rows.find(row => row.blockId === reviewBlockId);
      let safety = ['stop', 'review'].includes(report.recovery.status) ? report.recovery.reasons[0] : null;
      const sessionPain = session.pain === 'stop' ? '이 일지에 중단이 필요한 통증이 기록되어 있어요. 통증을 유발하는 운동은 멈추고 전문가 평가를 우선해 주세요.' : session.pain === 'mild' ? '이 일지에 통증이 기록되어 있어요. 수행 수치가 늘었더라도 자동 증량보다 증상 확인이 먼저예요.' : null;
      if (safety && sessionPain && session.id !== report.lastSession?.id) safety += ` ${session.date} 선택 일지: ${sessionPain}`;
      return `<section id="coachWorkoutReview" class="coach-workout-review" aria-labelledby="coachWorkoutReviewTitle"><div class="section-header"><h2 id="coachWorkoutReviewTitle">운동별 기록 살펴보기</h2><div class="segmented" role="group" aria-label="운동 정렬">${[['priority', '우선순위순'], ['diary', '일지순']].map(([order, label]) => `<button type="button" data-action="coach-review-order" data-order="${order}" aria-pressed="${value.order === order}">${label}</button>`).join('')}</div></div>${safety ? `<div class="notice notice-warning coach-review-safety" role="note"><strong>최근 기록의 안전 확인</strong><p>${e(safety)}</p></div>` : ''}${sessionPain && !safety ? `<div class="notice notice-warning coach-review-safety" role="note"><p>${e(sessionPain)}</p></div>` : ''}<label class="field coach-review-session"><span>살펴볼 운동 일지 · 최근 28일</span><select id="coachReviewSession">${options([...report.sessions].reverse().map(row => [row.id, `${row.date}${row.time ? ` ${row.time}` : ''} · ${row.label}${row.id === report.lastSession?.id ? ' · 최근' : ''}`]), session.id)}</select></label><div class="coach-review-session-summary"><strong>${session.date}${session.time ? ` · ${e(session.time)}` : ''} · ${e(session.label)}</strong><span>${e(reviewSessionCounts(session))}${session.durationMinutes == null ? ' · 시간 미확인' : ` · ${fmt(session.durationMinutes)}분`}</span></div><p class="coach-review-range secondary-text">관찰 범위 ${e(value.windowStart)} ~ ${e(value.windowEnd)}</p>${reviewMainHTML(value)}${value.rows.length ? `<div class="coach-review-columns" aria-hidden="true"><span>운동 · 일지 위치</span><span>표시 세트 관찰</span><span>비교 상태</span><span>메인</span></div><ol class="coach-review-list" aria-label="분석할 운동">${value.rows.map(row => {
        const main = preferences.mainExerciseKeys.indexOf(row.mainKey || row.exerciseKey), active = row.blockId === reviewBlockId;
        const rank = main >= 0 ? `메인 ${main + 1}` : { focus: '우선 부위', suggested: '복합 동작', other: '일반' }[row.priorityKind] || '일반';
        return `<li class="coach-review-row ${active ? 'is-selected' : ''}" data-block-id="${e(row.blockId)}" data-exercise-key="${e(row.exerciseKey)}"><button type="button" class="coach-review-select" data-action="coach-review-select" data-block-id="${e(row.blockId)}" aria-pressed="${active}" aria-controls="coachReviewDetail"><span class="coach-review-name"><small>${e(rank)} · 일지 ${row.diaryPosition}</small><strong>${e(row.rawName || row.label)}</strong><span>${e(row.equipmentKey || '장비 미확인')}</span></span><span class="coach-review-values"><strong>${row.progression?.current ? e(reviewPoint(row.progression.current)) : '숫자 미확인'}</strong><small>${row.progression?.previous ? `이전 ${row.progression.previous.date} · ${e(reviewPoint(row.progression.previous))}` : '앞선 같은 조건 기록 없음'}</small></span><span class="coach-review-status">${e(reviewStatus(row))}${icon('chevron-right')}</span></button>${iconButton('coach-review-main', `${e(row.label)} 메인 운동 ${main >= 0 ? '해제' : '지정'}`, main >= 0 ? 'pin-off' : 'pin', `data-exercise-key="${e(row.mainKey || row.exerciseKey)}" data-block-id="${e(row.blockId)}" aria-pressed="${main >= 0}"`)}</li>`;
      }).join('')}</ol>${reviewDetailHTML(value, selected)}` : '<p class="empty-state">이 일지에는 종목별 세트가 없어요. 전체 요약을 임의로 나누지 않습니다.</p>'}<details class="source-details coach-review-limits"><summary>관찰 기준과 정렬 근거</summary>${value.limitations.map(line => `<p>${e(line)}</p>`).join('')}<p>메인 운동 → 설정한 우선 부위에 직접 해당하는 운동 → 복합 동작 → 나머지 순서입니다. 같은 단계는 일지순이며, 중량·세트 수로 중요도를 정하지 않습니다. 복합 동작 우선은 화면 배치용 기본값이며 개인의 최적 운동이나 성장 순위가 아닙니다.</p>${selected ? `<p>${e(selected.priorityReason)}</p>` : ''}<p>일반 세트가 있으면 가장 높은 기록 중량, 같은 중량이면 가장 많은 반복을 관찰합니다. 일반 세트가 없으면 준비 세트를 제외한 별도 표기 세트의 숫자만 남기며 수행 비교는 보류합니다. 근성장률·최대근력 측정이 아니며, 별도 표기 세트와 조건 미확인은 비교를 보류합니다. 정렬·메인 지정은 실제 운동 순서나 저장한 계획을 바꾸지 않습니다.</p></details></section>`;
    }
    function focusReviewAction(action, key, blockId) {
      const button = [...document.querySelectorAll('#coachWorkoutReview [data-action]')].find(row => row.dataset.action === action && (!key || row.dataset.exerciseKey === key) && (!blockId || row.dataset.blockId === blockId));
      button?.closest('details')?.setAttribute('open', '');
      button?.focus({ preventScroll: true });
    }
    function changeReviewPreference(change, message) {
      const next = copy(workspace()); next.reviewPreferences = T.getReviewPreferences(next.reviewPreferences); change(next.reviewPreferences);
      return saveWorkspace(next, message);
    }
    function message(role, text, source, replyTo = null, status = 'answered', contextDigest = null) { return { id: id(), role, text, createdAt: new Date().toISOString(), source, replyTo, contextDigest, status }; }
    async function sendChat(text) {
      if (!text.trim()) return;
      const local = root.MacroConversation.respond(text, { profile: app.getState().profile, day: app.getDay(), history: app.getState().days, coach: app.coachFor(), trainingAnalysis: analysis(), program: coachingProgram() });
      const safetyFirst = /safety|urgent|pain|clinical/.test(local.topic);
      const source = safetyFirst ? 'local' : 'codex';
      if (!safetyFirst && !canAskAI()) throw new Error('AI 상담에 연결할 수 없어요. 직접 기록과 기록 요약은 계속 사용할 수 있습니다.');
      if (source === 'codex' && (jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending')) throw new Error('현재 코치 요청이 끝난 뒤 진행해 주세요.');
      const next = copy(workspace()), user = message('user', text.trim(), source, null, source === 'codex' ? 'pending' : 'answered');
      next.messages.push(user);
      chatScrollToLatest = true;
      if (source === 'local') {
        next.messages.push(message('coach', `안전 안내\n\n${local.text}`, 'local', user.id)); if (saveWorkspace(next)) chatDraft = ''; app.selectView('coach', false); return;
      }
      if (!saveWorkspace(next)) return;
      chatDraft = '';
      try { await startJob('chat', text.trim(), null, user.id); } catch (error) { answerFailure(user.id, error.message); }
    }
    function answerFailure(replyTo, text) {
      if (!replyTo) { toast(text, true); return; }
      const next = copy(workspace()), user = next.messages.find(row => row.id === replyTo); if (user) user.status = 'answered';
      next.messages.push(message('coach', `상담 요청을 완료하지 못했어요.\n\n${text}\n\n기록은 유지됩니다. 연결을 확인한 뒤 다시 요청해 주세요.`, 'codex', replyTo)); saveWorkspace(next);
    }
    async function startJob(kind, question, imageHash = null, replyTo = null, retry = false, queueEntry = null) {
      if (!canAskAI()) throw new Error('Codex에 연결할 수 없어요. 설치·로그인과 사용 한도를 확인해 주세요.');
      if (jobStarting || currentJob?.status === 'running' || currentJob?.status === 'pending') throw new Error('현재 코치 요청이 끝난 뒤 진행해 주세요.');
      jobStarting = true; app.render();
      try {
        const job = await bridge.request('/api/jobs', { kind, question, imageHash, state: app.getState(), date: queueEntry?.date || app.getDate(), retry });
        currentJob = { ...job, replyTo, queueId: queueEntry?.id || null };
        if (queueEntry) { queueEntry.status = 'running'; queueEntry.jobId = job.id; persistImageQueue(); }
        if (replyTo) { const next = copy(workspace()); const user = next.messages.find(row => row.id === replyTo); if (user) { user.contextDigest = job.contextDigest; saveWorkspace(next); } }
        if (kind !== 'chat' && !queueEntry) { tab = 'log'; app.selectView('training'); }
        await pollJob();
      } finally { jobStarting = false; app.render(); }
    }
    async function pollJob() {
      clearTimeout(jobTimer); if (!currentJob) return;
      try {
        const replyTo = currentJob.replyTo, queueId = currentJob.queueId, result = await bridge.request(`/api/jobs/${currentJob.id}`); currentJob = { ...result, replyTo, queueId };
        if (result.status === 'running' || result.status === 'pending') { app.renderJob?.(); jobTimer = setTimeout(pollJob, 1500); return; }
        if (result.status === 'completed') {
          if (result.kind === 'chat') {
            followUpDraft = result.result.coaching?.followUp || null;
            const next = copy(workspace()), user = next.messages.find(row => row.id === replyTo);
            if (user && !next.messages.some(row => row.replyTo === replyTo && row.contextDigest === result.contextDigest)) {
              user.status = 'answered'; next.messages.push(message('coach', [result.result.answer, ...result.result.questions.map(question => `확인할 것: ${question}`), ...result.result.uncertainties.map(line => `판단의 한계: ${line}`)].join('\n\n'), 'codex', replyTo, 'answered', result.contextDigest)); saveWorkspace(next);
            }
          } else { if (!imageDraft && !pendingImport) imageDraft = result; if (app.getView?.() === 'training') render(); }
        } else if (replyTo) answerFailure(replyTo, result.error || '응답이 중단됐어요. 다시 요청해 주세요.');
        else toast(result.error || '이미지를 읽지 못했어요.', true);
        const queued = intakeQueue.find(row => row.id === queueId);
        if (queued) { queued.status = result.status === 'completed' ? 'completed' : 'failed'; queued.error = result.error || null; if (result.status !== 'completed') intakeQueuePaused = true; persistImageQueue(); }
        app.render(); void refreshJobs(); if (!intakeQueuePaused) setTimeout(() => void pumpImageQueue(), 0);
      } catch (error) { currentJob = { ...currentJob, status: 'failed', error: error.message }; if (currentJob.replyTo) answerFailure(currentJob.replyTo, error.message); const queued = intakeQueue.find(row => row.id === currentJob.queueId); if (queued) { queued.status = 'failed'; queued.error = error.message; intakeQueuePaused = true; persistImageQueue(); } app.render(); }
    }
    async function connectDialog() {
      await bridge.refresh();
      if (!bridge.status?.connected) throw new Error('로컬 앱 서버에 연결하지 못했어요. 서버를 확인한 뒤 다시 연결해 주세요.');
      const stored = await bridge.request('/api/state');
      const current = app.getState();
      if (!stored.state) { await bridge.attach(current, null); toast('현재 브라우저의 숫자 기록을 PC 파일에도 저장합니다. 원본 사진은 변경하지 않아요.'); return; }
      openDialog('PC 기록과 현재 브라우저 확인', `<div class="conflict-comparison"><section><h3>현재 브라우저</h3><p>${current.profile ? '프로필 있음' : '프로필 없음'} · ${Object.keys(current.days).length}일 · 운동 ${current.training?.records.length || 0}개</p></section><section><h3>PC 앱 기록</h3><p>${stored.state.profile ? '프로필 있음' : '프로필 없음'} · ${Object.keys(stored.state.days).length}일 · 운동 ${stored.state.training?.records.length || 0}개</p><p>${e(stored.state.updatedAt)}</p></section></div><p class="form-help">숫자 기록·프로필·계획·대화를 연결하며 원본 사진과 판독 캐시는 바꾸지 않아요. 다른 주소의 브라우저 저장소는 서로 분리됩니다. 교체 전 현재 전체 백업을 내려받고 PC 앱 기록 파일의 이전본도 보관합니다.</p><label class="field"><span>사용할 기록</span><select name="choice"><option value="restore">PC 기록을 이 브라우저로 복원</option><option value="upload">현재 브라우저 기록을 PC에 연결</option></select></label><label class="checkbox-field"><input name="confirmed" type="checkbox" required>두 기록을 확인했고 선택한 원본을 사용할게요.</label>${actions('확인한 기록으로 연결')}`, async form => {
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
      const action = ({ 'today-workout-open': 'training-open', 'today-workout-reuse': 'training-reuse', 'today-workout-add': 'training-add', 'today-schedule-start': 'schedule-start' })[button.dataset.action] || button.dataset.action, data = workspace();
      const record = data.records.find(row => row.id === (button.dataset.id || button.dataset.record));
      if (action === 'connection-setup') setupDialog();
      else if (action === 'coach-review-order') {
        if (!['priority', 'diary'].includes(button.dataset.order)) return true;
        const saved = changeReviewPreference(value => { value.order = button.dataset.order; });
        if (!saved) app.render();
        [...document.querySelectorAll('#coachWorkoutReview [data-action="coach-review-order"]')].find(row => row.dataset.order === button.dataset.order)?.focus({ preventScroll: true });
      }
      else if (action === 'coach-review-select') {
        if (!workoutReview().rows.some(row => row.blockId === button.dataset.blockId)) throw new Error('선택한 운동 기록이 바뀌었어요. 일지를 다시 확인해 주세요.');
        reviewBlockId = button.dataset.blockId; app.render(); $('coachReviewDetail')?.focus();
      }
      else if (action === 'coach-review-list') { focusReviewAction('coach-review-select', null, button.dataset.blockId); document.activeElement?.scrollIntoView({ block: 'center' }); }
      else if (action === 'coach-review-main' || action === 'coach-review-main-up' || action === 'coach-review-main-down') {
        const key = button.dataset.exerciseKey, current = T.getReviewPreferences(data.reviewPreferences), index = current.mainExerciseKeys.indexOf(key);
        const row = button.dataset.blockId ? workoutReview().rows.find(item => item.blockId === button.dataset.blockId) : null;
        // A row can be pinned by both its original name and its confirmed movement.
        const removalKeys = new Set(row?.mainKeys || [key]);
        if (index < 0 && (action !== 'coach-review-main' || !workoutReview().rows.some(row => row.exerciseKey === key))) throw new Error('메인 운동으로 지정할 기록을 찾을 수 없어요.');
        changeReviewPreference(value => {
          if (action === 'coach-review-main') { if (index >= 0) value.mainExerciseKeys = value.mainExerciseKeys.filter(item => !removalKeys.has(item)); else value.mainExerciseKeys.push(key); }
          else { const to = index + (action === 'coach-review-main-up' ? -1 : 1); if (to >= 0 && to < value.mainExerciseKeys.length) [value.mainExerciseKeys[index], value.mainExerciseKeys[to]] = [value.mainExerciseKeys[to], value.mainExerciseKeys[index]]; }
        }, action === 'coach-review-main' ? index >= 0 ? '메인 운동 지정을 해제했어요.' : '다음 일지에도 이 종목을 메인 운동으로 표시해요.' : '메인 운동의 표시 우선순위를 바꿨어요.');
        focusReviewAction(action, button.dataset.blockId ? null : key, button.dataset.blockId);
        if (!document.activeElement?.closest('#coachWorkoutReview')) $('coachReviewSession')?.focus();
      }
      else if (action === 'connection-copy-command') {
        try { await navigator.clipboard.writeText(button.dataset.command); toast('명령을 복사했어요. 실행은 터미널에서 직접 선택합니다.'); }
        catch { toast('명령을 복사하지 못했어요. 화면의 명령은 그대로 확인할 수 있습니다.', true); }
      }
      else if (action === 'connection-refresh') { await bridge.refresh(); refreshSetup(); }
      else if (action === 'connection-check') {
        if (setupChecking) return true;
        const previousCheck = bridge.status?.runtime?.checkedAt;
        setupChecking = true; setupNotice = ''; refreshSetup();
        try {
          await bridge.checkRuntime();
          if (bridge.status?.runtime?.busy && bridge.status.runtime.checkedAt === previousCheck) setupNotice = '다른 요청의 실행 상태를 보호하고 있어 이번에는 로그인 확인을 새로 하지 않았어요. 진행 중인 요청부터 확인해 주세요.';
        } catch (error) { setupNotice = error.message; }
        finally { setupChecking = false; refreshSetup(); $('connectionSetupContent')?.querySelector('[data-action="connection-check"]')?.focus(); }
      }
      else if (action === 'nav-training' || action === 'nav-program') { tab = action === 'nav-program' ? 'program' : 'log'; app.selectView('training'); }
      else if (action === 'training-tab') { tab = button.dataset.tab; render(); $(`trainingContent`).querySelector(`[data-action="training-tab"][data-tab="${tab}"]`)?.focus(); }
      else if (action === 'training-open') {
        if (!data.records.some(row => row.id === button.dataset.id)) throw new Error('이 일지를 찾을 수 없어요. 기록이 삭제되거나 변경됐는지 확인해 주세요.');
        chosen = button.dataset.id; filter = ''; tab = 'log'; app.selectView('training'); render();
      }
      else if (action === 'training-add') recordDialog();
      else if (action === 'training-edit') recordDialog(record);
      else if (action === 'training-reuse') recordDialog(record, true);
      else if (action === 'training-delete') app.confirmDialog('운동 일지 삭제', '이 앱의 일지만 삭제해요. 연결된 계획은 수행 미확인으로 돌아가고 처방은 남습니다. 원본 이미지와 판독 캐시는 유지됩니다. 식사 목표에 연결한 운동 시간은 해당 날짜에서 별도로 확인해 주세요.', '삭제', () => { const next = copy(data); next.records = next.records.filter(row => row.id !== record.id); planning(next).schedule.filter(row => row.recordId === record.id).forEach(row => { row.recordId = null; row.status = 'planned'; }); return saveWorkspace(next, '앱 일지를 삭제했어요. 원본과 계획은 유지됩니다.'); });
      else if (action === 'training-map') mappingDialog(record, record.exercises.find(row => row.id === button.dataset.exercise));
      else if (action === 'training-reference') referenceDialog(record, record.exercises.find(row => row.id === button.dataset.exercise));
      else if (action === 'training-link') linkDialog(record);
      else if (action === 'program-settings') settingsDialog();
      else if (action === 'program-save') saveProgramDialog();
      else if (action === 'program-edit-day') editProgramDay(button.dataset.day);
      else if (action === 'program-schedule') scheduleProgramDialog();
      else if (action === 'program-preferences') preferencesDialog();
      else if (action === 'schedule-week') { const offset = Number(button.dataset.offset), date = I.shiftDate(scheduleWeek, offset); if (S.isValidDate(date) && date <= '2199-12-25') scheduleWeek = date; render(); $('trainingContent').querySelector(`[data-action="schedule-week"][data-offset="${offset}"]`)?.focus(); }
      else if (action.startsWith('schedule-')) {
        const row = planning().schedule.find(item => item.id === button.dataset.id); if (!row) throw new Error('배치한 계획을 찾을 수 없어요.');
        if (action === 'schedule-start') { editorNewProgram = null; editorNewAssignment = null; startAssignment(row); }
        else if (action === 'schedule-move') assignmentDialog(row, 'move');
        else if (action === 'schedule-link') assignmentDialog(row, 'link');
        else if (action === 'schedule-adjust') assignmentDialog(row, 'adjust');
        else if (action === 'schedule-skip') { ensurePlanDate(row.date); app.confirmDialog('이 계획 건너뛰기', '이 계획을 수행하지 않았다고 표시합니다. 해당 날짜가 휴식이었다고 판단하거나 기존 실제 일지를 지우지는 않아요.', '건너뛰기', () => { const next = copy(workspace()); const target = next.planning.schedule.find(item => item.id === row.id); if (target.status !== 'planned') throw new Error('계획 상태가 달라졌어요. 다시 확인해 주세요.'); target.status = 'skipped'; return saveWorkspace(next, '이 계획을 건너뛰었다고 표시했어요.'); }); }
        else if (action === 'schedule-review') openDialog('조정 후 다시 확인', `<p>${e(row.adjustment.reason)}</p><p>${e(T.evaluateAssignment(row, workspace().records, workspace().mappings).message)}</p><label class="checkbox-field"><input type="checkbox" required>실제 수행과 현재 컨디션을 확인했어요.</label><p class="form-help">검토 완료는 회복됐다는 판정이 아닙니다. 필요한 다음 변화는 새 날짜에 배치한 계획에서 선택해 주세요.</p>${actions('검토 완료 표시')}`, () => { const next = copy(workspace()); next.planning.schedule.find(item => item.id === row.id).adjustment.reviewed = true; if (saveWorkspace(next, '조정 후 검토한 사실을 남겼어요.')) closeDialog(); });
      }
      else if (action === 'program-start') {
        const value = program(), selected = value.days[Number(button.dataset.index)]; if (!selected || value.status !== 'ready') throw new Error('현재 적용 가능한 프로그램을 먼저 확인해 주세요.');
        editorNewProgram = T.createProgram(value, { id: id(), createdAt: new Date().toISOString() });
        editorNewAssignment = T.createAssignment(editorNewProgram, editorNewProgram.days[Number(button.dataset.index)].id, app.getDate(), id());
        startAssignment(editorNewAssignment);
      } else if (action.startsWith('editor-')) {
        captureEditor();
        if (action === 'editor-move-up' || action === 'editor-move-down') {
          const from = Number(button.dataset.index), to = from + (action === 'editor-move-up' ? -1 : 1);
          if (to >= 0 && to < editor.exercises.length) { const [exercise] = editor.exercises.splice(from, 1); editor.exercises.splice(to, 0, exercise); }
        }
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
      else if (action === 'training-import-detail') { editorIsDraft = true; editorAssignmentId = null; editorNewProgram = null; editorNewAssignment = null; editor = copy(pendingImport.records.find(record => record.id === button.dataset.id)); drawEditor(); }
      else if (action === 'training-import-confirm') {
        if (!pendingImport) return true;
        if (pendingImport.imageJob && !pendingImport.reviewed) throw new Error('모든 날짜·세트 숫자와 중량 기준을 원본과 대조한 뒤 확인해 주세요.');
        const fresh = TS.mergeRecords(workspace(), pendingImport.records);
        const oldConflicts = pendingImport.result.conflicts.map(row => `${row.id}:${row.reason}`).sort().join('|'), newConflicts = fresh.conflicts.map(row => `${row.id}:${row.reason}`).sort().join('|');
        if (oldConflicts !== newConflicts) { pendingImport.result = fresh; pendingImport.reviewed = false; render(); toast('미리보기 이후 기록이 바뀌어 충돌을 다시 확인했어요.'); return true; }
        if (saveWorkspace(fresh.workspace, '충돌 없는 기록을 가져왔어요. 보류한 원문은 그대로 남아 있어요.')) { if (fresh.conflicts.length) { pendingImport.records = fresh.conflicts.map(row => row.incoming); pendingImport.result = TS.mergeRecords(workspace(), pendingImport.records); } else pendingImport = null; render(); }
      }
      else if (action === 'training-conflict') conflictDialog(pendingImport.result.conflicts[Number(button.dataset.index)]);
      else if (action === 'training-image') imageDialog();
      else if (action === 'image-inbox-open') { tab = 'log'; app.selectView('training'); render(); const inbox = $('trainingContent').querySelector('.image-inbox'); if (inbox) { inbox.open = true; inbox.querySelector('summary').focus(); inbox.scrollIntoView({ block: 'start' }); } }
      else if (action === 'image-upload-remove') { if (imageUploadBusy) return true; const row = imageUploads.find(item => item.id === button.dataset.id); if (row?.status === 'stored') return true; if (row) URL.revokeObjectURL(row.url); imageUploads = imageUploads.filter(item => item.id !== button.dataset.id); if ($('coachImageFile')) $('coachImageFile').required = !imageUploads.length; drawImageUploads(); }
      else if (action === 'image-queue-pause') { intakeQueuePaused = true; app.render(); }
      else if (action === 'image-queue-continue') { if (!canAskAI()) throw new Error('AI 판독 연결을 확인해 주세요. 사진과 대기는 남아 있어요.'); await refreshJobs(); intakeQueuePaused = false; void pumpImageQueue(); }
      else if (action === 'image-queue-remove') { const row = intakeQueue.find(item => item.id === button.dataset.id); if (row && ['queued', 'failed'].includes(row.status)) { row.status = 'cancelled'; persistImageQueue(); app.render(); } }
      else if (action === 'image-queue-retry') { const row = intakeQueue.find(item => item.id === button.dataset.id); if (row?.status === 'failed') { if (!canAskAI()) throw new Error('AI 판독 연결을 확인해 주세요.'); row.status = 'queued'; row.retry = true; row.error = null; persistImageQueue(); intakeQueuePaused = false; void pumpImageQueue(); } }
      else if (action === 'image-review-detail') { if (!pendingImport?.imageJob) { if (!imageDraft) return true; previewRecords(workoutDraftRecords(), [], imageDraft); imageDraft = null; } editorIsDraft = true; editorAssignmentId = null; editorNewProgram = null; editorNewAssignment = null; editor = copy(pendingImport.records.find(row => row.id === button.dataset.id)); drawEditor(); }
      else if (action === 'image-source-start') {
        if (!canAskAI()) throw new Error('AI 판독에 연결할 수 없어요. 사진과 메모는 그대로 보관됩니다.');
        if (intakeQueue.some(row => row.hash === button.dataset.hash && ['queued', 'requesting', 'running'].includes(row.status))) throw new Error('이미 선택한 판독 대기에 있어요. 대기 목록에서 계속하거나 제외한 뒤 요청해 주세요.');
        const source = uploadedImages.find(row => row.hash === button.dataset.hash);
        if (source?.damaged) throw new Error('이 사진의 보관 정보가 손상돼 먼저 확인해야 해요. 원본은 덮어쓰지 않습니다.');
        openDialog('보관한 사진 판독', `<div class="image-draft-summary">${imageThumbnail(button.dataset.hash)}<label class="field"><span>기록 종류</span><select name="kind">${options([['workout', '운동 일지'], ['meal', '식사'], ['body', '체성분']], source?.kind || 'workout')}</select></label></div><label class="field"><span>날짜·분량 맥락 · 선택</span><textarea name="note" rows="2" maxlength="6000">${e(source?.note || '')}</textarea></label><p class="form-help">이 이미지와 메모를 Codex에 전송합니다. ${aiUsageNote()} 초안을 확인한 뒤에만 숫자 기록에 반영해요.</p>${actions('이 이미지 판독 요청')}`, async form => {
          const entry = $('entryForm');
          try {
            await startJob(String(form.get('kind')), String(form.get('note') || ''), button.dataset.hash);
            if (entry.isConnected && $('entryDialog').open) closeDialog();
          } catch (error) { throw new Error(`사진은 보관되어 있어요. 입력한 종류와 메모를 유지했습니다. ${error.message}`); }
        });
      }
      else if (action === 'image-workout-preview') { const records = workoutDraftRecords(); if (!records.length) { toast('판독한 세트가 없어요. 더 선명한 원본이나 날짜를 확인해 주세요.', true); return true; } previewRecords(records, [], imageDraft); imageDraft = null; render(); }
      else if (action === 'image-meal-confirm') confirmMeal();
      else if (action === 'image-body-confirm') confirmBody();
      else if (action === 'image-draft-dismiss') { imageDraft = null; render(); }
      else if (action === 'coach-memory') memoryDialog();
      else if (action === 'coach-followup-add') followUpDialog();
      else if (action === 'coach-followup-proposal') { if (followUpDraft) followUpDialog(null, followUpDraft); }
      else if (action === 'coach-followup-edit') followUpDialog(data.followUps.find(row => row.id === button.dataset.id));
      else if (action === 'coach-followup-done') { const next = copy(data), row = next.followUps.find(item => item.id === button.dataset.id); if (row) { row.status = 'done'; saveWorkspace(next, '확인한 점검으로 표시했어요.'); } }
      else if (action === 'coach-continue') { const user = workspace().messages.find(row => row.id === button.dataset.user); if (user && canAskAI()) { chatDraft = user.text; app.selectView('coach'); $('coachChatInput').value = chatDraft; $('coachChatInput').focus(); } }
      else if (action === 'image-job-open') {
        if (jobStarting || (['running', 'pending'].includes(currentJob?.status) && currentJob.id !== button.dataset.id)) throw new Error('현재 요청이 끝난 뒤 이전 이미지 초안을 확인해 주세요.');
        const fetched = await bridge.request(`/api/jobs/${button.dataset.id}`);
        if (jobStarting || (['running', 'pending'].includes(currentJob?.status) && currentJob.id !== button.dataset.id)) throw new Error('새 요청이 시작되어 이전 초안은 열지 않았어요. 현재 요청이 끝난 뒤 다시 확인해 주세요.');
        currentJob = fetched; if (currentJob.status === 'completed') { imageDraft = currentJob; tab = 'log'; app.selectView('training'); render(); } else { app.selectView('training'); await pollJob(); }
      }
      else if (action === 'bridge-connect') await connectDialog();
      else if (action === 'bridge-refresh') { await bridge.refresh(); await refreshJobs(); }
      else if (action === 'coach-job-cancel') { if (currentJob.queueId) intakeQueuePaused = true; await bridge.request(`/api/jobs/${currentJob.id}/cancel`, {}); await pollJob(); }
      else if (action === 'coach-job-retry') { const previous = currentJob; await startJob(previous.kind, previous.question, previous.imageHash, previous.replyTo, true); }
      else return false;
      return true;
    }
    async function handleChange(event) {
      if (event.target.id === 'coachReviewSession') {
        if (!analysis().sessions.some(row => row.id === event.target.value)) throw new Error('이 분석 범위에 없는 일지예요.');
        reviewSessionId = event.target.value; reviewBlockId = null; app.render(); $('coachReviewSession')?.focus({ preventScroll: true }); return true;
      }
      if (event.target.id === 'codexUseEnabled') {
        const next = event.target.checked;
        try { localStorage.setItem(aiPreferenceKey, next ? 'enabled' : 'disabled'); aiEnabled = next; setupNotice = ''; app.render(); refreshSetup(); $('codexUseEnabled')?.focus(); }
        catch { event.target.checked = aiEnabled; toast('Codex 사용 설정을 저장하지 못했어요. 이전 선택과 기록은 유지합니다.', true); }
        return true;
      }
      if (event.target.id === 'coachImageFile') { if (!imageUploadBusy) addImageUploads([...event.target.files]); return true; }
      if (event.target.id === 'imageWorkoutReviewed') { if (pendingImport?.imageJob) { pendingImport.reviewed = event.target.checked; const button = $('trainingImportPreview').querySelector('[data-action="training-import-confirm"]'); button.disabled = !pendingImport.reviewed; } return true; }
      if (event.target.id === 'savedProgramSelect') { const next = copy(workspace()); next.planning.activeProgramId = event.target.value; saveWorkspace(next); $('savedProgramSelect')?.focus(); return true; }
      if (event.target.id === 'scheduleWeek') { const date = event.target.value; if (!S.isValidDate(date) || date > '2199-12-25') throw new Error('주 시작 날짜를 확인해 주세요.'); scheduleWeek = date; render(); $('scheduleWeek')?.focus(); return true; }
      if (event.target.id === 'trainingDate') { const date = event.target.value; if (!S.isValidDate(date) || date > I.dateKey()) throw new Error('오늘까지의 날짜를 선택해 주세요.'); app.setDate(date); return true; }
      if (event.target.id === 'trainingImportFile') {
        const file = event.target.files[0]; if (!file) return true; if (file.size > 8 * 1024 * 1024) throw new Error('일지 JSON은 8MB 이하로 선택해 주세요.');
        const parsed = TS.parseImport(await file.text()); closeDialog(); previewRecords(parsed.records, parsed.warnings); return true;
      }
      return false;
    }
    document.addEventListener('submit', event => { if (event.target.id === 'coachChatForm') { event.preventDefault(); const input = $('coachChatInput'); if (!input) { toast('Codex 연결 설정에서 설치·로그인 상태를 확인해 주세요.', true); return; } void sendChat(input.value).catch(error => toast(error.message, true)); } });
    document.addEventListener('input', event => { if (event.target.id === 'trainingSearch') { const cursor = event.target.selectionStart; filter = event.target.value; render(); $('trainingSearch').focus(); $('trainingSearch').setSelectionRange(cursor, cursor); } });
    document.addEventListener('input', event => { if (event.target.id === 'coachChatInput') chatDraft = event.target.value; });
    document.addEventListener('toggle', event => { if (event.target.matches?.('.conversation-saved') && event.target.open) restoreChatScroll(); }, true);
    document.addEventListener('error', event => { if (event.target.matches?.('[data-image-fallback]')) { const fallback = document.createElement('span'); fallback.className = 'image-unavailable'; fallback.textContent = '원본 연결 없음'; event.target.replaceWith(fallback); } }, true);
    async function init() {
      loadImageQueue();
      await bridge.refresh();
      try { await bridge.resume(app.getState()); } catch (error) { toast(error.message, true); }
      await refreshJobs();
      const pending = workspace().messages.findLast(message => message.role === 'user' && message.status === 'pending' && message.contextDigest);
      if (pending && bridge.status?.connected) { currentJob = { id: pending.contextDigest.slice(0, 32), replyTo: pending.id, status: 'running' }; await pollJob(); }
      else {
        const active = jobs.find(row => ['running', 'pending'].includes(row.status));
        if (active && bridge.status?.connected) { currentJob = { ...active, queueId: intakeQueue.find(row => row.jobId === active.id)?.id || null }; await pollJob(); }
      }
      app.render();
    }
    return { render, analysis, program, coachingProgram, handleAction, handleChange, chatHTML, memoryHTML, coachContextHTML, workoutReviewHTML, connectionPanel, setupDialog, canAskAI, bridge, todayHTML, intakeSummaryHTML, inboxHTML,
      onDiaryScan(result) { unprocessedImages = Array.isArray(result?.pending) ? result.pending : []; app.render(); },
      onSave(state) { bridge.sync(state); }, init, jobHTML, enhanceChat, captureChatScroll };
  }
  root.MacroTrainingUI = { create };
})(window);
