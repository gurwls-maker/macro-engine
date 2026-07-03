const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const debugDir = path.join(__dirname, "_debug");
fs.mkdirSync(debugDir, { recursive: true });

function addNodeModuleCandidatesFrom(nodeModulesPath, targets){
  if (!nodeModulesPath || !fs.existsSync(nodeModulesPath)) return;
  targets.add(nodeModulesPath);
  const pnpmPath = path.join(nodeModulesPath, ".pnpm");
  if (!fs.existsSync(pnpmPath)) return;
  fs.readdirSync(pnpmPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith("playwright-core@"))
    .forEach(entry => targets.add(path.join(pnpmPath, entry.name, "node_modules")));
}

function configurePortableNodePath(){
  const targets = new Set();
  addNodeModuleCandidatesFrom(path.join(root, "node_modules"), targets);
  addNodeModuleCandidatesFrom(path.resolve(path.dirname(process.execPath), "..", "node_modules"), targets);
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (homeDir) {
    addNodeModuleCandidatesFrom(path.join(homeDir, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"), targets);
  }
  process.env.NODE_PATH = [...targets, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

configurePortableNodePath();
const { chromium } = require("playwright");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

function readArgValue(name){
  const prefix = `${name}=`;
  const direct = process.argv.find(arg => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readPositiveIntEnv(name, fallback){
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

const mode = process.argv.includes("--mobile") ? "mobile" : "desktop";
const requestedProfile = (readArgValue("--profile") || (mode === "mobile" ? "mobile" : "full")).trim();
const requestedSuites = readArgValue("--suite")
  .split(",")
  .map(name => name.trim())
  .filter(Boolean);
const frameWidth = mode === "mobile" ? 390 : 1280;
const frameHeight = mode === "mobile" ? 844 : 900;

const testProfiles = {
  smoke: [
    "runRecordMigrationTests",
    "runMealRecordTests",
    "runMealEntryConsistencyTests",
    "runTodayConsumptionTests",
    "runTodayBalanceTests",
    "runTodayCalculationOwnershipTests",
    "runTodayQuickEditTests",
    "runRecordEditCalculationBasisTests",
    "runRecordDetailBodyCompositionPrecisionTests",
    "runBackupWarningVisibilityTests",
    "runRecordsDeleteActionPolishTests",
    "runRecordDetailMealDeleteConfirmTests",
    "runSettingsMobileCopyPolishTests",
    "runUserFacingCopyConsistencyTests",
    "runRecentRenderAuditSeedTests",
    "runRecentMobileChartReadabilityTests",
    "runSmartRestoreImportTests",
    "runDataManagementBackupTests",
    "runDualBasisProductionTests"
  ],
  core: [
    "runRecordMigrationTests",
    "runMealRecordTests",
    "runTodayConsumptionTests",
    "runTodayBalanceTests",
    "runModeRuntimeConfigTests",
    "runModeGoldenCalculationTests",
    "runAdherenceScoringTests",
    "runWeeklyAdherenceTests",
    "runTodayCalculationOwnershipTests",
    "runTodayQuickEditTests",
    "runRecordEditCalculationBasisTests",
    "runRecordDetailBodyCompositionPrecisionTests",
    "runRecordTodayAutoWeeklyCountTests",
    "runRecordWeightTodayApplyPromptTests",
    "runRecordsInlineEditTests",
    "runSharedMealSurfaceTests",
    "runMealEntryConsistencyTests",
    "runSmartRestoreImportTests",
    "runBackupRestoreConflictPreviewTests",
    "runBackupWarningVisibilityTests",
    "runRecordsDeleteActionPolishTests",
    "runRecordDetailMealDeleteConfirmTests",
    "runSettingsMobileCopyPolishTests",
    "runUserFacingCopyConsistencyTests",
    "runDataManagementBackupTests",
    "runFullBackupMealsRestoreTests",
    "runInBodyRecordApplyTests",
    "runInBodyTodayFillTests",
    "runInBodySaveTodayApplyChoiceTests",
    "runDualBasisProductionTests",
    "runMacroRangeReportOnlyHelperTests",
    "runMacroRangeScoreCandidateReportOnlyTests",
    "runMacroRangeSnapshotCompatibilityDesignTests",
    "runMacroRangeExplicitNormalizerSimulationDesignTests",
    "runTargetMacroProductionPolicyTests",
    "runMacroAllocationExplanationTests",
    "runDailyCoachRecentContextTests"
  ],
  ui: [
    "runMobileRegressionQaTests",
    "runMobileBottomNavSafetyTests",
    "runStitchTodayShellTests",
    "runStitchRecordsShellTests",
    "runStitchWeeklyShellTests",
    "runStitchInBodyShellTests",
    "runStitchSettingsShellTests",
    "runSettingsDensityUiTests",
    "runRecordsDetailDensityUiTests",
    "runChoiceUiConsistencyTests",
    "runKpiLabelVisualPatternTests",
    "runUiComponentTaxonomyTests",
    "runResultProximitySummaryTests",
    "runTodayHeaderActionDensityTests",
    "runUserFacingForbiddenCopyTests",
    "runUserFacingCopyPolishTests",
    "runUserFacingCopyConsistencyTests",
    "runRecordsDeleteActionPolishTests",
    "runRecordDetailMealDeleteConfirmTests",
    "runSettingsMobileCopyPolishTests",
    "runTodayCoachCopyPolishTests",
    "runRecentFlowCopyPolishTests",
    "runRecentRenderAuditSeedTests",
    "runRecentMobileChartReadabilityTests"
  ],
  calibration: [
    "runMacroCalibrationTests",
    "runCalibrationScanReportTests",
    "runV8ScenarioRunnerTests",
    "runCalibrationPhysiologyReviewTests",
    "runCalibrationWeeklyBudgetReviewTests",
    "runCalibrationCardioTargetPolicyReviewTests",
    "runMacroCapCandidateReviewTests",
    "runMacroCapPhilosophyReviewTests",
    "runFormulaBenchmarkReviewTests",
    "runCardioConventionReflectionReviewTests",
    "runTargetMacroJointPolicyReviewTests",
    "runTargetMacroJointExpandedScanTests",
    "runGoalMacroPrincipleReviewTests",
    "runGoalMacroDualBasisReviewTests",
    "runExternalMacroPolicyComparisonTests",
    "runExerciseManagementMacroScenarioTests",
    "runExternalMacroProductionCandidateWiringTests",
    "runExternalMacroActiveApplicationDecisionTests",
    "runExternalMacroGuideActivityBasisMappingTests",
    "runActivityWorkEnergyAvailabilityFloorPolicyTests"
  ],
  mobile: [
  "runMobileRegressionQaTests",
  "runMobileBottomNavSafetyTests",
  "runRecordsInBodySettingsCopyDietTests",
  "runAlcoholKcalCalculatorTests",
  "runMealEntryConsistencyTests",
  "runSmartRestoreImportTests",
  "runBackupRestoreConflictPreviewTests",
  "runBackupWarningVisibilityTests",
  "runRecordsDeleteActionPolishTests",
  "runRecordDetailMealDeleteConfirmTests",
  "runSettingsMobileCopyPolishTests",
  "runUserFacingCopyConsistencyTests",
  "runRecentRenderAuditSeedTests",
  "runRecentMobileChartReadabilityTests",
  "runFullBackupMealsRestoreTests",
  "runStitchSettingsShellTests",
  "runStitchRecordsShellTests",
  "runStitchInBodyShellTests",
  "runStitchWeeklyShellTests"
  ],
  full: []
};

if (process.argv.includes("--list-profiles")) {
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(testProfiles).map(([name, suites]) => [name, suites.length ? suites : "all exported run*Tests"])
  ), null, 2));
  process.exit(0);
}

if (!Object.prototype.hasOwnProperty.call(testProfiles, requestedProfile)) {
  console.error(`Unknown test profile: ${requestedProfile}`);
  console.error(`Available profiles: ${Object.keys(testProfiles).join(", ")}`);
  process.exit(1);
}

const requestedSuiteNames = requestedSuites.length ? requestedSuites : testProfiles[requestedProfile];
const isFullExportedProfile = requestedProfile === "full" && requestedSuiteNames.length === 0;
const runnerPageGotoTimeoutMs = readPositiveIntEnv("INTERNAL_TEST_RUNNER_GOTO_TIMEOUT_MS", 90000);
const iframeLoadTimeoutMs = readPositiveIntEnv("INTERNAL_TEST_IFRAME_LOAD_TIMEOUT_MS", isFullExportedProfile ? 90000 : 60000);
const completionTimeoutMs = readPositiveIntEnv("INTERNAL_TEST_COMPLETION_TIMEOUT_MS", isFullExportedProfile ? 900000 : 300000);
const serverReadyTimeoutMs = readPositiveIntEnv("INTERNAL_TEST_SERVER_READY_TIMEOUT_MS", 10000);
const profileDir = fs.mkdtempSync(path.join(debugDir, `browser_${mode}_${requestedProfile}_`));

const runnerHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <link rel="icon" href="data:,">
  <title>macro-engine internal test runner</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:16px;white-space:pre-wrap}
    iframe{position:absolute;width:${frameWidth}px;height:${frameHeight}px;left:-10000px;top:0;border:0}
  </style>
</head>
<body>
<pre id="results-json">{"done":false}</pre>
<script>
(async () => {
  const output = document.getElementById("results-json");
  const runnerStartedAt = Date.now();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let iframeLoadMs = null;
  const finish = summary => {
    summary.elapsedMs = Date.now() - runnerStartedAt;
    summary.iframeLoadMs = iframeLoadMs;
    output.textContent = JSON.stringify(summary, null, 2);
    document.body.setAttribute("data-done", "true");
  };
  try {
    localStorage.clear();
    sessionStorage.clear();
    const iframe = document.createElement("iframe");
    iframe.src = "/index.html?codexInternalTests=1";
    document.body.appendChild(iframe);
    const iframeStartedAt = Date.now();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("index.html load timeout after ${iframeLoadTimeoutMs}ms")),
        ${iframeLoadTimeoutMs}
      );
      iframe.onload = () => {
        clearTimeout(timer);
        iframeLoadMs = Date.now() - iframeStartedAt;
        resolve();
      };
      iframe.onerror = () => {
        clearTimeout(timer);
        reject(new Error("index.html iframe failed to load"));
      };
    });
    const w = iframe.contentWindow;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (typeof w.runRecordMigrationTests === "function" && typeof w.runMobileRegressionQaTests === "function") break;
      await sleep(100);
    }
    const requestedProfile = ${JSON.stringify(requestedProfile)};
    const requestedSuiteNames = ${JSON.stringify(requestedSuiteNames)};
    const allSuiteNames = Object.keys(w).filter(name => /^run[A-Za-z0-9_]*Tests$/.test(name) && typeof w[name] === "function");
    if (typeof w.runDailyCoachTestCases === "function" && !allSuiteNames.includes("runDailyCoachTestCases")) {
      allSuiteNames.push("runDailyCoachTestCases");
    }
    const suiteNames = requestedSuiteNames.length
      ? requestedSuiteNames.filter(name => typeof w[name] === "function")
      : allSuiteNames;
    const suites = [];
    const cases = [];
    for (const suiteName of suiteNames) {
      try {
        const value = await Promise.resolve(w[suiteName]());
        const suiteCases = Array.isArray(value) ? value : [{ name: suiteName, pass: value !== false }];
        const normalizedCases = suiteCases.map((item, index) => ({
          suite: suiteName,
          name: item && item.name ? item.name : suiteName + "#" + (index + 1),
          pass: !!(item && item.pass),
          error: item && item.error ? String(item.error) : ""
        }));
        cases.push(...normalizedCases);
        suites.push({
          name: suiteName,
          total: normalizedCases.length,
          failed: normalizedCases.filter(item => !item.pass).length
        });
      } catch (error) {
        cases.push({ suite: suiteName, name: suiteName, pass: false, error: error.message || String(error) });
        suites.push({ name: suiteName, total: 1, failed: 1 });
      }
    }
    const failedCases = cases.filter(item => !item.pass);
    finish({
      done: true,
      mode: ${JSON.stringify(mode)},
      profile: requestedProfile,
      viewport: { width: ${frameWidth}, height: ${frameHeight} },
      suiteCount: suites.length,
      caseCount: cases.length,
      failedCount: failedCases.length,
      suites,
      failedCases
    });
  } catch (error) {
    finish({ done: true, runnerError: error.message || String(error) });
  }
})();
</script>
</body>
</html>`;

function createServer(){
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__internal_test_runner.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(runnerHtml);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(root, requestedPath.slice(1));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
      response.end(data);
    });
  });
}

function requestServerPath(port, pathname = "/__internal_test_runner.html", timeoutMs = 1000){
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: "127.0.0.1",
      port,
      path: pathname,
      timeout: timeoutMs
    }, response => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode === 200) {
          resolve(response.statusCode);
          return;
        }
        reject(new Error(`server readiness check returned HTTP ${response.statusCode}`));
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`server readiness check timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

