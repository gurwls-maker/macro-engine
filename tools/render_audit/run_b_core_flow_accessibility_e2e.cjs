const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_PREFIX = "runstep_macro_v1_";
const FAKE_NOW_KEY = "__macro_engine_b_accessibility_fake_now__";
const SEED_MARKER_KEY = "__macro_engine_b_accessibility_seeded__";
const TODAY = "2026-08-14";
const EMPTY_RECORD_DATE = "2026-08-13";
const NOW = "2026-08-14T12:00:00+09:00";

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

const mimeTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
});

// Test-owned current-development profile. It contains no record, backup, or
// migration fixture; every domain artifact asserted below is produced through
// the visible current UI in that scenario.
const CURRENT_PROFILE_STORAGE = Object.freeze({
  [`${STORAGE_PREFIX}onboardingCompletedVersion`]: "1",
  [`${STORAGE_PREFIX}bodyCompositionConfirmed`]: "true",
  [`${STORAGE_PREFIX}mode`]: "general",
  [`${STORAGE_PREFIX}weight`]: "75",
  [`${STORAGE_PREFIX}height`]: "173",
  [`${STORAGE_PREFIX}age`]: "32",
  [`${STORAGE_PREFIX}bodyFat`]: "20",
  [`${STORAGE_PREFIX}bodyFatMass`]: "15",
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
  [`${STORAGE_PREFIX}weightDuration`]: "60",
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

// These Korean names are an independent, literal user contract. Do not build
// them from production labels, option maps, or helper output.
const B_LITERAL_ORACLE = Object.freeze({
  routes: Object.freeze([
    Object.freeze({ selector: "#tabToday", name: "오늘 계산", panel: "#todayPanel" }),
    Object.freeze({ selector: "#tabRecords", name: "기록", panel: "#recordsPanel" }),
    Object.freeze({ selector: "#tabWeekly", name: "최근 흐름", panel: "#weeklyPanel" }),
    Object.freeze({ selector: "#tabInbody", name: "InBody", panel: "#inbodyPanel" })
  ]),
  todayQuick: Object.freeze([
    Object.freeze({ selector: "#todayQuickWeight", role: "spinbutton", name: "계산용 체중" }),
    Object.freeze({ selector: "#todayQuickActivityLevel", role: "combobox", name: "생활활동" }),
    Object.freeze({ selector: "#todayQuickSleepHours", role: "spinbutton", name: "수면 시간" }),
    Object.freeze({ selector: "#todayQuickWorkHours", role: "spinbutton", name: "업무 시간" })
  ]),
  todayRecord: Object.freeze([
    Object.freeze({ selector: "#todayRecordDetailedWeight", role: "spinbutton", name: "오늘 공복 체중" }),
    Object.freeze({ selector: "#todayRecordMealLabel", role: "combobox", name: "식사 구분" }),
    Object.freeze({ selector: "#todayRecordMealCarbs", role: "spinbutton", name: "탄수화물 g" }),
    Object.freeze({ selector: "#todayRecordMealProtein", role: "spinbutton", name: "단백질 g" }),
    Object.freeze({ selector: "#todayRecordMealFat", role: "spinbutton", name: "지방 g" }),
    Object.freeze({ selector: "#todayRecordMealMemo", role: "textbox", name: "식사 메모" })
  ]),
  recordEdit: Object.freeze([
    Object.freeze({ selector: "#recordDetailEditWeight", role: "spinbutton", name: "공복 체중 (kg)" }),
    Object.freeze({ selector: "#recordDetailEditNote", role: "textbox", name: "기록 메모" }),
    Object.freeze({ selector: '[data-detail-meal-row="0"] [data-detail-meal-field="mealLabel"]', role: "combobox", name: "식사 구분" }),
    Object.freeze({ selector: '[data-detail-meal-row="0"] [data-detail-meal-field="carbs"]', role: "spinbutton", name: "탄수화물 g" }),
    Object.freeze({ selector: '[data-detail-meal-row="0"] [data-detail-meal-field="protein"]', role: "spinbutton", name: "단백질 g" }),
    Object.freeze({ selector: '[data-detail-meal-row="0"] [data-detail-meal-field="memo"]', role: "textbox", name: "메모" }),
    Object.freeze({ selector: '[data-detail-basis-field="goal"]', role: "combobox", name: "당시 목표" }),
    Object.freeze({ selector: '[data-detail-basis-field="sleepHours"]', role: "spinbutton", name: "수면 시간" }),
    Object.freeze({ selector: '[data-detail-basis-field="homeInbody"]', role: "checkbox", name: "가정용 InBody 기준" })
  ]),
  inbody: Object.freeze([
    Object.freeze({ selector: "#inbodyDate", role: "textbox", name: "측정일" }),
    Object.freeze({ selector: "#inbodyWeight", role: "spinbutton", name: "체중 (kg)" }),
    Object.freeze({ selector: "#inbodySkeletalMuscle", role: "spinbutton", name: "골격근량 (kg)" }),
    Object.freeze({ selector: "#inbodyBodyFat", role: "spinbutton", name: "체지방량 (kg)" }),
    Object.freeze({ selector: "#inbodyBodyFatPercent", role: "spinbutton", name: "체지방률 (%)" })
  ]),
  settings: Object.freeze([
    Object.freeze({ selector: "#weight", role: "spinbutton", name: "기본 체중 (kg)" }),
    Object.freeze({ selector: "#height", role: "spinbutton", name: "키 (cm)" }),
    Object.freeze({ selector: "#gender", role: "combobox", name: "성별" }),
    Object.freeze({ selector: "#age", role: "spinbutton", name: "나이" }),
    Object.freeze({ selector: "#activityLevel", role: "combobox", name: "기본 생활활동" }),
    Object.freeze({ selector: "#workType", role: "combobox", name: "기본 업무 유형" }),
    Object.freeze({ selector: "#sleepHours", role: "spinbutton", name: "기본 수면 시간" }),
    Object.freeze({ selector: "#workHours", role: "spinbutton", name: "기본 업무 시간" }),
    Object.freeze({ selector: "#lifestyleHours", role: "spinbutton", name: "기본 생활활동 시간" }),
    Object.freeze({ selector: "#weightDuration", role: "spinbutton", name: "기본 웨이트 시간 (분)" })
  ])
});

function storage(overrides = {}){
  return { ...CURRENT_PROFILE_STORAGE, ...overrides };
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

async function installSeedAndClock(context, initialStorage){
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
    const NativeDate = Date;
    const readNow = () => {
      try {
        const parsed = NativeDate.parse(localStorage.getItem(fakeNowKey) || fakeNowIso);
        return Number.isFinite(parsed) ? parsed : NativeDate.parse(fakeNowIso);
      } catch (_error) {
        return NativeDate.parse(fakeNowIso);
      }
    };
    function BAccessibilityDate(...args){
      if (!(this instanceof BAccessibilityDate)) return new NativeDate(readNow()).toString();
      return args.length ? new NativeDate(...args) : new NativeDate(readNow());
    }
    BAccessibilityDate.prototype = NativeDate.prototype;
    Object.setPrototypeOf(BAccessibilityDate, NativeDate);
    BAccessibilityDate.now = readNow;
    BAccessibilityDate.parse = NativeDate.parse;
    BAccessibilityDate.UTC = NativeDate.UTC;
    window.Date = BAccessibilityDate;
  }, {
    seed: initialStorage,
    fakeNowIso: NOW,
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

async function expectVisible(locator, label){
  await locator.waitFor({ state: "visible" });
  expectTrue(await locator.isVisible(), label);
}

async function expectAxName(locator, role, name, label){
  expectEqual(await locator.count(), 1, `${label} selector count`);
  await expectVisible(locator, `${label} visible`);
  const snapshot = await locator.ariaSnapshot();
  const firstLine = String(snapshot || "").split(/\r?\n/).find(line => line.trim())?.trim() || "";
  const expectedPrefix = `- ${role} ${JSON.stringify(name)}`;
  expectTrue(firstLine.startsWith(expectedPrefix), `${label} literal AX role/name`, snapshot);
  return snapshot;
}

async function expectLiteralControlMatrix(page, matrix, scopeSelector, label){
  const scope = scopeSelector ? page.locator(scopeSelector) : page.locator("body");
  for (const item of matrix) {
    await expectAxName(scope.locator(item.selector), item.role, item.name, `${label}: ${item.name}`);
  }
}

async function focusAndPress(page, locator, key = "Enter"){
  await expectVisible(locator, `keyboard target ${key}`);
  await locator.focus();
  expectTrue(await locator.evaluate(element => document.activeElement === element), `keyboard target receives focus before ${key}`);
  await page.keyboard.press(key);
}

async function expectActiveElement(page, selector, label){
  try {
    await page.waitForFunction(target => document.activeElement === document.querySelector(target), selector);
  } catch (_error) {
    const actual = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return "null";
      const id = element.id ? `#${element.id}` : "";
      const classes = element.classList?.length ? `.${Array.from(element.classList).join(".")}` : "";
      return `${element.tagName}${id}${classes}`;
    });
    throw new Error(`${label}: expected active ${selector}, got ${actual}`);
  }
  expectTrue(await page.locator(selector).evaluate(element => document.activeElement === element), label);
}

async function expectFocusInside(page, selector, label){
  await page.waitForFunction(target => {
    const rootElement = document.querySelector(target);
    return !!rootElement && rootElement.contains(document.activeElement);
  }, selector);
  expectTrue(await page.evaluate(target => document.querySelector(target)?.contains(document.activeElement) === true, selector), label);
}

async function expectTopModal(page, { overlay, name, parentOverlay = null }){
  const overlayLocator = page.locator(overlay);
  await expectVisible(overlayLocator, `${name} overlay visible`);
  await expectAxName(overlayLocator.locator('[role="dialog"]'), "dialog", name, `${name} dialog`);
  expectEqual(await overlayLocator.getAttribute("aria-hidden"), "false", `${name} top overlay aria-hidden`);
  expectEqual(await overlayLocator.locator('[role="dialog"]').getAttribute("aria-modal"), "true", `${name} top dialog aria-modal`);
  expectTrue(await overlayLocator.evaluate(element => element.inert === false), `${name} top overlay is not inert`);
  expectTrue(await page.locator("#app").evaluate(element => element.inert === true), `${name} makes app inert`);
  expectTrue(await page.locator("body").evaluate(element => element.classList.contains("app-modal-open")), `${name} locks body scroll`);
  await expectFocusInside(page, overlay, `${name} owns focus`);
  if (parentOverlay) {
    const parent = page.locator(parentOverlay);
    expectEqual(await parent.getAttribute("aria-hidden"), "true", `${name} hides underlying dialog from AX tree`);
    expectTrue(await parent.evaluate(element => element.inert === true), `${name} makes underlying dialog inert`);
    expectEqual(await parent.locator('[role="dialog"]').getAttribute("aria-modal"), "false", `${name} removes modal claim from underlying dialog`);
  }
}

async function expectModalClosed(page, overlay, returnSelector, label){
  await page.locator(overlay).waitFor({ state: "hidden" });
  expectEqual(await page.locator(overlay).getAttribute("aria-hidden"), "true", `${label} closed aria-hidden`);
  if (returnSelector) await expectActiveElement(page, returnSelector, `${label} restores exact invoker focus`);
}

async function expectTabTrap(page, overlay, label){
  const count = await page.locator(overlay).evaluate(element => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type=hidden])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "summary",
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    return Array.from(element.querySelectorAll(selector)).filter(candidate => {
      const style = getComputedStyle(candidate);
      return candidate.tabIndex >= 0
        && !candidate.closest("[hidden], [inert]")
        && style.display !== "none"
        && style.visibility !== "hidden"
        && candidate.getClientRects().length > 0;
    }).length;
  });
  expectTrue(count > 0, `${label} has a keyboard target`);
  const cycles = Math.min(count + 2, 32);
  for (let index = 0; index < cycles; index += 1) {
    await page.keyboard.press("Tab");
    expectTrue(await page.evaluate(target => document.querySelector(target)?.contains(document.activeElement) === true, overlay), `${label} forward Tab stays in top dialog`, `step=${index + 1}`);
  }
  for (let index = 0; index < cycles; index += 1) {
    await page.keyboard.press("Shift+Tab");
    expectTrue(await page.evaluate(target => document.querySelector(target)?.contains(document.activeElement) === true, overlay), `${label} reverse Tab stays in top dialog`, `step=${index + 1}`);
  }
}

