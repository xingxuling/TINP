# TINP 集成指南（alpha.29）

这份文档回答一个实际问题：**如果我已经有自己的 Agent、服务或 Provider，现在能怎么接进 TINP？**

先说结论：TINP 已经有可运行的调用、路由、权限、恢复和 OPP 验收链，但 **alpha.29 还没有一个稳定、独立发布的第三方 Provider SDK**。目前最适合做 PoC、仓库级集成和受控试点，不适合把内部模块接口当成长期兼容承诺。

## 现在有哪些可用入口

| 入口 | 当前状态 | 适合做什么 |
|---|---|---|
| `InternetSuite.start()` / `suite.use(...)` | alpha 内部调用接口 | 本机 PoC、请求发起、故障演示 |
| `src/opp-native-interop.mjs` | candidate | 验证 OPP native interop 结果，并生成 TINP acceptance binding |
| OPP HTTP read-only adapter | candidate | 受策略约束的只读 HTTPS / JSON 观测 |
| Provider manifest / node process | 内部实现接口 | 仓库内 Provider、能力目录、签名回执和故障测试 |
| 独立第三方 Provider SDK | **尚未提供** | 这是进入外部试点前需要稳定的接口之一 |
| 管理台 / 云控制面 | **尚未提供** | 当前不是 SaaS 管理平台 |

## 最小 Caller 例子

当前仓库里最直接的调用方式是 `InternetSuite`：

```js
import {InternetSuite} from '../src/suite.mjs';

const suite = await InternetSuite.start({transport: 'tcp'});
try {
  const result = await suite.use('读取一份只读业务摘要');
  console.log({
    status: result.status,
    level: result.level,
    route: result.receipt?.body?.route,
    provider: result.receipt?.body?.providerId,
    receiptRoot: result.receipt?.root,
  });
} finally {
  await suite.close();
}
```

这是 **alpha 内部 API**。它可以用于当前 PoC，但还没有承诺跨版本稳定。

## 目前怎样接一个自己的 Provider

当前 Provider 路径还不是“装一个 npm 包、实现一个接口”这么简单。仓库里的 Provider 会被身份、能力契约、权限租约、路由策略和回执校验一起约束。

如果今天要在仓库级 PoC 中接一个新的 Provider，通常需要：

1. **定义能力契约**：输入、输出、版本和所需权限。当前固定能力定义在 `src/contract.mjs`。
2. **提供 Provider manifest**：包含 capability、contract root、region、retention、cost、latency、energy 和 security profile 等声明。
3. **实现执行入口**：当前节点执行逻辑在 `src/node-process.mjs`，执行前会检查会话、租约、路由、签名、撤销和证据连续性。
4. **生成并验证 receipt**：结果不能只返回业务 JSON，还要与请求、会话、权限租约、路由和 provider 绑定。
5. **补负例测试**：至少覆盖权限扩大、契约漂移、Provider 不可用、路由故障、重放/重复请求和恢复路径。
6. **把验证结果写进 evidence**：PoC 通过不应只靠口头说明。

这意味着：**当前接 Provider 属于源码级集成，不是稳定插件式 SDK 集成。**

## 接入时必须保留的执行边界

不要把接入写成“先运行自己的业务函数，再把结果交给 TINP 校验”。这只能得到事后核对，不能阻止原来的调用。

当前三节点路径在 `src/node-process.mjs` 执行业务计算之前检查权限；`src/suite.mjs` 在收到结果后才调用 `verifyReceipt()`。新增能力时需要保留这两个位置，并为业务定义结果验收条件，不能只换一个能力名字或移除现有检查。

| 接入方式 | 能否拦截业务执行 | 需要注意 |
|---|---|---|
| 三节点内部能力入口 | 当前受控入口在执行前做检查 | 扩展能力仍需源码级接入和负例测试 |
| 有界 HTTPS 只读入口 | 依该入口自己的请求与访问策略处理 | 不等同于通用业务授权或任意 Provider 注册 |
| OPP 结果验收、离线回执校验 | 不能阻止之前已发生的调用 | 只验收给定结果，不授予权限 |

