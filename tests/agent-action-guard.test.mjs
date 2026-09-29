import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentActionGuard } from '../adapters/rcl-agent-action-guard.mjs';
import { evaluateAgentEffectGuard } from '../adapters/rcl-agent-effect-guard.mjs';
import { runGovernedAgentAction } from '../src/agent-action-executor.mjs';

const base = (requestedAuthorities, leaseAuthorities, extra={}) => ({
  contractVerified: true,
  subjectVerified: true,
  leaseActive: true,
  targetWithinWorkspace: true,
  networkDestinationAllowed: true,
  requestedAuthorities,
  leaseAuthorities,
  ...extra,
});

test('workspace read is admitted when lease contains the exact authority', async () => {
  const r = await evaluateAgentActionGuard(base(['workspace.read'], ['workspace.read']));
  assert.equal(r.allowed, true, JSON.stringify(r));
});

test('prompt-injected credential read fails closed', async () => {
  const r = await evaluateAgentActionGuard(base(['workspace.read', 'credential.read'], ['workspace.read']));
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'AGENT_ACTION_DENIED');
});

test('npm lifecycle script is denied when process.spawn is absent from lease', async () => {
  const requested = ['package.install', 'workspace.write', 'network.egress', 'process.spawn'];
  const lease = ['package.install', 'workspace.write', 'network.egress'];
  const r = await evaluateAgentActionGuard(base(requested, lease));
  assert.equal(r.allowed, false);
});

test('git push is denied when scm.write is absent even if network is allowed', async () => {
  const r = await evaluateAgentActionGuard(base(['scm.write', 'network.egress'], ['network.egress']));
  assert.equal(r.allowed, false);
});

test('unknown authority fails closed before any business execution', async () => {
  const r = await evaluateAgentActionGuard(base(['kernel.root'], ['kernel.root']));
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'AGENT_ACTION_UNKNOWN_AUTHORITY');
});

test('post-action observed effect outside declared contract is rejected', async () => {
  const r = await evaluateAgentEffectGuard({
    receiptBindingVerified: true,
    evidenceContinuous: true,
    declaredEffects: ['filesystem.read'],
    observedEffects: ['filesystem.read', 'credential.read'],
  });
  assert.equal(r.accepted, false);
  assert.equal(r.code, 'AGENT_EFFECT_CONTRACT_VIOLATION');
});

test('post-action exact effect subset is accepted', async () => {
  const r = await evaluateAgentEffectGuard({
    receiptBindingVerified: true,
    evidenceContinuous: true,
    declaredEffects: ['filesystem.read', 'filesystem.write'],
    observedEffects: ['filesystem.write'],
  });
  assert.equal(r.accepted, true, JSON.stringify(r));
});

const readContract = {
  profile: 'opp.agent-action.v0.1', actionId: 'agent.read-workspace', operations: ['filesystem.read'],
  authorities: ['workspace.read'], sideEffects: ['filesystem.read'], targets: ['workspace:README.md'],
  networkDestinations: [], reversibility: 'reversible', humanApprovalRequired: false,
  contractRoot: 'acea82ded717fa243d38f4f5b9d741ba02440527c9984138ddad7719ac9abcac', authorityGranted: false, executable: false,
};

test('governed executor never calls business function for denied injected authority', async () => {
  let calls=0;
  const injected={...readContract, actionId:'agent.read-secrets', operations:['filesystem.read','credential.read'], authorities:['credential.read','workspace.read'], sideEffects:['credential.read','filesystem.read']};
  const r=await runGovernedAgentAction({contract:injected,leaseAuthorities:['workspace.read'],execute:async()=>{calls++;return {result:'x',observedEffects:['filesystem.read']};}});
  assert.equal(r.executionAttempted,false);
  assert.equal(calls,0);
});

test('governed executor runs allowed action and accepts declared effects', async () => {
  let calls=0;
  const r=await runGovernedAgentAction({contract:readContract,leaseAuthorities:['workspace.read'],execute:async()=>{calls++;return {result:'ok',observedEffects:['filesystem.read']};}});
  assert.equal(calls,1);
  assert.equal(r.status,'verified',JSON.stringify(r));
  assert.equal(r.result,'ok');
});

test('governed executor rejects result when runtime effect exceeds OPP contract', async () => {
  const r=await runGovernedAgentAction({contract:readContract,leaseAuthorities:['workspace.read'],execute:async()=>({result:'leaked',observedEffects:['filesystem.read','credential.read']})});
  assert.equal(r.status,'effect-violation');
  assert.equal(r.resultAccepted,false);
});
