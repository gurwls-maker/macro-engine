MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1
- source_ledger_checked: yes - docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt
- superseded_docs_checked: yes - v8.2 macro archive routing checked through docs/archive/v8.2_macro_range/README.md and status index
- external_anchor_checked: yes - docs/v8_외부근거_매크로_정책표_2026-06-05.txt and docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt
- legacy_role_review_checked: yes - docs/current_truth_legacy_doc_role_review_2026-07-07.md
- source_visibility_checked: yes - docs/v8.3_source_visibility_implementation_2026-07-07.md and docs/v8.3_source_visibility_qa_profile_hardening_2026-07-07.md

DOCUMENT ROLE
- decision
- legacy reference routing/consolidation decision
- docs-only move/rename preparation

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview mainline
- preview field storage/UI/Recent/DailyCoach exposure

# legacy reference routing consolidation decision

작성일: 2026-07-08
변경 성격: docs-only routing/consolidation decision
실제 파일 이동: 없음
실제 rename: 없음
index.html 변경: 없음
package.json 변경: 없음
tools/render_audit 변경: 없음
score formula 변경: 없음
UI/storage/schema 변경: 없음
scoreDeltaPreview 재개: 없음
old records migration/recompute/reset: 없음

## 1. 목적

`docs/current_truth_legacy_doc_role_review_2026-07-07.md`는 root legacy/reference 문서 8개의 역할을 닫았다.

이번 문서는 그 다음 단계다. 실제 파일 이동 전, 각 문서를 어디로 라우팅할지 decision map을 닫는다.

핵심 원칙:

```text
move는 아직 하지 않는다.
routing decision은 전체로 닫는다.
```

즉, 이번 브랜치에서는 파일 이동/rename/archive를 하지 않는다. 하지만 다음 실제 routing implementation 브랜치가 바로 실행할 수 있도록 destination, link update, docs-policy guard, README 충돌 순서 처리 방향은 결정한다.

## 2. 내 독립 판단

선택한 option: Option B - reference folder 분리.

Option A(root 유지 + README 격하만 유지)는 부족하다.
- 장점은 링크가 덜 깨지는 것뿐이다.
- 하지만 root docs noise와 old filename 관성이 계속 남는다.
- 이미 `v8.2_macro_range_*`를 archive로 뺀 상태라, root에 old top-level 기준문서가 계속 남으면 "v8.2는 치웠는데 더 오래된 문서는 최신처럼 읽는" 역전 현상이 생긴다.

Option C(archive 중심 정리)는 과하다.
- 외부근거, ACSM, 앱 문구 기준, TDEE/source ownership은 앞으로도 실제 reference 가치가 있다.
- 모두 archive로 묻으면 다음 nutrition/exercise/copy 작업에서 근거를 다시 잃는다.

따라서 Option B가 맞다.
- product / external / copy / historical reference를 분리한다.
- current truth와 source ledger는 계속 `docs/00_current_truth/`에 둔다.
- v8.2 macro 원문은 계속 `docs/archive/v8.2_macro_range/`에 둔다.
- root docs는 최신 active docs와 몇몇 transition docs만 남기는 방향으로 줄인다.

## 3. 현재 reference 상태

root docs에 8개 legacy/reference 문서가 모두 존재한다.

```text
docs/00_현재작업기준_2026-06-16.txt
docs/02_대화의도_근거표_2026-06-16.txt
docs/v8_외부근거_매크로_정책표_2026-06-05.txt
docs/v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt
docs/v8_운동여부_코드영향감사_2026-06-15.txt
docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt
docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt
docs/앱-문구-기준.txt
```

v8.2 macro archive 상태:

```text
root docs v8.2_macro_range_*.md: 0
docs/archive/v8.2_macro_range/v8.2_macro_range_*.md: 65
```

