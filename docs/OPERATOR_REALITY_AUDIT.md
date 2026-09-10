# alpha.4 现实审计与复用裁决

本轮初始TINP工作树干净：codex/tinp-pending-v03，HEAD与远端同名分支均51225b7048ccc3b1eb9d2c8122c6012525486cb4；GitHub仓库私有，未发现打开的PR。读取当前状态、源码、测试与Ownership后创建codex/tinp-operator-v04，未修改默认分支。

原缺口是operatorAuthorized来自同用户显式确认，没有独立签章。先审计现有RNCS/AAF，而非建立新authority中心。Donor目录C:/Users/User/Documents/RCL/_worktrees/rncs-rcl-formal-gate-v01，HEAD d345ecb9d8801a911f37534f40d7b9fdf5badb16，分支codex/rncs-rcl-formal-gate-v01；该工作树有大量既有改动，formal guard是未跟踪候选，不作为已发布通用接口。

可复用的AAF canonical.mjs、contracts.mjs、signatures.mjs和LICENSE均tracked/clean，仅依赖node:crypto与彼此。checkout为CRLF而git blob为LF；本轮按固定git show HEAD原始字节复制，并保存blob、SHA256、checkout差异于vendor/aaf/PROVENANCE.json。没有修改Donor、引入完整依赖树或复制未跟踪候选。

## 不等价与薄适配

原AAF verifyApproval负责格式与approval_root，verifySignedObject负责签名。它们不同时保证受信公钥指纹、signer=approver、role/scope、时间与撤销配置。完整evaluator默认可免签，不能直接当成TINP外部操作员门。新适配器调用原验根/验签函数，并严格检查profile。TINP挑战仅是本profile的proposal_root，不等价RNCS世界提案或完整commit授权。

RCL原退休Profile已有operatorAuthorized事实入口，无需新原语。真实外部批准在撤销前、确认后与记录前核验，RCL获得已验证观测。网络端只存operatorPolicy指纹，不生成或读取操作员私钥；独立测试signer持有自己的临时私钥。生产人类身份、设备托管、时钟和防回滚没有由测试身份代替。

## 新裁决与回滚

选择可选固定策略以保留已有无pin夹具，启用后不得通过当前API降级。策略与所有恢复快照、pin事件及checkpoint交叉验证；历史终态已清pending后也要验证外部签章。当前keyring撤销标志来自调用方受信配置，不宣称在线注册表接入。

回滚是保留旧源码分支/包并停止使用候选，不通过清目录或还原旧checkpoint复活被撤销lease。完整旧目录与旧代码同时回放仍需独立锚点，明确保留为下一真实缺口。新增代码与测试不迁移AAF/RNCS/RFE Owner，不晋升RCL Core或K400。
