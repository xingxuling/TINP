import test from 'node:test';
import assert from 'node:assert/strict';
import { runOppHttpConsumerLive } from '../src/opp-http-consumer-live.mjs';
import { makeOppHttpReadonlyPolicy, makeOppHttpReadonlyRequest } from '../src/opp-http-readonly.mjs';

function fixture() {
  const policy = makeOppHttpReadonlyPolicy({
    policyId: 'consumer-live',
    allowedHosts: ['api.github.com'],
    allowedPathPrefixes: ['/repos/xingxuling/OPP'],
    responseFields: ['default_branch', 'full_name', 'private'],
  });
  const request = makeOppHttpReadonlyRequest({
    policy,
    requestId: 'consumer-live',
    url: 'https://api.github.com/repos/xingxuling/OPP',
  });
  return { policy, request };
}

test('live consumer joins real OPP negotiation to one deterministic read-only observation', async () => {
  const { policy, request } = fixture();
  let calls = 0;
  const result = await runOppHttpConsumerLive({
    policy,
    request,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ default_branch: 'main', full_name: 'xingxuling/OPP', private: false, ignored: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    environment: {},
  });
  assert.equal(calls, 1);
  assert.equal(result.format, 'twni.opp-http-consumer-live-run.v1');
  assert.equal(result.status, 'PASS');
  assert.equal(result.negotiation.owner, 'OPP');
  assert.equal(result.negotiation.capability.authorityGranted, false);
  assert.equal(result.acceptance.response.full_name, 'xingxuling/OPP');
  assert.equal(Object.hasOwn(result.acceptance.response, 'ignored'), false);
  assert.equal(result.acceptance.receipt.authorityGranted, false);
  assert.equal(result.acceptance.receipt.sideEffects, false);
});

test('live consumer preserves producer fail-closed and never fetches through ambient proxy', async () => {
  const { policy, request } = fixture();
  let calls = 0;
  const result = await runOppHttpConsumerLive({
    policy,
    request,
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
    environment: { HTTPS_PROXY: 'http://ambient.invalid' },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.observation.receipt.error, 'OPP_HTTP_AMBIENT_PROXY_CONFIGURED');
  assert.equal(result.acceptance.receipt.authorityGranted, false);
  assert.equal(result.acceptance.receipt.sideEffects, false);
});

test('live consumer creates a rooted request when given an unrooted request descriptor', async () => {
  const { policy } = fixture();
  const result = await runOppHttpConsumerLive({
    policy,
    request: { requestId: 'consumer-live-unrooted', url: 'https://api.github.com/repos/xingxuling/OPP' },
    fetchImpl: async () => new Response(JSON.stringify({ default_branch: 'main', full_name: 'xingxuling/OPP', private: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    environment: {},
  });
  assert.equal(result.status, 'PASS');
  assert.match(result.observation.receipt.requestRoot, /^[a-f0-9]{64}$/);
});
