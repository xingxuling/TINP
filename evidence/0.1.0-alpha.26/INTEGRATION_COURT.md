# TINP alpha.26 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `205/205`，零失败、零跳过，源文件清单 207 个文件。

alpha.26 的 live consumer `--verify` 支持 `--out` 独占写入验证回执；输出格式为 `twni.opp-http-consumer-live-verify.v1`，状态 PASS、resultStatus 继承被验证结果、networkRequests 固定为 0。重复写入目标文件会失败闭合。完整 verify 同时自动重验仓库内公开 GitHub live 结果，未发起网络请求。

裁决保持 `NOT_DEPLOYED`。离线回执与本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
