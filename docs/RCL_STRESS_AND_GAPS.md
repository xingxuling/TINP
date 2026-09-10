# RCL 压力案例与缺口裁决

本轮优先使用已有 RCL 编译器与运行时。没有发现需要修改 Core 的表达障碍，也没有制造新原语或宣布晋升。新的固定 RCL 文件属于新互联网候选 Profile。

| task | missing capability at initial audit | workaround / donor | gap type | generality | candidate absorption | affected K400 cells |
| --- | --- | --- | --- | --- | --- | --- |
| 事务准入 | TINP rcl 文件只有 Text 描述，没有实际 admission | 复用 RCL compiler/runtime；host 注入已验签事实 | RCL_INTEGRATION_GAP，非 Core 缺口 | 身份/授权/时限匹配跨项目可用 | rcl/transaction.rcl，执行前调用及负测 | K057 K117 K257 |
| 会话迁移 | 初始 host JS 判定连续性与权限衰减 | 固定 rcl/migration.rcl；adapter 仅观测集合包含关系 | RCL_INTEGRATION_GAP | 跨运行身体的连续性 | 签署替换会话前真实 RCL gate，集成拒绝异主体 | K110 K250 K257 |
| 约束路由 | TINP 只有 cost shortest path，host 规则不能冒充 RCL | TINP 图 + JS bounded search + RCL route admission | Profile 组合与 RCL integration | 多约束执行准入 | trusted topology 汇总费用/时延/能耗，rcl/route.rcl 裁决 | K110 K117 K250 K257 |
| Socket / TCP / UDP | RCL 不负责承载驱动 | TINP UDP/frames，Node TCP socket | Auxiliary Runtime，非绕过 | 平台专业实现 | 保持 Provider，不吸收为 Core | K110 K250 |
| CHP/RCP 契约 | OPP 已拥有协议语义 | 原样 OPP + UTF-8 Python adapter | Existing owner dependency | 跨协议通用但已由 OPP 拥有 | 复用，不复制算法 | K117 K257 |
| RNCS world transport lease | tick/node/shard 与本版 wall-clock/subject lease 未证实等价 | 只读现实审计，未伪造 adapter | RNCS_ADAPTER_SEMANTIC_EQUIVALENCE_GAP | 需要真实跨世界消费者 | 下一候选，当前 NOT_IMPLEMENTED | K250 K257 |

K400 单元编号来自实际 RCL `campaignCellIdFor`，完整映射证据见 `audit/upstream/rcl-semantics.md`。它们是压力证据候选归档目标，不是本轮获得的 PASS。

九个门分别记录：EXPRESS、COMPILE、LOWER、EXECUTE 有这三个 RCL Profile 的当前本机证据；CORRECT/ROBUST 只有有界正负例、故障与攻击回归；PERFORMANCE 只有本机限定计时；AI_GENERATE 未做独立生成能力评估；EVIDENCE 有源码哈希、命令、回执和账本。所有门均未提交独立 K400 Court，因此总体 `NOT_ADJUDICATED`，不能互相补偿。

可复用 Regression Cases：同一证据锚点分叉、主体自报路由费用、源节点偷换、签名正确但标签错误的回执、Windows 子进程中文编码、响应丢失后的精确请求对账、未发送的限速消息被取消。它们已经影响源代码与测试，没有把联邦角色当装饰。

## alpha.2 恢复压力增量

| task | missing capability | workaround / donor | gap type | generality | candidate absorption | affected K400 cells |
| --- | --- | --- | --- | --- | --- | --- |
| 进程重启连续性 | 原 host 没有持久恢复准入 | 现有 RCL 编译器/runtime + recovery.rcl | RCL_INTEGRATION_GAP，非 Core 表达缺口 | 跨进程连续性与授权不扩张 | 固定候选 Profile；原根与实际账本前缀独立比较 | K110 K250 K257 |
| 持久密钥与单写者 | 原存储明文/临时接口不满足恢复 | Windows DPAPI / 内核文件锁，Python ctypes/msvcrt | PLATFORM_PROVIDER_GAP | 平台专属实现 | 保持专业 Provider，不修改 RCL Core | K110 K250 |
| 全目录防回滚 | 无独立外部可信锚点 | alpha.5 可选外部签名单调锚定账本前缀；仍无在线注册表 | EXTERNAL_ANCHOR_GAP + AUTHORITY_PROVIDER_INTEGRATION | 跨项目可信状态恢复 | 候选已实现；只覆盖最后显式锚定前缀 | K250 K257 |

新增回归：真实 coordinator kill 后只查询已执行回执；发出前崩溃不重发；节点密钥与已消费证据锚点冷恢复；撤销不回退；部分缓存回滚、账本截断和伪签名拒绝；同目录协调器及节点写锁；恢复不扩 scope/expiry、不重发 lease；已过期状态可审计恢复但不可执行。参见实际 tests.tap 与独立恢复审查。

