# VoiceWave Monetization (Windows First)

## Pricing

- Base price: `~$4/mo~`
- Launch offer: `$1.50/mo`
- Offer rule: first 3 months at $1.50, then $4/month

## Entitlement Model

Entitlement status values:

- `free`
- `pro_active`
- `grace`
- `expired`
- `owner_override`

Storage:

- Encrypted local store at config path: `billing.json`
- Encrypted key file: `billing.key`

## Billing Commands

Tauri command surface:

1. `get_entitlement_snapshot`
2. `start_pro_checkout`
3. `refresh_entitlement`
4. `restore_purchase`
5. `open_billing_portal`
6. `set_owner_device_override`

## Owner Device Override

- Hidden owner flow is in the `Pro` screen.
- Owner verification uses `VOICEWAVE_OWNER_PASSPHRASE_HASH`.
- Debug fallback (dev only): passphrase `Rishi`.
- When enabled, UI shows `Owner Pro (Device Override)` and all Pro gates unlock.

## Free vs Pro

Free:

- Unlimited local dictation.
- Baseline transcript sanitize/finalize behavior.
- Baseline dictionary queue approvals.
- Baseline session timeline + retention controls.

Pro:

- Advanced Formatting Engine (`formatProfile`).
- Domain Dictionaries (`activeDomainPacks`).
- App-Aware Profile target behavior (`appProfileOverrides`).
- Code Mode (`codeMode`).
- Better post-processing polish (`proPostProcessingEnabled`).
- Advanced history: search, tags, starred state, export presets.

## Local-Only Guardrail

- ASR path remains fully local.
- Pro processing is deterministic local post-processing.
- No cloud rewrite path is introduced by this monetization layer.
