# 탄단지 다이어리 문서 읽는 순서

## 0. 먼저 읽을 최신 기준 (2026-06-04 통합 정리)

현재 V8 운동 프로필·수준별 산식 작업의 우선 기준은 `docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt`다.

이 통합문서는 기존 `v8_수준별산식_설계1~8`, `v8_수준별산식_초정밀설계_2026-06-04.txt`, `v8_운동프로필_산식_정밀설계.txt`의 유효한 내용을 흡수한 후속 구현 기준이다. 기존 문서들은 `docs/archive/v8_report_only_design_20260604/`로 이동했으며, 현재 기준이 아니라 historical/report-only 근거 확인용이다.

가장 중요한 운영 원칙:

- 기준문서는 정답지가 아니다.
- 실제 앱 렌더, 실제 사용자 흐름, 실제 산식 결과, 새로 발견된 위험이 기준문서보다 우선할 수 있다.
- 문서에 맞췄다는 이유만으로 완료라고 말하지 않는다.
- 새 문제가 보이면 문서를 그대로 따르지 말고, 왜 다른 판단을 했는지 기록한다.
- 다음 코덱스는 `기능이 생겼다`와 `사용자가 믿고 쓸 수 있다`를 반드시 구분한다.
- 단계 통과 판정은 "구현됨"이 아니라 "의도대로 충분히 구현됨"이다. 코드에 필드/함수/화면이 생겼는지뿐 아니라, 사용자가 요구한 깊이와 넓이, 실제 사용자 설명 가능성, 관련 탭/기록/백업/코치/점수와의 연결성까지 본 뒤 통과시킨다.

권장 읽기 순서:

1. `docs/개발정책.txt`
2. `docs/내가-바라는-앱의-성격.txt`
3. `docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt`
4. `docs/v8_외부근거_매크로_정책표_2026-06-05.txt`
5. `index.html`의 실제 production 경로
6. `docs/v8_현재산식_기준갱신_감사_2026-06-02.txt`
7. `docs/v8_1단계_복구감사_2026-06-03.txt`
8. 필요한 경우에만 `docs/archive/v8_report_only_design_20260604/`의 과거 설계 원문

## 1. 기존 stage note 지도 (v8.0-AU 문서 계층 정리)

이 문서의 목적은 다음 Codex가 V8 문서를 읽을 때 `production`, `scoped production`, `report-only`, `historical`, `open gate`를 섞지 않게 하는 것이다. 아래의 `v8.0-*` 섹션들은 대부분 시간순 stage notes다. 최신 stage note가 과거 stage note를 폐기하지는 않지만, 과거 값을 현재 기준으로 재사용하려면 반드시 현재 `index.html`, `runV8ScenarioRunner()`, 관련 테스트와 다시 대조한다.

문서 태그:

- `[CURRENT_PRODUCTION]`: 현재 앱의 실제 사용자 계산/저장/표시 경로에 적용된 기준.
- `[SCOPED_PRODUCTION]`: 실제 production에 적용됐지만 특정 조건, 특정 runtime case, 특정 사용자 경로에만 적용되는 기준.
- `[REPORT_ONLY]`: runner, audit, candidate, numerical gate, contract review처럼 비교/증거/검토용이며 앱 기본 산식을 바꾸지 않는 기준.
- `[HISTORICAL]`: 과거 stage 당시에는 맞았지만 이후 stage에서 supersede되었거나 현재값으로 쓰면 안 되는 기록.
- `[OPEN_GATE]`: V8 전체 완료 전에 반드시 다시 닫아야 하는 작업.
- `[DO_NOT_CLAIM_COMPLETE]`: 작은 통과 결과를 full V8, full Cartesian, broad UX, 또는 전면 수준별 산식 완료로 말하지 말라는 금지선.

현재 핵심 상태:

- `[DO_NOT_CLAIM_COMPLETE]` `/GOAL` 방식의 장시간 자동 진행은 더 이상 기준 작업 방식으로 쓰지 않는다. 이후 V8은 수동으로 작게 범위를 잡고, 각 단계가 실제 앱 동작 개선인지 report-only 증거인지 먼저 분류한 뒤 진행한다.
- `[CURRENT_PRODUCTION]` 문서정리는 v8.0-AV에서 다음 작업 진입을 막지 않는 수준으로 닫는다. 남은 문서 수정은 새 구현/감사 중 발견되는 충돌을 해당 단계에서 갱신하는 방식으로 처리한다.
- `[CURRENT_PRODUCTION]` v8.0-AT 이후 일반 diet protein은 `2.0g/kg` 기준이다. `GOALS.diet.proteinKg`와 dual-basis diet protein range가 이 기준을 사용하며, target kcal은 유지하고 줄어든 protein kcal은 carbs로 재배분한다.
- `[SCOPED_PRODUCTION]` candidate-v2는 active runtime target-delta case에서 production target/macro에 적용될 수 있고, AA/AB/AH 계열에서 대표 visual/runtime evidence가 닫혔다.
- `[REPORT_ONLY]` candidate-v0/v1/v2 비교, macroAudit, pairwise, targeted stress, human-review numerical gate, full Cartesian tooling의 상당 부분은 여전히 증거/검토 레이어다.
- `[OPEN_GATE]` full 8-2 Cartesian execution, full V8 completion, broad profile/routine/session human UX review는 open이다.
- `[OPEN_GATE]` 사용자 수준별 산식은 V8의 원래 핵심 목표에 포함되어 있다. 현재는 일부 입력 맥락과 scoped candidate-v2만 production에 반영됐으므로, 운동 프로필/세션/수행 수준/체성분 신뢰도/최근 기록/최근 추세를 묶는 전면 profile-specific macro formula는 아직 완료로 보지 않는다.
- `[REPORT_ONLY]` v8.0-AZ는 사용자 수준별 산식의 초정밀 설계 계약을 추가했다. `userLevelFormulaPrecisionDesign`은 external evidence / internal code contract / product policy를 분리하고 다음 candidate 구현 순서를 고정하지만, production 산식을 변경하거나 user-level formula gate를 닫지 않는다.

문서 역할:

| 문서 | 역할 | 읽는 법 |
| --- | --- | --- |
| `docs/README.md` | 현재 문서 지도와 최신 경계 | 여기서 태그와 읽는 순서를 먼저 고정한다. |
| `docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt` | 현재 V8 운동 프로필·수준별 산식 후속 구현 기준 | 기존 1~8 설계와 초정밀/운동프로필 설계를 통합한 현재 기준이다. 단, 이 문서도 실제 앱/사용자/검증 결과보다 위에 있지 않다. |
| `docs/v8_1단계_복구감사_2026-06-03.txt` | 복구 감사 증거 | AS2 시점의 문제와 AT follow-up을 분리해 읽는다. |
| `docs/v8_현재산식_기준갱신_감사_2026-06-02.txt` | 긴 감사 ledger | 단계별 historical/current/report-only 경계를 확인한다. |
| `docs/archive/v8_report_only_design_20260604/` | 기존 설계 1~8, 초정밀 설계, 운동프로필 정밀설계 원문 | 현재 기준이 아니라 historical/report-only 근거 확인용이다. 먼저 읽지 않는다. |

다음 작업 우선순위:

1. `[DONE_CHECKED]` 현재 production 산식과 profile/session 입력 경로 재감사는 2026-06-04 수동 1단계에서 닫혔다. 이후 production 코드를 바꾸기 전에는 다시 확인한다.
2. `[REPORT_ONLY_PRESENT_AUDIT_REINFORCED]` weekly-days-only 수준 판단을 대체할 `performanceContext` 근거 브리지는 현재 `index.html`의 `v8.0-BI_user_level_production_context_bridge_v0`로 이미 존재한다. 2026-06-04 보강으로 "좋은 체성분+낮은 주간 빈도", "낮은 체성분+높은 주간 빈도"처럼 현재 생산 `trainingBand`와 다차원 근거가 충돌하는 케이스를 `productionPathEvidence.levelConflictSignals`, `riskFlags`, `findings`에 report-only로 남기고 테스트로 잠갔다. production 산식은 이 단계에서 바꾸지 않는다.
3. `[REPORT_ONLY_STEP_3_BOUNDARY_REINFORCED]` 3단계 프로필별 세션/루틴 정밀화는 `profileTrainingModelDesign`의 세션 모델에 `energyAccountingPolicy`와 `relativeStrainPolicy`를 추가해 보강했다. 운동 kcal은 측정 가능한 workload 입력이 책임지고, 운동수준/체감부담은 회복·fuel·설명·검토 신호로만 쓰며 targetCal을 단독으로 움직이지 않는다. production 산식은 아직 바꾸지 않았다. 다음 단계는 이 경계를 전제로 candidate 산식 비교와 충돌 감사를 진행하는 것이다.
4. `[OPEN_GATE]` Records/Score/Coach/Backup contract와 human-eye profile cases를 붙이기 전에는 user-level formula production implementation을 닫지 않는다.
5. `[OPEN_GATE]` full Cartesian을 실제 전수 실행할지, owner-approved 대체 gate로 바꿀지 결정한다.

기본 작업은 `/GOAL` 없이 통합문서의 `18-1. 7단계 실행 블록`을 순차 진행한다. `/GOAL`은 사용자가 명시적으로 원할 때만 한 단계 단위로 제한해서 쓴다. V8 전체 완료를 한 번에 맡기지 않는다.

한 단계 단위 진행 프로토콜:

- 사용자가 한 단계만 진행하고 충돌 시 재판단하겠다는 의도를 보이면, 특정 문장 매칭이 아니라 이 프로토콜을 적용한다.
- 먼저 현재 문서의 진행 상태와 실제 git/code 상태를 대조해 다음 미완료 단계를 정한다. 단계가 애매하면 구현을 시작하지 말고 단계 정의를 먼저 바로잡는다.
- 단계 시작 전에 목적, production/report-only/문서 작업 여부, 건드릴 파일, 예상 변화, 확인 방법, 중단 조건을 짧게 고정한다.
- 진행 중 새 충돌이 나오면 "문서 수정", "코드 수정", "설계 재판단", "사용자 승인 필요" 중 하나로 분류하고, 다음 단계로 넘어가지 않는다.
- 단계가 정상 종료되면 그 단계의 테스트/렌더/문서 확인 범위와 남은 위험만 보고한다. 다음 단계 구현은 사용자의 다음 지시가 있을 때 시작한다.
- git stage/commit/push/tag 여부는 Codex가 작업 경계와 위험도를 보고 판단한다. 사용자가 이미 git 판단을 맡겼다면 매번 승인 질문을 반복하지 않는다.

단계 시작 시 "문서와 실제 코드 상태가 다르다"는 것은 중단 조건이다. 단순히 다음 단계가 남아 있다는 이유만으로 충돌이라고 보지 않는다. 충돌은 문서가 미구현처럼 말하는데 코드에 이미 구현되어 있거나, 문서가 완료처럼 말하는데 실제 앱/테스트/렌더가 그렇지 않을 때만 선언한다.

금지선:

