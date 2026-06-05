const fs = require("node:fs");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");

const rootPath = path.resolve(__dirname, "..", "..");
const root = rootPath;
const auditDir = __dirname;
const pageDir = path.join(auditDir, "pages");
const shotDir = path.join(auditDir, "screenshots");
const debugDir = path.join(auditDir, "_debug");
const profileDir = path.join(debugDir, "edge_profile");
const prefix = "runstep_macro_v1_";
const today = "2026-05-21";
const currentAuditDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);

fs.mkdirSync(pageDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(debugDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

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
    addNodeModuleCandidatesFrom(path.join(homeDir, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"), targets);
  }
  process.env.NODE_PATH = [...targets, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

configurePortableNodePath();
const { chromium } = require("playwright");

const d = day => `2026-05-${String(day).padStart(2, "0")}`;
const meal = (id, label, carbs, protein, fat, memo = "", extras = {}) => ({
  id,
  mealLabel: label,
  carbs,
  protein,
  fat,
  alcoholKcal: extras.alcoholKcal || 0,
  otherKcal: extras.otherKcal || 0,
  memo,
  createdAt: `${extras.date || today}T${extras.time || "08:00"}:00.000Z`
});
const snap = (overrides = {}) => ({
  targetCal: 2650,
  protein: 150,
  carbs: 330,
  fat: 75,
  mode: "general",
  goal: "lean_bulk",
  weight: 74.8,
  height: "173",
  age: "32",
  gender: "male",
  bodyFat: 15.2,
  bodyFatMass: 11.37,
  skeletal: 36,
  activityLevel: "moderate",
  workType: "office",
  weeklyTrainingDays: "4",
  routinePlan: "ppl_ul",
  routine: "PULL",
  intensityOverride: "0.82",
  weightDuration: 70,
  cardioType: "treadmill_walk",
  cardioDuration: 30,
  cardioSpeed: 5.4,
  cardioIncline: 8,
  workAdj: "0",
  homeInbody: true,
  expertLbmAlpha: 0.8,
  generalAdvancedSettings: true,
  generalLowDigestCarbs: false,
  snapshotSource: "saved_at_entry",
  ...overrides
});

const baseSettings = {
  mode: "general",
  weight: "74.8",
  height: "173",
  age: "32",
  bodyFat: "15.2",
  skeletal: "36",
  gender: "male",
  activityLevel: "moderate",
  workType: "office",
  workAdj: "0",
  homeInbody: "true",
  expertLbmAlpha: "0.8",
  weeklyTrainingDays: "4",
  weeklyTrainingDaysManual: "true",
  generalAdvancedSettings: "true",
  generalLowDigestCarbs: "false",
  routinePlan: "ppl_ul",
  routine: "PULL",
  intensityOverride: "0.82",
  weightDuration: "70",
  goal: "lean_bulk",
  cardioType: "treadmill_walk",
  cardioDuration: "30",
  cardioSpeed: "5.4",
  cardioIncline: "8"
};

const todayDraft = {
  [today]: {
    calculationWeight: 74.8,
    skeletalMuscle: 36,
    bodyFatMass: 11.37,
    bodyFatPercent: 15.2,
    todayActivityLevel: "moderate",
    todayWorkType: "office",
    todayRoutineSession: "PULL",
    todayIntensityOverride: 0.82,
    todayWeightDuration: 70,
    todayCardioType: "treadmill_walk",
    todayCardioDuration: 30,
    todayCardioSpeed: 5.4,
    todayCardioIncline: 8,
    bodyStatusSource: "user",
    bodyStatusEdited: true,
    cardioSource: "user",
    cardioEdited: true
  }
};

const profileCandidateV2Settings = {
  ...baseSettings,
  goal: "diet",
  weight: "88",
  height: "175",
  age: "40",
  bodyFat: "28",
  skeletal: "33",
  activityLevel: "moderate",
  workType: "office",
  weeklyTrainingDays: "4",
  weeklyTrainingDaysManual: "true",
  exerciseProfile: "mixed",
  profileSession: "mixed_strength_cardio",
  routinePlan: "mixed_balanced",
  routine: "mixed_strength_cardio",
  intensityOverride: "0.8",
  weightDuration: "60",
  cardioType: "treadmill_run",
  cardioDuration: "70",
  cardioSpeed: "8",
  cardioIncline: "1"
};

const profileCandidateV2TodayDraftValues = {
  calculationWeight: 88,
  skeletalMuscle: 33,
  bodyFatMass: 24.64,
  bodyFatPercent: 28,
  todayActivityLevel: "moderate",
  todayWorkType: "office",
  todayExerciseProfile: "mixed",
  todayProfileSession: "mixed_strength_cardio",
  todayRoutineSession: "mixed_strength_cardio",
  todayIntensityOverride: 0.8,
  todayWeightDuration: 60,
  todayCardioType: "treadmill_run",
  todayCardioDuration: 70,
  todayCardioSpeed: 8,
  todayCardioIncline: 1,
  bodyStatusSource: "user",
  bodyStatusEdited: true,
  cardioSource: "user",
  cardioEdited: true
};

const profileCandidateV2TodayDraft = {
  [today]: profileCandidateV2TodayDraftValues,
  [currentAuditDate]: profileCandidateV2TodayDraftValues
};

const profileCandidateV2Snapshot = snap({
  targetCal: 3312.9411753385825,
  protein: 176,
  carbs: 528,
  fat: 55.21568614873139,
  mode: "general",
  goal: "diet",
  weight: 88,
  height: "175",
  age: "40",
  bodyFat: 28,
  bodyFatMass: 24.64,
  skeletal: 33,
  activityLevel: "moderate",
  workType: "office",
  weeklyTrainingDays: "4",
  routinePlan: "mixed_balanced",
  routine: "mixed_strength_cardio",
  intensityOverride: "0.8",
  weightDuration: 60,
  cardioType: "treadmill_run",
  cardioDuration: 70,
  cardioSpeed: 8,
  cardioIncline: 1,
  exerciseProfile: "mixed",
  profileSession: "mixed_strength_cardio",
  profileMacroCandidateModel: "candidate-v8-profile-macro-v2-linked-target-v0",
  profileMacroCandidateStage: "calculate_runtime_candidate_v2_target_delta_proposal_v0",
  profileTargetDeltaKcal: 29.446064227471197,
  profileTargetRateDeltaEquivalentKgPerWeek: 0.02676914929770109
});

const profileCandidateV2Records = [
  {
    date: d(21),
    recordMode: "detailed",
    weight: 88,
    note: "v8.0-AA post-wiring candidate-v2 applied visual QA fixture",
    goalSnapshot: profileCandidateV2Snapshot,
    snapshotSource: "saved_at_entry",
    meals: [
      meal("pcv2-breakfast", "Breakfast", 115, 42, 12, "Visual QA fixture", { date: d(21), time: "08:10" }),
      meal("pcv2-lunch", "Lunch", 150, 55, 18, "Visual QA fixture", { date: d(21), time: "12:30" }),
      meal("pcv2-dinner", "Dinner", 140, 50, 16, "Visual QA fixture", { date: d(21), time: "19:10" })
    ]
  },
  {
    date: d(20),
    recordMode: "simple",
    weight: 88.2,
    adherence: "medium",
    goalSnapshot: profileCandidateV2Snapshot,
    snapshotSource: "saved_at_entry",
    note: "previous-day context fixture"
  }
];

const profileCandidateV2InbodyRecords = [
  { date: "2026-05-03", weight: 89.4, skeletalMuscle: 32.8, bodyFat: 25.6, bodyFatPercent: 28.6 },
  { date: "2026-05-10", weight: 88.9, skeletalMuscle: 33.0, bodyFat: 25.0, bodyFatPercent: 28.1 },
  { date: "2026-05-17", weight: 88.4, skeletalMuscle: 33.1, bodyFat: 24.8, bodyFatPercent: 28.0 }
];

const profileRoutineVisualFixtures = Object.freeze({
  bodybuilding: {
    profileSession: "bodybuilding_arms",
    routinePlan: "split5",
    routine: "ARM",
    intensityOverride: 0.75,
    weightDuration: 60,
    cardioType: "treadmill_walk",
    cardioDuration: 20,
    cardioSpeed: 5,
    cardioIncline: 4
  },
  powerbuilding: {
    profileSession: "powerbuilding_lower",
    routinePlan: "powerbuilding_ppl",
    routine: "powerbuilding_lower",
    intensityOverride: 1,
    weightDuration: 90,
    cardioType: "treadmill_walk",
    cardioDuration: 10,
    cardioSpeed: 5,
    cardioIncline: 2
  },
  strength: {
    profileSession: "strength_deload",
    routinePlan: "strength_technique_deload",
    routine: "strength_deload",
    intensityOverride: 0.45,
    weightDuration: 40,
    cardioType: "treadmill_walk",
    cardioDuration: 10,
    cardioSpeed: 5,
    cardioIncline: 0
  },
  running: {
    profileSession: "running_interval",
    routinePlan: "running_speed",
    routine: "running_interval",
    intensityOverride: 0,
    weightDuration: 0,
    cardioType: "treadmill_run",
    cardioDuration: 35,
    cardioSpeed: 12,
    cardioIncline: 1
  },
  mixed: {
    profileSession: "mixed_recovery",
    routinePlan: "mixed_circuit",
    routine: "mixed_recovery",
    intensityOverride: 0,
    weightDuration: 0,
    cardioType: "treadmill_walk",
    cardioDuration: 30,
    cardioSpeed: 5,
    cardioIncline: 0
  }
});

function makeProfileRoutineVisualPayload(profile){
  const fixture = profileRoutineVisualFixtures[profile];
  const settings = {
    ...baseSettings,
    generalAdvancedSettings: "true",
    exerciseProfile: profile,
    profileSession: fixture.profileSession,
    routinePlan: fixture.routinePlan,
    routine: fixture.routine,
    intensityOverride: String(fixture.intensityOverride),
    weightDuration: String(fixture.weightDuration),
    cardioType: fixture.cardioType,
    cardioDuration: String(fixture.cardioDuration),
    cardioSpeed: String(fixture.cardioSpeed),
    cardioIncline: String(fixture.cardioIncline)
  };
  const draftValues = {
    calculationWeight: 74.8,
    skeletalMuscle: 36,
    bodyFatMass: 11.37,
    bodyFatPercent: 15.2,
    todayActivityLevel: "moderate",
    todayWorkType: "office",
    todayExerciseProfile: profile,
    todayProfileSession: fixture.profileSession,
    todayRoutinePlan: fixture.routinePlan,
    todayRoutineSession: fixture.routine,
    todayIntensityOverride: fixture.intensityOverride,
    todayWeightDuration: fixture.weightDuration,
    todayCardioType: fixture.cardioType,
    todayCardioDuration: fixture.cardioDuration,
    todayCardioSpeed: fixture.cardioSpeed,
    todayCardioIncline: fixture.cardioIncline,
    bodyStatusSource: "user",
    bodyStatusEdited: true,
    cardioSource: "user",
    cardioEdited: true
  };
  return {
    settings,
    records: [],
    inbodyRecords,
    todayDrafts: {
      [today]: draftValues,
      [currentAuditDate]: draftValues
    }
  };
}

const inbodyRecords = [
  { date: "2026-04-05", weight: 76.1, skeletalMuscle: 35.8, bodyFat: 13.2, bodyFatPercent: 17.4 },
  { date: "2026-04-13", weight: 75.4, skeletalMuscle: 35.9, bodyFat: 11.6, bodyFatPercent: 15.6 },
  { date: "2026-04-21", weight: 74.8, skeletalMuscle: 35.5, bodyFat: 12.5, bodyFatPercent: 16.7 },
  { date: "2026-04-29", weight: 74.2, skeletalMuscle: 36.0, bodyFat: 10.9, bodyFatPercent: 14.8 }
];

const richRecords = [
  {
    date: d(21),
    recordMode: "detailed",
    weight: 74.8,
    note: "오늘 감사용 상세 기록",
    goalSnapshot: snap({ targetCal: 2050, protein: 125, carbs: 230, fat: 55 }),
    snapshotSource: "saved_at_entry",
    meals: [
      meal("t-breakfast", "아침", 55, 18, 7, "오트밀, 바나나", { date: d(21), time: "08:10" }),
      meal("t-lunch", "점심", 80, 26, 10, "현미밥, 닭가슴살 반", { date: d(21), time: "12:30" }),
      meal("t-snack", "간식", 35, 8, 6, "프로틴바 반 개", { date: d(21), time: "16:00" })
    ]
  },
  {
    date: d(20),
    recordMode: "detailed",
    weight: 74.9,
    note: "술과 단백질 부족",
    goalSnapshot: snap(),
    snapshotSource: "saved_at_entry",
    meals: [
      meal("r20-1", "점심", 90, 18, 16, "외식", { date: d(20), time: "12:10" }),
      meal("r20-2", "술", 40, 8, 20, "맥주와 안주", { date: d(20), time: "22:00", alcoholKcal: 420 })
    ]
  },
  {
    date: d(19),
    recordMode: "detailed",
    weight: 74.6,
    note: "좋은 날",
    goalSnapshot: snap(),
    snapshotSource: "saved_at_entry",
    meals: [
      meal("r19-1", "아침", 72, 35, 10, "오트밀 쉐이크", { date: d(19), time: "08:00" }),
      meal("r19-2", "점심", 92, 55, 15, "밥 닭가슴살", { date: d(19), time: "12:00" }),
      meal("r19-3", "저녁", 96, 45, 24, "연어와 밥", { date: d(19), time: "19:00" })
    ]
  },
  {
    date: d(18),
    recordMode: "detailed",
    weight: 74.7,
    note: "지방 높음",
    goalSnapshot: snap(),
    snapshotSource: "saved_at_entry",
    meals: [meal("r18-1", "점심", 120, 45, 58, "치킨/소스", { date: d(18), time: "13:00", otherKcal: 220 })]
  },
  { date: d(17), recordMode: "simple", weight: 74.9, adherence: "medium", note: "간단 기록" },
  { date: d(16), recordMode: "weight_only", weight: 75.0, note: "체중만" },
  {
    date: d(15),
    recordMode: "detailed",
    weight: 75.1,
    goalSnapshot: snap({ routine: "REST", weightDuration: 0 }),
    snapshotSource: "saved_at_entry",
    meals: [
      meal("r15-1", "아침", 20, 22, 8, "휴식일 저탄수", { date: d(15), time: "09:00" }),
      meal("r15-2", "저녁", 30, 18, 12, "가벼운 저녁", { date: d(15), time: "19:00" })
    ]
  },
  {
    date: d(14),
    recordMode: "detailed",
    weight: 75.0,
    goalSnapshot: snap(),
    snapshotSource: "saved_at_entry",
    meals: [
      meal("r14-1", "아침", 70, 30, 10, "일반식", { date: d(14), time: "08:00" }),
      meal("r14-2", "점심", 85, 35, 12, "일반식", { date: d(14), time: "12:00" })
    ]
  },
  {
    date: d(13),
    recordMode: "detailed",
    weight: 75.2,
    goalSnapshot: snap(),
    snapshotSource: "saved_at_entry",
    meals: [meal("r13-1", "점심", 95, 30, 18, "외식", { date: d(13), time: "12:00" })]
  }
];

const payloads = {
  empty: { settings: baseSettings, records: [], inbodyRecords, todayDrafts: todayDraft },
  rich: {
    settings: baseSettings,
    records: richRecords,
    inbodyRecords,
    todayDrafts: todayDraft,
    cardioPresets: {
      items: [{ id: "walk-default", name: "경사 워킹", cardioType: "treadmill_walk", cardioDuration: 35, cardioSpeed: 5.5, cardioIncline: 8, isDefault: true, createdAt: "2026-05-01T00:00:00.000Z" }],
      defaultId: "walk-default"
    },
    mealTemplates: {
      items: [{ id: "tpl-shake", name: "프로틴 쉐이크", meal: meal("tpl-meal", "간식", 25, 30, 3, "쉐이크 템플릿"), isFavorite: true }]
    }
  },
  profileCandidateV2: {
    settings: profileCandidateV2Settings,
    records: profileCandidateV2Records,
    inbodyRecords: profileCandidateV2InbodyRecords,
    todayDrafts: profileCandidateV2TodayDraft,
    cardioPresets: {
      items: [{ id: "pcv2-run", name: "Candidate v2 run", cardioType: "treadmill_run", cardioDuration: 70, cardioSpeed: 8, cardioIncline: 1, isDefault: true, createdAt: "2026-05-21T00:00:00.000Z" }],
      defaultId: "pcv2-run"
    },
    mealTemplates: {
      items: [{ id: "pcv2-template", name: "Candidate v2 meal", meal: meal("pcv2-template-meal", "Template", 120, 45, 14, "Candidate v2 visual QA template"), isFavorite: true }]
    }
  },
  profileRoutineBodybuilding: makeProfileRoutineVisualPayload("bodybuilding"),
  profileRoutinePowerbuilding: makeProfileRoutineVisualPayload("powerbuilding"),
  profileRoutineStrength: makeProfileRoutineVisualPayload("strength"),
  profileRoutineRunning: makeProfileRoutineVisualPayload("running"),
  profileRoutineMixed: makeProfileRoutineVisualPayload("mixed")
};

const actionScripts = {
  none: "",
  scrollMid: "w.scrollTo(0, 760);",
  scrollLower: "w.scrollTo(0, 1450);",
  quickOpen: "w.document.querySelector('#todayQuickEditToggle')?.click(); w.scrollTo(0, 1220);",
  todayRecordModal: "w.openTodayRecordStartDialog?.('detailed');",
  todayRecordDetailed: "w.openTodayRecordStartDialog?.('detailed'); await delay(250); w.document.getElementById('todayRecordMealCarbs').value='72'; w.document.getElementById('todayRecordMealProtein').value='38'; w.document.getElementById('todayRecordMealFat').value='12'; w.document.getElementById('todayRecordMealOtherKcal').value='80'; w.document.getElementById('todayRecordMealMemo').value='감사용 입력';",
  todayRecordDetailedLower: "w.openTodayRecordStartDialog?.('detailed'); await delay(250); const body=w.document.querySelector('#todayRecordStartOverlay .record-start-body'); if(body) body.scrollTop=body.scrollHeight;",
  todayRecordAlcoholOpen: "w.openTodayRecordStartDialog?.('detailed'); await delay(250); const alc=w.document.querySelector('[data-alcohol-calc=\"today-start\"]'); if(alc) alc.open=true; w.document.getElementById('todayRecordAlcoholVolumeMl').value='500'; w.document.getElementById('todayRecordAlcoholAbvPercent').value='5'; w.document.getElementById('todayRecordAlcoholServings').value='2'; w.document.querySelector('[data-apply-alcohol-calc=\"today-start\"]')?.click();",
  todayMealReuseModal: "w.openTodayRecordStartDialog?.('detailed'); await delay(250); w.document.querySelector('[data-open-meal-reuse=\"today-start\"]')?.click();",
  todayInbodyRecordSelect: "w.document.getElementById('todaySelectInbodyRecordBtn')?.click();",
  todayUpdated: "w.document.querySelector('[data-update-today-record-basis]')?.click();",
  tabRecords: "w.document.querySelector('#tabRecords')?.click();",
  tabRecordsDetail: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-record-card-date=\"2026-05-21\"]')?.click(); await delay(300); w.document.getElementById('recordArchiveDetailHost')?.scrollIntoView({block:'start'});",
  tabRecordsDetailBasisOpen: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-record-card-date=\"2026-05-21\"]')?.click(); await delay(300); const basis=w.document.querySelector('[data-record-detail-section=\"basis\"]'); if(basis) basis.open=true; await delay(100); basis?.scrollIntoView({block:'start'});",
  tabRecordsEdit: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-record-card-date=\"2026-05-21\"]')?.click(); await delay(300); w.document.querySelector('[data-edit-record-date=\"2026-05-21\"]')?.click(); await delay(300); w.document.getElementById('recordArchiveDetailHost')?.scrollIntoView({block:'start'});",
  tabRecordsInfoEditModal: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-open-record-edit-panel]')?.click();",
  tabRecordsMealAddModal: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-open-record-meal-entry]')?.click();",
  tabRecordsMealsExpanded: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-toggle-meals]')?.click(); w.document.querySelector('.selected-meals-surface-panel')?.scrollIntoView({block:'start'});",
  tabRecordsMealEditModal: "w.document.querySelector('#tabRecords')?.click(); await delay(300); w.document.querySelector('[data-record-card-date=\"2026-05-21\"]')?.click(); await delay(300); w.document.querySelector('[data-edit-record-meal]')?.click();",
  tabWeekly: "w.document.querySelector('#tabWeekly')?.click();",
  tabWeekly3: "w.document.querySelector('#tabWeekly')?.click(); await delay(300); w.document.querySelector('[data-recent-flow-range=\"3\"]')?.click();",
  tabWeekly14: "w.document.querySelector('#tabWeekly')?.click(); await delay(300); w.document.querySelector('[data-recent-flow-range=\"14\"]')?.click();",
  tabWeekly28: "w.document.querySelector('#tabWeekly')?.click(); await delay(300); w.document.querySelector('[data-recent-flow-range=\"28\"]')?.click();",
  tabInbody: "w.document.querySelector('#tabInbody')?.click();",
  tabInbodyAnalysis: "w.document.querySelector('#tabInbody')?.click(); await delay(300); w.document.querySelector('[data-inbody-view-tab=\"detail\"]')?.click(); await delay(300); w.document.getElementById('inbodyDetailView')?.scrollIntoView({block:'start'});",
  tabInbodyChange: "w.document.querySelector('#tabInbody')?.click(); await delay(300); w.document.querySelector('[data-inbody-view-tab=\"trend\"]')?.click(); await delay(300); w.document.getElementById('inbodyTrendView')?.scrollIntoView({block:'start'});",
  tabInbodyEdit: "w.document.querySelector('#tabInbody')?.click(); await delay(300); w.scrollTo(0, 720); await delay(100); w.document.querySelector('[data-load-inbody]')?.click(); await delay(300); w.document.querySelector('#inbodyInputTitle')?.scrollIntoView({block:'start'});",
  tabInbodyRecordsLink: "w.document.querySelector('#tabInbody')?.click(); await delay(300); const details=w.document.getElementById('inbodyRecordsDetails'); if(details) details.open=false; w.document.getElementById('viewInbodyRecordsBtn')?.click(); await delay(400); w.document.getElementById('inbodyRecordsDetails')?.scrollIntoView({block:'start'});",
  tabSettings: "w.document.querySelector('#tabSettings')?.click();",
  tabSettingsOpenGroups: "w.document.querySelector('#tabSettings')?.click(); await delay(300); w.document.querySelectorAll('#settingsPanel .settings-disclosure-toggle').forEach(btn => btn.click());",
  tabSettingsDataLower: "w.document.querySelector('#tabSettings')?.click(); await delay(300); w.scrollTo(0, 1120);",
  backupPreview: "w.document.querySelector('#tabSettings')?.click(); await delay(300); const payload = {app:'macro-engine',kind:'full-backup',backupVersion:1,appVersion:'v7.0-audit',createdAt:'2026-05-17T09:00:00.000Z',data:{settings:{...JSON.parse(JSON.stringify(" + JSON.stringify(baseSettings) + "))},records:" + JSON.stringify([richRecords[1], richRecords[2]]) + ",inbodyRecords:" + JSON.stringify(inbodyRecords.slice(0,2)) + ",cardioPresets:{items:[],defaultId:null},mealTemplates:{items:[]},todayCalculationValues:{}}}; w.queueDataManagementImport?.(payload);",
  smartConflict: "w.document.querySelector('#tabSettings')?.click(); await delay(300); const payload = {app:'macro-engine',kind:'full-backup',backupVersion:1,appVersion:'v7.0-audit',createdAt:'2026-05-17T09:00:00.000Z',data:{settings:{...JSON.parse(JSON.stringify(" + JSON.stringify(baseSettings) + "))},records:" + JSON.stringify([richRecords[0], richRecords[1]]) + ",inbodyRecords:" + JSON.stringify(inbodyRecords.slice(0,2)) + ",cardioPresets:{items:[],defaultId:null},mealTemplates:{items:[]},todayCalculationValues:{}}}; w.queueDataManagementImport?.(payload); await delay(300); w.startSmartRestoreImport?.();",
  recordsOnlyImport: "w.document.querySelector('#tabSettings')?.click(); await delay(300); const payload = {exportedAt:'2026-05-17T09:00:00.000Z',records:" + JSON.stringify([richRecords[0], richRecords[1]]) + "}; w.queueDataManagementImport?.(payload);"
};

const captures = [
  ["01_desktop_today_empty_top", "empty", "none", 1280, 900],
  ["02_desktop_today_empty_lower", "empty", "scrollMid", 1280, 900],
  ["03_desktop_today_rich_stale", "rich", "none", 1280, 900],
  ["04_desktop_today_quick_open", "rich", "quickOpen", 1280, 900],
  ["05_desktop_today_record_start_modal", "rich", "todayRecordModal", 1280, 900],
  ["06_desktop_today_record_detailed_modal", "rich", "todayRecordDetailed", 1280, 900],
  ["07_desktop_today_record_detailed_lower", "rich", "todayRecordDetailedLower", 1280, 900],
  ["09_desktop_today_record_alcohol_open", "rich", "todayRecordAlcoholOpen", 1280, 900],
  ["10_desktop_today_meal_reuse_modal", "rich", "todayMealReuseModal", 1280, 900],
  ["11_desktop_today_inbody_select_modal", "rich", "todayInbodyRecordSelect", 1280, 900],
  ["12_desktop_today_after_basis_update", "rich", "todayUpdated", 1280, 900],
  ["13_desktop_records_archive", "rich", "tabRecords", 1280, 900],
  ["14_desktop_records_detail", "rich", "tabRecordsDetail", 1280, 900],
  ["15_desktop_records_edit", "rich", "tabRecordsEdit", 1280, 900],
  ["16_desktop_records_info_edit_modal", "rich", "tabRecordsInfoEditModal", 1280, 900],
  ["17_desktop_records_meal_add_modal", "rich", "tabRecordsMealAddModal", 1280, 900],
  ["18_desktop_records_meals_expanded", "rich", "tabRecordsMealsExpanded", 1280, 900],
  ["19_desktop_records_meal_edit_modal", "rich", "tabRecordsMealEditModal", 1280, 900],
  ["21_desktop_recent_3d", "rich", "tabWeekly3", 1280, 900],
  ["22_desktop_recent_7d", "rich", "tabWeekly", 1280, 900],
  ["23_desktop_recent_14d", "rich", "tabWeekly14", 1280, 900],
  ["24_desktop_recent_28d", "rich", "tabWeekly28", 1280, 900],
  ["25_desktop_inbody_top", "rich", "tabInbody", 1280, 900],
  ["26_desktop_inbody_analysis", "rich", "tabInbodyAnalysis", 1280, 900],
  ["26b_desktop_inbody_change", "rich", "tabInbodyChange", 1280, 900],
  ["27_desktop_inbody_edit", "rich", "tabInbodyEdit", 1280, 900],
  ["28_desktop_inbody_records_link", "rich", "tabInbodyRecordsLink", 1280, 900],
  ["29_desktop_settings_top", "rich", "tabSettings", 1280, 900],
  ["30_desktop_settings_groups_open", "rich", "tabSettingsOpenGroups", 1280, 900],
  ["31_desktop_settings_data_lower", "rich", "tabSettingsDataLower", 1280, 900],
  ["32_desktop_backup_preview_modal", "rich", "backupPreview", 1280, 900],
  ["33_desktop_smart_restore_conflict_modal", "rich", "smartConflict", 1280, 900],
  ["42_desktop_records_only_import_modal", "rich", "recordsOnlyImport", 1280, 900],
  ["34_mobile_today_rich", "rich", "none", 390, 900],
  ["35_mobile_today_record_detailed", "rich", "todayRecordDetailed", 390, 900],
  ["36_mobile_records", "rich", "tabRecords", 390, 900],
  ["37_mobile_records_meal_edit", "rich", "tabRecordsMealEditModal", 390, 900],
  ["38_mobile_recent", "rich", "tabWeekly", 390, 900],
  ["39_mobile_inbody", "rich", "tabInbody", 390, 900],
  ["40_mobile_settings", "rich", "tabSettings", 390, 900],
  ["41_mobile_settings_groups_open", "rich", "tabSettingsOpenGroups", 390, 900],
  ["43_mobile_backup_preview_modal", "rich", "backupPreview", 390, 900],
  ["44_mobile_smart_restore_conflict_modal", "rich", "smartConflict", 390, 900],
  ["45_mobile_records_info_edit_modal", "rich", "tabRecordsInfoEditModal", 390, 900],
  ["46_mobile_records_meal_add_modal", "rich", "tabRecordsMealAddModal", 390, 900],
  ["47_mobile_inbody_records_link", "rich", "tabInbodyRecordsLink", 390, 900],
  ["47b_mobile_inbody_change", "rich", "tabInbodyChange", 390, 900],
  ["48_mobile_settings_data_lower", "rich", "tabSettingsDataLower", 390, 900],
  ["49_desktop_today_profile_candidate_v2_applied", "profileCandidateV2", "none", 1280, 900],
  ["50_desktop_today_profile_candidate_v2_quick_open", "profileCandidateV2", "quickOpen", 1280, 900],
  ["51_desktop_records_profile_candidate_v2_detail", "profileCandidateV2", "tabRecordsDetail", 1280, 900],
  ["52_mobile_today_profile_candidate_v2_applied", "profileCandidateV2", "none", 390, 900],
  ["53_mobile_today_profile_candidate_v2_quick_open", "profileCandidateV2", "quickOpen", 390, 900],
  ["54_mobile_records_profile_candidate_v2_detail", "profileCandidateV2", "tabRecordsDetail", 390, 900],
  ["55_desktop_records_profile_candidate_v2_basis_open", "profileCandidateV2", "tabRecordsDetailBasisOpen", 1280, 900],
  ["56_mobile_records_profile_candidate_v2_basis_open", "profileCandidateV2", "tabRecordsDetailBasisOpen", 390, 900],
  ["57_desktop_today_profile_routine_bodybuilding_quick_open", "profileRoutineBodybuilding", "quickOpen", 1280, 900],
  ["58_desktop_today_profile_routine_powerbuilding_quick_open", "profileRoutinePowerbuilding", "quickOpen", 1280, 900],
  ["59_desktop_today_profile_routine_strength_quick_open", "profileRoutineStrength", "quickOpen", 1280, 900],
  ["60_desktop_today_profile_routine_running_quick_open", "profileRoutineRunning", "quickOpen", 1280, 900],
  ["61_desktop_today_profile_routine_mixed_quick_open", "profileRoutineMixed", "quickOpen", 1280, 900],
  ["62_mobile_today_profile_routine_bodybuilding_quick_open", "profileRoutineBodybuilding", "quickOpen", 390, 900],
  ["63_mobile_today_profile_routine_powerbuilding_quick_open", "profileRoutinePowerbuilding", "quickOpen", 390, 900],
  ["64_mobile_today_profile_routine_strength_quick_open", "profileRoutineStrength", "quickOpen", 390, 900],
  ["65_mobile_today_profile_routine_running_quick_open", "profileRoutineRunning", "quickOpen", 390, 900],
  ["66_mobile_today_profile_routine_mixed_quick_open", "profileRoutineMixed", "quickOpen", 390, 900]
];

function makePage(name, payloadName, actionName, width, height) {
  const payload = JSON.stringify(payloads[payloadName]).replace(/<\//g, "<\\/");
  const action = actionScripts[actionName] || "";
  const cacheBust = Date.now();
  return `<!doctype html>
<meta charset="utf-8">
<title>${name}</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #f7fbf1; }
  iframe { width: 100vw; height: 100vh; border: 0; display: block; }
</style>
<iframe id="app"></iframe>
<script>
const prefix = ${JSON.stringify(prefix)};
const payload = ${payload};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
Object.entries(payload.settings || {}).forEach(([k, v]) => localStorage.setItem(prefix + k, String(v)));
localStorage.setItem(prefix + 'records', JSON.stringify(payload.records || []));
localStorage.setItem(prefix + 'inbodyRecords', JSON.stringify(payload.inbodyRecords || []));
localStorage.setItem(prefix + 'todayCalculationDrafts.v1', JSON.stringify(payload.todayDrafts || {}));
if (payload.cardioPresets) localStorage.setItem(prefix + 'cardioPresets.v1', JSON.stringify(payload.cardioPresets));
if (payload.mealTemplates) localStorage.setItem(prefix + 'mealTemplates.v1', JSON.stringify(payload.mealTemplates));
const frame = document.getElementById('app');
frame.addEventListener('load', async () => {
  const w = frame.contentWindow;
  await delay(1200);
  const stableStyle = w.document.createElement('style');
  stableStyle.textContent = '*,*::before,*::after{animation-duration:0.001s!important;transition-duration:0.001s!important;scroll-behavior:auto!important}';
  w.document.head.appendChild(stableStyle);
  try { ${action} } catch (error) { document.body.dataset.auditError = String(error && error.message || error); }
  await delay(2400);
  document.body.dataset.ready = 'true';
});
  frame.src = '/index.html?audit=${name}&v=${cacheBust}#audit-${name}';
</script>`;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(rootPath, requestedPath.slice(1));
    if (!filePath.startsWith(rootPath + path.sep) && filePath !== rootPath) {
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
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
      response.end(data);
    });
  });
}

