"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const Storage = require("../src/storage.js");
const Nutrition = require("../src/nutrition.js");
const Insights = require("../src/insights.js");
const root = path.resolve(__dirname, "..");
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const profile = { sex: "female", age: 35, heightCm: 165, weightKg: 65, bodyFatPct: null, bodyFatMethod: "unknown", bodyFatDate: null, bodyFatWeightKg: null, trainingYears: null, sport: "strength", goal: "maintain", activity: "light", healthContext: "general", proteinPreference: "standard" };

function fixture(complete = false) {
  const state = Storage.createEmpty();
  state.profile = { ...profile };
  const day = { date: today, weightKg: null, bodyFatPct: null, skeletalMuscleKg: null, bodyFatMethod: "unknown", carbAdjustmentG: 0, meals: [{ id: "meal-1", name: "점심", protein: 30, carbs: 80, fat: 15, otherKcal: 0, alcoholG: 0 }], sessions: [], complete, planSnapshot: null };
  if (complete) {
    day.planSnapshot = Nutrition.calculatePlan(state.profile, day, []);
    day.planSnapshot.context.goal = profile.goal;
  }
  state.days[today] = day;
  return state;
}

function makeServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { response.writeHead(404).end(); return; }
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" }[path.extname(file)] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": mime + ";charset=utf-8" }).end(body);
    });
  });
}

async function raw(page) {
  return page.evaluate(key => localStorage.getItem(key), Storage.STORAGE_KEY);
}

async function nav(page, view) {
  await page.locator(`[data-view="${view}"]:visible`).first().click();
}

async function upload(page, state, name = "backup.json") {
  await nav(page, "data");
  await page.locator("#backupFile").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(typeof state === "string" ? state : JSON.stringify(state)) });
}

async function addMeal(page, name = "간식") {
  await nav(page, "today");
  await page.locator('#view-today .meal-section [data-action="meal-add"]').click();
  await page.locator('#entryForm [name="name"]').fill(name);
  await page.locator('#entryForm [name="protein"]').fill("15");
  await page.locator('#entryForm [name="carbs"]').fill("30");
  await page.locator('#entryForm [name="fat"]').fill("5");
  await page.locator('#entryForm button[type="submit"]').click();
}

