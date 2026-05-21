# Stitch Mobile Upload Guide

이 폴더는 Stitch에 직접 올리기 위한 모바일 전용 화면 조각입니다.

- 기준 viewport: 390 x 900
- 상태 수: 41
- 이미지 수: 167
- 모든 이미지는 `images/` 안에 번호 prefix로 정렬되어 있습니다.
- `DESIGN.md`는 Stitch의 `기존 DESIGN.md 붙여넣기` 칸에 그대로 넣기 위한 문서입니다.

## 20장 첨부 제한이 걸릴 때

Stitch가 파일을 최대 20장까지만 받으면 `images/`의 원본 PNG 167장을 올리지 말고 `contact_sheets/images/` 안의 JPG 17장만 올립니다. 각 JPG는 여러 모바일 화면을 390px 원본 폭 그대로 묶은 컨택트 시트입니다.

## Stitch 입력칸별 처리

- 기존 DESIGN.md 붙여넣기: 이 폴더의 `DESIGN.md` 내용을 그대로 붙여 넣습니다.
- 파일 드래그 앤 드롭: `images/` 안의 PNG를 아래 권장 묶음대로 올립니다.
- 코드/이미지/글꼴/로고 업로드: 지금은 별도 코드나 폰트, 로고 파일보다 캡처 이미지가 더 중요합니다. 로고는 아직 고정하지 않는 편이 안전합니다.
- .fig 파일 업로드: 현재 Figma 원본이 없으므로 비워둡니다. Stitch 결과를 Figma로 보낼 수 있으면 그때 초안으로 사용합니다.
- 공개 GitHub 저장소: 저장소가 공개 접근 가능하면 `https://github.com/gurwls-maker/macro-engine`를 넣습니다. 단, 이 링크는 보조 참고이고 실제 디자인 기준은 DESIGN.md와 이미지입니다.
- 웹사이트 추가: 배포된 HTTPS URL이 생기면 넣습니다. 로컬 HTML 경로나 `file://` 주소는 Stitch가 읽기 어렵습니다.

## 권장 업로드 방식

한 번에 전부 넣기보다 흐름 단위로 나눠 넣는 편이 좋습니다.

1. Today 기본/입력/기록 시작: `001`-`012`, `034`-`035`
2. Records 기록/상세/수정/식사 모달: `013`-`019`, `036`-`037`
3. 최근 흐름 범위별 화면: `020`-`024`, `038`
4. InBody 입력/수정/Records 연결: `025`-`028`, `039`
5. Settings/backup/restore: `029`-`033`, `040`-`041`

## Stitch 추가 안내 칸에 넣을 문장

```text
첨부 이미지는 같은 모바일 앱의 서로 다른 상태와 트리거 화면입니다. 한 장만 기준으로 삼지 말고 공통 컴포넌트 규칙, 탭 구조, 입력 모달, 결과 카드, 코치 문구 영역이 전체 화면에서 일관되도록 리디자인해주세요. 기능과 정보 구조는 유지하고, 시각 디자인과 모바일 레이아웃 완성도를 높여주세요.
```

## 상태 인덱스

- 001 01_today_empty_top: 4 images, page, action=none
- 002 02_today_empty_lower: 4 images, page, action=scrollMid
- 003 03_today_rich_stale: 5 images, page, action=none
- 004 04_today_quick_open: 8 images, page, action=quickOpen
- 005 05_today_record_start_modal: 1 images, modal, action=todayRecordModal
- 006 06_today_record_detailed_modal: 3 images, modal, action=todayRecordDetailed
- 007 07_today_record_simple_modal: 1 images, modal, action=todayRecordSimple
- 008 08_today_record_skip_modal: 1 images, modal, action=todayRecordSkip
- 009 09_today_record_alcohol_open: 4 images, modal, action=todayRecordAlcoholOpen
- 010 10_today_meal_reuse_modal: 3 images, modal, action=todayMealReuseModal
- 011 11_today_inbody_select_modal: 1 images, modal, action=todayInbodyRecordSelect
- 012 12_today_after_basis_update: 5 images, page, action=todayUpdated
- 013 13_records_archive: 5 images, page, action=tabRecords
- 014 14_records_detail: 6 images, page, action=tabRecordsDetail
- 015 15_records_edit: 9 images, page, action=tabRecordsEdit
- 016 16_records_info_edit_modal: 1 images, modal, action=tabRecordsInfoEditModal
- 017 17_records_meal_add_modal: 2 images, modal, action=tabRecordsMealAddModal
- 018 18_records_meals_expanded: 5 images, page, action=tabRecordsMealsExpanded
- 019 19_records_meal_edit_modal: 2 images, modal, action=tabRecordsMealEditModal
- 020 20_recent_1d: 6 images, page, action=tabWeekly1
- 021 21_recent_3d: 6 images, page, action=tabWeekly3
- 022 22_recent_7d: 6 images, page, action=tabWeekly
- 023 23_recent_14d: 6 images, page, action=tabWeekly14
- 024 24_recent_28d: 7 images, page, action=tabWeekly28
- 025 25_inbody_top: 4 images, page, action=tabInbody
- 026 26_inbody_lower: 4 images, page, action=tabInbodyLower
- 027 27_inbody_edit: 4 images, page, action=tabInbodyEdit
- 028 28_inbody_records_link: 5 images, page, action=tabInbodyRecordsLink
- 029 29_settings_top: 3 images, page, action=tabSettings
- 030 30_settings_groups_open: 5 images, page, action=tabSettingsOpenGroups
- 031 31_settings_data_lower: 3 images, page, action=tabSettingsDataLower
- 032 32_backup_preview_modal: 4 images, modal, action=backupPreview
- 033 33_smart_restore_conflict_modal: 1 images, modal, action=smartConflict
- 034 34_today_rich: 5 images, page, action=none
- 035 35_today_record_detailed: 3 images, modal, action=todayRecordDetailed
- 036 36_records: 5 images, page, action=tabRecords
- 037 37_records_meal_edit: 2 images, modal, action=tabRecordsMealEditModal
- 038 38_recent: 6 images, page, action=tabWeekly
- 039 39_inbody: 4 images, page, action=tabInbody
- 040 40_settings: 3 images, page, action=tabSettings
- 041 41_settings_groups_open: 5 images, page, action=tabSettingsOpenGroups

## 주의

- 이 이미지는 QA용 뷰포트 캡처가 아니라 Stitch 업로드용 스크롤 조각입니다.
- 긴 화면은 한 장짜리 full-page보다 조각 이미지를 올리는 쪽이 Stitch가 구조를 더 잘 볼 가능성이 큽니다.
- Stitch 결과 코드는 그대로 합치지 말고, 좋은 레이아웃 패턴만 현재 `index.html`에 이식하는 용도로 보는 편이 안전합니다.
