import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {InternetSuite} from '../src/suite.mjs';
import {seal,clone,newIdentity,rootHash} from '../src/identity.mjs';
import {EvidenceLedger,verifyLedger} from '../src/evidence.mjs';
import {ConstrainedRoutes} from '../src/routing.mjs';
import {decodeFrame,encodeFrame} from '../vendor/tinp/src/protocol.mjs';

test('authenticated network rejects mutated transaction facts before any provider execution',async()=>{
  const suite=await InternetSuite.start();
  try{
    const selection=await suite.discover('C');const good=await suite.buildRequest('中文😀',selection);
    const cases=[
      ['subject',q=>q.subjectId='subject:intruder'],
      ['world',q=>q.worldId='world:other'],
      ['capability',q=>q.capabilityId='file.write'],
      ['capability-version',q=>q.capabilityVersion='2.0.0'],
      ['contract',q=>q.contractRoot='0'.repeat(64)],
      ['evidence',q=>q.previousEvidenceRoot='0'.repeat(64)],
      ['authority',q=>q.authorityScope='file.write'],
      ['protocol',q=>q.version='9.0.0'],
      ['payload-control',q=>q.payload.providerId='arbitrary'],
      ['authoritative-reality',q=>q.classification='authoritative'],
      ['lease-signature',q=>q.lease.body.scopes.push('file.write')],
      ['session-signature',q=>q.session.body.subjectId='subject:other'],
      ['expiry',q=>{q.lease.body.expiresAtMs=Date.now()-1;q.lease=seal(q.lease.body,suite.authority.privateKey);q.session.body.leaseRoot=q.lease.root;q.session.body.expiresAtMs=q.lease.body.expiresAtMs;q.session=seal(q.session.body,suite.authority.privateKey);}],
      ['scope-expansion',q=>{q.session.body.scopes.push('file.write');q.session=seal(q.session.body,suite.authority.privateKey);}],
    ];
    for(const [name,mutate]of cases){const q=clone(good.body);mutate(q);
      await assert.rejects(suite.wire('C','INTENT',seal(q,suite.subjectIdentity.privateKey),selection.route),undefined,name);
    }
    const forged=seal(good.body,newIdentity().privateKey);
    await assert.rejects(suite.wire('C','INTENT',forged,selection.route),e=>e.code==='RCL_GUARD_DENIED');
    assert.equal((await suite.nodes.get('C').call('stats')).executions,0);
    const receipt=await suite.wire('C','INTENT',good,selection.route);
    assert.equal(suite.verifyReceipt(receipt,good).result.count,3);
  }finally{await suite.close();}
});

test('concurrent exact retry executes once; changed request content cannot replay',async()=>{
  const suite=await InternetSuite.start();
  try{
    const s=await suite.discover('C');const request=await suite.buildRequest('repeat',s);
    const [a,b]=await Promise.all([suite.wire('C','INTENT',request,s.route),suite.wire('C','INTENT',request,s.route)]);
    assert.equal(a.root,b.root);assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
    const changed=clone(request.body);changed.payload.text='different';
    await assert.rejects(suite.wire('C','INTENT',seal(changed,suite.subjectIdentity.privateKey),s.route),e=>e.code==='REPLAY_CONFLICT');
    await suite.revoke();
    await assert.rejects(suite.wire('C','INTENT',request,s.route),e=>e.code==='RCL_GUARD_DENIED');
    await assert.rejects(suite.use('denied'),e=>e.code==='LEASE_REVOKED');
    assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
  }finally{await suite.close();}
});

test('receipt mutation and durable ledger tampering cannot become verified evidence',async()=>{
  const suite=await InternetSuite.start();
  try{
    const result=await suite.use('evidence');
    const receipt=clone(result.receipt);receipt.body.result.count=99;
    assert.throws(()=>suite.verifyReceipt(receipt,result.request),e=>e.code==='RECEIPT_SIGNATURE_INVALID');
    const reloaded=new EvidenceLedger(suite.ledger.file);assert.equal(reloaded.root,suite.ledger.root);
    const events=clone(suite.ledger.events);events[1].detail.version='tampered';
    assert.throws(()=>verifyLedger(events),e=>e.code==='EVIDENCE_CHAIN_INVALID');
    const badFile=suite.ledger.file+'.tampered';fs.writeFileSync(badFile,events.map(x=>JSON.stringify(x)).join('\n')+'\n');
    assert.throws(()=>new EvidenceLedger(badFile),e=>e.code==='EVIDENCE_CHAIN_INVALID');
    assert.equal(verifyLedger(suite.ledger.events),suite.ledger.root);
  }finally{await suite.close();}
});

