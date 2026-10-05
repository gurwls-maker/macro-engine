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
  assert.deepEqual(summary.recentDays[0].savedPlan.energy, original.energy);
  assert.deepEqual(summary.recentDays[0].savedPlan.macros, original.macros);
  assert.equal(summary.recentDays[0].savedPlan.status, original.status);
  assert.equal(summary.recentDays[0].savedPlan.version, original.version);
  assert.deepEqual(day.planSnapshot, original);
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

test("fact packets distinguish unknown intake, estimates and measured composition", () => {
  const state = fixture(), date = "2026-10-05";
  let context = Runtime.summarizeState(state, date);
  assert.equal(context.contractVersion, 2);
  assert.ok(!context.facts.some(fact => fact.id.startsWith("today.intake.")));
  assert.equal(context.facts.find(fact => fact.id === "today.target.kcal").estimated, true);
  state.days[date].weightKg = 65;
  state.days[date].meals = [{ id: "known", name: "합성 기록", protein: 20, carbs: 30, fat: 10, otherKcal: 0, alcoholG: 0 }];
  context = Runtime.summarizeState(state, date);
  assert.equal(context.facts.find(fact => fact.id === "today.intake.kcal").value, 290);
  assert.equal(context.facts.find(fact => fact.id === "measurement.weightKg").estimated, false);
  assert.ok(!context.facts.some(fact => fact.id === "measurement.skeletalMuscleKg"));
});

test("AI numeric claims must refer to an exact known fact and stated quantities are checked", () => {
  const context = { contractVersion: 2, date: "2026-10-05", facts: [{ id: "known", value: 12, unit: "회" }] };
  const result = { ...answer(), answer: "기록은 12회예요.", coaching: { claims: [{ factId: "known", value: 12 }], followUp: null } };
  assert.equal(Runtime.validateResult(result, "chat", context), result);
  for (const change of [
    value => { value.coaching.claims[0].value = 13; },
    value => { value.coaching.claims[0].factId = "invented"; },
    value => { value.answer = "기록은 18회예요."; },
    value => { value.answer = "기록은 4~12회예요."; },
    value => { value.answer = "기록은 12.4회예요."; },
    value => { value.answer = "12kg이에요."; },
    value => { value.answer = "RIR 12예요."; },
    value => { value.coaching.claims.push({ factId: "known", value: 12 }); }
  ]) {
    const changed = structuredClone(result); change(changed);
    assert.throws(() => Runtime.validateResult(changed, "chat", context));
  }
  assert.throws(() => Runtime.validateResult(answer(), "chat", context), /기록 근거/);
});

test("follow-up proposals are bounded drafts and cannot contain writes or arbitrary fields", () => {
  const context = { date: "2026-10-05", facts: [] };
  const result = { ...answer(), coaching: { claims: [], followUp: { topic: "recovery", note: "수면과 수행이 돌아왔는지 확인", reviewDate: "2026-10-12" } } };
  assert.equal(Runtime.validateResult(result, "chat", context), result);
  for (const date of ["2026-10-04", "2027-02-01", "2026-02-30"]) {
    const changed = structuredClone(result); changed.coaching.followUp.reviewDate = date;
    assert.throws(() => Runtime.validateResult(changed, "chat", context));
  }
  const changed = structuredClone(result); changed.coaching.followUp.apply = true;
  assert.throws(() => Runtime.validateResult(changed, "chat", context));
  assert.throws(() => Runtime.validateResult({ ...answer("workout"), coaching: result.coaching }, "workout"));
});

