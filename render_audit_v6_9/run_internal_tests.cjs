const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..");
const debugDir = path.join(__dirname, "_debug");
const profileDir = path.join(debugDir, "edge_test_profile");
const bundledNodeModules = "C:/Users/dw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const bundledPnpmModules = [
  "C:/Users/dw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright-core@1.60.0/node_modules"
];

fs.mkdirSync(profileDir, { recursive: true });
if (fs.existsSync(bundledNodeModules)) {
  process.env.NODE_PATH = [bundledNodeModules, ...bundledPnpmModules.filter(item => fs.existsSync(item)), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}
const { chromium } = require("playwright");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

const mode = process.argv.includes("--mobile") ? "mobile" : "desktop";
const frameWidth = mode === "mobile" ? 390 : 1280;
const frameHeight = mode === "mobile" ? 844 : 900;
const mobileSuiteNames = [
  "runMobileRegressionQaTests",
  "runMobileBottomNavSafetyTests",
  "runRecordsInBodySettingsCopyDietTests",
  "runAlcoholKcalCalculatorTests",
  "runSmartRestoreImportTests",
  "runBackupRestoreConflictPreviewTests",
  "runFullBackupMealsRestoreTests",
  "runStitchSettingsShellTests",
  "runStitchRecordsShellTests",
  "runStitchInBodyShellTests",
  "runStitchWeeklyShellTests"
];
const requestedSuiteNames = mode === "mobile" ? mobileSuiteNames : [];

const runnerHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>v6.9 internal test runner</title>
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
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const finish = summary => {
    output.textContent = JSON.stringify(summary, null, 2);
    document.body.setAttribute("data-done", "true");
  };
  try {
    localStorage.clear();
    sessionStorage.clear();
    const iframe = document.createElement("iframe");
    iframe.src = "/index.html?codexInternalTests=1";
    document.body.appendChild(iframe);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("index.html load timeout")), 30000);
      iframe.onload = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    const w = iframe.contentWindow;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (typeof w.runRecordMigrationTests === "function" && typeof w.runMobileRegressionQaTests === "function") break;
      await sleep(100);
    }
    const requestedSuiteNames = ${JSON.stringify(requestedSuiteNames)};
    const allSuiteNames = Object.keys(w).filter(name => /^run[A-Za-z0-9_]*Tests$/.test(name) && typeof w[name] === "function");
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

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "msedge",
      headless: true,
      args: [
        "--disable-gpu",
        "--no-first-run",
        "--disable-background-networking"
      ]
    });
    const page = context.pages()[0] || await context.newPage();
    await page.setViewportSize({ width: frameWidth + 80, height: frameHeight + 80 });
    await page.goto(`http://127.0.0.1:${port}/__internal_test_runner.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => document.body.getAttribute("data-done") === "true", null, { timeout: 240000 });
    const summary = JSON.parse(await page.locator("#results-json").textContent());
    console.log(JSON.stringify(summary, null, 2));
    if (summary.runnerError || summary.failedCount) process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
})();
