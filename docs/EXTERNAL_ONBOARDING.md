# External onboarding — 2026-09-12

Audit baseline: `78f4362df693197d5b0ed7bfcfe9591c0bbd58c5`, default branch
`codex/next-internet-v01`. Working branch: `codex/tinp-external-onboarding-v01`.
The newer default branch was audited rather than assuming the earlier alpha.29
checkout was current. Existing native HTTPS change `a9e10b9` was adapted while
preserving newer response/environment validation.

Five independently maintained projects were attempted jointly with OPP:

| Project | Actual execution | Result / failure / recovery |
| --- | --- | --- |
| Boltons 26.2.0 | Installed Python package under OPP, human adapter | PASS; TypeError negative; explicit corrected invocation PASS |
| more-itertools 11.1.0 | Installed Python package under OPP, human adapter | PASS; TypeError negative; explicit corrected invocation PASS |
| JMESPath 1.1.0 | Installed Python package under OPP, human adapter | PASS; JMESPathTypeError negative; explicit corrected invocation PASS |
| [Open-Meteo](https://open-meteo.com/en/docs) | Real public HTTPS endpoint, TINP native HTTPS | 200 PASS → invalid latitude 400 FAIL_CLOSED → 200 PASS |
| [go-httpbin / httpbingo](https://github.com/mccutchen/go-httpbin) | Real public HTTPS endpoint, TINP native HTTPS | All three probes returned 402; recovery NOT_VERIFIED |

The 402 cause is unknown. We neither supplied payment nor assumed a successful
503 failure injection. The combined HTTP script correctly reported INCOMPLETE.
All six result files, including failures, passed offline structural/root checks.
That is evidence consistency, not six successful service calls.

The initial API runs took 4.878 seconds for Open-Meteo and 5.527 seconds for the
incomplete httpbingo scenario. Library timing and source/discovery records are in
the companion OPP evidence directory. Timings cover automated calls, not installation
or human onboarding: human duration remains NOT_MEASURED. Human choices included
library operations, adapters, JSON contracts, permitted URLs and response fields.

The [HTTP machine report](../evidence/external-onboarding-2026-09-12/live/summary.json)
retains automatic recognition, manual intervention, failure, recovery and receipt
status. Three `*-acceptance.json` files retain Node verification of real OPP library
results. [Package smoke](../evidence/external-onboarding-2026-09-12/package-smoke.json)
records import from a separately installed npm package, actual Open-Meteo 200,
offline replay and tamper rejection while global fetch was disabled.

## What this closes

- A documented import path for the existing read-only Provider/receipt surface.
- Native HTTPS at both direct adapter and live orchestration entry points.
- Source-independent npm installation and actual remote provider execution.
- Reproducible third-party library and remote API probes, including negative evidence.

## What this leaves open

This is still a local operator. The three libraries do not run inside TINP's
authorized A→B→C route, and the public services do not negotiate OPP. General SDK
Provider registration, real MCP server/client integration, externally authorized
capability failover, durable external-side-effect recovery, two physical hosts,
Authority Provider, hardware custody, trusted time and independent security audit
are not established. Production remains NOT_DEPLOYED.

The highest-leverage continuation is to connect a reviewed external read-only
capability to the existing authorized provider path and test it on independently
identified physical devices. Keys/authority must come from their real owner, not
from another local test issuer. See [public SDK](PUBLIC_SDK.md) and
[external acceptance gates](EXTERNAL_ACCEPTANCE_GATES.md).

Final code replay: [34692507409](https://github.com/xingxuling/TINP/actions/runs/34692507409), all three hosted jobs PASS; OPP `7c4970c`, TINP `692c0e4`. The earlier run is retained as historical evidence.
