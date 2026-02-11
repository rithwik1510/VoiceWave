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
}
finally {
  Pop-Location
}

Write-Host "Phase III validation complete."
