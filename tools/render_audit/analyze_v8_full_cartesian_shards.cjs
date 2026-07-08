const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..", "..");
const defaultShardDir = path.join(__dirname, "v8_full_cartesian_shards");
const REQUIRED_SCHEMA_VERSION = "v8_full_cartesian_shard_manifest_v1";
const REQUIRED_REPORT_SCHEMA_VERSION = "v8_full_cartesian_shard_report_v1";

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

function collectManifestPaths(){
  const explicit = readArgValue("--file", "--manifest");
  if (explicit) return [path.resolve(root, explicit)];
  const dir = path.resolve(root, readArgValue("--dir") || defaultShardDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.startsWith("shard_") && name.endsWith(".json"))
    .sort()
    .map(name => path.join(dir, name));
}

function validateManifest(manifest, filePath){
  const failures = [];
  const report = manifest.report || {};
  const reportMeta = report.meta || {};
  const reportSummary = report.summary || {};
  const shard = manifest.shard || {};
  const integrity = manifest.integrity || {};
  if (manifest.schemaVersion !== REQUIRED_SCHEMA_VERSION) failures.push("schemaVersion");
  if (reportMeta.reportSchemaVersion !== REQUIRED_REPORT_SCHEMA_VERSION) failures.push("reportSchemaVersion");
  if (reportMeta.fullCartesianRun !== false) failures.push("fullCartesianRun");
  if (reportMeta.reportOnly !== true) failures.push("reportOnly");
  if (reportSummary.full8_2CartesianExecutionClosed !== false) failures.push("full8_2CartesianExecutionClosed");
  if (reportSummary.fullV8CompletionClosed !== false) failures.push("fullV8CompletionClosed");
  if (Number(shard.decodedCaseCount) !== Number(shard.calculatedCaseCount) + Number(shard.constraintOnlyCaseCount)) {
    failures.push("decodedCaseAccounting");
  }
  if (Number(shard.calculationIssueCount) !== 0) failures.push("calculationIssueCount");
  if (integrity.reportSha256 !== sha256Json(report)) failures.push("reportSha256");
  const expectedManifestSha = sha256Json({
    ...manifest,
    integrity: {
      ...integrity,
      manifestSha256: null
    }
  });
  if (integrity.manifestSha256 !== expectedManifestSha) failures.push("manifestSha256");
  if (!manifest.source?.sourceHashes?.["index.html"]) failures.push("sourceHash:index.html");
  return {
    filePath,
    schemaVersion: manifest.schemaVersion || null,
    version: manifest.tool?.version || reportMeta.version || null,
    stage: manifest.tool?.stage || reportMeta.stage || null,
    startIndex: shard.startIndex ?? null,
    endExclusive: shard.endExclusive ?? null,
    decodedCaseCount: shard.decodedCaseCount ?? null,
    calculatedCaseCount: shard.calculatedCaseCount ?? null,
    constraintOnlyCaseCount: shard.constraintOnlyCaseCount ?? null,
    calculationIssueCount: shard.calculationIssueCount ?? null,
    truncated: shard.truncated ?? null,
    fullCartesianRun: shard.fullCartesianRun ?? null,
    failures
  };
}

function main(){
  const paths = collectManifestPaths();
  const manifests = paths.map(filePath => {
    try {
      return validateManifest(JSON.parse(fs.readFileSync(filePath, "utf-8")), filePath);
    } catch (error) {
      return { filePath, failures: [`read:${error.message || String(error)}`] };
    }
  });
  const failedManifests = manifests.filter(item => item.failures.length);
  const report = {
    done: true,
    schemaVersion: REQUIRED_SCHEMA_VERSION,
    manifestCount: manifests.length,
    failedCount: failedManifests.length,
    decodedCaseCount: manifests.reduce((sum, item) => sum + Number(item.decodedCaseCount || 0), 0),
    calculatedCaseCount: manifests.reduce((sum, item) => sum + Number(item.calculatedCaseCount || 0), 0),
    constraintOnlyCaseCount: manifests.reduce((sum, item) => sum + Number(item.constraintOnlyCaseCount || 0), 0),
    truncatedCount: manifests.filter(item => item.truncated === true).length,
    manifests
  };
  console.log(JSON.stringify(report, null, 2));
  if (!manifests.length || failedManifests.length) process.exitCode = 1;
}

main();
