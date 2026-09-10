import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {InternetSuite,parseLifeIntent} from '../src/suite.mjs';
import {authentic,rootHash} from '../src/identity.mjs';

const schemaPath=fileURLToPath(new URL('../shared-ir/shared.schema.json',import.meta.url));
const schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));
const names=['SubjectRef','IntentSpec','CapabilitySpec','AuthorityLease','EvidenceEvent','WorldRef','NodeRef','RoutePlan','SessionRef','ResourceBudget'];
const select=(value,fields)=>Object.fromEntries(fields.map(key=>[key,value[key]]));
const PYTHON_VALIDATOR=String.raw`
import sys,json
from jsonschema import Draft202012Validator,FormatChecker
packet=json.load(sys.stdin)
schema=packet['schema']
Draft202012Validator.check_schema(schema)
results=[]
for case in packet['cases']:
    selected={'$schema':schema['$schema'],'$defs':schema['$defs'],'$ref':'#/$defs/'+case['definition']}
    validator=Draft202012Validator(selected,format_checker=FormatChecker())
    errors=list(validator.iter_errors(case['value']))
    union_errors=list(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(case['value']))
    results.append({'id':case['id'],'valid':not errors,'unionValid':not union_errors,'errors':[e.message for e in errors[:3]]})
print(json.dumps({'engine':'python-jsonschema-Draft202012Validator','results':results},ensure_ascii=False))
`;

function validateCases(cases) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.NEXT_INTERNET_PYTHON||'python',['-X','utf8','-c',PYTHON_VALIDATOR],{
      windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],
    });
    const output=[],errors=[];let done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(new Error('shared schema Python validator timed out'));},20000);
    child.once('error',error=>finish(error));
    child.stdin.once('error',error=>finish(error));
    child.stdout.on('data',chunk=>output.push(chunk));
    child.stderr.on('data',chunk=>errors.push(chunk));
    child.once('close',code=>{
      if(code!==0)return finish(new Error(`Python jsonschema failed (${code}): ${Buffer.concat(errors).toString('utf8')}`));
      try{finish(null,JSON.parse(Buffer.concat(output).toString('utf8')));}catch(error){finish(error);}
    });
    child.stdin.end(JSON.stringify({schema,cases}));
  });
}

test('all ten shared projections validate real signed runtime data with Python jsonschema and reject malformed fields', {timeout:90000}, async t=>{
  assert.deepEqual(Object.keys(schema.$defs).sort(),[...names].sort());
  const root=fileURLToPath(new URL('../.runs/shared-ir/',import.meta.url));
  fs.mkdirSync(root,{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'run-'));
  const suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();});
  const intent=parseLifeIntent('我要使用字符计数能力完成：世界🌏');
  await suite.use(intent.text);
  await suite.migrateSource('B');
  const result=await suite.use(intent.text);
  assert.equal(result.status,'executed');
  assert.equal(result.result.count,[...intent.text].length);
  const q=result.request.body,r=result.receipt.body;
  assert.equal(authentic(result.request,suite.subjectIdentity.publicKey),true);
  assert.equal(authentic(result.receipt,suite.nodes.get('C').info.publicKey),true);
  assert.equal(authentic(q.lease,suite.authority.publicKey),true);
  assert.equal(authentic(q.session,suite.authority.publicKey),true);
  assert.equal(r.requestRoot,result.request.root);
  assert.equal(r.resultRoot,rootHash(result.result));
  assert.equal(r.previousEvidenceRoot,q.previousEvidenceRoot);
  assert.equal(r.routeGuard.allowed,true);
  assert.equal(r.guard.allowed,true);
  assert.deepEqual(r.route,q.route.path);
  assert.equal(q.session.body.sourceNodeId,'B');
  assert.ok(q.session.body.migrationGuard.sourceSha256);
  const event=suite.ledger.events.find(e=>e.type==='execution.verified'&&e.detail.receipt.root===result.receipt.root);
  assert.ok(event);
  assert.equal(event.detail.receipt.body.requestRoot,result.request.root);
  const node=suite.ledger.events[0].detail.nodes.find(n=>n.nodeId==='C');
  const samples={
    SubjectRef:select(q.session.body,['subjectId','continuityRoot']),
    IntentSpec:{capabilityId:q.capabilityId,text:q.payload.text},
    CapabilitySpec:suite.advertisements.get('C').body.provider.capability,
    AuthorityLease:q.lease.body,
    EvidenceEvent:event,
    WorldRef:select(q.session.body,['worldId']),
    NodeRef:node,
    RoutePlan:q.route,
    SessionRef:q.session.body,
    ResourceBudget:select(q.lease.body,['maxCost','maxLatencyMs','maxEnergy','maxRetentionSeconds','region']),
  };
  const mutations={
    SubjectRef:x=>{x.continuityRoot='not-a-root';},
    IntentSpec:x=>{x.text=42;},
    CapabilitySpec:x=>{x.authorityRequired='text.read';},
    AuthorityLease:x=>{x.expiresAtMs='tomorrow';},
    EvidenceEvent:x=>{x.previousRoot=null;},
    WorldRef:x=>{delete x.worldId;},
    NodeRef:x=>{x.endpoint.transport='quic';},
    RoutePlan:x=>{x.path.push(x.path[0]);},
    SessionRef:x=>{delete x.leaseRoot;},
    ResourceBudget:x=>{x.maxCost=-1;},
  };
  const cases=names.flatMap(definition=>{
    const invalid=structuredClone(samples[definition]);mutations[definition](invalid);
    return [{id:`${definition}:runtime`,definition,value:samples[definition],expected:true},
      {id:`${definition}:malformed`,definition,value:invalid,expected:false}];
  });
  const borrowed=structuredClone(samples.SubjectRef);borrowed.nodeId='C';
  cases.push({id:'SubjectRef:node-is-not-subject',definition:'SubjectRef',value:borrowed,expected:false});
  const out=await validateCases(cases);
  assert.equal(out.engine,'python-jsonschema-Draft202012Validator');
  assert.equal(out.results.length,cases.length);
  for(const expected of cases){
    const actual=out.results.find(item=>item.id===expected.id);
    assert.equal(actual.valid,expected.expected,`${expected.id}: ${actual.errors.join('; ')}`);
    assert.equal(actual.unionValid,expected.expected,`${expected.id}: schema union disagrees`);
  }
  t.diagnostic(JSON.stringify({engine:out.engine,positiveRuntimeObjects:10,malformedRejections:11,directory}));
});

test('protocol registry distinguishes bounded implemented behaviors from all sixteen roadmap domains',()=>{
  const registry=JSON.parse(fs.readFileSync(new URL('../registry/protocols.json',import.meta.url),'utf8'));
  assert.equal(registry.domains.length,16);
  assert.equal(new Set(registry.domains.map(d=>d.id)).size,16);
  for(let index=0;index<16;index++)assert.ok(registry.domains.some(d=>d.id===`P${String(index).padStart(2,'0')}`));
  for(const domain of registry.domains){
    assert.ok(registry.statusVocabulary.includes(domain.status));
    assert.ok(domain.ownerBoundary.length>0);
    if(domain.status!=='implemented')assert.ok(domain.notImplemented.length>0);
    if(domain.status==='not_implemented')assert.equal(domain.implemented.length,0);
  }
  assert.equal(registry.canonicalPromotionPerformed,false);
  assert.deepEqual(registry.rclCellsAdmitted,[]);
});
