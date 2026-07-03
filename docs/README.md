# 탄단지 다이어리 문서 안내

이 폴더의 문서는 “앱이 지금 어떤 방향으로 가야 하는지”를 빠르게 확인하기 위한 기준이다. 오래된 결정 기록은 Git 이력으로 충분하므로, 현재 판단에 직접 쓰이지 않는 문서는 남기지 않는다.

## 먼저 읽을 문서

1. `99_v8.1_takeover_audit_2026-06-30.md`
   - v8.0 final 이후 인수인계 감사 문서다.
   - 실제 동작 판단은 `v8.0` tag가 가리키는 HEAD 코드와 테스트가 우선이고, 이 문서는 다음 작업 착수 전 위험 분류와 금지선 판단에 쓴다.

2. `98_v8.1_dev_environment_reproducibility_decision_2026-07-02.md`
   - 개발환경 재현성, Playwright 의존성, npm scripts, render audit 증거 기준을 정리한다.
   - 앱 구현 작업 전에 현재 테스트 실행 환경이 충분한지 확인할 때 읽는다.

3. `00_현재작업기준_2026-06-16.txt`
   - 현재 작업에서 우선해야 할 앱 방향, 산식 방향, UI/문구 원칙을 담는다.
   - 코드 수정 전 이 문서를 먼저 확인한다.

4. `02_대화의도_근거표_2026-06-16.txt`
   - 최근 대화에서 확정된 의도를 정리한 근거표다.
   - `00_현재작업기준`과 충돌하면 최신 대화 의도와 이 문서의 의도 근거를 우선 검토한다.

5. 작업 주제별 참고 문서
   - `v8_운동여부_코드영향감사_2026-06-15.txt`
   - `v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt`
   - `v8_외부근거_매크로_정책표_2026-06-05.txt`
   - `v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt`
   - `# 2026 ACSM 근력운동 가이드 한국어 해설판.txt`

6. 문구를 바꿀 때만 읽을 문서
   - `96_v8.1_copy_help_closeout_2026-07-03.md`
     - v8.1 copy/help 종료 판단을 요약한 closeout 문서다.
   - `97_v8.1_copy_help_inventory_2026-07-02.md`
     - v8.1 copy/help 구현, 감사, 종료 후보 판단의 상세 근거를 누적한 기준 문서다.
   - `앱-문구-기준.txt`

