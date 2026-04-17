# Phase V Beta Ops Runbook

Owner: Posan (Product) + Codex (Core Eng)

## Escalation

1. Launch-blocking defect triage SLA: decision within 24 hours.
2. Severity routing:
   - Critical: stop beta rollout and execute rollback plan.
   - High: hotfix candidate within same cycle.
   - Medium/Low: weekly reliability review queue.

## Rollout Waves

1. Wave 0 (internal): engineering + product dogfood only.
2. Wave 1 (10 users): external private beta after release gate is green.
3. Wave 2 (25 users): expand only after 7 consecutive stable days in Wave 1.
4. Expansion stop rule: pause expansion when any release SLO is breached for 2 consecutive days.

## Incident Thresholds

1. Crash-free sessions < 99.5% over trailing 24h.
2. Insertion success < 98.0% over trailing 24h.
3. Correction rate > 12.0% over trailing 24h.
4. TTFSD > 3.0 minutes over trailing 24h.
5. Any Severity Critical customer-impacting defect.

## Rollback triggers

1. Any Incident Threshold breach that persists 2 consecutive days.
2. A Severity Critical defect with no validated hotfix inside SLA window.
3. Update integrity or signing verification failure.
4. Repeated regression in compatibility matrix for core apps (Notepad/VS Code/Browser).

## Daily Beta Operations

1. Review crash-free sessions trend.
2. Review insertion success trend.
3. Review correction rate trend on defined beta tasks.
4. Review top support/diagnostic themes and assign owners.

## Weekly Reliability Review

1. Run `docs/phase5/reliability-review-template.md`.
2. Update compatibility coverage from `docs/phase5/compatibility-matrix-template.md`.
3. Update usability findings from `docs/phase5/usability-study-template.md`.

## Exit Gate Reminder

1. Crash-free sessions >=99.5%.
2. Insertion success >=98%.
3. Correction rate <=12%.
4. TTFSD <=3 minutes and first-session activation >=80%.
5. Release gate (`npm run release:gate`) is green in local and CI.
