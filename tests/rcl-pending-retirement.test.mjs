import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluatePendingRetirementGuard, RCL_PENDING_RETIREMENT_FIELDS } from '../adapters/rcl-pending-retirement.mjs';

const truths = ['operatorAuthorized', 'leaseRevoked', 'allNodesAcknowledged', 'pendingPresent'];
function valid() {
  return { expectedRequestRoot: 'a'.repeat(64), actualRequestRoot: 'a'.repeat(64),
    operatorAuthorized: true, leaseRevoked: true, allNodesAcknowledged: true, pendingPresent: true };
}

test('fixed RCL pending retirement compiles and records actual runtime admission', async () => {
  const result = await evaluatePendingRetirementGuard(valid());
  assert.equal(result.allowed, true, JSON.stringify(result));
  assert.equal(result.code, 'RCL_PENDING_RETIREMENT_ALLOWED');
  assert.equal(result.history.length, 2);
  assert.match(JSON.stringify(result.history), /next-internet:rcl-pending-retirement/);
  for (const key of ['programRoot', 'stateRoot', 'sourceSha256', 'factsRoot']) assert.match(result[key], /^[a-f0-9]{64}$/);
  const source = readFileSync(new URL('../rcl/pending-retirement.rcl', import.meta.url));
  assert.equal(result.sourceSha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(result.coverage, 'lowered-execution');
});

test('RCL independently denies every false predicate and mismatched root in the complete truth table', async () => {
  const baseline = await evaluatePendingRetirementGuard(valid());
  for (let mask = 0; mask < 16; mask++) {
    for (const sameRoot of [false, true]) {
      const input = valid();
      truths.forEach((key, index) => { input[key] = Boolean(mask & (1 << index)); });
      if (!sameRoot) input.actualRequestRoot = 'b'.repeat(64);
      const result = await evaluatePendingRetirementGuard(input);
      const allowed = mask === 15 && sameRoot;
      assert.equal(result.allowed, allowed, JSON.stringify(input));
      assert.equal(result.code, allowed ? 'RCL_PENDING_RETIREMENT_ALLOWED' : 'RCL_PENDING_RETIREMENT_DENIED');
      assert.equal(result.programRoot, baseline.programRoot);
      assert.equal(result.history.length, allowed ? 2 : 1);
    }
  }
});

test('pending retirement observations reject missing, extra, inherited, accessor and malformed fields', async () => {
  for (const field of RCL_PENDING_RETIREMENT_FIELDS) {
    const input = valid(); delete input[field];
    assert.equal((await evaluatePendingRetirementGuard(input)).code, 'RCL_PENDING_RETIREMENT_INPUT_INVALID', field);
    const inherited = Object.assign(Object.create({ [field]: valid()[field] }), input);
    assert.equal((await evaluatePendingRetirementGuard(inherited)).code, 'RCL_PENDING_RETIREMENT_INPUT_INVALID', field);
    let invoked = false;
    const accessor = valid(); Object.defineProperty(accessor, field, { get() { invoked = true; return valid()[field]; } });
    assert.equal((await evaluatePendingRetirementGuard(accessor)).code, 'RCL_PENDING_RETIREMENT_INPUT_INVALID', field);
    assert.equal(invoked, false);
  }
  const inputs = [null, undefined, [], {}, { ...valid(), extra: true }, { ...valid(), [Symbol('extra')]: true }];
  for (const field of ['expectedRequestRoot', 'actualRequestRoot']) {
    for (const value of ['', ' ', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'a'.repeat(63) + '\n', 'a'.repeat(64) + '\n', 'a'.repeat(64) + '\r\n', 1, null, {}, '" } realize bypass #']) inputs.push({ ...valid(), [field]: value });
  }
  for (const field of truths) for (const value of [0, 1, 'true', 'false', null, undefined, {}]) inputs.push({ ...valid(), [field]: value });
  for (const input of inputs) {
    const result = await evaluatePendingRetirementGuard(input);
    assert.equal(result.code, 'RCL_PENDING_RETIREMENT_INPUT_INVALID');
    assert.deepEqual(result.history, []);
  }
});

test('request root binding is exact and does not silently normalize valid hexadecimal strings', async () => {
  for (const root of ['0'.repeat(64), 'f'.repeat(64), 'A'.repeat(64)]) {
    assert.equal((await evaluatePendingRetirementGuard({ ...valid(), expectedRequestRoot: root, actualRequestRoot: root })).allowed, true);
  }
  assert.equal((await evaluatePendingRetirementGuard({ ...valid(), actualRequestRoot: 'A'.repeat(64) })).code, 'RCL_PENDING_RETIREMENT_DENIED');
});

test('pending retirement input snapshots remain isolated across mutations and concurrent calls', async () => {
  const input = valid(); const pending = evaluatePendingRetirementGuard(input); input.leaseRevoked = false;
  assert.equal((await pending).allowed, true);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => evaluatePendingRetirementGuard({ ...valid(), allNodesAcknowledged: i % 2 === 0 })));
  assert.deepEqual(results.map(result => result.allowed), Array.from({ length: 12 }, (_, i) => i % 2 === 0));
  assert.equal(new Set(results.map(result => result.programRoot)).size, 1);
});
