import json,hashlib
from pathlib import Path
old=json.loads(Path('evidence/0.1.0-alpha.17/EVIDENCE_LEDGER.json').read_text(encoding='utf-8'))
new=old
new['format']='twni.delivery-evidence-ledger.v0.18'; new['version']='0.1.0-alpha.18'
ver=json.loads(Path('evidence/0.1.0-alpha.18/LOCAL_VERIFICATION.json').read_text(encoding='utf-8'))
new['tests']=ver['tests']; new['tests']['stdout']='evidence/0.1.0-alpha.18/tests.tap'; new['tests']['stderr']='evidence/0.1.0-alpha.18/tests.stderr.txt'
new['verificationFile']='evidence/0.1.0-alpha.18/LOCAL_VERIFICATION.json'; new['verificationSha256']=hashlib.sha256(Path('evidence/0.1.0-alpha.18/LOCAL_VERIFICATION.json').read_bytes()).hexdigest(); new['sourceTreeRoot']=ver['sourceTreeRoot']; new['sourceFileCount']=len(ver['sourceFiles']); new['startedAt']=ver['startedAt']; new['finishedAt']=ver['finishedAt']
new['baseline']={'commit':'fda4786','ledger':'evidence/0.1.0-alpha.17/EVIDENCE_LEDGER.json','sha256':hashlib.sha256(Path('evidence/0.1.0-alpha.17/EVIDENCE_LEDGER.json').read_bytes()).hexdigest()}
new['change']['owner']='TINP authority-registry host adapter plus policy-bound OPP HTTP observation, explicit local OPP consumer acceptance binding and replayable file-input CLI'
new['change']['bridge']=new['change']['bridge']+' The alpha.18 CLI replays supplied files in a subprocess and writes an exclusive output file; it does not issue another network request.'
new['change']['oppHttpFormat']='twni.opp-http-readonly-run.v1'; new['change']['cliFormat']='twni.opp-http-consumer-bridge-run.v1'
new['externalActions']['candidatePush']='PENDING final status pin and packaging'; new['externalActions']['candidateBranch']='codex/tinp-opp-consumer-cli-v01'; new['externalActions']['candidateCommit']='f88b068'; new['externalActions']['merge']='NOT_RUN'
new['nextGap']='External third-party OPP consumer acceptance plus production authority registry publication, trusted time, transparent audit, lost-key recovery and durable cross-device convergence'
# Keep alpha18-only evidence additions explicit.
new['limits'].append('The consumer bridge CLI replays caller-supplied files and writes an exclusive rooted result; it does not make another network request or prove independent third-party interoperability')
Path('evidence/0.1.0-alpha.18/EVIDENCE_LEDGER.json').write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
PY
@'
# TINP alpha.18 集成法院

当前候选裁决 **VERIFIED_LOCAL_CANDIDATE**：完整验证为 196/196，零失败、零跳过，源码清单 204 个文件。alpha.18 在 alpha.17 本机 consumer acceptance binding 之上增加文件输入 CLI，并用真实 Node 子进程回放五份输入文件。

## alpha.18 变化

`scripts/opp-http-consumer-bridge.mjs` 读取已经生成的 plan、policy、request、read-only observation 与 consumer contract，复用 `acceptOppHttpReadonlyConsumer`，输出 `twni.opp-http-consumer-bridge-run.v1` 和 rooted acceptance receipt。CLI 不重新发起 HTTP 请求，`PASS` 退出码为 0，producer fail-closed 仍保留失败闭合语义，输出文件使用独占创建。

## Owner 与边界

OPP 继续拥有 CHP/RCP 协商语义；TINP 只拥有本地 transport/consumer binding receipt 与 CLI 文件边界。该证据证明本机一组具体输入可以被重放和验根，不证明独立第三方 OPP consumer、生产网络、authority、真实设备或 K400 晋升。

## Evidence hashes

- Tests TAP SHA-256: `48d280a3c363332f894a4911738a6c4c588206a563fcadc75ed4e28d613076b3`
- LOCAL_VERIFICATION SHA-256: `c942f3887b18bf8b4eb4fa8e74780dbe27ce8542f62bbe59bf2bfcbb2df9271b`
- Evidence ledger SHA-256: 7f25c95f2db498d6a1d7ece1f8fe3c354af46eccd62f2ff2ff3d941661ec8b53
- Source tree root: `3763f3ba8d3a7932607502b5edb824f760cc2eefba43ec6decc9dff40ee469d6`
- Source files: `204`
- Deterministic OPP/consumer scenario: `evidence/0.1.0-alpha.18/opp-http-consumer-bridge.json`
- Combined OPP scenario: `evidence/0.1.0-alpha.18/opp-http-readonly.json`
- Evidence ledger: `evidence/0.1.0-alpha.18/EVIDENCE_LEDGER.json`
