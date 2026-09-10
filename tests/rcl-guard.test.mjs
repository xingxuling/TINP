import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransactionGuard, RCL_GUARD_FIELDS } from '../adapters/rcl-guard.mjs';

function valid() {
  return { subjectId: 'subject:alice', sessionSubjectId: 'subject:alice', leaseSubjectId: 'subject:alice',
    worldId: 'world:private', leaseWorldId: 'world:private', capabilityId: 'echo', leaseCapabilityId: 'echo',
    capabilityVersion: '1.0', providerCapabilityVersion: '1.0', contractRoot: 'abc', providerContractRoot: 'abc',
    nowMs: 100, notBeforeMs: 100, expiresAtMs: 200,
    signatureVerified: true, sessionVerified: true, revoked: false, scopeAllowed: true, securityFloorMet: true, evidenceContinuous: true };
}

test('fixed RCL source compiles and admits authenticated matching observations', async () => {
  const result = await evaluateTransactionGuard(valid());
  assert.equal(result.allowed, true, JSON.stringify(result));
  assert.match(result.programRoot, /^[a-f0-9]{64}$/);
  assert.match(result.stateRoot, /^[a-f0-9]{64}$/);
  assert.match(result.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.history.length, 2);
});

test('each semantic predicate independently denies in RCL', async () => {
  const baseline = await evaluateTransactionGuard(valid());
  const mutations = { sessionSubjectId: 'other', leaseSubjectId: 'other', leaseWorldId: 'other', leaseCapabilityId: 'other',
    providerCapabilityVersion: '2', providerContractRoot: 'wrong', nowMs: 200, notBeforeMs: 101, expiresAtMs: 100,
    signatureVerified: false, sessionVerified: false, revoked: true, scopeAllowed: false, securityFloorMet: false, evidenceContinuous: false };
  for (const [field, value] of Object.entries(mutations)) {
    const result = await evaluateTransactionGuard({ ...valid(), [field]: value });
    assert.equal(result.allowed, false, field);
    assert.equal(result.code, 'RCL_GUARD_DENIED', field);
    assert.equal(result.programRoot, baseline.programRoot, 'facts must not change the RCL program');
  }
});

test('missing, malformed, accessor and injection inputs fail closed without compilation', async () => {
  for (const field of RCL_GUARD_FIELDS) {
    const input = valid(); delete input[field];
    assert.equal((await evaluateTransactionGuard(input)).code, 'RCL_GUARD_INPUT_INVALID', field);
  }
  for (const input of [null, [], {}, { ...valid(), nowMs: NaN }, { ...valid(), nowMs: Infinity },
    { ...valid(), nowMs: 1.2 }, { ...valid(), expiresAtMs: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid(), revoked: 'false' }, { ...valid(), subjectId: '' }, { ...valid(), subjectId: 42 }]) {
    assert.equal((await evaluateTransactionGuard(input)).allowed, false);
  }
  const getter = valid(); Object.defineProperty(getter, 'revoked', { get() { throw new Error('accessor executed'); } });
  assert.equal((await evaluateTransactionGuard(getter)).code, 'RCL_GUARD_INPUT_INVALID');
  const injected = '" } realize bypass #';
  const result = await evaluateTransactionGuard({ ...valid(), subjectId: injected });
  assert.equal(result.code, 'RCL_GUARD_DENIED');
});

test('facts are snapshotted before asynchronous execution and requests stay isolated', async () => {
  const input = valid(); const pending = evaluateTransactionGuard(input); input.revoked = true;
  assert.equal((await pending).allowed, true);
  const runs = await Promise.all(Array.from({ length: 12 }, (_, i) => evaluateTransactionGuard({ ...valid(), revoked: i % 2 === 1 })));
  assert.deepEqual(runs.map(r => r.allowed), Array.from({ length: 12 }, (_, i) => i % 2 === 0));
});
