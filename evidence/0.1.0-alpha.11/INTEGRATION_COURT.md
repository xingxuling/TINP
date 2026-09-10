# TINP alpha.11 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 171/171 测试，零失败、零跳过，源码绑定 188 个运行/适配/测试文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换、多镜像分发、有限历史收敛、本机历史 store、外部收敛见证和跨进程 public-history replay 分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution roots、history root、store/witness/replay witness 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## alpha.11 变化

本轮没有建立新的 authority publisher、共识器或 RCL 原语，而是复用既有 `authority-registry-convergence-store.mjs` 与 `authority-registry-convergence.mjs`。`authority-registry-cross-host-replay-demo.mjs` 启动两个独立 Node 子进程，各自拥有单独目录；第一个进程写入 seq1→seq2 公开历史，第二个进程通过 IPC 导入序列化公开状态，复验、幂等 replay 并扩展到 seq3。传输对象只含公开 key、签名和 store 状态，私钥不进入 worker。

随后提交同长度的有效签名分叉、threshold-valid 但镜像集合漂移的 seq3 历史，以及从 seq2 跳到 seq4 的历史。既有 store/convergence 校验分别返回 `AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH`、`AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT` 和 `AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP`；拒绝后原 history root 与 durable bytes 保持不变。场景摘要见 `authority-registry-cross-host-replay.json`。

## Owner 与边界

TINP 仍只验证调用方提供的 registry、distribution、convergence、store、witness 与 replay 输入。RCL 继续拥有 recovery 与 transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，外部 authority Owner 继续拥有生产身份、在线发布/撤销、可信时间、透明日志、密钥托管、跨设备恢复和冲突处置。跨进程 replay 只是单机 process/filesystem stress evidence，不是两台物理设备、加密跨主机传输或生产分布式共识。

没有公网、真实异机部署、生产密钥、在线撤销、硬件托管或 GitHub Actions。`K057/K110/K117/K250/K257` 仍为候选压力单元，九个 K400 门均为 **NOT_ADJUDICATED**，不能由本机 replay 或测试数量补偿。

## Evidence hashes

- Tests TAP SHA-256: `a0fba949b2bc242fa5e42d2102884124f6ed70f188916f4360196b1149f4242a`
- Source tree root: `1e485d84c8dce54ca6b68062b5ebfff2a6d37e2121d1cde794157335bd6c1e67`
- Source files: `188`
- Replay scenario: `evidence/0.1.0-alpha.11/authority-registry-cross-host-replay.json`
- Evidence ledger: `evidence/0.1.0-alpha.11/EVIDENCE_LEDGER.json`
