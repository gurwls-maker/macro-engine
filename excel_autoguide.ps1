$ErrorActionPreference = "Stop"

$workbookPath = Join-Path (Get-Location) "runstep_macro_v4_final_safe_v6_ui.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
$excel.EnableEvents = $false

function Set-CellValue {
    param($Sheet, [string]$Address, $Value)
    if ($Value -is [string]) {
        $escaped = $Value.Replace('"', '""')
        $Sheet.Range($Address).Formula = "=""$escaped"""
    }
    else {
        $Sheet.Range($Address).Formula = "=$Value"
    }
}

function Set-CellFormula {
    param($Sheet, [string]$Address, [string]$Formula)
    $Sheet.Range($Address).Formula = $Formula
}

function Style-Block {
    param($Range, $FillColor, $Bold = $false, $FontColor = 0)
    $Range.Interior.Color = $FillColor
    $Range.Font.Bold = $Bold
    if ($FontColor -ne 0) { $Range.Font.Color = $FontColor }
    $Range.VerticalAlignment = -4108
}

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)
    $ref = $workbook.Worksheets.Item(2)
    $refName = $ref.Name.Replace("'", "''")

    # Keep helper area hidden and available
    $main.Columns("N:P").Hidden = $true

    # Clear / unmerge target area first
    $main.Range("H33:M47").UnMerge()
    $main.Range("H33:M47").ClearContents()

    # Titles
    $main.Range("H33:M33").Merge()
    $main.Range("H41:M41").Merge()
    Set-CellValue $main "H33" "Auto Activity Guide"
    Set-CellValue $main "H41" "2-Week Auto Adjust"

    # Inputs / outputs layout
    Set-CellValue $main "H34" "Lift days / wk"
    Set-CellValue $main "I34" 4
    Set-CellValue $main "J34" "Work sets / session"
    Set-CellValue $main "K34" 18
    Set-CellValue $main "L34" "Cardio days / wk"
    Set-CellValue $main "M34" 2

    Set-CellValue $main "H35" "Steps / day"
    Set-CellValue $main "I35" 7000
    Set-CellValue $main "J35" "Auto tier"
    Set-CellFormula $main "K35" '=O35'
    Set-CellValue $main "L35" "Rec. base NEAT"
    Set-CellFormula $main "M35" '=ROUND(O34,3)'

    Set-CellValue $main "H36" "Load score"
    Set-CellFormula $main "I36" '=ROUND(O33,2)'
    Set-CellValue $main "J36" "Current B11"
    Set-CellFormula $main "K36" '=B11'
    Set-CellValue $main "L36" "Current base"
    Set-CellFormula $main "M36" '=ROUND(O36,3)'

    $main.Range("I37:M38").Merge()
    Set-CellValue $main "H37" "Guide note"
    Set-CellFormula $main "I37" '=O37&CHAR(10)&"Uses lift days, work sets, cardio days, steps, and work-activity Y."'

    Set-CellValue $main "H42" "Prev 7d avg wt"
    $main.Range("I42").ClearContents()
    Set-CellValue $main "J42" "Current 7d avg wt"
    $main.Range("K42").ClearContents()
    Set-CellValue $main "L42" "Waist delta (cm)"
    Set-CellValue $main "M42" 0

    Set-CellValue $main "H43" "Weekly delta"
    Set-CellFormula $main "I43" '=IF(O42="","",ROUND(O42,2))'
    Set-CellValue $main "J43" "Goal pace"
    Set-CellFormula $main "K43" '=IF(O43="","",ROUND(O43,2))'
    Set-CellValue $main "L43" "Kcal adjust"
    Set-CellFormula $main "M43" '=O44'

    $main.Range("H44:M45").Merge()
    Set-CellFormula $main "H44" '=O45'

    $main.Range("H46:M47").Merge()
    Set-CellValue $main "H46" "Tip: keep current settings if the auto guide and your real-world response already align."

    # Hidden helper formulas for auto-guide
    Set-CellFormula $main "O33" '=MIN(1,MAX(0,(I34/5)*0.35+(K34/25)*0.25+(M34/4)*0.15+(I35/12000)*0.15+(D9*0.1)))'
    Set-CellFormula $main "O34" '=1.1+O33*0.15'
    Set-CellFormula $main "O35" '=IF(O34<1.14,"General",IF(O34<1.21,"Active","High-activity"))'
    Set-CellFormula $main "O36" ("=IFERROR(VLOOKUP(B11,'{0}'!`$D`$12:`$E`$14,2,FALSE()),"""")" -f $refName)
    Set-CellFormula $main "O37" '=IF(O34-O36>0.02,"Auto guide suggests a higher base-activity tier.",IF(O36-O34>0.02,"Auto guide suggests a lower base-activity tier.","Current base-activity tier looks aligned."))'

    # Hidden helper formulas for 2-week adjustment
    Set-CellFormula $main "O42" '=IF(OR(I42="",K42=""),"",K42-I42)'
    Set-CellFormula $main "O46" ("=IFERROR(MATCH(B13,'{0}'!`$D`$27:`$D`$29,0),"""")" -f $refName)
    Set-CellFormula $main "O43" '=IF(O46="","",CHOOSE(O46,-0.3,0.12,0.25))'
    Set-CellFormula $main "O44" '=IF(OR(O42="",O46=""),"",IF(O46=1,IF(OR(O42>-0.05,M42>0.5),-100,IF(O42<-0.6,100,0)),IF(O46=2,IF(O42<0.05,100,IF(OR(O42>0.25,M42>0.8),-100,0)),IF(O42<0.15,100,IF(OR(O42>0.4,M42>1),-100,0)))))'
    Set-CellFormula $main "O45" '=IF(O42="","Enter previous/current 7d averages to unlock auto-adjust.",IF(O44=0,"Current calorie target looks reasonable.",IF(O44>0,"Consider increasing target by "&O44&" kcal/day.","Consider decreasing target by "&ABS(O44)&" kcal/day.")))'

    # Formatting
    Style-Block $main.Range("H33:M33") 7870353 $true 16777215
    Style-Block $main.Range("H41:M41") 7870353 $true 16777215

    foreach ($addr in @("H34","J34","L34","H35","J35","L35","H36","J36","L36","H42","J42","L42","H43","J43","L43")) {
        Style-Block $main.Range($addr) 15921906 $true
    }
    foreach ($addr in @("I34","K34","M34","I35","K35","M35","I36","K36","M36","I42","K42","M42","I43","K43","M43")) {
        Style-Block $main.Range($addr) 16777215
        $main.Range($addr).HorizontalAlignment = -4108
    }

    Style-Block $main.Range("I37:M38") 16250871
    Style-Block $main.Range("H44:M45") 16250871
    Style-Block $main.Range("H46:M47") 15925247
    $main.Range("I37:M38").WrapText = $true
    $main.Range("H44:M45").WrapText = $true
    $main.Range("H46:M47").WrapText = $true

    $main.Rows("33").RowHeight = 24
    $main.Rows("37:38").RowHeight = 28
    $main.Rows("41").RowHeight = 24
    $main.Rows("44:45").RowHeight = 30
    $main.Rows("46:47").RowHeight = 24

    $main.Range("I43:K43").NumberFormat = "0.00"
    $main.Range("M35:M36").NumberFormat = "0.000"
    $main.Range("M43").NumberFormat = "0"

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
