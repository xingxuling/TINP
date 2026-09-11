# Evidence-driven specification deviations

This supplements the two input specifications without editing the original DOCX files. Their P00–P15 split remains a roadmap. The source-backed changes below define the narrower current candidate; unimplemented areas remain visible in `registry/protocols.json`.

## 1. OPP is broader than handshake

- **Original Assumption:** OPP might serve only a generic handshake; P04 could implement capability agreement again.
- **Observed Evidence:** Current OPP `f7b76582a720d9d18af5153affa0fc2d78bc0410` owns six exchange protocols, real CHP/RCP, bridge extraction and bounded native invocation. DHSC delegates agreement to that source. TINP's legacy projection is not equivalent to current OPP validation.
- **Reasoning:** Duplication would split one agreement owner; merging repositories would couple independent network/exchange lifecycles without closing a missing runtime.
- **New Decision:** Independent repository, unchanged pinned OPP source package plus thin adapter; P04 uses actual upstream CHP/RCP. Adapter enforces this profile's exact capability version separately.
- **Impact:** OPP remains authoritative for its contract agreement; the new lease is independently authenticated. P00 cannot claim ownership of OPP exchange schemas.
- **Rollback:** Disable/remove this new profile adapter; retain upstream and TINP intact. Legacy projected agreements do not gain upstream validity by rollback.

## 2. RCL Text declarations are not executable guards

- **Original Assumption:** TINP `rcl/tinp-kernel.rcl` invariant facets might already prove admission safety.
- **Observed Evidence:** They are `Text = "true"` or descriptive Text values. Current RCL has executable `when`/`needs`/state transitions and the bounded tests exercise actual guards.
- **Reasoning:** Requirement prose and string constants cannot reject a bad transaction or unauthorized migration.
- **New Decision:** Fixed `rcl/transaction.rcl`, `rcl/migration.rcl` and `rcl/route.rcl` run via unmodified canonical compiler and JS runtime. Authenticated host observations supply facts, not admission decisions.
- **Impact:** RCL guards genuinely execute in this local lowering profile. Route enumeration and trusted metric aggregation remain explicit host providers; final route admission checks signed cost/latency/energy/region limits in RCL. No native-VM or full K400 claim follows.
- **Rollback:** Disable the new callable profile if these guards cannot execute; do not fall back to treating Text facets as authorization.

## 3. Preserve TINP; stable subject reference is separate from a node-bound address

- **Original Assumption:** Split/rewrite TINP immediately into P02–P09 and use its subject URI as the permanent subject identity.
- **Observed Evidence:** Existing TINP has reusable topology, discovery, forwarding, framing, UDP and tests. Its subject URI contains `@node`, so migration necessarily changes that address.
- **Reasoning:** A destructive split would jeopardize reusable runtime; node binding must not redefine a subject.
- **New Decision:** Preserve selected vendor files byte-for-byte and compose adapters. Stable subject reference uses `subjectId` plus `continuityRoot`; node/source/target remain separate fields.
- **Impact:** No global naming service is claimed. P00's ten JSON objects are current profile projections; the roadmap's broader identity model remains partial.
- **Rollback:** Remove new projections/adapters and return to the isolated TINP experiment. Keep old URI semantics intact.

## 4. RNCS has real overlapping domain contracts

- **Original Assumption:** General world/session/transport/authority shapes might be empty territory for the new Shared Core.
- **Observed Evidence:** RNCS main-95 `09f11a88e56c93f3b295c767ff71f62f7e4f890f` has world transport/association/roaming, authority/committed-receipt checks, pseudo-sovereignty and RFE durable facts. Its ticks/shards/authority leases differ from this wall-clock subject/capability fixture.
- **Reasoning:** Similar words do not prove semantic equivalence. Schema copying or ID references cannot implement lease attenuation or world commit verification.
- **New Decision:** Preserve RNCS/RFE ownership; classify a future bridge as ADAPT candidate. The present `twni` lease/session is independent and namespaced.
- **Impact:** WorldRef is only a reference. RNCS runtime integration and authoritative world writes are NOT_IMPLEMENTED.
- **Rollback:** Remove the candidate mapping without touching RNCS or local domain runtime.

## 5. First closure is pure and local; production remains unfinished

