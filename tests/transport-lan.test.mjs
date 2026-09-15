import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {newIdentity} from '../src/identity.mjs';
import {LocalTransport} from '../src/transport.mjs';
import {enumerateLocalBearers,LOCAL_FIRST_POLICY} from '../src/bearer-policy.mjs';

test('TCP transport can bind and exchange signed DATA on a real non-loopback local interface',async t=>{
  const candidate=enumerateLocalBearers(os.networkInterfaces()).find(x=>x.family==='IPv4');
  if(!candidate){t.skip('No non-loopback private IPv4 interface in this runtime');return;}
  const aId=newIdentity(),bId=newIdentity();
  const a=await new LocalTransport({nodeId:'A',identity:aId,kind:'tcp',bindHost:candidate.address,networkPolicy:LOCAL_FIRST_POLICY}).bind();
  const b=await new LocalTransport({nodeId:'B',identity:bId,kind:'tcp',bindHost:candidate.address,networkPolicy:LOCAL_FIRST_POLICY}).bind();
  try{a.peers.B={publicKey:bId.publicKey,endpoint:b.endpoint()};b.peers.A={publicKey:aId.publicKey,endpoint:a.endpoint()};b.handler=async value=>({echo:value});const result=await a.request('B',{hello:'lan'},2000);assert.deepEqual(result,{echo:{hello:'lan'}});assert.notEqual(a.endpoint().host,'127.0.0.1');assert.equal(a.metrics.policyRejected,0);}finally{await Promise.all([a.close(),b.close()]);}
});

test('strict local-first transport denies public egress before opening socket',async()=>{const id=newIdentity();const a=await new LocalTransport({nodeId:'A',identity:id,kind:'tcp',networkPolicy:LOCAL_FIRST_POLICY}).bind();try{a.peers.internet={publicKey:newIdentity().publicKey,endpoint:{host:'8.8.8.8',port:443,transport:'tcp'}};await assert.rejects(a.request('internet',{x:1},200),e=>e.code==='PUBLIC_EGRESS_DENIED');assert.equal(a.metrics.policyRejected,1);}finally{await a.close();}});
