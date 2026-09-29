import { evaluateAgentActionGuard } from '../adapters/rcl-agent-action-guard.mjs';
import { evaluateAgentEffectGuard } from '../adapters/rcl-agent-effect-guard.mjs';
import { verifyOppAgentActionContract } from './opp-agent-action-acceptance.mjs';

export async function runGovernedAgentAction({contract, leaseAuthorities, subjectVerified=true, leaseActive=true, targetWithinWorkspace=true, networkDestinationAllowed=true, execute}) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');
  const acceptance=verifyOppAgentActionContract(contract);
  if (!acceptance.verified) return {status:'denied', executionAttempted:false, resultAccepted:false, acceptance};
  const admission=await evaluateAgentActionGuard({
    contractVerified:true,subjectVerified,leaseActive,targetWithinWorkspace,networkDestinationAllowed,
    requestedAuthorities:acceptance.authorities,leaseAuthorities,
  });
  if (!admission.allowed) return {status:'denied', executionAttempted:false, resultAccepted:false, acceptance, admission};
  const outcome=await execute();
  if (!outcome || typeof outcome!=='object' || !Array.isArray(outcome.observedEffects)) throw new TypeError('executor must return {result, observedEffects}');
  const verification=await evaluateAgentEffectGuard({receiptBindingVerified:true,evidenceContinuous:true,declaredEffects:acceptance.sideEffects,observedEffects:outcome.observedEffects});
  return {
    status:verification.accepted?'verified':'effect-violation',executionAttempted:true,resultAccepted:verification.accepted,
    result:verification.accepted?outcome.result:undefined,acceptance,admission,verification,
  };
}
