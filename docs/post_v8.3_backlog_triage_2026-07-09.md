MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1 plus v8.3 post-tag release state
- source_ledger_checked: yes, through current truth routing and document status index
- superseded_docs_checked: yes, v8.2 macro docs status checked through document status index and archive README
- external_anchor_checked: no new external anchor introduced; this triage changes no scoring policy

DOCUMENT ROLE
- decision
- docs-only backlog triage
- v8.3.1 planning entry map

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview production-path promotion
- preview field storage/UI/Recent/DailyCoach exposure

# post-v8.3 backlog triage

작성일: 2026-07-09
문서 성격: docs-only backlog triage / v8.3.1 planning decision
구현 변경: 없음
tag 변경: 없음
merge/push: 없음
score tuning 구현: 없음
UI/storage/schema 변경: 없음

## 1. 목적

`v8.3` release tag와 post-tag closeout은 끝났다.

현재 상태:

```text
v8.3 tag target: 0333d9c v8.3 안정화 브랜치 병합
master latest: 6a957f4 v8.3 태그 후 closeout 문서 병합
post-tag closeout: closed by docs/v8.3_post_tag_release_closeout_2026-07-09.md
```

이번 문서는 새 기능 구현이 아니다.
이번 문서는 v8.3 tag를 수정하지 않는다.
이번 문서는 v8.3 이후 남은 후보를 v8.3.1 / later / research / decision / reject / monitor로 분류한다.

핵심 원칙:

```text
minimal surface, complete backlog triage
```

뜻:

```text
- 구현 surface는 열지 않는다.
- 후보 분류는 반쪽으로 남기지 않는다.
- "나중에 보자"가 아니라 action class를 부여한다.
- score tuning, copy, tooltip, UI/storage, scoreDelta, old records를 한 브랜치에 섞지 않는다.
```

## 2. 반복 관성 체크

작업 중 확인한 관성 차단 질문:

```text
1. 지금 구현을 시작하려는가? no.
2. score tuning / UI / storage / copy를 한 브랜치에 섞는가? no.
3. v8.3 tag를 건드리는가? no.
4. backlog triage와 v8.3.1 implementation을 혼동하는가? no.
5. "나중에"만 남기고 action class를 정하지 않는가? no.
```

## 2-1. 사용자 재검토 반영 정정

`76b803e` 작성 뒤 사용자와 다시 검토하면서, 아래 항목은 단순 후속 후보가 아니라 분류 자체를 정정해야 한다고 판단했다.

```text
정정한 것:
- scoreDeltaPreview product path: REJECT
- kcal range display product UI: REJECT
- score distribution / carb upper / high-volume tuning: V8_3_1_CANDIDATE as protocol/evidence decision
- old records migration / recompute / reset: legacy/dev records cleanup/reset/fallback decision으로 재정의
- adaptive target setting contract follow-up: standalone branch가 아니라 copy/setting explanation과 QA guard에 흡수
```

이 정정의 이유:

```text
- scoreDeltaPreview는 old fixed score와 새 score를 비교하는 관성에서 온 항목이다. 현재 앱 배경에서는 제품 backlog로 유지할 이유가 없다.
- kcal range display는 탄단지 range처럼 UI에 표시하면 calorie target/TDEE 신뢰도까지 과장한다. 필요한 것은 range UI가 아니라 calorie target/source reliability audit이다.
- score tuning을 "나중에"로 미루면 감 튜닝 위험이 사라지는 게 아니다. 오히려 다음 구현 전에 fixture, 외부근거 anchor, 사용자 확인 질문, 실패 조건을 먼저 문서로 고정해야 한다.
- old records는 사용자 한 명의 실험성 local/dev 데이터에 가깝다. 보존을 제품 요구처럼 붙잡지 말고, explicit cleanup/reset/fallback decision으로 다룬다.
- `오늘 목표 자동 조정` 계약은 ON/OFF 의미, Today-only 적용, 저장/복원 영향, 과식 면제 방지 설명을 묶는 문제다. 별도 storage/schema 작업으로 키우지 않는다.
```

## 3. 분류 기준

```text
V8_3_1_CANDIDATE
- 다음 minor 버전에서 처리할 가치가 크다.
- 범위가 비교적 작고 v8.3 안정화 흐름과 직접 연결된다.
- 단, 이 문서가 곧 구현 허가라는 뜻은 아니다.

LATER
- 중요하지만 v8.3.1 첫 작업으로 묶기에는 크거나 독립성이 낮다.

RESEARCH_NEEDED
- 구현 전 외부근거, 정책값, UX 해석, 실제 화면 근거가 더 필요하다.

BLOCKED_BY_DECISION
- 별도 decision 문서가 먼저 필요하다.

REJECT
- 현재 방향과 맞지 않거나 폐기한다.

MONITOR_ONLY
- 지금 구현하지 않고 실제 사용/QA에서 재현될 때만 연다.
```

## 4. decision matrix

### B01

```text
id: B01
item: score distribution tuning beyond alignment
source: v8.3 post-tag closeout deferred / score distribution WATCH history
risk if ignored: 실제 사용에서 특정 extreme case가 너무 관대하거나 너무 가혹할 수 있다.
scope size: large
classification: V8_3_1_CANDIDATE as protocol/evidence decision
recommended next action: v8.3.1 scoring tuning protocol / fixture-evidence decision docs-only
can be v8.3.1?: yes, as decision/research only; implementation은 별도 gate
must not mix with: UI redesign, DailyCoach copy rewrite, storage/schema, scoreDeltaPreview
notes: v8.3 직후 바로 anchor 값을 바꾸면 release boundary가 흐려진다. 하지만 "나중에 보자"로 두면 감 튜닝 위험이 반복된다. 먼저 외부근거 anchor, fixture 방향, 실패 조건, 사용자 확인 질문을 고정한다.
```

### B02

```text
id: B02
item: carb upper / high-volume carb tuning
source: target/scoring alignment incident, current truth exercise/carb section
risk if ignored: 운동일 고탄수 허용이 면죄부처럼 보이거나, 반대로 훈련 맥락을 충분히 반영하지 못할 수 있다.
scope size: medium to large
classification: V8_3_1_CANDIDATE as protocol/evidence decision
recommended next action: v8.3.1 scoring tuning protocol 안에서 carb-specific fixture와 high-volume no-permission 기준을 닫는다.
can be v8.3.1?: yes, but implementation은 아님
must not mix with: UI-only display cap, exercise bonus, fixed bucket threshold
notes: current truth는 continuous_training_load_interpolation과 curve-mediated collapse를 이미 요구한다. 지금 필요한 것은 구현 재개가 아니라, 고탄수/고볼륨/반복 고탄수 케이스를 어떤 evidence와 fixture로 판단할지 먼저 닫는 것이다.
```

### B03

```text
id: B03
item: DailyCoach/copy rewrite or tone pass
source: DailyCoach/copy tone decision, 사용자 지적의 AI스러운 문구 문제
risk if ignored: 점수 산식은 맞아도 사용자가 이유를 납득하기 어렵고, "AI가 그럴듯하게 말한다"는 인상을 줄 수 있다.
scope size: medium
classification: V8_3_1_CANDIDATE
recommended next action: v8.3.1 user-facing range explanation/copy decision docs-only, after scoring tuning protocol decision
can be v8.3.1?: yes
must not mix with: score tuning, storage/schema, old records migration
notes: 기존 copy tests가 낡거나 AI스러운 문구를 고정하면 앱 문구를 test에 맞추는 대신 test expectation 갱신도 검토한다.
```

### B04

```text
id: B04
item: tooltip / glossary
source: target/scoring alignment implementation, macro card range discussion, user request about 전문용어 tooltip
risk if ignored: "오늘 목표 자동 조정", 오늘 범위, 글리코겐 같은 용어가 설명 없이 보이면 납득도가 떨어진다.
scope size: medium
classification: V8_3_1_CANDIDATE
recommended next action: B03과 같은 decision에서 copy/tooltip boundary를 닫되, scoring tuning protocol decision 이후에 연다.
can be v8.3.1?: yes
must not mix with: broad UI redesign, score formula tuning
notes: glossary 구현 자체는 UX surface다. 먼저 어떤 단어를 보이고 어떤 단어는 숨길지 결정해야 한다.
```

