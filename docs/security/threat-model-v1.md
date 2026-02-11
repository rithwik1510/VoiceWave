# VoiceWave v1 Threat Model

## Scope

This threat model covers VoiceWave v1 desktop application behavior on Windows and macOS.
v1 scope is local-only dictation with no outbound audio transport.

## Assets

1. Live microphone audio in memory
2. Transcripts and quick history
3. Model binaries and manifests
4. Signing keys and update metadata
5. Local settings and diagnostics exports

## Trust Boundaries

1. OS boundary (permissions, key events, clipboard APIs)
2. App boundary (UI process and Rust core)
3. Artifact boundary (downloaded models and update payloads)
4. User boundary (explicit opt-in diagnostics export)

## Threat Actors

1. Local malware tampering with model/update files
2. Network attacker attempting artifact substitution
3. Misconfigured telemetry/diagnostics leaking sensitive content
4. Privilege misuse through over-broad permission prompts

## Primary Threats and Mitigations

| Threat                                | Risk                                        | Mitigation                                                              |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Model tampering                       | Malicious transcription behavior or crashes | Signed manifest, sha256 validation, fail-closed quarantine              |
| Update tampering                      | Remote code execution risk                  | Signature verification before install, rollback manifests               |
| Excessive permission scope            | User trust erosion and abuse surface        | Ask just-in-time permissions with plain-language rationale              |
| Sensitive data leakage in diagnostics | Privacy breach                              | Opt-in diagnostics export, redaction pipeline, no raw audio by default  |
| Clipboard interception edge case      | Transient data exposure                     | Minimize clipboard retention window and surface fallback states clearly |

## Security Requirements (v1)

1. No unresolved high/critical findings at release gate.
2. Signed binaries and signed updates verified in CI and release checks.
3. Model checksum/signature validation enforced before activation.
4. Diagnostics export remains user-triggered and revocable.

## Residual Risks

1. Host compromise on end-user machine cannot be fully mitigated by app-level controls.
2. Clipboard fallback has unavoidable OS-level exposure window.
3. Third-party dependency vulnerabilities require continuous patch cadence.

## Validation Plan

1. Security tests for model/update verification paths.
2. Red-team style checks for diagnostics leakage.
3. Permission denial/recovery flow verification.
4. Release checklist requiring security gate sign-off.
