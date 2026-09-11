# Authority registry owner boundary

alpha.10 adds a bounded, opt-in authority registry adapter, an offline multi-mirror distribution bundle, a caller-supplied historical convergence bundle, a local atomic convergence store and an external convergence witness. They are integration profiles for TINP host recovery and operator tooling. They are not a new RCL primitive, an RNCS world grant, an AAF replacement, an online transparency log or a production identity service.

## Owner split

| Concern | Owner | TINP responsibility |
| --- | --- | --- |
| Registry policy and issuer custody | External authority Owner | Publish and protect the issuer key, approve registry roots, rotate or revoke issuer keys, and provide recovery/incident procedures |
| Snapshot format and local verification | TINP profile adapter | Validate exact fields, canonical root, Ed25519 signature, sequence chain, TTL, append-only member lifecycle, and role-subset rotation |
| Distribution policy and mirror custody | External authority Owner | Choose mirror identities and threshold, protect mirror keys, publish/revoke mirror membership, and define fork/convergence incident handling |
| Offline distribution bundle verification | TINP profile adapter | Bind receipts to one registry/policy root, require distinct pinned mirrors at threshold, and reject stale, duplicate, mismatched or conflicting receipts |
| Offline historical convergence verification | TINP profile adapter | Verify a supplied sequence-ordered history starts at Genesis, has contiguous previous roots, stable accepted mirror sets, and no duplicate or conflicting snapshot roots |
| Local convergence store persistence | TINP profile adapter | Persist only public convergence bundles with atomic local replacement, directory writer lease, idempotent replay and exact-prefix extension; reject rollback or old-prefix rewrite |
| External convergence witness custody | External authority Owner / independent witness | Hold the witness private key, sign the caller-requested store-state body, retain prior witness roots and define publication, revocation, recovery and incident handling |
| External convergence witness verification | TINP profile adapter | Bind one signed witness to the exact supplied store state, verify the underlying registry/distribution/convergence inputs, and require a contiguous saved-witness sequence |
| Member public-key custody | Calling deployment / external authority | Supply the current member keyring at invocation time; protect private keys outside TINP |
| Recovery-anchor admission | `src/recovery-anchor.mjs` + RCL recovery profile | Verify the selected recovery signer and local ledger prefix; do not persist registry key material |
| Pending retirement approval | AAF approval format and existing TINP adapter | Keep approval semantics and operator authorization in their existing owner; registry only maps keys |
| World authority and commit | RNCS/RFE | No world proposal, grant or commit is created by this adapter |

## Snapshot contract

`makeAuthorityRegistryPolicy` records `registryId`, `issuerId`, the issuer SPKI SHA-256 fingerprint, the fixed registry scope/role, and a policy root. It never accepts or stores a private key. A signed registry is `{body, root, signature}`. Its body records a positive sequence, the previous registry root (Genesis for sequence 1), caller-visible `issuedAtMs`/`expiresAtMs`, and sorted member entries.

Each member entry records an `authorityId`, `signerId`, public-key fingerprint, one or more fixed roles (`operator` or `recovery-witness`), a positive `keyEpoch`, status, optional predecessor, and validity/revocation times. Existing entries are immutable except for an active-to-revoked transition. A new active key must use the previous active entry as predecessor, increment the epoch, keep the authority, use a different fingerprint, and keep a subset of the predecessor roles. A revoked entry cannot become active again and an authority cannot have two active entries in one snapshot.

The registry does not contain member public-key PEM or any private material. `keyringFromAuthorityRegistry` resolves fingerprints against a caller-supplied `{signerId: {publicKeyPem, revoked}}` map and returns a one-call compatible keyring. Missing active material, accessors, inherited records, private keys, revoked active inputs, and fingerprint mismatches fail closed.

