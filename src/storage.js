(function(root, factory) {
  "use strict";
  const trainingStore = typeof module === "object" && module.exports ? require("./training-store.js") : root.MacroTrainingStore;
  const api = factory(trainingStore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MacroStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(TrainingStore) {
  "use strict";

  const VERSION = 9;
  const STORAGE_KEY = "macro-engine.v9";
  const LEGACY_PREFIX = "runstep_macro_v1_";
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_DAYS = 20000;
  const PROFILE_ENUMS = Object.freeze({
    sex: ["male", "female", "unspecified"],
    bodyFatMethod: ["unknown", "bia", "dxa", "caliper"],
    sport: ["none", "strength", "running", "cycling", "swimming", "team", "mixed"],
    goal: ["lose", "maintain", "gain", "recomp", "performance"],
    activity: ["sedentary", "light", "active", "physical"],
    healthContext: ["general", "pregnancy", "breastfeeding", "clinical", "eating_disorder"],
    proteinPreference: ["lower", "standard", "higher"]
  });
  const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value !== null && typeof value === "object"
    && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

  function fail(message) {
    throw new Error(message);
  }

  function byteLength(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return Buffer.byteLength(text, "utf8");
  }

  function assertSize(text) {
    if (typeof text !== "string" || byteLength(text) > MAX_BYTES) {
      fail("백업 파일은 10MB 이하의 JSON 파일이어야 합니다.");
    }
  }

  // Validate the entire tree before copying, including opaque legacy data.
  function safeClone(value) {
    const seen = new Set();
    let nodes = 0;
    function visit(item, depth) {
      if (++nodes > 500000 || depth > 24) fail("저장 데이터의 구조가 너무 복잡합니다.");
      if (item === null || typeof item === "boolean") return item;
      if (typeof item === "string") {
        if (item.length > MAX_BYTES) fail("저장 데이터의 문자열이 너무 깁니다.");
        return item;
      }
      if (typeof item === "number") {
        if (!Number.isFinite(item)) fail("저장 데이터에 유효하지 않은 숫자가 있습니다.");
        return item;
      }
      if (!Array.isArray(item) && !plain(item)) fail("저장 데이터 형식이 올바르지 않습니다.");
      if (seen.has(item)) fail("순환 참조가 있는 데이터는 저장할 수 없습니다.");
      seen.add(item);
      let result;
      if (Array.isArray(item)) {
        if (item.length > 100000) fail("저장 데이터의 항목이 너무 많습니다.");
        if (Object.keys(item).length !== item.length || Array.from({ length: item.length }, (_, index) => index).some(index => !own(item, index))) fail("저장 데이터 배열에 비어 있는 항목이 있습니다.");
        result = item.map(child => visit(child, depth + 1));
      } else {
        result = {};
        for (const key of Object.keys(item)) {
          if (forbiddenKeys.has(key)) fail("허용하지 않는 데이터 키가 있습니다.");
          result[key] = visit(item[key], depth + 1);
        }
      }
      seen.delete(item);
      return result;
    }
    return visit(value, 0);
  }

  function fields(value, expected, label) {
    if (!plain(value) || Object.keys(value).length !== expected.length
      || expected.some(key => !own(value, key))) fail(`${label}의 필수 항목 또는 형식이 올바르지 않습니다.`);
  }

  function number(value, min, max, label, nullable = false) {
    if (nullable && value === null) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      fail(`${label}의 숫자 범위를 확인해 주세요.`);
    }
  }

  function string(value, max, label, empty = false) {
    if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      fail(`${label}의 문자를 확인해 주세요.`);
    }
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function timestamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && isValidDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
      && new Date(value).toISOString() === value;
  }

  function validateProfile(profile) {
    if (profile === null) return;
    if (plain(profile) && !own(profile, "bodyFatWeightKg")) profile.bodyFatWeightKg = null;
    const profileFields = ["sex", "age", "heightCm", "weightKg", "bodyFatPct", "bodyFatMethod", "bodyFatDate", "bodyFatWeightKg", "trainingYears", "sport", "goal", "activity", "healthContext", "proteinPreference"];
    for (const key of ["activityMode", "dailyActivity", "weekdayActivity", "goalPreference"]) if (own(profile, key)) profileFields.push(key);
    fields(profile, profileFields, "프로필");
    if (own(profile, "activityMode") && !["simple", "detailed"].includes(profile.activityMode)) fail("생활 활동 입력 방식을 확인해 주세요.");
    if (own(profile, "goalPreference") && !["standard", "conservative"].includes(profile.goalPreference)) fail("목표 진행 선호를 확인해 주세요.");
    if (own(profile, "dailyActivity")) validateActivity(profile.dailyActivity);
    if (own(profile, "weekdayActivity")) {
      if (!plain(profile.weekdayActivity) || Object.keys(profile.weekdayActivity).some(key => !/^[0-6]$/.test(key))) fail("요일별 생활 시간을 확인해 주세요.");
      Object.values(profile.weekdayActivity).forEach(validateActivity);
    }
    ["sex", "bodyFatMethod", "sport", "goal", "activity", "healthContext", "proteinPreference"].forEach(key => string(profile[key], 100, `프로필 ${key}`));
    for (const [key, values] of Object.entries(PROFILE_ENUMS)) {
      if (!values.includes(profile[key])) fail(`프로필 ${key} 선택값을 확인해 주세요.`);
    }
    number(profile.age, 1, 120, "나이");
    if (!Number.isInteger(profile.age)) fail("나이는 정수로 입력해 주세요.");
    number(profile.heightCm, 50, 250, "키");
    number(profile.weightKg, 15, 500, "체중");
    number(profile.bodyFatPct, 1, 75, "체지방률", true);
    number(profile.bodyFatWeightKg, 20, 350, "체지방 측정 당시 체중", true);
    if (profile.bodyFatWeightKg !== null && profile.bodyFatPct === null) fail("측정 당시 체중을 남기려면 체지방률도 입력해 주세요.");
    number(profile.trainingYears, 0, 100, "운동 경력", true);
    if (profile.trainingYears !== null && profile.trainingYears > profile.age) fail("운동 경력은 나이를 넘을 수 없습니다.");
    if (profile.bodyFatDate !== null && !isValidDate(profile.bodyFatDate)) fail("체성분 측정일을 확인해 주세요.");
  }

  function validateActivity(activity) {
    if (activity === null) return;
    fields(activity, ["sleepHours", "workHours", "workType", "lifestyleHours", "lifestyleType"], "생활 시간");
    for (const key of ["sleepHours", "workHours", "lifestyleHours"]) number(activity[key], 0, 24, "생활 시간", true);
    if (![null, "seated", "standing", "physical"].includes(activity.workType)
      || ![null, "light", "active"].includes(activity.lifestyleType)) fail("생활 활동 종류를 확인해 주세요.");
  }

  function validateMeal(meal) {
    const mealFields = ["id", "name", "protein", "carbs", "fat", "otherKcal", "alcoholG"];
    if (plain(meal)) for (const key of ["source", "type", "note"]) if (own(meal, key)) mealFields.push(key);
    fields(meal, mealFields, "식사");
    string(meal.id, 128, "식사 식별자");
    string(meal.name, 200, "식사 이름");
    ["protein", "carbs", "fat"].forEach(key => number(meal[key], 0, 10000, "식사 영양소"));
    number(meal.otherKcal, 0, 100000, "기타 칼로리");
    number(meal.alcoholG, 0, 2000, "알코올");
    if (own(meal, "type") && !["breakfast", "lunch", "dinner", "snack", "drinks", "other"].includes(meal.type)) fail("식사 구분을 확인해 주세요.");
    if (own(meal, "note")) string(meal.note, 4000, "식사 메모", true);
    if (own(meal, "source")) {
      fields(meal.source, ["kind", "confidence", "note", "hash"], "식사 출처");
      if (!["manual", "label", "image", "estimate"].includes(meal.source.kind)
        || !["known", "estimated"].includes(meal.source.confidence)
        || (meal.source.kind === "estimate" && meal.source.confidence !== "estimated")) fail("식사 출처와 추정 여부를 확인해 주세요.");
      string(meal.source.note, 4000, "식사 출처 메모", true);
      if (meal.source.hash !== null && (typeof meal.source.hash !== "string" || !/^[a-f0-9]{64}$/.test(meal.source.hash))) fail("식사 출처 해시를 확인해 주세요.");
    }
  }

  function validateSession(session, withId = true) {
    const sessionFields = ["sport", "durationMin", "intensity"];
    if (withId) sessionFields.push("id");
    if (plain(session) && own(session, "cardio")) sessionFields.push("cardio");
    if (plain(session) && own(session, "details")) sessionFields.push("details");
    fields(session, sessionFields, "운동");
    if (withId) string(session.id, 128, "운동 식별자");
    string(session.sport, 100, "운동 종목");
    if (!["strength", "running", "cycling", "swimming", "team", "mixed", "walking"].includes(session.sport)) fail("운동 종목을 확인해 주세요.");
    number(session.durationMin, 1, 1440, "운동 시간");
    if (!["easy", "moderate", "hard"].includes(session.intensity)) fail("운동 강도를 확인해 주세요.");
    if (own(session, "cardio") && session.cardio !== null) {
      fields(session.cardio, ["environment", "speedKmh", "gradePct"], "유산소 상세");
      if (!["walking", "running"].includes(session.sport) || !["treadmill", "outdoor"].includes(session.cardio.environment)) fail("유산소 상세의 종목과 환경을 확인해 주세요.");
      number(session.cardio.speedKmh, 0, 30, "유산소 속도", true);
      number(session.cardio.gradePct, 0, 20, "유산소 경사", true);
    }
    if (own(session, "details") && session.details !== null) validateSessionDetails(session.details, session);
  }

  function validateSessionDetails(details, session) {
    const allowed = ["label", "intent", "format", "distanceM", "movingMin", "effortRpe", "avgHeartRateBpm", "avgPowerW", "routeKey", "equipmentKey", "environment", "conditions", "stroke", "poolLengthM", "notes", "sequenceConfirmed", "segments"];
    fields(details, allowed.filter(key => plain(details) && own(details, key)), "운동 상세");
    for (const key of ["label", "routeKey", "equipmentKey", "stroke"]) if (own(details, key) && details[key] !== null) string(details[key], 200, "운동 상세 이름", true);
    if (own(details, "notes") && details.notes !== null) string(details.notes, 4000, "운동 상세 메모", true);
    const options = {
      intent: ["regular", "deload", "light", "technique", "time-limited", "return", "test"],
      format: ["continuous", "interval", "technique", "practice", "match", "race", "hybrid"],
      environment: ["usual", "outdoor", "treadmill", "indoor", "pool", "open-water", "different"],
      conditions: ["usual", "hot", "cold", "windy", "hilly", "different"]
    };
    for (const [key, values] of Object.entries(options)) if (own(details, key) && details[key] !== null && !values.includes(details[key])) fail("운동 상세 선택값을 확인해 주세요.");
    for (const [key, min, max] of [["distanceM", 0, 1000000], ["movingMin", 0, session.durationMin], ["effortRpe", 1, 10], ["avgHeartRateBpm", 30, 240], ["avgPowerW", 0, 3000], ["poolLengthM", 10, 100]]) {
      if (own(details, key)) number(details[key], min, max, "운동 상세 수치", true);
    }
    if ((finiteDetail(details.avgPowerW) && session.sport !== "cycling") || ((details.stroke || finiteDetail(details.poolLengthM)) && session.sport !== "swimming")) fail("운동 종목에 맞는 상세 지표를 입력해 주세요.");
    if (own(details, "sequenceConfirmed") && typeof details.sequenceConfirmed !== "boolean") fail("복합 구간 순서 확인값을 확인해 주세요.");
    if (own(details, "segments")) {
      if (!Array.isArray(details.segments) || details.segments.length > 64) fail("복합 운동 구간은 64개까지 저장할 수 있습니다.");
      const ids = new Set();
      let minutes = 0;
      for (const segment of details.segments) {
        const optional = ["kind", "durationMin", "distanceM", "reps", "loadKg"];
        fields(segment, ["id", "label", ...optional.filter(key => plain(segment) && own(segment, key))], "복합 운동 구간");
        string(segment.id, 128, "구간 식별자");
        string(segment.label, 200, "구간 이름");
        if (ids.has(segment.id)) fail("복합 운동 구간의 식별자가 중복되었습니다.");
        ids.add(segment.id);
        if (own(segment, "kind") && segment.kind !== null && !["strength", "run", "row", "ski", "carry", "other"].includes(segment.kind)) fail("구간 종류를 확인해 주세요.");
        for (const [key, max] of [["durationMin", session.durationMin], ["distanceM", 1000000], ["reps", 100000], ["loadKg", 2000]]) if (own(segment, key)) number(segment[key], 0, max, "구간 수치", true);
        if (finiteDetail(segment.reps) && !Number.isInteger(segment.reps)) fail("구간 반복은 정수로 입력해 주세요.");
        if (finiteDetail(segment.durationMin)) minutes += segment.durationMin;
      }
      if (minutes > session.durationMin + 0.000001) fail("구간 시간의 합은 전체 운동 시간을 넘을 수 없습니다. 휴식·전환 시간은 전체 시간 안에 포함해 주세요.");
    }
  }

  function finiteDetail(value) { return typeof value === "number" && Number.isFinite(value); }

  function validateSnapshot(plan) {
    if (plan === null) return;
    fields(plan, ["status", "reasons", "version", "energy", "macros", "context", "guidance", "sources"], "저장된 계산 기준");
    if (!["ready", "review", "incomplete"].includes(plan.status)) fail("계산 기준 상태가 올바르지 않습니다.");
    string(plan.version, 200, "계산 기준 버전");
    if (!Array.isArray(plan.reasons) || plan.reasons.length > 100) fail("계산 참고 사항의 형식이 올바르지 않습니다.");
    plan.reasons.forEach(value => string(value, 4000, "계산 참고 사항"));
    fields(plan.energy, ["targetKcal", "tdeeKcal", "restingKcal", "exerciseKcal", "range", "method"], "에너지 계산 기준");
    fields(plan.macros, ["protein", "carbs", "fat"], "영양소 계산 기준");
    const ready = plan.status === "ready";
    for (const key of ["targetKcal", "tdeeKcal", "restingKcal", "exerciseKcal"]) {
      if (ready) number(plan.energy[key], key === "exerciseKcal" ? 0 : 1, 100000, "에너지 계산 기준");
      else if (plan.energy[key] !== null) fail("계산할 수 없는 상태에 에너지 목표가 포함되어 있습니다.");
    }
    if (!Array.isArray(plan.energy.range) || plan.energy.range.length !== 2) fail("에너지 추정 범위를 확인해 주세요.");
    if (ready) {
      plan.energy.range.forEach(value => number(value, 0, 100000, "에너지 추정 범위"));
      if (plan.energy.range[0] > plan.energy.targetKcal || plan.energy.range[1] < plan.energy.targetKcal) fail("에너지 목표와 추정 범위가 일치하지 않습니다.");
      string(plan.energy.method, 1000, "에너지 계산 방법");
    } else if (plan.energy.method !== null || plan.energy.range.some(value => value !== null)) fail("계산할 수 없는 상태의 추정 범위가 올바르지 않습니다.");
    for (const value of Object.values(plan.macros)) {
      fields(value, ["target", "min", "max"], "영양소 범위");
      if (ready) {
        Object.values(value).forEach(item => number(item, 0, 25000, "영양소 범위"));
        if (value.min > value.target || value.target > value.max) fail("영양소 목표와 범위가 일치하지 않습니다.");
      } else if (Object.values(value).some(item => item !== null)) fail("계산할 수 없는 상태에 영양소 목표가 포함되어 있습니다.");
    }
    if (ready) {
      const macroKcal = 4 * (plan.macros.protein.target + plan.macros.carbs.target) + 9 * plan.macros.fat.target;
      if (Math.abs(macroKcal - plan.energy.targetKcal) > 1) fail("저장된 열량과 영양소의 합계가 일치하지 않습니다.");
    }
    if (!plain(plan.context)) fail("계산 맥락의 형식이 올바르지 않습니다.");
    for (const key of ["weightKg", "bmi", "ffmKg", "bodyFatAgeDays", "energyAvailability", "proteinReferenceKg", "trainingYears", "trainingMinutes", "goalDeltaKcal"]) {
      if (own(plan.context, key)) number(plan.context[key], -100000, 100000, "계산 맥락", true);
    }
    if (!Array.isArray(plan.guidance) || plan.guidance.length > 100) fail("계산 조언의 형식이 올바르지 않습니다.");
    plan.guidance.forEach(item => {
      fields(item, ["id", "title", "body"], "계산 조언");
      string(item.id, 100, "조언 식별자");
      string(item.title, 500, "조언 제목");
      string(item.body, 8000, "조언 내용");
    });
    if (!Array.isArray(plan.sources) || plan.sources.length > 100) fail("계산 출처의 형식이 올바르지 않습니다.");
    plan.sources.forEach(item => {
      fields(item, ["label", "url"], "계산 출처");
      string(item.label, 500, "출처 제목");
      string(item.url, 2000, "출처 주소");
      let url;
      try { url = new URL(item.url); } catch (_error) { fail("출처 주소를 확인해 주세요."); }
      if (url.protocol !== "https:" || url.username || url.password) fail("출처는 안전한 HTTPS 주소여야 합니다.");
    });
    if (byteLength(JSON.stringify(plan)) > 65536) fail("저장된 계산 기준이 너무 큽니다.");
  }

  function validateDay(day, key, allIds) {
    if (!plain(day)) fail("하루 기록의 형식이 올바르지 않습니다.");
    if (!own(day, "bodyFatPct")) day.bodyFatPct = null;
    if (!own(day, "skeletalMuscleKg")) day.skeletalMuscleKg = null;
    if (!own(day, "bodyFatMethod")) day.bodyFatMethod = "unknown";
    if (!own(day, "carbAdjustmentG")) day.carbAdjustmentG = 0;
    const dayFields = ["date", "weightKg", "bodyFatPct", "skeletalMuscleKg", "bodyFatMethod", "carbAdjustmentG", "meals", "sessions", "complete", "planSnapshot"];
    if (own(day, "coachCheckin")) dayFields.push("coachCheckin");
    for (const key of ["note", "dailyActivity"]) if (own(day, key)) dayFields.push(key);
    fields(day, dayFields, "하루 기록");
    if (own(day, "note")) string(day.note, 8000, "하루 메모", true);
    if (own(day, "dailyActivity")) validateActivity(day.dailyActivity);
    if (own(day, "coachCheckin") && day.coachCheckin !== null) {
      const checkinFields = ["energy", "hunger", "sleep"];
      if (plain(day.coachCheckin)) {
        for (const name of ["trainingPlan", "mealConstraint", "performance", "illness", "pain", "fatigue", "sleepHours", "interruptionReason"]) {
          if (own(day.coachCheckin, name)) checkinFields.push(name);
        }
      }
      fields(day.coachCheckin, checkinFields, "코치 체크인");
      const checkinOptions = {
        energy: ["low", "okay", "good"], hunger: ["low", "okay", "high"], sleep: ["poor", "okay", "good"],
        trainingPlan: ["rest", "planned"], mealConstraint: ["none", "busy", "low-appetite", "digestive"], performance: ["down", "steady", "up"],
        illness: ["none", "active", "recovering"], pain: ["none", "mild", "stop"], fatigue: ["low", "usual", "high"],
        interruptionReason: ["travel", "illness", "schedule", "planned-break", "other"]
      };
      for (const [name, options] of Object.entries(checkinOptions)) {
        if (own(day.coachCheckin, name) && day.coachCheckin[name] !== null && !options.includes(day.coachCheckin[name])) fail("코치 체크인의 선택값을 확인해 주세요.");
      }
      if (own(day.coachCheckin, "sleepHours")) number(day.coachCheckin.sleepHours, 0, 24, "실제 수면시간", true);
    }
    if (!isValidDate(key) || day.date !== key) fail("기록 날짜와 저장 위치가 일치하지 않습니다.");
    number(day.weightKg, 15, 500, "기록 체중", true);
    number(day.bodyFatPct, 1, 75, "기록 체지방률", true);
    number(day.skeletalMuscleKg, 0.5, 200, "기록 골격근량", true);
    number(day.carbAdjustmentG, -500, 500, "탄수화물 배분 조정량");
    if (!["unknown", "bia", "dxa", "caliper"].includes(day.bodyFatMethod)) fail("체성분 측정 방법을 확인해 주세요.");
    if ((day.bodyFatPct !== null || day.skeletalMuscleKg !== null) && day.weightKg === null) fail("체성분을 기록할 때는 같은 날의 체중도 입력해 주세요.");
    const leanMass = day.weightKg === null ? null : day.weightKg * (1 - (day.bodyFatPct || 0) / 100);
    if (day.skeletalMuscleKg !== null && day.skeletalMuscleKg > leanMass) fail("골격근량이 제지방량 또는 체중보다 큽니다. 측정값을 확인해 주세요.");
    if (typeof day.complete !== "boolean") fail("기록 완료 상태를 확인해 주세요.");
    if (!Array.isArray(day.meals) || day.meals.length > 200) fail("하루 식사는 200개까지 저장할 수 있습니다.");
    if (!Array.isArray(day.sessions) || day.sessions.length > 64) fail("하루 운동은 64개까지 저장할 수 있습니다.");
    const checkId = id => {
      string(id, 128, "기록 식별자");
      if (allIds.has(id)) fail("중복된 식사 또는 운동 식별자가 있습니다.");
      allIds.add(id);
    };
    day.meals.forEach(meal => {
      validateMeal(meal);
      checkId(meal.id);
    });
    day.sessions.forEach(session => {
      validateSession(session);
      checkId(session.id);
    });
    if (day.sessions.reduce((sum, item) => sum + item.durationMin, 0) > 1440) fail("하루 운동 시간은 24시간을 넘을 수 없습니다.");
    validateSnapshot(day.planSnapshot);
    if (day.complete && (!day.meals.length || !day.planSnapshot)) fail("식사와 계산 기준이 있어야 기록을 완료할 수 있습니다.");
    if (day.complete && !day.meals.some(meal => meal.protein + meal.carbs + meal.fat + meal.otherKcal + meal.alcoholG > 0)) fail("영양 섭취량이 있어야 기록을 완료할 수 있습니다.");
  }

  function validateState(raw) {
    const state = safeClone(raw);
    const stateFields = ["version", "profile", "days", "legacy", "updatedAt"];
    if (own(state, "training")) stateFields.push("training");
    if (own(state, "mealTemplates")) stateFields.push("mealTemplates");
    if (own(state, "sessionPresets")) stateFields.push("sessionPresets");
    if (own(state, "trackingScope")) stateFields.push("trackingScope");
    fields(state, stateFields, "저장 파일");
    if (state.version !== VERSION) fail("지원하지 않는 저장 파일 버전입니다.");
    if (own(state, "trackingScope") && !["auto", "nutrition", "training", "both"].includes(state.trackingScope)) fail("기록 활용 범위를 확인해 주세요.");
    validateProfile(state.profile);
    if (!plain(state.days) || Object.keys(state.days).length > MAX_DAYS) fail("날짜별 기록의 형식 또는 개수를 확인해 주세요.");
    const ids = new Set();
    Object.entries(state.days).forEach(([key, value]) => validateDay(value, key, ids));
    if (own(state, "mealTemplates")) {
      if (!Array.isArray(state.mealTemplates) || state.mealTemplates.length > 100) fail("저장한 식사는 100개까지 보관할 수 있습니다.");
      const templateIds = new Set();
      state.mealTemplates.forEach(template => {
        fields(template, ["id", "title", "meal"], "저장한 식사");
        string(template.id, 128, "저장한 식사 식별자");
        string(template.title, 200, "저장한 식사 이름");
        if (templateIds.has(template.id)) fail("저장한 식사 식별자가 중복되었습니다.");
        templateIds.add(template.id);
        validateMeal(template.meal);
      });
    }
    if (own(state, "sessionPresets")) {
      if (!Array.isArray(state.sessionPresets) || state.sessionPresets.length > 100) fail("저장한 운동 설정은 100개까지 보관할 수 있습니다.");
      const presetIds = new Set();
      state.sessionPresets.forEach(preset => {
        fields(preset, ["id", "title", "session"], "저장한 운동 설정");
        string(preset.id, 128, "저장한 운동 설정 식별자");
        string(preset.title, 200, "저장한 운동 설정 이름");
        if (presetIds.has(preset.id)) fail("저장한 운동 설정 식별자가 중복되었습니다.");
        presetIds.add(preset.id);
        validateSession(preset.session, false);
      });
    }
    if (state.legacy !== null) {
      fields(state.legacy, ["format", "importedAt", "raw", "records"], "이전 기록 보관함");
      string(state.legacy.format, 100, "이전 기록 형식");
      if (!timestamp(state.legacy.importedAt) || !plain(state.legacy.raw) || !Array.isArray(state.legacy.records)) fail("이전 기록 보관함이 손상되었습니다.");
      if (state.legacy.records.length > MAX_DAYS) fail("이전 기록이 너무 많습니다.");
      state.legacy.records.forEach(record => {
        fields(record, ["date", "weightKg", "score", "scoringVersion", "target", "intake", "mealCount", "completion", "readOnly"], "이전 기록 요약");
        if (!isValidDate(record.date) || record.readOnly !== true) fail("이전 기록의 날짜 또는 읽기 전용 상태가 올바르지 않습니다.");
        number(record.weightKg, 0, 500, "이전 체중", true);
        number(record.score, 0, 100, "이전 점수", true);
        if (record.scoringVersion !== null) string(record.scoringVersion, 300, "이전 점수 버전", true);
        number(record.mealCount, 0, 100000, "이전 식사 수");
        if (!Number.isInteger(record.mealCount) || !["stored-complete", "unconfirmed"].includes(record.completion)) fail("이전 기록 상태를 확인해 주세요.");
        if (record.target !== null) {
          fields(record.target, ["kcal", "protein", "carbs", "fat"], "이전 목표");
          Object.values(record.target).forEach(value => number(value, 0, 1000000, "이전 목표", true));
        }
        if (record.intake !== null) {
          fields(record.intake, ["protein", "carbs", "fat", "alcoholKcal", "otherKcal", "kcal"], "이전 섭취량");
          Object.values(record.intake).forEach(value => number(value, 0, 1e12, "이전 섭취량"));
        }
      });
    }
    if (!timestamp(state.updatedAt)) fail("저장 시각의 형식이 올바르지 않습니다.");
    if (own(state, "training")) {
      if (!TrainingStore || typeof TrainingStore.validate !== "function") fail("훈련 저장 모듈을 불러오지 못했습니다. 기존 데이터는 변경하지 않았어요.");
      state.training = TrainingStore.validate(state.training);
    }
    assertSize(JSON.stringify(state));
    return state;
  }

  function createEmpty() {
    return { version: VERSION, profile: null, days: {}, legacy: null, trackingScope: "auto", updatedAt: new Date().toISOString() };
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    if (typeof localStorage !== "undefined") return localStorage;
    fail("브라우저 저장소를 사용할 수 없습니다.");
  }

  function parseJson(text) {
    assertSize(text);
    try {
      return safeClone(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError) fail("JSON 파일을 읽을 수 없습니다. 원본 파일은 변경하지 않았습니다.");
      throw error;
    }
  }

  function detectLegacy(storage) {
    const target = resolveStorage(storage);
    const entries = {};
    let size = 0;
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (typeof key !== "string" || !key.startsWith(LEGACY_PREFIX)) continue;
      const value = target.getItem(key);
      if (typeof value !== "string") continue;
      size += byteLength(key) + byteLength(value);
      if (size > MAX_BYTES / 2) fail("이전 브라우저 데이터가 커서 자동으로 읽지 않았습니다. 기존 앱에서 백업해 주세요.");
      entries[key] = value;
    }
    return Object.keys(entries).length ? { kind: "legacy-local-storage", entries } : null;
  }

  function load(storage) {
    const warnings = [];
    let target;
    let text;
    try {
      target = resolveStorage(storage);
      text = target.getItem(STORAGE_KEY);
    } catch (_error) {
      return { state: createEmpty(), warnings: ["브라우저 저장소를 읽을 수 없습니다. 입력을 저장할 수 없는 상태입니다."], legacyAvailable: false, storageBlocked: true };
    }
    let legacyAvailable = false;
    try { legacyAvailable = detectLegacy(target) !== null; }
    catch (error) { warnings.push(error.message); }
    if (text === null) return { state: createEmpty(), warnings, legacyAvailable, storageBlocked: false };
    try {
      return { state: validateState(parseJson(text)), warnings, legacyAvailable, storageBlocked: false };
    } catch (error) {
      warnings.unshift(`저장 데이터를 읽을 수 없어 쓰기를 중단했습니다. 원본은 그대로 보존했습니다. ${error.message}`);
      return { state: createEmpty(), warnings, legacyAvailable, storageBlocked: true, corruptedRaw: text };
    }
  }

  function save(raw, storage) {
    const state = validateState({ ...raw, updatedAt: new Date().toISOString() });
    const text = JSON.stringify(state);
    const target = resolveStorage(storage);
    // One setItem is atomic. A second backup key would introduce a partial-write boundary.
    try { target.setItem(STORAGE_KEY, text); }
    catch (_error) { fail("브라우저에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 기존 저장 데이터는 유지됩니다."); }
    return state;
  }

  function legacySource(raw) {
    if (!plain(raw)) fail("지원하지 않는 이전 백업 형식입니다.");
    if (raw.kind === "legacy-local-storage" && plain(raw.entries)) {
      const recordsText = raw.entries[`${LEGACY_PREFIX}records`];
      let records = [];
      if (typeof recordsText === "string") {
        try { records = parseJson(recordsText); }
        catch (_error) { records = []; }
      }
      return { format: "legacy-local-storage", records: Array.isArray(records) ? records : [] };
    }
    if (raw.app === "macro-engine" && raw.kind === "full-backup"
      && [1, 2].includes(raw.backupVersion) && plain(raw.data) && Array.isArray(raw.data.records)) {
      return { format: `legacy-full-v${raw.backupVersion}`, records: raw.data.records };
    }
    if ([1, 2, 3, 4].includes(raw.version) && Array.isArray(raw.records)) {
      return { format: `legacy-records-v${raw.version}`, records: raw.records };
    }
    fail("지원하지 않는 이전 백업 형식입니다.");
  }

  function legacyNumber(value, max = 1000000) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  }

  function legacySummaryRecord(record) {
    if (!plain(record) || !isValidDate(record.date)) return null;
    const meals = Array.isArray(record.meals) ? record.meals : [];
    let intake = null;
    if (meals.length && meals.every(meal => plain(meal)
      && ["protein", "carbs", "fat"].every(key => legacyNumber(meal[key]) !== null)
      && ["alcoholKcal", "otherKcal"].every(key => !own(meal, key) || legacyNumber(meal[key]) !== null))) {
      intake = { protein: 0, carbs: 0, fat: 0, alcoholKcal: 0, otherKcal: 0, kcal: 0 };
      for (const meal of meals) {
        for (const key of ["protein", "carbs", "fat", "alcoholKcal", "otherKcal"]) intake[key] += legacyNumber(meal[key]) || 0;
      }
      intake.kcal = 4 * (intake.protein + intake.carbs) + 9 * intake.fat + intake.alcoholKcal + intake.otherKcal;
    }
    const snapshot = plain(record.goalSnapshot) ? record.goalSnapshot : null;
    return {
      date: record.date,
      weightKg: legacyNumber(record.weight, 500),
      score: legacyNumber(record.adherencePercent, 100),
      scoringVersion: typeof record.adherenceScoringVersion === "string" ? record.adherenceScoringVersion : null,
      target: snapshot ? { kcal: legacyNumber(snapshot.targetCal), protein: legacyNumber(snapshot.protein), carbs: legacyNumber(snapshot.carbs), fat: legacyNumber(snapshot.fat) } : null,
      intake,
      mealCount: meals.length,
      completion: record.recordLifecycle === "completed" ? "stored-complete" : "unconfirmed",
      readOnly: true
    };
  }

  function importLegacy(raw) {
    const preserved = typeof raw === "string" ? parseJson(raw) : safeClone(raw);
    assertSize(JSON.stringify(preserved));
    const source = legacySource(preserved);
    if (source.records.length > MAX_DAYS) fail("이전 기록이 너무 많습니다.");
    const state = createEmpty();
    state.legacy = {
      format: source.format,
      importedAt: new Date().toISOString(),
      raw: preserved,
      records: source.records.map(legacySummaryRecord).filter(Boolean)
    };
    return validateState(state);
  }

  function summary(state) {
    const days = Object.values(state.days);
    const result = {
      days: days.length,
      meals: days.reduce((sum, day) => sum + day.meals.length, 0),
      sessions: days.reduce((sum, day) => sum + day.sessions.length, 0),
      completedDays: days.filter(day => day.complete).length,
      legacyDays: state.legacy?.records.length || 0,
      hasProfile: state.profile !== null
    };
    if (own(state, "training")) {
      result.trainingRecords = state.training.records.length;
      result.trainingMappings = state.training.mappings.length;
      result.coachMessages = state.training.messages.length;
    }
    if (own(state, "sessionPresets")) result.sessionPresets = state.sessionPresets.length;
    return result;
  }

  function parseBackup(text) {
    const raw = parseJson(text);
    const current = plain(raw) && raw.version === VERSION;
    const state = current ? validateState(raw) : importLegacy(raw);
    return {
      state,
      kind: current ? "current" : "legacy",
      summary: summary(state),
      warnings: current ? [] : ["이전 기록은 읽기 전용 보관함에 보존됩니다. 새 계산이나 완료 기록으로 바꾸지 않습니다."]
    };
  }

  function exportBackup(raw) {
    const text = JSON.stringify(validateState(raw));
    assertSize(text);
    return text;
  }

  function sameData(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => own(b, key) && sameData(a[key], b[key]));
  }

  function previewMerge(current, incoming) {
    const before = validateState(current), source = validateState(incoming);
    const owners = new Map();
    Object.values(before.days).forEach(day => [...day.meals, ...day.sessions].forEach(item => owners.set(item.id, day.date)));
    const rows = Object.values(source.days).sort((a, b) => a.date.localeCompare(b.date)).map(day => {
      const existing = before.days[day.date];
      const collision = [...day.meals, ...day.sessions].some(item => owners.has(item.id) && owners.get(item.id) !== day.date);
      const status = existing && sameData(existing, day) ? "identical" : existing?.complete ? "protected" : collision ? "id-conflict" : existing ? "conflict" : "added";
      return { date: day.date, status, current: existing || null, incoming: day };
    });
    const templates = (source.mealTemplates || []).map(incoming => {
      const current = (before.mealTemplates || []).find(item => item.id === incoming.id);
      return { id: incoming.id, title: incoming.title, status: !current ? "added" : sameData(current, incoming) ? "identical" : "conflict" };
    });
    const presets = (source.sessionPresets || []).map(incoming => {
      const current = (before.sessionPresets || []).find(item => item.id === incoming.id);
      return { id: incoming.id, title: incoming.title, status: !current ? "added" : sameData(current, incoming) ? "identical" : "conflict" };
    });
    return { rows, templates, presets, counts: Object.fromEntries(["added", "identical", "conflict", "protected", "id-conflict"].map(status => [status, rows.filter(row => row.status === status).length])) };
  }

  function mergeBackup(current, incoming, replaceDates = []) {
    const next = validateState(current), source = validateState(incoming);
    if (!Array.isArray(replaceDates) || replaceDates.some(date => !isValidDate(date)) || new Set(replaceDates).size !== replaceDates.length) fail("교체할 날짜 선택을 확인해 주세요.");
    const preview = previewMerge(next, source);
    for (const date of replaceDates) if (!preview.rows.some(row => row.date === date && row.status === "conflict")) fail("완료한 날짜나 충돌이 없는 날짜는 교체할 수 없습니다.");
    for (const row of preview.rows) {
      if (row.status === "added" || (row.status === "conflict" && replaceDates.includes(row.date))) next.days[row.date] = row.incoming;
    }
    for (const template of preview.templates.filter(item => item.status === "added")) {
      next.mealTemplates ||= [];
      next.mealTemplates.push(source.mealTemplates.find(item => item.id === template.id));
    }
    for (const preset of preview.presets.filter(item => item.status === "added")) {
      next.sessionPresets ||= [];
      next.sessionPresets.push(source.sessionPresets.find(item => item.id === preset.id));
    }
    // Dietary merging deliberately does not replace profiles, training, or the legacy archive.
    return validateState(next);
  }

  return Object.freeze({ VERSION, STORAGE_KEY, MAX_BYTES, createEmpty, load, save, parseBackup, exportBackup, detectLegacy, importLegacy, validateState, isValidDate, previewMerge, mergeBackup });
});
