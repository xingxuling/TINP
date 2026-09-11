# OPP read-only consumer bridge candidate

## Owner decision

This bridge is a TINP-owned acceptance boundary. OPP remains the owner of CHP/RCP negotiation semantics. The bridge accepts a caller-supplied accepted OPP negotiation, binds it to the TINP read-only HTTP policy/request and producer receipt, and emits a content-rooted consumer acceptance receipt. It does not grant authority or claim third-party interoperability.

## Bound contract

`twni.opp-http-consumer-bridge-plan.v1` pins the OPP repository and commit,
capability id, projected response fields and `authorityGranted:false`.
`twni.opp-http-consumer-contract.v1` carries an accepted `negotiateOpp`
result, its capability agreement root and the same response projection. The
bridge rejects owner changes, rejected handshakes/capabilities, projection
mismatches, re-rooted producer responses and malformed receipts.

## Acceptance receipt

`twni.opp-http-consumer-bridge-receipt.v1` binds the bridge plan root, HTTP
policy/request roots, producer receipt root, consumer contract root and
response root. `PASS` means this concrete local consumer accepted the exact
projected response under the accepted OPP declaration. `FAIL_CLOSED` records a
producer failure without retry or side effect. The receipt is not a signature,
lease, authority grant, production availability proof or external OPP
consumer certification.

## Evidence boundary

The alpha.17 deterministic verifier and tests exercise the real vendored OPP
CHP/RCP child adapter plus the local consumer binding. A separately captured
GitHub REST observation remains provider evidence. An independently operated
third-party OPP consumer, public deployment, production credentials and
authority service remain open gaps.
