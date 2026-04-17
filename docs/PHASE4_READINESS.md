# VoiceWave Phase IV Readiness

Date: 2026-02-11  
Scope: Windows-only execution override

## Purpose

Track and verify Phase IV (`Hardening, Security, and Release Pipeline`) readiness and execution evidence.

## Current Readiness Summary

1. Core baseline is stable:
   - `npm run test -- --run` passes.
   - `npm run build` passes.
   - `npm run phase3:validate` passes.
2. Phase IV readiness gate is green:
   - `npm run phase4:gate` passes.
3. Phase IV evidence docs are complete:
   - `docs/phase4/evidence/global-hotkey-windows.md`
   - `docs/phase4/evidence/update-signing-verification.md`
   - `docs/phase4/evidence/rollback-drill.md`
4. Battery gate handling for this phase:
   - Current artifact reports `duration_minutes=31.85`.
   - Battery duration requirement is satisfied for Phase IV gate inputs.
   - New release flow still requires fresh battery evidence at release-candidate time.

## Phase IV Start Checklist

1. Baseline validation green on current branch:
   - `npm run phase3:validate`
2. Security and architecture references are present:
   - `docs/security/threat-model-v1.md`
   - `docs/risk/risk-register.md`
   - `docs/testing/test-strategy.md`
3. Manual dictation acceptance recorded:
   - Latest `docs/phase3/artifacts/windows-manual-acceptance-*.md`
4. Battery evidence meets gate:
   - `docs/phase1/phase1-battery-thermal-windows.json` shows >=30.0 minutes with hardware context.
5. Phase IV evidence docs completed:
   - `docs/phase4/evidence/global-hotkey-windows.md`
   - `docs/phase4/evidence/update-signing-verification.md`
   - `docs/phase4/evidence/rollback-drill.md`

## Automation

1. Readiness report (non-blocking):
   - `npm run phase4:prep`
2. Gate mode (blocking):
   - `npm run phase4:gate`

## Notes

1. This document tracks readiness and execution evidence only; broader release milestones remain in `Idea.md`.
2. Battery deferment marker remains historical context only; active release gates now require fresh evidence windows.
