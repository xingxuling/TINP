# TINP alpha.21 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `202/202`，零失败、零跳过，源文件清单 207 个文件。

alpha.21 新增 `runOppHttpConsumerLive` 及 `scripts/opp-http-consumer-live.mjs`。它复用 OPP CHP/RCP accepted 协商，生成 TINP consumer plan/contract，执行一次显式 HTTPS/GET 只读观测，再复用既有 acceptance validator 绑定 producer receipt、projected response root 与 consumer contract。CLI 退出码为 `0`（PASS）或 `5`（FAIL_CLOSED），不授予 authority、不使用凭据、不重试、不跟随重定向。

证据：

- `evidence/0.1.0-alpha.21/LOCAL_VERIFICATION.json`
- `evidence/0.1.0-alpha.21/opp-http-readonly.json`
- `deliverables/tinp-alpha21-verify-20260912.log`

裁决保持 `NOT_DEPLOYED`。deterministic fetch 和本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
