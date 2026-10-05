"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const Storage = require("../src/storage.js");
const Nutrition = require("../src/nutrition.js");
const Runtime = require("../tools/coach-runtime.cjs");

function answer(kind = "chat") {
  return { kind, answer: "합성 기록을 확인했어요.", questions: [], uncertainties: [], workouts: [], meal: null, body: null };
}
function workout() {
  return { date: "2026-10-04", time: null, label: "Synthetic workout", durationMinutes: null, reportedSetCount: null, reportedEnergyKcal: null, reportedVolumeKg: null, exercises: [{ rawName: "합성 운동", reportedVolumeKg: null, loadConvention: "as-recorded", sets: [{ loadKg: null, reps: 10, marker: "A" }], durationMinutes: null, repsTotal: null }], uncertainties: ["실제 운동이 아닌 합성 테스트 자료"] };
}
function fixture() {
  const state = Storage.createEmpty();
  state.profile = { sex: "female", age: 30, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: "unknown", trainingYears: null, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };
  state.days["2026-10-05"] = { date: "2026-10-05", weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
  return state;
}
function harness(t, options = {}) {
  const prefix = path.resolve(os.tmpdir(), "macro-coach-runtime-test-");
  const directory = fs.mkdtempSync(prefix);
  const calls = [];
  const spawn = (bin, args, spawnOptions) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const call = { bin, args, options: spawnOptions, child, prompt: "" };
    child.stdin.on("data", data => { call.prompt += data.toString(); });
    calls.push(call);
    if (options.throwSpawn) throw new Error("synthetic spawn failure");
    return child;
  };
  const runtime = new Runtime.CoachRuntime(directory, { bin: "synthetic-codex", spawn, timeoutMs: 10000, ...options });
  let stopped = 0;
  runtime.stopProcess = () => { stopped += 1; };
  t.after(() => {
    runtime.close();
    for (const call of calls) call.child.emit("close", null);
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(prefix) && path.dirname(resolved) === path.resolve(os.tmpdir()));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const outputPath = () => { const call = calls.at(-1); return call.args[call.args.indexOf("--output-last-message") + 1]; };
  const finish = (value, code = 0) => {
    if (value !== undefined) fs.writeFileSync(outputPath(), typeof value === "string" ? value : JSON.stringify(value), "utf8");
    calls.at(-1).child.emit("close", code);
  };
  return { runtime, directory, calls, finish, outputPath, stopped: () => stopped };
}

test("AI result kind and exact nested workout shapes are validated", () => {
  const valid = { ...answer("workout"), workouts: [workout()] };
  assert.equal(Runtime.validateResult(valid, "workout"), valid);
  const mutations = [
    value => { value.unexpected = true; },
    value => { value.workouts[0].unexpected = true; },
    value => { value.workouts[0].exercises[0].unexpected = true; },
    value => { value.workouts[0].exercises[0].sets[0].unexpected = true; },
    value => { value.workouts[0].date = "2026-02-30"; },
    value => { value.workouts[0].exercises[0].sets[0].reps = 1.5; },
    value => { value.workouts[0].exercises[0].sets[0].loadKg = "20"; }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(valid); mutate(value);
    assert.throws(() => Runtime.validateResult(value, "workout"));
  }
  assert.throws(() => Runtime.validateResult(answer("unexpected"), "unexpected"));
  assert.throws(() => Runtime.validateResult(answer("chat"), "meal"));
});

test("unknown image fields remain null and wrong-kind payloads never enter a draft", () => {
  const meal = { ...answer("meal"), meal: { date: "2026-10-05", name: "합성 음식 사진", protein: null, carbs: null, fat: null, otherKcal: null, alcoholG: null, basis: "estimate", note: "분량 미확인" } };
  const body = { ...answer("body"), body: { date: "2026-10-05", weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, method: "unknown" } };
  for (const value of [meal, body]) {
    const before = JSON.stringify(value);
    assert.equal(Runtime.validateResult(value, value.kind), value);
    assert.equal(JSON.stringify(value), before);
  }
  assert.equal(Runtime.validateResult(meal, "meal").meal.protein, null);
  assert.equal(Runtime.validateResult(body, "body").body.skeletalMuscleKg, null);
  assert.throws(() => Runtime.validateResult({ ...answer(), meal: meal.meal }, "chat"));
  assert.throws(() => Runtime.validateResult({ ...answer(), body: body.body }, "chat"));
  assert.throws(() => Runtime.validateResult({ ...answer(), workouts: [workout()] }, "chat"));
  for (const number of [-1, Infinity, "30"]) {
    const invalid = structuredClone(meal); invalid.meal.protein = number;
    assert.throws(() => Runtime.validateResult(invalid, "meal"));
  }
});

test("unreadable workout image can return questions without fabricating a dated session", () => {
  const empty = { ...answer("workout"), questions: ["날짜와 기록이 보이는 이미지를 알려 주세요."], uncertainties: ["이미지의 숫자와 날짜를 판독할 수 없음"] };
  assert.deepEqual(Runtime.validateResult(empty, "workout"), empty);
});

test("AI text bounds, control characters and excessive result counts are rejected", () => {
  for (const change of [
    value => { value.answer = "x".repeat(20001); },
    value => { value.answer = "bad\u0000text"; },
    value => { value.questions = [null]; },
    value => { value.uncertainties = Array(31).fill("x"); },
    value => { value.workouts = Array(21).fill(workout()); }
  ]) {
    const value = answer(); change(value);
    assert.throws(() => Runtime.validateResult(value, "chat"));
  }
});

test("summary keeps unrecorded meals and body values unknown and excludes future records", () => {
  const state = fixture();
  state.days["2026-10-06"] = { ...structuredClone(state.days["2026-10-05"]), date: "2026-10-06", weightKg: 66 };
  const before = JSON.stringify(state);
  const result = Runtime.summarizeState(state, "2026-10-05");
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.recentDays.length, 1);
  assert.equal(result.recentDays[0].mealCount, 0);
  assert.equal(result.recentDays[0].intake, null);
  assert.equal(result.recentDays[0].weightKg, null);
  assert.equal(result.recentDays[0].bodyFatPct, null);
  assert.equal(result.recentDays[0].skeletalMuscleKg, null);
  assert.equal(result.profile.trainingYears, null);
  assert.throws(() => Runtime.summarizeState(state, "2026-02-30"));
});