test('bounded path selection applies cost, region, latency and energy together',()=>{
  const r=new ConstrainedRoutes().connect('A','B',{cost:1,latencyMs:8,energy:1}).connect('B','C',{cost:1,latencyMs:8,energy:1}).connect('A','C',{cost:5,latencyMs:1,energy:4});
  assert.deepEqual(r.plan('A','C').path,['A','B','C']);
  assert.deepEqual(r.plan('A','C',{maxLatencyMs:2}).path,['A','C']);
  assert.throws(()=>r.plan('A','C',{maxLatencyMs:2,maxCost:3}));
  assert.throws(()=>r.plan('A','C',{region:'other'}));
  assert.throws(()=>r.plan('A','C',{maxEnergy:1}));
  assert.throws(()=>new ConstrainedRoutes().connect('A','B',{cost:-1}));
});

test('deterministic malformed wire corpus rejects framing errors',()=>{
  for(let n=0;n<100;n++){
    const bytes=Buffer.alloc(n,0xa5);assert.throws(()=>decodeFrame(bytes));
  }
  const valid=encodeFrame('DATA',{unicode:'你好'});assert.equal(decodeFrame(valid).payload.unicode,'你好');
  for(const offset of [0,4,6,8,9,10,11]){
    const bytes=Buffer.from(valid);bytes[offset]=255;assert.throws(()=>decodeFrame(bytes));
  }
});

test('integrated RCL migration rejects a changed subject before issuing a replacement',async()=>{
  const suite=await InternetSuite.start();
  try{
    await suite.use('first');const previous=clone(suite.session);
    suite.session.body.subjectId='subject:other';
    await assert.rejects(suite.bindSession('B'),e=>e.code==='RCL_MIGRATION_DENIED');
    suite.session=previous;
    await suite.migrateSource('B');const result=await suite.use('second');
    assert.ok(result.request.body.session.body.migrationGuard.programRoot);
    assert.equal(result.receipt.body.subjectId,previous.body.subjectId);
  }finally{await suite.close();}
});

test('integrated RCL route gate enforces signed latency and energy budgets from trusted edges',async()=>{
  const suite=await InternetSuite.start();
  try{
    const s=await suite.discover('C');
    for(const field of ['maxLatencyMs','maxEnergy']){
      const original=suite.lease;suite.lease=seal({...original.body,[field]:0},suite.authority.privateKey);
      const request=await suite.buildRequest('denied-by-route-rcl',s);
      await assert.rejects(suite.wire('C','INTENT',request,s.route),e=>e.code==='RCL_ROUTE_DENIED');
      suite.lease=original;
    }
    assert.equal((await suite.nodes.get('C').call('stats')).executions,0);
    const request=await suite.buildRequest('🌏'.repeat(4096),s);
    const receipt=await suite.wire('C','INTENT',request,s.route);
    assert.equal(suite.verifyReceipt(receipt,request).result.count,4096);
    assert.equal(receipt.body.routeGuard.allowed,true);
  }finally{await suite.close();}
});

test('an ambiguous lost response reconciles the exact signed request without a second execution',async()=>{
  const suite=await InternetSuite.start();
  try{
    const selected=await suite.discover('C');const send=suite.wire.bind(suite);let dropped=false;
    suite.wire=async(...args)=>{
      const value=await send(...args);
      if(args[1]==='INTENT'&&!dropped){dropped=true;const error=new Error('injected response loss after real execution');error.code='TRANSPORT_TIMEOUT';throw error;}
      return value;
    };
    const result=await suite.executeSelection('response lost 🌏',selected);
    assert.equal(result.status,'executed');assert.equal((await suite.nodes.get('C').call('stats')).executions,1);
    assert.equal(suite.ledger.events.at(-1).detail.exactRequestRetries,1);
    assert.equal(verifyLedger(suite.ledger.events),suite.ledger.root);
  }finally{await suite.close();}
});
