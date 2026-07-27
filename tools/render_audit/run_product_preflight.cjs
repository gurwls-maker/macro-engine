const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  REGISTRY_PATH,
  STATUS_INDEX_PATH,
  GITATTRIBUTES_PATH,
  findRepoRoot,
  formatStateContext,
  loadRepositoryGateState,
} = require("./product_gate_registry.cjs");

const root = findRepoRoot(process.cwd());
if (!root) {
  console.error("product preflight failed: git root not found");
  process.exit(1);
}

const requiredFiles = [
  "AGENTS.md",
  GITATTRIBUTES_PATH,
  "docs/00_current_truth/00_READ_FIRST.txt",
  "docs/00_current_truth/02_macro_range_current_truth.txt",
  STATUS_INDEX_PATH,
  "docs/00_current_truth/05_required_result_log_format.txt",
  REGISTRY_PATH,
  ".agents/skills/macro-engine-product-review/SKILL.md",
  ".codex/hooks.json",
  ".github/workflows/product-policy.yml",
  "tools/render_audit/product_gate_registry.cjs",
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
const skill = read(".agents/skills/macro-engine-product-review/SKILL.md");
const hook = JSON.parse(read(".codex/hooks.json"));
const workflow = read(".github/workflows/product-policy.yml");
const packageJson = JSON.parse(read("package.json"));
const workflowLines = workflow.split(/\r?\n/).map((line) => line.trim());
const workflowRuns = (command) => workflowLines.includes(`run: ${command}`);

const contractChecks = [
  [agents.includes("macro-engine-product-review"), "AGENTS.md must route high-risk product work to the repo Skill"],
  [agents.includes("npm run preflight:product"), "AGENTS.md must require the product preflight"],
  [agents.includes(REGISTRY_PATH), "AGENTS.md must route product-gate authority to the registry"],
  [skill.includes("minimal surface") && skill.includes("complete feature"), "repo Skill must separate minimal surface from complete feature"],
  [skill.includes("continuous") && skill.includes("scenario matrix"), "repo Skill must require continuous behavior and scenario coverage"],
  [skill.includes("이번 판정이 닫는 범위") && skill.includes("프로젝트 전체"), "repo Skill must separate local closeout from repository state"],
  [Array.isArray(hook?.hooks?.SessionStart), "project hook must define SessionStart"],
  [workflowRuns("npm run test:product-policy"), "CI must run product-policy checks"],
  [workflowRuns("npm run test:product-gate-registry"), "CI must run product-gate registry structure tests"],
  [workflowRuns("npm run test:daily-coach"), "CI must run DailyCoach tests"],
  [workflowRuns("npm run test:full"), "CI must run the full product suite"],
  [packageJson.scripts?.["preflight:product"] === "node tools/render_audit/run_product_preflight.cjs --check", "package.json must expose preflight:product"],
  [packageJson.scripts?.["test:product-policy"] === "npm run test:docs-policy && npm run preflight:product", "package.json must expose test:product-policy"],
  [packageJson.scripts?.["test:product-gate-registry"] === "node tools/render_audit/test_product_gate_registry.cjs", "package.json must expose product-gate registry structure tests"],
  [currentTruth.includes("continuous"), "current scoring truth must preserve continuous behavior"],
];

const failed = contractChecks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("product preflight failed");
  failed.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

let gateState;
try {
  gateState = loadRepositoryGateState(root, {
    requireTracked: process.env.CI === "true",
  });
} catch (error) {
  console.error("product preflight failed: structured product-gate authority is invalid");
  console.error(`- ${error.message}`);
  process.exit(1);
}

if (process.argv.includes("--states-json")) {
  process.stdout.write(`${JSON.stringify(gateState, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes("--context")) {
  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const dirty = git(["status", "--porcelain"], "") ? "dirty" : "clean";
  process.stdout.write([
    "MACRO-ENGINE PRODUCT PREFLIGHT",
    `- git: ${branch} ${head} (${dirty})`,
    `- gate authority: ${REGISTRY_PATH}`,
    formatStateContext(gateState),
    "- gate registry records execution authority; status prose and result logs are non-authoritative evidence",
    "- a local PASS closes only its named scope; repository-wide product state is derived separately",
    "- every substantive app task: use macro-engine-product-review Skill before editing",
    "- re-check root problem, actual code/data/UI/persistence, strongest alternative, falsification, and full scenario matrix",
    "- numeric physiology work additionally requires anchor-based continuous behavior and boundary checks",
    "- keep the edited surface narrow, but finish the behavior inside that surface",
    "- project hooks require one-time review/trust on each machine; tests and CI remain the hard gate",
    "",
  ].join("\n"));
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.log("product preflight passed");
  console.log(formatStateContext(gateState));
  process.exit(0);
}

console.error("product preflight failed: use --context, --states-json, or --check");
process.exit(1);