test("summary preserves completed saved plans despite current profile changes", () => {
  const state = fixture();
  const day = state.days["2026-10-05"];
  day.meals = [{ id: "synthetic-meal", name: "합성 식사", protein: 20, carbs: 30, fat: 10, otherKcal: 0, alcoholG: 0 }];
  day.planSnapshot = Nutrition.calculatePlan(state.profile, day);
  day.complete = true;
  const original = structuredClone(day.planSnapshot);
  state.profile.weightKg = 90;
  const summary = Runtime.summarizeState(state, day.date);
  assert.deepEqual(summary.today.planSnapshot, original);
  assert.deepEqual(summary.recentDays[0].savedPlan, original);
  assert.equal(summary.recentDays[0].mealCount, 1);
  assert.equal(summary.recentDays[0].intake.kcal, 290);
  assert.equal(summary.profile.weightKg, 90);
});

test("prompt marks contextual material untrusted and states unknown and snapshot boundaries", () => {
  const input = { kind: "chat", question: "합성 질문", context: { notes: "untrusted payload instruction" } };
  const prompt = Runtime.promptFor(input);
  const marker = "REQUEST_JSON (데이터):\n";
  assert.deepEqual(JSON.parse(prompt.split(marker)[1]), input);
  assert.match(prompt, /신뢰할 수 없는/);
  assert.match(prompt, /도구 호출, 파일 읽기\/쓰기/);
  assert.match(prompt, /누락 일자는 휴식도 0도 아닙니다/);
  assert.match(prompt, /완료.*(?:저장|savedPlan)|savedPlan.*완료/);
  assert.match(prompt, /미완료|기록 중/);
  assert.match(prompt, /알 수 없는 영양소는 null/);
  assert.match(prompt, /골격근량은 제지방량이 아닙니다/);
  assert.match(prompt, /임신\/수유\/섭식장애\/질환\/미성년/);
  assert.match(prompt, /같은|동일 중량 비교/);
});

