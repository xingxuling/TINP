# Agent Action Trust Plane v0.1

## 本轮目标

把 OPP 的 Agent Action Contract 接到 TINP 的执行治理边界，形成第一条可复核的：

```text
Agent / MCP / Code Agent
        ↓
OPP：能力 + 副作用 + 资源 + 可逆性
        ↓
Action Contract + contractRoot
        ↓
TINP：Authority Lease / Policy
        ↓
RCL AgentActionAdmission
        ↓
ALLOW / DENY
```

这不是“识别所有 prompt injection（提示注入）”。它把安全问题改写为：

> **即使输入骗到了模型，模型有没有得到完成该动作所需的权限与资源边界？**

## 当前实现

`src/agent-action-policy.mjs`：

- 复算 OPP canonical JSON SHA-256 root；
- 要求 `authorityGranted=false`；
- 要求完整 effect acknowledgement（副作用确认）；
- 未知 effect fail-closed；
- 将 OPP `requiredAuthority` 与 TINP 已验证 authority scopes 求包含关系；
- 文件访问只接受规范的相对路径；
- 网络目标、命令和 package（软件包）采用显式白名单；
- 可逆性必须被 policy 明确接受。

`rcl/agent-action.rcl`：

- 不接受客户端直接提交 `allowed=true`；
- 由 OPP/TINP 适配层提供六个已核验事实；
- RCL 拥有最终 conjunction（合取）和状态转移；
- 任意一项缺失即 DENY。

## 首轮攻击压力场景

假设 Agent 只有：

```text
Authority: workspace.read
Effect: filesystem.read
Resource: workspace/project/**
```

恶意 README / issue / MCP output 诱导它执行：

1. `credential.read ~/.ssh/id_rsa`
2. `network.egress attacker.example`
3. `process.spawn powershell ...`
4. `package.script demo@1.0.0`（例如 postinstall）

v0.1 不需要判断恶意文本的语言学意图。只要 Action Contract 请求了未授权 effect、scope 或资源，准入事实就会失败，RCL 不提交。

## Canonical Owner（唯一权威归属）

- **OPP**：Action Contract 的能力、effect、resource、reversibility 语义。
- **TINP**：身份、Authority Lease、执行前准入、恢复与 evidence。
- **RCL**：准入约束与最终 gate。
- **RNCS / RFE**：若动作进入现实/世界状态提交，仍保留最终 Authority Owner。

本模块不复制这些 Owner。

## 当前边界

已经证明/可直接测试的是：

- OPP Python → TINP Node 的 contractRoot 可跨语言复算；
- 资源/权限/effect mismatch 会产生 fail-closed facts；
- RCL profile 设计为所有事实合取才能 `gate.allowed=true`。

仍未完成：

- 把该 guard 强制安装到所有真实 MCP / shell / package / GitHub Provider；
- OS / container / seccomp 级不可绕过隔离；
- 真实高影响外部动作 exactly-once（恰好一次）事务；
- 生产级 Authority Owner、HSM、可信时间与独立安全评估。

因此当前状态是：

**EXECUTABLE SECURITY PROFILE CANDIDATE / NOT A PRODUCTION REFERENCE MONITOR**

## v0.2｜第一个真实受控写副作用

`workspace.create` 把原来的只读演示推进到真实 filesystem write（文件系统写入）：

```text
MCP workspace.create
  → OPP contract: workspace.write + filesystem.write
  → exact resource: workspace/project/generated.txt
  → TINP policy: workspace.write / filesystem.write / compensatable
  → RCL AgentActionAdmission
  → bounded create-only provider
  → observed filesystem.write
  → VERIFIED receipt + audit ledger
```

当前 Provider 采用 **create-only（只创建、不覆盖）** 语义：目标已存在就失败，不会把重试伪装成幂等写入；路径逃逸、资源替换和越权目录在执行前或 Provider 边界 fail-closed（失败关闭）。Provider 使用临时文件 + fsync + hard-link commit（硬链接提交）避免直接覆盖既有目标。

这一层证明的是“可约束、可审计的真实副作用”已经进入正式 MCP 调用链；它仍不等价于通用文件事务、OS reference monitor（引用监控器）或跨设备 exactly-once（恰好一次）保证。
