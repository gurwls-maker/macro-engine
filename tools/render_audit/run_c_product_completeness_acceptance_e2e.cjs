const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_PREFIX = "runstep_macro_v1_";
const FAKE_NOW_KEY = "__macro_engine_c_fake_now__";
const SEED_MARKER_KEY = "__macro_engine_c_seeded__";
const NOW = "2026-08-14T00:30:00+09:00";
const NOW_UTC = "2026-08-13T15:30:00.000Z";
const TODAY = "2026-08-14";
const YESTERDAY = "2026-08-13";
const OLDER = "2026-08-12";
const CURRENT_SCORING_VERSION = "v8.4_joint_axis_retired_continuous_macro_score_v1";
const FULL_BACKUP_VERSION = 2;
const RECORDS_BACKUP_VERSION = 4;

// These values are deliberately test-owned literals. Do not derive them from
// product option maps, copy helpers, date helpers, or score helpers.
const C_LITERAL_ORACLE = Object.freeze({
  completionConfirm: `${TODAY} 식사 기록을 완료할까요?\n완료하면 저장된 계산 기준의 점수를 확정하고 기간 분석과 Coach 근거에 사용합니다.`,
  reopenConfirm: `${TODAY} 기록을 다시 작성 중으로 바꿀까요?\n저장된 완료 점수와 기간 분석 권한은 해제되며, 식사와 계산 기준은 유지됩니다.`,
  completedCoachSummary: "오늘 식사 기록을 완료했고 86점으로 저장했어요.",
  completedCoachReason: "오늘 먹은 내용을 모두 기록했다고 확인한 상태입니다.",
  draftCoachReason: "아직 하루 전체를 판단하기엔 기록이 적어요.",
  draftCoachAction: "다음 식사까지 기록하면 오늘 식단의 우선순위를 더 정확히 정리해드릴게요.",
  memoOnlyCopy: "메모만 저장된 상태라 영양값이 있는 식사를 기록하기 전에는 완료하거나 점수를 만들지 않습니다.",
  jsonHeading: "기록만 백업 (JSON)",
  backupNudgeTitle: "백업 권장",
  backupNudgeCopy: "최근 기록이 쌓였습니다. 기본 설정의 데이터 관리에서 전체 백업을 만들어 두면 기록과 설정을 함께 보관할 수 있습니다.",
  resetButton: "전체 데이터 삭제",
  resetConfirm: [
    "전체 데이터를 삭제할까요?",
    "기본 설정, Today 계산값, Records의 식사·체중·메모, InBody 측정 기록, 유산소 프리셋, 저장한 식사, 온보딩 완료 상태와 백업 저장 폴더 연결이 모두 삭제됩니다.",
    "삭제한 데이터는 되돌릴 수 없습니다. 필요하면 먼저 전체 백업을 만들어 주세요."
  ].join("\n\n"),
  resetDirectoryReadFailure: "백업 저장 폴더 연결 상태를 확인하지 못해 전체 데이터 삭제를 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.",
  resetStorageFailure: "브라우저 저장소를 지우지 못해 전체 데이터 삭제를 중단했습니다. 기존 데이터는 복구했으며 다시 시도할 수 있습니다.",
  resetDirectoryClearFailure: "백업 저장 폴더 연결을 해제하지 못해 전체 데이터 삭제를 중단했습니다. 기존 데이터는 그대로 유지했으며 다시 시도할 수 있습니다.",
  resetRuntimeFailure: "전체 데이터 삭제를 완료하지 못해 기존 상태로 되돌렸습니다. 다시 시도할 수 있습니다.",
  inbodyDeleteConfirm: `${TODAY} InBody 측정 기록을 삭제할까요?\n이 측정값을 Today에 적용해 둔 값은 삭제되지 않고 기존 적용값으로 유지됩니다.\n삭제한 측정 기록은 되돌릴 수 없습니다.`,
  inbodyStaleSource: "기존 적용값 유지 · 해당 InBody 기록 변경 또는 삭제 · 2026.08.14",
  defaultCardioSource: "프리셋에서 시작함 · C 기본 워킹",
  cardioPresetDeleteConfirm: [
    "“C 기본 워킹” 유산소 프리셋을 삭제할까요?",
    "기본 프리셋 지정도 함께 해제되며, 새 날짜에는 더 이상 자동 적용되지 않습니다. 이미 Today에 적용된 값은 삭제되지 않고 유지됩니다.",
    "삭제한 프리셋은 되돌릴 수 없습니다."
  ].join("\n\n"),
  cardioPresetDeleteFeedback: "“C 기본 워킹” 유산소 프리셋을 삭제했습니다. 이미 Today에 적용된 값은 유지됩니다.",
  mealTemplateName: "점심 663kcal",
  mealTemplateDeleteConfirm: [
    "“점심 663kcal” 저장한 식사를 삭제할까요?",
    "저장 바로가기만 삭제되며, 이미 Records에 저장한 식사와 현재 입력칸에 불러온 값은 삭제되지 않고 유지됩니다.",
    "삭제한 저장 식사는 되돌릴 수 없습니다."
  ].join("\n\n"),
  mealTemplateDeleteFeedback: "“점심 663kcal” 저장 바로가기를 삭제했습니다. 기존 Records 식사는 유지됩니다.",
  yesterdayReuse: "어제 · 2026-08-13",
  olderReuse: "08-12 · 2026-08-12"
});

