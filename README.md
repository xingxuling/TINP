# TaoWind 新互联网协议套件

v0.1.0-alpha.23 是一个可运行的内部工程候选：普通用户输入一句能力请求，系统在三个独立本机进程之间自动发现、调用 OPP 协商契约、验证权限、建立会话、经 A→B→C 传输并返回带证据的执行结果。authority registry、多镜像分发、历史收敛、本机历史 store、外部收敛见证、跨进程 public-history replay、TCP/TLS 1.3 TINP DATA loopback state transfer、可恢复分块传输以及只读 OPP HTTP 观察适配器是可选的离线签名桥接和压力验证；alpha.21 提供 live OPP consumer orchestration；alpha.22 增加 live result validator 与 CLI fail-closed 回归；alpha.23 固定 live result exact shape。

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

`verify` 冻结源码哈希，按文件顺序运行全部测试，然后分别启动 UDP 和 TCP 三进程、持久恢复见证、外部恢复锚点整目录回放见证、独立 issuer 的 authority registry 轮换见证、独立多镜像分发见证、连续历史收敛见证、本机历史 store 扩展见证、独立外部收敛见证、两个独立本机进程的 public-history replay 见证、TCP 和 TLS 1.3 两个独立本机 transport worker 的 TINP DATA loopback state-transfer 见证、带磁盘 journal 的 TLS 可恢复分块传输见证，以及确定性只读 OPP HTTP policy/receipt 见证，保存签名回执、磁盘账本和有界计时到 `evidence/0.1.0-alpha.23/LOCAL_VERIFICATION.json`。TLS 演示需要本机 OpenSSL 生成临时自签名证书；私钥只存在临时目录和进程内存。重放并发测试内部仍使用真实并发。`npm test` 也按文件顺序运行，避免 Windows 临时目录清理竞态；发行证据使用同一顺序入口。

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

阅读 `docs/REALITY_AUDIT.md`、`docs/CANONICAL_OWNERSHIP.md`、`docs/SPEC_DEVIATIONS.md`、`docs/AUTHORITY_PROVIDER_READINESS.md`、`docs/OPP_HTTP_READONLY_ADAPTER.md`、`docs/OPP_HTTP_CONSUMER_BRIDGE.md`、`evidence/0.1.0-alpha.23/INTEGRATION_COURT.md` 和 `evidence/0.1.0-alpha.23/EVIDENCE_LEDGER.json`。原规范保留在 `constitution/`，未修改下载文件或同步项目参考文件。

当前是 **VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED**。没有公网、真实异机部署、军用安全认证、互联网规模收敛、生产密钥托管或第三方安全评估。签名提供当前夹具内的认证与完整性；TLS 1.3 以及可恢复分块传输仅在 alpha.14 的临时证书 loopback harness 中验证，alpha.17 的 OPP HTTP 适配器只允许显式 HTTPS/GET 观察，并拒绝已知 Node 环境代理开关；alpha.20 增加 bundle 生成 CLI；alpha.21 增加 live consumer orchestration，alpha.22 增加最终结果 validator 与 CLI 子进程回归，alpha.23 固定 exact shape，但仍只证明一次本机受约束的 OPP 协商与只读观察；alpha.19 增加带 bundleRoot 的单文件 consumer bridge 回放，默认运行仍严格限制回环地址。

可选 Windows 持久模式用当前用户 DPAPI 保存密钥、会话、撤销水位和回执缓存；签名账本及受保护 checkpoint 联合验证恢复。恢复时保持原主体、租约期限和权限范围。真实杀进程测试覆盖重复请求、协调器中断及节点重启。磁盘目录有独立协调器和节点写锁。单个协调器负责证据顺序；这不是分布式共识。断连节点不能即时获知撤销，现有短期租约到期提供局部底线。自动重试仅用于本版纯只读计算，不能推导出高影响外部动作的恰好一次执行或补偿事务能力。

