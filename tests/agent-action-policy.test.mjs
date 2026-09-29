import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rootHash} from '../src/identity.mjs';
import {makeAgentActionAdmissionFacts,verifyOppActionContract} from '../src/agent-action-policy.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./fixtures/opp-agent-action-contract.json',import.meta.url),'utf8'));

test('TINP recomputes the OPP contract root cross-language',()=>{
  assert.equal(verifyOppActionContract(contract).contract.contractRoot,contract.contractRoot);
});

test('bounded workspace read produces admissible facts',()=>{
  const facts=makeAgentActionAdmissionFacts({contract,authorityScopes:['workspace.read'],policy:{
    allowedEffects:['filesystem.read'],filesystemPrefixes:['workspace/project'],
    acceptedReversibility:['reversible'],
  }});
  assert.equal(facts.contractVerified,true);
  assert.equal(facts.authorityBound,true);
  assert.equal(facts.effectsAuthorized,true);
  assert.equal(facts.resourcesBounded,true);
  assert.equal(facts.reversibilityAccepted,true);
  assert.equal(facts.effectSetComplete,true);
});

test('credential exfiltration and shell spawn fail closed without explicit authority',()=>{
  for(const mutated of [
    {...structuredClone(contract),requiredAuthority:['credential.read'],declaredEffects:['credential.read'],
      acceptedEffects:['credential.read'],resources:{...contract.resources,filesystem:['.ssh/id_rsa']}},
    {...structuredClone(contract),requiredAuthority:['process.spawn'],declaredEffects:['process.spawn'],
      acceptedEffects:['process.spawn'],resources:{...contract.resources,commands:['powershell -enc AAA']}},
  ]){
    const {contractRoot,...body}=mutated;mutated.contractRoot=rootHash(body);
    const facts=makeAgentActionAdmissionFacts({contract:mutated,authorityScopes:['workspace.read'],policy:{
      allowedEffects:['filesystem.read'],filesystemPrefixes:['workspace/project'],
    }});
    assert.equal(facts.authorityBound,false);
    assert.equal(facts.effectsAuthorized,false);
  }
});

test('package postinstall needs the effect and exact package binding',()=>{
  const mutated={...structuredClone(contract),requiredAuthority:['package.script'],
    declaredEffects:['package.script'],acceptedEffects:['package.script'],
    resources:{...contract.resources,filesystem:[],packages:['demo@1.0.0']},reversibility:'compensatable'};
  const {contractRoot,...body}=mutated;mutated.contractRoot=rootHash(body);
  const denied=makeAgentActionAdmissionFacts({contract:mutated,authorityScopes:['package.script'],policy:{
    allowedEffects:['package.script'],packages:[],acceptedReversibility:['compensatable'],
  }});
  assert.equal(denied.resourcesBounded,false);
  const admitted=makeAgentActionAdmissionFacts({contract:mutated,authorityScopes:['package.script'],policy:{
    allowedEffects:['package.script'],packages:['demo@1.0.0'],acceptedReversibility:['compensatable'],
  }});
  assert.equal(admitted.resourcesBounded,true);
});