async function waitForServerReady(port){
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < serverReadyTimeoutMs) {
    try {
      await requestServerPath(port);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw new Error(`internal test server did not become ready within ${serverReadyTimeoutMs}ms: ${lastError ? lastError.message : "unknown error"}`);
}

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await waitForServerReady(port);
  let context;
  try {
    const launchOptions = {
      headless: true,
      args: [
        "--disable-gpu",
        "--no-first-run",
        "--disable-background-networking"
      ]
    };
    const channels = [...new Set([process.env.PLAYWRIGHT_BROWSER_CHANNEL, "msedge", "chrome", ""].filter(channel => channel !== undefined))];
    let lastError = null;
    for (const channel of channels) {
      try {
        context = await chromium.launchPersistentContext(profileDir, {
          ...launchOptions,
          ...(channel ? { channel } : {})
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!context) throw lastError || new Error("Unable to launch a Playwright browser");
    const page = context.pages()[0] || await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", message => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", error => {
      pageErrors.push(error.message || String(error));
    });
    await page.setViewportSize({ width: frameWidth + 80, height: frameHeight + 80 });
    const gotoStartedAt = Date.now();
    await page.goto(`http://127.0.0.1:${port}/__internal_test_runner.html`, { waitUntil: "domcontentloaded", timeout: runnerPageGotoTimeoutMs });
    const gotoMs = Date.now() - gotoStartedAt;
    await page.waitForFunction(() => document.body.getAttribute("data-done") === "true", null, { timeout: completionTimeoutMs });
    const summary = JSON.parse(await page.locator("#results-json").textContent());
    summary.nodeRunner = {
      gotoMs,
      runnerPageGotoTimeoutMs,
      iframeLoadTimeoutMs,
      completionTimeoutMs,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      consoleErrors: consoleErrors.slice(0, 20),
      pageErrors: pageErrors.slice(0, 20)
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.runnerError || summary.failedCount) process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})();
