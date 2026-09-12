# TINP

**A local-first runtime for identity-aware, permission-bounded, recoverable communication between agents and services.**  
**面向智能体与软件服务的本地优先通信运行时：带身份、权限、路由、恢复和执行证据。**

TINP 关注的不是“怎么调用一个 API”，而是调用发生之后更难处理的问题：

- 谁在发起请求；
- 对方有没有权限；
- 能力由哪个节点提供；
- 节点或路径失效后怎么办；
- 任务中断后如何恢复；
- 一次执行到底发生了什么，能不能复核。

当前版本：`0.1.0-alpha.29`  
当前状态：**VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED**

这意味着：当前版本已经通过本机集成验证，但还不是生产网络，也不声称已经具备互联网规模、生产级密钥托管或军用安全认证。

## 一分钟理解

假设有三个节点：

```text
A  用户入口
B  中间节点
C  能力提供方
```

用户发起一个请求后，TINP 会尝试完成：

```text
识别请求主体
    ↓
确认能力与权限
    ↓
建立会话
    ↓
选择路由
    ↓
A -> B -> C
    ↓
在 Provider 节点执行
    ↓
返回结果与回执
    ↓
写入可验证证据
```

如果 B 失效，系统可以尝试备用路径；如果原 Provider 消失，可以在满足同一契约时切换到替代 Provider；如果当前没有可用 Provider，则保留会话、身份和证据，把请求留在可恢复状态，而不是静默重试。

## TINP 和 OPP 的关系

两者解决不同问题：

| 项目 | 负责什么 |
|---|---|
| **OPP** | 描述和协商“这个系统会什么、输入输出是什么、两个系统能不能接” |
| **TINP** | 负责“谁可以调用、怎么传、失败怎么办、怎么恢复、怎么留下证据” |

简单说：

```text
OPP: 能不能接
TINP: 接起来以后怎么可靠地运行
```

TINP 当前会实际调用 OPP 的能力协商结果，但协商本身不会自动授予权限。

## 当前已实现

### 身份与权限

- 主体、节点和密钥分开表示；
- Continuity Root（连续性根）；
- Ed25519 签名；
- 权限租约；
- 会话状态；
- Provider 能力目录；
- 可选外部操作员批准；
- Authority Registry（权限注册表）候选实现。

### 路由与执行

- 三个独立本机进程；
- UDP 与 TCP 传输；
- 多跳请求；
- 备用路由；
- Provider 替换；
- OPP CHP / RCP 能力协商；
- OPP native interop acceptance；
- 受策略约束的只读 HTTPS / JSON 访问。

### 恢复与证据

- 请求回执；
- 哈希链 Evidence Ledger；
- 重复请求返回原回执；
- 分叉请求拒绝；
- Windows DPAPI 持久状态；
- 节点重启和协调器中断恢复；
- Pending 请求管理；
- Recovery Anchor；
- Authority Registry 历史、分发与收敛检查；
- 跨进程 public-history replay；
- TLS 1.3 loopback state transfer；
- 可恢复分块传输与磁盘 journal。

## 当前没有实现

为了避免误解，以下能力**目前没有被证明**：

- 公网规模部署；
- 两台真实物理设备之间的生产级运行；
- 无引导节点的公网发现；
- 生产 Authority Provider；
- HSM / 专用硬件密钥托管；
- 可信外部时间；
- 全网分布式共识；
- 互联网规模状态收敛；
- 高影响外部动作的 exactly-once 保证；
- 完整跨设备密钥迁移；
- 第三方安全认证；
- 军用安全认证。

当前 TLS、恢复、分发、收敛和多进程证据主要是**本机受控环境验证**。

## 快速开始

### 环境要求

- Node.js 22+
- Python 3.10+
- Python `jsonschema`
- Windows：运行完整持久恢复验证时需要
- OpenSSL：运行 TLS 演示时需要

安装 Python 依赖：

```powershell
python -m pip install -r adapters/requirements.txt
```

运行最小演示：

```powershell
npm run demo -- "我要使用字符计数能力完成：你好，TINP"
```

