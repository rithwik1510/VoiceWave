# VoiceWave Test Strategy

## Objectives

1. Protect reliability and insertion success before feature breadth.
2. Enforce local-only privacy posture.
3. Prevent regressions across Windows and macOS.

## Test Pyramid

1. Unit tests for deterministic logic:
   - audio transforms
   - VAD boundaries
   - insertion decision tree
   - checksum validation
2. Integration tests for module interaction:
   - audio -> inference -> transcript
   - permissions denial/recovery flows
   - model install/switch lifecycle
3. E2E tests for user workflows:
   - dictation start/stop in app matrix
   - fallback insertion behavior
   - state indicator transitions
4. Manual exploratory QA:
   - edge app behavior
   - keyboard layouts
   - focus switching and interruptions

## Required Test Categories

1. Functional correctness
2. Performance/resource usage
3. Accuracy benchmark (WER/CER corpus)
4. Security/privacy checks
5. Migration/upgrade compatibility
6. Failure recovery and chaos checks

## Release-Blocking Conditions

1. Security-critical tests fail.
2. Insertion success or crash-free thresholds regress below gate.
3. Legal/compliance checklist incomplete.

## Metrics Linked to Gates

1. p95 latency <= 900 ms on reference mid-tier device (`small.en`).
2. Crash-free sessions >= 99.5%.
3. Insertion success >= 98%.
4. Permission completion >= 85%.
5. TTFSD <= 3 minutes.

## CI Mapping

Phase 0 baseline CI enforces:

1. Docs format/lint.
2. Secrets scan.
3. Phase 0 artifact integrity.

Phase 1+ will add:

1. Rust compile/test/lint jobs.
2. Frontend compile/test/lint jobs.
3. Performance benchmark smoke checks.
