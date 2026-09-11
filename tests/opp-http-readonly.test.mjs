import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeOppHttpReadonlyPolicy,
  makeOppHttpReadonlyRequest,
  runOppHttpReadonly,
  validateOppHttpReadonlyReceipt,
} from '../src/opp-http-readonly.mjs';

function fixture() {
  const policy = makeOppHttpReadonlyPolicy({
    policyId: 'github:opp:repository',
    allowedHosts: ['api.github.com'],
    allowedPathPrefixes: ['/repos/xingxuling/OPP'],
    responseFields: ['default_branch', 'full_name', 'private'],
  });
  const request = makeOppHttpReadonlyRequest({
    policy,
    requestId: 'github-rest-audit',
    url: 'https://api.github.com/repos/xingxuling/OPP',
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'TINP-OPP-audit/0.1' },
  });
  return { policy, request };
}

test('policy and request roots are deterministic and bind the pinned OPP profile', () => {
  const first = fixture();
  const second = fixture();
  assert.deepEqual(first.policy, second.policy);
  assert.deepEqual(first.request, second.request);
  assert.equal(first.policy.authorityGranted, false);
  assert.equal(first.request.policyRoot, first.policy.policyRoot);
});

test('readonly adapter performs one explicit JSON GET and returns a rooted receipt', async () => {
  const { policy, request } = fixture();
  let calls = 0;
  const result = await runOppHttpReadonly({
    policy,
    request,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, request.url);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.deepEqual(options.headers, request.headers);
      return new Response(JSON.stringify({ full_name: 'xingxuling/OPP', default_branch: 'main', private: false, ignored: 'not projected' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
    environment: {},
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.response, { default_branch: 'main', full_name: 'xingxuling/OPP', private: false });
  assert.equal(result.receipt.attempts, 1);
  assert.equal(result.receipt.redirectsFollowed, false);
  assert.equal(result.receipt.ambientProxyUsed, false);
  assert.equal(result.receipt.ambientCredentialsUsed, false);
  assert.match(result.receipt.wireResponseRoot, /^[a-f0-9]{64}$/);
  assert.match(result.receipt.responseRoot, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.authorityGranted, false);
  assert.equal(result.receipt.error, null);
  assert.equal(validateOppHttpReadonlyReceipt(result.receipt, policy, request), true);
});

test('ambient proxy configuration fails closed before fetch', async () => {
  const { policy, request } = fixture();
  let calls = 0;
  const result = await runOppHttpReadonly({
    policy,
    request,
    fetchImpl: async () => { calls++; throw new Error('must not run'); },
    environment: { HTTPS_PROXY: 'http://ambient.invalid' },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.receipt.error, 'OPP_HTTP_AMBIENT_PROXY_CONFIGURED');
  assert.equal(validateOppHttpReadonlyReceipt(result.receipt, policy, request), true);
});

test('network failure is one attempt and does not retry', async () => {
  const { policy, request } = fixture();
  let calls = 0;
  const result = await runOppHttpReadonly({
    policy,
    request,
    fetchImpl: async () => { calls++; throw new Error('DNS failure'); },
    environment: {},
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.receipt.error, 'OPP_HTTP_NETWORK_ERROR');
  assert.equal(result.receipt.attempts, 1);
  assert.equal(validateOppHttpReadonlyReceipt(result.receipt, policy, request), true);
});

test('response size, redirect/status, and media type boundaries fail closed', async () => {
  const base = fixture();
  const small = makeOppHttpReadonlyPolicy({
    policyId: 'bounded',
    allowedHosts: ['api.github.com'],
    allowedPathPrefixes: ['/repos/xingxuling/OPP'],
    maxResponseBytes: 8,
    responseFields: ['full_name'],
  });
  const smallRequest = makeOppHttpReadonlyRequest({ policy: small, requestId: 'small', url: base.request.url });
  const tooLarge = await runOppHttpReadonly({
    policy: small,
    request: smallRequest,
    fetchImpl: async () => new Response('0123456789', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '10' } }),
    environment: {},
  });
  assert.equal(tooLarge.receipt.error, 'OPP_HTTP_RESPONSE_TOO_LARGE');

  const redirect = await runOppHttpReadonly({
    ...base,
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return new Response('', { status: 302, headers: { location: 'https://evil.invalid' } });
    },
    environment: {},
  });
  assert.equal(redirect.receipt.error, 'OPP_HTTP_STATUS_NOT_SUCCESS');

  const html = await runOppHttpReadonly({
    ...base,
    fetchImpl: async () => new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } }),
    environment: {},
  });
  assert.equal(html.receipt.error, 'OPP_HTTP_JSON_REQUIRED');

  const missing = await runOppHttpReadonly({
    ...base,
    fetchImpl: async () => new Response(JSON.stringify({ full_name: 'xingxuling/OPP' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    environment: {},
  });
  assert.equal(missing.receipt.error, 'OPP_HTTP_RESPONSE_FIELD_MISSING');
});

test('host and credential boundaries reject before execution', () => {
  const { policy } = fixture();
  assert.throws(() => makeOppHttpReadonlyRequest({
    policy,
    requestId: 'wrong-host',
    url: 'https://evil.invalid/repos/xingxuling/OPP',
  }), /OPP_HTTP_REQUEST_HOST_DENIED/);
  assert.throws(() => makeOppHttpReadonlyRequest({
    policy,
    requestId: 'wrong-path',
    url: 'https://api.github.com/repos/xingxuling/OPPevil',
  }), /OPP_HTTP_REQUEST_PATH_DENIED/);
  assert.throws(() => makeOppHttpReadonlyRequest({
    policy: makeOppHttpReadonlyPolicy({
      policyId: 'credential-policy',
      allowedHosts: ['api.github.com'],
      allowedPathPrefixes: ['/repos/xingxuling/OPP'],
      allowedRequestHeaders: ['accept', 'authorization'],
    }),
    requestId: 'credential',
    url: 'https://api.github.com/repos/xingxuling/OPP',
    headers: { authorization: 'Bearer secret' },
  }), /OPP_HTTP_POLICY_HEADERS_INVALID/);
});
