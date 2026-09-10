# Recovery semantic ownership and evidence boundaries

The recovery profile owns admission of authenticated historical state. Existing RCL Text/Number/Truth facets, comparisons, Boolean conjunction, warrants and witnessed transitions express the required invariants. The fixed compiler/runtime in `vendor/rcl` executes `rcl/recovery.rcl`; no RCL Core change, parallel interpreter or generated predicate source is required.

The host owns disk access, cryptographic verification, checkpoint reconciliation, receipt binding and snapshot construction. It supplies trusted observations to the RCL program. RCL requires unchanged subject, continuity and world; expiry that cannot increase; revocation epoch that cannot regress; matching verified evidence roots; authenticated state and verified cache. Strict immutable input snapshots reject missing, extra, accessor and malformed fields. Passing truth observations without performing host verification is an integration defect, not a cryptographic verification performed by RCL.

An authenticated historical checkpoint may lag the ledger after a crash. The host must first validate its exact ledger prefix, authenticate any pending signed request, and reconcile only its matching verified receipt. The guard compares the root stored in the protected checkpoint with the root read independently at that checkpoint's position in the verified ledger, never a root asserted by a new request. A valid hash chain alone does not authorize an arbitrary appended ledger tail. A partial cache write, conflicting duplicate or invalid signature must fail closed; a completely replayed older local state cannot be detected without an independently trusted monotonic checkpoint.

Recovery is not renewal. An expired lease can be loaded for inspection and continuity, retaining its signed expiry. The transaction guard still rejects execution at or after expiry and after revocation. Cache lookup for normal dispatch must remain behind current authorization checks. An old receipt may support verified historical reconciliation, but does not grant execution or arbitrary side-effect retries.

## Initial source audit and required controls

At this round's starting source, `src/node-process.mjs` loaded JSONL cache records without verifying their signatures or key/request/anchor binding; node signing identities were ephemeral. Its revoked set and the orchestrator's revoked flag were memory-only. The integration must persist identities, authenticate every restored cache record, reject conflicting duplicate keys and anchors, durably preserve revocation before acknowledgement, and configure restored nodes with current revocations before serving requests. These are audit findings and required host controls; this document alone does not establish their implementation.

The provider remains a bounded read-only pure computation. Persist-before-acknowledge plus authenticated replay provides local retry evidence. It does not establish general exactly-once external side effects, distributed consensus, machine compromise resistance, power-loss guarantees, or production key custody.

## Current caller audit and independent runtime checks

`src/coordinator-state.mjs::initializeRecovery` loads the Windows current-user DPAPI protected checkpoint, checks authority and subject key pairs, verifies the signed lease/session, opens the ledger with authority signature verification, checks checkpoint length and exact prefix root, then validates signed suffix recovery observations. Recovery keeps the original lease root and cannot expand a saved session's scope or expiry or replace its session identity. These host checks establish the inputs to RCL; DPAPI and signatures do not replace semantic validation.

`src/suite.mjs::start` awaits `configureNodes`, which verifies restored node identity pins, signed revocations and cache consistency including receipts committed in the ledger. It then calls `admitRecovery`; pending receipt reconciliation completes before service activation. `restartNode` captures a fresh baseline and also records a non-null RCL guard before activation. `admitRecovery` compares protected baseline values with recovered state and independently reads the ledger prefix root. Its `stateAuthenticated` and `cacheVerified` observations rely on this checked caller ordering. The RCL adapter itself does not call DPAPI, verify signatures, read cache files, or prove those booleans from client assertions.

`tests/recovery-gate-integration.test.mjs` exercises the real exported caller and protected checkpoint path: successful admission contains the runtime witness `next-internet:rcl-state-recovery`; bad baseline root, regressing epoch and increased lease expiry are independently denied by RCL. Correctly signed malformed sessions, wrong checkpoint roots, lease reissue and saved-session expansion are denied by the host. Full durable suite reopening records the actual guard witness; an expired signed lease retains its exact root and expiry, and a real network dispatch is denied with zero provider executions. These checks supplement the separate crash/cache/revocation security tests; neither set promotes a K400 cell.

## Stress extraction

| Item | Decision |
| --- | --- |
| Task / missing capability | Durable local identity, session, revocation and receipt recovery had no integrated recovery admission profile |
| Gap type | RCL_INTEGRATION_GAP and host persistence Provider gap; existing language primitives suffice |
| Workaround / donor | Reuse fixed RCL compiler/runtime; Node filesystem and signature primitives remain auxiliary execution |
| Donor advantage | Mature filesystem and crypto implementations; RCL supplies witnessed, immutable-program semantic decisions |
| Generality | Identity preservation, no authority renewal, revocation monotonicity and authenticated evidence continuity apply across projects |
| Candidate absorption | Candidate recovery profile and regression fixtures; no new primitive or Core promotion |
| Affected K400 candidates | Existing K057 windows/security-sensitive; K117 server/security-sensitive; K250 distributed-runtime/distributed; K257 distributed-runtime/security-sensitive |
| Evidence | `tests/rcl-recovery.test.mjs` checks independent negatives, boundaries, malformed snapshots, concurrency and expired-state versus expired-execution behavior; final integration results belong to the round's evidence ledger |

EXPRESS / COMPILE / LOWER / EXECUTE / CORRECT / ROBUST / PERFORMANCE / AI_GENERATE / EVIDENCE remain nine separate non-compensating gates. These mappings are stress candidates only; no K400 cell PASS or promotion is asserted. Local lowered execution evidence does not establish native VM execution or production deployment.

No new external donor source or dependency is introduced by this profile. Existing vendored license and pin obligations remain in force.
