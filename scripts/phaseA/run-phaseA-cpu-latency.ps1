param(
  [switch]$Enforce,
  [switch]$Generate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactDir = Join-Path $repoRoot "docs/phaseA/artifacts"
$checks = New-Object System.Collections.Generic.List[object]
$failedChecks = 0

function Add-CheckResult {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Detail
  )

  $status = if ($Passed) { "PASS" } else { "FAIL" }
  $checks.Add([pscustomobject]@{
      Check  = $Name
      Status = $status
      Detail = $Detail
    }) | Out-Null

  if (-not $Passed) {
    $script:failedChecks += 1
  }
}

function Get-LatestArtifact {
  if (-not (Test-Path $artifactDir)) {
    return $null
  }
  $matches = @(
    Get-ChildItem -Path $artifactDir -Filter "cpu-latency-*.json" -File |
      Sort-Object LastWriteTimeUtc -Descending
  )
  if ($matches.Count -eq 0) {
    return $null
  }
  return $matches[0]
}

function Resolve-CargoPath {
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargo) {
    return $cargo.Source
  }
  $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $fallback) {
    return $fallback
  }
  throw "Cargo not found. Install Rust toolchain first."
}

function Add-MingwToPathIfAvailable {
  $wingetMingw = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
  if (Test-Path $wingetMingw) {
    $env:PATH = "$wingetMingw;$env:PATH"
  }
}

function Ensure-SpaceSafeJunction([string]$sourcePath) {
  $junctionPath = Join-Path $env:TEMP "voicewave-phaseA-nospace"
  if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq "Junction") {
      return $junctionPath
    }
    Remove-Item -LiteralPath $junctionPath -Force -Recurse
  }
  New-Item -ItemType Junction -Path $junctionPath -Target $sourcePath | Out-Null
  return $junctionPath
}

function Get-BaselineReleaseMetrics {
  $phase5Dir = Join-Path $repoRoot "docs/phase5/artifacts"
  if (-not (Test-Path $phase5Dir)) {
    return @{
      releaseToTranscribingP95Ms = 250
      tailLossCount = 0
    }
  }
  $phase5Latency = Get-ChildItem -Path $phase5Dir -Filter "latency-sweep-*.json" -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($null -eq $phase5Latency) {
    return @{
      releaseToTranscribingP95Ms = 250
      tailLossCount = 0
    }
  }
  try {
    $phase5 = Get-Content -Path $phase5Latency.FullName -Raw | ConvertFrom-Json
    return @{
      releaseToTranscribingP95Ms = [int]$phase5.releaseToTranscribingP95Ms
      tailLossCount = [int]$phase5.longUtteranceTailLossCount
    }
  }
  catch {
    return @{
      releaseToTranscribingP95Ms = 250
      tailLossCount = 0
    }
  }
}

function New-ArtifactFromLiveSweep {
  if (-not (Test-Path $artifactDir)) {
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
  }

  $today = Get-Date -Format "yyyy-MM-dd"
  $baseline = Get-BaselineReleaseMetrics
  $cargoExe = Resolve-CargoPath
  Add-MingwToPathIfAvailable
  $spaceSafeRoot = Ensure-SpaceSafeJunction $repoRoot
  $manifest = Join-Path $spaceSafeRoot "src-tauri\Cargo.toml"
  $outputPath = Join-Path $spaceSafeRoot "docs/phaseA/artifacts/cpu-latency-$today.json"

  Push-Location $spaceSafeRoot
  try {
    & $cargoExe +stable-x86_64-pc-windows-gnu run --manifest-path $manifest --bin phasea_cpu_sweep -- `
      --out $outputPath `
      --runs 10 `
      --warmup-runs 2 `
      --release-to-transcribing-p95-ms $baseline.releaseToTranscribingP95Ms `
      --tail-loss-count $baseline.tailLossCount
    if ($LASTEXITCODE -ne 0) {
      throw "live CPU sweep binary exited with code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Generated live Phase A artifact: $outputPath"
}

if ($Generate) {
  New-ArtifactFromLiveSweep
}

$artifact = Get-LatestArtifact
Add-CheckResult "CPU latency artifact present" ($null -ne $artifact) "Expected docs/phaseA/artifacts/cpu-latency-*.json"

if ($null -ne $artifact) {
  try {
    $row = Get-Content -Path $artifact.FullName -Raw | ConvertFrom-Json
    $smallP50 = [double]$row.smallEn.p50ReleaseToFinalMs
    $smallP95 = [double]$row.smallEn.p95ReleaseToFinalMs
    $releaseP95 = [double]$row.releaseToTranscribingP95Ms
    $cacheHitRatio = [double]$row.cacheHitRatio
    $decodeFailureRate = [double]$row.decodeFailureRate
    $emptyDecodeRate = [double]$row.emptyDecodeRate
    $tailLossCount = [int]$row.longUtteranceTailLossCount

    Add-CheckResult "small.en p50 <= 4000ms" ($smallP50 -le 4000.0) "smallEn.p50ReleaseToFinalMs=$smallP50"
    Add-CheckResult "small.en p95 <= 5000ms" ($smallP95 -le 5000.0) "smallEn.p95ReleaseToFinalMs=$smallP95"
    Add-CheckResult "release-to-transcribing p95 <= 250ms" ($releaseP95 -le 250.0) "releaseToTranscribingP95Ms=$releaseP95"
    Add-CheckResult "runtime cache hit ratio >= 0.70" ($cacheHitRatio -ge 0.70) "cacheHitRatio=$cacheHitRatio"
    Add-CheckResult "decode failure rate <= 0.05" ($decodeFailureRate -le 0.05) "decodeFailureRate=$decodeFailureRate"
    Add-CheckResult "empty decode rate <= 0.05" ($emptyDecodeRate -le 0.05) "emptyDecodeRate=$emptyDecodeRate"
    Add-CheckResult "long utterance tail loss is zero" ($tailLossCount -eq 0) "longUtteranceTailLossCount=$tailLossCount"
  }
  catch {
    Add-CheckResult "CPU latency artifact parse" $false $_.Exception.Message
  }
}

Write-Host ""
Write-Host "Phase A CPU Latency Report"
Write-Host "--------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "Phase A CPU latency checks have $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message Run with -Enforce to make this gate-blocking."
}
else {
  Write-Host "Phase A CPU latency checks passed."
}
