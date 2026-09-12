# TINP 业务 Demo：企业内部 Agent 请求遇到故障时怎么办

这个 Demo 不尝试模拟一整套 CRM。它只把 TINP 最核心的价值做成三步：**正常执行、Provider 切换、链路切换。**

场景可以理解成一个客服 Agent 在企业私网里发起只读请求：

```text
客服 Agent
   ↓
节点 A
   ↓
节点 B
   ↓
Provider C
```

当前仓库里的 Provider 仍然是一个只读、确定性的测试能力。业务文本只是演示载荷，不会访问真实客户资料。

## 运行

```powershell
python -m pip install -r adapters/requirements.txt
node scripts/business-demo.mjs
```

如果你想把**这一次真实运行**保存下来，而不是只看终端：

```powershell
node scripts/business-demo.mjs --out .runs/business-demo-output.json
```

输出文件会记录每一步的：

- 主体；
- 会话；
- 实际路由；
- 实际 Provider；
- 服务等级；
- 权限租约根；
- 回执根；
- 当前证据根。

这些 roots 会随每次运行的身份、会话和证据状态变化，所以 README 不把动态哈希伪装成固定产品常量。

## Demo 会真实做三次运行

### 1. 正常执行

```text
A -> B -> C
```

当前回归测试要求正常路径由 C 执行，服务等级为 `Full`。

### 2. 主 Provider C 不可用

脚本会显式关闭 C 的 Provider，再发起一次请求。

如果备用 Provider B 满足同一契约和权限条件，TINP 会改由 B 执行，而不是把失败伪装成成功。当前回归套件要求这时：

```text
route: A -> B
provider: B:counter
level: Essential
```

### 3. A-B 中间链路故障

脚本重新启用 C，然后阻断 A 与 B 之间的链路。

在当前本机测试拓扑中，TINP 会改走：

```text
route: A -> C
provider: C:counter
level: Reduced
```

当前 `tests/profiles.test.mjs` 还额外覆盖：

- B 进程直接死亡后的 A -> C reroute；
- 所有 Provider 都不可用时返回 `deferred / Survival / NO_AUTHORIZED_PROVIDER`，而不是制造成功结果；
- Provider 契约发生语义漂移时拒绝替换并回滚；
- source 从 A 迁移到 B 时保留 subject、session、authority 和证据前缀。

## 为什么这个 Demo 比“字符计数”更重要

字符计数只是一个容易独立验证的只读能力。TINP 真正要验证的是：

```text
同一个主体
同一套权限边界
同一条证据链
     ↓
节点坏了
Provider 换了
路径换了
     ↓
系统仍然知道谁在调用、谁执行了、走了哪条路
```

这才是企业 Agent、私有自动化和边缘系统真正会遇到的问题。

## 这个 Demo 没证明什么

它仍然是本机受控环境，不证明：

- 已连接真实 CRM；
- 已完成两台真实设备部署；
- 已有生产 Authority Provider；
- 已有生产级密钥托管；
- 已通过第三方或军用安全认证。

当前准确状态仍然是：

```text
VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED
```

如果要接自己的 Provider，请看 [`docs/INTEGRATION.md`](docs/INTEGRATION.md)。
