const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..", "..");
const defaultShardDir = path.join(__dirname, "v8_full_cartesian_shards");
const LEDGER_SCHEMA_VERSION = "v8_full_cartesian_coverage_ledger_v1";
const REQUIRED_SHARD_SCHEMA_VERSION = "v8_full_cartesian_shard_manifest_v1";
const REQUIRED_REPORT_SCHEMA_VERSION = "v8_full_cartesian_shard_report_v1";
const REQUIRED_BATCH_SCHEMA_VERSION = "v8_full_cartesian_batch_manifest_v1";
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

function collectShardManifestPaths(inputDir){
  const explicit = readArgValue("--file", "--manifest");
  if (explicit) {
    return explicit.split(",")
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => path.resolve(root, item));
  }
  return walkFiles(inputDir, name => name.startsWith("shard_") && name.endsWith(".json")).sort();
}

function collectBatchSummaryPaths(inputDir){
  return walkFiles(inputDir, name => name === "batch_summary.json").sort();
}

function readJsonFile(filePath){
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function validateShardManifest(manifest, filePath){
  const failures = [];
  const report = manifest.report || {};
  const reportMeta = report.meta || {};
  const reportSummary = report.summary || {};
  const shard = manifest.shard || {};
  const integrity = manifest.integrity || {};
  const source = manifest.source || {};
  const dirtyStatus = typeof source.dirtyStatus === "string" ? source.dirtyStatus : "";
  const startIndex = Number(shard.startIndex);
  const plannedEndExclusive = Number(shard.endExclusive);
  const executedEndExclusive = Number(shard.executedEndExclusive ?? shard.endExclusive);
  const decodedCaseCount = Number(shard.decodedCaseCount);
  const calculatedCaseCount = Number(shard.calculatedCaseCount);
  const constraintOnlyCaseCount = Number(shard.constraintOnlyCaseCount);

  if (manifest.schemaVersion !== REQUIRED_SHARD_SCHEMA_VERSION) failures.push("schemaVersion");
  if (reportMeta.reportSchemaVersion !== REQUIRED_REPORT_SCHEMA_VERSION) failures.push("reportSchemaVersion");
  if (reportMeta.fullCartesianRun !== false) failures.push("fullCartesianRun");
  if (reportMeta.reportOnly !== true) failures.push("reportOnly");
  if (reportSummary.full8_2CartesianExecutionClosed !== false) failures.push("full8_2CartesianExecutionClosed");
  if (reportSummary.fullV8CompletionClosed !== false) failures.push("fullV8CompletionClosed");
  if (decodedCaseCount !== calculatedCaseCount + constraintOnlyCaseCount) failures.push("decodedCaseAccounting");
  if (Number(shard.calculationIssueCount) !== 0) failures.push("calculationIssueCount");
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) failures.push("startIndex");
  if (!Number.isSafeInteger(executedEndExclusive) || executedEndExclusive < startIndex) failures.push("executedEndExclusive");
  if (Number.isSafeInteger(plannedEndExclusive) && executedEndExclusive > plannedEndExclusive) failures.push("executedExceedsPlannedEnd");
  if (Number.isSafeInteger(startIndex) && Number.isSafeInteger(executedEndExclusive) && decodedCaseCount !== executedEndExclusive - startIndex) {
    failures.push("decodedRangeMismatch");
  }
  if (integrity.reportSha256 !== sha256Json(report)) failures.push("reportSha256");
  const expectedManifestSha = sha256Json({
    ...manifest,
    integrity: {
      ...integrity,
      manifestSha256: null
    }
  });
  if (integrity.manifestSha256 !== expectedManifestSha) failures.push("manifestSha256");
  if (!source.sourceHashes?.["index.html"]) failures.push("sourceHash:index.html");

  return {
    filePath,
    relativePath: toRelativePath(filePath),
    schemaVersion: manifest.schemaVersion || null,
    version: manifest.tool?.version || reportMeta.version || null,
    stage: manifest.tool?.stage || reportMeta.stage || null,
    gitHead: source.gitHead || null,
    gitBranch: source.gitBranch || null,
    dirtyStatus,
    dirtySource: dirtyStatus.trim().length > 0,
    startIndex: Number.isFinite(startIndex) ? startIndex : null,
    plannedEndExclusive: Number.isFinite(plannedEndExclusive) ? plannedEndExclusive : null,
    executedEndExclusive: Number.isFinite(executedEndExclusive) ? executedEndExclusive : null,
    decodedCaseCount: Number.isFinite(decodedCaseCount) ? decodedCaseCount : null,
    calculatedCaseCount: Number.isFinite(calculatedCaseCount) ? calculatedCaseCount : null,
    constraintOnlyCaseCount: Number.isFinite(constraintOnlyCaseCount) ? constraintOnlyCaseCount : null,
    calculationIssueCount: Number(shard.calculationIssueCount || 0),
    truncated: shard.truncated === true,
    fullCartesianRun: shard.fullCartesianRun ?? null,
    nominalFullCartesianCaseCount: Number(reportSummary.nominalFullCartesianCaseCount || DEFAULT_NOMINAL_FULL_CARTESIAN_CASE_COUNT),
    failures
  };
}

