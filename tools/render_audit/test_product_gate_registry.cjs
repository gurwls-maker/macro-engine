const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  ALLOWED_STATES,
  EXPECTED_GITATTRIBUTES,
  GATE_CATALOG,
  GITATTRIBUTES_PATH,
  REGISTRY_PATH,
  SCHEMA_VERSION,
  STATUS_INDEX_PATH,
  SUMMARY_BEGIN,
  SUMMARY_END,
  assertGeneratedSummaryText,
  assertGitAttributesText,
  assertRegularFile,
  assertRepositoryFile,
  deriveProjectState,
  loadRepositoryGateState,
  loadRepositoryRegistry,
  parseRegistryBytes,
  renderGeneratedSummary,
  renderRegistry,
  validateRegistry,
} = require("./product_gate_registry.cjs");

const EXPECTED_IDS = GATE_CATALOG.map((gate) => gate.id);

function fixtureRegistry(states = {}) {
  const defaults = {
    "dailycoach-semantic-v2": "implemented",
    "dailycoach-activity-context": "audit_pass",
    "component-score-aggregation": "deferred",
    "component-score-candidate-selection": "blocked",
    "coach-voice": "optional",
    "broad-tooltip-glossary": "optional",
    "copy-batch-2": "optional",
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    gates: EXPECTED_IDS.map((id) => ({ id, state: states[id] || defaults[id] })),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectFailure(expectedCode, callback, label) {
  let error = null;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  if (!error || error.code !== expectedCode) {
    throw new Error(`registry test failed (${label}): expected ${expectedCode}, got ${error?.code || "PASS"}`);
  }
}

function runInMemoryRegistryTests() {
  const valid = fixtureRegistry();
  const canonicalBytes = Buffer.from(renderRegistry(valid), "utf8");
  parseRegistryBytes(canonicalBytes);
  expectFailure(
    "GATE_FILE_EOL",
    () => parseRegistryBytes(Buffer.from(renderRegistry(valid).replace(/\n/g, "\r\n"), "utf8")),
    "CRLF registry"
  );
  expectFailure(
    "GATE_FILE_EOL",
    () => parseRegistryBytes(Buffer.from(renderRegistry(valid).replace(/\n/g, "\r"), "utf8")),
    "bare-CR registry"
  );

  expectFailure("GATE_JSON_INVALID", () => parseRegistryBytes(Buffer.from("{", "utf8")), "invalid JSON");
  expectFailure("GATE_FILE_UTF8", () => parseRegistryBytes(Buffer.from([0xff])), "invalid UTF-8");
  expectFailure(
    "GATE_FILE_UTF8",
    () => parseRegistryBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonicalBytes])),
    "BOM"
  );
  expectFailure(
    "GATE_SCHEMA_INVALID",
    () => parseRegistryBytes(Buffer.from(`${renderRegistry(valid)} `, "utf8")),
    "noncanonical serialization"
  );
  expectFailure(
    "GATE_SCHEMA_INVALID",
    () => parseRegistryBytes(Buffer.from(
      renderRegistry(valid).replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
      "utf8"
    )),
    "duplicate JSON member"
  );

  for (const root of [null, true, 1, "registry", []]) {
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(root), `root type ${String(root)}`);
  }
  for (const schemaVersion of [undefined, null, true, "1", [], {}, 0, 2, 1.5]) {
    const candidate = clone(valid);
    if (schemaVersion === undefined) delete candidate.schemaVersion;
    else candidate.schemaVersion = schemaVersion;
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(candidate), `schemaVersion ${String(schemaVersion)}`);
  }
  for (const gates of [null, true, 1, "gates", {}]) {
    const candidate = clone(valid);
    candidate.gates = gates;
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(candidate), `gates type ${String(gates)}`);
  }

  const extraRoot = clone(valid);
  extraRoot.requiredNext = false;
  expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(extraRoot), "extra root property");
  const extraGate = clone(valid);
  extraGate.gates[0].requiredNext = false;
  expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(extraGate), "extra gate property");
  for (const gateValue of [null, true, 1, "gate", []]) {
    const candidate = clone(valid);
    candidate.gates[0] = gateValue;
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(candidate), `gate type ${String(gateValue)}`);
  }
  for (const missingKey of ["id", "state"]) {
    const candidate = clone(valid);
    delete candidate.gates[0][missingKey];
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(candidate), `missing gate key ${missingKey}`);
  }
  for (const invalidId of [null, true, 1, [], {}]) {
    const candidate = clone(valid);
    candidate.gates[0].id = invalidId;
    expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(candidate), `invalid id type ${String(invalidId)}`);
  }

  for (let index = 0; index < EXPECTED_IDS.length; index += 1) {
    const missing = clone(valid);
    missing.gates.splice(index, 1);
    expectFailure("GATE_ID_MISSING", () => validateRegistry(missing), `missing ${EXPECTED_IDS[index]}`);
  }
  for (let index = 1; index < EXPECTED_IDS.length; index += 1) {
    const duplicate = clone(valid);
    duplicate.gates[index] = clone(duplicate.gates[0]);
    expectFailure("GATE_ID_DUPLICATE", () => validateRegistry(duplicate), `duplicate ${EXPECTED_IDS[0]}`);
  }

  const unknown = clone(valid);
  unknown.gates[0].id = "unknown-gate";
  expectFailure("GATE_ID_UNKNOWN", () => validateRegistry(unknown), "unknown ID");
  const reordered = clone(valid);
  [reordered.gates[0], reordered.gates[1]] = [reordered.gates[1], reordered.gates[0]];
  expectFailure("GATE_SCHEMA_INVALID", () => validateRegistry(reordered), "reordered IDs");

  for (const state of ALLOWED_STATES) {
    validateRegistry(fixtureRegistry({ "coach-voice": state }));
  }
  for (const state of ["Required", " required", "required ", "unknown", "", null, 1]) {
    const candidate = clone(valid);
    candidate.gates[4].state = state;
    expectFailure(
      typeof state === "string" ? "GATE_STATE_INVALID" : "GATE_SCHEMA_INVALID",
      () => validateRegistry(candidate),
      `invalid state ${String(state)}`
    );
  }

  const noneRequired = deriveProjectState(valid);
  if (noneRequired.projectState !== "monitor" || noneRequired.requiredGateIds.length !== 0) {
    throw new Error("registry test failed: zero-required derivation");
  }
  const oneRequired = deriveProjectState(fixtureRegistry({ "coach-voice": "required" }));
  if (oneRequired.projectState !== "required" || oneRequired.requiredGateIds.join(",") !== "coach-voice") {
    throw new Error("registry test failed: one-required derivation");
  }
  const manyRequired = deriveProjectState(fixtureRegistry({
    "dailycoach-semantic-v2": "required",
    "coach-voice": "required",
  }));
  if (
    manyRequired.projectState !== "required"
    || manyRequired.requiredGateIds.join(",") !== "dailycoach-semantic-v2,coach-voice"
  ) {
    throw new Error("registry test failed: multi-required derivation");
  }

  const summary = renderGeneratedSummary(valid);
  assertGeneratedSummaryText(summary, valid);
  assertGeneratedSummaryText(`${summary}\n\n자유서술은 실행 권위가 아니다.`, valid);
  const conflictingProse = `${summary}\n\n### 코치 말투부터 개발하겠습니다.\nCoach voice is required.\n`;
  assertGeneratedSummaryText(conflictingProse, valid);
  const conflictingProseState = deriveProjectState(valid);
  if (
    conflictingProseState.projectState !== "monitor"
    || conflictingProseState.requiredGateIds.length !== 0
    || valid.gates.find((gate) => gate.id === "coach-voice")?.state !== "optional"
  ) {
    throw new Error("registry test failed: non-authoritative prose changed derived state");
  }
  expectFailure(
    "GATE_FILE_EOL",
    () => assertGeneratedSummaryText(summary.replace(/\n/g, "\r\n"), valid),
    "CRLF status index"
  );
  expectFailure(
    "GATE_FILE_EOL",
    () => assertGeneratedSummaryText(summary.replace(/\n/g, "\r"), valid),
    "bare-CR status index"
  );
  const summaryLines = summary.split("\n");
  const reorderedSummaryLines = [...summaryLines];
  [reorderedSummaryLines[4], reorderedSummaryLines[5]] = [
    reorderedSummaryLines[5],
    reorderedSummaryLines[4],
  ];
  for (const mutated of [
    summary.replace(SUMMARY_BEGIN, ""),
    summary.replace(SUMMARY_END, ""),
    `${summary}\n${SUMMARY_BEGIN}\n${SUMMARY_END}`,
    summaryLines.filter((_, index) => index !== 4).join("\n"),
    reorderedSummaryLines.join("\n"),
    summary.replace(SUMMARY_END, "- unexpected generated field: true\nCURRENT_PRODUCT_GATES_GENERATED_END"),
    summary.replace(": optional", ": required"),
    summary.replace("- project state: monitor", "- project state: required"),
    summary.replace("- required gate ids: none", "- required gate ids: coach-voice"),
  ]) {
    expectFailure(
      "GATE_SUMMARY_DRIFT",
      () => assertGeneratedSummaryText(mutated, valid),
      "generated summary drift"
    );
  }

  assertGitAttributesText(EXPECTED_GITATTRIBUTES);
  assertGitAttributesText(`${EXPECTED_GITATTRIBUTES}*.md text eol=lf\n`);
  expectFailure(
    "GATE_FILE_EOL",
    () => assertGitAttributesText(EXPECTED_GITATTRIBUTES.replace(/\n/g, "\r\n")),
    "CRLF gitattributes"
  );
  expectFailure(
    "GATE_ATTRIBUTES_DRIFT",
    () => assertGitAttributesText(`/${REGISTRY_PATH} text eol=lf\n`),
    "missing status-index gitattributes rule"
  );
}

