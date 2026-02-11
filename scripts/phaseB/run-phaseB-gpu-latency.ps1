param(
  [switch]$Generate,
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactDir = Join-Path $repoRoot "docs/phaseB/artifacts"
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
    Get-ChildItem -Path $artifactDir -Filter "gpu-latency-*.json" -File |
      Sort-Object LastWriteTimeUtc -Descending
  )
  if ($matches.Count -eq 0) {
    return $null
  }
  return $matches[0]
}

function Get-LatestCpuArtifact {
  $cpuDir = Join-Path $repoRoot "docs/phaseA/artifacts"
  if (-not (Test-Path $cpuDir)) {
    return $null
  }
  $matches = @(
    Get-ChildItem -Path $cpuDir -Filter "cpu-latency-*.json" -File |
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
  $junctionPath = Join-Path $env:TEMP "voicewave-phaseB-nospace"
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

function Resolve-CudaRoot {
  if ($env:CUDA_PATH -and (Test-Path $env:CUDA_PATH)) {
    return $env:CUDA_PATH
  }

  $defaultRoot = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA"
  if (-not (Test-Path $defaultRoot)) {
    return $null
  }

  $versions = Get-ChildItem -Path $defaultRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending
  if ($versions.Count -eq 0) {
    return $null
  }
  return $versions[0].FullName
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

function New-GpuArtifactFromLiveSweep {
  if (-not (Test-Path $artifactDir)) {
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
  }

  $cudaRoot = Resolve-CudaRoot
  if (-not $cudaRoot) {
    throw "CUDA toolkit path not found. Install CUDA toolkit and set CUDA_PATH."
  }

  $nvccPath = Join-Path $cudaRoot "bin\nvcc.exe"
  if (-not (Test-Path $nvccPath)) {
    throw "nvcc not found at '$nvccPath'. Install full CUDA toolkit."
  }

  $cudaLibPath = Join-Path $cudaRoot "lib\x64"
  foreach ($lib in @("cudart.lib", "cublas.lib", "cublasLt.lib")) {
    if (-not (Test-Path (Join-Path $cudaLibPath $lib))) {
      throw "required CUDA library missing: $lib"
    }
  }

  $today = Get-Date -Format "yyyy-MM-dd"
  $baseline = Get-BaselineReleaseMetrics
  $cargoExe = Resolve-CargoPath
  Add-MingwToPathIfAvailable
  $spaceSafeRoot = Ensure-SpaceSafeJunction $repoRoot
  $manifest = Join-Path $spaceSafeRoot "src-tauri\Cargo.toml"
  $outputPath = Join-Path $spaceSafeRoot "docs/phaseB/artifacts/gpu-latency-$today.json"

  $env:CUDA_PATH = $cudaRoot
  $env:VOICEWAVE_FORCE_GPU = "1"
  $env:VOICEWAVE_AUTO_GPU = "1"
  $env:VOICEWAVE_FORCE_CPU = "0"

  Push-Location $spaceSafeRoot
  try {
    & $cargoExe +stable-x86_64-pc-windows-gnu run --manifest-path $manifest --features whisper-cuda --bin phasea_cpu_sweep -- `
      --out $outputPath `
      --runs 10 `
      --warmup-runs 2 `
      --release-to-transcribing-p95-ms $baseline.releaseToTranscribingP95Ms `
      --tail-loss-count $baseline.tailLossCount
    if ($LASTEXITCODE -ne 0) {
      throw "GPU live sweep binary exited with code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Generated Phase B GPU artifact: $outputPath"
}

if ($Generate) {
  New-GpuArtifactFromLiveSweep
}

$artifact = Get-LatestArtifact
Add-CheckResult "GPU latency artifact present" ($null -ne $artifact) "Expected docs/phaseB/artifacts/gpu-latency-*.json"

$cpuArtifact = Get-LatestCpuArtifact
Add-CheckResult "CPU baseline artifact present" ($null -ne $cpuArtifact) "Expected docs/phaseA/artifacts/cpu-latency-*.json"

if ($null -ne $artifact) {
  try {
    $row = Get-Content -Path $artifact.FullName -Raw | ConvertFrom-Json
    $smallP50 = [double]$row.smallEn.p50ReleaseToFinalMs
    $smallP95 = [double]$row.smallEn.p95ReleaseToFinalMs
    $releaseP95 = [double]$row.releaseToTranscribingP95Ms
    $smallModel = $row.models | Where-Object { $_.modelId -eq "small.en" } | Select-Object -First 1
    $usedCudaRatio = [double]$smallModel.usedCudaRatio

    Add-CheckResult "release-to-transcribing p95 <= 250ms" ($releaseP95 -le 250.0) "releaseToTranscribingP95Ms=$releaseP95"
    Add-CheckResult "small.en p50 <= 4000ms" ($smallP50 -le 4000.0) "smallEn.p50ReleaseToFinalMs=$smallP50"
    Add-CheckResult "small.en p95 <= 5000ms" ($smallP95 -le 5000.0) "smallEn.p95ReleaseToFinalMs=$smallP95"
    Add-CheckResult "small.en CUDA used ratio > 0" ($usedCudaRatio -gt 0.0) "smallEn.usedCudaRatio=$usedCudaRatio"

    if ($null -ne $cpuArtifact) {
      $cpu = Get-Content -Path $cpuArtifact.FullName -Raw | ConvertFrom-Json
      $cpuSmallP95 = [double]$cpu.smallEn.p95ReleaseToFinalMs
      $deltaMs = $cpuSmallP95 - $smallP95
      Add-CheckResult "small.en p95 improved vs CPU baseline" ($deltaMs -gt 0.0) "cpuP95=$cpuSmallP95 gpuP95=$smallP95 deltaMs=$deltaMs"
    }
  }
  catch {
    Add-CheckResult "GPU artifact parse" $false $_.Exception.Message
  }
}

Write-Host ""
Write-Host "Phase B GPU Latency Report"
Write-Host "--------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "Phase B GPU latency checks have $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message Run with -Enforce to make this gate-blocking."
}
else {
  Write-Host "Phase B GPU latency checks passed."
}
