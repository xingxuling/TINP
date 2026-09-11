# TINP alpha.16 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 189/189，零失败、零跳过，源码清单 201 个文件。alpha.16 在既有本机 authority registry、历史收敛、TCP/TLS DATA 与可恢复传输证据之上，强化只读 OPP HTTP 适配器的 Node 代理边界、投影对象语义和 rooted receipt 一致性。

## alpha.16 变化

本轮仍没有建立新的 authority publisher、OPP CHP/RCP 实现或 RCL 原语。`src/opp-http-readonly.mjs` 现在拒绝 `NODE_USE_ENV_PROXY`、`NODE_OPTIONS=--use-env-proxy` 以及 `execArgv` 中的 `--use-env-proxy` 开关；投影可安全保留字面量 `__proto__` 数据键；receipt validator 绑定有界 responseBytes、JSON content type、PASS/FAIL response roots 与错误状态。确定性见证覆盖本机 PASS、ambient proxy 与 Node proxy-switch 拒绝；动态全局 dispatcher 仍不可观测。

## Owner 与边界

TINP 仍只验证调用方提供的 transport policy、registry、store、witness、transfer 与 keyring 输入。RCL 继续拥有 recovery/transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，OPP 继续拥有 CHP/RCP，外部 authority/deployment Owner 继续拥有生产证书、在线发布/撤销、可信时间、透明日志、真实设备注册、生产凭据和跨设备冲突处置。

这是一台 Windows 主机上的本机 TLS/socket/process/filesystem 与确定性 HTTP policy/receipt 压力证据。单次 GitHub REST 观察独立保存，不证明 OPP consumer acceptance、公网可用性或 authority。九个 K400 门仍为 **NOT_ADJUDICATED**；生产、公网部署和 GitHub Actions 均未运行。

## Evidence hashes

- Tests TAP SHA-256: `d71132efdc03547e9815108b8b5d3821144e4ea6e5609f4a9671fbdd47b72b20`
- LOCAL_VERIFICATION SHA-256: `19173d105beae134df78a62e17eb40e66aeab0b00d2efcad586623db2626f60e`
- Evidence ledger SHA-256: `3c68ffac3d25613aacc8addecb5cb4c66645842a8dae79571b34bb36321f0527`
- Source tree root: `90e9862883f0f6f0de16599e8f832d112dd8c78bfa36a06bf9f65cd26cfe3bce`
- Source files: `201`
- Deterministic OPP scenario: `evidence/0.1.0-alpha.16/opp-http-readonly.json`
- Evidence ledger: `evidence/0.1.0-alpha.16/EVIDENCE_LEDGER.json`
