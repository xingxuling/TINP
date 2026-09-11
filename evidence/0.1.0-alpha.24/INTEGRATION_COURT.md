# TINP alpha.24 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `205/205`，零失败、零跳过，源文件清单 207 个文件。

alpha.24 新增 `opp-http-consumer-live.mjs --verify` 离线复核模式。它只读取 policy、request 和已保存 live result，重验 exact shape、policy/request roots、producer observation、consumer acceptance 与 acceptance root；成功输出 `twni.opp-http-consumer-live-verify.v1`，明确 `networkRequests:0`，篡改结果退出码为 1。它不重新请求 OPP endpoint，也不授予 authority。

独立公开观察仍记录在 `evidence/OPP_HTTP_CONSUMER_LIVE_GITHUB_2026-09-12.json`；离线 verify 只复核该类已保存结果，不把复核当作新网络事实。

裁决保持 `NOT_DEPLOYED`。离线校验与本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。

已对仓库内真实 GitHub live 结果执行 --verify 离线复核：输出 	wni.opp-http-consumer-live-verify.v1、status=PASS、resultStatus=PASS、networkRequests=0、authorityGranted=false，结果文件为 vidence/OPP_HTTP_CONSUMER_LIVE_GITHUB_VERIFY_2026-09-12.json。
