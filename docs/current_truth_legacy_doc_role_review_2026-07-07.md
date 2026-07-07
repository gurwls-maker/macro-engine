MANDATORY PRE-READ
- docs/00_current_truth/00_READ_FIRST.txt
- docs/00_current_truth/02_macro_range_current_truth.txt
- docs/00_current_truth/04_document_status_index.txt

READ RESULT
- read_before_writing: yes
- current_truth_version: 2026-07-07-v1
- source_ledger_checked: yes - docs/00_current_truth/_source/v8.3_anchor_based_continuous_macro_scoring_master_plan_2026-07-07.txt
- superseded_docs_checked: yes - v8.2 macro docs status checked through docs/00_current_truth/04_document_status_index.txt and docs/archive/v8.2_macro_range/README.md
- external_anchor_checked: yes - docs/v8_외부근거_매크로_정책표_2026-06-05.txt and docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt
- source_visibility_checked: yes - docs/v8.3_source_visibility_implementation_2026-07-07.md and docs/v8.3_source_visibility_qa_profile_hardening_2026-07-07.md

DOCUMENT ROLE
- decision
- legacy/reference role review
- docs-only consolidation precheck

FORBIDDEN WITHOUT EXPLICIT SUPERSEDING DECISION
- v8.2 fixed penalty table as production body
- stepwise score cap
- hard zero threshold as primary scoring policy
- exercise bonus
- v6.1 alcoholImpactPenalty post-score subtraction
- scoreDeltaPreview mainline
- preview field storage/UI/Recent/DailyCoach exposure

# current truth legacy doc role review

작성일: 2026-07-07
변경 성격: docs-only role review
실제 rename/move: 없음
index.html 변경: 없음
package.json 변경: 없음
tools/render_audit 변경: 없음
score formula 변경: 없음
UI/storage/schema 변경: 없음
scoreDeltaPreview 재개: 없음
old records migration/recompute/reset: 없음

## 1. 목적

v8.3 current truth, v8.2 archive routing, source visibility implementation, source visibility QA profile hardening이 닫힌 뒤에도 root `docs/`에는 예전 최상위/기준 문서들이 남아 있다.

이 문서들은 한 덩어리로 archive할 대상이 아니다. 일부는 현재 기준에 흡수됐고, 일부는 외부근거 또는 문구 reference로 계속 필요하며, 일부는 historical/report-only map으로 격하해야 한다.

이번 작업의 목적은 실제 파일 이동이나 이름 변경이 아니라, 각 문서의 현재 역할을 판정하고 다음 통폐합 결정을 잊히지 않게 gate로 남기는 것이다.

## 2. 내 판단 요약

현재 root legacy 문서들은 그대로 두면 두 가지 위험이 있다.

1. `00_현재작업기준` / `02_대화의도` 같은 이름이 여전히 최상위 기준처럼 보인다.
2. `v8_외부근거_매크로_정책표` / `v8_운동프로필...`처럼 유효한 reference와 오래된 실행 지시가 섞인 문서를 Codex가 최신 구현 지시처럼 읽을 수 있다.

하지만 지금 바로 move/rename을 하면 더 큰 위험도 있다.

1. `index.html`과 README가 아직 일부 legacy filename을 reference로 사용한다.
2. 외부근거/문구/TDEE ownership처럼 아직 current truth가 완전히 흡수하지 않은 세부 근거가 있다.
3. 이름 변경만으로는 역할이 명확해지지 않는다. 먼저 어떤 내용을 흡수, 보존, 격하, archive할지 결정해야 한다.

따라서 이번 결론은 다음이다.

```text
이번에 할 것:
- 기존 최상위/기준 문서 역할 review를 닫는다.
- current truth/status index/README에 결과를 반영한다.
- 후속 gate로 legacy reference routing/consolidation decision을 세운다.

이번에 하지 않을 것:
- 실제 파일명 변경
- 실제 폴더 이동
- root legacy 문서 대량 archive
- 산식/테스트/UI/storage/schema 구현
```

## 3. 최소로 할 것과 전체로 할 것

