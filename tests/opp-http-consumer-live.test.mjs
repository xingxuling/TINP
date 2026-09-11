import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOppHttpConsumerLive, validateOppHttpConsumerLiveResult } from '../src/opp-http-consumer-live.mjs';
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
  assert.equal(validateOppHttpConsumerLiveResult(result, { policy, request }), true);
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
  assert.equal(validateOppHttpConsumerLiveResult(result, { policy, request }), true);
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

test('live consumer CLI writes a validated fail-closed result when ambient proxy is configured', () => {
  const { policy, request } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-live-cli-'));
  const policyFile = path.join(directory, 'policy.json');
  const requestFile = path.join(directory, 'request.json');
  const outputFile = path.join(directory, 'result.json');
  fs.writeFileSync(policyFile, `${JSON.stringify(policy)}\n`);
  fs.writeFileSync(requestFile, `${JSON.stringify(request)}\n`);
  const script = fileURLToPath(new URL('../scripts/opp-http-consumer-live.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, policyFile, requestFile, '--out', outputFile], {
    encoding: 'utf8',
    env: { ...process.env, HTTPS_PROXY: 'http://ambient.invalid' },
    windowsHide: true,
  });
  assert.equal(child.status, 5, child.stderr);
  const result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.observation.receipt.error, 'OPP_HTTP_AMBIENT_PROXY_CONFIGURED');
  assert.equal(validateOppHttpConsumerLiveResult(result, { policy, request }), true);
});
