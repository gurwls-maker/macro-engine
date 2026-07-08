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
classification: RESEARCH_NEEDED
recommended next action: score tuning evidence review / fixture expansion decision docs-only
can be v8.3.1?: yes, as decision/research only; implementation은 별도 gate
must not mix with: UI redesign, DailyCoach copy rewrite, storage/schema, scoreDeltaPreview
notes: v8.3 직후 바로 anchor 값을 바꾸면 release boundary가 흐려진다. WATCH 후보는 regression guard가 이미 있으므로 실제 tuning은 evidence가 필요하다.
```

### B02

```text
id: B02
item: carb upper / high-volume carb tuning
source: target/scoring alignment incident, current truth exercise/carb section
risk if ignored: 운동일 고탄수 허용이 면죄부처럼 보이거나, 반대로 훈련 맥락을 충분히 반영하지 못할 수 있다.
scope size: medium to large
classification: RESEARCH_NEEDED
recommended next action: score tuning evidence review 안에서 carb-specific fixture를 별도 축으로 둔다.
can be v8.3.1?: yes, but implementation은 아님
must not mix with: UI-only display cap, exercise bonus, fixed bucket threshold
notes: current truth는 continuous_training_load_interpolation과 curve-mediated collapse를 이미 요구한다. 지금 필요한 것은 구현 재개가 아니라 분포/evidence 확인이다.
```

### B03

```text
id: B03
item: DailyCoach/copy rewrite or tone pass
source: DailyCoach/copy tone decision, 사용자 지적의 AI스러운 문구 문제
risk if ignored: 점수 산식은 맞아도 사용자가 이유를 납득하기 어렵고, "AI가 그럴듯하게 말한다"는 인상을 줄 수 있다.
scope size: medium
classification: V8_3_1_CANDIDATE
recommended next action: v8.3.1 user-facing range explanation/copy decision docs-only
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
recommended next action: B03과 같은 decision에서 copy/tooltip boundary를 먼저 닫는다.
can be v8.3.1?: yes
must not mix with: broad UI redesign, score formula tuning
notes: glossary 구현 자체는 UX surface다. 먼저 어떤 단어를 보이고 어떤 단어는 숨길지 결정해야 한다.
```

### B05

```text
id: B05
item: kcal range display
source: post-tag deferred backlog
risk if ignored: 매크로는 range-aware인데 kcal은 단일 목표처럼 보이는 해석 차이가 남을 수 있다.
scope size: medium
classification: BLOCKED_BY_DECISION
recommended next action: separate kcal display semantics decision
can be v8.3.1?: maybe, but not first
must not mix with: macro card copy pass, score tuning implementation
notes: kcal은 target/TDEE/energy deviation 축이라 탄단지 range와 같은 방식으로 표시하면 오해가 생길 수 있다.
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
item: scoreDeltaPreview optional audit
source: v8.2 scoreDelta line, post-tag deferred backlog
risk if ignored: old fixed score와 v8.3 score 차이를 분석하는 도구가 부족할 수 있다.
scope size: medium
classification: LATER
recommended next action: optional audit decision only if migration impact analysis becomes necessary
can be v8.3.1?: no
must not mix with: production score, UI/Recent/DailyCoach display
notes: v8.3 본류는 이미 scoreDelta 없이 닫혔다. 다시 본류화하면 과거 관성 재유입이다.
```

### B09

```text
id: B09
item: old records migration / recompute / reset
source: current truth data/records section, post-tag deferred backlog
risk if ignored: dev/local old records가 화면에서 섞여 보이거나, 사용자가 새 점수와 옛 점수를 혼동할 수 있다.
scope size: large
classification: BLOCKED_BY_DECISION
recommended next action: old local records reset/migration decision only if actual confusion is reproduced
can be v8.3.1?: maybe as decision, not implementation
must not mix with: scoring tuning, scoreDeltaPreview, storage schema expansion
notes: 앱 배경상 old records는 영구 제품 요구가 아니다. 하지만 hidden recompute / silent mutation은 계속 금지한다.
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
recommended next action: no immediate implementation; B03 copy/tooltip decision에서 explanation만 검토
can be v8.3.1?: yes, as copy/explanation only
must not mix with: storage/schema redesign
notes: full backup/restore preservation은 이미 guard가 있다. 별도 contract 문서는 실제 혼란이나 버그가 나오면 연다.
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
- B03 DailyCoach/copy rewrite or tone pass
- B04 tooltip / glossary

RESEARCH_NEEDED:
- B01 score distribution tuning beyond alignment
- B02 carb upper / high-volume carb tuning
- B14 external anchor inventory split

BLOCKED_BY_DECISION:
- B05 kcal range display
- B06 alcohol range display
- B09 old records migration / recompute / reset
- B10 package version policy

LATER:
- B07 UI/storage/schema expansion
- B08 scoreDeltaPreview optional audit
- B12 Records / Recent display follow-up
- B13 docs broader rename/consolidation pass

MONITOR_ONLY:
- B11 adaptive target setting contract follow-up

REJECT:
- B15 v8.3 tag or release boundary rewrite
```

## 6. recommended next branch

추천 첫 작업:

```text
v8.3.1 user-facing range explanation/copy decision docs-only
```

이유:

```text
- v8.3 산식은 tag와 closeout까지 닫혔다.
- score tuning은 evidence/research가 더 필요하므로 첫 구현 후보로 부적절하다.
- UI/storage/schema는 너무 크다.
- scoreDelta/old records는 별도 decision 없이는 열면 안 된다.
- 사용자-facing range explanation, DailyCoach tone, tooltip/glossary boundary는 v8.3의 실제 이해 가능성과 직접 연결된다.
- copy/test가 AI스러운 문구를 고정하는 문제도 이 decision에서 다룰 수 있다.
```

권장 branch:

```text
codex/v8.3.1-user-facing-range-copy-decision
```

범위:

```text
- docs-only decision
- Today macro card, DailyCoach, tooltip/glossary, 전문용어 노출 기준을 분류
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
- score tuning 우려는 immediate implementation이 아니라 RESEARCH_NEEDED로 통합
```

보류:

```text
- 실제 v8.3.1 implementation
- score tuning implementation
- broad UI/storage/schema
- scoreDeltaPreview optional audit
- old records migration/recompute/reset
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
v8.3.1 user-facing range explanation/copy decision docs-only
```

하지 말 것:

```text
- 바로 score tuning implementation
- 바로 broad UI redesign
- 바로 storage/schema 확장
- 바로 scoreDeltaPreview 작업
- old records migration/recompute/reset
```
