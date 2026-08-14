const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_PREFIX = "runstep_macro_v1_";
const FAKE_NOW_KEY = "__macro_engine_a1_fake_now__";
const SEED_MARKER_KEY = "__macro_engine_a1_seeded__";
const OLD_DATE = "2026-08-10";
const NEW_DATE = "2026-08-11";
const OLD_NOON = "2026-08-10T12:00:00+09:00";
const NEW_NOON = "2026-08-11T12:00:00+09:00";

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
  const userProfile = process.env.USERPROFILE || process.env.HOME;
  if (userProfile) {
    addNodeModuleCandidatesFrom(
      path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"),
      targets
    );
  }
  process.env.NODE_PATH = [...targets, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

configurePortableNodePath();
const { chromium } = require("playwright");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

const baseStorage = Object.freeze({
  [`${STORAGE_PREFIX}onboardingCompletedVersion`]: "1",
  [`${STORAGE_PREFIX}bodyCompositionConfirmed`]: "true",
  [`${STORAGE_PREFIX}mode`]: "general",
  [`${STORAGE_PREFIX}weight`]: "75",
  [`${STORAGE_PREFIX}height`]: "173",
  [`${STORAGE_PREFIX}age`]: "32",
  [`${STORAGE_PREFIX}bodyFat`]: "15",
  [`${STORAGE_PREFIX}skeletal`]: "35",
  [`${STORAGE_PREFIX}gender`]: "male",
  [`${STORAGE_PREFIX}activityLevel`]: "moderate",
  [`${STORAGE_PREFIX}workType`]: "office",
  [`${STORAGE_PREFIX}sleepHours`]: "8",
  [`${STORAGE_PREFIX}workHours`]: "8",
  [`${STORAGE_PREFIX}lifestyleHours`]: "2",
  [`${STORAGE_PREFIX}workAdj`]: "0",
  [`${STORAGE_PREFIX}homeInbody`]: "true",
  [`${STORAGE_PREFIX}exerciseManagementMode`]: "exercise",
  [`${STORAGE_PREFIX}exerciseProfile`]: "bodybuilding",
  [`${STORAGE_PREFIX}weeklyTrainingDays`]: "4",
  [`${STORAGE_PREFIX}weeklyTrainingDaysManual`]: "true",
  [`${STORAGE_PREFIX}generalAdvancedSettings`]: "true",
  [`${STORAGE_PREFIX}routinePlan`]: "ppl_ul",
  [`${STORAGE_PREFIX}routine`]: "PUSH",
  [`${STORAGE_PREFIX}intensityOverride`]: "0.8",
  [`${STORAGE_PREFIX}weightDuration`]: "120",
  [`${STORAGE_PREFIX}goal`]: "maintain",
  [`${STORAGE_PREFIX}cardioType`]: "treadmill_walk",
  [`${STORAGE_PREFIX}cardioDuration`]: "0",
  [`${STORAGE_PREFIX}cardioSpeed`]: "5",
  [`${STORAGE_PREFIX}cardioIncline`]: "0",
  [`${STORAGE_PREFIX}routineWeekdaySchedule`]: "{}",
  [`${STORAGE_PREFIX}weekdayTimeDefaults`]: "{}",
  [`${STORAGE_PREFIX}records`]: "[]",
  [`${STORAGE_PREFIX}inbodyRecords`]: "[]",
  [`${STORAGE_PREFIX}activeTab`]: "today"
});

function storage(overrides = {}){
  return { ...baseStorage, ...overrides };
}

function literalGoalSnapshot(overrides = {}){
  return {
    targetCal: 2600,
    protein: 150,
    carbs: 350,
    fat: 66.67,
    mode: "general",
    goal: "maintain",
    weight: 75,
    height: 173,
    age: 32,
    gender: "male",
    bodyFat: 15,
    bodyFatMass: 11.25,
    skeletal: 35,
    activityLevel: "moderate",
    workType: "office",
    sleepHours: 8,
    workHours: 8,
    lifestyleHours: 2,
    workAdj: 0,
    exerciseManagementMode: "exercise",
    weeklyTrainingDays: 4,
    routinePlan: "ppl_ul",
    routine: "PUSH",
    intensityOverride: 0.8,
    weightDuration: 60,
    cardioType: "treadmill_walk",
    cardioDuration: 0,
    cardioSpeed: 5,
    cardioIncline: 0,
    homeInbody: true,
    expertLbmAlpha: 0.8,
    generalAdvancedSettings: true,
    generalLowDigestCarbs: false,
    snapshotSource: "saved_at_entry",
    ...overrides
  };
}

function makeServer(){
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(root, requestedPath.slice(1));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
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
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(data);
    });
  });
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function launchBrowser(){
  const launchOptions = {
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--disable-background-networking"]
  };
  const channels = [...new Set([
    process.env.PLAYWRIGHT_BROWSER_CHANNEL,
    "msedge",
    "chrome",
    ""
  ].filter(value => value !== undefined))];
  let lastError = null;
  for (const channel of channels) {
    try {
      return await chromium.launch({ ...launchOptions, ...(channel ? { channel } : {}) });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Playwright browser launch failed");
}

async function installSeedAndClock(context, initialStorage, fakeNow = OLD_NOON){
  await context.addInitScript(({ seed, fakeNowIso, fakeNowKey, seedMarkerKey }) => {
    try {
      if (location.protocol === "http:" || location.protocol === "https:") {
        if (localStorage.getItem(seedMarkerKey) !== "1") {
          Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, String(value)));
          localStorage.setItem(seedMarkerKey, "1");
        }
        if (!localStorage.getItem(fakeNowKey)) localStorage.setItem(fakeNowKey, fakeNowIso);
      }
    } catch (_error) {
      // about:blank has no usable localStorage; the same script runs again for index.html.
    }
    const NativeDate = Date;
    const readNow = () => {
      try {
        const raw = localStorage.getItem(fakeNowKey) || fakeNowIso;
        const parsed = NativeDate.parse(raw);
        return Number.isFinite(parsed) ? parsed : NativeDate.parse(fakeNowIso);
      } catch (_error) {
        return NativeDate.parse(fakeNowIso);
      }
    };
    function A1Date(...args){
      if (!(this instanceof A1Date)) return new NativeDate(readNow()).toString();
      return args.length ? new NativeDate(...args) : new NativeDate(readNow());
    }
    A1Date.prototype = NativeDate.prototype;
    Object.setPrototypeOf(A1Date, NativeDate);
    A1Date.now = readNow;
    A1Date.parse = NativeDate.parse;
    A1Date.UTC = NativeDate.UTC;
    window.Date = A1Date;
  }, {
    seed: initialStorage,
    fakeNowIso: fakeNow,
    fakeNowKey: FAKE_NOW_KEY,
    seedMarkerKey: SEED_MARKER_KEY
  });
}

async function loadApp(page, baseUrl){
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (
    document.readyState !== "loading"
    && !!document.getElementById("tabToday")
    && !document.body.classList.contains("app-booting")
  ), null, { timeout: 90000 });
}

async function setFakeNow(page, iso){
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: FAKE_NOW_KEY, value: iso });
}

