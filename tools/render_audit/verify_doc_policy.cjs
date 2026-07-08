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
    "v8.3 target/scoring alignment implementation: pending",
    "target/scoring alignment release blocker",
    "scoreDeltaPreview는 optional audit-only",
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
    "scoreDeltaPreview optional audit-only",
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
    "target/scoring alignment release-blocker 기준",
  ];
  for (const text of statusRequirements) {
    if (!statusIndex.includes(text)) fail(`04_document_status_index missing: ${text}`);
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
    "release blocker",
    "score `83.712`",
    "target/scoring alignment implementation",
  ];
  for (const text of readmeIncidentRequirements) {
    if (!readme.includes(text)) fail(`README missing target/scoring incident routing: ${text}`);
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
    if (!/^v8\.3_.*\.(md|txt)$/.test(name)) return false;
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
