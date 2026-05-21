# Stitch UI Handoff - v6.9

## 기준

- 현재 앱은 `index.html` v6.9 기준입니다.
- Stitch 참조 UI는 `D:\Projects\macro-engine\_ui_refs\001.스티치`와 `D:\Projects\macro-engine\_ui_refs\002.스티치`입니다.
- v6.9의 방향은 sample2의 green / ivory shell, 조용한 건강관리 앱 톤, 모바일 우선 bento 흐름에 더 가깝습니다.

## 전달할 스크린샷 묶음

Stitch에게는 `D:\Projects\macro-engine\render_audit_v6_9\screenshots` 폴더의 canonical PNG만 전달합니다.

- Today: `01`-`12`
- Records: `13`-`19`
- 최근 흐름: `20`-`24`
- InBody: `25`-`28`
- Settings / backup restore: `29`-`33`
- Mobile 주요 흐름: `34`-`41`

## 핫픽스 후 교체된 모바일 기준 이미지

- `34_mobile_today_rich.png`: 모바일 상단 탭 5개가 모두 보이는 상태
- `35_mobile_today_record_detailed.png`: Today 상세 기록 bottom sheet가 390px 안에 들어오는 상태
- `37_mobile_records_meal_edit.png`: Records 식사 수정 모달의 닫기 버튼과 입력 영역이 잘리지 않는 상태
- `41_mobile_settings_groups_open.png`: Settings 접힘/펼침 그룹의 오른쪽 버튼과 카드가 잘리지 않는 상태

예전 문제 캡처는 handoff canonical로 쓰지 않습니다. 필요하면 로컬의 `_superseded_first_pass`에서 비교용으로만 확인합니다.

## Stitch에게 맡길 리디자인 요청

- 기능, 계산식, 저장 구조, Coach 판단 로직은 유지합니다.
- 새 `index.html` 재작성보다는 현재 구조에서 재사용 가능한 shell, modal, record flow, settings disclosure를 유지한 채 시각 완성도를 올리는 방향이 안전합니다.
- 우선순위는 모바일 긴 입력 흐름, 모달/시트의 시각 밀도, Today 결과 카드 위계, Records 상세/식사 목록의 스캔성, Settings 그룹의 정돈감입니다.
- sample2의 green / ivory 톤과 부드러운 카드 밀도는 유지하되, 현재 앱의 기능 밀도가 높으므로 단순 landing 느낌이 아니라 반복 사용 가능한 도구 화면으로 다듬어야 합니다.

## 남은 UI 관찰

- 데스크톱은 sample2 방향과 정렬되어 있으나 아직 정보량이 많고 카드 간 위계가 촘촘합니다.
- 모바일은 이번 핫픽스로 명백한 오른쪽 잘림은 제거됐지만, 긴 입력 폼의 리듬과 action grouping은 Stitch 단계에서 더 다듬을 가치가 큽니다.
- Recent 1일/3일처럼 데이터가 부족한 상태는 의도적으로 차분하지만, Stitch에게는 저데이터 상태의 빈 화면/약한 상태 표현도 함께 보여주는 편이 좋습니다.
