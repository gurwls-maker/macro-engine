"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const Diary = require("../tools/diary.cjs");
const windows = { skip: process.platform !== "win32" };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "macro-diary-move-"));
  const source = path.join(root, "운동 원본");
  const batch = path.join(root, "batch");
  const journal = path.join(root, "private", "moves.json");
  fs.mkdirSync(source);
  fs.mkdirSync(batch);
  const filename = "rise_image_test.png.png";
  const image = path.join(source, filename);
  fs.writeFileSync(image, "preserved synthetic original bytes");
  const row = { filename, session: { date: "2026-10-04", label: "Legs" } };
  const extraction = path.join(batch, "record.json");
  fs.writeFileSync(extraction, JSON.stringify(row));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (...extra) => execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve(__dirname, "../tools/organize-diary.ps1"), "-SourceRoot", source, "-Batch", batch, "-Journal", journal, "-ExpectedCount", "1", ...extra], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  return { root, source, batch, journal, image, row, extraction, run };
}

test("organizer dry run leaves originals intact; applied move preserves bytes and journal", windows, t => {
  const f = fixture(t);
  const hash = Diary.hashFile(f.image);
  f.run();
  assert.ok(fs.existsSync(f.image));
  assert.equal(fs.existsSync(f.journal), false);
  f.run("-Apply");
  const destination = path.join(f.source, "261004 Legs", f.row.filename);
  assert.equal(fs.existsSync(f.image), false);
  assert.equal(Diary.hashFile(destination), hash);
  const journal = Diary.readJson(f.journal);
  const row = Array.isArray(journal) ? journal[0] : journal;
  assert.equal(row.moved, true);
  assert.equal(row.hash, hash);
  assert.throws(() => f.run("-Apply"));
  assert.equal(Diary.hashFile(destination), hash);
});

test("organizer never overwrites a destination collision", windows, t => {
  const f = fixture(t);
  const dir = path.join(f.source, "261004 Legs");
  fs.mkdirSync(dir);
  const destination = path.join(dir, f.row.filename);
  fs.writeFileSync(destination, "already present user file");
  assert.throws(() => f.run("-Apply"));
  assert.ok(fs.existsSync(f.image));
  assert.equal(fs.readFileSync(destination, "utf8"), "already present user file");
  assert.equal(fs.existsSync(f.journal), false);
});

test("organizer validates all routes before any move, including traversal and invalid dates", windows, t => {
  const f = fixture(t);
  for (const row of [
    { ...f.row, filename: "../outside.png" },
    { ...f.row, session: { date: "2026-02-30", label: "Legs" } },
    { ...f.row, session: { date: "2026-10-04", label: "../outside" } }
  ]) {
    fs.writeFileSync(f.extraction, JSON.stringify(row));
    assert.throws(() => f.run("-Apply"));
    assert.ok(fs.existsSync(f.image));
    assert.equal(fs.existsSync(f.journal), false);
  }
});
