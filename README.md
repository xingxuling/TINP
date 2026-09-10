# TaoWind 新互联网协议套件

v0.1.0-alpha.6 是一个可运行的内部工程候选：普通用户输入一句能力请求，系统在三个独立本机进程之间自动发现、调用 OPP 协商契约、验证权限、建立会话、经 A→B→C 传输并返回带证据的执行结果。新增的 authority registry 是可选的离线签名快照桥接。

本版只有一个刻意收窄的能力：精确统计 Unicode 码点数量。它可以验证主体、权限、路由、迁移、退化和回执能否共同工作；它不代表整个新互联网已经实现。

## 运行

环境：Node.js 22 或以上、Python 3.10 或以上及 `jsonschema`。OPP 和 RCL 所需第一方源码已随内部候选包提供，运行不需要访问云服务。安装缺失的 Python 依赖后运行：

```powershell
python -m pip install -r adapters/requirements.txt
npm run demo -- "我要使用字符计数能力完成：你好，新互联网🌏"
```

也可双击 `运行演示.cmd`，直接使用内置示例。无需用户输入 IP、端口、Provider ID 或传输方式。当前只理解以上固定句式，并非通用自然语言理解系统。IP 与端口由本地夹具分配；这不是无需引导节点的公网发现。

持久恢复演示和本版完整验证需要 Windows；普通临时模式不使用 DPAPI。持久状态保存在被忽略的 `.runs/`，不包含在源码包。

Python 不在默认路径时，设置 `NEXT_INTERNET_PYTHON` 为实际解释器路径。程序内部强制 UTF-8，不要求用户修改系统语言或代码页。

```powershell
npm test
npm run verify
npm run recovery:demo
```

`verify` 冻结源码哈希，按文件顺序运行全部测试，然后分别启动 UDP 和 TCP 三进程、持久恢复见证、外部恢复锚点整目录回放见证和独立 issuer 的 authority registry 轮换见证，保存签名回执、磁盘账本和有界计时到 `evidence/0.1.0-alpha.6/LOCAL_VERIFICATION.json`。重放并发测试内部仍使用真实并发。`npm test` 也按文件顺序运行，避免 Windows 临时目录清理竞态；发行证据使用同一顺序入口。

## 已实现的闭环

1. 固定主体和连续性根与节点、密钥分开表示。
2. 复用 TINP 地址、发现目录、拓扑、多跳信封、帧编码及 UDP 承载；原始副本及 22 项旧测试保留。
3. 真实调用 OPP Python 的 CHP 握手及 RCP 精确输入输出契约协商，协商本身不授权。
4. 使用本机临时 Ed25519 信任夹具签署主体请求、权限租约、会话和回执。
5. 固定 RCL 程序实际编译执行事务准入、会话迁移、路由和恢复约束；Node/Python 负责观测、传输与专业运行。
6. UDP 与 TCP 都经三个真实子进程交换发现、请求与响应；Provider 只在接收节点执行。
7. 相同请求可取回原回执；同一会话证据锚点的分叉请求被拒绝。证据逐条写盘并校验哈希链。
8. 节点或路径失效选择备用路由，远端 Provider 消失选择相同契约的替代者；隔离时执行已授权本地能力，全部 Provider 消失时保留身份、会话和证据并返回待恢复。

## 证据与边界

阅读 `docs/REALITY_AUDIT.md`、`docs/CANONICAL_OWNERSHIP.md`、`docs/SPEC_DEVIATIONS.md`、`evidence/0.1.0-alpha.6/INTEGRATION_COURT.md` 和 `evidence/0.1.0-alpha.6/EVIDENCE_LEDGER.json`。原规范保留在 `constitution/`，未修改下载文件或同步项目参考文件。

当前是 **VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED**。没有公网、真实异机部署、军用安全认证、互联网规模收敛、生产密钥托管或第三方安全评估。签名提供当前夹具内的认证与完整性，传输没有 TLS 机密性，因此严格限制回环地址。

可选 Windows 持久模式用当前用户 DPAPI 保存密钥、会话、撤销水位和回执缓存；签名账本及受保护 checkpoint 联合验证恢复。恢复时保持原主体、租约期限和权限范围。真实杀进程测试覆盖重复请求、协调器中断及节点重启。磁盘目录有独立协调器和节点写锁。单个协调器负责证据顺序；这不是分布式共识。断连节点不能即时获知撤销，现有短期租约到期提供局部底线。自动重试仅用于本版纯只读计算，不能推导出高影响外部动作的恰好一次执行或补偿事务能力。

