MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt
- docs/00_current_truth/05_required_result_log_format.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1 plus v8.3.1 Today score ownership cleanup, adaptive-target stable help, and required result-log format
- source_ledger_checked: not reopened as a production instruction; current 9-axis scoring identity and current penalty curves were read from production code and active current truth
- superseded_docs_checked: yes, through docs/00_current_truth/04_document_status_index.txt; archived v8.2 fixed contribution tables were not used as a candidate formula
- external_anchor_checked: docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt and docs/references/external/acsm_resistance_training_guide_ko_2026.txt; no external anchor or coefficient was changed
- session_original_intent_checked: yes, from the current raw Codex session JSONL and the restored source session route

DOCUMENT ROLE
- decision
- docs-only architecture feasibility / simulation decision
- no production implementation

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview mainline
- preview field storage/UI/Recent/DailyCoach exposure

# component score architecture simulation decision

Date: 2026-07-11

Decision summary:

```text
architecture feasibility: CONDITIONAL_ACCEPT
selected candidate: contextual_multiplicative_domain_score_v1_candidate
production implementation readiness: BLOCKED
current production formula: KEEP until explicitly superseded
new scoring version: required if implemented, likely v8.4 candidate
DailyCoach semantic v2 phase 1: paused until this score path is resolved
```

## 비개발자용 설명

### 무엇을 바꿨는지

앱 코드는 바꾸지 않았다. 대신 사용자가 제안한 “탄수화물 100점, 단백질 80.5점처럼 각 항목을 양수 점수로 보여 주는 방식”이 실제로 성립할 수 있는지 현재 계산기를 사용해 검산했다.

처음 제시된 세 후보만 따르지 않고 다음 다섯 구조를 비교했다.

1. 현재처럼 9개 감점을 더하는 방식
2. 네 핵심 점수를 평균하고 술·조합·데이터를 추가로 빼는 방식
3. 일곱 사용자 영역을 평균하는 방식
4. 아홉 감점축을 각각 점수로 바꿔 평균하는 방식
5. 네 핵심 점수와 필요한 조건부 점수를 모두 `0~100점`으로 만든 뒤 곱해서 결합하는 방식

결론은 다섯 번째 방식만 다음 판단으로 넘길 가치가 있다는 것이다. 하지만 production 구현을 승인한 것은 아니다. 현재 앱 목표와 점수 기준 사이에 먼저 닫아야 할 정합성 문제가 실제 시뮬레이션에서 발견됐고, 새 방식은 점수 버전과 Records 계약까지 바꾸기 때문이다.

### 왜 바꿨는지

현재 타일은 독립 점수가 아니라 최종점수에서 실제로 빠진 감점 묶음이다. 이를 단순히 `100 - 감점`으로 표시하면 네 타일이 좋아 보이는데 최종점수만 낮아지는 문제가 생긴다.

반대로 네 점수를 단순 평균하면 더 큰 문제가 생긴다. 예를 들어 단백질을 전혀 먹지 않아 단백질 점수가 `14점`이어도 다른 세 항목이 `100점`이면 평균은 `78.5점`이다. 현재 제품 의미에서 심각한 단백질 부족이 좋은 날처럼 보이므로 받아들일 수 없다.

곱셈형 후보는 다음 특성이 있다.

- 한 항목이 `100점`이면 최종점수를 깎지 않는다.
- 한 항목이 낮으면 다른 높은 항목이 그 문제를 평균으로 숨기지 않는다.
- 여러 항목의 문제가 겹쳐도 각 숫자가 최종점수에 어떻게 들어갔는지 정확히 재현할 수 있다.
- 목표와 운동 맥락은 “몇 g이 몇 점인가”를 바꾸지만, 같은 `80점`은 어느 목표에서도 최종점수에 `0.8`을 곱한다는 같은 의미를 가진다.

### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지

이번 커밋으로 실제 화면과 계산 결과는 달라지지 않는다.

향후 후보가 구현된다면 기본 화면은 다음 여섯 의미 영역을 사용한다.

```text
항상 보이는 핵심 점수:
- 탄수화물
- 단백질
- 지방
- 총칼로리

문제가 있을 때만 보이는 조건부 점수:
- 탄수·지방 조합
- 술 영향

숫자 점수가 아닌 상태:
- 입력값 신뢰도 / 확인 필요
```

