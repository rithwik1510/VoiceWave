param(
  [string]$VenvPath = ".venv-faster-whisper"
)

$ErrorActionPreference = "Stop"

function Resolve-PythonCommand {
  if ($env:VOICEWAVE_FASTER_WHISPER_PYTHON -and (Test-Path $env:VOICEWAVE_FASTER_WHISPER_PYTHON)) {
    return $env:VOICEWAVE_FASTER_WHISPER_PYTHON
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return "py -3"
  }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return "python"
  }
  throw "Python 3.9+ is required. Install Python and rerun."
}

Write-Host "VoiceWave Faster-Whisper GPU setup"
Write-Host "-----------------------------------"

$pythonCmd = Resolve-PythonCommand
Write-Host "Using python command: $pythonCmd"

$venvFullPath = Resolve-Path -LiteralPath "." | ForEach-Object { Join-Path $_.Path $VenvPath }
if (-not (Test-Path $venvFullPath)) {
  Write-Host "Creating virtual environment at $venvFullPath ..."
  Invoke-Expression "$pythonCmd -m venv `"$venvFullPath`""
}

$venvPython = Join-Path $venvFullPath "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  throw "Virtual environment python not found at $venvPython"
}

Write-Host "Upgrading pip/setuptools/wheel ..."
& $venvPython -m pip install --upgrade pip setuptools wheel

Write-Host "Installing Faster-Whisper and CUDA runtime wheels (cu12) ..."
& $venvPython -m pip install --upgrade `
  faster-whisper `
  nvidia-cublas-cu12 `
  nvidia-cudnn-cu12 `
  nvidia-cuda-runtime-cu12 `
  nvidia-cuda-nvrtc-cu12

Write-Host "Validating CUDA runtime wiring ..."
& $venvPython -c @'
import ctypes
import os
import sys
from pathlib import Path

import ctranslate2
import faster_whisper

root = Path(sys.executable).resolve().parent.parent / 'Lib' / 'site-packages' / 'nvidia'
bins = [str(p / 'bin') for p in root.glob('*') if (p / 'bin').exists()]
if hasattr(os, 'add_dll_directory'):
    for p in bins:
        os.add_dll_directory(p)
if bins:
    os.environ['PATH'] = ';'.join(bins + [os.environ.get('PATH', '')])

ctypes.WinDLL('cublas64_12.dll')
print('faster-whisper version:', getattr(faster_whisper, '__version__', 'unknown'))
print('ctranslate2 version:', getattr(ctranslate2, '__version__', 'unknown'))
print('cuda devices:', ctranslate2.get_cuda_device_count())
print('cuda compute types:', ctranslate2.get_supported_compute_types('cuda'))
print('cuda runtime validation: OK')
'@

Write-Host ""
Write-Host "Setup complete."
Write-Host "Set this for VoiceWave runtime:"
Write-Host "  `$env:VOICEWAVE_FASTER_WHISPER_PYTHON = '$venvPython'"
