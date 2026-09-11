import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {InternetSuite} from '../src/suite.mjs';
import {verifyLedger} from '../src/evidence.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const out=path.join(root,'evidence',version);fs.mkdirSync(out,{recursive:true});
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const p=path.join(dir,e.name);return e.isDirectory()?inventory(p):[{path:path.relative(root,p).replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))}];
}).filter(x=>!x.path.includes('__pycache__')&&!x.path.endsWith('.pyc'));}
const tracked=['src','adapters','rcl','tests','vendor','shared-ir','registry','scripts'].filter(x=>fs.existsSync(x)).flatMap(x=>inventory(x));
const startedAt=new Date().toISOString();
const testFiles=[...fs.readdirSync('tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x),
  ...fs.readdirSync('vendor/tinp/tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'vendor/tinp/tests/'+x)];
const result=await new Promise((resolve,reject)=>{
  // Sequential test files keep fault-injection timings independent; individual replay tests retain real concurrency.
  const args=['--test','--test-concurrency=1','--test-reporter=tap',...testFiles];
  const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>resolve({command:[process.execPath,...args],code,stdout,stderr}));
});
fs.writeFileSync(path.join(out,'tests.tap'),result.stdout);fs.writeFileSync(path.join(out,'tests.stderr.txt'),result.stderr);
if(result.code!==0){console.error(result.stdout,result.stderr);process.exit(1);}
const scenarios=[];
for(const transport of ['udp','tcp']){
  const directory=fs.mkdtempSync(path.join(out,`${transport}-witness-`));
  const suite=await InternetSuite.start({transport,directory,timeoutMs:2500});
  try{
    const response=await suite.use('你好，新互联网🌏');
    const timings=[];
    // Reuse negotiated capability to isolate signed transaction + RCL + disk + two-hop transmission.
    const selection=await suite.discover('C');
    for(let i=0;i<20;i++){const t=performance.now();await suite.executeSelection(`bounded-${i}🌏`,selection);timings.push(performance.now()-t);}
    timings.sort((a,b)=>a-b);
    const stats=await suite.stats();verifyLedger(suite.ledger.events);
    const witness={transport,pids:stats.map(x=>x.pid),firstResult:response.result,firstReceipt:response.receipt,
      firstPath:response.receipt.body.route,stats,evidenceRoot:suite.ledger.root,
      ledger:path.relative(root,suite.ledger.file).replaceAll('\\','/'),
      boundedPerformance:{samples:timings.length,medianMs:timings[10],p95Ms:timings[18],maxMs:timings[19],scope:'local signed transaction with negotiated capability; not discovery/OPP startup, WAN, throughput or SLA proof'},
      memory:process.memoryUsage(),memoryScope:'coordinator process only; does not include node/Python children'};
    scenarios.push(witness);fs.writeFileSync(path.join(directory,'witness.json'),JSON.stringify(witness,null,2));
  }finally{await suite.close();}
}
const recoveryScenarios=[];
for(const transport of ['udp','tcp']){
  const demo=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/recovery-demo.mjs',transport],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
    child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Recovery ${transport}: ${stderr}`)));
  });
  const ledger=fs.readFileSync(demo.ledgerFile);
  const events=ledger.toString('utf8').trim().split('\n').map(x=>JSON.parse(x));
  if(verifyLedger(events,{publicKey:demo.authorityPublicKey})!==demo.已验证证据根)throw new Error('RECOVERY_WITNESS_ROOT_MISMATCH');
  const ledgerFile=path.join(out,`recovery-${transport}.jsonl`);fs.writeFileSync(ledgerFile,ledger);
  const {状态目录,ledgerFile:originalLedger,...publicDemo}=demo;
  const witness={...publicDemo,ledger:relative(ledgerFile),ledgerSha256:sha(ledger),scope:'Actual node kill/restart and coordinator close/reopen on Windows; coordinator force-kill cases separately in tests, UDP only'};
  fs.writeFileSync(path.join(out,`recovery-${transport}.json`),JSON.stringify(witness,null,2));recoveryScenarios.push(witness);
}
const pendingScenarios=[];
for(const transport of ['udp','tcp']){
  const demo=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/pending-demo.mjs',transport],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
    child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Pending ${transport}: ${stderr}`)));
  });
  const ledger=fs.readFileSync(demo.ledgerFile),events=ledger.toString('utf8').trim().split('\n').map(x=>JSON.parse(x));
  if(verifyLedger(events,{publicKey:demo.authorityPublicKey})!==demo.evidenceRoot)throw new Error('PENDING_WITNESS_ROOT_MISMATCH');
  const ledgerFile=path.join(out,`pending-${transport}.jsonl`);fs.writeFileSync(ledgerFile,ledger);
  const {ledgerFile:originalLedger,...publicDemo}=demo;
  const witness={...publicDemo,ledger:relative(ledgerFile),ledgerSha256:sha(ledger)};
  fs.writeFileSync(path.join(out,`pending-${transport}.json`),JSON.stringify(witness,null,2));pendingScenarios.push(witness);
}
const operatorScenarios=[];
for(const transport of ['udp','tcp']){
  const demo=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/operator-demo.mjs',transport],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
    child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Operator ${transport}: ${stderr}`)));
  });
  const ledger=fs.readFileSync(demo.ledgerFile),events=ledger.toString('utf8').trim().split('\n').map(x=>JSON.parse(x));
  if(verifyLedger(events,{publicKey:demo.authorityPublicKey})!==demo.evidenceRoot)throw new Error('OPERATOR_WITNESS_ROOT_MISMATCH');
  const ledgerFile=path.join(out,`operator-${transport}.jsonl`);fs.writeFileSync(ledgerFile,ledger);
  const {ledgerFile:originalLedger,...publicDemo}=demo;
  const witness={...publicDemo,ledger:relative(ledgerFile),ledgerSha256:sha(ledger)};
  fs.writeFileSync(path.join(out,`operator-${transport}.json`),JSON.stringify(witness,null,2));operatorScenarios.push(witness);
}
const recoveryAnchorScenarios=[];
for(const transport of ['udp','tcp']){
  const demo=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/recovery-anchor-demo.mjs',transport],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
    child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Recovery anchor ${transport}: ${stderr}`)));
  });
  if(demo.status!=='VERIFIED_LOCAL_EXTERNAL_RECOVERY_ANCHOR'||demo.rollbackDetected!==true)throw new Error('RECOVERY_ANCHOR_WITNESS_INVALID');
  const ledger=fs.readFileSync(demo.ledgerFile),events=ledger.toString('utf8').trim().split('\n').map(x=>JSON.parse(x));
  if(verifyLedger(events,{publicKey:demo.authorityPublicKey})!==demo.evidenceRoot)throw new Error('RECOVERY_ANCHOR_WITNESS_ROOT_MISMATCH');
  const ledgerFile=path.join(out,`recovery-anchor-${transport}.jsonl`);fs.writeFileSync(ledgerFile,ledger);
  try{fs.unlinkSync(demo.ledgerFile);}catch{}
  const {ledgerFile:originalLedger,...publicDemo}=demo;
  const witness={...publicDemo,ledger:relative(ledgerFile),ledgerSha256:sha(ledger)};
  fs.writeFileSync(path.join(out,`recovery-anchor-${transport}.json`),JSON.stringify(witness,null,2));recoveryAnchorScenarios.push(witness);
}
const authorityRegistryScenarios=[];
const authorityRegistryDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry: ${stderr}`)));
});
if(authorityRegistryDemo.status!=='VERIFIED_LOCAL_AUTHORITY_REGISTRY_LIFECYCLE'||authorityRegistryDemo.oldKeyDenied!==true||authorityRegistryDemo.secondSequence!==2)
  throw new Error('AUTHORITY_REGISTRY_WITNESS_INVALID');
const authorityRegistryWitness={...authorityRegistryDemo,scope:'Actual independent issuer child, signed offline snapshots, append-only key rotation/revocation and role keyring derivation; no online registry, trusted clock, hardware custody or cross-device convergence.'};
fs.writeFileSync(path.join(out,'authority-registry.json'),JSON.stringify(authorityRegistryWitness,null,2));authorityRegistryScenarios.push(authorityRegistryWitness);
const authorityRegistryDistributionScenarios=[];
const authorityRegistryDistributionDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-distribution-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry distribution: ${stderr}`)));
});
if(authorityRegistryDistributionDemo.status!=='VERIFIED_LOCAL_OFFLINE_DISTRIBUTION_QUORUM'
  || authorityRegistryDistributionDemo.forkDetected!==true || authorityRegistryDistributionDemo.insufficientQuorum!==true
  || authorityRegistryDistributionDemo.acceptedMirrors.length < authorityRegistryDistributionDemo.threshold)
  throw new Error('AUTHORITY_REGISTRY_DISTRIBUTION_WITNESS_INVALID');
