# TINP alpha.25 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `205/205`，零失败、零跳过，源文件清单 207 个文件。

alpha.25 将仓库内保存的公开 GitHub live consumer 结果接入 `scripts/verify.mjs`。verify 使用固定 examples policy/request，在零网络请求条件下调用 `validateOppHttpConsumerLiveResult`，并把 `externalLiveValidation` 写入 witness；本轮结果为 `PASS`、`resultStatus=PASS`、`httpStatus=200`、`networkRequests=0`，结果 SHA 与版本化文件绑定。

裁决保持 `NOT_DEPLOYED`。自动 witness 复核不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
