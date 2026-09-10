# Pending retirement semantic ownership

The fixed RCL profile in `rcl/pending-retirement.rcl` owns admission to retire a pending request record. Its unchanged canonical compiler and semantic runtime execute the conjunction: an explicit operator request is authorized; the entire original lease is revoked; every configured node has acknowledged durable revocation; a pending record is present; and the expected request root exactly matches that record's actual root. Existing Text and Truth facets, equality, conjunction, warrants and witnessed transitions express this decision. No RCL Core primitive or parallel interpreter is introduced.

`adapters/rcl-pending-retirement.mjs` accepts exactly six immutable observations: `expectedRequestRoot`, `actualRequestRoot`, `operatorAuthorized`, `leaseRevoked`, `allNodesAcknowledged`, and `pendingPresent`. Roots must be 64 hexadecimal characters and are compared exactly, without normalization. The four other values must be booleans. Missing, extra, inherited, accessor and malformed values are denied before compilation or execution. Valid semantic denials execute the same fixed program as admission and retain its observation witness. Adapter results include source, program, state and observation hashes; these are evidence of the lowered RCL decision, not independent proof of the observations.

The host owns operator invocation, checkpoint authentication, signature checks, pinned-node enumeration, revocation persistence, acknowledgement verification, request-root binding and ledger writes. It must derive observations from these checks. `allNodesAcknowledged` cannot be inferred from coordinator revocation alone, a timeout, node discovery, an incomplete node subset, or an acknowledgement issued before persistence. The actual root comes from the authenticated pending record; the expected root comes from the explicit operator request. Neither is replaced with the other to force equality.

Admission permits recording a signed retirement event and terminating the matching pending record after durable acknowledgement from every configured node. The event must preserve its request-root binding and the unresolved execution outcome. A crash must leave either the pending record available for retrying retirement, or authenticated retirement evidence sufficient to explain its removal. The host must not clear pending state first and append evidence afterward. An acknowledgement or persistence failure leaves retirement incomplete and preserves the pending record. The original lease remains revoked; no replacement lease, expanded session, retransmitted request or provider execution follows from this gate.

Retirement does not assert that the original request never executed. A missing receipt is insufficient evidence of non-execution. Historical matching receipts may still be retained as evidence. This operation abandons further execution under the original lease while preserving the audit trail; it does not provide exactly-once external effects, network-wide consensus or reversal of already completed work.

The local operator boundary is the explicitly invoked operation by the Windows user who can open this fixture's DPAPI-protected credentials. It is a local fixture capability boundary. It is not an independently authenticated production human signer, and neither the boolean observation nor a valid RCL witness grants such authority. Production operator authentication and distributed revocation convergence remain separate work.

## Stress extraction and verification boundary

| Item | Decision |
| --- | --- |
| Task / missing capability | Safely terminate a receipt-unresolved pending record without retrying its execution or reviving its lease |
| Gap type | RCL_INTEGRATION_GAP; existing RCL primitives express the required admission |
| Workaround / donor | Reuse the vendored canonical RCL compiler/runtime and existing host crypto/persistence providers |
| Donor advantage | Host providers supply authenticated storage and durable acknowledgements; RCL preserves the fixed semantic decision and witnesses |
| Generality | Root-bound retirement after irreversible authority attenuation can apply to other pending-operation workflows |
| Candidate absorption | Candidate pending retirement profile and regression fixtures; no Core change or promotion |
| Affected K400 candidates | K057 windows/security-sensitive; K117 server/security-sensitive; K250 distributed-runtime/distributed; K257 distributed-runtime/security-sensitive |
| Evidence | `tests/rcl-pending-retirement.test.mjs` checks real compilation/runtime witnesses, all 32 predicate combinations, malformed snapshots, exact root binding and concurrent isolation |

The unit tests establish profile behavior under supplied observations. They do not establish caller authentication, durable node acknowledgements, crash ordering or end-to-end retirement. Those require the separate integration tests and evidence ledger for this increment. EXPRESS / COMPILE / LOWER / EXECUTE / CORRECT / ROBUST / PERFORMANCE / AI_GENERATE / EVIDENCE remain nine independent gates; no K400 cell PASS or production promotion is asserted. No new third-party source or dependency is introduced.