async function rawStorage(page, suffix){
  return page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}${suffix}`);
}

async function jsonStorage(page, suffix, fallback){
  const raw = await rawStorage(page, suffix);
  if (raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${suffix} is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

function formatValue(value){
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function expectTrue(condition, label, detail = ""){
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
}

function expectEqual(actual, expected, label){
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${formatValue(expected)}, got ${formatValue(actual)}`);
  }
}

function expectJsonEqual(actual, expected, label){
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
}

async function typeSequence(locator, first, rest = []){
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  if (String(first) === "") await locator.press("Backspace");
  else await locator.type(String(first));
  for (const part of rest) await locator.type(String(part));
}

async function blurWithTab(locator){
  await locator.press("Tab");
  await sleep(60);
}

async function expectVisible(locator, label){
  if (await locator.isVisible()) return;
  const detail = await locator.evaluate(element => {
    const ancestors = [];
    let current = element;
    while (current && ancestors.length < 8) {
      const style = getComputedStyle(current);
      ancestors.push({
        tag: current.tagName,
        id: current.id || "",
        className: typeof current.className === "string" ? current.className : "",
        hidden: !!current.hidden,
        ariaHidden: current.getAttribute?.("aria-hidden"),
        display: style.display,
        visibility: style.visibility
      });
      current = current.parentElement;
    }
    return {
      value: element.value,
      ancestors,
      activeTab: document.querySelector(".tab-btn.active")?.id || ""
    };
  });
  throw new Error(`${label}: ${JSON.stringify(detail)}`);
}

async function openSettingsDisclosure(page, groupSelector){
  const group = page.locator(groupSelector);
  expectEqual(await group.count(), 1, `${groupSelector} must resolve to one Settings group`);
  if ((await group.getAttribute("class") || "").includes("is-collapsed")) {
    await group.locator(":scope > .section-group-head .settings-disclosure-toggle").click();
  }
}

async function expectNoDraftField(page, date, field, label){
  const drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectTrue(!Object.prototype.hasOwnProperty.call(drafts?.[date] || {}, field), label, formatValue(drafts));
}

async function clickAndHandleDialog(locator, page, action){
  const dialogPromise = page.waitForEvent("dialog", { timeout: 5000 });
  const clickPromise = locator.click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  if (action === "accept") await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
  return message;
}

