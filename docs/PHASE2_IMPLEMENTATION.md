# VoiceWave Phase II Implementation Notes

## Phase Tag

`Phase II - Input and Insertion Reliability`

## Platform Scope Override

1. Effective date: 2026-02-10.
2. Active Phase II implementation and validation scope is Windows-only.
3. macOS validation remains deferred until macOS hardware is available.

## Status (2026-02-11)

`Implemented and validated for current Windows rescue baseline`

Phase II runtime plumbing is active with real whisper.cpp transcript path in use. Remaining hardening work is tracked for later phases (for example OS-global hotkey parity evidence).

## Delivered Outputs

1. Hotkey manager contracts and validation:
   - `src-tauri/src/hotkey/mod.rs`
2. Insertion fallback chain and undo/history safety net:
   - `src-tauri/src/insertion/mod.rs`
3. Permission snapshot and recovery flow:
   - `src-tauri/src/permissions/mod.rs`
4. Runtime command/event wiring:
   - `src-tauri/src/lib.rs`
   - `src-tauri/src/state.rs`
5. Frontend integration:
   - `src/hooks/useVoiceWave.ts`
   - `src/lib/tauri.ts`
   - `src/types/voicewave.ts`
   - `src/App.tsx`
6. Validation automation:
   - `scripts/phase2/run-phase2-validation.ps1`
   - `package.json` script: `phase2:validate`

## Command/Event Contract (Phase II Runtime)

1. Existing commands retained:
   - `get_voicewave_snapshot`
   - `load_settings`
   - `update_settings`
   - `start_dictation(mode)`
   - `cancel_dictation`
2. Added commands:
   - `load_hotkey_config`
   - `update_hotkey_config(config)`
   - `get_permission_snapshot`
   - `request_microphone_access`
   - `insert_text(payload)`
   - `undo_last_insertion`
   - `get_recent_insertions(limit?)`
   - `trigger_hotkey_action(action, phase)`
3. Existing events retained:
   - `voicewave://state`
   - `voicewave://transcript`
4. Added events:
   - `voicewave://hotkey`
   - `voicewave://permission`
   - `voicewave://insertion`

## Validation Commands

1. Full Phase II validation bundle:
   - `npm run phase2:validate`
2. Baseline shared bundle used in current rescue cycles:
   - `npm run phase3:validate`

## Remaining Hardening Item (Tracked)

1. OS-level global hotkey registration evidence is still tracked as a hardening gap; current behavior is explicitly app-scoped fallback unless proven otherwise.