### B05

```text
id: B05
item: kcal range display product UI
source: post-tag deferred backlog
risk if ignored: calorie target/TDEE source의 신뢰도 문제를 range UI로 잘못 풀 수 있다.
scope size: medium
classification: REJECT
recommended next action: calorie target/source reliability audit, only as part of scoring tuning protocol if needed
can be v8.3.1?: no as product range display
must not mix with: macro card copy pass, score tuning implementation
notes: kcal은 target/TDEE/energy deviation 축이라 탄단지 range와 같은 방식으로 표시하면 오해가 생긴다. 검토할 수 있는 것은 kcal 산출 source와 reliability이지, Today card range 표시가 아니다.
```

### B06

```text
id: B06
item: alcohol range display
source: post-tag deferred backlog
risk if ignored: alcohol physiology risk는 점수에 들어가지만 사용자에게 너무 숨겨질 수 있다.
scope size: medium
classification: BLOCKED_BY_DECISION
recommended next action: alcohol user-facing risk display decision
can be v8.3.1?: maybe, but not first
must not mix with: v6.1 alcoholImpactPenalty revival, kcal range display
notes: alcohol은 "권장 범위"처럼 보이면 위험하다. range display보다 risk copy / warning semantics가 먼저다.
```

### B07

```text
id: B07
item: UI/storage/schema expansion
source: repeated separate gate
risk if ignored: 세부 explanation과 기록 근거가 부족할 수 있다.
scope size: large
classification: LATER
recommended next action: no immediate branch
can be v8.3.1?: no, unless a narrow bug forces it
must not mix with: copy pass, score tuning, scoreDeltaPreview
notes: v8.3.1 첫 작업으로 열면 scope creep 가능성이 크다.
```

### B08

```text
id: B08
item: scoreDeltaPreview product path / optional audit
source: v8.2 scoreDelta line, post-tag deferred backlog
risk if ignored: 제품상 risk는 낮다. old fixed score 비교를 계속 잡고 있으면 오히려 과거 관성이 재유입된다.
scope size: medium
classification: REJECT
recommended next action: no product backlog; one-off local forensic analysis only if explicitly requested outside app path
can be v8.3.1?: no
must not mix with: production score, UI/Recent/DailyCoach display
notes: v8.3 본류는 이미 scoreDelta 없이 닫혔다. 앱 배경상 old fixed score와 새 score 비교를 제품 기능으로 유지할 이유가 없다.
```

### B09

```text
id: B09
item: legacy/dev records cleanup / reset / fallback decision
source: current truth data/records section, post-tag deferred backlog
risk if ignored: dev/local old records가 화면에서 섞여 보이거나, 사용자가 새 점수와 옛 실험 기록을 같은 의미로 볼 수 있다.
scope size: large
classification: V8_3_1_CANDIDATE as decision-only
recommended next action: legacy/dev records cleanup/reset/fallback decision docs-only, after scoring tuning protocol and copy decision
can be v8.3.1?: yes as decision, not implementation
must not mix with: scoring tuning, scoreDeltaPreview, storage schema expansion
notes: 앱 배경상 old records는 영구 제품 요구가 아니다. 보존을 기본값으로 두지 말고 explicit reset/cleanup/fallback 기준을 정한다. 단, 사용자 명시 없이 hidden recompute / silent mutation / silent delete는 금지한다.
```

### B10

