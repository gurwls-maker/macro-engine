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
  - docs archive/link review는 `docs/archive/v8.2_macro_range/README.md`와 docs-policy guard로 완료됐다.

- `v8.3_score_distribution_tuning_audit_2026-07-07.md`
  - 현재 v8.3 anchor continuous score가 실제 샘플 분포에서 너무 관대하거나 가혹한지 본 docs-only audit 문서다.
  - Baseline, TDEE overload, Alcohol, Fat, Protein, Carb/exercise, Mixed stress, Data/null 그룹을 샘플링했다.
  - FAIL은 없고, TDEE 2.0 / fat upper 3.0x / alcohol 112g-140g / UNKNOWN high carb / missing TDEE source visibility를 WATCH 후보로 남긴다.
  - anchor 값, `index.html`, UI/storage/schema, scoreDeltaPreview, old records migration은 변경하지 않는다.

- `v8.3_score_distribution_tuning_decision_2026-07-07.md`
  - score distribution audit의 WATCH 후보를 다음 행동으로 분류한 docs-only decision 문서다.
  - 즉시 score tuning implementation은 열지 않고, TDEE/fat은 curve steepness 후보, alcohol은 copy/product tone 후보, UNKNOWN carb는 context-policy 후보로 둔다.
  - missing TDEE 100점 가능성은 anchor tuning이 아니라 source visibility / scoring availability 정책 문제로 분리한다.
  - 다음 본류는 `v8.3 score source visibility decision docs-only`다.

- `v8.3_score_source_visibility_decision_2026-07-07.md`
  - missing TDEE / `targetProteinFallback` / `trainingContext:unknown` / alcohol derive source / stored score source를 분류한 docs-only decision 문서다.
  - full macro + missing TDEE는 score를 null로 막지 않고, `tdeeAvailable:false`와 `totalBurnSource:"missing"`을 source warning 구현 대상으로 둔다.
  - `targetProteinFallback`은 inferred weight source warning 대상이며, no meals / one meal / insufficient / snapshotless / range missing은 계속 null/blocked다.
  - 다음 본류는 `v8.3 source visibility implementation`이고, storage/schema/scoreDeltaPreview/old records migration은 계속 열지 않는다.

- `v8.3_source_visibility_implementation_2026-07-07.md`
  - v8.3 source visibility decision을 Today live score surface에 구현한 기록이다.
  - missing total burn / `targetProteinFallback`은 score penalty나 tuning이 아니라 사용자 해석 참고 문구로 표시한다.
  - 사용자 화면에는 `TDEE`, `scoringContext`, `penalty`, `anchor`, `curve`, `source visibility`, `targetProteinFallback` 같은 내부 용어를 노출하지 않는다.
  - stored current-version auto score는 hidden recompute하지 않고, null/blocked gate, storage/schema, backup/Recent, scoreDeltaPreview, old records migration은 계속 열지 않는다.

- `v8.3_source_visibility_qa_profile_hardening_2026-07-07.md`
  - source visibility UI regression이 full profile 전용으로 남지 않도록 `runAdherenceUiTests`를 smoke/core/ui profile에 등록한 QA hardening 기록이다.
  - 산식, source visibility helper, 사용자 문구, storage/schema, scoreDeltaPreview, old records migration은 변경하지 않는다.
  - `npm test`, `npm run test:core`, `npm run test:ui`가 Today source visibility warning 회귀를 잡는 것을 목표로 한다.

- `current_truth_legacy_doc_role_review_2026-07-07.md`
  - root legacy/reference 문서 8개의 현재 역할을 분류한 docs-only review 문서다.
  - `00_현재작업기준`, `02_대화의도`, `v8_*` 기준문서, ACSM 해설, 앱 문구 기준을 KEEP_CURRENT_REFERENCE / ABSORBED_INTO_CURRENT_TRUTH / EXTERNAL_REFERENCE_ONLY / COPY_REFERENCE_ONLY / HISTORICAL_REFERENCE / REVIEW_BEFORE_MOVE로 나눈다.
  - 실제 파일명 변경, 폴더 이동, archive 처리, `index.html` reference 수정, 산식/UI/storage/schema 변경은 하지 않는다.
  - 후속 routing/consolidation decision은 `legacy_reference_routing_consolidation_decision_2026-07-08.md`로 닫혔다.