function validateBatchSummary(batch, filePath){
  const failures = [];
  if (batch.schemaVersion !== REQUIRED_BATCH_SCHEMA_VERSION) failures.push("schemaVersion");
  const expectedBatchSha = sha256Json({
    ...batch,
    integrity: null
  });
  if (batch.integrity?.batchSha256 !== expectedBatchSha) failures.push("batchSha256");
  if (batch.summary?.analyzerFailedCount !== 0) failures.push("analyzerFailedCount");
  if (batch.summary?.fullCartesianRun !== false) failures.push("fullCartesianRun");
  if (batch.summary?.full8_2CartesianExecutionClosed !== false) failures.push("full8_2CartesianExecutionClosed");
  if (batch.summary?.fullV8CompletionClosed !== false) failures.push("fullV8CompletionClosed");
  return {
    filePath,
    relativePath: toRelativePath(filePath),
    schemaVersion: batch.schemaVersion || null,
    shardRunCount: Number(batch.summary?.shardRunCount || 0),
    decodedCaseCount: Number(batch.summary?.decodedCaseCount || 0),
    calculatedCaseCount: Number(batch.summary?.calculatedCaseCount || 0),
    constraintOnlyCaseCount: Number(batch.summary?.constraintOnlyCaseCount || 0),
    truncatedCount: Number(batch.summary?.truncatedCount || 0),
    failures
  };
}

function buildMergedCoverage(intervals, nominalCount){
  const sorted = intervals
    .filter(item => Number.isSafeInteger(item.startIndex) && Number.isSafeInteger(item.executedEndExclusive) && item.executedEndExclusive > item.startIndex)
    .sort((a, b) => a.startIndex - b.startIndex || a.executedEndExclusive - b.executedEndExclusive);
  const merged = [];
  const overlaps = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.startIndex > last.endExclusive) {
      merged.push({
        startIndex: interval.startIndex,
        endExclusive: interval.executedEndExclusive,
        manifestCount: 1
      });
      continue;
    }
    if (interval.startIndex < last.endExclusive) {
      overlaps.push({
        startIndex: interval.startIndex,
        endExclusive: Math.min(interval.executedEndExclusive, last.endExclusive),
        previousMergedEndExclusive: last.endExclusive,
        file: interval.relativePath
      });
    }
    last.endExclusive = Math.max(last.endExclusive, interval.executedEndExclusive);
    last.manifestCount += 1;
  }

  const gaps = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.startIndex > cursor) {
      gaps.push({ startIndex: cursor, endExclusive: interval.startIndex, length: interval.startIndex - cursor });
    }
    cursor = Math.max(cursor, interval.endExclusive);
  }
  if (cursor < nominalCount) {
    gaps.push({ startIndex: cursor, endExclusive: nominalCount, length: nominalCount - cursor });
  }

  const uniqueExecutedCaseCount = merged.reduce((sum, item) => sum + (item.endExclusive - item.startIndex), 0);
  const rawExecutedCaseCount = sorted.reduce((sum, item) => sum + (item.executedEndExclusive - item.startIndex), 0);
  const firstMerged = merged[0] || null;
  const contiguousCoveredFromZero = firstMerged?.startIndex === 0 ? firstMerged.endExclusive : 0;
  const largestGap = gaps.reduce((best, gap) => !best || gap.length > best.length ? gap : best, null);

  return {
    intervalCount: sorted.length,
    mergedIntervalCount: merged.length,
    rawExecutedCaseCount,
    uniqueExecutedCaseCount,
    overlapExecutedCaseCount: rawExecutedCaseCount - uniqueExecutedCaseCount,
    overlapCount: overlaps.length,
    gapCount: gaps.length,
    firstGap: gaps[0] || null,
    largestGap,
    contiguousCoveredFromZero,
    coveragePercent: nominalCount > 0 ? uniqueExecutedCaseCount / nominalCount * 100 : 0,
    merged,
    gaps,
    overlaps
  };
}

