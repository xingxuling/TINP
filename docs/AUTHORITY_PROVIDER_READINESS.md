# External authority provider readiness

This document records the admission contract for the external Owner that is
still missing from TINP. It is a handoff and review boundary, not an
implementation of an authority service. TINP remains a consumer of signed
authority observations; it does not become the authority Owner, a global
counter, a transparency log, or a human identity system.

## Current reality

The repository is `https://github.com/xingxuling/TINP.git`, on the candidate
branch `codex/tinp-registry-v06`. The local alpha.11 profile can verify an
offline registry, mirror quorum, finite history, local append-only prefix, an
independently signed store-state witness and a public-history replay between
two independent local processes/directories. A same-call signature, local
process separation and the local `nowMs` value are not external publication,
trusted time, or durable physical-host convergence.

On 2026-09-10, the public repositories under the GitHub owner `xingxuling`
were inspected. `OPP`, `RNCS-Unified-Platform-` and `RCL` are useful semantic
donors, but no inspected repository exposes a production authority publisher,
revocation service, transparency log or cross-host authority recovery service.
The machine-readable search record is
[`audit/authority-provider-search-2026-09-10.json`](../audit/authority-provider-search-2026-09-10.json).
The local source search found no existing TINP contract for such a service.

Current status is **`BLOCKED_EXTERNAL_OWNER`**. This is an external integration
block, not an RCL Core capability gap and not a production failure claim.

## Required Owner contract

An external Owner is ready for a TINP integration only when it supplies all of
the following, with a public contract and a staging environment that can be
replayed independently.

| Contract surface | Required evidence from the Owner | TINP admission boundary |
| --- | --- | --- |
| Owner identity and policy | Stable Owner identifier, policy root, pinned public-key fingerprints, key-rotation and emergency-revocation rules | Reject a response whose signer, policy root or key epoch is not pinned by the caller |
| Publication | Signed registry snapshots with sequence, previous root, issue/expiry window and an authenticated publication receipt | Verify the snapshot and receipt; TLS or an HTTP response alone is not authority evidence |
| Revocation and rotation | Signed revocation stream or equivalent, effective sequence/time, member and issuer retirement, and a recovery procedure for a lost signer | Apply revocation before execution and fail closed when freshness or recovery status is unknown |
| Trusted time | Attested time token or independently verifiable time service, bounded skew and freshness semantics | Do not treat local `nowMs` as trusted time; reject expired, future or unbounded observations |
| Transparency | Append-only log inclusion and consistency proofs, log checkpoint identity and an independently pinned mirror set | Verify inclusion/consistency and stable mirror membership; do not infer global history from a copied file |
| Cross-host durability | At least two independently operated hosts, encrypted state transfer, replayed sequence/previous-root checks and an explicit fork/conflict policy | Accept only a consistent, authenticated state; preserve unresolved conflict instead of selecting a winner locally |
| Key custody and recovery | Hardware or equivalent protected custody, operator separation, rotation, backup and lost-key incident evidence | Keep private keys outside TINP; consume only public keys, signatures and authenticated recovery statements |
| Failure and audit | Staging credentials, negative cases, outage/reconnect traces, audit retention and an owner-signed incident record | Map unknown, stale, revoked, forked and unavailable states to explicit fail-closed results |

The Owner must also state which party owns human enrollment, member identity,
legal policy, incident response and irreversible production approval. A valid
signature proves control of a key; it does not by itself prove a person's
identity or grant an RNCS world commit.

## Integration gates

The first integration should remain a read-only staging adapter. It may be
admitted only after the following are demonstrated with real independent
processes on two hosts:

1. A fresh snapshot and its publication receipt verify against the pinned Owner
   policy and trusted time.
2. A revoked issuer/member is rejected after reconnect, including a stale local
   cache and an out-of-order revocation response.
3. Rotation preserves the authority and role-subset rules already enforced by
   `authority-registry.mjs`; a lost-key recovery cannot resurrect a revoked key.
4. Two hosts replay the same sequence and detect a conflicting root, skipped
   sequence, mirror-set drift and log consistency failure without choosing a
   local winner.
5. A complete old state plus an old witness is rejected after a newer external
   checkpoint has been retained, while an unresolved provider outage remains
   visibly unresolved and does not dispatch an operation.
6. Public audit evidence binds the Owner contract, exact source/build, staging
   traces, negative cases and human approval. K400 remains `NOT_ADJUDICATED`
   until its nine gates are separately reviewed.

Until those inputs exist, the alpha.10 offline adapters remain the smallest
honest boundary. Adding a local publisher, synthetic trusted clock, guessed
Owner, or test keyring would create a parallel authority and would not close
this gap.
