# Bounded Workspace Read Provider v0.1

这是 Agent Action Trust Plane 第一项**真实本地执行 Provider**，不是 mock。

它只提供：

```text
workspace.read
```

并且把真实文件读取限制在一个启动时指定的 `workspaceRoot` 内。

## 防线

Provider 本身再次做 defense-in-depth（纵深防御）：

- 逻辑资源必须位于 `workspace/project/...`
- 拒绝 `..` traversal（目录穿越）
- 使用 `realpath` 检查真实路径
- symlink（符号链接）逃逸到 workspace 外部会拒绝
- 只读取普通文件
- 有 `maxBytes` 上限
- 不提供写文件、网络、Shell、包安装能力
- 执行后返回 `filesystem.read` security observation

它应该放在：

```text
GuardedMcpRegistry
  ↓
GuardedMcpToolGateway
  ↓
OPP/TINP/RCL admission
  ↓
BoundedWorkspaceReadProvider
```

而不是直接暴露给 Agent。

## 已验证

本地真实文件系统测试覆盖：

- 正常 UTF-8 文件读取
- 目录穿越拒绝
- 错误逻辑资源前缀拒绝
- 文件大小上限
- symlink 逃逸拒绝（平台允许创建 symlink 时）
- 通过 Guarded Registry 的真实 Provider demo

Demo：

```bash
npm run agent-action:real-demo
```

期望结果：

- 正常 `workspace/project/readme.md` → `VERIFIED`
- prompt injection 将参数替换为 `.ssh/id_rsa` → `DENIED_INPUT_BINDING`
- 被拒绝时 `providerCalls = 0`

## 边界

这是应用层 Provider 隔离，不是 OS kernel reference monitor（内核级引用监控器）。下一阶段若要保护任意第三方代码执行，需要继续把 Shell / process / network 移入独立 broker + sandbox / container / seccomp（Linux）或对应平台沙箱。