function limitList(items, limit){
  if (limit < 0) return items;
  return items.slice(0, limit);
}

function main(){
  const inputDir = path.resolve(root, readArgValue("--dir") || defaultShardDir);
  const detailLimit = readNumberArg(["--detail-limit"], 100);
  const outArg = readArgValue("--out");
  const strictClosure = process.argv.includes("--strict-closure");
  const shardPaths = collectShardManifestPaths(inputDir);
  const batchPaths = collectBatchSummaryPaths(inputDir);

  const shardManifests = shardPaths.map(filePath => {
    try {
      return validateShardManifest(readJsonFile(filePath), filePath);
    } catch (error) {
      return {
        filePath,
        relativePath: toRelativePath(filePath),
        failures: [`read:${error.message || String(error)}`],
        dirtySource: false,
        truncated: false
      };
    }
  });
  const batchSummaries = batchPaths.map(filePath => {
    try {
      return validateBatchSummary(readJsonFile(filePath), filePath);
    } catch (error) {
      return {
        filePath,
        relativePath: toRelativePath(filePath),
        failures: [`read:${error.message || String(error)}`]
      };
    }
  });

  const nominalCandidates = shardManifests
    .map(item => Number(item.nominalFullCartesianCaseCount))
    .filter(value => Number.isSafeInteger(value) && value > 0);
  const nominalFullCartesianCaseCount = nominalCandidates[0] || DEFAULT_NOMINAL_FULL_CARTESIAN_CASE_COUNT;
  const validCoverageManifests = shardManifests.filter(item => !item.failures.length);
  const coverage = buildMergedCoverage(validCoverageManifests, nominalFullCartesianCaseCount);
  const failedManifestCount = shardManifests.filter(item => item.failures.length).length;
  const failedBatchSummaryCount = batchSummaries.filter(item => item.failures.length).length;
  const dirtySourceManifestCount = shardManifests.filter(item => item.dirtySource).length;
  const truncatedManifestCount = shardManifests.filter(item => item.truncated).length;
  const closureBlockers = [];
  if (!shardManifests.length) closureBlockers.push("no_shard_manifests");
  if (failedManifestCount) closureBlockers.push("failed_shard_manifest_validation");
  if (failedBatchSummaryCount) closureBlockers.push("failed_batch_summary_validation");
  if (dirtySourceManifestCount) closureBlockers.push("dirty_source_manifests_present");
  if (truncatedManifestCount) closureBlockers.push("truncated_manifests_present");
  if (coverage.gapCount) closureBlockers.push("coverage_gaps_present");
  if (coverage.uniqueExecutedCaseCount < nominalFullCartesianCaseCount) closureBlockers.push("full_cartesian_coverage_incomplete");

  const fullCoverageCandidate = closureBlockers.length === 0
    && coverage.mergedIntervalCount === 1
    && coverage.merged[0]?.startIndex === 0
    && coverage.merged[0]?.endExclusive >= nominalFullCartesianCaseCount;

  const ledger = {
    done: true,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      cwd: root,
      dir: inputDir,
      args: process.argv.slice(2)
    },
    contract: {
      nominalFullCartesianCaseCount,
      coverageBasis: "executedEndExclusive",
      plannedEndExclusiveIsNotCoverage: true
    },
    summary: {
      shardManifestCount: shardManifests.length,
      validShardManifestCount: validCoverageManifests.length,
      failedShardManifestCount: failedManifestCount,
      batchSummaryCount: batchSummaries.length,
      failedBatchSummaryCount,
      dirtySourceManifestCount,
      truncatedManifestCount,
      rawExecutedCaseCount: coverage.rawExecutedCaseCount,
      uniqueExecutedCaseCount: coverage.uniqueExecutedCaseCount,
      overlapExecutedCaseCount: coverage.overlapExecutedCaseCount,
      overlapCount: coverage.overlapCount,
      gapCount: coverage.gapCount,
      contiguousCoveredFromZero: coverage.contiguousCoveredFromZero,
      coveragePercent: coverage.coveragePercent,
      fullCoverageCandidate,
      full8_2CartesianExecutionClosed: false,
      fullV8CompletionClosed: false,
      closureBlockers
    },
    coverage: {
      mergedIntervals: limitList(coverage.merged, detailLimit),
      gaps: limitList(coverage.gaps, detailLimit),
      overlaps: limitList(coverage.overlaps, detailLimit)
    },
    manifests: limitList(shardManifests.map(item => ({
      file: item.relativePath,
      version: item.version,
      startIndex: item.startIndex ?? null,
      plannedEndExclusive: item.plannedEndExclusive ?? null,
      executedEndExclusive: item.executedEndExclusive ?? null,
      decodedCaseCount: item.decodedCaseCount ?? null,
      calculatedCaseCount: item.calculatedCaseCount ?? null,
      constraintOnlyCaseCount: item.constraintOnlyCaseCount ?? null,
      dirtySource: item.dirtySource === true,
      truncated: item.truncated === true,
      failures: item.failures
    })), detailLimit),
    batches: limitList(batchSummaries.map(item => ({
      file: item.relativePath,
      shardRunCount: item.shardRunCount,
      decodedCaseCount: item.decodedCaseCount,
      calculatedCaseCount: item.calculatedCaseCount,
      constraintOnlyCaseCount: item.constraintOnlyCaseCount,
      truncatedCount: item.truncatedCount,
      failures: item.failures
    })), detailLimit)
  };

  ledger.integrity = {
    ledgerSha256: sha256Json({
      ...ledger,
      integrity: null
    })
  };

  if (outArg) {
    const outPath = path.resolve(root, outArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(ledger, null, 2), "utf-8");
  }

  console.log(JSON.stringify({
    done: true,
    schemaVersion: ledger.schemaVersion,
    outPath: outArg ? path.resolve(root, outArg) : null,
    shardManifestCount: ledger.summary.shardManifestCount,
    failedShardManifestCount: ledger.summary.failedShardManifestCount,
    batchSummaryCount: ledger.summary.batchSummaryCount,
    failedBatchSummaryCount: ledger.summary.failedBatchSummaryCount,
    dirtySourceManifestCount: ledger.summary.dirtySourceManifestCount,
    truncatedManifestCount: ledger.summary.truncatedManifestCount,
    uniqueExecutedCaseCount: ledger.summary.uniqueExecutedCaseCount,
    contiguousCoveredFromZero: ledger.summary.contiguousCoveredFromZero,
    gapCount: ledger.summary.gapCount,
    firstGap: ledger.coverage.gaps[0] || null,
    overlapCount: ledger.summary.overlapCount,
    fullCoverageCandidate: ledger.summary.fullCoverageCandidate,
    full8_2CartesianExecutionClosed: ledger.summary.full8_2CartesianExecutionClosed,
    fullV8CompletionClosed: ledger.summary.fullV8CompletionClosed,
    closureBlockers: ledger.summary.closureBlockers,
    ledgerSha256: ledger.integrity.ledgerSha256
  }, null, 2));

  if (failedManifestCount || failedBatchSummaryCount || (strictClosure && !fullCoverageCandidate)) {
    process.exitCode = 1;
  }
}

main();
