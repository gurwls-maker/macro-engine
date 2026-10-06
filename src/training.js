(function (root, factory) {
  const capacity = typeof module === "object" && module.exports ? require("./training-capacity.js") : root.MacroTrainingCapacity;
  const coaching = typeof module === "object" && module.exports ? require("./training-coaching.js") : root.MacroTrainingCoaching;
  const store = typeof module === "object" && module.exports ? require("./training-store.js") : root.MacroTrainingStore;
  const api = factory(capacity, coaching, store);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MacroTraining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Capacity, Coaching, Store) {
  "use strict";

  const VERSION = "1.0.0";
  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const text = value => typeof value === "string" ? value.trim() : "";
  const normalize = value => text(value).normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");
  const muscleLabels = Object.freeze({ chest: "가슴", back: "등", shoulders: "어깨", biceps: "이두", triceps: "삼두", quads: "대퇴사두", hamstrings: "햄스트링", glutes: "둔근", calves: "종아리", core: "몸통", hip_adductors: "고관절 모음근", hip_abductors: "고관절 벌림근" });
  const exercise = (id, label, aliases, primaryMuscles, secondaryMuscles, pattern, equipment) => Object.freeze({ id, label, aliases: Object.freeze(aliases), primaryMuscles: Object.freeze(primaryMuscles), secondaryMuscles: Object.freeze(secondaryMuscles), pattern, equipment });
  const catalog = Object.freeze([
    exercise("bench_press", "바벨 벤치 프레스", ["벤치 프레스", "바벨 벤치프레스", "bench press", "barbell bench press"], ["chest"], ["shoulders", "triceps"], "horizontal-push", "barbell"),
    exercise("dumbbell_bench_press", "덤벨 벤치 프레스", ["덤벨 벤치프레스", "dumbbell bench press"], ["chest"], ["shoulders", "triceps"], "horizontal-push", "dumbbell"),
    exercise("incline_dumbbell_press", "덤벨 인클라인 벤치 프레스", ["인클라인 덤벨 프레스", "incline dumbbell press"], ["chest"], ["shoulders", "triceps"], "horizontal-push", "dumbbell"),
    exercise("machine_chest_press", "머신 체스트 프레스", ["체스트 프레스", "STA7000 체스트 프레스", "machine chest press"], ["chest"], ["shoulders", "triceps"], "horizontal-push", "machine"),
    exercise("dumbbell_floor_press", "덤벨 플로어 프레스", ["dumbbell floor press"], ["chest"], ["shoulders", "triceps"], "horizontal-push", "dumbbell"),
    exercise("push_up", "푸시 업", ["푸쉬업", "팔굽혀펴기", "push up"], ["chest"], ["triceps", "shoulders", "core"], "horizontal-push", "bodyweight"),
    exercise("dumbbell_fly", "덤벨 플라이", ["dumbbell fly"], ["chest"], [], "chest-isolation", "dumbbell"),
    exercise("machine_pec_deck", "머신 플라이", ["펙 덱", "펙 덱 플라이", "머신 펙 덱 플라이", "펙 덱 머신", "버터플라이 머신", "머신 버터플라이", "pec deck", "pec deck fly", "pec deck machine", "machine fly", "machine chest fly", "butterfly machine", "machine butterfly"], ["chest"], [], "chest-isolation", "machine"),
    exercise("cable_fly", "케이블 플라이", ["케이블 로우 플라이", "cable fly"], ["chest"], ["shoulders"], "chest-isolation", "cable"),
    exercise("overhead_press", "바벨 오버 헤드 프레스", ["오버헤드 프레스", "밀리터리 프레스", "overhead press"], ["shoulders"], ["triceps"], "vertical-push", "barbell"),
    exercise("dumbbell_shoulder_press", "덤벨 숄더 프레스", ["dumbbell shoulder press"], ["shoulders"], ["triceps"], "vertical-push", "dumbbell"),
    exercise("machine_shoulder_press", "머신 숄더 프레스", ["숄더 프레스 머신", "machine shoulder press"], ["shoulders"], ["triceps"], "vertical-push", "machine"),
    exercise("smith_seated_shoulder_press", "스미스 시티드 숄더 프레스", ["스미스 머신 시티드 숄더 프레스", "smith seated shoulder press", "seated smith shoulder press"], ["shoulders"], ["triceps"], "vertical-push", "smith"),
    exercise("dumbbell_lateral_raise", "덤벨 사이드 레터럴 레이즈", ["사이드 레터럴 레이즈", "덤벨 레터럴 레이즈", "dumbbell lateral raise"], ["shoulders"], [], "shoulder-isolation", "dumbbell"),
    exercise("cable_lateral_raise", "케이블 원 암 레터럴 레이즈", ["STA7000 케이블 원 암 레터럴 레이즈", "케이블 레터럴 레이즈"], ["shoulders"], [], "shoulder-isolation", "cable"),
    exercise("lat_pulldown", "랫 풀 다운", ["랫풀다운", "lat pulldown"], ["back"], ["biceps"], "vertical-pull", "cable"),
    exercise("neutral_grip_lat_pulldown", "뉴트럴 그립 랫 풀 다운", ["뉴트럴 그립 랫풀다운", "neutral grip lat pulldown", "neutral grip pulldown"], ["back"], ["biceps"], "vertical-pull", "cable"),
    exercise("straight_arm_pulldown", "케이블 암 풀 다운", ["케이블 스트레이트 암 풀 다운", "스트레이트 암 풀 다운", "cable straight arm pulldown", "straight arm pulldown", "straight arm pressdown"], ["back"], [], "shoulder-extension", "cable"),
    exercise("one_arm_pulldown", "케이블 원 암 랫 풀 다운", ["원암 랫풀다운", "one arm lat pulldown"], ["back"], ["biceps"], "vertical-pull", "cable"),
    exercise("pull_up", "풀 업", ["풀업", "턱걸이", "pull up", "W 웜업 풀업", "웜업 풀업", "워밍업 풀업"], ["back"], ["biceps"], "vertical-pull", "bodyweight"),
    exercise("barbell_row", "바벨 벤트 오버 로우", ["바벨 로우", "barbell row"], ["back"], ["biceps", "shoulders", "core"], "horizontal-pull", "barbell"),
    exercise("smith_row", "스미스 벤트 오버 로우", ["스미스 로우", "smith row"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "smith"),
    exercise("smith_underhand_row", "스미스 언더그립 벤트 오버 로우", ["스미스 언더 그립 벤트 오버 로우", "smith underhand bent over row", "smith underhand row"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "smith"),
    exercise("dumbbell_row", "덤벨 원 암 로우", ["덤벨 로우", "원암 덤벨 로우", "dumbbell row"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "dumbbell"),
    exercise("incline_dumbbell_row", "덤벨 인클라인 로우", ["인클라인 덤벨 로우", "incline dumbbell row"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "dumbbell"),
    exercise("seated_cable_row", "케이블 시티드 로우", ["시티드 로우", "seated cable row"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "cable"),
    exercise("one_arm_cable_row", "케이블 원 암 시티드 로우", ["STA7000 케이블 원 암 시티드 로우"], ["back"], ["biceps", "shoulders"], "horizontal-pull", "cable"),
    exercise("dumbbell_pullover", "덤벨 풀 오버", ["덤벨 풀오버", "dumbbell pullover"], ["back"], ["chest"], "shoulder-extension", "dumbbell"),
    exercise("face_pull", "로프 페이스 풀", ["페이스 풀", "face pull"], ["shoulders", "back"], [], "horizontal-pull", "cable"),
    exercise("dumbbell_curl", "덤벨 컬", ["dumbbell curl"], ["biceps"], [], "elbow-flexion", "dumbbell"),
    exercise("hammer_curl", "덤벨 해머 컬", ["해머 컬", "hammer curl"], ["biceps"], [], "elbow-flexion", "dumbbell"),
    exercise("incline_curl", "인클라인 덤벨 컬", ["incline dumbbell curl"], ["biceps"], [], "elbow-flexion", "dumbbell"),
    exercise("cable_curl", "케이블 컬", ["STA7000 케이블 컬1", "STA7000 케이블 컬2", "케이블 스쿼팅 컬", "cable curl"], ["biceps"], [], "elbow-flexion", "cable"),
    exercise("machine_arm_curl", "머신 암 컬", ["암 컬 머신", "머신 바이셉스 컬", "디랙스 암 컬", "machine arm curl", "machine biceps curl", "Drax arm curl", "Drax biceps curl"], ["biceps"], [], "elbow-flexion", "machine"),
    exercise("machine_hammer_curl", "머신 해머 컬", ["머신 암 컬 해머", "머신 원 암 해머 컬", "원 암 머신 해머 컬", "머신 해머 컬 원 암", "암 컬 해머 머신", "암 컬 해머 원 암 머신", "디랙스 암 컬 해머", "디랙스 암 컬 해머 원 암", "machine hammer curl", "machine one arm hammer curl", "one arm machine hammer curl", "machine hammer curl one arm", "Drax arm curl hammer", "Drax arm curl hammer one arm"], ["biceps"], [], "elbow-flexion", "machine"),
    exercise("triceps_pushdown", "케이블 푸시 다운", ["트라이셉스 푸시다운", "triceps pushdown"], ["triceps"], [], "elbow-extension", "cable"),
    exercise("rope_triceps_pushdown", "케이블 로프 푸시 다운", ["케이블 로프 푸쉬 다운", "로프 트라이셉스 푸시다운", "cable rope pushdown", "rope triceps pushdown"], ["triceps"], [], "elbow-extension", "cable"),
    exercise("overhead_triceps_extension", "케이블 오버헤드 익스텐션", ["STA7000 케이블 오버헤드 익스텐션", "케이블 로프 하이 풀리 오버헤드 트라이셉스"], ["triceps"], [], "elbow-extension", "cable"),
    exercise("dumbbell_triceps_extension", "덤벨 오버헤드 익스텐션", ["dumbbell triceps extension"], ["triceps"], [], "elbow-extension", "dumbbell"),
    exercise("squat", "바벨 스쿼트", ["스쿼트", "백 스쿼트", "barbell squat", "back squat"], ["quads", "glutes"], ["core"], "squat", "barbell"),
    exercise("goblet_squat", "고블릿 스쿼트", ["goblet squat"], ["quads", "glutes"], ["core"], "squat", "dumbbell"),
    exercise("bodyweight_squat", "맨몸 스쿼트", ["bodyweight squat"], ["quads", "glutes"], ["core"], "squat", "bodyweight"),
    exercise("leg_press", "시티드 레그 프레스", ["STA7000 시티드 레그 프레스", "레그 프레스", "leg press"], ["quads", "glutes"], [], "squat", "machine"),
    exercise("reverse_v_squat", "리버스 브이 스쿼트", ["reverse v squat"], ["quads", "glutes"], [], "squat", "machine"),
    exercise("romanian_deadlift", "바벨 루마니안 데드리프트", ["루마니안 데드리프트", "romanian deadlift"], ["hamstrings", "glutes"], ["back", "core"], "hinge", "barbell"),
    exercise("dumbbell_rdl", "덤벨 루마니안 데드리프트", ["dumbbell romanian deadlift"], ["hamstrings", "glutes"], ["back", "core"], "hinge", "dumbbell"),
    exercise("dumbbell_stiff_leg_deadlift", "덤벨 스티프 레그 데드리프트", ["덤벨 스티프 레그드 데드리프트", "dumbbell stiff leg deadlift", "dumbbell stiff legged deadlift"], ["hamstrings", "glutes"], ["back", "core"], "hinge", "dumbbell"),
    exercise("deadlift", "바벨 데드리프트", ["데드리프트", "deadlift"], ["glutes", "hamstrings"], ["quads", "back", "core"], "hinge", "barbell"),
    exercise("leg_curl", "라잉 레그컬", ["STA7000 라잉 레그컬", "레그 컬", "lying leg curl"], ["hamstrings"], [], "knee-flexion", "machine"),
    exercise("leg_extension", "레그 익스텐션", ["STA7000 레그 익스텐션", "leg extension"], ["quads"], [], "knee-extension", "machine"),
    exercise("hip_adduction", "머신 힙 어덕션", ["힙 어덕션", "hip adduction"], ["hip_adductors"], [], "hip-adduction", "machine"),
    exercise("hip_abduction", "케이블 힙 어브덕션", ["STA7000 케이블 힙 어브덕션", "힙 어브덕션", "hip abduction"], ["hip_abductors"], ["glutes"], "hip-abduction", "cable"),
    exercise("calf_raise", "스탠딩 카프 레이즈", ["카프 레이즈", "standing calf raise"], ["calves"], [], "calf", "bodyweight"),
    exercise("leg_press_calf", "시티드 레그프레스 카프", ["STA7000 시티드 레그프레스 카프"], ["calves"], [], "calf", "machine"),
    exercise("lunge", "맨몸 리버스 런지", ["리버스 런지", "bodyweight lunge"], ["quads", "glutes"], ["core"], "lunge", "bodyweight"),
    exercise("dumbbell_lunge", "덤벨 리버스 런지", ["덤벨 런지", "dumbbell lunge"], ["quads", "glutes"], ["core"], "lunge", "dumbbell"),
    exercise("dumbbell_bulgarian_split_squat", "덤벨 불가리안 스플릿 스쿼트", ["dumbbell bulgarian split squat", "dumbbell rear foot elevated split squat"], ["quads", "glutes"], ["core"], "lunge", "dumbbell"),
    exercise("glute_bridge", "글루트 브리지", ["힙 브리지", "glute bridge"], ["glutes"], ["hamstrings"], "hinge", "bodyweight"),
    exercise("dead_bug", "데드 버그", ["dead bug"], ["core"], [], "core", "bodyweight"),
    exercise("cable_crunch", "케이블 닐링 크런치", ["케이블 크런치", "cable crunch"], ["core"], [], "core", "cable"),
    exercise("prone_w_raise", "엎드린 W 레이즈", ["prone w raise"], ["shoulders"], ["back"], "scapular-control", "bodyweight"),
    exercise("side_lying_abduction", "옆으로 누운 다리 벌리기", ["side lying hip abduction"], ["hip_abductors"], ["glutes"], "hip-abduction", "bodyweight"),
    exercise("side_lying_adduction", "옆으로 누운 다리 모으기", ["side lying hip adduction"], ["hip_adductors"], [], "hip-adduction", "bodyweight"),
    exercise("external_rotation", "보조 밴드 스탠딩 익스터널 로테이션", ["밴드 외회전"], ["shoulders"], [], "rotation", "band"),
    exercise("foam_rolling", "폼 롤링 스트레칭", ["폼롤링", "foam rolling"], [], [], "mobility", "foam-roller"),
    exercise("back_stretch", "등 근육 스트레칭", ["등 스트레칭"], [], [], "mobility", "bodyweight"),
    exercise("treadmill", "런닝머신", ["러닝머신", "treadmill"], [], [], "cardio", "treadmill")
  ]);
  const byId = new Map(catalog.map(row => [row.id, row]));
  const aliases = new Map();
  for (const row of catalog) for (const name of [row.id, row.label, ...row.aliases]) {
    const key = normalize(name);
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key).add(row.id);
  }

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const n = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
  }

  const mappingIdentity = row => JSON.stringify([row.exerciseId, row.loadConvention, row.loadRole || "unknown", text(row.variantKey)]);
  const mappingKey = row => JSON.stringify([mappingIdentity(row), equipmentName(row.equipmentKey).toLowerCase()]);
  function effectiveConfirmedMappings(rows) {
    const valid = rows.filter(row => row?.confirmed === true && byId.has(row.exerciseId));
    const complete = new Set(valid.filter(row => text(row.equipmentKey)).map(mappingIdentity));
    // Completing an otherwise identical rule is not a second physical device.
    return valid.filter(row => text(row.equipmentKey) || !complete.has(mappingIdentity(row)));
  }

  function confirmedMapping(rawName, mappings) {
    const rows = effectiveConfirmedMappings((Array.isArray(mappings) ? mappings : []).filter(row => normalize(row?.rawName) === normalize(rawName)));
    const keys = new Set(rows.map(mappingKey));
    return keys.size === 1 ? rows[0] : null;
  }

  function equipmentName(value) {
    const label = text(value).normalize("NFKC").replace(/\s+/g, " ");
    if (/^sta\s*7000$/i.test(label)) return "STA7000";
    if (/^(디랙스|drax)$/i.test(label)) return "디랙스";
    if (/^(인피니티|infinity)$/i.test(label)) return "인피니티";
    return label;
  }

  function parseExerciseName(rawName) {
    const original = text(rawName), name = original.normalize("NFKC");
    let match = name.match(/^\[([^\[\]]+)\]\s*(.+)$/);
    if (!match) match = name.match(/^([^|]+)\s*\|\s*([^|]+)$/);
    if (match && text(match[1]) && text(match[2])) return { rawName: original, movementName: text(match[2]), equipmentKey: equipmentName(match[1]), equipmentSource: "name-delimiter" };
    match = name.match(/^(sta\s*7000|디랙스|drax|인피니티|infinity)\s+(.+)$/i);
    if (match) return { rawName: original, movementName: text(match[2]), equipmentKey: equipmentName(match[1]), equipmentSource: "name-prefix" };
    match = name.match(/^(sta\s*7000|디랙스|drax|인피니티|infinity)(.+)$/i);
    if (match && (aliases.has(normalize(match[2])) || aliases.has(normalize(original))
      || aliases.has(normalize(`${equipmentName(match[1])} ${match[2]}`)))) {
      return { rawName: original, movementName: text(match[2]), equipmentKey: equipmentName(match[1]), equipmentSource: "name-prefix" };
    }
    return { rawName: original, movementName: original, equipmentKey: null, equipmentSource: null };
  }

  function nameLoadConvention(rawName) {
    const name = text(rawName).normalize("NFKC");
    const perSide = /원\s*암|덤벨|\bone[\s_-]*arm\b|\bdumbbells?\b|\bper[\s_-]*hand\b/i.test(name);
    const total = /바벨|\bbarbells?\b/i.test(name);
    return { loadConvention: perSide === total ? "as-recorded" : perSide ? "per-side" : "total", ruleConflict: perSide && total };
  }

  function scopedMappings(record, parsed, mappings) {
    const explicitId = text(record.exerciseId), explicitEquipment = text(record.equipmentKey);
    const explicitConvention = ["total", "per-side", "bodyweight"].includes(record.loadConvention) ? record.loadConvention : null;
    const sameEquipment = (a, b) => equipmentName(a).toLowerCase() === equipmentName(b).toLowerCase();
    const eligible = (parsed.rawName && Array.isArray(mappings) ? mappings : []).filter(row => row?.confirmed === true
      && (!explicitId || row.exerciseId === explicitId)
      && (!explicitEquipment || sameEquipment(row.equipmentKey, explicitEquipment))
      && (!explicitConvention || row.loadConvention === explicitConvention));
    let mappingName = parsed.rawName;
    let rows = eligible.filter(row => normalize(row.rawName) === normalize(mappingName));
    if (!rows.length && parsed.equipmentKey) {
      mappingName = parsed.movementName;
      rows = eligible.filter(row => normalize(row.rawName) === normalize(mappingName)
        && sameEquipment(row.equipmentKey, explicitEquipment || parsed.equipmentKey));
    }
    return { mappingName, rows };
  }

  const equipmentKinds = [
    { names: ["바벨", "barbell"], categories: ["barbell"] },
    { names: ["덤벨", "dumbbell", "dumbbells"], categories: ["dumbbell"] },
    { names: ["스미스", "스미스 머신", "smith", "smith machine"], categories: ["smith"] },
    { names: ["케이블", "cable"], categories: ["cable"] },
    { names: ["밴드", "band"], categories: ["band"] },
    { names: ["맨몸", "bodyweight"], categories: ["bodyweight"] },
    { names: ["머신", "machine"], categories: ["machine", "cable", "smith"] }
  ];

  function describeExercise(input, mappings = []) {
    const record = typeof input === "string" ? { rawName: input } : input && typeof input === "object" ? input : {};
    const parsed = parseExerciseName(record.rawName), explicitId = text(record.exerciseId), explicitEquipment = text(record.equipmentKey);
    const explicitConvention = ["total", "per-side", "bodyweight"].includes(record.loadConvention) ? record.loadConvention : null;
    const explicitRole = ["external", "assistance"].includes(record.loadRole) ? record.loadRole : null;
    const { mappingName, rows: scoped } = scopedMappings(record, parsed, mappings);
    const mapping = confirmedMapping(mappingName, scoped);
    const declaredKind = equipmentKinds.find(kind => kind.names.some(name => normalize(name) === normalize(parsed.equipmentKey)));
    const joinedIds = parsed.equipmentKey ? [parsed.equipmentKey, ...(declaredKind?.names || [])]
      .map(name => aliases.get(normalize(`${name} ${parsed.movementName}`))).find(Boolean) : null;
    const ids = aliases.get(normalize(parsed.rawName)) || joinedIds || aliases.get(normalize(parsed.movementName));
    const aliasMovement = ids?.size === 1 ? byId.get([...ids][0]) : null;
    const compatible = !declaredKind || declaredKind.categories.includes(aliasMovement?.equipment);
    const movement = explicitId ? byId.get(explicitId) : mapping ? byId.get(mapping.exerciseId) : !scoped.length && compatible ? aliasMovement : null;
    const equipmentKey = explicitEquipment || text(mapping?.equipmentKey) || parsed.equipmentKey;
    const equipmentSource = explicitEquipment ? "record" : text(mapping?.equipmentKey) ? "mapping" : parsed.equipmentSource;
    const mappedConvention = ["as-recorded", "total", "per-side", "bodyweight"].includes(mapping?.loadConvention) ? mapping.loadConvention : null;
    const nameRule = nameLoadConvention(parsed.rawName);
    const loadConvention = explicitConvention || mappedConvention || nameRule.loadConvention;
    const loadConventionSource = explicitConvention ? "record" : mappedConvention ? "mapping" : nameRule.loadConvention !== "as-recorded" ? "name-rule" : null;
    const ruleConflict = !explicitConvention && !mappedConvention && nameRule.ruleConflict;
    const loadRole = explicitRole || (["external", "assistance"].includes(mapping?.loadRole) ? mapping.loadRole : "unknown");
    const loadRoleSource = explicitRole ? "record" : loadRole !== "unknown" ? "mapping" : null;
    const resolved = movement ? { id: movement.id, label: movement.label, primaryMuscles: [...movement.primaryMuscles], secondaryMuscles: [...movement.secondaryMuscles], pattern: movement.pattern, equipment: movement.equipment,
      confidence: explicitId ? "record-confirmed" : mapping ? "confirmed" : "exact-alias",
      comparableKey: ["record", "mapping"].includes(equipmentSource) && ["total", "per-side"].includes(loadConvention) ? `${movement.id}|${equipmentKey}|${loadConvention}` : null } : null;
    // A name-derived brand must not collapse distinct aliases such as curl 1 and curl 2.
    const variantKey = equipmentSource?.startsWith("name-") ? normalize(parsed.movementName) : null;
    return { ...parsed, resolved, equipmentKey, loadConvention, equipmentSource, variantKey, loadConventionSource, ruleConflict, loadRole, loadRoleSource };
  }

  function previewMapping(records, mappings, proposed, selection = {}) {
    const rows = Array.isArray(records) ? records : [], existing = Array.isArray(mappings) ? mappings : [];
    const result = { valid: false, error: null, mapping: null, nextMappings: existing.map(row => ({ ...row })), selected: null, rows: [], futureConflict: false,
      counts: { matchingExerciseCount: 0, affectedRecordCount: 0, affectedExerciseCount: 0, alreadyAppliedExerciseCount: 0,
        unchangedExerciseCount: 0, protectedExerciseCount: 0, conflictCount: 0, additionalAffectedExerciseCount: 0 },
      reasons: ["선택한 운동을 제외한 자동 해석 변경을 셉니다. 직접 확인한 다른 기록의 값과 원문·세트 숫자는 바꾸지 않습니다.", "같은 원문 이름을 기준으로 보며, 장비 접두어를 통해 추가로 해석이 달라지는 이름은 별도로 표시합니다."] };
    selection = selection && typeof selection === "object" ? selection : {};
    const selectedRecord = rows.find(row => row?.id === selection.recordId);
    const selectedExercise = (Array.isArray(selectedRecord?.exercises) ? selectedRecord.exercises : []).find(row => row?.id === selection.exerciseId);
    if (!selectedExercise || !proposed || typeof proposed !== "object") { result.error = "선택한 운동과 저장할 기준을 확인해 주세요."; return result; }
    const mapping = { rawName: typeof proposed.rawName === "string" ? proposed.rawName : selectedExercise.rawName, exerciseId: text(proposed.exerciseId),
      equipmentKey: text(proposed.equipmentKey) || null, loadConvention: proposed.loadConvention,
      loadRole: proposed.loadRole || "unknown", confirmed: proposed.confirmed === true };
    if (!normalize(mapping.rawName) || normalize(mapping.rawName) !== normalize(selectedExercise.rawName)
      || !byId.has(mapping.exerciseId) || !["as-recorded", "total", "per-side", "bodyweight"].includes(mapping.loadConvention)
      || !["unknown", "external", "assistance"].includes(mapping.loadRole)
      || (proposed.equipmentKey != null && typeof proposed.equipmentKey !== "string") || !mapping.confirmed) {
      result.error = "실제 종목·장비·중량 기준을 확인한 뒤 미리볼 수 있어요."; return result;
    }
    result.valid = true; result.mapping = mapping;
    result.nextMappings = existing.filter(row => !(row.rawName === mapping.rawName && row.equipmentKey === mapping.equipmentKey)).map(row => ({ ...row }));
    result.nextMappings.push({ ...mapping });
    const indexRules = rules => {
      const index = new Map();
      for (const row of rules) if (row?.confirmed === true) {
        const key = normalize(row.rawName);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(row);
      }
      return index;
    };
    const beforeIndex = indexRules(existing), afterIndex = indexRules(result.nextMappings), parsedNames = new Map();
    const parsedFor = name => { const key = text(name); if (!parsedNames.has(key)) parsedNames.set(key, parseExerciseName(name)); return parsedNames.get(key); };
    const relevantRules = (index, parsed) => {
      const key = normalize(parsed.rawName), direct = index.get(key) || [], movementKey = normalize(parsed.movementName);
      return parsed.equipmentKey && movementKey !== key ? [...direct, ...(index.get(movementKey) || [])] : direct;
    };
    const ambiguous = (raw, rules) => {
      const scoped = effectiveConfirmedMappings(scopedMappings(raw, parsedFor(raw.rawName), rules).rows);
      return new Set(scoped.map(mappingKey)).size > 1;
    };
    const metadata = value => ({ exerciseId: value.resolved?.id || null, equipmentKey: value.equipmentKey,
      loadConvention: value.loadConvention, loadRole: value.loadRole, equipmentSource: value.equipmentSource,
      loadConventionSource: value.loadConventionSource, loadRoleSource: value.loadRoleSource,
      confidence: value.resolved?.confidence || null, variantKey: value.variantKey, ruleConflict: value.ruleConflict });
    const changes = (before, after) => { const left = metadata(before), right = metadata(after); return Object.keys(left).filter(key => left[key] !== right[key]); };
    const selectedParsed = parsedFor(selectedExercise.rawName), targetName = normalize(mapping.rawName);
    const selectedBefore = describeExercise(selectedExercise, relevantRules(beforeIndex, selectedParsed));
    const selectedAfter = describeExercise({ ...selectedExercise, exerciseId: mapping.exerciseId, equipmentKey: mapping.equipmentKey,
      loadConvention: mapping.loadConvention, loadRole: mapping.loadRole }, relevantRules(afterIndex, selectedParsed));
    result.selected = { recordId: selectedRecord.id, exerciseId: selectedExercise.id, before: selectedBefore, after: selectedAfter, changedFields: changes(selectedBefore, selectedAfter) };
    const affectedRecords = new Set();
    for (const record of rows) for (const raw of Array.isArray(record?.exercises) ? record.exercises : []) {
      if (!raw || record.id === selectedRecord.id && raw.id === selectedExercise.id) continue;
      const parsed = parsedFor(raw.rawName), exactName = normalize(parsed.rawName) === targetName;
      // A changed rule can reach only the full raw name or a parsed equipment-prefix fallback.
      if (!exactName && (!parsed.equipmentKey || normalize(parsed.movementName) !== targetName)) continue;
      const beforeRules = relevantRules(beforeIndex, parsed), afterRules = relevantRules(afterIndex, parsed);
      const before = describeExercise(raw, beforeRules), after = describeExercise(raw, afterRules);
      const changedFields = changes(before, after), conflictBefore = ambiguous(raw, beforeRules), conflict = ambiguous(raw, afterRules);
      if (!exactName && !changedFields.length && conflictBefore === conflict) continue;
      const protectedFields = [text(raw.exerciseId) ? "exerciseId" : null, text(raw.equipmentKey) ? "equipmentKey" : null,
        ["total", "per-side", "bodyweight"].includes(raw.loadConvention) ? "loadConvention" : null,
        ["external", "assistance"].includes(raw.loadRole) ? "loadRole" : null].filter(Boolean);
      const alreadyApplied = !changedFields.length && after.resolved?.id === mapping.exerciseId && after.equipmentKey === mapping.equipmentKey
        && after.loadConvention === mapping.loadConvention && after.loadRole === mapping.loadRole && !conflict;
      const status = conflict ? "conflict" : changedFields.length ? "affected" : alreadyApplied ? "already-applied" : protectedFields.length ? "protected" : "unchanged";
      result.rows.push({ recordId: record.id, exerciseId: raw.id, date: record.date, rawName: raw.rawName,
        scope: exactName ? "exact-name" : "other-auto-change", before, after, changedFields, protectedFields, conflictBefore, conflict, status });
      if (exactName) result.counts.matchingExerciseCount++;
      if (changedFields.length) { result.counts.affectedExerciseCount++; affectedRecords.add(record.id); if (!exactName) result.counts.additionalAffectedExerciseCount++; }
      else result.counts.unchangedExerciseCount++;
      if (alreadyApplied) result.counts.alreadyAppliedExerciseCount++;
      if (protectedFields.length) result.counts.protectedExerciseCount++;
      if (conflict) result.counts.conflictCount++;
    }
    result.counts.affectedRecordCount = affectedRecords.size;
    result.futureConflict = ambiguous({ rawName: mapping.rawName }, relevantRules(afterIndex, parsedFor(mapping.rawName)));
    if (result.counts.conflictCount || result.futureConflict) result.reasons.push("같은 이름에 서로 다른 확인 기준이 있어 미입력 기록은 하나로 선택할 수 없어요. 실제 장비를 각 기록에서 확인해 주세요.");
    return result;
  }

  function resolveExercise(rawName, mappings = []) {
    return describeExercise({ rawName }, mappings).resolved;
  }

  const movementFamilies = Object.freeze([
    Object.freeze({ id: "horizontal-press", exerciseIds: Object.freeze(["bench_press", "dumbbell_bench_press", "machine_chest_press"]) })
  ]);
  function relatedExerciseIds(exerciseId) {
    const family = movementFamilies.find(row => row.exerciseIds.includes(exerciseId));
    return family ? [...family.exerciseIds] : byId.has(exerciseId) ? [exerciseId] : [];
  }
  function setCounts(sets) {
    const result = { workingSets: 0, markedSets: 0, warmupSets: 0, unknownEffortSets: 0 };
    const seen = new Set();
    for (const set of Array.isArray(sets) ? sets : []) {
      if (!set || !Number.isInteger(set.reps) || set.reps <= 0) continue;
      if (text(set.id) && seen.has(set.id)) continue;
      if (text(set.id)) seen.add(set.id);
      if (text(set.marker).toUpperCase() === "W") result.warmupSets++;
      else {
        if (text(set.marker)) result.markedSets++;
        else result.workingSets++;
        if (!finite(set.rir) || set.rir < 0 || set.rir > 10) result.unknownEffortSets++;
      }
    }
    return result;
  }
  function distinctSourceRecords(records) {
    const groups = new Map(), independent = [];
    for (const row of records) {
      if (!text(row.source?.hash)) { independent.push(row); continue; }
      const key = JSON.stringify([row.source.hash, row.date, row.time, row.label, row.exercises.map(raw => [raw?.rawName, (Array.isArray(raw?.sets) ? raw.sets : []).map(set => [set?.loadKg, set?.reps, set?.marker, set?.rir])])]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const result = { records: [...independent], duplicateRecords: 0, conflictedRecords: 0 };
    for (const rows of groups.values()) {
      const interpretations = new Set(rows.map(row => JSON.stringify([row.pain || null, row.effort ?? null, row.sequence || { order: "unknown", structure: "unknown" }, row.trainingIntent || null, row.exercises.map(raw => [raw?.exerciseId || null, raw?.equipmentKey || null, raw?.loadConvention, raw?.loadRole || "unknown", raw?.groupKey || null,
        raw?.feedback ? [(raw.sets || []).findIndex(set => set.id === raw.feedback.setId), raw.feedback.feeling, raw.feedback.loadKg, raw.feedback.reps] : null,
        raw?.coachingAnswer && Store?.coachingAnswerMatches(raw) ? [raw.coachingAnswer.topic, raw.coachingAnswer.answer] : null])])));
      if (interpretations.size > 1) result.conflictedRecords += rows.length;
      else { result.records.push(rows[0]); result.duplicateRecords += rows.length - 1; }
    }
    return result;
  }
  function sessionContext(record, mappings = []) {
    const orderConfirmed = record?.sequence?.order === "listed";
    const structure = ["straight", "grouped"].includes(record?.sequence?.structure) ? record.sequence.structure : "unknown";
    const exercises = Array.isArray(record?.exercises) ? record.exercises : [];
    const described = exercises.map(raw => ({ raw, description: describeExercise(raw, mappings), counts: setCounts(raw?.sets) }));
    const wholeSession = { workingSets: 0, markedSets: 0, warmupSets: 0, unresolvedBlocks: 0, unknownEffortSets: 0 };
    for (const item of described) {
      for (const key of ["workingSets", "markedSets", "warmupSets", "unknownEffortSets"]) wholeSession[key] += item.counts[key];
      if (!item.description.resolved) wholeSession.unresolvedBlocks++;
    }
    const sequential = orderConfirmed && structure === "straight" && described.every(item => !text(item.raw?.groupKey));
    const blocks = described.map((item, index) => {
      const { raw, description: d } = item;
      const prior = described.slice(0, index), muscles = new Set([...(d.resolved?.primaryMuscles || []), ...(d.resolved?.secondaryMuscles || [])]);
      const preceding = { workingSets: null, relatedSets: null, sameExerciseSets: null, markedSets: null, warmupSets: null, unresolvedBlocks: null };
      if (sequential) {
        for (const key of Object.keys(preceding)) preceding[key] = 0;
        for (const other of prior) {
          preceding.workingSets += other.counts.workingSets;
          preceding.markedSets += other.counts.markedSets;
          preceding.warmupSets += other.counts.warmupSets;
          if (!other.description.resolved) preceding.unresolvedBlocks++;
          else {
            if (other.description.resolved.id === d.resolved?.id) preceding.sameExerciseSets += other.counts.workingSets;
            if ([...other.description.resolved.primaryMuscles, ...other.description.resolved.secondaryMuscles].some(id => muscles.has(id))) preceding.relatedSets += other.counts.workingSets;
          }
        }
      }
      // This key describes recorded preceding work, not equivalent fatigue or a measured readiness state.
      const contextKey = sequential && d.resolved && !preceding.unresolvedBlocks ? JSON.stringify(prior.map(other => [other.description.resolved.id,
        other.description.equipmentKey, other.description.loadConvention, other.description.loadRole, other.raw?.durationMinutes ?? null,
        (Array.isArray(other.raw?.sets) ? other.raw.sets : []).map(set => [finite(set?.loadKg) && set.loadKg >= 0 ? set.loadKg : null,
          Number.isInteger(set?.reps) && set.reps > 0 ? set.reps : null, finite(set?.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null, text(set?.marker) || null])])) : null;
      return { blockId: text(raw?.id), exerciseId: d.resolved?.id || null, equipmentKey: d.equipmentKey, equipmentSource: d.equipmentSource,
        loadConvention: d.loadConvention, loadRole: d.loadRole, groupKey: text(raw?.groupKey) || null,
        displayPosition: index + 1, executionPosition: sequential ? index + 1 : null, preceding, contextKey };
    });
    return { schemaVersion: 1, recordId: text(record?.id), date: record?.date || null, orderConfirmed, structure, blocks, wholeSession,
      limits: ["표시 순서는 확인 전 실제 수행 순서가 아닙니다. 묶음 수행은 세트별 선후관계를 추측하지 않습니다.", "선행 세트 수는 기록 맥락이며 피로량·유효 자극량이 아닙니다. 실제 휴식·가동범위·기술은 확인되지 않았습니다."] };
  }
  function startingReference(records = [], request = {}, options = {}) {
    const asOf = dateNumber(options.date), horizon = 90;
    const from = asOf === null ? null : new Date(asOf - (horizon - 1) * DAY).toISOString().slice(0, 10);
    const result = { schemaVersion: 1, status: "first-session", request: { ...request }, window: { from, to: asOf === null ? null : options.date, days: horizon }, range: null, references: [], transfer: null,
      reasons: [], limits: ["범위는 실제 표시 중량의 참고 또는 개인 관찰 관계의 잠정 추정이며 처방·등가 저항·신뢰구간이 아닙니다.", "최근 직접 참고 28일, 관찰 범위 90일, 새 원본 14일, 관찰 짝 7일·3개는 제품 선택입니다. 보편적 치환계수·연쇄 환산·관찰 밖 외삽은 하지 않습니다.", "RIR은 자기보고이며 같은 순서와 선행 세트 수도 같은 휴식·기술·피로를 보장하지 않습니다."] };
    if (asOf === null || !byId.has(request.exerciseId) || !text(request.equipmentKey) || !["total", "per-side"].includes(request.loadConvention) || request.loadRole !== "external") {
      result.status = "unsupported"; result.reasons.push("실제 대상 장비·중량 규약·외부 저항 역할과 기준 날짜를 확인해야 중량 참고를 만들 수 있어요. 보조 중량·맨몸 부하는 환산하지 않아요."); return result;
    }
    const input = Array.isArray(records) ? records : [], dates = new Map(), seen = new Map(), conflicts = new Set();
    for (const row of input) {
      const day = dateNumber(row?.date);
      if (day === null || day > asOf || day < asOf - (horizon - 1) * DAY || !text(row?.id) || !Array.isArray(row.exercises)) continue;
      if (seen.has(row.id) && JSON.stringify(seen.get(row.id)) !== JSON.stringify(row)) conflicts.add(row.id);
      else seen.set(row.id, row);
    }
    for (const id of conflicts) seen.delete(id);
    const uniqueSources = distinctSourceRecords([...seen.values()]);
    if (conflicts.size || uniqueSources.conflictedRecords) result.reasons.push("서로 다른 내용의 같은 기록 또는 같은 이미지 해석은 참고에서 제외했어요. 원문은 변경하지 않았어요.");
    for (const row of uniqueSources.records) dates.set(row.date, (dates.get(row.date) || 0) + 1);
    const latestPain = [...seen.values()].filter(row => ["none", "mild", "stop"].includes(row.pain))
      .sort((a, b) => a.date.localeCompare(b.date) || ({ none: 0, mild: 1, stop: 2 }[a.pain] - { none: 0, mild: 1, stop: 2 }[b.pain])).at(-1)?.pain || null;
    const observations = [];
    const repetitionMatches = set => (!finite(request.repsMin) || set.reps >= request.repsMin) && (!finite(request.repsMax) || set.reps <= request.repsMax);
    const effortMatches = set => repetitionMatches(set) && (!finite(request.rir) || set.rir === request.rir);
    const requestedRepetitions = finite(request.repsMin) || finite(request.repsMax), requestedEffort = finite(request.rir);
    for (const row of uniqueSources.records) {
      const context = sessionContext(row, options.mappings);
      for (const raw of row.exercises) {
        const d = describeExercise(raw, options.mappings), block = context.blocks.find(item => item.blockId === raw.id);
        if (!d.resolved || !["record", "mapping"].includes(d.equipmentSource) || !text(d.equipmentKey) || !["total", "per-side"].includes(d.loadConvention) || d.loadRole !== "external" || row.source?.kind === "legacy-ocr") continue;
        const generalSets = (Array.isArray(raw.sets) ? raw.sets : []).filter(item => item && !text(item.marker));
        const candidates = generalSets.filter(item => finite(item.loadKg) && item.loadKg > 0 && item.loadKg <= 10000 && Number.isInteger(item.reps) && item.reps > 0 && item.reps <= 100000);
        // A recorded set matching the requested repetitions is more useful than an unrelated first heavy set.
        const exact = candidates.find(effortMatches), repetition = candidates.find(repetitionMatches);
        const set = exact || repetition || candidates[0];
        if (!set) continue;
        const contextKey = dates.get(row.date) === 1 ? block?.contextKey ?? null : null;
        observations.push({ recordId: row.id, blockId: raw.id, setId: set.id || null, date: row.date, exerciseId: d.resolved.id, equipmentKey: d.equipmentKey,
          loadConvention: d.loadConvention, loadRole: d.loadRole, loadKg: set.loadKg, reps: set.reps, rir: finite(set.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null,
          contextKey, groupKey: block?.groupKey || null, displayPosition: block?.displayPosition || null, preceding: block?.preceding || null, sameDaySessions: dates.get(row.date),
          trainingIntent: row.trainingIntent || null, generalSetPosition: generalSets.indexOf(set) + 1, generalSetCount: generalSets.length,
          selection: requestedEffort && exact ? requestedRepetitions ? "requested-reps-and-rir" : "requested-rir" : requestedRepetitions && repetitionMatches(set) ? "requested-reps" : generalSets.indexOf(set) === 0 ? "first-general" : "first-known-general" });
      }
    }
    observations.sort((a, b) => b.date.localeCompare(a.date));
    const contextMatches = row => !text(request.contextKey) || row.contextKey === request.contextKey;
    const isRegular = row => !row.trainingIntent || row.trainingIntent === "regular";
    const targetObservations = observations.filter(row => row.exerciseId === request.exerciseId && row.equipmentKey === request.equipmentKey && row.loadConvention === request.loadConvention
      && (!text(request.groupKey) || row.groupKey === request.groupKey));
    const allDirect = targetObservations.filter(isRegular);
    const direct = allDirect.filter(contextMatches);
    const recentDirect = direct.filter(row => dateNumber(row.date) >= asOf - 27 * DAY);
    const observedResult = (references, reason) => {
      const bounded = references.slice(0, 6), loads = bounded.map(row => row.loadKg);
      result.status = "recorded"; result.references = bounded; result.range = { minKg: Math.min(...loads), maxKg: Math.max(...loads), source: "observed-target" }; result.reasons.push(reason);
      result.referencePurpose = bounded.every(isRegular) ? "regular-baseline" : "nonregular-observation";
      if (bounded.some(row => row.contextKey === null || row.rir === null)) result.reasons.push("원문 중량은 활용하지만 순서·노력 수준이 미확인인 기록을 같은 수행 조건으로 확정하지 않았어요.");
      if (bounded.some(row => !contextMatches(row))) result.reasons.push("예정한 순서·선행 맥락과 같다고 확인된 기록은 아니에요. 해당 장비의 과거 관찰로만 표시했어요.");
      if (bounded.some(row => !effortMatches(row))) result.reasons.push("예정 반복·RIR과 다른 실제 기록이 포함되어 있어요. 표시한 관찰 범위를 새 반복·노력 수준의 처방으로 바꾸지 않았어요.");
      return result;
    };
    if (recentDirect.length) return observedResult(recentDirect.some(effortMatches) ? recentDirect.filter(effortMatches) : recentDirect,
      requestedRepetitions || requestedEffort ? "선택한 반복·RIR 조건에 맞는 실제 세트를 먼저 찾았어요. 조건에 맞는 세트가 없는 일지는 첫 일반 세트를 참고로 표시해요."
        : "최근 해당 장비에서 중량·반복이 확인된 앞쪽 일반 세트를 표시했어요. 나중의 최고 중량을 시작값으로 고르지는 않아요.");
    const recentOtherContext = allDirect.filter(row => dateNumber(row.date) >= asOf - 27 * DAY);
    if (recentOtherContext.length) return observedResult(recentOtherContext, "예정 맥락과 같은 기록이 없어 최근 해당 장비의 실제 원문을 대신 보여줘요. 조건 차이를 중량 치환으로 보정하지 않았어요.");
    const family = new Set(relatedExerciseIds(request.exerciseId));
    const sourceRequest = request.source;
    const transferable = observations.filter(row => isRegular(row) && row.generalSetPosition === 1);
    const sources = transferable.filter(row => family.has(row.exerciseId) && (row.exerciseId !== request.exerciseId || row.equipmentKey !== request.equipmentKey)
      && row.contextKey !== null && contextMatches(row) && row.rir !== null && dateNumber(row.date) >= asOf - 13 * DAY
      && effortMatches(row)
      && (!sourceRequest || row.exerciseId === sourceRequest.exerciseId && row.equipmentKey === sourceRequest.equipmentKey && row.loadConvention === sourceRequest.loadConvention && (!sourceRequest.loadRole || sourceRequest.loadRole === "external")));
    const knownPain = ["none", "mild", "stop"].includes(options.pain) ? options.pain : latestPain;
    const transferAllowed = text(request.contextKey) && !["mild", "stop"].includes(knownPain) && !["mild", "stop"].includes(options.recovery?.pain) && !["stop", "review", "watch"].includes(options.recovery?.status);
    for (const source of transferAllowed ? sources : []) {
      const history = transferable.filter(row => row.exerciseId === source.exerciseId && row.equipmentKey === source.equipmentKey && row.loadConvention === source.loadConvention && row.contextKey === source.contextKey && row.rir === source.rir && row.reps === source.reps);
      const targets = direct.filter(row => row.generalSetPosition === 1 && effortMatches(row) && row.contextKey === source.contextKey && row.rir === source.rir && row.reps === source.reps);
      const pairs = [], usedSources = new Set(), usedTargets = new Set(), allCandidates = [];
      for (const left of history) for (const right of targets) {
        const gap = Math.abs(dateNumber(left.date) - dateNumber(right.date)) / DAY;
        if (left.date !== right.date && gap <= 7) allCandidates.push({ source: left, target: right, gap });
      }
      allCandidates.sort((a, b) => a.gap - b.gap || b.source.date.localeCompare(a.source.date));
      for (const pair of allCandidates) if (!usedSources.has(pair.source.date) && !usedTargets.has(pair.target.date)) {
        pairs.push(pair); usedSources.add(pair.source.date); usedTargets.add(pair.target.date);
      }
      if (pairs.length < 3) continue;
      const sourceLoads = pairs.map(pair => pair.source.loadKg), targetLoads = pairs.map(pair => pair.target.loadKg), ratios = pairs.map(pair => pair.target.loadKg / pair.source.loadKg);
      const sourceSupport = { minKg: Math.min(...sourceLoads), maxKg: Math.max(...sourceLoads) }, targetSupport = { minKg: Math.min(...targetLoads), maxKg: Math.max(...targetLoads) };
      if (source.loadKg < sourceSupport.minKg || source.loadKg > sourceSupport.maxKg) continue;
      const low = Math.max(targetSupport.minKg, source.loadKg * Math.min(...ratios)), high = Math.min(targetSupport.maxKg, source.loadKg * Math.max(...ratios));
      if (!finite(low) || !finite(high) || low > high) continue;
      result.status = "personal-transfer"; result.range = { minKg: low, maxKg: high, source: "personal-observation-estimate" }; result.references = [source];
      result.transfer = { sourceExerciseId: source.exerciseId, sourceEquipmentKey: source.equipmentKey, pairCount: pairs.length, ratioRange: { min: Math.min(...ratios), max: Math.max(...ratios) }, sourceSupport, targetSupport,
        pairs: pairs.slice(0, 8).map(pair => ({ source: pair.source, target: pair.target })) };
      result.reasons.push("최근 대상 장비 기록이 없어, 같은 사람의 서로 다른 날·비슷한 시기·같은 기록 맥락과 반복/RIR에서 관찰한 관계를 잠정 시작 참고로 표시했어요. 새 실제 기록이 생기면 그 장비 기록이 우선이에요.");
      return result;
    }
    if (allDirect.length) return observedResult(direct.length ? direct : allDirect, "개인 치환 조건이 충분하지 않아 이전의 해당 장비 실제 기록을 표시했어요. 오래된 기록이며 현재 수행이나 권장 시작 중량으로 확정하지 않았어요.");
    if (targetObservations.length) return observedResult(targetObservations,
      "이 장비에는 디로드·연습·복귀·테스트 등 별도 목적으로 남긴 실제 기록만 있어요. 숫자는 참고할 수 있지만 평소 운동의 시작 기준으로 쓰지는 않아요.");
    if (!transferAllowed) result.reasons.push("예정 순서가 미확인이거나 통증·회복을 먼저 확인해야 하므로 개인 중량 치환은 만들지 않았어요.");
    result.reasons.push("대상 장비의 조건 맞는 일반 세트나 개인 치환 근거가 부족해 kg를 만들지 않았어요. 같은 동작의 구성·부위 맥락은 이어가고 첫 실제 세션에서 여유 있는 부하를 확인하세요.");
    result.references = observations.filter(row => family.has(row.exerciseId)).slice(0, 4);
    return result;
  }

  function point(occurrence) {
    if (!occurrence) return null;
    const candidates = occurrence.sets.filter(set => set.marker === null && Number.isInteger(set.reps) && set.reps > 0 && (set.loadKg === null || (finite(set.loadKg) && set.loadKg >= 0)));
    const workingCount = candidates.length;
    if (!candidates.length) candidates.push(...occurrence.sets.filter(set => set.marker?.toUpperCase() !== "W" && Number.isInteger(set.reps) && set.reps > 0));
    candidates.sort((a, b) => (b.loadKg ?? -1) - (a.loadKg ?? -1) || b.reps - a.reps);
    const set = candidates[0];
    return { sessionId: occurrence.sessionId, blockId: occurrence.id, date: occurrence.date, time: occurrence.time, rawName: occurrence.rawName, loadKg: set?.loadKg ?? null, reps: set?.reps ?? null, marker: set?.marker ?? null, rir: finite(set?.rir) ? set.rir : null, setCount: workingCount, equipmentKey: occurrence.equipmentKey, equipmentSource: occurrence.equipmentSource, loadConvention: occurrence.loadConvention, loadConventionSource: occurrence.loadConventionSource, ruleConflict: occurrence.ruleConflict, loadRole: occurrence.loadRole, context: occurrence.context || null, sourceKind: occurrence.sourceKind, trainingIntent: occurrence.trainingIntent || null, basis: "highest-recorded-load-then-reps" };
  }

  function compare(current, previous) {
    if (!previous) return { status: "insufficient", reason: "이 운동의 앞선 기록이 더 필요해요. 현재 세트는 관찰값으로 남겼어요." };
    if ([current, previous].some(row => row?.trainingIntent && row.trainingIntent !== "regular")) return { status: "incomparable", reason: "디로드·연습·복귀 등 별도 목적의 운동이에요. 의도한 부담 조절을 평소 수행 저하로 평가하지 않아요." };
    if (!current || !finite(current.reps) || !finite(previous.reps)) return { status: "incomparable", reason: "일반 세트의 반복 수가 확인되지 않아 수행 비교를 보류했어요." };
    if (current.marker !== null || previous.marker !== null) return { status: "incomparable", reason: "별도 문자가 표시된 세트라 일반 세트와 같은 조건으로 비교하지 않았어요. 표시와 숫자는 그대로 보존했어요." };
    if (current.date === previous.date) return { status: "incomparable", reason: "같은 날의 두 세션은 서로 보존했어요. 세션 순서·당일 피로 영향 때문에 장기 수행 변화로 판정하지 않아요." };
    if (!current.equipmentKey || !previous.equipmentKey || current.equipmentKey !== previous.equipmentKey) return { status: "incomparable", reason: "동일한 장비·머신인지 확인되지 않았어요. 장비별 표시 중량을 서로 환산하지 않아요." };
    if ([current, previous].some(row => row.equipmentSource?.startsWith("name-"))) return { status: "incomparable", reason: "운동명에서 읽은 장비명을 함께 표시했어요. 같은 브랜드의 같은 머신인지까지 확인된 것은 아니므로 숫자 변화만 관찰해요. 장비 연결을 한 번 확인하면 같은 이름의 기록에 재사용할 수 있어요." };
    if (!["total", "per-side"].includes(current.loadConvention) || current.loadConvention !== previous.loadConvention) return { status: "incomparable", reason: "중량의 한쪽·합산 기준이 확인되지 않았거나 달라요. 맨몸 운동의 실제 체중 부하도 추측하지 않아요." };
    if (current.sourceKind === "legacy-ocr" || previous.sourceKind === "legacy-ocr") return { status: "incomparable", reason: "기존 OCR 요약은 세부 판독이 검증되지 않아 기록 변화만 보여줘요." };
    if (!finite(current.rir) || !finite(previous.rir) || current.rir !== previous.rir) return { status: "incomparable", reason: "RIR이 비어 있거나 달라 같은 노력 수준인지 확인할 수 없어요. 기록 변화는 근력·근성장 판정이 아니에요." };
    if (!finite(current.loadKg) || !finite(previous.loadKg)) return { status: "incomparable", reason: "부하가 확인되지 않아 체중이나 0kg으로 대신 채우지 않았어요." };
    if (current.setCount !== previous.setCount) return { status: "incomparable", reason: "일반 세트 수가 달라 최고 기록 세트를 고르는 조건이 달라요. 세트 수와 대표세트 변화를 따로 확인해 주세요." };
    if (current.loadRole !== "external" || previous.loadRole !== "external") return { status: "incomparable", reason: "중량이 외부 저항인지 보조 중량인지 확인되지 않았어요. 숫자 증가를 수행 향상으로 판단하지 않았어요." };
    if (!current.context?.contextKey || !previous.context?.contextKey || current.context.contextKey !== previous.context.contextKey) return { status: "incomparable", reason: "실제 순서·일반 세트 구성·선행 운동 맥락이 확인되지 않았거나 달라요. 원문 변화는 표시하지만 당일 순서와 피로를 근력 저하·디로드 근거로 확정하지 않아요." };
    const load = current.loadKg - previous.loadKg, reps = current.reps - previous.reps;
    if (load !== 0 && reps !== 0) return { status: "mixed", reason: "중량과 반복 수가 함께 달라졌어요. 환산 최대중량이나 kg×반복으로 우열을 정하지 않았어요." };
    const change = load || reps;
    return { status: change > 0 ? "improved" : change < 0 ? "declined" : "stable", reason: `같은 장비·중량 기준·기록 RIR·세트 수에서 ${load ? "같은 반복 수의 중량" : "같은 중량의 반복 수"}이 ${change > 0 ? "늘었어요" : change < 0 ? "줄었어요" : "같아요"}. 동작 범위·휴식·기술까지 같다는 뜻이나 근성장 측정은 아니에요.` };
  }

  function checkinRows(input, date) {
    if (Array.isArray(input)) return input.map(row => ({ ...row?.coachCheckin, ...row }));
    if (!input || typeof input !== "object") return [];
    if (["energy", "hunger", "sleep", "performance", "pain", "illness", "fatigue", "sleepHours", "interruptionReason"].some(key => Object.hasOwn(input, key))) return [{ ...input, date: input.date || date }];
    return Object.entries(input).map(([key, value]) => ({ ...value?.coachCheckin, ...value, date: value?.date || key }));
  }

  function recoverySignals(row) {
    return [row.energy === "low" ? "낮은 컨디션" : null, row.sleep === "poor" ? "좋지 않은 수면" : null,
      finite(row.sleepHours) && row.sleepHours >= 0 && row.sleepHours < 6 ? "짧게 기록한 수면" : null,
      row.hunger === "high" ? "강한 허기" : null, row.performance === "down" ? "자기보고 수행 저하" : null,
      row.fatigue === "high" ? "높게 기록한 피로" : null,
      row.illness === "active" ? "현재 아픈 상태" : row.illness === "recovering" ? "질병 뒤 회복 중" : null].filter(Boolean);
  }

  function currentRecovery(checkins, date) {
    const rows = checkins.filter(row => row.date === date);
    const signals = [...new Set(rows.flatMap(recoverySignals))];
    const illness = rows.some(row => row.illness === "active") ? "active" : rows.some(row => row.illness === "recovering") ? "recovering"
      : rows.some(row => row.illness === "none") ? "none" : null;
    // These are coaching choices from today's report, not medical sleep or fatigue thresholds.
    const domains = [rows.some(row => row.energy === "low"), rows.some(row => row.sleep === "poor"
      || finite(row.sleepHours) && row.sleepHours >= 0 && row.sleepHours < 6), rows.some(row => row.performance === "down"),
      rows.some(row => row.hunger === "high")].filter(Boolean).length;
    const strong = illness === "active" || illness === "recovering" || rows.some(row => row.fatigue === "high") || domains >= 2;
    const positiveReport = rows.some(row => ["okay", "good"].includes(row.energy) && ["okay", "good"].includes(row.sleep)
      && ["low", "okay", "high"].includes(row.hunger)) && !signals.length;
    return { date, present: rows.length > 0, signals, strong, illness, positiveReport, source: "saved-checkin" };
  }

  function historyCoverageFor(rows, equipmentKey, conditionKey) {
    const count = entries => ({ records: new Set(entries.map(row => row.sessionId)).size, days: new Set(entries.map(row => row.date)).size });
    const exercise = count(rows), equipmentRows = rows.filter(row => row.equipmentKey === equipmentKey), conditionRows = rows.filter(row => row.conditionKey === conditionKey);
    const equipment = count(equipmentRows), condition = count(conditionRows), observations = count(conditionRows.filter(row => row.hasRecordedSets));
    const otherEquipment = count(rows.filter(row => row.equipmentKey !== equipmentKey)), otherCondition = count(rows.filter(row => row.conditionKey !== conditionKey));
    return { exerciseRecordCount: exercise.records, exerciseDayCount: exercise.days,
      equipmentRecordCount: equipment.records, equipmentDayCount: equipment.days,
      conditionRecordCount: condition.records, conditionDayCount: condition.days,
      conditionObservationRecordCount: observations.records, conditionObservationDayCount: observations.days,
      otherEquipmentRecordCount: otherEquipment.records, otherEquipmentDayCount: otherEquipment.days,
      otherConditionRecordCount: otherCondition.records, otherConditionDayCount: otherCondition.days,
      otherConditionGroupCount: new Set(rows.filter(row => row.conditionKey !== conditionKey).map(row => row.conditionKey)).size };
  }

  function buildCapacityHistory(records, mappings, date) {
    const input = Array.isArray(records) ? records : [], end = dateNumber(date);
    const result = { scope: "all-recorded-history", from: null, to: end === null ? null : date, samples: [], excludedRecords: 0 };
    if (end === null) { result.excludedRecords = input.length; return result; }
    const seen = new Map(), conflicts = new Set();
    for (const row of input) {
      const when = dateNumber(row?.date);
      if (!row || !text(row.id) || when === null || when > end || !Array.isArray(row.exercises)) continue;
      if (seen.has(row.id) && JSON.stringify(seen.get(row.id)) !== JSON.stringify(row)) conflicts.add(row.id);
      else if (!seen.has(row.id)) seen.set(row.id, row);
    }
    for (const id of conflicts) seen.delete(id);
    const accepted = distinctSourceRecords([...seen.values()]).records
      .slice().sort((a, b) => a.date.localeCompare(b.date) || text(a.time).localeCompare(text(b.time)) || a.id.localeCompare(b.id));
    result.excludedRecords = input.length - accepted.length;
    result.from = accepted[0]?.date || null;
    for (const row of accepted) for (const raw of row.exercises) {
      if (!raw || !text(raw.id) || !Array.isArray(raw.sets)) continue;
      const described = describeExercise(raw, mappings), seenSets = new Map(), conflictedSets = new Set();
      for (const rawSet of raw.sets) {
        if (!rawSet || typeof rawSet !== "object" || Array.isArray(rawSet)) continue;
        const set = { id: text(rawSet.id), loadKg: rawSet.loadKg === null || finite(rawSet.loadKg) && rawSet.loadKg >= 0 ? rawSet.loadKg : null,
          reps: Number.isInteger(rawSet.reps) && rawSet.reps > 0 ? rawSet.reps : null, marker: text(rawSet.marker) || null,
          rir: finite(rawSet.rir) && rawSet.rir >= 0 && rawSet.rir <= 10 ? rawSet.rir : null };
        if (set.id && seenSets.has(set.id)) {
          if (JSON.stringify(seenSets.get(set.id)) !== JSON.stringify(set)) conflictedSets.add(set.id);
        } else seenSets.set(set.id || Symbol(), set);
      }
      const sets = [...seenSets.values()].filter(set => !conflictedSets.has(set.id));
      const sample = { sessionId: row.id, blockId: text(raw.id), date: row.date, label: text(row.label), time: row.time || null, exerciseId: described.resolved?.id || null, rawName: text(raw.rawName),
        equipmentKey: described.equipmentKey, loadConvention: described.loadConvention, variantKey: described.variantKey, loadRole: described.loadRole,
        ruleConflict: described.ruleConflict, sets, trainingIntent: Object.hasOwn(intentLabels, row.trainingIntent) ? row.trainingIntent : null,
        pain: ["none", "mild", "stop"].includes(row.pain) ? row.pain : null, sourceKind: text(row.source?.kind) || "unknown" };
      const feedbackSet = sets.find(set => text(set.id) && set.id === raw.feedback?.setId && set.marker === null && set.reps !== null
        && set.loadKg === raw.feedback.loadKg && set.reps === raw.feedback.reps);
      if (feedbackSet && ["comfortable", "hard", "limit"].includes(raw.feedback.feeling)) sample.feedback = {
        setId: raw.feedback.setId, feeling: raw.feedback.feeling, loadKg: raw.feedback.loadKg, reps: raw.feedback.reps
      };
      if (raw.coachingAnswer && Store?.coachingAnswerMatches(raw)) sample.coachingAnswer = JSON.parse(JSON.stringify(raw.coachingAnswer));
      result.samples.push(sample);
    }
    return result;
  }

  function analyze(records = [], options = {}) {
    options = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const requested = dateNumber(options.date);
    const availableDates = (Array.isArray(records) ? records : []).map(row => dateNumber(row?.date)).filter(value => value !== null);
    const end = requested ?? (options.date === undefined && availableDates.length ? Math.max(...availableDates) : null);
    const start = end === null ? null : end - 27 * DAY;
    const windowEnd = end === null ? null : new Date(end).toISOString().slice(0, 10);
    const windowStart = start === null ? null : new Date(start).toISOString().slice(0, 10);
    const coverage = { recordCount: 0, trainingDates: [], daysWithRecords: 0, unknownDays: 28, workingSets: 0, warmupSets: 0, markedSets: 0, unknownEffortSets: 0, unresolvedExercises: 0, excludedRecords: 0, duplicateRecords: 0, invalidSets: 0, legacyOnlySessions: 0 };
    const muscles = Object.entries(muscleLabels).map(([id, label]) => ({ id, label, directSets: 0, indirectSets: 0, unknownEffortSets: 0, markedSets: 0 }));
    const muscleMap = new Map(muscles.map(row => [row.id, row]));
    const groups = new Map(), historyByExercise = new Map(), sessions = [], seen = new Map(), conflicted = new Set();
    const limitations = ["28일 기록의 세트 수이며 최적 볼륨·유효 세트·근성장률이 아니에요. 직접·간접 세트는 더해서 하나의 점수로 만들지 않아요.", "W는 준비 세트로 제외하고 D·A·기타 표시는 의미를 추정하지 않아 일반 세트와 별도로 남겨요.", "미기록 날짜는 휴식일이 아니며, 기록 RIR도 자기보고 추정이에요.", "부위 분류는 대표 동작의 제품 분류예요. 자세·가동범위·개인차와 실제 근육별 기여율을 측정하지 않아요."];
    if (end === null) limitations.push("기준 날짜가 없거나 잘못되어 기간 분석을 만들지 않았어요.");
    for (const row of Array.isArray(records) ? records : []) {
      const when = dateNumber(row?.date);
      if (!row || !text(row.id) || when === null || end === null || when < start || when > end || !Array.isArray(row.exercises)) { coverage.excludedRecords++; continue; }
      if (seen.has(row.id)) {
        if (JSON.stringify(seen.get(row.id)) === JSON.stringify(row)) coverage.duplicateRecords++;
        else conflicted.add(row.id);
      } else seen.set(row.id, row);
    }
    for (const id of conflicted) { seen.delete(id); coverage.excludedRecords += 2; }
    const uniqueSources = distinctSourceRecords([...seen.values()]);
    coverage.duplicateRecords += uniqueSources.duplicateRecords; coverage.excludedRecords += uniqueSources.conflictedRecords;
    const dateCounts = new Map();
    for (const row of uniqueSources.records) dateCounts.set(row.date, (dateCounts.get(row.date) || 0) + 1);
    for (const row of uniqueSources.records.sort((a, b) => a.date.localeCompare(b.date) || text(a.time).localeCompare(text(b.time)) || a.id.localeCompare(b.id))) {
      const summary = { id: row.id, date: row.date, time: row.time || null, label: text(row.label), durationMinutes: finite(row.durationMinutes) ? row.durationMinutes : null, pain: row.pain || null, effort: finite(row.effort) ? row.effort : null, trainingIntent: row.trainingIntent || null, sourceKind: row.source?.kind || "unknown", totalSets: 0, workingSets: 0, warmupSets: 0, markedSets: 0, unknownEffortSets: 0, unresolvedExercises: 0, exercises: [] };
      const suppliedContext = options.sessionContexts?.[row.id];
      const context = suppliedContext?.recordId === row.id && Array.isArray(suppliedContext.blocks) && row.exercises.every(raw => suppliedContext.blocks.some(block => block.blockId === raw?.id)) ? suppliedContext : sessionContext(row, options.mappings);
      const sameDaySessions = options.sessionRecordCounts?.[row.date] ?? dateCounts.get(row.date) ?? 1;
      summary.context = { ...context, sameDaySessions };
      if (summary.sourceKind === "legacy-ocr" && !row.exercises.length) coverage.legacyOnlySessions++;
      for (const raw of row.exercises) {
        if (!raw || !Array.isArray(raw.sets)) { coverage.invalidSets++; continue; }
        const described = describeExercise(raw, options.mappings), resolved = described.resolved;
        const block = context.blocks.find(item => item.blockId === raw.id);
        const blockContext = block ? { ...block, contextKey: sameDaySessions === 1 ? block.contextKey : null, sameDaySessions, orderConfirmed: context.orderConfirmed, structure: context.structure } : null;
        const ex = { id: text(raw.id), rawName: text(raw.rawName), exerciseId: resolved?.id || null, label: resolved?.label || text(raw.rawName) || "이름 미확인", equipmentKey: described.equipmentKey, equipmentSource: described.equipmentSource, variantKey: described.variantKey, loadConvention: described.loadConvention, loadConventionSource: described.loadConventionSource, ruleConflict: described.ruleConflict, loadRole: described.loadRole, context: blockContext, sets: [], workingSets: 0, markedSets: 0 };
        if (finite(raw.durationMinutes) && raw.durationMinutes > 0) ex.durationMinutes = raw.durationMinutes;
        if (!resolved) { summary.unresolvedExercises++; coverage.unresolvedExercises++; }
        const setIds = new Set();
        for (const rawSet of raw.sets) {
          if (!rawSet || (text(rawSet.id) && setIds.has(rawSet.id))) { coverage.invalidSets++; continue; }
          if (text(rawSet.id)) setIds.add(rawSet.id);
          const set = { id: text(rawSet.id), loadKg: rawSet.loadKg === null || (finite(rawSet.loadKg) && rawSet.loadKg >= 0) ? rawSet.loadKg : null, reps: Number.isInteger(rawSet.reps) && rawSet.reps > 0 ? rawSet.reps : null, marker: text(rawSet.marker) || null, rir: finite(rawSet.rir) && rawSet.rir >= 0 && rawSet.rir <= 10 ? rawSet.rir : null };
          ex.sets.push(set);
          if (set.reps === null) { coverage.invalidSets++; continue; }
          summary.totalSets++;
          if (set.marker?.toUpperCase() === "W") { summary.warmupSets++; coverage.warmupSets++; continue; }
          const marked = set.marker !== null;
          if (marked) { ex.markedSets++; summary.markedSets++; coverage.markedSets++; }
          else { ex.workingSets++; summary.workingSets++; coverage.workingSets++; }
          if (set.rir === null) { summary.unknownEffortSets++; coverage.unknownEffortSets++; }
          if (resolved) {
            for (const [field, ids] of [["directSets", resolved.primaryMuscles], ["indirectSets", resolved.secondaryMuscles]]) for (const id of ids) {
              const muscle = muscleMap.get(id);
              if (marked) muscle.markedSets++;
              else muscle[field]++;
              if (set.rir === null) muscle.unknownEffortSets++;
            }
          }
        }
        const feedbackSet = ex.sets.find(set => set.id === raw.feedback?.setId && set.marker === null && set.loadKg === raw.feedback.loadKg && set.reps === raw.feedback.reps);
        if (feedbackSet && ["comfortable", "hard", "limit"].includes(raw.feedback.feeling)) ex.feedback = { ...raw.feedback };
        if (raw.coachingAnswer && Store?.coachingAnswerMatches(raw)) ex.coachingAnswer = JSON.parse(JSON.stringify(raw.coachingAnswer));
        summary.exercises.push(ex);
        const identity = resolved?.id || `unresolved:${normalize(raw.rawName)}`;
        const equipmentGroupKey = JSON.stringify([identity, ex.equipmentKey || "unconfirmed:" + normalize(raw.rawName), ex.loadConvention, ex.variantKey, ex.loadRole]);
        const key = JSON.stringify([identity, ex.equipmentKey || "unconfirmed:" + normalize(raw.rawName), ex.loadConvention, ex.variantKey, ex.loadRole, block?.contextKey || `unknown-position:${block?.displayPosition || 0}`]);
        if (!historyByExercise.has(identity)) historyByExercise.set(identity, []);
        // Presence counts include empty exercise blocks; only blocks with sets enter the existing comparison group.
        historyByExercise.get(identity).push({ sessionId: summary.id, date: row.date, equipmentKey: equipmentGroupKey, conditionKey: key, hasRecordedSets: ex.sets.length > 0 });
        if (ex.sets.length) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ ...ex, sets: [...ex.sets], sessionId: summary.id, date: row.date, time: row.time || null, sourceKind: summary.sourceKind, trainingIntent: summary.trainingIntent });
        }
      }
      sessions.push(summary);
    }
    coverage.recordCount = sessions.length;
    coverage.trainingDates = [...new Set(sessions.map(row => row.date))];
    coverage.daysWithRecords = coverage.trainingDates.length;
    coverage.unknownDays = 28 - coverage.daysWithRecords;
    let repeatedDeclines = 0;
    const progression = [];
    const formatPoint = value => !value || value.reps === null ? "반복 미확인" : `${value.loadKg === null ? "부하 미확인" : value.loadKg + "kg"} × ${value.reps}회`;
    for (const [key, occurrences] of groups) {
      const latest = occurrences.at(-1), regular = !latest.trainingIntent || latest.trainingIntent === "regular";
      const recent = (regular ? occurrences.filter(row => !row.trainingIntent || row.trainingIntent === "regular") : occurrences).slice(-3).map(point);
      const current = recent.at(-1), previous = recent.at(-2) || null;
      const judgment = occurrences.at(-1).exerciseId === null ? { status: "incomparable", reason: "운동 이름 대응이 확인되지 않았어요. 원문 기록을 남기고 확인 후 비교해요." } : compare(current, previous);
      const parts = JSON.parse(key), historyCoverage = historyCoverageFor(historyByExercise.get(parts[0]) || [], JSON.stringify(parts.slice(0, -1)), key);
      if (judgment.status === "insufficient" && historyCoverage.otherConditionGroupCount && historyCoverage.exerciseRecordCount > 1) {
        judgment.reason = `같은 종목은 ${historyCoverage.exerciseDayCount}일·${historyCoverage.exerciseRecordCount}개 일지에 있지만, 이 장비·중량 표기·수행 순서 조건에서 세트가 있는 기록은 ${historyCoverage.conditionObservationRecordCount}회라 앞뒤 비교를 보류했어요. 다른 조건의 기록도 따로 보존했어요.`;
      } else if (judgment.status === "insufficient" && historyCoverage.conditionRecordCount > historyCoverage.conditionObservationRecordCount) {
        judgment.reason = `같은 조건의 일지는 ${historyCoverage.conditionRecordCount}회지만 원문 세트가 남아 있는 기록은 ${historyCoverage.conditionObservationRecordCount}회예요. 앞선 세트가 없어 비교를 보류했으며, 빈 운동 기록도 삭제하지 않았어요.`;
      }
      let repeated = false;
      if (recent.length === 3 && new Set(recent.map(row => row.date)).size === 3 && dateNumber(current.date) >= end - 13 * DAY) repeated = compare(recent[1], recent[0]).status === "declined" && compare(recent[2], recent[1]).status === "declined";
      if (repeated) repeatedDeclines++;
      progression.push({ exerciseId: occurrences.at(-1).exerciseId, label: occurrences.at(-1).label, equipmentKey: current.equipmentKey, current, previous, ...judgment, historyCoverage, repeatedDecline: repeated, observed: { current, previous, description: `${previous ? formatPoint(previous) + " → " : "현재 기록 "}${formatPoint(current)}. 표시된 세트의 관찰값이며 근성장률이 아니에요.` } });
    }
    const allCheckins = checkinRows(options.checkins, windowEnd).filter(row => { const n = dateNumber(row.date); return n !== null && end !== null && n <= end; });
    const checkins = allCheckins.filter(row => dateNumber(row.date) >= end - 6 * DAY);
    const painReports = [...seen.values(), ...checkins].filter(row => ["none", "mild", "stop"].includes(row.pain)).sort((a, b) => a.date.localeCompare(b.date) || ({ none: 0, mild: 1, stop: 2 }[a.pain] - { none: 0, mild: 1, stop: 2 }[b.pain]));
    const pain = painReports.at(-1)?.pain || null;
    const current = currentRecovery(checkins, windowEnd);
    // A good general check-in does not resolve a separately reported illness or pain field.
    const healthReports = ["illness", "pain"].map(field => {
      const allowed = field === "illness" ? ["none", "recovering", "active"] : ["none", "mild", "stop"];
      const reports = [...allCheckins, ...(field === "pain" ? uniqueSources.records : [])]
        .filter(row => allowed.includes(row[field])).sort((a, b) => a.date.localeCompare(b.date) || allowed.indexOf(a[field]) - allowed.indexOf(b[field]));
      const latest = reports.at(-1);
      return latest && latest[field] !== "none" ? { field, date: latest.date, value: latest[field] } : null;
    }).filter(Boolean);
    const unresolvedHealthReports = healthReports.filter(row => row.date < windowEnd);
    const historicalSignalRows = checkins.filter(row => row.date < windowEnd && recoverySignals(row).length)
      .map(row => ({ date: row.date, signals: recoverySignals(row), source: "saved-checkin" }));
    const selfReportSignals = [...new Set(checkins.flatMap(recoverySignals))];
    const activeReportSignals = current.positiveReport ? [] : selfReportSignals;
    const clinical = options.profile?.healthContext && options.profile.healthContext !== "general";
    const outOfAge = finite(options.profile?.age) && (options.profile.age < 18 || options.profile.age > 80);
    const recovery = { status: "insufficient", pain, reasons: [], questions: [], repeatedDeclines, selfReportSignals, current, historicalSignalRows, healthReports, unresolvedHealthReports, deloadCandidate: false };
    if (pain === "stop") { recovery.status = "stop"; recovery.reasons.push("중단이 필요한 통증을 기록했어요. 통증을 유발하는 운동은 멈추고 전문가 평가를 우선해 주세요."); }
    else if (pain === "mild" || clinical || outOfAge) { recovery.status = "review"; recovery.reasons.push(pain === "mild" ? "통증 기록이 있어 자동 운동량 증가보다 현재 증상 확인과 개별 평가가 먼저예요." : "이 일반 성인용 계획의 지원 범위 밖이에요. 개인에게 맞는 전문가 계획을 우선해 주세요."); }
    else if (repeatedDeclines && activeReportSignals.length) { recovery.status = "review"; recovery.deloadCandidate = true; recovery.reasons.push("서로 다른 3일의 비교 가능한 기록에서 수행이 두 번 줄었고 회복 신호도 있어요. 피로 원인을 확인하고 훈련 스트레스를 잠시 낮추는 방안을 검토해 주세요. 디로드가 반드시 필요하다는 진단은 아니에요."); }
    else if (unresolvedHealthReports.length) { recovery.status = "watch"; recovery.reasons.push(`${unresolvedHealthReports.map(row => row.date + "에 알려 준 " + (row.field === "illness" ? row.value === "active" ? "아픈 상태" : "질병 뒤 회복 상태" : "통증 상태")).join("·")}가 지금도 이어지는지는 새로 확인되지 않았어요. 오늘 컨디션이 좋아도 그 상태가 끝났다고 대신 판단하지 않아요.`); }
    else if (activeReportSignals.length || repeatedDeclines || progression.some(row => row.status === "declined")) { recovery.status = "watch"; recovery.reasons.push(current.strong ? "오늘 아프거나 회복 신호가 겹쳤다고 남겼어요. 이번 수행을 기준으로 몸 상태부터 확인하고, 더 늘리는 선택은 회복 뒤로 미뤄요." : "일부 기록이나 자기보고 변화가 있어요. 한 번의 저하만으로 디로드·과훈련을 단정하거나 식사를 줄이지 않아요."); }
    else if (checkins.some(row => ["low", "okay", "good"].includes(row.energy) && ["low", "okay", "high"].includes(row.hunger) && ["poor", "okay", "good"].includes(row.sleep)) && sessions.length) { recovery.status = "okay"; recovery.reasons.push("현재 확인된 기록에는 별도 경고 신호가 없어요. 회복이나 건강이 검증됐다는 뜻은 아니에요."); }
    else recovery.reasons.push("회복을 평가할 기록이 충분하지 않아요. 기록이 없다고 쉬었거나 잘 회복했다고 보지 않아요.");
    if (!checkins.length || recovery.status === "insufficient") recovery.questions.push("최근 수면·허기·컨디션은 어땠나요?");
    if (pain === null || pain !== "none") recovery.questions.push("현재 통증이 있나요? 움직임 중 어느 동작에서 나타나는지 전문가에게 알려 주세요.");
    if (recovery.status !== "okay") recovery.questions.push("장비·중량 기준·동작 범위·휴식과 RIR이 이전 기록과 같았나요?");
    if (coverage.unresolvedExercises) limitations.push("이름을 확인하지 못한 운동은 원문과 세트를 보존했지만 부위별 수치에는 임의 배분하지 않았어요.");
    if (coverage.legacyOnlySessions) limitations.push("세부 운동이 없는 과거 OCR 요약의 전체 세트 수를 부위별 세트로 나누지 않았어요.");
    if (conflicted.size) limitations.push("같은 기록 ID에 서로 다른 내용이 있어 충돌한 기록은 집계에서 제외했어요.");
    if (uniqueSources.conflictedRecords) limitations.push("같은 이미지 관찰의 장비·수행 순서 해석이 서로 달라 충돌한 기록은 집계에서 제외했어요.");
    return { version: VERSION, windowStart, windowEnd, coverage, muscles, sessions, lastSession: sessions.at(-1) || null, progression, recovery, limitations,
      ...(options.includeCapacityHistory === true ? { capacityHistory: buildCapacityHistory(records, options.mappings, windowEnd) } : {}) };
  }

  function getReviewPreferences(preferences) {
    const value = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    const validKey = key => typeof key === "string" && key.length <= 6000 && !/[\u0000-\u001f]/.test(key)
      && (key.startsWith("exercise:") && text(key.slice(9)) === key.slice(9) && key.length > 9 && key.length <= 137
        || key.startsWith("raw:") && key.length > 4 && normalize(key.slice(4)) === key.slice(4));
    return { order: value.order === "diary" ? "diary" : "priority", mainExerciseKeys: [...new Set((Array.isArray(value.mainExerciseKeys) ? value.mainExerciseKeys : []).filter(validKey))].slice(0, 500) };
  }

  function reviewSession(analysis, options = {}) {
    options = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const preferences = getReviewPreferences(options.preferences), order = preferences.order;
    const sessions = (Array.isArray(analysis?.sessions) ? analysis.sessions : []).filter(row => row && text(row.id) && dateNumber(row.date) !== null && Array.isArray(row.exercises))
      .slice().sort((a, b) => a.date.localeCompare(b.date) || text(a.time).localeCompare(text(b.time)) || a.id.localeCompare(b.id));
    const requestedId = text(options.sessionId);
    const lastIndex = sessions.findIndex(row => row.id === analysis?.lastSession?.id);
    const selectedIndex = requestedId ? sessions.findIndex(row => row.id === requestedId)
      : lastIndex >= 0 ? lastIndex : sessions.length - 1;
    if (selectedIndex < 0) return { session: null, rows: [], order, windowStart: null, windowEnd: null, limitations: [] };
    const selected = sessions[selectedIndex], end = dateNumber(selected.date), desiredStart = end - 27 * DAY;
    const sourceStart = dateNumber(analysis?.windowStart), start = Math.max(desiredStart, sourceStart ?? desiredStart);
    const windowStart = new Date(start).toISOString().slice(0, 10), windowEnd = selected.date;
    const limitations = sourceStart !== null && sourceStart > desiredStart ? ["선택한 일지 이전 28일 전체가 현재 분석에 포함되어 있지 않아요. 표시한 조회 기간 안의 기록만 비교했어요."] : [];
    const groups = new Map(), historyByExercise = new Map(), descriptors = new Map();
    const rawMainIdentities = new Map(preferences.mainExerciseKeys.filter(key => key.startsWith("raw:")).map(key => [key, new Set()]));
    // Build once at the selected-session cutoff; sorting the review never changes actual block context.
    for (const session of sessions.slice(0, selectedIndex + 1)) {
      if (dateNumber(session.date) < start) continue;
      const blocks = new Map((session.context?.blocks || []).map(block => [block.blockId, block]));
      for (const ex of session.exercises) {
        if (rawMainIdentities.size && ex.exerciseId) rawMainIdentities.get("raw:" + normalize(ex.rawName))?.add(ex.exerciseId);
        const identity = ex.exerciseId || `unresolved:${normalize(ex.rawName)}`;
        const base = [identity, ex.equipmentKey || "unconfirmed:" + normalize(ex.rawName), ex.loadConvention, ex.variantKey, ex.loadRole];
        const block = blocks.get(ex.id), equipmentKey = JSON.stringify(base), conditionKey = JSON.stringify([...base, block?.contextKey || `unknown-position:${block?.displayPosition || 0}`]);
        const descriptor = { identity, equipmentKey, conditionKey };
        if (session.id === selected.id) descriptors.set(ex, descriptor);
        if (!historyByExercise.has(identity)) historyByExercise.set(identity, []);
        historyByExercise.get(identity).push({ sessionId: session.id, date: session.date, equipmentKey, conditionKey, hasRecordedSets: ex.sets.length > 0 });
        if (!ex.sets.length) continue;
        if (!groups.has(conditionKey)) groups.set(conditionKey, []);
        groups.get(conditionKey).push({ ...ex, sessionId: session.id, date: session.date, time: session.time || null, sourceKind: session.sourceKind, trainingIntent: session.trainingIntent });
      }
    }
    const priorityMuscles = new Set(Array.isArray(options.priorityMuscles) ? options.priorityMuscles : []);
    const mains = new Map(preferences.mainExerciseKeys.map((key, index) => [key, index]));
    const resolvedMainAliases = new Map();
    for (const [key, identities] of rawMainIdentities) if (identities.size === 1) {
      const id = [...identities][0];
      if (!resolvedMainAliases.has(id)) resolvedMainAliases.set(id, []);
      resolvedMainAliases.get(id).push(key);
    }
    const compound = new Set(["horizontal-push", "vertical-push", "horizontal-pull", "vertical-pull", "squat", "hinge", "lunge"]);
    const priorByGroup = new Map(), coverageByGroup = new Map();
    const formatPoint = value => !value || value.reps === null ? "반복 미확인" : `${value.loadKg === null ? "부하 미확인" : value.loadKg + "kg"} × ${value.reps}회`;
    const rows = selected.exercises.map((ex, index) => {
      const exerciseKey = ex.exerciseId ? "exercise:" + ex.exerciseId : "raw:" + normalize(ex.rawName), rawKey = "raw:" + normalize(ex.rawName);
      const mainKeys = [...new Set([exerciseKey, rawKey, ...(resolvedMainAliases.get(ex.exerciseId) || [])])].filter(key => mains.has(key)).sort((a, b) => mains.get(a) - mains.get(b));
      const mainKey = mainKeys[0] || null, resolved = byId.get(ex.exerciseId);
      const focus = resolved?.primaryMuscles.filter(id => priorityMuscles.has(id)) || [];
      const priorityKind = mainKey ? "main" : focus.length ? "focus" : compound.has(resolved?.pattern) ? "suggested" : "other";
      const priorityReason = mainKey ? "사용자가 메인 운동으로 지정한 순서예요. 실제 수행 순서나 성장 우열은 바꾸지 않아요."
        : focus.length ? `설정한 우선 부위 ${focus.map(id => muscleLabels[id]).join("·")}에 직접 해당하는 운동을 먼저 표시했어요. 실제 자극 기여율을 측정한 것은 아니에요.`
          : priorityKind === "suggested" ? "확인된 복합 동작을 먼저 표시하는 화면 배치 기준이에요. 개인의 최적 운동 순서가 아니에요." : "메인·우선 부위·복합 동작 기준에 해당하지 않아 일지 순서를 유지했어요.";
      let progression = null;
      if (ex.sets.length) {
        const descriptor = descriptors.get(ex), key = descriptor.conditionKey;
        if (!priorByGroup.has(key)) {
          const priorSessions = new Map();
          for (const occurrence of groups.get(key) || []) if (occurrence.sessionId !== selected.id && (selected.trainingIntent && selected.trainingIntent !== "regular" || !occurrence.trainingIntent || occurrence.trainingIntent === "regular")) priorSessions.set(occurrence.sessionId, occurrence);
          priorByGroup.set(key, [...priorSessions.values()].slice(-2).map(point));
        }
        const prior = priorByGroup.get(key), current = point({ ...ex, sessionId: selected.id, date: selected.date, time: selected.time || null, sourceKind: selected.sourceKind, trainingIntent: selected.trainingIntent }), previous = prior.at(-1) || null;
        const judgment = ex.exerciseId === null ? { status: "incomparable", reason: "운동 이름 대응이 확인되지 않았어요. 원문 기록을 남기고 확인 후 비교해요." } : compare(current, previous);
        if (!coverageByGroup.has(key)) coverageByGroup.set(key, historyCoverageFor(historyByExercise.get(descriptor.identity) || [], descriptor.equipmentKey, key));
        const historyCoverage = coverageByGroup.get(key);
        if (judgment.status === "insufficient" && historyCoverage.otherConditionGroupCount && historyCoverage.exerciseRecordCount > 1) {
          judgment.reason = `같은 종목은 ${historyCoverage.exerciseDayCount}일·${historyCoverage.exerciseRecordCount}개 일지에 있지만, 이 장비·중량 표기·수행 순서 조건에서 세트가 있는 기록은 ${historyCoverage.conditionObservationRecordCount}회라 앞뒤 비교를 보류했어요. 다른 조건의 기록도 따로 보존했어요.`;
        } else if (judgment.status === "insufficient" && historyCoverage.conditionRecordCount > historyCoverage.conditionObservationRecordCount) {
          judgment.reason = `같은 조건의 일지는 ${historyCoverage.conditionRecordCount}회지만 원문 세트가 남아 있는 기록은 ${historyCoverage.conditionObservationRecordCount}회예요. 앞선 세트가 없어 비교를 보류했으며, 빈 운동 기록도 삭제하지 않았어요.`;
        }
        const recent = [...prior, current], repeatedDecline = recent.length === 3 && new Set(recent.map(row => row.date)).size === 3 && compare(recent[1], recent[0]).status === "declined" && compare(recent[2], recent[1]).status === "declined";
        progression = { exerciseId: ex.exerciseId, label: ex.label, equipmentKey: current.equipmentKey, current, previous, ...judgment, historyCoverage, repeatedDecline,
          observed: { current, previous, description: `${previous ? formatPoint(previous) + " → " : "현재 기록 "}${formatPoint(current)}. 표시된 세트의 관찰값이며 근성장률이 아니에요.` } };
      }
      return { key: JSON.stringify([selected.id, ex.id]), exerciseKey, mainKey, mainKeys, blockId: ex.id, diaryPosition: index + 1, label: ex.label, rawName: ex.rawName,
        equipmentKey: ex.equipmentKey, loadConvention: ex.loadConvention, sets: ex.sets, priorityKind, priorityReason, progression };
    });
    if (order === "priority") {
      const ranks = { main: 0, focus: 1, suggested: 2, other: 3 };
      rows.sort((a, b) => ranks[a.priorityKind] - ranks[b.priorityKind] || (a.priorityKind === "main" ? mains.get(a.mainKey) - mains.get(b.mainKey) : 0) || a.diaryPosition - b.diaryPosition);
    }
    return JSON.parse(JSON.stringify({ session: selected, rows, order, windowStart, windowEnd, limitations }));
  }

  const intentLabels = Object.freeze({ regular: "평소 운동", deload: "디로드", light: "가벼운 운동", technique: "기술 연습", "time-limited": "시간이 부족한 운동", return: "복귀 운동", test: "수행 테스트" });

  function recordedSetStructure(ex) {
    const sets = ex.sets.filter(set => set.marker === null && Number.isInteger(set.reps) && set.reps > 0);
    const segments = [];
    for (const set of sets) {
      let segment = segments.at(-1);
      if (!segment || segment.loadKg !== set.loadKg) {
        segment = { kind: "work", loadKg: set.loadKg, setIds: [], reps: [] };
        segments.push(segment);
      }
      segment.setIds.push(set.id); segment.reps.push(set.reps);
    }
    const first = sets[0], tail = sets.slice(segments[0]?.setIds.length || 0);
    const knownLoadedMovement = ["barbell", "dumbbell", "machine", "cable", "band"].includes(byId.get(ex.exerciseId)?.equipment) && !["pull_up", "chin_up", "dip", "assisted_pull_up", "assisted_dip"].includes(ex.exerciseId);
    const loaded = !ex.ruleConflict && (ex.loadRole === "external" || ex.loadRole === "unknown" && knownLoadedMovement) && finite(first?.loadKg) && first.loadKg > 0 && sets.every(set => finite(set.loadKg));
    const topBackoff = loaded && tail.length >= 1 && tail.every(set => set.loadKg > 0 && set.loadKg < first.loadKg && set.reps >= Math.max(...segments[0].reps));
    const ascending = loaded && segments.length > 1 && sets.every((set, index) => !index || set.loadKg >= sets[index - 1].loadKg);
    const kind = !sets.length ? "empty" : segments.length === 1 ? "straight" : topBackoff ? "top-backoff-candidate" : ascending ? "ramp" : "mixed";
    if (topBackoff) { segments[0].kind = "heavy-lead"; segments.slice(1).forEach(segment => { segment.kind = "lower-load"; }); }
    const format = segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`;
    const summary = kind === "top-backoff-candidate" ? `${format(segments[0])}와 ${segments.slice(1).map(format).join(" / ")}로, 무거운 세트와 중량을 낮춘 세트를 나눴어요.`
      : kind === "ramp" ? `${segments.map(format).join(" / ")}처럼 중량을 올려가는 구성이에요.`
        : kind === "straight" ? `${format(segments[0])}, ${sets.length}세트를 했어요.`
          : kind === "mixed" ? `${segments.slice(0, 5).map(format).join(" / ")}${segments.length > 5 ? " 외" : ""}, ${sets.length}세트를 했어요.`
            : ex.sets.length ? `원문 세트 ${ex.sets.length}개: ${ex.sets.filter(set => Number.isInteger(set.reps) && set.reps > 0).slice(0, 5).map(set => `${set.marker || "일반"} ${format({ loadKg: set.loadKg, reps: [set.reps] })}`).join(" / ") || "반복 추가 가능"}.` : "운동 이름이 기록되어 있어요.";
    return { kind, summary, segments };
  }

  function coachingComparison(ex, reference, referenceStatus) {
    const structure = recordedSetStructure(ex), prior = reference ? recordedSetStructure(reference.ex) : null;
    const durationMinutes = finite(ex.durationMinutes) && ex.durationMinutes > 0 ? ex.durationMinutes : null;
    const timeOnly = durationMinutes !== null && !ex.sets.length;
    if (!structure.segments.length || prior && !prior.segments.length) referenceStatus = "raw-only";
    if (timeOnly) referenceStatus = "time-only";
    const comparisons = [], observations = [];
    const format = segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`;
    if (prior) {
      const currentLoads = new Set(structure.segments.map(segment => segment.loadKg));
      for (const load of currentLoads) {
        const now = structure.segments.filter(segment => segment.loadKg === load), before = prior.segments.filter(segment => segment.loadKg === load);
        if (!before.length) continue;
        const currentReps = now.flatMap(segment => segment.reps), previousReps = before.flatMap(segment => segment.reps);
        const sameRole = structure.kind === prior.kind && now.length === before.length && now.every((segment, index) => segment.kind === before[index].kind);
        const label = load === null ? "반복 기록" : `${load}kg 구간`;
        comparisons.push({ label, current: format({ loadKg: load, reps: currentReps }), previous: format({ loadKg: load, reps: previousReps }), date: reference.session.date, sameRole, setIds: now.flatMap(segment => segment.setIds), previousSetIds: before.flatMap(segment => segment.setIds) });
        observations.push(currentReps.length === 1 && previousReps.length === 1 && sameRole
          ? `${structure.kind === "straight" ? "첫 일반 세트는" : label + "의 기록은"} ${reference.session.date}의 ${previousReps[0]}회에서 ${currentReps[0]}회로 ${currentReps[0] > previousReps[0] ? "늘었어요" : currentReps[0] < previousReps[0] ? "줄었어요" : "같아요"}${load === null ? "" : ` (${load}kg)`}.`
          : `${label}: ${reference.session.date}의 ${previousReps.join("·")}회 (${previousReps.length}세트) → 이번 ${currentReps.join("·")}회 (${currentReps.length}세트).${sameRole ? "" : " 이번에는 세트 구성도 바뀌었어요."}`);
      }
      if (!comparisons.length && structure.segments.length && prior.segments.length) {
        comparisons.push({ label: "중량 구성이 달라진 기록", current: structure.segments.map(format).join(" / "), previous: prior.segments.map(format).join(" / "), date: reference.session.date, sameRole: false, setIds: [], previousSetIds: [] });
        observations.push(`${reference.session.date}와 중량·반복 구성이 달라졌어요. 이번 구성부터 재현하고, 같은 중량 구간이 쌓이면 반복 변화를 이어서 볼게요.`);
      }
    }
    const context = [];
    if (durationMinutes !== null && !timeOnly) context.push({ label: "기록한 운동 시간", value: `${ex.date} · ${durationMinutes}분` });
    if (reference) {
      const days = Math.round((dateNumber(ex.date || reference.session.date) - dateNumber(reference.session.date)) / DAY);
      if (days > 0) context.push({ label: "기록 간격", value: `${days}일` });
      const matched = !!ex.context?.contextKey && ex.context.contextKey === reference.ex.context?.contextKey;
      context.push({ label: "수행 배치", value: matched ? "기록된 선행 구성 일치" : ex.context?.executionPosition && reference.ex.context?.executionPosition ? `순차 수행 ${reference.ex.context.executionPosition}번째 → ${ex.context.executionPosition}번째 · 선행 구성 달라짐` : "일지 표시 순서만 확인됨" });
      const sets = ex.sets.filter(set => !set.marker && set.reps > 0), old = reference.ex.sets.filter(set => !set.marker && set.reps > 0);
      const allRir = sets.length && old.length && [...sets, ...old].every(set => finite(set.rir));
      if (sets.length && old.length) context.push({ label: "노력 기록", value: allRir ? `RIR 이전 ${old.map(set => set.rir).join("·")} / 이번 ${sets.map(set => set.rir).join("·")}` : "반복·중량으로 다음 시도 제안 · 세트 느낌은 선택" });
    }
    if (ex.loadRole === "assistance") context.push({ label: "kg 의미", value: "보조 중량 · 적게 도와줄수록 어려울 수 있음" });
    if (ex.ruleConflict) context.push({ label: "표기 확인", value: "이름 단서와 지정값 충돌 · 운동·장비 수정에서 확인" });
    const summaries = { first: "이번 실제 세트가 다음 운동의 기준이에요.", "other-device": "다른 장비 기록은 따로 두고, 이 장비의 실제 수행에서 시작해요.", ambiguous: "같은 장비의 반복 블록은 각각 유지해요. 이번 각 블록에서 다음 수행을 이어가요.", "purpose-only": "앞선 기록은 다른 목적으로 남겼어요. 이번 평소 구성을 기준으로 이어가요.", "raw-only": ex.sets.length ? `이번 ${ex.sets.length}개 세트의 원문 표기와 입력한 숫자를 그대로 살펴봤어요.` : "이번에 남긴 운동 기록에서 이어가요.", "time-only": `${ex.date}의 ${durationMinutes}분 기록을 기준으로 이어가요.`, matched: "같은 운동·장비 표기의 세트 구간을 연결했어요." };
    return { structure, observations, evidence: { title: timeOnly ? "기록한 운동 시간" : "이번 기록과 이전 기록", summary: summaries[referenceStatus], comparisons, context, referenceStatus } };
  }

  // Record coaching uses a broader history than the strict, effort-matched performance judgment.
  function coachSession(analysis, options = {}) {
    options = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const review = reviewSession(analysis, options), session = review.session;
    if (!session) return { ...review, sessionCoaching: null };
    const intent = Object.hasOwn(intentLabels, session.trainingIntent) ? session.trainingIntent : "unknown";
    const general = ex => ex.sets.filter(set => set.marker === null && Number.isInteger(set.reps) && set.reps > 0);
    const key = ex => JSON.stringify([ex.exerciseId || "raw:" + normalize(ex.rawName), ex.equipmentKey || "raw:" + normalize(ex.rawName), ex.loadConvention, ex.variantKey, ex.loadRole]);
    const capacitySamples = analysis.capacityHistory?.samples || (analysis.sessions || []).flatMap(old => old.exercises.map(ex => ({ ...ex, sessionId: old.id, blockId: ex.id, date: old.date, trainingIntent: old.trainingIntent, pain: old.pain, sourceKind: old.sourceKind })));
    const format = set => set.loadKg === null ? `${set.reps}회` : `${set.loadKg}kg × ${set.reps}회`;
    const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
    const currentCounts = new Map(), histories = new Map();
    for (const ex of session.exercises) currentCounts.set(key(ex), (currentCounts.get(key(ex)) || 0) + 1);
    const sessions = (analysis.sessions || []).filter(row => row.date >= review.windowStart && row.date < session.date).slice().sort((a, b) => a.date.localeCompare(b.date) || text(a.time).localeCompare(text(b.time)) || a.id.localeCompare(b.id));
    for (const old of sessions) for (const ex of old.exercises) {
      const identity = key(ex);
      if (!histories.has(identity)) histories.set(identity, []);
      histories.get(identity).push({ session: old, ex });
    }
    const references = new Map(), referenceStatuses = new Map();
    for (const ex of session.exercises) {
      const history = histories.get(key(ex)) || [];
      const eligible = (intent === "unknown" || intent === "regular" ? history.filter(row => !row.session.trainingIntent || row.session.trainingIntent === "regular") : history)
        .filter(row => general(row.ex).length && !row.ex.ruleConflict && row.session.sourceKind !== "legacy-ocr"
          && !["mild", "stop"].includes(row.session.pain));
      let latest = eligible.at(-1), sameDate = latest ? eligible.filter(row => row.session.date === latest.session.date) : [];
      if (!latest && analysis.capacityHistory) {
        const older = capacitySamples.filter(sample => key(sample) === key(ex) && sample.date < session.date
          && dateNumber(sample.date) >= dateNumber(session.date) - 90 * DAY && !sample.ruleConflict && sample.sourceKind !== "legacy-ocr"
          && !["mild", "stop"].includes(sample.pain) && general(sample).length
          && (intent !== "unknown" && intent !== "regular" || !sample.trainingIntent || sample.trainingIntent === "regular"))
          .sort((a, b) => a.date.localeCompare(b.date));
        const lastOlder = older.at(-1);
        sameDate = lastOlder ? older.filter(sample => sample.date === lastOlder.date).map(sample => ({
          session: { id: sample.sessionId, date: sample.date, label: sample.label, time: sample.time, trainingIntent: sample.trainingIntent, pain: sample.pain, sourceKind: sample.sourceKind }, ex: { ...sample, id: sample.blockId }
        })) : [];
        latest = sameDate.at(-1);
      }
      const ambiguous = currentCounts.get(key(ex)) > 1 || sameDate.length > 1;
      references.set(ex.id, !ambiguous && sameDate.length === 1 ? latest : null);
      const otherGear = sessions.some(old => old.exercises.some(value => value.exerciseId && value.exerciseId === ex.exerciseId && key(value) !== key(ex)));
      const otherPurpose = history.some(row => general(row.ex).length && Object.hasOwn(intentLabels, row.session.trainingIntent) && row.session.trainingIntent !== "regular");
      referenceStatuses.set(ex.id, ambiguous ? "ambiguous" : latest ? "matched" : otherPurpose ? "purpose-only" : otherGear ? "other-device" : "first");
    }
    let eligibleReductions = 0;
    const reduced = [];
    for (const ex of session.exercises) {
      const reference = references.get(ex.id), currentSets = general(ex), previousSets = reference ? general(reference.ex) : [];
      const knownLoadedMovement = ["barbell", "dumbbell", "machine", "cable", "band"].includes(byId.get(ex.exerciseId)?.equipment) && !["pull_up", "chin_up", "dip", "assisted_pull_up", "assisted_dip"].includes(ex.exerciseId);
      if (!reference || dateNumber(session.date) - dateNumber(reference.session.date) > 42 * DAY || !currentSets.length || !previousSets.length || ex.ruleConflict) continue;
      if (ex.sets.some(set => set.marker === null && set.reps === null) || reference.ex.sets.some(set => set.marker === null && set.reps === null)) continue;
      eligibleReductions++;
      const currentLoads = currentSets.filter(set => finite(set.loadKg) && set.loadKg > 0).map(set => set.loadKg), previousLoads = previousSets.filter(set => finite(set.loadKg) && set.loadKg > 0).map(set => set.loadKg);
      const loadRatio = (ex.loadRole === "external" || ex.loadRole === "unknown" && knownLoadedMovement) && currentLoads.length === currentSets.length && previousLoads.length === previousSets.length ? median(currentLoads) / median(previousLoads) : null;
      const setRatio = currentSets.length / previousSets.length, repRatio = currentSets.reduce((sum, set) => sum + set.reps, 0) / previousSets.reduce((sum, set) => sum + set.reps, 0);
      const heavierSegment = loadRatio !== null && Math.max(...currentLoads) > Math.max(...previousLoads);
      const lessAssistance = ex.loadRole === "assistance" && currentLoads.length && previousLoads.length && Math.min(...currentLoads) < Math.min(...previousLoads);
      const uncertainLoadTradeoff = ex.loadRole === "unknown" && !knownLoadedMovement && JSON.stringify([...new Set(currentSets.map(set => set.loadKg))].sort()) !== JSON.stringify([...new Set(previousSets.map(set => set.loadKg))].sort());
      const sameStructure = recordedSetStructure(ex).kind === recordedSetStructure(reference.ex).kind;
      if (!heavierSegment && !lessAssistance && !uncertainLoadTradeoff && (loadRatio !== null && loadRatio <= 0.7 || setRatio <= 0.6 || sameStructure && loadRatio !== null && loadRatio <= 1 && repRatio <= 0.65)) reduced.push({ blockId: ex.id, loadRatio, setRatio, referenceDate: reference.session.date });
    }
    const broadReduction = reduced.length >= 2 && reduced.length >= Math.ceil(eligibleReductions * 2 / 3);
    const profile = options.profile || {}, clinical = profile.healthContext && profile.healthContext !== "general" || finite(profile.age) && (profile.age < 18 || profile.age > 80);
    const recovery = session.id === analysis.lastSession?.id ? analysis.recovery : null;
    const readiness = recovery?.current;
    const unsafe = session.pain === "stop" || session.pain === "mild" || ["stop", "review"].includes(recovery?.status) || clinical;
    const unresolvedHealthReports = recovery?.unresolvedHealthReports || [];
    const painCaution = ["mild", "stop"].includes(session.pain) || ["mild", "stop"].includes(recovery?.pain) && !unresolvedHealthReports.some(row => row.field === "pain");
    const healthFollowUp = !painCaution && !clinical && readiness?.illness !== "active" && unresolvedHealthReports.length > 0;
    const healthFollowUpBody = healthFollowUp ? `${unresolvedHealthReports.map(row => `${row.date}에 ${row.field === "illness" ? row.value === "active" ? "아픈 상태라고" : "질병 뒤 회복 중이라고" : row.value === "stop" ? "운동을 멈춰야 할 정도의 통증이 있다고" : "통증이 있다고"} 남겼어요.`).join(" ")} ${readiness?.positiveReport ? "오늘 컨디션과 수면이 괜찮다고 남긴 점도 함께 보되, " : ""}그 상태가 지금도 이어지는지는 아직 새로 확인되지 않았어요. 다음 운동 전에 현재 상태를 확인하고, 증상이 남아 있다면 쉬거나 불편한 동작을 멈추세요. 가라앉았다면 편한 준비 구간에서 반응을 보고 이번 구성을 잠정 기준으로 이어가요. 더 늘릴 선택은 그 확인 뒤에 정하고, 심하거나 계속되는 증상은 전문가에게 확인해 주세요.` : "";
    const assignments = (Array.isArray(options.planning?.schedule) ? options.planning.schedule : []).filter(item => item && item.recordId === session.id && item.date === session.date && item.status === "performed");
    for (const row of review.rows) {
      const ex = session.exercises.find(value => value.id === row.blockId), sets = general(ex), reference = references.get(ex.id), previousSets = reference ? general(reference.ex) : [];
      const comparison = coachingComparison({ ...ex, date: session.date }, reference, referenceStatuses.get(ex.id));
      const structure = comparison.structure;
      const first = sets[0], previous = previousSets[0], conditions = [], observations = comparison.observations;
      const grouped = sets.length && sets.every(set => set.loadKg === first.loadKg);
      const pattern = byId.get(ex.exerciseId)?.pattern;
      const timedPattern = ["mobility", "cardio"].includes(pattern);
      const controlPattern = ["rotation", "scapular-control"].includes(pattern);
      const marked = ex.sets.filter(set => set.marker !== null && set.marker.toUpperCase() !== "W" && Number.isInteger(set.reps) && set.reps > 0);
      const summary = timedPattern ? `${ex.durationMinutes ? `${ex.durationMinutes}분의 ` : ""}${pattern === "cardio" ? "유산소 운동" : "몸풀기·가동성 운동"}을 기록했어요.` : structure.summary;
      if (marked.length && first) observations.push(`별도 표기 ${marked.map(set => `${set.marker} ${format(set)}`).join(" / ")}도 함께 수행했어요. 일반 세트와 나눠 남겨 두었어요.`);
      if (first && !reference && ["other-device", "ambiguous", "purpose-only"].includes(referenceStatuses.get(ex.id))) observations.push(referenceStatuses.get(ex.id) === "other-device" ? "다른 머신의 중량을 따라가기보다 이 머신에서 해낸 세트부터 이어가세요." : comparison.evidence.summary);
      const pacingSegment = structure.segments.find(segment => segment.reps.length >= 2 && segment.reps.at(-1) <= segment.reps[0] * 0.7);
      const fallingSets = !!pacingSegment;
      if (pacingSegment) observations.push(`같은 표시 중량의 구간에서 일지 앞 세트 ${pacingSegment.reps[0]}회, 뒤 세트 ${pacingSegment.reps.at(-1)}회예요. 다음에는 이 구간의 뒤 세트가 유지되는지 보세요.`);
      const feedback = ex.feedback, target = sets.find(set => set.id === feedback?.setId) || sets.find(set => set.rir === 0) || first;
      const loadedMovement = ["barbell", "dumbbell", "machine", "cable", "smith"].includes(byId.get(ex.exerciseId)?.equipment) && !["pull_up", "chin_up", "dip", "assisted_pull_up", "assisted_dip"].includes(ex.exerciseId);
      const currentCapacitySample = analysis.capacityHistory?.samples.find(sample => sample.sessionId === session.id && sample.blockId === ex.id);
      const capacityEligible = Capacity && loadedMovement && !ex.ruleConflict && session.sourceKind !== "legacy-ocr" && ex.loadRole !== "assistance" && ex.loadConvention !== "bodyweight" && (!analysis.capacityHistory || !!currentCapacitySample);
      const capacityModel = capacityEligible ? Capacity.compareHistory(currentCapacitySample?.sets || sets, capacitySamples.filter(sample => !sample.ruleConflict && sample.sourceKind !== "legacy-ocr" && !["mild", "stop"].includes(sample.pain) && key(sample) === key(ex)), { date: session.date, sessionId: session.id, blockId: ex.id, trainingIntent: session.trainingIntent, pain: session.pain, feedback: currentCapacitySample?.feedback || feedback }) : null;
      const roundKg = value => String(Math.round(value));
      const estimatedRange = value => roundKg(value.minKg) === roundKg(value.maxKg) ? `약 ${roundKg(value.minKg)}kg` : `약 ${roundKg(value.minKg)}~${roundKg(value.maxKg)}kg`;
      let performance = null;
      if (capacityModel?.current) {
        const current = capacityModel.current, prior = capacityModel.previous, expected = capacityModel.expectedRepsAtCurrentLoad;
        const within = expected && current.reps >= expected.min && current.reps <= expected.max;
        const summary = prior && expected ? `${prior.date}의 ${format(prior)}를 바탕으로 이번 ${current.loadKg}kg은 ${expected.min === expected.max ? expected.min : `${expected.min}~${expected.max}`}회 정도로 가늠할 수 있어요. 실제 ${current.reps}회는 ${within ? "그 범위 안이에요" : current.reps > expected.max ? "그 예상보다 많았어요" : "그 예상보다 적었어요"}.`
          : `${format(current)}를 다음 수행의 잠정 기준으로 잡았어요. 같은 장비·표기의 1RM 추정은 ${estimatedRange(current)}예요.`;
        performance = { summary, model: capacityModel, basis: "estimated-performance" };
        const exposed = capacitySamples.filter(sample => !sample.ruleConflict && sample.sourceKind !== "legacy-ocr" && key(sample) === key(ex) && sample.date < session.date && sample.sets.some(set => set.marker === null && set.loadKg === current.loadKg && Number.isInteger(set.reps) && set.reps > 0)).sort((a, b) => a.date.localeCompare(b.date));
        const exposure = exposed.at(-1);
        const sameLoad = exposure ? { date: exposure.date, daysAgo: Math.round((dateNumber(session.date) - dateNumber(exposure.date)) / DAY), observationDays: new Set(exposed.map(sample => sample.date)).size,
          reps: Math.max(...exposed.filter(sample => sample.date === exposure.date).flatMap(sample => sample.sets.filter(set => set.marker === null && set.loadKg === current.loadKg && Number.isInteger(set.reps) && set.reps > 0).map(set => set.reps))), trainingIntent: exposure.trainingIntent || null, pain: exposure.pain || null } : null;
        performance.loadExperience = sameLoad;
        const experienceText = sameLoad ? `같은 장비의 ${current.loadKg}kg은 ${sameLoad.date}에도 ${sameLoad.reps}회를 했어요 (${sameLoad.daysAgo}일 전)${sameLoad.trainingIntent && sameLoad.trainingIntent !== "regular" ? ` · ${intentLabels[sameLoad.trainingIntent] || "별도 목적"} 기록` : ""}${["mild", "stop"].includes(sameLoad.pain) ? " · 통증이 있던 기록이며 평소 수행 기준과는 구분" : ""}.` : `이 장비에 남은 기록에서는 ${current.loadKg}kg이 처음이에요.`;
        const exposureAlreadyShown = sameLoad && comparison.evidence.comparisons.some(pair => pair.date === sameLoad.date && pair.label === `${current.loadKg}kg 구간`);
        if (!exposureAlreadyShown) observations.push(experienceText);
        comparison.evidence.context.push({ label: "같은 중량 경험", value: experienceText });
        if (current.rirApplied) observations.push(`이 세트의 RIR ${current.reportedRir}을 반영해 수행 여유도 추정에 포함했어요.`);
        comparison.evidence.context.push({ label: "이번 1RM 추정", value: `${format(current)} → ${estimatedRange(current)}${current.rirApplied ? ` · RIR ${current.reportedRir} 반영` : " · 수행 반복 기준"}` });
        if (prior) comparison.evidence.context.push({ label: "최근 42일 기준 추정", value: `${prior.date} · ${format(prior)} → ${estimatedRange(prior)}` });
        const best = capacityModel.allTimeBest;
        if (best) comparison.evidence.context.push({ label: "조회한 기록 중 최고 추정", value: `${best.date} · ${format(best)} → ${estimatedRange(best)}` });
        comparison.evidence.context.push({ label: "추정 계산", value: "Epley·Brzycki, 1~10회 · 두 식의 차이이며 최대 능력 보장이나 신뢰구간은 아님" });
      }
      let action = { kind: "repeat", title: "다음엔 이번 세트부터 이어가요", body: first ? `가볍게 준비한 뒤 같은 장비에서 ${structure.segments.map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ")}를 이어가 보세요. 마지막까지 동작이 안정적이고 여유가 있으면 한 세트에서만 1회 더 해보고, 버거우면 이번 횟수를 유지해요.` : "다음에도 이 운동을 남겨 주세요. 실제로 한 세트의 횟수가 있으면 다음 목표를 더 맞출 수 있어요.", provisional: true };
      if (first?.reps <= 3) action = { ...action, title: "낮은 반복 구성을 안정적으로 이어가기", body: `다음에는 연습 세트로 상태를 확인한 뒤 ${format(first)}의 구성을 이어가 보세요. ${first.reps}회가 목표였다면 반복을 무조건 늘릴 필요는 없어요. 목표보다 일찍 끝난 세트였다면 동작을 제어할 수 있는 부담으로 조절하고, 아래에 그 세트의 느낌을 남기면 다음 선택을 맞출게요.` };
      if (structure.kind === "top-backoff-candidate") {
        const tail = sets.slice(structure.segments[0].setIds.length);
        action = { ...action, title: "무거운 세트와 반복 세트를 나눠 이어가기", body: `다음에는 ${structure.segments[0].loadKg}kg × ${structure.segments[0].reps.join("·")}회의 무거운 구간과 ${structure.segments.slice(1).map(segment => `${segment.loadKg}kg × ${segment.reps.join("·")}회`).join(" / ")}의 낮춘 구간을 따로 재현해 보세요. ${first.reps}회가 의도한 목표였다면 그 구성을 유지하고, 목표보다 일찍 끝났다면 무거운 구간의 부담부터 조절하세요. ${pacingSegment ? `같은 ${pacingSegment.loadKg}kg 구간은 ${pacingSegment.reps[0]}회 뒤 ${pacingSegment.reps.at(-1)}회였으니 세트 사이 회복 시간을 확보하고 뒤 세트가 유지되는지 보세요.` : `낮춘 구간은 ${tail.length}세트를 먼저 안정시키고 한 세트씩 조절해요.`}` };
      } else if (structure.kind === "ramp") action = { ...action, title: "중량 구간별로 다음 수행 잡기", body: `다음에도 ${structure.segments.map(segment => `${segment.loadKg}kg × ${segment.reps.join("·")}회`).join(" / ")} 구성을 구간별로 이어가 보세요. 가장 무거운 ${structure.segments.at(-1).loadKg}kg의 ${structure.segments.at(-1).reps.join("·")}회까지 동작을 유지하며 마치고, 잘 이어지면 한 구간만 조금 조절해요.` };
      else if (structure.kind === "mixed") action = { ...action, title: "서로 다른 구간을 각각 이어가기", body: `다음에는 기록된 ${structure.segments.slice(0, 5).map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ")} 구간을 각각 재현해 보세요. 한 구간에 여유가 있어도 다른 구간까지 같이 올리지 말고, 바꿀 세트 하나의 느낌을 남겨 그 세트부터 조절해요.` };
      if (!first) action = { ...action, kind: "log", title: "다음 기록을 이어가기", body: ex.sets.some(set => set.marker !== null) ? "준비·드롭 등 별도 표기의 숫자는 남겨 두세요. 평소 일반 세트가 있다면 그 세트 하나만 추가하면 다음 시도를 함께 잡을 수 있어요." : action.body };
      else if (feedback?.feeling === "limit" || target.rir === 0) action = { ...action, kind: "ease", title: "다음에는 반복을 밀지 않기", body: `${format(target)}${feedback?.feeling === "limit" ? "가 한계에 가까웠다고 남겼어요" : "에 RIR 0을 기록했어요"}. 다음에는 이 반복을 억지로 넘기지 마세요. ${ex.loadRole === "external" ? "동작이 흐트러지면 사용 가능한 가장 작은 단계만큼 중량을 낮춰 보세요." : ex.loadRole === "assistance" ? "동작이 흐트러지면 보조를 더 받는 방향으로 조절해 보세요." : "더 제어하기 쉬운 조건에서 여유를 남겨 보세요."}` };
      else if (feedback?.feeling === "comfortable") action = { ...action, kind: "reps-option", title: "여유 있었던 세트에서 작은 변화", body: `${format(target)}에 여유가 있었다고 남겼어요. 다음 같은 장비에서 이 세트만 ${target.reps < 100000 ? target.reps + 1 : target.reps}회를 시도해 보세요. 계획한 반복 상단에 도달했다면 횟수를 계속 늘리기보다 ${ex.loadRole === "external" ? "가능한 최소 증량" : ex.loadRole === "assistance" ? "보조를 조금 덜 받는 선택" : "부하의 의미와 동작 난도"}을 검토하세요.` };
      else if (feedback?.feeling === "hard") action = { ...action, title: "힘들었던 수행을 먼저 안정시키기", body: `${format(target)}가 힘들었다고 남겼어요. 다음에는 같은 장비에서 이 세트를 다시 해보고, ${sets.length > 1 ? "다른 세트까지 중량·반복을 한꺼번에 올리지 마세요." : "중량과 반복을 한꺼번에 올리지 마세요."}` };
      else if (grouped && sets.length >= 2 && sets.at(-1).reps <= first.reps * 0.7) action = { ...action, title: "뒤 세트까지 이어갈 여유 만들기", body: `첫 일반 세트 ${format(first)}를 유지하며 세트 사이 회복 시간을 충분히 확보해 보세요. 뒤 세트 반복을 억지로 채우기보다 제어 가능한 반복을 남기고, 그래도 급격히 줄면 시작 부담을 조금 낮춰 보세요.` };
      else if (structure.kind === "straight" && previous && recordedSetStructure(reference.ex).kind === "straight" && ex.loadRole === "external" && first.loadKg !== null && previous.loadKg !== null && first.loadKg > previous.loadKg && first.reps < previous.reps) action = { ...action, title: "무게와 반복을 동시에 올리지 않기", body: `이번 ${format(first)}를 같은 장비에서 먼저 안정시켜 보세요. 계획한 반복 범위보다 낮았다면 이전 ${format(previous)} 쪽으로 조절하는 선택도 있어요.` };
      else if (structure.kind === "straight" && previous && recordedSetStructure(reference.ex).kind === "straight" && first.loadKg === previous.loadKg && first.reps < previous.reps) action = { ...action, title: "줄어든 반복을 한 번 더 확인", body: `다음 같은 장비에서는 이번 ${format(first)}를 출발점으로 삼고, 연습 세트에서 평소보다 버거운지 봐요. 계속 버거우면 추가 세트를 밀지 말고 부담을 낮춰 보세요.` };
      if (fallingSets && feedback?.feeling === "comfortable" && target.id === pacingSegment.setIds[0] && action.kind === "reps-option") action = { ...action, kind: "repeat", title: "앞 세트의 여유를 뒤 세트까지 이어가기", body: `${format(target)}에는 여유가 있었지만 같은 중량의 뒤 기록은 ${pacingSegment.reps.at(-1)}회예요. 다음에는 첫 세트를 늘리기보다 지금 반복을 유지하고 세트 사이 회복 시간을 충분히 확보해 보세요. 뒤 세트까지 안정되는지 본 뒤 한 세트만 늘려요.` };
      const priorDistinct = new Map();
      for (const old of histories.get(key(ex)) || []) if ((!old.session.trainingIntent || old.session.trainingIntent === "regular") && general(old.ex).length) {
        if (!priorDistinct.has(old.session.date)) priorDistinct.set(old.session.date, []);
        priorDistinct.get(old.session.date).push(old);
      }
      const recent = [...priorDistinct.values()].slice(-2);
      if (structure.kind === "straight" && first && reference && recent.length === 2 && recent.every(rows => rows.length === 1 && recordedSetStructure(rows[0].ex).kind === "straight") && !feedback && target.rir !== 0 && action.kind === "repeat" && (intent === "unknown" || intent === "regular")) {
        const starts = [...recent.map(rows => general(rows[0].ex)[0]), first];
        if (!Coaching && starts.every(set => set.loadKg === first.loadKg && set.reps === first.reps)) {
          if (!capacityModel?.stableWorking.detected) observations.push(`최근 세 번의 첫 일반 세트가 ${format(first)}로 같아요.`);
          action = { ...action, title: "익숙한 수행에서 한 가지씩 바꾸기", body: `${["maintain", "lose"].includes(profile.goal) ? "체중 목표와 별개로, 회복과 세트 여유가 괜찮다면 작은 수행 변화를 선택할 수 있어요. 지금 구성 유지도 선택이에요. " : ""}${first.reps <= 3 ? `다음에도 ${format(first)}의 구성을 먼저 유지하세요. 낮은 반복이 목표라면 횟수를 늘리기보다 모든 세트를 안정적으로 마치고 여유가 있는지 본 뒤 작은 부하 변화를 검토해요.` : `다음 ${format(first)}에서 충분히 여유가 있으면 한 세트에만 1회 더 시도해 보세요. 여전히 힘들면 그대로 유지하고 뒤 세트까지 안정되는지 봐요.`}` };
        } else if (ex.loadRole === "external" && starts.every(set => finite(set.loadKg)) && starts[1].loadKg <= starts[0].loadKg && first.loadKg <= starts[1].loadKg && starts[1].reps <= starts[0].reps && first.reps <= starts[1].reps && (first.loadKg < starts[0].loadKg || first.reps < starts[0].reps)) {
          observations.push("최근 세 번의 첫 일반 세트에서 중량 또는 반복이 낮아지는 흐름이 있어요.");
          action = { ...action, kind: "review-recovery", title: "반복되는 부담 변화를 함께 점검", body: `다음에는 이번 ${format(first)}에서 가볍게 상태를 확인하고, 버거우면 세트를 더 밀지 마세요. 의도한 조절인지, 운동 배치·휴식·최근 수면이나 식사가 달랐는지 한 가지씩 살펴본 뒤 부담을 정해요.` };
        }
      }
      if (!Coaching && capacityModel?.stableWorking.detected && structure.kind === "straight" && first && !fallingSets && !feedback && target.rir !== 0 && action.kind === "repeat" && (intent === "unknown" || intent === "regular") && currentCounts.get(key(ex)) === 1) {
        const stable = capacityModel.stableWorking;
        observations.push(`${format(first)}로 시작한 운동이 ${stable.observationDays}번 있어요. 첫 세트는 익숙해진 기록이에요.`);
        if (first.reps > 3 && first.reps < 100000) {
          action = { ...action, kind: "progression-option", title: "유지해 온 수행에서 작은 변화 시도", body: `다음에는 ${format(first)}에서 한 세트에만 1회 더 (${first.reps + 1}회) 시도하거나, 사용 가능한 가장 작은 중량 단계로 바꾸고 반복을 조금 낮춰 보세요. 중량과 반복을 함께 올리거나 세트를 추가하지는 마세요. 뒤 세트가 크게 줄면 기존 구성을 유지해요.${profile.goal === "performance" && finite(profile.trainingYears) && profile.trainingYears >= 1 ? " 낮은 반복 훈련을 해보고 싶다면 기존 작업 세트 하나를 더 무거운 3~5회 세트로 바꾸는 선택도 있어요. 익숙한 동작에서 최소 증량부터 확인하고, 추정 1RM 자체를 시도할 목표로 쓰지는 마세요." : ""}` };
        }
      }
      if (performance?.model.previous && performance.model.expectedRepsAtCurrentLoad && action.kind === "repeat" && !feedback && target?.rir !== 0 && (intent === "unknown" || intent === "regular")) {
        const current = performance.model.current, expected = performance.model.expectedRepsAtCurrentLoad;
        if (current.reps < expected.min) action = { ...action, title: "이번 수행부터 다시 맞추기", body: `앞선 기록으로는 ${current.loadKg}kg에서 ${expected.min}~${expected.max}회 정도를 가늠했지만 이번에는 ${current.reps}회였어요. 이 세트는 이번 수행을 기준으로 이어가고, 평소보다 버거우면 더 밀지 마세요. ${action.body}` };
        else if (current.reps >= expected.min && current.reps <= expected.max) action = { ...action, body: `${format(current)}는 앞선 기록으로 가늠한 수행 범위 안이에요. ${action.body}` };
        else action = { ...action, body: `이번 ${format(current)}는 앞선 기록으로 가늠한 반복보다 많았어요. 이 수행을 새 출발 기준으로 삼고, ${action.body}` };
      }
      if (structure.kind === "straight" && grouped && sets.length >= 2 && Math.max(...sets.map(set => set.reps)) >= first.reps * 1.4 && !feedback && !sets.some(set => set.rir === 0) && ["repeat", "progression-option"].includes(action.kind)) {
        const bestReps = Math.max(...sets.map(set => set.reps));
        observations.push(`같은 ${first.loadKg === null ? "부하" : `${first.loadKg}kg`}에서 앞 세트 ${first.reps}회 뒤 ${bestReps}회까지 수행했어요. 첫 세트의 반복만을 상한으로 잡지 않을게요.`);
        action = { ...action, kind: "working-range", title: "뒤 세트의 수행까지 반영해 목표 잡기", body: `다음에는 이번 ${structure.segments[0].reps.join("·")}회 구성을 먼저 이어가 보세요. 모든 세트를 ${bestReps}회로 맞출 필요는 없어요. ${first.loadKg !== null && loadedMovement && ex.loadRole !== "assistance" ? `반복보다 부하를 높이는 쪽을 원한다면 사용 가능한 최소 증량으로 바꾼 한 세트에서 기존 ${first.reps}회부터 확인하는 선택도 있어요.` : `반복 목표를 높이고 싶다면 한 세트에만 1회 더 시도하고 나머지는 이번 구성을 유지해 보세요.`} 동작 범위와 제어가 유지되는 쪽으로 정해요.` };
      }
      if (timedPattern) action = { ...action, kind: pattern, title: pattern === "cardio" ? "시간과 페이스 중 하나만 조절해요" : "더 세게 하기보다 편안하게 움직여요", body: pattern === "cardio" ? `다음에도 ${ex.durationMinutes ? `${ex.durationMinutes}분을 기준으로 ` : "이번에 할 수 있었던 시간부터 "}대화 가능한 편안한 페이스로 시작해 보세요. 상태가 괜찮으면 시간이나 속도 중 하나만 조금 조절하고, 하체 훈련과 함께 하는 날에는 본 운동을 방해할 정도로 지치지 않게 맞춰요.` : `다음에도 ${ex.durationMinutes ? `${ex.durationMinutes}분 정도로 ` : "이번처럼 "}편안하게 움직여 보세요. 더 세게 누르거나 오래 버티기보다 통증 없는 범위에서 움직임이 부드러워지는지 봐요. 운동 전에 했다면 가벼운 준비 세트로 이어가고, 운동 뒤에 했다면 편안하게 마무리해도 좋아요.` };
      else if (controlPattern) {
        const controlWork = structure.segments.map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ");
        const controlLead = first ? `이번에는 ${controlWork}${sets.length > 1 ? `로 ${sets.length}세트` : ""}를 남겼어요. 다음에도 이 구성을 ` : "다음에도 이번 동작을 ";
        const control = pattern === "scapular-control" ? "몸통을 젖히거나 어깨를 으쓱해 횟수를 채우지 말고, 목과 어깨에 힘을 과하게 주지 않으면서 팔과 견갑의 움직임을 제어해요. 반복이 같다고 무조건 중량이나 세트를 늘릴 필요는 없어요."
          : "몸통을 비틀거나 반동으로 횟수를 채우지 말고, 밴드 장력과 가동범위를 유지해요. 반복이 같다고 무조건 밴드나 중량을 높일 필요는 없어요.";
        if (["hard", "limit"].includes(feedback?.feeling) || target?.rir === 0) action = { ...action, body: `${action.body} ${control}` };
        else action = { ...action, kind: "technique-control", title: pattern === "scapular-control" ? "견갑 움직임의 제어를 먼저 유지" : "회전 동작의 제어를 먼저 유지", body: `${controlLead}통증 없는 범위에서 부드럽게 이어가세요.${sets.length > 1 ? " 뒤 세트는 첫 세트의 횟수에 억지로 맞추지 말고, 자세가 유지되는 만큼 이어가요." : ""} ${control}` };
      }
      const contextual = Coaching?.interpret({ current: { ...ex, date: session.date, sessionId: session.id, trainingIntent: session.trainingIntent, pain: session.pain, sourceKind: session.sourceKind },
        previous: reference ? { ...reference.ex, date: reference.session.date, sessionId: reference.session.id, trainingIntent: reference.session.trainingIntent, pain: reference.session.pain, sourceKind: reference.session.sourceKind } : null,
        history: capacitySamples.filter(sample => key(sample) === key(ex)), structure, previousStructure: reference ? recordedSetStructure(reference.ex) : null, performance, profile, readiness, loadedMovement, currentAmbiguous: currentCounts.get(key(ex)) > 1 });
      if (contextual?.primaryAction && !feedback && target?.rir !== 0 && (intent === "unknown" || intent === "regular") && !timedPattern && !controlPattern) {
        action = { ...contextual.primaryAction, provisional: true };
      }
      const plannedRows = ex.exerciseId && assignments.length === 1 && Array.isArray(assignments[0].prescription?.exercises) ? assignments[0].prescription.exercises.filter(item => item && item.exerciseId === ex.exerciseId && (!item.equipmentKey || item.equipmentKey === ex.equipmentKey)) : [];
      const planned = plannedRows.length === 1 && session.exercises.filter(item => item.exerciseId === ex.exerciseId && (!plannedRows[0].equipmentKey || item.equipmentKey === plannedRows[0].equipmentKey)).length === 1 ? plannedRows[0] : null;
      const planEffort = planned ? Coaching?.plannedEffort(ex, planned) : null;
      let planEffortAction = null;
      const work = contextual?.facts?.current;
      const workText = work?.segments.map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ");
      let clarification = null, clarifiedAssessment = null, planContext = null;
      if (work?.complete && session.sourceKind !== "legacy-ocr" && !unsafe && !healthFollowUp && (!planned || ex.coachingAnswer) && !feedback && !sets.some(set => set.rir === 0) && !broadReduction
        && (intent === "unknown" || intent === "regular") && currentCounts.get(key(ex)) === 1) {
        if (contextual.signals.some(signal => signal.kind === "heavier-work-removed")
          || contextual.signals.some(signal => signal.kind === "recent-work-reduced" && signal.previousHighestLoadKg !== null && signal.currentHighestLoadKg !== null && signal.currentHighestLoadKg < signal.previousHighestLoadKg)) clarification = {
          topic: "load-change", title: contextual.facts.recentChange ? "최근 낮춘 중량 구성은 의도해서 이어가는 건가요?" : "이번에는 의도적으로 중량을 낮춘 건가요?",
          choices: [{ value: "planned", label: "의도적으로 바꿈" }, { value: "unexpected", label: "평소보다 버거웠음" }]
        };
        else if (contextual.signals.some(signal => signal.kind === "base-held-heavy-lower")
          || contextual.signals.some(signal => signal.kind === "new-heavy-exposure") && performance?.model?.current?.reps < performance?.model?.expectedRepsAtCurrentLoad?.min) clarification = {
          topic: "rep-target", title: `무거운 구간의 ${work.loads.find(load => load.loadKg === work.maxLoadKg)?.reps.join("·")}회는 정한 목표였나요?`,
          choices: [{ value: "planned", label: "목표대로 했음" }, { value: "unexpected", label: "예상보다 일찍 끝남" }]
        };
        if (planned && clarification?.topic !== ex.coachingAnswer?.topic) clarification = null;
        const selectedAnswer = clarification && ex.coachingAnswer?.topic === clarification.topic ? ex.coachingAnswer.answer : null;
        if (clarification) clarification.selectedAnswer = selectedAnswer;
        if (selectedAnswer === "planned") {
          clarifiedAssessment = clarification.topic === "load-change" ? `이번 ${workText}는 의도적으로 중량을 낮춰 정한 구성이에요. 이전 무거운 구간을 되돌리기보다 이번 목적에 맞춰 이어가면 돼요.`
            : `${contextual.assessment} 무거운 구간은 정한 반복에 맞춰 마쳤다고 남겼어요. 다음에는 ${sets.length > 1 ? "그 목표와 나머지 세트 구성을 함께" : "그 목표를"} 유지해요.`;
          action = { ...action, kind: "maintain-intended-work", title: "의도한 구성에 맞춰 이어가기", body: `다음에도 ${workText}를 기준으로 이어가세요. 정한 반복에서 마치고, ${sets.length > 1 ? "다른 세트까지 중량이나 횟수를 한꺼번에 늘리지 않아요. 목표를 바꿀 때 무거운 구간과 나머지 세트를 따로 조절해요." : "목표를 바꿀 때 중량과 횟수를 한꺼번에 늘리지 않아요."}`, focusSetIds: work.source.setIds.slice() };
        } else if (selectedAnswer === "unexpected") {
          clarifiedAssessment = `${contextual.assessment} 정한 구성보다 버거웠다고 남겼으니 다음에는 이번 수행부터 안정시키고, 줄었던 구간을 우선 챙겨요.`;
          action = { ...action, kind: "recheck-unexpected-work", title: "버거웠던 구간을 먼저 다시 맞추기", body: `다음에는 가볍게 준비한 뒤 이번 ${workText}를 기준으로 시작하세요. 버거웠던 구간 전에 충분히 쉬고, 이번 반복을 제어하며 유지하는지 봐요. 잘 유지되면 줄었던 한 세트의 1회부터 시도하고, 중량과 전체 세트를 함께 늘리지 않아요.`, focusSetIds: work.source.setIds.slice() };
        }
      }
      if (planned && Number.isInteger(planned.sets) && planned.sets > 0 && Number.isInteger(planned.repsMin) && Number.isInteger(planned.repsMax) && planned.repsMin > 0 && planned.repsMax >= planned.repsMin && planned.repsMax <= 100000 && sets.length) {
        comparison.evidence.context.push({ label: "연결한 계획", value: `${planned.sets}세트 × ${planned.repsMin}~${planned.repsMax}회` });
        const planSets = ex.sets.filter(set => set.marker === null).slice(0, planned.sets);
        const knownPlanSets = planSets.filter(set => Number.isInteger(set.reps) && set.reps > 0);
        const below = knownPlanSets.some(set => set.reps < planned.repsMin), above = knownPlanSets.some(set => set.reps > planned.repsMax);
        const outsideSets = knownPlanSets.filter(set => set.reps < planned.repsMin || set.reps > planned.repsMax);
        const intendedHeavyIds = clarification?.topic === "rep-target" && clarification.selectedAnswer === "planned"
          ? work.loads.find(load => load.loadKg === work.maxLoadKg)?.setIds || [] : [];
        const reviewSets = outsideSets.filter(set => !intendedHeavyIds.includes(set.id));
        const confirmedSets = outsideSets.filter(set => intendedHeavyIds.includes(set.id));
        planContext = { min: planned.repsMin, max: planned.repsMax, outsideSets, reviewSets, confirmedSets,
          withinSets: knownPlanSets.filter(set => !outsideSets.includes(set)), extraSets: sets.filter(set => !planSets.some(item => item.id === set.id)) };
        const complete = planSets.length === planned.sets && knownPlanSets.length === planSets.length;
        observations.push(below || above ? `연결한 계획의 ${planned.repsMin}~${planned.repsMax}회 범위와 다른 계획 세트가 있어요.` : complete ? `계획에 해당하는 일반 ${planned.sets}세트는 ${planned.repsMin}~${planned.repsMax}회 범위 안이에요.` : `계획 일반 ${planned.sets}세트 중 반복을 확인한 ${knownPlanSets.length}세트를 이어서 볼 수 있어요.`);
        if (ex.sets.filter(set => set.marker === null).length > planned.sets) observations.push(`계획 ${planned.sets}세트 이후의 일반 세트는 추가 수행으로 따로 남겨 두었어요.`);
        if (confirmedSets.length) {
          const note = `${confirmedSets.map(format).join(" / ")}는 연결한 ${planned.repsMin}~${planned.repsMax}회 계획과 다르지만, 정한 반복 목표대로 마쳤다고 남긴 구간이에요. 이 구간을 실패로 보거나 기존 반복을 억지로 채우지 않아요.`;
          observations.push(note);
          if (action.kind === "maintain-intended-work") action = { ...action, body: `${note} ${action.body}` };
        }
        if (reviewSets.some(set => set.reps < planned.repsMin) && action.kind !== "ease") action = { ...action, kind: "plan-check", title: "계획한 반복과 이번 구성 맞추기", body: `연결한 계획은 ${planned.repsMin}~${planned.repsMax}회인데 ${reviewSets.map(format).join(" / ")}는 그 범위와 달랐어요. 의도적으로 구성을 바꿨다면 이 구간은 바뀐 목표에 맞춰 따로 이어가세요. 같은 계획을 목표로 했는데 반복을 채우기 어려웠다면 동작을 제어하며 범위 안에서 할 수 있는 부담으로 조절하고, 한꺼번에 세트를 보충하지 마세요.`, focusSetIds: reviewSets.map(set => set.id) };
        else if (!above && (feedback?.feeling === "comfortable" && action.kind === "reps-option" && planSets.some(set => set.id === target.id) && target.reps >= planned.repsMax
          || action.kind === "progression-option" && action.proposal && planSets.some(set => set.id === action.proposal.setId) && action.proposal.targetReps > planned.repsMax)) {
          const selected = sets.find(set => set.id === action.proposal?.setId) || target;
          action = { ...action, kind: "load-option", title: "반복 상단에서 부하 조절 검토", body: `${format(selected)}${feedback?.feeling === "comfortable" ? "에 여유가 있었고" : "를 반복해 왔고"} 계획한 반복 상단 ${planned.repsMax}회에 도달했어요. ${planSets.length > 1 ? "다른 계획 세트도 상단과 의도한 여유를 유지했다면" : "이 세트의 동작과 의도한 여유를 유지했다면"} 다음에 ${ex.loadRole === "external" ? "사용 가능한 최소 부하 증가" : ex.loadRole === "assistance" ? "보조를 조금 덜 받는 선택" : "제어 가능한 동작 난도 변화"}를 검토하세요. 반복 상단과 ${sets.length > 1 ? "전체 세트의 부담을" : "부하를"} 한꺼번에 올리지는 마세요.` };
          if (contextual.facts.recentChange?.kind === "returned") action.body = `돌아온 ${workText}와 계획한 범위를 함께 봐요. ${action.body}`;
        }
        else if (reviewSets.some(set => set.reps > planned.repsMax) && action.kind !== "ease") action = { ...action, kind: "plan-check", title: "반복 상단과 운동 목표 맞추기", body: `${reviewSets.map(format).join(" / ")}는 계획한 ${planned.repsMin}~${planned.repsMax}회 범위를 넘었어요. 다음에는 횟수를 더 늘리기보다 이 범위에서 동작과 여유를 유지해 보세요. 의도적으로 반복 목표를 바꿨다면 새 구성을 따로 이어가고, 기존 범위의 모든 세트가 안정적이면 작은 부하 변화를 검토해요.`, focusSetIds: reviewSets.map(set => set.id) };
      }
      if (planEffort) {
        comparison.evidence.context.push({ label: "계획한 여유와 실제 세트", value: `계획 RIR ${planEffort.targetRir} · ${planEffort.matchedSets.map(set => `${format(set)} ${set.rir === null ? "RIR 미입력" : `RIR ${set.rir}`}`).join(" / ")}` });
        const belowIds = new Set(planEffort.belowSets.map(set => set.id));
        const belowText = planEffort.belowSets.map(set => `${format(set)} RIR ${set.rir}`).join(" / ");
        if (belowIds.size) {
          planEffortAction = { kind: "plan-effort-check", title: "정한 여유를 남길 부담부터 맞추기",
            body: `${belowText} 기록에서는 계획한 RIR ${planEffort.targetRir}보다 여유가 적었어요. 이 세트는 반복이나 부하를 더 늘리지 말고, 다음에는 충분히 쉬고 같은 동작 범위에서 ${planned.repsMin}~${planned.repsMax}회와 ${planEffort.targetRir}회 여유를 함께 맞춰 보세요. 여유가 계속 부족하면 ${ex.loadRole === "assistance" ? "보조를 더 받거나" : loadedMovement ? "사용 가능한 작은 단계로 부하를 낮추거나" : "더 제어하기 쉬운 조건으로 바꾸거나"} 반복을 줄여 마칠 수 있어요. 반복 범위까지 바꿔야 한다면 계획도 다시 정하고, 빠진 반복을 추가 세트로 채우지는 않아요.`,
            focusSetIds: [...belowIds], provisional: true };
          const focus = action.proposal?.setId ? [action.proposal.setId] : ["reps-option", "load-option"].includes(action.kind) && target ? [target.id] : action.focusSetIds?.length ? action.focusSetIds : sets.map(set => set.id);
          if (!["ease", "plan-check"].includes(action.kind) && focus.some(id => belowIds.has(id))) action = { ...planEffortAction };
        }
        if (["progression-option", "reps-option", "load-option"].includes(action.kind)) {
          const focusedIds = action.proposal?.setId ? [action.proposal.setId] : action.focusSetIds || [target?.id];
          if (planEffort.matchedSets.some(set => focusedIds.includes(set.id))) action = { ...action,
            body: `계획한 RIR ${planEffort.targetRir}, 즉 ${planEffort.targetRir}회 여유를 남길 수 있을 때만 다음 변화를 선택하세요. 그 여유가 남지 않으면 반복을 더 채우거나 부하를 높이지 않아요. ${action.body}` };
        }
      }
      if (broadReduction && (intent === "unknown" || intent === "regular")) action = { ...action, kind: "check-intent", title: intent === "unknown" ? "가볍게 한 이유부터 맞추기" : "예상 밖으로 버거웠다면 다음 시작부터 확인", body: intent === "unknown" ? "여러 운동의 부담이 함께 줄었어요. 디로드나 연습으로 줄인 날이라면 다시 올릴 필요가 없어요. 이 일지의 운동 목적을 골라 주면 다음 방향을 맞출게요." : `평소 운동으로 했지만 여러 종목의 부담이 줄었어요. 다음에는 ${first ? format(first) + "를 출발점으로 " : ""}연습 세트에서 상태를 확인하고, 버거우면 추가 세트를 밀지 마세요. 순서·휴식·컨디션을 함께 보고 반복되는지 점검해요.` };
      if (intent !== "unknown" && intent !== "regular") {
        const bodies = { deload: "부담을 낮추려는 목적을 남겼어요. 못한 운동이 있어도 몰아서 보충하지 마세요. 계획한 기간을 마친 뒤 평소 운동의 편한 준비 구간에서 상태를 보고 다음 부담을 정해요.", light: "가볍게 움직이려는 날로 남겼어요. 다음에도 동작을 편하게 제어하는 데 초점을 두고, 못한 운동이 있어도 별도로 보충할 필요는 없어요.", technique: "이번에는 중량보다 같은 동작 범위와 제어를 재현하는 데 집중해 보세요. 기술 연습 기록은 평소 수행 기준과 나눠 이어갈게요.", "time-limited": "시간이 부족한 날로 남겼어요. 못한 운동이 있어도 다음 날에 몰아서 보충하지 마세요. 다음에는 할 수 있는 시간에 우선할 운동부터 배치하고, 평소 구성에서 이어가 보세요.", return: "이번 복귀 수행을 지금의 출발점으로 삼으세요. 이전 최고 기록을 한 번에 따라잡기보다 이번 부담에서 다음 날 반응까지 보고 한 가지씩 늘려요.", test: "이번 테스트 기록은 따로 남겨요. 다음 평소 운동은 테스트에서 쓴 부하를 그대로 목표로 삼기보다 평소 수행과 편한 준비 구간의 반응으로 시작하세요." };
        action = { ...action, kind: intent, title: `${intentLabels[intent]}의 다음 방향`, body: bodies[intent] };
      }
      if (session.sourceKind === "legacy-ocr") action = { ...action, kind: "verify-record", title: "원문과 실제 세트 먼저 확인", body: "예전 OCR로 가져온 숫자가 남아 있어요. 일지의 중량·반복·세트 표기를 원문과 맞춘 뒤 다음 운동 기준으로 사용해 주세요. 확인 전에는 이 숫자를 목표로 증량하거나 반복을 더 밀지 않아요." };
      if (unsafe) action = { ...action, kind: "individual-care", title: "부담 증가보다 상태 확인 먼저", body: painCaution ? "통증을 유발하는 운동은 멈추고 증상을 확인해 주세요. 수행 숫자가 좋아도 중량·반복을 더 밀지는 마세요. 중단 수준의 통증은 전문가 평가가 우선이에요." : clinical ? "기록 관찰은 이어가되, 훈련 강도 변경은 현재 상태를 아는 전문가의 개별 계획에 맞춰 주세요." : "여러 번 낮아진 수행과 최근 회복 신호를 함께 봐요. 다음에는 가볍게 연습하며 상태를 확인하고, 버거우면 세트·강도를 더 늘리지 마세요. 최근 수면·피로·식사와 운동 목적을 확인한 뒤 부담 조절을 정해요." };
      if (painCaution && readiness?.illness === "active") action = { ...action,
        body: `${action.body} 지금 아픈 상태도 함께 남겼으니, 통증 없는 다른 운동으로 이번 분량을 채우려 하지 말고 회복을 우선하세요.` };
      if (!painCaution && readiness?.illness === "active" && (unsafe || intent !== "unknown" && intent !== "regular" || session.sourceKind === "legacy-ocr")) action = { ...action,
        title: "아픈 동안은 회복 먼저",
        body: `지금 아픈 상태라면 목적과 관계없이 이번 구성을 다시 채우거나 늘리려 하지 말고 쉬는 쪽을 우선하세요. 증상이 심하거나 계속되면 의료진에게 확인하고, 회복한 뒤 ${clinical ? "현재 상태를 아는 전문가의 개별 계획에 맞춰" : session.sourceKind === "legacy-ocr" ? "원문과 실제 세트를 확인한 뒤" : "운동 중·직후와 다음 날 반응을 보며"} 다음 수행을 정해요.` };
      else if (!unsafe && readiness?.illness === "recovering" && intent !== "unknown" && intent !== "regular") action = { ...action,
        body: `이 일지는 ${intentLabels[intent]} 목적으로 남겨 두세요. 질병 뒤 회복 중이니 운동 중·직후와 다음 날 반응부터 확인해요. 평소보다 버겁거나 증상이 다시 나타나면 멈추고, 이번 구성을 의무적으로 채우거나 곧바로 늘리지는 않아요. 몸 상태가 돌아온 뒤 그 목적에 맞는 다음 수행을 정하고, 이전 최고 기록이나 빠진 세트를 한 번에 따라잡지 않아요.` };
      if (healthFollowUp) action = { kind: "health-follow-up", title: "마지막 몸 상태를 확인한 뒤 다음 수행 정하기", body: healthFollowUpBody, focusSetIds: [], provisional: true };
      if (action.kind === "reps-option" && target?.reps > 0 && target.reps < 100000) action.proposal = { kind: "single-set-reps", setId: target.id,
        loadKg: target.loadKg, baseReps: target.reps, targetReps: target.reps + 1 };
      if (!["reps-option", "progression-option"].includes(action.kind)) delete action.proposal;
      action.focusSetIds = unsafe || healthFollowUp || !first ? [] : action.kind === "plan-check" ? action.focusSetIds : feedback || target?.rir === 0 ? [target.id] : Array.isArray(action.focusSetIds) ? action.focusSetIds : sets.map(set => set.id);
      let recoveryProgressionCandidate = null;
      if (!unsafe && !healthFollowUp && readiness?.strong && (intent === "unknown" || intent === "regular") && session.sourceKind !== "legacy-ocr") {
        if (["reps-option", "progression-option", "load-option"].includes(action.kind)) recoveryProgressionCandidate = { ...action,
          title: `회복 뒤 선택 · ${action.title}`, body: `몸 상태가 돌아오고 이번 구성을 다시 안정적으로 마쳤을 때의 선택이에요. ${action.body}` };
        if (readiness.illness === "active" || !["ease", "plan-check", "check-intent"].includes(action.kind)) {
          const baseline = first ? workText || sets.map(format).join(" / ") : timedPattern && ex.durationMinutes ? `${ex.durationMinutes}분` : "이번에 기록한 운동";
          const body = readiness.illness === "active"
            ? "지금 아픈 상태라면 이번 기록을 다시 채우거나 더 늘리려 하지 말고 쉬는 쪽을 우선하세요. 증상이 심하거나 계속되면 의료진에게 확인하고, 회복한 뒤 가볍게 움직일 때의 반응부터 보세요."
            : readiness.illness === "recovering"
              ? `회복 중이라면 이전 최고 기록을 따라잡기보다 이번 ${baseline}를 잠정 출발점으로 두세요. 가볍게 준비하며 상태를 보고, 평소보다 버겁거나 증상이 다시 나타나면 멈추세요. 운동 뒤와 다음 날 반응까지 확인한 뒤 늘릴지 정해요.`
              : `오늘은 ${readiness.signals.join("·")}라고 남겼어요. 다음 운동은 가볍게 준비하며 이번 ${baseline}가 평소처럼 제어되는지 먼저 보세요. 버거우면 반복을 억지로 채우거나 세트를 보충하지 말고 부담을 낮추거나 쉬세요. 몸 상태가 돌아오면 이 수행에서 작은 변화를 다시 선택할 수 있어요.`;
          action = { kind: "maintain-recovery-work", title: readiness.illness === "active" ? "아픈 동안은 회복 먼저" : readiness.illness === "recovering" ? "회복 중에는 이번 수행부터 확인" : "오늘 상태에 맞춰 이번 수행 확인", body,
            focusSetIds: sets.map(set => set.id), provisional: true };
        } else action = { ...action, body: `${readiness.illness === "recovering" ? "질병 뒤 회복 중이니 운동 중·직후와 다음 날 반응을 먼저 보고, 증상이 다시 나타나면 멈추세요." : "오늘 남긴 몸 상태에 맞춰 가볍게 준비하고, 평소보다 버거우면 부담을 낮추거나 쉬세요."} ${action.body}` };
      } else if (!unsafe && !healthFollowUp && readiness?.signals.length && !readiness.strong && ["reps-option", "progression-option", "load-option"].includes(action.kind)) {
        action = { ...action, body: `오늘은 ${readiness.signals.join("·")}라고 남겼어요. 다음 몸풀기에서 평소보다 버겁지 않고 동작이 안정적인지 먼저 보세요. 상태가 평소와 비슷할 때 아래 작은 변화를 선택하고, 아니라면 이번 수행에 머물러도 돼요. ${action.body}` };
      }
      const supportCandidates = contextual ? [...(contextual.supportingActions || []), ...(["restore-tail", "maintain-base", "pacing"].includes(contextual.primaryAction?.kind) ? [contextual.primaryAction] : [])] : [];
      const planOutsideIds = new Set(planContext?.outsideSets.map(set => set.id) || []);
      const canSupport = !unsafe && !healthFollowUp && session.sourceKind !== "legacy-ocr" && (intent === "unknown" || intent === "regular");
      const supportingActions = canSupport ? supportCandidates.filter((item, index, items) => action.kind !== "plan-check" && item.body !== action.body
        && items.findIndex(other => other.kind === item.kind && other.body === item.body) === index
        && !item.focusSetIds?.some(id => planOutsideIds.has(id))
        && (!feedback && target?.rir !== 0 || !item.focusSetIds?.includes(target?.id)) && !["progression-option", "reps-option", "load-option"].includes(item.kind)).slice(0, 2) : [];
      if (canSupport && planEffortAction) {
        const belowIds = new Set(planEffortAction.focusSetIds);
        for (let index = supportingActions.length - 1; index >= 0; index--) if (supportingActions[index].focusSetIds?.some(id => belowIds.has(id))) supportingActions.splice(index, 1);
        if (!readiness?.strong && action.kind !== "plan-effort-check" && action.kind !== "ease") supportingActions.unshift(planEffortAction);
      }
      if (canSupport && action.kind === "plan-check") {
        const pacing = supportCandidates.find(item => ["restore-tail", "pacing", "rebalance-tail"].includes(item.kind));
        const tail = sets.filter(set => pacing?.focusSetIds?.includes(set.id) && planContext.reviewSets.some(item => item.id === set.id));
        if (tail.length) supportingActions.push({ kind: "plan-set-recovery", title: "뒤 세트의 휴식과 부담 함께 맞추기",
          body: `${tail.map(format).join(" / ")} 구간은 세트 사이에 충분히 쉬고, 계획한 ${planContext.min}~${planContext.max}회를 제어할 수 있는 부담인지 확인해 보세요. 빠진 반복을 억지로 채우거나 추가 세트로 보충하지는 않아요.`, focusSetIds: tail.map(set => set.id) });
        const within = planContext.withinSets.filter(set => set.rir !== 0);
        if (within.length) supportingActions.push({ kind: "preserve-plan-work", title: "범위 안의 세트는 그대로 이어가기",
          body: `${within.map(format).join(" / ")}는 계획한 반복 범위 안에 있어요. 동작과 여유가 유지되면 이번 수행으로 이어가고, 계획과 달랐던 구간을 확인하면서 이 세트까지 함께 올리지는 않아요.`, focusSetIds: within.map(set => set.id) });
        if (planContext.confirmedSets.length) supportingActions.push({ kind: "preserve-intended-target", title: "정한 반복 목표는 따로 이어가기",
          body: `${planContext.confirmedSets.map(format).join(" / ")}는 목표대로 마쳤다고 남긴 구간이에요. 이 반복 목표는 유지하고, 다른 구간의 계획 범위를 맞추면서 여기까지 함께 늘리지는 않아요.`, focusSetIds: planContext.confirmedSets.map(set => set.id) });
        if (planContext.extraSets.length && supportingActions.length < 2) supportingActions.push({ kind: "keep-extra-work-separate", title: "계획 뒤의 추가 세트는 따로 보기",
          body: `${planContext.extraSets.map(format).join(" / ")}는 계획 세트 뒤에 더 한 수행이에요. 이 세트에 계획 범위를 임의로 적용하지 않고 따로 남겨 두세요. 계획과 달랐던 구간을 맞추는 동안 추가 세트까지 늘리지는 않아요.`, focusSetIds: planContext.extraSets.map(set => set.id) });
      }
      if (canSupport && work && work.loads.length > 1) {
        const covered = new Set([...(action.focusSetIds || []), ...(action.preservedSetIds || []), ...supportingActions.flatMap(item => item.focusSetIds || [])]);
        const other = work.loads.map(load => ({ ...load, sets: work.sets.filter(set => load.setIds.includes(set.id) && !covered.has(set.id) && !planOutsideIds.has(set.id)) })).filter(load => load.sets.length);
        if (other.length && supportingActions.length < 2) supportingActions.push({ kind: "preserve-other-work", title: "나머지 중량 구간은 그대로 이어가기",
          body: `다른 구간의 ${other.map(load => `${load.loadKg === null ? "" : load.loadKg + "kg × "}${load.sets.map(set => set.reps).join("·")}회`).join(" / ")}도 이번 구성에 남겨 두세요. 조절할 세트와 이 구간을 동시에 올리지 않아요.`, focusSetIds: other.flatMap(load => load.sets.map(set => set.id)) });
      }
      const otherLimits = sets.filter(set => set.rir === 0 && set.id !== target?.id);
      if (canSupport && otherLimits.length) supportingActions.unshift({ kind: "hold-limit-set", title: "한계로 남긴 세트는 더 밀지 않기",
        body: `${otherLimits.map(format).join(" / ")}에는 RIR 0을 기록했어요. 그 세트는 이번 반복에서 마치고, 동작이 흐트러지면 ${ex.loadRole === "assistance" ? "보조를 더 받는 쪽으로" : loadedMovement ? "사용 가능한 작은 단계로 중량을 낮춰" : "더 제어하기 쉬운 조건으로"} 조절하세요. 앞 세트가 편했어도 이 구간까지 더 늘리지는 않아요.`, focusSetIds: otherLimits.map(set => set.id) });
      if (["reps-option", "load-option", "progression-option"].includes(action.kind)) for (const support of supportingActions) {
        if (support.kind !== "restore-tail" || support.focusSetIds.some(id => action.focusSetIds.includes(id))) continue;
        const preserved = sets.filter(set => support.focusSetIds.includes(set.id));
        support.body = `${preserved.map(format).join(" / ")}는 이번 반복으로 이어가세요. 세트 사이에 충분히 쉬고 뒤 세트까지 동작을 제어하며 마쳐요. 이번에는 선택한 세트에서만 변화를 시험하고 이 구간의 추가 반복까지 함께 늘리지는 않아요.`;
      }
      if (readiness?.strong && !unsafe) {
        if (readiness.illness === "active") supportingActions.length = 0;
        else for (const support of supportingActions) {
          if (["hold-limit-set", "preserve-other-work"].includes(support.kind)) continue;
          const preserved = sets.filter(set => support.focusSetIds?.includes(set.id));
          if (preserved.length) support.body = `${preserved.map(format).join(" / ")} 구간은 추가 반복을 목표로 밀지 말고, 세트 사이에 충분히 쉬며 이번 반복까지 제어되는지 보세요. 평소보다 버거우면 이 구간의 부담도 낮춰요.`;
        }
      }
      let assessment = unsafe || healthFollowUp ? summary : timedPattern ? summary : controlPattern ? `${summary} 이 운동은 횟수를 더 채우는 것보다 ${pattern === "scapular-control" ? "팔과 견갑" : "팔"}의 움직임을 부드럽게 제어하는 쪽에 집중해요.` : clarifiedAssessment || contextual?.assessment || structure.summary;
      if (action.kind === "plan-check") assessment = `${assessment.replace("이제 한 세트에서 작은 변화를 시험해 볼 수 있어요.", "").trim()} 다음에는 ${planContext.reviewSets.map(format).join(" / ")} 구간의 목표를 계획한 ${planContext.min}~${planContext.max}회와 먼저 맞춰 봐요.`;
      if (!unsafe && !healthFollowUp && planEffortAction && (intent === "unknown" || intent === "regular")) assessment = `${action.kind === "plan-effort-check" ? assessment.replace("이제 한 세트에서 작은 변화를 시험해 볼 수 있어요.", "").trim() : assessment} ${planEffort.belowSets.map(set => `${format(set)} RIR ${set.rir}`).join(" / ")} 기록에서는 정한 RIR ${planEffort.targetRir}보다 여유가 적었으니, 그 세트는 더 밀기보다 의도한 여유부터 맞춰요.`;
      if (readiness?.strong && !unsafe) assessment = assessment.replace("이제 한 세트에서 작은 변화를 시험해 볼 수 있어요.", "이 수행을 반복해 온 기준은 남아 있고, 다음 변화는 몸 상태가 돌아온 뒤 선택해요.");
      const coaching = { ...(contextual || {}), assessment, primaryAction: action, supportingActions, question: clarification,
        ...(planEffort ? { planEffort: { ...planEffort, source: { assignmentId: assignments[0].id, date: assignments[0].date, recordId: session.id, targetId: planned.id } } } : {}),
        ...(readiness?.present ? { recoveryContext: { ...readiness } } : {}),
        ...(healthFollowUp ? { healthFollowUp: { reports: unresolvedHealthReports.map(row => ({ ...row })) } } : {}),
        ...(recoveryProgressionCandidate ? { progressionCandidate: recoveryProgressionCandidate } : {}),
        userAnswer: ex.coachingAnswer ? { topic: ex.coachingAnswer.topic, answer: ex.coachingAnswer.answer, setIds: ex.coachingAnswer.sets.map(set => set.id) } : null,
        priority: unsafe || healthFollowUp ? 100 : action.kind === "check-intent" ? 90 : readiness?.strong ? Math.max(contextual?.priority || 0, 80) : feedback || planned ? Math.max(contextual?.priority || 0, 60) : contextual?.priority || 0 };
      row.interpretation = { basis: "record-observation", summary, structure, performance, coaching, observations, evidence: comparison.evidence, nextAction: action, reference: reference ? { sessionId: reference.session.id, blockId: reference.ex.id, date: reference.session.date, label: reference.session.label || null, contextMatched: !!ex.context?.contextKey && ex.context.contextKey === reference.ex.context?.contextKey } : null, conditions };
    }
    const question = broadReduction && intent === "unknown" && !unsafe && !healthFollowUp ? { id: "session-intent", title: "의도적으로 가볍게 한 운동인가요?", choices: [{ value: "deload", label: "디로드" }, { value: "technique", label: "가볍게·기술 연습" }, { value: "time-limited", label: "시간 부족" }, { value: "regular", label: "평소처럼 했음" }] } : null;
    const unknownGeneral = session.exercises.some(ex => ex.sets.some(set => set.marker === null && set.reps === null));
    let summary = !session.exercises.length ? "이번 일지는 운동 전체의 요약이에요. 다음에는 실제로 한 운동과 세트를 남기면 그 기록부터 이어갈 수 있어요." : broadReduction ? `${reduced.length}개 운동에서 중량·반복이나 세트 수가 함께 줄었어요.${intent === "unknown" ? " 디로드나 연습으로 줄인 날이면 이 방향을 유지하고, 평소처럼 했는데 힘들었다면 다음 운동의 부담부터 맞춰요." : ` ${intentLabels[intent]}로 정한 목적에 맞춰 이어가요.`}` : intent !== "unknown" ? `${intentLabels[intent]}의 목적에 맞춰 다음 운동을 이어가요.` : session.exercises.some(ex => general(ex).length) ? "이번에 해낸 세트에서 이어가되, 변화가 큰 운동부터 다음 목표를 맞춰요." : "이번에 남긴 운동 시간과 동작에서 이어가며 편안한 움직임부터 확인해요.";
    const blocks = session.exercises.map(ex => ({ blockId: ex.id, label: ex.label || ex.rawName, workingSets: general(ex).length, pattern: byId.get(ex.exerciseId)?.pattern || null, durationMinutes: ex.durationMinutes || null }));
    const muscleCounts = new Map();
    for (const ex of session.exercises) for (const muscle of byId.get(ex.exerciseId)?.primaryMuscles || []) muscleCounts.set(muscle, (muscleCounts.get(muscle) || 0) + general(ex).length);
    const distribution = [...muscleCounts].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([id, count]) => `${muscleLabels[id]} ${count}세트`);
    const composition = { blocks, summary: blocks.length ? `${blocks.slice(0, 8).map(block => `${block.label}${block.workingSets ? ` ${block.workingSets}세트` : block.durationMinutes ? ` ${block.durationMinutes}분` : ["cardio", "mobility"].includes(block.pattern) ? "" : " (세트 상세 추가 가능)"}`).join(" · ")}${blocks.length > 8 ? ` 외 ${blocks.length - 8}블록` : ""}.${distribution.length ? ` 직접 해당 부위: ${distribution.join(" · ")}.` : ""}${unknownGeneral ? " 반복이 비어 있는 세트는 별도로 남아 있어요." : ""}` : "" };
    const previousSession = sessions.filter(old => normalize(old.label) === normalize(session.label) && old.exercises.some(ex => general(ex).length)).at(-1);
    const sessionChanges = { previousSessionId: previousSession?.id || null, previousDate: previousSession?.date || null,
      currentWorkingSets: session.workingSets, previousWorkingSets: previousSession?.workingSets ?? null,
      currentMinutes: session.durationMinutes, previousMinutes: previousSession?.durationMinutes ?? null, added: [], removed: [], changedEquipment: [], paired: [], muscles: [] };
    if (previousSession) {
      const identities = old => {
        const groups = new Map();
        for (const ex of old.exercises) {
          const id = ex.exerciseId || "raw:" + normalize(ex.rawName);
          if (!groups.has(id)) groups.set(id, []);
          groups.get(id).push(ex);
        }
        return groups;
      };
      const now = identities(session), before = identities(previousSession);
      for (const [id, currentBlocks] of now) {
        const ex = currentBlocks[0];
        if (!before.has(id)) sessionChanges.added.push({ blockId: ex.id, blockIds: currentBlocks.map(block => block.id), label: ex.label });
        else {
          const priorBlocks = before.get(id), old = priorBlocks[0];
          if (currentBlocks.length === 1 && priorBlocks.length === 1 && ex.equipmentKey && old.equipmentKey && ex.equipmentKey !== old.equipmentKey) sessionChanges.changedEquipment.push({ blockId: ex.id, label: ex.label, previousEquipment: old.equipmentKey, currentEquipment: ex.equipmentKey });
          sessionChanges.paired.push({ blockIds: currentBlocks.map(block => block.id), previousBlockIds: priorBlocks.map(block => block.id), label: ex.label,
            currentSets: currentBlocks.reduce((total, block) => total + general(block).length, 0), previousSets: priorBlocks.reduce((total, block) => total + general(block).length, 0) });
        }
      }
      for (const [id, blocks] of before) if (!now.has(id)) sessionChanges.removed.push({ blockId: blocks[0].id, blockIds: blocks.map(block => block.id), label: blocks[0].label });
      const priorMuscles = new Map();
      for (const ex of previousSession.exercises) for (const muscle of byId.get(ex.exerciseId)?.primaryMuscles || []) priorMuscles.set(muscle, (priorMuscles.get(muscle) || 0) + general(ex).length);
      sessionChanges.muscles = [...new Set([...muscleCounts.keys(), ...priorMuscles.keys()])].map(id => ({ id, label: muscleLabels[id],
        currentDirectSets: muscleCounts.get(id) || 0, previousDirectSets: priorMuscles.get(id) || 0 }));
    }
    const heavyChanges = review.rows.filter(row => Coaching.isCoordinationMovement(byId.get(session.exercises.find(ex => ex.id === row.blockId)?.exerciseId))
      && row.interpretation.coaching.signals?.some(signal => signal.kind === "new-heavy-exposure"));
    for (const row of review.rows) {
      const coaching = row.interpretation.coaching;
      const reference = row.interpretation.reference;
      if (previousSession && reference && reference.sessionId !== previousSession.id && !coaching.assessment.startsWith(reference.date)) coaching.assessment = `${reference.date}${reference.label ? ` ${reference.label}` : ""} 기록에서 이어보면, ${coaching.assessment}`;
      if (!coaching.signals?.some(signal => signal.kind === "heavier-work-removed")) continue;
      const movement = session.exercises.find(ex => ex.id === row.blockId), muscles = byId.get(movement.exerciseId)?.primaryMuscles || [];
      if (!Coaching.isCoordinationMovement(byId.get(movement.exerciseId))) continue;
      const related = heavyChanges.find(other => {
        const candidate = session.exercises.find(ex => ex.id === other.blockId), description = byId.get(candidate.exerciseId);
        return [...(description?.primaryMuscles || []), ...(description?.secondaryMuscles || [])].some(muscle => muscles.includes(muscle));
      });
      if (related && !unsafe && !healthFollowUp) {
        coaching.signals.push({ kind: "related-heavy-work-changed", otherBlockId: related.blockId, orderConfirmed: !!movement.context?.executionPosition,
          sourceRefs: [coaching.facts.current.source, related.interpretation.coaching.facts.current.source] });
        coaching.assessment += ` 같은 날 ${related.rawName || related.label}에는 더 무거운 세트를 넣었어요. 두 운동의 부담 배분도 함께 바뀐 날이에요.`;
        coaching.supportingActions.push({ kind: "coordinate-related-work", title: "두 운동의 우선순위 맞추기",
          body: `${related.rawName || related.label}의 무거운 세트를 유지할 때는 ${row.rawName || row.label}까지 함께 올리기보다 이번 구성을 이어가세요. 반대로 이 운동을 우선할 날에는 힘이 남아 있을 때 배치하고, 준비 세트에서 무거운 중량을 다시 확인해요.`, focusSetIds: coaching.facts.current.source.setIds.slice() });
      }
    }
    const changesRequiringFocus = review.rows.filter(row => row.interpretation.coaching.priority >= 70 && row.interpretation.coaching.signals?.length);
    const progressionCandidates = review.rows.filter(row => ["progression-option", "reps-option", "load-option"].includes(row.interpretation.nextAction.kind));
    const preferences = getReviewPreferences(options.preferences);
    const priorityOrder = (a, b) => {
      const kinds = { main: 0, focus: 1, suggested: 2, other: 3 };
      const mainRank = row => Math.min(...row.mainKeys.map(key => preferences.mainExerciseKeys.indexOf(key)).filter(index => index >= 0), Infinity);
      return (kinds[a.priorityKind] ?? 3) - (kinds[b.priorityKind] ?? 3) || mainRank(a) - mainRank(b) || a.diaryPosition - b.diaryPosition;
    };
    const explicitCandidate = progressionCandidates.filter(row => session.exercises.find(ex => ex.id === row.blockId)?.feedback).sort(priorityOrder)[0];
    const movementFor = row => byId.get(session.exercises.find(ex => ex.id === row.blockId)?.exerciseId);
    const currentMuscles = row => movementFor(row)?.primaryMuscles || [];
    const intersects = (a, b) => a.blockId !== b.blockId && Coaching.isCoordinationMovement(movementFor(a)) && Coaching.isCoordinationMovement(movementFor(b))
      && (currentMuscles(a).some(muscle => currentMuscles(b).includes(muscle))
      || movementFor(a)?.pattern && movementFor(a).pattern === movementFor(b)?.pattern);
    const currentExposure = Coaching.coordinationExposure(session.exercises, catalog);
    const previousExposure = Coaching.coordinationExposure(previousSession?.exercises, catalog);
    const expandedSession = !!previousSession && currentExposure.workingSets > previousExposure.workingSets;
    const expandedMuscles = new Set((previousSession ? Object.keys(currentExposure.byMuscle) : [])
      .filter(muscle => currentExposure.byMuscle[muscle] > (previousExposure.byMuscle[muscle] || 0)));
    const relatedChange = row => changesRequiringFocus.find(other => intersects(row, other));
    const localExpansion = row => Coaching.isCoordinationMovement(movementFor(row)) && currentMuscles(row).some(muscle => expandedMuscles.has(muscle));
    const increasedWorkContext = row => {
      const changes = sessionChanges.muscles.filter(item => expandedMuscles.has(item.id) && currentMuscles(row).includes(item.id));
      const muscles = changes.map(item => item.label).join("·"), before = `${previousSession.date} ${previousSession.label || "운동"}`, now = session.label || "운동";
      const workLabel = changes.some(item => item.currentDirectSets !== (currentExposure.byMuscle[item.id] || 0)
        || item.previousDirectSets !== (previousExposure.byMuscle[item.id] || 0)) ? "주" : "직접";
      return changes.every(item => (previousExposure.byMuscle[item.id] || 0) === 0)
        ? `${before}에는 없던 ${muscles} ${workLabel} 운동을 이번 ${now}에 넣었어요.`
        : `${before}와 이번 ${now} 구성을 비교하면 ${muscles} ${workLabel} 운동 세트가 늘었어요.`;
    };
    const deferredCandidates = progressionCandidates.filter(row => !session.exercises.find(ex => ex.id === row.blockId)?.feedback
      && (relatedChange(row) || localExpansion(row)));
    const eligibleCandidates = progressionCandidates.filter(row => !deferredCandidates.includes(row)).sort(priorityOrder);
    const adjustment = changesRequiringFocus.filter(row => ["restore-tail", "keep-base-check-heavy", "reestablish-working-reps"].includes(row.interpretation.nextAction.kind)
      || row.interpretation.coaching.supportingActions.some(item => item.kind === "restore-tail")).sort((a, b) => b.interpretation.coaching.priority - a.interpretation.coaching.priority || priorityOrder(a, b))[0];
    const selectedCandidate = explicitCandidate || eligibleCandidates[0];
    const coordination = { basis: "product-choice", mode: changesRequiringFocus.length || expandedSession ? "consolidate-changes" : "local-progression-options",
      priorityBlockIds: changesRequiringFocus.map(row => row.blockId), selectedProgressionBlockId: selectedCandidate?.blockId || null,
      selectedAdjustmentBlockId: !explicitCandidate ? adjustment?.blockId || null : null,
      alternativeProgressionBlockIds: deferredCandidates.map(row => row.blockId), summary: "" };
    if (!unsafe && !healthFollowUp && (intent === "unknown" || intent === "regular") && session.sourceKind !== "legacy-ocr") {
      for (const row of deferredCandidates) {
        const coaching = row.interpretation.coaching, selectedWork = coaching.facts?.current;
        if (!selectedWork) continue;
        coaching.progressionCandidate = { ...row.interpretation.nextAction };
        const related = relatedChange(row);
        const reason = localExpansion(row) ? `${increasedWorkContext(row)} 그 구성을 먼저 소화해요.`
          : `주로 쓰는 부위나 동작이 겹치는 ${related.rawName || related.label}의 달라진 구간을 먼저 안정시켜요.`;
        const body = `${selectedWork.segments.map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ")}는 이번 구성으로 이어가세요. ${reason} 이 종목을 우선해서 바꾸고 싶다면 겹치는 운동의 추가 변화는 미루고 아래 선택지를 시험할 수 있어요.`;
        row.interpretation.nextAction = { kind: "maintain-coordinated-work", title: "다른 운동의 변화와 함께 맞추기", body, focusSetIds: selectedWork.source.setIds.slice(), provisional: true };
        coaching.primaryAction = row.interpretation.nextAction;
        coaching.supportingActions = coaching.supportingActions.filter(item => !["preserve-other-work", "maintain-base"].includes(item.kind));
        coaching.assessment = coaching.assessment.replace(/이제 한 세트에서 작은 변화를 시험해 볼 수 있어요\.$/, "반복·부하를 조금 바꿔 볼 후보이고, 다른 운동의 변화와 함께 순서를 정해요.");
      }
      if (changesRequiringFocus.length || expandedSession) for (const row of review.rows) {
        const coaching = row.interpretation.coaching, ex = session.exercises.find(exercise => exercise.id === row.blockId);
        const unselectedAdjustment = row.blockId !== coordination.selectedAdjustmentBlockId && ["restore-tail", "keep-base-check-heavy"].includes(row.interpretation.nextAction.kind);
        const related = relatedChange(row), increased = localExpansion(row);
        if (row.interpretation.nextAction.kind !== "repeat" && !unselectedAdjustment || !related && !increased
          || ex.feedback || coaching.userAnswer || !coaching.facts?.current?.setCount) continue;
        coaching.progressionCandidate = { ...row.interpretation.nextAction };
        const preserved = coaching.facts.current;
        const reason = increased ? `${increasedWorkContext(row)} 새 구성을 먼저 확인해요.`
          : `주로 쓰는 부위나 동작이 겹치는 ${related.rawName || related.label}의 달라진 구간을 먼저 챙겨요.`;
        const body = `${preserved.segments.map(segment => `${segment.loadKg === null ? "" : segment.loadKg + "kg × "}${segment.reps.join("·")}회`).join(" / ")}는 이번 세트 수로 이어가세요. ${preserved.loads.some(load => load.setCount > 1 && load.reps.at(-1) < load.reps[0]) ? "세트 사이에 충분히 쉬고 뒤 반복까지 제어하며 마쳐요." : "마지막 세트까지 동작과 반복을 유지해요."} ${reason} 이 종목을 우선할 때는 아래 선택지에서 이어갈 수 있어요.`;
        row.interpretation.nextAction = { kind: "maintain-coordinated-work", title: unselectedAdjustment ? "이번 뒤 세트까지 제어하며 마치기" : "이번 구성으로 다른 운동과 맞추기", body, focusSetIds: preserved.source.setIds.slice(), provisional: true };
        coaching.primaryAction = row.interpretation.nextAction;
        coaching.supportingActions = coaching.supportingActions.filter(item => !["preserve-other-work", "maintain-base"].includes(item.kind));
      }
      if (progressionCandidates.length || adjustment) coordination.summary = [adjustment ? `${adjustment.rawName || adjustment.label}에서 줄었던 구간을 먼저 맞춰요.` : "",
        selectedCandidate ? `${selectedCandidate.rawName || selectedCandidate.label}에는 한 세트의 작은 변화를 시험할 선택도 있어요.${review.rows.length > 1 ? " 다른 종목은 각자의 수행에서 이어가고, 겹치는 운동끼리는 추가 변화를 조율해요." : " 반복과 부하를 동시에 올리지는 않아요."}`
          : `이번에 달라진 중량 구간${expandedSession ? "과 늘어난 세트를" : "을"} 먼저 안정시켜요.${review.rows.length > 1 ? " 겹치는 운동의 다음 선택은 그 구간이 잘 이어지는지 보고 정해요." : " 뒤 구간까지 잘 이어지는지 보고 다음 선택을 정해요."}`].filter(Boolean).join(" ");
    }
    const focusedRows = review.rows.filter(row => row.sets.length).map((row, index) => ({ row, index })).sort((a, b) =>
      Number(b.row.interpretation.coaching.priority >= 70) - Number(a.row.interpretation.coaching.priority >= 70)
      || (a.row.interpretation.coaching.priority >= 70 && b.row.interpretation.coaching.priority >= 70 ? b.row.interpretation.coaching.priority - a.row.interpretation.coaching.priority : 0)
      || priorityOrder(a.row, b.row)).slice(0, 2).map(item => item.row);
    const focus = focusedRows.map(row => `${row.rawName || row.label}: ${row.interpretation.coaching.assessment}`);
    const actions = focusedRows.map(row => ({ blockId: row.blockId, title: `${row.rawName || row.label} · ${row.interpretation.nextAction.title}`,
      body: [row.interpretation.nextAction.body, ...row.interpretation.coaching.supportingActions.map(action => action.body)].join(" ") }));
    if (intent === "unknown" && !broadReduction && session.exercises.length && focusedRows.length) {
      const changes = [];
      const conciseNames = items => items.slice(0, 2).map(item => item.label).join("·") + (items.length > 2 ? ` 등 ${items.length}종목` : "");
      if (sessionChanges.changedEquipment.length) changes.push(`${conciseNames(sessionChanges.changedEquipment)} 운동은 다른 장비로 했어요`);
      const strengthChange = items => items.filter(item => Coaching.isCoordinationMovement({ pattern: blocks.find(block => block.blockId === item.blockId)?.pattern || byId.get(previousSession?.exercises.find(ex => ex.id === item.blockId)?.exerciseId)?.pattern }));
      const added = strengthChange(sessionChanges.added), removed = strengthChange(sessionChanges.removed);
      if (added.length && removed.length) changes.push(`직전 구성의 ${conciseNames(removed)} 대신 이번에는 ${conciseNames(added)} 운동을 넣었어요`);
      else if (added.length) changes.push(`직전 구성에 없던 ${conciseNames(added)} 운동을 넣었어요`);
      else if (removed.length) changes.push(`직전 구성의 ${conciseNames(removed)} 운동은 이번에 하지 않았어요`);
      const muscleChanges = sessionChanges.muscles.filter(item => item.currentDirectSets !== item.previousDirectSets).sort((a, b) => Math.abs(b.currentDirectSets - b.previousDirectSets) - Math.abs(a.currentDirectSets - a.previousDirectSets)).slice(0, 2);
      if (previousSession && session.workingSets !== previousSession.workingSets) changes.push(`기록한 운동 세트는 ${previousSession.workingSets}세트에서 ${session.workingSets}세트로 ${session.workingSets > previousSession.workingSets ? "늘었어요" : "줄었어요"}${muscleChanges.length ? ` (${muscleChanges.map(item => `${item.label} 직접 운동 ${item.previousDirectSets}→${item.currentDirectSets}세트`).join(" · ")})` : ""}`);
      const changing = focusedRows.filter(row => row.interpretation.coaching.priority >= 60);
      const controlOnly = focusedRows.every(row => ["technique-control", "cardio", "mobility"].includes(row.interpretation.nextAction.kind));
      const lead = controlOnly ? "이번 동작과 시간을 편안하게 이어가며 부드러운 제어부터 유지해요."
        : changing.length ? `이번에는 ${changing.map(row => row.rawName || row.label).join("·")}의 변화부터 챙겨요.`
          : previousSession ? "익숙한 구성을 이어간 운동이에요. 다음에도 각 운동의 뒤 구간까지 안정적으로 마치고, 여유가 있는지 봐요."
            : "이번에 수행한 세트부터 다음 운동을 이어가요. 중량과 세트 수를 함께 늘리기보다 마지막까지 유지되는지 먼저 봐요.";
      summary = [lead, changes.length ? `${previousSession.date}의 ${previousSession.label} 기록과 비교했어요. ` + changes.join(". ") + "." : "", coordination.summary].filter(Boolean).join(" ");
    }
    if (painCaution) summary = `통증을 유발하는 운동은 멈추고 현재 증상부터 확인하세요. 이번 수행은 기록으로 남기되, 통증을 참고 반복·중량을 더 밀지 않아요. 중단이 필요한 통증이라면 전문가 평가가 우선이에요.${readiness?.illness === "active" ? " 지금 아픈 상태도 함께 남겼으니 통증 없는 다른 운동으로 이번 분량을 채우기보다 회복을 우선하세요." : ""}`;
    else if (readiness?.illness === "active") summary = `지금 아픈 상태라면 이번 운동을 다시 채우거나 더 늘리려 하지 말고 회복을 우선하세요. 증상이 심하거나 계속되면 의료진에게 확인하고, 회복한 뒤 ${clinical ? "개별 계획에 맞춰 " : ""}다음 수행을 정해요. 이번에 남긴 수행은 실제 기록으로 남아 있어요.`;
    else if (clinical) summary = "이번 수행은 기록으로 살펴보되, 다음 훈련의 강도와 구성은 현재 상태를 아는 전문가의 개별 계획에 맞춰 주세요. 기록이 좋아졌거나 복귀·테스트 목적이라고 자동으로 부담을 늘리지 않아요.";
    else if (healthFollowUp) summary = healthFollowUpBody;
    else if (unsafe) summary = "여러 번 낮아진 수행과 최근 회복 신호를 함께 살펴볼 때예요. 다음에는 가볍게 준비하며 상태를 확인하고, 버거우면 부담을 낮추거나 쉬세요. 줄었던 반복을 한꺼번에 채우기보다 수면·피로·식사와 운동 목적을 함께 보고 조절해요.";
    else if (readiness?.illness === "recovering") summary = "질병 뒤 회복 중이니 이번 수행은 잠정 출발점으로 두고, 운동 중·직후와 다음 날 반응부터 확인해요. 평소보다 버겁거나 증상이 다시 나타나면 멈추세요. 운동 목적과 관계없이 더 늘릴 선택은 몸 상태가 돌아온 뒤 정해요.";
    else if (readiness?.strong && (intent === "unknown" || intent === "regular")) summary = "오늘 남긴 몸 상태에 맞춰 가볍게 준비하고 이번 수행이 평소처럼 이어지는지 먼저 보세요. 운동별 변화는 아래 기록대로 남겨 두고, 더 늘릴 선택은 몸 상태가 돌아온 뒤 이어가요.";
    return { ...review, sessionCoaching: { summary, composition, focus, actions, question, intent, pattern: broadReduction ? "broad-reduction" : "ordinary", reducedExercises: reduced, sessionChanges, coordination } };
  }

  function recommendProgram(profile, settings = {}, analysis = {}, preferences = {}) {
    settings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    analysis = analysis && typeof analysis === "object" && !Array.isArray(analysis) ? analysis : {};
    const limitations = ["일반 성인의 시작용 예시이며 자세 평가·의료 재활·대회 준비 프로그램이 아니에요.", "프로그램을 만들었다고 실제 운동 기록이나 영양 목표가 바뀌지 않아요.", "반복 범위·RIR·휴식·시간 예산과 분할 구성은 보수적인 제품 선택이며 개인의 최적점은 아니에요."];
    const result = (status, reason, days = [], name = "개인 기준을 먼저 확인해요") => ({ status, name, reason, days, progression: status === "ready" ? "같은 장비와 중량 기준에서 계획한 모든 일반 세트의 반복 상단과 목표 RIR을 서로 다른 두 날 충족하면, 다음에는 사용 가능한 가장 작은 중량 증가부터 검토하세요. 상단에 못 미치면 중량을 억지로 올리지 않아요." : "현재는 자동 증량이나 운동량 증가를 제안하지 않아요. 확인이 필요한 맥락부터 살펴 주세요.", deload: "수행이 여러 번 낮아지고 회복 신호가 함께 있을 때 원인을 확인한 뒤 훈련 스트레스를 줄이는 방안을 검토해요. 정해진 주기마다 반드시 디로드하거나 하루 하락만으로 결정하지 않아요.", limitations: [...limitations] });
    if (analysis.recovery?.status === "stop") return result("review", "통증을 유발하는 운동은 중단하고 개별 평가를 먼저 받아 주세요. 새 운동 계획을 내지 않았어요.");
    if (!profile || !finite(profile.age) || typeof profile.healthContext !== "string") return result("incomplete", "나이와 건강 상태를 먼저 확인해 주세요. 미확인 값으로 운동 계획을 만들지 않아요.");
    if (profile.healthContext !== "general" || profile.age < 18 || profile.age > 80 || analysis.recovery?.status === "review") return result("review", "현재 건강·통증·회복 맥락을 확인한 뒤 개인에게 맞게 계획해야 해요. 일반 템플릿을 강제로 적용하지 않았어요.");
    const { daysPerWeek, sessionMinutes, equipment } = settings;
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 6 || !finite(sessionMinutes) || sessionMinutes < 20 || sessionMinutes > 150 || !["gym", "home", "bodyweight"].includes(equipment) || (settings.priorityMuscles !== undefined && (!Array.isArray(settings.priorityMuscles) || settings.priorityMuscles.some(id => !Object.hasOwn(muscleLabels, id))))) return result("incomplete", "주 1~6회, 회당 20~150분, 사용 가능한 장비와 우선 부위를 확인해 주세요.");
    const priority = new Set(settings.priorityMuscles || []);
    const excluded = new Set(Array.isArray(preferences.excludedExerciseIds) ? preferences.excludedExerciseIds : []);
    const preferred = (Array.isArray(preferences.preferredExerciseIds) ? preferences.preferredExerciseIds : []).filter(id => byId.has(id) && !excluded.has(id));
    const years = finite(profile.trainingYears) && profile.trainingYears >= 0 ? profile.trainingYears : null;
    const endurance = ["running", "cycling", "swimming", "team"].includes(profile.sport);
    const desiredSets = years !== null && years >= 1 && !endurance && ["gain", "recomp"].includes(profile.goal) && analysis.recovery?.status !== "watch" ? 3 : 2;
    const rir = years === null || years < 1 || analysis.recovery?.status === "watch" ? 3 : 2;
    const pools = equipment === "gym" ? {
      full: ["leg_press", "bench_press", "seated_cable_row", "romanian_deadlift", "dumbbell_shoulder_press", "dead_bug"],
      upper: ["bench_press", "lat_pulldown", "dumbbell_shoulder_press", "seated_cable_row", "dumbbell_curl", "triceps_pushdown"],
      lower: ["leg_press", "romanian_deadlift", "leg_curl", "leg_extension", "calf_raise", "dead_bug"],
      push: ["bench_press", "dumbbell_shoulder_press", "incline_dumbbell_press", "dumbbell_lateral_raise", "triceps_pushdown"],
      pull: ["lat_pulldown", "seated_cable_row", "face_pull", "dumbbell_curl", "hammer_curl"]
    } : equipment === "home" ? {
      full: ["goblet_squat", "dumbbell_floor_press", "dumbbell_row", "dumbbell_rdl", "dumbbell_shoulder_press", "dead_bug"],
      upper: ["dumbbell_floor_press", "dumbbell_row", "dumbbell_shoulder_press", "dumbbell_lateral_raise", "dumbbell_curl", "dumbbell_triceps_extension"],
      lower: ["goblet_squat", "dumbbell_rdl", "dumbbell_lunge", "glute_bridge", "calf_raise", "dead_bug"],
      push: ["dumbbell_floor_press", "dumbbell_shoulder_press", "push_up", "dumbbell_lateral_raise", "dumbbell_triceps_extension"],
      pull: ["dumbbell_row", "prone_w_raise", "dumbbell_curl", "hammer_curl", "dead_bug"]
    } : {
      full: ["bodyweight_squat", "push_up", "glute_bridge", "prone_w_raise", "lunge", "dead_bug"],
      upper: ["push_up", "prone_w_raise", "dead_bug"],
      lower: ["bodyweight_squat", "glute_bridge", "lunge", "calf_raise", "side_lying_abduction", "dead_bug"],
      push: ["push_up", "prone_w_raise", "dead_bug"],
      pull: ["prone_w_raise", "glute_bridge", "dead_bug"]
    };
    if (equipment === "home") limitations.push("홈 운동은 덤벨을 보유한 경우의 예시예요. 덤벨이 없다면 맨몸 설정을 사용하고 장비를 임의로 대체하지 마세요.");
    if (equipment === "bodyweight") limitations.push("추가 장비 없는 맨몸 구성은 강하게 당기는 운동과 점진적 부하에 제한이 있어요. W 레이즈는 로우·풀업과 동등한 대체 운동이 아니에요.");
    if (years === null) limitations.push("운동 경력이 비어 있어 횟수로 추측하지 않고 적은 세트와 여유 있는 RIR로 시작했어요.");
    if (endurance) limitations.push("본 종목의 훈련·경기 일정이 없어 근력 보완용으로 적은 세트부터 제시해요. 강한 본 훈련과의 배치는 별도로 확인해야 해요.");
    if (daysPerWeek === 1) limitations.push("주 1회는 실행 가능한 시작점이지만 모든 부위를 주 2회 이상 훈련하는 일반 권고에는 못 미쳐요.");
    if (sessionMinutes < 35) limitations.push("짧은 시간에 맞춰 일부 동작을 생략했어요. 적힌 모든 부위를 충분히 훈련했다고 보지 마세요.");
    const layouts = { 1: ["full"], 2: ["full", "full"], 3: ["full", "full", "full"], 4: ["upper", "lower", "upper", "lower"], 5: ["upper", "lower", "push", "pull", "lower"], 6: ["push", "pull", "lower", "push", "pull", "lower"] };
    const labels = { full: "전신", upper: "상체", lower: "하체", push: "밀기", pull: "당기기" };
    const days = layouts[daysPerWeek].map((type, dayIndex) => {
      let ids = [...pools[type]];
      if (type === "full" && dayIndex % 2) ids = [ids[3], ids[2], ids[1], ids[0], ...ids.slice(4)];
      const extra = equipment === "gym" ? { chest: "cable_fly", back: "lat_pulldown", shoulders: "dumbbell_lateral_raise", biceps: "dumbbell_curl", triceps: "triceps_pushdown", quads: "leg_extension", hamstrings: "leg_curl", glutes: "glute_bridge", calves: "calf_raise", core: "dead_bug", hip_adductors: "hip_adduction", hip_abductors: "hip_abduction" } : { chest: equipment === "home" ? "dumbbell_floor_press" : "push_up", back: equipment === "home" ? "dumbbell_row" : "prone_w_raise", shoulders: "prone_w_raise", biceps: equipment === "home" ? "dumbbell_curl" : null, triceps: equipment === "home" ? "dumbbell_triceps_extension" : "push_up", quads: "bodyweight_squat", hamstrings: equipment === "home" ? "dumbbell_rdl" : "glute_bridge", glutes: "glute_bridge", calves: "calf_raise", core: "dead_bug", hip_adductors: "side_lying_adduction", hip_abductors: "side_lying_abduction" };
      const priorityIds = [...priority].map(id => extra[id]).filter(Boolean);
      ids = [...ids.slice(0, 4), ...priorityIds, ...ids.slice(4)].filter((id, index, all) => all.indexOf(id) === index).slice(0, 6);
      const available = equipment === "gym" ? new Set(catalog.map(row => row.id)) : new Set([...Object.values(pools).flat(), ...Object.values(extra).filter(Boolean)]);
      ids = ids.map(id => preferred.find(other => available.has(other) && byId.get(other).pattern === byId.get(id).pattern) || id)
        .filter((id, index, all) => !excluded.has(id) && all.indexOf(id) === index);
      const output = [];
      let seconds = 300;
      const restFor = id => ["squat", "hinge", "horizontal-push", "horizontal-pull", "vertical-push", "vertical-pull", "lunge"].includes(byId.get(id).pattern) ? 120 : 90;
      const schedule = ids.slice(0, 4).map(id => ({ id, add: false }));
      if (desiredSets === 3) schedule.push(...ids.slice(0, 4).sort((a, b) => Number(byId.get(b).primaryMuscles.some(m => priority.has(m))) - Number(byId.get(a).primaryMuscles.some(m => priority.has(m)))).map(id => ({ id, add: true })));
      for (const id of ids.slice(4)) { schedule.push({ id, add: false }); if (desiredSets === 3) schedule.push({ id, add: true }); }
      for (const step of schedule) {
        const restSeconds = restFor(step.id);
        const cost = step.add ? restSeconds + 40 : 45 + 80 + restSeconds;
        if (seconds + cost > sessionMinutes * 60) break;
        if (step.add) output.find(row => row.exerciseId === step.id).sets++;
        else output.push({ exerciseId: step.id, label: byId.get(step.id).label, sets: 2, reps: ["core", "calf", "shoulder-isolation", "scapular-control", "hip-adduction", "hip-abduction"].includes(byId.get(step.id).pattern) ? "10-15" : "8-12", rir, restSeconds });
        seconds += cost;
      }
      return { label: `${dayIndex + 1}일차 · ${labels[type]}`, exercises: output, estimatedMinutes: Math.floor(seconds / 6) / 10 };
    });
    const unserved = [...priority].filter(id => !days.some(day => day.exercises.some(row => byId.get(row.exerciseId).primaryMuscles.includes(id))));
    if (unserved.length) limitations.push(`${unserved.map(id => muscleLabels[id]).join("·")} 우선 요청은 현재 시간·장비 구성에서 직접 동작으로 채우지 못했어요. 시간을 확보하거나 가능한 장비를 확인한 뒤 조정해 주세요.`);
    if (excluded.size) limitations.push("제외한 운동은 초안에서 뺐어요. 빠진 움직임을 모두 대체한 것은 아니므로 저장 전에 구성을 확인해 주세요.");
    if (days.some(day => !day.exercises.length)) return result("incomplete", "제외 운동과 시간 조건 때문에 비어 있는 세션이 있어요. 조건을 조정한 뒤 다시 구성해 주세요.");
    return result("ready", `${daysPerWeek}회와 회당 ${sessionMinutes}분에 맞춘 시작 계획이에요. ${priority.size ? "우선 부위는 보조 동작 선택과 순서에 반영했어요." : "주요 움직임을 나누어 배치했어요."} 세트 수는 근성장 보장량이 아니며 통증·회복과 실제 기록에 따라 검토해야 해요.`, days, daysPerWeek <= 3 ? "전신 기본 계획" : daysPerWeek === 4 ? "상체·하체 분할" : "밀기·당기기·하체 분할");
  }

  function createProgram(draft, options = {}) {
    if (draft?.status !== "ready" || !text(options.id) || !text(options.createdAt)) throw new Error("저장할 시작 계획과 식별자·작성 시각이 필요해요.");
    return { id: options.id, name: text(options.name) || draft.name, createdAt: options.createdAt, source: options.source || "template",
      days: draft.days.map((day, index) => ({ id: `${options.id}:day:${index}`, label: day.label,
        exercises: day.exercises.map((row, x) => { const parts = String(row.reps).split("-").map(Number); return {
          id: `${options.id}:day:${index}:exercise:${x}`, exerciseId: row.exerciseId, label: row.label,
          sets: row.sets, repsMin: parts[0], repsMax: parts[1] ?? parts[0], rir: row.rir, restSeconds: row.restSeconds,
          loadKg: null, equipmentKey: null, loadConvention: "as-recorded"
        }; }) })) };
  }
  function createAssignment(program, dayId, date, id) {
    const day = program?.days?.find(row => row.id === dayId);
    if (!day || dateNumber(date) === null || !text(id)) throw new Error("배치할 세션과 실제 날짜를 확인해 주세요.");
    return { id, date, programId: program.id, dayId, prescription: JSON.parse(JSON.stringify(day)), recordId: null, status: "planned", adjustment: null };
  }
  function evaluateAssignment(assignment, records = [], mappings = []) {
    const record = records.find(row => row.id === assignment.recordId);
    if (!record || assignment.status !== "performed") return { status: assignment.status === "skipped" ? "skipped" : "unrecorded", rows: [], restVerified: false, message: assignment.status === "skipped" ? "사용자가 수행하지 않았다고 표시한 계획이에요. 휴식 여부는 별개예요." : "연결된 실제 일지가 없어요. 운동하지 않았거나 쉬었다고 판단하지 않아요." };
    if (record.date !== assignment.date) return { status: "review", rows: [], restVerified: false, message: "계획과 연결한 일지의 날짜가 달라 수행을 비교하지 않았어요." };
    const described = record.exercises.map(row => ({ ...row, description: describeExercise(row, mappings) }));
    const confirmedEquipment = row => ["record", "mapping"].includes(row.description.equipmentSource);
    const usedSets = new Set(), usedSetIds = new Set();
    const rows = assignment.prescription.exercises.map(target => {
      const exercises = described.filter(row => (row.description.resolved?.id || row.exerciseId) === target.exerciseId
        && (target.equipmentKey === null || !confirmedEquipment(row) || row.description.equipmentKey === target.equipmentKey));
      const identities = new Set(exercises.map(row => JSON.stringify([row.description.equipmentKey, row.description.loadConvention, row.description.variantKey])));
      const repeatedTarget = assignment.prescription.exercises.filter(row => row.exerciseId === target.exerciseId && (row.equipmentKey === null || target.equipmentKey === null || row.equipmentKey === target.equipmentKey)).length > 1;
      const uncertainMatch = identities.size > 1 || target.equipmentKey !== null && exercises.some(row => !confirmedEquipment(row))
        || repeatedTarget && (record.sequence?.order !== "listed" || record.sequence?.structure !== "straight");
      const availableSetIds = new Set();
      const sets = exercises.flatMap(row => row.sets.filter(set => {
        if (set.marker !== null || usedSets.has(set) || text(set.id) && (usedSetIds.has(set.id) || availableSetIds.has(set.id))) return false;
        if (text(set.id)) availableSetIds.add(set.id);
        return true;
      }));
      const observed = sets.slice(0, target.sets), complete = observed.length === target.sets;
      observed.forEach(set => { usedSets.add(set); if (text(set.id)) usedSetIds.add(set.id); });
      const knownReps = complete && !uncertainMatch && observed.every(set => finite(set.reps));
      const knownRir = complete && !uncertainMatch && observed.every(set => finite(set.rir));
      const repRangeMet = knownReps ? observed.every(set => set.reps >= target.repsMin && set.reps <= target.repsMax) : null;
      const rirMet = knownRir ? observed.every(set => set.rir >= target.rir) : null;
      const comparableLoad = !uncertainMatch && target.equipmentKey !== null && target.loadConvention !== "as-recorded" && exercises.length > 0
        && exercises.every(row => confirmedEquipment(row)
          && row.description.equipmentKey === target.equipmentKey && row.description.loadConvention === target.loadConvention && row.description.loadRole === "external");
      const loadMet = target.loadKg !== null && comparableLoad && complete && observed.every(set => finite(set.loadKg)) ? observed.every(set => set.loadKg === target.loadKg) : null;
      const unknown = repRangeMet === null || rirMet === null || target.loadKg !== null && loadMet === null;
      return { id: target.id, exerciseId: target.exerciseId, label: target.label, plannedSets: target.sets, recordedSets: sets.length,
        repRangeMet, rirMet, loadMet, upperRangeMet: knownReps && knownRir && comparableLoad && loadMet !== false && observed.every(set => finite(set.loadKg) && set.loadKg === observed[0].loadKg && set.reps >= target.repsMax && set.rir >= target.rir),
        status: !sets.length ? "unrecorded" : !complete ? "partial" : unknown ? "unknown" : repRangeMet && rirMet && loadMet !== false ? "met" : "different" };
    });
    return { status: rows.every(row => row.status === "met") ? "met" : "review", rows, restVerified: false,
      message: "계획의 일반 세트 수·반복 범위·최소 RIR 여유와 기록을 비교했어요. 추가 세트는 별도 수행이며 휴식 시간·자세는 검증하지 않았어요." };
  }
  function adjustAssignment(assignment, change, context = {}) {
    if (assignment.status !== "planned" || assignment.recordId !== null || context.completed === true) throw new Error("수행했거나 완료한 날짜의 계획은 바꾸지 않아요. 다음 날짜에 새 계획을 배치해 주세요.");
    if (context.recovery?.status === "stop" || ["mild", "stop"].includes(context.recovery?.pain) || context.profile && (context.profile.healthContext && context.profile.healthContext !== "general" || finite(context.profile.age) && (context.profile.age < 18 || context.profile.age > 80))) throw new Error("현재 건강·통증·회복 맥락은 개별 확인이 먼저예요. 수치 조정을 적용하지 않았어요.");
    if (!["maintain", "deload", "progression"].includes(change.kind) || !text(change.reason) || dateNumber(change.reviewDate) === null || change.reviewDate < assignment.date) throw new Error("조정 이유와 계획 이후 검토 날짜를 입력해 주세요.");
    if (change.kind === "progression" && ["watch", "review"].includes(context.recovery?.status)) throw new Error("회복 신호를 먼저 확인한 뒤 증량을 검토해 주세요.");
    const next = JSON.parse(JSON.stringify(assignment));
    const originalPrescription = next.adjustment?.originalPrescription || JSON.parse(JSON.stringify(next.prescription));
    if (change.kind === "progression") {
      const target = next.prescription.exercises.find(row => row.id === change.exerciseId);
      if (!target || !finite(change.loadKg) || change.loadKg < 0 || change.loadKg > 10000 || !target.equipmentKey || target.loadConvention === "as-recorded") throw new Error("같은 장비·중량 기준을 확인하고 사용자가 선택한 다음 중량을 입력해 주세요.");
      target.loadKg = change.loadKg;
    }
    if (change.kind === "deload") {
      if (!Number.isInteger(change.setReduction) || change.setReduction < 0 || change.setReduction > 19 || !finite(change.rirIncrease) || change.rirIncrease < 0 || change.rirIncrease > 10 || !change.setReduction && !change.rirIncrease) throw new Error("줄일 세트 또는 늘릴 반복 여유를 직접 선택해 주세요.");
      next.prescription.exercises.forEach(row => { row.sets = Math.max(1, row.sets - change.setReduction); row.rir = Math.min(10, row.rir + change.rirIncrease); });
    }
    next.adjustment = { kind: change.kind, reason: text(change.reason), reviewDate: change.reviewDate, reviewed: false, originalPrescription };
    return next;
  }

  return Object.freeze({ VERSION, catalog, muscleLabels, movementFamilies, relatedExerciseIds, parseExerciseName, describeExercise, resolveExercise, previewMapping, sessionContext, startingReference, analyze, getReviewPreferences, reviewSession, coachSession, intentLabels, recommendProgram, createProgram, createAssignment, evaluateAssignment, adjustAssignment });
});
