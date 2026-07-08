const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const campaignRoot = path.join(__dirname, "v8_full_cartesian_campaigns");
const shardScript = path.join(__dirname, "run_v8_full_cartesian_shard.cjs");
const analyzerScript = path.join(__dirname, "analyze_v8_full_cartesian_shards.cjs");
const ledgerScript = path.join(__dirname, "build_v8_full_cartesian_ledger.cjs");
const plannerScript = path.join(__dirname, "plan_v8_full_cartesian_shards.cjs");
const CAMPAIGN_SCHEMA_VERSION = "v8_full_cartesian_campaign_state_v1";

function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text){
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sha256Json(value){
  return sha256Text(stableStringify(value));
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

function sanitizeLabel(value){
  return String(value || "campaign").replace(/[^a-z0-9_-]+/gi, "_");
}

function padIndex(value){
  return String(value).padStart(11, "0");
}

function splitList(value){
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function toRelativePath(filePath){
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function walkFiles(dir, predicate, files = []){
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(filePath, predicate, files);
    } else if (predicate(entry.name, filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

function runJson(command, args){
  const output = childProcess.execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output);
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function collectShardManifests(dir){
  return walkFiles(dir, name => name.startsWith("shard_") && name.endsWith(".json")).sort();
}

function getManifestInterval(filePath){
  const manifest = readJson(filePath);
  const shard = manifest.shard || {};
  const startIndex = Number(shard.startIndex);
  const executedEndExclusive = Number(shard.executedEndExclusive ?? shard.endExclusive);
  if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(executedEndExclusive)) return null;
  if (executedEndExclusive <= startIndex) return null;
  return { startIndex, executedEndExclusive };
}

function overlapsAny(interval, intervals){
  return intervals.some(item => interval.startIndex < item.executedEndExclusive && item.startIndex < interval.executedEndExclusive);
}

function validateSingleManifest(filePath){
  return runJson(process.execPath, [
    ledgerScript,
    `--file=${toRelativePath(filePath)}`,
    "--detail-limit=-1"
  ]);
}

function discoverSeedManifestPaths(){
  const paths = new Set();
  splitList(readArgValue("--seed-manifest", "--seed-manifests")).forEach(item => {
    paths.add(path.resolve(root, item));
  });
  splitList(readArgValue("--seed-dir", "--seed-dirs")).forEach(item => {
    collectShardManifests(path.resolve(root, item)).forEach(filePath => paths.add(filePath));
  });
  return [...paths].sort();
}

function copyCleanSeedManifests(campaignDir, label){
  const seedPaths = discoverSeedManifestPaths();
  const acceptedDir = path.join(campaignDir, "accepted_seed_manifests");
  fs.mkdirSync(acceptedDir, { recursive: true });
  const existingIntervals = collectShardManifests(campaignDir)
    .map(filePath => {
      try { return getManifestInterval(filePath); } catch (_error) { return null; }
    })
    .filter(Boolean);
  const accepted = [];
  const rejected = [];

  seedPaths.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
      rejected.push({ filePath, reason: "seed_manifest_not_found" });
      return;
    }
    let ledger;
    try {
      ledger = validateSingleManifest(filePath);
    } catch (error) {
      rejected.push({ filePath, reason: "seed_manifest_validation_failed", error: error.message || String(error) });
      return;
    }
    const interval = getManifestInterval(filePath);
    if (!interval) {
      rejected.push({ filePath, reason: "seed_manifest_interval_invalid" });
      return;
    }
    const blockers = [];
    if (ledger.failedShardManifestCount) blockers.push("failed_shard_manifest_validation");
    if (ledger.dirtySourceManifestCount) blockers.push("dirty_source_manifest");
    if (ledger.truncatedManifestCount) blockers.push("truncated_manifest");
    if (overlapsAny(interval, existingIntervals)) blockers.push("overlaps_existing_campaign_interval");
    if (blockers.length) {
      rejected.push({ filePath, interval, reason: blockers.join(",") });
      return;
    }
    const sourceText = fs.readFileSync(filePath, "utf-8");
    const hash = sha256Text(sourceText).slice(0, 12);
    const targetName = `shard_seed_${padIndex(interval.startIndex)}_${padIndex(interval.executedEndExclusive)}_${hash}.json`;
    const targetPath = path.join(acceptedDir, targetName);
    fs.writeFileSync(targetPath, sourceText, "utf-8");
    existingIntervals.push(interval);
    accepted.push({
      sourcePath: filePath,
      targetPath,
      interval,
      manifestSha256: hash,
      label
    });
  });
  return { accepted, rejected };
}

function buildCampaignLedger(campaignDir, outPath){
  return runJson(process.execPath, [
    ledgerScript,
    `--dir=${toRelativePath(campaignDir)}`,
    "--detail-limit=-1",
    `--out=${toRelativePath(outPath)}`
  ]);
}

function buildCampaignPlan(ledgerPath, planPath, { shardSize, maxRanges, fromIndex, label }){
  return runJson(process.execPath, [
    plannerScript,
    `--ledger=${toRelativePath(ledgerPath)}`,
    `--shard-size=${shardSize}`,
    `--max-shards=${maxRanges}`,
    `--from-index=${fromIndex}`,
    `--label=${label}`,
    `--out=${toRelativePath(planPath)}`
  ]);
}

function executePlannedRanges(plan, executionDir){
  fs.mkdirSync(executionDir, { recursive: true });
  const plannedRanges = Array.isArray(plan.plannedRanges) ? plan.plannedRanges : [];
  return plannedRanges.map((range, index) => {
    const start = Number(range.exactStartIndex);
    const end = Number(range.exactEndExclusive);
    const count = end - start;
    const outPath = path.join(executionDir, `shard_${padIndex(start)}_${padIndex(end)}.json`);
    const shardRun = runJson(process.execPath, [
      shardScript,
      `--start=${start}`,
      `--end=${end}`,
      `--max-cases=${count}`,
      `--out=${toRelativePath(outPath)}`
    ]);
    return {
      planIndex: index,
      shardIndex: range.shardIndex,
      exactStartIndex: start,
      exactEndExclusive: end,
      executedCaseCount: count,
      outPath,
      shardRun
    };
  });
}

function writeState(campaignDir, state){
  const statePath = path.join(campaignDir, "campaign_state.json");
  const withIntegrity = {
    ...state,
    integrity: {
      stateSha256: sha256Json({
        ...state,
        integrity: null
      })
    }
  };
  fs.writeFileSync(statePath, JSON.stringify(withIntegrity, null, 2), "utf-8");
  return { state: withIntegrity, statePath };
}

function main(){
  const label = sanitizeLabel(readArgValue("--label") || "v8_full_cartesian_campaign");
  const campaignDir = path.resolve(root, readArgValue("--campaign-dir") || path.join(campaignRoot, label));
  const shardSizeInput = readNumberArg(["--shard-size"], 100000);
  const shardSize = Number.isSafeInteger(shardSizeInput) && shardSizeInput > 0 ? shardSizeInput : 100000;
  const maxRangesInput = readNumberArg(["--max-ranges", "--max-shards"], 0);
  const maxRanges = Number.isSafeInteger(maxRangesInput) && maxRangesInput >= 0 ? maxRangesInput : 0;
  const fromIndexInput = readNumberArg(["--from-index"], 0);
  const fromIndex = Number.isSafeInteger(fromIndexInput) && fromIndexInput >= 0 ? fromIndexInput : 0;
  const planOnly = process.argv.includes("--plan-only");
  const runId = sanitizeLabel(`${label}_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);
  const ledgersDir = path.join(campaignDir, "ledgers");
  const plansDir = path.join(campaignDir, "plans");
  const executionsDir = path.join(campaignDir, "executions", `batch_${runId}`);
  fs.mkdirSync(ledgersDir, { recursive: true });
  fs.mkdirSync(plansDir, { recursive: true });

  const seed = copyCleanSeedManifests(campaignDir, label);
  const beforeLedgerPath = path.join(ledgersDir, `${runId}_before_ledger.json`);
  const beforeLedger = buildCampaignLedger(campaignDir, beforeLedgerPath);
  const planPath = path.join(plansDir, `${runId}_plan.json`);
  buildCampaignPlan(beforeLedgerPath, planPath, { shardSize, maxRanges, fromIndex, label });
  const plan = readJson(planPath);
  const shardRuns = maxRanges > 0 && !planOnly ? executePlannedRanges(plan, executionsDir) : [];
  const analyzer = shardRuns.length
    ? runJson(process.execPath, [analyzerScript, `--dir=${toRelativePath(executionsDir)}`])
    : null;
  const afterLedgerPath = path.join(ledgersDir, `${runId}_after_ledger.json`);
  const afterLedger = buildCampaignLedger(campaignDir, afterLedgerPath);
  const state = {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: {
      cwd: root,
      args: process.argv.slice(2)
    },
    config: {
      label,
      campaignDir,
      shardSize,
      maxRanges,
      fromIndex,
      planOnly
    },
    seed,
    beforeLedger: {
      path: beforeLedgerPath,
      summary: beforeLedger
    },
    plan: {
      path: planPath,
      summary: plan.summary || null,
      ledgerSummary: plan.ledgerSummary || null,
      firstPlannedRange: plan.plannedRanges?.[0] || null
    },
    execution: {
      executionDir: shardRuns.length ? executionsDir : null,
      shardRuns,
      analyzer,
      summary: {
        executedRangeCount: shardRuns.length,
        executedCaseCount: shardRuns.reduce((sum, item) => sum + Number(item.executedCaseCount || 0), 0),
        analyzerFailedCount: analyzer?.failedCount || 0
      }
    },
    afterLedger: {
      path: afterLedgerPath,
      summary: afterLedger
    },
    nonClaims: {
      fullCartesianRun: false,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false
    }
  };
  const { state: savedState, statePath } = writeState(campaignDir, state);
  const output = {
    done: true,
    schemaVersion: savedState.schemaVersion,
    statePath,
    campaignDir,
    seedAcceptedCount: seed.accepted.length,
    seedRejectedCount: seed.rejected.length,
    beforeUniqueExecutedCaseCount: beforeLedger.uniqueExecutedCaseCount,
    beforeContiguousCoveredFromZero: beforeLedger.contiguousCoveredFromZero,
    plannedRangeCount: plan.summary?.plannedRangeCount || 0,
    plannedUncoveredCaseCount: plan.summary?.plannedUncoveredCaseCount || 0,
    firstPlannedRange: plan.plannedRanges?.[0] || null,
    executedRangeCount: savedState.execution.summary.executedRangeCount,
    executedCaseCount: savedState.execution.summary.executedCaseCount,
    analyzerFailedCount: savedState.execution.summary.analyzerFailedCount,
    planOnly,
    afterUniqueExecutedCaseCount: afterLedger.uniqueExecutedCaseCount,
    afterContiguousCoveredFromZero: afterLedger.contiguousCoveredFromZero,
    afterGapCount: afterLedger.gapCount,
    afterFirstGap: afterLedger.firstGap,
    afterDirtySourceManifestCount: afterLedger.dirtySourceManifestCount,
    afterTruncatedManifestCount: afterLedger.truncatedManifestCount,
    afterClosureBlockers: afterLedger.closureBlockers,
    hasExecutionEvidence: savedState.execution.summary.executedRangeCount > 0,
    executionEvidenceClean: savedState.execution.summary.executedRangeCount > 0
      && savedState.execution.summary.analyzerFailedCount === 0
      && Number(afterLedger.dirtySourceManifestCount || 0) === 0
      && Number(afterLedger.truncatedManifestCount || 0) === 0,
    fullCoverageCandidate: afterLedger.fullCoverageCandidate,
    fullCartesianRun: false,
    full8_2CartesianExecutionClosed: false,
    fullV8CompletionClosed: false,
    stateSha256: savedState.integrity.stateSha256
  };
  console.log(JSON.stringify(output, null, 2));
  if (savedState.execution.summary.analyzerFailedCount) process.exitCode = 1;
}

main();
