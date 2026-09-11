import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOppHttpConsumerLive, validateOppHttpConsumerLiveResult, validateOppHttpConsumerLiveVerification } from '../src/opp-http-consumer-live.mjs';
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

test('live consumer result validator rejects unbound top-level fields', async () => {
  const { policy, request } = fixture();
  const result = await runOppHttpConsumerLive({
    policy,
    request,
    fetchImpl: async () => new Response(JSON.stringify({ default_branch: 'main', full_name: 'xingxuling/OPP', private: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    environment: {},
  });
  assert.throws(() => validateOppHttpConsumerLiveResult({ ...result, unbound: true }, { policy, request }), /OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID/);
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

test('live consumer offline verify CLI revalidates a saved result without network access', async () => {
  const { policy, request } = fixture();
  const result = await runOppHttpConsumerLive({
    policy,
    request,
    fetchImpl: async () => new Response(JSON.stringify({ default_branch: 'main', full_name: 'xingxuling/OPP', private: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    environment: {},
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-live-verify-'));
  const policyFile = path.join(directory, 'policy.json');
  const requestFile = path.join(directory, 'request.json');
  const resultFile = path.join(directory, 'result.json');
  const verificationFile = path.join(directory, 'verification.json');
  fs.writeFileSync(policyFile, `${JSON.stringify(policy)}\n`);
  fs.writeFileSync(requestFile, `${JSON.stringify(request)}\n`);
  fs.writeFileSync(resultFile, `${JSON.stringify(result)}\n`);
  const script = fileURLToPath(new URL('../scripts/opp-http-consumer-live.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [script, '--verify', policyFile, requestFile, resultFile, '--out', verificationFile], {
    encoding: 'utf8',
    env: { ...process.env, HTTPS_PROXY: 'http://ambient.invalid' },
    windowsHide: true,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, '');
  const verification = JSON.parse(fs.readFileSync(verificationFile, 'utf8'));
  assert.equal(verification.format, 'twni.opp-http-consumer-live-verify.v2');
  assert.equal(verification.status, 'PASS');
  assert.equal(verification.resultStatus, 'PASS');
  assert.equal(verification.networkRequests, 0);
  assert.equal(verification.inputs.policyRoot, policy.policyRoot);
  assert.equal(verification.inputs.requestRoot, request.requestRoot);
  assert.equal(verification.inputs.acceptanceRoot, result.acceptance.receipt.acceptanceRoot);
  assert.match(verification.inputs.policyFileSha256, /^[a-f0-9]{64}$/);
  assert.match(verification.inputs.requestFileSha256, /^[a-f0-9]{64}$/);
  assert.match(verification.inputs.resultFileSha256, /^[a-f0-9]{64}$/);
  assert.equal(validateOppHttpConsumerLiveVerification(verification, {
    policy, request, result,
    policyBytes: fs.readFileSync(policyFile), requestBytes: fs.readFileSync(requestFile), resultBytes: fs.readFileSync(resultFile),
  }), true);
  assert.throws(() => validateOppHttpConsumerLiveVerification({ ...verification, inputs: { ...verification.inputs, resultFileSha256: '0'.repeat(64) } }, { policy, request, result, policyBytes: fs.readFileSync(policyFile), requestBytes: fs.readFileSync(requestFile), resultBytes: fs.readFileSync(resultFile) }), /OPP_HTTP_CONSUMER_LIVE_VERIFY_FILE_HASH_INVALID/);
  const duplicate = spawnSync(process.execPath, [script, '--verify', policyFile, requestFile, resultFile, '--out', verificationFile], {
    encoding: 'utf8',
    env: { ...process.env, HTTPS_PROXY: 'http://ambient.invalid' },
    windowsHide: true,
  });
  assert.equal(duplicate.status, 1);
  const forgedFile = path.join(directory, 'forged.json');
  fs.writeFileSync(forgedFile, `${JSON.stringify({ ...result, unbound: true })}\n`);
  const forged = spawnSync(process.execPath, [script, '--verify', policyFile, requestFile, forgedFile], {
    encoding: 'utf8',
    env: { ...process.env, HTTPS_PROXY: 'http://ambient.invalid' },
    windowsHide: true,
  });
  assert.equal(forged.status, 1);
  assert.match(forged.stderr, /OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID/);
});
