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
