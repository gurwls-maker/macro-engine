const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_PREFIX = "runstep_macro_v1_";
const FAKE_NOW_KEY = "__macro_engine_a2_fake_now__";
const SEED_MARKER_KEY = "__macro_engine_a2_seeded__";
const TODAY = "2026-08-14";
const YESTERDAY = "2026-08-13";
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
      // about:blank has no usable localStorage; this init script runs again for index.html.
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
    function A2Date(...args){
      if (!(this instanceof A2Date)) return new NativeDate(readNow()).toString();
      return args.length ? new NativeDate(...args) : new NativeDate(readNow());
    }
    A2Date.prototype = NativeDate.prototype;
    Object.setPrototypeOf(A2Date, NativeDate);
    A2Date.now = readNow;
    A2Date.parse = NativeDate.parse;
    A2Date.UTC = NativeDate.UTC;
    window.Date = A2Date;
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

async function rawRecords(page){
  return page.evaluate(key => localStorage.getItem(key), `${STORAGE_PREFIX}records`);
}

async function records(page){
  const raw = await rawRecords(page);
  try {
    return JSON.parse(raw || "[]");
  } catch (error) {
    throw new Error(`records is not valid JSON: ${error.message}; raw=${raw}`);
  }
}

async function recordFor(page, date){
  return (await records(page)).find(record => record.date === date) || null;
}

function expectDraftRecord(record, label){
  expectTrue(!!record, `${label} exists`);
  expectEqual(record.recordLifecycle, "draft", `${label} lifecycle`);
  expectEqual(record.adherencePercent, null, `${label} stored score`);
  expectEqual(record.adherenceScoringVersion, null, `${label} stored scoring version`);
  expectEqual(record.adherenceLockedAt, null, `${label} score lock`);
  expectEqual(record.completedAt, null, `${label} completion time`);
  expectEqual(record.completionEvidenceSignature, null, `${label} completion evidence`);
}

function expectCompletedRecord(record, label){
  expectTrue(!!record, `${label} exists`);
  expectEqual(record.recordLifecycle, "completed", `${label} lifecycle`);
  expectEqual(record.adherenceSource, "auto", `${label} score source`);
  expectTrue(Number.isFinite(record.adherencePercent), `${label} has a finite score`, formatValue(record));
  expectTrue(record.adherencePercent >= 0 && record.adherencePercent <= 100, `${label} score stays in display range`, formatValue(record.adherencePercent));
  expectTrue(typeof record.adherenceScoringVersion === "string" && record.adherenceScoringVersion.length > 0, `${label} has a scoring version`);
  expectTrue(typeof record.completedAt === "string" && Number.isFinite(Date.parse(record.completedAt)), `${label} has an ISO completion time`, formatValue(record.completedAt));
  expectEqual(record.adherenceLockedAt, record.completedAt, `${label} score lock matches completion`);
  expectTrue(typeof record.completionEvidenceSignature === "string" && record.completionEvidenceSignature.length > 0, `${label} has completion evidence`);
}

async function reload(page){
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 90000 });
}

async function clickAndHandleDialog(locator, page, action){
  const count = await locator.count();
  expectEqual(count, 1, "dialog trigger resolves to one element");
  await locator.waitFor({ state: "visible" });
  const dialogPromise = page.waitForEvent("dialog", { timeout: 7000 });
  const clickPromise = locator.click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  if (action === "accept") await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
  return message;
}

async function addMealFromToday(page, values = {}){
  await page.locator("#tabToday").click();
  await page.locator("#todayRecordStartBtn").click();
  await page.locator("#todayRecordStartOverlay").waitFor({ state: "visible" });
  await page.locator("#todayRecordDetailedWeight").fill(String(values.weight ?? 75));
  await page.locator("#todayRecordMealLabel").selectOption(values.label || "점심");
  await page.locator("#todayRecordMealCarbs").fill(String(values.carbs ?? 260));
  await page.locator("#todayRecordMealProtein").fill(String(values.protein ?? 150));
  await page.locator("#todayRecordMealFat").fill(String(values.fat ?? 70));
  if (values.memo) await page.locator("#todayRecordMealMemo").fill(values.memo);
  await page.locator("#todayRecordDetailedSaveBtn").click();
  await page.waitForFunction(() => (document.getElementById("todayRecordStartFeedback")?.textContent || "").includes("식사를 저장했습니다"));
  await page.locator("#todayRecordStartOverlay [data-record-start-close]").click();
}