직접 reference 확인:
- `index.html`은 `docs/v8_외부근거_매크로_정책표_2026-06-05.txt`를 문자열로 언급한다.
- `index.html`에는 ACSM 관련 코드/테스트 문자열이 많지만, `docs/# 2026 ACSM...` 파일 경로를 직접 가리키지는 않는다.
- `docs/README.md`는 8개 문서를 legacy/reference 목록으로 직접 언급한다.
- `docs/README.md`의 충돌 판단 순서에는 아직 `02_대화의도_근거표_2026-06-16.txt`, `00_현재작업기준_2026-06-16.txt`가 높은 순위처럼 남아 있다.
- `docs/00_current_truth/04_document_status_index.txt`는 8개 문서 상태를 직접 언급한다.
- `docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt`도 8개 문서를 source ledger 맥락에서 직접 언급한다.
- legacy docs 내부에도 상호 reference가 있다. 예: `00_현재작업기준`은 `v8_외부근거_매크로_정책표`를, `02_대화의도`는 `앱-문구-기준`을, TDEE/운동여부/운동프로필 문서는 `00/02`를 언급한다.

따라서 실제 move 브랜치는 파일 이동만 하면 안 된다. 적어도 active README/status index/current review/source ledger와 `index.html` policy note 문자열을 함께 갱신해야 한다.

## 4. destination 구조

다음 실제 move 브랜치에서 만들 reference 구조:

```text
docs/references/product/
docs/references/external/
docs/references/copy/
docs/references/historical/
```

각 폴더에는 README를 둔다.

```text
docs/references/product/README.md
docs/references/external/README.md
docs/references/copy/README.md
docs/references/historical/README.md
```

역할:
- `product`: current truth는 아니지만 제품 방향, TDEE/source ownership, exercise mode 같은 계속 참고할 제품 reference.
- `external`: 외부근거/해설 reference. implementation instruction이 아니라 anchor/source confidence 근거.
- `copy`: 사용자-facing 문구 기준.
- `historical`: 과거 report-only map, old execution design, historical audit. 최신 지시로 쓰지 않음.

## 5. decision matrix

| file | current role | recommended routing | recommended destination | current truth absorption needed? | reference link update needed? | docs-policy guard needed? | move now? | move next? | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/00_현재작업기준_2026-06-16.txt` | legacy product criteria / old top-level basis | product reference | `docs/references/product/legacy_product_working_criteria_2026-06-16.txt` | partial yes | yes | yes | no | yes | 핵심 원칙은 current truth에 흡수됐지만 TDEE, UI, Records, copy 방향 reference 가치가 있다. root에 두면 최상위 기준처럼 보인다. |
| `docs/02_대화의도_근거표_2026-06-16.txt` | legacy user intent ledger | product reference | `docs/references/product/legacy_user_intent_ledger_2026-06-16.txt` | partial yes | yes | yes | no | yes | 최신 사용자 의도 우선 원칙은 유지하되 이 파일 자체는 current truth router가 아니다. |
| `docs/v8_외부근거_매크로_정책표_2026-06-05.txt` | macro external evidence / old app policy table | external reference | `docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt` | yes, future anchor inventory | yes, includes index.html | yes | no | yes | 외부근거는 계속 필요하지만 hard cutoff/fixed policy table처럼 읽히면 위험하다. 코드 문자열 갱신이 필요하므로 이번에는 이동하지 않는다. |
| `docs/v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt` | TDEE/source ownership design reference | product reference | `docs/references/product/tdee_time_ownership_design_2026-06-15.txt` | partial yes | yes | yes | no | yes | TDEE time ownership은 현재도 핵심 reference다. 다만 old guide/activity wording은 historical로 읽어야 한다. |
| `docs/v8_운동여부_코드영향감사_2026-06-15.txt` | exercise top mode impact audit | product reference | `docs/references/product/exercise_mode_code_impact_audit_2026-06-15.txt` | partial yes | yes | yes | no | yes | exercise mode와 stored/effective separation은 유지 가치가 있다. old implementation audit으로 직접 구현 지시하면 안 된다. |
| `docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt` | historical/report-only exercise profile formula map | historical reference | `docs/references/historical/exercise_profile_formula_historical_map_2026-06-04.txt` | no, only selected guard if needed | yes | yes | no | yes | 파일 상단부터 현재 구현 지시서가 아니라고 명시한다. root에 두면 산식 지시처럼 보일 수 있다. |
| `docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt` | external exercise evidence explanation | external reference | `docs/references/external/acsm_resistance_training_guide_ko_2026.txt` | yes, future external anchor inventory | yes | yes | no | yes | 외부근거 reference로 유지하되 파일명 앞 `#`는 shell/markdown에서 불편하므로 다음 move 때 rename한다. |
| `docs/앱-문구-기준.txt` | user-facing copy guideline | copy reference | `docs/references/copy/app_copy_guidelines.txt` | no, only routing summary if needed | yes | yes | no | yes | scoring formula 기준이 아니라 copy 기준이다. copy reference로 분리해야 오독이 줄어든다. |

