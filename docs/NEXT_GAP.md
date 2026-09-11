# 下一最短真实缺口

alpha.10 在 alpha.9 的 authority registry 历史收敛 bundle 和本机历史 store 之上增加了可选外部收敛见证：独立签署方签署 policy root、有限 witness sequence、`historyRoot` 和完整 `storeStateRoot`，验证器复验 store 与底层 registry/distribution/convergence 输入，并在调用方保留上一份已验签见证时拒绝同序号替换和回退。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

alpha.11 在不新增 authority 语义的前提下，复用上述 store/convergence 验证器建立两个独立本机 Node 进程与目录的 public-history replay 压力 harness。它验证公开状态导入、幂等 replay、跨目录扩展，并对同长度签名分叉、镜像集合漂移和序号缺口拒绝后保留原 durable state。这个结果扩大了本机进程/文件系统证据，仍不等于两台物理设备、加密传输或生产冲突共识。

alpha.12 在不新增 authority 语义的前提下，继续复用上述 store/convergence 验证器和既有 TINP `LocalTransport`/`DATA` framing。两个独立本机 transport worker 经 TCP loopback 交换 public store state，B 完成导入、幂等 replay 和 seq3 扩展后反向同步；peer public-key admission、帧/字节计数、篡改载荷拒绝以及冲突后的 durable bytes 保留均有实测证据。这个结果扩大了本机 socket/process/filesystem 证据，仍不等于 TLS、两台物理设备、可信时间或生产冲突共识。

alpha.13 继续复用同一 `LocalTransport`、TINP `DATA` framing 和 store/convergence validators，增加 caller-pinned TLS 1.3 loopback 传输。两个独立本机 worker 使用临时自签名证书完成加密 socket 握手，错误 CA 在 DATA 帧前拒绝；相同的导入、幂等 replay、反向扩展、分叉/镜像漂移/序号缺口/篡改拒绝和 durable bytes 保留均有实测证据。这个结果只扩大本机 TLS/socket/process/filesystem 证据，仍不等于生产证书托管、两台物理设备注册、可信时间或生产冲突共识。

alpha.14 继续复用同一 TLS `LocalTransport`、TINP `DATA` framing 和 store/convergence validators，增加公开 state 的有界分块与原子接收 journal。演示把 state 编为 14 个 chunk，在收到第 7 个后终止接收进程；重启后从持久游标继续 7 个 chunk，完成既有 store append 并把 journal 标为 `committed`。重复 chunk 保持 `unchanged`，同索引数据冲突和同 transfer id 的 manifest/state-root 冲突分别返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT` 与 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT`。这个结果只扩大本机 TLS/socket/process/filesystem 的中断恢复证据，仍不等于两台物理设备、生产证书托管、可信时间或生产冲突共识。
当前未发布候选 `codex/tinp-transport-policy-v01` 在不改变 OPP Owner 的前提下增加只读 HTTPS/JSON transport policy 和 content-rooted receipt。策略绑定 vendored OPP `f7b76582a720d9d18af5153affa0fc2d78bc0410`、精确 host/path、GET、单次请求、无 ambient proxy/credentials、无 redirect，并用显式 `responseFields` 产生 projected response root；GitHub `/repos/xingxuling/OPP` 的实际请求已返回 `PASS`/HTTP 200。下一步是把该外部 receipt 通过显式 OPP consumer bridge 复验，不能将 provider PASS 改称 OPP 通用第三方互操作或生产网络能力。
alpha.14 继续复用同一 TLS `LocalTransport`、TINP `DATA` framing 和 store/convergence validators，增加公开 state 的有界分块与原子接收 journal。演示把 state 编为 14 个 chunk，在收到第 7 个后终止接收进程；重启后从持久游标继续 7 个 chunk，完成既有 store append 并把 journal 标为 `committed`。重复 chunk 保持 `unchanged`，同索引数据冲突和同 transfer id 的 manifest/state-root 冲突分别返回 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT` 与 `AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT`。这个结果只扩大本机 TLS/socket/process/filesystem 的中断恢复证据，仍不等于两台物理设备、生产证书托管、可信时间或生产冲突共识。

当前候选 `codex/tinp-transport-policy-v02` 在不改变 OPP Owner 的前提下增加只读 HTTPS/JSON transport policy 和 content-rooted receipt。策略绑定 vendored OPP `f7b76582a720d9d18af5153affa0fc2d78bc0410`、精确 host/path、GET、单次请求、无 ambient proxy/credentials、无 redirect，并用显式 `responseFields` 产生 projected response root；GitHub `/repos/xingxuling/OPP` 的实际请求已返回 `PASS`/HTTP 200。下一步是把该外部 receipt 通过显式 OPP consumer bridge 复验，不能将 provider PASS 改称 OPP 通用第三方互操作或生产网络能力。

下一缺口仍是把离线 registry、quorum、有限历史 bundle、本机 store 和外部收敛见证接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 policy、registry/convergence/store/witness 文件、issuer/mirror/member/witness keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。alpha.10 能在本机显式写入时保留完整历史前缀，并在上一份见证根被独立保留时检测结构有效的 store 替换、见证同序号替换和回退，但不能证明历史之外的快照已发布、store 与 witness 文件同时未被替换或不同主机在线收敛；快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期、透明日志、见证保留/撤销和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。2026-09-10 的 GitHub 与本地考古没有找到可复用的 authority 服务，具体 Owner 交接条件见 [`docs/AUTHORITY_PROVIDER_READINESS.md`](AUTHORITY_PROVIDER_READINESS.md)，机器记录见 [`audit/authority-provider-search-2026-09-10.json`](../audit/authority-provider-search-2026-09-10.json)。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。