```text
id: B10
item: package version policy
source: app display version alignment and post-tag closeout
risk if ignored: 앱 header `v8.3`, git tag `v8.3`, package version `8.0.0`의 의미 차이가 낯설 수 있다.
scope size: small
classification: BLOCKED_BY_DECISION
recommended next action: package/release metadata policy decision docs-only
can be v8.3.1?: yes, but not first
must not mix with: FULL_BACKUP_VERSION, storage migration
notes: package version은 npm package semantics이고 app display/tag와 다르다. 뒤늦게 맞추는 것은 폐기했지만 정책 문서는 가능하다.
```

### B11

```text
id: B11
item: adaptive target setting contract follow-up
source: target/scoring alignment QA closeout, persistent setting surface
risk if ignored: `오늘 목표 자동 조정` ON/OFF의 제품 의미와 백업/복원 기대가 흐려질 수 있다.
scope size: small to medium
classification: MONITOR_ONLY
recommended next action: no standalone branch; B03/B04 copy/tooltip decision에서 explanation만 검토
can be v8.3.1?: yes, as copy/explanation only
must not mix with: storage/schema redesign
notes: plain meaning은 `오늘 목표 자동 조정` ON/OFF가 어디에 저장되고, Today에만 적용되며, 먹은 만큼 목표가 무한히 따라가는 면제 구조가 아니라는 약속이다. full backup/restore preservation은 이미 guard가 있으므로 별도 storage/schema 문서로 키우지 않는다.
```

### B12

```text
id: B12
item: Records / Recent display follow-up
source: post-tag deferred backlog, storage/no-leak gates
risk if ignored: range-aware score 해석이 Records/Recent에서 Today만큼 풍부하지 않을 수 있다.
scope size: large
classification: LATER
recommended next action: future Records/Recent range-aware display decision
can be v8.3.1?: no
must not mix with: old records migration, scoreDeltaPreview, storage/schema
notes: Today live surface가 먼저 안정화되어야 한다. Records/Recent는 저장 계약과 mixed basis를 건드릴 가능성이 크다.
```

### B13

```text
id: B13
item: docs broader rename/consolidation pass
source: current truth/reference routing history, user concern about too many docs and weak old names
risk if ignored: 새 작업자가 reference/current truth/source ledger를 다시 혼동할 수 있다.
scope size: medium to large
classification: LATER
recommended next action: docs naming/consolidation decision after first v8.3.1 UX/copy decision
can be v8.3.1?: maybe, but not first
must not mix with: score tuning or app implementation
notes: reference routing과 docs-policy가 이미 1차 guard를 제공한다. 이름 정리는 가치가 있지만 v8.3.1 첫 기능 후보보다 우선하지 않는다.
```

### B14

```text
id: B14
item: external anchor inventory split
source: current truth optional gates
risk if ignored: 외부근거 anchor가 current truth 본문에 짧게만 남아 있어, score tuning 때 근거 확인이 느려질 수 있다.
scope size: medium
classification: RESEARCH_NEEDED
recommended next action: open before score tuning implementation, not before copy/tooltip decision
can be v8.3.1?: yes, as research/support doc
must not mix with: direct anchor value changes
notes: score tuning을 실제로 열기 전에는 useful. 단, 지금 첫 작업으로 열면 사용자-facing 문제보다 문서 정리에 치우칠 수 있다.
```

### B15

```text
id: B15
item: v8.3 tag or release boundary rewrite
source: post-tag closeout
risk if ignored: none; current state is correct.
scope size: dangerous
classification: REJECT
recommended next action: no action
can be v8.3.1?: no
must not mix with: any backlog task
notes: `v8.3` tag target is intentionally 0333d9c. post-tag docs commits stay after release boundary.
```

## 5. classification summary

```text
V8_3_1_CANDIDATE:
- B01 score distribution tuning beyond alignment, as protocol/evidence decision
- B02 carb upper / high-volume carb tuning, as protocol/evidence decision
- B03 DailyCoach/copy rewrite or tone pass
- B04 tooltip / glossary
- B09 legacy/dev records cleanup / reset / fallback decision, decision-only

RESEARCH_NEEDED:
- B14 external anchor inventory split

BLOCKED_BY_DECISION:
- B06 alcohol range display
- B10 package version policy

LATER:
- B07 UI/storage/schema expansion
- B12 Records / Recent display follow-up
- B13 docs broader rename/consolidation pass

MONITOR_ONLY:
- B11 adaptive target setting contract follow-up, absorbed into copy/setting explanation

REJECT:
- B05 kcal range display product UI
- B08 scoreDeltaPreview product path
- B15 v8.3 tag or release boundary rewrite
```

