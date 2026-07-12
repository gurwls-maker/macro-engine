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
const assertMode = process.argv.includes("--assert");

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

function individualCorePenalty(input){
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
  const core = individualCorePenalty(input);
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
    individualCorePenalty: {
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
      const rows = [];
      const crossProfileRows = [];

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
      return { targetCases: rows, crossProfileCases: crossProfileRows };
    });
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function extractAnonymizedActualDays(backupFilePath){
  const payload = JSON.parse(fs.readFileSync(backupFilePath, "utf8"));
  const backupData = payload && typeof payload.data === "object" ? payload.data : payload;
  if (!Array.isArray(backupData?.records)) throw new Error("actual backup does not contain data.records");
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
    return await page.evaluate(data => {
      const normalizedSettings = normalizeSettingsBackup(data.settings || {});
      Object.assign(state, normalizedSettings);
      applyStateToInputs();
      recordsState.items = normalizeRecordsCollection(data.records || []);
      const currentResult = calculate();
      return recordsState.items.map((record, index) => {
        const score = getDailyAdherenceScore(record.date, currentResult, {
          goalSnapshot: record.goalSnapshot,
          useStoredAdherence: false
        });
        const target = score.detail?.target || {};
        const consumed = score.detail?.consumed || {};
        const penalties = score.detail?.penaltyBreakdown || null;
        const scoringContext = score.detail?.scoringContext || {};
        const joint = scoringContext.jointAllocationModel || null;
        const ratio = (actual, expected) => Number.isFinite(Number(actual)) && Number(expected) > 0
          ? Number(actual) / Number(expected)
          : null;
        return {
          sampleId: `actual_day_${String(index + 1).padStart(3, "0")}`,
          mealCount: Array.isArray(record.meals) ? record.meals.length : 0,
          goal: record.goalSnapshot?.goal || null,
          routine: record.goalSnapshot?.routine || null,
          exerciseManagementMode: record.goalSnapshot?.exerciseManagementMode || null,
          trainingContext: scoringContext.trainingContext || null,
          available: score.isAvailable === true,
          status: score.status,
          score: Number.isFinite(score.percent) ? score.percent : null,
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
            collapsed: joint.collapsed === true,
            carbG: consumed.carbs,
            fatG: consumed.fat,
            totalKcal: consumed.scoringKcal
          } : null
        };
      });
    }, backupData);
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

function addAggregationProbesToActualDay(day){
  if (!day.available || !day.penalties) return { ...day, domainScores: null, aggregationProbes: null, optionC: null };
  const penalties = day.penalties;
  const grouped = {
    energy: (penalties.targetEnergyDeviationPenalty || 0) + (penalties.tdeeOverloadPenalty || 0),
    protein: (penalties.proteinShortagePenalty || 0) + (penalties.proteinExcessEfficiencyPenalty || 0),
    fat: penalties.fatRangePenalty || 0,
    carb: penalties.carbExerciseContextPenalty || 0,
    joint: penalties.carbFatExchangeFailurePenalty || 0,
    alcohol: penalties.alcoholPhysiologyPenalty || 0
  };
  const domainScores = Object.fromEntries(Object.entries(grouped).map(([key, value]) => [key, round(clamp(100 - value))]));
  const activeScores = Object.entries(domainScores)
    .filter(([key, value]) => ["carb", "protein", "fat", "energy"].includes(key) || value < 100)
    .map(([, value]) => value);
  const c1 = optionC1CarbEnergyShareResidual(day.optionCInput || {});
  const c2 = optionC2RadialKcalPlaneResidual(day.optionCInput || {});
  const residualPositive = c1.valid && Number(c1.ratio) > OPTION_C_EPSILON;
  const coreAxes = {
    energy: grouped.energy > OPTION_C_EPSILON,
    carb: grouped.carb > OPTION_C_EPSILON,
    fat: grouped.fat > OPTION_C_EPSILON
  };
  const overlap = residualPositive && Object.values(coreAxes).some(Boolean);
  return {
    ...day,
    domainScores,
    aggregationProbes: {
      rawProduct: round(rawProduct(activeScores)),
      softminP4: round(negativePowerMean(activeScores, -4)),
      minimumResidual10: round(minimumWithBoundedResidual(activeScores, 0.1))
    },
    optionC: {
      valid: c1.valid,
      status: c1.status,
      direction: c1.direction,
      residual: round(c1.ratio, 12),
      c1C2AbsoluteDelta: c1.valid && c2.valid ? round(Math.abs(c1.ratio - c2.ratio), 15) : null,
      coreOverlap: {
        axes: coreAxes,
        overlap,
        uniqueResidual: residualPositive && !overlap
      }
    }
  };
}

