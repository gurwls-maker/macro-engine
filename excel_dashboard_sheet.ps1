$ErrorActionPreference = "Stop"

$workbookPath = Join-Path (Get-Location) "runstep_macro_v4_final_safe_v6_ui.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
$excel.EnableEvents = $false

function Set-Text {
    param($Sheet, [string]$Address, [string]$Text)
    $escaped = $Text.Replace('"', '""')
    $Sheet.Range($Address).Formula = "=""$escaped"""
}

function Set-Formula {
    param($Sheet, [string]$Address, [string]$Formula)
    $Sheet.Range($Address).Formula = $Formula
}

function Style-Block {
    param(
        $Range,
        [int]$Fill,
        [int]$FontColor = 0,
        [bool]$Bold = $false,
        [int]$FontSize = 10,
        [int]$HAlign = -4108
    )
    $Range.Interior.Color = $Fill
    $Range.Font.Color = $FontColor
    $Range.Font.Bold = $Bold
    $Range.Font.Size = $FontSize
    $Range.HorizontalAlignment = $HAlign
    $Range.VerticalAlignment = -4108
}

function Make-Card {
    param(
        $Sheet,
        [string]$TitleRange,
        [string]$ValueRange,
        [string]$TitleText,
        [string]$ValueFormula
    )
    $Sheet.Range($TitleRange).Merge()
    $Sheet.Range($ValueRange).Merge()
    Set-Text $Sheet $Sheet.Range($TitleRange).Address($false, $false) $TitleText
    Set-Formula $Sheet $Sheet.Range($ValueRange).Address($false, $false) $ValueFormula
    Style-Block $Sheet.Range($TitleRange) 15921906 4473924 $true 10
    Style-Block $Sheet.Range($ValueRange) 16250871 2105376 $true 22
}

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)
    $mainName = $main.Name
    $sheetRef = "'" + $mainName.Replace("'", "''") + "'!"

    try {
        $oldDash = $workbook.Worksheets.Item("대시보드")
        $oldDash.Delete()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($oldDash)
        $oldDash = $null
    }
    catch {
    }

    $dashboard = $workbook.Worksheets.Add($workbook.Worksheets.Item(1))
    $dashboard.Name = "대시보드"

    $dashboard.Cells.Clear()
    $dashboard.Cells.Font.Name = "Malgun Gothic"
    $dashboard.Cells.Font.Size = 10
    $dashboard.Rows.RowHeight = 22
    $dashboard.Columns("A").ColumnWidth = 3
    $dashboard.Columns("B:D").ColumnWidth = 15
    $dashboard.Columns("E").ColumnWidth = 4
    $dashboard.Columns("F:H").ColumnWidth = 15
    $dashboard.Columns("I").ColumnWidth = 4
    $dashboard.Columns("J:L").ColumnWidth = 18

    $dashboard.Range("B2:L2").Merge()
    Set-Text $dashboard "B2" "린매스업 매크로 대시보드"
    Style-Block $dashboard.Range("B2:L2") 7870353 16777215 $true 18

    $dashboard.Range("B3:L3").Merge()
    Set-Text $dashboard "B3" "입력은 '매크로 계산기' 시트에서 하고, 이 시트는 결과와 가이드를 한눈에 보기 쉽게 정리한 화면입니다."
    Style-Block $dashboard.Range("B3:L3") 15925247 4473924 $false 10
    $dashboard.Range("B3:L3").WrapText = $true

    Make-Card $dashboard "B5:D5" "B6:D7" "오늘 목표 칼로리" ('=IF(' + $sheetRef + 'D27="","-",ROUND(' + $sheetRef + 'D27,0)&" kcal")')
    Make-Card $dashboard "F5:H5" "F6:H7" "일일 총 소비량" ('=IF(' + $sheetRef + 'B22="","-",ROUND(' + $sheetRef + 'B22,0)&" kcal")')
    Make-Card $dashboard "J5:L5" "J6:L7" "자동 활동 판정" ('=IF(' + $sheetRef + 'K35="","-",'+$sheetRef+'K35&CHAR(10)&"추천 계수 "&TEXT('+ $sheetRef +'M35,"0.000"))')
    $dashboard.Range("J6:L7").WrapText = $true
    $dashboard.Range("J6:L7").Font.Size = 16

    $dashboard.Range("B9:H9").Merge()
    Set-Text $dashboard "B9" "매크로 요약"
    Style-Block $dashboard.Range("B9:H9") 14408667 2105376 $true 12

    $dashboard.Range("J9:L9").Merge()
    Set-Text $dashboard "J9" "핵심 안내"
    Style-Block $dashboard.Range("J9:L9") 14408667 2105376 $true 12

    Set-Text $dashboard "B10" "탄수화물"
    Set-Formula $dashboard "C10" ('=ROUND(' + $sheetRef + 'D28,0)&" g"')
    Set-Formula $dashboard "D10" ('=ROUND(' + $sheetRef + 'D28*4,0)&" kcal"')
    Set-Formula $dashboard "E10" ('=IFERROR(ROUND((' + $sheetRef + 'D28*4)/' + $sheetRef + 'D27*100,0)&"%","-")')

    Set-Text $dashboard "B11" "단백질"
    Set-Formula $dashboard "C11" ('=ROUND(' + $sheetRef + 'D29,0)&" g"')
    Set-Formula $dashboard "D11" ('=ROUND(' + $sheetRef + 'D29*4,0)&" kcal"')
    Set-Formula $dashboard "E11" ('=IFERROR(ROUND((' + $sheetRef + 'D29*4)/' + $sheetRef + 'D27*100,0)&"%","-")')

    Set-Text $dashboard "B12" "지방"
    Set-Formula $dashboard "C12" ('=ROUND(' + $sheetRef + 'D30,0)&" g"')
    Set-Formula $dashboard "D12" ('=ROUND(' + $sheetRef + 'D30*9,0)&" kcal"')
    Set-Formula $dashboard "E12" ('=IFERROR(ROUND((' + $sheetRef + 'D30*9)/' + $sheetRef + 'D27*100,0)&"%","-")')

    Set-Text $dashboard "B13" "요약 문장"
    $dashboard.Range("C13:H13").Merge()
    Set-Formula $dashboard "C13" ('="탄 "&ROUND(' + $sheetRef + 'D28,0)&"g / 단 "&ROUND(' + $sheetRef + 'D29,0)&"g / 지 "&ROUND(' + $sheetRef + 'D30,0)&"g"')

    $dashboard.Range("B10:H13").Borders.LineStyle = 1
    Style-Block $dashboard.Range("B10:H13") 16777215 0 $false 10
    $dashboard.Range("B10:B13").Font.Bold = $true
    $dashboard.Range("C13:H13").WrapText = $true

    $dashboard.Range("J10:L10").Merge()
    Set-Formula $dashboard "J10" ('=IF(' + $sheetRef + 'M43="","2주 자동 보정을 쓰려면 이전 7일 평균체중과 최근 7일 평균체중을 입력하세요.","현재 자동 보정 제안: "&IF(' + $sheetRef + 'M43>0,"+","")&' + $sheetRef + 'M43&" kcal/day")')
    $dashboard.Range("J11:L12").Merge()
    Set-Formula $dashboard "J11" ('=IF(' + $sheetRef + 'K35="","활동 가이드 입력값을 채우면 추천 활동수준이 표시됩니다.","자동 활동 판정은 웨이트 빈도, 작업세트, 유산소 빈도, 걸음 수를 바탕으로 계산됩니다.")')
    $dashboard.Range("J13:L14").Merge()
    Set-Text $dashboard "J13" "입력 위치: 매크로 계산기 시트"
    Style-Block $dashboard.Range("J10:L14") 15925247 4473924 $false 10
    $dashboard.Range("J10:L14").WrapText = $true
    $dashboard.Range("J10:L14").Borders.LineStyle = 1

    $dashboard.Range("B16:H16").Merge()
    Set-Text $dashboard "B16" "칼로리 구성"
    Style-Block $dashboard.Range("B16:H16") 14408667 2105376 $true 12

    Set-Text $dashboard "B17" "기본 소비량"
    Set-Formula $dashboard "C17" ('=ROUND(' + $sheetRef + 'B20,0)&" kcal"')
    Set-Text $dashboard "D17" "운동 소모량"
    Set-Formula $dashboard "E17" ('=ROUND(' + $sheetRef + 'B21,0)&" kcal"')
    Set-Text $dashboard "F17" "목적별 가감"
    Set-Formula $dashboard "G17" ('=IFERROR(IF(VLOOKUP(' + $sheetRef + 'B13,기준데이터!$D$27:$E$29,2,FALSE())>0,"+"&ROUND(VLOOKUP(' + $sheetRef + 'B13,기준데이터!$D$27:$E$29,2,FALSE()),0),ROUND(VLOOKUP(' + $sheetRef + 'B13,기준데이터!$D$27:$E$29,2,FALSE()),0))&" kcal","-")')

    Set-Text $dashboard "B18" "공식 요약"
    $dashboard.Range("C18:H18").Merge()
    Set-Text $dashboard "C18" "일일 총 소비량 = 기본 소비량 + 운동 소모량 / 최종 목표 = 일일 총 소비량 + 목적별 가감"
    $dashboard.Range("B17:H18").Borders.LineStyle = 1
    Style-Block $dashboard.Range("B17:H18") 16777215 0 $false 10
    $dashboard.Range("B17,F17").Font.Bold = $true
    $dashboard.Range("D17").Font.Bold = $true
    $dashboard.Range("C18:H18").WrapText = $true

    $dashboard.Range("J16:L16").Merge()
    Set-Text $dashboard "J16" "현재 입력 요약"
    Style-Block $dashboard.Range("J16:L16") 14408667 2105376 $true 12

    Set-Text $dashboard "J17" "체중 / 체지방"
    $dashboard.Range("K17:L17").Merge()
    Set-Formula $dashboard "K17" ('=' + $sheetRef + 'B6&" kg / "&' + $sheetRef + 'B7&"%"')
    Set-Text $dashboard "J18" "활동수준 / 목표"
    $dashboard.Range("K18:L18").Merge()
    Set-Formula $dashboard "K18" ('=' + $sheetRef + 'B11&" / "&' + $sheetRef + 'B13')
    Set-Text $dashboard "J19" "루틴 / 웨이트 시간"
    $dashboard.Range("K19:L19").Merge()
    Set-Formula $dashboard "K19" ('=' + $sheetRef + 'B12&" / "&' + $sheetRef + 'I10&"분"')
    Set-Text $dashboard "J20" "유산소 시간"
    $dashboard.Range("K20:L20").Merge()
    Set-Formula $dashboard "K20" ('=IF(' + $sheetRef + 'B8="","-",' + $sheetRef + 'B8&"분")')

    $dashboard.Range("J17:L20").Borders.LineStyle = 1
    Style-Block $dashboard.Range("J17:L20") 16777215 0 $false 10
    $dashboard.Range("J17:J20").Font.Bold = $true

    $dashboard.Range("B22:L22").Merge()
    Set-Text $dashboard "B22" "입력은 '매크로 계산기'에서, 해석은 '대시보드'에서 보는 구조로 분리했습니다."
    Style-Block $dashboard.Range("B22:L22") 15925247 4473924 $false 10

    $dashboard.Rows("2").RowHeight = 28
    $dashboard.Rows("3").RowHeight = 26
    $dashboard.Rows("5").RowHeight = 22
    $dashboard.Rows("6:7").RowHeight = 34
    $dashboard.Rows("10:14").RowHeight = 24
    $dashboard.Rows("22").RowHeight = 26
    $dashboard.Range("B2:L22").Borders.LineStyle = 1

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
}
finally {
    if ($dashboard) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($dashboard) }
    if ($main) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($main) }
    if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
