# Guarded MCP Tool Gateway v0.1

这一层把前一轮的 **OPP Action Contract → TINP → RCL** 真正放到 MCP Provider 调用前。

```text
Code Agent / MCP Client
        ↓
GuardedMcpToolGateway
        ↓
verify OPP MCP Action Binding
        ↓
TINP admission
        ↓
RCL gate
   DENY ─────→ Provider calls = 0
        ↓ ALLOW
upstream MCP callTool exactly once
        ↓
provider security observation
        ↓
declared vs observed verification
        ↓
VERIFIED / QUARANTINED / PROVIDER_ERROR
```

## 这轮解决什么

- Prompt injection 把 `workspace.read` 偷换成 `shell.exec`：binding toolName 不一致，Provider 不会收到调用。
- Agent 没有对应 Authority scope：RCL 前置拒绝，`providerCalls=0`。
- Provider 调用后报告了未声明 `network.egress`：结果进入 `QUARANTINED`，不能当 VERIFIED。
- Provider 超时或报错：只调用一次，不自动重试高风险动作。
- Provider 没有提供 security observation：不能被当作 VERIFIED。

## 重要边界

当前 gateway 能保证的是**经过该 gateway 的调用**先过 OPP/TINP/RCL。

它还不是操作系统级 reference monitor（引用监控器）。如果宿主同时把原始 MCP client/provider handle 暴露给 Agent，Agent 仍可能绕开 gateway。因此产品化时必须做到：

1. Agent 只拿到 gateway；
2. 原始 MCP transport / shell / fs / network provider 不进入 Agent capability surface；
3. 高风险本地执行进一步落到 sandbox / process broker；
4. observation 最终要由独立执行边界产生，而不是只相信 Provider 自报。

这也是从“可执行安全 Profile”继续走向“不可绕过执行入口”的下一层。
