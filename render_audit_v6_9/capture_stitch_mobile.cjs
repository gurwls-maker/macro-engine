const fs = require("node:fs");
const path = require("node:path");

const {
  rootPath,
  auditDir,
  makePage,
  createServer,
  captures,
  chromium
} = require("./capture_render_audit.cjs");

const outDir = path.join(auditDir, "stitch_upload_mobile");
const imageDir = path.join(outDir, "images");
const pageDir = path.join(outDir, "_pages");
const manifestPath = path.join(outDir, "manifest.json");
const guidePath = path.join(outDir, "STITCH_UPLOAD_GUIDE.md");
const designPath = path.join(outDir, "DESIGN.md");
const githubUrl = "https://github.com/gurwls-maker/macro-engine";

const viewport = { width: 390, height: 900 };
const overlapPx = 140;
const maxSegmentsPerState = 12;

function assertInsideWorkspace(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootPath + path.sep) && resolved !== rootPath) {
    throw new Error(`Refusing to write outside workspace: ${resolved}`);
  }
  return resolved;
}

function resetOutput() {
  for (const target of [imageDir, pageDir]) {
    const resolved = assertInsideWorkspace(target);
    if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
    fs.mkdirSync(resolved, { recursive: true });
  }
}

function stateKey(name) {
  return name.replace(/^(\d+)_(?:desktop|mobile)_/, "$1_");
}

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function scrollPositions(scrollHeight, clientHeight) {
  const maxScroll = Math.max(0, Math.ceil(scrollHeight - clientHeight));
  if (maxScroll <= 0) return [0];
  const step = Math.max(1, clientHeight - overlapPx);
  const positions = [0];
  for (let position = step; position < maxScroll; position += step) {
    positions.push(Math.round(position));
    if (positions.length >= maxSegmentsPerState - 1) break;
  }
  if (positions.at(-1) !== maxScroll) positions.push(maxScroll);
  return [...new Set(positions)].slice(0, maxSegmentsPerState);
}

async function getFrame(page) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const frame = page.frames().find(item => item.url().includes("/index.html"));
    if (frame) return frame;
    await page.waitForTimeout(100);
  }
  throw new Error("App iframe was not found");
}