async function expectLiveRegion(page, selector, { role, live, text, invalidSelector = null, atomic = true }, label){
  const host = page.locator(selector);
  if (text) {
    await page.waitForFunction(({ target, expected }) => (
      (document.querySelector(target)?.textContent || "").includes(expected)
    ), { target: selector, expected: text });
  }
  expectEqual(await host.getAttribute("role"), role, `${label} role`);
  expectEqual(await host.getAttribute("aria-live"), live, `${label} aria-live`);
  if (atomic) expectEqual(await host.getAttribute("aria-atomic"), "true", `${label} aria-atomic`);
  if (text) expectTrue((await host.innerText()).includes(text), `${label} visible text`, await host.innerText());
  if (invalidSelector) {
    const invalid = page.locator(invalidSelector);
    expectEqual(await invalid.getAttribute("aria-invalid"), "true", `${label} aria-invalid`);
    expectEqual(await invalid.getAttribute("aria-errormessage"), selector.slice(1), `${label} aria-errormessage`);
    await expectActiveElement(page, invalidSelector, `${label} moves focus to the invalid control`);
  }
}

async function expectOnlyCurrentRoute(page, selector, panel, label){
  expectEqual(await page.locator(selector).getAttribute("aria-current"), "page", `${label} current route`);
  expectEqual(await page.locator(selector).getAttribute("aria-controls"), panel.slice(1), `${label} panel relationship`);
  expectEqual(await page.locator(`${selector}[aria-current="page"]`).count(), 1, `${label} selected route count`);
  expectEqual(await page.locator('.tab-btn[aria-current="page"]').count(), 1, `${label} app-wide single current route`);
  expectTrue(await page.locator(panel).isVisible(), `${label} current panel visible`);
}

