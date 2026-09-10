# 当前状态

TINP v0.1.0-alpha.3：Windows 本机未决请求维护闭环候选。

从远端已核对的 06d5f5de88a6e061e3c7a7a5ddbb2108d437fbdf 继续，独立候选分支 codex/tinp-pending-v03。旧版本规范、donor、审计和 evidence 保持原样。本轮实际验收以 evidence/0.1.0-alpha.3/LOCAL_VERIFICATION.json 的命令、退出码、源码哈希及进程证据为准。

新增只读脱敏状态查询、禁止执行的维护模式、原回执查询、用户明确确认后停用整个原租约并关闭未决记录。关闭前必须得到 A/B/C 的签名持久撤销确认，再经实际 RCL 准入，先签名账本后清 pending。终止结果仍为 unknown，绝不声称从未执行、不重发、不创建新租约。

RCL 拥有退休准入不变量；Windows 当前用户/DPAPI 是本机操作员边界，不是生产独立人类签章或公网授权。Node/Python 负责流程、签名和持久化，OPP/RNCS/RFE 保持原 Owner。无 Core 修改与 K400 晋升。

完整性能及故障证据限本机；无公网、真实异机、独立防回滚锚点或全网撤销收敛。没有 GitHub Actions、默认分支合并或部署。远端与源码包回验见交付回执。
