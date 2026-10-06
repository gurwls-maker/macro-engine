(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MacroTrainingCapacity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY = 86400000;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const regular = intent => intent === undefined || intent === null || intent === "unknown" || intent === "regular";
  const peakEligible = intent => regular(intent) || intent === "test";
  const id = value => typeof value === "string" && value.length ? value : null;

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = new Date(value + "T00:00:00Z").getTime();
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
  }

  function workingSet(set) {
    return set && typeof set === "object" && (set.marker === null || set.marker === undefined)
      && finite(set.loadKg) && set.loadKg > 0 && Number.isInteger(set.reps) && set.reps > 0;
  }

  function estimateSet(set, options = {}) {
    if (!workingSet(set) || set.reps > 10) return null;
    const knownRir = finite(set.rir) && set.rir >= 0 && set.rir <= 10;
    const rangeLimited = knownRir && set.reps + set.rir > 10;
    const effectiveReps = knownRir && !rangeLimited ? set.reps + set.rir : set.reps;
    const epleyKg = effectiveReps === 1 ? set.loadKg : set.loadKg * (1 + effectiveReps / 30);
    const brzyckiKg = effectiveReps === 1 ? set.loadKg : set.loadKg * 36 / (37 - effectiveReps);
    if (![epleyKg, brzyckiKg].every(finite)) return null;
    const feeling = ["comfortable", "hard", "limit"].includes(options?.feeling) ? options.feeling : null;
    return {
      minKg: Math.min(epleyKg, brzyckiKg), maxKg: Math.max(epleyKg, brzyckiKg),
      basis: "estimated-performance", rangeMeaning: "formula-spread",
      effortBasis: knownRir ? "reported-rir" : feeling === "limit" ? "near-limit" : feeling === "comfortable" ? "comfortable" : "record-only",
      effectiveReps, performedReps: set.reps, reportedRir: knownRir ? set.rir : null,
      rirApplied: knownRir && !rangeLimited, rangeLimited, feeling,
      formulas: { epleyKg, brzyckiKg }
    };
  }

  function normalizedSets(values) {
    const sets = [], identifiers = new Map(), conflicts = new Set();
    for (const set of Array.isArray(values) ? values : []) {
      if (!workingSet(set)) continue;
      const setId = id(set.id), value = { id: setId, loadKg: set.loadKg, reps: set.reps,
        rir: finite(set.rir) && set.rir >= 0 && set.rir <= 10 ? set.rir : null, marker: null };
      if (!setId) { sets.push(value); continue; }
      const signature = JSON.stringify(value);
      if (identifiers.has(setId)) {
        if (identifiers.get(setId) !== signature) conflicts.add(setId);
      } else { identifiers.set(setId, signature); sets.push(value); }
    }
    return sets.filter(set => !conflicts.has(set.id));
  }

  function bestPoint(sets, source, feedback) {
    let best = null;
    for (const set of sets) {
      const feeling = feedback?.setId === set.id && feedback.loadKg === set.loadKg && feedback.reps === set.reps ? feedback.feeling : null;
      const estimate = estimateSet(set, { feeling });
      if (!estimate) continue;
      const point = { ...estimate, setId: set.id, loadKg: set.loadKg, reps: set.reps, rir: set.rir,
        sessionId: id(source.sessionId), blockId: id(source.blockId), date: source.date || null,
        trainingIntent: source.trainingIntent || "unknown", pain: source.pain || null };
      if (!best || stronger(point, best)) best = point;
    }
    return best;
  }

  function stronger(a, b) {
    const difference = (a.minKg / 2 + a.maxKg / 2) - (b.minKg / 2 + b.maxKg / 2);
    return difference > 0 || difference === 0 && (a.date || "") > (b.date || "");
  }

  function expectedReps(estimate, loadKg) {
    if (!estimate || !finite(loadKg) || loadKg <= 0 || loadKg > estimate.maxKg) return null;
    const values = [estimate.minKg, estimate.maxKg].flatMap(value => [30 * (value / loadKg - 1), 37 - 36 * loadKg / value]);
    if (!values.every(finite) || Math.min(...values) > 10) return null;
    return { min: Math.max(1, Math.floor(Math.min(...values) + 1e-9)), max: Math.min(10, Math.max(1, Math.ceil(Math.max(...values) - 1e-9))),
      basis: "formula-inversion", rangeMeaning: "formula-spread", rangeLimited: Math.min(...values) < 1 || Math.max(...values) > 10 };
  }

  function compareHistory(currentSets, historySamples, options = {}) {
    options = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    const time = dateNumber(options.date), sets = normalizedSets(currentSets);
    const current = bestPoint(sets, { ...options, date: time === null ? null : options.date }, options.feedback);
    const samples = new Map(), conflicts = new Set(), byDate = new Map();
    const excluded = { ambiguousDays: [], conflictingSamples: 0 };
    // One source can be copied, but repeated blocks or parallel sessions on a date are not silently paired.
    for (const sample of Array.isArray(historySamples) ? historySamples : []) {
      const when = dateNumber(sample?.date), sessionId = id(sample?.sessionId), blockId = id(sample?.blockId);
      if (time === null || when === null || when >= time || !sessionId || !blockId) continue;
      const sampleSets = normalizedSets(sample.sets);
      if (!sampleSets.length) continue;
      const key = JSON.stringify([sessionId, blockId]);
      const normalized = { sessionId, blockId, date: sample.date, sets: sampleSets,
        trainingIntent: sample.trainingIntent || "unknown", pain: sample.pain || null,
        feedback: sample.feedback && typeof sample.feedback === "object" ? { setId: id(sample.feedback.setId),
          loadKg: sample.feedback.loadKg ?? null, reps: sample.feedback.reps ?? null, feeling: sample.feedback.feeling ?? null } : null };
      const signature = JSON.stringify(normalized);
      if (samples.has(key)) {
        if (samples.get(key).signature !== signature) conflicts.add(key);
      } else samples.set(key, { sample: normalized, signature });
    }
    excluded.conflictingSamples = conflicts.size;
    for (const [key, value] of samples) {
      if (conflicts.has(key)) continue;
      if (!byDate.has(value.sample.date)) byDate.set(value.sample.date, []);
      byDate.get(value.sample.date).push(value.sample);
    }
    const history = [];
    for (const [date, values] of byDate) {
      if (values.length !== 1) excluded.ambiguousDays.push(date);
      else if (peakEligible(values[0].trainingIntent)) history.push(values[0]);
    }
    history.sort((a, b) => a.date.localeCompare(b.date));
    excluded.ambiguousDays.sort();
    let previous = null, allTimeBest = current;
    for (const sample of history) {
      const point = bestPoint(sample.sets, sample, sample.feedback);
      if (!point) continue;
      if (!allTimeBest || stronger(point, allTimeBest)) allTimeBest = point;
      if (time - dateNumber(sample.date) <= 42 * DAY && (!previous || stronger(point, previous))) previous = point;
    }
    const sameLoad = current ? history.map(sample => ({ sample, sets: sample.sets.filter(set => set.loadKg === current.loadKg) })).filter(row => row.sets.length) : [];
    const lastSame = sameLoad.at(-1), bestSame = lastSame?.sets.reduce((best, set) => !best || set.reps > best.reps ? set : best, null);
    const sameLoadHistory = lastSame ? { date: lastSame.sample.date, daysAgo: Math.round((time - dateNumber(lastSame.sample.date)) / DAY),
      observationDays: sameLoad.length, totalObservationDays: sameLoad.length + (time === null ? 0 : 1), reps: bestSame.reps,
      sessionId: lastSame.sample.sessionId, blockId: lastSame.sample.blockId } : null;
    const leading = sets[0], trail = [];
    if (leading && regular(options.trainingIntent)) {
      for (const sample of history.filter(sample => regular(sample.trainingIntent) && time - dateNumber(sample.date) <= 42 * DAY).reverse()) {
        const first = sample.sets[0];
        if (first.loadKg !== leading.loadKg || first.reps !== leading.reps) break;
        trail.push(sample.date);
      }
    }
    const dates = time !== null && leading && regular(options.trainingIntent) ? [...trail.reverse(), options.date] : [];
    const stableWorking = { detected: dates.length >= 3, loadKg: leading?.loadKg ?? null, reps: leading?.reps ?? null,
      observationDays: dates.length, dates, basis: "repeated-working-standard" };
    return { current, previous, allTimeBest, sameLoadHistory, expectedRepsAtCurrentLoad: current ? expectedReps(previous, current.loadKg) : null,
      stableWorking, excluded };
  }

  return Object.freeze({ estimateSet, compareHistory });
});
