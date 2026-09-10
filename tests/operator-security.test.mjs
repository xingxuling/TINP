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

const fixtureUrl=new URL('./operator-coordinator.fixture.mjs',import.meta.url);
function directoryFor(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tinp-operator-security-'));t.cleanup=[];
  t.after(async()=>{
    for(const cleanup of t.cleanup)await cleanup();
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('tinp-operator-security-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });return directory;
}
async function kill(child){if(child.exitCode!==null||child.signalCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGKILL');});}
async function exited(pids){const deadline=Date.now()+8000;while(pids.some(pid=>{try{process.kill(pid,0);return true;}catch{return false;}})){
  assert.ok(Date.now()<deadline,'old operator services still alive');await new Promise(resolve=>setTimeout(resolve,25));}}
function childProcess(mode,directory){
  const child=fork(fileURLToPath(fixtureUrl),[mode,...(directory?[directory]:[])],{stdio:['ignore','pipe','pipe','ipc'],execArgv:[],windowsHide:true});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data.toString();});
  const event=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`operator child timeout: ${output}`)),45000);
    child.once('message',message=>{clearTimeout(timer);message.event==='error'?reject(new Error(`${message.code}: ${message.message}`)):resolve(message);});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`operator child exited ${code}: ${output}`));});
  });return {child,event};
}
async function signerFor(t){
  const {child,event}=childProcess('signer');t.cleanup.push(()=>kill(child));const ready=await event;
  assert.equal(ready.event,'signer-ready');assert.notEqual(ready.pid,process.pid);
  let next=0;
  return {...ready,async sign(challengeRoot,patch={},signatureSigner){
    const now=Date.now(),callId=++next;
    const body={approval_id:`approval:external-${next}`,proposal_root:challengeRoot,approver_id:ready.signerId,
      approver_roles:['tinp.operator'],decision:'approved',scopes:['tinp.pending.retire'],conditions:[],
      issued_at:new Date(now-100).toISOString(),expires_at:new Date(now+60000).toISOString(),...patch};
    const response=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.off('message',handler);reject(new Error('external signer timeout'));},10000);
      const handler=message=>{if(message.callId!==callId)return;clearTimeout(timer);child.off('message',handler);
        message.error?reject(new Error(message.error)):resolve(message.approval);};child.on('message',handler);
    });child.send({command:'sign',callId,body,signerId:signatureSigner});return response;
  }};
}
function stateStore(directory){return new ProtectedStore(path.join(directory,'private','coordinator'),{purpose:'twni.coordinator-state.v1'});}
function bytes(directory){return Object.fromEntries(['ledger.jsonl','private/coordinator/protected-state.dpapi',...['A','B','C'].map(id=>`private/nodes/${id}/protected-state.dpapi`)]
  .map(file=>[file,fs.readFileSync(path.join(directory,file)).toString('base64')]));}
async function setup(t){
  const directory=directoryFor(t),signer=await signerFor(t),keyring={[signer.signerId]:{publicKeyPem:signer.publicKeyPem,revoked:false}};
  const initial=await InternetSuite.start({directory,durable:true,timeoutMs:3000});t.cleanup.push(()=>initial.close());
  const selection=await initial.discover('C'),request=await initial.buildRequest('EXTERNAL_OPERATOR_PRIVATE_PAYLOAD',selection);
  initial.pending={request,selection};checkpoint(initial);await initial.close();
  const suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',operatorKeyring:keyring,timeoutMs:3000});t.cleanup.push(()=>suite.close());
  await suite.pinOperator({signerId:signer.signerId,publicKeyPem:signer.publicKeyPem,confirmed:true});
  const challenge=await suite.operatorChallenge();assert.match(challenge.challengeRoot,/^[a-f0-9]{64}$/);
  return {directory,signer,keyring,suite,request,challenge};
}

test('external operator pin is immutable and persisted as a fingerprint without the external keyring or private signer',async t=>{
  const {directory,signer,keyring,suite,challenge}=await setup(t),before=bytes(directory);
  await suite.pinOperator({signerId:signer.signerId,publicKeyPem:signer.publicKeyPem,confirmed:true});
  assert.deepEqual(bytes(directory),before);
  const replacement=await signerFor(t);
  await assert.rejects(suite.pinOperator({signerId:signer.signerId,publicKeyPem:replacement.publicKeyPem,confirmed:true}),/OPERATOR.*PIN|OPERATOR.*POLICY|OPERATOR.*REPLACE/);
  assert.deepEqual(bytes(directory),before);
  const saved=stateStore(directory).load();assert.ok(saved.operatorPolicy?.policyRoot);
  assert.equal(Object.hasOwn(saved,'operatorKeyring'),false);assert.doesNotMatch(JSON.stringify(saved),/EXTERNAL_OPERATOR_PRIVATE_KEY/);
  assert.equal(JSON.stringify(saved).includes(signer.publicKeyPem),false);
  await suite.close();const report=await inspectPending(directory);
  assert.equal(report.challenge?.challengeRoot??report.operatorChallenge?.challengeRoot,challenge.challengeRoot);
  assert.equal(JSON.stringify(report).includes('EXTERNAL_OPERATOR_PRIVATE_PAYLOAD'),false);
  const resumed=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',operatorKeyring:keyring});t.cleanup.push(()=>resumed.close());
  assert.equal((await resumed.operatorChallenge()).challengeRoot,challenge.challengeRoot);
});