async function expandMobileFrameForFullPage(page, width, height) {
  const iframe = page.frames().find(frame => frame.url().includes("/index.html"));
  if (!iframe) return { fullPage: false, contentHeight: height, captureHeight: height };
  const contentHeight = await iframe.evaluate(() => Math.ceil(Math.max(
    document.body?.scrollHeight || 0,
    document.documentElement?.scrollHeight || 0,
    document.body?.offsetHeight || 0,
    document.documentElement?.offsetHeight || 0
  )));
  const captureHeight = Math.max(height, contentHeight + 16);
  await page.setViewportSize({ width, height: captureHeight });
  await page.evaluate(nextHeight => {
    document.documentElement.style.height = `${nextHeight}px`;
    document.body.style.height = `${nextHeight}px`;
    document.body.style.overflow = "visible";
    const frame = document.getElementById("app");
    if (frame) frame.style.height = `${nextHeight}px`;
  }, captureHeight);
  await iframe.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  return { fullPage: true, contentHeight, captureHeight };
}

function getAppFrame(page) {
  return page.frames().find(frame => frame.url().includes("/index.html"));
}

async function getRuntimeMeta(page) {
  const iframe = getAppFrame(page);
  if (!iframe) return { appFrameFound: false, calculateFound: false };
  return iframe.evaluate(() => {
    try {
      const calculateFn = typeof window.calculate === "function"
        ? window.calculate
        : (typeof calculate === "function" ? calculate : null);
      const buildRecentContextFn = typeof window.buildRecentContext === "function"
        ? window.buildRecentContext
        : (typeof buildRecentContext === "function" ? buildRecentContext : null);
      if (typeof calculateFn !== "function") {
        return { appFrameFound: true, calculateFound: false };
      }
      const result = calculateFn();
      const wiring = result?.profileCandidateV2ProductionWiring || {};
      const proposal = result?.profileMacroCandidateV2RuntimeProposal || {};
      const recentContext = typeof buildRecentContextFn === "function"
        ? buildRecentContextFn(result, { records: [] })
        : null;
      const gate = recentContext?.profileCandidateV2TargetDeltaGate || {};
      return {
        appFrameFound: true,
        calculateFound: true,
        isCalculable: result?.isCalculable === true,
        exerciseProfile: result?.s?.exerciseProfile || null,
        profileSession: result?.s?.profileSession || null,
        routinePlan: result?.s?.routinePlan || null,
        routine: result?.s?.routine || null,
        goal: result?.s?.goal || null,
        selectedMacroBasis: result?.selectedMacroBasis || null,
        targetCal: Number.isFinite(Number(result?.targetCal)) ? Number(result.targetCal) : null,
        protein: Number.isFinite(Number(result?.protein)) ? Number(result.protein) : null,
        carbs: Number.isFinite(Number(result?.carbs)) ? Number(result.carbs) : null,
        fat: Number.isFinite(Number(result?.fat)) ? Number(result.fat) : null,
        productionWiringVersion: wiring.version || null,
        productionWiringStage: wiring.stage || null,
        productionWiringApplied: wiring.applied === true,
        productionTargetCalApplied: wiring.productionTargetCalApplied === true,
        productionWiringReasonCode: wiring.reasonCode || null,
        productionWiringTargetDeltaKcal: Number.isFinite(Number(wiring.targetDeltaKcal)) ? Number(wiring.targetDeltaKcal) : null,
        runtimeProposalActive: proposal.active === true,
        runtimeProposalRequested: proposal.requested === true,
        runtimeProposalTargetDeltaKcal: Number.isFinite(Number(proposal.targetDeltaKcal)) ? Number(proposal.targetDeltaKcal) : null,
        runtimeProposalProfileCarbFloorMet: proposal.profileCarbFloorMet === true,
        recentGateStatus: gate.status || null,
        recentGateTargetDeltaApplied: gate.targetDeltaApplied === true,
        recentGateCanApplyAutomatically: gate.canApplyAutomatically === true,
        todayProfileSelectHidden: document.getElementById("todayQuickExerciseProfile")?.closest(".field")?.classList.contains("hidden") === true,
        todayRoutineProfileLabelText: document.getElementById("todayQuickRoutineProfileLabel")?.textContent?.trim() || null,
        todayRoutinePlanDisabled: document.getElementById("todayQuickRoutinePlan")?.disabled === true,
        todayRoutinePlanValue: document.getElementById("todayQuickRoutinePlan")?.value || null,
        todayRoutineSessionValue: document.getElementById("todayQuickRoutineSession")?.value || null,
        todayRoutineSessionOptions: Array.from(document.getElementById("todayQuickRoutineSession")?.options || []).map(option => option.value),
        todayCalcSummaryText: document.getElementById("todayCalcSummary")?.textContent?.trim() || null,
        settingsTrainingHostHasDefaultSessionPicker: document.getElementById("settingsTrainingDefaultsHost")?.contains(document.getElementById("todayRoutineAthleteField")) === true,
        settingsTrainingHostHasWeekdaySchedule: document.getElementById("settingsTrainingDefaultsHost")?.closest(".settings-group")?.contains(document.getElementById("routineWeekdaySchedulePanel")) === true
      };
    } catch (error) {
      return {
        appFrameFound: true,
        calculateFound: null,
        runtimeMetaError: error?.message || String(error)
      };
    }
  });
}

