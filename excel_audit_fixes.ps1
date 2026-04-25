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

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)
    $ref = $workbook.Worksheets.Item(2)

    # Fix visible label/unit mismatch for goal delta
    Set-Text $main "C14" "칼로리 가감"
    $main.Range("D14").NumberFormat = "0"
    Set-Text $main "E14" "kcal"

    # Update outdated explanation text in reference sheet
    Set-Text $ref "D30" "칼로리 가감: 다이어트=-400 / 린매스업=+150 / 벌크업=+400  |  EPOC: MET>6일 때만 활성화, 저강도 유산소는 자동 0"

    # Hide chart helper columns too
    $main.Columns("Q:R").Hidden = $true

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
}
finally {
    if ($main) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($main) }
    if ($ref) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ref) }
    if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
