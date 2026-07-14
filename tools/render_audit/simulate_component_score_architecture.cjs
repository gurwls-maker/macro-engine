const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const indexPath = path.join(root, "index.html");
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
    addNodeModuleCandidatesFrom(
      path.join(homeDir, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"),
      targets
    );
  }
  process.env.NODE_PATH = [...targets, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

configurePortableNodePath();
const { chromium } = require("playwright");

function readArgValue(name){
  const prefix = `${name}=`;
  const direct = process.argv.find(arg => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const outputFormat = (readArgValue("--format") || "json").toLowerCase();
const outputPath = readArgValue("--output");
const actualBackupPath = readArgValue("--actual-backup");
const actualReviewOutputPath = readArgValue("--actual-review-output");
const actualRevealOutputPath = readArgValue("--actual-reveal-output");
const actualCounterfactualReviewOutputPath = readArgValue("--actual-counterfactual-review-output");
const actualCounterfactualJudgmentInputPath = readArgValue("--actual-counterfactual-judgment-input");
const actualCounterfactualJudgmentHash = readArgValue("--actual-counterfactual-judgment-hash");
const actualCounterfactualRevealOutputPath = readArgValue("--actual-counterfactual-reveal-output");
const postJudgmentReveal = process.argv.includes("--post-judgment-reveal");
const postCounterfactualJudgmentReveal = process.argv.includes("--post-counterfactual-judgment-reveal");
const assertMode = process.argv.includes("--assert");

function isPathInsideDirectory(candidatePath, parentPath){
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveActualAuditOutputPath(rawPath, flagName){
  if (!rawPath) throw new Error(`${flagName} is required with --actual-backup`);
  const resolved = path.resolve(root, rawPath);
  if (!isPathInsideDirectory(resolved, debugDir)) {
    throw new Error(`${flagName} must stay inside tools/render_audit/_debug`);
  }
  return resolved;
}

function clamp(value, min = 0, max = 100){
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value, digits = 3){
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreBand(score){
  if (!Number.isFinite(score)) return "invalid";
  if (score >= 95) return "aligned";
  if (score >= 85) return "acceptable";
  if (score >= 70) return "warning";
  if (score >= 50) return "problem";
  if (score >= 30) return "serious";
  if (score >= 1) return "severe";
  return "display_collapse";
}

function currentAdditiveFromDomainScores(scores){
  return clamp(100 - scores.reduce((sum, score) => sum + (100 - clamp(score)), 0));
}

function rawProduct(scores){
  return clamp(100 * scores.reduce((product, score) => product * (clamp(score) / 100), 1));
}

function negativePowerMean(scores, power){
  const values = scores.map(score => clamp(score));
  if (values.some(score => score === 0)) return 0;
  const mean = values.reduce((sum, score) => sum + score ** power, 0) / values.length;
  return clamp(mean ** (1 / power));
}

function geometricMean(scores){
  const values = scores.map(score => clamp(score));
  if (values.some(score => score === 0)) return 0;
  return clamp(Math.exp(values.reduce((sum, score) => sum + Math.log(score), 0) / values.length));
}

function geometricWorstGuard(scores, blendFromWorst = 0.5){
  const minimum = Math.min(...scores.map(score => clamp(score)));
  const geometric = geometricMean(scores);
  return clamp(minimum + (geometric - minimum) * blendFromWorst);
}

function minimumWithBoundedResidual(scores, residualWeight = 0.1, residualCap = 10){
  const values = scores.map(score => clamp(score));
  const shortfalls = values.map(score => 100 - score);
  const worstShortfall = Math.max(...shortfalls);
  const otherShortfalls = [...shortfalls];
  otherShortfalls.splice(shortfalls.indexOf(worstShortfall), 1);
  const otherMean = otherShortfalls.length
    ? otherShortfalls.reduce((sum, value) => sum + value, 0) / otherShortfalls.length
    : 0;
  return clamp(Math.min(...values) - Math.min(residualCap, otherMean * residualWeight));
}

const aggregationModels = Object.freeze({
  baseline_current_additive_deficit: scores => currentAdditiveFromDomainScores(scores),
  model_d_raw_product: scores => rawProduct(scores),
  model_e_softmin_p_minus_2: scores => negativePowerMean(scores, -2),
  model_e_softmin_p_minus_4: scores => negativePowerMean(scores, -4),
  model_e_softmin_p_minus_8: scores => negativePowerMean(scores, -8),
  model_f_geometric_worst_guard_35: scores => geometricWorstGuard(scores, 0.35),
  model_f_geometric_worst_guard_50: scores => geometricWorstGuard(scores, 0.5),
  model_f_geometric_worst_guard_65: scores => geometricWorstGuard(scores, 0.65),
  model_g_min_residual_05: scores => minimumWithBoundedResidual(scores, 0.05),
  model_g_min_residual_10: scores => minimumWithBoundedResidual(scores, 0.1),
  model_g_min_residual_20: scores => minimumWithBoundedResidual(scores, 0.2)
});

const symmetricFixtureDefinitions = Object.freeze([
  { id: "core_95_all", domains: { carb: 95, protein: 95, fat: 95, energy: 95 }, expectation: "aligned_or_acceptable" },
  { id: "core_90_all", domains: { carb: 90, protein: 90, fat: 90, energy: 90 }, expectation: "acceptable" },
  { id: "core_80_all", domains: { carb: 80, protein: 80, fat: 80, energy: 80 }, expectation: "warning_near_domain_meaning" },
  { id: "one_100_three_80", domains: { carb: 100, protein: 80, fat: 80, energy: 80 }, expectation: "warning" },
  { id: "single_severe_14", domains: { carb: 100, protein: 100, fat: 100, energy: 14 }, expectation: "severe" },
  { id: "user_example", domains: { carb: 100, protein: 80.5, fat: 90, energy: 45.5 }, expectation: "serious_or_problem" },
  { id: "core_90_joint_80", domains: { carb: 90, protein: 90, fat: 90, energy: 90, joint: 80 }, expectation: "warning_or_acceptable" },
  { id: "core_90_alcohol_80", domains: { carb: 90, protein: 90, fat: 90, energy: 90, alcohol: 80 }, expectation: "warning_or_acceptable" },
  { id: "core_90_joint_80_alcohol_80", domains: { carb: 90, protein: 90, fat: 90, energy: 90, joint: 80, alcohol: 80 }, expectation: "warning" }
]);

function buildSymmetricFixtures(){
  return symmetricFixtureDefinitions.map(fixture => {
    const scores = Object.values(fixture.domains);
    const results = Object.fromEntries(Object.entries(aggregationModels).map(([name, aggregate]) => {
      const score = round(aggregate(scores));
      return [name, { score, band: scoreBand(score) }];
    }));
    return { ...fixture, results };
  });
}

function buildModelScreening(fixtures){
  const byId = Object.fromEntries(fixtures.map(fixture => [fixture.id, fixture]));
  const score = (fixtureId, model) => byId[fixtureId].results[model].score;
  return {
    model_d_raw_product: {
      verdict: "REJECTED",
      reason: "Symmetric moderate domains collapse below their own shared meaning.",
      evidence: { core90: score("core_90_all", "model_d_raw_product"), core80: score("core_80_all", "model_d_raw_product") }
    },
    model_e_softmin_p_minus_4: {
      verdict: "SURVIVES_SYNTHETIC_ONLY",
      reason: "Symmetric values remain stable and a single 14 stays severe; exponent remains an unapproved policy coefficient.",
      evidence: { core90: score("core_90_all", "model_e_softmin_p_minus_4"), singleSevere14: score("single_severe_14", "model_e_softmin_p_minus_4") }
    },
    model_f_geometric_worst_guard_family: {
      verdict: "REJECTED",
      reason: "Every tested blend lifts a single 14 out of the severe band.",
      evidence: {
        blend35: score("single_severe_14", "model_f_geometric_worst_guard_35"),
        blend50: score("single_severe_14", "model_f_geometric_worst_guard_50"),
        blend65: score("single_severe_14", "model_f_geometric_worst_guard_65")
      }
    },
    model_g_minimum_bounded_residual_family: {
      verdict: "SURVIVES_SYNTHETIC_ONLY",
      reason: "A single severe domain is preserved and symmetric moderate values stay near their visible meaning; residual coefficient remains unapproved.",
      evidence: { core90: score("core_90_all", "model_g_min_residual_10"), singleSevere14: score("single_severe_14", "model_g_min_residual_10") }
    },
    selectedProductionModel: null,
    selectionBlocker: "Deterministic fixtures alone cannot select production; compare a privacy-safe actual-day audit when available."
  };
}

const currentJointAnchors = Object.freeze([[0, 0], [0.25, 4], [0.60, 12], [1.20, 26], [2.50, 56]]);
const currentEnergyUnderAnchors = Object.freeze([[0.04, 0], [0.15, 4], [0.30, 12], [0.50, 26], [0.80, 46]]);
const currentEnergyOverAnchors = Object.freeze([[0.02, 0], [0.10, 4], [0.30, 16], [0.60, 36], [1.00, 58]]);
const currentFatLowAnchors = Object.freeze([[0, 0], [0.05, 0.5], [0.25, 5], [0.50, 14], [0.80, 28], [1.00, 40]]);
const currentFatHighAnchors = Object.freeze([[0, 0], [0.01, 0.2], [0.20, 4], [1.00, 20], [2.00, 44], [5.00, 95], [12.00, 190]]);
const currentCarbLowAnchors = Object.freeze([[0, 0], [0.15, 3], [0.35, 10], [0.60, 24], [0.90, 44], [1.00, 54]]);
const currentCarbHighAnchors = Object.freeze([[0, 0], [0.10, 1.5], [0.35, 8], [0.80, 22], [1.50, 46], [3.00, 90]]);
const OPTION_C_EPSILON = 1e-12;
const optionCCurveProbeDefinitions = Object.freeze({
  current_anchor_reference: Object.freeze({
    approved: false,
    role: "reference_only_reuses_current_joint_anchors",
    coefficients: "currentJointAnchors"
  }),
  gentle_smooth_sensitivity: Object.freeze({
    approved: false,
    role: "sensitivity_only",
    coefficients: Object.freeze({ maximumPenalty: 18, curve: "smoothstep_0_to_1" })
  }),
  bounded_sensitivity: Object.freeze({
    approved: false,
    role: "sensitivity_only",
    coefficients: Object.freeze({ rate: 2, maximumPenalty: 12, curve: "normalized_exponential_approach" })
  }),
  drop_curve: Object.freeze({
    approved: false,
    role: "no_separate_joint_penalty_reference",
    coefficients: Object.freeze({ penalty: 0 })
  })
});

function interpolateAnchors(value, anchors){
  if (!Number.isFinite(value) || value <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [x1, y1] = anchors[index];
    const [x0, y0] = anchors[index - 1];
    if (value <= x1) {
      const progress = clamp((value - x0) / Math.max(1e-9, x1 - x0), 0, 1);
      const smooth = progress * progress * (3 - 2 * progress);
      return y0 + (y1 - y0) * smooth;
    }
  }
  const [lastX, lastY] = anchors[anchors.length - 1];
  const [prevX, prevY] = anchors[anchors.length - 2];
  return lastY + (value - lastX) * ((lastY - prevY) / Math.max(1e-9, lastX - prevX));
}

function currentJointPenalty(input){
  const fatLowRatio = input.fatG < input.fatMinG ? (input.fatMinG - input.fatG) / input.fatMinG : 0;
  const fatHighRatio = input.fatG > input.fatMaxG ? (input.fatG - input.fatMaxG) / input.fatMaxG : 0;
  const carbLowRatio = input.carbG < input.carbMinG ? (input.carbMinG - input.carbG) / input.carbMinG : 0;
  const carbHighRatio = input.carbG > input.carbMaxG ? (input.carbG - input.carbMaxG) / input.carbMaxG : 0;
  if (fatLowRatio > 0 && carbHighRatio > 0 && input.proteinAdequate !== false && input.tdeeOk !== false) return 0;
  if (fatLowRatio > 0.35 && carbLowRatio > 0.25) {
    return interpolateAnchors(fatLowRatio + carbLowRatio, currentJointAnchors);
  }
  if (fatLowRatio > 0 && carbHighRatio > 0) {
    return interpolateAnchors(fatLowRatio + carbHighRatio, currentJointAnchors) * (input.tdeeOk === false ? 1 : 0.35);
  }
  if (fatHighRatio > 0 && carbHighRatio > 0) {
    return interpolateAnchors(fatHighRatio + carbHighRatio, currentJointAnchors);
  }
  return 0;
}

function legacyInvalidExchangeOnlyPenalty(input){
  const fatLowRatio = input.fatG < input.fatMinG ? (input.fatMinG - input.fatG) / input.fatMinG : 0;
  const carbHighRatio = input.carbG > input.carbMaxG ? (input.carbG - input.carbMaxG) / input.carbMaxG : 0;
  if (!(fatLowRatio > 0 && carbHighRatio > 0)) return 0;
  if (input.proteinAdequate !== false && input.tdeeOk !== false) return 0;
  return interpolateAnchors(fatLowRatio + carbHighRatio, currentJointAnchors) * (input.tdeeOk === false ? 1 : 0.35);
}

function buildOptionCFeasibleSegment(input = {}){
  const targetKcal = Number(input.targetKcal);
  const proteinReservedG = Number(input.proteinReservedG ?? input.targetProteinG);
  const carbMinG = Number(input.jointCarbMinG ?? input.carbMinG);
  const carbMaxG = Number(input.jointCarbMaxG ?? input.carbMaxG);
  const fatMinG = Number(input.jointFatMinG ?? input.fatMinG);
  const fatMaxG = Number(input.jointFatMaxG ?? input.fatMaxG);
  if (![targetKcal, proteinReservedG, carbMinG, carbMaxG, fatMinG, fatMaxG].every(Number.isFinite)
    || targetKcal <= 0
    || proteinReservedG <= 0
    || carbMinG < 0
    || carbMaxG < carbMinG
    || fatMinG < 0
    || fatMaxG < fatMinG) {
    return { valid: false, status: "invalid_feasible_segment", collapsed: false };
  }
  const derivedAvailableKcal = targetKcal - proteinReservedG * 4;
  const hasExplicitModelAvailableKcal = Object.prototype.hasOwnProperty.call(input, "availableCarbFatKcal");
  const modelAvailableKcal = Number(input.availableCarbFatKcal);
  if (hasExplicitModelAvailableKcal && (!Number.isFinite(modelAvailableKcal) || modelAvailableKcal <= 0)) {
    return {
      valid: false,
      status: "invalid_available_kcal_authority",
      collapsed: false,
      availableKcal: null,
      availableKcalSource: "joint_allocation_model"
    };
  }
  const hasModelAvailableKcal = hasExplicitModelAvailableKcal;
  const availableKcal = hasModelAvailableKcal ? modelAvailableKcal : derivedAvailableKcal;
  if (!(availableKcal > 0)) return { valid: false, status: "invalid_available_kcal", collapsed: false };
  const availableKcalAuthorityGap = hasModelAvailableKcal ? modelAvailableKcal - derivedAvailableKcal : 0;
  if (Math.abs(availableKcalAuthorityGap) > 1e-6) {
    return { valid: false, status: "available_kcal_authority_mismatch", collapsed: false, availableKcal, availableKcalAuthorityGap };
  }
  const lowerEndpointKcalGap = carbMinG * 4 + fatMaxG * 9 - availableKcal;
  const upperEndpointKcalGap = carbMaxG * 4 + fatMinG * 9 - availableKcal;
  if (Math.abs(lowerEndpointKcalGap) > 1e-6 || Math.abs(upperEndpointKcalGap) > 1e-6) {
    return {
      valid: false,
      status: "joint_endpoint_authority_mismatch",
      collapsed: false,
      availableKcal,
      availableKcalAuthorityGap,
      lowerEndpointKcalGap,
      upperEndpointKcalGap
    };
  }
  const lowerShare = carbMinG * 4 / availableKcal;
  const upperShare = carbMaxG * 4 / availableKcal;
  if (![lowerShare, upperShare].every(Number.isFinite)
    || lowerShare <= 0
    || upperShare >= 1
    || lowerShare > upperShare) {
    return { valid: false, status: "invalid_simplex_bounds", collapsed: false, availableKcal, lowerShare, upperShare };
  }
  if (upperShare - lowerShare <= OPTION_C_EPSILON || input.collapsed === true) {
    return { valid: false, status: "collapsed_feasible_segment", collapsed: true, availableKcal, lowerShare, upperShare };
  }
  return {
    valid: true,
    status: "valid",
    collapsed: false,
    availableKcal,
    availableKcalSource: hasModelAvailableKcal ? "joint_allocation_model" : "derived_fixture_fallback",
    availableKcalAuthorityGap,
    lowerEndpointKcalGap,
    upperEndpointKcalGap,
    lowerShare,
    upperShare,
    lowerEndpoint: { carbKcal: availableKcal * lowerShare, fatKcal: availableKcal * (1 - lowerShare) },
    upperEndpoint: { carbKcal: availableKcal * upperShare, fatKcal: availableKcal * (1 - upperShare) }
  };
}

function getOptionCActualComposition(input = {}){
  const carbG = Number(input.carbG);
  const fatG = Number(input.fatG);
  if (![carbG, fatG].every(Number.isFinite) || carbG < 0 || fatG < 0) {
    return { valid: false, status: "invalid_actual_composition" };
  }
  const carbKcal = carbG * 4;
  const fatKcal = fatG * 9;
  const carbFatKcal = carbKcal + fatKcal;
  if (!(carbFatKcal > 0)) return { valid: false, status: "empty_actual_composition", carbKcal, fatKcal, carbFatKcal };
  return {
    valid: true,
    status: "valid",
    carbKcal,
    fatKcal,
    carbFatKcal,
    carbEnergyShare: carbKcal / carbFatKcal
  };
}

function getOptionCResidualFromShare(share, feasible){
  if (!feasible?.valid || !Number.isFinite(share)) {
    return { valid: false, status: feasible?.status || "invalid_normalized_position", direction: "invalid", ratio: null };
  }
  if (share < feasible.lowerShare) {
    return {
      valid: true,
      status: "valid",
      direction: "fat_heavy",
      ratio: (feasible.lowerShare - share) / feasible.lowerShare
    };
  }
  if (share > feasible.upperShare) {
    return {
      valid: true,
      status: "valid",
      direction: "carb_heavy",
      ratio: (share - feasible.upperShare) / (1 - feasible.upperShare)
    };
  }
  return { valid: true, status: "valid", direction: "inside", ratio: 0 };
}

function optionC1CarbEnergyShareResidual(input = {}){
  const feasible = buildOptionCFeasibleSegment(input);
  const actual = getOptionCActualComposition(input);
  if (!feasible.valid || !actual.valid) {
    return {
      valid: false,
      status: !feasible.valid ? feasible.status : actual.status,
      direction: "invalid",
      ratio: null,
      feasible,
      normalizedPosition: actual.valid ? actual.carbEnergyShare : null
    };
  }
  const residual = getOptionCResidualFromShare(actual.carbEnergyShare, feasible);
  return { ...residual, feasible, normalizedPosition: actual.carbEnergyShare };
}

function optionC2RadialKcalPlaneResidual(input = {}){
  const feasible = buildOptionCFeasibleSegment(input);
  const actual = getOptionCActualComposition(input);
  if (!feasible.valid || !actual.valid) {
    return {
      valid: false,
      status: !feasible.valid ? feasible.status : actual.status,
      direction: "invalid",
      ratio: null,
      feasible,
      normalizedPosition: actual.valid ? actual.carbEnergyShare : null,
      radialScale: null,
      projected: null
    };
  }
  const radialScale = feasible.availableKcal / actual.carbFatKcal;
  const projectedCarbKcal = actual.carbKcal * radialScale;
  const projectedFatKcal = actual.fatKcal * radialScale;
  const lowerCarbKcal = feasible.lowerEndpoint.carbKcal;
  const upperCarbKcal = feasible.upperEndpoint.carbKcal;
  let direction = "inside";
  let ratio = 0;
  if (projectedCarbKcal < lowerCarbKcal) {
    direction = "fat_heavy";
    ratio = (lowerCarbKcal - projectedCarbKcal) / lowerCarbKcal;
  } else if (projectedCarbKcal > upperCarbKcal) {
    direction = "carb_heavy";
    ratio = (projectedCarbKcal - upperCarbKcal) / (feasible.availableKcal - upperCarbKcal);
  }
  return {
    valid: true,
    status: "valid",
    direction,
    ratio,
    feasible,
    normalizedPosition: projectedCarbKcal / feasible.availableKcal,
    radialScale,
    projected: { carbKcal: projectedCarbKcal, fatKcal: projectedFatKcal }
  };
}

function optionC3LegacyNormalizedCarbBaseline(input = {}){
  const feasible = buildOptionCFeasibleSegment(input);
  const actual = getOptionCActualComposition(input);
  if (!feasible.valid || !actual.valid) {
    return {
      valid: false,
      status: !feasible.valid ? feasible.status : actual.status,
      direction: "invalid",
      ratio: null,
      disposition: "DROP",
      normalizedCarbG: null
    };
  }
  const radialScale = feasible.availableKcal / actual.carbFatKcal;
  const jointCarbMinG = Number(input.jointCarbMinG ?? input.carbMinG);
  const jointCarbMaxG = Number(input.jointCarbMaxG ?? input.carbMaxG);
  const normalizedCarbG = Number(input.carbG) * radialScale;
  let direction = "inside";
  let ratio = 0;
  if (normalizedCarbG < jointCarbMinG) {
    direction = "fat_heavy";
    ratio = (jointCarbMinG - normalizedCarbG) / jointCarbMinG;
  } else if (normalizedCarbG > jointCarbMaxG) {
    direction = "carb_heavy";
    ratio = (normalizedCarbG - jointCarbMaxG) / jointCarbMaxG;
  }
  return { valid: true, status: "valid", direction, ratio, disposition: "DROP", normalizedCarbG };
}

function evaluateOptionCCurveProbes(residualRatio){
  if (!Number.isFinite(residualRatio) || residualRatio < 0) return null;
  const x = clamp(residualRatio, 0, 1);
  const smooth = x * x * (3 - 2 * x);
  const boundedDenominator = 1 - Math.exp(-2);
  return {
    current_anchor_reference: interpolateAnchors(x, currentJointAnchors),
    gentle_smooth_sensitivity: 18 * smooth,
    bounded_sensitivity: 12 * (1 - Math.exp(-2 * x)) / boundedDenominator,
    drop_curve: 0
  };
}

function simplifiedHistoricalCorePenalty(input){
  const targetRatio = input.totalKcal / input.targetKcal;
  const energyPenalty = targetRatio < 1
    ? interpolateAnchors(1 - targetRatio, currentEnergyUnderAnchors)
    : interpolateAnchors(targetRatio - 1, currentEnergyOverAnchors);
  const fatMinG = Number(input.rawFatMinG ?? input.fatMinG);
  const fatMaxG = Number(input.rawFatMaxG ?? input.fatMaxG);
  const carbMinG = Number(input.rawCarbMinG ?? input.carbMinG);
  const carbMaxG = Number(input.rawCarbMaxG ?? input.carbMaxG);
  const fatLowRatio = input.fatG < fatMinG ? (fatMinG - input.fatG) / fatMinG : 0;
  const fatHighRatio = input.fatG > fatMaxG ? (input.fatG - fatMaxG) / fatMaxG : 0;
  const carbLowRatio = input.carbG < carbMinG ? (carbMinG - input.carbG) / carbMinG : 0;
  const carbHighRatio = input.carbG > carbMaxG ? (input.carbG - carbMaxG) / carbMaxG : 0;
  const fatPenalty = fatLowRatio > 0
    ? interpolateAnchors(fatLowRatio, currentFatLowAnchors)
    : interpolateAnchors(fatHighRatio, currentFatHighAnchors);
  const carbPenalty = carbLowRatio > 0
    ? interpolateAnchors(carbLowRatio, currentCarbLowAnchors)
    : interpolateAnchors(carbHighRatio, currentCarbHighAnchors);
  return { energyPenalty, fatPenalty, carbPenalty, total: energyPenalty + fatPenalty + carbPenalty };
}

function makeJointFixture(id, overrides = {}){
  const targetKcal = 2212;
  const targetProteinG = 125.6;
  const availableKcal = targetKcal - targetProteinG * 4;
  const carbMinG = 246;
  const carbMaxG = 310;
  const fatMinG = (availableKcal - carbMaxG * 4) / 9;
  const fatMaxG = (availableKcal - carbMinG * 4) / 9;
  return {
    id,
    category: "synthetic",
    targetKcal,
    targetProteinG,
    proteinReservedG: targetProteinG,
    carbMinG,
    carbMaxG,
    fatMinG,
    fatMaxG,
    proteinAdequate: true,
    tdeeOk: true,
    ...overrides
  };
}

function makeJointFixtureFromShare(id, share, scale = 1, overrides = {}){
  const base = makeJointFixture(id);
  const feasible = buildOptionCFeasibleSegment(base);
  const carbFatKcal = feasible.availableKcal * scale;
  return {
    ...base,
    carbG: carbFatKcal * share / 4,
    fatG: carbFatKcal * (1 - share) / 9,
    totalKcal: base.targetProteinG * 4 + carbFatKcal,
    sourceShare: share,
    radialAmountScale: scale,
    ...overrides
  };
}

function evaluateJointFixture(input){
  const deviationRatios = {
    fatLow: input.fatG < input.fatMinG ? (input.fatMinG - input.fatG) / input.fatMinG : 0,
    fatHigh: input.fatG > input.fatMaxG ? (input.fatG - input.fatMaxG) / input.fatMaxG : 0,
    carbLow: input.carbG < input.carbMinG ? (input.carbMinG - input.carbG) / input.carbMinG : 0,
    carbHigh: input.carbG > input.carbMaxG ? (input.carbG - input.carbMaxG) / input.carbMaxG : 0
  };
  const currentPenalty = currentJointPenalty(input);
  const optionBPenalty = legacyInvalidExchangeOnlyPenalty(input);
  const c1 = optionC1CarbEnergyShareResidual(input);
  const c2 = optionC2RadialKcalPlaneResidual(input);
  const c3 = optionC3LegacyNormalizedCarbBaseline(input);
  const candidatePenalties = evaluateOptionCCurveProbes(c1.ratio);
  const core = simplifiedHistoricalCorePenalty(input);
  const residualPositive = c1.valid && Number(c1.ratio) > OPTION_C_EPSILON;
  const coreAxisOverlap = {
    energy: Number(core.energyPenalty) > OPTION_C_EPSILON,
    carb: Number(core.carbPenalty) > OPTION_C_EPSILON,
    fat: Number(core.fatPenalty) > OPTION_C_EPSILON
  };
  const coreOverlap = residualPositive && Object.values(coreAxisOverlap).some(Boolean);
  const uniqueResidual = residualPositive && !coreOverlap;
  const referencePenalty = Number(candidatePenalties?.current_anchor_reference) || 0;
  const feasible = c1.feasible || c2.feasible || buildOptionCFeasibleSegment(input);
  return {
    ...input,
    feasibleSegment: {
      valid: feasible?.valid === true,
      status: feasible?.status || "invalid",
      collapsed: feasible?.collapsed === true,
      availableKcal: round(feasible?.availableKcal, 9),
      availableKcalSource: feasible?.availableKcalSource || null,
      availableKcalAuthorityGap: round(feasible?.availableKcalAuthorityGap, 12),
      lowerEndpointKcalGap: round(feasible?.lowerEndpointKcalGap, 12),
      upperEndpointKcalGap: round(feasible?.upperEndpointKcalGap, 12),
      carbEnergyShare: {
        lower: round(feasible?.lowerShare, 12),
        upper: round(feasible?.upperShare, 12)
      },
      carbsG: {
        lower: round(input.jointCarbMinG ?? input.carbMinG, 9),
        upper: round(input.jointCarbMaxG ?? input.carbMaxG, 9)
      },
      fatG: {
        lower: round(input.jointFatMinG ?? input.fatMinG, 9),
        upper: round(input.jointFatMaxG ?? input.fatMaxG, 9)
      },
      rawRectangle: {
        carbsG: { lower: round(input.rawCarbMinG ?? input.carbMinG, 9), upper: round(input.rawCarbMaxG ?? input.carbMaxG, 9) },
        fatG: { lower: round(input.rawFatMinG ?? input.fatMinG, 9), upper: round(input.rawFatMaxG ?? input.fatMaxG, 9) }
      }
    },
    normalizedPosition: round(c1.normalizedPosition, 12),
    residuals: {
      c1_carb_energy_share: {
        valid: c1.valid,
        status: c1.status,
        direction: c1.direction,
        ratio: round(c1.ratio, 12)
      },
      c2_radial_kcal_plane: {
        valid: c2.valid,
        status: c2.status,
        direction: c2.direction,
        ratio: round(c2.ratio, 12),
        radialScale: round(c2.radialScale, 12)
      },
      c3_legacy_normalized_carb: {
        valid: c3.valid,
        status: c3.status,
        direction: c3.direction,
        ratio: round(c3.ratio, 12),
        disposition: "DROP"
      },
      c1C2AbsoluteDelta: c1.valid && c2.valid ? round(Math.abs(c1.ratio - c2.ratio), 15) : null
    },
    candidatePenalties: candidatePenalties
      ? Object.fromEntries(Object.entries(candidatePenalties).map(([key, value]) => [key, round(value, 9)]))
      : null,
    candidateFinalScores: candidatePenalties
      ? Object.fromEntries(Object.entries(candidatePenalties).map(([key, value]) => [key, round(clamp(100 - core.total - value), 9)]))
      : null,
    deviationRatios: Object.fromEntries(Object.entries(deviationRatios).map(([key, value]) => [key, round(value, 9)])),
    results: {
      option_a_remove_joint: { penalty: 0 },
      option_b_legacy_invalid_exchange_only: { penalty: round(optionBPenalty) },
      option_c_joint_allocation_residual: {
        penalty: round(candidatePenalties?.current_anchor_reference),
        residualRatio: round(c1.ratio, 12),
        direction: c1.direction,
        valid: c1.valid
      },
      option_c2_radial_kcal_plane_equivalence: {
        penalty: round(candidatePenalties?.current_anchor_reference),
        residualRatio: round(c2.ratio, 12),
        direction: c2.direction,
        valid: c2.valid
      },
      option_c3_legacy_normalized_carb_drop: {
        penalty: c3.valid ? round(interpolateAnchors(c3.ratio, currentJointAnchors)) : null,
        residualRatio: round(c3.ratio, 12),
        direction: c3.direction,
        disposition: "DROP"
      },
      option_d_current_thresholded: { penalty: round(currentPenalty) }
    },
    simplifiedHistoricalCorePenalty: {
      energy: round(core.energyPenalty),
      carb: round(core.carbPenalty),
      fat: round(core.fatPenalty),
      total: round(core.total)
    },
    coreOverlap: {
      residualPositive,
      axes: coreAxisOverlap,
      overlap: coreOverlap,
      uniqueResidual,
      overlapShare: round(referencePenalty / Math.max(OPTION_C_EPSILON, Number(core.total) + referencePenalty), 9)
    },
    currentJointShareOfCorePlusJoint: round(currentPenalty / Math.max(1e-9, core.total + currentPenalty), 6)
  };
}

function buildJointFixtures(){
  const fixtures = [];
  const canonical = makeJointFixture("canonical_geometry");
  const canonicalFeasible = buildOptionCFeasibleSegment(canonical);
  const lower = canonicalFeasible.lowerShare;
  const upper = canonicalFeasible.upperShare;
  const middle = (lower + upper) / 2;

  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("inside_lower", lower + (upper - lower) * 0.25)));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("inside_middle", middle)));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("inside_upper", lower + (upper - lower) * 0.75)));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("lower_endpoint", lower)));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("upper_endpoint", upper)));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("epsilon_outside_fat", lower - 1e-6, 1, { category: "boundary_continuity" })));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("epsilon_outside_carb", upper + 1e-6, 1, { category: "boundary_continuity" })));

  const outwardResidualGrid = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 1.00];
  outwardResidualGrid.forEach((residual, index) => {
    fixtures.push(evaluateJointFixture(makeJointFixtureFromShare(
      `outward_fat_${String(index + 1).padStart(2, "0")}`,
      lower * (1 - residual),
      1,
      { category: "outward_monotonic", expectedResidual: residual }
    )));
    fixtures.push(evaluateJointFixture(makeJointFixtureFromShare(
      `outward_carb_${String(index + 1).padStart(2, "0")}`,
      upper + (1 - upper) * residual,
      1,
      { category: "outward_monotonic", expectedResidual: residual }
    )));
  });

  [0.5, 1, 2].forEach(scale => {
    fixtures.push(evaluateJointFixture(makeJointFixtureFromShare(
      `radial_fat_${String(scale).replace(".", "_")}x`,
      lower * 0.75,
      scale,
      { category: "radial_scale", expectedResidual: 0.25 }
    )));
    fixtures.push(evaluateJointFixture(makeJointFixtureFromShare(
      `radial_carb_${String(scale).replace(".", "_")}x`,
      upper + (1 - upper) * 0.25,
      scale,
      { category: "radial_scale", expectedResidual: 0.25 }
    )));
  });

  for (const fatLowPct of [34, 35, 36]) {
    for (const carbLowPct of [24, 25, 26]) {
      const base = makeJointFixture(`threshold_fat_${fatLowPct}_carb_${carbLowPct}`);
      fixtures.push(evaluateJointFixture({
        ...base,
        category: "historical_threshold_grid",
        fatG: base.fatMinG * (1 - fatLowPct / 100),
        carbG: base.carbMinG * (1 - carbLowPct / 100),
        totalKcal: base.targetProteinG * 4 + base.fatMinG * (1 - fatLowPct / 100) * 9 + base.carbMinG * (1 - carbLowPct / 100) * 4
      }));
    }
  }

  fixtures.push(evaluateJointFixture(makeJointFixture("user_reproduced_before", {
    category: "user_reproduced",
    carbG: 169,
    fatG: 16.2,
    totalKcal: 1116,
    observedUiPenalty: 20.6
  })));
  fixtures.push(evaluateJointFixture(makeJointFixture("user_reproduced_after", {
    category: "user_reproduced",
    carbG: 241,
    fatG: 18.7,
    totalKcal: 1538,
    observedUiPenalty: 0
  })));

  const valid = makeJointFixture("same_kcal_valid_exchange");
  fixtures.push(evaluateJointFixture({
    ...valid,
    category: "same_kcal",
    carbG: 300,
    fatG: (valid.targetKcal - valid.targetProteinG * 4 - 300 * 4) / 9,
    totalKcal: valid.targetKcal
  }));

  fixtures.push(evaluateJointFixture(makeJointFixture("high_carb_high_fat_energy_over", {
    category: "high_high",
    carbG: 400,
    fatG: 90,
    totalKcal: 2912,
    tdeeOk: false
  })));

  const lowBalanced = makeJointFixture("low_carb_low_fat_energy_under_balanced_mix");
  fixtures.push(evaluateJointFixture({
    ...lowBalanced,
    category: "low_low",
    carbG: 149.9,
    fatG: 28.35,
    totalKcal: 1106
  }));

  const skew = makeJointFixture("same_kcal_outside_joint_segment");
  fixtures.push(evaluateJointFixture({
    ...skew,
    category: "same_kcal_outside",
    carbG: 390,
    fatG: (skew.targetKcal - skew.targetProteinG * 4 - 390 * 4) / 9,
    totalKcal: skew.targetKcal
  }));

  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("same_kcal_outside_fat", lower * 0.5, 1, { category: "same_kcal_outside" })));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("carb_only_simplex", 1, 1, { category: "carb_only" })));
  fixtures.push(evaluateJointFixture(makeJointFixtureFromShare("fat_only_simplex", 0, 1, { category: "fat_only" })));
  fixtures.push(evaluateJointFixture(makeJointFixture("carb_only_marginal_high", {
    category: "carb_only",
    carbG: canonical.carbMaxG * 1.15,
    fatG: (canonical.fatMinG + canonical.fatMaxG) / 2,
    totalKcal: canonical.targetProteinG * 4 + canonical.carbMaxG * 1.15 * 4 + (canonical.fatMinG + canonical.fatMaxG) / 2 * 9
  })));
  fixtures.push(evaluateJointFixture(makeJointFixture("fat_only_marginal_high", {
    category: "fat_only",
    carbG: (canonical.carbMinG + canonical.carbMaxG) / 2,
    fatG: canonical.fatMaxG * 1.15,
    totalKcal: canonical.targetProteinG * 4 + (canonical.carbMinG + canonical.carbMaxG) / 2 * 4 + canonical.fatMaxG * 1.15 * 9
  })));
  fixtures.push(evaluateJointFixture(makeJointFixture("invalid_empty_composition", {
    category: "invalid",
    carbG: 0,
    fatG: 0,
    totalKcal: canonical.targetProteinG * 4
  })));
  const collapsedCarbG = (canonical.carbMinG + canonical.carbMaxG) / 2;
  const collapsedFatG = (canonicalFeasible.availableKcal - collapsedCarbG * 4) / 9;
  fixtures.push(evaluateJointFixture(makeJointFixture("collapsed_feasible_segment", {
    category: "invalid",
    carbMinG: collapsedCarbG,
    carbMaxG: collapsedCarbG,
    fatMinG: collapsedFatG,
    fatMaxG: collapsedFatG,
    carbG: collapsedCarbG,
    fatG: collapsedFatG,
    totalKcal: canonical.targetKcal,
    collapsed: true
  })));
  fixtures.push(evaluateJointFixture(makeJointFixture("invalid_joint_endpoint_authority", {
    category: "invalid",
    fatMaxG: canonical.fatMaxG + 1,
    carbG: 300,
    fatG: (canonicalFeasible.availableKcal - 300 * 4) / 9,
    totalKcal: canonical.targetKcal
  })));
  const nonAlignedBase = {
    category: "non_aligned_raw_rectangle",
    targetKcal: 1400,
    targetProteinG: 100,
    proteinReservedG: 100,
    rawCarbMinG: 100,
    rawCarbMaxG: 150,
    rawFatMinG: 300 / 9,
    rawFatMaxG: 500 / 9,
    carbMinG: 100,
    carbMaxG: 150,
    fatMinG: 300 / 9,
    fatMaxG: 500 / 9,
    jointCarbMinG: 125,
    jointCarbMaxG: 150,
    jointFatMinG: 400 / 9,
    jointFatMaxG: 500 / 9,
    proteinAdequate: true,
    tdeeOk: true,
    totalKcal: 1300
  };
  fixtures.push(evaluateJointFixture({
    id: "non_aligned_core_matched_outside",
    ...nonAlignedBase,
    carbG: 100,
    fatG: 500 / 9
  }));
  fixtures.push(evaluateJointFixture({
    id: "non_aligned_core_matched_inside",
    ...nonAlignedBase,
    carbG: 125,
    fatG: 400 / 9
  }));
  return fixtures.sort((a, b) => a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
}

function createStaticServer(){
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
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
      response.writeHead(200, { "Content-Type": path.extname(filePath) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream" });
      response.end(data);
    });
  });
}

async function launchBrowserContext(profileDir){
  const launchOptions = {
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--disable-background-networking"]
  };
  const channels = [...new Set([process.env.PLAYWRIGHT_BROWSER_CHANNEL, "msedge", "chrome", ""].filter(channel => channel !== undefined))];
  let lastError = null;
  for (const channel of channels) {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        ...launchOptions,
        ...(channel ? { channel } : {})
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to launch a Playwright browser");
}

async function buildTargetMatrix(){
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const profileDir = fs.mkdtempSync(path.join(debugDir, "component_score_simulation_"));
  let context;
  try {
    context = await launchBrowserContext(profileDir);
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html?codexInternalTests=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof calculate === "function" && typeof getMacroRangeProductionScoreSummary === "function", null, { timeout: 90000 });
    return await page.evaluate(() => {
      const goals = ["diet", "cut", "recomp", "maintain", "lean_bulk", "bulk"];
      const contexts = ["rest", "normal", "high"];
      const proteinLevels = ["low", "medium", "high"];
      const penaltyKeys = [
        "targetEnergyDeviationPenalty",
        "tdeeOverloadPenalty",
        "proteinShortagePenalty",
        "proteinExcessEfficiencyPenalty",
        "fatRangePenalty",
        "carbExerciseContextPenalty",
        "carbFatExchangeFailurePenalty",
        "alcoholPhysiologyPenalty",
        "dataOutlierPenalty"
      ];
      const nonJointPenaltyKeys = penaltyKeys.filter(key => key !== "carbFatExchangeFailurePenalty");
      const rows = [];
      const crossProfileRows = [];
      const productionOwnershipRows = [];

      function applyContext(name, profile = {}){
        const contextConfig = name === "rest"
          ? {
              exerciseManagementMode: EXERCISE_MANAGEMENT_MODES.GENERAL,
              routine: "REST",
              profileSession: "rest",
              weightDuration: 0,
              weeklyTrainingDays: 0,
              intensityOverride: 0,
              cardioDuration: 0,
              cardioSpeed: 0,
              cardioIncline: 0
            }
          : name === "normal"
            ? {
                exerciseManagementMode: EXERCISE_MANAGEMENT_MODES.EXERCISE,
                routine: "PUSH",
                profileSession: "bodybuilding_push",
                weightDuration: 60,
                weeklyTrainingDays: 3,
                intensityOverride: 0.8,
                cardioDuration: 0,
                cardioSpeed: 0,
                cardioIncline: 0
              }
            : {
                exerciseManagementMode: EXERCISE_MANAGEMENT_MODES.EXERCISE,
                routine: "LEGS",
                profileSession: "bodybuilding_legs",
                weightDuration: 120,
                weeklyTrainingDays: 5,
                intensityOverride: 0.95,
                cardioType: "treadmill_run",
                cardioDuration: 30,
                cardioSpeed: 8.5,
                cardioIncline: 0
              };
        Object.assign(state, DEFAULT_STATE, {
          weight: 75,
          height: 175,
          age: 32,
          gender: "male",
          bodyCompositionConfirmed: false,
          activityLevel: "sedentary",
          workType: "office",
          sleepHours: 8,
          workHours: 8,
          lifestyleHours: 4,
          workAdj: 0,
          exerciseProfile: "bodybuilding",
          routinePlan: "ppl_ul",
          generalAdvancedSettings: true,
          adaptiveMacroTargetsEnabled: false,
          ...profile,
          ...contextConfig
        });
        applyStateToInputs();
      }

      function targetValidity(result){
        const rate = result.targetRateContext || {};
        const protein = result.proteinTargetLevelContext || {};
        const application = result.externalMacroActiveProductionApplication || {};
        const weight = Math.max(1, Number(result.s?.weight) || 1);
        const actualProteinGkg = Number(result.protein) / weight;
        const macroKcal = Number(result.protein) * 4 + Number(result.carbs) * 4 + Number(result.fat) * 9;
        const selectedProteinMatchesRequested = protein.constrained === true
          ? Number.isFinite(Number(protein.requestedGkg))
            && Number.isFinite(Number(protein.automaticGkg))
            && actualProteinGkg >= Math.min(Number(protein.requestedGkg), Number(protein.automaticGkg)) - 0.021
            && actualProteinGkg <= Math.max(Number(protein.requestedGkg), Number(protein.automaticGkg)) + 0.021
            && Array.isArray(protein.constraintReasons)
            && protein.constraintReasons.length > 0
          : Number.isFinite(Number(protein.requestedGkg))
            && Math.abs(actualProteinGkg - Number(protein.requestedGkg)) <= 0.021;
        const checks = {
          finitePositiveTarget: Number.isFinite(result.targetCal) && result.targetCal > 0,
          finiteNonNegativeMacros: Number.isFinite(result.protein) && result.protein > 0
            && Number.isFinite(result.carbs) && result.carbs >= 0
            && Number.isFinite(result.fat) && result.fat >= 0,
          goalDeltaInsideGuard: Number.isFinite(rate.clampedGoalDelta)
            && rate.clampedGoalDelta >= rate.deltaGuardMin - 1e-6
            && rate.clampedGoalDelta <= rate.deltaGuardMax + 1e-6,
          energyAvailabilityFloorHonored: Number.isFinite(rate.minimumTargetCal)
            && rate.minimumTargetCal >= 0
            && rate.targetCal >= rate.minimumTargetCal - 1e-6,
          targetRateMatchesTarget: Number.isFinite(rate.targetCal) && Math.abs(Number(rate.targetCal) - Number(result.targetCal)) <= 8,
          proteinSelectionMatchesIndependentRequest: selectedProteinMatchesRequested,
          externalApplicationMatchesFinalTarget: application.applied === true
            && Math.abs(Number(application.targetCal) - Number(result.targetCal)) <= 8
            && Math.abs(Number(application.protein) - Number(result.protein)) <= 0.25
            && Math.abs(Number(application.carbs) - Number(result.carbs)) <= 0.25
            && Math.abs(Number(application.fat) - Number(result.fat)) <= 0.25,
          macroKcalMatchesTarget: Number.isFinite(macroKcal) && Math.abs(macroKcal - Number(result.targetCal)) <= 8
        };
        return { checks, valid: Object.values(checks).every(Boolean), macroKcalGap: macroKcal - Number(result.targetCal) };
      }

      function buildProductionOwnershipRows({ caseId, matrixKind, target, summary }){
        const geometry = summary.scoringContext?.jointAllocationModel || null;
        const rawCarbs = geometry?.rawRanges?.carbs;
        const rawFat = geometry?.rawRanges?.fat;
        const required = [
          target?.targetCal,
          target?.protein,
          target?.carbs,
          target?.fat,
          geometry?.proteinReservedG,
          geometry?.availableCarbFatKcal,
          rawCarbs?.min,
          rawCarbs?.max,
          rawFat?.min,
          rawFat?.max
        ].map(Number);
        if (!geometry || !required.every(Number.isFinite)) return [];

        const fractions = [0, 0.25, 0.5, 0.75, 1];
        const neutralZoneScales = [0.98, 1, 1.02];
        const availableKcal = Number(geometry.availableCarbFatKcal);
        const proteinReservedG = Number(geometry.proteinReservedG);
        const points = new Map();
        const roundNine = value => Math.round(Number(value) * 1e9) / 1e9;
        const addPoint = (pointId, carbG, fatG, source) => {
          if (![carbG, fatG].every(Number.isFinite) || carbG < 0 || fatG < 0) return;
          const key = `${roundNine(carbG)}|${roundNine(fatG)}`;
          if (!points.has(key)) points.set(key, { pointId, carbG, fatG, source });
        };
        fractions.forEach((carbFraction, carbIndex) => {
          const carbG = Number(rawCarbs.min) + (Number(rawCarbs.max) - Number(rawCarbs.min)) * carbFraction;
          fractions.forEach((fatFraction, fatIndex) => {
            const fatG = Number(rawFat.min) + (Number(rawFat.max) - Number(rawFat.min)) * fatFraction;
            addPoint(`raw_${carbIndex}_${fatIndex}`, carbG, fatG, "raw_rectangle_grid");
          });
          neutralZoneScales.forEach((scale, scaleIndex) => {
            const fatG = (availableKcal * scale - carbG * 4) / 9;
            if (fatG >= Number(rawFat.min) - 1e-9 && fatG <= Number(rawFat.max) + 1e-9) {
              addPoint(`neutral_c_${carbIndex}_${scaleIndex}`, carbG, fatG, "target_energy_neutral_zone");
            }
          });
        });
        fractions.forEach((fatFraction, fatIndex) => {
          const fatG = Number(rawFat.min) + (Number(rawFat.max) - Number(rawFat.min)) * fatFraction;
          neutralZoneScales.forEach((scale, scaleIndex) => {
            const carbG = (availableKcal * scale - fatG * 9) / 4;
            if (carbG >= Number(rawCarbs.min) - 1e-9 && carbG <= Number(rawCarbs.max) + 1e-9) {
              addPoint(`neutral_f_${fatIndex}_${scaleIndex}`, carbG, fatG, "target_energy_neutral_zone");
            }
          });
        });

        return [...points.values()].map(point => {
          const scoringKcal = proteinReservedG * 4 + point.carbG * 4 + point.fatG * 9;
          const balance = {
            target: {
              kcal: target.targetCal,
              protein: target.protein,
              carbs: target.carbs,
              fat: target.fat
            },
            consumed: {
              scoringKcal,
              totalKcal: scoringKcal,
              kcal: scoringKcal,
              protein: proteinReservedG,
              carbs: point.carbG,
              fat: point.fatG,
              alcoholKcal: 0,
              otherKcal: 0
            }
          };
          const productionSummary = getMacroRangeProductionScoreSummary(balance, target, {});
          const breakdown = productionSummary?.penaltyBreakdown;
          const actualPenaltyAxes = breakdown && typeof breakdown === "object"
            ? Object.keys(breakdown).sort()
            : [];
          const expectedPenaltyAxes = [...penaltyKeys].sort();
          const scoringContext = productionSummary?.scoringContext;
          const targetAuthority = scoringContext?.targetAuthority;
          const missingPenaltyAxes = penaltyKeys.filter(key => (
            !Object.prototype.hasOwnProperty.call(breakdown || {}, key)
            || !Number.isFinite(breakdown?.[key])
            || breakdown[key] < 0
          ));
          const missingNonJointPenaltyAxes = nonJointPenaltyKeys.filter(key => missingPenaltyAxes.includes(key));
          const unexpectedPenaltyAxes = actualPenaltyAxes.filter(key => !penaltyKeys.includes(key));
          const penaltyAxisKeySetExact = actualPenaltyAxes.length === expectedPenaltyAxes.length
            && actualPenaltyAxes.every((key, index) => key === expectedPenaltyAxes[index]);
          const authorityChecks = targetAuthority?.checks && typeof targetAuthority.checks === "object"
            ? Object.values(targetAuthority.checks)
            : [];
          const targetAuthorityComplete = targetAuthority?.valid === true
            && typeof targetAuthority.source === "string"
            && targetAuthority.source.length > 0
            && typeof targetAuthority.correctionVersion === "string"
            && targetAuthority.correctionVersion.length > 0
            && authorityChecks.length > 0
            && authorityChecks.every(value => value === true)
            && Array.isArray(targetAuthority.failedChecks)
            && targetAuthority.failedChecks.length === 0;
          const scoreSourceComplete = Number.isFinite(productionSummary?.percent)
            && Number.isFinite(productionSummary?.rawScore)
            && productionSummary?.blockedReason === null
            && !!scoringContext
            && typeof scoringContext.totalBurnSource === "string"
            && scoringContext.totalBurnSource.length > 0
            && typeof scoringContext.weightSource === "string"
            && scoringContext.weightSource.length > 0
            && missingPenaltyAxes.length === 0
            && unexpectedPenaltyAxes.length === 0
            && penaltyAxisKeySetExact;
          return {
            sampleId: `${caseId}::${point.pointId}`,
            caseId,
            pointId: point.pointId,
            matrixKind,
            source: point.source,
            coordinate: { carbG: roundNine(point.carbG), fatG: roundNine(point.fatG) },
            productionSource: "getMacroRangeProductionScoreSummary",
            penaltyBreakdown: breakdown
              ? Object.fromEntries(penaltyKeys.map(key => [key, breakdown[key]]))
              : null,
            sourceAuthority: {
              scoreSourceComplete,
              penaltyBreakdownComplete: missingPenaltyAxes.length === 0,
              nonJointPenaltyBreakdownComplete: missingNonJointPenaltyAxes.length === 0,
              penaltyAxisKeySetExact,
              missingPenaltyAxes,
              missingNonJointPenaltyAxes,
              unexpectedPenaltyAxes,
              totalBurnSource: scoringContext?.totalBurnSource || null,
              weightSource: scoringContext?.weightSource || null,
              targetAuthorityComplete,
              targetAuthorityValid: targetAuthority?.valid === true,
              targetAuthoritySource: targetAuthority?.source || null,
              targetAuthorityCorrectionVersion: targetAuthority?.correctionVersion || null,
              targetAuthorityFailedChecks: Array.isArray(targetAuthority?.failedChecks) ? targetAuthority.failedChecks : null
            }
          };
        });
      }

      function buildProductionRow({ id, goal, contextName, proteinLevel, profile = {}, matrixKind }){
        applyContext(contextName, profile);
        state.goal = goal;
        state.proteinTargetLevel = proteinLevel;
        if (ids.proteinTargetLevel) ids.proteinTargetLevel.value = proteinLevel;
        const target = calculate();
        const targetMacroKcal = Number(target.protein) * 4 + Number(target.carbs) * 4 + Number(target.fat) * 9;
        const balance = {
          target: { kcal: target.targetCal, protein: target.protein, carbs: target.carbs, fat: target.fat },
          consumed: {
            scoringKcal: targetMacroKcal,
            totalKcal: targetMacroKcal,
            kcal: targetMacroKcal,
            protein: target.protein,
            carbs: target.carbs,
            fat: target.fat,
            alcoholKcal: 0,
            otherKcal: 0
          }
        };
        const summary = getMacroRangeProductionScoreSummary(balance, target, {});
        const validity = targetValidity(target);
        const joint = summary.scoringContext?.jointAllocationModel || null;
        productionOwnershipRows.push(...buildProductionOwnershipRows({ caseId: id, matrixKind, target, summary }));
        return {
          id,
          matrixKind,
          profileId: profile.id || "baseline",
          goal,
          context: contextName,
          effectiveTrainingContext: summary.scoringContext?.trainingContext || null,
          proteinLevel,
          target: {
            kcal: target.targetCal,
            totalBurn: target.totalBurn,
            protein: target.protein,
            carbs: target.carbs,
            fat: target.fat,
            proteinGkg: target.protein / target.s.weight
          },
          validity,
          current: {
            percent: summary.percent,
            rawScore: summary.rawScore,
            penalties: summary.penaltyBreakdown,
            ninePenaltyAxesZero: penaltyKeys.every(key => summary.penaltyBreakdown?.[key] === 0),
            targetAuthority: summary.scoringContext?.targetAuthority || null
          },
          jointGeometry: joint ? {
            proteinReservedG: joint.proteinReservedG,
            availableCarbFatKcal: joint.availableCarbFatKcal,
            rawRanges: joint.rawRanges,
            jointRanges: joint.jointRanges,
            baseTargetPair: joint.baseTargetPair,
            macroKcalGap: joint.macroKcalGap,
            collapsed: joint.collapsed === true
          } : null
        };
      }

      for (const contextName of contexts) {
        for (const goal of goals) {
          for (const proteinLevel of proteinLevels) {
            rows.push(buildProductionRow({
              id: `${goal}_${contextName}_${proteinLevel}`,
              goal,
              contextName,
              proteinLevel,
              matrixKind: "authoritative_54"
            }));
          }
        }
      }

      const crossProfiles = [
        { id: "baseline_male", weight: 75, height: 175, age: 32, gender: "male", activityLevel: "sedentary", workType: "office" },
        { id: "small_female", weight: 55, height: 160, age: 28, gender: "female", activityLevel: "moderate", workType: "office" },
        { id: "large_older_male", weight: 90, height: 185, age: 45, gender: "male", activityLevel: "moderate", workType: "mixed" }
      ];
      crossProfiles.forEach(profile => {
        ["diet", "bulk"].forEach(goal => {
          ["rest", "normal"].forEach(contextName => {
            crossProfileRows.push(buildProductionRow({
              id: `${profile.id}_${goal}_${contextName}`,
              goal,
              contextName,
              proteinLevel: "medium",
              profile,
              matrixKind: "cross_profile_smoke"
            }));
          });
        });
      });
      const actualAuditRoutineVocabulary = {
        simple: getGeneralRoutineItems().map(item => item.value).sort(),
        advancedByProfile: {
          bodybuilding: [...new Set(Object.values(ROUTINE_SCHEMES).flatMap(scheme => scheme.items.map(item => item.value)))].sort()
        }
      };
      Object.entries(PROFILE_ROUTINE_PLANS).forEach(([profile, config]) => {
        actualAuditRoutineVocabulary.advancedByProfile[profile] = [...new Set(
          Object.values(config.plans || {}).flatMap(plan => plan.items.map(item => item.value))
        )].sort();
      });
      return { targetCases: rows, crossProfileCases: crossProfileRows, productionOwnershipRows, actualAuditRoutineVocabulary };
    });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

const ACTUAL_AUDIT_GOALS = new Set(["diet", "cut", "recomp", "maintain", "lean_bulk", "bulk"]);
const ACTUAL_AUDIT_EXERCISE_MODES = new Set(["general", "exercise"]);
const ACTUAL_AUDIT_EXERCISE_PROFILES = new Set(["bodybuilding", "powerbuilding", "strength", "running", "mixed"]);
const ACTUAL_AUDIT_CARDIO_TYPES = new Set(["treadmill_walk", "treadmill_run", "outdoor_run"]);
const ACTUAL_AUDIT_SNAPSHOT_SOURCES = new Set([
  "saved_at_entry",
  "generated_on_late_meal_add",
  "legacy_import",
  "today_auto_sync",
  "today_manual_confirm",
  "record_detail_edit"
]);
const ACTUAL_AUDIT_SIMPLE_ROUTINES = new Set(["REST", "PUSH"]);
const ACTUAL_AUDIT_ADVANCED_ROUTINES_BY_PROFILE = new Map([
  ["bodybuilding", new Set(["REST", "PUSH", "PULL", "LEGS", "UPPER", "LOWER", "CHEST", "BACK", "SHOULDER", "ARM", "ARMS"])],
  ["powerbuilding", new Set(["REST", "powerbuilding_upper", "powerbuilding_lower", "powerbuilding_accessory", "powerbuilding_push", "powerbuilding_pull"])],
  ["strength", new Set(["REST", "strength_heavy_upper", "strength_heavy_lower", "strength_volume", "strength_technique", "strength_deload"])],
  ["running", new Set(["REST", "running_easy", "running_tempo", "running_interval", "running_long", "running_recovery"])],
  ["mixed", new Set(["REST", "mixed_strength_cardio", "mixed_strength_focus", "mixed_cardio_focus", "mixed_circuit", "mixed_recovery"])]
]);
const ACTUAL_AUDIT_LEGACY_BODYBUILDING_ROUTINES = new Set([
  "PUSH", "PULL", "LEGS", "UPPER", "LOWER", "CHEST", "BACK", "SHOULDER", "ARM", "ARMS"
]);
const ACTUAL_BLIND_SHUFFLE_SEED_VERSION = "v8.4_joint_actual_day_hypothesis_blind_v2_balanced_disjoint";
const ACTUAL_COUNTERFACTUAL_SEED_VERSION = "v8.4_actual_context_counterfactual_v2_balanced_sides";
const ACTUAL_COUNTERFACTUAL_EXCHANGE_STEPS = Object.freeze([
  -8, -7, -6, -5, -4, -3, -2, -1,
  1, 2, 3, 4, 5, 6, 7, 8
]);
const ACTUAL_COUNTERFACTUAL_NORMALIZED_GRID_FRACTIONS = Object.freeze([
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9
]);
const ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS = 6;
const ACTUAL_MATCH_TOLERANCES = Object.freeze([
  Object.freeze({ id: "exact", maxAxisDelta: 0 }),
  Object.freeze({ id: "tolerance_0_25", maxAxisDelta: 0.25 }),
  Object.freeze({ id: "tolerance_1_00", maxAxisDelta: 1 })
]);

function validateRawActualBackupEnvelope(payload){
  if (!payload || payload.app !== "macro-engine" || payload.kind !== "full-backup" || payload.backupVersion !== 1 || !payload.data) {
    throw new Error("actual_backup_requires_supported_full_backup_envelope");
  }
  if (!payload.data.settings || typeof payload.data.settings !== "object" || Array.isArray(payload.data.settings) || Object.keys(payload.data.settings).length === 0) {
    throw new Error("actual_backup_requires_explicit_settings");
  }
  if (!Array.isArray(payload.data.records)) throw new Error("actual_backup_requires_records_array");
  return payload;
}

function isExplicitRawFiniteNumber(value){
  return typeof value === "number" && Number.isFinite(value);
}

function isSemanticallyValidActualRecordDate(value){
  const raw = typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

function isValidOptionalRawNonMacroKcal(meal, key){
  if (!meal || typeof meal !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(meal, key)) return true;
  return isExplicitRawFiniteNumber(meal[key]) && Number(meal[key]) >= 0;
}

function getStableActualSampleId(record){
  const rawDate = typeof record?.date === "string" ? record.date : "";
  const identity = isSemanticallyValidActualRecordDate(rawDate)
    ? `valid_date|${rawDate}`
    : `invalid_record|${JSON.stringify(record)}`;
  return `actual_day_${crypto.createHash("sha256")
    .update(`${ACTUAL_BLIND_SHUFFLE_SEED_VERSION}|identity|${identity}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function getActualSnapshotMarkerStatus(record){
  const raw = typeof record?.snapshotSource === "string" ? record.snapshotSource.trim() : "";
  if (!raw) return "markerless_snapshot_source";
  return ACTUAL_AUDIT_SNAPSHOT_SOURCES.has(raw)
    ? "recognized_snapshot_source"
    : "unrecognized_snapshot_source";
}

function resolveActualTrainingProfileProvenance(record){
  const snapshot = record?.goalSnapshot;
  const snapshotMarkerStatus = getActualSnapshotMarkerStatus(record);
  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, exclusionReason: "snapshotless", snapshotMarkerStatus };
  }
  if (snapshotMarkerStatus === "unrecognized_snapshot_source") {
    return { valid: false, exclusionReason: "invalid_snapshot_source_marker", snapshotMarkerStatus };
  }
  const exerciseMode = String(snapshot.exerciseManagementMode || "");
  if (!ACTUAL_AUDIT_EXERCISE_MODES.has(exerciseMode)) {
    return { valid: false, exclusionReason: "incomplete_snapshot_training_provenance", snapshotMarkerStatus };
  }
  const rawProfile = typeof snapshot.exerciseProfile === "string" ? snapshot.exerciseProfile.trim() : "";
  const routine = typeof snapshot.routine === "string" ? snapshot.routine.trim() : "";
  if (!routine) {
    return { valid: false, exclusionReason: "incomplete_snapshot_training_provenance", snapshotMarkerStatus };
  }
  if (ACTUAL_AUDIT_EXERCISE_PROFILES.has(rawProfile)) {
    const routineAllowed = snapshot.generalAdvancedSettings === true
      ? ACTUAL_AUDIT_ADVANCED_ROUTINES_BY_PROFILE.get(rawProfile)?.has(routine) === true
      : ACTUAL_AUDIT_SIMPLE_ROUTINES.has(routine);
    return routineAllowed
      ? {
          valid: true,
          effectiveExerciseProfile: rawProfile,
          effectiveAdvanced: snapshot.generalAdvancedSettings === true,
          trainingProfileSource: "snapshot_profile_explicit_current_schema",
          snapshotMarkerStatus
        }
      : { valid: false, exclusionReason: "incomplete_snapshot_training_provenance", snapshotMarkerStatus };
  }
  if (rawProfile) {
    return { valid: false, exclusionReason: "incomplete_snapshot_training_provenance", snapshotMarkerStatus };
  }
  if (exerciseMode === "exercise" && (routine === "REST" || ACTUAL_AUDIT_LEGACY_BODYBUILDING_ROUTINES.has(routine))) {
    return {
      valid: true,
      effectiveExerciseProfile: "bodybuilding",
      effectiveAdvanced: true,
      trainingProfileSource: routine === "REST"
        ? "legacy_profileless_rest_profile_irrelevant"
        : "legacy_profile_absent_expert_bodybuilding",
      snapshotMarkerStatus
    };
  }
  return {
    valid: false,
    exclusionReason: exerciseMode === "exercise" && routine.includes("+")
      ? "ambiguous_legacy_compound_routine"
      : "incomplete_snapshot_profile_provenance",
    snapshotMarkerStatus
  };
}

function getRawActualRecordExclusionReason(record, trainingProfileProvenance = resolveActualTrainingProfileProvenance(record)){
  if (!record || typeof record !== "object") return "invalid_record";
  if (!isSemanticallyValidActualRecordDate(record.date)) return "invalid_record_date";
  const meals = Array.isArray(record.meals) ? record.meals : [];
  if (meals.length < 2) return "insufficient_full_day";
  const snapshot = record.goalSnapshot;
  if (!snapshot || typeof snapshot !== "object") return "snapshotless";
  const rawTargetValues = [snapshot.targetCal, snapshot.protein, snapshot.carbs, snapshot.fat];
  if (!rawTargetValues.every(isExplicitRawFiniteNumber)) return "invalid_snapshot_target";
  const targetValues = rawTargetValues.map(Number);
  if (!targetValues.every(Number.isFinite)
      || targetValues[0] <= 0
      || targetValues[1] <= 0
      || targetValues[2] < 0
      || targetValues[3] < 0) return "invalid_snapshot_target";
  const macroKcal = targetValues[1] * 4 + targetValues[2] * 4 + targetValues[3] * 9;
  if (Math.abs(macroKcal - targetValues[0]) > 8) return "invalid_snapshot_target_authority";
  if (!ACTUAL_AUDIT_GOALS.has(String(snapshot.goal || ""))) return "incomplete_snapshot_goal_provenance";
  if (!isExplicitRawFiniteNumber(snapshot.weight) || !(Number(snapshot.weight) > 0)) return "incomplete_snapshot_weight_provenance";
  const trainingNumbers = [snapshot.weeklyTrainingDays, snapshot.weightDuration, snapshot.cardioDuration];
  if (trainingProfileProvenance?.valid !== true) {
    return trainingProfileProvenance?.exclusionReason || "incomplete_snapshot_training_provenance";
  }
  if (!ACTUAL_AUDIT_EXERCISE_MODES.has(String(snapshot.exerciseManagementMode || ""))
      || !trainingNumbers.every(isExplicitRawFiniteNumber)
      || !Number.isInteger(Number(snapshot.weeklyTrainingDays))
      || Number(snapshot.weeklyTrainingDays) < 0
      || Number(snapshot.weeklyTrainingDays) > 14
      || Number(snapshot.weightDuration) < 0
      || Number(snapshot.cardioDuration) < 0) {
    return "incomplete_snapshot_training_provenance";
  }
  if (snapshot.exerciseManagementMode === "exercise") {
    if (typeof snapshot.generalAdvancedSettings !== "boolean"
        || typeof snapshot.generalLowDigestCarbs !== "boolean"
        || !isExplicitRawFiniteNumber(snapshot.expertLbmAlpha)
        || Number(snapshot.expertLbmAlpha) < 0.50
        || Number(snapshot.expertLbmAlpha) > 0.90
        || !isExplicitRawFiniteNumber(snapshot.intensityOverride)
        || Number(snapshot.intensityOverride) < 0
        || Number(snapshot.intensityOverride) > 1) {
      return "incomplete_snapshot_training_provenance";
    }
    if (Number(snapshot.cardioDuration) > 0
        && (!ACTUAL_AUDIT_CARDIO_TYPES.has(String(snapshot.cardioType || ""))
          || !isExplicitRawFiniteNumber(snapshot.cardioSpeed)
          || Number(snapshot.cardioSpeed) <= 0
          || !isExplicitRawFiniteNumber(snapshot.cardioIncline)
          || Number(snapshot.cardioIncline) < 0)) {
      return "incomplete_snapshot_cardio_provenance";
    }
  }
  const rawMacrosValid = meals.every(meal => [meal?.carbs, meal?.protein, meal?.fat].every(value => (
    isExplicitRawFiniteNumber(value) && Number(value) >= 0
  )));
  if (!rawMacrosValid) return "invalid_meal_macros";
  const rawNonMacroKcalValid = meals.every(meal => (
    isValidOptionalRawNonMacroKcal(meal, "alcoholKcal")
    && isValidOptionalRawNonMacroKcal(meal, "otherKcal")
  ));
  if (!rawNonMacroKcalValid) return "invalid_meal_non_macro_kcal";
  const mealEnergyTotals = meals.map(meal => (
    meal.carbs * 4
      + meal.protein * 4
      + meal.fat * 9
      + (Object.prototype.hasOwnProperty.call(meal, "alcoholKcal") ? meal.alcoholKcal : 0)
      + (Object.prototype.hasOwnProperty.call(meal, "otherKcal") ? meal.otherKcal : 0)
  ));
  if (!mealEnergyTotals.every(Number.isFinite)) return "non_finite_meal_energy_total";
  const consumedScoringKcal = mealEnergyTotals.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(consumedScoringKcal)) return "non_finite_meal_energy_total";
  if (!(consumedScoringKcal / targetValues[0] >= 0.30)) return "insufficient_full_day";
  return null;
}

function countBy(items, selector){
  return items.reduce((counts, item) => {
    const key = String(selector(item) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function extractAnonymizedActualDaysFromPayload(rawPayload, options = {}){
  const payload = validateRawActualBackupEnvelope(rawPayload);
  const counterfactualRequested = options.counterfactualRequested === true;
  const rawRecords = payload.data.records;
  const recordDateCounts = rawRecords.reduce((counts, record) => {
    const date = isSemanticallyValidActualRecordDate(record?.date) ? record.date : null;
    if (date) counts.set(date, (counts.get(date) || 0) + 1);
    return counts;
  }, new Map());
  const rawEligibility = rawRecords.map((record, index) => {
    const trainingProfileProvenance = resolveActualTrainingProfileProvenance(record);
    return {
      index,
      sampleId: getStableActualSampleId(record),
      trainingProfileProvenance,
      exclusionReason: isSemanticallyValidActualRecordDate(record?.date) && recordDateCounts.get(record.date) > 1
        ? "duplicate_record_date"
        : getRawActualRecordExclusionReason(record, trainingProfileProvenance)
    };
  });
  const eligibleRecords = rawEligibility
    .filter(item => !item.exclusionReason)
    .map(item => ({
      index: item.index,
      sampleId: item.sampleId,
      trainingProfileProvenance: item.trainingProfileProvenance
    }));
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const profileDir = fs.mkdtempSync(path.join(debugDir, "component_score_actual_audit_"));
  let context;
  try {
    context = await launchBrowserContext(profileDir);
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html?codexInternalTests=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof calculate === "function" && typeof getDailyAdherenceScore === "function", null, { timeout: 90000 });
    const evaluated = await page.evaluate(({
      payload: data,
      eligibleRecords: eligible,
      counterfactualRequested: buildCounterfactuals,
      counterfactualExchangeSteps,
      counterfactualNormalizedGridFractions
    }) => {
      const normalizedBackup = normalizeFullBackupPayload(data);
      const rawRecords = data.data.records;
      recordsState.items = eligible.map(item => normalizeRecord(rawRecords[item.index])).filter(record => record?.date);
      return eligible.map(({ index, sampleId, trainingProfileProvenance }) => {
        const rawRecord = rawRecords[index];
        const rawSnapshot = rawRecord.goalSnapshot;
        const record = normalizeRecord(rawRecord);
        const snapshot = normalizeGoalSnapshot(rawSnapshot);
        const snapshotTarget = getGoalSnapshotTarget(snapshot);
        const exerciseEnabled = isExerciseManagementEnabled(rawSnapshot.exerciseManagementMode);
        const trainingState = {
          weight: Number(rawSnapshot.weight),
          exerciseManagementMode: rawSnapshot.exerciseManagementMode,
          exerciseProfile: trainingProfileProvenance.effectiveExerciseProfile,
          routine: rawSnapshot.routine,
          weeklyTrainingDays: Number(rawSnapshot.weeklyTrainingDays),
          weightDuration: Number(rawSnapshot.weightDuration),
          intensityOverride: Number(rawSnapshot.intensityOverride) || 0,
          cardioType: rawSnapshot.cardioType || "treadmill_walk",
          cardioDuration: Number(rawSnapshot.cardioDuration),
          cardioSpeed: Number(rawSnapshot.cardioSpeed) || 0,
          cardioIncline: Number(rawSnapshot.cardioIncline) || 0,
          generalAdvancedSettings: trainingProfileProvenance.effectiveAdvanced === true,
          generalLowDigestCarbs: rawSnapshot.generalLowDigestCarbs === true,
          expertLbmAlpha: Number(rawSnapshot.expertLbmAlpha),
          bodyFat: null,
          skeletal: null,
          bodyCompositionConfirmed: false,
          homeInbody: false
        };
        let cardioKcal = 0;
        let weightKcal = 0;
        if (exerciseEnabled) {
          const cardio = calcCardio(trainingState);
          cardioKcal = Number(cardio.kcal) || 0;
          const isRestDay = trainingState.routine === "REST";
          const usesDetailedRoutineIntensity = shouldUseDetailedRoutineControls(
            trainingState.exerciseProfile,
            trainingState.generalAdvancedSettings
          );
          const usesSimpleProfileDefaultIntensity = !usesDetailedRoutineIntensity
            && trainingState.exerciseProfile !== "bodybuilding"
            && hasProfileRoutineScheme(trainingState.exerciseProfile)
            && !isRestDay;
          const usesSessionIntensity = usesDetailedRoutineIntensity || usesSimpleProfileDefaultIntensity;
          const modeCfg = resolveModeFreeRuntimeConfig(trainingState);
          let xw = 0;
          if (!isRestDay) {
            if (!usesSessionIntensity && modeCfg.inputDepth === "basic" && !modeCfg.advancedTuning) {
              xw = clamp(0.70 + getGeneralWeeklyTrainingAdj(trainingState.weeklyTrainingDays), 0, 1);
            } else {
              const baseXw = Number(trainingState.intensityOverride);
              xw = baseXw <= 0 ? 0 : clamp(baseXw + getAthleteWeeklyTrainingAdj(trainingState.weeklyTrainingDays), 0, 1);
            }
          }
          weightKcal = calcWeightTrainingKcal(trainingState, xw);
        }
        const snapshotOwnedResult = {
          isCalculable: false,
          targetCal: snapshotTarget?.kcal,
          protein: snapshotTarget?.protein,
          carbs: snapshotTarget?.carbs,
          fat: snapshotTarget?.fat,
          s: {
            goal: rawSnapshot.goal,
            weight: Number(rawSnapshot.weight),
            exerciseManagementMode: rawSnapshot.exerciseManagementMode,
            exerciseProfile: trainingProfileProvenance.effectiveExerciseProfile,
            routine: rawSnapshot.routine,
            weeklyTrainingDays: Number(rawSnapshot.weeklyTrainingDays),
            weightDuration: Number(rawSnapshot.weightDuration)
          },
          cardio: { kcal: cardioKcal },
          weightKcal
        };
        const scoreOptions = {
          goalSnapshot: snapshot,
          useStoredAdherence: false,
          exerciseManagementMode: rawSnapshot.exerciseManagementMode,
          routine: rawSnapshot.routine,
          weeklyTrainingDays: Number(rawSnapshot.weeklyTrainingDays),
          weightDuration: Number(rawSnapshot.weightDuration),
          cardioKcal,
          weightKcal
        };
        const score = getDailyAdherenceScore(record.date, snapshotOwnedResult, scoreOptions);
        const target = score.detail?.target || {};
        const consumed = score.detail?.consumed || {};
        const penalties = score.detail?.penaltyBreakdown || null;
        const scoringContext = score.detail?.scoringContext || {};
        const joint = scoringContext.jointAllocationModel || null;
        const ratio = (actual, expected) => Number.isFinite(Number(actual)) && Number(expected) > 0
          ? Number(actual) / Number(expected)
          : null;
        const counterfactualFamily = buildCounterfactuals ? (() => {
          const originalCarbs = Number(consumed.carbs);
          const originalFat = Number(consumed.fat);
          const originalProtein = Number(consumed.protein);
          const originalScoringKcal = Number(consumed.scoringKcal);
          const originalAlcoholKcal = Math.max(0, Number(consumed.alcoholKcal) || 0);
          const originalOtherKcal = Math.max(0, Number(consumed.otherKcal) || 0);
          if (![originalCarbs, originalFat, originalProtein, originalScoringKcal].every(Number.isFinite)
              || originalCarbs < 0
              || originalFat < 0
              || originalProtein < 0
              || !(originalScoringKcal > 0)) {
            return { valid: false, exclusionReason: "invalid_redacted_anchor", variants: [] };
          }
          const originalMacroEnergy = originalProtein * 4 + originalCarbs * 4 + originalFat * 9;
          const originalDerivedScoringKcal = originalMacroEnergy + originalAlcoholKcal + originalOtherKcal;
          const buildVariant = ({ variantKey, gridKind, exchangeStep = null, normalizedFraction = null, exchangeKcal }) => {
            const carbs = originalCarbs + exchangeKcal / 4;
            const fat = originalFat - exchangeKcal / 9;
            if (![carbs, fat].every(Number.isFinite) || carbs < 0 || fat < 0) {
              return {
                variantKey,
                gridKind,
                exchangeStep,
                exchangeKcal,
                normalizedFraction,
                valid: false,
                exclusionReason: "negative_counterfactual_macro"
              };
            }
            const exchangeEnergyGap = (carbs - originalCarbs) * 4 + (fat - originalFat) * 9;
            const derivedScoringKcal = originalProtein * 4 + carbs * 4 + fat * 9 + originalAlcoholKcal + originalOtherKcal;
            const syntheticMeals = [0.5, 0.5].map((share, syntheticIndex) => ({
              syntheticIndex,
              carbs: carbs * share,
              protein: originalProtein * share,
              fat: fat * share,
              alcoholKcal: originalAlcoholKcal * share,
              otherKcal: originalOtherKcal * share
            }));
            const syntheticTotals = syntheticMeals.reduce((totals, meal) => ({
              carbs: totals.carbs + meal.carbs,
              protein: totals.protein + meal.protein,
              fat: totals.fat + meal.fat,
              alcoholKcal: totals.alcoholKcal + meal.alcoholKcal,
              otherKcal: totals.otherKcal + meal.otherKcal
            }), { carbs: 0, protein: 0, fat: 0, alcoholKcal: 0, otherKcal: 0 });
            const candidateConsumed = {
              ...consumed,
              carbs,
              protein: originalProtein,
              fat,
              scoringKcal: originalScoringKcal,
              totalKcal: originalScoringKcal,
              alcoholKcal: originalAlcoholKcal,
              otherKcal: originalOtherKcal
            };
            const candidateBalance = {
              target: { ...target },
              baseTarget: { ...target },
              goalSnapshot: snapshot,
              consumed: candidateConsumed
            };
            const candidateSummary = getMacroRangeProductionScoreSummary(candidateBalance, snapshotOwnedResult, scoreOptions);
            const candidatePenalties = candidateSummary?.penaltyBreakdown || null;
            const candidateContext = candidateSummary?.scoringContext || {};
            const candidateJoint = candidateContext.jointAllocationModel || null;
            const missingPenaltyAxes = [
              "targetEnergyDeviationPenalty",
              "tdeeOverloadPenalty",
              "proteinShortagePenalty",
              "proteinExcessEfficiencyPenalty",
              "fatRangePenalty",
              "carbExerciseContextPenalty",
              "carbFatExchangeFailurePenalty",
              "alcoholPhysiologyPenalty",
              "dataOutlierPenalty"
            ].filter(key => !Number.isFinite(Number(candidatePenalties?.[key])) || Number(candidatePenalties[key]) < 0);
            const valid = candidateSummary?.blockedReason === null
              && candidateContext.targetAuthority?.valid === true
              && candidateContext.targetAuthority?.source === "frozen_goal_snapshot"
              && candidateContext.weightSource === scoringContext.weightSource
              && candidateContext.totalBurnSource === scoringContext.totalBurnSource
              && candidateContext.trainingContext === scoringContext.trainingContext
              && missingPenaltyAxes.length === 0
              && !!candidateJoint
              && Math.abs(exchangeEnergyGap) <= 1e-9
              && Math.abs(derivedScoringKcal - originalDerivedScoringKcal) <= 1e-9
              && Math.abs(syntheticTotals.carbs - carbs) <= 1e-9
              && Math.abs(syntheticTotals.protein - originalProtein) <= 1e-9
              && Math.abs(syntheticTotals.fat - fat) <= 1e-9
              && Math.abs(syntheticTotals.alcoholKcal - originalAlcoholKcal) <= 1e-9
              && Math.abs(syntheticTotals.otherKcal - originalOtherKcal) <= 1e-9;
            return {
              variantKey,
              gridKind,
              exchangeStep,
              exchangeKcal,
              normalizedFraction,
              valid,
              exclusionReason: valid ? null : "counterfactual_production_invariant_failed",
              ratios: {
                energy: ratio(originalScoringKcal, target.kcal),
                protein: ratio(originalProtein, target.protein),
                carb: ratio(carbs, target.carbs),
                fat: ratio(fat, target.fat)
              },
              penalties: candidatePenalties,
              invariants: {
                exchangeEnergyGap,
                derivedScoringKcalGap: derivedScoringKcal - originalDerivedScoringKcal,
                proteinGap: syntheticTotals.protein - originalProtein,
                targetAuthorityValid: candidateContext.targetAuthority?.valid === true,
                targetAuthoritySource: candidateContext.targetAuthority?.source || null,
                weightSource: candidateContext.weightSource || null,
                totalBurnSource: candidateContext.totalBurnSource || null,
                trainingContext: candidateContext.trainingContext || null,
                policyEnvelopeValid: carbs >= 0
                  && fat >= 0
                  && carbs <= (originalCarbs * 4 + originalFat * 9) / 4 + 1e-9
                  && fat <= (originalCarbs * 4 + originalFat * 9) / 9 + 1e-9,
                syntheticMealClosureValid: Math.abs(syntheticTotals.carbs - carbs) <= 1e-9
                  && Math.abs(syntheticTotals.protein - originalProtein) <= 1e-9
                  && Math.abs(syntheticTotals.fat - fat) <= 1e-9
                  && Math.abs(syntheticTotals.alcoholKcal - originalAlcoholKcal) <= 1e-9
                  && Math.abs(syntheticTotals.otherKcal - originalOtherKcal) <= 1e-9
              },
              optionCInput: candidateJoint ? {
                targetKcal: candidateJoint.baseTargetPair?.kcal ?? target.kcal,
                targetProteinG: candidateJoint.proteinReservedG,
                proteinReservedG: candidateJoint.proteinReservedG,
                availableCarbFatKcal: candidateJoint.availableCarbFatKcal,
                carbMinG: candidateJoint.jointRanges?.carbs?.min,
                carbMaxG: candidateJoint.jointRanges?.carbs?.max,
                fatMinG: candidateJoint.jointRanges?.fat?.min,
                fatMaxG: candidateJoint.jointRanges?.fat?.max,
                rawCarbMinG: candidateJoint.rawRanges?.carbs?.min,
                rawCarbMaxG: candidateJoint.rawRanges?.carbs?.max,
                rawFatMinG: candidateJoint.rawRanges?.fat?.min,
                rawFatMaxG: candidateJoint.rawRanges?.fat?.max,
                collapsed: candidateJoint.collapsed === true,
                carbG: carbs,
                fatG: fat,
                totalKcal: originalScoringKcal
              } : null
            };
          };
          const variants = counterfactualExchangeSteps.map(exchangeStep => buildVariant({
            variantKey: `exchange_${exchangeStep < 0 ? "minus" : "plus"}_${Math.abs(exchangeStep)}`,
            gridKind: "fixed_36kcal",
            exchangeStep,
            exchangeKcal: 36 * exchangeStep
          }));
          const normalizedVariants = [
            ...counterfactualNormalizedGridFractions.map(fraction => buildVariant({
              variantKey: `normalized_carb_${String(Math.round(fraction * 100)).padStart(2, "0")}`,
              gridKind: "normalized_feasible_span",
              normalizedFraction: fraction,
              exchangeKcal: originalFat * 9 * fraction
            })),
            ...counterfactualNormalizedGridFractions.map(fraction => buildVariant({
              variantKey: `normalized_fat_${String(Math.round(fraction * 100)).padStart(2, "0")}`,
              gridKind: "normalized_feasible_span",
              normalizedFraction: -fraction,
              exchangeKcal: -originalCarbs * 4 * fraction
            }))
          ];
          return {
            valid: [...variants, ...normalizedVariants].some(variant => variant.valid),
            exclusionReason: [...variants, ...normalizedVariants].some(variant => variant.valid)
              ? null
              : "no_valid_counterfactual_variants",
            generatorContract: "fixed_36kcal_carb_fat_exchange_grid_without_residual_input",
            normalizedGeneratorContract: "predeclared_decile_grid_over_each_anchor_nonnegative_iso_calorie_exchange_span",
            normalizedGridFractions: [...counterfactualNormalizedGridFractions],
            variants,
            normalizedVariants
          };
        })() : null;
        return {
          sampleId,
          scoreEvaluationAttempted: true,
          mealCount: Array.isArray(record.meals) ? record.meals.length : 0,
          goal: rawSnapshot.goal,
          routine: rawSnapshot.routine,
          exerciseManagementMode: rawSnapshot.exerciseManagementMode,
          trainingContext: scoringContext.trainingContext || null,
          available: score.isAvailable === true,
          status: score.status,
          sourceValidity: {
            targetAuthorityValid: scoringContext.targetAuthority?.valid === true,
            targetAuthoritySource: scoringContext.targetAuthority?.source || null,
            weightSource: scoringContext.weightSource || null,
            totalBurnSource: scoringContext.totalBurnSource || null,
            snapshotGoalOwned: snapshotOwnedResult.s.goal === rawSnapshot.goal,
            trainingEnergySource: "raw_goal_snapshot_production_helpers",
            trainingProfileSource: trainingProfileProvenance.trainingProfileSource,
            snapshotMarkerStatus: trainingProfileProvenance.snapshotMarkerStatus,
            currentResultFallbackUsed: String(scoringContext.weightSource || "").startsWith("currentResult")
              || String(scoringContext.totalBurnSource || "").startsWith("currentResult")
          },
          ratios: {
            energy: ratio(consumed.scoringKcal, target.kcal),
            protein: ratio(consumed.protein, target.protein),
            carb: ratio(consumed.carbs, target.carbs),
            fat: ratio(consumed.fat, target.fat)
          },
          standardDrinks: Number.isFinite(scoringContext.standardDrinks) ? scoringContext.standardDrinks : 0,
          penalties,
          optionCInput: joint ? {
            targetKcal: joint.baseTargetPair?.kcal ?? target.kcal,
            targetProteinG: joint.proteinReservedG,
            proteinReservedG: joint.proteinReservedG,
            availableCarbFatKcal: joint.availableCarbFatKcal,
            carbMinG: joint.jointRanges?.carbs?.min,
            carbMaxG: joint.jointRanges?.carbs?.max,
            fatMinG: joint.jointRanges?.fat?.min,
            fatMaxG: joint.jointRanges?.fat?.max,
            rawCarbMinG: joint.rawRanges?.carbs?.min,
            rawCarbMaxG: joint.rawRanges?.carbs?.max,
            rawFatMinG: joint.rawRanges?.fat?.min,
            rawFatMaxG: joint.rawRanges?.fat?.max,
            collapsed: joint.collapsed === true,
            carbG: consumed.carbs,
            fatG: consumed.fat,
            totalKcal: consumed.scoringKcal
          } : null,
          ...(buildCounterfactuals ? { counterfactualFamily } : {})
        };
      });
    }, {
      payload,
      eligibleRecords,
      counterfactualRequested,
      counterfactualExchangeSteps: ACTUAL_COUNTERFACTUAL_EXCHANGE_STEPS,
      counterfactualNormalizedGridFractions: ACTUAL_COUNTERFACTUAL_NORMALIZED_GRID_FRACTIONS
    });
    const evaluatedBySampleId = new Map(evaluated.map(item => {
      const missingPenaltyAxes = productionPenaltyAxes.filter(key => (
        !Object.prototype.hasOwnProperty.call(item.penalties || {}, key)
        || !Number.isFinite(Number(item.penalties?.[key]))
        || Number(item.penalties[key]) < 0
      ));
      const source = item.sourceValidity || {};
      let exclusionReason = null;
      if (!item.available || item.status !== "available") exclusionReason = `score_${item.status || "unavailable"}`;
      else if (source.targetAuthorityValid !== true || source.targetAuthoritySource !== "frozen_goal_snapshot") exclusionReason = "non_authoritative_snapshot_target";
      else if (source.weightSource !== "goalSnapshot") exclusionReason = "current_result_weight_fallback";
      else if (source.currentResultFallbackUsed === true || String(source.totalBurnSource || "").startsWith("currentResult")) exclusionReason = "current_result_source_fallback";
      else if (source.snapshotGoalOwned !== true) exclusionReason = "current_goal_fallback";
      else if (typeof source.trainingProfileSource !== "string" || typeof source.snapshotMarkerStatus !== "string") exclusionReason = "incomplete_training_profile_source";
      else if (!item.trainingContext || item.trainingContext === "unknown") exclusionReason = "unresolved_training_context";
      else if (missingPenaltyAxes.length) exclusionReason = "incomplete_penalty_breakdown";
      else if (!item.optionCInput) exclusionReason = "joint_model_unavailable";
      const sourceValidityKey = exclusionReason
        ? null
        : `${source.targetAuthoritySource}|${source.weightSource}|${source.totalBurnSource}|snapshot_goal|${source.trainingProfileSource}|${source.snapshotMarkerStatus}`;
      return [item.sampleId, {
        ...item,
        included: !exclusionReason,
        exclusionReason,
        missingPenaltyAxes,
        sourceValidityKey
      }];
    }));
    return rawEligibility.map(item => item.exclusionReason
      ? {
          sampleId: item.sampleId,
          included: false,
          exclusionReason: item.exclusionReason,
          scoreEvaluationAttempted: false
        }
      : evaluatedBySampleId.get(item.sampleId) || {
          sampleId: item.sampleId,
          included: false,
          exclusionReason: "normalized_record_missing",
          scoreEvaluationAttempted: false
        });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function extractAnonymizedActualDays(backupFilePath, options = {}){
  const payload = JSON.parse(fs.readFileSync(backupFilePath, "utf8"));
  return extractAnonymizedActualDaysFromPayload(payload, options);
}

function addProductionOwnershipToActualDay(day){
  if (!day.included || !day.penalties || !day.optionCInput) return { ...day, optionC: null };
  const c1 = optionC1CarbEnergyShareResidual(day.optionCInput || {});
  const c2 = optionC2RadialKcalPlaneResidual(day.optionCInput || {});
  const residualPositive = c1.valid && Number(c1.ratio) > OPTION_C_EPSILON;
  const nonJointPenaltyVector = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [
    key,
    Number(day.penalties[key])
  ]));
  const activeNonJointAxes = productionNonJointPenaltyAxes.filter(key => nonJointPenaltyVector[key] > OPTION_C_EPSILON);
  const overlap = residualPositive && activeNonJointAxes.length > 0;
  return {
    ...day,
    nonJointPenaltyVector,
    optionC: {
      valid: c1.valid,
      status: c1.status,
      direction: c1.direction,
      residual: round(c1.ratio, 12),
      c1C2AbsoluteDelta: c1.valid && c2.valid ? round(Math.abs(c1.ratio - c2.ratio), 15) : null,
      residualPositive,
      productionCoreOverlap: overlap,
      productionCoreUnique: residualPositive && !overlap,
      activeNonJointAxes
    }
  };
}

function summarizePlainValues(values){
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const percentile = fraction => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    count: sorted.length,
    min: round(sorted[0], 9),
    median: round(median, 9),
    p90: round(percentile(0.9), 9),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 9),
    max: round(sorted[sorted.length - 1], 9)
  };
}

function getActualRatioBand(value, offsetPercentagePoints = 0){
  if (!Number.isFinite(value) || value < 0) return "unavailable";
  const percentage = value * 100;
  const lower = Math.floor((percentage - offsetPercentagePoints + 1e-9) / 5) * 5 + offsetPercentagePoints;
  const upper = lower + 5;
  const labelNumber = number => Number.isInteger(number)
    ? String(number)
    : String(number).replace(".", "_");
  return `${labelNumber(lower)}_to_lt_${labelNumber(upper)}_pct_of_target`;
}

function getResidualMagnitudeBand(value){
  if (!Number.isFinite(value) || value <= OPTION_C_EPSILON) return "none";
  if (value < 0.05) return "small";
  if (value < 0.15) return "moderate";
  return "large";
}

function compareCanonicalId(left, right){
  return left < right ? -1 : left > right ? 1 : 0;
}

function maximumCardinalityMatching(vertexIds, rawEdges){
  if (!Array.isArray(vertexIds) || vertexIds.some(id => typeof id !== "string" || !id)) {
    throw new Error("matching_requires_nonempty_string_vertex_ids");
  }
  if (new Set(vertexIds).size !== vertexIds.length) throw new Error("matching_requires_unique_vertex_ids");
  const ids = [...vertexIds].sort(compareCanonicalId);
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const neighborSets = Array.from({ length: ids.length }, () => new Set());
  rawEdges.forEach(edge => {
    if (!Array.isArray(edge) || edge.length !== 2) throw new Error("matching_requires_two_endpoint_edges");
    const left = indexById.get(edge[0]);
    const right = indexById.get(edge[1]);
    if (left === undefined || right === undefined) throw new Error("matching_edge_has_unknown_vertex");
    if (left === right) throw new Error("matching_self_edge_is_invalid");
    neighborSets[left].add(right);
    neighborSets[right].add(left);
  });
  const adjacency = neighborSets.map(set => [...set].sort((a, b) => compareCanonicalId(ids[a], ids[b])));
  const n = ids.length;
  const mate = Array(n).fill(-1);
  const parent = Array(n).fill(-1);
  const base = Array.from({ length: n }, (_, index) => index);
  const used = Array(n).fill(false);
  const blossom = Array(n).fill(false);
  const leastCommonAncestor = (leftStart, rightStart) => {
    let left = leftStart;
    let right = rightStart;
    const seen = Array(n).fill(false);
    while (true) {
      left = base[left];
      seen[left] = true;
      if (mate[left] === -1) break;
      left = parent[mate[left]];
    }
    while (true) {
      right = base[right];
      if (seen[right]) return right;
      right = parent[mate[right]];
    }
  };
  const markBlossomPath = (start, blossomBase, initialChild) => {
    let vertex = start;
    let child = initialChild;
    while (base[vertex] !== blossomBase) {
      blossom[base[vertex]] = true;
      blossom[base[mate[vertex]]] = true;
      parent[vertex] = child;
      child = mate[vertex];
      vertex = parent[mate[vertex]];
    }
  };
  const augmentFrom = rootVertex => {
    parent.fill(-1);
    used.fill(false);
    for (let index = 0; index < n; index += 1) base[index] = index;
    const queue = [rootVertex];
    let head = 0;
    used[rootVertex] = true;
    while (head < queue.length) {
      const vertex = queue[head++];
      for (const neighbor of adjacency[vertex]) {
        if (base[vertex] === base[neighbor] || mate[vertex] === neighbor) continue;
        if (neighbor === rootVertex || (mate[neighbor] !== -1 && parent[mate[neighbor]] !== -1)) {
          const blossomBase = leastCommonAncestor(vertex, neighbor);
          blossom.fill(false);
          markBlossomPath(vertex, blossomBase, neighbor);
          markBlossomPath(neighbor, blossomBase, vertex);
          for (let index = 0; index < n; index += 1) {
            if (!blossom[base[index]]) continue;
            base[index] = blossomBase;
            if (!used[index]) {
              used[index] = true;
              queue.push(index);
            }
          }
        } else if (parent[neighbor] === -1) {
          parent[neighbor] = vertex;
          if (mate[neighbor] === -1) {
            let current = neighbor;
            while (current !== -1) {
              const previous = parent[current];
              const next = previous === -1 ? -1 : mate[previous];
              mate[current] = previous;
              if (previous !== -1) mate[previous] = current;
              current = next;
            }
            return true;
          }
          const next = mate[neighbor];
          used[next] = true;
          queue.push(next);
        }
      }
    }
    return false;
  };
  for (let vertex = 0; vertex < n; vertex += 1) {
    if (mate[vertex] === -1) augmentFrom(vertex);
  }
  const pairs = [];
  for (let left = 0; left < n; left += 1) {
    if (mate[left] > left) pairs.push([ids[left], ids[mate[left]]]);
  }
  pairs.sort((a, b) => compareCanonicalId(a[0], b[0]) || compareCanonicalId(a[1], b[1]));
  return { cardinality: pairs.length, pairs };
}

function getActualPairKey(left, right){
  return [left.sampleId, right.sampleId].sort(compareCanonicalId).join("|");
}

function getActualPairDisplayContract(pair, offsetPercentagePoints = 0){
  const bands = day => ({
    energy: getActualRatioBand(day.ratios?.energy, offsetPercentagePoints),
    protein: getActualRatioBand(day.ratios?.protein, offsetPercentagePoints),
    carb: getActualRatioBand(day.ratios?.carb, offsetPercentagePoints),
    fat: getActualRatioBand(day.ratios?.fat, offsetPercentagePoints)
  });
  const left = bands(pair.left);
  const right = bands(pair.right);
  const available = [...Object.values(left), ...Object.values(right)].every(value => value !== "unavailable");
  let exclusionReason = null;
  if (!available) exclusionReason = "unavailable_target_ratio_band";
  else if (left.energy !== right.energy || left.protein !== right.protein) exclusionReason = "energy_or_protein_display_confounded";
  else if (left.carb === right.carb && left.fat === right.fat) exclusionReason = "carb_fat_display_identical";
  else if (left.carb === right.carb || left.fat === right.fat) exclusionReason = "one_macro_display_axis_only";
  const stratumKey = `${pair.left.goal}|${pair.left.trainingContext}|${pair.left.sourceValidityKey}`;
  const visibleBody = {
    goal: pair.left.goal,
    trainingContext: pair.left.trainingContext,
    sourceCohort: "same_snapshot_provenance_cohort",
    energy: left.energy,
    protein: left.protein,
    carbFatSides: [
      `${left.carb}|${left.fat}`,
      `${right.carb}|${right.fat}`
    ].sort(compareCanonicalId)
  };
  return {
    judgeable: exclusionReason === null,
    exclusionReason,
    left,
    right,
    stratumKey,
    visibleSignature: crypto.createHash("sha256").update(JSON.stringify(visibleBody)).digest("hex")
  };
}

function summarizeActualPairSet(candidates, pairs){
  const matchedIds = new Set(pairs.flatMap(pair => [pair.left.sampleId, pair.right.sampleId]));
  const maximum = maximumCardinalityMatching(
    candidates.map(day => day.sampleId),
    pairs.map(pair => [pair.left.sampleId, pair.right.sampleId])
  );
  return {
    pairCount: pairs.length,
    matchedRecordCount: matchedIds.size,
    unmatchedRecordCount: Math.max(0, candidates.length - matchedIds.size),
    coverage: candidates.length ? round(matchedIds.size / candidates.length, 6) : 0,
    maximumDisjointPairCount: maximum.cardinality
  };
}

function getActualHiddenComparisonRole(left, right){
  return left.optionC.direction === right.optionC.direction
    && getResidualMagnitudeBand(left.optionC.residual) === getResidualMagnitudeBand(right.optionC.residual)
    ? "control"
    : "contrast";
}

function buildActualMatchedEvidence(days){
  const candidates = days
    .filter(day => day.included && day.optionC?.valid && day.nonJointPenaltyVector)
    .sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId));
  const toleranceResults = ACTUAL_MATCH_TOLERANCES.map(config => {
    const pairs = [];
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const left = candidates[leftIndex];
        const right = candidates[rightIndex];
        if (left.goal !== right.goal
            || left.trainingContext !== right.trainingContext
            || left.sourceValidityKey !== right.sourceValidityKey) continue;
        const axisDeltas = productionNonJointPenaltyAxes.map(key => Math.abs(
          Number(left.nonJointPenaltyVector[key]) - Number(right.nonJointPenaltyVector[key])
        ));
        const maximumAxisDelta = Math.max(...axisDeltas);
        if (maximumAxisDelta > config.maxAxisDelta + 1e-12) continue;
        const residualDelta = Math.abs(Number(left.optionC.residual) - Number(right.optionC.residual));
        const pair = {
          left,
          right,
          pairKey: getActualPairKey(left, right),
          maximumAxisDelta,
          residualDelta,
          hiddenComparisonRole: getActualHiddenComparisonRole(left, right)
        };
        pair.displayContract = getActualPairDisplayContract(pair);
        pair.offsetDisplayContract = getActualPairDisplayContract(pair, 2.5);
        pairs.push(pair);
      }
    }
    pairs.sort((a, b) => compareCanonicalId(a.pairKey, b.pairKey));
    const judgeablePairs = pairs.filter(pair => pair.displayContract.judgeable);
    const contrastPairs = judgeablePairs.filter(pair => pair.hiddenComparisonRole === "contrast");
    const controlPairs = judgeablePairs.filter(pair => pair.hiddenComparisonRole === "control");
    return {
      id: config.id,
      maximumAxisDelta: config.maxAxisDelta,
      baseCore: summarizeActualPairSet(candidates, pairs),
      judgeable: {
        ...summarizeActualPairSet(candidates, judgeablePairs),
        exclusionReasonCounts: countBy(pairs.filter(pair => !pair.displayContract.judgeable), pair => pair.displayContract.exclusionReason),
        offsetSensitivityFlipCount: pairs.filter(pair => pair.displayContract.judgeable !== pair.offsetDisplayContract.judgeable).length
      },
      hiddenRolePotential: {
        contrast: summarizeActualPairSet(candidates, contrastPairs),
        control: summarizeActualPairSet(candidates, controlPairs)
      },
      pairs
    };
  });
  return { candidates, toleranceResults };
}

function shouldSwapHypothesisBlindPair(pairKey){
  const digest = crypto.createHash("sha256")
    .update(`${ACTUAL_BLIND_SHUFFLE_SEED_VERSION}|side|${pairKey}`)
    .digest();
  return (digest[0] & 1) === 1;
}

function getHypothesisBlindPresentationKey(pairKey){
  return crypto.createHash("sha256")
    .update(`${ACTUAL_BLIND_SHUFFLE_SEED_VERSION}|order|${pairKey}`)
    .digest("hex");
}

function buildHypothesisBlindProductMeaningReview(matchedEvidence, maximumCases = 12){
  const toleranceRank = new Map(ACTUAL_MATCH_TOLERANCES.map((item, index) => [item.id, index]));
  const narrowestByPair = new Map();
  matchedEvidence.toleranceResults.forEach(result => {
    result.pairs.filter(pair => pair.displayContract.judgeable).forEach(pair => {
      if (!narrowestByPair.has(pair.pairKey)) {
        narrowestByPair.set(pair.pairKey, { pairKey: pair.pairKey, pair, matchContract: result.id });
      }
    });
  });
  const representativeByVisibleSignature = new Map();
  [...narrowestByPair.values()]
    .sort((a, b) => (
      toleranceRank.get(a.matchContract) - toleranceRank.get(b.matchContract)
      || a.pair.maximumAxisDelta - b.pair.maximumAxisDelta
      || getHypothesisBlindPresentationKey(a.pairKey).localeCompare(getHypothesisBlindPresentationKey(b.pairKey))
    ))
    .forEach(candidate => {
      if (!representativeByVisibleSignature.has(candidate.pair.displayContract.visibleSignature)) {
        representativeByVisibleSignature.set(candidate.pair.displayContract.visibleSignature, candidate);
      }
    });
  const eligible = [...representativeByVisibleSignature.values()];
  const byStratum = new Map();
  eligible.forEach(candidate => {
    const stratumKey = candidate.pair.displayContract.stratumKey;
    const list = byStratum.get(stratumKey) || [];
    list.push(candidate);
    byStratum.set(stratumKey, list);
  });
  const blocksByStratum = new Map();
  for (const [stratumKey, candidates] of byStratum) {
    const contrasts = candidates.filter(item => item.pair.hiddenComparisonRole === "contrast");
    const controls = candidates.filter(item => item.pair.hiddenComparisonRole === "control");
    const blocks = [];
    contrasts.forEach(contrast => controls.forEach(control => {
      const sampleIds = [
        contrast.pair.left.sampleId,
        contrast.pair.right.sampleId,
        control.pair.left.sampleId,
        control.pair.right.sampleId
      ];
      if (new Set(sampleIds).size !== 4) return;
      const blockKey = [contrast.pairKey, control.pairKey].sort(compareCanonicalId).join("||");
      blocks.push({ stratumKey, contrast, control, sampleIds, blockKey });
    }));
    blocks.sort((a, b) => (
      getHypothesisBlindPresentationKey(a.blockKey).localeCompare(getHypothesisBlindPresentationKey(b.blockKey))
    ));
    if (blocks.length) blocksByStratum.set(stratumKey, blocks);
  }
  const selectedBlocks = [];
  const usedSampleIds = new Set();
  const usedVisibleSignatures = new Set();
  const maximumBlocks = Math.floor(maximumCases / 2);
  const stratumKeys = [...blocksByStratum.keys()].sort((a, b) => (
    getHypothesisBlindPresentationKey(a).localeCompare(getHypothesisBlindPresentationKey(b))
  ));
  let madeProgress = true;
  while (selectedBlocks.length < maximumBlocks && madeProgress) {
    madeProgress = false;
    for (const stratumKey of stratumKeys) {
      if (selectedBlocks.length >= maximumBlocks) break;
      const block = blocksByStratum.get(stratumKey).find(candidate => (
        candidate.sampleIds.every(sampleId => !usedSampleIds.has(sampleId))
        && [candidate.contrast, candidate.control].every(item => (
          !usedVisibleSignatures.has(item.pair.displayContract.visibleSignature)
        ))
      ));
      if (!block) continue;
      selectedBlocks.push(block);
      block.sampleIds.forEach(sampleId => usedSampleIds.add(sampleId));
      [block.contrast, block.control].forEach(item => usedVisibleSignatures.add(item.pair.displayContract.visibleSignature));
      madeProgress = true;
    }
  }
  const selected = selectedBlocks.flatMap(block => [block.contrast, block.control]);
  selected.sort((a, b) => (
    getHypothesisBlindPresentationKey(a.pairKey).localeCompare(getHypothesisBlindPresentationKey(b.pairKey))
  ));
  const preJudgmentStatus = selectedBlocks.length > 0
    ? "READY_FOR_LIMITED_BLIND_JUDGMENT"
    : "NO_BALANCED_JUDGEABLE_BLOCK";
  const reviewForUser = selectedBlocks.length > 0;
  const reviewPacket = [];
  const revealMap = [];
  selected.forEach(({ pairKey, pair, matchContract }, index) => {
      const caseId = `blind_review_case_${String(index + 1).padStart(3, "0")}`;
      const canonical = [pair.left, pair.right]
        .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
        .map((day, sourceIndex) => ({ day, originalPairSide: `source_${sourceIndex + 1}` }));
      const swap = shouldSwapHypothesisBlindPair(pairKey);
      const randomized = swap
        ? [canonical[1], canonical[0]]
        : canonical;
      const sanitizeReviewSide = ({ day }) => ({
        targetRatioBands: {
          carb: getActualRatioBand(day.ratios?.carb),
          fat: getActualRatioBand(day.ratios?.fat)
        }
      });
      const sanitizeRevealSide = ({ day, originalPairSide }) => ({
        originalPairSide,
        residualDirection: day.optionC.direction,
        residualMagnitude: getResidualMagnitudeBand(day.optionC.residual)
      });
      reviewPacket.push({
        caseId,
        matchContract,
        context: {
          goal: canonical[0].day.goal,
          trainingContext: canonical[0].day.trainingContext,
          sourceCohort: "same_snapshot_provenance_cohort"
        },
        commonTargetRatioBands: {
          energy: getActualRatioBand(canonical[0].day.ratios?.energy),
          protein: getActualRatioBand(canonical[0].day.ratios?.protein)
        },
        nonJointSimilarity: {
          axisCount: productionNonJointPenaltyAxes.length,
          maximumAxisDelta: round(pair.maximumAxisDelta, 6)
        },
        caseA: sanitizeReviewSide(randomized[0]),
        caseB: sanitizeReviewSide(randomized[1]),
        judgmentOptions: ["separate_joint_meaning", "existing_core_is_sufficient", "indeterminate"]
      });
      revealMap.push({
        caseId,
        caseA: sanitizeRevealSide(randomized[0]),
        caseB: sanitizeRevealSide(randomized[1])
      });
  });
  const reviewBody = {
    schemaVersion: "hypothesis_blind_product_meaning_review_v2_balanced_disjoint",
    randomizationSeedVersion: ACTUAL_BLIND_SHUFFLE_SEED_VERSION,
    preJudgmentStatus,
    reviewForUser,
    selectionContract: {
      targetRatioBandWidthPercentagePoints: 5,
      sampleReuseAllowed: false,
      visibleCaseDuplicationAllowed: false,
      reviewScope: "limited_product_meaning_only",
      policyDecisionAuthorized: false
    },
    reviewPacket
  };
  const reviewPacketHash = crypto.createHash("sha256").update(JSON.stringify(reviewBody)).digest("hex");
  const reviewArtifact = { ...reviewBody, reviewPacketHash };
  const revealBody = {
    schemaVersion: "hypothesis_blind_product_meaning_reveal_v2_balanced_disjoint",
    reviewPacketHash,
    revealOnlyAfterJudgment: true,
    revealMap
  };
  const revealMapHash = crypto.createHash("sha256").update(JSON.stringify(revealBody)).digest("hex");
  return {
    reviewArtifact,
    revealArtifact: { ...revealBody, revealMapHash },
    selectionDiagnostics: {
      preJudgmentStatus,
      reviewForUser,
      authorizesPolicyDecision: false,
      selectionOptimality: "deterministic_disjoint_balanced_lower_bound",
      mixedRoleGlobalOptimal: false,
      narrowestJudgeablePairCount: narrowestByPair.size,
      visibleDeduplicatedPairCount: eligible.length,
      visibleDuplicatePairCount: narrowestByPair.size - eligible.length,
      balancedBlockCandidateCount: [...blocksByStratum.values()].reduce((sum, blocks) => sum + blocks.length, 0),
      selectedBalancedBlockCount: selectedBlocks.length,
      selectedCaseCount: selected.length,
      selectedSampleCount: usedSampleIds.size,
      participatingStrata: [...new Set(selectedBlocks.map(block => block.stratumKey))].sort(compareCanonicalId),
      noSampleReuse: usedSampleIds.size === selected.length * 2,
      visibleSignaturesUnique: usedVisibleSignatures.size === selected.length
    }
  };
}

async function buildLocalActualDayAudit(backupFilePath){
  const extracted = (await extractAnonymizedActualDays(backupFilePath)).map(addProductionOwnershipToActualDay);
  const included = extracted.filter(day => day.included);
  const excluded = extracted.filter(day => !day.included);
  const validOptionC = included.filter(day => day.optionC?.valid === true);
  const residualPositive = validOptionC.filter(day => Number(day.optionC.residual) > OPTION_C_EPSILON);
  const matchedEvidence = buildActualMatchedEvidence(included);
  const hypothesisBlindArtifacts = buildHypothesisBlindProductMeaningReview(matchedEvidence);
  const { reviewArtifact, revealArtifact, selectionDiagnostics } = hypothesisBlindArtifacts;
  const auditWithoutHash = {
    schemaVersion: "component_score_local_actual_day_audit_v5_balanced_disjoint",
    evidenceRole: "source_safe_joint_ownership_and_balanced_hypothesis_blind_product_meaning_only",
    privacyContract: "The standalone review artifact emits no residual hypothesis, dates, food names, memo text, meal ids, absolute macro grams, absolute kcal values, backup path, raw backup payload, current final score, current joint penalty, or candidate penalty. It contains cases only when a same-stratum disjoint contrast/control block exists. The separately written reveal artifact remains blocked until a review-ready judgment is fixed and the explicit post-judgment flag is used.",
    sourceRecordCount: extracted.length,
    includedRecordCount: included.length,
    excludedRecordCount: excluded.length,
    exclusionReasonCounts: countBy(excluded, day => day.exclusionReason),
    coverage: {
      includedShare: extracted.length ? round(included.length / extracted.length, 6) : 0,
      goals: countBy(included, day => day.goal),
      trainingContexts: countBy(included, day => day.trainingContext),
      sourceValidity: countBy(included, day => day.sourceValidityKey)
    },
    productionOwnershipSummary: {
      nonJointAxisCount: productionNonJointPenaltyAxes.length,
      jointAxisExcluded: !productionNonJointPenaltyAxes.includes("carbFatExchangeFailurePenalty"),
      validCount: validOptionC.length,
      invalidCount: included.length - validOptionC.length,
      residualPositiveCount: residualPositive.length,
      productionCoreUniqueCount: residualPositive.filter(day => day.optionC.productionCoreUnique).length,
      productionCoreOverlapCount: residualPositive.filter(day => day.optionC.productionCoreOverlap).length,
      directionCounts: countBy(validOptionC, day => day.optionC.direction),
      residualDistribution: summarizePlainValues(validOptionC.map(day => day.optionC.residual)),
      c1C2DeltaDistribution: summarizePlainValues(validOptionC.map(day => day.optionC.c1C2AbsoluteDelta))
    },
    matchedEvidence: matchedEvidence.toleranceResults.map(result => ({
      id: result.id,
      maximumAxisDelta: result.maximumAxisDelta,
      baseCore: result.baseCore,
      judgeable: result.judgeable,
      hiddenRolePotential: result.hiddenRolePotential
    })),
    residualDirectionCounts: countBy(validOptionC, day => day.optionC.direction),
    hypothesisBlindArtifactSummary: {
      reviewPacketHash: reviewArtifact.reviewPacketHash,
      revealMapHash: revealArtifact.revealMapHash,
      reviewPacketCaseCount: reviewArtifact.reviewPacket.length,
      revealMapCaseCount: revealArtifact.revealMap.length,
      preJudgmentStatus: selectionDiagnostics.preJudgmentStatus,
      reviewForUser: selectionDiagnostics.reviewForUser,
      authorizesPolicyDecision: selectionDiagnostics.authorizesPolicyDecision,
      selectionDiagnostics,
      standaloneReviewOutputRequired: true,
      separatePostJudgmentRevealOutput: true
    },
    hypothesisBlindJudgmentContract: {
      allowedChoices: ["separate_joint_meaning", "existing_core_is_sufficient", "indeterminate"],
      randomizationSeedVersion: reviewArtifact.randomizationSeedVersion,
      revealOnlyAfterJudgment: true,
      reviewPacketHidesResidualHypothesis: true,
      coefficientSelectionRequested: false,
      currentScoreUsedAsOracle: false,
      currentJointPenaltyUsedAsOracle: false
    }
  };
  const summaryAudit = {
    ...auditWithoutHash,
    anonymizedAuditHash: crypto.createHash("sha256").update(JSON.stringify(auditWithoutHash)).digest("hex")
  };
  return { summaryAudit, reviewArtifact, revealArtifact, selectionDiagnostics };
}

function getCounterfactualPairRole(left, right){
  const leftInside = left.optionC?.valid === true && left.optionC.direction === "inside" && left.optionC.residual === 0;
  const rightInside = right.optionC?.valid === true && right.optionC.direction === "inside" && right.optionC.residual === 0;
  if (leftInside && rightInside) return "null_control";
  if (leftInside === rightInside) return null;
  const outside = leftInside ? right : left;
  if (outside.optionC?.direction === "carb_heavy" && outside.optionC.residual > OPTION_C_EPSILON) return "contrast_carb_heavy";
  if (outside.optionC?.direction === "fat_heavy" && outside.optionC.residual > OPTION_C_EPSILON) return "contrast_fat_heavy";
  return null;
}

function getCounterfactualRoleAssignment(index){
  return ["null_control", "contrast_carb_heavy", "null_control", "contrast_fat_heavy"][index % 4];
}

function getCounterfactualSelectionKey(value){
  return crypto.createHash("sha256")
    .update(`${ACTUAL_COUNTERFACTUAL_SEED_VERSION}|selection|${value}`)
    .digest("hex");
}

function getCounterfactualSideSwap(pairKey){
  const digest = crypto.createHash("sha256")
    .update(`${ACTUAL_COUNTERFACTUAL_SEED_VERSION}|side|${pairKey}`)
    .digest();
  return (digest[0] & 1) === 1;
}

function buildActualAnchoredCounterfactualEvidence(days){
  const anchors = days
    .filter(day => day.included && day.optionC?.valid && day.nonJointPenaltyVector && day.counterfactualFamily?.valid)
    .sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId));
  const actualMarginalSupport = new Map();
  anchors.forEach(day => {
    const key = `${day.goal}|${day.trainingContext}`;
    const current = actualMarginalSupport.get(key) || { carb: [], fat: [] };
    if (Number.isFinite(day.ratios?.carb)) current.carb.push(day.ratios.carb);
    if (Number.isFinite(day.ratios?.fat)) current.fat.push(day.ratios.fat);
    actualMarginalSupport.set(key, current);
  });
  const supportRanges = new Map([...actualMarginalSupport.entries()].map(([key, values]) => [key, {
    carbMin: Math.min(...values.carb),
    carbMax: Math.max(...values.carb),
    fatMin: Math.min(...values.fat),
    fatMax: Math.max(...values.fat)
  }]));
  const anchorsByStratum = new Map();
  anchors.forEach(day => {
    const stratumKey = `${day.goal}|${day.trainingContext}|${day.sourceValidityKey}`;
    const list = anchorsByStratum.get(stratumKey) || [];
    list.push(day);
    anchorsByStratum.set(stratumKey, list);
  });
  const assigned = [];
  for (const [stratumKey, stratumAnchors] of [...anchorsByStratum.entries()].sort((a, b) => compareCanonicalId(a[0], b[0]))) {
    [...stratumAnchors].sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId)).forEach((day, index) => {
      assigned.push({ day, stratumKey, assignedRole: getCounterfactualRoleAssignment(index) });
    });
  }
  const anchorExclusionReasons = {};
  const incrementReason = reason => {
    anchorExclusionReasons[reason] = (anchorExclusionReasons[reason] || 0) + 1;
  };
  const eligibleCases = [];
  assigned.forEach(({ day, stratumKey, assignedRole }) => {
    const anchorCoreZero = Number(day.nonJointPenaltyVector.fatRangePenalty) === 0
      && Number(day.nonJointPenaltyVector.carbExerciseContextPenalty) === 0
      && Number(day.nonJointPenaltyVector.dataOutlierPenalty) === 0;
    if (!anchorCoreZero) {
      incrementReason("anchor_core_macro_or_outlier_penalty_nonzero");
      return;
    }
    const publicSupport = supportRanges.get(`${day.goal}|${day.trainingContext}`);
    if (!publicSupport || ![publicSupport.carbMin, publicSupport.carbMax, publicSupport.fatMin, publicSupport.fatMax].every(Number.isFinite)) {
      incrementReason("actual_marginal_support_unavailable");
      return;
    }
    const variants = (day.counterfactualFamily.variants || []).filter(variant => variant.valid).map(variant => {
      const c1 = optionC1CarbEnergyShareResidual(variant.optionCInput || {});
      const c2 = optionC2RadialKcalPlaneResidual(variant.optionCInput || {});
      const nonJointPenaltyVector = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [key, Number(variant.penalties?.[key])]));
      return {
        ...variant,
        sampleId: `${day.sampleId}::${variant.variantKey}`,
        anchorSampleId: day.sampleId,
        goal: day.goal,
        trainingContext: day.trainingContext,
        sourceValidityKey: day.sourceValidityKey,
        nonJointPenaltyVector,
        optionC: {
          valid: c1.valid === true && c2.valid === true && Math.abs(Number(c1.ratio) - Number(c2.ratio)) <= 1e-12,
          direction: c1.direction,
          residual: c1.valid ? round(c1.ratio, 12) : null,
          residualMagnitude: getResidualMagnitudeBand(c1.ratio)
        }
      };
    }).filter(variant => {
      const exactAnchorVector = productionNonJointPenaltyAxes.every(key => (
        Number.isFinite(variant.nonJointPenaltyVector[key])
        && Math.abs(variant.nonJointPenaltyVector[key] - Number(day.nonJointPenaltyVector[key])) <= 1e-12
      ));
      const coreZero = variant.nonJointPenaltyVector.fatRangePenalty === 0
        && variant.nonJointPenaltyVector.carbExerciseContextPenalty === 0
        && variant.nonJointPenaltyVector.dataOutlierPenalty === 0;
      const supportValid = variant.ratios.carb >= publicSupport.carbMin - 1e-12
        && variant.ratios.carb <= publicSupport.carbMax + 1e-12
        && variant.ratios.fat >= publicSupport.fatMin - 1e-12
        && variant.ratios.fat <= publicSupport.fatMax + 1e-12;
      const invariant = variant.invariants || {};
      return variant.optionC.valid
        && exactAnchorVector
        && coreZero
        && supportValid
        && Math.abs(Number(invariant.exchangeEnergyGap)) <= 1e-9
        && Math.abs(Number(invariant.derivedScoringKcalGap)) <= 1e-9
        && Math.abs(Number(invariant.proteinGap)) <= 1e-9
        && invariant.syntheticMealClosureValid === true
        && invariant.targetAuthorityValid === true
        && invariant.targetAuthoritySource === "frozen_goal_snapshot"
        && invariant.trainingContext === day.trainingContext;
    });
    const pairCandidates = [];
    for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < variants.length; rightIndex += 1) {
        const left = variants[leftIndex];
        const right = variants[rightIndex];
        const hiddenRole = getCounterfactualPairRole(left, right);
        if (hiddenRole !== assignedRole) continue;
        if (!productionNonJointPenaltyAxes.every(key => Math.abs(
          left.nonJointPenaltyVector[key] - right.nonJointPenaltyVector[key]
        ) <= 1e-12)) continue;
        const pair = {
          left,
          right,
          pairKey: [left.variantKey, right.variantKey].sort(compareCanonicalId).join("|"),
          maximumAxisDelta: 0,
          hiddenComparisonRole: hiddenRole
        };
        pair.displayContract = getActualPairDisplayContract(pair);
        pair.offsetDisplayContract = getActualPairDisplayContract(pair, 2.5);
        if (!pair.displayContract.judgeable || !pair.offsetDisplayContract.judgeable) continue;
        pairCandidates.push(pair);
      }
    }
    pairCandidates.sort((a, b) => {
      const aSteps = [Math.abs(a.left.exchangeStep), Math.abs(a.right.exchangeStep)];
      const bSteps = [Math.abs(b.left.exchangeStep), Math.abs(b.right.exchangeStep)];
      return Math.max(...aSteps) - Math.max(...bSteps)
        || aSteps.reduce((sum, value) => sum + value, 0) - bSteps.reduce((sum, value) => sum + value, 0)
        || getCounterfactualSelectionKey(`${day.sampleId}|${a.pairKey}`).localeCompare(
          getCounterfactualSelectionKey(`${day.sampleId}|${b.pairKey}`)
        );
    });
    if (!pairCandidates.length) {
      incrementReason(`no_${assignedRole}_pair_after_invariants`);
      return;
    }
    eligibleCases.push({
      anchorSampleId: day.sampleId,
      stratumKey,
      publicContextKey: `${day.goal}|${day.trainingContext}`,
      assignedRole,
      pairOptions: pairCandidates
    });
  });

  const casesByStratum = new Map();
  eligibleCases.forEach(item => {
    const list = casesByStratum.get(item.stratumKey) || [];
    list.push(item);
    casesByStratum.set(item.stratumKey, list);
  });
  const blockCandidatesByDirection = {
    contrast_carb_heavy: [],
    contrast_fat_heavy: []
  };
  for (const [stratumKey, cases] of casesByStratum) {
    const controls = cases.filter(item => item.assignedRole === "null_control");
    for (const direction of ["contrast_carb_heavy", "contrast_fat_heavy"]) {
      const contrasts = cases.filter(item => item.assignedRole === direction);
      controls.forEach(control => contrasts.forEach(contrast => {
        if (control.anchorSampleId === contrast.anchorSampleId) return;
        const blockKey = `${stratumKey}|${control.anchorSampleId}|${contrast.anchorSampleId}`;
        const pairSelections = control.pairOptions.flatMap(controlPair => (
          contrast.pairOptions
            .filter(contrastPair => (
              controlPair.displayContract.visibleSignature !== contrastPair.displayContract.visibleSignature
            ))
            .map(contrastPair => ({
              selectionKey: `${controlPair.pairKey}|${contrastPair.pairKey}`,
              controlPair,
              contrastPair
            }))
        )).sort((a, b) => getCounterfactualSelectionKey(`${blockKey}|${a.selectionKey}`)
          .localeCompare(getCounterfactualSelectionKey(`${blockKey}|${b.selectionKey}`)));
        if (!pairSelections.length) return;
        blockCandidatesByDirection[direction].push({
          blockKey,
          stratumKey,
          publicContextKey: control.publicContextKey,
          control,
          contrast,
          pairSelections
        });
      }));
    }
  }
  Object.values(blockCandidatesByDirection).forEach(blocks => blocks.sort((a, b) => (
    getCounterfactualSelectionKey(a.blockKey).localeCompare(getCounterfactualSelectionKey(b.blockKey))
  )));
  const directionSchedule = [
    "contrast_carb_heavy",
    "contrast_fat_heavy",
    "contrast_carb_heavy",
    "contrast_fat_heavy",
    "contrast_carb_heavy",
    "contrast_fat_heavy"
  ];
  const findCompleteBalancedSelection = (
    scheduleIndex = 0,
    blocks = [],
    usedAnchors = new Set(),
    usedVisibleSignatures = new Set(),
    contextCounts = new Map()
  ) => {
    if (scheduleIndex === directionSchedule.length) {
      return contextCounts.size >= 2 ? blocks : null;
    }
    const direction = directionSchedule[scheduleIndex];
    const candidates = blockCandidatesByDirection[direction]
      .flatMap(candidate => candidate.pairSelections.map(selection => ({
        ...candidate,
        control: { ...candidate.control, pair: selection.controlPair },
        contrast: { ...candidate.contrast, pair: selection.contrastPair },
        materializedBlockKey: `${candidate.blockKey}|${selection.selectionKey}`
      })))
      .filter(candidate => {
        const cases = [candidate.control, candidate.contrast];
        return cases.every(item => !usedAnchors.has(item.anchorSampleId))
          && cases.every(item => !usedVisibleSignatures.has(item.pair.displayContract.visibleSignature));
      })
      .sort((a, b) => (
        (contextCounts.get(a.publicContextKey) || 0) - (contextCounts.get(b.publicContextKey) || 0)
        || getCounterfactualSelectionKey(a.materializedBlockKey)
          .localeCompare(getCounterfactualSelectionKey(b.materializedBlockKey))
      ));
    for (const candidate of candidates) {
      const nextAnchors = new Set(usedAnchors);
      const nextVisibleSignatures = new Set(usedVisibleSignatures);
      [candidate.control, candidate.contrast].forEach(item => {
        nextAnchors.add(item.anchorSampleId);
        nextVisibleSignatures.add(item.pair.displayContract.visibleSignature);
      });
      const nextContextCounts = new Map(contextCounts);
      nextContextCounts.set(
        candidate.publicContextKey,
        (nextContextCounts.get(candidate.publicContextKey) || 0) + 1
      );
      const complete = findCompleteBalancedSelection(
        scheduleIndex + 1,
        [...blocks, candidate],
        nextAnchors,
        nextVisibleSignatures,
        nextContextCounts
      );
      if (complete) return complete;
    }
    return null;
  };
  const selectedBlocks = findCompleteBalancedSelection() || [];
  const usedAnchors = new Set(selectedBlocks.flatMap(block => (
    [block.control.anchorSampleId, block.contrast.anchorSampleId]
  )));
  const usedVisibleSignatures = new Set(selectedBlocks.flatMap(block => (
    [block.control.pair.displayContract.visibleSignature, block.contrast.pair.displayContract.visibleSignature]
  )));
  const selectedCases = selectedBlocks.flatMap(block => [block.control, block.contrast]);
  const selectedPublicContexts = new Set(selectedBlocks.map(block => block.publicContextKey));
  const selectedRoleCounts = countBy(selectedCases, item => item.assignedRole);
  const readinessChecks = {
    selectedBalancedBlockCount: selectedBlocks.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS,
    selectedCaseCount: selectedCases.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS * 2,
    distinctAnchorCount: usedAnchors.size === selectedCases.length,
    contrastControlBalanced: (selectedRoleCounts.null_control || 0) === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS
      && (selectedRoleCounts.contrast_carb_heavy || 0) === 3
      && (selectedRoleCounts.contrast_fat_heavy || 0) === 3,
    multiplePublicContexts: selectedPublicContexts.size >= 2,
    visibleSignaturesUnique: usedVisibleSignatures.size === selectedCases.length
  };
  const reviewForUser = Object.values(readinessChecks).every(Boolean);
  const preJudgmentStatus = reviewForUser
    ? "READY_FOR_COUNTERFACTUAL_BLIND_JUDGMENT"
    : "COUNTERFACTUAL_PACKET_INSUFFICIENT";
  return {
    anchors,
    assigned,
    eligibleCases,
    anchorExclusionReasons,
    blockCandidatesByDirection,
    selectedBlocks: reviewForUser ? selectedBlocks : [],
    selectedCases: reviewForUser ? selectedCases : [],
    selectedPublicContexts: reviewForUser ? [...selectedPublicContexts].sort(compareCanonicalId) : [],
    selectedRoleCounts: reviewForUser ? selectedRoleCounts : {},
    readinessChecks,
    reviewForUser,
    preJudgmentStatus
  };
}

const COUNTERFACTUAL_ATTRITION_ROLES = Object.freeze([
  "null_control",
  "contrast_carb_heavy",
  "contrast_fat_heavy"
]);
const COUNTERFACTUAL_ATTRITION_LANES = Object.freeze([
  Object.freeze({
    id: "L1_current_rules_capability_first",
    grid: "fixed",
    support: "observed",
    core: "strict_zero",
    anchorVector: "exact",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L2_fixed_observed_strict_pair_equal",
    grid: "fixed",
    support: "observed",
    core: "strict_zero",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L3_fixed_policy_strict_pair_equal",
    grid: "fixed",
    support: "policy",
    core: "strict_zero",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L4_normalized_observed_strict_pair_equal",
    grid: "normalized",
    support: "observed",
    core: "strict_zero",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L5_normalized_policy_strict_pair_equal",
    grid: "normalized",
    support: "policy",
    core: "strict_zero",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L6_fixed_observed_equal_nonzero",
    grid: "fixed",
    support: "observed",
    core: "equal_nonzero_allowed",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L7_fixed_policy_equal_nonzero",
    grid: "fixed",
    support: "policy",
    core: "equal_nonzero_allowed",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L8_normalized_observed_equal_nonzero",
    grid: "normalized",
    support: "observed",
    core: "equal_nonzero_allowed",
    anchorVector: "not_required",
    assignment: "capability_first"
  }),
  Object.freeze({
    id: "L9_normalized_policy_equal_nonzero",
    grid: "normalized",
    support: "policy",
    core: "equal_nonzero_allowed",
    anchorVector: "not_required",
    assignment: "capability_first"
  })
]);

function isCounterfactualCoreZero(vector){
  return Number(vector?.fatRangePenalty) === 0
    && Number(vector?.carbExerciseContextPenalty) === 0
    && Number(vector?.dataOutlierPenalty) === 0;
}

function counterfactualVectorsExactlyEqual(left, right){
  return productionNonJointPenaltyAxes.every(key => (
    Number.isFinite(Number(left?.[key]))
    && Number.isFinite(Number(right?.[key]))
    && Math.abs(Number(left[key]) - Number(right[key])) <= 1e-12
  ));
}

function buildCounterfactualSupportRanges(anchors){
  const valuesByContext = new Map();
  anchors.forEach(day => {
    const key = `${day.goal}|${day.trainingContext}`;
    const values = valuesByContext.get(key) || { carb: [], fat: [] };
    if (Number.isFinite(Number(day.ratios?.carb))) values.carb.push(Number(day.ratios.carb));
    if (Number.isFinite(Number(day.ratios?.fat))) values.fat.push(Number(day.ratios.fat));
    valuesByContext.set(key, values);
  });
  return new Map([...valuesByContext.entries()].map(([key, values]) => {
    const complete = values.carb.length > 0 && values.fat.length > 0;
    return [key, complete ? {
      carbMin: Math.min(...values.carb),
      carbMax: Math.max(...values.carb),
      fatMin: Math.min(...values.fat),
      fatMax: Math.max(...values.fat)
    } : null];
  }));
}

function materializeCounterfactualAttritionVariant(day, variant, supportRange){
  const c1 = optionC1CarbEnergyShareResidual(variant.optionCInput || {});
  const c2 = optionC2RadialKcalPlaneResidual(variant.optionCInput || {});
  const nonJointPenaltyVector = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [
    key,
    Number(variant.penalties?.[key])
  ]));
  const invariant = variant.invariants || {};
  const geometryValid = c1.valid === true
    && c2.valid === true
    && Math.abs(Number(c1.ratio) - Number(c2.ratio)) <= 1e-12;
  const productionInvariantValid = variant.valid === true
    && Math.abs(Number(invariant.exchangeEnergyGap)) <= 1e-9
    && Math.abs(Number(invariant.derivedScoringKcalGap)) <= 1e-9
    && Math.abs(Number(invariant.proteinGap)) <= 1e-9
    && invariant.syntheticMealClosureValid === true
    && invariant.targetAuthorityValid === true
    && invariant.targetAuthoritySource === "frozen_goal_snapshot"
    && invariant.trainingContext === day.trainingContext;
  const policyEnvelopeValid = productionInvariantValid && invariant.policyEnvelopeValid !== false;
  const observedSupportValid = !!supportRange
    && Number(variant.ratios?.carb) >= supportRange.carbMin - 1e-12
    && Number(variant.ratios?.carb) <= supportRange.carbMax + 1e-12
    && Number(variant.ratios?.fat) >= supportRange.fatMin - 1e-12
    && Number(variant.ratios?.fat) <= supportRange.fatMax + 1e-12;
  const exactAnchorVector = counterfactualVectorsExactlyEqual(nonJointPenaltyVector, day.nonJointPenaltyVector);
  return {
    ...variant,
    sampleId: `${day.sampleId}::${variant.variantKey}`,
    anchorSampleId: day.sampleId,
    goal: day.goal,
    trainingContext: day.trainingContext,
    sourceValidityKey: day.sourceValidityKey,
    nonJointPenaltyVector,
    geometryValid,
    productionInvariantValid,
    policyEnvelopeValid,
    observedSupportValid,
    exactAnchorVector,
    variantCoreZero: isCounterfactualCoreZero(nonJointPenaltyVector),
    optionC: {
      valid: geometryValid,
      direction: c1.direction,
      residual: c1.valid ? round(c1.ratio, 12) : null,
      residualMagnitude: getResidualMagnitudeBand(c1.ratio)
    }
  };
}

function getCounterfactualPairDistance(pair){
  return Math.max(
    Math.abs(Number(pair.left.exchangeKcal) || 0),
    Math.abs(Number(pair.right.exchangeKcal) || 0)
  );
}

function buildCounterfactualAttritionAnchorProfile(day, grid, supportRange){
  const rawVariants = grid === "normalized"
    ? (day.counterfactualFamily?.normalizedVariants || [])
    : (day.counterfactualFamily?.variants || []);
  const variants = rawVariants.map(variant => materializeCounterfactualAttritionVariant(day, variant, supportRange));
  const pairsByRole = Object.fromEntries(COUNTERFACTUAL_ATTRITION_ROLES.map(role => [role, []]));
  for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variants.length; rightIndex += 1) {
      const left = variants[leftIndex];
      const right = variants[rightIndex];
      if (!left.geometryValid || !right.geometryValid) continue;
      const role = getCounterfactualPairRole(left, right);
      if (!role) continue;
      const pair = {
        left,
        right,
        pairKey: [left.variantKey, right.variantKey].sort(compareCanonicalId).join("|"),
        maximumAxisDelta: 0,
        hiddenComparisonRole: role,
        gates: {
          observedSupport: left.observedSupportValid && right.observedSupportValid,
          policyEnvelope: left.policyEnvelopeValid && right.policyEnvelopeValid,
          pairNonJointExact: counterfactualVectorsExactlyEqual(
            left.nonJointPenaltyVector,
            right.nonJointPenaltyVector
          ),
          anchorVectorExact: left.exactAnchorVector && right.exactAnchorVector,
          variantCoreZero: left.variantCoreZero && right.variantCoreZero
        }
      };
      pair.displayContract = getActualPairDisplayContract(pair);
      pair.offsetDisplayContract = getActualPairDisplayContract(pair, 2.5);
      pairsByRole[role].push(pair);
    }
  }
  Object.values(pairsByRole).forEach(pairs => pairs.sort((a, b) => (
    getCounterfactualPairDistance(a) - getCounterfactualPairDistance(b)
    || getCounterfactualSelectionKey(`${day.sampleId}|${a.pairKey}`).localeCompare(
      getCounterfactualSelectionKey(`${day.sampleId}|${b.pairKey}`)
    )
  )));
  return {
    day,
    grid,
    anchorCoreZero: isCounterfactualCoreZero(day.nonJointPenaltyVector),
    variants,
    pairsByRole
  };
}

function pairPassesCounterfactualAttritionLane(pair, profile, lane){
  if (lane.support === "observed" && !pair.gates.observedSupport) return false;
  if (lane.support === "policy" && !pair.gates.policyEnvelope) return false;
  if (!pair.gates.policyEnvelope || !pair.gates.pairNonJointExact) return false;
  if (lane.anchorVector === "exact" && !pair.gates.anchorVectorExact) return false;
  if (lane.core === "strict_zero" && (!profile.anchorCoreZero || !pair.gates.variantCoreZero)) return false;
  return pair.displayContract.judgeable === true && pair.offsetDisplayContract.judgeable === true;
}

function selectCapabilityFirstCounterfactualBlocks(cases){
  const casesByStratum = new Map();
  cases.forEach(item => {
    const list = casesByStratum.get(item.stratumKey) || [];
    list.push(item);
    casesByStratum.set(item.stratumKey, list);
  });
  const blockCandidatesByDirection = {
    contrast_carb_heavy: [],
    contrast_fat_heavy: []
  };
  for (const [stratumKey, stratumCases] of casesByStratum) {
    const controls = stratumCases.filter(item => item.assignedRole === "null_control");
    for (const direction of ["contrast_carb_heavy", "contrast_fat_heavy"]) {
      const contrasts = stratumCases.filter(item => item.assignedRole === direction);
      controls.forEach(control => contrasts.forEach(contrast => {
        if (control.anchorSampleId === contrast.anchorSampleId) return;
        const blockKey = `${stratumKey}|${control.anchorSampleId}|${contrast.anchorSampleId}`;
        let hasCompatiblePairSelection = false;
        for (const controlPair of control.pairOptions) {
          for (const contrastPair of contrast.pairOptions) {
            if (controlPair.displayContract.visibleSignature === contrastPair.displayContract.visibleSignature) continue;
            hasCompatiblePairSelection = true;
            break;
          }
          if (hasCompatiblePairSelection) break;
        }
        if (!hasCompatiblePairSelection) return;
        blockCandidatesByDirection[direction].push({
          blockKey,
          stratumKey,
          publicContextKey: control.publicContextKey,
          control,
          contrast
        });
      }));
    }
  }
  Object.values(blockCandidatesByDirection).forEach(blocks => blocks.sort((a, b) => (
    getCounterfactualSelectionKey(a.blockKey).localeCompare(getCounterfactualSelectionKey(b.blockKey))
  )));
  const schedule = [
    "contrast_carb_heavy",
    "contrast_fat_heavy",
    "contrast_carb_heavy",
    "contrast_fat_heavy",
    "contrast_carb_heavy",
    "contrast_fat_heavy"
  ];
  const failedSearchStates = new Set();
  const search = (
    scheduleIndex = 0,
    selected = [],
    usedAnchors = new Set(),
    usedVisibleSignatures = new Set(),
    contextCounts = new Map()
  ) => {
    if (scheduleIndex === schedule.length) return contextCounts.size >= 2 ? selected : null;
    const stateKey = [
      scheduleIndex,
      [...usedAnchors].sort(compareCanonicalId).join(","),
      [...usedVisibleSignatures].sort(compareCanonicalId).join(","),
      [...contextCounts.entries()].sort((a, b) => compareCanonicalId(a[0], b[0])).map(([key, count]) => `${key}:${count}`).join(",")
    ].join("|");
    if (failedSearchStates.has(stateKey)) return null;
    const direction = schedule[scheduleIndex];
    const candidates = blockCandidatesByDirection[direction]
      .filter(candidate => !usedAnchors.has(candidate.control.anchorSampleId)
        && !usedAnchors.has(candidate.contrast.anchorSampleId))
      .sort((a, b) => (
        (contextCounts.get(a.publicContextKey) || 0) - (contextCounts.get(b.publicContextKey) || 0)
        || getCounterfactualSelectionKey(a.blockKey).localeCompare(getCounterfactualSelectionKey(b.blockKey))
      ));
    for (const candidate of candidates) {
      const triedVisibleSignaturePairs = new Set();
      for (const controlPair of candidate.control.pairOptions) {
        const controlSignature = controlPair.displayContract.visibleSignature;
        if (usedVisibleSignatures.has(controlSignature)) continue;
        for (const contrastPair of candidate.contrast.pairOptions) {
          const contrastSignature = contrastPair.displayContract.visibleSignature;
          if (controlSignature === contrastSignature || usedVisibleSignatures.has(contrastSignature)) continue;
          const visibleSignaturePair = `${controlSignature}|${contrastSignature}`;
          if (triedVisibleSignaturePairs.has(visibleSignaturePair)) continue;
          triedVisibleSignaturePairs.add(visibleSignaturePair);
          const materializedCandidate = {
            ...candidate,
            control: { ...candidate.control, pair: controlPair },
            contrast: { ...candidate.contrast, pair: contrastPair },
            materializedBlockKey: `${candidate.blockKey}|${controlPair.pairKey}|${contrastPair.pairKey}`
          };
          const nextAnchors = new Set(usedAnchors);
          const nextVisibleSignatures = new Set(usedVisibleSignatures);
          [materializedCandidate.control, materializedCandidate.contrast].forEach(item => {
            nextAnchors.add(item.anchorSampleId);
            nextVisibleSignatures.add(item.pair.displayContract.visibleSignature);
          });
          const nextContextCounts = new Map(contextCounts);
          nextContextCounts.set(
            candidate.publicContextKey,
            (nextContextCounts.get(candidate.publicContextKey) || 0) + 1
          );
          const complete = search(
            scheduleIndex + 1,
            [...selected, materializedCandidate],
            nextAnchors,
            nextVisibleSignatures,
            nextContextCounts
          );
          if (complete) return complete;
        }
      }
    }
    failedSearchStates.add(stateKey);
    return null;
  };
  const enoughDirectionBlocks = schedule.every(direction => blockCandidatesByDirection[direction].length >= 3);
  const selectedBlocks = enoughDirectionBlocks ? (search() || []) : [];
  return { blockCandidatesByDirection, selectedBlocks };
}

function summarizeCounterfactualAttritionLane(lane, profiles, assignedRoleByAnchor){
  const cases = [];
  profiles.forEach(profile => {
    COUNTERFACTUAL_ATTRITION_ROLES.forEach(role => {
      const pairOptions = profile.pairsByRole[role].filter(pair => (
        pairPassesCounterfactualAttritionLane(pair, profile, lane)
      ));
      if (!pairOptions.length) return;
      cases.push({
        anchorSampleId: profile.day.sampleId,
        stratumKey: `${profile.day.goal}|${profile.day.trainingContext}|${profile.day.sourceValidityKey}`,
        publicContextKey: `${profile.day.goal}|${profile.day.trainingContext}`,
        assignedRole: role,
        pairOptions
      });
    });
  });
  const capabilityCounts = Object.fromEntries(COUNTERFACTUAL_ATTRITION_ROLES.map(role => [
    role,
    new Set(cases.filter(item => item.assignedRole === role).map(item => item.anchorSampleId)).size
  ]));
  const assignedRoleMismatchCount = profiles.filter(profile => {
    const assignedRole = assignedRoleByAnchor.get(profile.day.sampleId);
    return assignedRole && !cases.some(item => (
      item.anchorSampleId === profile.day.sampleId && item.assignedRole === assignedRole
    ));
  }).length;
  const { blockCandidatesByDirection, selectedBlocks } = selectCapabilityFirstCounterfactualBlocks(cases);
  const selectedCases = selectedBlocks.flatMap(block => [block.control, block.contrast]);
  const selectedPublicContexts = new Set(selectedBlocks.map(block => block.publicContextKey));
  const selectedRoleCounts = countBy(selectedCases, item => item.assignedRole);
  const packetReady = selectedBlocks.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS
    && selectedCases.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS * 2
    && (selectedRoleCounts.null_control || 0) === 6
    && (selectedRoleCounts.contrast_carb_heavy || 0) === 3
    && (selectedRoleCounts.contrast_fat_heavy || 0) === 3
    && selectedPublicContexts.size >= 2;
  const hasCarb = blockCandidatesByDirection.contrast_carb_heavy.length > 0;
  const hasFat = blockCandidatesByDirection.contrast_fat_heavy.length > 0;
  const structuralOutcome = hasCarb && hasFat
    ? "TWO_SIDED_RESIDUAL_CANDIDATE"
    : (hasCarb
      ? "ONE_SIDED_CARB_RESIDUAL_CANDIDATE"
      : (hasFat ? "ONE_SIDED_FAT_RESIDUAL_CANDIDATE" : "EVIDENCE_STILL_INSUFFICIENT"));
  const contrastAnchorsWithoutControl = Object.fromEntries([
    "contrast_carb_heavy",
    "contrast_fat_heavy"
  ].map(direction => {
    const anchors = new Set(cases.filter(item => item.assignedRole === direction).map(item => item.anchorSampleId));
    const matched = new Set(blockCandidatesByDirection[direction].map(item => item.contrast.anchorSampleId));
    return [direction, [...anchors].filter(anchor => !matched.has(anchor)).length];
  }));
  return {
    lane,
    capabilityCounts,
    assignedRoleMismatchCount,
    blockCandidateCounts: Object.fromEntries(Object.entries(blockCandidatesByDirection).map(([key, value]) => [key, value.length])),
    contrastAnchorsWithoutControl,
    selectedBalancedBlockCount: selectedBlocks.length,
    selectedPublicContextCount: selectedPublicContexts.size,
    packetReady,
    structuralOutcome,
    cases,
    selectedBlocks,
    selectedCases,
    selectedPublicContexts: [...selectedPublicContexts].sort(compareCanonicalId),
    selectedRoleCounts
  };
}

function summarizeCounterfactualAttritionWaterfall(profiles, supportKind){
  const roleSummary = {};
  COUNTERFACTUAL_ATTRITION_ROLES.forEach(role => {
    const total = profiles.length;
    const anchorCoreZeroPass = profiles.filter(profile => profile.anchorCoreZero).length;
    const directionReachable = profiles.filter(profile => profile.pairsByRole[role].length > 0).length;
    const gate = supportKind === "observed" ? "observedSupport" : "policyEnvelope";
    const supportPass = profiles.filter(profile => profile.pairsByRole[role].some(pair => pair.gates[gate])).length;
    const supportAndPolicyPass = profiles.filter(profile => profile.pairsByRole[role].some(pair => (
      pair.gates[gate] && pair.gates.policyEnvelope
    ))).length;
    const pairExactPass = profiles.filter(profile => profile.pairsByRole[role].some(pair => (
      pair.gates[gate] && pair.gates.policyEnvelope && pair.gates.pairNonJointExact
    ))).length;
    const anchorVectorExactPass = profiles.filter(profile => profile.pairsByRole[role].some(pair => (
      pair.gates[gate]
      && pair.gates.policyEnvelope
      && pair.gates.pairNonJointExact
      && pair.gates.anchorVectorExact
    ))).length;
    const variantCoreZeroPass = profiles.filter(profile => profile.anchorCoreZero && profile.pairsByRole[role].some(pair => (
      pair.gates[gate]
      && pair.gates.policyEnvelope
      && pair.gates.pairNonJointExact
      && pair.gates.anchorVectorExact
      && pair.gates.variantCoreZero
    ))).length;
    const displayFivePass = profiles.filter(profile => profile.anchorCoreZero && profile.pairsByRole[role].some(pair => (
      pair.gates[gate]
      && pair.gates.policyEnvelope
      && pair.gates.pairNonJointExact
      && pair.gates.anchorVectorExact
      && pair.gates.variantCoreZero
      && pair.displayContract.judgeable
    ))).length;
    const displayOffsetPass = profiles.filter(profile => profile.anchorCoreZero && profile.pairsByRole[role].some(pair => (
      pair.gates[gate]
      && pair.gates.policyEnvelope
      && pair.gates.pairNonJointExact
      && pair.gates.anchorVectorExact
      && pair.gates.variantCoreZero
      && pair.displayContract.judgeable
      && pair.offsetDisplayContract.judgeable
    ))).length;
    roleSummary[role] = {
      totalAnchors: total,
      anchorCoreZeroPass,
      anchorCoreZeroReject: total - anchorCoreZeroPass,
      directionReachable,
      directionUnreachable: total - directionReachable,
      supportPass,
      supportRejectAfterDirection: Math.max(0, directionReachable - supportPass),
      policyEnvelopePassAfterSupport: supportAndPolicyPass,
      policyEnvelopeRejectAfterSupport: Math.max(0, supportPass - supportAndPolicyPass),
      pairNonJointExactPass: pairExactPass,
      pairNonJointExactReject: Math.max(0, supportAndPolicyPass - pairExactPass),
      anchorVectorExactPass,
      anchorVectorExactReject: Math.max(0, pairExactPass - anchorVectorExactPass),
      strictVariantCoreZeroPass: variantCoreZeroPass,
      strictVariantCoreZeroReject: Math.max(0, anchorVectorExactPass - variantCoreZeroPass),
      displayFivePointPass: displayFivePass,
      displayFivePointReject: Math.max(0, variantCoreZeroPass - displayFivePass),
      displayOffsetTwoPointFivePass: displayOffsetPass,
      displayOffsetTwoPointFiveReject: Math.max(0, displayFivePass - displayOffsetPass)
    };
  });
  return roleSummary;
}

function buildCounterfactualAttritionFalsification(days, baselineEvidence){
  const anchors = days
    .filter(day => day.included && day.optionC?.valid && day.nonJointPenaltyVector && day.counterfactualFamily?.valid)
    .sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId));
  const supportRanges = buildCounterfactualSupportRanges(anchors);
  const assignedRoleByAnchor = new Map((baselineEvidence?.assigned || []).map(item => [
    item.day.sampleId,
    item.assignedRole
  ]));
  const profilesByGrid = {
    fixed: anchors.map(day => buildCounterfactualAttritionAnchorProfile(
      day,
      "fixed",
      supportRanges.get(`${day.goal}|${day.trainingContext}`)
    )),
    normalized: anchors.map(day => buildCounterfactualAttritionAnchorProfile(
      day,
      "normalized",
      supportRanges.get(`${day.goal}|${day.trainingContext}`)
    ))
  };
  const laneResults = COUNTERFACTUAL_ATTRITION_LANES.map(lane => summarizeCounterfactualAttritionLane(
    lane,
    profilesByGrid[lane.grid],
    assignedRoleByAnchor
  ));
  const recoveredLane = laneResults.find(result => result.packetReady)
    || laneResults.find(result => result.structuralOutcome === "TWO_SIDED_RESIDUAL_CANDIDATE")
    || laneResults.find(result => result.structuralOutcome.startsWith("ONE_SIDED_"))
    || null;
  const baselineReady = baselineEvidence?.reviewForUser === true;
  const residualDirectionCandidate = recoveredLane?.structuralOutcome || "EVIDENCE_STILL_INSUFFICIENT";
  const finalOutcome = !baselineReady && recoveredLane?.packetReady
    ? "METHOD_BLOCKED_AND_RECOVERED"
    : residualDirectionCandidate;
  return {
    schemaVersion: "counterfactual_attrition_falsification_v1",
    anchors,
    supportRanges,
    profilesByGrid,
    baselineReady,
    historicalBaselineOutcome: baselineEvidence?.preJudgmentStatus || null,
    predeclaredNormalizedGridFractions: [...ACTUAL_COUNTERFACTUAL_NORMALIZED_GRID_FRACTIONS],
    waterfall: {
      fixedObserved: summarizeCounterfactualAttritionWaterfall(profilesByGrid.fixed, "observed"),
      fixedPolicy: summarizeCounterfactualAttritionWaterfall(profilesByGrid.fixed, "policy"),
      normalizedObserved: summarizeCounterfactualAttritionWaterfall(profilesByGrid.normalized, "observed"),
      normalizedPolicy: summarizeCounterfactualAttritionWaterfall(profilesByGrid.normalized, "policy")
    },
    laneResults,
    recoveredLaneId: recoveredLane?.lane.id || null,
    residualDirectionCandidate,
    finalOutcome,
    policyDecisionAuthorized: false,
    coefficientSelectionAuthorized: false,
    prevalenceInferenceAuthorized: false
  };
}

const COUNTERFACTUAL_JUDGMENT_CHOICES = Object.freeze([
  "case_a_better",
  "case_b_better",
  "no_meaningful_difference",
  "cannot_tell"
]);
const COUNTERFACTUAL_JUDGMENT_CONFIRMATION_STATUSES = Object.freeze([
  "awaiting_user_confirmation",
  "user_confirmed"
]);
const COUNTERFACTUAL_MEANING_RULE_VERSION = "v8.4_joint_product_meaning_preregistered_v1";
const COUNTERFACTUAL_MEANING_OUTCOMES = Object.freeze([
  "TWO_SIDED_PRODUCT_MEANING_CANDIDATE",
  "ONE_SIDED_CARB_PRODUCT_MEANING_CANDIDATE",
  "ONE_SIDED_FAT_PRODUCT_MEANING_CANDIDATE",
  "JOINT_REDUNDANT_CANDIDATE",
  "JUDGMENT_INSUFFICIENT"
]);

function buildActualAnchoredCounterfactualBlindArtifacts(evidence){
  const selected = [...evidence.selectedCases].sort((a, b) => (
    getCounterfactualSelectionKey(`${a.anchorSampleId}|${a.pair.pairKey}`).localeCompare(
      getCounterfactualSelectionKey(`${b.anchorSampleId}|${b.pair.pairKey}`)
    )
  ));
  const contrastOutsideCaseA = new Map(
    selected
      .filter(item => item.assignedRole !== "null_control")
      .sort((a, b) => getCounterfactualSelectionKey(`${a.anchorSampleId}|${a.pair.pairKey}|contrast-side`)
        .localeCompare(getCounterfactualSelectionKey(`${b.anchorSampleId}|${b.pair.pairKey}|contrast-side`)))
      .map((item, index) => [`${item.anchorSampleId}|${item.pair.pairKey}`, index % 2 === 0])
  );
  const reviewPacket = [];
  const revealMap = [];
  selected.forEach((item, index) => {
    const caseId = `counterfactual_blind_case_${String(index + 1).padStart(3, "0")}`;
    const canonical = [item.pair.left, item.pair.right]
      .sort((a, b) => compareCanonicalId(a.variantKey, b.variantKey))
      .map((scenario, sourceIndex) => ({ scenario, scenarioSide: `scenario_${sourceIndex + 1}` }));
    const allocationKey = `${item.anchorSampleId}|${item.pair.pairKey}`;
    const outsideCanonicalIndex = canonical.findIndex(({ scenario }) => scenario.optionC.direction !== "inside");
    const desiredOutsideCaseA = contrastOutsideCaseA.get(allocationKey);
    const shouldSwap = typeof desiredOutsideCaseA === "boolean"
      ? (desiredOutsideCaseA ? outsideCanonicalIndex === 1 : outsideCanonicalIndex === 0)
      : getCounterfactualSideSwap(allocationKey);
    const randomized = shouldSwap
      ? [canonical[1], canonical[0]]
      : canonical;
    const sanitizeReviewSide = ({ scenario }) => ({
      targetRatioBands: {
        carb: getActualRatioBand(scenario.ratios.carb),
        fat: getActualRatioBand(scenario.ratios.fat)
      }
    });
    const sanitizeRevealSide = ({ scenario, scenarioSide }) => ({
      scenarioSide,
      allocationOrigin: "generated_counterfactual",
      targetRatioBands: {
        carb: getActualRatioBand(scenario.ratios.carb),
        fat: getActualRatioBand(scenario.ratios.fat)
      },
      geometryPosition: scenario.optionC.direction === "inside" ? "inside" : "outside",
      residualDirection: scenario.optionC.direction,
      residualMagnitude: scenario.optionC.residualMagnitude
    });
    reviewPacket.push({
      caseId,
      context: {
        goal: item.pair.left.goal,
        trainingContext: item.pair.left.trainingContext
      },
      commonTargetRatioBands: {
        energy: getActualRatioBand(item.pair.left.ratios.energy),
        protein: getActualRatioBand(item.pair.left.ratios.protein)
      },
      nonJointContract: {
        productionAxisCount: productionNonJointPenaltyAxes.length,
        axesMatched: true,
        currentJointAxisExcluded: true
      },
      caseA: sanitizeReviewSide(randomized[0]),
      caseB: sanitizeReviewSide(randomized[1]),
      judgmentOptions: [...COUNTERFACTUAL_JUDGMENT_CHOICES]
    });
    revealMap.push({
      caseId,
      hiddenComparisonRole: item.assignedRole,
      caseA: sanitizeRevealSide(randomized[0]),
      caseB: sanitizeRevealSide(randomized[1])
    });
  });
  const reviewBody = {
    schemaVersion: "actual_context_counterfactual_product_meaning_review_v1",
    evidenceKind: "controlled_counterfactual_not_observed_prevalence",
    randomizationSeedVersion: ACTUAL_COUNTERFACTUAL_SEED_VERSION,
    preJudgmentStatus: evidence.preJudgmentStatus,
    reviewForUser: evidence.reviewForUser,
    evidenceBoundary: {
      observedOccurrenceOutcomePreserved: "ACTUAL_EVIDENCE_INSUFFICIENT",
      actualPrevalenceInferenceAuthorized: false,
      policyDecisionAuthorized: false,
      coefficientSelectionAuthorized: false
    },
    selectionContract: {
      scenarioBasis: "actual_context_generated_macro_totals",
      observedDayPair: false,
      absoluteIntakeValuesShown: false,
      foodOrMealReconstructionClaimed: false,
      sampleReuseAllowed: false,
      visibleCaseDuplicationAllowed: false,
      targetRatioBandWidthPercentagePoints: 5,
      reviewScope: "limited_product_meaning_only",
      exchangeContract: "isoenergetic_carb_fat_exchange",
      nonJointProductionAxesExact: true
    },
    reviewPacket
  };
  const reviewPacketHash = crypto.createHash("sha256").update(JSON.stringify(reviewBody)).digest("hex");
  const reviewArtifact = { ...reviewBody, reviewPacketHash };
  const revealBody = {
    schemaVersion: "actual_context_counterfactual_product_meaning_reveal_v1",
    reviewPacketHash,
    revealOnlyAfterJudgment: true,
    revealMap
  };
  const revealMapHash = crypto.createHash("sha256").update(JSON.stringify(revealBody)).digest("hex");
  return { reviewArtifact, revealArtifact: { ...revealBody, revealMapHash } };
}

function isStrictCounterfactualRatioBand(value){
  const match = typeof value === "string" ? value.match(/^(\d+)_to_lt_(\d+)_pct_of_target$/) : null;
  if (!match) return false;
  const lower = Number(match[1]);
  const upper = Number(match[2]);
  return Number.isInteger(lower) && lower >= 0 && lower <= 300 && lower % 5 === 0 && upper === lower + 5;
}

function isActualAnchoredCounterfactualReviewArtifactSafe(artifact){
  if (!hasExactObjectKeys(artifact, [
    "schemaVersion", "evidenceKind", "randomizationSeedVersion", "preJudgmentStatus", "reviewForUser",
    "evidenceBoundary", "selectionContract", "reviewPacket", "reviewPacketHash"
  ])) return false;
  if (artifact.schemaVersion !== "actual_context_counterfactual_product_meaning_review_v1"
      || artifact.evidenceKind !== "controlled_counterfactual_not_observed_prevalence"
      || artifact.randomizationSeedVersion !== ACTUAL_COUNTERFACTUAL_SEED_VERSION
      || !/^[a-f0-9]{64}$/.test(artifact.reviewPacketHash || "")) return false;
  const { reviewPacketHash, ...body } = artifact;
  if (crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex") !== reviewPacketHash) return false;
  const ready = artifact.preJudgmentStatus === "READY_FOR_COUNTERFACTUAL_BLIND_JUDGMENT";
  if (!Array.isArray(artifact.reviewPacket)) return false;
  if (!["READY_FOR_COUNTERFACTUAL_BLIND_JUDGMENT", "COUNTERFACTUAL_PACKET_INSUFFICIENT"].includes(artifact.preJudgmentStatus)
      || artifact.reviewForUser !== ready
      || artifact.reviewPacket.length !== (ready ? 12 : 0)) return false;
  if (!hasExactObjectKeys(artifact.evidenceBoundary, [
    "observedOccurrenceOutcomePreserved", "actualPrevalenceInferenceAuthorized", "policyDecisionAuthorized", "coefficientSelectionAuthorized"
  ])
      || artifact.evidenceBoundary.observedOccurrenceOutcomePreserved !== "ACTUAL_EVIDENCE_INSUFFICIENT"
      || artifact.evidenceBoundary.actualPrevalenceInferenceAuthorized !== false
      || artifact.evidenceBoundary.policyDecisionAuthorized !== false
      || artifact.evidenceBoundary.coefficientSelectionAuthorized !== false) return false;
  if (!hasExactObjectKeys(artifact.selectionContract, [
    "scenarioBasis", "observedDayPair", "absoluteIntakeValuesShown", "foodOrMealReconstructionClaimed",
    "sampleReuseAllowed", "visibleCaseDuplicationAllowed", "targetRatioBandWidthPercentagePoints", "reviewScope",
    "exchangeContract", "nonJointProductionAxesExact"
  ])
      || artifact.selectionContract.scenarioBasis !== "actual_context_generated_macro_totals"
      || artifact.selectionContract.observedDayPair !== false
      || artifact.selectionContract.absoluteIntakeValuesShown !== false
      || artifact.selectionContract.foodOrMealReconstructionClaimed !== false
      || artifact.selectionContract.sampleReuseAllowed !== false
      || artifact.selectionContract.visibleCaseDuplicationAllowed !== false
      || artifact.selectionContract.targetRatioBandWidthPercentagePoints !== 5
      || artifact.selectionContract.reviewScope !== "limited_product_meaning_only"
      || artifact.selectionContract.exchangeContract !== "isoenergetic_carb_fat_exchange"
      || artifact.selectionContract.nonJointProductionAxesExact !== true) return false;
  const goals = ACTUAL_AUDIT_GOALS;
  const contexts = new Set(["rest", "normal_resistance", "high_volume_or_long_session"]);
  const options = [...COUNTERFACTUAL_JUDGMENT_CHOICES];
  const structural = artifact.reviewPacket.every((item, index) => (
    hasExactObjectKeys(item, ["caseId", "context", "commonTargetRatioBands", "nonJointContract", "caseA", "caseB", "judgmentOptions"])
    && item.caseId === `counterfactual_blind_case_${String(index + 1).padStart(3, "0")}`
    && hasExactObjectKeys(item.context, ["goal", "trainingContext"])
    && goals.has(item.context.goal)
    && contexts.has(item.context.trainingContext)
    && hasExactObjectKeys(item.commonTargetRatioBands, ["energy", "protein"])
    && Object.values(item.commonTargetRatioBands).every(isStrictCounterfactualRatioBand)
    && hasExactObjectKeys(item.nonJointContract, ["productionAxisCount", "axesMatched", "currentJointAxisExcluded"])
    && item.nonJointContract.productionAxisCount === productionNonJointPenaltyAxes.length
    && item.nonJointContract.axesMatched === true
    && item.nonJointContract.currentJointAxisExcluded === true
    && [item.caseA, item.caseB].every(side => (
      hasExactObjectKeys(side, ["targetRatioBands"])
      && hasExactObjectKeys(side.targetRatioBands, ["carb", "fat"])
      && Object.values(side.targetRatioBands).every(isStrictCounterfactualRatioBand)
    ))
    && item.caseA.targetRatioBands.carb !== item.caseB.targetRatioBands.carb
    && item.caseA.targetRatioBands.fat !== item.caseB.targetRatioBands.fat
    && JSON.stringify(item.judgmentOptions) === JSON.stringify(options)
  ));
  const forbidden = /(residual|direction|magnitude|inside|outside|optionC|currentScore|finalScore|rawScore|jointPenalty|candidatePenalty|sampleId|anchorId|date|foodName|mealId|memo|absoluteG|absoluteKcal|backupPath|backupHash|scenario_[12])/i;
  return structural && !forbidden.test(JSON.stringify(artifact));
}

function isActualAnchoredCounterfactualRevealArtifactSafe(artifact){
  if (!hasExactObjectKeys(artifact, ["schemaVersion", "reviewPacketHash", "revealOnlyAfterJudgment", "revealMap", "revealMapHash"])) return false;
  if (artifact.schemaVersion !== "actual_context_counterfactual_product_meaning_reveal_v1"
      || artifact.revealOnlyAfterJudgment !== true
      || !/^[a-f0-9]{64}$/.test(artifact.reviewPacketHash || "")
      || !/^[a-f0-9]{64}$/.test(artifact.revealMapHash || "")) return false;
  const { revealMapHash, ...body } = artifact;
  if (crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex") !== revealMapHash) return false;
  if (!Array.isArray(artifact.revealMap) || ![0, 12].includes(artifact.revealMap.length)) return false;
  const roles = new Set(["null_control", "contrast_carb_heavy", "contrast_fat_heavy"]);
  const structural = artifact.revealMap.every((item, index) => (
    hasExactObjectKeys(item, ["caseId", "hiddenComparisonRole", "caseA", "caseB"])
    && item.caseId === `counterfactual_blind_case_${String(index + 1).padStart(3, "0")}`
    && roles.has(item.hiddenComparisonRole)
    && [item.caseA, item.caseB].every(side => (
      hasExactObjectKeys(side, ["scenarioSide", "allocationOrigin", "targetRatioBands", "geometryPosition", "residualDirection", "residualMagnitude"])
      && ["scenario_1", "scenario_2"].includes(side.scenarioSide)
      && side.allocationOrigin === "generated_counterfactual"
      && hasExactObjectKeys(side.targetRatioBands, ["carb", "fat"])
      && Object.values(side.targetRatioBands).every(isStrictCounterfactualRatioBand)
      && ["inside", "outside"].includes(side.geometryPosition)
      && ["inside", "carb_heavy", "fat_heavy"].includes(side.residualDirection)
      && ["none", "small", "moderate", "large"].includes(side.residualMagnitude)
    ))
    && item.caseA.scenarioSide !== item.caseB.scenarioSide
    && (() => {
      const sides = [item.caseA, item.caseB];
      const isInside = side => side.geometryPosition === "inside"
        && side.residualDirection === "inside"
        && side.residualMagnitude === "none";
      const expectedOutsideDirection = item.hiddenComparisonRole === "contrast_carb_heavy"
        ? "carb_heavy"
        : "fat_heavy";
      if (item.hiddenComparisonRole === "null_control") return sides.every(isInside);
      return sides.filter(isInside).length === 1
        && sides.filter(side => side.geometryPosition === "outside"
          && side.residualDirection === expectedOutsideDirection
          && side.residualMagnitude !== "none").length === 1;
    })()
  ));
  return structural && !/(currentScore|finalScore|rawScore|jointPenalty|candidatePenalty|sampleId|anchorId|date|foodName|mealId|memo|absoluteG|absoluteKcal|backupPath|backupHash)/i.test(JSON.stringify(artifact));
}

function assertActualAnchoredCounterfactualBundleSafe(bundle){
  if (!isActualAnchoredCounterfactualReviewArtifactSafe(bundle?.reviewArtifact)) {
    throw new Error("generated counterfactual review artifact failed the exact privacy allowlist");
  }
  if (!isActualAnchoredCounterfactualRevealArtifactSafe(bundle?.revealArtifact)) {
    throw new Error("generated counterfactual reveal artifact failed the exact reveal allowlist");
  }
  const reviewIds = bundle.reviewArtifact.reviewPacket.map(item => item.caseId);
  const revealIds = bundle.revealArtifact.revealMap.map(item => item.caseId);
  if (bundle.revealArtifact.reviewPacketHash !== bundle.reviewArtifact.reviewPacketHash
      || JSON.stringify(reviewIds) !== JSON.stringify(revealIds)) {
    throw new Error("counterfactual review and reveal artifacts are not hash/case linked");
  }
  const sideBindingValid = bundle.reviewArtifact.reviewPacket.every((reviewCase, index) => {
    const revealCase = bundle.revealArtifact.revealMap[index];
    return JSON.stringify(reviewCase.caseA.targetRatioBands) === JSON.stringify(revealCase?.caseA.targetRatioBands)
      && JSON.stringify(reviewCase.caseB.targetRatioBands) === JSON.stringify(revealCase?.caseB.targetRatioBands);
  });
  if (!sideBindingValid) {
    throw new Error("counterfactual review A/B sides are not bound to the same reveal scenarios");
  }
  if (reviewIds.length === 12) {
    const roleCounts = countBy(bundle.revealArtifact.revealMap, item => item.hiddenComparisonRole);
    const contrastCases = bundle.revealArtifact.revealMap.filter(item => item.hiddenComparisonRole !== "null_control");
    const outsideCaseACount = contrastCases.filter(item => item.caseA.geometryPosition === "outside").length;
    if (roleCounts.null_control !== 6
        || roleCounts.contrast_carb_heavy !== 3
        || roleCounts.contrast_fat_heavy !== 3
        || outsideCaseACount !== 3) {
      throw new Error("counterfactual reveal roles or A/B outside positions are not balanced");
    }
  }
  return true;
}

function assertLockedCounterfactualReviewMatchesGenerated(locked, generated){
  if (!isActualAnchoredCounterfactualReviewArtifactSafe(locked)) {
    throw new Error("locked counterfactual review artifact failed privacy/hash validation");
  }
  if (JSON.stringify(locked) !== JSON.stringify(generated)) {
    throw new Error("locked counterfactual review artifact does not match the current backup/input");
  }
  return true;
}

function normalizeCounterfactualJudgments(reviewArtifact, judgments){
  if (!isActualAnchoredCounterfactualReviewArtifactSafe(reviewArtifact)
      || reviewArtifact.reviewForUser !== true
      || reviewArtifact.reviewPacket.length !== 12) {
    throw new Error("counterfactual judgment requires a locked review-ready 12-case packet");
  }
  if (!Array.isArray(judgments) || judgments.length !== reviewArtifact.reviewPacket.length) {
    throw new Error("counterfactual judgment must contain exactly 12 choices");
  }
  const byCaseId = new Map();
  for (const judgment of judgments) {
    if (!hasExactObjectKeys(judgment, ["caseId", "choice"])
        || typeof judgment.caseId !== "string"
        || !COUNTERFACTUAL_JUDGMENT_CHOICES.includes(judgment.choice)) {
      throw new Error("counterfactual judgment contains an invalid case ID or choice");
    }
    if (byCaseId.has(judgment.caseId)) {
      throw new Error("counterfactual judgment contains a duplicate case ID");
    }
    byCaseId.set(judgment.caseId, judgment.choice);
  }
  const reviewCaseIds = reviewArtifact.reviewPacket.map(item => item.caseId);
  if (byCaseId.size !== reviewCaseIds.length || [...byCaseId.keys()].some(caseId => !reviewCaseIds.includes(caseId))) {
    throw new Error("counterfactual judgment case IDs do not match the locked review");
  }
  return reviewCaseIds.map(caseId => {
    if (!byCaseId.has(caseId)) throw new Error("counterfactual judgment is missing a locked review case");
    return { caseId, choice: byCaseId.get(caseId) };
  });
}

function computeCounterfactualJudgmentSetHash(reviewPacketHash, canonicalJudgments){
  const hashBody = {
    schemaVersion: "counterfactual_blind_judgment_v1",
    reviewPacketHash,
    judgments: canonicalJudgments
  };
  return crypto.createHash("sha256").update(JSON.stringify(hashBody)).digest("hex");
}

function buildCounterfactualJudgmentArtifact(reviewArtifact, judgments, confirmationStatus){
  if (!COUNTERFACTUAL_JUDGMENT_CONFIRMATION_STATUSES.includes(confirmationStatus)) {
    throw new Error("counterfactual judgment confirmation status is invalid");
  }
  const canonicalJudgments = normalizeCounterfactualJudgments(reviewArtifact, judgments);
  return {
    schemaVersion: "counterfactual_blind_judgment_v1",
    reviewPacketHash: reviewArtifact.reviewPacketHash,
    confirmationStatus,
    judgments: canonicalJudgments,
    judgmentSetHash: computeCounterfactualJudgmentSetHash(
      reviewArtifact.reviewPacketHash,
      canonicalJudgments
    )
  };
}

function isCounterfactualJudgmentArtifactSafe(artifact, reviewArtifact){
  try {
    if (!hasExactObjectKeys(artifact, [
      "schemaVersion", "reviewPacketHash", "confirmationStatus", "judgments", "judgmentSetHash"
    ])) return false;
    if (artifact.schemaVersion !== "counterfactual_blind_judgment_v1"
        || artifact.reviewPacketHash !== reviewArtifact?.reviewPacketHash
        || !COUNTERFACTUAL_JUDGMENT_CONFIRMATION_STATUSES.includes(artifact.confirmationStatus)
        || !/^[a-f0-9]{64}$/.test(artifact.judgmentSetHash || "")) return false;
    const canonicalJudgments = normalizeCounterfactualJudgments(reviewArtifact, artifact.judgments);
    if (JSON.stringify(canonicalJudgments) !== JSON.stringify(artifact.judgments)) return false;
    return artifact.judgmentSetHash === computeCounterfactualJudgmentSetHash(
      artifact.reviewPacketHash,
      canonicalJudgments
    );
  } catch {
    return false;
  }
}

function assertCounterfactualJudgmentMatchesReview(artifact, reviewArtifact, options = {}){
  if (!isCounterfactualJudgmentArtifactSafe(artifact, reviewArtifact)) {
    throw new Error("counterfactual judgment artifact failed hash/case/choice validation");
  }
  if (options.requireConfirmed === true && artifact.confirmationStatus !== "user_confirmed") {
    throw new Error("counterfactual reveal requires an explicitly user-confirmed judgment artifact");
  }
  if (options.expectedJudgmentSetHash
      && artifact.judgmentSetHash !== options.expectedJudgmentSetHash) {
    throw new Error("counterfactual judgment changed after the user-confirmed hash was fixed");
  }
  return true;
}

function interpretCounterfactualBlindJudgment(reviewArtifact, revealArtifact, judgmentArtifact){
  assertActualAnchoredCounterfactualBundleSafe({ reviewArtifact, revealArtifact });
  assertCounterfactualJudgmentMatchesReview(judgmentArtifact, reviewArtifact, { requireConfirmed: true });
  const judgmentByCaseId = new Map(judgmentArtifact.judgments.map(item => [item.caseId, item.choice]));
  const control = {
    caseCount: 0,
    directionalChoiceCount: 0,
    noMeaningfulDifferenceCount: 0,
    cannotTellCount: 0
  };
  const makeDirectionSummary = () => ({
    caseCount: 0,
    expectedDirectionCount: 0,
    reverseDirectionCount: 0,
    noMeaningfulDifferenceCount: 0,
    cannotTellCount: 0
  });
  const carbDirection = makeDirectionSummary();
  const fatDirection = makeDirectionSummary();
  let cannotTellCount = 0;
  revealArtifact.revealMap.forEach(revealCase => {
    const choice = judgmentByCaseId.get(revealCase.caseId);
    if (choice === "cannot_tell") cannotTellCount += 1;
    if (revealCase.hiddenComparisonRole === "null_control") {
      control.caseCount += 1;
      if (["case_a_better", "case_b_better"].includes(choice)) control.directionalChoiceCount += 1;
      if (choice === "no_meaningful_difference") control.noMeaningfulDifferenceCount += 1;
      if (choice === "cannot_tell") control.cannotTellCount += 1;
      return;
    }
    const summary = revealCase.hiddenComparisonRole === "contrast_carb_heavy"
      ? carbDirection
      : fatDirection;
    summary.caseCount += 1;
    if (choice === "no_meaningful_difference") {
      summary.noMeaningfulDifferenceCount += 1;
      return;
    }
    if (choice === "cannot_tell") {
      summary.cannotTellCount += 1;
      return;
    }
    const chosenSide = choice === "case_a_better" ? revealCase.caseA : revealCase.caseB;
    if (chosenSide.geometryPosition === "inside") summary.expectedDirectionCount += 1;
    else summary.reverseDirectionCount += 1;
  });
  const ruleThresholds = {
    cannotTellStopAt: 5,
    controlDirectionalStopAt: 2,
    directionSupportAt: 2,
    directionNoDifferenceAt: 2,
    directionReverseConflictAt: 2
  };
  const stopReasons = [];
  if (cannotTellCount >= ruleThresholds.cannotTellStopAt) stopReasons.push("cannot_tell_threshold_reached");
  if (control.directionalChoiceCount >= ruleThresholds.controlDirectionalStopAt) {
    stopReasons.push("control_directional_noise_threshold_reached");
  }
  if (carbDirection.reverseDirectionCount >= ruleThresholds.directionReverseConflictAt) {
    stopReasons.push("carb_reverse_direction_conflict");
  }
  if (fatDirection.reverseDirectionCount >= ruleThresholds.directionReverseConflictAt) {
    stopReasons.push("fat_reverse_direction_conflict");
  }
  const carbSupported = carbDirection.expectedDirectionCount >= ruleThresholds.directionSupportAt;
  const fatSupported = fatDirection.expectedDirectionCount >= ruleThresholds.directionSupportAt;
  const carbNoDifference = carbDirection.noMeaningfulDifferenceCount >= ruleThresholds.directionNoDifferenceAt;
  const fatNoDifference = fatDirection.noMeaningfulDifferenceCount >= ruleThresholds.directionNoDifferenceAt;
  let outcome = "JUDGMENT_INSUFFICIENT";
  if (stopReasons.length === 0) {
    if (carbSupported && fatSupported) outcome = "TWO_SIDED_PRODUCT_MEANING_CANDIDATE";
    else if (carbSupported && fatNoDifference) outcome = "ONE_SIDED_CARB_PRODUCT_MEANING_CANDIDATE";
    else if (fatSupported && carbNoDifference) outcome = "ONE_SIDED_FAT_PRODUCT_MEANING_CANDIDATE";
    else if (carbNoDifference && fatNoDifference) outcome = "JOINT_REDUNDANT_CANDIDATE";
  }
  return {
    outcome,
    ruleThresholds,
    cannotTellCount,
    control,
    carbDirection,
    fatDirection,
    stopReasons
  };
}

function isCounterfactualMeaningDecisionSafe(decision){
  if (!hasExactObjectKeys(decision, [
    "outcome", "ruleThresholds", "cannotTellCount", "control", "carbDirection", "fatDirection", "stopReasons"
  ])) return false;
  if (!COUNTERFACTUAL_MEANING_OUTCOMES.includes(decision.outcome)
      || !Number.isInteger(decision.cannotTellCount)
      || decision.cannotTellCount < 0
      || decision.cannotTellCount > 12) return false;
  if (!hasExactObjectKeys(decision.ruleThresholds, [
    "cannotTellStopAt", "controlDirectionalStopAt", "directionSupportAt",
    "directionNoDifferenceAt", "directionReverseConflictAt"
  ]) || JSON.stringify(decision.ruleThresholds) !== JSON.stringify({
    cannotTellStopAt: 5,
    controlDirectionalStopAt: 2,
    directionSupportAt: 2,
    directionNoDifferenceAt: 2,
    directionReverseConflictAt: 2
  })) return false;
  if (!hasExactObjectKeys(decision.control, [
    "caseCount", "directionalChoiceCount", "noMeaningfulDifferenceCount", "cannotTellCount"
  ]) || decision.control.caseCount !== 6
      || Object.values(decision.control).some(value => !Number.isInteger(value) || value < 0)
      || decision.control.directionalChoiceCount
        + decision.control.noMeaningfulDifferenceCount
        + decision.control.cannotTellCount !== decision.control.caseCount) return false;
  const directionSafe = summary => hasExactObjectKeys(summary, [
    "caseCount", "expectedDirectionCount", "reverseDirectionCount", "noMeaningfulDifferenceCount", "cannotTellCount"
  ]) && summary.caseCount === 3
    && Object.values(summary).every(value => Number.isInteger(value) && value >= 0)
    && summary.expectedDirectionCount
      + summary.reverseDirectionCount
      + summary.noMeaningfulDifferenceCount
      + summary.cannotTellCount === summary.caseCount;
  const allowedStopReasons = new Set([
    "cannot_tell_threshold_reached",
    "control_directional_noise_threshold_reached",
    "carb_reverse_direction_conflict",
    "fat_reverse_direction_conflict"
  ]);
  if (!directionSafe(decision.carbDirection)
      || !directionSafe(decision.fatDirection)
      || decision.cannotTellCount !== decision.control.cannotTellCount
        + decision.carbDirection.cannotTellCount
        + decision.fatDirection.cannotTellCount
      || !Array.isArray(decision.stopReasons)
      || new Set(decision.stopReasons).size !== decision.stopReasons.length
      || !decision.stopReasons.every(reason => allowedStopReasons.has(reason))) return false;
  const expectedStopReasons = [];
  if (decision.cannotTellCount >= decision.ruleThresholds.cannotTellStopAt) {
    expectedStopReasons.push("cannot_tell_threshold_reached");
  }
  if (decision.control.directionalChoiceCount >= decision.ruleThresholds.controlDirectionalStopAt) {
    expectedStopReasons.push("control_directional_noise_threshold_reached");
  }
  if (decision.carbDirection.reverseDirectionCount >= decision.ruleThresholds.directionReverseConflictAt) {
    expectedStopReasons.push("carb_reverse_direction_conflict");
  }
  if (decision.fatDirection.reverseDirectionCount >= decision.ruleThresholds.directionReverseConflictAt) {
    expectedStopReasons.push("fat_reverse_direction_conflict");
  }
  const carbSupported = decision.carbDirection.expectedDirectionCount >= decision.ruleThresholds.directionSupportAt;
  const fatSupported = decision.fatDirection.expectedDirectionCount >= decision.ruleThresholds.directionSupportAt;
  const carbNoDifference = decision.carbDirection.noMeaningfulDifferenceCount
    >= decision.ruleThresholds.directionNoDifferenceAt;
  const fatNoDifference = decision.fatDirection.noMeaningfulDifferenceCount
    >= decision.ruleThresholds.directionNoDifferenceAt;
  let expectedOutcome = "JUDGMENT_INSUFFICIENT";
  if (expectedStopReasons.length === 0) {
    if (carbSupported && fatSupported) expectedOutcome = "TWO_SIDED_PRODUCT_MEANING_CANDIDATE";
    else if (carbSupported && fatNoDifference) expectedOutcome = "ONE_SIDED_CARB_PRODUCT_MEANING_CANDIDATE";
    else if (fatSupported && carbNoDifference) expectedOutcome = "ONE_SIDED_FAT_PRODUCT_MEANING_CANDIDATE";
    else if (carbNoDifference && fatNoDifference) expectedOutcome = "JOINT_REDUNDANT_CANDIDATE";
  }
  return JSON.stringify(decision.stopReasons) === JSON.stringify(expectedStopReasons)
    && decision.outcome === expectedOutcome;
}

function isJudgmentBoundCounterfactualRevealArtifactSafe(artifact){
  if (!hasExactObjectKeys(artifact, [
    "schemaVersion", "reviewPacketHash", "judgmentSetHash", "interpretationRuleVersion",
    "revealOnlyAfterJudgment", "meaningDecision", "revealMap", "revealMapHash"
  ])) return false;
  if (artifact.schemaVersion !== "actual_context_counterfactual_product_meaning_reveal_v2_judgment_bound"
      || !/^[a-f0-9]{64}$/.test(artifact.reviewPacketHash || "")
      || !/^[a-f0-9]{64}$/.test(artifact.judgmentSetHash || "")
      || artifact.interpretationRuleVersion !== COUNTERFACTUAL_MEANING_RULE_VERSION
      || artifact.revealOnlyAfterJudgment !== true
      || !/^[a-f0-9]{64}$/.test(artifact.revealMapHash || "")
      || !isCounterfactualMeaningDecisionSafe(artifact.meaningDecision)) return false;
  const { revealMapHash, ...body } = artifact;
  if (crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex") !== revealMapHash) return false;
  const legacyRevealBody = {
    schemaVersion: "actual_context_counterfactual_product_meaning_reveal_v1",
    reviewPacketHash: artifact.reviewPacketHash,
    revealOnlyAfterJudgment: true,
    revealMap: artifact.revealMap
  };
  const legacyReveal = {
    ...legacyRevealBody,
    revealMapHash: crypto.createHash("sha256").update(JSON.stringify(legacyRevealBody)).digest("hex")
  };
  return isActualAnchoredCounterfactualRevealArtifactSafe(legacyReveal);
}

function buildJudgmentBoundCounterfactualRevealArtifact(reviewArtifact, revealArtifact, judgmentArtifact){
  const meaningDecision = interpretCounterfactualBlindJudgment(
    reviewArtifact,
    revealArtifact,
    judgmentArtifact
  );
  const body = {
    schemaVersion: "actual_context_counterfactual_product_meaning_reveal_v2_judgment_bound",
    reviewPacketHash: reviewArtifact.reviewPacketHash,
    judgmentSetHash: judgmentArtifact.judgmentSetHash,
    interpretationRuleVersion: COUNTERFACTUAL_MEANING_RULE_VERSION,
    revealOnlyAfterJudgment: true,
    meaningDecision,
    revealMap: revealArtifact.revealMap
  };
  const artifact = {
    ...body,
    revealMapHash: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")
  };
  if (!isJudgmentBoundCounterfactualRevealArtifactSafe(artifact)) {
    throw new Error("judgment-bound counterfactual reveal failed structural validation");
  }
  return artifact;
}

async function buildLocalActualAnchoredCounterfactualAudit(backupFilePath){
  const extracted = (await extractAnonymizedActualDays(backupFilePath, { counterfactualRequested: true }))
    .map(addProductionOwnershipToActualDay);
  const included = extracted.filter(day => day.included);
  const excluded = extracted.filter(day => !day.included);
  const evidence = buildActualAnchoredCounterfactualEvidence(included);
  const attrition = buildCounterfactualAttritionFalsification(included, evidence);
  const recoveredLane = attrition.laneResults.find(result => result.lane.id === attrition.recoveredLaneId);
  const artifactEvidence = recoveredLane?.packetReady ? {
    selectedBlocks: recoveredLane.selectedBlocks,
    selectedCases: recoveredLane.selectedCases,
    selectedPublicContexts: recoveredLane.selectedPublicContexts,
    selectedRoleCounts: recoveredLane.selectedRoleCounts,
    reviewForUser: true,
    preJudgmentStatus: "READY_FOR_COUNTERFACTUAL_BLIND_JUDGMENT"
  } : evidence;
  const artifacts = buildActualAnchoredCounterfactualBlindArtifacts(artifactEvidence);
  assertActualAnchoredCounterfactualBundleSafe(artifacts);
  const attritionSummary = {
    schemaVersion: attrition.schemaVersion,
    historicalBaselineOutcome: attrition.historicalBaselineOutcome,
    baselineReady: attrition.baselineReady,
    predeclaredNormalizedGridFractions: attrition.predeclaredNormalizedGridFractions,
    waterfall: attrition.waterfall,
    lanes: attrition.laneResults.map(result => ({
      lane: result.lane,
      capabilityCounts: result.capabilityCounts,
      assignedRoleMismatchCount: result.assignedRoleMismatchCount,
      blockCandidateCounts: result.blockCandidateCounts,
      contrastAnchorsWithoutControl: result.contrastAnchorsWithoutControl,
      selectedBalancedBlockCount: result.selectedBalancedBlockCount,
      selectedPublicContextCount: result.selectedPublicContextCount,
      packetReady: result.packetReady,
      structuralOutcome: result.structuralOutcome
    })),
    recoveredLaneId: attrition.recoveredLaneId,
    residualDirectionCandidate: attrition.residualDirectionCandidate,
    finalOutcome: attrition.finalOutcome,
    policyDecisionAuthorized: attrition.policyDecisionAuthorized,
    coefficientSelectionAuthorized: attrition.coefficientSelectionAuthorized,
    prevalenceInferenceAuthorized: attrition.prevalenceInferenceAuthorized
  };
  const currentSelectedBlocks = recoveredLane?.packetReady ? recoveredLane.selectedBlocks : evidence.selectedBlocks;
  const currentSelectedCases = recoveredLane?.packetReady ? recoveredLane.selectedCases : evidence.selectedCases;
  const currentSelectedPublicContexts = recoveredLane?.packetReady
    ? recoveredLane.selectedPublicContexts
    : evidence.selectedPublicContexts;
  const currentSelectedRoleCounts = recoveredLane?.packetReady
    ? recoveredLane.selectedRoleCounts
    : evidence.selectedRoleCounts;
  const currentReadinessChecks = recoveredLane?.packetReady ? {
    selectedBalancedBlockCount: currentSelectedBlocks.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS,
    selectedCaseCount: currentSelectedCases.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS * 2,
    distinctAnchorCount: new Set(currentSelectedCases.map(item => item.anchorSampleId)).size === currentSelectedCases.length,
    contrastControlBalanced: (currentSelectedRoleCounts.null_control || 0) === 6
      && (currentSelectedRoleCounts.contrast_carb_heavy || 0) === 3
      && (currentSelectedRoleCounts.contrast_fat_heavy || 0) === 3,
    multiplePublicContexts: currentSelectedPublicContexts.length >= 2,
    visibleSignaturesUnique: new Set(currentSelectedCases.map(item => (
      item.pair.displayContract.visibleSignature
    ))).size === currentSelectedCases.length
  } : evidence.readinessChecks;
  const summaryWithoutHash = {
    schemaVersion: "actual_context_anchored_counterfactual_audit_v2_attrition_falsification",
    evidenceKind: "controlled_counterfactual_not_observed_prevalence",
    observedActualOutcomePreserved: "ACTUAL_EVIDENCE_INSUFFICIENT",
    sourceRecordCount: extracted.length,
    sourceSafeIncludedCount: included.length,
    sourceExcludedCount: excluded.length,
    sourceExclusionReasonCounts: countBy(excluded, day => day.exclusionReason),
    anchorCandidateCount: evidence.anchors.length,
    assignedRoleCounts: countBy(evidence.assigned, item => item.assignedRole),
    eligibleRoleCounts: recoveredLane?.packetReady
      ? recoveredLane.capabilityCounts
      : countBy(evidence.eligibleCases, item => item.assignedRole),
    anchorExclusionReasonCounts: evidence.anchorExclusionReasons,
    blockCandidateCounts: recoveredLane?.packetReady
      ? recoveredLane.blockCandidateCounts
      : Object.fromEntries(Object.entries(evidence.blockCandidatesByDirection).map(([key, value]) => [key, value.length])),
    selectedBalancedBlockCount: currentSelectedBlocks.length,
    selectedCaseCount: currentSelectedCases.length,
    selectedPublicContextCount: currentSelectedPublicContexts.length,
    selectedRoleCounts: currentSelectedRoleCounts,
    readinessChecks: currentReadinessChecks,
    preJudgmentStatus: artifactEvidence.preJudgmentStatus,
    reviewForUser: artifactEvidence.reviewForUser,
    reviewEvidenceLane: recoveredLane?.packetReady ? recoveredLane.lane.id : "historical_baseline",
    historicalPreassignmentBaseline: {
      eligibleRoleCounts: countBy(evidence.eligibleCases, item => item.assignedRole),
      blockCandidateCounts: Object.fromEntries(Object.entries(evidence.blockCandidatesByDirection).map(([key, value]) => [key, value.length])),
      selectedBalancedBlockCount: evidence.selectedBlocks.length,
      selectedCaseCount: evidence.selectedCases.length,
      readinessChecks: evidence.readinessChecks,
      preJudgmentStatus: evidence.preJudgmentStatus,
      reviewForUser: evidence.reviewForUser
    },
    attritionFalsification: attritionSummary,
    actualPrevalenceInferenceAuthorized: false,
    policyDecisionAuthorized: false,
    coefficientSelectionAuthorized: false,
    reviewPacketHash: artifacts.reviewArtifact.reviewPacketHash,
    revealMapHash: artifacts.revealArtifact.revealMapHash,
    reviewPacketCaseCount: artifacts.reviewArtifact.reviewPacket.length,
    revealMapCaseCount: artifacts.revealArtifact.revealMap.length,
    separatePostJudgmentRevealRequired: true
  };
  if (summaryWithoutHash.reviewForUser !== (summaryWithoutHash.reviewPacketCaseCount > 0)
      || summaryWithoutHash.selectedCaseCount !== summaryWithoutHash.reviewPacketCaseCount
      || summaryWithoutHash.selectedCaseCount !== summaryWithoutHash.revealMapCaseCount
      || (summaryWithoutHash.reviewForUser && !Object.values(summaryWithoutHash.readinessChecks).every(Boolean))) {
    throw new Error("counterfactual attrition summary and locked review selection are inconsistent");
  }
  return {
    summaryAudit: {
      ...summaryWithoutHash,
      anonymizedCounterfactualAuditHash: crypto.createHash("sha256").update(JSON.stringify(summaryWithoutHash)).digest("hex")
    },
    ...artifacts
  };
}

function buildSyntheticActualSourceSafetyPayload(){
  const target = { targetCal: 2200, protein: 150, carbs: 250, fat: 600 / 9 };
  const snapshot = {
    ...target,
    goal: "diet",
    weight: 75,
    exerciseManagementMode: "general",
    exerciseProfile: "bodybuilding",
    routine: "REST",
    weeklyTrainingDays: 0,
    weightDuration: 0,
    intensityOverride: 0,
    cardioType: "treadmill_walk",
    cardioDuration: 0,
    cardioSpeed: 0,
    cardioIncline: 0,
    generalAdvancedSettings: false,
    generalLowDigestCarbs: false,
    expertLbmAlpha: 0.75
  };
  const meals = [1, 2].map(index => ({
    id: `synthetic_meal_${index}`,
    carbs: 125,
    protein: 75,
    fat: 300 / 9
  }));
  const productionThresholdMeals = [1, 2].map(index => ({
    id: `synthetic_threshold_meal_${index}`,
    carbs: 25,
    protein: 25,
    fat: 75 / 9,
    alcoholKcal: 98,
    otherKcal: 12
  }));
  const record = (date, overrides = {}) => ({
    date,
    recordMode: "detailed",
    meals: meals.map(meal => ({ ...meal })),
    goalSnapshot: { ...snapshot },
    ...overrides
  });
  const invalidNonMacroRecord = (date, key, value) => record(date, {
    meals: meals.map((meal, index) => index === 0 ? { ...meal, [key]: value } : { ...meal })
  });
  return {
    app: "macro-engine",
    kind: "full-backup",
    backupVersion: 1,
    appVersion: "v8.3",
    data: {
      settings: { goal: "bulk", weight: 90 },
      records: [
        record("2026-01-01"),
        record("2026-01-02", { goalSnapshot: null }),
        record("2026-01-03", { goalSnapshot: { ...snapshot, targetCal: 1800 } }),
        record("2026-01-04", { goalSnapshot: { ...snapshot, weight: null } }),
        record("2026-01-05", { goalSnapshot: { ...snapshot, routine: null } }),
        record("2026-01-06", { meals: [{ ...meals[0], carbs: -1 }, meals[1]] }),
        record("2026-01-07", { goalSnapshot: null, adherenceSource: "auto", adherencePercent: 99 }),
        record("2026-01-08", { meals: [meals[0]] }),
        record("2026-01-09", {
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            routine: "REST",
            cardioType: "treadmill_run",
            cardioDuration: 30,
            cardioSpeed: 8.5,
            cardioIncline: 0
          }
        }),
        record("2026-01-10", { goalSnapshot: { ...snapshot, targetCal: 1200, carbs: null } }),
        record("2026-01-11", { goalSnapshot: { ...snapshot, targetCal: 1600, fat: "" } }),
        record("2026-01-12", { goalSnapshot: { ...snapshot, weeklyTrainingDays: null } }),
        record("2026-01-13", { goalSnapshot: { ...snapshot, weightDuration: "" } }),
        record("2026-01-14", { goalSnapshot: { ...snapshot, cardioDuration: null } }),
        record("2026-99-99"),
        record("2026-01-15"),
        record("2026-01-15"),
        record("2026-01-16", { meals: productionThresholdMeals.map(meal => ({ ...meal })) }),
        record("2026-01-17", {
          meals: productionThresholdMeals.map(({ alcoholKcal, otherKcal, ...meal }) => meal)
        }),
        invalidNonMacroRecord("2026-01-18", "alcoholKcal", null),
        invalidNonMacroRecord("2026-01-19", "alcoholKcal", ""),
        invalidNonMacroRecord("2026-01-20", "alcoholKcal", "abc"),
        invalidNonMacroRecord("2026-01-21", "alcoholKcal", -1),
        invalidNonMacroRecord("2026-01-22", "otherKcal", null),
        invalidNonMacroRecord("2026-01-23", "otherKcal", ""),
        invalidNonMacroRecord("2026-01-24", "otherKcal", "abc"),
        invalidNonMacroRecord("2026-01-25", "otherKcal", -1),
        record("2026-01-26", {
          meals: meals.map(meal => ({ ...meal, otherKcal: Number.MAX_VALUE }))
        }),
        record("2026-01-27", { goalSnapshot: { ...snapshot, routine: "CORRUPT_ROUTINE" } }),
        record("2026-01-28", {
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            exerciseProfile: "running",
            routine: "PUSH",
            generalAdvancedSettings: false
          }
        }),
        record("2026-01-29", {
          snapshotSource: "saved_at_entry",
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            exerciseProfile: null,
            routine: "PULL",
            generalAdvancedSettings: false
          }
        }),
        record("2026-01-30", {
          snapshotSource: "saved_at_entry",
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            exerciseProfile: null,
            routine: "PULL+LEGS",
            generalAdvancedSettings: false
          }
        }),
        record("2026-01-31", {
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "general",
            exerciseProfile: null,
            routine: "REST"
          }
        }),
        record("2026-02-01", { snapshotSource: "not_a_production_marker" }),
        record("2026-02-02", {
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            exerciseProfile: null,
            routine: "REST",
            generalAdvancedSettings: false
          }
        }),
        record("2026-02-03", {
          goalSnapshot: {
            ...snapshot,
            exerciseManagementMode: "exercise",
            exerciseProfile: "unknown_profile",
            routine: "PUSH",
            generalAdvancedSettings: false
          }
        })
      ]
    }
  };
}

function buildSyntheticMatchedEvidenceDays(){
  const zeroVector = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [key, 0]));
  const vectorAt = (base, delta = 0) => ({
    ...zeroVector,
    targetEnergyDeviationPenalty: base + delta
  });
  const makeDay = (sampleId, overrides = {}) => ({
    sampleId,
    included: true,
    goal: "diet",
    trainingContext: "rest",
    sourceValidityKey: "synthetic_exact_source",
    ratios: { energy: 1, protein: 1, carb: 1, fat: 1 },
    nonJointPenaltyVector: { ...zeroVector },
    optionC: {
      valid: true,
      direction: "inside",
      residual: 0,
      residualPositive: false
    },
    ...overrides
  });
  return [
    makeDay("exact_contrast_a", { ratios: { energy: 1, protein: 1, carb: 0.85, fat: 1.15 } }),
    makeDay("exact_contrast_b", {
      ratios: { energy: 1, protein: 1, carb: 1.25, fat: 0.75 },
      optionC: { valid: true, direction: "carb_heavy", residual: 0.20, residualPositive: true }
    }),
    makeDay("exact_control_a", {
      ratios: { energy: 0.9, protein: 1.1, carb: 0.60, fat: 1.40 },
      nonJointPenaltyVector: vectorAt(2),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.20, residualPositive: true }
    }),
    makeDay("exact_control_b", {
      ratios: { energy: 0.9, protein: 1.1, carb: 0.90, fat: 1.10 },
      nonJointPenaltyVector: vectorAt(2),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.25, residualPositive: true }
    }),
    makeDay("tolerance_contrast_a", {
      sourceValidityKey: "synthetic_tolerance_source",
      ratios: { energy: 1.1, protein: 0.9, carb: 0.70, fat: 1.30 },
      nonJointPenaltyVector: vectorAt(0),
      optionC: { valid: true, direction: "inside", residual: 0, residualPositive: false }
    }),
    makeDay("tolerance_contrast_b", {
      sourceValidityKey: "synthetic_tolerance_source",
      ratios: { energy: 1.1, protein: 0.9, carb: 1.10, fat: 0.90 },
      nonJointPenaltyVector: vectorAt(0, 0.10),
      optionC: { valid: true, direction: "carb_heavy", residual: 0.25, residualPositive: true }
    }),
    makeDay("tolerance_control_a", {
      sourceValidityKey: "synthetic_tolerance_source",
      ratios: { energy: 0.8, protein: 1.2, carb: 0.55, fat: 1.45 },
      nonJointPenaltyVector: vectorAt(2),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.15, residualPositive: true }
    }),
    makeDay("tolerance_control_b", {
      sourceValidityKey: "synthetic_tolerance_source",
      ratios: { energy: 0.8, protein: 1.2, carb: 0.95, fat: 1.05 },
      nonJointPenaltyVector: vectorAt(2, 0.10),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.30, residualPositive: true }
    }),
    makeDay("wide_contrast_a", {
      sourceValidityKey: "synthetic_wide_source",
      ratios: { energy: 1.2, protein: 0.8, carb: 0.75, fat: 1.25 },
      nonJointPenaltyVector: vectorAt(0),
      optionC: { valid: true, direction: "inside", residual: 0, residualPositive: false }
    }),
    makeDay("wide_contrast_b", {
      sourceValidityKey: "synthetic_wide_source",
      ratios: { energy: 1.2, protein: 0.8, carb: 1.35, fat: 0.65 },
      nonJointPenaltyVector: vectorAt(0, 0.75),
      optionC: { valid: true, direction: "carb_heavy", residual: 0.35, residualPositive: true }
    }),
    makeDay("wide_control_a", {
      sourceValidityKey: "synthetic_wide_source",
      ratios: { energy: 0.7, protein: 1.3, carb: 0.50, fat: 1.50 },
      nonJointPenaltyVector: vectorAt(2),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.20, residualPositive: true }
    }),
    makeDay("wide_control_b", {
      sourceValidityKey: "synthetic_wide_source",
      ratios: { energy: 0.7, protein: 1.3, carb: 1.00, fat: 1.00 },
      nonJointPenaltyVector: vectorAt(2, 0.75),
      optionC: { valid: true, direction: "fat_heavy", residual: 0.40, residualPositive: true }
    }),
    makeDay("different_context", {
      goal: "bulk",
      ratios: { energy: 1, protein: 1, carb: 1.35, fat: 0.65 },
      optionC: { valid: true, direction: "carb_heavy", residual: 0.30, residualPositive: true }
    })
  ];
}

function buildSyntheticCounterfactualEvidenceDays(){
  const zeroVector = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [key, 0]));
  const allZeroPenalties = Object.fromEntries(productionPenaltyAxes.map(key => [key, 0]));
  const makeVariant = (variantKey, exchangeStep, carbRatio, fatRatio, energyRatio, proteinRatio) => {
    const targetCarbs = 200;
    const targetFat = 800 / 9;
    const carbG = targetCarbs * carbRatio;
    const fatG = targetFat * fatRatio;
    return {
      variantKey,
      gridKind: "fixed_36kcal",
      exchangeStep,
      exchangeKcal: exchangeStep * 36,
      normalizedFraction: null,
      valid: true,
      exclusionReason: null,
      ratios: { energy: energyRatio, protein: proteinRatio, carb: carbRatio, fat: fatRatio },
      penalties: { ...allZeroPenalties },
      invariants: {
        exchangeEnergyGap: 0,
        derivedScoringKcalGap: 0,
        proteinGap: 0,
        targetAuthorityValid: true,
        targetAuthoritySource: "frozen_goal_snapshot",
        weightSource: "goalSnapshot",
        totalBurnSource: "snapshot_basis_unavailable",
        trainingContext: null,
        syntheticMealClosureValid: true
      },
      optionCInput: {
        targetKcal: 2000,
        targetProteinG: 100,
        proteinReservedG: 100,
        availableCarbFatKcal: 1600,
        carbMinG: 160,
        carbMaxG: 240,
        fatMinG: 640 / 9,
        fatMaxG: 960 / 9,
        collapsed: false,
        carbG,
        fatG,
        totalKcal: 2000
      }
    };
  };
  const days = [];
  [
    { context: "rest", source: "synthetic_cf_rest" },
    { context: "normal_resistance", source: "synthetic_cf_normal" }
  ].forEach(({ context, source }) => {
    for (let index = 0; index < 12; index += 1) {
      const energyRatio = 0.55 + index * 0.05;
      const proteinRatio = 0.75 + index * 0.05;
      const variants = [
        makeVariant("inside_low", -1, 0.9, 1.1, energyRatio, proteinRatio),
        makeVariant("inside_high", 1, 1.1, 0.9, energyRatio, proteinRatio),
        makeVariant("carb_outside", 2, 1.4, 0.6, energyRatio, proteinRatio),
        makeVariant("fat_outside", -2, 0.6, 1.4, energyRatio, proteinRatio)
      ].map(variant => ({
        ...variant,
        invariants: { ...variant.invariants, trainingContext: context }
      }));
      const normalizedVariants = variants.map((variant, variantIndex) => ({
        ...variant,
        variantKey: `normalized_${variant.variantKey}`,
        gridKind: "normalized_feasible_span",
        exchangeStep: null,
        exchangeKcal: variant.exchangeKcal * 2,
        normalizedFraction: [-0.4, 0.4, 0.8, -0.8][variantIndex]
      }));
      days.push({
        sampleId: `${source}_${String(index).padStart(2, "0")}`,
        included: true,
        goal: index < 6 ? "diet" : "lean_bulk",
        trainingContext: context,
        sourceValidityKey: source,
        ratios: {
          energy: energyRatio,
          protein: proteinRatio,
          carb: index % 2 === 0 ? 0.5 : 1.5,
          fat: index % 2 === 0 ? 0.5 : 1.5
        },
        nonJointPenaltyVector: { ...zeroVector },
        optionC: { valid: true, direction: "inside", residual: 0 },
        counterfactualFamily: {
          valid: true,
          exclusionReason: null,
          generatorContract: "synthetic_fixture_only",
          normalizedGeneratorContract: "synthetic_fixture_only",
          normalizedGridFractions: [0.4, 0.8],
          variants,
          normalizedVariants
        }
      });
    }
  });
  return days;
}

function hasExactObjectKeys(value, expectedKeys){
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return JSON.stringify(actualKeys) === JSON.stringify([...expectedKeys].sort());
}

function isHypothesisBlindReviewArtifactSafe(artifact){
  if (!hasExactObjectKeys(artifact, ["schemaVersion", "randomizationSeedVersion", "preJudgmentStatus", "reviewForUser", "selectionContract", "reviewPacket", "reviewPacketHash"])) return false;
  if (!/^[a-f0-9]{64}$/.test(artifact.reviewPacketHash || "")) return false;
  const { reviewPacketHash, ...reviewBody } = artifact;
  if (crypto.createHash("sha256").update(JSON.stringify(reviewBody)).digest("hex") !== reviewPacketHash) return false;
  const expectedChoices = ["separate_joint_meaning", "existing_core_is_sufficient", "indeterminate"];
  const validRatioBand = value => typeof value === "string" && /^\d+_to_lt_\d+_pct_of_target$/.test(value);
  const allowedMatchContracts = new Set(ACTUAL_MATCH_TOLERANCES.map(item => item.id));
  const statusValid = ["READY_FOR_LIMITED_BLIND_JUDGMENT", "NO_BALANCED_JUDGEABLE_BLOCK"].includes(artifact.preJudgmentStatus)
    && artifact.reviewForUser === (artifact.preJudgmentStatus === "READY_FOR_LIMITED_BLIND_JUDGMENT")
    && artifact.reviewForUser === (Array.isArray(artifact.reviewPacket) && artifact.reviewPacket.length > 0);
  const selectionContractValid = hasExactObjectKeys(artifact.selectionContract, [
    "targetRatioBandWidthPercentagePoints",
    "sampleReuseAllowed",
    "visibleCaseDuplicationAllowed",
    "reviewScope",
    "policyDecisionAuthorized"
  ])
    && artifact.selectionContract.targetRatioBandWidthPercentagePoints === 5
    && artifact.selectionContract.sampleReuseAllowed === false
    && artifact.selectionContract.visibleCaseDuplicationAllowed === false
    && artifact.selectionContract.reviewScope === "limited_product_meaning_only"
    && artifact.selectionContract.policyDecisionAuthorized === false;
  const structurallySafe = Array.isArray(artifact.reviewPacket) && artifact.reviewPacket.every(item => (
    hasExactObjectKeys(item, ["caseId", "matchContract", "context", "commonTargetRatioBands", "nonJointSimilarity", "caseA", "caseB", "judgmentOptions"])
    && /^blind_review_case_\d{3}$/.test(item.caseId)
    && allowedMatchContracts.has(item.matchContract)
    && hasExactObjectKeys(item.context, ["goal", "trainingContext", "sourceCohort"])
    && Object.values(item.context).every(value => typeof value === "string" && value.length > 0)
    && item.context.sourceCohort === "same_snapshot_provenance_cohort"
    && hasExactObjectKeys(item.commonTargetRatioBands, ["energy", "protein"])
    && Object.values(item.commonTargetRatioBands).every(validRatioBand)
    && hasExactObjectKeys(item.nonJointSimilarity, ["axisCount", "maximumAxisDelta"])
    && item.nonJointSimilarity.axisCount === productionNonJointPenaltyAxes.length
    && Number.isFinite(item.nonJointSimilarity.maximumAxisDelta)
    && item.nonJointSimilarity.maximumAxisDelta >= 0
    && [item.caseA, item.caseB].every(side => (
      hasExactObjectKeys(side, ["targetRatioBands"])
      && hasExactObjectKeys(side.targetRatioBands, ["carb", "fat"])
      && Object.values(side.targetRatioBands).every(validRatioBand)
    ))
    && item.caseA.targetRatioBands.carb !== item.caseB.targetRatioBands.carb
    && item.caseA.targetRatioBands.fat !== item.caseB.targetRatioBands.fat
    && JSON.stringify(item.judgmentOptions) === JSON.stringify(expectedChoices)
  ));
  const caseIds = artifact.reviewPacket.map(item => item.caseId);
  const forbiddenFieldFree = !/(residual|direction|magnitude|optionC|currentScore|finalScore|rawScore|jointPenalty|candidatePenalty|sampleId|date|food|memo|mealId|absolute|Kcal|backupPath|originalPairSide|source_[12])/i.test(JSON.stringify(artifact));
  return statusValid && selectionContractValid && structurallySafe && new Set(caseIds).size === caseIds.length && forbiddenFieldFree;
}

function isPostJudgmentRevealArtifactSafe(artifact){
  if (!hasExactObjectKeys(artifact, ["schemaVersion", "reviewPacketHash", "revealOnlyAfterJudgment", "revealMap", "revealMapHash"])) return false;
  if (!/^[a-f0-9]{64}$/.test(artifact.reviewPacketHash || "") || !/^[a-f0-9]{64}$/.test(artifact.revealMapHash || "")) return false;
  const { revealMapHash, ...revealBody } = artifact;
  if (crypto.createHash("sha256").update(JSON.stringify(revealBody)).digest("hex") !== revealMapHash) return false;
  const allowedDirections = new Set(["inside", "carb_heavy", "fat_heavy"]);
  const allowedMagnitudes = new Set(["none", "small", "moderate", "large"]);
  const structurallySafe = artifact.revealOnlyAfterJudgment === true
    && Array.isArray(artifact.revealMap)
    && artifact.revealMap.every(item => (
      hasExactObjectKeys(item, ["caseId", "caseA", "caseB"])
      && /^blind_review_case_\d{3}$/.test(item.caseId)
      && [item.caseA, item.caseB].every(side => (
        hasExactObjectKeys(side, ["originalPairSide", "residualDirection", "residualMagnitude"])
        && ["source_1", "source_2"].includes(side.originalPairSide)
        && allowedDirections.has(side.residualDirection)
        && allowedMagnitudes.has(side.residualMagnitude)
      ))
      && new Set([item.caseA.originalPairSide, item.caseB.originalPairSide]).size === 2
    ));
  const caseIds = artifact.revealMap.map(item => item.caseId);
  return structurallySafe
    && new Set(caseIds).size === caseIds.length
    && !/(currentScore|finalScore|rawScore|jointPenalty|candidatePenalty|sampleId|date|food|memo|mealId|absolute|Kcal|backupPath)/i.test(JSON.stringify(artifact));
}

function assertHypothesisBlindArtifactBundleSafe(bundle){
  if (!isHypothesisBlindReviewArtifactSafe(bundle?.reviewArtifact)) {
    throw new Error("generated actual review artifact failed the privacy allowlist");
  }
  if (!isPostJudgmentRevealArtifactSafe(bundle?.revealArtifact)) {
    throw new Error("generated actual reveal artifact failed the post-judgment allowlist");
  }
  const reviewCaseIds = bundle.reviewArtifact.reviewPacket.map(item => item.caseId);
  const revealCaseIds = bundle.revealArtifact.revealMap.map(item => item.caseId);
  if (bundle.revealArtifact.reviewPacketHash !== bundle.reviewArtifact.reviewPacketHash
      || JSON.stringify(reviewCaseIds) !== JSON.stringify(revealCaseIds)) {
    throw new Error("actual review and reveal artifacts are not hash/case linked");
  }
  return true;
}

function assertLockedReviewMatchesGenerated(lockedReviewArtifact, generatedReviewArtifact){
  if (!isHypothesisBlindReviewArtifactSafe(lockedReviewArtifact)) {
    throw new Error("locked review artifact failed the privacy/hash allowlist");
  }
  if (JSON.stringify(lockedReviewArtifact) !== JSON.stringify(generatedReviewArtifact)) {
    throw new Error("locked review artifact does not match the current backup/input");
  }
  return true;
}

function assertDistinctFilePaths(paths){
  const normalized = paths.filter(Boolean).map(item => path.resolve(item).toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("actual backup, ledger, review, judgment, and reveal paths must all be distinct");
  }
  return true;
}

async function buildActualDaySourceSafetyFixtureAudit(){
  let invalidEnvelopeRejected = false;
  let missingSettingsRejected = false;
  let coercedBackupVersionRejected = false;
  try {
    validateRawActualBackupEnvelope({ records: [] });
  } catch {
    invalidEnvelopeRejected = true;
  }
  try {
    validateRawActualBackupEnvelope({ app: "macro-engine", kind: "full-backup", backupVersion: 1, data: { records: [] } });
  } catch {
    missingSettingsRejected = true;
  }
  try {
    validateRawActualBackupEnvelope({ app: "macro-engine", kind: "full-backup", backupVersion: "1", data: { settings: { goal: "diet" }, records: [] } });
  } catch {
    coercedBackupVersionRejected = true;
  }
  const payload = buildSyntheticActualSourceSafetyPayload();
  const fixtureSampleId = date => getStableActualSampleId({ date });
  const extracted = await extractAnonymizedActualDaysFromPayload(payload);
  const reversedPayload = JSON.parse(JSON.stringify(payload));
  reversedPayload.data.records.reverse();
  const reversedExtracted = await extractAnonymizedActualDaysFromPayload(reversedPayload);
  const counterfactualExtracted = await extractAnonymizedActualDaysFromPayload(payload, { counterfactualRequested: true });
  const reversedCounterfactualExtracted = await extractAnonymizedActualDaysFromPayload(reversedPayload, { counterfactualRequested: true });
  const metadataInjectedPayload = JSON.parse(JSON.stringify(payload));
  metadataInjectedPayload.data.records.forEach(record => {
    record.testOnlyResidualMetadata = { residual: 0.99, direction: "carb_heavy", finalScore: 1 };
  });
  const metadataInjectedCounterfactualExtracted = await extractAnonymizedActualDaysFromPayload(
    metadataInjectedPayload,
    { counterfactualRequested: true }
  );
  const canonicalizeExtracted = items => [...items]
    .sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId))
    .map(item => JSON.stringify(item));
  const included = extracted.filter(day => day.included);
  const excluded = extracted.filter(day => !day.included);
  const exclusionReasonCounts = countBy(excluded, day => day.exclusionReason);
  const syntheticMatchedDays = buildSyntheticMatchedEvidenceDays();
  const matchedEvidence = buildActualMatchedEvidence(syntheticMatchedDays);
  const hypothesisBlindArtifacts = buildHypothesisBlindProductMeaningReview(matchedEvidence);
  const repeatedArtifacts = buildHypothesisBlindProductMeaningReview(buildActualMatchedEvidence(buildSyntheticMatchedEvidenceDays()));
  const reversedArtifacts = buildHypothesisBlindProductMeaningReview(buildActualMatchedEvidence([...syntheticMatchedDays].reverse()));
  const { reviewArtifact, revealArtifact } = hypothesisBlindArtifacts;
  const syntheticCounterfactualEvidence = buildActualAnchoredCounterfactualEvidence(buildSyntheticCounterfactualEvidenceDays());
  const syntheticCounterfactualArtifacts = buildActualAnchoredCounterfactualBlindArtifacts(syntheticCounterfactualEvidence);
  const syntheticCounterfactualAttrition = buildCounterfactualAttritionFalsification(
    buildSyntheticCounterfactualEvidenceDays(),
    syntheticCounterfactualEvidence
  );
  const makeRolePreassignmentTrapDays = () => {
    const days = buildSyntheticCounterfactualEvidenceDays().map(day => ({ ...day, goal: "diet" }));
    const byStratum = new Map();
    days.forEach(day => {
      const key = `${day.goal}|${day.trainingContext}|${day.sourceValidityKey}`;
      const list = byStratum.get(key) || [];
      list.push(day);
      byStratum.set(key, list);
    });
    for (const stratumDays of byStratum.values()) {
      stratumDays.sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId)).forEach((day, index) => {
        const assignedRole = getCounterfactualRoleAssignment(index);
        const keepKeys = assignedRole === "null_control"
          ? new Set(["inside_low", "carb_outside"])
          : (assignedRole === "contrast_carb_heavy"
            ? new Set(["inside_low", "fat_outside"])
            : new Set(["inside_low", "inside_high"]));
        day.counterfactualFamily = {
          ...day.counterfactualFamily,
          variants: day.counterfactualFamily.variants.filter(variant => keepKeys.has(variant.variantKey)),
          normalizedVariants: day.counterfactualFamily.normalizedVariants.filter(variant => (
            keepKeys.has(variant.variantKey.replace(/^normalized_/, ""))
          ))
        };
      });
    }
    return days;
  };
  const roleTrapDays = makeRolePreassignmentTrapDays();
  const roleTrapBaseline = buildActualAnchoredCounterfactualEvidence(roleTrapDays);
  const roleTrapAttrition = buildCounterfactualAttritionFalsification(roleTrapDays, roleTrapBaseline);
  const observedNarrowDays = buildSyntheticCounterfactualEvidenceDays().map(day => ({
    ...day,
    ratios: { ...day.ratios, carb: 1, fat: 1 }
  }));
  const observedNarrowBaseline = buildActualAnchoredCounterfactualEvidence(observedNarrowDays);
  const observedNarrowAttrition = buildCounterfactualAttritionFalsification(
    observedNarrowDays,
    observedNarrowBaseline
  );
  const normalizedOnlyDays = buildSyntheticCounterfactualEvidenceDays().map(day => ({
    ...day,
    counterfactualFamily: {
      ...day.counterfactualFamily,
      variants: day.counterfactualFamily.variants.filter(variant => variant.variantKey.startsWith("inside_"))
    }
  }));
  const normalizedOnlyBaseline = buildActualAnchoredCounterfactualEvidence(normalizedOnlyDays);
  const normalizedOnlyAttrition = buildCounterfactualAttritionFalsification(
    normalizedOnlyDays,
    normalizedOnlyBaseline
  );
  const equalNonzeroDays = buildSyntheticCounterfactualEvidenceDays().map(day => {
    const nonJointPenaltyVector = { ...day.nonJointPenaltyVector, fatRangePenalty: 2.5 };
    const withEqualPenalty = variant => ({
      ...variant,
      penalties: { ...variant.penalties, fatRangePenalty: 2.5 }
    });
    return {
      ...day,
      nonJointPenaltyVector,
      counterfactualFamily: {
        ...day.counterfactualFamily,
        variants: day.counterfactualFamily.variants.map(withEqualPenalty),
        normalizedVariants: day.counterfactualFamily.normalizedVariants.map(withEqualPenalty)
      }
    };
  });
  const equalNonzeroBaseline = buildActualAnchoredCounterfactualEvidence(equalNonzeroDays);
  const equalNonzeroAttrition = buildCounterfactualAttritionFalsification(
    equalNonzeroDays,
    equalNonzeroBaseline
  );
  const makeCapabilityPairSearchCase = (anchorSampleId, stratumKey, publicContextKey, assignedRole) => ({
    anchorSampleId,
    stratumKey,
    publicContextKey,
    assignedRole,
    pairOptions: [
      {
        pairKey: `${anchorSampleId}_shared`,
        displayContract: { visibleSignature: `shared_${assignedRole}` }
      },
      {
        pairKey: `${anchorSampleId}_unique`,
        displayContract: { visibleSignature: `unique_${anchorSampleId}` }
      }
    ]
  });
  const capabilityPairSearchCases = [
    makeCapabilityPairSearchCase("pair_a_control_1", "pair_search_a", "diet|normal", "null_control"),
    makeCapabilityPairSearchCase("pair_a_control_2", "pair_search_a", "diet|normal", "null_control"),
    makeCapabilityPairSearchCase("pair_a_control_3", "pair_search_a", "diet|normal", "null_control"),
    makeCapabilityPairSearchCase("pair_a_carb_1", "pair_search_a", "diet|normal", "contrast_carb_heavy"),
    makeCapabilityPairSearchCase("pair_a_carb_2", "pair_search_a", "diet|normal", "contrast_carb_heavy"),
    makeCapabilityPairSearchCase("pair_a_fat_1", "pair_search_a", "diet|normal", "contrast_fat_heavy"),
    makeCapabilityPairSearchCase("pair_b_control_1", "pair_search_b", "diet|high_volume", "null_control"),
    makeCapabilityPairSearchCase("pair_b_control_2", "pair_search_b", "diet|high_volume", "null_control"),
    makeCapabilityPairSearchCase("pair_b_control_3", "pair_search_b", "diet|high_volume", "null_control"),
    makeCapabilityPairSearchCase("pair_b_carb_1", "pair_search_b", "diet|high_volume", "contrast_carb_heavy"),
    makeCapabilityPairSearchCase("pair_b_fat_1", "pair_search_b", "diet|high_volume", "contrast_fat_heavy"),
    makeCapabilityPairSearchCase("pair_b_fat_2", "pair_search_b", "diet|high_volume", "contrast_fat_heavy")
  ];
  const capabilityPairSearch = selectCapabilityFirstCounterfactualBlocks(capabilityPairSearchCases);
  const reversedCapabilityPairSearch = selectCapabilityFirstCounterfactualBlocks([...capabilityPairSearchCases].reverse());
  const capabilityPairSearchSelectedCases = capabilityPairSearch.selectedBlocks
    .flatMap(block => [block.control, block.contrast]);
  const capabilityPairSearchSelectionKey = result => result.selectedBlocks
    .map(block => block.materializedBlockKey)
    .join("|");
  const syntheticCounterfactualBundleSafe = assertActualAnchoredCounterfactualBundleSafe(syntheticCounterfactualArtifacts);
  const reversedSyntheticCounterfactualArtifacts = buildActualAnchoredCounterfactualBlindArtifacts(
    buildActualAnchoredCounterfactualEvidence([...buildSyntheticCounterfactualEvidenceDays()].reverse())
  );
  const lockedCounterfactualReviewSameInputAccepted = assertLockedCounterfactualReviewMatchesGenerated(
    syntheticCounterfactualArtifacts.reviewArtifact,
    reversedSyntheticCounterfactualArtifacts.reviewArtifact
  );
  const changedLockedCounterfactualReview = JSON.parse(JSON.stringify(syntheticCounterfactualArtifacts.reviewArtifact));
  changedLockedCounterfactualReview.reviewPacket[0].caseA.targetRatioBands.carb
    = changedLockedCounterfactualReview.reviewPacket[0].caseA.targetRatioBands.carb === "0_to_lt_5_pct_of_target"
      ? "5_to_lt_10_pct_of_target"
      : "0_to_lt_5_pct_of_target";
  const { reviewPacketHash: ignoredCounterfactualHash, ...changedCounterfactualBody } = changedLockedCounterfactualReview;
  changedLockedCounterfactualReview.reviewPacketHash = crypto.createHash("sha256")
    .update(JSON.stringify(changedCounterfactualBody))
    .digest("hex");
  let changedLockedCounterfactualReviewRejected = false;
  try {
    assertLockedCounterfactualReviewMatchesGenerated(
      changedLockedCounterfactualReview,
      syntheticCounterfactualArtifacts.reviewArtifact
    );
  } catch {
    changedLockedCounterfactualReviewRejected = true;
  }
  const expectedCounterfactualChoice = revealCase => (
    revealCase.caseA.geometryPosition === "inside" ? "case_a_better" : "case_b_better"
  );
  const reverseCounterfactualChoice = revealCase => (
    expectedCounterfactualChoice(revealCase) === "case_a_better" ? "case_b_better" : "case_a_better"
  );
  const buildSyntheticCounterfactualJudgments = (modes = {}) => (
    syntheticCounterfactualArtifacts.revealArtifact.revealMap.map((revealCase, index) => {
      const role = revealCase.hiddenComparisonRole;
      const mode = role === "null_control"
        ? (modes.control || "no_difference")
        : (role === "contrast_carb_heavy" ? (modes.carb || "expected") : (modes.fat || "expected"));
      let choice = "no_meaningful_difference";
      if (mode === "expected") choice = expectedCounterfactualChoice(revealCase);
      else if (mode === "reverse") choice = reverseCounterfactualChoice(revealCase);
      else if (mode === "directional") choice = index % 2 === 0 ? "case_a_better" : "case_b_better";
      else if (mode === "cannot_tell") choice = "cannot_tell";
      return { caseId: revealCase.caseId, choice };
    })
  );
  const twoSidedJudgmentChoices = buildSyntheticCounterfactualJudgments();
  const confirmedTwoSidedJudgmentArtifact = buildCounterfactualJudgmentArtifact(
    syntheticCounterfactualArtifacts.reviewArtifact,
    twoSidedJudgmentChoices,
    "user_confirmed"
  );
  const repeatedConfirmedJudgmentArtifact = buildCounterfactualJudgmentArtifact(
    syntheticCounterfactualArtifacts.reviewArtifact,
    [...twoSidedJudgmentChoices].reverse(),
    "user_confirmed"
  );
  const draftTwoSidedJudgmentArtifact = buildCounterfactualJudgmentArtifact(
    syntheticCounterfactualArtifacts.reviewArtifact,
    twoSidedJudgmentChoices,
    "awaiting_user_confirmation"
  );
  let unconfirmedCounterfactualRevealRejected = false;
  try {
    assertCounterfactualJudgmentMatchesReview(
      draftTwoSidedJudgmentArtifact,
      syntheticCounterfactualArtifacts.reviewArtifact,
      { requireConfirmed: true }
    );
  } catch {
    unconfirmedCounterfactualRevealRejected = true;
  }
  const changedAndRehashedJudgmentArtifact = buildCounterfactualJudgmentArtifact(
    syntheticCounterfactualArtifacts.reviewArtifact,
    twoSidedJudgmentChoices.map((item, index) => (
      index === 0 ? { ...item, choice: "cannot_tell" } : item
    )),
    "user_confirmed"
  );
  let changedAfterConfirmationJudgmentRejected = false;
  try {
    assertCounterfactualJudgmentMatchesReview(
      changedAndRehashedJudgmentArtifact,
      syntheticCounterfactualArtifacts.reviewArtifact,
      {
        requireConfirmed: true,
        expectedJudgmentSetHash: confirmedTwoSidedJudgmentArtifact.judgmentSetHash
      }
    );
  } catch {
    changedAfterConfirmationJudgmentRejected = true;
  }
  const invalidJudgmentProbes = [
    twoSidedJudgmentChoices.slice(0, -1),
    [...twoSidedJudgmentChoices.slice(0, -1), twoSidedJudgmentChoices[0]],
    [...twoSidedJudgmentChoices, { caseId: "counterfactual_blind_case_999", choice: "cannot_tell" }],
    twoSidedJudgmentChoices.map((item, index) => (
      index === 0 ? { ...item, choice: "quietly_accept" } : item
    ))
  ];
  const invalidCounterfactualJudgmentsRejected = invalidJudgmentProbes.every(probe => {
    try {
      buildCounterfactualJudgmentArtifact(
        syntheticCounterfactualArtifacts.reviewArtifact,
        probe,
        "user_confirmed"
      );
      return false;
    } catch {
      return true;
    }
  });
  const judgmentBoundCounterfactualReveal = buildJudgmentBoundCounterfactualRevealArtifact(
    syntheticCounterfactualArtifacts.reviewArtifact,
    syntheticCounterfactualArtifacts.revealArtifact,
    confirmedTwoSidedJudgmentArtifact
  );
  const interpretationOutcomeForModes = modes => {
    const artifact = buildCounterfactualJudgmentArtifact(
      syntheticCounterfactualArtifacts.reviewArtifact,
      buildSyntheticCounterfactualJudgments(modes),
      "user_confirmed"
    );
    return interpretCounterfactualBlindJudgment(
      syntheticCounterfactualArtifacts.reviewArtifact,
      syntheticCounterfactualArtifacts.revealArtifact,
      artifact
    );
  };
  const interpretationOutcomes = {
    twoSided: interpretationOutcomeForModes({}),
    carbOnly: interpretationOutcomeForModes({ fat: "no_difference" }),
    fatOnly: interpretationOutcomeForModes({ carb: "no_difference" }),
    redundant: interpretationOutcomeForModes({ carb: "no_difference", fat: "no_difference" }),
    controlNoise: interpretationOutcomeForModes({ control: "directional" }),
    cannotTell: interpretationOutcomeForModes({ control: "cannot_tell" }),
    reverseConflict: interpretationOutcomeForModes({ carb: "reverse" })
  };
  const partialInsufficientCounterfactualReview = JSON.parse(JSON.stringify(
    syntheticCounterfactualArtifacts.reviewArtifact
  ));
  partialInsufficientCounterfactualReview.preJudgmentStatus = "COUNTERFACTUAL_PACKET_INSUFFICIENT";
  partialInsufficientCounterfactualReview.reviewForUser = false;
  partialInsufficientCounterfactualReview.reviewPacket = partialInsufficientCounterfactualReview.reviewPacket.slice(0, 1);
  const { reviewPacketHash: ignoredPartialHash, ...partialReviewBody } = partialInsufficientCounterfactualReview;
  partialInsufficientCounterfactualReview.reviewPacketHash = crypto.createHash("sha256")
    .update(JSON.stringify(partialReviewBody))
    .digest("hex");
  const malformedCounterfactualReview = {
    ...syntheticCounterfactualArtifacts.reviewArtifact,
    reviewPacket: null
  };
  const { reviewPacketHash: ignoredMalformedHash, ...malformedReviewBody } = malformedCounterfactualReview;
  malformedCounterfactualReview.reviewPacketHash = crypto.createHash("sha256")
    .update(JSON.stringify(malformedReviewBody))
    .digest("hex");
  let malformedCounterfactualReviewRejectedWithoutThrow = false;
  try {
    malformedCounterfactualReviewRejectedWithoutThrow
      = isActualAnchoredCounterfactualReviewArtifactSafe(malformedCounterfactualReview) === false;
  } catch {
    malformedCounterfactualReviewRejectedWithoutThrow = false;
  }
  const malformedCounterfactualReveal = {
    ...syntheticCounterfactualArtifacts.revealArtifact,
    revealMap: null
  };
  const { revealMapHash: ignoredMalformedRevealHash, ...malformedRevealBody } = malformedCounterfactualReveal;
  malformedCounterfactualReveal.revealMapHash = crypto.createHash("sha256")
    .update(JSON.stringify(malformedRevealBody))
    .digest("hex");
  let malformedCounterfactualRevealRejectedWithoutThrow = false;
  try {
    malformedCounterfactualRevealRejectedWithoutThrow
      = isActualAnchoredCounterfactualRevealArtifactSafe(malformedCounterfactualReveal) === false;
  } catch {
    malformedCounterfactualRevealRejectedWithoutThrow = false;
  }
  const incoherentCounterfactualReveal = JSON.parse(JSON.stringify(
    syntheticCounterfactualArtifacts.revealArtifact
  ));
  const contrastRevealCase = incoherentCounterfactualReveal.revealMap.find(
    item => item.hiddenComparisonRole !== "null_control"
  );
  contrastRevealCase.hiddenComparisonRole = "null_control";
  const { revealMapHash: ignoredIncoherentRevealHash, ...incoherentRevealBody } = incoherentCounterfactualReveal;
  incoherentCounterfactualReveal.revealMapHash = crypto.createHash("sha256")
    .update(JSON.stringify(incoherentRevealBody))
    .digest("hex");
  const swappedSideCounterfactualReveal = JSON.parse(JSON.stringify(
    syntheticCounterfactualArtifacts.revealArtifact
  ));
  [swappedSideCounterfactualReveal.revealMap[0].caseA.targetRatioBands,
    swappedSideCounterfactualReveal.revealMap[0].caseB.targetRatioBands]
    = [swappedSideCounterfactualReveal.revealMap[0].caseB.targetRatioBands,
      swappedSideCounterfactualReveal.revealMap[0].caseA.targetRatioBands];
  const { revealMapHash: ignoredSwappedRevealHash, ...swappedRevealBody } = swappedSideCounterfactualReveal;
  swappedSideCounterfactualReveal.revealMapHash = crypto.createHash("sha256")
    .update(JSON.stringify(swappedRevealBody))
    .digest("hex");
  let swappedCounterfactualSideBindingRejected = false;
  try {
    assertActualAnchoredCounterfactualBundleSafe({
      reviewArtifact: syntheticCounterfactualArtifacts.reviewArtifact,
      revealArtifact: swappedSideCounterfactualReveal
    });
  } catch {
    swappedCounterfactualSideBindingRejected = true;
  }
  const oneDirectionCounterfactualDays = buildSyntheticCounterfactualEvidenceDays().map(day => ({
    ...day,
    counterfactualFamily: {
      ...day.counterfactualFamily,
      variants: day.counterfactualFamily.variants.filter(variant => variant.variantKey !== "fat_outside")
    }
  }));
  const oneDirectionCounterfactualEvidence = buildActualAnchoredCounterfactualEvidence(oneDirectionCounterfactualDays);
  const oneDirectionCounterfactualArtifacts = buildActualAnchoredCounterfactualBlindArtifacts(
    oneDirectionCounterfactualEvidence
  );
  const oneDirectionCounterfactualBundleSafe = assertActualAnchoredCounterfactualBundleSafe(
    oneDirectionCounterfactualArtifacts
  );
  const reviewCaseIds = reviewArtifact.reviewPacket.map(item => item.caseId);
  const revealCaseIds = revealArtifact.revealMap.map(item => item.caseId);
  const caseASources = revealArtifact.revealMap.map(item => item.caseA.originalPairSide);
  const generatedArtifactBundleSafe = assertHypothesisBlindArtifactBundleSafe(hypothesisBlindArtifacts);
  const lockedReviewSameInputAccepted = assertLockedReviewMatchesGenerated(reviewArtifact, repeatedArtifacts.reviewArtifact);
  const changedLockedReview = JSON.parse(JSON.stringify(reviewArtifact));
  changedLockedReview.reviewPacket[0].caseA.targetRatioBands.carb = changedLockedReview.reviewPacket[0].caseA.targetRatioBands.carb === "0_to_lt_5_pct_of_target"
    ? "5_to_lt_10_pct_of_target"
    : "0_to_lt_5_pct_of_target";
  const { reviewPacketHash: ignoredChangedHash, ...changedReviewBody } = changedLockedReview;
  changedLockedReview.reviewPacketHash = crypto.createHash("sha256").update(JSON.stringify(changedReviewBody)).digest("hex");
  let changedLockedReviewRejected = false;
  try {
    assertLockedReviewMatchesGenerated(changedLockedReview, reviewArtifact);
  } catch {
    changedLockedReviewRejected = true;
  }
  let actualInputOutputCollisionRejected = false;
  try {
    const collisionProbe = path.join(debugDir, "collision_probe.json");
    assertDistinctFilePaths([collisionProbe, collisionProbe]);
  } catch {
    actualInputOutputCollisionRejected = true;
  }
  const ratioBandSignature = day => JSON.stringify({
    energy: getActualRatioBand(day.ratios?.energy),
    protein: getActualRatioBand(day.ratios?.protein),
    carb: getActualRatioBand(day.ratios?.carb),
    fat: getActualRatioBand(day.ratios?.fat)
  });
  const expectedSourcesByPairSignature = new Map();
  const seenExpectedPairs = new Set();
  for (const result of matchedEvidence.toleranceResults) {
    for (const pair of result.pairs) {
      const canonical = [pair.left, pair.right].sort((a, b) => a.sampleId.localeCompare(b.sampleId));
      const pairKey = canonical.map(day => day.sampleId).join("|");
      if (seenExpectedPairs.has(pairKey)) continue;
      seenExpectedPairs.add(pairKey);
      const sideSignatures = canonical.map(ratioBandSignature);
      expectedSourcesByPairSignature.set([...sideSignatures].sort().join("||"), new Map([
        [sideSignatures[0], "source_1"],
        [sideSignatures[1], "source_2"]
      ]));
    }
  }
  const reviewRevealSideMappingPreserved = revealArtifact.revealMap.every(revealCase => {
    const reviewCase = reviewArtifact.reviewPacket.find(item => item.caseId === revealCase.caseId);
    if (!reviewCase) return false;
    const caseASignature = JSON.stringify({
      ...reviewCase.commonTargetRatioBands,
      ...reviewCase.caseA.targetRatioBands
    });
    const caseBSignature = JSON.stringify({
      ...reviewCase.commonTargetRatioBands,
      ...reviewCase.caseB.targetRatioBands
    });
    const expectedSources = expectedSourcesByPairSignature.get([caseASignature, caseBSignature].sort().join("||"));
    return expectedSources?.get(caseASignature) === revealCase.caseA.originalPairSide
      && expectedSources?.get(caseBSignature) === revealCase.caseB.originalPairSide;
  });
  const matchContractIds = matchedEvidence.toleranceResults.map(item => item.id);
  const tolerancePairCounts = Object.fromEntries(matchedEvidence.toleranceResults.map(item => [item.id, item.baseCore.pairCount]));
  const toleranceCoverageMonotonic = matchedEvidence.toleranceResults.every((item, index, items) => (
    index === 0
    || (item.baseCore.pairCount >= items[index - 1].baseCore.pairCount
      && item.baseCore.matchedRecordCount >= items[index - 1].baseCore.matchedRecordCount
      && item.baseCore.coverage >= items[index - 1].baseCore.coverage)
  ));
  const positiveNonMacroDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-16"));
  const macroOnlyThresholdDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-17"));
  const invalidNonMacroDays = extracted.filter(day => day.exclusionReason === "invalid_meal_non_macro_kcal");
  const nonFiniteMealEnergyDays = extracted.filter(day => day.exclusionReason === "non_finite_meal_energy_total");
  const invalidRoutineDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-27"));
  const simpleProfileRoutineDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-28"));
  const legacyDetailedDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-29"));
  const legacyCompoundDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-30"));
  const profilelessGeneralDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-01-31"));
  const invalidMarkerDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-02-01"));
  const legacyRestDay = extracted.find(day => day.sampleId === fixtureSampleId("2026-02-02"));
  const legacyDetailedProvenance = resolveActualTrainingProfileProvenance(payload.data.records[30]);
  const legacyRestProvenance = resolveActualTrainingProfileProvenance(payload.data.records[34]);
  const explicitProvenance = resolveActualTrainingProfileProvenance(payload.data.records[0]);
  const blossomFixtures = {
    triangle: maximumCardinalityMatching(["c", "a", "b"], [["b", "c"], ["c", "a"], ["a", "b"]]),
    path4: maximumCardinalityMatching(["d", "b", "a", "c"], [["c", "d"], ["b", "c"], ["a", "b"]]),
    cycle5: maximumCardinalityMatching(["e", "d", "c", "b", "a"], [["e", "a"], ["d", "e"], ["c", "d"], ["b", "c"], ["a", "b"]]),
    cycle5Reversed: maximumCardinalityMatching(["a", "b", "c", "d", "e"], [["b", "a"], ["c", "b"], ["d", "c"], ["e", "d"], ["a", "e"]])
  };
  const contrastOnlyArtifacts = buildHypothesisBlindProductMeaningReview(buildActualMatchedEvidence(
    syntheticMatchedDays.filter(day => day.sampleId.includes("contrast"))
  ));
  const separatedRoleDays = syntheticMatchedDays
    .filter(day => day.sampleId.startsWith("exact_"))
    .map(day => day.sampleId.includes("control") ? { ...day, sourceValidityKey: "synthetic_separate_control_source" } : day);
  const separatedRoleArtifacts = buildHypothesisBlindProductMeaningReview(buildActualMatchedEvidence(separatedRoleDays));
  const displayProbe = (leftRatios, rightRatios) => getActualPairDisplayContract({
    left: { sampleId: "display_left", goal: "diet", trainingContext: "rest", sourceValidityKey: "display_source", ratios: leftRatios },
    right: { sampleId: "display_right", goal: "diet", trainingContext: "rest", sourceValidityKey: "display_source", ratios: rightRatios }
  });
  const displayConfounded = displayProbe(
    { energy: 1, protein: 1, carb: 0.8, fat: 1.2 },
    { energy: 1.1, protein: 1, carb: 1.2, fat: 0.8 }
  );
  const displayOneAxisOnly = displayProbe(
    { energy: 1, protein: 1, carb: 0.8, fat: 1.2 },
    { energy: 1, protein: 1, carb: 1.2, fat: 1.2 }
  );
  const visibleAcrossSourceA = getActualPairDisplayContract({
    left: { sampleId: "source_a_left", goal: "diet", trainingContext: "rest", sourceValidityKey: "private_source_a", ratios: { energy: 1, protein: 1, carb: 0.8, fat: 1.2 } },
    right: { sampleId: "source_a_right", goal: "diet", trainingContext: "rest", sourceValidityKey: "private_source_a", ratios: { energy: 1, protein: 1, carb: 1.2, fat: 0.8 } }
  });
  const visibleAcrossSourceB = getActualPairDisplayContract({
    left: { sampleId: "source_b_left", goal: "diet", trainingContext: "rest", sourceValidityKey: "private_source_b", ratios: { energy: 1, protein: 1, carb: 0.8, fat: 1.2 } },
    right: { sampleId: "source_b_right", goal: "diet", trainingContext: "rest", sourceValidityKey: "private_source_b", ratios: { energy: 1, protein: 1, carb: 1.2, fat: 0.8 } }
  });
  const extendedInvalidOptionalValues = [null, "", " ", "abc", -1, NaN, Infinity, -Infinity, true, false, [], [1], {}];
  const reviewContractCounts = countBy(reviewArtifact.reviewPacket, item => item.matchContract);
  const invalidVariantIds = Array.from({ length: 8 }, (_, index) => fixtureSampleId(`2026-01-${String(index + 18).padStart(2, "0")}`));
  const invalidVariantFieldCoverageStable = invalidVariantIds.every((sampleId, index) => {
    const rawRecord = payload.data.records[19 + index];
    const expectedKey = index < 4 ? "alcoholKcal" : "otherKcal";
    return Object.prototype.hasOwnProperty.call(rawRecord.meals[0], expectedKey)
      && extracted.find(day => day.sampleId === sampleId)?.exclusionReason === "invalid_meal_non_macro_kcal";
  });
  const canonicalizeCounterfactualFamilies = items => [...items]
    .filter(item => item.included && item.counterfactualFamily)
    .sort((a, b) => compareCanonicalId(a.sampleId, b.sampleId))
    .map(item => JSON.stringify({ sampleId: item.sampleId, counterfactualFamily: item.counterfactualFamily }));
  const validGeneratedVariants = counterfactualExtracted
    .filter(item => item.included)
    .flatMap(item => [
      ...(item.counterfactualFamily?.variants || []),
      ...(item.counterfactualFamily?.normalizedVariants || [])
    ])
    .filter(variant => variant.valid);
  const getAttritionLane = (audit, laneId) => audit.laneResults.find(result => result.lane.id === laneId);
  const roleTrapCapabilityLane = getAttritionLane(roleTrapAttrition, "L1_current_rules_capability_first");
  const observedNarrowObservedLane = getAttritionLane(observedNarrowAttrition, "L2_fixed_observed_strict_pair_equal");
  const observedNarrowPolicyLane = getAttritionLane(observedNarrowAttrition, "L3_fixed_policy_strict_pair_equal");
  const normalizedOnlyFixedLane = getAttritionLane(normalizedOnlyAttrition, "L3_fixed_policy_strict_pair_equal");
  const normalizedOnlyNormalizedLane = getAttritionLane(normalizedOnlyAttrition, "L5_normalized_policy_strict_pair_equal");
  const equalNonzeroStrictLane = getAttritionLane(equalNonzeroAttrition, "L5_normalized_policy_strict_pair_equal");
  const equalNonzeroAllowedLane = getAttritionLane(equalNonzeroAttrition, "L9_normalized_policy_equal_nonzero");
  return {
    schemaVersion: "actual_day_source_safety_fixture_audit_v4_balanced_disjoint",
    syntheticContractOnly: true,
    sourceRecordCount: extracted.length,
    includedRecordCount: included.length,
    excludedRecordCount: excluded.length,
    exclusionReasonCounts,
    invalidEnvelopeRejected,
    missingSettingsRejected,
    coercedBackupVersionRejected,
    validSnapshotGoalOwned: included.length > 0 && included.every(day => day.goal === "diet" && day.sourceValidity?.snapshotGoalOwned === true),
    validSnapshotSources: {
      allFrozenTarget: included.length > 0 && included.every(day => day.sourceValidity?.targetAuthoritySource === "frozen_goal_snapshot"),
      allSnapshotWeight: included.length > 0 && included.every(day => day.sourceValidity?.weightSource === "goalSnapshot"),
      allRawTrainingEnergy: included.length > 0 && included.every(day => day.sourceValidity?.trainingEnergySource === "raw_goal_snapshot_production_helpers"),
      noCurrentResultFallback: included.length > 0 && included.every(day => day.sourceValidity?.currentResultFallbackUsed === false)
    },
    cardioOnlyTrainingContextOwned: included.some(day => day.trainingContext === "normal_resistance"),
    snapshotlessScoreCallsPrevented: extracted
      .filter(day => day.exclusionReason === "snapshotless")
      .every(day => day.scoreEvaluationAttempted === false),
    invalidDateScoreCallsPrevented: extracted
      .filter(day => day.exclusionReason === "invalid_record_date")
      .every(day => day.scoreEvaluationAttempted === false),
    duplicateDateScoreCallsPrevented: extracted
      .filter(day => day.exclusionReason === "duplicate_record_date")
      .every(day => day.scoreEvaluationAttempted === false),
    rawProvenanceCoercionBypassPrevented: exclusionReasonCounts.invalid_snapshot_target === 2
      && ["2026-01-05", "2026-01-12", "2026-01-13", "2026-01-14"].map(fixtureSampleId).every(sampleId => (
        extracted.find(day => day.sampleId === sampleId)?.exclusionReason === "incomplete_snapshot_training_provenance"
      )),
    strictRawNumberCoercionsRejected: ["1", true, false, [], [1], {}].every(value => !isExplicitRawFiniteNumber(value)),
    legacyMissingNonMacroKcalAllowed: ["alcoholKcal", "otherKcal"].every(key => (
      !Object.prototype.hasOwnProperty.call(payload.data.records[0].meals[0], key)
      && isValidOptionalRawNonMacroKcal(payload.data.records[0].meals[0], key)
    )) && extracted.find(day => day.sampleId === fixtureSampleId("2026-01-01"))?.included === true
      && Math.abs(extracted.find(day => day.sampleId === fixtureSampleId("2026-01-01"))?.ratios?.energy - 1) <= 1e-12
      && extracted.find(day => day.sampleId === fixtureSampleId("2026-01-01"))?.standardDrinks === 0,
    explicitFiniteNonMacroKcalAllowed: ["alcoholKcal", "otherKcal"].every(key => (
      isValidOptionalRawNonMacroKcal(payload.data.records[17].meals[0], key)
    )) && positiveNonMacroDay?.included === true,
    extendedInvalidOptionalValuesRejected: extendedInvalidOptionalValues.every(value => (
      !isValidOptionalRawNonMacroKcal({ alcoholKcal: value }, "alcoholKcal")
    )),
    invalidNonMacroVariantCoverage: invalidNonMacroDays.length,
    invalidNonMacroVariantFieldCoverageStable: invalidVariantFieldCoverageStable,
    invalidNonMacroScoreCallsPrevented: invalidNonMacroDays.length > 0
      && invalidNonMacroDays.every(day => day.scoreEvaluationAttempted === false),
    nonFiniteMealEnergyScoreCallsPrevented: nonFiniteMealEnergyDays.length === 1
      && nonFiniteMealEnergyDays.every(day => day.scoreEvaluationAttempted === false),
    allowedRoutineProvenanceEnforced: invalidRoutineDay?.exclusionReason === "incomplete_snapshot_training_provenance"
      && invalidRoutineDay.scoreEvaluationAttempted === false,
    productionSimpleProfileRoutineIncluded: simpleProfileRoutineDay?.included === true
      && simpleProfileRoutineDay.scoreEvaluationAttempted === true,
    legacyProfileRecoveryContractEnforced: legacyDetailedDay?.included === true
      && legacyRestDay?.included === true
      && legacyDetailedProvenance.valid === true
      && legacyDetailedProvenance.effectiveExerciseProfile === "bodybuilding"
      && legacyDetailedProvenance.effectiveAdvanced === true
      && legacyDetailedProvenance.trainingProfileSource === "legacy_profile_absent_expert_bodybuilding"
      && legacyRestProvenance.trainingProfileSource === "legacy_profileless_rest_profile_irrelevant"
      && explicitProvenance.trainingProfileSource === "snapshot_profile_explicit_current_schema"
      && legacyDetailedDay.sourceValidityKey !== extracted.find(day => day.sampleId === fixtureSampleId("2026-01-01"))?.sourceValidityKey,
    ambiguousLegacyAndInvalidSourceFailClosed: legacyCompoundDay?.exclusionReason === "ambiguous_legacy_compound_routine"
      && legacyCompoundDay.scoreEvaluationAttempted === false
      && profilelessGeneralDay?.exclusionReason === "incomplete_snapshot_profile_provenance"
      && profilelessGeneralDay.scoreEvaluationAttempted === false
      && invalidMarkerDay?.exclusionReason === "invalid_snapshot_source_marker"
      && invalidMarkerDay.scoreEvaluationAttempted === false,
    productionScoringKcalThresholdAligned: positiveNonMacroDay?.included === true
      && Math.abs(positiveNonMacroDay.ratios?.energy - 0.35) <= 1e-12
      && Math.abs(positiveNonMacroDay.standardDrinks - 2) <= 1e-12,
    macroOnlyBelowThresholdPrevented: macroOnlyThresholdDay?.included === false
      && macroOnlyThresholdDay.exclusionReason === "insufficient_full_day"
      && macroOnlyThresholdDay.scoreEvaluationAttempted === false,
    sourceCountBalanced: extracted.length === included.length + excluded.length,
    matchContractIds,
    tolerancePairCounts,
    toleranceCoverageMonotonic,
    baseCoreRetainsControls: matchedEvidence.toleranceResults[0].hiddenRolePotential.control.pairCount > 0
      && matchedEvidence.toleranceResults[0].baseCore.pairCount
        === matchedEvidence.toleranceResults[0].hiddenRolePotential.control.pairCount
          + matchedEvidence.toleranceResults[0].hiddenRolePotential.contrast.pairCount,
    hiddenRoleUsesDirectionAndMagnitudeClass: getActualHiddenComparisonRole(
      { optionC: { direction: "fat_heavy", residual: 0.01 } },
      { optionC: { direction: "fat_heavy", residual: 0.20 } }
    ) === "contrast" && getActualHiddenComparisonRole(
      { optionC: { direction: "fat_heavy", residual: 0.20 } },
      { optionC: { direction: "fat_heavy", residual: 0.30 } }
    ) === "control",
    maximumMatchingFixturesPass: blossomFixtures.triangle.cardinality === 1
      && blossomFixtures.path4.cardinality === 2
      && blossomFixtures.cycle5.cardinality === 2
      && JSON.stringify(blossomFixtures.cycle5) === JSON.stringify(blossomFixtures.cycle5Reversed),
    judgeabilityRejectsConfoundedAndOneAxisOnly: displayConfounded.exclusionReason === "energy_or_protein_display_confounded"
      && displayOneAxisOnly.exclusionReason === "one_macro_display_axis_only",
    emittedVisibleSignatureIgnoresHiddenSourceCohort: visibleAcrossSourceA.visibleSignature === visibleAcrossSourceB.visibleSignature,
    fivePointBandBoundariesStable: getActualRatioBand(0.949999) === "90_to_lt_95_pct_of_target"
      && getActualRatioBand(0.95) === "95_to_lt_100_pct_of_target"
      && getActualRatioBand(1.049999) === "100_to_lt_105_pct_of_target"
      && getActualRatioBand(1.05) === "105_to_lt_110_pct_of_target",
    balancedReadinessContract: hypothesisBlindArtifacts.selectionDiagnostics.preJudgmentStatus === "READY_FOR_LIMITED_BLIND_JUDGMENT"
      && hypothesisBlindArtifacts.selectionDiagnostics.reviewForUser === true
      && hypothesisBlindArtifacts.selectionDiagnostics.authorizesPolicyDecision === false
      && hypothesisBlindArtifacts.selectionDiagnostics.noSampleReuse === true
      && hypothesisBlindArtifacts.selectionDiagnostics.visibleSignaturesUnique === true
      && contrastOnlyArtifacts.selectionDiagnostics.preJudgmentStatus === "NO_BALANCED_JUDGEABLE_BLOCK"
      && separatedRoleArtifacts.selectionDiagnostics.preJudgmentStatus === "NO_BALANCED_JUDGEABLE_BLOCK",
    reviewPacketCaseCount: reviewArtifact.reviewPacket.length,
    revealMapCaseCount: revealArtifact.revealMap.length,
    reviewPacketExactAllowlistSafe: isHypothesisBlindReviewArtifactSafe(reviewArtifact),
    revealMapExactAllowlistSafe: isPostJudgmentRevealArtifactSafe(revealArtifact),
    reviewRevealHashLinked: revealArtifact.reviewPacketHash === reviewArtifact.reviewPacketHash,
    reviewRevealCaseIdsLinked: JSON.stringify(reviewCaseIds) === JSON.stringify(revealCaseIds),
    reviewRevealSideMappingPreserved,
    hypothesisBlindArtifactsDeterministic: JSON.stringify(hypothesisBlindArtifacts) === JSON.stringify(repeatedArtifacts),
    hypothesisBlindArtifactsInputOrderInvariant: JSON.stringify(hypothesisBlindArtifacts) === JSON.stringify(reversedArtifacts),
    rawBackupRecordOrderInvariant: JSON.stringify(canonicalizeExtracted(extracted))
      === JSON.stringify(canonicalizeExtracted(reversedExtracted)),
    counterfactualGenerationContract: validGeneratedVariants.length > 0
      && validGeneratedVariants.every(variant => (
        Math.abs(Number(variant.invariants?.exchangeEnergyGap)) <= 1e-9
        && Math.abs(Number(variant.invariants?.derivedScoringKcalGap)) <= 1e-9
        && Math.abs(Number(variant.invariants?.proteinGap)) <= 1e-9
        && variant.invariants?.syntheticMealClosureValid === true
        && variant.invariants?.targetAuthoritySource === "frozen_goal_snapshot"
      )),
    counterfactualAttritionLaneInventoryStable:
      syntheticCounterfactualAttrition.laneResults.length === COUNTERFACTUAL_ATTRITION_LANES.length
      && syntheticCounterfactualAttrition.predeclaredNormalizedGridFractions.join("|")
        === ACTUAL_COUNTERFACTUAL_NORMALIZED_GRID_FRACTIONS.join("|"),
    counterfactualCapabilityFirstRecoversPreassignmentTrap:
      roleTrapBaseline.reviewForUser === false
      && roleTrapCapabilityLane?.packetReady === true
      && roleTrapCapabilityLane.assignedRoleMismatchCount > 0,
    counterfactualObservedAndPolicyEvidenceLanesSeparated:
      observedNarrowObservedLane?.packetReady === false
      && observedNarrowPolicyLane?.packetReady === true
      && observedNarrowPolicyLane.structuralOutcome === "TWO_SIDED_RESIDUAL_CANDIDATE",
    counterfactualFixedAndNormalizedGridLanesSeparated:
      normalizedOnlyFixedLane?.packetReady === false
      && normalizedOnlyNormalizedLane?.packetReady === true
      && normalizedOnlyNormalizedLane.structuralOutcome === "TWO_SIDED_RESIDUAL_CANDIDATE",
    counterfactualStrictZeroAndEqualNonzeroLanesSeparated:
      equalNonzeroStrictLane?.packetReady === false
      && equalNonzeroAllowedLane?.packetReady === true
      && equalNonzeroAllowedLane.structuralOutcome === "TWO_SIDED_RESIDUAL_CANDIDATE",
    counterfactualWaterfallCoversBothDirectionsAndAllGates:
      ["fixedObserved", "fixedPolicy", "normalizedObserved", "normalizedPolicy"].every(pathKey => (
        ["contrast_carb_heavy", "contrast_fat_heavy", "null_control"].every(role => {
          const row = syntheticCounterfactualAttrition.waterfall?.[pathKey]?.[role];
          return row
            && Number.isInteger(row.totalAnchors)
            && Number.isInteger(row.directionUnreachable)
            && Number.isInteger(row.supportRejectAfterDirection)
            && Number.isInteger(row.policyEnvelopeRejectAfterSupport)
            && Number.isInteger(row.pairNonJointExactReject)
            && Number.isInteger(row.anchorVectorExactReject)
            && Number.isInteger(row.strictVariantCoreZeroReject)
            && Number.isInteger(row.displayFivePointReject)
            && Number.isInteger(row.displayOffsetTwoPointFiveReject)
            && row.anchorCoreZeroPass + row.anchorCoreZeroReject === row.totalAnchors
            && row.directionReachable + row.directionUnreachable === row.totalAnchors
            && row.supportPass + row.supportRejectAfterDirection === row.directionReachable
            && row.policyEnvelopePassAfterSupport + row.policyEnvelopeRejectAfterSupport === row.supportPass
            && row.pairNonJointExactPass + row.pairNonJointExactReject === row.policyEnvelopePassAfterSupport
            && row.anchorVectorExactPass + row.anchorVectorExactReject === row.pairNonJointExactPass
            && row.strictVariantCoreZeroPass + row.strictVariantCoreZeroReject === row.anchorVectorExactPass
            && row.displayFivePointPass + row.displayFivePointReject === row.strictVariantCoreZeroPass
            && row.displayOffsetTwoPointFivePass + row.displayOffsetTwoPointFiveReject === row.displayFivePointPass;
        })
      )),
    counterfactualRawOrderInvariant: JSON.stringify(canonicalizeCounterfactualFamilies(counterfactualExtracted))
      === JSON.stringify(canonicalizeCounterfactualFamilies(reversedCounterfactualExtracted)),
    counterfactualGeneratorIgnoresInjectedHypothesisMetadata: JSON.stringify(canonicalizeCounterfactualFamilies(counterfactualExtracted))
      === JSON.stringify(canonicalizeCounterfactualFamilies(metadataInjectedCounterfactualExtracted)),
    counterfactualBalancedFixtureReady: syntheticCounterfactualEvidence.preJudgmentStatus === "READY_FOR_COUNTERFACTUAL_BLIND_JUDGMENT"
      && syntheticCounterfactualEvidence.reviewForUser === true
      && syntheticCounterfactualEvidence.selectedBlocks.length === 6
      && syntheticCounterfactualEvidence.selectedCases.length === 12
      && syntheticCounterfactualEvidence.selectedPublicContexts.length >= 2
      && syntheticCounterfactualEvidence.selectedRoleCounts.null_control === 6
      && syntheticCounterfactualEvidence.selectedRoleCounts.contrast_carb_heavy === 3
      && syntheticCounterfactualEvidence.selectedRoleCounts.contrast_fat_heavy === 3,
    counterfactualReviewPacketSafe: syntheticCounterfactualArtifacts.reviewArtifact.reviewPacket.length === 12
      && syntheticCounterfactualArtifacts.revealArtifact.revealMap.length === 12
      && syntheticCounterfactualBundleSafe === true,
    counterfactualSelectionInputOrderInvariant: JSON.stringify(syntheticCounterfactualArtifacts)
      === JSON.stringify(reversedSyntheticCounterfactualArtifacts),
    counterfactualAlternativePairOptionsExercised:
      syntheticCounterfactualEvidence.eligibleCases.some(item => item.pairOptions.length > 1)
      && syntheticCounterfactualEvidence.selectedCases.some(item => (
        item.pair.pairKey !== item.pairOptions[0].pairKey
      ))
      && capabilityPairSearch.selectedBlocks.length === ACTUAL_COUNTERFACTUAL_MAX_BALANCED_BLOCKS
      && capabilityPairSearchSelectedCases.some(item => item.pair.pairKey !== item.pairOptions[0].pairKey)
      && capabilityPairSearchSelectionKey(capabilityPairSearch)
        === capabilityPairSearchSelectionKey(reversedCapabilityPairSearch),
    counterfactualLockedReviewGuard: lockedCounterfactualReviewSameInputAccepted === true
      && changedLockedCounterfactualReviewRejected === true,
    counterfactualJudgmentContractGuard:
      isCounterfactualJudgmentArtifactSafe(
        confirmedTwoSidedJudgmentArtifact,
        syntheticCounterfactualArtifacts.reviewArtifact
      ) === true
      && JSON.stringify(confirmedTwoSidedJudgmentArtifact) === JSON.stringify(repeatedConfirmedJudgmentArtifact)
      && invalidCounterfactualJudgmentsRejected === true,
    counterfactualRevealRequiresConfirmedUnchangedJudgment:
      unconfirmedCounterfactualRevealRejected === true
      && changedAfterConfirmationJudgmentRejected === true,
    counterfactualJudgmentBoundRevealSafe:
      isJudgmentBoundCounterfactualRevealArtifactSafe(judgmentBoundCounterfactualReveal) === true
      && judgmentBoundCounterfactualReveal.reviewPacketHash
        === syntheticCounterfactualArtifacts.reviewArtifact.reviewPacketHash
      && judgmentBoundCounterfactualReveal.judgmentSetHash
        === confirmedTwoSidedJudgmentArtifact.judgmentSetHash,
    counterfactualInterpretationRulesStable:
      interpretationOutcomes.twoSided.outcome === "TWO_SIDED_PRODUCT_MEANING_CANDIDATE"
      && interpretationOutcomes.carbOnly.outcome === "ONE_SIDED_CARB_PRODUCT_MEANING_CANDIDATE"
      && interpretationOutcomes.fatOnly.outcome === "ONE_SIDED_FAT_PRODUCT_MEANING_CANDIDATE"
      && interpretationOutcomes.redundant.outcome === "JOINT_REDUNDANT_CANDIDATE"
      && interpretationOutcomes.controlNoise.outcome === "JUDGMENT_INSUFFICIENT"
      && interpretationOutcomes.controlNoise.stopReasons.includes("control_directional_noise_threshold_reached")
      && interpretationOutcomes.cannotTell.outcome === "JUDGMENT_INSUFFICIENT"
      && interpretationOutcomes.cannotTell.stopReasons.includes("cannot_tell_threshold_reached")
      && interpretationOutcomes.reverseConflict.outcome === "JUDGMENT_INSUFFICIENT"
      && interpretationOutcomes.reverseConflict.stopReasons.includes("carb_reverse_direction_conflict"),
    counterfactualMalformedAndPartialArtifactsFailClosed:
      isActualAnchoredCounterfactualReviewArtifactSafe(partialInsufficientCounterfactualReview) === false
      && malformedCounterfactualReviewRejectedWithoutThrow === true
      && malformedCounterfactualRevealRejectedWithoutThrow === true,
    counterfactualRevealCoherenceAndSideBindingGuard:
      isActualAnchoredCounterfactualRevealArtifactSafe(incoherentCounterfactualReveal) === false
      && swappedCounterfactualSideBindingRejected === true,
    counterfactualOneDirectionFailsClosed: oneDirectionCounterfactualEvidence.preJudgmentStatus
        === "COUNTERFACTUAL_PACKET_INSUFFICIENT"
      && oneDirectionCounterfactualEvidence.reviewForUser === false
      && oneDirectionCounterfactualArtifacts.reviewArtifact.reviewPacket.length === 0
      && oneDirectionCounterfactualArtifacts.revealArtifact.revealMap.length === 0
      && oneDirectionCounterfactualBundleSafe === true,
    deterministicShuffleBothOrientationsCovered: caseASources.includes("source_1") && caseASources.includes("source_2"),
    narrowestToleranceOwnsDeduplicatedPairs: reviewArtifact.reviewPacket.length === 6
      && reviewContractCounts.exact === 2
      && reviewContractCounts.tolerance_0_25 === 2
      && reviewContractCounts.tolerance_1_00 === 2,
    reviewAndRevealPhysicallySeparable: !Object.prototype.hasOwnProperty.call(reviewArtifact, "revealMap")
      && !Object.prototype.hasOwnProperty.call(revealArtifact, "reviewPacket"),
    generatedArtifactBundleSafe,
    lockedReviewSameInputAccepted,
    changedLockedReviewRejected,
    actualInputOutputCollisionRejected,
    actualOutputDebugPathPolicyCovered: isPathInsideDirectory(path.join(debugDir, "fixture.json"), debugDir)
      && !isPathInsideDirectory(path.join(root, "docs", "fixture.json"), debugDir)
  };
}

function summarizeTargetMatrix(cases){
  const isExact100 = score => Number.isFinite(score) && Math.abs(score - 100) <= 1e-6;
  const currentNon100 = cases.filter(item => !isExact100(item.current.percent));
  const currentBelow95 = cases.filter(item => Number(item.current.percent) < 95 - 1e-6);
  const invalidTargets = cases.filter(item => !item.validity.valid);
  const invalidProductionAuthority = cases.filter(item => item.current.targetAuthority?.valid !== true);
  const nonZeroPenaltyAxes = cases.filter(item => item.current.ninePenaltyAxesZero !== true);
  const missingJointGeometry = cases.filter(item => !item.jointGeometry);
  return {
    caseCount: cases.length,
    currentExact100Count: cases.length - currentNon100.length,
    currentNon100Count: currentNon100.length,
    currentBelow95Count: currentBelow95.length,
    currentNon100Ids: currentNon100.map(item => item.id),
    validityPassCount: cases.length - invalidTargets.length,
    validityFailCount: invalidTargets.length,
    validityFailIds: invalidTargets.map(item => item.id),
    productionAuthorityPassCount: cases.length - invalidProductionAuthority.length,
    productionAuthorityFailCount: invalidProductionAuthority.length,
    productionAuthorityFailIds: invalidProductionAuthority.map(item => item.id),
    ninePenaltyAxesZeroCount: cases.length - nonZeroPenaltyAxes.length,
    ninePenaltyAxesNonZeroCount: nonZeroPenaltyAxes.length,
    ninePenaltyAxesNonZeroIds: nonZeroPenaltyAxes.map(item => item.id),
    jointGeometryAvailableCount: cases.length - missingJointGeometry.length,
    jointGeometryMissingCount: missingJointGeometry.length,
    jointGeometryMissingIds: missingJointGeometry.map(item => item.id)
  };
}

const productionPenaltyAxes = Object.freeze([
  "targetEnergyDeviationPenalty",
  "tdeeOverloadPenalty",
  "proteinShortagePenalty",
  "proteinExcessEfficiencyPenalty",
  "fatRangePenalty",
  "carbExerciseContextPenalty",
  "carbFatExchangeFailurePenalty",
  "alcoholPhysiologyPenalty",
  "dataOutlierPenalty"
]);
const productionNonJointPenaltyAxes = Object.freeze(
  productionPenaltyAxes.filter(key => key !== "carbFatExchangeFailurePenalty")
);

function buildProductionGeometrySweep(cases, productionOwnershipRows = []){
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  const neutralZoneScales = [0.98, 1, 1.02];
  const perGeometry = [];
  const allEvaluated = [];
  const coreMatchedExamples = [];
  const historicalCoreMatchedExamples = [];
  const duplicateProductionSampleIds = [];
  const productionBySampleId = new Map();
  for (const row of productionOwnershipRows) {
    if (productionBySampleId.has(row.sampleId)) duplicateProductionSampleIds.push(row.sampleId);
    else productionBySampleId.set(row.sampleId, row);
  }

  const findMatchedPair = (evaluated, signatureKey, completenessKey) => {
    const groups = new Map();
    evaluated.filter(item => item.valid && item[completenessKey]).forEach(item => {
      const list = groups.get(item[signatureKey]) || [];
      list.push(item);
      groups.set(item[signatureKey], list);
    });
    for (const [coreSignature, group] of groups) {
      const sorted = [...group].sort((a, b) => a.residual - b.residual || (a.pointId < b.pointId ? -1 : 1));
      if (sorted.length > 1 && sorted[sorted.length - 1].residual - sorted[0].residual > 1e-9) {
        return {
          coreSignature,
          lowerResidualPoint: { pointId: sorted[0].pointId, residual: round(sorted[0].residual, 12), direction: sorted[0].direction },
          higherResidualPoint: { pointId: sorted[sorted.length - 1].pointId, residual: round(sorted[sorted.length - 1].residual, 12), direction: sorted[sorted.length - 1].direction }
        };
      }
    }
    return null;
  };

  for (const productionCase of cases) {
    const geometry = productionCase.jointGeometry;
    const rawCarbs = geometry?.rawRanges?.carbs;
    const rawFat = geometry?.rawRanges?.fat;
    const jointCarbs = geometry?.jointRanges?.carbs;
    const jointFat = geometry?.jointRanges?.fat;
    const required = [
      productionCase.target?.kcal,
      geometry?.proteinReservedG,
      geometry?.availableCarbFatKcal,
      rawCarbs?.min,
      rawCarbs?.max,
      rawFat?.min,
      rawFat?.max,
      jointCarbs?.min,
      jointCarbs?.max,
      jointFat?.min,
      jointFat?.max
    ].map(Number);
    if (!geometry || !required.every(Number.isFinite)) {
      perGeometry.push({
        id: productionCase.id,
        matrixKind: productionCase.matrixKind,
        valid: false,
        status: "missing_production_geometry",
        sampleCount: 0
      });
      continue;
    }

    const targetKcal = Number(productionCase.target.kcal);
    const proteinReservedG = Number(geometry.proteinReservedG);
    const availableKcal = Number(geometry.availableCarbFatKcal);
    const points = new Map();
    const addPoint = (id, carbG, fatG, source) => {
      if (![carbG, fatG].every(Number.isFinite) || carbG < 0 || fatG < 0) return;
      const key = `${round(carbG, 9)}|${round(fatG, 9)}`;
      if (!points.has(key)) points.set(key, { id, carbG, fatG, source });
    };
    fractions.forEach((carbFraction, carbIndex) => {
      const carbG = Number(rawCarbs.min) + (Number(rawCarbs.max) - Number(rawCarbs.min)) * carbFraction;
      fractions.forEach((fatFraction, fatIndex) => {
        const fatG = Number(rawFat.min) + (Number(rawFat.max) - Number(rawFat.min)) * fatFraction;
        addPoint(`raw_${carbIndex}_${fatIndex}`, carbG, fatG, "raw_rectangle_grid");
      });
      neutralZoneScales.forEach((scale, scaleIndex) => {
        const fatG = (availableKcal * scale - carbG * 4) / 9;
        if (fatG >= Number(rawFat.min) - 1e-9 && fatG <= Number(rawFat.max) + 1e-9) {
          addPoint(`neutral_c_${carbIndex}_${scaleIndex}`, carbG, fatG, "target_energy_neutral_zone");
        }
      });
    });
    fractions.forEach((fatFraction, fatIndex) => {
      const fatG = Number(rawFat.min) + (Number(rawFat.max) - Number(rawFat.min)) * fatFraction;
      neutralZoneScales.forEach((scale, scaleIndex) => {
        const carbG = (availableKcal * scale - fatG * 9) / 4;
        if (carbG >= Number(rawCarbs.min) - 1e-9 && carbG <= Number(rawCarbs.max) + 1e-9) {
          addPoint(`neutral_f_${fatIndex}_${scaleIndex}`, carbG, fatG, "target_energy_neutral_zone");
        }
      });
    });

    const evaluated = [...points.values()].map(point => {
      const totalKcal = proteinReservedG * 4 + point.carbG * 4 + point.fatG * 9;
      const input = {
        targetKcal,
        targetProteinG: proteinReservedG,
        proteinReservedG,
        availableCarbFatKcal: availableKcal,
        rawCarbMinG: Number(rawCarbs.min),
        rawCarbMaxG: Number(rawCarbs.max),
        rawFatMinG: Number(rawFat.min),
        rawFatMaxG: Number(rawFat.max),
        carbMinG: Number(rawCarbs.min),
        carbMaxG: Number(rawCarbs.max),
        fatMinG: Number(rawFat.min),
        fatMaxG: Number(rawFat.max),
        jointCarbMinG: Number(jointCarbs.min),
        jointCarbMaxG: Number(jointCarbs.max),
        jointFatMinG: Number(jointFat.min),
        jointFatMaxG: Number(jointFat.max),
        carbG: point.carbG,
        fatG: point.fatG,
        totalKcal,
        collapsed: geometry.collapsed === true
      };
      const c1 = optionC1CarbEnergyShareResidual(input);
      const c2 = optionC2RadialKcalPlaneResidual(input);
      const historicalCore = simplifiedHistoricalCorePenalty(input);
      const residualPositive = c1.valid && c1.ratio > OPTION_C_EPSILON;
      const historicalCoreAllZero = [historicalCore.energyPenalty, historicalCore.carbPenalty, historicalCore.fatPenalty]
        .every(value => Number.isFinite(value) && Math.abs(value) <= OPTION_C_EPSILON);
      const sampleId = `${productionCase.id}::${point.id}`;
      const productionEvaluation = productionBySampleId.get(sampleId) || null;
      const coordinateMatches = !!productionEvaluation
        && productionEvaluation.coordinate?.carbG === round(point.carbG, 9)
        && productionEvaluation.coordinate?.fatG === round(point.fatG, 9);
      const productionPenaltyBreakdown = productionEvaluation?.penaltyBreakdown || null;
      const productionNonJointPenalties = Object.fromEntries(productionNonJointPenaltyAxes.map(key => [
        key,
        Number(productionPenaltyBreakdown?.[key])
      ]));
      const productionActiveNonJointAxes = productionNonJointPenaltyAxes.filter(key => (
        Number.isFinite(productionNonJointPenalties[key])
        && productionNonJointPenalties[key] > OPTION_C_EPSILON
      ));
      const productionOwnershipComplete = !!productionEvaluation
        && coordinateMatches
        && productionEvaluation.productionSource === "getMacroRangeProductionScoreSummary"
        && productionEvaluation.sourceAuthority?.scoreSourceComplete === true
        && productionEvaluation.sourceAuthority?.nonJointPenaltyBreakdownComplete === true
        && productionEvaluation.sourceAuthority?.targetAuthorityComplete === true
        && productionNonJointPenaltyAxes.every(key => (
          Number.isFinite(productionNonJointPenalties[key])
          && productionNonJointPenalties[key] >= 0
        ));
      const productionCoreAllZero = productionOwnershipComplete
        && productionActiveNonJointAxes.length === 0;
      const historicalActiveAxes = [
        ["energy", historicalCore.energyPenalty],
        ["carb", historicalCore.carbPenalty],
        ["fat", historicalCore.fatPenalty]
      ].filter(([, value]) => Number(value) > OPTION_C_EPSILON).map(([key]) => key);
      const historicalClassification = !residualPositive
        ? "residual_zero"
        : (historicalCoreAllZero ? "core_unique" : "core_overlap");
      const productionClassification = !residualPositive
        ? "residual_zero"
        : (!productionOwnershipComplete
          ? "unclassified_source_incomplete"
          : (productionCoreAllZero ? "core_unique" : "core_overlap"));
      const ownershipChanged = residualPositive
        && productionOwnershipComplete
        && historicalClassification !== productionClassification;
      const driftReasons = ownershipChanged
        ? [
            `${historicalClassification}_to_${productionClassification}`,
            productionActiveNonJointAxes.length
              ? `production_active_non_joint_axes:${productionActiveNonJointAxes.join("|")}`
              : "production_non_joint_8_axis_vector_all_zero",
            historicalActiveAxes.length
              ? `historical_simplified_active_axes:${historicalActiveAxes.join("|")}`
              : "historical_simplified_energy_carb_fat_all_zero"
          ]
        : [];
      return {
        sampleId,
        caseId: productionCase.id,
        matrixKind: productionCase.matrixKind,
        pointId: point.id,
        source: point.source,
        valid: c1.valid && c2.valid,
        residual: c1.ratio,
        direction: c1.direction,
        availableKcalSource: c1.feasible?.availableKcalSource || null,
        c1C2Delta: c1.valid && c2.valid ? Math.abs(c1.ratio - c2.ratio) : null,
        productionOwnership: {
          source: productionEvaluation?.productionSource || null,
          complete: productionOwnershipComplete,
          coordinateMatches,
          nonJointPenaltyAxes: productionNonJointPenalties,
          activeNonJointPenaltyAxes: productionActiveNonJointAxes,
          classification: productionClassification,
          targetAuthoritySource: productionEvaluation?.sourceAuthority?.targetAuthoritySource || null,
          targetAuthorityCorrectionVersion: productionEvaluation?.sourceAuthority?.targetAuthorityCorrectionVersion || null
        },
        historicalSimplifiedCore: {
          energy: historicalCore.energyPenalty,
          carb: historicalCore.carbPenalty,
          fat: historicalCore.fatPenalty,
          total: historicalCore.total,
          activeAxes: historicalActiveAxes,
          classification: historicalClassification
        },
        productionOwnershipComplete,
        ownershipChanged,
        driftReasons,
        residualPositive,
        uniqueResidual: residualPositive && productionOwnershipComplete && productionCoreAllZero,
        coreOverlap: residualPositive && productionOwnershipComplete && !productionCoreAllZero,
        productionCoreSignature: productionNonJointPenaltyAxes.map(key => round(productionNonJointPenalties[key], 9)).join("|"),
        historicalUniqueResidual: residualPositive && historicalCoreAllZero,
        historicalCoreOverlap: residualPositive && !historicalCoreAllZero,
        historicalCoreSignature: [historicalCore.energyPenalty, historicalCore.carbPenalty, historicalCore.fatPenalty]
          .map(value => round(value, 9)).join("|")
      };
    });
    allEvaluated.push(...evaluated);
    const matchedPair = findMatchedPair(evaluated, "productionCoreSignature", "productionOwnershipComplete");
    if (matchedPair) coreMatchedExamples.push({ caseId: productionCase.id, ...matchedPair });
    const historicalMatchedPair = findMatchedPair(evaluated, "historicalCoreSignature", "valid");
    if (historicalMatchedPair) historicalCoreMatchedExamples.push({ caseId: productionCase.id, ...historicalMatchedPair });
    const positive = evaluated.filter(item => item.residualPositive);
    const availableKcalSources = [...new Set(evaluated.map(item => item.availableKcalSource))];
    perGeometry.push({
      id: productionCase.id,
      matrixKind: productionCase.matrixKind,
      valid: evaluated.every(item => item.valid),
      status: evaluated.every(item => item.valid) ? "valid" : "invalid_sample",
      sampleCount: evaluated.length,
      targetEnergyNeutralSampleCount: evaluated.filter(item => item.source === "target_energy_neutral_zone").length,
      residualPositiveCount: positive.length,
      uniqueResidualCaseCount: positive.filter(item => item.uniqueResidual).length,
      coreOverlapCount: positive.filter(item => item.coreOverlap).length,
      productionUnclassifiedCount: positive.filter(item => !item.productionOwnership.complete).length,
      historicalSimplifiedUniqueResidualCaseCount: positive.filter(item => item.historicalUniqueResidual).length,
      historicalSimplifiedCoreOverlapCount: positive.filter(item => item.historicalCoreOverlap).length,
      ownershipChangedCount: positive.filter(item => item.ownershipChanged).length,
      coreMatchedPairFound: !!matchedPair,
      historicalSimplifiedCoreMatchedPairFound: !!historicalMatchedPair,
      availableKcalSource: availableKcalSources.length === 1 ? availableKcalSources[0] : "mixed_or_invalid",
      maximumResidual: round(Math.max(0, ...evaluated.map(item => Number(item.residual) || 0)), 12),
      maximumC1C2Delta: round(Math.max(0, ...evaluated.map(item => Number(item.c1C2Delta) || 0)), 15)
    });
  }

  const positive = allEvaluated.filter(item => item.residualPositive);
  const uniquePositive = positive.filter(item => item.uniqueResidual);
  const overlappingPositive = positive.filter(item => item.coreOverlap);
  const productionUnclassifiedPositive = positive.filter(item => !item.productionOwnership.complete);
  const historicalUniquePositive = positive.filter(item => item.historicalUniqueResidual);
  const historicalOverlappingPositive = positive.filter(item => item.historicalCoreOverlap);
  const changed = positive.filter(item => item.ownershipChanged);
  const unchanged = positive.filter(item => item.productionOwnership.complete && !item.ownershipChanged);
  const expectedSampleIds = new Set(allEvaluated.map(item => item.sampleId));
  const returnedSampleIds = new Set(productionOwnershipRows.map(item => item.sampleId));
  const missingProductionSampleIds = [...expectedSampleIds].filter(id => !returnedSampleIds.has(id));
  const unexpectedProductionSampleIds = [...returnedSampleIds].filter(id => !expectedSampleIds.has(id));
  const coordinateMismatchIds = allEvaluated
    .filter(item => !item.productionOwnership.coordinateMatches)
    .map(item => item.sampleId);
  const sourceIncompleteIds = allEvaluated
    .filter(item => productionBySampleId.get(item.sampleId)?.sourceAuthority?.scoreSourceComplete !== true)
    .map(item => item.sampleId);
  const nonJointAxisIncompleteIds = allEvaluated
    .filter(item => productionBySampleId.get(item.sampleId)?.sourceAuthority?.nonJointPenaltyBreakdownComplete !== true)
    .map(item => item.sampleId);
  const penaltyAxisKeySetIncompleteIds = allEvaluated
    .filter(item => productionBySampleId.get(item.sampleId)?.sourceAuthority?.penaltyAxisKeySetExact !== true)
    .map(item => item.sampleId);
  const targetAuthorityIncompleteIds = allEvaluated
    .filter(item => productionBySampleId.get(item.sampleId)?.sourceAuthority?.targetAuthorityComplete !== true)
    .map(item => item.sampleId);
  const productionSourceMismatchIds = allEvaluated
    .filter(item => productionBySampleId.get(item.sampleId)?.productionSource !== "getMacroRangeProductionScoreSummary")
    .map(item => item.sampleId);
  const driftTransitions = changed.reduce((counts, item) => {
    const key = `${item.historicalSimplifiedCore.classification}_to_${item.productionOwnership.classification}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const curvePenaltyDistributions = Object.fromEntries(Object.keys(optionCCurveProbeDefinitions).map(name => [
    name,
    {
      unique: summarizePlainValues(uniquePositive.map(item => evaluateOptionCCurveProbes(item.residual)?.[name])),
      overlap: summarizePlainValues(overlappingPositive.map(item => evaluateOptionCCurveProbes(item.residual)?.[name]))
    }
  ]));
  return {
    schemaVersion: "option_c_production_geometry_sweep_v2",
    ownershipPrimary: "production_exact_getMacroRangeProductionScoreSummary_non_joint_8_axis_vector",
    ownershipSecondary: "historical_simplified_energy_carb_fat_helper",
    productionPenaltyAxes,
    productionNonJointPenaltyAxes,
    geometryCount: cases.length,
    validGeometryCount: perGeometry.filter(item => item.valid).length,
    sampleCount: allEvaluated.length,
    targetEnergyNeutralSampleCount: allEvaluated.filter(item => item.source === "target_energy_neutral_zone").length,
    residualPositiveCount: positive.length,
    uniqueResidualCaseCount: uniquePositive.length,
    coreOverlapCount: overlappingPositive.length,
    productionUnclassifiedCount: productionUnclassifiedPositive.length,
    overlapAccountingComplete: productionUnclassifiedPositive.length === 0
      && positive.every(item => item.uniqueResidual !== item.coreOverlap),
    coreMatchedGeometryCount: perGeometry.filter(item => item.coreMatchedPairFound).length,
    historicalSimplified: {
      residualPositiveCount: positive.length,
      uniqueResidualCaseCount: historicalUniquePositive.length,
      coreOverlapCount: historicalOverlappingPositive.length,
      overlapAccountingComplete: positive.every(item => item.historicalUniqueResidual !== item.historicalCoreOverlap),
      coreMatchedGeometryCount: perGeometry.filter(item => item.historicalSimplifiedCoreMatchedPairFound).length,
      coreMatchedExamples: historicalCoreMatchedExamples.slice(0, 12)
    },
    productionSourceAuthorityCompleteness: {
      productionSource: "getMacroRangeProductionScoreSummary",
      expectedSampleCount: allEvaluated.length,
      returnedSampleCount: productionOwnershipRows.length,
      matchedSampleIdCount: allEvaluated.length - missingProductionSampleIds.length,
      missingProductionSampleIds,
      unexpectedProductionSampleIds,
      duplicateProductionSampleIds,
      coordinateMatchCount: allEvaluated.length - coordinateMismatchIds.length,
      coordinateMismatchIds,
      scoreSourceCompleteCount: allEvaluated.length - sourceIncompleteIds.length,
      scoreSourceIncompleteIds: sourceIncompleteIds,
      nonJointPenaltyAxesCompleteCount: allEvaluated.length - nonJointAxisIncompleteIds.length,
      nonJointPenaltyAxesIncompleteIds: nonJointAxisIncompleteIds,
      exactNinePenaltyAxisKeySetCount: allEvaluated.length - penaltyAxisKeySetIncompleteIds.length,
      penaltyAxisKeySetIncompleteIds,
      targetAuthorityCompleteCount: allEvaluated.length - targetAuthorityIncompleteIds.length,
      targetAuthorityIncompleteIds,
      productionSourceMatchCount: allEvaluated.length - productionSourceMismatchIds.length,
      productionSourceMismatchIds,
      complete: missingProductionSampleIds.length === 0
        && unexpectedProductionSampleIds.length === 0
        && duplicateProductionSampleIds.length === 0
        && coordinateMismatchIds.length === 0
        && sourceIncompleteIds.length === 0
        && nonJointAxisIncompleteIds.length === 0
        && penaltyAxisKeySetIncompleteIds.length === 0
        && targetAuthorityIncompleteIds.length === 0
        && productionSourceMismatchIds.length === 0
    },
    ownershipDrift: {
      comparisonCount: changed.length + unchanged.length,
      changedSampleCount: changed.length,
      unchangedSampleCount: unchanged.length,
      transitions: driftTransitions,
      accountingComplete: changed.length + unchanged.length + productionUnclassifiedPositive.length === positive.length,
      changedSamples: changed.map(item => ({
        sampleId: item.sampleId,
        caseId: item.caseId,
        pointId: item.pointId,
        source: item.source,
        historicalClassification: item.historicalSimplifiedCore.classification,
        productionClassification: item.productionOwnership.classification,
        reasons: item.driftReasons,
        historicalActiveAxes: item.historicalSimplifiedCore.activeAxes,
        productionActiveNonJointAxes: item.productionOwnership.activeNonJointPenaltyAxes
      }))
    },
    jointModelAuthorityGeometryCount: perGeometry.filter(item => item.availableKcalSource === "joint_allocation_model").length,
    c1C2MaximumAbsoluteDelta: round(Math.max(0, ...allEvaluated.map(item => Number(item.c1C2Delta) || 0)), 15),
    residualDistributions: {
      unique: summarizePlainValues(uniquePositive.map(item => item.residual)),
      overlap: summarizePlainValues(overlappingPositive.map(item => item.residual))
    },
    curvePenaltyDistributions,
    coreMatchedExamples: coreMatchedExamples.slice(0, 12),
    perGeometry
  };
}

function buildOptionCDecisionEvidence(fixtures){
  const valid = fixtures.filter(item => item.residuals?.c1_carb_energy_share?.valid === true);
  const residualPositive = valid.filter(item => Number(item.residuals.c1_carb_energy_share.ratio) > OPTION_C_EPSILON);
  const uniqueResidual = residualPositive.filter(item => item.coreOverlap?.uniqueResidual === true);
  const coreOverlap = residualPositive.filter(item => item.coreOverlap?.overlap === true);
  const c1C2Deltas = valid.map(item => item.residuals.c1C2AbsoluteDelta).filter(Number.isFinite);
  const c1C3Comparable = valid.filter(item => Number.isFinite(item.residuals?.c3_legacy_normalized_carb?.ratio));
  const c1C3Divergent = c1C3Comparable.filter(item => Math.abs(
    item.residuals.c1_carb_energy_share.ratio - item.residuals.c3_legacy_normalized_carb.ratio
  ) > 1e-9);
  const categoryCounts = fixtures.reduce((counts, item) => {
    const category = item.category || "uncategorized";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const overlapByCoreAxis = {
    energy: coreOverlap.filter(item => item.coreOverlap.axes.energy).length,
    carb: coreOverlap.filter(item => item.coreOverlap.axes.carb).length,
    fat: coreOverlap.filter(item => item.coreOverlap.axes.fat).length
  };
  const curvePenaltySummary = Object.fromEntries(Object.keys(optionCCurveProbeDefinitions).map(name => [
    name,
    summarizePlainValues(valid.map(item => item.candidatePenalties?.[name]))
  ]));
  return {
    fixtureCount: fixtures.length,
    validFormulaCaseCount: valid.length,
    invalidOrCollapsedCaseCount: fixtures.length - valid.length,
    residualPositiveCount: residualPositive.length,
    uniqueResidualCaseCount: uniqueResidual.length,
    coreOverlapCount: coreOverlap.length,
    overlapAccountingComplete: uniqueResidual.length + coreOverlap.length === residualPositive.length,
    overlapByCoreAxis,
    c1C2Equivalence: {
      comparedCount: c1C2Deltas.length,
      maximumAbsoluteDelta: c1C2Deltas.length ? Math.max(...c1C2Deltas) : null
    },
    c3LegacyBaseline: {
      disposition: "DROP",
      comparedCount: c1C3Comparable.length,
      divergentFromC1Count: c1C3Divergent.length
    },
    categoryCounts,
    curveProbeApproval: Object.fromEntries(Object.entries(optionCCurveProbeDefinitions).map(([name, definition]) => [name, definition.approved === true])),
    curvePenaltySummary,
    uniqueResidualFixtureIds: uniqueResidual.map(item => item.id),
    coreOverlapFixtureIds: coreOverlap.map(item => item.id)
  };
}

function getFixtureResidual(fixtures, id){
  return fixtures.find(item => item.id === id)?.residuals?.c1_carb_energy_share?.ratio;
}

function getOrderedResidualSeries(fixtures, prefix){
  return fixtures
    .filter(item => item.id.startsWith(prefix))
    .sort((a, b) => a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))
    .map(item => item.residuals?.c1_carb_energy_share?.ratio);
}

function isNonDecreasingFinite(values, tolerance = 1e-12){
  return values.length > 0
    && values.every(Number.isFinite)
    && values.every((value, index) => index === 0 || value + tolerance >= values[index - 1]);
}

function isStrictlyIncreasingFinite(values, tolerance = 1e-12){
  return values.length > 1
    && values.every(Number.isFinite)
    && values.every((value, index) => index === 0 || value > values[index - 1] + tolerance);
}

function toCsv(ledger){
  const rows = [["section", "fixture", "model", "score_or_penalty", "band", "detail"]];
  for (const fixture of ledger.symmetricFixtures) {
    for (const [model, result] of Object.entries(fixture.results)) {
      rows.push(["aggregation", fixture.id, model, result.score, result.band, fixture.expectation]);
    }
  }
  for (const fixture of ledger.jointFixtures) {
    for (const [model, result] of Object.entries(fixture.results)) {
      rows.push(["joint", fixture.id, model, result.penalty, "", `historicalSimplifiedCore=${fixture.simplifiedHistoricalCorePenalty.total}`]);
    }
    for (const [model, penalty] of Object.entries(fixture.candidatePenalties || {})) {
      rows.push(["option_c_curve", fixture.id, model, penalty, "", `residual=${fixture.residuals.c1_carb_energy_share.ratio}`]);
    }
  }
  for (const fixture of ledger.targetMatrix.cases) {
    rows.push(["target", fixture.id, "current", fixture.current.percent, scoreBand(fixture.current.percent), `valid=${fixture.validity.valid}`]);
  }
  for (const fixture of ledger.crossProfileSmoke.cases) {
    rows.push(["cross_profile", fixture.id, "current", fixture.current.percent, scoreBand(fixture.current.percent), `valid=${fixture.validity.valid}`]);
  }
  return rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n") + "\n";
}

function makeAssertion(name, pass, detail){
  return { name, pass: !!pass, detail };
}

(async () => {
  const symmetricFixtures = buildSymmetricFixtures();
  const modelScreening = buildModelScreening(symmetricFixtures);
  const jointFixtures = buildJointFixtures();
  const productionMatrices = await buildTargetMatrix();
  const targetCases = productionMatrices.targetCases;
  const crossProfileCases = productionMatrices.crossProfileCases;
  const actualAuditRoutineVocabulary = {
    simple: [...ACTUAL_AUDIT_SIMPLE_ROUTINES].sort(),
    advancedByProfile: Object.fromEntries(
      [...ACTUAL_AUDIT_ADVANCED_ROUTINES_BY_PROFILE.entries()].map(([profile, routines]) => [profile, [...routines].sort()])
    )
  };
  const actualAuditRoutineVocabularyMatchesProduction = JSON.stringify(actualAuditRoutineVocabulary)
    === JSON.stringify(productionMatrices.actualAuditRoutineVocabulary);
  const targetSummary = summarizeTargetMatrix(targetCases);
  const crossProfileSummary = summarizeTargetMatrix(crossProfileCases);
  const optionCDecisionEvidence = buildOptionCDecisionEvidence(jointFixtures);
  const productionGeometrySweep = buildProductionGeometrySweep(
    [...targetCases, ...crossProfileCases],
    productionMatrices.productionOwnershipRows
  );
  const actualDaySourceSafetyFixtureAudit = await buildActualDaySourceSafetyFixtureAudit();
  const userBefore = jointFixtures.find(item => item.id === "user_reproduced_before");
  const userAfter = jointFixtures.find(item => item.id === "user_reproduced_after");
  const thresholdBelow = jointFixtures.find(item => item.id === "threshold_fat_34_carb_26");
  const thresholdExact = jointFixtures.find(item => item.id === "threshold_fat_35_carb_26");
  const thresholdAbove = jointFixtures.find(item => item.id === "threshold_fat_36_carb_26");
  const rawProduct90 = symmetricFixtures.find(item => item.id === "core_90_all").results.model_d_raw_product;
  const rawProduct80 = symmetricFixtures.find(item => item.id === "core_80_all").results.model_d_raw_product;
  const softminP4Severe = symmetricFixtures.find(item => item.id === "single_severe_14").results.model_e_softmin_p_minus_4;
  const geometricGuardSevere = symmetricFixtures.find(item => item.id === "single_severe_14").results.model_f_geometric_worst_guard_35;
  const minResidualSevere = symmetricFixtures.find(item => item.id === "single_severe_14").results.model_g_min_residual_10;
  const currentTargetScoresAreFinite = targetCases.every(item => Number.isFinite(item.current.percent));
  const crossProfileScoresAreFinite = crossProfileCases.every(item => Number.isFinite(item.current.percent));
  const insideFixtureIds = ["inside_lower", "inside_middle", "inside_upper", "lower_endpoint", "upper_endpoint"];
  const insideResiduals = insideFixtureIds.map(id => getFixtureResidual(jointFixtures, id));
  const epsilonFat = getFixtureResidual(jointFixtures, "epsilon_outside_fat");
  const epsilonCarb = getFixtureResidual(jointFixtures, "epsilon_outside_carb");
  const outwardFat = getOrderedResidualSeries(jointFixtures, "outward_fat_");
  const outwardCarb = getOrderedResidualSeries(jointFixtures, "outward_carb_");
  const radialFat = ["radial_fat_0_5x", "radial_fat_1x", "radial_fat_2x"].map(id => getFixtureResidual(jointFixtures, id));
  const radialCarb = ["radial_carb_0_5x", "radial_carb_1x", "radial_carb_2x"].map(id => getFixtureResidual(jointFixtures, id));
  const invalidEmpty = jointFixtures.find(item => item.id === "invalid_empty_composition");
  const collapsed = jointFixtures.find(item => item.id === "collapsed_feasible_segment");
  const invalidEndpointAuthority = jointFixtures.find(item => item.id === "invalid_joint_endpoint_authority");
  const invalidAvailableKcalAuthorityStatuses = [0, -1, null, Number.NaN].map(availableCarbFatKcal => (
    buildOptionCFeasibleSegment({
      ...makeJointFixture("invalid_available_kcal_authority"),
      availableCarbFatKcal
    }).status
  ));
  const nonAlignedOutside = jointFixtures.find(item => item.id === "non_aligned_core_matched_outside");
  const nonAlignedInside = jointFixtures.find(item => item.id === "non_aligned_core_matched_inside");
  const boundedOutwardFat = jointFixtures
    .filter(item => item.id.startsWith("outward_fat_"))
    .sort((a, b) => a.id < b.id ? -1 : 1)
    .map(item => item.candidatePenalties?.bounded_sensitivity);
  const gentleOutwardCarb = jointFixtures
    .filter(item => item.id.startsWith("outward_carb_"))
    .sort((a, b) => a.id < b.id ? -1 : 1)
    .map(item => item.candidatePenalties?.gentle_smooth_sensitivity);
  const assertions = [
    makeAssertion("symmetric fixture inventory is complete", symmetricFixtures.length === 9, `count=${symmetricFixtures.length}`),
    makeAssertion("raw product collapses four 90 scores", rawProduct90.score < 70, `score=${rawProduct90.score}`),
    makeAssertion("raw product collapses four 80 scores", rawProduct80.score < 50, `score=${rawProduct80.score}`),
    makeAssertion("soft-min p=-4 preserves a single severe domain", softminP4Severe.band === "severe", `score=${softminP4Severe.score}`),
    makeAssertion("geometric worst-guard probe fails single-severe preservation", geometricGuardSevere.band !== "severe", `score=${geometricGuardSevere.score}`),
    makeAssertion("minimum residual probe preserves a single severe domain", minResidualSevere.band === "severe", `score=${minResidualSevere.score}`),
    makeAssertion("current threshold grid has a cliff", thresholdBelow.results.option_d_current_thresholded.penalty === 0 && thresholdAbove.results.option_d_current_thresholded.penalty > 0, `below=${thresholdBelow.results.option_d_current_thresholded.penalty},above=${thresholdAbove.results.option_d_current_thresholded.penalty}`),
    makeAssertion("exact threshold is floating-point sensitive", thresholdExact.results.option_d_current_thresholded.penalty > 0, `fatLow=${thresholdExact.deviationRatios.fatLow},penalty=${thresholdExact.results.option_d_current_thresholded.penalty}`),
    makeAssertion("user reproduced current joint penalty disappears", userBefore.results.option_d_current_thresholded.penalty > 0 && userAfter.results.option_d_current_thresholded.penalty === 0, `before=${userBefore.results.option_d_current_thresholded.penalty},after=${userAfter.results.option_d_current_thresholded.penalty}`),
    makeAssertion("joint allocation residual stays continuous across user transition", userBefore.results.option_c_joint_allocation_residual.penalty > 0 && userAfter.results.option_c_joint_allocation_residual.penalty > 0, `before=${userBefore.results.option_c_joint_allocation_residual.penalty},after=${userAfter.results.option_c_joint_allocation_residual.penalty}`),
    makeAssertion("Option C fixture inventory covers required families", jointFixtures.length >= 51, `count=${jointFixtures.length}`),
    makeAssertion("C1 feasible interior and endpoints are zero", insideResiduals.every(value => value === 0), `residuals=${insideResiduals.join(",")}`),
    makeAssertion("C1 epsilon outside is continuous and positive", [epsilonFat, epsilonCarb].every(value => Number.isFinite(value) && value > 0 && value < 0.0001), `fat=${epsilonFat},carb=${epsilonCarb}`),
    makeAssertion("C1 fat-heavy outward grid is monotonic", isNonDecreasingFinite(outwardFat) && outwardFat.length === 7, `series=${outwardFat.join(",")}`),
    makeAssertion("C1 carb-heavy outward grid is monotonic", isNonDecreasingFinite(outwardCarb) && outwardCarb.length === 7, `series=${outwardCarb.join(",")}`),
    makeAssertion("C1 capacity normalization is direction symmetric", outwardFat.length === outwardCarb.length && outwardFat.every((value, index) => Math.abs(value - outwardCarb[index]) <= 1e-12), `fat=${outwardFat.join(",")},carb=${outwardCarb.join(",")}`),
    makeAssertion("C1 residual is bounded from zero to one", jointFixtures.filter(item => item.residuals?.c1_carb_energy_share?.valid).every(item => item.residuals.c1_carb_energy_share.ratio >= 0 && item.residuals.c1_carb_energy_share.ratio <= 1 + 1e-12), "all valid synthetic residuals stay in [0,1]"),
    makeAssertion("C1 radial scale is invariant in fat-heavy direction", radialFat.length === 3 && radialFat.every(value => Math.abs(value - 0.25) <= 1e-12), `series=${radialFat.join(",")}`),
    makeAssertion("C1 radial scale is invariant in carb-heavy direction", radialCarb.length === 3 && radialCarb.every(value => Math.abs(value - 0.25) <= 1e-12), `series=${radialCarb.join(",")}`),
    makeAssertion("C1 and C2 are numerically equivalent", optionCDecisionEvidence.c1C2Equivalence.comparedCount > 0 && optionCDecisionEvidence.c1C2Equivalence.maximumAbsoluteDelta <= 1e-12, `count=${optionCDecisionEvidence.c1C2Equivalence.comparedCount},maxDelta=${optionCDecisionEvidence.c1C2Equivalence.maximumAbsoluteDelta}`),
    makeAssertion("C3 legacy normalized-carb baseline is marked DROP and diverges", optionCDecisionEvidence.c3LegacyBaseline.disposition === "DROP" && optionCDecisionEvidence.c3LegacyBaseline.divergentFromC1Count > 0, `divergent=${optionCDecisionEvidence.c3LegacyBaseline.divergentFromC1Count}`),
    makeAssertion("Option C curve probes remain unapproved", Object.values(optionCDecisionEvidence.curveProbeApproval).every(value => value === false), JSON.stringify(optionCDecisionEvidence.curveProbeApproval)),
    makeAssertion("smooth sensitivity probes stay strictly increasing without an intermediate hard cap", isStrictlyIncreasingFinite(boundedOutwardFat) && isStrictlyIncreasingFinite(gentleOutwardCarb) && boundedOutwardFat[boundedOutwardFat.length - 1] === 12 && gentleOutwardCarb[gentleOutwardCarb.length - 1] === 18, `bounded=${boundedOutwardFat.join(",")},gentle=${gentleOutwardCarb.join(",")}`),
    makeAssertion("drop curve stays zero", jointFixtures.filter(item => item.candidatePenalties).every(item => item.candidatePenalties.drop_curve === 0), "all valid curve probes use zero drop reference"),
    makeAssertion("invalid, collapsed, authority-invalid, and endpoint-mismatched Option C geometry fails closed", invalidEmpty?.residuals.c1_carb_energy_share.valid === false && invalidEmpty?.residuals.c1_carb_energy_share.ratio === null && collapsed?.residuals.c1_carb_energy_share.valid === false && collapsed?.residuals.c1_carb_energy_share.ratio === null && invalidEndpointAuthority?.residuals.c1_carb_energy_share.valid === false && invalidEndpointAuthority?.residuals.c1_carb_energy_share.status === "joint_endpoint_authority_mismatch" && invalidAvailableKcalAuthorityStatuses.every(status => status === "invalid_available_kcal_authority"), `empty=${invalidEmpty?.residuals.c1_carb_energy_share.status},collapsed=${collapsed?.residuals.c1_carb_energy_share.status},endpoint=${invalidEndpointAuthority?.residuals.c1_carb_energy_share.status},availableAuthority=${invalidAvailableKcalAuthorityStatuses.join("|")}`),
    makeAssertion("synthetic overlap evidence accounts for every positive residual", optionCDecisionEvidence.overlapAccountingComplete, `positive=${optionCDecisionEvidence.residualPositiveCount},unique=${optionCDecisionEvidence.uniqueResidualCaseCount},overlap=${optionCDecisionEvidence.coreOverlapCount}`),
    makeAssertion("non-aligned raw rectangle exposes a historical simplified-core matched interaction distinction", JSON.stringify(nonAlignedOutside?.simplifiedHistoricalCorePenalty) === JSON.stringify(nonAlignedInside?.simplifiedHistoricalCorePenalty) && nonAlignedOutside?.residuals.c1_carb_energy_share.ratio > 0 && nonAlignedInside?.residuals.c1_carb_energy_share.ratio === 0, `outside=${nonAlignedOutside?.residuals.c1_carb_energy_share.ratio},inside=${nonAlignedInside?.residuals.c1_carb_energy_share.ratio},historicalSimplifiedCore=${JSON.stringify(nonAlignedOutside?.simplifiedHistoricalCorePenalty)}`),
    makeAssertion("target matrix has 54 cases", targetSummary.caseCount === 54, `count=${targetSummary.caseCount}`),
    makeAssertion("current target matrix produces finite scores", currentTargetScoresAreFinite, `finite=${targetCases.filter(item => Number.isFinite(item.current.percent)).length}/${targetCases.length}`),
    makeAssertion("current production restores exact generated targets", targetSummary.currentNon100Count === 0, `non100=${targetSummary.currentNon100Count}`),
    makeAssertion("current production target authority passes generated targets", targetSummary.productionAuthorityFailCount === 0, `invalid=${targetSummary.productionAuthorityFailCount}`),
    makeAssertion("current production target matrix has zero across nine penalties", targetSummary.ninePenaltyAxesNonZeroCount === 0, `nonzero=${targetSummary.ninePenaltyAxesNonZeroCount}`),
    makeAssertion("target validity envelope passes generated targets", targetSummary.validityFailCount === 0, `invalid=${targetSummary.validityFailCount}`),
    makeAssertion("cross-profile smoke has 3 profiles x 2 goals x rest/exercise", crossProfileSummary.caseCount === 12, `count=${crossProfileSummary.caseCount}`),
    makeAssertion("cross-profile smoke produces finite exact scores", crossProfileScoresAreFinite && crossProfileSummary.currentNon100Count === 0, `finite=${crossProfileCases.filter(item => Number.isFinite(item.current.percent)).length}/${crossProfileCases.length},non100=${crossProfileSummary.currentNon100Count}`),
    makeAssertion("cross-profile target authority and nine penalties pass", crossProfileSummary.productionAuthorityFailCount === 0 && crossProfileSummary.ninePenaltyAxesNonZeroCount === 0, `authorityInvalid=${crossProfileSummary.productionAuthorityFailCount},nonzero=${crossProfileSummary.ninePenaltyAxesNonZeroCount}`),
    makeAssertion("production geometry sweep covers all 54 plus 12 cross-profile geometries with joint-model authority", productionGeometrySweep.geometryCount === 66 && productionGeometrySweep.validGeometryCount === 66 && productionGeometrySweep.jointModelAuthorityGeometryCount === 66, `geometry=${productionGeometrySweep.geometryCount},valid=${productionGeometrySweep.validGeometryCount},jointModelAuthority=${productionGeometrySweep.jointModelAuthorityGeometryCount}`),
    makeAssertion("production geometry sweep preserves the historical 3,058 sample identity and simplified counts", productionGeometrySweep.sampleCount === 3058 && productionGeometrySweep.historicalSimplified.uniqueResidualCaseCount === 237 && productionGeometrySweep.historicalSimplified.coreOverlapCount === 240, `samples=${productionGeometrySweep.sampleCount},historicalUnique=${productionGeometrySweep.historicalSimplified.uniqueResidualCaseCount},historicalOverlap=${productionGeometrySweep.historicalSimplified.coreOverlapCount}`),
    makeAssertion("production ownership source covers every sample with the exact nine-axis key set and eight non-joint axes", productionGeometrySweep.productionPenaltyAxes.length === 9 && productionGeometrySweep.productionNonJointPenaltyAxes.length === 8 && !productionGeometrySweep.productionNonJointPenaltyAxes.includes("carbFatExchangeFailurePenalty") && productionGeometrySweep.productionSourceAuthorityCompleteness.exactNinePenaltyAxisKeySetCount === productionGeometrySweep.sampleCount && productionGeometrySweep.productionSourceAuthorityCompleteness.complete, `allAxes=${productionGeometrySweep.productionPenaltyAxes.join("|")},nonJointAxes=${productionGeometrySweep.productionNonJointPenaltyAxes.join("|")},keySetExact=${productionGeometrySweep.productionSourceAuthorityCompleteness.exactNinePenaltyAxisKeySetCount}/${productionGeometrySweep.sampleCount},sourceComplete=${productionGeometrySweep.productionSourceAuthorityCompleteness.scoreSourceCompleteCount}/${productionGeometrySweep.sampleCount},authorityComplete=${productionGeometrySweep.productionSourceAuthorityCompleteness.targetAuthorityCompleteCount}/${productionGeometrySweep.sampleCount}`),
    makeAssertion("production versus historical ownership drift is explicit and fully accounted", productionGeometrySweep.ownershipDrift.accountingComplete && productionGeometrySweep.ownershipDrift.comparisonCount === productionGeometrySweep.residualPositiveCount && productionGeometrySweep.ownershipDrift.changedSampleCount > 0, `positive=${productionGeometrySweep.residualPositiveCount},compared=${productionGeometrySweep.ownershipDrift.comparisonCount},changed=${productionGeometrySweep.ownershipDrift.changedSampleCount},transitions=${JSON.stringify(productionGeometrySweep.ownershipDrift.transitions)}`),
    makeAssertion("production geometry sweep preserves C1/C2 equivalence", productionGeometrySweep.c1C2MaximumAbsoluteDelta <= 1e-12, `maxDelta=${productionGeometrySweep.c1C2MaximumAbsoluteDelta}`),
    makeAssertion("production-exact geometry overlap evidence is fully accounted", productionGeometrySweep.overlapAccountingComplete, `positive=${productionGeometrySweep.residualPositiveCount},unique=${productionGeometrySweep.uniqueResidualCaseCount},overlap=${productionGeometrySweep.coreOverlapCount},unclassified=${productionGeometrySweep.productionUnclassifiedCount}`),
    makeAssertion("actual-day audit rejects invalid envelopes, missing settings, and coerced backup versions", actualDaySourceSafetyFixtureAudit.invalidEnvelopeRejected && actualDaySourceSafetyFixtureAudit.missingSettingsRejected && actualDaySourceSafetyFixtureAudit.coercedBackupVersionRejected, `invalidEnvelope=${actualDaySourceSafetyFixtureAudit.invalidEnvelopeRejected},missingSettings=${actualDaySourceSafetyFixtureAudit.missingSettingsRejected},coercedVersion=${actualDaySourceSafetyFixtureAudit.coercedBackupVersionRejected}`),
    makeAssertion("actual-day source safety includes only complete snapshot fixtures", actualDaySourceSafetyFixtureAudit.sourceRecordCount === 36 && actualDaySourceSafetyFixtureAudit.includedRecordCount === 6 && actualDaySourceSafetyFixtureAudit.excludedRecordCount === 30 && actualDaySourceSafetyFixtureAudit.sourceCountBalanced === true, `source=${actualDaySourceSafetyFixtureAudit.sourceRecordCount},included=${actualDaySourceSafetyFixtureAudit.includedRecordCount},excluded=${actualDaySourceSafetyFixtureAudit.excludedRecordCount},balanced=${actualDaySourceSafetyFixtureAudit.sourceCountBalanced},reasons=${JSON.stringify(actualDaySourceSafetyFixtureAudit.exclusionReasonCounts)}`),
    makeAssertion("snapshotless actual-day records are excluded before scoring", actualDaySourceSafetyFixtureAudit.snapshotlessScoreCallsPrevented === true && actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.snapshotless === 2, `prevented=${actualDaySourceSafetyFixtureAudit.snapshotlessScoreCallsPrevented},count=${actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.snapshotless}`),
    makeAssertion("invalid and duplicate dates are excluded before scoring", actualDaySourceSafetyFixtureAudit.invalidDateScoreCallsPrevented === true && actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.invalid_record_date === 1 && actualDaySourceSafetyFixtureAudit.duplicateDateScoreCallsPrevented === true && actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.duplicate_record_date === 2, JSON.stringify(actualDaySourceSafetyFixtureAudit.exclusionReasonCounts)),
    makeAssertion("raw numeric authority accepts native finite numbers only", actualDaySourceSafetyFixtureAudit.rawProvenanceCoercionBypassPrevented === true && actualDaySourceSafetyFixtureAudit.strictRawNumberCoercionsRejected === true, `reasonCoverage=${actualDaySourceSafetyFixtureAudit.rawProvenanceCoercionBypassPrevented},strictCoercions=${actualDaySourceSafetyFixtureAudit.strictRawNumberCoercionsRejected}`),
    makeAssertion("legacy-absent and explicit finite non-macro kcal remain eligible", actualDaySourceSafetyFixtureAudit.legacyMissingNonMacroKcalAllowed === true && actualDaySourceSafetyFixtureAudit.explicitFiniteNonMacroKcalAllowed === true, `legacyAbsent=${actualDaySourceSafetyFixtureAudit.legacyMissingNonMacroKcalAllowed},explicitFinite=${actualDaySourceSafetyFixtureAudit.explicitFiniteNonMacroKcalAllowed}`),
    makeAssertion("present-invalid alcohol and other kcal variants are excluded before scoring", actualDaySourceSafetyFixtureAudit.invalidNonMacroVariantCoverage === 8 && actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.invalid_meal_non_macro_kcal === 8 && actualDaySourceSafetyFixtureAudit.invalidNonMacroVariantFieldCoverageStable === true && actualDaySourceSafetyFixtureAudit.extendedInvalidOptionalValuesRejected === true && actualDaySourceSafetyFixtureAudit.invalidNonMacroScoreCallsPrevented === true, `fixtureVariants=${actualDaySourceSafetyFixtureAudit.invalidNonMacroVariantCoverage},reasonCount=${actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.invalid_meal_non_macro_kcal},fieldCoverage=${actualDaySourceSafetyFixtureAudit.invalidNonMacroVariantFieldCoverageStable},extendedInvalid=${actualDaySourceSafetyFixtureAudit.extendedInvalidOptionalValuesRejected},prevented=${actualDaySourceSafetyFixtureAudit.invalidNonMacroScoreCallsPrevented}`),
    makeAssertion("non-finite derived meal/day energy totals are excluded before scoring", actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.non_finite_meal_energy_total === 1 && actualDaySourceSafetyFixtureAudit.nonFiniteMealEnergyScoreCallsPrevented === true, `reasonCount=${actualDaySourceSafetyFixtureAudit.exclusionReasonCounts.non_finite_meal_energy_total},prevented=${actualDaySourceSafetyFixtureAudit.nonFiniteMealEnergyScoreCallsPrevented}`),
    makeAssertion("actual-day training provenance accepts production simple routines and rejects values outside its vocabulary", actualDaySourceSafetyFixtureAudit.allowedRoutineProvenanceEnforced === true && actualDaySourceSafetyFixtureAudit.productionSimpleProfileRoutineIncluded === true, `invalidRejected=${actualDaySourceSafetyFixtureAudit.allowedRoutineProvenanceEnforced},simpleIncluded=${actualDaySourceSafetyFixtureAudit.productionSimpleProfileRoutineIncluded}`),
    makeAssertion("legacy profile-absent expert snapshots recover historical bodybuilding advanced ownership without crossing current-profile source cohorts", actualDaySourceSafetyFixtureAudit.legacyProfileRecoveryContractEnforced === true, `recovered=${actualDaySourceSafetyFixtureAudit.legacyProfileRecoveryContractEnforced}`),
    makeAssertion("ambiguous compound legacy routines, profileless general records, and invalid source markers fail before scoring", actualDaySourceSafetyFixtureAudit.ambiguousLegacyAndInvalidSourceFailClosed === true, `failClosed=${actualDaySourceSafetyFixtureAudit.ambiguousLegacyAndInvalidSourceFailClosed},reasons=${JSON.stringify(actualDaySourceSafetyFixtureAudit.exclusionReasonCounts)}`),
    makeAssertion("actual-day routine vocabulary mirrors production simple and advanced profile routines", actualAuditRoutineVocabularyMatchesProduction === true, `profiles=${Object.keys(actualAuditRoutineVocabulary.advancedByProfile).join("|")},matches=${actualAuditRoutineVocabularyMatchesProduction}`),
    makeAssertion("actual-day full-day threshold uses production scoring kcal including valid non-macro energy", actualDaySourceSafetyFixtureAudit.productionScoringKcalThresholdAligned === true, `aligned=${actualDaySourceSafetyFixtureAudit.productionScoringKcalThresholdAligned}`),
    makeAssertion("macro-only intake below the production full-day threshold is excluded before scoring", actualDaySourceSafetyFixtureAudit.macroOnlyBelowThresholdPrevented === true, `prevented=${actualDaySourceSafetyFixtureAudit.macroOnlyBelowThresholdPrevented}`),
    makeAssertion("actual-day included fixtures remain snapshot-owned without current-result fallback", actualDaySourceSafetyFixtureAudit.validSnapshotGoalOwned === true && actualDaySourceSafetyFixtureAudit.validSnapshotSources?.allFrozenTarget === true && actualDaySourceSafetyFixtureAudit.validSnapshotSources?.allSnapshotWeight === true && actualDaySourceSafetyFixtureAudit.validSnapshotSources?.allRawTrainingEnergy === true && actualDaySourceSafetyFixtureAudit.validSnapshotSources?.noCurrentResultFallback === true, JSON.stringify(actualDaySourceSafetyFixtureAudit.validSnapshotSources)),
    makeAssertion("cardio-only snapshot training is derived from raw snapshot energy instead of rest fallback", actualDaySourceSafetyFixtureAudit.cardioOnlyTrainingContextOwned === true, `owned=${actualDaySourceSafetyFixtureAudit.cardioOnlyTrainingContextOwned}`),
    makeAssertion("matched evidence separates residual-free base coverage from control and contrast potential across exact, 0.25, and 1.0 contracts", JSON.stringify(actualDaySourceSafetyFixtureAudit.matchContractIds) === JSON.stringify(["exact", "tolerance_0_25", "tolerance_1_00"]) && actualDaySourceSafetyFixtureAudit.tolerancePairCounts?.exact > 0 && actualDaySourceSafetyFixtureAudit.tolerancePairCounts?.tolerance_0_25 > actualDaySourceSafetyFixtureAudit.tolerancePairCounts?.exact && actualDaySourceSafetyFixtureAudit.tolerancePairCounts?.tolerance_1_00 > actualDaySourceSafetyFixtureAudit.tolerancePairCounts?.tolerance_0_25 && actualDaySourceSafetyFixtureAudit.toleranceCoverageMonotonic === true && actualDaySourceSafetyFixtureAudit.baseCoreRetainsControls === true, `contracts=${actualDaySourceSafetyFixtureAudit.matchContractIds?.join("|")},pairs=${JSON.stringify(actualDaySourceSafetyFixtureAudit.tolerancePairCounts)},monotonic=${actualDaySourceSafetyFixtureAudit.toleranceCoverageMonotonic},controlsRetained=${actualDaySourceSafetyFixtureAudit.baseCoreRetainsControls}`),
    makeAssertion("hidden review roles separate both residual direction and existing magnitude class", actualDaySourceSafetyFixtureAudit.hiddenRoleUsesDirectionAndMagnitudeClass === true, `classified=${actualDaySourceSafetyFixtureAudit.hiddenRoleUsesDirectionAndMagnitudeClass}`),
    makeAssertion("general-graph maximum matching is deterministic for triangle, path, and odd-cycle fixtures", actualDaySourceSafetyFixtureAudit.maximumMatchingFixturesPass === true, `pass=${actualDaySourceSafetyFixtureAudit.maximumMatchingFixturesPass}`),
    makeAssertion("review judgeability requires shared energy/protein bands, visible differences on both carb and fat, and emitted-field deduplication", actualDaySourceSafetyFixtureAudit.judgeabilityRejectsConfoundedAndOneAxisOnly === true && actualDaySourceSafetyFixtureAudit.fivePointBandBoundariesStable === true && actualDaySourceSafetyFixtureAudit.emittedVisibleSignatureIgnoresHiddenSourceCohort === true, `judgeability=${actualDaySourceSafetyFixtureAudit.judgeabilityRejectsConfoundedAndOneAxisOnly},bands=${actualDaySourceSafetyFixtureAudit.fivePointBandBoundariesStable},visibleDedup=${actualDaySourceSafetyFixtureAudit.emittedVisibleSignatureIgnoresHiddenSourceCohort}`),
    makeAssertion("blind review readiness requires a same-stratum disjoint contrast/control block and never authorizes policy", actualDaySourceSafetyFixtureAudit.balancedReadinessContract === true, `readyContract=${actualDaySourceSafetyFixtureAudit.balancedReadinessContract}`),
    makeAssertion("standalone review and post-judgment reveal artifacts use exact privacy allowlists and linked case hashes", actualDaySourceSafetyFixtureAudit.reviewPacketCaseCount > 0 && actualDaySourceSafetyFixtureAudit.reviewPacketCaseCount === actualDaySourceSafetyFixtureAudit.revealMapCaseCount && actualDaySourceSafetyFixtureAudit.reviewPacketExactAllowlistSafe === true && actualDaySourceSafetyFixtureAudit.revealMapExactAllowlistSafe === true && actualDaySourceSafetyFixtureAudit.reviewRevealHashLinked === true && actualDaySourceSafetyFixtureAudit.reviewRevealCaseIdsLinked === true && actualDaySourceSafetyFixtureAudit.reviewRevealSideMappingPreserved === true && actualDaySourceSafetyFixtureAudit.reviewAndRevealPhysicallySeparable === true && actualDaySourceSafetyFixtureAudit.generatedArtifactBundleSafe === true && actualDaySourceSafetyFixtureAudit.actualOutputDebugPathPolicyCovered === true, `review=${actualDaySourceSafetyFixtureAudit.reviewPacketCaseCount},reveal=${actualDaySourceSafetyFixtureAudit.revealMapCaseCount},reviewSafe=${actualDaySourceSafetyFixtureAudit.reviewPacketExactAllowlistSafe},revealSafe=${actualDaySourceSafetyFixtureAudit.revealMapExactAllowlistSafe},hashLinked=${actualDaySourceSafetyFixtureAudit.reviewRevealHashLinked},caseLinked=${actualDaySourceSafetyFixtureAudit.reviewRevealCaseIdsLinked},sideLinked=${actualDaySourceSafetyFixtureAudit.reviewRevealSideMappingPreserved},separate=${actualDaySourceSafetyFixtureAudit.reviewAndRevealPhysicallySeparable},runtimeGuard=${actualDaySourceSafetyFixtureAudit.generatedArtifactBundleSafe},debugOnly=${actualDaySourceSafetyFixtureAudit.actualOutputDebugPathPolicyCovered}`),
    makeAssertion("post-judgment reveal accepts only the locked matching review and distinct input/output paths", actualDaySourceSafetyFixtureAudit.lockedReviewSameInputAccepted === true && actualDaySourceSafetyFixtureAudit.changedLockedReviewRejected === true && actualDaySourceSafetyFixtureAudit.actualInputOutputCollisionRejected === true, `sameAccepted=${actualDaySourceSafetyFixtureAudit.lockedReviewSameInputAccepted},changedRejected=${actualDaySourceSafetyFixtureAudit.changedLockedReviewRejected},collisionRejected=${actualDaySourceSafetyFixtureAudit.actualInputOutputCollisionRejected}`),
    makeAssertion("hypothesis-blind shuffle is deterministic, raw-record/input-order invariant, and covers both A/B orientations", actualDaySourceSafetyFixtureAudit.hypothesisBlindArtifactsDeterministic === true && actualDaySourceSafetyFixtureAudit.hypothesisBlindArtifactsInputOrderInvariant === true && actualDaySourceSafetyFixtureAudit.rawBackupRecordOrderInvariant === true && actualDaySourceSafetyFixtureAudit.deterministicShuffleBothOrientationsCovered === true, `repeat=${actualDaySourceSafetyFixtureAudit.hypothesisBlindArtifactsDeterministic},dayReverse=${actualDaySourceSafetyFixtureAudit.hypothesisBlindArtifactsInputOrderInvariant},rawReverse=${actualDaySourceSafetyFixtureAudit.rawBackupRecordOrderInvariant},bothOrientations=${actualDaySourceSafetyFixtureAudit.deterministicShuffleBothOrientationsCovered}`),
    makeAssertion("hypothesis-blind review deduplicates pairs under their narrowest tolerance", actualDaySourceSafetyFixtureAudit.narrowestToleranceOwnsDeduplicatedPairs === true, `owned=${actualDaySourceSafetyFixtureAudit.narrowestToleranceOwnsDeduplicatedPairs}`),
    makeAssertion("actual-context counterfactual generation preserves isoenergetic exchange, protein, synthetic meal closure, and frozen target authority", actualDaySourceSafetyFixtureAudit.counterfactualGenerationContract === true, `contract=${actualDaySourceSafetyFixtureAudit.counterfactualGenerationContract}`),
    makeAssertion("counterfactual attrition audit predeclares every method lane and normalized grid fraction", actualDaySourceSafetyFixtureAudit.counterfactualAttritionLaneInventoryStable === true, `stable=${actualDaySourceSafetyFixtureAudit.counterfactualAttritionLaneInventoryStable}`),
    makeAssertion("capability-first selection detects anchors hidden by cyclic role preassignment", actualDaySourceSafetyFixtureAudit.counterfactualCapabilityFirstRecoversPreassignmentTrap === true, `recovered=${actualDaySourceSafetyFixtureAudit.counterfactualCapabilityFirstRecoversPreassignmentTrap}`),
    makeAssertion("observed-support and policy-envelope lanes answer separate questions", actualDaySourceSafetyFixtureAudit.counterfactualObservedAndPolicyEvidenceLanesSeparated === true, `separated=${actualDaySourceSafetyFixtureAudit.counterfactualObservedAndPolicyEvidenceLanesSeparated}`),
    makeAssertion("fixed absolute and normalized feasible-span grids remain separately falsifiable", actualDaySourceSafetyFixtureAudit.counterfactualFixedAndNormalizedGridLanesSeparated === true, `separated=${actualDaySourceSafetyFixtureAudit.counterfactualFixedAndNormalizedGridLanesSeparated}`),
    makeAssertion("strict core-zero and pair-equal nonzero lanes remain separately falsifiable", actualDaySourceSafetyFixtureAudit.counterfactualStrictZeroAndEqualNonzeroLanesSeparated === true, `separated=${actualDaySourceSafetyFixtureAudit.counterfactualStrictZeroAndEqualNonzeroLanesSeparated}`),
    makeAssertion("counterfactual attrition waterfall covers both directions, control, and every rejection gate", actualDaySourceSafetyFixtureAudit.counterfactualWaterfallCoversBothDirectionsAndAllGates === true, `covered=${actualDaySourceSafetyFixtureAudit.counterfactualWaterfallCoversBothDirectionsAndAllGates}`),
    makeAssertion("counterfactual generation is raw-record-order invariant and ignores injected residual/final-score metadata", actualDaySourceSafetyFixtureAudit.counterfactualRawOrderInvariant === true && actualDaySourceSafetyFixtureAudit.counterfactualGeneratorIgnoresInjectedHypothesisMetadata === true, `rawReverse=${actualDaySourceSafetyFixtureAudit.counterfactualRawOrderInvariant},metadataBlind=${actualDaySourceSafetyFixtureAudit.counterfactualGeneratorIgnoresInjectedHypothesisMetadata}`),
    makeAssertion("counterfactual fixture requires six balanced blocks, twelve distinct anchors, both directions, and multiple contexts", actualDaySourceSafetyFixtureAudit.counterfactualBalancedFixtureReady === true, `ready=${actualDaySourceSafetyFixtureAudit.counterfactualBalancedFixtureReady}`),
    makeAssertion("counterfactual review and post-judgment reveal use separate exact allowlists and linked twelve-case hashes", actualDaySourceSafetyFixtureAudit.counterfactualReviewPacketSafe === true, `safe=${actualDaySourceSafetyFixtureAudit.counterfactualReviewPacketSafe}`),
    makeAssertion("counterfactual selection and A/B randomization are input-order invariant", actualDaySourceSafetyFixtureAudit.counterfactualSelectionInputOrderInvariant === true, `stable=${actualDaySourceSafetyFixtureAudit.counterfactualSelectionInputOrderInvariant}`),
    makeAssertion("counterfactual balanced selection explores alternate display-pair options within each anchor", actualDaySourceSafetyFixtureAudit.counterfactualAlternativePairOptionsExercised === true, `exercised=${actualDaySourceSafetyFixtureAudit.counterfactualAlternativePairOptionsExercised}`),
    makeAssertion("counterfactual reveal accepts only the unchanged locked review", actualDaySourceSafetyFixtureAudit.counterfactualLockedReviewGuard === true, `guard=${actualDaySourceSafetyFixtureAudit.counterfactualLockedReviewGuard}`),
    makeAssertion("counterfactual judgment requires exactly twelve canonical allowed choices with a deterministic hash", actualDaySourceSafetyFixtureAudit.counterfactualJudgmentContractGuard === true, `guard=${actualDaySourceSafetyFixtureAudit.counterfactualJudgmentContractGuard}`),
    makeAssertion("counterfactual reveal rejects unconfirmed or post-confirmation changed judgments", actualDaySourceSafetyFixtureAudit.counterfactualRevealRequiresConfirmedUnchangedJudgment === true, `guard=${actualDaySourceSafetyFixtureAudit.counterfactualRevealRequiresConfirmedUnchangedJudgment}`),
    makeAssertion("counterfactual reveal is bound to both the locked review and confirmed judgment hashes", actualDaySourceSafetyFixtureAudit.counterfactualJudgmentBoundRevealSafe === true, `safe=${actualDaySourceSafetyFixtureAudit.counterfactualJudgmentBoundRevealSafe}`),
    makeAssertion("counterfactual interpretation categories and insufficiency stops are fixed before user judgment", actualDaySourceSafetyFixtureAudit.counterfactualInterpretationRulesStable === true, `stable=${actualDaySourceSafetyFixtureAudit.counterfactualInterpretationRulesStable}`),
    makeAssertion("counterfactual malformed and partial insufficient artifacts fail closed without parser exceptions", actualDaySourceSafetyFixtureAudit.counterfactualMalformedAndPartialArtifactsFailClosed === true, `failClosed=${actualDaySourceSafetyFixtureAudit.counterfactualMalformedAndPartialArtifactsFailClosed}`),
    makeAssertion("counterfactual reveal roles are coherent and remain bound to the reviewed A/B sides", actualDaySourceSafetyFixtureAudit.counterfactualRevealCoherenceAndSideBindingGuard === true, `guard=${actualDaySourceSafetyFixtureAudit.counterfactualRevealCoherenceAndSideBindingGuard}`),
    makeAssertion("one-direction-only counterfactual evidence fails closed with empty review and reveal maps", actualDaySourceSafetyFixtureAudit.counterfactualOneDirectionFailsClosed === true, `failClosed=${actualDaySourceSafetyFixtureAudit.counterfactualOneDirectionFailsClosed}`)
  ];

  const ledgerWithoutHash = {
    schemaVersion: "component_score_architecture_falsification_v2",
    productionIndexSha256: crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex"),
    objectiveBands: {
      aligned: "95-100",
      acceptable: "85-94",
      warning: "70-84",
      problem: "50-69",
      serious: "30-49",
      severe: "1-29",
      displayCollapse: "0"
    },
    modelNotes: {
      baseline_current_additive_deficit: "Re-expression of additive domain deficits for vector comparison only; production still uses nine raw penalties.",
      model_d_raw_product: "Direct product of every visible non-neutral domain score.",
      model_e_softmin: "Negative power mean sensitivity probes at p=-2/-4/-8; coefficients are not production policy.",
      model_f_geometric_worst_guard: "Geometric mean blended 35/50/65 percent from the worst score; probes only.",
      model_g_min_residual: "Worst score minus bounded 5/10/20 percent accumulation from other shortfalls; probes only.",
      option_c_exact_formula: "C1 carb-energy-share and C2 radial kcal-plane residuals are geometry probes; every curve coefficient remains unapproved."
    },
    modelScreening,
    symmetricFixtures,
    jointDecisionOptions: {
      optionA: "remove joint domain",
      optionB: "remove low-low/high-high and preserve only legacy invalid-exchange branch",
      optionC: "normalize carb/fat intake to the protein-reserved joint budget and score only distance outside the feasible joint segment",
      optionD: "keep current thresholded interaction"
    },
    optionCExactFormulaSimulation: {
      schemaVersion: "option_c_exact_formula_simulation_v1",
      c1Formula: "s=4C/(4C+9F); below=(l-s)/l; above=(s-u)/(1-u); inside=0",
      c2Formula: "radially project carb/fat kcal to the protein-reserved budget and normalize boundary distance by the same-side simplex maximum",
      c3LegacyBaseline: { name: "normalized_carb_boundary_ratio", disposition: "DROP" },
      curveProbeDefinitions: optionCCurveProbeDefinitions,
      decisionEvidence: {
        syntheticNonAuthoritativeDiagnostics: {
          evidenceRole: "historical_test_local_helper_diagnostics_only",
          ownershipSource: "simplifiedHistoricalCorePenalty",
          ...optionCDecisionEvidence
        },
        productionGeometry: {
          ownershipPrimary: productionGeometrySweep.ownershipPrimary,
          geometryCount: productionGeometrySweep.geometryCount,
          sampleCount: productionGeometrySweep.sampleCount,
          residualPositiveCount: productionGeometrySweep.residualPositiveCount,
          uniqueResidualCaseCount: productionGeometrySweep.uniqueResidualCaseCount,
          coreOverlapCount: productionGeometrySweep.coreOverlapCount,
          productionUnclassifiedCount: productionGeometrySweep.productionUnclassifiedCount,
          historicalSimplified: {
            uniqueResidualCaseCount: productionGeometrySweep.historicalSimplified.uniqueResidualCaseCount,
            coreOverlapCount: productionGeometrySweep.historicalSimplified.coreOverlapCount
          },
          ownershipDrift: {
            changedSampleCount: productionGeometrySweep.ownershipDrift.changedSampleCount,
            transitions: productionGeometrySweep.ownershipDrift.transitions,
            accountingComplete: productionGeometrySweep.ownershipDrift.accountingComplete
          },
          sourceAuthorityComplete: productionGeometrySweep.productionSourceAuthorityCompleteness.complete,
          coreMatchedGeometryCount: productionGeometrySweep.coreMatchedGeometryCount,
          overlapAccountingComplete: productionGeometrySweep.overlapAccountingComplete
        }
      },
      productionGeometrySweep,
      outcome: null
    },
    jointFixtures,
    targetMatrix: { summary: targetSummary, cases: targetCases },
    crossProfileSmoke: { summary: crossProfileSummary, cases: crossProfileCases },
    historicalProbeStatus: {
      correctedReferenceProbe: "removed_after_target_authority_v2_became_current_production"
    },
    actualUserDataEvidence: {
      localRawRecordFilesCommitted: false,
      userReproducedAnonymizedTransitionIncluded: true,
      deterministicHarnessLoadsPrivateBackup: false,
      optionalPrivateAuditFlag: "--actual-backup",
      standaloneReviewOutputFlag: "--actual-review-output",
      postJudgmentRevealFlag: "--post-judgment-reveal + --actual-reveal-output",
      counterfactualReviewOutputFlag: "--actual-counterfactual-review-output",
      counterfactualJudgmentInputFlag: "--actual-counterfactual-judgment-input",
      counterfactualJudgmentHashFlag: "--actual-counterfactual-judgment-hash",
      counterfactualPostJudgmentRevealFlag: "--post-counterfactual-judgment-reveal + --actual-counterfactual-judgment-input + --actual-counterfactual-judgment-hash + --actual-counterfactual-reveal-output",
      counterfactualRevealRequiresConfirmedJudgment: true,
      actualOutputsIgnoredDebugOnly: true,
      explicitBackupRequired: true,
      evidenceStatusWithoutFlag: "source_safety_corrected_awaiting_explicit_backup",
      sourceSafetyFixtureAudit: actualDaySourceSafetyFixtureAudit,
      productionReadinessFromDeterministicFixturesAlone: "NO"
    },
    assertions
  };
  const deterministicHash = crypto.createHash("sha256").update(JSON.stringify(ledgerWithoutHash)).digest("hex");
  const observedLaneRequested = !!(actualReviewOutputPath || actualRevealOutputPath || postJudgmentReveal);
  const counterfactualLaneRequested = !!(
    actualCounterfactualReviewOutputPath
    || actualCounterfactualJudgmentInputPath
    || actualCounterfactualJudgmentHash
    || actualCounterfactualRevealOutputPath
    || postCounterfactualJudgmentReveal
  );
  if (observedLaneRequested && counterfactualLaneRequested) {
    throw new Error("observed actual-day and actual-context counterfactual lanes must run separately");
  }
  if (!actualBackupPath && (observedLaneRequested || counterfactualLaneRequested)) {
    throw new Error("actual review/reveal flags require --actual-backup");
  }
  if ((actualCounterfactualJudgmentInputPath || actualCounterfactualJudgmentHash)
      && !postCounterfactualJudgmentReveal) {
    throw new Error("counterfactual judgment input/hash are accepted only with --post-counterfactual-judgment-reveal");
  }
  if (postCounterfactualJudgmentReveal
      && (!actualCounterfactualJudgmentInputPath
        || !/^[a-f0-9]{64}$/.test(actualCounterfactualJudgmentHash))) {
    throw new Error("--post-counterfactual-judgment-reveal requires judgment input and its confirmed 64-character hash");
  }
  let actualOutputPaths = null;
  if (actualBackupPath) {
    if (outputFormat !== "json") throw new Error("--actual-backup supports JSON output only");
    const backupInput = path.resolve(root, actualBackupPath);
    const ledgerOutput = resolveActualAuditOutputPath(outputPath, "--output");
    const lane = counterfactualLaneRequested ? "counterfactual" : "observed";
    const reviewOutput = lane === "counterfactual"
      ? resolveActualAuditOutputPath(actualCounterfactualReviewOutputPath, "--actual-counterfactual-review-output")
      : resolveActualAuditOutputPath(actualReviewOutputPath, "--actual-review-output");
    if (lane === "observed" && actualRevealOutputPath && !postJudgmentReveal) {
      throw new Error("--actual-reveal-output requires --post-judgment-reveal after judgment is fixed");
    }
    if (lane === "counterfactual" && actualCounterfactualRevealOutputPath && !postCounterfactualJudgmentReveal) {
      throw new Error("--actual-counterfactual-reveal-output requires --post-counterfactual-judgment-reveal");
    }
    const revealOutput = lane === "counterfactual"
      ? (postCounterfactualJudgmentReveal
        ? resolveActualAuditOutputPath(actualCounterfactualRevealOutputPath, "--actual-counterfactual-reveal-output")
        : null)
      : (postJudgmentReveal ? resolveActualAuditOutputPath(actualRevealOutputPath, "--actual-reveal-output") : null);
    const judgmentInput = lane === "counterfactual" && postCounterfactualJudgmentReveal
      ? resolveActualAuditOutputPath(
        actualCounterfactualJudgmentInputPath,
        "--actual-counterfactual-judgment-input"
      )
      : null;
    const postMode = lane === "counterfactual" ? postCounterfactualJudgmentReveal : postJudgmentReveal;
    assertDistinctFilePaths([backupInput, ledgerOutput, reviewOutput, judgmentInput, revealOutput]);
    if (postMode && !fs.existsSync(reviewOutput)) {
      throw new Error(`${lane} post-judgment reveal requires the existing locked review file`);
    }
    if (!postMode && fs.existsSync(reviewOutput)) {
      throw new Error("pre-judgment review output already exists; preserve it or choose a new path");
    }
    if (judgmentInput && !fs.existsSync(judgmentInput)) {
      throw new Error("counterfactual reveal requires the existing user-confirmed judgment file");
    }
    if (revealOutput && fs.existsSync(revealOutput)) {
      throw new Error("post-judgment reveal output already exists; preserve it or choose a new path");
    }
    actualOutputPaths = {
      lane,
      postMode,
      backupInput,
      ledgerOutput,
      reviewOutput,
      judgmentInput,
      revealOutput
    };
  }
  const localActualDayAuditBundle = actualBackupPath && actualOutputPaths?.lane === "observed"
    ? await buildLocalActualDayAudit(path.resolve(root, actualBackupPath))
    : null;
  const localCounterfactualAuditBundle = actualBackupPath && actualOutputPaths?.lane === "counterfactual"
    ? await buildLocalActualAnchoredCounterfactualAudit(path.resolve(root, actualBackupPath))
    : null;
  let localCounterfactualJudgmentArtifact = null;
  let localJudgmentBoundCounterfactualRevealArtifact = null;
  if (localActualDayAuditBundle && actualOutputPaths) {
    assertHypothesisBlindArtifactBundleSafe(localActualDayAuditBundle);
    if (postJudgmentReveal) {
      if (localActualDayAuditBundle.reviewArtifact.reviewForUser !== true) {
        throw new Error("post-judgment reveal is blocked because no review-ready balanced packet exists");
      }
      const lockedReviewArtifact = JSON.parse(fs.readFileSync(actualOutputPaths.reviewOutput, "utf8"));
      assertLockedReviewMatchesGenerated(lockedReviewArtifact, localActualDayAuditBundle.reviewArtifact);
    }
  }
  if (localCounterfactualAuditBundle && actualOutputPaths) {
    assertActualAnchoredCounterfactualBundleSafe(localCounterfactualAuditBundle);
    if (postCounterfactualJudgmentReveal) {
      if (localCounterfactualAuditBundle.reviewArtifact.reviewForUser !== true) {
        throw new Error("counterfactual reveal is blocked because no review-ready balanced packet exists");
      }
      const lockedReviewArtifact = JSON.parse(fs.readFileSync(actualOutputPaths.reviewOutput, "utf8"));
      assertLockedCounterfactualReviewMatchesGenerated(
        lockedReviewArtifact,
        localCounterfactualAuditBundle.reviewArtifact
      );
      localCounterfactualJudgmentArtifact = JSON.parse(
        fs.readFileSync(actualOutputPaths.judgmentInput, "utf8")
      );
      assertCounterfactualJudgmentMatchesReview(
        localCounterfactualJudgmentArtifact,
        lockedReviewArtifact,
        {
          requireConfirmed: true,
          expectedJudgmentSetHash: actualCounterfactualJudgmentHash
        }
      );
      localJudgmentBoundCounterfactualRevealArtifact = buildJudgmentBoundCounterfactualRevealArtifact(
        lockedReviewArtifact,
        localCounterfactualAuditBundle.revealArtifact,
        localCounterfactualJudgmentArtifact
      );
    }
  }
  const ledger = {
    ...ledgerWithoutHash,
    deterministicHash,
    ...(localActualDayAuditBundle ? { localActualDayAudit: localActualDayAuditBundle.summaryAudit } : {}),
    ...(localCounterfactualAuditBundle
      ? { localActualAnchoredCounterfactualAudit: localCounterfactualAuditBundle.summaryAudit }
      : {}),
    ...(localCounterfactualJudgmentArtifact
      ? {
        localCounterfactualPostJudgment: {
          reviewPacketHash: localCounterfactualJudgmentArtifact.reviewPacketHash,
          judgmentSetHash: localCounterfactualJudgmentArtifact.judgmentSetHash,
          confirmationStatus: localCounterfactualJudgmentArtifact.confirmationStatus,
          interpretationRuleVersion: COUNTERFACTUAL_MEANING_RULE_VERSION,
          outcome: localJudgmentBoundCounterfactualRevealArtifact.meaningDecision.outcome
        }
      }
      : {})
  };
  const output = outputFormat === "csv" ? toCsv(ledger) : `${JSON.stringify(ledger, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutputPath = actualOutputPaths?.ledgerOutput || path.resolve(root, outputPath);
    if (!resolvedOutputPath.startsWith(root + path.sep)) throw new Error("--output must stay inside the repository");
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  const localReviewBundle = localActualDayAuditBundle || localCounterfactualAuditBundle;
  if (localReviewBundle && actualOutputPaths) {
    if (!actualOutputPaths.postMode) {
      fs.mkdirSync(path.dirname(actualOutputPaths.reviewOutput), { recursive: true });
      fs.writeFileSync(
        actualOutputPaths.reviewOutput,
        `${JSON.stringify(localReviewBundle.reviewArtifact, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
    }
    if (actualOutputPaths.revealOutput) {
      const revealArtifactToWrite = actualOutputPaths.lane === "counterfactual"
        ? localJudgmentBoundCounterfactualRevealArtifact
        : localReviewBundle.revealArtifact;
      if (!revealArtifactToWrite) {
        throw new Error("post-judgment reveal artifact was not produced");
      }
      fs.mkdirSync(path.dirname(actualOutputPaths.revealOutput), { recursive: true });
      fs.writeFileSync(
        actualOutputPaths.revealOutput,
        `${JSON.stringify(revealArtifactToWrite, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
    }
  }
  if (assertMode && assertions.some(assertion => !assertion.pass)) process.exitCode = 1;
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
