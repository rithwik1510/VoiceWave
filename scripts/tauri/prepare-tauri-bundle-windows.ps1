Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resourceDir = Join-Path $repoRoot "src-tauri\windows"
$resourceDll = Join-Path $resourceDir "WebView2Loader.dll"

if (-not (Test-Path $resourceDir)) {
  New-Item -ItemType Directory -Path $resourceDir | Out-Null
}

$targetRoot = if ($env:CARGO_TARGET_DIR) {
  $env:CARGO_TARGET_DIR
}
else {
  Join-Path $repoRoot "src-tauri\target"
}

$releaseRoots = @()
if (-not [string]::IsNullOrWhiteSpace($env:CARGO_BUILD_TARGET)) {
  $releaseRoots += Join-Path $targetRoot "$($env:CARGO_BUILD_TARGET)\release"
}
$releaseRoots += Join-Path $targetRoot "release"

$loaderSource = $null
foreach ($releaseRoot in $releaseRoots) {
  if (-not (Test-Path $releaseRoot)) {
    continue
  }

  $rootLoader = Join-Path $releaseRoot "WebView2Loader.dll"
  if (Test-Path $rootLoader) {
    $loaderSource = $rootLoader
    break
  }

  $nestedLoader = Get-ChildItem -Path $releaseRoot -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "webview2-com-sys" -and $_.FullName -match "\\x64\\" } |
    Select-Object -First 1

  if ($null -ne $nestedLoader) {
    $loaderSource = $nestedLoader.FullName
    break
  }
}

if (-not $loaderSource) {
  throw "WebView2Loader.dll was not found in release outputs. Expected under $targetRoot."
}

Copy-Item -Path $loaderSource -Destination $resourceDll -Force
Write-Host "Prepared bundle resource: $resourceDll"
