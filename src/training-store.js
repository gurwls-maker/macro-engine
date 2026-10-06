(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MacroTrainingStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  const VERSION = 1;
  const MAX_BYTES = 8 * 1024 * 1024;
  const LIMITS = Object.freeze({ records: 10000, exercises: 200, sets: 200, mappings: 5000, messages: 2000 });
  const LOAD_CONVENTIONS = Object.freeze(["as-recorded", "per-side", "total", "bodyweight"]);
  const TRAINING_INTENTS = Object.freeze(["regular", "deload", "light", "technique", "time-limited", "return", "test"]);
  const FEEDBACK_FEELINGS = Object.freeze(["comfortable", "hard", "limit"]);
  const COACHING_ANSWER_TOPICS = Object.freeze(["load-change", "rep-target"]);
  const COACHING_ANSWERS = Object.freeze(["planned", "unexpected"]);
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const fail = message => { throw new Error(message); };
  const bytes = text => typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text).length : Buffer.byteLength(text, "utf8");

  function clone(value) {
    const ancestors = new Set();
    let nodes = 0;
    function visit(item, depth) {
      if (++nodes > 500000 || depth > 24) fail("운동 데이터 구조가 너무 복잡합니다.");
      if (item === null || typeof item === "boolean") return item;
      if (typeof item === "number") {
        if (!Number.isFinite(item)) fail("운동 데이터에 유효하지 않은 숫자가 있습니다.");
        return item;
      }
      if (typeof item === "string") {
        if (item.length > MAX_BYTES) fail("운동 데이터 문자열이 너무 깁니다.");
        return item;
      }
      if (!Array.isArray(item) && !plain(item)) fail("운동 데이터 형식이 올바르지 않습니다.");
      if (ancestors.has(item)) fail("순환 참조는 저장할 수 없습니다.");
      if (Object.getOwnPropertySymbols(item).length) fail("허용하지 않는 운동 데이터 키입니다.");
      ancestors.add(item);
      const result = Array.isArray(item) ? [] : {};
      const keys = Object.keys(item);
      if (Array.isArray(item) && (item.length > 100000 || keys.length !== item.length
        || keys.some((key, index) => key !== String(index)))) fail("운동 데이터 배열에 비어 있거나 허용하지 않는 항목이 있습니다.");
      for (const key of keys) {
        if (forbidden.has(key)) fail("허용하지 않는 운동 데이터 키입니다.");
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, "value")) fail("계산된 속성은 운동 데이터로 사용할 수 없습니다.");
        result[key] = visit(descriptor.value, depth + 1);
      }
      ancestors.delete(item);
      return result;
    }
    const result = visit(value, 0);
    if (bytes(JSON.stringify(result)) > MAX_BYTES) fail("운동 데이터는 8MB 이하여야 합니다.");
    return result;
  }

  function fields(value, names, label, optional = []) {
    if (!plain(value) || names.some(key => !own(value, key)) || Object.keys(value).some(key => !names.includes(key) && !optional.includes(key))) fail(`${label}의 필수 항목 또는 형식이 올바르지 않습니다.`);
  }
  function text(value, max, label, nullable = false, empty = false) {
    if (nullable && value === null) return;
    if (typeof value !== "string" || value.length > max || (!empty && !value.trim())
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${label}의 문자를 확인해 주세요.`);
  }
  function number(value, min, max, label, nullable = false, integer = false) {
    if (nullable && value === null) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max
      || (integer && !Number.isInteger(value))) fail(`${label}의 숫자 범위를 확인해 주세요.`);
  }
  function list(value, max, label) {
    if (!Array.isArray(value) || value.length > max) fail(`${label}의 항목 수 또는 형식을 확인해 주세요.`);
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    return year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1
      && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
  function time(value) { return value === null || (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)); }
  function iso(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
      && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
      && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
  }
  function uniqueId(value, ids, label) {
    text(value, 512, label);
    if (ids.has(value)) fail(`${label}가 중복되었습니다.`);
    ids.add(value);
  }
  function strings(values, max, size, label) {
    list(values, max, label);
    values.forEach(value => text(value, size, label));
  }
  function validateCoachingAnswer(exercise) {
    const answer = exercise.coachingAnswer;
    fields(answer, ["topic", "answer", "sets"], "조언 확인 답변");
    if (!COACHING_ANSWER_TOPICS.includes(answer.topic) || !COACHING_ANSWERS.includes(answer.answer)) fail("조언 확인 질문과 답변을 확인해 주세요.");
    list(answer.sets, LIMITS.sets, "답변 당시 세트");
    const ids = new Set();
    for (const set of answer.sets) {
      fields(set, ["id", "loadKg", "reps", "marker"], "답변 당시 세트");
      uniqueId(set.id, ids, "답변 당시 세트 식별자");
      number(set.loadKg, 0, 10000, "답변 당시 원문 부하", true);
      number(set.reps, 0, 100000, "답변 당시 반복 수", true, true);
      text(set.marker, 32, "답변 당시 원문 세트 표기", true);
    }
    if (!Array.isArray(exercise.sets) || answer.sets.length !== exercise.sets.length || answer.sets.some((set, index) => {
      const current = exercise.sets[index];
      return !current || set.id !== current.id || set.loadKg !== current.loadKg || set.reps !== current.reps || set.marker !== current.marker;
    })) fail("답변 당시 세트 구성·중량·반복이 달라졌어요. 현재 운동에 다시 답해 주세요.");
  }
  function createCoachingAnswer(exercise, topic, answer) {
    const current = clone(exercise);
    if (!plain(current) || !Array.isArray(current.sets)) fail("답변할 운동의 실제 세트를 확인해 주세요.");
    const result = { topic, answer, sets: current.sets.map(set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps, marker: set.marker })) };
    validateCoachingAnswer({ sets: current.sets, coachingAnswer: result });
    return result;
  }
  function coachingAnswerMatches(exercise) {
    try {
      const current = clone(exercise);
      if (!plain(current) || !own(current, "coachingAnswer")) return false;
      validateCoachingAnswer(current);
      return true;
    } catch { return false; }
  }
  function validateRecords(records) {
    list(records, LIMITS.records, "운동 기록");
    const recordIds = new Set();
    for (const record of records) {
      fields(record, ["id", "date", "time", "label", "durationMinutes", "reportedSetCount", "reportedVolumeKg", "reportedEnergyKcal", "source", "exercises", "notes", "effort", "pain"], "운동 기록", ["sequence", "trainingIntent"]);
      uniqueId(record.id, recordIds, "운동 기록 식별자");
      if (!date(record.date) || !time(record.time)) fail("운동 날짜 또는 헤더 시각을 확인해 주세요.");
      text(record.label, 200, "운동 분류");
      number(record.durationMinutes, 0, 1440, "운동 시간", true);
      number(record.reportedSetCount, 0, 100000, "원문 세트 수", true, true);
      number(record.reportedVolumeKg, 0, 1e9, "원문 볼륨", true);
      number(record.reportedEnergyKcal, 0, 100000, "원문 에너지", true);
      text(record.notes, 10000, "운동 메모", false, true);
      number(record.effort, 0, 10, "체감 강도", true);
      if (record.pain !== null && !["none", "mild", "stop"].includes(record.pain)) fail("통증 선택값을 확인해 주세요.");
      if (own(record, "trainingIntent") && !TRAINING_INTENTS.includes(record.trainingIntent)) fail("운동 의도를 확인해 주세요. 미확인은 선택하지 않은 상태로 남겨 주세요.");
      if (own(record, "sequence")) {
        fields(record.sequence, ["order", "structure"], "실제 수행 순서");
        if (!["unknown", "listed"].includes(record.sequence.order) || !["unknown", "straight", "grouped"].includes(record.sequence.structure)) fail("실제 수행 순서와 세트 구성을 확인해 주세요.");
      }
      fields(record.source, ["kind", "hash", "paths", "uncertainties", "revision"], "운동 출처");
      if (!["visual", "legacy-ocr", "manual"].includes(record.source.kind)) fail("운동 출처 종류를 확인해 주세요.");
      if (record.source.hash !== null && (typeof record.source.hash !== "string" || !/^[a-f0-9]{64}$/.test(record.source.hash))) fail("운동 출처 해시를 확인해 주세요.");
      if (record.source.kind !== "manual" && record.source.hash === null) fail("이미지 운동 기록에는 출처 해시가 필요합니다.");
      strings(record.source.paths, 100, 2048, "운동 출처 경로");
      strings(record.source.uncertainties, 200, 4000, "운동 출처 불확실성");
      text(record.source.revision, 256, "운동 출처 수정본", true);
      list(record.exercises, LIMITS.exercises, "종목");
      const exerciseIds = new Set();
      const setIds = new Set();
      for (const exercise of record.exercises) {
        fields(exercise, ["id", "rawName", "exerciseId", "equipmentKey", "loadConvention", "durationMinutes", "repsTotal", "reportedVolumeKg", "sets", "notes"], "종목", ["loadRole", "groupKey", "feedback", "coachingAnswer"]);
        uniqueId(exercise.id, exerciseIds, "종목 식별자");
        text(exercise.rawName, 300, "원문 종목명");
        text(exercise.exerciseId, 128, "연결 종목", true);
        text(exercise.equipmentKey, 128, "장비 식별자", true);
        if (!LOAD_CONVENTIONS.includes(exercise.loadConvention)) fail("부하 표기 기준을 확인해 주세요.");
        if (own(exercise, "loadRole") && !["unknown", "external", "assistance"].includes(exercise.loadRole)) fail("중량이 저항인지 보조인지 확인해 주세요.");
        if (own(exercise, "groupKey")) {
          text(exercise.groupKey, 128, "묶어서 수행한 블록", true);
          if (exercise.groupKey !== null && !exercise.groupKey.trim()) fail("묶어서 수행한 블록 이름을 확인해 주세요.");
        }
        number(exercise.durationMinutes, 0, 1440, "종목 시간", true);
        number(exercise.repsTotal, 0, 100000, "원문 반복 수", true, true);
        number(exercise.reportedVolumeKg, 0, 1e9, "종목 원문 볼륨", true);
        text(exercise.notes, 4000, "종목 메모", false, true);
        list(exercise.sets, LIMITS.sets, "세트");
        for (const set of exercise.sets) {
          fields(set, ["id", "loadKg", "reps", "marker", "rir"], "세트");
          uniqueId(set.id, setIds, "세트 식별자");
          number(set.loadKg, 0, 10000, "원문 부하", true);
          number(set.reps, 0, 100000, "반복 수", true, true);
          text(set.marker, 32, "원문 세트 표기", true);
          number(set.rir, 0, 10, "남길 수 있었던 반복 수", true);
        }
        if (own(exercise, "feedback")) {
          const feedback = exercise.feedback;
          fields(feedback, ["setId", "feeling", "loadKg", "reps"], "선택한 세트의 체감");
          text(feedback.setId, 512, "체감을 기록한 세트");
          if (!FEEDBACK_FEELINGS.includes(feedback.feeling)) fail("선택한 세트의 체감을 확인해 주세요.");
          number(feedback.loadKg, 0, 10000, "체감을 기록한 원문 부하", true);
          number(feedback.reps, 0, 100000, "체감을 기록한 반복 수", true, true);
          const selected = exercise.sets.find(set => set.id === feedback.setId);
          if (!selected || selected.marker !== null || selected.loadKg !== feedback.loadKg || selected.reps !== feedback.reps) fail("체감을 기록한 일반 세트의 중량·반복이 달라졌어요. 현재 세트를 다시 확인해 주세요.");
        }
        if (own(exercise, "coachingAnswer")) validateCoachingAnswer(exercise);
      }
    }
    return records;
  }

  function emptyPlanning() {
    return { activeProgramId: null, programs: [], schedule: [], preferences: { preferredExerciseIds: [], excludedExerciseIds: [] } };
  }
  function emptyReviewPreferences() { return { order: "priority", mainExerciseKeys: [] }; }
  function validateReviewPreferences(preferences) {
    fields(preferences, ["order", "mainExerciseKeys"], "운동 분석 표시 설정");
    if (!["priority", "diary"].includes(preferences.order)) fail("운동 분석의 표시 순서를 확인해 주세요.");
    strings(preferences.mainExerciseKeys, 500, 6000, "메인 운동");
    const normalize = value => value.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");
    for (const key of preferences.mainExerciseKeys) {
      const exercise = key.startsWith("exercise:") && key.length > 9 && key.length <= 137 && key.slice(9).trim() === key.slice(9);
      const raw = key.startsWith("raw:") && key.length > 4 && normalize(key.slice(4)) === key.slice(4);
      if ((!exercise && !raw) || /[\u0000-\u001f]/.test(key)) fail("메인 운동의 식별 기준을 확인해 주세요.");
    }
    if (new Set(preferences.mainExerciseKeys).size !== preferences.mainExerciseKeys.length) fail("메인 운동이 중복되었습니다.");
  }
  function validatePrescription(day) {
    fields(day, ["id", "label", "exercises"], "계획 세션");
    text(day.id, 512, "계획 세션 ID"); text(day.label, 200, "계획 세션 이름");
    list(day.exercises, 30, "계획 운동");
    if (!day.exercises.length) fail("계획에는 운동이 하나 이상 필요합니다.");
    const ids = new Set();
    for (const exercise of day.exercises) {
      fields(exercise, ["id", "exerciseId", "label", "sets", "repsMin", "repsMax", "rir", "restSeconds", "loadKg", "equipmentKey", "loadConvention"], "계획 운동");
      uniqueId(exercise.id, ids, "계획 운동 ID"); text(exercise.exerciseId, 128, "계획 종목"); text(exercise.label, 300, "계획 종목 이름");
      number(exercise.sets, 1, 20, "계획 세트", false, true);
      number(exercise.repsMin, 1, 100, "계획 최소 반복", false, true); number(exercise.repsMax, exercise.repsMin, 100, "계획 최대 반복", false, true);
      number(exercise.rir, 0, 10, "계획 RIR"); number(exercise.restSeconds, 0, 1800, "계획 휴식", false, true);
      number(exercise.loadKg, 0, 10000, "선택한 계획 중량", true); text(exercise.equipmentKey, 128, "계획 장비", true);
      if (!LOAD_CONVENTIONS.includes(exercise.loadConvention)) fail("계획 중량 기준을 확인해 주세요.");
    }
    return day;
  }
  function validatePlanning(planning, records) {
    fields(planning, ["activeProgramId", "programs", "schedule", "preferences"], "훈련 계획");
    text(planning.activeProgramId, 512, "선택한 프로그램", true);
    list(planning.programs, 200, "저장 프로그램"); list(planning.schedule, 10000, "배치한 운동");
    fields(planning.preferences, ["preferredExerciseIds", "excludedExerciseIds"], "운동 선호");
    for (const key of ["preferredExerciseIds", "excludedExerciseIds"]) {
      strings(planning.preferences[key], 500, 128, "운동 선호");
      if (new Set(planning.preferences[key]).size !== planning.preferences[key].length) fail("운동 선호가 중복되었습니다.");
    }
    if (planning.preferences.preferredExerciseIds.some(id => planning.preferences.excludedExerciseIds.includes(id))) fail("선호 운동과 제외 운동이 겹칩니다.");
    const ids = new Set();
    for (const program of planning.programs) {
      fields(program, ["id", "name", "createdAt", "source", "days"], "저장 프로그램");
      uniqueId(program.id, ids, "프로그램 ID"); text(program.name, 200, "프로그램 이름");
      if (!iso(program.createdAt) || !["template", "user", "coach"].includes(program.source)) fail("프로그램 작성 시각 또는 출처를 확인해 주세요.");
      list(program.days, 7, "프로그램 세션"); if (!program.days.length) fail("프로그램 세션이 필요합니다.");
      const dayIds = new Set();
      for (const day of program.days) { validatePrescription(day); uniqueId(day.id, dayIds, "프로그램 세션 ID"); }
    }
    if (planning.activeProgramId !== null && !ids.has(planning.activeProgramId)) fail("선택한 프로그램을 찾을 수 없습니다.");
    const assignmentIds = new Set(), linked = new Set();
    for (const row of planning.schedule) {
      fields(row, ["id", "date", "programId", "dayId", "prescription", "recordId", "status", "adjustment"], "배치한 운동");
      uniqueId(row.id, assignmentIds, "배치 ID");
      if (!date(row.date) || !ids.has(row.programId)) fail("배치 날짜 또는 프로그램을 확인해 주세요.");
      text(row.dayId, 512, "배치 세션 ID"); validatePrescription(row.prescription);
      if (row.prescription.id !== row.dayId || !planning.programs.find(p => p.id === row.programId).days.some(d => d.id === row.dayId)) fail("배치 세션 연결을 확인해 주세요.");
      text(row.recordId, 512, "수행 기록 연결", true);
      if (!["planned", "performed", "skipped"].includes(row.status) || (row.status === "performed") !== (row.recordId !== null)) fail("계획과 실제 수행 상태가 일치하지 않습니다.");
      if (row.recordId !== null) {
        const record = records.find(item => item.id === row.recordId);
        if (!record || record.date !== row.date || linked.has(row.recordId)) fail("수행 기록 날짜 또는 중복 연결을 확인해 주세요.");
        linked.add(row.recordId);
      }
      if (row.adjustment !== null) {
        const change = row.adjustment;
        fields(change, ["kind", "reason", "reviewDate", "reviewed", "originalPrescription"], "훈련 조정");
        if (!["progression", "deload", "maintain"].includes(change.kind) || !date(change.reviewDate) || change.reviewDate < row.date || typeof change.reviewed !== "boolean") fail("훈련 조정 종류 또는 검토 날짜를 확인해 주세요.");
        text(change.reason, 2000, "훈련 조정 이유"); validatePrescription(change.originalPrescription);
        if (change.originalPrescription.id !== row.dayId) fail("조정 전 계획 연결을 확인해 주세요.");
      }
    }
  }
  function createEmpty() {
    return { version: VERSION, records: [], mappings: [], settings: { daysPerWeek: 3, sessionMinutes: 60, equipment: "gym", priorityMuscles: [] }, messages: [], planning: emptyPlanning(), reviewPreferences: emptyReviewPreferences(), memory: { constraints: "", focus: "", agreements: "", updatedAt: null }, followUps: [], actions: [] };
  }
  function validateActionValue(value, kind) {
    if (kind === "program") {
      fields(value, ["activeProgramId"], "프로그램 변경값"); text(value.activeProgramId, 512, "프로그램 변경값", true);
    } else if (kind === "schedule") {
      fields(value, ["date", "adjustmentReviewDate"], "일정 변경값");
      if (!date(value.date) || value.adjustmentReviewDate !== null && (!date(value.adjustmentReviewDate) || value.adjustmentReviewDate < value.date)) fail("일정 변경 날짜를 확인해 주세요.");
    } else if (kind === "allocation") {
      fields(value, ["carbAdjustmentG", "carbsG", "fatG", "proteinG", "kcal"], "식사 배분 변경값");
      number(value.carbAdjustmentG, -500, 500, "탄수 배분 조정량");
      for (const key of ["carbsG", "fatG", "proteinG", "kcal"]) number(value[key], 0, 100000, "배분 계산값");
    } else {
      fields(value, ["date", "prescription", "adjustment"], "훈련 부담 변경값"); validatePrescription(value.prescription);
      if (!date(value.date)) fail("훈련 부담 선택 당시 날짜를 확인해 주세요.");
      if (value.adjustment !== null) {
        const change = value.adjustment;
        fields(change, ["kind", "reason", "reviewDate", "reviewed", "originalPrescription"], "행동의 훈련 조정");
        if (!["progression", "deload", "maintain"].includes(change.kind) || !date(change.reviewDate) || change.reviewDate < value.date || typeof change.reviewed !== "boolean") fail("행동의 훈련 조정을 확인해 주세요.");
        text(change.reason, 2000, "조정 이유"); validatePrescription(change.originalPrescription);
        if (change.originalPrescription.id !== value.prescription.id) fail("조정 전후 계획 연결을 확인해 주세요.");
      }
    }
  }
  function validateActions(actions) {
    list(actions, 500, "선택한 행동"); const ids = new Set();
    for (const action of actions) {
      fields(action, ["id", "kind", "targetId", "choice", "basis", "before", "after", "reason", "reviewDate", "status", "createdAt", "appliedAt", "resolvedAt", "reviews"], "행동 초안");
      uniqueId(action.id, ids, "행동 ID"); if (action.id.length > 128) fail("행동 ID가 너무 깁니다.");
      if (!["program", "schedule", "allocation", "burden"].includes(action.kind) || !["draft", "applied", "cancelled", "undone"].includes(action.status)) fail("행동 종류 또는 상태를 확인해 주세요.");
      text(action.targetId, 512, "행동 대상"); text(action.reason, 2000, "행동 선택 이유");
      if (!date(action.reviewDate) || !iso(action.createdAt) || action.appliedAt !== null && !iso(action.appliedAt) || action.resolvedAt !== null && !iso(action.resolvedAt)) fail("행동의 작성·적용·점검 날짜를 확인해 주세요.");
      if (typeof action.basis !== "string" || !/^[a-f0-9]{16}$/.test(action.basis)) fail("행동 기준 식별자를 확인해 주세요.");
      if ((["applied", "undone"].includes(action.status)) !== (action.appliedAt !== null) || (["cancelled", "undone"].includes(action.status)) !== (action.resolvedAt !== null)) fail("행동 상태와 적용 이력이 일치하지 않습니다.");
      if (action.appliedAt !== null && action.appliedAt < action.createdAt || action.resolvedAt !== null && action.resolvedAt < (action.appliedAt || action.createdAt)) fail("행동 이력의 시간 순서를 확인해 주세요.");
      validateActionValue(action.before, action.kind); validateActionValue(action.after, action.kind);
      const choice = action.choice;
      if (action.kind === "program") { fields(choice, ["programId"], "프로그램 선택"); text(choice.programId, 512, "선택 프로그램"); if (action.targetId !== "active-program" || action.after.activeProgramId !== choice.programId) fail("프로그램 선택과 변경값이 일치하지 않습니다."); }
      else if (action.kind === "schedule") { fields(choice, ["date", "adjustmentReviewDate"], "일정 선택"); if (!date(choice.date) || choice.adjustmentReviewDate !== null && !date(choice.adjustmentReviewDate)) fail("선택 일정 날짜를 확인해 주세요."); if (action.after.date !== choice.date || action.after.adjustmentReviewDate !== choice.adjustmentReviewDate) fail("일정 선택과 변경값이 일치하지 않습니다."); }
      else if (action.kind === "allocation") { fields(choice, ["deltaG"], "배분 선택"); number(choice.deltaG, -500, 500, "선택 배분 조정량"); if (!date(action.targetId)) fail("배분 대상 날짜를 확인해 주세요."); if (action.after.carbAdjustmentG !== choice.deltaG || action.before.proteinG !== action.after.proteinG || action.before.kcal !== action.after.kcal || Math.abs((action.after.carbsG - action.before.carbsG) * 4 + (action.after.fatG - action.before.fatG) * 9) > 1e-6) fail("배분 선택의 열량·단백질 보존을 확인해 주세요."); }
      else {
        fields(choice, ["kind", "setReduction", "rirIncrease", "exerciseId", "loadKg"], "훈련 부담 선택");
        if (!["maintain", "deload", "progression"].includes(choice.kind)) fail("훈련 부담 선택을 확인해 주세요.");
        number(choice.setReduction, 0, 19, "줄일 세트", false, true); number(choice.rirIncrease, 0, 10, "늘릴 반복 여유");
        text(choice.exerciseId, 512, "조정 운동", true); number(choice.loadKg, 0, 10000, "선택 중량", true);
        if (action.before.date !== action.after.date || action.before.prescription.id !== action.after.prescription.id || !action.after.adjustment || action.after.adjustment.kind !== choice.kind || action.after.adjustment.reason !== action.reason) fail("훈련 부담 선택과 변경값이 일치하지 않습니다.");
      }
      list(action.reviews, 100, "행동 점검 이력"); const reviewIds = new Set();
      for (const review of action.reviews) {
        fields(review, ["id", "date", "outcome", "execution", "note", "nextReviewDate", "createdAt", "evidence"], "행동 점검");
        uniqueId(review.id, reviewIds, "행동 점검 ID"); text(review.note, 4000, "점검 관찰");
        if (!date(review.date) || !date(review.nextReviewDate) || review.nextReviewDate < review.date || !iso(review.createdAt) || !["maintain", "change", "insufficient"].includes(review.outcome) || !["yes", "no", "unknown"].includes(review.execution)) fail("행동 점검 결과와 날짜를 확인해 주세요.");
        fields(review.evidence, ["from", "to", "recordIds", "dayDates", "performedAssignments", "completedDays"], "점검 당시 기록 근거");
        if (!date(review.evidence.from) || !date(review.evidence.to) || review.evidence.from > review.evidence.to) fail("점검 근거 범위를 확인해 주세요.");
        strings(review.evidence.recordIds, LIMITS.records, 512, "점검 운동 근거"); strings(review.evidence.dayDates, 10000, 10, "점검 날짜 근거");
        if (review.evidence.dayDates.some(value => !date(value) || value < review.evidence.from || value > review.evidence.to)) fail("점검 기록 날짜가 조회 범위를 벗어났습니다.");
        number(review.evidence.performedAssignments, 0, 10000, "연결한 수행 수", false, true); number(review.evidence.completedDays, 0, 10000, "완료한 날짜 수", false, true);
      }
      if (action.reviews.length && action.appliedAt === null) fail("아직 적용하지 않은 행동에 수행 점검을 저장할 수 없습니다.");
    }
  }
  function validate(raw) {
    const workspace = clone(raw);
    if (!own(workspace, "planning")) workspace.planning = emptyPlanning();
    if (!own(workspace, "memory")) workspace.memory = { constraints: "", focus: "", agreements: "", updatedAt: null };
    if (!own(workspace, "followUps")) workspace.followUps = [];
    if (!own(workspace, "actions")) workspace.actions = [];
    if (!own(workspace, "reviewPreferences")) workspace.reviewPreferences = emptyReviewPreferences();
    fields(workspace, ["version", "records", "mappings", "settings", "messages", "planning", "reviewPreferences", "memory", "followUps", "actions"], "훈련 작업공간");
    if (workspace.version !== VERSION) fail("지원하지 않는 훈련 저장 버전입니다.");
    validateRecords(workspace.records);
    validatePlanning(workspace.planning, workspace.records);
    validateActions(workspace.actions);
    validateReviewPreferences(workspace.reviewPreferences);
    fields(workspace.memory, ["constraints", "focus", "agreements", "updatedAt"], "개인 코치 기억");
    for (const key of ["constraints", "focus", "agreements"]) text(workspace.memory[key], 6000, "개인 코치 기억", false, true);
    if (workspace.memory.updatedAt !== null && !iso(workspace.memory.updatedAt)) fail("개인 기억 수정 시각을 확인해 주세요.");
    list(workspace.followUps, 1000, "코치 다음 점검");
    const followUpIds = new Set();
    for (const followUp of workspace.followUps) {
      fields(followUp, ["id", "topic", "note", "reviewDate", "status", "createdAt"], "코치 다음 점검");
      uniqueId(followUp.id, followUpIds, "코치 점검 ID"); text(followUp.note, 4000, "코치 점검 내용");
      if (!["training", "nutrition", "recovery", "general"].includes(followUp.topic) || !["open", "done"].includes(followUp.status) || !date(followUp.reviewDate) || !iso(followUp.createdAt)) fail("코치 점검 상태 또는 날짜를 확인해 주세요.");
    }
    list(workspace.mappings, LIMITS.mappings, "종목 연결");
    const mappingKeys = new Set();
    for (const mapping of workspace.mappings) {
      fields(mapping, ["rawName", "exerciseId", "equipmentKey", "loadConvention", "confirmed"], "종목 연결", ["loadRole"]);
      text(mapping.rawName, 300, "연결 원문 종목명");
      text(mapping.exerciseId, 128, "연결 종목");
      text(mapping.equipmentKey, 128, "연결 장비", true);
      if (own(mapping, "loadRole") && !["unknown", "external", "assistance"].includes(mapping.loadRole)) fail("연결 중량의 역할을 확인해 주세요.");
      if (!LOAD_CONVENTIONS.includes(mapping.loadConvention) || typeof mapping.confirmed !== "boolean") fail("종목 연결 기준 또는 확인 상태가 올바르지 않습니다.");
      const key = JSON.stringify([mapping.rawName, mapping.equipmentKey]);
      if (mappingKeys.has(key)) fail("같은 원문 종목과 장비의 연결이 중복되었습니다.");
      mappingKeys.add(key);
    }
    fields(workspace.settings, ["daysPerWeek", "sessionMinutes", "equipment", "priorityMuscles"], "훈련 설정");
    number(workspace.settings.daysPerWeek, 0, 7, "주당 계획 일수", false, true);
    number(workspace.settings.sessionMinutes, 1, 1440, "계획 세션 시간", false, true);
    text(workspace.settings.equipment, 128, "사용 가능한 장비");
    strings(workspace.settings.priorityMuscles, 32, 64, "우선 부위");
    if (new Set(workspace.settings.priorityMuscles).size !== workspace.settings.priorityMuscles.length) fail("우선 부위가 중복되었습니다.");
    list(workspace.messages, LIMITS.messages, "코치 대화");
    const messageIds = new Set();
    for (const message of workspace.messages) {
      fields(message, ["id", "role", "text", "createdAt", "source", "replyTo", "contextDigest", "status"], "코치 대화");
      if (message.replyTo !== null && !messageIds.has(message.replyTo)) fail("코치 답변이 연결하는 이전 메시지를 찾을 수 없습니다.");
      uniqueId(message.id, messageIds, "메시지 식별자");
      if (!["user", "coach"].includes(message.role) || !["local", "codex"].includes(message.source)
        || !["pending", "answered"].includes(message.status)) fail("코치 대화의 역할, 출처 또는 상태를 확인해 주세요.");
      text(message.text, 20000, "대화 내용");
      text(message.replyTo, 512, "답변 연결", true);
      text(message.contextDigest, 256, "대화 맥락 식별자", true);
      if (!iso(message.createdAt)) fail("대화 작성 시각을 확인해 주세요.");
    }
    return workspace;
  }

  function fromDiaryContext(raw) {
    const context = clone(raw);
    if (!plain(context) || !Array.isArray(context.sessions)) fail("운동일지 context --details 결과를 선택해 주세요.");
    if (own(context, "format") && context.format !== "macro-engine-diary-context") fail("지원하지 않는 운동일지 교환 형식입니다.");
    for (const key of ["version", "schemaVersion"]) if (own(context, key) && context[key] !== VERSION) fail("지원하지 않는 운동일지 context 버전입니다.");
    list(context.sessions, LIMITS.records, "운동일지 세션");
    const warnings = [];
    const damaged = new Set();
    if (own(context, "damaged")) {
      list(context.damaged, LIMITS.records, "손상된 출처");
      for (const entry of context.damaged) {
        if (!plain(entry) || typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.hash)) fail("손상된 출처 목록의 형식을 확인해 주세요.");
        damaged.add(entry.hash);
      }
      if (damaged.size) warnings.push(`손상된 출처 ${damaged.size}개는 가져오지 않았어요. 원본 또는 교정 기록을 확인해 주세요.`);
    }
    const duplicateIds = new Set();
    if (own(context, "possibleDuplicates")) {
      list(context.possibleDuplicates, LIMITS.records, "중복 후보");
      for (const group of context.possibleDuplicates) {
        strings(group, LIMITS.records, 512, "중복 후보 식별자");
        group.forEach(id => duplicateIds.add(id));
      }
      if (duplicateIds.size) warnings.push("같은 운동을 담았을 수 있는 서로 다른 이미지가 있어요. 중복 후보를 확인한 뒤 합쳐 주세요.");
    }
    if (Array.isArray(context.archivedSessions) && context.archivedSessions.length) warnings.push(`대체된 이전 기록 ${context.archivedSessions.length}개는 제외했어요.`);
    const records = [];
    for (const entry of context.sessions) {
      if (!plain(entry) || typeof entry.hash !== "string" || !/^[a-f0-9]{64}$/.test(entry.hash)) fail("운동일지 출처 해시가 올바르지 않습니다.");
      if (damaged.has(entry.hash)) continue;
      if (!["visual", "legacy-ocr"].includes(entry.method)) fail("지원하지 않는 운동일지 판독 방식입니다.");
      const expectedParser = entry.method === "visual" ? "diary-vision-v1" : "legacy-import-v1";
      if (entry.parserVersion !== expectedParser) fail("지원하지 않는 운동일지 판독 버전입니다. 원본 도구에서 확인해 주세요.");
      if (!plain(entry.session)) fail("세트 상세가 없는 요약이에요. context --details로 다시 내보내 주세요.");
      if (typeof entry.id !== "string" || !new RegExp(`^${entry.hash}:\\d+$`).test(entry.id)) fail("운동일지의 출처별 세션 식별자가 올바르지 않습니다.");
      const session = entry.session;
      if (own(session, "trainingIntent")) fail("사진 판독에서 운동 의도를 대신 정할 수 없습니다. 가져온 뒤 직접 선택해 주세요.");
      if (entry.date !== session.date || entry.time !== session.time || entry.label !== session.label) fail("운동일지 요약과 세션 원문이 일치하지 않습니다.");
      strings(entry.sourcePaths, 100, 2048, "원문 경로");
      if (typeof entry.sourceAvailable !== "boolean") fail("원문 접근 상태를 확인해 주세요.");
      if (typeof entry.corrected !== "boolean" || !(entry.correctionRevision === null || typeof entry.correctionRevision === "string")
        || entry.corrected !== (entry.correctionRevision !== null)) fail("운동일지 교정 출처가 일치하지 않습니다.");
      strings(session.uncertainties, 200, 4000, "판독 불확실성");
      list(session.exercises, LIMITS.exercises, "판독 종목");
      const uncertainty = session.uncertainties.slice();
      if (entry.method === "legacy-ocr") {
        uncertainty.push("기존 OCR 자료이며 원문 날짜·세트·볼륨이 추정 또는 오독일 수 있어요. 시각 재확인 자료와 구분해 주세요.");
        warnings.push("기존 OCR 요약은 미검증 이력으로 가져왔어요. 직접 판독한 세트 기록과 같은 근거로 취급하지 않아요.");
      }
      if (!entry.sourceAvailable) uncertainty.push(context.sourceAvailabilityAsOf
        ? "마지막 스캔에서 원본 경로를 찾지 못했어요. 캐시 기록이며 미운동을 뜻하지 않아요."
        : "이 폴더의 스캔 정보가 없어 원본 접근 여부는 미확인입니다. 캐시 기록이며 미운동을 뜻하지 않아요.");
      if (duplicateIds.has(entry.id)) uncertainty.push("서로 다른 이미지의 동일 운동 후보예요. 운동 횟수로 확정하기 전에 중복 여부를 확인해 주세요.");
      const record = {
        id: entry.id, date: session.date, time: session.time, label: session.label,
        durationMinutes: session.durationMinutes, reportedSetCount: session.reportedSetCount,
        reportedVolumeKg: session.reportedVolumeKg, reportedEnergyKcal: session.reportedEnergyKcal,
        source: { kind: entry.method, hash: entry.hash, paths: entry.sourcePaths.slice(), uncertainties: [...new Set(uncertainty)], revision: entry.correctionRevision },
        exercises: session.exercises.map((exercise, index) => {
          if (plain(exercise) && own(exercise, "coachingAnswer")) fail("사진 판독에서 조언 확인 답변을 대신 정할 수 없습니다. 가져온 뒤 직접 답해 주세요.");
          fields(exercise, ["rawName", "loadConvention", "reportedVolumeKg", "durationMinutes", "repsTotal", "sets"], "판독 종목");
          list(exercise.sets, LIMITS.sets, "판독 세트");
          const exerciseId = `${entry.id}:exercise:${index}`;
          return {
            id: exerciseId, rawName: exercise.rawName, exerciseId: null, equipmentKey: null,
            loadConvention: exercise.loadConvention, durationMinutes: exercise.durationMinutes,
            repsTotal: exercise.repsTotal, reportedVolumeKg: exercise.reportedVolumeKg,
            sets: exercise.sets.map((set, setIndex) => {
              fields(set, ["loadKg", "reps", "marker"], "판독 세트");
              return { id: `${exerciseId}:set:${setIndex}`, loadKg: set.loadKg, reps: set.reps, marker: set.marker, rir: null };
            }), notes: ""
          };
        }), notes: "", effort: null, pain: null
      };
      records.push(record);
    }
    validateRecords(records);
    return { records, warnings: [...new Set(warnings)] };
  }

  function sourceView(record) {
    return {
      date: record.date, time: record.time, label: record.label, durationMinutes: record.durationMinutes,
      reportedSetCount: record.reportedSetCount, reportedVolumeKg: record.reportedVolumeKg, reportedEnergyKcal: record.reportedEnergyKcal,
      kind: record.source.kind, hash: record.source.hash,
      exercises: record.exercises.map(exercise => ({ id: exercise.id, rawName: exercise.rawName,
        durationMinutes: exercise.durationMinutes, repsTotal: exercise.repsTotal, reportedVolumeKg: exercise.reportedVolumeKg,
        sets: exercise.sets.map(set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps, marker: set.marker })) }))
    };
  }
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const sessionKey = record => JSON.stringify([record.date, record.time, record.label]);
  function mergeRecords(rawWorkspace, rawRecords) {
    const workspace = validate(rawWorkspace);
    const records = validateRecords(clone(rawRecords));
    const result = { workspace, added: 0, updated: 0, unchanged: 0, conflicts: [], warnings: [] };
    const existingById = new Map(workspace.records.map(record => [record.id, record]));
    // Separate image identities can still describe one workout. Never select a winner by import order.
    const candidateGroups = new Map();
    for (const record of [...workspace.records, ...records]) {
      if (record.source.kind === "manual") continue;
      const key = sessionKey(record);
      if (!candidateGroups.has(key)) candidateGroups.set(key, new Map());
      candidateGroups.get(key).set(record.id, record);
    }
    for (const incoming of records) {
      const existing = existingById.get(incoming.id);
      if (existing) {
        if (existing.source.revision !== incoming.source.revision || !same(sourceView(existing), sourceView(incoming))) {
          result.conflicts.push({ id: incoming.id, reason: "출처 수정본 또는 원문 값이 달라요. 기존 메모와 세트를 보존한 채 비교해 주세요.", existing, incoming });
          continue;
        }
        const nextSource = { ...existing.source, paths: incoming.source.paths.slice(), uncertainties: [...new Set([...existing.source.uncertainties, ...incoming.source.uncertainties])] };
        if (same(existing.source, nextSource)) result.unchanged += 1;
        else { existing.source = nextSource; result.updated += 1; }
        continue;
      }
      const candidates = candidateGroups.get(sessionKey(incoming));
      if (incoming.source.kind !== "manual" && candidates && candidates.size > 1) {
        const other = [...candidates.values()].find(record => record.id !== incoming.id);
        result.conflicts.push({ id: incoming.id, reason: "같은 날짜·시각·분류의 다른 이미지 기록이 있어요. 동일 운동인지 확인해 주세요.", existing: existingById.get(other.id) || null, incoming });
        continue;
      }
      workspace.records.push(incoming);
      existingById.set(incoming.id, incoming);
      result.added += 1;
    }
    if (result.conflicts.length) result.warnings.push("충돌한 기록은 기존 값으로 남겨 두고 새 값은 적용하지 않았어요.");
    result.workspace = validate(workspace);
    return result;
  }

  function parseImport(textValue) {
    if (typeof textValue !== "string" || bytes(textValue) > MAX_BYTES) fail("운동 가져오기 파일은 8MB 이하의 JSON이어야 합니다.");
    let raw;
    try { raw = clone(JSON.parse(textValue.replace(/^\uFEFF/, ""))); }
    catch (error) { if (error instanceof SyntaxError) fail("운동 JSON 파일을 읽을 수 없습니다. 기존 기록은 변경하지 않았어요."); throw error; }
    if (plain(raw) && raw.format === "macro-engine-training-exchange") {
      fields(raw, ["format", "version", "training"], "훈련 교환 파일");
      if (raw.version !== VERSION) fail("지원하지 않는 훈련 교환 버전입니다.");
      const workspace = validate(raw.training);
      return { records: workspace.records, warnings: ["운동 기록만 합쳐요. 설정·종목 연결·대화를 복원하려면 전체 앱 백업을 사용해 주세요."] };
    }
    if (plain(raw) && own(raw, "records")) {
      const workspace = validate(raw);
      return { records: workspace.records, warnings: ["운동 기록만 합쳐요. 기존 설정·종목 연결·대화는 유지해요."] };
    }
    return fromDiaryContext(raw);
  }
  function exportExchange(state) {
    const workspace = validate(plain(state) && own(state, "training") ? state.training : state);
    const output = JSON.stringify({ format: "macro-engine-training-exchange", version: VERSION, training: workspace });
    if (bytes(output) > MAX_BYTES) fail("훈련 교환 파일은 8MB 이하여야 합니다.");
    return output;
  }

  return Object.freeze({ VERSION, MAX_BYTES, LIMITS, LOAD_CONVENTIONS, TRAINING_INTENTS, FEEDBACK_FEELINGS, COACHING_ANSWER_TOPICS, COACHING_ANSWERS, createEmpty, validate, validatePrescription, createCoachingAnswer, coachingAnswerMatches, fromDiaryContext, mergeRecords, parseImport, exportExchange });
});
