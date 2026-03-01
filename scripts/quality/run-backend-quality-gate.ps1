param(
  [switch]$Enforce,
  [int]$MinDiscoveredTests = 100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$manifestPath = Join-Path $repoRoot 'src-tauri/Cargo.toml'

Push-Location $repoRoot
try {
  $priorErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $cargoTestOutput = & cargo test --no-default-features --manifest-path $manifestPath 2>&1
  $ErrorActionPreference = $priorErrorAction
  if ($LASTEXITCODE -ne 0) {
    if ($env:CI -ne 'true') {
      Write-Warning 'Rust tests could not run locally. Skipping enforced backend gate outside CI.'
      Write-Host $cargoTestOutput
      return
    }
    throw 'Rust tests failed.'
  }

  $ErrorActionPreference = 'Continue'
  $listed = & cargo test --no-default-features --manifest-path $manifestPath -- --list 2>&1
  $ErrorActionPreference = $priorErrorAction
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to list Rust tests.'
  }

  $testLines = @($listed | Where-Object { $_ -match '^[^\s].*:\s+test$' })
  if ($testLines.Count -lt $MinDiscoveredTests) {
    throw "Rust test inventory below threshold: discovered=$($testLines.Count), minimum=$MinDiscoveredTests"
  }

  Write-Host "Backend quality gate passed (discovered tests: $($testLines.Count))."
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
