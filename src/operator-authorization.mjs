import {createPublicKey,createHash} from 'node:crypto';
import {rootHash,requireThat} from './identity.mjs';
import {validateOperatorPolicy,verifyOperatorApproval} from '../adapters/aaf-operator.mjs';

export function operatorChallenge(s,requestRoot=s.pending?.request.root){
  requireThat(s.operatorPolicy,'OPERATOR_POLICY_REQUIRED');validateOperatorPolicy(s.operatorPolicy);
  requireThat(typeof requestRoot==='string'&&/^[a-f0-9]{64}$/.test(requestRoot)&&s.session,'PENDING_REQUIRED');
  const key=createPublicKey(s.authority.publicKey).export({type:'spki',format:'der'});
  const body={format:'twni.operator-challenge.v1',action:'retire-entire-lease',requestRoot,leaseRoot:s.lease.root,
    sessionRoot:s.session.root,subjectId:s.lease.body.subjectId,continuityRoot:s.lease.body.continuityRoot,
    worldId:s.lease.body.worldId,coordinatorKeySha256:createHash('sha256').update(key).digest('hex'),policyRoot:s.operatorPolicy.policyRoot};
  return {...body,challengeRoot:rootHash(body)};
}
export function authorizeOperator(s,approval,nowMs=Date.now()){
  const challenge=operatorChallenge(s);
  const verification=verifyOperatorApproval({policy:s.operatorPolicy,challengeRoot:challenge.challengeRoot,approval,keyring:s.operatorKeyring,nowMs});
  return {challenge,approval,verification};
}
export function validateOperatorHistory(s){
  if(s.operatorPolicy)validateOperatorPolicy(s.operatorPolicy);
  let pinned=null;
  for(const event of s.ledger.events){
    const policy=event.detail?.recovery?.operatorPolicy??null;
    if(event.type==='operator.policy-pinned'){
      requireThat(policy&&!pinned&&event.detail.policyRoot===policy.policyRoot&&event.detail.operatorBoundary==='explicit-local-bootstrap','OPERATOR_POLICY_HISTORY_INVALID');
      validateOperatorPolicy(policy);pinned=policy;
    }
    requireThat((policy?.policyRoot??null)===(pinned?.policyRoot??null),'OPERATOR_POLICY_HISTORY_INVALID');
  }
  requireThat((s.operatorPolicy?.policyRoot??null)===(pinned?.policyRoot??null),'OPERATOR_POLICY_HISTORY_INVALID');
}
export function verifyExternalRetirement(s,event){
  const d=event.detail,a=d.operatorAuthorization;
  requireThat(s.operatorPolicy&&d.operatorBoundary==='external-aaf-operator'&&a,'OPERATOR_TERMINAL_INVALID');
  const expected=operatorChallenge(s,d.requestRoot);
  requireThat(rootHash(a.challenge)===rootHash(expected),'OPERATOR_CHALLENGE_MISMATCH');
  const admitted=a.verification?.authorizedAtMs,first=a.firstVerifiedAtMs,time=Date.parse(event.time);
  requireThat(Number.isSafeInteger(admitted)&&Number.isSafeInteger(first)&&first<=admitted&&time===admitted&&
    event.time===new Date(time).toISOString()&&time<=Date.now(),'OPERATOR_TERMINAL_TIME_INVALID');
  const input={policy:s.operatorPolicy,challengeRoot:expected.challengeRoot,approval:a.approval,keyring:s.operatorKeyring};
  verifyOperatorApproval({...input,nowMs:first});
  const actual=verifyOperatorApproval({...input,nowMs:admitted});
  requireThat(rootHash(actual)===rootHash(a.verification),'OPERATOR_TERMINAL_INVALID');
  return true;
}