후보 최종점수는 다음처럼 계산한다.

```text
최종점수 = 100
         × 탄수화물점수/100
         × 단백질점수/100
         × 지방점수/100
         × 총칼로리점수/100
         × 탄수·지방조합점수/100
         × 술영향점수/100
```

조건부 문제가 없으면 그 점수는 `100점`이므로 최종 결과에 영향을 주지 않고 화면에서 숨길 수 있다. 최종점수에 실제 영향을 주는 조건부 점수는 반드시 보여 주므로 숨은 감점은 없다.

사용자가 예로 든 네 점수가 `100 / 80.5 / 90 / 45.5`이고 조건부 문제가 없다면:

```text
100 × 1.00 × 0.805 × 0.90 × 0.455 = 32.965점
```

평균 `79점`이라고 오해시키지 않으면서도, 현재 감점 합산처럼 이유 없이 `16점`이 나온다고 느끼게 하지 않는다. 다만 이 방식은 평균이 아니므로 향후 UI도 평균처럼 보이게 만들면 안 된다.

### 정책, 산식, 데이터 해석이 바뀌었는지

현재 production 정책과 산식은 변경 없음.

다만 다음 scoring-version 후보에서 검토할 정책은 조건부로 채택했다.

- 목표·체중·운동량은 목표값과 적정 범위를 바꾼다.
- 같은 영역점수는 목표와 관계없이 같은 최종 영향도를 가진다.
- 운동은 최종 보너스가 아니라 목표 칼로리와 탄수화물 맥락을 구성한다.
- 운동 때문에 탄수 범위를 이동한 뒤 별도의 운동 보너스나 무조건적인 곡선 완화를 다시 붙이지 않는다.
- 앱이 선택한 목표 칼로리는 총소비량보다 높을 수 있으므로, 사용자가 그 목표를 정확히 먹었다는 이유만으로 TDEE 과부하 감점을 주지 않는다.
- 사용자가 선택한 단백질 `낮게/중간/높게` 목표가 실제 허용 범위 안이면 그 목표를 정확히 먹었을 때 단백질 감점을 주지 않는다.
- `dataOutlierPenalty`는 새 영양 품질 점수가 아니라 입력 확인 상태로 분리한다. 필수 입력이 없으면 기존처럼 null/blocked이며, 수치가 극단적이지만 계산 가능한 경우에는 영양 결과와 함께 입력 확인을 표시한다.

### 바꾸지 않은 범위와 보류한 내용

- `index.html`과 production score를 바꾸지 않았다.
- `ADHERENCE_SCORING_VERSION`과 앱 표시 버전을 바꾸지 않았다.
- Today UI, DailyCoach, Settings, tooltip을 바꾸지 않았다.
- storage/schema/backup/Records를 바꾸지 않았다.
- 과거 점수를 재계산하거나 삭제하지 않았다.
- 현재 9개 감점축과 기존 점수 근거 화면은 그대로 유지한다.
- 외부 영양 anchor, 감점 곡선 계수, adaptive limiter를 바꾸지 않았다.
- 임시 시뮬레이션 파일은 두 번의 동일 결과를 확인한 뒤 삭제했고 커밋하지 않았다.

### 사용자가 큰 틀에서 확인해야 할 판단점

추가로 사용자가 숫자 계수를 고를 필요는 없다. 이번 판단에서 큰 방향은 다음과 같이 정리한다.

```text
단순 100-감점 표시: 폐기 유지
단순 평균형 항목점수: 폐기
곱셈형 항목점수: 조건부 채택
현재 앱에 즉시 구현: 보류
새 사용자 입력: 현재는 불필요
새 scoring version: 필수
```

다음 단계에서 이 후보가 target 그대로 섭취, 목표별 의미, 운동 이중반영, 저장 기록 보존을 하나라도 지키지 못하면 조건부 채택을 취소하고 현재 감점 근거 구조로 돌아간다.

### 테스트에서 무엇을 검증했는지

