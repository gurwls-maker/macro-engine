"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const D = require("../tools/diary.cjs");
const Settings = require("../tools/diary-settings.cjs");

function fixture(t, initialized = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "macro-diary-settings-"));
  const data = path.join(root, "private"), source = path.join(root, "original"), next = path.join(root, "new-original");
  for (const directory of [data, source, next]) fs.mkdirSync(directory);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const image = path.join(source, "diary.png"), nextImage = path.join(next, "diary.png");
  fs.writeFileSync(image, "synthetic image bytes"); fs.copyFileSync(image, nextImage);
  const config = path.join(data, "config.json"), manifest = path.join(data, "manifest.json");
  if (initialized) D.init(data, source);
  return { root, data, source, next, image, nextImage, config, manifest };
}
function session() {
  return { date: "2026-10-06", time: "16:00", label: "Synthetic", durationMinutes: null,
    reportedSetCount: null, reportedEnergyKcal: null, reportedVolumeKg: null, uncertainties: [],
    exercises: [{ rawName: "Synthetic machine", loadConvention: "as-recorded", reportedVolumeKg: null,
      durationMinutes: null, repsTotal: null, sets: [{ loadKg: 20, reps: 10, marker: null }] }] };
}
function records(f) {
  const hash = D.scan(f.data).pending[0].hash;
  D.store(f.data, "diary.png", hash, [session()]);
  const corrected = session(); corrected.exercises[0].sets[0].reps = 11;
  D.correct(f.data, { schemaVersion: 1, hash, baseDigest: D.digest([session()]), expectedRevision: null,
    reason: "synthetic confirmed correction", sessions: [corrected] });
  fs.writeFileSync(path.join(f.data, "app-state.json"), '{"synthetic":"preserve-app-state"}');
  return { hash, extraction: path.join(f.data, "extractions", `${hash}.json`), head: path.join(f.data, "corrections", `${hash}.json`) };
}

test("folder preview and initial setup do not read images, scan or change app state", t => {
  const f = fixture(t, false), state = path.join(f.data, "app-state.json");
  fs.writeFileSync(state, '{"synthetic":"state"}');
  const open = fs.openSync;
  fs.openSync = (file, ...args) => { assert.ok(!String(file).endsWith(".png"), "folder settings must not read image bytes"); return open(file, ...args); };
  try {
    const empty = Settings.readStatus(f.data);
    assert.equal(empty.configured, false); assert.equal(empty.reachable, null);
    const preview = Settings.preview(f.data, { sourceRoot: `"${f.source}"` });
    assert.equal(preview.sourceRoot, fs.realpathSync(f.source)); assert.equal(preview.expectedDigest, null);
    assert.equal(fs.existsSync(f.config), false); assert.equal(fs.existsSync(f.manifest), false);
    const status = Settings.apply(f.data, { sourceRoot: preview.sourceRoot, expectedDigest: preview.expectedDigest });
    assert.equal(status.configured, true); assert.equal(status.reachable, true); assert.equal(status.scannedAt, null);
    assert.ok(status.warning.includes("아직")); assert.deepEqual(D.readJson(f.manifest).sources, {});
    assert.equal(fs.readFileSync(state, "utf8"), '{"synthetic":"state"}');
  } finally { fs.openSync = open; }
});

test("source change preserves cached records and corrections but invalidates old-path availability", t => {
  const f = fixture(t), r = records(f);
  D.atomicJson(f.config, { ...D.readJson(f.config), localNote: "preserve metadata" });
  const before = D.readJson(f.manifest), cache = fs.readFileSync(r.extraction), head = fs.readFileSync(r.head), state = fs.readFileSync(path.join(f.data, "app-state.json"));
  const previousId = D.context(f.data).sessions[0].id;
  const draft = Settings.preview(f.data, { sourceRoot: f.next });
  const changed = Settings.apply(f.data, { sourceRoot: draft.sourceRoot, expectedDigest: draft.expectedDigest });
  assert.equal(changed.sourceRoot, fs.realpathSync(f.next)); assert.equal(changed.scannedAt, null);
  const manifest = D.readJson(f.manifest);
  assert.deepEqual(manifest.sources, before.sources); assert.deepEqual(manifest.fingerprints, {});
  assert.equal(D.readJson(f.config).localNote, "preserve metadata");
  assert.deepEqual(fs.readFileSync(r.extraction), cache); assert.deepEqual(fs.readFileSync(r.head), head);
  assert.deepEqual(fs.readFileSync(path.join(f.data, "app-state.json")), state);
  const context = D.context(f.data);
  assert.equal(context.sessions[0].id, previousId); assert.equal(context.sessions[0].sourceAvailable, false);
  assert.equal(context.sourceAvailabilityAsOf, null);
  assert.equal(D.scan(f.data).hashedFiles, 1, "the next explicit scan must hash the new folder rather than trusting old fingerprints");
  const scanned = D.context(f.data);
  assert.equal(scanned.sessions[0].id, previousId); assert.equal(scanned.sessions[0].sourceAvailable, true);
  assert.equal(scanned.sessions[0].corrected, true);
});