九门仍分别 NOT_ADJUDICATED。本机真实执行提供 EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 的候选证据；现有有界性能数字不含 DPAPI 恢复开销，不代表其 SLA。AI_GENERATE 未评估。没有自动吸收、上游 Core 变更或晋升。

## alpha.3 未决维护压力增量

- Task/missing capability：缺少未知执行结果的可审计处置入口；gap type = RCL_INTEGRATION_GAP，不是语言表达缺口。
- Donor/workaround：复用既有 compiler/runtime、DPAPI、签名账本、撤销水位和内核写锁；Node 提供队列和 CLI，RCL 负责 exact root/操作员确认/已撤销/全部确认/存在pending 的准入。
- Generality：执行未知与重新授权分离、单调关闭、先证据后清状态可复用；Candidate absorption 仅 pending-retirement.rcl 候选 Profile，不修改 Core。
- Provider advantage：Node 的进程生命周期与 Windows 文件保护保持专业实现；无 silent bypass。alpha.5 外部锚点仍是可选 host provider，不冒充生产 authority。
- Regression：maintenance 高/低层执行旁路、wrong root/未确认无写、缺节点ack、节点签章/epoch/watermark/事实根篡改、终止账本落盘前缀和suffix两个真实kill窗口、只读查询不泄露原文/密钥。
- Affected K400 candidates：沿用 K057/K110/K117/K250/K257。九门均 NOT_ADJUDICATED，真实 lowered execution 不冒充 native VM 或生产人类认证。

## alpha.4 AAF 操作员接入压力

Task/missing capability：原operatorAuthorized仅来自本机明确确认，无法验证外部签章；gap type=RCL_INTEGRATION_GAP + AUTHORITY_PROVIDER_INTEGRATION，不是Core缺原语。Workaround/donor：固定HEAD原AAF canonical/contracts/signatures、Node Ed25519 SPKI指纹及时间/范围适配，原RCL退休规则接收真实验签观测。

Generality：签名与权限分离、信任根不能由批准自带、提交前复验、历史证据不能重新授权均可跨项目复用。Candidate absorption：薄adapter和正负/崩溃回归，不复制AAF算法、不修改RCL Core。Affected K400 candidates沿用K057/K110/K117/K250/K257，九门仍NOT_ADJUDICATED。

Regression：确认绕过、缺/替换/撤销key、错误签者/范围/挑战、过期、ack后撤销/过期、策略降级、外部签章/时刻被网络协调器伪造、真实kill后过期历史批准只终结不执行。Donor advantage是真实签章格式兼容；外部可信时间/恢复锚点/人类托管仍为EXTERNAL_AUTHORITY_ANCHOR_GAP，不以本机DPAPI绕过。

## alpha.6 authority registry 压力

Task/missing capability：调用方 keyring 仍没有独立 authority Owner 的发布、撤销、轮换和跨主机收敛；gap type=AUTHORITY_PROVIDER_INTEGRATION + EXTERNAL_REGISTRY_GAP，不是 RCL Core 表达缺口。Workaround/donor：新增严格 `twni.authority-registry.v1` adapter，复用 `identity.mjs` 的 canonical seal，参考 formal-gate 的 pinned signer/fingerprint 与 AAF 的撤销注册表边界；issuer 在独立 child 进程签名，主机验证 sequence/previous root、append-only key epoch、predecessor、角色子集和成员公钥映射。

Generality：签名 registry root、不可复活的 key lifecycle、角色不升级和调用时 keyring 投影可跨项目复用；candidate absorption 仅为 TINP host/profile，未增加 RCL primitive、未改变 RNCS/AAF owner。Provider advantage 是 Node crypto/IPC/JSON CLI 的本机适配；成员 key material、issuer custody、time 和 publication 仍是外部 authority 责任。

Regression：伪造 issuer、issuer key 替换/撤销、policy/root/sequence/previous root 篡改、旧成员复活、authority 或 roles 升级、错误 predecessor/epoch、重复 active key、getter/inherited keyring、缺失或指纹不符成员 key、expired/not-yet-valid snapshot 都 fail closed。CLI 与 `recovery-anchor` opt-in bridge 均只读 registry，不写 checkpoint 或自动发布。

Affected K400 candidates：沿用 K057/K110/K117/K250/K257。EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 仅有本机 profile 与负例证据；PERFORMANCE 只测本机 CLI/crypto，不代表 registry SLA；AI_GENERATE 未评估；alpha.6 的 `LOCAL_VERIFICATION.json`、Court 和 delivery receipt 已归档，alpha.7 追加分发见证。九门仍 `NOT_ADJUDICATED`。