- **Original Assumption:** Completing a broad checklist could justify military/commercial/life-grade readiness or a full P00–P15 release.
- **Observed Evidence:** Three independent local processes exchange real signed UDP/TCP frames and execute one pure capability. Tests cover faults, continuity and governance rejection. There is no multi-host/public-network execution, NAT/DNS/TLS/QUIC/VPN adapter, production enrollment, guaranteed SLA or side-effect transaction coordinator.
- **Reasoning:** Evidence level must match the execution boundary. A timed-out remote read can be retried; arbitrary irreversible operations cannot inherit that assumption.
- **New Decision:** Deliver a local runnable candidate and explicit per-domain partial/not-implemented registry. Survival may defer without producing a result; Isolated may execute only an already-authorized local capability. They describe available service, not one monotonic security ranking.
- **Impact:** Protocol roadmap, commercial deployment, global sovereignty/identity recovery and high-impact operations remain unfinished. Signed frames provide integrity/authentication in the fixture, not payload confidentiality; relays can see content. Test-control IPC is not a production governance API.
- **Rollback:** Close the fixture processes and retain auditable receipts. No external state, production service or authoritative world has been changed.

## 6. Native organs expose gaps instead of invented architecture answers

- **Original Assumption:** Current DWAC/USCE would independently settle reuse decisions.
- **Observed Evidence:** USCE native query returned UNRESOLVED; current exact DWAC mounting failed its handshake; DWAC classified the goal as a generic artifact with a semantic-classification provider gap.
- **Reasoning:** Provider-free restrictions and exact attestation are part of the evidence boundary.
- **New Decision:** Preserve raw outcomes; perform explicitly attributed source-based engineering review. Do not replace the native answer with a generic model and label it USCE/DWAC.
- **Impact:** The independent native architecture judgment remains unavailable. Fixing that separate organ integration is not a dependency of the demonstrated network closure.
- **Rollback:** None required; no pins, authorities or organ registrations were mutated.

## 7. Offline mirror quorum is an observation, not a registry service

- **Original Assumption:** A signed authority registry file could be treated as globally published state once copied to several hosts.
- **Observed Evidence:** The current candidate has no online registry, trusted clock, durable mirror history or cross-host transport. It can, however, verify several independent signatures over the same canonical registry root during one invocation.
- **Reasoning:** Same-call agreement is useful evidence for distribution consistency, but it cannot establish publication, freshness, revocation propagation or recovery after a network partition.
- **New Decision:** Add an opt-in `twni.authority-registry-distribution.v1` bundle. A caller-selected policy pins mirror fingerprints and a threshold; each receipt binds the registry policy root, registry root/sequence and bounded time window. Verification fails closed on a valid signed fork, stale receipt, duplicate mirror or insufficient threshold.
- **Impact:** P05/P06 gain a bounded offline distribution observation. The bundle does not create RCL authority, RNCS world commit, AAF approval, online convergence, transparent history or production identity enrollment.
- **Rollback:** Remove the distribution adapter and use the alpha.6 registry snapshot path; existing registry roots and owner boundaries remain unchanged.

## 8. Finite historical convergence is still an offline observation

- **Original Assumption:** Once each registry snapshot has a mirror quorum, a sequence of copied bundles could be treated as an already converged authority history.
- **Observed Evidence:** The local candidate has no online publisher, transparent log, trusted clock, durable cross-host mirror state or conflict-resolution service. It can verify a caller-supplied finite sequence of distribution bundles and detect gaps, broken predecessor roots, duplicate/same-sequence forks and accepted-mirror-set drift.
- **Reasoning:** Continuity within supplied history is stronger than same-call quorum, but it says nothing about omitted history or future publication. A valid issuer signature on a fork remains possible unless competing histories are available to the verifier.
- **New Decision:** Add an opt-in `twni.authority-registry-convergence.v1` bundle with a canonical `historyRoot`. Require Genesis/sequence 1, contiguous sequence and previous-root links, per-snapshot mirror quorum and one stable accepted mirror set; fail closed on duplicate or conflicting roots and mirror drift.
- **Impact:** P05/P06 gain a bounded historical-consistency observation. The bundle does not create RCL authority, RNCS world commit, AAF approval, online publication/revocation, transparent history, trusted time or production identity enrollment.
- **Rollback:** Remove the convergence adapter and retain the alpha.7 single-distribution bundle path; existing registry/distribution roots and owner boundaries remain unchanged.

