"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const S = require("../src/storage.js");
const N = require("../src/nutrition.js");
const T = require("../src/training-store.js");
const D = require("../tools/diary.cjs");
const Coach = require("../tools/coach.cjs");
const { digest } = require("../tools/coach-runtime.cjs");

function profile() {
  return { sex: "female", age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatMethod: "unknown", bodyFatDate: null, bodyFatWeightKg: null, trainingYears: 2, sport: "strength", goal: "maintain", activity: "active", healthContext: "general", proteinPreference: "standard" };
}
function day(date) {
  return { date, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
}
function record() {
  return { id: "synthetic-workout", date: "2026-10-05", time: null, label: "가상 운동", durationMinutes: 40, reportedSetCount: 1, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: "manual", hash: null, paths: [], uncertainties: ["검증용 가상 자료"], revision: null },
    exercises: [{ id: "exercise", rawName: "가상 운동명", exerciseId: null, equipmentKey: null, loadConvention: "as-recorded", durationMinutes: null, repsTotal: null, reportedVolumeKg: null, sets: [{ id: "set", loadKg: null, reps: 8, marker: "A", rir: null }], notes: "" }], notes: "", effort: null, pain: null };
}
function message(id, createdAt = "2026-10-05T08:00:00.000Z", overrides = {}) {
  return { id, role: "user", text: "기록을 확인해 주세요.", createdAt, source: "local", replyTo: null, contextDigest: null, status: "pending", ...overrides };
}
function fixture(t) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "macro-coach-cli-test-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(data)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(data).startsWith("macro-coach-cli-test-"));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const state = { ...S.createEmpty(), updatedAt: "2026-10-05T00:00:00.000Z", profile: profile(), training: T.createEmpty() };
  const completed = day("2026-10-04");
  completed.meals = [{ id: "old-meal", name: "가상 저녁", protein: 20, carbs: 50, fat: 10, otherKcal: 0, alcoholG: 0 }];
  completed.sessions = [{ id: "old-session", sport: "strength", durationMin: 40, intensity: "moderate" }];
  completed.planSnapshot = N.calculatePlan(state.profile, completed, []); completed.complete = true;
  state.days[completed.date] = completed;
  state.days["2026-10-05"] = day("2026-10-05");
  state.training.records = [record()]; state.training.messages = [message("question")];
  const file = path.join(data, "app-state.json"); D.atomicJson(file, S.validateState(state));
  const proposalFile = path.join(data, "proposal.json");
  const proposal = next => ({ schemaVersion: 1, expectedDigest: digest(state), state: next });
  const writeProposal = next => { fs.writeFileSync(proposalFile, JSON.stringify(proposal(next)), "utf8"); return proposalFile; };
  return { data, state, file, proposalFile, proposal, writeProposal };
}
function addMeal(input) {
  const state = structuredClone(input);
  state.days["2026-10-05"].meals.push({ id: "new-meal", name: "확인한 식사", protein: 25, carbs: 60, fat: 12, otherKcal: 0, alcoholG: 0, source: { kind: "image", confidence: "estimated", note: "확인된 분량을 이용한 추정", hash: null } });
  return state;
}

