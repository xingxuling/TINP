# Independent security / Integration Court review

Initial review: 2026-09-10. Reviewer inspected identity, evidence, routing, transport, node service and suite orchestration. No source edits were made by the reviewer. Three adversarial integration tests were added in `tests/security-review.test.mjs`; each starts three actual child processes and sends the attack over the actual loopback UDP forwarding path. Initial command `node --test tests/security-review.test.mjs` returned exit 1: all three tests failed with `Missing expected rejection`, confirming unintended executions. Findings below describe that initial source state; the implementing agent must separately record remediation/retest.

## P1 — An accepted session evidence anchor can authorize divergent subsequent executions

Initial `src/node-process.mjs:53` tests only request.previousEvidenceRoot == session.expectedEvidenceRoot. The service does not consume the anchor or bind it to a previously accepted request. Its replay map (`:56-59`) is keyed by sessionId/requestId, so a valid subject can reuse the same authority-signed session and lease, change requestId and payload, and obtain another executed receipt with the same predecessor root. No forged authority signature or mutated signed session is required. This defeats the asserted evidence continuity condition even though exact duplicate IDs are deduplicated.

Reproduction: `security: consumed session evidence anchor cannot authorize a second divergent request`. It executes request `anchor-first`, then re-signs the identical session with request `anchor-fork` and a different payload. Both succeed.

Required repair: persist consumed evidence/session anchors and bind a consumed anchor to the accepted request root. Permit an exact retry to retrieve its existing signed receipt, while rejecting a divergent request on that anchor. If the design intentionally allows branches, require explicit branch identity and authority semantics rather than describing both receipts as linear continuity. Retest after repair, including concurrent divergent requests and exact retry.

## P1 — Subject-supplied route metrics bypass the authority's cost constraint

Initial `src/node-process.mjs:30` binds only route.path to the traversed envelope; `:39` compares route.cost + provider.cost to lease.maxCost. route.cost is signed only by the requesting subject, and neither routeRoot nor route metrics are checked against an authority quote or trusted link configuration. A valid authority can grant maxCost=1 while the subject selects A→B→C (actual configured cost=2), changes the request's route.cost to 0, leaves the old routeRoot unchanged, and obtains execution. Provider cost=1 fits the falsified total but the path exceeds the lease.

Reproduction: `security: subject cannot lower route cost below an authority budget by rewriting route metrics`. The authority first creates a properly signed constrained lease; the subject-only tampering follows. This does not rely on the subject forging authority credentials.

Required repair: a canonical routeRoot check catches accidental mutation but is insufficient against a subject who recomputes it. Bind metrics/root to a trusted authority route quote or derive and validate them from trusted configuration at admission. Validate nonnegative finite metrics and route endpoints. Network-price evidence remains local fixture policy, not market billing.

## P2 — Session source binding is not enforced

Initial `src/node-process.mjs:31` checks session target/ID/lease but omits session.sourceNodeId. `src/suite.mjs` explicitly signs sourceNodeId into the authority session. A valid subject can take a session issued for A, change and re-sign its request route to B→C, send from B, and execute without authority-issued migration. Intermediate transport signatures prove B sent the message; they do not authorize substitution of A in the signed session.

Reproduction: `security: authority-issued source node binding cannot be replaced by the subject` verifies the original signed session says source A and then sends through source B. Execution incorrectly succeeds.

Required repair: bind route.path[0], route.source and authority session.sourceNodeId; migration must use a newly authority-signed session while retaining subject, continuity and attenuation constraints.

## Positive observations and proof boundary

- Three nodes are actual forked Node processes (`suite.mjs`), not object aliases. UDP frames use TINP framing and real loopback sockets; TCP is a separate real socket provider. The three adversarial tests execute through those processes and transports.
- Transport validates pinned sender signatures and recipient, binds responses to a pending rpcId and expected peer, and limits frame size. A pinned node is still a trust participant; this is not anonymous Internet enrollment.
- Authority and subject use different Ed25519 keys; request and lease/session signatures are checked separately. No signature algorithm flaw was observed in this review.
- Service admission/execute/cache is serialized, reducing concurrent same-key duplicate execution. Cache writes and ledger appends fsync before acknowledgement. These protections do not by themselves prevent evidence forks or prove general exactly-once side effects.
- The execution is a pure Unicode code-point count and its result is independently checked by the client. No general third-party provider execution, hostile-process sandbox, cryptographic enrollment, public network resilience, or production security certification follows.
- The evidence ledger verifies sequence and hash linkage. Without a separately trusted checkpoint it cannot detect an adversary replacing the entire file with a newly rehashed history. This is a limitation of the current local trust fixture, not a new claim of external notarization.
- Initial Integration Court status: **REQUIRES_FIX** for the above server-admission findings. Remediation and a passing rerun are required before changing that status.
