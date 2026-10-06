"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Diary = require("../tools/diary.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "macro-diary-"));
  const source = path.join(root, "원본");
  const data = path.join(root, "private");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  Diary.init(data, source);
  const image = path.join(source, "새 일지.png.png");
  fs.writeFileSync(image, "synthetic image bytes");
  return { root, source, data, image };
}

function session(overrides = {}) {
  return {
    date: "2026-10-04", time: "17:00", label: "Lower", durationMinutes: 60,
    reportedSetCount: 4, reportedEnergyKcal: 400, reportedVolumeKg: 1200,
    exercises: [{ rawName: "커스텀 머신", loadConvention: "as-recorded", reportedVolumeKg: 1200, durationMinutes: null, repsTotal: null, sets: [{ loadKg: 30, reps: 10, marker: "W" }, { loadKg: 50, reps: 10, marker: null }, { loadKg: null, reps: 8, marker: "A" }] }],
    uncertainties: [], ...overrides
  };
}

test("an exited legacy write lock recovers without changing stored originals", t => {
  const f = fixture(t), file = path.join(f.data, ".write-lock");
  const original = fs.readFileSync(path.join(f.data, "config.json"), "utf8");
  fs.writeFileSync(file, "2147483647\n");
  const result = Diary.locked(f.data, () => "recovered");
  assert.equal(result, "recovered");
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(f.data, "config.json"), "utf8"), original);
});

test("a live legacy write lock blocks without entering the mutation", t => {
  const f = fixture(t), file = path.join(f.data, ".write-lock");
  fs.writeFileSync(file, `${process.pid}\n`);
  let entered = false;
  assert.throws(() => Diary.locked(f.data, () => { entered = true; }), { code: "EEXIST" });
  assert.equal(entered, false);
  assert.equal(fs.readFileSync(file, "utf8"), `${process.pid}\n`);
});

test("new, cached, renamed and copied images use content identity, not dates or paths", t => {
  const f = fixture(t);
  const first = Diary.scan(f.data);
  assert.equal(first.pending.length, 1);
  const hash = first.pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  fs.mkdirSync(path.join(f.source, "261004 Lower"));
  const moved = path.join(f.source, "261004 Lower", path.basename(f.image));
  fs.renameSync(f.image, moved);
  fs.copyFileSync(moved, path.join(f.source, "동일 사본.png"));
  const second = Diary.scan(f.data);
  assert.equal(second.pending.length, 0);
  assert.equal(second.cached, 1);
  assert.equal(second.exactCopies, 1);
  assert.equal(Diary.context(f.data).sessions.length, 1);
  assert.equal(Diary.context(f.data).sessions[0].sourcePaths.length, 2);
});

test("changed bytes are detected even if filename, size and modified timestamp stay the same", t => {
  const f = fixture(t);
  const stat = fs.statSync(f.image);
  const hash = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  fs.writeFileSync(f.image, "different image byte!");
  assert.equal(fs.statSync(f.image).size, stat.size);
  fs.utimesSync(f.image, stat.atime, stat.mtime);
  const next = Diary.scan(f.data);
  assert.equal(next.pending.length, 1);
  assert.notEqual(next.pending[0].hash, hash);
  assert.equal(next.unavailableSources, 1);
  assert.equal(Diary.context(f.data).sessions[0].sourceAvailable, false);
  assert.equal(Diary.context(f.data).archivedSessions.length, 0);
});

test("hash mismatch, traversal and invalid extraction cannot save guessed records", t => {
  const f = fixture(t);
  const hash = Diary.hashFile(f.image);
  assert.throws(() => Diary.store(f.data, path.basename(f.image), "0".repeat(64), [session()]));
  assert.throws(() => Diary.store(f.data, "../private/config.json", hash, [session()]));
  assert.throws(() => Diary.store(f.data, path.basename(f.image), hash, [session({ date: "2026-02-30" })]));
  assert.throws(() => Diary.validateSessions([session({ reportedVolumeKg: "1200" })]));
  assert.throws(() => Diary.validateSessions([session({ time: "24:00" })]));
  assert.throws(() => Diary.validateSessions([session({ reportedSetCount: -1 })]));
  assert.equal(fs.existsSync(path.join(f.data, "extractions")), false);
});