SLA、成本、地域、能耗是受信本地配置与约束，非实测商业保证或结算。保留期零值指不留原始请求文本；回执和摘要为审计保存，尚无完整生命周期清理机制。P12 应用种子、P13 跨设备运行、P14 私网和 P15 全面旧网适配未在本版实现。RNCS/RFE 世界事实与提交权没有迁入本仓库。

本轮新增恢复闭环、外部恢复锚点、authority registry、多镜像分发、历史收敛、本机历史 store、外部收敛见证、跨进程 public-history replay、TCP 与 TLS 1.3 TINP DATA loopback state-transfer 桥接及可恢复分块 TLS 传输，审查见 `docs/RECOVERY_OWNER.md`、`docs/PROTECTED_STORAGE.md`、`docs/RECOVERY_SECURITY_COURT.md`、`docs/RECOVERY_ANCHOR_OWNER.md`、`docs/RECOVERY_ANCHOR_SECURITY_COURT.md`、`docs/AUTHORITY_REGISTRY_OWNER.md` 和 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。原始待处理请求只保存在加密 checkpoint，恢复仅查找已存在回执；未找到时保留未决状态并拒绝继续，不自动重发。外部锚点能拒绝已知新锚点之前的完整旧目录回放，registry 能验证独立 issuer 的签名快照并推导角色 keyring，多镜像 bundle 能要求同一 registry root 的签名阈值并拒绝分叉，历史 bundle 能检查连续序号、前根、重复/分叉快照和稳定镜像集合，本机 store 能在显式 append 时原子保存完整历史并拒绝回退或改写，外部收敛见证能把独立签名绑定到精确 store 状态并检测保留见证下的替换/回退，跨进程 replay 能在两个独立本机目录间复验公开状态并保留分叉/漂移/缺口冲突，TCP loopback transfer 能在既有 TINP DATA framing 和 peer public-key admission 下复验公开状态并在篡改载荷后保持接收端 durable bytes，TLS loopback transfer 进一步在 TLS 1.3 与 caller-pinned 临时证书下复验相同语义并拒绝错误 CA；alpha.14 的可恢复分块传输把公开 state 编成有界 DATA chunks，以原子 journal 保存游标，接收端在第 7/14 个 chunk 后重启并从第 7 个继续，重复保持 `unchanged`，chunk/manifest 冲突被拒绝；但上次显式锚定之后的未锚定尾部、在线注册/撤销、可信时间、跨设备密钥迁移和全网持久收敛仍未解决。详见 `docs/NEXT_GAP.md`。

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

## Authority registry 多镜像分发

alpha.7 增加 `twni.authority-registry-distribution.v1` 离线 bundle。调用方策略固定 registry policy root、镜像公钥指纹和阈值；每个独立 mirror child 对同一 registry root 签 receipt。验证要求不同镜像达到阈值，拒绝重复镜像、过期 receipt、错误 key、错误 root/sequence 和签名分叉。

演示独立 issuer 与三个镜像进程：

```powershell
npm run authority-registry-distribution:demo
```

CLI 验证已有 bundle：

```powershell
npm run authority-registry -- distribution-verify "C:\配置\distribution-bundle.json" --policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --distribution-policy "C:\配置\distribution-policy.json" --mirror-keyring "C:\配置\mirror-keyring.json"
```