test('pinned operator requires a signed approval and the matching currently unrevoked external key before any revocation',async t=>{
  const {directory,signer,suite,request,challenge}=await setup(t),before=bytes(directory);
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true}),/OPERATOR_APPROVAL/);
  assert.deepEqual(bytes(directory),before);
  const approval=await signer.sign(challenge.challengeRoot),replacement=await signerFor(t),original=suite.operatorKeyring;
  for(const keyring of [{},{[signer.signerId]:{publicKeyPem:replacement.publicKeyPem,revoked:false}},
    {[signer.signerId]:{publicKeyPem:signer.publicKeyPem,revoked:true}}]){
    suite.operatorKeyring=keyring;
    await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true,approval}),/OPERATOR_KEY/);
    assert.deepEqual(bytes(directory),before);assert.equal(suite.revoked,false);
  }suite.operatorKeyring=original;
});

test('valid external signatures for another challenge, signer identity, scope or expired interval grant no retirement',async t=>{
  const {directory,signer,suite,request,challenge}=await setup(t),before=bytes(directory),now=Date.now();
  for(const patch of [{proposal_root:'f'.repeat(64)},{approver_id:'operator:other'},{scopes:['*']},
    {issued_at:new Date(now-10000).toISOString(),expires_at:new Date(now-1000).toISOString()}]){
    const approval=await signer.sign(challenge.challengeRoot,patch);
    await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true,approval}),/OPERATOR_/);
    assert.deepEqual(bytes(directory),before);assert.equal(suite.revoked,false);
  }
});

test('operator revocation after actual node acknowledgements is rechecked and cannot commit a terminal',async t=>{
  const {signer,suite,request,challenge}=await setup(t),approval=await signer.sign(challenge.challengeRoot);
  const node=suite.nodes.get('C'),call=node.call.bind(node);
  node.call=async(command,value,...args)=>{const result=await call(command,value,...args);
    if(command==='revoke')suite.operatorKeyring[signer.signerId].revoked=true;return result;};
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true,approval}),/OPERATOR_KEY_REVOKED/);
  assert.equal(suite.pending.request.root,request.root);assert.equal(suite.revoked,true);
  assert.equal(suite.ledger.events.filter(event=>event.type==='pending.retired').length,0);
  assert.ok((await suite.stats()).every(item=>item.executions===0&&item.revocationEpoch>0));
  node.call=call;suite.operatorKeyring[signer.signerId].revoked=false;
  await suite.retirePending({requestRoot:request.root,confirmed:true,approval:await signer.sign(challenge.challengeRoot)});
  assert.equal(suite.pending,null);
});

test('approval expiry while waiting for real node acknowledgements retains pending and produces no terminal',async t=>{
  const {signer,suite,request,challenge}=await setup(t),expires=Date.now()+3500;
  const approval=await signer.sign(challenge.challengeRoot,{expires_at:new Date(expires).toISOString()});
  const node=suite.nodes.get('C'),call=node.call.bind(node);
  node.call=async(command,value,...args)=>{const result=await call(command,value,...args);
    if(command==='revoke')await new Promise(resolve=>setTimeout(resolve,Math.max(1,expires-Date.now()+30)));return result;};
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true,approval}),/OPERATOR_APPROVAL_TIME_INVALID/);
  assert.equal(suite.pending.request.root,request.root);assert.equal(suite.revoked,true);
  assert.equal(suite.ledger.events.filter(event=>event.type==='pending.retired').length,0);
  assert.ok((await suite.stats()).every(item=>item.executions===0));
});

