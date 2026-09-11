# OPP read-only HTTP adapter candidate

## Owner decision

This adapter is a TINP transport/provider candidate. OPP remains the owner of CHP/RCP exchange semantics. The adapter binds a caller-selected read-only HTTP request to an explicit policy and a content-rooted receipt; it does not copy OPP negotiation code or grant authority.

The current policy fixture pins the vendored OPP source observed in TINP:

- repository: `https://github.com/xingxuling/OPP`
- commit: `f7b76582a720d9d18af5153affa0fc2d78bc0410`
- protocols: `opp.chp.v0.1`, `opp.rcp.v0.1`

This pin is intentionally explicit. It is not a claim that the vendored snapshot equals the latest OPP candidate branch.

## Policy boundary

`twni.opp-http-readonly-policy.v1` requires:

- HTTPS and `GET` only;
- exact host and path-prefix allowlists;
- a bounded timeout and response byte limit;
- redirects denied;
- ambient proxy variables and known Node environment-proxy switches denied;
- no credentials or credential-like request headers;
- exactly one fetch attempt;
- JSON response media type;
- an explicit top-level `responseFields` projection, or an empty list when the caller intentionally accepts the complete JSON object;
- `authorityGranted: false` and an explicit evidence-only boundary.

The policy root is the SHA-256 root of the policy body without `policyRoot`. The request root binds the exact URL, method, allowlisted headers and policy root.

## Receipt boundary

`twni.opp-http-readonly-receipt.v1` records the request root, policy root, HTTP status, selected response metadata, bounded response bytes, the full wire JSON root, the projected response root, error code, one-attempt/no-redirect/no-ambient-authority flags, and a receipt root. It is an observation receipt, not a signature, lease, authority grant, or production availability proof.

The adapter returns `PASS` only for a bounded successful JSON response whose declared projection is present. DNS/network failure, ambient proxy configuration, redirects, non-success status, oversized bodies, non-JSON responses, malformed JSON and missing projection fields return `FAIL_CLOSED` without retry.

## Candidate run

The fixture is intentionally scoped to one public GitHub repository read:

```text
npm run opp-http-readonly -- examples/opp-http-readonly/github-opp-policy.json examples/opp-http-readonly/github-opp-request.json --out <new-result-file.json>
```

Exit `0` means this concrete request produced a `PASS` receipt. Exit `5` means a receipt was produced with `FAIL_CLOSED`. Exit `1` means the policy/request input itself was invalid. The `--out` target must not already exist.

## Evidence boundary

The adapter can establish TINP-owned transport-policy behavior and one concrete host observation. It does not establish OPP third-party interoperability until an OPP consumer accepts the adapter output through an explicit bridge and both receipts are bound. It does not establish public-network availability, cross-host behavior, proxy support, production credentials, certificate lifecycle, SLA, or authority.

## alpha.16 hardening and verification

The adapter rejects accessor and symbol properties in policy, request headers,
environment and response metadata; preserves a literal `__proto__` projection key as data while rejecting malformed policy/request fields and encoded slash/dot/backslash path segments; snapshots response status
and success metadata before reading the bounded body; and requires receipt
consistency for both `PASS` and `FAIL_CLOSED`. The deterministic verifier stores
the local pass and ambient-proxy rejection under
`evidence/0.1.0-alpha.16/opp-http-readonly.json`. The separately captured
GitHub result remains a single public observation and is not used as an
authority or interoperability gate.

The alpha.16 verifier also rejects `NODE_USE_ENV_PROXY`, `NODE_OPTIONS=--use-env-proxy`, and `execArgv` proxy switches as ambient proxy configuration. Dynamic global dispatcher changes remain outside this adapter's observation boundary.
