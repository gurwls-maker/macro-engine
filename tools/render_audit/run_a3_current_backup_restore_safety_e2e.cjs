const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_PREFIX = "runstep_macro_v1_";
const FAKE_NOW_KEY = "__macro_engine_a3_fake_now__";
const SEED_MARKER_KEY = "__macro_engine_a3_seeded__";
const NOW = "2026-08-14T12:00:00+09:00";
const TODAY = "2026-08-14";
const CONFLICT_DATE = "2026-08-12";
const LOCAL_ONLY_DATE = "2026-08-11";
const BACKUP_ONLY_DATE = "2026-08-10";
const FAULT_INBODY_DATE = "2026-08-09";
const SHARED_SMART_MEAL_ID = "shared-smart-meal-id";
const CROSS_DAY_NOW = "2026-08-15T12:00:00+09:00";
const CROSS_DAY_TODAY = "2026-08-15";
const EXPLICIT_LATEST_DATE = "2026-08-13";
const EXPLICIT_RECORD_DATE = "2026-08-08";
const DEFAULT_CARDIO_PRESET_ID = "a3-cross-day-default-cardio";
const OUTDOOR_PRESET_NAME = "A3 실외 전환 프리셋";
const FULL_BACKUP_VERSION = 2;
const RECORDS_BACKUP_VERSION = 4;

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

function makeRecord(date, marker, options = {}){
  const offset = Number(options.offset) || 0;
  return {
    date,
    recordMode: "detailed",
    weight: Number((75 + offset / 10).toFixed(2)),
    adherence: "medium",
    adherencePercent: null,
    adherenceSource: null,
    adherenceScoringVersion: null,
    goalSnapshot: null,
    adherenceLockedAt: null,
    snapshotSource: null,
    note: `${marker} · 한글 메모`,
    meals: [{
      id: options.mealId || `meal-${date}-${offset}`,
      mealLabel: options.mealLabel || "점심",
      carbs: 180 + offset,
      protein: 120 + offset,
      fat: 55 + offset,
      alcoholKcal: 0,
      otherKcal: 0,
      memo: `${marker} · 김치와 현미밥`,
      createdAt: `${date}T03:00:00.000Z`
    }],
    recordLifecycle: "draft",
    completedAt: null,
    completionEvidenceSignature: null
  };
}

function makeInbodyRecord(date, values = {}){
  const weight = Number(values.weight ?? 74);
  const bodyFatPercent = Number(values.bodyFatPercent ?? 15);
  const bodyFat = Number(values.bodyFat ?? (weight * bodyFatPercent / 100));
  return {
    date,
    weight,
    skeletalMuscle: Number(values.skeletalMuscle ?? 34),
    bodyFat,
    bodyFatPercent,
    warning: "",
    isSuspicious: false
  };
}

const crossDayLatestInbody = makeInbodyRecord(TODAY, {
  weight: 74.2,
  skeletalMuscle: 35.6,
  bodyFat: 10.759,
  bodyFatPercent: 14.5
});

const explicitLatestInbody = makeInbodyRecord(EXPLICIT_LATEST_DATE, {
  weight: 74.6,
  skeletalMuscle: 35.3,
  bodyFat: 11.19,
  bodyFatPercent: 15
});

const explicitRecordInbody = makeInbodyRecord(EXPLICIT_RECORD_DATE, {
  weight: 75,
  skeletalMuscle: 35,
  bodyFat: 12,
  bodyFatPercent: 16
});

const defaultCardioPreset = Object.freeze({
  id: DEFAULT_CARDIO_PRESET_ID,
  name: "기본 경사 걷기",
  cardioType: "treadmill_walk",
  cardioDuration: 27,
  cardioSpeed: 5.5,
  cardioIncline: 6,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z"
});

const explicitTodayDrafts = Object.freeze({
  [EXPLICIT_RECORD_DATE]: {
    calculationWeight: explicitRecordInbody.weight,
    skeletalMuscle: explicitRecordInbody.skeletalMuscle,
    bodyFatMass: explicitRecordInbody.bodyFat,
    bodyFatPercent: explicitRecordInbody.bodyFatPercent,
    bodyStatusSource: "latest_inbody",
    bodyStatusSourceDate: EXPLICIT_RECORD_DATE,
    bodyStatusLoadType: "record"
  },
  [EXPLICIT_LATEST_DATE]: {
    calculationWeight: explicitLatestInbody.weight,
    skeletalMuscle: explicitLatestInbody.skeletalMuscle,
    bodyFatMass: explicitLatestInbody.bodyFat,
    bodyFatPercent: explicitLatestInbody.bodyFatPercent,
    bodyStatusSource: "latest_inbody",
    bodyStatusSourceDate: EXPLICIT_LATEST_DATE,
    bodyStatusLoadType: "latest"
  },
  [TODAY]: {
    todayCardioType: "treadmill_walk",
    todayCardioDuration: 33,
    todayCardioSpeed: 5.8,
    todayCardioIncline: 7,
    cardioSource: "preset",
    cardioPresetId: DEFAULT_CARDIO_PRESET_ID,
    cardioPresetName: "명시 프리셋"
  },
  [CROSS_DAY_TODAY]: {
    calculationWeight: 76.2,
    skeletalMuscle: 35.4,
    bodyFatMass: 12.192,
    bodyFatPercent: 16,
    bodyStatusSource: "user",
    bodyStatusEdited: true,
    todayCardioType: "treadmill_run",
    todayCardioDuration: 31,
    todayCardioSpeed: 8.5,
    todayCardioIncline: 1,
    cardioSource: "user",
    cardioEdited: true
  }
});

const baseStorage = Object.freeze({
  [`${STORAGE_PREFIX}onboardingCompletedVersion`]: "1",
  [`${STORAGE_PREFIX}bodyCompositionConfirmed`]: "true",
  [`${STORAGE_PREFIX}mode`]: "general",
  [`${STORAGE_PREFIX}weight`]: "75",
  [`${STORAGE_PREFIX}height`]: "173",
  [`${STORAGE_PREFIX}age`]: "32",
  [`${STORAGE_PREFIX}bodyFat`]: "15",
  [`${STORAGE_PREFIX}bodyFatMass`]: "11.25",
  [`${STORAGE_PREFIX}skeletal`]: "35",
  [`${STORAGE_PREFIX}gender`]: "male",
  [`${STORAGE_PREFIX}activityLevel`]: "moderate",
  [`${STORAGE_PREFIX}workType`]: "office",
  [`${STORAGE_PREFIX}sleepHours`]: "8",
  [`${STORAGE_PREFIX}workHours`]: "8",
  [`${STORAGE_PREFIX}lifestyleHours`]: "2",
  [`${STORAGE_PREFIX}workAdj`]: "0",
  [`${STORAGE_PREFIX}homeInbody`]: "true",
  [`${STORAGE_PREFIX}expertLbmAlpha`]: "0.75",
  [`${STORAGE_PREFIX}exerciseManagementMode`]: "exercise",
  [`${STORAGE_PREFIX}exerciseProfile`]: "bodybuilding",
  [`${STORAGE_PREFIX}weeklyTrainingDays`]: "4",
  [`${STORAGE_PREFIX}weeklyTrainingDaysManual`]: "true",
  [`${STORAGE_PREFIX}generalAdvancedSettings`]: "true",
  [`${STORAGE_PREFIX}generalLowDigestCarbs`]: "false",
  [`${STORAGE_PREFIX}adaptiveMacroTargetsEnabled`]: "true",
  [`${STORAGE_PREFIX}proteinTargetLevel`]: "medium",
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
  [`${STORAGE_PREFIX}records`]: JSON.stringify([
    makeRecord(CONFLICT_DATE, "현재 기준 기록", { offset: 1 })
  ]),
  [`${STORAGE_PREFIX}inbodyRecords`]: "[]",
  [`${STORAGE_PREFIX}todayCalculationDrafts.v1`]: JSON.stringify({
    [TODAY]: {
      calculationWeight: 75,
      todayIntensityOverride: 0.8,
      todayWeightDuration: 120,
      todayCardioType: "treadmill_walk",
      todayCardioDuration: 0,
      todayCardioSpeed: 5,
      todayCardioIncline: 0
    }
  }),
  [`${STORAGE_PREFIX}activeTab`]: "today"
});

