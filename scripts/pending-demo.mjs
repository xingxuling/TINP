import assert from 'node:assert/strict';
import {InternetSuite} from '../src/suite.mjs';
import {checkpoint} from '../src/coordinator-state.mjs';
import {inspectPending} from '../src/pending-management.mjs';
import {verifyLedger} from '../src/evidence.mjs';

const transport=process.argv[2]||'udp';let suite=await InternetSuite.start({durable:true,transport});
const directory=suite.directory;
try{
  const selection=await suite.discover('C'),request=await suite.buildRequest('演示：仅保存，尚未发送',selection);
  suite.pending={request,selection};checkpoint(suite);
  const leaseRoot=suite.lease.root;await suite.close();
  const before=await inspectPending(directory);assert.equal(before.status,'pending');
  suite=await InternetSuite.start({directory,durable:true,transport,recoveryMode:'maintenance'});
  await assert.rejects(suite.wire('C','INTENT',request,selection.route),/MAINTENANCE_EXECUTION_DISABLED/);
  const retired=await suite.retirePending({requestRoot:before.requestRoot,confirmed:true});
  const stats=await suite.stats();assert.ok(stats.every(n=>n.executions===0&&n.revoked.length===1));
  assert.equal(retired.executionOutcome,'unknown');await suite.close();
  const after=await inspectPending(directory);assert.equal(after.status,'lease-revoked');
  suite=await InternetSuite.start({directory,durable:true,transport});
  await assert.rejects(suite.use('原权限已停用'),/LEASE_REVOKED/);assert.equal(suite.lease.root,leaseRoot);
  console.log(JSON.stringify({status:'VERIFIED_LOCAL_PENDING_RETIREMENT',transport,before,after,retired,
    pids:stats.map(n=>n.pid),zeroExecutions:stats.every(n=>n.executions===0),leaseUnchanged:true,
    ledgerFile:suite.ledger.file,authorityPublicKey:suite.authority.publicKey,evidenceRoot:verifyLedger(suite.ledger.events,{publicKey:suite.authority.publicKey}),
    scope:'Staged unsent pending fixture, actual local node processes and durable revocation. Separate tests cover real coordinator kills.'},null,2));
}finally{await suite.close();}