多镜像签名只证明调用时收到的离线 quorum 对同一个 root 达成一致；策略、镜像 keyring、registry 文件和本机时间仍由调用方提供，不是在线发布、透明日志、可信时钟、跨设备收敛或生产 authority。详见 `docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。

## Authority registry 历史收敛

alpha.8 增加 `twni.authority-registry-convergence.v1` 历史 bundle。调用方把多个已验证的 distribution bundle 放入同一容器；验证要求从 Genesis/序号 1 开始连续递增，每个快照的 `previousRegistryRoot` 精确指向前一快照，所有快照的 accepted mirror 集合保持稳定，并拒绝同序号重复快照或不同 root 的有效签名分叉。`historyRoot` 绑定整个离线历史。

演示两个连续 registry 快照、每段的三个独立 mirror quorum，以及历史分叉和镜像集合漂移拒绝：

```powershell
npm run authority-registry-convergence:demo
```

CLI 验证已有历史文件：

```powershell
npm run authority-registry -- convergence-verify "C:\配置\convergence-history.json" --policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --distribution-policy "C:\配置\distribution-policy.json" --mirror-keyring "C:\配置\mirror-keyring.json"
```

历史 bundle 是调用方提供的离线输入；它能发现所提供历史中的缺口、前根断裂、重复、分叉和镜像集合漂移，但不发布快照、不提供透明日志、可信时间、在线撤销传播、跨主机持久收敛、硬件托管或生产 authority。详见 `docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。

## Authority registry 历史 store

alpha.9 增加 `twni.authority-registry-convergence-store.v1` 本机 store。它只保存公开的 distribution bundles 和 `historyRoot`，不保存 issuer、mirror 或 member 私钥。显式 append 会先复验完整历史，再使用现有目录写者租约和临时文件原子替换；已有历史只能由完全相同的前缀扩展，回退、修改旧 bundle、篡改 root 和错误 policy 都会拒绝。相同历史重复提交返回 `unchanged`，不会改写文件。

演示首次写入、连续扩展、幂等重放、回退和前缀改写拒绝：

```powershell
npm run authority-registry-convergence-store:demo
```

显式写入本机 store（第一个参数是完整 convergence bundle，`--store` 是目标文件）：

```powershell
npm run authority-registry -- convergence-store-append "C:\配置\convergence-history.json" --store "C:\配置\authority-history-store.json" --policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --distribution-policy "C:\配置\distribution-policy.json" --mirror-keyring "C:\配置\mirror-keyring.json"
```

读取并复验已有 store：

```powershell
npm run authority-registry -- convergence-store-verify "C:\配置\authority-history-store.json" --policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --distribution-policy "C:\配置\distribution-policy.json" --mirror-keyring "C:\配置\mirror-keyring.json"
```