- AT의 `2.0g/kg` 복구를 수준별 산식 완성으로 말하지 않는다.
- candidate-v2의 scoped production 적용을 모든 사용자/모든 운동 프로필의 전면 산식 승인으로 말하지 않는다.
- AZ의 초정밀 설계를 user-level formula production 구현 완료로 말하지 않는다.
- 18개 human-review, pairwise/targeted stress, render audit, shard pilot, clean campaign 일부 실행을 80,621,568,000개 full Cartesian 실행으로 말하지 않는다.
- 문서 기준이 실제 사용자 경로와 충돌하면 문서를 고쳐야 하며, 기준 통과를 위해 사용자 경로를 우회하지 않는다.

# 2026-06-06 수행능력 입력/운동 프로필 표시명 메모

- 수행능력 입력은 매일 입력하는 값이 아니라, 선택적으로 한 번 입력하거나 기록에서 추론하는 근거로 둔다.
- `performanceLevel`은 여전히 사용자-facing selector가 아니다. 회복, 연료, 설명, 검토 신호로 쓸 수 있지만 운동 kcal 배율이나 targetCal 직접 이동 근거가 되면 안 된다.
- 내부 key `strength`는 백업/테스트/과거 기록 호환을 위해 유지한다.
- 사용자 표시명은 `스트렝스`가 아니라 `파워리프팅`으로 정리한다.
- 다음 단계는 BO 이후 프로필별 세션/루틴 기본 시간, 기본 강도, xw, 휴식/디로드 의미를 실제 숫자 시나리오로 검증하는 것이다. 프로필/세션 용어가 정리됐다는 것과 그 숫자가 production 산식에 적절하다는 것은 별개다.

# 2026-06-06 프로필별 세션/루틴 사용자-facing 정밀화 메모

- 프로필별 세션/루틴 감사는 "기능이 생겼다"가 아니라 "실제 운동 사용자가 납득할 수 있다"를 기준으로 본다.
- 파워빌딩 `하체/복합`은 `하체·힌지 메인`으로 정리했다.
- 파워리프팅 루틴/세션은 `메인 리프트 강도/볼륨`, `기술 연습/디로드`, `상체 메인 고강도`, `하체 메인 고강도`, `보조 볼륨`, `기술 연습`처럼 실제 주 리프트 맥락이 보이게 정리했다.
- 러닝 `회복주`는 주간 계획처럼 읽히므로 `회복 러닝`으로 정리했다.
- 혼합 프로필의 `회복 혼합`은 역할이 흐리므로 `회복 유산소`로 정리했다.
- 이번 단계는 production macro formula, 기본 시간, 기본 xw를 바꾸지 않는다. 숫자 기본값은 다음 시나리오 검증에서 targetCal, Records snapshot, Coach/Score 변화와 함께 판단한다.
- 단계 삭제/추가는 없다. 다만 현재 단계의 산출물은 "세션 용어/의미 정리"이고, 다음 단계는 "입력 피로도, 프로필별 세션 정확도, 산식 반영 범위 재검토"로 이어진다.

# 2026-06-06 BO 수행능력 입력 피로도 / 산식 반영 범위 감사 메모

- BO는 report-only 감사다. production targetCal, macro allocation, Records schema, Coach copy, UI, 기본 운동시간, 기본 xw를 바꾸지 않는다.
- 수행능력은 매일 묻지 않는다. 사용자가 원할 때 한 번 넣는 선택 근거이거나, 기록에서 추론되는 보조 근거다.
- 새 필수 입력은 0개다. 수행근거가 없다는 이유로 초급자, 낮은 신뢰도, 낮은 targetCal로 벌점 처리하지 않는다.
- `performanceLevel`이나 relative strain은 운동 kcal 배율 또는 targetCal 직접 이동 근거가 아니다. 운동 kcal은 루틴 xw/웨이트 시간과 유산소 종류/시간/속도/경사/MET처럼 측정 가능한 workload 입력이 책임진다.
- 수행능력은 회복 필요, fuel 필요, Coach 설명, 시나리오 감사, 추후 target relief 검토 신호로만 쓴다.
- 가이드 기준/활동량 기준은 유지한다. v8.0-BQ에서 두 기준은 같은 production targetCal 안에서 탄단지 배분/설명만 갈라지는 비교 축으로 감사하며, 실제 감사에서 candidate-v2 목표 보정이 선택 기준에 새는 blocker가 발견되면 BR `profile_candidate_basis_invariant_target_policy_before_formula_application`을 먼저 닫는다.
- 단계 변경: 삭제 없음. 추가: `v8.0-BO performance input fatigue/formula scope audit`. 수정: BM 이후 바로 production 적용 판단으로 가지 않고 `profile_session_numeric_scenario_validation_before_formula_application`을 먼저 수행한다.
- 이유: 입력 피로도와 산식 반영 범위를 닫지 않으면 수준별 산식이 daily performance form, standalone level selector, kcal multiplier, targetCal shortcut로 오해될 수 있다.

# v8.0-AZ user-level formula precision design note

- AZ adds `userLevelFormulaPrecisionDesign` to `runV8ScenarioRunner()` as report-only design evidence.
- The design separates external sports-nutrition references, internal code contracts, and product-policy reasons.
- Covered design inputs are goal, exerciseProfile, routinePlan, routineSession, derived profileSession, performanceLevel, trainingEvidence, bodyCompReliability, recent14 coverage, recent28 trend, activity workload, cardio load, and advanced tuning.
- Covered formula layers are context, targetEnergy, protein, fat, carbohydrate, recentTrend, and score/Coach/snapshot.
- The completion gate remains open for `user_level_profile_specific_macro_formula`; AZ is design readiness for the next candidate, not implementation.
- Verification on 2026-06-04: targeted V8/Today bundle = 3 suites / 89 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 139 cases / failed 0.

# v8.0-BA level-aware macro candidate v0 note

- BA adds `levelAwareMacroCandidateV0` to `runV8ScenarioRunner()` as report-only candidate evidence.
- BA builds `userLevelFormulaContext` from actual scenario inputs: goal, exercise profile, routine plan/session, derived profileSession, performance level, training evidence, body-composition reliability, recent14, recent28, activity workload, cardio load, and advanced tuning.
- BA compares current production target/macros against a level-aware candidate across axis, human-review, pairwise, and targeted stress cases. It does not use only the 18 human-eye cases.
- BA separates profile fuel policy review from target relief. Running/mixed fuel context can be recorded even when no target relief is needed.
- BA keeps `productionFormulaChanged=false`, `candidateFormulaApproved=false`, `userLevelFormulaImplemented=false`, and `productionAutoApplyAllowedCount=0`.
- The next work is not production application. The next work is Records/Score/Coach/Backup contracts for the candidate context, then expanded human-eye profile cases and Cartesian closure decision.
- Verification on 2026-06-04: targeted V8/Today bundle = 3 suites / 90 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 140 cases / failed 0.

# v8 level-formula design step 1 truth map note

- Added `docs/v8_수준별산식_설계1_현상태진실지도_2026-06-04.txt`.
- The truth map directly records current runner facts: BA candidate 146 cases, profile coverage 5, `productionAutoApplyAllowedCount=0`, boundary audit 20/20, and four remaining open completion gates.
- The next design stage is user input ownership and screen-flow finalization, not production implementation.

# v8.0-BB user input ownership flow design note

- Added `docs/v8_수준별산식_설계2_사용자입력소유권_화면흐름_2026-06-04.txt`.
- BB adds `userInputOwnershipFlowDesign` to `runV8ScenarioRunner()` as report-only ownership evidence before any user-level formula implementation.
- BB fixes the key user-flow contract: Settings owns `exerciseProfile`, Today owns date-specific `routinePlan/routineSession`, `profileSession` is derived-only, `performanceLevel` has no standalone shortcut UI, and Records owns dated `goalSnapshot` evidence.
- BB keeps `productionFormulaChanged=false`, `userLevelFormulaImplemented=false`, and full V8 completion open. Whole-stage boundary audit now has 21 checks.
- The next design stage is profile-specific training-model design, not production formula wiring.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 33 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 91 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 141 cases / failed 0.

# v8.0-BC profile-specific training model design note

- Added `docs/v8_수준별산식_설계3_운동프로필별훈련모델_2026-06-04.txt`.
- BC adds `profileTrainingModelDesign` to `runV8ScenarioRunner()` as report-only evidence before the level context/formula stages.
- BC maps actual profile routine/session definitions into six training dimensions: `resistanceLoad`, `cardioLoad`, `recoveryNeed`, `fuelNeed`, `targetReliefRisk`, and `levelSignals`.
- BJ extends the same report-only training model with `energyAccountingPolicy` and `relativeStrainPolicy`: measurable workload inputs own exercise kcal, while performance/strain context can inform recovery, fuel, explanation, and review signals without directly moving exercise kcal or targetCal.
- BC keeps advanced OFF as a simple REST/PUSH user surface, preserves bodybuilding OFF xw `0.70`, and records non-bodybuilding OFF as simple visible training backed by each profile's default internal session.
- BC explicitly treats REST as a shared rest session, not a bodybuilding fallback token. Running non-rest sessions remain cardio-owned even with `weightDuration=0`.
- BC keeps `productionFormulaChanged=false`, `userLevelFormulaImplemented=false`, `standalonePerformanceUiApproved=false`, and full V8 completion open. Whole-stage boundary audit now has 22 checks.
- The next design stage is level context design, not production formula wiring.
- Verification on 2026-06-04 after BJ boundary reinforcement: `runV8ScenarioRunnerTests` = 1 suite / 39 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 97 cases / failed 0. Earlier BC broad baselines remain historical evidence: core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 142 cases / failed 0.

# v8.0-BK energy/strain candidate collision audit note

- BK is report-only. It does not change production targetCal, macro allocation, Records schema, Coach copy, or UI.
- BK carries the BJ boundary through BD context, BE formula principles, BA candidate comparison, BH final audit, whole-stage evidence, and the completion declaration gate.
- Exercise kcal remains owned by measurable workload inputs such as routine xw, weight duration, cardio type/time/speed/incline/MET. Performance level and relative strain may inform recovery, fuel, explanation, and review, but they cannot directly multiply exercise kcal or move targetCal alone.
- Candidate reports now expose `energyStrainBoundaryPreservedCount`, `performanceLevelKcalMultiplierAllowedCount`, and `relativeStrainDirectTargetMoveAllowedCount` so future work can detect boundary drift before production formula work starts.
- Verification on 2026-06-04 after BK reinforcement: `runV8ScenarioRunnerTests` = 1 suite / 39 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 97 cases / failed 0.
- The next step remains candidate/formula comparison and production implementation planning under explicit approval, not automatic candidate application.

# v8.0-BD user-level context design note