이번 작업에서 최소로 제한할 것:
- filesystem surface: 새 review 문서, README/current truth/status index 갱신만 허용.
- code surface: `index.html`, `package.json`, `tools/render_audit` 변경 금지.
- product surface: score formula, source visibility text, UI, storage, backup, Recent, DailyCoach 변경 금지.
- migration surface: old records 자동 재계산, 삭제, reset, migration 금지.

이번 작업에서 전체로 해야 할 것:
- README legacy 섹션의 기존 기준 문서를 모두 실제로 확인한다.
- 각 문서를 archive/keep로 뭉뚱그리지 않고 역할 단위로 분류한다.
- current truth와 충돌하는 오래된 우선순위 문구를 식별한다.
- 외부근거/문구/TDEE/운동 profile처럼 계속 필요한 근거를 버리지 않는다.
- 다음 통폐합 작업이 기억에 의존하지 않도록 REQUIRED_NEXT_GATES에 남긴다.

즉, 구현은 최소 surface로 제한하지만 문서 역할 판단은 전체로 한다.

## 4. 정적 확인

확인한 root legacy/reference 문서:

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

확인한 라우팅 상태:

```text
root docs v8.2_macro_range_*.md: 0개
docs/archive/v8.2_macro_range/v8.2_macro_range_*.md: 65개
docs/README.md: current truth routing 있음
docs/00_current_truth/04_document_status_index.txt: legacy 기준문서 메모 있음
tools/render_audit/verify_doc_policy.cjs: docs-policy guard 있음
```

코드 참조 상태:
- `index.html`은 ACSM 텍스트와 `docs/v8_외부근거_매크로_정책표_2026-06-05.txt`를 일부 reference로 언급한다.
- root legacy filename을 바로 옮기면 링크/reference가 끊길 수 있으므로 이번에는 move/rename하지 않는다.
- v8.2 macro range 문서는 root docs에 없고 archive 아래에서만 보관된다.

## 5. 상태 분류 정의

- KEEP_CURRENT_REFERENCE: 최신 작업에서도 직접 참고 가치가 있다.
- ABSORBED_INTO_CURRENT_TRUTH: 핵심 원칙은 이미 current truth에 흡수됐다. 원문은 근거/맥락으로만 읽는다.
- EXTERNAL_REFERENCE_ONLY: 외부근거 또는 해설 reference이며 구현 지시서가 아니다.
- COPY_REFERENCE_ONLY: 사용자-facing 문구 기준으로만 읽는다.
- HISTORICAL_REFERENCE: 당시 감사/실행 설계/과거 판단 기록이다. 최신 지시로 쓰지 않는다.
- REVIEW_BEFORE_MOVE: 실제 rename/move/archive 전에 흡수 범위와 참조 링크를 다시 확인해야 한다.
- CANDIDATE_ARCHIVE_AFTER_CONSOLIDATION: 현 단계에서는 이동하지 않지만, 다음 통폐합 decision에서 archive/reference 폴더 이동 후보로 본다.

## 6. 문서별 판단

### docs/00_현재작업기준_2026-06-16.txt

현재 역할:
- 과거 최상위 작업 기준.
- 사용자 의도, UI 책임, TDEE time ownership, 기록/백업/Recent, 문구 방향을 넓게 모은 기준 문서.

유지할 내용:
- 최신 사용자 의도가 문서보다 우선한다.
- 산식은 생리학적으로 설명 가능해야 한다.
- 외부근거를 사용하되 앱 정책값과 분리한다.
- 운동 여부 상위 모드.
- TDEE time ownership.
- Records/Recent에서 저장 snapshot과 Today live 계산을 섞지 않는 원칙.
- 문구는 짧고 행동 중심이어야 한다.

충돌/위험:
- 이름과 본문이 여전히 "최상위 기준"처럼 읽힌다.
- 일부 macro policy는 v8.3 continuous scoring current truth로 대체됐다.
- "안 쓰는 문서는 삭제/Git history" 식 정리 방향은 현재 archive/status-index 라우팅과 그대로 같지 않다.