async function openSettingsGroup(page, groupSelector){
  const group = page.locator(groupSelector);
  const toggle = group.locator(".settings-disclosure-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") {
    await focusAndPress(page, toggle, "Enter");
  }
  expectEqual(await toggle.getAttribute("aria-expanded"), "true", `${groupSelector} expanded`);
  return group;
}

async function openTodayRecordDialog(page){
  await focusAndPress(page, page.locator("#todayRecordStartBtn"), "Enter");
  await expectTopModal(page, { overlay: "#todayRecordStartOverlay", name: "오늘 식사를 기록할까요?" });
}

async function saveCurrentMealThroughUi(page, values = {}){
  if (!(await page.locator("#todayRecordStartOverlay").isVisible())) await openTodayRecordDialog(page);
  await page.locator("#todayRecordDetailedWeight").fill(String(values.weight ?? 75));
  await page.locator("#todayRecordMealLabel").selectOption(values.label || "점심");
  await page.locator("#todayRecordMealCarbs").fill(String(values.carbs ?? 220));
  await page.locator("#todayRecordMealProtein").fill(String(values.protein ?? 140));
  await page.locator("#todayRecordMealFat").fill(String(values.fat ?? 65));
  if (values.memo) await page.locator("#todayRecordMealMemo").fill(values.memo);
  await focusAndPress(page, page.locator("#todayRecordDetailedSaveBtn"), "Enter");
  await expectLiveRegion(page, "#todayRecordStartFeedback", {
    role: "status",
    live: "polite",
    text: "식사를 저장했습니다"
  }, "Today current meal save feedback");
}

async function closeTodayRecordDialogWithEscape(page){
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#todayRecordStartOverlay", "#todayRecordStartBtn", "Today record dialog");
}

async function completeTodayRecordThroughUi(page){
  const completeSelector = `[data-complete-detailed-record="${TODAY}"][data-record-action-source="today"]`;
  const reopenSelector = `[data-reopen-detailed-record="${TODAY}"][data-record-action-source="today"]`;
  const button = page.locator(completeSelector);
  await expectVisible(button, "Today completion button");
  await expectAxName(button, "button", "오늘 기록 완료", "Today completion replacement action");
  await button.focus();
  const dialogPromise = page.waitForEvent("dialog", { timeout: 10000 });
  const pressPromise = page.keyboard.press("Enter");
  const dialog = await dialogPromise;
  expectTrue(dialog.message().includes("기록을 완료할까요"), "Today completion asks literal confirmation", dialog.message());
  await dialog.accept();
  await pressPromise;
  await page.waitForFunction(() => document.getElementById("todayMealSummary")?.getAttribute("data-record-lifecycle") === "completed");
  await expectAxName(page.locator(reopenSelector), "button", "기록 다시 작성", "Today completed replacement action");
  await expectActiveElement(page, reopenSelector, "Today completion rerender focuses the replacement reopen action");
}

async function reopenTodayRecordThroughUi(page){
  const reopenSelector = `[data-reopen-detailed-record="${TODAY}"][data-record-action-source="today"]`;
  const completeSelector = `[data-complete-detailed-record="${TODAY}"][data-record-action-source="today"]`;
  const button = page.locator(reopenSelector);
  await expectAxName(button, "button", "기록 다시 작성", "Today reopen action");
  await button.focus();
  const dialogPromise = page.waitForEvent("dialog", { timeout: 10000 });
  const pressPromise = page.keyboard.press("Enter");
  const dialog = await dialogPromise;
  expectTrue(dialog.message().includes("기록을 다시 작성 중으로 바꿀까요"), "Today reopen asks literal confirmation", dialog.message());
  await dialog.accept();
  await pressPromise;
  await page.waitForFunction(() => document.getElementById("todayMealSummary")?.getAttribute("data-record-lifecycle") === "draft");
  await expectAxName(page.locator(completeSelector), "button", "오늘 기록 완료", "Today reopened replacement action");
  await expectActiveElement(page, completeSelector, "Today reopen rerender focuses the replacement completion action");
}

async function readDownload(download){
  const downloadPath = await download.path();
  expectTrue(!!downloadPath && fs.existsSync(downloadPath), "current backup download exists");
  const buffer = fs.readFileSync(downloadPath);
  const text = buffer.toString("utf8");
  expectTrue(!text.includes("\uFFFD"), "current backup download preserves UTF-8 Korean");
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`current backup download is not valid JSON: ${error.message}`);
  }
  return { buffer, text, json, filename: download.suggestedFilename() };
}

