(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./coach.js") : root.MacroCoach);
  if (node) module.exports = api;
  root.MacroConversation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Coach) {
  "use strict";

  const VERSION = "1.0-local-context-dialogue";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const fmt = value => finite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "미확인";
  const clean = value => typeof value === "string" ? value.slice(0, 4000) : "";
  const list = value => Array.isArray(value) ? value.filter(row => typeof row === "string").slice(0, 10) : [];
  const labels = { "nav-profile": "내 기준 확인", "nav-training": "훈련 기록 보기", "nav-program": "훈련 계획 보기", "coach-checkin": "몸 상태 알려주기", "meal-add": "식사 기록", "nav-trends": "최근 변화 보기" };
  const makeActions = names => [...new Set(names)].filter(name => labels[name]).map(action => ({ action, label: labels[action] }));
  const response = (topic, paragraphs, actions = [], confidence = "medium", requiresPersonalReview = false) => ({ text: paragraphs.filter(Boolean).join("\n\n"), actions: makeActions(actions), topic, confidence, requiresPersonalReview });
  const question = (coach, id) => Array.isArray(coach?.questions) ? coach.questions.find(row => row?.id === id && typeof row.answer === "string")?.answer : null;
  const painPattern = /통증|아프|아파|부상|다쳤|찌릿|저림|흉통|호흡곤란|숨.{0,5}(차|쉬기.{0,3}힘)|어지럽|실신|현기증|붓|부었|부어|가슴.{0,8}답답|\bpain\b|injur/i;

  function positiveSymptoms(value) {
    return value.replace(/(?:통증|부상|저림|붓기|흉통)\s*(?:은|는|이|도)?\s*없(?:어요|어|다|음|고|는데)?/g, "")
      .replace(/안\s*아(?:파|프)(?:요|다|고)?/g, "");
  }

  function trainingSummary(training) {
    const last = training.lastSession;
    if (!training.available || !last) return "지금 선택한 기간에는 확인된 세트 일지가 없어요. 운동하지 않았다는 뜻은 아니에요.";
    const count = training.coverage.recordCount;
    return `${training.windowStart || "시작일 미확인"}부터 ${training.windowEnd}까지${count !== null ? ` 확인된 일지 ${fmt(count)}개 중` : ""} 최근 기록은 ${last.date}${last.time ? ` ${last.time}` : ""} ${last.label || "훈련"}이에요.${last.totalSets !== null ? ` 기록된 세트는 ${fmt(last.totalSets)}개예요.` : ""}${last.sourceKind === "legacy-ocr" ? " 이전 OCR 요약이며 원본을 새로 검증한 기록은 아니에요." : ""} 헤더 시각만으로 시작·종료 시각을 정하지 않았어요.`;
  }

  function progressionAnswer(training, prompt) {
    const rows = training.progression;
    const generic = new Set(["운동", "기록", "훈련", "머신", "기구", "덤벨", "바벨", "케이블", "시티드", "스미스"]);
    const named = rows.filter(row => [row.label, row.exerciseId, row.current?.rawName, row.observed.current?.rawName].some(name => name && (prompt.includes(name) || name.split(/\s+/).some(token => token.length > 1 && !generic.has(token) && prompt.includes(token)))));
    const selected = (named.length ? named : rows).slice(0, 3);
    if (!selected.length) return { text: `${trainingSummary(training)}\n\n같은 운동·기구의 이전 기록이 더 있어야 대표 세트를 비교할 수 있어요. 오늘의 실제 중량과 반복 수는 먼저 남길 수 있어요.`, missing: true };
    return {
      text: selected.map(row => `${row.label || "운동명 미확인"}${row.equipmentKey ? ` [${row.equipmentKey}]` : ""}: ${Coach.progressionObservation(row)}. ${row.reason || "비교에 필요한 노력 수준과 중량 표기 규약을 확인해야 해요."}`).join("\n") + "\n\n이것은 기록된 대표 세트의 변화예요. 총 kg이나 한 번의 수행 차이로 근육 증가량, 정체의 원인, 다음 중량을 확정하지 않아요.",
      missing: false
    };
  }

  function musclesAnswer(training, prompt) {
    const rows = training.muscles;
    const named = rows.filter(row => row.label && prompt.includes(row.label) || row.id && prompt.toLowerCase().includes(row.id.toLowerCase()));
    const chosen = (named.length ? named : rows.filter(row => (row.directSets || 0) + (row.indirectSets || 0) > 0)).slice(0, 8);
    if (!training.available || !chosen.length) return { text: "아직 부위로 분류된 기록이 충분하지 않아요. 운동명과 기구를 확인한 뒤 실제 세트의 직접·간접 노출을 따로 볼 수 있어요. 분류되지 않은 운동을 0세트로 처리하지는 않았어요.", missing: true };
    return {
      text: `${training.windowStart || "시작일 미확인"}~${training.windowEnd} 기록에서\n${chosen.map(row => `${row.label || row.id}: 직접 ${fmt(row.directSets)}세트, 간접 ${fmt(row.indirectSets)}세트${row.unknownEffortSets !== null ? `, 노력 수준 미확인 ${fmt(row.unknownEffortSets)}세트` : ""}`).join("\n")}\n\n운동 분류에 따른 노출이지 근육별 성장량이나 모두 같은 자극의 세트 수는 아니에요. 직접·간접 세트를 합쳐 한 가지 효과 점수로 만들지 않았어요.${training.coverage.unresolvedExercises !== null && training.coverage.unresolvedExercises > 0 ? ` 분류 미확인 운동 ${fmt(training.coverage.unresolvedExercises)}개도 남아 있어요.` : ""}`,
      missing: false
    };
  }

  function recoveryAnswer(training, coach) {
    const recovery = training.recovery;
    return [
      recovery.reasons.join(" ") || question(coach, "recovery") || "지금 기록만으로 회복 상태를 확정할 수는 없어요.",
      recovery.questions.join(" ") || "최근 수면·피로·통증은 어땠고, 같은 운동의 마지막 세트에 몇 회 정도 더 할 여유가 있었나요?",
      "한 번의 일지나 낮아진 총볼륨만으로 디로드를 확정하지 않아요. 미기록 날짜를 휴식일로 세지 않고, 식사 감량이나 추가 운동으로 보상하도록 권하지 않아요."
    ].join("\n\n");
  }

  function programAnswer(program, training) {
    if (!program || !["ready", "review", "incomplete"].includes(program.status)) return { text: "아직 확인된 프로그램 초안이 없어요. 가능한 주당 횟수, 한 번에 쓸 시간, 사용할 기구와 우선할 부위를 먼저 맞춰 주세요.", missing: true };
    if (program.status !== "ready") return { text: `${clean(program.reason) || "계획을 만들 조건이 아직 확인되지 않았어요."} ${list(program.limitations).slice(0, 2).join(" ")}`.trim(), missing: true };
    const days = Array.isArray(program.days) ? program.days.filter(day => day && Array.isArray(day.exercises)).slice(0, 7) : [];
    if (!days.length) return { text: "프로그램에 실제 운동 구성이 없어서 실행 가능한 계획으로 안내하지 않았어요. 계획 조건을 다시 확인해 주세요.", missing: true };
    const reps = value => typeof value === "string" ? value.slice(0, 80) : finite(value) ? fmt(value) : Array.isArray(value) && value.length === 2 && value.every(finite) ? `${fmt(value[0])}~${fmt(value[1])}` : "미확인";
    const details = days.map(day => `${clean(day.label) || "훈련일"}: ${day.exercises.filter(row => row && typeof row === "object").slice(0, 10).map(row => `${clean(row.label) || "운동명 미확인"} ${fmt(row.sets)}세트 × ${reps(row.reps)}회${finite(row.rir) ? `, RIR ${fmt(row.rir)}` : ""}${finite(row.restSeconds) ? `, 휴식 ${fmt(row.restSeconds)}초` : ""}`).join(" / ")}`).join("\n");
    return { text: `${clean(program.name) || "훈련 계획"}은 설정에 맞춘 초안이에요. ${clean(program.reason)}\n\n${details}\n\n${clean(program.progression)} ${list(program.limitations).slice(0, 2).join(" ")} 실제 수행·통증·회복을 확인하며 적용해야 하고, 완료한 과거 일지는 바꾸지 않아요.`.trim(), missing: false };
  }

  function respond(input, context = {}) {
    const prompt = typeof input === "string" ? input.trim() : "";
    const ctx = context && typeof context === "object" ? context : {};
    if (!prompt) return response("empty", ["최근 운동, 특정 부위, 다음 식사처럼 지금 함께 확인할 질문을 적어 주세요."], [], "limited");
    if (prompt.length > 4000) return response("personal-review", ["질문이 길어 로컬 규칙만으로 뜻을 줄여 해석하지 않았어요. 원문과 기록을 함께 살펴보는 개인 검토가 필요해요."], [], "limited", true);
    const profile = ctx.profile;
    const coach = ctx.coach && typeof ctx.coach === "object" ? ctx.coach : Coach.buildCoach(profile, ctx.day || {}, ctx.history || [], { trainingAnalysis: ctx.trainingAnalysis, program: ctx.program });
    const training = Coach.summarizeTraining(ctx.trainingAnalysis, null, ctx.program, ctx.day?.date);
    const symptoms = positiveSymptoms(prompt);
    if (painPattern.test(symptoms) || training.recovery.status === "stop" || ["mild", "stop"].includes(training.recovery.pain)) {
      const urgent = /흉통|가슴.{0,10}(통증|아프|아파|답답)|호흡곤란|숨.{0,5}(차|쉬기.{0,3}힘)|실신/.test(symptoms);
      return response("pain", [
        urgent ? "가슴 통증·호흡 곤란·실신 같은 증상은 코치 답변을 기다리지 말고 즉시 119 등 현지 응급 도움을 받아 주세요." : "통증이 생기는 동작은 지금 중단해 주세요. 기록만 보고 원인을 진단하거나 다른 운동으로 대체 처방하지 않을게요.",
        training.recovery.reasons.join(" "),
        "통증 위치, 시작 상황, 가만히 있을 때도 아픈지와 붓기·힘 빠짐을 알려 주세요. 심한 통증·붓기, 체중을 실을 수 없음, 지속되거나 악화되는 증상은 의료진 확인이 필요해요. 개인 코치 검토가 진료를 대신하지는 않아요."
      ], urgent ? [] : ["nav-training", "nav-profile"], "limited", true);
    }
    const clinical = profile?.healthContext && profile.healthContext !== "general" || finite(profile?.age) && (profile.age < 18 || profile.age > 80) || /임신|수유|섭식장애|당뇨|치료\s*식|질환|약\s*복용/.test(prompt) || coach.status === "review";
    if (clinical) return response("clinical", ["현재는 개인별 건강 맥락을 먼저 확인해야 해요. 자동 감량·칼로리 조정이나 훈련 증량을 새로 권하지 않고, 의료진과 정한 계획을 우선할게요.", "이미 기록한 내용과 과거 완료 당시 목표는 보존해요. 무엇을 바꾸고 싶은지와 현재 받고 있는 식사·운동 지침을 함께 알려 주세요."], ["nav-profile", "nav-training"], "limited", true);
    if (training.recovery.status === "review") return response("recovery", [recoveryAnswer(training, coach), "이 신호만으로 통증이나 질환이 있다고 판단하지 않았어요. 새 훈련 증량이나 감량을 정하기 전에 회복 맥락의 개인 검토가 필요해요."], ["coach-checkin", "nav-training"], "limited", true);

    const intents = {
      progression: /수행|정체|중량|프로그레션|늘었|발전|근성장|성장량|볼륨|기록.*비교|반복.*(증가|늘)/.test(prompt),
      muscles: /부위|직접|간접|가슴|등\s*운동|등은|등을|하체|상체|삼두|이두|어깨|둔근|대퇴|햄스트링|종아리|근육별|세트\s*수/.test(prompt),
      recovery: /휴식|쉬어|쉬는|쉬면|쉬고|디로드|델로드|피로|회복|수면|잠|지침/.test(prompt),
      program: /프로그램|루틴|분할|계획|스케줄|주\s*\d+\s*회|몇\s*회|오늘.*뭐|다음.*뭐/.test(prompt),
      nutrition: /식사|먹|단백질|탄수|지방|칼로리|kcal|영양|허기|배고|보충|술/i.test(prompt),
      weight: /감량|다이어트|체중|살.?빼|증량|리컴프|체지방/.test(prompt),
      training: /운동|훈련|세트|일지|최근.*기록/.test(prompt)
    };
    if ((intents.nutrition || intents.weight) && !/운동|훈련|루틴|프로그램|분할/.test(prompt)) intents.program = false;
    // Broad topic overlap is expected; independent questions need review, not invented causal links.
    const groups = [intents.progression || intents.muscles, intents.recovery, intents.program, intents.nutrition || intents.weight].filter(Boolean).length;
    const simpleTrainingPlan = intents.program && (intents.muscles || intents.recovery) && !(intents.nutrition || intents.weight || intents.progression) && !/그리고|동시에|병행|종합|전부|각각/.test(prompt);
    const complex = groups > 1 && !simpleTrainingPlan || /왜|원인|진단|정확히|최적|얼마나.*(성장|근육)|근육.*얼마나/.test(prompt);
    if (complex) {
      const facts = intents.progression ? progressionAnswer(training, prompt).text : intents.muscles ? musclesAnswer(training, prompt).text : trainingSummary(training);
      return response("personal-review", ["서로 얽힌 조건이나 원인 판단은 로컬 규칙으로 단정하지 않을게요. 이 질문은 기록을 함께 읽는 개인 검토가 필요해요.", facts, "위 내용은 확인 가능한 기록 요약이며 자유대화 AI가 전체 맥락을 검토한 답변은 아니에요."], ["nav-training", ...(intents.nutrition || intents.weight ? ["nav-trends"] : [])], "limited", true);
    }
    if (intents.recovery) return response("recovery", [recoveryAnswer(training, coach)], ["coach-checkin", "nav-training"], "medium", training.recovery.status === "insufficient");
    if (intents.program) {
      if (!profile || ["onboarding", "incomplete"].includes(coach.status)) return response("program", ["훈련 구성을 새로 권하기 전에 내 기준과 건강 맥락을 확인해야 해요. 이미 기록한 세트는 그대로 살펴볼 수 있어요."], ["nav-profile", "nav-training"], "limited", true);
      if (training.recovery.status === "watch") return response("recovery", [recoveryAnswer(training, coach), "확인된 회복 신호가 있어 새 계획의 증량부터 진행하기보다 해당 신호를 먼저 검토해야 해요."], ["coach-checkin", "nav-program"], "limited", true);
      const answer = programAnswer(ctx.program, training);
      return response("program", [answer.text], ["nav-program"], answer.missing ? "limited" : "medium", answer.missing);
    }
    if (intents.progression) {
      const answer = progressionAnswer(training, prompt);
      return response("progression", [answer.text], ["nav-training"], answer.missing ? "limited" : "medium", answer.missing);
    }
    if (intents.muscles) {
      const answer = musclesAnswer(training, prompt);
      return response("muscles", [answer.text], ["nav-training"], answer.missing ? "limited" : "medium", answer.missing);
    }
    if (intents.nutrition || intents.weight) {
      if (["onboarding", "incomplete"].includes(coach.status)) return response("nutrition", [question(coach, "scope") || "개인 섭취 목표를 말하기 전에 내 기준과 기록 상태를 확인해야 해요.", "알 수 없는 섭취량을 0으로 채우거나 식사를 더 줄이도록 권하지 않아요."], ["nav-profile"], "limited", true);
      const answer = intents.weight ? question(coach, "target") : question(coach, "next-meal");
      return response(intents.weight ? "weight" : "nutrition", [answer || "확인된 식사와 목표가 부족해 양을 단정하지 않았어요.", intents.weight ? question(coach, "trend") : null, "이 답변은 입력한 기록을 해석한 로컬 안내예요. 음식 알레르기, 치료 식이와 실제 식사 시각은 입력 없이 추측하지 않아요."], [intents.weight ? "nav-trends" : ctx.day?.complete ? "nav-trends" : "meal-add"], answer ? "medium" : "limited", !answer);
    }
    if (intents.training) return response("training", [trainingSummary(training), training.available ? "부위별 노출, 같은 기구의 대표 세트, 회복 중 무엇을 먼저 살펴볼까요? 미기록일은 휴식일로 채우지 않았고 일지의 표시 Cal을 식사 목표에 더하지 않았어요." : "세트 일지를 가져오면 최근 운동을 재사용해서 살펴볼 수 있어요. 원문 운동·기구 이름과 실제 세트부터 확인해 주세요."], ["nav-training"], training.available ? "medium" : "limited", !training.available);
    return response("personal-review", ["이 질문은 현재 로컬 규칙으로 의도를 충분히 구분하지 못했어요. 아는 척 답하지 않고, 원문과 기록을 함께 살펴보는 개인 검토가 필요한 질문으로 남길게요."], [], "limited", true);
  }

  return Object.freeze({ VERSION, respond });
});
