import {rootHash} from './identity.mjs';
import {makeAgentActionAdmissionFacts} from './agent-action-policy.mjs';
import {evaluateAgentActionGuard} from '../adapters/rcl-agent-action-guard.mjs';

/** Run the OPP -> TINP -> RCL pre-execution admission chain.
 * This function does not execute the requested action.
 */
export async function admitAgentAction({contract,authorityScopes=[],policy={},approvalVerified=false}={}){
  const facts=makeAgentActionAdmissionFacts({contract,authorityScopes,policy});
  const guard=await evaluateAgentActionGuard({
    contractVerified:facts.contractVerified,
    authorityBound:facts.authorityBound,
    effectsAuthorized:facts.effectsAuthorized,
    resourcesBounded:facts.resourcesBounded,
    reversibilityAccepted:facts.reversibilityAccepted,
    effectSetComplete:facts.effectSetComplete,
    approvalRequired:facts.approvalRequired===true,
    approvalVerified:approvalVerified===true,
  });
  const body={
    format:'twni.agent-action-admission.v1',
    allowed:guard.allowed===true,
    code:guard.code,
    contractRoot:facts.contractRoot,
    policyRoot:facts.policyRoot,
    facts:{
      contractVerified:facts.contractVerified,
      authorityBound:facts.authorityBound,
      effectsAuthorized:facts.effectsAuthorized,
      resourcesBounded:facts.resourcesBounded,
      reversibilityAccepted:facts.reversibilityAccepted,
      effectSetComplete:facts.effectSetComplete,
      approvalRequired:facts.approvalRequired===true,
      approvalVerified:approvalVerified===true,
      approvalPolicyRoot:facts.approvalPolicyRoot??null,
      reason:facts.reason,
    },
    rcl:{
      programRoot:guard.programRoot??null,
      stateRoot:guard.stateRoot??null,
      sourceSha256:guard.sourceSha256??null,
      historyLength:Array.isArray(guard.history)?guard.history.length:0,
    },
    authorityGranted:false,
    executionPerformed:false,
    boundary:'Admission receipt only. The caller must place this gate on the real execution path and prevent bypass routes.',
  };
  return {...body,admissionRoot:rootHash(body)};
}
