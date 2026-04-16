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

function Get-NumericMetricFromMarkdown {
  param(
    [string]$Raw,
    [string]$MetricLabel
  )

  $pattern = "(?im)^$([regex]::Escape($MetricLabel)):\s*([0-9]+(?:\.[0-9]+)?)\s*$"
  $match = [regex]::Match($Raw, $pattern)
  if (-not $match.Success) {
    return $null
  }
  return [double]$match.Groups[1].Value
}

$thresholds = Get-ReleaseThresholds

$latencyArtifact = Get-LatestArtifact "latency-sweep-*.json"
$compatArtifact = Get-LatestArtifact "compatibility-matrix-*.md"
$reliabilityArtifact = Get-LatestArtifact "reliability-review-*.md"
$reliabilityMetricsJson = Get-LatestArtifact "reliability-metrics-*.json"
$usabilityArtifact = Get-LatestArtifact "usability-study-*.md"

Add-CheckResult "Latency sweep artifact present" ($null -ne $latencyArtifact) "Expected docs/phase5/artifacts/latency-sweep-*.json"
Add-CheckResult "Compatibility matrix artifact present" ($null -ne $compatArtifact) "Expected docs/phase5/artifacts/compatibility-matrix-*.md"
Add-CheckResult "Reliability review artifact present" ($null -ne $reliabilityArtifact) "Expected docs/phase5/artifacts/reliability-review-*.md"
Add-CheckResult "Usability study artifact present" ($null -ne $usabilityArtifact) "Expected docs/phase5/artifacts/usability-study-*.md"
Add-CheckResult "Optional reliability metrics JSON mirror found" $true $(if ($null -ne $reliabilityMetricsJson) { $reliabilityMetricsJson.FullName } else { "Missing optional docs/phase5/artifacts/reliability-metrics-*.json" })

if (($null -ne $latencyArtifact) -and ($null -ne $thresholds)) {
  try {
    $latency = Get-Content -Path $latencyArtifact.FullName -Raw | ConvertFrom-Json

    $releaseP95 = [double]$latency.releaseToTranscribingP95Ms
    $releaseP95Max = [double]$thresholds.latency.releaseToTranscribingP95MsMax
    Add-CheckResult "Release-to-transcribing p95 <= $releaseP95Max ms" ($releaseP95 -le $releaseP95Max) "releaseToTranscribingP95Ms=$releaseP95"

    $tailLossCount = [int]$latency.longUtteranceTailLossCount
    $tailLossCountMax = [int]$thresholds.latency.longUtteranceTailLossCountMax
    Add-CheckResult "Long-utterance tail loss count <= $tailLossCountMax" ($tailLossCount -le $tailLossCountMax) "longUtteranceTailLossCount=$tailLossCount"

    $tinyModelId = [string]$thresholds.latency.tinyModelId
    $smallModelId = [string]$thresholds.latency.smallModelId
    $tiny = $latency.models | Where-Object { $_.modelId -eq $tinyModelId } | Select-Object -First 1
    $small = $latency.models | Where-Object { $_.modelId -eq $smallModelId } | Select-Object -First 1

    Add-CheckResult "$tinyModelId model row present" ($null -ne $tiny) "latency models must include $tinyModelId"
    Add-CheckResult "$smallModelId model row present" ($null -ne $small) "latency models must include $smallModelId"

    if ($null -ne $tiny) {
      $tinyP95 = [double]$tiny.p95ReleaseToFinalMs
      $tinyP95Max = [double]$thresholds.latency.tinyModelReleaseToFinalP95MsMax
      Add-CheckResult "$tinyModelId release-to-final p95 <= $tinyP95Max ms" ($tinyP95 -le $tinyP95Max) "$tinyModelId p95ReleaseToFinalMs=$tinyP95"
    }

    if ($null -ne $small) {
      $smallP95 = [double]$small.p95ReleaseToFinalMs
      $smallP95Max = [double]$thresholds.latency.smallModelReleaseToFinalP95MsMax
      Add-CheckResult "$smallModelId release-to-final p95 <= $smallP95Max ms" ($smallP95 -le $smallP95Max) "$smallModelId p95ReleaseToFinalMs=$smallP95"
    }
  }
  catch {
    Add-CheckResult "Latency sweep artifact parse" $false $_.Exception.Message
  }
}

if (($null -ne $compatArtifact) -and ($null -ne $thresholds)) {
  try {
    $compatRaw = Get-Content -Path $compatArtifact.FullName -Raw
    $insertion = Get-NumericMetricFromMarkdown -Raw $compatRaw -MetricLabel "Insertion Success Rate (%)"
    if ($null -eq $insertion) {
      Add-CheckResult "Insertion success metric present in compatibility artifact" $false "Expected line: Insertion Success Rate (%): <value>"
    }
    else {
      $insertionMin = [double]$thresholds.reliability.insertionSuccessMinPercent
      Add-CheckResult "Insertion success >= $insertionMin%" ($insertion -ge $insertionMin) "Insertion Success Rate (%)=$insertion"
    }
  }
  catch {
    Add-CheckResult "Compatibility artifact parse" $false $_.Exception.Message
  }
}

if (($null -ne $reliabilityArtifact) -and ($null -ne $thresholds)) {
  try {
    $reliabilityRaw = Get-Content -Path $reliabilityArtifact.FullName -Raw

    $correction = Get-NumericMetricFromMarkdown -Raw $reliabilityRaw -MetricLabel "Correction rate (%)"
    if ($null -eq $correction) {
      Add-CheckResult "Correction rate metric present in reliability artifact" $false "Expected line: Correction rate (%): <value>"
    }
    else {
      $correctionMax = [double]$thresholds.reliability.correctionRateMaxPercent
      Add-CheckResult "Correction rate <= $correctionMax%" ($correction -le $correctionMax) "Correction rate (%)=$correction"
    }

    $crashFree = Get-NumericMetricFromMarkdown -Raw $reliabilityRaw -MetricLabel "Crash-free sessions (%)"
    if ($null -eq $crashFree) {
      Add-CheckResult "Crash-free sessions metric present in reliability artifact" $false "Expected line: Crash-free sessions (%): <value>"
    }
    else {
      $crashFreeMin = [double]$thresholds.reliability.crashFreeSessionsMinPercent
      Add-CheckResult "Crash-free sessions >= $crashFreeMin%" ($crashFree -ge $crashFreeMin) "Crash-free sessions (%)=$crashFree"
    }

    $ttfsd = Get-NumericMetricFromMarkdown -Raw $reliabilityRaw -MetricLabel "TTFSD (minutes)"
    if ($null -eq $ttfsd) {
      Add-CheckResult "TTFSD metric present in reliability artifact" $false "Expected line: TTFSD (minutes): <value>"
    }
    else {
      $ttfsdMax = [double]$thresholds.reliability.ttfsdMaxMinutes
      Add-CheckResult "TTFSD <= $ttfsdMax minutes" ($ttfsd -le $ttfsdMax) "TTFSD (minutes)=$ttfsd"
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