## 6. README 충돌 판단 순서 decision

현재 README의 충돌 판단 순서에는 `02_대화의도_근거표_2026-06-16.txt`, `00_현재작업기준_2026-06-16.txt`가 독립 순위로 남아 있다.

판단: A에 가깝게 정리한다.

결정:
- README 충돌 판단 순서에서 legacy `00/02`를 독립 상위 순위로 두지 않는다.
- 대신 current truth / status index를 먼저 둔다.
- legacy docs는 status index에서 KEEP_CURRENT_REFERENCE 또는 topic-specific reference로 확인한 뒤 읽는다.

이번 브랜치에서 할 README 수정:
- 충돌 판단 순서를 최소 수정한다.
- 실제 folder routing 설명은 다음 move implementation 브랜치에서 더 크게 정리한다.

권장 README 충돌 판단 순서:

```text
1. 최신 대화 의도
2. docs/00_current_truth/00_READ_FIRST.txt, 02_macro_range_current_truth.txt, 04_document_status_index.txt
3. 현재 git HEAD의 실제 index.html, 브라우저 화면, 테스트 결과
4. 현재 앱에서 실제로 자연스러운 동작
5. status index에서 KEEP_CURRENT_REFERENCE / EXTERNAL_REFERENCE_ONLY / COPY_REFERENCE_ONLY로 분류된 topic reference
6. historical/archive 문서
7. 오래된 구현 또는 테스트
```

## 7. docs-policy guard decision

이번 브랜치에서는 `tools/render_audit/verify_doc_policy.cjs`를 수정하지 않는다.

다음 actual routing implementation 브랜치에서 추가할 guard:
- root `docs/`에 아래 legacy 문서가 남아 있으면 실패.
  - `00_현재작업기준_2026-06-16.txt`
  - `02_대화의도_근거표_2026-06-16.txt`
  - `v8_외부근거_매크로_정책표_2026-06-05.txt`
  - `v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt`
  - `v8_운동여부_코드영향감사_2026-06-15.txt`
  - `v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt`
  - `# 2026 ACSM 근력운동 가이드 한국어 해설판.txt`
  - `앱-문구-기준.txt`
- 아래 destination file이 없으면 실패.
  - `docs/references/product/legacy_product_working_criteria_2026-06-16.txt`
  - `docs/references/product/legacy_user_intent_ledger_2026-06-16.txt`
  - `docs/references/product/tdee_time_ownership_design_2026-06-15.txt`
  - `docs/references/product/exercise_mode_code_impact_audit_2026-06-15.txt`
  - `docs/references/external/macro_external_anchor_policy_table_2026-06-05.txt`
  - `docs/references/external/acsm_resistance_training_guide_ko_2026.txt`
  - `docs/references/copy/app_copy_guidelines.txt`
  - `docs/references/historical/exercise_profile_formula_historical_map_2026-06-04.txt`
- `docs/references/product/README.md`, `docs/references/external/README.md`, `docs/references/copy/README.md`, `docs/references/historical/README.md`가 없으면 실패.
- `docs/README.md`와 `docs/00_current_truth/04_document_status_index.txt`가 새 reference 경로를 가리키지 않으면 실패.
- `index.html`이 old `docs/v8_외부근거_매크로_정책표_2026-06-05.txt` 경로를 계속 가리키면 실패.

이 guard는 실제 move와 같은 브랜치에서 열어야 한다. 먼저 guard만 추가하면 현재 root legacy 문서 때문에 즉시 실패한다.

## 8. 다음 실제 작업 범위

다음 작업 선택: A - legacy reference routing implementation.

