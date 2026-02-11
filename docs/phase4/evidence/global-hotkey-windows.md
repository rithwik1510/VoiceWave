# Global Hotkey Evidence (Windows)

Status: Complete

## Goal

Capture OS-level global hotkey registration evidence for Phase IV hardening.

## Evidence

1. Runtime monitor startup log captured from desktop run:
   - `docs/phase4/artifacts/global-hotkey-runtime-smoke-2026-02-11.log`
   - contains line: `voicewave: global hotkey runtime monitor started (Windows key-state polling)`
2. Runtime implementation path:
   - `src-tauri/src/state.rs` (`ensure_hotkey_runtime_monitor`)
   - polls OS key state via `HotkeyManager::is_action_pressed(...)` and emits pressed/released/triggered actions.
3. Failure-recovery path:
   - invalid hotkey configuration fallback to defaults remains active at startup in `src-tauri/src/state.rs` constructor path.
   - hotkey validation and conflict detection in `src-tauri/src/hotkey/mod.rs`.

## Notes

1. Web fallback listeners are disabled in Tauri runtime path to avoid duplicate triggering (`src/hooks/useVoiceWave.ts`).
