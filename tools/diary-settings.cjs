"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const D = require("./diary.cjs");
const HASH = /^[a-f0-9]{64}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const configFile = data => path.join(data, "config.json");
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

function exists(file) {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
function json(file) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch { throw new Error("개인 일지의 설정·인덱스·판독 파일이 없어 원본을 보호하고 있어요. 개인 백업을 확인해 주세요."); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024) throw new Error("개인 일지 파일을 확인할 수 없어 원본을 보호하고 있어요.");
  const raw = fs.readFileSync(file);
  let value;
  try { value = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")); }
  catch { throw new Error("개인 일지 파일이 손상되어 폴더 설정을 바꾸지 않았어요. 개인 백업을 확인해 주세요."); }
  return { value, raw };
}
function safeDirectory(file) {
  if (!exists(file)) return false;
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("개인 일지 보관 경로를 확인할 수 없어 설정 변경을 막았어요.");
  return true;
}
function validateIndex(data, sourceRoot) {
  const manifest = json(path.join(data, "manifest.json")).value;
  if (!plain(manifest) || manifest.schemaVersion !== D.VERSION || !plain(manifest.sources)
    || (manifest.scannedAt !== undefined && manifest.scannedAt !== null && (typeof manifest.scannedAt !== "string" || !Number.isFinite(Date.parse(manifest.scannedAt))))) throw new Error("일지 인덱스가 손상되어 원본을 보호하고 있어요.");
  safeDirectory(path.join(data, "extractions")); safeDirectory(path.join(data, "corrections"));
  for (const [hash, entry] of Object.entries(manifest.sources)) {
    if (!HASH.test(hash) || !plain(entry) || !["pending", "cached", "historical", "deferred"].includes(entry.status)
      || !Array.isArray(entry.paths) || entry.paths.some(relative => typeof relative !== "string" || !relative
        || /[\u0000-\u001f]/.test(relative) || path.isAbsolute(relative) || !D.inside(sourceRoot, path.resolve(sourceRoot, relative)))) throw new Error("일지 원본 경로 정보가 손상되어 설정 변경을 막았어요.");
    const extraction = path.join(data, "extractions", `${hash}.json`), head = path.join(data, "corrections", `${hash}.json`);
    const history = path.join(data, "corrections", hash);
    const hasHistory = safeDirectory(history) && fs.readdirSync(history).length > 0;
    if (!exists(head) && (exists(`${head}.previous`) || hasHistory)) throw new Error("일지 교정의 현재본이 없어 설정 변경을 막았어요. 교정 기록은 그대로 보존돼요.");
    if (!exists(extraction)) {
      if (["cached", "historical"].includes(entry.status) || exists(head)) throw new Error("일지 판독 원본이 없어 설정 변경을 막았어요. 개인 백업을 확인해 주세요.");
      continue;
    }
    const cache = json(extraction).value;
    if (!plain(cache) || cache.schemaVersion !== D.VERSION || cache.hash !== hash || !["visual", "legacy-ocr"].includes(cache.method) || typeof cache.parserVersion !== "string") throw new Error("일지 판독 원본이 손상되어 설정 변경을 막았어요.");
    try { D.validateSessions(cache.sessions); }
    catch { throw new Error("일지 판독 기록이 손상되어 설정 변경을 막았어요."); }
    if (exists(head)) {
      const correction = json(head).value;
      if (!plain(correction) || correction.schemaVersion !== D.VERSION || correction.hash !== hash
        || correction.baseDigest !== D.digest(cache.sessions) || typeof correction.revision !== "string") throw new Error("일지 교정과 판독 원본이 맞지 않아 설정 변경을 막았어요.");
      try { D.validateSessions(correction.sessions); }
      catch { throw new Error("일지 교정 기록이 손상되어 설정 변경을 막았어요."); }
    }
  }
  return manifest;
}
function read(data) {
  const file = configFile(data);
  if (!exists(file)) {
    if (["config.json.previous", "manifest.json", "manifest.json.previous", "extractions", "corrections"].some(name => exists(path.join(data, name)))) throw new Error("기존 일지의 폴더 설정이 없어 재초기화를 막았어요. 개인 백업에서 설정을 확인해 주세요.");
    return { configured: false, expectedDigest: null, config: null, manifest: null };
  }
  const { value: config, raw } = json(file);
  if (!plain(config) || config.schemaVersion !== D.VERSION || typeof config.sourceRoot !== "string"
    || !path.isAbsolute(config.sourceRoot) || /[\u0000-\u001f]/.test(config.sourceRoot)) throw new Error("일지 폴더 설정이 손상되어 원본을 보호하고 있어요.");
  const manifest = validateIndex(data, config.sourceRoot);
  return { configured: true, expectedDigest: crypto.createHash("sha256").update(raw).digest("hex"), config, manifest };
}
function readStatus(data) {
  const current = read(data);
  if (!current.configured) return { configured: false, sourceRoot: null, expectedDigest: null, reachable: null, warning: null, scannedAt: null };
  let reachable = true, warning = null;
  try { if (!fs.statSync(current.config.sourceRoot).isDirectory()) throw new Error(); fs.accessSync(current.config.sourceRoot, fs.constants.R_OK); fs.readdirSync(current.config.sourceRoot); }
  catch { reachable = false; warning = "사진 폴더에 접근할 수 없어요. 드라이브 연결과 이 PC의 경로를 확인해 주세요. 기존 일지와 판독·교정 기록은 유지됩니다."; }
  const scannedAt = current.manifest.scannedAt || null;
  if (reachable && !scannedAt) warning = "이 폴더의 파일 목록은 아직 확인하지 않았어요. 폴더 확인을 실행해 주세요.";
  return { configured: true, sourceRoot: current.config.sourceRoot, expectedDigest: current.expectedDigest, reachable, warning, scannedAt };
}
function source(data, input) {
  if (typeof input !== "string" || !input.trim() || input.length > 32767 || /[\u0000-\u001f]/.test(input)) throw new Error("이 PC에 있는 사진 폴더의 절대 경로를 입력해 주세요.");
  let requested = input.trim();
  if (requested.startsWith('"') && requested.endsWith('"')) requested = requested.slice(1, -1);
  if (!path.isAbsolute(requested)) throw new Error("이 PC에 있는 사진 폴더의 절대 경로를 입력해 주세요.");
  let root;
  try {
    root = fs.realpathSync(requested);
    if (!fs.statSync(root).isDirectory()) throw new Error();
    fs.accessSync(root, fs.constants.R_OK); fs.readdirSync(root);
  } catch { throw new Error("사진 폴더에 접근할 수 없어요. 폴더 경로와 드라이브 연결을 확인해 주세요."); }
  const privateRoot = exists(data) ? fs.realpathSync(data) : path.resolve(data);
  if (samePath(root, path.parse(root).root) || samePath(root, privateRoot) || D.inside(root, privateRoot) || D.inside(privateRoot, root)) throw new Error("드라이브 전체나 앱의 개인 기록 폴더·상위 폴더는 사진 원본 폴더로 지정할 수 없어요.");
  return root;
}
function preview(data, input) {
  if (!plain(input) || Object.keys(input).some(key => key !== "sourceRoot")) throw new Error("사진 폴더 설정 항목을 확인해 주세요.");
  const current = read(data), sourceRoot = source(data, input.sourceRoot);
  return { sourceRoot, expectedDigest: current.expectedDigest, changed: !current.configured || !samePath(path.resolve(current.config.sourceRoot), sourceRoot), configured: current.configured };
}
function apply(data, input) {
  if (!plain(input) || Object.keys(input).some(key => !["sourceRoot", "expectedDigest"].includes(key))
    || !own(input, "expectedDigest") || (input.expectedDigest !== null && (typeof input.expectedDigest !== "string" || !HASH.test(input.expectedDigest)))) throw new Error("미리보기한 폴더 설정과 확인 기준을 함께 보내 주세요.");
  return D.locked(data, () => {
    const next = preview(data, { sourceRoot: input.sourceRoot });
    if (input.expectedDigest !== next.expectedDigest) throw Object.assign(new Error("다른 작업에서 사진 폴더 설정이 바뀌었어요. 현재 설정을 다시 확인해 주세요."), { status: 409 });
    if (next.changed && !next.configured) {
      try { D.init(data, next.sourceRoot); }
      catch (error) {
        const file = configFile(data);
        if (!exists(path.join(data, "manifest.json")) && exists(file)) {
          const value = json(file).value;
          if (value.schemaVersion === D.VERSION && value.sourceRoot === next.sourceRoot && Object.keys(value).length === 2) fs.unlinkSync(file);
        }
        throw error;
      }
    } else if (next.changed) {
      const current = read(data);
      if (current.expectedDigest !== input.expectedDigest) throw Object.assign(new Error("사진 폴더 설정이 다시 바뀌었어요. 현재 설정을 확인해 주세요."), { status: 409 });
      // Invalidate old-path availability before committing a new source path.
      D.atomicJson(path.join(data, "manifest.json"), { ...current.manifest, scannedAt: null, fingerprints: {} });
      if (crypto.createHash("sha256").update(json(configFile(data)).raw).digest("hex") !== input.expectedDigest) throw Object.assign(new Error("사진 폴더 설정이 다시 바뀌었어요. 현재 설정을 확인해 주세요."), { status: 409 });
      D.atomicJson(configFile(data), { ...current.config, sourceRoot: next.sourceRoot });
    }
    return readStatus(data);
  });
}
module.exports = { readStatus, preview, apply };