- 현재 production helper로 424개 비교 fixture를 생성하고 같은 브라우저에서 두 번 실행해 동일 SHA-256 결과가 나오는지 확인했다.
- 목표, 운동 맥락, 단백질 단계까지 보정한 후보는 별도 252개 fixture를 두 번 실행해 동일 결과가 나오는지 확인했다.
- `6개 목표 × 3개 운동 맥락 × 3개 단백질 단계` 54개에서 앱 목표를 그대로 먹은 후보 점수가 모두 `100점`인지 확인했다.
- 휴식, 일반 운동, 고강도 운동에서 450g과 700g 탄수화물의 결과가 달라지되 고강도가 무조건 허용으로 바뀌지 않는지 확인했다.
- 총칼로리 0.8배, 1.2배, 1.5배와 단백질 0, 같은-칼로리 탄수·지방 교환, 술 112g, 데이터 이상, 복합 문제를 확인했다.
- missing TDEE와 추정 체중은 기존 source warning 계약을 유지하고, 필수 단백질 입력 누락은 null/blocked를 유지하는지 확인했다.

## 기술 검증

### 1. 원 세션 의도 재확인

원 세션에서 사용자가 일관되게 요구한 것은 다음이었다.

- 감점보다 `100점`, `80.5점` 같은 양수 항목점수가 더 직관적이다.
- 목표·운동 여부·운동 강도에 따라 같은 섭취량의 평가가 달라져야 한다.
- 운동 효과가 목표 칼로리와 탄수 범위에 중복 반영되면 구현하지 않을 수도 있다.
- 현재 앱 데이터가 부족한지 먼저 확인하고, 증명되기 전에는 입력 UI를 추가하지 않는다.

따라서 첨부 감사문의 “A/B/C 중 하나를 반드시 고른다”와 “채택 또는 폐기만 허용한다”는 부분은 원 의도보다 좁았다. 비선형 후보를 추가하고 `CONDITIONAL_ACCEPT / production BLOCKED` 상태를 허용하는 것이 원 의도에 더 가깝다.

### 2. 기존 결정의 정확한 상태

기존 문서의 다음 문구는 당시 문제에 대해서는 여전히 맞다.

```text
four standalone 0-100 component scores: REJECTED
```

정확한 적용 범위:

```text
REJECT 유지:
- 현재 감점을 단순히 100에서 뺀 네 독립 점수
- 네 점수 평균과 보이지 않는 추가 감점
- 네 점수가 최종점수와 재현되지 않는 구조

영구 REJECT 아님:
- 최종점수의 모든 요소가 한 번씩 포함되고
- 화면 숫자로 최종점수를 재현할 수 있으며
- 공통 score-band 의미를 갖는 새 scoring architecture
```

이 문서는 기존 결정을 삭제하지 않고 broad interpretation만 supersede한다.

### 3. 비교 모델

#### BASELINE

현재 9개 연속 감점을 더해 100에서 뺀다. production은 이 결정을 명시적으로 supersede할 때까지 유지한다.

#### MODEL A: 네 핵심 산술평균 + 조건부 차감

대표 equal-weight 시뮬레이션을 사용했다. 가중치를 바꿔도 한 영역의 weight가 최종 하락 한도가 되므로 구조적 문제가 남는다.

판정: REJECTED.

#### MODEL B: 7영역 산술평균

탄수, 단백질, 지방, 에너지, 조합, 술, 데이터를 같은 점수 영역으로 평균했다.

판정: REJECTED.

이유:
- 단백질 0g도 약 87.7점으로 보인다.
- 데이터 신뢰도를 영양 품질처럼 평균한다.
- 어떤 가중치도 여러 개의 심각한 단일 축을 동시에 충분히 강하게 만들 수 없다.

#### MODEL C: 9축 0~100 계층 평균

판정: REJECTED.

이유:
- 사용자 의미보다 내부 축이 앞선다.
- 단백질 0g도 약 90.4점으로 보인다.
- UI가 복잡해지고 산술평균의 구조적 한계는 그대로다.

#### MODEL D: contextual multiplicative domain score

판정: CONDITIONALLY_ACCEPTED.

내부 영역:

```text
core:
- energy
- protein
- fat
- carb

conditional:
- carbFatJoint
- alcohol

validity status, not score:
- data validity
```

