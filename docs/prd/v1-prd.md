# VoiceWave v1 PRD

## 1. Product Intent

VoiceWave provides fast, reliable, privacy-first desktop dictation for professionals on Windows and macOS.

North star: users can speak and see accurate text in target apps in under 2 seconds for typical utterances on supported hardware.

## 2. User Segments

1. Knowledge workers drafting docs, chat, and email.
2. Developers and operators dictating notes/commands.
3. Users with RSI or typing fatigue.

## 3. v1 Scope

1. Local-only inference path.
2. Windows + macOS.
3. Global hotkey dictation (push-to-talk and toggle).
4. Insertion fallback chain (direct paste, clipboard fallback, history fallback).
5. Model download and checksum verification.
6. Local settings/history/stats with retention controls.
7. Signed installers and signed auto-updates.
8. English-first quality tuning.

## 4. v1 Non-Goals

1. Linux support.
2. Cloud fallback transcription.
3. Enterprise SSO/admin features.
4. Full multilingual parity.
5. Team collaboration feature set.

## 5. Locked Decisions

1. Frontend: React + Tailwind inside Tauri 2.
2. `Frontend .png` is the official v1 visual baseline.
3. v1 remains strictly local-only.
4. Battery target: <= 12% drain over 30 minutes active dictation on reference laptop.
5. Launch support matrix:
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

## 6. Success Metrics

### Product

1. Insertion success rate >= 98%.
2. Permission completion rate >= 85%.
3. Correction rate <= 12% in beta cohort.
4. Time-to-first-successful-dictation <= 3 minutes.
5. First-session activation >= 80%.

### System

1. p95 end-to-end latency <= 900 ms on reference mid-tier device using small.en.
2. Crash-free sessions >= 99.5%.
3. Cold start <= 2.5 s on reference hardware.
4. Real-time factor <= 0.7 for recommended model.

## 7. Phase 0 Deliverables

1. PRD (this document).
2. Architecture RFC.
3. Test strategy and hardware tiers.
4. Competitive benchmark with parity map.
5. Risk register.
6. Threat model document.
7. ADR framework and initial locked-decision ADR.
8. CI smoke/static checks.

## 8. Exit Criteria for Phase 0

1. Scope signed off.
2. Quality gates approved.
3. CI baseline green.
