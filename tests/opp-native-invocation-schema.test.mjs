import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rootHash } from '../src/identity.mjs';
import { validateOppNativeInteropResult } from '../src/opp-native-interop.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../evidence/OPP_NATIVE_INTEROP_2026-09-12.json', import.meta.url), 'utf8'));

function rehash(result, role) {
  const { receiptRoot, durationMs, ...body } = result[role].receipt;
  result[role].receipt.receiptRoot = rootHash(body);
  result.receipt[`${role}ReceiptRoot`] = result[role].receipt.receiptRoot;
  const { receiptRoot: outerRoot, ...outer } = result.receipt;
  result.receipt.receiptRoot = rootHash(outer);
}

test('native invocation schema accepts empty required authority and a string boundary', () => {
  for (const role of ['producer', 'consumer']) {
    assert.deepEqual(fixture[role].receipt.authority.required, []);
    assert.equal(typeof fixture[role].receipt.boundary, 'string');
  }
  assert.equal(validateOppNativeInteropResult(fixture), true);
  const emptyBoundary = structuredClone(fixture);
  emptyBoundary.producer.receipt.boundary = '';
  rehash(emptyBoundary, 'producer');
  // The shared invocation schema requires a string, without a minimum length.
  assert.equal(validateOppNativeInteropResult(emptyBoundary), true);
});

for (const role of ['producer', 'consumer']) {
  for (const [name, mutate] of [
    ['required missing', value => { delete value.authority.required; }],
    ['required null', value => { value.authority.required = null; }],
    ['required string', value => { value.authority.required = 'none'; }],
    ['required object', value => { value.authority.required = {}; }],
    ['required boolean', value => { value.authority.required = false; }],
    ['required nonstring item', value => { value.authority.required = [1]; }],
    ['boundary missing', value => { delete value.boundary; }],
    ['boundary number', value => { value.boundary = 42; }],
    ['boundary null', value => { value.boundary = null; }],
    ['boundary array', value => { value.boundary = []; }],
    ['boundary object', value => { value.boundary = {}; }],
  ]) {
    test(`native invocation schema rejects rehashed ${role} ${name}`, () => {
      const candidate = structuredClone(fixture);
      mutate(candidate[role].receipt);
      rehash(candidate, role);
      assert.deepEqual(candidate[role].result, fixture[role].result);
      assert.deepEqual(candidate.result, fixture.result);
      assert.throws(() => validateOppNativeInteropResult(candidate), { code: 'OPP_NATIVE_INTEROP_INVOCATION_INVALID' });
    });
  }
}
