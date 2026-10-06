// Opt-in integration smoke test. Uses the signed-in Codex account, never personal records.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { CoachRuntime, summarizeState } = require('../tools/coach-runtime.cjs');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const directory = path.resolve(__dirname, 'artifacts/live-coach');
async function wait(runtime, job) {
  while (runtime.get(job.id).status === 'running') await new Promise(resolve => setTimeout(resolve, 1000));
  const result = runtime.get(job.id);
  assert.equal(result.status, 'completed', result.error || 'Live coach did not complete');
  return result.result;
}
function exercise(id, name, exerciseId, equipmentKey, vector) {
  return { id, rawName: name, exerciseId, equipmentKey, loadConvention: name.includes('덤벨') ? 'per-side' : 'total', loadRole: 'external',
    durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: '',
    sets: vector.map(([loadKg, reps], index) => ({ id: `${id}:set:${index}`, loadKg, reps, marker: null, rir: null })) };
}
function session(id, date, exercises) {
  return { id, date, time: null, label: '합성 Push', durationMinutes: null, reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
    source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: null, pain: null,
    sequence: { order: 'listed', structure: 'straight' }, exercises };
}
function workoutState(records) {
  const value = S.createEmpty(); value.updatedAt = '2026-10-06T00:00:00.000Z'; value.trackingScope = 'training'; value.training = TS.createEmpty(); value.training.records = records; return value;
}
async function complexCoaching(runtime) {
  const priorBench = () => exercise('deep-prior-bench', '바벨 벤치 프레스', 'bench_press', 'synthetic-bench', [[100, 10], [100, 10], [100, 8]]);
  const currentBench = () => exercise('deep-current-bench', '바벨 벤치 프레스', 'bench_press', 'synthetic-bench', [[120, 3], [100, 6], [100, 4]]);
  const heavy = workoutState([session('deep-prior', '2026-10-01', [priorBench()]), session('deep-current', '2026-10-06', [currentBench()])]);
  const purpose = workoutState([
    session('purpose-prior', '2026-10-01', [exercise('purpose-prior-ohp', '바벨 오버헤드 프레스', 'overhead_press', 'synthetic-ohp', [[35, 10], [35, 10], [35, 10], [50, 8]])]),
    session('purpose-current', '2026-10-06', [exercise('purpose-current-ohp', '바벨 오버헤드 프레스', 'overhead_press', 'synthetic-ohp', [[35, 10], [35, 10], [35, 10], [50, 5]])])
  ]);
  const mixed = workoutState([
    session('mixed-prior', '2026-10-01', [priorBench(),
      exercise('mixed-prior-ohp', '바벨 오버헤드 프레스', 'overhead_press', 'synthetic-ohp', [[40, 10], [50, 8], [50, 8]]),
      exercise('mixed-prior-row', '덤벨 로우', 'dumbbell_row', 'synthetic-row', [[15, 15], [15, 15], [15, 15], [15, 15]])]),
    session('mixed-current', '2026-10-06', [currentBench(),
      exercise('mixed-current-ohp', '바벨 오버헤드 프레스', 'overhead_press', 'synthetic-ohp', [[40, 10], [40, 10], [40, 10]]),
      exercise('mixed-current-row', '덤벨 로우', 'dumbbell_row', 'synthetic-row', [[17, 15], [17, 15], [17, 15], [17, 15]])])
  ]);
  const cases = [{ id: 'new-heavy-and-tail', state: heavy, question: '오늘 벤치는 어떻게 봐야 할까? 다음 운동에서는 무엇을 먼저 챙길지 실제 기록 전체를 보고 정해줘.' }];
  for (const answer of ['planned', 'unexpected']) {
    const value = structuredClone(purpose), movement = value.training.records[1].exercises[0];
    movement.coachingAnswer = TS.createCoachingAnswer(movement, 'rep-target', answer);
    cases.push({ id: `rep-target-${answer}`, state: value, question: '오늘 오버헤드 프레스는 잘 한 운동이야? 다음에도 같은 구성을 해야 할지 판단해서 조언해줘.' });
  }
  cases.push({ id: 'whole-session-load-redistribution', state: mixed, question: '오늘 전체 운동을 종목끼리 연결해서 봐줘. 다음 운동에서 전부 더 올려야 할까, 어디에 집중하면 좋을까? 식단과 인바디는 기록하지 않을 거야.' });
  cases.push({ id: 'stable-whole-work', state: workoutState(['2026-10-01', '2026-10-03', '2026-10-06'].map((date, index) =>
    session(`stable-session-${index}`, date, [exercise(`stable-bench-${index}`, '바벨 벤치 프레스', 'bench_press', 'synthetic-stable-bench', [[65, 10], [65, 10], [65, 10]])]))),
    question: '계속 같은 기록인데 다음엔 어떻게 변화를 줄까?' });
  const selectedCase = process.argv.find(value => value.startsWith('--case='))?.slice('--case='.length);
  if (selectedCase) assert.ok(cases.some(value => value.id === selectedCase), 'unknown complex live case');
  const report = { generatedAt: new Date().toISOString(), syntheticOnly: true, cases: [] };
  const reportFile = path.join(directory, selectedCase ? `deep-coaching-${selectedCase}.json` : 'deep-coaching-report.json');
  for (const value of cases.filter(value => !selectedCase || value.id === selectedCase)) {
    const before = structuredClone(value.state), context = summarizeState(value.state, '2026-10-06', value.question);
    const job = runtime.start({ kind: 'chat', question: value.question, context }, null, process.argv.includes('--refresh'));
    console.log(`Live complex coaching started: ${value.id} (${job.id})`);
    try {
      const result = await wait(runtime, job);
      assert.ok(result.answer.length > 100, 'a complex question needs actual usable advice, not a missing-input refusal');
      assert.deepEqual(value.state, before);
      report.cases.push({ id: value.id, jobId: job.id, status: 'completed', context, result });
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
      console.log(`${value.id}\n${result.answer}\n`);
    } catch (error) {
      report.cases.push({ id: value.id, jobId: job.id, status: runtime.get(job.id).status, error: error.message, context });
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
      throw error;
    }
  }
  const resultFor = id => report.cases.find(value => value.id === id)?.result;
  const newHeavy = resultFor('new-heavy-and-tail'), planned = resultFor('rep-target-planned'), unexpected = resultFor('rep-target-unexpected'), redistribution = resultFor('whole-session-load-redistribution'), stable = resultFor('stable-whole-work');
  if (newHeavy) {
    assert.match(newHeavy.answer, /120\s*(?:kg|킬로그램)/i);
    assert.match(newHeavy.answer, /100\s*(?:kg|킬로그램)/i);
    assert.match(newHeavy.answer, /뒤|낮춘|백오프/);
  }
  if (planned) assert.match(planned.answer, /의도|목표|정한|계획/);
  if (unexpected) assert.match(unexpected.answer, /버거|예상|줄|유지|확보/);
  if (planned && unexpected) assert.notEqual(planned.answer, unexpected.answer);
  if (redistribution) {
    assert.match(redistribution.answer, /벤치/);
    assert.match(redistribution.answer, /오버헤드|프레스|어깨/);
    assert.match(redistribution.answer, /덤벨|로우/);
    assert.match(redistribution.answer, /120\s*(?:kg|킬로그램)/i);
    assert.match(redistribution.answer, /100\s*(?:kg|킬로그램)/i);
    assert.match(redistribution.answer, /40\s*(?:kg|킬로그램)/i);
    assert.match(redistribution.answer, /17\s*(?:kg|킬로그램)/i);
  }
  if (stable) {
    assert.match(stable.answer, /65\s*(?:kg|킬로그램)/i);
    assert.match(stable.answer, /10\s*(?:회|번)/);
    assert.match(stable.answer, /한 세트|한세트|한 곳|하나만|첫 세트|첫세트|1세트/);
    assert.match(stable.answer, /11\s*(?:회|번)/, 'the fixed native proposal must not collapse into unspecified extra repetitions');
    assert.match(stable.answer, /추가 반복|반복.*(?:더|늘|추가)|(?:최소|작은|가장 작은).{0,12}(?:증량|중량|부하)/);
    assert.match(stable.answer, /(?:나머지|뒤 세트|다른 세트).{0,80}(?:유지|그대로)/s);
    assert.match(stable.answer, /다음 기록|다음.{0,12}(?:확인|점검)|되돌|유지되는지|흐트러|무너지/);
  }
  for (const value of report.cases) {
    assert.doesNotMatch(value.result.answer, /trainingCoaching|primaryAction|hypotheses|앱.*(?:동의|찬성)/, 'nontechnical coaching must not expose internal interpretation fields');
    assert.doesNotMatch(value.result.answer, /(?:RIR|식단|인바디).{0,20}(?:필수|입력해야|없어서.{0,8}(?:못|불가))/, 'missing optional inputs must not become the answer');
  }
  console.log(`Live complex coaching completed. Read ${report.cases.length} actual answers: ${reportFile}`);
}
(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const runtime = new CoachRuntime(directory);
  try {
    if (process.argv.includes('--deep')) { await complexCoaching(runtime); return; }
    const unknown = S.createEmpty();
    const chat = await wait(runtime, runtime.start({ kind: 'chat', question: '검증용 합성 맥락입니다. 식사·운동을 기록하지 않은 오늘의 근육 성장률을 알 수 있나요?', context: summarizeState(unknown, '2026-10-06') }));
    assert.match(chat.answer, /알 수 없|계산할 수 없|확정할 수 없|판단할 수 없/);
    assert.ok(chat.coaching, 'current coach contract must include explicit source claims');
    const known = S.createEmpty();
    known.profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null, bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light', healthContext: 'general', proteinPreference: 'standard' };
    known.days['2026-10-06'] = { date: '2026-10-06', weightKg: 64.5, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown', carbAdjustmentG: 0, meals: [{ id: 'synthetic-meal', name: '검증용 식사', protein: 35, carbs: 80, fat: 20, otherKcal: 0, alcoholG: 0 }], sessions: [], complete: false, planSnapshot: null };
    const question = '검증용 합성 기록입니다. 오늘 측정한 체중과 기록된 단백질 섭취량을 단위와 함께 알려주세요. 다른 수치는 쓰지 말고, 출처 claims에 해당 사실을 넣어 주세요.';
    const factual = await wait(runtime, runtime.start({ kind: 'chat', question, context: summarizeState(known, '2026-10-06', question) }));
    assert.match(factual.answer, /64\.5\s*(?:kg|킬로그램)/i); assert.match(factual.answer, /35\s*(?:g|그램)/i);
    assert.ok(factual.coaching.claims.some(claim => claim.value === 64.5)); assert.ok(factual.coaching.claims.some(claim => claim.value === 35));
    const trainingOnly = S.createEmpty(); trainingOnly.trackingScope = 'training';
    trainingOnly.training = require('../src/training-store.js').createEmpty();
    trainingOnly.training.records = [['2026-10-01', 'gym-a/machine-1', 40], ['2026-10-06', 'gym-b/machine-2', 30]].map(([date, device, load], index) => ({
      id: `live-rotation-${index}`, date, time: null, label: '합성 장비 변경', durationMinutes: null,
      reportedSetCount: null, reportedVolumeKg: null, reportedEnergyKcal: null,
      source: { kind: 'manual', hash: null, paths: [], uncertainties: [], revision: null }, notes: '', effort: null, pain: null,
      exercises: [{ id: `live-block-${index}`, rawName: '머신 체스트 프레스', exerciseId: 'machine_chest_press', equipmentKey: device,
        loadConvention: 'total', loadRole: 'external', durationMinutes: null, repsTotal: null, reportedVolumeKg: null, notes: '',
        sets: [{ id: `live-set-${index}`, loadKg: load, reps: 10, marker: null, rir: null }] }] }));
    const rotationQuestion = '합성 검증입니다. 머신을 바꿨는데 표시 중량이 내려갔어. 오늘 3시간밖에 못 잤어. 과훈련이라 디로드 해야 하나? 식단과 인바디는 기록하지 않을 거야. 필요한 다음 행동과 판단의 한계를 말해 줘.';
    const rotation = await wait(runtime, runtime.start({ kind: 'chat', question: rotationQuestion, context: summarizeState(trainingOnly, '2026-10-06', rotationQuestion) }));
    assert.match(rotation.answer, /장비|머신/);
    assert.match(rotation.answer, /확정|단정|판단.*(?:어려|부족|없)|같은.*조건/);
    assert.ok(rotation.answer.length > 60);
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const image = path.join(directory, 'synthetic-workout.png');
    try {
      const page = await browser.newPage({ viewport: { width: 600, height: 420 } });
      await page.setContent('<html lang="en"><body style="font:22px sans-serif;padding:25px;background:white"><h1>Workout log</h1><p>2026-10-04 Push</p><h2>Bench press</h2><p>W 20 kg x 12</p><p>1 50 kg x 10</p><p>2 50 kg x 9</p></body></html>');
      await page.screenshot({ path: image });
    } finally { await browser.close(); }
    const workout = await wait(runtime, runtime.start({ kind: 'workout', question: '합성 검증 이미지의 날짜·종목·세트 원문만 읽어 주세요.', context: { date: '2026-10-06', profile: null } }, image));
    assert.equal(workout.workouts[0].date, '2026-10-04');
    assert.deepEqual(workout.workouts[0].exercises[0].sets.map(set => [set.loadKg, set.reps, set.marker]), [[20, 12, 'W'], [50, 10, null], [50, 9, null]]);
    console.log('Live Codex smoke passed: unknown context, numeric sources, training-only machine change and fresh sleep report, attached image, strict response validation. Synthetic data only; no universal reasoning guarantee.');
  } finally { runtime.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
