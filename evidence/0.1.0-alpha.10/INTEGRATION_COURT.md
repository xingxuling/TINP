# TINP alpha.10 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 170/170 测试，零失败、零跳过，源码绑定 185 个运行/适配/测试文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换、多镜像分发、有限历史收敛、本机历史 store 和外部收敛见证分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution roots、history root、store/witness witness 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## 现实审计与 Owner

从已核对远端的 alpha.9 / `705b284dec59d5807e6ba05effddd22013d9686b` 继续，候选分支为 `codex/tinp-registry-v06`。本轮实现提交为 `13925f1`，文档与协议登记提交为 `fd72955`。本轮复用 `identity.mjs`、authority registry adapter、distribution adapter、convergence adapter、convergence-store adapter、AAF adapter、RCL recovery profile、recovery-anchor 和既有目录 writer lease，只新增严格 convergence-witness provider、CLI 分支、独立 signer child、demo、测试与证据。没有把本地 keyring、测试 issuer/mirror/witness、文件系统租约或完整 RNCS world commit 伪装成生产 authority。

TINP host 只验证 registry policy、签名快照、成员公钥映射、每段分发 receipts、调用时的历史连续性、本机 store 的公开状态前缀和外部 witness 对精确 store 状态的签名绑定；独立 issuer/mirror/witness child 持有各自签名私钥并只返回签名结果。registry、distribution/convergence bundle、store、witness 和 keyring 不写入 coordinator checkpoint。AAF 仍拥有 operator approval 格式，RCL 仍拥有 recovery 与 pending-retirement 准入，RNCS/RFE 世界事实与提交权保持原 Owner。

## 实际闭环

`src/authority-registry.mjs` 固定 `twni.authority-registry-policy.v1` 与 `twni.authority-registry.v1`，并约束 seq1→seq2 append-only lifecycle。`src/authority-registry-distribution.mjs` 固定 distribution policy/receipt/bundle：caller policy 固定 registry policy root、镜像 SPKI 指纹和 threshold；receipt 绑定 registry root/sequence、distribution policy root、镜像指纹和有限时间窗；验证要求 distinct mirror quorum，任何有效但不同 root/sequence 的签名都会以 `AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED` fail closed。

`src/authority-registry-convergence.mjs` 固定 `twni.authority-registry-convergence.v1`：调用方提交多个 distribution bundle，`historyRoot` 绑定完整有序列表；验证要求从 Genesis/序号 1 开始连续，每个 `previousRegistryRoot` 精确指向上一快照，每段 quorum 达标且 accepted mirror 集合稳定，并以 `AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP`、`...FORK_DETECTED`、`...DUPLICATE_SNAPSHOT` 或 `...MIRROR_SET_DRIFT` 拒绝对应历史。

`src/authority-registry-convergence-store.mjs` 固定 `twni.authority-registry-convergence-store.v1`：store 只保存公开 convergence bundles、`historyRoot`、policy/registry 标识和序号边界。显式 append 先复验候选与既有历史，在现有目录 writer lease 内使用临时文件、fsync 与原子替换；相同完整历史返回 `unchanged`，只有完全包含既有 child root 前缀的更长历史能 `extended`，回退、旧前缀改写、错误 policy、篡改 root、malformed/accessor/private material 在写入前拒绝。读取验证允许旧 receipts 在有限历史中老化，但要求最新快照按调用方 `nowMs` 保持 current。

`src/authority-registry-convergence-witness.mjs` 固定 `twni.authority-registry-convergence-witness-policy.v1`、`twni.authority-registry-convergence-witness.v1` 和 verification format。见证 body 绑定 witness policy root、外部 witness sequence/previous root、distribution/registry 标识、`historyRoot`、store 序号边界、完整 `storeStateRoot` 和 caller-supplied `issuedAtMs`。验证先检查 witness signer 的 pinned SPKI fingerprint、签名和 retained predecessor signature，再精确复验 store 状态及底层 registry/distribution/convergence 输入；同序号不同见证根、跳号/回退、错误 previous root、结构有效但不同的 store 和未来时间均拒绝。request CLI 只导出待签 body，verify CLI 只读调用方文件。

`authority-registry-convergence-witness-demo.mjs` 实际启动独立 issuer、三个 mirror 和独立 witness signer，生成两个连续快照和每段 quorum，原子写入本机 store，签署并验证 seq1/seq2 witness；结构上有效的 store 替换、同序号 witness 替换和 witness rollback 分别被 `AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_STORE_MISMATCH`、`AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_REPLACED` 和 `AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK` 拒绝。alpha.10 新增 5 个 witness focused tests（4 个 API/边界测试与 1 个 CLI 测试）；完整验证结果为 170/170，源码清单 185 个文件，`sourceTreeRoot` 为 `aedf02aa96429f3bbe563f16439ceddd42692c9bff471ecc195355ad1460d1d8`，tests TAP SHA-256 为 `4890ecb8d079ac49700d64a173188822dff411798251f2dd51ce71d06fdd2761`。

## 边界与裁决

registry、distribution/convergence/store/witness policy、bundle、issuer/mirror/member/witness keyring、store/witness path、历史选择和 `nowMs` 仍是调用方离线输入。历史验证只证明所提交有限历史内部的连续性、分发 quorum 和稳定镜像集合；store 只证明本机正常写入路径的原子替换、目录租约和完整前缀规则；external witness 只在上一份见证根被独立保留时绑定并检测精确 store 状态的替换/回退。它们不证明在线发布、透明日志、可信时钟、硬件托管、全球撤销、跨调用/跨主机持久冲突处置、store 与 witness 同时替换时的外部历史、跨设备恢复或历史之后的代码/配置/账本尾部。witness 不创建租约、RCL grant、RNCS world commit 或高影响副作用。

九个 K400 门仍为 **NOT_ADJUDICATED**；本轮无 RCL Core 新原语、无 K400 晋升。性能数字只覆盖本机 adapter/crypto 与既有 warm transaction，不代表 registry/mirror/store/witness/transparency SLA。只推候选，不合并、部署或运行 GitHub Actions。

下一最短真实缺口是生产 authority Owner 的在线发布/撤销、可信时间、丢失恢复、透明审计、两台真实设备加密承载和跨主机持久收敛，见 `docs/NEXT_GAP.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。
