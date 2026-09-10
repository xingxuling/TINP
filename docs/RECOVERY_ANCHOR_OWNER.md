# External Recovery Anchor Owner

The TINP host owns local state loading, ledger-prefix selection, DPAPI persistence, and the decision to accept an externally signed recovery witness. `src/recovery-anchor.mjs` is a narrow adapter: it validates an Ed25519 public-key fingerprint, exact anchor shape, signature, monotonic sequence, immutable lease binding, and the locally authenticated ledger prefix. It does not sign anchors, enroll a real person, or decide that a directory is globally current.

The external witness owns the signed `twni.external-recovery-anchor.v1` statement. The statement contains a monotonic sequence, the ledger length and root, a public recovery-state projection, and the pinned policy root. The witness private key is outside the coordinator and node processes. The caller supplies the public keyring and its `revoked:false` metadata on each verification; TINP does not treat this input as an online revocation registry.

Pinning is an explicit local bootstrap. A pinned policy stores only signer ID, SPKI DER fingerprint, scope, role, optional configuration root, and its policy root. The first anchor and later anchors are explicit imports. A later sequence must advance the previous local anchor and chain through its root. The `request` command is read-only; `accept` records that it imported a prefix anchor and never creates a lease or execution authority.

The anchor detects a complete local directory replay that predates a known newer anchor: the replayed ledger cannot contain the anchored prefix. It does not cover writes after the last explicit anchor, a replay of the code/configuration outside the state projection, a hostile external witness, an untrusted clock, hardware custody, cross-device encryption, or a distributed rollback anchor. Those remain external authority and deployment work.

The existing RCL recovery and pending-retirement programs remain canonical for their predicates. The anchor verification result is a host observation; no RCL Core primitive or K400 cell is promoted by this adapter.
