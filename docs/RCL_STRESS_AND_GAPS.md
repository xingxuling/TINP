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
| 全目录防回滚 | 无独立外部可信锚点 | 当前明确拒绝声称此能力 | EXTERNAL_ANCHOR_GAP | 跨项目可信状态恢复 | NOT_IMPLEMENTED | K250 K257 |

新增回归：真实 coordinator kill 后只查询已执行回执；发出前崩溃不重发；节点密钥与已消费证据锚点冷恢复；撤销不回退；部分缓存回滚、账本截断和伪签名拒绝；同目录协调器及节点写锁；恢复不扩 scope/expiry、不重发 lease；已过期状态可审计恢复但不可执行。参见实际 tests.tap 与独立恢复审查。

九门仍分别 NOT_ADJUDICATED。本机真实执行提供 EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST 的候选证据；现有有界性能数字不含 DPAPI 恢复开销，不代表其 SLA。AI_GENERATE 未评估。没有自动吸收、上游 Core 变更或晋升。

## alpha.3 未决维护压力增量

- Task/missing capability：缺少未知执行结果的可审计处置入口；gap type = RCL_INTEGRATION_GAP，不是语言表达缺口。
- Donor/workaround：复用既有 compiler/runtime、DPAPI、签名账本、撤销水位和内核写锁；Node 提供队列和 CLI，RCL 负责 exact root/操作员确认/已撤销/全部确认/存在pending 的准入。
- Generality：执行未知与重新授权分离、单调关闭、先证据后清状态可复用；Candidate absorption 仅 pending-retirement.rcl 候选 Profile，不修改 Core。
- Provider advantage：Node 的进程生命周期与 Windows 文件保护保持专业实现；无 silent bypass。外部操作员身份及 anti-rollback anchor gap 当前明确未实施。
- Regression：maintenance 高/低层执行旁路、wrong root/未确认无写、缺节点ack、节点签章/epoch/watermark/事实根篡改、终止账本落盘前缀和suffix两个真实kill窗口、只读查询不泄露原文/密钥。
- Affected K400 candidates：沿用 K057/K110/K117/K250/K257。九门均 NOT_ADJUDICATED，真实 lowered execution 不冒充 native VM 或生产人类认证。
