param(
  [int]$LastN = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$diagPath = Join-Path $env:APPDATA "voicewave\localcore\config\diagnostics.json"
$phaseAPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")) "docs\phaseA\artifacts\cpu-latency-2026-02-11.json"

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
foreach ($r in $slice) {
  $releaseToFinal += ([int64]$r.releaseToTranscribingMs + [int64]$r.decodeMs + [int64]$r.postMs)
}
$releaseToFinal = $releaseToFinal | Sort-Object

$idx50 = [int][math]::Round((($releaseToFinal.Count - 1) * 0.50))
$idx95 = [int][math]::Round((($releaseToFinal.Count - 1) * 0.95))
$p50 = [int64]$releaseToFinal[$idx50]
$p95 = [int64]$releaseToFinal[$idx95]

$successCount = @($slice | Where-Object { $_.success -eq $true }).Count
$successRate = if ($slice.Count -eq 0) { 0 } else { [math]::Round(($successCount * 100.0 / $slice.Count), 1) }

Write-Host ""
Write-Host "Phase B Live FW Report"
Write-Host "----------------------"
Write-Host ("Records analyzed: {0}" -f $slice.Count)
Write-Host ("fw-small.en live p50 release->final: {0} ms" -f $p50)
Write-Host ("fw-small.en live p95 release->final: {0} ms" -f $p95)
Write-Host ("fw-small.en live success rate: {0}%" -f $successRate)

if (Test-Path $phaseAPath) {
  $phaseA = Get-Content $phaseAPath -Raw | ConvertFrom-Json
  $baseP50 = [int64]$phaseA.smallEn.p50ReleaseToFinalMs
  $baseP95 = [int64]$phaseA.smallEn.p95ReleaseToFinalMs
  Write-Host ""
  Write-Host ("vs PhaseA small baseline p50 delta: {0} ms" -f ($p50 - $baseP50))
  Write-Host ("vs PhaseA small baseline p95 delta: {0} ms" -f ($p95 - $baseP95))
}