test("unchanged paths are no-op and competing or stale previews cannot replace a newer configuration", t => {
  const f = fixture(t), before = fs.readFileSync(f.config), manifest = fs.readFileSync(f.manifest);
  const unchanged = Settings.preview(f.data, { sourceRoot: f.source });
  assert.equal(unchanged.changed, false);
  Settings.apply(f.data, { sourceRoot: f.source, expectedDigest: unchanged.expectedDigest });
  assert.deepEqual(fs.readFileSync(f.config), before); assert.deepEqual(fs.readFileSync(f.manifest), manifest);
  const draft = Settings.preview(f.data, { sourceRoot: f.next });
  D.atomicJson(f.config, { ...D.readJson(f.config), externalChange: true });
  const latest = fs.readFileSync(f.config);
  assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: draft.expectedDigest }), { status: 409 });
  assert.deepEqual(fs.readFileSync(f.config), latest); assert.deepEqual(fs.readFileSync(f.manifest), manifest);
});

test("relative paths, drive roots and the private data tree are rejected", t => {
  const f = fixture(t);
  for (const sourceRoot of ["relative", path.parse(f.source).root, f.data, f.root, f.image, "", `${f.source}\u0000`])
    assert.throws(() => Settings.preview(f.data, { sourceRoot }));
  const inbox = path.join(f.data, "inbox"); fs.mkdirSync(inbox);
  assert.throws(() => Settings.preview(f.data, { sourceRoot: inbox }));
  assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next }));
  assert.throws(() => Settings.preview(f.data, { sourceRoot: f.next, overwrite: true }));
});

test("offline original folders remain configured and can be explicitly moved without reading missing images", t => {
  const f = fixture(t); records(f);
  D.atomicJson(f.config, { ...D.readJson(f.config), sourceRoot: path.join(f.root, "unavailable-drive") });
  const status = Settings.readStatus(f.data);
  assert.equal(status.configured, true); assert.equal(status.reachable, false); assert.ok(status.warning.includes("접근"));
  const preview = Settings.preview(f.data, { sourceRoot: f.next });
  assert.equal(Settings.apply(f.data, { sourceRoot: preview.sourceRoot, expectedDigest: preview.expectedDigest }).reachable, true);
});

test("missing configuration in a populated diary cannot silently initialize a fresh index", t => {
  const f = fixture(t); records(f);
  const before = fs.readFileSync(f.manifest); fs.unlinkSync(f.config);
  assert.throws(() => Settings.readStatus(f.data), /재초기화/);
  assert.throws(() => Settings.preview(f.data, { sourceRoot: f.next }), /재초기화/);
  assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: null }), /재초기화/);
  assert.deepEqual(fs.readFileSync(f.manifest), before); assert.equal(fs.existsSync(f.config), false);
});