async function getStateInfo(frame) {
  return frame.evaluate(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const modalSelectors = [
      ".record-start-overlay:not(.hidden) .record-start-body",
      ".record-start-overlay:not(.hidden) .record-start-dialog",
      ".app-choice-overlay:not(.hidden) .app-choice-dialog",
      ".inbody-record-select-overlay:not(.hidden) .inbody-record-select-dialog",
      ".cardio-preset-select-overlay:not(.hidden) .cardio-preset-select-dialog",
      ".record-weight-apply-overlay:not(.hidden) .record-weight-apply-dialog"
    ];
    const modalTargets = modalSelectors
      .map(selector => {
        const element = document.querySelector(selector);
        if (!visible(element)) return null;
        return {
          selector,
          scrollHeight: Math.ceil(element.scrollHeight || 0),
          clientHeight: Math.ceil(element.clientHeight || 0),
          rect: element.getBoundingClientRect().toJSON()
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const scroller = document.scrollingElement || document.documentElement;
    return {
      title: document.title,
      activeTab: Array.from(document.querySelectorAll(".tab-btn.active")).map(button => button.textContent.trim()).join(" / "),
      hasModal: modalTargets.length > 0,
      modalTarget: modalTargets[0] || null,
      page: {
        scrollHeight: Math.ceil(scroller.scrollHeight || document.documentElement.scrollHeight || 0),
        clientHeight: Math.ceil(window.innerHeight || document.documentElement.clientHeight || 0)
      }
    };
  });
}

async function scrollPage(frame, top) {
  await frame.evaluate(value => window.scrollTo(0, value), top);
}

async function scrollModal(frame, selector, top) {
  await frame.evaluate(({ selector: targetSelector, top: value }) => {
    const element = document.querySelector(targetSelector);
    if (element) element.scrollTop = value;
  }, { selector, top });
}

async function captureState(context, baseUrl, state, ordinal) {
  const [sourceName, payloadName, actionName] = state;
  const key = stateKey(sourceName);
  const pageName = `${pad(ordinal, 3)}_${key}`;
  const htmlPath = path.join(pageDir, `${pageName}.html`);
  fs.writeFileSync(htmlPath, makePage(pageName, payloadName, actionName, viewport.width, viewport.height), "utf8");

  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/render_audit_v6_9/stitch_upload_mobile/_pages/${pageName}.html`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.ready === "true", null, { timeout: 30000 });

  const frame = await getFrame(page);
  const info = await getStateInfo(frame);
  const target = info.hasModal ? info.modalTarget : info.page;
  const positions = scrollPositions(target.scrollHeight, target.clientHeight || viewport.height);
  const segmentType = info.hasModal ? "modal" : "page";
  const segments = [];

  for (let index = 0; index < positions.length; index += 1) {
    const top = positions[index];
    if (info.hasModal) {
      await scrollModal(frame, info.modalTarget.selector, top);
    } else {
      await scrollPage(frame, top);
    }
    await page.waitForTimeout(180);
    const fileName = `${pageName}_${segmentType}_${pad(index + 1)}.png`;
    const shotPath = path.join(imageDir, fileName);
    await page.screenshot({ path: shotPath, fullPage: false });
    segments.push({
      file: fileName,
      path: shotPath,
      type: segmentType,
      scrollTop: top,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight || viewport.height
    });
  }

  await page.close();
  return {
    order: ordinal,
    key,
    sourceName,
    payloadName,
    actionName,
    activeTab: info.activeTab,
    hasModal: info.hasModal,
    modalSelector: info.modalTarget?.selector || "",
    segments
  };
}

function buildDesignDocument(manifest) {
  const totalImages = manifest.reduce((sum, item) => sum + item.segments.length, 0);
  const lines = [];
  lines.push("# 탄단지 다이어리 v6.9 Mobile Redesign Brief");
  lines.push("");
  lines.push("이 문서는 Stitch의 `내 디자인으로 시작하기` 화면에 붙여 넣기 위한 DESIGN.md입니다. 첨부된 이미지는 같은 앱의 서로 다른 모바일 상태와 트리거 화면입니다.");
  lines.push("");
  lines.push("## Product");
  lines.push("");
  lines.push("- 제품명: 탄단지 다이어리 v6.9");
  lines.push("- 앱 유형: 모바일 중심 영양/체중/InBody/식사 기록 도구");
  lines.push("- 핵심 사용: 사용자가 매일 섭취량, 운동, 체중, 인바디를 입력하고 목표 대비 결과와 코치 문구를 빠르게 확인합니다.");
  lines.push(`- 첨부 상태 수: ${manifest.length}개`);
  lines.push(`- 첨부 이미지 수: ${totalImages}장`);
  lines.push("");
  lines.push("## Redesign Goal");
  lines.push("");
  lines.push("겉모습과 화면 구성을 더 완성도 있게 리디자인해주세요. 단, 현재 앱의 기능, 입력 흐름, 버튼, 탭, 모달, 코치 문구 위치, 계산 결과의 정보 구조는 유지해주세요. 새로운 기능을 만들거나 기존 입력 항목을 삭제하지 말아주세요.");
  lines.push("");
  lines.push("## Visual Direction");
  lines.push("");
  lines.push("- 분위기: 건강관리 앱답게 차분하고 신뢰감 있게. 다만 병원/보험 앱처럼 딱딱하지 않고 매일 열고 싶은 느낌.");
  lines.push("- 기준 톤: green / ivory 계열을 중심으로 한 모바일 헬스 도구. 짙은 초록, 부드러운 잎색, 아이보리/종이색, 얇은 라인, 절제된 그림자.");
  lines.push("- 강조색: kcal, 목표 달성, 진행률은 amber나 warm yellow를 보조로 사용. 경고와 초과 상태는 coral/red를 아주 제한적으로 사용.");
  lines.push("- 피해야 할 것: 보라/파랑 그라데이션 위주의 SaaS 느낌, 장식용 원형 배경, 과한 카드 중첩, 랜딩페이지 같은 히어로 구성.");
  lines.push("- 형태: 카드와 바텀시트는 둥글지만 과하지 않게. 모바일 입력 도구이므로 정보 밀도와 스캔성이 중요합니다.");
  lines.push("");
  lines.push("## Brand Assets");
  lines.push("");
  lines.push("- 고정 로고는 아직 없다고 가정합니다. 필요하다면 `탄단지 다이어리` 텍스트 워드마크 중심으로 가볍게 제안해주세요.");
  lines.push("- 새 마스코트, 캐릭터, 복잡한 심볼은 만들지 말아주세요. 앱의 실사용 화면이 우선입니다.");
  lines.push("- 별도 폰트 파일은 없습니다. 한국어 가독성이 좋은 Pretendard, Noto Sans KR, Apple SD Gothic Neo, system-ui 계열을 우선해주세요.");
  lines.push("- Figma 원본 파일은 없습니다. Stitch가 Figma로 내보낼 수 있다면 결과물을 Figma 초안으로 쓰고, 현재 앱에는 좋은 패턴만 선별해 이식합니다.");
  lines.push("");
  lines.push("## Layout Rules");
  lines.push("");
  lines.push("- 기본 모바일 기준은 390px 폭입니다. 어떤 상태에서도 오른쪽 잘림, 가로 스크롤, 버튼 텍스트 넘침이 없어야 합니다.");
  lines.push("- 상단 탭은 빠르게 전환 가능해야 하고, 현재 탭이 분명해야 합니다.");
  lines.push("- Today 화면은 오늘 입력, 목표 대비 결과, 코치 문구가 가장 빠르게 읽혀야 합니다.");
  lines.push("- 입력 모달/바텀시트는 긴 폼에서도 단계와 주요 버튼이 안정적으로 보여야 합니다.");
  lines.push("- Records/Recent/InBody/Settings는 반복 사용 도구처럼 조용하고 정리된 레이아웃이 좋습니다.");
  lines.push("- 작은 버튼은 아이콘+짧은 텍스트를 우선하고, 삭제/초기화 같은 위험 행동은 다른 버튼과 시각적으로 구분해주세요.");
  lines.push("");
  lines.push("## Screens To Preserve");
  lines.push("");
  lines.push("- Today: 빈 상태, 빠른 입력 후 결과, 상세 입력 후 결과, 음주 kcal 계산, 기록 시작 바텀시트, 식사 수정/추가, InBody 연결 선택");
  lines.push("- Records: 기록 목록, 상세 화면, 수정 화면, 식사 추가/수정 모달, 적용 확인 모달");
  lines.push("- Recent: 1/3/7/14/28일 범위별 결과와 저데이터 상태");
  lines.push("- InBody: 신규 입력, 기존 기록 수정, 추세, 기록 선택 모달");
  lines.push("- Settings: 목표/기본값/프로필/생활/운동/전문가/데이터 관리, 백업/복원 흐름");
  lines.push("");
  lines.push("## Copy And Content");
  lines.push("");
  lines.push("한국어 문구는 의미가 바뀌지 않게 유지해주세요. 문구를 더 짧고 자연스럽게 다듬는 것은 가능하지만, 코치 문구/인바디 문구/계산 결과/식사 기록의 정보 우선순위는 유지해야 합니다.");
  lines.push("");
  lines.push("## Expected Output");
  lines.push("");
  lines.push("Stitch 결과물은 바로 프로덕션 코드로 붙이는 용도라기보다, 최종 UI 방향을 정하기 위한 시각 디자인 초안으로 봅니다. 첨부 이미지 전체가 같은 앱의 상태 세트라는 점을 유지해서, 한 화면만 예쁘게 바꾸는 것이 아니라 앱 전체의 공통 컴포넌트 규칙을 잡아주세요.");
  return lines.join("\n");
}

function buildGuide(manifest) {
  const totalImages = manifest.reduce((sum, item) => sum + item.segments.length, 0);
  const lines = [];
  lines.push("# Stitch Mobile Upload Guide");
  lines.push("");
  lines.push("이 폴더는 Stitch에 직접 올리기 위한 모바일 전용 화면 조각입니다.");
  lines.push("");
  lines.push(`- 기준 viewport: ${viewport.width} x ${viewport.height}`);
  lines.push(`- 상태 수: ${manifest.length}`);
  lines.push(`- 이미지 수: ${totalImages}`);
  lines.push("- 모든 이미지는 `images/` 안에 번호 prefix로 정렬되어 있습니다.");
  lines.push("- `DESIGN.md`는 Stitch의 `기존 DESIGN.md 붙여넣기` 칸에 그대로 넣기 위한 문서입니다.");
  lines.push("");
  lines.push("## Stitch 입력칸별 처리");
  lines.push("");
  lines.push(`- 기존 DESIGN.md 붙여넣기: 이 폴더의 \`DESIGN.md\` 내용을 그대로 붙여 넣습니다.`);
  lines.push("- 파일 드래그 앤 드롭: `images/` 안의 PNG를 아래 권장 묶음대로 올립니다.");
  lines.push("- 코드/이미지/글꼴/로고 업로드: 지금은 별도 코드나 폰트, 로고 파일보다 캡처 이미지가 더 중요합니다. 로고는 아직 고정하지 않는 편이 안전합니다.");
  lines.push("- .fig 파일 업로드: 현재 Figma 원본이 없으므로 비워둡니다. Stitch 결과를 Figma로 보낼 수 있으면 그때 초안으로 사용합니다.");
  lines.push(`- 공개 GitHub 저장소: 저장소가 공개 접근 가능하면 \`${githubUrl}\`를 넣습니다. 단, 이 링크는 보조 참고이고 실제 디자인 기준은 DESIGN.md와 이미지입니다.`);
  lines.push("- 웹사이트 추가: 배포된 HTTPS URL이 생기면 넣습니다. 로컬 HTML 경로나 `file://` 주소는 Stitch가 읽기 어렵습니다.");
  lines.push("");
  lines.push("## 권장 업로드 방식");
  lines.push("");
  lines.push("한 번에 전부 넣기보다 흐름 단위로 나눠 넣는 편이 좋습니다.");
  lines.push("");
  lines.push("1. Today 기본/입력/기록 시작: `001`-`012`, `034`-`035`");
  lines.push("2. Records 기록/상세/수정/식사 모달: `013`-`019`, `036`-`037`");
  lines.push("3. 최근 흐름 범위별 화면: `020`-`024`, `038`");
  lines.push("4. InBody 입력/수정/Records 연결: `025`-`028`, `039`");
  lines.push("5. Settings/backup/restore: `029`-`033`, `040`-`041`");
  lines.push("");
  lines.push("## Stitch 추가 안내 칸에 넣을 문장");
  lines.push("");
  lines.push("```text");
  lines.push("첨부 이미지는 같은 모바일 앱의 서로 다른 상태와 트리거 화면입니다. 한 장만 기준으로 삼지 말고 공통 컴포넌트 규칙, 탭 구조, 입력 모달, 결과 카드, 코치 문구 영역이 전체 화면에서 일관되도록 리디자인해주세요. 기능과 정보 구조는 유지하고, 시각 디자인과 모바일 레이아웃 완성도를 높여주세요.");
  lines.push("```");
  lines.push("");
  lines.push("## 상태 인덱스");
  lines.push("");
  for (const item of manifest) {
    lines.push(`- ${pad(item.order, 3)} ${item.key}: ${item.segments.length} images, ${item.hasModal ? "modal" : "page"}, action=${item.actionName}`);
  }
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  lines.push("- 이 이미지는 QA용 뷰포트 캡처가 아니라 Stitch 업로드용 스크롤 조각입니다.");
  lines.push("- 긴 화면은 한 장짜리 full-page보다 조각 이미지를 올리는 쪽이 Stitch가 구조를 더 잘 볼 가능성이 큽니다.");
  lines.push("- Stitch 결과 코드는 그대로 합치지 말고, 좋은 레이아웃 패턴만 현재 `index.html`에 이식하는 용도로 보는 편이 안전합니다.");
  return lines.join("\n");
}

async function run() {
  resetOutput();
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let context;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless: true,
      args: ["--disable-gpu", "--no-first-run", "--disable-background-networking"]
    });
    context = await browser.newContext({ viewport });
    const manifest = [];
    for (let index = 0; index < captures.length; index += 1) {
      const ordinal = index + 1;
      const sourceName = captures[index][0];
      console.log(`stitch mobile ${pad(ordinal, 3)} ${sourceName}`);
      manifest.push(await captureState(context, baseUrl, captures[index], ordinal));
    }
    fs.writeFileSync(manifestPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      viewport,
      stateCount: manifest.length,
      imageCount: manifest.reduce((sum, item) => sum + item.segments.length, 0),
      states: manifest
    }, null, 2), "utf8");
    fs.writeFileSync(designPath, buildDesignDocument(manifest), "utf8");
    fs.writeFileSync(guidePath, buildGuide(manifest), "utf8");
    console.log(JSON.stringify({
      states: manifest.length,
      images: manifest.reduce((sum, item) => sum + item.segments.length, 0),
      outDir
    }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
