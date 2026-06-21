const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const auditDir = __dirname;
const manifestPath = path.join(auditDir, "manifest.json");

const REQUIRED_MOBILE_CAPTURES = Object.freeze([
  "34_mobile_today_rich",
  "35_mobile_today_record_detailed",
  "36_mobile_records",
  "37_mobile_records_meal_edit",
  "38_mobile_recent",
  "39_mobile_inbody",
  "40_mobile_settings",
  "41_mobile_settings_groups_open",
  "43_mobile_backup_preview_modal",
  "44_mobile_smart_restore_conflict_modal",
  "45_mobile_records_info_edit_modal",
  "46_mobile_records_meal_add_modal",
  "47_mobile_inbody_records_link",
  "47b_mobile_inbody_change",
  "48_mobile_settings_data_lower",
  "52_mobile_today_profile_candidate_v2_applied",
  "53_mobile_today_profile_candidate_v2_quick_open",
  "54_mobile_records_profile_candidate_v2_detail",
  "56_mobile_records_profile_candidate_v2_basis_open",
  "62_mobile_today_profile_routine_bodybuilding_quick_open",
  "63_mobile_today_profile_routine_powerbuilding_quick_open",
  "64_mobile_today_profile_routine_strength_quick_open",
  "65_mobile_today_profile_routine_running_quick_open",
  "66_mobile_today_profile_routine_mixed_quick_open"
]);

const REQUIRED_DESKTOP_CAPTURE_PREFIXES = Object.freeze([
  "01_desktop_today",
  "13_desktop_records",
  "21_desktop_recent",
  "25_desktop_inbody",
  "29_desktop_settings",
  "32_desktop_backup",
  "33_desktop_smart_restore",
  "49_desktop_today_profile_candidate_v2",
  "51_desktop_records_profile_candidate_v2",
  "55_desktop_records_profile_candidate_v2_basis_open",
  "57_desktop_today_profile_routine_bodybuilding",
  "58_desktop_today_profile_routine_powerbuilding",
  "59_desktop_today_profile_routine_strength",
  "60_desktop_today_profile_routine_running",
  "61_desktop_today_profile_routine_mixed"
]);

const POST_WIRING_PROFILE_CANDIDATE_CAPTURES = Object.freeze([
  "49_desktop_today_profile_candidate_v2_applied",
  "50_desktop_today_profile_candidate_v2_quick_open",
  "51_desktop_records_profile_candidate_v2_detail",
  "52_mobile_today_profile_candidate_v2_applied",
  "53_mobile_today_profile_candidate_v2_quick_open",
  "54_mobile_records_profile_candidate_v2_detail",
  "55_desktop_records_profile_candidate_v2_basis_open",
  "56_mobile_records_profile_candidate_v2_basis_open"
]);

const PROFILE_ROUTINE_OWNERSHIP_CAPTURES = Object.freeze({
  "57_desktop_today_profile_routine_bodybuilding_quick_open": {
    exerciseProfile: "bodybuilding",
    routinePlan: "split5",
    routine: "ARM"
  },
  "58_desktop_today_profile_routine_powerbuilding_quick_open": {
    exerciseProfile: "powerbuilding",
    routinePlan: "powerbuilding_ppl",
    routine: "powerbuilding_lower"
  },
  "59_desktop_today_profile_routine_strength_quick_open": {
    exerciseProfile: "strength",
    routinePlan: "strength_technique_deload",
    routine: "strength_deload"
  },
  "60_desktop_today_profile_routine_running_quick_open": {
    exerciseProfile: "running",
    routinePlan: "running_speed",
    routine: "running_interval"
  },
  "61_desktop_today_profile_routine_mixed_quick_open": {
    exerciseProfile: "mixed",
    routinePlan: "mixed_circuit",
    routine: "mixed_recovery"
  },
  "62_mobile_today_profile_routine_bodybuilding_quick_open": {
    exerciseProfile: "bodybuilding",
    routinePlan: "split5",
    routine: "ARM"
  },
  "63_mobile_today_profile_routine_powerbuilding_quick_open": {
    exerciseProfile: "powerbuilding",
    routinePlan: "powerbuilding_ppl",
    routine: "powerbuilding_lower"
  },
  "64_mobile_today_profile_routine_strength_quick_open": {
    exerciseProfile: "strength",
    routinePlan: "strength_technique_deload",
    routine: "strength_deload"
  },
  "65_mobile_today_profile_routine_running_quick_open": {
    exerciseProfile: "running",
    routinePlan: "running_speed",
    routine: "running_interval"
  },
  "66_mobile_today_profile_routine_mixed_quick_open": {
    exerciseProfile: "mixed",
    routinePlan: "mixed_circuit",
    routine: "mixed_recovery"
  }
});

