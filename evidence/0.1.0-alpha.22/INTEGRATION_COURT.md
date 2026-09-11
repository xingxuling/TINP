# TINP alpha.22 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `203/203`，零失败、零跳过，源文件清单 207 个文件。

alpha.22 为 live OPP consumer 增加 `validateOppHttpConsumerLiveResult`。它在 CLI 写盘前重验运行格式、边界、policy/request root、plan、producer observation、consumer acceptance 状态和 acceptance root；协商失败必须保持 `FAIL_CLOSED` 且不产生 contract/observation/acceptance。新增子进程测试在 ambient proxy 配置下确认 CLI 返回退出码 5 并写出可重验失败结果。

证据：

- `evidence/0.1.0-alpha.22/LOCAL_VERIFICATION.json`
- `evidence/0.1.0-alpha.22/opp-http-readonly.json`
- `deliverables/tinp-alpha22-verify-20260912.log`

裁决保持 `NOT_DEPLOYED`。结果 validator 与本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
