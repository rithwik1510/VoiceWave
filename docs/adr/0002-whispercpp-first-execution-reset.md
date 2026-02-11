# 0002 - Whisper.cpp-First Execution Reset

## Status

Accepted

## Context

Phase documentation and implementation progress drifted:

1. Product plan locked whisper.cpp as the ASR engine.
2. Runtime inference still contained a mock decode path.
3. Later phase work (model manager/UI wiring) advanced before confirming real whisper.cpp inference path closure.

This created confusion about what was "implemented" versus what was actually production-real.

## Decision

We reset execution order and acceptance rules:

1. Whisper.cpp integration is a hard requirement for Phase 1 completion.
2. No phase can be marked complete if its core runtime dependency is still mock-only.
3. Phase 2 and Phase 3 outputs remain valid as infrastructure, but final signoff depends on real whisper.cpp runtime validation.
4. Documentation must explicitly separate:
   - implemented scaffolding
   - validated production behavior

## Consequences

1. Documentation is now explicit about current partial status.
2. Next execution priority is replacing mock inference with whisper.cpp decode path and proving end-to-end transcript flow.
3. Phase 2 and 3 validation will be re-run after whisper.cpp integration to produce trustworthy handoff evidence.
