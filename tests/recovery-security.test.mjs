import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {InternetSuite} from '../src/suite.mjs';
import {seal,rootHash,newIdentity} from '../src/identity.mjs';
import {verifyLedger} from '../src/evidence.mjs';
import {validateCacheEntries} from '../src/node-state.mjs';
import {ProtectedStore} from '../src/protected-store.mjs';
import {acquireDirectoryLease} from '../src/directory-lease.mjs';

function temp() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tinp-recovery-'));
  return directory;
}
async function fixture(t) {
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  return suite;
}
function coordinator(directory,mode='normal') {
  const child=fork(fileURLToPath(new URL('./recovery-coordinator.fixture.mjs',import.meta.url)),[directory,mode],{
    stdio:['ignore','pipe','pipe','ipc'],execArgv:[],windowsHide:true,
  });
  let output='',nodePids=[];
  child.on('message',message=>{nodePids=message.pids??message.stats?.map(node=>node.pid)??nodePids;});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
  const event=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`coordinator timeout: ${output}`)),45000);
    child.once('message',message=>{clearTimeout(timer);message.event==='error'?reject(new Error(`${message.code}: ${message.message}`)):resolve(message);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`coordinator exited ${code}: ${output}`));});
  });
  return {child,event,async dispose(){await kill(child);await waitForExit(nodePids);}};
}
async function kill(child) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGKILL');});
}
async function waitForExit(pids) {
  const deadline=Date.now()+5000;
  for(;;) {
    const alive=pids.filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});
    if(!alive.length)return;
    assert.ok(Date.now()<deadline,`old services did not exit: ${alive.join(', ')}`);
    await new Promise(resolve=>setTimeout(resolve,25));
  }
}

test('durable recovery: actual service kill preserves identity, exact receipt and consumed anchors',async t=>{
  const suite=await fixture(t),selection=await suite.discover('C');
  const request=await suite.buildRequest('durable 中文🙂',selection,{requestId:'persistent-request'});
  const receipt=await suite.wire('C','INTENT',request,selection.route);
  const old=suite.nodes.get('C'),oldPid=old.child.pid,oldKey=old.info.publicKey;
  await old.kill();
  await suite.restartNode('C');
  assert.notEqual(suite.nodes.get('C').child.pid,oldPid);
  assert.equal(suite.nodes.get('C').info.publicKey,oldKey);
  const recovery=suite.ledger.events.findLast(event=>event.type==='node.recovered').detail.recoveryGuard;
  assert.equal(recovery.allowed,true);assert.ok(recovery.programRoot);assert.ok(recovery.stateRoot);
  const retry=await suite.wire('C','INTENT',request,selection.route);
  assert.deepEqual(retry,receipt);
  assert.equal(suite.verifyReceipt(retry,request).result.count,[...'durable 中文🙂'].length);
  const conflict=seal({...request.body,payload:{text:'different'}},suite.subjectIdentity.privateKey);
  await assert.rejects(suite.wire('C','INTENT',conflict,selection.route),/REPLAY_CONFLICT/);
  const forked=seal({...request.body,requestId:'forked-anchor'},suite.subjectIdentity.privateKey);
  await assert.rejects(suite.wire('C','INTENT',forked,selection.route),/EVIDENCE_ANCHOR_CONSUMED/);
  assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
});

test('durable recovery: revocation survives service death and coordinator reopening',async t=>{
  const directory=temp();let suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  const result=await suite.use('before revocation'),leaseRoot=suite.lease.root;
  await suite.revoke();
  await suite.nodes.get('C').kill();await suite.restartNode('C');
  await assert.rejects(suite.wire('C','INTENT',result.request,result.request.body.route),/REVOK|DENIED/);
  await suite.close();
  suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  assert.equal(suite.lease.root,leaseRoot);assert.equal(suite.revoked,true);
  await assert.rejects(suite.use('must remain denied'),/LEASE_REVOKED/);
  await assert.rejects(suite.wire('C','INTENT',result.request,result.request.body.route),/REVOK|DENIED/);
  assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
});

