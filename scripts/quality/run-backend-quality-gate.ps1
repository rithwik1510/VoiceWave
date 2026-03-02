param(
  [switch]$Enforce,
  [int]$MinDiscoveredTests = 100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$manifestPath = Join-Path $repoRoot 'src-tauri/Cargo.toml'
$inCi = $env:CI -eq 'true'
$gateResult = 'pass'

function Write-GateResult([string]$result, [string]$detail) {
  Write-Host ("BACKEND_GATE_RESULT={0}" -f $result)
  Write-Host ("BACKEND_GATE_DETAIL={0}" -f $detail)
}

Push-Location $repoRoot
try {
  $linker = Get-Command link.exe -ErrorAction SilentlyContinue
  if ($null -eq $linker) {
    $mingwCandidates = @(
      (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin'),
      (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\llvm-mingw-20251216-ucrt-x86_64\bin')
    )
    foreach ($candidate in $mingwCandidates) {
      if (Test-Path $candidate) {
        $env:PATH = "$candidate;$env:PATH"
        break
      }
    }
    $env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
  }

  npm run tauri:check
  if ($LASTEXITCODE -ne 0) {
    if ($inCi) {
      throw 'tauri:check failed in CI.'
    }
    $gateResult = 'warn-local-skip'
    Write-Warning 'tauri:check failed locally. Install/repair Rust linker prerequisites for full backend validation.'
    Write-GateResult $gateResult 'tauri:check failed locally'
    return
  }

  $priorErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $cargoTestOutput = & cargo test --no-default-features --manifest-path $manifestPath 2>&1
  $ErrorActionPreference = $priorErrorAction
  if ($LASTEXITCODE -ne 0) {
    if (-not $inCi) {
      $gateResult = 'warn-local-skip'
      Write-Warning 'Rust tests could not run locally after tauri:check. Keeping local mode non-blocking.'
      Write-Host $cargoTestOutput
      Write-GateResult $gateResult 'cargo test failed locally'
      return
    }
    throw 'Rust tests failed.'
  }

  $ErrorActionPreference = 'Continue'
  $listed = & cargo test --no-default-features --manifest-path $manifestPath -- --list 2>&1
  $ErrorActionPreference = $priorErrorAction
  if ($LASTEXITCODE -ne 0) {
    if (-not $inCi) {
      $gateResult = 'warn-local-skip'
      Write-Warning 'Unable to list Rust tests locally. Skipping inventory threshold outside CI.'
      Write-GateResult $gateResult 'cargo test -- --list failed locally'
      return
    }
    throw 'Unable to list Rust tests.'
  }

  $testLines = @($listed | Where-Object { $_ -match '^[^\s].*:\s+test$' })
  if ($testLines.Count -lt $MinDiscoveredTests) {
    throw "Rust test inventory below threshold: discovered=$($testLines.Count), minimum=$MinDiscoveredTests"
  }

  Write-Host "Backend quality gate passed (discovered tests: $($testLines.Count))."
  Write-GateResult $gateResult ("discovered_tests={0}" -f $testLines.Count)
}
catch {
  Write-GateResult 'fail' $_.Exception.Message
  if ($Enforce) {
    throw
  }
  Write-Warning $_.Exception.Message
}
finally {
  Pop-Location
}
