import test from 'node:test';
import assert from 'node:assert/strict';
import {negotiateOpp} from '../adapters/opp-bridge.mjs';
import {makeHello} from '../vendor/tinp/src/index.mjs';

function request() {
  const make = nodeId => makeHello({nodeId, subjectId: `subject:${nodeId}`, capabilities: ['文本回声'], authorityScopes: ['candidate.read']});
  const spec = {capabilityId:'文本回声',version:'1.0',inputSchema:{type:'object',properties:{文字:{type:'string'}}},outputSchema:{type:'string'},authorityRequired:['candidate.read']};
  return {localHello:make('甲'),remoteHello:make('乙'),localCapability:structuredClone(spec),remoteCapability:structuredClone(spec)};
}

test('real upstream OPP preserves Unicode and returns non-authoritative exact contract',async()=>{
  const result=await negotiateOpp(request());
  assert.equal(result.owner,'OPP');
  assert.equal(result.handshake.payload.status,'accepted');
  assert.deepEqual(result.handshake.payload.participants,['甲','乙']);
  assert.equal(result.capability.status,'accepted');
  assert.equal(result.capability.capabilityId,'文本回声');
  assert.equal(result.capability.authorityGranted,false);
});
test('upstream rejects schema drift and intersects scopes without granting authority',async()=>{
  const input=request();
  input.remoteCapability.outputSchema={type:'number'};
  input.remoteHello.authorityScopes.push('candidate.write');
  const result=await negotiateOpp(input);
  assert.equal(result.capability.status,'rejected');
  assert.ok(result.capability.reasons.includes('OUTPUT_SCHEMA_MISMATCH'));
  assert.deepEqual(result.handshake.payload.authorityScopes,['candidate.read']);
});
test('profile version mismatch fails before contract use',async()=>{
  const input=request();input.remoteCapability.version='2.0';
  await assert.rejects(negotiateOpp(input),/OPP_PROFILE_VERSION_MISMATCH/);
});
test('missing required schema fails closed',async()=>{
  const input=request();delete input.remoteCapability.inputSchema;
  await assert.rejects(negotiateOpp(input),/inputSchema/);
});
