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
const mismatches=tracked.filter(x=>sha(fs.readFileSync(x.path))!==x.sha256);
if(mismatches.length)throw new Error('Source changed during verification: '+JSON.stringify(mismatches));
const summary={format:'twni.local-verification.v0.1',status:'VERIFIED_LOCAL_CANDIDATE',startedAt,finishedAt:new Date().toISOString(),
  version,
  node:process.version,platform:process.platform,architecture:process.arch,
  tests:{command:result.command,exitCode:result.code,count:Number(result.stdout.match(/# tests (\d+)/)?.[1]),passed:Number(result.stdout.match(/# pass (\d+)/)?.[1]),failed:Number(result.stdout.match(/# fail (\d+)/)?.[1]),
    stdout:relative(path.join(out,'tests.tap')),stdoutSha256:sha(Buffer.from(result.stdout)),stderr:relative(path.join(out,'tests.stderr.txt'))},
  scenarios,recoveryScenarios,pendingScenarios,sourceFiles:tracked,sourceTreeRoot:sha(Buffer.from(JSON.stringify(tracked))),
  k400Verdict:'NOT_ADJUDICATED',production:'NOT_DEPLOYED',publicNetwork:'NOT_RUN',
  boundaries:['Ephemeral local trust fixture; no production identity enrollment or TLS confidentiality',
    'Only bounded pure read-only code-point counting; not arbitrary actions or exactly-once external side effects',
    'Durable mode uses Windows current-user DPAPI and signed recovery evidence; no independent anti-rollback anchor or global revocation convergence',
    'No browser replacement, application-seed cross-platform runtime, VPN or entire P00-P15 completion']};
fs.writeFileSync(path.join(out,'LOCAL_VERIFICATION.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.status,tests:summary.tests.count,passed:summary.tests.passed,scenarios:scenarios.map(x=>({transport:x.transport,pids:x.pids,path:x.firstPath,performance:x.boundedPerformance}))},null,2));
