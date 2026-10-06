const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const S = require('../src/storage.js');
const D = require('./diary.cjs');
const DiarySettings = require('./diary-settings.cjs');
const { CoachRuntime, summarizeState, digest } = require('./coach-runtime.cjs');
const MAX_BODY = 15 * 1024 * 1024;
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(value));
}
function imageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: 'png', mime: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  return null;
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('JSON 형식으로 요청해 주세요.'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('요청은 15MB 이하여야 합니다.'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('요청 JSON을 확인해 주세요.'); }
}
function createBridge(options = {}) {
  const data = path.resolve(options.data || path.join(__dirname, '..', 'user-data', 'coach'));
  fs.mkdirSync(data, { recursive: true });
  const inbox = path.join(data, 'inbox'); fs.mkdirSync(inbox, { recursive: true });
  const token = crypto.randomBytes(32).toString('hex');
  const runtime = options.runtime || new CoachRuntime(data, options.runtimeOptions);
  const stateFile = path.join(data, 'app-state.json');
  const idValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  function readState() {
    if (!fs.existsSync(stateFile)) return { state: null, digest: null };
    const state = S.validateState(D.readJson(stateFile)); return { state, digest: digest(state) };
  }
  function validNote(value) {
    return typeof value === 'string' && value.length <= 6000
      && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)
      && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
  }
  function inboxEntryExists(file) {
    try { fs.lstatSync(file); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  function readInboxItem(hash) {
    const metadata = path.join(inbox, `${hash}.json`);
    if (fs.lstatSync(metadata).isSymbolicLink() || !fs.statSync(metadata).isFile()) throw new Error('이미지 목록이 손상됐어요.');
    const value = D.readJson(metadata);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.hash !== hash
      || !['workout', 'meal', 'body'].includes(value.kind) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 250
      || !Number.isInteger(value.bytes) || value.bytes <= 0 || value.bytes > 10 * 1024 * 1024
      || !['png', 'jpg', 'webp'].includes(value.extension) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || (value.note !== undefined && !validNote(value.note))) throw new Error('이미지 목록이 손상됐어요. 원본은 그대로 보관했어요.');
    return { ...value, note: value.note === undefined ? '' : value.note };
  }
  function publicInboxItem(value) {
    return { hash: value.hash, name: value.name, kind: value.kind, bytes: value.bytes, createdAt: value.createdAt, note: value.note };
  }
  function listInbox() {
    return fs.readdirSync(inbox).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => {
      try { return publicInboxItem(readInboxItem(name.slice(0, 64))); }
      catch { return { damaged: true, hash: name.slice(0, 64) }; }
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  function imageFile(hash) {
    if (!idValid(hash)) throw new Error('이미지 식별자를 확인해 주세요.');
    const metadata = path.join(inbox, `${hash}.json`);
    if (inboxEntryExists(metadata)) {
      const item = readInboxItem(hash);
      const file = path.join(inbox, `${hash}.${item.extension}`);
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || D.hashFile(file) !== hash) throw new Error('이미지 원본이 변경됐어요.');
      return file;
    }
    const config = D.readJson(path.join(data, 'config.json'));
    const manifest = D.readJson(path.join(data, 'manifest.json'));
    const source = manifest.sources?.[hash];
    if (!source) throw new Error('등록된 이미지가 아니에요.');
    if (!Array.isArray(source.paths) || source.paths.some(value => typeof value !== 'string' || !value)) throw new Error('이미지 원본 경로 목록이 손상됐어요.');
    for (const relative of source.paths || []) {
      const root = fs.realpathSync(config.sourceRoot); const file = path.resolve(root, relative);
      if (!D.inside(root, file) || !fs.existsSync(file)) continue;
      const real = fs.realpathSync(file);
      if (!D.inside(root, real) || fs.lstatSync(file).isSymbolicLink()) continue;
      if (D.hashFile(file) === hash) return file;
    }
    throw new Error('현재 원본 이미지에 접근할 수 없어요. 캐시 기록은 그대로 사용할 수 있어요.');
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false;
    const host = req.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) { json(res, 403, { error: '로컬 연결만 허용합니다.' }); return true; }
    const origin = req.headers.origin;
    const ownOrigin = `http://${host}`;
    if ((origin && origin !== ownOrigin) || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) { json(res, 403, { error: '다른 사이트에서는 개인 기록에 접근할 수 없습니다.' }); return true; }
    if (!['GET', 'POST'].includes(req.method)) { json(res, 405, { error: '허용하지 않는 요청 방식입니다.' }); return true; }
    if (req.method === 'POST' && req.headers['x-macro-token'] !== token) { json(res, 403, { error: '연결이 만료됐어요. 앱을 새로고침해 주세요.' }); return true; }
    try {
      if (req.method === 'GET' && url.pathname === '/api/bridge/status') {
        let stored = null, storageError = null;
        try { const value = readState(); stored = value.state ? { digest: value.digest, profile: Boolean(value.state.profile), days: Object.keys(value.state.days).length, workouts: value.state.training?.records.length || 0 } : null; } catch { storageError = 'PC 저장 파일이 손상되어 덮어쓰기를 막았어요. 원본을 복구해 주세요.'; }
        json(res, 200, { connected: true, token, runtime: runtime.status(), stored, storageError, diaryConfigured: fs.existsSync(path.join(data, 'config.json')), inbox: listInbox() });
      } else if (req.method === 'POST' && url.pathname === '/api/runtime/check') {
        const input = await body(req);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('연결 확인에는 기록이나 질문을 보내지 않습니다.');
        if (typeof runtime.checkRuntime !== 'function') throw new Error('이 서버에서는 설치·로그인 확인을 지원하지 않아요. 앱 서버를 업데이트해 주세요.');
        json(res, 200, { runtime: await runtime.checkRuntime() });
      } else if (req.method === 'GET' && url.pathname === '/api/state') json(res, 200, readState());
      else if (req.method === 'GET' && url.pathname === '/api/diary/settings') json(res, 200, DiarySettings.readStatus(data));
      else if (req.method === 'POST' && url.pathname === '/api/diary/settings/preview') json(res, 200, DiarySettings.preview(data, await body(req)));
      else if (req.method === 'POST' && url.pathname === '/api/diary/settings') json(res, 200, DiarySettings.apply(data, await body(req)));
      else if (req.method === 'POST' && url.pathname === '/api/diary/scan') {
        const input = await body(req);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('새 사진 확인에는 별도 입력이 필요하지 않습니다.');
        json(res, 200, D.locked(data, () => D.scan(data, false)));
      }
      else if (req.method === 'POST' && url.pathname === '/api/state') {
        const input = await body(req); const incoming = S.validateState(input.state);
        const result = D.locked(data, () => {
          const current = readState();
          if (input.expectedDigest !== current.digest) return { conflict: true, digest: current.digest };
          const nextDigest = digest(incoming);
          if (nextDigest === current.digest) return { digest: current.digest };
          D.atomicJson(stateFile, incoming); return { digest: nextDigest };
        });
        if (result.conflict) json(res, 409, { error: 'PC에 다른 기록이 있어요. 먼저 확인하고 복원하거나 연결해 주세요.', digest: result.digest });
        else json(res, 200, result);
      } else if (req.method === 'POST' && url.pathname === '/api/diary/context') {
        const input = await body(req);
        if (!S.isValidDate(input.from) || !S.isValidDate(input.to) || input.from > input.to) throw new Error('일지 날짜 범위를 확인해 주세요.');
        let scan;
        try { scan = D.locked(data, () => D.scan(data, false)); }
        catch (error) { scan = { warning: `새 스캔에 실패해 마지막 성공한 캐시를 사용했어요. ${error.code === 'ENOENT' ? '원본 폴더 연결을 확인해 주세요.' : error.message}`, pending: [] }; }
        const context = D.context(data, input.from, input.to, true);
        json(res, 200, { context, scan });
      } else if (req.method === 'GET' && url.pathname === '/api/inbox') json(res, 200, { images: listInbox() });
      else if (req.method === 'POST' && url.pathname === '/api/inbox') {
        const input = await body(req);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['kind', 'name', 'base64', 'note'].includes(key))) throw new Error('이미지 요청 항목을 확인해 주세요.');
        if (!['workout', 'meal', 'body'].includes(input.kind) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 250) throw new Error('이미지 이름과 종류를 확인해 주세요.');
        const note = input.note === undefined ? '' : input.note;
        if (!validNote(note)) throw new Error('이미지 메모는 올바른 글자로 6,000자 이내여야 해요.');
        if (typeof input.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new Error('이미지 데이터를 확인해 주세요.');
        const buffer = Buffer.from(input.base64, 'base64');
        if (buffer.length > 10 * 1024 * 1024 || buffer.toString('base64') !== input.base64) throw new Error('이미지는 10MB 이하의 PNG, JPG, WebP로 올려 주세요.');
        const type = imageType(buffer); if (!type) throw new Error('PNG, JPG, WebP 이미지만 지원해요.');
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const target = path.join(inbox, `${hash}.${type.extension}`); const metadata = path.join(inbox, `${hash}.json`);
        const result = D.locked(data, () => {
          const reused = inboxEntryExists(metadata);
          const stored = reused ? readInboxItem(hash) : { hash, name: input.name, kind: input.kind, bytes: buffer.length, extension: type.extension, createdAt: new Date().toISOString(), note };
          if (stored.extension !== type.extension || stored.bytes !== buffer.length) throw new Error('이미지 목록과 원본이 맞지 않아요. 원본은 변경하지 않았어요.');
          if (inboxEntryExists(target)) {
            if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isFile() || D.hashFile(target) !== hash) throw new Error('보관한 이미지 원본이 변경됐어요. 덮어쓰지 않았어요.');
          } else if (reused) throw new Error('보관한 이미지 원본이 없어 자동으로 교체하지 않았어요.');
          else fs.writeFileSync(target, buffer, { flag: 'wx' });
          if (!reused) D.atomicJson(metadata, stored);
          return { ...publicInboxItem(stored), reused, metadataConflict: reused && (stored.name !== input.name || stored.kind !== input.kind || stored.note !== note) };
        });
        json(res, 200, result);
      } else if (req.method === 'GET' && /^\/api\/images\/[a-f0-9]{64}$/.test(url.pathname)) {
        const file = imageFile(url.pathname.split('/').at(-1)); const buffer = fs.readFileSync(file); const type = imageType(buffer);
        if (!type) throw new Error('현재 원본 이미지 형식을 미리 볼 수 없어요.');
        res.writeHead(200, { 'Content-Type': type.mime, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }); res.end(buffer);
      } else if (req.method === 'POST' && url.pathname === '/api/jobs') {
        const input = await body(req);
        if (!['chat', 'workout', 'meal', 'body'].includes(input.kind) || typeof input.question !== 'string' || input.question.length > 6000) throw new Error('질문 종류와 길이를 확인해 주세요.');
        const state = S.validateState(input.state);
        if (!S.isValidDate(input.date)) throw new Error('판독 기준 날짜를 확인해 주세요.');
        const context = input.kind === 'chat' ? summarizeState(state, input.date, input.question) : { date: input.date, scope: '이미지 원문 판독만. 프로필·영양 목표 추론은 하지 않습니다.' };
        const file = input.kind === 'chat' ? null : imageFile(input.imageHash);
        json(res, 200, runtime.start({ kind: input.kind, question: input.question, imageHash: file ? input.imageHash : null, context }, file, input.retry === true));
      } else if (req.method === 'GET' && url.pathname === '/api/jobs') json(res, 200, { jobs: runtime.list ? runtime.list() : [] });
      else if (req.method === 'GET' && /^\/api\/jobs\/[a-f0-9]{32}$/.test(url.pathname)) {
        const job = runtime.get(url.pathname.split('/').at(-1)); json(res, job ? 200 : 404, job || { error: '작업을 찾을 수 없어요.' });
      } else if (req.method === 'POST' && /^\/api\/jobs\/[a-f0-9]{32}\/cancel$/.test(url.pathname)) {
        const job = runtime.cancel(url.pathname.split('/')[3]); json(res, job ? 200 : 404, job || { error: '작업을 찾을 수 없어요.' });
      } else json(res, 404, { error: '요청을 찾을 수 없어요.' });
    } catch (error) { json(res, error.status || (error.code === 'EEXIST' ? 409 : 400), { error: error.code === 'EEXIST' ? '다른 작업이 개인 기록을 저장 중이에요. 잠시 후 기록을 다시 확인해 주세요.' : error.code === 'ENOENT' ? '아직 연결되지 않은 폴더 또는 파일이에요.' : error.message }); }
    return true;
  }
  return { handle, close: () => runtime.close(), data, imageFile, readState };
}
module.exports = { createBridge, imageType, MAX_BODY };
