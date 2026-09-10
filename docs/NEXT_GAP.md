# 下一最短真实缺口

alpha.7 在 alpha.6 的 authority registry 之上增加了可选离线分发 bundle：策略固定 registry policy root、镜像公钥指纹和签名阈值；独立 mirror child 对同一 registry root 签 receipt，验证要求不同镜像达到阈值，并拒绝错误 root/sequence、重复镜像、过期 receipt、错误 key 和有效签名分叉。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

下一缺口仍是把离线 registry 与 quorum bundle 接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 policy、registry 文件、issuer/mirror/member keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。alpha.7 只在一个调用内拒绝分叉，不能证明镜像已在线收敛；快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。
