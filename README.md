# VoiceWave

VoiceWave is a privacy-first desktop dictation app.
The core speech-to-text engine for v1 is **whisper.cpp** (local, on-device, no cloud audio path).

## Product Direction (Locked)

1. We use upstream whisper.cpp-compatible models (`tiny.en`, `base.en`, `small.en`, `medium.en`).
2. We are not training or building a custom ASR model.
3. v1 remains strict local-only.
4. Current execution scope (2026-02-10): Windows-only implementation/validation; macOS validation is deferred until hardware is available.

## Current Status (Honest)

1. Phase 0: complete (planning/governance baseline).
2. Phase 1: complete for Windows runtime integration.
   - Microphone mode uses `whisper.cpp` via `whisper-rs`.
   - Fixture mode remains for deterministic test/harness paths.
3. Phase 2: implemented and validated in current Windows execution scope.
4. Phase 3: implemented and validated for the Windows rescue baseline.
   - Model manager/history/dictionary surfaces are wired.
   - Hardware-tier recommendation artifact is published.
   - Transcript sanitization removes non-user artifacts (for example `[BLANK_AUDIO]`) before insertion/history/dictionary ingestion.
   - Microphone quality warning + one-click recovery actions are wired in UI.
5. Formal phase closeout gates remain open where explicitly documented (for example full >= 30 minute battery evidence).
6. Manual workflow acceptance in Notepad + VS Code + browser editor is required on target hardware before release packaging.
7. Phase 4 hardening/readiness execution is complete on this branch (`npm run phase4:gate` passes).
8. Phase 5 readiness pack is prepared; Phase 5 implementation has not started (awaiting explicit go-ahead).
9. Phase 6: not started.
10. Remaining pre-release items:
   - Full manual acceptance checklist rows for Notepad + VS Code + browser dictation workflow still need to be completed on target hardware.
   - 30-minute sustained battery gate is deferred to Phase VI pre-GA by documented marker (`docs/phase4/evidence/battery-deferment.md`).
11. Pro monetization rollout is now implemented for Windows baseline:
   - Encrypted local entitlement store with owner-device override.
   - Pro nav and pricing UI (`~$4/mo~` and `$1.50/mo` launch offer).
   - Real Pro-gated controls: format profiles, domain packs, code mode, app-aware profile target, advanced history search/tag/star/export.
   - Free dictation path remains unchanged (local-only, no daily cap).

## Stack

1. Frontend: React + Tailwind + Vite
2. Desktop shell: Tauri 2
3. Core runtime: Rust
4. ASR runtime target: whisper.cpp integration from Rust

## Run

1. Install dependencies: `npm install`
2. Frontend mode: `npm run dev`
3. Tests: `npm run test -- --run`
4. Frontend build: `npm run build`
5. Phase I validation: `npm run phase1:validate`
6. Phase I sustained battery/thermal run: `npm run phase1:battery`
7. Phase II validation: `npm run phase2:validate`
8. Phase III validation: `npm run phase3:validate`
9. Phase IV readiness report: `npm run phase4:prep`
10. Phase IV readiness gate (blocking): `npm run phase4:gate`
11. Phase V readiness report: `npm run phase5:prep`
12. Phase V readiness gate (blocking): `npm run phase5:gate`
13. Phase V reliability report: `npm run phase5:reliability`
14. Phase V reliability gate (blocking): `npm run phase5:reliability:gate`
15. Native Tauri dev (after Rust + Tauri prerequisites): `npm run tauri:dev`
16. In-app: open `Models` and install `tiny.en` or `base.en`, then use `Home` mic button.

## Source of Truth

1. Product plan and corrected phase gates: `Idea.md`
2. Phase recovery archive: `docs/PHASE_RECOVERY_PLAN.md`
3. Shared agent rules and mistake log: `AGENTS.md`
4. Agent kickoff context: `AGENT_START.md`
5. Architecture RFC: `docs/rfc/0001-system-architecture.md`
6. Test strategy: `docs/testing/test-strategy.md`
7. Hardware tiers: `docs/testing/hardware-tiers.md`
8. Phase status docs:
   - `docs/PHASE1_IMPLEMENTATION.md`
   - `docs/PHASE2_IMPLEMENTATION.md`
   - `docs/PHASE3_IMPLEMENTATION.md`
   - `docs/PHASE3_REMAINING.md`
   - `docs/PHASE4_READINESS.md`
   - `docs/PHASE5_READINESS.md`
9. Monetization + entitlement behavior: `docs/monetization.md`

## CI

Workflow: `.github/workflows/ci.yml`

1. Docs formatting check (Prettier)
2. Markdown lint
3. Secrets scan (gitleaks)
4. Phase 0 artifact integrity check
5. Frontend tests and build
6. Rust no-default-features tests
7. Rust desktop-feature compile path (`--no-run`)

## Local Verification

```powershell
# Phase 0 artifact checks
& "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File .\scripts\ci\check-phase0-artifacts.ps1
```

## Latest Validation Evidence (2026-02-17)

1. `npm run test -- --run`
   - Result: `3 passed` test files, `12 passed` tests.
   - Output excerpt: `Test Files  3 passed (3)` / `Tests  12 passed (12)` / `Duration 2.73s`
2. `npm run build`
   - Result: Vite production build succeeded (`built`).
   - Output excerpt: `built in 3.00s`
3. `npm run phase3:validate`
   - Result: script completed successfully, including no-space Windows strategy and Rust desktop compile path.
   - Rust result: desktop compile and quality-guard test paths completed (with documented desktop-runtime fallback warnings in this environment).
4. Hardware-tier recommendation evidence
   - `docs/testing/hardware-tier-recommendation-windows.json`
5. Local-state rescue utility
   - `scripts/support/backup-reset-local-state.ps1`
   - Usage and safety notes: `docs/troubleshooting/local-state-recovery.md`
6. Phase IV readiness gate
   - `npm run phase4:gate`
   - Result: pass, including completed Phase IV evidence docs and approved battery deferment marker.