## 6. recommended next branch

추천 첫 작업:

```text
v8.3.1 scoring tuning protocol decision docs-only
```

이유:

```text
- v8.3 산식은 tag와 closeout까지 닫혔지만, 점수 분포와 고탄수/고볼륨 튜닝을 "나중에"로만 미루면 감 튜닝 위험이 남는다.
- 다음 작업은 숫자 변경이 아니라 tuning protocol이다. 외부근거 anchor, fixture 방향, 사용자 확인 질문, 실패 조건, implementation 금지선을 먼저 닫는다.
- kcal range display product UI와 scoreDeltaPreview product path는 폐기했으므로 다음 후보에서 제외한다.
- old records는 보존/마이그레이션이 아니라 legacy/dev cleanup/reset/fallback decision으로 재정의한다.
- 사용자-facing range explanation/copy decision은 여전히 중요하지만, 점수 튜닝 기준이 먼저 닫혀야 copy가 산식 의미를 따라갈 수 있다.
```

권장 branch:

```text
codex/v8.3.1-scoring-tuning-protocol-decision
```

범위:

```text
- docs-only decision
- score distribution / carb upper / high-volume carb tuning을 바로 구현하지 않고 protocol과 evidence gate로 분류
- 외부근거 anchor 사용 방식, fixture direction, 실패 조건, 사용자 확인 질문을 정의
- score formula 변경 없음
- UI implementation 없음
- storage/schema 변경 없음
```

첫 작업에서 하지 말 것:

```text
- 바로 copy implementation
- 바로 tooltip implementation
- score tuning implementation
- kcal/alcohol range display implementation
- old records migration
- scoreDeltaPreview
```

## 7. 수용 / 폐기 / 통합 / 보류

수용:

```text
- v8.3 release/tag/post-tag closeout 완료 상태 유지
- post-v8.3 backlog를 구현 전 분류
- v8.3.1 후보와 later/research/decision 후보 분리
- 사용자-facing 설명/문구 문제를 첫 v8.3.1 decision 후보로 승격
```

폐기:

```text
- backlog triage 없이 바로 구현
- score tuning / copy / UI / storage를 한 브랜치에 섞기
- v8.3 tag 재작업
- package/FULL_BACKUP_VERSION을 뒤늦게 맞추기
```

통합:

```text
- post-tag closeout deferred list를 actionable matrix로 통합
- 사용자 대화의 AI스러운 문구/전문용어 tooltip 우려를 B03/B04로 통합
- score tuning 우려는 immediate implementation이 아니라 v8.3.1 protocol/evidence decision으로 통합
- old records 우려는 preservation/migration이 아니라 legacy/dev cleanup/reset/fallback decision으로 통합
```

보류:

```text
- 실제 v8.3.1 implementation
- score tuning implementation
- broad UI/storage/schema
- user-facing copy/glossary implementation
- legacy/dev records cleanup/reset/fallback implementation
- docs broader rename/consolidation implementation
```

금지선:

```text
- v8.3 tag 재생성/이동 금지
- v8.2 fixed penalty table production body 부활 금지
- stepwise score cap 부활 금지
- exercise bonus 금지
- v6.1 alcoholImpactPenalty post-score subtraction 부활 금지
- scoreDeltaPreview mainline 재개 금지
- old records hidden recompute / silent mutation 금지
```

## 8. 다음 단계

내 판단 다음 단계:

```text
v8.3.1 scoring tuning protocol decision docs-only
```

하지 말 것:

```text
- 바로 score tuning implementation
- 바로 broad UI redesign
- 바로 storage/schema 확장
- 바로 scoreDeltaPreview 작업
- old records migration/recompute/reset
```
