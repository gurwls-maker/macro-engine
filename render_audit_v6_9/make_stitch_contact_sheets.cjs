const fs = require("node:fs");
const path = require("node:path");

const {
  rootPath,
  auditDir,
  createServer,
  chromium
} = require("./capture_render_audit.cjs");

const sourceDir = path.join(auditDir, "stitch_upload_mobile");
const sourceImageDir = path.join(sourceDir, "images");
const outDir = path.join(sourceDir, "contact_sheets");
const pageDir = path.join(outDir, "_pages");
const sheetDir = path.join(outDir, "images");
const manifestPath = path.join(outDir, "manifest.json");
const guidePath = path.join(outDir, "UPLOAD_20_LIMIT_GUIDE.md");

const imagesPerSheet = 10;
const tileWidth = 390;
const tileHeight = 900;
const sheetViewport = { width: 888, height: 1200 };

function assertInsideWorkspace(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootPath + path.sep) && resolved !== rootPath) {
    throw new Error(`Refusing to write outside workspace: ${resolved}`);
  }
  return resolved;
}

function resetOutput() {
  for (const target of [pageDir, sheetDir]) {
    const resolved = assertInsideWorkspace(target);
    if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
    fs.mkdirSync(resolved, { recursive: true });
  }
}

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseStateName(fileName) {
  const match = fileName.match(/^\d+_(.+?)_(?:page|modal)_\d+\.(?:png|jpg|jpeg)$/);
  if (!match) return fileName.replace(/\.(?:png|jpg|jpeg)$/i, "");
  return match[1].replace(/_/g, " ");
}

function makeSheetHtml(sheet, totalSheets) {
  const tiles = sheet.files.map((file, index) => {
    const globalIndex = sheet.startIndex + index + 1;
    return `
      <figure class="tile">
        <figcaption>
          <strong>${pad(globalIndex, 3)}</strong>
          <span>${escapeHtml(parseStateName(file))}</span>
        </figcaption>
        <img src="/render_audit_v6_9/stitch_upload_mobile/images/${encodeURIComponent(file)}" alt="${escapeHtml(file)}">
      </figure>`;
  }).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Stitch mobile sheet ${pad(sheet.index)} of ${pad(totalSheets)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #edf5e8;
      color: #0f3520;
      font-family: "Pretendard", "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .sheet {
      width: 888px;
      padding: 24px;
    }
    .header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      margin-bottom: 18px;
      background: #fbfaf4;
      border: 1px solid #c9dac3;
      border-radius: 18px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #50614f;
      font-size: 14px;
      line-height: 1.45;
    }
    .meta {
      flex: 0 0 auto;
      font-weight: 800;
      color: #1b7a3c;
      font-size: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, ${tileWidth}px);
      gap: 20px;
    }
    .tile {
      margin: 0;
      overflow: hidden;
      background: #fbfaf4;
      border: 1px solid #c9dac3;
      border-radius: 18px;
      box-shadow: 0 10px 22px rgba(28, 70, 38, 0.08);
    }
    figcaption {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 12px;
      border-bottom: 1px solid #dce7d7;
      font-size: 12px;
      line-height: 1.25;
      color: #516451;
      background: #fffdf8;
    }
    figcaption strong {
      color: #123b21;
      font-size: 13px;
    }
    figcaption span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    img {
      display: block;
      width: ${tileWidth}px;
      height: ${tileHeight}px;
      object-fit: cover;
      background: #f6f8f2;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="header">
      <div>
        <h1>탄단지 다이어리 v6.9 mobile states</h1>
        <p>Stitch 20장 제한 대응용 컨택트 시트입니다. 각 타일은 390x900 모바일 원본 화면입니다.</p>
      </div>
      <div class="meta">${pad(sheet.index)} / ${pad(totalSheets)}</div>
    </section>
    <section class="grid">
      ${tiles}
    </section>
  </main>
</body>
</html>`;
}

function buildGuide(manifest) {
  const lines = [];
  lines.push("# Stitch 20장 제한 대응 업로드 가이드");
  lines.push("");
  lines.push("Stitch가 파일 첨부를 20장까지만 받는 경우에는 원본 PNG 167장을 올리지 말고, 이 폴더의 컨택트 시트 JPG만 올립니다.");
  lines.push("");
  lines.push(`- 업로드할 이미지: \`images/stitch_mobile_sheet_01_of_${pad(manifest.sheetCount)}.jpg\`부터 \`images/stitch_mobile_sheet_${pad(manifest.sheetCount)}_of_${pad(manifest.sheetCount)}.jpg\`까지`);
  lines.push(`- 컨택트 시트 수: ${manifest.sheetCount}장`);
  lines.push(`- 포함된 원본 화면 조각: ${manifest.sourceImageCount}장`);
  lines.push("- 각 타일은 390x900 모바일 원본 화면을 축소하지 않고 배치했습니다.");
  lines.push("");
  lines.push("## Stitch에서 넣는 순서");
  lines.push("");
  lines.push("1. `기존 DESIGN.md 붙여넣기` 칸에 상위 폴더의 `DESIGN.md` 내용을 붙여 넣습니다.");
  lines.push("2. `파일 드래그 앤 드롭`에는 이 폴더의 `images/` 안 JPG 17장만 올립니다.");
  lines.push("3. `공개 GitHub 저장소`에는 공개 접근 가능하면 `https://github.com/gurwls-maker/macro-engine`를 넣습니다.");
  lines.push("4. `웹사이트 추가`는 배포된 HTTPS URL이 생기기 전까지 비워둡니다.");
  lines.push("");
  lines.push("## 추가 안내 칸");
  lines.push("");
  lines.push("```text");
  lines.push("첨부한 이미지는 20장 제한 때문에 여러 모바일 화면을 묶은 컨택트 시트입니다. 각 타일 하나가 실제 390px 모바일 화면 한 상태입니다. 전체 타일을 같은 앱의 상태 세트로 보고, 공통 컴포넌트와 모바일 레이아웃 규칙을 일관되게 리디자인해주세요. 기능, 입력 항목, 탭, 모달 흐름은 유지해주세요.");
  lines.push("```");
  lines.push("");
  lines.push("## 시트 인덱스");
  lines.push("");
  for (const sheet of manifest.sheets) {
    lines.push(`- ${sheet.file}: 원본 ${sheet.files.length}장, ${sheet.files[0]} ~ ${sheet.files.at(-1)}`);
  }
  return lines.join("\n");
}

