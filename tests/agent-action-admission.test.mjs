import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rootHash} from '../src/identity.mjs';
import {admitAgentAction} from '../src/agent-action-admission.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./fixtures/opp-agent-action-contract.json',import.meta.url),'utf8'));

test('OPP -> TINP -> RCL admits bounded workspace read',async()=>{
  const result=await admitAgentAction({contract,authorityScopes:['workspace.read'],policy:{
    allowedEffects:['filesystem.read'],filesystemPrefixes:['workspace/project'],
    acceptedReversibility:['reversible'],
  }});
  assert.equal(result.allowed,true,JSON.stringify(result));
  assert.equal(result.authorityGranted,false);
  assert.equal(result.executionPerformed,false);
  assert.match(result.admissionRoot,/^[a-f0-9]{64}$/);
  assert.match(result.rcl.programRoot,/^[a-f0-9]{64}$/);
});

test('prompt-injected credential request is rejected before execution',async()=>{
  const mutated={...structuredClone(contract),requiredAuthority:['credential.read'],
    declaredEffects:['credential.read'],acceptedEffects:['credential.read'],
    resources:{...contract.resources,filesystem:['.ssh/id_rsa']},reversibility:'irreversible'};
  const {contractRoot,...body}=mutated;mutated.contractRoot=rootHash(body);
  const result=await admitAgentAction({contract:mutated,authorityScopes:['workspace.read'],policy:{
    allowedEffects:['filesystem.read'],filesystemPrefixes:['workspace/project'],
    acceptedReversibility:['reversible'],
  }});
  assert.equal(result.allowed,false);
  assert.equal(result.executionPerformed,false);
  assert.equal(result.facts.authorityBound,false);
});
