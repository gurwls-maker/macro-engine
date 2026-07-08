const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const shardOutputRoot = path.join(__dirname, "v8_full_cartesian_shards");
const BATCH_SCHEMA_VERSION = "v8_full_cartesian_batch_manifest_v1";

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

function stableStringify(value){
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value){
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function parseShardList(){
  const explicit = readArgValue("--shards");
  if (explicit) {
    return explicit.split(",")
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value >= 0);
  }
  const startShard = readNumberArg(["--start-shard"], 0);
  const shardCount = readNumberArg(["--shard-count"], 1);
  return Array.from({ length: Math.max(0, shardCount) }, (_item, index) => startShard + index);
}

function runJson(command, args){
  const output = childProcess.execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output);
}

function main(){
  const shards = parseShardList();
  const shardSize = readNumberArg(["--shard-size"], 100000);
  const maxCases = readNumberArg(["--max-cases"], Math.min(shardSize, 1000));
  const label = readArgValue("--label") || `${Date.now()}_${shards.join("_") || "none"}`;
  const batchDir = path.join(shardOutputRoot, `batch_${label.replace(/[^a-z0-9_-]+/gi, "_")}`);
  fs.mkdirSync(batchDir, { recursive: true });

  const shardScript = path.join(__dirname, "run_v8_full_cartesian_shard.cjs");
  const analyzerScript = path.join(__dirname, "analyze_v8_full_cartesian_shards.cjs");
  const shardRuns = shards.map(shardIndex => {
    const start = shardIndex * shardSize;
    const end = start + shardSize;
    const outPath = path.join(batchDir, `shard_${String(start).padStart(11, "0")}_${String(Math.min(end, start + maxCases)).padStart(11, "0")}.json`);
    return runJson(process.execPath, [
      shardScript,
      `--shard-index=${shardIndex}`,
      `--shard-size=${shardSize}`,
      `--max-cases=${maxCases}`,
      `--out=${path.relative(root, outPath)}`
    ]);
  });
  const analyzer = runJson(process.execPath, [analyzerScript, `--dir=${path.relative(root, batchDir)}`]);
  const manifest = {
    schemaVersion: BATCH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: {
      cwd: root,
      args: process.argv.slice(2)
    },
    config: {
      shards,
      shardSize,
      maxCases,
      batchDir,
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false
    },
    shardRuns,
    analyzer,
    summary: {
      shardRunCount: shardRuns.length,
      analyzerFailedCount: analyzer.failedCount,
      decodedCaseCount: analyzer.decodedCaseCount,
      calculatedCaseCount: analyzer.calculatedCaseCount,
      constraintOnlyCaseCount: analyzer.constraintOnlyCaseCount,
      truncatedCount: analyzer.truncatedCount,
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false
    }
  };
  manifest.integrity = {
    batchSha256: sha256Json({
      ...manifest,
      integrity: null
    })
  };
  const batchPath = path.join(batchDir, "batch_summary.json");
  fs.writeFileSync(batchPath, JSON.stringify(manifest, null, 2), "utf-8");
  const ledgerScript = path.join(__dirname, "build_v8_full_cartesian_ledger.cjs");
  const ledgerPath = path.join(batchDir, "coverage_ledger.json");
  const ledger = runJson(process.execPath, [
    ledgerScript,
    `--dir=${path.relative(root, batchDir)}`,
    `--out=${path.relative(root, ledgerPath)}`
  ]);
  console.log(JSON.stringify({
    done: true,
    schemaVersion: manifest.schemaVersion,
    batchPath,
    ledgerPath,
    shardRunCount: manifest.summary.shardRunCount,
    analyzerFailedCount: manifest.summary.analyzerFailedCount,
    decodedCaseCount: manifest.summary.decodedCaseCount,
    calculatedCaseCount: manifest.summary.calculatedCaseCount,
    constraintOnlyCaseCount: manifest.summary.constraintOnlyCaseCount,
    truncatedCount: manifest.summary.truncatedCount,
    ledgerUniqueExecutedCaseCount: ledger.uniqueExecutedCaseCount,
    ledgerGapCount: ledger.gapCount,
    ledgerOverlapCount: ledger.overlapCount,
    ledgerDirtySourceManifestCount: ledger.dirtySourceManifestCount,
    ledgerFullCoverageCandidate: ledger.fullCoverageCandidate,
    fullCartesianRun: manifest.summary.fullCartesianRun,
    batchSha256: manifest.integrity.batchSha256
  }, null, 2));
  if (analyzer.failedCount) process.exitCode = 1;
}

main();
