import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rootHash } from '../src/identity.mjs';
import { canonicalOppNativeBinary64Json, rootOppNativeBinary64, OPP_NATIVE_BINARY64_PROFILE } from '../src/opp-native-canonical.mjs';
import { validateOppNativeInteropResult, makeOppNativeInteropAcceptance, validateOppNativeInteropAcceptance } from '../src/opp-native-interop.mjs';

const vectors = JSON.parse(fs.readFileSync(new URL('./fixtures/native-canonical-vectors.json', import.meta.url), 'utf8'));
const runs = JSON.parse(fs.readFileSync(new URL('./fixtures/opp-native-v02-results.json', import.meta.url), 'utf8'));
assert.equal(vectors.profile, OPP_NATIVE_BINARY64_PROFILE);

for (const vector of vectors.vectors) {
  test(`native binary64 matches fixed Python canonical bytes and root: ${vector.name}`, () => {
    assert.equal(canonicalOppNativeBinary64Json(vector.value), vector.canonical);
    assert.equal(rootOppNativeBinary64(vector.value), vector.root);
  });
}
for (const run of runs.vectors) {
  test(`native v0.2 accepts a saved real Python interop result: ${run.name}`, () => {
    assert.equal(validateOppNativeInteropResult(run.result), true);
    const acceptance = makeOppNativeInteropAcceptance({ interopResult: run.result });
    assert.equal(validateOppNativeInteropAcceptance(acceptance, { interopResult: run.result }), true);
    // Saved JSON normalizes integral floats and signed zero; v0.2 remains valid.
    assert.equal(validateOppNativeInteropResult(JSON.parse(JSON.stringify(run.result))), true);
  });
}
test('native binary64 has explicit numeric and Unicode limits and separates data types', () => {
  for (const value of [NaN, Infinity, -Infinity, 9007199254740992]) {
    assert.throws(() => rootOppNativeBinary64(value), { code: 'CANONICAL_NUMBER_INVALID' });
  }
  assert.throws(() => rootOppNativeBinary64('\ud800'), { code: 'CANONICAL_STRING_INVALID' });
  assert.notEqual(rootOppNativeBinary64(20), rootOppNativeBinary64('20'));
  assert.notEqual(rootOppNativeBinary64(null), rootOppNativeBinary64(['null']));
  assert.equal(rootOppNativeBinary64(0), rootOppNativeBinary64(-0));
});

test('native v0.2 rejects wrong profile, missing profile, mixed versions and legacy hash substitution', () => {
  const seed = runs.vectors[0].result;
  for (const mutate of [
    value => { value.receipt.canonicalProfile = 'unknown'; },
    value => { delete value.receipt.canonicalProfile; },
    value => { value.producer.receipt.format = 'taowind.opp.invocation-receipt.v0.1'; },
    value => { value.consumer.receipt.canonicalProfile = 'unknown'; },
    value => { const { receiptRoot, ...body } = value.receipt; value.receipt.receiptRoot = rootHash(body); },
    value => { value.result.value = 21; },
  ]) {
    const candidate = structuredClone(seed);
    mutate(candidate);
    assert.throws(() => validateOppNativeInteropResult(candidate));
  }
});

test('native v0.2 still rejects rehashed invocation declaration defects', () => {
  for (const role of ['producer', 'consumer']) {
    for (const mutate of [value => { delete value.authority.required; }, value => { value.authority.required = [1]; }, value => { value.boundary = 42; }]) {
      const candidate = structuredClone(runs.vectors[0].result);
      mutate(candidate[role].receipt);
      const { receiptRoot, durationMs, ...body } = candidate[role].receipt;
      candidate[role].receipt.receiptRoot = rootOppNativeBinary64(body);
      candidate.receipt[`${role}ReceiptRoot`] = candidate[role].receipt.receiptRoot;
      const { receiptRoot: outerRoot, ...outer } = candidate.receipt;
      candidate.receipt.receiptRoot = rootOppNativeBinary64(outer);
      assert.throws(() => validateOppNativeInteropResult(candidate), { code: 'OPP_NATIVE_INTEROP_INVOCATION_INVALID' });
    }
  }
});
