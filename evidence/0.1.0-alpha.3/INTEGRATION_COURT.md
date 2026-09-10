# TINP alpha.3 集成法院

裁决 **VERIFIED_LOCAL_CANDIDATE**：最终完整测试 113/113，零失败、零跳过；绑定 142 个源码/测试/脚本/依赖文件。真实 UDP/TCP 三节点承载、原持久恢复及新未决维护均有公开签名账本见证。最终源哈希、命令、运行时间和进程编号见 LOCAL_VERIFICATION.json。

本轮从已核对的 alpha.2 远端 06d5f5d 继续，候选 codex/tinp-pending-v03。现实审计见 docs/PENDING_REALITY_AUDIT.md。复用原 OPP/RCL/TINP、DPAPI、写锁、历史回执查询和证据链；donor/constitution/旧证据不变。没有世界 owner 迁移、RCL Core 修改、公开发布或云 CI。

## 已实现与真实裁决

只读 status 不启动节点，不写checkpoint/账本，不返回原文/私钥；不创建不存在的状态路径。明确 nodeCacheVerified:false，在线文件变动时要求重试。maintenance 不激活 Provider，高层 INTENT 与底层转发旁路、节点重启后执行均拒绝。

reconcile 只查询真实原回执；没有回执时维持 pending。retire 必须明确确认并提供当前完整请求根，先持久撤销整个旧 lease，再获取固定 A/B/C 三份签名确认，验证其 watermark/epoch/lease 绑定，实际 RCL 准入后写terminal，再清 pending。节点撤销与执行串行排队，避免确认时仍有旧准入执行悬而未决。结果保留 unknown，不造新 lease、不推断从未执行。

独立安全审查实际推动维护模式防activate绕过、三节点完整证明、terminal 前缀及后缀恢复、pending路由全对象绑定，并复现和修复只伪造 factsRoot 仍被接受的缺陷。最终回归覆盖这些攻击。两项独立协调器真实 kill 测试确认 terminal 已写但 pending 未清的两个窗口均不重发、不复制终态、不更新租约。

另用哈希固定的真实 alpha.2 源码包产生受保护未发送状态，再由 alpha.3 检查、处置、重开：原主体公钥与 lease root 保持，所有节点执行数零、旧租约仍拒绝。见 UPGRADE_VERIFICATION.json；这不是伪造旧版 JSON 的格式测试。

## 三剖面与 Owner

退化：原路径/节点/Provider故障、隔离和恢复回归保留，新增处置中再次崩溃。商用：版本升级、审计终态与签名持久确认。生活：明确中文维护说明与可复制命令，复杂度由节点协调过程承担。独立 RCL Profile 审查以 32 组布尔/根组合及恶意输入验证真实语言执行，宿主仍负责操作员/存储/签名事实。

Windows 当前用户明确启动 CLI 是本机夹具的操作边界，未声称生产独立人类认证。九个 K400 门分别 NOT_ADJUDICATED。性能数字仅普通临时模式的本机20样本，不含维护/DPAPI成本，不能作为商业 SLA。

## 交付与未完成

源码包排除运行状态、私钥、DPAPI文件和锁；解包运行与远端 SHA 核对记入交付回执。候选分支推送不等于合并、部署或公开发行；许可边界见 docs/LICENSE_AUDIT.md。

仍缺独立操作员 authority/恢复锚点、全目录防回滚、全网撤销收敛、真实异机加密承载、通用副作用事务。下一最短缺口见 docs/NEXT_GAP.md。本轮满足可运行闭环，未将本机测试升格为公网或生产完成。
