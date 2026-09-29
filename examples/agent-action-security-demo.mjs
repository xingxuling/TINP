import { evaluateAgentActionGuard } from '../adapters/rcl-agent-action-guard.mjs';
import { evaluateAgentEffectGuard } from '../adapters/rcl-agent-effect-guard.mjs';

const safeRead = await evaluateAgentActionGuard({
  contractVerified: true,
  subjectVerified: true,
  leaseActive: true,
  targetWithinWorkspace: true,
  networkDestinationAllowed: true,
  requestedAuthorities: ['workspace.read'],
  leaseAuthorities: ['workspace.read'],
});

const injectedLifecycleScript = await evaluateAgentActionGuard({
  contractVerified: true,
  subjectVerified: true,
  leaseActive: true,
  targetWithinWorkspace: true,
  networkDestinationAllowed: true,
  requestedAuthorities: ['package.install', 'workspace.write', 'network.egress', 'process.spawn'],
  leaseAuthorities: ['package.install', 'workspace.write', 'network.egress'],
});

const undeclaredCredentialEffect = await evaluateAgentEffectGuard({
  receiptBindingVerified: true,
  evidenceContinuous: true,
  declaredEffects: ['filesystem.read'],
  observedEffects: ['filesystem.read', 'credential.read'],
});

console.log(JSON.stringify({
  safeRead: {allowed: safeRead.allowed, code: safeRead.code},
  injectedLifecycleScript: {allowed: injectedLifecycleScript.allowed, code: injectedLifecycleScript.code},
  undeclaredCredentialEffect: {accepted: undeclaredCredentialEffect.accepted, code: undeclaredCredentialEffect.code},
}, null, 2));
