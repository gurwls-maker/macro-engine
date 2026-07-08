const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const shardOutputRoot = path.join(__dirname, "v8_full_cartesian_shards");
const debugDir = path.join(__dirname, "_debug");
const planScript = path.join(__dirname, "plan_v8_full_cartesian_shards.cjs");
const shardScript = path.join(__dirname, "run_v8_full_cartesian_shard.cjs");
const analyzerScript = path.join(__dirname, "analyze_v8_full_cartesian_shards.cjs");
const ledgerScript = path.join(__dirname, "build_v8_full_cartesian_ledger.cjs");
const EXECUTION_SCHEMA_VERSION = "v8_full_cartesian_plan_execution_v1";

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

function runJson(command, args){
  const output = childProcess.execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output);
}

function sanitizeLabel(value){
  return String(value || "plan_execution").replace(/[^a-z0-9_-]+/gi, "_");
}

function padIndex(value){
  return String(value).padStart(11, "0");
}

function readOrBuildPlan(){
  const planArg = readArgValue("--plan");
  if (planArg) {
    const planPath = path.resolve(root, planArg);
    return {
      plan: JSON.parse(fs.readFileSync(planPath, "utf-8")),
      source: {
        type: "plan_file",
        path: planPath
      }
    };
  }

  fs.mkdirSync(debugDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(debugDir, "v8_full_cartesian_plan_exec_"));
  const tempPlanPath = path.join(tempDir, "shard_plan.json");
  const plannerArgs = [];
  const dirArg = readArgValue("--dir");
  const ledgerArg = readArgValue("--ledger");
  const shardSizeArg = readArgValue("--shard-size");
  const maxRangesArg = readArgValue("--max-ranges", "--max-shards");
  const fromIndexArg = readArgValue("--from-index");
  const labelArg = readArgValue("--label");
  if (dirArg) plannerArgs.push(`--dir=${dirArg}`);
  if (ledgerArg) plannerArgs.push(`--ledger=${ledgerArg}`);
  if (shardSizeArg) plannerArgs.push(`--shard-size=${shardSizeArg}`);
  if (maxRangesArg) plannerArgs.push(`--max-shards=${maxRangesArg}`);
  if (fromIndexArg) plannerArgs.push(`--from-index=${fromIndexArg}`);
  if (labelArg) plannerArgs.push(`--label=${labelArg}`);
  plannerArgs.push(`--out=${path.relative(root, tempPlanPath)}`);
  try {
    runJson(process.execPath, [planScript, ...plannerArgs]);
    return {
      plan: JSON.parse(fs.readFileSync(tempPlanPath, "utf-8")),
      source: {
        type: "generated_plan",
        plannerArgs
      }
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main(){
  const { plan, source } = readOrBuildPlan();
  const plannedRanges = Array.isArray(plan.plannedRanges) ? plan.plannedRanges : [];
  const defaultMaxRanges = plannedRanges.length;
  const maxRangesInput = readNumberArg(["--max-ranges", "--max-shards"], defaultMaxRanges);
  const maxRanges = Number.isSafeInteger(maxRangesInput) && maxRangesInput >= 0 ? maxRangesInput : defaultMaxRanges;
  const label = sanitizeLabel(readArgValue("--label") || plan.config?.label || "plan_execution");
  const executeDir = path.join(shardOutputRoot, `batch_${label}`);
  fs.mkdirSync(executeDir, { recursive: true });

  const selectedRanges = plannedRanges.slice(0, maxRanges);
  const executionPath = path.join(executeDir, "plan_execution_summary.json");
  if (!selectedRanges.length) {
    const execution = {
      schemaVersion: EXECUTION_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      command: {
        cwd: root,
        args: process.argv.slice(2)
      },
      source,
      plan: {
        schemaVersion: plan.schemaVersion || null,
        planSha256: plan.integrity?.planSha256 || null,
        plannedRangeCount: plan.summary?.plannedRangeCount || 0,
        plannedUncoveredCaseCount: plan.summary?.plannedUncoveredCaseCount || 0,
        wouldRerunCaseCountIfUsingShardIndexes: plan.summary?.wouldRerunCaseCountIfUsingShardIndexes || 0,
        exactRangeExecutionRequiredForNoDuplicateCoverage: plan.summary?.exactRangeExecutionRequiredForNoDuplicateCoverage === true
      },
      config: {
        label,
        executeDir,
        maxRanges
      },
      shardRuns: [],
      analyzer: null,
      ledger: null,
      summary: {
        executedRangeCount: 0,
        executedCaseCount: 0,
        analyzerFailedCount: 0,
        ledgerUniqueExecutedCaseCount: 0,
        ledgerGapCount: null,
        ledgerDirtySourceManifestCount: 0,
        ledgerTruncatedManifestCount: 0,
        noRangesSelected: true,
        fullCartesianRun: false,
        full8_2CartesianExecutionClosed: false,
        fullV8CompletionClosed: false
      }
    };
    execution.integrity = {
      executionSha256: sha256Json({
        ...execution,
        integrity: null
      })
    };
    fs.writeFileSync(executionPath, JSON.stringify(execution, null, 2), "utf-8");
    console.log(JSON.stringify({
      done: true,
      schemaVersion: execution.schemaVersion,
      executionPath,
      ledgerPath: null,
      executedRangeCount: 0,
      executedCaseCount: 0,
      analyzerFailedCount: 0,
      ledgerUniqueExecutedCaseCount: 0,
      ledgerGapCount: null,
      ledgerDirtySourceManifestCount: 0,
      ledgerTruncatedManifestCount: 0,
      noRangesSelected: true,
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false,
      executionSha256: execution.integrity.executionSha256
    }, null, 2));
    return;
  }

  const shardRuns = selectedRanges.map((range, index) => {
    const start = Number(range.exactStartIndex);
    const end = Number(range.exactEndExclusive);
    const count = end - start;
    const outPath = path.join(executeDir, `shard_${padIndex(start)}_${padIndex(end)}.json`);
    const shardRun = runJson(process.execPath, [
      shardScript,
      `--start=${start}`,
      `--end=${end}`,
      `--max-cases=${count}`,
      `--out=${path.relative(root, outPath)}`
    ]);
    return {
      planIndex: index,
      shardIndex: range.shardIndex,
      exactStartIndex: start,
      exactEndExclusive: end,
      plannedUncoveredCaseCount: count,
      outPath,
      shardRun
    };
  });

  const analyzer = runJson(process.execPath, [
    analyzerScript,
    `--dir=${path.relative(root, executeDir)}`
  ]);
  const ledgerPath = path.join(executeDir, "coverage_ledger.json");
  const ledger = runJson(process.execPath, [
    ledgerScript,
    `--dir=${path.relative(root, executeDir)}`,
    `--out=${path.relative(root, ledgerPath)}`
  ]);

  const execution = {
    schemaVersion: EXECUTION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: {
      cwd: root,
      args: process.argv.slice(2)
    },
    source,
    plan: {
      schemaVersion: plan.schemaVersion || null,
      planSha256: plan.integrity?.planSha256 || null,
      plannedRangeCount: plan.summary?.plannedRangeCount || 0,
      plannedUncoveredCaseCount: plan.summary?.plannedUncoveredCaseCount || 0,
      wouldRerunCaseCountIfUsingShardIndexes: plan.summary?.wouldRerunCaseCountIfUsingShardIndexes || 0,
      exactRangeExecutionRequiredForNoDuplicateCoverage: plan.summary?.exactRangeExecutionRequiredForNoDuplicateCoverage === true
    },
    config: {
      label,
      executeDir,
      maxRanges
    },
    shardRuns,
    analyzer,
    ledger,
    summary: {
      executedRangeCount: shardRuns.length,
      executedCaseCount: shardRuns.reduce((sum, item) => sum + Number(item.plannedUncoveredCaseCount || 0), 0),
      analyzerFailedCount: analyzer.failedCount,
      ledgerUniqueExecutedCaseCount: ledger.uniqueExecutedCaseCount,
      ledgerGapCount: ledger.gapCount,
      ledgerDirtySourceManifestCount: ledger.dirtySourceManifestCount,
      ledgerTruncatedManifestCount: ledger.truncatedManifestCount,
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false
    }
  };
  execution.integrity = {
    executionSha256: sha256Json({
      ...execution,
      integrity: null
    })
  };
  fs.writeFileSync(executionPath, JSON.stringify(execution, null, 2), "utf-8");

  console.log(JSON.stringify({
    done: true,
    schemaVersion: execution.schemaVersion,
    executionPath,
    ledgerPath,
    executedRangeCount: execution.summary.executedRangeCount,
    executedCaseCount: execution.summary.executedCaseCount,
    analyzerFailedCount: execution.summary.analyzerFailedCount,
    ledgerUniqueExecutedCaseCount: execution.summary.ledgerUniqueExecutedCaseCount,
    ledgerGapCount: execution.summary.ledgerGapCount,
    ledgerDirtySourceManifestCount: execution.summary.ledgerDirtySourceManifestCount,
    ledgerTruncatedManifestCount: execution.summary.ledgerTruncatedManifestCount,
    fullCartesianRun: execution.summary.fullCartesianRun,
    full8_2CartesianExecutionClosed: execution.summary.full8_2CartesianExecutionClosed,
    fullV8CompletionClosed: execution.summary.fullV8CompletionClosed,
    executionSha256: execution.integrity.executionSha256
  }, null, 2));

  if (analyzer.failedCount) process.exitCode = 1;
}

main();