const authorityRegistryDistributionWitness={...authorityRegistryDistributionDemo,
  scope:'Actual independent issuer and mirror child processes, signed receipts over one registry root and deterministic fork/quorum rejection; no online publication, trusted clock, transparent log or cross-device convergence.'};
fs.writeFileSync(path.join(out,'authority-registry-distribution.json'),JSON.stringify(authorityRegistryDistributionWitness,null,2));
authorityRegistryDistributionScenarios.push(authorityRegistryDistributionWitness);
const authorityRegistryConvergenceScenarios=[];
const authorityRegistryConvergenceDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-convergence-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry convergence: ${stderr}`)));
});
if(authorityRegistryConvergenceDemo.status!=='VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE'
  || authorityRegistryConvergenceDemo.firstSequence!==1 || authorityRegistryConvergenceDemo.lastSequence < 2
  || authorityRegistryConvergenceDemo.forkDetected!==true || authorityRegistryConvergenceDemo.mirrorSetDrift!==true
  || authorityRegistryConvergenceDemo.stableMirrors.length < 2)
  throw new Error('AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
const authorityRegistryConvergenceWitness={...authorityRegistryConvergenceDemo,
  scope:'Actual independent issuer and mirror child processes, contiguous signed registry history with per-snapshot quorum, stable mirror-set check and deterministic historical fork rejection; no online transparency log, trusted clock or durable cross-host convergence.'};
fs.writeFileSync(path.join(out,'authority-registry-convergence.json'),JSON.stringify(authorityRegistryConvergenceWitness,null,2));
authorityRegistryConvergenceScenarios.push(authorityRegistryConvergenceWitness);
const authorityRegistryConvergenceStoreScenarios=[];
const authorityRegistryConvergenceStoreDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-convergence-store-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry convergence store: ${stderr}`)));
});
if(authorityRegistryConvergenceStoreDemo.status!=='VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE_STORE'
  || authorityRegistryConvergenceStoreDemo.firstOperation!=='appended'
  || authorityRegistryConvergenceStoreDemo.extensionOperation!=='extended'
  || authorityRegistryConvergenceStoreDemo.replayOperation!=='unchanged'
  || authorityRegistryConvergenceStoreDemo.firstSequence!==1 || authorityRegistryConvergenceStoreDemo.lastSequence < 2
  || authorityRegistryConvergenceStoreDemo.storeWritten!==true
  || authorityRegistryConvergenceStoreDemo.rollbackDetected!==true
  || authorityRegistryConvergenceStoreDemo.prefixRewriteDetected!==true)
  throw new Error('AUTHORITY_REGISTRY_CONVERGENCE_STORE_WITNESS_INVALID');
