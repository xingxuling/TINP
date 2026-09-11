# TINP alpha.28 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `205/205`，零失败；源文件清单 207 个文件。

alpha.28 将 alpha.27 的 `twni.opp-http-consumer-live-verify.v2` 回执生成器接入完整 `verify`。验证过程对仓库保存的公开 GitHub live consumer 结果执行零网络请求复验，生成 `opp-http-consumer-live-verify.json`，并把 policy/request/acceptance 语义根、输入文件 SHA-256、回执格式和回执 SHA-256 写入正式 witness。

裁决保持 `NOT_DEPLOYED`。该闭环只扩大本机可归档证据，不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