function selectActualSample(days, predicate, sorter){
  const matches = days.filter(day => day.available && predicate(day));
  matches.sort(sorter);
  return matches[0] || null;
}

function sanitizeSelectedActualSample(category, day){
  if (!day) return null;
  return {
    category,
    sampleId: day.sampleId,
    mealCount: day.mealCount,
    goal: day.goal,
    trainingContext: day.trainingContext,
    currentScore: round(day.score),
    ratios: Object.fromEntries(Object.entries(day.ratios).map(([key, value]) => [key, round(value)])),
    standardDrinks: round(day.standardDrinks),
    domainScores: day.domainScores,
    aggregationProbes: day.aggregationProbes,
    optionC: day.optionC ? {
      valid: day.optionC.valid,
      status: day.optionC.status,
      direction: day.optionC.direction,
      residual: day.optionC.residual,
      coreOverlap: day.optionC.coreOverlap
    } : null
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

function summarizeActualValues(days, selector){
  const pairs = days
    .map(day => ({ current: day.score, value: selector(day) }))
    .filter(item => Number.isFinite(item.current) && Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  if (!pairs.length) return null;
  const values = pairs.map(item => item.value);
  const median = values.length % 2
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const bands = {};
  for (const value of values) bands[scoreBand(value)] = (bands[scoreBand(value)] || 0) + 1;
  return {
    count: values.length,
    min: round(values[0]),
    median: round(median),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: round(values[values.length - 1]),
    meanDeltaFromCurrent: round(pairs.reduce((sum, item) => sum + item.value - item.current, 0) / pairs.length),
    bandCounts: bands
  };
}

async function buildLocalActualDayAudit(backupFilePath){
  const extracted = (await extractAnonymizedActualDays(backupFilePath)).map(addAggregationProbesToActualDay);
  const available = extracted.filter(day => day.available);
  const byClosestEnergy = (a, b) => Math.abs(a.ratios.energy - 1) - Math.abs(b.ratios.energy - 1);
  const normal = selectActualSample(
    available,
    day => day.standardDrinks === 0 && day.ratios.energy >= 0.9 && day.ratios.energy <= 1.1,
    (a, b) => b.score - a.score
  );
  const under = selectActualSample(available, day => Number.isFinite(day.ratios.energy), (a, b) => a.ratios.energy - b.ratios.energy);
  const over = selectActualSample(available, day => Number.isFinite(day.ratios.energy), (a, b) => b.ratios.energy - a.ratios.energy);
  const exercise = selectActualSample(
    available,
    day => day.trainingContext && day.trainingContext !== "rest",
    byClosestEnergy
  );
  const alcohol = selectActualSample(available, day => day.standardDrinks > 0, (a, b) => b.standardDrinks - a.standardDrinks);
  const exchange = selectActualSample(
    available,
    day => day.ratios.energy >= 0.85 && day.ratios.energy <= 1.15 && day.ratios.carb > 1 && day.ratios.fat < 1,
    (a, b) => ((b.ratios.carb - 1) + (1 - b.ratios.fat)) - ((a.ratios.carb - 1) + (1 - a.ratios.fat))
  );
  const multiModerate = selectActualSample(
    available,
    day => {
      const core = [day.domainScores?.energy, day.domainScores?.protein, day.domainScores?.fat, day.domainScores?.carb];
      return core.every(score => Number.isFinite(score) && score >= 80)
        && core.filter(score => score < 95).length >= 2;
    },
    (a, b) => a.aggregationProbes.rawProduct - b.aggregationProbes.rawProduct
  );
  const optionCFat = selectActualSample(
    available,
    day => day.optionC?.valid && day.optionC.direction === "fat_heavy",
    (a, b) => b.optionC.residual - a.optionC.residual
  );
  const optionCCarb = selectActualSample(
    available,
    day => day.optionC?.valid && day.optionC.direction === "carb_heavy",
    (a, b) => b.optionC.residual - a.optionC.residual
  );
  const optionCOverlap = selectActualSample(
    available,
    day => day.optionC?.coreOverlap?.overlap === true,
    (a, b) => b.optionC.residual - a.optionC.residual
  );
  const optionCUnique = selectActualSample(
    available,
    day => day.optionC?.coreOverlap?.uniqueResidual === true,
    (a, b) => b.optionC.residual - a.optionC.residual
  );
  const selectedSamples = [
    sanitizeSelectedActualSample("normal", normal),
    sanitizeSelectedActualSample("under", under),
    sanitizeSelectedActualSample("over", over),
    sanitizeSelectedActualSample("exercise", exercise),
    sanitizeSelectedActualSample("alcohol", alcohol),
    sanitizeSelectedActualSample("same_kcal_exchange_candidate", exchange),
    sanitizeSelectedActualSample("multi_moderate", multiModerate),
    sanitizeSelectedActualSample("option_c_fat_heavy", optionCFat),
    sanitizeSelectedActualSample("option_c_carb_heavy", optionCCarb),
    sanitizeSelectedActualSample("option_c_core_overlap", optionCOverlap),
    sanitizeSelectedActualSample("option_c_unique_residual", optionCUnique)
  ].filter(Boolean);
  const requestedCategories = [
    "normal",
    "under",
    "over",
    "exercise",
    "alcohol",
    "same_kcal_exchange_candidate",
    "multi_moderate",
    "option_c_fat_heavy",
    "option_c_carb_heavy",
    "option_c_core_overlap",
    "option_c_unique_residual"
  ];
  const validOptionC = available.filter(day => day.optionC?.valid === true);
  const residualPositive = validOptionC.filter(day => Number(day.optionC.residual) > OPTION_C_EPSILON);
  const directionCounts = validOptionC.reduce((counts, day) => {
    const direction = day.optionC.direction || "invalid";
    counts[direction] = (counts[direction] || 0) + 1;
    return counts;
  }, {});
  const auditWithoutHash = {
    schemaVersion: "component_score_local_actual_day_audit_v2",
    privacyContract: "No dates, food names, memo text, meal ids, absolute macro grams, absolute kcal values, backup path, or raw backup payload are emitted.",
    sourceRecordCount: extracted.length,
    availableScoreCount: available.length,
    selectedCategoryCount: selectedSamples.length,
    missingCategories: requestedCategories
      .filter(category => !selectedSamples.some(sample => sample.category === category)),
    allDayAggregationSummary: {
      current: summarizeActualValues(available, day => day.score),
      rawProduct: summarizeActualValues(available, day => day.aggregationProbes?.rawProduct),
      softminP4: summarizeActualValues(available, day => day.aggregationProbes?.softminP4),
      minimumResidual10: summarizeActualValues(available, day => day.aggregationProbes?.minimumResidual10)
    },
    optionCResidualSummary: {
      validCount: validOptionC.length,
      invalidCount: available.length - validOptionC.length,
      residualPositiveCount: residualPositive.length,
      uniqueResidualCaseCount: residualPositive.filter(day => day.optionC.coreOverlap.uniqueResidual).length,
      coreOverlapCount: residualPositive.filter(day => day.optionC.coreOverlap.overlap).length,
      directionCounts,
      residualDistribution: summarizePlainValues(validOptionC.map(day => day.optionC.residual)),
      c1C2DeltaDistribution: summarizePlainValues(validOptionC.map(day => day.optionC.c1C2AbsoluteDelta))
    },
    selectedSamples
  };
  return {
    ...auditWithoutHash,
    anonymizedAuditHash: crypto.createHash("sha256").update(JSON.stringify(auditWithoutHash)).digest("hex")
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

function buildProductionGeometrySweep(cases){
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  const neutralZoneScales = [0.98, 1, 1.02];
  const perGeometry = [];
  const allEvaluated = [];
  const coreMatchedExamples = [];

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
      const core = individualCorePenalty(input);
      const residualPositive = c1.valid && c1.ratio > OPTION_C_EPSILON;
      const coreAllZero = [core.energyPenalty, core.carbPenalty, core.fatPenalty]
        .every(value => Number.isFinite(value) && Math.abs(value) <= OPTION_C_EPSILON);
      return {
        caseId: productionCase.id,
        matrixKind: productionCase.matrixKind,
        pointId: point.id,
        source: point.source,
        valid: c1.valid && c2.valid,
        residual: c1.ratio,
        direction: c1.direction,
        availableKcalSource: c1.feasible?.availableKcalSource || null,
        c1C2Delta: c1.valid && c2.valid ? Math.abs(c1.ratio - c2.ratio) : null,
        core: {
          energy: core.energyPenalty,
          carb: core.carbPenalty,
          fat: core.fatPenalty,
          total: core.total
        },
        residualPositive,
        uniqueResidual: residualPositive && coreAllZero,
        coreOverlap: residualPositive && !coreAllZero,
        coreSignature: [core.energyPenalty, core.carbPenalty, core.fatPenalty].map(value => round(value, 9)).join("|")
      };
    });
    allEvaluated.push(...evaluated);
    const groups = new Map();
    evaluated.filter(item => item.valid).forEach(item => {
      const list = groups.get(item.coreSignature) || [];
      list.push(item);
      groups.set(item.coreSignature, list);
    });
    let matchedPair = null;
    for (const [coreSignature, group] of groups) {
      const sorted = [...group].sort((a, b) => a.residual - b.residual || (a.pointId < b.pointId ? -1 : 1));
      if (sorted.length > 1 && sorted[sorted.length - 1].residual - sorted[0].residual > 1e-9) {
        matchedPair = {
          caseId: productionCase.id,
          coreSignature,
          lowerResidualPoint: { pointId: sorted[0].pointId, residual: round(sorted[0].residual, 12), direction: sorted[0].direction },
          higherResidualPoint: { pointId: sorted[sorted.length - 1].pointId, residual: round(sorted[sorted.length - 1].residual, 12), direction: sorted[sorted.length - 1].direction }
        };
        coreMatchedExamples.push(matchedPair);
        break;
      }
    }
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
      coreMatchedPairFound: !!matchedPair,
      availableKcalSource: availableKcalSources.length === 1 ? availableKcalSources[0] : "mixed_or_invalid",
      maximumResidual: round(Math.max(0, ...evaluated.map(item => Number(item.residual) || 0)), 12),
      maximumC1C2Delta: round(Math.max(0, ...evaluated.map(item => Number(item.c1C2Delta) || 0)), 15)
    });
  }

  const positive = allEvaluated.filter(item => item.residualPositive);
  const uniquePositive = positive.filter(item => item.uniqueResidual);
  const overlappingPositive = positive.filter(item => item.coreOverlap);
  const curvePenaltyDistributions = Object.fromEntries(Object.keys(optionCCurveProbeDefinitions).map(name => [
    name,
    {
      unique: summarizePlainValues(uniquePositive.map(item => evaluateOptionCCurveProbes(item.residual)?.[name])),
      overlap: summarizePlainValues(overlappingPositive.map(item => evaluateOptionCCurveProbes(item.residual)?.[name]))
    }
  ]));
  return {
    schemaVersion: "option_c_production_geometry_sweep_v1",
    geometryCount: cases.length,
    validGeometryCount: perGeometry.filter(item => item.valid).length,
    sampleCount: allEvaluated.length,
    targetEnergyNeutralSampleCount: allEvaluated.filter(item => item.source === "target_energy_neutral_zone").length,
    residualPositiveCount: positive.length,
    uniqueResidualCaseCount: uniquePositive.length,
    coreOverlapCount: overlappingPositive.length,
    overlapAccountingComplete: positive.every(item => item.uniqueResidual !== item.coreOverlap),
    coreMatchedGeometryCount: perGeometry.filter(item => item.coreMatchedPairFound).length,
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
      rows.push(["joint", fixture.id, model, result.penalty, "", `core=${fixture.individualCorePenalty.total}`]);
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
  const targetSummary = summarizeTargetMatrix(targetCases);
  const crossProfileSummary = summarizeTargetMatrix(crossProfileCases);
  const optionCDecisionEvidence = buildOptionCDecisionEvidence(jointFixtures);
  const productionGeometrySweep = buildProductionGeometrySweep([...targetCases, ...crossProfileCases]);
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
    makeAssertion("non-aligned raw rectangle exposes a core-matched interaction distinction", JSON.stringify(nonAlignedOutside?.individualCorePenalty) === JSON.stringify(nonAlignedInside?.individualCorePenalty) && nonAlignedOutside?.residuals.c1_carb_energy_share.ratio > 0 && nonAlignedInside?.residuals.c1_carb_energy_share.ratio === 0, `outside=${nonAlignedOutside?.residuals.c1_carb_energy_share.ratio},inside=${nonAlignedInside?.residuals.c1_carb_energy_share.ratio},core=${JSON.stringify(nonAlignedOutside?.individualCorePenalty)}`),
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
    makeAssertion("production geometry sweep preserves C1/C2 equivalence", productionGeometrySweep.c1C2MaximumAbsoluteDelta <= 1e-12, `maxDelta=${productionGeometrySweep.c1C2MaximumAbsoluteDelta}`),
    makeAssertion("production geometry overlap evidence is fully accounted", productionGeometrySweep.overlapAccountingComplete, `positive=${productionGeometrySweep.residualPositiveCount},unique=${productionGeometrySweep.uniqueResidualCaseCount},overlap=${productionGeometrySweep.coreOverlapCount}`)
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
        syntheticFixtures: optionCDecisionEvidence,
        productionGeometry: {
          geometryCount: productionGeometrySweep.geometryCount,
          sampleCount: productionGeometrySweep.sampleCount,
          residualPositiveCount: productionGeometrySweep.residualPositiveCount,
          uniqueResidualCaseCount: productionGeometrySweep.uniqueResidualCaseCount,
          coreOverlapCount: productionGeometrySweep.coreOverlapCount,
          coreMatchedGeometryCount: productionGeometrySweep.coreMatchedGeometryCount,
          overlapAccountingComplete: productionGeometrySweep.overlapAccountingComplete
        },
        combinedResidualEvidence: {
          residualPositiveCount: optionCDecisionEvidence.residualPositiveCount + productionGeometrySweep.residualPositiveCount,
          uniqueResidualCaseCount: optionCDecisionEvidence.uniqueResidualCaseCount + productionGeometrySweep.uniqueResidualCaseCount,
          coreOverlapCount: optionCDecisionEvidence.coreOverlapCount + productionGeometrySweep.coreOverlapCount
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
      productionReadinessFromDeterministicFixturesAlone: "NO"
    },
    assertions
  };
  const deterministicHash = crypto.createHash("sha256").update(JSON.stringify(ledgerWithoutHash)).digest("hex");
  const localActualDayAudit = actualBackupPath
    ? await buildLocalActualDayAudit(path.resolve(root, actualBackupPath))
    : null;
  const ledger = {
    ...ledgerWithoutHash,
    deterministicHash,
    ...(localActualDayAudit ? { localActualDayAudit } : {})
  };
  const output = outputFormat === "csv" ? toCsv(ledger) : `${JSON.stringify(ledger, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutputPath = path.resolve(root, outputPath);
    if (!resolvedOutputPath.startsWith(root + path.sep)) throw new Error("--output must stay inside the repository");
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  if (assertMode && assertions.some(assertion => !assertion.pass)) process.exitCode = 1;
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
