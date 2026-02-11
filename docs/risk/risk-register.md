# Risk Register

## Scale

1. Severity: Low, Medium, High, Critical
2. Status: Open, Mitigating, Closed

## Active Risks

| ID   | Risk                                         | Severity | Trigger                                          | Mitigation                                                | Owner           | Status |
| ---- | -------------------------------------------- | -------- | ------------------------------------------------ | --------------------------------------------------------- | --------------- | ------ |
| R-01 | OS permission friction reduces activation    | High     | Permission completion < 70%                      | In-context permission education + clipboard-only fallback | Product + UX    | Open   |
| R-02 | Insertion failures in high-value apps        | High     | Two top apps < 95% success                       | App matrix ownership + per-app handling rules             | Core Eng        | Open   |
| R-03 | Model performance variance by hardware       | High     | > 25% users fail p95 latency gate                | Benchmark-driven model recommendations                    | ML/Perf         | Open   |
| R-04 | Update/signing pipeline errors               | Critical | Signature validation failure in pipeline         | Mandatory signature verification + rollback drills        | Release Eng     | Open   |
| R-05 | Scope creep before reliability goals         | Medium   | Unplanned features enter sprint before gates met | Phase discipline + change control ADRs                    | Product         | Open   |
| R-06 | Privacy messaging confusion from diagnostics | Medium   | User trust feedback negative                     | Plain-language diagnostics controls                       | Product + Legal | Open   |
| R-07 | Battery drain/thermal discomfort             | High     | > 12% drain over 30 minutes on Tier M            | Performance governor + model downshift policy             | Perf Eng        | Open   |

## Review Cadence

1. Weekly product review updates severity/status.
2. Weekly engineering review updates mitigation progress.
3. Launch blockers must be decisioned within 24 hours.
