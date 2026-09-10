# TINP alpha.12 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 172/172 测试，零失败、零跳过，源码绑定 191 个运行、适配、测试与协议登记文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换、多镜像分发、有限历史收敛、本机历史 store、外部收敛见证、跨进程 public-history replay 与 TINP DATA loopback state transfer 分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution roots、history root、store/witness/replay/transfer witness 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## alpha.12 变化

本轮没有建立新的 authority publisher、共识器或 RCL 原语，而是复用既有 `src/transport.mjs` 的 `LocalTransport`、TINP `vendor/tinp/src/protocol.mjs` 的 `DATA` framing，以及 `authority-registry-convergence-store.mjs` 的 append/replay 验证。`authority-registry-loopback-transfer-demo.mjs` 启动两个独立 Node 子进程，各自绑定独立 TCP loopback endpoint 与单独目录；节点 A 写入 seq1→seq2 公开历史后，经 peer public-key admission 的 TINP DATA 帧把状态交给节点 B。B 导入、复验、幂等 replay 并扩展到 seq3，再反向同步到 A。

场景记录 3 个发送 DATA 帧、正向与反向传输、接收端无无效帧，并在同长度签名分叉、threshold-valid 但镜像集合漂移、从 seq2 跳到 seq4 和篡改 `historyRoot` 的传输上保持拒绝。既有 store/convergence 校验返回 `AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH`、`AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT`、`AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP`；传输载荷边界返回 `AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID`。拒绝后原 history root 与 durable bytes 保持不变，私钥没有进入 transfer payload 或 worker。

## Owner 与边界

TINP 仍只验证调用方提供的 registry、distribution、convergence、store、witness、replay 与 transfer 输入。RCL 继续拥有 recovery 与 transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，外部 authority Owner 继续拥有生产身份、在线发布/撤销、可信时间、透明日志、密钥托管、跨设备恢复和冲突处置。loopback transfer 是本机 TCP socket/process/filesystem stress evidence，不是两台物理设备、TLS 加密跨主机传输或生产分布式共识。

没有公网、真实异机部署、生产密钥、在线撤销、硬件托管或 GitHub Actions。`K057/K110/K117/K250/K257` 仍为候选压力单元，九个 K400 门均为 **NOT_ADJUDICATED**，不能由本机 socket、测试数量或帧计数补偿。

## Evidence hashes

- Tests TAP SHA-256: `de67ed6d44850e16c834468acb1d807dffbf7b7fc4970e3c6a1654db01187497`
- LOCAL_VERIFICATION SHA-256: `36f16f315914686e1a3f050fa97a4387868871f3e58f7e10b61e254c8eac2bfb`
- Source tree root: `dbca642a2f07aaa644bfdba87f03ac468a71e8e8c7d13ac61709bd826a7164e7`
- Source files: `191`
- Loopback scenario: `evidence/0.1.0-alpha.12/authority-registry-loopback-transfer.json`
- Evidence ledger: `evidence/0.1.0-alpha.12/EVIDENCE_LEDGER.json`