const authorityRegistryConvergenceStoreWitness={...authorityRegistryConvergenceStoreDemo,
  scope:'Actual local atomic store write/read with directory writer lease, full-history extension and deterministic rollback/prefix-rewrite rejection; no online transparency log, trusted clock or durable cross-host consensus.'};
fs.writeFileSync(path.join(out,'authority-registry-convergence-store.json'),JSON.stringify(authorityRegistryConvergenceStoreWitness,null,2));
authorityRegistryConvergenceStoreScenarios.push(authorityRegistryConvergenceStoreWitness);
const authorityRegistryConvergenceWitnessScenarios=[];
const authorityRegistryConvergenceWitnessDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-convergence-witness-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry convergence witness: ${stderr}`)));
});
if(authorityRegistryConvergenceWitnessDemo.status!=='VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE_WITNESS'
  || authorityRegistryConvergenceWitnessDemo.firstVerification!==true
  || authorityRegistryConvergenceWitnessDemo.extensionVerification!==true
  || authorityRegistryConvergenceWitnessDemo.firstSequence!==1
  || authorityRegistryConvergenceWitnessDemo.lastSequence < 2
  || authorityRegistryConvergenceWitnessDemo.storeWritten!==true
  || authorityRegistryConvergenceWitnessDemo.replacementStoreDetected!==true
  || authorityRegistryConvergenceWitnessDemo.replacementWitnessDetected!==true
  || authorityRegistryConvergenceWitnessDemo.rollbackDetected!==true)
  throw new Error('AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
const authorityRegistryConvergenceExternalWitness={...authorityRegistryConvergenceWitnessDemo,
  scope:'Actual independent convergence-witness signer child binds exact local store state and contiguous witness sequence; witness retention remains caller supplied, with no online transparency log, trusted clock or durable cross-host consensus.'};
fs.writeFileSync(path.join(out,'authority-registry-convergence-witness.json'),JSON.stringify(authorityRegistryConvergenceExternalWitness,null,2));
authorityRegistryConvergenceWitnessScenarios.push(authorityRegistryConvergenceExternalWitness);
const authorityRegistryCrossHostReplayScenarios=[];
const authorityRegistryCrossHostReplayDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-cross-host-replay-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry cross-host replay: ${stderr}`)));
});
if(authorityRegistryCrossHostReplayDemo.status!=='VERIFIED_LOCAL_MULTI_PROCESS_CROSS_HOST_REPLAY'
  || authorityRegistryCrossHostReplayDemo.independentProcesses!==true
  || authorityRegistryCrossHostReplayDemo.independentDirectories!==true
  || authorityRegistryCrossHostReplayDemo.importedOnSecondHost!==true
  || authorityRegistryCrossHostReplayDemo.replayOperation!=='unchanged'
  || authorityRegistryCrossHostReplayDemo.secondHostExtension!=='extended'
  || authorityRegistryCrossHostReplayDemo.lastSequence < 3
  || authorityRegistryCrossHostReplayDemo.forkDetected!==true
  || authorityRegistryCrossHostReplayDemo.mirrorSetDriftDetected!==true
  || authorityRegistryCrossHostReplayDemo.sequenceGapDetected!==true
  || authorityRegistryCrossHostReplayDemo.rejectedStateRetained!==true)
  throw new Error('AUTHORITY_REGISTRY_CROSS_HOST_REPLAY_INVALID');