test("damaged configuration, manifest, cache and missing correction head block changes without overwrite", t => {
  for (const kind of ["config", "manifest", "paths", "cache", "missing-cache", "missing-head", "correction"]) {
    const f = fixture(t), r = records(f), oldConfig = fs.readFileSync(f.config);
    if (kind === "config") fs.writeFileSync(f.config, "{");
    else if (kind === "manifest") fs.writeFileSync(f.manifest, "{");
    else if (kind === "paths") { const value = D.readJson(f.manifest); value.sources[r.hash].paths = ["../outside.png"]; D.atomicJson(f.manifest, value); }
    else if (kind === "cache") fs.writeFileSync(r.extraction, "{");
    else if (kind === "missing-cache") fs.unlinkSync(r.extraction);
    else if (kind === "missing-head") fs.unlinkSync(r.head);
    else { const value = D.readJson(r.head); value.baseDigest = "b".repeat(64); D.atomicJson(r.head, value); }
    const config = fs.readFileSync(f.config), manifest = fs.readFileSync(f.manifest);
    assert.throws(() => Settings.readStatus(f.data));
    assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: require("node:crypto").createHash("sha256").update(oldConfig).digest("hex") }));
    assert.deepEqual(fs.readFileSync(f.config), config); assert.deepEqual(fs.readFileSync(f.manifest), manifest);
  }
});

test("failed initial manifest write removes only this attempt's new configuration so setup can be retried", t => {
  const f = fixture(t, false), rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (to === f.manifest) throw new Error("synthetic manifest commit failure"); return rename(from, to); };
  try { assert.throws(() => Settings.apply(f.data, { sourceRoot: f.source, expectedDigest: null }), /synthetic/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(f.config), false); assert.equal(fs.existsSync(f.manifest), false);
  assert.equal(Settings.apply(f.data, { sourceRoot: f.source, expectedDigest: null }).configured, true);
});

test("failed path commit preserves original configuration and records while availability stays conservative", t => {
  const f = fixture(t), r = records(f), original = D.atomicJson;
  const config = fs.readFileSync(f.config), cache = fs.readFileSync(r.extraction), head = fs.readFileSync(r.head), sources = D.readJson(f.manifest).sources;
  const preview = Settings.preview(f.data, { sourceRoot: f.next });
  D.atomicJson = (file, value) => { if (file === f.config) throw new Error("synthetic config failure"); return original(file, value); };
  try { assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: preview.expectedDigest }), /synthetic/); }
  finally { D.atomicJson = original; }
  assert.deepEqual(fs.readFileSync(f.config), config); assert.deepEqual(fs.readFileSync(r.extraction), cache); assert.deepEqual(fs.readFileSync(r.head), head);
  assert.deepEqual(D.readJson(f.manifest).sources, sources); assert.equal(Settings.readStatus(f.data).scannedAt, null);
  assert.equal(D.context(f.data).sessions[0].sourceAvailable, false); assert.equal(fs.existsSync(path.join(f.data, ".write-lock")), false);
});

test("failed freshness write and a live writer cannot alter the current path or enter the update", t => {
  const f = fixture(t), original = D.atomicJson, preview = Settings.preview(f.data, { sourceRoot: f.next });
  const config = fs.readFileSync(f.config), manifest = fs.readFileSync(f.manifest);
  D.atomicJson = () => { throw new Error("synthetic manifest failure"); };
  try { assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: preview.expectedDigest }), /synthetic/); }
  finally { D.atomicJson = original; }
  assert.deepEqual(fs.readFileSync(f.config), config); assert.deepEqual(fs.readFileSync(f.manifest), manifest);
  fs.writeFileSync(path.join(f.data, ".write-lock"), `${process.pid}\n`);
  assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: preview.expectedDigest }), { code: "EEXIST" });
  assert.deepEqual(fs.readFileSync(f.config), config); assert.deepEqual(fs.readFileSync(f.manifest), manifest);
});

test("an out-of-band configuration edit during freshness reset is not overwritten", t => {
  const f = fixture(t), original = D.atomicJson, preview = Settings.preview(f.data, { sourceRoot: f.next });
  D.atomicJson = (file, value) => {
    const result = original(file, value);
    if (file === f.manifest) original(f.config, { ...D.readJson(f.config), externalChange: "preserve this edit" });
    return result;
  };
  try { assert.throws(() => Settings.apply(f.data, { sourceRoot: f.next, expectedDigest: preview.expectedDigest }), { status: 409 }); }
  finally { D.atomicJson = original; }
  assert.equal(D.readJson(f.config).sourceRoot, fs.realpathSync(f.source));
  assert.equal(D.readJson(f.config).externalChange, "preserve this edit");
  assert.equal(D.readJson(f.manifest).scannedAt, null);
});
