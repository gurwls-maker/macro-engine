const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { TextDecoder } = require("util");

const REGISTRY_PATH = "docs/00_current_truth/product_gates.json";
const STATUS_INDEX_PATH = "docs/00_current_truth/04_document_status_index.txt";
const GITATTRIBUTES_PATH = ".gitattributes";
const SUMMARY_BEGIN = "CURRENT_PRODUCT_GATES_GENERATED_BEGIN";
const SUMMARY_END = "CURRENT_PRODUCT_GATES_GENERATED_END";
const SCHEMA_VERSION = 1;
const EXPECTED_GITATTRIBUTES = [
  `/${GITATTRIBUTES_PATH} text eol=lf`,
  `/${REGISTRY_PATH} text eol=lf`,
  `/${STATUS_INDEX_PATH} text eol=lf`,
  "",
].join("\n");

const GATE_CATALOG = Object.freeze([
  Object.freeze({ id: "dailycoach-semantic-v2", label: "DailyCoach semantic v2" }),
  Object.freeze({ id: "dailycoach-activity-context", label: "DailyCoach activity-context" }),
  Object.freeze({ id: "component-score-aggregation", label: "component aggregation" }),
  Object.freeze({ id: "component-score-candidate-selection", label: "component candidate selection" }),
  Object.freeze({ id: "coach-voice", label: "Coach voice" }),
  Object.freeze({ id: "broad-tooltip-glossary", label: "broad tooltip/glossary" }),
  Object.freeze({ id: "copy-batch-2", label: "copy batch 2" }),
]);

const ALLOWED_STATES = Object.freeze([
  "required",
  "optional",
  "blocked",
  "deferred",
  "implemented",
  "audit_pass",
]);

const ALLOWED_STATE_SET = new Set(ALLOWED_STATES);
const EXPECTED_IDS = GATE_CATALOG.map((gate) => gate.id);

class GateRegistryError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "GateRegistryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new GateRegistryError(code, message);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, expectedKeys, context) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("GATE_SCHEMA_INVALID", `${context} keys must be exactly ${expected.join(", ")}`);
  }
}

