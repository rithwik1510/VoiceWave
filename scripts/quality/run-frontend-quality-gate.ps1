param(
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $repoRoot
try {
  npm run test:coverage
  if ($LASTEXITCODE -ne 0) {
    throw 'Frontend coverage run failed.'
  }

  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw 'Frontend build failed.'
  }

  Write-Host 'Frontend quality gate passed.'
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