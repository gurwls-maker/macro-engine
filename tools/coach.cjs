"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual: equal } = require("node:util");
const S = require("../src/storage.js");
const D = require("./diary.cjs");
const { digest, summarizeState } = require("./coach-runtime.cjs");

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const DEFAULT_DATA = path.resolve(__dirname, "../user-data/coach");
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fail(message, code) { throw Object.assign(new Error(message), code ? { code } : {}); }
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function readJson(file) {
  if (fs.statSync(file).size > MAX_INPUT_BYTES) fail("입력 파일은 15MB 이하의 JSON이어야 합니다.");
  return D.readJson(file);
}
function readState(data) {
  const file = path.join(path.resolve(data), "app-state.json");
  if (!fs.existsSync(file)) fail("PC 저장 파일이 없습니다. 앱에서 PC 저장을 먼저 연결해 주세요.", "ENOENT");
  const state = S.validateState(readJson(file));
  return { state, digest: digest(state), file };
}
function context(data = DEFAULT_DATA, date = localDate()) {
  if (!S.isValidDate(date)) fail("코칭 기준 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.");
  const saved = readState(data);
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - 20 * 86400000).toISOString().slice(0, 10);
  const summary = summarizeState(saved.state, date);
  const messages = (saved.state.training?.messages || []).filter(message => message.createdAt.slice(0, 10) <= date);
  return {
    schemaVersion: 1, expectedDigest: saved.digest, stateFile: saved.file, date, from,
    context: {
      ...summary,
      recentDays: summary.recentDays.filter(day => day.date >= from),
      recentWorkouts: summary.recentWorkouts.filter(record => record.date >= from),
      conversation: messages.slice(-12),
      pendingMessages: messages.filter(message => message.role === "user" && message.status === "pending"),
      contextScope: `영양 기록은 ${from}부터 ${date}까지 21일, 훈련 집계는 최근 28일, 일지 원문은 21일 안의 최근 12개, 대화는 기준일 이하 마지막 12개와 미답변 질문 전체입니다.`
    },
    warnings: ["이미지나 외부 일지 폴더를 읽거나 스캔하지 않았습니다.", "프로필은 현재 저장값입니다. 완료일의 목표는 당시 savedPlan을 사용하며 미기록 날짜는 휴식이나 0섭취가 아닙니다."]
  };
}
function parseProposal(raw) {
  if (!plain(raw) || Object.keys(raw).length !== 3 || !["schemaVersion", "expectedDigest", "state"].every(key => own(raw, key))) fail("제안에는 schemaVersion, expectedDigest, state만 있어야 합니다.");
  if (raw.schemaVersion !== 1) fail("지원하지 않는 제안 버전입니다.");
  if (typeof raw.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedDigest)) fail("제안에는 context에서 확인한 expectedDigest가 필요합니다.");
  return { schemaVersion: 1, expectedDigest: raw.expectedDigest, state: S.validateState(raw.state) };
}
function retained(before, after, label) {
  const ids = new Set(after.map(item => item.id));
  if (before.some(item => !ids.has(item.id))) fail(`${label} 삭제는 제안 적용으로 할 수 없습니다. 앱에서 해당 기록을 직접 확인해 주세요.`);
}
function preserveHistory(before, after) {
  if (before.profile !== null && after.profile === null) fail("기존 프로필 전체 삭제는 허용하지 않습니다.");
  if (!equal(before.legacy, after.legacy)) fail("이전 버전 원본 보관함은 제안으로 변경할 수 없습니다.");
  for (const [date, previous] of Object.entries(before.days)) {
    const next = after.days[date];
    if (!next) fail(`${date} 날짜 삭제는 제안으로 할 수 없습니다.`);
    if (previous.complete && !equal(previous, next)) fail(`${date} 완료한 날의 기록은 변경할 수 없습니다. 앱에서 날짜를 다시 연 뒤 수정해 주세요.`);
    retained(previous.meals, next.meals, `${date} 식사`);
    retained(previous.sessions, next.sessions, `${date} 운동`);
  }
  if (before.training) {
    if (!after.training) fail("기존 운동 일지와 코치 기억을 제거할 수 없습니다.");
    retained(before.training.records, after.training.records, "운동 일지");
    retained(before.training.messages, after.training.messages, "코치 대화");
    const messages = new Map(after.training.messages.map(message => [message.id, message]));
    for (const message of before.training.messages) {
      const next = messages.get(message.id);
      const { status: oldStatus, ...oldContent } = message;
      const { status: newStatus, ...newContent } = next;
      if (!equal(oldContent, newContent) || (oldStatus === "answered" && newStatus !== "answered")) fail("기존 대화 내용과 답변 이력은 변경할 수 없습니다. 새 메시지로 보완해 주세요.");
    }
    const records = new Map(after.training.records.map(record => [record.id, record]));
    for (const record of before.training.records) {
      const next = records.get(record.id);
      retained(record.exercises, next.exercises, `${record.date} 운동 블록`);
      const exercises = new Map(next.exercises.map(exercise => [exercise.id, exercise]));
      for (const exercise of record.exercises) retained(exercise.sets, exercises.get(exercise.id).sets, `${record.date} 세트`);
    }
  }
}
function changedFields(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key => !equal(before?.[key], after?.[key])).sort();
}
function listChanges(before, after) {
  const existing = new Map(before.map(item => [item.id, item]));
  return after.flatMap(item => {
    const old = existing.get(item.id);
    if (old && equal(old, item)) return [];
    return [{ id: item.id, action: old ? "updated" : "added", fields: changedFields(old, item), label: item.name || item.label || item.text?.slice(0, 120) || null, before: old || null, after: item }];
  });
}
function preview(before, after) {
  const days = Object.entries(after.days).filter(([date, value]) => !equal(before.days[date], value)).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
    date, action: before.days[date] ? "updated" : "added", fields: changedFields(before.days[date], value),
    values: Object.fromEntries(changedFields(before.days[date], value).filter(key => !["meals", "sessions"].includes(key)).map(key => [key, { before: before.days[date]?.[key] ?? null, after: value[key] ?? null }])),
    meals: listChanges(before.days[date]?.meals || [], value.meals), sessions: listChanges(before.days[date]?.sessions || [], value.sessions)
  }));
  return {
    profile: { changed: !equal(before.profile, after.profile), fields: changedFields(before.profile, after.profile), before: before.profile, after: after.profile },
    days,
    training: {
      records: listChanges(before.training?.records || [], after.training?.records || []),
      messages: listChanges(before.training?.messages || [], after.training?.messages || []),
      mappingsChanged: !equal(before.training?.mappings, after.training?.mappings),
      settingsChanged: !equal(before.training?.settings, after.training?.settings)
    },
    completedSnapshotsPreserved: Object.values(before.days).filter(day => day.complete).length,
    changed: !equal(before, after)
  };
}
function propose(data, proposalFile, apply = false) {
  if (typeof apply !== "boolean") fail("적용 여부는 명시적인 --apply로만 지정해 주세요.");
  const proposal = parseProposal(readJson(path.resolve(proposalFile)));
  const inspect = () => {
    const current = readState(data);
    if (proposal.expectedDigest !== current.digest) fail("PC 기록이 제안 작성 후 바뀌었습니다. context를 다시 읽고 변경 내용을 합쳐 주세요.", "CONFLICT");
    preserveHistory(current.state, proposal.state);
    const changes = preview(current.state, proposal.state);
    if (apply && changes.changed) D.atomicJson(current.file, proposal.state);
    return {
      schemaVersion: 1, mode: apply ? "apply" : "preview", applied: apply && changes.changed,
      expectedDigest: current.digest, proposedDigest: digest(proposal.state), changes,
      warnings: ["제안 파일은 서명된 명령이 아닙니다. 변경 내용과 근거를 확인한 경우에만 --apply로 적용하세요.", "적용 후 브라우저에 예전 기록이 남아 있으면 PC 저장 내용을 확인해 복원하세요. 자동으로 브라우저 기록을 바꾸지 않습니다."]
    };
  };
  if (!apply) return inspect();
  try { return D.locked(path.resolve(data), inspect); }
  catch (error) { if (error.code === "EEXIST") fail("다른 기록 저장 작업이 진행 중입니다. 종료 후 다시 확인해 주세요.", "CONFLICT"); throw error; }
}
function cli(argv) {
  const [command, ...args] = argv;
  if (!["context", "propose"].includes(command)) fail("사용법: coach.cjs context [--date YYYY-MM-DD] [--data 폴더] | propose --file 제안.json [--apply] [--data 폴더]");
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    const allowed = command === "context" ? ["--data", "--date"] : ["--data", "--file", "--apply"];
    if (!allowed.includes(key) || own(options, key)) fail(`알 수 없거나 중복된 옵션: ${key}`);
    if (key === "--apply") { options[key] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) fail(`${key} 값이 필요합니다.`);
    options[key] = value;
  }
  const data = path.resolve(options["--data"] || DEFAULT_DATA);
  if (command === "context") return context(data, options["--date"] || localDate());
  if (!options["--file"]) fail("제안 JSON 파일을 --file로 지정해 주세요.");
  return propose(data, options["--file"], options["--apply"] === true);
}
module.exports = { MAX_INPUT_BYTES, readState, context, parseProposal, preserveHistory, preview, propose, cli };
if (require.main === module) {
  try { console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(`Coach: ${error.message}`); process.exitCode = 1; }
}