판정:
- KEEP_CURRENT_REFERENCE
- ABSORBED_INTO_CURRENT_TRUTH
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 `product_current_truth` 또는 `legacy_intent_reference`로 흡수할 항목을 분리한다.
- v8.3 scoring formula 지시서처럼 직접 읽지 못하게 README와 status index에서 격하 상태를 유지한다.

### docs/02_대화의도_근거표_2026-06-16.txt

현재 역할:
- 당시 사용자 의도 ledger.
- 운동함/운동 안 함 top mode, 저장값/계산 유효값 분리, TDEE ownership, 문구/UX 의도 근거를 모은 문서.

유지할 내용:
- 최신 대화 의도가 우선이라는 제품 운영 원칙.
- exercise mode가 UI 숨김이 아니라 계산/해석 기준이라는 점.
- stored value와 effective calculation value 분리.
- TDEE time ownership.
- 앱 문구는 사용자에게 지금 할 행동을 보여줘야 한다는 방향.

충돌/위험:
- 문서 자체가 여전히 "충돌 시 이 표와 최신 대화 의도 우선"처럼 읽힌다.
- 현재는 `00_current_truth`가 라우팅 우선이며, 이 문서는 최신 기준이 아니라 intent ledger다.
- 운동일 탄수 맥락은 score bonus가 아니라 carb curve context로 재정의됐다.

판정:
- KEEP_CURRENT_REFERENCE
- ABSORBED_INTO_CURRENT_TRUTH
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 `intent_ledger` 성격으로 격하하거나 current truth에 이미 흡수된 항목을 제거하는 방향을 검토한다.

### docs/v8_외부근거_매크로_정책표_2026-06-05.txt

현재 역할:
- macro target/reference range external evidence inventory.
- ACSM/DC/Academy, ISSN protein, ISSN body composition, Helms contest prep, AMDR 등 범위 근거를 모은 문서.

유지할 내용:
- 외부근거는 범위로 읽어야 한다.
- 앱 정책값과 외부근거 자체를 분리해야 한다.
- protein/fat/carb 기준은 단일 고정값보다 맥락별 range로 해석해야 한다.
- 운동 여부와 목표에 따라 탄수/지방/단백질 해석이 달라진다는 방향.

충돌/위험:
- 문서 안의 표나 정책값을 hard cutoff 또는 fixed penalty table처럼 직접 production body로 읽을 위험이 있다.
- v8.3에서는 외부근거를 hard cutoff가 아니라 curve anchor로 쓴다.
- `index.html`이 이 문서를 reference로 언급하므로 지금 move/rename하면 참조가 끊길 수 있다.

판정:
- EXTERNAL_REFERENCE_ONLY
- KEEP_CURRENT_REFERENCE
- ABSORBED_INTO_CURRENT_TRUTH
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 `external_anchor_inventory`로 분리할지, `references/` 아래로 이동할지 결정한다.
- 이동 전 코드/문서 reference를 함께 갱신해야 한다.

### docs/v8_CC이후_TDEE_시간소유권_설계_2026-06-15.txt

현재 역할:
- TDEE time ownership / activity ownership 설계 reference.
- 운동/업무/생활활동/수면 시간의 중복 계산 방지와 source ownership을 정리한 문서.

유지할 내용:
- 운동/업무/생활활동/수면은 시간 소유권을 가져야 한다.
- 운동이 이미 target/TDEE에 반영되는 경우 finalScore bonus로 다시 더하면 안 된다.
- Today/Settings/Records 사이의 source 책임을 분리해야 한다.
- "가이드 기준 / 활동량 기준 mini toggle"은 현재 사용자-facing top mode가 아니다.

충돌/위험:
- 문서 안에는 과거 guide/activity basis, report-only, 구현 전 판단이 섞여 있다.
- 최신 source visibility와 v8.3 scoring에서는 totalBurnSource/tdeeAvailable 표시까지 추가됐으므로 현재 동작과 대조해야 한다.

판정:
- KEEP_CURRENT_REFERENCE
- HISTORICAL_REFERENCE
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- TDEE/source ownership reference로 유지하되, 다음 consolidation decision에서 obsolete toggle/report-only 단락을 archive하거나 current truth에 흡수한다.

### docs/v8_운동여부_코드영향감사_2026-06-15.txt

