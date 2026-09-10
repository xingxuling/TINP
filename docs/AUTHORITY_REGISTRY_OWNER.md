# Authority registry owner boundary

alpha.6 adds a bounded, opt-in authority registry adapter. It is an integration profile for TINP host recovery and operator tooling. It is not a new RCL primitive, an RNCS world grant, an AAF replacement, or a production identity service.

## Owner split

| Concern | Owner | TINP responsibility |
| --- | --- | --- |
| Registry policy and issuer custody | External authority Owner | Publish and protect the issuer key, approve registry roots, rotate or revoke issuer keys, and provide recovery/incident procedures |
| Snapshot format and local verification | TINP profile adapter | Validate exact fields, canonical root, Ed25519 signature, sequence chain, TTL, append-only member lifecycle, and role-subset rotation |
| Member public-key custody | Calling deployment / external authority | Supply the current member keyring at invocation time; protect private keys outside TINP |
| Recovery-anchor admission | `src/recovery-anchor.mjs` + RCL recovery profile | Verify the selected recovery signer and local ledger prefix; do not persist registry key material |
| Pending retirement approval | AAF approval format and existing TINP adapter | Keep approval semantics and operator authorization in their existing owner; registry only maps keys |
| World authority and commit | RNCS/RFE | No world proposal, grant or commit is created by this adapter |

## Snapshot contract

`makeAuthorityRegistryPolicy` records `registryId`, `issuerId`, the issuer SPKI SHA-256 fingerprint, the fixed registry scope/role, and a policy root. It never accepts or stores a private key. A signed registry is `{body, root, signature}`. Its body records a positive sequence, the previous registry root (Genesis for sequence 1), caller-visible `issuedAtMs`/`expiresAtMs`, and sorted member entries.

Each member entry records an `authorityId`, `signerId`, public-key fingerprint, one or more fixed roles (`operator` or `recovery-witness`), a positive `keyEpoch`, status, optional predecessor, and validity/revocation times. Existing entries are immutable except for an active-to-revoked transition. A new active key must use the previous active entry as predecessor, increment the epoch, keep the authority, use a different fingerprint, and keep a subset of the predecessor roles. A revoked entry cannot become active again and an authority cannot have two active entries in one snapshot.

The registry does not contain member public-key PEM or any private material. `keyringFromAuthorityRegistry` resolves fingerprints against a caller-supplied `{signerId: {publicKeyPem, revoked}}` map and returns a one-call compatible keyring. Missing active material, accessors, inherited records, private keys, revoked active inputs, and fingerprint mismatches fail closed.

## CLI and lifecycle

The independent issuer process in `tests/authority-registry-signer.mjs` is test-only. `npm run authority-registry:demo` proves the local issuer/rotation lifecycle without persisting key material. For supplied files, `npm run authority-registry -- verify ...` checks a snapshot; `keyring ... --role recovery-witness` additionally resolves a role keyring. `scripts/recovery-anchor.mjs` accepts the same registry inputs only when explicitly provided; it verifies and derives a keyring for that invocation and does not write the registry to the coordinator checkpoint.

The caller chooses the snapshot, issuer keyring, member keyring and local `nowMs`. A valid signature proves control of the issuer key corresponding to the supplied policy; it does not prove human identity, online publication, freshness against a trusted clock, hardware custody, transparency, global revocation, conflict resolution, or cross-device recovery. A production Owner must define those controls before treating this profile as an authority service.