store 是本机调用方选择的持久输入；目录租约只串行本机写者，原子替换只保护正常写入过程。它不提供外部可信时间、透明日志、完整旧目录防回滚、跨主机共识、在线撤销传播、硬件托管或生产 authority。详见 `docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。

## Authority registry 外部收敛见证

alpha.10 增加 `twni.authority-registry-convergence-witness-policy.v1` 与 `twni.authority-registry-convergence-witness.v1`。调用方把本机 store 的完整公开状态交给独立外部签署方；见证 body 同时绑定 policy root、distribution/registry 标识、`historyRoot`、store 序号边界、完整 `storeStateRoot` 和调用方给出的 `issuedAtMs`。验证要求见证公钥指纹、签名、store 状态和底层 registry/distribution/convergence 检查全部通过；保留上一份已验签见证时，序号必须连续且前一见证根精确匹配。

演示独立见证签署进程、store 状态绑定、连续见证，以及结构上有效的 store 替换、同序号见证替换和回退拒绝：

```powershell
npm run authority-registry-convergence-witness:demo
```

只读导出待签 body（第一个参数是已有 store，运行端不生成或保存见证私钥）：

```powershell
npm run authority-registry -- convergence-witness-request "C:\配置\authority-history-store.json" --policy "C:\配置\witness-policy.json" --sequence 1 --now-ms 1760000000000
```

验证外部签署的见证：

```powershell
npm run authority-registry -- convergence-witness-verify "C:\配置\witness.json" --policy "C:\配置\witness-policy.json" --witness-keyring "C:\配置\witness-keyring.json" --store "C:\配置\authority-history-store.json" --registry-policy "C:\配置\registry-policy.json" --issuer-keyring "C:\配置\issuer-keyring.json" --distribution-policy "C:\配置\distribution-policy.json" --mirror-keyring "C:\配置\mirror-keyring.json" --now-ms 1760000000000
```

外部见证只绑定调用方提供的精确本机 store；上一份见证必须由调用方另行保留，替换 store 与同序号见证才可在该保留根上被发现。它不提供在线发布/撤销、透明日志、可信时钟、见证文件自身的独立持久保护、跨主机共识、硬件托管或生产身份服务。详见 `docs/AUTHORITY_REGISTRY_OWNER.md` 与 `docs/AUTHORITY_REGISTRY_SECURITY_COURT.md`。

## Authority registry 跨进程 public-history replay

alpha.11 增加一个只复用现有 convergence-store 语义的压力 harness。两个独立 Node 子进程各自拥有单独目录，通过 IPC 传递仅含公开 key、签名和 store 状态的序列化数据；第二个进程完成导入、幂等 replay 和 seq3 扩展。随后对同长度签名分叉、镜像集合漂移和序号缺口提交候选，验证器拒绝并保持原有 durable bytes。

```powershell
npm run authority-registry-cross-host-replay:demo
```

这是真实本机进程/文件系统压力证据，不是两台物理设备、加密跨主机传输、可信时间、在线 authority 或生产冲突共识。完整结果见 `evidence/0.1.0-alpha.11/authority-registry-cross-host-replay.json`；外部 Owner 交接仍以 `docs/AUTHORITY_PROVIDER_READINESS.md` 为准。

alpha.12 继续复用上述 store/convergence 语义，并接入现有 `src/transport.mjs` 的 `LocalTransport` 与 vendored TINP `DATA` framing。两个独立 Node transport worker 各自绑定 TCP `127.0.0.1` endpoint 和独立目录；节点 A 通过 peer public-key admission 把 seq1→seq2 public store 传给 B，B 导入、幂等 replay、扩展到 seq3，再反向传回 A。场景记录真实发送/接收帧和字节计数，接收端无无效帧；同长度签名分叉、镜像集合漂移、序号缺口以及篡改 `historyRoot` 的 transfer 都被拒绝，原 durable bytes 保持不变。

```powershell
npm run authority-registry-loopback-transfer:demo
```

这是真实本机 TCP socket/process/filesystem 压力证据，不是 TLS、两台物理设备、加密跨主机传输、可信时间、在线 authority 或生产冲突共识。完整结果见 `evidence/0.1.0-alpha.12/authority-registry-loopback-transfer.json`；外部 Owner 交接仍以 `docs/AUTHORITY_PROVIDER_READINESS.md` 为准。

## Authority registry TLS loopback transfer

alpha.13 在保留 TCP loopback harness 的基础上，让既有 `LocalTransport` 复用 TINP `DATA` framing 承载 TLS 1.3。两个独立 Node worker 使用临时自签名证书，调用方把对端证书作为 CA pin，同时继续用 TINP peer public key 验证消息身份。公开 store state 经过相同的 append/convergence validators，验证导入、幂等 replay、反向扩展、篡改/分叉/漂移/缺口拒绝和接收端 durable bytes 保留。

```powershell
npm run authority-registry-tls-loopback-transfer:demo
```

演示只在本机临时目录生成证书和私钥，退出时删除；归档不含实际私钥。错误 CA 的握手会在 DATA 帧发送前失败。结果是本机 TLS/socket/process/filesystem 证据，不是生产证书托管、两台物理设备注册、可信时间、在线 authority 或生产冲突共识。完整结果见 `evidence/0.1.0-alpha.13/authority-registry-tls-loopback-transfer.json`；外部 Owner 交接仍以 `docs/AUTHORITY_PROVIDER_READINESS.md` 为准。

## Authority registry resumable TLS transfer

alpha.14 在同一 TINP `DATA` framing 和 store/convergence validators 上增加可恢复的公开 state 分块传输。发送端把 state 编成 14 个有界 chunks；接收端用 `twni.authority-registry-resumable-transfer-journal.v1` 原子保存 manifest、游标和已收 chunk。演示在收到第 7 个 chunk 后终止接收进程，重启后从第 7 个继续，完成后把 state 原子提交到 store；重复 chunk 保持 `unchanged`，同索引篡改返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT`，同 transfer id 换 state root 返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT`。

```powershell
npm run authority-registry-resumable-transfer:demo
```

这是本机 TLS 1.3/socket/process/filesystem 的可恢复压力证据，使用临时证书和独立目录，不是两台物理设备、生产证书托管、可信时间、在线 authority 或生产冲突共识。完整结果见 `evidence/0.1.0-alpha.14/authority-registry-resumable-transfer.json`；外部 Owner 交接仍以 `docs/AUTHORITY_PROVIDER_READINESS.md` 为准。

## OPP read-only HTTP adapter

alpha.16 增加一个 TINP-owned 的只读 OPP HTTP 观察适配器。它固定 vendored OPP source commit、HTTPS、GET、精确 host/path allowlist、单次请求、无 ambient proxy 与已知 Node 环境代理开关、无 credentials、无 redirect、有界 JSON 和显式 response projection，并为 wire body 与 projected response 生成内容根回执。它不复制 OPP 的 CHP/RCP 语义，也不授予 authority。

```powershell
npm run opp-http-readonly -- examples/opp-http-readonly/github-opp-policy.json examples/opp-http-readonly/github-opp-request.json --out <new-result-file.json>
```

本地 `npm test` 和 `npm run verify` 会验证 policy/request/receipt 的正负例；`evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json` 保存一次实际 GitHub `/repos/xingxuling/OPP` 的公开 REST 观察，`evidence/OPP_HTTP_CONSUMER_LIVE_GITHUB_2026-09-12.json` 另保存一次 live consumer 实际运行结果。该结果仍不是 OPP 第三方 consumer bridge、公网可用性、生产凭据或 authority 证据，下一缺口见 `docs/NEXT_GAP.md`。

## OPP consumer bridge CLI

alpha.18 增加文件输入的本机 consumer bridge CLI。它只接受已经生成的 plan、policy、request、read-only observation 和 consumer contract，复用现有 acceptance validator，输出 rooted receipt；不会重新发起网络请求，也不会授予 authority。

alpha.19 将 plan、policy、request、observation 和 consumer contract 绑定为 `twni.opp-http-consumer-bridge-bundle.v1` 单文件，并计算 `bundleRoot`。CLI 可以用 `--bundle <bundle.json>` 直接回放单文件；bundle root 不匹配时失败闭合。 alpha.20 还支持 `--make-bundle ... --out <bundle.json>` 从五份输入生成该 bundle。

```powershell
npm run opp-http-consumer-bridge -- <plan.json> <policy.json> <request.json> <observation.json> <contract.json> --out <new-result-file.json>
```

CLI 的 `PASS` 只表示这组输入在本机通过了 OPP owner、投影字段和 content-root 绑定；`FAIL_CLOSED` 返回退出码 5。它仍不等于独立第三方 consumer 互操作、生产发布或 K400 晋升。

## OPP live consumer

alpha.21 提供一次性 live consumer 入口：它调用本地 OPP CHP/RCP adapter，随后按 policy 对指定 HTTPS/GET endpoint 发起一次只读请求，再输出 consumer contract 与 acceptance receipt。环境中存在已知 proxy 配置、网络错误或 OPP 协商失败时均失败闭合。

```powershell
npm run opp-http-consumer-live -- <policy.json> <request.json> --out <new-live-result.json>
```

该入口不接收凭据、不授予 authority、不重试或跟随重定向；通过只表示这一次本机受约束链路成功，不表示第三方 OPP consumer、生产服务或公网可用性。