function initTempGitRepo(setupProbe = null) {
  const tempBase = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempBase, "macro-engine-gate-fixture-"));
  try {
    if (setupProbe) setupProbe(root);
    const emptyTemplate = path.join(root, "empty-git-template");
    fs.mkdirSync(emptyTemplate);
    execFileSync("git", ["init", "--quiet", `--template=${emptyTemplate}`], { cwd: root });
    fs.rmdirSync(emptyTemplate);
    const emptyHooks = path.join(root, ".git", "codex-empty-hooks");
    fs.mkdirSync(emptyHooks);
    const emptyGlobalAttributes = path.join(root, ".git", "codex-empty-attributes");
    fs.writeFileSync(emptyGlobalAttributes, "", "utf8");
    execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Gate Fixture"], { cwd: root });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    execFileSync("git", ["config", "core.hooksPath", emptyHooks], { cwd: root });
    execFileSync("git", ["config", "core.attributesFile", emptyGlobalAttributes], { cwd: root });
    execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
    const registryPath = path.join(root, REGISTRY_PATH);
    const statusPath = path.join(root, STATUS_INDEX_PATH);
    const attributesPath = path.join(root, GITATTRIBUTES_PATH);
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, renderRegistry(fixtureRegistry()), "utf8");
    fs.writeFileSync(statusPath, `${renderGeneratedSummary(fixtureRegistry())}\n`, "utf8");
    fs.writeFileSync(attributesPath, EXPECTED_GITATTRIBUTES, "utf8");
    execFileSync(
      "git",
      ["add", "--", GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH],
      { cwd: root }
    );
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    return root;
  } catch (error) {
    cleanupTempGitRepo(root);
    throw error;
  }
}