SLA、成本、地域、能耗是受信本地配置与约束，非实测商业保证或结算。保留期零值指不留原始请求文本；回执和摘要为审计保存，尚无完整生命周期清理机制。P12 应用种子、P13 跨设备运行、P14 私网和 P15 全面旧网适配未在本版实现。RNCS/RFE 世界事实与提交权没有迁入本仓库。

本轮新增恢复闭环、外部恢复锚点和 authority registry 桥接，审查见 `docs/RECOVERY_OWNER.md`、`docs/PROTECTED_STORAGE.md`、`docs/RECOVERY_SECURITY_COURT.md`、`docs/RECOVERY_ANCHOR_OWNER.md`、`docs/RECOVERY_ANCHOR_SECURITY_COURT.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 和 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。原始待处理请求只保存在加密 checkpoint，恢复仅查找已存在回执；未找到时保留未决状态并拒绝继续，不自动重发。外部锚点能拒绝已知新锚点之前的完整旧目录回放，registry 能验证独立 issuer 的签名快照并推导角色 keyring，但上次显式锚定之后的未锚定尾部、在线注册/撤销、跨设备密钥迁移和全网收敛仍未解决。详见 `docs/NEXT_GAP.md`。

## 许可

这是用户拥有资产的内部源码候选包，未公开发布。RCL 附原 Apache-2.0 LICENSE；TINP 保留上游简短 Apache-2.0 声明。OPP 上游未声明许可证，`vendor/opp/LICENSE-NOT-DECLARED.md` 不赋予再分发权。请先完成许可裁决再考虑公开发布。详见 `docs/LICENSE_AUDIT.md`。

## 未决请求维护

`npm run pending:demo` 会创建全新演示状态，实际验证“保存但未发送 → 只读检查 → 三节点持久撤销 → 关闭记录 → 再次启动仍拒绝原租约”。它不会处置已有用户目录。真实再次杀进程的两个提交窗口另由测试验证。

已有状态目录可按以下顺序操作（将示例目录替换为实际目录）：

```powershell
npm run pending -- status "C:\实际状态目录"
npm run pending -- reconcile "C:\实际状态目录"
```

status 不启动节点、不改 checkpoint/账本，只输出摘要，不输出请求原文或密钥。在线写入恰好与读取冲突时可能要求重试。reconcile 仅查原回执；查不到时保留 pending，不重发。维护期间任何 INTENT 都被拦截。

确实决定停用整个原租约并关闭未决记录时，复制 status 输出的完整 requestRoot，明确确认：

```powershell
npm run pending -- retire "C:\实际状态目录" --request-root 完整请求根 --confirm-retire-lease
```

该操作不会证明请求从未执行，也不会撤销已经发生的计算。缺任何一个节点持久撤销确认都会保留 pending；全部确认后记录 unknown 并停用原租约。没有自动换密钥、续租或清空目录。需要同一 Windows 用户的 DPAPI 访问能力；这不是生产独立操作员认证。详见 docs/PENDING_OWNER.md 和 docs/PENDING_SECURITY_COURT.md。

## 可选外部操作员签章

本版新增 AAF approval 薄适配，原 AAF canonical/root/signature 实现保持不变。`npm run operator:demo` 使用独立测试进程生成仅在该进程内存中的测试私钥，实际跑 CLI 固定公钥、导出挑战、外部签署、拒绝纯确认绕过、导入批准并恢复。它不接触已有用户状态，也不代表真实操作员注册。

为已有状态启用外部签章（示例路径需替换）：

```powershell
npm run pending -- operator-pin "C:\状态目录" --signer-id operator:owner --public-key "C:\独立配置\operator-public.pem" --confirm-pin-operator
npm run pending -- operator-request "C:\状态目录"
```

pin 是明确的本机信任引导，一旦写入不得通过本版 API 删除或替换。保留完整历史与 checkpoint 交叉核验；无 pin 的旧状态仍是本机确认夹具。要改变受信操作员须另行设计受控轮换，不能自动换钥。

独立签署方用原 AAF `sealApproval` 与 `signObject` 对导出的 challengeRoot 批准。精确角色为 `tinp.operator`，范围为 `tinp.pending.retire`，decision=approved，conditions为空；issued_at/expires_at须规范ISO时间，窗口最长10分钟。网络CLI没有签发私钥入口。

公钥文件之外，当前外部 keyring 使用以下结构，公钥须与固定指纹一致：

```json
{"operator:owner":{"publicKeyPem":"这里填写真实公钥PEM","revoked":false}}
```

导入批准：

```powershell
npm run pending -- retire "C:\状态目录" --request-root 完整请求根 --confirm-retire-lease --keyring "C:\独立配置\keyring.json" --approval "C:\独立配置\approval.json"
npm run pending -- status "C:\状态目录" --keyring "C:\独立配置\keyring.json"
```

维护命令可用 `--transport tcp` 指定TCP，默认UDP；当前仍限定回环。外部keyring每次由调用方提供，不持久化到网络checkpoint。其 revoked 状态必须来自受信配置，当前没有联网撤销分发服务。

外部批准只授权终止当前未决记录并停用原租约，绝不签发新租约、扩权或重发执行。初验后若批准到期或撤销，终止操作保留pending。已经认证落盘的历史终态按其原准入时刻复核；当前外部key仍须可用且未撤销，即使pending已清也会验证签章。

此处“独立”指私钥不在网络协调器/节点或其checkpoint，尚无可信外部时钟、硬件托管、真实人类身份或整目录防回滚锚点。详细 Owner、来源和限制见 docs/AAF_OPERATOR_OWNER.md 与 docs/OPERATOR_SECURITY_COURT.md。

## 外部恢复锚点

alpha.5 增加了可选的外部单调恢复锚点。它把已认证账本前缀、主体/租约根、撤销水位和状态投影交给独立见证方签名；运行端只保存锚点和见证公钥指纹，不保存见证私钥。锚点不是自动生成的远程服务，必须由外部进程签署并显式导入。

先在维护模式固定见证公钥：

```powershell
npm run recovery-anchor -- pin "C:\状态目录" --signer-id recovery:owner --public-key "C:\独立配置\witness-public.pem" --confirm-pin-anchor
```

导出待签请求（只读），将 `request.body` 交给独立见证方使用 TINP `seal` 签名，再保存完整 `{body,root,signature}`：

```powershell
npm run recovery-anchor -- request "C:\状态目录" --keyring "C:\独立配置\witness-keyring.json"
npm run recovery-anchor -- accept "C:\状态目录" --keyring "C:\独立配置\witness-keyring.json" --anchor "C:\独立配置\anchor.json"
```

查看锚点状态：

```powershell
npm run recovery-anchor -- status "C:\状态目录" --keyring "C:\独立配置\witness-keyring.json"
```

`keyring` 只接受固定 signer 的公钥和明确的 `revoked:false`；它由调用方提供，当前不是在线撤销注册表。锚点序号必须单调，已知新锚点会使完整旧目录回放失败。上一次显式锚定之后的本地尾部仍需再次锚定；本机时钟、生产身份登记、硬件保管、两台真实设备和跨主机可信存储尚未实现。`npm run recovery-anchor:demo` 会用独立测试进程演示签署、重启和整目录回放拒绝。

## Authority registry 快照

alpha.6 增加可选的离线 `twni.authority-registry.v1`。独立 issuer 进程签署带序号和前一根的快照；旧成员只能保持或转为 revoked，新 key 必须指向已撤销的前代、递增 epoch、沿用原 authority 和角色子集。registry 只保存公钥指纹，不保存成员或 issuer 私钥；调用方通过成员 keyring 显式解析实际公钥。

先验证并按角色导出 keyring：

```powershell
npm run authority-registry -- keyring "C:\配置\registry.json" --policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --member-keyring "C:\配置\member-keyring.json" --role recovery-witness
```

`npm run authority-registry:demo` 会启动独立测试 issuer，验证 seq1→seq2、operator/recovery-witness 轮换、旧 key 撤销和无私钥持久化。已有恢复锚点也可在 `recovery-anchor` 的 `status/request/accept` 上显式提供 `--registry`、`--registry-policy`、`--registry-issuer-keyring` 与成员 `--keyring`；这只替换本次调用的公钥解析，不把 registry 写进 checkpoint。

快照是调用方选择的离线输入，`--now-ms` 默认本机时间且没有可信时钟；没有在线发布、撤销分发、丢失恢复、硬件托管、跨设备一致性或生产身份注册。详细 Owner、来源和限制见 `docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。