7. 후속 후보 문서
   - `95_v8.1_post_copy_help_priorities_2026-07-03.md`
     - v8.1 copy/help 종료 이후 후속 후보 우선순위와 다음 audit 진입 기준을 정리한다.
     - macro range, onboarding, 남은 저위험 copy, 위험 action copy 재오픈 조건을 같은 표에서 분리한다.
   - `v8.2_macro_range_rebalance_note_2026-07-02.md`
     - 고정 매크로 목표를 범위 기반 재배분/점수 구조로 바꾸는 제품 정책/산식/점수/저장 해석 후보 메모다.
     - 현재 구현 지시서가 아니며, v8.1 copy/help 작업에 섞지 않는다. 실제 구현 전에는 별도 사전 감사가 필요하다.
   - `v8.2_macro_range_rebalance_feasibility_audit_2026-07-03.md`
     - macro range 후보를 현재 코드의 target macro, score, Records snapshot, Recent, backup 관점에서 대조한 사전 감사 문서다.
     - 결론은 copy-only 부족 / 즉시 구현 금지 / v8.2 macro-policy 설계 선행이다.
   - `v8.2_macro_range_policy_design_2026-07-03.md`
     - macro range 후보의 외부 근거 계층, 앱 정책값, 사용자-facing 계약, score version, Records snapshot, Recent, backup/restore 호환 기준을 분리한 정책/데이터 계약 설계 문서다.
     - 현재 구현 지시서가 아니며, `fatMin/fatMax` 같은 최소 필드 도입으로 구색만 맞추는 방식은 금지한다. 다음 단계는 report-only helper 설계 또는 외부 검수다.
   - `v8.2_macro_range_report_only_helper_design_2026-07-03.md`
     - macro range를 production에 적용하기 전 current fixed target과 range candidate를 나란히 비교할 report-only helper의 input/output, guard, sample matrix, impossible state, 테스트 후보를 설계한 문서다.
     - 현재 구현 지시서가 아니며, `macroRangeContract`는 저장 schema가 아니라 transient debug/report-only output 후보로만 다룬다.
   - `v8.2_macro_range_report_only_helper_implementation_2026-07-03.md`
     - report-only helper skeleton과 guard tests를 실제 코드에 추가한 구현 기록이다.
     - `index.html` 변경은 있지만 production 산식, score, `goalSnapshot`, backup/restore, Recent, Today UI, DailyCoach에는 연결하지 않는다.
   - `v8.2_macro_range_score_candidate_report_only_design_2026-07-03.md`
     - fixed score와 range score candidate를 나란히 비교하기 위한 report-only score 후보 설계 문서다.
     - 현재 구현 지시서가 아니며, `getDailyAdherenceScore`, `ADHERENCE_SCORING_VERSION`, Records/Recent/backup/Today UI에는 연결하지 않는다.
   - `v8.2_macro_range_score_candidate_report_only_implementation_2026-07-03.md`
     - range score candidate report-only helper 구현 기록이다.
     - `candidateScorePreview`는 아직 `null`이며, fixed score가 계속 source of truth다.
   - `v8.2_macro_range_snapshot_compatibility_design_2026-07-03.md`
     - macro range 후보가 나중에 저장 가능한 contract로 승격될 때 `goalSnapshot`, backup/restore, Recent, score basis를 깨지 않도록 정리한 compatibility 설계 문서다.
     - 현재 unknown snapshot field는 보존되지 않으므로, future range field는 explicit normalizer와 roundtrip 테스트 없이 열지 않는다.
   - `v8.2_macro_range_snapshot_compatibility_test_design_2026-07-03.md`
     - snapshot compatibility를 실제 테스트로 열기 전 fixture, assertion, failure mode, false positive 방지 기준을 정리한 test design 문서다.
     - schema 구현 없이 old/new basis 혼합 방지와 no-leak guard를 먼저 증명하는 것을 목표로 둔다.
   - `v8.2_macro_range_snapshot_compatibility_design_tests_implementation_2026-07-03.md`
     - `runMacroRangeSnapshotCompatibilityDesignTests` 구현 기록이다.
     - 현재 fixed snapshot 계약, unknown range field pruning, backup/restore no-leak, smart restore meals-only local snapshot basis, Recent fixed-basis aggregation, scoring version unchanged를 테스트로 고정한다.
     - production schema, normalizer, backup/restore policy, Recent range-aware logic, score version, UI는 변경하지 않는다.
   - `v8.2_macro_range_explicit_normalizer_simulation_design_2026-07-03.md`
     - known `macroRangeContract` 후보를 production normalizer 없이 test-local simulation으로 검증하기 위한 설계 문서다.
     - valid/invalid/unsupported contract 처리와 fixed snapshot survival rule을 분리하며, 저장 schema나 `normalizeGoalSnapshot` 변경은 열지 않는다.
   - `v8.2_macro_range_explicit_normalizer_simulation_tests_implementation_2026-07-03.md`
     - `runMacroRangeExplicitNormalizerSimulationDesignTests` 구현 기록이다.
     - suite 내부 test-local helper로 absent/valid/invalid/unsupported contract를 검증하고, valid simulation output도 `goalSnapshot`, backup, Recent, score, UI에 연결하지 않는다.
   - `v8.2_macro_range_signature_include_exclude_decision_design_2026-07-03.md`
     - future `macroRangeContract`를 signature에 포함할지, 제외할지, 별도 basis signature로 분리할지 판단하기 위한 docs-only 설계 문서다.
     - `GOAL_SNAPSHOT_SIGNATURE_KEYS`, `getGoalSnapshotSignature`, Records 무변경 저장, backup/restore, Recent, score, UI는 변경하지 않는다.
   - `v8.2_macro_range_signature_decision_tests_implementation_2026-07-03.md`
     - `runMacroRangeSignatureDecisionDesignTests` 구현 기록이다.
     - include / exclude / separate basis signature 후보를 suite 내부 test-local helper로 비교하고, production signature와 Records 무변경 저장 로직은 변경하지 않는다.
   - `v8.2_macro_range_backup_restore_old_new_fixture_design_2026-07-03.md`
     - macro range 후보가 future known contract로 승격될 때 full backup, records-only import, smart restore keep/replace/meals가 old fixed basis와 new range basis를 어떻게 다뤄야 하는지 fixture와 assertion을 정리한 docs-only 설계 문서다.
     - backup schema, restore policy, conflict preview, Recent, score, UI는 변경하지 않는다.
   - `v8.2_macro_range_backup_restore_fixture_tests_implementation_2026-07-03.md`
     - `runMacroRangeBackupRestoreFixtureDesignTests` 구현 기록이다.
     - old fixed basis 보존, current unknown range field no-leak, smart restore keep/replace/meals basis 차이를 테스트로 고정하고, backup schema와 restore policy는 변경하지 않는다.
   - `v8.2_onboarding_start_flow_note_2026-07-03.md`
     - 첫 실행 UX, Settings 기본값 초기화, Today 첫 계산 진입을 다루는 온보딩 후보 메모다.
     - 현재 구현 지시서가 아니며, v8.1 copy/help 작업에 섞지 않는다. 실제 구현 전에는 별도 UX 설계 감사가 필요하다.

