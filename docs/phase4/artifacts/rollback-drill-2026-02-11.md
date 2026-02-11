# Rollback Drill Artifact (Windows)

Date: 2026-02-11  
Scope: Phase IV release hardening drill

## Build Identifiers

1. Web build artifact hash:
   - `dist/assets/index-7QaYOSKN.js`
2. Runtime launch artifact path:
   - `C:\\voicewave-tauri\\target-gnu\\x86_64-pc-windows-gnu\\debug\\voicewave_core.exe`

## Procedure

1. Validate baseline bundle:
   - `npm run test -- --run` -> pass
   - `npm run build` -> pass
   - `npm run phase3:validate` -> pass
2. Run desktop runtime smoke:
   - `npm run tauri:dev`
   - log captured in `docs/phase4/artifacts/global-hotkey-runtime-smoke-2026-02-11.log`
3. Rollback simulation:
   - stop runtime wrappers and stale processes
   - relaunch validated runtime via standard wrapper (`scripts/tauri/run-tauri-dev-windows.ps1`)
   - confirm stable startup state after relaunch

## Result

1. Baseline checks remained green after restart/relaunch rollback simulation.
2. Desktop runtime reached stable startup state on relaunch.
3. No integrity regression observed in baseline command bundle post-drill.
