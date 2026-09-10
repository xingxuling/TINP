# 当前状态

当前工程轮次：TINP v0.1.0-alpha.2，Windows 本机持久恢复候选。

发行事实以 `evidence/0.1.0-alpha.2/LOCAL_VERIFICATION.json` 的实际退出码、源码哈希和进程见证为准。v0.1.0-alpha.1 的原始审计和证据保留不变。

本轮增加当前用户 DPAPI 存储、协调器和节点独立写锁、签名账本 checkpoint、持久撤销与回执缓存、真实 RCL 恢复准入。恢复不续租、不扩大权限；已执行但未记账的请求只查询原回执，不重新执行；没有回执的未决请求保持拒绝服务状态等待处置。

RCL 拥有恢复不变量；Windows/Python 是加密及锁 Provider，Node 负责恢复装配。OPP 契约、RNCS/RFE 世界事实与提交归原 Owner。无 RCL Core 修改或 K400 晋升。

运行边界：Windows 当前用户、同机 UDP/TCP 回环。无整目录防回滚外部锚点、跨设备密钥恢复或公网部署。候选分支 codex/tinp-recovery-v02；远端推送状态见本轮交付回执。未运行 GitHub Actions。
