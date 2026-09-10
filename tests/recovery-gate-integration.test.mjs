import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {InternetSuite} from '../src/suite.mjs';
import {initializeRecovery,admitRecovery,checkpoint,publicRecoveryState} from '../src/coordinator-state.mjs';
import {seal,clone} from '../src/identity.mjs';
import {EvidenceLedger} from '../src/evidence.mjs';

function directoryFor(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tinp-recovery-gate-'));
  t.recoveryCleanups=[];
  t.after(async()=>{
    for(const cleanup of t.recoveryCleanups)await cleanup();
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('tinp-recovery-gate-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  return directory;
}
async function checkpointFixture(t) {
  const directory=directoryFor(t),suite=new InternetSuite({directory,durable:true});
  t.recoveryCleanups.push(()=>suite.close());
  await initializeRecovery(suite);
  suite.record('test.checkpoint',{testOnly:true});
  return suite;
}
function baseline(suite) {
  return {lease:clone(suite.lease),revocationEpoch:suite.revocationEpoch,ledgerLength:suite.ledger.events.length,ledgerRoot:suite.ledger.root};
}
function witnessed(result) {
  assert.equal(result.code,'RCL_RECOVERY_ALLOWED');
  assert.equal(result.allowed,true);
  assert.equal(result.history.length,2);
  assert.ok(result.history.some(event=>event.witnesses?.includes('next-internet:rcl-state-recovery')));
  for(const key of ['programRoot','stateRoot','sourceSha256','factsRoot'])assert.match(result[key],/^[a-f0-9]{64}$/);
}

test('actual recovery caller witnesses admission and independently denies checkpoint root, epoch and lease expansion',async t=>{
  const suite=await checkpointFixture(t),before=baseline(suite);
  witnessed(await admitRecovery(suite,before));
  await assert.rejects(admitRecovery(suite,{...before,ledgerRoot:'f'.repeat(64)}),/RCL_RECOVERY_DENIED/);
  await assert.rejects(admitRecovery(suite,{...before,revocationEpoch:1}),/RCL_RECOVERY_DENIED/);
  const original=suite.lease;
  suite.lease=seal({...original.body,expiresAtMs:original.body.expiresAtMs+1},suite.authority.privateKey);
  await assert.rejects(admitRecovery(suite,before),/RCL_RECOVERY_DENIED/);
  suite.lease=original;
});

test('actual recovery caller rejects correctly signed session scope, identity, world and expiry violations before RCL',async t=>{
  const suite=await checkpointFixture(t),before=baseline(suite);
  await suite.bindSession('C');
  const original=suite.session;
  for(const patch of [{subjectId:'subject:intruder'},{worldId:'world:intruder'},{continuityRoot:'continuity:other'},
    {leaseRoot:'f'.repeat(64)},{expiresAtMs:suite.lease.body.expiresAtMs+1},{scopes:['world.write']}]) {
    suite.session=seal({...original.body,...patch},suite.authority.privateKey);
    await assert.rejects(admitRecovery(suite,before),/RECOVERY_SESSION_INVALID/,JSON.stringify(patch));
  }
  suite.session={...original,signature:'AA=='};
  await assert.rejects(admitRecovery(suite,before),/RECOVERY_SESSION_INVALID/);
  suite.session=original;
  witnessed(await admitRecovery(suite,before));
});

test('valid protected checkpoint with a wrong prefix root is rejected by the host before admission',async t=>{
  const suite=await checkpointFixture(t),saved=suite.store.load();
  suite.store.save({...saved,ledgerRoot:'f'.repeat(64)});
  await suite.close();
  const recovered=new InternetSuite({directory:suite.directory,durable:true});
  t.recoveryCleanups.push(()=>recovered.close());
  await assert.rejects(initializeRecovery(recovered),/RECOVERY_CHECKPOINT_MISMATCH/);
});

test('authenticated signed crash suffix cannot reissue the checkpoint lease during host recovery',async t=>{
  const suite=await checkpointFixture(t),original=suite.lease;
  const recovery=publicRecoveryState(suite);
  recovery.lease=seal({...original.body,expiresAtMs:original.body.expiresAtMs+1},suite.authority.privateKey);
  // Append a cryptographically valid event without updating the protected checkpoint.
  // This exercises the crash boundary and models a buggy authorized local writer.
  suite.ledger.append('test.signed-suffix',{recovery});
  await suite.close();
  const recovered=new InternetSuite({directory:suite.directory,durable:true});
  t.recoveryCleanups.push(()=>recovered.close());
  await assert.rejects(initializeRecovery(recovered),/RECOVERY_LEASE_REISSUED/);
});

test('signed crash suffix cannot expand an attenuated saved session within its wider lease',async t=>{
  const suite=await checkpointFixture(t);
  await suite.bindSession('C');
  suite.session=seal({...suite.session.body,scopes:[],expiresAtMs:suite.lease.body.expiresAtMs-1000},suite.authority.privateKey);
  checkpoint(suite);
  const prefix=fs.readFileSync(suite.ledger.file,'utf8'),original=clone(suite.session),state=publicRecoveryState(suite);
  await suite.close();
  for(const patch of [{scopes:['text.read']},{expiresAtMs:original.body.expiresAtMs+1},{sessionId:'session:replacement'}]) {
    fs.writeFileSync(suite.ledger.file,prefix);
    const ledger=new EvidenceLedger(suite.ledger.file,{identity:suite.authority});
    ledger.append('test.signed-session-suffix',{recovery:{...state,session:seal({...original.body,...patch},suite.authority.privateKey)}});
    const recovered=new InternetSuite({directory:suite.directory,durable:true});
    t.recoveryCleanups.push(()=>recovered.close());
    try {await assert.rejects(initializeRecovery(recovered),/RECOVERY_SESSION_EXPANSION/,JSON.stringify(patch));}
    finally {await recovered.close();}
  }
});

test('full process reopening records an actual RCL recovery witness but expired lease execution stays denied',async t=>{
  const directory=directoryFor(t);
  let suite=new InternetSuite({directory,durable:true,timeoutMs:3000});
  t.recoveryCleanups.push(()=>suite.close());
  const expired=Date.now()-1000;
  suite.lease=seal({...suite.lease.body,notBeforeMs:expired-1000,expiresAtMs:expired},suite.authority.privateKey);
  const leaseRoot=suite.lease.root;
  await suite.start();await suite.close();
  suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  assert.equal(suite.lease.root,leaseRoot);
  assert.equal(suite.lease.body.expiresAtMs,expired);
  witnessed(suite.ledger.events.find(event=>event.type==='fixture.recovered').detail.recoveryGuard);
  const selection=await suite.discover('C'),request=await suite.buildRequest('expired state',selection);
  await assert.rejects(suite.wire('C','INTENT',request,selection.route),/RCL_GUARD_DENIED/);
  assert.ok((await suite.stats()).every(node=>node.executions===0));
});