function validateRegistry(registry) {
  if (!isPlainObject(registry)) {
    fail("GATE_SCHEMA_INVALID", "registry root must be an object");
  }
  assertExactKeys(registry, ["schemaVersion", "gates"], "registry");
  if (registry.schemaVersion !== SCHEMA_VERSION) {
    fail("GATE_SCHEMA_INVALID", `schemaVersion must be integer ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(registry.gates)) {
    fail("GATE_SCHEMA_INVALID", "gates must be an array");
  }

  const ids = [];
  registry.gates.forEach((gate, index) => {
    if (!isPlainObject(gate)) {
      fail("GATE_SCHEMA_INVALID", `gate at index ${index} must be an object`);
    }
    assertExactKeys(gate, ["id", "state"], `gate at index ${index}`);
    if (typeof gate.id !== "string" || typeof gate.state !== "string") {
      fail("GATE_SCHEMA_INVALID", `gate id and state at index ${index} must be strings`);
    }
    if (ids.includes(gate.id)) {
      fail("GATE_ID_DUPLICATE", `duplicate gate id ${gate.id}`);
    }
    if (!EXPECTED_IDS.includes(gate.id)) {
      fail("GATE_ID_UNKNOWN", `unknown gate id ${gate.id}`);
    }
    if (!ALLOWED_STATE_SET.has(gate.state)) {
      fail("GATE_STATE_INVALID", `invalid state ${gate.state} for ${gate.id}`);
    }
    ids.push(gate.id);
  });

  const missing = EXPECTED_IDS.filter((id) => !ids.includes(id));
  if (missing.length) {
    fail("GATE_ID_MISSING", `missing gate ids: ${missing.join(", ")}`);
  }
  if (ids.length !== EXPECTED_IDS.length) {
    fail("GATE_SCHEMA_INVALID", `expected ${EXPECTED_IDS.length} gates`);
  }
  if (ids.some((id, index) => id !== EXPECTED_IDS[index])) {
    fail("GATE_SCHEMA_INVALID", "gates must use canonical ID order");
  }
  return registry;
}

function decodeUtf8Strict(bytes, context) {
  if (!Buffer.isBuffer(bytes)) {
    fail("GATE_FILE_UTF8", `${context} must be read as bytes`);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("GATE_FILE_UTF8", `${context} must not contain a UTF-8 BOM`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("GATE_FILE_UTF8", `${context} is not strict UTF-8`);
  }
}

function renderRegistry(registry) {
  validateRegistry(registry);
  const canonical = {
    schemaVersion: SCHEMA_VERSION,
    gates: registry.gates.map(({ id, state }) => ({ id, state })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

function parseRegistryBytes(bytes) {
  const text = decodeUtf8Strict(bytes, REGISTRY_PATH);
  if (text.includes("\r")) {
    fail("GATE_FILE_EOL", `${REGISTRY_PATH} must use LF line endings`);
  }
  let registry;
  try {
    registry = JSON.parse(text);
  } catch (error) {
    fail("GATE_JSON_INVALID", `invalid JSON: ${error.message}`);
  }
  validateRegistry(registry);
  if (text !== renderRegistry(registry)) {
    fail("GATE_SCHEMA_INVALID", "registry must use canonical JSON serialization");
  }
  return registry;
}

function deriveProjectState(registry) {
  validateRegistry(registry);
  const requiredGateIds = registry.gates
    .filter((gate) => gate.state === "required")
    .map((gate) => gate.id);
  return {
    requiredGateIds,
    projectState: requiredGateIds.length ? "required" : "monitor",
  };
}

function renderGeneratedSummary(registry) {
  validateRegistry(registry);
  const stateById = new Map(registry.gates.map((gate) => [gate.id, gate.state]));
  const { requiredGateIds, projectState } = deriveProjectState(registry);
  return [
    SUMMARY_BEGIN,
    "CURRENT PRODUCT GATES — GENERATED, DO NOT EDIT",
    `source: ${REGISTRY_PATH}`,
    `schema-version: ${SCHEMA_VERSION}`,
    ...GATE_CATALOG.map((gate) => `- ${gate.label} [${gate.id}]: ${stateById.get(gate.id)}`),
    `- required gate ids: ${requiredGateIds.length ? requiredGateIds.join(", ") : "none"}`,
    `- project state: ${projectState}`,
    SUMMARY_END,
  ].join("\n");
}

function assertGeneratedSummaryText(statusText, registry) {
  if (String(statusText).includes("\r")) {
    fail("GATE_FILE_EOL", `${STATUS_INDEX_PATH} must use LF line endings`);
  }
  const lines = String(statusText).split("\n");
  const beginIndexes = [];
  const endIndexes = [];
  lines.forEach((line, index) => {
    if (line === SUMMARY_BEGIN) beginIndexes.push(index);
    if (line === SUMMARY_END) endIndexes.push(index);
  });
  if (beginIndexes.length !== 1 || endIndexes.length !== 1 || beginIndexes[0] >= endIndexes[0]) {
    fail("GATE_SUMMARY_DRIFT", "status index must contain one ordered generated gate block");
  }
  const actual = lines.slice(beginIndexes[0], endIndexes[0] + 1).join("\n");
  if (actual !== renderGeneratedSummary(registry)) {
    fail("GATE_SUMMARY_DRIFT", "generated gate block differs from registry");
  }
}

function assertGitAttributesText(attributesText) {
  const text = String(attributesText);
  if (text.includes("\r")) {
    fail("GATE_FILE_EOL", `${GITATTRIBUTES_PATH} must use LF line endings`);
  }
  if (!text.endsWith("\n")) {
    fail("GATE_ATTRIBUTES_DRIFT", `${GITATTRIBUTES_PATH} must end with LF`);
  }
  const lines = text.split("\n");
  const requiredLines = EXPECTED_GITATTRIBUTES.trimEnd().split("\n");
  for (const requiredLine of requiredLines) {
    if (lines.filter((line) => line === requiredLine).length !== 1) {
      fail("GATE_ATTRIBUTES_DRIFT", `${GITATTRIBUTES_PATH} must contain exactly one '${requiredLine}' rule`);
    }
  }
}

function assertEffectiveGitAttributes(root) {
  for (const relativePath of [GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH]) {
    const output = git(
      root,
      ["check-attr", "text", "eol", "filter", "working-tree-encoding", "--", relativePath]
    );
    const expected = [
      `${relativePath}: text: set`,
      `${relativePath}: eol: lf`,
      `${relativePath}: filter: unspecified`,
      `${relativePath}: working-tree-encoding: unspecified`,
    ].join("\n");
    if (output !== expected) {
      fail("GATE_ATTRIBUTES_DRIFT", `${relativePath} must have effective text and eol=lf attributes`);
    }
  }
}

function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail("GATE_FILE_MODE", `git inspection failed: ${error.stderr?.trim() || error.message}`);
  }
}

function assertRegularFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    fail("GATE_FILE_TYPE", `missing required file ${relativePath}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail("GATE_FILE_TYPE", `${relativePath} must be a regular file`);
  }
}

function readHeadObjectId(root, relativePath) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--verify", `HEAD:${relativePath}`],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim();
  } catch {
    return null;
  }
}