test("unknowns, raw markers, independent exercise blocks and multiple sessions remain distinct", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  const a = session({ reportedVolumeKg: null, reportedEnergyKcal: null, uncertainties: ["S는 세트 앞 독립 표시"] });
  const b = session({ time: "22:00", label: "Upper" });
  a.exercises.push(structuredClone(a.exercises[0]));
  Diary.store(f.data, path.basename(f.image), hash, [a, b]);
  const context = Diary.context(f.data, "2026-10-04", "2026-10-04", true);
  assert.equal(context.sessions.length, 2);
  assert.notEqual(context.sessions[0].id, context.sessions[1].id);
  assert.equal(context.sessions[0].session.exercises.length, 2);
  assert.equal(context.sessions[0].session.exercises[0].sets[2].loadKg, null);
  assert.equal(context.sessions[0].session.exercises[0].sets[2].marker, "A");
  assert.equal(context.sessions[0].session.reportedEnergyKcal, null);
  assert.equal(Diary.context(f.data, "2026-10-05").sessions.length, 0);
  assert.throws(() => Diary.context(f.data, "2026-10-05", "2026-10-04"));
});

test("user corrections survive scans and cannot overwrite raw extraction", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  const original = session();
  Diary.store(f.data, path.basename(f.image), hash, [original]);
  const replacement = session({ label: "사용자가 확인한 Lower" });
  const correction = { schemaVersion: 1, hash, baseDigest: Diary.digest([original]), expectedRevision: null, reason: "사용자 확인", sessions: [replacement] };
  const first = Diary.correct(f.data, correction);
  Diary.scan(f.data);
  assert.equal(Diary.context(f.data).sessions[0].label, replacement.label);
  assert.equal(Diary.context(f.data).sessions[0].corrected, true);
  assert.throws(() => Diary.store(f.data, path.basename(f.image), hash, [replacement]));
  assert.throws(() => Diary.correct(f.data, { ...correction, baseDigest: "bad" }));
  assert.throws(() => Diary.correct(f.data, correction));
  const second = Diary.correct(f.data, { ...correction, expectedRevision: first.revision });
  const third = Diary.correct(f.data, { ...correction, expectedRevision: second.revision });
  assert.equal(fs.readdirSync(path.join(f.data, "corrections", hash)).length, 3);
  assert.equal(Diary.context(f.data).sessions[0].correctionRevision, third.revision);
  assert.equal(Diary.readJson(path.join(f.data, "extractions", `${hash}.json`)).sessions[0].label, "Lower");
  assert.equal(Diary.context(f.data).sessions[0].label, replacement.label);
});

test("missing drive or corrupted manifest/cache fails closed, without replacing records", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  const file = path.join(f.data, "manifest.json");
  const before = fs.readFileSync(file, "utf8");
  fs.renameSync(f.source, `${f.source}-offline`);
  assert.throws(() => Diary.scan(f.data));
  assert.equal(fs.readFileSync(file, "utf8"), before);
  fs.renameSync(`${f.source}-offline`, f.source);
  fs.writeFileSync(file, "corrupt raw manifest");
  assert.throws(() => Diary.scan(f.data));
  assert.equal(fs.readFileSync(file, "utf8"), "corrupt raw manifest");
  fs.writeFileSync(file, before);
  const cache = path.join(f.data, "extractions", `${hash}.json`);
  fs.writeFileSync(cache, "corrupt raw cache");
  const result = Diary.scan(f.data);
  assert.equal(result.damaged.length, 1);
  assert.equal(result.cached, 0);
  assert.equal(Diary.context(f.data).damaged.length, 1);
  assert.equal(fs.readFileSync(cache, "utf8"), "corrupt raw cache");
});