이유:
- routing destination이 이번 matrix로 충분히 닫혔다.
- current truth consolidation을 먼저 더 늘리면 문서만 다시 늘어날 위험이 크다.
- 외부 anchor inventory와 copy reference split은 실제 folder routing을 끝낸 뒤 더 자연스럽다.

다음 브랜치에서 해야 할 것:
- `docs/references/product/`, `docs/references/external/`, `docs/references/copy/`, `docs/references/historical/` 생성.
- 8개 root legacy docs를 matrix destination으로 move/rename.
- 각 references folder README 작성.
- active README와 status index를 새 경로로 갱신.
- source ledger/current review의 old path reference를 최소 갱신하거나, old path가 historical quote임을 명확히 한다.
- `index.html`의 `docs/v8_외부근거_매크로_정책표_2026-06-05.txt` 문자열을 새 external reference path로 갱신.
- `verify_doc_policy.cjs`에 root legacy docs 재생성 방지와 destination existence guard를 추가.

다음 브랜치에서 하지 말 것:
- score formula 변경.
- app display version alignment.
- broad UI/storage/schema.
- scoreDeltaPreview.
- old records migration/recompute/reset.
- external anchor value tuning.

## 9. 이번 브랜치에서 갱신할 routing

이번 브랜치에서 갱신한다:
- `docs/00_current_truth/00_READ_FIRST.txt`
- `docs/00_current_truth/04_document_status_index.txt`
- `docs/README.md`

이번 브랜치에서 갱신하지 않는다:
- `docs/00_current_truth/02_macro_range_current_truth.txt`
- `index.html`
- `package.json`
- `tools/render_audit/verify_doc_policy.cjs`
- `tools/render_audit/run_internal_tests.cjs`

이유:
- 이번 decision은 macro scoring current truth 자체를 바꾸지 않는다.
- 실제 move/rename이 없으므로 docs-policy guard를 지금 바꾸면 안 된다.
- app header `v8.0` 표시는 app display version alignment 문제이며, legacy routing decision과 섞지 않는다.

## 10. 수용 / 폐기 / 통합 / 보류

수용:
- `ced5e38` role review는 유지한다.
- 8개 legacy docs는 전부 같은 상태가 아니다.
- Option B reference folder split이 root noise와 archive 과잉을 가장 잘 피한다.
- 실제 move 전에 routing decision을 닫는 흐름이 맞다.

폐기:
- root docs에 old top-level 기준문서를 계속 방치하는 흐름.
- 검토 없이 바로 move/rename하는 흐름.
- 외부근거/copy/TDEE reference를 archive에 묻어버리는 흐름.
- 문서 정리를 핑계로 code/scoring/UI/storage를 바꾸는 흐름.

통합:
- `00/02`는 product reference로 통합.
- 외부근거와 ACSM은 external reference로 통합.
- 앱 문구 기준은 copy reference로 통합.
- TDEE/source ownership과 exercise mode audit은 product reference로 통합.
- 운동 프로필 산식 통합설계는 historical reference로 통합.

보류:
- 실제 file move/rename.
- `index.html` reference update.
- docs-policy guard implementation.
- current truth file split/rewrite.
- score tuning implementation.
- DailyCoach/copy tone pass.
- UI/storage/schema.
- app display version alignment.

## 11. 금지선

이번 decision으로도 계속 금지:
- v8.2 fixed penalty table production body.
- high/severe fixed contribution table 부활.
- intermediate score cap.
- exercise bonus.
- v6.1 alcoholImpactPenalty post-score subtraction.
- scoreDeltaPreview mainline.
- preview field storage/UI/Recent/DailyCoach exposure.
- old fixed records hidden recompute.

## 12. 결과로그 기준

결과로그에는 다음을 남긴다.

```text
내 판단:
- 선택 option: Option B reference folder split.
- 이번 브랜치: docs-only decision.
- 실제 move/rename/archive: 아직 없음.
- 다음 본류: legacy reference routing implementation.

최소로 제한한 것:
- no index.html / no package.json / no tools/render_audit.
- no scoring / no UI / no storage / no migration.

전체로 결정한 것:
- 8개 legacy 문서별 recommended destination.
- README 충돌 판단 순서 처리 방향.
- docs-policy guard 설계.
- 다음 실제 move 브랜치 범위.
```
