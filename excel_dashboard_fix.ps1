$ErrorActionPreference = "Stop"

$workbookPath = Join-Path (Get-Location) "runstep_macro_v4_final_safe_v6_ui.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)

    $main.Range("A33:F34").Font.Color = 0
    $main.Range("A33:F34").Font.Bold = $true
    $main.Range("A33:F34").WrapText = $true

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
