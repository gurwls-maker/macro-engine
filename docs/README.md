# 탄단지 다이어리 문서 읽는 순서

# v8.0-S protein guard candidate-v2 resolution contract note

- `index.html` now separates the candidate-v2 protein guard issue into external evidence guard vs internal legacy guide-floor conflict.
- For non-contest mixed/running candidate-v2 cases, protein at `2.0g/kg BW` is classified inside the ISSN general exercising-individual range, so legacy `2.2g/kg BW` diet-floor conflicts are recorded as resolved policy cases rather than unresolved production blockers.
- Contest-prep-like cases still use the Helms/Aragon/Fitschen lean-body-mass protein context, and low-protein or fat-floor failures would still remain blockers.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Comparison`: `proteinGuardConflictCount=0`, `proteinGuardResolvedCount=4`, `proteinLegacyGuideConflictCount=4`, `fatGuardConflictCount=0`.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Contract`: `contractCount=14`, `presentCount=14`, `missingContractCount=0`, `productionBlockerCount=0`, `resolvedProteinGuardPolicyCount=4`, `productionReady=true`.
- This means the production contract review is ready for an explicit approval step. It still does not apply candidate-v2 target deltas to production `targetCal` and does not approve `candidate-v8-profile-macro-v2-linked-target-v0` as the final formula.

# v8.0-R score Coach candidate-v2 contract note

- `index.html` now adds explicit candidate-v2 score and Daily Coach policy contracts under `profileCandidateV2`.
- The score profile intentionally reuses an explicit diet-equivalent product policy. This is internal product policy, not new external sports-nutrition evidence, and it does not approve the candidate-v2 formula.
- Daily Coach now carries candidate-v2 target-delta review and guard-conflict review signals. Guard conflict is prioritized before target-delta review, and the user-facing copy does not expose the internal candidate model name.
- This closes the score/Coach missing-contract layer only. It does not apply candidate-v2 target deltas to production `targetCal`, does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, and leaves protein/fat guard behavior unresolved.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=14`, `missingContractCount=0`, `productionBlockerCount=1`, `targetRateContractMissingCount=0`, `scoreCoachContractMissingCount=0`, `recentContextContractMissingCount=0`, `productionReady=false`.
- Remaining production blocker: `profileMacroCandidateV2Comparison.proteinGuardConflict`. The required next action is to resolve or explicitly justify protein/fat guard behavior before approving any profile-specific macro formula.
- Direct probe check: `policyKey=profileCandidateV2`, `scoreProfileUsesDietProductPolicy=true`, `coachThresholdUsesDietMacroThresholds=true`, first Coach decision is `profile_guard_conflict`, and user-facing output does not mention internal candidate names.

# v8.0-Q target-rate recentContext candidate-delta contract note

- `index.html` now preserves candidate-v2 target/rate delta metadata through `buildGoalTargetRateContext()` and exposes a `profileCandidateDeltaContract`.
- `recentContext` now includes `profileCandidateV2TargetDeltaGate` with eligible, blocked, and inactive outcomes. The gate uses recent28 as the review window and blocks low goal-snapshot coverage or recent goal changes.
- This closes the target-rate metadata and recentContext gate contracts only. It does not apply candidate-v2 target deltas to production `targetCal`, does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, and does not change score or Daily Coach behavior.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=11`, `missingContractCount=3`, `productionBlockerCount=4`, `targetRateContractMissingCount=0`, `recentContextContractMissingCount=0`, `productionReady=false`.
- Remaining missing production contracts are macro score profile, Daily Coach threshold, and Daily Coach decision/copy. The extra production blocker is still `profileMacroCandidateV2Comparison.proteinGuardConflict`.
- Direct probe check: candidate target/rate deltas are returned as metadata, `appliedToTarget=false`, `targetCalUnchangedByProfileCandidateDelta=true`, and recentContext `eligibleCanApplyAutomatically=false`.

# v8.0-P profile/session input-snapshot contract note

