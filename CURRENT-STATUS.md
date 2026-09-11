# 当前状态

TINP v0.1.0-alpha.20：可选外部 AAF 操作员签章、外部恢复锚点、authority registry 快照、多镜像分发 quorum、历史收敛桥接、本机历史 store、外部收敛见证、跨进程 public-history replay、TCP 与 TLS 1.3 TINP DATA loopback state transfer、可恢复分块传输 journal、策略绑定只读 OPP HTTP 观察适配器的本机候选。

从已核对远端的 alpha.13 / `1aa235d9f5718f87c959e275da10a7bf12d58e9f` 继续，候选分支 `codex/tinp-registry-v07`；alpha.14 实现提交为 `f88798d3a0360eea20eda257126e26755b2a421b`，证据与文档提交为 `bc78af0185c732bb0f7f8b1a848601450db6dd09`，新增 TLS 1.3 TINP DATA 可恢复分块传输、原子接收 journal、接收端重启游标、重复与 chunk/manifest 冲突负例、演示、验证入口与协议注册表记录，完整最终验收以 `evidence/0.1.0-alpha.14/LOCAL_VERIFICATION.json` 的源码哈希、退出码及运行见证为准。

operator-pin 明确固定独立签署方 ID 与 SPKI DER 指纹。启用后，confirmed 不能替代外部 AAF approval；请求/租约/会话/主体/世界/协调器/策略绑定、范围、签名、时间与调用方提供的当前 revoked 状态均检查。外部 keyring 不写 checkpoint，网络端不持有操作员私钥。旧版无 pin 本机夹具兼容，不能把兼容模式冒充外部认证。

先检验授权才撤销；节点确认后及 RCL 之后再次验证，终止证据保留签章与初验/最终验签时刻。恢复只验证历史终态，不重发、不续租；policy、签名历史和 checkpoint 交叉核验。已终止目录的审计/恢复仍需要外部 keyring。

AAF 格式与签章 Owner 保持原项目，RCL 继续拥有固定退休准入，TINP 仅薄适配。无 RNCS world commit 集成、Core 修改或 K400 晋升。新增 Donor 仅复制固定 HEAD 的3个AAF文件及原LICENSE，未动既有 donor。

外部恢复锚点为显式 opt-in：独立见证方签署账本前缀、状态投影和单调序号，调用方每次提供公钥 keyring；完整旧目录回放到已知新锚点之前会失败。锚点私钥不进入网络协调器或 checkpoint，`request` 只读，`accept` 明确记录前缀接纳。authority registry 再以独立 issuer 签署序号链，约束成员 key 的 append-only 轮换/撤销，并可按 recovery-witness 角色导出本次调用的 keyring。alpha.7 的 distribution bundle 要求 caller policy 设定的 distinct mirror 阈值并拒绝签名分叉；alpha.8 的 convergence bundle 对多个 distribution bundle 检查连续序号、前根、重复/分叉快照和稳定镜像集合；alpha.9 的 convergence store 在显式 append 时以目录写者租约和临时文件原子替换保存公开历史，并只允许完整前缀扩展；alpha.10 的 convergence witness 由独立 signer 对完整 store state root 和外部 witness sequence 签名，在保留上一份已验签见证时检测 store/见证替换与回退。

边界：独立测试签署进程不等于真实人类注册或硬件密钥托管；本机时间不是可信外部时间戳；registry、distribution/convergence/store/witness/replay/transfer policy/bundle、issuer/mirror/member/witness keyring、当前 revoked 和最新锚点仍是调用方提供的离线输入，不是在线注册/撤销服务。convergence 只检查调用方提交的有限历史；store 只提供本机单文件原子写入、完整历史前缀检查和本机目录租约；external witness 只有在上一份见证根被独立保留时才能检测结构有效替换，不等于透明日志、跨主机持久收敛或全局冲突处置。alpha.11 的 replay harness 只使用两个独立本机 Node 进程与目录；alpha.12 经既有 TINP DATA framing 和 peer public-key admission 做 TCP loopback 状态交换；alpha.13 再复用同一 framing，通过 caller-pinned 临时证书做 TLS 1.3 loopback 状态交换；alpha.14 在同一 TLS DATA 路径上用原子 public chunk journal 保存游标，接收端重启后续传并拒绝 chunk/manifest 冲突。上述传输证据不能证明两台物理设备注册、生产证书托管、可信时间或生产共识。上次显式锚定后的尾部、代码/配置回滚、真实异机/公网仍未实现。

