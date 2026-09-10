# 下一最短真实缺口

alpha.6 在 alpha.5 的外部恢复锚点之上接入了可选 authority registry：独立 issuer 进程签署 registry policy 和 seq1→seq2 快照，快照保存 issuer/成员公钥指纹、append-only predecessor、epoch、角色子集和 revoked 状态；恢复锚点 CLI 可显式验证快照后按 recovery-witness 导出调用方 keyring。独立测试 issuer 不向网络运行端提供私钥，成员私钥也不进入 registry 或 checkpoint。此实现仍不等于完整 RNCS world grant、真实人类身份注册或生产反回滚服务。

下一缺口是把离线 registry 快照接到真实 authority Owner 的发布、撤销、丢失恢复和跨主机收敛：当前 registry 文件、issuer keyring、成员 keyring、时间和锚点仍由调用方选择，未有在线认证发布/撤销服务、可信时钟、硬件保管、透明日志或两台真实设备的加密恢复。快照后的本地尾部、代码/配置回滚也不在外部见证范围。需要先确定生产 Owner、密钥生命周期和冲突/分叉处置，再验证断网、旧配置、issuer 撤销、成员轮换和跨设备恢复。

不能以测试生成的身份冒充用户真实凭据，也不能自动为用户指定生产 Owner。没有相应外部服务、真实设备和人工密钥托管证据前，状态保持候选。

现有RCL表达能力仍足够。本轮将操作员认证结果作为已校验观测传给原退休Profile，无Core新原语，无K400晋升。RNCS/RFE世界事实、AAF批准格式和TINP网络装配各保持单一Owner。
