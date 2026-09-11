# TINP alpha.13 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 174/174 测试，零失败、零跳过，源码绑定 194 个运行、适配、测试与协议登记文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点、authority registry 轮换、多镜像分发、有限历史收敛、本机历史 store、外部收敛见证、跨进程 public-history replay、TCP DATA loopback transfer 与 TLS 1.3 DATA loopback transfer 分别有本机运行证据。命令、时间、PID、签名账本、registry roots、distribution roots、history root、store/witness/replay/transfer witness、TLS 握手信息与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## alpha.13 变化

本轮没有建立新的 authority publisher、共识器或 RCL 原语，而是复用既有 `src/transport.mjs` 的 `LocalTransport`、TINP `vendor/tinp/src/protocol.mjs` 的 `DATA` framing，以及 `authority-registry-convergence-store.mjs` 的 append/replay 验证。`LocalTransport` 增加 caller-supplied TLS 1.3 模式：服务端只接收调用方给出的证书/私钥，客户端以对端证书作为 CA pin 并要求 `tinp-loopback` server name；TINP peer public-key admission 仍验证签名消息身份。

TLS loopback demo 启动两个独立 Node 子进程，各自绑定独立 TLS endpoint 与单独目录。节点 A 写入 seq1→seq2 公开历史后，经 TLS 1.3 上的 TINP DATA 帧把状态交给节点 B；B 导入、复验、幂等 replay 并扩展到 seq3，再反向同步到 A。固定运行协商到 `TLS_AES_256_GCM_SHA384`，记录 12 次握手、3 个发送 DATA 帧、16,706 个发送字节和 0 个无效接收帧。错误 CA 负例在 DATA 帧发送前失败。

场景继续覆盖同长度签名分叉、threshold-valid 但镜像集合漂移、从 seq2 跳到 seq4 和篡改 `historyRoot` 的传输。既有 store/convergence 校验返回 `AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH`、`AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT`、`AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP`；传输载荷边界返回 `AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID`。拒绝后原 history root 与 durable bytes 保持不变，authority 或 TLS 私钥没有进入 transfer payload、store 或源码归档。

## Owner 与边界

TINP 仍只验证调用方提供的 registry、distribution、convergence、store、witness、replay、transfer 与 TLS credential 输入。RCL 继续拥有 recovery 与 transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，外部 authority/deployment Owner 继续拥有生产证书生命周期、生产身份、在线发布/撤销、可信时间、透明日志、硬件托管、跨设备恢复和冲突处置。TLS loopback 是本机加密 socket/process/filesystem stress evidence，不是生产证书托管、两台物理设备注册或生产分布式共识。

没有公网、真实异机部署、生产密钥、在线撤销、硬件托管或 GitHub Actions。`K057/K110/K117/K250/K257` 仍为候选压力单元，九个 K400 门均为 **NOT_ADJUDICATED**，不能由本机 TLS、测试数量或帧计数补偿。

## Evidence hashes

- Tests TAP SHA-256: `9314bbeb6af0dff912cc8b039ea649ee6d50a6c9bcfb6e2821edf5a03a71d13a`
- LOCAL_VERIFICATION SHA-256: `d7a0bca2073106e7beb86262d2be8a2e84a645c171e905c7d366449ebb8f17a3`
- Source tree root: `67137f331eca212d3f41d554858d30e79dff2f10a4dc6c56e4d0e530f40cc9e7`
- Source files: `194`
- TCP loopback scenario: `evidence/0.1.0-alpha.13/authority-registry-loopback-transfer.json`
- TLS loopback scenario: `evidence/0.1.0-alpha.13/authority-registry-tls-loopback-transfer.json`
- Evidence ledger: `evidence/0.1.0-alpha.13/EVIDENCE_LEDGER.json`