- `legacy_reference_routing_consolidation_decision_2026-07-08.md`
  - root legacy/reference 문서 8개의 실제 move 전 destination map을 닫은 docs-only decision 문서다.
  - Option B reference folder split을 선택했고, 실제 routing implementation은 `docs/references/product`, `docs/references/external`, `docs/references/copy`, `docs/references/historical` 구조로 적용됐다.
  - README 충돌 판단 순서는 current truth / status index를 legacy 00/02보다 우선하도록 정리한다.
  - 산식/UI/storage/schema 변경과 app display version alignment는 여전히 별도 gate다.

- `app_display_version_alignment_decision_2026-07-08.md`
  - scoring version `v8.3_anchor_continuous_macro_score_v1`와 앱 표시 label `v8.0`의 불일치를 정리한 docs-only decision 문서다.
  - 선택한 방향은 app display label `v8.3`과 backup appVersion metadata `v8.3` 정렬이다.
  - package.json version과 `FULL_BACKUP_VERSION`은 이번 alignment에서 유지한다.
  - 실제 title/header/fallback/STAGE/NOTE/test 갱신은 `v8.3_app_display_version_alignment_implementation_2026-07-08.md`로 구현됐다.

- `v8.3_app_display_version_alignment_implementation_2026-07-08.md`
  - app display version alignment decision을 구현한 implementation log다.
  - `index.html` title/header badge/helper fallback/full backup appVersion expectation/top comment를 `v8.3`으로 정렬한다.
  - package.json version, `FULL_BACKUP_VERSION`, scoring formula, scoring version, storage/schema, scoreDeltaPreview, old-record migration은 변경하지 않는다.

- `v8.3_implementation_qa_closeout_2026-07-08.md`
  - v8.3 continuous scoring, source visibility, legacy reference routing, app display alignment을 한 implementation block으로 검산한 docs-only QA closeout이다.
  - static QA와 full test profile을 통과한 상태를 기록하되, score tuning / UI / storage / scoreDelta / old records migration은 열지 않는다.
  - 다음 본류는 score distribution WATCH 후보를 실제 tuning readiness decision으로 재검토하는 것이다.

- `v8.3_score_watch_tuning_readiness_decision_2026-07-08.md`
  - score distribution audit의 WATCH 후보 W01~W06을 다시 본 docs-only decision 문서다.
  - 즉시 score tuning implementation은 열지 않고, TDEE/fat/UNKNOWN carb는 회귀 테스트 보강 후보, alcohol tone은 DailyCoach/copy 후보, missing TDEE는 source visibility로 resolved 처리한다.
  - 다음 본류는 v8.3 WATCH 후보 회귀 테스트 보강이며, anchor 값/UI/storage/schema/scoreDelta/old records migration은 열지 않는다.

- `v8.3_watch_regression_test_hardening_2026-07-08.md`
  - WATCH 후보를 score tuning 없이 `runMacroRangeContinuousScoringTests` 중심으로 잠근 test-only implementation log다.
  - TDEE rawScore post-clamp, fat excess, alcohol amount, unknown carb context, training context no alcohol discount를 보강했고, missing TDEE source visibility는 existing guard로 already-covered 처리한다.
  - 다음 본류는 v8.3 DailyCoach/copy tone decision이며, anchor 값/UI/storage/schema/scoreDelta/old records migration은 열지 않는다.

- `v8.3_dailycoach_copy_tone_decision_2026-07-08.md`
  - WATCH 이후 남은 alcohol/carb/training 사용자-facing tone을 C01~C06 matrix로 닫은 docs-only decision 문서다.
  - 현재 DailyCoach 구현은 alcohol risk를 숨기지 않고 training context를 alcohol 면제권으로 쓰지 않는 방향이라 유지한다.
  - 다음 본류는 DailyCoach/copy implementation이 아니라 v8.3 DailyCoach/copy regression test hardening이다.
  - score tuning, UI/storage/schema, scoreDeltaPreview, old records migration은 열지 않는다.

