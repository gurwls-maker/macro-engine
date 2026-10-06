"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const Fixtures = require("../tests/fixtures/coaching-scenarios.cjs");
const S = require("../src/storage.js");
const N = require("../src/nutrition.js");
const T = require("../src/training.js");
const C = require("../src/coach.js");
const Decision = require("../src/coach-context.js");
const Runtime = require("./coach-runtime.cjs");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_FILES = ["src/storage.js", "src/nutrition.js", "src/training.js", "src/training-capacity.js", "src/training-coaching.js",
  "src/insights.js", "src/training-store.js", "src/activity-coaching.js", "src/coach.js", "src/coach-context.js", "src/coach-query.js",
  "tools/coach-runtime.cjs", "tools/audit-coaching-scenarios.cjs", "tests/fixtures/coaching-scenarios.cjs"];
const NEUTRAL_QUESTION = "최근 기록을 보고 다음 운동과 식사에서 무엇을 유지하고 무엇을 바꾸면 좋을까?";
function digest(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function sources() { return Object.fromEntries(SOURCE_FILES.filter(file => fs.existsSync(path.join(ROOT, file))).map(file => [file, digest(fs.readFileSync(path.join(ROOT, file)))])); }
function sentences(text) { return String(text || "").split(/(?<=[.!?])\s+|\n+/u).map(value => value.trim()).filter(Boolean); }
function sourceRef(value) {
  if (!value || typeof value !== "object") return null;
  return { kind: value.kind || null, date: value.date || null, sessionId: value.sessionId || value.id || null, blockId: value.blockId || null,
    setIds: Array.isArray(value.setIds) ? value.setIds.slice() : [] };
}
function sentenceAudit(text, facts = [], refs = [], action = null, tags = [], basis = "product-interpretation") {
  return sentences(text).map(sentence => {
    const quantities = [...sentence.matchAll(/(-?\d+(?:\.\d+)?)\s*(kg|kcal|g|km\/h|km|m|W|bpm|분|시간|회|세트|%)/gi)].map(match => ({ value: Number(match[1]), unit: match[2], written: match[0] }));
    return { text: sentence, basis, linkedSources: refs.map(sourceRef).filter(Boolean),
      quantitySourceCandidates: quantities.map(quantity => ({ ...quantity, candidates: facts.filter(fact => fact.value === quantity.value && fact.unit === quantity.unit).slice(0, 12).map(fact => ({
        id: fact.id, date: fact.date, source: fact.source, estimated: fact.estimated, unit: fact.unit })) })),
      action: action ? { kind: action.kind, focusSetIds: action.focusSetIds || [], proposal: action.proposal || null } : null,
      purposeTags: tags, requiresHumanReview: true,
      note: "문장 생성 경로와 수치 출처 후보이며 인과관계·개인 처방의 타당성을 검증했다는 뜻은 아님." };
  });
}
function reviews(state, date) {
  const analysis = T.analyze(state.training.records, { date, mappings: state.training.mappings, checkins: state.days });
  if (!analysis.lastSession) return { analysis, review: null };
  const options = { sessionId: analysis.lastSession.id, preferences: state.training.reviewPreferences, profile: state.profile,
    planning: state.training.planning, days: Object.values(state.days) };
  const review = T.coachSession(analysis, options);
  const reordered = T.coachSession(analysis, { ...options, preferences: { ...state.training.reviewPreferences, order: "diary" } });
  const actions = rows => Object.fromEntries(rows.map(row => [row.blockId, { kind: row.interpretation.nextAction.kind, body: row.interpretation.nextAction.body }]));
  assert.deepEqual(actions(review.rows), actions(reordered.rows), "display order changed substantive coaching actions");
  return { analysis, review };
}
function activityAnalysis(state, date) {
  const filename = path.join(ROOT, "src/activity-coaching.js");
  if (!fs.existsSync(filename)) return { status: "not-implemented", current: [], summary: "활동별 코칭 모듈이 아직 구현되지 않음." };
  return require(filename).build(state, date);
}
function sectionsFor(coach, review, activity, checkpoint, facts) {
  const sections = [];
  for (const priority of coach.priorities || []) sections.push({ surface: "app-coach", label: priority.title, text: priority.body,
    sentences: sentenceAudit(priority.body, facts, [], null, checkpoint.focusTags) });
  for (const question of coach.questions || []) sections.push({ surface: "app-coach-faq", label: question.label, questionId: question.id,
    text: question.answer, sentences: sentenceAudit(question.answer, facts, [], null, checkpoint.focusTags) });
  if (review?.sessionCoaching) sections.push({ surface: "session-summary", label: "전체 세션", text: review.sessionCoaching.summary,
    sentences: sentenceAudit(review.sessionCoaching.summary, facts, [], null, checkpoint.focusTags) });
  for (const row of review?.rows || []) {
    const result = row.interpretation.coaching, refs = [result.facts?.current?.source, result.facts?.previous?.source, ...(result.signals || []).flatMap(signal => signal.sourceRefs || [])].filter(Boolean);
    const parts = [{ label: "해석", text: result.assessment || "", action: null },
      { label: "다음 행동", text: row.interpretation.nextAction.body, action: row.interpretation.nextAction },
      ...(result.supportingActions || []).map(action => ({ label: "보조 행동", text: action.body, action }))];
    for (const part of parts.filter(value => value.text)) sections.push({ surface: "exercise-review", blockId: row.blockId, label: `${row.rawName || row.label}: ${part.label}`,
      text: part.text, sentences: sentenceAudit(part.text, facts, refs, part.action, checkpoint.focusTags, part.action ? "product-choice" : "product-interpretation") });
  }
  if (activity.summary) sections.push({ surface: "activity-summary", label: "활동 전체", text: activity.summary,
    sentences: sentenceAudit(activity.summary, facts, [], null, checkpoint.focusTags) });
  for (const connection of activity.connections || []) sections.push({ surface: "cross-domain", label: connection.title,
    text: connection.body, kind: connection.kind, observations: connection.observations, sources: connection.sources,
    sentences: sentenceAudit(connection.body, facts, connection.sources || [], { kind: connection.kind }, checkpoint.focusTags, connection.basis || "product-choice") });
  for (const row of [...(activity.current || []), ...(activity.latest || [])]) for (const part of [
    { label: "해석", text: row.assessment, action: null }, { label: "다음 행동", text: row.action?.body, action: row.action },
    ...(row.alternatives || []).map(action => ({ label: "대안", text: action.body, action }))
  ].filter(value => value.text)) sections.push({ surface: "activity-review", activityId: row.id, actualDate: row.date,
    temporalScope: row.date === checkpoint.date ? "selected-day" : "last-recorded-activity", label: `${row.label || row.sport}: ${part.label}`, text: part.text,
    sentences: sentenceAudit(part.text, facts, row.sources || [], part.action, checkpoint.focusTags, part.action ? "product-choice" : "product-interpretation") });
  return sections;
}
function checkMeaning(state, checkpoint, output, context) {
  const findings = [], add = (id, message, severity = "error") => findings.push({ id, severity, message });
  const text = output.sections.map(section => section.text).join("\n"), day = state.days[checkpoint.date], tags = checkpoint.focusTags;
  if (/과훈련(?:입니다|이다|이 확실)|근성장(?:률|량).{0,12}(?:확정|입니다)|지방.{0,6}(?:늘었|줄었).{0,6}확실/.test(text)) add("clinical-or-growth-certainty", "임상·성장량을 확정하는 문장 후보가 있음. 사람이 원문을 확인해야 함.");
  if (day?.meals.length && !day.complete && output.coach.context.dayAssessmentAvailable === true) add("partial-meal-as-whole-day", "부분 식사를 완료한 하루로 판정함.");
  const sets = output.analysis.sessions.flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
  const rawSets = state.training.records.flatMap(record => record.exercises.flatMap(exercise => exercise.sets));
  if (rawSets.every(set => set.rir === null) && sets.some(set => set.rir !== null)) add("invented-rir", "세트 RIR이 없는 기록에서 숫자 RIR이 생성됨.");
  const proposals = context.trainingProposals || [];
  const nativeProgression = output.review?.rows.some(row => ["progression-option", "reps-option", "load-option"].includes(row.interpretation.nextAction.kind));
  if ((day?.coachCheckin?.pain === "stop" || tags.includes("pain-stop")) && (nativeProgression || proposals.some(proposal => proposal.scope === "current-option"))) add("progression-with-stop-pain", "중단 수준 통증인데 현재 증량·반복 증가 제안이 남음.");
  if (state.profile === null && output.coach.context.planSource !== "saved-target" && output.coach.context.targetKcal != null) add("no-profile-new-target", "프로필 없이 새 영양 목표를 생성함.");
  const recorded = Object.values(state.days).flatMap(day => day.sessions);
  const activityRows = [...(output.activity.current || []), ...(output.activity.latest || [])];
  if (recorded.some(session => session.sport !== "strength") && !activityRows.length) add("no-sport-coaching", "근력 외 실제 활동이 있지만 활동별 의미와 다음 행동이 없음.");
  if (activityRows.some(row => !row.action?.body)) add("empty-sport-action", "활동별 해석에 구체적인 다음 행동이 없음.");
  for (const row of activityRows) {
    const baseline = row.comparison?.observations?.find(observation => observation.kind === "working-episode")?.baseline;
    const actual = row.actual;
    if (baseline && actual?.distanceM > 0 && baseline.distanceM > 0 && actual.movingMin > 0 && baseline.movingMin > 0 &&
      actual.distanceM < baseline.distanceM * 0.9 && actual.movingMin < baseline.movingMin * 0.9 &&
      [row.action, ...(row.alternatives || [])].some(action => action.kind === "sustain-new-performance"))
      add("shorter-work-promoted-to-performance", "거리·이동시간이 함께 줄었는데 짧은 구간의 빠른 평균을 전체 수행 향상으로 제시함.");
    if (["mixed", "team"].includes(row.sport) && tags.includes("unexpected-decline") &&
      baseline?.durationMin > 0 && actual?.durationMin <= baseline.durationMin * 0.8 &&
      ["hybrid-task", "hybrid-segment-review", "practice-task"].includes(row.action?.kind) &&
      !/줄인|줄어|낮춘|짧아|짧게|줄었/.test(row.action.body || ""))
      add("segment-task-erased-whole-reduction", "전체 작업 감소가 이어지지만 구간 과제만 남겨 현재 낮춘 부담의 다음 선택이 사라짐.");
  }
  if ((output.activity.current || []).some(row => row.date !== checkpoint.date)) add("past-activity-as-current", "과거 활동을 선택일 실제 수행으로 옮겨 표시함.");
  if ((output.activity.latest || []).some(row => row.date >= checkpoint.date || !state.days[row.date]?.sessions.some(session => session.id === row.id))) add("invented-latest-activity", "마지막 활동의 날짜·ID가 실제 과거 기록과 일치하지 않음.");
  const futureObserved = (context.facts || []).filter(fact => fact.date > checkpoint.date && fact.estimated === false && !/(?:planning|schedule|followUp|reviewDate)/.test(fact.id));
  if (futureObserved.length) add("future-observation-leak", `snapshot 이후 실제 관찰 출처가 전달됨: ${futureObserved[0].id}`);
  const expectedBlocks = context.trainingCoaching?.coverage?.coveredBlockIds || [];
  const interpretedBlocks = new Set((context.trainingCoaching?.exerciseContexts || []).map(row => row.blockId));
  const missingInterpretations = expectedBlocks.filter(id => !interpretedBlocks.has(id));
  if (missingInterpretations.length) add("training-interpretation-coverage-reduced", `실제 상담에 현재 운동 ${expectedBlocks.length}개 중 ${missingInterpretations.length}개의 수행 해석·행동 맥락이 전달되지 않음: ${missingInterpretations.join(", ")}`);
  if (tags.includes("intentional-deload") && checkpoint.week === 3 && output.review?.rows.some(row => ["progression-option", "reps-option", "load-option"].includes(row.interpretation.nextAction.kind))) add("progression-during-planned-deload", "의도한 디로드에서 즉시 진행을 주 행동으로 제시함.");
  if (tags.includes("same-fast-performance") || tags.includes("unrecorded-gap") || tags.includes("illness-active") || tags.includes("volume-surge")) add("context-needs-semantic-read", "같은 숫자·누락·건강·용량 맥락의 해석과 행동 차이를 사람이 직접 읽어야 함.", "review");
  return findings;
}
function evaluateFrame(scenario, checkpoint, options = {}) {
  if (options.neutralQuestion) checkpoint = { ...checkpoint, originalQuestion: checkpoint.question, question: NEUTRAL_QUESTION, questionMode: "neutral" };
  else checkpoint = { ...checkpoint, questionMode: "scenario-specific" };
  const state = Fixtures.asOf(scenario, checkpoint.date, options), before = structuredClone(state);
  const { analysis, review } = reviews(state, checkpoint.date), activity = activityAnalysis(state, checkpoint.date);
  const decision = Decision.build(state, checkpoint.date, { question: checkpoint.question });
  const day = state.days[checkpoint.date] || { date: checkpoint.date, meals: [], sessions: [], complete: false };
  const coach = C.buildCoach(state.profile, day, Object.values(state.days).filter(item => item.date < checkpoint.date), {
    state, decisionContext: decision, question: checkpoint.question, trainingAnalysis: analysis, training: state.training });
  let context, contextError = null;
  try { context = Runtime.summarizeState(state, checkpoint.date, checkpoint.question); }
  catch (error) { contextError = { message: error.message, stack: error.stack }; context = { facts: C.buildFacts(coach, day), trainingProposals: [] }; }
  const output = { checkpoint: structuredClone(checkpoint), inputDigest: digest(state),
    coverage: { first: scenario.start, through: checkpoint.date, recordedDayCount: Object.keys(state.days).length,
      rawWorkoutCount: state.training.records.length, rawActivityCount: Object.values(state.days).reduce((sum, day) => sum + day.sessions.length, 0),
      blankDaysAreUnknown: true, originalScenarioEnd: scenario.end,
      explicitCheckpointReports: (scenario.checkpointReports || []).filter(report => report.date <= checkpoint.date) },
    coach, analysis, review, activity, decision,
    sections: sectionsFor(coach, review, activity, checkpoint, context.facts || []),
    sourceFacts: context.facts || [], sourceKinds: { actual: "reported/saved", hypotheses: "product-interpretation", proposedActions: "product-choice", modelValues: "estimated" },
    contextStatus: contextError ? "failed" : "ready", contextError,
    live: { status: "not-requested" }, semanticReview: { status: "unreviewed", expected: checkpoint.requiredMeaning }, findings: [] };
  output.findings = checkMeaning(state, checkpoint, output, context);
  if (contextError) output.findings.push({ id: "packet-build-failed", severity: "error", message: contextError.message });
  assert.deepEqual(state, before, "scenario evaluation mutated saved observations");
  return { output, context };
}
function counterfactualComparisons(scenarios, results) {
  const groups = new Map();
  for (const scenario of scenarios) for (const group of scenario.counterfactualGroups || []) {
    if (!groups.has(group)) groups.set(group, []); groups.get(group).push(scenario.id);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).flatMap(([group, ids]) => [2, 3, 4].map(week => {
    const rows = ids.flatMap(id => results.find(row => row.id === id)?.frames.filter(frame => frame.checkpoint.week === week) || []);
    const meanings = rows.map(frame => ({ checkpointId: frame.checkpoint.id, actions: [
      ...(frame.review?.rows || []).map(row => ({ id: row.exerciseId, kind: row.interpretation.nextAction.kind, body: row.interpretation.nextAction.body })),
      ...[...(frame.activity.current || []), ...(frame.activity.latest || [])].map(row => ({ id: row.sport, actualDate: row.date, kind: row.action?.kind, body: row.action?.body }))],
      text: frame.sections.map(section => section.text).join("\n") }));
    return { group, week, scenarioIds: ids, status: meanings.length < 2 ? "not-executed" : new Set(meanings.map(value => value.text)).size === 1 ? "identical-output-needs-review" : "different-output-needs-review",
      note: "말투만 달라진 것과 실제 행동이 달라진 것을 사람이 구분해야 함.", meanings };
  }));
}
function markdown(report) {
  const lines = ["# 월간 합성 코칭 감사", "", `생성: ${report.generatedAt}`, "합성 자료만 사용. 수치·출처 자동 검사는 문장의 의학적 타당성이나 개인 처방을 인증하지 않는다.",
    `시나리오 ${report.scenarioCatalog.length}개 중 실행 ${report.results.length}개 / 프레임 ${report.results.reduce((sum, row) => sum + row.frames.length, 0)}개.`,
    `오류 ${report.summary.errors}개 / 의미 재독 항목 ${report.summary.reviewItems}개 / 실제 AI 완료 ${report.summary.liveCompleted}개.`, "", "## 검증 목록", ""];
  for (const requirement of report.requirements) lines.push(`- ${requirement.id}: ${requirement.tags.join(", ")}`);
  for (const result of report.results) {
    lines.push("", `## ${result.id}`, result.label, `초기 기준 그룹: ${result.baselineGroup}`);
    for (const frame of result.frames) {
      lines.push("", `### ${frame.checkpoint.week}주차 / ${frame.checkpoint.date}`, `질문: ${frame.checkpoint.question}`,
        `기록: 운동 일지 ${frame.coverage.rawWorkoutCount}개 · 활동 ${frame.coverage.rawActivityCount}개 · 기록 날짜 ${frame.coverage.recordedDayCount}개. 빈 날짜는 모름.`);
      if (frame.checkpoint.originalQuestion) lines.push(`질문 경로: 넓은 일반 질문. 시나리오 의도를 질문에 넣지 않았음. 원래 비교 질문: ${frame.checkpoint.originalQuestion}`);
      for (const finding of frame.findings) lines.push(`- [${finding.severity}] ${finding.id}: ${finding.message}`);
      for (const section of frame.sections) {
        lines.push("", `[${section.surface}] ${section.label}`, section.text);
        for (const sentence of section.sentences) lines.push(`  문장 출처: ${sentence.linkedSources.map(source => `${source.date || "?"}/${source.sessionId || "?"}/${source.blockId || "?"}`).join("; ") || "직접 연결 출처 없음, JSON의 수치 후보·맥락을 확인"}`);
      }
      if (frame.live.status === "completed") lines.push("", "실제 Codex 답변:", frame.live.result.answer, `추가 질문: ${frame.live.result.questions.join(" / ") || "없음"}`);
      else if (frame.live.status !== "not-requested") lines.push(`실제 Codex 상태: ${frame.live.status} / ${frame.live.error || "선택 실행 범위 밖"}`);
      lines.push("의미 검토: 아직 사람이 확인해야 함. 자동 숫자 검사 통과를 코칭 품질 통과로 취급하지 않음.");
    }
  }
  lines.push("", "## 동일 수행 맥락 반례", "");
  for (const pair of report.counterfactuals) lines.push(`- ${pair.group} / ${pair.week}주: ${pair.status} (${pair.scenarioIds.join(", ")})`);
  return lines.join("\n") + "\n";
}
function semanticReading(report, sourceReport) {
  const groups = new Map();
  const frames = report.results.flatMap(scenario => scenario.frames.map(frame => ({
    scenarioId: scenario.id, family: scenario.family, checkpoint: frame.checkpoint, inputDigest: frame.inputDigest,
    coverage: frame.coverage, findings: frame.findings, contextStatus: frame.contextStatus,
    sections: frame.sections.map(section => {
      const reference = { scenarioId: scenario.id, week: frame.checkpoint.week, date: frame.checkpoint.date,
        label: section.label, surface: section.surface, questionId: section.questionId || null, blockId: section.blockId || null, activityId: section.activityId || null,
        actualDate: section.actualDate || null };
      const key = `${section.surface}\n${section.text}`;
      if (!groups.has(key)) groups.set(key, { id: `text-${groups.size}`, surface: section.surface, text: section.text, references: [], sources: [] });
      const group = groups.get(key); group.references.push(reference);
      const sourceKeys = new Set(group.sources.map(source => JSON.stringify(source)));
      for (const sentence of section.sentences || []) for (const source of sentence.linkedSources || []) {
        const sourceKey = JSON.stringify(source);
        if (!sourceKeys.has(sourceKey)) { sourceKeys.add(sourceKey); group.sources.push(source); }
      }
      return { ...reference, textId: group.id, text: section.text };
    })
  })));
  return { syntheticOnly: true, generatedAt: report.generatedAt, options: report.options,
    note: "모든 실행 프레임의 본문을 보존한 읽기 자료. 정확히 동일한 본문만 참조 묶음으로 통합했으며 자동 의미 통과나 검토 완료 표시는 아님. 원문 분석·수치 후보는 sourceReport에 보존.",
    sourceReport, sources: report.sources, sourceChangedDuringRun: report.sourceChangedDuringRun, summary: report.summary,
    frames, distinctTexts: [...groups.values()] };
}
function writeReportJson(filename, report) {
  const handle = fs.openSync(filename, "w");
  try {
    fs.writeFileSync(handle, "{\n", "utf8");
    const entries = Object.entries(report);
    for (let index = 0; index < entries.length; index++) {
      const [key, value] = entries[index];
      fs.writeFileSync(handle, `  ${JSON.stringify(key)}: `, "utf8");
      // Monthly reports can exceed Node's single-string limit while each scenario remains small.
      if (key === "results") {
        fs.writeFileSync(handle, "[\n", "utf8");
        value.forEach((scenario, scenarioIndex) => fs.writeFileSync(handle, `${JSON.stringify(scenario, null, 2)}${scenarioIndex < value.length - 1 ? "," : ""}\n`, "utf8"));
        fs.writeFileSync(handle, "]", "utf8");
      } else fs.writeFileSync(handle, JSON.stringify(value, null, 2), "utf8");
      fs.writeFileSync(handle, `${index < entries.length - 1 ? "," : ""}\n`, "utf8");
    }
    fs.writeFileSync(handle, "}\n", "utf8");
  } finally { fs.closeSync(handle); }
}
function cliOptions(argv) {
  const value = key => argv.find(item => item.startsWith(`--${key}=`))?.slice(key.length + 3);
  const maxLive = value("max-live") === undefined ? 8 : Number(value("max-live"));
  if (!Number.isInteger(maxLive) || maxLive < 0) throw new Error("--max-live는 0 이상의 정수여야 합니다.");
  const suite = value("suite") || "all", checkpoint = value("checkpoint") || (argv.includes("--live") ? "final" : "all");
  if (!["all", "core", "catalog"].includes(suite) || !["all", "final", "week2", "week3", "week4"].includes(checkpoint)) throw new Error("합성 감사 suite/checkpoint 선택값을 확인해 주세요.");
  return { suite, checkpoint, richActivity: !argv.includes("--legacy-activity"), live: argv.includes("--live"), maxLive,
    scenario: value("scenario"), refresh: argv.includes("--refresh"), includeContext: argv.includes("--include-context"), neutralQuestion: argv.includes("--neutral-question") };
}
async function run(options = {}) {
  options = { suite: "all", checkpoint: "all", richActivity: true, live: false, maxLive: 8, neutralQuestion: false, ...options };
  const all = Fixtures.buildScenarios({ ...options, suite: options.suite || "all" }), chosen = options.scenario ? all.filter(scenario => options.scenario.split(",").includes(scenario.id)) : all;
  if (options.scenario && !chosen.length) throw new Error("요청한 합성 시나리오를 찾지 못했습니다.");
  const beforeSources = sources(), generatedAt = new Date().toISOString(), directory = path.join(ROOT, "tests", "artifacts", "coaching-scenarios", `${generatedAt.replace(/[:.]/g, "-")}-${digest(options).slice(0, 8)}`);
  fs.mkdirSync(directory, { recursive: true });
  const report = { version: 1, generatedAt, syntheticOnly: true, options, requirements: Fixtures.REQUIREMENT_CATALOG,
    schemaLimitations: Fixtures.SCHEMA_LIMITS, sources: beforeSources, scenarioCatalog: all.map(scenario => ({ id: scenario.id, family: scenario.family, baselineGroup: scenario.baselineGroup,
      requirementIds: scenario.requirementIds || [], catalogExerciseId: scenario.catalogExerciseId || null, counterfactualGroups: scenario.counterfactualGroups || [] })),
    results: [], counterfactuals: [], summary: { errors: 0, reviewItems: 0, liveCompleted: 0, liveFailed: 0 }, sourceChangedDuringRun: false };
  const runtime = options.live ? new Runtime.CoachRuntime(path.join(directory, "live")) : null;
  let calls = 0, frameCount = 0;
  const save = () => {
    report.counterfactuals = counterfactualComparisons(chosen, report.results);
    report.summary.errors = report.results.flatMap(row => row.frames).reduce((sum, frame) => sum + frame.findings.filter(finding => finding.severity === "error").length, 0);
    report.summary.reviewItems = report.results.flatMap(row => row.frames).reduce((sum, frame) => sum + frame.findings.filter(finding => finding.severity === "review").length, 0);
    writeReportJson(path.join(directory, "report.json"), report);
    fs.writeFileSync(path.join(directory, "report.md"), markdown(report), "utf8");
  };
  try {
    for (const scenario of chosen) {
      const result = { id: scenario.id, family: scenario.family, label: scenario.label, baselineGroup: scenario.baselineGroup, frames: [] }; report.results.push(result);
      const checkpoints = scenario.checkpoints.filter(checkpoint => !options.checkpoint || options.checkpoint === "all" || options.checkpoint === "final" && checkpoint.week === 4 || options.checkpoint === `week${checkpoint.week}`);
      for (const checkpoint of checkpoints) {
        console.log(`Scenario ${scenario.id} / week ${checkpoint.week}`);
        const { output, context } = evaluateFrame(scenario, checkpoint, options); result.frames.push(output);
        if (options.includeContext) output.context = context;
        if (runtime && output.contextStatus === "failed") output.live = { status: "not-executed-context-failure", error: output.contextError.message };
        else if (runtime && calls < options.maxLive) {
          calls++; const job = runtime.start({ kind: "chat", question: output.checkpoint.question, context }, null, options.refresh);
          output.live = { status: "running", jobId: job.id }; save();
          while (runtime.get(job.id).status === "running") await new Promise(resolve => setTimeout(resolve, 1000));
          const jobResult = runtime.get(job.id);
          output.live = { status: jobResult.status, jobId: job.id, error: jobResult.error || null, result: jobResult.result || null,
            sentenceAudit: jobResult.result ? sentenceAudit(jobResult.result.answer, context.facts, [], null, checkpoint.focusTags, "codex-generated-interpretation") : [] };
          if (jobResult.status === "completed") { report.summary.liveCompleted++; console.log(jobResult.result.answer); }
          else { report.summary.liveFailed++; output.findings.push({ id: "live-coach-failed", severity: "error", message: jobResult.error || "실행 실패" }); }
        } else if (runtime) output.live = { status: "not-executed-budget" };
        frameCount++;
        if (runtime || frameCount % 50 === 0) save();
      }
    }
  } finally {
    if (runtime) runtime.close();
    report.sourceChangedDuringRun = digest(beforeSources) !== digest(sources());
    if (report.sourceChangedDuringRun) report.summary.sourceWarning = "실행 중 소스가 바뀌어 단일 버전의 최종 검증으로 사용할 수 없음. 동결 뒤 재실행 필요.";
    save();
    fs.writeFileSync(path.join(directory, "semantic-reading.json"), JSON.stringify(semanticReading(report, path.join(directory, "report.json")), null, 2), "utf8");
  }
  console.log(`Synthetic monthly coaching report: ${directory}`);
  console.log(JSON.stringify(report.summary));
  return { directory, report };
}

if (require.main === module) run(cliOptions(process.argv.slice(2))).then(({ report }) => {
  if (report.summary.errors || report.summary.liveFailed || report.sourceChangedDuringRun) process.exitCode = 1;
}).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { sentenceAudit, checkMeaning, evaluateFrame, counterfactualComparisons, markdown, semanticReading, writeReportJson, cliOptions, run };
