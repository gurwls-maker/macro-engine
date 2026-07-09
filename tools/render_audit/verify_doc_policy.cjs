const fs = require("fs");
const path = require("path");

const root = process.cwd();
const docsDir = path.join(root, "docs");

const failures = [];

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireFile(relativePath) {
  if (!exists(relativePath)) fail(`missing required file: ${relativePath}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const requiredFiles = [
  "docs/00_current_truth/00_READ_FIRST.txt",
  "docs/00_current_truth/02_macro_range_current_truth.txt",
  "docs/00_current_truth/04_document_status_index.txt",
  "docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt",
  "docs/00_current_truth/templates/new_doc_preamble.txt",
  "docs/archive/v8.2_macro_range/README.md",
  "docs/references/product/README.md",
  "docs/references/external/README.md",
  "docs/references/copy/README.md",
  "docs/references/historical/README.md",
  "docs/v8.3_target_scoring_alignment_incident_decision_2026-07-08.md",
  "docs/v8.3_target_scoring_alignment_implementation_2026-07-08.md",
  "docs/v8.3_target_scoring_alignment_qa_closeout_2026-07-08.md",
  "docs/v8.3_stabilization_tag_readiness_checkpoint_update_2026-07-09.md",
  "docs/v8.3_post_tag_release_closeout_2026-07-09.md",
  "docs/post_v8.3_backlog_triage_2026-07-09.md",
  "docs/v8.3.1_scoring_tuning_protocol_decision_2026-07-09.md",
  "docs/v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md",
  "docs/v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md",
  "docs/v8.3.1_scoring_tuning_curve_candidate_simulation_decision_2026-07-09.md",
  "docs/v8.3.1_user_facing_range_explanation_copy_decision_2026-07-09.md",
  "docs/v8.3.1_dailycoach_range_copy_naturalness_implementation_2026-07-09.md",
  "docs/v8.3.1_app_wide_user_facing_copy_inventory_decision_2026-07-09.md",
  "docs/v8.3.1_app_wide_copy_naturalness_batch_1_implementation_2026-07-09.md",
  "docs/lightweight_anti_inertia_routine_2026-07-09.md",
  "docs/README.md",
  "AGENTS.md",
];

for (const file of requiredFiles) requireFile(file);

const legacyRootDocs = [
  "docs/00_현재작업기준_2026-06-16.txt",
  "docs/02_대화의도_근거표_2026-06-16.txt",
  "docs/v8_외부근거_매크로_정책표_2026-06-05.txt",
  "docs/v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt",
  "docs/v8_운동여부_코드영향감사_2026-06-15.txt",
  "docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt",
  "docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt",
  "docs/앱-문구-기준.txt",
];

for (const file of legacyRootDocs) {
  if (exists(file)) fail(`legacy reference doc must live under docs/references, not root docs: ${file}`);
}

const routedReferenceFiles = [
  "docs/references/product/legacy_product_working_criteria_2026-06-16.txt",
  "docs/references/product/legacy_user_intent_ledger_2026-06-16.txt",
  "docs/references/product/tdee_time_ownership_design_2026-06-15.txt",
  "docs/references/product/exercise_mode_code_impact_audit_2026-06-15.txt",
  "docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt",
  "docs/references/external/acsm_resistance_training_guide_ko_2026.txt",
  "docs/references/copy/app_copy_guidelines.txt",
  "docs/references/historical/exercise_profile_formula_historical_map_2026-06-04.txt",
];

for (const file of routedReferenceFiles) requireFile(file);

if (exists("docs/00_current_truth/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt")) {
  fail("master plan source ledger must live under docs/00_current_truth/_source, not current_truth root");
}

if (failures.length === 0) {
  const readFirst = read("docs/00_current_truth/00_READ_FIRST.txt");
  const currentTruth = read("docs/00_current_truth/02_macro_range_current_truth.txt");
  const statusIndex = read("docs/00_current_truth/04_document_status_index.txt");
  const targetScoringIncident = read("docs/v8.3_target_scoring_alignment_incident_decision_2026-07-08.md");
  const targetScoringImplementation = read("docs/v8.3_target_scoring_alignment_implementation_2026-07-08.md");
  const targetScoringQaCloseout = read("docs/v8.3_target_scoring_alignment_qa_closeout_2026-07-08.md");
  const stabilizationTagReadinessUpdate = read("docs/v8.3_stabilization_tag_readiness_checkpoint_update_2026-07-09.md");
  const postTagReleaseCloseout = read("docs/v8.3_post_tag_release_closeout_2026-07-09.md");
  const postV83BacklogTriage = read("docs/post_v8.3_backlog_triage_2026-07-09.md");
  const scoringTuningProtocolDecision = read("docs/v8.3.1_scoring_tuning_protocol_decision_2026-07-09.md");
  const scoringTuningEvidencePack = read("docs/v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md");
  const scoringTuningObjectiveRubricDecision = read("docs/v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md");
  const scoringTuningCurveSimulationDecision = read("docs/v8.3.1_scoring_tuning_curve_candidate_simulation_decision_2026-07-09.md");
  const userFacingRangeCopyDecision = read("docs/v8.3.1_user_facing_range_explanation_copy_decision_2026-07-09.md");
  const dailyCoachRangeCopyNaturalnessImplementation = read("docs/v8.3.1_dailycoach_range_copy_naturalness_implementation_2026-07-09.md");
  const appWideCopyInventoryDecision = read("docs/v8.3.1_app_wide_user_facing_copy_inventory_decision_2026-07-09.md");
  const appWideCopyBatch1Implementation = read("docs/v8.3.1_app_wide_copy_naturalness_batch_1_implementation_2026-07-09.md");
  const lightweightAntiInertiaRoutine = read("docs/lightweight_anti_inertia_routine_2026-07-09.md");
  const sourceLedger = read("docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt");
  const preamble = read("docs/00_current_truth/templates/new_doc_preamble.txt");
  const v82ArchiveReadme = read("docs/archive/v8.2_macro_range/README.md");
  const readme = read("docs/README.md");
  const agents = read("AGENTS.md");
  const readmeHead = readme.slice(0, 2000);
  const readFirstImplementationBlocked = /v8\.3 implementation:\s*blocked/i.test(readFirst);
  const statusImplementationBlocked = /v8\.3 implementation:\s*blocked/i.test(statusIndex);
  const readFirstImplementationAccepted = /v8\.3 (?:continuous scoring )?implementation:\s*(accepted|active|implemented|closed)/i.test(readFirst);
  const statusImplementationAccepted = /v8\.3 (?:continuous scoring )?implementation:\s*(accepted|active|implemented|closed)/i.test(statusIndex);

  const requiredReadmeRoutes = [
    "00_current_truth/00_READ_FIRST.txt",
    "00_current_truth/02_macro_range_current_truth.txt",
    "00_current_truth/04_document_status_index.txt",
    "v8.2_macro_range_*",
    "archive/v8.2_macro_range/README.md",
  ];
  for (const route of requiredReadmeRoutes) {
    if (!readmeHead.includes(route)) fail(`README top routing missing: ${route}`);
  }

  const routedReferenceRoutingRequirements = [
    "docs/references/product/legacy_product_working_criteria_2026-06-16.txt",
    "docs/references/product/legacy_user_intent_ledger_2026-06-16.txt",
    "docs/references/product/tdee_time_ownership_design_2026-06-15.txt",
    "docs/references/product/exercise_mode_code_impact_audit_2026-06-15.txt",
    "docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt",
    "docs/references/external/acsm_resistance_training_guide_ko_2026.txt",
    "docs/references/copy/app_copy_guidelines.txt",
    "docs/references/historical/exercise_profile_formula_historical_map_2026-06-04.txt",
  ];

  for (const route of routedReferenceRoutingRequirements) {
    if (!readme.includes(route.replace(/^docs\//, "")) && !readme.includes(route)) {
      fail(`README missing routed legacy reference path: ${route}`);
    }
    if (!statusIndex.includes(route)) {
      fail(`status index missing routed legacy reference path: ${route}`);
    }
  }

  for (const legacyPath of legacyRootDocs) {
    if (readme.includes(legacyPath)) fail(`README still points at legacy root path: ${legacyPath}`);
    if (statusIndex.includes(legacyPath)) fail(`status index still points at legacy root path: ${legacyPath}`);
  }

  if (exists("index.html")) {
    const indexHtml = read("index.html");
    const oldExternalReferencePath = "docs/v8_외부근거_매크로_정책표_2026-06-05.txt";
    const newExternalReferencePath = "docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt";
    if (indexHtml.includes(oldExternalReferencePath)) {
      fail(`index.html still points at old external macro reference path: ${oldExternalReferencePath}`);
    }
    if (!indexHtml.includes(newExternalReferencePath)) {
      fail(`index.html missing routed external macro reference path: ${newExternalReferencePath}`);
    }
  }

  const sourceLedgerRequirements = [
    "current truth 본문이 아니라 source ledger",
    "00_READ_FIRST",
    "02_macro_range_current_truth",
    "04_document_status_index",
  ];
  for (const text of sourceLedgerRequirements) {
    if (!sourceLedger.includes(text)) fail(`source ledger NOTE missing: ${text}`);
  }

  const readFirstRequirements = [
    "MANDATORY PRE-READ",
    "REQUIRED_NEXT_GATES",
    "docs-policy preflight: active",
    "v8.3 target/scoring alignment incident: release-blocker",
    "v8.3 target/scoring alignment implementation: implemented",
    "v8.3 target/scoring alignment QA closeout: closed",
    "v8.3 stabilization/tag readiness checkpoint update: closed",
    "v8.3 merge/tag instruction: completed",
    "v8.3 post-tag release closeout: closed",
    "post-v8.3 backlog triage / v8.3.1 planning: corrected and closed",
    "v8.3.1 scoring tuning protocol decision: closed",
    "lightweight anti-inertia execution routine: closed",
    "v8.3.1 scoring tuning evidence pack: closed",
    "v8.3.1 scoring tuning objective rubric decision: closed",
    "v8.3.1 scoring tuning curve candidate simulation decision: closed",
    "v8.3.1 user-facing range explanation/copy decision: closed",
    "v8.3.1 DailyCoach/range copy naturalness implementation: implemented",
    "v8.3.1 app-wide user-facing copy naturalness inventory / decision: closed",
    "v8.3.1 app-wide copy naturalness batch 1 implementation: implemented",
    "continuous pressure limiter",
    "continuous_training_load_interpolation",
    "target/scoring alignment release blocker",
    "scoreDeltaPreview product path는 폐기",
    "exercise bonus",
    "v6.1 alcoholImpactPenalty",
  ];
  for (const text of readFirstRequirements) {
    if (!readFirst.includes(text)) fail(`00_READ_FIRST missing required policy text: ${text}`);
  }

  const currentTruthRequirements = [
    "v8.3 anchor-based continuous macro scoring",
    "finalRawScore",
    "targetEnergyDeviationPenalty",
    "tdeeOverloadPenalty",
    "carbExerciseContextPenalty",
    "alcoholPhysiologyPenalty",
    "hard-collapse 금지",
    "curve-mediated collapse 허용",
    "scoreDeltaPreview product path rejected",
    "v8.3.1 scoring tuning protocol decision",
    "scoring tuning evidence pack",
    "scoring tuning objective rubric decision",
    "scoring tuning curve candidate simulation decision",
    "objective score band",
    "curve candidate simulation decision",
    "current_curve_with_guarded_outputs",
    "user-facing range explanation/copy decision",
    "DailyCoach/range copy naturalness implementation",
    "app-wide user-facing copy naturalness inventory",
    "app-wide copy naturalness batch 1 implementation",
  ];
  for (const text of currentTruthRequirements) {
    if (!currentTruth.includes(text)) fail(`02_macro_range_current_truth missing: ${text}`);
  }

  const statusRequirements = [
    "REQUIRED_NEXT_GATES",
    "docs/archive/v8.2_macro_range/README.md",
    "SUPERSEDE",
    "HISTORICAL",
    "KEEP",
    "REVIEW",
    "기존 최상위/기준 문서 정합성 메모",
    "v8.3 target/scoring alignment incident",
    "release-blocker",
    "v8.3 target/scoring alignment implementation",
    "target/scoring alignment QA closeout",
    "v8.3 stabilization/tag readiness checkpoint update",
    "tag-ready candidate after checkpoint update",
    "v8.3 post-tag release closeout",
    "post-v8.3 backlog triage / v8.3.1 planning",
    "v8.3.1 scoring tuning protocol decision",
    "lightweight anti-inertia execution routine",
    "v8.3.1 scoring tuning evidence pack",
    "v8.3.1 scoring tuning objective rubric decision",
    "v8.3.1 scoring tuning curve candidate simulation decision",
    "v8.3.1 user-facing range explanation/copy decision",
    "v8.3.1 DailyCoach/range copy naturalness implementation",
    "v8.3.1 app-wide user-facing copy naturalness inventory / decision",
    "v8.3.1 app-wide copy naturalness batch 1 implementation",
    "current_curve_with_guarded_outputs",
    "continuous recency-weighted excess pressure",
    "automatic training load interpolation",
    "target/scoring alignment release-blocker 기준",
  ];
  for (const text of statusRequirements) {
    if (!statusIndex.includes(text)) fail(`04_document_status_index missing: ${text}`);
  }

  const staleReadinessPhrases = [
    "v8.3 stabilization/tag readiness checkpoint update: pending after target/scoring alignment QA closeout",
    "v8.3 merge/tag instruction: held until stabilization/tag readiness checkpoint update and user instruction",
    "v8.3 merge/tag instruction: held until explicit user instruction",
    "post-v8.3 backlog triage / v8.3.1 planning: next candidate",
    "v8.3.1 scoring tuning protocol decision: next candidate",
    "v8.3.1 scoring tuning user confirmation answers: next candidate",
    "v8.3.1 scoring tuning evidence pack / user confirmation: next candidate",
    "v8.3.1 user-facing range explanation/copy decision: next after scoring tuning user confirmation",
    "v8.3.1 user-facing range explanation/copy decision: next after scoring tuning evidence/user confirmation",
    "v8.3.1 user-facing range explanation/copy decision: next candidate",
    "v8.3.1 DailyCoach/range copy naturalness narrow implementation: next candidate",
    "다음 후보는 evidence pack / user confirmation",
  ];
  for (const text of staleReadinessPhrases) {
    if (readFirst.includes(text)) fail(`00_READ_FIRST still has stale readiness gate text: ${text}`);
    if (statusIndex.includes(text)) fail(`04_document_status_index still has stale readiness gate text: ${text}`);
  }

  const targetScoringIncidentRequirements = [
    "release_blocking_incident_decision",
    "score: 83.712",
    "target carbs: 594.9g",
    "target fat: 124.8g",
    "carbs range: 210g~525g",
    "fat range: 53g~94g",
    "App-target neutral invariant",
    "Display-scoring consistency invariant",
    "External-anchor-not-flat-permission invariant",
    "v8.3 target/scoring alignment implementation",
    "UI-only display cap은 폐기",
    "release blocker: yes",
  ];
  for (const text of targetScoringIncidentRequirements) {
    if (!targetScoringIncident.includes(text)) fail(`target/scoring incident decision missing: ${text}`);
  }

  const readmeIncidentRequirements = [
    "v8.3_target_scoring_alignment_incident_decision_2026-07-08.md",
    "v8.3_target_scoring_alignment_implementation_2026-07-08.md",
    "v8.3_target_scoring_alignment_qa_closeout_2026-07-08.md",
    "v8.3_stabilization_tag_readiness_checkpoint_update_2026-07-09.md",
    "v8.3_post_tag_release_closeout_2026-07-09.md",
    "post_v8.3_backlog_triage_2026-07-09.md",
    "v8.3.1_scoring_tuning_protocol_decision_2026-07-09.md",
    "v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md",
    "v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md",
    "lightweight_anti_inertia_routine_2026-07-09.md",
    "v8.3.1_dailycoach_range_copy_naturalness_implementation_2026-07-09.md",
    "v8.3.1_app_wide_user_facing_copy_inventory_decision_2026-07-09.md",
    "release blocker",
    "score `83.712`",
    "target/scoring alignment implementation",
    "target/scoring alignment QA closeout",
    "tag-ready candidate after checkpoint update",
    "annotated tag `v8.3`",
    "post-v8.3 deferred",
    "V8_3_1_CANDIDATE",
    "scoring tuning protocol decision",
    "scoring tuning evidence pack",
    "scoring tuning objective rubric",
    "curve candidate simulation decision",
    "user-facing range explanation/copy decision",
    "DailyCoach/range copy naturalness",
    "app-wide user-facing copy naturalness inventory",
  ];
  for (const text of readmeIncidentRequirements) {
    if (!readme.includes(text)) fail(`README missing target/scoring incident routing: ${text}`);
  }

  const targetScoringImplementationRequirements = [
    "implementation_log",
    "getV83TargetAlignedMacroRanges",
    "오늘 목표 자동 조정",
    "3일/7일 trend limiter",
    "high-volume carb anchor",
    "flat no-penalty permission",
    "target/scoring alignment QA closeout",
  ];
  for (const text of targetScoringImplementationRequirements) {
    if (!targetScoringImplementation.includes(text)) fail(`target/scoring implementation log missing: ${text}`);
  }

  const targetScoringQaCloseoutRequirements = [
    "QA closeout",
    "continuous_recency_weighted_excess",
    "3일/7일 count bucket limiter",
    "Today adaptive target",
    "targetEnergyDeviationPenalty",
    "tdeeOverloadPenalty",
    "Records `goalSnapshot`",
    "selected calculation target",
    "persistent setting surface",
    "continuous_training_load_interpolation",
    "stabilization/tag readiness checkpoint update",
  ];
  for (const text of targetScoringQaCloseoutRequirements) {
    if (!targetScoringQaCloseout.includes(text)) fail(`target/scoring QA closeout missing: ${text}`);
  }

  const stabilizationTagReadinessUpdateRequirements = [
    "docs-only stabilization/tag readiness checkpoint update",
    "GPT1/GPT2",
    "ca09860",
    "target/scoring alignment release blocker: closed",
    "persistent setting surface",
    "adaptiveMacroTargetsEnabled",
    "continuous_recency_weighted_excess",
    "continuous_training_load_interpolation",
    "tag-ready candidate after checkpoint update",
    "merge/tag instruction: still held until user instruction",
    "이 문서는 tag를 만들지 않는다",
    "이 문서는 merge를 실행하지 않는다",
    "이 문서는 push를 실행하지 않는다",
  ];
  for (const text of stabilizationTagReadinessUpdateRequirements) {
    if (!stabilizationTagReadinessUpdate.includes(text)) fail(`stabilization/tag readiness update missing: ${text}`);
  }

  const postTagReleaseCloseoutRequirements = [
    "docs-only post-tag release closeout",
    "source branch: codex/v8.3-stabilization-tag-readiness-checkpoint-update",
    "merge commit: 0333d9c",
    "tag name: v8.3",
    "tag type: annotated tag",
    "tag target commit: 0333d9c",
    "remote v8.3 peeled target: 0333d9c",
    "source branch tag 전 검증",
    "merge 후 master 검증",
    "anchor continuous macro scoring",
    "target/scoring alignment",
    "post-v8.3 deferred",
    "tag 재생성/이동 금지",
    "post-v8.3 backlog triage 또는 v8.3.1 planning",
  ];
  for (const text of postTagReleaseCloseoutRequirements) {
    if (!postTagReleaseCloseout.includes(text)) fail(`post-tag release closeout missing: ${text}`);
  }

  const postV83BacklogTriageRequirements = [
    "docs-only backlog triage",
    "v8.3.1 planning entry map",
    "V8_3_1_CANDIDATE",
    "RESEARCH_NEEDED",
    "BLOCKED_BY_DECISION",
    "LATER",
    "MONITOR_ONLY",
    "REJECT",
    "DailyCoach/copy rewrite or tone pass",
    "tooltip / glossary",
    "score distribution tuning beyond alignment",
    "carb upper / high-volume carb tuning",
    "kcal range display product UI",
    "alcohol range display",
    "UI/storage/schema expansion",
    "scoreDeltaPreview product path: REJECT",
    "legacy/dev records cleanup / reset / fallback decision",
    "package version policy",
    "adaptive target setting contract follow-up",
    "v8.3.1 scoring tuning protocol decision docs-only",
    "calorie target/source reliability audit",
  ];
  for (const text of postV83BacklogTriageRequirements) {
    if (!postV83BacklogTriage.includes(text)) fail(`post-v8.3 backlog triage missing: ${text}`);
  }

  const scoringTuningProtocolRequirements = [
    "docs-only protocol decision",
    "External anchor vs app policy coefficient",
    "Candidate decision matrix",
    "Required evidence pack",
    "User confirmation questions",
    "TDEE overload curve",
    "fat high curve",
    "carb high / high-volume context",
    "unknown training context carb",
    "adaptive target limiter",
    "alcohol physiology risk",
    "calorie target/source reliability",
    "old records cleanup/reset/fallback",
    "scoreDeltaPreview product path: REJECT",
    "kcal range display product UI remains rejected",
    "v8.3.1 scoring tuning evidence pack / user confirmation",
    "Numeric tuning is not opened",
  ];
  for (const text of scoringTuningProtocolRequirements) {
    if (!scoringTuningProtocolDecision.includes(text)) fail(`v8.3.1 scoring tuning protocol decision missing: ${text}`);
  }

  const scoringTuningEvidencePackRequirements = [
    "docs-only evidence pack",
    "Current output table",
    "TDEE12",
    "FAT1000",
    "CARB_HIGH_700",
    "ALC112",
    "Adaptive target current output",
    "Candidate classification",
    "USER_CONFIRMATION_NEEDED",
    "MORE_SAMPLES_NEEDED",
    "COPY_NOT_SCORE",
    "MONITOR_ONLY",
    "Next gate: objective rubric first, then curve candidate simulation.",
    "objective rubric readiness: yes",
    "not asking the user to pick exact point values",
    "numeric tuning readiness: not yet",
    "direct implementation readiness: no",
    "scoreDeltaPreview product path: REJECT",
    "kcal range display product UI remains rejected",
  ];
  for (const text of scoringTuningEvidencePackRequirements) {
    if (!scoringTuningEvidencePack.includes(text)) fail(`v8.3.1 scoring tuning evidence pack missing: ${text}`);
  }

  const scoringTuningObjectiveRubricRequirements = [
    "docs-only objective rubric decision",
    "Original intent preservation",
    "The user is not asking to pick exact score numbers.",
    "Codex must design the scoring curve and simulation method.",
    "external anchor -> physiological zone",
    "objective rubric -> app score band target",
    "aligned",
    "acceptable",
    "warning",
    "problem",
    "serious",
    "severe",
    "display collapse",
    "E01. TDEE overload",
    "E02. Fat excess",
    "E03. Carb upper / high-volume carb",
    "E06. Adaptive target limiter",
    "E07. Alcohol",
    "Forbidden:",
    "Pick the exact score for TDEE 1.2x",
    "v8.3.1 scoring tuning curve candidate simulation decision",
    "numeric tuning readiness: not yet",
    "direct implementation readiness: no",
    "scoreDeltaPreview product path remains rejected",
    "kcal range display product UI remains rejected",
  ];
  for (const text of scoringTuningObjectiveRubricRequirements) {
    if (!scoringTuningObjectiveRubricDecision.includes(text)) fail(`v8.3.1 scoring tuning objective rubric decision missing: ${text}`);
  }

  const scoringTuningCurveSimulationRequirements = [
    "docs-only curve candidate simulation decision",
    "PROMPT_SCOPE_AUDIT",
    "current smoothstep anchor interpolation",
    "Current output vs objective band",
    "TDEE 1.05x",
    "fat upper 2.00x with added kcal",
    "700g carb with added calories",
    "current_curve_with_guarded_outputs",
    "No immediate numeric tuning is justified.",
    "numeric tuning readiness: no",
    "score formula implementation readiness: no",
    "anchor value change readiness: no",
    "curve steepness change readiness: no",
    "adaptive limiter change readiness: no",
    "v8.3.1 user-facing range explanation/copy decision",
    "hard-collapse score tuning",
    "permissive high-volume tuning",
    "scoreDeltaPreview product path",
    "kcal range display product UI",
  ];
  for (const text of scoringTuningCurveSimulationRequirements) {
    if (!scoringTuningCurveSimulationDecision.includes(text)) {
      fail(`v8.3.1 scoring tuning curve candidate simulation decision missing: ${text}`);
    }
  }

  const userFacingRangeCopyRequirements = [
    "docs-only user-facing explanation / copy decision",
    "PROMPT_SCOPE_AUDIT",
    "Original intent preservation",
    "Today card stays compact.",
    "DailyCoach owns interpretation and next action.",
    "Tooltip/glossary requires a small spec before implementation.",
    "Copy tests must protect meaning, not awkward legacy wording.",
    "Surface responsibility model",
    "U01. Today macro card explanation boundary",
    "U02. DailyCoach explanation boundary",
    "U03. Tooltip / glossary policy",
    "U04. Technical term policy",
    "U05. Alcohol / training tone",
    "U06. Source visibility copy",
    "U07. Copy test expectation policy",
    "U08. Implementation gate",
    "회복 재료",
    "글리코겐",
    "test-expectation-update-needed",
    "next gate: v8.3.1 DailyCoach/range copy naturalness narrow implementation",
    "numeric tuning readiness: no",
    "score formula implementation readiness: no",
  ];
  for (const text of userFacingRangeCopyRequirements) {
    if (!userFacingRangeCopyDecision.includes(text)) {
      fail(`v8.3.1 user-facing range explanation/copy decision missing: ${text}`);
    }
  }

  const dailyCoachRangeCopyNaturalnessImplementationRequirements = [
    "v8.3.1 DailyCoach/range copy naturalness implementation",
    "PROMPT_SCOPE_AUDIT",
    "complete the full relevant DailyCoach/range/source-adjacent copy pass",
    "Replaced DailyCoach production wording",
    "회복 재료",
    "회복재료",
    "성장 재료",
    "Tests must protect meaning, not awkward legacy wording.",
    "app-wide line-by-line copy audit",
    "app-wide user-facing copy naturalness inventory / decision",
    "screen / area",
    "exact current text",
    "test fossilization",
    "score anchors",
    "scoreDeltaPreview",
  ];
  for (const text of dailyCoachRangeCopyNaturalnessImplementationRequirements) {
    if (!dailyCoachRangeCopyNaturalnessImplementation.includes(text)) {
      fail(`v8.3.1 DailyCoach/range copy naturalness implementation missing: ${text}`);
    }
  }

  const appWideCopyInventoryDecisionRequirements = [
    "docs-only app-wide user-facing copy inventory / decision",
    "PROMPT_SCOPE_AUDIT",
    "Original intent preservation",
    "Minimal surface vs complete copy inventory decision",
    "Today macro card / range-adjacent copy",
    "Today score/source visibility notes",
    "Settings / 오늘 목표 자동 조정",
    "Backup / Restore / Smart Restore",
    "InBody / measurement / body composition coach",
    "Alerts / validation / empty-state / error messages",
    "OVER_EXPLAINED",
    "UI_REDUNDANT",
    "UI context is part of meaning.",
    "Replacement copy should be shorter or equal length by default.",
    "surface",
    "exact current text",
    "TEST_LOCKED_BAD_COPY",
    "COPY_FIX_NEXT",
    "TEST_EXPECTATION_UPDATE_NEXT",
    "COPY_SPEC_NEEDED",
    "TOOLTIP_GLOSSARY_CANDIDATE",
    "체지방 쪽 변화",
    "회복을 위해 기본 재료는 필요합니다.",
    "v8.3.1 app-wide copy naturalness batch 1 implementation",
    "Tests must protect meaning, not awkward legacy wording.",
    "scoreDeltaPreview readiness: rejected as product path",
    "score formula implementation readiness: no",
  ];
  for (const text of appWideCopyInventoryDecisionRequirements) {
    if (!appWideCopyInventoryDecision.includes(text)) {
      fail(`v8.3.1 app-wide user-facing copy inventory decision missing: ${text}`);
    }
  }

  const appWideCopyBatch1ImplementationRequirements = [
    "v8.3.1 app-wide copy naturalness batch 1 implementation",
    "PROMPT_SCOPE_AUDIT",
    "narrow user-facing copy implementation",
    "A04 Today target extreme note",
    "B01/B02 Today score/source visibility notes",
    "C01/C02 DailyCoach leftover",
    "D03 low-digest setting copy",
    "E03 backup warning tone",
    "G02 InBody",
    "G04 InBody help tone",
    "H01/H02 validation spacing/tone",
    "I02 Settings hero",
    "목표가 높아 탄단지는 무리 없는 g으로 잡았습니다.",
    "오늘 소비 칼로리 기준이 없어, 먹은 양과 목표 차이를 중심으로 봅니다.",
    "회복하려면 단백질과 먹기 쉬운 탄수화물은 필요합니다.",
    "체지방 변화가 더 큽니다.",
    "Tests must protect meaning, not awkward legacy wording.",
    "score formula / numeric tuning implementation",
    "tooltip/glossary implementation without spec",
    "scoreDeltaPreview product path",
  ];
  for (const text of appWideCopyBatch1ImplementationRequirements) {
    if (!appWideCopyBatch1Implementation.includes(text)) {
      fail(`v8.3.1 app-wide copy naturalness batch 1 implementation missing: ${text}`);
    }
  }

  const copyGuidelines = read("docs/references/copy/app_copy_guidelines.txt");
  const copyGuidelineOverExplanationRequirements = [
    "UI가 이미 말하는 내용은 문장으로 다시 설명하지 않는다.",
    "짧은 라벨, 숫자, 단위, 카드 위치만으로 충분히 알 수 있으면 설명을 줄인다.",
    "전문 설명은 기본 화면 본문이 아니라 ? 도움말, tooltip, glossary, 설정 상세처럼 설명을 읽으려는 위치로 보낸다.",
    "과잉 설명 금지",
    "설명이 필요한 경우:",
    "데이터가 사라질 수 있는 경우",
    "사용자가 잘못된 action을 할 수 있는 경우",
    "점수/출처/측정 신뢰도를 오해할 수 있는 경우",
  ];
  for (const text of copyGuidelineOverExplanationRequirements) {
    if (!copyGuidelines.includes(text)) {
      fail(`copy guidelines missing over-explanation rule: ${text}`);
    }
  }

  const lightweightAntiInertiaRequirements = [
    "docs-only lightweight process guard",
    "One-minute PROMPT_SCOPE_AUDIT",
    "Minimal surface vs complete scope",
    "Anti-loop rules",
    "Stale-routine / supersede rules",
    "Result-log template",
    "Most audits belong in the result log",
    "must not create another anti-inertia task",
    "Do not enter review-the-review loops",
    "Do not treat this checklist as permanent law",
    "v8.3.1 scoring tuning curve candidate simulation decision",
  ];
  for (const text of lightweightAntiInertiaRequirements) {
    if (!lightweightAntiInertiaRoutine.includes(text)) fail(`lightweight anti-inertia routine missing: ${text}`);
  }

  if (!readFirstImplementationBlocked && !readFirstImplementationAccepted) {
    fail("00_READ_FIRST missing v8.3 implementation gate state");
  }
  if (!statusImplementationBlocked && !statusImplementationAccepted) {
    fail("04_document_status_index missing v8.3 implementation gate state");
  }

  const preambleRequirements = [
    "MANDATORY PRE-READ",
    "READ RESULT",
    "DOCUMENT ROLE",
    "FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION",
  ];
  for (const text of preambleRequirements) {
    if (!preamble.includes(text)) fail(`new_doc_preamble missing: ${text}`);
  }

  const agentsRequirements = [
    "docs/00_current_truth/00_READ_FIRST.txt",
    "docs/00_current_truth/02_macro_range_current_truth.txt",
    "docs/00_current_truth/04_document_status_index.txt",
    "docs/archive/v8.2_macro_range/",
    "v8.3 scoring implementation은 현재 `v8.3_anchor_continuous_macro_score_v1`로 구현된 상태",
    "v6.1 alcoholImpactPenalty",
    "PROMPT_SCOPE_AUDIT",
    "Do not assume the prompt is the correct next step",
    "minimal surface",
    "complete scope",
    "recursive meta-work",
    "Most audits belong in the result log",
  ];
  for (const text of agentsRequirements) {
    if (!agents.includes(text)) fail(`AGENTS.md missing: ${text}`);
  }

  const allDocs = walk(docsDir);
  const rootV82Docs = fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^v8\.2_macro_range_.*\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (rootV82Docs.length) {
    fail(`v8.2 macro range docs must live under docs/archive/v8.2_macro_range, found root docs: ${rootV82Docs.join(", ")}`);
  }

  const v82ArchiveDir = path.join(docsDir, "archive", "v8.2_macro_range");
  const archivedV82Docs = fs
    .readdirSync(v82ArchiveDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^v8\.2_macro_range_.*\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (archivedV82Docs.length < 65) {
    fail(`expected at least 65 archived v8.2 macro range docs, found ${archivedV82Docs.length}`);
  }

  const archiveReadmeRequirements = [
    "historical archive",
    "docs/00_current_truth/00_READ_FIRST.txt",
    "docs/00_current_truth/04_document_status_index.txt",
    "fixed `high = -10`, `severe = -16`",
    "scoreDeltaPreview",
    "root `docs/`에 새 `v8.2_macro_range_*.md` 문서가 생기면 docs-policy 실패",
  ];
  for (const text of archiveReadmeRequirements) {
    if (!v82ArchiveReadme.includes(text)) fail(`v8.2 archive README missing: ${text}`);
  }

  const v82Docs = allDocs
    .filter((file) => /^v8\.2_macro_range_.*\.md$/.test(path.basename(file)))
    .map((file) => path.basename(file))
    .sort();

  if (v82Docs.length < 65) {
    fail(`expected at least 65 v8.2 macro range docs to be indexed during transition, found ${v82Docs.length}`);
  }

  for (const name of v82Docs) {
    if (!statusIndex.includes(name)) fail(`v8.2 doc missing from status index: ${name}`);
  }
  for (const name of archivedV82Docs) {
    const archivePath = `docs/archive/v8.2_macro_range/${name}`;
    if (!statusIndex.includes(archivePath)) fail(`archived v8.2 doc path missing from status index: ${archivePath}`);
  }

  const v83Docs = allDocs.filter((file) => {
    const name = path.basename(file);
    const normalized = rel(file);
    if (!/^v8\.3(?:\.1)?_.*\.(md|txt)$/.test(name)) return false;
    if (normalized.includes("docs/00_current_truth/_source/")) return false;
    if (normalized.includes("docs/00_current_truth/templates/")) return false;
    if (normalized.includes("docs/archive/")) return false;
    return true;
  });

  for (const file of v83Docs) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("MANDATORY PRE-READ")) {
      fail(`v8.3 document missing mandatory pre-read block: ${rel(file)}`);
    }
  }

  function lineInfo(text, index) {
    const lines = text.split(/\n/);
    let runningIndex = 0;
    let lineNumber = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const nextIndex = runningIndex + lines[i].length + 1;
      if (index < nextIndex) {
        lineNumber = i;
        break;
      }
      runningIndex = nextIndex;
    }

    return {
      line: lines[lineNumber] || "",
      lineNumber,
      lines,
    };
  }

  function isSameLineNegative(line) {
    return /(금지|폐기|아님|아니라|않|허용하지|쓰면 안|사용 금지|재개 금지|본류 아님|부활 금지|금지선|거부|차단|not|no\b|must not|do not|without|forbidden|ban|banned|supersede|historical|legacy|deprecated|reject|rejected|failure condition|block|blocked|optional audit-only)/i.test(line);
  }

  function hasNearbySectionHeader(lines, lineNumber, pattern) {
    for (let i = lineNumber - 1, distance = 0; i >= 0 && distance < 12; i -= 1, distance += 1) {
      const line = lines[i] || "";
      if (!line.trim()) continue;
      if (/^#{1,6}\s/.test(line)) return false;
      if (pattern.test(line)) return true;
    }
    return false;
  }

  function isForbiddenPreambleLine(lines, lineNumber) {
    return hasNearbySectionHeader(lines, lineNumber, /FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION/i);
  }

  function isNegativeSectionBullet(lines, lineNumber, line) {
    if (!/^\s*-\s+/.test(line)) return false;
    return hasNearbySectionHeader(
      lines,
      lineNumber,
      /^(실패 조건|폐기|금지선|FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION|.*하지 않는다\.?)\s*:?\s*$/i
    );
  }

  function isAllowedForbiddenMention(text, index) {
    const { line, lineNumber, lines } = lineInfo(text, index);
    return isSameLineNegative(line) || isForbiddenPreambleLine(lines, lineNumber) || isNegativeSectionBullet(lines, lineNumber, line);
  }

  function hasForbiddenUse(text, pattern) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const index = match.index || 0;
      if (!isAllowedForbiddenMention(text, index)) {
        return true;
      }
    }
    return false;
  }

  const forbiddenChecks = [
    {
      pattern: /high\s*=\s*-10/gi,
      message: "fixed high = -10 penalty must not return as v8.3 production formula",
    },
    {
      pattern: /severe\s*=\s*-16/gi,
      message: "fixed severe = -16 penalty must not return as v8.3 production formula",
    },
    {
      pattern: /fixed penalty\s+production\s+body/gi,
      message: "fixed penalty table must not be the production body",
    },
    {
      pattern: /score cap[^\n]{0,80}(allowed|production|허용|정책|쓴다|사용한다|적용)/gi,
      message: "intermediate score cap must not be allowed as v8.3 production policy",
    },
    {
      pattern: /hard zero threshold[^\n]{0,80}(primary policy|production|허용|정책|쓴다|사용한다|적용)/gi,
      message: "hard zero threshold must not become the primary v8.3 scoring policy",
    },
    {
      pattern: /exercise bonus[^\n]{0,80}(appl|allowed|true|yes|허용|적용|사용|finalScore)/gi,
      message: "exercise bonus must not be allowed",
    },
    {
      pattern: /운동\s*보너스[^\n]{0,80}(허용|적용|사용|finalScore|최종 점수)/gi,
      message: "운동 보너스 must not be allowed",
    },
    {
      pattern: /v6\.1\s+alcoholImpactPenalty[^\n]{0,100}(restore|reuse|부활|재사용|되살린다|사용한다|후처리)/gi,
      message: "v6.1 alcoholImpactPenalty post-score subtraction must not be revived",
    },
    {
      pattern: /alcoholImpactPenalty[^\n]{0,80}(restore|reuse)/gi,
      message: "alcoholImpactPenalty post-score subtraction must not be restored",
    },
    {
      pattern: /scoreDeltaPreview[^\n]{0,80}(mainline|본류|재개|허용|allowed)/gi,
      message: "scoreDeltaPreview must not be revived as mainline",
    },
  ];

  const policyDocsToCheck = v83Docs.map((file) => [rel(file), fs.readFileSync(file, "utf8")]);

  for (const [file, text] of policyDocsToCheck) {
    for (const check of forbiddenChecks) {
      if (hasForbiddenUse(text, check.pattern)) fail(`${check.message}: ${file}`);
    }
  }

  const implementationGatePending = readFirstImplementationBlocked || statusImplementationBlocked;

  if (implementationGatePending && exists("index.html")) {
    const indexHtml = read("index.html");
    const implementationSignals = [
      {
        label: "v8.3 ADHERENCE_SCORING_VERSION signal",
        patterns: [/v8\.3/i, /ADHERENCE_SCORING_VERSION/],
      },
      {
        label: "v8.3 macro scoring signal",
        patterns: [/v8\.3/i, /macro scoring/i],
      },
      {
        label: "anchor-based continuous scoring implementation signal",
        patterns: [/anchor-based continuous/i, /scoring implementation/i],
      },
      {
        label: "v8.3 anchor-based continuous macro scoring identifier",
        patterns: [/v8\.3_anchor_based_continuous_macro_scoring/i],
      },
    ];

    for (const signal of implementationSignals) {
      if (signal.patterns.every((pattern) => pattern.test(indexHtml))) {
        fail(`v8.3 implementation appears before REQUIRED_NEXT_GATES are closed: ${signal.label}`);
      }
    }
  }
}

if (failures.length) {
  console.error("docs-policy failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("docs-policy passed");