## alpha.7 authority registry distribution 压力

Task/missing capability：离线 registry 文件没有跨镜像一致性观察、分叉拒绝或最小签名阈值；gap type=AUTHORITY_PROVIDER_INTEGRATION + EXTERNAL_DISTRIBUTION_GAP，不是 RCL Core 表达缺口。Workaround/donor：新增严格 `twni.authority-registry-distribution.v1` bundle，复用 authority registry 的 canonical root/signature 和 external key fingerprint 边界；独立 mirror child 对同一 snapshot 签 receipt，验证器要求 caller policy 固定的 distinct mirror threshold。

Generality：同一对象根上的多方签名、有效分叉 fail-closed、重复/过期/错误 key 拒绝可跨项目复用；candidate absorption 仍是 TINP host/profile，不增加 RCL primitive，不改变 RNCS/AAF owner。Provider advantage 是 Node IPC/crypto/JSON 的离线适配；mirror lifecycle、online publication、trusted time、cross-host history 和 durable conflict resolution 仍由 external authority 负责。

Regression：不同 registry root/sequence 的有效 mirror receipt、threshold 不足、重复或乱序 receipt、镜像公钥替换/撤销/私钥输入、accessor/inherited keyring、错误 policy root、过期/未生效 receipt 均 fail closed。CLI 与 demo 只读取 bundle 与 keyring，不发布、持久化或自动修复分叉。

Affected K400 candidates：沿用 K057/K110/K117/K250/K257。EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 仅有本机分发 profile 与负例证据；PERFORMANCE 只测本机验签，不代表镜像网络 SLA；AI_GENERATE 未评估；EVIDENCE 以 alpha.7 `LOCAL_VERIFICATION.json`、Court 和 delivery receipt 为准。九门仍 `NOT_ADJUDICATED`。

## alpha.5 外部恢复锚点压力

Task/missing capability：完整旧目录回放无法仅靠同一用户 DPAPI 识别；keyring 最新性和锚点序号需要外部 authority 输入。Workaround/donor：新增严格的 `twni.external-recovery-anchor.v1` adapter，固定 Ed25519 指纹，签署 ledger prefix/state projection，独立 signer child 只返回签名，主机验证并显式导入。

Regression：策略/签名/root/公钥替换、撤销 key、低序号、缺失账本前缀和完整旧目录回放均 fail closed；有效新锚点可恢复同一主体/租约，checkpoint 不含 keyring 或私钥。`accept` 的维护启动尾部按已验证前缀接纳并记录 adoption mode，不生成新权限。

Generality / gap：单调外部水位、配置根和恢复前缀可跨项目复用，但当前调用方提供的 keyring、时间、代码/配置版本与在线撤销仍未认证；上一次显式锚定后的尾部不在证明范围。没有修改 RCL Core，锚点只作为 host recovery observation。Affected K400 candidates 沿用 K110/K250/K257，九门仍 NOT_ADJUDICATED。

## alpha.8 authority registry historical convergence 压力

Task/missing capability：alpha.7 的单次 distribution quorum 没有跨快照的连续性、前根和镜像集合稳定性观察；gap type=AUTHORITY_PROVIDER_INTEGRATION + EXTERNAL_CONVERGENCE_GAP，不是 RCL Core 表达缺口。Workaround/donor：新增严格 `twni.authority-registry-convergence.v1` 容器，复用 authority registry 的 Genesis/sequence/previous-root 语义与 distribution bundle 的每段 mirror quorum，计算 `historyRoot` 绑定有限历史。

Generality：连续签名历史、显式缺口、前根断裂、同序号重复/分叉和镜像集合漂移的 fail-closed 检查可跨项目复用；candidate absorption 仍是 TINP host/profile，不增加 RCL primitive，不改变 RNCS/AAF owner。Provider advantage 是 Node crypto/JSON 的离线容器与 CLI 适配；在线透明日志、可信时间、撤销传播、跨主机持久收敛、冲突处置和硬件托管仍由 external authority 负责。

Regression：缺失序号、错误 Genesis、错误 predecessor root、同序号不同 issuer root、重复快照、篡改 `historyRoot`、每段 quorum 达标但 accepted mirror 集合漂移、乱序/重复 child、accessor/inherited history 以及私钥输入均 fail closed。CLI、demo 和 verifier 只读取调用方历史，不发布、修复或持久化共识状态；单独提交的有效签名分叉超出透明日志能力边界。

Affected K400 candidates：沿用 K057/K110/K117/K250/K257。EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 仅有本机历史 profile 与负例证据；PERFORMANCE 只测本机验签和排序，不代表透明日志或镜像网络 SLA；AI_GENERATE 未评估；EVIDENCE 以 alpha.8 `LOCAL_VERIFICATION.json`、Court 和 delivery receipt 为准。九门仍 `NOT_ADJUDICATED`。

