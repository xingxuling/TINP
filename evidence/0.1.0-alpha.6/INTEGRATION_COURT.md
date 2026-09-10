# TINP alpha.6 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 147/147 测试，零失败、零跳过，源码绑定 167 个运行/适配/测试文件。普通三节点、持久恢复、未决维护、外部操作员签章、外部恢复锚点和 authority registry 轮换分别有本机运行证据。命令、时间、PID、签名账本、registry roots 与源哈希见 `LOCAL_VERIFICATION.json`；本报告不扩大证据范围。

## 现实审计与 Owner

从已核对的 alpha.5 / `a86623e93b18f783f402b12e9f93b198ff32ea6e` 继续，候选分支为 `codex/tinp-registry-v06`，候选实现提交为 `65b2784750d97980caae974e219e164fd51b81b5`。本轮先复用 `identity.mjs`、AAF adapter、RCL recovery profile 和 alpha.5 recovery-anchor，再新增一层严格 authority registry provider。没有把本地 keyring、测试 issuer 或完整 RNCS world commit 伪装成生产 authority。

TINP host 只验证 registry policy、签名快照和成员公钥映射；独立 issuer child 持有签名私钥并只返回签名结果。registry 不写入成员/issuer 私钥或 coordinator checkpoint。AAF 仍拥有 operator approval 格式，RCL 仍拥有 recovery 与 pending-retirement 准入，RNCS/RFE 世界事实与提交权保持原 Owner。

## 实际闭环

`src/authority-registry.mjs` 固定 `twni.authority-registry-policy.v1` 与 `twni.authority-registry.v1`。seq1 必须从 Genesis 开始；后续快照必须带立即前一根和递增序号。已有成员只能保持或 active→revoked；新 key 必须指向上一快照的 active predecessor、递增 keyEpoch、使用不同 SPKI 指纹、保留 authorityId 和角色子集；revoked 成员不能复活，同一 authority 不能同时有两个 active key。快照 TTL、issued/expires、notBefore 和 revokedAt 均有边界。

`tests/authority-registry-signer.mjs` 是独立测试 issuer。`authority-registry-demo.mjs` 实际证明 operator 与 recovery-witness 的 seq1→seq2 轮换、旧 key 标为 revoked、活动 key 导出和私钥不持久化。`scripts/authority-registry.mjs` 验证外部文件并按角色导出 caller-supplied keyring；`scripts/recovery-anchor.mjs` 的 registry 参数是 opt-in bridge，验证只作用于本次调用。CLI、accessor/inherited 结构、伪造签名/root、回滚、issuer 撤销/替换、角色升级、缺失/错指纹/已撤销成员 key 均有负例。

`npm run verify` 冻结源文件哈希并以顺序入口运行全套测试：147/147 通过；随后 UDP/TCP 三进程事务、持久恢复、pending 维护、外部锚点整目录回放和 registry 独立 issuer 见证均完成。实际见证文件与 SHA-256 在同目录 `LOCAL_VERIFICATION.json`。

## 边界与裁决

registry、issuer keyring、member keyring、`nowMs` 和 snapshot 选择仍是调用方离线输入。签名证明 issuer key 的控制，不证明人类身份、在线发布、透明日志、可信时钟、硬件托管、全球撤销、冲突处置、跨设备恢复或快照后的代码/配置/账本尾部。registry 只负责 key lifecycle 观测和映射，不创建租约、RCL grant、RNCS world commit 或高影响副作用。

九个 K400 门仍为 **NOT_ADJUDICATED**；本轮无 RCL Core 新原语、无 K400 晋升。性能数字只覆盖本机 adapter/crypto 与既有 warm transaction，不代表 registry SLA。只推候选，不合并、部署或运行 GitHub Actions。

下一最短真实缺口是生产 authority Owner 的在线发布/撤销、可信时间、丢失恢复、透明审计、两台真实设备加密承载和跨主机收敛，见 `docs/NEXT_GAP.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。