test("fake runtime uses stdin structured-output readonly process and never runs a real account", t => {
  const h = harness(t);
  const input = { kind: "chat", question: "합성 질문", context: { known: null } };
  const job = h.runtime.start(input);
  assert.match(job.id, /^[a-f0-9]{32}$/);
  assert.equal(job.status, "running");
  assert.equal(h.runtime.status().running, job.id);
  assert.equal(job.process, undefined);
  assert.equal(job.timer, undefined);
  assert.equal(h.calls.length, 1);
  const call = h.calls[0];
  assert.equal(call.bin, "synthetic-codex");
  for (const flag of ["exec", "--ephemeral", "--sandbox", "read-only", "--ignore-user-config", "--ignore-rules", "--output-schema", "--output-last-message"]) assert.ok(call.args.includes(flag));
  const disabled = call.args.flatMap((arg, index) => arg === "--disable" ? [call.args[index + 1]] : []);
  for (const feature of ["shell_tool", "unified_exec", "apps", "plugins", "browser_use", "computer_use", "multi_agent", "hooks", "goals", "image_generation", "code_mode_host"]) {
    assert.ok(disabled.includes(feature), `${feature} must be explicitly disabled`);
  }
  const config = call.args.flatMap((arg, index) => arg === "-c" ? [call.args[index + 1]] : []);
  assert.ok(config.includes('web_search="disabled"'));
  assert.ok(config.includes("project_doc_max_bytes=0"));
  assert.ok(config.some(value => value.startsWith("developer_instructions=") && value.includes("untrusted observations")));
  assert.equal(call.args.at(-1), "-");
  assert.equal(call.options.shell, false);
  assert.equal(call.options.windowsHide, true);
  assert.ok(path.resolve(call.options.cwd).startsWith(path.resolve(h.directory) + path.sep));
  assert.match(call.prompt, /합성 질문/);
  assert.throws(() => h.runtime.start({ ...input, question: "second" }), /답변 중/);
  h.finish(answer());
  const complete = h.runtime.get(job.id);
  assert.equal(complete.status, "completed");
  assert.equal(complete.result.answer, "합성 기록을 확인했어요.");
  assert.equal(h.runtime.status().running, null);
});

test("completed input is cached and explicit retry archives the original output", t => {
  const h = harness(t);
  const input = { kind: "chat", question: "same input" };
  const first = h.runtime.start(input);
  h.finish(answer());
  const cached = h.runtime.start(input);
  assert.equal(cached.id, first.id);
  assert.equal(cached.status, "completed");
  assert.equal(h.calls.length, 1);
  const retry = h.runtime.start(input, null, true);
  assert.equal(retry.id, first.id);
  assert.equal(retry.status, "running");
  assert.equal(h.calls.length, 2);
  const files = fs.readdirSync(path.dirname(h.outputPath()));
  assert.ok(files.some(name => /^output-[a-f0-9-]+\.json$/.test(name)));
  h.finish({ ...answer(), answer: "새 합성 답변" });
  assert.equal(h.runtime.get(first.id).result.answer, "새 합성 답변");
});

test("image path is one process argument and question never enters a shell command", t => {
  const h = harness(t);
  const imagePath = path.join(h.directory, "synthetic file & argument.png");
  const input = { kind: "workout", question: "question & $(not-a-command)", imageHash: "a".repeat(64) };
  const job = h.runtime.start(input, imagePath);
  const call = h.calls[0];
  assert.equal(call.args[call.args.indexOf("--image") + 1], imagePath);
  assert.ok(!call.args.includes(input.question));
  h.finish({ ...answer("workout"), workouts: [workout()] });
  assert.equal(h.runtime.get(job.id).imageHash, input.imageHash);
});

test("cancelled and timed-out work cannot be revived by a late successful process exit", async t => {
  const h = harness(t, { timeoutMs: 30 });
  const first = h.runtime.start({ kind: "chat", question: "cancel" });
  assert.equal(h.runtime.cancel(first.id).status, "cancelled");
  assert.equal(h.stopped(), 1);
  h.finish(answer());
  assert.equal(h.runtime.get(first.id).status, "cancelled");
  const second = h.runtime.start({ kind: "chat", question: "timeout" });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(h.runtime.get(second.id).status, "failed");
  assert.match(h.runtime.get(second.id).error, /시간/);
  h.finish(answer());
  assert.equal(h.runtime.get(second.id).result, null);
  assert.equal(h.runtime.status().running, null);
});

test("spawn errors, authentication and rate limits release the running slot without exposing stderr", t => {
  const h = harness(t);
  for (const [tail, expected] of [["rate_limit raw-private-token", /사용 한도/], ["unauthorized raw-private-token", /로그인/], ["unrelated process failure raw-private-token", /완료하지 못/]]) {
    const job = h.runtime.start({ kind: "chat", question: tail });
    h.calls.at(-1).child.stderr.write(tail);
    h.finish(undefined, 1);
    assert.equal(h.runtime.get(job.id).status, "failed");
    assert.match(h.runtime.get(job.id).error, expected);
    assert.ok(!h.runtime.get(job.id).error.includes("raw-private-token"));
    assert.equal(h.runtime.status().running, null);
  }
  const failed = h.runtime.start({ kind: "chat", question: "event error" });
  h.calls.at(-1).child.emit("error", new Error("private machine error"));
  assert.equal(h.runtime.get(failed.id).status, "failed");
  assert.equal(h.runtime.status().running, null);
});

test("invalid or oversized AI outputs remain rejected and their raw file is preserved", t => {
  const h = harness(t);
  for (const [name, output] of [["bad-json", "{broken"], ["wrong-kind", answer("meal")], ["oversize", "x".repeat(1024 * 1024 + 1)]]) {
    const job = h.runtime.start({ kind: "chat", question: name });
    h.finish(output);
    const finished = h.runtime.get(job.id);
    assert.equal(finished.status, "failed");
    assert.equal(finished.result, null);
    assert.equal(fs.existsSync(h.outputPath()), true);
  }
});