## 9. Local history persistence is not distributed durability

- **Original Assumption:** A verified finite convergence history could be copied into a local file and then treated as durable authority state.
- **Observed Evidence:** The candidate has no online publisher, transparent log, trusted clock, cross-host consensus or whole-file anti-replacement anchor. It can safely write a caller-selected public history on one host, serialize it with an atomic temp-file replacement, and reject shorter or altered old prefixes on later explicit appends.
- **Reasoning:** Local durability removes accidental truncation and replay ambiguity, but a file path and host filesystem are not an independently authenticated authority root. Historical receipts may age out while the latest snapshot must still be current under the caller's clock.
- **New Decision:** Add an opt-in `twni.authority-registry-convergence-store.v1` wrapper. Persist only the convergence bundle and derived public metadata; require exact existing-prefix extension, return `unchanged` for exact replay, and fail closed before changing bytes on rollback, prefix rewrite, policy mismatch, malformed state or private material.
- **Impact:** P05/P06 gain a bounded local durability observation. The store does not create RCL authority, RNCS world commit, AAF approval, online publication/revocation, trusted time, transparent history, cross-host convergence or lost-key recovery.
- **Rollback:** Remove the store adapter and retain the alpha.8 caller-supplied convergence verification path; existing registry/distribution/convergence roots and owner boundaries remain unchanged.

## 10. External convergence witness is a retained binding, not online transparency

- **Original Assumption:** A locally persisted convergence history could be treated as authority state without an independently signed binding to the complete file state.
- **Observed Evidence:** The candidate has no online authority publisher, trusted clock, transparent log or cross-host consensus. The local store can be structurally valid after a whole-file replacement. An independent signer can nevertheless sign the canonical store state root and a caller-retained witness sequence.
- **Reasoning:** Binding `historyRoot` alone does not cover store metadata or the complete serialized state. A canonical `storeStateRoot` plus policy/sequence fields lets a retained external witness detect a structurally valid store replacement and a same-sequence witness replacement, while preserving the authority boundary.
- **New Decision:** Add opt-in `twni.authority-registry-convergence-witness-policy.v1` and `twni.authority-registry-convergence-witness.v1`. The request path is read-only; verification authenticates the external witness, exact store state and underlying registry/distribution/convergence inputs, then requires a contiguous retained predecessor when supplied.
- **Impact:** P05/P06 gain a bounded local external-signature observation. This does not create an RCL primitive, RNCS world grant, AAF approval, online publication/revocation, trusted time, hardware custody, transparent history or cross-device consensus. If both store and witness files are replaced together, the local verifier has no independent history to compare.
- **Rollback:** Remove the witness adapter, signer, CLI actions and demo; retain the alpha.9 local store path. Existing registry/distribution/convergence/store roots and owner boundaries remain unchanged.

## 11. Cross-process replay expands local evidence without claiming physical-host convergence

- **Original Assumption:** A local convergence store's append/replay behavior could be reviewed in one process and directory even when the next gap concerns multiple independent runtimes.
- **Observed Evidence:** The candidate has no physical second host, encrypted authority transport or production conflict service. Two independent local Node child processes can nevertheless exchange a serialized public store state, verify the prefix, replay it idempotently and extend it; a same-length signed fork, mirror-set drift and sequence gap can be rejected without changing the receiving bytes.
- **Reasoning:** Process and directory separation exposes serialization, import and conflict-retention failures that a single in-process test cannot see. It must remain labeled as a local stress harness because process isolation is not host identity or external consensus.
- **New Decision:** Add a test-only cross-process replay worker and `twni.authority-registry-cross-host-replay-demo.v1` evidence path that reuses existing convergence/store validators. Transfer only public state and retain unresolved conflicts; do not add a publisher, winner election or new authority root.
- **Impact:** P05/P06 gain bounded local multi-process replay evidence. The harness does not provide two physical devices, encrypted transfer, trusted time, online publication, global revocation or production conflict convergence; the external Owner gap remains open.
- **Rollback:** Remove the replay worker, demo, test and evidence entry; alpha.10 store/witness behavior and all authority owner boundaries remain unchanged.

## 12. TINP DATA loopback transfer is transport evidence, not physical-host authority

