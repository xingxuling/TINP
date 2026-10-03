import {createHash,createPublicKey} from 'node:crypto';
import {verifyApproval} from '../vendor/aaf/src/contracts.mjs';
import {verifySignedObject} from '../vendor/aaf/src/signatures.mjs';
import {ProtocolError,rootHash} from '../src/identity.mjs';

const POLICY_FORMAT='twni.exact-agent-action-approval-policy.v1';
const SCOPE='tinp.agent-action.execute';
const ROLE='tinp.agent-action.approver';
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=code=>{throw new ProtocolError(code);};
const check=(ok,code)=>{if(!ok)fail(code);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));

function exact(value,fields,code){
  check(plain(value),code);
  const keys=Reflect.ownKeys(value);
  check(keys.length===fields.length&&keys.every(key=>fields.includes(key)),code);
  for(const key of fields){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    check(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable,code);
  }
}
function exactArray(value,expected,code){
  check(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype,code);
  check(Reflect.ownKeys(value).length===expected.length+1&&value.length===expected.length,code);
  expected.forEach((entry,index)=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    check(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.value===entry,code);
  });
}
function identifier(value){
  return typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
}
function fingerprint(publicKeyPem){
  check(typeof publicKeyPem==='string'&&publicKeyPem.length<=4096,'ACTION_APPROVER_KEY_INVALID');
  check(publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')&&
    publicKeyPem.trimEnd().endsWith('-----END PUBLIC KEY-----')&&
    !publicKeyPem.includes('PRIVATE KEY'),'ACTION_APPROVER_KEY_INVALID');
  let key;
  try{key=createPublicKey(publicKeyPem);}catch{fail('ACTION_APPROVER_KEY_INVALID');}
  check(key.asymmetricKeyType==='ed25519','ACTION_APPROVER_KEY_TYPE_INVALID');
  return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
function timestamp(value){
  check(typeof value==='string'&&value.length===24,'ACTION_APPROVAL_TIME_INVALID');
  const ms=Date.parse(value);
  check(Number.isSafeInteger(ms)&&new Date(ms).toISOString()===value,'ACTION_APPROVAL_TIME_INVALID');
  return ms;
}

export function makeAgentActionApprovalPolicy({signerId,publicKeyPem}){
  check(identifier(signerId),'ACTION_APPROVAL_POLICY_INVALID');
  const body={format:POLICY_FORMAT,signerId,publicKeySha256:fingerprint(publicKeyPem),scope:SCOPE,role:ROLE};
  return {...body,policyRoot:rootHash(body)};
}
export function validateAgentActionApprovalPolicy(policy){
  exact(policy,['format','signerId','publicKeySha256','scope','role','policyRoot'],'ACTION_APPROVAL_POLICY_INVALID');
  check(policy.format===POLICY_FORMAT&&identifier(policy.signerId)&&hex(policy.publicKeySha256)&&
    policy.scope===SCOPE&&policy.role===ROLE&&hex(policy.policyRoot),'ACTION_APPROVAL_POLICY_INVALID');
  const {policyRoot,...body}=policy;
  check(rootHash(body)===policyRoot,'ACTION_APPROVAL_POLICY_ROOT_INVALID');
  return true;
}

export function verifyAgentActionApproval({policy,challengeRoot,approval,keyring,nowMs}){
  validateAgentActionApprovalPolicy(policy);
  check(hex(challengeRoot),'ACTION_APPROVAL_CHALLENGE_INVALID');
  check(Number.isSafeInteger(nowMs)&&nowMs>=0,'ACTION_APPROVAL_TIME_INVALID');
  exact(approval,['format','approval_id','proposal_root','approver_id','approver_roles',
    'decision','scopes','conditions','issued_at','expires_at','approval_root','signature'],'ACTION_APPROVAL_INVALID');
  check(approval.format==='aaf.approval-receipt.v0.1'&&identifier(approval.approval_id)&&
    hex(approval.approval_root)&&approval.decision==='approved','ACTION_APPROVAL_INVALID');
  check(approval.proposal_root===challengeRoot,'ACTION_APPROVAL_CHALLENGE_MISMATCH');
  exactArray(approval.approver_roles,[ROLE],'ACTION_APPROVAL_ROLE_INVALID');
  exactArray(approval.scopes,[SCOPE],'ACTION_APPROVAL_SCOPE_INVALID');
  exactArray(approval.conditions,[],'ACTION_APPROVAL_CONDITIONS_INVALID');
  exact(approval.signature,['algorithm','signer_id','value'],'ACTION_APPROVAL_SIGNATURE_INVALID');
  check(approval.signature.algorithm==='Ed25519'&&approval.signature.signer_id===policy.signerId&&
    approval.approver_id===policy.signerId,'ACTION_APPROVAL_SIGNER_MISMATCH');
  const encoded=approval.signature.value;
  check(typeof encoded==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(encoded)&&
    Buffer.from(encoded,'base64').length===64&&Buffer.from(encoded,'base64').toString('base64')===encoded,
    'ACTION_APPROVAL_SIGNATURE_INVALID');
  const issued=timestamp(approval.issued_at),expires=timestamp(approval.expires_at);
  check(issued<=nowMs&&nowMs<expires&&expires>issued&&expires-issued<=300000,'ACTION_APPROVAL_TIME_INVALID');
  check(plain(keyring),'ACTION_APPROVAL_KEYRING_INVALID');
  const descriptor=Object.getOwnPropertyDescriptor(keyring,policy.signerId);
  check(descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable,'ACTION_APPROVER_KEY_NOT_CONFIGURED');
  const entry=descriptor.value;
  exact(entry,['publicKeyPem','revoked'],'ACTION_APPROVAL_KEYRING_INVALID');
  check(entry.revoked===false,'ACTION_APPROVER_KEY_REVOKED');
  check(fingerprint(entry.publicKeyPem)===policy.publicKeySha256,'ACTION_APPROVER_KEY_FINGERPRINT_MISMATCH');
  let rootValid=false,signatureValid=false;
  try{
    rootValid=verifyApproval(approval);
    signatureValid=verifySignedObject(approval,entry.publicKeyPem);
  }catch{fail('ACTION_APPROVAL_INVALID');}
  check(rootValid,'ACTION_APPROVAL_ROOT_INVALID');
  check(signatureValid,'ACTION_APPROVAL_SIGNATURE_INVALID');
  return {
    format:'twni.exact-agent-action-approval-verification.v1',
    approvalRoot:approval.approval_root,
    signerId:policy.signerId,
    publicKeySha256:policy.publicKeySha256,
    challengeRoot,
    authorizedAtMs:nowMs,
  };
}

export const AGENT_ACTION_APPROVAL_SCOPE=SCOPE;
export const AGENT_ACTION_APPROVER_ROLE=ROLE;
