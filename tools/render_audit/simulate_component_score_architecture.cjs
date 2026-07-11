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

function interpolateAnchors(value, anchors){
  if (!Number.isFinite(value) || value <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [x1, y1] = anchors[index];
    const [x0, y0] = anchors[index - 1];
    if (value <= x1) {
      const ratio = (value - x0) / Math.max(1e-9, x1 - x0);
      return y0 + (y1 - y0) * ratio;
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

function jointAllocationResidual(input){
  const availableKcal = input.targetKcal - input.targetProteinG * 4;
  const consumedKcal = input.carbG * 4 + input.fatG * 9;
  if (!(availableKcal > 0) || !(consumedKcal > 0)) return { ratio: null, penalty: 0, normalizedCarbG: null };
  const scale = availableKcal / consumedKcal;
  const normalizedCarbG = input.carbG * scale;
  let ratio = 0;
  if (normalizedCarbG < input.carbMinG) ratio = (input.carbMinG - normalizedCarbG) / input.carbMinG;
  if (normalizedCarbG > input.carbMaxG) ratio = (normalizedCarbG - input.carbMaxG) / input.carbMaxG;
  return {
    ratio,
    penalty: interpolateAnchors(ratio, currentJointAnchors),
    normalizedCarbG
  };
}

function individualCorePenalty(input){
  const targetRatio = input.totalKcal / input.targetKcal;
  const energyPenalty = targetRatio < 1
    ? interpolateAnchors(1 - targetRatio, currentEnergyUnderAnchors)
    : interpolateAnchors(targetRatio - 1, currentEnergyOverAnchors);
  const fatLowRatio = input.fatG < input.fatMinG ? (input.fatMinG - input.fatG) / input.fatMinG : 0;
  const fatHighRatio = input.fatG > input.fatMaxG ? (input.fatG - input.fatMaxG) / input.fatMaxG : 0;
  const carbLowRatio = input.carbG < input.carbMinG ? (input.carbMinG - input.carbG) / input.carbMinG : 0;
  const carbHighRatio = input.carbG > input.carbMaxG ? (input.carbG - input.carbMaxG) / input.carbMaxG : 0;
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
    targetKcal,
    targetProteinG,
    carbMinG,
    carbMaxG,
    fatMinG,
    fatMaxG,
    proteinAdequate: true,
    tdeeOk: true,
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
  const residual = jointAllocationResidual(input);
  const core = individualCorePenalty(input);
  return {
    ...input,
    deviationRatios: Object.fromEntries(Object.entries(deviationRatios).map(([key, value]) => [key, round(value, 9)])),
    results: {
      option_a_remove_joint: { penalty: 0 },
      option_b_legacy_invalid_exchange_only: { penalty: round(optionBPenalty) },
      option_c_joint_allocation_residual: {
        penalty: round(residual.penalty),
        residualRatio: round(residual.ratio, 6),
        normalizedCarbG: round(residual.normalizedCarbG)
      },
      option_d_current_thresholded: { penalty: round(currentPenalty) }
    },
    individualCorePenalty: {
      energy: round(core.energyPenalty),
      carb: round(core.carbPenalty),
      fat: round(core.fatPenalty),
      total: round(core.total)
    },
    currentJointShareOfCorePlusJoint: round(currentPenalty / Math.max(1e-9, core.total + currentPenalty), 6)
  };
}

function buildJointFixtures(){
  const fixtures = [];
  for (const fatLowPct of [34, 35, 36]) {
    for (const carbLowPct of [24, 25, 26]) {
      const base = makeJointFixture(`threshold_fat_${fatLowPct}_carb_${carbLowPct}`);
      fixtures.push(evaluateJointFixture({
        ...base,
        fatG: base.fatMinG * (1 - fatLowPct / 100),
        carbG: base.carbMinG * (1 - carbLowPct / 100),
        totalKcal: base.targetProteinG * 4 + base.fatMinG * (1 - fatLowPct / 100) * 9 + base.carbMinG * (1 - carbLowPct / 100) * 4
      }));
    }
  }

  fixtures.push(evaluateJointFixture(makeJointFixture("user_reproduced_before", {
    carbG: 169,
    fatG: 16.2,
    totalKcal: 1116,
    observedUiPenalty: 20.6
  })));
  fixtures.push(evaluateJointFixture(makeJointFixture("user_reproduced_after", {
    carbG: 241,
    fatG: 18.7,
    totalKcal: 1538,
    observedUiPenalty: 0
  })));

  const valid = makeJointFixture("same_kcal_valid_exchange");
  fixtures.push(evaluateJointFixture({
    ...valid,
    carbG: 300,
    fatG: (valid.targetKcal - valid.targetProteinG * 4 - 300 * 4) / 9,
    totalKcal: valid.targetKcal
  }));

  fixtures.push(evaluateJointFixture(makeJointFixture("high_carb_high_fat_energy_over", {
    carbG: 400,
    fatG: 90,
    totalKcal: 2912,
    tdeeOk: false
  })));

  const lowBalanced = makeJointFixture("low_carb_low_fat_energy_under_balanced_mix");
  fixtures.push(evaluateJointFixture({
    ...lowBalanced,
    carbG: 149.9,
    fatG: 28.35,
    totalKcal: 1106
  }));

  const skew = makeJointFixture("same_kcal_outside_joint_segment");
  fixtures.push(evaluateJointFixture({
    ...skew,
    carbG: 390,
    fatG: (skew.targetKcal - skew.targetProteinG * 4 - 390 * 4) / 9,
    totalKcal: skew.targetKcal
  }));
  return fixtures;
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
      const rows = [];

      function applyContext(name){
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

      function targetAlignedProteinPenalties(scoringContext, policy){
        const protein = Number(scoringContext.proteinG);
        const minimum = Number(scoringContext.proteinRange?.min);
        const maximum = Number(scoringContext.proteinRange?.max);
        if (![protein, minimum, maximum].every(Number.isFinite) || !(minimum > 0) || !(maximum > 0)) {
          return { shortage: null, excess: null };
        }
        if (protein < minimum) {
          return { shortage: interpolatePenaltyFromAnchors((minimum - protein) / minimum, policy.proteinShortageAnchors), excess: 0 };
        }
        if (protein > maximum) {
          return { shortage: 0, excess: interpolatePenaltyFromAnchors((protein - maximum) / maximum, policy.proteinExcessAnchors) };
        }
        return { shortage: 0, excess: 0 };
      }

      for (const contextName of contexts) {
        for (const goal of goals) {
          for (const proteinLevel of proteinLevels) {
            applyContext(contextName);
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
            const options = {};
            const summary = getMacroRangeProductionScoreSummary(balance, target, options);
            const scoringContext = buildV83ContinuousScoringContext(balance, target, options);
            const policy = getV83ContinuousScoringPolicy();
            const validity = targetValidity(target);
            const alignedProtein = targetAlignedProteinPenalties(scoringContext, policy);
            const corrected = { ...summary.penaltyBreakdown };
            if (validity.valid) {
              const overloadReference = Math.max(scoringContext.targetKcal, scoringContext.totalBurn);
              corrected.tdeeOverloadPenalty = getTdeeOverloadPenalty({
                ...scoringContext,
                totalBurn: overloadReference,
                tdeeRatio: overloadReference > 0 ? scoringContext.scoringKcal / overloadReference : null
              }, policy);
              corrected.proteinShortagePenalty = alignedProtein.shortage;
              corrected.proteinExcessEfficiencyPenalty = alignedProtein.excess;
            }
            const correctedRawScore = validity.valid ? 100 - getPenaltyTotal(corrected) : null;
            rows.push({
              id: `${goal}_${contextName}_${proteinLevel}`,
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
                targetAuthority: summary.scoringContext?.targetAuthority || null
              },
              correctedReferenceProbe: {
                percent: correctedRawScore === null ? null : Math.max(0, Math.min(100, correctedRawScore)),
                rawScore: correctedRawScore,
                penalties: corrected
              }
            });
          }
        }
      }
      return rows;
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
          penalties
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
  if (!day.available || !day.penalties) return { ...day, domainScores: null, aggregationProbes: null };
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
  return {
    ...day,
    domainScores,
    aggregationProbes: {
      rawProduct: round(rawProduct(activeScores)),
      softminP4: round(negativePowerMean(activeScores, -4)),
      minimumResidual10: round(minimumWithBoundedResidual(activeScores, 0.1))
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
    aggregationProbes: day.aggregationProbes
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
  const selectedSamples = [
    sanitizeSelectedActualSample("normal", normal),
    sanitizeSelectedActualSample("under", under),
    sanitizeSelectedActualSample("over", over),
    sanitizeSelectedActualSample("exercise", exercise),
    sanitizeSelectedActualSample("alcohol", alcohol),
    sanitizeSelectedActualSample("same_kcal_exchange_candidate", exchange),
    sanitizeSelectedActualSample("multi_moderate", multiModerate)
  ].filter(Boolean);
  const requestedCategories = ["normal", "under", "over", "exercise", "alcohol", "same_kcal_exchange_candidate", "multi_moderate"];
  const auditWithoutHash = {
    schemaVersion: "component_score_local_actual_day_audit_v1",
    privacyContract: "No dates, food names, memo text, meal ids, or raw backup payload are emitted.",
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
  const correctedNon100 = cases.filter(item => !isExact100(item.correctedReferenceProbe.percent));
  const invalidTargets = cases.filter(item => !item.validity.valid);
  const invalidProductionAuthority = cases.filter(item => item.current.targetAuthority?.valid !== true);
  return {
    caseCount: cases.length,
    currentExact100Count: cases.length - currentNon100.length,
    currentNon100Count: currentNon100.length,
    currentBelow95Count: currentBelow95.length,
    currentNon100Ids: currentNon100.map(item => item.id),
    correctedExact100Count: cases.length - correctedNon100.length,
    correctedNon100Count: correctedNon100.length,
    correctedNon100Ids: correctedNon100.map(item => item.id),
    validityPassCount: cases.length - invalidTargets.length,
    validityFailCount: invalidTargets.length,
    validityFailIds: invalidTargets.map(item => item.id),
    productionAuthorityPassCount: cases.length - invalidProductionAuthority.length,
    productionAuthorityFailCount: invalidProductionAuthority.length,
    productionAuthorityFailIds: invalidProductionAuthority.map(item => item.id)
  };
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
  }
  for (const fixture of ledger.targetMatrix.cases) {
    rows.push(["target", fixture.id, "current", fixture.current.percent, scoreBand(fixture.current.percent), `valid=${fixture.validity.valid}`]);
    rows.push(["target", fixture.id, "corrected_reference_probe", fixture.correctedReferenceProbe.percent, scoreBand(fixture.correctedReferenceProbe.percent), `valid=${fixture.validity.valid}`]);
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
  const targetCases = await buildTargetMatrix();
  const targetSummary = summarizeTargetMatrix(targetCases);
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
    makeAssertion("target matrix has 54 cases", targetSummary.caseCount === 54, `count=${targetSummary.caseCount}`),
    makeAssertion("current target matrix produces finite scores", currentTargetScoresAreFinite, `finite=${targetCases.filter(item => Number.isFinite(item.current.percent)).length}/${targetCases.length}`),
    makeAssertion("current production restores exact generated targets", targetSummary.currentNon100Count === 0, `non100=${targetSummary.currentNon100Count}`),
    makeAssertion("current production target authority passes generated targets", targetSummary.productionAuthorityFailCount === 0, `invalid=${targetSummary.productionAuthorityFailCount}`),
    makeAssertion("corrected reference probe restores exact targets", targetSummary.correctedNon100Count === 0, `non100=${targetSummary.correctedNon100Count}`),
    makeAssertion("target validity envelope passes generated targets", targetSummary.validityFailCount === 0, `invalid=${targetSummary.validityFailCount}`)
  ];

  const ledgerWithoutHash = {
    schemaVersion: "component_score_architecture_falsification_v1",
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
      model_g_min_residual: "Worst score minus bounded 5/10/20 percent accumulation from other shortfalls; probes only."
    },
    modelScreening,
    symmetricFixtures,
    jointDecisionOptions: {
      optionA: "remove joint domain",
      optionB: "remove low-low/high-high and preserve only legacy invalid-exchange branch",
      optionC: "normalize carb/fat intake to the protein-reserved joint budget and score only distance outside the feasible joint segment",
      optionD: "keep current thresholded interaction"
    },
    jointFixtures,
    targetMatrix: { summary: targetSummary, cases: targetCases },
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
