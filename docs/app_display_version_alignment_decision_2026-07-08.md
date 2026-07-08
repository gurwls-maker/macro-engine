MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1
- source_ledger_checked: not changed - this decision does not change scoring formula, anchors, or source ledger content
- superseded_docs_checked: yes - v8.2 macro docs status checked through docs/00_current_truth/04_document_status_index.txt and docs/archive/v8.2_macro_range/README.md
- external_anchor_checked: not changed - this decision does not change external anchor policy
- scoring_implementation_checked: yes - docs/v8.3_continuous_scoring_implementation_2026-07-07.md
- source_visibility_checked: yes - docs/v8.3_source_visibility_implementation_2026-07-07.md
- legacy_reference_routing_checked: yes - docs/legacy_reference_routing_consolidation_decision_2026-07-08.md and docs/references/*/README.md

DOCUMENT ROLE
- decision
- app display version alignment decision
- docs-only implementation preparation

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview mainline
- preview field storage/UI/Recent/DailyCoach exposure

# app display version alignment decision

작성일: 2026-07-08
변경 성격: docs-only app display version alignment decision
구현 변경: 없음
title/header/STAGE/NOTE 수정: 없음
package version 변경: 없음
backup appVersion 변경: 없음
scoring formula 변경: 없음
ADHERENCE_SCORING_VERSION 변경: 없음
MACRO_RANGE_PRODUCTION_SCORING_VERSION 변경: 없음
FULL_BACKUP_VERSION 변경: 없음
UI/storage/schema 변경: 없음
scoreDeltaPreview 재개: 없음
old records migration/recompute/reset: 없음

## 1. 목적

현재 production scoring identity는 이미 v8.3이다.

```text
MACRO_RANGE_PRODUCTION_SCORING_VERSION = "v8.3_anchor_continuous_macro_score_v1"
ADHERENCE_SCORING_VERSION = MACRO_RANGE_PRODUCTION_SCORING_VERSION
```

하지만 사용자가 앱 상단과 브라우저 title에서 보는 app display label은 아직 `v8.0`이다.

이번 문서는 이 불일치를 scoring 구현 누락으로 오해하지 않고, app display/header/backup metadata/package version/historical stage label을 어떻게 정렬할지 결정한다.

이번 작업은 decision이다. 실제 `index.html`, `package.json`, backup test, title/header text 수정은 다음 implementation 브랜치에서만 한다.

## 2. 현재 상태 정적 분석

확인한 현재 상태:

```text
scoring formula version:
- MACRO_RANGE_PRODUCTION_SCORING_VERSION = v8.3_anchor_continuous_macro_score_v1
- ADHERENCE_SCORING_VERSION = MACRO_RANGE_PRODUCTION_SCORING_VERSION

app display/header version:
- index.html title = 탄단지 다이어리 v8.0
- header .app-version = v8.0
- getCurrentAppVersionLabel fallback = v8.0

package/test runner version:
- package.json version = 8.0.0

backup metadata:
- FULL_BACKUP_VERSION = 1
- full backup payload appVersion = getCurrentAppVersionLabel()

historical stage/comment labels:
- top comment Stage: v8.0 final
- top comment Current basis: v8.0 time-ownership TDEE production path + exercise-management macro policy
- old v8.0 scenario/test stage constants remain throughout historical tests
```

정적 count:

```text
document title v8.0 assertions: 12
app-version v8.0 assertions: 14
getCurrentAppVersionLabel v8.0 assertions: 9
payload.appVersion v8.0 assertions: 4
Stage: v8.0 final string mentions: 2
Current basis v8.0 mentions: 1
literal v8.0 in index.html: 384
literal v8.3 in index.html: 38
appVersion assignments: 6
FULL_BACKUP_VERSION mentions: 9
```

판단:
- 이 작업은 header 한 줄 수정이 아니다.
- title/header/fallback/backup expectation/display tests/top comment가 함께 연결돼 있다.
- old v8.0 scenario constants와 historical tests까지 전부 바꾸면 과거 evidence가 깨진다.
- package version까지 올리면 package ecosystem policy까지 같이 열게 된다.

## 3. version 종류 분리

이번 decision은 아래 5종을 분리한다.

### 3.1 scoring formula version

대상:
- `ADHERENCE_SCORING_VERSION`
- `MACRO_RANGE_PRODUCTION_SCORING_VERSION`
- scoring detail/version metadata

현재:
- `v8.3_anchor_continuous_macro_score_v1`

결정:
- 변경하지 않는다.
- app display alignment는 scoring formula 변경이 아니다.

### 3.2 app display/header version

대상:
- `document.title`
- header `.app-version`
- `getCurrentAppVersionLabel()` fallback
- display version tests

현재:
- `v8.0`

결정:
- 다음 implementation에서 `v8.3`으로 정렬한다.

### 3.3 package/test runner version

대상:
- `package.json` `version`
- npm script ecosystem

현재:
- `8.0.0`

결정:
- 이번 alignment에서는 변경하지 않는다.
- 이 repo에서 package version이 product display version과 항상 같아야 한다는 policy가 아직 없다.
- 필요하면 별도 package version policy decision에서 다룬다.

### 3.4 backup metadata appVersion

대상:
- full backup payload `appVersion`
- backup appVersion expectation tests

현재:
- `getCurrentAppVersionLabel()` 기반이므로 display label과 연결됨.

결정:
- 다음 implementation에서 app display label과 함께 `v8.3`으로 정렬한다.
- `FULL_BACKUP_VERSION`은 schema version이므로 `1`로 유지한다.
- import compatibility는 `appVersion`이 아니라 `backupVersion`, `kind`, `app`, `data` 구조로 판단하므로 old `v8.0` backup을 거부하지 않는다.

### 3.5 historical stage/comment labels

대상:
- file top comment `Stage`
- file top comment `Current basis`
- release note
- old scenario runner constants and historical test names

결정:
- top comment `Stage`, `Current basis`, release note는 현재 상태에 맞게 갱신한다.
- old v8.0 scenario runner constants와 historical test names는 historical metadata로 유지한다.

## 4. option decision

선택한 option: Option B - app display/header + backup appVersion까지 `v8.3`으로 정렬.

### Option A를 선택하지 않는 이유

App display/header만 바꾸고 backup `appVersion`을 `v8.0`으로 남기면 사용자가 export 파일을 봤을 때 또 다른 불일치가 생긴다.

현재 backup appVersion은 이미 `getCurrentAppVersionLabel()` 기반이다. 즉 코드 구조상 app display label과 backup metadata는 같은 display identity를 공유한다.

따라서 title/header/fallback을 `v8.3`으로 바꾸는 implementation은 backup appVersion expectation도 함께 갱신하는 게 맞다.

### Option C를 선택하지 않는 이유

`package.json` version을 `8.3.0`으로 올리는 것은 package ecosystem policy까지 여는 일이다.

현재 package version은 npm script/test runner package metadata이며, product display label과 같은 contract라고 닫힌 적이 없다.

따라서 이번 implementation에서는 package version을 유지한다.

### Option D를 선택하지 않는 이유

Display `v8.0`을 계속 유지하고 문서로만 설명하면 사용자는 계속 "v8.3 scoring이 구현됐는데 앱은 왜 v8.0인가"라고 헷갈린다.

이미 current truth에서 app display version alignment가 pending으로 노출됐으므로, 이 불일치를 계속 보류할 이유가 약하다.

## 5. app display label decision

선택 label: `v8.3`

이유:
- 사용자 표시 버전은 짧아야 한다.
- `v8.3_anchor_continuous_macro_score_v1`은 내부 scoring version이며 header에 노출할 이름이 아니다.
- `v8.3 scoring`처럼 mixed label을 쓰면 앱 전체 버전인지 score version인지 다시 헷갈린다.
- `v8.3.0`은 package version과 더 강하게 연결돼 보이므로 이번 범위에서는 피한다.

## 6. next implementation scope

다음 implementation 브랜치에서 허용:

```text
- index.html top comment Stage
- index.html top comment Current basis
- top release note / state note
- document title
- header .app-version
- getCurrentAppVersionLabel fallback
- display version tests
- full backup appVersion expectation tests
- current truth / README / status index update
```

다음 implementation 브랜치에서 금지:

```text
- scoring formula 변경
- ADHERENCE_SCORING_VERSION 변경
- MACRO_RANGE_PRODUCTION_SCORING_VERSION 변경
- FULL_BACKUP_VERSION schema number 변경
- backup import compatibility 변경
- package.json version 변경
- UI redesign
- storage/schema 변경
- scoreDeltaPreview 재개
- old records migration/recompute/reset
```

## 7. Stage / Current basis / release note decision

다음 implementation에서 top comment는 현재 상태를 반영해야 한다.

권장 방향:

```text
Stage:
- v8.3 display alignment / range-aware scoring production state를 표현한다.

Current basis:
- v8.3 anchor continuous scoring
- v8.0 time-ownership TDEE production path inherited/retained
- exercise-management macro policy retained

release note:
- v8.3 scoring implementation
- source visibility
- legacy reference routing
- app display version alignment
를 짧게 요약한다.
```

주의:
- old v8.0 scenario runner constants와 historical test labels는 일괄 rewrite하지 않는다.
- "v8.0" literal 전체를 global replace하지 않는다.

## 8. backup compatibility decision

결정:
- full backup `appVersion`은 display metadata다.
- 다음 implementation에서 `v8.3`으로 정렬한다.
- `FULL_BACKUP_VERSION = 1`은 유지한다.
- old backup `appVersion: "v8.0"`은 import 거부 사유가 아니다.
- tests는 appVersion expectation만 갱신하고 schema validation은 유지한다.

근거:
- `appVersion`은 사용자가 export 시점의 앱 표시 버전을 식별하기 위한 metadata다.
- `FULL_BACKUP_VERSION`은 backup schema compatibility를 나타낸다.
- app display label 변경이 backup schema migration을 의미하지 않는다.

## 9. docs-policy / test guard decision

이번 decision에서는 `tools/render_audit/verify_doc_policy.cjs`를 수정하지 않는다.

다음 implementation에서 우선해야 할 guard는 existing app internal tests다.

다음 implementation에서 검토할 docs-policy 후보:
- README/status index에 app display alignment implementation 문서가 등록되어야 함.
- package.json version을 선택하지 않았다면 계속 `8.0.0`이어야 함.
- root legacy docs/routed reference guard는 계속 유지.

다만 title/header/fallback/backup appVersion은 이미 `index.html` internal tests가 직접 검증하므로, docs-policy에 UI display assertion을 중복으로 넣는 것은 필수는 아니다.

## 10. current truth update

이번 decision 이후 상태:

```text
app display version alignment decision: closed
app display version alignment implementation: pending
```

다음 implementation 전까지 바뀌지 않은 것:
- `index.html` title/header/fallback
- top comment Stage/Current basis
- full backup appVersion output
- package.json version
- scoring formula version

## 11. 수용 / 폐기 / 통합 / 보류

수용:
- v8.3 scoring implementation은 완료된 상태다.
- app display/header version `v8.0`은 scoring 구현 누락이 아니라 별도 display alignment 대상이다.
- backup `appVersion`은 display metadata이므로 header/fallback과 함께 정렬한다.
- package version은 이번 alignment에서 열지 않는다.

폐기:
- scoring version과 app display version을 같은 것으로 취급하는 흐름.
- `v8.0` literal 전체를 global replace하는 흐름.
- package version까지 근거 없이 일괄 변경하는 흐름.
- `FULL_BACKUP_VERSION`을 app display label처럼 변경하는 흐름.
- app display alignment에 scoring/UI/storage/schema 변경을 섞는 흐름.

통합:
- title/header/fallback/display tests를 app display label `v8.3`으로 통합.
- backup appVersion expectation을 display label `v8.3`으로 통합.
- top comment Stage/Current basis/release note를 현재 state summary로 통합.

보류:
- 실제 app display version implementation.
- package version update.
- package version policy decision.
- score tuning implementation.
- DailyCoach/copy tone pass.
- UI/storage/schema.
- scoreDeltaPreview.
- old records migration/recompute/reset.

## 12. 금지선

이번 decision으로도 계속 금지:
- scoring formula 변경.
- `ADHERENCE_SCORING_VERSION` 변경.
- `MACRO_RANGE_PRODUCTION_SCORING_VERSION` 변경.
- `FULL_BACKUP_VERSION` 변경.
- backup import compatibility 변경.
- `package.json` version 변경.
- broad UI/storage/schema 변경.
- scoreDeltaPreview 재개.
- old records migration/recompute/reset.

## 13. 다음 단계

추천 다음 작업:

```text
app display version alignment implementation
```

다음 implementation에서 할 것:
- selected label `v8.3` 적용.
- title/header/fallback/top comment/release note 정렬.
- full backup appVersion expectation tests 정렬.
- current truth/README/status index를 implementation complete로 갱신.
- package.json, scoring formula, FULL_BACKUP_VERSION은 유지.

하지 말 것:
- score tuning implementation.
- package version update.
- UI/storage/schema expansion.
- scoreDeltaPreview.
- old records migration/recompute/reset.
