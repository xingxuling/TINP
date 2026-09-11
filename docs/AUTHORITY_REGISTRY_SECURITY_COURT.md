# Authority registry security court — alpha.13

Decision: **VERIFIED_LOCAL_CANDIDATE / NOT_PRODUCTION_AUTHORITY**.

The court reviews the bounded registry adapter, its explicit recovery bridge, the offline distribution bundle, the caller-supplied historical convergence bundle, the local atomic convergence store and the external convergence witness. It does not certify a registry operator, a human signer, an online service, or a K400 cell.

## Evidence exercised

- An independent issuer child owns the Ed25519 private key and returns only its public key and signatures over IPC.
- Policy and snapshot roots are canonical and signatures are checked against a caller-supplied issuer keyring whose SPKI fingerprint is pinned by the policy.
- Sequence 1 requires the Genesis previous root. Later snapshots require the immediately supplied predecessor root and sequence.
- Existing entries remain immutable except for active → revoked. A new key must use a revoked predecessor, increment `keyEpoch`, preserve `authorityId`, use a new fingerprint and a subset of roles. Revoked keys cannot be resurrected and an authority cannot have two active keys.
- Member keyring projection rejects missing active material, private or wrong-type keys, accessors/inherited records, revoked active inputs and fingerprint mismatches. Registry-derived maps are ephemeral and compatible with existing recovery/operator verifiers.
- CLI verification and `recovery-anchor status` were exercised with explicit registry files. No registry or private key is written to the coordinator checkpoint.
- A three-mirror child-process demo signs receipts over one registry root. The distribution policy pins each mirror SPKI fingerprint and a threshold; verification accepts the three-receipt quorum, rejects a validly signed conflicting root as a fork, and rejects a one-receipt bundle below threshold.
- The distribution CLI and strict bundle/policy/receipt validators were exercised. Mirror key replacement, revocation, private material, accessors, duplicate receipts, unsorted receipts, stale receipts and time-window violations fail closed.
- A convergence demo signs two sequential registry snapshots and a quorum for each. Verification accepts the contiguous history with a stable three-mirror set, rejects a same-sequence alternate root, rejects a missing sequence or broken predecessor, and rejects mirror-set drift even when each individual bundle reaches threshold.
- The convergence CLI and strict history/root validators were exercised. Duplicate snapshots, altered `historyRoot`, accessors/inherited fields and malformed child arrays fail closed; the history root binds the complete supplied bundle list.
- The convergence-store demo and six focused store tests were exercised. The store writes only public convergence state, uses a directory writer lease plus temporary-file fsync/rename, extends only an exact existing prefix, returns `unchanged` for replay, and rejects rollback, old-prefix rewrite, changed policy, tampered roots and private material without changing durable bytes. Store verification allows aged historical receipts while requiring the latest snapshot to be current when requested.
- The convergence-witness demo uses a separate witness child process and signs a body that binds the exact store state root, history root, policy identifiers and an external witness sequence. Verification accepts the first witness and a contiguous extension, rejects a structurally valid replacement store, rejects a same-sequence replacement witness when the prior root is retained, rejects a sequence rollback and rejects a retained predecessor with an invalid signature. The request CLI is read-only and emits no private key material; the verify CLI checks the witness against the store and caller-supplied registry/distribution keyrings.

## Negative cases

The test profile covers forged signatures/roots, issuer replacement and revocation, sequence rollback, predecessor replacement, role escalation, authority/key epoch violations, resurrection, duplicate active keys, expired or not-yet-valid snapshots, malformed arrays/objects, getters/inherited keyring entries, missing members and mismatched fingerprints. Distribution cases additionally cover conflicting signed roots/sequences, insufficient quorum, duplicate or unsorted receipts, mirror replacement/revocation, stale receipts and private/accessor material. Convergence cases cover missing or duplicated sequence numbers, broken previous roots, same-sequence alternate roots, altered history roots, mirror-set drift and malformed/accessor histories. Store cases additionally cover malformed state, tampered roots, policy mismatch, rollback, prefix rewrite, private material, atomic replacement and replay idempotence. Witness cases additionally cover policy/body/root mismatches, wrong or revoked witness keys, invalid signatures, invalid retained predecessor signatures, future timestamps, state replacement, same-sequence replacement, sequence rollback, malformed/accessor objects and unknown CLI flags; all are expected to fail closed with namespaced `AUTHORITY_REGISTRY_*` errors.

## Boundary decision

