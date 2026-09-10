import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecoveryGuard, RCL_RECOVERY_FIELDS } from '../adapters/rcl-recovery-guard.mjs';
import { evaluateTransactionGuard } from '../adapters/rcl-guard.mjs';

function valid() {
  return { oldSubjectId: 'alice', newSubjectId: 'alice', oldContinuityRoot: 'continuity:alice', newContinuityRoot: 'continuity:alice',
    oldWorldId: 'world:local', newWorldId: 'world:local', oldExpiresAtMs: 1000, newExpiresAtMs: 1000,
    persistedRevocationEpoch: 3, currentRevocationEpoch: 3, persistedEvidenceRoot: 'verified-checkpoint', recoveredEvidenceRoot: 'verified-checkpoint',
    stateAuthenticated: true, cacheVerified: true };
}

test('fixed RCL recovery program admits equality, shorter expiry and forward revocation epoch', async () => {
  const baseline = await evaluateRecoveryGuard(valid());
  assert.equal(baseline.allowed, true, JSON.stringify(baseline));
  assert.equal(baseline.history.length, 2);
  for (const field of ['programRoot', 'stateRoot', 'sourceSha256', 'factsRoot']) assert.match(baseline[field], /^[a-f0-9]{64}$/);
  for (const patch of [{ newExpiresAtMs: 999 }, { currentRevocationEpoch: 4 }, { oldExpiresAtMs: 0, newExpiresAtMs: 0 }, { persistedRevocationEpoch: 0, currentRevocationEpoch: Number.MAX_SAFE_INTEGER }]) {
    const result = await evaluateRecoveryGuard({ ...valid(), ...patch });
    assert.equal(result.allowed, true, JSON.stringify(patch));
    assert.equal(result.programRoot, baseline.programRoot);
  }
});

test('each identity, lease, revocation, evidence and authentication predicate denies independently in RCL', async () => {
  const baseline = await evaluateRecoveryGuard(valid());
  for (const patch of [{ newSubjectId: 'intruder' }, { newContinuityRoot: 'other' }, { newWorldId: 'other' },
    { newExpiresAtMs: 1001 }, { currentRevocationEpoch: 2 }, { recoveredEvidenceRoot: 'forged-root' }, { stateAuthenticated: false }, { cacheVerified: false }]) {
    const result = await evaluateRecoveryGuard({ ...valid(), ...patch });
    assert.equal(result.allowed, false, JSON.stringify(patch));
    assert.equal(result.code, 'RCL_RECOVERY_DENIED');
    assert.equal(result.programRoot, baseline.programRoot);
  }
});

test('recovery observations reject missing, extra, inherited, accessor and malformed data', async () => {
  for (const field of RCL_RECOVERY_FIELDS) {
    const input = valid(); delete input[field];
    assert.equal((await evaluateRecoveryGuard(input)).code, 'RCL_RECOVERY_INPUT_INVALID', field);
    const inherited = Object.assign(Object.create({ [field]: valid()[field] }), input);
    assert.equal((await evaluateRecoveryGuard(inherited)).code, 'RCL_RECOVERY_INPUT_INVALID', field);
  }
  for (const input of [null, [], {}, { ...valid(), extra: true }, { ...valid(), [Symbol('extra')]: true },
    { ...valid(), currentRevocationEpoch: -1 }, { ...valid(), currentRevocationEpoch: 1.1 },
    { ...valid(), oldExpiresAtMs: NaN }, { ...valid(), newExpiresAtMs: Infinity },
    { ...valid(), persistedRevocationEpoch: Number.MAX_SAFE_INTEGER + 1 }, { ...valid(), cacheVerified: 'true' },
    { ...valid(), stateAuthenticated: 1 }, { ...valid(), newSubjectId: '' }, { ...valid(), recoveredEvidenceRoot: ' ' },
    { ...valid(), newWorldId: 'x'.repeat(4097) }]) {
    assert.equal((await evaluateRecoveryGuard(input)).code, 'RCL_RECOVERY_INPUT_INVALID');
  }
  let invoked = false;
  const accessor = valid(); Object.defineProperty(accessor, 'cacheVerified', { get() { invoked = true; return true; } });
  assert.equal((await evaluateRecoveryGuard(accessor)).code, 'RCL_RECOVERY_INPUT_INVALID');
  assert.equal(invoked, false);
});

test('recovery inputs remain data and concurrent snapshots stay isolated', async () => {
  const input = valid(); const pending = evaluateRecoveryGuard(input); input.cacheVerified = false;
  assert.equal((await pending).allowed, true);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => evaluateRecoveryGuard({ ...valid(), cacheVerified: i % 2 === 0 })));
  assert.deepEqual(results.map(r => r.allowed), Array.from({ length: 12 }, (_, i) => i % 2 === 0));
  const result = await evaluateRecoveryGuard({ ...valid(), newSubjectId: '" } realize bypass #' });
  assert.equal(result.code, 'RCL_RECOVERY_DENIED');
});

test('loading expired historical state does not admit expired execution', async () => {
  assert.equal((await evaluateRecoveryGuard(valid())).allowed, true);
  const result = await evaluateTransactionGuard({ subjectId: 'alice', sessionSubjectId: 'alice', leaseSubjectId: 'alice',
    worldId: 'world:local', leaseWorldId: 'world:local', capabilityId: 'count', leaseCapabilityId: 'count',
    capabilityVersion: '1', providerCapabilityVersion: '1', contractRoot: 'contract', providerContractRoot: 'contract',
    nowMs: 1000, notBeforeMs: 0, expiresAtMs: 1000, signatureVerified: true, sessionVerified: true,
    revoked: false, scopeAllowed: true, securityFloorMet: true, evidenceContinuous: true });
  assert.equal(result.code, 'RCL_GUARD_DENIED');
});
