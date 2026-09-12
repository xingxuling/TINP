# 3 分钟看懂 TINP

这份演示只看一件事：**一个请求如何带着身份和权限经过多个节点执行，并留下可以复核的结果。**

## 1. 安装依赖

要求：

- Node.js 22+
- Python 3.10+
- `jsonschema`

```powershell
python -m pip install -r adapters/requirements.txt
```

## 2. 跑最小演示

```powershell
npm run demo -- "我要使用字符计数能力完成：你好，TINP"
```

当前演示故意只做一件很小的事：统计 Unicode 码点数量。

重点不在“字符计数”，而在这条链：

```text
请求主体
  ↓
能力协商
  ↓
权限检查
  ↓
建立会话
  ↓
选择路径
  ↓
A -> B -> C
  ↓
Provider 执行
  ↓
结果 + 回执 + 证据
```

## 3. 观察失败后的行为

TINP 不把“失败”简单理解成“再发一次”。

它区分：

```text
路径失效
Provider 失效
请求已经执行但结果丢失
请求是否仍在原权限范围内
```

在 Windows 上可以继续运行恢复演示：

```powershell
npm run recovery:demo
```

这个演示会验证持久状态、重启和恢复路径。它仍然是本机受控环境测试，不是跨真实设备生产部署。

## 4. 看哪里最有意思

第一次看项目，建议按这个顺序：

1. `src/identity.mjs`：主体、签名和根；
2. `src/evidence.mjs`：回执与证据链；
3. `src/coordinator-state.mjs`：恢复状态；
4. `src/authority-registry.mjs`：权限注册候选；
5. `src/opp-native-interop.mjs`：与 OPP 的互操作绑定；
6. `evidence/0.1.0-alpha.29/INTEGRATION_COURT.md`：当前版本验证结果。

## 5. 这份 Demo 没证明什么

当前演示不证明：

- 公网规模部署已经完成；
- 两台真实物理设备已经通过生产验证；
- 已有生产级 Authority Provider；
- 已有 HSM / 专用硬件密钥托管；
- 已通过第三方或军用安全认证。

当前准确状态仍然是：

```text
VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED
```

## 下一步

- [`docs/USE_CASES.md`](docs/USE_CASES.md)：什么时候值得用 TINP；
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：模块怎么分工；
- [`docs/REAL_WORLD_EXAMPLES.md`](docs/REAL_WORLD_EXAMPLES.md)：三个现实业务映射；
- [`docs/EXTERNAL_ACCEPTANCE_GATES.md`](docs/EXTERNAL_ACCEPTANCE_GATES.md)：进入真实外部验证前还缺什么。