async function addMealFromRecords(page, date, values = {}){
  await page.locator("#tabRecords").click();
  await page.locator("#recordsWorkspaceDate").fill(date);
  await page.locator("#recordsWorkspaceDate").dispatchEvent("change");
  await page.locator("[data-open-record-meal-entry]").click();
  await page.locator("#todayRecordStartOverlay").waitFor({ state: "visible" });
  await page.locator("#todayRecordDetailedWeight").fill(String(values.weight ?? 75));
  await page.locator("#todayRecordMealLabel").selectOption(values.label || "점심");
  await page.locator("#todayRecordMealCarbs").fill(String(values.carbs ?? 240));
  await page.locator("#todayRecordMealProtein").fill(String(values.protein ?? 145));
  await page.locator("#todayRecordMealFat").fill(String(values.fat ?? 68));
  if (values.memo) await page.locator("#todayRecordMealMemo").fill(values.memo);
  await page.locator("#todayRecordDetailedSaveBtn").click();
  await page.waitForFunction(() => (document.getElementById("todayRecordStartFeedback")?.textContent || "").includes("식사를 저장했습니다"));
  await page.locator("#todayRecordStartOverlay [data-record-start-close]").click();
}

async function completeToday(page, action = "accept"){
  await page.locator("#tabToday").click();
  const button = page.locator(`[data-complete-detailed-record="${TODAY}"][data-record-action-source="today"]`);
  const message = await clickAndHandleDialog(button, page, action);
  expectTrue(message.includes("기록을 완료할까요"), "Today completion uses an explicit confirmation", message);
}

async function completeFromRecords(page, date, action = "accept"){
  await page.locator("#tabRecords").click();
  await page.locator(`[data-record-card-date="${date}"]`).click();
  const button = page.locator(`[data-record-detail-date="${date}"] [data-complete-detailed-record="${date}"]`);
  const buttonCount = await button.count();
  if (buttonCount !== 1) {
    const record = await recordFor(page, date);
    const detailText = await page.locator(`[data-record-detail-date="${date}"]`).allInnerTexts();
    throw new Error(`Records completion action exists for ${date}: count=${buttonCount}; record=${formatValue(record)}; detail=${formatValue(detailText)}`);
  }
  const message = await clickAndHandleDialog(button, page, action);
  expectTrue(message.includes("기록을 완료할까요"), "Records completion uses an explicit confirmation", message);
}

async function openRecordDetailEdit(page, date){
  await page.locator("#tabRecords").click();
  await page.locator(`[data-record-card-date="${date}"]`).click();
  await page.locator(`[data-record-detail-date="${date}"] [data-edit-record-date="${date}"]`).click();
  const rootLocator = page.locator(`[data-record-detail-date="${date}"][data-record-detail-edit="true"]`);
  await rootLocator.waitFor({ state: "visible" });
  return rootLocator;
}

async function openDetailSection(rootLocator, name){
  const details = rootLocator.locator(`details[data-record-detail-section="${name}"]`);
  if (!(await details.evaluate(element => element.open))) await details.locator(":scope > summary").click();
  return details;
}