const PROFILE_ROUTINE_SUMMARY_TERMS_BY_ROUTINE = Object.freeze({
  ARM: "팔",
  powerbuilding_lower: "하체·힌지",
  strength_deload: "디로드",
  running_interval: "인터벌",
  mixed_recovery: "회복"
});

function readUInt32(buffer, offset){
  return buffer.readUInt32BE(offset);
}

function paethPredictor(a, b, c){
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function getPngChannels(colorType){
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  return 0;
}

function parsePngStats(filePath){
  const buffer = fs.readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = getPngChannels(colorType);
  if (!width || !height || bitDepth !== 8 || !channels || interlace !== 0) {
    return {
      width,
      height,
      bitDepth,
      colorType,
      interlace,
      supportedPixelStats: false,
      uniqueSampleColorCount: 0,
      luminanceStdDev: 0
    };
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowBytes = width * channels;
  const bytesPerPixel = channels;
  let sourceOffset = 0;
  let previous = new Uint8Array(rowBytes);
  const sampleEvery = Math.max(1, Math.floor((width * height) / 50000));
  const uniqueColors = new Set();
  let sampleCount = 0;
  let sum = 0;
  let sumSq = 0;
  let firstColor = null;
  let differentFromFirstCount = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      row[x] = value & 255;
    }
    sourceOffset += rowBytes;

    for (let px = 0; px < width; px += sampleEvery) {
      const base = px * channels;
      let r = row[base];
      let g = row[base];
      let b = row[base];
      let a = 255;
      if (colorType === 2 || colorType === 6) {
        r = row[base];
        g = row[base + 1];
        b = row[base + 2];
        if (colorType === 6) a = row[base + 3];
      } else if (colorType === 4) {
        a = row[base + 1];
      }
      const colorKey = `${r},${g},${b},${a}`;
      if (firstColor === null) firstColor = colorKey;
      if (colorKey !== firstColor) differentFromFirstCount += 1;
      if (uniqueColors.size < 1000) uniqueColors.add(colorKey);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sampleCount += 1;
      sum += luminance;
      sumSq += luminance * luminance;
    }
    previous = row;
  }
  const mean = sampleCount ? sum / sampleCount : 0;
  const variance = sampleCount ? Math.max(0, sumSq / sampleCount - mean * mean) : 0;
  return {
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    supportedPixelStats: true,
    sampleCount,
    uniqueSampleColorCount: uniqueColors.size,
    differentFromFirstCount,
    luminanceMean: Number(mean.toFixed(3)),
    luminanceStdDev: Number(Math.sqrt(variance).toFixed(3))
  };
}

