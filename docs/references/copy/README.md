# Copy Reference

이 폴더는 current truth가 아니다.

최신 작업 판단은 항상 아래 문서를 먼저 따른다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`

## 역할

이 폴더는 사용자-facing 문구 기준을 보관한다.

copy reference는 사용자가 앱에서 무엇을 이해하고 행동해야 하는지 정리하는 문서이며, score formula나 schema 구현 지시서가 아니다.

## 포함 문서

- `app_copy_guidelines.txt`
  - 앱 문구 기준이다.
  - 술, 고지방, 단백질 부족, 기록 부족을 숨기지 않되 사용자에게 자연스럽게 설명하는 기준으로 읽는다.

## 금지

- copy 기준을 scoring formula 기준으로 쓰지 않는다.
- `anchor`, `curve`, `penalty`, `scoringContext`, `source visibility` 같은 내부 용어를 사용자 화면에 그대로 노출하는 근거로 쓰지 않는다.
