"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Locks = require("./locks.cjs");

const VERSION = 1;
const PARSER = "diary-vision-v1";
const DEFAULT_DATA = path.resolve(__dirname, "../user-data/coach");
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const HASH = /^[a-f0-9]{64}$/;
const EXCLUDED = new Set(["_analysis_work", "output", ".git", "node_modules"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.previous`);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function locked(data, action) {
  fs.mkdirSync(data, { recursive: true });
  const file = path.join(data, ".write-lock");
  const fd = Locks.acquire(file, { kind: "write" });
  try {
    fs.writeFileSync(fd, `${process.pid}\n`, "utf8");
    return action();
  } finally { Locks.release(file, fd); }
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function sourceFile(root, relative) {
  const file = path.resolve(root, relative.replace(/[\\/]/g, path.sep));
  if (!inside(root, file) || !inside(root, fs.realpathSync(file)) || !fs.lstatSync(file).isFile()) {
    throw new Error("Source path must be a regular file inside the configured root.");
  }
  return file;
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, "r");
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function numberOrNull(value, integer = false) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value)));
}

function validateSessions(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) throw new Error("At least one session is required.");
  for (const session of sessions) {
    if (!validDate(session.date) || typeof session.label !== "string" || !session.label.trim()) throw new Error("Invalid session date or label.");
    if (session.time !== null && (typeof session.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.time))) throw new Error("Invalid session time.");
    for (const key of ["durationMinutes", "reportedSetCount", "reportedEnergyKcal", "reportedVolumeKg"]) {
      if (!numberOrNull(session[key], key === "reportedSetCount")) throw new Error(`Invalid ${key}; unknown must be null.`);
    }
    if (!Array.isArray(session.uncertainties) || session.uncertainties.some(x => typeof x !== "string")) throw new Error("Invalid uncertainties.");
    if (!Array.isArray(session.exercises)) throw new Error("Invalid exercises.");
    for (const exercise of session.exercises) {
      if (typeof exercise.rawName !== "string" || !exercise.rawName.trim() || exercise.loadConvention !== "as-recorded") throw new Error("Exercise needs its raw name and recorded load convention.");
      for (const key of ["reportedVolumeKg", "durationMinutes", "repsTotal"]) {
        if (!numberOrNull(exercise[key], key === "repsTotal")) throw new Error(`Invalid exercise ${key}.`);
      }
      if (!Array.isArray(exercise.sets)) throw new Error("Invalid sets.");
      for (const set of exercise.sets) {
        if (!numberOrNull(set.loadKg) || !numberOrNull(set.reps, true) || (set.marker !== null && (typeof set.marker !== "string" || !set.marker.trim()))) throw new Error("Invalid set; preserve unknowns and raw markers.");
      }
    }
  }
  return sessions;
}

function loadConfig(data) {
  const config = readJson(path.join(data, "config.json"));
  if (config.schemaVersion !== VERSION || typeof config.sourceRoot !== "string" || !path.isAbsolute(config.sourceRoot)) throw new Error("Invalid diary configuration.");
  return config;
}

function loadManifest(data) {
  const file = path.join(data, "manifest.json");
  if (!fs.existsSync(file)) throw new Error("Diary manifest is missing; restore its preserved .previous file or explicitly rebuild the index. This is not an empty diary.");
  const manifest = readJson(file);
  if (manifest.schemaVersion !== VERSION || !manifest.sources || Array.isArray(manifest.sources) || typeof manifest.sources !== "object") throw new Error("Invalid manifest; original was not replaced.");
  for (const [hash, entry] of Object.entries(manifest.sources)) {
    if (!HASH.test(hash) || !Array.isArray(entry.paths) || !["pending", "cached", "historical", "deferred"].includes(entry.status)) throw new Error("Invalid source entry; original was not replaced.");
  }
  return manifest;
}

function cachePath(data, hash) {
  if (!HASH.test(hash)) throw new Error("Invalid source hash.");
  return path.join(data, "extractions", `${hash}.json`);
}

function loadCache(data, hash) {
  const cache = readJson(cachePath(data, hash));
  if (cache.schemaVersion !== VERSION || cache.hash !== hash || !["visual", "legacy-ocr"].includes(cache.method) || typeof cache.parserVersion !== "string") throw new Error("Invalid extraction cache.");
  validateSessions(cache.sessions);
  return cache;
}

function effectiveCache(data, hash, cache = loadCache(data, hash)) {
  const file = path.join(data, "corrections", `${hash}.json`);
  if (!fs.existsSync(file)) {
    const history = path.join(data, "corrections", hash);
    if (fs.existsSync(`${file}.previous`) || (fs.existsSync(history) && fs.readdirSync(history).length)) throw new Error("Correction head missing while revision history exists; repair required, raw extraction was not substituted.");
    return { cache, sessions: cache.sessions, revision: null };
  }
  const correction = readJson(file);
  if (correction.schemaVersion !== VERSION || correction.hash !== hash || correction.baseDigest !== digest(cache.sessions) || typeof correction.revision !== "string") throw new Error("Correction conflicts with its source extraction.");
  return { cache, sessions: validateSessions(correction.sessions), revision: correction.revision };
}

function inventory(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && !EXCLUDED.has(entry.name)) walk(file);
      else if (entry.isFile() && IMAGE.test(entry.name)) files.push(file);
    }
  }
  walk(root);
  return files.sort();
}

function init(data, root) {
  root = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(root).isDirectory()) throw new Error("Source root is not a directory.");
  const file = path.join(data, "config.json");
  if (fs.existsSync(file)) {
    if (loadConfig(data).sourceRoot !== root) throw new Error("Changing the source root needs a separate data directory.");
    return { sourceRoot: root, existing: true };
  }
  if (["manifest.json", "manifest.json.previous", "extractions", "corrections"].some(name => fs.existsSync(path.join(data, name)))) throw new Error("Configuration missing in an existing diary; repair it before initializing. Existing records were not replaced.");
  atomicJson(file, { schemaVersion: VERSION, sourceRoot: root });
  atomicJson(path.join(data, "manifest.json"), { schemaVersion: VERSION, sources: {}, baselineAt: null });
  return { sourceRoot: root, existing: false };
}

function scan(data, verifyAll = false) {
  const { sourceRoot } = loadConfig(data);
  const manifest = loadManifest(data);
  // Finish inventory before changing any persisted state: an unavailable drive is not an empty diary.
  const fingerprints = {};
  let hashedFiles = 0;
  const found = inventory(sourceRoot).map(file => {
    const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
    let before = fs.statSync(file);
    const statFingerprint = stat => ({ size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino, dev: stat.dev });
    let fingerprint = statFingerprint(before);
    const prior = manifest.fingerprints?.[relative];
    let hash;
    if (!verifyAll && prior && HASH.test(prior.hash) && digest(prior.stat) === digest(fingerprint)) hash = prior.hash;
    else {
      hashedFiles++;
      // Network/cloud drives can refresh timestamps while hydrating a file. Retry only this file.
      for (let attempt = 0; attempt < 3; attempt++) {
        hash = hashFile(file);
        const after = fs.statSync(file);
        if (digest(statFingerprint(before)) === digest(statFingerprint(after))) break;
        if (attempt === 2) throw new Error(`Image metadata keeps changing during scanning: ${relative}. Index was not replaced.`);
        before = after;
        fingerprint = statFingerprint(after);
      }
    }
    fingerprints[relative] = { hash, stat: fingerprint };
    return { file, hash, size: before.size };
  });
  const previousByPath = new Map(Object.entries(manifest.sources).flatMap(([hash, entry]) => entry.paths.map(p => [p, hash])));
  for (const entry of Object.values(manifest.sources)) entry.paths = [];
  for (const { file, hash, size } of found) {
    const entry = manifest.sources[hash] ||= { paths: [], bytes: size, status: "pending", firstSeen: new Date().toISOString() };
    const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
    entry.paths.push(relative);
    const previousHash = previousByPath.get(relative);
    if (previousHash && previousHash !== hash) {
      entry.replaces = [...new Set([...(entry.replaces || []), previousHash])];
      manifest.sources[previousHash].supersededBy = [...new Set([...(manifest.sources[previousHash].supersededBy || []), hash])];
    }
    if (fs.existsSync(cachePath(data, hash))) {
      try {
        const effective = effectiveCache(data, hash);
        entry.status = effective.cache.method === "visual" ? "cached" : "historical";
        entry.needsReview = effective.cache.method !== "visual" || effective.cache.parserVersion !== PARSER || effective.sessions.some(s => s.uncertainties.length > 0);
        entry.dates = [...new Set(effective.sessions.map(s => s.date))];
        delete entry.cacheProblem;
      } catch (error) { entry.cacheProblem = error.message; }
    } else if (entry.status === "cached" || entry.status === "historical") entry.cacheProblem = "Extraction file missing; original record preserved.";
  }
  manifest.scannedAt = new Date().toISOString();
  manifest.fingerprints = fingerprints;
  atomicJson(path.join(data, "manifest.json"), manifest);
  const active = Object.entries(manifest.sources).filter(([, e]) => e.paths.length);
  return {
    files: found.length, uniqueImages: active.length, exactCopies: found.length - active.length, hashedFiles,
    cached: active.filter(([, e]) => e.status === "cached" && !e.cacheProblem).length,
    historical: active.filter(([, e]) => e.status === "historical" && !e.cacheProblem).length,
    deferred: active.filter(([, e]) => e.status === "deferred").length,
    unavailableSources: Object.values(manifest.sources).filter(e => !e.paths.length).length,
    pending: active.filter(([, e]) => e.status === "pending" && !e.cacheProblem).map(([hash, e]) => ({ hash, paths: e.paths, bytes: e.bytes })),
    review: active.filter(([, e]) => e.needsReview && !e.cacheProblem && e.status === "cached").map(([hash, e]) => ({ hash, paths: e.paths })),
    damaged: active.filter(([, e]) => e.cacheProblem).map(([hash, e]) => ({ hash, paths: e.paths, reason: e.cacheProblem }))
  };
}

function store(data, relative, expectedHash, sessions) {
  validateSessions(sessions);
  const { sourceRoot } = loadConfig(data);
  const file = sourceFile(sourceRoot, relative);
  if (!HASH.test(expectedHash) || hashFile(file) !== expectedHash) throw new Error("Source changed since review; extraction was not saved.");
  const manifest = loadManifest(data);
  const target = cachePath(data, expectedHash);
  if (fs.existsSync(target)) {
    const existing = loadCache(data, expectedHash);
    if (existing.method !== "visual" || digest(existing.sessions) !== digest(sessions)) throw new Error("Existing extraction preserved. Use a separate correction, not overwrite.");
  } else {
    atomicJson(target, { schemaVersion: VERSION, parserVersion: PARSER, hash: expectedHash, method: "visual", recordedAt: new Date().toISOString(), sessions });
  }
  manifest.sources[expectedHash] = {
    ...manifest.sources[expectedHash], paths: [...new Set([...(manifest.sources[expectedHash]?.paths || []), relative.replace(/\\/g, "/")])],
    bytes: fs.statSync(file).size, status: "cached", needsReview: sessions.some(s => s.uncertainties.length > 0), dates: [...new Set(sessions.map(s => s.date))]
  };
  atomicJson(path.join(data, "manifest.json"), manifest);
  return { hash: expectedHash, sessions: sessions.length, needsReview: manifest.sources[expectedHash].needsReview };
}

function correct(data, correction) {
  if (correction.schemaVersion !== VERSION || !HASH.test(correction.hash) || typeof correction.reason !== "string" || !correction.reason.trim()) throw new Error("Correction needs source hash and reason.");
  const cache = loadCache(data, correction.hash);
  if (digest(cache.sessions) !== correction.baseDigest) throw new Error("Correction base changed; correction was not saved.");
  const current = effectiveCache(data, correction.hash, cache);
  if (correction.expectedRevision !== current.revision) throw new Error("A newer correction exists; stale correction was not saved.");
  validateSessions(correction.sessions);
  const revision = crypto.randomUUID();
  const saved = { ...correction, revision, recordedAt: new Date().toISOString() };
  atomicJson(path.join(data, "corrections", correction.hash, `${revision}.json`), saved);
  atomicJson(path.join(data, "corrections", `${correction.hash}.json`), saved);
  return { corrected: correction.hash, revision };
}

function baseline(data, legacyFile) {
  const manifest = loadManifest(data);
  const { sourceRoot } = loadConfig(data);
  if (manifest.baselineAt) throw new Error("Initial baseline already exists; no records changed.");
  const rows = legacyFile ? readJson(legacyFile) : [];
  if (!Array.isArray(rows)) throw new Error("Legacy input must be a session array.");
  const grouped = new Map();
  const unresolved = [];
  for (const row of rows) {
    let hash;
    try { hash = hashFile(sourceFile(sourceRoot, row.relative_path)); }
    catch { unresolved.push(row.relative_path || null); continue; }
    if (!manifest.sources[hash]) throw new Error("Scan before creating the baseline.");
    if (manifest.sources[hash].status === "cached") continue;
    const n = x => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
    const session = {
      date: row.date, time: typeof row.session_time === "string" ? row.session_time : null, label: row.split || row.folder || "Historical",
      durationMinutes: n(row.duration_min), reportedSetCount: n(row.sets_total_or_estimate), reportedEnergyKcal: n(row.calories), reportedVolumeKg: n(row.session_volume_kg),
      exercises: [], uncertainties: ["기존 OCR 요약이며 이미지를 이번에 재확인하지 않았음. 날짜·세트·볼륨은 추정 또는 오독 가능. 세부 운동과 세트 미검증."],
      legacy: row
    };
    validateSessions([session]);
    if (!grouped.has(hash)) grouped.set(hash, [session]);
    else {
      const canonical = grouped.get(hash)[0];
      canonical.legacyRows ||= [canonical.legacy];
      canonical.legacyRows.push(row);
      if (digest({ ...canonical, legacy: null, legacyRows: null }) !== digest({ ...session, legacy: null, legacyRows: null })) canonical.uncertainties.push("동일 이미지의 기존 OCR 요약들이 충돌함. 첫 요약을 참고로만 보존하고 원본 행 모두 유지.");
    }
  }
  // Validate the whole import first. Raw OCR is preserved, never upgraded to visually verified data.
  for (const [hash, sessions] of grouped) {
    const target = cachePath(data, hash);
    if (!fs.existsSync(target)) atomicJson(target, { schemaVersion: VERSION, parserVersion: "legacy-import-v1", hash, method: "legacy-ocr", recordedAt: new Date().toISOString(), sessions });
    else loadCache(data, hash);
    manifest.sources[hash].status = "historical";
    manifest.sources[hash].needsReview = true;
    manifest.sources[hash].dates = [...new Set(sessions.map(s => s.date))];
  }
  for (const entry of Object.values(manifest.sources)) if (entry.status === "pending") entry.status = "deferred";
  manifest.baselineAt = new Date().toISOString();
  manifest.baselineUnresolved = unresolved;
  atomicJson(path.join(data, "manifest.json"), manifest);
  return { historicalImages: grouped.size, unresolved, deferredImages: Object.values(manifest.sources).filter(e => e.status === "deferred").length };
}

function context(data, from, to, details = false) {
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) throw new Error("Invalid date range.");
  const manifest = loadManifest(data);
  const sessions = [];
  const archivedSessions = [];
  const damaged = [];
  function hasActiveReplacement(hash, session, visited = new Set()) {
    if (visited.has(hash)) return false;
    visited.add(hash);
    const entry = manifest.sources[hash];
    if (!entry) return false;
    if (entry.paths.length > 0 && session.time !== null) {
      try {
        if (effectiveCache(data, hash).sessions.some(s => s.date === session.date && s.time === session.time && s.label === session.label)) return true;
      } catch { /* Unreviewed or damaged replacement cannot retire an earlier diary record. */ }
    }
    return (entry.supersededBy || []).some(next => hasActiveReplacement(next, session, visited));
  }
  for (const [hash, entry] of Object.entries(manifest.sources)) {
    if (!["cached", "historical"].includes(entry.status)) continue;
    if (!fs.existsSync(path.join(data, "corrections", `${hash}.json`)) && entry.dates?.length && !entry.dates.some(date => (!from || date >= from) && (!to || date <= to))) continue;
    let effective;
    try { effective = effectiveCache(data, hash); }
    catch (error) { damaged.push({ hash, reason: error.message }); continue; }
    const { cache, revision } = effective;
    effective.sessions.forEach((session, index) => {
      if ((from && session.date < from) || (to && session.date > to)) return;
      const superseded = !entry.paths.length && (entry.supersededBy || []).some(next => hasActiveReplacement(next, session));
      const destination = superseded ? archivedSessions : sessions;
      destination.push({
        id: `${hash}:${index}`, hash, date: session.date, time: session.time, label: session.label,
        method: cache.method, parserVersion: cache.parserVersion, corrected: revision !== null, correctionRevision: revision, sourceAvailable: entry.paths.length > 0,
        sourcePaths: entry.paths, baseDigest: digest(cache.sessions),
        replaces: entry.replaces || [], supersededBy: entry.supersededBy || [],
        durationMinutes: session.durationMinutes, reportedSetCount: session.reportedSetCount,
        reportedVolumeKg: session.reportedVolumeKg, exerciseNames: session.exercises.map(e => e.rawName),
        uncertainties: session.uncertainties, ...(details ? { session } : {})
      });
    });
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  const candidateGroups = new Map();
  for (const s of sessions) {
    const key = `${s.date}|${s.time}|${s.label}`;
    if (!candidateGroups.has(key)) candidateGroups.set(key, []);
    candidateGroups.get(key).push(s.id);
  }
  return {
    from: from || null, to: to || null, sessions, archivedSessions, damaged,
    sourceAvailabilityAsOf: manifest.scannedAt || null,
    possibleDuplicates: [...candidateGroups.values()].filter(ids => ids.length > 1),
    coverage: { pendingImages: Object.values(manifest.sources).filter(e => e.status === "pending").length, deferredImages: Object.values(manifest.sources).filter(e => e.status === "deferred").length, scannedAt: manifest.scannedAt || null },
    limitations: ["sourceAvailable은 마지막 성공 스캔 기준. 스캔 실패 시 현재 원본 접근 여부는 확인 불가이며 캐시만 사용함.", "바이트가 같은 이미지만 중복 제거. 같은 운동의 다른 이미지는 별도 후보이며 운동 횟수로 확정하지 않음.", "미기록 날짜는 휴식일이 아님. 보류 이미지에는 미처리 운동일지와 체성분·사진 등이 섞일 수 있음.", "앱 표시 kg 합계와 Cal은 근성장률이나 실측 소비량이 아님."]
  };
}

function cli(argv) {
  const [command, ...args] = argv;
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) throw new Error(`Unexpected argument ${args[i]}`);
    options[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
  }
  const data = path.resolve(options.data || DEFAULT_DATA);
  if (command === "context") return context(data, options.from, options.to, !!options.details);
  return locked(data, () => {
    if (command === "init" && typeof options.source === "string") return init(data, options.source);
    if (command === "scan") return scan(data, !!options["verify-all"]);
    if (command === "store" && options.source && options.hash && options.file) {
      const extraction = readJson(options.file);
      return store(data, options.source, options.hash, extraction.sessions || [extraction.session]);
    }
    if (command === "correct" && options.file) return correct(data, readJson(options.file));
    if (command === "baseline") return baseline(data, options.legacy);
    throw new Error("Usage: diary.cjs init --source <root> | scan | store --source <relative> --hash <sha256> --file <json> | correct --file <json> | baseline [--legacy <json>] | context [--from YYYY-MM-DD --to YYYY-MM-DD --details]. Optional --data <directory>.");
  });
}

module.exports = { VERSION, PARSER, readJson, atomicJson, locked, inside, hashFile, digest, validateSessions, init, scan, store, correct, baseline, context, cli };
if (require.main === module) {
  try { console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(`Diary: ${error.message}`); process.exitCode = 1; }
}