function storage(overrides = {}){
  return { ...baseStorage, ...overrides };
}

function recordsStorage(records){
  return { [`${STORAGE_PREFIX}records`]: JSON.stringify(records) };
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

async function installSeedClockAndStorageFaults(context, initialStorage){
  await context.addInitScript(({ seed, fakeNowIso, fakeNowKey, seedMarkerKey, storagePrefix }) => {
    try {
      if (location.protocol === "http:" || location.protocol === "https:") {
        if (localStorage.getItem(seedMarkerKey) !== "1") {
          Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, String(value)));
          localStorage.setItem(seedMarkerKey, "1");
        }
        if (!localStorage.getItem(fakeNowKey)) localStorage.setItem(fakeNowKey, fakeNowIso);
      }
    } catch (_error) {
      // about:blank has no usable localStorage; this init script runs again for index.html.
    }

    try {
      Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
    } catch (_error) {
      try { window.showSaveFilePicker = undefined; } catch (_ignored) {}
    }

    const NativeDate = Date;
    const readNow = () => {
      try {
        const parsed = NativeDate.parse(localStorage.getItem(fakeNowKey) || fakeNowIso);
        return Number.isFinite(parsed) ? parsed : NativeDate.parse(fakeNowIso);
      } catch (_error) {
        return NativeDate.parse(fakeNowIso);
      }
    };
    function A3Date(...args){
      if (!(this instanceof A3Date)) return new NativeDate(readNow()).toString();
      return args.length ? new NativeDate(...args) : new NativeDate(readNow());
    }
    A3Date.prototype = NativeDate.prototype;
    Object.setPrototypeOf(A3Date, NativeDate);
    A3Date.now = readNow;
    A3Date.parse = NativeDate.parse;
    A3Date.UTC = NativeDate.UTC;
    window.Date = A3Date;

    if (!window.__a3StorageFaultControl) {
      const nativeSetItem = Storage.prototype.setItem;
      const nativeRemoveItem = Storage.prototype.removeItem;
      let plan = null;
      let operationLog = [];
      const logOperation = (method, key, failed) => {
        if (!String(key).startsWith(storagePrefix)) return;
        operationLog.push({ method, key: String(key), failed: failed === true });
        if (operationLog.length > 300) operationLog = operationLog.slice(-300);
      };
      const shouldFail = (method, key) => {
        if (!plan || plan.consumed || plan.method !== method || String(key) !== plan.key) return false;
        plan.matchCount += 1;
        if (plan.matchCount < plan.throwOnMatch) return false;
        plan.consumed = true;
        return true;
      };
      Storage.prototype.setItem = function(key, value){
        if (shouldFail("setItem", key)) {
          logOperation("setItem", key, true);
          throw new DOMException("A3 one-shot setItem fault", "QuotaExceededError");
        }
        logOperation("setItem", key, false);
        return nativeSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function(key){
        if (shouldFail("removeItem", key)) {
          logOperation("removeItem", key, true);
          throw new DOMException("A3 one-shot removeItem fault", "UnknownError");
        }
        logOperation("removeItem", key, false);
        return nativeRemoveItem.call(this, key);
      };
      Object.defineProperty(window, "__a3StorageFaultControl", {
        configurable: true,
        value: Object.freeze({
          arm(method, key, throwOnMatch = 1){
            if (!["setItem", "removeItem"].includes(method)) throw new Error(`unsupported fault method: ${method}`);
            plan = { method, key: String(key), throwOnMatch: Math.max(1, Number(throwOnMatch) || 1), matchCount: 0, consumed: false };
            operationLog = [];
          },
          clear(){ plan = null; operationLog = []; },
          state(){ return { plan: plan ? { ...plan } : null, operationLog: operationLog.map(item => ({ ...item })) }; }
        })
      });
    }
  }, {
    seed: initialStorage,
    fakeNowIso: NOW,
    fakeNowKey: FAKE_NOW_KEY,
    seedMarkerKey: SEED_MARKER_KEY,
    storagePrefix: STORAGE_PREFIX
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

async function reloadApp(page){
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 90000 });
}

async function setFakeNow(page, iso, options = {}){
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: FAKE_NOW_KEY,
    value: iso
  });
  if (options.reload === true) await reloadApp(page);
}

async function replaceRawTodayDrafts(page, drafts, options = {}){
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: `${STORAGE_PREFIX}todayCalculationDrafts.v1`,
    value: JSON.stringify(drafts)
  });
  if (options.reload === true) await reloadApp(page);
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

function expectDeepEqual(actual, expected, label){
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function expectExactFields(value, fields, label){
  expectTrue(value && typeof value === "object" && !Array.isArray(value), `${label} is an object`);
  expectDeepEqual(Object.keys(value).sort(), [...fields].sort(), `${label} exact fields`);
}

async function openSettings(page){
  await page.locator("#tabSettings").click();
  await page.locator("#dataManagementPanel").waitFor({ state: "visible" });
}

async function openSettingsTrainingGroup(page){
  await openSettings(page);
  const group = page.locator(".settings-training-group");
  const toggle = group.locator(".settings-disclosure-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#cardioPresetSettingsHost").waitFor({ state: "visible" });
}

async function openTodayQuickEdit(page){
  await page.locator("#tabToday").click();
  const toggle = page.locator("#todayQuickEditToggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#todayQuickEditPanel").waitFor({ state: "visible" });
}

async function commitInput(page, selector, value){
  const input = page.locator(selector);
  await input.fill(String(value));
  await input.dispatchEvent("change");
}

async function readRawJson(page, storageName, fallback){
  return page.evaluate(({ key, fallbackValue }) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallbackValue));
    } catch (_error) {
      return fallbackValue;
    }
  }, { key: `${STORAGE_PREFIX}${storageName}`, fallbackValue: fallback });
}

async function assertTodayOutdoorInclineUi(page, label){
  await openTodayQuickEdit(page);
  expectEqual(await page.locator("#todayQuickCardioType").inputValue(), "outdoor_run", `${label} cardio type`);
  expectEqual(Number(await page.locator("#todayQuickCardioIncline").inputValue()), 0, `${label} incline is zero`);
  expectTrue(await page.locator("#todayQuickCardioIncline").isDisabled(), `${label} incline is disabled`);
}

async function openRecordBasisEdit(page, date){
  await page.locator("#tabRecords").click();
  const card = page.locator(`[data-record-card-date="${date}"]`);
  await card.waitFor({ state: "visible" });
  await card.click();
  let detail = page.locator(`[data-record-detail-date="${date}"]`);
  await detail.waitFor({ state: "visible" });
  if (await detail.getAttribute("data-record-detail-edit") !== "true") {
    await detail.locator(`[data-edit-record-date="${date}"]`).click();
    detail = page.locator(`[data-record-detail-date="${date}"][data-record-detail-edit="true"]`);
    await detail.waitFor({ state: "visible" });
  }
  const basis = detail.locator('[data-record-detail-section="basis"]');
  if (!(await basis.evaluate(element => element.open))) await basis.locator("summary").click();
  await basis.locator('[data-detail-basis-field="cardioType"]').waitFor({ state: "visible" });
  return detail;
}

async function setSettingsExerciseProfileViaUi(page, profile){
  await openSettingsTrainingGroup(page);
  await page.locator("#exerciseProfile").selectOption(profile);
  await page.waitForFunction(({ key, value }) => localStorage.getItem(key) === value, {
    key: `${STORAGE_PREFIX}exerciseProfile`,
    value: profile
  });
  await openSettingsTrainingGroup(page);
  expectEqual(await page.locator("#exerciseProfile").inputValue(), profile, `Settings stores ${profile} exercise profile`);
}