- Added `docs/v8_수준별산식_설계4_수준별컨텍스트_2026-06-04.txt`.
- BD adds `userLevelContextDesign` to `runV8ScenarioRunner()` as report-only context-authority evidence before formula-principle design.
- BD combines 23 source inputs into 7 context axes: training load, profile specificity, recent record quality, body-composition authority, target-relief pressure, formula authority, and explanation surface.
- BD blocks shortcut interpretations: weekly training days alone cannot decide level; InBody alone cannot raise target/protein; recent28 trend and target-relief pressure cannot auto-apply targetCal; `performanceLevel` remains derived and hidden from direct user editing.
- BD preserves the BC training model: running cardio-owned sessions remain training context even with `weightDuration=0`, mixed hybrid sessions keep both resistance/cardio roles, and strength deload downgrades load context.
- BD keeps `productionFormulaChanged=false`, `userLevelFormulaImplemented=false`, `recent28AutoApplyAllowed=false`, `targetReliefAutoApplyAllowed=false`, and full V8 completion open. Whole-stage boundary audit now has 23 checks.
- The next design stage is formula-principle design, not production formula wiring.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 35 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 93 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 143 cases / failed 0.

# v8 manual continuation note

- Do not resume V8 through a long `/GOAL` run. The user has deprecated that workflow because it repeatedly encouraged fast micro-stage completion and over-broad claims.
- Before continuing V8 after BD, read this README, `docs/v8_수준별산식_설계1_현상태진실지도_2026-06-04.txt`, `docs/v8_수준별산식_설계2_사용자입력소유권_화면흐름_2026-06-04.txt`, `docs/v8_수준별산식_설계3_운동프로필별훈련모델_2026-06-04.txt`, `docs/v8_수준별산식_설계4_수준별컨텍스트_2026-06-04.txt`, `docs/v8_1단계_복구감사_2026-06-03.txt`, `docs/v8_현재산식_기준갱신_감사_2026-06-02.txt`, and `docs/v8_운동프로필_산식_정밀설계.txt`.
- The phase-1 recovery audit records that general diet production still used `2.4g/kg` protein before AT; AT is the production macro-policy recovery that applies the general diet `2.0g/kg` policy to the actual app path.
- Current whole-V8 status is not complete. Candidate-v2 production application and post-wiring visual QA are closed, but `full_8_2_cartesian_execution`, `full_v8_completion`, and broad profile/routine/session human UX review remain open.
- The next agent must not start a new micro-stage before rechecking current runner output, render audit, clean full-Cartesian campaign state, and the user-owned profile/routine/session paths.

# v8.0-BE user-level formula principle design note

- Added `docs/v8_수준별산식_설계5_산출식원칙_2026-06-04.txt`.
- BE adds `userLevelFormulaPrincipleDesign` to `runV8ScenarioRunner()` as report-only formula-principle evidence.
- BE fixes the future formula order: calculation basis -> target kcal baseline -> context authority -> explicit target-relief candidate check -> protein anchor -> fat protection -> carbohydrate remainder -> plausibility/allocation explanation -> recent-trend review -> explanation/snapshot persistence.
- BE separates evidence buckets: external sports-nutrition evidence, external safety-boundary evidence, app production policy numbers, internal code contracts, and product experience policy.
- BE explicitly blocks shortcut readings: protein cannot become a kcal gap filler; general diet `2.4g/kg` cannot return by habit; running/mixed carb needs cannot silently cut protected protein/fat; recent28 and target relief cannot auto-apply broad target changes.
- BE keeps `productionFormulaChanged=false`, `candidateFormulaApproved=false`, `userLevelFormulaImplemented=false`, and full V8 completion open. Whole-stage boundary audit now has 24 checks.
- The next design stage is user explanation flow design, not production formula wiring.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 36 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 94 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 144 cases / failed 0.

# v8 manual continuation note after BE

- Do not resume V8 through a long `/GOAL` run.
- Before continuing after BE, read the five level-formula design docs in order: step 1 truth map, step 2 input ownership, step 3 profile-specific training model, step 4 user-level context, step 5 formula principle.
- Historical BE next step was step 6 user explanation flow design. Do not jump to production implementation until explanation, persistence, scenario/verification, and final design audit are closed.
- BE is not a full formula implementation and must not be used to claim that the user-level profile-specific macro formula gate is closed.

# v8.0-BF user-level formula explanation flow design note

- Added `docs/v8_수준별산식_설계6_사용자설명흐름_2026-06-04.txt`.
- BF adds `userLevelFormulaExplanationFlowDesign` to `runV8ScenarioRunner()` as report-only explanation-flow evidence.
- BF maps formula reasons to seven user surfaces: Today calculation summary, Today Coach action, Today diet score evidence, Records detail basis preview, Records goalSnapshot signature, recent-context guard notice, and backup/import roundtrip.
- BF keeps Score and Coach roles separated: Score explains evidence and component reasons; Coach recommends the next action.
- BF blocks internal labels from user-facing copy, including `candidate-v8`, `profileCandidateV2`, `recentContext`, `windowFit`, `contextFit`, `recordConfidence`, `selectedMacroBasis`, `profileSession`, `formulaAuthority`, and `targetReliefRisk`.
- BF keeps `productionFormulaChanged=false`, `candidateFormulaApproved=false`, `userLevelFormulaImplemented=false`, `userFacingCopyChanged=false`, and full V8 completion open. Whole-stage boundary audit now has 25 checks.
- The next design stage is scenario and verification design, not production formula wiring.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 37 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 95 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 145 cases / failed 0.

# v8 manual continuation note after BF

- Do not resume V8 through a long `/GOAL` run.
- Before continuing after BF, read the six level-formula design docs in order, ending with `docs/v8_수준별산식_설계6_사용자설명흐름_2026-06-04.txt`.
- Historical BF next step was step 7 scenario and verification design.
- BF is not production formula implementation and is not user-facing copy implementation. It only locks which explanation surfaces must carry future formula reasons.

# v8.0-BG user-level formula scenario verification design note

- Added `docs/v8_수준별산식_설계7_시나리오검증_2026-06-04.txt`.
- BG adds `userLevelFormulaScenarioVerificationDesign` to `runV8ScenarioRunner()` as report-only scenario/verification evidence.
- BG separates eight verification layers: required-axis category sweep, 18 human-eye review cases, constrained pairwise stress, targeted residual stress, full Cartesian execution contract, bounded shard plan, production regression guard, and explanation-surface probes.
- BG keeps the 18 human-eye cases separate from the 80,621,568,000-case full Cartesian product. The 18 cases are mandatory manual review cases, not a replacement for full-axis execution.
- BG keeps `fullCartesianRun=false`, `full8_2CartesianExecutionClosed=false`, `ownerApprovedAlternativeGateAvailable=false`, and requires either full execution or an explicit owner-approved alternative gate before full V8 completion.
- BG keeps `productionFormulaChanged=false`, `candidateFormulaApproved=false`, `userLevelFormulaImplemented=false`, `userFacingCopyChanged=false`, and full V8 completion open. At the BG point, whole-stage boundary audit had 26 checks; after BH, see the current 27-check note above.
- The next design stage is final design audit, not production formula wiring.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 38 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 96 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 146 cases / failed 0.

# v8 manual continuation note after BG

- Do not resume V8 through a long `/GOAL` run.
- Before continuing after BG, read the seven level-formula design docs in order, ending with `docs/v8_수준별산식_설계7_시나리오검증_2026-06-04.txt`.
- Historical BG next step was step 8 final design audit. That step is now completed by BH; use the BH continuation note below for current work.
- BG is not full Cartesian execution, not a candidate approval, not a production formula implementation, and not full V8 completion.

# v8.0-BH user-level formula final design audit note

- Added `docs/v8_수준별산식_설계8_최종설계감사_2026-06-04.txt`.
- BH adds `userLevelFormulaFinalDesignAudit` to `runV8ScenarioRunner()` as report-only final design consistency evidence.
- BH audits eight design steps: truth/current-state map, input ownership flow, profile training model, level context, formula principle, explanation flow, scenario verification, and final-audit boundary.
- BH adds 11 consistency checks, including `profile_session_shortcut_blocked`, `performance_level_derived_not_selector`, `recent_target_relief_auto_apply_blocked`, `human_axis_cartesian_separated`, and `full_cartesian_gate_still_open`.
- BH keeps `productionFormulaChanged=false`, `candidateFormulaApproved=false`, `userLevelFormulaImplemented=false`, `implementationReady=false`, `productionImplementationAllowed=false`, `fullCartesianRun=false`, `ownerApprovedAlternativeGateAvailable=false`, and full V8 completion open.
- Whole-stage boundary audit now has 27 checks. The new check is `user_level_formula_final_design_audit_not_production_implementation`.
- The next allowed work is production implementation planning or an owner-scoped implementation decision, not a broad `/GOAL` run and not a full V8 completion claim.
- Verification on 2026-06-04: `runV8ScenarioRunnerTests` = 1 suite / 39 cases / failed 0; targeted V8/Today ownership bundle = 3 suites / 97 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 147 cases / failed 0.

# v8 manual continuation note after BH

- Do not resume V8 through a long `/GOAL` run.
- Before continuing after BH, read the eight level-formula design docs in order, ending with `docs/v8_수준별산식_설계8_최종설계감사_2026-06-04.txt`.
- Current next step is production implementation planning or owner-scoped implementation decision for the user-level formula.
- BH is not production formula implementation, not user-facing copy/schema implementation, not full Cartesian execution, not broad human UX signoff, and not full V8 completion.

# v8.0-AY completion declaration gate lock note

- AY is the fourth step of the manual V8 recovery plan discussed with the user.
- `runV8ScenarioRunner()` now exposes `completionDeclarationGate` through `wholeStageEvidenceBoundaryAudit`.
- Closed prerequisites are listed separately: candidate-v2 formula approval, active runtime candidate-v2 production macro application, post-wiring production visual QA, AT diet macro-policy recovery, and AW/AX profile routine/session code-path matrix.
- Remaining open gates are also listed separately: broad profile/routine/session human UX review, user-level profile-specific macro formula implementation, full 8-2 Cartesian execution, and full V8 completion.
- Passing AY means the app/report now blocks an over-broad V8 completion claim. It does not implement the user-level formula, run the full Cartesian product, or replace human UX review.
- Verification on 2026-06-04: targeted V8/Today bundle = 3 suites / 88 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 138 cases / failed 0.

# v8.0-AX exercise advanced toggle semantics recovery note

- AX supersedes the earlier AW advanced-toggle interpretation. AW's matrix remains, but its expected behavior is now: advanced OFF exposes simple `REST / PUSH` only, and advanced ON exposes detailed profile routine/session choices.
- AW/AX adds `profileRoutineUserPathMatrix` to `runV8ScenarioRunner()` as report-only evidence for the existing 3-stage work.
- The matrix separates two paths that must not be collapsed: Settings/default Today path and Today explicit routine/session override path.
- Current code fact captured by AX: bodybuilding advanced OFF uses the original simple training/rest flow, with training default intensity `0.70` before weekly adjustment. Detailed bodybuilding routine/session xw such as `PPL-UL / PUSH 0.80` is advanced-ON behavior.
- Current code fact captured by AX: non-bodybuilding advanced OFF still shows only simple `REST / PUSH`, but a simple training day applies that profile's default training session internally for calculation defaults such as xw, weight duration, and cardio defaults. Detailed non-bodybuilding routine/session selection is advanced-ON behavior.
- AX documents the future user-level formula input scope (`performanceLevel`, body-composition reliability, recent record coverage, trend) but does not implement that formula and does not close broad human visual review, full Cartesian execution, or full V8 completion.
- Verification on 2026-06-03: `runTodayCalculationOwnershipTests`, `runTodayQuickEditTests`, `runV8ScenarioRunnerTests` = 3 suites / 88 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 138 cases / failed 0.