当前演示故意只提供一个很小的能力：**统计 Unicode 码点数量**。这个能力不是产品目标，只是用来验证身份、权限、路由、Provider、恢复和回执能否一起工作。

运行测试：

```powershell
npm test
```

运行完整本机验证：

```powershell
npm run verify
```

运行恢复演示：

```powershell
npm run recovery:demo
```

## 常用演示

```powershell
npm run operator:demo
npm run authority-registry:demo
npm run authority-registry-distribution:demo
npm run authority-registry-convergence:demo
npm run authority-registry-convergence-store:demo
npm run authority-registry-convergence-witness:demo
npm run authority-registry-cross-host-replay:demo
npm run authority-registry-loopback-transfer:demo
npm run authority-registry-tls-loopback-transfer:demo
npm run authority-registry-resumable-transfer:demo
```

这些命令主要用于验证具体机制，不代表已经完成真实公网或跨设备生产部署。

## 一个失败场景

假设当前路径是：

```text
A -> B -> C
```

B 失效后，如果存在合法备用路径：

```text
A -> D -> C
```

TINP 可以尝试切换路径。

如果 C 也失效，但 E 提供同一能力并满足契约，可以切换到 E。

如果没有任何可用 Provider，系统不会假装任务成功，而是保留当前身份、会话和证据，把请求放入 pending 状态，等待后续恢复或人工处理。

## 适合研究和验证的场景

- 私有 Agent 网络；
- 企业内部服务间的权限受控调用；
- 边缘设备和本地服务之间的可靠协作；
- 断连或节点失效后的任务恢复；
- 需要执行回执和审计证据的自动化；
- OPP 能力协商之后的受控执行层。

当前更适合作为**研究、原型和试点基础设施**，而不是直接作为生产公网替代方案。

## 项目结构

```text
src/            身份、权限、状态、证据、路由、恢复、Registry 与 OPP 互操作
adapters/       OPP、RCL、DPAPI、外部操作员等适配层
scripts/        演示、CLI 和验证入口
tests/          单元测试与集成测试
evidence/       每个版本的本机验证结果和回执
docs/           设计说明、安全边界与外部验收门
constitution/   原始规范与约束
vendor/         固定版本的第一方/来源依赖快照
```

## 验证状态

`alpha.29` 的集成法院记录为：

```text
209 / 209 tests passed
0 failed
status: VERIFIED_LOCAL_CANDIDATE
```

完整证据见：

- [`evidence/0.1.0-alpha.29/INTEGRATION_COURT.md`](evidence/0.1.0-alpha.29/INTEGRATION_COURT.md)
- [`evidence/0.1.0-alpha.29/EVIDENCE_LEDGER.json`](evidence/0.1.0-alpha.29/EVIDENCE_LEDGER.json)
- [`docs/EXTERNAL_ACCEPTANCE_GATES.md`](docs/EXTERNAL_ACCEPTANCE_GATES.md)

## 安全原则

TINP 当前实现遵循几个明确原则：

- 协商不等于授权；
- 没有证据就不把能力状态提升为已验证；
- 未决请求默认不自动重发；
- 恢复不能静默扩大原有权限；
- 外部操作员批准不能由普通确认字符串替代；
- 遇到无法确认的状态时优先失败关闭；
- 测试夹具通过不等于生产安全通过。

详细安全边界见 `docs/` 和各版本 `evidence/`。

## License / 许可

这个仓库包含历史来源快照和 vendor 目录，许可状态不能只看仓库是否公开。

当前请以 [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md) 为准。对外再分发、打包或商业发行前，应先完成各 vendor 组件的许可核对。

OPP 当前独立仓库已经提供 MIT License，但 TINP 中固定的历史 OPP 快照来自更早版本，不能自动把新的许可证结论追溯到旧快照。

## 项目定位

TINP 目前最准确的定位是：

> **一个用于验证“带身份、权限、路由、恢复和证据的软件/Agent 通信”是否能够闭环工作的实验性运行时。**

它已经跨过纯规范阶段，进入可运行的本机集成候选；下一步重点是跨真实设备、生产 Authority、密钥托管、可信时间和独立安全验证。
