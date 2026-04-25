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

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)
    $ref = $workbook.Worksheets.Item(2)
    $refName = $ref.Name.Replace("'", "''")

    # Move routine intensity helper out of visible dashboard area
    Set-Text $ref "H39" "루틴"
    Set-Text $ref "I39" "웨이트강도(Xw)"
    Set-Text $ref "H40" "REST"
    Set-Text $ref "H41" "PUSH"
    Set-Text $ref "H42" "UPPER"
    Set-Text $ref "H43" "PULL"
    Set-Text $ref "H44" "LOWER"
    Set-Text $ref "H45" "LEGS"
    Set-Formula $ref "I40" "=0"
    Set-Formula $ref "I41" "=0.8"
    Set-Formula $ref "I42" "=0.8"
    Set-Formula $ref "I43" "=0.85"
    Set-Formula $ref "I44" "=0.85"
    Set-Formula $ref "I45" "=1"

    Set-Formula $main "N44" ("=IFERROR(VLOOKUP(B12,'{0}'!`$H`$40:`$I`$45,2,FALSE()),0)" -f $refName)
    Set-Formula $main "D12" "=N44"

    # Clear old left-bottom reference area and rebuild as dashboard
    $main.Range("A32:F47").UnMerge()
    $main.Range("A32:F47").ClearContents()
    $main.Range("A32:F47").Interior.Pattern = -4142

    $main.Range("A32:F32").Merge()
    Set-Text $main "A32" "한눈에 보기"
    $main.Range("A33:F34").Merge()
    Set-Formula $main "A33" '=IF(D27="","입력값을 채우면 핵심 결과가 자동 표시됩니다.","오늘 목표 칼로리 " & ROUND(D27,0) & " kcal / 탄 " & ROUND(D28,0) & "g / 단 " & ROUND(D29,0) & "g / 지 " & ROUND(D30,0) & "g")'

    # Restore auto-guide helper formulas (O-column)
    Set-Formula $main "O33" '=MIN(1,MAX(0,(I34/5)*0.35+(K34/25)*0.25+(M34/4)*0.15+(I35/12000)*0.15+(D9*0.1)))'
    Set-Formula $main "O34" '=1.1+O33*0.15'
    Set-Formula $main "O35" '=IF(O34<1.14,P33,IF(O34<1.21,P34,P35))'
    Set-Formula $main "O36" ("=IFERROR(VLOOKUP(B11,'{0}'!`$D`$12:`$E`$14,2,FALSE()),"""")" -f $refName)
    Set-Formula $main "O37" '=IF(O34-O36>0.02,P36,IF(O36-O34>0.02,P37,P38))'

    # Helper data for charts (Q:R)
    Set-Text $main "Q32" "항목"
    Set-Text $main "R32" "kcal"
    Set-Text $main "Q33" "탄수화물"
    Set-Text $main "Q34" "단백질"
    Set-Text $main "Q35" "지방"
    Set-Formula $main "R33" "=D28*4"
    Set-Formula $main "R34" "=D29*4"
    Set-Formula $main "R35" "=D30*9"

    Set-Text $main "Q37" "항목"
    Set-Text $main "R37" "kcal"
    Set-Text $main "Q38" "기본소비"
    Set-Text $main "Q39" "운동소모"
    Set-Text $main "Q40" "목표가감"
    Set-Formula $main "R38" "=B20"
    Set-Formula $main "R39" "=B21"
    Set-Formula $main "R40" ("=IFERROR(VLOOKUP(B13,'{0}'!`$D`$27:`$E`$29,2,FALSE()),0)" -f $refName)

    # Visual styling
    $main.Range("A32:F32").Interior.Color = 7870353
    $main.Range("A32:F32").Font.Color = 16777215
    $main.Range("A32:F32").Font.Bold = $true
    $main.Range("A32:F32").HorizontalAlignment = -4108
    $main.Range("A33:F34").Interior.Color = 15925247
    $main.Range("A33:F34").WrapText = $true
    $main.Range("A33:F34").HorizontalAlignment = -4108
    $main.Range("A33:F34").VerticalAlignment = -4108
    $main.Rows("32").RowHeight = 26
    $main.Rows("33:34").RowHeight = 28

    # Remove existing charts before redrawing
    foreach ($chartObj in @($main.ChartObjects())) {
        $chartObj.Delete()
    }

    # Chart 1: macro split
    $chart1 = $main.ChartObjects().Add($main.Range("A35").Left, $main.Range("A35").Top, 260, 210)
    $chart1.Chart.SetSourceData($main.Range("Q32:R35"))
    $chart1.Chart.ChartType = 80  # doughnut
    $chart1.Chart.HasTitle = $true
    $chart1.Chart.ChartTitle.Text = "매크로 열량 분포"
    $chart1.Chart.HasLegend = $true

    # Chart 2: expenditure breakdown
    $chart2 = $main.ChartObjects().Add($main.Range("D35").Left, $main.Range("D35").Top, 260, 210)
    $chart2.Chart.SetSourceData($main.Range("Q37:R40"))
    $chart2.Chart.ChartType = 51  # clustered column
    $chart2.Chart.HasTitle = $true
    $chart2.Chart.ChartTitle.Text = "칼로리 구성"
    $chart2.Chart.HasLegend = $false

    # Small KPI labels under charts
    $main.Range("A45:C45").Merge()
    $main.Range("D45:F45").Merge()
    Set-Formula $main "A45" '=IF(D27="","", "총 목표칼로리: " & ROUND(D27,0) & " kcal")'
    Set-Formula $main "D45" '=IF(B22="","", "총 소비칼로리: " & ROUND(B22,0) & " kcal")'
    $main.Range("A45:C45").Interior.Color = 16250871
    $main.Range("D45:F45").Interior.Color = 16250871
    $main.Range("A45:F45").HorizontalAlignment = -4108
    $main.Range("A45:F45").Font.Bold = $true

    $main.Range("A46:C47").Merge()
    $main.Range("D46:F47").Merge()
    Set-Formula $main "A46" '=IF(K35="","", "자동 활동 판정: " & K35 & " / 추천 계수 " & TEXT(M35,"0.000"))'
    Set-Formula $main "D46" '=IF(M43="","", "2주 보정 제안: " & IF(M43>0,"+" & M43,M43) & " kcal/day")'
    $main.Range("A46:F47").WrapText = $true
    $main.Range("A46:F47").Interior.Color = 15925247
    $main.Range("A46:F47").HorizontalAlignment = -4108
    $main.Range("A46:F47").VerticalAlignment = -4108

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
}
finally {
    if ($chart1) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chart1) }
    if ($chart2) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chart2) }
    if ($main) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($main) }
    if ($ref) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ref) }
    if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
