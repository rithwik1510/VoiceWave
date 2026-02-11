# Phase V Beta Ops Runbook

Owner: Posan (Product) + Codex (Core Eng)

## Escalation

1. Launch-blocking defect triage SLA: decision within 24 hours.
2. Severity routing:
   - Critical: stop beta rollout and execute rollback plan.
   - High: hotfix candidate within same cycle.
   - Medium/Low: weekly reliability review queue.

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
