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
  "docs/00_current_truth/05_required_result_log_format.txt",
  "docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt",
  "docs/00_current_truth/templates/new_doc_preamble.txt",
  "docs/archive/v8.2_macro_range/README.md",
  "docs/archive/onboarding/README.md",
  "docs/archive/onboarding/v8.2_onboarding_start_flow_note_2026-07-03.md",
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
  "docs/v8.3.1_carb_fat_exchange_range_consistency_audit_design_2026-07-10.md",
  "docs/v8.3.1_carb_fat_exchange_joint_allocation_model_decision_2026-07-10.md",
  "docs/v8.3.1_carb_fat_joint_allocation_model_implementation_2026-07-10.md",
  "docs/v8.3.1_carb_fat_joint_allocation_model_qa_closeout_2026-07-10.md",
  "docs/v8.3.1_stabilization_readiness_checkpoint_update_2026-07-10.md",
  "docs/v8.3.1_macro_card_adaptive_off_and_protein_target_level_implementation_2026-07-10.md",
  "docs/v8.3.1_onboarding_first_run_flow_decision_2026-07-10.md",
  "docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md",
  "docs/v8.3.1_today_score_guidance_surface_ownership_inventory_decision_2026-07-11.md",
  "docs/v8.3.1_today_score_card_semantic_ownership_cleanup_implementation_2026-07-11.md",
  "docs/v8.3.1_adaptive_target_stable_help_implementation_2026-07-11.md",
  "docs/component_score_architecture_simulation_decision_2026-07-11.md",
  "docs/v8.4_component_score_architecture_falsification_decision_2026-07-11.md",
  "docs/v8.3.1_target_scoring_authoritative_reference_correction_implementation_2026-07-12.md",
  "docs/v8.4_option_c_joint_residual_exact_formula_simulation_2026-07-12.md",
  "tools/render_audit/simulate_component_score_architecture.cjs",
  "package.json",
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
  "docs/v8.2_onboarding_start_flow_note_2026-07-03.md",
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
  const resultLogFormat = read("docs/00_current_truth/05_required_result_log_format.txt");
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
  const carbFatExchangeRangeConsistencyAuditDesign = read("docs/v8.3.1_carb_fat_exchange_range_consistency_audit_design_2026-07-10.md");
  const carbFatExchangeJointAllocationModelDecision = read("docs/v8.3.1_carb_fat_exchange_joint_allocation_model_decision_2026-07-10.md");
  const v831StabilizationReadinessCheckpointUpdate = read("docs/v8.3.1_stabilization_readiness_checkpoint_update_2026-07-10.md");
  const macroCardAdaptiveOffProteinTargetImplementation = read("docs/v8.3.1_macro_card_adaptive_off_and_protein_target_level_implementation_2026-07-10.md");
  const onboardingFirstRunFlowDecision = read("docs/v8.3.1_onboarding_first_run_flow_decision_2026-07-10.md");
  const onboardingFirstRunFlowImplementation = read("docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md");
  const todayScoreGuidanceOwnershipDecision = read("docs/v8.3.1_today_score_guidance_surface_ownership_inventory_decision_2026-07-11.md");
  const todayScoreOwnershipCleanupImplementation = read("docs/v8.3.1_today_score_card_semantic_ownership_cleanup_implementation_2026-07-11.md");
  const adaptiveTargetStableHelpImplementation = read("docs/v8.3.1_adaptive_target_stable_help_implementation_2026-07-11.md");
  const componentScoreArchitectureSimulationDecision = read("docs/component_score_architecture_simulation_decision_2026-07-11.md");
  const componentScoreArchitectureFalsificationDecision = read("docs/v8.4_component_score_architecture_falsification_decision_2026-07-11.md");
  const targetScoringAuthorityCorrectionImplementation = read("docs/v8.3.1_target_scoring_authoritative_reference_correction_implementation_2026-07-12.md");
  const optionCJointResidualSimulationDecision = read("docs/v8.4_option_c_joint_residual_exact_formula_simulation_2026-07-12.md");
  const componentScoreArchitectureSimulationTool = read("tools/render_audit/simulate_component_score_architecture.cjs");
  const packageJson = JSON.parse(read("package.json"));
  const onboardingArchiveReadme = read("docs/archive/onboarding/README.md");
  const onboardingHistoricalNote = read("docs/archive/onboarding/v8.2_onboarding_start_flow_note_2026-07-03.md");
  const lightweightAntiInertiaRoutine = read("docs/lightweight_anti_inertia_routine_2026-07-09.md");
  const sourceLedger = read("docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt");
  const preamble = read("docs/00_current_truth/templates/new_doc_preamble.txt");
  const v82ArchiveReadme = read("docs/archive/v8.2_macro_range/README.md");
  const readme = read("docs/README.md");
  const agents = read("AGENTS.md");
  const internalTestRunner = read("tools/render_audit/run_internal_tests.cjs");
  const readmeHead = readme.slice(0, 2000);
  const readFirstImplementationBlocked = /v8\.3 implementation:\s*blocked/i.test(readFirst);
  const statusImplementationBlocked = /v8\.3 implementation:\s*blocked/i.test(statusIndex);
  const readFirstImplementationAccepted = /v8\.3 (?:continuous scoring )?implementation:\s*(accepted|active|implemented|closed)/i.test(readFirst);
  const statusImplementationAccepted = /v8\.3 (?:continuous scoring )?implementation:\s*(accepted|active|implemented|closed)/i.test(statusIndex);

  const requiredReadmeRoutes = [
    "00_current_truth/00_READ_FIRST.txt",
    "00_current_truth/02_macro_range_current_truth.txt",
    "00_current_truth/04_document_status_index.txt",
    "00_current_truth/05_required_result_log_format.txt",
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
    if (indexHtml.includes("PROTEIN_TARGET_LEVEL_POLICIES")) {
      fail("protein target levels must not revive a separate goal-only policy table");
    }
    if (indexHtml.includes("applyProteinTargetLevelToFinalMacros")) {
      fail("protein target levels must not overwrite final macros after external policy application");
    }
    if (indexHtml.includes('<option value="default">기본</option>')) {
      fail("protein target selector must not expose duplicate default and medium choices");
    }
    for (const signal of [
      "buildExternalMacroProteinTargetLevelSelection",
      "runProteinTargetLevelPolicyIntegrationTests",
      "genericFfmExceptionApplied: false",
      "proteinTargetLevelContext: externalMacroActiveProductionApplication.proteinTargetLevelContext",
      'const PROTEIN_TARGET_LEVELS = Object.freeze(["low", "medium", "high"])',
      'if (value === "default") return "medium"',
      'proteinTargetLevel: "medium"',
      'id="proteinTargetLevelHelpTip"',
    ]) {
      if (!indexHtml.includes(signal)) fail(`index.html missing protein target policy integration signal: ${signal}`);
    }
    for (const signal of [
      "const ONBOARDING_VERSION = 1",
      'const ONBOARDING_STORAGE_KEY = "onboardingCompletedVersion"',
      'const BODY_COMPOSITION_CONFIRMED_STORAGE_KEY = "bodyCompositionConfirmed"',
      'FRESH: "fresh"',
      'COMPLETED: "completed"',
      'EXISTING_PROFILE_CONFIRMED: "existing_profile_confirmed"',
      'EXISTING_DATA_PROFILE_UNCONFIRMED: "existing_data_profile_unconfirmed"',
      "function classifyOnboardingEvidence(",
      "function getOnboardingCompletionState(",
      "function shouldShowFirstRunSetup(",
      "function completeFirstRunSetup(",
      "function runOnboardingFirstRunFlowTests(",
      "function getOnboardingCompletionOwnershipMode(",
      "function captureOnboardingCompletionOwnershipSnapshot(",
      "completionOwnershipSnapshot",
      "onboarding Settings re-entry submit preserves non-onboarding ownership",
      "onboarding existing-data confirmation preserves user-owned Settings and Today data",
      "onboarding incomplete full restore rebases ownership snapshot to restored backup",
      "onboarding completed full restore clears stale ownership snapshot",
      "smart-restore record-add should keep the existing Settings/Today ownership snapshot",
      "if (shouldShowFirstRunSetup()) return;",
      "if (shouldShowFirstRunSetup() && !onboardingUiState.reentry)",
    ]) {
      if (!indexHtml.includes(signal)) fail(`index.html missing onboarding truthfulness signal: ${signal}`);
    }
    const restoreStart = indexHtml.indexOf("function restoreFullBackupData(data){");
    const restoreEnd = indexHtml.indexOf("\n    function confirmDataManagementImport", restoreStart);
    if (restoreStart < 0 || restoreEnd < 0) {
      fail("index.html missing full-backup restore boundary for onboarding snapshot policy");
    } else {
      const restoreBody = indexHtml.slice(restoreStart, restoreEnd);
      const settingsAppliedAt = restoreBody.indexOf("Object.assign(state, settings");
      const snapshotClearedAt = restoreBody.indexOf("onboardingUiState.completionOwnershipSnapshot = null;");
      const incompletePreparedAt = restoreBody.indexOf("prepareIncompleteOnboardingState();");
      if (!(settingsAppliedAt >= 0 && snapshotClearedAt > settingsAppliedAt && incompletePreparedAt > snapshotClearedAt)) {
        fail("full-backup restore must clear stale onboarding ownership after applying B and before incomplete B recapture");
      }
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
    "v8.3.1 carb-fat exchange range consistency audit/design: closed",
    "v8.3.1 carb-fat exchange joint allocation model decision/design: closed",
    "v8.3.1 carb-fat joint allocation model implementation: implemented",
    "v8.3.1 carb-fat joint allocation model QA closeout: closed",
    "v8.3.1 stabilization/readiness checkpoint update: closed",
    "v8.3.1 macro card adaptive OFF and protein target level implementation: implemented",
    "v8.3.1 onboarding completion ownership hotfix: implemented",
    "v8.3.1 adaptive-target stable help implementation: implemented",
    "v8.4 component-score architecture falsification decision: closed",
    "narrow target/scoring authoritative-reference correction decision/implementation: implemented and release blocker closed",
    "v8.4 Option C joint-allocation residual exact-formula simulation: original geometry decision closed with outcome MORE_EVIDENCE_REQUIRED",
    "v8.4 production-authoritative joint ownership/source-safety correction: closed with outcome",
    "replacement, removal, aggregation, production 구현을 열지 않는다",
    "v8.3.1_target_authority_continuous_macro_score_v2",
    "valid 54개 target 모두 exact 100",
    "v8.3.1 DailyCoach semantic v2 phase 1: paused",
    "required result-log format: active",
    "docs/00_current_truth/05_required_result_log_format.txt",
    "continuous pressure limiter",
    "continuous_training_load_interpolation",
    "target/scoring alignment release blocker",
    "이미 검증된 docs-only/readiness/copy branch의 merge/publish는 대형 독립 작업으로 쪼개지 않는다",
    "실제 열린 다음 작업이 있으면 같은 흐름에서 이어간다",
    "publish가 끝났다는 이유만으로 다음 구현을 지어내지 않는다",
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
    "carb-fat exchange range consistency audit/design",
    "calorie-equivalent exchange",
    "carb-fat exchange joint allocation model decision/design",
    "carb-fat joint allocation model implementation",
    "protein-reserved iso-calorie carb/fat joint allocation",
    "conditional feasible display ranges",
    "proteinTargetLevel",
    "mode/context-selected external macro production policy",
    "2.3~3.1g/kg FFM contest-prep 예외를 열지 않는다",
    "external policy 적용 후 final protein/carbs/fat을 다시 덮어쓰면 실패",
    "adaptive-target stable help",
    "v8.3.1_adaptive_target_stable_help_implementation_2026-07-11.md",
    "v8.4_component_score_architecture_falsification_decision_2026-07-11.md",
    "v8.3.1_target_scoring_authoritative_reference_correction_implementation_2026-07-12.md",
    "v8.4_option_c_joint_residual_exact_formula_simulation_2026-07-12.md",
    "v8.3.1_target_authority_continuous_macro_score_v2",
    "current production은 54/54 exact 100",
    "production formula/UI/storage implementation을 열지 않는다",
    "production joint 제외 8축",
    "snapshotless/current-Settings hidden recompute",
    "명시적으로 제공한 full-backup",
    "DailyCoach semantic v2 phase 1",
  ];
  for (const text of currentTruthRequirements) {
    if (!currentTruth.includes(text)) fail(`02_macro_range_current_truth missing: ${text}`);
  }
  const hiddenRecomputeGuardLine = currentTruth.split(/\r?\n/).find(line => (
    line.includes("snapshotless/current-Settings hidden recompute")
  ));
  if (!hiddenRecomputeGuardLine || !/(금지|차단|허용하지)/.test(hiddenRecomputeGuardLine)) {
    fail("02_macro_range_current_truth must prohibit snapshotless/current-Settings hidden recompute in the same routing clause");
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
    "v8.3.1 carb-fat exchange range consistency audit/design",
    "v8.3.1 carb-fat exchange joint allocation model decision/design",
    "v8.3.1 carb-fat joint allocation model implementation",
    "v8.3.1 carb-fat joint allocation model QA closeout",
    "v8.3.1 stabilization/readiness checkpoint update",
    "v8.3.1 macro card adaptive OFF and protein target level implementation",
    "v8.3.1 adaptive-target stable help implementation: implemented",
    "v8.4 component-score architecture falsification decision: closed",
    "component production readiness is NO",
    "후보는 반증 가능하고 교체 가능해야 한다",
    "narrow target/scoring authoritative-reference correction decision/implementation: implemented and release blocker closed",
    "v8.3.1_target_scoring_authoritative_reference_correction_implementation_2026-07-12.md",
    "valid target 54/54 exact 100",
    "v8.4 Option C joint-allocation residual exact-formula simulation: original geometry decision closed with outcome MORE_EVIDENCE_REQUIRED",
    "v8.4 production-authoritative joint ownership/source-safety correction: closed with outcome",
    "v8.4_option_c_joint_residual_exact_formula_simulation_2026-07-12.md",
    "v8.3.1 DailyCoach semantic v2 phase 1: paused",
    "v8.3.1_adaptive_target_stable_help_implementation_2026-07-11.md",
    "required result-log format: active",
    "docs/00_current_truth/05_required_result_log_format.txt",
    "v8.3.1-ready for next planning",
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
    "v8.3.1 carb-fat exchange range consistency decision: next candidate",
    "v8.3.1 carb-fat exchange card cue/help spec + narrow implementation: next candidate",
    "v8.3.1 carb-fat exchange joint allocation model decision/design: next candidate",
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
    "v8.3.1_carb_fat_joint_allocation_model_implementation_2026-07-10.md",
    "v8.3.1_carb_fat_joint_allocation_model_qa_closeout_2026-07-10.md",
    "v8.3.1_stabilization_readiness_checkpoint_update_2026-07-10.md",
    "v8.3.1_macro_card_adaptive_off_and_protein_target_level_implementation_2026-07-10.md",
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

  const carbFatExchangeRangeConsistencyAuditDesignRequirements = [
    "v8.3.1 carb-fat exchange range consistency audit design",
    "docs-only carb/fat exchange range consistency audit design",
    "not a joint feasible carb/fat rectangle",
    "calorie-equivalent",
    "fat -1g frees about carb +2.25g",
    "carb +1g requires about fat -0.44g",
    "Option B.",
    "v8.3.1 carb-fat exchange joint allocation model decision/design",
    "iso-calorie line",
    "Moving target example",
    "No UI-only cap",
    "No explanation-only shortcut",
    "do not show internal calorie-exchange arithmetic to the user",
    "scoreDeltaPreview product path",
  ];
  for (const text of carbFatExchangeRangeConsistencyAuditDesignRequirements) {
    if (!carbFatExchangeRangeConsistencyAuditDesign.includes(text)) {
      fail(`v8.3.1 carb-fat exchange range consistency audit design missing: ${text}`);
    }
  }

  const carbFatExchangeJointAllocationModelDecisionRequirements = [
    "v8.3.1 carb-fat exchange joint allocation model decision",
    "docs-only model decision/design",
    "protein-reserved iso-calorie carb/fat joint allocation",
    "conditional feasible display ranges",
    "No explanation-only shortcut",
    "사용자에게 내부 calorie exchange arithmetic을 설명하지 말고",
    "Option C.",
    "availableCarbFatKcal",
    "4 * carbTargetG + 9 * fatTargetG = availableCarbFatKcal",
    "allowedGapKcal <= 2",
    "raw physiological range ∩ iso-calorie feasible interval",
    "3일/7일 continuous pressure limiter",
    "getV831CarbFatJointAllocationModel",
    "J01 target kcal / protein reserve / carb+fat kcal equality",
    "J12 no user-facing internal exchange arithmetic",
    "v8.3.1 carb-fat joint allocation model implementation",
    "별도 test-design 문서를 하나 더 만들지 않는다",
    "scoreDeltaPreview product path",
  ];
  for (const text of carbFatExchangeJointAllocationModelDecisionRequirements) {
    if (!carbFatExchangeJointAllocationModelDecision.includes(text)) {
      fail(`v8.3.1 carb-fat exchange joint allocation model decision missing: ${text}`);
    }
  }

  const v831StabilizationReadinessCheckpointUpdateRequirements = [
    "docs-only stabilization/readiness checkpoint update",
    "PROMPT_SCOPE_AUDIT",
    "v8.3.1-ready for next planning",
    "monitor-only residual risk",
    "c451b51",
    "177a195",
    "eea02f6",
    "3eb15a9",
    "0333d9c73956fe58d2cd1284279751a6f507c1b8",
    "target 그대로 섭취 invariant",
    "adaptive target overfitting guard",
    "high-volume no-permission",
    "Records snapshot stability",
    "card help/copy로 내부 calorie exchange arithmetic을 설명",
    "UI-only display cap",
    "scoreDeltaPreview product path 재개 금지",
    "old records migration/recompute/reset",
    "새 feature를 즉시 여는 것이 아니라",
  ];
  for (const text of v831StabilizationReadinessCheckpointUpdateRequirements) {
    if (!v831StabilizationReadinessCheckpointUpdate.includes(text)) {
      fail(`v8.3.1 stabilization readiness checkpoint update missing: ${text}`);
    }
  }

  const macroCardAdaptiveOffProteinTargetRequirements = [
    "implementation_log",
    "adaptive ON",
    "adaptive OFF",
    "proteinTargetLevel",
    "persistent setting surface",
    "Protein card no longer shows a range chip",
    "`medium` is the only default/automatic UI choice",
    "Legacy stored `default` values normalize to `medium`",
    "compact 58px selector",
    "proteinTargetLevelHelpTip",
    "`low` and `high` select the lower/upper bound of the existing mode/context policy range",
    "Generic `high` does not expose the 2.3-3.1g/kg FFM contest-prep exception",
    "former post-policy final macro overwrite was removed",
    "runProteinTargetLevelPolicyIntegrationTests",
    "six goals x exercise/general x low/medium/high",
    "No scoring-curve anchor change",
    "No score formula change",
    "No score curve tuning",
    "No scoreDeltaPreview work",
    "No old records migration/recompute/reset",
  ];
  for (const text of macroCardAdaptiveOffProteinTargetRequirements) {
    if (!macroCardAdaptiveOffProteinTargetImplementation.includes(text)) {
      fail(`v8.3.1 macro card adaptive OFF/protein target implementation missing: ${text}`);
    }
  }

  const onboardingFirstRunDecisionRequirements = [
    "DOCUMENT ROLE",
    "- decision",
    "truthful setup gate + progressive Today",
    "target kcal: 4,013kcal",
    "weight: 75kg",
    "goal: lean_bulk",
    "render() -> saveState()",
    "exercise 여부만 묻는 최소 v1",
    "REQUIRED_BEFORE_FIRST_CALC",
    "REQUIRED_IF_EXERCISE",
    "proteinTargetLevel",
    "AUTO_DEFAULT",
    "ONBOARDING_VERSION = 1",
    "onboardingCompletedVersion",
    "fresh",
    "completed",
    "existing_profile_confirmed",
    "existing_data_profile_unconfirmed",
    "Mere presence of auto-saved default keys is not completion evidence",
    "exact historical defaults plus Records or InBody must classify as `existing_data_profile_unconfirmed`",
    "bodyCompositionConfirmed",
    "Records-only import does not complete onboarding",
    "No additional docs-only test-design step is required",
    "complete onboarding implementation",
    "no score formula change",
  ];
  for (const text of onboardingFirstRunDecisionRequirements) {
    if (!onboardingFirstRunFlowDecision.includes(text)) {
      fail(`v8.3.1 onboarding first-run decision missing: ${text}`);
    }
  }

  const onboardingFirstRunImplementationRequirements = [
    "DOCUMENT ROLE",
    "- implementation_log",
    "four-state raw-storage classification",
    "existing_profile_confirmed",
    "existing_data_profile_unconfirmed",
    "Records-only import does not complete setup",
    "bodyCompositionConfirmed",
    "runOnboardingFirstRunFlowTests",
    "No score formula change",
    "Additional requested product audit: not implemented",
    "코드 몰라도 보는 완료 보존 핫픽스",
    "코드 몰라도 보는 전체 백업 스냅샷 재설정 핫픽스",
    "Full-backup snapshot hotfix PROMPT_SCOPE_AUDIT",
    "incomplete full backup restore",
    "completed full backup restore",
    "Settings re-entry submit",
    "Carb/fat adaptive-target explanation in DailyCoach",
    "DailyCoach semantic v2 phase 1",
    "selectable Coach tone/persona",
  ];
  for (const text of onboardingFirstRunImplementationRequirements) {
    if (!onboardingFirstRunFlowImplementation.includes(text)) {
      fail(`v8.3.1 onboarding first-run implementation missing: ${text}`);
    }
  }

  const todayScoreGuidanceOwnershipDecisionRequirements = [
    "DOCUMENT ROLE",
    "- decision",
    "Today score and guidance surface ownership inventory / decision",
    "four standalone 0-100 component scores: REJECTED",
    "`componentContributions.alcohol`",
    "`dataOutlierPenalty`",
    "`carbFatExchangeFailurePenalty`",
    "`adaptiveAllocation`",
    "`balance.adaptiveTarget`",
    "adaptive-target stable definition",
    "`3일 연속`",
    "`coachTone`",
    "점수는 “왜 이 점수가 나왔는지”를 책임진다.",
    "v8.3.1 Today score-card semantic ownership cleanup",
    "next implementation gate: v8.3.1 Today score-card semantic ownership cleanup",
    "UI/storage/schema/backup/onboarding/Records migration/scoreDeltaPreview는 열지 않았다.",
  ];
  for (const text of todayScoreGuidanceOwnershipDecisionRequirements) {
    if (!todayScoreGuidanceOwnershipDecision.includes(text)) {
      fail(`v8.3.1 Today score/guidance ownership decision missing: ${text}`);
    }
  }

  const todayScoreOwnershipCleanupImplementationRequirements = [
    "DOCUMENT ROLE",
    "- implementation_log",
    "buildTodayScoreEvidenceModel",
    "penaltyBreakdown",
    "9개",
    "raw penalty",
    "stored_auto_snapshot",
    "hidden recompute",
    "DailyCoach semantic v2",
    "adaptive-target stable help",
  ];
  for (const text of todayScoreOwnershipCleanupImplementationRequirements) {
    if (!todayScoreOwnershipCleanupImplementation.includes(text)) {
      fail(`v8.3.1 Today score ownership cleanup implementation missing: ${text}`);
    }
  }

  const todayScoreOwnershipCleanupRoute = "v8.3.1_today_score_card_semantic_ownership_cleanup_implementation_2026-07-11.md";
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes(todayScoreOwnershipCleanupRoute)) {
      fail(`${label} missing Today score ownership cleanup implementation route`);
    }
  }
  if (!statusIndex.includes(`상태: implemented by docs/${todayScoreOwnershipCleanupRoute}`)) {
    fail("status index must mark Today score ownership cleanup as implemented");
  }

  if (exists("index.html")) {
    const indexHtmlForTodayScore = read("index.html");
    for (const signal of [
      "function buildTodayScoreEvidenceModel(adherenceResult)",
      "TODAY_SCORE_REQUIRED_PENALTY_AXES",
      "function renderTodayScorePrimaryTiles(evidenceModel)",
      "function renderTodayScoreConditionalEvidence(evidenceModel)",
      "function renderTodayAdherencePanel(adherenceResult)",
      "stored_breakdown_unavailable",
      "function runTodayScoreEvidenceOwnershipTests()",
    ]) {
      if (!indexHtmlForTodayScore.includes(signal)) {
        fail(`index.html missing Today score ownership signal: ${signal}`);
      }
    }
    for (const forbiddenPattern of [
      /function\s+getTodayScoreCardCopy\s*\(/,
      /function\s+renderAdherenceMacroCards\s*\(/,
      /function\s+renderAdherenceExtraChecks\s*\(/,
      /renderTodayAdherencePanel\(todayAdherence,\s*\{\s*coach:/,
    ]) {
      if (forbiddenPattern.test(indexHtmlForTodayScore)) {
        fail(`index.html revives removed Today score ownership path: ${forbiddenPattern}`);
      }
    }
  }
  for (const profile of ["smoke", "core", "ui", "mobile"]) {
    const profileStart = internalTestRunner.indexOf(`${profile}: [`);
    const profileEnd = internalTestRunner.indexOf("\n  ],", profileStart);
    const profileBody = profileStart >= 0 && profileEnd > profileStart
      ? internalTestRunner.slice(profileStart, profileEnd)
      : "";
    if (!profileBody.includes("runTodayScoreEvidenceOwnershipTests")) {
      fail(`${profile} profile missing Today score evidence ownership regression suite`);
    }
  }

  const adaptiveTargetStableHelpRequirements = [
    "DOCUMENT ROLE",
    "- implementation_log",
    "## 비개발자용 설명",
    "### 무엇을 바꿨는지",
    "### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지",
    "### 정책, 산식, 데이터 해석이 바뀌었는지",
    "### 바꾸지 않은 범위와 보류한 내용",
    "### 사용자가 큰 틀에서 확인해야 할 판단점",
    "### 테스트에서 무엇을 검증했는지",
    "ADAPTIVE_TARGET_STABLE_HELP_COPY",
    "390px",
    "native button",
    "aria-describedby",
    "role=\"tooltip\"",
    "변경 없음",
    "DailyCoach semantic v2 phase 1",
    "buildMacroReason",
  ];
  for (const text of adaptiveTargetStableHelpRequirements) {
    if (!adaptiveTargetStableHelpImplementation.includes(text)) {
      fail(`v8.3.1 adaptive-target stable help implementation missing: ${text}`);
    }
  }

  const adaptiveTargetStableHelpRoute = "v8.3.1_adaptive_target_stable_help_implementation_2026-07-11.md";
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes(adaptiveTargetStableHelpRoute)) {
      fail(`${label} missing adaptive-target stable help implementation route`);
    }
  }
  if (!statusIndex.includes(`상태: implemented by docs/${adaptiveTargetStableHelpRoute}`)) {
    fail("status index must mark adaptive-target stable help as implemented");
  }
  if (/49\. v8\.3\.1 adaptive-target stable help implementation\.[\s\S]{0,180}상태:\s*pending/.test(statusIndex)) {
    fail("status index still marks adaptive-target stable help as pending");
  }

  if (exists("index.html")) {
    const indexHtmlForAdaptiveHelp = read("index.html");
    for (const signal of [
      "const ADAPTIVE_TARGET_STABLE_HELP_COPY = Object.freeze({",
      "function getAdaptiveTargetStableHelpCopy()",
      "function syncAdaptiveTargetStableHelpCopy()",
      "id=\"settingsAdaptiveTargetHelp\" type=\"button\"",
      "aria-describedby=\"settingsAdaptiveTargetHelpTip\"",
      "id=\"settingsAdaptiveTargetHelpTip\" role=\"tooltip\"",
      "id=\"todayAdaptiveTargetHelp\" type=\"button\"",
      "aria-describedby=\"todayAdaptiveTargetHelpTip\"",
      "id=\"todayAdaptiveTargetHelpTip\" role=\"tooltip\"",
      "is-tooltip-dismissed",
      "function runAdaptiveTargetStableHelpTests()",
      "buildTodayScoreEvidenceModel() + renderTodayAdherencePanel()",
    ]) {
      if (!indexHtmlForAdaptiveHelp.includes(signal)) {
        fail(`index.html missing adaptive-target stable help signal: ${signal}`);
      }
    }

    const copyStart = indexHtmlForAdaptiveHelp.indexOf("const ADAPTIVE_TARGET_STABLE_HELP_COPY = Object.freeze({");
    const copyEnd = indexHtmlForAdaptiveHelp.indexOf("function getAdaptiveTargetStableHelpCopy()", copyStart);
    const copyBlock = copyStart >= 0 && copyEnd > copyStart
      ? indexHtmlForAdaptiveHelp.slice(copyStart, copyEnd)
      : "";
    for (const meaning of ["shortReference", "fullDefinition", "총 목표 칼로리", "단백질", "남은 칼로리", "새 권장량"]) {
      if (!copyBlock.includes(meaning)) fail(`adaptive-target shared help source missing semantic contract: ${meaning}`);
    }
    for (const forbidden of ["3일 연속", "7일 연속", "조절 불가", "joint allocation", "limiter", "anchor", "penalty", "curve"]) {
      if (copyBlock.includes(forbidden)) fail(`adaptive-target stable help source exposes unsupported term: ${forbidden}`);
    }
    for (const forbiddenPattern of [
      /<span class="help-wrap today-target-help"/,
      /function\s+buildMacroReason\s*\(/,
      /getTodayScoreCardCopy\(\) \+ buildMacroReason\(\)/,
    ]) {
      if (forbiddenPattern.test(indexHtmlForAdaptiveHelp)) {
        fail(`index.html revives stale adaptive-help or score-report path: ${forbiddenPattern}`);
      }
    }
  }
  for (const profile of ["smoke", "core", "ui", "mobile"]) {
    const profileStart = internalTestRunner.indexOf(`${profile}: [`);
    const profileEnd = internalTestRunner.indexOf("\n  ],", profileStart);
    const profileBody = profileStart >= 0 && profileEnd > profileStart
      ? internalTestRunner.slice(profileStart, profileEnd)
      : "";
    if (!profileBody.includes("runAdaptiveTargetStableHelpTests")) {
      fail(`${profile} profile missing adaptive-target stable help regression suite`);
    }
  }

  const historicalComponentScoreArchitectureDecisionRequirements = [
    "DOCUMENT ROLE",
    "- decision",
    "component score architecture simulation decision",
    "architecture feasibility: CONDITIONAL_ACCEPT",
    "naive 100-minus display: REJECTED",
    "arithmetic component average: REJECTED",
    "data validity",
    "production implementation: NOT OPEN",
    "DailyCoach semantic v2 phase 1",
    "current production formula: KEEP until explicitly superseded",
    "영구 REJECT 아님:",
    "후속 반증 상태",
    "docs/v8.4_component_score_architecture_falsification_decision_2026-07-11.md",
  ];
  for (const text of historicalComponentScoreArchitectureDecisionRequirements) {
    if (!componentScoreArchitectureSimulationDecision.includes(text)) {
      fail(`historical component score architecture simulation decision missing: ${text}`);
    }
  }

  const componentScoreArchitectureFalsificationRequirements = [
    "DOCUMENT ROLE",
    "- decision",
    "test-only architecture falsification",
    "v8.4 component-score architecture falsification decision",
    "component production readiness: NO",
    "current production formula/UI/storage: UNCHANGED",
    "candidates are falsifiable and replaceable",
    "current target/scoring mismatch remains an open blocker until corrected",
    "naive 100-minus rejected",
    "hidden modifier rejected",
    "production index.html diff: none",
    "tools/render_audit/simulate_component_score_architecture.cjs",
    "old Records score/version 보존과 no-recompute",
  ];
  for (const text of componentScoreArchitectureFalsificationRequirements) {
    if (!componentScoreArchitectureFalsificationDecision.includes(text)) {
      fail(`component score architecture falsification decision missing: ${text}`);
    }
  }

  const componentScoreArchitectureRoute = "component_score_architecture_simulation_decision_2026-07-11.md";
  const componentScoreArchitectureFalsificationRoute = "v8.4_component_score_architecture_falsification_decision_2026-07-11.md";
  const targetScoringAuthorityCorrectionRoute = "v8.3.1_target_scoring_authoritative_reference_correction_implementation_2026-07-12.md";
  const optionCJointResidualSimulationRoute = "v8.4_option_c_joint_residual_exact_formula_simulation_2026-07-12.md";
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes(componentScoreArchitectureRoute)) {
      fail(`${label} missing component score architecture simulation decision route`);
    }
    if (!text.includes(componentScoreArchitectureFalsificationRoute)) {
      fail(`${label} missing component score architecture falsification decision route`);
    }
    if (!text.includes(targetScoringAuthorityCorrectionRoute)) {
      fail(`${label} missing target/scoring authority correction route`);
    }
    if (!text.includes(optionCJointResidualSimulationRoute)) {
      fail(`${label} missing Option C joint residual simulation route`);
    }
  }
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes("release blocker") && !text.includes("release-blocker")) {
      fail(`${label} must keep the target/scoring release-blocker history and closure visible`);
    }
    if (text.includes("v8.4 candidate component-score scoring-version implementation decision")) {
      fail(`${label} still exposes the superseded exact component-score implementation gate`);
    }
  }
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
  ]) {
    for (const stalePhrase of [
      "mismatch는 OPEN",
      "narrow target/scoring authoritative-reference correction decision/implementation: pending release-blocker",
      "current formula/version/UI/storage는 unchanged",
      "v8.4 Option C joint-allocation residual exact-formula simulation: pending",
    ]) {
      if (text.includes(stalePhrase)) fail(`${label} retains stale target/scoring correction state: ${stalePhrase}`);
    }
  }
  if (!statusIndex.includes(`상태: historical input superseded by docs/${componentScoreArchitectureFalsificationRoute}`)) {
    fail("status index must mark the first component score architecture decision as superseded historical input");
  }
  const escapedFalsificationRoute = componentScoreArchitectureFalsificationRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`상태: closed[^\\n]*docs/${escapedFalsificationRoute}`).test(statusIndex)) {
    fail("status index must mark the component score falsification decision closed without forcing a permanent candidate name");
  }
  if (!statusIndex.includes(`상태: implemented and release blocker closed by docs/${targetScoringAuthorityCorrectionRoute}`)) {
    fail("status index must mark target/scoring authority correction implemented and closed");
  }
  if (!statusIndex.includes(`상태: original geometry decision closed with outcome \`MORE_EVIDENCE_REQUIRED\` by docs/${optionCJointResidualSimulationRoute}`)) {
    fail("status index must preserve the original Option C MORE_EVIDENCE_REQUIRED decision as historical geometry evidence");
  }
  const targetScoringAuthorityCorrectionRequirements = [
    "DOCUMENT ROLE",
    "- implementation_log",
    "target/scoring authoritative-reference correction implementation",
    "## 비개발자용 설명",
    "### 무엇을 바꿨는지",
    "### 왜 바꿨는지",
    "### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지",
    "### 정책, 산식, 데이터 해석이 바뀌었는지",
    "### 바꾸지 않은 범위와 보류한 내용",
    "### 사용자가 큰 틀에서 확인해야 할 판단점",
    "### 테스트에서 무엇을 검증했는지",
    "## 기술 검증",
    "v8.3.1_target_authority_continuous_macro_score_v2",
    "before 33/54 exact 100, after 54/54 exact 100",
    "runTargetScoringAuthoritativeReferenceCorrectionTests",
    "explicit regrade/persistence",
    "frozen snapshot",
    "PROMPT_SCOPE_AUDIT",
    "Option C joint-allocation residual exact-formula simulation",
  ];
  for (const text of targetScoringAuthorityCorrectionRequirements) {
    if (!targetScoringAuthorityCorrectionImplementation.includes(text)) {
      fail(`target/scoring authority correction implementation log missing: ${text}`);
    }
  }

  const optionCJointResidualSimulationRequirements = [
    "DOCUMENT ROLE",
    "- test/docs-only Option C exact-formula simulation result log",
    "overall outcome: MORE_EVIDENCE_REQUIRED",
    "CURRENT_JOINT_REPLACEMENT_READY: 선택하지 않음",
    "DROP_JOINT_AXIS_READY: 선택하지 않음",
    "## 비개발자용 설명",
    "### 무엇을 바꿨는지",
    "### 왜 바꿨는지",
    "### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지",
    "### 정책, 산식, 데이터 해석이 바뀌었는지",
    "### 바꾸지 않은 범위와 보류한 내용",
    "### 사용자가 큰 틀에서 확인해야 할 판단점",
    "### 테스트에서 무엇을 검증했는지",
    "## 기술 검증",
    "최대 차이 `1e-15`",
    "22.449점",
    "`0.354111`에서 `0.458886`",
    "`5.702점`에서 `9.147점`",
    "production-authority correction",
    "production-authority correction outcome:",
    "historical 잠정치",
    "joint 제외 8축",
    "snapshotless",
    "explicit backup",
    "blinded product-meaning",
    "actual-day evidence preflight hardening",
    "hypothesis-blind",
    "invalid_meal_non_macro_kcal",
    "non_finite_meal_energy_total",
    "production scoring kcal",
    "post-judgment",
    "explicit-backup actual-day evidence closeout",
    "actual-day evidence outcome: ACTUAL_EVIDENCE_INSUFFICIENT",
    "NO_BALANCED_JUDGEABLE_BLOCK",
    "reviewForUser: false",
    "reviewPacket: []",
    "source records: 98",
    "source-safe included: 96",
    "balanced block candidates: 0",
    "actual same-input two-run: audit/review 모두 byte-identical",
    "coefficient tuning",
    "실제 private backup은 이 작업공간에 없어서",
    "scoring formula/version, UI, storage/schema, backup, Records, DailyCoach, v8.3 tag를 바꾸지 않았다",
    "PROMPT_SCOPE_AUDIT",
  ];
  for (const text of optionCJointResidualSimulationRequirements) {
    if (!optionCJointResidualSimulationDecision.includes(text)) {
      fail(`Option C joint residual simulation result missing: ${text}`);
    }
  }
  const optionCOverallOutcomeLines = optionCJointResidualSimulationDecision.match(/^overall outcome:\s*.+$/gm) || [];
  if (optionCOverallOutcomeLines.length !== 1 || optionCOverallOutcomeLines[0] !== "overall outcome: MORE_EVIDENCE_REQUIRED") {
    fail("Option C result log must preserve the original historical overall outcome exactly once");
  }
  const correctionOutcomeLines = optionCJointResidualSimulationDecision.match(/^production-authority correction outcome:\s*.+$/gm) || [];
  const allowedCorrectionOutcomes = new Set([
    "AUTHORITY_CORRECTED_AWAITING_EXPLICIT_BACKUP",
    "MORE_EVIDENCE_REQUIRED",
    "DROP_JOINT_AXIS_CANDIDATE",
    "RESIDUAL_JOINT_CANDIDATE",
  ]);
  const correctionOutcome = correctionOutcomeLines.length === 1
    ? correctionOutcomeLines[0].split(":").slice(1).join(":").trim()
    : null;
  if (!allowedCorrectionOutcomes.has(correctionOutcome)) {
    fail("Option C correction must declare exactly one allowed, falsifiable production-authority correction outcome");
  }
  const actualEvidenceOutcomeLines = optionCJointResidualSimulationDecision.match(/^actual-day evidence outcome:\s*.+$/gm) || [];
  const allowedActualEvidenceOutcomes = new Set([
    "ACTUAL_EVIDENCE_INSUFFICIENT",
    "READY_FOR_LIMITED_BLIND_JUDGMENT",
  ]);
  const actualEvidenceOutcome = actualEvidenceOutcomeLines.length === 1
    ? actualEvidenceOutcomeLines[0].split(":").slice(1).join(":").trim()
    : null;
  if (!allowedActualEvidenceOutcomes.has(actualEvidenceOutcome)) {
    fail("Option C actual-day evidence must declare exactly one allowed, falsifiable outcome");
  }
  if (!statusIndex.includes(`상태: closed with outcome \`${correctionOutcome}\` by the append-only production-authority correction section`)) {
    fail("status index must expose the same falsifiable production-authority correction outcome as the result log");
  }
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    for (const required of [
      optionCJointResidualSimulationRoute,
      correctionOutcome,
    ]) {
      if (!text.includes(required)) fail(`${label} missing current Option C outcome route: ${required}`);
    }
  }
  if (actualEvidenceOutcome === "ACTUAL_EVIDENCE_INSUFFICIENT") {
    for (const [label, text] of [
      ["00_READ_FIRST", readFirst],
      ["02_macro_range_current_truth", currentTruth],
      ["04_document_status_index", statusIndex],
      ["README", readme],
    ]) {
      if (!text.includes(actualEvidenceOutcome)) fail(`${label} must route the actual evidence insufficiency outcome`);
    }
    const hasClosedInsufficientActualEvidenceSemantics = text => {
      const routeLine = text.split(/\r?\n/).find(line => (
        line.includes("explicit-backup privacy-safe actual-day joint ownership evidence:")
      ));
      return !!routeLine
        && /closed with outcome/i.test(routeLine)
        && routeLine.includes("ACTUAL_EVIDENCE_INSUFFICIENT");
    };
    if (!hasClosedInsufficientActualEvidenceSemantics(readFirst)
        || !hasClosedInsufficientActualEvidenceSemantics(statusIndex)
        || !statusIndex.includes("56. component-score actual-day aggregation re-evaluation.")
        || !statusIndex.includes("상태: blocked because item 55 closed `ACTUAL_EVIDENCE_INSUFFICIENT`.")) {
      fail("actual evidence insufficiency must close item 55 without review/reveal and keep component aggregation blocked");
    }
  }

  const targetAuthorityIndexHtml = read("index.html");
  for (const signal of [
    'const PRE_TARGET_AUTHORITY_ADHERENCE_SCORING_VERSION = "v8.3_anchor_continuous_macro_score_v1"',
    'const TARGET_SCORING_AUTHORITY_CORRECTION_VERSION = "v8.3.1_target_scoring_authority_v1"',
    'const MACRO_RANGE_PRODUCTION_SCORING_VERSION = "v8.3.1_target_authority_continuous_macro_score_v2"',
    'const MACRO_RANGE_SCORE_FORMULA_NAME = "anchor_continuous_macro_score_v2_target_authority"',
    "function getV831TargetScoringAuthority",
    "function getStoredAdherenceRangeScoreFormula",
    "function runTargetScoringAuthoritativeReferenceCorrectionTests",
    "window.runTargetScoringAuthoritativeReferenceCorrectionTests",
  ]) {
    if (!targetAuthorityIndexHtml.includes(signal)) fail(`index.html missing target-authority correction signal: ${signal}`);
  }
  for (const profile of ["smoke", "core"]) {
    const profileStart = internalTestRunner.indexOf(`${profile}: [`);
    const profileEnd = internalTestRunner.indexOf("\n  ],", profileStart);
    const profileBody = profileStart >= 0 && profileEnd > profileStart
      ? internalTestRunner.slice(profileStart, profileEnd)
      : "";
    if (!profileBody.includes("runTargetScoringAuthoritativeReferenceCorrectionTests")) {
      fail(`${profile} profile missing target/scoring authority correction regression suite`);
    }
  }
  if (!packageJson.scripts?.["test:macro-policy"]?.includes("runTargetScoringAuthoritativeReferenceCorrectionTests")) {
    fail("test:macro-policy missing target/scoring authority correction regression suite");
  }
  for (const signal of [
    "missingRequestedSuiteNames",
    "no exported internal test suites are available",
    "requestedSuiteCountMismatch",
    "consoleErrors.length",
    "pageErrors.length",
  ]) {
    if (!internalTestRunner.includes(signal)) fail(`internal test runner missing fail-closed guard: ${signal}`);
  }

  const simulationToolRequirements = [
    "component_score_architecture_falsification_v2",
    "model_d_raw_product",
    "model_e_softmin_p_minus_4",
    "model_f_geometric_worst_guard_35",
    "model_g_min_residual_10",
    "option_c_joint_allocation_residual",
    "function optionC1CarbEnergyShareResidual",
    "function optionC2RadialKcalPlaneResidual",
    "function optionC3LegacyNormalizedCarbBaseline",
    "productionGeometrySweep",
    "productionOwnership",
    "historicalSimplified",
    "ownershipDrift",
    "nonJointPenaltyBreakdownComplete",
    "availableCarbFatKcal",
    "invalid_available_kcal_authority",
    "joint_endpoint_authority_mismatch",
    "isStrictlyIncreasingFinite",
    "uniqueResidualCaseCount",
    "coreOverlapCount",
    "--actual-backup",
    "privacyContract",
    "function validateRawActualBackupEnvelope",
    "function getRawActualRecordExclusionReason",
    "normalizeFullBackupPayload",
    "snapshotless",
    "current_result_source_fallback",
    "ACTUAL_MATCH_TOLERANCES",
    "function buildActualMatchedEvidence",
    "function maximumCardinalityMatching",
    "function getStableActualSampleId",
    "READY_FOR_LIMITED_BLIND_JUDGMENT",
    "NO_BALANCED_JUDGEABLE_BLOCK",
    "post-judgment reveal is blocked because no review-ready balanced packet exists",
    "function buildHypothesisBlindProductMeaningReview",
    "function isValidOptionalRawNonMacroKcal",
    "ACTUAL_AUDIT_SIMPLE_ROUTINES",
    "ACTUAL_AUDIT_ADVANCED_ROUTINES_BY_PROFILE",
    "invalid_meal_non_macro_kcal",
    "--actual-review-output",
    "--actual-reveal-output",
    "--post-judgment-reveal",
    "function isHypothesisBlindReviewArtifactSafe",
    "function isPostJudgmentRevealArtifactSafe",
    "function assertLockedReviewMatchesGenerated",
    "function assertDistinctFilePaths",
    "source_safety_corrected_awaiting_explicit_backup",
    "deterministicHash",
    "target matrix has 54 cases",
    "current target matrix produces finite scores",
    "current production restores exact generated targets",
    "current production target authority passes generated targets",
    "finiteNonNegativeMacros",
    "proteinSelectionMatchesIndependentRequest",
    "target validity envelope passes generated targets",
    "C1 capacity normalization is direction symmetric",
    "C1 residual is bounded from zero to one",
    "C1 and C2 are numerically equivalent",
    "C3 legacy normalized-carb baseline is marked DROP and diverges",
    "production geometry sweep covers all 54 plus 12 cross-profile geometries with joint-model authority",
    "production ownership source covers every sample with the exact nine-axis key set and eight non-joint axes",
    "raw numeric authority accepts native finite numbers only",
    "present-invalid alcohol and other kcal variants are excluded before scoring",
    "non-finite derived meal/day energy totals are excluded before scoring",
    "actual-day routine vocabulary mirrors production simple and advanced profile routines",
    "actual-day full-day threshold uses production scoring kcal including valid non-macro energy",
    "standalone review and post-judgment reveal artifacts use exact privacy allowlists and linked case hashes",
    "post-judgment reveal accepts only the locked matching review and distinct input/output paths",
    "hypothesis-blind shuffle is deterministic, raw-record/input-order invariant, and covers both A/B orientations",
    "invalid and duplicate dates are excluded before scoring",
    "cardio-only snapshot training is derived from raw snapshot energy instead of rest fallback",
    "historical_test_local_helper_diagnostics_only",
    "production versus historical ownership drift is explicit and fully accounted",
  ];
  for (const text of simulationToolRequirements) {
    if (!componentScoreArchitectureSimulationTool.includes(text)) {
      fail(`component score architecture simulation tool missing contract: ${text}`);
    }
  }
  const expectedSimulationCommand = "node tools/render_audit/simulate_component_score_architecture.cjs --assert";
  if (packageJson.scripts?.["test:component-score-simulation"] !== expectedSimulationCommand) {
    fail("package.json missing the permanent component-score simulation assertion command");
  }
  if (read("index.html").includes("simulate_component_score_architecture")) {
    fail("production index.html must not import or reference the architecture simulation harness");
  }
  if (componentScoreArchitectureSimulationTool.includes("writeFileSync(indexPath")) {
    fail("component-score simulation harness must not write to production index.html");
  }

  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes("v8.3.1_today_score_guidance_surface_ownership_inventory_decision_2026-07-11.md")) {
      fail(`${label} missing Today score/guidance ownership decision route`);
    }
  }
  if (/Today score and guidance surface ownership inventory \/ decision\.[\r\n]+\s+- 상태: user-raised future candidate; implementation not opened\./.test(statusIndex)) {
    fail("status index still marks Today score/guidance ownership inventory as an unopened future candidate");
  }
  for (const text of [
    "48. v8.3.1 Today score-card semantic ownership cleanup.",
    "49. v8.3.1 adaptive-target stable help implementation.",
    "50. component score architecture feasibility / simulation decision.",
    "51. v8.4 component-score architecture falsification decision.",
    "53. v8.4 Option C joint-allocation residual exact-formula simulation.",
    "54. v8.4 production-authoritative joint ownership/source-safety correction.",
    "55. explicit-backup privacy-safe actual-day joint ownership evidence.",
    "56. component-score actual-day aggregation re-evaluation.",
    "57. component-score candidate selection or rejection.",
    "58. v8.3.1 DailyCoach semantic v2 phase 1.",
    "v8.3.1 DailyCoach semantic v2 phase 1.",
    "selectable Coach voice decision / implementation.",
    "필요 시 broad tooltip/glossary spec.",
  ]) {
    if (!statusIndex.includes(text)) fail(`status index missing Today ownership follow-up gate: ${text}`);
  }

  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    for (const route of [
      "v8.3.1_onboarding_first_run_flow_decision_2026-07-10.md",
      "v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md",
    ]) {
      if (!text.includes(route)) fail(`${label} missing onboarding route: ${route}`);
    }
  }
  if (!readFirst.includes("onboarding / first-run flow implementation: implemented by docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md")) {
    fail("00_READ_FIRST missing implemented onboarding gate");
  }
  if (!readFirst.includes("onboarding completion ownership hotfix: implemented by docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md")) {
    fail("00_READ_FIRST missing onboarding completion ownership hotfix");
  }
  if (!readFirst.includes("onboarding full-backup ownership snapshot rebase hotfix: implemented by docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md")) {
    fail("00_READ_FIRST missing onboarding full-backup ownership snapshot rebase hotfix");
  }
  if (!statusIndex.includes("onboarding / first-run flow implementation: implemented by docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md")) {
    fail("status index missing implemented onboarding gate");
  }
  if (!statusIndex.includes("onboarding completion ownership hotfix: implemented by docs/v8.3.1_onboarding_first_run_flow_implementation_2026-07-10.md")) {
    fail("status index missing onboarding completion ownership hotfix");
  }
  if (!currentTruth.includes("completion ownership hotfix") || !readme.includes("completion ownership hotfix")) {
    fail("current truth and README must route the onboarding completion ownership hotfix");
  }
  for (const [label, text] of [
    ["02_macro_range_current_truth", currentTruth],
    ["04_document_status_index", statusIndex],
    ["README", readme],
  ]) {
    if (!text.includes("full-backup snapshot rebase hotfix")) {
      fail(`${label} must route the onboarding full-backup snapshot rebase hotfix`);
    }
  }
  for (const [label, text] of [
    ["00_READ_FIRST", readFirst],
    ["04_document_status_index", statusIndex],
  ]) {
    if (text.includes("onboarding / first-run flow implementation: pending; next substantive gate")) {
      fail(`${label} still has stale pending onboarding implementation text`);
    }
  }
  const onboardingSuiteRegistrations = (internalTestRunner.match(/"runOnboardingFirstRunFlowTests"/g) || []).length;
  if (onboardingSuiteRegistrations < 4) {
    fail("onboarding first-run suite must stay registered in smoke, core, UI, and mobile profiles");
  }
  if (!onboardingArchiveReadme.includes("current decision") || !onboardingArchiveReadme.includes("superseded")) {
    fail("onboarding archive README must route historical notes to the current decision");
  }
  for (const text of ["HISTORICAL / SUPERSEDED", "docs/v8.3.1_onboarding_first_run_flow_decision_2026-07-10.md"]) {
    if (!onboardingHistoricalNote.includes(text)) {
      fail(`historical onboarding note missing supersede marker: ${text}`);
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
    "docs/00_current_truth/05_required_result_log_format.txt",
    "비개발자용 설명",
    "Most audits belong in the result log",
    "must not create another anti-inertia task",
    "Do not enter review-the-review loops",
    "Do not treat this checklist as permanent law",
    "documented next gate is a hypothesis",
    "root problem in plain language",
    "evidence checked outside next-gate text",
    "alternatives considered",
    "what would prove this choice wrong",
    "Adversarial root-problem check",
    "Compact merge/publish checkpoint",
    "Do not turn every merge/publish into a large standalone task.",
    "Continue to the next substantive task if the prompt or current repo state requires it.",
    "Do not stop after merge/publish when the user asked to continue into the next real implementation.",
    "Do not invent a next implementation merely because publish completed",
    "already-reviewed docs-only/readiness/copy merge-publish",
    "Historical next gate restoration",
    "Do not use this section as the current next-step source",
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
    "docs/00_current_truth/05_required_result_log_format.txt",
    "FIRST BODY SECTION",
    "## 비개발자용 설명",
    "## 기술 검증",
  ];
  for (const text of preambleRequirements) {
    if (!preamble.includes(text)) fail(`new_doc_preamble missing: ${text}`);
  }

  const agentsRequirements = [
    "docs/00_current_truth/00_READ_FIRST.txt",
    "docs/00_current_truth/02_macro_range_current_truth.txt",
    "docs/00_current_truth/04_document_status_index.txt",
    "docs/00_current_truth/05_required_result_log_format.txt",
    "docs/archive/v8.2_macro_range/",
    "scoring implementation은 현재 `v8.3.1_target_authority_continuous_macro_score_v2`로 구현된 상태",
    "v6.1 alcoholImpactPenalty",
    "PROMPT_SCOPE_AUDIT",
    "Do not assume the prompt is the correct next step",
    "documented next gate is correct merely because it is documented",
    "root problem in plain language",
    "evidence checked outside next-gate text",
    "alternatives considered",
    "what would prove the choice wrong",
    "minimal surface",
    "complete scope",
    "already-reviewed docs-only/readiness/copy merge-publish",
    "continue to the next substantive task if one actually exists",
    "do not invent a next implementation merely because publish completed",
    "recursive meta-work",
    "Most audits belong in the result log",
    "첫 본문은 반드시 `비개발자용 설명`",
    "정책/산식/데이터 해석 변경 여부",
    "기술 검증 섹션",
  ];
  for (const text of agentsRequirements) {
    if (!agents.includes(text)) fail(`AGENTS.md missing: ${text}`);
  }

  const resultLogFormatRequirements = [
    "저장소 공통 결과로그 계약 / 비개발자 우선 설명",
    "새 로컬 Codex도 같은 순서로 보고",
    "첫 본문 섹션은 반드시 `비개발자용 설명`",
    "무엇을 바꿨는지",
    "왜 바꿨는지",
    "실제 사용자 화면이나 계산 결과가 어떻게 달라지는지",
    "정책, 산식, 데이터 해석이 바뀌었는지",
    "바꾸지 않은 범위와 보류한 내용",
    "사용자가 큰 틀에서 확인해야 할 판단점",
    "테스트에서 어떤 사용자 동작이나 계산 결과를 검증했는지",
    "코드명, 함수명, 파일명만 나열해서 설명을 대신하지 않는다",
    "## 기술 검증",
    "PROMPT_SCOPE_AUDIT",
    "수용:",
    "폐기:",
    "통합:",
    "보류:",
    "금지선:",
    "내 판단 다음 단계:",
    "문구 테스트가 실패했다는 이유만으로 어색한 기존 문구를 되살리지 않는다",
  ];
  for (const text of resultLogFormatRequirements) {
    if (!resultLogFormat.includes(text)) fail(`05_required_result_log_format missing: ${text}`);
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

  const resultLogPolicyEffectiveDate = "2026-07-11";
  const preContractRootWorkLogs = new Set([
    "docs/v8.3.1_today_score_guidance_surface_ownership_inventory_decision_2026-07-11.md",
    "docs/v8.3.1_today_score_card_semantic_ownership_cleanup_implementation_2026-07-11.md",
  ]);
  const requiredUserFirstHeadings = [
    "### 무엇을 바꿨는지",
    "### 왜 바꿨는지",
    "### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지",
    "### 정책, 산식, 데이터 해석이 바뀌었는지",
    "### 바꾸지 않은 범위와 보류한 내용",
    "### 사용자가 큰 틀에서 확인해야 할 판단점",
    "### 테스트에서 무엇을 검증했는지",
    "## 기술 검증",
  ];
  const datedRootWorkLogs = fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /_(\d{4}-\d{2}-\d{2})\.md$/.test(entry.name))
    .map((entry) => path.join(docsDir, entry.name));

  for (const file of datedRootWorkLogs) {
    const normalized = rel(file);
    const dateMatch = path.basename(file).match(/_(\d{4}-\d{2}-\d{2})\.md$/);
    if (!dateMatch || dateMatch[1] < resultLogPolicyEffectiveDate || preContractRootWorkLogs.has(normalized)) continue;

    const text = fs.readFileSync(file, "utf8");
    const firstLevelTwoHeading = text.match(/^## .+$/m)?.[0] || "";
    if (!/^## 비개발자용(?: 결과)? 설명$/.test(firstLevelTwoHeading)) {
      fail(`new work log must start its narrative sections with non-developer explanation: ${normalized}`);
    }
    for (const heading of requiredUserFirstHeadings) {
      if (!text.includes(heading)) fail(`new work log missing user-first heading '${heading}': ${normalized}`);
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
