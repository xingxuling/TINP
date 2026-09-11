# TINP alpha.19 集成法院

当前候选裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 198/198，零失败、零跳过，源码清单 204 个文件。alpha.19 在 alpha.18 文件输入 CLI 之上增加 rooted consumer bundle 和单文件回放。

## alpha.19 变化

`twni.opp-http-consumer-bridge-bundle.v1` 把 plan、policy、request、observation 与 consumer contract 绑定在一个 `bundleRoot` 下。`scripts/opp-http-consumer-bridge.mjs --bundle` 复用既有 acceptance validator，输出同一 rooted receipt；bundle 改动会在接受前失败闭合，回放不发起网络请求。

## Owner 与边界

OPP 继续拥有 CHP/RCP 协商语义；TINP 只拥有本地 transport/consumer binding receipt、bundle root 和 CLI 文件边界。该证据证明本机输入集合可被验根和重放，不证明独立第三方 OPP consumer、生产网络、authority、真实设备或 K400 晋升。

## Evidence hashes

- Tests TAP SHA-256: `d04026c2ecf75c43a7eaedf51b2edcfddf680d68e3bce325ce8b2d33e3848593`
- LOCAL_VERIFICATION SHA-256: `8688ebc3ce5a53525f8906f4dd0dc97012ac1d31f678ad4e08b098297f83ad77`
- Evidence ledger SHA-256: `d063861d894194f45943a2afc867fe2533927205fc95fcdd760b4cce030545ee`
- Source tree root: `173293421bc030ae4ffdb76669c384647f57dbe49ea2c2bb59a877aabd148dc2`
- Source files: `204`
- Deterministic OPP/consumer scenario: `evidence/0.1.0-alpha.19/opp-http-consumer-bridge.json`
- Combined OPP scenario: `evidence/0.1.0-alpha.19/opp-http-readonly.json`
- Evidence ledger: `evidence/0.1.0-alpha.19/EVIDENCE_LEDGER.json`
