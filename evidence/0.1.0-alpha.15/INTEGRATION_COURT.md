# TINP alpha.15 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 186/186，零失败、零跳过，源码清单 201 个文件。alpha.15 在既有 authority registry、distribution、convergence、store、external witness、跨进程 replay、TCP/TLS DATA transfer 和可恢复传输之上，加入策略绑定的只读 OPP HTTP 观察适配器。

## alpha.15 变化

本轮没有建立新的 authority publisher、共识器、OPP CHP/RCP 实现或 RCL 原语。`src/opp-http-readonly.mjs` 只引用固定 OPP source commit，要求 HTTPS/GET、精确 host/path allowlist、一次请求、无 ambient proxy/credentials/redirect、有界 JSON 和显式 response projection，并为 request、wire body、projected response 和 receipt 绑定 SHA-256 根。

本机确定性见证 `evidence/0.1.0-alpha.15/opp-http-readonly.json` 覆盖 PASS、投影排除、ambient proxy 拒绝、恶意字段/编码路径/响应元数据/大小/状态/媒体类型边界；全量测试为 186/186。另有一次独立公开 GitHub REST 观察，见 `evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json`，返回 HTTP 200 与 `{'default_branch': 'main', 'full_name': 'xingxuling/OPP', 'private': False}`；它是 provider 观察，不是 OPP consumer acceptance。

## Owner 与边界

TINP 仍只验证调用方提供的 registry、distribution、convergence、store、witness、transfer policy、TLS credential 和 OPP HTTP policy 输入。RCL 继续拥有 recovery/transaction admission，AAF 继续拥有 approval receipt，RNCS/RFE 继续拥有 world facts 与 commit，OPP 继续拥有 CHP/RCP，外部 authority/deployment Owner 继续拥有生产证书生命周期、在线发布/撤销、可信时间、透明日志、硬件托管、真实设备注册、丢失密钥恢复和跨设备冲突处置。

这是一台 Windows 主机上的本机 TLS/socket/process/filesystem 与确定性 HTTP policy/receipt 压力证据。公网 GitHub 观察只证明该次请求的 provider 结果。九个 K400 门仍为 **NOT_ADJUDICATED**；生产、公网部署和 GitHub Actions 均未运行。

## Evidence hashes

- Tests TAP SHA-256: `b8460a50a5922099f869f346ae4446a46b5149d444c0e7df6cc84ae4156203fb`
- LOCAL_VERIFICATION SHA-256: `f12b2cfa39c11297eec3d62f01cb328af5fb2398d3db3566dcc0a0c15fa775c7`
- Evidence ledger SHA-256: `26a98f06ff03f49f9f0d33dbee0075137dae4b25fade23bd60c82f80a8df29e2`
- Source tree root: `4cb785ec6fae1b97a05f6669572d1a288b58993a6ed39e6f0f2fb6136102264b`
- Source files: `201`
- Deterministic OPP scenario: `evidence/0.1.0-alpha.15/opp-http-readonly.json`
- Separate live OPP observation: `evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json`
- Evidence ledger: `evidence/0.1.0-alpha.15/EVIDENCE_LEDGER.json`
