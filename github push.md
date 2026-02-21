# GitHub Push Plan

Generated: 2026-02-16
Branch: `main`

## Preserved From Previous Doc (2026-02-14)

### Pushed In That Session (Done)

1. `3e95dd5` - `feat(asr): improve faster-whisper quality floor and speed pipeline telemetry`
2. `10cd6d1` - `feat(hud): add floating pill runtime and custom hotkey cue audio`

These were already pushed to `origin/main` in that older session.

### Previous Remaining Plan (Preserved)

#### Push 3 - Runtime Guardrails + Tooling

Commit message:

```text
fix(runtime): harden hotkey/settings/model safety and dev scripts
```

Files:

```text
package.json
src-tauri/src/hotkey/mod.rs
src-tauri/src/model_manager/mod.rs
src-tauri/src/settings/mod.rs
scripts/faster_whisper/reset-faster-whisper-runtime.ps1
```

Commands:

```bash
git add package.json src-tauri/src/hotkey/mod.rs src-tauri/src/model_manager/mod.rs src-tauri/src/settings/mod.rs scripts/faster_whisper/reset-faster-whisper-runtime.ps1
git commit -m "fix(runtime): harden hotkey/settings/model safety and dev scripts"
git push
```

#### Push 4 - Premium UI Motion + Settings/Popup Cleanup

Commit message:

```text
refactor(ui): deliver premium page motion and streamlined popup settings UX
```

Files:

```text
src/App.tsx
src/App.test.tsx
src/hooks/useVoiceWave.test.tsx
src/lib/stateLabel.ts
src/prototype/components/Dashboard.tsx
src/prototype/components/Layout.tsx
src/prototype/constants.ts
src/prototype/types.ts
src/styles.css
```

Commands:

```bash
git add src/App.tsx src/App.test.tsx src/hooks/useVoiceWave.test.tsx src/lib/stateLabel.ts src/prototype/components/Dashboard.tsx src/prototype/components/Layout.tsx src/prototype/constants.ts src/prototype/types.ts src/styles.css
git commit -m "refactor(ui): deliver premium page motion and streamlined popup settings UX"
git push
```

#### Push 5 - Governance + Handoff Notes

Commit message:

```text
docs(ops): update agent guardrails and handoff push planning
```

Files:

```text
AGENTS.md
FINAL_THINGS_TO_DO_BEFORE_RELEASE.md
github push.md
```

Commands:

```bash
git add AGENTS.md FINAL_THINGS_TO_DO_BEFORE_RELEASE.md "github push.md"
git commit -m "docs(ops): update agent guardrails and handoff push planning"
git push
```

## Today's New Plan (2026-02-16, Not Pushed)

Status: Prepare commits only. Do not push in this cycle.

### Scope Covered

This plan splits today's work into 3 separate commits across all currently modified tracked files:

```text
AGENTS.md
scripts/faster_whisper/worker.py
scripts/phaseB/run-phaseB-gpu-readiness.ps1
scripts/phaseB/run-phaseB-live-fw-report.ps1
src-tauri/src/audio/mod.rs
src-tauri/src/diagnostics/mod.rs
src-tauri/src/inference/faster_whisper.rs
src-tauri/src/inference/mod.rs
src-tauri/src/inference/policy.rs
src-tauri/src/state.rs
src/types/voicewave.ts
```

### Do Not Push / Do Not Stage

```text
.venv-faster-whisper/
.vibemap/
docs/phaseB/artifacts/fw-reset-backup-20260213-143659/
```

### Push A - Latency Telemetry + Reporting Clarity

Commit message:

```text
feat(telemetry): split release/final/inserted latency and improve live fw reporting
```

Files:

```text
src-tauri/src/state.rs
src-tauri/src/diagnostics/mod.rs
src-tauri/src/inference/policy.rs
src/types/voicewave.ts
scripts/phaseB/run-phaseB-live-fw-report.ps1
```

Commands:

```bash
git add src-tauri/src/state.rs src-tauri/src/diagnostics/mod.rs src-tauri/src/inference/policy.rs src/types/voicewave.ts scripts/phaseB/run-phaseB-live-fw-report.ps1
git commit -m "feat(telemetry): split release/final/inserted latency and improve live fw reporting"
```

### Push B - Faster-Whisper GPU Runtime Path

Commit message:

```text
feat(asr-gpu): enable stable fw cuda backend selection with runtime readiness checks
```

Files:

```text
scripts/faster_whisper/worker.py
scripts/phaseB/run-phaseB-gpu-readiness.ps1
src-tauri/src/inference/faster_whisper.rs
src-tauri/src/inference/mod.rs
```

Commands:

```bash
git add scripts/faster_whisper/worker.py scripts/phaseB/run-phaseB-gpu-readiness.ps1 src-tauri/src/inference/faster_whisper.rs src-tauri/src/inference/mod.rs
git commit -m "feat(asr-gpu): enable stable fw cuda backend selection with runtime readiness checks"
```

### Push C - Capture Safeguards + Governance Updates

Commit message:

```text
chore(stability): finalize capture safeguards and update agent guardrails
```

Files:

```text
src-tauri/src/audio/mod.rs
AGENTS.md
github push.md
```

Commands:

```bash
git add src-tauri/src/audio/mod.rs AGENTS.md "github push.md"
git commit -m "chore(stability): finalize capture safeguards and update agent guardrails"
```

## Quick Check Before Any Push

```bash
git status --short
```

## Current Authoritative Status (2026-02-17)

### Already Pushed To `origin/main`

1. `7444db3` - `feat(telemetry): split release/final/inserted latency and improve live fw reporting`
2. `4d6946e` - `feat(asr-gpu): enable stable fw cuda backend selection with runtime readiness checks`
3. `e432a6d` - `feat(pro-runtime): add local entitlement billing and pro command surfaces`

### Local Only (Committed, Not Pushed Yet)

1. `2f9acba` - `refactor(ui): polish pro workspace visuals and interaction styling`

### Local Uncommitted Files (Remaining)

```text
AGENTS.md
README.md
soul.md
checklist before production.md
```

### Do Not Stage / Do Not Push

```text
.venv-faster-whisper/
.vibemap/
docs/phaseB/artifacts/fw-reset-backup-20260213-143659/
u_o8xh7gwsrj-bubble_pop_1-476367.mp3
```

## Deferred 3-Push Plan (Completed)

Status: [x] Completed and pushed to `origin/main`.

- [x] Push 1 - Pro UI Polish
  - Commit: `2f9acba`
- [x] Push 2 - Product/Agent Context Docs
  - Commit: `be40de8` - `docs(context): update readiness notes and agent guardrails`
- [x] Push 3 - Ops Checklist + Push Plan Update
  - Commit: `b322985` - `docs(ops): refresh deferred push plan status`

## UI Deployment Plan (Progress Tracking)

Status: 3 of 5 deployments pushed to `origin/main`.

- [x] Deployment 1 - Foundation + Design Language Alignment
  - Commit: `e00daf8` - `refactor(ui-foundation): align radius, serif headings, and core surface tokens`
- [x] Deployment 2 - Home Glass Hierarchy Rebalance
  - Commit: `459459e` - `refactor(home): rebalance glass hierarchy and reduce heavy/uneven depth`
- [x] Deployment 3 - Cross-Page Consistency Pass
  - Commit: `df0be5e` - `refactor(ui-consistency): unify surface behavior across app pages`
- [ ] Deployment 4 - Tauri-Safe Animated Border Ring (Home Cards)
  - Planned commit message: `feat(home-visuals): add webview-safe animated gradient ring wrappers`
- [ ] Deployment 5 - Final Visual Polish (Performance Widget + Ring Tuning)
  - Planned commit message: `fix(home-polish): improve performance widget glass contrast and ring subtlety`

## Suggested Validation Before Each Future Push

```bash
npm run build
git status --short
```