- **Original Assumption:** After process/filesystem replay passes, a public authority state exchange could be described as a TINP network transfer without exercising the existing wire path.
- **Observed Evidence:** The candidate can bind two independent local TCP workers, pin their public keys, send a signed public convergence-store state in an existing TINP `DATA` frame, replay and extend it through the store validators, and retain the receiver after fork, gap, mirror drift or tampered-state rejection. The run records three frames, 16,706 bytes and zero invalid received frames.
- **Reasoning:** Reusing the existing framing and peer admission catches serialization, endpoint and response-path faults that IPC-only replay cannot see. Loopback is still one host; it gives no evidence of TLS confidentiality, physical-device identity, trusted time, online publication or production conflict agreement.
- **New Decision:** Add a test-only `twni.authority-registry-loopback-transfer-demo.v1` worker/demo/test path. Keep the transfer format public-state-only, route acceptance through existing `LocalTransport` and convergence-store append validators, and preserve unresolved conflicts; do not add a production authority sync protocol or winner election.
- **Impact:** P05/P06/P09 gain bounded local socket/process evidence. This does not create an RCL primitive, RNCS world grant, AAF approval, online registry, global revocation, hardware custody, trusted timestamp or distributed durable consensus; the external Owner gap remains open.
- **Rollback:** Remove the loopback worker, demo, test, protocol-registry row and evidence entry; alpha.11 replay/store/witness behavior remains unchanged.

## 13. TLS 1.3 loopback transfer is an auxiliary encrypted transport candidate

- **Original Assumption:** TINP's TCP loopback evidence could exercise the wire path while leaving socket confidentiality and peer certificate admission for a later provider.
- **Observed Evidence:** The existing `LocalTransport` signs DATA envelopes and pins TINP peer public keys, but its TCP socket is plaintext. Node's TLS runtime can accept caller-supplied credentials and reject a peer whose certificate is outside the configured CA pin; the same signed public store state can then be transferred over TLS 1.3.
- **Reasoning:** Reusing `LocalTransport`, TINP DATA framing and existing convergence/store validators isolates transport confidentiality without creating a second authority protocol. TLS certificate possession is transport evidence, not an authority lease, registry membership or RCL decision.
- **New Decision:** Add a caller-supplied `tls` transport mode, a test-only temporary OpenSSL certificate fixture, a TLS loopback demo and a wrong-CA negative test. Require TLS 1.3, pin the peer certificate as a CA and retain TINP peer public-key admission for message identity.
- **Impact:** P06/P09 gain bounded local encrypted-socket evidence. Production certificate issuance/rotation/revocation, hardware custody, physical-host enrollment, trusted time, online authority and distributed conflict resolution remain unimplemented; no RCL Core, RNCS/RFE or AAF owner changes.
- **Rollback:** Remove the TLS mode, certificate fixture, wrapper/demo/test and alpha.13 registry/evidence entries; TCP/UDP transport and alpha.12 public-state transfer remain available.

## 14. Read-only HTTP policy is a transport observation, not general Internet authority

- **Original Assumption:** A real public REST response could be treated as proof that OPP had gained a general Internet adapter.
- **Observed Evidence:** TINP can execute one caller-pinned HTTPS `GET` with exact host/path allowlists, one attempt, no ambient proxy or credentials, bounded JSON, explicit field projection and a rooted receipt. The OPP consumer accepts this output only through a separate handoff verifier. The live provider is still a TaoWind TINP candidate, not an independent provider.
- **Reasoning:** Transport reachability and a rooted observation are useful integration evidence, but they do not create CHP/RCP authority, credential custody, broad HTTP semantics, cross-host trust or external-world fact ownership. Receipt validation must also enforce coherent `PASS`/`FAIL_CLOSED` relationships after root recomputation.
- **New Decision:** Keep the adapter under TINP transport/provider ownership, keep OPP as the interop/consumer owner, and record the explicit handoff as candidate-only. Reject duplicate folded headers, hidden header properties, non-object JSON and semantically inconsistent rooted receipts.
- **Impact:** One concrete OPP-shaped public read is reproducible and auditable. No RCL Core primitive, RNCS world fact, authority lease, general HTTP/OpenAPI/MCP support or production claim is added.
- **Rollback:** Remove the read-only adapter, hardening tests, evidence and Court entry; existing TINP transport and OPP CHP/RCP paths remain unchanged.
