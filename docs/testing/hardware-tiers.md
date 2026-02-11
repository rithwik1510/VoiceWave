# Reference Hardware Tiers

## Purpose

Define stable reference devices for performance and battery validation.

## Tier Definitions

### Tier L (Low)

1. CPU: 4-core mobile class
2. RAM: 8 GB
3. Storage: SSD
4. OS: latest supported Windows/macOS
5. Intended model default: `tiny.en` or `base.en`

### Tier M (Mid, Primary Gate Device)

1. CPU: 6-8 core modern mobile class
2. RAM: 16 GB
3. Storage: SSD
4. OS: latest supported Windows/macOS
5. Intended model default: `small.en`

### Tier H (High)

1. CPU: 8+ core high-performance class
2. RAM: 16-32 GB
3. Storage: SSD
4. OS: latest supported Windows/macOS
5. Intended model default: `medium.en`

## Gate Metrics by Tier

1. Tier M p95 end-to-end latency: <= 900 ms (`small.en`)
2. Tier M cold start: <= 2.5 s
3. Tier M battery drain: <= 12% over 30 minutes active dictation
4. All tiers must meet insertion reliability gate in supported app matrix

## Benchmark Procedure (Phase 1+)

1. 30-minute sustained dictation workload.
2. Record CPU, memory, thermal indicators, and battery deltas.
3. Run same utterance corpus per model tier.
4. Capture p50/p95/p99 latency and real-time factor.

## Latest Windows Evidence

1. Recommendation artifact: `docs/testing/hardware-tier-recommendation-windows.json`
2. Current Tier M recommendation: `small.en` (highest-capability model within p95/RTF gates).
3. Battery signoff is still pending because current capture duration is below 30 minutes.
