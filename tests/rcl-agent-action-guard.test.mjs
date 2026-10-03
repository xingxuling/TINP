import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAgentActionGuard,RCL_AGENT_ACTION_FIELDS} from '../adapters/rcl-agent-action-guard.mjs';

const valid=()=>({
  contractVerified:true,authorityBound:true,effectsAuthorized:true,
  resourcesBounded:true,reversibilityAccepted:true,effectSetComplete:true,
  approvalRequired:false,approvalVerified:false,
});

test('RCL agent action profile admits only the complete verified conjunction',async()=>{
  const baseline=await evaluateAgentActionGuard(valid());
  assert.equal(baseline.allowed,true,JSON.stringify(baseline));
  assert.match(baseline.programRoot,/^[a-f0-9]{64}$/);
  assert.match(baseline.stateRoot,/^[a-f0-9]{64}$/);
  assert.match(baseline.sourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(baseline.history.length,2);
  for(const field of RCL_AGENT_ACTION_FIELDS.filter(field=>!['approvalRequired','approvalVerified'].includes(field))){
    const result=await evaluateAgentActionGuard({...valid(),[field]:false});
    assert.equal(result.allowed,false,field);
    assert.equal(result.code,'RCL_AGENT_ACTION_DENIED',field);
    assert.equal(result.programRoot,baseline.programRoot);
  }
  const missingApproval=await evaluateAgentActionGuard({...valid(),approvalRequired:true,approvalVerified:false});
  assert.equal(missingApproval.allowed,false);
  assert.equal(missingApproval.code,'RCL_AGENT_ACTION_DENIED');
  const exactApproved=await evaluateAgentActionGuard({...valid(),approvalRequired:true,approvalVerified:true});
  assert.equal(exactApproved.allowed,true);
  assert.equal(exactApproved.programRoot,baseline.programRoot);
});

test('malformed facts fail closed before RCL execution',async()=>{
  for(const field of RCL_AGENT_ACTION_FIELDS){
    const input=valid();delete input[field];
    assert.equal((await evaluateAgentActionGuard(input)).code,'RCL_AGENT_ACTION_INPUT_INVALID');
  }
  assert.equal((await evaluateAgentActionGuard({...valid(),effectsAuthorized:'true'})).allowed,false);
  const getter=valid();
  Object.defineProperty(getter,'authorityBound',{get(){throw new Error('accessor executed');}});
  assert.equal((await evaluateAgentActionGuard(getter)).code,'RCL_AGENT_ACTION_INPUT_INVALID');
});
