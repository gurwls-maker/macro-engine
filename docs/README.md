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
   - `v8.2_macro_range_score_severity_policy_design_2026-07-03.md`
     - `candidateScorePreview`와 `scoreDeltaPreview`를 숫자로 만들기 전에 닫아야 할 severity / weight / data quality / old-record policy decision을 정리한 docs-only 설계 문서다.
     - production score, `getDailyAdherenceScore`, `ADHERENCE_SCORING_VERSION`, storage/schema, Recent, UI, DailyCoach는 변경하지 않는다.
   - `v8.2_macro_range_score_severity_policy_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreSeverityPolicyDesignTests` 구현 기록이다.
     - score severity policy design의 `candidateScorePreview` null, `scoreDeltaPreview` null, component `pointsPreview` null, old fixed Records 저장값 no-mutation, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_numeric_preview_gate_design_2026-07-05.md`
     - `candidateScorePreview`, component `pointsPreview`, `scoreDeltaPreview`를 숫자로 만들기 전에 닫아야 할 scope / weight / severity / data quality / old Records / no-leak gate를 정리한 docs-only 설계 문서다.
     - 현재 결론은 숫자화 readiness 없음이며, 다음에 열 수 있는 것은 numeric preview gate를 보호하는 test-only guard까지다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_numeric_preview_gate_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreNumericPreviewGateDesignTests` 구현 기록이다.
     - Gate A-F inventory closed, `candidateScorePreview` null, component `pointsPreview` null, `scoreDeltaPreview` null, full-day candidate no numeric preview, old fixed Records 저장값 no-mutation, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_numeric_preview_weight_severity_decision_2026-07-05.md`
     - `candidateScorePreview` 숫자화 전에 weight / severity 방향을 penalty-only docs-only 정책으로 정리한 문서다.
     - kcal/protein anchor lane, fat/carbExchange range evidence lane, dataQuality eligibility lane을 분리하고, inside_recommended / exchange_explained는 보너스가 아니라고 고정한다.
     - candidateScorePreview, component pointsPreview, scoreDeltaPreview, production score, storage/schema, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_weight_severity_decision_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreWeightSeverityDecisionDesignTests` 구현 기록이다.
     - anchor / range evidence / eligibility lane, blocked / strong / material / observation / neutral severity lane, no-bonus, candidateScorePreview null, component pointsPreview null, scoreDeltaPreview null, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_records_basis_version_decision_2026-07-05.md`
     - `candidateScorePreview` 숫자화 전 old/new Records score basis와 candidate score version naming을 한 문서에서 닫는 docs-only 결정 문서다.
     - old fixed Records의 stored/raw score basis는 fixed로 유지하고, future candidate score version은 `ADHERENCE_SCORING_VERSION`과 분리된 test-local preview 이름으로만 예약한다.
     - candidateScorePreview, component pointsPreview, scoreDeltaPreview, production score, storage/schema, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_records_basis_version_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreRecordsBasisVersionDecisionTests` 구현 기록이다.
     - old fixed Records stored/raw fixed basis, unknown range field prune, future range-basis Records not-current, candidate score version naming 분리, preview null, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_test_local_numeric_helper_entry_decision_2026-07-05.md`
     - test-local numeric helper를 열기 전 입구 조건을 정리한 docs-only 결정 문서다.
     - 첫 숫자 후보는 production-facing `candidateScorePreview`, component `pointsPreview`, `scoreDeltaPreview`가 아니라 test-local 전용 output에만 존재해야 한다고 닫는다.
     - production score, storage/schema, Recent aggregation, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_records_latest_policy_correction_2026-07-05.md`
     - Records latest-policy current source of truth 보정 문서다.
     - `저장값 변경 금지 != 재계산 금지`를 명시하고, sufficient detailed old fixed Records는 latest-policy preview eligibility 후보가 될 수 있다고 정리한다.
     - simple / weight_only / snapshotless / insufficient Records는 numeric preview 대상이 아니며, candidateScorePreview, pointsPreview, scoreDeltaPreview, production score, storage/schema, Recent, UI, DailyCoach는 변경하지 않는다.
   - `v8.2_macro_range_score_records_latest_policy_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreRecordsLatestPolicyCorrectionTests` 구현 기록이다.
     - old fixed Records automatic exclusion 제거, sufficient detailed old fixed Records preview eligibility, simple / weight_only / snapshotless / insufficient 제외, saved adherencePercent / adherenceScoringVersion no-overwrite, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - numeric helper, candidateScorePreview, pointsPreview, scoreDeltaPreview, production score, storage/schema, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_test_local_numeric_helper_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreTestLocalNumericHelperTests` 구현 기록이다.
     - 숫자를 production-facing `candidateScorePreview`, `pointsPreview`, `scoreDeltaPreview`가 아니라 `testLocalCandidateScorePreview`와 `testLocalComponentPoints`에만 계산하는 test-only helper로 연다.
     - full_day_candidate와 sufficient detailed old fixed Records만 숫자 후보이며, simple / weight_only / snapshotless / insufficient Records는 null/blocked로 유지한다.
     - production score, storage/schema, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_report_only_numeric_preview_entry_decision_2026-07-05.md`
     - test-local numeric output을 report-only object에 넣을 수 있는지 판단하는 docs-only 결정 문서다.
     - 결론은 조건부 허용이며, 숫자는 `testLocalNumericPreview` nested object 안에만 둘 수 있고 `candidateScorePreview`, `pointsPreview`, `scoreDeltaPreview` production-facing field는 계속 null로 둔다.
     - production score, storage/schema, backup, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_report_only_numeric_preview_entry_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreReportOnlyNumericPreviewEntryDecisionTests` 구현 기록이다.
     - `testLocalNumericPreview` nested-only, blocked record nested null, production-facing numeric promotion reject, backup / Recent / UI / DailyCoach no-impact guard를 테스트로 고정한다.
     - candidateScorePreview, pointsPreview, scoreDeltaPreview, production score, storage/schema, Recent, UI, DailyCoach, production macro range는 변경하지 않는다.
   - `v8.2_macro_range_score_report_only_numeric_preview_entry_implementation_2026-07-05.md`
     - `buildMacroRangeScoreCandidateReportOnly()` output에 `testLocalNumericPreview` nested object를 실제로 붙인 제한 구현 기록이다.
     - 숫자는 nested test-local field에만 존재하며 production-facing `candidateScorePreview`, component `pointsPreview`, `scoreDeltaPreview`, storage/schema, Recent, UI, DailyCoach는 계속 닫혀 있다.
   - `v8.2_macro_range_score_report_only_numeric_preview_consumer_no_leak_audit_2026-07-05.md`
     - `testLocalNumericPreview`가 report-only output에 실제로 붙은 뒤 backup / restore, normalizer, Recent, DailyCoach, UI, Records state, fixed score 소비자가 이를 잘못 읽지 않도록 consumer/no-leak map을 정리한 docs-only 감사 문서다.
     - 다음 안전 후보는 `runMacroRangeScoreReportOnlyNumericPreviewConsumerNoLeakTests` test-only guard이며, production consumer 연결, storage/schema, Recent aggregation, UI, DailyCoach, candidateScorePreview / pointsPreview / scoreDeltaPreview 숫자화는 계속 금지한다.
   - `v8.2_macro_range_score_report_only_numeric_preview_consumer_no_leak_tests_implementation_2026-07-05.md`
     - `runMacroRangeScoreReportOnlyNumericPreviewConsumerNoLeakTests` 구현 기록이다.
     - leaky raw record/snapshot, backup/restore, Recent, fixed score, DailyCoach, UI, Records state, promoted consumer payload를 test-only로 검증해 `testLocalNumericPreview`가 production consumer로 새지 않도록 고정한다.
     - `test:macro-policy`와 `tools/render_audit` core profile에 등록하고, 이전부터 `test:macro-policy`에만 있던 targetCal / modeFree policy suite도 core profile 등록 누락을 보강한다.
     - production consumer 연결, storage/schema, Recent aggregation, UI, DailyCoach, candidateScorePreview / pointsPreview / scoreDeltaPreview 숫자화는 계속 금지한다.
   - `v8.2_macro_range_score_report_only_numeric_preview_phase_closeout_2026-07-05.md`
     - report-only numeric preview 라인의 phase closeout / readiness checkpoint 문서다.
     - `testLocalNumericPreview` nested-only, consumer no-leak, macro-policy/core registration coverage까지 닫되, production `candidateScorePreview`, `pointsPreview`, `scoreDeltaPreview`, score/storage/UI/DailyCoach/Recent gate는 아직 열지 않는다고 정리한다.
   - `v8.2_macro_range_score_storage_separation_decision_2026-07-05.md`
     - score 후보와 storage 후보를 분리하는 docs-only decision 문서다.
     - future `candidateScorePreview`는 열리더라도 기본적으로 transient preview이며, record / goalSnapshot / backup 저장 계약은 별도 score persistence gate 없이는 계속 닫는다고 정리한다.
   - `v8.2_macro_range_candidate_score_preview_field_decision_2026-07-05.md`
     - future `candidateScorePreview` field의 이름, 위치, nullability, blocked behavior, old fixed Records behavior, visibility 기본값을 정리한 docs-only decision 문서다.
     - 허용 위치는 `rangeScoreCandidateSummary.candidateScorePreview` 후보로 제한하고, 기본값은 null이며 저장/표시/scoreDelta/pointsPreview는 별도 gate로 남긴다.
   - `v8.2_macro_range_component_points_preview_shape_decision_2026-07-05.md`
     - future component `pointsPreview` field의 이름, 위치, nullability, status/reasonIds, blocked behavior, visibility 기본값을 정리한 docs-only decision 문서다.
     - 허용 위치는 `rangeScoreCandidateSummary.componentPreviews.<component>.pointsPreview` 후보로 제한하고, 기본값은 null이며 numeric value, storage, backup, Recent, UI, DailyCoach, scoreDelta는 별도 gate로 남긴다.
   - `v8.2_macro_range_component_points_preview_numeric_policy_test_design_2026-07-06.md`
     - future component `pointsPreview` numeric policy를 구현하기 전에 필요한 test-only guard의 fixture, assertion, no-leak 금지선을 정리한 docs-only test design 문서다.
     - `pointsPreview`, `candidateScorePreview`, `scoreDeltaPreview`는 계속 null이며, dataQuality null-only, neutral no-bonus, old fixed Records no-overwrite, storage / backup / Recent / UI / DailyCoach no-leak을 유지한다.
   - `v8.2_macro_range_component_points_preview_numeric_policy_tests_implementation_2026-07-06.md`
     - `runMacroRangeComponentPointsPreviewNumericPolicyDesignTests` 구현 기록이다.
     - component lane / severity lane / blocked dataQuality / neutral no-bonus / old fixed Records no-mutation / promoted payload rejection / backup, Recent, UI, DailyCoach no-impact를 test-only로 고정한다.
     - `window` export, `test:macro-policy`, `tools/render_audit` core profile에 등록하며, production score, storage/schema, UI, Recent, DailyCoach, `candidateScorePreview` / `pointsPreview` / `scoreDeltaPreview` 숫자화는 계속 금지한다.
   - `v8.2_macro_range_candidate_score_preview_numeric_policy_test_design_2026-07-06.md`
     - future `candidateScorePreview` numeric policy를 구현하기 전에 필요한 test-only guard의 fixture, assertion, no-leak 금지선을 정리한 docs-only test design 문서다.
     - `testLocalNumericPreview.testLocalCandidateScorePreview`는 nested test-local evidence로만 유지하고, `rangeScoreCandidateSummary.candidateScorePreview`, `comparison.candidateScorePreview`, `scoreDeltaPreview`, component `pointsPreview`, storage / backup / Recent / UI / DailyCoach 연결은 계속 닫는다.
   - `v8.2_macro_range_candidate_score_preview_numeric_policy_tests_implementation_2026-07-06.md`
     - `runMacroRangeCandidateScorePreviewNumericPolicyDesignTests` 구현 기록이다.
     - nested test-local `testLocalCandidateScorePreview`와 production-facing `candidateScorePreview`를 분리하고, comparison candidate score / scoreDelta / component pointsPreview / storage / backup / Recent / UI / DailyCoach no-leak을 test-only로 고정한다.
     - `window` export, `test:macro-policy`, `tools/render_audit` core profile에 등록하며, production score, storage/schema, UI, Recent, DailyCoach, `candidateScorePreview` / `pointsPreview` / `scoreDeltaPreview` 숫자화는 계속 금지한다.
   - `v8.2_macro_range_score_delta_preview_policy_decision_2026-07-06.md`
     - future `scoreDeltaPreview` field의 이름, 위치, nullability, last-gate 성격, no-leak 금지선을 정리한 docs-only decision 문서다.
     - 허용 위치는 `comparison.scoreDeltaPreview` 후보 한 곳으로 제한하고, `candidateScorePreview`가 숫자로 열려도 별도 gate 전까지 null이며 storage / backup / Recent / UI / DailyCoach 연결은 계속 닫는다.
   - `v8.2_macro_range_score_delta_preview_policy_test_design_2026-07-06.md`
     - future `scoreDeltaPreview` policy를 테스트로 고정하기 전에 필요한 fixture, assertion, no-leak 금지선을 정리한 docs-only test design 문서다.
     - `comparison.scoreDeltaPreview`는 계속 null이며, candidate null이면 delta null, component `pointsPreview` null이면 delta null, old fixed Records no-mutation, storage / backup / Recent / UI / DailyCoach no-leak, promoted payload rejection을 future suite 기준으로 닫는다.
   - `v8.2_macro_range_score_delta_preview_policy_tests_implementation_2026-07-06.md`
     - `runMacroRangeScoreDeltaPreviewPolicyDecisionTests` 구현 기록이다.
     - candidate null delta null, unapproved numeric payload delta null, blocked dataQuality sentinel delta 금지, old fixed Records no-mutation, promoted scoreDeltaPreview payload rejection, backup / Recent / UI / DailyCoach no-impact를 test-only로 고정한다.
     - `window` export, `test:macro-policy`, `tools/render_audit` core profile에 등록하며, production score, storage/schema, UI, Recent, DailyCoach, `candidateScorePreview` / `pointsPreview` / `scoreDeltaPreview` 숫자화는 계속 금지한다.
   - `v8.2_macro_range_score_preview_guard_phase_closeout_2026-07-06.md`
     - component `pointsPreview`, `candidateScorePreview`, `scoreDeltaPreview` guard 라인을 묶어 닫는 phase closeout / readiness checkpoint 문서다.
     - production-facing preview field 이름과 허용 위치는 제한됐지만 숫자화, score formula, storage/schema, Recent, UI, DailyCoach, production score readiness는 아직 열리지 않았다고 정리한다.
   - `v8.2_macro_range_component_points_preview_numeric_formula_decision_2026-07-06.md`
     - future transient component `pointsPreview`가 숫자로 열릴 때 사용할 component-local formula 후보를 정리한 docs-only decision 문서다.
     - non-positive integer contribution, positive bonus 금지, dataQuality null-only, blocked/unresolved null 유지로 닫고, candidateScorePreview 합산 / scoreDeltaPreview / storage / UI / Recent / DailyCoach 연결은 별도 gate로 남긴다.
   - `v8.2_macro_range_component_points_preview_numeric_formula_test_design_2026-07-06.md`
     - future component `pointsPreview` numeric formula를 테스트로 고정하기 전에 필요한 fixture, exact value assertion, no-leak 금지선을 정리한 docs-only test design 문서다.
     - component/status별 exact expected value를 기준으로 검증하고, severity label 전역 정렬 금지, positive bonus rejection, dataQuality null-only, candidateScorePreview / scoreDeltaPreview / storage / UI / Recent / DailyCoach 별도 gate를 유지한다.
   - `v8.2_macro_range_component_points_preview_numeric_formula_tests_implementation_2026-07-06.md`
     - `runMacroRangeComponentPointsPreviewNumericFormulaDecisionTests` 구현 기록이다.
     - formula identity, component/status별 exact expected value, positive/fractional/blocked sentinel/dataQuality sentinel rejection, old fixed Records no-mutation, backup / Recent / UI / DailyCoach no-impact를 test-only로 고정한다.
     - `window` export, `test:macro-policy`, `tools/render_audit` core profile에 등록하며, production `pointsPreview`, `candidateScorePreview`, `scoreDeltaPreview`, storage/schema, UI, Recent, DailyCoach 연결은 계속 금지한다.
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
   - `v8.2_macro_range_recent_mixed_basis_handling_design_2026-07-03.md`
     - future range basis가 저장 가능한 후보로 승격될 때 Recent가 old fixed basis와 new range basis를 조용히 같은 component count로 섞지 않도록 mixed-basis 감지와 처리 후보를 정리한 docs-only 설계 문서다.
     - 현재 Recent aggregation, UI, DailyCoach, score, backup/restore는 변경하지 않는다.
   - `v8.2_macro_range_recent_mixed_basis_tests_implementation_2026-07-03.md`
     - `runMacroRangeRecentMixedBasisDesignTests` 구현 기록이다.
     - suite 내부 test-local detector로 fixed/range/invalid/unsupported/component-ineligible basis를 분류하고, production Recent counts와 DailyCoach output은 변경하지 않는다.
   - `v8.2_macro_range_storage_compatibility_checkpoint_2026-07-03.md`
     - macro range storage/schema 진입 전 중간점검 문서다.
     - report-only helper, score candidate, snapshot, normalizer simulation, signature, backup/restore, Recent mixed-basis 테스트가 무엇을 고정했고 무엇을 아직 증명하지 않았는지 분리한다.
     - `macroRangeContract` 저장, `macroRangeBasisSignature` 저장, backup/restore schema, Recent aggregation, score version, production macro range는 계속 금지한다.
   - `v8.2_macro_range_contract_storage_design_2026-07-03.md`
     - known `macroRangeContract`를 저장 가능한 후보로 다루기 전, 후보 shape와 storage decision, normalizer/signature/backup/Recent/score 영향표를 정리한 docs-only 설계 문서다.
     - production schema 구현, `goalSnapshot` field 추가, `macroRangeContract` 저장, `macroRangeBasisSignature` 저장, backup payload field 추가, Recent aggregation 변경은 계속 금지한다.
   - `v8.2_macro_range_phase_gate_closeout_2026-07-03.md`
     - macro range report-only / test-local / storage-design phase gate를 닫는 closeout 문서다.
     - 현재 phase는 완료 가능하지만 production storage/schema, score version, Recent aggregation, UI, DailyCoach, production macro range 구현은 계속 금지한다.
   - `v8.2_macro_range_contract_normalizer_design_2026-07-03.md`
     - future `macroRangeContract` production normalizer가 필요해질 경우의 입력, 출력, valid/invalid/unsupported 처리, fixed snapshot survival rule을 정리한 docs-only 설계 문서다.
     - production normalizer 구현, `normalizeGoalSnapshot` 연결, `macroRangeContract` 저장, backup/restore schema, Recent aggregation, score version 변경은 계속 금지한다.
   - `v8.2_macro_range_contract_normalizer_tests_implementation_2026-07-03.md`
     - `runMacroRangeContractNormalizerDesignTests` 구현 기록이다.
     - suite 내부 test-local helper로 absent/valid/invalid/unsupported 후보와 no-impact guard를 검증하고, production normalizer와 storage/schema는 열지 않는다.
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
