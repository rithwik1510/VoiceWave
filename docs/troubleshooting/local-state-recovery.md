# Local State Recovery (Windows)

Use this when local runtime state is noisy/corrupted and dictation quality or model state appears inconsistent.

Script:

`scripts/support/backup-reset-local-state.ps1`

## Backup only (safe default)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\support\backup-reset-local-state.ps1
```

This creates a backup of `%APPDATA%\voicewave\localcore` on your Desktop under `voicewave-recovery-backups`.

## Backup + reset config/download state (preserve model binaries)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\support\backup-reset-local-state.ps1 -Reset
```

This resets:

1. Config state (`settings`, `history`, `dictionary`, model index metadata)
2. Partial model downloads and quarantine/source folders

Installed model binaries are preserved by default.

## Full reset including installed model binaries

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\support\backup-reset-local-state.ps1 -Reset -PreserveModelFiles:$false
```

## Notes

1. Backups are timestamped and non-destructive unless you pass `-SkipBackup`.
2. After reset, launch with `npm run tauri:dev` and reinstall/switch models if needed.
3. If transcription quality is still poor, prefer non-hands-free microphone paths and reset VAD to the recommended value in-app.
