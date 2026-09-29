# Agent Action Trust Plane v0.1

这是一条面向 AI Agent / Code Agent / MCP 工具执行的**有界行动治理链**。目标不是判断 Prompt 是否“恶意”，而是让 Prompt、网页、README、Issue 或模型输出**不能自行变成权限**。

## 当前闭环

    OPP RCP capability
            ↓
    OPP Action Contract
    能力 / 副作用 / 资源 / 输入根
            ↓
    TINP signed Agent Action Lease
    主体 / authority / resource grant / provider / 时间窗
            ↓
    RCL Agent Action Admission
            ↓
      DENY ── 不调用 executor
            ↓ ALLOW
         executor
            ↓
    observed effects check
       ↓        ↓        ↓
      PASS  QUARANTINED  PENDING

核心原则：

> Prompt 是数据，不是 Authority（权限）。

## 四个初始风险面

v0.1 先把 Code Agent 最常见的四种高价值副作用做成显式能力：

- filesystem.write：写文件；
- network.egress：向网络发送数据；
- credential.read：读取密钥、Token、SSH 等凭据；
- process.spawn：启动 npm、shell、编译器或其他进程。

未知 effect 默认 fail closed（失败关闭）。

## OPP 与 TINP 的分工

OPP Action Contract 只声明：

- 谁提出动作；
- 哪个 capability；
- 需要哪些 authority；
- 这次动作具体会碰哪些 resource；
- side effect；
- reversibility；
- actionInputRoot；
- contractRoot。

其中 authorityGranted 永远是 false。

TINP 的 Agent Action Lease 才是权限输入。Lease 由 issuer 使用 Ed25519 签名，绑定：

- subject；
- authority 列表；
- effect + resource 范围；
- Provider；
- 生效 / 过期时间；
- 哪些 effect 必须经过独立 operator approval。

OPP 不替 TINP 发权限，TINP 也不复制 OPP 的语义 owner。

## RCL Commit Gate

最终 ALLOW / DENY 不是由 Agent 传一个 allowed=true 进来。

trusted adapter（可信适配器）先把已经核对过的事实投影给固定 RCL 程序：

- contract 是否有效；
- lease 是否有效；
- subject 是否绑定；
- action input root 是否一致；
- authority 是否包含；
- effect 是否在 lease 内；
- resource 是否在 lease 内；
- provider 是否绑定；
- effect 是否属于已知集合；
- 是否需要 operator approval；
- operator approval 是否真的验证；
- evidence 是否连续；
- lease 是否 revoked（撤销）。

RCL 再决定 gate.allowed。

这样 operator approval 的逻辑本身也留在 RCL，而不是藏回 JS 条件判断。

## 四种结果

### DENIED

在执行前拒绝，executorCalled=false。

典型原因：

- Prompt 想把 file write 扩成 credential read；
- 请求了未授权网络域；
- Provider 不在 lease；
- action input 在授权后被替换；
- lease 已失效 / 被篡改；
- 高风险动作缺 operator approval。

### PASS

执行完成，观测到的 effect 同时处于：

1. OPP Action Contract 声明范围；
2. TINP signed lease 范围。

结果才标为 accepted。

### QUARANTINED

执行已经返回，但 observed effects（观测副作用）超出合同 / lease，或 effect evidence 格式本身异常。

结果不被接受。

**QUARANTINED 不等于已把现实副作用回滚。**

### PENDING

executor 抛错或结果状态不确定。

TINP 不自动重试，也不把“没收到成功结果”解释成“肯定没有执行”。

## 当前资源范围规则

Grant 使用 kind + resourcePrefix。

为了避免简单字符串前缀扩大权限：

- 以 / 结尾的 scope 才允许前缀匹配；
- 不以 / 结尾时要求 exact match（精确匹配）。

因此 workspace:/project 不会错误覆盖 workspace:/project_evil。

## 已有针对性验证

当前垂直切片覆盖：

- prompt injection 文本不能扩权；
- credential.read 未授权拒绝；
- process.spawn 未授权拒绝；
- 未授权 network.egress 拒绝；
- operator approval gate；
- action input root 替换拒绝；
- Provider 替换拒绝；
- signed lease 篡改拒绝；
- resource lexical-prefix（字符串前缀）越界拒绝；
- 重算 hash 后篡改 risk / reversibility 仍拒绝；
- runtime 出现未声明 effect 时 quarantine；
- executor 异常进入 pending，隐式重试次数为 0；
- Python OPP 生成的 contract 与 Node/TINP 的 canonical root 完全一致。

针对性测试入口：

    node --test tests/agent-action-gateway.test.mjs

## 当前边界

这仍是 Candidate（候选），不是生产安全认证。

特别是：

1. observedEffects 当前由 executor / adapter 回报，不是独立 OS 级 syscall observer；
2. 尚未提供 namespace / seccomp / container / VM 级强隔离；
3. 后验发现越权副作用不能倒退时间；
4. Production Authority Owner、HSM / 密钥托管、可信时间、真实双机仍未闭环；
5. 还没有证明真实 MCP server / Code Agent 在强对抗 Prompt Injection 下无法绕过所有入口；
6. TINP 仓库现有 vendor 许可仍需要独立完成商业发行裁决。

所以正确的下一阶段不是宣传“已解决 AI 安全”，而是把这条 gate 插到一个真实 Code Agent / MCP Provider 前面，证明高风险动作必须经过同一条不可绕过入口。

## 产品投影

协议内核可以保持 OPP / TINP 分离，产品层可以投影成：

**TaoWind Agent Security Gateway（道风智能体安全网关）**

企业不需要重写 CRM、GitHub、数据库或 MCP 服务，只需要让高风险行动经过：

    Agent
      ↓
    MCP / API / A2A
      ↓
    OPP Action Contract
      ↓
    TINP + RCL Gate
      ↓
    Existing Provider
      ↓
    Receipt / Evidence
