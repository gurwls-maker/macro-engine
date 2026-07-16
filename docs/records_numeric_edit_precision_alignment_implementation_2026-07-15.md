MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt
- docs/00_current_truth/05_required_result_log_format.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1
- source_ledger_checked: yes; source ledger를 current truth 본문으로 사용하지 않았다.
- superseded_docs_checked: yes; v8.2 fixed penalty/preview 문서는 구현 기준으로 사용하지 않았다.
- external_anchor_checked: not applicable; 영양 정책이나 점수 계수를 바꾸지 않는 Records/InBody 수정 정밀도 보정이다.

DOCUMENT ROLE
- implementation_log

## 비개발자용 설명

### 2026-07-16 독립 감사 후 정정

최초 병합본 `77c1d39`는 기록 수정 화면의 숨은 소수점 문제는 고쳤지만, 화면용 비교를 앱의 기본 snapshot 비교 함수에 넣는 바람에 점수 계산까지 영향을 줄 수 있었다. 예를 들어 체지방량이 내부적으로 `0.004kg` 다르지만 양쪽 모두 화면에는 `0.00kg`으로 보이면, Records에서는 같은 값으로 봐도 되지만 현재 TDEE를 그 과거 snapshot에 빌려 줄 근거가 되면 안 된다. 최초 병합본에서는 이 둘이 섞여 같은 식단의 TDEE 감점과 최종 점수가 달라질 수 있었다.

이번 보정은 비교 기준을 다음처럼 분리했다.

```text
Records 수정 화면의 변경 판정
-> 실제 화면에 보이는 값으로 비교

점수의 current burn 사용 자격 / 자동 snapshot 동기화 / 내부 계약
-> 숨은 소수점까지 포함한 기존 엄격 signature로 비교
```

또 목표 탄단지는 입력칸과 반올림 방식이 다르므로 임의의 `toFixed` 비교를 폐기하고 Records 화면이 실제로 쓰는 formatter 자체로 비교한다.

```text
374.95g -> 화면 375g
374.94g -> 화면 374.9g
판정: 화면이 다르므로 변경

374.95g -> 화면 375g
374.96g -> 화면 375g
판정: 화면이 같으므로 변경 없음
```

따라서 최종 상태에서는 숨은 원본 소수점 보존이라는 77의 목적은 유지하면서, 화면 동등성이 점수 권한을 바꾸는 경로는 제거됐다. 이 정정은 76에서 발견된 DailyCoach InBody 방향성 문제와 원인이 다르며 두 작업을 합치지 않는다.

### 2026-07-16 78 독립 감사 후 표시 전용 필드 보정

첫 정정 뒤에도 Records 상세에만 표시되는 두 프로필 보정값은 4자리 fallback 비교를 사용하고 있었다.

```text
프로필 목표 보정
10.4 / 10.49 -> 화면은 모두 10 kcal

주간 변화 보정
0.12314 / 0.12344 -> 화면은 모두 0.123 kg/주
```

화면에는 같은 값만 보이지만 앱이 `갱신 필요`와 `당시 기준이 다름`을 표시할 수 있었으므로, 이 두 값도 renderer와 visual comparator가 같은 formatter를 공유하도록 보정했다.

```text
10.4 vs 10.49 -> current, mismatch 없음
10.4 vs 10.51 -> 10 kcal vs 11 kcal, stale
0.12314 vs 0.12344 -> current, mismatch 없음
0.12314 vs 0.12351 -> 0.123 vs 0.124 kg/주, stale
```

두 값의 엄격 snapshot signature는 그대로 유지한다. 따라서 화면용 current/stale 판정만 실제 표시와 맞아졌고, current-burn 권한이나 저장 계약은 느슨해지지 않았다.

### 무엇을 바꿨는지

기록 수정 화면에 `11.38kg`으로 보이는 체지방량의 실제 저장값이 `11.3848kg`인 경우, 사용자가 아무것도 바꾸지 않아도 앱이 두 값을 다르다고 판단할 수 있었다. 화면은 둘째 자리까지만 보여 주면서 내부 비교는 넷째 자리까지 했기 때문이다.

이번에는 기록 수정에서 숫자를 비교하는 기준을 화면에 실제로 보이는 자리수와 맞췄다.

