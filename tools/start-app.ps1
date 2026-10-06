$ErrorActionPreference = 'Stop'
try {
    $root = Split-Path -Parent $PSScriptRoot
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        throw 'Node.js LTS is required. Install it from https://nodejs.org/en/download and open Macro Engine.cmd again. Codex is optional.'
    }
    $logs = Join-Path $root 'user-data\run'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $run = [guid]::NewGuid().ToString('N')
    $output = Join-Path $logs "$run.out.log"
    $errors = Join-Path $logs "$run.error.log"
    $script = Join-Path $PSScriptRoot 'launch.cjs'
    $process = Start-Process -FilePath $node.Source -ArgumentList "`"$script`"" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $output -RedirectStandardError $errors -PassThru
    for ($i = 0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 150
        if ((Test-Path -LiteralPath $output) -and ((Get-Content -LiteralPath $output -Raw) -match 'Macro Engine: http://127.0.0.1:\d+')) { exit 0 }
        if ($process.HasExited) { break }
    }
    throw "The app could not open. Check $errors. Existing records have not been replaced."
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Macro Engine') | Out-Null
    exit 1
}
