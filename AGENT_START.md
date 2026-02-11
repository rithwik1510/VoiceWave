# VoiceWave Agent Start

This file is the kickoff context for all agents working in this repo.

## Source of Truth

- Product and phase plan: `Idea.md`
- Visual baseline prototype: `Frontend .png`
- Shared working rules and corrections: `AGENTS.md`

## Locked Decisions (Approved)

1. Frontend stack: React + Tailwind.
2. Prototype lock: current prototype is the official v1 visual baseline.
3. Official v1 launch support matrix (top 10):
   - Chrome
   - Edge
   - Safari (macOS)
   - Google Docs (in browser)
   - Slack (desktop/web)
   - Notion (desktop/web)
   - VS Code
   - Cursor
   - Notepad (Windows)
   - Notes (macOS)
4. Battery target: <= 12% drain over 30 minutes of active dictation on reference laptop.
5. Cloud policy for v1: strictly local-only (no cloud rewrite path in v1).
6. CI platform baseline: GitHub Actions.
7. ADR format baseline: Nygard ADR format.
8. Phase 0 benchmark peers: Wispr Flow, Raycast, Superwhisper, MacWhisper.
9. ASR runtime for v1: whisper.cpp integration (no custom ASR model path).

## Phase Ownership

- Default assignment in this file may be overridden by explicit in-session user reassignment.
- Other agents can execute parallel phases, but must still follow `AGENTS.md` and phase gates in `Idea.md`.

## Parallel Integration Protocol

1. Parallel phase implementation is allowed in this shared workspace.
2. Agents must not remove or overwrite files from other active phase streams.
3. Any newly introduced scaffold must be integrated into CI/governance checks in the same cycle.
4. Shared contracts are non-negotiable: local-only v1 policy, deterministic state model, and locked support matrix.

## Required Start Checklist For Any Agent

1. Read `AGENT_START.md`.
2. Read `AGENTS.md`.
3. Confirm assigned phase boundaries before editing code.
4. If any mistake, conflict, or missing rule is found, update `AGENTS.md` immediately in the same work cycle.