- `index.html` now exposes Settings/Today `exerciseProfile` and `profileSession` inputs and preserves them through Today draft, calculation state, Records `goalSnapshot`, snapshot signature, and full backup.
- This closes the input/snapshot/backup data contract only. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0` or change production macro formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=9`, `missingContractCount=5`, `productionBlockerCount=6`, `productionReady=false`.
- Remaining missing production contracts are target-rate candidate delta, macro score profile, Daily Coach threshold, Daily Coach decision/copy, and recentContext target-delta gate.
- The extra production blocker beyond missing contracts is still `profileMacroCandidateV2Comparison.proteinGuardConflict`.
- Scenario runner now has 19 test cases: the added case verifies running profile/session normalization, snapshot/signature preservation, backup preservation, and unchanged production `targetCal`.

# v8.0-O profileMacroCandidateV2Contract note

- `runV8ScenarioRunner()` now includes `profileMacroCandidateV2Contract`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=3`, `missingContractCount=11`, `productionBlockerCount=12`, `productionReady=false`.
- Missing production contracts are Settings/Today exerciseProfile input, Settings/Today profileSession input, Today draft persistence, target-rate candidate delta, Records snapshot/signature candidate fields, score, Coach thresholds/decisions, recentContext target-delta gate, and backup/import round-trip.
- Present guards are `profileMacroCandidateV2Comparison.reportOnlyGuard` and `targetedStress.constraintOnlyTupleGuard`.
- The extra production blocker beyond missing contracts is `profileMacroCandidateV2Comparison.proteinGuardConflict`, because the guard is present but unresolved.
- Evidence policy: internal code-contract review only; external sports-nutrition references remain threshold background and do not approve app-wide production behavior.

# v8.0-N profileMacroCandidateV2 note

- `runV8ScenarioRunner()` now includes `profileMacroCandidateV2Comparison`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: candidate-v2 comparison covers 96 cases = axis coverage 73 + human-review 18 + targeted calculated 5.
- `profileCarbFloorAttemptedCount=5`, `profileCarbFloorMetCount=5`, `profileCarbFloorUnresolvedCount=0`, `targetChangedCount=5`, `targetRateContractRequiredCount=5`, `proteinGuardConflictCount=4`.
- For `targeted_mixed_carb_unresolved`, candidate-v2 opens `targetDeltaKcal=43.72915555555528`, `targetRateDeltaEquivalentKgPerWeek=0.03975377777777753`, and reaches `carbsGPerKgBodyweight=6`.
- This is not production approval. At v8.0-N those target/rate deltas still needed recent trend, score, Coach, Records, Settings/Today, and backup/import contracts; v8.0-P closes the input/snapshot/backup part, v8.0-Q closes target-rate metadata plus the recentContext gate, v8.0-R closes candidate-v2 score/Coach contracts, and v8.0-S resolves the protein guard blocker as an evidence/product-policy contract. Formula approval and production `targetCal` wiring still remain separate.

# v8.0-M targetedStress note

- `runV8ScenarioRunner()` now includes `targetedStress`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: total targeted cases 8 = 5 calculated review cases + 3 constraint-only excluded tuples.
- Focus counts: `derived_ffmi=1`, `inactive_intensity=1`, `mixed_carb_unresolved=2`, `maintain_non_bodybuilding=2`, `excluded_constraint=3`.
- Actual unresolved mixed carb finding count is 1. The maintain mixed case is marked as report-only carb-floor-met, not unresolved.
- It is not the 80,621,568,000 full Cartesian run, not a replacement for the 18 human-review cases, and not candidate formula approval.

이 폴더는 프로젝트의 기준문서 폴더다. 과거 `source` 폴더명은 실제 소스 코드처럼 보였기 때문에 `docs`로 바꿨다. 앱 구현 소스는 루트의 `index.html`이며, 문서는 구현 방향과 판단 기준을 정리하는 역할이다.

## 1. 먼저 읽을 문서

1. `내가-바라는-앱의-성격.txt`
   - 앱의 최상위 성격을 정한다.
   - Today / Records / 최근 흐름 / InBody / Settings가 각각 무엇을 책임지는지 판단할 때 먼저 본다.

2. `개발정책.txt`
   - Codex 작업 방식, 기준 우선순위, commit / QA / 문서 충돌 처리 원칙을 정한다.
   - 구현이 문서와 충돌할 때 무엇을 우선할지 판단하는 운영 기준이다.

3. `v8_운동프로필_산식_정밀설계.txt`
   - v8부터 다룰 운동 프로필, 사용자 유형, 목표별 산식, Today-Records 기준갱신 감사, 시나리오 검증의 초정밀 인계서다.
   - v7.x UI 안정화 이후 다른 Codex가 처음 투입되어도 이 문서만 읽고 같은 의도로 산식/프로필 감사를 시작할 수 있어야 한다.
   - 산식 근거를 볼 때는 이 문서의 `0-4. 근거 등급 원칙`을 따른다. 내부 코드 근거나 제품 정책 근거를 외부 운동생리학 근거처럼 통과시키면 안 된다.
   - v8.0-J 이후 maintain은 production goal 1차 계약이 닫힌 상태지만, profile-specific macro formula와 전체 v8 완료로 읽으면 안 된다.
   - v8.0-K 이후 profile macro candidate-v1은 report-only feasibility audit이며, mixed 탄수 floor unresolved를 production 승인으로 덮으면 안 된다.
   - v8.0-L 이후 pairwiseStress는 8-2 full 축의 constrained pairwise 계산 레이어다. 80,621,568,000개 전수 실행이나 18개 human-review 수치 승인이 아니다.

4. `v8_현재산식_기준갱신_감사_2026-06-02.txt`
   - v8 1단계 현재 산식 / Today-Records 기준갱신 감사 완료 리포트다.
   - 다음 Codex는 v8 산식 작업 전에 이 문서와 현재 `index.html`의 차이 여부를 먼저 확인하고, 중복 감사 대신 다음 단계 판단에 사용한다.
   - v8.0-I의 maintain missing-contract 감사는 v8.0-J 섹션으로 갱신되었으므로, 히스토리와 현재 상태를 섞어 읽지 않는다.
   - v8.0-H의 resistance carbohydrate reference 저자 표기는 v8.0-K에서 Escobar / VanDusseldorp / Kerksick 2016으로 정정되었다.

5. `앱-문구-기준.txt`
   - 화면 문구, Coach 문구, 최근 흐름 문구, InBody 문구의 표현 기준이다.
   - 문구가 길어지거나 사용자에게 “그래서 뭘 하라는 건지” 흐려질 때 반드시 확인한다.

6. `캔버스_updated.txt`
   - v6.x부터 v7.x까지의 큰 개발 판단이 누적된 통합 캔버스다.
   - 최신 단일 설계서라기보다 히스토리와 의사결정 맥락을 보관하는 문서로 본다.

## 2. 보조 문서

- `# 2026 ACSM 근력운동 가이드 한국어 해설판.txt`
  - v8 운동 프로필과 세션 설계를 할 때 참고한다.
  - 앱의 산식 자체를 직접 결정하는 문서는 아니며, 근력운동 기준을 검토할 때 보조 근거로 쓴다.