현재 역할:
- exercise top mode 도입 전/중 코드 영향 감사 문서.
- 운동 여부가 UI 숨김이 아니라 계산/해석 책임을 바꾼다는 점을 정리한 audit reference.

유지할 내용:
- exercise mode는 단순히 카드 숨김이 아니다.
- stored values와 effective calculation values는 분리해야 한다.
- hidden exercise data를 backup/import에서 보존해야 한다.
- 가이드/활동량 mini toggle을 다시 사용자-facing 선택지로 되살리지 않는다.

충돌/위험:
- 당시 코드 영향 감사이므로 현재 source visibility/v8.3 scoring 구현 이후의 최신 지시가 아니다.
- exercise context는 이제 final score bonus가 아니라 carb curve context다.

판정:
- KEEP_CURRENT_REFERENCE
- HISTORICAL_REFERENCE
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 exercise mode reference와 historical audit 부분을 분리한다.

### docs/v8_운동프로필_수준별산식_통합실행설계_2026-06-04.txt

현재 역할:
- 운동 프로필/수준별 산식 논의의 historical/report-only map.
- 파일 상단에서도 "현재 구현 지시서가 아니다"라고 명시한다.

유지할 내용:
- 기준문서보다 실제 앱/생리학적 타당성이 우선이다.
- report-only result를 production 승인으로 오해하면 안 된다.
- 운동 프로필과 session context는 실제 수행능력/목표/회복 맥락과 함께 봐야 한다.
- Score와 Coach는 역할을 분리해야 한다.
- 단일 문서 기계 추종이 아니라 관찰, 판단, 재검증 루프가 필요하다.

충돌/위험:
- 문서가 크고 구체적인 산식/세션 수치를 포함해 Codex가 current instruction처럼 읽을 수 있다.
- 일부 "작게 붙이고 비교" 방식은 지금 사용자가 경계한 보수적 관성으로 오해될 수 있다.
- v8.3 macro scoring의 현재 구현 지시가 아니다.

판정:
- HISTORICAL_REFERENCE
- KEEP_CURRENT_REFERENCE 일부
- CANDIDATE_ARCHIVE_AFTER_CONSOLIDATION
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 historical/report-only map으로 더 강하게 격하하거나 archive/reference 폴더 이동을 검토한다.
- 산식 구현 지시로 직접 사용하지 않는다는 warning을 routing 문서에 유지한다.

### docs/# 2026 ACSM 근력운동 가이드 한국어 해설판.txt

현재 역할:
- 2026 ACSM resistance training guideline 한국어 해설 reference.
- 앱 구현 지시서가 아니라 운동/훈련 맥락의 외부근거 해설이다.

유지할 내용:
- 건강한 성인은 주 2회 이상 주요 근육군을 충분히 힘들게 훈련한다는 기본 권장.
- 근력/근비대/파워 목적에 따라 중량, 볼륨, 속도, 가동범위가 달라진다는 해석.
- 근비대는 주간 볼륨과 충분한 노력도가 중요하다는 해석.
- 일반인에게 복잡한 프로그램보다 지속 가능한 구조가 먼저라는 관점.

충돌/위험:
- 영양 점수 산식을 직접 정하는 문서가 아니다.
- carb/exercise context에 연결할 때 source confidence와 적용 범위를 확인해야 한다.
- 운동한 날 보너스 같은 score modifier 근거로 쓰면 안 된다.

판정:
- EXTERNAL_REFERENCE_ONLY
- KEEP_CURRENT_REFERENCE
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 `external_references/` 또는 `exercise_reference/`로 분리할지 검토한다.

### docs/앱-문구-기준.txt

현재 역할:
- 사용자-facing copy/style 기준.
- scoring formula나 schema 지시서가 아니다.

유지할 내용:
- 문구는 부드럽게 쓰되 판단을 흐리지 않는다.
- 술, 고지방, 단백질 부족, 기록 부족은 숨기지 않는다.
- 사용자가 지금 할 행동을 바로 알 수 있어야 한다.
- 내부 용어는 기본 화면에 노출하지 않는다.
- score와 coach의 역할을 분리한다.
- 최근 흐름/Records/Today/Settings의 문구 책임을 분리한다.

