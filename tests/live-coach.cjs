// Opt-in integration smoke test. Uses the signed-in Codex account, never personal records.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { CoachRuntime } = require('../tools/coach-runtime.cjs');
const directory = path.resolve(__dirname, 'artifacts/live-coach');
async function wait(runtime, job) {
  while (runtime.get(job.id).status === 'running') await new Promise(resolve => setTimeout(resolve, 1000));
  const result = runtime.get(job.id);
  assert.equal(result.status, 'completed', result.error || 'Live coach did not complete');
  return result.result;
}
(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const runtime = new CoachRuntime(directory);
  try {
    const chat = await wait(runtime, runtime.start({ kind: 'chat', question: '검증용 합성 맥락입니다. 식사·운동을 기록하지 않은 오늘의 근육 성장률을 알 수 있나요?', context: { date: '2026-10-06', profile: null, today: { complete: false, meals: [], sessions: [] } } }));
    assert.match(chat.answer, /알 수 없|계산할 수 없|확정할 수 없|판단할 수 없/);
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
    console.log('Live Codex smoke passed: unknown context preserved, attached workout image transcribed, strict response validation. Synthetic data only.');
  } finally { runtime.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