```text
저장값 11.3848kg -> 화면 11.38kg
화면을 건드리지 않음 -> 변경 없음, 저장값 11.3848kg 그대로 보존
화면에서 11.39kg로 수정 -> 실제 변경으로 저장
```

체지방량 한 항목에만 예외를 넣지 않았다. Records의 체중, 당시 계산 기준, 식사 탄단지와 기타 kcal, InBody 수정 화면까지 같은 원칙을 적용했다. 메모나 식사 이름처럼 다른 항목만 바꿨을 때도 손대지 않은 숫자의 원본 정밀도를 보존한다.

### 왜 바꿨는지

2026-07-14 실제 전체 백업을 읽어 보니 이 문제는 이론상 가능성에 그치지 않았다.

- Records 99개 중 `goalSnapshot.bodyFatMass` 21개가 화면 둘째 자리 뒤에 숨은 소수점을 갖고 있었다.
- InBody 6개 중 체지방량 5개가 화면 둘째 자리 뒤에 숨은 소수점을 갖고 있었다.
- 목표 칼로리는 99개 중 94개, 단백질/탄수화물/지방 목표도 각각 31/31/34개가 화면 표시 자리보다 더 긴 산식 결과를 갖고 있었다.
- 대표 실제값은 `2026-07-07: 11.3848kg -> 화면 11.38kg`이었다.

따라서 체지방량 하나만 소수점 허용치를 늘리면 체중, 식사, InBody 또는 다른 계산 기준에서 같은 문제가 다시 생길 수 있었다. 모든 숫자에 같은 오차값을 쓰는 방식도 kcal, kg, g, 시간처럼 단위와 화면 자리수가 다른 항목을 정확히 처리하지 못한다.

### 실제 사용자 화면이나 계산 결과가 어떻게 달라지는지

- 기록 상세를 열고 아무것도 바꾸지 않은 채 저장하면 `변경 없이 닫았습니다.`로 처리되며 기록과 점수가 다시 계산되지 않는다.
- 체중이나 식사 메모만 바꾸더라도 화면에서 손대지 않은 체지방량, 골격근량, 탄단지, kcal의 숨은 원본 소수점은 보존된다.
- 식사 수정 창도 보이는 값이 같으면 변경 없음으로 닫고, 탄단지는 0.1g 단위, 알코올/기타 kcal는 1kcal 단위의 실제 변경만 저장한다.
- InBody 수정은 체중/골격근량/체지방량을 둘째 자리, 체지방률을 첫째 자리로 보여 준다. 그대로 저장하면 원본을 보존하고, 보이는 한 자리만 바꾸면 수정값을 저장한다.
- `11.3848kg`과 화면에서 같은 `11.38kg` 때문에 `당시 기준이 다름`으로 표시되는 오판을 막는다. `11.39kg`처럼 화면에서도 다른 값은 계속 기준 변경으로 잡는다.

화면에 새 설정이나 설명문을 추가하지 않았다. 기존 입력창의 모양과 표시 자리수는 유지했고, InBody 수정창에서만 저장 원본의 긴 소수점 대신 해당 입력창의 정상 자리수로 정리해 보여 준다.

### 정책, 산식, 데이터 해석이 바뀌었는지

점수 정책과 영양 산식은 변경 없음이다.

다만 최초 `77c1d39`에서 산식 코드나 version을 직접 바꾸지 않았다는 이유만으로 `점수 결과 비변경`이라고 기록한 것은 부정확했다. 화면용 동등성 비교가 current burn 사용 자격에 들어가 실제 점수 결과를 바꿀 수 있었고, 이번 보정에서 그 침범을 제거했다.

- active scoring version, 8축 점수, 탄수/지방 joint allocation, adaptive target, 카드 범위는 변경하지 않았다.
- 저장된 숫자를 일괄 반올림하거나 기존 기록을 다시 계산하지 않는다.
- backup/storage schema와 저장 필드는 변경하지 않는다.
- 엄격한 snapshot signature는 backup/계약 검증용으로 그대로 유지한다.
- 사용자가 보는 `현재 기준인지`, `수정했는지` 판단만 각 입력창의 실제 표시 정밀도에 맞춘다.

즉 데이터 자체를 낮은 정밀도로 바꾼 것이 아니라, 사용자가 볼 수도 수정할 수도 없는 숨은 자릿수를 사용자 변경으로 오해하지 않게 한 것이다.