## alpha.9 authority registry convergence store 压力

Task/missing capability：alpha.8 的有限 convergence history 只在调用内验证，缺少一个能把公开历史安全落到本机、拒绝本地回退并保留完整前缀的最小持久化边界；gap type=AUTHORITY_PROVIDER_INTEGRATION + LOCAL_DURABILITY_GAP，不是 RCL Core 表达缺口。Workaround/donor：新增严格 `twni.authority-registry-convergence-store.v1` 文件适配，复用 convergence `historyRoot`、distribution 验签和既有目录 writer lease，使用临时文件 fsync/rename。

Generality：原子公开状态写入、幂等 replay、精确前缀扩展、回退/旧前缀改写 fail-closed 和不落私钥可跨项目复用；candidate absorption 仍是 TINP host/profile，不增加 RCL primitive，不改变 RNCS/AAF owner。Provider advantage 是 Node 文件系统与现有本机租约；在线透明日志、跨主机共识、可信时间、整文件替换防护和外部撤销仍由 authority Owner 负责。

Regression：首次 append、连续 extension、相同历史 replay、shorter rollback、旧 child/root rewrite、错误 policy、篡改 store root、malformed/accessor/private state、目录并发写和 latest-current 检查均有正负例；store 只在完整候选前缀通过后原子替换，失败不得改变 durable bytes。

Affected K400 candidates：沿用 K057/K110/K117/K250/K257。EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 仅有本机文件与进程证据；PERFORMANCE 未作 store SLA 或跨主机吞吐声明；AI_GENERATE 未评估；EVIDENCE 以 alpha.9 `LOCAL_VERIFICATION.json`、Court 和 delivery receipt 为准。九门仍 `NOT_ADJUDICATED`。

## alpha.10 authority registry external convergence witness 压力

Task/missing capability：alpha.9 的本机 convergence store 能拒绝同一文件生命周期内的回退与旧前缀改写，但没有独立 authority 对当前完整 store 状态签名的最小绑定；gap type=`AUTHORITY_PROVIDER_INTEGRATION + EXTERNAL_WITNESS_GAP`，不是 RCL Core 表达缺口。Workaround/donor：新增严格 `twni.authority-registry-convergence-witness-policy.v1` / `twni.authority-registry-convergence-witness.v1` adapter，复用 `identity.mjs` canonical seal、authority registry/distribution/convergence/store validators 和独立 child signer；witness body 绑定 `historyRoot`、序号边界与完整 `storeStateRoot`。

Generality：外部签名绑定公开状态、保留前一见证根、连续 witness sequence、结构有效替换/回退 fail-closed 可跨项目复用；candidate absorption 仍是 TINP host/profile，不增加 RCL primitive，不改变 RNCS/AAF owner。Provider advantage 是 Node crypto/IPC/JSON CLI 的本机适配；见证私钥、保留介质、在线发布/撤销、可信时间、硬件托管和跨主机冲突处置仍由 external authority 负责。见证 sequence 是调用方外部水位，不自动等同于全局 registry sequence 或在线共识。

Regression：错误 policy/scope/store format、错误或撤销 witness key、伪造 root/signature、未来 `issuedAtMs`、结构有效但不同的 store、同序号替换、跳号/回退、错误 previous witness root、无效 retained predecessor signature、accessor/inherited/private material 与 unknown CLI flags 均 fail closed。没有 retained prior witness 时不声称能发现整个 witness/store 文件同时替换；request 不签名、不生成或持久化私钥，verify 不写运行状态。

Affected K400 candidates：沿用 K057/K110/K117/K250/K257。EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 只有本机独立签名进程、CLI、demo 和单元/边界测试证据；PERFORMANCE 未作 authority/witness SLA 或跨主机吞吐声明；AI_GENERATE 未评估；EVIDENCE 待 alpha.10 `LOCAL_VERIFICATION.json`、Court 和 delivery receipt 固化。九门仍 `NOT_ADJUDICATED`。

## alpha.10 后续 external authority handoff 审计

本轮对 GitHub `xingxuling` 公共仓库和 TINP 本地源码做了有界考古，未找到在线 authority publisher、revocation service、透明日志或跨主机 recovery provider。该缺口属于 `AUTHORITY_PROVIDER_INTEGRATION + EXTERNAL_OWNER_GAP`，不是 RCL Core 表达缺口；不建立本地伪 publisher、合成 trusted clock 或测试 keyring 作为替代。Owner 的输入、staging 证据与 fail-closed admission gates 见 `docs/AUTHORITY_PROVIDER_READINESS.md`，观察记录见 `audit/authority-provider-search-2026-09-10.json`。K400 九门继续 `NOT_ADJUDICATED`。
