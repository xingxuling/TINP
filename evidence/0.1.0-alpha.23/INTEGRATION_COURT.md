# TINP alpha.23 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `204/204`，零失败、零跳过，源文件清单 207 个文件。

alpha.23 固定 live consumer run result 的 exact top-level shape：`format`、`status`、`error`、`plan`、`negotiation`、`consumerContract`、`observation`、`acceptance`、`boundary`、`diagnostic` 必须全部存在且为可枚举数据字段。成功路径使用 `diagnostic:null`，协商失败保持 bounded diagnostic；CLI 写盘前执行结果 validator。新增顶层字段篡改负例通过。

证据：

- `evidence/0.1.0-alpha.23/LOCAL_VERIFICATION.json`
- `evidence/0.1.0-alpha.23/opp-http-readonly.json`
- `deliverables/tinp-alpha23-verify-20260912.log`

裁决保持 `NOT_DEPLOYED`。exact-shape 校验与本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。

独立外部观察：vidence/OPP_HTTP_CONSUMER_LIVE_GITHUB_2026-09-12.json 记录一次公开 GitHub REST 请求，HTTP 200、live run PASS、一次网络请求、authorityGranted=false。它证明该 TINP CLI 在本次公开 endpoint 上完成了实际观测，不证明 OPP 第三方 consumer、生产发布、凭据或长期公网可用性。
