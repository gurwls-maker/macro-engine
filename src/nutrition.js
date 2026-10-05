(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MacroNutrition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "9.1.0-explicit-activity-and-preferences";
  const SOURCES = Object.freeze([
    { label: "Mifflin-St Jeor: 성인 안정시대사량", url: "https://pubmed.ncbi.nlm.nih.gov/2305711/" },
    { label: "운동선수 대사량 예측식의 정확도와 한계", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10687135/" },
    { label: "ISSN: 운동과 단백질", url: "https://link.springer.com/article/10.1186/s12970-017-0177-8" },
    { label: "ACSM: 운동 영양과 탄수화물", url: "https://pubmed.ncbi.nlm.nih.gov/26891166/" },
    { label: "IOC: 낮은 에너지 가용성과 개인차", url: "https://bjsm.bmj.com/content/57/17/1073" },
    { label: "2024 신체활동 Compendium", url: "https://pacompendium.com/adult-compendium/" },
    { label: "NIDDK: 성인 체중 관리 적용 범위", url: "https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" },
    { label: "FAO/WHO/UNU: 24시간 활동별 에너지 추정", url: "https://www.fao.org/4/y5686e/y5686e07.htm" },
    { label: "ACSM: 걷기·달리기 대사량 계산", url: "https://www.lww.co.uk/9780781742382/acsms-metabolic-calculations-handbook/" },
    { label: "걷기 대사식의 실제 검증과 한계", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7896743/" },
    { label: "ACSM 달리기 식의 정상상태 조건과 한계", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3743617/" }
  ]);
  const ENUMS = Object.freeze({
    sex: ["male", "female", "unspecified"],
    sport: ["none", "strength", "running", "cycling", "swimming", "team", "mixed"],
    goal: ["lose", "maintain", "gain", "recomp", "performance"],
    activity: ["sedentary", "light", "active", "physical"],
    healthContext: ["general", "pregnancy", "breastfeeding", "clinical", "eating_disorder"],
    bodyFatMethod: ["unknown", "bia", "dxa", "caliper"],
    proteinPreference: ["lower", "standard", "higher"]
  });
  Object.values(ENUMS).forEach(Object.freeze);
  // Categories select representative activities, not an individual's measured expenditure.
  const METS = Object.freeze({
    strength: { easy: 3, moderate: 3.5, hard: 6 },
    running: { easy: 6.5, moderate: 8.5, hard: 11 },
    cycling: { easy: 4.3, moderate: 7, hard: 9 },
    swimming: { easy: 5.8, moderate: 8, hard: 9.8 },
    walking: { easy: 2.8, moderate: 3.8, hard: 4.8 },
    team: { easy: 4, moderate: 6, hard: 8 },
    mixed: { easy: 3.5, moderate: 5, hard: 7.5 }
  });
  Object.values(METS).forEach(Object.freeze);
  const ACTIVITY = Object.freeze({ sedentary: 1.2, light: 1.35, active: 1.5, physical: 1.7 });
  // FAO activity examples grouped for this product, not personalized measurements or METs.
  const ACTIVITY_PARS = Object.freeze({ sleep: 1, rest: 1.4, work: Object.freeze({ seated: 1.5, standing: 2.2, physical: 4.1 }), lifestyle: Object.freeze({ light: 2.1, active: 3.2 }) });
  const CARDIO_LIMITS = Object.freeze({ walking: Object.freeze({ minSpeedKmh: 3, maxSpeedKmh: 6 }), running: Object.freeze({ minSpeedKmh: 8.1, maxSpeedKmh: 20 }), minGradePct: 0, maxGradePct: 15 });
  const SPORT_LABELS = Object.freeze({ strength: "근력 운동", running: "달리기", cycling: "자전거", swimming: "수영", walking: "걷기", team: "구기 운동", mixed: "복합 운동", none: "일상 활동" });
  const DAY_MS = 86400000;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const optional = value => value === null || value === undefined || value === "";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const smooth = value => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
  }

  function validateProfile(profile) {
    const errors = [];
    const p = profile && typeof profile === "object" ? profile : {};
    [["age", "나이", 1, 120], ["heightCm", "키", 100, 250], ["weightKg", "체중", 20, 350]].forEach(([key, label, min, max]) => {
      if (!finite(p[key]) || p[key] < min || p[key] > max) errors.push(`${label}을 ${min}~${max} 범위의 숫자로 입력해 주세요.`);
    });
    Object.entries(ENUMS).forEach(([key, values]) => {
      if (!values.includes(p[key])) errors.push(({ sex: "성별", sport: "운동 종목", goal: "목표", activity: "생활활동", healthContext: "건강 상태", bodyFatMethod: "체지방 측정 방법", proteinPreference: "단백질 설정" })[key] + "을 확인해 주세요.");
    });
    if (!optional(p.bodyFatPct) && (!finite(p.bodyFatPct) || p.bodyFatPct < 2 || p.bodyFatPct > 65)) errors.push("체지방률은 2~65%로 입력하거나 비워 주세요.");
    if (!optional(p.bodyFatWeightKg) && (!finite(p.bodyFatWeightKg) || p.bodyFatWeightKg < 20 || p.bodyFatWeightKg > 350)) errors.push("체성분 측정 당시 체중은 20~350kg으로 입력하거나 비워 주세요.");
    if (!optional(p.trainingYears) && (!finite(p.trainingYears) || p.trainingYears < 0 || p.trainingYears > 80 || (finite(p.age) && p.trainingYears > p.age))) errors.push("운동 경력은 나이 이내의 0 이상 숫자로 입력하거나 비워 주세요.");
    if (!optional(p.bodyFatDate) && dateNumber(p.bodyFatDate) === null) errors.push("체지방 측정일을 실제 날짜로 입력해 주세요.");
    if (p.activityMode !== undefined && !["simple", "detailed"].includes(p.activityMode)) errors.push("활동 계산 방식을 확인해 주세요.");
    if (p.goalPreference !== undefined && !["standard", "conservative"].includes(p.goalPreference)) errors.push("감량·증량 선호를 확인해 주세요.");
    errors.push(...validateActivityDraft(p.dailyActivity, "기본 활동 시간"));
    if (p.weekdayActivity !== undefined) {
      if (!object(p.weekdayActivity)) errors.push("요일별 활동 시간 형식을 확인해 주세요.");
      else Object.entries(p.weekdayActivity).forEach(([key, value]) => {
        if (!/^[0-6]$/.test(key)) errors.push("요일별 활동 시간은 일요일 0부터 토요일 6까지만 지정할 수 있어요.");
        errors.push(...validateActivityDraft(value, "요일별 활동 시간"));
      });
    }
    return { valid: errors.length === 0, isValid: errors.length === 0, errors };
  }

  function validateActivityDraft(value, label) {
    if (value === undefined || value === null) return [];
    if (!object(value)) return [`${label} 형식을 확인해 주세요.`];
    const errors = [];
    for (const key of ["sleepHours", "workHours", "lifestyleHours"]) {
      if (!optional(value[key]) && (!finite(value[key]) || value[key] < 0 || value[key] > 24)) errors.push(`${label}은 0~24시간의 숫자로 입력해 주세요.`);
    }
    for (const [key, values] of [["workType", ACTIVITY_PARS.work], ["lifestyleType", ACTIVITY_PARS.lifestyle]]) {
      if (!optional(value[key]) && !Object.hasOwn(values, value[key])) errors.push(`${label}의 업무·생활 유형을 확인해 주세요.`);
    }
    return errors;
  }

  function resolveDailyActivity(profile, day) {
    if (profile.activityMode !== "detailed") return { errors: [], context: { mode: "simple" } };
    const stamp = dateNumber(day.date);
    const weekday = stamp === null ? null : new Date(stamp).getUTCDay();
    const byWeekday = weekday !== null && object(profile.weekdayActivity) ? profile.weekdayActivity[String(weekday)] : null;
    const source = object(day.dailyActivity) ? "day" : object(byWeekday) ? "weekday" : "profile";
    const input = source === "day" ? day.dailyActivity : source === "weekday" ? byWeekday : profile.dailyActivity;
    const context = { mode: "detailed", source, weekday };
    const errors = [];
    if (source !== "day" && weekday === null && object(profile.weekdayActivity) && Object.values(profile.weekdayActivity).some(object)) errors.push("요일별 활동 시간을 적용하려면 기록 날짜를 입력해 주세요.");
    if (!object(input)) return { errors: [...errors, "상세 모드의 수면·업무·생활 시간을 입력해 주세요. 모르는 시간은 0으로 채우지 않아요."], context };
    for (const [key, label] of [["sleepHours", "수면"], ["workHours", "업무"], ["lifestyleHours", "생활활동"]]) {
      if (!finite(input[key]) || input[key] < 0 || input[key] > 24) errors.push(`${label} 시간을 0~24 범위로 입력해 주세요. 하지 않은 활동만 0시간이에요.`);
    }
    if (finite(input.workHours) && input.workHours > 0 && !Object.hasOwn(ACTIVITY_PARS.work, input.workType)) errors.push("업무 시간에 맞는 업무 유형을 선택해 주세요.");
    if (finite(input.lifestyleHours) && input.lifestyleHours > 0 && !Object.hasOwn(ACTIVITY_PARS.lifestyle, input.lifestyleType)) errors.push("생활활동 시간에 맞는 유형을 선택해 주세요.");
    const exerciseHours = Array.isArray(day.sessions) ? day.sessions.reduce((sum, session) => sum + (finite(session?.durationMin) ? session.durationMin / 60 : 0), 0) : 0;
    if (errors.length) return { errors, context };
    const allocatedHours = input.sleepHours + input.workHours + input.lifestyleHours + exerciseHours;
    if (allocatedHours > 24 + 1e-9) errors.push(`수면·업무·생활·운동 합계가 ${allocatedHours.toFixed(2)}시간으로 24시간을 넘어요. 같은 시간을 중복 입력하지 않았는지 확인해 주세요.`);
    return { errors, context: { ...context, sleepHours: input.sleepHours, workHours: input.workHours, workType: input.workType || null, lifestyleHours: input.lifestyleHours, lifestyleType: input.lifestyleType || null, exerciseHours, allocatedHours, restHours: Math.max(0, 24 - allocatedHours) } };
  }

  function validateCardio(session, index) {
    if (session.cardio === undefined || session.cardio === null) return [];
    const prefix = `${index + 1}번째 운동의 상세 유산소`;
    const cardio = session.cardio;
    if (!object(cardio) || !["walking", "running"].includes(session.sport)) return [`${prefix}는 걷기·달리기에서만 사용할 수 있어요.`];
    const errors = [];
    if (!["treadmill", "outdoor"].includes(cardio.environment)) errors.push(`${prefix}의 트레드밀·실외 환경을 선택해 주세요.`);
    const limits = CARDIO_LIMITS[session.sport];
    if (!finite(cardio.speedKmh) || cardio.speedKmh < limits.minSpeedKmh || cardio.speedKmh > limits.maxSpeedKmh) errors.push(`${prefix}의 ${SPORT_LABELS[session.sport]} 속도는 ${limits.minSpeedKmh}~${limits.maxSpeedKmh}km/h 범위에서 계산해요. 범위 밖이면 상세 설정을 끄고 강도 기반 추정을 사용해 주세요.`);
    if (!finite(cardio.gradePct) || cardio.gradePct < CARDIO_LIMITS.minGradePct || cardio.gradePct > CARDIO_LIMITS.maxGradePct) errors.push(`${prefix} 경사는 0~15%로 입력해 주세요. 평지일 때만 0이며 내리막은 지원하지 않아요.`);
    else if (cardio.environment === "outdoor" && cardio.gradePct !== 0) errors.push(`${prefix} 실외 계산은 일정한 평지 속도만 지원해요. 경사·지형이 섞이면 상세 설정을 끄고 강도 기반 추정을 사용해 주세요.`);
    return errors;
  }

  function estimateSession(session, weight) {
    let met = METS[session.sport][session.intensity];
    let restKcal = weight * session.durationMin / 60;
    let grossKcal = met * restKcal;
    let netKcal = (met - 1) * weight * session.durationMin / 60;
    let method = "representative_met";
    if (session.cardio) {
      const speed = session.cardio.speedKmh * 1000 / 60;
      const grade = session.cardio.gradePct / 100;
      const oxygen = 3.5 + (session.sport === "walking" ? 0.1 * speed + 1.8 * speed * grade : 0.2 * speed + 0.9 * speed * grade);
      met = oxygen / 3.5;
      // Approximate 5 kcal per litre O2; subtract this same equation's resting component.
      restKcal = 3.5 * weight / 1000 * 5 * session.durationMin;
      grossKcal = oxygen * weight / 1000 * 5 * session.durationMin;
      netKcal = grossKcal - restKcal;
      method = session.cardio.environment === "outdoor" ? "acsm_level_outdoor_approximation" : `acsm_${session.sport}`;
    }
    return { id: session.id || null, sport: session.sport, durationMin: session.durationMin, intensity: session.intensity, met, grossKcal, restKcal, netKcal, method, cardio: session.cardio ? { ...session.cardio } : null };
  }

  function blankPlan(status, reasons, context = {}) {
    const range = () => ({ target: null, min: null, max: null });
    return {
      status, reasons, version: VERSION,
      energy: { targetKcal: null, tdeeKcal: null, restingKcal: null, exerciseKcal: null, range: [null, null], method: null },
      macros: { protein: range(), carbs: range(), fat: range() }, context,
      guidance: [{ id: status, title: status === "review" ? "개별 영양 상담이 먼저예요" : "프로필을 확인해 주세요", body: reasons.join(" ") }],
      sources: SOURCES.map(item => ({ ...item }))
    };
  }

  function validateDay(day) {
    const errors = [];
    if (!optional(day.date) && dateNumber(day.date) === null) errors.push("기록 날짜를 확인해 주세요.");
    if (!optional(day.weightKg) && (!finite(day.weightKg) || day.weightKg < 20 || day.weightKg > 350)) errors.push("오늘 체중은 20~350kg 범위로 입력해 주세요.");
    if (day.sessions !== undefined && !Array.isArray(day.sessions)) errors.push("운동 기록 형식을 확인해 주세요.");
    errors.push(...validateActivityDraft(day.dailyActivity, "오늘 활동 시간"));
    const sessions = Array.isArray(day.sessions) ? day.sessions : [];
    sessions.forEach((session, index) => {
      if (!session || !Object.hasOwn(METS, session.sport) || !["easy", "moderate", "hard"].includes(session.intensity) || !finite(session.durationMin) || session.durationMin < 0 || session.durationMin > 1440) errors.push(`${index + 1}번째 운동의 종목, 시간, 강도를 확인해 주세요.`);
      if (object(session)) errors.push(...validateCardio(session, index));
    });
    if (sessions.length > 20) errors.push("하루 운동 기록이 너무 많습니다. 중복 입력을 확인해 주세요.");
    return errors;
  }

  function summarizeWeightTrend(history, day) {
    const end = dateNumber(day.date);
    const byDate = new Map();
    const duplicateDates = new Set();
    if (end === null || !Array.isArray(history)) return { available: false, observations: 0, kgPerWeek: null };
    [...history, day].forEach(item => {
      if (!item || !finite(item.weightKg) || item.weightKg < 20 || item.weightKg > 350) return;
      const date = dateNumber(item.date);
      if (date === null || date > end || end - date > 42 * DAY_MS) return;
      if (byDate.has(date) && byDate.get(date) !== item.weightKg) duplicateDates.add(date);
      byDate.set(date, item.weightKg);
    });
    duplicateDates.forEach(date => byDate.delete(date));
    const values = [...byDate].sort((a, b) => a[0] - b[0]);
    const spanDays = values.length > 1 ? (values.at(-1)[0] - values[0][0]) / DAY_MS : 0;
    if (values.length < 4 || spanDays < 14) return { available: false, observations: values.length, days: spanDays, kgPerWeek: null };
    const slopes = [];
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const days = (values[j][0] - values[i][0]) / DAY_MS;
        if (days >= 7) slopes.push((values[j][1] - values[i][1]) / days * 7);
      }
    }
    slopes.sort((a, b) => a - b);
    const middle = Math.floor(slopes.length / 2);
    const kgPerWeek = slopes.length % 2 ? slopes[middle] : (slopes[middle - 1] + slopes[middle]) / 2;
    return { available: true, observations: values.length, days: spanDays, kgPerWeek, confidence: values.length >= 8 && spanDays >= 21 ? "moderate" : "low", automaticallyApplied: false };
  }

  function calculatePlan(profile, day = {}, history = []) {
    const p = profile && typeof profile === "object" ? profile : {};
    const d = day && typeof day === "object" && !Array.isArray(day) ? day : {};
    const validation = validateProfile(p);
    const activity = resolveDailyActivity(p, d);
    const errors = [...validation.errors, ...validateDay(d), ...activity.errors];
    if (errors.length) return blankPlan("incomplete", errors, { dailyActivity: activity.context });
    const weight = optional(d.weightKg) ? p.weightKg : d.weightKg;
    const bmi = weight / (p.heightCm / 100) ** 2;
    const sessions = (d.sessions || []).filter(session => session.durationMin > 0);
    const trainingMinutes = sessions.reduce((sum, session) => sum + session.durationMin, 0);
    const reviewReasons = [];
    if (p.age < 18) reviewReasons.push("성장기에는 성인용 체중·영양 공식을 적용하지 않아요. 성장 상태를 함께 평가할 수 있는 전문가와 목표를 정해 주세요.");
    if (p.age > 80) reviewReasons.push("80세 초과에서는 근력, 식사량, 질환과 약물을 함께 확인한 영양 목표가 필요해요.");
    if (bmi < 18.5) reviewReasons.push("현재 키와 체중은 저체중 범위에 있어요. 체중 변화보다 영양 상태를 먼저 확인해 주세요.");
    if (bmi > 50) reviewReasons.push("현재 체격에서는 일반식으로 계산한 오차가 커질 수 있어요. 측정과 진료 정보를 바탕으로 목표를 정해 주세요.");
    const healthReasons = {
      pregnancy: "임신 중에는 임신 주수와 성장 상태에 맞춘 영양 목표가 필요해요.",
      breastfeeding: "수유 중에는 수유량과 회복 상태를 고려한 영양 목표가 필요해요.",
      clinical: "질환·약물·치료 식이가 있다면 담당 전문가가 정한 영양 목표를 우선해 주세요.",
      eating_disorder: "섭식 문제의 회복 중에는 칼로리와 체중 감량 목표보다 치료팀과 정한 식사 계획을 우선해 주세요."
    };
    if (healthReasons[p.healthContext]) reviewReasons.push(healthReasons[p.healthContext]);
    if (trainingMinutes > 360) reviewReasons.push("6시간을 넘는 훈련은 장시간 경기 영양과 회복 계획을 별도로 정해야 해요.");
    if (!optional(p.bodyFatPct) && p.bodyFatPct < ({ male: 5, female: 12, unspecified: 8 })[p.sex]) reviewReasons.push("체지방률이 매우 낮게 입력됐어요. 측정값과 회복 상태를 확인한 뒤 목표를 정해 주세요.");
    if (reviewReasons.length) return blankPlan("review", reviewReasons, { bmi, weightKg: weight, trainingMinutes });

    const reasons = [];
    const asOf = dateNumber(d.date);
    const measuredAt = dateNumber(p.bodyFatDate);
    const bodyFatAgeDays = asOf !== null && measuredAt !== null ? (asOf - measuredAt) / DAY_MS : null;
    const hasBodyFat = !optional(p.bodyFatPct);
    const bodyFatReferenceWeightKg = optional(p.bodyFatWeightKg) ? null : p.bodyFatWeightKg;
    const ffmKg = hasBodyFat && bodyFatReferenceWeightKg !== null ? bodyFatReferenceWeightKg * (1 - p.bodyFatPct / 100) : null;
    const relativeWeightChange = bodyFatReferenceWeightKg !== null ? Math.abs(weight - bodyFatReferenceWeightKg) / bodyFatReferenceWeightKg : null;
    // A dated measurement stays paired with its own weight; stale or changed bodies lose authority gradually.
    const freshness = bodyFatAgeDays !== null && bodyFatAgeDays >= 0 ? 1 - smooth((bodyFatAgeDays - 30) / 150) : 0;
    const weightAgreement = relativeWeightChange !== null ? 1 - smooth(relativeWeightChange / 0.1) : 0;
    const bodyCompositionInfluence = ffmKg !== null && p.bodyFatMethod !== "unknown" ? freshness * weightAgreement : 0;
    const bodyFatUsable = bodyCompositionInfluence > 0;
    const measurementConfidence = bodyFatUsable ? (p.bodyFatMethod === "dxa" && bodyCompositionInfluence > 0.8 ? "moderate" : "low") : "unknown";
    if (p.sex === "unspecified") reasons.push("성별을 지정하지 않아 두 성별 공식의 중간값을 사용했어요. 개인 오차가 더 클 수 있어요.");
    if (!hasBodyFat) reasons.push("체성분 미입력: 제지방량과 에너지 가용성은 추정하지 않았어요.");
    else if (bodyFatReferenceWeightKg === null) reasons.push("체성분 측정 당시 체중이 없어요. 제지방량을 계산하거나 목표 보정에 사용하지 않았어요.");
    else if (!bodyFatUsable) reasons.push("체지방 측정 방법·날짜가 불확실하거나, 측정 후 시간·체중 변화가 커졌어요. 목표 보정에는 사용하지 않았어요.");
    else if (p.bodyFatMethod === "bia") reasons.push("체성분계 값은 수분 상태에 따라 달라져요. 같은 시간과 조건의 측정을 비교해 주세요.");
    if (bodyFatUsable && (bodyFatAgeDays > 30 || relativeWeightChange > 0.01)) reasons.push("체성분은 측정 당시 체중과 짝지어 참고했어요. 경과 시간과 체중 변화에 따라 목표에 반영하는 정도를 줄였어요.");
    if (p.age >= 60) reasons.push("60세 이상에서는 운동 효율과 건강 상태에 따라 소모량 오차가 커질 수 있어요.");

    const sexOffset = { male: 5, female: -161, unspecified: -78 }[p.sex];
    const restingKcal = 10 * weight + 6.25 * p.heightCm - 5 * p.age + sexOffset;
    const sessionBreakdown = sessions.map(session => estimateSession(session, weight));
    const exerciseKcal = sessionBreakdown.reduce((sum, session) => sum + session.netKcal, 0);
    const detailed = activity.context.mode === "detailed";
    let baseTdee = restingKcal * ACTIVITY[p.activity];
    let tdeeKcal = baseTdee + exerciseKcal;
    if (detailed) {
      const time = activity.context;
      const work = time.workHours > 0 ? time.workHours * ACTIVITY_PARS.work[time.workType] : 0;
      const lifestyle = time.lifestyleHours > 0 ? time.lifestyleHours * ACTIVITY_PARS.lifestyle[time.lifestyleType] : 0;
      const nonExerciseKcal = restingKcal / 24 * (time.sleepHours * ACTIVITY_PARS.sleep + work + lifestyle + time.restHours * ACTIVITY_PARS.rest);
      const exerciseGrossKcal = sessionBreakdown.reduce((sum, session) => sum + session.grossKcal, 0);
      const replacedRestKcal = restingKcal / 24 * time.exerciseHours * ACTIVITY_PARS.rest;
      // All 24 hours have one owner. Training replaces leisure rather than being added over it.
      baseTdee = nonExerciseKcal + replacedRestKcal;
      tdeeKcal = nonExerciseKcal + exerciseGrossKcal;
      Object.assign(time, { nonExerciseKcal, exerciseGrossKcal, replacedRestKcal, baselineWithoutTrainingKcal: baseTdee, exerciseIncrementKcal: exerciseGrossKcal - replacedRestKcal, estimatedPal: tdeeKcal / restingKcal, coefficients: { sleep: ACTIVITY_PARS.sleep, rest: ACTIVITY_PARS.rest, work: time.workHours > 0 ? ACTIVITY_PARS.work[time.workType] : null, lifestyle: time.lifestyleHours > 0 ? ACTIVITY_PARS.lifestyle[time.lifestyleType] : null } });
      reasons.push("상세 시간표는 입력한 활동과 남은 휴식을 합쳐 24시간으로 계산했어요. 업무·생활 시간에 이미 포함한 운동은 중복 기록하지 마세요. 활동별 대표값을 조합한 추정이며 단순 모드보다 정확하다고 보장하지 않아요.");
    }
    const years = optional(p.trainingYears) ? null : p.trainingYears;
    const experience = years === null ? 0.5 : 1 - Math.exp(-years / 3);
    const leanStart = { male: 8, female: 18, unspecified: 13 }[p.sex];
    const adiposity = bodyFatUsable ? 0.5 + (smooth((p.bodyFatPct - leanStart) / 20) - 0.5) * bodyCompositionInfluence : 0.5;
    // Goal offsets apply to non-training expenditure, preserving fueling on long training days.
    let goalDeltaKcal = 0;
    if (p.goal === "lose") goalDeltaKcal = -Math.min(500, baseTdee * (0.1 + 0.1 * adiposity));
    if (p.goal === "gain") goalDeltaKcal = Math.min(300, baseTdee * (0.1 - 0.05 * experience));
    if (p.goal === "recomp") goalDeltaKcal = -baseTdee * 0.05 * adiposity;
    const goalPreference = p.goalPreference || "standard";
    if (goalPreference === "conservative" && ["lose", "gain"].includes(p.goal)) goalDeltaKcal *= 0.5;
    const targetKcal = tdeeKcal + goalDeltaKcal;
    if (!(restingKcal > 0) || !(targetKcal >= 1000)) return blankPlan("review", ["입력값에서 일반적인 성인 영양 목표를 만들기 어려워요. 체격과 건강 상태를 확인해 주세요."], { bmi, weightKg: weight });

    const anyTraining = p.sport !== "none" || sessions.length > 0;
    const weightedMinutes = sessions.reduce((sum, session) => sum + session.durationMin * (session.sport === "walking" ? 0.2 : 1), 0);
    const resistanceMinutes = sessions.reduce((sum, session) => sum + (["strength", "mixed"].includes(session.sport) ? session.durationMin : 0), 0);
    const trainingShare = p.sport !== "none" ? 1 : 1 - Math.exp(-weightedMinutes / 120);
    const resistanceShare = ["strength", "mixed"].includes(p.sport) ? 1 : 1 - Math.exp(-resistanceMinutes / 90);
    const heightReferenceKg = 27.5 * (p.heightCm / 100) ** 2;
    const defaultProteinReferenceKg = Math.min(weight, heightReferenceKg);
    const measuredProteinReferenceKg = bodyFatUsable ? Math.min(weight, Math.max(heightReferenceKg, ffmKg / 0.8)) : defaultProteinReferenceKg;
    const proteinReferenceKg = defaultProteinReferenceKg + (measuredProteinReferenceKg - defaultProteinReferenceKg) * bodyCompositionInfluence;
    const olderAdjustment = 0.2 * smooth((p.age - 50) / 20);
    const proteinMinPerKg = 1 + 0.4 * trainingShare + (p.goal === "lose" ? 0.2 : 0) + olderAdjustment;
    const proteinMaxPerKg = 1.6 + 0.6 * trainingShare;
    const requestedProteinPerKg = 1.2 + 0.4 * trainingShare + 0.1 * resistanceShare
      + (p.goal === "lose" || p.goal === "recomp" ? 0.2 : 0)
      + olderAdjustment + (p.proteinPreference === "higher" ? 0.2 : 0);
    const proteinBudgetMax = targetKcal * 0.35 / 4;
    const preferredProteinPerKg = p.proteinPreference === "lower" ? proteinMinPerKg : requestedProteinPerKg;
    const proteinTarget = Math.min(clamp(preferredProteinPerKg, proteinMinPerKg, proteinMaxPerKg) * proteinReferenceKg, proteinBudgetMax);
    const protein = {
      target: proteinTarget,
      min: Math.min(proteinTarget, proteinMinPerKg * proteinReferenceKg),
      max: Math.max(proteinTarget, Math.min(proteinMaxPerKg * proteinReferenceKg, proteinBudgetMax))
    };
    const carbLoad = sessionBreakdown.reduce((sum, session) => sum + session.netKcal * (session.sport === "strength" ? 0.55 : session.sport === "walking" ? 0.4 : 1), 0) / weight;
    const fatShare = 0.30 - 0.05 * (1 - Math.exp(-carbLoad / 5));
    const fat = { target: targetKcal * fatShare / 9, min: targetKcal * 0.20 / 9, max: targetKcal * 0.35 / 9 };
    const carbs = {
      target: (targetKcal - protein.target * 4 - fat.target * 9) / 4,
      min: Math.max(0, (targetKcal - protein.target * 4 - fat.max * 9) / 4),
      max: Math.max(0, (targetKcal - protein.target * 4 - fat.min * 9) / 4)
    };
    const energyAvailability = bodyFatUsable ? (targetKcal - exerciseKcal) / ffmKg : null;
    const uncertainty = baseTdee * (p.sex === "unspecified" ? 0.20 : 0.15) + exerciseKcal * (p.age >= 60 || sessionBreakdown.some(session => session.cardio?.environment === "outdoor") ? 0.4 : 0.3);
    const weightTrend = summarizeWeightTrend(history, d);
    const guidance = [];
    const push = (id, title, body) => guidance.push({ id, title, body });
    if (p.goal === "lose") push("goal", "감량은 천천히 확인해요", "생활 소모량에서 작은 적자로 시작해요. 체중, 허기, 회복과 운동 수행을 2~4주 함께 비교해 주세요. 회복이 나빠지면 목표보다 충분한 식사를 우선해요.");
    else if (p.goal === "gain") push("goal", "증량 속도보다 훈련의 진전을 봐요", years === null ? "운동 경력을 모르는 상태라 작은 흑자로 시작해요. 체중과 근력 변화를 함께 확인해 주세요." : `운동 경력 ${years}년을 반영해 증량 흑자를 조절했어요. 근력은 그대로인데 허리둘레만 빠르게 늘면 섭취량을 다시 확인해 주세요.`);
    else if (p.goal === "recomp") push("goal", "체중 외의 변화도 함께 봐요", "유지에 가까운 식사와 점진적인 근력 운동을 함께 이어가요. 체중 한 번보다 허리둘레, 근력, 같은 조건의 체성분 추세를 비교해 주세요.");
    else if (p.goal === "performance") push("goal", "훈련을 버틸 식사를 먼저 챙겨요", "오늘의 운동량을 반영했어요. 경기 준비와 훈련의 질이 우선이라 의도적인 감량 적자는 만들지 않았어요.");
    else push("goal", "유지는 몇 주의 평균으로 봐요", "하루 체중은 수분과 식사량에 따라 달라져요. 같은 조건의 아침 체중과 식사 기록을 2~4주 비교해 주세요.");
    if (goalPreference === "conservative" && ["lose", "gain"].includes(p.goal)) push("goal-preference", "유지에 더 가까운 목표를 선택했어요", "표준 설정의 감량 적자·증량 흑자를 절반으로 줄였어요. 이 차이는 개인 선호를 반영한 제품 설정이며 특정 체중 변화 속도나 안전성을 보장하지 않아요.");
    if (p.proteinPreference === "lower") push("protein-preference", "단백질 범위의 아래쪽을 선택했어요", "현재 체격·목표·운동에 맞춰 계산한 범위의 아래쪽에서 시작해요. 단백질을 줄인 만큼 탄수화물로 배분하고 하루 목표 열량은 유지했어요. 질환에 따른 단백질 제한 기준은 아니에요.");
    if (detailed) push("daily-activity", "운동 시간은 휴식 시간과 겹치지 않아요", "수면·업무·생활·실제 운동을 제외한 시간은 가벼운 휴식으로 배분했어요. 육체 업무는 실제 작업한 시간이며 휴게·식사 시간을 따로 구분해 주세요. 요일 예외보다 오늘 입력이 우선해요.");
    if (sessionBreakdown.some(session => session.cardio)) push("cardio-details", "속도·경사는 일정한 운동의 추정이에요", "걷기 3~6km/h, 달리기 8.1~20km/h, 트레드밀 경사 0~15%의 지원 범위에서 계산해요. 손잡이에 기대기, 짐 운반, 인터벌, 내리막에는 맞지 않아요. 실외는 평지·일정 속도에 적용한 근사로 바람·지면 차이를 반영하지 않으며, 속도로 심폐능력이나 실제 소모를 확정하지 않아요.");
    const mealConstraint = d.coachCheckin?.mealConstraint;
    if (mealConstraint === "digestive") push("meal-constraint", "소화가 불편하면 식사 크기부터 조절해요", "한 번에 많은 양을 억지로 채우기보다 익숙하고 잘 견디는 음식을 작은 식사로 나눠 보세요. 불편함만으로 탄수·단백질 목표를 자동으로 줄이지 않았어요. 증상이 지속되거나 심하면 진료를 받아 주세요.");
    if (mealConstraint === "low-appetite") push("meal-constraint", "적은 식욕에 맞춰 나눠 먹어요", "한 끼를 크게 늘리기보다 부담이 덜한 식사나 간식으로 나눠 보세요. 섭취 목표는 식욕만으로 자동 변경하지 않아요. 식욕 저하가 지속되면 원인을 확인해 주세요.");

    const sportGuidance = {
      strength: ["단백질을 끼니에 나눠요", "하루 단백질을 여러 끼에 나누고, 훈련 전후에는 탄수화물이 있는 식사를 챙겨 주세요. 쉬는 날에도 단백질은 유지해요."],
      running: ["달리는 날은 탄수화물을 챙겨요", "긴 달리기 전에는 익숙하고 소화가 잘되는 식사를 고르고, 훈련 후 탄수화물과 단백질을 함께 보충해 주세요."],
      cycling: ["긴 라이딩은 도중 보급을 준비해요", "라이딩 시간과 보급 기회를 함께 계획해요. 실제 보급한 음료와 간식도 하루 식사에 포함해 주세요."],
      swimming: ["수영 전후 식사 간격을 확인해요", "입수 전 부담이 적은 식사를 고르고 긴 훈련 뒤에는 식사를 지나치게 미루지 마세요. 물속에서도 수분 보충을 챙겨 주세요."],
      walking: ["걷기는 지속할 수 있는 식사와 함께해요", "일상적인 산책에는 별도의 스포츠 보급식이 꼭 필요하지 않아요. 긴 걷기나 더운 날에는 식사 간격과 수분을 챙겨 주세요."],
      team: ["경기와 훈련 사이 회복을 챙겨요", "반복 질주와 경기 일정이 겹치면 탄수화물 공급이 중요해요. 다음 세션까지 시간이 짧을수록 운동 후 식사를 챙겨 주세요."],
      mixed: ["각 종목의 운동 시간을 따로 봐요", "근력과 유산소를 함께 한 날은 둘 다 기록해요. 단백질은 꾸준히, 탄수화물은 실제 운동량에 맞춰 챙겨 주세요."],
      none: ["꾸준히 먹을 수 있는 구성을 골라요", "각 끼니에 단백질 식품, 채소와 과일, 통곡류나 전분 식품을 나누어 담아 주세요."]
    };
    const activeSports = [...new Set(sessions.map(session => session.sport))];
    const guidanceSport = activeSports.length > 1 ? "mixed" : activeSports[0] || p.sport;
    push("sport", ...sportGuidance[guidanceSport]);
    const longSession = sessions.filter(session => !["strength", "walking"].includes(session.sport)).sort((a, b) => b.durationMin - a.durationMin)[0];
    if (longSession && longSession.durationMin >= 90) push("fueling", "긴 운동 중 보급도 하루 섭취에 포함해요", "1~2.5시간의 지속 운동은 시간당 탄수화물 30~60g을 참고할 수 있어요. 더 긴 운동의 많은 보급량은 훈련 때 소화 적응을 확인하며 개별 계획을 세워 주세요. 이 보급은 표시된 하루 목표에 추가로 더하는 양이 아니에요.");
    if (proteinReferenceKg < weight - 0.5) push("protein-basis", "단백질은 체중만으로 과하게 늘리지 않아요", bodyFatUsable ? "체격과 측정 당시 체성분을 참고해 계산 기준 체중을 조정했어요. 이는 시작점이며 질환이 있는 경우의 치료 기준은 아니에요." : "키와 체중을 기준으로 단백질 계산의 기준 체중을 보수적으로 조정했어요. 실제 체성분을 확인한 보정은 아니며, 근육량이 많은 체격에서는 측정 자료를 함께 확인해 주세요.");
    if (energyAvailability !== null && energyAvailability < 35) push("availability", "회복과 충분한 식사를 함께 확인해요", "측정 당시 제지방량을 참고하면 운동을 제외하고 남는 에너지가 적을 수 있어요. 지속적인 피로, 회복 저하, 월경 변화가 있으면 감량을 서두르지 말고 평가를 받아 주세요. 이 수치 하나로 영양 부족을 진단할 수는 없어요.");
    if (p.sex === "female" && anyTraining) push("female-athlete", "몸의 변화와 회복도 함께 봐요", "주기·폐경·호르몬 상태를 추측해 칼로리를 자동 변경하지 않아요. 해당되는 경우 월경 변화, 또는 지속적인 피로가 있다면 식사와 건강 상태를 함께 확인해 주세요.");
    if (weightTrend.available) push("trend", "최근 체중 추세가 쌓였어요", `최근 ${weightTrend.days}일, ${weightTrend.observations}회 기록의 추세는 주당 ${weightTrend.kgPerWeek >= 0 ? "+" : ""}${weightTrend.kgPerWeek.toFixed(2)}kg이에요. 수분 변화도 섞일 수 있어 목표는 자동으로 바꾸지 않았어요.`);
    if (!bodyFatUsable) push("body-composition", "체성분을 몰라도 시작할 수 있어요", "체중·키·나이와 활동으로 시작점을 계산했어요. 체성분 측정값이 있다면 측정 당시 체중, 방법과 날짜를 함께 남겨 주세요.");
    if (years === null && anyTraining) reasons.push("운동 경력 미입력: 운동 빈도로 숙련도를 추정하지 않았어요.");
    return {
      status: "ready", reasons, version: VERSION,
      energy: { targetKcal, tdeeKcal, restingKcal, exerciseKcal, range: [Math.max(0, targetKcal - uncertainty), targetKcal + uncertainty], method: `Mifflin-St Jeor${p.sex === "unspecified" ? " 중간 추정" : ""} + ${detailed ? "24시간 활동별 추정 (PAR·운동 혼합)" : "생활활동 + 순 운동량"}` },
      macros: { protein, carbs, fat },
      context: {
        weightKg: weight, bmi, ffmKg, bodyFatUsable, bodyFatAgeDays, measurementConfidence,
        bodyFatReferenceWeightKg, bodyFatReferenceDate: p.bodyFatDate || null, bodyCompositionInfluence,
        ffmIsDerivedFromEnteredPercent: ffmKg !== null, ffmIsCurrentMeasurement: ffmKg !== null && bodyFatAgeDays === 0 && relativeWeightChange === 0,
        energyAvailability, energyAvailabilityIsDiagnostic: false,
        proteinReferenceKg, proteinBasis: proteinReferenceKg < weight - 0.01 ? "adjusted_starting_reference" : "body_weight",
        trainingYears: years, trainingMinutes, trainingShare, sessionBreakdown, goalDeltaKcal,
        dailyActivity: activity.context, goalPreference, proteinPreference: p.proteinPreference,
        goalEnergyPolicy: "non_training_baseline_offset", activityExcludesTraining: true,
        estimateRangeIsConfidenceInterval: false, macroRangesAreIndependent: false,
        macroRangeBasis: "carbohydrate_range_holds_protein_target_and_varies_fat_20_to_35_percent",
        allocationBounds: { minCarbDeltaG: carbs.min - carbs.target, maxCarbDeltaG: carbs.max - carbs.target, fatGPerCarbG: 4 / 9 },
        weightTrend, guidanceSport, sportLabel: SPORT_LABELS[guidanceSport]
      },
      guidance, sources: SOURCES.map(item => ({ ...item }))
    };
  }

  function adjustAllocation(plan, carbDeltaG) {
    if (!finite(carbDeltaG)) throw new TypeError("carbDeltaG must be finite");
    const copy = JSON.parse(JSON.stringify(plan));
    if (!copy || copy.status !== "ready") return copy;
    const { protein, carbs, fat } = copy.macros;
    const previous = copy.context.allocation;
    const baseCarbsG = finite(previous?.baseCarbsG) ? previous.baseCarbsG : carbs.target;
    const baseFatG = finite(previous?.baseFatG) ? previous.baseFatG : fat.target;
    const minCarbDeltaG = Math.max(carbs.min - baseCarbsG, (baseFatG - fat.max) * 9 / 4);
    const maxCarbDeltaG = Math.min(carbs.max - baseCarbsG, (baseFatG - fat.min) * 9 / 4);
    const appliedCarbDeltaG = clamp(carbDeltaG, minCarbDeltaG, maxCarbDeltaG);
    const appliedFatDeltaG = -appliedCarbDeltaG * 4 / 9;
    carbs.target = baseCarbsG + appliedCarbDeltaG;
    fat.target = baseFatG + appliedFatDeltaG;
    copy.context.allocation = {
      baseCarbsG, baseFatG, requestedCarbDeltaG: carbDeltaG,
      appliedCarbDeltaG, appliedFatDeltaG, minCarbDeltaG, maxCarbDeltaG,
      limited: Math.abs(appliedCarbDeltaG - carbDeltaG) > 1e-8,
      proteinUnchanged: protein.target === plan.macros.protein.target,
      kcalUnchanged: true
    };
    copy.context.allocationBounds = { minCarbDeltaG, maxCarbDeltaG, fatGPerCarbG: 4 / 9 };
    return copy;
  }

  function profileForDay(profile, day = {}) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
    const result = { ...profile };
    if (day?.weightKg != null) result.weightKg = day.weightKg;
    if (day?.bodyFatPct != null) {
      result.bodyFatPct = day.bodyFatPct;
      result.bodyFatDate = day.date;
      result.bodyFatMethod = day.bodyFatMethod;
      result.bodyFatWeightKg = day.weightKg;
    }
    return result;
  }

  return Object.freeze({ VERSION, SOURCES, ENUMS, METS, ACTIVITY_PARS, CARDIO_LIMITS, validateProfile, calculatePlan, adjustAllocation, summarizeWeightTrend, profileForDay });
});