- `v8.3_dailycoach_copy_regression_hardening_2026-07-08.md`
  - DailyCoach/copy tone decision의 C01~C06 조합을 `runDailyCoachTestCases`에 고정한 test-only implementation log다.
  - alcohol 112g/140g, alcohol + high carb + training/rest, high-volume high carb, source/internal term, low-record certainty guard를 추가했다.
  - `runDailyCoachTestCases`를 core profile에도 등록해 DailyCoach/copy 회귀가 전용 script에만 남지 않도록 했다.
  - DailyCoach production copy, priority, score anchor 값, UI/storage/schema, scoreDeltaPreview, old records migration은 변경하지 않는다.
  - 다음 본류는 새 copy 구현이 아니라 v8.3 stabilization/tag readiness checkpoint다.

- `v8.3_stabilization_tag_readiness_checkpoint_2026-07-08.md`
  - v8.3 scoring implementation block을 release/tag 후보로 볼 수 있는지 점검한 docs-only checkpoint다.
  - 산식 구현, source visibility, reference routing, app display alignment, WATCH regression, DailyCoach/copy regression, docs-policy, test profile coverage를 한 묶음으로 검산한다.
  - 결론은 `tag-ready after PR merge`이며, 실제 tag 생성은 이번 문서에서 하지 않는다.
  - score tuning, DailyCoach/copy rewrite, UI/storage/schema, scoreDeltaPreview, old records migration은 별도 future gate로 남긴다.
  - 다음 본류는 사용자 화면 정합성 확인 중 새로 열린 `v8.3_macro_card_range_display_decision_2026-07-08.md`로 재분류됐다.

- `v8.3_macro_card_range_display_decision_2026-07-08.md`
  - v8.3 range-aware score와 Today macro card의 단일 target/남음/초과 표시가 충돌할 수 있는지 판단한 docs-only decision 문서다.
  - 결론은 merge/tag instruction 폐기가 아니라 tag 전 macro card range display narrow implementation 필요다.
  - 탄수화물/단백질/지방은 `오늘 범위` 용어로 통일하고, card는 짧게 유지하며 긴 운동/탄수 설명은 DailyCoach 계열로 분리한다.
  - copy test가 AI스럽거나 낡은 문구를 고정하면 앱 문구를 테스트에 맞추기보다 test expectation 갱신도 허용한다고 닫는다.
  - 다음 본류는 v8.3 macro card range display implementation이며, score formula/UI redesign/storage/schema/scoreDelta/old records migration은 열지 않는다.

- `v8.3_macro_card_range_display_implementation_2026-07-08.md`
  - Today macro card에 탄수화물/단백질/지방 compact range chip과 range-aware 상태 문구를 좁게 구현한 implementation log다.
  - Today range chip은 별도 표시용 cap이 아니라 현재 v8.3 scoring boundary와 정렬한다.
  - kcal/alcohol/tooltip/DailyCoach rewrite/Records/Recent/storage/schema/scoreDelta/old records migration은 열지 않는다.
  - `오늘 해석 범위`, `회복재료`, 내부 산식 용어가 Today macro card에 나오지 않도록 UI/copy regression을 보강한다.
  - 이 정렬 이후 target macros 그대로 섭취해도 낮은 점수가 나오는 release blocker가 드러났고, 다음 본류는 `v8.3_target_scoring_alignment_incident_decision_2026-07-08.md`로 재분류됐다.

- `v8.3_target_scoring_alignment_incident_decision_2026-07-08.md`
  - macro card range를 scoring boundary와 맞춘 뒤 드러난 target generator / scoring range mismatch를 release blocker로 재분류한 docs-only incident decision이다.
  - 재현값은 앱 target 그대로 섭취 시 score `83.712`, target carbs `594.9g`이 carb range `210g~525g` 밖, target fat `124.8g`이 fat range `53g~94g` 밖인 상태다.
  - UI-only display cap은 계속 폐기하고, 문제는 target/scoring shared policy implementation으로 해결해야 한다고 닫는다.
  - 다음 본류는 v8.3 target/scoring alignment implementation이며, merge/tag instruction과 stabilization/tag readiness update는 이 incident가 닫힐 때까지 보류한다.