test('durable recovery: independent second coordinator cannot acquire active state',async t=>{
  const directory=temp(),owner=coordinator(directory);
  t.after(async()=>{await kill(owner.child);fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal((await owner.event).event,'ready');
  await assert.rejects(InternetSuite.start({directory,durable:true}),/LOCK|BUSY|OWNER|IN_USE/);
  // Failed acquisition must not release the first coordinator's ownership.
  await assert.rejects(InternetSuite.start({directory,durable:true}),/LOCK|BUSY|OWNER|IN_USE/);
});

test('durable recovery: an existing node writer blocks coordinator recovery without changing its cache',async t=>{
  const directory=temp();let suite=await InternetSuite.start({directory,durable:true}),held;
  t.after(async()=>{await held?.release();await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  await suite.use('exclusive node writer');await suite.close();
  const nodeDirectory=path.join(directory,'private','nodes','C');
  const file=path.join(nodeDirectory,'protected-state.dpapi'),before=fs.readFileSync(file);
  held=await acquireDirectoryLease(nodeDirectory);
  await assert.rejects(InternetSuite.start({directory,durable:true}),/DIRECTORY_IN_USE|DIRECTORY_LOCK|NODE_EXIT/);
  assert.deepEqual(fs.readFileSync(file),before);
  await held.release();held=null;
  suite=await InternetSuite.start({directory,durable:true});
  assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
});

test('durable recovery: actual coordinator kill after execution reconciles one retained receipt',async t=>{
  const directory=temp(),owner=coordinator(directory,'crash-after-receipt');let recovered;
  t.after(async()=>{await owner.dispose();if(recovered)await recovered.dispose();fs.rmSync(directory,{recursive:true,force:true});});
  const before=await owner.event;
  assert.equal(before.event,'receipt-before-commit');
  assert.equal(before.receipt.body.executionCount,1);
  await kill(owner.child);
  await waitForExit(before.pids);
  recovered=coordinator(directory);
  const after=await recovered.event;
  assert.equal(after.event,'ready');assert.equal(after.nodeKeys.C,before.nodePublicKey);
  assert.equal(after.session.body.sessionId,before.request.body.sessionId);
  assert.equal(after.lease.root,before.request.body.lease.root);
  assert.equal(after.stats.find(node=>node.nodeId==='C').executions,1);
  assert.ok(after.stats.every(node=>!before.pids.includes(node.pid)));
  const verified=after.events.filter(event=>event.type==='recovery.receipt-reconciled'&&event.detail.receipt?.root===before.receipt.root);
  assert.equal(verified.length,1);
  assert.equal(verified[0].detail.executionResent,false);
  assert.equal(verifyLedger(after.events,{publicKey:after.authorityPublicKey}),after.events.at(-1).eventRoot);
});

test('durable recovery: unresolved persisted request never becomes an automatic new execution',async t=>{
  const directory=temp(),owner=coordinator(directory,'crash-before-send');let recovered;
  t.after(async()=>{await owner.dispose();if(recovered)await recovered.dispose();fs.rmSync(directory,{recursive:true,force:true});});
  const before=await owner.event;
  assert.equal(before.event,'pending-before-send');await kill(owner.child);await waitForExit(before.pids);
  recovered=coordinator(directory);
  await assert.rejects(recovered.event,/RECEIPT_NOT_FOUND/);
  await kill(recovered.child);
  const store=new ProtectedStore(path.join(directory,'private','nodes','C'),{purpose:'twni.node-state.v1:C'});
  assert.equal(store.load().executions,0);assert.equal(store.load().entries.length,0);
  const pendingStore=new ProtectedStore(path.join(directory,'private','coordinator'),{purpose:'twni.coordinator-state.v1'});
  assert.equal(pendingStore.load().pending.request.root,before.request.root);
});

test('durable recovery: ciphertext corruption cannot silently create fresh authority',async t=>{
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  await suite.use('encrypted state');await suite.close();
  const file=path.join(directory,'private','coordinator','protected-state.dpapi');
  const bytes=fs.readFileSync(file);bytes[Math.floor(bytes.length/2)]^=1;fs.writeFileSync(file,bytes);
  await assert.rejects(InternetSuite.start({directory,durable:true}),/PROTECTED_STORE_LOAD_FAILED/);
});

test('durable recovery: ledger truncated behind its committed checkpoint fails closed',async t=>{
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  await suite.use('checkpoint truncation');await suite.close();
  const lines=fs.readFileSync(suite.ledger.file,'utf8').trimEnd().split('\n');
  assert.ok(lines.length>1);lines.pop();fs.writeFileSync(suite.ledger.file,lines.join('\n')+'\n');
  await assert.rejects(InternetSuite.start({directory,durable:true}),/CHECKPOINT|EVIDENCE|RECOVERY|TRUNCAT/);
});

test('durable recovery: rehashed forged ledger suffix lacks authority signature',async t=>{
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  await suite.use('signed evidence');await suite.close();
  const events=fs.readFileSync(suite.ledger.file,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
  const last=events.at(-1);last.detail.attackerControlled=true;
  const {eventRoot,signature,...body}=last;last.eventRoot=rootHash(body);
  fs.writeFileSync(suite.ledger.file,events.map(event=>JSON.stringify(event)).join('\n')+'\n');
  await assert.rejects(InternetSuite.start({directory,durable:true}),/EVIDENCE_SIGNATURE_INVALID/);
});

test('durable recovery: an older valid service snapshot cannot erase committed execution evidence',async t=>{
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  const file=path.join(directory,'private','nodes','C','protected-state.dpapi');
  const older=fs.readFileSync(file);
  await suite.use('must not execute twice');await suite.close();
  fs.writeFileSync(file,older);
  await assert.rejects(InternetSuite.start({directory,durable:true}),/CACHE|CHECKPOINT|RECEIPT|RECOVERY|ROLLBACK/);
});

test('durable recovery: cache signatures, request keys and consumed anchors are independently bound',async t=>{
  const suite=await fixture(t),result=await suite.use('cache binding');
  const r=result.receipt.body,identity={publicKey:suite.nodes.get('C').info.publicKey};
  const entry={key:`${r.sessionId}|${r.requestId}`,anchorKey:`${r.sessionId}|${r.previousEvidenceRoot}`,
    requestRoot:result.request.root,receipt:result.receipt};
  assert.equal(validateCacheEntries([entry],identity,'C'),1);
  for(const mutation of [
    {key:'wrong-cache-key'},
    {anchorKey:`${r.sessionId}|${'0'.repeat(64)}`},
    {requestRoot:'0'.repeat(64)},
  ])assert.throws(()=>validateCacheEntries([{...entry,...mutation}],identity,'C'),/RECOVERY_CACHE_BINDING_INVALID/);
  const forged={...entry,receipt:seal(r,newIdentity().privateKey)};
  assert.throws(()=>validateCacheEntries([forged],identity,'C'),/RECOVERY_CACHE_SIGNATURE_INVALID/);
  assert.throws(()=>validateCacheEntries([entry,structuredClone(entry)],identity,'C'),/RECOVERY_CACHE_DUPLICATE/);
  assert.throws(()=>validateCacheEntries([entry],identity,'B'),/RECOVERY_CACHE_BINDING_INVALID/);
});

test('durable recovery: authenticated storage does not excuse malformed cache records',async t=>{
  const directory=temp(),suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  await suite.use('cache restart attacks');await suite.close();
  const store=new ProtectedStore(path.join(directory,'private','nodes','C'),{purpose:'twni.node-state.v1:C'});
  const original=store.load();
  // Deliberately write a valid DPAPI envelope around bad semantic data. This
  // models a buggy local writer; DPAPI authentication cannot validate receipt IR.
  for(const mutate of [
    state=>{state.entries[0].key='other-request';},
    state=>{state.entries[0].anchorKey='other-anchor';},
    state=>{state.entries[0].receipt.signature='AA==';},
  ]) {
    const state=structuredClone(original);mutate(state);store.save(state);
    await assert.rejects(InternetSuite.start({directory,durable:true}),/RECOVERY_CACHE/);
  }
});