test("baseline retains historical OCR provenance and defers old unseen images, never new uploads", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, "old.jpg"), "old workout bytes");
  Diary.scan(f.data);
  const legacy = path.join(f.root, "legacy.json");
  fs.writeFileSync(legacy, JSON.stringify([{ date: "2025-01-07", relative_path: "old.jpg", split: "Push", session_volume_kg: 1234, sets_total_or_estimate: 4, duration_min: 30, calories: 100, session_time: null, date_source: "folder_date" }]));
  const baseline = Diary.baseline(f.data, legacy);
  assert.equal(baseline.historicalImages, 1);
  assert.equal(baseline.deferredImages, 1);
  assert.equal(Diary.context(f.data).sessions[0].method, "legacy-ocr");
  assert.ok(Diary.context(f.data).sessions[0].uncertainties.length);
  assert.equal(Diary.context(f.data, null, null, true).sessions[0].session.legacy.date_source, "folder_date");
  fs.writeFileSync(path.join(f.source, "new.png"), "new upload bytes");
  const next = Diary.scan(f.data);
  assert.equal(next.pending.length, 1);
  assert.equal(next.deferred, 1);
  assert.throws(() => Diary.baseline(f.data, legacy));
});

test("derived output directories and non-image media do not enter the diary", t => {
  const f = fixture(t);
  for (const name of ["_analysis_work", "output"]) {
    fs.mkdirSync(path.join(f.source, name));
    fs.writeFileSync(path.join(f.source, name, "derived.png"), "do not analyze");
  }
  fs.writeFileSync(path.join(f.source, "lift.mp4"), "video not in scope");
  assert.equal(Diary.scan(f.data).files, 1);
});

test("parser upgrades request review without rereading everything or erasing corrections", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  const file = path.join(f.data, "extractions", `${hash}.json`);
  const cache = Diary.readJson(file);
  cache.parserVersion = "previous-vision";
  Diary.atomicJson(file, cache);
  const next = Diary.scan(f.data);
  assert.equal(next.pending.length, 0);
  assert.equal(next.review.length, 1);
  assert.equal(Diary.context(f.data).sessions[0].parserVersion, "previous-vision");
});

test("missing manifest is a repair state, and missing cache is isolated without erasing its record", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  const file = path.join(f.data, "manifest.json");
  const manifest = fs.readFileSync(file, "utf8");
  fs.unlinkSync(file);
  assert.throws(() => Diary.scan(f.data), /manifest is missing/);
  assert.throws(() => Diary.context(f.data), /manifest is missing/);
  fs.writeFileSync(file, manifest);
  fs.unlinkSync(path.join(f.data, "extractions", `${hash}.json`));
  const result = Diary.scan(f.data);
  assert.equal(result.damaged.length, 1);
  assert.equal(result.pending.length, 0);
  assert.equal(Diary.readJson(file).sources[hash].status, "cached");
});

test("baseline exact copies retain all OCR rows but do not double the session", t => {
  const f = fixture(t);
  fs.copyFileSync(f.image, path.join(f.source, "copy.png"));
  Diary.scan(f.data);
  const row = { date: "2026-10-04", relative_path: path.basename(f.image), split: "Lower", session_volume_kg: 1000, session_time: null };
  const legacy = path.join(f.root, "legacy.json");
  fs.writeFileSync(legacy, JSON.stringify([row, { ...row, relative_path: "copy.png" }]));
  Diary.baseline(f.data, legacy);
  const result = Diary.context(f.data, null, null, true);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].session.legacyRows.length, 2);
});

test("image replacements preserve revision lineage separately from current sessions", t => {
  const f = fixture(t);
  const first = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), first, [session()]);
  fs.writeFileSync(f.image, "revised source bytes");
  const second = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), second, [session({ reportedVolumeKg: 1500 })]);
  const result = Diary.context(f.data);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.archivedSessions.length, 1);
  assert.deepEqual(result.sessions[0].replaces, [first]);
  assert.deepEqual(result.archivedSessions[0].supersededBy, [second]);
});

test("restoring original bytes or swapping names cannot hide active records", t => {
  const f = fixture(t);
  const originalBytes = fs.readFileSync(f.image);
  const a = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), a, [session()]);
  fs.writeFileSync(f.image, "replacement image");
  const b = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), b, [session()]);
  fs.writeFileSync(f.image, originalBytes);
  Diary.scan(f.data);
  assert.equal(Diary.context(f.data).sessions.length, 1);
  assert.equal(Diary.context(f.data).sessions[0].hash, a);
  assert.equal(Diary.context(f.data).archivedSessions[0].hash, b);
  const other = path.join(f.source, "other.png");
  fs.writeFileSync(other, "replacement image");
  Diary.scan(f.data);
  const temp = `${f.image}.swap`;
  fs.renameSync(f.image, temp);
  fs.renameSync(other, f.image);
  fs.renameSync(temp, other);
  Diary.scan(f.data);
  assert.equal(Diary.context(f.data).sessions.length, 2);
  assert.equal(Diary.context(f.data).archivedSessions.length, 0);
});