function analyzeManifest(){
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing render audit manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const captures = Array.isArray(manifest.captures) ? manifest.captures : [];
  const failures = [];
  const analyzedCaptures = captures.map(capture => {
    const shotPath = capture.shotPath || "";
    const exists = !!shotPath && fs.existsSync(shotPath);
    const fileSize = exists ? fs.statSync(shotPath).size : 0;
    const png = exists ? parsePngStats(shotPath) : null;
    const viewport = capture.viewport || {};
    const isMobile = Number(viewport.width) <= 560 || String(capture.name || "").includes("_mobile_");
    const checks = {
      exists,
      minFileSize: fileSize >= 10000,
      widthMatchesViewport: png ? png.width === Number(viewport.width) : false,
      heightAtLeastViewport: png ? png.height >= Number(viewport.height) : false,
      nonBlank: png ? png.uniqueSampleColorCount >= 20 && png.differentFromFirstCount >= 100 && png.luminanceStdDev >= 8 : false,
      mobileFullPage: !isMobile || capture.capture?.fullPage === true,
      mobileExpandedHeight: !isMobile || Number(capture.capture?.captureHeight) >= Number(capture.capture?.contentHeight || viewport.height),
      mobileImageHeightMatchesCapture: !isMobile || (png && Math.abs(png.height - Number(capture.capture?.captureHeight || png.height)) <= 2)
    };
    Object.entries(checks).forEach(([key, value]) => {
      if (!value) failures.push(`${capture.name}:${key}`);
    });
    return {
      name: capture.name,
      viewport,
      capture: capture.capture,
      runtime: capture.runtime || null,
      isMobile,
      fileSize,
      png,
      checks
    };
  });

  const names = new Set(captures.map(capture => capture.name));
  REQUIRED_MOBILE_CAPTURES.forEach(name => {
    if (!names.has(name)) failures.push(`missing-required-mobile:${name}`);
  });
  REQUIRED_DESKTOP_CAPTURE_PREFIXES.forEach(prefix => {
    if (!captures.some(capture => String(capture.name || "").startsWith(prefix))) {
      failures.push(`missing-required-desktop-prefix:${prefix}`);
    }
  });
  POST_WIRING_PROFILE_CANDIDATE_CAPTURES.forEach(name => {
    const capture = captures.find(item => item.name === name);
    if (!capture) {
      failures.push(`missing-post-wiring-profile-candidate:${name}`);
      return;
    }
    const runtime = capture.runtime || {};
    const runtimeChecks = {
      appFrameFound: runtime.appFrameFound === true,
      calculateFound: runtime.calculateFound === true,
      calculable: runtime.isCalculable === true,
      exerciseProfile: runtime.exerciseProfile === "mixed",
      profileSession: runtime.profileSession === "mixed_strength_cardio",
      routinePlan: runtime.routinePlan === "mixed_balanced",
      routine: runtime.routine === "mixed_strength_cardio",
      selectedMacroBasis: runtime.selectedMacroBasis === "profile_candidate_v2",
      productionWiringApplied: runtime.productionWiringApplied === true,
      productionTargetCalApplied: runtime.productionTargetCalApplied === true,
      runtimeProposalActive: runtime.runtimeProposalActive === true,
      runtimeProposalProfileCarbFloorMet: runtime.runtimeProposalProfileCarbFloorMet === true,
      recentGateStatusApplied: runtime.recentGateStatus === "applied",
      recentGateTargetDeltaApplied: runtime.recentGateTargetDeltaApplied === true,
      noSecondAutoApply: runtime.recentGateCanApplyAutomatically === false
    };
    Object.entries(runtimeChecks).forEach(([key, value]) => {
      if (!value) failures.push(`${name}:post-wiring-runtime:${key}`);
    });
  });
  Object.entries(PROFILE_ROUTINE_OWNERSHIP_CAPTURES).forEach(([name, expected]) => {
    const capture = captures.find(item => item.name === name);
    if (!capture) {
      failures.push(`missing-profile-routine-ownership:${name}`);
      return;
    }
    const runtime = capture.runtime || {};
    const todayCalcSummaryText = typeof runtime.todayCalcSummaryText === "string" ? runtime.todayCalcSummaryText : "";
    const expectedSummaryTerm = PROFILE_ROUTINE_SUMMARY_TERMS_BY_ROUTINE[expected.routine];
    const runtimeChecks = {
      appFrameFound: runtime.appFrameFound === true,
      calculateFound: runtime.calculateFound === true,
      calculable: runtime.isCalculable === true,
      exerciseProfile: runtime.exerciseProfile === expected.exerciseProfile,
      routinePlan: runtime.routinePlan === expected.routinePlan,
      routine: runtime.routine === expected.routine,
      todayProfileSelectHidden: runtime.todayProfileSelectHidden === true,
      todayRoutineProfileLabelPresent: typeof runtime.todayRoutineProfileLabelText === "string" && runtime.todayRoutineProfileLabelText.length > 0,
      todayRoutinePlanEditable: runtime.todayRoutinePlanDisabled === false,
      todayRoutinePlanValue: runtime.todayRoutinePlanValue === expected.routinePlan,
      todayRoutineSessionValue: runtime.todayRoutineSessionValue === expected.routine,
      todayRoutineSessionOptionsIncludeRoutine: Array.isArray(runtime.todayRoutineSessionOptions)
        && runtime.todayRoutineSessionOptions.includes(expected.routine),
      todayTrainingSummaryLabel: todayCalcSummaryText.includes("오늘 훈련"),
      todayTrainingSummaryIncludesSession: !expectedSummaryTerm || todayCalcSummaryText.includes(expectedSummaryTerm),
      todayTrainingSummaryDoesNotUseWeightRestCopy: !todayCalcSummaryText.includes("오늘 웨이트"),
      settingsDoesNotExposeDefaultSessionPicker: runtime.settingsTrainingHostHasDefaultSessionPicker === false,
      settingsKeepsWeekdaySchedule: runtime.settingsTrainingHostHasWeekdaySchedule === true
    };
    Object.entries(runtimeChecks).forEach(([key, value]) => {
      if (!value) failures.push(`${name}:profile-routine-ownership:${key}`);
    });
  });
  const mobileCaptures = analyzedCaptures.filter(capture => capture.isMobile);
  const desktopCaptures = analyzedCaptures.filter(capture => !capture.isMobile);
  const postWiringProfileCandidateCaptures = analyzedCaptures.filter(capture => POST_WIRING_PROFILE_CANDIDATE_CAPTURES.includes(capture.name));
  const postWiringProfileCandidateAppliedCaptures = postWiringProfileCandidateCaptures.filter(capture => capture.runtime?.productionWiringApplied === true && capture.runtime?.productionTargetCalApplied === true);
  const profileRoutineOwnershipCaptures = analyzedCaptures.filter(capture => Object.prototype.hasOwnProperty.call(PROFILE_ROUTINE_OWNERSHIP_CAPTURES, capture.name));
  if (captures.length < 65) failures.push(`capture-count:${captures.length}`);
  if (mobileCaptures.length < REQUIRED_MOBILE_CAPTURES.length) failures.push(`mobile-capture-count:${mobileCaptures.length}`);
  if (desktopCaptures.length < 42) failures.push(`desktop-capture-count:${desktopCaptures.length}`);
  if (postWiringProfileCandidateCaptures.length < POST_WIRING_PROFILE_CANDIDATE_CAPTURES.length) failures.push(`post-wiring-profile-candidate-capture-count:${postWiringProfileCandidateCaptures.length}`);
  if (postWiringProfileCandidateAppliedCaptures.length < POST_WIRING_PROFILE_CANDIDATE_CAPTURES.length) failures.push(`post-wiring-profile-candidate-applied-count:${postWiringProfileCandidateAppliedCaptures.length}`);
  if (profileRoutineOwnershipCaptures.length < Object.keys(PROFILE_ROUTINE_OWNERSHIP_CAPTURES).length) failures.push(`profile-routine-ownership-capture-count:${profileRoutineOwnershipCaptures.length}`);

  return {
    generatedAt: manifest.generatedAt || null,
    captureCount: captures.length,
    desktopCaptureCount: desktopCaptures.length,
    mobileCaptureCount: mobileCaptures.length,
    requiredMobileCaptureCount: REQUIRED_MOBILE_CAPTURES.length,
    postWiringProfileCandidateCaptureCount: postWiringProfileCandidateCaptures.length,
    postWiringProfileCandidateAppliedCaptureCount: postWiringProfileCandidateAppliedCaptures.length,
    profileRoutineOwnershipCaptureCount: profileRoutineOwnershipCaptures.length,
    minMobileImageHeight: mobileCaptures.reduce((min, capture) => Math.min(min, capture.png?.height || 0), Infinity),
    maxMobileImageHeight: mobileCaptures.reduce((max, capture) => Math.max(max, capture.png?.height || 0), 0),
    minUniqueSampleColorCount: analyzedCaptures.reduce((min, capture) => Math.min(min, capture.png?.uniqueSampleColorCount || 0), Infinity),
    minLuminanceStdDev: analyzedCaptures.reduce((min, capture) => Math.min(min, capture.png?.luminanceStdDev || 0), Infinity),
    failures,
    passed: failures.length === 0,
    captures: analyzedCaptures
  };
}

