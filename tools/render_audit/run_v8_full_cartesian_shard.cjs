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

function readArgValue(...names){
  for (const name of names) {
    const prefix = `${name}=`;
    const direct = process.argv.find(arg => arg.startsWith(prefix));
    if (direct) return direct.slice(prefix.length);
    const index = process.argv.indexOf(name);
    if (index >= 0) return process.argv[index + 1] || "";
  }
  return "";
}

function readNumberArg(names, fallback){
  const raw = readArgValue(...names);
  if (raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const shardOptions = {
  startIndex: readNumberArg(["--start-index", "--start"], 0),
  endExclusive: readNumberArg(["--end-exclusive", "--end"], NaN),
  caseLimit: readNumberArg(["--case-limit", "--limit"], 16),
  maxCases: readNumberArg(["--max-cases"], 1000),
  includeCases: !process.argv.includes("--no-cases")
};

Object.keys(shardOptions).forEach(key => {
  if (Number.isNaN(shardOptions[key])) delete shardOptions[key];
});

const outArg = readArgValue("--out");
const outputDir = path.join(__dirname, "v8_full_cartesian_shards");
fs.mkdirSync(outputDir, { recursive: true });

const profileDir = fs.mkdtempSync(path.join(debugDir, "v8_full_cartesian_shard_"));

const runnerHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>v8 full Cartesian shard runner</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:16px;white-space:pre-wrap}
    iframe{position:absolute;width:1280px;height:900px;left:-10000px;top:0;border:0}
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
    iframe.src = "/index.html?codexV8FullCartesianShard=1";
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
      if (typeof w.runV8FullCartesianShard === "function") break;
      await sleep(100);
    }
    if (typeof w.runV8FullCartesianShard !== "function") {
      throw new Error("runV8FullCartesianShard export missing");
    }
    const report = await Promise.resolve(w.runV8FullCartesianShard(${JSON.stringify(shardOptions)}));
    finish({ done: true, report });
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
    if (url.pathname === "/__v8_full_cartesian_shard_runner.html") {
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
    await page.setViewportSize({ width: 1360, height: 980 });
    await page.goto(`http://127.0.0.1:${port}/__v8_full_cartesian_shard_runner.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => document.body.getAttribute("data-done") === "true", null, { timeout: 240000 });
    const summary = JSON.parse(await page.locator("#results-json").textContent());
    if (summary.runnerError) {
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = 1;
      return;
    }
    const report = summary.report;
    const start = report?.meta?.startIndex ?? shardOptions.startIndex ?? 0;
    const end = report?.meta?.executedEndExclusive ?? report?.meta?.endExclusive ?? (start + (shardOptions.caseLimit || 0));
    const outPath = outArg
      ? path.resolve(root, outArg)
      : path.join(outputDir, `shard_${String(start).padStart(11, "0")}_${String(end).padStart(11, "0")}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(JSON.stringify({
      done: true,
      outPath,
      version: report?.meta?.version || null,
      stage: report?.meta?.stage || null,
      startIndex: report?.meta?.startIndex ?? null,
      endExclusive: report?.meta?.endExclusive ?? null,
      executedEndExclusive: report?.meta?.executedEndExclusive ?? null,
      decodedCaseCount: report?.summary?.decodedCaseCount ?? null,
      calculatedCaseCount: report?.summary?.calculatedCaseCount ?? null,
      constraintOnlyCaseCount: report?.summary?.constraintOnlyCaseCount ?? null,
      truncated: report?.meta?.truncated ?? null,
      fullCartesianRun: report?.meta?.fullCartesianRun ?? null
    }, null, 2));
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
})();