### 바꾸지 않은 범위와 보류한 내용

- 점수 formula/version/curve/anchor: 변경 없음.
- Records, InBody, full backup 데이터 구조: 변경 없음.
- 과거 기록 일괄 migration/recompute/reset: 하지 않음.
- Today 입력의 계산 정밀도와 실제 영양 계산: 변경 없음.
- 표시 자리수를 더 늘리는 UI 개편: 하지 않음. 현재 입력 단위가 사용자 수정 단위라는 기존 화면 계약을 유지한다.
- scoreDeltaPreview와 component score: 열지 않음.

### 사용자가 큰 틀에서 확인해야 할 판단점

추가 정책 판단은 필요 없다. 큰 원칙은 `화면에서 같은 값이면 변경 없음, 화면에서 한 단계 달라지면 실제 변경`이다.

실사용에서 확인할 부분은 기록 수정 화면을 열었다가 그대로 저장했을 때 더 이상 이유 없이 `기준이 다름`으로 바뀌지 않는지다. 실제 숫자를 한 표시 단위 바꾸면 여전히 정상적으로 저장돼야 한다.

### 테스트에서 무엇을 검증했는지

- 실제 백업 대표값 `11.3848 -> 11.38`을 넣고 무수정 저장이 기록 JSON을 전혀 바꾸지 않는지 확인했다.
- 체중, 키, 나이, 체지방률/량, 골격근량, 수면/업무/생활 시간, 업무/훈련 보정, 운동/유산소 시간·속도·경사도 등 기록 상세의 모든 숫자 입력을 확인했다.
- 각 입력에서 화면에 보이는 값은 원본으로 인정하고, 보이는 최소 한 단계 변경은 실제 변경으로 인식하는지 확인했다.
- Records 기본 저장, 체중·메모 수정 창, 기록 상세, 식사 수정 창에서 다른 항목만 바꿔도 숫자 원본이 유지되는지 확인했다.
- 식사 탄단지 0.1g과 알코올/기타 1kcal 변경이 정상 저장되는지 확인했다.
- InBody의 숨은 소수점 무수정 저장과 보이는 한 단계 수정, 다른 InBody 숫자의 원본 보존을 확인했다.
- InBody 기록 수정 suite를 smoke/core에도 등록해 전체 테스트를 따로 돌리지 않아도 이 데이터 보존 회귀를 잡게 했다.
- snapshot의 화면상 같은 목표 칼로리/탄단지/체성분 값은 현재 기준으로 보고, 화면상 다른 값은 변경 키로 남기는지 확인했다.
- `374.95/374.94/374.96g` 경계에서 목표 탄단지의 실제 표시와 변경 판정이 일치하는지 확인했다.
- 프로필 목표 보정 `10.4/10.49/10.51kcal`과 주간 변화 보정 `0.12314/0.12344/0.12351kg/주`가 실제 Records 표시 경계와 Today current/stale 판정에 일치하는지 확인했다.
- 화면에서 같은 `0.004kg` 차이는 Records UI에서 변경 없음이지만 엄격 snapshot 계약에서는 다름인지 확인했다.
- 그 숨은 차이가 `currentResult.totalBurn` 사용 자격, TDEE 과다 감점, 최종 점수를 바꾸지 않는지 production score 함수로 확인했다.

## 기술 검증

### 작업 결과

- 브랜치: `codex/record-edit-numeric-precision-alignment`
- 기준 HEAD: `df612df`
- 커밋: 이 문서와 구현을 포함한 change-set
- working tree: 검증과 커밋 후 clean 확인
- push / merge: 전체 회귀 검증 통과 뒤 같은 작업에서 origin/master 반영
- 독립 감사 후 보정 브랜치: `codex/records-visual-strict-equivalence-separation`
- 보정 기준 HEAD: `77c1d39`
- 보정 publish 원칙: 76 DailyCoach 보정과 합치지 않고 별도 branch push 및 재감사 후 merge

### PROMPT_SCOPE_AUDIT

