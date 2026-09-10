# TINP alpha.4 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：最终 135/135 测试，零失败、零跳过，源码绑定 154 个文件。普通三节点、持久恢复、未决维护和外部签章分别有UDP/TCP运行见证。命令、时间、PID、签名账本与源哈希见 LOCAL_VERIFICATION.json，不能仅凭本报告宣称完成。

## 现实审计与Owner

从GitHub已核对的alpha.3 / 51225b7继续，候选codex/tinp-operator-v04。先审计真实AAF和未跟踪formal guard，选择只复用固定HEAD的三个clean签章/格式模块，不把完整RNCS formal admission或默认免签evaluator伪装为网络grant。来源blob、checkout换行差异和一行原LICENSE如实保留。原OPP/TINP/RCL及既有证据未改。

AAF owns approval格式与canonical签章，TINP薄adapter核对固定公钥、challenge及严格profile，RCL原退休程序获得已验证operatorAuthorized。RNCS/RFE世界事实与commit保持原Owner；没有Core修改或K400晋升。独立Donor审计直接影响依赖选择和权限声明，独立安全审查落实在八项攻击/崩溃集成测试。

## 实际闭环

本机明确pin signer ID/SPKI DER SHA256后，纯confirmed不能代替外部AAF批准；公钥必须从外部keyring输入且匹配fingerprint。签名身份、approval root、精确role/scope、challenge和最长10分钟的规范时间窗口全部验证。网络checkpoint保存policy指纹，不保存外部keyring或签署私钥。独立测试进程私钥仅存在该进程内存。

真实CLI导出挑战并导入独立签章，在撤销前、三个节点持久确认后、RCL运行后写terminal前再次验证。撤销或到期导致保留pending；已经落盘的历史term使用原准入时间复核，不续租、不重发。当前外部key仍须提供且未撤销，pending已清后的status及startup也会核验外部证据。

八项独立安全用例实际覆盖缺key、替换key、撤销metadata、bool绕过、错身份/范围/挑战、期限、ack后过期/撤销、checkpoint策略降级以及协调器伪造external terminal。另一个协调器在写terminal后被真实终止，并实际等待批准过期后恢复：原lease不变、三节点执行数零，不能用历史批准创建新执行。

真实alpha.3源码包生成受保护未发送状态后，alpha.4读取、启用external pin、拒绝纯确认、取得独立AAF批准并终止；重开保留原主体公钥和lease，旧权限仍拒绝。UPGRADE_VERIFICATION.json和UPGRADE_PROCEDURE.json保留输出及可复核过程，不是手造版本字段的格式测试。

## 边界与交付

首次pin仍为本机信任引导。独立测试signer不是已部署人类身份或硬件托管；外部revoked元数据是受信调用者输入，不是在线撤销注册表。本机历史时间不是独立可信时间戳；全目录/代码旧快照防回滚需外部锚点。当前仍是纯只读计算、Windows回环，非公网或真实异机部署。

九个K400门分别NOT_ADJUDICATED。本机warm交易计时不含签署/DPAPI/维护成本、不代表SLA。源码包排除所有运行状态、密文、锁与私钥；解包CLI演示和GitHub远端提交核对在交付回执记录。只推候选，不合并、部署或运行GitHub Actions。下一最短缺口是外部恢复锚点与受信配置生命周期，见docs/NEXT_GAP.md。
