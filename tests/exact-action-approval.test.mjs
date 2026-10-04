import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rootHash,ProtocolError} from '../src/identity.mjs';
import {
  makeAgentActionApprovalPolicy,validateAgentActionApprovalPolicy,verifyAgentActionApproval,
  AGENT_ACTION_APPROVAL_SCOPE,AGENT_ACTION_APPROVER_ROLE,
} from '../adapters/aaf-agent-action.mjs';
import {
  makeExactActionChallenge,verifyExactActionEnvelope,ExactActionReplayGuard,
} from '../src/exact-action-approval.mjs';
import {generateEd25519Keypair,signObject} from '../vendor/aaf/src/signatures.mjs';
import {sealApproval} from '../vendor/aaf/src/contracts.mjs';

const key=generateEd25519Keypair(),other=generateEd25519Keypair();
const signerId='fixture:exact-action-approver';
const policy=makeAgentActionApprovalPolicy({signerId,publicKeyPem:key.public_key_pem});
const keyring={[signerId]:{publicKeyPem:key.public_key_pem,revoked:false}};
const nowMs=Date.parse('2026-09-29T06:00:00.000Z');

function challenge(overrides={}){
  return makeExactActionChallenge({
    requestId:'req:1',toolName:'workspace.create',
    bindingRoot:'1'.repeat(64),contractRoot:'2'.repeat(64),inputRoot:'3'.repeat(64),
    policyRoot:'4'.repeat(64),approvalPolicyRoot:policy.policyRoot,...overrides,
  });
}
function approval(ch=challenge(),overrides={},signingKey=key,signingId=signerId){
  return signObject(sealApproval({
    approval_id:`fixture:${randomUUID()}`,proposal_root:ch.challengeRoot,
    approver_id:signerId,approver_roles:[AGENT_ACTION_APPROVER_ROLE],
    decision:'approved',scopes:[AGENT_ACTION_APPROVAL_SCOPE],conditions:[],
    issued_at:new Date(nowMs-1000).toISOString(),expires_at:new Date(nowMs+60000).toISOString(),
    ...overrides,
  }),signingKey.private_key_pem,signingId);
}
function denied(fn,code){
  assert.throws(fn,error=>error instanceof Error&&error.code===code);
}

test('exact action approval policy stores only a public-key fingerprint',()=>{
  assert.equal(validateAgentActionApprovalPolicy(policy),true);
  assert.match(policy.publicKeySha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(policy).includes('PUBLIC KEY'),false);
});

test('AAF approval verifies one exact challenge and signer',()=>{
  const ch=challenge(),receipt=approval(ch);
  const result=verifyAgentActionApproval({policy,challengeRoot:ch.challengeRoot,approval:receipt,keyring,nowMs});
  assert.equal(result.challengeRoot,ch.challengeRoot);
  assert.equal(result.approvalRoot,receipt.approval_root);
  assert.equal(result.signerId,signerId);
});

test('content input root, tool, contract and request id independently change the challenge',()=>{
  const baseline=challenge().challengeRoot;
  for(const changed of [
    {inputRoot:'a'.repeat(64)},{toolName:'workspace.other'},
    {contractRoot:'b'.repeat(64)},{bindingRoot:'c'.repeat(64)},
    {requestId:'req:2'},{policyRoot:'d'.repeat(64)},
  ]) assert.notEqual(challenge(changed).challengeRoot,baseline);
});

test('old approval cannot authorize changed business input',()=>{
  const ch=challenge(),receipt=approval(ch);
  const changed=challenge({inputRoot:'a'.repeat(64)});
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:changed.challengeRoot,approval:receipt,keyring,nowMs,
  }),'ACTION_APPROVAL_CHALLENGE_MISMATCH');
});

test('wrong key, expiry, roles, scopes and conditions fail closed',()=>{
  const ch=challenge();
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:ch.challengeRoot,approval:approval(ch,{},other),keyring,nowMs,
  }),'ACTION_APPROVAL_SIGNATURE_INVALID');
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:ch.challengeRoot,approval:approval(ch,{expires_at:new Date(nowMs).toISOString()}),keyring,nowMs,
  }),'ACTION_APPROVAL_TIME_INVALID');
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:ch.challengeRoot,approval:approval(ch,{approver_roles:['owner']}),keyring,nowMs,
  }),'ACTION_APPROVAL_ROLE_INVALID');
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:ch.challengeRoot,approval:approval(ch,{scopes:['*']}),keyring,nowMs,
  }),'ACTION_APPROVAL_SCOPE_INVALID');
  denied(()=>verifyAgentActionApproval({
    policy,challengeRoot:ch.challengeRoot,approval:approval(ch,{conditions:[{type:'wildcard'}]}),keyring,nowMs,
  }),'ACTION_APPROVAL_CONDITIONS_INVALID');
});

test('envelope verification binds request metadata to the signed challenge',()=>{
  const ch=challenge(),receipt=approval(ch);
  const result=verifyExactActionEnvelope({
    securityEnvelope:{requestId:'req:1',approval:receipt},
    toolName:'workspace.create',bindingRoot:'1'.repeat(64),contractRoot:'2'.repeat(64),
    inputRoot:'3'.repeat(64),policyRoot:'4'.repeat(64),approvalPolicy:policy,keyring,nowMs,
  });
  assert.equal(result.challengeRoot,ch.challengeRoot);
  assert.equal(result.inputRoot,'3'.repeat(64));
  assert.match(result.verificationRoot,/^[a-f0-9]{64}$/);
});

test('replay guard consumes the challenge root, not merely one signature',()=>{
  const ch=challenge(),receipt1=approval(ch),receipt2=approval(ch);
  const v1=verifyExactActionEnvelope({
    securityEnvelope:{requestId:'req:1',approval:receipt1},toolName:'workspace.create',
    bindingRoot:'1'.repeat(64),contractRoot:'2'.repeat(64),inputRoot:'3'.repeat(64),
    policyRoot:'4'.repeat(64),approvalPolicy:policy,keyring,nowMs,
  });
  const v2=verifyExactActionEnvelope({
    securityEnvelope:{requestId:'req:1',approval:receipt2},toolName:'workspace.create',
    bindingRoot:'1'.repeat(64),contractRoot:'2'.repeat(64),inputRoot:'3'.repeat(64),
    policyRoot:'4'.repeat(64),approvalPolicy:policy,keyring,nowMs,
  });
  assert.notEqual(v1.approvalRoot,v2.approvalRoot);
  assert.equal(v1.challengeRoot,v2.challengeRoot);
  const guard=new ExactActionReplayGuard();
  assert.equal(guard.consume(v1).consumed,true);
  denied(()=>guard.consume(v2),'EXACT_ACTION_APPROVAL_REPLAY');
  assert.equal(guard.size,1);
});
