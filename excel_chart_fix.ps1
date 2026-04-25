$ErrorActionPreference = "Stop"

$workbookPath = Join-Path (Get-Location) "runstep_macro_v4_final_safe_v6_ui.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)

    $charts = $main.ChartObjects()
    $count = $charts.Count

    if ($count -ge 1) {
        $chart1 = $charts.Item(1).Chart
        $chart1.PlotVisibleOnly = $false
        $chart1.HasLegend = $false
        $series1 = $chart1.SeriesCollection(1)
        $series1.Values = $main.Range("R33:R35")
        $series1.HasDataLabels = $true
        $series1.ApplyDataLabels() | Out-Null
        for ($i = 1; $i -le 3; $i++) {
            $point = $series1.Points($i)
            $label = $point.DataLabel
            $name = $main.Range("Q" + (32 + $i)).Text
            $value = [math]::Round([double]$main.Range("R" + (32 + $i)).Value2, 0)
            $label.Text = "$name $value kcal"
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($label)
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($point)
        }
        $series1.Format.Fill.ForeColor.RGB = 0x5A8DEE
    }

    if ($count -ge 2) {
        $chart2 = $charts.Item(2).Chart
        $chart2.PlotVisibleOnly = $false
        $chart2.HasLegend = $false
        $series2 = $chart2.SeriesCollection(1)
        $series2.Values = $main.Range("R38:R40")
        $series2.Format.Fill.ForeColor.RGB = 0x62B36F
        $series2.HasDataLabels = $true
        $series2.ApplyDataLabels() | Out-Null
        for ($i = 1; $i -le 3; $i++) {
            $point2 = $series2.Points($i)
            $label2 = $point2.DataLabel
            $name2 = $main.Range("Q" + (37 + $i)).Text
            $value2 = [math]::Round([double]$main.Range("R" + (37 + $i)).Value2, 0)
            $label2.Text = "$name2 $value2"
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($label2)
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($point2)
        }
        $chart2.Axes(1).TickLabels.Orientation = 45
    }

    $excel.CalculateFullRebuild()
    $workbook.Save()
    $workbook.Close($true)
}
finally {
    if ($series1) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($series1) }
    if ($series2) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($series2) }
    if ($chart1) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chart1) }
    if ($chart2) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($chart2) }
    if ($charts) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($charts) }
    if ($main) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($main) }
    if ($workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
