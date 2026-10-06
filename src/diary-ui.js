(function (root) {
  'use strict';
  function create(app) {
    const { bridge, escape: e, command, openDialog, closeDialog, toast, icons } = app;
    const $ = id => document.getElementById(id);
    let preview = null, generation = 0, scanGeneration = 0;
    async function folderDialog() {
      if (!bridge.status?.connected) { app.setupDialog(); return; }
      const opened = ++generation;
      openDialog('원본 운동일지 사진 폴더', `
        <div class="diary-folder-status" id="diaryFolderStatus" role="status">현재 경로를 확인하고 있어요.</div>
        <label class="field"><span>이 PC에서 접근할 수 있는 폴더의 전체 경로</span><input id="diarySourceRoot" name="sourceRoot" type="text" maxlength="2000" autocomplete="off" spellcheck="false" required></label>
        <p class="form-help">원본 사진은 이동·수정하지 않습니다. 앱에서 바꾼 중량·반복은 별도 숫자 기록으로 저장됩니다.</p>
        <div class="form-actions"><button type="submit" class="button button-primary">경로 확인</button>${command('dialog-close', '닫기', 'x')}</div><div id="diaryFolderPreview" aria-live="polite"></div>
        <section class="diary-folder-flow"><h3>새 사진과 판독 기록</h3><p>새 사진 확인은 파일 목록·중복만 검사하며 Codex를 호출하지 않습니다. 미판독 사진은 숫자 기록에 포함되지 않아요.</p>
        <div class="form-actions">${command('diary-scan', '새 사진 확인', 'folder-search', 'disabled')}${command('image-inbox-open', '사진 확인함', 'inbox')}${command('training-import', '판독된 기록 가져오기', 'file-input')}</div>
        <p class="form-help">확인함에서 사진별 Codex 판독을 요청할 수 있습니다. 여러 사진은 Codex 채팅의 폴더 분석으로도 처리할 수 있으며, 상시 감시·자동 판독은 하지 않습니다.</p></section>`, async form => {
        const input = String(form.get('sourceRoot') || '').trim();
        const result = await bridge.request('/api/diary/settings/preview', { sourceRoot: input });
        if (!isCurrent(opened) || $('diarySourceRoot').value.trim() !== input) return;
        preview = { ...result, input };
        $('diaryFolderPreview').innerHTML = `<div class="import-review"><strong>${e(result.sourceRoot)}</strong><p>${result.configured && result.changed ? '사진 폴더 경로만 변경합니다. 기존 앱 기록·판독·교정 파일은 유지하고, 원본 연결 여부는 다음 스캔에서 다시 확인합니다.' : '이 경로를 원본 사진 폴더로 저장합니다. 저장만으로 사진 판독이나 앱 기록 가져오기가 진행되지는 않습니다.'}</p>${command('diary-folder-apply', result.changed ? '확인한 경로 저장' : '이 경로 사용', 'check', '', true)}</div>`;
        icons(); $('diaryFolderPreview').querySelector('button')?.focus();
      });
      preview = null;
      try {
        const status = await bridge.request('/api/diary/settings');
        if (!isCurrent(opened)) return;
        $('diaryFolderStatus').textContent = status.configured ? `지정한 경로: ${status.sourceRoot}${status.reachable ? '' : ' · 지금은 접근할 수 없어요. 캐시는 유지됩니다.'}` : '아직 사진 폴더를 지정하지 않았어요.';
        if (!$('diarySourceRoot').value) $('diarySourceRoot').value = status.sourceRoot || '';
        $('entryForm').querySelector('[data-action="diary-scan"]').disabled = !status.configured;
        if (status.warning) $('diaryFolderStatus').textContent += ` ${status.warning}`;
      } catch (error) {
        if (isCurrent(opened)) { $('diaryFolderStatus').textContent = error.message; $('diaryFolderStatus').setAttribute('role', 'alert'); }
      }
    }
    function isCurrent(opened) { return generation === opened && $('entryDialog').open && Boolean($('diarySourceRoot')); }
    async function handleAction(button) {
      const action = button.dataset.action;
      if (action === 'diary-folder') { await folderDialog(); return true; }
      if (action === 'image-inbox-open' && $('diarySourceRoot')) { closeDialog(); return false; }
      if (action === 'diary-folder-apply') {
        if (!preview || !$('diarySourceRoot') || $('diarySourceRoot').value.trim() !== preview.input) throw new Error('경로가 바뀌었어요. 다시 경로 확인을 눌러 주세요.');
        const opened = generation, checked = preview; ++scanGeneration; button.disabled = true;
        try {
          await bridge.request('/api/diary/settings', { sourceRoot: checked.sourceRoot, expectedDigest: checked.expectedDigest });
          if (checked.changed) app.onScan({ pending: [] });
          if (isCurrent(opened)) { preview = null; $('diaryFolderPreview').textContent = '사진 폴더 경로를 저장했어요. 원본 사진과 앱 기록은 그대로입니다.'; $('entryForm').querySelector('[data-action="diary-scan"]').disabled = false; }
          await bridge.refresh(); toast('원본 사진 폴더를 지정했어요.');
        } finally { if (button.isConnected) button.disabled = false; }
        return true;
      }
      if (action === 'diary-scan') {
        const opened = generation, requestGeneration = ++scanGeneration; button.disabled = true;
        try {
          const result = await bridge.request('/api/diary/scan', {});
          const message = `사진 ${result.files}개 · 중복 제외 ${result.uniqueImages}개 · 판독 대기 ${result.pending.length}개 · 판독 캐시 ${result.cached}개. 사진 판독이나 앱 기록 저장은 하지 않았어요.`;
          if (isCurrent(opened) && requestGeneration === scanGeneration) { $('diaryFolderStatus').textContent = message; app.onScan(result); toast(message); }
        } finally { if (button.isConnected) button.disabled = false; }
        return true;
      }
      return false;
    }
    document.addEventListener('input', event => {
      if (event.target.id === 'diarySourceRoot') { preview = null; if ($('diaryFolderPreview')) $('diaryFolderPreview').textContent = ''; }
    });
    return { handleAction, folderDialog };
  }
  root.MacroDiaryUI = { create };
})(window);
