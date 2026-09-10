# TINP alpha.9 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 165/165 测试，零失败、零跳过，源码绑定 180 个运行/适配/测试文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换、多镜像分发、有限历史收敛和本机历史 store 分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution roots、history root、store witness 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## 现实审计与 Owner

从已核对远端的 alpha.8 / `e03e25eaf9ce6a0b772f8cb9a019731d6a0187d8` 继续，候选分支为 `codex/tinp-registry-v06`，本轮实现与文档提交为 `4539f56a8214fd915b7c80a5a9a9c5f7e3c2145e`。本轮复用 `identity.mjs`、authority registry adapter、distribution adapter、convergence adapter、AAF adapter、RCL recovery profile、recovery-anchor 和既有目录 writer lease，只新增严格 convergence-store provider、CLI 分支、独立本机 demo、测试与证据。没有把本地 keyring、测试 issuer/mirror、文件系统租约或完整 RNCS world commit 伪装成生产 authority。

TINP host 只验证 registry policy、签名快照、成员公钥映射、每段分发 receipts、调用时的历史连续性和本机 store 的公开状态前缀；独立 issuer/mirror child 持有各自签名私钥并只返回签名结果。registry、distribution/convergence bundle、store 和 keyring 不写入 coordinator checkpoint。AAF 仍拥有 operator approval 格式，RCL 仍拥有 recovery 与 pending-retirement 准入，RNCS/RFE 世界事实与提交权保持原 Owner。

## 实际闭环

`src/authority-registry.mjs` 固定 `twni.authority-registry-policy.v1` 与 `twni.authority-registry.v1`，并约束 seq1→seq2 append-only lifecycle。`src/authority-registry-distribution.mjs` 固定 distribution policy/receipt/bundle：caller policy 固定 registry policy root、镜像 SPKI 指纹和 threshold；receipt 绑定 registry root/sequence、distribution policy root、镜像指纹和有限时间窗；验证要求 distinct mirror quorum，任何有效但不同 root/sequence 的签名都会以 `AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED` fail closed。

`src/authority-registry-convergence.mjs` 固定 `twni.authority-registry-convergence.v1`：调用方提交多个 distribution bundle，`historyRoot` 绑定完整有序列表；验证要求从 Genesis/序号 1 开始连续，每个 `previousRegistryRoot` 精确指向上一快照，每段 quorum 达标且 accepted mirror 集合稳定，并以 `AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP`、`...FORK_DETECTED`、`...DUPLICATE_SNAPSHOT` 或 `...MIRROR_SET_DRIFT` 拒绝对应历史。

`src/authority-registry-convergence-store.mjs` 固定 `twni.authority-registry-convergence-store.v1`：store 只保存公开 convergence bundles、`historyRoot`、policy/registry 标识和序号边界。显式 append 先复验候选与既有历史，在现有目录 writer lease 内使用临时文件、fsync 与原子替换；相同完整历史返回 `unchanged`，只有完全包含既有 child root 前缀的更长历史能 `extended`，回退、旧前缀改写、错误 policy、篡改 root、malformed/accessor/private material 在写入前拒绝。读取验证允许旧 receipts 在有限历史中老化，但要求最新快照按调用方 `nowMs` 保持 current。

`authority-registry-convergence-store-demo.mjs` 实际启动一个独立 issuer 与三个 mirror，生成两个连续快照和每段 quorum；正例完成首次 append、连续扩展、幂等 replay 与 reload verify，回退和有效 alternate first child 的前缀改写分别被 `AUTHORITY_REGISTRY_CONVERGENCE_STORE_ROLLBACK` 与 `AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH` 拒绝。五个 store 单元测试加一个 CLI 测试覆盖这些契约；完整 `npm run verify` 还运行 UDP/TCP 三进程事务、持久恢复、pending 维护、外部锚点整目录回放、registry 独立 issuer 轮换、三镜像分发和两快照历史收敛见证，实际结果为 165/165。

## 边界与裁决

registry、distribution/convergence/store policy、bundle、issuer/mirror/member keyring、store path、`nowMs` 和历史选择仍是调用方离线输入。历史验证只证明所提交有限历史内部的连续性、分发 quorum 和稳定镜像集合；store 只证明本机正常写入路径的原子替换、目录租约和完整前缀规则。它们不证明在线发布、透明日志、可信时钟、硬件托管、全球撤销、跨调用/跨主机持久冲突处置、整文件替换防护、跨设备恢复或历史之后的代码/配置/账本尾部。store 不创建租约、RCL grant、RNCS world commit 或高影响副作用。

九个 K400 门仍为 **NOT_ADJUDICATED**；本轮无 RCL Core 新原语、无 K400 晋升。性能数字只覆盖本机 adapter/crypto 与既有 warm transaction，不代表 registry/mirror/store/transparency SLA。只推候选，不合并、部署或运行 GitHub Actions。

下一最短真实缺口是生产 authority Owner 的在线发布/撤销、可信时间、丢失恢复、透明审计、两台真实设备加密承载和跨主机持久收敛，见 `docs/NEXT_GAP.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。