function cleanupTempGitRepo(root) {
  const resolved = path.resolve(root);
  const tempBase = path.resolve(os.tmpdir());
  if (
    path.dirname(resolved) !== tempBase
    || !path.basename(resolved).startsWith("macro-engine-gate-fixture-")
  ) {
    throw new Error(`unsafe gate fixture cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function withTempGitRepo(callback) {
  const root = initTempGitRepo();
  try {
    callback(root);
  } finally {
    cleanupTempGitRepo(root);
  }
  if (fs.existsSync(root)) throw new Error("gate fixture cleanup failed");
}

function runGitModeTests() {
  let failedSetupRoot = null;
  expectFailure(
    "FIXTURE_SETUP_PROBE",
    () => {
      try {
        initTempGitRepo((root) => {
          failedSetupRoot = root;
          const error = new Error("fixture setup probe");
          error.code = "FIXTURE_SETUP_PROBE";
          throw error;
        });
      } finally {
        if (failedSetupRoot && fs.existsSync(failedSetupRoot)) {
          throw new Error("fixture setup failure was not cleaned");
        }
      }
    },
    "fixture setup cleanup"
  );

  withTempGitRepo((root) => {
    const state = loadRepositoryGateState(root, { requireTracked: true });
    if (state.projectState !== "monitor" || state.requiredGateIds.length !== 0) {
      throw new Error("registry test failed: repository state derivation");
    }
    const resultLogPath = path.join(root, "docs", "non_authoritative_result.md");
    fs.writeFileSync(
      resultLogPath,
      "### 코치 말투부터 개발하겠습니다.\nCoach voice is required.\n",
      "utf8"
    );
    const stateWithConflictingResultLog = loadRepositoryGateState(root, { requireTracked: true });
    if (
      stateWithConflictingResultLog.projectState !== "monitor"
      || stateWithConflictingResultLog.requiredGateIds.length !== 0
    ) {
      throw new Error("registry test failed: result-log prose changed repository state");
    }
  });

  withTempGitRepo((root) => {
    const statusPath = path.join(root, STATUS_INDEX_PATH);
    fs.appendFileSync(statusPath, "\n### 코치 말투부터 개발하겠습니다.\n", "utf8");
    const state = loadRepositoryGateState(root, { requireTracked: false });
    if (state.projectState !== "monitor" || state.requiredGateIds.length !== 0) {
      throw new Error("registry test failed: ordinary unstaged prose changed repository state");
    }
  });

  withTempGitRepo((root) => {
    const changedRegistry = fixtureRegistry({ "coach-voice": "required" });
    fs.writeFileSync(path.join(root, REGISTRY_PATH), renderRegistry(changedRegistry), "utf8");
    expectFailure(
      "GATE_SUMMARY_DRIFT",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "stale mirror before regeneration"
    );
    const registryOnlyState = loadRepositoryRegistry(root, { requireTracked: false });
    if (
      registryOnlyState.projectState !== "required"
      || !renderGeneratedSummary(registryOnlyState.registry).includes("- project state: required")
    ) {
      throw new Error("registry test failed: summary recovery path");
    }
  });

  withTempGitRepo((root) => {
    const changedRegistry = fixtureRegistry({ "coach-voice": "required" });
    fs.writeFileSync(path.join(root, REGISTRY_PATH), renderRegistry(changedRegistry), "utf8");
    fs.writeFileSync(
      path.join(root, STATUS_INDEX_PATH),
      `${renderGeneratedSummary(changedRegistry)}\n`,
      "utf8"
    );
    execFileSync("git", ["add", "--", REGISTRY_PATH], { cwd: root });
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "cross-file partial authority stage"
    );
    execFileSync("git", ["add", "--", STATUS_INDEX_PATH], { cwd: root });
    const state = loadRepositoryGateState(root, { requireTracked: false });
    if (state.projectState !== "required" || state.requiredGateIds.join(",") !== "coach-voice") {
      throw new Error("registry test failed: complete atomic authority stage");
    }
  });

  withTempGitRepo((root) => {
    const registryPath = path.join(root, REGISTRY_PATH);
    const canonical = fs.readFileSync(registryPath);
    fs.writeFileSync(registryPath, "{\n", "utf8");
    execFileSync("git", ["add", "--", REGISTRY_PATH], { cwd: root });
    fs.writeFileSync(registryPath, canonical);
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "locally staged registry differs from working bytes"
    );
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => loadRepositoryGateState(root, { requireTracked: true }),
      "staged registry differs from working bytes"
    );
  });

  withTempGitRepo((root) => {
    for (const relativePath of [GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH]) {
      execFileSync("git", ["rm", "--cached", "--quiet", "--", relativePath], { cwd: root });
      expectFailure(
        "GATE_FILE_CONTENT_MISMATCH",
        () => loadRepositoryGateState(root, { requireTracked: false }),
        `locally staged deletion of ${relativePath}`
      );
      execFileSync("git", ["add", "--", relativePath], { cwd: root });
    }
  });

  withTempGitRepo((root) => {
    const statusPath = path.join(root, STATUS_INDEX_PATH);
    const canonical = fs.readFileSync(statusPath);
    fs.writeFileSync(statusPath, "invalid generated summary\n", "utf8");
    execFileSync("git", ["add", "--", STATUS_INDEX_PATH], { cwd: root });
    fs.writeFileSync(statusPath, canonical);
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "locally staged status index differs from working bytes"
    );
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => loadRepositoryGateState(root, { requireTracked: true }),
      "staged status index differs from working bytes"
    );
  });

  withTempGitRepo((root) => {
    execFileSync("git", ["update-index", "--chmod=+x", "--", REGISTRY_PATH], { cwd: root });
    expectFailure(
      "GATE_FILE_MODE",
      () => assertRepositoryFile(root, REGISTRY_PATH, { requireTracked: true }),
      "executable mode"
    );
  });

  withTempGitRepo((root) => {
    const blob = execFileSync("git", ["hash-object", "-w", "--", REGISTRY_PATH], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    execFileSync(
      "git",
      ["update-index", "--add", "--cacheinfo", `120000,${blob},${REGISTRY_PATH}`],
      { cwd: root }
    );
    expectFailure(
      "GATE_FILE_MODE",
      () => assertRepositoryFile(root, REGISTRY_PATH, { requireTracked: true }),
      "symlink index mode"
    );
  });

  withTempGitRepo((root) => {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    execFileSync(
      "git",
      ["update-index", "--add", "--cacheinfo", `160000,${commit},${REGISTRY_PATH}`],
      { cwd: root }
    );
    expectFailure(
      "GATE_FILE_MODE",
      () => assertRepositoryFile(root, REGISTRY_PATH, { requireTracked: true }),
      "gitlink index mode"
    );
  });

  withTempGitRepo((root) => {
    fs.appendFileSync(path.join(root, GITATTRIBUTES_PATH), "*.json -text\n", "utf8");
    expectFailure(
      "GATE_ATTRIBUTES_DRIFT",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "conflicting effective attributes"
    );
  });

  withTempGitRepo((root) => {
    const registryPath = path.join(root, REGISTRY_PATH);
    fs.appendFileSync(
      path.join(root, GITATTRIBUTES_PATH),
      `/${REGISTRY_PATH} filter=gateprobe\n`,
      "utf8"
    );
    execFileSync(
      "git",
      ["config", "filter.gateprobe.clean", `git show HEAD:${REGISTRY_PATH}`],
      { cwd: root }
    );
    fs.writeFileSync(
      registryPath,
      renderRegistry(fixtureRegistry({ "coach-voice": "required" })),
      "utf8"
    );
    const headObjectId = execFileSync("git", ["rev-parse", `HEAD:${REGISTRY_PATH}`], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const filteredObjectId = execFileSync("git", ["hash-object", "--", REGISTRY_PATH], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const rawObjectId = execFileSync(
      "git",
      ["hash-object", "--no-filters", "--", REGISTRY_PATH],
      { cwd: root, encoding: "utf8" }
    ).trim();
    if (filteredObjectId !== headObjectId || rawObjectId === headObjectId) {
      throw new Error("registry test failed: clean-filter fixture did not create the intended mismatch");
    }
    expectFailure(
      "GATE_FILE_CONTENT_MISMATCH",
      () => assertRepositoryFile(root, REGISTRY_PATH, { requireTracked: true }),
      "raw bytes differ despite matching clean-filter hash"
    );
    expectFailure(
      "GATE_ATTRIBUTES_DRIFT",
      () => loadRepositoryGateState(root, { requireTracked: false }),
      "clean filter attribute is forbidden"
    );
  });

  withTempGitRepo((root) => {
    execFileSync("git", ["config", "core.autocrlf", "true"], { cwd: root });
    for (const relativePath of [GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH]) {
      fs.unlinkSync(path.join(root, relativePath));
    }
    execFileSync(
      "git",
      ["checkout", "--", GITATTRIBUTES_PATH, REGISTRY_PATH, STATUS_INDEX_PATH],
      { cwd: root }
    );
    loadRepositoryGateState(root, { requireTracked: true });
  });

  if (process.platform !== "win32") {
    withTempGitRepo((root) => {
      const registryPath = path.join(root, REGISTRY_PATH);
      fs.unlinkSync(registryPath);
      fs.symlinkSync("target.json", registryPath);
      expectFailure(
        "GATE_FILE_TYPE",
        () => assertRegularFile(root, REGISTRY_PATH),
        "working-tree symlink"
      );
    });
  }
}

function runProductGateRegistryTests() {
  runInMemoryRegistryTests();
  runGitModeTests();
}

if (require.main === module) {
  try {
    runProductGateRegistryTests();
    console.log("product gate registry tests passed");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  runGitModeTests,
  runInMemoryRegistryTests,
  runProductGateRegistryTests,
};
