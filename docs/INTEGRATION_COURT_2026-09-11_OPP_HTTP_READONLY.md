# Integration Court — policy-bound read-only OPP HTTP adapter

## Current Reality

- Candidate branch: `codex/tinp-transport-policy-v01@9367f9a17216a34ea39a13081988c0a0b4fe577d`.
- Package remains private `@taowind/tinp-suite 0.1.0-alpha.13`; no release or main-branch merge was performed.
- TINP owns the transport/provider policy and receipt adapter. OPP remains the owner of CHP/RCP exchange semantics.
- The policy pins the vendored OPP observation profile at `f7b76582a720d9d18af5153affa0fc2d78bc0410`; this is an explicit dependency pin, not a claim that the snapshot equals the latest OPP candidate.

## What Changed

The adapter already provided HTTPS/GET-only access, exact host/path allowlists, bounded timeout and body size, denied ambient proxy/credentials/redirects, one attempt, JSON parsing, projection and rooted receipts. This follow-up hardens the remaining input and receipt boundaries:

- case-folded duplicate headers, non-enumerable properties and symbol properties fail closed;
- JSON arrays/scalars fail closed because this profile carries an object projection;
- a literal `__proto__` response field is projected as data without changing the result prototype;
- receipt validation requires a coherent `PASS` or `FAIL_CLOSED` relationship even when an attacker recomputes `receiptRoot`;
- the known Node `NODE_USE_ENV_PROXY`, `NODE_OPTIONS=--use-env-proxy` and `--use-env-proxy` paths fail closed before fetch.

## Evidence

- Machine evidence: [OPP_HTTP_READONLY_HARDENING_2026-09-11.json](../evidence/OPP_HTTP_READONLY_HARDENING_2026-09-11.json)
- Live public read: [OPP_HTTP_READONLY_GITHUB_2026-09-11.json](../evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json)
- Policy root: `0b0626c2784f40ab7afade7f69f9f7374710cc6fac621accd1089bac32cedc0d`
- Request root: `98683026a23aa9dcc444f28a03a52f778277b0547737a773b477f5ce2b02ad29`
- Existing live receipt root: `678062d0333113b7c3f3bba66ae3e93aeebdbf65bf401812d85f210c546dcf41`; it was revalidated after the hardening commit.

## Tests

- Adapter tests: `9/9 PASS`.
- Full TINP suite: `183/183 PASS`, `0` failed, `0` cancelled.
- The full run exercised the new adapter tests alongside existing authority, recovery, RCL, TCP/TLS loopback and security tests.

## Claims Promoted

- The TINP candidate now has tested fail-closed behavior for the added header, object-shape, prototype-key and receipt-semantic boundaries.
- One explicitly policy-bound GitHub JSON observation remains reproducible and root-bound.

These are candidate transport/provider claims only.

## Claims Still Forbidden

- No `THIRD_PARTY_VERIFIED` or universal OPP interoperability claim.
- No general HTTP/OpenAPI/MCP adapter claim.
- No cross-host, proxy-support, credential-custody, certificate-lifecycle, SLA or production claim.
- No authority lease, RCL Core change or K400 promotion.

## Remaining Production Gaps

`OPP-TRANSPORT-001` remains open: the adapter is unmerged, locally tested and not independently reviewed; external credential/certificate lifecycle, cross-host fault behavior, dynamic process-global dispatcher state and recovery remain outside the evidence.

`OPP-THIRD-PARTY-001` also remains open: GitHub supplied the observed bytes, but the executable provider is a TaoWind TINP candidate and the OPP consumer is an explicit local fixture.

## Next Frontier

Review this candidate in the OPP/TINP Integration Court, then obtain a separately owned provider or independently reproducible producer/consumer experiment. Preserve the current policy, request and receipt roots while expanding the boundary.

## Merge / Release Decision

Candidate branch only. Do not merge or release this as general network capability or as proof that OPP is production-grade interoperable infrastructure.
