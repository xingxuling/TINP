# External operator approval profile

TINP pending retirement consumes an AAF `aaf.approval-receipt.v0.1` with its original canonical root and Ed25519 object signature. The adapter uses the original AAF `verifyApproval` and `verifySignedObject`. It has no signing, identity enrollment, lease creation, RNCS envelope authorization, or world commit interface.

AAF retains ownership of the approval format, canonical encoding, and signature verification. RNCS/AAF higher-level authority and human identity remain external. TINP owns the local pending-retirement challenge and its narrow admission profile. RCL owns the subsequent fixed retirement semantics. Passing this cryptographic profile is not proof of a human action, a complete RNCS authority grant, or a production trust boundary.

The policy pins a signer ID and SHA256 of the Ed25519 public key's SPKI DER bytes; it stores no key material. Each admission requires an external keyring entry containing only `publicKeyPem` and explicit `revoked: false`. The approval cannot supply its own trusted key. Local bootstrap pinning chooses a trust anchor; it does not establish a real-world identity. Current keyring metadata is caller-supplied, not an independently authenticated or globally convergent revocation service.

The accepted role is exactly `tinp.operator`, scope exactly `tinp.pending.retire`, conditions exactly empty, and decision exactly approved. The AAF proposal root must equal the current TINP challenge root. Signer ID, approver ID, and pinned signer ID must agree. Additional fields, inline keys, wildcard grants, wrong algorithms, private-key inputs, malformed signatures, and noncanonical timestamps are rejected. Validity requires `issued_at <= now < expires_at`, with at most ten minutes between issuance and expiry. Time comes from the host; this is not a trusted clock protocol.

Historical replay can verify a stored grant at its authenticated admission timestamp. This only checks historical evidence and must not create fresh authority, extend expiry, or authorize another request. The enclosing runtime is responsible for authenticating that timestamp, binding the challenge to pending state, preventing downgrade, preserving terminal consumption, and requiring the RCL gate and durable node revocation acknowledgements.

## Donor and license evidence

Donor: RNCS Unified Platform, `packages/control/agent-authority-fabric`, commit `d345ecb9d8801a911f37534f40d7b9fdf5badb16`, branch `codex/rncs-rcl-formal-gate-v01`. Its worktree has unrelated changes and an untracked formal-guard candidate. The selected three AAF source files and LICENSE were tracked and clean. Vendoring copies `git show HEAD:<path>` byte-for-byte and checks each copy against a second blob read. The checkout used CRLF while git HEAD used LF; `vendor/aaf/PROVENANCE.json` records both hashes and blob IDs rather than claiming identical checkout bytes.

The selected files import only each other and `node:crypto`; the broad AAF index/evaluator and untracked RNCS formal guard are not copied. The original LICENSE contains only the declaration `Apache License 2.0`, preserved verbatim. This records the donor's declaration; it does not claim the donor supplied a complete license text. No additional npm dependency is introduced.

`tests/aaf-operator.test.mjs` exercises actual AAF signatures, public-key pinning, tampering, signer/root/scope/time boundaries, malformed structures, explicit revocation metadata, historical expiry, and donor-file hashes. Generated signing keys in these unit tests are fixture identities only. Cross-process signing and durable state/recovery evidence belong to the runtime integration tests.