async function readDownload(download){
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  const text = buffer.toString("utf8");
  expectTrue(buffer.equals(Buffer.from(text, "utf8")), "download is strict UTF-8");
  expectTrue(!text.includes("\uFFFD"), "download has no UTF-8 replacement character");
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`download is not valid JSON: ${error.message}; text=${text.slice(0, 300)}`);
  }
  return { buffer, text, json, filename: download.suggestedFilename() };
}

async function exportWithButton(page, selector){
  await openSettings(page);
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.locator(selector).click();
  return readDownload(await downloadPromise);
}

async function exportFullBackup(page){
  return exportWithButton(page, "#exportFullBackupBtn");
}

async function exportRecordsBackup(page){
  return exportWithButton(page, "#exportJsonBtn");
}

async function chooseImportFile(page, type, file){
  await openSettings(page);
  const buttonSelector = type === "full" ? "#importBackupBtn" : "#importJsonBtn";
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
  await page.locator(buttonSelector).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: file.name,
    mimeType: "application/json",
    buffer: Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer)
  });
}

async function waitForImportPreview(page, expectedTitlePart){
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(expected => (
    (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes(expected)
  ), expectedTitlePart, { timeout: 10000 });
}

async function importFullPreview(page, backup){
  await chooseImportFile(page, "full", {
    name: backup.filename || "macro-engine-full-backup-current.json",
    buffer: backup.buffer || Buffer.from(JSON.stringify(backup.json), "utf8")
  });
  await waitForImportPreview(page, "백업을 어떻게 불러올까요?");
}

async function importRecordsPreview(page, backup){
  await chooseImportFile(page, "records", {
    name: backup.filename || "runstep-records-backup-current.json",
    buffer: backup.buffer || Buffer.from(JSON.stringify(backup.json), "utf8")
  });
  await waitForImportPreview(page, "기록 파일을 불러올까요?");
}

async function rawStorageSnapshot(page){
  return page.evaluate(prefix => Object.fromEntries(
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .sort()
      .map(key => [key, localStorage.getItem(key)])
  ), STORAGE_PREFIX);
}

async function rawRecords(page){
  const raw = await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}records`);
  try {
    return JSON.parse(raw || "[]");
  } catch (error) {
    throw new Error(`raw records is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function visibleAuthorityDomSnapshot(page){
  await openSettings(page);
  const settings = await page.evaluate(() => ({
    mode: document.getElementById("mode")?.value || "",
    weight: document.getElementById("weight")?.value || "",
    height: document.getElementById("height")?.value || "",
    goal: document.getElementById("goal")?.value || ""
  }));
  await page.locator("#tabRecords").click();
  await page.locator("#recordsTable").waitFor({ state: "visible" });
  const recordsHtml = await page.locator("#recordsTable").evaluate(element => element.innerHTML);
  await openSettings(page);
  return { settings, recordsHtml };
}

function recordByDate(records, date){
  return records.find(record => record.date === date) || null;
}

async function replaceRawTarget(page, { records, height }){
  await page.evaluate(({ recordsKey, recordsValue, heightKey, heightValue }) => {
    localStorage.setItem(recordsKey, recordsValue);
    if (heightValue !== undefined) localStorage.setItem(heightKey, String(heightValue));
  }, {
    recordsKey: `${STORAGE_PREFIX}records`,
    recordsValue: JSON.stringify(records),
    heightKey: `${STORAGE_PREFIX}height`,
    heightValue: height
  });
  await reloadApp(page);
}

async function editSettingsHeightViaUi(page, height){
  await openSettings(page);
  const profileToggle = page.locator(".settings-profile-group .settings-disclosure-toggle");
  if (await profileToggle.getAttribute("aria-expanded") !== "true") await profileToggle.click();
  const input = page.locator("#height");
  await input.fill(String(height));
  await input.dispatchEvent("input");
  await input.dispatchEvent("change");
  await page.waitForFunction(({ key, value }) => localStorage.getItem(key) === String(value), {
    key: `${STORAGE_PREFIX}height`,
    value: height
  });
  expectEqual(await page.locator("#height").inputValue(), String(height), "normal Settings UI stores current B height");
}

async function editRecordNoteViaUi(page, date, note){
  await page.locator("#tabRecords").click();
  const card = page.locator(`[data-record-card-date="${date}"]`);
  await card.waitFor({ state: "visible" });
  await card.click();
  let detail = page.locator(`[data-record-detail-date="${date}"]`);
  await detail.waitFor({ state: "visible" });
  await detail.locator(`[data-edit-record-date="${date}"]`).click();
  detail = page.locator(`[data-record-detail-date="${date}"][data-record-detail-edit="true"]`);
  await detail.waitFor({ state: "visible" });
  await detail.locator('[data-detail-field="note"]').fill(note);
  await detail.locator(`[data-detail-save="${date}"]`).click();
  await page.waitForFunction(({ key, date, note }) => {
    try {
      const records = JSON.parse(localStorage.getItem(key) || "[]");
      return records.some(record => record.date === date && record.note === note);
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}records`, date, note });
}

async function editInbodyViaUi(page, date, values){
  await page.locator("#tabInbody").click();
  await page.locator("#viewInbodyRecordsBtn").click();
  const overlay = page.locator("#inbodyHistoryOverlay");
  await overlay.waitFor({ state: "visible" });
  const row = overlay.locator(".inbody-record").filter({ hasText: date });
  await row.locator("[data-load-inbody]").click();
  await overlay.waitFor({ state: "hidden" });
  await page.locator("#inbodyDate").fill(date);
  await page.locator("#inbodyWeight").fill(String(values.weight));
  await page.locator("#inbodySkeletalMuscle").fill(String(values.skeletalMuscle));
  await page.locator("#inbodyBodyFat").fill(String(values.bodyFat));
  await page.locator("#inbodyBodyFatPercent").fill(String(values.bodyFatPercent));
  await page.locator("#saveInbodyBtn").click();
  await page.waitForFunction(({ key, date, values }) => {
    try {
      const records = JSON.parse(localStorage.getItem(key) || "[]");
      const record = records.find(item => item.date === date);
      return !!record
        && record.weight === values.weight
        && record.skeletalMuscle === values.skeletalMuscle
        && record.bodyFat === values.bodyFat
        && record.bodyFatPercent === values.bodyFatPercent;
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}inbodyRecords`, date, values });
}

async function prepareDistinctCurrentStateB(page){
  const current = {
    height: 181,
    recordDate: CONFLICT_DATE,
    recordNote: "현재 B 기록 · 정상 UI 저장",
    inbodyDate: FAULT_INBODY_DATE,
    inbody: {
      weight: 78,
      skeletalMuscle: 37,
      bodyFat: 12.48,
      bodyFatPercent: 16
    }
  };
  await editSettingsHeightViaUi(page, current.height);
  await editRecordNoteViaUi(page, current.recordDate, current.recordNote);
  await editInbodyViaUi(page, current.inbodyDate, current.inbody);
  await openSettings(page);
  return current;
}

async function pendingOverlaySnapshot(page){
  return page.evaluate(() => {
    const overlay = document.getElementById("dataImportConfirmOverlay");
    const title = document.getElementById("dataImportConfirmTitle");
    const body = document.getElementById("dataImportConfirmBody");
    return {
      visible: !!overlay && !overlay.classList.contains("hidden"),
      ariaHidden: overlay?.getAttribute("aria-hidden") || null,
      title: (title?.textContent || "").trim(),
      bodyText: (body?.innerText || "").trim(),
      fullActionCount: body?.querySelectorAll("[data-confirm-data-import]").length || 0,
      smartActionCount: body?.querySelectorAll("[data-smart-restore-import]").length || 0,
      conflictActionCount: body?.querySelectorAll("[data-smart-conflict-mode]").length || 0
    };
  });
}

function assertCandidateADiffersFromB(full, recordsOnly, current){
  const fullRecord = recordByDate(full.json.data.records, current.recordDate);
  const recordsOnlyRecord = recordByDate(recordsOnly.json.records, current.recordDate);
  const fullInbody = full.json.data.inbodyRecords.find(record => record.date === current.inbodyDate);
  const recordsOnlyInbody = recordsOnly.json.inbodyRecords.find(record => record.date === current.inbodyDate);
  expectTrue(full.json.data.settings.height !== current.height, "candidate A and current B Settings differ");
  expectTrue(fullRecord?.note !== current.recordNote && recordsOnlyRecord?.note !== current.recordNote, "candidate A and current B Records differ");
  expectTrue(
    fullInbody?.weight !== current.inbody.weight
      && recordsOnlyInbody?.weight !== current.inbody.weight
      && fullInbody?.skeletalMuscle !== current.inbody.skeletalMuscle,
    "candidate A and current B InBody differ"
  );
  expectTrue(
    !full.text.includes(current.recordNote) && full.text.includes("후보 A 기록"),
    "candidate A download and current B visible marker differ"
  );
}

async function assertCurrentBState(page, current, label){
  const records = await rawRecords(page);
  expectEqual(recordByDate(records, current.recordDate)?.note, current.recordNote, `${label} raw Records keep B`);
  const rawInbody = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), `${STORAGE_PREFIX}inbodyRecords`);
  const inbody = rawInbody.find(record => record.date === current.inbodyDate);
  expectTrue(!!inbody, `${label} raw InBody keeps B`, formatValue(rawInbody));
  expectEqual(inbody.weight, current.inbody.weight, `${label} raw InBody weight`);
  expectEqual(inbody.skeletalMuscle, current.inbody.skeletalMuscle, `${label} raw InBody skeletal muscle`);

  await openSettings(page);
  expectEqual(await page.locator("#height").inputValue(), String(current.height), `${label} visible Settings keep B`);
  await assertVisibleRecord(page, current.recordDate, current.recordNote, `${label} visible Records keep B marker`);
  await page.locator("#tabInbody").click();
  await page.locator("#viewInbodyRecordsBtn").click();
  const overlay = page.locator("#inbodyHistoryOverlay");
  await overlay.waitFor({ state: "visible" });
  const rowText = await overlay.locator(".inbody-record").filter({ hasText: current.inbodyDate }).innerText();
  expectTrue(
    rowText.includes("78.00kg") && rowText.includes("37.00kg") && rowText.includes("12.48kg") && rowText.includes("16.00%"),
    `${label} visible InBody keeps B marker`,
    rowText
  );
  await page.locator("#inbodyHistoryClose").click();
}

