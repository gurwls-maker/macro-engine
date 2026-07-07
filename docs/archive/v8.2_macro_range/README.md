# v8.2 macro range archive

작성일: 2026-07-07
문서 성격: historical archive / source ledger routing

이 폴더의 `v8.2_macro_range_*.md` 문서는 최신 구현 지시서가 아니다.
macro range / scoring / nutrition / exercise 작업자는 아래 문서를 먼저 읽는다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`

## 읽는 법

- v8.2 문서는 v8.3 current truth의 근거 원장 또는 과거 gate 기록으로만 읽는다.
- fixed `high = -10`, `severe = -16` 감점표와 `candidateScorePreview = clamp(100 + fixed point sum, 0, 100)` 구조는 v8.3 production 산식이 아니다.
- `scoreDeltaPreview`는 optional audit / migration impact / debug comparison 성격으로만 남고, production 본류가 아니다.
- old fixed Records no silent mutation은 전환 중 안전장치이지, 새 점수 정책을 막는 제품 요구가 아니다.
- 최신 production scoring 기준은 `v8.3_anchor_continuous_macro_score_v1`과 `anchor_continuous_macro_score_v1`이다.

## 상태 분류 출처

각 v8.2 문서의 KEEP / SUPERSEDE / HISTORICAL / REVIEW 상태는
`docs/00_current_truth/04_document_status_index.txt`를 source of truth로 삼는다.

이 archive 안의 개별 문서를 직접 따라가야 할 때도, 먼저 status index에서 해당 문서의 상태를 확인한다.

## 현재 archive 상태

- root `docs/` 아래의 `v8.2_macro_range_*.md` 문서는 이 폴더로 이동했다.
- root `docs/`에 새 `v8.2_macro_range_*.md` 문서가 생기면 docs-policy 실패로 본다.
- archive 파일은 historical reference로 유지하되, 새 정책은 `docs/00_current_truth/`와 새 v8.3 문서에서 닫는다.