const cases = [
  {
    name: "meal metadata, alcohol confirmation, reusable templates and day notes survive reload",
    seed: { [Storage.STORAGE_KEY]: JSON.stringify(fixture()) },
    async run(page) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.locator('#view-today .meal-section [data-action="meal-add"]').click();
      await page.locator('#entryForm [name="name"]').fill('저녁 술과 식사');
      await page.locator('#entryForm [name="protein"]').fill('25');
      await page.locator('#entryForm [name="type"]').selectOption('dinner');
      await page.locator('#entryForm [name="note"]').fill('양과 도수 확인');
      await page.locator('#entryForm details summary').click();
      await page.locator('[name="alcoholVolume"]').fill('500');
      await page.locator('[name="alcoholAbv"]').fill('5');
      await page.locator('[name="alcoholCount"]').fill('2');
      await page.locator('[data-action="alcohol-calculate"]').click();
      assert.equal(await page.locator('[name="alcoholG"]').inputValue(), '39.45');
      await page.locator('#entryForm button[type="submit"]').click();
      let saved = JSON.parse(await raw(page));
      assert.equal(saved.days[today].meals[1].alcoholG, 39.45);
      assert.equal(saved.days[today].meals[1].type, 'dinner');
      assert.equal(saved.days[today].meals[1].note, '양과 도수 확인');
      await page.locator('[data-action="meal-template-save"]').last().click();
      await page.locator('#entryForm [name="title"]').fill('주말 저녁');
      await page.locator('#entryForm button[type="submit"]').click();
      await page.locator('[data-action="meal-templates"]').click();
      await page.locator('[data-action="meal-template-use"]').click();
      await page.locator('#entryForm [name="protein"]').fill('35');
      await page.locator('#entryForm button[type="submit"]').click();
      await page.locator('[data-action="day-note"]').click();
      await page.locator('#entryForm [name="note"]').fill('휴일, 평소보다 늦게 식사');
      await page.locator('#entryForm button[type="submit"]').click();
      await page.reload();
      saved = JSON.parse(await raw(page));
      assert.equal(saved.mealTemplates[0].meal.protein, 25);
      assert.equal(saved.days[today].meals[2].protein, 35);
      assert.notEqual(saved.days[today].meals[1].id, saved.days[today].meals[2].id);
      assert.equal(saved.days[today].note, '휴일, 평소보다 늦게 식사');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
  },
  {
    name: "previous-day bulk copy previews duplicate multiplicity and does not collapse same-name meals",
    seed: (() => {
      const state = fixture(), date = Insights.shiftDate(today, -1), meal = state.days[today].meals[0];
      state.days[date] = { ...structuredClone(state.days[today]), date, meals: [{ ...meal, id: 'old-one' }, { ...meal, id: 'old-two' }, { ...meal, id: 'old-three', protein: 55 }] };
      return { [Storage.STORAGE_KEY]: JSON.stringify(state) };
    })(),
    async run(page) {
      assert.equal(await page.locator('[data-action="meal-reuse"]').count(), 3);
      const before = await raw(page);
      await page.locator('[data-action="meal-copy-previous"]').click();
      assert.equal(await raw(page), before);
      assert.equal(await page.locator('[name="copyMeal"]:checked').count(), 2);
      await page.locator('#entryForm button[type="submit"]').click();
      const saved = JSON.parse(await raw(page));
      assert.equal(saved.days[today].meals.length, 3);
      assert.equal(saved.days[today].meals[2].protein, 55);
      assert.equal(new Set(Object.values(saved.days).flatMap(day => day.meals.map(meal => meal.id))).size, 6);
    }
  },
  {
    name: "diet merge previews selected open-day replacement and protects completed day and legacy archive",
    seed: (() => {
      const state = fixture(true), date = Insights.shiftDate(today, -1);
      state.legacy = Storage.importLegacy({ version: 4, records: [] }).legacy;
      state.days[date] = { ...structuredClone(state.days[today]), date, complete: false, planSnapshot: null, meals: [{ ...state.days[today].meals[0], id: 'open-meal' }] };
      return { [Storage.STORAGE_KEY]: JSON.stringify(state) };
    })(),
    async run(page) {
      const before = JSON.parse(await raw(page)), incoming = structuredClone(before), yesterday = Insights.shiftDate(today, -1), older = Insights.shiftDate(today, -2);
      incoming.days[today].meals[0].protein = 70;
      incoming.days[yesterday].meals[0].protein = 45;
      incoming.days[older] = { ...structuredClone(incoming.days[yesterday]), date: older, meals: [{ ...incoming.days[yesterday].meals[0], id: 'older-meal' }] };
      incoming.profile.weightKg = 90; incoming.legacy = null;
      await upload(page, incoming);
      assert.deepEqual(JSON.parse(await raw(page)), before);
      const choice = page.locator(`[name="mergeReplace"][value="${yesterday}"]`);
      await choice.locator('xpath=ancestor::details/summary').click();
      await choice.check();
      assert.equal(await page.locator(`[name="mergeReplace"][value="${today}"]`).count(), 0);
      await page.locator('[data-action="import-merge"]').click();
      const saved = JSON.parse(await raw(page));
      assert.equal(saved.days[yesterday].meals[0].protein, 45);
      assert.equal(saved.days[older].meals.length, 1);
      assert.deepEqual(saved.days[today], before.days[today]);
      assert.deepEqual(saved.profile, before.profile);
      assert.deepEqual(saved.legacy, before.legacy);
    }
  },
  {
    name: "period comparisons and body observations render nonblank without narrow-screen overflow",
    seed: (() => {
      const state = fixture(true), base = state.days[today];
      state.days = {};
      for (let index = 0; index < 42; index++) {
        const date = Insights.shiftDate(today, -index);
        state.days[date] = { ...structuredClone(base), date, weightKg: 65 + index / 20, bodyFatPct: index % 7 === 0 ? 22 + index / 50 : null, skeletalMuscleKg: index % 7 === 0 ? 25 + index / 100 : null, bodyFatMethod: 'bia', meals: [{ ...base.meals[0], id: `period-${index}` }] };
      }
      return { [Storage.STORAGE_KEY]: JSON.stringify(state) };
    })(),
    async run(page) {
      await nav(page, 'trends');
      for (const period of [7, 14, 28, 42]) {
        await page.locator('#trendPeriod').selectOption(String(period));
        assert.equal(await page.locator('.history-table tbody tr').count(), period);
      }
      await page.locator('#bodyMetric').selectOption('skeletalMuscleKg');
      await page.locator('#intakeMetric').selectOption('protein');
      fs.mkdirSync(path.join(root, 'tests/artifacts'), { recursive: true });
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(30);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
        for (const selector of ['#weightChart', '#intakeChart']) {
          const colored = await page.locator(selector).evaluate(canvas => {
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let count = 0; for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 100 && pixels[index + 1] > 80 && pixels[index + 1] < 180) count++;
            return count;
          });
          assert.ok(colored > 10, `${selector} must contain actual observations`);
        }
        await page.screenshot({ path: path.join(root, `tests/artifacts/observations-${width}.png`) });
      }
      await nav(page, 'today');
      assert.equal(await page.locator('[data-action="meal-copy-previous"]').count(), 0);
    }
  },
  {
    name: "corrupt storage blocks normal save, preserves bytes and offers raw download",
    seed: { [Storage.STORAGE_KEY]: "{broken-한글" },
    async run(page) {
      await addMeal(page);
      assert.equal(await raw(page), "{broken-한글");
      assert.equal(await page.locator("#storageWarning").count(), 1);
      await page.locator('[data-action="dialog-close"]').first().click();
      await nav(page, "data");
      const downloading = page.waitForEvent("download");
      await page.locator('[data-action="corrupt-export"]').click();
      const stream = await (await downloading).createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString("utf8"), "{broken-한글");
    }
  },
  {
    name: "invalid imported snapshot cannot change current storage or offer confirmation",
    seed: { [Storage.STORAGE_KEY]: JSON.stringify(fixture()) },
    async run(page) {
      const before = await raw(page);
      const invalid = fixture(true);
      invalid.days[today].planSnapshot.macros.protein = "bad";
      await upload(page, invalid);
      await page.locator("#importPreview [role=alert]").waitFor();
      assert.equal(await raw(page), before);
      assert.equal(await page.locator('[data-action="import-confirm"]').count(), 0);
    }
  },
  {
    name: "current import changes state only after explicit replace, including corrupt recovery",
    seed: { [Storage.STORAGE_KEY]: "broken" },
    async run(page) {
      const incoming = fixture(true);
      await upload(page, incoming);
      await page.locator('[data-action="import-confirm"]').waitFor();
      assert.equal(await raw(page), "broken");
      await page.locator('[data-action="import-confirm"]').click();
      await page.waitForFunction(key => { try { return JSON.parse(localStorage.getItem(key)).version === 9; } catch (_) { return false; } }, Storage.STORAGE_KEY);
      const saved = JSON.parse(await raw(page));
      assert.deepEqual(saved.profile, incoming.profile);
      assert.deepEqual(saved.days, incoming.days);
      assert.equal(await page.locator("#storageWarning").count(), 0);
    }
  },
  {
    name: "legacy import preserves new profile and days and keeps old browser data untouched",
    seed: { [Storage.STORAGE_KEY]: JSON.stringify(fixture()), runstep_macro_v1_weight: "80" },
    async run(page) {
      const before = JSON.parse(await raw(page));
      const legacy = { version: 4, records: [{ date: "2025-07-15", weight: 80, adherencePercent: 77, meals: [] }] };
      await upload(page, legacy);
      await page.locator('[data-action="import-confirm"]').click();
      await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key)).legacy, Storage.STORAGE_KEY);
      const saved = JSON.parse(await raw(page));
      assert.deepEqual(saved.profile, before.profile);
      assert.deepEqual(saved.days, before.days);
      assert.deepEqual(saved.legacy.raw, legacy);
      assert.equal(saved.legacy.records[0].completion, "unconfirmed");
      assert.equal(await page.evaluate(() => localStorage.getItem("runstep_macro_v1_weight")), "80");
    }
  },
  {
    name: "completed snapshot stays identical after changing profile and reloading",
    seed: { [Storage.STORAGE_KEY]: JSON.stringify(fixture(true)) },
    async run(page) {
      const original = JSON.parse(await raw(page)).days[today].planSnapshot;
      await nav(page, "profile");
      await page.locator('#profileForm [name="weightKg"]').fill("90");
      await page.locator('#profileForm [name="goal"]').selectOption("gain");
      await page.locator('#profileForm button[type="submit"]').click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).profile.weightKg === 90, Storage.STORAGE_KEY);
      assert.deepEqual(JSON.parse(await raw(page)).days[today].planSnapshot, original);
      await page.reload();
      assert.deepEqual(JSON.parse(await raw(page)).days[today].planSnapshot, original);
      assert.ok((await page.locator("#todayContent").textContent()).includes("저장 당시의 기준"));
    }
  },
  {
    name: "review profile may complete an unscored diary with null targets",
    seed: (() => { const state = fixture(); state.profile.healthContext = "pregnancy"; return { [Storage.STORAGE_KEY]: JSON.stringify(state) }; })(),
    async run(page) {
      await page.locator('#view-today .day-completion [data-action="complete"]').click();
      await page.locator('#entryForm button[type="submit"]').click();
      await page.waitForFunction(({ key, date }) => JSON.parse(localStorage.getItem(key)).days[date].complete, { key: Storage.STORAGE_KEY, date: today });
      const saved = JSON.parse(await raw(page)).days[today];
      assert.equal(saved.planSnapshot.status, "review");
      assert.equal(saved.planSnapshot.energy.targetKcal, null);
    }
  },
  {
    name: "quota failure keeps persisted and rendered meal count unchanged",
    seed: { [Storage.STORAGE_KEY]: JSON.stringify(fixture()) },
    async run(page) {
      const before = await raw(page);
      await page.evaluate(key => {
        const original = window.Storage.prototype.setItem;
        window.Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException("quota", "QuotaExceededError"); return original.call(this, name, value); };
      }, Storage.STORAGE_KEY);
      await addMeal(page);
      assert.equal(await raw(page), before);
      assert.ok((await page.locator("#toast").textContent()).includes("저장하지 못했습니다"));
    }
  },
  {
    name: "imported hostile meal text stays text in HTML and attributes",
    seed: (() => { const state = fixture(); state.days[today].meals[0].name = '<img src=x onerror="window.injected=true">'; return { [Storage.STORAGE_KEY]: JSON.stringify(state) }; })(),
    async run(page) {
      assert.equal(await page.evaluate(() => window.injected), undefined);
      assert.equal(await page.locator("#todayContent img").count(), 0);
      assert.ok((await page.locator("#todayContent").textContent()).includes("<img src=x"));
    }
  }
];

(async () => {
  const server = makeServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const results = [];
  try {
    let launchError;
    const channels = [...new Set([process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined, "chrome", "msedge"])];
    for (const channel of channels) {
      try { browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }); break; }
      catch (error) { launchError = error; }
    }
    if (!browser) throw launchError;
    for (const scenario of cases) {
      const context = await browser.newContext({ timezoneId: "Asia/Seoul", locale: "ko-KR", acceptDownloads: true });
      await context.addInitScript(seed => {
        if (!localStorage.getItem("storage-test-seeded")) {
          Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value));
          localStorage.setItem("storage-test-seeded", "yes");
        }
      }, scenario.seed);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.setDefaultTimeout(5000);
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await scenario.run(page);
        assert.deepEqual(errors, []);
        results.push({ name: scenario.name, pass: true });
      } catch (error) { results.push({ name: scenario.name, pass: false, error: error.stack }); }
      finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify({ passed: results.filter(item => item.pass).length, failed: results.filter(item => !item.pass).length, results }, null, 2));
  if (results.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
