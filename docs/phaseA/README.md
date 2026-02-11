# Phase A CPU Latency Artifacts

Place generated CPU latency evidence in `docs/phaseA/artifacts/` using this filename pattern:

- `cpu-latency-YYYY-MM-DD.json`

Use:

- `npm run phaseA:cpu:generate` to run the live Phase A CPU sweep (real whisper runtime path).
- `npm run phaseA:cpu` for non-blocking checks.
- `npm run phaseA:cpu:gate` for blocking gate checks.

Expected JSON shape:

```json
{
  "generatedAtUtc": "2026-02-11T00:00:00Z",
  "releaseToTranscribingP95Ms": 250,
  "cacheHitRatio": 0.8,
  "decodeFailureRate": 0.0,
  "emptyDecodeRate": 0.0,
  "longUtteranceTailLossCount": 0,
  "smallEn": {
    "p50ReleaseToFinalMs": 4000,
    "p95ReleaseToFinalMs": 5000
  }
}
```