async function scenarioTodayAndSettings({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await page.locator("#todayQuickEditToggle").click();
  const todayDuration = page.locator("#todayQuickWeightDuration");
  expectEqual(await todayDuration.inputValue(), "120", "Today starts from the literal 120-minute setting");

  await typeSequence(todayDuration, "1");
  await expectNoDraftField(page, OLD_DATE, "todayWeightDuration", "typing 1 must not commit a transient Today duration");
  await todayDuration.type("8");
  await expectNoDraftField(page, OLD_DATE, "todayWeightDuration", "typing 18 must not commit a transient Today duration");
  await todayDuration.type("1");
  expectEqual(await todayDuration.inputValue(), "181", "the browser field must contain the literal invalid 181 before blur");
  await expectNoDraftField(page, OLD_DATE, "todayWeightDuration", "typing 181 must not commit before change");
  await blurWithTab(todayDuration);
  expectEqual(await page.locator("#todayQuickWeightDuration").inputValue(), "120", "invalid Today 181 must revert to 120");
  await expectNoDraftField(page, OLD_DATE, "todayWeightDuration", "invalid Today 181 must not reach raw storage");

  await typeSequence(page.locator("#todayQuickWeightDuration"), "18.4");
  await blurWithTab(page.locator("#todayQuickWeightDuration"));
  let drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.todayWeightDuration, 18, "Today 18.4 minutes must canonicalize to the visible 18 minutes");
  expectEqual(await page.locator("#todayQuickWeightDuration").inputValue(), "18", "Today duration DOM must match canonical storage");

  await typeSequence(page.locator("#todayQuickCardioSpeed"), "5.04");
  await blurWithTab(page.locator("#todayQuickCardioSpeed"));
  await typeSequence(page.locator("#todayQuickCardioIncline"), "8.04");
  await blurWithTab(page.locator("#todayQuickCardioIncline"));
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.todayCardioSpeed, 5, "Today speed must canonicalize to one visible decimal");
  expectEqual(drafts?.[OLD_DATE]?.todayCardioIncline, 8, "Today incline must canonicalize to one visible decimal");
  expectEqual(await page.locator("#todayQuickCardioSpeed").inputValue(), "5.0", "Today speed DOM must match canonical storage");
  expectEqual(await page.locator("#todayQuickCardioIncline").inputValue(), "8.0", "Today incline DOM must match canonical storage");

  await typeSequence(page.locator("#todayQuickWeightDuration"), "0");
  await blurWithTab(page.locator("#todayQuickWeightDuration"));
  await typeSequence(page.locator("#todayQuickSleepHours"), "15.96");
  await blurWithTab(page.locator("#todayQuickSleepHours"));
  await typeSequence(page.locator("#todayQuickWorkHours"), "8.049");
  await blurWithTab(page.locator("#todayQuickWorkHours"));
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.todaySleepHours, 16, "Today sleep must store the visible 16.0 hours");
  expectEqual(drafts?.[OLD_DATE]?.todayWorkHours, 8, "Today work must store the visible 8.0 hours");
  expectEqual(await page.locator("#todayQuickSleepHours").inputValue(), "16.0", "Today sleep DOM must match raw storage");
  expectEqual(await page.locator("#todayQuickWorkHours").inputValue(), "8.0", "Today work DOM must match raw storage");
  expectTrue(await page.evaluate(() => calculate().isCalculable === true), "the visible 24-hour Today inputs must remain calculable");
  expectTrue(!(await page.locator("#todayQuickTimeSummary").getAttribute("class") || "").includes("is-warning"), "the visible 24-hour Today summary must not contradict calculation state");

  await typeSequence(page.locator("#todayQuickWorkHours"), "8.06");
  await blurWithTab(page.locator("#todayQuickWorkHours"));
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.todayWorkHours, 8.1, "Today 8.06 work hours must canonicalize to the visible 8.1");
  expectTrue(await page.evaluate(() => calculate().isCalculable === false), "the visible 24.1-hour Today inputs must block calculation");
  expectTrue((await page.locator("#todayQuickTimeSummary").getAttribute("class") || "").includes("is-warning"), "the visible overflow summary and calculation must use the same predicate");
  await typeSequence(page.locator("#todayQuickWorkHours"), "8.049");
  await blurWithTab(page.locator("#todayQuickWorkHours"));

  await typeSequence(page.locator("#todayQuickWeightDuration"), "180");
  await blurWithTab(page.locator("#todayQuickWeightDuration"));
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.todayWeightDuration, 180, "valid Today maximum must be stored as 180");

  const bodyFatMass = page.locator("#todayQuickBodyFatMass");
  await typeSequence(bodyFatMass, "13");
  await blurWithTab(bodyFatMass);
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.bodyFatMass, 13, "Today fat-mass edit must store the literal owned value");
  expectTrue(!Object.prototype.hasOwnProperty.call(drafts?.[OLD_DATE] || {}, "bodyFatPercent"), "Today fat-mass edit must not store a second contradictory percent authority");
  expectEqual(await page.locator("#todayQuickBodyFat").inputValue(), "17.33", "Today live UI must derive percent from 13kg at 75kg");

  const skeletal = page.locator("#todayQuickSkeletal");
  await typeSequence(skeletal, "0");
  await blurWithTab(skeletal);
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectTrue(!Object.prototype.hasOwnProperty.call(drafts?.[OLD_DATE] || {}, "skeletalMuscle"), "Today skeletal zero must not be committed as a measurement");
  expectEqual(await page.locator("#todayQuickSkeletal").inputValue(), "35.00", "invalid Today skeletal zero must restore the committed value");

  await typeSequence(bodyFatMass, "");
  await blurWithTab(bodyFatMass);
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectTrue(!Object.prototype.hasOwnProperty.call(drafts?.[OLD_DATE] || {}, "bodyFatMass") && !Object.prototype.hasOwnProperty.call(drafts?.[OLD_DATE] || {}, "bodyFatPercent"), "clearing Today fat mass must clear both representations");
  expectTrue(!Object.prototype.hasOwnProperty.call(drafts?.[OLD_DATE] || {}, "bodyStatusSource"), "clearing the last body override must clear its source metadata");

  await typeSequence(bodyFatMass, "13");
  await blurWithTab(bodyFatMass);
  const combinedSave = await page.evaluate(() => saveTodayInputWithInbody());
  expectTrue(combinedSave?.savedRecord === true && combinedSave?.savedInbody === true, "Today-to-InBody producer must save the canonical body pair");
  let inbodyRecords = await jsonStorage(page, "inbodyRecords", []);
  expectEqual(inbodyRecords.length, 1, "Today-to-InBody save must create one current record");
  expectEqual(inbodyRecords[0].bodyFat, 13, "Today-to-InBody save must keep the owned 13kg fat mass");
  expectTrue(Math.abs(inbodyRecords[0].bodyFatPercent - (13 / 75 * 100)) < 1e-6, "Today-to-InBody save must use the same derived percent as the live calculation");

  const todayWeight = page.locator("#todayQuickWeight");
  await typeSequence(todayWeight, "201");
  await expectNoDraftField(page, OLD_DATE, "calculationWeight", "Today weight 201 must not commit before blur");
  await blurWithTab(todayWeight);
  expectEqual(await page.locator("#todayQuickWeight").inputValue(), "75.00", "Today weight 201 must revert to 75");
  await expectNoDraftField(page, OLD_DATE, "calculationWeight", "Today weight 201 must not reach raw storage");
  await typeSequence(page.locator("#todayQuickWeight"), "200");
  await blurWithTab(page.locator("#todayQuickWeight"));
  drafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(drafts?.[OLD_DATE]?.calculationWeight, 200, "valid Today weight maximum must be stored as 200");

  await page.locator("#tabSettings").click();
  await openSettingsDisclosure(page, ".settings-training-group");
  const settingsDuration = page.locator("#weightDuration");
  await expectVisible(settingsDuration, "Settings duration must be user-visible");
  expectEqual(await settingsDuration.inputValue(), "120", "Settings starts from the literal 120-minute value");
  await typeSequence(settingsDuration, "1", ["8", "1"]);
  expectEqual(await rawStorage(page, "weightDuration"), "120", "Settings must keep 120 during the 181 key sequence");
  await blurWithTab(settingsDuration);
  expectEqual(await page.locator("#weightDuration").inputValue(), "120", "invalid Settings 181 must revert to 120");
  expectEqual(await rawStorage(page, "weightDuration"), "120", "invalid Settings 181 must not reach raw storage");
  await typeSequence(page.locator("#weightDuration"), "180");
  await blurWithTab(page.locator("#weightDuration"));
  expectEqual(await rawStorage(page, "weightDuration"), "180", "valid Settings maximum must be stored as 180");

  await openSettingsDisclosure(page, ".settings-lifestyle-group");
  await typeSequence(page.locator("#sleepHours"), "8.04");
  await blurWithTab(page.locator("#sleepHours"));
  expectEqual(await rawStorage(page, "sleepHours"), "8", "Settings over-precision must canonicalize in raw storage");
  expectEqual(await page.locator("#sleepHours").inputValue(), "8.0", "Settings hour DOM must match canonical storage");

  await openSettingsDisclosure(page, ".settings-profile-group");
  const settingsWeight = page.locator("#weight");
  await typeSequence(settingsWeight, "201");
  expectEqual(await rawStorage(page, "weight"), "75", "Settings weight must keep 75 while 201 is being typed");
  await blurWithTab(settingsWeight);
  expectEqual(await page.locator("#weight").inputValue(), "75", "invalid Settings weight 201 must revert to 75");
  expectEqual(await rawStorage(page, "weight"), "75", "invalid Settings weight 201 must not reach raw storage");
  await typeSequence(page.locator("#weight"), "200");
  await blurWithTab(page.locator("#weight"));
  expectEqual(await rawStorage(page, "weight"), "200", "valid Settings weight maximum must be stored as 200");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  expectEqual(await page.locator("#weightDuration").inputValue(), "180", "Settings duration must survive reload");
  expectEqual(await page.locator("#sleepHours").inputValue(), "8.0", "Settings canonical hour must survive reload");
  expectEqual(await page.locator("#weight").inputValue(), "200", "Settings weight must survive reload");
  await page.locator("#tabToday").click();
  await page.locator("#todayQuickEditToggle").click();
  expectEqual(await page.locator("#todayQuickWeightDuration").inputValue(), "180", "Today duration must survive reload");
  expectEqual(await page.locator("#todayQuickWeight").inputValue(), "200.00", "Today weight must survive reload");
}

async function scenarioOnboarding({ page, baseUrl }){
  await loadApp(page, baseUrl);
  expectTrue(!(await page.locator("#onboardingOverlay").getAttribute("class")).includes("hidden"), "fresh onboarding must be open");
  await page.locator("#onboardingStartBtn").click();
  await page.locator("#onboardingGender").selectOption("male");
  await page.locator("#onboardingAge").fill("32");
  await page.locator("#onboardingHeight").fill("173");
  await page.locator("#onboardingWeight").fill("75");
  await page.locator("#onboardingGoal").selectOption("maintain");
  await page.locator("#onboardingNextBtn").click();
  expectTrue(await page.locator('.onboarding-step[data-onboarding-step="2"]').isVisible(), "onboarding must advance to the time step");

  await page.locator("#onboardingActivityLevel").selectOption("moderate");
  await page.locator("#onboardingWorkType").selectOption("office");
  await page.locator("#onboardingSleepHours").fill("16");
  await page.locator("#onboardingWorkHours").fill("8.5");
  await page.locator("#onboardingLifestyleHours").fill("0");
  await page.locator("#onboardingNextBtn").click();
  expectTrue(await page.locator('.onboarding-step[data-onboarding-step="2"]').isVisible(), "fixed time above 24 hours must remain on onboarding step 2");
  expectEqual(await rawStorage(page, "onboardingCompletedVersion"), null, "invalid onboarding must not mark completion");
  expectTrue((await page.locator("#onboardingFeedback").innerText()).includes("24"), "invalid onboarding must explain the 24-hour conflict");

  await typeSequence(page.locator("#onboardingSleepHours"), "15.96");
  await blurWithTab(page.locator("#onboardingSleepHours"));
  await typeSequence(page.locator("#onboardingWorkHours"), "8.049");
  await blurWithTab(page.locator("#onboardingWorkHours"));
  expectEqual(await page.locator("#onboardingSleepHours").inputValue(), "16.0", "onboarding sleep must canonicalize to its visible value");
  expectEqual(await page.locator("#onboardingWorkHours").inputValue(), "8.0", "onboarding work must canonicalize to its visible value");
  await page.locator("#onboardingNextBtn").click();
  expectTrue(await page.locator('.onboarding-step[data-onboarding-step="3"]').isVisible(), "the exact 24-hour boundary must advance");
  await page.locator('input[name="onboardingExerciseMode"][value="general"]').check();
  await page.locator("#onboardingNextBtn").click();
  await page.waitForFunction(() => document.getElementById("onboardingOverlay").classList.contains("hidden"));
  expectEqual(await rawStorage(page, "onboardingCompletedVersion"), "1", "valid onboarding must mark completion");
  expectEqual(await rawStorage(page, "sleepHours"), "16", "onboarding must persist the literal sleep boundary");
  expectEqual(await rawStorage(page, "workHours"), "8", "onboarding must persist the literal work boundary");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  expectTrue((await page.locator("#onboardingOverlay").getAttribute("class")).includes("hidden"), "completed onboarding must stay closed after reload");
  expectEqual(await page.locator("#sleepHours").inputValue(), "16.0", "onboarding sleep boundary must restore after reload");
  expectEqual(await page.locator("#workHours").inputValue(), "8.0", "onboarding work boundary must restore after reload");

  await page.evaluate(prefix => {
    localStorage.removeItem(`${prefix}bodyFat`);
    localStorage.setItem(`${prefix}bodyFatMass`, "40");
    localStorage.setItem(`${prefix}skeletal`, "35");
    localStorage.setItem(`${prefix}bodyCompositionConfirmed`, "true");
    localStorage.setItem(`${prefix}weight`, "75");
  }, STORAGE_PREFIX);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  await page.locator("#tabSettings").click();
  await page.locator("#restartOnboardingBtn").click();
  expectTrue(await page.locator('.onboarding-step[data-onboarding-step="1"]').isVisible(), "Settings re-entry must open at profile step 1");
  await page.locator("#onboardingWeight").fill("50");
  await page.locator("#onboardingNextBtn").click();
  await page.locator("#onboardingNextBtn").click();
  await page.locator('input[name="onboardingExerciseMode"][value="general"]').check();
  await page.locator("#onboardingNextBtn").click();
  await page.waitForFunction(() => document.getElementById("onboardingOverlay").classList.contains("hidden"));
  expectEqual(await rawStorage(page, "weight"), "50", "re-entry must persist the new profile weight");
  expectEqual(await rawStorage(page, "bodyFat"), null, "re-entry must not preserve a body-fat percent that conflicts with the new weight");
  expectEqual(await rawStorage(page, "bodyFatMass"), null, "re-entry must clear a retained fat mass that conflicts with the new weight");
  expectEqual(await rawStorage(page, "skeletal"), null, "re-entry must clear retained skeletal evidence that conflicts with the new weight");
  expectEqual(await rawStorage(page, "bodyCompositionConfirmed"), "false", "re-entry must revoke stale body-composition confirmation after clearing incompatible values");
  expectTrue(await page.evaluate(() => calculate().isCalculable === true), "re-entry must leave the profile calculable after clearing incompatible hidden values");
}

async function scenarioWeekdayDefaults({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await page.locator("#tabSettings").click();
  await openSettingsDisclosure(page, ".settings-lifestyle-group");
  const toggle = page.locator('[data-weekday-time-toggle][data-weekday="mon"]');
  await expectVisible(toggle, "weekday override toggle must be user-visible");
  await toggle.check();
  const input = page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]');
  expectEqual(await input.inputValue(), "8.0", "Monday starts from the formatted literal base sleep value");

  await typeSequence(input, "16.5");
  let defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.sleepHours, 8, "weekday 16.5 must not commit during typing");
  await blurWithTab(input);
  expectEqual(await page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]').inputValue(), "8.0", "weekday 16.5 must revert to 8");
  defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.sleepHours, 8, "weekday 16.5 must not reach raw storage");

  const validInput = page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]');
  await typeSequence(validInput, "9.5");
  defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.sleepHours, 8, "weekday 9.5 must wait for blur before commit");
  await blurWithTab(validInput);
  defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.enabled, true, "Monday override must remain enabled");
  expectEqual(defaults?.mon?.sleepHours, 9.5, "weekday 9.5 must commit exactly on blur");

  await typeSequence(page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]'), "8.04");
  defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.sleepHours, 9.5, "weekday over-precision must remain a buffer before blur");
  await blurWithTab(page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]'));
  defaults = await jsonStorage(page, "weekdayTimeDefaults", {});
  expectEqual(defaults?.mon?.sleepHours, 8, "weekday over-precision must canonicalize in raw storage");
  expectEqual(await page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]').inputValue(), "8.0", "weekday DOM must match canonical storage");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  expectTrue(await page.locator('[data-weekday-time-toggle][data-weekday="mon"]').isChecked(), "Monday override must stay enabled after reload");
  expectEqual(await page.locator('[data-weekday-time-field="sleepHours"][data-weekday="mon"]').inputValue(), "8.0", "weekday canonical sleep value must survive reload");
}

