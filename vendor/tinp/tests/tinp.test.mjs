import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_TYPES, encodeFrame, decodeFrame, makeHello, makeIntent,
  CapabilityRouter, TinpRuntime, TinpError, toOppChpOffer,
  wrapRnrPacket, UdpTransport, rootHash
} from '../src/index.mjs';

const fixedClock = (()=>{ let t = Date.parse('2026-09-08T08:00:00.000Z'); return {now:()=>new Date(t), advance:ms=>{t+=ms;}};})();

function setup({production=false}={}) {
  const router=new CapabilityRouter();
  router.register({providerId:'provider:echo',capabilities:['artifact.echo','rncs.state.sync'],payloadProfiles:['application/json'],authorityScopes:['candidate.read'],securityProfiles:['none-test'],priority:10,
    handler: async ({intent})=>({ok:true,echo:intent.payload,evidenceRefs:['evidence:echo']})});
  router.register({providerId:'provider:low',capabilities:['artifact.echo'],payloadProfiles:['application/json'],authorityScopes:['candidate.read'],securityProfiles:['none-test'],priority:1,
    handler: async ()=>({ok:true,provider:'low'})});
  const runtime=new TinpRuntime({clock:fixedClock.now,router});
  const a=makeHello({nodeId:'node:a',subjectId:'subject:a',payloadProfiles:['application/json'],capabilities:['artifact.echo','rncs.state.sync'],authorityScopes:['candidate.read','candidate.write']});
  const b=makeHello({nodeId:'node:b',subjectId:'subject:b',payloadProfiles:['application/json'],capabilities:['artifact.echo','rncs.state.sync'],authorityScopes:['candidate.read']});
  const grant=runtime.openSession({sourceHello:a,targetHello:b,requestedAuthorityScopes:['candidate.read','candidate.write'],production});
  return {runtime,router,a,b,grant};
}

test('wire frame round-trips with fixed header',()=>{
  const hello=makeHello({nodeId:'n1',subjectId:'s1'});const bytes=encodeFrame('HELLO',hello);const decoded=decodeFrame(bytes);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'TINP');assert.equal(decoded.type,FRAME_TYPES.HELLO);assert.deepEqual(decoded.payload,hello);
});

test('wire corruption is fail-closed',()=>{
  const bytes=encodeFrame('HELLO',makeHello({nodeId:'n1',subjectId:'s1'}));bytes.writeUInt32BE(999999,8);
  assert.throws(()=>decodeFrame(bytes),e=>e instanceof TinpError && e.code==='FRAME_LENGTH_MISMATCH');
});

test('authority negotiation never expands beyond intersection',()=>{
  const {grant}=setup();assert.deepEqual(grant.grantedScopes,['candidate.read']);assert.equal(grant.grantedScopes.includes('candidate.write'),false);
});

test('capability router picks highest-priority compatible provider',()=>{
  const {router}=setup();assert.equal(router.route('artifact.echo',{payloadProfile:'application/json',authorityScope:'candidate.read',securityProfile:'none-test'}).providerId,'provider:echo');
});

test('unroutable capability fails closed',()=>{
  const {router}=setup();assert.throws(()=>router.route('missing.capability'),e=>e.code==='CAPABILITY_UNROUTABLE');
});

test('intent executes and creates evidence-chained receipt',async()=>{
  const {runtime,grant}=setup();const i1=makeIntent({sessionId:grant.sessionId,subjectId:'subject:a',requestId:'r1',capability:'artifact.echo',purpose:'test',payload:{message:'你好'},authorityScope:'candidate.read'});
  const x1=await runtime.dispatch(i1);assert.equal(x1.result.echo.message,'你好');assert.match(x1.receipt.receiptRoot,/^[0-9a-f]{64}$/);assert.equal(x1.receipt.previousReceiptRoot,'0'.repeat(64));
  const i2=makeIntent({sessionId:grant.sessionId,subjectId:'subject:a',requestId:'r2',capability:'artifact.echo',purpose:'test2',payload:{message:'继续'},authorityScope:'candidate.read'});
  const x2=await runtime.dispatch(i2);assert.equal(x2.receipt.previousReceiptRoot,x1.receipt.receiptRoot);
});

test('payload cannot select executable/provider or grant authority',async()=>{
  const {runtime,grant}=setup();const intent=makeIntent({sessionId:grant.sessionId,subjectId:'subject:a',requestId:'r3',capability:'artifact.echo',purpose:'attack',payload:{providerId:'provider:low'},authorityScope:'candidate.read'});
  await assert.rejects(runtime.dispatch(intent),e=>e.code==='PAYLOAD_CONTROL_PLANE_OVERRIDE');
});

test('wrong subject cannot use session',async()=>{
  const {runtime,grant}=setup();const intent=makeIntent({sessionId:grant.sessionId,subjectId:'subject:other',requestId:'r4',capability:'artifact.echo',purpose:'test',payload:{},authorityScope:'candidate.read'});
  await assert.rejects(runtime.dispatch(intent),e=>e.code==='SUBJECT_NOT_SESSION_SOURCE');
});

test('revocation immediately invalidates session',async()=>{
  const {runtime,grant}=setup();runtime.revoke(grant.sessionId,'user-request');const intent=makeIntent({sessionId:grant.sessionId,subjectId:'subject:a',requestId:'r5',capability:'artifact.echo',purpose:'test',payload:{},authorityScope:'candidate.read'});
  await assert.rejects(runtime.dispatch(intent),e=>e.code==='SESSION_REVOKED');
});

test('production session refuses none-test security profile',()=>{
  assert.throws(()=>setup({production:true}),e=>e.code==='INSECURE_PROFILE_FOR_PRODUCTION');
});

test('OPP CHP projection preserves TINP capability and authority declarations without granting authority',()=>{
  const hello=makeHello({nodeId:'node:opp',subjectId:'subject:opp',capabilities:['artifact.echo'],authorityScopes:['candidate.read']});const offer=toOppChpOffer(hello);
  assert.equal(offer.protocol,'opp.chp.v0.1');assert.equal(offer.payload.capabilities[0],'artifact.echo');assert.equal(offer.payload.authorityScopes[0],'candidate.read');assert.match(offer.constraints[0],/does not authenticate/i);
});

test('RNR state packet can be carried as a named payload profile',()=>{
  const packet={format:'network.snapshot.v0.1',sessionId:'s',tick:1,stateRoot:'abc'};const wrapped=wrapRnrPacket(packet);
  assert.equal(wrapped.payloadProfile,'rncs.network-runtime.v0.1');assert.equal(wrapped.packet.tick,1);assert.equal(wrapped.payloadRoot,rootHash({format:'tinp.rnr-payload.v0.1',payloadProfile:'rncs.network-runtime.v0.1',packet}));
});

test('UDP reference transport performs real localhost wire round-trip',async()=>{
  const a=await new UdpTransport().bind();const b=await new UdpTransport().bind();
  try {
    const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('timeout')),1000);b.onFrame(frame=>{clearTimeout(timer);resolve(frame);});});
    const hello=makeHello({nodeId:'udp:a',subjectId:'subject:a'});await a.send('127.0.0.1',b.port,'HELLO',hello);const frame=await received;
    assert.equal(frame.typeName,'HELLO');assert.equal(frame.payload.nodeId,'udp:a');
  } finally { a.close();b.close(); }
});
