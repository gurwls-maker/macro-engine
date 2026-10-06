(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MacroTrainingCoaching = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const text = value => typeof value === "string" ? value : "";
  const sum = values => values.reduce((total, value) => total + value, 0);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const regular = row => !row.trainingIntent || ["unknown", "regular"].includes(row.trainingIntent);

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
  }

  function identity(row) {
    if (!row || !text(row.exerciseId) && !text(row.rawName)) return null;
    return JSON.stringify([text(row.exerciseId) || "raw:" + text(row.rawName), row.equipmentKey ?? null,
      row.loadConvention ?? null, row.variantKey ?? null, row.loadRole ?? null]);
  }

  function validSets(row) {
    const seen = new Map(), conflicts = new Set(), sets = [];
    for (const [position, set] of (Array.isArray(row?.sets) ? row.sets : []).entries()) {
      if (!set || set.marker !== null || !Number.isInteger(set.reps) || set.reps <= 0
        || set.loadKg !== null && (!finite(set.loadKg) || set.loadKg < 0)) continue;
      const value = { id: text(set.id) || null, loadKg: set.loadKg, reps: set.reps,
        rir: finite(set.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null, position };
      const signature = JSON.stringify([value.loadKg, value.reps, value.rir]);
      if (value.id && seen.has(value.id)) {
        if (seen.get(value.id) !== signature) conflicts.add(value.id);
      } else {
        if (value.id) seen.set(value.id, signature);
        sets.push(value);
      }
    }
    return sets.filter(set => !conflicts.has(set.id));
  }

  function isCoordinationMovement(movement) {
    return !!movement && !["rotation", "scapular-control", "mobility", "cardio"].includes(movement.pattern);
  }

  function coordinationExposure(exercises, catalog) {
    const movements = new Map((Array.isArray(catalog) ? catalog : []).map(movement => [movement.id, movement]));
    const byMuscle = {}, blockIds = [], excludedBlockIds = [];
    let workingSets = 0;
    // This is a planning distinction, not a conversion to physiological hard sets.
    for (const exercise of Array.isArray(exercises) ? exercises : []) {
      if (!exercise) continue;
      const movement = movements.get(exercise.exerciseId);
      if (!isCoordinationMovement(movement)) { excludedBlockIds.push(exercise.id); continue; }
      const count = validSets(exercise).length;
      workingSets += count;
      blockIds.push(exercise.id);
      for (const muscle of movement.primaryMuscles || []) byMuscle[muscle] = (byMuscle[muscle] || 0) + count;
    }
    return { workingSets, byMuscle, blockIds, excludedBlockIds };
  }

  function plannedEffort(exercise, planned) {
    if (!exercise || !planned || exercise.ruleConflict || exercise.exerciseId !== planned.exerciseId
      || !Number.isInteger(planned.sets) || planned.sets < 1 || !finite(planned.rir) || planned.rir < 0 || planned.rir > 10
      || !Number.isInteger(planned.repsMin) || planned.repsMin < 1 || !Number.isInteger(planned.repsMax) || planned.repsMax < planned.repsMin) return null;
    if (planned.equipmentKey && (exercise.equipmentKey !== planned.equipmentKey
      || !["record", "mapping"].includes(exercise.equipmentSource))) return null;
    if (planned.loadConvention && planned.loadConvention !== "as-recorded" && exercise.loadConvention !== planned.loadConvention) return null;
    const hasLoad = finite(planned.loadKg);
    // A load-specific prescription belongs only to confirmed, like-for-like external loads.
    if (hasLoad && (!planned.equipmentKey || !["total", "per-side"].includes(planned.loadConvention)
      || exercise.loadRole !== "external")) return null;
    const plannedSets = (Array.isArray(exercise.sets) ? exercise.sets : []).filter(set => set?.marker === null).slice(0, planned.sets);
    const matched = plannedSets.filter(set => Number.isInteger(set.reps) && set.reps > 0
      && (!hasLoad || set.loadKg === planned.loadKg));
    if (!matched.length) return null;
    const actual = matched.map(set => ({ id: set.id, loadKg: set.loadKg, reps: set.reps,
      rir: finite(set.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null }));
    return { targetRir: planned.rir, matchedSets: actual,
      belowSets: actual.filter(set => set.rir !== null && set.rir < planned.rir),
      unknownSetIds: actual.filter(set => set.rir === null).map(set => set.id) };
  }

  function fact(row, loadedMovement = false) {
    if (!row) return null;
    const sets = validSets(row), loads = [], index = new Map(), segments = [];
    for (const set of sets) {
      if (!index.has(set.loadKg)) {
        const load = { loadKg: set.loadKg, reps: [], setIds: [], positions: [], totalReps: 0, setCount: 0 };
        index.set(set.loadKg, load); loads.push(load);
      }
      const load = index.get(set.loadKg);
      load.reps.push(set.reps); load.setIds.push(set.id); load.positions.push(set.position);
      load.totalReps += set.reps; load.setCount++;
      let segment = segments.at(-1);
      if (!segment || segment.loadKg !== set.loadKg) {
        segment = { loadKg: set.loadKg, reps: [], setIds: [] }; segments.push(segment);
      }
      segment.reps.push(set.reps); segment.setIds.push(set.id);
    }
    const knownLoads = sets.length && sets.every(set => finite(set.loadKg));
    const external = (row.loadRole === "external" || row.loadRole === "unknown" && loadedMovement)
      && row.loadConvention !== "bodyweight";
    const idCounts = new Map();
    for (const set of Array.isArray(row.sets) ? row.sets : []) if (text(set?.id)) idCounts.set(set.id, (idCounts.get(set.id) || 0) + 1);
    const warmupSets = (Array.isArray(row.sets) ? row.sets : []).filter(set => text(set?.marker).toUpperCase() === "W"
      && (!text(set.id) || idCounts.get(set.id) === 1))
      .map(set => ({ id: text(set.id) || null, loadKg: finite(set.loadKg) && set.loadKg >= 0 ? set.loadKg : null,
        reps: Number.isInteger(set.reps) && set.reps >= 0 ? set.reps : null, marker: set.marker }));
    return {
      exerciseId: row.exerciseId || null, equipmentKey: row.equipmentKey ?? null,
      loadConvention: row.loadConvention ?? null, variantKey: row.variantKey ?? null, loadRole: row.loadRole ?? null,
      source: { date: row.date || null, sessionId: row.sessionId || null, blockId: row.blockId || row.id || null,
        setIds: sets.map(set => set.id).filter(Boolean) },
      sets, loads, segments, warmupSets, setCount: sets.length, totalReps: sum(sets.map(set => set.reps)),
      maxLoadKg: knownLoads && external ? Math.max(...sets.map(set => set.loadKg)) : null,
      displayedLoadReps: knownLoads && external ? sum(sets.map(set => set.loadKg * set.reps)) : null,
      fingerprint: JSON.stringify(sets.map(set => [set.loadKg, set.reps])),
      complete: Array.isArray(row.sets) && row.sets.filter(set => set?.marker === null).length === sets.length
    };
  }

  function eligibleHistory(current, values, loadedMovement) {
    const currentIdentity = identity(current), end = dateNumber(current?.date);
    if (!currentIdentity || end === null) return [];
    const rows = new Map(), conflicts = new Set(), byDate = new Map();
    for (const row of Array.isArray(values) ? values : []) {
      const when = dateNumber(row?.date), sourceId = row?.sessionId, blockId = row?.blockId || row?.id;
      if (identity(row) !== currentIdentity || when === null || when >= end || !text(sourceId) || !text(blockId)
        || row.ruleConflict || row.sourceKind === "legacy-ocr" || ["mild", "stop"].includes(row.pain) || !regular(row)) continue;
      const key = JSON.stringify([sourceId, blockId]), value = fact(row, loadedMovement);
      if (!value?.sets.length || !value.complete) continue;
      const signature = JSON.stringify([row.date, value.fingerprint, row.trainingIntent ?? null]);
      if (rows.has(key) && rows.get(key).signature !== signature) conflicts.add(key);
      else if (!rows.has(key)) rows.set(key, { row, fact: value, signature });
    }
    for (const [key, value] of rows) {
      if (conflicts.has(key)) continue;
      if (!byDate.has(value.row.date)) byDate.set(value.row.date, []);
      byDate.get(value.row.date).push(value);
    }
    // A repeated block is a separate exposure, not a second independent training day.
    return [...byDate.values()].filter(rows => rows.length === 1).map(rows => rows[0])
      .sort((a, b) => a.row.date.localeCompare(b.row.date));
  }

  const describeLoad = load => load.loadKg === null ? `${load.reps.join("·")}회` : `${load.loadKg}kg × ${load.reps.join("·")}회`;
  const describeWork = value => value.segments.map(describeLoad).join(" / ");
  const loadAt = (value, kg) => value?.loads.find(load => load.loadKg === kg);
  const refs = (...values) => values.filter(Boolean).map(value => ({ ...value.source, setIds: value.source.setIds.slice() }));
  const action = (kind, title, body, ids) => ({ kind, title, body, focusSetIds: ids.filter(Boolean) });

  function importantChange(before, after) {
    const external = before.maxLoadKg !== null && before.maxLoadKg > 0 && after.maxLoadKg !== null;
    const raised = external && after.maxLoadKg > before.maxLoadKg;
    const lowered = external && after.maxLoadKg <= before.maxLoadKg * 0.85;
    const addedSets = after.setCount >= before.setCount * 1.5 && after.setCount - before.setCount >= 2;
    const fewerSets = after.setCount <= before.setCount * 0.75;
    const sameLayout = equal(before.sets.map(set => set.loadKg), after.sets.map(set => set.loadKg));
    const fewerReps = sameLayout && after.totalReps <= before.totalReps * 0.75;
    const beforeMean = before.totalReps / before.setCount, afterMean = after.totalReps / after.setCount;
    if (addedSets && lowered) return "redistributed";
    if (addedSets) return "expanded";
    if (!raised && (lowered && afterMean <= beforeMean * 1.15 && after.setCount <= before.setCount
      || fewerSets && afterMean <= beforeMean * 1.15 || fewerReps)) return "reduced";
    if (external && after.maxLoadKg >= before.maxLoadKg * 1.15 && after.setCount === before.setCount
      && after.sets.every((set, index) => set.reps >= before.sets[index].reps)) return "raised-load";
    if (fewerSets && afterMean > beforeMean * 1.15 || external && (lowered || after.maxLoadKg >= before.maxLoadKg * 1.15 || raised && fewerSets)) return "reconfigured";
    return null;
  }

  function consecutiveWorkStages(currentRow, current, recent) {
    const groups = [];
    for (const value of [...recent, { row: currentRow, fact: current }]) {
      let group = groups.at(-1);
      if (!group || group.fingerprint !== value.fact.fingerprint) {
        group = { fingerprint: value.fact.fingerprint, values: [] }; groups.push(group);
      }
      group.values.push(value);
    }
    return groups;
  }

  function reducedRecordedWork(before, after) {
    if (importantChange(before, after) === "reduced") return true;
    const sameLayout = before.setCount === after.setCount && equal(before.sets.map(set => set.loadKg), after.sets.map(set => set.loadKg));
    if (sameLayout) return after.sets.every((set, index) => set.reps <= before.sets[index].reps)
      && after.sets.some((set, index) => set.reps < before.sets[index].reps);
    return before.loads.length === 1 && after.loads.length === 1 && before.maxLoadKg !== null && after.maxLoadKg !== null
      && after.maxLoadKg <= before.maxLoadKg && after.setCount <= before.setCount
      && after.sets.every((set, index) => set.reps <= before.sets[index].reps)
      && (after.maxLoadKg < before.maxLoadKg || after.setCount < before.setCount);
  }

  function recentEpisode(currentRow, current, recent) {
    const groups = consecutiveWorkStages(currentRow, current, recent);
    const phase = groups.at(-1);
    if (!phase || groups.length < 2) return null;
    let anchorIndex = -1, kind = null;
    for (let index = groups.length - 3; index >= 0; index--) {
      const anchor = groups[index], middle = groups.slice(index + 1, -1);
      if (anchor.values.length >= 2 && anchor.fingerprint === current.fingerprint
        && middle.every(stage => stage.fingerprint !== anchor.fingerprint)) {
        anchorIndex = index; kind = "returned"; break;
      }
    }
    for (let index = groups.length - 2; anchorIndex < 0 && index >= 0; index--) {
      if (groups[index].values.length < 2) continue;
      const change = importantChange(groups[index].values.at(-1).fact, current);
      if (change) { anchorIndex = index; kind = change; break; }
    }
    if (anchorIndex < 0) return null;
    for (let index = anchorIndex - 1; kind !== "returned" && index >= 0; index--) {
      if (groups[index].values.length < 2) continue;
      const before = groups[index].values.at(-1).fact, after = groups[anchorIndex].values.at(-1).fact;
      const totalChange = importantChange(before, current), precedingChange = importantChange(before, after);
      if (totalChange === kind && precedingChange === kind) anchorIndex = index;
      else if (kind === "reconfigured" && totalChange === "reduced" && precedingChange === "reduced") {
        anchorIndex = index; kind = "reduced";
      }
      else break;
    }
    const anchor = groups[anchorIndex], baseline = anchor.values.at(-1).fact;
    const phaseDates = phase.values.map(value => value.row.date), baselineDates = anchor.values.map(value => value.row.date);
    return { kind, since: groups[anchorIndex + 1].values[0].row.date, currentSince: phaseDates[0],
      currentDays: phaseDates, observationDays: phaseDates.length,
      spanDays: (dateNumber(currentRow.date) - dateNumber(phaseDates[0])) / DAY,
      baseline, baselineDates,
      ...(kind === "returned" ? { intermediateWorkReduced: groups.slice(anchorIndex + 1, -1)
        .every(group => reducedRecordedWork(baseline, group.values.at(-1).fact)) } : {}),
      stages: groups.slice(anchorIndex + 1).map(group => ({ dates: group.values.map(value => value.row.date), work: group.values.at(-1).fact })),
      sourceFacts: groups.slice(anchorIndex).flatMap(group => group.values.map(value => value.fact)) };
  }

  function interpret(input = {}) {
    input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const currentRow = input.current || {}, loadedMovement = input.loadedMovement === true;
    const current = fact(currentRow, loadedMovement), currentIdentity = identity(currentRow);
    const end = dateNumber(currentRow.date), previousDate = dateNumber(input.previous?.date);
    const previousRow = input.currentAmbiguous !== true && currentIdentity && identity(input.previous) === currentIdentity && previousDate !== null && end !== null && previousDate < end
      && !input.previous.ruleConflict && input.previous.sourceKind !== "legacy-ocr" && regular(input.previous)
      && !["mild", "stop"].includes(input.previous.pain) ? input.previous : null;
    const previous = fact(previousRow, loadedMovement);
    const history = input.currentAmbiguous === true ? [] : eligibleHistory(currentRow, input.history, loadedMovement);
    const recent = history.filter(value => end - dateNumber(value.row.date) <= 42 * DAY);
    const loadComparisons = [];
    for (const load of current?.loads || []) {
      const old = loadAt(previous, load.loadKg);
      if (old) loadComparisons.push({ loadKg: load.loadKg, previous: old, current: load,
        sameSetCount: old.setCount === load.setCount, totalRepChange: load.totalReps - old.totalReps,
        roleChanged: input.structure?.kind !== input.previousStructure?.kind || old.positions[0] !== load.positions[0] });
    }
    const facts = { current, previous, loadComparisons, historyDays: history.map(value => value.row.date),
      recentHistoryDays: recent.map(value => value.row.date), scope: currentIdentity };
    const signals = [], candidates = [];
    const signal = (kind, detail = {}, sources = refs(current, previous)) => signals.push({ kind, ...detail, sourceRefs: sources });
    const propose = (priority, assessment, primaryAction, supportingActions = [], question = null) => {
      candidates.push({ priority, assessment, primaryAction, supportingActions: supportingActions.slice(0, 2), ...(question ? { question } : {}) });
    };
    const answer = () => {
      // Local interpretation precedence is distinct from whole-session coaching importance.
      const { importance, ...selected } = candidates.sort((a, b) => b.priority - a.priority)[0] || {};
      const result = { facts, signals, assessment: "", primaryAction: null, supportingActions: [], priority: 0,
        ...selected, ...(importance === undefined ? {} : { priority: importance }) };
      const reclassified = signals.find(signal => signal.kind === "work-reclassified-as-warmup");
      if (result.assessment && reclassified) result.assessment += ` 이전 일반 세트의 ${reclassified.loadKg.join("·")}kg은 이번에 준비 세트로 구분했어요.`;
      if (result.assessment && previous && end - previousDate > 42 * DAY) {
        result.assessment = `${previous.source.date}의 오래된 기록을 참고하면 ${result.assessment}`;
        result.primaryAction = action("reestablish-current-work", "이번 수행을 현재의 출발점으로", `과거 기록을 바로 따라잡기보다 이번 ${describeWork(current)}를 한 번 더 해보세요. 현재 구성이 제어되면 한 세트의 작은 변화부터 선택해요.`, current.source.setIds);
        result.supportingActions = result.supportingActions.filter(item => ["restore-tail", "preserve-rep-distribution"].includes(item.kind));
      }
      return result;
    };
    if (!current?.setCount || !currentIdentity || currentRow.ruleConflict || currentRow.sourceKind === "legacy-ocr" || !current.complete) return answer();
    const goal = input.profile?.goal, weightGoal = ["maintain", "lose"].includes(goal);
    const previousUsable = previous?.setCount && previous.complete;
    const currentTop = loadAt(current, current.maxLoadKg), previousTop = loadAt(previous, previous?.maxLoadKg);
    const expected = input.performance?.model?.expectedRepsAtCurrentLoad || input.performance?.expectedRepsAtCurrentLoad;
    const currentCapacity = input.performance?.model?.current || input.performance?.current;
    const highRange = expected && currentCapacity && currentCapacity.loadKg === current.maxLoadKg
      ? ` 이전 수행으로 가늠한 ${expected.min === expected.max ? expected.min : `${expected.min}~${expected.max}`}회와 비교해 ${currentCapacity.reps >= expected.min && currentCapacity.reps <= expected.max ? "무거운 세트는 예상 범위 안에 들어왔어요" : "현재 수행을 새 기준으로 확인할 차례예요"}.` : "";
    const pacing = current.loads.filter(load => load.setCount >= 2 && load.reps.at(-1) < load.reps[0]);
    for (const load of pacing) signal("within-load-rep-drop", { loadKg: load.loadKg, reps: load.reps.slice(), setIds: load.setIds.slice() }, refs(current));

    if (previousUsable) {
      signal("whole-work-change", { setCountChange: current.setCount - previous.setCount,
        totalRepChange: current.totalReps - previous.totalReps, changedComposition: current.fingerprint !== previous.fingerprint });
      for (const pair of loadComparisons) signal("same-load-change", { loadKg: pair.loadKg,
        previousReps: pair.previous.reps.slice(), currentReps: pair.current.reps.slice(),
        previousSetIds: pair.previous.setIds.slice(), currentSetIds: pair.current.setIds.slice(),
        roleChanged: pair.roleChanged, setCountChange: pair.current.setCount - pair.previous.setCount, totalRepChange: pair.totalRepChange });

      const addedLoads = current.loads.filter(load => !loadAt(previous, load.loadKg));
      const removedLoads = previous.loads.filter(load => !loadAt(current, load.loadKg));
      if (addedLoads.length || removedLoads.length) signal("load-emphasis-changed", { addedLoads, removedLoads });
      const warmupMoved = removedLoads.filter(load => load.loadKg !== null && current.warmupSets.some(set => set.loadKg === load.loadKg));
      if (warmupMoved.length) signal("work-reclassified-as-warmup", { loadKg: warmupMoved.map(load => load.loadKg),
        currentWarmupSetIds: current.warmupSets.filter(set => warmupMoved.some(load => load.loadKg === set.loadKg)).map(set => set.id).filter(Boolean) },
        [{ ...current.source, setIds: current.warmupSets.filter(set => warmupMoved.some(load => load.loadKg === set.loadKg)).map(set => set.id).filter(Boolean) }, previous.source]);

      if (currentTop && previousTop && current.maxLoadKg > previous.maxLoadKg) {
        const backoff = loadAt(current, previous.maxLoadKg);
        const lowerSegments = current.segments.filter(segment => segment.loadKg < current.maxLoadKg);
        const lowerSetIds = lowerSegments.flatMap(segment => segment.setIds).filter(Boolean);
        signal("new-heavy-exposure", { previousHighestLoadKg: previous.maxLoadKg, highestLoadKg: current.maxLoadKg,
          topSetIds: currentTop.setIds.slice(), backoffSetIds: backoff?.setIds.slice() || [] });
        const reducedBackoff = backoff && (backoff.setCount < previousTop.setCount || backoff.totalReps < previousTop.totalReps);
        const tailDrop = backoff && backoff.setCount > 1 && backoff.reps.at(-1) < backoff.reps[0];
        const support = tailDrop ? [action("restore-tail", "낮춘 중량의 뒤 세트까지 확보", `중량을 낮춘 ${describeLoad(backoff)} 구간은 앞뒤 반복이 줄었어요. 무거운 세트 뒤에 충분히 쉬고, 다음에는 이 구간의 마지막 ${backoff.reps.at(-1)}회를 제어하며 마치는 데 집중하세요. 여유가 생기면 뒤 세트에서만 1회 더 시도해요.`, backoff.setIds)] : [];
        const experience = input.performance?.loadExperience;
        const returning = experience && input.performance?.model?.current?.loadKg === current.maxLoadKg;
        const assessment = `이번에는 ${describeLoad(currentTop)}의 무거운 구간을 ${returning ? "다시" : "새로"} 넣었어요.${returning ? ` 이 장비의 ${current.maxLoadKg}kg은 ${experience.date}에도 ${experience.reps}회를 했고${experience.daysAgo > 42 ? ", 오래전 수행을 바로 따라잡기보다 이번 반복에서 이어가요" : ", 이번 구성과 나눠 참고해요"}.` : ""}${highRange}${reducedBackoff ? ` 이전 ${describeLoad(previousTop)}는 이번 ${describeLoad(backoff)}의 낮춘 중량 구간으로 바뀌었어요. 무거운 세트 적응과 뒤 세트 확보를 나눠 볼게요.` : current.setCount > currentTop.setCount ? " 이전보다 무거운 구간이 생긴 만큼 나머지 세트까지 함께 올릴 필요는 없어요." : " 이전보다 높인 부하에서 이번 반복을 제어하며 이어가는 게 먼저예요."}`;
        const primary = action("consolidate-heavy", "새 무거운 구간을 먼저 안정시키기", `다음에는 ${describeLoad(currentTop)}를 같은 세트 수로 한 번 더 해보세요. ${lowerSegments.length ? `중량을 낮춘 ${lowerSegments.map(describeLoad).join(" / ")}도 남겨 두고, ` : ""}무거운 중량과 전체 세트 수를 한꺼번에 늘리지 않아요.${!tailDrop && backoff ? " 이번 구성을 한 번 안정적으로 마친 뒤에는 낮춘 구간의 한 세트에서 반복을 늘리는 선택도 있어요." : ""}`, currentTop.setIds);
        primary.preservedSetIds = lowerSetIds;
        propose(90, assessment, primary, support);
        if (current.loads.length === 1 && previous.loads.length === 1 && current.setCount === previous.setCount
          && current.sets.every((set, index) => set.reps >= previous.sets[index].reps)) {
          signal("load-raised-held-work", { previousLoadKg: previous.maxLoadKg, currentLoadKg: current.maxLoadKg,
            setCount: current.setCount, previousReps: previousTop.reps.slice(), currentReps: currentTop.reps.slice() });
          propose(92, `${previous.maxLoadKg}kg에서 ${current.maxLoadKg}kg로 올리고도 ${currentTop.reps.join("·")}회, ${current.setCount}세트를 유지했어요. 이미 부하를 높여 수행한 날이니 추가 반복까지 겹치기보다 새 중량을 안정시키면 돼요.`,
            action("consolidate-raised-load", "올린 부하에서 전체 수행 유지", `다음에도 ${describeLoad(currentTop)}를 먼저 이어가세요. 마지막 세트까지 같은 반복과 동작을 유지하면 그다음에 한 세트의 작은 변화만 선택해요.`, currentTop.setIds));
        }
      }

      if (currentTop && previousTop && current.maxLoadKg < previous.maxLoadKg) {
        signal("heavier-work-removed", { removedHighestLoadKg: previous.maxLoadKg, currentHighestLoadKg: current.maxLoadKg,
          currentSetIds: current.source.setIds.slice(), previousTopSetIds: previousTop.setIds.slice() });
        const preserved = loadComparisons.find(pair => pair.current.setIds.includes(current.sets[0]?.id) && pair.previous.setIds.includes(previous.sets[0]?.id)
          && pair.current.reps[0] === pair.previous.reps[0]);
        const assessment = `이전에는 ${describeLoad(previousTop)}까지 갔고, 이번에는 ${describeLoad(currentTop)}에 반복을 모았어요.${current.setCount > previous.setCount ? ` 중량은 낮췄지만 세트는 ${previous.setCount}개에서 ${current.setCount}개로 늘렸어요. 가볍게만 한 날이라기보다 낮은 부하로 세트를 더 확보한 구성이에요.` : preserved ? ` 첫 ${preserved.current.reps[0]}회가 같아도 무거운 구간을 빼서 운동의 부담 배분이 달라졌어요.` : " 중량을 낮춘 대신 이번에 수행한 전체 구성을 기준으로 이어가요."}`;
        propose(85, assessment, action("repeat-rebuilt-work", "바뀐 부하 구성부터 이어가기", `다음에는 ${describeWork(current)}를 먼저 안정적으로 이어가세요. 가볍게 바꾼 날이었다면 이 방향을 유지하고, 평소 무거운 구간을 다시 넣을 목적이라면 준비 세트에서 상태를 본 뒤 기존 ${previous.maxLoadKg}kg 구간부터 따로 재도입해요. 지금 중량의 반복을 늘리는 일과 무거운 구간 복귀를 동시에 하지 않아요.`, current.source.setIds));
      }

      if (currentTop && previousTop && current.maxLoadKg === previous.maxLoadKg) {
        const basePairs = loadComparisons.filter(pair => pair.loadKg < current.maxLoadKg);
        const heldBase = basePairs.length && basePairs.every(pair => pair.sameSetCount && pair.current.totalReps >= pair.previous.totalReps);
        if (heldBase && currentTop.setCount === previousTop.setCount && currentTop.totalReps < previousTop.totalReps) {
          signal("base-held-heavy-lower", { heavyLoadKg: current.maxLoadKg, heavyPreviousReps: previousTop.reps.slice(),
            heavyCurrentReps: currentTop.reps.slice(), baseLoadKg: basePairs.map(pair => pair.loadKg) });
          const base = basePairs[0];
          propose(88, `${describeLoad(base.current)}의 작업 구간은 유지됐고, ${current.maxLoadKg}kg의 무거운 구간만 ${previousTop.reps.join("·")}회에서 ${currentTop.reps.join("·")}회로 줄었어요. 전체 운동이 무너진 흐름보다는 무거운 구간을 다시 맞추는 쪽이에요.`,
            action("keep-base-check-heavy", "기본 구간은 유지하고 무거운 세트만 점검", `${describeLoad(base.current)}는 그대로 이어가세요. ${describeLoad(currentTop)}를 시도하기 전에 충분히 쉬고, 이번 반복을 먼저 확보해요. ${previousTop.reps.join("·")}회로 곧바로 되돌리기보다 동작이 잘 유지되면 무거운 구간의 한 세트에서 1회 더 시도하세요.`, currentTop.setIds),
            basePairs.slice(1, 2).map(pair => action("maintain-base", "유지된 작업 구간은 그대로", `${describeLoad(pair.current)}는 이번 구성에 두고 무거운 구간만 조절해요.`, pair.current.setIds)));
          candidates.at(-1).primaryAction.preservedSetIds = basePairs.flatMap(pair => pair.current.setIds);
        }
        if (currentTop.setCount > previousTop.setCount && removedLoads.some(load => load.loadKg < current.maxLoadKg)) {
          signal("heavy-work-expanded", { loadKg: current.maxLoadKg, previousLoadSetCount: previousTop.setCount,
            currentLoadSetCount: currentTop.setCount, previousTotalSetCount: previous.setCount,
            currentTotalSetCount: current.setCount, removedLowerLoads: removedLoads.map(load => load.loadKg) });
          const rearRange = currentTop.reps.at(-1) >= currentTop.reps[0] * 1.4;
          const support = rearRange ? [action("preserve-rep-distribution", "뒤 세트 수행은 살리고 전체 목표를 통일하지 않기",
            `이번에는 같은 ${current.maxLoadKg}kg에서 ${currentTop.reps.join("·")}회를 했어요. 마지막 ${currentTop.reps.at(-1)}회도 다음 선택에 참고하되 모든 세트를 그 횟수로 맞출 필요는 없어요.`, currentTop.setIds.slice(-1))] : [];
          propose(80, `${current.setCount === previous.setCount ? `전체는 ${current.setCount}세트로 같지만,` : `총 일반 세트는 ${previous.setCount}개에서 ${current.setCount}개로 바뀌었지만,`} ${current.maxLoadKg}kg 구간은 ${previousTop.setCount}세트에서 ${currentTop.setCount}세트로 늘었어요. 낮은 중량의 일반 세트 대신 무거운 중량에서 세트를 더 확보했어요.${rearRange ? ` 마지막 ${currentTop.reps.at(-1)}회까지 수행한 만큼 그 세트의 반복도 다음 선택에 참고할 수 있어요.` : ""}`,
            action("hold-redistributed-work", "작업 부하에 모은 구성을 먼저 유지", `다음에도 ${describeLoad(currentTop)}를 먼저 이어가세요. 이미 ${current.maxLoadKg}kg 구간을 늘렸으니 같은 날 추가 증량이나 세트까지 겹치지 않고, 이 구간의 마지막 세트까지 제어가 유지되는지 확인해요.`, currentTop.setIds), support);
        }
      }

      const first = current.sets[0], priorFirst = previous.sets[0];
      const sameFirst = first.loadKg === priorFirst.loadKg && first.reps === priorFirst.reps;
      const sameLoadLayout = equal(current.sets.map(set => set.loadKg), previous.sets.map(set => set.loadKg));
      if (sameFirst && current.setCount === previous.setCount && sameLoadLayout) {
        const tailDelta = sum(current.sets.slice(1).map(set => set.reps)) - sum(previous.sets.slice(1).map(set => set.reps));
        const betterTail = current.sets.filter((set, index) => index > 0 && set.reps > previous.sets[index].reps);
        const lowerTail = current.sets.filter((set, index) => index > 0 && set.reps < previous.sets[index].reps);
        if (tailDelta) {
          const improved = tailDelta > 0, changed = current.sets.filter((set, index) => index > 0 && set.reps !== previous.sets[index].reps);
          signal(improved ? "tail-improved" : "tail-lower", { unchangedFirst: { loadKg: first.loadKg, reps: first.reps },
            previousTotalReps: previous.totalReps, currentTotalReps: current.totalReps, changedSetIds: changed.map(set => set.id) });
          propose(improved ? 65 : 72, `첫 세트 ${describeLoad({ loadKg: first.loadKg, reps: [first.reps] })}는 같지만 뒤 세트가 ${improved ? "더 이어져" : "줄어"} 전체 반복은 ${previous.totalReps}회에서 ${current.totalReps}회로 ${improved ? "늘었어요" : "낮아졌어요"}. ${improved ? "앞 세트를 더 밀지 않고도 작업 구간이 좋아진 기록이에요." : "다음 과제는 첫 세트 증량보다 뒤 세트의 반복을 되찾는 일이에요."}`,
            improved ? action("confirm-improved-tail", "늘어난 뒤 수행을 한 번 더 확보", `다음에도 ${describeWork(current)}를 먼저 이어가세요. 전체 세트가 같은 수준으로 유지되면 그다음에 한 세트의 반복이나 가장 작은 부하 변화 중 하나만 선택해요.`, changed.map(set => set.id))
              : action("restore-tail", "앞 세트는 유지하고 뒤 반복부터 회복", `첫 ${describeLoad({ loadKg: first.loadKg, reps: [first.reps] })}는 유지하고 세트 사이에 충분히 쉬어 보세요. 뒤 세트는 이번 ${current.sets.slice(1).map(set => set.reps).join("·")}회부터 제어하며 이어가고, 여유가 있으면 줄었던 세트에서만 1회 더 시도해요. 앞 세트를 늘려 뒤 수행을 더 소모하지는 않아요.`, changed.map(set => set.id)));
        }
        if (betterTail.length && lowerTail.length) {
          signal("mixed-tail-change", { improvedSetIds: betterTail.map(set => set.id), lowerSetIds: lowerTail.map(set => set.id),
            previousReps: previous.sets.map(set => set.reps), currentReps: current.sets.map(set => set.reps), totalRepChange: tailDelta });
          propose(74, `같은 중량 구간에서 뒤 반복이 ${previous.sets.slice(1).map(set => set.reps).join("·")}회에서 ${current.sets.slice(1).map(set => set.reps).join("·")}회로 바뀌었어요. 늘어난 세트와 줄어든 세트가 함께 있어 전체 반복 하나로 좋아졌다거나 나빠졌다고 묶기보다, 줄었던 구간을 먼저 맞춰 볼게요.`,
            action("rebalance-tail", "늘어난 세트는 두고 줄었던 세트부터 맞추기", `첫 ${describeLoad({ loadKg: first.loadKg, reps: [first.reps] })}와 더 이어간 세트는 이번 수행에 두세요. 줄었던 세트 전에 충분히 쉬고, 이번 반복을 제어하며 유지한 뒤 그 세트에서만 1회 더 시도해요. 앞쪽 반복을 더 얹어 뒤 구간을 소모하지 않아요.`, lowerTail.map(set => set.id)),
            [action("keep-improved-tail", "잘 이어진 구간은 추가 증량 없이 유지", `${betterTail.map(set => describeLoad({ loadKg: set.loadKg, reps: [set.reps] })).join(" / ")}는 이번 수준에 두고 다른 구간을 먼저 안정시켜요.`, betterTail.map(set => set.id))]);
        }
      }

      const knownSameMax = current.maxLoadKg !== null && current.maxLoadKg === previous.maxLoadKg;
      const sameUnloadedWork = current.maxLoadKg === null && previous.maxLoadKg === null
        && equal(current.loads.map(load => load.loadKg), previous.loads.map(load => load.loadKg));
      if (current.setCount > previous.setCount && (knownSameMax || sameUnloadedWork)) {
        signal("work-expanded", { previousSetCount: previous.setCount, currentSetCount: current.setCount });
        propose(78, `${knownSameMax ? `가장 무거운 ${current.maxLoadKg}kg은 유지하고` : "같은 부하 구성에서"} 일반 세트를 ${previous.setCount}개에서 ${current.setCount}개로 늘렸어요. 이미 운동량을 바꾼 날이니 첫 세트가 같아도 추가 변화까지 겹칠 필요는 없어요.`,
          action("hold-expanded-work", "늘린 세트 구성을 먼저 유지", `다음에도 ${describeWork(current)}를 먼저 해보세요. 늘어난 세트까지 동작과 반복을 유지하는지 확인한 뒤 다음 변화를 고르고, 지금은 중량·반복·세트를 더 얹지 않아요.`, current.source.setIds));
      } else if (current.setCount < previous.setCount && (knownSameMax || sameUnloadedWork)) {
        signal("work-reduced", { previousSetCount: previous.setCount, currentSetCount: current.setCount });
        propose(58, `${knownSameMax ? `가장 무거운 ${current.maxLoadKg}kg은 유지하고` : "같은 부하 구성에서"} 일반 세트가 ${previous.setCount}개에서 ${current.setCount}개로 줄었어요. 이번 ${describeWork(current)}는 세트 수를 줄인 구성으로 이어가면 돼요.`,
          action("keep-reduced-work", "이번 구성에 맞춰 다음 운동 잡기", `다음에도 ${describeWork(current)}부터 이어가세요. 시간이나 목적 때문에 줄였다면 빠진 세트를 몰아 보충하지 않고, 평소 구성을 되찾는 중이라면 기존 세트 하나를 다시 넣는 일과 증량 중 하나만 선택해요.`, current.source.setIds));
      }

      const recovering = loadComparisons.filter(pair => pair.sameSetCount && pair.totalRepChange > 0);
      const declining = loadComparisons.some(pair => pair.sameSetCount && pair.totalRepChange < 0);
      if (recovering.length && !declining && current.setCount === previous.setCount && !signals.some(item => item.kind === "mixed-tail-change")) {
        const pair = recovering[0];
        const olderHigher = recent.slice(0, -1).find(value => {
          const old = loadAt(value.fact, pair.loadKg);
          return old?.setCount === pair.current.setCount && old.totalReps > pair.current.totalReps;
        });
        signal("working-performance-improved", { loadKg: pair.loadKg, previousReps: pair.previous.reps.slice(), currentReps: pair.current.reps.slice() });
        if (olderHigher) {
          signal("recovering-working-performance", { olderReferenceDate: olderHigher.row.date }, refs(current, previous, olderHigher.fact));
          propose(76, `${pair.loadKg === null ? "같은 부하" : `${pair.loadKg}kg`}에서 직전 ${pair.previous.reps.join("·")}회보다 이번 ${pair.current.reps.join("·")}회로 더 이어갔어요. 예전 최고와는 아직 차이가 있어도 최근 흐름은 수행을 되찾는 쪽이에요.`,
            action("continue-recovery", "최근 좋아진 수행에서 이어가기", `다음에는 ${describeLoad(pair.current)}를 먼저 유지해 보세요. 예전 최고 반복을 한 번에 채우려 하지 말고, 이번 구간이 잘 유지되면 한 세트에서만 1회 더 이어가요.`, pair.current.setIds));
        }
      }
      if (sameLoadLayout && current.setCount === previous.setCount && current.fingerprint !== previous.fingerprint) {
        const improved = current.sets.filter((set, index) => set.reps > previous.sets[index].reps);
        const lower = current.sets.filter((set, index) => set.reps < previous.sets[index].reps);
        if (improved.length && !lower.length) {
          signal("whole-work-improved", { previousTotalReps: previous.totalReps, currentTotalReps: current.totalReps,
            changedSetIds: improved.map(set => set.id) });
          propose(60, `${describeWork(previous)}보다 이번 ${describeWork(current)}로 같은 중량에서 반복을 더 이어갔어요. ${current.setCount === 1 ? `이번에는 ${current.totalReps - previous.totalReps}회를 더 해낸 기록이에요.` : `전체 반복도 ${previous.totalReps}회에서 ${current.totalReps}회로 늘었으니 이미 수행을 한 단계 높인 날이에요.`}`,
            action("consolidate-improved-work", "이번에 늘린 반복부터 유지", `다음에는 ${describeWork(current)}를 먼저 이어가세요. 뒤 세트까지 이번 반복이 유지되는지 본 뒤 다음 작은 변화를 고르고, 오늘 늘린 반복과 증량을 동시에 겹치지는 않아요.`, improved.map(set => set.id)));
        } else if (lower.length && !improved.length) {
          signal("whole-work-lower", { previousTotalReps: previous.totalReps, currentTotalReps: current.totalReps,
            changedSetIds: lower.map(set => set.id) });
          propose(55, `같은 중량의 반복이 ${describeWork(previous)}에서 이번 ${describeWork(current)}로 줄었어요. 다음에는 이번 수행부터 안정적으로 이어가며 평소 구간으로 돌아오는지 보면 돼요.`,
            action("reestablish-working-reps", "이번 반복에서 다시 맞추기", `다음에는 ${describeWork(current)}부터 이어가세요. 세트 사이에 충분히 쉬고 동작을 제어하면서, 여유가 생긴 한 세트에서만 1회 더 시도해요. 이전 전체 반복을 한 번에 채우려 밀지는 않아요.`, lower.map(set => set.id)));
        }
      }
      if (current.fingerprint !== previous.fingerprint && !candidates.length) {
        signal("work-composition-rebuilt", { previousSegments: previous.segments, currentSegments: current.segments });
        propose(40, `이전 ${describeWork(previous)}에서 이번 ${describeWork(current)}로 세트 조합이 바뀌었어요. 한 세트의 무게나 횟수만 이어가기보다 이번 각 구간을 따로 기준으로 잡으면 돼요.`,
          action("repeat-rebuilt-work", "바뀐 세트 구간부터 재현", `다음에는 ${describeWork(current)}를 먼저 이어가세요. 반복이나 중량을 바꾸고 싶다면 ${current.loads.length > 1 ? "이 중 한 구간만 선택하고 나머지 구간은 이번 수준에 둬요." : "두 가지를 한꺼번에 높이지 말고 하나만 선택해요."}`, current.source.setIds));
      }
    }

    const trail = [];
    if (regular(currentRow)) {
      for (const value of recent.slice().reverse()) {
        if (value.fact.fingerprint !== current.fingerprint) break;
        trail.push(value);
      }
    }
    const stages = regular(currentRow) ? consecutiveWorkStages(currentRow, current, recent) : [];
    if (stages.length > 1 && stages.slice(0, -1).some(stage => stage.values.length >= 2)) {
      const retained = stages.slice(-6);
      facts.recordedWorkStages = { scope: "same-exercise-equipment-42-days", from: retained[0].values[0].row.date,
        to: currentRow.date, stageCount: stages.length, retainedStageCount: retained.length, sampled: stages.length > retained.length,
        stages: retained.map(stage => ({ dates: stage.values.map(value => value.row.date), work: stage.values.at(-1).fact,
          sourceRefs: refs(...stage.values.map(value => value.fact)) })) };
    }
    const episode = regular(currentRow) ? recentEpisode(currentRow, current, recent) : null;
    if (episode) {
      const { sourceFacts, ...episodeFacts } = episode;
      facts.recentChange = episodeFacts;
      signal(`recent-work-${episode.kind}`, { since: episode.since, currentSince: episode.currentSince,
        observationDays: episode.observationDays, spanDays: episode.spanDays, baselineDates: episode.baselineDates.slice(),
        previousSetCount: episode.baseline.setCount, currentSetCount: current.setCount,
        previousHighestLoadKg: episode.baseline.maxLoadKg, currentHighestLoadKg: current.maxLoadKg }, refs(...sourceFacts));
    }
    const returnedContext = episode?.kind === "returned" ? (() => {
      const dateRange = dates => `${dates[0]}${dates.at(-1) === dates[0] ? "" : `~${dates.at(-1)}`}`;
      const middle = episode.stages.slice(0, -1);
      const shown = middle.length <= 2 ? middle : [middle[0], middle.at(-1)];
      const returned = episode.observationDays === 1 ? `${episode.currentSince}에는 이전 ${describeWork(current)} 구성으로 돌아왔어요.`
        : `${episode.currentSince}부터 이전 ${describeWork(current)} 구성으로 돌아와 ${episode.observationDays}차례 같은 세트를 이어갔어요.`;
      const changes = episode.intermediateWorkReduced ? "로 줄여 수행했어요." : "로 구성을 바꿔 수행했어요.";
      return `${dateRange(episode.baselineDates)}에는 ${describeWork(episode.baseline)}를 이어냈고, ${shown.map(stage => `${dateRange(stage.dates)}에는 ${describeWork(stage.work)}`).join(", ")}${changes} ${returned}`;
    })() : null;
    if (returnedContext && trail.length < 2) {
      const substantialReduction = episode.intermediateWorkReduced && episode.stages.slice(0, -1)
        .some(stage => importantChange(episode.baseline, stage.work) === "reduced");
      propose(95, `${returnedContext} 앞서 이어냈던 전체 작업을 다시 수행한 기록이에요.`,
        action("reestablish-recorded-work", "다시 이어낸 이전 작업부터 안정시키기", `다음에도 돌아온 ${describeWork(current)}를 먼저 이어가세요. ${episode.intermediateWorkReduced ? "중간에 줄였던 세트를 몰아 보충하거나 예전보다 더 얹지 않고" : "중간에 바꿨던 세트나 중량을 꼭 다시 채울 필요는 없고"}, 이번 전체 구간과 운동 뒤·다음 날 반응을 확인해요. 잘 이어지는지 본 뒤 한 세트의 반복이나 최소 부하 변화 중 하나만 선택해요.`, current.source.setIds));
      candidates.at(-1).importance = substantialReduction ? 85 : 55;
    }
    if (trail.length >= 2) {
      const observationDays = trail.length + 1;
      signal("stable-whole-work", { observationDays, dates: [...trail.slice().reverse().map(value => value.row.date), currentRow.date] }, refs(current, ...trail.map(value => value.fact)));
      const dominant = current.loads.slice().sort((a, b) => b.setCount - a.setCount || b.positions.at(-1) - a.positions.at(-1))[0];
      const dominantSets = current.sets.filter(set => set.loadKg === dominant.loadKg);
      const behindLower = dominant.reps.at(-1) < dominant.reps[0];
      const chosen = behindLower ? dominantSets.at(-1) : dominantSets.find(set => set.rir !== 0) || dominantSets[0];
      const addReps = chosen.reps > 3 && chosen.reps < 100000 && chosen.rir !== 0;
      const stableAssessment = `${describeWork(current)}${current.setCount === 1 ? "의 일반 세트를" : "의 전체 일반 세트 구성을"} 서로 다른 ${observationDays}일에 반복했어요. ${current.setCount === 1 ? "이 반복이 익숙한 출발 기준으로 자리 잡았어요." : "뒤 세트까지 유지한 작업 기준이 생겼어요."}${chosen.rir === 0 ? " 한계에 가까웠던 구간은 이번 수행을 먼저 지켜요." : " 이제 한 세트에서 작은 변화를 시험해 볼 수 있어요."}`;
      propose(50, stableAssessment,
        chosen.rir === 0 ? action("maintain-work", "유지해 온 전체 수행 지키기", `${describeWork(current)}를 잘 이어가는 것도 유용한 성과예요. 반복을 더 채우기보다 한계에 가까웠던 구간의 제어를 유지해요.`, current.source.setIds)
          : action("progression-option", "한 구간에서 작은 변화 시험", `${weightGoal ? `${goal === "lose" ? "감량 중에도" : "체중을 유지하면서도"} 회복과 세트 여유가 괜찮다면 운동 수행은 조금씩 발전시킬 수 있어요. 지금 구성을 유지하는 것도 선택이에요. ` : ""}${addReps ? `다음에는 ${describeLoad({ loadKg: chosen.loadKg, reps: [chosen.reps] })} 한 세트에서만 ${chosen.reps + 1}회를 시도해 보세요.` : `다음에는 ${describeWork(current)}를 제어하며 이어가고, 낮은 반복 구간이 안정적인지 먼저 봐요.`}${current.maxLoadKg !== null ? " 반복보다 부하를 높이는 쪽을 원하면 가능한 가장 작은 단계로 바꾸는 선택도 있어요. 반복과 부하를 동시에 높이지 않아요." : currentRow.loadRole === "assistance" ? " 반복보다 난도를 바꾸고 싶다면 보조를 조금 덜 받는 선택도 있어요. 반복과 난도를 동시에 높이지 않아요." : ""}${current.setCount > 1 ? " 나머지 세트는 이번 구성에 둬요." : ""}`, [chosen.id]));
      if (addReps) candidates.at(-1).primaryAction.proposal = { kind: "single-set-reps", setId: chosen.id,
        loadKg: chosen.loadKg, baseReps: chosen.reps, targetReps: chosen.reps + 1 };
      if (episode) {
        const stableCandidate = candidates.at(-1), dates = episode.baselineDates;
        const earlier = `${dates[0]}${dates.at(-1) === dates[0] ? "" : `~${dates.at(-1)}`}에 ${describeWork(episode.baseline)}를 유지했고`;
        const phase = `${episode.currentSince}부터 이번 ${describeWork(current)} 구성을 ${observationDays}일에 반복했어요`;
        const controlledTail = current.loads.every(load => load.setCount < 2 || load.reps.at(-1) >= load.reps[0] * 0.8)
          && !current.sets.some(set => set.rir === 0);
        const currentlyStrained = input.readiness?.strong === true;
        const rebuildingEstablished = observationDays >= 4 && episode.spanDays >= 14 && controlledTail && !currentlyStrained;
        const expandedEstablished = episode.spanDays >= 7 && controlledTail && !currentlyStrained;
        if (episode.kind === "returned") {
          stableCandidate.assessment = `${returnedContext} 이전에 이어낸 전체 작업을 다시 유지한 기록이에요.${chosen.rir === 0 ? " 한계로 남긴 구간은 더 밀지 않아요." : " 회복과 세트 여유가 괜찮다면 돌아온 구성에서 한 세트의 작은 변화를 선택해요."}`;
          stableCandidate.primaryAction.body = chosen.rir === 0
            ? `돌아온 ${describeWork(current)}를 다음에도 제어하며 이어가세요. 한계에 가까웠던 구간의 반복이나 부하를 더 밀지 않아요.`
            : `돌아온 ${describeWork(current)}를 다음에도 먼저 이어가세요. 몸 상태와 세트 여유가 괜찮으면 ${addReps ? `${describeLoad({ loadKg: chosen.loadKg, reps: [chosen.reps] })} 한 세트에서만 ${chosen.reps + 1}회를 시도해 보세요.` : "낮은 반복 구간을 잘 제어하는지 먼저 보고 한 가지 변화만 선택해요."}${current.maxLoadKg !== null ? " 반복 대신 부하를 바꾸고 싶다면 가능한 가장 작은 단계로 조절할 수도 있어요. 반복과 부하를 동시에 높이지 않아요." : currentRow.loadRole === "assistance" ? " 반복 대신 난도를 바꿀 때는 보조를 조금 덜 받는 선택도 있어요. 반복과 난도를 동시에 높이지 않아요." : ""}${current.setCount > 1 ? " 나머지 세트는 돌아온 구성에 둬요." : ""}`;
        } else if (episode.kind === "reduced" && !rebuildingEstablished) {
          propose(83, `${earlier}, ${phase}. 최근 구성을 반복해 왔지만, 이전에 이어냈던 전체 구성보다 줄어든 부분도 함께 봐야 해요.`,
            action("review-recent-reduction", "최근 줄어든 구성을 평소 기준과 함께 맞추기", `다음에는 가볍게 준비한 뒤 이번 ${describeWork(current)}에서 시작하세요. 줄여서 하는 목적이면 이번 구성을 지키고, 평소 수행을 되찾는 중이라면 줄었던 구간 전에 충분히 쉬며 동작과 뒤 세트 반응부터 보세요. ${describeWork(episode.baseline)}를 한 번에 다시 채우지 않고, 한 세트의 반복이나 빠졌던 세트 하나 중 한 가지만 단계적으로 되찾아요.`, current.source.setIds));
        } else if (["expanded", "redistributed"].includes(episode.kind) && !expandedEstablished) {
          const difference = episode.kind === "redistributed" ? "중량을 낮추고 세트를 늘린 부담 배분을" : `일반 세트를 ${episode.baseline.setCount}개에서 ${current.setCount}개로 늘린 변화를`;
          propose(82, `${earlier}, ${phase}. ${difference} 최근 ${episode.spanDays}일 동안 재현한 것이니, 세 번 같았다는 이유로 바로 추가 부담까지 겹치기보다 늘린 뒤 세트와 회복을 함께 확인해요.`,
            action("consolidate-recent-expansion", "최근 늘린 전체 구성을 먼저 편하게 만들기", `다음에도 ${describeWork(current)}를 이번 세트 수로 이어가세요. 마지막 세트의 동작과 반복이 유지되는지 보고, 운동 뒤와 다음 날 평소처럼 회복되는지 확인해요. 버거우면 늘린 세트부터 줄이고, 익숙하고 편한 구성이 이어진 뒤 한 세트에서만 작은 변화를 선택해요. 지금은 세트와 중량·반복을 함께 더 얹지 않아요.`, current.source.setIds));
        } else {
          stableCandidate.assessment = `${earlier}, ${phase}. ${episode.kind === "raised-load" ? `새로 높인 부하를 ${current.setCount > 1 ? "뒤 세트까지" : "이번 반복으로"} 이어낸 기록이에요. ` : episode.kind === "reduced" ? "예전 구성과 차이는 남아 있지만, 낮춘 구성을 충분한 기간 반복하면서 뒤 수행까지 유지한 현재 기준에서 차근차근 되찾을 수 있어요. " : episode.kind === "reconfigured" ? "중량과 반복의 배분을 바꿔 유지한 구성이니 예전 세트와 우열을 정하기보다 이번 각 구간에서 이어가요. " : "늘린 전체 구성을 여러 날에 걸쳐 뒤 세트까지 유지한 현재 기준이 생겼어요. "}${chosen.rir === 0 ? "한계로 남긴 구간은 더 밀지 않아요." : episode.kind === "reduced" ? "회복과 여유가 괜찮다면 한 세트의 작은 변화를 선택하고, 이전 구성과 차이를 한 번에 메우지는 않아요." : episode.kind === "raised-load" ? "회복과 여유가 괜찮다면 한 세트의 작은 변화를 선택해요. 높여 온 부하에서 반복·세트까지 한꺼번에 더하지는 않아요." : "회복과 여유가 괜찮다면 한 세트의 작은 변화를 선택해요. 이미 바꾼 구성에 추가 변화를 한꺼번에 겹치지는 않아요."}`;
        }
      } else {
        const priorStages = stages.slice(0, -1), layout = current.sets.map(set => set.loadKg);
        const referenceIndex = priorStages.findLastIndex(stage => {
          const before = stage.values.at(-1).fact;
          return stage.values.length >= 2 && before.setCount === current.setCount
            && equal(before.sets.map(set => set.loadKg), layout)
            && before.sets[0].reps === current.sets[0].reps
            && current.sets.some((set, index) => index > 0 && set.reps < before.sets[index].reps);
        });
        if (referenceIndex >= 0) {
          const referenceStage = priorStages[referenceIndex], before = referenceStage.values.at(-1).fact;
          const lower = current.sets.map((set, index) => ({ set, index })).filter(({ set, index }) => index > 0 && set.reps < before.sets[index].reps);
          const recoverySet = lower.findLast(({ set }) => set.rir !== 0 && set.reps > 3 && set.reps < 100000)?.set;
          const dates = referenceStage.values.map(value => value.row.date), stableCandidate = candidates.at(-1);
          const contextFacts = [current, ...referenceStage.values.map(value => value.fact)];
          let progressionContext = "";
          if (referenceIndex >= 2) {
            const original = priorStages[referenceIndex - 2], repeated = priorStages[referenceIndex - 1];
            const originalWork = original.values.at(-1).fact, repeatedWork = repeated.values.at(-1).fact;
            if (original.values.length >= 2 && repeated.values.length >= 2 && originalWork.loads.length === 1
              && repeatedWork.loads.length === 1 && before.loads.length === 1 && originalWork.maxLoadKg !== null
              && originalWork.maxLoadKg === repeatedWork.maxLoadKg && before.maxLoadKg > repeatedWork.maxLoadKg
              && originalWork.setCount === repeatedWork.setCount && repeatedWork.setCount === before.setCount
              && repeatedWork.sets.every((set, index) => set.reps >= originalWork.sets[index].reps)
              && repeatedWork.totalReps > originalWork.totalReps) {
              progressionContext = `같은 ${originalWork.maxLoadKg}kg에서 반복을 더 이어간 뒤 ${before.maxLoadKg}kg으로 부하를 올렸던 흐름이에요. `;
              contextFacts.push(...original.values.map(value => value.fact), ...repeated.values.map(value => value.fact));
            }
          }
          signal("repeated-tail-below-recorded-work", { referenceDates: dates, previousReps: before.sets.map(set => set.reps),
            currentReps: current.sets.map(set => set.reps), lowerSetIds: lower.map(({ set }) => set.id),
            previousSetIds: lower.map(({ index }) => before.sets[index].id).filter(Boolean) }, refs(...contextFacts));
          stableCandidate.assessment = `${progressionContext}${dates[0]}${dates.at(-1) === dates[0] ? "" : `~${dates.at(-1)}`}에는 ${describeWork(before)}를 남겼어요. 이번 ${describeWork(current)}는 ${observationDays}일에 반복했고 앞 세트는 같지만, ${lower.map(({ set, index }) => `${before.sets[index].reps}회에서 ${set.reps}회로 바뀐 뒤 세트`).join(" · ")}가 있어요.`;
          if (recoverySet && chosen.rir !== 0) {
            stableCandidate.primaryAction = action("progression-option", "이전에 이어낸 뒤 반복부터 다시 확인", `${weightGoal ? "체중 목표와 별개로 회복과 여유가 괜찮다면 작은 수행 변화를 선택할 수 있어요. " : ""}앞 세트와 잘 이어간 구간은 이번 구성에 두고, ${describeLoad({ loadKg: recoverySet.loadKg, reps: [recoverySet.reps] })} 구간 전에 충분히 쉬어 보세요. 다음에는 이 세트에서만 ${recoverySet.reps + 1}회를 시도해 보세요. 자세와 움직임 범위가 유지되지 않으면 이번 ${recoverySet.reps}회에서 마쳐도 좋아요. 반복과 부하를 함께 더하지는 않아요.`, [recoverySet.id]);
            stableCandidate.primaryAction.proposal = { kind: "single-set-reps", setId: recoverySet.id,
              loadKg: recoverySet.loadKg, baseReps: recoverySet.reps, targetReps: recoverySet.reps + 1 };
          }
        }
      }
    } else if (recent.length >= 2 && recent.slice(-2).every(value => value.fact.sets[0]?.loadKg === current.sets[0].loadKg && value.fact.sets[0]?.reps === current.sets[0].reps)) {
      signal("stable-leading-only", { observationDays: 3, wholeWorkStable: false }, refs(current, ...recent.slice(-2).map(value => value.fact)));
    }
    if (!previousUsable && pacing.some(load => load.reps[0] - load.reps.at(-1) >= 2)) {
      const load = pacing.find(load => load.reps[0] - load.reps.at(-1) >= 2);
      propose(35, `${describeLoad(load)}까지 수행했고, ${load.loadKg === null ? "같은 조건에서" : `${load.loadKg}kg에서`} 뒤 반복은 앞보다 줄었어요. 첫 세트에 더 얹기보다 이번 뒤 세트까지 잘 마치는 구성을 먼저 잡으면 돼요.`,
        action("restore-tail", "처음 수행한 전체 구간부터 안정시키기", `다음에도 ${describeLoad(load)}부터 이어가세요. 세트 사이에 충분히 쉬고 마지막 ${load.reps.at(-1)}회를 제어하며 마치는지 보세요. 뒤 수행까지 잘 유지되면 그때 한 세트에서만 1회 더 시도해요.`, load.setIds));
    }
    return answer();
  }

  return Object.freeze({ interpret, isCoordinationMovement, coordinationExposure, plannedEffort });
});
