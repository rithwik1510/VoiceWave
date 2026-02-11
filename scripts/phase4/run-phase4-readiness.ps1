param(
  [switch]$SkipValidation,
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
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

function Test-FileExists {
  param(
    [string]$RelativePath
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  $exists = Test-Path $fullPath
  Add-CheckResult "File exists: $RelativePath" $exists $fullPath
}

function Get-LatestManualAcceptanceArtifact {
  $artifactDir = Join-Path $repoRoot "docs/phase3/artifacts"
  if (-not (Test-Path $artifactDir)) {
    return $null
  }

  $candidates = @(
    Get-ChildItem -Path $artifactDir -Filter "windows-manual-acceptance-*.md" -File |
      Sort-Object LastWriteTimeUtc -Descending
  )

  if ($candidates.Count -eq 0) {
    return $null
  }

  return $candidates[0]
}

function Test-CompleteMarker {
  param(
    [string]$RelativePath
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path $fullPath)) {
    Add-CheckResult "Evidence complete: $RelativePath" $false "Missing file."
    return
  }

  $raw = Get-Content -Path $fullPath -Raw
  $complete = $raw -match "(?m)^Status:\s*Complete\s*$"
  Add-CheckResult "Evidence complete: $RelativePath" $complete "Requires `Status: Complete` marker."
}

function Test-CompleteMarkerRaw {
  param(
    [string]$FullPath
  )

  if (-not (Test-Path $FullPath)) {
    return $false
  }

  $raw = Get-Content -Path $FullPath -Raw
  return ($raw -match "(?m)^Status:\s*Complete\s*$")
}

if (-not $SkipValidation) {
  Push-Location $repoRoot
  try {
    npm run phase3:validate
    Add-CheckResult "Baseline validation bundle" ($LASTEXITCODE -eq 0) "Runs test/build/desktop compile validation."
  }
  catch {
    Add-CheckResult "Baseline validation bundle" $false $_.Exception.Message
  }
  finally {
    Pop-Location
  }
}
else {
  Add-CheckResult "Baseline validation bundle" $true "Skipped by -SkipValidation."
}

Test-FileExists "docs/PHASE4_READINESS.md"
Test-FileExists "docs/security/threat-model-v1.md"
Test-FileExists "docs/risk/risk-register.md"
Test-FileExists "docs/testing/test-strategy.md"
Test-FileExists "docs/testing/hardware-tiers.md"

$manualArtifact = Get-LatestManualAcceptanceArtifact
if ($null -eq $manualArtifact) {
  Add-CheckResult "Manual acceptance artifact present" $false "Expected docs/phase3/artifacts/windows-manual-acceptance-*.md"
}
else {
  Add-CheckResult "Manual acceptance artifact present" $true $manualArtifact.FullName
}

try {
  $batteryPath = Join-Path $repoRoot "docs/phase1/phase1-battery-thermal-windows.json"
  $batteryDefermentPath = Join-Path $repoRoot "docs/phase4/evidence/battery-deferment.md"
  if (-not (Test-Path $batteryPath)) {
    Add-CheckResult "Battery evidence >= 30 minutes" $false "Missing docs/phase1/phase1-battery-thermal-windows.json"
  }
  else {
    $battery = Get-Content -Path $batteryPath -Raw | ConvertFrom-Json
    $duration = [double]$battery.duration_minutes
    $ok = $duration -ge 30.0
    if ($ok) {
      Add-CheckResult "Battery evidence >= 30 minutes" $true "duration_minutes=$duration"
    }
    else {
      $deferred = Test-CompleteMarkerRaw -FullPath $batteryDefermentPath
      if ($deferred) {
        Add-CheckResult "Battery evidence >= 30 minutes" $true "Deferred by approved marker in docs/phase4/evidence/battery-deferment.md (current duration_minutes=$duration)"
      }
      else {
        Add-CheckResult "Battery evidence >= 30 minutes" $false "duration_minutes=$duration"
      }
    }
  }
}
catch {
  Add-CheckResult "Battery evidence >= 30 minutes" $false $_.Exception.Message
}

try {
  if ($null -eq $manualArtifact) {
    Add-CheckResult "Manual acceptance recorded" $false "Missing windows manual acceptance artifact."
  }
  else {
    $manualRaw = Get-Content -Path $manualArtifact.FullName -Raw
    $hasPassMarker = $manualRaw -imatch "(?m)^\s*\d+\..*:\s*\[x\]\s*pass\b"
    Add-CheckResult "Manual acceptance recorded" $hasPassMarker "File: $($manualArtifact.Name). Requires at least one checklist row marked `[x] pass`."
  }
}
catch {
  Add-CheckResult "Manual acceptance recorded" $false $_.Exception.Message
}

Test-CompleteMarker "docs/phase4/evidence/global-hotkey-windows.md"
Test-CompleteMarker "docs/phase4/evidence/update-signing-verification.md"
Test-CompleteMarker "docs/phase4/evidence/rollback-drill.md"

Write-Host ""
Write-Host "Phase 4 Readiness Report"
Write-Host "------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "Phase 4 readiness has $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message Run with -Enforce to make this gate-blocking."
}
else {
  Write-Host "Phase 4 readiness checks passed."
}
