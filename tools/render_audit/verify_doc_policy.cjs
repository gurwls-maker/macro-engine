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
  "docs/README.md",
  "AGENTS.md",
];

for (const file of requiredFiles) requireFile(file);

if (exists("docs/00_current_truth/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt")) {
  fail("master plan source ledger must live under docs/00_current_truth/_source, not current_truth root");
}

if (failures.length === 0) {
  const readFirst = read("docs/00_current_truth/00_READ_FIRST.txt");
  const currentTruth = read("docs/00_current_truth/02_macro_range_current_truth.txt");
  const statusIndex = read("docs/00_current_truth/04_document_status_index.txt");
  const sourceLedger = read("docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt");
  const preamble = read("docs/00_current_truth/templates/new_doc_preamble.txt");
  const readme = read("docs/README.md");
  const agents = read("AGENTS.md");
  const readmeHead = readme.slice(0, 2000);

  const requiredReadmeRoutes = [
    "00_current_truth/00_READ_FIRST.txt",
    "00_current_truth/02_macro_range_current_truth.txt",
    "00_current_truth/04_document_status_index.txt",
    "v8.2_macro_range_*",
  ];
  for (const route of requiredReadmeRoutes) {
    if (!readmeHead.includes(route)) fail(`README top routing missing: ${route}`);
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
    "v8.3 implementation: blocked",
    "docs-policy preflight: active",
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
    "v8.3 implementation: blocked",
    "SUPERSEDE",
    "HISTORICAL",
    "KEEP",
    "REVIEW",
    "기존 최상위/기준 문서 정합성 메모",
  ];
  for (const text of statusRequirements) {
    if (!statusIndex.includes(text)) fail(`04_document_status_index missing: ${text}`);
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
    "v8.3 scoring implementation은 fixture direction table과 test design이 닫히기 전까지 시작하지 않는다",
    "v6.1 alcoholImpactPenalty",
  ];
  for (const text of agentsRequirements) {
    if (!agents.includes(text)) fail(`AGENTS.md missing: ${text}`);
  }

  const allDocs = walk(docsDir);
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

  const v83Docs = allDocs.filter((file) => {
    const name = path.basename(file);
    const normalized = rel(file);
    if (!/^v8\.3_.*\.(md|txt)$/.test(name)) return false;
    if (normalized.includes("docs/00_current_truth/_source/")) return false;
    return true;
  });

  for (const file of v83Docs) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("MANDATORY PRE-READ")) {
      fail(`v8.3 document missing mandatory pre-read block: ${rel(file)}`);
    }
  }

  function hasForbiddenUse(text, pattern) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const index = match.index || 0;
      const context = text.slice(Math.max(0, index - 120), Math.min(text.length, index + 160));
      if (!/(금지|폐기|아님|않|not|must not|FORBIDDEN|forbidden|supersede|SUPERSEDE)/i.test(context)) {
        return true;
      }
    }
    return false;
  }

  const forbiddenChecks = [
    {
      pattern: /exercise bonus\s*[:=]\s*(allowed|true|yes|허용)/gi,
      message: "exercise bonus must not be allowed",
    },
    {
      pattern: /scoreDeltaPreview\s*(mainline|본류)\s*[:=]\s*(allowed|true|yes|허용|재개)/gi,
      message: "scoreDeltaPreview must not be revived as mainline",
    },
    {
      pattern: /v6\.1\s+alcoholImpactPenalty[\s\S]{0,80}(restore|reuse|부활|재사용|되살린다|사용한다)/gi,
      message: "v6.1 alcoholImpactPenalty post-score subtraction must not be revived",
    },
  ];

  const policyDocsToCheck = v83Docs.map((file) => [rel(file), fs.readFileSync(file, "utf8")]);

  for (const [file, text] of policyDocsToCheck) {
    for (const check of forbiddenChecks) {
      if (hasForbiddenUse(text, check.pattern)) fail(`${check.message}: ${file}`);
    }
  }
}

if (failures.length) {
  console.error("docs-policy failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("docs-policy passed");
