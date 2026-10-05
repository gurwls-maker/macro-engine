(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MacroTraining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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
    exercise("machine_pec_deck", "머신 플라이", ["펙 덱", "펙 덱 플라이", "머신 펙 덱 플라이", "pec deck", "pec deck fly", "machine fly", "machine chest fly"], ["chest"], [], "chest-isolation", "machine"),
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
    exercise("machine_arm_curl", "머신 암 컬", ["암 컬 머신", "머신 바이셉스 컬", "machine arm curl", "machine biceps curl"], ["biceps"], [], "elbow-flexion", "machine"),
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

  function confirmedMapping(rawName, mappings) {
    const rows = (Array.isArray(mappings) ? mappings : []).filter(row => row?.confirmed === true && normalize(row.rawName) === normalize(rawName) && byId.has(row.exerciseId));
    const keys = new Set(rows.map(row => `${row.exerciseId}|${text(row.equipmentKey)}|${row.loadConvention}`));
    return keys.size === 1 ? rows[0] : null;
  }

  function resolveExercise(rawName, mappings = []) {
    const key = normalize(rawName);
    if (!key) return null;
    const confirmed = (Array.isArray(mappings) ? mappings : []).filter(row => row?.confirmed === true && normalize(row.rawName) === key);
    const mapping = confirmedMapping(rawName, mappings);
    if (confirmed.length && !mapping) return null;
    const ids = aliases.get(key);
    const row = mapping ? byId.get(mapping.exerciseId) : ids?.size === 1 ? byId.get([...ids][0]) : null;
    if (!row) return null;
    return { id: row.id, label: row.label, primaryMuscles: [...row.primaryMuscles], secondaryMuscles: [...row.secondaryMuscles], pattern: row.pattern, equipment: row.equipment, confidence: mapping ? "confirmed" : "exact-alias", comparableKey: mapping && text(mapping.equipmentKey) && ["total", "per-side"].includes(mapping.loadConvention) ? `${row.id}|${mapping.equipmentKey}|${mapping.loadConvention}` : null };
  }

  function resolveRecordExercise(row, mappings) {
    const scoped = (Array.isArray(mappings) ? mappings : []).filter(mapping => normalize(mapping?.rawName) !== normalize(row.rawName) || ((!text(row.equipmentKey) || text(mapping.equipmentKey) === text(row.equipmentKey)) && (!["total", "per-side", "bodyweight"].includes(row.loadConvention) || mapping.loadConvention === row.loadConvention)));
    const mapping = confirmedMapping(row.rawName, scoped);
    const resolved = resolveExercise(row.rawName, scoped);
    const explicit = byId.get(row.exerciseId);
    const result = explicit ? { ...explicit, confidence: "record-confirmed" } : resolved;
    if (!result) return null;
    return { ...result, equipmentKey: text(row.equipmentKey) || text(mapping?.equipmentKey) || null, loadConvention: row.loadConvention === "as-recorded" && mapping ? mapping.loadConvention : row.loadConvention };
  }

  function point(occurrence) {
    if (!occurrence) return null;
    const candidates = occurrence.sets.filter(set => set.marker === null && Number.isInteger(set.reps) && set.reps > 0 && (set.loadKg === null || (finite(set.loadKg) && set.loadKg >= 0)));
    const workingCount = candidates.length;
    if (!candidates.length) candidates.push(...occurrence.sets.filter(set => set.marker?.toUpperCase() !== "W" && Number.isInteger(set.reps) && set.reps > 0));
    candidates.sort((a, b) => (b.loadKg ?? -1) - (a.loadKg ?? -1) || b.reps - a.reps);
    const set = candidates[0];
    return { sessionId: occurrence.sessionId, date: occurrence.date, time: occurrence.time, rawName: occurrence.rawName, loadKg: set?.loadKg ?? null, reps: set?.reps ?? null, marker: set?.marker ?? null, rir: finite(set?.rir) ? set.rir : null, setCount: workingCount, equipmentKey: occurrence.equipmentKey, loadConvention: occurrence.loadConvention, sourceKind: occurrence.sourceKind, basis: "highest-recorded-load-then-reps" };
  }

  function compare(current, previous) {
    if (!previous) return { status: "insufficient", reason: "이 운동의 앞선 기록이 더 필요해요. 현재 세트는 관찰값으로 남겼어요." };
    if (!current || !finite(current.reps) || !finite(previous.reps)) return { status: "incomparable", reason: "일반 세트의 반복 수가 확인되지 않아 수행 비교를 보류했어요." };
    if (current.marker !== null || previous.marker !== null) return { status: "incomparable", reason: "별도 문자가 표시된 세트라 일반 세트와 같은 조건으로 비교하지 않았어요. 표시와 숫자는 그대로 보존했어요." };
    if (current.date === previous.date) return { status: "incomparable", reason: "같은 날의 두 세션은 서로 보존했어요. 세션 순서·당일 피로 영향 때문에 장기 수행 변화로 판정하지 않아요." };
    if (!current.equipmentKey || !previous.equipmentKey || current.equipmentKey !== previous.equipmentKey) return { status: "incomparable", reason: "동일한 장비·머신인지 확인되지 않았어요. 장비별 표시 중량을 서로 환산하지 않아요." };
    if (!["total", "per-side"].includes(current.loadConvention) || current.loadConvention !== previous.loadConvention) return { status: "incomparable", reason: "중량의 한쪽·합산 기준이 확인되지 않았거나 달라요. 맨몸 운동의 실제 체중 부하도 추측하지 않아요." };
    if (current.sourceKind === "legacy-ocr" || previous.sourceKind === "legacy-ocr") return { status: "incomparable", reason: "기존 OCR 요약은 세부 판독이 검증되지 않아 기록 변화만 보여줘요." };
    if (!finite(current.rir) || !finite(previous.rir) || current.rir !== previous.rir) return { status: "incomparable", reason: "RIR이 비어 있거나 달라 같은 노력 수준인지 확인할 수 없어요. 기록 변화는 근력·근성장 판정이 아니에요." };
    if (!finite(current.loadKg) || !finite(previous.loadKg)) return { status: "incomparable", reason: "부하가 확인되지 않아 체중이나 0kg으로 대신 채우지 않았어요." };
    if (current.setCount !== previous.setCount) return { status: "incomparable", reason: "일반 세트 수가 달라 최고 기록 세트를 고르는 조건이 달라요. 세트 수와 대표세트 변화를 따로 확인해 주세요." };
    const load = current.loadKg - previous.loadKg, reps = current.reps - previous.reps;
    if (load !== 0 && reps !== 0) return { status: "mixed", reason: "중량과 반복 수가 함께 달라졌어요. 환산 최대중량이나 kg×반복으로 우열을 정하지 않았어요." };
    const change = load || reps;
    return { status: change > 0 ? "improved" : change < 0 ? "declined" : "stable", reason: `같은 장비·중량 기준·기록 RIR·세트 수에서 ${load ? "같은 반복 수의 중량" : "같은 중량의 반복 수"}이 ${change > 0 ? "늘었어요" : change < 0 ? "줄었어요" : "같아요"}. 동작 범위·휴식·기술까지 같다는 뜻이나 근성장 측정은 아니에요.` };
  }

  function checkinRows(input, date) {
    if (Array.isArray(input)) return input.map(row => ({ ...row?.coachCheckin, ...row }));
    if (!input || typeof input !== "object") return [];
    if (["energy", "hunger", "sleep", "performance", "pain"].some(key => Object.hasOwn(input, key))) return [{ ...input, date: input.date || date }];
    return Object.entries(input).map(([key, value]) => ({ ...value?.coachCheckin, ...value, date: value?.date || key }));
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
    const groups = new Map(), sessions = [], seen = new Map(), conflicted = new Set(), sourceSeen = new Set();
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
    for (const row of [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || text(a.time).localeCompare(text(b.time)) || a.id.localeCompare(b.id))) {
      const identity = text(row.source?.hash) ? `${row.source.hash}|${row.date}|${row.time}|${row.label}|${JSON.stringify(row.exercises.map(e => e ? ({ rawName: e.rawName, equipmentKey: e.equipmentKey, loadConvention: e.loadConvention, sets: Array.isArray(e.sets) ? e.sets.map(s => s ? ({ loadKg: s.loadKg, reps: s.reps, marker: s.marker, rir: s.rir }) : null) : null }) : null))}` : null;
      if (identity && sourceSeen.has(identity)) { coverage.duplicateRecords++; continue; }
      if (identity) sourceSeen.add(identity);
      const summary = { id: row.id, date: row.date, time: row.time || null, label: text(row.label), durationMinutes: finite(row.durationMinutes) ? row.durationMinutes : null, pain: row.pain || null, effort: finite(row.effort) ? row.effort : null, sourceKind: row.source?.kind || "unknown", totalSets: 0, workingSets: 0, warmupSets: 0, markedSets: 0, unknownEffortSets: 0, unresolvedExercises: 0, exercises: [] };
      if (summary.sourceKind === "legacy-ocr" && !row.exercises.length) coverage.legacyOnlySessions++;
      for (const raw of row.exercises) {
        if (!raw || !Array.isArray(raw.sets)) { coverage.invalidSets++; continue; }
        const resolved = resolveRecordExercise(raw, options.mappings);
        const ex = { id: text(raw.id), rawName: text(raw.rawName), exerciseId: resolved?.id || null, label: resolved?.label || text(raw.rawName) || "이름 미확인", equipmentKey: resolved?.equipmentKey || text(raw.equipmentKey) || null, loadConvention: resolved?.loadConvention || raw.loadConvention || "as-recorded", sets: [], workingSets: 0, markedSets: 0 };
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
        summary.exercises.push(ex);
        if (ex.sets.length) {
          const identity = resolved?.id || `unresolved:${normalize(raw.rawName)}`;
          const key = `${identity}|${ex.equipmentKey || "unconfirmed:" + normalize(raw.rawName)}|${ex.loadConvention}`;
          if (!groups.has(key)) groups.set(key, []);
          const last = groups.get(key).at(-1);
          if (last?.sessionId === summary.id) last.sets.push(...ex.sets);
          else groups.get(key).push({ ...ex, sets: [...ex.sets], sessionId: summary.id, date: row.date, time: row.time || null, sourceKind: summary.sourceKind });
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
      const recent = occurrences.slice(-3).map(point);
      const current = recent.at(-1), previous = recent.at(-2) || null;
      const judgment = key.startsWith("unresolved:") ? { status: "incomparable", reason: "운동 이름 대응이 확인되지 않았어요. 원문 기록을 남기고 확인 후 비교해요." } : compare(current, previous);
      let repeated = false;
      if (recent.length === 3 && new Set(recent.map(row => row.date)).size === 3 && dateNumber(current.date) >= end - 13 * DAY) repeated = compare(recent[1], recent[0]).status === "declined" && compare(recent[2], recent[1]).status === "declined";
      if (repeated) repeatedDeclines++;
      progression.push({ exerciseId: occurrences.at(-1).exerciseId, label: occurrences.at(-1).label, equipmentKey: current.equipmentKey, current, previous, ...judgment, repeatedDecline: repeated, observed: { current, previous, description: `${previous ? formatPoint(previous) + " → " : "현재 기록 "}${formatPoint(current)}. 표시된 세트의 관찰값이며 근성장률이 아니에요.` } });
    }
    const checkins = checkinRows(options.checkins, windowEnd).filter(row => { const n = dateNumber(row.date); return n !== null && end !== null && n <= end && n >= end - 6 * DAY; });
    const painReports = [...sessions, ...checkins].filter(row => ["none", "mild", "stop"].includes(row.pain)).sort((a, b) => a.date.localeCompare(b.date) || ({ none: 0, mild: 1, stop: 2 }[a.pain] - { none: 0, mild: 1, stop: 2 }[b.pain]));
    const pain = painReports.at(-1)?.pain || null;
    const selfReportSignals = [...new Set(checkins.flatMap(row => [row.energy === "low" ? "낮은 컨디션" : null, row.sleep === "poor" ? "좋지 않은 수면" : null, row.hunger === "high" ? "강한 허기" : null, row.performance === "down" ? "자기보고 수행 저하" : null].filter(Boolean)))];
    const clinical = options.profile?.healthContext && options.profile.healthContext !== "general";
    const outOfAge = finite(options.profile?.age) && (options.profile.age < 18 || options.profile.age > 80);
    const recovery = { status: "insufficient", pain, reasons: [], questions: [], repeatedDeclines, selfReportSignals, deloadCandidate: false };
    if (pain === "stop") { recovery.status = "stop"; recovery.reasons.push("중단이 필요한 통증을 기록했어요. 통증을 유발하는 운동은 멈추고 전문가 평가를 우선해 주세요."); }
    else if (pain === "mild" || clinical || outOfAge) { recovery.status = "review"; recovery.reasons.push(pain === "mild" ? "통증 기록이 있어 자동 운동량 증가보다 현재 증상 확인과 개별 평가가 먼저예요." : "이 일반 성인용 계획의 지원 범위 밖이에요. 개인에게 맞는 전문가 계획을 우선해 주세요."); }
    else if (repeatedDeclines && selfReportSignals.length) { recovery.status = "review"; recovery.deloadCandidate = true; recovery.reasons.push("서로 다른 3일의 비교 가능한 기록에서 수행이 두 번 줄었고 회복 신호도 있어요. 피로 원인을 확인하고 훈련 스트레스를 잠시 낮추는 방안을 검토해 주세요. 디로드가 반드시 필요하다는 진단은 아니에요."); }
    else if (selfReportSignals.length || repeatedDeclines || progression.some(row => row.status === "declined")) { recovery.status = "watch"; recovery.reasons.push("일부 기록이나 자기보고 변화가 있어요. 한 번의 저하만으로 디로드·과훈련을 단정하거나 식사를 줄이지 않아요."); }
    else if (checkins.some(row => ["low", "okay", "good"].includes(row.energy) && ["low", "okay", "high"].includes(row.hunger) && ["poor", "okay", "good"].includes(row.sleep)) && sessions.length) { recovery.status = "okay"; recovery.reasons.push("현재 확인된 기록에는 별도 경고 신호가 없어요. 회복이나 건강이 검증됐다는 뜻은 아니에요."); }
    else recovery.reasons.push("회복을 평가할 기록이 충분하지 않아요. 기록이 없다고 쉬었거나 잘 회복했다고 보지 않아요.");
    if (!checkins.length || recovery.status === "insufficient") recovery.questions.push("최근 수면·허기·컨디션은 어땠나요?");
    if (pain === null || pain !== "none") recovery.questions.push("현재 통증이 있나요? 움직임 중 어느 동작에서 나타나는지 전문가에게 알려 주세요.");
    if (recovery.status !== "okay") recovery.questions.push("장비·중량 기준·동작 범위·휴식과 RIR이 이전 기록과 같았나요?");
    if (coverage.unresolvedExercises) limitations.push("이름을 확인하지 못한 운동은 원문과 세트를 보존했지만 부위별 수치에는 임의 배분하지 않았어요.");
    if (coverage.legacyOnlySessions) limitations.push("세부 운동이 없는 과거 OCR 요약의 전체 세트 수를 부위별 세트로 나누지 않았어요.");
    if (conflicted.size) limitations.push("같은 기록 ID에 서로 다른 내용이 있어 충돌한 기록은 집계에서 제외했어요.");
    return { version: VERSION, windowStart, windowEnd, coverage, muscles, sessions, lastSession: sessions.at(-1) || null, progression, recovery, limitations };
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
  function evaluateAssignment(assignment, records = []) {
    const record = records.find(row => row.id === assignment.recordId);
    if (!record || assignment.status !== "performed") return { status: assignment.status === "skipped" ? "skipped" : "unrecorded", rows: [], restVerified: false, message: assignment.status === "skipped" ? "사용자가 수행하지 않았다고 표시한 계획이에요. 휴식 여부는 별개예요." : "연결된 실제 일지가 없어요. 운동하지 않았거나 쉬었다고 판단하지 않아요." };
    if (record.date !== assignment.date) return { status: "review", rows: [], restVerified: false, message: "계획과 연결한 일지의 날짜가 달라 수행을 비교하지 않았어요." };
    const rows = assignment.prescription.exercises.map(target => {
      const exercises = record.exercises.filter(row => row.exerciseId === target.exerciseId);
      const sets = exercises.flatMap(row => row.sets.filter(set => set.marker === null));
      const observed = sets.slice(0, target.sets), complete = observed.length === target.sets;
      const knownReps = complete && observed.every(set => finite(set.reps));
      const knownRir = complete && observed.every(set => finite(set.rir));
      const repRangeMet = knownReps ? observed.every(set => set.reps >= target.repsMin && set.reps <= target.repsMax) : null;
      const rirMet = knownRir ? observed.every(set => set.rir >= target.rir) : null;
      const comparableLoad = target.equipmentKey !== null && target.loadConvention !== "as-recorded" && exercises.length > 0
        && exercises.every(row => row.equipmentKey === target.equipmentKey && row.loadConvention === target.loadConvention);
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
    if (context.recovery?.status === "stop" || ["mild", "stop"].includes(context.recovery?.pain) || context.profile && (context.profile.healthContext !== "general" || context.profile.age < 18 || context.profile.age > 80)) throw new Error("현재 건강·통증·회복 맥락은 개별 확인이 먼저예요. 수치 조정을 적용하지 않았어요.");
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

  return Object.freeze({ VERSION, catalog, muscleLabels, resolveExercise, analyze, recommendProgram, createProgram, createAssignment, evaluateAssignment, adjustAssignment });
});
