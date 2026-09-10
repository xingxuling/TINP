# 当前状态

TINP v0.1.0-alpha.9：可选外部 AAF 操作员签章、外部恢复锚点、authority registry 快照、多镜像分发 quorum、历史收敛桥接与本机历史 store 的本机候选。

从已核对远端的 alpha.8 / `e03e25eaf9ce6a0b772f8cb9a019731d6a0187d8` 继续，候选分支 `codex/tinp-registry-v06`。本轮增加 `twni.authority-registry-convergence-store.v1`，完整最终验收以 `evidence/0.1.0-alpha.9/LOCAL_VERIFICATION.json` 的源码哈希、退出码及运行见证为准。

operator-pin 明确固定独立签署方 ID 与 SPKI DER 指纹。启用后，confirmed 不能替代外部 AAF approval；请求/租约/会话/主体/世界/协调器/策略绑定、范围、签名、时间与调用方提供的当前 revoked 状态均检查。外部 keyring 不写 checkpoint，网络端不持有操作员私钥。旧版无 pin 本机夹具兼容，不能把兼容模式冒充外部认证。

先检验授权才撤销；节点确认后及 RCL 之后再次验证，终止证据保留签章与初验/最终验签时刻。恢复只验证历史终态，不重发、不续租；policy、签名历史和 checkpoint 交叉核验。已终止目录的审计/恢复仍需要外部 keyring。

AAF 格式与签章 Owner 保持原项目，RCL 继续拥有固定退休准入，TINP 仅薄适配。无 RNCS world commit 集成、Core 修改或 K400 晋升。新增 Donor 仅复制固定 HEAD 的3个AAF文件及原LICENSE，未动既有 donor。

外部恢复锚点为显式 opt-in：独立见证方签署账本前缀、状态投影和单调序号，调用方每次提供公钥 keyring；完整旧目录回放到已知新锚点之前会失败。锚点私钥不进入网络协调器或 checkpoint，`request` 只读，`accept` 明确记录前缀接纳。authority registry 再以独立 issuer 签署序号链，约束成员 key 的 append-only 轮换/撤销，并可按 recovery-witness 角色导出本次调用的 keyring。alpha.7 的 distribution bundle 要求 caller policy 设定的 distinct mirror 阈值并拒绝签名分叉；alpha.8 的 convergence bundle 对多个 distribution bundle 检查连续序号、前根、重复/分叉快照和稳定镜像集合；alpha.9 的 convergence store 在显式 append 时以目录写者租约和临时文件原子替换保存公开历史，并只允许完整前缀扩展。

边界：独立测试签署进程不等于真实人类注册或硬件密钥托管；本机时间不是可信外部时间戳；registry、distribution/convergence policy/bundle、issuer/mirror/member keyring、当前 revoked 和最新锚点仍是调用方提供的离线输入，不是在线注册/撤销服务。convergence 只检查调用方提交的有限历史；store 只提供本机单文件原子写入、完整历史前缀检查和本机目录租约，不等于透明日志、跨主机持久收敛或全局冲突处置。上次显式锚定后的尾部、代码/配置回滚、真实异机/公网仍未实现。未合并、未部署、未运行 GitHub Actions，候选推送与归档哈希见本版交付回执。
