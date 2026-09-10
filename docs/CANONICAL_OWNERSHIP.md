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

alpha.2起可选Windows持久模式已保存网络密钥；alpha.4把操作员公钥指纹写入checkpoint，alpha.5增加显式外部单调恢复锚点，alpha.6增加独立 issuer 签署的 authority registry 快照和角色 keyring 桥接。外部公钥keyring、操作员/见证签署私钥与网络运行端保持分离，已启用pin状态不得通过确认参数降级。初次本机pin不是生产身份注册；在线撤销、可信时间、代码/配置发布和锚点后的尾部仍需独立 authority。

## alpha.5 外部恢复锚点边界

外部恢复见证的签署格式与密钥由本候选的 recovery-anchor adapter 约束，独立见证方拥有签署权，调用方拥有当前公钥/revocation 输入；TINP 主机只验证签名、单调序号、账本前缀和状态投影。锚点私钥不进入 coordinator、node 或 checkpoint，且不自动替代 RNCS authority、AAF operator 或人类身份 Owner。显式 pin 是本机信任 bootstrap；`request` 只读，`accept` 记录前缀接纳。

外部锚点只能证明已知锚点之前的本地目录前缀没有被完整回放。上次锚定之后的尾部、代码/配置发布、在线撤销、可信时间、跨设备加密和硬件托管继续由外部 authority/部署 Owner 负责。RCL recovery 仍拥有状态准入，锚点结果只是 host observation，没有新的 Core primitive 或 K400 晋升。

## alpha.6 authority registry boundary

`src/authority-registry.mjs` 是 TINP host/profile 的 authority-provider adapter，不接管 AAF approval 格式、RCL admission 或 RNCS world authority。registry policy 只固定 registry/issuer 标识、issuer SPKI 指纹和 policy root；签名快照固定 sequence/previous root、成员公钥指纹、authority、roles、keyEpoch、predecessor 和 revoked 状态。新成员必须由上一快照的 active 成员轮换而来，沿用 authority 和角色子集；旧成员不能复活。独立 issuer child 只签名 body，主机只验证签名和链。

调用方仍显式提供 issuer keyring、成员公钥和本机 `nowMs`。`keyringFromAuthorityRegistry` 生成的是本次调用的兼容 keyring，未写入 checkpoint，且不构成身份注册、在线撤销收敛、可信时钟、硬件托管或跨设备恢复。`recovery-anchor` CLI 的 registry 参数是 opt-in bridge；RCL recovery 仍拥有恢复准入，registry 结果只是外部 authority observation。Formal-gate donor 的 pin/fingerprint 与 revocation-registry 经验已记录为 donor advantage，没有复制其 owner 或修改 RCL Core。

## alpha.7 authority registry distribution boundary

`src/authority-registry-distribution.mjs` 只拥有 TINP 的离线分发验证适配。调用方策略固定 distribution ID、registry policy root、镜像 SPKI 指纹和 threshold；每个 mirror receipt 绑定 registry root/sequence、策略根和有限时间窗。验证先由 authority registry owner 验证 registry，再以调用方提供的 mirror keyring 验签，要求 distinct mirror quorum，并把任何有效但不同 root/sequence 的 receipt 判为 fork。它不选择生产镜像、不发布或撤销 key、不记录跨调用历史，也不授予 RCL/RNCS/AAF 权限。

独立镜像 child 只持有内存私钥并返回签名；bundle、policy 和 keyring 都是调用时输入，不写 checkpoint。quorum 证明是同一次读取中的一致性观察，不是在线收敛、透明日志、可信时间、跨设备恢复、硬件托管或代码/配置防回滚。External authority Owner 仍负责镜像生命周期、冲突处置、发布服务和生产密钥托管。

## alpha.8 authority registry historical convergence boundary

`src/authority-registry-convergence.mjs` 只拥有 TINP 对调用方提交的离线 registry 历史进行收敛检查的适配。`twni.authority-registry-convergence.v1` 绑定 distribution policy root、registry ID、排序后的 distribution bundles 和 `historyRoot`；验证要求 Genesis/序号 1、连续序号、逐段 `previousRegistryRoot`、每段 mirror quorum、稳定 accepted mirror 集合，并拒绝同序号重复或不同 root 的有效签名分叉。它不会选择生产历史、发布快照、提供透明日志或跨调用持久状态，也不授予 RCL/RNCS/AAF 权限。

历史容器和每段 bundle 都由调用方提供，`nowMs` 仍是本机输入；单个未与竞争历史同时提交的有效 issuer 签名分叉无法由本地适配器凭空发现。External authority Owner 仍负责在线发布、可信时间、撤销传播、透明日志、镜像生命周期、冲突处置、硬件托管和跨设备恢复。


## alpha.9 authority registry convergence store boundary

`src/authority-registry-convergence-store.mjs` 只拥有 TINP 对离线 convergence bundle 的本机持久化适配。它保存公开 bundles、`historyRoot`、policy/registry 标识和序号边界；append 在目录写者租约内复验既有与候选历史，要求候选完全包含既有 bundle 前缀，然后使用临时文件、fsync 和原子替换写入。相同历史返回 `unchanged`，回退、前缀改写、错误 policy、篡改 root 或私钥材料拒绝。

该 store 的 owner 仍是调用方部署与外部 authority：TINP 不选择路径信任根、不防止整个文件被替换、不提供可信时间、在线透明日志、跨主机持久共识、全局撤销或 RNCS/AAF/RCL 权限。旧 receipt 的历史验证可允许过期，但最新快照的当前性仍由调用方 `nowMs` 约束。
