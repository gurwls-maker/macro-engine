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
        [int]$FontSize = 10
    )
    $Range.Interior.Color = $Fill
    $Range.Font.Color = $FontColor
    $Range.Font.Bold = $Bold
    $Range.Font.Size = $FontSize
    $Range.HorizontalAlignment = -4108
    $Range.VerticalAlignment = -4108
}

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)

    # Remove charts from the left dashboard area
    foreach ($chartObj in @($main.ChartObjects())) {
        $chartObj.Delete()
    }

    # Rebuild left dashboard as clean cards + tables
    $main.Range("A32:F47").UnMerge()
    $main.Range("A32:F47").ClearContents()

    $main.Range("A32:F32").Merge()
    Set-Text $main "A32" "한눈에 보기"
    Style-Block $main.Range("A32:F32") 7870353 16777215 $true 13

    # KPI cards
    $main.Range("A33:C33").Merge()
    $main.Range("A34:C35").Merge()
    $main.Range("D33:F33").Merge()
    $main.Range("D34:F35").Merge()
    Set-Text $main "A33" "오늘 목표"
    Set-Formula $main "A34" '=IF(D27="","-",ROUND(D27,0)&" kcal")'
    Set-Text $main "D33" "총 소비"
    Set-Formula $main "D34" '=IF(B22="","-",ROUND(B22,0)&" kcal")'

    Style-Block $main.Range("A33:C33") 15921906 4473924 $true 10
    Style-Block $main.Range("D33:F33") 15921906 4473924 $true 10
    Style-Block $main.Range("A34:C35") 16250871 2105376 $true 22
    Style-Block $main.Range("D34:F35") 16250871 2105376 $true 22

    # Summary sentence
    $main.Range("A36:F36").Merge()
    Set-Formula $main "A36" '=IF(D27="","입력값을 채우면 핵심 결과가 자동 표시됩니다.","탄 " & ROUND(D28,0) & "g / 단 " & ROUND(D29,0) & "g / 지 " & ROUND(D30,0) & "g 기준으로 자동 계산된 결과입니다.")'
    Style-Block $main.Range("A36:F36") 15925247 4473924 $false 10

    # Macro table
    $main.Range("A37:C37").Merge()
    Set-Text $main "A37" "매크로 요약"
    Style-Block $main.Range("A37:C37") 14408667 2105376 $true 11
    Set-Text $main "A38" "탄수화물"
    Set-Text $main "B38" "388 g"
    Set-Formula $main "B38" '=ROUND(D28,0)&" g"'
    Set-Formula $main "C38" '=ROUND(D28*4,0)&" kcal"'
    Set-Text $main "A39" "단백질"
    Set-Formula $main "B39" '=ROUND(D29,0)&" g"'
    Set-Formula $main "C39" '=ROUND(D29*4,0)&" kcal"'
    Set-Text $main "A40" "지방"
    Set-Formula $main "B40" '=ROUND(D30,0)&" g"'
    Set-Formula $main "C40" '=ROUND(D30*9,0)&" kcal"'
    Set-Text $main "A41" "열량 비중"
    Set-Formula $main "B41" '=ROUND((D28*4)/D27*100,0)&"% / "&ROUND((D29*4)/D27*100,0)&"% / "&ROUND((D30*9)/D27*100,0)&"%"'
    $main.Range("B41:C41").Merge()

    # Energy table
    $main.Range("D37:F37").Merge()
    Set-Text $main "D37" "칼로리 구성"
    Style-Block $main.Range("D37:F37") 14408667 2105376 $true 11
    Set-Text $main "D38" "기본소비"
    Set-Formula $main "E38" '=ROUND(B20,0)&" kcal"'
    Set-Text $main "D39" "운동소모"
    Set-Formula $main "E39" '=ROUND(B21,0)&" kcal"'
    Set-Text $main "D40" "목표가감"
    Set-Formula $main "E40" '=IFERROR(IF(VLOOKUP(B13,기준데이터!$D$27:$E$29,2,FALSE())>0,"+"&ROUND(VLOOKUP(B13,기준데이터!$D$27:$E$29,2,FALSE()),0),ROUND(VLOOKUP(B13,기준데이터!$D$27:$E$29,2,FALSE()),0))&" kcal","-")'
    Set-Text $main "D41" "자동활동"
    Set-Formula $main "E41" '=IF(K35="","-",K35&" / "&TEXT(M35,"0.000"))'
    $main.Range("F38:F41").ClearContents()

    # Table styling
    Style-Block $main.Range("A38:C41") 16777215 0 $false 10
    Style-Block $main.Range("D38:F41") 16777215 0 $false 10
    $main.Range("A38:C41").Borders.LineStyle = 1
    $main.Range("D38:F41").Borders.LineStyle = 1
    $main.Range("A38:A41").Font.Bold = $true
    $main.Range("D38:D41").Font.Bold = $true

    # Footer notes
    $main.Range("A42:F43").Merge()
    Set-Formula $main "A42" '=IF(K35="","자동 활동 가이드 입력값을 채우면 활동수준 추천이 표시됩니다.","자동 활동 판정: " & K35 & " / 추천 계수 " & TEXT(M35,"0.000"))'
    $main.Range("A44:F45").Merge()
    Set-Formula $main "A44" '=IF(M43="","2주 자동 보정을 쓰려면 이전 7일 평균체중과 최근 7일 평균체중을 입력하세요.","2주 보정 제안: " & IF(M43>0,"+"&M43,M43) & " kcal/day")'
    $main.Range("A46:F47").Merge()
    Set-Text $main "A46" "차트보다 숫자와 문장을 먼저 읽히게 구성했습니다. 더 시각적인 버전이 필요하면 다음 단계에서 별도 대시보드 탭으로 분리하는 편이 좋습니다."
    Style-Block $main.Range("A42:F47") 15925247 4473924 $false 10
    $main.Range("A42:F47").WrapText = $true
    $main.Range("A42:F47").Borders.LineStyle = 1

    # Row heights
    $main.Rows("33").RowHeight = 22
    $main.Rows("34:35").RowHeight = 34
    $main.Rows("36").RowHeight = 22
    $main.Rows("37").RowHeight = 22
    $main.Rows("42:47").RowHeight = 24

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
}
finally {
    if ($main) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($main) }
    if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
