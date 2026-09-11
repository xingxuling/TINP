# TINP alpha.17 集成法院

当前裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 195/195，零失败、零跳过，源码清单 203 个文件。alpha.17 在只读 OPP HTTP policy/receipt 之上加入本机 consumer acceptance binding。

## alpha.17 变化

本轮复用真实 OPP CHP/RCP child adapter 的 accepted 协商结果，将 OPP capability agreement、TINP HTTP policy/request、producer receipt、consumer contract 与 projected response root 绑定为 `twni.opp-http-consumer-bridge-receipt.v1`。桥接器拒绝 owner/capability/projection 不一致、未重算的 capability root、re-rooted response 和 producer fail-open；所有 acceptance receipt 都保持 `authorityGranted:false`、`sideEffects:false`。

## Owner 与边界

OPP 继续拥有 CHP/RCP 协商语义；TINP 只拥有本地 transport/consumer binding receipt。该证据证明本机一次具体消费者接受，不证明独立第三方 OPP consumer、生产网络、authority、真实设备或 K400 晋升。

## Evidence hashes

- Tests TAP SHA-256: `4bad4e4d73a93535158573dc154237722ed2c2690f69c041982726ab230f82cd`
- LOCAL_VERIFICATION SHA-256: `bc0f214593779e5de2df8395716967385d19a3679ab53f4838830e063de4da7c`
- Evidence ledger SHA-256: `3ee0dbc03aaf09e8146b7846f73ae35361a62a98145a46923ee512fd73577df4`
- Source tree root: `ff3f784e895ec3583b6c32e780005f23688b4d0ebfada5f1370ce31c7b06a8c4`
- Source files: `203`
- Deterministic OPP/consumer scenario: `evidence/0.1.0-alpha.17/opp-http-consumer-bridge.json`
- Combined OPP scenario: `evidence/0.1.0-alpha.17/opp-http-readonly.json`
- Evidence ledger: `evidence/0.1.0-alpha.17/EVIDENCE_LEDGER.json`