test("context CLI exposes a calendar-bounded summary, pending memory and CAS revision without scanning images", t => {
  const f = fixture(t);
  f.state.days["2026-09-15"] = day("2026-09-15");
  f.state.days["2026-09-14"] = day("2026-09-14");
  f.state.days["2026-10-06"] = day("2026-10-06");
  for (let index = 0; index < 15; index++) f.state.training.messages.push(message(`old-question-${index}`, "2026-08-01T08:00:00.000Z"));
  f.state.training.messages.push(message("future", "2026-10-06T08:00:00.000Z"));
  D.atomicJson(f.file, f.state);
  fs.writeFileSync(path.join(f.data, "config.json"), JSON.stringify({ sourceRoot: "unavailable-synthetic-image-folder" }), "utf8");
  const originalScan = D.scan;
  try {
    D.scan = () => { throw new Error("Images must not be scanned"); };
    const output = Coach.cli(["context", "--data", f.data, "--date", "2026-10-05"]);
    assert.equal(output.from, "2026-09-15"); assert.equal(output.expectedDigest, digest(f.state));
    assert.deepEqual(output.context.recentDays.map(item => item.date), ["2026-10-05", "2026-10-04", "2026-09-15"]);
    assert.equal(output.context.pendingMessages.length, 16);
    assert.equal(output.context.pendingMessages.some(item => item.id === "future"), false);
    assert.equal(output.context.conversation.length, 12);
    assert.ok(output.context.trainingAnalysis); assert.ok(output.context.program);
    assert.equal(output.context.recentDays[0].intake, null);
  } finally { D.scan = originalScan; }
  const text = execFileSync(process.execPath, [require.resolve("../tools/coach.cjs"), "context", "--data", f.data, "--date", "2026-10-05"], { encoding: "utf8", windowsHide: true });
  assert.equal(JSON.parse(text).context.profile.sex, "female");
  assert.ok(text.includes("기록을 확인해 주세요."));
  assert.equal(fs.existsSync(path.join(f.data, "manifest.json")), false);
});

test("proposal dry run is the default, shows changes and performs no persistent write", t => {
  const f = fixture(t), next = addMeal(f.state), before = fs.readFileSync(f.file, "utf8");
  f.writeProposal(next);
  const output = Coach.cli(["propose", "--data", f.data, "--file", f.proposalFile]);
  assert.equal(output.mode, "preview"); assert.equal(output.applied, false);
  assert.equal(output.changes.days[0].date, "2026-10-05");
  assert.equal(output.changes.days[0].meals[0].id, "new-meal");
  assert.equal(output.changes.completedSnapshotsPreserved, 1);
  assert.equal(output.proposedDigest, digest(next));
  assert.equal(fs.readFileSync(f.file, "utf8"), before);
  assert.equal(fs.existsSync(`${f.file}.previous`), false);
  assert.equal(fs.existsSync(path.join(f.data, ".write-lock")), false);
});

test("explicit apply changes the profile and adds records while preserving completed plans exactly", t => {
  const f = fixture(t), next = addMeal(f.state);
  next.profile.weightKg = 67; next.profile.goal = "gain";
  f.writeProposal(next);
  const output = Coach.cli(["propose", "--apply", "--data", f.data, "--file", f.proposalFile]);
  assert.equal(output.applied, true); assert.deepEqual(output.changes.profile.fields, ["goal", "weightKg"]);
  const saved = D.readJson(f.file);
  assert.deepEqual(saved, next);
  assert.deepEqual(saved.days["2026-10-04"].planSnapshot, f.state.days["2026-10-04"].planSnapshot);
  assert.deepEqual(D.readJson(`${f.file}.previous`), f.state);
  assert.equal(fs.existsSync(path.join(f.data, ".write-lock")), false);
});

test("completed days reject meal, body, session, allocation and check-in edits in preview and apply", t => {
  const f = fixture(t), original = fs.readFileSync(f.file, "utf8");
  const changes = [
    value => { value.meals[0].protein = 21; },
    value => { value.meals.push({ id: "extra-meal", name: "추가 식사", protein: 5, carbs: 10, fat: 2, otherKcal: 0, alcoholG: 0 }); },
    value => { value.weightKg = 64; },
    value => { value.weightKg = 65; value.bodyFatPct = 25; value.bodyFatMethod = "bia"; },
    value => { value.sessions[0].durationMin = 41; },
    value => { value.sessions.push({ id: "extra-session", sport: "walking", durationMin: 10, intensity: "easy" }); },
    value => { value.carbAdjustmentG = 5; },
    value => { value.coachCheckin = { energy: "okay", hunger: "okay", sleep: "poor" }; },
    value => { value.coachCheckin = null; }
  ];
  for (const change of changes) {
    const next = structuredClone(f.state); change(next.days["2026-10-04"]);
    assert.doesNotThrow(() => S.validateState(next));
    f.writeProposal(next);
    for (const apply of [false, true]) {
      assert.throws(() => Coach.propose(f.data, f.proposalFile, apply), /완료/);
      assert.equal(fs.readFileSync(f.file, "utf8"), original);
    }
  }
  assert.equal(fs.existsSync(`${f.file}.previous`), false);
});