async function exportCurrentFullBackupWithKeyboard(page){
  const button = page.locator("#exportFullBackupBtn");
  await expectAxName(button, "button", "전체 백업 만들기", "current full-backup export action");
  await button.focus();
  await expectActiveElement(page, "#exportFullBackupBtn", "current full-backup export receives keyboard focus");
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await page.keyboard.press("Enter");
  return readDownload(await downloadPromise);
}

async function queueCurrentFullBackupImportWithKeyboard(page, backup){
  const importButton = page.locator("#importBackupBtn");
  await expectAxName(importButton, "button", "백업 불러오기", "current full-backup import action");
  await importButton.focus();
  await expectActiveElement(page, "#importBackupBtn", "current full-backup import receives keyboard focus");
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 10000 });
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: backup.filename || "macro-engine-full-backup-current.json",
    mimeType: "application/json",
    buffer: backup.buffer
  });
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => (document.getElementById("dataImportConfirmTitle")?.textContent || "").includes("백업"));
}

async function expectNoHorizontalOverflow(page, label){
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expectTrue(dimensions.documentScrollWidth <= dimensions.documentClientWidth + 1, `${label} document has no horizontal overflow`, formatValue(dimensions));
  expectTrue(dimensions.bodyScrollWidth <= dimensions.bodyClientWidth + 1, `${label} body has no horizontal overflow`, formatValue(dimensions));
}

async function expectRectInsideViewport(page, locator, label){
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
  expectTrue(rect.width > 0 && rect.height > 0, `${label} has a rendered rectangle`, formatValue(rect));
  expectTrue(rect.left >= -1 && rect.right <= rect.viewportWidth + 1, `${label} stays within mobile horizontal viewport`, formatValue(rect));
  expectTrue(rect.top >= -1 && rect.bottom <= rect.viewportHeight + 1, `${label} stays within mobile vertical viewport`, formatValue(rect));
}

