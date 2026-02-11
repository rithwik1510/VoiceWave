# Contributing to VoiceWave

## Working Model

1. Follow `Idea.md` phase gates.
2. Follow `AGENT_START.md` and `AGENTS.md` before making changes.
3. Stay within assigned phase boundaries.

## Branch and Review Rules

1. No direct commits to main.
2. Open a PR for all changes.
3. Use `.github/pull_request_template.md`.
4. Security-sensitive changes require additional reviewer attention.

## Required PR Content

1. Problem statement
2. Scope and non-scope
3. Test evidence
4. Risks and rollback plan

## Architecture Decision Records

1. Use Nygard ADR format in `docs/adr/`.
2. Add a new ADR for architecture-impacting changes.
3. Link related ADRs in PR description.

## Phase Discipline

1. Phase 0: governance, documentation, CI baselines.
2. Phase 1+: implementation features per `Idea.md`.
3. Do not pull future-phase features into current phase unless reassigned.

## Mistake Handling (Mandatory)

When a mistake or inconsistency is found:

1. Update `AGENTS.md` in the same work cycle.
2. Add entry under `Mistake Log`.
3. Add a prevention rule.