- `코덱스-인텔리전스.txt`
  - Codex 작업 난이도별 추론 강도 선택 기준이다.

## 3. archive

`archive` 폴더는 현재 기준문서가 아니라 과거 작업 산출물 보관 위치다.

- `20260525_스티치_UI_기능_이식_누락_보고서.txt`
  - 과거 Stitch 독립 HTML 프로토타입 기준의 기능 이식 누락 보고서다.
  - 현재 `index.html` 기준 구현 문서가 아니므로 새 작업 기준으로 직접 쓰지 않는다.

## 4. 문서 충돌 처리

문서끼리 충돌하면 아래 순서로 판단한다.

1. 사용자가 만들고 싶은 앱의 성격
2. 최신 대화에서 확정된 의도
3. `개발정책.txt`
4. `v8_운동프로필_산식_정밀설계.txt` 또는 해당 작업의 최신 기준문서
5. `v8_현재산식_기준갱신_감사_2026-06-02.txt`처럼 현재 구현을 직접 대조한 최신 감사 리포트
6. `앱-문구-기준.txt`
7. `캔버스_updated.txt`의 과거 맥락
8. 현재 `index.html` 구현

구현이 더 좋아 보여도 제품 성격과 충돌하면 구현을 합리화하지 않는다. 반대로 기준문서가 낡았고 현재 앱 구조가 더 타당하면, 문서를 먼저 갱신하고 그 이유를 남긴다.
