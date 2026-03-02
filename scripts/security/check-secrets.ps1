param(
  [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$inCi = $env:CI -eq 'true'
$result = 'pass'

function Write-Result([string]$value, [string]$detail) {
  Write-Host ("SECRETS_CHECK_RESULT={0}" -f $value)
  Write-Host ("SECRETS_CHECK_DETAIL={0}" -f $detail)
}

Push-Location $repoRoot
try {
  $trackedEnv = @(
    git ls-files '.env' '.env.*' 2>$null |
      Where-Object { $_ -ne '.env.example' }
  )
  if ($trackedEnv.Count -gt 0) {
    throw "Tracked environment file(s) detected: $($trackedEnv -join ', ')"
  }

  $gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
  if ($null -ne $gitleaks) {
    gitleaks detect --source . --no-banner --redact
    if ($LASTEXITCODE -ne 0) {
      throw 'gitleaks detected potential secret leakage.'
    }
    Write-Host 'Secrets check passed via gitleaks.'
    Write-Result $result 'gitleaks'
    return
  }

  if ($Enforce -and $inCi) {
    throw 'gitleaks is required in CI enforced mode. Install gitleaks or use gitleaks action.'
  }

  $result = 'warn-local-skip'
  Write-Warning 'gitleaks is not installed; running fallback secret-pattern scan (local advisory mode).'
  $patterns = @(
    'AKIA[0-9A-Z]{16}',
    'AIza[0-9A-Za-z\\-_]{35}',
    '(?i)BEGIN\\s+PRIVATE\\s+KEY',
    '(?i)(api[_-]?key|secret|token)\\s*[:=]\\s*[\"\''][A-Za-z0-9_\\-\\.]{16,}'
  )

  $hits = @()
  foreach ($pattern in $patterns) {
    $scan = rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!src-tauri/target/**' --glob '!.git/**' --pcre2 "$pattern" . 2>$null
    if ($LASTEXITCODE -eq 0 -and $scan) {
      $hits += $scan
    }
  }

  if ($hits.Count -gt 0) {
    throw "Fallback secret scan found possible leaks:`n$($hits -join "`n")"
  }

  Write-Host 'Secrets check passed via fallback scan.'
  Write-Result $result 'fallback-pattern-scan'
}
catch {
  Write-Result 'fail' $_.Exception.Message
  if ($Enforce) {
    throw
  }
  Write-Warning $_.Exception.Message
}
finally {
  Pop-Location
}
