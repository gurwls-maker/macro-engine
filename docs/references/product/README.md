# Product Reference

이 폴더는 current truth가 아니다.

최신 작업 판단은 항상 아래 문서를 먼저 따른다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`

## 역할

이 폴더는 과거 제품 방향, 사용자 의도, TDEE/source ownership, exercise mode audit처럼 앞으로도 참고 가치가 있는 문서를 보관한다.

여기 문서는 제품 맥락을 확인하기 위한 reference이며, 현재 scoring formula나 UI/storage/schema 구현 지시서가 아니다.

## 포함 문서

- `legacy_product_working_criteria_2026-06-16.txt`
  - 과거 최상위 작업 기준이다.
  - 핵심 원칙 일부는 current truth에 흡수됐다.
  - 최신 기준보다 우선하지 않는다.

- `legacy_user_intent_ledger_2026-06-16.txt`
  - 과거 사용자 의도 ledger다.
  - 최신 사용자 의도와 current truth routing이 우선이다.

- `tdee_time_ownership_design_2026-06-15.txt`
  - TDEE/source ownership reference다.
  - 운동 소모가 target/TDEE에 이미 반영된다는 사실을 확인할 때 참고한다.
  - exercise bonus 근거로 쓰지 않는다.

- `exercise_mode_code_impact_audit_2026-06-15.txt`
  - exercise top mode와 stored/effective value 분리 관련 historical audit이다.
  - 현재 구현 지시서로 직접 따르지 않는다.

## 금지

- 이 폴더 문서를 current truth보다 우선하지 않는다.
- old fixed score, old UI toggle, exercise bonus를 되살리는 근거로 쓰지 않는다.
- `v8.3_anchor_continuous_macro_score_v1` 구현을 되돌리는 근거로 쓰지 않는다.