async function scenarioRecordsDetail({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await page.locator("#tabRecords").click();
  await page.locator('[data-record-card-date="2026-08-09"]').click();
  await page.locator('[data-record-detail-date="2026-08-09"] [data-edit-record-date]').click();
  const rootLocator = page.locator('[data-record-detail-date="2026-08-09"][data-record-detail-edit="true"]');
  expectTrue(await rootLocator.isVisible(), "Records detail edit must open");
  const basis = rootLocator.locator('[data-record-detail-section="basis"]');
  if (!(await basis.getAttribute("open"))) await basis.locator("summary").click();
  const beforeRaw = await rawStorage(page, "records");

  const topWeight = rootLocator.locator('[data-detail-field="weight"]');
  await typeSequence(topWeight, "200.01");
  await rootLocator.locator("[data-detail-save]").click();
  expectTrue(await rootLocator.isVisible(), "Records top weight 200.01 must keep edit mode open");
  expectEqual(await rawStorage(page, "records"), beforeRaw, "Records top weight 200.01 must leave raw record bytes unchanged");

  await typeSequence(topWeight, "600");
  await rootLocator.locator("[data-detail-save]").click();
  expectTrue(await rootLocator.isVisible(), "Records top weight 600 must keep edit mode open");
  expectEqual(await rawStorage(page, "records"), beforeRaw, "Records top weight 600 must leave raw record bytes unchanged");

  const duration = rootLocator.locator('[data-detail-basis-field="weightDuration"]');
  await typeSequence(duration, "181");
  expectEqual(await rawStorage(page, "records"), beforeRaw, "Records must not write 181 during input");
  await rootLocator.locator("[data-detail-save]").click();
  expectTrue(await rootLocator.isVisible(), "invalid Records save must keep edit mode open");
  expectEqual(await rawStorage(page, "records"), beforeRaw, "invalid Records save must leave raw record bytes unchanged");

  await typeSequence(rootLocator.locator('[data-detail-basis-field="weightDuration"]'), "18.4");
  await blurWithTab(rootLocator.locator('[data-detail-basis-field="weightDuration"]'));
  expectEqual(await rootLocator.locator('[data-detail-basis-field="weightDuration"]').inputValue(), "18", "dirty Records duration must canonicalize to the visible whole minute");
  expectEqual(await rawStorage(page, "records"), beforeRaw, "Records canonical edit buffer must not write before save");

  await typeSequence(rootLocator.locator('[data-detail-field="weight"]'), "200");
  const validDuration = rootLocator.locator('[data-detail-basis-field="weightDuration"]');
  await typeSequence(validDuration, "180");
  await blurWithTab(validDuration);

  expectEqual(await rawStorage(page, "weeklyTrainingDaysManual"), "false", "Records basis edit fixture must remain in global weekly auto mode");
  const preview = rootLocator.locator("[data-detail-basis-preview]");
  const previewBeforeWeeklyChange = await preview.innerText();
  const weeklyDays = rootLocator.locator('[data-detail-basis-field="weeklyTrainingDays"]');
  await typeSequence(weeklyDays, "7");
  await blurWithTab(weeklyDays);
  expectEqual(await weeklyDays.inputValue(), "7", "Records basis weekly days change must keep the literal 7 in the form");
  const previewAfterWeeklyChange = await preview.innerText();
  expectTrue(previewAfterWeeklyChange !== previewBeforeWeeklyChange, "Records weekly days change must refresh the visible target preview");
  expectTrue(previewAfterWeeklyChange.includes("목표 칼로리"), "Records weekly days preview must remain calculable", previewAfterWeeklyChange);

  const bodyFatMass = rootLocator.locator('[data-detail-basis-field="bodyFatMass"]');
  const bodyFatPercent = rootLocator.locator('[data-detail-basis-field="bodyFat"]');
  await typeSequence(bodyFatMass, "15");
  await blurWithTab(bodyFatMass);
  expectEqual(await bodyFatMass.inputValue(), "15", "Records body-fat mass change must keep the literal mass before save");
  expectEqual(await bodyFatPercent.inputValue(), "20.00", "Records body-fat mass change must synchronize percent from 15 / 75");

  await rootLocator.locator("[data-detail-save]").click();
  await page.waitForFunction(() => !document.querySelector('[data-record-detail-edit="true"]'));
  let records = await jsonStorage(page, "records", []);
  let savedRecord = records.find(record => record.date === "2026-08-09");
  expectEqual(savedRecord?.weight, 200, "Records must save the valid top fasting-weight maximum exactly");
  expectEqual(savedRecord?.goalSnapshot?.weightDuration, 180, "Records must save the valid duration maximum exactly");
  expectEqual(savedRecord?.goalSnapshot?.weeklyTrainingDays, 7, "Records must save the record-time weekly basis independently of global auto mode");
  expectEqual(savedRecord?.goalSnapshot?.bodyFatMass, 15, "Records must save the synchronized body-fat mass");
  expectEqual(savedRecord?.goalSnapshot?.bodyFat, 20, "Records must save the synchronized body-fat percent");
  expectEqual(savedRecord?.goalSnapshot?.bodyStatusSource, "latest_inbody", "Records basis edit must preserve the stored InBody authority");
  expectEqual(savedRecord?.goalSnapshot?.bodyCompositionConfirmed, false, "Records basis edit must preserve the stored body confirmation state");
  expectEqual(await rawStorage(page, "weeklyTrainingDaysManual"), "false", "Records save must not promote global weekly auto mode to manual");
  let savedRaw = await rawStorage(page, "records");

  await page.locator('[data-record-detail-date="2026-08-09"] [data-edit-record-date]').click();
  let reopenedRoot = page.locator('[data-record-detail-date="2026-08-09"][data-record-detail-edit="true"]');
  expectEqual(await reopenedRoot.locator('[data-detail-field="weight"]').inputValue(), "200.00", "Records top weight 200 must survive immediate reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="weeklyTrainingDays"]').inputValue(), "7", "Records weekly basis 7 must survive immediate reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFatMass"]').inputValue(), "15.00", "Records body-fat mass must survive immediate reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFat"]').inputValue(), "20.00", "Records synchronized body-fat percent must survive immediate reopen");

  const snapshotBeforeNoteOnlyEdit = JSON.stringify(savedRecord.goalSnapshot);
  await typeSequence(reopenedRoot.locator('[data-detail-field="note"]'), "A1 note-only edit");
  await reopenedRoot.locator("[data-detail-save]").click();
  await page.waitForFunction(() => !document.querySelector('[data-record-detail-edit="true"]'));
  records = await jsonStorage(page, "records", []);
  savedRecord = records.find(record => record.date === "2026-08-09");
  expectEqual(savedRecord?.note, "A1 note-only edit", "Records note-only edit must save the note");
  expectEqual(JSON.stringify(savedRecord?.goalSnapshot), snapshotBeforeNoteOnlyEdit, "Records note-only edit must preserve the goal snapshot byte-for-byte");
  savedRaw = await rawStorage(page, "records");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  expectEqual(await rawStorage(page, "records"), savedRaw, "Records saved bytes must survive reload exactly");
  records = await jsonStorage(page, "records", []);
  savedRecord = records.find(record => record.date === "2026-08-09");
  expectEqual(savedRecord?.weight, 200, "Records top weight maximum must survive reload");
  expectEqual(savedRecord?.goalSnapshot?.weightDuration, 180, "Records duration maximum must survive reload");
  expectEqual(savedRecord?.goalSnapshot?.weeklyTrainingDays, 7, "Records weekly basis must survive reload");
  expectEqual(savedRecord?.goalSnapshot?.bodyFatMass, 15, "Records body-fat mass must survive reload");
  expectEqual(savedRecord?.goalSnapshot?.bodyFat, 20, "Records synchronized body-fat percent must survive reload");

  await page.locator("#tabRecords").click();
  await page.locator('[data-record-card-date="2026-08-09"]').click();
  await page.locator('[data-record-detail-date="2026-08-09"] [data-edit-record-date]').click();
  reopenedRoot = page.locator('[data-record-detail-date="2026-08-09"][data-record-detail-edit="true"]');
  expectEqual(await reopenedRoot.locator('[data-detail-field="weight"]').inputValue(), "200.00", "Records top weight 200 must render after reload and reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="weeklyTrainingDays"]').inputValue(), "7", "Records weekly basis 7 must render after reload and reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFatMass"]').inputValue(), "15.00", "Records body-fat mass must render after reload and reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFat"]').inputValue(), "20.00", "Records body-fat percent must render after reload and reopen");

  const reopenedBasis = reopenedRoot.locator('[data-record-detail-section="basis"]');
  if (!(await reopenedBasis.getAttribute("open"))) await reopenedBasis.locator("summary").click();
  const reopenedBodyFat = reopenedRoot.locator('[data-detail-basis-field="bodyFat"]');
  await typeSequence(reopenedBodyFat, "");
  await blurWithTab(reopenedBodyFat);
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFatMass"]').inputValue(), "", "clearing Records body-fat percent must clear the paired mass visibly");
  await reopenedRoot.locator("[data-detail-save]").click();
  await page.waitForFunction(() => !document.querySelector('[data-record-detail-edit="true"]'));
  records = await jsonStorage(page, "records", []);
  savedRecord = records.find(record => record.date === "2026-08-09");
  expectEqual(savedRecord?.goalSnapshot?.bodyFat, null, "Records body-fat percent must persist as explicit null");
  expectEqual(savedRecord?.goalSnapshot?.bodyFatMass, null, "Records body-fat mass must persist as explicit null");

  await page.locator('[data-record-detail-date="2026-08-09"] [data-edit-record-date]').click();
  reopenedRoot = page.locator('[data-record-detail-date="2026-08-09"][data-record-detail-edit="true"]');
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFat"]').inputValue(), "", "cleared Records percent must remain blank on immediate reopen");
  expectEqual(await reopenedRoot.locator('[data-detail-basis-field="bodyFatMass"]').inputValue(), "", "cleared Records mass must remain blank on immediate reopen");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  records = await jsonStorage(page, "records", []);
  savedRecord = records.find(record => record.date === "2026-08-09");
  expectEqual(savedRecord?.goalSnapshot?.bodyFat, null, "cleared Records percent must survive reload as null");
  expectEqual(savedRecord?.goalSnapshot?.bodyFatMass, null, "cleared Records mass must survive reload as null");
}

async function scenarioDateWakeSignals({ page, baseUrl }){
  const probes = [
    ["focus", async currentPage => currentPage.evaluate(() => window.dispatchEvent(new Event("focus")))],
    ["pageshow", async currentPage => currentPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")))],
    ["visibilitychange", async currentPage => currentPage.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))]
  ];
  for (const [name, dispatch] of probes) {
    await setFakeNow(page, OLD_NOON).catch(() => {});
    if (page.url() === "about:blank") await loadApp(page, baseUrl);
    else {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    }
    expectEqual(await page.locator("#recordsWorkspaceDate").inputValue(), OLD_DATE, `${name} probe must start on the old date`);
    await setFakeNow(page, NEW_NOON);
    await dispatch(page);
    await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, NEW_DATE, { timeout: 5000 });
    expectEqual(await page.locator("#inbodyDate").getAttribute("max"), NEW_DATE, `${name} must advance InBody max date`);
  }

  await setFakeNow(page, "2026-08-10T23:59:59.500+09:00");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  expectEqual(await page.locator("#recordsWorkspaceDate").inputValue(), OLD_DATE, "timer probe must start before midnight");
  await setFakeNow(page, "2026-08-11T00:00:00.100+09:00");
  await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, NEW_DATE, { timeout: 4000 });
  expectEqual(await page.locator("#inbodyDate").getAttribute("max"), NEW_DATE, "midnight timer must advance InBody max date");

  await page.evaluate(({ fakeNowKey, prefix }) => {
    localStorage.setItem(fakeNowKey, "2026-08-10T12:00:00+09:00");
    localStorage.setItem(`${prefix}records`, "[]");
    localStorage.setItem(`${prefix}inbodyRecords`, "[]");
    localStorage.removeItem(`${prefix}todayCalculationDrafts.v1`);
    localStorage.setItem(`${prefix}activeTab`, "today");
  }, { fakeNowKey: FAKE_NOW_KEY, prefix: STORAGE_PREFIX });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  await page.locator("#tabRecords").click();
  await page.locator("[data-open-record-edit-panel]").click();
  await page.locator("#recordInfoEditWeight").fill("80");
  await page.locator("#recordInfoEditSaveBtn").click();
  expectTrue(await page.locator("#recordWeightTodayApplyOverlay").isVisible(), "same-day Records weight save must create a pending Today apply choice");
  const recordsPendingDraftRaw = await rawStorage(page, "todayCalculationDrafts.v1");
  await setFakeNow(page, NEW_NOON);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, NEW_DATE, { timeout: 5000 });
  expectTrue(!(await page.locator("#recordWeightTodayApplyOverlay").isVisible()), "rollover must close the stale Records-to-Today apply choice");
  expectEqual(await rawStorage(page, "todayCalculationDrafts.v1"), recordsPendingDraftRaw, "aborting the stale Records choice must not create a Today draft");

  await page.evaluate(({ fakeNowKey, prefix }) => {
    localStorage.setItem(fakeNowKey, "2026-08-10T12:00:00+09:00");
    localStorage.setItem(`${prefix}records`, "[]");
    localStorage.setItem(`${prefix}inbodyRecords`, "[]");
    localStorage.setItem(`${prefix}todayCalculationDrafts.v1`, JSON.stringify({
      "2026-08-10": {
        calculationWeight: 74,
        skeletalMuscle: 34,
        bodyFatMass: 11.84,
        bodyFatPercent: 16,
        bodyStatusSource: "user",
        bodyStatusOwnerDate: "2026-08-10"
      }
    }));
    localStorage.setItem(`${prefix}activeTab`, "today");
  }, { fakeNowKey: FAKE_NOW_KEY, prefix: STORAGE_PREFIX });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  await page.locator("#tabInbody").click();
  await page.locator("#inbodyDate").fill(OLD_DATE);
  await page.locator("#inbodyWeight").fill("75");
  await page.locator("#inbodySkeletalMuscle").fill("35");
  await page.locator("#inbodyBodyFat").fill("11.25");
  await page.locator("#inbodyBodyFatPercent").fill("15");
  await page.locator("#saveInbodyBtn").click();
  expectTrue(await page.locator("#inbodyTodayApplyChoice").isVisible(), "same-day differing InBody save must create a pending Today apply choice");
  const inbodyPendingDraftRaw = await rawStorage(page, "todayCalculationDrafts.v1");
  await setFakeNow(page, NEW_NOON);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(expected => document.getElementById("inbodyDate")?.max === expected, NEW_DATE, { timeout: 5000 });
  const inbodyDraftsAfterRollover = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(inbodyDraftsAfterRollover?.[OLD_DATE]?.calculationWeight, 74, "rollover must preserve the old-date Today weight while aborting the pending InBody choice");
  const inbodyRolloverDraftRaw = await rawStorage(page, "todayCalculationDrafts.v1");
  const staleInbodyApply = page.locator('[data-inbody-today-apply="apply"]');
  if (await staleInbodyApply.isVisible()) await staleInbodyApply.click();
  expectEqual(await rawStorage(page, "todayCalculationDrafts.v1"), inbodyRolloverDraftRaw, "a stale InBody apply action after rollover must not mutate either date");
  expectTrue(inbodyPendingDraftRaw !== null, "the pending InBody probe must start from a literal Today draft");

  await page.evaluate(({ fakeNowKey, prefix }) => {
    localStorage.setItem(fakeNowKey, "2026-08-10T12:00:00+09:00");
    localStorage.setItem(`${prefix}inbodyRecords`, JSON.stringify([
      { date: "2026-08-10", weight: 75, skeletalMuscle: 35, bodyFat: 11.25, bodyFatPercent: 15, warning: "", isSuspicious: false }
    ]));
    localStorage.setItem(`${prefix}todayCalculationDrafts.v1`, JSON.stringify({
      "2026-08-10": { calculationWeight: 74, skeletalMuscle: 34, bodyFatMass: 11.84, bodyFatPercent: 16, bodyStatusSource: "user" }
    }));
    localStorage.setItem(`${prefix}activeTab`, "inbody");
  }, { fakeNowKey: FAKE_NOW_KEY, prefix: STORAGE_PREFIX });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  await page.locator("#inbodyDate").fill(OLD_DATE);
  await page.locator("#inbodyWeight").fill("76");
  await page.locator("#inbodySkeletalMuscle").fill("35");
  await page.locator("#inbodyBodyFat").fill("12.16");
  await page.locator("#inbodyBodyFatPercent").fill("16");
  await page.evaluate(({ fakeNowKey, nextNow }) => {
    window.confirm = () => {
      localStorage.setItem(fakeNowKey, nextNow);
      return true;
    };
  }, { fakeNowKey: FAKE_NOW_KEY, nextNow: NEW_NOON });
  await page.locator("#saveInbodyBtn").click();
  await page.waitForFunction(expected => document.getElementById("inbodyDate")?.max === expected, NEW_DATE, { timeout: 5000 });
  const crossMidnightRecords = await jsonStorage(page, "inbodyRecords", []);
  expectEqual(crossMidnightRecords.length, 1, "cross-midnight replacement must keep one record for the captured old date");
  expectEqual(crossMidnightRecords[0].weight, 76, "cross-midnight replacement must save the confirmed old-date value");
  expectTrue(!(await page.locator("#inbodyTodayApplyChoice").isVisible()), "cross-midnight replacement must not revive an old-date Today apply prompt");
  const crossMidnightDrafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(crossMidnightDrafts?.[OLD_DATE]?.calculationWeight, 74, "cross-midnight replacement must preserve the captured old-date Today draft");
  expectEqual(crossMidnightDrafts?.[NEW_DATE]?.calculationWeight, 76, "the new date may materialize the newly latest valid InBody through the normal control path");
}