# v8.0-AV docs cleanup completion note

- AV closes the document-cleanup pass for now. The docs are not shortened into a summary; they are organized so current production, scoped production, report-only evidence, historical records, and open gates are not read as the same thing.
- The deleted GOAL resume file is intentional. V8 continuation should be manual and bounded.
- Next implementation/review work should move to the existing 3단계: profile/routine/session broad human UX review matrix plus user-level formula scope design. Candidate-v2 wording hardening is treated as a preflight inside that work, not as a reason to restart long automatic staging.

# v8.0-AT diet production macro policy recovery note

- AT updates `index.html` and `runV8ScenarioRunner()` to version `8.0-AT`.
- Production diet protein now defaults to `2.0g/kg` in both `GOALS.diet.proteinKg` and the dual-basis diet guide/activity range. The target kcal is preserved; kcal released from the old `2.4g/kg` protein default is reallocated to carbs inside the same target.
- Required 1913 diet regression now returns about `1913.3kcal / protein 150.4166g / carbs 226.377g / fat 45.125g`, `protein=2.0g/kg`, and no longer carries `protein_bodyweight_above_general_issn_range`, `diet_default_near_2_4g_bodyweight_requires_candidate_review`, or `carb_below_guide_min`.
- Candidate-v0 remains report-only. After AT it no longer reduces the required diet case because production already uses the general ISSN cap.
- Candidate-v2 protein guard legacy-conflict counts are now `0`; that is a consequence of production range recovery, not a new broad candidate-v2 approval.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests`, `runTargetMacroProductionPolicyTests`, and `runDualBasisProductionTests` = 3 suites / 43 cases / failed 0; `runModeGoldenCalculationTests` = 1 suite / 8 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; calibration profile = 14 suites / 137 cases / failed 0.

# v8 phase-1 recovery audit note

- `docs/v8_1단계_복구감사_2026-06-03.txt` classifies V8 work into production changes, report-only candidates/contracts, render/tooling evidence, and still-open user-value gates.
- Direct phase-1 production check before AT on 2026-06-03: representative diet calculation still returned about `1908.5kcal / protein 180.048g / 2.4g/kg / carbs 195.802g / fat 45.012g`, with `profileCandidateApplied=false`.
- The audit marked diet protein policy as unresolved production work. AT is the follow-up production fix for the general diet default; candidate-v2 scoped production wiring remains useful, but it still must not be read as full V8 completion.
- Next recommended work after AT is not another shortcut stage: recheck scoped candidate-v2 wording, profile/routine/session broad UX, and full Cartesian/full-completion gates.

# v8.0-AS2 Today goalSnapshot source alignment note

- AS2 code changes are limited to `index.html`. `runV8ScenarioRunner()` remains at `8.0-AS` because this is a Today/Records snapshot-source fix, not a scenario-runner audit stage change.
- Root cause: `buildGoalSnapshotFromCurrentState()` only received the calculation state, which intentionally does not carry the effective Today `bodyFatMass`, so snapshot body-fat mass was rebuilt from `weight * bodyFatPercent`. That could make Records detail show a recomputed value such as 11.40 kg while Today still showed the original source value such as 11.39 kg.
- AS2 keeps the calculation state unchanged and reads `getEffectiveTodayCalculationValues().bodyFatMass` only inside the snapshot builder. Exact goalSnapshot comparison is restored, so already-diverged saved snapshots remain user-confirmable with `갱신 필요` and are corrected when the user updates the record basis.
- AS1's tolerance-only interpretation is superseded. The fix is source alignment first; tolerance is not used to hide body-composition or target-basis divergence.
- Evidence boundary: this is internal data-integrity/product behavior, not external exercise-physiology evidence, and it does not close full V8 completion.
- Regression coverage on 2026-06-03: `runTodayRecordConfirmationTests` = 1 suite / 12 cases / failed 0; `runModeGoldenCalculationTests` = 1 suite / 8 cases / failed 0; related Today/Records record-basis bundle = 4 suites / 51 cases / failed 0; core profile = 26 suites / 370 cases / failed 0; full internal suite = 99 suites / 1064 cases / failed 0.

# v8.0-AS scenario runner training summary audit note

- AS updates `index.html` and `runV8ScenarioRunner()` to version `8.0-AS` after the AR Today training-summary UI change.
- AS adds `profileTrainingSummaryAudit` at `profile_aware_today_training_summary_audit_v0`. The audit calls the actual Today summary formatter and compares each exemplar against the current routine/session definition labels, instead of hardcoding separate display-copy expectations.
- The audit covers bodybuilding, powerbuilding, strength, running, and mixed exemplars. Running interval and mixed recovery are explicit non-rest `weightDuration=0` cases, so they must not collapse to the old generic weight-rest summary.
- AS is report-only formatter evidence. It does not replace render-audit screenshots, human visual review, full 8-2 Cartesian execution, or full V8 completion.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 29 cases / failed 0.

# v8.0-AR profile-aware Today training summary note

- AR updates the Today top calculation summary copy so profile-owned training sessions are not collapsed into a weight-training rest label.
- The summary row now uses `오늘 훈련` and reads the current profile/routine/session label. Running interval surfaces show `인터벌` even when `weightDuration=0`; detailed weight/cardio evidence remains in the lower exercise summary and cardio panel.
- Render audit runtime metadata now records `todayCalcSummaryText`, and analyzer checks all 10 profile routine ownership captures for `오늘 훈련` plus the expected session term while rejecting `오늘 웨이트` in that top summary.
- Verification on 2026-06-03: `runTodayQuickEditTests` + `runTodayCalculationOwnershipTests` = 2 suites / 58 cases / failed 0; render audit capture/analyzer = 65 captures / profile routine ownership captures 10 / failed 0.

# v8.0-AQ1 Today detailed fasting weight snapshot hotfix note

- AQ1 fixes the Today tab detailed meal-add flow where a checked `오늘 공복 체중` could update Records/Today calculation weight after the meal snapshot had already been generated.
- The detailed save path now applies the checked fasting weight to the Today calculation draft before `saveMealEntry()` creates the detailed record snapshot and auto score. That keeps Records fasting weight, Today calculation weight, and saved `goalSnapshot.weight` aligned.
- The pre-apply only runs when the detailed meal form has actual meal content, so an empty meal validation failure does not silently change Today calculation weight.
- Regression coverage on 2026-06-03: `runTodayRecordStartTests`, `runTodayRecordConfirmationTests`, `runTodayInputActionTests`, and `runRecordWeightTodayApplyPromptTests` = 4 suites / 50 cases / failed 0.

# v8.0-AQ profile routine input ownership note

- AQ updates `index.html` and `runV8ScenarioRunner()` to version `8.0-AQ`.
- AQ corrects the Settings/Today ownership split for exercise profile routine inputs. Settings owns `exerciseProfile`, `routinePlan`, and the weekday session plan; Today owns the date-specific `todayRoutinePlan` and `todayRoutineSession`.
- Today no longer exposes a separate editable exercise-profile card. The routine/session control shows the profile as context in the label, for example `보디빌딩 - 루틴 / 세션`, and keeps routine/session editable for the selected day.
- Settings no longer exposes a separate default session picker. This avoids conflicting with the weekday session plan while keeping the existing bodybuilding routine plan list and weekday schedule.
- `profileSession` remains a derived compatibility/snapshot/report field. It is not a user-facing shortcut and must not replace the user-owned `exerciseProfile + routinePlan + routine` path.
- AQ adds render-audit coverage for all five profile routine surfaces on desktop and mobile. Analyzer verification on 2026-06-03: 65 captures / desktop 42 / mobile 23 / profile-routine ownership captures 10 / failed 0.
- Verification on 2026-06-03: full internal suite = 99 suites / 1060 cases / failed 0.
- AQ does not close `full_8_2_cartesian_execution`, `full_v8_completion`, or broad human UX review of every profile routine/session combination.

# v8.0-AP whole-stage evidence boundary audit note

- AP updates `index.html` and `runV8ScenarioRunner()` to version `8.0-AP`.
- AP adds `wholeStageEvidenceBoundaryAudit` at `whole_stage_evidence_boundary_audit_v0`.
- The audit checks 15 evidence-boundary contracts across scenario coverage, full Cartesian tooling, macro basis, candidate layers, maintain goal scope, profile policy, candidate-v2 contracts, runtime user-facing QA, human numerical review, approval preflight/decision, and AO profile routine surface evidence.
- Direct runner audit on 2026-06-03: check count 15 / pass 15 / findings 0, full 8-2 Cartesian closed false, full V8 completion closed false, production application separated from full completion true, internal basis separated from external evidence true.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 28 cases / failed 0; full internal suite = 99 suites / 1058 cases / failed 0.
- AP adds no new formula, no new external exercise-physiology evidence, and no full-completion claim. Its purpose is to stop later work from collapsing report-only, production-observation, visual-QA, user-path, and full-completion gates into each other.

# v8.0-AO profile routine surface audit note

- AO updates `index.html` and `runV8ScenarioRunner()` to version `8.0-AO`.
- AO adds `profileRoutineSurfaceAudit` at `settings_today_profile_routine_surface_audit_v0`.
- The audit checks every exercise profile's routine plan/session/default structure: bodybuilding keeps the old routine plans, bodybuilding/basic stays generic `REST / PUSH`, non-bodybuilding profiles use profile-owned sessions, running sessions carry cardio defaults without weight duration, resistance profiles carry weight-duration defaults, and mixed exposes combined/cardio/recovery sessions.
- Direct runner audit on 2026-06-03: profile count 5 / pass 5 / findings 0, bodybuilding legacy plans preserved true, bodybuilding basic general-only true, non-bodybuilding profile-owned pass 4 / 4.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 27 cases / failed 0; full internal suite = 99 suites / 1057 cases / failed 0.
- AO is structural code-contract evidence. It does not replace human visual review of every Settings/Today quick-edit profile surface, does not close `full_8_2_cartesian_execution`, and does not close `full_v8_completion`.

# v8.0-AN whole-stage shortcut re-audit checkpoint

- AN was a docs/checkpoint re-audit after AM. It did not change `index.html`; AP is now the current app scenario runner stage.
- Re-audit principle: do not accept a derived/report field, a fixture, a screenshot count, or a planning artifact unless it proves the actual user-owned input path and the app behavior it claims to prove.
- Profile/session check: current source keeps `profileSession` hidden/derived from `exerciseProfile + routinePlan + routine`; bodybuilding advanced ON keeps the original routine schemes; bodybuilding/general advanced OFF keeps generic `REST / PUSH`; non-bodybuilding profiles use profile-owned sessions instead of bodybuilding fallback. Existing tests assert these paths.
- Candidate-v2 check: Z approval, AA production target application, and AB/AH post-wiring visual evidence are separate gates. The render analyzer requires profile-owned `mixed_balanced / mixed_strength_cardio` runtime metadata, so the old normalization-only evidence cannot pass as current evidence.
- Evidence check: D category sweep, L pairwise, M/AL targeted stress, W 18-case human numerical gate, AC~AM shard/campaign tooling, and the 80,621,568,000 full Cartesian product are separate evidence layers. AM's `--plan-only` output is planning evidence only.
- Basis check: internal product policy and internal code evidence remain review targets unless external sports-nutrition evidence is explicitly named and app-fit reviewed. Maintain kcal neutral range, cardio reflection, score/Coach thresholds, work-adjustment fixture behavior, and campaign closure flags are not external physiology claims.
- Remaining open scopes: full 8-2 Cartesian execution, full V8 completion, and broader human/UX review of all profile routine/session surfaces before calling the profile system complete.

# v8.0-AM full Cartesian campaign runner re-audit note

- AM adds `tools/render_audit/run_v8_full_cartesian_campaign.cjs`.
- This is a campaign/checkpoint wrapper around the existing AI/AJ/AK ledger, planner, and exact-range executor. At AM, it did not change `index.html` scenario runner behavior; AP is now the current app runner stage.
- Clean seed manifests are copied into `v8_full_cartesian_campaigns/<label>/accepted_seed_manifests/` only when each seed validates clean, is not truncated, and does not overlap an existing campaign interval.
- AM re-audit found and fixed a potential evidence overread: `--plan-only` used to report clean execution too easily. It now reports `hasExecutionEvidence=false` and `executionEvidenceClean=false` when no ranges ran.
- Plan-only probe on 2026-06-03: clean seeds accepted 4 / rejected 0, before unique 32, contiguous from zero 24, planned ranges 2 / uncovered 16, first planned exact range 24~32, executed ranges 0, first gap 24~1152, closure blockers `coverage_gaps_present` and `full_cartesian_coverage_incomplete`.
- Verification on 2026-06-03: `node --check` for the campaign runner passed; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- AM does not close `full_8_2_cartesian_execution` or `full_v8_completion`.

# v8.0-AL targeted stress mixed maintain re-audit note

- AL re-audit found a stale targeted-stress interpretation at that time: AG+ profile-owned runner output had `mixedCarbUnresolvedCaseCount=2`, not 1. AT later reduces the current count to 1 by recovering general diet protein production.
- In AL, both `targeted_mixed_carb_unresolved` and `targeted_maintain_mixed_contract` carried candidate-v1 `profile_carb_floor_unresolved_by_target_constraints`. After AT, the diet mixed case meets the candidate-v1 carb floor and maintain mixed remains unresolved.
- `targeted_maintain_mixed_contract` is therefore both a maintain/non-bodybuilding profile contract risk and a mixed candidate-v1 carb-floor unresolved case. Do not read maintain goal production availability as a completed mixed profile formula.
- `runV8ScenarioRunner()` now reports version `8.0-AL`.
- Verification on 2026-06-03: direct runner extraction confirmed version `8.0-AL`, targeted 8 cases / calculated 5 / constraint-only 3 / mixed unresolved 2 / maintain non-bodybuilding 2 / high priority 3; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- This is a re-audit/test-tightening update. It does not close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AK full Cartesian exact-range plan executor note

- AK adds `tools/render_audit/run_v8_full_cartesian_plan.cjs`.
- The executor reads or generates an AJ plan, then runs only the plan's `plannedRanges` exact uncovered ranges through `run_v8_full_cartesian_shard.cjs`.
- This avoids rerunning already-covered prefixes in partially covered shards.
- The executor writes ignored `plan_execution_summary.json` and `coverage_ledger.json` files in the execution folder.
- AK pilot on 2026-06-03: `--dir=batch_ai_clean_ledger_pilot --shard-size=8 --max-ranges=2 --label=ak_exact_range_pilot` executed 2 exact ranges / 16 cases, analyzer failed 0, execution-folder ledger unique 16, cumulative explicit-file ledger with the source clean pilot reached unique 32 / contiguous from zero 24 / first gap 24~1152.
- Post-push clean-source AK rerun on 2026-06-03: `--label=ak_clean_exact_range_pilot` executed 2 exact ranges / 16 cases, analyzer failed 0, execution-folder ledger unique 16, dirty-source manifests 0. Explicit cumulative ledger over source-clean `0~8`, AK-clean `8~24`, and source-clean `1152~1160` reached unique 32 / contiguous from zero 24 / first gap 24~1152 / dirty-source manifests 0 / fullCoverageCandidate false.
- During AK verification, `build_v8_full_cartesian_ledger.cjs --file=...` was found to also collect default-folder batch summaries. This was fixed so explicit-file cumulative checks read only the selected shard manifests.
- During the post-commit AK recheck, `run_v8_full_cartesian_plan.cjs --max-ranges=0` was also found to be at risk of falling back to all planned ranges. It now records a no-range execution summary instead of executing every planned range.
- Verification on 2026-06-03: AK planner recheck planned 2 ranges / 16 cases / duplicate-if-batch 0; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- Safety probe on 2026-06-03: `--max-ranges=0 --label=ak_zero_range_guard_probe` executed ranges 0 / cases 0 / `noRangesSelected=true` / full execution closed false.
- At AK, `index.html` reported scenario runner version `8.0-AK`; AL is now the current reported version.
- This is bounded exact-range execution only. It does not close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AJ full Cartesian next-shard planner note

- AJ adds `tools/render_audit/plan_v8_full_cartesian_shards.cjs`.
- The planner reads a coverage ledger, finds uncovered ranges, and emits deterministic next execution ranges without claiming those ranges have already run.
- It reports exact range commands and shard-index batch commands separately.
- If a partially covered shard would be rerun by shard index, it reports `wouldRerunCaseCountIfUsingShardIndexes` and marks `exactRangeExecutionRequiredForNoDuplicateCoverage=true`.
- Verification on 2026-06-03: clean ledger pilot with `--shard-size=8 --max-shards=4` planned shard indexes 1,2,3,4 / planned uncovered 32 / duplicate-if-batch 0; truncation probe with `--shard-size=100000 --max-shards=2` planned exact `8~100000` first / planned uncovered 199,992 / duplicate-if-batch 8 / exact range required true; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- At AJ, `index.html` reported scenario runner version `8.0-AJ`; AK is now the current reported version.
- This is a planning tool only. It does not execute the planned shards or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AI full Cartesian shard coverage ledger note

- AI adds `tools/render_audit/build_v8_full_cartesian_ledger.cjs`.
- The ledger recursively reads shard manifests and batch summaries, validates their hashes/schemas/non-claim flags, and merges coverage only from `executedEndExclusive`.
- This prevents a limited pilot such as `--max-cases=8` from being read as coverage through the planned `endExclusive` boundary.
- The ledger reports `gapCount`, `overlapCount`, `dirtySourceManifestCount`, `truncatedManifestCount`, `contiguousCoveredFromZero`, `uniqueExecutedCaseCount`, and `closureBlockers`.
- `run_v8_full_cartesian_batch.cjs` now writes an ignored `coverage_ledger.json` checkpoint for each batch folder after shard analyzer validation.
- At AI, `index.html` reported scenario runner version `8.0-AI`; AJ is now the current reported version.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; `run_v8_full_cartesian_batch.cjs --shards=0,144 --shard-size=8 --max-cases=8 --label=ai_ledger_pilot` = 2 shards / decoded 16 / calculated 8 / constraint-only 8 / ledger unique 16 / gap 2 / dirty-source manifests 2 / fullCoverageCandidate false; post-commit clean-source rerun `--label=ai_clean_ledger_pilot` = ledger dirty-source manifests 0 / unique 16 / gap 2 / fullCoverageCandidate false; truncation probe with `--shard-size=100000 --max-cases=8` = ledger unique 8 / truncated manifests 1 / first gap starts at 8; contiguous probe with `--shards=0,1 --shard-size=8` = ledger unique 16 / overlap 0 / first gap starts at 16; full internal suite = 99 suites / 1056 cases / failed 0.
- This is a checkpoint/gap-tracking tool only. It does not execute all `80,621,568,000` rows or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AH profile-owned visual QA evidence realignment note

- AH re-audit found that the AA/AB runtime and render-audit fixture still started the mixed candidate-v2 case from `routinePlan=ppl_ul` / `routine=PUSH`, relying on normalization to reach `profileSession=mixed_strength_cardio`.
- That was the same class of shortcut the AG profile/session correction was meant to prevent: the evidence named the right derived session but did not prove the user-owned `exerciseProfile + routinePlan + routine` input.
- The candidate-v2 runtime QA and render-audit payload now use `exerciseProfile=mixed`, `routinePlan=mixed_balanced`, and `routine=mixed_strength_cardio` directly.
- `analyze_render_audit.cjs` now requires all 8 post-wiring candidate-v2 captures to report `routinePlan=mixed_balanced` and `routine=mixed_strength_cardio`, in addition to `exerciseProfile=mixed`, `profileSession=mixed_strength_cardio`, `selectedMacroBasis=profile_candidate_v2`, `productionTargetCalApplied=true`, and `recentGateStatus=applied`.
- At AH, `index.html` reported scenario runner version `8.0-AH`; AI is now the current reported version.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; render audit capture/analyzer = 55 captures / 8 post-wiring candidate-v2 captures / failed 0; full internal suite = 99 suites / 1056 cases / failed 0.
- This is a visual/runtime evidence realignment only. It does not close `full_8_2_cartesian_execution` or `full_v8_completion`.

# v8.0-AG profile routine ownership realignment note

- `profileSession` is no longer treated as a separate user-facing session shortcut. It is a derived snapshot/draft/report field from the actual `exerciseProfile + routinePlan + routine` selection.
- Pre-V8 behavior is the baseline: with advanced training off, bodybuilding/general training shows user-facing `휴식 / 운동` while the internal values are `REST / PUSH`; the exercise day intensity is auto `0.70 + weeklyTrainingDays` adjustment. With advanced training on, the original bodybuilding `PPL-UL / 2분할 / 3분할 / 4분할 / 5분할` routine plans remain selectable.
- Non-bodybuilding profiles now use profile-owned routine plans and sessions instead of mapping through bodybuilding fallbacks: running uses `running_base` / `running_speed` sessions with cardio defaults and zero weight duration by default, strength uses strength plans/sessions, powerbuilding uses powerbuilding plans/sessions, and mixed uses mixed plans/sessions.
- AG follow-up re-audit also corrected the V8 scenario runner itself. Running, strength, powerbuilding, and mixed human-review/targeted cases now calculate through their profile-owned routine/session values (`running_tempo`, `strength_heavy_lower`, `powerbuilding_lower`, `mixed_strength_cardio`) instead of `UPPER` / `LOWER` / `LEGS` / `PUSH` bodybuilding fallbacks.
- Current AG runner direct check: `profileSessionCarbPolicy.summary.productionFallbackCount=0`; `running_focused.input.todayRoutine=running_tempo`; `low_reliability_user.input.todayRoutine=mixed_strength_cardio`; `targeted_mixed_carb_unresolved.candidate.targetDeltaKcal≈128.996`; `low_reliability_user.candidate.targetDeltaKcal≈130.646`; both mixed cases reach `carbsGPerKgBodyweight=6`.
- Historical pre-AG uses of target-delta numbers such as `25.029`, `29.446`, `43.729`, and `51.446` remain historical evidence from old fallback-shaped runner/runtime probes. Do not use a numeric value as stage-current AG+ evidence unless the profile-owned runner/runtime was re-run for that exact stage; `29.446` is also revalidated later as AA runtime evidence, so the stage/source matters more than the number text.
- The old v8.0-P sentence that profile/session preservation should keep production `targetCal` unchanged was an incorrect contract interpretation. Routine/session, intensity, weight duration, and cardio defaults are production workout inputs, so profile-owned sessions can change `targetCal` through the existing workout calculation path.
- At AG, `index.html` reported scenario runner version `8.0-AG`; AH is now the current reported version.
- Verification on 2026-06-03: `runTodayQuickEditTests` = 1 suite / 27 cases / failed 0; `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1056 cases / failed 0; render audit capture/analyzer = 55 captures / failed 0. Spot-checks included Settings groups open and Today quick-open profile candidate screens on desktop/mobile.