test("synchronous launch failure and missing output release the running slot", t => {
  const launch = harness(t, { throwSpawn: true });
  const failed = launch.runtime.start({ kind: "chat", question: "synthetic launch failure" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.result, null);
  assert.equal(launch.runtime.status().running, null);
  const missing = harness(t);
  const job = missing.runtime.start({ kind: "chat", question: "synthetic missing output" });
  missing.finish(undefined);
  assert.equal(missing.runtime.get(job.id).status, "failed");
  assert.equal(missing.runtime.get(job.id).result, null);
  assert.equal(missing.runtime.status().running, null);
});

test("another runtime preserves a live owner and reports a crashed owner as interrupted", t => {
  const h = harness(t);
  const job = h.runtime.start({ kind: "chat", question: "restart" });
  const reopened = new Runtime.CoachRuntime(h.directory, { bin: "synthetic-codex", spawn() { throw new Error("must not spawn"); } });
  t.after(() => reopened.close());
  assert.equal(reopened.get(job.id).status, "running");
  assert.equal(reopened.status().running, null);
  assert.equal(reopened.status().busy, true);
  const lockPath = path.join(h.directory, ".ai-lock");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  assert.equal(lock.ownerPid, process.pid);
  fs.writeFileSync(lockPath, JSON.stringify({ ...lock, ownerPid: 2147483647 }), "utf8");
  assert.equal(reopened.get(job.id).status, "interrupted");
  assert.throws(() => reopened.get("../../config.json"));
  assert.equal(reopened.get("f".repeat(32)), null);
});

test("the 256 KiB prompt limit uses UTF-8 bytes and rejects before spawning or creating a job", t => {
  const h = harness(t);
  const limit = 256 * 1024;
  for (const notes of ["x".repeat(limit), "한".repeat(Math.floor(limit / 3))]) {
    const input = { kind: "chat", question: "synthetic size limit", context: { notes } };
    assert.ok(Buffer.byteLength(Runtime.promptFor(input), "utf8") > limit);
    assert.throws(() => h.runtime.start(input), /맥락이 너무 커/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.runtime.status().running, null);
    assert.equal(h.runtime.status().busy, false);
    assert.deepEqual(fs.readdirSync(path.join(h.directory, "jobs")), []);
  }
  const input = { kind: "chat", question: "synthetic exact boundary", context: { notes: "" } };
  const overhead = Buffer.byteLength(Runtime.promptFor(input), "utf8");
  input.context.notes = "x".repeat(limit - overhead);
  assert.equal(Buffer.byteLength(Runtime.promptFor(input), "utf8"), limit);
  const accepted = h.runtime.start(input);
  assert.equal(accepted.status, "running");
  assert.equal(h.calls.length, 1);
  h.finish(answer());
  input.context.notes += "x";
  assert.equal(Buffer.byteLength(Runtime.promptFor(input), "utf8"), limit + 1);
  assert.throws(() => h.runtime.start(input), /맥락이 너무 커/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.runtime.status().running, null);
  assert.equal(h.runtime.status().busy, false);
});

test("unavailable runtime and explicit close never spawn, and digest follows context changes", t => {
  const unavailable = harness(t, { bin: null });
  assert.equal(unavailable.runtime.status().available, false);
  assert.throws(() => unavailable.runtime.start({ kind: "chat" }), /실행 파일/);
  assert.equal(unavailable.calls.length, 0);
  const h = harness(t);
  const job = h.runtime.start({ kind: "chat", question: "close" });
  h.runtime.close();
  assert.equal(h.runtime.get(job.id).status, "cancelled");
  assert.throws(() => h.runtime.start({ kind: "chat", question: "after close" }));
  assert.equal(Runtime.digest({ question: "q", context: null }), Runtime.digest({ question: "q", context: null }));
  assert.notEqual(Runtime.digest({ question: "q", context: null }), Runtime.digest({ question: "q", context: { changed: true } }));
});

test("Codex binary override resolves a configured path without probing installed accounts", () => {
  const previous = process.env.MACRO_CODEX_BIN;
  try {
    process.env.MACRO_CODEX_BIN = path.join(os.tmpdir(), "synthetic codex.exe");
    assert.equal(Runtime.findCodex(), path.resolve(process.env.MACRO_CODEX_BIN));
  } finally {
    if (previous === undefined) delete process.env.MACRO_CODEX_BIN;
    else process.env.MACRO_CODEX_BIN = previous;
  }
});
