# TINP alpha.7 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 153/153 测试，零失败、零跳过，源码绑定 172 个运行/适配/测试文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换和多镜像分发 quorum 分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution root 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## 现实审计与 Owner

从已核对远端的 alpha.6 / `a4ef94106db3510bbaef68a59468e9e5654d22c0` 继续，候选分支为 `codex/tinp-registry-v06`。本轮复用 `identity.mjs`、authority registry adapter、AAF adapter、RCL recovery profile 和 alpha.5 recovery-anchor，只新增严格 distribution provider、CLI 分支、独立 mirror signer 和回归证据。没有把本地 keyring、测试 issuer/mirror 或完整 RNCS world commit 伪装成生产 authority。

TINP host 只验证 registry policy、签名快照、成员公钥映射和调用时的分发 receipts；独立 issuer/mirror child 持有各自签名私钥并只返回签名结果。registry、bundle 和 keyring 不写入 coordinator checkpoint。AAF 仍拥有 operator approval 格式，RCL 仍拥有 recovery 与 pending-retirement 准入，RNCS/RFE 世界事实与提交权保持原 Owner。

## 实际闭环

`src/authority-registry.mjs` 固定 `twni.authority-registry-policy.v1` 与 `twni.authority-registry.v1`，并约束 seq1→seq2 append-only lifecycle。`src/authority-registry-distribution.mjs` 固定 `twni.authority-registry-distribution-policy.v1`、`twni.authority-registry-distribution-receipt.v1` 与 `twni.authority-registry-distribution.v1`：caller policy 固定 registry policy root、镜像 SPKI 指纹和 threshold；receipt 绑定 registry root/sequence、distribution policy root、镜像指纹和有限时间窗；验证要求 distinct mirror quorum，任何有效但不同 root/sequence 的签名都会以 `AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED` fail closed。

`tests/authority-registry-distribution-signer.mjs` 是独立测试 mirror。`authority-registry-distribution-demo.mjs` 实际启动独立 issuer 与三个 mirror，验证三份 receipt 的 quorum、有效分叉拒绝和阈值不足拒绝；私钥只在 child 内存中。`scripts/authority-registry.mjs distribution-verify ...` 只读调用方 bundle、policy、issuer/mirror keyring 和本机 `nowMs`。分发单元测试覆盖错误 root/sequence、重复/乱序 receipt、过期、阈值不足、mirror 替换/撤销、accessor/inherited/private key 输入和未知 CLI 参数。

`npm run verify` 冻结源文件哈希并以顺序入口运行全套测试：153/153 通过；随后 UDP/TCP 三进程事务、持久恢复、pending 维护、外部锚点整目录回放、registry 独立 issuer 轮换和三镜像分发见证均完成。实际见证文件与 SHA-256 在同目录 `LOCAL_VERIFICATION.json`。

## 边界与裁决

registry、distribution policy/bundle、issuer/mirror/member keyring、`nowMs` 和 snapshot 选择仍是调用方离线输入。quorum 只证明同一次读取中收到的签名对一个 root 达成一致，不证明在线发布、透明日志、可信时钟、硬件托管、全球撤销、跨调用历史、持久冲突处置、跨设备恢复或快照后的代码/配置/账本尾部。分发验证不创建租约、RCL grant、RNCS world commit 或高影响副作用。

九个 K400 门仍为 **NOT_ADJUDICATED**；本轮无 RCL Core 新原语、无 K400 晋升。性能数字只覆盖本机 adapter/crypto 与既有 warm transaction，不代表 registry/mirror SLA。只推候选，不合并、部署或运行 GitHub Actions。

下一最短真实缺口是生产 authority Owner 的在线发布/撤销、可信时间、丢失恢复、透明审计、两台真实设备加密承载和跨主机持久收敛，见 `docs/NEXT_GAP.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。