- `v8.3_target_scoring_alignment_implementation_2026-07-08.md`
  - target/scoring alignment incident를 닫는 implementation log다.
  - `getV83TargetAlignedMacroRanges`로 target generator, scoring range, macro card range가 같은 boundary를 보게 했다.
  - Today 목표 자동 조정 옵션을 추가해 탄수화물/지방 target이 같은 kcal 안에서 교환되도록 했고, 3일/7일 반복 고탄수/고지방 trend limiter를 붙였다.
  - high-volume carb anchor는 flat no-penalty permission이 아니라 target-centered curve context로 유지한다.
  - 다음 본류는 target/scoring alignment QA closeout이며, merge/tag 재개는 closeout과 smoke check 이후 판단한다.

- `v8.3_target_scoring_alignment_qa_closeout_2026-07-08.md`
  - target/scoring alignment implementation을 다시 검산한 QA closeout / regression checkpoint다.
  - 초기 3일/7일 count bucket limiter를 폐기하고 `continuous_recency_weighted_excess` pressure 모델로 보강했다.
  - 자동 운동 context label threshold가 carb boundary를 계단식으로 뛰게 하지 않도록 `continuous_training_load_interpolation`을 고정했다.
  - Today adaptive target이 target/TDEE overage를 숨기지 않고, Records `goalSnapshot`은 adaptive live target이 아니라 selected calculation target을 보존한다고 닫는다.
  - `오늘 목표 자동 조정`은 persistent setting surface이므로 대규모 migration은 아니지만 저장되는 설정 field 추가 사실과 full backup/restore 보존 경로를 결과로그에서 명시해야 한다.
  - 다음 본류는 stabilization/tag readiness checkpoint update이며, 바로 merge/tag로 가지 않는다.

- `v8.3_stabilization_tag_readiness_checkpoint_update_2026-07-09.md`
  - target/scoring alignment QA closeout 결과를 기존 stabilization/tag readiness 판단에 통합한 docs-only readiness update다.
  - `8fdd36e` 기준으로는 QA closeout이 필요했지만, 현재 `ca09860` 기준에서는 해당 QA가 닫혔으므로 release-blocking target/scoring mismatch가 닫혔다고 재판정한다.
  - `오늘 목표 자동 조정`은 persistent setting surface이며, `adaptiveMacroTargetsEnabled` 저장/백업/복원 영향을 숨기지 않는다고 다시 고정한다.
  - 결론은 tag-ready candidate after checkpoint update다. 단, 실제 merge/tag/push는 사용자 명시 지시 전까지 보류한다.
  - score tuning, broad UI redesign, tooltip/glossary, storage/schema, scoreDeltaPreview, old records migration은 별도 future gate다.

- `v8.3_post_tag_release_closeout_2026-07-09.md`
  - v8.3 merge/tag 이후 release state를 닫은 docs-only post-tag closeout이다.
  - `master` no-ff merge commit `0333d9c`에 annotated tag `v8.3`을 생성/push했고, remote master와 tag peeled target도 `0333d9c`로 확인했다.
  - v8.3 included scope는 anchor continuous macro scoring, target/scoring alignment, Today macro card range display, source visibility, DailyCoach/copy guard, WATCH guard, legacy/reference routing, app display v8.3 alignment, docs-policy/test profile hardening이다.
  - post-v8.3 deferred 항목은 score tuning, DailyCoach/copy rewrite, tooltip/glossary, kcal/alcohol range display, UI/storage/schema, scoreDeltaPreview product path, legacy/dev records cleanup/reset/fallback, package version policy다.
  - 이 문서의 다음 후보였던 post-v8.3 backlog triage는 `post_v8.3_backlog_triage_2026-07-09.md`로 닫혔다. v8.3 tag를 다시 만들거나 옮기지 않는다.