const authorityRegistryCrossHostReplayWitness={...authorityRegistryCrossHostReplayDemo,
  scope:'Actual independent local Node child processes and directories exchange public convergence-store state and replay signed histories; not two physical hosts, online authority, trusted time or cross-host production consensus.'};
fs.writeFileSync(path.join(out,'authority-registry-cross-host-replay.json'),JSON.stringify(authorityRegistryCrossHostReplayWitness,null,2));
authorityRegistryCrossHostReplayScenarios.push(authorityRegistryCrossHostReplayWitness);
const authorityRegistryLoopbackTransferScenarios=[];
const authorityRegistryLoopbackTransferDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-loopback-transfer-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry loopback transfer: ${stderr}`)));
});
if(authorityRegistryLoopbackTransferDemo.status!=='VERIFIED_LOCAL_TINP_LOOPBACK_STATE_TRANSFER'
  || authorityRegistryLoopbackTransferDemo.transport!=='tcp'
  || authorityRegistryLoopbackTransferDemo.frameType!=='DATA'
  || authorityRegistryLoopbackTransferDemo.independentProcesses!==true
  || authorityRegistryLoopbackTransferDemo.independentDirectories!==true
  || authorityRegistryLoopbackTransferDemo.networkTransferOperation!=='appended'
  || authorityRegistryLoopbackTransferDemo.importedOnSecondNode!==true
  || authorityRegistryLoopbackTransferDemo.networkReplayOperation!=='unchanged'
  || authorityRegistryLoopbackTransferDemo.secondNodeExtension!=='extended'
  || authorityRegistryLoopbackTransferDemo.reverseNetworkTransferOperation!=='extended'
  || authorityRegistryLoopbackTransferDemo.lastSequence < 3
  || authorityRegistryLoopbackTransferDemo.senderFrames < 2
  || authorityRegistryLoopbackTransferDemo.receiverFrames < 2
  || authorityRegistryLoopbackTransferDemo.receiverInvalidFrames!==0
  || authorityRegistryLoopbackTransferDemo.peerAuthenticationConfigured!==true
  || authorityRegistryLoopbackTransferDemo.forkDetected!==true
  || authorityRegistryLoopbackTransferDemo.mirrorSetDriftDetected!==true
  || authorityRegistryLoopbackTransferDemo.sequenceGapDetected!==true
  || authorityRegistryLoopbackTransferDemo.tamperedTransferDetected!==true
  || authorityRegistryLoopbackTransferDemo.rejectedStateRetained!==true
  || authorityRegistryLoopbackTransferDemo.privateMaterialTransferred!==false)
  throw new Error('AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID');
const authorityRegistryLoopbackTransferWitness={...authorityRegistryLoopbackTransferDemo,
  scope:'Actual TINP DATA framing over TCP loopback between two independent local Node child processes and directories; public convergence-store state is imported through existing append validators; not two physical hosts, encrypted transport, trusted time, online authority or production conflict consensus.'};
fs.writeFileSync(path.join(out,'authority-registry-loopback-transfer.json'),JSON.stringify(authorityRegistryLoopbackTransferWitness,null,2));
authorityRegistryLoopbackTransferScenarios.push(authorityRegistryLoopbackTransferWitness);
const authorityRegistryTlsLoopbackTransferScenarios=[];
const authorityRegistryTlsLoopbackTransferDemo=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/authority-registry-tls-loopback-transfer-demo.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x.toString('utf8'));child.stderr.on('data',x=>stderr+=x.toString('utf8'));
  child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error(`Authority registry TLS loopback transfer: ${stderr}`)));
});
if(authorityRegistryTlsLoopbackTransferDemo.status!=='VERIFIED_LOCAL_TINP_TLS_LOOPBACK_STATE_TRANSFER'
  || authorityRegistryTlsLoopbackTransferDemo.transport!=='tls'
  || authorityRegistryTlsLoopbackTransferDemo.frameType!=='DATA'
  || authorityRegistryTlsLoopbackTransferDemo.encryptedTransport!==true
  || authorityRegistryTlsLoopbackTransferDemo.tlsVersion!=='TLSv1.3'
  || typeof authorityRegistryTlsLoopbackTransferDemo.tlsCipher!=='string'
  || authorityRegistryTlsLoopbackTransferDemo.tlsHandshakes < 2
  || authorityRegistryTlsLoopbackTransferDemo.peerCertificatePinned!==true
  || authorityRegistryTlsLoopbackTransferDemo.peerAuthenticationConfigured!==true
  || authorityRegistryTlsLoopbackTransferDemo.networkTransferOperation!=='appended'
  || authorityRegistryTlsLoopbackTransferDemo.networkReplayOperation!=='unchanged'
  || authorityRegistryTlsLoopbackTransferDemo.reverseNetworkTransferOperation!=='extended'
  || authorityRegistryTlsLoopbackTransferDemo.lastSequence < 3
  || authorityRegistryTlsLoopbackTransferDemo.receiverInvalidFrames!==0
  || authorityRegistryTlsLoopbackTransferDemo.forkDetected!==true
  || authorityRegistryTlsLoopbackTransferDemo.mirrorSetDriftDetected!==true
  || authorityRegistryTlsLoopbackTransferDemo.sequenceGapDetected!==true
  || authorityRegistryTlsLoopbackTransferDemo.tamperedTransferDetected!==true
  || authorityRegistryTlsLoopbackTransferDemo.rejectedStateRetained!==true
  || authorityRegistryTlsLoopbackTransferDemo.privateMaterialTransferred!==false)
  throw new Error('AUTHORITY_REGISTRY_TLS_LOOPBACK_TRANSFER_INVALID');
const authorityRegistryTlsLoopbackTransferWitness={...authorityRegistryTlsLoopbackTransferDemo,
  scope:'Actual TINP DATA framing over TLS 1.3 loopback between two independent local Node child processes and directories; peer certificates are caller-pinned and public convergence-store state is imported through existing append validators; not two physical hosts, production certificate custody, trusted time, online authority or production conflict consensus.'};
fs.writeFileSync(path.join(out,'authority-registry-tls-loopback-transfer.json'),JSON.stringify(authorityRegistryTlsLoopbackTransferWitness,null,2));
authorityRegistryTlsLoopbackTransferScenarios.push(authorityRegistryTlsLoopbackTransferWitness);
const mismatches=tracked.filter(x=>sha(fs.readFileSync(x.path))!==x.sha256);
if(mismatches.length)throw new Error('Source changed during verification: '+JSON.stringify(mismatches));
const summary={format:'twni.local-verification.v0.1',status:'VERIFIED_LOCAL_CANDIDATE',startedAt,finishedAt:new Date().toISOString(),
  version,
  node:process.version,platform:process.platform,architecture:process.arch,
  tests:{command:result.command,exitCode:result.code,count:Number(result.stdout.match(/# tests (\d+)/)?.[1]),passed:Number(result.stdout.match(/# pass (\d+)/)?.[1]),failed:Number(result.stdout.match(/# fail (\d+)/)?.[1]),
    stdout:relative(path.join(out,'tests.tap')),stdoutSha256:sha(Buffer.from(result.stdout)),stderr:relative(path.join(out,'tests.stderr.txt'))},
  scenarios,recoveryScenarios,pendingScenarios,operatorScenarios,recoveryAnchorScenarios,authorityRegistryScenarios,authorityRegistryDistributionScenarios,authorityRegistryConvergenceScenarios,authorityRegistryConvergenceStoreScenarios,authorityRegistryConvergenceWitnessScenarios,authorityRegistryCrossHostReplayScenarios,authorityRegistryLoopbackTransferScenarios,authorityRegistryTlsLoopbackTransferScenarios,sourceFiles:tracked,sourceTreeRoot:sha(Buffer.from(JSON.stringify(tracked))),
  k400Verdict:'NOT_ADJUDICATED',production:'NOT_DEPLOYED',publicNetwork:'NOT_RUN',
  boundaries:['Ephemeral local trust fixture; no production identity enrollment or TLS confidentiality',
    'Only bounded pure read-only code-point counting; not arbitrary actions or exactly-once external side effects',
    'Durable mode uses Windows current-user DPAPI and signed recovery evidence; external anchor is opt-in and only covers its last explicit ledger prefix',
    'Authority registry, distribution bundle, convergence history/store and external convergence witness are offline signed inputs with caller-supplied key material; quorum/fork/history/store/witness checks do not provide online publication, trusted clock, transparency or durable cross-device convergence',
    'Cross-host replay evidence uses independent local Node processes and directories only; it does not prove two physical hosts, encrypted transport, trusted time or production conflict consensus',
    'Loopback transfer evidence uses existing TINP DATA framing over one TCP loopback interface and existing convergence-store append validators; it does not prove physical cross-host delivery, encrypted transport, trusted time or production conflict consensus',
    'TLS loopback evidence uses caller-pinned ephemeral certificates over one local TLS 1.3 interface; it does not prove production certificate custody, physical cross-host enrollment, trusted time or production conflict consensus',
    'No browser replacement, application-seed cross-platform runtime, VPN or entire P00-P15 completion']};
fs.writeFileSync(path.join(out,'LOCAL_VERIFICATION.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.status,tests:summary.tests.count,passed:summary.tests.passed,scenarios:scenarios.map(x=>({transport:x.transport,pids:x.pids,path:x.firstPath,performance:x.boundedPerformance}))},null,2));
