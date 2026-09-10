# Authority registry security court — alpha.7

Decision: **VERIFIED_LOCAL_CANDIDATE / NOT_PRODUCTION_AUTHORITY**.

The court reviews the bounded registry adapter, its explicit recovery bridge and the offline distribution bundle. It does not certify a registry operator, a human signer, an online service, or a K400 cell.

## Evidence exercised

- An independent issuer child owns the Ed25519 private key and returns only its public key and signatures over IPC.
- Policy and snapshot roots are canonical and signatures are checked against a caller-supplied issuer keyring whose SPKI fingerprint is pinned by the policy.
- Sequence 1 requires the Genesis previous root. Later snapshots require the immediately supplied predecessor root and sequence.
- Existing entries remain immutable except for active → revoked. A new key must use a revoked predecessor, increment `keyEpoch`, preserve `authorityId`, use a new fingerprint and a subset of roles. Revoked keys cannot be resurrected and an authority cannot have two active keys.
- Member keyring projection rejects missing active material, private or wrong-type keys, accessors/inherited records, revoked active inputs and fingerprint mismatches. Registry-derived maps are ephemeral and compatible with existing recovery/operator verifiers.
- CLI verification and `recovery-anchor status` were exercised with explicit registry files. No registry or private key is written to the coordinator checkpoint.
- A three-mirror child-process demo signs receipts over one registry root. The distribution policy pins each mirror SPKI fingerprint and a threshold; verification accepts the three-receipt quorum, rejects a validly signed conflicting root as a fork, and rejects a one-receipt bundle below threshold.
- The distribution CLI and strict bundle/policy/receipt validators were exercised. Mirror key replacement, revocation, private material, accessors, duplicate receipts, unsorted receipts, stale receipts and time-window violations fail closed.

## Negative cases

The test profile covers forged signatures/roots, issuer replacement and revocation, sequence rollback, predecessor replacement, role escalation, authority/key epoch violations, resurrection, duplicate active keys, expired or not-yet-valid snapshots, malformed arrays/objects, getters/inherited keyring entries, missing members and mismatched fingerprints. Distribution cases additionally cover conflicting signed roots/sequences, insufficient quorum, duplicate or unsorted receipts, mirror replacement/revocation, stale receipts and private/accessor material. Each is expected to fail closed with a namespaced `AUTHORITY_REGISTRY_*` error.

## Boundary decision

The adapter consumes offline files and a caller-provided local clock. The distribution bundle proves only that the supplied mirror signatures agree during this call; it does not publish or reconcile snapshots, distribute revocations, prove issuer/mirror freshness, protect private keys, provide a trusted timestamp, create RNCS grants, or authorize side effects. An old snapshot can be validly signed and still be stale if the caller supplies it; the local `nowMs` check is an input boundary, not an external time authority. Registry state after the supplied snapshot, mirror history and code/configuration rollback are outside this proof.

RCL remains the owner of recovery and transaction admission. AAF remains the owner of approval receipt format and signature semantics. RNCS/RFE remain world authority owners. The formal-gate pinned-key and revocation-registry implementation was a donor reference only; no Core change or promotion was made.

## Gate status

| Gate | Result | Reason |
| --- | --- | --- |
| EXPRESS / COMPILE / LOWER / EXECUTE | CANDIDATE evidence | Node modules, independent issuer/mirror children, CLI and local tests execute on the pinned host |
| CORRECT / ROBUST | CANDIDATE evidence | Positive lifecycle/quorum plus malformed, rollback, rotation, fork, stale and keyring negative cases |
| PERFORMANCE | NOT_ADJUDICATED | No registry SLA or cross-device throughput claim |
| AI_GENERATE | NOT_RUN | No independent generation evaluation |
| EVIDENCE | CANDIDATE evidence | Alpha.7 verification JSON, tests TAP, source hashes and delivery receipt |
| K400 promotion | NOT_ADJUDICATED | No universal cell admission is implied |