충돌/위험:
- v8.3 내부 용어인 curve, anchor, penalty, source visibility 같은 말을 사용자 화면에 직접 보여주면 안 된다.
- 이 문서는 copy 기준이지 score formula 기준이 아니다.
- 너무 많은 과거 섹션이 누적돼 있어 다음 copy 작업 전 최신 기준과 충돌하는 표현을 다시 확인해야 한다.

판정:
- COPY_REFERENCE_ONLY
- KEEP_CURRENT_REFERENCE
- REVIEW_BEFORE_MOVE

다음 행동:
- 지금 move/rename하지 않는다.
- 다음 consolidation decision에서 copy reference로 분리하거나 current truth와 중복된 routing 문구를 정리한다.

## 7. 통합 판단

수용:
- legacy docs 중 다수는 여전히 근거/reference 가치가 있다.
- `00_현재작업기준`과 `02_대화의도`의 핵심 사용자 의도는 current truth에 이미 상당 부분 흡수됐다.
- 외부근거 문서는 버릴 것이 아니라 anchor inventory 성격으로 재분류해야 한다.
- TDEE time ownership, exercise top mode, copy tone 문서는 계속 참고 가치가 있다.

폐기:
- legacy docs를 현재 최상위 라우팅처럼 읽는 흐름.
- old filename 때문에 old policy가 자동으로 최신 정책이 되는 흐름.
- 외부근거 표를 hard cutoff 또는 fixed penalty body로 직접 쓰는 흐름.
- exercise 관련 문서를 finalScore bonus 근거로 쓰는 흐름.
- historical/report-only map을 production instruction처럼 구현하는 흐름.

통합:
- current truth에 이미 흡수된 원칙은 다음 consolidation decision에서 중복을 줄인다.
- 외부근거는 별도 anchor/reference inventory로 분리할 후보가 크다.
- copy 기준은 scoring current truth와 분리해 copy reference로 유지해야 한다.
- TDEE/source ownership은 source visibility와 연결해 별도 reference로 남길 가치가 있다.

보류:
- 실제 파일명 변경.
- 실제 폴더 이동.
- legacy docs archive 일괄 처리.
- `index.html` reference 수정.
- `verify_doc_policy.cjs` 확장.
- UI/storage/schema/scoreDeltaPreview/old records migration.

## 8. 다음 gate

이번 review는 실제 통폐합이 아니라 통폐합 전 역할 판정이다.

다음 gate는 다음 이름으로 유지한다.

```text
legacy reference routing/consolidation decision: pending before actual move/rename/archive of root legacy docs
```

그 gate에서 결정해야 할 것:
- `00_현재작업기준`과 `02_대화의도`를 current truth에 흡수한 뒤 archive할지, intent/reference ledger로 유지할지.
- `v8_외부근거_매크로_정책표`를 external anchor inventory로 분리할지.
- `# 2026 ACSM...`를 external exercise reference folder로 이동할지.
- TDEE/source ownership 문서를 current truth에 흡수할지 reference로 둘지.
- 운동 프로필 historical map을 archive로 이동할지.
- copy 기준 문서를 copy reference 폴더로 분리할지.
- move/rename 전에 `index.html`, README, docs-policy reference를 함께 갱신할지.

다음에 바로 들어가면 안 되는 것:
- score tuning implementation.
- broad UI/storage/schema.
- scoreDeltaPreview.
- old records migration/recompute/reset.
- legacy docs 대량 이동.

## 9. 결과로그 기준

이 작업 이후 결과로그에는 아래를 분리해 적는다.

```text
내 판단:
- legacy root docs role review는 닫힘.
- 실제 move/rename/archive는 아직 하지 않음.
- 다음은 legacy reference routing/consolidation decision docs-only.

최소로 제한한 것:
- docs-only.
- no code / no scoring / no UI / no storage.

전체로 판단한 것:
- 8개 legacy/root reference 문서 전체 역할 분류.
- current truth 충돌/중복/유지 가치 판정.
- 다음 통폐합 gate 등록.
```
