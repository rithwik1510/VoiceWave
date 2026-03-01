param(
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $repoRoot
try {
  $prodAuditRaw = npm audit --omit=dev --json
  if ($LASTEXITCODE -ne 0 -and -not $prodAuditRaw) {
    throw 'npm audit --omit=dev failed to produce JSON output.'
  }
  $prodAudit = $prodAuditRaw | ConvertFrom-Json
  $prodHigh = [int]$prodAudit.metadata.vulnerabilities.high
  $prodCritical = [int]$prodAudit.metadata.vulnerabilities.critical

  if ($prodHigh -gt 0 -or $prodCritical -gt 0) {
    throw "Production dependency vulnerabilities exceed policy (high=$prodHigh critical=$prodCritical)."
  }

  $allAuditRaw = npm audit --json
  $allAudit = $allAuditRaw | ConvertFrom-Json
  $allHigh = [int]$allAudit.metadata.vulnerabilities.high
  $allCritical = [int]$allAudit.metadata.vulnerabilities.critical
  if ($allHigh -gt 0 -or $allCritical -gt 0) {
    throw "Dependency vulnerabilities exceed policy (high=$allHigh critical=$allCritical)."
  }

  $cargoAudit = Get-Command cargo-audit -ErrorAction SilentlyContinue
  if ($null -eq $cargoAudit) {
    $cargoAudit = Get-Command cargo-audit.exe -ErrorAction SilentlyContinue
  }
  if ($null -eq $cargoAudit) {
    $inCi = $env:CI -eq 'true'
    if ($Enforce -and $inCi) {
      throw 'cargo-audit is required for enforced dependency checks. Install with: cargo install cargo-audit'
    }
    Write-Warning 'cargo-audit is not installed; skipping Rust advisory scan outside CI.'
  } else {
    cargo audit -q
    if ($LASTEXITCODE -ne 0) {
      throw 'cargo audit reported Rust advisories.'
    }
  }

  Write-Host 'Dependency security checks passed.'
}
catch {
  if ($Enforce) {
    throw
  }
  Write-Warning $_.Exception.Message
}
finally {
  Pop-Location
}