# v8.0-AF shard batch orchestration pilot note

- At AF, `index.html` reported scenario runner version `8.0-AF`; AG is now the current reported version.
- New batch runner: `tools/render_audit/run_v8_full_cartesian_batch.cjs`.
- Batch runner supports `--shards=0,144` and contiguous `--start-shard` / `--shard-count` modes, runs shard manifests through `run_v8_full_cartesian_shard.cjs`, then invokes `analyze_v8_full_cartesian_shards.cjs` for the batch folder.
- AF pilot on 2026-06-03: `--shards=0,144 --shard-size=8 --max-cases=8 --label=af_pilot` produced batch schema `v8_full_cartesian_batch_manifest_v1`, 2 shard runs, analyzer failed 0, decoded 16, calculated 8, constraint-only 8, truncated 0.
- Direct analyzer re-check on the batch folder also reported 2 manifests / failed 0.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.
- This is batch orchestration for bounded evidence only. It still does not execute all `80,621,568,000` rows or close `full_8_2_cartesian_execution` / `full_v8_completion`.

# v8.0-AE shard manifest integrity and analyzer note

- `runV8FullCartesianShard()` now emits report schema `v8_full_cartesian_shard_report_v1`, including decoded accounting and `calculationIssueCount`.
- `tools/render_audit/run_v8_full_cartesian_shard.cjs` now wraps each shard report in manifest schema `v8_full_cartesian_shard_manifest_v1` with `reportSha256`, `manifestSha256`, git/source hashes, command args, and shard summary fields.
- The CLI also supports `--shard-index` / `--shard-size` so future shard batches do not need hand-computed start/end ranges.
- New analyzer: `tools/render_audit/analyze_v8_full_cartesian_shards.cjs` validates manifest schema, report schema, hashes, source hash presence, decoded/calculated/constraint accounting, and the non-claim flags.
- AE evidence on 2026-06-03: shard analyzer over 2 manifests reported `failedCount=0`, decoded 11, calculated 8, constraint-only 3, truncated 0.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.
- This still does not execute all `80,621,568,000` rows and does not close `full_8_2_cartesian_execution` or `full_v8_completion`.