async function assertVisibleRecord(page, date, marker, label){
  await page.locator("#tabRecords").click();
  const card = page.locator(`[data-record-card-date="${date}"]`);
  await card.waitFor({ state: "visible", timeout: 10000 });
  await card.click();
  let detail = page.locator(`[data-record-detail-date="${date}"]`);
  await detail.waitFor({ state: "visible", timeout: 10000 });
  const editButton = detail.locator(`[data-edit-record-date="${date}"]`);
  if (await editButton.isVisible()) {
    await editButton.click();
    detail = page.locator(`[data-record-detail-date="${date}"][data-record-detail-edit="true"]`);
    await detail.waitFor({ state: "visible", timeout: 10000 });
  }
  const noteInput = detail.locator('[data-detail-field="note"]');
  await noteInput.waitFor({ state: "visible", timeout: 10000 });
  const note = await noteInput.inputValue();
  expectTrue(note.includes(marker), label, `visible note=${note}`);
}

async function assertCrossDayAutomaticDefaultsVisible(page, label){
  await page.locator("#tabToday").click();
  const toggle = page.locator("#todayQuickEditToggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#todayQuickEditPanel").waitFor({ state: "visible" });
  expectEqual(Number(await page.locator("#todayQuickWeight").inputValue()), crossDayLatestInbody.weight, `${label} uses latest InBody weight`);
  expectEqual(Number(await page.locator("#todayQuickSkeletal").inputValue()), crossDayLatestInbody.skeletalMuscle, `${label} uses latest InBody skeletal muscle`);
  expectEqual(Number(await page.locator("#todayQuickBodyFatMass").inputValue()), Number(crossDayLatestInbody.bodyFat.toFixed(2)), `${label} uses latest InBody body-fat mass`);
  expectEqual(Number(await page.locator("#todayQuickBodyFat").inputValue()), crossDayLatestInbody.bodyFatPercent, `${label} uses latest InBody body-fat percent`);
  expectEqual(await page.locator("#todayQuickCardioType").inputValue(), defaultCardioPreset.cardioType, `${label} uses default cardio type`);
  expectEqual(Number(await page.locator("#todayQuickCardioDuration").inputValue()), defaultCardioPreset.cardioDuration, `${label} uses default cardio duration`);
  expectEqual(Number(await page.locator("#todayQuickCardioSpeed").inputValue()), defaultCardioPreset.cardioSpeed, `${label} uses default cardio speed`);
  expectEqual(Number(await page.locator("#todayQuickCardioIncline").inputValue()), defaultCardioPreset.cardioIncline, `${label} uses default cardio incline`);
  expectTrue((await page.locator("#todayInbodySourceNote").innerText()).includes("최신 InBody"), `${label} visibly identifies automatic latest InBody`);
  expectTrue((await page.locator("#todayCardioSourceNote").innerText()).includes("프리셋에서 시작함"), `${label} visibly identifies default cardio preset`);
}

function assertExplicitTodayOverrides(values, label){
  const record = values[EXPLICIT_RECORD_DATE];
  expectTrue(record?.bodyStatusSource === "latest_inbody" && record?.bodyStatusLoadType === "record", `${label} preserves explicit selected-record InBody authority`, formatValue(record));
  expectEqual(record?.bodyStatusSourceDate, EXPLICIT_RECORD_DATE, `${label} preserves selected-record source date`);
  const latest = values[EXPLICIT_LATEST_DATE];
  expectTrue(latest?.bodyStatusSource === "latest_inbody" && latest?.bodyStatusLoadType === "latest", `${label} preserves explicit latest-InBody authority`, formatValue(latest));
  expectEqual(latest?.bodyStatusSourceDate, EXPLICIT_LATEST_DATE, `${label} preserves latest-InBody source date`);
  const preset = values[TODAY];
  expectTrue(preset?.cardioSource === "preset" && preset?.cardioPresetId === DEFAULT_CARDIO_PRESET_ID, `${label} preserves explicit cardio-preset authority`, formatValue(preset));
  expectEqual(preset?.todayCardioDuration, 33, `${label} preserves explicit cardio-preset values`);
  const user = values[CROSS_DAY_TODAY];
  expectTrue(user?.bodyStatusSource === "user" && user?.bodyStatusEdited === true, `${label} preserves explicit user body authority`, formatValue(user));
  expectTrue(user?.cardioSource === "user" && user?.cardioEdited === true, `${label} preserves explicit user cardio authority`, formatValue(user));
  expectEqual(user?.todayCardioDuration, 31, `${label} preserves explicit user cardio values`);
}

async function assertFeedback(page, expected, label){
  await page.waitForFunction(text => (
    (document.getElementById("dataManagementFeedback")?.textContent || "").includes(text)
  ), expected, { timeout: 10000 });
  const text = await page.locator("#dataManagementFeedback").innerText();
  expectTrue(text.includes(expected), label, text);
  return text;
}

async function cancelImport(page){
  const overlay = page.locator("#dataImportConfirmOverlay");
  if (await overlay.isVisible()) {
    await overlay.locator("[data-cancel-data-import]").last().click();
    await overlay.waitFor({ state: "hidden" });
  }
}

async function armStorageFault(page, method, key, throwOnMatch = 1){
  await page.evaluate(({ method, key, throwOnMatch }) => {
    window.__a3StorageFaultControl.arm(method, key, throwOnMatch);
  }, { method, key, throwOnMatch });
}

async function storageFaultState(page){
  return page.evaluate(() => window.__a3StorageFaultControl.state());
}

