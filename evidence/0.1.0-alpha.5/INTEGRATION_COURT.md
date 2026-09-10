# TINP alpha.5 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 140/140 测试，零失败、零跳过，源码绑定 160 个文件。普通三节点、持久恢复、未决维护、外部操作员签章和外部恢复锚点分别有 UDP/TCP 本机运行见证。命令、时间、PID、签名账本、锚点序号与源哈希见 `LOCAL_VERIFICATION.json`；本报告不单独扩大证据范围。

## 现实审计与 Owner

从已核对的 alpha.4 / `9e6e8bc7908226c73630876ff2fbdc17534bbbb8` 继续，候选分支为 `codex/tinp-anchor-v05`。本轮先确认 alpha.4 的 DPAPI checkpoint、签名账本、RCL recovery gate、pending 管理与 AAF adapter，再只加一个外部恢复见证适配层。没有把本地密钥、测试 signer 或完整 RNCS world commit 伪装成生产 authority。

TINP 主机拥有本地 checkpoint、账本前缀和恢复决策；`src/recovery-anchor.mjs` 只验证外部 Ed25519 公钥指纹、严格 statement、签名、单调序号、租约绑定及本地已认证账本前缀。独立 signer 进程持有私钥并只返回签名结果。AAF 仍拥有操作员 approval 格式，RCL 仍拥有 recovery 与 pending-retirement 准入，RNCS/RFE 世界事实与提交权保持原 Owner。

## 实际闭环

`request` 从只读 pending 观察导出待签署 body；`pin` 是显式维护模式本地 bootstrap，只保存 signer ID、SPKI DER SHA256 指纹、scope、role、可选 configuration root 和 policy root；`accept` 只导入调用方提供的外部签名并记录 `recovery.anchor-adopted`，不生成租约、不执行 Provider、不写入外部 keyring 或私钥。启动时每次重新提供 keyring，且必须是精确匹配、`revoked:false` 的公钥条目。

独立 signer 与三节点实际运行见证覆盖 UDP/TCP。序号 1 与序号 2 锚定同一主体、连续性、世界和租约；复制序号 1 之前的完整旧目录后，用序号 2 启动会失败 `RECOVERY_ANCHOR_ROLLBACK`，恢复较新的目录则重新打开并保留租约。伪造账本根、替换/撤销 signer、较低序号、重复锚点和缺失前缀均在写入前拒绝。

## 边界与裁决

这只证明 Windows 本机候选的外部单调前缀见证。首次 pin 仍是调用方的信任引导；测试 signer 不是人类身份注册、硬件托管或在线 authority registry。当前 keyring 的撤销字段、最新锚点和 configuration root 没有独立发布、轮换、恢复、可信时间或跨主机收敛。上次显式锚定之后的尾部、代码/配置回滚、恶意见证者、两台真实设备加密承载仍未证明。

九个 K400 门均为 **NOT_ADJUDICATED**；本轮无 RCL Core 新原语、无 K400 晋升。性能样本只覆盖本机已协商的签名事务，不含启动、DPAPI、签署、WAN、吞吐或 SLA。只推候选，不合并、部署或运行 GitHub Actions。

下一最短真实缺口是独立 authority registry/key custody 的发布、撤销、轮换、丢失恢复、可信时间和跨设备收敛，见 `docs/NEXT_GAP.md`。
