import {rootHash} from './identity.mjs';
import {verifyAgentActionApproval,validateAgentActionApprovalPolicy} from '../adapters/aaf-agent-action.mjs';

export const EXACT_ACTION_SECURITY_FIELD='_taowind';
export const EXACT_ACTION_CHALLENGE_FORMAT='twni.exact-agent-action-challenge.v1';

export class ExactActionApprovalError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new ExactActionApprovalError(code);}
function hex(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function identifier(value){
  return typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
}
function plain(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
}

export function splitExactActionInput(input){
  fail(plain(input),'EXACT_ACTION_INPUT_OBJECT_REQUIRED');
  const business=structuredClone(input);
  const security=business[EXACT_ACTION_SECURITY_FIELD];
  delete business[EXACT_ACTION_SECURITY_FIELD];
  return {businessInput:business,securityEnvelope:security};
}

export function makeExactActionChallenge({
  requestId,toolName,bindingRoot,contractRoot,inputRoot,policyRoot,approvalPolicyRoot,
}={}){
  fail(identifier(requestId),'EXACT_ACTION_REQUEST_ID_INVALID');
  fail(identifier(toolName),'EXACT_ACTION_TOOL_INVALID');
  for(const [name,value] of Object.entries({bindingRoot,contractRoot,inputRoot,policyRoot,approvalPolicyRoot}))
    fail(hex(value),`EXACT_ACTION_ROOT_INVALID:${name}`);
  const body={
    format:EXACT_ACTION_CHALLENGE_FORMAT,
    requestId,toolName,bindingRoot,contractRoot,inputRoot,policyRoot,approvalPolicyRoot,
  };
  return {...body,challengeRoot:rootHash(body)};
}

export function verifyExactActionEnvelope({
  securityEnvelope,toolName,bindingRoot,contractRoot,inputRoot,policyRoot,
  approvalPolicy,keyring,nowMs=Date.now(),
}={}){
  validateAgentActionApprovalPolicy(approvalPolicy);
  fail(plain(securityEnvelope),'EXACT_ACTION_SECURITY_ENVELOPE_REQUIRED');
  const keys=Reflect.ownKeys(securityEnvelope);
  fail(keys.length===2&&keys.includes('requestId')&&keys.includes('approval'),'EXACT_ACTION_SECURITY_ENVELOPE_INVALID');
  const challenge=makeExactActionChallenge({
    requestId:securityEnvelope.requestId,toolName,bindingRoot,contractRoot,inputRoot,policyRoot,
    approvalPolicyRoot:approvalPolicy.policyRoot,
  });
  const verification=verifyAgentActionApproval({
    policy:approvalPolicy,challengeRoot:challenge.challengeRoot,
    approval:securityEnvelope.approval,keyring,nowMs,
  });
  const body={
    format:'twni.exact-agent-action-envelope-verification.v1',
    requestId:securityEnvelope.requestId,
    challengeRoot:challenge.challengeRoot,
    approvalRoot:verification.approvalRoot,
    signerId:verification.signerId,
    publicKeySha256:verification.publicKeySha256,
    authorizedAtMs:verification.authorizedAtMs,
    inputRoot,
    policyRoot,
    approvalPolicyRoot:approvalPolicy.policyRoot,
  };
  return {...body,verificationRoot:rootHash(body)};
}

export class ExactActionReplayGuard{
  #consumed=new Set();
  consume(verification){
    fail(verification&&hex(verification.approvalRoot)&&hex(verification.challengeRoot),'EXACT_ACTION_VERIFICATION_INVALID');
    const key=`${verification.approvalRoot}:${verification.challengeRoot}`;
    fail(!this.#consumed.has(key),'EXACT_ACTION_APPROVAL_REPLAY');
    this.#consumed.add(key);
    return {consumed:true,keyRoot:rootHash({approvalRoot:verification.approvalRoot,challengeRoot:verification.challengeRoot})};
  }
  has(verification){
    if(!verification)return false;
    return this.#consumed.has(`${verification.approvalRoot}:${verification.challengeRoot}`);
  }
  get size(){return this.#consumed.size;}
}