const CURRENT_PROFILE_STORAGE = Object.freeze({
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
  [`${STORAGE_PREFIX}exerciseManagementMode`]: "general",
  [`${STORAGE_PREFIX}exerciseProfile`]: "general",
  [`${STORAGE_PREFIX}weeklyTrainingDays`]: "0",
  [`${STORAGE_PREFIX}weeklyTrainingDaysManual`]: "false",
  [`${STORAGE_PREFIX}generalAdvancedSettings`]: "false",
  [`${STORAGE_PREFIX}generalLowDigestCarbs`]: "false",
  [`${STORAGE_PREFIX}adaptiveMacroTargetsEnabled`]: "true",
  [`${STORAGE_PREFIX}proteinTargetLevel`]: "medium",
  [`${STORAGE_PREFIX}routinePlan`]: "general",
  [`${STORAGE_PREFIX}routine`]: "REST",
  [`${STORAGE_PREFIX}intensityOverride`]: "0.7",
  [`${STORAGE_PREFIX}weightDuration`]: "0",
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
  return { ...CURRENT_PROFILE_STORAGE, ...overrides };
}

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

async function installSeedAndClock(context, initialStorage, fakeNowIso = NOW){
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
      // about:blank has no usable localStorage; this script runs again for index.html.
    }
    // Headless Chromium has no native picker UI. This selects the product's
    // supported download fallback; the actual Blob/download producer still runs.
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined
    });
    // Faults are injected below the product layer. The runner never calls a
    // product reset/restore helper and never uses product output as the oracle.
    // Every arm is one-shot so the product's own rollback can run normally.
    if (!window.__cAcceptanceFaults) {
      const state = {
        storageRemoveKey: null,
        idbOpenFailure: false,
        idbDeleteMode: null,
        idbDeleteStarted: false,
        idbDelayReleased: true,
        idbDelayFailure: false,
        runtimeGetById: null
      };
      const control = {
        armStorageRemove(key){
          state.storageRemoveKey = String(key || "");
        },
        armIdbOpenFailure(){
          state.idbOpenFailure = true;
        },
        armIdbDeleteFailure(){
          state.idbDeleteMode = "fail";
          state.idbDeleteStarted = false;
          state.idbDelayReleased = true;
          state.idbDelayFailure = false;
        },
        armIdbDeleteDelay(){
          state.idbDeleteMode = "delay";
          state.idbDeleteStarted = false;
          state.idbDelayReleased = false;
          state.idbDelayFailure = false;
        },
        armIdbDeleteDelayFailure(){
          state.idbDeleteMode = "delay-fail";
          state.idbDeleteStarted = false;
          state.idbDelayReleased = false;
          state.idbDelayFailure = true;
        },
        releaseIdbDeleteDelay(){
          state.idbDelayReleased = true;
        },
        armRuntimeGetById(id){
          state.runtimeGetById = String(id || "");
        },
        snapshot(){
          return { ...state };
        }
      };
      Object.defineProperty(window, "__cAcceptanceFaults", {
        configurable: false,
        enumerable: false,
        value: control
      });

      const nativeRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(key){
        const normalizedKey = String(key);
        if (state.storageRemoveKey && normalizedKey === state.storageRemoveKey) {
          state.storageRemoveKey = null;
          throw new Error("C_E2E_STORAGE_REMOVE_ONCE");
        }
        return nativeRemoveItem.call(this, key);
      };

      if (typeof IDBFactory !== "undefined") {
        const nativeOpen = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function(...args){
          if (state.idbOpenFailure) {
            state.idbOpenFailure = false;
            throw new Error("C_E2E_IDB_OPEN_ONCE");
          }
          return nativeOpen.apply(this, args);
        };
      }

      if (typeof IDBObjectStore !== "undefined") {
        const nativeDelete = IDBObjectStore.prototype.delete;
        const nativeGet = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.delete = function(...args){
          if (state.idbDeleteMode === "fail") {
            state.idbDeleteMode = null;
            state.idbDeleteStarted = true;
            throw new Error("C_E2E_IDB_DELETE_ONCE");
          }
          const request = nativeDelete.apply(this, args);
          if (state.idbDeleteMode === "delay" || state.idbDeleteMode === "delay-fail") {
            state.idbDeleteMode = null;
            state.idbDeleteStarted = true;
            const store = this;
            const keepTransactionAlive = () => {
              if (state.idbDelayReleased) {
                if (state.idbDelayFailure) {
                  state.idbDelayFailure = false;
                  try {
                    store.transaction.abort();
                  } catch (_error) {
                    // The next transaction event remains the product-visible authority.
                  }
                }
                return;
              }
              let keepAliveRequest;
              try {
                keepAliveRequest = nativeGet.call(store, "__c_acceptance_keep_alive__");
              } catch (_error) {
                return;
              }
              keepAliveRequest.onsuccess = keepTransactionAlive;
              keepAliveRequest.onerror = keepTransactionAlive;
            };
            keepTransactionAlive();
          }
          return request;
        };
      }

      const nativeGetElementById = Document.prototype.getElementById;
      Document.prototype.getElementById = function(id){
        const normalizedId = String(id);
        if (state.runtimeGetById && normalizedId === state.runtimeGetById) {
          state.runtimeGetById = null;
          throw new Error("C_E2E_RUNTIME_RENDER_ONCE");
        }
        return nativeGetElementById.call(this, id);
      };
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
    function CAcceptanceDate(...args){
      if (!(this instanceof CAcceptanceDate)) return new NativeDate(readNow()).toString();
      return args.length ? new NativeDate(...args) : new NativeDate(readNow());
    }
    CAcceptanceDate.prototype = NativeDate.prototype;
    Object.setPrototypeOf(CAcceptanceDate, NativeDate);
    CAcceptanceDate.now = readNow;
    CAcceptanceDate.parse = NativeDate.parse;
    CAcceptanceDate.UTC = NativeDate.UTC;
    window.Date = CAcceptanceDate;
  }, {
    seed: initialStorage,
    fakeNowIso,
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

async function reloadApp(page){
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => (
    !!document.getElementById("tabToday")
    && !document.body.classList.contains("app-booting")
  ), null, { timeout: 90000 });
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

async function expectTextExact(locator, expected, label){
  await locator.waitFor({ state: "visible" });
  expectEqual((await locator.innerText()).trim(), expected, label);
}

async function rawPrefixedStorage(page){
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
    throw new Error(`records is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function rawInbodyRecords(page){
  const raw = await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}inbodyRecords`);
  try {
    return JSON.parse(raw || "[]");
  } catch (error) {
    throw new Error(`InBody records is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function rawTodayDrafts(page){
  const raw = await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}todayCalculationDrafts.v1`);
  try {
    return JSON.parse(raw || "{}");
  } catch (error) {
    throw new Error(`Today drafts is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function rawCardioPresets(page){
  const raw = await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}cardioPresets.v1`);
  try {
    return JSON.parse(raw || "{\"items\":[],\"defaultId\":null}");
  } catch (error) {
    throw new Error(`cardio presets is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function rawMealTemplates(page){
  const raw = await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}mealTemplates.v1`);
  try {
    return JSON.parse(raw || "{\"items\":[]}");
  } catch (error) {
    throw new Error(`meal templates is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function recordFor(page, date){
  return (await rawRecords(page)).find(record => record.date === date) || null;
}

async function clickAndHandleDialog(locator, page, action){
  expectEqual(await locator.count(), 1, "native dialog trigger resolves to one element");
  await locator.waitFor({ state: "visible" });
  const dialogPromise = page.waitForEvent("dialog", { timeout: 10000 });
  const clickPromise = locator.click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  if (action === "accept") await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
  return message;
}

async function pressAndHandleDialog(locator, page, key, action){
  expectEqual(await locator.count(), 1, "native dialog keyboard trigger resolves to one element");
  await locator.waitFor({ state: "visible" });
  await locator.focus();
  const dialogPromise = page.waitForEvent("dialog", { timeout: 10000 });
  const pressPromise = locator.press(key);
  const dialog = await dialogPromise;
  const message = dialog.message();
  if (action === "accept") await dialog.accept();
  else await dialog.dismiss();
  await pressPromise;
  return message;
}

async function openSettings(page){
  await page.locator("#tabSettings").click();
  await page.locator("#dataManagementPanel").waitFor({ state: "visible" });
}

async function openSettingsGroup(page, selector){
  const group = page.locator(selector);
  const toggle = group.locator(".settings-disclosure-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  return group;
}

async function completeFreshOnboarding(page){
  const overlay = page.locator("#onboardingOverlay");
  await overlay.waitFor({ state: "visible" });
  await page.locator("#onboardingStartBtn").click();
  await page.locator("#onboardingGender").selectOption("male");
  await page.locator("#onboardingAge").fill("32");
  await page.locator("#onboardingHeight").fill("173");
  await page.locator("#onboardingWeight").fill("75");
  await page.locator("#onboardingGoal").selectOption("maintain");
  await page.locator("#onboardingNextBtn").click();
  await page.locator('.onboarding-step[data-onboarding-step="2"]').waitFor({ state: "visible" });
  await page.locator("#onboardingActivityLevel").selectOption("moderate");
  await page.locator("#onboardingWorkType").selectOption("office");
  await page.locator("#onboardingSleepHours").fill("8");
  await page.locator("#onboardingWorkHours").fill("8");
  await page.locator("#onboardingLifestyleHours").fill("2");
  await page.locator("#onboardingNextBtn").click();
  await page.locator('.onboarding-step[data-onboarding-step="3"]').waitFor({ state: "visible" });
  await page.locator('input[name="onboardingExerciseMode"][value="general"]').check();
  await page.locator("#onboardingNextBtn").click();
  await overlay.waitFor({ state: "hidden", timeout: 10000 });
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}onboardingCompletedVersion`), "1", "fresh onboarding current completion marker");
}

async function openTodayMealDialog(page){
  await page.locator("#tabToday").click();
  await page.locator("#todayRecordStartBtn").click();
  await page.locator("#todayRecordStartOverlay").waitFor({ state: "visible" });
}

async function openRecordsMealDialog(page, date){
  await page.locator("#tabRecords").click();
  const dateInput = page.locator('[data-record-detail-date-picker]:visible, #recordsWorkspaceDate:visible').first();
  await dateInput.waitFor({ state: "visible" });
  await dateInput.fill(date);
  await dateInput.dispatchEvent("change");
  await page.waitForFunction(expected => document.getElementById("recordsWorkspaceDate")?.value === expected, date);
  await page.locator("[data-open-record-meal-entry]:visible").first().click();
  await page.locator("#todayRecordStartOverlay").waitFor({ state: "visible" });
}

async function fillAndSaveOpenMealDialog(page, values = {}){
  await page.locator("#todayRecordDetailedWeight").fill(String(values.weight ?? 75));
  await page.locator("#todayRecordMealLabel").selectOption(values.label || "점심");
  const fields = [
    ["#todayRecordMealCarbs", values.carbs],
    ["#todayRecordMealProtein", values.protein],
    ["#todayRecordMealFat", values.fat],
    ["#todayRecordMealAlcoholKcal", values.alcoholKcal],
    ["#todayRecordMealOtherKcal", values.otherKcal]
  ];
  for (const [selector, value] of fields) {
    await page.locator(selector).fill(value === undefined || value === null ? "" : String(value));
  }
  await page.locator("#todayRecordMealMemo").fill(values.memo || "");
  await page.locator("#todayRecordDetailedSaveBtn").click();
  await page.waitForFunction(() => (document.getElementById("todayRecordStartFeedback")?.textContent || "").includes("식사를 저장했습니다"));
  await page.locator("#todayRecordStartOverlay [data-record-start-close]").click();
  await page.locator("#todayRecordStartOverlay").waitFor({ state: "hidden" });
}

async function addMealThroughUi(page, date, values = {}){
  if (date === TODAY) await openTodayMealDialog(page);
  else await openRecordsMealDialog(page, date);
  await fillAndSaveOpenMealDialog(page, values);
}

async function readDownload(download){
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  const content = buffer.toString("utf8");
  expectTrue(buffer.equals(Buffer.from(content, "utf8")), "download is strict UTF-8");
  expectTrue(!content.includes("\uFFFD"), "download contains no UTF-8 replacement character");
  let json;
  try {
    json = JSON.parse(content);
  } catch (error) {
    throw new Error(`download is not valid JSON: ${error.message}; text=${content.slice(0, 400)}`);
  }
  return { buffer, content, json, filename: download.suggestedFilename() };
}

async function exportWithButton(page, selector){
  await openSettings(page);
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.locator(selector).click();
  return readDownload(await downloadPromise);
}

async function setInbodyThroughUi(page, values){
  await page.locator("#tabInbody").click();
  await page.locator("#inbodyDate").fill(values.date);
  await page.locator("#inbodyWeight").fill(String(values.weight));
  await page.locator("#inbodySkeletalMuscle").fill(String(values.skeletalMuscle));
  await page.locator("#inbodyBodyFat").fill(String(values.bodyFat));
  await page.locator("#inbodyBodyFatPercent").fill(String(values.bodyFatPercent));
  await page.locator("#saveInbodyBtn").click();
  await page.waitForFunction(({ key, date }) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]").some(record => record.date === date);
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}inbodyRecords`, date: values.date });
  const keepButton = page.locator('[data-inbody-today-apply="keep"]');
  if (await keepButton.isVisible()) await keepButton.click();
}

async function createDefaultCardioPresetThroughUi(page){
  await openSettings(page);
  await openSettingsGroup(page, ".settings-training-group");
  const exerciseManagement = page.locator("#exerciseManagementMode");
  if (!(await exerciseManagement.isChecked())) {
    await exerciseManagement.check();
    await openSettingsGroup(page, ".settings-training-group");
  }
  await page.locator("#cardioPresetSettingsHost").waitFor({ state: "visible" });
  await page.locator("#cardioPresetName").fill("C 기본 워킹");
  await page.locator("#cardioPresetType").selectOption("treadmill_walk");
  await page.locator("#cardioPresetDuration").fill("35");
  await page.locator("#cardioPresetSpeed").fill("5.5");
  await page.locator("#cardioPresetIncline").fill("4");
  await page.locator("#saveCardioPresetBtn").click();
  await expectTextExact(page.locator("#cardioPresetFeedback"), "유산소 프리셋을 저장했습니다.", "current UI cardio preset save feedback");
  const row = page.locator("#cardioPresetList .cardio-preset-row").filter({ hasText: "C 기본 워킹" });
  await row.waitFor({ state: "visible" });
  expectEqual(await row.count(), 1, "current UI creates exactly one literal cardio preset");
  const id = await row.getAttribute("data-cardio-preset-id");
  expectTrue(typeof id === "string" && id.length > 0, "current UI cardio preset owns a nonempty current id");
  await row.locator("[data-cardio-preset-default]").click();
  await page.waitForFunction(({ key, id }) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}").defaultId === id;
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}cardioPresets.v1`, id });
  await expectTextExact(page.locator("#cardioPresetFeedback"), "기본 프리셋으로 지정했습니다.", "current UI default cardio feedback");
  const stored = await rawCardioPresets(page);
  const preset = stored.items.find(item => item.id === id);
  expectTrue(!!preset, "stored current default cardio preset exists");
  expectDeepEqual({
    name: preset.name,
    cardioType: preset.cardioType,
    cardioDuration: preset.cardioDuration,
    cardioSpeed: preset.cardioSpeed,
    cardioIncline: preset.cardioIncline,
    defaultId: stored.defaultId
  }, {
    name: "C 기본 워킹",
    cardioType: "treadmill_walk",
    cardioDuration: 35,
    cardioSpeed: 5.5,
    cardioIncline: 4,
    defaultId: id
  }, "current UI default cardio preset literal storage tuple");
  return { id, preset };
}

async function expectNoHorizontalOverflow(page, label){
  const metrics = await page.evaluate(() => ({
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expectTrue(metrics.htmlScrollWidth <= metrics.viewportWidth + 1, `${label} document has no horizontal overflow`, formatValue(metrics));
  expectTrue(metrics.bodyScrollWidth <= metrics.viewportWidth + 1, `${label} body has no horizontal overflow`, formatValue(metrics));
}

async function expectRectInsideViewport(page, locator, label){
  await locator.waitFor({ state: "visible" });
  const rect = await locator.evaluate(element => {
    const value = element.getBoundingClientRect();
    return {
      left: value.left,
      right: value.right,
      top: value.top,
      bottom: value.bottom,
      width: value.width,
      height: value.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expectTrue(rect.width > 0 && rect.height > 0, `${label} has geometry`, formatValue(rect));
  expectTrue(rect.left >= -1 && rect.right <= rect.viewportWidth + 1, `${label} stays within horizontal viewport`, formatValue(rect));
  expectTrue(rect.top >= -1 && rect.bottom <= rect.viewportHeight + 1, `${label} stays within vertical viewport`, formatValue(rect));
}

function expectDraftTuple(record, label){
  expectTrue(!!record, `${label} exists`);
  expectEqual(record.recordLifecycle, "draft", `${label} lifecycle`);
  expectEqual(record.adherencePercent, null, `${label} stored score`);
  expectEqual(record.adherenceSource, null, `${label} score source`);
  expectEqual(record.adherenceScoringVersion, null, `${label} scoring version`);
  expectEqual(record.adherenceLockedAt, null, `${label} score lock`);
  expectEqual(record.completedAt, null, `${label} completion time`);
  expectEqual(record.completionEvidenceSignature, null, `${label} completion evidence`);
}

function expectLiteralCompletedTuple(record, label){
  expectTrue(!!record, `${label} exists`);
  expectEqual(record.recordLifecycle, "completed", `${label} lifecycle`);
  expectEqual(record.adherencePercent, 86, `${label} literal stored score`);
  expectEqual(record.adherenceSource, "auto", `${label} score source`);
  expectEqual(record.adherenceScoringVersion, CURRENT_SCORING_VERSION, `${label} scoring version`);
  expectEqual(record.completedAt, NOW_UTC, `${label} completion time`);
  expectEqual(record.adherenceLockedAt, NOW_UTC, `${label} score lock`);
  expectTrue(typeof record.completionEvidenceSignature === "string" && record.completionEvidenceSignature.length > 0, `${label} completion evidence exists`);
}

async function completeTodayThroughUi(page){
  await page.locator("#tabToday").click();
  const button = page.locator(`[data-complete-detailed-record="${TODAY}"][data-record-action-source="today"]`);
  const message = await clickAndHandleDialog(button, page, "accept");
  expectEqual(message, C_LITERAL_ORACLE.completionConfirm, "Today completion literal confirmation");
  await page.locator(`[data-reopen-detailed-record="${TODAY}"][data-record-action-source="today"]`).waitFor({ state: "visible" });
}

async function reopenTodayThroughUi(page){
  await page.locator("#tabToday").click();
  const button = page.locator(`[data-reopen-detailed-record="${TODAY}"][data-record-action-source="today"]`);
  const message = await clickAndHandleDialog(button, page, "accept");
  expectEqual(message, C_LITERAL_ORACLE.reopenConfirm, "Today reopen literal confirmation");
  await page.locator(`[data-complete-detailed-record="${TODAY}"][data-record-action-source="today"]`).waitFor({ state: "visible" });
}

async function installLinkedBackupDirectorySentinel(page){
  // File-system directory chooser UI cannot be automated in headless Chromium.
  // A structured-cloneable sentinel in the product's real IndexedDB store lets
  // the real reset path prove rollback across both stores and the successful
  // terminal state in which the prefix and remembered-directory entry are gone.
  await page.evaluate(async () => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => { throw new DOMException("not invoked by this scenario", "AbortError"); }
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("macroEngineBackupDirectory", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("handles")) request.result.createObjectStore("handles");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("handles", "readwrite");
        transaction.objectStore("handles").put({ name: "C E2E 연결 폴더" }, "backupDirectory");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}

async function readLinkedBackupDirectorySentinel(page){
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("macroEngineBackupDirectory", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("handles")) request.result.createObjectStore("handles");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("handles", "readonly");
        const request = transaction.objectStore("handles").get("backupDirectory");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function armAcceptanceFault(page, method, argument = null){
  await page.evaluate(({ method, argument }) => {
    const control = window.__cAcceptanceFaults;
    if (!control || typeof control[method] !== "function") {
      throw new Error(`missing C acceptance fault control: ${method}`);
    }
    control[method](argument);
  }, { method, argument });
}

async function acceptResetDialog(page, label){
  const message = await clickAndHandleDialog(page.locator("#resetBtn"), page, "accept");
  expectEqual(message, C_LITERAL_ORACLE.resetConfirm, label);
}

async function expectResetFailureUi(page, expectedMessage, label){
  const feedback = page.locator("#globalDataActionFeedback");
  await page.waitForFunction(expected => (
    document.getElementById("globalDataActionFeedback")?.textContent || ""
  ).includes(expected), expectedMessage);
  await expectTextExact(feedback.locator("li"), expectedMessage, `${label} literal feedback`);
  expectTrue(await feedback.isVisible(), `${label} feedback is visible`);
  expectEqual(await feedback.getAttribute("role"), "alert", `${label} feedback role`);
  expectEqual(await feedback.getAttribute("aria-live"), "assertive", `${label} feedback live priority`);
  await page.waitForFunction(() => document.activeElement?.id === "globalDataActionFeedback");
  expectEqual(await page.locator("#app").getAttribute("aria-busy"), null, `${label} clears app busy state`);
  expectTrue(await page.locator("#app").evaluate(element => element.inert !== true), `${label} restores app interactivity`);
  expectTrue(!(await page.locator("#resetBtn").isDisabled()), `${label} re-enables reset for retry`);
}

async function importFullBackupThroughCurrentUi(page, backup, openerSelector = "#importBackupBtn"){
  if (openerSelector === "#importBackupBtn") await openSettings(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
  await page.locator(openerSelector).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: backup.filename,
    mimeType: "application/json",
    buffer: backup.buffer
  });
  const overlay = page.locator("#dataImportConfirmOverlay");
  await overlay.waitFor({ state: "visible", timeout: 10000 });
  await expectTextExact(page.locator("#dataImportConfirmTitle"), "백업을 어떻게 불러올까요?", "full restore preview literal title");
  const previewText = await overlay.innerText();
  expectTrue(previewText.includes("아직 복원되지 않았습니다") && previewText.includes("전체 복원"), "full restore remains preview-first", previewText);
  await overlay.locator("[data-confirm-data-import]").click();
  await overlay.waitFor({ state: "hidden", timeout: 15000 });
}

async function scenarioFreshCompletedMealCoachJourney({ page, baseUrl }){
  await loadApp(page, baseUrl);
  expectTrue(await page.locator("#onboardingOverlay").isVisible(), "C journey starts from actual fresh onboarding");
  await completeFreshOnboarding(page);

  await addMealThroughUi(page, TODAY, {
    label: "점심",
    carbs: 205,
    protein: 120,
    fat: 50,
    alcoholKcal: 0,
    otherKcal: 0,
    memo: "C 완료 여정 · 현미밥과 닭가슴살"
  });
  expectDraftTuple(await recordFor(page, TODAY), "fresh one-meal draft");
  const draftCoachText = await page.locator("#coachHost").innerText();
  expectTrue(draftCoachText.includes(C_LITERAL_ORACLE.draftCoachReason), "one-meal draft Coach states limited evidence", draftCoachText);
  expectTrue(draftCoachText.includes(C_LITERAL_ORACLE.draftCoachAction), "one-meal draft Coach asks for the next meal", draftCoachText);

  await completeTodayThroughUi(page);
  const completed = await recordFor(page, TODAY);
  expectLiteralCompletedTuple(completed, "fresh explicit one-meal completion");
  const todayMealText = await page.locator("#todayMealSummary").innerText();
  expectTrue(todayMealText.includes("식사 1건 · 사용자 완료"), "Today marks the literal one-meal record user-completed", todayMealText);
  expectTrue(todayMealText.includes("저장된 점수를 기간 분석에 사용합니다."), "Today grants analysis authority only after completion", todayMealText);
  expectTrue((await page.locator("#todayAdherenceContent").innerText()).includes("86점"), "Today displays the literal stored 86 score");
  const completedCoachText = await page.locator("#coachHost").textContent();
  expectTrue(completedCoachText.includes(C_LITERAL_ORACLE.completedCoachSummary), "Coach contains the literal user-completed stored-score statement", completedCoachText);
  expectTrue(completedCoachText.includes(C_LITERAL_ORACLE.completedCoachReason), "Coach contains the literal completion reason", completedCoachText);
  expectTrue(!completedCoachText.includes(C_LITERAL_ORACLE.draftCoachReason), "completed Coach removes the one-meal insufficiency contradiction", completedCoachText);
  expectTrue(!completedCoachText.includes("다음 식사"), "completed Coach removes the next-meal contradiction", completedCoachText);

  await page.locator("#tabRecords").click();
  const recordCard = page.locator(`[data-record-card-date="${TODAY}"]`);
  await recordCard.waitFor({ state: "visible" });
  const recordCardText = await recordCard.innerText();
  expectTrue(recordCardText.includes("사용자 완료") && recordCardText.includes("점수 86"), "Records shows the same completed authority and literal score", recordCardText);

  await page.locator("#tabWeekly").click();
  await page.locator("#weeklySummaryRows").waitFor({ state: "visible" });
  const weeklySummary = await page.locator("#weeklySummaryRows").innerText();
  expectTrue(/식단 기록\s*1\/7일/.test(weeklySummary), "Recent seven-day analysis counts the one explicit completion", weeklySummary);
  const recentText = await page.locator("#recentFlowPreviewHost").innerText();
  expectTrue(recentText.includes("86%"), "Recent uses the literal stored score", recentText);
  const recentDay = page.locator(`.recent-flow-daily-row[data-recent-flow-chart-date="${TODAY}"]`);
  expectEqual(await recentDay.count(), 1, "Recent owns exactly one literal current-date row");
  expectTrue((await recentDay.innerText()).includes("86점"), "Recent current-date row uses the same literal stored score");

  await reopenTodayThroughUi(page);
  expectDraftTuple(await recordFor(page, TODAY), "reopened one-meal record");
  const reopenedCoachText = await page.locator("#coachHost").innerText();
  expectTrue(reopenedCoachText.includes(C_LITERAL_ORACLE.draftCoachReason), "reopen returns Coach to limited evidence", reopenedCoachText);
  expectTrue(reopenedCoachText.includes(C_LITERAL_ORACLE.draftCoachAction), "reopen returns the next-meal action", reopenedCoachText);
  expectTrue(!reopenedCoachText.includes(C_LITERAL_ORACLE.completedCoachSummary), "reopen removes completion authority from visible Coach", reopenedCoachText);
  await reloadApp(page);
  expectDraftTuple(await recordFor(page, TODAY), "reopened record after reload");
}

async function scenarioMemoOnlyCannotComplete({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealThroughUi(page, TODAY, {
    label: "간식",
    memo: "C 메모만 기록 · 영양값 없음"
  });
  const record = await recordFor(page, TODAY);
  expectDraftTuple(record, "memo-only current record");
  expectEqual(record.meals.length, 1, "memo-only record keeps one explicit meal row");
  expectEqual(record.meals[0].carbs, 0, "memo-only carbs remain zero");
  expectEqual(record.meals[0].protein, 0, "memo-only protein remains zero");
  expectEqual(record.meals[0].fat, 0, "memo-only fat remains zero");
  expectEqual(record.meals[0].alcoholKcal, 0, "memo-only alcohol remains zero");
  expectEqual(record.meals[0].otherKcal, 0, "memo-only other kcal remains zero");
  const summaryText = await page.locator("#todayMealSummary").innerText();
  expectTrue(summaryText.includes(C_LITERAL_ORACLE.memoOnlyCopy), "Today literally explains why memo-only cannot complete", summaryText);
  expectEqual(await page.locator(`[data-complete-detailed-record="${TODAY}"]`).count(), 0, "memo-only Today exposes no completion CTA");

  await page.locator("#tabRecords").click();
  const card = page.locator(`[data-record-card-date="${TODAY}"]`);
  await card.waitFor({ state: "visible" });
  await card.click();
  await page.locator(`[data-record-detail-date="${TODAY}"]`).waitFor({ state: "visible" });
  expectEqual(await page.locator(`[data-record-detail-date="${TODAY}"] [data-complete-detailed-record="${TODAY}"]`).count(), 0, "memo-only Records exposes no completion CTA");
  expectDraftTuple(await recordFor(page, TODAY), "memo-only direct Records path");

  await reloadApp(page);
  await page.locator("#tabToday").click();
  expectDraftTuple(await recordFor(page, TODAY), "memo-only record after reload");
  expectEqual(await page.locator(`[data-complete-detailed-record="${TODAY}"]`).count(), 0, "memo-only completion CTA stays absent after reload");
  expectTrue((await page.locator("#todayMealSummary").innerText()).includes(C_LITERAL_ORACLE.memoOnlyCopy), "memo-only explanation survives reload");
}

async function scenarioJsonAndFullBackupNudge({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealThroughUi(page, TODAY, { label: "점심", carbs: 80, protein: 40, fat: 18, memo: "C 백업 오늘" });
  await addMealThroughUi(page, YESTERDAY, { label: "저녁", carbs: 75, protein: 38, fat: 17, memo: "C 백업 어제" });
  await addMealThroughUi(page, OLDER, { label: "아침", carbs: 70, protein: 36, fat: 16, memo: "C 백업 그제" });
  expectEqual((await rawRecords(page)).length, 3, "three current records are produced through actual meal UI");

  await page.locator("#tabRecords").click();
  const nudge = page.locator("#backupNudgeHost .notice");
  await page.waitForFunction(() => (document.getElementById("backupNudgeHost")?.textContent || "").includes("백업 권장"));
  const nudgeVisibility = await nudge.evaluate(element => {
    const ancestors = [];
    let current = element;
    while (current && ancestors.length < 8) {
      const style = getComputedStyle(current);
      const rect = current.getBoundingClientRect();
      ancestors.push({
        tag: current.tagName,
        id: current.id || "",
        className: typeof current.className === "string" ? current.className : "",
        hidden: current.hidden === true,
        display: style.display,
        visibility: style.visibility,
        width: rect.width,
        height: rect.height
      });
      current = current.parentElement;
    }
    const rect = element.getBoundingClientRect();
    return {
      visible: !!(rect.width && rect.height) && getComputedStyle(element).visibility !== "hidden",
      ancestors
    };
  });
  expectTrue(nudgeVisibility.visible, "full-backup nudge is actually visible in Records", formatValue(nudgeVisibility));
  const nudgeText = await nudge.innerText();
  expectTrue(nudgeText.includes(C_LITERAL_ORACLE.backupNudgeTitle), "three records show literal full-backup nudge title", nudgeText);
  expectTrue(nudgeText.includes(C_LITERAL_ORACLE.backupNudgeCopy), "three records show literal full-backup nudge scope", nudgeText);

  const cardioToDelete = await createDefaultCardioPresetThroughUi(page);
  await page.locator("#tabToday").click();
  const cardioQuickToggle = page.locator("#todayQuickEditToggle");
  if (await cardioQuickToggle.getAttribute("aria-expanded") !== "true") await cardioQuickToggle.click();
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "desktop default cardio is materially applied before source deletion");
  const appliedCardioBeforeDelete = {
    type: await page.locator("#todayQuickCardioType").inputValue(),
    duration: Number(await page.locator("#todayQuickCardioDuration").inputValue()),
    speed: Number(await page.locator("#todayQuickCardioSpeed").inputValue()),
    incline: Number(await page.locator("#todayQuickCardioIncline").inputValue())
  };
  expectDeepEqual(appliedCardioBeforeDelete, {
    type: "treadmill_walk",
    duration: 35,
    speed: 5.5,
    incline: 4
  }, "desktop default cardio literal values before source deletion");
  const recordsBeforeCardioDelete = await rawRecords(page);
  const todayBeforeCardioDelete = await rawTodayDrafts(page);

  await openSettings(page);
  await openSettingsGroup(page, ".settings-training-group");
  let cardioRow = page.locator(`#cardioPresetList [data-cardio-preset-id="${cardioToDelete.id}"]`);
  let cardioDeleteButton = cardioRow.locator("[data-cardio-preset-delete]");
  const storageBeforeCardioCancel = await rawPrefixedStorage(page);
  const cardioCancelMessage = await pressAndHandleDialog(cardioDeleteButton, page, "Enter", "dismiss");
  expectEqual(cardioCancelMessage, C_LITERAL_ORACLE.cardioPresetDeleteConfirm, "desktop keyboard cardio delete cancellation literal scope");
  expectDeepEqual(await rawPrefixedStorage(page), storageBeforeCardioCancel, "cancelled cardio delete is a byte-noop for current storage");
  expectDeepEqual(await rawRecords(page), recordsBeforeCardioDelete, "cancelled cardio delete preserves all Records");
  expectDeepEqual(await rawTodayDrafts(page), todayBeforeCardioDelete, "cancelled cardio delete preserves applied Today values");
  expectTrue(await cardioDeleteButton.evaluate(element => document.activeElement === element), "cancelled cardio delete returns focus to the same keyboard opener");

  const cardioAcceptMessage = await clickAndHandleDialog(cardioDeleteButton, page, "accept");
  expectEqual(cardioAcceptMessage, C_LITERAL_ORACLE.cardioPresetDeleteConfirm, "desktop cardio delete acceptance literal scope");
  await page.waitForFunction(key => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "{\"items\":[],\"defaultId\":null}");
      return Array.isArray(stored.items) && stored.items.length === 0 && stored.defaultId == null;
    } catch (_error) {
      return false;
    }
  }, `${STORAGE_PREFIX}cardioPresets.v1`);
  const cardioDeleteFeedback = page.locator("#cardioPresetFeedback");
  await expectTextExact(cardioDeleteFeedback, C_LITERAL_ORACLE.cardioPresetDeleteFeedback, "accepted cardio delete literal live feedback");
  expectEqual(await cardioDeleteFeedback.getAttribute("role"), "status", "accepted cardio delete feedback role");
  expectEqual(await cardioDeleteFeedback.getAttribute("aria-live"), "polite", "accepted cardio delete feedback live priority");
  await page.waitForFunction(() => document.activeElement?.id === "cardioPresetFeedback");
  expectDeepEqual(await rawRecords(page), recordsBeforeCardioDelete, "accepted cardio source deletion preserves all Records");
  expectDeepEqual(await rawTodayDrafts(page), todayBeforeCardioDelete, "accepted cardio source deletion preserves the exact applied Today draft");
  const storageAfterCardioAccept = await rawPrefixedStorage(page);
  const storageBeforeWithoutCardio = { ...storageBeforeCardioCancel };
  const storageAfterWithoutCardio = { ...storageAfterCardioAccept };
  delete storageBeforeWithoutCardio[`${STORAGE_PREFIX}cardioPresets.v1`];
  delete storageAfterWithoutCardio[`${STORAGE_PREFIX}cardioPresets.v1`];
  expectDeepEqual(storageAfterWithoutCardio, storageBeforeWithoutCardio, "accepted cardio delete changes only its owned preset storage key");
  expectDeepEqual(await rawCardioPresets(page), { items: [], defaultId: null }, "accepted cardio delete removes only the preset source");

  await page.locator("#tabToday").click();
  const retainedCardioToggle = page.locator("#todayQuickEditToggle");
  if (await retainedCardioToggle.getAttribute("aria-expanded") !== "true") await retainedCardioToggle.click();
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "deleted cardio source leaves its applied Today ownership visible");
  expectDeepEqual({
    type: await page.locator("#todayQuickCardioType").inputValue(),
    duration: Number(await page.locator("#todayQuickCardioDuration").inputValue()),
    speed: Number(await page.locator("#todayQuickCardioSpeed").inputValue()),
    incline: Number(await page.locator("#todayQuickCardioIncline").inputValue())
  }, appliedCardioBeforeDelete, "deleted cardio source leaves visible Today values unchanged");

  await openSettings(page);
  await expectTextExact(page.locator(".settings-data-secondary .section-group-head h4"), C_LITERAL_ORACLE.jsonHeading, "records-only backup visible format heading");
  const dataPanelText = await page.locator("#dataManagementPanel").innerText();
  expectTrue(!dataPanelText.includes("CSV"), "Data Management contains no false CSV format claim", dataPanelText);
  const importAccept = await page.locator("#importJsonFile").getAttribute("accept");
  expectEqual(importAccept, "application/json", "records-only import accept MIME literal");

  const recordsBackup = await exportWithButton(page, "#exportJsonBtn");
  expectEqual(recordsBackup.filename, `runstep-records-backup-${TODAY}.json`, "records-only literal JSON filename");
  expectExactFields(recordsBackup.json, ["version", "exportedAt", "records", "inbodyRecords"], "records-only v4 envelope");
  expectEqual(recordsBackup.json.version, RECORDS_BACKUP_VERSION, "records-only literal envelope version");
  expectEqual(recordsBackup.json.exportedAt, NOW_UTC, "records-only deterministic timestamp");
  expectEqual(recordsBackup.json.records.length, 3, "records-only download contains all three current records");
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastBackupAt`), null, "records-only export creates no non-authoritative backup marker");
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), null, "records-only export does not set full-backup marker");
  await page.locator("#tabRecords").click();
  await nudge.waitFor({ state: "visible" });
  expectTrue((await nudge.innerText()).includes(C_LITERAL_ORACLE.backupNudgeTitle), "records-only export leaves full-backup nudge visible");

  const fullBackup = await exportWithButton(page, "#exportFullBackupBtn");
  expectEqual(fullBackup.filename, `macro-engine-full-backup-${TODAY}.json`, "full literal JSON filename");
  expectExactFields(fullBackup.json, ["app", "kind", "backupVersion", "appVersion", "createdAt", "data"], "full backup envelope");
  expectEqual(fullBackup.json.app, "macro-engine", "full backup app identity");
  expectEqual(fullBackup.json.kind, "full-backup", "full backup kind");
  expectEqual(fullBackup.json.backupVersion, FULL_BACKUP_VERSION, "full backup version");
  expectEqual(fullBackup.json.createdAt, NOW_UTC, "full backup deterministic timestamp");
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), NOW_UTC, "successful full export sets the full-only marker");
  await page.locator("#tabRecords").click();
  expectEqual((await page.locator("#backupNudgeHost").innerText()).trim(), "", "successful full export hides the nudge");
  await reloadApp(page);
  await page.locator("#tabRecords").click();
  expectEqual((await page.locator("#backupNudgeHost").innerText()).trim(), "", "full-backup marker keeps nudge hidden after reload");
}

async function scenarioMobileResetRestoreRoundTrip({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await expectNoHorizontalOverflow(page, "mobile current app before backup");
  await addMealThroughUi(page, TODAY, {
    label: "저녁",
    carbs: 91,
    protein: 47,
    fat: 21,
    memo: "C 전체복원 식사 메모"
  });
  await setInbodyThroughUi(page, {
    date: TODAY,
    weight: 74,
    skeletalMuscle: 35,
    bodyFat: 11.1,
    bodyFatPercent: 15
  });
  await openSettings(page);
  await openSettingsGroup(page, ".settings-profile-group");
  const height = page.locator("#height");
  await height.fill("174");
  await height.dispatchEvent("input");
  await height.dispatchEvent("change");
  await page.waitForFunction(({ key, value }) => localStorage.getItem(key) === value, {
    key: `${STORAGE_PREFIX}height`,
    value: "174"
  });

  const backup = await exportWithButton(page, "#exportFullBackupBtn");
  expectEqual(backup.filename, `macro-engine-full-backup-${TODAY}.json`, "round-trip full backup filename");
  expectEqual(backup.json.backupVersion, FULL_BACKUP_VERSION, "round-trip full backup version");
  expectEqual(backup.json.data.settings.height, 174, "round-trip backup owns actual Settings height");
  expectTrue(backup.content.includes("C 전체복원 식사 메모"), "round-trip backup preserves literal Korean meal memo");
  expectTrue(backup.json.data.inbodyRecords.some(record => record.date === TODAY && record.weight === 74), "round-trip backup owns actual InBody record");

  await installLinkedBackupDirectorySentinel(page);
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "reset precondition has a remembered directory entry in real IDB");
  await openSettings(page);
  await expectTextExact(page.locator("#resetBtn"), C_LITERAL_ORACLE.resetButton, "destructive reset trigger literal label");
  const beforeCancel = await rawPrefixedStorage(page);
  const cancelMessage = await clickAndHandleDialog(page.locator("#resetBtn"), page, "dismiss");
  expectEqual(cancelMessage, C_LITERAL_ORACLE.resetConfirm, "reset cancellation literal scope confirmation");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "cancelled reset leaves all prefixed storage byte-identical");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "cancelled reset keeps remembered directory entry");

  await armAcceptanceFault(page, "armIdbOpenFailure");
  await acceptResetDialog(page, "IDB read failure uses the same literal reset confirmation");
  await expectResetFailureUi(page, C_LITERAL_ORACLE.resetDirectoryReadFailure, "IDB read failure");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "IDB read failure is a byte-noop for prefixed storage");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "IDB read failure keeps remembered directory entry");

  await armAcceptanceFault(page, "armStorageRemove", `${STORAGE_PREFIX}height`);
  await acceptResetDialog(page, "one-shot storage failure uses the same literal reset confirmation");
  await expectResetFailureUi(page, C_LITERAL_ORACLE.resetStorageFailure, "one-shot storage failure");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "one-shot storage remove failure atomically restores every prefixed byte");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "storage failure does not clear remembered directory entry");

  await armAcceptanceFault(page, "armIdbDeleteFailure");
  await acceptResetDialog(page, "IDB clear failure uses the same literal reset confirmation");
  await expectResetFailureUi(page, C_LITERAL_ORACLE.resetDirectoryClearFailure, "IDB clear failure");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "IDB clear failure restores every prefixed byte");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "IDB clear failure preserves remembered directory entry");

  const delayedFailureRecordsBefore = await rawRecords(page);
  const delayedFailureDraftsBefore = await rawTodayDrafts(page);
  const delayedFailureDomBefore = await page.evaluate(() => ({
    activeTabId: document.querySelector('.tab-btn[aria-current="page"]')?.id || "",
    settingsPanelHidden: document.getElementById("settingsPanel")?.hidden ?? null,
    height: document.getElementById("height")?.value ?? null,
    todayMealSummary: document.getElementById("todayMealSummary")?.textContent || "",
    recordCardDates: [...document.querySelectorAll("[data-record-card-date]")]
      .map(element => element.getAttribute("data-record-card-date")),
    recordsWorkspaceDate: document.getElementById("recordsWorkspaceDate")?.value ?? null,
    backupDirectoryStatus: document.getElementById("backupDirectoryStatus")?.textContent || ""
  }));
  await armAcceptanceFault(page, "armIdbDeleteDelayFailure");
  const delayedFailureAcceptMessage = await clickAndHandleDialog(page.locator("#resetBtn"), page, "accept");
  expectEqual(delayedFailureAcceptMessage, C_LITERAL_ORACLE.resetConfirm, "delayed failing IDB clear literal scope confirmation");
  await page.waitForFunction(() => window.__cAcceptanceFaults?.snapshot().idbDeleteStarted === true);
  expectTrue(await page.locator("#app").evaluate(element => element.inert === true), "delayed failing reset keeps the app inert while IDB directory clearing is pending");
  expectEqual(await page.locator("#app").getAttribute("aria-busy"), "true", "delayed failing reset exposes app busy state while IDB directory clearing is pending");
  expectTrue(await page.locator("#resetBtn").isDisabled(), "delayed failing reset disables its trigger while IDB directory clearing is pending");
  expectDeepEqual(await rawPrefixedStorage(page), {}, "delayed failing reset completes the initial atomic prefix deletion while IDB clear is pending");
  const delayedFailureHeight = await page.locator("#height").inputValue();
  let delayedFailureClickBlocked = false;
  try {
    await page.locator("#height").click({ timeout: 700 });
  } catch (_error) {
    delayedFailureClickBlocked = true;
  }
  expectTrue(delayedFailureClickBlocked, "delayed failing reset blocks an actual user click into the inert app");
  await page.keyboard.type("888");
  expectEqual(await page.locator("#height").inputValue(), delayedFailureHeight, "delayed failing reset blocks keyboard mutation of the inert Settings input");
  const failedResetRaceKey = `${STORAGE_PREFIX}raceDuringFailedReset`;
  await page.evaluate(key => localStorage.setItem(key, "must-not-survive"), failedResetRaceKey);
  expectEqual(await page.evaluate(key => localStorage.getItem(key), failedResetRaceKey), "must-not-survive", "delayed failing reset fixture creates one concurrent prefixed write");
  await armAcceptanceFault(page, "releaseIdbDeleteDelay");
  await expectResetFailureUi(page, C_LITERAL_ORACLE.resetDirectoryClearFailure, "delayed IDB clear failure");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "delayed IDB clear failure restores the exact pre-confirm prefix snapshot");
  expectEqual(await page.evaluate(key => localStorage.getItem(key), failedResetRaceKey), null, "delayed IDB clear failure removes the concurrent prefixed write during rollback");
  expectDeepEqual(await rawRecords(page), delayedFailureRecordsBefore, "delayed IDB clear failure preserves the exact Records runtime authority");
  expectDeepEqual(await rawTodayDrafts(page), delayedFailureDraftsBefore, "delayed IDB clear failure preserves the exact Today runtime authority");
  expectDeepEqual(await page.evaluate(() => ({
    activeTabId: document.querySelector('.tab-btn[aria-current="page"]')?.id || "",
    settingsPanelHidden: document.getElementById("settingsPanel")?.hidden ?? null,
    height: document.getElementById("height")?.value ?? null,
    todayMealSummary: document.getElementById("todayMealSummary")?.textContent || "",
    recordCardDates: [...document.querySelectorAll("[data-record-card-date]")]
      .map(element => element.getAttribute("data-record-card-date")),
    recordsWorkspaceDate: document.getElementById("recordsWorkspaceDate")?.value ?? null,
    backupDirectoryStatus: document.getElementById("backupDirectoryStatus")?.textContent || ""
  })), delayedFailureDomBefore, "delayed IDB clear failure preserves the exact cross-surface DOM snapshot");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "delayed IDB clear failure preserves the exact remembered directory handle");

  await armAcceptanceFault(page, "armRuntimeGetById", "targetCal");
  await acceptResetDialog(page, "retry after delayed IDB failure reaches the same literal reset confirmation");
  await expectResetFailureUi(page, C_LITERAL_ORACLE.resetRuntimeFailure, "runtime reset failure");
  expectDeepEqual(await rawPrefixedStorage(page), beforeCancel, "runtime reset failure restores every prefixed byte");
  expectEqual((await readLinkedBackupDirectorySentinel(page))?.name, "C E2E 연결 폴더", "runtime reset failure restores remembered directory entry");
  expectEqual(await page.locator("#height").inputValue(), "174", "runtime reset failure restores the visible Settings runtime value");
  expectEqual((await recordFor(page, TODAY))?.meals?.[0]?.memo, "C 전체복원 식사 메모", "runtime reset failure restores the visible record runtime authority");

  await armAcceptanceFault(page, "armIdbDeleteDelay");
  const delayedAcceptMessage = await clickAndHandleDialog(page.locator("#resetBtn"), page, "accept");
  expectEqual(delayedAcceptMessage, C_LITERAL_ORACLE.resetConfirm, "delayed successful reset literal scope confirmation");
  await page.waitForFunction(() => window.__cAcceptanceFaults?.snapshot().idbDeleteStarted === true);
  expectTrue(await page.locator("#app").evaluate(element => element.inert === true), "reset keeps the app inert while IDB directory clearing is pending");
  expectEqual(await page.locator("#app").getAttribute("aria-busy"), "true", "reset exposes app busy state while IDB directory clearing is pending");
  expectTrue(await page.locator("#resetBtn").isDisabled(), "reset trigger is disabled while IDB directory clearing is pending");
  expectDeepEqual(await rawPrefixedStorage(page), {}, "initial atomic reset deletion is complete while IDB clear remains pending");
  const heightBeforeBlockedInput = await page.locator("#height").inputValue();
  let inertClickBlocked = false;
  try {
    await page.locator("#height").click({ timeout: 700 });
  } catch (_error) {
    inertClickBlocked = true;
  }
  expectTrue(inertClickBlocked, "pending reset blocks an actual user click into the inert app");
  await page.keyboard.type("999");
  expectEqual(await page.locator("#height").inputValue(), heightBeforeBlockedInput, "pending reset blocks keyboard mutation of the inert Settings input");
  await page.evaluate(key => localStorage.setItem(key, "must-be-swept"), `${STORAGE_PREFIX}raceDuringReset`);
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}raceDuringReset`), "must-be-swept", "delayed reset fixture creates one concurrent prefixed write");
  await armAcceptanceFault(page, "releaseIdbDeleteDelay");
  await page.locator("#onboardingOverlay").waitFor({ state: "visible", timeout: 15000 });
  await expectRectInsideViewport(page, page.locator('#onboardingOverlay [role="dialog"]'), "mobile onboarding after destructive reset");
  expectDeepEqual(await rawPrefixedStorage(page), {}, "successful reset final sweep removes the complete prefix including the concurrent write");
  expectEqual(await readLinkedBackupDirectorySentinel(page), null, "successful reset ends with prefixed storage empty and remembered directory entry cleared");
  expectTrue(await page.locator("#app").evaluate(element => element.inert === true), "accepted reset returns to truthful modal onboarding");
  expectEqual(await page.locator("#app").getAttribute("aria-busy"), null, "successful reset clears transient app busy state");

  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
  await page.locator("#onboardingRestoreBtn").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: backup.filename,
    mimeType: "application/json",
    buffer: backup.buffer
  });
  const importOverlay = page.locator("#dataImportConfirmOverlay");
  await importOverlay.waitFor({ state: "visible", timeout: 10000 });
  await expectRectInsideViewport(page, importOverlay.locator('[role="dialog"]'), "mobile full-backup restore preview");
  await expectTextExact(page.locator("#dataImportConfirmTitle"), "백업을 어떻게 불러올까요?", "onboarding restore preview literal title");
  const previewText = await importOverlay.innerText();
  expectTrue(previewText.includes("아직 복원되지 않았습니다") && previewText.includes("전체 복원"), "onboarding restore is preview-first", previewText);
  await importOverlay.locator("[data-confirm-data-import]").click();
  await importOverlay.waitFor({ state: "hidden", timeout: 15000 });
  await page.locator("#onboardingOverlay").waitFor({ state: "hidden", timeout: 15000 });
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), backup.json.createdAt, "full restore sets the full-only marker to the validated payload timestamp");
  await reloadApp(page);
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), backup.json.createdAt, "full restore marker survives reload exactly");
  await expectNoHorizontalOverflow(page, "mobile restored app after reload");

  await page.locator("#tabToday").click();
  const restoredTodayText = await page.locator("#todayMealSummary").innerText();
  expectTrue(restoredTodayText.includes("식사 1건 · 작성 중") && restoredTodayText.includes("저녁"), "restored Today visibly owns the actual meal", restoredTodayText);
  const restoredRecord = await recordFor(page, TODAY);
  expectEqual(restoredRecord?.meals?.[0]?.memo, "C 전체복원 식사 메모", "restored Today raw meal memo matches the downloaded snapshot");

  await page.locator("#tabRecords").click();
  const restoredCard = page.locator(`[data-record-card-date="${TODAY}"]`);
  await restoredCard.waitFor({ state: "visible" });
  await restoredCard.click();
  const restoredMealsDisclosure = page.locator(`[data-record-detail-date="${TODAY}"] [data-record-detail-section="meals"]`);
  await restoredMealsDisclosure.locator("summary").click();
  expectTrue(await restoredMealsDisclosure.evaluate(element => element.open === true), "restored Records meal disclosure opens through actual UI");
  const restoredMealsText = await restoredMealsDisclosure.innerText();
  expectTrue(restoredMealsText.includes("C 전체복원 식사 메모"), "restored Records visibly owns the literal meal memo in its opened disclosure", restoredMealsText);

  await page.locator("#tabInbody").click();
  await page.locator("#viewInbodyRecordsBtn").click();
  const historyOverlay = page.locator("#inbodyHistoryOverlay");
  await historyOverlay.waitFor({ state: "visible" });
  await expectRectInsideViewport(page, historyOverlay.locator('[role="dialog"]'), "mobile restored InBody history");
  const inbodyRowText = await historyOverlay.locator(".inbody-record").filter({ hasText: TODAY }).innerText();
  expectTrue(inbodyRowText.includes("74.00kg") && inbodyRowText.includes("35.00kg") && inbodyRowText.includes("11.10kg") && inbodyRowText.includes("15.00%"), "restored InBody visible values match literal snapshot", inbodyRowText);
  await page.locator("#inbodyHistoryClose").click();

  await openSettings(page);
  await openSettingsGroup(page, ".settings-profile-group");
  expectEqual(await page.locator("#height").inputValue(), "174", "restored Settings literal height survives reload");
  await expectNoHorizontalOverflow(page, "mobile restored cross-surface snapshot");
}