test('authenticated checkpoint cannot drop or replace an operator pin already recorded in the signed ledger',async t=>{
  const {directory,suite,signer}=await setup(t);await suite.close();
  const store=stateStore(directory),original=store.load();
  const {makeOperatorPolicy}=await import('../adapters/aaf-operator.mjs');
  for(const policy of [null,makeOperatorPolicy({signerId:'operator:replacement',publicKeyPem:signer.publicKeyPem})]){
    store.save({...original,operatorPolicy:policy});
    await assert.rejects(inspectPending(directory),/OPERATOR_|RECOVERY_/);
    await assert.rejects(async()=>{const unexpected=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance'});await unexpected.close();},/OPERATOR_|RECOVERY_/);
  }
});

test('actual coordinator crash finalizes a historical approval after expiry while requiring its external nonrevoked key',async t=>{
  const {directory,signer,keyring,suite,request,challenge}=await setup(t),leaseRoot=suite.lease.root;
  await suite.close();const expires=Date.now()+12000,approval=await signer.sign(challenge.challengeRoot,{expires_at:new Date(expires).toISOString()});
  const owner=childProcess('crash',directory);let pids=[];
  t.cleanup.push(async()=>{await kill(owner.child);await exited(pids);});
  owner.child.send({operatorKeyring:keyring,approval});const before=await owner.event;pids=before.nodePids;
  assert.equal(before.event,'terminal-before-clear');assert.equal(before.requestRoot,request.root);
  await kill(owner.child);await exited(pids);
  await new Promise(resolve=>setTimeout(resolve,Math.max(1,expires-Date.now()+30)));
  await assert.rejects(inspectPending(directory),/OPERATOR_KEY/);
  const revokedKeyring={[signer.signerId]:{publicKeyPem:signer.publicKeyPem,revoked:true}};
  await assert.rejects(inspectPending(directory,{operatorKeyring:revokedKeyring}),/OPERATOR_KEY_REVOKED/);
  const report=await inspectPending(directory,{operatorKeyring:keyring});assert.equal(report.status,'retired-awaiting-finalization');
  const resumed=await InternetSuite.start({directory,durable:true,operatorKeyring:keyring,timeoutMs:3000});t.cleanup.push(()=>resumed.close());
  assert.equal(resumed.pending,null);assert.equal(resumed.lease.root,leaseRoot);assert.equal(resumed.revoked,true);
  assert.equal(resumed.ledger.events.filter(event=>event.type==='pending.retired').length,1);
  assert.ok((await resumed.stats()).every(item=>item.executions===0&&!pids.includes(item.pid)));
  await assert.rejects(resumed.use('no renewed authority'),/LEASE_REVOKED/);
  await resumed.close();
  await assert.rejects(inspectPending(directory,{operatorKeyring:revokedKeyring}),/OPERATOR_KEY_REVOKED/);
});

test('a coordinator-signed terminal cannot forge external approval or recorded authorization evidence',async t=>{
  const {directory,signer,keyring,suite,request,challenge}=await setup(t),approval=await signer.sign(challenge.challengeRoot);
  const record=suite.record.bind(suite);
  suite.record=(type,detail,...options)=>{const event=record(type,detail,...options);if(type==='pending.retired')throw new Error('operator-test-before-clear');return event;};
  await assert.rejects(suite.retirePending({requestRoot:request.root,confirmed:true,approval}),/operator-test-before-clear/);
  await suite.close();const store=stateStore(directory),saved=store.load();
  const events=fs.readFileSync(path.join(directory,'ledger.jsonl'),'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type,'pending.retired');
  // Mutations depend only on the promised terminal fields, never on an external private key.
  for(const mutate of [
    detail=>{detail.operatorAuthorization.approval.signature.value='A'.repeat(86)+'==';},
    detail=>{detail.operatorBoundary='explicit-local-windows-user';delete detail.operatorAuthorization;},
    detail=>{detail.operatorAuthorization.verification.authorizedAtMs++;},
    detail=>{detail.operatorAuthorization.firstVerifiedAtMs=Date.parse(detail.operatorAuthorization.approval.issued_at)-1;},
  ]){
    const changed=structuredClone(events),last=changed.at(-1);mutate(last.detail);
    const {eventRoot,signature,...body}=last,signed=seal(body,saved.authority.privateKey);
    changed[changed.length-1]={...body,eventRoot:signed.root,signature:signed.signature};
    fs.writeFileSync(path.join(directory,'ledger.jsonl'),changed.map(event=>JSON.stringify(event)).join('\n')+'\n');
    store.save({...saved,ledgerRoot:signed.root});
    await assert.rejects(inspectPending(directory,{operatorKeyring:keyring}),/OPERATOR_|PENDING_RETIREMENT_/);
    await assert.rejects(async()=>{const unexpected=await InternetSuite.start({directory,durable:true,operatorKeyring:keyring});await unexpected.close();},/OPERATOR_|PENDING_RETIREMENT_/);
    assert.equal(store.load().pending.request.root,request.root);
  }
});
