$ErrorActionPreference = "Stop"

$workbookPath = Join-Path (Get-Location) "runstep_macro_v4_final_safe_v6_ui.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
$excel.EnableEvents = $false

function Set-CellValue {
    param($Sheet, [string]$Address, $Value)
    try {
        if ($Value -is [string]) {
            $escaped = $Value.Replace('"', '""')
            $Sheet.Range($Address).Formula = "=""$escaped"""
        }
        else {
            $Sheet.Range($Address).Formula = "=$Value"
        }
    }
    catch {
        throw "Set-CellValue failed at $Address with value [$Value]: $($_.Exception.Message)"
    }
}

function Set-CellFormula {
    param($Sheet, [string]$Address, [string]$Formula)
    $Sheet.Range($Address).Formula = $Formula
}

try {
    $workbook = $excel.Workbooks.Open($workbookPath)
    $main = $workbook.Worksheets.Item(1)
    $ref = $workbook.Worksheets.Item(2)
    $refName = $ref.Name.Replace("'", "''")

    # 1) NEAT-only activity factors
    Set-CellFormula $ref "E12" "=1.1"
    Set-CellFormula $ref "E13" "=1.175"
    Set-CellFormula $ref "E14" "=1.25"

    # 2) Purpose table switches from multiplier to absolute kcal delta
    Set-CellValue $ref "E26" "Calorie delta (kcal)"
    Set-CellFormula $ref "E27" "=-400"
    Set-CellFormula $ref "E28" "=150"
    Set-CellFormula $ref "E29" "=400"

    # 3) Clarify labels around NEAT and daily expenditure
    Set-CellValue $main "A19" "NEAT factor"
    Set-CellValue $main "A20" "Base expend. (BMR x NEAT)"
    Set-CellValue $main "A21" "Exercise expend. (weights+cardio+EPOC)"
    Set-CellValue $main "A22" "Total daily expend. (base+exercise)"
    Set-CellValue $main "E11" "NEAT + small work modifier"

    # 4) Add visible weight-training duration input
    $main.Range("H8:J8").Copy()
    $main.Range("H10:J10").PasteSpecial(-4122) | Out-Null
    Set-CellValue $main "H10" "Weights duration (min)"
    Set-CellFormula $main "I10" "=30"
    Set-CellValue $main "J10" "Enter lifting time"

    # 5) Helper + formula updates
    Set-CellFormula $main "D11" ("=IFERROR(VLOOKUP(B11,'{0}'!`$D`$12:`$E`$14,2,FALSE())+(D9*0.05),"""")" -f $refName)

    # Hidden helper cell for weight-training kcal
    Set-CellValue $main "N24" "helper_weight_kcal_O24"
    Set-CellFormula $main "O24" '=IFERROR((3+D12*4)*B6*3.5/200*IF(I10="",30,I10),0)'

    Set-CellFormula $main "B21" '=IFERROR(O24+I22+I24,0)'
    Set-CellFormula $main "B22" '=IFERROR(D6*D11+B21,"")'

    # Final output should not double-count cardio
    Set-CellValue $main "C26" "Exercise expend. ref (O24+I22+I24)"
    Set-CellFormula $main "C27" '=IFERROR(O24+I22+I24,0)'
    Set-CellFormula $main "C28" '=IFERROR((O24+I22+I24)*0.55/4,0)'
    Set-CellFormula $main "C30" '=IFERROR((O24+I22+I24)*0.25/9,0)'
    Set-CellFormula $main "D27" ("=IFERROR(B22+VLOOKUP(B13,'{0}'!`$D`$27:`$E`$29,2,FALSE()),"""")" -f $refName)
    Set-CellValue $main "F27" "B22 total + goal delta"

    # Make helper cells hidden
    $main.Columns("N:O").Hidden = $true

    # Recalculate and save in place
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
