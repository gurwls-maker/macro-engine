(function (root) {
  'use strict';
  function create(onChange) {
    let status = null, enabled = false, digest = null, writing = false, pending = null;
    const CONNECTION_KEY = 'macro-engine.pc-connection';
    function remember(value) { try { localStorage.setItem(CONNECTION_KEY, value ? 'connected' : 'disconnected'); } catch {} }
    const notify = () => onChange?.();
    async function request(route, input) {
      if (location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('개인 코치 연결은 이 PC의 로컬 앱 주소에서만 사용할 수 있어요.');
      const response = await fetch(route, input === undefined ? { cache: 'no-store' } : {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Macro-Token': status?.token || '' }, body: JSON.stringify(input)
      });
      let result; try { result = await response.json(); } catch { throw new Error('로컬 코치에 연결하지 못했어요. 앱 서버를 확인해 주세요.'); }
      if (!response.ok) throw new Error(result.error || '요청을 완료하지 못했어요.');
      return result;
    }
    async function refresh() {
      try { status = await request('/api/bridge/status'); if (!enabled) digest = status.stored?.digest || null; }
      catch { status = { connected: false, runtime: { available: false }, inbox: [] }; }
      notify(); return status;
    }
    async function attach(state, expectedDigest) {
      const result = await request('/api/state', { state, expectedDigest });
      digest = result.digest; enabled = true; remember(true); if (status) { status.storageError = null; status.syncError = null; } notify(); return result;
    }
    async function flush() {
      if (writing || !enabled || !pending) return;
      writing = true;
      while (pending && enabled) {
        const state = pending; pending = null;
        try { const result = await request('/api/state', { state, expectedDigest: digest }); digest = result.digest; }
        catch (error) { enabled = false; status.syncError = error.message; pending = null; notify(); }
      }
      writing = false;
    }
    return {
      get status() { return status; }, get enabled() { return enabled; }, get digest() { return digest; },
      refresh, request, attach,
      async resume(state) {
        let remembered = false; try { remembered = localStorage.getItem(CONNECTION_KEY) === 'connected'; } catch {}
        if (!remembered || !status?.stored || status.storageError || !crypto.subtle) return false;
        const bytes = new TextEncoder().encode(JSON.stringify(state));
        const buffer = await crypto.subtle.digest('SHA-256', bytes);
        const current = Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
        if (current !== status.stored.digest) return false;
        await attach(state, current); return true;
      },
      sync(state) { if (enabled) { pending = JSON.parse(JSON.stringify(state)); void flush(); } },
      disconnect() { enabled = false; pending = null; remember(false); notify(); }
    };
  }
  root.MacroBridge = { create };
})(window);
