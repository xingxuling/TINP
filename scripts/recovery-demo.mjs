import {InternetSuite} from '../src/suite.mjs';
import {verifyLedger} from '../src/evidence.mjs';
const transport=process.argv[2]||'udp';
const first=await InternetSuite.start({durable:true,transport});let restored;
try{
  const a=await first.use('重启前🌏');const before=await first.stats();
  await first.nodes.get('C').kill();await first.restartNode('C');const after=await first.stats();
  const sessionId=first.session.body.sessionId,expiresAtMs=first.lease.body.expiresAtMs,key=first.subjectIdentity.publicKey;
  await first.close();
  restored=await InternetSuite.start({durable:true,transport,directory:first.directory});
  const b=await restored.use('恢复后🌏');await restored.revoke();
  const directory=restored.directory;await restored.close();
  restored=await InternetSuite.start({durable:true,transport,directory});
  let rejected=false;try{await restored.use('撤销后应拒绝');}catch(e){rejected=e.code==='LEASE_REVOKED';}
  const result={状态:'VERIFIED_LOCAL_RECOVERY_DEMO',transport,authorityPublicKey:restored.authority.publicKey,ledgerFile:restored.ledger.file,原结果:a.result,恢复后结果:b.result,
    目标节点旧进程:before.find(x=>x.nodeId==='C').pid,目标节点新进程:after.find(x=>x.nodeId==='C').pid,
    历史执行数保留:after.find(x=>x.nodeId==='C').executions===before.find(x=>x.nodeId==='C').executions,
    主体密钥保留:restored.subjectIdentity.publicKey===key,会话保留:restored.session.body.sessionId===sessionId,
    未自动续租:restored.lease.body.expiresAtMs===expiresAtMs,撤销后重启仍拒绝:rejected,
    已验证证据根:verifyLedger(restored.ledger.events,{publicKey:restored.authority.publicKey}),
    状态目录:directory,范围:'Windows当前用户、本机真实进程；非公网、非整目录防回滚证明'};
  if(!result.历史执行数保留||!result.主体密钥保留||!result.会话保留||!result.未自动续租||!result.撤销后重启仍拒绝)throw new Error('RECOVERY_DEMO_FAILED');
  console.log(JSON.stringify(result,null,2));
}finally{await first.close();await restored?.close();}
