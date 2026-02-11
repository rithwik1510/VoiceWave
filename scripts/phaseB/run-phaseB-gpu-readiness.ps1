param(
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

function Get-NvidiaSmiPath {
  $command = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
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

function Resolve-NvccPath([string]$cudaRoot) {
  if ($cudaRoot) {
    $candidate = Join-Path $cudaRoot "bin\nvcc.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $command = Get-Command nvcc -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Resolve-CudaLibPath([string]$cudaRoot) {
  if (-not $cudaRoot) {
    return $null
  }
  $libPath = Join-Path $cudaRoot "lib\x64"
  if (Test-Path $libPath) {
    return $libPath
  }
  return $null
}

function Test-CudaRuntimeLibs([string]$cudaLibPath) {
  if (-not $cudaLibPath) {
    return $false
  }
  $required = @("cudart.lib", "cublas.lib", "cublasLt.lib")
  foreach ($lib in $required) {
    if (-not (Test-Path (Join-Path $cudaLibPath $lib))) {
      return $false
    }
  }
  return $true
}

$nvidiaSmiPath = Get-NvidiaSmiPath
$nvidiaDetail = "nvidia-smi not found"
if ($nvidiaSmiPath) {
  $nvidiaDetail = $nvidiaSmiPath
}
Add-CheckResult "NVIDIA driver/GPU available" ($null -ne $nvidiaSmiPath) $nvidiaDetail

if ($nvidiaSmiPath) {
  $gpuSummary = & $nvidiaSmiPath --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>$null
  Add-CheckResult "GPU query succeeds" ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gpuSummary)) ($gpuSummary -join "; ")
}
else {
  Add-CheckResult "GPU query succeeds" $false "nvidia-smi unavailable"
}

$cudaRoot = Resolve-CudaRoot
$cudaRootDetail = "CUDA_PATH unset and default CUDA install not found"
if ($cudaRoot) {
  $cudaRootDetail = $cudaRoot
}
Add-CheckResult "CUDA toolkit root resolved" ($null -ne $cudaRoot) $cudaRootDetail

$nvccPath = Resolve-NvccPath $cudaRoot
$nvccDetail = "nvcc.exe not found"
if ($nvccPath) {
  $nvccDetail = $nvccPath
}
Add-CheckResult "nvcc compiler available" ($null -ne $nvccPath) $nvccDetail

$cudaLibPath = Resolve-CudaLibPath $cudaRoot
$cudaLibPathDetail = "missing <CUDA_ROOT>\\lib\\x64"
if ($cudaLibPath) {
  $cudaLibPathDetail = $cudaLibPath
}
Add-CheckResult "CUDA lib path available" ($null -ne $cudaLibPath) $cudaLibPathDetail

$cudaLibsReady = Test-CudaRuntimeLibs $cudaLibPath
$cudaLibsDetail = "missing one or more required CUDA libs"
if ($cudaLibsReady) {
  $cudaLibsDetail = "cudart/cublas/cublasLt present"
}
Add-CheckResult "Required CUDA link libs available" $cudaLibsReady $cudaLibsDetail

Write-Host ""
Write-Host "Phase B GPU Readiness Report"
Write-Host "----------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "GPU readiness has $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message"
}
else {
  Write-Host "GPU readiness checks passed."
}
