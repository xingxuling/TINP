# Canonical ownership and minimal P00 profile

Decision: **KEEP_SEPARATE + ADAPT**. New Internet composes an explicit `twni.*` execution profile; OPP remains the exchange/negotiation owner, RCL owns its executable semantic predicates, and RNCS/RFE retain world authority and facts. P00 is a compact field/reference projection over that composition. A schema is not a runtime or permission grant.

| Semantic surface | Existing owner / delivery | Current decision |
|---|---|---|
| OPP exchange protocols, CHP, exact RCP schema negotiation | OPP, unchanged commit-pinned source; bounded Python adapter | REUSE; do not copy negotiation logic into P00 |
| Topology, addressing syntax, forwarding/frame encoding, directory, UDP | TINP supplied v0.2 implementation | REUSE unchanged vendor files; add a separate compatibility/profile layer |
| Transaction, route admission and migration preservation predicates | RCL fixed programs + canonical compiler/JS runtime | REUSE/LOWER; cryptographic and route observations come from authenticated runtime state |
| Network transaction/session and receipt-chain ordering | Namespaced `twni` local profile | ADAPT composition; not a universal ownership or production claim |
| World proposals, authorization, commit and factual generations | RNCS core / RFE | KEEP_SEPARATE; adapter candidate only, runtime integration NOT_IMPLEMENTED |
| World multiplayer state synchronization | RNCS Reality Network Runtime | KEEP_SEPARATE domain organ; no duplicate authoritative world |
| Ecosystem source registry/governance | DHSC | Optional ADAPT donor; declaration is not reachability or permission |
| Native cognitive query / context | USCE | KEEP_SEPARATE; native architecture answer remains unresolved; no Internet identity ownership assigned |
| Whole-artifact planning/materialization | DWAC | KEEP_SEPARATE; candidate structures do not assign authority |
| Human memory-tree/forest sovereignty | World Tree / BIGS domain | KEEP_SEPARATE; finite-model regression donor |
| Developmental cognition / prediction | UPDIA family; supplied lab remains separate | UNKNOWN canonical runtime integration; prediction is not world authority |

P00 does not replace OPP CapabilitySpec/Envelope schemas or RNCS world envelopes. OPP fields are projected by the adapter and the OPP implementation judges agreement. Signed `twni.authority-lease.v0.1` and `twni.session.v0.1` are local experiment profiles; a string referring to an RNCS world does not authenticate that world's lease. A future RNCS adapter must explicitly translate time/scopes/issuer/receipt roots, verify current authority, and fail closed where equivalence is unproved.

## Ten objects, actual field mappings

`shared-ir/shared.schema.json` has exactly ten named object definitions. Validate the relevant `$defs` object or a projected object against the root union. The `x-runtimeProjection` annotations identify the source, rather than inventing a second constructor implementation.

| Object | Current runtime shape / projection |
|---|---|
| SubjectRef | `{subjectId, continuityRoot}` from the authenticated session/lease |
| IntentSpec | `{capabilityId, text}` returned by `parseLifeIntent`; the signed execute envelope binds this intent to authority/session/route |
| CapabilitySpec | `capabilityId`, `version`, `inputSchema`, `outputSchema`, `authorityRequired`, `semantics` from `CAPABILITY` |
| AuthorityLease | Signed lease **body**: IDs, scopes, `notBeforeMs`, `expiresAtMs`, region/retention/cost limits, security profile, nondelegation and purpose |
| EvidenceEvent | Full persisted ledger event: sequence, previous/event roots, type/time/classification and detail |
| WorldRef | `{worldId}` reference only; no world state or commit API |
| NodeRef | Ready/fixture node projection: `nodeId`, `pid`, `endpoint`, `publicKey`; no private key |
| RoutePlan | Actual bounded route: path/backups, cost/latency/energy/bandwidth, region/limits and root |
| SessionRef | Signed session **body**, including preserved IDs, source/target, lease/scopes/expiry/evidence roots and optional migration guard roots |
| ResourceBudget | `{maxCost, maxLatencyMs, maxEnergy, maxRetentionSeconds, region}` projected from the signed lease; guaranteed SLA, money and billing are not invented |

The signed wrapper remains `{body, root, signature}` from `identity.mjs`; this schema does not reimplement signature checking or RCL admission. Schema and current runtime string limits both count Unicode code points; the integrated boundary case executes 4096 supplementary Unicode characters over the actual network path. Temporal, scope-subset, authenticity, semantic-root and evidence-link conditions require executed checks, not shape validation.

## Subject address and compatibility

TINP `makeSubjectAddress` requires both `subjectId` and `nodeId` and produces `tinp+subject://subject@node`. That URI identifies a current body binding; it is not a stable subject identity across migration. This profile keeps the stable pair **subjectId + continuity reference**, represented in actual camelCase runtime fields as **`subjectId` + `continuityRoot`**. `continuityRef` is a descriptive concept here, not an extra unimplemented wire field.

`sourceNodeId` and `targetNodeId` may change while the subject pair, world and session identity remain constrained. No global stable-name resolver, ownership registry or cross-device identity recovery has been implemented. Preserve TINP's old syntax and tests; migrate through explicit projections, never silently reinterpret an old node-bound URI as a portable credential.

## Remaining integration boundaries

RCL executes transaction, migration and final route admission predicates. Candidate path enumeration and metric aggregation remain specialized JavaScript providers. The route-policy integration gap identified during audit was addressed by `rcl/route.rcl`, invoked on the execution node using trusted route observations and signed lease limits before provider execution; this is not a new RCL primitive. Mature socket/crypto/frame implementations remain auxiliary providers.

The local authority key and subject keys are ephemeral fixture roots distributed through trusted local process control. Node-signed receipts attest this experiment. They do not establish public enrollment, production key custody, global revocation or RNCS commit authority. OPP acceptance intersects declarations and grants no execution authority.

## alpha.4 外部操作员边界

新增复用 AAF 的 approval receipt、canonical seal 和签章验证三个原始模块。TINP adapter 检查固定SPKI指纹、challenge root、精确role/scope、canonical时间窗和外部撤销输入，不导入默认可免签的完整AAF evaluator，不构造虚假RNCS formal requirements。网络退休challenge作为本profile的AAF proposal_root，不代表RNCS世界proposal或commit。原RCL退休Profile继续裁决已认证操作员与撤销确认事实，无Core变更。

alpha.2起可选Windows持久模式已保存网络密钥；alpha.4仅把操作员公钥指纹写入该checkpoint。外部公钥keyring与签署私钥保持分离，已启用pin状态不得通过确认参数降级。初次本机pin不是生产身份注册；完整目录回滚和受信外部时间仍需独立锚点。