test("a Codex reply can answer a pending question without rewriting the original conversation", t => {
  const f = fixture(t), next = structuredClone(f.state);
  next.training.messages[0].status = "answered";
  next.training.messages.push(message("reply", "2026-10-05T08:01:00.000Z", { role: "coach", source: "codex", replyTo: "question", contextDigest: digest(f.state), status: "answered", text: "확인한 기록에서 알 수 있는 범위를 답합니다." }));
  f.writeProposal(next);
  assert.equal(Coach.propose(f.data, f.proposalFile, true).applied, true);
  assert.equal(Coach.context(f.data, "2026-10-05").context.pendingMessages.length, 0);
  assert.equal(D.readJson(f.file).training.messages[0].text, f.state.training.messages[0].text);
});

test("missing state and damaged state are errors, never an empty-state overwrite", t => {
  const f = fixture(t), next = addMeal(f.state); f.writeProposal(next);
  fs.writeFileSync(f.file, "{corrupt synthetic state", "utf8");
  assert.throws(() => Coach.context(f.data, "2026-10-05"));
  assert.throws(() => Coach.propose(f.data, f.proposalFile, true));
  assert.equal(fs.readFileSync(f.file, "utf8"), "{corrupt synthetic state");
  fs.unlinkSync(f.file);
  assert.throws(() => Coach.context(f.data, "2026-10-05"), /PC 저장 파일/);
  assert.throws(() => Coach.propose(f.data, f.proposalFile, true), /PC 저장 파일/);
  assert.equal(fs.existsSync(f.file), false);
});

test("proposal schema and explicit digest reject unsupported, missing, coercing or polluted input", t => {
  const f = fixture(t), good = f.proposal(addMeal(f.state));
  const invalid = [
    { ...good, schemaVersion: 2 }, { ...good, expectedDigest: null }, { ...good, expectedDigest: "" },
    { state: good.state, schemaVersion: 1 }, { ...good, extra: true },
    { ...good, state: { ...good.state, version: 999 } },
    { ...good, state: { ...good.state, profile: { ...good.state.profile, age: "35" } } }
  ];
  for (const item of invalid) assert.throws(() => Coach.parseProposal(item));
  assert.throws(() => Coach.parseProposal(JSON.parse(`{"schemaVersion":1,"expectedDigest":"${good.expectedDigest}","state":${JSON.stringify(good.state)},"__proto__":{}}`)));
  assert.deepEqual(D.readJson(f.file), f.state);
});

test("a stale proposal fails both preview and apply without altering the new saved data", t => {
  const f = fixture(t); f.writeProposal(addMeal(f.state));
  const recent = structuredClone(f.state); recent.profile.age = 36; D.atomicJson(f.file, recent);
  for (const apply of [false, true]) assert.throws(() => Coach.propose(f.data, f.proposalFile, apply), error => error.code === "CONFLICT");
  assert.deepEqual(D.readJson(f.file), recent);
});

test("apply checks its CAS revision again inside the shared persistence lock", t => {
  const f = fixture(t), originalLocked = D.locked; f.writeProposal(addMeal(f.state));
  const recent = structuredClone(f.state); recent.profile.age = 36;
  try {
    D.locked = (data, action) => originalLocked(data, () => { D.atomicJson(f.file, recent); return action(); });
    assert.throws(() => Coach.propose(f.data, f.proposalFile, true), error => error.code === "CONFLICT");
  } finally { D.locked = originalLocked; }
  assert.deepEqual(D.readJson(f.file), recent);
});

