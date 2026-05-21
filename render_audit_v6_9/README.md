# v6.9 Render Audit

v6.9 기준 화면/회귀 검증을 위한 렌더 감사 산출물입니다.

## 포함 범위

- `screenshots/`: canonical 화면 41개
- `manifest.json`: 각 스크린샷의 상태, 액션, viewport, 파일 경로
- `capture_render_audit.cjs`: Playwright 기반 스크린샷 재생성 스크립트
- `run_internal_tests.cjs`: 브라우저 내부 `run*Tests` 실행 스크립트
- `STITCH_HANDOFF.md`: Stitch에 넘길 화면 묶음과 리디자인 요청 요약

`_debug/`, `pages/`, `screenshots/_superseded_first_pass/`는 실행 중 생성되는 로컬 작업 파일이라 커밋 대상에서 제외합니다.

## 실행 방법

현재 PC의 Node.js로 실행하면 됩니다. 스크립트가 현재 repo, 현재 Node 런타임, Codex 번들 런타임의 `node_modules`를 자동 탐색합니다.

```powershell
node .\render_audit_v6_9\run_internal_tests.cjs
node .\render_audit_v6_9\run_internal_tests.cjs --mobile
node .\render_audit_v6_9\capture_render_audit.cjs
```

특정 브라우저 채널을 강제로 쓰고 싶으면 환경변수로 지정할 수 있습니다.

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL='chrome'
node .\render_audit_v6_9\run_internal_tests.cjs
```

## 최근 검증 결과

- 데스크톱 브라우저 내부 테스트: 95 suites / 903 cases / 0 failed
- 모바일 390px 대상 테스트: 11 suites / 96 cases / 0 failed
- 렌더 감사 스크린샷: 41 states

## 확인 포인트

- `34_mobile_today_rich.png`: 모바일 Today 핵심 카드가 viewport 안에서 시작되는지
- `35_mobile_today_record_detailed.png`: Today 상세 기록 모달이 오른쪽으로 잘리지 않는지
- `37_mobile_records_meal_edit.png`: Records 식사 수정 모달이 모바일에서 잘리지 않는지
- `41_mobile_settings_groups_open.png`: Settings 접힘 그룹과 입력 카드가 오른쪽으로 넘치지 않는지