function inspectGitIndexMode(root, relativePath, requireTracked = false) {
  const output = git(root, ["ls-files", "--stage", "--", relativePath]);
  if (!output) {
    if (readHeadObjectId(root, relativePath)) {
      fail("GATE_FILE_CONTENT_MISMATCH", `${relativePath} is staged for deletion`);
    }
    if (requireTracked) fail("GATE_FILE_MODE", `${relativePath} must be tracked in CI`);
    return { tracked: false, mode: null, objectId: null };
  }
  const lines = output.split(/\r?\n/).filter(Boolean);
  const match = lines.length === 1
    ? lines[0].match(/^([0-9]{6}) ([0-9a-f]{40,64}) 0\t(.+)$/)
    : null;
  if (!match || match[3].replace(/\\/g, "/") !== relativePath) {
    fail("GATE_FILE_MODE", `${relativePath} must have one valid stage-0 index entry`);
  }
  if (match[1] !== "100644") {
    fail("GATE_FILE_MODE", `${relativePath} index mode must be 100644, found ${match[1]}`);
  }
  return { tracked: true, mode: match[1], objectId: match[2] };
}

function assertRepositoryFile(root, relativePath, options = {}) {
  assertRegularFile(root, relativePath);
  const requireTracked = options.requireTracked === true;
  const entry = inspectGitIndexMode(root, relativePath, requireTracked);
  if (entry.tracked) {
    const workingObjectId = git(root, ["hash-object", "--no-filters", "--", relativePath]);
    const headObjectId = readHeadObjectId(root, relativePath);
    const indexContainsCandidateChange = headObjectId !== entry.objectId;
    if (
      workingObjectId !== entry.objectId
      && (requireTracked || indexContainsCandidateChange)
    ) {
      fail(
        "GATE_FILE_CONTENT_MISMATCH",
        `${relativePath} working bytes must match a staged candidate or the tracked CI entry`
      );
    }
  }
  return entry;
}

function assertAuthoritySetSnapshot(root, options = {}) {
  const requireTracked = options.requireTracked === true;
  const relativePaths = [GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH];
  const snapshots = relativePaths.map((relativePath) => {
    const entry = inspectGitIndexMode(root, relativePath, requireTracked);
    return {
      relativePath,
      entry,
      headObjectId: readHeadObjectId(root, relativePath),
    };
  });
  const hasStagedAuthorityChange = snapshots.some(
    ({ entry, headObjectId }) => entry.objectId !== headObjectId
  );
  if (!hasStagedAuthorityChange && !requireTracked) return;

  for (const { relativePath, entry } of snapshots) {
    if (!entry.tracked) {
      fail(
        "GATE_FILE_CONTENT_MISMATCH",
        "all product-gate authority files must be staged together"
      );
    }
    const workingObjectId = git(root, ["hash-object", "--no-filters", "--", relativePath]);
    if (workingObjectId !== entry.objectId) {
      fail(
        "GATE_FILE_CONTENT_MISMATCH",
        `${relativePath} working bytes must match the atomic authority snapshot`
      );
    }
  }
}

