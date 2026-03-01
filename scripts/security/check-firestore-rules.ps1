param(
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$rulesPath = Join-Path $repoRoot 'docs/firebase/firestore.rules'

try {
  if (-not (Test-Path $rulesPath)) {
    throw "Missing Firestore rules file at $rulesPath"
  }

  $raw = Get-Content -Path $rulesPath -Raw
  $checks = @(
    @{ Name = 'Auth ownership check'; Pattern = 'request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*userId' },
    @{ Name = 'Root user schema validator'; Pattern = 'function\s+isValidUserProfile\s*\(' },
    @{ Name = 'Sentence schema validator'; Pattern = 'function\s+isValidRecentSentence\s*\(' },
    @{ Name = 'Dictionary schema validator'; Pattern = 'function\s+isValidDictionaryTerm\s*\(' },
    @{ Name = 'Create/update split'; Pattern = 'allow\s+create\s*:' },
    @{ Name = 'Timestamp sanity'; Pattern = 'createdAtUtcMs' },
    @{ Name = 'Key allowlist'; Pattern = 'keys\(\)\.hasOnly' }
  )

  $failed = @()
  foreach ($check in $checks) {
    if ($raw -notmatch $check.Pattern) {
      $failed += $check.Name
    }
  }

  if ($failed.Count -gt 0) {
    throw "Firestore rules guardrails missing: $($failed -join ', ')"
  }

  Write-Host 'Firestore rules checks passed.'
}
catch {
  if ($Enforce) {
    throw
  }
  Write-Warning $_.Exception.Message
}