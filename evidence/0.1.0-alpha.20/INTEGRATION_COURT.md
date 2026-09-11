# TINP alpha.20 集成法院

当前候选裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 199/199，零失败、零跳过，源码清单 204 个文件。alpha.20 在 alpha.19 rooted bundle 回放之上增加 bundle 生成 CLI。

## alpha.20 变化

`scripts/opp-http-consumer-bridge.mjs --make-bundle` 读取五份已有 plan、policy、request、observation 与 consumer contract 文件，复用 canonical bundle constructor，使用独占输出写入 `twni.opp-http-consumer-bridge-bundle.v1` 和 `bundleRoot`。生成结果再通过 bundle validator；该过程不发起网络请求。

## Owner 与边界

OPP 继续拥有 CHP/RCP 协商语义；TINP 只拥有本地 consumer receipt、bundle root 和 CLI 文件边界。该证据证明本机 bundle 可以生成并回放，不证明独立第三方 OPP consumer、生产网络、authority、真实设备或 K400 晋升。

## Evidence hashes

- Tests TAP SHA-256: `ffb942a35d09a861db82ef13f6b8bf9b9ccb1ac5f3ed765033217c038294b495`
- LOCAL_VERIFICATION SHA-256: `7d95da3019178ef6addffaad9c2d32b809ec2d28f43b55c829eab99357f85c06`
- Evidence ledger SHA-256: `7a8f860dcd24eb905e4c123c94a1d18c74dbe685688b54666cb74e4042017518`
- Source tree root: `976aabbcc045593c8db88c8d1d1de30cfbf9538eea86a193f32e7f768973a88b`
- Source files: `204`
- Deterministic OPP/consumer scenario: `evidence/0.1.0-alpha.20/opp-http-consumer-bridge.json`
- Combined OPP scenario: `evidence/0.1.0-alpha.20/opp-http-readonly.json`
- Evidence ledger: `evidence/0.1.0-alpha.20/EVIDENCE_LEDGER.json`
