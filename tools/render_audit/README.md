# Render Audit Tools

현재 앱 화면 캡처와 브라우저 내부 테스트를 실행하는 로컬 QA 도구입니다.

이 폴더는 특정 버전의 기준 스크린샷을 보관하지 않습니다. 캡처 결과물은 생성물로 보고 git에 올리지 않습니다. 현재 UI 판단은 새로 캡처한 화면과 `_ui_refs/003.스티치` 시안을 직접 비교해서 진행합니다.

## Commands

```powershell
node .\tools\render_audit\run_internal_tests.cjs
node .\tools\render_audit\run_internal_tests.cjs --mobile
node .\tools\render_audit\capture_render_audit.cjs
```

특정 브라우저 채널을 지정해야 할 때:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome'
node .\tools\render_audit\run_internal_tests.cjs
```

## Generated Files

아래 파일과 폴더는 실행 중 생성되며 git에서 제외합니다.

- `screenshots/`
- `manifest.json`
- `pages/`
- `_debug/`
- `seeds/`

필요한 기준 스크린샷은 `_ui_refs/current_baseline_YYYY_MM_DD` 같은 ignored 폴더에 별도로 복사해서 사용합니다.

모바일 캡처는 390px viewport의 상단만 찍지 않고 iframe 높이를 실제 앱 scroll height에 맞춰 확장한 뒤 full-page로 저장합니다. 모바일 UI 판단은 이 전체 길이 캡처를 기준으로 해야 합니다.