# v8.0-AD deterministic full Cartesian shard pilot note

- `index.html` now exports `runV8FullCartesianShard()` at stage `8-2_full_cartesian_shard_execution_v0`.
- `tools/render_audit/run_v8_full_cartesian_shard.cjs` runs bounded shard ranges in a browser and writes ignored JSON evidence under `tools/render_audit/v8_full_cartesian_shards/`.
- Pilot evidence on 2026-06-03: `--start=0 --limit=8 --max-cases=8` decoded 8 rows, calculated 8 rows, constraint-only 0; `--start=1152 --limit=3 --max-cases=3` decoded 3 rows, calculated 0 rows, constraint-only 3.
- Constraint-only rows are not calculated as plausible sessions; the pilot at index 1152 reports `training_session_without_weight_duration`, `weekly_zero_with_training_session`, and `no_performance_with_training_session`.
- This is a bounded shard executor/pilot only. It does not execute all `80,621,568,000` rows and does not close `full_8_2_cartesian_execution` or `full_v8_completion`.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 26 cases / failed 0; full internal suite = 99 suites / 1054 cases / failed 0.

# v8.0-AC full Cartesian execution contract note

- v8.0-AC introduced `fullCartesianExecutionContract` at `8-2_full_cartesian_execution_contract_v0`; the current runner version may be later.
- The contract recomputes the 20 required-axis product as `80,621,568,000`, exposes deterministic axis strides, and decodes pilot indexes `0`, `1`, middle, `80,621,567,998`, and `80,621,567,999`.
- The default shard contract is `100,000` rows per shard, so the planned full run is `806,216` shards and the final shard contains `68,000` rows.
- This is an execution/audit contract only. It does not execute the full Cartesian set, does not replace pairwise/targeted stress or the 18 human-review cases, and does not add new exercise-physiology evidence.
- Remaining open scopes are still `full_8_2_cartesian_execution` and `full_v8_completion`.
- Verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 25 cases / failed 0; full internal suite = 99 suites / 1053 cases / failed 0.

# v8.0-AB post-wiring production visual QA note

- `tools/render_audit/capture_render_audit.cjs` now includes the actual AA-wired candidate-v2 production case as a separate `profileCandidateV2` payload instead of relying on the old rich bodybuilding fixture.
- The post-wiring visual set covers Today applied, Today quick-open, Records detail, and Records basis-open surfaces on desktop/mobile. The basis-open capture verifies that the user can see the saved profile/session target correction context, not just the collapsed record shell.
- `tools/render_audit/analyze_render_audit.cjs` now requires 55 captures = 37 desktop + 18 mobile and checks 8 post-wiring profile-candidate captures for runtime evidence: `exerciseProfile=mixed`, `profileSession=mixed_strength_cardio`, `routinePlan=mixed_balanced`, `routine=mixed_strength_cardio`, `selectedMacroBasis=profile_candidate_v2`, `productionTargetCalApplied=true`, `recentGateStatus=applied`.
- `runV8ScenarioRunner()` now reports version `8.0-AB`; its approval decision marks `productionVisualQaCompleted=true` and removes `post_wiring_production_visual_qa` from `notApprovedYet` while keeping full Cartesian/full V8 open.
- Latest render audit on 2026-06-03: `captureCount=55`, `postWiringProfileCandidateCaptureCount=8`, `postWiringProfileCandidateAppliedCaptureCount=8`, `failedCount=0`, `minUniqueSampleColorCount=547`, `minLuminanceStdDev=22.743`.
- Spot-checked screenshots: `52_mobile_today_profile_candidate_v2_applied.png`, `54_mobile_records_profile_candidate_v2_detail.png`, `55_desktop_records_profile_candidate_v2_basis_open.png`, and `56_mobile_records_profile_candidate_v2_basis_open.png`.
- Internal regression on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0; full internal suite = 99 suites / 1052 cases / failed 0.
- This closes `post_wiring_production_visual_qa` only. It does not claim `full_8_2_cartesian_execution`, `full_v8_completion`, or any new external exercise-physiology evidence.

# v8.0-AA production candidate-v2 target wiring note

- `calculate()` now applies the approved `candidate-v8-profile-macro-v2-linked-target-v0` target/macro output to production for active runtime profile target-delta cases.
- Direct extraction on 2026-06-03: mixed high-load runtime QA reports `productionTargetCal=3312.9411753385825`, `proposedCandidateTargetCal=3312.9411753385825`, `targetDeltaKcal=29.446064227471197`, `targetDeltaApplied=true`, `productionTargetCalApplied=true`, `recentGateStatus=applied`, and `coachHasProfileTargetDeltaAppliedDecision=true`.
- The historical scenario/audit baseline is kept separate: `runV8ScenarioRunner()` calls the scenario baseline with `profileCandidateV2ProductionWiring=false`, so v8.0-D~X report-only candidate comparisons are not reinterpreted through the AA production result.
- During AA verification, a sandbox restore leak was found: V8 runtime QA could leave `exerciseProfile/profileSession` DOM values as `mixed / mixed_strength_cardio` for later suites. `withRecordTestSandbox()` and `withCalibrationReportSandbox()` now restore those inputs explicitly.
- This is production target application for active runtime target-delta cases only. It does not claim post-wiring production visual QA, full 8-2 Cartesian execution, or full V8 completion, and it does not introduce new external exercise-physiology evidence beyond the already documented candidate-v2 evidence boundary.
- Still-open scopes are `post_wiring_production_visual_qa`, `full_8_2_cartesian_execution`, and `full_v8_completion`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 132 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1052 cases / failed 0.

# v8.0-Z profile formula approval decision note

- `runV8ScenarioRunner()` now includes `profileFormulaApprovalDecision` at `9-11_profile_formula_approval_decision_v0`.
- Candidate-v2 is approved only for the next production wiring step: `candidateFormulaApproved=true`, `approvedCandidateModel=candidate-v8-profile-macro-v2-linked-target-v0`, `productionWiringAllowed=true`.
- This is not production application and not full V8 completion. Direct extraction on 2026-06-03: `productionFormulaChanged=false`, `productionTargetCalApplied=false`, `productionVisualQaCompleted=false`, `fullV8Complete=false`.
- Still-open scopes are `production_targetCal_application`, `post_wiring_production_visual_qa`, `full_8_2_cartesian_execution`, and `full_v8_completion`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 24 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 132 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1052 cases / failed 0.

# v8.0-Y profile formula approval preflight note

- `runV8ScenarioRunner()` now includes `profileFormulaApprovalPreflight` at `9-10_profile_formula_approval_preflight_v0`.
- This is a report-only approval preflight. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, does not change production formulas, does not apply production `targetCal`, and does not close post-wiring visual QA.
- Direct extraction on 2026-06-03: `checkCount=5`, `readyCheckCount=5`, `blockedCount=0`, `approvalPreflightReady=true`, `readyForExplicitFormulaApprovalDecision=true`.
- Boundary values remain explicit: `candidateFormulaApproved=false`, `productionFormulaChanged=false`, `productionWiringAllowed=false`, `productionTargetCalApplied=false`, `productionVisualQaCompleted=false`.
- The five ready checks are `candidate_v2_code_contracts_closed`, `human_review_numerical_gate_18_of_18`, `runtime_user_surfaces_review_only_ready`, `report_only_boundary_preserved`, and `candidate_target_delta_not_applied`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 23 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 131 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1051 cases / failed 0.

# v8.0-X candidate-v2 fat floor linked-target consistency note

