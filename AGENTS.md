# Repository working rules

난 한글 사용자니까 항상 한글 인코딩 안 깨지는 방법으로 작업한다.

macro range / scoring / nutrition / exercise 관련 작업 전에는 반드시 아래 문서를 먼저 읽는다.

1. `docs/00_current_truth/00_READ_FIRST.txt`
2. `docs/00_current_truth/02_macro_range_current_truth.txt`
3. `docs/00_current_truth/04_document_status_index.txt`
4. `docs/00_current_truth/05_required_result_log_format.txt`

규칙:

- `v8.2_macro_range_*` 문서는 직접 따라가지 않는다. 원문은 `docs/archive/v8.2_macro_range/`의 historical archive이며, 먼저 `04_document_status_index.txt`에서 상태를 확인한다.
- `docs/00_current_truth/_source/` 아래 파일은 source ledger이며 current truth 본문이 아니다.
- 새 v8.3 macro/scoring/nutrition/exercise 문서는 `docs/00_current_truth/templates/new_doc_preamble.txt`의 mandatory pre-read block을 포함한다.
- 작업 결과에는 읽은 기준문서, 수용, 폐기, 통합, 보류, 금지선, 다음 단계를 적는다.
- 모든 실질적 작업의 저장 결과로그와 최종 사용자 보고는 `docs/00_current_truth/05_required_result_log_format.txt`를 따른다.
- mandatory pre-read 같은 기계 확인용 머리말이 필요하면 그 블록만 먼저 둘 수 있고, 첫 본문은 반드시 `비개발자용 설명`으로 시작한다.
- 비개발자용 설명에는 무엇을 바꿨는지, 왜 바꿨는지, 실제 화면이나 계산 결과가 어떻게 달라지는지, 정책/산식/데이터 해석 변경 여부, 바꾸지 않은 범위와 보류, 사용자가 큰 틀에서 확인할 판단점, 테스트가 검증한 동작을 평문으로 적는다.
- 코드명과 함수명만 나열하지 않는다. 정책이나 계산 구조가 바뀌었거나 판단에 중요하면 실제 숫자 예시를 들어 설명하고, 바뀌지 않았으면 `변경 없음`이라고 명시한다.
- 개발자용 파일/함수/커밋/테스트 세부사항은 비개발자용 설명 아래의 별도 기술 검증 섹션에 둔다.
- 단순 상태 확인, 명령 출력, 무변경 점검은 축약할 수 있지만 사용자 영향과 검증 결과를 먼저 말하는 순서는 유지한다.
- v8.3 scoring implementation은 현재 `v8.3_anchor_continuous_macro_score_v1`로 구현된 상태이며, 후속 scoring 작업은 REQUIRED_NEXT_GATES와 docs-policy를 확인한 뒤 진행한다.
- UI/storage/schema/scoreDeltaPreview/old records migration은 별도 gate 없이는 열지 않는다.
- 운동은 final score bonus가 아니라 carb curve context로만 다룬다.
- alcohol은 kcal 축과 physiology risk 축으로 분리하되, v6.1 alcoholImpactPenalty 후처리를 되살리지 않는다.
- Before macro/scoring/nutrition/exercise/docs-policy/release tasks, run a one-minute PROMPT_SCOPE_AUDIT.
- Do not assume the prompt is the correct next step; compare the request with current truth and git state.
- Do not assume a documented next gate is correct merely because it is documented; treat next-gate text as a hypothesis.
- PROMPT_SCOPE_AUDIT must state the root problem in plain language, evidence checked outside next-gate text, alternatives considered, why the chosen action solves the root problem, and what would prove the choice wrong.
- For product/math/UI issues, inspect relevant code paths, screen behavior, data shape, or fixture logic before accepting docs-only or copy-only work.
- Separate minimal surface from complete scope before editing.
- Do not let this routine create recursive meta-work; Most audits belong in the result log, not in new documents.
- Do not turn already-reviewed docs-only/readiness/copy merge-publish into a large standalone task; do the short publish checkpoint, then continue to the next substantive task if one actually exists.
- Conversely, do not invent a next implementation merely because publish completed; confirm there is a real issue/current gate.
- 프롬프트를 그대로 수행하기 전에 현재 repo 기준으로 다음 단계가 맞는지 재판단한다.
- 처음에만 수용하는 척하고 결국 관성대로 움직이는 것을 금지한다.
- 이 루틴 자체가 새 관성이 되면 안 된다.
