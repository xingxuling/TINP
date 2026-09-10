import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {InternetSuite} from '../src/suite.mjs';
import {seal,rootHash,newIdentity} from '../src/identity.mjs';
import {LocalTransport} from '../src/transport.mjs';
import {makeForwardEnvelope} from '../vendor/tinp/src/forwarding.mjs';

async function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'twni-security-'));
  const suite=await InternetSuite.start({directory});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  return suite;
}

test('security: consumed session evidence anchor cannot authorize a second divergent request',async t=>{
  const suite=await fixture(t);
  const selected=await suite.discover('C');
  const first=await suite.buildRequest('first',selected,{requestId:'anchor-first'});
  const fork=seal({...first.body,requestId:'anchor-fork',payload:{text:'second'}},suite.subjectIdentity.privateKey);
  const receipt=await suite.wire('C','INTENT',first,selected.route);
  assert.equal(receipt.body.status,'executed');
  await assert.rejects(suite.wire('C','INTENT',fork,selected.route),/EVIDENCE|SESSION|ANCHOR|CONTINUITY/);
});

test('security: subject cannot lower route cost below an authority budget by rewriting route metrics',async t=>{
  const suite=await fixture(t);
  const selected=await suite.discover('C');
  assert.equal(selected.route.cost,2);
  suite.lease=seal({...suite.lease.body,maxCost:1},suite.authority.privateKey);
  const forgedRoute={...selected.route,cost:0};
  const {routeRoot,...routeBody}=forgedRoute;
  forgedRoute.routeRoot=rootHash(routeBody);
  const request=await suite.buildRequest('over-budget',selected,{overrides:{route:forgedRoute}});
  await assert.rejects(suite.wire('C','INTENT',request,forgedRoute),/ROUTE|BUDGET|COST/);
});

test('security: concurrent exact retries return one execution and identical receipt',async t=>{
  const suite=await fixture(t);
  const selected=await suite.discover('C');
  const request=await suite.buildRequest('幂等🙂',selected,{requestId:'same-request'});
  const [a,b]=await Promise.all([suite.wire('C','INTENT',request,selected.route),suite.wire('C','INTENT',request,selected.route)]);
  assert.equal(a.root,b.root);
  const stats=await suite.stats();
  assert.equal(stats.find(x=>x.nodeId==='C').executions,1);
  assert.equal(new Set(stats.map(x=>x.pid)).size,3);
  assert.ok(stats.find(x=>x.nodeId==='B').metrics.sentFrames>0);
});

test('security: trusted provider receipt cannot relabel world, capability or result status',async t=>{
  const suite=await fixture(t);
  const selected=await suite.discover('C');
  const request=await suite.buildRequest('receipt-bindings',selected);
  const receipt=await suite.wire('C','INTENT',request,selected.route);
  // Simulates a faulty/compromised pinned provider signing false receipt fields.
  // A valid signature alone must not override the original request bindings.
  const compromised=newIdentity();
  suite.nodes.get('C').info.publicKey=compromised.publicKey;
  for(const patch of [{worldId:'world:other'},{capabilityId:'state.mutate'},{status:'failed'},
    {nodeId:'B'},{requestId:'another'},{route:['C']},{version:'9.0'}]) {
    const wrong=seal({...receipt.body,...patch},compromised.privateKey);
    assert.throws(()=>suite.verifyReceipt(wrong,request),/RECEIPT_BINDING_INVALID/);
  }
});

test('security: authority-issued source node binding cannot be replaced by the subject',async t=>{
  const suite=await fixture(t);
  const selected=await suite.discover('C');
  const first=await suite.buildRequest('source-bound',selected);
  assert.equal(first.body.session.body.sourceNodeId,'A');
  const newRoute=suite.routes.plan('B','C');
  const changed=seal({...first.body,route:newRoute},suite.subjectIdentity.privateKey);
  suite.currentSource='B';
  await assert.rejects(suite.wire('C','INTENT',changed,newRoute),/SOURCE|SESSION|ROUTE/);
});

test('security: signed slow requests have a hard concurrency bound and forged senders never invoke handlers',async()=>{
  const sender=newIdentity(),transport=new LocalTransport({nodeId:'receiver',identity:newIdentity()});
  transport.peers={sender:{publicKey:sender.publicKey}};
  transport.send=async()=>{};
  let entered=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  transport.handler=async()=>{entered++;await gate;};
  const jobs=Array.from({length:70},(_,i)=>transport.receive(seal({sender:'sender',recipient:'receiver',kind:'request',rpcId:String(i),value:{}},sender.privateKey)));
  const forged=seal({sender:'sender',recipient:'receiver',kind:'request',rpcId:'forged',value:{}},newIdentity().privateKey);
  await transport.receive(forged);
  assert.equal(entered,64);
  assert.equal(transport.metrics.overloadRejected,6);
  assert.equal(transport.metrics.invalidFrames,1);
  release();await Promise.all(jobs);
  assert.equal(transport.activeHandlers,0);
  await transport.close();
});

test('security: request timeout cancels a bandwidth-delayed UDP transmission',async t=>{
  const a=await new LocalTransport({nodeId:'a',identity:newIdentity()}).bind();
  const b=await new LocalTransport({nodeId:'b',identity:newIdentity()}).bind();
  t.after(async()=>{await a.close();await b.close();});
  a.peers={b:{publicKey:b.identity.publicKey,endpoint:b.endpoint()}};
  b.peers={a:{publicKey:a.identity.publicKey,endpoint:a.endpoint()}};
  let calls=0;b.handler=async()=>{calls++;return {};};
  a.bandwidth=1;
  await assert.rejects(a.request('b',{},20),/TRANSPORT_TIMEOUT/);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(a.pending.size,0);
  assert.equal(a.metrics.sentFrames,0);
  assert.equal(calls,0);
});

test('security: forwarding rejects skipped ingress hops, cycles, unknown edges and tampering',async t=>{
  const suite=await fixture(t);
  const route=suite.routes.plan('A','C');
  const valid=makeForwardEnvelope({route,payloadType:'DISCOVER',payload:{},ttl:6});
  const reseal=body=>{const {forwardRoot,...base}=body;return {...base,forwardRoot:rootHash(base)};};
  for(const [forward,code] of [
    [reseal({...valid,hopIndex:1}),/SOURCE_HOP_INVALID/],
    [reseal({...valid,path:['A','B','A','C']}),/ROUTE_INVALID/],
    [reseal({...valid,path:['A','X','C']}),/UNREGISTERED_EDGE/],
    [{...valid,path:['A','C']},/FORWARD_ROOT_INVALID/],
  ]) await assert.rejects(suite.nodes.get('A').call('send',{forward}),code);
  assert.ok((await suite.stats()).every(node=>node.executions===0));
});