각 영역의 `100점`은 중립 factor 1이며, 낮은 영역은 해당 비율만큼 최종점수를 낮춘다. 모든 factor가 화면에 있거나, `100점`이라 영향이 없을 때만 숨길 수 있다.

### 4. 산술평균 구조의 반증

가중평균에서 다른 항목이 모두 100이고 한 항목만 0이면 최종점수는 다음과 같다.

```text
final = 100 × (1 - failedDomainWeight)
```

단백질 하나만으로 최종점수를 29 이하로 만들려면 단백질 weight가 71%를 넘어야 한다. 탄수·에너지·술도 각각 심각한 단일 실패를 표현해야 한다면 이들 weight도 각각 71%를 넘어야 하지만 전체 weight 합은 100%라 동시에 성립할 수 없다.

따라서 “모든 영역의 심각한 단일 실패를 숨기지 않는다”와 “고정 산술 가중평균”은 동시에 만족할 수 없다.

### 5. 대표 모델 비교

| fixture | current | Model A | Model B | Model C | Model D |
| --- | ---: | ---: | ---: | ---: | ---: |
| target aligned | 100 | 100 | 100 | 100 | 100 |
| energy 1.5x | 39.185 | 84.796 | 91.312 | 93.243 | 39.185 |
| protein 0g | 14 | 78.5 | 87.714 | 90.444 | 14 |
| fat 0g | 60 | 90 | 94.286 | 95.556 | 60 |
| carb 0g | 46 | 86.5 | 92.286 | 94 | 46 |
| high-volume 700g actual kcal | 0 | 73.85 | 85.057 | 88.378 | 17.651 |
| alcohol 112g | 9.106 | 33.781 | 87.015 | 89.901 | 28.186 |
| mixed high kcal/fat/carb/alcohol | 0 | 34.775 | 79.938 | 84.397 | 12.16 |

Model D는 단일 축일 때 기존 severity를 그대로 읽고, 여러 문제가 겹칠 때 단순 감점 합보다 완만하지만 여전히 severe band를 유지했다.

### 6. 현재 production에서 발견한 선행 정합성 문제

현재 target/scoring alignment 테스트는 과거 사고 fixture에서 `totalBurn = targetKcal`로 둔다. 실제 벌크업은 target이 totalBurn보다 높고, 새 단백질 단계는 목표가 scoring hard floor보다 낮을 수 있다.

현재 medium 단백질 단계의 실제 18개 `goal × context` 목표 일치 fixture 중:

```text
exact 100이 아닌 사례: 7 / 18
95 미만 사례: 4 / 18
```

대표 사례:

| 목표 / 맥락 | 앱 단백질 목표 | 현재 점수 | 원인 |
| --- | ---: | ---: | --- |
| 다이어트 / 휴식 | 105g, 1.4g/kg | 94.444 | scorer가 diet 1.6g/kg를 다시 요구 |
| 유지 / 휴식 | 90g, 1.2g/kg | 94.04 | scorer가 rest 1.4g/kg를 다시 요구 |
| 린매스업 / 휴식 | 97.5g, 1.3g/kg | 94.631 | protein 2.786 + TDEE 2.583 |
| 벌크업 / 휴식 | 97.5g, 1.3g/kg | 89.272 | protein 2.786 + TDEE 7.942 |
| 유지 low / 휴식 | 75g, 1.0g/kg | 82.306 | 선택한 low target을 scorer가 부족으로 재판정 |

`low / medium / high × 6 goals × 3 contexts` 전체 54개에서는 현재 점수가 100이 아닌 사례가 21개였다.

이 문제는 새 component UI 때문에 생긴 것이 아니다. 현재 목표 generator와 current scorer가 단백질 선택 범위 및 의도된 surplus energy 기준을 완전히 공유하지 않는 기존 production gap이다.

### 7. 후보에서 사용한 정합성 조건

후보 시뮬레이션은 새 숫자 anchor를 만들지 않고 현재 곡선을 다음 기준에 연결했다.

```text
energy overload reference:
max(targetKcal, totalBurn)

protein shortage/excess reference:
current target-aligned proteinRange min/max
```

