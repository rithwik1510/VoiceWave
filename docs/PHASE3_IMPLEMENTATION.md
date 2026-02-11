# VoiceWave Phase III Implementation Notes

## Phase Tag

`Phase III - Model Manager, UX Controls, and History`

## Platform Scope Override

1. Effective date: 2026-02-10.
2. Active Phase III implementation/validation scope is Windows-only.
3. macOS validation remains deferred until macOS hardware is available.

## Status (2026-02-11)

`Implemented and revalidated for Windows rescue baseline`

Phase III runtime surfaces are operational for current rescue goals. Formal long-horizon phase closeout remains subject to remaining gate items documented in planning/risk artifacts.

## Implemented Surfaces

1. Model manager:
   - `src-tauri/src/model_manager/mod.rs`
2. Benchmark and recommendation:
   - `src-tauri/src/benchmark/mod.rs`
3. Session history:
   - `src-tauri/src/history/mod.rs`
4. Dictionary queue/terms:
   - `src-tauri/src/dictionary/mod.rs`
5. Runtime command wiring:
   - `src-tauri/src/lib.rs`
   - `src-tauri/src/state.rs`
6. Frontend bridge/types/hooks:
   - `src/lib/tauri.ts`
   - `src/types/voicewave.ts`
   - `src/hooks/useVoiceWave.ts`
7. App panels and controls:
   - `src/App.tsx`
8. Phase III validation script (space-safe on Windows):
   - `scripts/phase3/run-phase3-validation.ps1`

## Rescue Hardening Aligned to Phase III UX

1. Transcript sanitization is enforced before insertion/history/dictionary ingestion, preventing non-user token leakage.
2. Home panel now surfaces low-quality microphone warnings with recovery actions (refresh, switch input, reset VAD).
3. VAD threshold bounds are enforced in frontend + backend settings flow.
4. Local-state backup/reset utility is available for recovery scenarios:
   - `scripts/support/backup-reset-local-state.ps1`

## Phase III Command Surface

1. `list_model_catalog`
2. `list_installed_models`
3. `get_model_status`
4. `download_model`
5. `cancel_model_download`
6. `set_active_model`
7. `run_model_benchmark`
8. `get_benchmark_results`
9. `recommend_model`
10. `get_session_history`
11. `set_history_retention`
12. `prune_history_now`
13. `clear_history`
14. `get_dictionary_queue`
15. `approve_dictionary_entry`
16. `reject_dictionary_entry`
17. `get_dictionary_terms`
18. `remove_dictionary_term`

## Validation Evidence (2026-02-11)

1. `npm run test -- --run`
   - Result: pass (`3 passed` files, `7 passed` tests).
2. `npm run build`
   - Result: pass (`built in 2.87s`).
3. `npm run phase3:validate`
   - Result: pass.
   - Includes no-space Windows Rust compile path.
   - Rust summary: finished `test` profile and emitted desktop test executables, including `tests\\transcript_sanitization.rs`.

## Notes

1. Runtime remains strict local-only for v1.
2. Fixture dictation path remains for deterministic test/harness behavior and is not the runtime quality authority.
3. Manual app workflow acceptance still must be recorded on target hardware for release confidence:
   - Notepad
   - VS Code
   - Browser text field/editor
