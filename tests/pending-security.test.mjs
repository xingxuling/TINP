import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {InternetSuite} from '../src/suite.mjs';
import {checkpoint} from '../src/coordinator-state.mjs';
import {inspectPending} from '../src/pending-management.mjs';
import {ProtectedStore} from '../src/protected-store.mjs';
import {seal} from '../src/identity.mjs';

function directoryFor(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tinp-pending-security-'));
  t.cleanup=[];
  t.after(async()=>{
    for(const cleanup of t.cleanup)await cleanup();
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('tinp-pending-security-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  return directory;
}
async function pendingFixture(t){
  const directory=directoryFor(t),suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  t.cleanup.push(()=>suite.close());
  const selection=await suite.discover('C'),request=await suite.buildRequest('PRIVATE_PENDING_SENTINEL_中文🙂',selection);
  suite.pending={request,selection};checkpoint(suite);
  await suite.close();
  return {directory,request,leaseRoot:suite.lease.root};
}
async function maintenance(t,directory){
  const suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',timeoutMs:3000});
  t.cleanup.push(()=>suite.close());return suite;
}
function bytes(directory){
  return Object.fromEntries(['ledger.jsonl','private/coordinator/protected-state.dpapi',
    ...['A','B','C'].map(id=>`private/nodes/${id}/protected-state.dpapi`)]
    .map(file=>[file,fs.readFileSync(path.join(directory,file)).toString('base64')]));
}
async function kill(child){
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGKILL');});
}
async function exited(pids){
  const deadline=Date.now()+8000;
  while(pids.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}})){
    assert.ok(Date.now()<deadline,'old retirement nodes still alive');
    await new Promise(resolve=>setTimeout(resolve,25));
  }
}
function crashCoordinator(directory,mode){
  const child=fork(fileURLToPath(new URL('./pending-coordinator.fixture.mjs',import.meta.url)),[directory,mode],{
    stdio:['ignore','pipe','pipe','ipc'],execArgv:[],windowsHide:true});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data.toString();});
  const event=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`retirement coordinator timed out: ${output}`)),45000);
    child.once('message',message=>{clearTimeout(timer);message.event==='error'?reject(new Error(`${message.code}: ${message.message}`)):resolve(message);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`retirement coordinator exited ${code}: ${output}`));});
  });return {child,event};
}

test('pending inspector is offline, nonmutating, redacted and refuses missing state without creating it',async t=>{
  const {directory,request}=await pendingFixture(t),before=bytes(directory);
  const report=await inspectPending(directory);
  assert.equal(report.requestRoot,request.root);assert.equal(report.nodeCacheVerified,false);
  assert.equal(report.leaseRevoked,false);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_PENDING_SENTINEL|PRIVATE KEY|privateKey|subjectIdentity/);
  assert.deepEqual(bytes(directory),before);
  const missing=path.join(directory,'must-remain-absent');
  await assert.rejects(inspectPending(missing));assert.equal(fs.existsSync(missing),false);
  const suite=await maintenance(t,directory),liveBefore=bytes(directory);
  assert.equal((await inspectPending(directory)).requestRoot,request.root);
  assert.deepEqual(bytes(directory),liveBefore);assert.ok((await suite.stats()).every(node=>node.executions===0));
});

test('maintenance denies direct execution and service restart cannot activate a provider',async t=>{
  const {directory,request}=await pendingFixture(t),suite=await maintenance(t,directory);
  await assert.rejects(suite.wire('C','INTENT',request,request.body.route),/MAINTENANCE_EXECUTION_DISABLED/);
  await assert.rejects(suite.use('must not execute'),/MAINTENANCE_EXECUTION_DISABLED/);
  await suite.nodes.get('C').kill();await suite.restartNode('C');
  await assert.rejects(suite.wire('C','INTENT',request,request.body.route),/MAINTENANCE_EXECUTION_DISABLED/);
  // Bypass the coordinator wire guard to verify the restarted service gate itself.
  const {makeForwardEnvelope}=await import('../vendor/tinp/src/forwarding.mjs');
  const forward=makeForwardEnvelope({route:request.body.route,payloadType:'INTENT',payload:request,ttl:6});
  await assert.rejects(suite.nodes.get('A').call('send',{forward}),/NODE_RECOVERY_REQUIRED|MAINTENANCE_EXECUTION_DISABLED/);
  assert.ok((await suite.stats()).every(node=>node.executions===0));
});

test('retirement root and explicit confirmation fail before any durable mutation',async t=>{
  const {directory,request}=await pendingFixture(t),suite=await maintenance(t,directory),before=bytes(directory);
  await assert.rejects(suite.retirePending({requestRoot:'f'.repeat(64),confirmed:true}),/PENDING_ROOT_MISMATCH/);
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:false}),/OPERATOR_CONFIRMATION_REQUIRED/);
  assert.deepEqual(bytes(directory),before);assert.equal(suite.revoked,false);assert.equal(suite.revocationEpoch,0);
});