async function scenarioExportEnvelopeAndKorean({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const full = await exportFullBackup(page);
  expectEqual(full.filename, `macro-engine-full-backup-${TODAY}.json`, "full export filename");
  expectExactFields(full.json, ["app", "kind", "backupVersion", "appVersion", "createdAt", "data"], "full envelope");
  expectEqual(full.json.app, "macro-engine", "full envelope app");
  expectEqual(full.json.kind, "full-backup", "full envelope kind");
  expectEqual(full.json.backupVersion, FULL_BACKUP_VERSION, "full envelope version");
  expectEqual(full.json.appVersion, "v8.3", "full envelope app version");
  expectTrue(full.json.createdAt === new Date(NOW).toISOString(), "full envelope timestamp is deterministic current ISO", full.json.createdAt);
  expectExactFields(full.json.data, [
    "onboardingCompletedVersion",
    "settings",
    "records",
    "inbodyRecords",
    "cardioPresets",
    "mealTemplates",
    "todayCalculationValues",
    "weeklyTrainingState"
  ], "full data envelope");
  expectTrue(full.text.includes("현재 기준 기록") && full.text.includes("김치와 현미밥"), "full export preserves Korean text", full.text.slice(0, 800));

  const recordsOnly = await exportRecordsBackup(page);
  expectEqual(recordsOnly.filename, `runstep-records-backup-${TODAY}.json`, "records-only export filename");
  expectExactFields(recordsOnly.json, ["version", "exportedAt", "records", "inbodyRecords"], "records-only envelope");
  expectEqual(recordsOnly.json.version, RECORDS_BACKUP_VERSION, "records-only version");
  expectTrue(recordsOnly.text.includes("현재 기준 기록") && recordsOnly.text.includes("김치와 현미밥"), "records-only export preserves Korean text", recordsOnly.text.slice(0, 800));
  expectTrue((await page.locator("#dataManagementFeedback").innerText()).includes("기록 중심 파일"), "actual records export reports its visible scope");

  await openTodayQuickEdit(page);
  await page.locator("#todayQuickCardioType").selectOption("treadmill_walk");
  await commitInput(page, "#todayQuickCardioDuration", 30);
  await commitInput(page, "#todayQuickCardioSpeed", 6);
  await commitInput(page, "#todayQuickCardioIncline", 10);
  expectEqual(Number(await page.locator("#todayQuickCardioIncline").inputValue()), 10, "Today treadmill transition starts from incline 10");
  await page.locator("#todayQuickCardioType").selectOption("outdoor_run");
  await assertTodayOutdoorInclineUi(page, "Today treadmill-to-outdoor transition");
  await page.waitForFunction(({ key, date }) => {
    try {
      const drafts = JSON.parse(localStorage.getItem(key) || "{}");
      return drafts[date]?.todayCardioType === "outdoor_run" && drafts[date]?.todayCardioIncline === 0;
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}todayCalculationDrafts.v1`, date: TODAY });
  const todayRaw = await readRawJson(page, "todayCalculationDrafts.v1", {});
  expectEqual(todayRaw[TODAY]?.todayCardioIncline, 0, "Today outdoor transition stores raw incline zero");
  const todayBackup = await exportFullBackup(page);
  expectEqual(todayBackup.json.data.todayCalculationValues[TODAY]?.todayCardioType, "outdoor_run", "actual full backup keeps Today outdoor type");
  expectEqual(todayBackup.json.data.todayCalculationValues[TODAY]?.todayCardioIncline, 0, "actual full backup keeps Today outdoor incline zero");
  await reloadApp(page);
  await assertTodayOutdoorInclineUi(page, "Today outdoor transition after reload");

  await openSettingsTrainingGroup(page);
  await page.locator("#cardioPresetName").fill(OUTDOOR_PRESET_NAME);
  await page.locator("#cardioPresetType").selectOption("treadmill_walk");
  await page.locator("#cardioPresetDuration").fill("30");
  await page.locator("#cardioPresetSpeed").fill("6");
  await page.locator("#cardioPresetIncline").fill("7");
  expectEqual(Number(await page.locator("#cardioPresetIncline").inputValue()), 7, "cardio preset transition starts from incline 7");
  await page.locator("#cardioPresetType").selectOption("outdoor_run");
  await page.locator("#saveCardioPresetBtn").click();
  await page.waitForFunction(({ key, name }) => {
    try {
      const presetState = JSON.parse(localStorage.getItem(key) || "{}");
      return presetState.items?.some(item => item.name === name && item.cardioType === "outdoor_run" && item.cardioIncline === 0);
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}cardioPresets.v1`, name: OUTDOOR_PRESET_NAME });
  const presetRaw = await readRawJson(page, "cardioPresets.v1", { items: [] });
  const outdoorPreset = presetRaw.items?.find(item => item.name === OUTDOOR_PRESET_NAME);
  expectEqual(outdoorPreset?.cardioType, "outdoor_run", "outdoor cardio preset stores its selected type");
  expectEqual(outdoorPreset?.cardioIncline, 0, "outdoor cardio preset stores incline zero");

  let recordDetail = await openRecordBasisEdit(page, CONFLICT_DATE);
  await recordDetail.locator('[data-detail-basis-field="cardioType"]').selectOption("treadmill_run");
  await commitInput(page, '[data-record-detail-edit="true"] [data-detail-basis-field="cardioDuration"]', 30);
  await commitInput(page, '[data-record-detail-edit="true"] [data-detail-basis-field="cardioSpeed"]', 6);
  await commitInput(page, '[data-record-detail-edit="true"] [data-detail-basis-field="cardioIncline"]', 10);
  expectEqual(Number(await recordDetail.locator('[data-detail-basis-field="cardioIncline"]').inputValue()), 10, "Records basis transition starts from incline 10");
  await recordDetail.locator('[data-detail-basis-field="cardioType"]').selectOption("outdoor_run");
  expectEqual(Number(await recordDetail.locator('[data-detail-basis-field="cardioIncline"]').inputValue()), 0, "Records outdoor basis forces incline zero");
  expectTrue(await recordDetail.locator('[data-detail-basis-field="cardioIncline"]').isDisabled(), "Records outdoor basis disables incline input");
  await recordDetail.locator(`[data-detail-save="${CONFLICT_DATE}"]`).click();
  await page.waitForFunction(({ key, date }) => {
    try {
      const records = JSON.parse(localStorage.getItem(key) || "[]");
      const snapshot = records.find(record => record.date === date)?.goalSnapshot;
      return snapshot?.cardioType === "outdoor_run" && snapshot?.cardioIncline === 0;
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}records`, date: CONFLICT_DATE });
  await reloadApp(page);
  recordDetail = await openRecordBasisEdit(page, CONFLICT_DATE);
  expectEqual(await recordDetail.locator('[data-detail-basis-field="cardioType"]').inputValue(), "outdoor_run", "Records outdoor basis survives reopen");
  expectEqual(Number(await recordDetail.locator('[data-detail-basis-field="cardioIncline"]').inputValue()), 0, "Records outdoor incline zero survives reopen");
  expectTrue(await recordDetail.locator('[data-detail-basis-field="cardioIncline"]').isDisabled(), "Records outdoor incline stays disabled after reopen");

  const invariantBackup = await exportFullBackup(page);
  const backedUpPreset = invariantBackup.json.data.cardioPresets.items.find(item => item.name === OUTDOOR_PRESET_NAME);
  const backedUpRecord = invariantBackup.json.data.records.find(record => record.date === CONFLICT_DATE);
  expectEqual(invariantBackup.json.data.todayCalculationValues[TODAY]?.todayCardioIncline, 0, "reloaded full backup keeps Today outdoor incline zero");
  expectEqual(backedUpPreset?.cardioIncline, 0, "full backup keeps outdoor preset incline zero");
  expectEqual(backedUpRecord?.goalSnapshot?.cardioIncline, 0, "full backup keeps Records outdoor basis incline zero");
}

async function scenarioFullRestoreReloadReexport({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const original = await exportFullBackup(page);
  expectDeepEqual(original.json.data.todayCalculationValues, {}, "D export omits automatic latest-InBody and default-cardio materialization");
  expectEqual(original.json.data.cardioPresets.defaultId, DEFAULT_CARDIO_PRESET_ID, "D export includes the actual default cardio preset");
  expectEqual(original.json.data.inbodyRecords.at(-1)?.date, TODAY, "D export includes the latest InBody record");
  await setFakeNow(page, CROSS_DAY_NOW);
  await replaceRawTarget(page, {
    height: 190,
    records: [makeRecord(CONFLICT_DATE, "복원 전 임시 기록", { offset: 7 })]
  });
  await openSettings(page);
  expectEqual(await page.locator("#height").inputValue(), "190", "target Settings visibly differs before restore");
  await assertVisibleRecord(page, CONFLICT_DATE, "복원 전 임시 기록", "target record is visible before restore");

  await importFullPreview(page, original);
  const previewText = await page.locator("#dataImportConfirmOverlay").innerText();
  expectTrue(previewText.includes("아직 복원되지 않았습니다") && previewText.includes("전체 복원"), "full restore uses the visible preview before applying", previewText);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await assertFeedback(page, "전체 백업을 복원했습니다", "full restore reports success");
  expectEqual(await page.locator("#height").inputValue(), "173", "full restore applies Settings to visible inputs");
  await assertVisibleRecord(page, CONFLICT_DATE, "현재 기준 기록", "full restore applies Korean record to visible DOM");
  await assertCrossDayAutomaticDefaultsVisible(page, "D+1 restore render");

  await reloadApp(page);
  expectEqual(await page.locator("#height").inputValue(), "173", "full restore Settings survive reload");
  await assertVisibleRecord(page, CONFLICT_DATE, "현재 기준 기록", "full restore record survives reload");
  await assertCrossDayAutomaticDefaultsVisible(page, "D+1 reload");
  await setFakeNow(page, NOW);
  const reexported = await exportFullBackup(page);
  expectEqual(reexported.json.createdAt, original.json.createdAt, "cross-day re-export uses the same createdAt oracle");
  expectDeepEqual(reexported.json.data.todayCalculationValues, original.json.data.todayCalculationValues, "D+1 automatic runtime defaults never become backup Today authority");
  expectDeepEqual(reexported.json, original.json, "full restore reload re-export roundtrip");
  expectTrue(reexported.text.includes("현재 기준 기록") && reexported.text.includes("김치와 현미밥"), "roundtrip re-export keeps Korean bytes");

  await setFakeNow(page, CROSS_DAY_NOW);
  await replaceRawTodayDrafts(page, explicitTodayDrafts, { reload: true });
  const explicit = await exportFullBackup(page);
  assertExplicitTodayOverrides(explicit.json.data.todayCalculationValues, "actual explicit override export");
  await replaceRawTodayDrafts(page, {}, { reload: true });
  await importFullPreview(page, explicit);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await reloadApp(page);
  const explicitReexported = await exportFullBackup(page);
  expectEqual(explicitReexported.json.createdAt, explicit.json.createdAt, "explicit override re-export keeps the same createdAt");
  assertExplicitTodayOverrides(explicitReexported.json.data.todayCalculationValues, "restored explicit override re-export");
  expectDeepEqual(explicitReexported.json.data.todayCalculationValues, explicit.json.data.todayCalculationValues, "explicit user preset latest and record overrides round-trip exactly");

  await setSettingsExerciseProfileViaUi(page, "running");
  await openTodayQuickEdit(page);
  expectEqual(await page.locator("#todayQuickExerciseProfile").inputValue(), "running", "candidate A Today starts from candidate running Settings");
  await page.locator("#todayQuickRoutineSession").selectOption("running_long");
  await page.waitForFunction(({ key, date }) => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "{}")[date];
      return draft?.todayExerciseProfile === "running"
        && draft?.todayProfileSession === "running_long"
        && draft?.todayRoutineSession === "running_long";
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}todayCalculationDrafts.v1`, date: CROSS_DAY_TODAY });
  const profileCandidate = await exportFullBackup(page);
  const candidateToday = profileCandidate.json.data.todayCalculationValues[CROSS_DAY_TODAY];
  expectEqual(profileCandidate.json.data.settings.exerciseProfile, "running", "candidate A export owns running Settings context");
  expectTrue(
    candidateToday?.todayExerciseProfile === "running"
      && candidateToday?.todayProfileSession === "running_long"
      && candidateToday?.todayRoutineSession === "running_long",
    "candidate A export owns a coherent running Today context",
    formatValue(candidateToday)
  );

  await setSettingsExerciseProfileViaUi(page, "bodybuilding");
  await replaceRawTodayDrafts(page, {}, { reload: true });
  await openSettingsTrainingGroup(page);
  expectEqual(await page.locator("#exerciseProfile").inputValue(), "bodybuilding", "local B Settings profile differs before candidate validation");
  await openTodayQuickEdit(page);
  expectEqual(await page.locator("#todayQuickExerciseProfile").inputValue(), "bodybuilding", "local B Today context differs before candidate validation");

  await importFullPreview(page, profileCandidate);
  const profilePreview = await page.locator("#dataImportConfirmOverlay").innerText();
  expectTrue(profilePreview.includes("아직 복원되지 않았습니다") && profilePreview.includes("전체 복원"), "candidate validation uses candidate Settings instead of local B exercise profile", profilePreview);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await assertFeedback(page, "전체 백업을 복원했습니다", "different-profile candidate restore reports success");
  await reloadApp(page);
  await openSettingsTrainingGroup(page);
  expectEqual(await page.locator("#exerciseProfile").inputValue(), "running", "candidate running Settings survive restore and reload");
  await openTodayQuickEdit(page);
  expectEqual(await page.locator("#todayQuickExerciseProfile").inputValue(), "running", "candidate running Today profile survives restore and reload");
  expectEqual(await page.locator("#todayQuickRoutineSession").inputValue(), "running_long", "candidate running Today session survives restore and reload");
  const profileReexported = await exportFullBackup(page);
  expectEqual(profileReexported.json.createdAt, profileCandidate.json.createdAt, "different-profile re-export keeps the same createdAt");
  expectDeepEqual(profileReexported.json, profileCandidate.json, "candidate Settings and Today context round-trip independently of local exercise profile");
}

async function scenarioInvalidVersionAndSchemaByteNoop({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const valid = await exportFullBackup(page);
  expectEqual(valid.json.data.onboardingCompletedVersion, 1, "valid current full export carries explicit onboarding completion authority");
  const beforeDom = await visibleAuthorityDomSnapshot(page);
  const before = await rawStorageSnapshot(page);

  const invalidVersion = { ...valid.json, backupVersion: FULL_BACKUP_VERSION - 1 };
  await chooseImportFile(page, "full", {
    name: "invalid-version.json",
    buffer: Buffer.from(JSON.stringify(invalidVersion), "utf8")
  });
  await assertFeedback(page, "현재 데이터는 변경하지 않았습니다", "invalid version visibly fails closed");
  expectTrue(!(await page.locator("#dataImportConfirmOverlay").isVisible()), "invalid version never opens a confirmation modal");
  expectDeepEqual(await visibleAuthorityDomSnapshot(page), beforeDom, "invalid version is a visible authority DOM byte-noop");
  expectDeepEqual(await rawStorageSnapshot(page), before, "invalid version is a raw-storage byte-noop");

  const invalidSchema = { ...valid.json, unexpectedCurrentField: true };
  await chooseImportFile(page, "full", {
    name: "invalid-schema.json",
    buffer: Buffer.from(JSON.stringify(invalidSchema), "utf8")
  });
  await assertFeedback(page, "현재 데이터는 변경하지 않았습니다", "invalid schema visibly fails closed");
  expectTrue(!(await page.locator("#dataImportConfirmOverlay").isVisible()), "invalid schema never opens a confirmation modal");
  expectDeepEqual(await visibleAuthorityDomSnapshot(page), beforeDom, "invalid schema is a visible authority DOM byte-noop");
  expectDeepEqual(await rawStorageSnapshot(page), before, "invalid schema is a raw-storage byte-noop");

  const invalidOnboarding = JSON.parse(JSON.stringify(valid.json));
  invalidOnboarding.data.onboardingCompletedVersion = null;
  await chooseImportFile(page, "full", {
    name: "invalid-onboarding-null.json",
    buffer: Buffer.from(JSON.stringify(invalidOnboarding), "utf8")
  });
  await assertFeedback(page, "현재 데이터는 변경하지 않았습니다", "null onboarding completion visibly fails closed before preview");
  expectTrue(!(await page.locator("#dataImportConfirmOverlay").isVisible()), "null onboarding completion never opens a confirmation modal");
  expectDeepEqual(await visibleAuthorityDomSnapshot(page), beforeDom, "null onboarding completion is a visible authority DOM byte-noop");
  expectDeepEqual(await rawStorageSnapshot(page), before, "null onboarding completion is a raw-storage byte-noop");
  await assertVisibleRecord(page, CONFLICT_DATE, "현재 기준 기록", "invalid files leave visible record unchanged");
}

async function prepareSmartRestore(page, backupMarker){
  const backup = await exportFullBackup(page);
  expectTrue(backup.text.includes(backupMarker), "smart restore backup contains its literal marker", backupMarker);
  await replaceRawTarget(page, {
    height: 181,
    records: [
      makeRecord(CONFLICT_DATE, "현재 브라우저 충돌", { offset: 3, mealId: SHARED_SMART_MEAL_ID }),
      makeRecord(LOCAL_ONLY_DATE, "현재 브라우저 전용", { offset: 4 })
    ]
  });
  await importFullPreview(page, backup);
  const previewText = await page.locator("#dataImportConfirmOverlay").innerText();
  expectTrue(previewText.includes("같은 날짜 기록 1일") && previewText.includes("충돌 확인") && previewText.includes("추가 기록만 가져오기"), "smart restore preview shows the literal conflict scope", previewText);
  await page.locator("#dataImportConfirmOverlay [data-smart-restore-import]").click();
  await page.waitForFunction(() => (
    (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes("같은 날짜 기록이 있습니다")
  ));
  return backup;
}

async function scenarioSmartKeep({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const backup = await prepareSmartRestore(page, "백업 충돌 기록");
  const conflictText = await page.locator("#dataImportConfirmOverlay").innerText();
  expectTrue(conflictText.includes("현재 기록 유지") && conflictText.includes("백업 기록으로 교체"), "smart keep conflict choices are visible", conflictText);
  await page.locator("#dataImportConfirmOverlay [data-smart-conflict-mode='keep']").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await assertFeedback(page, "현재 기록 유지", "smart keep reports its visible conflict policy");

  const records = await rawRecords(page);
  expectEqual(recordByDate(records, CONFLICT_DATE)?.note, "현재 브라우저 충돌 · 한글 메모", "smart keep preserves the local conflict byte value");
  expectTrue(recordByDate(records, LOCAL_ONLY_DATE)?.note.includes("현재 브라우저 전용"), "smart keep preserves local-only record");
  expectTrue(recordByDate(records, BACKUP_ONLY_DATE)?.note.includes("백업 전용 기록"), "smart keep adds backup-only record");
  expectEqual(await page.locator("#height").inputValue(), "181", "smart keep preserves visible Settings");
  await assertVisibleRecord(page, CONFLICT_DATE, "현재 브라우저 충돌", "smart keep displays the local conflict");
  await assertVisibleRecord(page, BACKUP_ONLY_DATE, "백업 전용 기록", "smart keep displays the added backup-only record");

  await importFullPreview(page, backup);
  await page.locator("#dataImportConfirmOverlay [data-smart-restore-import]").click();
  await page.waitForFunction(() => (
    (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes("같은 날짜 기록이 있습니다")
  ));
  await page.locator("#dataImportConfirmOverlay [data-smart-conflict-mode='meals']").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await assertFeedback(page, "식사만 합치기", "smart meals reports its visible conflict policy");

  let mergedRecord = recordByDate(await rawRecords(page), CONFLICT_DATE);
  expectEqual(mergedRecord?.meals?.length, 2, "smart meals keeps both different meals despite their incoming ID collision");
  expectEqual(new Set(mergedRecord.meals.map(meal => meal.id)).size, 2, "smart meals assigns unique persisted meal IDs");
  expectTrue(mergedRecord.meals.some(meal => meal.memo.includes("현재 브라우저 충돌")), "smart meals keeps the local meal body");
  expectTrue(mergedRecord.meals.some(meal => meal.memo.includes("백업 충돌 기록")), "smart meals adds the different backup meal body");

  await page.locator("#tabRecords").click();
  const card = page.locator(`[data-record-card-date="${CONFLICT_DATE}"]`);
  await card.waitFor({ state: "visible" });
  await card.click();
  let detail = page.locator(`[data-record-detail-date="${CONFLICT_DATE}"]`);
  await detail.waitFor({ state: "visible" });
  await detail.locator(`[data-edit-record-date="${CONFLICT_DATE}"]`).click();
  detail = page.locator(`[data-record-detail-date="${CONFLICT_DATE}"][data-record-detail-edit="true"]`);
  await detail.waitFor({ state: "visible" });
  const mealsSection = detail.locator('[data-record-detail-section="meals"]');
  if (!(await mealsSection.evaluate(element => element.open))) await mealsSection.locator(":scope > summary").click();
  const backupMealRowIndex = await detail.locator("[data-detail-meal-row]").evaluateAll(rows => (
    rows.findIndex(row => (row.querySelector('[data-detail-meal-field="memo"]')?.value || "").includes("백업 충돌 기록"))
  ));
  expectTrue(backupMealRowIndex >= 0, "smart meals backup meal is independently addressable in visible edit DOM");
  await detail.evaluate((root, mealIndex) => {
    const button = root.querySelector(`[data-detail-delete-meal="${mealIndex}"]`);
    if (!button) throw new Error(`meal delete button not found: ${mealIndex}`);
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      button.click();
    } finally {
      window.confirm = originalConfirm;
    }
  }, backupMealRowIndex);
  await detail.locator(`[data-detail-save="${CONFLICT_DATE}"]`).click();
  await page.waitForFunction(({ key, date }) => {
    try {
      const record = JSON.parse(localStorage.getItem(key) || "[]").find(item => item.date === date);
      return record?.meals?.length === 1 && record.meals[0].memo.includes("현재 브라우저 충돌");
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}records`, date: CONFLICT_DATE });
  mergedRecord = recordByDate(await rawRecords(page), CONFLICT_DATE);
  expectEqual(mergedRecord.meals.length, 1, "deleting the imported meal preserves the other colliding-ID meal");

  await reloadApp(page);
  mergedRecord = recordByDate(await rawRecords(page), CONFLICT_DATE);
  expectEqual(mergedRecord?.meals?.length, 1, "smart meals delete persists across reload");
  expectTrue(mergedRecord.meals[0].memo.includes("현재 브라우저 충돌"), "the surviving local meal body persists across reload");
}

async function scenarioSmartReplace({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await prepareSmartRestore(page, "백업 충돌 기록");
  await page.locator("#dataImportConfirmOverlay [data-smart-conflict-mode='replace']").click();
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "hidden", timeout: 10000 });
  await assertFeedback(page, "백업 기록으로 교체", "smart replace reports its visible conflict policy");

  const records = await rawRecords(page);
  expectEqual(recordByDate(records, CONFLICT_DATE)?.note, "백업 충돌 기록 · 한글 메모", "smart replace uses the backup conflict byte value");
  expectTrue(recordByDate(records, LOCAL_ONLY_DATE)?.note.includes("현재 브라우저 전용"), "smart replace preserves local-only record");
  expectTrue(recordByDate(records, BACKUP_ONLY_DATE)?.note.includes("백업 전용 기록"), "smart replace adds backup-only record");
  expectEqual(await page.locator("#height").inputValue(), "181", "smart replace preserves visible Settings");
  await assertVisibleRecord(page, CONFLICT_DATE, "백업 충돌 기록", "smart replace displays the backup conflict");
}

async function expectFailedRestoreNoop(page, { before, overlayBefore, current, label }){
  await assertFeedback(page, "현재 데이터는 변경하지 않았습니다", `${label} reports fail-closed status`);
  expectDeepEqual(await rawStorageSnapshot(page), before, `${label} restores every raw storage byte`);
  expectDeepEqual(await pendingOverlaySnapshot(page), overlayBefore, `${label} preserves the pending import and visible overlay`);
  const fault = await storageFaultState(page);
  expectTrue(fault.plan?.consumed === true, `${label} consumes the requested one-shot fault`, formatValue(fault));
  expectEqual(await page.locator("#height").inputValue(), String(current.height), `${label} keeps B Settings in memory before closing pending import`);
  await cancelImport(page);
  expectDeepEqual(await rawStorageSnapshot(page), before, `${label} stays byte-identical after closing the modal`);
  await assertCurrentBState(page, current, `${label} immediate runtime`);

  await openSettings(page);
  const durableBefore = await rawStorageSnapshot(page);
  await reloadApp(page);
  expectDeepEqual(await rawStorageSnapshot(page), durableBefore, `${label} keeps durable B bytes after reload`);
  const reloadedOverlay = await pendingOverlaySnapshot(page);
  expectTrue(!reloadedOverlay.visible && reloadedOverlay.ariaHidden === "true" && !reloadedOverlay.bodyText, `${label} clears transient pending import on reload`, formatValue(reloadedOverlay));
  await assertCurrentBState(page, current, `${label} reloaded runtime`);
  return fault;
}

async function scenarioSetItemFailureRollbackMatrix({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const full = await exportFullBackup(page);
  const recordsOnly = await exportRecordsBackup(page);
  const current = await prepareDistinctCurrentStateB(page);
  assertCandidateADiffersFromB(full, recordsOnly, current);

  await importFullPreview(page, full);
  let before = await rawStorageSnapshot(page);
  let overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "setItem", `${STORAGE_PREFIX}todayCalculationDrafts.v1`);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "full restore setItem fault" });

  await importFullPreview(page, full);
  await page.locator("#dataImportConfirmOverlay [data-smart-restore-import]").click();
  await page.waitForFunction(() => (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes("같은 날짜 기록이 있습니다"));
  before = await rawStorageSnapshot(page);
  overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "setItem", `${STORAGE_PREFIX}inbodyRecords`);
  await page.locator("#dataImportConfirmOverlay [data-smart-conflict-mode='replace']").click();
  await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "smart replace setItem fault" });

  await importRecordsPreview(page, recordsOnly);
  before = await rawStorageSnapshot(page);
  overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "setItem", `${STORAGE_PREFIX}inbodyRecords`);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "records-only restore setItem fault" });
}

async function scenarioRemoveItemAndRollbackRemoveMatrix({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const full = await exportFullBackup(page);
  const recordsOnly = await exportRecordsBackup(page);
  const current = await prepareDistinctCurrentStateB(page);
  assertCandidateADiffersFromB(full, recordsOnly, current);

  await importFullPreview(page, full);
  let before = await rawStorageSnapshot(page);
  let overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "removeItem", `${STORAGE_PREFIX}cardioPresets.v1`);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  const fullFault = await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "full restore removeItem fault" });
  expectTrue(fullFault.operationLog.some(item => item.method === "removeItem" && item.key === `${STORAGE_PREFIX}cardioPresets.v1` && item.failed), "full restore directly exercises one-shot removeItem failure", formatValue(fullFault));

  await importFullPreview(page, full);
  await page.locator("#dataImportConfirmOverlay [data-smart-restore-import]").click();
  await page.waitForFunction(() => (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes("같은 날짜 기록이 있습니다"));
  before = await rawStorageSnapshot(page);
  overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "setItem", `${STORAGE_PREFIX}inbodyRecords`);
  await page.locator("#dataImportConfirmOverlay [data-smart-conflict-mode='replace']").click();
  await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "smart replace second-write fault after removeItem case" });

  await importRecordsPreview(page, recordsOnly);
  before = await rawStorageSnapshot(page);
  overlayBefore = await pendingOverlaySnapshot(page);
  await armStorageFault(page, "setItem", `${STORAGE_PREFIX}inbodyRecords`);
  await page.locator("#dataImportConfirmOverlay [data-confirm-data-import]").click();
  await expectFailedRestoreNoop(page, { before, overlayBefore, current, label: "records-only second-write fault after removeItem case" });
}

const backupSeed = storage({
  ...recordsStorage([
    makeRecord(CONFLICT_DATE, "백업 충돌 기록", { offset: 8, mealId: SHARED_SMART_MEAL_ID }),
    makeRecord(BACKUP_ONLY_DATE, "백업 전용 기록", { offset: 9 })
  ])
});

const crossDaySeed = storage({
  [`${STORAGE_PREFIX}inbodyRecords`]: JSON.stringify([
    explicitRecordInbody,
    explicitLatestInbody,
    crossDayLatestInbody
  ]),
  [`${STORAGE_PREFIX}cardioPresets.v1`]: JSON.stringify({
    items: [defaultCardioPreset],
    defaultId: DEFAULT_CARDIO_PRESET_ID
  }),
  [`${STORAGE_PREFIX}todayCalculationDrafts.v1`]: "{}"
});

const faultCandidateSeed = storage({
  ...recordsStorage([
    makeRecord(CONFLICT_DATE, "후보 A 기록", { offset: 2 })
  ]),
  [`${STORAGE_PREFIX}inbodyRecords`]: JSON.stringify([
    makeInbodyRecord(FAULT_INBODY_DATE, {
      weight: 74,
      skeletalMuscle: 34,
      bodyFat: 11.1,
      bodyFatPercent: 15
    })
  ])
});

const scenarios = [
  {
    name: "A3-E2E-01 actual full-v2 and records-v4 downloads keep exact envelopes and Korean UTF-8",
    seed: storage(),
    run: scenarioExportEnvelopeAndKorean
  },
  {
    name: "A3-E2E-02 cross-day full restore keeps automatic runtime defaults outside exact backup authority",
    seed: crossDaySeed,
    run: scenarioFullRestoreReloadReexport
  },
  {
    name: "A3-E2E-03 invalid full version schema and null onboarding authority are storage and DOM byte-noops",
    seed: storage(),
    run: scenarioInvalidVersionAndSchemaByteNoop
  },
  {
    name: "A3-E2E-04 smart keep and meals preserve conflicts with unique durable meal IDs",
    seed: backupSeed,
    run: scenarioSmartKeep
  },
  {
    name: "A3-E2E-05 smart replace replaces conflicts and preserves unrelated local records",
    seed: backupSeed,
    run: scenarioSmartReplace
  },
  {
    name: "A3-E2E-06 one-shot setItem failures roll back full smart and records-only restores",
    seed: faultCandidateSeed,
    run: scenarioSetItemFailureRollbackMatrix
  },
  {
    name: "A3-E2E-07 removeItem failure and repeated restore faults preserve distinct current state",
    seed: faultCandidateSeed,
    run: scenarioRemoveItemAndRollbackRemoveMatrix
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
    if (!selectedScenarios.length) throw new Error(`no A3 E2E scenario matched: ${scenarioFilter}`);
    for (const scenario of selectedScenarios) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        acceptDownloads: true
      });
      const consoleErrors = [];
      const pageErrors = [];
      context.on("page", currentPage => {
        currentPage.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        currentPage.on("pageerror", error => pageErrors.push(error.message || String(error)));
      });
      await installSeedClockAndStorageFaults(context, scenario.seed);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const startedAt = Date.now();
      try {
        await scenario.run({ page, context, baseUrl });
        await sleep(100);
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
    contract: "a3-current-backup-restore-safety-e2e-v1",
    oracle: "actual DOM buttons/file inputs/downloads plus literal visible DOM and raw localStorage; no production helper stimulus",
    fullBackupVersion: FULL_BACKUP_VERSION,
    recordsBackupVersion: RECORDS_BACKUP_VERSION,
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
