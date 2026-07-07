# 탄단지 다이어리 문서 안내

## 최우선 라우팅

macro range / scoring / nutrition / exercise 관련 작업은 반드시 아래 문서를 먼저 읽는다.

1. `00_current_truth/00_READ_FIRST.txt`
2. `00_current_truth/02_macro_range_current_truth.txt`
3. `00_current_truth/04_document_status_index.txt`

`v8.2_macro_range_*` 문서는 직접 따라가지 않는다. 먼저 `00_current_truth/04_document_status_index.txt`에서 KEEP / SUPERSEDE / HISTORICAL / REVIEW 상태를 확인한다.
v8.2 macro range 원문은 `archive/v8.2_macro_range/README.md`와 `archive/v8.2_macro_range/` 아래 historical archive로만 둔다.

`00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt`는 current truth 본문이 아니라 source ledger / 상세 원장이다. 최신 작업 기준은 `00_READ_FIRST`와 `02_macro_range_current_truth`가 우선한다.

새 v8.3 macro/scoring/nutrition/exercise 문서를 만들 때는 `00_current_truth/templates/new_doc_preamble.txt`의 mandatory pre-read block을 포함해야 한다.

이 폴더의 문서는 “앱이 지금 어떤 방향으로 가야 하는지”를 빠르게 확인하기 위한 기준이다. 오래된 결정 기록은 Git 이력으로 충분하므로, 현재 판단에 직접 쓰이지 않는 문서는 남기지 않는다.

## v8.3 current work products

- `v8.3_fixture_direction_table_2026-07-07.md`
  - v8.3 anchor-based continuous macro scoring 구현 전 대표 fixture의 점수 방향과 QA 판정 기준을 닫는 docs-only 문서다.
  - exact numeric score, `index.html` 구현, `ADHERENCE_SCORING_VERSION` 변경, UI/storage/schema, scoreDeltaPreview 재개를 열지 않는다.
  - 다음 본류는 v8.3 continuous scoring test design이다.

- `v8.3_continuous_scoring_test_design_2026-07-07.md`
  - fixture direction table을 자동 테스트 설계로 옮기는 docs-only test design이다.
  - monotonicity, near-zero tolerance, no plateau, no hard cap, curve-mediated collapse, null gate, alcohol axis separation, exercise-as-carb-context를 future assertion으로 닫는다.
  - exact numeric score, test implementation, `index.html` implementation, version bump, UI/storage/schema를 열지 않는다.
  - 다음 본류는 v8.3 implementation entry decision 또는 명시적 implementation task acceptance다.

- `v8.3_implementation_entry_decision_2026-07-07.md`
  - v8.3 continuous scoring 구현 브랜치에서 무엇을 바꾸고 무엇을 바꾸지 않을지 닫는 docs-only decision이다.
  - `minimal surface, complete model` 원칙으로 UI/storage/schema/scoreDelta는 열지 않되 alcohol physiology, carb exercise context, TDEE overload, fixed table replacement는 같은 구현 gate에 포함해야 한다고 정리한다.
  - target version은 `v8.3_anchor_continuous_macro_score_v1`, formula name은 `anchor_continuous_macro_score_v1`로 추천한다.
  - 다음 본류는 명시적 v8.3 continuous scoring implementation이며, 이번 구현 브랜치에서 active 상태로 전환한다.

- `v8.3_continuous_scoring_implementation_2026-07-07.md`
  - v8.3 anchor continuous macro scoring을 production score path에 구현한 기록이다.
  - `ADHERENCE_SCORING_VERSION`은 `v8.3_anchor_continuous_macro_score_v1`, formula name은 `anchor_continuous_macro_score_v1`이다.
  - `penaltyBreakdown`을 source of truth로 추가하고, `componentContributions`는 compatibility aggregate로 유지한다.
  - alcohol kcal + physiology risk, carb exercise context, TDEE overload를 같은 implementation gate에 포함했다.
  - UI/storage/schema/scoreDeltaPreview/old records migration은 계속 별도 gate다.

- `v8.3_implementation_regression_audit_2026-07-07.md`
  - 47f9e00 구현을 유지하되, v8.2 fixed-point transition helper를 historical guard로 격하한 regression cleanup 기록이다.
  - `scoringContext.weightSource`, `totalBurnSource`, `tdeeAvailable`을 추가해 body weight / TDEE fallback이 숨어 보이지 않게 했다.
  - v8.3 scoring correctness는 `runMacroRangeContinuousScoringTests`가 담당하고, transition suite의 fixed table은 production target이 아니라고 닫는다.
  - docs archive/link review는 이 regression audit 이후 별도 docs-only branch에서 처리한다.

## legacy / 참고 문서

이 섹션은 legacy/reference 목록이다. macro range / scoring / nutrition / exercise 작업에서는 아래 목록보다 `00_current_truth/00_READ_FIRST.txt`, `00_current_truth/02_macro_range_current_truth.txt`, `00_current_truth/04_document_status_index.txt`를 우선한다. `v8.2_macro_range_*` 문서는 직접 따라가지 않는다.

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

7. v8.2 macro range archive
   - `archive/v8.2_macro_range/README.md`
     - root `docs/`에 있던 `v8.2_macro_range_*.md` 65개를 historical archive로 이동한 안내 문서다.
     - 개별 v8.2 문서를 직접 따라가지 말고 `00_current_truth/04_document_status_index.txt`에서 KEEP / SUPERSEDE / HISTORICAL / REVIEW 상태를 먼저 확인한다.
     - fixed 감점표, scoreDelta 본류화, preview field 저장/노출 같은 v8.2 관성은 v8.3 current truth에 의해 대체된다.

8. 후속 후보 문서
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
