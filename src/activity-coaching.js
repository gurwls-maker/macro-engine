(function(root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./insights.js") : root.MacroInsights,
    node ? require("./storage.js") : root.MacroStorage);
  if (node) module.exports = api;
  if (root) root.MacroActivity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(I, S) {
  "use strict";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const names = { strength: "근력", running: "달리기", cycling: "자전거", swimming: "수영", team: "구기", mixed: "복합", walking: "걷기" };
  const purposeNames = { regular: "평소 운동", deload: "디로드", light: "가벼운 운동", technique: "기술 연습", "time-limited": "시간이 부족한 운동", return: "복귀", test: "테스트" };
  const formats = { continuous: "지속 운동", interval: "인터벌", technique: "기술 연습", practice: "훈련", match: "경기", race: "대회", hybrid: "복합 구간" };
  const environments = { usual: "평소 환경", outdoor: "실외", treadmill: "트레드밀", indoor: "실내", pool: "수영장", "open-water": "오픈워터", different: "다른 환경" };
  const conditions = { usual: "평소 조건", hot: "더운 날", cold: "추운 날", windy: "바람이 강한 날", hilly: "언덕이 있는 코스", different: "다른 조건" };
  const copy = value => JSON.parse(JSON.stringify(value));
  const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const elapsed = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  const clean = value => typeof value === "string" ? value.trim() : "";
  const distanceText = (meters, sport) => sport === "swimming" || meters < 1000 ? `${meters}m` : `${Number((meters / 1000).toFixed(6))}km`;
  const pace = row => row.sport === "running" && row.details?.format !== "interval" && finite(row.details?.distanceM) && row.details.distanceM > 0
    && (finite(row.details.movingMin) ? row.details.movingMin : row.durationMin) > 0
    ? (finite(row.details.movingMin) ? row.details.movingMin : row.durationMin) * 1000 / row.details.distanceM : null;
  const paceText = value => { const seconds = Math.round(value * 60); return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초/km`; };
  const swimPace = row => row.sport === "swimming" && row.details?.format !== "interval" && row.details?.distanceM > 0
    ? (finite(row.details.movingMin) ? row.details.movingMin : row.durationMin) * 100 / row.details.distanceM : null;
  const secondsText = value => `${Math.round(value * 60)}초/100m`;
  function workSignature(row) {
    const d = row.details || {};
    const segments = (d.segments || []).map(part => [part.label, part.kind || null, part.durationMin ?? null, part.distanceM ?? null, part.reps ?? null, part.loadKg ?? null]);
    if (!d.sequenceConfirmed) segments.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.stringify([row.durationMin, row.intensity, d.distanceM ?? null, d.movingMin ?? null, d.avgPowerW ?? null, row.cardio?.speedKmh ?? null,
      segments]);
  }
  function similarWork(a, b) {
    if (Math.abs(a.durationMin - b.durationMin) / Math.max(1, b.durationMin) > 0.08 || a.intensity !== b.intensity) return false;
    for (const key of ["distanceM", "movingMin", "avgPowerW"]) {
      const x = a.details?.[key], y = b.details?.[key];
      if (finite(x) !== finite(y) || finite(x) && Math.abs(x - y) / Math.max(1, y) > 0.05) return false;
    }
    const parts = row => (row.details?.segments || []).map(part => [part.label, part.kind || null, part.durationMin ?? null, part.distanceM ?? null, part.reps ?? null, part.loadKg ?? null]);
    const x = parts(a), y = parts(b);
    if (!a.details?.sequenceConfirmed || !b.details?.sequenceConfirmed) { x.sort(); y.sort(); }
    return JSON.stringify(x) === JSON.stringify(y);
  }
  function context(row) {
    const d = row.details || {};
    const segments = (d.segments || []).map(part => `${part.kind || ""}:${part.label}`);
    if (!d.sequenceConfirmed) segments.sort();
    return [row.sport, clean(d.label), d.format || "continuous", clean(d.routeKey), clean(d.equipmentKey), d.environment || "", d.conditions || "", clean(d.stroke), d.poolLengthM ?? null,
      finite(d.movingMin) ? "moving" : "elapsed", row.cardio?.environment || "", row.cardio?.gradePct ?? null, segments];
  }
  function contextConflict(row) { return row.details?.environment === "outdoor" && row.cardio?.environment === "treadmill"
    || row.details?.environment === "treadmill" && row.cardio?.environment === "outdoor"; }
  function comparable(a, b) { return !contextConflict(a) && !contextConflict(b) && JSON.stringify(context(a)) === JSON.stringify(context(b)); }
  function contextChangeText(before, row) {
    const a = before.details || {}, b = row.details || {}, changes = [];
    for (const [key, label, names] of [["label", "활동 이름", null], ["environment", "환경", environments], ["stroke", "영법", null], ["poolLengthM", "풀 길이", null],
      ["equipmentKey", "기구", null], ["format", "운동 형식", formats], ["routeKey", "코스", null], ["conditions", "기록 조건", conditions]]) {
      if ((a[key] ?? null) === (b[key] ?? null)) continue;
      const display = value => value == null || value === "" ? "미입력" : names?.[value] || `${value}${key === "poolLengthM" ? "m" : ""}`;
      changes.push(`${label} ${display(a[key])} → ${display(b[key])}`);
    }
    if (finite(a.movingMin) !== finite(b.movingMin)) changes.push(`시간 기준 ${finite(a.movingMin) ? "실제 활동시간 기록" : "전체시간 기록"} → ${finite(b.movingMin) ? "실제 활동시간 기록" : "전체시간 기록"}`);
    if ((before.cardio?.environment ?? null) !== (row.cardio?.environment ?? null)) changes.push(`유산소 환경 ${environments[before.cardio?.environment] || "미입력"} → ${environments[row.cardio?.environment] || "미입력"}`);
    if ((before.cardio?.gradePct ?? null) !== (row.cardio?.gradePct ?? null)) changes.push(`입력 경사 ${finite(before.cardio?.gradePct) ? `${fmt(before.cardio.gradePct)}%` : "미입력"} → ${finite(row.cardio?.gradePct) ? `${fmt(row.cardio.gradePct)}%` : "미입력"}`);
    const segmentKeys = d => (d.segments || []).map(part => [part.label, part.kind ?? null]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    if (JSON.stringify(segmentKeys(a)) !== JSON.stringify(segmentKeys(b))) changes.push(`기록한 구간 ${(a.segments || []).map(part => `${part.label}${part.kind ? `(${part.kind})` : ""}`).join(" · ") || "미입력"} → ${(b.segments || []).map(part => `${part.label}${part.kind ? `(${part.kind})` : ""}`).join(" · ") || "미입력"}`);
    if (a.sequenceConfirmed && b.sequenceConfirmed && JSON.stringify((a.segments || []).map(part => [part.label, part.kind]))
      !== JSON.stringify((b.segments || []).map(part => [part.label, part.kind]))) changes.push(`확인한 순서: 이전 [${(a.segments || []).map(part => part.label).join(" → ")}] / 이번 [${(b.segments || []).map(part => part.label).join(" → ")}]`);
    return changes.join(" · ");
  }
  function segmentChangeText(before, row) {
    const previous = before.details?.segments || [], current = row.details?.segments || [], changes = [], seen = new Set();
    const fields = ["durationMin", "distanceM", "reps", "loadKg"], units = { durationMin: "분", distanceM: "m", reps: "회", loadKg: "kg" },
      labels = { durationMin: "시간", distanceM: "거리", reps: "반복", loadKg: "표시 부하" };
    const segmentText = part => fields.filter(key => finite(part[key])).map(key => `${part[key]}${units[key]}`).join(" · ") || "수치 미입력";
    for (const part of current) {
      const key = JSON.stringify([part.label, part.kind ?? null]);
      if (seen.has(key)) continue; seen.add(key);
      const older = previous.filter(other => other.label === part.label && other.kind === part.kind), newer = current.filter(other => other.label === part.label && other.kind === part.kind);
      if (!older.length) continue;
      if (older.length !== 1 || newer.length !== 1) {
        if (JSON.stringify(older.map(segmentText).sort()) !== JSON.stringify(newer.map(segmentText).sort())) changes.push(`${part.label}: 같은 이름의 구간이 여러 개예요. 이전 기록(${older.map(segmentText).join(" / ")})과 이번 기록(${newer.map(segmentText).join(" / ")})은 각각 보존하고 구간끼리 임의로 짝짓지 않아요`);
      } else {
        const delta = fields.filter(field => (finite(older[0][field]) || finite(part[field])) && older[0][field] !== part[field])
          .map(field => `${labels[field]} ${finite(older[0][field]) ? `${older[0][field]}${units[field]}` : "미입력"} → ${finite(part[field]) ? `${part[field]}${units[field]}` : "미입력"}`);
        if (delta.length) changes.push(`${part.label}: ${delta.join(" · ")}`);
      }
    }
    return changes.join(". ");
  }
  function ordinaryReference(row) { return !["deload", "light", "technique", "time-limited", "return", "test"].includes(row.details?.intent)
    && row.details?.format !== "technique" && !["active", "recovering", "conflicting"].includes(row.checkin?.illness) && !["mild", "stop", "conflicting"].includes(row.checkin?.pain); }
  function actual(row) {
    const d = row.details || {};
    return { durationMin: row.durationMin, intensity: row.intensity, distanceM: finite(d.distanceM) ? d.distanceM : null,
      movingMin: finite(d.movingMin) ? d.movingMin : null, effortRpe: finite(d.effortRpe) ? d.effortRpe : null,
      avgHeartRateBpm: finite(d.avgHeartRateBpm) ? d.avgHeartRateBpm : null, avgPowerW: finite(d.avgPowerW) ? d.avgPowerW : null,
      paceMinPerKm: pace(row), paceMinPer100M: swimPace(row), details: copy(d), cardio: row.cardio ? copy(row.cardio) : null, basis: "record-observation" };
  }
  function workText(row) {
    const d = row.details || {};
    const bits = [`${fmt(row.durationMin)}분`];
    if (finite(d.distanceM)) bits.push(distanceText(d.distanceM, row.sport));
    if (finite(d.movingMin) && d.movingMin !== row.durationMin) bits.push(`실제 활동 ${fmt(d.movingMin)}분`);
    if (finite(d.avgPowerW)) bits.push(`평균 ${fmt(d.avgPowerW)}W`);
    if (finite(d.effortRpe)) bits.push(`느낌 강도 ${fmt(d.effortRpe)}/10`);
    return bits.join(" · ");
  }
  function sportNext(row, previous, repeated) {
    const d = row.details || {}, label = clean(d.label) || names[row.sport];
    const familiar = `이번 기록(${workText(row)})`;
    const distance = finite(d.distanceM) && d.distanceM > 0 ? distanceText(d.distanceM, row.sport) : `${fmt(row.durationMin)}분`;
    const progression = repeated;
    if (d.format === "race" || d.format === "match") return { kind: "post-event", title: "경기 뒤에는 회복 운동으로 이어가기",
      body: `이번 ${label} 기록(${workText(row)})은 경기·대회 기록이에요. 다음 일반 훈련은 경기 강도를 다시 재현하기보다 익숙한 쉬운 운동으로 상태를 확인해요. 평소 움직임이 편해지고 회복되면 원래 훈련 구성으로 돌아가 보세요.` };
    if (d.format === "technique" || d.intent === "technique") return { kind: "technique", title: "연습한 기술을 이어가기", body: `이번 ${workText(row)}에서는 속도·총량보다 연습 동작을 다시 재현하는 과제로 이어가요. 다음에도 익숙한 시간 안에서 기술을 먼저 확인하고, 흐트러지면 쉬어가요.` };
    switch (row.sport) {
      case "running": return { kind: progression ? "one-variable-option" : "repeat", title: progression ? "거리와 속도 중 한 가지로 변화 주기" : "이번 달리기에서 다음 출발점 잡기",
        body: progression ? `${distance} 기록이 여러 날 비슷하게 이어졌어요. 이제 익숙하고 여유롭다면 다음에는 거리 또는 빠른 구간 중 하나만 조금 늘려 보세요. 전체 거리를 늘리는 날에는 평소 페이스를 지키고, 속도를 시험하는 날에는 거리를 함께 늘리지 않아요.`
          : `${familiar}을 출발점으로 잡고, 다음에도 처음부터 속도를 밀기보다 편한 시작 구간에서 호흡과 다리 반응을 보세요.${d.format === "interval" ? " 빠른 구간과 회복 구간의 구성을 먼저 유지하고, 뒤 구간까지 자세가 유지되는지 확인해요." : " 이번 거리가 편했다면 다음에도 같은 거리에서 마무리까지 호흡과 자세를 유지해 보세요."}` };
      case "cycling": return { kind: progression ? "one-variable-option" : "repeat", title: progression ? "시간과 힘 중 한 가지로 변화 주기" : "같은 코스·기구에서 다음 라이딩 이어가기",
        body: `${familiar}을 다음 출발점으로 삼아 보세요.${finite(d.avgPowerW) ? " 같은 파워 측정 기구에서 시간과 느낌 강도를 함께 보고, 평균 파워만 올리려고 끝까지 무리하지 않아요." : " 바람·경사가 달라지면 속도를 쫓기보다 평소 호흡과 페달링으로 이어가요."}${progression ? " 익숙하고 여유롭다면 시간 또는 힘을 주는 구간 중 한 가지만 늘려 보세요." : " 처음부터 세게 밟지 말고 마무리까지 일정하게 페달링해요."}` };
      case "swimming": return { kind: progression ? "one-variable-option" : "repeat", title: progression ? "같은 영법에서 한 가지 과제만 늘리기" : "영법과 뒤 구간의 자세 이어가기",
        body: `${familiar}을 출발점으로 같은 영법·${d.environment === "open-water" ? "오픈워터 환경" : "풀 조건"}에서 이어가 보세요.${d.environment === "open-water" ? " 조류·시야·안전 확보를 우선하고 풀 페이스를 억지로 맞추지 않아요." : " 앞 구간보다 뒤 구간에서 호흡·자세가 흐트러지는지 먼저 살펴요."}${progression ? " 전체 거리 또는 빠르게 수영하는 구간 중 한 가지만 조금 늘리고 휴식 간격은 함께 줄이지 않아요." : " 다음에는 전체 거리를 먼저 늘리기보다 이번 구성을 안정적으로 마쳐 보세요."}` };
      case "team": return { kind: "practice", title: "경기와 연습 부담을 나눠 이어가기",
        body: `${familiar}을 참고해 다음 연습은 기술 동작과 익숙한 움직임부터 확인해요. 실제 참여시간과 반복 전력질주가 많았던 날 뒤에는 추가 체력훈련을 몰아 넣지 말고, 다음 훈련에서 발·다리 움직임과 컨디션을 먼저 보세요.` };
      case "mixed": {
        const segments = d.segments || [], parts = segments.map(segment => segment.label).join(d.sequenceConfirmed ? " → " : " · ");
        return { kind: "hybrid", title: "구간 사이의 연결을 다음 과제로 잡기", body: `${familiar}을 다음 출발점으로 삼아 보세요.${segments.length ? ` 기록한 구간(${parts})은${d.sequenceConfirmed ? " 확인한 순서대로" : " 실제 순서를 확인한 뒤"} 앞 구간의 힘을 모두 쓰지 않고 뒤 구간까지 연결하는 과제로 이어가요.` : " 종목을 바꿔가며 한 운동은 전체 시간을 유지하면서 뒤 구간까지 동작을 안정적으로 이어가요."} 다음에는 전체 시간·달리기·기구 부하를 한꺼번에 올리지 말고 가장 버거웠던 구간 하나부터 조정해 보세요.` };
      }
      case "walking": return { kind: "repeat", title: "편하게 반복할 수 있는 걷기 이어가기", body: `이번 기록(${workText(row)})을 다음 출발점으로 삼아 보세요. 다음에도 대화할 수 있는 익숙한 속도로 걷고, 편하다면 시간이나 경사 중 한 가지만 조금 늘려요. 통증이 생기면 걸음과 경사를 줄이거나 쉬어가요.` };
      default: return { kind: "time-record", title: "실제 세트와 시간 기록 함께 이어가기", body: `근력 운동 ${fmt(row.durationMin)}분을 남겼어요. 다음에는 연습 세트로 상태를 확인한 뒤 익숙한 동작부터 이어가요. ${row.hasSetDiary ? "같은 날짜의 세트 일지가 있으니 중량·반복은 그 실제 수행에서 이어가고" : "시간만으로 중량·반복을 정하지 않고 익숙한 동작부터 이어가며"}, 시간만 늘리려고 세트를 더하지 않아요.` };
    }
  }
  function build(state, date) {
    if (!S.isValidDate(date)) throw new Error("활동 코칭 기준 날짜를 확인해 주세요.");
    const days = Object.values(state?.days || {}).filter(day => S.isValidDate(day?.date) && day.date <= date).sort((a, b) => a.date.localeCompare(b.date));
    const records = Array.isArray(state?.training?.records) ? state.training.records : [];
    const reportedHealth = I.reportedHealthHistory(state?.days, date, records);
    const healthRecords = new Map(), conflictingHealthIds = new Set(), recordsByDate = new Map();
    for (const record of records) {
      if (!S.isValidDate(record?.date) || record.date > date || typeof record.id !== "string" || !record.id
        || !["none", "mild", "stop"].includes(record.pain)) continue;
      const prior = healthRecords.get(record.id);
      if (prior && (prior.date !== record.date || prior.pain !== record.pain)) conflictingHealthIds.add(record.id);
      else healthRecords.set(record.id, record);
    }
    for (const [id, record] of healthRecords) if (!conflictingHealthIds.has(id)) {
      if (!recordsByDate.has(record.date)) recordsByDate.set(record.date, []);
      recordsByDate.get(record.date).push(record);
    }
    const healthSources = (field, report) => report.sources?.length
      ? report.sources.map(source => ({ ...source, field })) : [{ kind: "health-checkin", date: report.date, field }];
    const dayCheckin = day => {
      const checkin = copy(day?.coachCheckin || {});
      const reports = I.reportedHealthHistory({ [day.date]: day }, day.date, recordsByDate.get(day.date) || []);
      for (const [field, report] of Object.entries(reports.fields)) checkin[field] = report.status;
      return checkin;
    };
    const dayCheckins = new Map(days.map(day => [day.date, dayCheckin(day)]));
    const all = days.flatMap(day => (day.sessions || []).filter(row => row && names[row.sport] && finite(row.durationMin) && row.durationMin > 0)
      .map(row => ({ ...copy(row), date: day.date, checkin: dayCheckins.get(day.date) })));
    const currentDay = days.find(day => day.date === date), checkin = copy(currentDay?.coachCheckin || {});
    for (const [field, report] of Object.entries(reportedHealth.fields)) if (report.date === date) checkin[field] = report.status;
    const unresolvedHealth = Object.entries(reportedHealth.fields).filter(([, report]) => report.status !== "none"
      && (report.date < date || report.status === "conflicting")).map(([field, report]) => ({ ...report, field, value: report.status }));
    const currentRows = all.filter(row => row.date === date);
    const sourceRows = currentRows.length ? currentRows : all.filter(row => row.date === all.at(-1)?.date);
    const linked = I.coachingConnections(state || {}, date);
    const clinical = !!state?.profile && (["pregnancy", "breastfeeding", "clinical", "eating_disorder"].includes(state.profile.healthContext)
      || finite(state.profile.age) && (state.profile.age < 18 || state.profile.age > 80));
    const rows = sourceRows.map(row => {
      row.hasSetDiary = row.sport === "strength" && (state?.training?.records || []).some(record => record.date === row.date
        && record.exercises?.some(exercise => exercise.sets?.some(set => set.marker === null && set.reps > 0)));
      const past = all.filter(prior => prior.date < row.date && prior.sport === row.sport);
      const same = past.filter(prior => comparable(prior, row) && ordinaryReference(prior));
      const lastSameDate = same.at(-1)?.date, sameDateRows = same.filter(prior => prior.date === lastSameDate);
      const lastSportDate = past.at(-1)?.date || null, lastSportRows = past.filter(prior => prior.date === lastSportDate);
      const previous = sameDateRows.length === 1 ? sameDateRows[0] : null, previousSport = lastSportRows.length === 1 ? lastSportRows[0] : null, d = row.details || {};
      const intent = d.intent || "unknown", ordinaryIntent = ["unknown", "regular"].includes(intent) && d.format !== "technique", label = clean(d.label) || names[row.sport];
      const similar = same.filter(prior => elapsed(prior.date, row.date) <= 42 && similarWork(prior, row));
      const distinctSimilar = new Set(similar.map(prior => prior.date));
      const repeated = !!previous && distinctSimilar.size >= 2 && elapsed(similar[0].date, row.date) >= 14;
      const established = same.filter(prior => elapsed(prior.date, row.date) <= 42 &&
        same.some(other => other.date !== prior.date && elapsed(other.date, row.date) <= 42 && other.intensity === prior.intensity
          && Math.abs(other.durationMin - prior.durationMin) / prior.durationMin <= 0.08));
      const higherBaseline = established.filter(prior => prior.durationMin >= row.durationMin / 0.6).at(-1) || null;
      const lowerBaseline = established.filter(prior => prior.durationMin <= row.durationMin / 1.4).at(-1) || null;
      const initialAction = sportNext(row, previous, repeated);
      let action = initialAction, question = null, historicalHealthBody = "";
      const alternatives = [], notes = [`${label} 기록: ${workText(row)}.`];
      const sources = [{ kind: "activity-session", date: row.date, sessionId: row.id },
        ...Object.entries(reportedHealth.fields).filter(([, report]) => report.date === date
          && (report.status !== "none" || report.sources?.length)).flatMap(([field, report]) => healthSources(field, report))];
      const observations = [];
      const recentPast = past.filter(prior => elapsed(prior.date, row.date) <= 42);
      const sameRecent = same.filter(prior => elapsed(prior.date, row.date) <= 42);
      // Count actual repeated work separately from ordinary-work reference eligibility.
      const purposeGroup = prior => prior.checkin?.illness === "conflicting" || prior.checkin?.pain === "conflicting" ? "conflicting-health"
        : ["active", "recovering"].includes(prior.checkin?.illness) ? `illness-${prior.checkin.illness}`
        : ["mild", "stop"].includes(prior.checkin?.pain) ? "pain" : ["regular", "unknown"].includes(prior.details?.intent || "unknown") ? "ordinary" : prior.details.intent;
      const allSameRecent = recentPast.filter(prior => comparable(prior, row));
      const lastBreak = allSameRecent.filter(prior => workSignature(prior) !== workSignature(row) || purposeGroup(prior) !== purposeGroup(row)).at(-1)?.date;
      const currentGroup = allSameRecent.filter(prior => (!lastBreak || prior.date > lastBreak) && workSignature(prior) === workSignature(row) && purposeGroup(prior) === purposeGroup(row));
      const currentGroupStart = currentGroup[0]?.date || row.date;
      const sameGroupDays = new Set([...currentGroup.map(prior => prior.date), row.date]).size;
      const priorStable = sameRecent.filter(prior => prior.date < currentGroupStart && sameRecent.some(other => other.date !== prior.date && other.date < currentGroupStart && workSignature(other) === workSignature(prior))).at(-1) || null;
      const sameDayWork = new Map();
      for (const prior of allSameRecent) {
        if (!sameDayWork.has(prior.date)) sameDayWork.set(prior.date, new Set());
        sameDayWork.get(prior.date).add(`${workSignature(prior)}:${purposeGroup(prior)}`);
      }
      const unambiguousDay = prior => sameDayWork.get(prior.date)?.size === 1;
      // A new health report changes comparison eligibility, not the performed work vector.
      const lastWorkChange = allSameRecent.filter(prior => workSignature(prior) !== workSignature(row)).at(-1)?.date;
      const returnedGroupStart = allSameRecent.find(prior => (!lastWorkChange || prior.date > lastWorkChange)
        && workSignature(prior) === workSignature(row))?.date || row.date;
      const returnMatches = sameRecent.filter(prior => lastWorkChange && prior.date < lastWorkChange && unambiguousDay(prior)
        && workSignature(prior) === workSignature(row));
      const returnReference = new Set(returnMatches.map(prior => prior.date)).size >= 2 ? returnMatches.at(-1) : null;
      const interruptedRows = returnReference ? allSameRecent.filter(prior => prior.date > returnReference.date && prior.date < returnedGroupStart
        && workSignature(prior) !== workSignature(row)) : [];
      const reducedInterruption = interruptedRows.filter(prior =>
        prior.durationMin < row.durationMin || finite(d.distanceM) && prior.details?.distanceM > 0 && prior.details.distanceM < d.distanceM);
      const expandedInterruption = interruptedRows.filter(prior => prior.durationMin > row.durationMin
        || finite(d.distanceM) && d.distanceM > 0 && prior.details?.distanceM > d.distanceM
        || (d.segments || []).some(part => {
          const originalMatches = d.segments.filter(other => other.label === part.label && other.kind === part.kind);
          const previousMatches = (prior.details?.segments || []).filter(other => other.label === part.label && other.kind === part.kind);
          return originalMatches.length === 1 && previousMatches.length === 1 && ["distanceM", "reps"].some(key =>
            finite(part[key]) && part[key] > 0 && finite(previousMatches[0][key]) && previousMatches[0][key] > part[key]);
        }));
      const interruption = [...new Map(interruptedRows.map(prior => [prior.id, prior])).values()];
      const evolvedInterruption = interruption.filter(prior => !reducedInterruption.includes(prior) && !expandedInterruption.includes(prior));
      const returningEstablished = !!returnReference && interruption.length > 0 && interruption.every(unambiguousDay);
      const differentContext = recentPast.filter(prior => !comparable(prior, row)).at(-1) || null;
      const contextStart = sameRecent[0]?.date || row.date;
      if (differentContext && (!previous || elapsed(differentContext.date, row.date) <= 14)) {
        const reused = sameRecent.some(prior => prior.date < differentContext.date);
        notes.push(`이번 코스·기구·구간 조건은 ${contextStart}부터 기록한 ${reused ? "기존 조건으로 다시 이어져요" : "조건이에요"}. 앞선 ${differentContext.date} ${workText(differentContext)}와는 조건을 나눠 ${reused ? "익숙한 구성에서의 수행" : "새 구성의 재현"}을 확인해요.`);
        const changed = contextChangeText(differentContext, row);
        if (changed) notes.push(`비교 조건이 달라졌어요: ${changed}.`);
        sources.push({ kind: "activity-session", date: differentContext.date, sessionId: differentContext.id });
      }
      if (priorStable && workSignature(priorStable) !== workSignature(row)) {
        notes.push(`${priorStable.date}까지 여러 날 이어진 ${workText(priorStable)}에서 바뀐 구성이 ${currentGroupStart}부터 ${sameGroupDays}일 기록됐어요.`);
        if (finite(row.cardio?.speedKmh) && finite(priorStable.cardio?.speedKmh) && row.cardio.speedKmh !== priorStable.cardio.speedKmh) {
          notes.push(`입력 속도는 ${fmt(priorStable.cardio.speedKmh)}km/h → ${fmt(row.cardio.speedKmh)}km/h로 바뀌었어요. 거리·활동시간 기록과 구분해 살펴요.`);
          observations.push({ kind: "recorded-speed", previousDate: priorStable.date, previousKmh: priorStable.cardio.speedKmh, currentKmh: row.cardio.speedKmh });
        }
        if (row.intensity !== priorStable.intensity) {
          const intensityNames = { easy: "쉬움", moderate: "보통", hard: "강함" };
          notes.push(`선택 강도도 ${intensityNames[priorStable.intensity] || "미확인"} → ${intensityNames[row.intensity] || "미확인"}으로 바뀌었어요.`);
        }
        const changedSegments = segmentChangeText(priorStable, row);
        if (changedSegments) notes.push(`그 구성과 비교한 구간 변화: ${changedSegments}.`);
        sources.push({ kind: "activity-session", date: priorStable.date, sessionId: priorStable.id });
        observations.push({ kind: "working-episode", baselineDate: priorStable.date, baseline: actual(priorStable), currentSince: currentGroupStart, currentDays: sameGroupDays });
      }
      if (previous) {
        sources.push({ kind: "activity-session", date: previous.date, sessionId: previous.id });
        notes.push(`기록에 남긴 같은 조건의 ${previous.date} ${workText(previous)}에서 이어져요.`);
        if (finite(row.cardio?.speedKmh) && finite(previous.cardio?.speedKmh) && row.cardio.speedKmh !== previous.cardio.speedKmh
          && (!priorStable || !finite(priorStable.cardio?.speedKmh) || priorStable.cardio.speedKmh === row.cardio.speedKmh)) {
          notes.push(`입력 속도는 ${fmt(previous.cardio.speedKmh)}km/h → ${fmt(row.cardio.speedKmh)}km/h로 바뀌었어요. 거리·활동시간 기록과 구분해 살펴요.`);
          observations.push({ kind: "recorded-speed", previousDate: previous.date, previousKmh: previous.cardio.speedKmh, currentKmh: row.cardio.speedKmh });
        }
        observations.push({ kind: "duration", previousDate: previous.date, previousMin: previous.durationMin, currentMin: row.durationMin });
        if (finite(d.distanceM) && finite(previous.details?.distanceM)) observations.push({ kind: "distance", previousDate: previous.date, previousM: previous.details.distanceM, currentM: d.distanceM });
        if (pace(row) !== null && pace(previous) !== null) {
          if (paceText(pace(previous)) !== paceText(pace(row))) notes.push(`기록한 거리와 ${finite(d.movingMin) ? "이동" : "전체"} 시간으로 본 평균 페이스는 ${paceText(pace(previous))} → ${paceText(pace(row))}예요.`);
          observations.push({ kind: "pace", previousDate: previous.date, previousMinPerKm: pace(previous), currentMinPerKm: pace(row), timing: finite(d.movingMin) ? "moving" : "elapsed", estimated: true });
        }
        if (row.sport === "cycling" && finite(d.avgPowerW) && finite(previous.details?.avgPowerW)) {
          if (d.avgPowerW !== previous.details.avgPowerW) notes.push(`기록된 평균 파워는 ${fmt(previous.details.avgPowerW)}W → ${fmt(d.avgPowerW)}W예요.`);
          observations.push({ kind: "power", previousDate: previous.date, previousW: previous.details.avgPowerW, currentW: d.avgPowerW });
        }
        if (swimPace(row) !== null && swimPace(previous) !== null) {
          if (secondsText(swimPace(previous)) !== secondsText(swimPace(row))) notes.push(`기록한 거리와 ${finite(d.movingMin) ? "이동" : "전체"} 시간에서 100m당 평균은 ${secondsText(swimPace(previous))} → ${secondsText(swimPace(row))}예요.`);
          observations.push({ kind: "swim-pace", previousDate: previous.date, previousMinPer100M: swimPace(previous), currentMinPer100M: swimPace(row), timing: finite(d.movingMin) ? "moving" : "elapsed", estimated: true });
        }
        for (const [key, unit, label] of [["effortRpe", "/10", "느낌 강도"], ["avgHeartRateBpm", "bpm", "평균 심박수"], ["movingMin", "분", "실제 활동시간"]]) if (finite(d[key]) && finite(previous.details?.[key])) {
          if (d[key] !== previous.details[key]) notes.push(`${label}: 이전 ${previous.details[key]}${unit}, 이번 ${d[key]}${unit} 기록이에요.`);
          observations.push({ kind: key, previousDate: previous.date, previous: previous.details[key], current: d[key], unit: key === "effortRpe" ? "RPE" : unit });
        }
      } else if (sameDateRows.length > 1) {
        notes.push(`${lastSameDate}에 같은 조건의 활동이 여러 개 있으니 그 세션들은 함께 보존하고, 이번 수행을 다음 시작 기준으로 이어가요.`);
        sources.push(...sameDateRows.map(prior => ({ kind: "activity-session", date: prior.date, sessionId: prior.id })));
      } else if (lastSportRows.length > 1) {
        notes.push(`마지막 ${lastSportDate}에는 이 종목의 활동을 여러 개 남겼어요. 각각의 조건은 보존하고 이번 ${workText(row)}에서 다음 출발점을 잡아요.`);
        sources.push(...lastSportRows.map(prior => ({ kind: "activity-session", date: prior.date, sessionId: prior.id })));
      } else if (previousSport) {
        notes.push(`이전 ${previousSport.date}의 ${names[row.sport]} 기록과 연결하되, 이번 코스·기구·형식에서는 이번 기록(${workText(row)})을 새 기준으로 잡아요.`);
        sources.push({ kind: "activity-session", date: previousSport.date, sessionId: previousSport.id });
      } else notes.push("이 종목의 첫 출발 기록으로 남겨요.");
      if (finite(row.cardio?.speedKmh) && row.cardio.speedKmh > 0 && finite(d.distanceM) && d.distanceM > 0) {
        const timing = finite(d.movingMin) ? d.movingMin : row.durationMin;
        const speedDistanceM = row.cardio.speedKmh * timing * 1000 / 60;
        if (Math.abs(speedDistanceM - d.distanceM) > Math.max(20, d.distanceM * 0.05)) {
          notes.push("입력 속도와 기록된 거리·활동시간이 같은 기준인지 확인해요. 기구 설정 속도인지, 일부 구간 속도인지에 따라 뜻이 달라지므로 그 값만으로 실제 향상이나 운동 강도를 판정하지 않아요.");
          observations.push({ kind: "speed-recording-basis", basis: "recording-consistency-check", recordedSpeedKmh: row.cardio.speedKmh,
            distanceM: d.distanceM, timingMin: timing, timing: finite(d.movingMin) ? "moving" : "elapsed" });
        }
      }
      const changedContext = previousSport && !comparable(previousSport, row);
      const oldWeekRows = all.filter(prior => prior.sport === row.sport && prior.date >= I.shiftDate(row.date, -13) && prior.date < I.shiftDate(row.date, -6));
      const oldMinutes = oldWeekRows.reduce((sum, prior) => sum + prior.durationMin, 0);
      const newMinutes = all.filter(prior => prior.sport === row.sport && prior.date >= I.shiftDate(row.date, -6) && prior.date <= row.date).reduce((sum, prior) => sum + prior.durationMin, 0);
      const weeklyComparable = oldWeekRows.length >= 2 && oldWeekRows.every(ordinaryReference);
      const dailyExpanded = !!previous && (row.durationMin >= previous.durationMin * 1.4 || finite(d.distanceM) && previous.details?.distanceM > 0 && d.distanceM >= previous.details.distanceM * 1.4);
      const referenceWeek = returningEstablished ? all.filter(prior => prior.sport === row.sport && prior.date >= I.shiftDate(returnReference.date, -6)
        && prior.date <= returnReference.date && ordinaryReference(prior)) : [];
      const baselineMinutes = returningEstablished ? referenceWeek.reduce((sum, prior) => sum + prior.durationMin, 0) : oldMinutes;
      const weeklyExpansion = (returningEstablished ? new Set(referenceWeek.map(prior => prior.date)).size >= 2 : weeklyComparable)
        && baselineMinutes > 0 && newMinutes >= baselineMinutes * 1.5 && newMinutes - baselineMinutes >= 30;
      const expanded = !row.hasSetDiary && (!returningEstablished && (dailyExpanded || lowerBaseline) && !repeated || weeklyExpansion);
      const completionReference = priorStable || higherBaseline || previous;
      const fasterDistanceCompletion = completionReference && finite(d.distanceM) && completionReference.details?.distanceM > 0
        && d.distanceM >= completionReference.details.distanceM * 0.95
        && (pace(row) !== null && pace(completionReference) !== null && pace(row) < pace(completionReference) * 0.9
          || swimPace(row) !== null && swimPace(completionReference) !== null && swimPace(row) < swimPace(completionReference) * 0.9
          || ["walking", "cycling"].includes(row.sport) && d.format !== "interval"
            && (finite(d.movingMin) ? d.movingMin : row.durationMin)
              < (finite(completionReference.details.movingMin) ? completionReference.details.movingMin : completionReference.durationMin) * 0.9);
      const reduced = !row.hasSetDiary && !fasterDistanceCompletion && (higherBaseline || previous && row.durationMin <= previous.durationMin * 0.6
        || previous && finite(d.distanceM) && previous.details?.distanceM > 0 && d.distanceM <= previous.details.distanceM * 0.6);
      const slower = previous && pace(row) !== null && pace(previous) !== null && pace(row) > pace(previous) * 1.12;
      const faster = previous && pace(row) !== null && pace(previous) !== null && pace(row) < pace(previous) * 0.9;
      const effortChanged = previous && finite(d.effortRpe) && finite(previous.details?.effortRpe) ? d.effortRpe - previous.details.effortRpe : null;
      const highEffort = finite(d.effortRpe) && d.effortRpe >= 8;
      const currentRecovery = checkin.energy === "low" || checkin.performance === "down" || checkin.fatigue === "high"
        || checkin.sleep === "poor" && (highEffort || checkin.energy === "low")
        || finite(checkin.sleepHours) && checkin.sleepHours < 6 && (highEffort || checkin.fatigue === "high");
      const effortRise = effortChanged !== null && effortChanged >= 2;
      const heartRise = previous && finite(d.avgHeartRateBpm) && finite(previous.details?.avgHeartRateBpm) && d.avgHeartRateBpm >= previous.details.avgHeartRateBpm * 1.1;
      if (reduced && ordinaryIntent) {
        const basis = higherBaseline || previous;
        if (higherBaseline && higherBaseline.id !== previous?.id) { sources.push({ kind: "activity-session", date: higherBaseline.date, sessionId: higherBaseline.id }); notes.push(`${higherBaseline.date}까지 반복한 ${fmt(higherBaseline.durationMin)}분 구성보다 짧은 기록이 이어지고 있어요.`); }
        const reductions = [];
        if (row.durationMin < basis.durationMin) reductions.push(`전체 시간 ${fmt(basis.durationMin)}분 → ${fmt(row.durationMin)}분`);
        if (finite(d.distanceM) && finite(basis.details?.distanceM) && d.distanceM < basis.details.distanceM) reductions.push(`거리 ${distanceText(basis.details.distanceM, row.sport)} → ${distanceText(d.distanceM, row.sport)}`);
        if (finite(d.movingMin) && finite(basis.details?.movingMin) && d.movingMin < basis.details.movingMin) reductions.push(`실제 활동시간 ${fmt(basis.details.movingMin)}분 → ${fmt(d.movingMin)}분`);
        if (reductions.length) notes.push(`기록된 ${reductions.join(" · ")}으로 바뀌었어요.`);
        action = { kind: "reduced-work", title: "낮춘 부담에서 다음 선택 정하기", body: intent === "regular"
          ? `평소처럼 했지만 이번 기록(${workText(row)})은 ${basis.date}의 익숙한 구성(${workText(basis)})보다 줄어들었어요. 다음에는 줄인 양을 한꺼번에 메우기보다 이번 부담을 편하게 마칠 수 있는지 먼저 확인해요. 평소보다 버겁지 않고 운동 후·다음날 반응도 괜찮으면 익숙한 구성으로 한 가지씩 돌아가 보세요.`
          : `이번 기록(${workText(row)})은 ${basis.date}의 익숙한 구성(${workText(basis)})보다 줄어들었어요. 다음 운동은 줄인 부분을 한꺼번에 메우지 말고 이번 부담부터 편하게 마치는 과제로 잡아요. 의도한 가벼운 날이었다면 그 목적을 이어가고, 평소처럼 하려다 짧아졌다면 상태를 확인한 뒤 익숙한 구성으로 한 가지씩 돌아가요.` };
        question = intent === "unknown" ? { kind: "session-purpose", topic: "intent", body: "이 기록은 디로드·가벼운 운동으로 줄인 날인가요, 평소처럼 했는데 짧아진 건가요?", options: [{ value: "deload", label: "디로드" }, { value: "light", label: "가볍게·연습" }, { value: "time-limited", label: "시간 부족" }, { value: "regular", label: "평소처럼" }] }
          : { kind: "effort-context", body: "평소처럼 한 날로 남겼어요. 시간 때문이었나요, 평소보다 힘들었나요?", options: ["시간 때문", "평소보다 힘들었음"] };
      } else if (slower && ordinaryIntent) {
        action = { kind: "pace-review", title: "속도보다 이번 거리의 호흡·자세부터", body: `같은 기록 조건에서 이번 평균 페이스가 느려졌어요.${effortChanged !== null && effortChanged > 0 ? " 느낌 강도도 더 높아졌으니" : " 다음에는 기록을 만회하려고 몰아붙이기보다"} 익숙한 거리·편한 속도로 시작해 마무리까지 자세와 호흡을 확인해 보세요.` };
        question = { kind: "effort-context", body: "천천히 한 날이었나요, 아니면 평소보다 힘들었나요?", options: ["의도적으로 천천히", "평소보다 힘들었음"] };
      } else if (faster) {
        action = { kind: "confirm-improvement", title: "좋았던 수행을 다시 재현하기", body: `이번 평균 페이스가 빨라졌어요.${effortChanged !== null && effortChanged > 0 ? " 느낌 강도도 높아진 시도였으니" : " 다음에는"} 거리를 함께 늘리기보다 비슷한 조건에서 이번 거리의 호흡과 자세를 끝까지 유지해 보세요. 코스·휴식·측정 방식이 바뀌었다면 그 조건의 새 출발점으로 이어가요.` };
      }
      const reducedWorkAction = action.kind === "reduced-work" ? action : null;
      if (previous && ordinaryIntent && row.sport === "swimming" && swimPace(row) !== null && swimPace(previous) !== null) {
        if (swimPace(row) > swimPace(previous) * 1.12) action = { kind: "swim-control", title: "다음에는 뒤 구간의 호흡·자세부터", body: `같은 영법·측정 조건의 기록에서 100m당 시간이 더 길어졌어요. 다음에는 거리를 만회하기보다 이번 거리에서 호흡과 자세가 흐트러지는 구간을 확인하고 쉬어가요. 쉬는 시간이 길어졌거나 기술 연습이었다면 그 구성에 맞춰 이어가요.` };
        else if (swimPace(row) < swimPace(previous) * 0.9) action = { kind: "confirm-swim-performance", title: "좋았던 수영 구성을 다시 이어가기", body: `같은 영법·측정 조건에서 100m당 기록 시간이 짧아졌어요. 다음에는 거리와 휴식 부담까지 함께 올리지 않고 이번 구성을 다시 안정적으로 마쳐 보세요. 도구·휴식이나 전체 기록 방식이 달라졌다면 그 조건부터 맞춰 확인해요.` };
      }
      if (previous && ordinaryIntent && row.sport === "cycling" && finite(d.avgPowerW) && previous.details?.avgPowerW > 0 && d.avgPowerW >= previous.details.avgPowerW * 1.15) {
        action = { kind: "confirm-power", title: "높아진 파워를 끝까지 유지해 보기", body: `기록된 평균 파워가 높아졌어요. 같은 측정 기구·코스가 맞다면 다음에는 시간까지 함께 늘리지 않고 마무리까지 일정하게 페달링해 보세요. 기구나 보정이 바뀌었다면 이번 값에서 그 기구의 출발점으로 이어가요.` };
      }
      if (priorStable && ordinaryIntent && ["repeat", "one-variable-option"].includes(action.kind)) {
        const oldPace = pace(priorStable), newPace = pace(row), oldSwim = swimPace(priorStable), newSwim = swimPace(row);
        if ((oldPace !== null && newPace !== null && newPace < oldPace * 0.92 || oldSwim !== null && newSwim !== null && newSwim < oldSwim * 0.9)
          && d.distanceM >= priorStable.details.distanceM * 0.95
          || row.sport === "cycling" && finite(d.avgPowerW) && priorStable.details?.avgPowerW > 0 && d.avgPowerW >= priorStable.details.avgPowerW * 1.15
            && row.durationMin >= priorStable.durationMin * 0.95) {
          action = { kind: "sustain-new-performance", title: "좋아진 구성을 안정적으로 이어가기", body: `${priorStable.date}의 익숙한 구성보다 좋아진 수행을 ${sameGroupDays}일 남겼어요. 다음에는 이번 기록(${workText(row)})을 안정적으로 마치고 운동 후·다음날 반응을 확인해 보세요. 안정적으로 편해지면 거리·시간·빠른 구간 중 하나만 다음 과제로 선택해요.` };
        }
      }
      const speedReference = priorStable || previous;
      const rateLabel = row.sport === "cycling" ? "평균 파워" : "평균 페이스";
      const rateChange = row.sport === "cycling" ? "높아진" : "빨라진";
      const shorterFaster = speedReference && (finite(d.distanceM) && speedReference.details?.distanceM > 0 && d.distanceM < speedReference.details.distanceM * 0.9
        && (pace(row) !== null && pace(speedReference) !== null && pace(row) < pace(speedReference) * 0.92
          || swimPace(row) !== null && swimPace(speedReference) !== null && swimPace(row) < swimPace(speedReference) * 0.9)
        || row.sport === "cycling" && row.durationMin < speedReference.durationMin * 0.9 && finite(d.avgPowerW)
          && speedReference.details?.avgPowerW > 0 && d.avgPowerW >= speedReference.details.avgPowerW * 1.15);
      if (shorterFaster && ordinaryIntent && !["race", "match"].includes(d.format)) {
        notes.push(`짧게 마친 구성에서 ${rateLabel}는 ${row.sport === "cycling" ? "높아졌어요" : "빨라졌어요"}. 평소 전체 구성을 더 잘 마쳤다는 변화와는 나눠 봐요.`);
        if (reducedWorkAction) action = { ...reducedWorkAction,
          body: `${reducedWorkAction.body} 짧아진 구성에서 ${rateChange} ${rateLabel}는 별도 과제예요. 의도한 짧고 강한 훈련이었다면 이번 구성을 재현하되, 원래 시간·거리로 돌아가는 날에는 ${row.sport === "cycling" ? "파워까지 함께 높이지" : "페이스까지 더 빠르게 만들지"} 않아요.` };
        else action = { kind: "shorter-faster-work", title: `짧은 구성과 ${rateChange} ${rateLabel} 나눠 이어가기`,
          body: `이번 기록(${workText(row)})은 ${speedReference.date}의 구성(${workText(speedReference)})보다 짧아진 상태에서 ${rateLabel}가 ${row.sport === "cycling" ? "높아진" : "빨라진"} 시도예요. 다음에도 이번 구성을 끝까지 편하게 마치는지 먼저 확인해요. 의도한 짧고 강한 훈련이라면 그 과제를 이어가고, 평소 전체 구성을 하려다 짧아진 거라면 익숙한 강도부터 시작해 원래 거리·시간으로 돌아가 보세요. ${row.sport === "cycling" ? "파워를 높이면서" : "페이스를 빠르게 만들면서"} 총량까지 한꺼번에 늘리지는 않아요.` };
      }
      if (returningEstablished && ordinaryIntent && !["race", "match"].includes(d.format)) {
        sources.push(...returnMatches.map(prior => ({ kind: "activity-session", date: prior.date, sessionId: prior.id })),
          ...interruption.map(prior => ({ kind: "activity-session", date: prior.date, sessionId: prior.id })));
        notes.push(`${returnReference.date}까지 여러 날 했던 구성(${workText(returnReference)})으로 다시 이어진 기록이에요.`);
        observations.push({ kind: "established-work-return", referenceDate: returnReference.date, reference: actual(returnReference),
          referenceDates: [...new Set(returnMatches.map(prior => prior.date))],
          reducedDates: [...new Set(reducedInterruption.map(prior => prior.date))], expandedDates: [...new Set(expandedInterruption.map(prior => prior.date))],
          evolvedDates: [...new Set(evolvedInterruption.map(prior => prior.date))] });
        const interruptionText = evolvedInterruption.length ? expandedInterruption.length && reducedInterruption.length ? "최근 양과 수행 조건을 달리했던 기간 뒤에"
          : expandedInterruption.length ? "최근 시간·거리나 구간 과제를 늘리고 수행 조건도 바꿨던 기록 뒤에"
            : reducedInterruption.length ? "최근 짧게 마치거나 수행 조건을 바꿨던 기록 뒤에" : "최근 수행 구성이나 목적을 달리했던 기록 뒤에"
          : expandedInterruption.length ? reducedInterruption.length ? "최근 구성이 줄거나 늘어난 기간 뒤에"
            : "최근 시간·거리나 구간 과제가 늘었던 기록 뒤에" : "최근 짧게 마친 기간 뒤에";
        const returnedParts = (d.segments || []).filter(part => interruption.some(prior => {
          const matches = (prior.details?.segments || []).filter(other => other.label === part.label && other.kind === part.kind);
          return matches.length === 1 && ["durationMin", "distanceM", "reps", "loadKg"].some(key =>
            finite(part[key]) && finite(matches[0][key]) && part[key] !== matches[0][key]);
        }));
        const returnedTasks = returnedParts.map(part => `${part.label} ${["durationMin", "distanceM", "reps", "loadKg"]
          .filter(key => finite(part[key])).map(key => `${fmt(part[key])}${{ durationMin: "분", distanceM: "m", reps: "회", loadKg: "kg" }[key]}`).join(" · ")}`);
        const taskText = returnedTasks.length ? ` 구간 과제도 ${returnedTasks.join(" / ")}로 다시 이어가요.` : "";
        question = null;
        if (!row.hasSetDiary) action = { kind: "return-established-work", title: "원래 익숙한 구성으로 돌아온 흐름 이어가기",
          body: `${interruptionText}, 전에 여러 날 했던 구성(${workText(row)})을 다시 남겼어요.${taskText} 바로 더 늘리기보다 마무리까지 편하게 운동하고 이후·다음날 반응을 확인해요. 익숙해진 뒤에 시간·거리·강도 중 하나를 다음 과제로 선택해 보세요.` };
      }
      if (expanded && ordinaryIntent && !["race", "match"].includes(d.format)) {
        const basis = returningEstablished ? returnReference : lowerBaseline || previous;
        if (lowerBaseline && lowerBaseline.id !== previous?.id) sources.push({ kind: "activity-session", date: lowerBaseline.date, sessionId: lowerBaseline.id });
        alternatives.length = 0;
        action = { kind: "consolidate-volume", title: "늘린 부담에 적응한 뒤 다음 변화 주기", body: `이번에는 시간·거리 또는 최근 기록된 운동시간이 크게 늘었어요. 다음에 더 늘리기보다 익숙한 ${basis ? `${fmt(basis.durationMin)}분 구성` : "운동 구성"}에서 시작해 뒤 구간과 다음날 반응까지 확인해 보세요. 놓친 운동을 몰아서 채울 필요는 없어요.` };
      }
      const shortenedEpisode = priorStable && row.durationMin <= priorStable.durationMin * 0.8;
      if (shortenedEpisode && ordinaryIntent && !expanded && !fasterDistanceCompletion && !["race", "match"].includes(d.format)
        && action === initialAction && !row.hasSetDiary) {
        const timeTask = row.sport === "strength" ? "동작·시간" : ["mixed", "team"].includes(row.sport) ? "시간·구간" : "시간·거리";
        const extraLoad = row.sport === "strength" ? "중량이나 세트 수" : row.sport === "mixed" && d.segments?.some(part => finite(part.loadKg)) ? "빠른 구간이나 기구 부하" : row.sport === "walking" ? "속도나 경사" : "속도나 강도";
        action = { kind: "shortened-configuration", title: "짧아진 구성에서 다음 운동 정하기",
          body: `이번 기록(${workText(row)})은 ${priorStable.date}의 구성(${workText(priorStable)})보다 전체 시간이 짧아졌어요. 다음에는 이번에 실제로 마친 구성을 편하게 이어가고, 마무리까지 호흡·동작과 이후 반응을 확인해요. 휴식이나 구성을 의도적으로 짧게 했다면 그 과제를 유지하고, 평소 운동의 일부를 못 한 거라면 익숙한 ${timeTask} 중 하나부터 돌아가 보세요. 이전 시간을 맞추려고 ${extraLoad}까지 함께 올리지 않아요.` };
        question = { kind: "session-configuration", body: "전체 시간이 짧아진 것은 구성을 압축한 건가요, 평소 운동의 일부를 못 한 건가요?", options: ["구성을 압축함", "평소 운동 일부를 못 함"] };
      }
      if (["mixed", "team"].includes(row.sport) && d.segments?.length) {
        const wholeWorkAction = ["reduced-work", "shortened-configuration", "shorter-faster-work", "return-established-work", "consolidate-volume"].includes(action.kind) ? action : null;
        let segmentAction = null;
        const segmentReference = previous || (previousSport && clean(previousSport.details?.label) === clean(d.label)
          && clean(previousSport.details?.equipmentKey) === clean(d.equipmentKey) ? previousSport : null);
        const previousSegments = segmentReference?.details?.segments || [];
        const segmentChanges = [], loadChanges = [], repChanges = [];
        for (const segment of d.segments) {
          const currentMatches = d.segments.filter(part => part.label === segment.label && part.kind === segment.kind);
          const matches = previousSegments.filter(part => part.label === segment.label && part.kind === segment.kind);
          const before = currentMatches.length === 1 && matches.length === 1 ? matches[0] : null;
          const values = Object.fromEntries(["durationMin", "distanceM", "reps", "loadKg"].filter(key => finite(segment[key])).map(key => [key, segment[key]]));
          observations.push({ kind: "hybrid-segment", label: segment.label, segmentId: segment.id, current: values,
            previous: before ? Object.fromEntries(["durationMin", "distanceM", "reps", "loadKg"].filter(key => finite(before[key])).map(key => [key, before[key]])) : null,
            previousDate: before ? segmentReference.date : null, orderMatched: !!before && d.sequenceConfirmed === true && segmentReference.details.sequenceConfirmed === true &&
              JSON.stringify(d.segments.map(part => [part.label, part.kind])) === JSON.stringify(previousSegments.map(part => [part.label, part.kind])) });
          if (before && finite(segment.durationMin) && finite(before.durationMin) && before.durationMin > 0 &&
            Math.abs(segment.durationMin - before.durationMin) / before.durationMin >= 0.2) segmentChanges.push({ segment, before });
          if (before && finite(segment.loadKg) && finite(before.loadKg) && segment.loadKg !== before.loadKg) loadChanges.push({ segment, before });
          if (before && finite(segment.reps) && finite(before.reps) && segment.reps !== before.reps) repChanges.push({ segment, before });
        }
        const orderChanged = segmentReference && d.sequenceConfirmed && segmentReference.details?.sequenceConfirmed &&
          JSON.stringify(d.segments.map(part => [part.label, part.kind])) !== JSON.stringify(previousSegments.map(part => [part.label, part.kind]));
        if (loadChanges.length) notes.push(loadChanges.map(change => `${change.segment.label}: 표시 부하는 ${change.before.loadKg}kg → ${change.segment.loadKg}kg으로 바뀌었어요.`).join(" "));
        if (repChanges.length) notes.push(repChanges.map(change => `${change.segment.label}: 반복은 ${change.before.reps}회 → ${change.segment.reps}회로 바뀌었어요.`).join(" "));
        if (orderChanged) notes.push("확인한 구간 순서도 바뀐 운동이에요.");
        if (segmentChanges.length && ordinaryIntent && !["race", "match"].includes(d.format) && !expanded) {
          const changed = segmentChanges[0], stableDistance = finite(changed.segment.distanceM) && changed.segment.distanceM === changed.before.distanceM;
          const changedSegmentLoad = loadChanges.some(change => change.segment.id === changed.segment.id);
          const otherSegmentLoad = loadChanges.some(change => change.segment.id !== changed.segment.id);
          notes.push(`${changed.segment.label}: 구간 시간은 ${fmt(changed.before.durationMin)}분 → ${fmt(changed.segment.durationMin)}분으로 바뀌었어요.`);
          segmentAction = { kind: "hybrid-segment-review", title: "달라진 구간 하나와 다음 구간 연결하기", body: `${changed.segment.label}의 ${changedSegmentLoad ? "부하가 달라진 상태에서의 시간" : stableDistance ? "같은 거리에서 달라진 시간" : "거리·반복·부하와 함께 달라진 시간"}부터 확인해 보세요.${otherSegmentLoad ? " 다른 구간의 부하도 바뀌었으니 그 구간까지 마친 반응을 함께 보세요." : ""}${orderChanged ? " 구간 순서도 바뀌었으니 이전 순서에서의 시간과 우열을 정하기보다 이번 순서·부하로 뒤 구간까지 제어해 보세요." : d.sequenceConfirmed && segmentReference.details.sequenceConfirmed ? " 다음에는 앞 구간에서 힘을 모두 쓰지 않고 이 구간 뒤까지 연결하는 과제로 잡아요." : " 다음에는 실제 구간 순서를 확인하며 익숙한 구성으로 이어가요."} 시간 단축만 쫓아 전체 거리와 기구 부하를 함께 늘리지 않아요.` };
        }
        const episodeReference = priorStable || (lastSportRows.length > 1 && differentContext?.date === lastSportDate ? null : differentContext);
        const priorParts = episodeReference?.details?.segments || [];
        const episodePart = d.segments.find(part => priorParts.some(before => before.label === part.label && before.kind === part.kind &&
          (["durationMin", "distanceM", "reps", "loadKg"].some(key => finite(part[key]) && finite(before[key]) && part[key] !== before[key]))));
        if (episodePart && ordinaryIntent && !["race", "match"].includes(d.format) && !expanded && !segmentAction) {
          const before = priorParts.find(part => part.label === episodePart.label && part.kind === episodePart.kind);
          notes.push(`${episodeReference.date} 기록과 비교하면 ${episodePart.label} 과제는 ${["durationMin", "distanceM", "reps", "loadKg"].filter(key => finite(episodePart[key]) && finite(before[key]) && episodePart[key] !== before[key]).map(key => { const unit = { durationMin: "분", distanceM: "m", reps: "회", loadKg: "kg" }[key]; return `이전 ${before[key]}${unit}, 이번 ${episodePart[key]}${unit}`; }).join(" · ")} 기록이에요.`);
          const confirmedEpisodeOrder = d.sequenceConfirmed === true && episodeReference.details?.sequenceConfirmed === true;
          const hybridTask = confirmedEpisodeOrder ? " 다음에는 확인한 이번 구간 구성·부하로 마무리까지 이어가는 것을 먼저 확인해요."
            : " 다음에도 기록한 구간별 과제와 부하를 유지하고, 실제 구간 순서를 확인하며 마무리까지 연결해요.";
          segmentAction = { kind: row.sport === "team" ? "practice-task" : "hybrid-task", title: "바뀐 구간 과제를 다음 운동에 이어가기", body: `${episodePart.label}의 바뀐 과제를 기록했어요.${row.sport === "team" ? " 반복 수는 성공률이나 경기 실력과 별개예요. 다음 연습은 이번 반복을 동작이 흐트러지지 않게 마치는 과제로 잡고, 횟수와 강도를 함께 올리지 않아요." : `${hybridTask} 기록 시간이 좋아졌더라도 다음 구간이 무너지지 않게 제어하고, 전체 총량과 기구 부하를 동시에 늘리지 않아요.`}` };
        }
        if (segmentAction) action = wholeWorkAction ? { ...wholeWorkAction,
          body: `${wholeWorkAction.body} 구간 과제는 전체 시간 구성과 나눠 이어가요. ${segmentAction.body}` } : segmentAction;
      }
      if (contextConflict(row)) {
        alternatives.length = 0;
        action = { kind: "confirm-environment", title: "현재 운동 환경부터 맞춰 이어가기", body: `실제 수행 기록(${workText(row)})은 남아 있어요. 속도·경사 계산에 남긴 환경과 상세 운동의 환경이 달라요. 둘 중 실제로 한 환경을 확인하고, 그동안 다음 운동은 이번 시간·익숙한 강도로 이어가요.` };
      }
      if (previous && ordinaryIntent && effortRise && (heartRise || highEffort) && !["race", "match"].includes(d.format)) {
        alternatives.length = 0;
        action = { kind: "higher-effort", title: "같은 구성에서 더 버거웠던 반응부터 확인하기", body: `이번 느낌 강도가 이전보다 높아졌어요.${heartRise ? " 평균 심박수도 더 높게 남겼어요." : ""} 다음에는 이번 기록(${workText(row)})에서 더 늘리기보다 익숙한 시작 구간에서 호흡과 움직임을 확인해요. 편하게 풀리지 않으면 빠른 구간을 줄이거나 쉬어가고, 반복된다면 수면·질병·날씨·최근 훈련과 식사를 함께 살펴요.` };
      }
      if (changedContext && action.kind === "repeat") action.title = "이번 조건에서 새 기준 이어가기";
      const priorOther = all.filter(prior => prior.date < row.date && prior.date >= I.shiftDate(row.date, -14) && prior.sport !== row.sport);
      const strengthBefore = (state?.training?.records || []).some(prior => prior.date < row.date && prior.date >= I.shiftDate(row.date, -14));
      const firstSport = all.find(prior => prior.sport === row.sport)?.date;
      const transitionSources = all.filter(prior => prior.date < firstSport && prior.date >= I.shiftDate(firstSport || row.date, -14) && prior.sport !== row.sport);
      const strengthTransition = (state?.training?.records || []).some(prior => prior.date < firstSport && prior.date >= I.shiftDate(firstSport || row.date, -14));
      const transitionRecent = firstSport && elapsed(firstSport, row.date) <= 14 && (transitionSources.length || strengthTransition);
      if ((!past.length && (priorOther.length || strengthBefore) || transitionRecent) && row.sport !== "strength") {
        notes.push("다른 종목의 운동 경험은 이어지지만 이번 종목의 기술·반복 부담은 새로 적응하는 구간이에요.");
        if (!["post-event", "technique", "hybrid-task", "hybrid-segment-review", "consolidate-volume"].includes(action.kind)) {
          alternatives.length = 0;
          action = { kind: "sport-transition", title: "새 종목에 맞춰 익숙해지는 과제부터", body: `이번 ${label} ${workText(row)}에서 이어가되 기존 종목의 높은 수행을 새 종목의 속도·거리 목표로 바꾸지는 않아요. 다음에는 이번보다 더 크게 늘리기보다 익숙한 동작·호흡과 뒤 구간을 제어하는 과제로 잡고, 기존 훈련과 겹치는 날에는 한쪽 부담을 가볍게 해보세요.` };
        }
      }
      const intentBodies = {
        deload: "이번에 낮춘 부담은 디로드 목적이에요. 다음에 빠진 시간을 몰아 채우지 말고, 몸 상태가 돌아오면 디로드 전 익숙한 구성부터 이어가요.",
        light: "가볍게 한 날이에요. 이번 기록을 부진으로 만회하려 하지 말고, 다음 평소 운동은 앞선 익숙한 구성과 연결해요.",
        "time-limited": "시간이 부족한 날로 남겼어요. 다음 운동은 확보한 시간 안에서 평소 핵심 구성을 이어가고, 못 한 운동이 있어도 한꺼번에 보충하지 않아요.",
        return: "복귀 운동으로 남긴 실제 수행을 출발점으로 삼아요. 다음에도 처음부터 예전 최고 속도·총량을 재현하려 하지 말고, 운동 중과 이후·다음날 반응이 괜찮은지 확인한 뒤 한 가지씩 늘려요.",
        test: "테스트 기록은 이번 확인 결과로 남겨요. 다음 일반 훈련에서는 이 강도를 매번 재현하기보다 앞선 익숙한 구성으로 돌아가고, 몸 상태를 확인해요."
      };
      if (intentBodies[intent]) { alternatives.length = 0; action = { kind: intent, title: `${purposeNames[intent]} 다음 운동 이어가기`, body: intentBodies[intent] }; question = null; }
      if (["race", "match"].includes(d.format) && ordinaryIntent) { alternatives.length = 0; action = sportNext(row, previous, repeated); question = null; }
      if (currentRecovery) {
        const deferred = action;
        alternatives.length = 0;
        alternatives.push({ ...deferred, title: `컨디션이 돌아온 뒤 · ${deferred.title}`, body: `현재 피로·컨디션이 돌아오고 익숙한 운동이 편해진 뒤 선택할 내용이에요. ${deferred.body}` });
        action = { kind: "current-recovery", title: "오늘 상태에 맞춰 익숙한 부담부터 확인하기", body: `실제로 마친 기록(${workText(row)})과 오늘 알려준 피로·컨디션을 함께 봐야 해요. 다음 운동은 편한 시작 구간에서 호흡·동작을 확인하고, 평소보다 버거우면 짧게 마치거나 쉬어가요. 상태가 돌아오면 이번 종목의 진행 선택으로 이어갈 수 있어요.` };
      }
      if (checkin.illness === "recovering") {
        alternatives.length = 0;
        const recoveryStart = row.date === date
          ? `${date}에 회복 중이라고 남겼고, 같은 날 실제 수행(${workText(row)})도 기록했어요. 이번 구성에서 바로 늘리기보다 운동 중·직후와 다음날 반응을 확인해요.`
          : `${date}에 질병 뒤 회복 중이라고 남겼어요. 다음 운동은 현재 회복 상태에 맞춰 쉬운 익숙한 구성부터 시작하고, 아직 불편하면 쉬어가요. 마지막 실제 활동은 ${row.date}의 기록(${workText(row)})이에요. 운동 중·직후와 다음날 반응을 확인해요.`;
        action = { kind: "illness-return", title: "회복 중에는 다음날 반응까지 보고 이어가기", body: `${recoveryStart} 증상이 다시 심해지면 쉬고 개별 평가를 받아요. 안정적으로 회복되면 익숙한 구성부터 차근차근 이어가요.` };
      }
      if (checkin.pain === "mild") { alternatives.length = 0; action = { kind: "pain-review", title: "통증을 유발하지 않는 움직임부터", body: "통증이 있다고 남겼어요. 아픈 동작을 계속 밀거나 속도·시간을 늘리지 말고, 불편한 구간은 빼거나 쉬어가요. 통증이 지속되거나 악화하면 개별 평가를 받아 다음 운동을 정해요." }; }
      if (unresolvedHealth.length) {
        alternatives.length = 0; question = null;
        sources.push(...unresolvedHealth.filter(report => report.date < date).flatMap(report => healthSources(report.field, report)));
        const healthReports = unresolvedHealth.map(report => report.value === "conflicting"
          ? `${report.date}의 ${report.field === "illness" ? "질병" : "통증"} 보고가 서로 달라요.`
          : report.field === "illness" ? `${report.date}에 ${report.value === "active" ? "질병 중이라고" : "질병 뒤 회복 중이라고"} 남겼어요.`
            : `${report.date}에 ${report.value === "stop" ? "중단할 정도의 통증을" : "통증이 있다고"} 남겼어요.`);
        historicalHealthBody = `${healthReports.join(" ")} 지금도 증상이나 통증이 남아 있다면 운동으로 만회하지 말고 쉬며 상태를 확인해요. 증상이 가라앉고 평소 움직임이 편해졌다면 익숙한 쉬운 구성으로 시작하고, 운동 중·이후와 다음날 반응을 본 뒤 이어가요. 불편이 지속되거나 심하면 개별 평가를 받아요.`;
        action = ["active", "recovering"].includes(checkin.illness) || ["mild", "stop"].includes(checkin.pain)
          ? { ...action, body: `${action.body} ${historicalHealthBody}` }
          : { kind: "health-follow-up", title: "마지막으로 불편했던 상태와 다음 운동 연결하기", body: historicalHealthBody };
      }
      if (clinical) { alternatives.length = 0; action = { kind: "individual-care", title: "개별 지침 안에서 실제 수행 이어가기", body: `이번 기록(${workText(row)})은 실제 수행으로 남아요. 성장기·고령·건강 맥락에 따라 개인 지침이 다를 수 있으니 현재 정한 제한 안에서 이어가고, 새로운 강도나 부담 증가는 담당 전문가와 맞춰요.${historicalHealthBody ? ` ${historicalHealthBody}` : ""}` }; }
      if (checkin.illness === "active" || checkin.pain === "stop") { alternatives.length = 0; question = null; action = { kind: "stop", title: "오늘은 운동 증가보다 중단·상태 확인이 먼저", body: "현재 질병이나 중단할 정도의 통증을 남겼어요. 운동으로 만회하지 말고 쉬며 현재 증상을 확인해요. 흉통·호흡 곤란·실신이나 심한 증상이 있으면 즉시 의료 도움을 받아요. 회복 후 운동은 개별 지침과 증상 반응에 맞춰 다시 시작해요." }; }
      return { id: row.id, date: row.date, sport: row.sport, label, actual: actual(row), comparison: { previous: previous ? { id: previous.id, date: previous.date, actual: actual(previous) } : null,
        lastSportDate, contextMatched: !!previous, observations, sameContextDays: new Set(same.map(prior => prior.date)).size,
        elapsedDaysSinceSport: lastSportDate ? elapsed(lastSportDate, row.date) : null, sameDaySequenceInferred: false },
        assessment: notes.join(" "), action, alternatives: alternatives.slice(0, 2), question, sources, intent };
    });
    const current = currentRows.length ? rows : [], latest = currentRows.length ? [] : rows;
    const safety = rows.find(row => ["stop", "pain-review", "illness-return", "individual-care", "current-recovery", "health-follow-up"].includes(row.action.kind));
    const summaryAdvice = {
      stop: "지금은 운동을 이어가기보다 중단하고 현재 증상을 확인하는 것이 먼저예요.",
      "pain-review": "통증을 유발하는 움직임은 빼거나 쉬고, 더 늘리기 전에 상태부터 확인해요.",
      "illness-return": "질병 뒤 회복 중이므로 바로 늘리지 않고 운동 중·이후와 다음날 반응을 먼저 확인해요.",
      "individual-care": "다음 운동은 개인 지침을 먼저 확인하고, 그 범위에서 정해요.",
      "current-recovery": "알려준 피로·컨디션에 맞춰 편한 시작에서 확인하고, 버거우면 짧게 마치거나 쉬어가요.",
      "health-follow-up": "마지막 불편 기록과 지금 상태를 나눠 확인해요. 증상이 남아 있다면 쉬며 상태를 확인하고, 가라앉았다면 쉬운 구성부터 반응을 봐요."
    }[safety?.action.kind] || "실제로 남긴 활동에서 다음 운동을 이어가요.";
    return { date, current, latest, history: { sessionCount: all.length, dayCount: new Set(all.map(row => row.date)).size, sports: [...new Set(all.map(row => row.sport))],
      lastDate: all.at(-1)?.date || null }, connections: linked.connections, priority: safety?.action || rows[0]?.action || null,
      summary: rows.length ? `${currentRows.length ? date : `마지막 활동 ${rows[0].date}`} · ${rows.map(row => `${row.label} ${fmt(row.actual.durationMin)}분`).join(" / ")}. ${summaryAdvice}` : "", crossDomain: linked };
  }
  return { build };
});
