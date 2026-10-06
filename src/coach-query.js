(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./training.js") : root.MacroTraining,
    typeof module === "object" && module.exports ? require("./insights.js") : root.MacroInsights);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MacroCoachQuery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (T, I) {
  "use strict";
  const DAY = 86400000;
  const normal = value => typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "") : "";
  const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  const numberDate = value => Date.parse(value + "T00:00:00Z");
  const shift = (value, amount) => new Date(numberDate(value) + amount * DAY).toISOString().slice(0, 10);
  const daysBetween = (from, to) => Math.round((numberDate(to) - numberDate(from)) / DAY) + 1;
  function monthShift(date, amount) {
    const [year, month, day] = date.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1 + amount, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
  }
  const monthStart = date => date.slice(0, 8) + "01";
  const monthEnd = date => shift(monthShift(monthStart(date), 1), -1);
  const weekStart = date => shift(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
  const muscleTerms = { chest: ["가슴", "chest"], back: ["등", "광배", "back"], shoulders: ["어깨", "삼각근", "shoulder"], biceps: ["이두", "biceps"], triceps: ["삼두", "triceps"],
    quads: ["대퇴사두", "사두", "앞허벅지", "quads"], hamstrings: ["햄스트링", "뒷허벅지", "hamstring"], glutes: ["둔근", "엉덩이", "glutes"], calves: ["종아리", "calves"],
    core: ["복근", "몸통", "코어", "core"], hip_adductors: ["내전근", "모음근"], hip_abductors: ["외전근", "벌림근"] };
  function termPresent(question, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[\\s,./·(])${escaped}(?:$|[\\s,./·)]|은|는|이|가|을|를|의|만|도|운동|세트|볼륨|기록|성장|수행|비교)`, "i").test(question);
  }
  function selectors(state, question) {
    const text = normal(question), candidates = [];
    for (const exercise of T.catalog) {
      const names = [exercise.label, ...exercise.aliases].map(normal).filter(name => name.length >= 3);
      for (const name of names) {
        let index = text.indexOf(name);
        while (index !== -1) { candidates.push({ id: exercise.id, name, length: name.length, index, end: index + name.length }); index = text.indexOf(name, index + name.length); }
      }
    }
    const longest = candidates.filter(row => !candidates.some(other => other.length > row.length && other.index <= row.index && other.end >= row.end));
    const exerciseIds = [...new Set(longest.map(row => row.id))];
    const rawNames = [...new Set((state.training?.records || []).flatMap(record => record.exercises || []).map(exercise => exercise.rawName)
      .filter(name => normal(name).length >= 3 && text.includes(normal(name))))];
    const muscleIds = Object.entries(muscleTerms).filter(([, words]) => words.some(word => termPresent(question, word))).map(([id]) => id);
    if (/(?:^|\s)하체(?:$|\s|는|의|운동|볼륨|비교)/.test(question)) muscleIds.push("quads", "hamstrings", "glutes", "calves");
    if (/(?:^|\s)팔(?:$|\s|은|의|운동|볼륨|비교)/.test(question)) muscleIds.push("biceps", "triceps");
    return { exerciseIds, rawNames, muscleIds: [...new Set(muscleIds)], exercises: exerciseIds.map(id => ({ id, label: T.catalog.find(row => row.id === id).label })) };
  }
  function plan(state, date, question = "") {
    if (!valid(date)) throw new Error("질문을 조회할 기준 날짜를 확인해 주세요.");
    question = typeof question === "string" ? question.normalize("NFKC") : "";
    const periods = [], ambiguities = [], assumptions = [];
    const add = (from, to, label, basis = "explicit") => {
      if (!valid(from) || !valid(to) || from > to) { ambiguities.push("날짜 범위를 확인하지 못했어요. 시작일과 종료일을 다시 지정해 주세요."); return; }
      if (to > date) { assumptions.push("기준일 뒤의 날짜는 미래 기록으로 포함하지 않았어요."); to = date; }
      if (from > to) { ambiguities.push("요청 기간이 기준일 뒤에 있어 기록 비교를 만들지 않았어요."); return; }
      if (!periods.some(row => row.from === from && row.to === to)) periods.push({ id: `period-${periods.length + 1}`, from, to, label, basis, requestedDays: daysBetween(from, to) });
    };
    const dateMatches = [...question.matchAll(/(?:(\d{4})\s*[-./년]\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})(?:\s*일)?/g)].filter(match => {
      const before = question.slice(0, match.index), after = question.slice(match.index + match[0].length);
      if (/[\d.]$/.test(before) || /^\d/.test(after)) return false;
      if (/^\s*(?:kg|g|mg|cm|km|kcal|lb|lbs|ml|l|%|킬로그램|키로그램|밀리그램|센티미터|그램|칼로리|세트|회|번|시간|분|초|인분|점|퍼센트|개|컵|스푼|봉지|팩)(?![a-z])/i.test(after)) return false;
      if (!match[1] && !/월/.test(match[0]) && /(?:최근|지난|이전|직전)\s*$/.test(before) && /일$/.test(match[0])) return false;
      return true;
    });
    const foundDates = dateMatches.map(match => {
      if (!match[1]) assumptions.push("연도가 없는 날짜는 기준일의 연도로 조회했어요.");
      return `${match[1] || date.slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    });
    if (foundDates.length >= 2) {
      for (let index = 0; index < Math.min(4, foundDates.length); index++) {
        const match = dateMatches[index], next = dateMatches[index + 1];
        const gap = next ? question.slice(match.index + match[0].length, next.index).trim() : "";
        if (next && /^(?:부터|까지|~|–|-|에서)$/.test(gap)) { add(foundDates[index], foundDates[index + 1], "지정 기간"); index++; }
        else add(foundDates[index], foundDates[index], "지정 날짜");
      }
      if (foundDates.length > 4) ambiguities.push("날짜가 여러 개라 처음 범위만 조회했어요. 비교할 기간을 분리해 주세요.");
    } else if (foundDates.length === 1) add(foundDates[0], foundDates[0], "지정 날짜");
    const comparisonRequested = /비교|전후|변화|달라|추세|compare/i.test(question);
    if (!periods.length) {
      const natural = question.match(/(어제|오늘|그제)\s*(?:부터|~|에서)\s*(어제|오늘|그제)(?:\s*까지)?/);
      if (natural) { const offset = { 오늘: 0, 어제: -1, 그제: -2 }; add(shift(date, offset[natural[1]]), shift(date, offset[natural[2]]), "지정 상대 기간", "relative-range"); }
      else if (/지난\s*달\s*(?:부터|~|에서)\s*오늘(?:\s*까지)?/.test(question)) add(monthStart(monthShift(date, -1)), date, "지난달부터 기준일까지", "relative-range");
    }
    if (!periods.length && !foundDates.length) {
      const months = [...question.matchAll(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월/g)];
      if (months.length) {
        let year = date.slice(0, 4);
        const values = months.slice(0, 4).map(match => {
          if (match[1]) year = match[1];
          else assumptions.push("연도가 없는 월은 기준일의 연도 또는 앞서 지정한 연도로 조회했어요.");
          return `${year}-${match[2].padStart(2, "0")}-01`;
        });
        if (values.length === 2 && /부터|까지|~|에서/.test(question)) {
          if (valid(values[1])) add(values[0], monthEnd(values[1]), "지정 월 기간", "calendar-month");
          else ambiguities.push("지정한 월을 확인해 주세요.");
        } else values.forEach(value => valid(value) ? add(value, monthEnd(value), "지정 월", "calendar-month") : ambiguities.push("지정한 월을 확인해 주세요."));
      }
    }
    if (!periods.length) {
      const relative = [...question.matchAll(/(?:최근|지난|직전|이전|그\s*전|앞선)\s*(\d{1,4})\s*(일|주|개월|달)(?:\s*간)?|(\d{1,4})\s*(일|주|개월|달)\s*간/g)].map(match => ({ 0: match[0], 1: match[1] || match[3], 2: match[2] || match[4] }));
      if (relative.length) {
        if (relative.length > 2) ambiguities.push("기간이 여러 개라 처음 두 기간만 조회했어요. 비교할 기간을 분리해 주세요.");
        if (relative.length > 1 && /이전|직전|앞선|그\s*전/.test(relative[0][0])) ambiguities.push("앞선 기간과 최근 기간의 기준이 모호해 참고 범위만 조회했어요. 비교할 시작일과 종료일을 확인해야 합니다.");
        if (comparisonRequested && /어제|그제|지난\s*달|이번\s*달|지난\s*주|이번\s*주/.test(question)) ambiguities.push("기간 길이와 상대 날짜가 섞인 비교 조건은 모두 해석하지 못했어요. 표시된 기간은 참고 범위이며 비교할 날짜를 확인해야 합니다.");
        const first = relative[0], amount = Number(first[1]);
        const duration = (end, count, unit) => unit === "개월" || unit === "달" ? shift(monthShift(end, -count), 1) : shift(end, 1 - count * (unit === "주" ? 7 : 1));
        if (amount < 1 || amount > (first[2] === "일" ? 3660 : first[2] === "주" ? 520 : 120)) ambiguities.push("조회 기간이 너무 길거나 유효하지 않아요. 기간을 나눠 주세요.");
        else {
          add(duration(date, amount, first[2]), date, `${first[0].trim()} 기록`, "relative-duration");
          periods[0][first[2] === "개월" || first[2] === "달" ? "durationMonths" : first[2] === "주" ? "durationWeeks" : "durationDays"] = amount;
          if (comparisonRequested && relative[1]) {
            const other = relative[1], end = shift(periods[0].from, -1), count = Number(other[1]);
            if (count > 0 && count <= (other[2] === "일" ? 3660 : other[2] === "주" ? 520 : 120)) {
              const isEarlier = /이전|그\s*전|앞선|직전/.test(other[0]);
              add(duration(isEarlier ? end : date, count, other[2]), isEarlier ? end : date, isEarlier ? "앞선 기간" : other[0].trim(), "relative-duration");
            }
          }
        }
      } else if (/\d+\s*(?:개월|달|주|일)\s*전/.test(question)) {
        const match = question.match(/(\d{1,4})\s*(개월|달|주|일)\s*전/), amount = Number(match[1]);
        if (amount <= (match[2] === "일" ? 3660 : match[2] === "주" ? 520 : 120)) {
          const when = /개월|달/.test(match[2]) ? monthShift(date, -amount) : shift(date, -amount * (match[2] === "주" ? 7 : 1));
          add(when, when, "지정 과거 날짜", "relative-point");
        } else ambiguities.push("조회 기간이 너무 길어요. 날짜를 지정해 주세요.");
      } else {
        if (/지난\s*달|전월/.test(question)) { const previous = monthShift(date, -1); add(monthStart(previous), monthEnd(previous), "지난달", "calendar-month"); }
        if (/이번\s*달|이달|금월/.test(question)) add(monthStart(date), date, "이번 달 기준일까지", "calendar-month");
        if (/지난\s*주/.test(question)) add(shift(weekStart(date), -7), shift(weekStart(date), -1), "지난주", "calendar-week");
        if (/이번\s*주/.test(question)) add(weekStart(date), date, "이번 주 기준일까지", "calendar-week");
        if (/어제/.test(question)) add(shift(date, -1), shift(date, -1), "어제", "relative-point");
        if (/오늘/.test(question) && (comparisonRequested || !periods.length)) add(date, date, "기준 날짜", "relative-point");
        if (/작년/.test(question)) { const year = Number(date.slice(0, 4)) - 1; add(`${year}-01-01`, `${year}-12-31`, "작년", "calendar-year"); }
        if (/올해|금년/.test(question)) add(date.slice(0, 4) + "-01-01", date, "올해 기준일까지", "calendar-year");
      }
    }
    const names = selectors(state, question);
    if ((names.exerciseIds.length || names.rawNames.length || names.muscleIds.length) && /말고|제외|빼고|빼줘|아닌|아니고/.test(question)) ambiguities.push("운동·부위의 제외 조건은 자동 조회가 해석하지 못했어요. 표시된 후보를 요청한 최종 대상처럼 비교하지 않고 제외할 대상을 확인해야 합니다.");
    if (periods.some(period => period.basis === "calendar-month") && /(?:부터|에서|~).*오늘\s*까지/.test(question)) ambiguities.push("지정 월과 오늘까지의 혼합 범위를 모두 해석하지 못했어요. 표시된 월은 참고 범위이며 종료 날짜를 확인해야 합니다.");
    if (!periods.length && !ambiguities.length && /전체\s*(?:기록|기간)|처음부터|모든\s*기록/.test(question)) {
      const available = [...Object.keys(state.days || {}), ...(state.training?.records || []).map(row => row.date)].filter(value => valid(value) && value <= date).sort();
      add(available[0] || date, date, "저장한 전체 기간", "all-saved-history");
    }
    const needsClarification = /(?:그걸|그거|이걸|그때|그 운동|예전보다|전보다|지난번)/.test(question) && !names.exerciseIds.length && !names.rawNames.length && !names.muscleIds.length && !periods.length;
    if (needsClarification) ambiguities.push("이 질문의 대상이나 비교 시점은 대화 맥락 확인이 필요해요. 자동 조회로 전체 의미를 해석하지 않았어요.");
    if (!periods.length && /최근\s*몇|지난\s*몇|예전|오래전|지난\s*(?:한|두|세|네)\s*(?:달|주)|전년|재작년/.test(question)) ambiguities.push("요청한 과거 기간을 날짜로 확인하지 못했어요. 참고 범위만 전달하며 정확한 비교 기간을 확인해야 합니다.");
    if (!periods.length) add(shift(date, -27), date, "최근 기록 참고 범위", "default-context");
    if (comparisonRequested && periods.length === 1 && periods[0].requestedDays > 1 && periods[0].basis !== "default-context" && !ambiguities.length) {
      const whole = periods[0], middle = shift(whole.from, Math.floor(whole.requestedDays / 2) - 1);
      assumptions.push("별도 비교 기간이 없어 요청 기간의 앞쪽과 뒤쪽을 날짜로 나눴어요. 서로 다른 기간 길이와 기록일 수를 함께 확인해 주세요.");
      add(whole.from, middle, "요청 기간 앞쪽", "split-period"); add(shift(middle, 1), whole.to, "요청 기간 뒤쪽", "split-period");
    } else if (comparisonRequested && periods.length === 1) ambiguities.push("별도 비교 기간이 없어 어느 때와 비교할지 확인이 필요해요.");
    return { schemaVersion: 1, date, periods, ...names, comparisonRequested, needsClarification: ambiguities.length > 0,
      ambiguities: [...new Set(ambiguities)], assumptions: [...new Set(assumptions)],
      source: "confirmed-app-records", matching: "명시 기간 안에서 지정 운동명과 지정 부위 조건을 모두 만족하는 기록을 조회합니다. 제외·모호한 혼합 기간은 확인이 필요하며 의미적으로 모든 관련 기록을 찾는 검색은 아닙니다." };
  }
  function matchingExercise(exercise, selection, mappings) {
    const described = T.describeExercise(exercise, mappings);
    const byName = selection.exerciseIds.includes(described.resolved?.id) || selection.rawNames.some(name => normal(name) === normal(exercise.rawName));
    const byMuscle = described.resolved && selection.muscleIds.some(id => [...described.resolved.primaryMuscles, ...described.resolved.secondaryMuscles].includes(id));
    return (!selection.exerciseIds.length && !selection.rawNames.length || byName) && (!selection.muscleIds.length || byMuscle);
  }
  function trainingPeriod(records, period, state, sessionContexts = {}, sessionRecordCounts = {}) {
    const buckets = new Map();
    for (const record of records) {
      const bucket = Math.floor((numberDate(record.date) - numberDate(period.from)) / (28 * DAY));
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(record);
    }
    const result = { engine: "MacroTraining.analyze", partition: "non-overlapping-at-most-28-day-windows", coverage: { recordCount: 0, daysWithRecords: 0, unknownDays: period.requestedDays,
      workingSets: 0, warmupSets: 0, markedSets: 0, unknownEffortSets: 0, unresolvedExercises: 0, excludedRecords: 0, duplicateRecords: 0, invalidSets: 0, legacyOnlySessions: 0 },
      muscles: Object.entries(T.muscleLabels).map(([id, label]) => ({ id, label, directSets: 0, indirectSets: 0, unknownEffortSets: 0, markedSets: 0 })), progression: [], chunkCount: buckets.size,
      interpretation: "조회 기간의 저장 세트 수입니다. 기록 없는 날은 운동하지 않은 날이 아니며 근성장률·최적 볼륨·회복 판정이 아닙니다.",
      progressionScope: "수행 비교는 각각의 실제 28일 이하 조각 안에서만 계산합니다. 조각 사이 수행 변화·전체 기간의 향상률은 계산하지 않습니다." };
    const dates = new Set();
    for (const [bucket, rows] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      const from = shift(period.from, bucket * 28), to = [shift(from, 27), period.to].sort()[0];
      const analysis = T.analyze(rows, { date: to, profile: state.profile, mappings: state.training?.mappings, checkins: state.days, sessionContexts, sessionRecordCounts });
      for (const [key, value] of Object.entries(analysis.coverage)) if (typeof value === "number" && key !== "unknownDays" && key !== "daysWithRecords") result.coverage[key] += value;
      analysis.coverage.trainingDates.forEach(date => dates.add(date));
      for (const muscle of analysis.muscles) for (const key of ["directSets", "indirectSets", "unknownEffortSets", "markedSets"]) result.muscles.find(row => row.id === muscle.id)[key] += muscle[key];
      result.progression.push(...analysis.progression.map(row => ({ ...row, windowStart: from, windowEnd: to })));
    }
    result.coverage.daysWithRecords = dates.size; result.coverage.unknownDays = period.requestedDays - dates.size;
    result.progression = result.progression.sort((a, b) => b.windowEnd.localeCompare(a.windowEnd)).slice(0, 8);
    return result;
  }
  const bounds = dates => dates.length ? { from: [...dates].sort()[0], to: [...dates].sort().at(-1) } : null;
  function nutritionPeriod(days, period) {
    const withMeals = days.filter(day => day.meals?.length), completed = withMeals.filter(day => day.complete);
    const totals = withMeals.length ? I.mealTotals(withMeals.flatMap(day => day.meals)) : null;
    const completeTotals = completed.length ? I.mealTotals(completed.flatMap(day => day.meals)) : null;
    return { source: "confirmed-day-meals", daysWithMeals: withMeals.length, completeMealDays: completed.length, partialMealDays: withMeals.length - completed.length,
      daysWithoutMeals: period.requestedDays - withMeals.length, recordedIntakeTotals: totals,
      averageCompletedIntake: completeTotals ? Object.fromEntries(Object.entries(completeTotals).filter(([, value]) => typeof value === "number").map(([key, value]) => [key, value / completed.length])) : null,
      snapshotDays: completed.filter(day => day.planSnapshot).length,
      interpretation: "기록된 식사 합계와 식사 있는 완료일 평균입니다. 미완료 식사는 하루 섭취량으로 판정하지 않고, 식사 없는 날을 0으로 평균에 넣지 않습니다." };
  }
  function compactRecord(record, selection, mappings, fullContext) {
    const exercises = record.exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => matchingExercise(exercise, selection, mappings));
    const sample = exercises.slice(0, 4), sampledIds = new Set(sample.map(({ exercise }) => exercise.id));
    const context = fullContext || T.sessionContext(record, mappings);
    return { id: record.id, date: record.date, label: record.label, time: record.time, pain: record.pain, effort: record.effort, sourceKind: record.source?.kind,
      sourceRevision: record.source?.revision, notes: (record.notes || "").slice(0, 800), originalExerciseCount: record.exercises.length,
      originalSetCount: record.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0), matchedExerciseCount: exercises.length,
      matchedSetCount: exercises.reduce((sum, { exercise }) => sum + exercise.sets.length, 0), sampled: record.exercises.length > sample.length || exercises.some(({ exercise }) => exercise.sets.length > 4),
      sessionContext: { ...context, originalBlockCount: context.blocks.length, blocks: context.blocks.filter(block => sampledIds.has(block.blockId)), sampled: context.blocks.length > sample.length,
        detailScope: "세션 전체에서 계산한 선행 수행 맥락과 전체 세트 수입니다. 블록 목록은 아래 원문 표본에 해당하는 일부이며 표시 순서는 실제 수행 순서 확인이 아닙니다." },
      exercises: sample.map(({ exercise, index }) => {
        const d = T.describeExercise(exercise, mappings);
        return { id: exercise.id, sourceExercisePosition: index + 1, rawName: exercise.rawName, exerciseId: d.resolved?.id || null, equipmentKey: d.equipmentKey, equipmentSource: d.equipmentSource,
          loadRole: d.loadRole,
          loadConvention: d.loadConvention, loadConventionSource: d.loadConventionSource, ruleConflict: d.ruleConflict,
          originalSetCount: exercise.sets.length, sampled: exercise.sets.length > 4, sets: exercise.sets.slice(0, 4), notes: (exercise.notes || "").slice(0, 400) };
      }) };
  }
  function retrieve(state, date, question = "") {
    const selection = plan(state, date, question), allRecords = state.training?.records || [], allDays = Object.values(state.days || {});
    const fullRecords = new Map(allRecords.map(record => [record.id, record])), sessionContexts = Object.create(null);
    const fullContext = record => sessionContexts[record.id] || (sessionContexts[record.id] = T.sessionContext(record, state.training?.mappings));
    const periods = selection.periods.map(period => {
      const rangedRecords = allRecords.filter(row => row.date >= period.from && row.date <= period.to);
      const sessionRecordCounts = Object.create(null);
      rangedRecords.forEach(record => { sessionRecordCounts[record.date] = (sessionRecordCounts[record.date] || 0) + 1; });
      rangedRecords.forEach(fullContext);
      const named = selection.exerciseIds.length || selection.rawNames.length || selection.muscleIds.length;
      const records = named ? rangedRecords.map(record => ({ ...record, exercises: record.exercises.filter(exercise => matchingExercise(exercise, selection, state.training?.mappings)) })).filter(record => record.exercises.length) : rangedRecords;
      const days = allDays.filter(row => row.date >= period.from && row.date <= period.to).sort((a, b) => a.date.localeCompare(b.date));
      const sorted = records.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.id.localeCompare(b.id));
      const sample = [...sorted.slice(0, 1), ...sorted.slice(-2)].filter((row, index, values) => values.findIndex(value => value.id === row.id) === index);
      const observations = days.filter(day => [day.weightKg, day.bodyFatPct, day.skeletalMuscleKg].some(value => typeof value === "number" && Number.isFinite(value)));
      const checkins = days.filter(day => day.coachCheckin);
      const unresolved = rangedRecords.flatMap(record => record.exercises).filter(exercise => !T.describeExercise(exercise, state.training?.mappings).resolved).length;
      const selectedIds = new Set([...selection.exerciseIds, ...rangedRecords.flatMap(record => record.exercises.filter(exercise => selection.rawNames.some(name => normal(name) === normal(exercise.rawName))))
        .map(exercise => T.describeExercise(exercise, state.training?.mappings).resolved?.id).filter(Boolean)]);
      const relatedIds = [...new Set([...selectedIds].flatMap(id => T.relatedExerciseIds(id)))].filter(id => !selectedIds.has(id));
      const relatedSelection = { exerciseIds: relatedIds, rawNames: [], muscleIds: [] };
      const relatedRecords = relatedIds.length ? rangedRecords.map(record => ({ ...record, exercises: record.exercises.filter(exercise => matchingExercise(exercise, relatedSelection, state.training?.mappings)) })).filter(record => record.exercises.length) : [];
      const relatedSummary = relatedRecords.length ? trainingPeriod(relatedRecords, period, state, sessionContexts, sessionRecordCounts) : null;
      return { ...period, available: { training: bounds(sorted.map(row => row.date)), days: bounds(days.map(row => row.date)) },
        training: trainingPeriod(records, period, state, sessionContexts, sessionRecordCounts), nutrition: nutritionPeriod(days, period),
        relatedContext: { exerciseIds: relatedIds, matchedWorkoutCount: relatedRecords.length, coverage: relatedSummary?.coverage || null,
          records: relatedRecords.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).slice(-2).map(record => compactRecord(fullRecords.get(record.id), relatedSelection, state.training?.mappings, fullContext(fullRecords.get(record.id)))),
          interpretation: "명시적으로 연결한 유사 동작의 별도 참고 기록입니다. 질문 대상의 집계에 더하지 않으며 서로 다른 종목·장비의 kg가 환산되거나 동일한 성장 자극이라는 뜻이 아닙니다." },
        body: { measurementDays: observations.length, first: observations[0] ? { date: observations[0].date, weightKg: observations[0].weightKg ?? null, bodyFatPct: observations[0].bodyFatPct ?? null, skeletalMuscleKg: observations[0].skeletalMuscleKg ?? null, bodyFatMethod: observations[0].bodyFatMethod || "unknown" } : null,
          last: observations.at(-1) ? { date: observations.at(-1).date, weightKg: observations.at(-1).weightKg ?? null, bodyFatPct: observations.at(-1).bodyFatPct ?? null, skeletalMuscleKg: observations.at(-1).skeletalMuscleKg ?? null, bodyFatMethod: observations.at(-1).bodyFatMethod || "unknown" } : null,
          interpretation: "기록한 측정값의 처음·마지막 관찰입니다. 측정 방법·수분·조건 차이를 통제하거나 실제 근성장·체지방 변화율을 계산한 결과가 아닙니다." },
        source: { rangedWorkoutCount: rangedRecords.length, matchedWorkoutCount: sorted.length, savedDayCount: days.length, checkinDays: checkins.length,
          unresolvedExerciseCount: unresolved,
          workoutIds: sample.map(row => row.id), dayDates: [...new Set([...days.slice(0, 2), ...days.slice(-3)].map(day => day.date))], boundedReferences: sorted.length > sample.length || days.length > 5,
          rawDetailScope: "기간 전체의 집계와 별개로 처음·마지막 일지 일부, 종목·세트 일부만 전달합니다. 선택 종목의 선행 맥락은 필터 전 세션 전체로 계산합니다." },
        missingSignals: [sorted.length ? null : "조건에 맞는 저장 운동 기록이 없습니다. 운동하지 않았다는 뜻은 아닙니다.",
          unresolved && named ? "종목을 확인하지 못한 운동은 부위 조회에 임의로 포함하지 않았습니다. 원문 이름 연결 확인이 필요합니다." : null,
          days.length ? null : "해당 기간의 식사·몸 상태 기록이 없습니다.", checkins.length ? null : "해당 기간의 컨디션 자기보고가 없습니다."].filter(Boolean),
        details: { workouts: sample.map(record => compactRecord(fullRecords.get(record.id), selection, state.training?.mappings, fullContext(fullRecords.get(record.id)))),
          days: [...days.slice(0, 1), ...days.slice(-2)].filter((row, index, values) => values.findIndex(value => value.date === row.date) === index).map(day => ({ date: day.date, complete: day.complete,
            intake: day.meals.length ? I.mealTotals(day.meals) : null, checkin: day.coachCheckin || null, note: (day.note || "").slice(0, 800),
            savedPlan: day.planSnapshot ? { status: day.planSnapshot.status, energy: day.planSnapshot.energy, macros: day.planSnapshot.macros, context: { goal: day.planSnapshot.context?.goal || null } } : null })) } };
    });
    const current = state.days?.[date];
    return { ...selection, periods, stateUpdatedAt: state.updatedAt || null,
      currentReport: { source: "current-user-question", text: question, persisted: false, selectedDate: date, savedCheckin: current?.coachCheckin || null,
        savedMemoryUpdatedAt: state.training?.memory?.updatedAt || null,
        contextChangeRequested: /취소|철회|잊어|기억.*(?:빼|지워)|목표.*(?:바꿨|변경|바뀌|바꿀)|증량.*(?:바꿨|전환)|감량.*(?:바꿨|전환)/.test(question),
        interpretation: "질문에서 새로 말한 현재 상태와 저장된 과거 자기보고·합의는 별개입니다. 질문만으로 저장값·목표·기억은 바뀌지 않으며 충돌 시 최근 진술을 확인해야 합니다." },
      limits: ["조회에 사용한 것은 확인해 저장한 앱 기록입니다. 원본 사진을 재판독하지 않았으며 입력·분류 오류를 앱과 AI가 공유할 수 있습니다.",
        "집계는 해당 기간의 전체 선택 기록을 사용하지만 원문·수행 비교는 제한된 표본입니다. 기록 없는 날짜는 휴식·0섭취·분석 가능한 회복으로 바꾸지 않습니다.",
        "같은 부위 이름이 같은 운동·장비·중량 규약을 뜻하지 않습니다. 부위 세트 수 변화는 실제 성장률이나 개인의 최적 볼륨이 아닙니다."] };
  }
  return Object.freeze({ plan, retrieve });
});
