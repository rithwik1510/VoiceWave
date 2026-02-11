param(
  [switch]$Enforce,
  [switch]$SkipPhase4Prep
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
  param([string]$RelativePath)

  $fullPath = Join-Path $repoRoot $RelativePath
  $exists = Test-Path $fullPath
  Add-CheckResult "File exists: $RelativePath" $exists $fullPath
}

function Test-DocumentMarker {
  param(
    [string]$RelativePath,
    [string]$Pattern,
    [string]$Label
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path $fullPath)) {
    Add-CheckResult $Label $false "Missing file."
    return
  }

  $raw = Get-Content -Path $fullPath -Raw
  $matched = $raw -match $Pattern
  Add-CheckResult $Label $matched "Pattern: $Pattern"
}

if (-not $SkipPhase4Prep) {
  Push-Location $repoRoot
  try {
    $phase4Args = @(
      "-ExecutionPolicy", "Bypass",
      "-File", ".\scripts\phase4\run-phase4-readiness.ps1",
      "-SkipValidation"
    )
    if ($Enforce) {
      $phase4Args += "-Enforce"
    }
    & powershell @phase4Args
    Add-CheckResult "Phase 4 prep script ran" ($LASTEXITCODE -eq 0) "Executed phase4 readiness precheck."
  }
  catch {
    Add-CheckResult "Phase 4 prep script ran" $false $_.Exception.Message
  }
  finally {
    Pop-Location
  }
}
else {
  Add-CheckResult "Phase 4 prep script ran" $true "Skipped by -SkipPhase4Prep."
}

Test-FileExists "docs/PHASE5_READINESS.md"
Test-FileExists "docs/phase5/beta-ops-runbook.md"
Test-FileExists "docs/phase5/reliability-review-template.md"
Test-FileExists "docs/phase5/compatibility-matrix-template.md"
Test-FileExists "docs/phase5/usability-study-template.md"

Test-DocumentMarker "docs/phase5/beta-ops-runbook.md" "Owner:\s*\S+" "Beta runbook owner present"
Test-DocumentMarker "docs/phase5/beta-ops-runbook.md" "Escalation" "Beta runbook escalation section present"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Notepad" "Compatibility matrix includes Notepad"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "VS Code" "Compatibility matrix includes VS Code"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Browser" "Compatibility matrix includes browser flow"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "Insertion success" "Reliability review tracks insertion success"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "Correction rate" "Reliability review tracks correction rate"

Write-Host ""
Write-Host "Phase 5 Readiness Report"
Write-Host "------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "Phase 5 readiness has $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message Run with -Enforce to make this gate-blocking."
}
else {
  Write-Host "Phase 5 readiness checks passed."
}
