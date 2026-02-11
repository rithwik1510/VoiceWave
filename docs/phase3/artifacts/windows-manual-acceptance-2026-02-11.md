# Windows Manual Acceptance - Rescue Cycle

Date: 2026-02-11  
Scope: VoiceWave rescue baseline validation on target Windows machine

## How To Mark Results

1. For each check row, mark exactly one option as checked (`[x]`) and keep the other option unchecked (`[ ]`).
2. Keep unchecked option as `[ ]` so readiness scripts can parse pass markers cleanly.

## Automated Preconditions

1. `npm run test -- --run` -> pass (`3` files, `7` tests)
2. `npm run build` -> pass
3. `npm run phase3:validate` -> pass

## Runtime Smoke

1. `npm run tauri:dev` launches successfully: [x] pass / [ ] fail
2. Models panel loads and shows catalog rows: [ ] pass / [ ] fail
3. Install `tiny.en` succeeds: [ ] pass / [ ] fail
4. Install `small.en` succeeds: [ ] pass / [ ] fail
5. Switching active model between `tiny.en` and `small.en` succeeds: [ ] pass / [ ] fail

## Dictation Acceptance (Core 3 Targets)

1. Notepad short dictation usable (quality + insertion): [ ] pass / [ ] fail
2. Notepad medium dictation usable (quality + insertion): [ ] pass / [ ] fail
3. VS Code short dictation usable (quality + insertion): [ ] pass / [ ] fail
4. VS Code medium dictation usable (quality + insertion): [ ] pass / [ ] fail
5. Browser text field/editor short dictation usable: [ ] pass / [ ] fail
6. Browser text field/editor medium dictation usable: [ ] pass / [ ] fail

## Quality and Safety Checks

1. No inserted transcript contains `[BLANK_AUDIO]`-style artifacts: [ ] pass / [ ] fail
2. Low-quality microphone warning appears when applicable: [ ] pass / [ ] fail
3. Warning recovery action can switch input device: [ ] pass / [ ] fail
4. Warning recovery action can reset VAD to recommended: [ ] pass / [ ] fail
5. Cancel/stop remains responsive during live dictation: [ ] pass / [ ] fail

## Notes / Observations

- Hardware:
- Input device used:
- Active model used:
- Transcript quality comments:
- Insertion reliability comments:
- Open blockers:
