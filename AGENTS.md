# Repository working rules

난 한글 사용자니까 항상 한글 인코딩 안 깨지는 방법으로 작업한다.

macro range / scoring / nutrition / exercise 관련 작업 전에는 반드시 아래 문서를 먼저 읽는다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`

규칙:

- `v8.2_macro_range_*` 문서는 직접 따라가지 않는다. 먼저 `04_document_status_index.txt`에서 상태를 확인한다.
- `docs/00_current_truth/_source/` 아래 파일은 source ledger이며 current truth 본문이 아니다.
- 새 v8.3 macro/scoring/nutrition/exercise 문서는 `docs/00_current_truth/templates/new_doc_preamble.txt`의 mandatory pre-read block을 포함한다.
- 작업 결과에는 읽은 기준문서, 수용, 폐기, 통합, 보류, 금지선, 다음 단계를 적는다.
- v8.3 scoring implementation은 fixture direction table과 test design이 닫히기 전까지 시작하지 않는다.
- 운동은 final score bonus가 아니라 carb curve context로만 다룬다.
- alcohol은 kcal 축과 physiology risk 축으로 분리하되, v6.1 alcoholImpactPenalty 후처리를 되살리지 않는다.