## 충돌 판단 순서

1. 최신 대화 의도
2. 현재 git HEAD의 실제 `index.html`, 브라우저 화면, 테스트 결과
3. 현재 앱에서 실제로 자연스러운 동작
4. `99_v8.1_takeover_audit_2026-06-30.md`의 위험 분류와 금지선
5. `98_v8.1_dev_environment_reproducibility_decision_2026-07-02.md`의 QA/환경 재현성 기준
6. `02_대화의도_근거표_2026-06-16.txt`
7. `00_현재작업기준_2026-06-16.txt`
8. 주제별 참고 문서
9. 오래된 구현 또는 테스트

기준문서는 개발을 돕기 위한 도구다. 문서가 현재 앱 의도와 어긋나면 문서를 고친다.

## v8 RC6 동기화 기준

v8 RC6에서는 문서를 코드에 맞춘다. 오래된 C4.8, M2, mode, Stitch, backup 계획이 현재 화면이나 테스트와 충돌하면 현재 HEAD와 최신 release gate 결과를 우선한다.

RC6 문서 sync는 새 기능 구현 단계가 아니다. 산식, 저장 구조, backup schema, smart restore, Records 저장 구조, Today/Records/Recent/InBody/Settings Shell UI를 문서 때문에 되돌리지 않는다.

## 테스트와 render audit 주의

현재 repo에는 `package.json`과 `package-lock.json`이 있다. 새 컴퓨터에서는 먼저 `npm ci`를 실행하고, bundled Chromium이 필요하면 `npm run setup:browsers`를 실행한다.

기본 QA 진입점은 npm scripts다. 예: `npm run test:smoke`, `npm run test:ui`, `npm run test:mobile`, `npm run test:core`, `npm run test:calibration`.

`tools/render_audit/_debug/`, `manifest.json`, screenshots, pages 같은 render audit 산출물은 generated/ignored 증거물이다. render audit analyze 결과는 같은 source 시점에서 생성된 capture와 manifest일 때만 현재 UI 증거로 인정한다. source가 바뀐 뒤에는 analyze만 다시 읽지 말고 capture부터 다시 실행한다.

full exported browser tests와 render audit capture는 release gate 성격이다. 작은 docs correction에서는 `git diff --check`, 변경 파일 확인, 필요 시 smoke 선택 실행을 우선한다.

## 작업 기록 관리

자세한 작업로그는 Git 이력에 맡긴다.

기준문서에는 현재 판단에 필요한 상태, 실패 조건, 후속 후보만 남긴다.

예전 진행 순서를 계속 번호로 쌓지 않는다. 필요한 내용은 최신 상태 요약이나 체크 규칙으로 합친다.

## 선언형 문장 정리 기준

다음처럼 실행 기준 없이 다짐만 적은 문장은 그대로 남기지 않는다.

- 앞으로 헷갈리지 않게 한다.
- 원칙을 지킨다.
- 예전 방식으로 돌아가지 않는다.
- 이 문서가 제일 중요하다.

이런 문장은 도움이 되는 경우에만 실제 체크 규칙으로 바꾼다.

예시:

- 나쁜 문장: “예전 토글 구조를 쓰지 않는다.”
- 좋은 문장: “Today 화면에는 가이드/활동량 mini toggle을 렌더하지 않는다. Settings의 운동 여부 값을 기준으로 운동함/운동 안 함 모드를 선택한다.”

## 삭제된 문서 확인

역할이 겹치거나 현재 판단에 직접 쓰이지 않는 문서는 남기지 않는다. 삭제된 문서가 필요하면 Git 이력에서 확인한다.
