'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const S = require('../src/storage.js');
const TS = require('../src/training-store.js');
const T = require('../src/training.js');
const A = require('../src/coach-actions.js');
const I = require('../src/insights.js');

const today = I.dateKey(), tomorrow = I.shiftDate(today, 1);
const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const profile = { sex: 'female', age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatWeightKg: null,
  bodyFatDate: null, bodyFatMethod: 'unknown', trainingYears: 2, sport: 'strength', goal: 'maintain', activity: 'light',
  healthContext: 'general', proteinPreference: 'standard' };

function fixture(withCheckin = false) {
  let state = S.createEmpty(); state.profile = profile; state.training = TS.createEmpty();
  state.days[today] = { date: today, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: 'unknown',
    carbAdjustmentG: 0, meals: [], sessions: [], complete: false, planSnapshot: null };
  if (withCheckin) state.days[today].coachCheckin = { energy: 'okay', hunger: 'high', sleep: 'poor', trainingPlan: 'planned', mealConstraint: null, performance: 'steady' };
  for (const id of ['synthetic-program-a', 'synthetic-program-b']) {
    const program = T.createProgram(T.recommendProgram(profile, state.training.settings), { id, createdAt: new Date().toISOString() });
    program.name = id === 'synthetic-program-a' ? '합성 기존 프로그램' : '합성 선택 프로그램';
    state.training.planning.programs.push(program);
  }
  state.training.planning.activeProgramId = 'synthetic-program-a';
  const program = state.training.planning.programs[0];
  state.training.planning.schedule.push(T.createAssignment(program, program.days[0].id, today, 'synthetic-assignment'));
  state.training.memory = { constraints: '합성 주의 사항', focus: '일주일 동안 기록 이어가기', agreements: '기록 없이 효과를 단정하지 않기', updatedAt: null };
  state = A.createDraft(state, { kind: 'program', targetId: 'active-program', choice: { programId: 'synthetic-program-b' } },
    { id: 'synthetic-applied-action', reason: '합성 변경 후 실행 결과 확인', reviewDate: tomorrow });
  return S.validateState(A.applyDraft(state, 'synthetic-applied-action'));
}

async function storedText(page) { return page.evaluate(key => localStorage.getItem(key), S.STORAGE_KEY); }
async function noOverflow(page, context) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, `${context}: horizontal overflow ${JSON.stringify(size)}`);
}

async function visibleLabel(page, locator, label) {
  await locator.waitFor({ state: 'visible' }); await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate(element => {
    element.removeAttribute('title');
    const label = element.querySelector('span'), button = element.getBoundingClientRect();
    const shape = rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    const range = document.createRange(); if (label) range.selectNodeContents(label);
    const style = label ? getComputedStyle(label) : null;
    const siblings = [...element.parentElement.children].filter(other => other !== element).map(other => ({
      rect: shape(other.getBoundingClientRect()), visible: other.getClientRects().length > 0 && getComputedStyle(other).visibility !== 'hidden'
    })).filter(other => other.visible && other.rect.width > 0 && other.rect.height > 0);
    return { text: element.textContent.replace(/\s+/g, ' ').trim(), labelText: label?.textContent.trim(),
      button: shape(button), textRects: label ? [...range.getClientRects()].map(shape) : [],
      labelVisible: !!label && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
      labelOverflow: label ? label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1 : true,
      siblings };
  });
  assert.equal(result.text, label, `${label}: visible button text must explain the action without a tooltip`);
  assert.equal(result.labelText, label, `${label}: expected a visible DOM label`);
  assert.equal(result.labelVisible, true, `${label}: label is visually hidden`);
  assert.equal(result.labelOverflow, false, `${label}: text exceeds its label box`);
  assert.ok(result.textRects.length > 0, `${label}: label has no rendered text`);
  for (const rect of result.textRects) {
    assert.ok(rect.width > 0 && rect.height > 0 && rect.left >= result.button.left - 1 && rect.right <= result.button.right + 1
      && rect.top >= result.button.top - 1 && rect.bottom <= result.button.bottom + 1, `${label}: text exceeds button ${JSON.stringify(result)}`);
  }
  for (const sibling of result.siblings) {
    const overlapWidth = Math.min(result.button.right, sibling.rect.right) - Math.max(result.button.left, sibling.rect.left);
    const overlapHeight = Math.min(result.button.bottom, sibling.rect.bottom) - Math.max(result.button.top, sibling.rect.top);
    assert.ok(overlapWidth <= 1 || overlapHeight <= 1, `${label}: overlapping sibling ${JSON.stringify(result)}`);
  }
  await noOverflow(page, label);
}