test("older relevant messages are recalled within a budget, never future memories", () => {
  const state = fixture();
  state.training = require("../src/training-store.js").createEmpty();
  state.training.messages = Array.from({ length: 20 }, (_, index) => ({ id: `message-${index}`, role: index % 2 ? "coach" : "user", text: index === 0 ? "벤치에서 기구를 바꾸기로 했어요." : "일상적인 합성 대화", createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`, source: "local", replyTo: null, contextDigest: null, status: "answered" }));
  state.training.memory = { constraints: "미래에 입력한 조건", focus: "", agreements: "", updatedAt: "2026-10-07T12:00:00.000Z" };
  const before = JSON.stringify(state);
  const context = Runtime.summarizeState(state, "2026-10-05", "벤치 기구");
  assert.equal(context.recall.memory, null);
  assert.equal(context.recall.conversation[0].id, "message-0");
  assert.equal(context.conversation.length, 12);
  assert.ok(!context.conversation.some(message => message.id === "message-0"));
  assert.equal(JSON.stringify(state), before);
});

test('selected-day measurements use the same pure profile helper as the browser without modifying either input', () => {
  const state = fixture(), day = state.days['2026-10-05'];
  Object.assign(state.profile, { sex: 'male', age: 35, heightCm: 180, weightKg: 80, bodyFatPct: 30, bodyFatWeightKg: 80, bodyFatDate: '2026-09-30', bodyFatMethod: 'dxa', trainingYears: 5, goal: 'lose' });
  Object.assign(day, { weightKg: 80, bodyFatPct: 12, bodyFatMethod: 'dxa' });
  const before = structuredClone(state);
  const effective = Nutrition.profileForDay(state.profile, day);
  const plan = Nutrition.calculatePlan(effective, day, []);
  const context = Runtime.summarizeState(state, day.date);
  assert.deepEqual(context.calculationProfile, effective);
  assert.equal(context.facts.find(fact => fact.id === 'today.target.kcal').value, plan.energy.targetKcal);
  assert.notEqual(plan.energy.targetKcal, Nutrition.calculatePlan(state.profile, day, []).energy.targetKcal);
  assert.deepEqual(state, before);
  assert.deepEqual(Nutrition.profileForDay(state.profile, {}), state.profile);
  assert.notEqual(Nutrition.profileForDay(state.profile, {}), state.profile);
  assert.equal(Nutrition.profileForDay(null, day), null);
});

test('recent nutrition and measurements expose citeable facts instead of rejecting correct history quantities', () => {
  const state = fixture(), day = state.days['2026-10-05'];
  state.days['2026-10-04'] = { ...structuredClone(day), date: '2026-10-04', weightKg: 64.7, bodyFatPct: 24.1,
    meals: [{ id: 'previous-meal', name: '합성 식사', protein: 17.3, carbs: 55, fat: 11, otherKcal: 0, alcoholG: 0 }] };
  const context = Runtime.summarizeState(state, day.date);
  const protein = context.facts.find(fact => fact.id === 'packet.recentDays.1.intake.protein');
  const weight = context.facts.find(fact => fact.id === 'packet.recentDays.1.weightKg');
  assert.equal(protein.value, 17.3); assert.equal(protein.unit, 'g'); assert.equal(protein.date, '2026-10-04');
  const value = { ...answer(), answer: '10월 4일에 기록한 단백질은 17.3그램, 체중은 64.7kg이에요.',
    coaching: { claims: [protein, weight].map(fact => ({ factId: fact.id, value: fact.value })), followUp: null } };
  assert.equal(Runtime.validateResult(value, 'chat', context), value);
});

test('known calendar dates and follow-up dates are separate from quantities and invented dates fail', () => {
  const context = { contractVersion: 2, date: '2026-10-05', facts: [{ id: 'weight', unit: 'kg', value: 65 }] };
  const value = { ...answer(), answer: '2026년 10월 5일 기록은 65kg이에요. 10월 12일에 다시 확인할까요?', coaching: {
    claims: [{ factId: 'weight', value: 65 }], followUp: { topic: 'general', note: '2026-10-12에 기록을 확인', reviewDate: '2026-10-12' } } };
  assert.equal(Runtime.validateResult(value, 'chat', context), value);
  for (const text of ['10월 6일 기록은 65kg이에요.', '2025년 10월 5일 기록은 65kg이에요.', '체중은 5일 동안 같은 조건으로 기록하세요.']) {
    assert.throws(() => Runtime.validateResult({ ...value, answer: text }, 'chat', context));
  }
});

test('Korean quantity aliases, compatible units, full-width digits and RIR particles do not bypass claim checks', () => {
  const context = { contractVersion: 2, date: '2026-10-05', facts: [
    { id: 'protein', unit: 'g', value: 20 }, { id: 'weight', unit: 'kg', value: 65 },
    { id: 'training.rir', unit: '회', value: 2 }, { id: 'duration', unit: '분', value: 60 }
  ] };
  const base = { ...answer(), coaching: { claims: context.facts.map(fact => ({ factId: fact.id, value: fact.value })), followUp: null } };
  for (const text of ['단백질은 20그램이에요.', '체중은 65킬로그램이에요.', 'RIR은 2로 기록했어요.', '반복 여유는 2예요.', '기록 시간은 1시간이에요.']) {
    assert.doesNotThrow(() => Runtime.validateResult({ ...base, answer: text }, 'chat', context));
  }
  for (const text of ['단백질은 500그램을 먹으세요.', '체중은 ６６kg이에요.', 'RIR은 9로 하세요.', 'RIR: 2~4로 하세요.', '반복 여유는 5예요.', '운동은 2시간이에요.']) {
    assert.throws(() => Runtime.validateResult({ ...base, answer: text }, 'chat', context));
  }
});

test('saved programs cannot override current clinical or pain review and are not current recommendations', () => {
  const state = fixture();
  state.training = require('../src/training-store.js').createEmpty();
  const T = require('../src/training.js');
  const draft = T.recommendProgram(state.profile, state.training.settings, {});
  const saved = T.createProgram(draft, { id: 'saved', name: '합성 계획', createdAt: '2026-09-01T00:00:00.000Z' });
  state.training.planning.programs = [saved]; state.training.planning.activeProgramId = saved.id;
  state.profile.healthContext = 'clinical';
  const context = Runtime.summarizeState(state, '2026-10-05');
  assert.equal(context.program.status, 'review');
  assert.deepEqual(context.program.days, []);
  assert.equal(context.savedProgram.name, '합성 계획');
  assert.equal(context.savedProgram.applicability, 'review');
  assert.ok(!context.facts.some(fact => fact.id.startsWith('program.')));
  assert.match(Runtime.promptFor({ kind: 'chat', context }), /savedProgram.*ready가 아니면/);
  state.profile.healthContext = 'general';
  state.training.records = [{ ...denseWorkout('2026-10-05', 501), pain: 'stop' }];
  const stopped = Runtime.summarizeState(state, '2026-10-05');
  assert.equal(stopped.trainingAnalysis.recovery.status, 'stop');
  assert.equal(stopped.program.status, 'review');
  assert.equal(stopped.savedProgram.applicability, 'review');
  state.training.planning.programs[0].createdAt = '2026-10-06T12:00:00.000Z';
  assert.equal(Runtime.summarizeState(state, '2026-10-05').savedProgram, null);
});

test('older meal-note recall includes the matching wording without changing dates or original notes', () => {
  const state = fixture();
  for (let index = 1; index <= 23; index++) {
    const date = `2026-09-${String(index).padStart(2, '0')}`;
    state.days[date] = { ...structuredClone(state.days['2026-10-05']), date,
      meals: [{ id: `meal-${index}`, name: '합성 식사', note: index === 1 ? '유제품 뒤 소화 불편' : '', protein: 20, carbs: 30, fat: 10, otherKcal: 0, alcoholG: 0 }] };
  }
  const before = JSON.stringify(state);
  const context = Runtime.summarizeState(state, '2026-10-05', '유제품 소화');
  assert.equal(context.recall.days[0].date, '2026-09-01');
  assert.equal(context.recall.days[0].meals[0].note, '유제품 뒤 소화 불편');
  assert.equal(JSON.stringify(state), before);
});

function denseWorkout(date, index) {
  return { id: `record-${index}`, date, time: '18:30', label: `합성 훈련 ${index}`, durationMinutes: 70, reportedSetCount: 56,
    reportedVolumeKg: 12345, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: 7, pain: 'none',
    exercises: Array.from({ length: 7 }, (_, exerciseIndex) => ({ id: `exercise-${index}-${exerciseIndex}`, rawName: exerciseIndex === 6 ? '벤치프레스' : '합성 기구', exerciseId: null,
      equipmentKey: null, loadConvention: 'as-recorded', durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: exerciseIndex === 6 ? '벤치 중량 확인' : '',
      sets: Array.from({ length: 8 }, (_, setIndex) => ({ id: `set-${index}-${exerciseIndex}-${setIndex}`, loadKg: 40 + index, reps: 10 + setIndex, rir: 2, marker: null })) })) };
}
test('bounded workout samples preserve original counts, relevant blocks and complete volume aggregates', () => {
  const state = fixture(); state.training = require('../src/training-store.js').createEmpty();
  for (let index = 0; index < 16; index++) state.training.records.push(denseWorkout(require('../src/insights.js').shiftDate('2026-10-05', -index), index));
  state.training.records[0].source.uncertainties = ['머신 표시와 합산 여부 미확인'];
  state.training.records.push(denseWorkout('2026-10-06', 99));
  const context = Runtime.summarizeState(state, '2026-10-05', '벤치 중량');
  assert.equal(context.workoutIndex.length, 12);
  assert.equal(context.recentWorkouts.length, 4);
  assert.equal(context.recall.workouts.length, 3);
  assert.equal(context.trainingAnalysis.coverage.workingSets, 16 * 56);
  assert.equal(context.workoutIndex[0].originalSetCount, 56);
  assert.deepEqual(context.recentWorkouts[0].uncertainties, ['머신 표시와 합산 여부 미확인']);
  assert.equal(context.facts.find(fact => fact.id === 'packet.trainingSettings.sessionMinutes').value, 60);
  for (const record of [...context.recentWorkouts, ...context.recall.workouts]) {
    assert.ok(record.date <= context.date);
    assert.equal(record.originalExerciseCount, 7);
    assert.equal(record.originalSetCount, 56);
    assert.equal(record.sampled, true);
    assert.ok(record.exercises.length <= 6);
    assert.equal(record.exercises[0].rawName, '벤치프레스');
    assert.equal(record.exercises[0].sourceExercisePosition, 7);
    for (const exercise of record.exercises) { assert.ok(exercise.sets.length <= 6 && exercise.sets.length >= 1); assert.equal(exercise.originalSetCount, 8); assert.equal(exercise.sampled, true); }
  }
  assert.ok(Buffer.byteLength(Runtime.promptFor({ kind: 'chat', question: '벤치 중량', context }), 'utf8') < 256 * 1024);
  assert.equal(context.samplingReducedForBudget, true);
  const facts = new Map(context.facts.map(fact => [fact.id, fact]));
  function assertProjected(value, prefix = 'packet') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'facts') continue;
      const position = `${prefix}.${key}`;
      if (typeof child === 'number') assert.equal(facts.get(position)?.value, child, `missing citeable numeric field ${position}`);
      else if (child && typeof child === 'object') assertProjected(child, position);
    }
  }
  assertProjected(context);
  for (const prefix of ['packet.recentWorkouts.0.exercises.0.sets.0', 'packet.recall.workouts.0.exercises.0.sets.0']) {
    const load = facts.get(`${prefix}.loadKg`), reps = facts.get(`${prefix}.reps`), rir = facts.get(`${prefix}.rir`);
    const output = { ...answer(), answer: `${load.date} 기록에서 ${load.value}kg, ${reps.value}회, RIR은 ${rir.value}였어요.`,
      coaching: { claims: [load, reps, rir].map(fact => ({ factId: fact.id, value: fact.value })), followUp: null } };
    assert.doesNotThrow(() => Runtime.validateResult(output, 'chat', context));
  }
});

test('new runtime contract does not silently reuse pre-guard cached answers', t => {
  const h = harness(t), input = { kind: 'chat', question: 'cache boundary' };
  const oldId = Runtime.digest({ pipelineVersion: 3, input }).slice(0, 32);
  const folder = path.join(h.directory, 'jobs', oldId); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'job.json'), JSON.stringify({ id: oldId, kind: 'chat', status: 'completed', result: answer(), createdAt: '2026-10-01T00:00:00.000Z' }));
  const current = h.runtime.start(input);
  assert.notEqual(current.id, oldId);
  assert.equal(current.status, 'running'); assert.equal(h.calls.length, 1);
  assert.equal(h.runtime.get(oldId).status, 'completed');
  h.finish(answer());
});
