from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUT = ROOT / "_ui_prototypes" / "stitch_full_app.html"


APP_TEMPLATE = r"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>탄단지 다이어리</title>
  <style>
    :root{
      color-scheme:light;
      --primary:#005522;
      --primary-2:#1b6f34;
      --leaf:#4a8c5e;
      --bg:#f7fbf1;
      --surface:#ffffff;
      --surface-low:#f1f5eb;
      --surface-mid:#ebefe5;
      --surface-high:#e5eae0;
      --line:#bfc9bc;
      --line-soft:#dfe8da;
      --text:#181d17;
      --muted:#596155;
      --muted-2:#707a6e;
      --carb:#e8a375;
      --protein:#4a8c5e;
      --fat:#e0869a;
      --amber:#ffb100;
      --red:#ba1a1a;
      --shadow:0 16px 36px rgba(18,45,20,.08);
      --soft-shadow:0 7px 20px rgba(18,45,20,.05);
      --max:1220px;
    }
    *{box-sizing:border-box}
    html{background:var(--bg)}
    body{
      margin:0;
      min-height:100vh;
      background:var(--bg);
      color:var(--text);
      font-family:Manrope,Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
      letter-spacing:0;
    }
    body.modal-open{overflow:hidden}
    button,input,select,textarea{font:inherit;color:inherit;letter-spacing:0}
    button{cursor:pointer}
    h1,h2,h3,h4,p{margin:0}
    h1{font-size:28px;line-height:1.18;font-weight:850}
    h2{font-size:21px;line-height:1.25;font-weight:820}
    h3{font-size:16px;line-height:1.35;font-weight:820}
    p{line-height:1.55}
    .engine-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .engine-hidden iframe{width:1px;height:1px;border:0}
    .topbar{
      position:sticky;
      top:0;
      z-index:30;
      background:rgba(247,251,241,.94);
      border-bottom:1px solid var(--line-soft);
      backdrop-filter:blur(14px);
    }
    .topbar-inner{
      width:min(var(--max),calc(100% - 40px));
      min-height:68px;
      margin:0 auto;
      display:grid;
      grid-template-columns:1fr auto 1fr;
      gap:18px;
      align-items:center;
    }
    .brand{color:var(--primary);font-size:22px;font-weight:900;white-space:nowrap}
    .brand small{display:inline-block;margin-left:7px;color:var(--muted-2);font-size:11px;font-weight:800;vertical-align:middle}
    .nav{display:flex;gap:28px;align-items:center;justify-content:center}
    .nav button{
      border:0;
      border-bottom:3px solid transparent;
      background:transparent;
      padding:14px 0 11px;
      color:var(--muted);
      font-weight:820;
    }
    .nav button.active{color:var(--primary);border-bottom-color:var(--primary)}
    .top-actions{display:flex;justify-content:flex-end;gap:10px;align-items:center}
    .page{
      width:min(var(--max),calc(100% - 40px));
      margin:0 auto;
      padding:26px 0 88px;
    }
    .stack{display:grid;gap:18px}
    .stack-sm{display:grid;gap:10px}
    .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:20px;align-items:start}
    .span-3{grid-column:span 3}.span-4{grid-column:span 4}.span-5{grid-column:span 5}.span-6{grid-column:span 6}.span-7{grid-column:span 7}.span-8{grid-column:span 8}.span-9{grid-column:span 9}.span-12{grid-column:span 12}
    .card,.surface{
      background:var(--surface);
      border:1px solid var(--line);
      border-radius:16px;
      box-shadow:var(--soft-shadow);
      padding:18px;
    }
    .hero{
      min-height:162px;
      position:relative;
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:18px;
      background:linear-gradient(135deg,#ffffff 0%,#fffaf0 56%,#eef8ec 100%);
      box-shadow:var(--shadow);
      padding:24px;
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:24px;
    }
    .hero:after{
      content:"";
      position:absolute;
      right:-78px;
      top:-90px;
      width:230px;
      height:230px;
      border-radius:999px;
      border:42px solid rgba(27,111,52,.08);
    }
    .hero>*{position:relative;z-index:1}
    .kicker,.eyebrow{
      display:block;
      margin-bottom:7px;
      color:var(--primary);
      font-size:12px;
      font-weight:900;
      text-transform:uppercase;
    }
    .muted{color:var(--muted);font-size:14px}
    .fine{color:var(--muted-2);font-size:12px;font-weight:720}
    .section-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
    .chip-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .chip{
      display:inline-flex;
      min-height:31px;
      align-items:center;
      gap:6px;
      padding:6px 11px;
      border:1px solid var(--line);
      border-radius:999px;
      background:#fff;
      color:#263126;
      font-size:12px;
      font-weight:820;
      white-space:nowrap;
    }
    .chip.primary{background:var(--primary);border-color:var(--primary);color:#fff}
    .chip.soft{background:#e8f4e7;border-color:#c6ddc5;color:var(--primary)}
    .chip.warn{background:#fff5e3;border-color:#ffd392;color:#7a3c00}
    .chip.bad{background:#ffecea;border-color:#ffc8c2;color:#8e150e}
    .btn,.icon-btn{
      min-height:42px;
      border:1px solid var(--line);
      border-radius:12px;
      background:#fff;
      color:var(--text);
      padding:9px 14px;
      font-weight:850;
      display:inline-flex;
      justify-content:center;
      align-items:center;
      gap:8px;
    }
    .btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}
    .btn.soft{background:var(--surface-low)}
    .btn.danger{border-color:#f0b6b6;color:var(--red);background:#fff}
    .btn.full{width:100%}
    .icon-btn{width:42px;padding:0;border-radius:999px}
    .segmented{
      display:inline-flex;
      gap:4px;
      padding:5px;
      border:1px solid var(--line-soft);
      border-radius:999px;
      background:#fff;
    }
    .segmented button{
      min-height:34px;
      border:0;
      border-radius:999px;
      background:transparent;
      padding:7px 12px;
      color:var(--muted);
      font-size:12px;
      font-weight:900;
    }
    .segmented button.active{background:var(--primary);color:#fff}
    .macro-list{display:grid;gap:12px}
    .macro-row{border:1px solid var(--line-soft);border-radius:14px;background:#fff;padding:14px;display:grid;gap:11px}
    .macro-row-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .macro-row .name{font-weight:850}
    .macro-row .main{font-size:24px;line-height:1;font-weight:900;text-align:right}
    .macro-row .main small{display:block;margin-top:5px;color:var(--muted);font-size:12px;font-weight:800}
    .bar{height:8px;border-radius:999px;background:var(--surface-mid);overflow:hidden}
    .bar i{display:block;height:100%;width:min(var(--p),100%);border-radius:999px;background:var(--primary)}
    .bar.carbs i{background:var(--carb)}.bar.protein i{background:var(--protein)}.bar.fat i{background:var(--fat)}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric{border:1px solid var(--line);border-radius:14px;background:#fff;padding:14px;min-height:112px;display:grid;gap:8px;align-content:start}
    .metric .label{color:var(--muted);font-size:12px;font-weight:900}
    .metric .value{font-size:27px;line-height:1;font-weight:900}
    .metric .value small{font-size:13px;color:var(--muted);font-weight:800}
    .field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .field{display:grid;gap:7px}
    .field label{font-size:12px;color:var(--muted);font-weight:900}
    .field input,.field select,.field textarea{
      width:100%;
      min-height:42px;
      border:1px solid var(--line);
      border-radius:12px;
      background:#fff;
      padding:9px 11px;
      outline:none;
    }
    .field textarea{min-height:94px;resize:vertical}
    .field input:focus,.field select:focus,.field textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(0,85,34,.12)}
    .meal-list,.record-list,.inbody-list{display:grid;gap:10px}
    .meal-row,.record-row,.inbody-row{
      border:1px solid var(--line-soft);
      border-radius:14px;
      background:#fff;
      padding:14px;
      display:grid;
      gap:10px;
    }
    .meal-row-top,.record-row-top,.inbody-row-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .record-row.active{border-color:var(--primary);background:#f7fff6}
    .score-wrap{display:grid;justify-items:center;gap:12px}
    .score-ring{
      width:142px;
      aspect-ratio:1;
      border-radius:999px;
      background:conic-gradient(var(--score-color) var(--score), var(--surface-high) 0);
      display:grid;
      place-items:center;
    }
    .score-inner{
      width:108px;
      aspect-ratio:1;
      border-radius:999px;
      background:#fff;
      display:grid;
      place-items:center;
      text-align:center;
      box-shadow:inset 0 0 0 1px var(--line-soft);
    }
    .score-inner b{font-size:34px;line-height:1}
    .empty{border:1px dashed var(--line);border-radius:14px;background:var(--surface-low);padding:24px;display:grid;justify-items:start;gap:10px}
    .recent-page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
    .recent-chart-card,.recent-side-card,.recent-panel{
      background:#fff;
      border:1px solid rgba(191,201,188,.72);
      border-radius:16px;
      box-shadow:var(--soft-shadow);
      padding:18px;
    }
    .recent-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
    .legend-dot{width:10px;height:10px;border-radius:999px;display:inline-block;background:var(--leaf)}
    .legend-dot.target{background:#ff6b6b}
    .calorie-chart{
      position:relative;
      height:240px;
      margin-top:18px;
      padding:0 8px;
      display:flex;
      align-items:end;
      justify-content:space-between;
      gap:clamp(2px,.7vw,6px);
      overflow:hidden;
      border-bottom:1px solid rgba(191,201,188,.45);
    }
    .calorie-grid{position:absolute;inset:0;display:grid;grid-template-rows:repeat(4,1fr);pointer-events:none}
    .calorie-grid i{border-top:1px solid rgba(191,201,188,.22)}
    .calorie-target-line{
      position:absolute;
      left:8px;
      right:8px;
      top:var(--target-top);
      border-top:2px dashed rgba(255,107,107,.7);
      z-index:2;
      pointer-events:none;
    }
    .calorie-bar{
      position:relative;
      z-index:3;
      flex:1;
      min-width:4px;
      max-width:34px;
      height:max(8px,var(--h));
      border-radius:5px 5px 0 0;
      background:rgba(74,140,94,.22);
      transition:.18s;
    }
    .calorie-bar:hover{background:rgba(74,140,94,.46)}
    .chart-labels{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:var(--muted-2);font-size:12px;font-weight:800}
    .nutrient-list{display:grid;gap:15px}
    .nutrient-row{display:grid;gap:7px}
    .nutrient-top{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:850}
    .goal-rate-card{
      position:relative;
      overflow:hidden;
      min-height:158px;
      background:var(--primary);
      color:#fff;
      border-radius:16px;
      padding:18px;
      display:grid;
      align-content:start;
      gap:8px;
    }
    .goal-rate-card:after{
      content:"↗";
      position:absolute;
      right:18px;
      bottom:-34px;
      color:rgba(255,255,255,.12);
      font-size:130px;
      font-weight:900;
      line-height:1;
    }
    .problem-strip{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:14px;
      padding:16px;
      border:1px solid rgba(191,201,188,.62);
      border-radius:14px;
      background:var(--surface-low);
    }
    .problem-main{display:flex;align-items:center;gap:12px}
    .problem-icon{
      width:42px;
      height:42px;
      border-radius:999px;
      display:grid;
      place-items:center;
      background:#ffecea;
      color:var(--red);
      font-weight:900;
    }
    .tag-list{display:flex;flex-wrap:wrap;gap:8px}
    .tag{
      border:1px solid rgba(191,201,188,.72);
      border-radius:10px;
      background:#fff;
      padding:8px 11px;
      color:var(--muted);
      font-size:12px;
      font-weight:850;
    }
    .tag.active{color:var(--primary);border-color:rgba(0,85,34,.24);font-weight:900}
    .insight-card{display:flex;gap:14px;align-items:flex-start}
    .insight-icon{
      width:48px;
      height:48px;
      border-radius:999px;
      background:#fff0ef;
      color:var(--red);
      display:grid;
      place-items:center;
      font-weight:900;
      flex:0 0 auto;
    }
    .insight-icon.neutral{background:#eef3ea;color:var(--muted)}
    .daily-table{width:100%;border-collapse:collapse}
    .daily-table td{padding:15px;border-top:1px solid rgba(191,201,188,.35);vertical-align:middle}
    .daily-table tr:first-child td{border-top:0}
    .daily-table tr:hover{background:var(--surface-low)}
    .daily-score{text-align:right;font-weight:900;font-size:22px;color:var(--primary)}
    .assessment-card{min-height:172px;display:grid;gap:10px;align-content:start}
    .reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .reference-metrics{display:grid;grid-template-columns:1fr 1fr;gap:14px;border-left:1px solid rgba(191,201,188,.45);padding-left:20px}
    .reference-metrics .label{color:var(--muted-2);font-size:11px;font-weight:900}
    .reference-metrics .value{font-size:14px;font-weight:900}
    .modal-root{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(23,33,23,.42);backdrop-filter:blur(7px)}
    .modal-root.open{display:flex}
    .modal{width:min(720px,100%);max-height:88vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.26);padding:20px}
    .modal-head{position:sticky;top:-20px;background:rgba(247,251,241,.96);backdrop-filter:blur(8px);display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:-20px -20px 18px;padding:18px 20px;border-bottom:1px solid var(--line-soft)}
    .toast{position:fixed;left:50%;bottom:22px;z-index:100;transform:translateX(-50%) translateY(20px);background:#172117;color:#fff;border-radius:999px;padding:12px 16px;font-weight:850;opacity:0;pointer-events:none;transition:.2s}
    .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .loading{min-height:60vh;display:grid;place-items:center;text-align:center;color:var(--muted)}
    .report-note{border-left:4px solid var(--amber);background:#fff7e8;padding:12px;border-radius:12px;color:#583900;font-size:13px;line-height:1.55}
    @media (max-width:940px){
      .topbar-inner{grid-template-columns:1fr;gap:8px;padding:12px 0}
      .nav{justify-content:flex-start;gap:18px;overflow:auto}
      .top-actions{justify-content:flex-start}
      .hero{display:grid}
      .span-3,.span-4,.span-5,.span-6,.span-7,.span-8,.span-9,.span-12{grid-column:1/-1}
      .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .recent-page-head,.problem-strip,.reference-grid{display:grid}
      .reference-grid{grid-template-columns:1fr}
      .reference-metrics{border-left:0;border-top:1px solid rgba(191,201,188,.45);padding-left:0;padding-top:18px}
    }
    @media (max-width:620px){
      .topbar-inner,.page{width:min(100% - 24px,var(--max))}
      .field-grid,.metric-grid{grid-template-columns:1fr}
      .hero{padding:18px}
      h1{font-size:24px}
      .section-head{display:grid}
      .macro-row-top,.meal-row-top,.record-row-top,.inbody-row-top{display:grid}
      .daily-table td{display:block;padding:10px 14px;border-top:0}
      .daily-table tr{display:block;border-top:1px solid rgba(191,201,188,.35)}
      .daily-score{text-align:left}
    }
  </style>
</head>
<body>
  <div class="engine-hidden" aria-hidden="true" id="engineMount"></div>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">탄단지 다이어리 <small>Stitch UI</small></div>
      <nav class="nav" aria-label="앱 화면">
        <button type="button" data-tab="today">오늘 계산</button>
        <button type="button" data-tab="records">기록</button>
        <button type="button" data-tab="recent">최근 흐름</button>
        <button type="button" data-tab="inbody">인바디</button>
        <button type="button" data-tab="settings">기본 설정</button>
      </nav>
      <div class="top-actions">
        <button class="btn soft" type="button" data-action="export-full">전체 백업</button>
      </div>
    </div>
  </header>
  <main class="page" id="appRoot">
    <div class="loading"><div><h2>계산기를 준비하고 있습니다.</h2><p>저장된 기준값과 오늘 기록을 불러오는 중입니다.</p></div></div>
  </main>
  <div class="modal-root" id="modalRoot"></div>
  <div class="toast" id="toast"></div>
  <input id="importFile" type="file" accept="application/json,.json" hidden>
  <script id="engineSource" type="application/json">__ENGINE_HTML_JSON__</script>
  <script>
  (() => {
    "use strict";

    const STORAGE_PREFIX = "runstep_macro_v1_";
    const root = document.getElementById("appRoot");
    const modalRoot = document.getElementById("modalRoot");
    const toast = document.getElementById("toast");
    const importFile = document.getElementById("importFile");

    const LABELS = {
      goal: { diet:"다이어트", lean_bulk:"린매스업", bulk:"벌크업" },
      gender: { male:"남성", female:"여성" },
      activity: { sedentary:"낮음", moderate:"보통", active:"활동 많음", very_active:"매우 활동적" },
      work: { office:"앉아서 일함", mixed:"혼합", active:"서서 움직임", field:"현장 활동", heavy_field:"고강도 현장" },
      routine: { REST:"휴식", PUSH:"푸시", PULL:"풀", LEGS:"하체", UPPER:"상체", LOWER:"하체", CHEST:"가슴", BACK:"등", SHOULDER:"어깨", ARM:"팔", ARMS:"팔" },
      cardio: { treadmill_walk:"트레드밀 걷기", treadmill_run:"트레드밀 달리기", outdoor_run:"야외 달리기" },
      adherence: { high:"좋음", medium:"보통", low:"낮음" },
      recordMode: { weight_only:"체중만", simple:"간단 기록", detailed:"상세 기록", mixed:"혼합" },
      fit: { ok:"좋음", medium:"보통", weak:"약함", blocked:"부족" }
    };
    const MEAL_LABELS = ["기상","아침","점심","저녁","간식","야식","술","기타"];
    const ROUTINE_OPTIONS = ["REST","PUSH","PULL","LEGS","UPPER","LOWER","CHEST","BACK","SHOULDER","ARM","ARMS"];
    const DEFAULT_STORAGE = {
      mode:"general",
      weight:75,
      height:173,
      age:32,
      bodyFat:15,
      skeletal:35,
      gender:"male",
      activityLevel:"moderate",
      workType:"heavy_field",
      workAdj:0,
      homeInbody:false,
      expertLbmAlpha:0.75,
      weeklyTrainingDays:3,
      weeklyTrainingDaysManual:false,
      generalAdvancedSettings:false,
      generalLowDigestCarbs:false,
      routinePlan:"ppl_ul",
      routine:"PUSH",
      intensityOverride:0.8,
      weightDuration:60,
      goal:"lean_bulk",
      cardioType:"treadmill_walk",
      cardioDuration:30,
      cardioSpeed:5,
      cardioIncline:8
    };
    const CRITICAL_POSITIVE_STORAGE = new Set(["weight","height","age","bodyFat","skeletal"]);

    const app = {
      ready:false,
      engine:null,
      tab:"today",
      basis:"guide",
      recentDays:28,
      recordDate:null,
      pendingImport:null
    };

    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
    const storageKey = key => STORAGE_PREFIX + key;
    const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
    const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "-";
    const compactDate = value => String(value || "").replaceAll("-", ".");
    const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const progress = (value, total) => {
      const v = Number(value);
      const t = Number(total);
      if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return 0;
      return Math.max(0, Math.min(140, v / t * 100));
    };

    function engineEval(source){
      return app.engine.eval(source);
    }
    function call(name, ...args){
      const fn = app.engine[name] || engineEval(name);
      if (typeof fn !== "function") throw new Error(`engine function missing: ${name}`);
      return fn.apply(app.engine, args);
    }
    function refreshEngine(){
      try { call("loadState"); } catch (_error) {}
      try { engineEval(`uiState.selectedMacroBasis = ${JSON.stringify(app.basis)};`); } catch (_error) {}
      try { call("render"); } catch (_error) {}
    }
    function todayText(){
      try { return call("getTodayDateString"); }
      catch (_error) { return new Date().toISOString().slice(0, 10); }
    }
    function showToast(message){
      toast.textContent = message;
      toast.classList.add("show");
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2300);
    }
    function hasBrokenText(value){
      return /[�]|[?][가-힣]|[?][ㅏ-ㅣㄱ-ㅎ]/.test(String(value || ""));
    }
    function seedDefaultStorage(){
      try {
        Object.entries(DEFAULT_STORAGE).forEach(([key, fallback]) => {
          const stored = localStorage.getItem(storageKey(key));
          const invalidPositive = CRITICAL_POSITIVE_STORAGE.has(key) && (!Number.isFinite(Number(stored)) || Number(stored) <= 0);
          if (stored === null || invalidPositive) localStorage.setItem(storageKey(key), String(fallback));
        });
      } catch (_error) {}
    }

    function bootEngine(){
      seedDefaultStorage();
      const html = JSON.parse(document.getElementById("engineSource").textContent);
      const iframe = document.createElement("iframe");
      iframe.title = "macro engine";
      iframe.srcdoc = html;
      iframe.onload = () => {
        app.engine = iframe.contentWindow;
        app.ready = true;
        refreshEngine();
        render();
      };
      document.getElementById("engineMount").appendChild(iframe);
    }

    function readInbodyRecords(){
      let raw = [];
      try { raw = JSON.parse(localStorage.getItem(storageKey("inbodyRecords")) || "[]"); } catch (_error) {}
      try { return copy(call("normalizeInbodyRecordCollection", raw)).slice().reverse(); }
      catch (_error) { return []; }
    }
    function getSnapshot(){
      refreshEngine();
      const date = todayText();
      const resultRaw = call("calculate");
      const balance = copy(call("getTodayMacroBalance", resultRaw));
      const score = copy(call("getTodayAdherenceScore", resultRaw));
      const todayValues = copy(call("getEffectiveTodayCalculationValues", date));
      const todayRecord = copy(call("getRecordByDate", date)) || { date, meals: [] };
      const records = copy(call("getSortedRecords")) || [];
      const recent = copy(call("buildRecentContext", resultRaw)) || {};
      return {
        date,
        result: copy(resultRaw),
        balance,
        score,
        todayValues,
        todayRecord,
        records,
        recent,
        inbodyRecords: readInbodyRecords()
      };
    }

    function render(){
      if (!app.ready) {
        root.innerHTML = `<div class="loading"><div><h2>계산기를 준비하고 있습니다.</h2><p>저장된 기준값과 오늘 기록을 불러오는 중입니다.</p></div></div>`;
        return;
      }
      let html = "";
      try {
        const snapshot = getSnapshot();
        if (!app.recordDate) app.recordDate = snapshot.date;
        html = {
          today: renderToday(snapshot),
          records: renderRecords(snapshot),
          recent: renderRecent(snapshot),
          inbody: renderInbody(snapshot),
          settings: renderSettings(snapshot)
        }[app.tab] || renderToday(snapshot);
      } catch (error) {
        html = `<section class="card"><span class="kicker">Error</span><h2>계산 연결을 확인해야 합니다.</h2><p class="muted">${esc(error.message || error)}</p></section>`;
      }
      root.innerHTML = html;
      $$("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === app.tab));
    }

    function coachCopy(snapshot){
      const meals = snapshot.todayRecord?.meals || [];
      if (!meals.length) return { title:"오늘 식사를 먼저 기록해주세요.", body:"식사를 입력하면 목표 탄단지, 점수, 최근 흐름을 기준으로 오늘 보완점을 계산합니다." };
      try {
        const signals = call("getDailyCoachSignals", {
          currentResult: snapshot.result,
          balance: snapshot.balance,
          state: snapshot.result.s,
          recentContext: snapshot.recent
        });
        const decisions = copy(call("selectDailyCoachDecisions", signals)) || [];
        const first = decisions[0] || {};
        const key = first.key || first.copyIntent || "";
        const status = first.status || first.signal?.status || "";
        const map = {
          calorie:{ low:"총 섭취량이 목표보다 낮습니다.", high:"총 섭취량이 목표보다 높습니다.", ok:"총 섭취량 흐름이 안정적입니다." },
          protein:{ low:"단백질을 먼저 보완하면 좋습니다.", high:"단백질은 충분합니다. 나머지 균형을 보세요.", ok:"단백질 흐름이 좋습니다." },
          carb:{ low:"탄수화물이 부족해 훈련 에너지가 낮을 수 있습니다.", high:"탄수화물 초과 흐름을 확인하세요.", ok:"탄수화물 흐름이 안정적입니다." },
          fat:{ low:"지방 섭취가 낮습니다.", high:"지방 초과를 줄이면 균형이 좋아집니다.", ok:"지방 흐름이 안정적입니다." },
          dataQuality:{ low:"기록 보완이 먼저입니다.", high:"기록 보완이 먼저입니다." }
        };
        const title = map[key]?.[status] || map[key]?.low || "오늘 보완 항목을 확인하세요.";
        return { title, body:"오늘 기록과 최근 흐름을 바탕으로 지금 먼저 볼 항목을 정리했습니다." };
      } catch (_error) {
        return { title:"오늘 목표와 기록을 비교 중입니다.", body:"목표 탄단지와 섭취량 차이를 기준으로 보완 항목을 확인하세요." };
      }
    }

    function macroCard(key, label, consumed, target, unit){
      const className = key === "carbs" ? "carbs" : key === "protein" ? "protein" : key === "fat" ? "fat" : "";
      const left = Number(target) - Number(consumed);
      return `
        <div class="macro-row">
          <div class="macro-row-top">
            <div>
              <div class="name">${label}</div>
              <div class="fine">${Number.isFinite(left) ? (left >= 0 ? `${fmt(left, unit === "g" ? 1 : 0)}${unit} 남음` : `${fmt(Math.abs(left), unit === "g" ? 1 : 0)}${unit} 초과`) : "계산 대기"}</div>
            </div>
            <div class="main">${fmt(consumed, unit === "g" ? 1 : 0)}<small>${unit} / ${fmt(target, unit === "g" ? 1 : 0)}${unit}</small></div>
          </div>
          <div class="bar ${className}"><i style="--p:${progress(consumed, target)}%"></i></div>
        </div>
      `;
    }
    function mealEnergy(meal){ try { return copy(call("calculateMealEnergy", meal)); } catch (_error) { return { totalKcal:(Number(meal.carbs)||0)*4 + (Number(meal.protein)||0)*4 + (Number(meal.fat)||0)*9 + (Number(meal.alcoholKcal)||0) + (Number(meal.otherKcal)||0) }; } }
    function mealRow(meal, index, date){
      const energy = mealEnergy(meal);
      const memo = meal.memo ? `<span class="fine"> · ${esc(meal.memo)}</span>` : "";
      return `
        <div class="meal-row">
          <div class="meal-row-top">
            <div>
              <h3>${esc(meal.mealLabel || "식사")}${memo}</h3>
              <div class="fine">탄 ${fmt(meal.carbs,1)}g · 단 ${fmt(meal.protein,1)}g · 지 ${fmt(meal.fat,1)}g${Number(meal.alcoholKcal) ? ` · 술 ${fmt(meal.alcoholKcal)}kcal` : ""}${Number(meal.otherKcal) ? ` · 기타 ${fmt(meal.otherKcal)}kcal` : ""}</div>
            </div>
            <b>${fmt(energy.totalKcal)}kcal</b>
          </div>
          <div class="chip-row">
            <button class="btn soft" type="button" data-action="edit-meal" data-date="${esc(date)}" data-index="${index}">수정</button>
            <button class="btn danger" type="button" data-action="delete-meal" data-date="${esc(date)}" data-index="${index}">삭제</button>
          </div>
        </div>
      `;
    }

    function renderToday(snapshot){
      const { result, balance, score, todayValues, todayRecord } = snapshot;
      const meals = todayRecord?.meals || [];
      const consumed = balance.consumed || {};
      const target = balance.target || {};
      const coach = coachCopy(snapshot);
      const scorePercent = Number.isFinite(score?.percent) ? score.percent : null;
      const basisLabel = app.basis === "activity" ? "활동량 기준" : "가이드 기준";
      return `
        <section class="stack">
          <section class="hero">
            <div class="stack-sm">
              <span class="eyebrow">Today</span>
              <h1>${esc(coach.title)}</h1>
              <p class="muted">${esc(coach.body)}</p>
              <div class="chip-row">
                <span class="chip">${compactDate(snapshot.date)}</span>
                <span class="chip">${LABELS.goal[result.s?.goal] || result.s?.goal || "목표"}</span>
                <span class="chip soft">${basisLabel}</span>
                <span class="chip">목표 ${fmt(result.targetCal)}kcal</span>
              </div>
            </div>
            <button class="btn primary" type="button" data-action="open-meal" data-date="${esc(snapshot.date)}">식사 추가하기</button>
          </section>
          <div class="grid">
            <div class="span-8 stack">
              <section class="card">
                <div class="section-head">
                  <div><span class="kicker">결과</span><h2>오늘 목표 섭취량</h2></div>
                  <div class="segmented">
                    <button type="button" data-action="basis" data-basis="guide" class="${app.basis === "guide" ? "active" : ""}">가이드 기준</button>
                    <button type="button" data-action="basis" data-basis="activity" class="${app.basis === "activity" ? "active" : ""}">활동량 기준</button>
                  </div>
                </div>
                <div class="macro-list">
                  ${macroCard("kcal","목표 칼로리", consumed.scoringKcal ?? consumed.totalKcal ?? consumed.kcal ?? 0, target.kcal ?? result.targetCal, "kcal")}
                  ${macroCard("carbs","탄수화물", consumed.carbs ?? 0, target.carbs ?? result.carbs, "g")}
                  ${macroCard("protein","단백질", consumed.protein ?? 0, target.protein ?? result.protein, "g")}
                  ${macroCard("fat","지방", consumed.fat ?? 0, target.fat ?? result.fat, "g")}
                </div>
              </section>
              <section class="card">
                <div class="section-head">
                  <div><span class="kicker">오늘의 식사</span><h2>식사 ${meals.length}건 기록됨</h2></div>
                  <button class="btn primary" type="button" data-action="open-meal" data-date="${esc(snapshot.date)}">식사 추가</button>
                </div>
                ${meals.length ? `<div class="meal-list">${meals.map((meal, index) => mealRow(meal, index, snapshot.date)).join("")}</div>` : `
                  <div class="empty">
                    <span class="chip soft">식사 없음</span>
                    <h3>아직 오늘 식사 기록이 없습니다.</h3>
                    <p class="muted">식사를 기록하면 점수와 코치 카드가 자동으로 갱신됩니다.</p>
                    <button class="btn primary" type="button" data-action="open-meal" data-date="${esc(snapshot.date)}">기록 시작하기</button>
                  </div>`}
              </section>
            </div>
            <aside class="span-4 stack">
              <section class="card">
                <span class="kicker">오늘의 코치</span>
                <h2>${esc(coach.title)}</h2>
                <p class="muted" style="margin-top:10px">${esc(coach.body)}</p>
              </section>
              <section class="card">
                <div class="section-head"><div><span class="kicker">Score</span><h2>오늘의 식단 점수</h2></div></div>
                <div class="score-wrap">
                  <div class="score-ring" style="--score:${scorePercent ?? 0}%;--score-color:${scorePercent === null ? "#bfc9bc" : scorePercent >= 85 ? "#005522" : scorePercent >= 70 ? "#ffb100" : "#ba1a1a"}">
                    <div class="score-inner"><b>${scorePercent ?? "-"}</b><span class="fine">점</span></div>
                  </div>
                  <span class="chip ${scorePercent === null ? "" : scorePercent >= 85 ? "soft" : scorePercent >= 70 ? "warn" : "bad"}">${esc(score?.label || "미기록")}</span>
                  <p class="muted" style="text-align:center">${esc(hasBrokenText(score?.summaryText) ? "식사를 기록하면 점수가 계산됩니다." : (score?.summaryText || "식사를 기록하면 점수가 계산됩니다."))}</p>
                </div>
              </section>
            </aside>
            <section class="span-12 card">
              <div class="section-head">
                <div><span class="kicker">Today</span><h2>오늘 계산값</h2><p class="muted">오늘만 바뀌는 몸 상태와 운동값입니다.</p></div>
                <button class="btn" type="button" data-tab="settings">전체 설정</button>
              </div>
              <div class="grid">
                <div class="span-4 stack-sm">
                  <h3>신체 정보</h3>
                  <div class="field-grid">
                    ${field("계산용 체중","number","calculationWeight",todayValues.calculationWeight,"kg","today")}
                    ${field("골격근량","number","skeletalMuscle",todayValues.skeletalMuscle,"kg","today")}
                    ${field("체지방량","number","bodyFatMass",todayValues.bodyFatMass,"kg","today")}
                    ${field("체지방률","number","bodyFatPercent",todayValues.bodyFatPercent,"%","today")}
                  </div>
                  <button class="btn soft" type="button" data-action="apply-latest-inbody">최신 InBody 적용</button>
                </div>
                <div class="span-4 stack-sm">
                  <h3>생활 패턴 / 운동</h3>
                  <div class="field-grid">
                    ${select("활동량","todayActivityLevel",todayValues.todayActivityLevel,LABELS.activity,"today")}
                    ${select("업무 유형","todayWorkType",todayValues.todayWorkType,LABELS.work,"today")}
                    ${select("루틴","todayRoutineSession",todayValues.todayRoutineSession,Object.fromEntries(ROUTINE_OPTIONS.map(key => [key, LABELS.routine[key] || key])),"today")}
                    ${field("웨이트 시간","number","todayWeightDuration",todayValues.todayWeightDuration,"분","today")}
                  </div>
                </div>
                <div class="span-4 stack-sm">
                  <h3>오늘 유산소</h3>
                  <div class="field-grid">
                    ${select("유산소 종류","todayCardioType",todayValues.todayCardioType,LABELS.cardio,"today")}
                    ${field("시간","number","todayCardioDuration",todayValues.todayCardioDuration,"분","today")}
                    ${field("속도","number","todayCardioSpeed",todayValues.todayCardioSpeed,"km/h","today")}
                    ${field("경사도","number","todayCardioIncline",todayValues.todayCardioIncline,"%","today")}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      `;
    }

    function renderRecords(snapshot){
      const records = snapshot.records.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const selectedDate = app.recordDate || snapshot.date;
      const selected = records.find(record => record.date === selectedDate) || (selectedDate === snapshot.date ? snapshot.todayRecord : null) || { date:selectedDate, meals:[] };
      const meals = selected.meals || [];
      return `
        <section class="stack">
          <section class="hero">
            <div class="stack-sm">
              <span class="eyebrow">Records</span>
              <h1>날짜별 식사와 체중 기록</h1>
              <p class="muted">날짜별 식사, 체중, 메모를 한 화면에서 확인하고 수정합니다.</p>
              <div class="chip-row"><span class="chip">총 ${records.length}일</span><span class="chip soft">선택 ${compactDate(selectedDate)}</span></div>
            </div>
            <button class="btn primary" type="button" data-action="open-record-info" data-date="${esc(selectedDate)}">기록 정보 수정</button>
          </section>
          <div class="grid">
            <aside class="span-4 card">
              <div class="section-head"><div><span class="kicker">Archive</span><h2>기록 목록</h2></div></div>
              <div class="record-list">
                ${records.length ? records.map(record => `
                  <button class="record-row ${record.date === selectedDate ? "active" : ""}" type="button" data-action="select-record" data-date="${esc(record.date)}">
                    <div class="record-row-top">
                      <div><h3>${compactDate(record.date)}</h3><div class="fine">${LABELS.recordMode[record.recordMode] || record.recordMode || "기록"} · 식사 ${(record.meals || []).length}건</div></div>
                      <b>${Number.isFinite(record.adherencePercent) ? `${fmt(record.adherencePercent)}점` : (LABELS.adherence[record.adherence] || "")}</b>
                    </div>
                  </button>`).join("") : `<div class="empty"><h3>저장된 기록이 없습니다.</h3><p class="muted">오늘 식사를 추가하면 자동으로 기록이 생깁니다.</p></div>`}
              </div>
            </aside>
            <section class="span-8 stack">
              <section class="card">
                <div class="section-head">
                  <div><span class="kicker">Detail</span><h2>${compactDate(selectedDate)} 기록</h2><p class="muted">체중 ${Number.isFinite(selected.weight) ? `${fmt(selected.weight,1)}kg` : "미입력"} · ${esc(selected.note || "메모 없음")}</p></div>
                  <div class="chip-row">
                    <button class="btn primary" type="button" data-action="open-meal" data-date="${esc(selectedDate)}">식사 추가</button>
                    <button class="btn soft" type="button" data-action="open-record-info" data-date="${esc(selectedDate)}">정보 수정</button>
                    <button class="btn danger" type="button" data-action="delete-record" data-date="${esc(selectedDate)}">기록 삭제</button>
                  </div>
                </div>
                ${meals.length ? `<div class="meal-list">${meals.map((meal, index) => mealRow(meal, index, selectedDate)).join("")}</div>` : `<div class="empty"><h3>이 날짜에는 식사 기록이 없습니다.</h3><button class="btn primary" type="button" data-action="open-meal" data-date="${esc(selectedDate)}">식사 추가</button></div>`}
              </section>
            </section>
          </div>
        </section>
      `;
    }

    function renderRecent(snapshot){
      const windowData = snapshot.recent?.windows?.[app.recentDays] || {};
      const bars = (windowData.records || []).slice(-28).map(record => {
        const value = Number(record.autoAdherenceValue ?? record.adherencePercent ?? 0);
        const height = Number.isFinite(value) ? Math.max(8, Math.min(100, value)) : 8;
        const cls = height >= 85 ? "" : height >= 70 ? "mid" : "low";
        return `<div class="chart-bar ${cls}" title="${esc(record.date)} ${fmt(value)}점" style="--h:${height}%"></div>`;
      }).join("");
      return `
        <section class="stack">
          <section class="hero">
            <div class="stack-sm">
              <span class="eyebrow">Recent Flow</span>
              <h1>최근 흐름</h1>
              <p class="muted">최근 기록을 기간별로 묶어 식단과 체중 흐름을 확인합니다.</p>
              <div class="chip-row"><span class="chip">${windowData.startDate || "-"} ~ ${windowData.endDate || "-"}</span><span class="chip soft">강도 ${LABELS.fit[windowData.contextFit] || windowData.contextFit || "대기"}</span></div>
            </div>
            <div class="segmented">
              ${[3,7,14,28].map(days => `<button type="button" data-action="recent-range" data-days="${days}" class="${app.recentDays === days ? "active" : ""}">${days}일</button>`).join("")}
            </div>
          </section>
          <div class="grid">
            <section class="span-8 card">
              <div class="section-head"><div><span class="kicker">Trend</span><h2>${app.recentDays}일 식단 점수 흐름</h2></div></div>
              <div class="chart">${bars || `<div class="muted">표시할 기록이 아직 부족합니다.</div>`}</div>
            </section>
            <aside class="span-4 stack">
              <section class="card">
                <div class="metric-grid" style="grid-template-columns:1fr 1fr">
                  ${metric("식단 기록일", windowData.usableDietDays, "일")}
                  ${metric("체중 기록일", windowData.weightDays, "일")}
                  ${metric("상세 점수일", windowData.detailedAutoScoreDays, "일")}
                  ${metric("술 기록일", windowData.alcoholDays, "일")}
                </div>
              </section>
              <section class="card">
                <span class="kicker">Summary</span>
                <h2>분석 신뢰도 ${LABELS.fit[windowData.recordConfidence] || windowData.recordConfidence || "대기"}</h2>
                <p class="muted" style="margin-top:10px">기간, 상세 기록 비율, 목표 기준 보유 여부를 함께 보고 신뢰도를 판단합니다.</p>
              </section>
            </aside>
          </div>
        </section>
      `;
    }

    function recentNumber(value){
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    function recentAverage(values){
      const usable = values.map(recentNumber).filter(value => value !== null);
      if (!usable.length) return null;
      return usable.reduce((sum, value) => sum + value, 0) / usable.length;
    }
    function recentDisplay(value, digits = 0, unit = ""){
      const number = recentNumber(value);
      return number === null ? "-" : `${fmt(number, digits)}${unit}`;
    }
    function recentScoreValue(record){
      const auto = recentNumber(record?.autoAdherenceValue);
      const hasUsableTarget = [record?.targetCal, record?.targetCarbs, record?.targetProtein, record?.targetFat].some(value => {
        const number = recentNumber(value);
        return number !== null && number > 0;
      });
      if (auto !== null && hasUsableTarget && (record?.hasGoalSnapshot || record?.hasDetailedGoalSnapshot || record?.componentEligible || record?.adherenceSource === "auto")) return auto;
      const percent = recentNumber(record?.adherencePercent);
      if (percent !== null && (hasUsableTarget || percent > 0)) return percent;
      const manual = record?.manualAdherenceValue || record?.adherence;
      if (manual === "high") return 90;
      if (manual === "medium") return 70;
      if (manual === "low") return 45;
      return null;
    }
    function recentRecords(windowData){
      return (windowData.records || []).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }
    function recentMacroAverages(records){
      const dietRecords = records.filter(record => record.hasMeals || record.usableDietDay || recentNumber(record.totalKcal) !== null);
      return {
        kcal: recentAverage(dietRecords.map(record => record.totalKcal)),
        targetKcal: recentAverage(dietRecords.map(record => record.targetCal)),
        carbs: recentAverage(dietRecords.map(record => record.carbs)),
        targetCarbs: recentAverage(dietRecords.map(record => record.targetCarbs)),
        protein: recentAverage(dietRecords.map(record => record.protein)),
        targetProtein: recentAverage(dietRecords.map(record => record.targetProtein)),
        fat: recentAverage(dietRecords.map(record => record.fat)),
        targetFat: recentAverage(dietRecords.map(record => record.targetFat)),
        score: recentAverage(records.map(recentScoreValue))
      };
    }
    function nutrientRow(label, value, target, className){
      const pct = target && recentNumber(target) > 0 && recentNumber(value) !== null ? progress(value, target) : 0;
      return `
        <div class="nutrient-row">
          <div class="nutrient-top">
            <span>${esc(label)}</span>
            <span>${recentDisplay(value, 0, "g")} <small class="fine">/ ${recentDisplay(target, 0, "g")}</small></span>
          </div>
          <div class="bar ${esc(className)}"><i style="--p:${pct}%"></i></div>
        </div>
      `;
    }
    function recentChartLabels(records){
      if (!records.length) return "";
      const points = records.length <= 7
        ? records.map((_, index) => index)
        : [0, Math.floor((records.length - 1) / 2), records.length - 1];
      return [...new Set(points)].map(index => `<span>${compactDate(records[index].date)}</span>`).join("");
    }
    function recentChart(records, averages){
      if (!records.length) {
        return `<div class="calorie-chart"><div class="calorie-grid"><i></i><i></i><i></i><i></i></div><div class="empty" style="align-self:center;width:100%">표시할 최근 기록이 아직 부족합니다.</div></div>`;
      }
      const values = records.flatMap(record => [record.totalKcal, record.targetCal]).map(recentNumber).filter(value => value !== null && value > 0);
      const maxValue = Math.max(1, ...values);
      const scale = maxValue * 1.15;
      const targetTop = averages.targetKcal ? Math.max(6, Math.min(92, 100 - (averages.targetKcal / scale * 100))) : -20;
      const bars = records.map(record => {
        const kcal = recentNumber(record.totalKcal) || 0;
        const recordTarget = recentNumber(record.targetCal);
        const target = recordTarget && recordTarget > 0 ? recordTarget : recentNumber(averages.targetKcal);
        const height = Math.max(3, Math.min(100, kcal / scale * 100));
        const title = `${record.date || ""} 섭취 ${fmt(kcal)}kcal${target ? ` / 목표 ${fmt(target)}kcal` : ""}`;
        return `<div class="calorie-bar" title="${esc(title)}" style="--h:${height}%"></div>`;
      }).join("");
      return `
        <div class="calorie-chart">
          <div class="calorie-grid"><i></i><i></i><i></i><i></i></div>
          ${averages.targetKcal ? `<div class="calorie-target-line" style="--target-top:${targetTop}%"></div>` : ""}
          ${bars}
        </div>
        <div class="chart-labels">${recentChartLabels(records)}</div>
      `;
    }
    function recentProblemCounts(windowData){
      return {
        protein: Math.max(Number(windowData.proteinLowDays) || 0, Number(windowData.proteinSevereLowDays) || 0),
        carb: (Number(windowData.carbLowTrainingDays) || 0) + (Number(windowData.carbLowRestDays) || 0),
        fat: Number(windowData.fatHighDays) || 0,
        alcohol: Number(windowData.alcoholDays) || 0,
        other: Number(windowData.otherKcalHeavyDays) || 0
      };
    }
    function recordIssueLabel(record){
      const protein = recentNumber(record.protein);
      const targetProtein = recentNumber(record.targetProtein);
      if (targetProtein && protein !== null && protein < targetProtein * 0.9) return "단백질";
      const carbs = recentNumber(record.carbs);
      const targetCarbs = recentNumber(record.targetCarbs);
      if (targetCarbs && carbs !== null && carbs < targetCarbs * 0.85) return "탄수";
      const fat = recentNumber(record.fat);
      const targetFat = recentNumber(record.targetFat);
      if (targetFat && fat !== null && fat > targetFat * 1.25) return "고지방";
      if ((recentNumber(record.alcoholKcal) || 0) > 0) return "술";
      const score = recentScoreValue(record);
      if (score !== null && score < 70) return "점수";
      return "";
    }
    function recentTags(records, counts){
      const tags = [`<span class="tag">관련 날짜</span>`];
      if (counts.protein) tags.push(`<span class="tag active">단백질 부족 ${counts.protein}일</span>`);
      if (counts.carb) tags.push(`<span class="tag active">탄수 부족 ${counts.carb}일</span>`);
      if (counts.fat) tags.push(`<span class="tag active">고지방 ${counts.fat}일</span>`);
      if (counts.alcohol) tags.push(`<span class="tag active">술 영향 ${counts.alcohol}일</span>`);
      records.slice().reverse().forEach(record => {
        const issue = recordIssueLabel(record);
        if (issue && tags.length < 10) tags.push(`<button class="tag" type="button" data-action="open-record-date" data-date="${esc(record.date)}">${compactDate(record.date)} ${esc(issue)}</button>`);
      });
      if (tags.length === 1) tags.push(`<span class="tag active">특이 경고 없음</span>`);
      return tags.join("");
    }
    function recentDailyRows(records, fallbackTargets = {}){
      const rows = records.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
      if (!rows.length) return `<tr><td colspan="5"><div class="empty">최근 기록이 쌓이면 날짜별 요약이 표시됩니다.</div></td></tr>`;
      return rows.map(record => {
        const score = recentScoreValue(record);
        const mode = LABELS.recordMode[record.recordMode] || record.recordMode || "기록";
        const recordTargetCal = recentNumber(record.targetCal);
        const targetCal = recordTargetCal && recordTargetCal > 0 ? recordTargetCal : recentNumber(fallbackTargets.targetKcal);
        return `
          <tr>
            <td>
              <b>${compactDate(record.date)}</b>
              <div class="fine">${esc(mode)} · 식사 ${Number(record.mealCount) || (record.hasMeals ? 1 : 0)}건</div>
            </td>
            <td>${recentDisplay(record.totalKcal, 0, "kcal")} <div class="fine">목표 ${recentDisplay(targetCal, 0, "kcal")}</div></td>
            <td>탄 ${recentDisplay(record.carbs, 0, "g")} · 단 ${recentDisplay(record.protein, 0, "g")} · 지 ${recentDisplay(record.fat, 0, "g")}</td>
            <td class="daily-score">${score === null ? "-" : `${fmt(score)}%`}</td>
            <td><button class="btn soft" type="button" data-action="open-record-date" data-date="${esc(record.date)}">열기</button></td>
          </tr>
        `;
      }).join("");
    }
    function recentAssessmentCards(snapshot){
      return [3, 7, 14, 28].map(days => {
        const data = snapshot.recent?.windows?.[days] || {};
        const rows = recentRecords(data);
        const score = recentAverage(rows.map(recentScoreValue));
        const fit = LABELS.fit[data.recordConfidence] || data.recordConfidence || "대기";
        return `
          <section class="span-3 recent-side-card assessment-card">
            <span class="kicker">${days}일</span>
            <h3>${score === null ? "-" : `${fmt(score)}%`}</h3>
            <p class="muted">식단 기록 ${Number(data.usableDietDays) || 0}일 · 체중 기록 ${Number(data.weightDays) || 0}일</p>
            <span class="chip soft">신뢰도 ${esc(fit)}</span>
          </section>
        `;
      }).join("");
    }
    function renderRecent(snapshot){
      const windowData = snapshot.recent?.windows?.[app.recentDays] || {};
      const records = recentRecords(windowData);
      const averages = recentMacroAverages(records);
      const fallbackTargets = {
        targetKcal: recentNumber(snapshot.balance?.target?.kcal) ?? recentNumber(snapshot.result?.targetCal),
        targetCarbs: recentNumber(snapshot.balance?.target?.carbs) ?? recentNumber(snapshot.result?.carbs),
        targetProtein: recentNumber(snapshot.balance?.target?.protein) ?? recentNumber(snapshot.result?.protein),
        targetFat: recentNumber(snapshot.balance?.target?.fat) ?? recentNumber(snapshot.result?.fat)
      };
      if (!(averages.targetKcal > 0)) averages.targetKcal = fallbackTargets.targetKcal;
      if (!(averages.targetCarbs > 0)) averages.targetCarbs = fallbackTargets.targetCarbs;
      if (!(averages.targetProtein > 0)) averages.targetProtein = fallbackTargets.targetProtein;
      if (!(averages.targetFat > 0)) averages.targetFat = fallbackTargets.targetFat;
      const counts = recentProblemCounts(windowData);
      const issueParts = [
        counts.protein ? `단백질 부족 ${counts.protein}일` : "",
        counts.carb ? `탄수 부족 ${counts.carb}일` : "",
        counts.fat ? `고지방 ${counts.fat}일` : "",
        counts.alcohol ? `술 영향 ${counts.alcohol}일` : ""
      ].filter(Boolean);
      const issueTitle = issueParts[0] || "특이 경고 없음";
      const issueSub = issueParts.slice(1).join(" · ") || "기록이 쌓이면 부족/초과 흐름을 자동으로 묶어 보여줍니다.";
      const confidence = LABELS.fit[windowData.recordConfidence] || windowData.recordConfidence || "대기";
      const contextFit = LABELS.fit[windowData.contextFit] || windowData.contextFit || "대기";
      const firstIssueRecord = records.slice().reverse().find(record => recordIssueLabel(record)) || records[records.length - 1] || null;
      const scoreCopy = averages.score === null ? "최근 점수는 아직 계산 대기 중입니다." : (averages.score >= 82 ? "좋은 흐름입니다. 지금 패턴을 유지해도 됩니다." : "흐름을 더 다듬어 보세요.");
      const topAction = counts.protein ? "다음 식사에서 단백질을 먼저 보강하세요." : counts.carb ? "운동 전후 탄수화물 배치를 확인하세요." : counts.fat ? "지방이 높은 식사를 한 번 줄여보세요." : "현재 기록 흐름을 유지하면서 누락된 날짜만 보완하세요.";
      return `
        <section class="stack">
          <section class="recent-page-head">
            <div class="stack-sm">
              <span class="eyebrow">나를 위한 영양 코치</span>
              <h1>최근 기록 흐름과 오늘 행동 기준</h1>
              <p class="muted">최근 기록을 기간별로 묶어 섭취, 목표, 점수, 부족 패턴을 한 번에 확인합니다.</p>
              <div class="chip-row">
                <span class="chip">${windowData.startDate || "-"} ~ ${windowData.endDate || "-"}</span>
                <span class="chip soft">분석 신뢰도 ${esc(confidence)}</span>
              </div>
            </div>
            <div class="segmented">
              ${[3,7,14,28].map(days => `<button type="button" data-action="recent-range" data-days="${days}" class="${app.recentDays === days ? "active" : ""}">${days}일</button>`).join("")}
            </div>
          </section>

          <div class="grid">
            <section class="span-8 recent-chart-card">
              <div class="section-head">
                <div>
                  <h2>칼로리 및 체중 변화</h2>
                  <p class="muted">최근 ${app.recentDays}일간의 에너지 밸런스</p>
                </div>
                <div class="recent-legend">
                  <span class="fine"><i class="legend-dot"></i> 섭취 (kcal)</span>
                  <span class="fine"><i class="legend-dot target"></i> 목표 (kcal)</span>
                </div>
              </div>
              ${recentChart(records, averages)}
            </section>
            <aside class="span-4 stack">
              <section class="recent-side-card">
                <h2>평균 영양 섭취</h2>
                <div class="nutrient-list" style="margin-top:16px">
                  ${nutrientRow("탄수화물", averages.carbs, averages.targetCarbs, "carbs")}
                  ${nutrientRow("단백질", averages.protein, averages.targetProtein, "protein")}
                  ${nutrientRow("지방", averages.fat, averages.targetFat, "fat")}
                </div>
              </section>
              <section class="goal-rate-card">
                <p class="fine">목표 달성률</p>
                <h3>${averages.score === null ? "-" : `${fmt(averages.score)}%`}</h3>
                <p>${esc(scoreCopy)}<br><span style="opacity:.72;font-size:13px">최근 기록을 기준으로 보수적으로 해석합니다.</span></p>
              </section>
            </aside>
          </div>

          <section class="stack-sm">
            <div class="problem-strip">
              <div class="problem-main">
                <span class="problem-icon">!</span>
                <div>
                  <p class="fine">현재 확인된 기록</p>
                  <h2>${esc(issueTitle)} <span class="muted" style="font-size:14px;font-weight:700">${esc(issueSub)}</span></h2>
                </div>
              </div>
              ${firstIssueRecord ? `<button class="btn soft" type="button" data-action="open-record-date" data-date="${esc(firstIssueRecord.date)}">문제 날짜 보기</button>` : `<button class="btn soft" type="button" disabled>문제 날짜 보기</button>`}
            </div>
            <div class="tag-list">${recentTags(records, counts)}</div>
          </section>

          <div class="grid">
            <section class="span-6 recent-panel insight-card">
              <span class="insight-icon">!</span>
              <div>
                <span class="kicker">핵심 패턴</span>
                <h2>${esc(issueTitle)}</h2>
                <p class="muted">${esc(topAction)}</p>
              </div>
            </section>
            <section class="span-6 recent-panel insight-card">
              <span class="insight-icon neutral">%</span>
              <div>
                <span class="kicker">기록 품질</span>
                <h2>${Number(windowData.usableDietDays) || 0}일 식단 · ${Number(windowData.weightDays) || 0}일 체중</h2>
                <p class="muted">기간 적합도 ${esc(contextFit)} · 자동 점수 ${Number(windowData.detailedAutoScoreDays) || 0}일</p>
              </div>
            </section>
          </div>

          <section class="recent-panel" style="padding:0;overflow:hidden">
            <div class="section-head" style="padding:16px 18px;border-bottom:1px solid rgba(191,201,188,.35)">
              <h2>일간 기록 요약</h2>
              <span class="fine">최근 기록을 날짜별로 열어볼 수 있습니다.</span>
            </div>
            <table class="daily-table"><tbody>${recentDailyRows(records, fallbackTargets)}</tbody></table>
          </section>

          <div class="grid">${recentAssessmentCards(snapshot)}</div>

          <section class="recent-panel">
            <div class="section-head">
              <div>
                <h2>${app.recentDays}일 참고 분석</h2>
                <p class="muted">기록 품질과 실행률이 충분할 때만 설정 조정 후보를 확인합니다.</p>
              </div>
            </div>
            <div class="reference-grid">
              <div class="stack-sm">
                <div class="recent-side-card" style="box-shadow:none;background:var(--surface-low)">
                  <p class="fine">이번 기간 기록 상태</p>
                  <h3>${esc(topAction)}</h3>
                </div>
                <p class="muted">최근 기록에 기반한 참고값입니다. 설정을 조정하기 전 누락 날짜와 특이 식사를 먼저 확인하세요.</p>
              </div>
              <div class="reference-metrics">
                <div><div class="label">평균 섭취</div><div class="value">${recentDisplay(averages.kcal, 0, "kcal")}</div></div>
                <div><div class="label">평균 목표</div><div class="value">${recentDisplay(averages.targetKcal, 0, "kcal")}</div></div>
                <div><div class="label">식단 기록</div><div class="value">${Number(windowData.usableDietDays) || 0}일</div></div>
                <div><div class="label">분석 강도</div><div class="value">${esc(confidence)}</div></div>
              </div>
            </div>
          </section>
        </section>
      `;
    }

    function renderInbody(snapshot){
      const records = snapshot.inbodyRecords;
      const latest = records[0];
      return `
        <section class="stack">
          <section class="hero">
            <div class="stack-sm">
              <span class="eyebrow">InBody</span>
              <h1>체성분 기록</h1>
              <p class="muted">측정값을 기록하고 최신 체성분을 오늘 계산에 바로 반영합니다.</p>
              <div class="chip-row"><span class="chip">총 ${records.length}건</span>${latest ? `<span class="chip soft">최신 ${compactDate(latest.date)}</span>` : ""}</div>
            </div>
            <button class="btn primary" type="button" data-action="open-inbody">InBody 입력</button>
          </section>
          <div class="grid">
            <section class="span-8 card">
              <div class="section-head"><div><span class="kicker">History</span><h2>측정 기록</h2></div></div>
              <div class="inbody-list">
                ${records.length ? records.map((record, index) => `
                  <div class="inbody-row">
                    <div class="inbody-row-top">
                      <div><h3>${compactDate(record.date)}</h3><div class="fine">체중 ${fmt(record.weight,1)}kg · 골격근 ${fmt(record.skeletalMuscle,1)}kg · 체지방률 ${fmt(record.bodyFatPercent,1)}%</div></div>
                      <button class="btn soft" type="button" data-action="apply-inbody" data-index="${index}">Today 적용</button>
                    </div>
                  </div>`).join("") : `<div class="empty"><h3>InBody 기록이 없습니다.</h3><p class="muted">첫 측정값을 입력하면 Today 계산값에 적용할 수 있습니다.</p></div>`}
              </div>
            </section>
            <aside class="span-4 card">
              <span class="kicker">Latest</span>
              ${latest ? `<div class="metric-grid" style="grid-template-columns:1fr 1fr;margin-top:12px">
                ${metric("체중", latest.weight, "kg", 1)}
                ${metric("골격근량", latest.skeletalMuscle, "kg", 1)}
                ${metric("체지방량", latest.bodyFat, "kg", 1)}
                ${metric("체지방률", latest.bodyFatPercent, "%", 1)}
              </div>` : `<p class="muted" style="margin-top:10px">표시할 최신 측정값이 없습니다.</p>`}
            </aside>
          </div>
        </section>
      `;
    }

    function renderSettings(snapshot){
      const s = snapshot.result.s || {};
      const alphaPercent = Math.round(Number(s.expertLbmAlpha ?? 0.75) * 100);
      return `
        <section class="stack">
          <section class="hero">
            <div class="stack-sm">
              <span class="eyebrow">Settings</span>
              <h1>평소 기준과 백업을 관리합니다.</h1>
              <p class="muted">평소 기준값과 백업 파일을 여기서 관리합니다.</p>
            </div>
            <button class="btn primary" type="button" data-action="export-full">전체 백업 만들기</button>
          </section>
          <div class="grid">
            <section class="span-8 stack">
              <section class="card">
                <div class="section-head"><div><span class="kicker">Profile</span><h2>기본 프로필</h2></div></div>
                <div class="field-grid">
                  ${select("목표","goal",s.goal,LABELS.goal,"setting")}
                  ${select("성별","gender",s.gender,LABELS.gender,"setting")}
                  ${field("체중","number","weight",s.weight,"kg","setting")}
                  ${field("키","number","height",s.height,"cm","setting")}
                  ${field("나이","number","age",s.age,"세","setting", "1")}
                  ${field("체지방률","number","bodyFat",s.bodyFat,"%","setting")}
                  ${field("골격근량","number","skeletal",s.skeletal,"kg","setting")}
                </div>
              </section>
              <section class="card">
                <div class="section-head"><div><span class="kicker">Pattern</span><h2>생활 패턴과 운동 기준</h2></div></div>
                <div class="field-grid">
                  ${select("활동량","activityLevel",s.activityLevel,LABELS.activity,"setting")}
                  ${select("업무 유형","workType",s.workType,LABELS.work,"setting")}
                  ${field("주간 웨이트 일수","number","weeklyTrainingDays",s.weeklyTrainingDays,"일","setting","1")}
                  ${field("웨이트 시간","number","weightDuration",s.weightDuration,"분","setting")}
                  ${select("기본 루틴","routine",s.routine,Object.fromEntries(ROUTINE_OPTIONS.map(key => [key, LABELS.routine[key] || key])),"setting")}
                  ${select("기본 유산소","cardioType",s.cardioType,LABELS.cardio,"setting")}
                  ${field("유산소 시간","number","cardioDuration",s.cardioDuration,"분","setting")}
                  ${field("유산소 속도","number","cardioSpeed",s.cardioSpeed,"km/h","setting")}
                  ${field("유산소 경사","number","cardioIncline",s.cardioIncline,"%","setting")}
                </div>
              </section>
            </section>
            <aside class="span-4 stack">
              <section class="card">
                <span class="kicker">Advanced</span>
                <h2>전문가 설정</h2>
                <div class="stack-sm" style="margin-top:12px">
                  ${field("제지방량 반영 비율","number","expertLbmAlphaPercent",alphaPercent,"%","setting","5")}
                  <label class="chip" style="width:max-content"><input type="checkbox" data-setting-field="generalLowDigestCarbs" ${s.generalLowDigestCarbs ? "checked" : ""}> 탄수 소화 부담 낮게</label>
                  <label class="chip" style="width:max-content"><input type="checkbox" data-setting-field="homeInbody" ${s.homeInbody ? "checked" : ""}> 가정용 InBody 보정</label>
                </div>
              </section>
              <section class="card">
                <span class="kicker">Data Management</span>
                <h2>백업과 불러오기</h2>
                <div class="stack-sm" style="margin-top:12px">
                  <button class="btn primary full" type="button" data-action="export-full">전체 백업 만들기</button>
                  <button class="btn full" type="button" data-action="export-records">기록만 내보내기</button>
                  <button class="btn full" type="button" data-action="import-json">백업 불러오기</button>
                </div>
                <p class="report-note" style="margin-top:12px">유산소 프리셋과 저장한 식사 관리는 다음 단계에서 별도 화면으로 보강할 예정입니다.</p>
              </section>
            </aside>
          </div>
        </section>
      `;
    }

    function metric(label, value, unit = "", digits = 0){
      return `<div class="metric"><div class="label">${esc(label)}</div><div class="value">${fmt(value, digits)}<small>${esc(unit)}</small></div></div>`;
    }
    function field(label, type, name, value, suffix, group, step = "0.1"){
      const safeValue = type === "number" ? (Number.isFinite(Number(value)) ? String(value) : "") : String(value ?? "");
      const stepAttr = type === "number" ? ` step="${esc(step)}"` : "";
      return `<div class="field"><label>${esc(label)}${suffix ? ` (${esc(suffix)})` : ""}</label><input type="${type}"${stepAttr} value="${esc(safeValue)}" data-${group}-field="${esc(name)}"></div>`;
    }
    function select(label, name, value, options, group){
      return `<div class="field"><label>${esc(label)}</label><select data-${group}-field="${esc(name)}">${Object.entries(options).map(([key, text]) => `<option value="${esc(key)}" ${String(key) === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></div>`;
    }

    function setSetting(name, rawValue, fieldType){
      let value = rawValue;
      if (fieldType === "checkbox") value = rawValue ? "true" : "false";
      if (name === "expertLbmAlphaPercent") {
        localStorage.setItem(storageKey("expertLbmAlpha"), String((Number(rawValue) || 75) / 100));
      } else {
        localStorage.setItem(storageKey(name), String(value));
        if (name === "weeklyTrainingDays") localStorage.setItem(storageKey("weeklyTrainingDaysManual"), "true");
      }
      refreshEngine();
      render();
      showToast("설정을 저장했습니다.");
    }
    function setTodayField(name, rawValue){
      const numberFields = new Set(["calculationWeight","skeletalMuscle","bodyFatMass","bodyFatPercent","todayIntensityOverride","todayWeightDuration","todayCardioDuration","todayCardioSpeed","todayCardioIncline"]);
      const bodyFields = new Set(["calculationWeight","skeletalMuscle","bodyFatMass","bodyFatPercent"]);
      const cardioFields = new Set(["todayCardioType","todayCardioDuration","todayCardioSpeed","todayCardioIncline"]);
      const value = numberFields.has(name) ? (String(rawValue).trim() === "" ? null : Number(rawValue)) : rawValue;
      const options = { date: todayText(), deferSave:false };
      if (bodyFields.has(name)) options.markBodyStatusUserEdited = true;
      if (cardioFields.has(name)) options.markCardioUserEdited = true;
      call("setTodayCalculationDraftValues", { [name]: value }, options);
      refreshEngine();
      render();
      showToast("오늘 계산값을 저장했습니다.");
    }

    function collectModalFields(){
      const data = {};
      $$("[data-modal-field]", modalRoot).forEach(field => {
        data[field.dataset.modalField] = field.type === "checkbox" ? field.checked : field.value;
      });
      return data;
    }
    function openModal(title, body){
      modalRoot.innerHTML = `
        <div class="modal">
          <div class="modal-head">
            <div><span class="kicker">Input</span><h2>${esc(title)}</h2></div>
            <button class="icon-btn" type="button" data-action="close-modal" aria-label="닫기">×</button>
          </div>
          ${body}
        </div>`;
      modalRoot.classList.add("open");
      document.body.classList.add("modal-open");
    }
    function closeModal(){
      modalRoot.classList.remove("open");
      modalRoot.innerHTML = "";
      document.body.classList.remove("modal-open");
    }
    function suggestedMealLabel(record){
      return ["아침","점심","저녁","간식"][Math.min(record?.meals?.length || 0, 3)] || "기타";
    }
    function openMealModal(date, index = null){
      const record = copy(call("getRecordByDate", date)) || { meals: [] };
      const meal = Number.isInteger(index) ? (record.meals || [])[index] || {} : {};
      openModal(index === null ? "식사 추가" : "식사 수정", `
        <form id="mealForm" class="stack" data-date="${esc(date)}" data-index="${index === null ? "" : index}">
          <div class="field-grid">
            ${select("식사 구분","mealLabel",meal.mealLabel || suggestedMealLabel(record),Object.fromEntries(MEAL_LABELS.map(item => [item,item])),"modal")}
            ${field("탄수화물","number","carbs",meal.carbs || "", "g", "modal")}
            ${field("단백질","number","protein",meal.protein || "", "g", "modal")}
            ${field("지방","number","fat",meal.fat || "", "g", "modal")}
            ${field("술 kcal","number","alcoholKcal",meal.alcoholKcal || "", "kcal", "modal")}
            ${field("기타 kcal","number","otherKcal",meal.otherKcal || "", "kcal", "modal")}
          </div>
          <div class="field"><label>메모</label><textarea data-modal-field="memo">${esc(meal.memo || "")}</textarea></div>
          <button class="btn primary full" type="submit">저장</button>
        </form>`);
    }
    function saveMeal(date, index, data){
      const existing = copy(call("getRecordByDate", date)) || { date, meals: [] };
      const meals = (existing.meals || []).slice();
      const hasIndex = Number.isInteger(index) && !!meals[index];
      const previous = hasIndex ? meals[index] : null;
      const meal = {
        id: previous?.id || `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mealLabel: data.mealLabel || suggestedMealLabel(existing),
        carbs: Number(data.carbs) || 0,
        protein: Number(data.protein) || 0,
        fat: Number(data.fat) || 0,
        alcoholKcal: Number(data.alcoholKcal) || 0,
        otherKcal: Number(data.otherKcal) || 0,
        memo: data.memo || "",
        createdAt: previous?.createdAt || new Date().toISOString()
      };
      if (hasIndex) meals[index] = meal;
      else meals.push(meal);
      const result = call("calculate");
      const goalSnapshot = existing.goalSnapshot || call("buildGoalSnapshotFromCurrentState", result, "saved_at_entry");
      call("upsertRecord", { ...existing, date, recordMode:"detailed", meals, goalSnapshot, snapshotSource: existing.snapshotSource || "saved_at_entry" });
      call("persistAutoAdherenceForDate", date, result, { snapshotSource:"saved_at_entry" });
      call("saveState");
      app.recordDate = date;
      closeModal();
      refreshEngine();
      render();
      showToast(hasIndex ? "식사를 수정했습니다." : "식사를 저장했습니다.");
    }
    function deleteMeal(date, index){
      const existing = copy(call("getRecordByDate", date));
      if (!existing) return;
      call("upsertRecord", { ...existing, meals:(existing.meals || []).filter((_meal, itemIndex) => itemIndex !== index) });
      call("persistAutoAdherenceForDate", date, call("calculate"), { snapshotSource: existing.snapshotSource || "saved_at_entry" });
      call("saveState");
      refreshEngine();
      render();
      showToast("식사를 삭제했습니다.");
    }
    function openRecordInfoModal(date){
      const record = copy(call("getRecordByDate", date)) || { date, meals: [], adherence:"medium", recordMode:"weight_only" };
      openModal("체중과 기록 정보", `
        <form id="recordInfoForm" class="stack" data-date="${esc(date)}">
          <div class="field-grid">
            ${select("기록 방식","recordMode",record.recordMode || "weight_only",LABELS.recordMode,"modal")}
            ${field("공복 체중","number","weight",record.weight || "", "kg", "modal")}
            ${select("간단 기록 평가","adherence",record.adherence || "medium",LABELS.adherence,"modal")}
          </div>
          <label class="chip" style="width:max-content"><input type="checkbox" data-modal-field="applyWeight"> 오늘 계산에도 반영</label>
          <div class="field"><label>메모</label><textarea data-modal-field="note">${esc(record.note || "")}</textarea></div>
          <button class="btn primary full" type="submit">저장</button>
        </form>`);
    }
    function saveRecordInfo(date, data){
      const existing = copy(call("getRecordByDate", date)) || { date, meals: [] };
      const update = {
        ...existing,
        date,
        recordMode: data.recordMode || existing.recordMode || (existing.meals?.length ? "detailed" : "weight_only"),
        weight: data.weight === "" ? null : Number(data.weight),
        note: data.note || "",
        adherence: data.adherence || existing.adherence || "medium",
        adherenceSource: data.recordMode === "simple" ? "manual" : existing.adherenceSource
      };
      call("upsertRecord", update);
      if (data.applyWeight && Number.isFinite(update.weight)) {
        call("setTodayCalculationDraftValues", { calculationWeight: update.weight }, { date: todayText(), markBodyStatusUserEdited:true, deferSave:false });
      }
      call("saveState");
      app.recordDate = date;
      closeModal();
      refreshEngine();
      render();
      showToast("기록 정보를 저장했습니다.");
    }
    function deleteRecord(date){
      if (!confirm(`${date} 기록을 삭제할까요?`)) return;
      call("deleteRecord", date);
      call("saveState");
      app.recordDate = todayText();
      refreshEngine();
      render();
      showToast("기록을 삭제했습니다.");
    }

    function openInbodyModal(){
      openModal("InBody 측정 입력", `
        <form id="inbodyForm" class="stack">
          <div class="field-grid">
            ${field("측정일","date","date",todayText(), "", "modal")}
            ${field("체중","number","weight","", "kg", "modal")}
            ${field("골격근량","number","skeletalMuscle","", "kg", "modal")}
            ${field("체지방량","number","bodyFat","", "kg", "modal")}
            ${field("체지방률","number","bodyFatPercent","", "%", "modal")}
          </div>
          <button class="btn primary full" type="submit">저장</button>
        </form>`);
    }
    function saveInbody(data){
      const weight = Number(data.weight);
      const skeletalMuscle = Number(data.skeletalMuscle);
      const bodyFatPercent = Number(data.bodyFatPercent);
      const bodyFat = data.bodyFat === "" ? weight * bodyFatPercent / 100 : Number(data.bodyFat);
      if (!data.date || !Number.isFinite(weight) || !Number.isFinite(skeletalMuscle) || !Number.isFinite(bodyFat) || !Number.isFinite(bodyFatPercent)) {
        showToast("InBody 입력값을 확인해주세요.");
        return;
      }
      const records = readInbodyRecords().filter(item => item.date !== data.date);
      records.push({ date:data.date, weight, skeletalMuscle, bodyFat, bodyFatPercent, warning:"", isSuspicious:false });
      records.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      localStorage.setItem(storageKey("inbodyRecords"), JSON.stringify(records));
      closeModal();
      refreshEngine();
      render();
      showToast("InBody를 저장했습니다.");
    }
    function applyInbody(index){
      const record = readInbodyRecords()[index];
      if (!record) return;
      call("setTodayCalculationDraftValues", {
        calculationWeight: record.weight,
        skeletalMuscle: record.skeletalMuscle,
        bodyFatMass: record.bodyFat,
        bodyFatPercent: record.bodyFatPercent
      }, {
        date: todayText(),
        bodyStatusSource:"latest_inbody",
        bodyStatusSourceDate: record.date,
        bodyStatusLoadType:"record",
        markBodyStatusUserEdited:false,
        deferSave:false
      });
      app.tab = "today";
      refreshEngine();
      render();
      showToast("InBody 값을 Today에 적용했습니다.");
    }
    function applyLatestInbody(){
      if (!readInbodyRecords().length) return showToast("적용할 InBody 기록이 없습니다.");
      applyInbody(0);
    }

    function downloadJson(payload, filename){
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    function exportFull(){
      const payload = copy(call("buildFullBackupPayload"));
      downloadJson(payload, `macro-engine-full-backup-${todayText()}.json`);
      localStorage.setItem(storageKey("lastBackupAt"), new Date().toISOString());
      showToast("전체 백업을 만들었습니다.");
    }
    function exportRecords(){
      const payload = {
        version:3,
        exportedAt:new Date().toISOString(),
        records:copy(call("getSortedRecords")),
        inbodyRecords:readInbodyRecords().slice().reverse()
      };
      downloadJson(payload, `runstep-records-backup-${todayText()}.json`);
      localStorage.setItem(storageKey("lastBackupAt"), new Date().toISOString());
      showToast("기록 백업을 만들었습니다.");
    }
    function readImportFile(file){
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ""));
          const detected = copy(call("detectBackupImportPayload", parsed));
          const comparison = copy(call("buildBackupImportComparison", detected.type, detected.data, detected.summary || {}));
          const preview = detected.type === "full" ? copy(call("buildSmartRestoreImportPreview", detected.data)) : null;
          app.pendingImport = { detected, comparison, preview };
          renderImportModal();
        } catch (_error) {
          showToast("백업 파일 형식을 확인해주세요.");
        } finally {
          importFile.value = "";
        }
      };
      reader.readAsText(file, "utf-8");
    }
    function renderImportModal(){
      const pending = app.pendingImport;
      if (!pending) return;
      const { detected, comparison, preview } = pending;
      const isFull = detected.type === "full";
      openModal(isFull ? "전체 백업을 불러올까요?" : "기록 파일을 불러올까요?", `
        <div class="stack">
          <p class="muted">${isFull ? "전체 복원은 현재 브라우저 데이터를 백업 기준으로 대체합니다. 추가 기록만 가져오기는 Settings와 Today 계산값을 유지합니다." : "기록 중심 파일입니다. Settings와 Today 계산값은 유지됩니다."}</p>
          <div class="metric-grid">
            ${metric("현재 기록", comparison.localRecordDays, "일")}
            ${metric("백업 기록", comparison.backupRecordDays, "일")}
            ${metric("같은 날짜 충돌", comparison.sameDateMealDiffDates?.length || 0, "일")}
            ${metric("InBody", comparison.backupInbodyCount, "건")}
          </div>
          ${isFull ? `<div class="metric-grid">
            ${metric("백업에만 있는 기록", preview?.backupOnlyRecordCount || 0, "일")}
            ${metric("충돌 날짜", preview?.conflictRecordCount || 0, "일")}
            ${metric("추가될 InBody", preview?.backupOnlyInbodyCount || 0, "건")}
            ${metric("합칠 식사", preview?.mergeAddedMealCount || 0, "개")}
          </div>` : ""}
          ${(comparison.warnings || []).length ? `<div class="report-note">${comparison.warnings.map(esc).join("<br>")}</div>` : ""}
          <div class="chip-row">
            ${isFull ? `
              <button class="btn primary" type="button" data-action="apply-import" data-mode="full">전체 복원</button>
              <button class="btn" type="button" data-action="apply-import" data-mode="keep">추가 기록만</button>
              <button class="btn" type="button" data-action="apply-import" data-mode="meals">식사만 합치기</button>
              <button class="btn danger" type="button" data-action="apply-import" data-mode="replace">충돌 날짜 교체</button>
            ` : `<button class="btn primary" type="button" data-action="apply-import" data-mode="records">기록 복원</button>`}
            <button class="btn soft" type="button" data-action="close-modal">그대로 두기</button>
          </div>
        </div>`);
    }
    function applyImport(mode){
      const pending = app.pendingImport;
      if (!pending) return;
      if (mode === "full") call("restoreFullBackupData", pending.detected.data);
      else if (mode === "records") call("applyRecordsOnlyImportData", pending.detected.data);
      else call("applySmartRestoreImportData", pending.detected.data, mode);
      app.pendingImport = null;
      closeModal();
      refreshEngine();
      render();
      showToast("백업을 반영했습니다.");
    }

    document.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.tab) {
        app.tab = target.dataset.tab;
        render();
        window.scrollTo({ top:0, behavior:"smooth" });
        return;
      }
      const action = target.dataset.action;
      if (!action) return;
      if (action === "basis") { app.basis = target.dataset.basis || "guide"; render(); }
      if (action === "recent-range") { app.recentDays = Number(target.dataset.days) || 28; render(); }
      if (action === "select-record") { app.recordDate = target.dataset.date; render(); }
      if (action === "open-record-date") { app.recordDate = target.dataset.date || app.recordDate || todayText(); app.tab = "records"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (action === "open-meal") openMealModal(target.dataset.date || todayText());
      if (action === "edit-meal") openMealModal(target.dataset.date, Number(target.dataset.index));
      if (action === "delete-meal") deleteMeal(target.dataset.date, Number(target.dataset.index));
      if (action === "open-record-info") openRecordInfoModal(target.dataset.date || app.recordDate || todayText());
      if (action === "delete-record") deleteRecord(target.dataset.date);
      if (action === "open-inbody") openInbodyModal();
      if (action === "apply-inbody") applyInbody(Number(target.dataset.index));
      if (action === "apply-latest-inbody") applyLatestInbody();
      if (action === "export-full") exportFull();
      if (action === "export-records") exportRecords();
      if (action === "import-json") importFile.click();
      if (action === "apply-import") applyImport(target.dataset.mode);
      if (action === "close-modal") closeModal();
    });
    document.addEventListener("change", event => {
      const fieldEl = event.target;
      if (fieldEl.dataset.todayField) setTodayField(fieldEl.dataset.todayField, fieldEl.value);
      if (fieldEl.dataset.settingField) setSetting(fieldEl.dataset.settingField, fieldEl.type === "checkbox" ? fieldEl.checked : fieldEl.value, fieldEl.type);
    });
    modalRoot.addEventListener("submit", event => {
      event.preventDefault();
      const form = event.target;
      const data = collectModalFields();
      if (form.id === "mealForm") saveMeal(form.dataset.date, form.dataset.index === "" ? null : Number(form.dataset.index), data);
      if (form.id === "recordInfoForm") saveRecordInfo(form.dataset.date, data);
      if (form.id === "inbodyForm") saveInbody(data);
    });
    modalRoot.addEventListener("click", event => {
      if (event.target === modalRoot) closeModal();
    });
    importFile.addEventListener("change", event => readImportFile(event.target.files?.[0]));

    bootEngine();
  })();
  </script>
</body>
</html>
"""


def build() -> None:
    engine_html = INDEX.read_text(encoding="utf-8")
    engine_json = json.dumps(engine_html, ensure_ascii=False).replace("</", "<\\/")
    OUT.write_text(APP_TEMPLATE.replace("__ENGINE_HTML_JSON__", engine_json), encoding="utf-8")


if __name__ == "__main__":
    build()