의미:
- 감량처럼 target이 totalBurn보다 낮으면 TDEE 축은 totalBurn을 계속 본다.
- 증량처럼 target이 totalBurn보다 높으면 앱이 처방한 target까지는 overload로 보지 않는다.
- target 초과는 기존 target-energy 축이 계속 잡는다.
- protein low/medium/high가 현재 정책 범위 안에서 선택됐다면 선택 target을 그대로 먹은 사용자를 부족으로 재판정하지 않는다.

이 조건을 적용한 Model D는 54개 목표 일치 fixture 모두 정확히 100점이었다.

### 8. 목표와 운동 맥락 결과

보정 후보의 6개 목표 범위:

| fixture | rest | normal | high-volume |
| --- | ---: | ---: | ---: |
| actual 450g carb | 32.286~66.71 | 59.355~73.831 | 95.718~99.534 |
| actual 700g carb | 0~12.274 | 2.579~21.424 | 42.175~56.221 |

같은 450g이라도 고강도일의 목표 칼로리와 탄수 범위가 높기 때문에 결과가 달라진다. 그러나 high-volume 700g은 여전히 problem/serious band이며 무조건 허용되지 않는다.

그 밖의 결과:

| fixture | candidate range | band |
| --- | ---: | --- |
| energy 0.8x normal | 93.319~93.926 | acceptable |
| energy 1.2x normal | 81.246~82.446 | warning |
| energy 1.5x normal | 35.986~39.684 | serious |
| protein 0g normal | 14 | severe |
| same-kcal carb-up/fat-down | 86.006~100 | acceptable/aligned |
| alcohol 112g normal | 26.146~28.925 | severe |
| mixed normal | 17.3~25.582 | severe |
| data outlier normal | 0 + input review | collapse + validity note |

### 9. 운동 이중반영 판단

탄수 450g을 scoring kcal 고정으로 고립시킨 기존 curve probe:

```text
rest: 90.869
high-volume: 92.149
difference: 1.28 points
```

탄수 맥락 자체의 완화는 작았다. 실제 maintain 450g 사례에서는:

```text
rest:
energy 50.831, carb 81.51, final 41.432

high-volume:
energy 95.783, carb 99.982, final 95.766
```

큰 차이의 대부분은 고강도일의 실제 target/totalBurn이 높아 450g이 전체 에너지 예산 안에 가까워지는 데서 왔다. 별도 운동 보너스나 세 번째 curve 완화를 추가하지 않았다.

판정:

```text
현재 synthetic evidence에서 과도한 이중 완화는 확인되지 않음.
target energy와 carb distribution은 서로 다른 의미로 유지 가능.
다만 실제 사용자 주간 샘플에서 고강도 context가 과대추정되면 후보를 취소하거나 context source를 보강해야 함.
```

### 10. data / alcohol / joint 처리

#### data validity

`dataOutlierPenalty`는 영양 품질 축으로 채택하지 않는다.

- missing protein 등 필수 데이터 없음: null/blocked 유지
- missing TDEE: score 가능 + source warning 유지
- inferred weight: score 가능 + source warning 유지
- extreme but numeric: 계산 결과와 별도로 입력 확인 표시

#### alcohol

술 kcal는 energy score에 들어가고, physiology risk는 alcohol score에 한 번 들어간다. 운동 맥락으로 alcohol score를 완화하지 않는다.

#### carb-fat joint

carb/fat 각각의 점수와 별도로 실제 joint failure가 있을 때만 조건부 점수를 표시하고 곱한다. 같은 penalty를 core와 joint에 중복 넣지 않는다.

### 11. 현재 앱 데이터 충분성

시뮬레이션 시작과 후보 계산에는 현재 데이터가 충분하다.

- goal
- body weight
- exercise management mode
- routine / rest
- weight duration
- weekly training days
- intensity-derived exercise kcal
- cardio kcal
- target kcal and selected macros

새 사용자 입력은 열지 않는다. 실제 샘플에서 운동 강도 추정이 부족하다는 증거가 나올 때만 completed session, effort, source confidence 같은 추가 입력을 검토한다.

### 12. scoring version / Records 계약

이 후보는 표시만 바꾸는 UI 작업이 아니다.

