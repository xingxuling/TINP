# 下一最短真实缺口

alpha.9 在 alpha.8 的 authority registry 历史收敛 bundle 之上增加了可选本机历史 store：只保存公开的 distribution bundles 与 `historyRoot`，显式 append 先复验完整历史，再通过目录写者租约和临时文件原子替换落盘；相同历史幂等，回退、旧前缀改写、root/policy 篡改和私钥材料 fail closed。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

下一缺口仍是把离线 registry、quorum、有限历史 bundle 和本机 store 接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 policy、registry/convergence 文件、issuer/mirror/member keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。alpha.9 能在本机显式写入时保留完整历史前缀并拒绝本地回退/改写，但不能证明历史之外的快照已发布、store 文件未被整体替换或不同主机在线收敛；快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期、透明日志和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。