function loadRepositoryRegistry(root, options = {}) {
  const requireTracked = options.requireTracked === true;
  assertRepositoryFile(root, GITATTRIBUTES_PATH, { requireTracked });
  assertRepositoryFile(root, REGISTRY_PATH, { requireTracked });
  const attributesText = decodeUtf8Strict(
    fs.readFileSync(path.join(root, GITATTRIBUTES_PATH)),
    GITATTRIBUTES_PATH
  );
  assertGitAttributesText(attributesText);
  assertEffectiveGitAttributes(root);
  const registry = parseRegistryBytes(fs.readFileSync(path.join(root, REGISTRY_PATH)));
  return { registry, ...deriveProjectState(registry) };
}

function loadRepositoryGateState(root, options = {}) {
  const requireTracked = options.requireTracked === true;
  const state = loadRepositoryRegistry(root, { requireTracked });
  assertRepositoryFile(root, STATUS_INDEX_PATH, { requireTracked });
  assertAuthoritySetSnapshot(root, { requireTracked });
  const statusText = decodeUtf8Strict(
    fs.readFileSync(path.join(root, STATUS_INDEX_PATH)),
    STATUS_INDEX_PATH
  );
  assertGeneratedSummaryText(statusText, state.registry);
  return state;
}

function findRepoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function formatStateContext(state) {
  const stateById = new Map(state.registry.gates.map((gate) => [gate.id, gate.state]));
  return [
    ...GATE_CATALOG.map((gate) => `- ${gate.label}: ${stateById.get(gate.id)}`),
    `- required gate ids: ${state.requiredGateIds.length ? state.requiredGateIds.join(", ") : "none"}`,
    `- project state: ${state.projectState}`,
  ].join("\n");
}

function runCli() {
  const root = findRepoRoot(process.cwd());
  if (!root) fail("GATE_FILE_TYPE", "git root not found");
  if (process.argv.includes("--render-summary")) {
    const state = loadRepositoryRegistry(root, {
      requireTracked: process.env.CI === "true",
    });
    process.stdout.write(`${renderGeneratedSummary(state.registry)}\n`);
    return;
  }
  const state = loadRepositoryGateState(root, {
    requireTracked: process.env.CI === "true",
  });
  if (process.argv.includes("--states-json")) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--check")) {
    console.log("product gate registry passed");
    console.log(formatStateContext(state));
    return;
  }
  fail("GATE_SCHEMA_INVALID", "use --check, --states-json, or --render-summary");
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(`product gate registry failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  ALLOWED_STATES,
  EXPECTED_GITATTRIBUTES,
  GATE_CATALOG,
  GITATTRIBUTES_PATH,
  REGISTRY_PATH,
  SCHEMA_VERSION,
  STATUS_INDEX_PATH,
  SUMMARY_BEGIN,
  SUMMARY_END,
  GateRegistryError,
  assertGeneratedSummaryText,
  assertAuthoritySetSnapshot,
  assertEffectiveGitAttributes,
  assertGitAttributesText,
  assertRegularFile,
  assertRepositoryFile,
  decodeUtf8Strict,
  deriveProjectState,
  findRepoRoot,
  formatStateContext,
  inspectGitIndexMode,
  loadRepositoryGateState,
  loadRepositoryRegistry,
  readHeadObjectId,
  parseRegistryBytes,
  renderGeneratedSummary,
  renderRegistry,
  validateRegistry,
};
