# v6.9 Render Audit

이 폴더는 v6.9 기준 문서와 Stitch 샘플 비교를 위해 만든 렌더 감사 산출물입니다.

## 포함 범위

- `screenshots/`: Stitch 전달용 canonical 화면 41장
- `manifest.json`: 각 스크린샷의 상태, 액션, viewport, 파일 경로
- `capture_render_audit.cjs`: Playwright 기반 재촬영 스크립트
- `run_internal_tests.cjs`: 앱 내부 `run*Tests` 브라우저 실행 스크립트
- `STITCH_HANDOFF.md`: Stitch에게 넘길 화면 묶음과 리디자인 요청 요약

`_debug/`, `pages/`, `screenshots/_superseded_first_pass/`는 재촬영 중 생기는 로컬 작업 파일이라 커밋 대상에서 제외했습니다.

## 재검증 명령

```powershell
& 'C:\Users\dw\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\render_audit_v6_9\run_internal_tests.cjs
& 'C:\Users\dw\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\render_audit_v6_9\run_internal_tests.cjs --mobile
& 'C:\Users\dw\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\render_audit_v6_9\capture_render_audit.cjs
```

## 현재 검증 결과

- 전체 브라우저 내부 테스트: 95 suites / 895 cases / 0 failed
- 모바일 390px 대상 회귀 테스트: 11 suites / 96 cases / 0 failed
- 렌더 감사 스크린샷: 41 states regenerated

## 핫픽스 확인 포인트

- `34_mobile_today_rich.png`: 상단 모바일 탭 5개가 모두 viewport 안에 들어옴
- `35_mobile_today_record_detailed.png`: Today 상세 기록 시트 오른쪽 잘림 제거
- `37_mobile_records_meal_edit.png`: Records 식사 수정 모달 닫기 버튼과 입력칸 오른쪽 잘림 제거
- `41_mobile_settings_groups_open.png`: Settings 펼친 그룹의 접기 버튼과 카드 오른쪽 잘림 제거