- `candidate-v8-profile-macro-v2-linked-target-v0` remains report-only, but its linked-target feasibility check now evaluates the fat guard against the increased candidate target, not the pre-delta base target.
- Direct extraction on 2026-06-03: `profileMacroCandidateV2Comparison.summary.fatFloorRaisedForTargetDeltaCount=4`, `fatGuardConflictCount=0`, `fatGuardResolvedCount=5`.
- The previous W blocker `low_reliability_user` now has `targetDeltaKcal=51.44606338171707`, `targetRateDeltaEquivalentKgPerWeek=0.046769148528833696`, `carbsGPerKgBodyweight=6`, `fatGPerKgBodyweight=0.6274509778949856`, and `fatPercentKcal≈15`.
- `humanReviewNumericalApproval` now reports `numericApprovedCount=18`, `blockedCount=0`, `productionFormulaApprovalReady=true`, while `candidateFormulaApproved=false` and `productionFormulaChanged=false`.
- Runtime user-facing QA remains review-only: production `targetCal=3283.4951111111113`, proposed candidate target `3312.9411753385825`, `targetDeltaKcal=29.446064227471197`, `targetDeltaApplied=false`, `canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 22 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 130 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1050 cases / failed 0.

# v8.0-W human-review numerical approval gate note

- `runV8ScenarioRunner()` now includes `humanReviewNumericalApproval` at `8-3_human_review_numerical_approval_v0`.
- This is a report-only numerical gate for the 18 human-review candidate-v2 cases. It is not owner signoff, not formula approval, and not production `targetCal` application.
- Direct gate result on 2026-06-03: `humanReviewCaseCount=18`, `numericApprovedCount=17`, `blockedCount=1`, `productionFormulaApprovalReady=false`.
- The blocked case is `low_reliability_user`. The target-rate high finding is resolved for this numerical gate by the already-closed target-rate/recentContext/score/Coach/user-facing QA contracts, but `fat_percent_below_contest_prep_reference_floor` remains an unresolved external-reference blocker.
- Superseding note: v8.0-X resolves this W blocker inside report-only candidate-v2 by rechecking the fat reference against the increased linked target.
- Required regression `required_user_rest_diet_1913` is numerically approved for owner formula review only; it is not production approval.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 22 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 130 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1050 cases / failed 0.

# v8.0-V mobile screenshot audit analyzer note

- `tools/render_audit/analyze_render_audit.cjs` now verifies the ignored screenshot manifest and PNGs generated by `capture_render_audit.cjs`.
- Latest run on 2026-06-03 KST: `capture_render_audit.cjs` generated 47 captures = 33 desktop + 14 mobile.
- Latest analyzer output: `failedCount=0`, `minMobileImageHeight=1601`, `maxMobileImageHeight=4909`, `minUniqueSampleColorCount=547`, `minLuminanceStdDev=24.244`.
- Manual spot-checks were performed for `34_mobile_today_rich.png`, `36_mobile_records.png`, and `40_mobile_settings.png`; the inspected mobile surfaces were nonblank and the primary cards/buttons fit within the mobile width.
- Full internal verification after the analyzer update on 2026-06-03: 99 suites / 1049 cases / failed 0.
- This closes the first-pass mobile/desktop screenshot audit evidence gate only. It does not approve candidate-v2, does not apply production `targetCal`, and does not replace production visual QA after formula wiring.

# v8.0-U candidate-v2 runtime user-facing QA note

- `runV8ScenarioRunner()` now includes `profileFormulaUserFacingQa` at `9-9_profile_formula_user_facing_qa_v0`.
- This is runtime user-facing QA only. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0`, does not change production formulas, and does not apply candidate-v2 target deltas to production `targetCal`.
- Direct extraction on 2026-06-03: runtime mixed high-load QA keeps production `targetCal=3283.4951111111113`, proposed candidate target `3308.524266666667`, `targetDeltaKcal=25.029155555555462`, weekly-rate equivalent `0.022753777777777692kg/week`.
- Direct extraction on 2026-06-03: `coachHasProfileTargetDeltaDecision=true`, `recordDetailHasProfileTargetDelta=true`, `recordDetailHasProfileTargetRateDelta=true`, `surfaceForbiddenTermCount=0`, `targetDeltaApplied=false`, `canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 21 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 129 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1049 cases / failed 0.

# v8.0-T candidate-v2 runtime target-delta proposal wiring note

- `index.html` now builds `profileMacroCandidateV2RuntimeProposal` from the actual `calculate()` Today profile/session path.
- The runtime proposal writes candidate-v2 metadata into `targetRateContext`: `profileMacroCandidateModel`, `profileMacroCandidateStage`, `profileTargetDeltaKcal`, and `profileTargetRateDeltaEquivalentKgPerWeek`.
- Mixed high-load runtime probe: production `targetCal=3283.4951111111113`, proposed candidate target `3308.524266666667`, `targetDeltaKcal=25.029155555555462`, weekly-rate equivalent `0.022753777777777692kg/week`.
- This is metadata wiring only. `profileCandidateDeltaContract.appliedToTarget=false`, production `targetCal` remains unchanged, `candidateFormulaApproved=false`, and `recentContext.profileCandidateV2TargetDeltaGate.canApplyAutomatically=false`.
- Scenario runner verification on 2026-06-03: `runV8ScenarioRunnerTests` = 1 suite / 20 cases / failed 0.
- Calibration verification on 2026-06-03: 14 suites / 128 cases / failed 0.
- Full internal verification on 2026-06-03: 99 suites / 1048 cases / failed 0.

# v8.0-S protein guard candidate-v2 resolution contract note

- `index.html` separated the candidate-v2 protein guard issue into external evidence guard vs internal legacy guide-floor conflict at v8.0-S.
- For non-contest mixed/running candidate-v2 cases, protein at `2.0g/kg BW` was classified inside the ISSN general exercising-individual range, so legacy `2.2g/kg BW` diet-floor conflicts were recorded as resolved policy cases rather than unresolved production blockers. After AT, the production diet range itself is recovered, so current `proteinGuardResolvedCount` and `proteinLegacyGuideConflictCount` are 0.
- Contest-prep-like cases still use the Helms/Aragon/Fitschen lean-body-mass protein context, and low-protein or fat-floor failures would still remain blockers.
- Direct extraction at v8.0-S: `profileMacroCandidateV2Comparison`: `proteinGuardConflictCount=0`, `proteinGuardResolvedCount=4`, `proteinLegacyGuideConflictCount=4`, `fatGuardConflictCount=0`.
- Direct extraction after AT: `profileMacroCandidateV2Comparison`: `proteinGuardConflictCount=0`, `proteinGuardResolvedCount=0`, `proteinLegacyGuideConflictCount=0`, `fatGuardConflictCount=0`.
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

# v8.0-P profile/session snapshot contract note, AG-corrected

- `index.html` now exposes Settings/Today `exerciseProfile` and derives `profileSession` from the actual routine/session selection for Today draft, calculation state, Records `goalSnapshot`, snapshot signature, and full backup.
- This closes the input/snapshot/backup data contract only. It does not approve `candidate-v8-profile-macro-v2-linked-target-v0` or change production macro formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=9`, `missingContractCount=5`, `productionBlockerCount=6`, `productionReady=false`.
- Remaining missing production contracts are target-rate candidate delta, macro score profile, Daily Coach threshold, Daily Coach decision/copy, and recentContext target-delta gate.
- The extra production blocker beyond missing contracts is still `profileMacroCandidateV2Comparison.proteinGuardConflict`.
- Later AG re-audit corrected the old "unchanged production targetCal" reading: profile-owned routine/session context can change `targetCal` through existing workout inputs, and `profileSession` must remain derived rather than a separate user-facing bypass.

# v8.0-O profileMacroCandidateV2Contract note

- `runV8ScenarioRunner()` now includes `profileMacroCandidateV2Contract`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: `contractCount=14`, `presentCount=3`, `missingContractCount=11`, `productionBlockerCount=12`, `productionReady=false`.
- Missing production contracts are Settings/Today exerciseProfile input, Settings/Today profileSession derived field, Today draft persistence, target-rate candidate delta, Records snapshot/signature candidate fields, score, Coach thresholds/decisions, recentContext target-delta gate, and backup/import round-trip.
- Present guards are `profileMacroCandidateV2Comparison.reportOnlyGuard` and `targetedStress.constraintOnlyTupleGuard`.
- The extra production blocker beyond missing contracts is `profileMacroCandidateV2Comparison.proteinGuardConflict`, because the guard is present but unresolved.
- Evidence policy: internal code-contract review only; external sports-nutrition references remain threshold background and do not approve app-wide production behavior.

# v8.0-N profileMacroCandidateV2 note, AG-corrected

- At v8.0-N, `runV8ScenarioRunner()` first included `profileMacroCandidateV2Comparison`.
- This layer is report-only and does not change production formulas.
- Historical v8.0-N direct extraction on 2026-06-03: candidate-v2 comparison covers 96 cases = axis coverage 73 + human-review 18 + targeted calculated 5.
- `profileCarbFloorAttemptedCount=5`, `profileCarbFloorMetCount=5`, `profileCarbFloorUnresolvedCount=0`, `targetChangedCount=5`, `targetRateContractRequiredCount=5`, `proteinGuardConflictCount=4`.
- Pre-AG `targeted_mixed_carb_unresolved` opened `targetDeltaKcal=43.72915555555528`, `targetRateDeltaEquivalentKgPerWeek=0.03975377777777753`, and reached `carbsGPerKgBodyweight=6`. At AG+/AL before AT, profile-owned direct extraction was `targetDeltaKcal=128.996060400435`, `targetRateDeltaEquivalentKgPerWeek=0.11726914581857727`, `carbsGPerKgBodyweight=6`; the old `43.729` value must not be used as the scenario expectation for that stage, and neither value should be reused as current production-diet protein evidence after AT.
- This is not production approval. At v8.0-N those target/rate deltas still needed recent trend, score, Coach, Records, Settings/Today, and backup/import contracts; v8.0-P closes the input/snapshot/backup part, v8.0-Q closes target-rate metadata plus the recentContext gate, v8.0-R closes candidate-v2 score/Coach contracts, and v8.0-S resolves the protein guard blocker as an evidence/product-policy contract. Formula approval and production `targetCal` wiring still remain separate.

# v8.0-M targetedStress note

- `runV8ScenarioRunner()` now includes `targetedStress`.
- This layer is report-only and does not change production formulas.
- Direct extraction on 2026-06-03: total targeted cases 8 = 5 calculated review cases + 3 constraint-only excluded tuples.
- Focus counts: `derived_ffmi=1`, `inactive_intensity=1`, `mixed_carb_unresolved=2`, `maintain_non_bodybuilding=2`, `excluded_constraint=3`.
- AG+ profile-owned runner output had `mixedCarbUnresolvedCaseCount=2`: both `targeted_mixed_carb_unresolved` and `targeted_maintain_mixed_contract` carried candidate-v1 carb-floor unresolved findings. After AT, current `mixedCarbUnresolvedCaseCount=1`; the diet mixed case meets the carb floor after protein recovery, while maintain mixed remains unresolved and must not be flattened into a completed maintain formula.
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

## 5. 최신 V8 진행 경계

### v8.0-BL 본단계5 Records / Coach / Score / Backup 연결 계약

