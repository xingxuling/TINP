# Durable recovery security review — 2026-09-10

Review scope: `InternetSuite` durable local process recovery, protected coordinator/node state, signed evidence, receipt replay, revocation, and exclusive writers. Verdict: **VERIFIED_LOCAL_CANDIDATE for the observations below**. This review does not declare the entire protocol suite, a K400 cell, or a production deployment verified.

## Source findings and resolutions

The starting implementation generated new identities on restart, loaded execution-cache records without receipt signature/key/anchor validation, and retained revocation, execution counters, and provider epochs only in memory. A hash-only evidence ledger did not authenticate a replacement suffix. The current candidate protects durable identity and recovery state through the Windows current-user DPAPI Provider, validates restored receipt signatures and cache bindings, retains counters and revocation watermarks, and verifies authority-signed evidence with its saved checkpoint prefix.

Coordinator recovery compares committed ledger receipts against node caches. An older valid C snapshot that has forgotten a committed execution is rejected. Corrupted ciphertext does not create a replacement authority. Ledger truncation behind a committed checkpoint and a rehashed suffix without its valid authority signature fail closed.

The review found that restarting a node in a freshly created durable suite initially skipped the RCL recovery gate because no prior coordinator snapshot baseline existed in memory. The implementation now captures an authenticated baseline before node restart and executes the recovery gate against it. The test checks a nonempty RCL program root, state root, and allowed result in `node.recovered` evidence. RCL owns recovery admission; host cryptography, storage verification, checkpoint reconciliation, and Windows lock mechanics remain auxiliary implementations. See `RECOVERY_OWNER.md` for the semantic and K400 stress mapping.

The review also identified an orphan-writer interval: a coordinator can die before all its node processes exit. A coordinator-only lock cannot establish exclusive access to each node snapshot during that interval. Every durable node now acquires a separate OS lock before opening its private state, checks ownership before execution/persistence, and releases ownership during close/disconnect. A held C writer lock makes a replacement coordinator fail closed; C's encrypted cache bytes remain unchanged. After the lock is released, recovery succeeds with the prior execution count.

## Observed verification

The full security test file before the per-node writer-lock addition passed **11/11**, with no skipped tests, in **38.26 seconds**:

```text
node --test tests/recovery-security.test.mjs
```

Those cases covered:

- Actual C process kill, a different replacement PID, the same public key and exact receipt, retained execution count, replay conflict rejection, consumed-anchor rejection, and a real RCL recovery receipt.
- Revocation retained through node death and reopening the coordinator; both new use and old request dispatch remain denied.
- An independent second coordinator denied twice while the first retains ownership.
- Actual coordinator kill after real network execution but before the coordinator commits receipt evidence; recovery reconciles one retained historical receipt and keeps C's execution count at one.
- Actual coordinator kill after pending state is persisted but before sending the intent; recovery rejects `RECEIPT_NOT_FOUND`, keeps the pending request, and leaves C's execution count and cache empty. No new execution is dispatched automatically.
- Corrupted coordinator ciphertext, truncated evidence, a forged rehashed ledger event, and an older valid C snapshot rejected on reopening.
- Cache signature, request key, request root, anchor, node identity, and duplicate-record validation, including valid DPAPI envelopes containing invalid cache semantics.

After the node-lock change, the new exclusive-node-writer case and both actual coordinator-crash cases passed **3/3**, with no skipped tests, in **14.49 seconds**:

```text
node --test --test-name-pattern='existing node writer|actual coordinator kill|unresolved persisted request' tests/recovery-security.test.mjs
```

The file now contains **12 cases**. This review's last run was the three-case targeted regression, not a claim that all 12 were rerun at that point. The final integration verification records the complete final-tree test result separately.

The fixture is a separate coordinator process. It intercepts a real `wire` call either before its first intent send or after obtaining the real node receipt, informs the parent test, and blocks. The parent kills the actual coordinator with `SIGKILL`. New coordinator and node processes load the retained state. These are process-death tests, not object reinitialization represented as a crash. Normal crash recovery tests wait for old node PIDs to exit; the additional held-node-lock test separately verifies protection against a writer that remains present.

## Evidence limits

The network crash cases in this review use UDP over loopback on Windows. They do not establish TCP durable recovery, remote enrollment, hardware failure or power-loss recovery, distributed consensus, production key custody, or general exactly-once external side effects.

DPAPI authentication does not protect against the same Windows user deliberately decrypting and re-encrypting state; semantic cache validation still applies. Local partial snapshot rollback is detected against retained evidence, but replaying the complete old directory and every local checkpoint requires an independent monotonic authority to detect. No such global rollback-resistance claim is made.

alpha.5 adds an opt-in external recovery anchor for that bounded case. The independent witness signs a ledger prefix and state projection with a pinned Ed25519 fingerprint; a caller-supplied keyring is required at recovery. Tests restore a complete directory copy from before sequence 2 and observe `RECOVERY_ANCHOR_ROLLBACK`. This does not authenticate the witness registry, time source, code/configuration release, or the unanchored suffix after the last explicit import.

Historical `RECEIPT_LOOKUP` reconciles already executed evidence without renewing authority or dispatching a new intent. Unknown pending execution remains unresolved and fails closed. No RCL Core promotion, K400 PASS, production deployment, or remote push is authorized by this review document.

## Final-tree teardown regression

The first full integration run reported 97/98: the actual coordinator crash recovery assertions passed, but its after-hook deleted the temporary directory immediately after killing the replacement coordinator. Its child nodes still held their OS writer locks, yielding Windows EPERM. The failure TAP is retained as `evidence/0.1.0-alpha.2/first-attempt-tests.tap`.

The test fixture now records child PIDs from real messages and waits for their exit before directory removal. No execution, signature, lock or recovery assertion was relaxed. Both real coordinator crash cases passed after this correction (2/2, 8.21 seconds). Final full verification is recorded in the versioned LOCAL_VERIFICATION.json, separately from these intermediate runs.
