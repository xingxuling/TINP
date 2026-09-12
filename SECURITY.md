# Security Policy

TINP 当前状态是 **VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED**。它已经有本机受控环境下的安全与恢复验证，但不应被描述成已经完成生产安全认证的网络。

## 报告安全问题

如果你发现可能影响以下边界的问题，请不要在公开 Issue 中直接发布可利用细节：

- 身份或签名验证绕过；
- 权限租约绕过；
- Operator Approval 绕过；
- Authority Registry 回退或分叉检查绕过；
- Pending 请求被静默重发；
- 回执 / Evidence Ledger 完整性绕过；
- Recovery Anchor 回退检测绕过；
- TLS / transport policy 绕过；
- DPAPI 持久状态泄漏；
- 任何导致权限在恢复后扩大的问题。

如果仓库启用了 GitHub Private Vulnerability Reporting，请优先使用该入口。若没有启用，可以先开一个不包含利用细节的 Issue，请求建立私下沟通渠道。

## 当前安全边界

当前不声称：

- 生产级 HSM / 硬件密钥托管；
- 可信外部时间；
- 公网规模身份与撤销服务；
- 互联网规模共识或状态收敛；
- 第三方安全认证；
- 军用安全认证。

本机 loopback、临时证书、测试签署方和 Windows 当前用户 DPAPI 都只是当前验证环境的一部分，不代表生产部署方案。

详细边界见 [`docs/EXTERNAL_ACCEPTANCE_GATES.md`](docs/EXTERNAL_ACCEPTANCE_GATES.md)、[`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md) 和各版本 `evidence/`。