`twni.authority-registry-distribution.v1` is a caller-selected policy plus a bundle containing one registry and signed mirror receipts. The policy pins the registry policy root, sorted mirror IDs/fingerprints and a positive threshold. Each receipt binds the distribution policy root, registry root/sequence, mirror ID/fingerprint and a bounded validity window. Verification authenticates every receipt with caller-supplied mirror public keys, requires the threshold of distinct mirrors and rejects any valid receipt for a different root or sequence as a fork. This is an offline same-call consistency check; it does not publish, reconcile or persist mirror state.

`twni.authority-registry-convergence.v1` is a caller-supplied container of those distribution bundles plus a `historyRoot`. Validation orders the children by registry sequence/root; verification requires sequence 1 with `Genesis`, each later `previousRegistryRoot` to equal the preceding registry root, a per-snapshot mirror quorum, and one stable accepted mirror set across the supplied history. Duplicate snapshots, same-sequence alternate roots, missing sequences, broken predecessors and mirror-set drift fail closed. A valid issuer signature on one supplied fork is still possible; this adapter detects the fork only when competing signed histories are included in the input, because it has no online transparency log.

`twni.authority-registry-convergence-store.v1` is an opt-in local file wrapper around that convergence bundle. It stores public bundles, policy/registry identifiers, `historyRoot` and sequence bounds; it never stores issuer, mirror or member private keys. `append` verifies the supplied history and the existing history under the same caller inputs, acquires the existing directory writer lease, and atomically replaces the file only for a new full-prefix extension. Exact replay is `unchanged`; shorter histories, changed old children, changed policy or malformed/private material fail closed. Verification permits old receipts to age out while requiring the latest snapshot to be current when requested.

`twni.authority-registry-convergence-witness-policy.v1` pins an independent witness signer, the fixed `tinp.authority-registry.convergence-store` scope and the convergence-store format. `twni.authority-registry-convergence-witness.v1` signs the policy root, an external witness sequence/previous witness root, the store's distribution and registry identifiers, `historyRoot`, sequence bounds, the canonical `storeStateRoot` and caller-supplied `issuedAtMs`. `authorityRegistryConvergenceWitnessBodyForStore` is a pure projection; `convergence-witness-request` only exports that body. `convergence-witness-verify` authenticates the witness and any retained predecessor, verifies the exact store bytes and the underlying latest-current convergence state, and rejects a same-sequence replacement, skipped/rolled-back sequence or mismatched previous root.

## CLI and lifecycle

The independent issuer process in `tests/authority-registry-signer.mjs`, mirror process in `tests/authority-registry-distribution-signer.mjs` and convergence witness process in `tests/authority-registry-convergence-witness-signer.mjs` are test-only. `npm run authority-registry:demo` proves the local issuer/rotation lifecycle; `npm run authority-registry-distribution:demo` proves quorum and fork rejection without persisting key material; `npm run authority-registry-convergence:demo` proves a two-snapshot history, stable mirrors, historical fork detection and mirror-set drift rejection; `npm run authority-registry-convergence-store:demo` proves local append, extension, replay idempotence, rollback and prefix-rewrite rejection; `npm run authority-registry-convergence-witness:demo` proves independent witness binding, contiguous witness extension and retained-root replacement/rollback rejection. For supplied files, `npm run authority-registry -- verify ...` checks a snapshot; `keyring ... --role recovery-witness` additionally resolves a role keyring; `distribution-verify ...` verifies one bundle; `convergence-verify ...` verifies the supplied history; `convergence-store-append ... --store ...` appends a full history and `convergence-store-verify ...` verifies a stored file; `convergence-witness-request ...` exports a body for an external signer and `convergence-witness-verify ...` checks the signed body against a store and its registry inputs. `scripts/recovery-anchor.mjs` accepts the same registry inputs only when explicitly provided; it verifies and derives a keyring for that invocation and does not write the registry to the coordinator checkpoint.

