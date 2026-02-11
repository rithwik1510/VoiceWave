param(
  [switch]$Generate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$phaseADir = Join-Path $repoRoot "docs/phaseA/artifacts"
$phaseBDir = Join-Path $repoRoot "docs/phaseB/artifacts"

function Resolve-CargoPath {
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargo) { return $cargo.Source }
  $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "Cargo not found."
}

function Add-MingwToPathIfAvailable {
  $wingetMingw = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
  if (Test-Path $wingetMingw) {
    $env:PATH = "$wingetMingw;$env:PATH"
  }
}

function Ensure-SpaceSafeJunction([string]$sourcePath) {
  $junctionPath = Join-Path $env:TEMP "voicewave-phaseB-nospace"
  if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq "Junction") { return $junctionPath }
    Remove-Item -LiteralPath $junctionPath -Force -Recurse
  }
  New-Item -ItemType Junction -Path $junctionPath -Target $sourcePath | Out-Null
  return $junctionPath
}

function Get-LatestFile([string]$dir, [string]$pattern) {
  if (-not (Test-Path $dir)) { return $null }
  $rows = @(Get-ChildItem -Path $dir -Filter $pattern -File | Sort-Object LastWriteTimeUtc -Descending)
  if ($rows.Count -eq 0) { return $null }
  return $rows[0]
}

function Run-Generate {
  if (-not (Test-Path $phaseBDir)) { New-Item -ItemType Directory -Path $phaseBDir -Force | Out-Null }
  $today = Get-Date -Format "yyyy-MM-dd"
  $cargoExe = Resolve-CargoPath
  Add-MingwToPathIfAvailable
  $spaceSafeRoot = Ensure-SpaceSafeJunction $repoRoot
  $manifest = Join-Path $spaceSafeRoot "src-tauri\Cargo.toml"
  $outPath = Join-Path $spaceSafeRoot "docs/phaseB/artifacts/fw-latency-$today.json"

  Push-Location $spaceSafeRoot
  try {
    & $cargoExe +stable-x86_64-pc-windows-gnu run --manifest-path $manifest --bin phaseb_fw_sweep -- --out $outPath --runs 20 --warmup-runs 3
    if ($LASTEXITCODE -ne 0) {
      throw "phaseb_fw_sweep exited with code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Generated: $outPath"
}

if ($Generate) {
  Run-Generate
}

$phaseA = Get-LatestFile $phaseADir "cpu-latency-*.json"
$phaseB = Get-LatestFile $phaseBDir "fw-latency-*.json"

if ($null -eq $phaseB) {
  throw "No Phase B artifact found. Run with -Generate first."
}

$b = Get-Content $phaseB.FullName -Raw | ConvertFrom-Json
$fw = $b.models | Where-Object { $_.modelId -eq "fw-small.en" } | Select-Object -First 1
$sm = $b.models | Where-Object { $_.modelId -eq "small.en" } | Select-Object -First 1

if ($null -eq $fw -or $null -eq $sm) {
  throw "Phase B artifact is missing small.en or fw-small.en rows."
}

$baselineP50 = $null
$baselineP95 = $null
if ($phaseA) {
  $a = Get-Content $phaseA.FullName -Raw | ConvertFrom-Json
  $baselineP50 = [double]$a.smallEn.p50ReleaseToFinalMs
  $baselineP95 = [double]$a.smallEn.p95ReleaseToFinalMs
}

Write-Host ""
Write-Host "Phase B Faster-Whisper Sweep"
Write-Host "----------------------------"
Write-Host ("Artifact: " + $phaseB.FullName)
Write-Host ("Runs/model: " + $b.runsPerModel)
Write-Host ""
Write-Host ("small.en      p50={0}ms  p95={1}ms" -f $sm.p50ReleaseToFinalMs, $sm.p95ReleaseToFinalMs)
Write-Host ("fw-small.en   p50={0}ms  p95={1}ms" -f $fw.p50ReleaseToFinalMs, $fw.p95ReleaseToFinalMs)

if ($baselineP50 -ne $null -and $baselineP95 -ne $null) {
  $deltaP50 = [double]$fw.p50ReleaseToFinalMs - $baselineP50
  $deltaP95 = [double]$fw.p95ReleaseToFinalMs - $baselineP95
  Write-Host ""
  Write-Host ("vs PhaseA small baseline ({0}):" -f $phaseA.Name)
  Write-Host ("delta p50 = {0}ms" -f [math]::Round($deltaP50, 1))
  Write-Host ("delta p95 = {0}ms" -f [math]::Round($deltaP95, 1))
}
