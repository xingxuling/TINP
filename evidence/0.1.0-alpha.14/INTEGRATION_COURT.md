# TINP alpha.14 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 177/177，零失败、零跳过，源码清单 198 个文件。alpha.14 在既有 authority registry、distribution、convergence、store、external witness、跨进程 replay、TCP/TLS DATA transfer 之上，加入可恢复的 TLS DATA 分块传输见证。

## alpha.14 变化

本轮没有建立新的 authority publisher、共识器或 RCL 原语。`src/authority-registry-resumable-transfer.mjs` 复用既有 store 状态根和 TINP canonical hash，把公开 store JSON 分成有界 DATA chunks。接收端用原子替换写入 `twni.authority-registry-resumable-transfer-journal.v1`，游标绑定 transfer id、两端节点、state root、payload SHA-256、chunk 数和顺序。

真实 TLS 1.3 loopback worker 在接收第 7/14 个 chunk 后被终止；重启后从持久游标继续。重复 chunk 返回 `unchanged`，同索引不同数据返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT`，同 transfer id 换 state root 返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT`。完整 payload 通过既有 convergence-store append 验证并提交；再次重启后 journal 仍为 `committed`，重放不重复写入。

alpha.14 场景记录 TLS 1.3、`TLS_AES_256_GCM_SHA384`、独立进程/目录、分块计数、重启游标、幂等重放、冲突拒绝、最终 state root 和私钥边界。临时证书私钥只存在 fixture 目录与进程内存，运行结束删除。

## Owner 与边界

TINP 仍只验证调用方提供的 registry、distribution、convergence、store、witness、transfer policy 与 TLS credential 输入。RCL 继续拥有 recovery/transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，外部 authority/deployment Owner 继续拥有生产证书生命周期、在线发布/撤销、可信时间、透明日志、硬件托管、真实设备注册、丢失密钥恢复和跨设备冲突处置。

这是一台 Windows 主机上的 TLS/socket/process/filesystem 压力证据。原子 journal 和接收端重启扩大了本机可恢复传输证据，但不等于两台物理设备、生产证书托管、透明日志、可信时间或持久分布式共识。九个 K400 门仍为 **NOT_ADJUDICATED**；生产、公网和 GitHub Actions 均未运行。

## Evidence hashes

- Tests TAP SHA-256: `d8897dd4b78509fc9f70621320b1ccc587d8f063bd8e0a48719ed05da797fb72`
- LOCAL_VERIFICATION SHA-256: `6a8935613e244bcbf137b6d93482edd5e70d95625b3c2d7c99ac43680690f927`
- Evidence ledger SHA-256: `d3699edc97b6b2a3d7d6de41a955b004a1d12031d41eae5ba7be85ae8285047b`
- Source tree root: `44e8bb7595ba8f17762a25b3c2271fdc9a173c9c79678821d2f0efc57c31dcae`
- Source files: `198`
- Resumable transfer scenario: `evidence/0.1.0-alpha.14/authority-registry-resumable-transfer.json`
- Evidence ledger: `evidence/0.1.0-alpha.14/EVIDENCE_LEDGER.json`