- 요청된 다음 단계: Records 수정에서 체지방량이 같아 보이는데 기준이 다르다고 나오는 원인과 모든 숫자 항목의 동일 위험 확인.
- repo 기준 실제 다음 단계: 실제 저장 데이터와 모든 Records/InBody 숫자 수정 경로를 대조하고 공통 정밀도 결함을 구현과 회귀 테스트로 닫는 것.
- 실제 문제: 화면 표시 정밀도보다 훨씬 엄격한 내부 비교와 화면값 재저장 때문에 무수정 상태가 변경으로 오인되고 원본 숫자가 반올림될 수 있었다.
- 문서 밖에서 확인한 증거: 실제 2026-07-14 full backup 99 Records/6 InBody, Records 상세/직접 저장/체중 창/식사 창/InBody 편집 코드, snapshot current/stale 비교, 기존 precision test fixture.
- 검토한 대안: 모든 숨은 소수점 표시, 모든 저장값 일괄 반올림, 전 항목 공통 epsilon, 체지방량만 예외 처리, 필드별 표시 정밀도 비교와 원본 보존.
- 선택한 작업이 실제 문제를 푸는 이유: UI에서 사용자가 인식하고 수정할 수 있는 최소 단위를 변경 경계로 사용하면서 무수정 원본 데이터는 그대로 보존한다.
- 이 선택이 틀렸다고 볼 조건: 보이는 한 단계 변경을 놓치거나, 무수정/다른 필드 수정에서 원본 숫자가 바뀌거나, snapshot current/stale 판단이 실제 보이는 차이를 놓치는 경우.
- 최소 변경 표면: Records/InBody 숫자 편집 비교·저장 경로와 해당 테스트.
- 이 작업 안에서 완결한 범위: 모든 숫자 수정 필드, no-op, 다른 필드만 수정, 실제 표시 단위 수정, snapshot 표시 정밀도, 실제 backup evidence.
- 더 넓히지 않은 이유: 점수 산식, UI 구조, schema, 과거 데이터 일괄 변환은 정밀도 오판을 해결하는 데 필요하지 않다.

### 구현 규칙

```text
Records 체중: 2자리
당시 계산 기준: 화면 입력별 0~2자리
식사 탄수/단백질/지방: 1자리
식사 알코올/기타 kcal: 0자리
InBody 체중/골격근량/체지방량: 2자리
InBody 체지방률: 1자리
목표 kcal: 0자리
목표 탄수/단백질/지방: 1자리
```

`areGoalSnapshotsEquivalent`와 `getGoalSnapshotDifferenceKeys`는 4자리 signature 기반의 엄격한 계약 비교다. `doesV831SnapshotBasisOwnCurrentBurn`, 점수의 total-burn source 선택, 자동 snapshot 동기화는 이 엄격 비교만 사용한다.

`areGoalSnapshotsVisuallyEquivalent`와 `getGoalSnapshotVisualDifferenceKeys`는 Records 화면 전용이다. 목표 kcal/탄단지는 `formatRecordDetailKcal`/`formatRecordDetailGram`, 수정 입력값은 `formatInputNumber`를 직접 사용하므로 표시와 판정이 같은 quantizer를 공유한다. 필드의 표시값과 원본이 같은 경우 `preserveOriginalEditableNumber`가 원본을 반환하므로 다른 필드 저장에서도 숨은 정밀도가 손실되지 않는다. `runInBodyRecordEditTests`는 smoke/core profile에도 등록돼 있다.

표시 전용 `profileTargetDeltaKcal`도 `formatRecordDetailKcal`을 사용하고, `profileTargetRateDeltaEquivalentKgPerWeek`는 renderer와 comparator가 함께 쓰는 `formatRecordDetailWeeklyTargetRateDelta`를 사용한다. 전용 수정 입력창이 없는 값을 임의의 4자리 fallback으로 비교하지 않는다.

### 실제 백업 정적 감사

사용 파일:

```text
C:\Users\dw\OneDrive\00.린매스업엔진\00.린매스업엔진\user-data\macro-engine-full-backup-2026-07-14.json
```

확인 결과:

```text
Records: 99
InBody: 6
goalSnapshot.bodyFatMass hidden precision: 21
InBody bodyFat hidden precision: 5
goalSnapshot.targetCal hidden precision: 94
goalSnapshot.protein hidden precision: 31
goalSnapshot.carbs hidden precision: 31
goalSnapshot.fat hidden precision: 34
```

백업은 읽기만 했고 수정하지 않았다.

### 판단

