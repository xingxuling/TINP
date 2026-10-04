# Guarded MCP Registry v0.1

`GuardedMcpRegistry` 是给 Code Agent / MCP Client 暴露的**受控工具表面**。

它的目的不是再造 MCP Server，而是避免产品集成时出现这种结构：

```text
Agent
 ├─ guarded gateway
 └─ raw MCP provider  ← 这条旁路会让所有安全设计失效
```

现在建议的产品结构是：

```text
Agent
  ↓ tools/list
GuardedMcpRegistry
  ↓
rooted OPP MCP binding
  ↓
GuardedMcpToolGateway
  ↓
TINP + RCL admission
  ↓
private upstream provider callback
```

Registry 只公开：

- MCP tool descriptor；
- security descriptor（安全描述）；
- `callTool()`。

它不会把原始 provider callback 或 gateway 对象返给 Agent。

这仍不是 OS 级不可绕过证明：宿主代码如果自己另外保存并暴露 raw provider，依旧能绕路。因此生产部署还需要 capability surface（能力表面）隔离、sandbox / process broker，以及独立 observation。
