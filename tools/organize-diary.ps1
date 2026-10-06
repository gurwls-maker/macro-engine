param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$Batch,
    [Parameter(Mandatory = $true)][string]$Journal,
    [int]$ExpectedCount = 18,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
function Get-Sha256([string]$LiteralPath) {
    $stream = [IO.File]::OpenRead($LiteralPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$root = (Resolve-Path -LiteralPath $SourceRoot).ProviderPath.TrimEnd('\', '/')
$prefix = $root + [System.IO.Path]::DirectorySeparatorChar
$journalPath = [System.IO.Path]::GetFullPath($Journal)
if (Test-Path -LiteralPath $journalPath) { throw 'Journal already exists. Inspect it before retrying; no files were moved.' }
$files = @(Get-ChildItem -LiteralPath $Batch -File -Filter '*.json')
if ($files.Count -ne $ExpectedCount) { throw "Expected $ExpectedCount extraction files, got $($files.Count)." }
$plan = @()
foreach ($file in $files) {
    $row = Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($row.filename -ne [System.IO.Path]::GetFileName($row.filename)) { throw 'Filename must be a leaf name.' }
    if ($row.session.date -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Invalid image header date.' }
    $date = [DateTime]::ParseExact($row.session.date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    if ($row.session.label -notin @('Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Push+Pull')) { throw 'Unreviewed folder label.' }
    $folder = $date.ToString('yyMMdd') + ' ' + $row.session.label
    $source = [System.IO.Path]::GetFullPath((Join-Path $root $row.filename))
    $directory = [System.IO.Path]::GetFullPath((Join-Path $root $folder))
    $destination = [System.IO.Path]::GetFullPath((Join-Path $directory $row.filename))
    foreach ($target in @($source, $directory, $destination)) {
        if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped source root.' }
    }
    $item = Get-Item -LiteralPath $source
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Source is not a regular image.' }
    if (Test-Path -LiteralPath $directory) {
        $dirItem = Get-Item -LiteralPath $directory
        if (-not $dirItem.PSIsContainer -or ($dirItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Destination directory is redirected or invalid.' }
    }
    if (Test-Path -LiteralPath $destination) { throw "Destination exists; will not overwrite: $destination" }
    $plan += [pscustomobject]@{
        source = $source; destination = $destination; directory = $directory
        extractionFile = $file.FullName; date = $row.session.date; label = $row.session.label
        hash = Get-Sha256 $source
        bytes = $item.Length; moved = $false
    }
}
if (@($plan.destination | Select-Object -Unique).Count -ne $plan.Count) { throw 'Duplicate destinations in plan.' }
if (-not $Apply) { $plan | ConvertTo-Json -Depth 5; return }
$journalParent = Split-Path -Parent $journalPath
[IO.Directory]::CreateDirectory($journalParent) | Out-Null
function Save-Journal {
    $temporary = $journalPath + '.tmp'
    [IO.File]::WriteAllText($temporary, ($plan | ConvertTo-Json -Depth 5), $utf8)
    Move-Item -LiteralPath $temporary -Destination $journalPath -Force
}
Save-Journal
foreach ($row in $plan) {
    if ((Get-Sha256 $row.source) -ne $row.hash) { throw 'Source changed after planning; stopped.' }
    if (Test-Path -LiteralPath $row.destination) { throw 'Destination appeared after planning; stopped.' }
    if (-not (Test-Path -LiteralPath $row.directory)) { New-Item -ItemType Directory -Path $row.directory | Out-Null }
    Move-Item -LiteralPath $row.source -Destination $row.destination
    if ((Get-Sha256 $row.destination) -ne $row.hash) { throw 'Post-move hash mismatch; inspect journal.' }
    $row.moved = $true
    Save-Journal
}
[pscustomobject]@{ moved = $plan.Count; hashesVerified = $plan.Count; journal = $journalPath } | ConvertTo-Json