async function expectFocusedElementInViewport(page, label){
  const state = await page.evaluate(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect?.();
    return {
      tag: element?.tagName || "",
      id: element?.id || "",
      left: rect?.left,
      right: rect?.right,
      top: rect?.top,
      bottom: rect?.bottom,
      width: rect?.width,
      height: rect?.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expectTrue(state.width > 0 && state.height > 0, `${label} focused element has geometry`, formatValue(state));
  expectTrue(state.right > 0 && state.left < state.viewportWidth && state.bottom > 0 && state.top < state.viewportHeight, `${label} focused element intersects viewport`, formatValue(state));
}

async function scenarioFreshOnboardingKeyboard({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await expectTopModal(page, { overlay: "#onboardingOverlay", name: "내 기준부터 설정할게요" });
  await expectActiveElement(page, "#onboardingStartBtn", "fresh onboarding initial focus");
  await expectTabTrap(page, "#onboardingOverlay", "fresh onboarding");
  await page.keyboard.press("Escape");
  expectTrue(await page.locator("#onboardingOverlay").isVisible(), "fresh onboarding cannot be dismissed with Escape");
  await expectFocusInside(page, "#onboardingOverlay", "fresh onboarding keeps focus after blocked Escape");

  await focusAndPress(page, page.locator("#onboardingStartBtn"), "Enter");
  await page.locator("#onboardingGender").selectOption("male");
  await page.locator("#onboardingAge").fill("32");
  await page.locator("#onboardingHeight").fill("173");
  await page.locator("#onboardingWeight").fill("75");
  await page.locator("#onboardingGoal").selectOption("maintain");
  await focusAndPress(page, page.locator("#onboardingNextBtn"), "Enter");
  await expectVisible(page.locator('.onboarding-step[data-onboarding-step="2"]'), "onboarding step 2");

  await page.locator("#onboardingActivityLevel").selectOption("moderate");
  await page.locator("#onboardingWorkType").selectOption("office");
  await page.locator("#onboardingSleepHours").fill("16");
  await page.locator("#onboardingWorkHours").fill("9");
  await page.locator("#onboardingLifestyleHours").fill("0");
  await focusAndPress(page, page.locator("#onboardingNextBtn"), "Enter");
  await expectLiveRegion(page, "#onboardingFeedback", {
    role: "alert",
    live: "assertive",
    text: "24시간",
    atomic: false
  }, "onboarding time validation");
  await expectActiveElement(page, "#onboardingSleepHours", "onboarding validation focuses the first invalid field");

  await page.locator("#onboardingSleepHours").fill("8");
  await page.locator("#onboardingWorkHours").fill("8");
  await page.locator("#onboardingLifestyleHours").fill("2");
  await focusAndPress(page, page.locator("#onboardingNextBtn"), "Enter");
  await expectVisible(page.locator('.onboarding-step[data-onboarding-step="3"]'), "onboarding step 3");
  await page.locator('input[name="onboardingExerciseMode"][value="general"]').check();
  await focusAndPress(page, page.locator("#onboardingNextBtn"), "Enter");
  await expectModalClosed(page, "#onboardingOverlay", "#todayRecordStartBtn", "fresh onboarding completion");
  expectTrue(await page.locator("#app").evaluate(element => element.inert === false), "completed onboarding releases app inert");
  expectTrue(await page.locator("body").evaluate(element => !element.classList.contains("app-modal-open")), "completed onboarding releases body scroll lock");
}

async function scenarioCoreNavigationTodayHelp({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await expectAxName(page.locator('nav[aria-label="주요 화면"]'), "navigation", "주요 화면", "primary navigation landmark");
  for (const route of B_LITERAL_ORACLE.routes) {
    await expectAxName(page.locator(route.selector), "button", route.name, `${route.name} route`);
    expectEqual(await page.locator(route.selector).getAttribute("aria-controls"), route.panel.slice(1), `${route.name} route controls literal panel`);
  }
  await expectOnlyCurrentRoute(page, "#tabToday", "#todayPanel", "Today initial route");
  await focusAndPress(page, page.locator("#tabRecords"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabRecords", "#recordsPanel", "Records keyboard route");
  await focusAndPress(page, page.locator("#tabToday"), "Space");
  await expectOnlyCurrentRoute(page, "#tabToday", "#todayPanel", "Today keyboard route");

  await expectAxName(page.locator("#todayQuickEditToggle"), "button", "펼치기", "Today quick disclosure");
  await focusAndPress(page, page.locator("#todayQuickEditToggle"), "Enter");
  expectEqual(await page.locator("#todayQuickEditToggle").getAttribute("aria-expanded"), "true", "Today quick disclosure expanded");
  expectEqual(await page.locator("#todayQuickEditToggle").getAttribute("aria-controls"), "todayQuickEditPanel", "Today quick disclosure controls its panel");
  await expectVisible(page.locator("#todayQuickEditPanel"), "Today quick edit panel");
  await expectActiveElement(page, "#todayQuickEditToggle", "Today quick rerender preserves disclosure focus");
  await expectLiteralControlMatrix(page, B_LITERAL_ORACLE.todayQuick, "#todayQuickEditPanel", "Today quick current control");

  const help = page.locator('#todayQuickActivityField .help-wrap[aria-label="생활활동 설명"]');
  await expectAxName(help, "button", "생활활동 설명", "Today lifestyle help trigger");
  expectEqual(await help.getAttribute("aria-describedby"), "todayQuickActivityLevelHelpTip", "Today lifestyle help literal relationship");
  expectEqual(await page.locator("#todayQuickActivityLevelHelpTip").getAttribute("role"), "tooltip", "Today lifestyle tooltip role");
  expectTrue((await page.locator("#todayQuickActivityLevelHelpTip").innerText()).includes("생활활동"), "Today lifestyle tooltip has literal useful content");
  await help.focus();
  expectEqual(await page.locator("#todayQuickActivityLevelHelpTip").evaluate(element => getComputedStyle(element).display), "block", "focused help is visible");
  await page.keyboard.press("Escape");
  expectTrue(await help.evaluate(element => element.classList.contains("is-tooltip-dismissed")), "Escape dismisses focused help");
  await expectActiveElement(page, '#todayQuickActivityField .help-wrap[aria-label="생활활동 설명"]', "Escape keeps help trigger focus");
  await page.keyboard.press("Enter");
  expectTrue(await help.evaluate(element => !element.classList.contains("is-tooltip-dismissed")), "Enter reopens focused help");
  expectEqual(await page.locator("#todayQuickActivityLevelHelpTip").evaluate(element => getComputedStyle(element).display), "block", "Enter exposes tooltip visually");
  expectEqual(await page.locator("#todayInputFeedback").getAttribute("role"), "status", "Today persistent feedback role");
  expectEqual(await page.locator("#todayInputFeedback").getAttribute("aria-live"), "polite", "Today persistent feedback live mode");
}

async function scenarioTodayNestedDialogAndLiveValidation({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await openTodayRecordDialog(page);
  await expectLiteralControlMatrix(page, B_LITERAL_ORACLE.todayRecord, "#todayRecordStartOverlay", "Today detailed record control");
  await expectActiveElement(page, "#todayRecordDetailedWeight", "Today record dialog initial focus");

  await page.locator("#todayRecordMealCarbs").fill("");
  await page.locator("#todayRecordMealProtein").fill("");
  await page.locator("#todayRecordMealFat").fill("");
  await focusAndPress(page, page.locator("#todayRecordDetailedSaveBtn"), "Enter");
  await expectLiveRegion(page, "#todayRecordStartFeedback", {
    role: "alert",
    live: "assertive",
    text: "저장할 식사 내용을 입력해 주세요",
    invalidSelector: "#todayRecordMealCarbs"
  }, "Today empty meal validation");

  await saveCurrentMealThroughUi(page, { carbs: 220, protein: 140, fat: 65, memo: "B 접근성 현재 식사" });
  expectEqual(await page.locator("#todayRecordMealCarbs").getAttribute("aria-invalid"), "false", "corrected meal input clears invalid state");
  const reuseButton = page.locator("#todayRecordMealReuseBtn");
  await focusAndPress(page, reuseButton, "Enter");
  await expectTopModal(page, {
    overlay: "#mealReuseOverlay",
    name: "최근 식사 불러오기",
    parentOverlay: "#todayRecordStartOverlay"
  });
  await expectTabTrap(page, "#mealReuseOverlay", "nested meal reuse dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#mealReuseOverlay", "#todayRecordMealReuseBtn", "nested meal reuse dialog");
  expectEqual(await page.locator("#todayRecordStartOverlay").getAttribute("aria-hidden"), "false", "parent dialog returns to AX tree");
  expectTrue(await page.locator("#todayRecordStartOverlay").evaluate(element => element.inert === false), "parent dialog stops being inert after child closes");
  expectEqual(await page.locator('#todayRecordStartOverlay [role="dialog"]').getAttribute("aria-modal"), "true", "parent resumes modal claim");
  await expectTabTrap(page, "#todayRecordStartOverlay", "Today record parent dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#todayRecordStartOverlay", "#todayRecordStartBtn", "Today record parent dialog");
  expectTrue(await page.locator("#app").evaluate(element => element.inert === false), "closing final nested stack releases app inert");
}

async function scenarioRecordsKeyboardAndNames({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await focusAndPress(page, page.locator("#tabRecords"), "Enter");
  const emptyMealOpenerSelector = ".selected-meals-surface-panel [data-open-record-meal-entry]";
  const emptyMealOpener = page.locator(emptyMealOpenerSelector);
  await focusAndPress(page, emptyMealOpener, "Enter");
  await expectTopModal(page, { overlay: "#todayRecordStartOverlay", name: "오늘 식사를 기록할까요?" });
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#todayRecordStartOverlay", emptyMealOpenerSelector, "Records empty-date meal dialog");

  await focusAndPress(page, page.locator("#tabToday"), "Enter");
  await openTodayRecordDialog(page);
  await saveCurrentMealThroughUi(page, { carbs: 210, protein: 135, fat: 60, memo: "B Records 현재 식사" });
  await closeTodayRecordDialogWithEscape(page);

  await focusAndPress(page, page.locator("#tabRecords"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabRecords", "#recordsPanel", "Records route");
  const archiveButtonSelector = `[data-select-record-date="${TODAY}"]`;
  const archiveButton = page.locator(archiveButtonSelector);
  await expectAxName(archiveButton, "button", "2026-08-14 금요일 식사 기록 있음 작성 중 식사 1건 +1 체중 있음", "Records current date archive button");
  await focusAndPress(page, archiveButton, "Enter");
  await expectActiveElement(page, archiveButtonSelector, "Records archive rerender preserves keyboard focus");
  await expectVisible(page.locator(`[data-record-detail-date="${TODAY}"]`), "Records current detail");

  const detailDateInputSelector = `[data-record-detail-date="${TODAY}"] [data-record-detail-date-picker]`;
  const detailDateInput = page.locator(detailDateInputSelector);
  await expectAxName(detailDateInput, "textbox", "기록 날짜 선택", "Records stored-detail date input");
  await detailDateInput.focus();
  await detailDateInput.fill(EMPTY_RECORD_DATE);
  await page.waitForFunction(date => document.getElementById("recordsWorkspaceDate")?.value === date, EMPTY_RECORD_DATE);
  await expectActiveElement(page, "#recordsWorkspaceDate", "Records stored-to-empty date change focuses the destination workspace input");
  expectEqual(await page.locator(`[data-record-detail-date="${EMPTY_RECORD_DATE}"]`).count(), 0, "Records empty destination has no stored detail");
  expectTrue((await page.locator("#recordWorkspaceStartHost").innerText()).includes("이 날짜에는 기록이 없습니다"), "Records empty destination exposes the literal empty state");

  const emptyWorkspaceDate = page.locator("#recordsWorkspaceDate");
  await expectAxName(emptyWorkspaceDate, "textbox", "날짜 선택", "Records empty-workspace date input");
  await emptyWorkspaceDate.fill(TODAY);
  await expectVisible(page.locator(`[data-record-detail-date="${TODAY}"]`), "Records stored detail restored from empty workspace");
  await expectActiveElement(page, detailDateInputSelector, "Records empty-to-stored date change focuses the replacement detail input");
  expectEqual(await page.locator(detailDateInputSelector).inputValue(), TODAY, "Records replacement detail input owns the literal stored date");

  const editButtonSelector = `[data-record-detail-date="${TODAY}"] [data-edit-record-date="${TODAY}"]`;
  await focusAndPress(page, page.locator(editButtonSelector), "Enter");
  const editRootSelector = `[data-record-detail-date="${TODAY}"][data-record-detail-edit="true"]`;
  await expectVisible(page.locator(editRootSelector), "Records current edit surface");
  await expectFocusInside(page, editRootSelector, "Records edit rerender moves focus into edit surface");
  const meals = page.locator(`${editRootSelector} details[data-record-detail-section="meals"]`);
  if (!(await meals.evaluate(element => element.open))) await focusAndPress(page, meals.locator(":scope > summary"), "Enter");
  const basis = page.locator(`${editRootSelector} details[data-record-detail-section="basis"]`);
  if (!(await basis.evaluate(element => element.open))) await focusAndPress(page, basis.locator(":scope > summary"), "Enter");
  await expectLiteralControlMatrix(page, B_LITERAL_ORACLE.recordEdit, editRootSelector, "Records current editor control");

  await page.locator("#recordDetailEditWeight").fill("-1");
  await focusAndPress(page, page.locator(`${editRootSelector} [data-detail-save="${TODAY}"]`), "Enter");
  await expectLiveRegion(page, "#recordFeedbackHost", {
    role: "alert",
    live: "assertive",
    text: "30~200kg",
    invalidSelector: "#recordDetailEditWeight"
  }, "Records invalid current weight feedback");
  await page.locator("#recordDetailEditWeight").fill("75");
  await page.waitForFunction(() => document.getElementById("recordDetailEditWeight")?.getAttribute("aria-invalid") === "false");
  expectEqual(await page.locator("#recordDetailEditWeight").getAttribute("aria-errormessage"), null, "corrected Records weight clears error ownership");

  const cancelSelector = `${editRootSelector} [data-detail-cancel="${TODAY}"]`;
  await focusAndPress(page, page.locator(cancelSelector), "Enter");
  await page.locator(editRootSelector).waitFor({ state: "hidden" });
  await expectActiveElement(page, editButtonSelector, "Records cancel restores edit invoker focus");
}

async function scenarioRecentAndInbodyKeyboard({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await openTodayRecordDialog(page);
  await saveCurrentMealThroughUi(page, { carbs: 230, protein: 145, fat: 62, memo: "B Recent 현재 식사" });
  await closeTodayRecordDialogWithEscape(page);
  await completeTodayRecordThroughUi(page);
  await reopenTodayRecordThroughUi(page);
  await completeTodayRecordThroughUi(page);

  await focusAndPress(page, page.locator("#tabWeekly"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabWeekly", "#weeklyPanel", "Recent route");
  const chartPoint = page.locator(`g[data-recent-flow-chart-date="${TODAY}"]`).first();
  await expectAxName(chartPoint, "button", `${TODAY} 기록 보기`, "Recent chart date action");
  await focusAndPress(page, chartPoint, "Enter");
  await expectOnlyCurrentRoute(page, "#tabRecords", "#recordsPanel", "Recent chart keyboard destination");
  expectEqual(await page.locator("#recordsWorkspaceDate").inputValue(), TODAY, "Recent chart opens the literal date");
  const selectedDateSelector = `[data-select-record-date="${TODAY}"]`;
  await expectActiveElement(page, selectedDateSelector, "Recent chart keyboard route focuses the selected Records date");

  await focusAndPress(page, page.locator("#tabWeekly"), "Enter");
  const dailyRowSelector = `.recent-flow-daily-row[data-recent-flow-chart-date="${TODAY}"]`;
  const dailyRow = page.locator(dailyRowSelector);
  await focusAndPress(page, dailyRow, "Enter");
  await expectTopModal(page, { overlay: "#recentFlowRecordOpenOverlay", name: "기록 탭으로 이동할까요?" });
  await expectActiveElement(page, "#recentFlowRecordOpenConfirm", "Recent daily row dialog initial focus");
  await expectTabTrap(page, "#recentFlowRecordOpenOverlay", "Recent daily row confirmation dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#recentFlowRecordOpenOverlay", dailyRowSelector, "Recent daily row confirmation dialog");

  await focusAndPress(page, dailyRow, "Enter");
  await expectTopModal(page, { overlay: "#recentFlowRecordOpenOverlay", name: "기록 탭으로 이동할까요?" });
  await expectActiveElement(page, "#recentFlowRecordOpenConfirm", "Recent daily row reopened dialog initial focus");
  await focusAndPress(page, page.locator("#recentFlowRecordOpenConfirm"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabRecords", "#recordsPanel", "Recent daily row confirmed destination");
  expectEqual(await page.locator("#recordsWorkspaceDate").inputValue(), TODAY, "Recent daily row opens the literal date");
  await expectActiveElement(page, selectedDateSelector, "Recent daily row confirmation focuses the selected Records date");

  await focusAndPress(page, page.locator("#tabInbody"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabInbody", "#inbodyPanel", "InBody route");
  await expectLiteralControlMatrix(page, B_LITERAL_ORACLE.inbody, "#inbodyPanel", "InBody current input");
  await page.locator("#inbodyDate").fill(TODAY);
  await page.locator("#inbodyWeight").fill("");
  await page.locator("#inbodySkeletalMuscle").fill("35");
  await page.locator("#inbodyBodyFat").fill("15");
  await focusAndPress(page, page.locator("#saveInbodyBtn"), "Enter");
  await expectLiveRegion(page, "#inbodyFeedback", {
    role: "alert",
    live: "assertive",
    text: "체중을 0보다 큰 숫자로 입력해 주세요",
    invalidSelector: "#inbodyWeight"
  }, "InBody invalid weight feedback");

  await page.locator("#inbodyWeight").fill("75");
  await focusAndPress(page, page.locator("#saveInbodyBtn"), "Enter");
  await expectLiveRegion(page, "#inbodyFeedback", {
    role: "status",
    live: "polite",
    text: "저장"
  }, "InBody current save feedback");

  const summaryTab = page.locator("#inbodyViewSummaryTab");
  await expectAxName(summaryTab, "tab", "입력", "InBody input tab");
  await summaryTab.focus();
  await page.keyboard.press("ArrowRight");
  await expectActiveElement(page, "#inbodyViewDetailTab", "InBody ArrowRight moves focus");
  expectEqual(await page.locator("#inbodyViewDetailTab").getAttribute("aria-selected"), "true", "InBody ArrowRight selects analysis tab");
  expectEqual(await page.locator("#inbodyViewSummaryTab").getAttribute("tabindex"), "-1", "InBody roving tabindex removes old tab");
  expectEqual(await page.locator("#inbodyViewDetailTab").getAttribute("tabindex"), "0", "InBody roving tabindex exposes selected tab");
  await page.keyboard.press("End");
  await expectActiveElement(page, "#inbodyViewTrendTab", "InBody End moves to last tab");
  await page.keyboard.press("Home");
  await expectActiveElement(page, "#inbodyViewSummaryTab", "InBody Home returns to first tab");

  await focusAndPress(page, page.locator("#viewInbodyRecordsBtn"), "Enter");
  await expectTopModal(page, { overlay: "#inbodyHistoryOverlay", name: "InBody 측정 기록" });
  await expectTabTrap(page, "#inbodyHistoryOverlay", "InBody history dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#inbodyHistoryOverlay", "#viewInbodyRecordsBtn", "InBody history dialog");
}

async function scenarioSettingsAndCurrentBackup({ page, baseUrl }){
  // Native save pickers live outside the page and cannot be driven by
  // Playwright. Chromium's supported no-picker capability branch still runs
  // the real current export producer and yields the browser download consumed
  // by the real current import file chooser below.
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined
    });
  });
  await loadApp(page, baseUrl);
  expectEqual(await page.evaluate(() => typeof window.showSaveFilePicker), "undefined", "headless backup scenario uses the current download fallback capability");
  await focusAndPress(page, page.locator("#tabSettings"), "Enter");
  await expectOnlyCurrentRoute(page, "#tabSettings", "#settingsPanel", "Settings route");
  await openSettingsGroup(page, ".settings-profile-group");
  await openSettingsGroup(page, ".settings-lifestyle-group");
  await openSettingsGroup(page, ".settings-training-group");
  await expectLiteralControlMatrix(page, B_LITERAL_ORACLE.settings, "#settingsPanel", "Settings current control");
  const lifestyleHelp = page.locator('#settingsPanel .settings-lifestyle-group .help-wrap[aria-label="생활활동 설명"]');
  await expectAxName(lifestyleHelp, "button", "생활활동 설명", "Settings lifestyle help trigger");
  expectEqual(await lifestyleHelp.getAttribute("aria-describedby"), "activityLevelHelpTip", "Settings lifestyle help literal relationship");
  expectEqual(await page.locator("#activityLevelHelpTip").getAttribute("role"), "tooltip", "Settings lifestyle help tooltip role");

  const goalCard = page.locator('[data-settings-choice-open="goal"]');
  await goalCard.focus();
  await page.keyboard.press("Space");
  await expectTopModal(page, { overlay: "#settingsGoalChoiceOverlay", name: "목표 설정" });
  await expectActiveElement(page, "#settingsGoalChoiceClose", "Settings goal dialog initial focus");
  await expectTabTrap(page, "#settingsGoalChoiceOverlay", "Settings goal dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#settingsGoalChoiceOverlay", '[data-settings-choice-open="goal"]', "Settings goal dialog");

  const backup = await exportCurrentFullBackupWithKeyboard(page);
  expectEqual(backup.json.app, "macro-engine", "current full backup app identity");
  expectEqual(backup.json.kind, "full-backup", "current full backup kind");
  expectEqual(backup.json.backupVersion, 2, "current full backup version");
  await queueCurrentFullBackupImportWithKeyboard(page, backup);
  await expectTopModal(page, { overlay: "#dataImportConfirmOverlay", name: "백업을 어떻게 불러올까요?" });
  await expectTabTrap(page, "#dataImportConfirmOverlay", "current backup import dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#dataImportConfirmOverlay", "#importBackupBtn", "current backup import dialog");
  await expectLiveRegion(page, "#dataManagementFeedback", {
    role: "status",
    live: "polite",
    text: "불러오기를 취소했습니다"
  }, "current backup cancel feedback");

  await page.evaluate(prefix => {
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .forEach(key => localStorage.removeItem(key));
  }, STORAGE_PREFIX);
  await loadApp(page, baseUrl);
  await expectTopModal(page, { overlay: "#onboardingOverlay", name: "내 기준부터 설정할게요" });
  const onboardingRestore = page.locator("#onboardingRestoreBtn");
  await expectAxName(onboardingRestore, "button", "백업 불러오기", "fresh onboarding current-backup restore action");
  await onboardingRestore.focus();
  await expectActiveElement(page, "#onboardingRestoreBtn", "fresh onboarding restore receives keyboard focus");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 20000 }),
    onboardingRestore.press("Enter")
  ]);
  await chooser.setFiles({
    name: backup.filename || "macro-engine-full-backup-current.json",
    mimeType: "application/json",
    buffer: backup.buffer
  });
  await page.locator("#dataImportConfirmOverlay").waitFor({ state: "visible", timeout: 10000 });
  await expectTopModal(page, {
    overlay: "#dataImportConfirmOverlay",
    name: "백업을 어떻게 불러올까요?",
    parentOverlay: "#onboardingOverlay"
  });
  await expectAxName(page.locator("[data-confirm-data-import]"), "button", "전체 복원", "onboarding current full-backup preview action");
  await expectActiveElement(page, "[data-confirm-data-import]", "onboarding current full-backup preview initial focus");
  await expectTabTrap(page, "#dataImportConfirmOverlay", "onboarding nested current-backup preview dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#dataImportConfirmOverlay", "#onboardingRestoreBtn", "onboarding nested current-backup preview dialog");
  expectEqual(await page.locator("#onboardingOverlay").getAttribute("aria-hidden"), "false", "onboarding returns to the AX tree after preview cancel");
  expectTrue(await page.locator("#onboardingOverlay").evaluate(element => element.inert === false), "onboarding stops being inert after preview cancel");
  expectEqual(await page.locator('#onboardingOverlay [role="dialog"]').getAttribute("aria-modal"), "true", "onboarding resumes the modal claim after preview cancel");
  expectTrue(await page.locator("#app").evaluate(element => element.inert === true), "fresh onboarding keeps the app inert after nested preview closes");
}

async function scenarioMobileDialogAndFocus({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await expectNoHorizontalOverflow(page, "mobile initial app");
  await openTodayRecordDialog(page);
  await expectRectInsideViewport(page, page.locator('#todayRecordStartOverlay [role="dialog"]'), "mobile Today record dialog");
  await expectFocusedElementInViewport(page, "mobile Today initial focus");
  await expectNoHorizontalOverflow(page, "mobile Today dialog");

  await focusAndPress(page, page.locator("#todayRecordMealReuseBtn"), "Enter");
  await expectTopModal(page, {
    overlay: "#mealReuseOverlay",
    name: "최근 식사 불러오기",
    parentOverlay: "#todayRecordStartOverlay"
  });
  await expectRectInsideViewport(page, page.locator('#mealReuseOverlay [role="dialog"]'), "mobile nested meal reuse dialog");
  await expectFocusedElementInViewport(page, "mobile nested dialog focus");
  await expectNoHorizontalOverflow(page, "mobile nested dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#mealReuseOverlay", "#todayRecordMealReuseBtn", "mobile nested meal reuse dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#todayRecordStartOverlay", "#todayRecordStartBtn", "mobile Today record dialog");

  await focusAndPress(page, page.locator("#tabSettings"), "Enter");
  const goalCard = page.locator('[data-settings-choice-open="goal"]');
  await focusAndPress(page, goalCard, "Enter");
  await expectTopModal(page, { overlay: "#settingsGoalChoiceOverlay", name: "목표 설정" });
  await expectRectInsideViewport(page, page.locator('#settingsGoalChoiceOverlay [role="dialog"]'), "mobile Settings goal dialog");
  await expectFocusedElementInViewport(page, "mobile Settings goal focus");
  await expectNoHorizontalOverflow(page, "mobile Settings goal dialog");
  await page.keyboard.press("Escape");
  await expectModalClosed(page, "#settingsGoalChoiceOverlay", '[data-settings-choice-open="goal"]', "mobile Settings goal dialog");
  await expectFocusedElementInViewport(page, "mobile restored Settings focus");
  const minimumTarget = await page.locator("#tabToday").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expectTrue(minimumTarget.width >= 24 && minimumTarget.height >= 24, "mobile primary navigation target is at least 24 CSS px", formatValue(minimumTarget));
}

const scenarios = [
  {
    name: "B-E2E-01 fresh onboarding keyboard focus inert and assertive validation",
    seed: {},
    viewport: { width: 1280, height: 900 },
    run: scenarioFreshOnboardingKeyboard
  },
  {
    name: "B-E2E-02 core navigation Today literal names help and live regions",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioCoreNavigationTodayHelp
  },
  {
    name: "B-E2E-03 Today current meal validation and nested dialog stack",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioTodayNestedDialogAndLiveValidation
  },
  {
    name: "B-E2E-04 Records date replacement focus editor names invalid live error and focus return",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioRecordsKeyboardAndNames
  },
  {
    name: "B-E2E-05 Today lifecycle Recent direct-confirm paths and InBody keyboard accessibility",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioRecentAndInbodyKeyboard
  },
  {
    name: "B-E2E-06 Settings and onboarding current full-backup nested import lifecycle",
    seed: storage(),
    viewport: { width: 1280, height: 900 },
    run: scenarioSettingsAndCurrentBackup
  },
  {
    name: "B-E2E-07 mobile 390 dialog geometry focus containment and overflow",
    seed: storage(),
    viewport: { width: 390, height: 844 },
    run: scenarioMobileDialogAndFocus
  }
];

async function run(){
  expectTrue(scenarios.length <= 7, "B Chromium E2E scenario upper bound");
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
    if (!selectedScenarios.length) throw new Error(`no B E2E scenario matched: ${scenarioFilter}`);

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
      await installSeedAndClock(context, scenario.seed);
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
    contract: "b-core-flow-accessibility-chromium-e2e-v1",
    oracle: "test-owned literal Korean AX names and actual Chromium keyboard/focus/inert/live DOM; current UI producers only; no production helper oracle or legacy fixture",
    scenarioUpperBound: 7,
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
