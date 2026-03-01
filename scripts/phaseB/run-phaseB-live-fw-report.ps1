param(
  [int]$LastN = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$diagPath = Join-Path $env:APPDATA "voicewave\localcore\config\diagnostics.json"
$phaseAPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")) "docs\phaseA\artifacts\cpu-latency-2026-02-11.json"
$shortAudioLimitMs = 3000
$mediumAudioLimitMs = 8000
$shortTargetMs = 2000
$longTargetMs = 2500

function Get-PercentileValue {
  param(
    [long[]]$Values,
    [double]$Percentile
  )
  if ($Values.Count -eq 0) { return [long]0 }
  $sorted = @($Values | Sort-Object)
  $idx = [int][math]::Round((($sorted.Count - 1) * $Percentile))
  return [long]$sorted[$idx]
}

function Get-ReleaseToFinalMs {
  param($Record)
  return ([int64]$Record.releaseToTranscribingMs + [int64]$Record.decodeMs + [int64]$Record.postMs)
}

function Get-ReleaseToInsertedMs {
  param($Record)
  if ($Record.PSObject.Properties.Name -contains "releaseToInsertedMs") {
    $value = [int64]$Record.releaseToInsertedMs
    if ($value -gt 0) {
      return $value
    }
  }
  $insert = 0
  if ($Record.PSObject.Properties.Name -contains "insertMs") {
    $insert = [int64]$Record.insertMs
  }
  return (Get-ReleaseToFinalMs $Record) + $insert
}

function Get-BoolRate {
  param(
    [object[]]$Rows,
    [string]$PropertyName
  )
  if ($Rows.Count -eq 0) { return $null }
  $withProp = @($Rows | Where-Object { $_.PSObject.Properties.Name -contains $PropertyName })
  if ($withProp.Count -eq 0) { return $null }
  $truthy = @($withProp | Where-Object { $_.$PropertyName -eq $true }).Count
  return [math]::Round(($truthy * 100.0 / $withProp.Count), 1)
}

function Get-BoolRateNonNull {
  param(
    [object[]]$Rows,
    [string]$PropertyName
  )
  if ($Rows.Count -eq 0) { return $null }
  $withProp = @($Rows | Where-Object {
      ($_.PSObject.Properties.Name -contains $PropertyName) -and ($null -ne $_.$PropertyName)
    })
  if ($withProp.Count -eq 0) { return $null }
  $truthy = @($withProp | Where-Object { $_.$PropertyName -eq $true }).Count
  return [math]::Round(($truthy * 100.0 / $withProp.Count), 1)
}

function Get-AverageValue {
  param(
    [object[]]$Rows,
    [string]$PropertyName
  )
  if ($Rows.Count -eq 0) { return $null }
  $withProp = @($Rows | Where-Object {
      ($_.PSObject.Properties.Name -contains $PropertyName) -and ($null -ne $_.$PropertyName)
    })
  if ($withProp.Count -eq 0) { return $null }
  return [math]::Round((($withProp | Measure-Object -Property $PropertyName -Average).Average), 4)
}

function Write-Distribution {
  param(
    [string]$Label,
    [object[]]$Rows,
    [string]$PropertyName
  )
  $withProp = @($Rows | Where-Object { $_.PSObject.Properties.Name -contains $PropertyName })
  if ($withProp.Count -eq 0) {
    Write-Host ("{0}: n/a" -f $Label)
    return
  }
  $groups = @($withProp | Group-Object -Property $PropertyName | Sort-Object Count -Descending)
  if ($groups.Count -eq 0) {
    Write-Host ("{0}: n/a" -f $Label)
    return
  }
  $parts = @()
  foreach ($group in $groups) {
    $name = if ([string]::IsNullOrWhiteSpace([string]$group.Name)) { "<empty>" } else { [string]$group.Name }
    $pct = [math]::Round(($group.Count * 100.0 / $withProp.Count), 1)
    $parts += ("{0}={1}%" -f $name, $pct)
  }
  Write-Host ("{0}: {1}" -f $Label, ($parts -join ", "))
}

function Write-BucketSummary {
  param(
    [string]$Label,
    [object[]]$Rows,
    [int]$TargetMs
  )

  if ($Rows.Count -eq 0) {
    Write-Host ("{0}: no records" -f $Label)
    return
  }

  $releaseToFinal = @()
  $releaseToInserted = @()
  foreach ($row in $Rows) {
    $releaseToFinal += (Get-ReleaseToFinalMs $row)
    $releaseToInserted += (Get-ReleaseToInsertedMs $row)
  }
  $p50 = Get-PercentileValue -Values $releaseToFinal -Percentile 0.50
  $p95 = Get-PercentileValue -Values $releaseToFinal -Percentile 0.95
  $p50Inserted = Get-PercentileValue -Values $releaseToInserted -Percentile 0.50
  $p95Inserted = Get-PercentileValue -Values $releaseToInserted -Percentile 0.95
  $successCount = @($Rows | Where-Object { $_.success -eq $true }).Count
  $successRate = [math]::Round(($successCount * 100.0 / $Rows.Count), 1)
  $targetHits = @($releaseToInserted | Where-Object { $_ -le $TargetMs }).Count
  $targetHitRate = [math]::Round(($targetHits * 100.0 / $Rows.Count), 1)

  $integrityRows = @($Rows | Where-Object { $_.PSObject.Properties.Name -contains "asrIntegrityPercent" })
  $integrityAvg = $null
  if ($integrityRows.Count -gt 0) {
    $integrityAvg = [math]::Round((($integrityRows | Measure-Object -Property asrIntegrityPercent -Average).Average), 1)
  }

  Write-Host ("{0}: n={1} | final p50={2} ms p95={3} ms | inserted p50={4} ms p95={5} ms | success={6}% | <= {7} ms inserted hit={8}%" -f $Label, $Rows.Count, $p50, $p95, $p50Inserted, $p95Inserted, $successRate, $TargetMs, $targetHitRate)
  if ($integrityAvg -ne $null) {
    Write-Host ("{0}: ASR integrity={1}%" -f $Label, $integrityAvg)
  }
}

if (-not (Test-Path $diagPath)) {
  throw "No diagnostics file found at $diagPath. Run the app with fw-small.en and complete dictation sessions first."
}

$diag = Get-Content $diagPath -Raw | ConvertFrom-Json
$records = @($diag.records | Where-Object { $_.modelId -eq "fw-small.en" } | Sort-Object timestampUtcMs -Descending)
if ($records.Count -lt $LastN) {
  throw "Need at least $LastN fw-small.en records; found $($records.Count)."
}

$slice = $records[0..($LastN - 1)]
$releaseToFinal = @()
$releaseToInserted = @()
foreach ($r in $slice) {
  $releaseToFinal += (Get-ReleaseToFinalMs $r)
  $releaseToInserted += (Get-ReleaseToInsertedMs $r)
}
$p50 = Get-PercentileValue -Values $releaseToFinal -Percentile 0.50
$p95 = Get-PercentileValue -Values $releaseToFinal -Percentile 0.95
$p50Inserted = Get-PercentileValue -Values $releaseToInserted -Percentile 0.50
$p95Inserted = Get-PercentileValue -Values $releaseToInserted -Percentile 0.95

$successCount = @($slice | Where-Object { $_.success -eq $true }).Count
$successRate = if ($slice.Count -eq 0) { 0 } else { [math]::Round(($successCount * 100.0 / $slice.Count), 1) }

$integrityRows = @($slice | Where-Object { $_.PSObject.Properties.Name -contains "asrIntegrityPercent" })
$integrityAvg = $null
if ($integrityRows.Count -gt 0) {
  $integrityAvg = [math]::Round((($integrityRows | Measure-Object -Property asrIntegrityPercent -Average).Average), 1)
}

Write-Host ""
Write-Host "Phase B Live FW Report"
Write-Host "----------------------"
Write-Host ("Records analyzed: {0}" -f $slice.Count)
Write-Host ("fw-small.en live p50 release->final: {0} ms" -f $p50)
Write-Host ("fw-small.en live p95 release->final: {0} ms" -f $p95)
Write-Host ("fw-small.en live p50 release->inserted: {0} ms" -f $p50Inserted)
Write-Host ("fw-small.en live p95 release->inserted: {0} ms" -f $p95Inserted)
Write-Host ("fw-small.en live pipeline success rate (insertion/runtime): {0}%" -f $successRate)
if ($integrityAvg -ne $null) {
  Write-Host ("fw-small.en live ASR integrity (raw->final overlap): {0}%" -f $integrityAvg)
}
$retryRate = Get-BoolRate -Rows $slice -PropertyName "fwRetryUsed"
if ($retryRate -ne $null) {
  Write-Host ("fw-small.en live retry usage: {0}%" -f $retryRate)
}
$literalRetryRate = Get-BoolRate -Rows $slice -PropertyName "fwLiteralRetryUsed"
if ($literalRetryRate -ne $null) {
  Write-Host ("fw-small.en live literal retry usage: {0}%" -f $literalRetryRate)
}
$lowCoherenceRate = Get-BoolRate -Rows $slice -PropertyName "fwLowCoherence"
if ($lowCoherenceRate -ne $null) {
  Write-Host ("fw-small.en live low-coherence flag rate: {0}%" -f $lowCoherenceRate)
}
$pipelineGroups = @($slice | Where-Object { $_.PSObject.Properties.Name -contains "audioPipelineVersion" } | Group-Object -Property audioPipelineVersion | Sort-Object Count -Descending)
if ($pipelineGroups.Count -gt 0) {
  $parts = @()
  foreach ($group in $pipelineGroups) {
    $pct = [math]::Round(($group.Count * 100.0 / $slice.Count), 1)
    $parts += ("{0}={1}%" -f $group.Name, $pct)
  }
  Write-Host ("audio pipeline distribution: {0}" -f ($parts -join ", "))
}
$fallbackRate = Get-BoolRate -Rows $slice -PropertyName "audioPipelineFallbackEngaged"
if ($fallbackRate -ne $null) {
  Write-Host ("audio pipeline fallback engaged rate: {0}%" -f $fallbackRate)
}
$warmStartRate = Get-BoolRate -Rows $slice -PropertyName "warmStartHit"
if ($warmStartRate -ne $null) {
  Write-Host ("fw warm-start hit rate: {0}%" -f $warmStartRate)
}
$workerReusedRate = Get-BoolRate -Rows $slice -PropertyName "workerReused"
if ($workerReusedRate -ne $null) {
  Write-Host ("fw worker reuse rate: {0}%" -f $workerReusedRate)
}
$watchdogThresholdAvg = Get-AverageValue -Rows $slice -PropertyName "effectiveReleaseWatchdogMs"
if ($watchdogThresholdAvg -ne $null) {
  Write-Host ("effective release watchdog avg: {0} ms" -f $watchdogThresholdAvg)
}
$avgLogprob = Get-AverageValue -Rows $slice -PropertyName "fwAvgLogprob"
if ($avgLogprob -ne $null) {
  Write-Host ("fw-small.en avg logprob: {0}" -f $avgLogprob)
}
$avgNoSpeech = Get-AverageValue -Rows $slice -PropertyName "fwNoSpeechProb"
if ($avgNoSpeech -ne $null) {
  Write-Host ("fw-small.en avg no-speech prob: {0}" -f $avgNoSpeech)
}
$shadowSampled = @($slice | Where-Object {
    ($_.PSObject.Properties.Name -contains "fwShadowCandidateWon") -and ($null -ne $_.fwShadowCandidateWon)
  }).Count
if ($shadowSampled -gt 0) {
  $shadowSampleRate = [math]::Round(($shadowSampled * 100.0 / $slice.Count), 1)
  Write-Host ("shadow sampled sessions: {0}/{1} ({2}%)" -f $shadowSampled, $slice.Count, $shadowSampleRate)
}
$shadowWins = Get-BoolRateNonNull -Rows $slice -PropertyName "fwShadowCandidateWon"
if ($shadowWins -ne $null) {
  Write-Host ("shadow candidate win rate (sampled only): {0}%" -f $shadowWins)
}
$shadowDelta = Get-AverageValue -Rows $slice -PropertyName "fwShadowQualityDelta"
if ($shadowDelta -ne $null) {
  Write-Host ("shadow avg quality delta: {0}" -f $shadowDelta)
}
Write-Distribution -Label "insertion methods" -Rows $slice -PropertyName "insertionMethod"
Write-Distribution -Label "decode policy selected mode" -Rows $slice -PropertyName "decodePolicyModeSelected"
Write-Distribution -Label "backend requested" -Rows $slice -PropertyName "backendRequested"
Write-Distribution -Label "backend used" -Rows $slice -PropertyName "backendUsed"
$decodeValues = @($slice | ForEach-Object { [int64]$_.decodeMs })
if ($decodeValues.Count -gt 0) {
  $decodeP50 = Get-PercentileValue -Values $decodeValues -Percentile 0.50
  $decodeP95 = Get-PercentileValue -Values $decodeValues -Percentile 0.95
  Write-Host ("fw-small.en decode-only p50: {0} ms" -f $decodeP50)
  Write-Host ("fw-small.en decode-only p95: {0} ms" -f $decodeP95)
}
Write-Host ""

$shortRows = @($slice | Where-Object {
  ($_.PSObject.Properties.Name -contains "audioDurationMs") -and ([int64]$_.audioDurationMs -le $shortAudioLimitMs)
})
$mediumRows = @($slice | Where-Object {
  ($_.PSObject.Properties.Name -contains "audioDurationMs") -and ([int64]$_.audioDurationMs -gt $shortAudioLimitMs) -and ([int64]$_.audioDurationMs -le $mediumAudioLimitMs)
})
$longRows = @($slice | Where-Object {
  ($_.PSObject.Properties.Name -contains "audioDurationMs") -and ([int64]$_.audioDurationMs -gt $mediumAudioLimitMs)
})

Write-Host "Bucketed latency (by audioDurationMs)"
Write-Host "-----------------------------------"
Write-BucketSummary -Label "short (<=3.0s)" -Rows $shortRows -TargetMs $shortTargetMs
Write-BucketSummary -Label "medium (3.0-8.0s)" -Rows $mediumRows -TargetMs $longTargetMs
Write-BucketSummary -Label "long (>8.0s)" -Rows $longRows -TargetMs $longTargetMs

$outliers = @(
  $slice |
    Sort-Object @{ Expression = { Get-ReleaseToInsertedMs $_ }; Descending = $true } |
    Select-Object -First 5
)
if ($outliers.Count -gt 0) {
  Write-Host ""
  Write-Host "Top release->inserted outliers (latest window)"
  Write-Host "---------------------------------------------"
  foreach ($row in $outliers) {
    $rf = Get-ReleaseToFinalMs $row
    $ri = Get-ReleaseToInsertedMs $row
    $policy = if ($row.PSObject.Properties.Name -contains "decodePolicyModeSelected") { [string]$row.decodePolicyModeSelected } else { "n/a" }
    $retry = if ($row.PSObject.Properties.Name -contains "fwRetryUsed") { [string]$row.fwRetryUsed } else { "n/a" }
    $method = if ($row.PSObject.Properties.Name -contains "insertionMethod") { [string]$row.insertionMethod } else { "n/a" }
    Write-Host ("ts={0} | audio={1} ms | release->inserted={2} ms | release->final={3} ms | decode={4} ms | release={5} ms | insertMs={6} | policy={7} | retry={8} | insert={9}" -f `
      [int64]$row.timestampUtcMs, [int64]$row.audioDurationMs, $ri, $rf, [int64]$row.decodeMs, [int64]$row.releaseToTranscribingMs, [int64]$row.insertMs, $policy, $retry, $method)
  }
}

if (Test-Path $phaseAPath) {
  $phaseA = Get-Content $phaseAPath -Raw | ConvertFrom-Json
  $baseP50 = [int64]$phaseA.smallEn.p50ReleaseToFinalMs
  $baseP95 = [int64]$phaseA.smallEn.p95ReleaseToFinalMs
  Write-Host ""
  Write-Host ("vs PhaseA small baseline p50 delta: {0} ms" -f ($p50 - $baseP50))
  Write-Host ("vs PhaseA small baseline p95 delta: {0} ms" -f ($p95 - $baseP95))
}