async function renderSheet(context, baseUrl, sheet, totalSheets) {
  const htmlName = `sheet_${pad(sheet.index)}_of_${pad(totalSheets)}.html`;
  fs.writeFileSync(path.join(pageDir, htmlName), makeSheetHtml(sheet, totalSheets), "utf8");
  const page = await context.newPage();
  await page.setViewportSize(sheetViewport);
  await page.goto(`${baseUrl}/render_audit_v6_9/stitch_upload_mobile/contact_sheets/_pages/${htmlName}`, { waitUntil: "load", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.screenshot({
    path: path.join(sheetDir, sheet.file),
    type: "jpeg",
    quality: 92,
    fullPage: true
  });
  await page.close();
}

async function run() {
  if (!fs.existsSync(sourceImageDir)) {
    throw new Error(`Source image directory does not exist: ${sourceImageDir}`);
  }
  resetOutput();
  const sourceImages = fs.readdirSync(sourceImageDir)
    .filter(file => /\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, "en"));
  const totalSheets = Math.ceil(sourceImages.length / imagesPerSheet);
  const sheets = [];
  for (let index = 0; index < totalSheets; index += 1) {
    const files = sourceImages.slice(index * imagesPerSheet, (index + 1) * imagesPerSheet);
    sheets.push({
      index: index + 1,
      file: `stitch_mobile_sheet_${pad(index + 1)}_of_${pad(totalSheets)}.jpg`,
      startIndex: index * imagesPerSheet,
      files
    });
  }

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
    context = await browser.newContext({ viewport: sheetViewport });
    for (const sheet of sheets) {
      console.log(`contact sheet ${pad(sheet.index)} / ${pad(totalSheets)}`);
      await renderSheet(context, baseUrl, sheet, totalSheets);
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceImageCount: sourceImages.length,
    sheetCount: sheets.length,
    imagesPerSheet,
    tile: { width: tileWidth, height: tileHeight },
    sheets: sheets.map(sheet => ({
      index: sheet.index,
      file: sheet.file,
      files: sheet.files
    }))
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(guidePath, buildGuide(manifest), "utf8");
  console.log(JSON.stringify({
    sourceImages: sourceImages.length,
    sheets: sheets.length,
    outDir
  }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