- BL은 `runV8ScenarioRunner()`에 `levelAwareMacroCandidateContract`를 추가한 report-only 계약이다.
- 계약 범위는 BA 후보가 Records snapshot/signature, Records 상세 기준, Score 근거, Coach 행동, Backup/import roundtrip, Recent context guard, user-facing 내부 label 차단과 어긋나지 않는지 확인하는 것이다.
- 정상 기준은 `contractCount=8`, `closedContractCount=8`, `missingContractCount=0`, `findingCount=0`이다.
- BL은 production 산식, user-facing copy, Score/Coach runtime, Records schema, Backup schema를 바꾸지 않는다.
- whole-stage evidence boundary audit는 BL이 추가되어 28개 check를 본다.
- BL 통과는 본단계5 완료 의미이며, 수준별 산식 production 적용 완료가 아니다.
- 다음 작업은 본단계6 `렌더/시나리오/테스트 검증`이다. 렌더와 실제 시나리오에서 깨지면 문서를 합리화하지 말고 코드/설계/문서 중 어디가 틀렸는지 재판단한다.
- 2026-06-05 검증: `runV8ScenarioRunnerTests` 1 suite / 40 cases / failed 0, `runV8ScenarioRunnerTests,runTodayCalculationOwnershipTests,runTodayQuickEditTests` 3 suites / 98 cases / failed 0.

### v8.0-BM 본단계6 렌더 / 시나리오 / 테스트 검증 경계

- BM은 `runV8ScenarioRunner()`에 `levelAwareRenderScenarioValidation`을 추가한 report-only 검증 경계다.
- 검증 범위는 BL 계약, BG 시나리오 레이어 분리, Records/Score/Coach/Backup 연결 시나리오, 기존 post-wiring render evidence, full Cartesian 미실행 경계, production 미적용 경계를 함께 확인하는 것이다.
- 정상 기준은 `validationCount=9`, `closedValidationCount=9`, `missingValidationCount=0`, `findingCount=0`이다.
- BM은 production 산식, user-facing copy, Score/Coach runtime, Records schema, Backup schema를 바꾸지 않는다.
- BM은 runner 내부에서 실제 screenshot capture를 실행했다고 주장하지 않는다. 실제 렌더 최신성은 별도 `capture_render_audit` / `analyze_render_audit` 명령으로 확인해야 한다.
- whole-stage evidence boundary audit는 BM이 추가되어 29개 check를 본다.
- 2026-06-05 검증: `runV8ScenarioRunnerTests`, `runTodayCalculationOwnershipTests`, `runTodayQuickEditTests` targeted 99 cases 통과, core profile 371 cases 통과, fresh render audit 66 captures / failed 0 통과.
- BM 통과는 본단계6 완료 의미이며, 수준별 산식 production 적용 완료나 full V8 completion이 아니다.
- 다음 작업은 BO `수행능력 입력 피로도 / 산식 반영 범위 감사`다. BM 이후 곧바로 production 적용으로 가지 않고, 입력 부담과 산식 반영 범위를 먼저 닫는다.

### v8.0-BO 수행능력 입력 피로도 / 산식 반영 범위 감사

- BO는 `runV8ScenarioRunner()`에 `performanceInputFatigueFormulaScopeAudit`을 추가한 report-only 감사다.
- 정상 기준은 `findingCount=0`, `requiredNewFieldCount=0`, `dailyPerformanceInputApproved=false`, `standalonePerformanceSelectorApproved=false`, `missingEvidencePenaltyAllowed=false`다.
- 수행근거는 선택 입력/기록 추론 근거로만 허용한다. 없다고 해서 사용자 수준을 깎거나 targetCal을 낮추지 않는다.
- `performanceLevel`과 relative strain은 운동 kcal 배율, targetCal 직접 이동, production formula 승인 근거가 아니다.
- 운동 kcal 책임은 측정 가능한 workload 입력에 남긴다. 프로필/세션/수행능력은 회복, fuel, Coach 설명, 시나리오 감사, 추후 target relief 검토 신호로 쓴다.
- whole-stage evidence boundary audit는 BO가 추가되어 30개 check를 본다.
- 단계 삭제는 없다. 단계 추가는 BO이며, 다음 단계는 `profile_session_numeric_scenario_validation_before_formula_application`으로 수정한다.

### v8.0-BP 프로필/세션 숫자 시나리오 검증

- BP는 `runV8ScenarioRunner()`에 `profileSessionNumericScenarioValidation`을 추가한 report-only 검증이다.
- 검증 범위는 모든 운동 프로필의 루틴/세션 기본 `xw`, 기본 웨이트 시간, 유산소 기본값, REST 0 처리, 러닝의 유산소 소유권, 혼합형의 저항/유산소 부하 경계다.
- 정상 기준은 `findingCount=0`, `profileCoverageClosed=true`, `profileRestCoverageClosed=true`, `sessionOwnershipClosed=true`, `restDefaultsClosed=true`, `runningCardioOwned=true`, `resistanceSessionsHaveLoad=true`, `mixedHybridBoundsClosed=true`, `defaultBoundsClosed=true`다.
- BP는 production targetCal, production macro allocation, Records schema, Coach copy, UI, 기본 시간, 기본 xw, 유산소 기본값을 바꾸지 않는다.
- BP 통과는 “현재 앱의 프로필/세션 숫자 기본값이 산식에 들어가기 전 구조적으로 모순이 없다”는 의미이지, “그 숫자를 production 산식에 적용해도 된다”는 의미가 아니다.
- whole-stage evidence boundary audit는 BP가 추가되어 31개 check를 본다.
- 삭제된 단계는 없다. 추가된 단계는 BP이며, BO의 다음 작업인 `profile_session_numeric_scenario_validation_before_formula_application`은 `guide_activity_basis_role_split_audit_before_formula_application`으로 이어진다.
- 다음 작업은 가이드 기준/활동량 기준의 역할 분리 감사다. 두 기준이 같은 숫자 정책을 공유할 수 있더라도 사용자에게 다르게 설명되고 다르게 비교되어야 하므로, 숫자 검증 통과만으로 두 기준 양립을 승인하면 안 된다.

### v8.0-BQ 가이드 기준/활동량 기준 역할 분리 감사

- BQ는 `runV8ScenarioRunner()`에 `guideActivityBasisRoleSplitAudit`을 추가한 report-only 감사다.
- 같은 시나리오에서 `uiState.selectedMacroBasis`만 `guide`/`activity`로 바꿔 `calculate()`를 다시 실행한다.
- 목표 정상 기준은 `findingCount=0`, `targetCalPreserved=true`, `selectedBasisChangesMacrosNotTarget=true`, `selectedBasisMatchesRequest=true`, `storageSchemaClean=true`, `referenceTargetSeparated=true`, `defaultBasisPreserved=true`, `togglePreserved=true`다.
- 두 기준은 production targetCal을 새로 만들지 않는다. 사용자가 보는 목표 칼로리는 동일하고, 선택 기준은 탄단지 배분과 g/kg 상태 문구/비교 설명만 바꾼다.
- 활동량 기준의 `referenceTargetCal`은 "활동량 기준이 참고로 본 목표"이며, production targetCal과 분리해서 둔다. 이 값을 사용자 목표 칼로리로 덮어쓰면 안 된다.
- 선택 기준은 `selectedMacroBasis`/`macroBasis` 같은 localStorage, Records, Backup schema 필드로 저장하지 않는다. 기준 선택은 현재 화면의 비교 보기다.
- BQ 자체는 production formula, UI, user-facing copy, Records schema, Backup schema를 바꾸지 않는 감사다.
- 2026-06-06 BQ 감사에서 blocker가 발견됐다. `buildDualBasisProduction()` 단계에서는 guide/activity가 같은 authoritative targetCal을 공유하지만, 그 뒤 `profile_candidate_v2` scoped production wiring이 현재 선택된 기준의 탄단지를 읽으면서 일부 시나리오에서 최종 `calculate().targetCal`이 86~136kcal 움직였다.
- 이 문제를 무시하면 사용자가 `가이드 기준`과 `활동량 기준` 토글을 누르는 것만으로 목표 칼로리가 달라지는 앱처럼 보인다. 이 토글은 비교/해석 축이지 목표 칼로리 엔진 선택지가 아니다.
- 2026-06-06 BR에서 이 blocker를 닫았다. `profile_candidate_v2`의 target relief 입력은 이제 UI에서 선택된 guide/activity basis가 아니라 canonical guide policy basis와 `dualBasis.authoritativeTargetCal`을 사용한다. UI 선택값은 비교 표시와 macro allocation 보기로만 남긴다.
- 현재 정상 기준은 `guideActivityBasisRoleSplitClosed=true`, `targetCalPreserved=true`, `findingCount=0`이다. 테스트도 더 이상 `basis_toggle_changes_target_cal`을 정상으로 보지 않고, guide/activity 토글이 targetCal을 보존하면서 macro 차이만 만드는지 검증한다.
- whole-stage evidence boundary audit는 32개 check를 보며, BR 이후 BQ check도 통과한다. 단, 이것은 full V8 completion이 아니라 guide/activity target-policy 누수가 닫혔다는 뜻이다.
- 삭제된 단계는 없다. 추가된 단계는 BQ와 BR이다. BP의 다음 작업인 `guide_activity_basis_role_split_audit_before_formula_application`은 BQ/BR을 거쳐 `profile_formula_application_decision_after_guide_activity_basis_role_split`로 이어진다.
- 다음 단계에서 production 산식 반영 여부를 결정할 때도 이 원칙은 유지한다. `가이드 기준/활동량 기준`은 서로 다른 목표 칼로리 엔진이 아니라 같은 목표 안에서 탄단지 배분과 설명을 비교하는 축이다.

### v8.0-BN 외부근거 매크로 정책표 비교 러너

- BN은 `docs/v8_외부근거_매크로_정책표_2026-06-05.txt`의 단백질·지방·탄수 정책을 `EXTERNAL_MACRO_POLICY_TABLE` 코드 상수와 `runExternalMacroPolicyComparison()`으로 옮긴 report-only 비교 단계다.
- BN은 production targetCal, production macro allocation, Records schema, Coach copy, UI를 바꾸지 않는다.
- 비교 러너는 현재 production 산식 결과를 외부근거 정책표와 대조해 `protein_overfill_before_fat_cut`, `carb_below_training_band`, `fat_floor_used_for_carb_pressure`, `fat_floor_used_without_reason`, `fat_below_general_floor`, `target_relief_preferred_over_fat_cut` 같은 충돌 신호를 리포트한다.
- 이 단계의 의미는 “수준별 × 목표별 매크로 정책이 production에 적용됐다”가 아니라 “production에 적용하기 전에 무엇을 고쳐야 하는지 자동으로 볼 수 있는 대조표가 생겼다”이다.
- 2026-06-05 검증: `runExternalMacroPolicyComparisonTests` 5개 케이스 통과, `--profile=calibration` 15개 suite / 154개 case / failed 0 통과.
- 다음 작업은 BN 리포트 결과를 기준으로 production 후보를 좁히는 것이다. 후보는 단백질 기본값, 지방 선택 사유, 탄수 잔여 배분, 20% 미만 지방 대신 목표 완화가 필요한 케이스를 함께 판단해야 한다.
