import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SDK_API_VERSION, makeOppHttpReadonlyPolicy, makeOppHttpReadonlyRequest,
  runOppHttpReadonly, validateOppHttpReadonlyReceipt,
} from '../sdk/v1.mjs';

test('v1 provider transport bypasses global fetch and preserves single-attempt recovery', async () => {
  assert.equal(SDK_API_VERSION, 1);
  const policy = makeOppHttpReadonlyPolicy({ policyId: 'external-sdk',
    allowedHosts: ['example.org'], allowedPathPrefixes: ['/data'], responseFields: ['value'] });
  const request = makeOppHttpReadonlyRequest({ policy, requestId: 'external-sdk', url: 'https://example.org/data' });
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not inherit fetch'); };
  let calls = 0;
  try {
    const failed = await runOppHttpReadonly({ policy, request, environment: {},
      requestImpl: async () => { calls++; throw new Error('injected network failure'); } });
    assert.equal(failed.status, 'FAIL_CLOSED');
    assert.equal(calls, 1);
    const recovered = await runOppHttpReadonly({ policy, request, environment: {},
      requestImpl: async () => { calls++; return new Response('{"value":"recovered"}', { headers: { 'content-type': 'application/json' } }); } });
    assert.equal(calls, 2);
    assert.equal(recovered.status, 'PASS');
    assert.equal(validateOppHttpReadonlyReceipt(recovered.receipt, policy, request), true);
    assert.throws(() => validateOppHttpReadonlyReceipt({ ...recovered.receipt, authorityGranted: true }, policy, request));
  } finally { globalThis.fetch = previous; }
});
