# Contributing to TINP

感谢你愿意参与 TINP。

TINP 当前是 **VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED**。贡献时请优先保持一个原则：**不要把实验室里验证过的能力写成已经完成的生产能力。**

## 适合提交什么

欢迎：

- 身份、权限、路由、恢复和证据相关的测试；
- 新的受控传输适配；
- 真实跨进程 / 跨设备验证；
- 故障注入和恢复案例；
- 更清楚的 CLI / demo；
- Authority、时间、密钥托管等外部接口边界；
- 文档和许可审计修正。

暂时不建议：

- 静默重试高影响动作；
- 为了“自动化”跳过授权；
- 把本机 loopback 当作公网证明；
- 把测试私钥、临时证书或夹具当作生产密钥方案；
- 在没有证据时扩大安全宣称。

## 本地开发

要求：

- Node.js 22+
- Python 3.10+
- Python `jsonschema`

```powershell
python -m pip install -r adapters/requirements.txt
npm test
```

完整本机验证：

```powershell
npm run verify
```

部分恢复测试需要 Windows；TLS 演示需要本机 OpenSSL。

## Pull Request 建议

一个好的 PR 最好说明：

1. 解决哪个具体故障或能力缺口；
2. 改变了哪条状态机或权限边界；
3. 正常路径和失败路径分别怎么验证；
4. 是否影响现有 Evidence Ledger / receipt；
5. 是否新增外部依赖或改变许可边界。

涉及恢复、重试、撤销、Operator Approval、Authority Registry 或传输时，请尽量同时提供负例测试。

## 设计原则

TINP 当前坚持：

- 协商不等于授权；
- 未确认状态优先失败关闭；
- pending 默认不自动重发；
- 恢复不扩大原权限；
- 结果必须能追溯到回执和证据；
- 真实部署能力必须由真实部署证据支持。

## License / 许可

TINP 包含 `vendor/` 和历史来源快照。贡献前请阅读 [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md)。不要假设仓库公开就代表所有历史组件都可以自由再分发。
