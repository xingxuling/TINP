# 下一最短真实缺口

alpha.10 在 alpha.9 的 authority registry 历史收敛 bundle 和本机历史 store 之上增加了可选外部收敛见证：独立签署方签署 policy root、有限 witness sequence、`historyRoot` 和完整 `storeStateRoot`，验证器复验 store 与底层 registry/distribution/convergence 输入，并在调用方保留上一份已验签见证时拒绝同序号替换和回退。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

alpha.11 在不新增 authority 语义的前提下，复用上述 store/convergence 验证器建立两个独立本机 Node 进程与目录的 public-history replay 压力 harness。它验证公开状态导入、幂等 replay、跨目录扩展，并对同长度签名分叉、镜像集合漂移和序号缺口拒绝后保留原 durable state。这个结果扩大了本机进程/文件系统证据，仍不等于两台物理设备、加密传输或生产冲突共识。

alpha.12 在不新增 authority 语义的前提下，继续复用上述 store/convergence 验证器和既有 TINP `LocalTransport`/`DATA` framing。两个独立本机 transport worker 经 TCP loopback 交换 public store state，B 完成导入、幂等 replay 和 seq3 扩展后反向同步；peer public-key admission、帧/字节计数、篡改载荷拒绝以及冲突后的 durable bytes 保留均有实测证据。这个结果扩大了本机 socket/process/filesystem 证据，仍不等于 TLS、两台物理设备、可信时间或生产冲突共识。

alpha.13 继续复用同一 `LocalTransport`、TINP `DATA` framing 和 store/convergence validators，增加 caller-pinned TLS 1.3 loopback 传输。两个独立本机 worker 使用临时自签名证书完成加密 socket 握手，错误 CA 在 DATA 帧前拒绝；相同的导入、幂等 replay、反向扩展、分叉/镜像漂移/序号缺口/篡改拒绝和 durable bytes 保留均有实测证据。这个结果只扩大本机 TLS/socket/process/filesystem 证据，仍不等于生产证书托管、两台物理设备注册、可信时间或生产冲突共识。

alpha.14 继续复用同一 TLS `LocalTransport`、TINP `DATA` framing 和 store/convergence validators，增加公开 state 的有界分块与原子接收 journal。演示把 state 编为 14 个 chunk，在收到第 7 个后终止接收进程；重启后从持久游标继续 7 个 chunk，完成既有 store append 并把 journal 标为 `committed`。重复 chunk 保持 `unchanged`，同索引数据冲突和同 transfer id 的 manifest/state-root 冲突分别返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT` 与 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT`。这个结果只扩大本机 TLS/socket/process/filesystem 的中断恢复证据，仍不等于两台物理设备、生产证书托管、可信时间或生产冲突共识。
alpha.15 在不改变 OPP Owner 的前提下把只读 HTTPS/JSON transport policy 固化为 TINP-owned adapter。它绑定 vendored OPP `f7b76582a720d9d18af5153affa0fc2d78bc0410`，执行精确 host/path allowlist、GET、单次请求、无 ambient proxy/credentials、无 redirect、有界 JSON、显式 `responseFields` projection，并生成 wire/projected content roots 与可校验 receipt。新增的 policy/receipt 正负例、恶意字段/路径编码/环境形状拒绝和确定性 verify 见证均在本机通过；`evidence/OPP_HTTP_READONLY_GITHUB_2026-09-11.json` 另保存一次实际 GitHub `/repos/xingxuling/OPP` REST 观察。该结果仍不是 OPP consumer bridge、公网可用性、生产凭据或 authority 证据。

下一缺口仍是把离线 registry、quorum、有限历史 bundle、本机 store 和外部收敛见证接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 policy、registry/convergence/store/witness 文件、issuer/mirror/member/witness keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。alpha.10 能在本机显式写入时保留完整历史前缀，并在上一份见证根被独立保留时检测结构有效的 store 替换、见证同序号替换和回退，但不能证明历史之外的快照已发布、store 与 witness 文件同时未被替换或不同主机在线收敛；快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期、透明日志、见证保留/撤销和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。2026-09-10 的 GitHub 与本地考古没有找到可复用的 authority 服务，具体 Owner 交接条件见 [`docs/AUTHORITY_PROVIDER_READINESS.md`](AUTHORITY_PROVIDER_READINESS.md)，机器记录见 [`audit/authority-provider-search-2026-09-10.json`](../audit/authority-provider-search-2026-09-10.json)。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。

alpha.16 在 alpha.15 的只读 OPP policy/receipt 之上补齐已知 Node 环境代理开关（环境变量、NODE_OPTIONS 与 execArgv）的 fail-closed 检查，保留字面量 `__proto__` projection 的安全对象语义，并强化 PASS/FAIL receipt 一致性。新增确定性负例与本机 verify 见证；动态全局 dispatcher 仍不可观测，公网观察仍只是单次 provider 输出。下一缺口仍是显式 OPP consumer bridge 与真实 authority Owner，不解除生产凭据、跨主机或 K400 边界。

alpha.17 已实现 TINP-owned 的本机 OPP consumer acceptance binding：复用真实 OPP CHP/RCP accepted 协商，把 consumer contract、HTTP policy/request、producer receipt 与 projected response root 固定到新的 rooted acceptance receipt。它证明本机这一次具体消费者接受，不等于独立第三方 OPP consumer、公网部署或生产 authority。下一缺口收窄为外部 Owner 对该 bridge 的实际 consumer acceptance 与生产发布/撤销服务。

alpha.18 将同一 acceptance binding 暴露为文件输入 CLI。CLI 只读取已经生成的 plan、policy、request、observation 和 consumer contract，复用全部 root/owner/projection 校验并写出 bounded receipt；它不会重新发起请求，也不会把本机脚本运行当作第三方互操作。下一缺口仍是外部 Owner 的实际 consumer acceptance、生产发布/撤销与真实异机验证。

alpha.19 将五份 consumer 输入绑定为带 `bundleRoot` 的单文件 bundle，并让 CLI 直接回放该 bundle。它提升输入集合的可审计性，但仍是本机验证；下一缺口仍是外部 Owner 的实际 consumer acceptance、生产发布/撤销与真实异机验证。


alpha.20 增加 `--make-bundle` 生成入口，让五份已经验签的输入可以形成带 `bundleRoot` 的单文件后再回放。它补齐本机 bundle 的生成/回放闭环；下一缺口仍是外部 Owner 的实际 consumer acceptance、生产发布/撤销与真实异机验证。

alpha.21 增加 live consumer orchestration：单次调用复用真实 OPP CHP/RCP accepted 协商，执行一条显式 HTTPS/GET policy 下的只读观测，并把 producer receipt 与 consumer contract 绑定为 acceptance receipt。确定性 fetch、ambient proxy 拒绝、未加根请求和完整回归均已通过；该结果仍只证明本机候选链路，不证明独立第三方 consumer、生产 authority、真实异机或公网可用性。下一缺口仍是外部 Owner 的发布/撤销和真实异机 consumer acceptance。
