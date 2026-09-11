# TINP alpha.27 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `205/205`，零失败；源文件清单 207 个文件。

alpha.27 的 live consumer `--verify --out` 输出 `twni.opp-http-consumer-live-verify.v2` 回执。回执固定 policy/request/acceptance 语义根，并固定 policy、request、result 三份输入文件的 SHA-256；写出前由 `validateOppHttpConsumerLiveVerification` 重新校验，篡改输入绑定会失败闭合。重复写入目标文件仍被拒绝，离线验证的 networkRequests 固定为 0。

裁决保持 `NOT_DEPLOYED`。这些回执与本机 OPP child adapter 不能证明独立第三方 consumer、真实异机、公网稳定性、生产密钥托管或 K400 晋升。
