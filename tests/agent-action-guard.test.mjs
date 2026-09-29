import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgentActionGuard } from '../adapters/rcl-agent-action-guard.mjs';
import { evaluateAgentEffectGuard } from '../adapters/rcl-agent-effect-guard.mjs';

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