변경되는 것:
- final aggregation
- target/TDEE overload reference
- selected protein range reference
- data validity ownership
- component score output shape

따라서 구현 시 새 `ADHERENCE_SCORING_VERSION`이 필수이며 예상 버전은 v8.4 candidate다.

과거 Records:
- 기존 `adherencePercent`와 기존 scoring version을 그대로 보존한다.
- silent recompute하지 않는다.
- 현재 저장 기록에는 breakdown/domain score가 없으므로 과거 항목점수를 추정하지 않는다.
- 새 Records에서 항목점수를 다시 보여 주려면 새 score snapshot을 저장할지, Today에서만 항목점수를 보일지 다음 implementation decision에서 명시적으로 닫아야 한다.

### 13. 채택 조건 판정

| 조건 | 판정 | 근거 |
| --- | --- | --- |
| 모든 최종 요소 한 번 포함 | PASS candidate | 4 core + joint + alcohol unique factors |
| hidden modifier 없음 | PASS candidate | non-100 conditional factor는 표시 필수 |
| 화면 숫자로 final 재현 | PASS candidate | multiplicative formula |
| goal/exercise 차이 존재 | PASS | 450g/700g matrix |
| 동일 score 의미 유지 | PASS candidate | 같은 80점은 factor 0.8 |
| 운동 final bonus 없음 | PASS | target/context only |
| excessive double relaxation 없음 | PASS synthetic / real-data pending | isolated vs actual probe |
| target 그대로 섭취 invariant | PASS corrected candidate 54/54 | current production은 21/54 non-100 |
| alcohol/data/joint 숨지 않음 | PASS candidate | alcohol/joint score, data status |
| null/blocked 유지 | PASS | missing protein null |
| old Records silent recompute 없음 | PASS decision | implementation contract pending |

### 14. 최종 결정

```text
naive 100-minus display: REJECTED
arithmetic component average: REJECTED
7-domain arithmetic model: REJECTED
9-axis arithmetic/hierarchical model: REJECTED
contextual multiplicative domain model: CONDITIONALLY_ACCEPTED
production implementation: NOT OPEN
```

조건부 채택이 틀렸다고 볼 조건:
- 실제 목표 그대로 먹은 사례가 다시 100에서 벗어남
- 고강도 입력이 700g 같은 극단을 aligned/acceptable로 만듦
- 같은 80점이 goal별로 다른 final factor가 됨
- alcohol/joint/data가 숨은 조정으로 돌아감
- Records를 같은 version으로 조용히 재계산함
- UI가 곱셈 결과를 단순 평균처럼 암시함

### 15. 다음 단계

다음 gate:

```text
v8.4 candidate component-score scoring-version implementation decision
```

이 다음 gate가 반드시 닫을 것:
- exact domain severity curves and rounding
- target-aware energy overload reference
- selected proteinRange reference
- joint/alcohol factor contract
- data validity warning/null contract
- Today UI formula reproducibility
- new scoringVersion name
- new Records snapshot 여부
- old Records display and no-recompute contract
- full goal × exercise × protein-level regression matrix
- actual user-day sample audit

DailyCoach semantic v2 phase 1은 이 결론이 폐기되거나 새 scoring version 구현 경계가 확정될 때까지 시작하지 않는다.

## 결과로그

### 작업 결과

- branch: `codex/component-score-architecture-simulation-decision`
- decision/routing commit: `9ea7f9a` (`항목별 점수 아키텍처 시뮬레이션 결정 문서화`)
- documentation closeout commit: `95e7709` (`항목별 점수 결정 결과로그 갱신`)
- feature branch push: completed
- master no-ff merge: `146ce3f` (`항목별 점수 아키텍처 시뮬레이션 결정 병합`)
- master push: completed
- working tree: clean at the feature merge/push checkpoint; this final docs-only closeout records the completed refs
- production code diff: none required
- pre-commit docs-policy: pass
- pre-commit full regression: 142 suites / 1,425 cases / 0 failures; console/page error 0 / 0
- post-merge docs-policy: pass
- post-merge full regression: 142 suites / 1,425 cases / 0 failures; console/page error 0 / 0

