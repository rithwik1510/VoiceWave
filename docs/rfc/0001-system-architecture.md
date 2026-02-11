# RFC 0001: VoiceWave v1 System Architecture

## Status

Accepted (Phase 0 baseline)

## Context

VoiceWave must provide low-latency, local-only dictation with high insertion reliability on Windows and macOS.
The architecture must preserve privacy and keep UI responsiveness stable under load.

## Decision

Use a Tauri 2 desktop shell with:

1. Rust core services for audio, inference orchestration, insertion, model management, and persistence.
2. React + Tailwind web frontend for dashboard/settings UX.
3. Message boundary between UI and core via Tauri commands/events.
4. SQLite for local settings/history/stats with schema versioning.
5. Local-only data path for v1 (no cloud transcription or rewrite path).

## Component Model

1. `desktop-shell` (Tauri host)
2. `audio-pipeline` (capture, resample, buffering, VAD)
3. `inference-worker` (whisper.cpp integration, cancellable jobs, partials)
4. `insertion-engine` (direct insert -> clipboard fallback -> history fallback)
5. `hotkey-manager` (global bindings and conflicts)
6. `model-manager` (catalog/download/checksum/health)
7. `persistence` (SQLite settings/history/stats)
8. `diagnostics` (redacted logs and perf metrics, opt-in export)
9. `experience-state` (idle/listening/transcribing/inserted/error)

## Key Interfaces (Phase 0 Baseline + Phase II Extensions)

### UI -> Core Commands (Phase I Realized Subset)

1. `start_dictation(mode)` where `mode` is `microphone | fixture`
2. `cancel_dictation()`
3. `load_settings()`
4. `update_settings(settings)`
5. `get_voicewave_snapshot()`

### Core -> UI Events (Phase I Realized Subset)

1. `voicewave://state` with `state` in `idle|listening|transcribing|inserted|error`
2. `voicewave://transcript` with partial/final transcript payloads

### UI -> Core Commands (Phase II Additions)

1. `load_hotkey_config()`
2. `update_hotkey_config(config)`
3. `get_permission_snapshot()`
4. `request_microphone_access()`
5. `insert_text(payload)`
6. `undo_last_insertion()`
7. `get_recent_insertions(limit?)`
8. `trigger_hotkey_action(action, phase)`

### Core -> UI Events (Phase II Additions)

1. `voicewave://hotkey` with `{ action, phase }`
2. `voicewave://permission` with permission snapshot payload
3. `voicewave://insertion` with insertion result payload

### UI -> Core Commands (Phase III Additions)

1. `list_model_catalog()`
2. `list_installed_models()`
3. `get_model_status(modelId)`
4. `download_model(request)`
5. `cancel_model_download(modelId)`
6. `set_active_model(modelId)`
7. `run_model_benchmark(request?)`
8. `get_benchmark_results()`
9. `recommend_model(constraints?)`
10. `get_session_history(query?)`
11. `set_history_retention(policy)`
12. `prune_history_now()`
13. `clear_history()`
14. `get_dictionary_queue(limit?)`
15. `approve_dictionary_entry(entryId, normalizedText?)`
16. `reject_dictionary_entry(entryId, reason?)`
17. `get_dictionary_terms(query?)`
18. `remove_dictionary_term(termId)`

### UI -> Core Commands (Phase V Additions)

1. `get_diagnostics_status()`
2. `set_diagnostics_opt_in(enabled)`
3. `export_diagnostics_bundle()`

### Core -> UI Events (Phase III Position)

1. Phase III currently reuses existing `voicewave://state`, `voicewave://transcript`,
   `voicewave://hotkey`, `voicewave://permission`, and `voicewave://insertion` events.
2. No Phase II event contracts were renamed or broken.

### Core -> UI Events (Phase V Additions)

1. `voicewave://latency` payload is extended additively with:
   - `watchdogRecovered`
   - `segmentsCaptured`
   - `releaseStopDetectedAtUtcMs`
2. Existing event names remain unchanged.

## Security and Privacy Constraints

1. No outbound audio transport in production path.
2. Checksum/signature validation for models and update artifacts.
3. Explicit permission checks with denial recovery UX.
4. Diagnostics export is user-triggered and revocable.

## Consequences

Positive:

1. Strong privacy posture and deterministic system boundaries.
2. High performance path in Rust core.
3. Clear UI-core contract for parallel team development.

Tradeoffs:

1. Higher complexity in cross-platform insertion/hotkey handling.
2. Requires careful contract versioning across Rust/UI boundaries.

## Non-Goals in this RFC

1. Final visual design system details.
2. Cloud-based rewrite/transcription.
3. Team collaboration and enterprise controls.