The adapter consumes offline files and a caller-provided local clock. The distribution bundle proves only that the supplied mirror signatures agree during this call; the convergence bundle additionally proves continuity and stable mirror membership within the supplied finite history; the store proves only local atomic persistence and exact-prefix extension under its directory lease; the external witness adds an independently signed binding to one exact store state and a retained predecessor chain. Neither publishes or reconciles snapshots, distributes revocations, proves issuer/mirror freshness outside the caller's history, protects private keys, provides a trusted timestamp, creates RNCS grants, or authorizes side effects. An old snapshot can be validly signed and still be stale if the caller supplies it; the local `nowMs` check is an input boundary, not an external time authority. Store or witness whole-file replacement by an attacker when the corresponding retained root is also replaced, registry state after the supplied history, omitted competing forks, mirror history outside the bundle and code/configuration rollback are outside this proof.

RCL remains the owner of recovery and transaction admission. AAF remains the owner of approval receipt format and signature semantics. RNCS/RFE remain world authority owners. The formal-gate pinned-key and revocation-registry implementation was a donor reference only; no Core change or promotion was made.

## Gate status

| Gate | Result | Reason |
| --- | --- | --- |
| EXPRESS / COMPILE / LOWER / EXECUTE | CANDIDATE evidence | Node modules, independent issuer/mirror children, CLI and local tests execute on the pinned host |
| CORRECT / ROBUST | CANDIDATE evidence | Positive lifecycle/quorum plus malformed, rollback, rotation, fork, stale and keyring negative cases |
| PERFORMANCE | NOT_ADJUDICATED | No registry SLA or cross-device throughput claim |
| AI_GENERATE | NOT_RUN | No independent generation evaluation |
| EVIDENCE | CANDIDATE evidence | Alpha.13 verification JSON, tests TAP, source hashes and delivery receipt |
| K400 promotion | NOT_ADJUDICATED | No universal cell admission is implied |

## Alpha.11 replay addendum

Alpha.11 adds a process/filesystem stress harness around the existing store
adapter. Two independent Node child processes with separate directories
exchange a public convergence state; the second process verifies, replays and
extends the history. A valid same-length signed fork is rejected by the store
prefix check, mirror-set drift is rejected by convergence verification, and a
missing sequence is rejected before the store changes. The harness asserts
that the rejected state root and bytes remain unchanged, and that no private
key material is transferred.

The result is `VERIFIED_LOCAL_MULTI_PROCESS_CROSS_HOST_REPLAY` in
`evidence/0.1.0-alpha.11/authority-registry-cross-host-replay.json`. The
name describes the stress boundary; it does not certify two physical hosts,
encrypted transport, trusted time, online publication, global revocation or
distributed production consensus. The external Owner gate remains
`BLOCKED_EXTERNAL_OWNER`, and all K400 cells remain `NOT_ADJUDICATED`.

## Alpha.12 TINP DATA loopback addendum

Alpha.12 extends the local stress boundary through the existing `LocalTransport`
and vendored TINP `DATA` framing. Two independent Node transport workers bind
separate TCP loopback endpoints and directories; each is configured with the
other worker's public key. A public convergence-store state moves in a signed
request, is accepted through the existing store append/convergence validators,
replayed idempotently, extended to sequence 3 and transferred back.

The scenario records three DATA frames, 16,706 transferred bytes and zero
invalid received frames on the pinned run. A state-root tamper is rejected as
`AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID`; historical fork, mirror-set
drift and sequence-gap submissions retain the prior store. This proves local
socket/process behavior only. It does not certify TLS, physical-host
transport, trusted time, online publication, hardware custody, lost-key
recovery or production conflict consensus.

Evidence: `evidence/0.1.0-alpha.12/authority-registry-loopback-transfer.json`,
`LOCAL_VERIFICATION.json` and `EVIDENCE_LEDGER.json`. The final candidate has
172/172 tests and 191 source files; all K400 gates remain
`NOT_ADJUDICATED`.

## Alpha.13 TLS loopback addendum

Alpha.13 extends the same transport boundary with caller-supplied TLS 1.3
credentials. Two independent Node transport workers generate ephemeral
self-signed certificates in a temporary directory, pin the peer certificate
as a CA and keep TINP peer public-key admission for the signed DATA envelope.
The run negotiates TLS 1.3 with an AEAD cipher, transfers the same public store
history, and keeps the TCP harness's replay, extension and conflict checks.

The negative test supplies the wrong CA pin and confirms that the handshake
fails before a DATA frame is sent. Store state, issuer/mirror/member/witness
material and transport private keys are not carried in the transfer payload;
temporary certificate files are deleted after the fixture. This is local
encrypted socket evidence only. It does not certify production certificate
issuance or custody, physical-host enrollment, trusted time, online authority,
global revocation, lost-key recovery or production conflict consensus.

Evidence: `evidence/0.1.0-alpha.13/authority-registry-tls-loopback-transfer.json`,
`LOCAL_VERIFICATION.json` and `EVIDENCE_LEDGER.json`. K400 promotion remains
`NOT_ADJUDICATED`.
