param(
  [switch]$Enforce,
  [switch]$SkipPhase4Prep,
  [switch]$RequireFreshArtifacts,
  [datetime]$ReleaseCandidateDate = (Get-Date)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$checks = New-Object System.Collections.Generic.List[object]
$failedChecks = 0

if ($Enforce -and -not $PSBoundParameters.ContainsKey("RequireFreshArtifacts")) {
  $RequireFreshArtifacts = $true
}

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

function Get-ReleaseThresholds {
  $thresholdPath = Join-Path $repoRoot "docs/testing/release-thresholds-windows.json"
  if (-not (Test-Path $thresholdPath)) {
    Add-CheckResult "Release thresholds config present" $false "Missing docs/testing/release-thresholds-windows.json"
    return $null
  }

  try {
    $config = Get-Content -Path $thresholdPath -Raw | ConvertFrom-Json
    Add-CheckResult "Release thresholds config present" $true $thresholdPath
    return $config
  }
  catch {
    Add-CheckResult "Release thresholds config parse" $false $_.Exception.Message
    return $null
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

function Get-LatestArtifact {
  param(
    [string]$RelativeDirectory,
    [string]$Pattern
  )

  $directory = Join-Path $repoRoot $RelativeDirectory
  if (-not (Test-Path $directory)) {
    return $null
  }

  $matches = @(
    Get-ChildItem -Path $directory -Filter $Pattern -File |
      Sort-Object LastWriteTimeUtc -Descending
  )
  if ($matches.Count -eq 0) {
    return $null
  }

  return $matches[0]
}

function Test-ArtifactFreshness {
  param(
    [string]$Label,
    [System.IO.FileInfo]$Artifact,
    [int]$MaxAgeDays,
    [datetime]$ReferenceDate
  )

  if ($null -eq $Artifact) {
    Add-CheckResult $Label $false "Artifact not found."
    return
  }

  $ageDays = ($ReferenceDate.ToUniversalTime() - $Artifact.LastWriteTimeUtc).TotalDays
  $isFresh = $ageDays -le $MaxAgeDays
  $detail = "$($Artifact.FullName) | age_days=$([math]::Round($ageDays, 2)) | reference_date=$($ReferenceDate.ToString('yyyy-MM-dd')) | max_age_days=$MaxAgeDays"
  Add-CheckResult $Label $isFresh $detail
}

function Test-PathFreshness {
  param(
    [string]$Label,
    [string]$RelativePath,
    [int]$MaxAgeDays,
    [datetime]$ReferenceDate
  )

  $fullPath = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path $fullPath)) {
    Add-CheckResult $Label $false "Missing $RelativePath"
    return
  }

  $item = Get-Item -Path $fullPath
  $ageDays = ($ReferenceDate.ToUniversalTime() - $item.LastWriteTimeUtc).TotalDays
  $isFresh = $ageDays -le $MaxAgeDays
  $detail = "$($item.FullName) | age_days=$([math]::Round($ageDays, 2)) | reference_date=$($ReferenceDate.ToString('yyyy-MM-dd')) | max_age_days=$MaxAgeDays"
  Add-CheckResult $Label $isFresh $detail
}

$thresholds = Get-ReleaseThresholds

if (-not $SkipPhase4Prep) {
  Push-Location $repoRoot
  try {
    $phase4Args = @(
      "-ExecutionPolicy", "Bypass",
      "-File", ".\scripts\phase4\run-phase4-readiness.ps1"
    )

    if ($Enforce) {
      $phase4Args += "-Enforce"
    }
    else {
      $phase4Args += "-SkipValidation"
    }

    & powershell @phase4Args
    Add-CheckResult "Phase 4 readiness dependency passed" ($LASTEXITCODE -eq 0) "Executed phase4 readiness with enforce_mode=$Enforce."
  }
  catch {
    Add-CheckResult "Phase 4 readiness dependency passed" $false $_.Exception.Message
  }
  finally {
    Pop-Location
  }
}
else {
  Add-CheckResult "Phase 4 readiness dependency passed" $true "Skipped by -SkipPhase4Prep."
}

Test-FileExists "docs/PHASE5_READINESS.md"
Test-FileExists "docs/phase5/beta-ops-runbook.md"
Test-FileExists "docs/phase5/reliability-review-template.md"
Test-FileExists "docs/phase5/compatibility-matrix-template.md"
Test-FileExists "docs/phase5/usability-study-template.md"

Test-DocumentMarker "docs/phase5/beta-ops-runbook.md" "Owner:\s*\S+" "Beta runbook owner present"
Test-DocumentMarker "docs/phase5/beta-ops-runbook.md" "Escalation" "Beta runbook escalation section present"
Test-DocumentMarker "docs/phase5/beta-ops-runbook.md" "Rollback triggers" "Beta runbook rollback triggers section present"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Notepad" "Compatibility matrix includes Notepad"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "VS Code" "Compatibility matrix includes VS Code"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Browser" "Compatibility matrix includes browser flow"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Slack" "Compatibility matrix includes Slack"
Test-DocumentMarker "docs/phase5/compatibility-matrix-template.md" "Notion" "Compatibility matrix includes Notion"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "Insertion success" "Reliability review tracks insertion success"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "Correction rate" "Reliability review tracks correction rate"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "Crash-free sessions" "Reliability review tracks crash-free sessions"
Test-DocumentMarker "docs/phase5/reliability-review-template.md" "TTFSD" "Reliability review tracks TTFSD"

if ($RequireFreshArtifacts) {
  $maxAgeDays = 7
  if ($null -ne $thresholds) {
    try {
      $maxAgeDays = [int]$thresholds.freshness.maxArtifactAgeDays
    }
    catch {
      Add-CheckResult "Freshness threshold parse" $false $_.Exception.Message
    }
  }

  $latestManual = Get-LatestArtifact -RelativeDirectory "docs/phase3/artifacts" -Pattern "windows-manual-acceptance-*.md"
  Test-ArtifactFreshness "Fresh artifact: phase3 manual acceptance <= $maxAgeDays days" $latestManual $maxAgeDays $ReleaseCandidateDate

  $latestPhase4Hotkey = Get-LatestArtifact -RelativeDirectory "docs/phase4/artifacts" -Pattern "global-hotkey-runtime-smoke-*.log"
  Test-ArtifactFreshness "Fresh artifact: phase4 hotkey smoke <= $maxAgeDays days" $latestPhase4Hotkey $maxAgeDays $ReleaseCandidateDate

  $latestPhase4Signing = Get-LatestArtifact -RelativeDirectory "docs/phase4/artifacts" -Pattern "update-signing-tests-*.log"
  Test-ArtifactFreshness "Fresh artifact: phase4 signing checks <= $maxAgeDays days" $latestPhase4Signing $maxAgeDays $ReleaseCandidateDate

  $latestPhase4Rollback = Get-LatestArtifact -RelativeDirectory "docs/phase4/artifacts" -Pattern "rollback-drill-*.md"
  Test-ArtifactFreshness "Fresh artifact: phase4 rollback drill <= $maxAgeDays days" $latestPhase4Rollback $maxAgeDays $ReleaseCandidateDate

  $latestPhase5Compatibility = Get-LatestArtifact -RelativeDirectory "docs/phase5/artifacts" -Pattern "compatibility-matrix-*.md"
  Test-ArtifactFreshness "Fresh artifact: phase5 compatibility matrix <= $maxAgeDays days" $latestPhase5Compatibility $maxAgeDays $ReleaseCandidateDate

  $latestPhase5Reliability = Get-LatestArtifact -RelativeDirectory "docs/phase5/artifacts" -Pattern "reliability-review-*.md"
  Test-ArtifactFreshness "Fresh artifact: phase5 reliability review <= $maxAgeDays days" $latestPhase5Reliability $maxAgeDays $ReleaseCandidateDate

  $latestPhase5Usability = Get-LatestArtifact -RelativeDirectory "docs/phase5/artifacts" -Pattern "usability-study-*.md"
  Test-ArtifactFreshness "Fresh artifact: phase5 usability study <= $maxAgeDays days" $latestPhase5Usability $maxAgeDays $ReleaseCandidateDate

  $latestPhase5Latency = Get-LatestArtifact -RelativeDirectory "docs/phase5/artifacts" -Pattern "latency-sweep-*.json"
  Test-ArtifactFreshness "Fresh artifact: phase5 latency sweep <= $maxAgeDays days" $latestPhase5Latency $maxAgeDays $ReleaseCandidateDate

  Test-PathFreshness "Fresh artifact: phase1 battery evidence <= $maxAgeDays days" "docs/phase1/phase1-battery-thermal-windows.json" $maxAgeDays $ReleaseCandidateDate
}
else {
  Add-CheckResult "Artifact freshness policy" $true "Freshness checks skipped (RequireFreshArtifacts is false)."
}

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