2026-09-10 的 GitHub 与本地 authority-provider 考古未找到可复用的在线 Owner 服务；交接所需的发布、撤销、可信时间、透明日志、跨主机恢复、密钥托管和 staging 证据已整理到 `docs/AUTHORITY_PROVIDER_READINESS.md` 与 `audit/authority-provider-search-2026-09-10.json`。alpha.14 的 resumable TLS loopback harness 仍是本机压力证据，不解除 `BLOCKED_EXTERNAL_OWNER`，也未改变 RCL Core 或 K400 裁决。alpha.14 verify 已完成 `177/177`，源码清单 `198` 个文件；`sourceTreeRoot=44e8bb7595ba8f17762a25b3c2271fdc9a173c9c79678821d2f0efc57c31dcae`，tests TAP SHA-256=`d8897dd4b78509fc9f70621320b1ccc587d8f063bd8e0a48719ed05da797fb72`，LOCAL_VERIFICATION SHA-256=`6a8935613e244bcbf137b6d93482edd5e70d95625b3c2d7c99ac43680690f927`，EVIDENCE_LEDGER SHA-256=`d3699edc97b6b2a3d7d6de41a955b004a1d12031d41eae5ba7be85ae8285047b`。
当前已合并的 alpha.14 继续保持上述本机可恢复 TLS 证据。alpha.15 候选 `codex/tinp-transport-policy-v02` 在不改变 OPP Owner 的前提下增加只读 HTTPS/JSON transport policy 和 content-rooted receipt：精确 host/path allowlist、GET、单次请求、无 ambient proxy/credentials、无 redirect、有界 JSON、恶意字段/编码/环境形状拒绝，并用显式 `responseFields` 产生 projected response root。GitHub `/repos/xingxuling/OPP` 的实际请求已返回 `PASS`/HTTP 200；它仍只是 TINP provider/transport 候选，不解除公网、跨主机、生产凭据或外部 Owner 边界。

alpha.15 实现提交为 `9a38bb9`，证据与文档提交为 `5f02713`。本机 verify 已完成 `186/186`，源码清单 `201` 个文件；`sourceTreeRoot=4cb785ec6fae1b97a05f6669572d1a288b58993a6ed39e6f0f2fb6136102264b`，tests TAP SHA-256=`b8460a50a5922099f869f346ae4446a46b5149d444c0e7df6cc84ae4156203fb`，LOCAL_VERIFICATION SHA-256=`f12b2cfa39c11297eec3d62f01cb328af5fb2398d3db3566dcc0a0c15fa775c7`，EVIDENCE_LEDGER SHA-256=`26a98f06ff03f49f9f0d33dbee0075137dae4b25fade23bd60c82f80a8df29e2`。确定性 OPP 见证位于 `evidence/0.1.0-alpha.15/opp-http-readonly.json`，一次公网观察仍独立保存在 `evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json`。

合并后状态：`codex/next-internet-v01` 与 `codex/tinp-transport-policy-v03` 已共同指向最新合并提交，并已推送 GitHub。合并后 `npm test` 为 `189/189`（0 fail），日志已固定在 deliverables；alpha.16 包与解包聚焦测试 `15/15`、发行回执均位于 deliverables。状态仍为 `VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED`，公网 OPP 仅有一次独立只读观察，无 authority、生产、异机或 K400 晋升证据。

alpha.17 已合并：codex/next-internet-v01 与 codex/tinp-opp-consumer-v01 已共同指向最新合并提交并推送 GitHub。合并后 npm test 为 195/195（0 fail）；发行包、解包 21/21 聚焦测试、ZIP CRC/敏感文件扫描和交付回执均已生成。当前状态为 VERIFIED_LOCAL_CANDIDATE / NOT_DEPLOYED，本机 consumer acceptance 不等于独立第三方 OPP consumer、生产 authority 或 K400 晋升。

alpha.18 候选已通过本机 verify：`196/196`、源码清单 `204` 个文件，`sourceTreeRoot=3763f3ba8d3a7932607502b5edb824f760cc2eefba43ec6decc9dff40ee469d6`，tests TAP SHA-256=`48d280a3c363332f894a4911738a6c4c588206a563fcadc75ed4e28d613076b3`，LOCAL_VERIFICATION SHA-256=`c942f3887b18bf8b4eb4fa8e74780dbe27ce8542f62bbe59bf2bfcbb2df9271b`，EVIDENCE_LEDGER SHA-256=`7f25c95f2db498d6a1d7ece1f8fe3c354af46eccd62f2ff2ff3d941661ec8b53`。候选提交为 `f88b068`，证据提交为 `c6c873e`；已通过合并提交 `9854627` 合并到 `codex/next-internet-v01` 并推送 GitHub。合并后 npm test 为 `196/196`（0 fail）；发行包、解包 `23/23` 聚焦测试、CLI 文件回放、ZIP CRC/敏感文件扫描和交付回执均已生成。外部第三方 consumer、生产 authority 和 K400 仍保持未证明。

alpha.19 候选已通过本机 verify：`198/198`、源码清单 `204` 个文件，`sourceTreeRoot=173293421bc030ae4ffdb76669c384647f57dbe49ea2c2bb59a877aabd148dc2`，tests TAP SHA-256=`d04026c2ecf75c43a7eaedf51b2edcfddf680d68e3bce325ce8b2d33e3848593`，LOCAL_VERIFICATION 已生成。候选提交为 `f3f9b0f`，已通过合并提交 `39866fb` 合并到 `codex/next-internet-v01` 并推送 GitHub。合并后 npm test 为 `198/198`（0 fail）；发行包、解包 `25/25` 聚焦测试、bundle CLI 回放、ZIP CRC/敏感文件扫描和交付回执均已生成。外部第三方 consumer、生产 authority 和 K400 仍保持未证明。

alpha.20 候选增加 `--make-bundle` CLI 入口，从五份已有输入生成带 `bundleRoot` 的单文件；回放仍保持零网络请求、零 authority。待完成本机 verify、发行包和合并后复测。