async function scenarioAppliedInbodyDeleteDisclosure({ page, baseUrl }){
  await loadApp(page, baseUrl);
  const values = {
    date: TODAY,
    weight: 74,
    skeletalMuscle: 35,
    bodyFat: 11.1,
    bodyFatPercent: 15
  };
  await setInbodyThroughUi(page, values);
  const defaultCardio = await createDefaultCardioPresetThroughUi(page);

  await page.locator("#tabToday").click();
  const quickToggle = page.locator("#todayQuickEditToggle");
  if (await quickToggle.getAttribute("aria-expanded") !== "true") await quickToggle.click();
  await page.locator("#todayQuickEditPanel").waitFor({ state: "visible" });
  const appliedVisible = {
    weight: Number(await page.locator("#todayQuickWeight").inputValue()),
    skeletalMuscle: Number(await page.locator("#todayQuickSkeletal").inputValue()),
    bodyFat: Number(await page.locator("#todayQuickBodyFatMass").inputValue()),
    bodyFatPercent: Number(await page.locator("#todayQuickBodyFat").inputValue())
  };
  expectDeepEqual(appliedVisible, {
    weight: 74,
    skeletalMuscle: 35,
    bodyFat: 11.1,
    bodyFatPercent: 15
  }, "Today visibly applies the automatic same-date InBody values");
  const appliedCardioVisible = {
    type: await page.locator("#todayQuickCardioType").inputValue(),
    duration: Number(await page.locator("#todayQuickCardioDuration").inputValue()),
    speed: Number(await page.locator("#todayQuickCardioSpeed").inputValue()),
    incline: Number(await page.locator("#todayQuickCardioIncline").inputValue())
  };
  expectDeepEqual(appliedCardioVisible, {
    type: "treadmill_walk",
    duration: 35,
    speed: 5.5,
    incline: 4
  }, "Today visibly materializes the literal default cardio preset");
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "Today literal default-cardio source label");
  const beforeDraft = (await rawTodayDrafts(page))[TODAY];
  expectEqual(beforeDraft?.bodyStatusSource, "latest_inbody", "automatic InBody raw source literal");
  expectEqual(beforeDraft?.bodyStatusSourceDate, TODAY, "automatic InBody raw source date literal");
  expectEqual(beforeDraft?.bodyStatusLoadType, "auto", "automatic InBody raw load ownership literal");
  expectTrue(beforeDraft?.bodyStatusEdited !== true, "automatic InBody draft is not user-edited");
  expectEqual(beforeDraft?.cardioSource, "default_preset", "automatic cardio raw source literal");
  expectEqual(beforeDraft?.cardioPresetId, defaultCardio.id, "automatic cardio raw source id matches the actual preset");
  expectEqual(beforeDraft?.cardioPresetName, "C 기본 워킹", "automatic cardio raw source name literal");
  expectTrue(beforeDraft?.cardioEdited !== true, "automatic default-cardio draft is not user-edited");

  const matchingSourceBackup = await exportWithButton(page, "#exportFullBackupBtn");
  const matchingPayloadDraft = matchingSourceBackup.json.data.todayCalculationValues[TODAY] || {};
  [
    "calculationWeight",
    "skeletalMuscle",
    "bodyFatMass",
    "bodyFatPercent",
    "bodyStatusSource",
    "bodyStatusSourceDate",
    "bodyStatusLoadType",
    "bodyStatusEdited"
  ].forEach(field => {
    expectTrue(!Object.prototype.hasOwnProperty.call(matchingPayloadDraft, field), `matching automatic InBody source strips redundant full-backup field ${field}`);
  });
  [
    "todayCardioType",
    "todayCardioDuration",
    "todayCardioSpeed",
    "todayCardioIncline",
    "cardioSource",
    "cardioEdited",
    "cardioPresetId",
    "cardioPresetName"
  ].forEach(field => {
    expectTrue(!Object.prototype.hasOwnProperty.call(matchingPayloadDraft, field), `matching automatic default-cardio source strips redundant full-backup field ${field}`);
  });
  expectTrue(matchingSourceBackup.json.data.inbodyRecords.some(record => record.date === TODAY), "matching automatic source remains authoritative in full payload");
  expectEqual(matchingSourceBackup.json.data.cardioPresets.defaultId, defaultCardio.id, "matching default-cardio source remains authoritative in full payload");
  const matchingCardioPreset = matchingSourceBackup.json.data.cardioPresets.items.find(item => item.id === defaultCardio.id);
  expectDeepEqual({
    name: matchingCardioPreset?.name,
    cardioType: matchingCardioPreset?.cardioType,
    cardioDuration: matchingCardioPreset?.cardioDuration,
    cardioSpeed: matchingCardioPreset?.cardioSpeed,
    cardioIncline: matchingCardioPreset?.cardioIncline
  }, {
    name: "C 기본 워킹",
    cardioType: "treadmill_walk",
    cardioDuration: 35,
    cardioSpeed: 5.5,
    cardioIncline: 4
  }, "matching default-cardio full payload literal source tuple");

  await page.locator("#tabInbody").click();
  await page.locator("#viewInbodyRecordsBtn").click();
  const historyOverlay = page.locator("#inbodyHistoryOverlay");
  await historyOverlay.waitFor({ state: "visible" });
  let row = historyOverlay.locator(".inbody-record").filter({ hasText: TODAY });
  const cancelMessage = await clickAndHandleDialog(row.locator("[data-delete-inbody]"), page, "dismiss");
  expectEqual(cancelMessage, C_LITERAL_ORACLE.inbodyDeleteConfirm, "applied same-date InBody cancellation literal disclosure");
  expectEqual((await rawInbodyRecords(page)).length, 1, "cancelled InBody delete keeps source record");
  expectDeepEqual((await rawTodayDrafts(page))[TODAY], beforeDraft, "cancelled InBody delete keeps applied Today draft byte-equivalent");

  row = historyOverlay.locator(".inbody-record").filter({ hasText: TODAY });
  const acceptMessage = await clickAndHandleDialog(row.locator("[data-delete-inbody]"), page, "accept");
  expectEqual(acceptMessage, C_LITERAL_ORACLE.inbodyDeleteConfirm, "applied same-date InBody accepted literal disclosure");
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || "[]").length === 0, `${STORAGE_PREFIX}inbodyRecords`);
  expectEqual((await rawInbodyRecords(page)).length, 0, "accepted InBody delete removes only the source record");
  expectDeepEqual((await rawTodayDrafts(page))[TODAY], beforeDraft, "accepted InBody delete preserves exact applied Today values and ownership");
  await page.locator("#inbodyHistoryClose").click();

  await openSettings(page);
  await openSettingsGroup(page, ".settings-training-group");
  const cardioRow = page.locator(`#cardioPresetList [data-cardio-preset-id="${defaultCardio.id}"]`);
  await cardioRow.waitFor({ state: "visible" });
  const cardioDeleteMessage = await clickAndHandleDialog(cardioRow.locator("[data-cardio-preset-delete]"), page, "accept");
  expectEqual(cardioDeleteMessage, C_LITERAL_ORACLE.cardioPresetDeleteConfirm, "default-cardio source deletion literal confirmation");
  await page.waitForFunction(key => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "{\"items\":[],\"defaultId\":null}");
      return Array.isArray(stored.items) && stored.items.length === 0;
    } catch (_error) {
      return false;
    }
  }, `${STORAGE_PREFIX}cardioPresets.v1`);
  await expectTextExact(page.locator("#cardioPresetFeedback"), C_LITERAL_ORACLE.cardioPresetDeleteFeedback, "current UI cardio source deletion feedback");
  const deletedCardioStorage = await rawCardioPresets(page);
  expectDeepEqual(deletedCardioStorage, { items: [], defaultId: null }, "current UI deletion removes the default cardio source");
  expectDeepEqual((await rawTodayDrafts(page))[TODAY], beforeDraft, "default cardio source deletion preserves the exact materialized Today draft");

  await page.locator("#tabToday").click();
  if (await quickToggle.getAttribute("aria-expanded") !== "true") await quickToggle.click();
  await page.locator("#todayQuickEditPanel").waitFor({ state: "visible" });
  await expectTextExact(page.locator("#todayInbodySourceNote"), C_LITERAL_ORACLE.inbodyStaleSource, "deleted applied InBody literal retained-source label");
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "deleted default-cardio source retains literal Today ownership label");
  expectDeepEqual({
    weight: Number(await page.locator("#todayQuickWeight").inputValue()),
    skeletalMuscle: Number(await page.locator("#todayQuickSkeletal").inputValue()),
    bodyFat: Number(await page.locator("#todayQuickBodyFatMass").inputValue()),
    bodyFatPercent: Number(await page.locator("#todayQuickBodyFat").inputValue())
  }, appliedVisible, "accepted source deletion leaves visible Today values unchanged");
  expectDeepEqual({
    type: await page.locator("#todayQuickCardioType").inputValue(),
    duration: Number(await page.locator("#todayQuickCardioDuration").inputValue()),
    speed: Number(await page.locator("#todayQuickCardioSpeed").inputValue()),
    incline: Number(await page.locator("#todayQuickCardioIncline").inputValue())
  }, appliedCardioVisible, "deleted default-cardio source leaves visible Today cardio values unchanged");

  const staleBackup = await exportWithButton(page, "#exportFullBackupBtn");
  expectEqual(staleBackup.json.data.inbodyRecords.length, 0, "post-delete full payload contains no deleted InBody source");
  expectDeepEqual(staleBackup.json.data.cardioPresets, { items: [], defaultId: null }, "post-delete full payload contains no deleted cardio preset source");
  const stalePayloadDraft = staleBackup.json.data.todayCalculationValues[TODAY];
  expectTrue(!!stalePayloadDraft, "post-delete full payload retains the stale Today draft");
  expectEqual(Number(stalePayloadDraft.calculationWeight), 74, "post-delete full payload retains literal Today weight");
  expectEqual(Number(stalePayloadDraft.skeletalMuscle), 35, "post-delete full payload retains literal Today skeletal muscle");
  expectEqual(Number(stalePayloadDraft.bodyFatMass), 11.1, "post-delete full payload retains literal Today body-fat mass");
  expectEqual(Number(stalePayloadDraft.bodyFatPercent), 15, "post-delete full payload retains literal Today body-fat percent");
  expectEqual(stalePayloadDraft.bodyStatusSource, "latest_inbody", "post-delete full payload retains stale source kind");
  expectEqual(stalePayloadDraft.bodyStatusSourceDate, TODAY, "post-delete full payload retains stale source date");
  expectEqual(stalePayloadDraft.bodyStatusLoadType, "auto", "post-delete full payload retains automatic ownership");
  expectEqual(stalePayloadDraft.todayCardioType, "treadmill_walk", "post-delete full payload retains literal Today cardio type");
  expectEqual(Number(stalePayloadDraft.todayCardioDuration), 35, "post-delete full payload retains literal Today cardio duration");
  expectEqual(Number(stalePayloadDraft.todayCardioSpeed), 5.5, "post-delete full payload retains literal Today cardio speed");
  expectEqual(Number(stalePayloadDraft.todayCardioIncline), 4, "post-delete full payload retains literal Today cardio incline");
  expectEqual(stalePayloadDraft.cardioSource, "default_preset", "post-delete full payload retains orphaned default-cardio ownership");
  expectEqual(stalePayloadDraft.cardioPresetId, defaultCardio.id, "post-delete full payload retains orphaned cardio source id");
  expectEqual(stalePayloadDraft.cardioPresetName, "C 기본 워킹", "post-delete full payload retains orphaned cardio source name");

  await page.locator("#tabToday").click();
  const mutationToggle = page.locator("#todayQuickEditToggle");
  if (await mutationToggle.getAttribute("aria-expanded") !== "true") await mutationToggle.click();
  await page.locator("#todayQuickWeight").fill("80");
  await page.locator("#todayQuickWeight").dispatchEvent("change");
  await page.waitForFunction(({ key, date }) => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) || "{}")[date];
      return Number(draft?.calculationWeight) === 80 && draft?.bodyStatusSource === "user";
    } catch (_error) {
      return false;
    }
  }, { key: `${STORAGE_PREFIX}todayCalculationDrafts.v1`, date: TODAY });
  expectEqual(Number((await rawTodayDrafts(page))[TODAY]?.calculationWeight), 80, "visible Today mutation creates a different pre-restore value");

  await importFullBackupThroughCurrentUi(page, staleBackup);
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), staleBackup.json.createdAt, "stale-draft full restore owns the validated payload timestamp");
  expectEqual((await rawInbodyRecords(page)).length, 0, "stale-draft full restore does not recreate the deleted InBody source");
  expectDeepEqual(await rawCardioPresets(page), { items: [], defaultId: null }, "stale-draft full restore does not recreate the deleted cardio source");
  expectDeepEqual((await rawTodayDrafts(page))[TODAY], stalePayloadDraft, "full restore exactly rehydrates the retained stale Today payload");

  await page.locator("#tabToday").click();
  const restoredToggle = page.locator("#todayQuickEditToggle");
  if (await restoredToggle.getAttribute("aria-expanded") !== "true") await restoredToggle.click();
  await expectTextExact(page.locator("#todayInbodySourceNote"), C_LITERAL_ORACLE.inbodyStaleSource, "restored deleted-source Today literal label");
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "restored deleted-cardio Today literal label");
  expectDeepEqual({
    weight: Number(await page.locator("#todayQuickWeight").inputValue()),
    skeletalMuscle: Number(await page.locator("#todayQuickSkeletal").inputValue()),
    bodyFat: Number(await page.locator("#todayQuickBodyFatMass").inputValue()),
    bodyFatPercent: Number(await page.locator("#todayQuickBodyFat").inputValue())
  }, appliedVisible, "full restore visibly rehydrates exact stale Today values");
  expectDeepEqual({
    type: await page.locator("#todayQuickCardioType").inputValue(),
    duration: Number(await page.locator("#todayQuickCardioDuration").inputValue()),
    speed: Number(await page.locator("#todayQuickCardioSpeed").inputValue()),
    incline: Number(await page.locator("#todayQuickCardioIncline").inputValue())
  }, appliedCardioVisible, "full restore visibly rehydrates exact orphaned cardio values");

  await reloadApp(page);
  await page.locator("#tabToday").click();
  const reloadedToggle = page.locator("#todayQuickEditToggle");
  if (await reloadedToggle.getAttribute("aria-expanded") !== "true") await reloadedToggle.click();
  await expectTextExact(page.locator("#todayInbodySourceNote"), C_LITERAL_ORACLE.inbodyStaleSource, "deleted applied InBody retained-source label after reload");
  await expectTextExact(page.locator("#todayCardioSourceNote"), C_LITERAL_ORACLE.defaultCardioSource, "deleted default-cardio retained-source label after reload");
  expectDeepEqual((await rawTodayDrafts(page))[TODAY], stalePayloadDraft, "restored stale Today payload survives reload exactly");
  expectDeepEqual(await rawCardioPresets(page), { items: [], defaultId: null }, "deleted cardio source stays absent after restore reload");
  expectEqual(await page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}lastFullBackupAt`), staleBackup.json.createdAt, "stale-draft full restore marker survives reload exactly");
}

async function scenarioKstMealReuseLabels({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealThroughUi(page, YESTERDAY, {
    label: "점심",
    carbs: 82,
    protein: 41,
    fat: 19,
    memo: "C KST 어제 식사"
  });
  await addMealThroughUi(page, OLDER, {
    label: "저녁",
    carbs: 76,
    protein: 39,
    fat: 18,
    memo: "C KST 그제 식사"
  });

  await openTodayMealDialog(page);
  await expectRectInsideViewport(page, page.locator('#todayRecordStartOverlay [role="dialog"]'), "mobile Today meal dialog for KST reuse");
  await page.locator("#todayRecordMealReuseBtn").click();
  const reuseOverlay = page.locator("#mealReuseOverlay");
  await reuseOverlay.waitFor({ state: "visible" });
  await expectRectInsideViewport(page, reuseOverlay.locator('[role="dialog"]'), "mobile KST meal reuse dialog");
  await expectNoHorizontalOverflow(page, "mobile KST meal reuse dialog");
  const yesterdayCard = reuseOverlay.locator(`[data-meal-reuse-date="${YESTERDAY}"]`);
  const olderCard = reuseOverlay.locator(`[data-meal-reuse-date="${OLDER}"]`);
  expectEqual(await yesterdayCard.count(), 1, "KST reuse has one literal yesterday candidate");
  expectEqual(await olderCard.count(), 1, "KST reuse has one literal older candidate");
  await expectTextExact(yesterdayCard.locator(".meal-reuse-source"), C_LITERAL_ORACLE.yesterdayReuse, "KST yesterday literal label near UTC boundary");
  await expectTextExact(olderCard.locator(".meal-reuse-source"), C_LITERAL_ORACLE.olderReuse, "KST older literal label near UTC boundary");

  await yesterdayCard.locator("[data-save-meal-template]").click();
  await page.waitForFunction(key => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{\"items\":[]}").items?.length === 1;
    } catch (_error) {
      return false;
    }
  }, `${STORAGE_PREFIX}mealTemplates.v1`);
  await expectTextExact(page.locator("#mealTemplateFeedback"), "저장한 식사에 추가했습니다.", "mobile saved-meal current UI feedback");
  const storedTemplates = await rawMealTemplates(page);
  const storedTemplate = storedTemplates.items[0];
  expectDeepEqual({
    name: storedTemplate?.name,
    mealLabel: storedTemplate?.mealLabel,
    carbs: storedTemplate?.carbs,
    protein: storedTemplate?.protein,
    fat: storedTemplate?.fat,
    alcoholKcal: storedTemplate?.alcoholKcal,
    otherKcal: storedTemplate?.otherKcal,
    memo: storedTemplate?.memo
  }, {
    name: C_LITERAL_ORACLE.mealTemplateName,
    mealLabel: "점심",
    carbs: 82,
    protein: 41,
    fat: 19,
    alcoholKcal: 0,
    otherKcal: 0,
    memo: "C KST 어제 식사"
  }, "mobile saved-meal literal storage tuple");
  const recordsBeforeTemplateDelete = await rawRecords(page);
  const templateCard = reuseOverlay.locator(`[data-meal-template-id="${storedTemplate.id}"]`);
  let templateDeleteButton = templateCard.locator("[data-delete-meal-template]");
  const storageBeforeTemplateCancel = await rawPrefixedStorage(page);
  const templateCancelMessage = await pressAndHandleDialog(templateDeleteButton, page, "Enter", "dismiss");
  expectEqual(templateCancelMessage, C_LITERAL_ORACLE.mealTemplateDeleteConfirm, "mobile keyboard saved-meal delete cancellation literal scope");
  expectDeepEqual(await rawPrefixedStorage(page), storageBeforeTemplateCancel, "cancelled saved-meal delete is a byte-noop for current storage");
  expectDeepEqual(await rawMealTemplates(page), storedTemplates, "cancelled saved-meal delete keeps the saved shortcut exactly");
  expectDeepEqual(await rawRecords(page), recordsBeforeTemplateDelete, "cancelled saved-meal delete preserves all existing Records");
  expectTrue(await templateDeleteButton.evaluate(element => document.activeElement === element), "cancelled saved-meal delete returns focus to the same keyboard opener");

  const templateAcceptMessage = await clickAndHandleDialog(templateDeleteButton, page, "accept");
  expectEqual(templateAcceptMessage, C_LITERAL_ORACLE.mealTemplateDeleteConfirm, "mobile saved-meal delete acceptance literal scope");
  await page.waitForFunction(key => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{\"items\":[]}").items?.length === 0;
    } catch (_error) {
      return false;
    }
  }, `${STORAGE_PREFIX}mealTemplates.v1`);
  const templateDeleteFeedback = page.locator("#mealTemplateFeedback");
  await expectTextExact(templateDeleteFeedback, C_LITERAL_ORACLE.mealTemplateDeleteFeedback, "accepted saved-meal delete literal live feedback");
  expectEqual(await templateDeleteFeedback.getAttribute("role"), "status", "accepted saved-meal delete feedback role");
  expectEqual(await templateDeleteFeedback.getAttribute("aria-live"), "polite", "accepted saved-meal delete feedback live priority");
  await page.waitForFunction(() => document.activeElement?.id === "mealTemplateFeedback");
  expectDeepEqual(await rawMealTemplates(page), { items: [] }, "accepted saved-meal delete removes only the shortcut");
  expectDeepEqual(await rawRecords(page), recordsBeforeTemplateDelete, "accepted saved-meal delete preserves all existing Records exactly");
  const storageAfterTemplateAccept = await rawPrefixedStorage(page);
  const storageBeforeWithoutTemplates = { ...storageBeforeTemplateCancel };
  const storageAfterWithoutTemplates = { ...storageAfterTemplateAccept };
  delete storageBeforeWithoutTemplates[`${STORAGE_PREFIX}mealTemplates.v1`];
  delete storageAfterWithoutTemplates[`${STORAGE_PREFIX}mealTemplates.v1`];
  expectDeepEqual(storageAfterWithoutTemplates, storageBeforeWithoutTemplates, "accepted saved-meal delete changes only its owned shortcut storage key");

  await yesterdayCard.locator("[data-apply-meal-reuse]").click();
  await reuseOverlay.waitFor({ state: "hidden" });
  expectEqual(await page.locator("#todayRecordMealLabel").inputValue(), "점심", "reused meal keeps literal base meal label");
  expectEqual(await page.locator("#todayRecordMealCarbs").inputValue(), "82.0", "reused yesterday carbs literal");
  expectEqual(await page.locator("#todayRecordMealProtein").inputValue(), "41.0", "reused yesterday protein literal");
  expectEqual(await page.locator("#todayRecordMealFat").inputValue(), "19.0", "reused yesterday fat literal");
  expectEqual(await page.locator("#todayRecordMealMemo").inputValue(), "C KST 어제 식사", "reused yesterday Korean memo literal");
  await page.locator("#todayRecordDetailedSaveBtn").click();
  await page.waitForFunction(() => (document.getElementById("todayRecordStartFeedback")?.textContent || "").includes("식사를 저장했습니다"));
  await page.locator("#todayRecordStartOverlay [data-record-start-close]").click();
  const todayRecord = await recordFor(page, TODAY);
  expectTrue(!!todayRecord && todayRecord.meals.length === 1, "reused meal saves into the literal current KST date", formatValue(todayRecord));
  expectEqual(todayRecord.date, TODAY, "reused meal current KST record date");
  expectEqual(todayRecord.meals[0].mealLabel, "점심", "reused meal raw label");
  expectEqual(todayRecord.meals[0].carbs, 82, "reused meal raw carbs");
  expectEqual(todayRecord.meals[0].protein, 41, "reused meal raw protein");
  expectEqual(todayRecord.meals[0].fat, 19, "reused meal raw fat");
  expectEqual(todayRecord.meals[0].memo, "C KST 어제 식사", "reused meal raw Korean memo");
  await reloadApp(page);
  expectEqual((await recordFor(page, TODAY))?.meals?.[0]?.memo, "C KST 어제 식사", "KST reused meal survives reload");
  await expectNoHorizontalOverflow(page, "mobile KST reused meal after reload");
}

const scenarios = [
  {
    name: "C-E2E-01 fresh onboarding one-meal completion Coach Records Recent and reopen",
    seed: {},
    viewport: { width: 1280, height: 900 },
    run: scenarioFreshCompletedMealCoachJourney
  },
  {
    name: "C-E2E-02 memo-only meal has no completion authority through Today Records or reload",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioMemoOnlyCannotComplete
  },
  {
    name: "C-E2E-03 JSON records export cannot satisfy full-backup nudge but full export can",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioJsonAndFullBackupNudge
  },
  {
    name: "C-E2E-04 mobile full backup destructive reset IDB release onboarding restore and reload",
    seed: storage(),
    viewport: { width: 390, height: 844 },
    run: scenarioMobileResetRestoreRoundTrip
  },
  {
    name: "C-E2E-05 applied same-date InBody delete discloses source-only deletion and preserves Today",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioAppliedInbodyDeleteDisclosure
  },
  {
    name: "C-E2E-06 KST near-UTC-boundary meal reuse labels and save use date-only truth",
    seed: storage(),
    viewport: { width: 390, height: 844 },
    run: scenarioKstMealReuseLabels
  }
];

async function run(){
  expectTrue(scenarios.length <= 6, "C Chromium E2E scenario upper bound");
  const server = makeServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser = null;
  const results = [];
  try {
    browser = await launchBrowser();
    const scenarioFilter = String(process.argv.find(argument => argument.startsWith("--scenario=")) || "").slice("--scenario=".length);
    const selectedScenarios = scenarioFilter
      ? scenarios.filter(scenario => scenario.name.includes(scenarioFilter))
      : scenarios;
    if (!selectedScenarios.length) throw new Error(`no C E2E scenario matched: ${scenarioFilter}`);

    for (const scenario of selectedScenarios) {
      const context = await browser.newContext({
        viewport: scenario.viewport,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        reducedMotion: "reduce",
        acceptDownloads: true
      });
      const consoleErrors = [];
      const pageErrors = [];
      const instrumentedPages = new WeakSet();
      const instrumentPage = currentPage => {
        if (instrumentedPages.has(currentPage)) return;
        instrumentedPages.add(currentPage);
        currentPage.on("console", message => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        currentPage.on("pageerror", error => pageErrors.push(error.message || String(error)));
      };
      context.on("page", instrumentPage);
      await installSeedAndClock(context, scenario.seed, NOW);
      const page = await context.newPage();
      instrumentPage(page);
      page.setDefaultTimeout(12000);
      const startedAt = Date.now();
      try {
        await scenario.run({ page, context, baseUrl });
        await sleep(120);
        expectEqual(consoleErrors.length, 0, "console errors");
        expectEqual(pageErrors.length, 0, "page errors");
        results.push({
          name: scenario.name,
          pass: true,
          viewport: scenario.viewport,
          elapsedMs: Date.now() - startedAt,
          consoleErrorCount: 0,
          pageErrorCount: 0
        });
      } catch (error) {
        results.push({
          name: scenario.name,
          pass: false,
          viewport: scenario.viewport,
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
    contract: "c-product-completeness-acceptance-chromium-e2e-v1",
    oracle: "test-owned literal Korean/date/version/score/envelope/storage/viewport contracts; actual current UI producers; no production calculation, normalization, date, or assertion helper oracle; no legacy fixture",
    scenarioUpperBound: 6,
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
