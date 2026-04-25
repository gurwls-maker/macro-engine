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
    $main.Columns("N:P").Hidden = $true

    # Main sheet Korean labels
    Set-Text $main "A19" "생활계수 (NEAT)"
    Set-Text $main "A20" "기본 소비량 (BMR×생활계수)"
    Set-Text $main "A21" "운동 소모량 (웨이트+유산소+EPOC)"
    Set-Text $main "A22" "일일 총 소비량 (기본+운동)"
    Set-Text $main "E11" "생활활동 + 업무강도 소폭보정"
    Set-Text $main "H10" "웨이트 시간 (분)"
    Set-Text $main "J10" "실운동 시간 입력"
    Set-Text $main "C26" "운동소모 참고 (O24+I22+I24)"
    Set-Text $main "F27" "일일 총소비(B22) + 목적별 가감"

    # Auto guide block Korean labels
    Set-Text $main "H33" "자동 활동 가이드"
    Set-Text $main "H34" "주당 웨이트 횟수"
    Set-Text $main "J34" "세션당 작업세트"
    Set-Text $main "L34" "주당 유산소 횟수"

    Set-Text $main "H35" "하루 평균 걸음수"
    Set-Text $main "J35" "자동 판정"
    Set-Text $main "L35" "추천 생활계수"

    Set-Text $main "H36" "활동 점수"
    Set-Text $main "J36" "현재 활동수준"
    Set-Text $main "L36" "현재 기본계수"

    Set-Text $main "H37" "가이드 메모"

    Set-Text $main "H41" "2주 자동 보정"
    Set-Text $main "H42" "이전 7일 평균체중"
    Set-Text $main "J42" "최근 7일 평균체중"
    Set-Text $main "L42" "허리둘레 변화 (cm)"

    Set-Text $main "H43" "주간 변화폭"
    Set-Text $main "J43" "목표 변화속도"
    Set-Text $main "L43" "칼로리 조정값"

    Set-Text $main "H46" "팁: 자동 가이드와 실제 몸 반응이 잘 맞으면 현재 설정을 그대로 유지해도 됩니다."

    # Hidden localized text bank
    Set-Text $main "P33" "일반형"
    Set-Text $main "P34" "활동형"
    Set-Text $main "P35" "고활동형"
    Set-Text $main "P36" "자동 가이드상 기본 활동계수를 조금 더 높게 보는 편이 적절합니다."
    Set-Text $main "P37" "자동 가이드상 기본 활동계수를 조금 더 낮게 보는 편이 적절합니다."
    Set-Text $main "P38" "현재 선택한 활동수준이 자동 가이드와 대체로 잘 맞습니다."
    Set-Text $main "P39" "웨이트 빈도, 작업세트, 유산소 빈도, 걸음수, 업무강도(Y)를 함께 반영한 자동 추천입니다."
    Set-Text $main "P40" "이전/최근 7일 평균체중을 입력하면 자동 보정이 활성화됩니다."
    Set-Text $main "P41" "현재 칼로리 설정은 유지해도 무난해 보입니다."
    Set-Text $main "P42" "현재 목표 기준으로 일일 "
    Set-Text $main "P43" "kcal 정도 올리는 것을 검토하세요."
    Set-Text $main "P44" "kcal 정도 낮추는 것을 검토하세요."

    # Helper text formulas in Korean
    $main.Range("O35").Formula = '=IF(O34<1.14,P33,IF(O34<1.21,P34,P35))'
    $main.Range("O37").Formula = '=IF(O34-O36>0.02,P36,IF(O36-O34>0.02,P37,P38))'
    $main.Range("I37").Formula = '=O37&CHAR(10)&P39'
    $main.Range("O45").Formula = '=IF(O42="",P40,IF(O44=0,P41,IF(O44>0,P42&O44&P43,P42&ABS(O44)&P44)))'

    # Reference sheet labels
    Set-Text $ref "E26" "칼로리 가감(kcal)"

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
