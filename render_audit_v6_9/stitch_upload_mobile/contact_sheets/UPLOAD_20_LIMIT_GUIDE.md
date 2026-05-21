# Stitch 20장 제한 대응 업로드 가이드

Stitch가 파일 첨부를 20장까지만 받는 경우에는 원본 PNG 167장을 올리지 말고, 이 폴더의 컨택트 시트 JPG만 올립니다.

- 업로드할 이미지: `images/stitch_mobile_sheet_01_of_17.jpg`부터 `images/stitch_mobile_sheet_17_of_17.jpg`까지
- 컨택트 시트 수: 17장
- 포함된 원본 화면 조각: 167장
- 각 타일은 390x900 모바일 원본 화면을 축소하지 않고 배치했습니다.

## Stitch에서 넣는 순서

1. `기존 DESIGN.md 붙여넣기` 칸에 상위 폴더의 `DESIGN.md` 내용을 붙여 넣습니다.
2. `파일 드래그 앤 드롭`에는 이 폴더의 `images/` 안 JPG 17장만 올립니다.
3. `공개 GitHub 저장소`에는 공개 접근 가능하면 `https://github.com/gurwls-maker/macro-engine`를 넣습니다.
4. `웹사이트 추가`는 배포된 HTTPS URL이 생기기 전까지 비워둡니다.

## 추가 안내 칸

```text
첨부한 이미지는 20장 제한 때문에 여러 모바일 화면을 묶은 컨택트 시트입니다. 각 타일 하나가 실제 390px 모바일 화면 한 상태입니다. 전체 타일을 같은 앱의 상태 세트로 보고, 공통 컴포넌트와 모바일 레이아웃 규칙을 일관되게 리디자인해주세요. 기능, 입력 항목, 탭, 모달 흐름은 유지해주세요.
```

## 시트 인덱스

- stitch_mobile_sheet_01_of_17.jpg: 원본 10장, 001_01_today_empty_top_page_01.png ~ 003_03_today_rich_stale_page_02.png
- stitch_mobile_sheet_02_of_17.jpg: 원본 10장, 003_03_today_rich_stale_page_03.png ~ 004_04_today_quick_open_page_07.png
- stitch_mobile_sheet_03_of_17.jpg: 원본 10장, 004_04_today_quick_open_page_08.png ~ 009_09_today_record_alcohol_open_modal_03.png
- stitch_mobile_sheet_04_of_17.jpg: 원본 10장, 009_09_today_record_alcohol_open_modal_04.png ~ 012_12_today_after_basis_update_page_05.png
- stitch_mobile_sheet_05_of_17.jpg: 원본 10장, 013_13_records_archive_page_01.png ~ 014_14_records_detail_page_05.png
- stitch_mobile_sheet_06_of_17.jpg: 원본 10장, 014_14_records_detail_page_06.png ~ 015_15_records_edit_page_09.png
- stitch_mobile_sheet_07_of_17.jpg: 원본 10장, 016_16_records_info_edit_modal_modal_01.png ~ 019_19_records_meal_edit_modal_modal_02.png
- stitch_mobile_sheet_08_of_17.jpg: 원본 10장, 020_20_recent_1d_page_01.png ~ 021_21_recent_3d_page_04.png
- stitch_mobile_sheet_09_of_17.jpg: 원본 10장, 021_21_recent_3d_page_05.png ~ 023_23_recent_14d_page_02.png
- stitch_mobile_sheet_10_of_17.jpg: 원본 10장, 023_23_recent_14d_page_03.png ~ 024_24_recent_28d_page_06.png
- stitch_mobile_sheet_11_of_17.jpg: 원본 10장, 024_24_recent_28d_page_07.png ~ 027_27_inbody_edit_page_01.png
- stitch_mobile_sheet_12_of_17.jpg: 원본 10장, 027_27_inbody_edit_page_02.png ~ 029_29_settings_top_page_02.png
- stitch_mobile_sheet_13_of_17.jpg: 원본 10장, 029_29_settings_top_page_03.png ~ 032_32_backup_preview_modal_modal_01.png
- stitch_mobile_sheet_14_of_17.jpg: 원본 10장, 032_32_backup_preview_modal_modal_02.png ~ 035_35_today_record_detailed_modal_01.png
- stitch_mobile_sheet_15_of_17.jpg: 원본 10장, 035_35_today_record_detailed_modal_02.png ~ 038_38_recent_page_01.png
- stitch_mobile_sheet_16_of_17.jpg: 원본 10장, 038_38_recent_page_02.png ~ 040_40_settings_page_01.png
- stitch_mobile_sheet_17_of_17.jpg: 원본 7장, 040_40_settings_page_02.png ~ 041_41_settings_groups_open_page_05.png