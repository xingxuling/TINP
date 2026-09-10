import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fork,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {InternetSuite} from '../src/suite.mjs';
import {checkpoint} from '../src/coordinator-state.mjs';
import {ProtectedStore} from '../src/protected-store.mjs';
import {verifyLedger} from '../src/evidence.mjs';

// Test-only signer process. It generates its own ephemeral key and never sends private material.
const signer=fork(fileURLToPath(new URL('../tests/operator-coordinator.fixture.mjs',import.meta.url)),['signer'],{execArgv:[],windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
let suite;const transport=process.argv[2]||'udp';
function message(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SIGNER_TIMEOUT')),15000);signer.once('message',x=>{clearTimeout(timer);resolve(x);});signer.once('error',reject);});}
function cli(...args){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./pending.mjs',import.meta.url)),...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',x=>out+=x.toString('utf8'));child.stderr.on('data',x=>err+=x.toString('utf8'));child.once('error',reject);child.once('exit',code=>resolve({code,out,err}));
});}
try{
  const ready=await message(),keyring={[ready.signerId]:{publicKeyPem:ready.publicKeyPem,revoked:false}};
  assert.notEqual(ready.pid,process.pid);
  suite=await InternetSuite.start({durable:true,transport});const directory=suite.directory;
  const selection=await suite.discover('C'),request=await suite.buildRequest('仅供外部操作员演示的未发送请求',selection);
  suite.pending={request,selection};checkpoint(suite);const leaseRoot=suite.lease.root;await suite.close();
  const exchange=path.join(path.dirname(directory),path.basename(directory)+'-operator-exchange');fs.mkdirSync(exchange);
  const publicFile=path.join(exchange,'operator-public.pem'),keyringFile=path.join(exchange,'operator-keyring.json'),approvalFile=path.join(exchange,'operator-approval.json');
  fs.writeFileSync(publicFile,ready.publicKeyPem);fs.writeFileSync(keyringFile,JSON.stringify(keyring));
  // Exercise the actual operator-facing CLI; the public exchange files are only in this ignored demo directory.
  const pin=await cli('operator-pin',directory,'--signer-id',ready.signerId,'--public-key',publicFile,'--confirm-pin-operator','--transport',transport);assert.equal(pin.code,0,pin.err);
  const challengeResult=await cli('operator-request',directory);assert.equal(challengeResult.code,0,challengeResult.err);const challenge=JSON.parse(challengeResult.out).challenge;
  const blocked=await cli('retire',directory,'--request-root',request.root,'--confirm-retire-lease');assert.equal(blocked.code,2);assert.equal(JSON.parse(blocked.err).code,'EXTERNAL_OPERATOR_APPROVAL_REQUIRED');
  const now=Date.now(),response=message();signer.send({command:'sign',callId:1,body:{approval_id:'approval:isolated-demo',proposal_root:challenge.challengeRoot,
    approver_id:ready.signerId,approver_roles:['tinp.operator'],decision:'approved',scopes:['tinp.pending.retire'],conditions:[],
    issued_at:new Date(now-1000).toISOString(),expires_at:new Date(now+120000).toISOString()}});
  const {approval}=await response;assert.ok(approval?.signature);fs.writeFileSync(approvalFile,JSON.stringify(approval));
  const retired=await cli('retire',directory,'--request-root',request.root,'--confirm-retire-lease','--keyring',keyringFile,'--approval',approvalFile,'--transport',transport);assert.equal(retired.code,0,retired.err);
  suite=await InternetSuite.start({directory,durable:true,transport,operatorKeyring:keyring});assert.equal(suite.lease.root,leaseRoot);assert.equal(suite.pending,null);
  await assert.rejects(suite.use('旧租约必须拒绝'),/LEASE_REVOKED/);const stats=await suite.stats();assert.ok(stats.every(n=>n.executions===0));
  const state=new ProtectedStore(path.join(directory,'private/coordinator'),{purpose:'twni.coordinator-state.v1'}).load();
  assert.equal(Object.hasOwn(state,'operatorKeyring'),false);assert.equal(JSON.stringify(state).includes(ready.publicKeyPem),false);
  console.log(JSON.stringify({status:'VERIFIED_LOCAL_EXTERNAL_OPERATOR',transport,signerPid:ready.pid,nodePids:stats.map(n=>n.pid),
    externalKeyring:keyring,booleanConfirmationDenied:true,zeroExecutions:true,leasePreserved:true,externalKeyringNotCheckpointed:true,
    terminal:suite.ledger.events.findLast(e=>e.type==='pending.retired'),ledgerFile:suite.ledger.file,authorityPublicKey:suite.authority.publicKey,
    evidenceRoot:verifyLedger(suite.ledger.events,{publicKey:suite.authority.publicKey}),
    scope:'Actual CLI and independent ephemeral test signer. No production human enrollment, external clock, hardware custody or anti-rollback anchor.'},null,2));
}finally{await suite?.close();if(signer.exitCode===null&&signer.signalCode===null)await new Promise(resolve=>{signer.once('exit',resolve);signer.kill();});}