async function scenarioStaleTodayAndMealDialog({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await page.locator("#todayQuickEditToggle").click();
  const staleDuration = page.locator("#todayQuickWeightDuration");
  expectEqual(await staleDuration.inputValue(), "120", "stale Today probe starts from 120");
  await setFakeNow(page, NEW_NOON);
  await typeSequence(staleDuration, "33");
  await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, NEW_DATE, { timeout: 5000 });
  const staleDrafts = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectTrue(!Object.values(staleDrafts).some(draft => draft?.todayWeightDuration === 33), "a stale Today field must not write 33 to either date", formatValue(staleDrafts));

  await page.evaluate(({ fakeNowKey, prefix }) => {
    localStorage.setItem(fakeNowKey, "2026-08-10T12:00:00+09:00");
    localStorage.setItem(`${prefix}records`, "[]");
    localStorage.setItem(`${prefix}todayCalculationDrafts.v1`, JSON.stringify({
      "2026-08-10": { calculationWeight: 76.25 },
      "2026-08-11": { calculationWeight: 77.5 }
    }));
    localStorage.setItem(`${prefix}activeTab`, "today");
  }, { fakeNowKey: FAKE_NOW_KEY, prefix: STORAGE_PREFIX });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  const mealDraftRawBefore = await rawStorage(page, "todayCalculationDrafts.v1");
  const mealDraftsBefore = JSON.parse(mealDraftRawBefore);
  expectEqual(mealDraftsBefore?.[OLD_DATE]?.calculationWeight, 76.25, "old-date Today weight fixture must load literally");
  expectEqual(mealDraftsBefore?.[NEW_DATE]?.calculationWeight, 77.5, "new-date Today weight fixture must load literally");
  await page.locator("#todayRecordStartBtn").click();
  expectTrue(await page.locator("#todayRecordStartOverlay").isVisible(), "Today meal dialog must open");
  await page.locator("#todayRecordDetailedWeight").fill("79.75");
  const applyWeight = page.locator("#todayRecordDetailedApplyWeightToCalculation");
  expectTrue(await applyWeight.isEnabled(), "old-date Today meal dialog must expose the apply-to-Today checkbox before rollover");
  await applyWeight.check();
  expectTrue(await applyWeight.isChecked(), "old-date Today meal dialog must capture the apply-to-Today choice before rollover");
  await page.locator("#todayRecordMealCarbs").fill("50");
  await page.locator("#todayRecordMealProtein").fill("30");
  await page.locator("#todayRecordMealFat").fill("15");
  await setFakeNow(page, NEW_NOON);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, NEW_DATE, { timeout: 5000 });
  expectTrue((await page.locator("#todayRecordStartTitle").innerText()).includes(OLD_DATE), "an open old-date meal dialog must name its captured date");
  await page.locator("#todayRecordDetailedSaveBtn").click();
  await page.waitForFunction(() => (document.getElementById("todayRecordStartFeedback")?.textContent || "").includes("식사를 저장했습니다"));
  const records = await jsonStorage(page, "records", []);
  const oldRecord = records.find(record => record.date === OLD_DATE);
  expectEqual(oldRecord?.meals?.length, 1, "the captured old date must receive the meal");
  expectEqual(oldRecord?.weight, 79.75, "the captured old date must receive the modal fasting weight");
  expectTrue(!records.some(record => record.date === NEW_DATE), "rollover must not redirect the open meal dialog to the new date", formatValue(records));
  expectEqual(await rawStorage(page, "todayCalculationDrafts.v1"), mealDraftRawBefore, "rollover save must leave both Today draft objects byte-identical");
  const mealDraftsAfter = await jsonStorage(page, "todayCalculationDrafts.v1", {});
  expectEqual(mealDraftsAfter?.[OLD_DATE]?.calculationWeight, 76.25, "captured old-date meal weight must not overwrite the old Today calculation weight after rollover");
  expectEqual(mealDraftsAfter?.[NEW_DATE]?.calculationWeight, 77.5, "captured old-date meal weight must not overwrite the new Today calculation weight after rollover");
}

