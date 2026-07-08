# External Reference

이 폴더는 current truth가 아니다.

최신 작업 판단은 항상 아래 문서를 먼저 따른다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`

## 역할

이 폴더는 macro, nutrition, exercise 관련 외부근거와 해설 문서를 보관한다.

외부근거는 v8.3에서 hard cutoff나 fixed penalty table이 아니라 curve anchor와 source confidence를 위한 reference로만 사용한다.

## 포함 문서

- `macro_external_anchor_policy_table_2026-06-05.txt`
  - macro range 외부근거와 과거 앱 정책표다.
  - fixed penalty body나 hard cutoff로 직접 사용하지 않는다.

- `acsm_resistance_training_guide_ko_2026.txt`
  - ACSM 근력운동 가이드 한국어 해설 reference다.
  - 영양 점수 산식 지시서가 아니다.

## 금지

- 외부근거 표를 `high = -10`, `severe = -16` 같은 고정 감점표로 되살리지 않는다.
- 운동 관련 외부근거를 final score bonus 근거로 쓰지 않는다.
- 알코올, 탄수, 지방, 단백질 기준을 단일 hard cutoff로 축소하지 않는다.