async function scenarioDraftPersistence({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromToday(page, { carbs: 260, protein: 150, fat: 70, memo: "A2 작성 중" });
  let record = await recordFor(page, TODAY);
  expectDraftRecord(record, "new Today meal record");
  const mealText = await page.locator("#todayMealSummary").innerText();
  expectEqual(await page.locator("#todayMealSummary").getAttribute("data-record-lifecycle"), "draft", "Today meal DOM lifecycle");
  expectTrue(mealText.includes("작성 중") && mealText.includes("미리보기") && mealText.includes("기간 분석에 사용하지 않습니다"), "Today explains draft preview without analysis authority", mealText);
  const scoreText = await page.locator("#todayAdherenceContent").innerText();
  expectTrue(scoreText.includes("점") || scoreText.includes("기록 진행 중"), "Today renders a live score or progress preview", scoreText);

  await reload(page);
  record = await recordFor(page, TODAY);
  expectDraftRecord(record, "reloaded Today draft");
  expectEqual(await page.locator("#todayMealSummary").getAttribute("data-record-lifecycle"), "draft", "reloaded Today DOM lifecycle");
  expectTrue((await page.locator("#todayMealSummary").innerText()).includes("작성 중"), "reload keeps draft wording");
}

async function scenarioCompletionCancelAccept({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromToday(page);
  const beforeCancel = await rawRecords(page);
  await completeToday(page, "dismiss");
  expectEqual(await rawRecords(page), beforeCancel, "cancelled completion leaves raw records byte-identical");
  expectDraftRecord(await recordFor(page, TODAY), "cancelled Today completion");

  await completeToday(page, "accept");
  let record = await recordFor(page, TODAY);
  expectCompletedRecord(record, "accepted Today completion");
  const completedRaw = await rawRecords(page);
  const score = record.adherencePercent;
  expectEqual(await page.locator("#todayMealSummary").getAttribute("data-record-lifecycle"), "completed", "completed Today DOM lifecycle");
  const completedText = await page.locator("#todayMealSummary").innerText();
  expectTrue(completedText.includes("사용자 완료") && completedText.includes("기간 분석에 사용합니다"), "completed Today wording grants analysis authority", completedText);
  const scoreText = await page.locator("#todayAdherenceContent").innerText();
  expectTrue(scoreText.includes(String(Math.round(score))), "completed Today displays the stored score", `stored=${score}; DOM=${scoreText}`);

  await reload(page);
  record = await recordFor(page, TODAY);
  expectCompletedRecord(record, "reloaded completed Today record");
  expectEqual(await rawRecords(page), completedRaw, "completed record reload is byte-stable");
  const reloadedScoreText = await page.locator("#todayAdherenceContent").innerText();
  expectTrue(reloadedScoreText.includes(String(Math.round(score))), "reload displays the same stored score", `stored=${score}; DOM=${reloadedScoreText}`);
}

async function scenarioMutationInvalidation({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromToday(page, { label: "점심", carbs: 250, protein: 145, fat: 65 });
  await completeToday(page);
  const firstCompleted = await recordFor(page, TODAY);
  expectCompletedRecord(firstCompleted, "initial completed record");

  const noteRoot = await openRecordDetailEdit(page, TODAY);
  await noteRoot.locator('[data-detail-field="weight"]').fill("75.50");
  await noteRoot.locator('[data-detail-field="note"]').fill("점수와 무관한 메모");
  await noteRoot.locator(`[data-detail-save="${TODAY}"]`).click();
  let record = await recordFor(page, TODAY);
  expectCompletedRecord(record, "fasting-weight and note edit");
  expectEqual(record.weight, 75.5, "fasting-weight edit persists the visible value");
  expectEqual(record.adherencePercent, firstCompleted.adherencePercent, "non-score edit preserves stored score");
  expectEqual(record.completionEvidenceSignature, firstCompleted.completionEvidenceSignature, "non-score edit preserves completion evidence");
  const keepTodayButton = page.locator("#recordWeightTodayKeepBtn");
  if (await keepTodayButton.isVisible()) await keepTodayButton.click();

  await addMealFromToday(page, { label: "저녁", carbs: 20, protein: 10, fat: 5 });
  record = await recordFor(page, TODAY);
  expectDraftRecord(record, "meal add invalidation");
  expectEqual(record.meals.length, 2, "meal add keeps both meals while invalidating completion");

  await completeToday(page);
  expectCompletedRecord(await recordFor(page, TODAY), "recompleted after meal add");
  const editRoot = await openRecordDetailEdit(page, TODAY);
  await openDetailSection(editRoot, "meals");
  const firstCarbs = editRoot.locator('[data-detail-meal-row="0"] [data-detail-meal-field="carbs"]');
  const changedCarbs = Number(await firstCarbs.inputValue()) + 1;
  await firstCarbs.fill(String(changedCarbs));
  await firstCarbs.dispatchEvent("change");
  await editRoot.locator(`[data-detail-save="${TODAY}"]`).click();
  record = await recordFor(page, TODAY);
  expectDraftRecord(record, "meal nutrition edit invalidation");
  expectEqual(record.meals[0].carbs, changedCarbs, "nutrition edit persists the visible value");

  await completeFromRecords(page, TODAY);
  expectCompletedRecord(await recordFor(page, TODAY), "recompleted after meal edit");
  const deleteRoot = await openRecordDetailEdit(page, TODAY);
  await openDetailSection(deleteRoot, "meals");
  const deleteButton = deleteRoot.locator('[data-detail-meal-row="1"] [data-detail-delete-meal]');
  const deleteMessage = await clickAndHandleDialog(deleteButton, page, "accept");
  expectTrue(deleteMessage.includes("삭제"), "meal delete uses an explicit confirmation", deleteMessage);
  await deleteRoot.locator(`[data-detail-save="${TODAY}"]`).click();
  record = await recordFor(page, TODAY);
  expectDraftRecord(record, "meal delete invalidation");
  expectEqual(record.meals.length, 1, "meal delete persists without retaining stale completion");
}

async function scenarioTodayBasisDrift({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromToday(page);
  await completeToday(page);
  const completedRaw = await rawRecords(page);
  expectCompletedRecord(await recordFor(page, TODAY), "basis drift starting record");

  await page.locator("#todayQuickEditToggle").click();
  const duration = page.locator("#todayQuickWeightDuration");
  await duration.fill("30");
  await duration.press("Tab");
  await page.waitForFunction(() => !document.getElementById("todayRecordStatusPanel")?.classList.contains("hidden"));
  expectEqual(await rawRecords(page), completedRaw, "passive Today basis drift leaves completed raw record unchanged");
  expectCompletedRecord(await recordFor(page, TODAY), "passive basis drift record");
  const statusText = await page.locator("#todayRecordStatusPanel").innerText();
  expectTrue(statusText.includes("다름") || statusText.includes("기준"), "Today visibly explains the basis drift", statusText);

  const updateButton = page.locator("#todayRecordStatusPanel [data-update-today-record-basis]");
  expectTrue(await updateButton.isVisible(), "basis drift exposes an explicit update action");
  await updateButton.click();
  const record = await recordFor(page, TODAY);
  expectDraftRecord(record, "explicit Today basis update");
  expectEqual(record.snapshotSource, "today_manual_confirm", "explicit basis update records its visible ownership source");
}

async function scenarioPastRecordsRecompletion({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromRecords(page, YESTERDAY, { carbs: 235, protein: 140, fat: 66, memo: "과거 기록" });
  let record = await recordFor(page, YESTERDAY);
  expectDraftRecord(record, "new past Records draft");
  expectEqual(record.goalSnapshot, null, "past meal entry does not borrow the current Today basis");
  await page.locator("#tabRecords").click();
  await page.locator(`[data-record-card-date="${YESTERDAY}"]`).click();
  const basisConfirmButton = page.locator(`[data-record-detail-date="${YESTERDAY}"] [data-edit-record-date="${YESTERDAY}"]`);
  expectEqual((await basisConfirmButton.innerText()).trim(), "계산 기준 확인", "snapshotless past draft names the required user action");
  await basisConfirmButton.click();
  const confirmRoot = page.locator(`[data-record-detail-date="${YESTERDAY}"][data-record-detail-edit="true"]`);
  await confirmRoot.waitFor({ state: "visible" });
  await confirmRoot.locator(`[data-detail-save="${YESTERDAY}"]`).click();
  record = await recordFor(page, YESTERDAY);
  expectDraftRecord(record, "past draft after explicit basis confirmation");
  expectTrue(!!record.goalSnapshot, "explicit Records basis confirmation creates a date-owned snapshot", formatValue(record));
  await completeFromRecords(page, YESTERDAY);
  const firstCompleted = await recordFor(page, YESTERDAY);
  expectCompletedRecord(firstCompleted, "past Records completion");

  const rootLocator = await openRecordDetailEdit(page, YESTERDAY);
  await openDetailSection(rootLocator, "basis");
  const duration = rootLocator.locator('[data-detail-basis-field="weightDuration"]');
  await duration.fill("30");
  await duration.dispatchEvent("change");
  await rootLocator.locator(`[data-detail-save="${YESTERDAY}"]`).click();
  record = await recordFor(page, YESTERDAY);
  expectDraftRecord(record, "past basis edit invalidation");
  expectEqual(record.goalSnapshot.weightDuration, 30, "past basis edit stores the visible duration");
  expectEqual(record.snapshotSource, "record_detail_edit", "past basis edit owns its recalculated snapshot");

  await completeFromRecords(page, YESTERDAY);
  record = await recordFor(page, YESTERDAY);
  expectCompletedRecord(record, "past record recompletion");
  expectTrue(record.completedAt >= firstCompleted.completedAt, "past recompletion refreshes or preserves a valid completion time");
  await reload(page);
  record = await recordFor(page, YESTERDAY);
  expectCompletedRecord(record, "reloaded past recompletion");
  expectEqual(record.goalSnapshot.weightDuration, 30, "reloaded past completion keeps edited basis");
}

async function scenarioMixedAuthority({ page, baseUrl }){
  await loadApp(page, baseUrl);
  await addMealFromRecords(page, YESTERDAY, { carbs: 120, protein: 80, fat: 40, memo: "분석 제외 draft" });
  await addMealFromToday(page, { carbs: 255, protein: 148, fat: 68, memo: "분석 포함 completed" });
  await completeToday(page);
  expectDraftRecord(await recordFor(page, YESTERDAY), "mixed draft record");
  const completed = await recordFor(page, TODAY);
  expectCompletedRecord(completed, "mixed completed record");

  await page.locator("#tabRecords").click();
  const draftCardText = await page.locator(`[data-record-card-date="${YESTERDAY}"]`).innerText();
  const completedCardText = await page.locator(`[data-record-card-date="${TODAY}"]`).innerText();
  expectTrue(draftCardText.includes("작성 중"), "draft archive card is visibly provisional", draftCardText);
  expectTrue(!draftCardText.includes("점수 "), "draft archive card does not present an analysis score", draftCardText);
  expectTrue(completedCardText.includes("사용자 완료") && completedCardText.includes(`점수 ${completed.adherencePercent}`), "completed archive card presents stored authority", completedCardText);

  await page.locator("#tabWeekly").click();
  const summaryText = await page.locator("#weeklySummaryRows").innerText();
  expectTrue(summaryText.includes("식단 기록\n1/7일") || summaryText.includes("식단 기록 1/7일"), "recent-flow diet analysis counts only the completed record", summaryText);
  expectTrue(summaryText.includes("체중 기록\n2/7일") || summaryText.includes("체중 기록 2/7일"), "recent-flow still distinguishes both literal weight records", summaryText);
  expectTrue(summaryText.includes("기록 종류\n상세 1일") || summaryText.includes("기록 종류 상세 1일"), "recent-flow detailed source count excludes the draft", summaryText);
  const flowText = await page.locator("#recentFlowPreviewHost").innerText();
  expectTrue(flowText.includes(`${completed.adherencePercent}%`), "recent-flow execution rate uses the completed stored score", flowText);
}

const scenarios = [
  {
    name: "A2-E2E-01 Today draft preview has no stored score and survives reload",
    seed: storage(),
    run: scenarioDraftPersistence
  },
  {
    name: "A2-E2E-02 completion cancel is byte-noop and accept persists exact authority",
    seed: storage(),
    run: scenarioCompletionCancelAccept
  },
  {
    name: "A2-E2E-03 nutrition add edit delete invalidate while weight and note preserve completion",
    seed: storage(),
    run: scenarioMutationInvalidation
  },
  {
    name: "A2-E2E-04 passive Today basis drift preserves and explicit update invalidates",
    seed: storage(),
    run: scenarioTodayBasisDrift
  },
  {
    name: "A2-E2E-05 past Records completion basis edit and recompletion",
    seed: storage(),
    run: scenarioPastRecordsRecompletion
  },
  {
    name: "A2-E2E-06 mixed completed and draft records keep analysis authority separate",
    seed: storage(),
    run: scenarioMixedAuthority
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
    if (!selectedScenarios.length) throw new Error(`no A2 E2E scenario matched: ${scenarioFilter}`);
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
      await installSeedAndClock(context, scenario.seed);
      const page = await context.newPage();
      page.setDefaultTimeout(9000);
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
    contract: "a2-current-record-score-lifecycle-e2e-v1",
    oracle: "literal visible DOM and raw localStorage assertions with normal user actions as stimuli",
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
