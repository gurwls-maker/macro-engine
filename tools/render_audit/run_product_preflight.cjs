const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function findRepoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const root = findRepoRoot(process.cwd());
if (!root) {
  console.error("product preflight failed: git root not found");
  process.exit(1);
}

const requiredFiles = [
  "AGENTS.md",
  "docs/00_current_truth/00_READ_FIRST.txt",
  "docs/00_current_truth/02_macro_range_current_truth.txt",
  "docs/00_current_truth/04_document_status_index.txt",
  "docs/00_current_truth/05_required_result_log_format.txt",
  ".agents/skills/macro-engine-product-review/SKILL.md",
  ".codex/hooks.json",
  ".github/workflows/product-policy.yml",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`product preflight failed: missing ${missing.join(", ")}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const agents = read("AGENTS.md");
const currentTruth = read("docs/00_current_truth/02_macro_range_current_truth.txt");
const statusIndex = read("docs/00_current_truth/04_document_status_index.txt");
const skill = read(".agents/skills/macro-engine-product-review/SKILL.md");
const hook = JSON.parse(read(".codex/hooks.json"));
const workflow = read(".github/workflows/product-policy.yml");
const packageJson = JSON.parse(read("package.json"));

const contractChecks = [
  [agents.includes("macro-engine-product-review"), "AGENTS.md must route high-risk product work to the repo Skill"],
  [agents.includes("npm run preflight:product"), "AGENTS.md must require the product preflight"],
  [skill.includes("minimal surface") && skill.includes("complete feature"), "repo Skill must separate minimal surface from complete feature"],
  [skill.includes("continuous") && skill.includes("scenario matrix"), "repo Skill must require continuous behavior and scenario coverage"],
  [Array.isArray(hook?.hooks?.SessionStart), "project hook must define SessionStart"],
  [workflow.includes("npm run test:product-policy"), "CI must run product-policy checks"],
  [workflow.includes("npm run test:daily-coach"), "CI must run DailyCoach tests"],
  [packageJson.scripts?.["preflight:product"] === "node tools/render_audit/run_product_preflight.cjs --check", "package.json must expose preflight:product"],
  [packageJson.scripts?.["test:product-policy"] === "npm run test:docs-policy && npm run preflight:product", "package.json must expose test:product-policy"],
];

const failed = contractChecks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("product preflight failed");
  failed.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

if (process.argv.includes("--context")) {
  const activeScore = agents.match(/`(v8\.4_[^`]+)`/)?.[1] || "read current truth";
  const dailyCoachState = statusIndex.match(/58\. v8\.3\.1 DailyCoach semantic v2 phase 1\.[\s\S]*?- 상태: ([^\r\n]+)/)?.[1] || "check status index";
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const dirty = git(["status", "--porcelain"], "") ? "dirty" : "clean";
  process.stdout.write([
    "MACRO-ENGINE PRODUCT PREFLIGHT",
    `- git: ${branch} ${head} (${dirty})`,
    `- active score: ${activeScore}`,
    `- documented DailyCoach state: ${dailyCoachState} (hypothesis; verify against code and user intent)`,
    "- every substantive app task: use macro-engine-product-review Skill before editing",
    "- re-check root problem, actual code/data/UI/persistence, strongest alternative, falsification, and full scenario matrix",
    "- numeric physiology work additionally requires anchor-based continuous behavior and boundary checks",
    "- keep the edited surface narrow, but finish the behavior inside that surface",
    "- project hooks require one-time review/trust on each machine; tests and CI remain the hard gate",
    "",
  ].join("\n"));
  process.exit(0);
}

if (!currentTruth.includes("continuous") || !statusIndex.includes("REQUIRED_NEXT_GATES")) {
  console.error("product preflight failed: current truth routing is incomplete");
  process.exit(1);
}

console.log("product preflight passed");