async function scenarioInbodyLifecycle({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await page.locator("#tabInbody").click();
  const fillForm = async ({ date = OLD_DATE, weight, muscle = "35", fat = "11.25", percent = "15" }) => {
    await page.locator("#inbodyDate").fill(date);
    await page.locator("#inbodyWeight").fill(String(weight));
    await page.locator("#inbodySkeletalMuscle").fill(String(muscle));
    await page.locator("#inbodyBodyFat").fill(String(fat));
    await page.locator("#inbodyBodyFatPercent").fill(String(percent));
  };

  await fillForm({ weight: "75", fat: "20", percent: "10" });
  await page.locator("#saveInbodyBtn").click();
  expectEqual((await jsonStorage(page, "inbodyRecords", [])).length, 0, "contradictory fat mass and percent must not create an InBody record");
  expectTrue((await page.locator("#inbodyFeedback").innerText()).includes("맞지"), "contradictory fat values must show an actionable explanation");

  await fillForm({ weight: "75", muscle: "65", fat: "15", percent: "20" });
  await page.locator("#saveInbodyBtn").click();
  expectEqual((await jsonStorage(page, "inbodyRecords", [])).length, 0, "skeletal mass above lean mass must not create an InBody record");
  expectTrue((await page.locator("#inbodyFeedback").innerText()).includes("골격근"), "impossible skeletal composition must show an actionable explanation");

  await fillForm({ weight: "75" });
  await page.locator("#saveInbodyBtn").click();
  let records = await jsonStorage(page, "inbodyRecords", []);
  expectEqual(records.length, 1, "first InBody save must create one record");
  expectJsonEqual(
    [records[0].date, records[0].weight, records[0].skeletalMuscle, records[0].bodyFat, records[0].bodyFatPercent],
    [OLD_DATE, 75, 35, 11.25, 15],
    "first InBody save must preserve literal values"
  );
  const firstRaw = await rawStorage(page, "inbodyRecords");

  await page.locator("#saveInbodyBtn").click();
  expectEqual(await rawStorage(page, "inbodyRecords"), firstRaw, "an exact same-date duplicate must be a raw no-op");
  expectTrue((await page.locator("#inbodyFeedback").innerText()).includes("같은 값"), "exact duplicate feedback must say the value is already the same");

  await fillForm({ weight: "75.1" });
  const cancelMessage = await clickAndHandleDialog(page.locator("#saveInbodyBtn"), page, "dismiss");
  expectTrue(cancelMessage.includes("이미"), "same-date replacement must ask about the existing record", cancelMessage);
  expectEqual(await rawStorage(page, "inbodyRecords"), firstRaw, "dismissed replacement must leave raw InBody bytes unchanged");

  const replaceMessage = await clickAndHandleDialog(page.locator("#saveInbodyBtn"), page, "accept");
  expectTrue(replaceMessage.includes("바꿀까요"), "accepted replacement must use the explicit replacement confirmation", replaceMessage);
  records = await jsonStorage(page, "inbodyRecords", []);
  expectEqual(records.length, 1, "accepted replacement must keep one record for the date");
  expectEqual(records[0].weight, 75.1, "accepted replacement must store the new exact weight");
  const replacedRaw = await rawStorage(page, "inbodyRecords");

  await fillForm({ date: NEW_DATE, weight: "76" });
  await page.locator("#saveInbodyBtn").click();
  expectEqual(await rawStorage(page, "inbodyRecords"), replacedRaw, "future InBody save must leave raw storage unchanged");
  expectTrue((await page.locator("#inbodyFeedback").innerText()).includes("미래 날짜"), "future InBody save must explain why it was rejected");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
  records = await jsonStorage(page, "inbodyRecords", []);
  expectEqual(records.length, 1, "InBody replacement must survive reload without duplicates");
  expectEqual(records[0].date, OLD_DATE, "reload must retain only the non-future date");
  expectEqual(records[0].weight, 75.1, "reload must retain the accepted replacement value");
  expectEqual(await page.locator("#inbodyLatestDateInline").innerText(), OLD_DATE, "InBody latest UI must restore the accepted date");
}

const scenarios = [
  {
    name: "A1-E2E-01 Today and Settings key sequence, bounds, raw persistence, reload",
    seed: storage(),
    run: scenarioTodayAndSettings
  },
  {
    name: "A1-E2E-02 onboarding fixed-time rejection and exact boundary reload",
    seed: {},
    run: scenarioOnboarding
  },
  {
    name: "A1-E2E-03 weekday override input, blur ownership, reload",
    seed: storage(),
    run: scenarioWeekdayDefaults
  },
  {
    name: "A1-E2E-04 Records detail invalid atomicity and valid maximum reload",
    seed: storage({
      [`${STORAGE_PREFIX}weeklyTrainingDaysManual`]: "false",
      [`${STORAGE_PREFIX}records`]: JSON.stringify([{
        date: "2026-08-09",
        recordMode: "detailed",
        weight: 75,
        note: "A1 external Records fixture",
        goalSnapshot: literalGoalSnapshot({
          weightDuration: 60,
          bodyStatusSource: "latest_inbody",
          bodyCompositionConfirmed: false
        }),
        snapshotSource: "saved_at_entry",
        meals: [{
          id: "a1-e2e-record-meal",
          mealLabel: "점심",
          carbs: 80,
          protein: 40,
          fat: 20,
          alcoholKcal: 0,
          otherKcal: 0,
          memo: "",
          createdAt: "2026-08-09T12:00:00.000Z"
        }]
      }])
    }),
    run: scenarioRecordsDetail
  },
  {
    name: "A1-E2E-05 focus, pageshow, visibility and midnight timer date wake",
    seed: storage(),
    run: scenarioDateWakeSignals
  },
  {
    name: "A1-E2E-06 stale Today mutation rejection and captured meal date",
    seed: storage(),
    run: scenarioStaleTodayAndMealDialog
  },
  {
    name: "A1-E2E-07 InBody new, same, cancel, replace, future and reload lifecycle",
    seed: storage(),
    run: scenarioInbodyLifecycle
  }
];

async function run(){
  const server = makeServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser = null;
  const results = [];
  try {
    browser = await launchBrowser();
    const scenarioFilter = String(process.argv.find(arg => arg.startsWith("--scenario=")) || "").slice("--scenario=".length);
    const selectedScenarios = scenarioFilter
      ? scenarios.filter(scenario => scenario.name.includes(scenarioFilter))
      : scenarios;
    if (!selectedScenarios.length) throw new Error(`no A1 E2E scenario matched: ${scenarioFilter}`);
    for (const scenario of selectedScenarios) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "ko-KR",
        timezoneId: "Asia/Seoul"
      });
      const consoleErrors = [];
      const pageErrors = [];
      context.on("page", currentPage => {
        currentPage.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        currentPage.on("pageerror", error => pageErrors.push(error.message || String(error)));
      });
      await installSeedAndClock(context, scenario.seed, scenario.fakeNow || OLD_NOON);
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      const startedAt = Date.now();
      try {
        await scenario.run({ page, context, baseUrl });
        await sleep(80);
        expectEqual(consoleErrors.length, 0, "console errors");
        expectEqual(pageErrors.length, 0, "page errors");
        results.push({
          name: scenario.name,
          pass: true,
          elapsedMs: Date.now() - startedAt,
          consoleErrorCount: 0,
          pageErrorCount: 0
        });
      } catch (error) {
        results.push({
          name: scenario.name,
          pass: false,
          elapsedMs: Date.now() - startedAt,
          error: error?.stack || error?.message || String(error),
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
          consoleErrors: consoleErrors.slice(0, 10),
          pageErrors: pageErrors.slice(0, 10),
          url: page.url()
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const failed = results.filter(result => !result.pass);
  const summary = {
    done: true,
    contract: "a1-current-input-date-inbody-safety-e2e-v1",
    oracle: "literal DOM/raw localStorage assertions with production actions as stimuli",
    scenarioCount: results.length,
    passedCount: results.length - failed.length,
    failedCount: failed.length,
    results
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length) process.exitCode = 1;
}

run().catch(error => {
  console.error(JSON.stringify({
    done: true,
    runnerError: error?.stack || error?.message || String(error)
  }, null, 2));
  process.exitCode = 1;
});