The caller chooses the snapshot/history, distribution policy, issuer/mirror keyrings, member keyring, local `nowMs` and store path. A valid signature proves control of a key corresponding to the supplied policy; the local store proves only an atomic write and exact-prefix rule on this host. A retained, independently signed witness can detect a structurally valid store replacement or witness rollback when the prior witness is available. It does not prove human identity, online publication, freshness against a trusted clock, hardware custody, transparency outside the supplied history, protection if both store and witness files are replaced, global revocation, durable conflict resolution or cross-device recovery. A production Owner must define those controls before treating this profile as an authority service.

The external handoff contract is recorded in
[`AUTHORITY_PROVIDER_READINESS.md`](AUTHORITY_PROVIDER_READINESS.md). It lists
the minimum publication, revocation, trusted-time, transparency, cross-host
recovery, custody and staging evidence required before TINP can consume a
read-only production provider. The current search found no such provider;
until an Owner supplies it, this profile remains `BLOCKED_EXTERNAL_OWNER`.

## alpha.11 cross-process replay boundary

The alpha.11 replay harness reuses the store and convergence validators above.
Two local Node child processes own separate directories and exchange only a
serialized public store state. The second process verifies the imported
prefix, returns `unchanged` for an exact replay and extends it. A signed
same-length alternate history, mirror-set drift and a sequence gap are then
rejected without changing the durable state.

This is a local process/filesystem stress case, not a production cross-host
transport or authority. The harness does not provide encrypted transfer,
trusted time, host identity, online publication, global revocation or a
distributed conflict winner. An external Owner must still satisfy the
readiness contract before this profile can be connected to production.

## alpha.12 TINP DATA loopback transfer boundary

The alpha.12 harness reuses `LocalTransport` and vendored TINP `DATA` framing
rather than defining another authority protocol. Two local transport workers
bind separate TCP loopback endpoints and directories. Peer public keys are
configured in each worker; a public convergence-store state is sent in a
signed DATA request and accepted only through the existing store append and
convergence validators. Exact replay is `unchanged`, a seq3 extension is
accepted, and the extension can be transferred back to the first worker.

The harness also sends a state-root tamper, a historical fork, mirror-set drift
and a sequence gap. Each is rejected before durable replacement and the
receiver retains its prior bytes. The worker and transfer payloads contain no
issuer, mirror, member, witness or transport private key. This proves local
socket/process behavior only; it does not make TINP an online authority,
provide TLS or physical-host recovery, establish trusted time, or choose a
production conflict winner.

## alpha.13 TLS loopback transfer boundary

The alpha.13 harness extends the same `LocalTransport` with a caller-supplied
TLS 1.3 mode. Each local worker receives a temporary certificate and private
key from the test fixture; the endpoint advertises only the peer certificate
as a CA pin. The client requires that pin and the `tinp-loopback` server name,
then the existing TINP peer public-key admission authenticates the signed DATA
envelope. A wrong CA fails during the TLS handshake before a DATA frame is
sent.

The public store transfer still uses the existing convergence validators and
retains all alpha.12 negative cases. Temporary certificate files are deleted
with the fixture directory and no TLS private key is serialized into a store,
transfer payload or source archive. This proves local TLS 1.3/socket behavior
only; it does not define production certificate custody, physical-host
enrollment, trusted time, online publication, global revocation, or a
distributed conflict winner.

## alpha.14 resumable TLS transfer boundary

The alpha.14 harness keeps the same authority meaning and TINP DATA framing,
but sends the public convergence-store state as a bounded sequence of chunks.
The transfer manifest binds the transfer id, endpoints, state root, payload
digest, chunk size and total count. A receiver journal is atomically replaced
after each accepted chunk and records the next cursor plus the committed
state. Restarting the receiver reuses that journal and resumes at the first
missing chunk; a duplicate is idempotent, while an altered existing chunk or a
manifest/state-root mismatch is rejected before store replacement.

This is an auxiliary TINP host adapter and recovery mechanism for public state.
It does not publish or revoke authority, choose a conflict winner, provide
trusted time, enroll physical devices, custody production keys or create an
RCL/RNCS/AAF semantic owner. The journal contains no issuer, mirror, member,
witness or transport/TLS private key.
