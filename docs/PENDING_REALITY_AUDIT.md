# alpha.3 现实审计与裁决

本轮开始时本地工作树干净，分支 codex/tinp-recovery-v02；本地 HEAD 与 GitHub 同名分支均为 06d5f5de88a6e061e3c7a7a5ddbb2108d437fbdf。远端 xingxuling/TINP 私有，未发现打开的 PR。本轮创建 codex/tinp-pending-v03。读取 CURRENT-STATUS、NEXT_GAP、suite/coordinator/node 恢复实现及现有测试后才修改源码。

## 观察

alpha.2 已持久保存会话、撤销及回执，strict start 遇 RECEIPT_NOT_FOUND 会失败并关闭节点，因此用户不能进入服务查询或处置。缓存查询已有独立 RECEIPT_LOOKUP，具备复用条件。协调器与节点写锁、DPAPI、签名账本及 RCL compiler/runtime 均无需重建。

## 裁决

复用历史回执查询，不新增执行重试协议。新增只读状态投影与不激活 Provider 的维护模式；显式关闭未知请求要撤销整个旧 lease，得到全部节点签名持久 ack 后，经固定 RCL Profile 裁决，先记录terminal再清状态。Node 负责真实步骤与签名检查，RCL拥有准入不变量。操作员限当前 Windows 用户，未伪造独立人类签发系统。

## 原假设与修正

原假设：重算 RCL allowed 且程序/状态根一致足以恢复终态。独立攻击验证：仅篡改已记录 factsRoot 仍被接受。新裁决：记录code/factsRoot也必须与真实重算结果一致。回归已纳入；具体最终结果见版本证据。回滚方式为保留原分支和源码包，候选不覆盖默认分支。已持久撤销的 lease 不通过版本回滚自动复活。

原有 OPP/TINP/RCL donor、constitution 与旧 evidence 原样保留。没有合并 owner、修改 Core、构建云 CI 或接入公网。新增可复用压力案例与平台/authority缺口见 RCL_STRESS_AND_GAPS、PENDING_OWNER、PENDING_SECURITY_COURT。