async function openAndCancel(page, locator, untouched, verify) {
  await locator.click(); await page.locator('#entryDialog').waitFor({ state: 'visible' });
  await verify(page.locator('#entryForm'));
  assert.equal(await storedText(page), untouched, 'opening a domain dialog must not write the app state');
  await noOverflow(page, 'opened dialog');
  await page.locator('#entryForm [data-action="dialog-close"]').last().click();
  await page.locator('#entryDialog').waitFor({ state: 'hidden' });
  assert.equal(await storedText(page), untouched, 'cancelling a domain dialog must preserve the exact app state');
}

async function fields(form, names) {
  for (const name of names) assert.equal(await form.locator(`[name="${name}"]`).count(), 1, `dialog requires ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }) });
  const artifacts = path.join(__dirname, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  let page;
  try {
    for (const width of [320, 390, 1280]) {
      for (const withCheckin of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
          const initial = fixture(withCheckin), untouched = JSON.stringify(initial), errors = [], requests = [];
          await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
            { key: S.STORAGE_KEY, value: untouched });
          page = await context.newPage(); page.setDefaultTimeout(10000);
          page.on('pageerror', error => errors.push(error.message));
          page.on('dialog', async dialog => { errors.push(`unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });
          page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
          await page.goto(url); await page.locator('#view-today').waitFor({ state: 'visible' });
          assert.equal(await storedText(page), untouched, 'rendering must not rewrite synthetic stored records');

          const connection = page.locator('#headerActions [data-action="connection-setup"]');
          const condition = page.locator('.daily-condition [data-action="coach-checkin"]');
          const duration = page.locator('.movement-section [data-action="session-add"]');
          const measurement = page.locator('.body-summary [data-action="measurement"]');
          await visibleLabel(page, connection, '연결 설정');
          await visibleLabel(page, condition, withCheckin ? '컨디션 수정' : '컨디션 기록');
          await visibleLabel(page, duration, '운동 시간 기록');
          await visibleLabel(page, measurement, '체중·체성분 기록');
          await openAndCancel(page, condition, untouched, async form => {
            for (const name of ['energy', 'hunger', 'sleep']) assert.ok(await form.locator(`[name="${name}"]`).count() > 1, `${name} condition choices`);
            assert.equal(await form.locator('[name="weightKg"]').count(), 0, 'condition is not body-composition measurement');
          });
          if (withCheckin) { assert.deepEqual(errors, []); assert.deepEqual(requests, []); continue; }

          await openAndCancel(page, connection, untouched, async form => {
            assert.equal(await form.locator('#codexUseEnabled').count(), 1);
            assert.equal(await form.locator('[data-action="connection-refresh"]').isDisabled(), true, 'file mode cannot silently contact a runtime');
            assert.equal(await form.locator('[data-action="diary-folder"]').count(), 1);
            assert.match(await form.innerText(), /파일로 열려 있어요/);
          });
          await openAndCancel(page, duration, untouched, async form => {
            await fields(form, ['sport', 'durationMin', 'intensity']);
            assert.equal(await form.locator('[name="0-0-loadKg"]').count(), 0, 'energy-duration entry is not a set diary');
          });
          await openAndCancel(page, measurement, untouched, async form => {
            await fields(form, ['weightKg', 'bodyFatPct', 'skeletalMuscleKg', 'bodyFatMethod']);
            assert.equal(await form.locator('[name="energy"]').count(), 0, 'body measurements are not a condition check-in');
          });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(artifacts, `action-labels-today-${width}.png`), fullPage: true });

          await page.locator('[data-view="coach"]').click(); await page.locator('#coachActionLoop').waitFor({ state: 'visible' });
          for (const [kind, label] of [['program', '프로그램 선택'], ['schedule', '운동 날짜 변경'], ['allocation', '탄수·지방 목표 조절'], ['burden', '예정 운동 조절']]) {
            const button = page.locator(`#coachActionLoop [data-action="coach-action-create-${kind}"]`);
            await visibleLabel(page, button, label);
            assert.equal(await button.isEnabled(), true, `${label}: synthetic profile and schedule should support opening`);
            await openAndCancel(page, button, untouched, async form => {
              await fields(form, ['reason', 'reviewDate']);
              if (kind === 'program') await fields(form, ['programId']);
              if (kind === 'schedule') await fields(form, ['targetId', 'date']);
              if (kind === 'allocation') {
                await fields(form, ['deltaG']);
                assert.match(await form.innerText(), /총열량과 단백질 유지/);
                assert.equal(await form.locator('[name="mealName"]').count(), 0, 'allocation changes targets, not meals');
              }
              if (kind === 'burden') {
                await fields(form, ['targetId', 'burdenKind', 'setReduction', 'rirIncrease', 'exerciseId', 'loadKg']);
                await form.locator('[name="burdenKind"]').selectOption('deload');
                assert.equal(await form.locator('[name="setReduction"]').isVisible(), true);
                await form.locator('[name="burdenKind"]').selectOption('progression');
                assert.equal(await form.locator('[name="loadKg"]').isVisible(), true);
              }
            });
          }
          const review = page.locator('#coachActionLoop [data-action="coach-action-review"][data-id="synthetic-applied-action"]');
          await visibleLabel(page, review, '실행 결과 점검');
          await openAndCancel(page, review, untouched, async form => {
            await fields(form, ['execution', 'outcome', 'note', 'nextReviewDate']);
            assert.equal(await form.locator('[name="execution"]').inputValue(), 'unknown');
            assert.equal(await form.locator('[name="outcome"]').inputValue(), 'insufficient');
          });
          const memory = page.locator('#coachContent .coach-continuity [data-action="coach-memory"]');
          const followup = page.locator('#coachContent .coach-continuity [data-action="coach-followup-add"]');
          await visibleLabel(page, memory, '기억할 내용 수정');
          await visibleLabel(page, followup, '점검 일정 추가');
          await openAndCancel(page, memory, untouched, async form => {
            await fields(form, ['constraints', 'focus', 'agreements']);
            assert.equal(await form.locator('[name="focus"]').inputValue(), initial.training.memory.focus);
          });
          await openAndCancel(page, followup, untouched, async form => { await fields(form, ['topic', 'reviewDate', 'note']); });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(artifacts, `action-labels-coach-${width}.png`), fullPage: true });
          await page.reload(); await page.locator('#view-today').waitFor({ state: 'visible' });
          assert.equal(await storedText(page), untouched, 'navigation, dialogs and reload preserve the exact initial app state');
          assert.deepEqual(errors, []); assert.deepEqual(requests, [], 'file-mode label and dialog tests must not contact AI or private runtime APIs');
        } catch (error) {
          await page?.screenshot({ path: path.join(artifacts, `action-labels-failure-${width}.png`), fullPage: true }).catch(() => {});
          throw error;
        } finally { await context.close(); page = null; }
      }
    }
    console.log('Action label browser: tooltip-free visible domain labels, semantic dialogs, condition add/edit, exact state preservation, text fit and sibling separation at 320/390/1280px passed. No AI or private data.');
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, 'action-labels-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