if (require.main === module) {
  try {
    const report = analyzeManifest();
    console.log(JSON.stringify({
      generatedAt: report.generatedAt,
      captureCount: report.captureCount,
      desktopCaptureCount: report.desktopCaptureCount,
      mobileCaptureCount: report.mobileCaptureCount,
      requiredMobileCaptureCount: report.requiredMobileCaptureCount,
      postWiringProfileCandidateCaptureCount: report.postWiringProfileCandidateCaptureCount,
      postWiringProfileCandidateAppliedCaptureCount: report.postWiringProfileCandidateAppliedCaptureCount,
      profileRoutineOwnershipCaptureCount: report.profileRoutineOwnershipCaptureCount,
      minMobileImageHeight: Number.isFinite(report.minMobileImageHeight) ? report.minMobileImageHeight : null,
      maxMobileImageHeight: report.maxMobileImageHeight,
      minUniqueSampleColorCount: Number.isFinite(report.minUniqueSampleColorCount) ? report.minUniqueSampleColorCount : null,
      minLuminanceStdDev: Number.isFinite(report.minLuminanceStdDev) ? report.minLuminanceStdDev : null,
      failedCount: report.failures.length,
      failures: report.failures
    }, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_MOBILE_CAPTURES,
  REQUIRED_DESKTOP_CAPTURE_PREFIXES,
  parsePngStats,
  analyzeManifest
};
