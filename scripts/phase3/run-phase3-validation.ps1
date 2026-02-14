Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-CargoPath {
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargo) {
    return $cargo.Source
  }
  $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $fallback) {
    return $fallback
  }
  throw "Cargo not found. Install Rust toolchain first."
}

function Add-MingwToPathIfAvailable {
  $wingetMingw = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
  if (Test-Path $wingetMingw) {
    $env:PATH = "$wingetMingw;$env:PATH"
  }
}

function Ensure-SpaceSafeJunction([string]$sourcePath) {
  $junctionPath = Join-Path $env:TEMP "voicewave-phase3-validation-nospace"
  if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq "Junction") {
      return $junctionPath
    }
    Remove-Item -LiteralPath $junctionPath -Force -Recurse
  }

  New-Item -ItemType Junction -Path $junctionPath -Target $sourcePath | Out-Null
  return $junctionPath
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$cargoExe = Resolve-CargoPath
Add-MingwToPathIfAvailable
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP "voicewave-phase3-target"
$spaceSafeRoot = Ensure-SpaceSafeJunction $repoRoot
$desktopManifest = Join-Path $spaceSafeRoot "src-tauri\Cargo.toml"

Push-Location $repoRoot
try {
  npm run test -- --run
  if ($LASTEXITCODE -ne 0) {
    throw "frontend tests failed"
  }

  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "frontend build failed"
  }

  & $cargoExe +stable-x86_64-pc-windows-gnu test --manifest-path $desktopManifest --no-run
  if ($LASTEXITCODE -ne 0) {
    throw "desktop-feature rust compile check failed"
  }

  function Invoke-QualityGuardTest {
    param([string]$TestName)

    & $cargoExe +stable-x86_64-pc-windows-gnu test --manifest-path $desktopManifest --lib $TestName
    if ($LASTEXITCODE -eq 0) {
      return
    }

    # Some Windows GNU environments can compile desktop tests but fail to execute
    # GUI-linked test binaries at runtime (STATUS_ENTRYPOINT_NOT_FOUND). Fallback to
    # no-default-features execution so quality assertions still run.
    & $cargoExe +stable-x86_64-pc-windows-gnu test --manifest-path $desktopManifest --no-default-features --lib $TestName
    if ($LASTEXITCODE -eq 0) {
      Write-Warning "Desktop runtime execution failed for '$TestName'; validated via --no-default-features fallback."
      return
    }

    throw "rust quality guard test failed: $TestName"
  }

  $qualityGuardTests = @(
    "decode_profile_prefers_beam_for_larger_models",
    "fast_mode_uses_greedy_strategy",
    "fw_balanced_profile_has_quality_floor_for_small",
    "fw_balanced_request_uses_plain_decode_without_prompt_or_context",
    "fw_detects_low_coherence_with_repetition_pressure",
    "fw_literal_retry_profile_is_prompted_and_context_free",
    "high_pass_filter_reduces_dc_offset_component",
    "asr_integrity_tracks_raw_to_final_word_overlap",
    "finalize_formats_spoken_numbered_lists",
    "strips_blank_audio_marker"
  )
  foreach ($testName in $qualityGuardTests) {
    Invoke-QualityGuardTest -TestName $testName
  }
}
finally {
  Pop-Location
}

Write-Host "Phase III validation complete."