async function capture(context, baseUrl, name, payloadName, actionName, width, height) {
  const htmlPath = path.join(pageDir, `${name}.html`);
  const shotPath = path.join(shotDir, `${name}.png`);
  fs.writeFileSync(htmlPath, makePage(name, payloadName, actionName, width, height), "utf-8");
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/tools/render_audit/pages/${name}.html`, { waitUntil: "load", timeout: 30000 });
  try {
    await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 30000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      ready: document.body?.dataset?.ready || "",
      auditError: document.body?.dataset?.auditError || "",
      body: document.body?.innerHTML?.slice(0, 500) || "",
      frames: Array.from(document.querySelectorAll("iframe")).map(frame => ({
        src: frame.src,
        title: frame.contentWindow?.document?.title || "",
        body: frame.contentWindow?.document?.body?.textContent?.slice(0, 100) || ""
      }))
    })).catch(innerError => ({ evaluateError: innerError.message }));
    console.error(`debug ${name}: ${JSON.stringify(debug, null, 2)}`);
    throw error;
  }
  const captureMeta = width <= 560
    ? await expandMobileFrameForFullPage(page, width, height)
    : { fullPage: false, contentHeight: height, captureHeight: height };
  const runtimeMeta = await getRuntimeMeta(page);
  await page.screenshot({ path: shotPath, fullPage: captureMeta.fullPage });
  await page.close();
  return { shotPath, captureMeta, runtimeMeta };
}

async function runRenderAudit() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let context;
  try {
    const launchOptions = {
      headless: true,
      args: [
        "--disable-gpu",
        "--no-first-run",
        "--disable-background-networking"
      ]
    };
    const channels = [...new Set([process.env.PLAYWRIGHT_BROWSER_CHANNEL, "msedge", "chrome", ""].filter(channel => channel !== undefined))];
    let lastError = null;
    for (const channel of channels) {
      try {
        browser = await chromium.launch({
          ...launchOptions,
          ...(channel ? { channel } : {})
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!browser) throw lastError || new Error("Unable to launch a Playwright browser");
    context = await browser.newContext();
    const manifest = [];
    for (const item of captures) {
      const [name, payloadName, actionName, width, height] = item;
      console.log(`capture ${name}`);
      const { shotPath, captureMeta, runtimeMeta } = await capture(context, baseUrl, name, payloadName, actionName, width, height);
      manifest.push({ name, payloadName, actionName, viewport: { width, height }, shotPath, capture: captureMeta, runtime: runtimeMeta });
    }
    fs.writeFileSync(path.join(auditDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), captures: manifest }, null, 2), "utf-8");
    console.log(JSON.stringify({ count: manifest.length, shotDir }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  runRenderAudit().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  root,
  rootPath,
  auditDir,
  pageDir,
  shotDir,
  debugDir,
  prefix,
  today,
  payloads,
  actionScripts,
  captures,
  makePage,
  createServer,
  getAppFrame,
  getRuntimeMeta,
  chromium,
  runRenderAudit
};
