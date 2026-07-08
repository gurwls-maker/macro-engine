const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const defaultShardDir = path.join(__dirname, "v8_full_cartesian_shards");
const debugDir = path.join(__dirname, "_debug");
const ledgerScript = path.join(__dirname, "build_v8_full_cartesian_ledger.cjs");
const PLAN_SCHEMA_VERSION = "v8_full_cartesian_shard_plan_v1";
const DEFAULT_NOMINAL_FULL_CARTESIAN_CASE_COUNT = 80621568000;

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

function toRelativePath(filePath){
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function runJson(command, args){
  const output = childProcess.execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output);
}

function readLedger(){
  const ledgerArg = readArgValue("--ledger");
  if (ledgerArg) {
    const ledgerPath = path.resolve(root, ledgerArg);
    return {
      ledger: JSON.parse(fs.readFileSync(ledgerPath, "utf-8")),
      source: {
        type: "ledger_file",
        path: ledgerPath
      }
    };
  }

  fs.mkdirSync(debugDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(debugDir, "v8_full_cartesian_plan_"));
  const tempLedgerPath = path.join(tempDir, "coverage_ledger.json");
  const inputDir = path.resolve(root, readArgValue("--dir") || defaultShardDir);
  try {
    runJson(process.execPath, [
      ledgerScript,
      `--dir=${path.relative(root, inputDir)}`,
      "--detail-limit=-1",
      `--out=${path.relative(root, tempLedgerPath)}`
    ]);
    return {
      ledger: JSON.parse(fs.readFileSync(tempLedgerPath, "utf-8")),
      source: {
        type: "generated_from_dir",
        dir: inputDir
      }
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function makePowershellCommand(parts){
  return parts.join(" ");
}

function buildPlan(ledger, source){
  const shardSizeInput = readNumberArg(["--shard-size"], 100000);
  const shardSize = Number.isSafeInteger(shardSizeInput) && shardSizeInput > 0 ? shardSizeInput : 100000;
  const maxShardsInput = readNumberArg(["--max-shards"], 8);
  const maxShards = Number.isSafeInteger(maxShardsInput) && maxShardsInput >= 0 ? maxShardsInput : 8;
  const fromIndexInput = readNumberArg(["--from-index"], 0);
  const fromIndex = Number.isSafeInteger(fromIndexInput) && fromIndexInput >= 0 ? fromIndexInput : 0;
  const label = readArgValue("--label") || "planned_next";
  const nominalFullCartesianCaseCount = Number(ledger.contract?.nominalFullCartesianCaseCount || DEFAULT_NOMINAL_FULL_CARTESIAN_CASE_COUNT);
  const gaps = Array.isArray(ledger.coverage?.gaps) ? ledger.coverage.gaps : [];
  const plannedRanges = [];
  const plannedShardIndexes = [];

  for (const gap of gaps) {
    let cursor = Math.max(Number(gap.startIndex), fromIndex);
    const gapEndExclusive = Math.min(Number(gap.endExclusive), nominalFullCartesianCaseCount);
    if (!Number.isSafeInteger(cursor) || !Number.isSafeInteger(gapEndExclusive) || cursor >= gapEndExclusive) continue;

    while (cursor < gapEndExclusive && plannedRanges.length < maxShards) {
      const shardIndex = Math.floor(cursor / shardSize);
      const shardStartIndex = shardIndex * shardSize;
      const shardEndExclusive = Math.min(shardStartIndex + shardSize, nominalFullCartesianCaseCount);
      const exactStartIndex = cursor;
      const exactEndExclusive = Math.min(gapEndExclusive, shardEndExclusive);
      const uncoveredCaseCount = exactEndExclusive - exactStartIndex;
      const fullShardCaseCount = shardEndExclusive - shardStartIndex;
      const duplicateCaseCountIfFullShard = fullShardCaseCount - uncoveredCaseCount;
      const exactRangeCommand = makePowershellCommand([
        "node",
        ".\\tools\\render_audit\\run_v8_full_cartesian_shard.cjs",
        `--start=${exactStartIndex}`,
        `--end=${exactEndExclusive}`,
        `--max-cases=${uncoveredCaseCount}`
      ]);
      plannedRanges.push({
        shardIndex,
        shardStartIndex,
        shardEndExclusive,
        exactStartIndex,
        exactEndExclusive,
        uncoveredCaseCount,
        fullShardCaseCount,
        duplicateCaseCountIfFullShard,
        exactRangeIsFullShard: duplicateCaseCountIfFullShard === 0,
        exactRangeCommand
      });
      if (!plannedShardIndexes.includes(shardIndex)) plannedShardIndexes.push(shardIndex);
      cursor = exactEndExclusive;
    }
    if (plannedRanges.length >= maxShards) break;
  }

  const plannedUncoveredCaseCount = plannedRanges.reduce((sum, item) => sum + item.uncoveredCaseCount, 0);
  const rerunByShard = new Map();
  plannedRanges.forEach(item => {
    const current = rerunByShard.get(item.shardIndex) || {
      fullShardCaseCount: item.fullShardCaseCount,
      plannedUncoveredCaseCount: 0
    };
    current.plannedUncoveredCaseCount += item.uncoveredCaseCount;
    rerunByShard.set(item.shardIndex, current);
  });
  const wouldRerunCaseCountIfUsingShardIndexes = [...rerunByShard.values()]
    .reduce((sum, item) => sum + Math.max(0, item.fullShardCaseCount - item.plannedUncoveredCaseCount), 0);
  const batchCommand = plannedShardIndexes.length
    ? makePowershellCommand([
      "node",
      ".\\tools\\render_audit\\run_v8_full_cartesian_batch.cjs",
      `--shards=${plannedShardIndexes.join(",")}`,
      `--shard-size=${shardSize}`,
      `--max-cases=${shardSize}`,
      `--label=${label}`
    ])
    : null;
  const exactRangeCommands = plannedRanges.map(item => item.exactRangeCommand);
  const closureBlockers = Array.isArray(ledger.summary?.closureBlockers) ? ledger.summary.closureBlockers : [];
  const plan = {
    done: true,
    schemaVersion: PLAN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      ...source,
      ledgerSchemaVersion: ledger.schemaVersion || null,
      ledgerSha256: ledger.integrity?.ledgerSha256 || null
    },
    config: {
      shardSize,
      maxShards,
      fromIndex,
      label
    },
    ledgerSummary: {
      nominalFullCartesianCaseCount,
      uniqueExecutedCaseCount: Number(ledger.summary?.uniqueExecutedCaseCount || 0),
      contiguousCoveredFromZero: Number(ledger.summary?.contiguousCoveredFromZero || 0),
      gapCount: Number(ledger.summary?.gapCount || 0),
      overlapCount: Number(ledger.summary?.overlapCount || 0),
      dirtySourceManifestCount: Number(ledger.summary?.dirtySourceManifestCount || 0),
      truncatedManifestCount: Number(ledger.summary?.truncatedManifestCount || 0),
      fullCoverageCandidate: ledger.summary?.fullCoverageCandidate === true,
      closureBlockers
    },
    summary: {
      plannedRangeCount: plannedRanges.length,
      plannedShardIndexCount: plannedShardIndexes.length,
      plannedUncoveredCaseCount,
      wouldRerunCaseCountIfUsingShardIndexes,
      exactRangeExecutionRequiredForNoDuplicateCoverage: wouldRerunCaseCountIfUsingShardIndexes > 0,
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false,
      planStatus: plannedRanges.length
        ? "next_uncovered_ranges_planned_not_executed"
        : "no_uncovered_ranges_available_from_ledger"
    },
    plannedShardIndexes,
    plannedRanges,
    commands: {
      exactRangeCommands,
      batchCommand
    }
  };
  plan.integrity = {
    planSha256: sha256Json({
      ...plan,
      integrity: null
    })
  };
  return plan;
}

function main(){
  const { ledger, source } = readLedger();
  const plan = buildPlan(ledger, source);
  const outArg = readArgValue("--out");
  if (outArg) {
    const outPath = path.resolve(root, outArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), "utf-8");
  }
  console.log(JSON.stringify({
    done: true,
    schemaVersion: plan.schemaVersion,
    outPath: outArg ? path.resolve(root, outArg) : null,
    ledgerGapCount: plan.ledgerSummary.gapCount,
    ledgerDirtySourceManifestCount: plan.ledgerSummary.dirtySourceManifestCount,
    ledgerTruncatedManifestCount: plan.ledgerSummary.truncatedManifestCount,
    plannedRangeCount: plan.summary.plannedRangeCount,
    plannedShardIndexCount: plan.summary.plannedShardIndexCount,
    plannedUncoveredCaseCount: plan.summary.plannedUncoveredCaseCount,
    wouldRerunCaseCountIfUsingShardIndexes: plan.summary.wouldRerunCaseCountIfUsingShardIndexes,
    firstPlannedRange: plan.plannedRanges[0] || null,
    exactRangeExecutionRequiredForNoDuplicateCoverage: plan.summary.exactRangeExecutionRequiredForNoDuplicateCoverage,
    fullCartesianRun: plan.summary.fullCartesianRun,
    full8_2CartesianExecutionClosed: plan.summary.full8_2CartesianExecutionClosed,
    fullV8CompletionClosed: plan.summary.fullV8CompletionClosed,
    planStatus: plan.summary.planStatus,
    planSha256: plan.integrity.planSha256
  }, null, 2));
}

main();
