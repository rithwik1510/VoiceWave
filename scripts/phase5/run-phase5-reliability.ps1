param(
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

function Get-LatestArtifact {
  param([string]$Pattern)

  $artifactDir = Join-Path $repoRoot "docs/phase5/artifacts"
  if (-not (Test-Path $artifactDir)) {
    return $null
  }

  $matches = @(
    Get-ChildItem -Path $artifactDir -Filter $Pattern -File |
      Sort-Object LastWriteTimeUtc -Descending
  )

  if ($matches.Count -eq 0) {
    return $null
  }
  return $matches[0]
}

$latencyArtifact = Get-LatestArtifact "latency-sweep-*.json"
$compatArtifact = Get-LatestArtifact "compatibility-matrix-*.md"
$reliabilityArtifact = Get-LatestArtifact "reliability-review-*.md"
$usabilityArtifact = Get-LatestArtifact "usability-study-*.md"

Add-CheckResult "Latency sweep artifact present" ($null -ne $latencyArtifact) "Expected docs/phase5/artifacts/latency-sweep-*.json"
Add-CheckResult "Compatibility matrix artifact present" ($null -ne $compatArtifact) "Expected docs/phase5/artifacts/compatibility-matrix-*.md"
Add-CheckResult "Reliability review artifact present" ($null -ne $reliabilityArtifact) "Expected docs/phase5/artifacts/reliability-review-*.md"
Add-CheckResult "Usability study artifact present" ($null -ne $usabilityArtifact) "Expected docs/phase5/artifacts/usability-study-*.md"

if ($null -ne $latencyArtifact) {
  try {
    $latency = Get-Content -Path $latencyArtifact.FullName -Raw | ConvertFrom-Json
    $releaseP95 = [double]$latency.releaseToTranscribingP95Ms
    Add-CheckResult "Release-to-transcribing p95 <= 300 ms" ($releaseP95 -le 300.0) "releaseToTranscribingP95Ms=$releaseP95"

    $tailLossCount = [int]$latency.longUtteranceTailLossCount
    Add-CheckResult "Long-utterance tail loss count is zero" ($tailLossCount -eq 0) "longUtteranceTailLossCount=$tailLossCount"

    $tiny = $latency.models | Where-Object { $_.modelId -eq "tiny.en" } | Select-Object -First 1
    $small = $latency.models | Where-Object { $_.modelId -eq "small.en" } | Select-Object -First 1
    Add-CheckResult "tiny.en model row present" ($null -ne $tiny) "latency models must include tiny.en"
    Add-CheckResult "small.en model row present" ($null -ne $small) "latency models must include small.en"

    if ($null -ne $tiny) {
      $tinyP95 = [double]$tiny.p95ReleaseToFinalMs
      Add-CheckResult "tiny.en release-to-final p95 <= 3000 ms" ($tinyP95 -le 3000.0) "tiny.en p95ReleaseToFinalMs=$tinyP95"
    }
    if ($null -ne $small) {
      $smallP95 = [double]$small.p95ReleaseToFinalMs
      Add-CheckResult "small.en release-to-final p95 <= 6000 ms" ($smallP95 -le 6000.0) "small.en p95ReleaseToFinalMs=$smallP95"
    }
  }
  catch {
    Add-CheckResult "Latency sweep artifact parse" $false $_.Exception.Message
  }
}

if ($null -ne $compatArtifact) {
  try {
    $compatRaw = Get-Content -Path $compatArtifact.FullName -Raw
    $match = [regex]::Match($compatRaw, "(?im)^Insertion Success Rate \(%\):\s*([0-9]+(?:\.[0-9]+)?)\s*$")
    if (-not $match.Success) {
      Add-CheckResult "Insertion success metric present in compatibility artifact" $false "Expected line: Insertion Success Rate (%): <value>"
    }
    else {
      $value = [double]$match.Groups[1].Value
      Add-CheckResult "Insertion success >= 97.0%" ($value -ge 97.0) "Insertion Success Rate (%)=$value"
    }
  }
  catch {
    Add-CheckResult "Compatibility artifact parse" $false $_.Exception.Message
  }
}

if ($null -ne $reliabilityArtifact) {
  try {
    $reliabilityRaw = Get-Content -Path $reliabilityArtifact.FullName -Raw
    $match = [regex]::Match($reliabilityRaw, "(?im)^Correction rate \(%\):\s*([0-9]+(?:\.[0-9]+)?)\s*$")
    if (-not $match.Success) {
      Add-CheckResult "Correction rate metric present in reliability artifact" $false "Expected line: Correction rate (%): <value>"
    }
    else {
      $value = [double]$match.Groups[1].Value
      Add-CheckResult "Correction rate <= 15.0%" ($value -le 15.0) "Correction rate (%)=$value"
    }
  }
  catch {
    Add-CheckResult "Reliability artifact parse" $false $_.Exception.Message
  }
}

if ($null -ne $usabilityArtifact) {
  try {
    $usabilityRaw = Get-Content -Path $usabilityArtifact.FullName -Raw
    $hasParticipants = $usabilityRaw -match "(?im)^Participants:\s*.+$"
    $hasFriction = $usabilityRaw -match "(?im)^Top friction in push-to-talk flow:\s*.+$"
    Add-CheckResult "Usability study participants captured" $hasParticipants "Requires Participants line."
    Add-CheckResult "Usability study push-to-talk friction captured" $hasFriction "Requires Top friction in push-to-talk flow line."
  }
  catch {
    Add-CheckResult "Usability artifact parse" $false $_.Exception.Message
  }
}

Write-Host ""
Write-Host "Phase 5 Reliability Report"
Write-Host "--------------------------"
$checks | Format-Table -AutoSize | Out-String | Write-Host

if ($failedChecks -gt 0) {
  $message = "Phase 5 reliability checks have $failedChecks failed check(s)."
  if ($Enforce) {
    throw $message
  }
  Write-Warning "$message Run with -Enforce to make this gate-blocking."
}
else {
  Write-Host "Phase 5 reliability checks passed."
}