- `post_v8.3_backlog_triage_2026-07-09.md`
  - v8.3 release/tag/post-tag closeout 이후 남은 후보를 구현 전 분류한 docs-only triage 문서다.
  - 사용자 재검토를 반영해 score tuning과 carb upper/high-volume tuning은 V8_3_1_CANDIDATE as protocol/evidence decision으로 승격하고, 바로 숫자 구현하지 않는다.
  - kcal range display product UI와 scoreDeltaPreview product path는 REJECT로 정정한다. kcal은 range UI가 아니라 calorie target/source reliability audit 대상으로만 본다.
  - old records는 보존/마이그레이션 기본값이 아니라 legacy/dev records cleanup/reset/fallback decision으로 재정의한다.
  - 이 문서의 다음 후보였던 `v8.3.1 scoring tuning protocol decision docs-only`는 `v8.3.1_scoring_tuning_protocol_decision_2026-07-09.md`로 닫혔다.
  - score formula/UI/storage/schema/scoreDelta/old records implementation은 열지 않는다.

- `v8.3.1_scoring_tuning_protocol_decision_2026-07-09.md`
  - post-v8.3 score tuning 후보를 바로 구현하지 않고, 튜닝을 열기 위한 evidence / fixture / user confirmation protocol로 닫은 docs-only decision 문서다.
  - 외부근거 anchor와 앱 policy coefficient를 분리하고, TDEE overload, fat high, carb upper/high-volume, UNKNOWN training context, adaptive target limiter, alcohol, calorie source, old records 후보를 각각 분류한다.
  - 이 문서의 다음 후보였던 `v8.3.1 scoring tuning evidence pack`은 `v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md`로 닫혔다.
  - kcal range display product UI와 scoreDeltaPreview product path는 REJECT 유지, old records cleanup/reset/fallback은 별도 product-data decision 유지다.
  - score formula, anchor 값, curve steepness, adaptive limiter, UI/storage/schema는 변경하지 않는다.

- `lightweight_anti_inertia_routine_2026-07-09.md`
  - 긴 경계 프롬프트 수동 의존을 줄이기 위한 docs-only lightweight process guard다.
  - 위험 작업 전 one-minute `PROMPT_SCOPE_AUDIT`로 요청 다음 단계와 repo/current truth 다음 단계를 비교하되, 대부분은 결과로그에 짧게 남기는 것으로 충분하다고 닫는다.
  - anti-loop / stale-routine / supersede 규칙을 포함해 이 루틴 자체가 새 관성이 되지 않도록 제한한다.
  - 이 문서는 새 product gate가 아니며, product gate 상태는 current truth / status index를 따른다.
  - evidence pack, score tuning implementation, UI/storage/schema, scoreDeltaPreview, old records cleanup/reset/fallback은 열지 않는다.

- `v8.3.1_scoring_tuning_evidence_pack_2026-07-09.md`
  - current `73166f4` 기준으로 TDEE overload, fat excess, carb upper/high-volume, UNKNOWN training context, protein excess, adaptive limiter, alcohol handling의 현재 출력표를 수집한 docs-only evidence pack이다.
  - E01~E07을 USER_CONFIRMATION_NEEDED / MORE_SAMPLES_NEEDED / COPY_NOT_SCORE / MONITOR_ONLY로 분류하고, 직접 숫자 구현 readiness는 아직 없다고 닫는다.
  - 다음 후보였던 user confirmation answers는 `v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md`에서 objective rubric으로 재정렬됐다.
  - scoreDeltaPreview product path와 kcal range display product UI는 REJECT 유지다.

- `v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md`
  - scoring tuning objective rubric을 닫은 docs-only decision 문서다.
  - 사용자가 exact score나 coefficient를 고르는 구조를 폐기하고, Codex가 외부근거 anchor / current output / objective score band / simulation / regression 설계를 책임지는 구조로 바꾼다.
  - aligned / acceptable / warning / problem / serious / severe / display collapse score-band language를 정의하고, E01~E07 후보를 이 band에 맞춰 재분류한다.
  - 이 문서의 다음 후보였던 `v8.3.1 scoring tuning curve candidate simulation decision`은 `v8.3.1_scoring_tuning_curve_candidate_simulation_decision_2026-07-09.md`로 닫혔다.
  - score formula, anchor 값, curve steepness, adaptive limiter, UI/storage/schema는 변경하지 않는다.