- 수용: 필드별 표시 정밀도, 무수정 원본 보존, 엄격한 점수/계약 signature와 Records 화면 비교의 명시적 역할 분리.
- 폐기: 체지방량 단일 예외, 전 항목 공통 0.0001/epsilon, 무수정 저장 때 화면 반올림값으로 덮어쓰기, 과거 데이터 일괄 반올림.
- 통합: Records 직접 저장/체중 창/상세/식사 창과 InBody 편집은 하나의 숫자 수정 계약으로 통합하되, 점수의 snapshot ownership 계약과는 분리.
- 보류: 76 DailyCoach InBody 방향성 보정은 별도 브랜치와 별도 수용 조건을 유지한다.
- 금지선: 점수 산식/version, storage/schema, old-record migration, scoreDeltaPreview 변경 금지.
- 내 판단 다음 단계: 보정 브랜치 전체 회귀와 독립 재감사를 통과한 뒤에만 master merge를 판단한다.

### 검증

- 실행한 테스트:
  - `npm run test:product-policy`: 통과.
  - 집중 suite: 3 suites / 36 cases / 0 fail.
  - `npm test`: 26 suites / 309 cases / 0 fail.
  - `npm run test:core`: 74 suites / 881 cases / 0 fail.
  - `npm run test:ui`: 28 suites / 215 cases / 0 fail.
  - `npm run test:mobile`: 22 suites / 179 cases / 0 fail.
  - `npm run test:full`: 145 suites / 1,517 cases / 0 fail.
  - `npm run test:docs-policy`, `git diff --check`: 통과.
- 테스트가 확인한 동작: 무수정 no-op, 원본 정밀도 보존, 보이는 한 단계 수정, snapshot 동등성, Records/InBody 저장 분리, 기존 앱 회귀.
- 실행하지 못한 테스트와 남은 위험: 없음. 실제 사용에서 새로운 숫자 편집 surface가 추가되면 같은 field-specific precision 계약에 등록해야 한다.

#### 2026-07-16 독립 감사 보정 검증

- `runRecordDetailBodyCompositionPrecisionTests`: 1 suite / 10 cases / 0 fail.
- 정밀도·계산 기준·점수 권한 집중 검증: 4 suites / 94 cases / 0 fail.
- `npm run test:smoke`: 26 suites / 311 cases / 0 fail.
- `npm run test:macro-policy`: 32 suites / 312 cases / 0 fail.
- `npm run test:core`: 74 suites / 883 cases / 0 fail.
- `npm run test:ui`: 28 suites / 215 cases / 0 fail.
- `npm run test:mobile`: 22 suites / 179 cases / 0 fail.
- `npm run test:full`: 145 suites / 1,519 cases / 0 fail.
- `npm run test:docs-policy`, `npm run preflight:product`, `git diff --check`: 통과.
- 브라우저 콘솔 오류 / 페이지 오류: 0 / 0.
- 감사의 `79 -> 60` 동일 식사 fixture 원문은 전달되지 않아 그 두 숫자를 그대로 복제하지는 않았다. 대신 같은 원인 경로를 production 함수로 재현해 숨은 `0.004kg` 차이에서 `totalBurnSource=snapshot_basis_unavailable`, `tdeeOverloadPenalty=0`이 유지되고, 화면 동등성이 current burn 권한과 최종 점수를 바꾸지 못하도록 고정했다.

#### 2026-07-16 78 표시 전용 필드 보정 검증

- `runRecordDetailBodyCompositionPrecisionTests`: 1 suite / 11 cases / 0 fail.
- 정밀도·계산 기준·점수 권한 집중 검증: 4 suites / 95 cases / 0 fail.
- `npm test`: 26 suites / 312 cases / 0 fail.
- `npm run test:macro-policy`: 32 suites / 312 cases / 0 fail.
- `npm run test:core`: 74 suites / 884 cases / 0 fail.
- `npm run test:ui`: 28 suites / 215 cases / 0 fail.
- `npm run test:mobile`: 22 suites / 179 cases / 0 fail.
- `npm run test:full`: 145 suites / 1,520 cases / 0 fail.
- `npm run test:docs-policy`, `npm run preflight:product`, `git diff --check`: 통과.
- 브라우저 콘솔 오류 / 페이지 오류: 0 / 0.