test("another writer's lock is left intact and a failed replacement preserves the original backup", t => {
  const f = fixture(t); f.writeProposal(addMeal(f.state));
  const lock = path.join(f.data, ".write-lock"); fs.writeFileSync(lock, "synthetic owner", "utf8");
  assert.throws(() => Coach.propose(f.data, f.proposalFile, true), error => error.code === "CONFLICT");
  assert.equal(fs.readFileSync(lock, "utf8"), "synthetic owner"); fs.unlinkSync(lock);
  const rename = fs.renameSync;
  try {
    fs.renameSync = (source, target) => { if (target === f.file) throw new Error("synthetic replacement failure"); return rename(source, target); };
    assert.throws(() => Coach.propose(f.data, f.proposalFile, true), /replacement failure/);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(D.readJson(f.file), f.state);
  assert.deepEqual(D.readJson(`${f.file}.previous`), f.state);
  assert.equal(fs.readdirSync(f.data).some(name => name.endsWith(".tmp") || name === ".write-lock"), false);
});

test("destructive proposals cannot erase dates, meals, sessions, sets or coaching history", t => {
  const f = fixture(t);
  for (const change of [
    value => { delete value.days["2026-10-04"]; },
    value => { value.days["2026-10-04"].meals = []; },
    value => { value.days["2026-10-04"].sessions = []; },
    value => { value.training.records = []; },
    value => { value.training.records[0].exercises = []; },
    value => { value.training.records[0].exercises[0].sets = []; },
    value => { value.training.messages = []; },
    value => { delete value.training; },
    value => { value.profile = null; },
    value => { value.training.messages[0].text = "replaced"; },
    value => { value.days["2026-10-04"].complete = false; value.days["2026-10-04"].planSnapshot = null; },
    value => { value.days["2026-10-04"].planSnapshot.energy.restingKcal += 1; }
  ]) {
    const next = structuredClone(f.state); change(next); f.writeProposal(next);
    assert.throws(() => Coach.propose(f.data, f.proposalFile, true));
    assert.deepEqual(D.readJson(f.file), f.state);
  }
  assert.throws(() => Coach.preserveHistory({ ...f.state, legacy: { raw: "original" } }, { ...f.state, legacy: { raw: "replaced" } }), /원본 보관함/);
});

test("no-op apply does not replace a file or rotate its backup", t => {
  const f = fixture(t); f.writeProposal(f.state);
  const before = fs.statSync(f.file).mtimeMs;
  const output = Coach.propose(f.data, f.proposalFile, true);
  assert.equal(output.applied, false); assert.equal(output.changes.changed, false);
  assert.equal(fs.statSync(f.file).mtimeMs, before);
  assert.equal(fs.existsSync(`${f.file}.previous`), false);
});

test("oversized or malformed proposal files and unsupported command options are rejected", t => {
  const f = fixture(t);
  fs.writeFileSync(f.proposalFile, "{", "utf8");
  assert.throws(() => Coach.propose(f.data, f.proposalFile));
  fs.truncateSync(f.proposalFile, Coach.MAX_INPUT_BYTES + 1);
  assert.throws(() => Coach.propose(f.data, f.proposalFile), /15MB/);
  for (const args of [[], ["apply"], ["context", "--apply"], ["context", "--date", "2026-02-30"], ["context", "--data"], ["context", "--date", "2026-10-05", "--date", "2026-10-06"], ["propose", "--apply"], ["propose", "--file", f.proposalFile, "--force"]]) assert.throws(() => Coach.cli(args));
  const child = spawnSync(process.execPath, [require.resolve("../tools/coach.cjs"), "context", "--data", f.data, "--date", "bad"], { encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 1); assert.equal(child.stdout, ""); assert.match(child.stderr, /Coach:/);
  assert.deepEqual(D.readJson(f.file), f.state);
});
