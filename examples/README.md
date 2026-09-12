# TINP Examples

TINP 的多数演示入口放在根目录的 `scripts/` 和 `package.json` scripts 中；这个目录主要保存需要固定输入文件的示例。

## 最小演示

第一次运行建议直接从根目录开始：

```powershell
python -m pip install -r adapters/requirements.txt
npm run demo -- "我要使用字符计数能力完成：你好，TINP"
```

这个演示故意只做 Unicode 码点统计。重点不是“统计字符”，而是看完整链路能否经过：

```text
请求主体
  -> 权限
  -> 能力协商
  -> 会话
  -> 路由
  -> Provider 执行
  -> 回执
  -> 证据
```

## OPP HTTP 只读示例

`opp-http-readonly/` 保存受策略约束的只读 HTTPS / JSON 示例输入。

这条路径用于验证：

- host / path allowlist；
- 只允许 GET；
- 不继承环境代理和凭据；
- 不跟随 redirect；
- 对响应做大小和字段限制；
- 生成可校验 receipt。

它不是通用 HTTP 客户端，也不是生产凭据方案。

## 常用演示入口

回到仓库根目录后可以运行：

```powershell
npm run recovery:demo
npm run operator:demo
npm run authority-registry:demo
npm run authority-registry-convergence:demo
npm run authority-registry-tls-loopback-transfer:demo
npm run authority-registry-resumable-transfer:demo
```

这些命令分别验证恢复、操作员批准、Authority Registry、历史收敛、TLS loopback 和中断续传。

## 推荐阅读顺序

```text
README.md
   ↓
docs/USE_CASES.md
   ↓
npm run demo
   ↓
npm run recovery:demo
   ↓
evidence/0.1.0-alpha.29/INTEGRATION_COURT.md
```

如果你想判断 TINP 是否适合某个真实场景，先看 [`../docs/USE_CASES.md`](../docs/USE_CASES.md)。
