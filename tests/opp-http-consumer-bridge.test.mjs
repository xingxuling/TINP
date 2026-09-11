import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateOpp } from '../adapters/opp-bridge.mjs';
import { makeHello } from '../vendor/tinp/src/index.mjs';
import {
  makeOppHttpReadonlyPolicy,
  makeOppHttpReadonlyRequest,
  runOppHttpReadonly,
} from '../src/opp-http-readonly.mjs';
import {
  acceptOppHttpReadonlyConsumer,
  makeOppHttpConsumerBridgePlan,
  makeOppHttpConsumerContract,
  validateOppHttpConsumerBridgeReceipt,
} from '../src/opp-http-consumer-bridge.mjs';

function fixture() {
  const policy = makeOppHttpReadonlyPolicy({
    policyId: 'consumer-bridge',
    allowedHosts: ['api.github.com'],
    allowedPathPrefixes: ['/repos/xingxuling/OPP'],
    responseFields: ['default_branch', 'full_name', 'private'],
  });
  const request = makeOppHttpReadonlyRequest({
    policy,
    requestId: 'consumer-bridge',
    url: 'https://api.github.com/repos/xingxuling/OPP',
  });
  const make = nodeId => makeHello({ nodeId, subjectId: `subject:${nodeId}`, capabilities: ['opp-http-readonly'], authorityScopes: [] });
  const spec = { capabilityId: 'opp-http-readonly', version: '1.0', inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, authorityRequired: [] };
  return { policy, request, negotiationRequest: { localHello: make('consumer'), remoteHello: make('provider'), localCapability: structuredClone(spec), remoteCapability: structuredClone(spec) } };
}

async function acceptedFixture() {
  const base = fixture();
  const negotiation = await negotiateOpp(base.negotiationRequest);
  const plan = makeOppHttpConsumerBridgePlan({ bridgeId: 'bridge:opp-http-readonly', capabilityId: 'opp-http-readonly', responseFields: base.policy.transport.responseFields });
  const consumerContract = makeOppHttpConsumerContract({ contractId: 'consumer-contract:opp-http-readonly', capabilityId: plan.capabilityId, responseFields: plan.responseFields, negotiation });
  const observation = await runOppHttpReadonly({
    policy: base.policy,
    request: base.request,
    fetchImpl: async () => new Response(JSON.stringify({ default_branch: 'main', full_name: 'xingxuling/OPP', private: false, ignored: 'not projected' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    environment: {},
  });
  return { ...base, plan, consumerContract, observation };
}

test('accepted OPP negotiation and read-only observation produce a bound consumer receipt', async () => {
  const { policy, request, plan, consumerContract, observation } = await acceptedFixture();
  const accepted = acceptOppHttpReadonlyConsumer({ plan, policy, request, observation, consumerContract });
  assert.equal(accepted.status, 'PASS');
  assert.equal(accepted.response.full_name, 'xingxuling/OPP');
  assert.equal(accepted.receipt.authorityGranted, false);
  assert.equal(accepted.receipt.sideEffects, false);
  assert.equal(accepted.receipt.producerReceiptRoot, observation.receipt.receiptRoot);
  assert.equal(validateOppHttpConsumerBridgeReceipt(accepted.receipt, plan, policy, request, consumerContract), true);
});

test('consumer bridge rejects a contract whose projection differs from the HTTP policy', async () => {
  const { policy, request, plan, consumerContract, observation } = await acceptedFixture();
  const forged = { ...consumerContract, responseFields: ['full_name'], contractRoot: consumerContract.contractRoot };
  assert.throws(() => acceptOppHttpReadonlyConsumer({ plan, policy, request, observation, consumerContract: forged }), /OPP_HTTP_CONSUMER_CONTRACT_INVALID/);
});

test('producer fail-closed observation becomes a rooted consumer failure without fetch', async () => {
  const { policy, request, plan, consumerContract } = await acceptedFixture();
  const observation = await runOppHttpReadonly({ policy, request, environment: { HTTPS_PROXY: 'http://ambient.invalid' }, fetchImpl: async () => { throw new Error('must not fetch'); } });
  const accepted = acceptOppHttpReadonlyConsumer({ plan, policy, request, observation, consumerContract });
  assert.equal(accepted.status, 'FAIL_CLOSED');
  assert.equal(accepted.response, null);
  assert.equal(accepted.receipt.error, 'OPP_HTTP_PRODUCER_FAILED');
  assert.equal(validateOppHttpConsumerBridgeReceipt(accepted.receipt, plan, policy, request, consumerContract), true);
});

test('consumer bridge rejects a response re-rooted away from its producer receipt', async () => {
  const { policy, request, plan, consumerContract, observation } = await acceptedFixture();
  const forged = { ...observation, response: { ...observation.response, full_name: 'evil.example' } };
  assert.throws(() => acceptOppHttpReadonlyConsumer({ plan, policy, request, observation: forged, consumerContract }), /OPP_HTTP_CONSUMER_RESPONSE_ROOT_INVALID/);
});

test('consumer bridge rejects a negotiation from another owner or capability', async () => {
  const base = fixture();
  const negotiation = await negotiateOpp(base.negotiationRequest);
  const plan = makeOppHttpConsumerBridgePlan({ bridgeId: 'bridge:opp-http-readonly', capabilityId: 'opp-http-readonly', responseFields: base.policy.transport.responseFields });
  const contract = makeOppHttpConsumerContract({ contractId: 'bad-owner', capabilityId: plan.capabilityId, responseFields: plan.responseFields, negotiation: { ...negotiation, owner: 'TINP' } });
  assert.throws(() => acceptOppHttpReadonlyConsumer({ plan, policy: base.policy, request: base.request, observation: {}, consumerContract: contract }), /OPP_HTTP_CONSUMER_NEGOTIATION_OWNER_INVALID/);
});

test('consumer bridge rejects a capability agreement whose content root was not recomputed', async () => {
  const base = fixture();
  const negotiation = await negotiateOpp(base.negotiationRequest);
  const plan = makeOppHttpConsumerBridgePlan({ bridgeId: 'bridge:opp-http-readonly', capabilityId: 'opp-http-readonly', responseFields: base.policy.transport.responseFields });
  const contract = makeOppHttpConsumerContract({
    contractId: 'bad-root', capabilityId: plan.capabilityId, responseFields: plan.responseFields,
    negotiation: { ...negotiation, capability: { ...negotiation.capability, reasons: ['tampered'] } },
  });
  assert.throws(() => acceptOppHttpReadonlyConsumer({ plan, policy: base.policy, request: base.request, observation: {}, consumerContract: contract }), /OPP_HTTP_CONSUMER_CAPABILITY_ROOT_INVALID/);
});
