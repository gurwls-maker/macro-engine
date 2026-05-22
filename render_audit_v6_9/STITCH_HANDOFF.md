# Stitch UI Handoff - v6.9 / v7.0 준비

## 현재 기준

- 현재 앱은 `index.html` Version 6.9 / Stage 6.9-G 운동강도 hidden 값 hotfix 기준입니다.
- v6.9 기능 마감 구현 기준은 `512aa82 fix: v6.9 QA 러너 이식성 및 모바일 도움말 overflow 보정`입니다.
- v7.0 준비 문서 커밋은 이후 HEAD에 추가될 수 있으며, 기능 기준 변경으로 보지 않습니다.
- 기존 `v6.9` tag는 `f0fa736 v6.9 UI 정리 최종 회귀 마감`에 남아 있습니다.
- `f0fa736` 이후 커밋은 v6.9 post-tag hotfix / renderer audit / QA runner portability 보강으로 봅니다.

## Stitch 참조 자료

- `_ui_refs/001.스티치`: 초기 Stitch reference. 화면 밀도와 카드 감각 참고.
- `_ui_refs/002.스티치`: v6.9에서 더 많이 흡수한 green / ivory tone 참고.
- `_ui_refs/003.스티치`: v7.0 리디자인 진행 자료. Today 화면을 먼저 기준으로 확정하고, Records / 최근 흐름 / InBody / Settings는 그 기준에 맞춰 판단합니다.

Stitch는 기능 구현 기준이 아니라 visual shell 기준입니다.
화면 밀도, 배치 감각, 버튼 우선순위, 모바일 흐름, 색상 톤은 강하게 참고하되, 현재 앱의 산식 / 기록 신뢰성 / 데이터 책임 분리 / backup 정책 / A5.11 dual basis를 대체하지 않습니다.

## 전달할 v6.9 스크린샷 묶음

Stitch에게는 `render_audit_v6_9/screenshots` 폴더의 canonical PNG를 전달합니다.

- Today: `01`-`12`
- Records: `13`-`19`
- 최근 흐름: `20`-`24`
- InBody: `25`-`28`
- Settings / backup restore: `29`-`33`
- Mobile 주요 흐름: `34`-`41`

## 핫픽스 후 교체된 모바일 기준 이미지

- `34_mobile_today_rich.png`: 모바일 Today 핵심 카드가 viewport 안에서 시작되는 상태
- `35_mobile_today_record_detailed.png`: Today 상세 기록 bottom sheet가 390px 안에 들어오는 상태
- `37_mobile_records_meal_edit.png`: Records 식사 수정 모달의 닫기 버튼과 입력 영역이 잘리지 않는 상태
- `41_mobile_settings_groups_open.png`: Settings 접힘/펼침 그룹의 오른쪽 버튼과 카드가 잘리지 않는 상태

예전 문제 캡처는 handoff canonical로 쓰지 않습니다.
필요하면 로컬의 `_superseded_first_pass`에서 비교용으로만 확인합니다.

## v7.0 리디자인 요청 방향

1. `_ui_refs/003.스티치/01.모바일/01.오늘계산`의 Today 1/2 묶음은 v7.0 visual system의 첫 통과 기준으로 봅니다.
2. Records / 최근 흐름 / InBody / Settings도 현재 받아온 003 Stitch 모바일 시안을 v7.0 visual 방향으로 고정합니다.
3. 고정은 visual grammar 기준이며, HTML / Tailwind 코드나 Stitch 문구를 그대로 복사한다는 뜻이 아닙니다.
4. Stitch에 있는 기능이라도 현재 앱에 없는 기능은 억지로 추가하지 않습니다.
5. 현재 앱에 있는 기능은 숨기거나 작게 밀어 넣지 않습니다.
6. 기능 책임이 흔들리는 부분은 Stitch 시안보다 현재 앱 구조와 기준문서를 우선합니다.

현재 003 Stitch 경로 기준:

- Today: `_ui_refs/003.스티치/01.모바일/01.오늘계산/_1`, `_2`
- Records: `_ui_refs/003.스티치/01.모바일/02.기록/_1`, `_2`
- 최근 흐름: `_ui_refs/003.스티치/01.모바일/03.최근흐름/7`, `28`
- InBody: `_ui_refs/003.스티치/01.모바일/04.인바디/inbody_1`, `inbody_2`, `inbody_today`
- Settings: `_ui_refs/003.스티치/01.모바일/05.기본세팅/02.[01]을 짧게 요청`

Records / 최근 흐름 Stitch 산출물의 상세 판정은 `render_audit_v6_9/V7_STITCH_RECORDS_RECENT_HANDOFF.md`를 먼저 확인합니다.
이전 문서의 `_17`, `_20` 같은 번호는 과거 다운로드 / 접촉시트 기준일 수 있습니다. 현재 구현 판단은 위의 현재 로컬 경로와 2026-05-22 보정 내용을 우선합니다.

Today 통과의 의미는 그대로 복붙이 아니라 visual grammar 수용입니다.
색상, 밀도, 카드 리듬, 버튼 계층, 모바일 작업 흐름은 기준으로 삼되, 각 탭의 기능 책임에 맞게 배치가 달라질 수 있습니다.

## v7.0에서 특히 봐야 할 점

- 헤더 hero가 Coach와 같은 말을 반복하지 않는지
- 모바일에서 chip만 남긴 header가 충분히 예쁜지, desktop에서도 빈약해 보이지 않는지
- Today 운동강도 / 업무강도 slider, advanced session, REST / 휴식 intensity 0 처리 같은 v6.9-G 기능이 자연스럽게 들어가는지
- Records 식사 추가 / 수정 / 삭제, 체중·메모 수정, 당시 계산 기준 수정이 숨지 않는지
- Records 기본 화면과 식사 상세 펼침 화면에서 정보 노출량이 적절히 나뉘는지
- 최근 흐름에서 1일을 제거하고 3 / 7 / 14 / 28일별 해석만 노출하는지
- InBody 기록 보기가 Records로 이동하지 않고 InBody 탭 안에서 해결되는지
- full backup / records-only / smart restore의 차이가 흐려지지 않는지

## 남은 UI 관찰

- v6.9는 기능 보존과 화면 안정성 측면에서는 닫을 수 있지만, 최종 제품 UI로는 v7.0에서 Today 기준 화면을 다시 잡는 편이 낫습니다.
- 모바일 명백한 오른쪽 잘림은 제거됐지만, 긴 입력 폼의 리듬과 action grouping은 v7.0에서 다시 다듬을 가치가 있습니다.
- Recent 1일/3일처럼 데이터가 부족한 상태는 의도적으로 차분하지만, Stitch에게는 저데이터 상태의 빈 화면 / 약한 상태 표현도 함께 보여주는 편이 좋습니다.