test('authenticated pending state binds its public root, target and whole route even when the route root is unchanged',async t=>{
  const {directory,request}=await pendingFixture(t);
  const store=new ProtectedStore(path.join(directory,'private','coordinator'),{purpose:'twni.coordinator-state.v1'});
  const original=store.load();
  for(const mutate of [
    state=>{state.pendingRoot='f'.repeat(64);},
    state=>{state.pending.selection.target='B';},
    state=>{state.pending.selection.route.cost++;},
  ]){
    const changed=structuredClone(original);mutate(changed);
    assert.equal(changed.pending.request.root,request.root);
    assert.equal(changed.pending.selection.route.routeRoot,original.pending.selection.route.routeRoot);
    store.save(changed);const before=bytes(directory);
    await assert.rejects(inspectPending(directory),/RECOVERY_PENDING_INVALID/);
    assert.deepEqual(bytes(directory),before);
    await assert.rejects(async()=>{
      const unexpected=await InternetSuite.start({directory,durable:true});await unexpected.close();
    },/RECOVERY_PENDING_INVALID/);
    assert.equal(store.load().pending.request.root,request.root);
  }
});

test('retirement missing one live acknowledgement preserves pending and resumes only with full revocation evidence',async t=>{
  const {directory,request,leaseRoot}=await pendingFixture(t),suite=await maintenance(t,directory);
  await suite.nodes.get('B').kill();
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true}),/PENDING_RETIREMENT_ACK_REQUIRED/);
  assert.equal(suite.pending.request.root,request.root);assert.equal(suite.revoked,true);
  assert.equal(suite.ledger.events.filter(event=>event.type==='pending.retired').length,0);
  await suite.close();const resumed=await maintenance(t,directory);
  await resumed.retirePending({requestRoot:request.root,confirmed:true});
  assert.equal(resumed.pending,null);assert.equal(resumed.lease.root,leaseRoot);
  const terminal=resumed.ledger.events.filter(event=>event.type==='pending.retired');assert.equal(terminal.length,1);
  assert.equal(terminal[0].detail.executionOutcome,'unknown');assert.equal(terminal[0].detail.acknowledgements.length,3);
  assert.ok((await resumed.stats()).every(node=>node.executions===0&&node.revoked.includes(resumed.lease.body.leaseId)));
});

for(const boundary of ['prefix','suffix'])test(`actual coordinator death after retirement ${boundary} commit recovers without execution or lease renewal`,async t=>{
  const {directory,request,leaseRoot}=await pendingFixture(t),owner=crashCoordinator(directory,boundary);
  let pids=[];t.cleanup.push(async()=>{await kill(owner.child);await exited(pids);});
  const before=await owner.event;pids=before.nodePids;
  assert.equal(before.event,'retirement-before-clear');assert.equal(before.requestRoot,request.root);
  assert.ok(before.stats.every(node=>node.executions===0&&node.revocationEpoch>0));
  await kill(owner.child);await exited(pids);
  const resumed=await maintenance(t,directory);
  await resumed.reconcilePending();
  assert.equal(resumed.pending,null);assert.equal(resumed.lease.root,leaseRoot);assert.equal(resumed.revoked,true);
  const terminal=resumed.ledger.events.filter(event=>event.type==='pending.retired');
  assert.equal(terminal.length,1);assert.equal(terminal[0].eventRoot,before.terminalRoot);
  assert.ok((await resumed.stats()).every(node=>node.executions===0&&!pids.includes(node.pid)));
  await resumed.close();
  const normal=await InternetSuite.start({directory,durable:true,timeoutMs:3000});t.cleanup.push(()=>normal.close());
  assert.equal(normal.lease.root,leaseRoot);await assert.rejects(normal.use('retired forever'),/LEASE_REVOKED/);
  assert.ok((await normal.stats()).every(node=>node.executions===0));
});

test('authority-signed terminal does not excuse missing node evidence, wrong epoch or fake RCL admission',async t=>{
  const {directory,request}=await pendingFixture(t),suite=await maintenance(t,directory);
  const originalRecord=suite.record.bind(suite);
  suite.record=(type,detail)=>{const event=originalRecord(type,detail);if(type==='pending.retired')throw new Error('test-before-clear');return event;};
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true}),/test-before-clear/);
  await suite.close();
  const store=new ProtectedStore(path.join(directory,'private','coordinator'),{purpose:'twni.coordinator-state.v1'});
  const saved=store.load(),events=fs.readFileSync(path.join(directory,'ledger.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type,'pending.retired');assert.equal(saved.pending.request.root,request.root);
  for(const mutate of [
    detail=>{detail.acknowledgements.pop();},
    detail=>{detail.acknowledgements[2]=structuredClone(detail.acknowledgements[1]);},
    detail=>{detail.acknowledgements[0]=seal(detail.acknowledgements[0].body,saved.authority.privateKey);},
    detail=>{detail.revocationEpoch++;},
    detail=>{detail.guard={...detail.guard,allowed:true,programRoot:'f'.repeat(64),factsRoot:'e'.repeat(64)};},
    detail=>{detail.guard={...detail.guard,factsRoot:'e'.repeat(64)};},
  ]){
    const changed=structuredClone(events),last=changed.at(-1);mutate(last.detail);
    const {eventRoot,signature,...body}=last,signed=seal(body,saved.authority.privateKey);
    changed[changed.length-1]={...body,eventRoot:signed.root,signature:signed.signature};
    fs.writeFileSync(path.join(directory,'ledger.jsonl'),changed.map(event=>JSON.stringify(event)).join('\n')+'\n');
    store.save({...saved,ledgerRoot:signed.root});
    await assert.rejects(async()=>{
      const unexpected=await InternetSuite.start({directory,durable:true});
      await unexpected.close();
    },/PENDING_RETIREMENT_INVALID/);
    assert.equal(store.load().pending.request.root,request.root);
  }
});
