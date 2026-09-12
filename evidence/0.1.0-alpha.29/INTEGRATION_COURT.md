# TINP alpha.29 集成法院

本轮候选状态为 `VERIFIED_LOCAL_CANDIDATE`：完整验证 `209/209`，零失败；源文件清单 209 个文件。

alpha.29 对公开 OPP 最新提交 `61cc3828a58a7bffa8b1dbeb8c44ff3a9cb471d1` 做了新鲜源码审计：在 UTF-8 环境下 OPP 自有测试 `41/41` 通过，并实际运行原生 interop fixture。TINP 只验证 OPP 所有的 `taowind.opp.interop-receipt.v0.1` 回执根、producer/consumer 结果根及禁止越权字段，再生成 TINP 自有 acceptance binding。

原生互操作 witness 为 `PASS`，receipt root 为 `77b4cdfaa0f95a9cc75a4c7d08f9d8cc3b94d40f2a9b46b87c51b2b1496f7ff2`，acceptance root 为 `0d51f4f1183294ce50137fa75f9decb4fdf5f387f9ec5846b3bce3ec42bf9bb5`。`authorityGranted=false`、无副作用；没有复制 OPP runtime，也没有把候选 interop 提升为生产互操作或权威。

裁决保持 `NOT_DEPLOYED`。以下仍是外部门槛：真实 Authority Provider（身份、在线发布/撤销、可信时间、HSM、透明日志、设备注册、密钥恢复、跨物理机收敛、生产冲突裁决）、两台或更多独立物理机器部署，以及真正独立的第三方 Consumer / 安全审计。K400 不在本轮自行裁决。
