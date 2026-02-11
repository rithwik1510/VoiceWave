# ADR 0001: Phase 0 Locked Decisions

## Status

Accepted

## Context

The project needs decision stability for multi-agent parallel execution across phases.
Without locked baselines, implementation risks drift in architecture, UI expectations, and launch criteria.

## Decision

Adopt the following locked decisions for v1:

1. Frontend stack is React + Tailwind in Tauri 2.
2. `Frontend .png` is the official v1 visual baseline.
3. v1 remains strictly local-only with no cloud rewrite path.
4. Battery target is <= 12% drain over 30 minutes active dictation on reference laptop.
5. Official v1 support matrix is fixed to:
   - Chrome
   - Edge
   - Safari (macOS)
   - Google Docs (browser)
   - Slack (desktop/web)
   - Notion (desktop/web)
   - VS Code
   - Cursor
   - Notepad (Windows)
   - Notes (macOS)
6. CI platform is GitHub Actions.
7. Architecture decision process uses Nygard ADR format.
8. Competitive benchmark peers for Phase 0 are Wispr Flow, Raycast, Superwhisper, and MacWhisper.

## Consequences

### Positive

1. Multi-agent work can proceed with fewer interpretation conflicts.
2. Phase boundaries and acceptance criteria become auditable.
3. Architecture and product decisions are traceable from first phase.

### Tradeoffs

1. Some flexibility is reduced without explicit follow-up ADR updates.
2. Changes to locked assumptions require formal decision updates.

### Follow-up

1. Future changes to these decisions must be recorded in a new ADR.
2. PRs that conflict with this ADR must include superseding rationale.