test("reusing a filename for another workout date preserves both historical events", t => {
  const f = fixture(t);
  const a = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), a, [session()]);
  fs.writeFileSync(f.image, "different day image");
  const b = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), b, [session({ date: "2026-10-05" })]);
  const result = Diary.context(f.data);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.archivedSessions.length, 0);
  assert.equal(result.sessions[0].sourceAvailable, false);
});

test("missing correction head cannot silently revert confirmed facts or accept an initial write", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  const raw = session();
  Diary.store(f.data, path.basename(f.image), hash, [raw]);
  const draft = { schemaVersion: 1, hash, baseDigest: Diary.digest([raw]), expectedRevision: null, reason: "확인", sessions: [session({ label: "확인된 값" })] };
  Diary.correct(f.data, draft);
  fs.unlinkSync(path.join(f.data, "corrections", `${hash}.json`));
  const result = Diary.scan(f.data);
  assert.equal(result.damaged.length, 1);
  assert.equal(result.cached, 0);
  assert.equal(Diary.context(f.data).sessions.length, 0);
  assert.equal(Diary.context(f.data).damaged.length, 1);
  assert.throws(() => Diary.correct(f.data, draft));
});

test("missing configuration cannot reinitialize a populated private diary", t => {
  const f = fixture(t);
  const hash = Diary.scan(f.data).pending[0].hash;
  Diary.store(f.data, path.basename(f.image), hash, [session()]);
  fs.unlinkSync(path.join(f.data, "config.json"));
  const before = fs.readFileSync(path.join(f.data, "manifest.json"), "utf8");
  assert.throws(() => Diary.init(f.data, f.source), /Configuration missing/);
  assert.equal(fs.readFileSync(path.join(f.data, "manifest.json"), "utf8"), before);
  assert.equal(Diary.context(f.data).sessions.length, 1);
});

test("effective corrections resolve review and damaged old cache does not block new images", t => {
  const f = fixture(t);
  const first = Diary.scan(f.data).pending[0].hash;
  const raw = session({ uncertainties: ["날짜 확인 필요"] });
  Diary.store(f.data, path.basename(f.image), first, [raw]);
  Diary.correct(f.data, { schemaVersion: 1, hash: first, baseDigest: Diary.digest([raw]), expectedRevision: null, reason: "확인", sessions: [session()] });
  assert.equal(Diary.scan(f.data).review.length, 0);
  fs.writeFileSync(path.join(f.data, "corrections", `${first}.json`), "corrupt user correction");
  fs.writeFileSync(path.join(f.source, "new.png"), "another image");
  const result = Diary.scan(f.data);
  assert.equal(result.pending.length, 1);
  assert.equal(result.damaged.length, 1);
  assert.equal(result.cached, 0);
});

test("unchanged file metadata skips byte reads; verify-all checks every image", t => {
  const f = fixture(t);
  assert.equal(Diary.scan(f.data).hashedFiles, 1);
  assert.equal(Diary.scan(f.data).hashedFiles, 0);
  assert.equal(Diary.scan(f.data, true).hashedFiles, 1);
});

test("write failures preserve prior JSON, and concurrent writers are rejected", t => {
  const f = fixture(t);
  const file = path.join(f.data, "safe.json");
  Diary.atomicJson(file, { value: "기존" });
  fs.mkdirSync(`${file}.previous`);
  assert.throws(() => Diary.atomicJson(file, { value: "새 값" }));
  assert.deepEqual(Diary.readJson(file), { value: "기존" });
  assert.ok(!fs.readdirSync(f.data).some(name => name.endsWith(".tmp")));
  Diary.locked(f.data, () => assert.throws(() => Diary.locked(f.data, () => {})));
  assert.equal(fs.existsSync(path.join(f.data, ".write-lock")), false);
});