- `v8.3.1_scoring_tuning_curve_candidate_simulation_decision_2026-07-09.md`
  - objective score band 기준으로 현재 v8.3.1 출력과 후보 곡선을 비교한 docs-only simulation decision 문서다.
  - accepted candidate는 `current_curve_with_guarded_outputs`이며, TDEE/fat/carb/high-volume/UNKNOWN/alcohol 출력은 현재 band 안에서 설명 가능하다고 닫는다.
  - adaptive limiter는 방향은 유지하지만 3일/7일 high-carb/high-fat/mixed 샘플이 더 필요하므로 numeric limiter tuning은 열지 않는다.
  - numeric tuning implementation, anchor 값 변경, curve steepness 변경, adaptive limiter 변경은 모두 열지 않는다.
  - 다음 gate는 `v8.3.1 user-facing range explanation/copy decision`이다.

## legacy / 참고 문서

이 섹션은 legacy/reference 목록이다. macro range / scoring / nutrition / exercise 작업에서는 아래 목록보다 `00_current_truth/00_READ_FIRST.txt`, `00_current_truth/02_macro_range_current_truth.txt`, `00_current_truth/04_document_status_index.txt`를 우선한다. `v8.2_macro_range_*` 문서는 직접 따라가지 않는다.

1. `99_v8.1_takeover_audit_2026-06-30.md`
   - v8.0 final 이후 인수인계 감사 문서다.
   - 실제 동작 판단은 `v8.0` tag가 가리키는 HEAD 코드와 테스트가 우선이고, 이 문서는 다음 작업 착수 전 위험 분류와 금지선 판단에 쓴다.

2. `98_v8.1_dev_environment_reproducibility_decision_2026-07-02.md`
   - 개발환경 재현성, Playwright 의존성, npm scripts, render audit 증거 기준을 정리한다.
   - 앱 구현 작업 전에 현재 테스트 실행 환경이 충분한지 확인할 때 읽는다.

3. `references/product/legacy_product_working_criteria_2026-06-16.txt`
   - 과거 최상위 작업 기준이지만 지금은 current truth보다 우선하지 않는 legacy/reference 문서다.
   - 역할 판단은 `current_truth_legacy_doc_role_review_2026-07-07.md`와 `00_current_truth/04_document_status_index.txt`를 먼저 따른다.

4. `references/product/legacy_user_intent_ledger_2026-06-16.txt`
   - 과거 대화 의도 ledger다.
   - 최신 사용자 의도와 `00_current_truth` 라우팅을 우선하고, 이 문서는 근거 확인용으로만 읽는다.

5. 작업 주제별 참고 문서
   - `references/product/exercise_mode_code_impact_audit_2026-06-15.txt`
   - `references/product/tdee_time_ownership_design_2026-06-15.txt`
   - `references/external/macro_external_anchor_policy_table_2026-06-05.txt`
   - `references/external/acsm_resistance_training_guide_ko_2026.txt`
   - `references/historical/exercise_profile_formula_historical_map_2026-06-04.txt`
   - 이 문서들은 current truth가 아니라 role-specific reference다. 세부 역할은 각 `references/*/README.md`와 `current_truth_legacy_doc_role_review_2026-07-07.md`를 따른다.

6. 문구를 바꿀 때만 읽을 문서
   - `96_v8.1_copy_help_closeout_2026-07-03.md`
     - v8.1 copy/help 종료 판단을 요약한 closeout 문서다.
   - `97_v8.1_copy_help_inventory_2026-07-02.md`
     - v8.1 copy/help 구현, 감사, 종료 후보 판단의 상세 근거를 누적한 기준 문서다.
   - `references/copy/app_copy_guidelines.txt`

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
2. `00_current_truth/00_READ_FIRST.txt`, `00_current_truth/02_macro_range_current_truth.txt`, `00_current_truth/04_document_status_index.txt`
3. 현재 git HEAD의 실제 `index.html`, 브라우저 화면, 테스트 결과
4. 현재 앱에서 실제로 자연스러운 동작
5. status index에서 KEEP_CURRENT_REFERENCE / EXTERNAL_REFERENCE_ONLY / COPY_REFERENCE_ONLY로 분류된 topic reference
6. historical/archive 문서
7. 오래된 구현 또는 테스트

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