### PROMPT_SCOPE_AUDIT

- 요청된 다음 단계: 첨부 감사문에 따라 component score architecture feasibility / simulation decision을 수행한다.
- repo 기준 실제 다음 단계: 문서상 DailyCoach semantic v2였지만, 최신 사용자가 score surface 의미를 다시 열었고 Coach가 그 점수를 설명하므로 score architecture 판단이 선행한다.
- 실제 문제: 감점 표시는 직관적이지 않지만 단순 양수화나 평균은 final score severity와 숨은 조건부 축을 왜곡한다.
- 문서 밖에서 확인한 증거: 원 세션 JSONL, production 9축 코드, 실제 6 goals, 실제 goal/exercise/protein-level target output, Records normalization shape, current tests, 424 + 252 transient fixtures를 확인했다.
- 검토한 대안: current baseline, naive 100-minus, Model A/B/C, multiplicative Model D, data numeric domain과 validity status 분리를 비교했다.
- 선택한 작업이 실제 문제를 푸는 이유: 양수 항목점수와 final reconciliation을 동시에 만족하면서 단일 심각 축이 평균에 묻히지 않는 유일한 실용 후보를 남긴다.
- 이 선택이 틀렸다고 볼 조건: section 14의 반증 조건 중 하나라도 production decision simulation에서 확인되는 경우다.
- 최소 변경 표면: decision doc, current truth/status/README route, docs-policy guard만 수정한다.
- 이 작업 안에서 완결한 범위: architecture feasibility, model rejection/selection, synthetic simulation, double-counting assessment, data/alcohol/joint ownership, version/Records gate를 결정했다.
- 더 넓히지 않은 이유: production formula, UI, storage/schema를 함께 바꾸면 decision 전에 사용자 기록과 score version을 변경한다.

### 읽은 기준

- 최상위 기준문서: docs/00_current_truth/00_READ_FIRST.txt
- macro current truth: docs/00_current_truth/02_macro_range_current_truth.txt
- status index: docs/00_current_truth/04_document_status_index.txt
- result-log contract: docs/00_current_truth/05_required_result_log_format.txt
- prior ownership decision: docs/v8.3.1_today_score_guidance_surface_ownership_inventory_decision_2026-07-11.md
- current score cleanup: docs/v8.3.1_today_score_card_semantic_ownership_cleanup_implementation_2026-07-11.md
- objective rubric/simulation: docs/v8.3.1_scoring_tuning_objective_rubric_decision_2026-07-09.md and docs/v8.3.1_scoring_tuning_curve_candidate_simulation_decision_2026-07-09.md
- external anchor: docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt and docs/references/external/acsm_resistance_training_guide_ko_2026.txt
- v8.2 문서 상태 확인: status index로만 확인했고 archive fixed tables를 직접 따르지 않았다.

### 판단

- 수용: goal/context-specific intake interpretation, common score meaning, six-factor multiplicative candidate, data validity separation, new scoring version requirement.
- 폐기: naive 100-minus, arithmetic mean models, hidden conditional deduction, goal fixed gram score table, exercise final bonus.
- 통합: current target/scoring alignment gap을 component candidate의 energy/protein prerequisite와 다음 gate에 통합했다.
- 보류: production formula, UI, storage/schema, Records snapshot, DailyCoach semantic v2, selectable voice.
- 금지선: current scoring version silent mutation, old Records recompute, scoreDeltaPreview revival, v8.3 tag movement.
- 내 판단 다음 단계: v8.4 candidate component-score scoring-version implementation decision.

### 검증

- first transient simulation: 424 fixtures, two-run deterministic SHA-256 `3d0bdf53960d9980d02822370d17f9a876067be5c0fadb3850bdfa8222ea044a`.
- corrected candidate simulation: 252 fixtures, two-run deterministic SHA-256 `b7f1685115e3776b12510eeffe59d6685f505badc90cffde6e452189fdb36e17`.
- temporary simulation files: deleted before documentation edit; not committed.
- production code diff: none; docs-policy, `git diff --check`, and the full 142-suite regression all passed after the routing update.
- 남은 위험: synthetic fixtures cannot prove real training-load accuracy; actual user-day samples are mandatory before production implementation.