生产接入还要关闭直接访问真实资源的旁路。例如，不能让智能体既经过受控入口，又持有可直接绕过它的数据库写入凭据。部署约束与最小可信边界见 [执行前约束与执行后核对](ENFORCEMENT_AND_EVIDENCE.md)。

可先运行这组回归测试，观察前置拒绝和后置核对的区别：

```bash
node --test tests/enforcement-evidence.test.mjs
```

测试会绕过 `suite.use()` 的调用端预检，把不合权限的请求送到主节点和备用节点，检查业务执行次数与回执缓存是否保持不变。合法请求也会运行，避免把“所有请求都拒绝”误当成通过。

## 下一阶段应该稳定成什么样

进入真实第三方试点前，建议把 Provider 接口收敛成一个小而明确的 public surface，例如：

```text
registerProvider(manifest, handler)
createCaller(identity, policy)
invoke(capability, input)
verifyReceipt(receipt)
```

这只是下一阶段接口方向，不代表 alpha.29 已经存在这些稳定 API。

真正稳定前，需要先明确：

- manifest 的最小必填字段；
- capability 与 OPP 的映射；
- handler 的输入/输出边界；
- 身份与密钥由谁提供；
- lease / revocation 的 Owner；
- receipt 的稳定字段；
- 错误码与恢复语义；
- 跨版本兼容策略。

## OPP + TINP 当前已经打通到哪里

alpha.29 已经有一条真实、可复核的组合证据：

```text
OPP native interop result
        ↓
TINP 校验 OPP receipt 的精确结构和 roots
        ↓
生成 TINP acceptance binding
```

当前固定证据：

```text
OPP interop receipt root:
77b4cdfaa0f95a9cc75a4c7d08f9d8cc3b94d40f2a9b46b87c51b2b1496f7ff2

TINP acceptance root:
0d51f4f1183294ce50137fa75f9decb4fdf5f387f9ec5846b3bce3ec42bf9bb5

status: PASS
authorityGranted: false
sideEffects: false
```

证据文件：

- `evidence/0.1.0-alpha.29/opp-native-interop-acceptance.json`
- `evidence/0.1.0-alpha.29/EVIDENCE_LEDGER.json`

这证明的是 **TINP 能对一条 OPP-owned candidate interop receipt 做严格验收绑定**。它还不是“任意 OPP bridge 自动进入 TINP 生产网络”的一键联合 SDK。

## 什么时候适合现在就接

适合：

- 你愿意做源码级 PoC；
- 你的动作是只读或低影响；
- 你需要验证身份、权限、路由、恢复和回执设计；
- 你可以接受 alpha 接口会变化；
- 你愿意和仓库一起补测试和 evidence。

暂时不适合：

- 你要求稳定第三方 SDK；
- 你要求生产级 SLA；
- 你要求 HSM、可信时间和完整跨设备密钥生命周期；
- 你要求已经完成第三方安全认证；
- 你要把它直接当成熟 Service Mesh / OAuth / MQ / Temporal 替代品。

## 下一步

- 业务故障 Demo：[`../BUSINESS_DEMO.md`](../BUSINESS_DEMO.md)
- OPP/TINP 分工：[`COMPARISON.md`](COMPARISON.md)
- 当前生产缺口：[`../ROADMAP.md`](../ROADMAP.md)
- 许可边界：[`LICENSE_AUDIT.md`](LICENSE_AUDIT.md)

## 2026-09-12 增量：有界只读 SDK

当前候选增加 [sdk/v1.mjs](PUBLIC_SDK.md)，可从独立安装包调用现有 HTTPS 只读 Provider 与离线回执验证。上文“独立通用 Provider SDK 尚未提供”的边界仍成立；新入口不提供 registerProvider，也不会让外部任意 handler 进入授权三节点执行链。
