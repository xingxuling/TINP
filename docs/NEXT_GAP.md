# 下一最短真实缺口

alpha.10 在 alpha.9 的 authority registry 历史收敛 bundle 和本机历史 store 之上增加了可选外部收敛见证：独立签署方签署 policy root、有限 witness sequence、`historyRoot` 和完整 `storeStateRoot`，验证器复验 store 与底层 registry/distribution/convergence 输入，并在调用方保留上一份已验签见证时拒绝同序号替换和回退。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

下一缺口仍是把离线 registry、quorum、有限历史 bundle、本机 store 和外部收敛见证接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 policy、registry/convergence/store/witness 文件、issuer/mirror/member/witness keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。alpha.10 能在本机显式写入时保留完整历史前缀，并在上一份见证根被独立保留时检测结构有效的 store 替换、见证同序号替换和回退，但不能证明历史之外的快照已发布、store 与 witness 文件同时未被替换或不同主机在线收敛；快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期、透明日志、见证保留/撤销和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。2026-09-10 的 GitHub 与本地考古没有找到可复用的 authority 服务，具体 Owner 交接条件见 [`docs/AUTHORITY_PROVIDER_READINESS.md`](AUTHORITY_PROVIDER_READINESS.md)，机器记录见 [`audit/authority-provider-search-2026-09-10.json`](../audit/authority-provider-search-2026-09-10.json)。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。
