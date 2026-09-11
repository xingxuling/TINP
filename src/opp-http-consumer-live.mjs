import { ProtocolError } from './identity.mjs';
import { negotiateOpp } from '../adapters/opp-bridge.mjs';
import { makeHello } from '../vendor/tinp/src/index.mjs';
import {
  makeOppHttpReadonlyRequest,
  runOppHttpReadonly,
} from './opp-http-readonly.mjs';
import {
  acceptOppHttpReadonlyConsumer,
  makeOppHttpConsumerBridgePlan,
  makeOppHttpConsumerContract,
  validateOppHttpConsumerBridgePlan,
  validateOppHttpConsumerBridgeReceipt,
} from './opp-http-consumer-bridge.mjs';
import {
  validateOppHttpReadonlyPolicy,
  validateOppHttpReadonlyRequest,
} from './opp-http-readonly.mjs';

export const OPP_HTTP_CONSUMER_LIVE_FORMAT = 'twni.opp-http-consumer-live-run.v1';
export const OPP_HTTP_CONSUMER_LIVE_BOUNDARY = 'One bounded live read-only observation joined to local OPP negotiation; no credentials, authority grant, retry, redirect or production interoperability claim';

const bridgeSpec = {
  capabilityId: 'opp-http-readonly',
  version: '1.0',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  authorityRequired: [],
};

const LIVE_RESULT_KEYS = ['format', 'status', 'error', 'plan', 'negotiation', 'consumerContract', 'observation', 'acceptance', 'boundary', 'diagnostic'];

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function exactResult(value) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID');
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail('OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID'); }
  check(keys.length === LIVE_RESULT_KEYS.length
    && keys.every(key => typeof key === 'string' && LIVE_RESULT_KEYS.includes(key)),
  'OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID');
  for (const key of LIVE_RESULT_KEYS) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail('OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID'); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID');
  }
}

const hello = nodeId => makeHello({
  nodeId,
  subjectId: `subject:${nodeId}`,
  capabilities: ['opp-http-readonly'],
  authorityScopes: [],
});

export async function runOppHttpConsumerLive({
  policy,
  request,
  fetchImpl = globalThis.fetch,
  environment = process.env,
  execArgv = process.execArgv,
  consumerId = 'tinp-consumer',
  providerId = 'opp-provider',
  bridgeId = 'live:opp-http-consumer',
  contractId = 'live:opp-http-consumer-contract',
} = {}) {
  const rootedRequest = request?.requestRoot
    ? request
    : makeOppHttpReadonlyRequest({ policy, ...request });
  const plan = makeOppHttpConsumerBridgePlan({
    bridgeId,
    capabilityId: bridgeSpec.capabilityId,
    responseFields: policy.transport.responseFields,
  });
  let negotiation;
  try {
    negotiation = await negotiateOpp({
      localHello: hello(consumerId),
      remoteHello: hello(providerId),
      localCapability: structuredClone(bridgeSpec),
      remoteCapability: structuredClone(bridgeSpec),
    });
  } catch (error) {
    return {
      format: OPP_HTTP_CONSUMER_LIVE_FORMAT,
      status: 'FAIL_CLOSED',
      error: 'OPP_NEGOTIATION_FAILED',
      plan,
      negotiation: null,
      consumerContract: null,
      observation: null,
      acceptance: null,
      boundary: OPP_HTTP_CONSUMER_LIVE_BOUNDARY,
      diagnostic: error?.message ?? 'OPP_NEGOTIATION_FAILED',
    };
  }
  const consumerContract = makeOppHttpConsumerContract({
    contractId,
    capabilityId: plan.capabilityId,
    responseFields: plan.responseFields,
    negotiation,
  });
  const observation = await runOppHttpReadonly({
    policy,
    request: rootedRequest,
    fetchImpl,
    environment,
    execArgv,
  });
  const acceptance = acceptOppHttpReadonlyConsumer({
    plan,
    policy,
    request: rootedRequest,
    observation,
    consumerContract,
  });
  return {
    format: OPP_HTTP_CONSUMER_LIVE_FORMAT,
    status: acceptance.status,
    error: null,
    plan,
    negotiation,
    consumerContract,
    observation,
    acceptance,
    boundary: OPP_HTTP_CONSUMER_LIVE_BOUNDARY,
    diagnostic: null,
  };
}

export function validateOppHttpConsumerLiveResult(result, { policy, request } = {}) {
  exactResult(result);
  check(result.format === OPP_HTTP_CONSUMER_LIVE_FORMAT
    && [ 'PASS', 'FAIL_CLOSED' ].includes(result.status)
    && result.boundary === OPP_HTTP_CONSUMER_LIVE_BOUNDARY, 'OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID');
  validateOppHttpReadonlyPolicy(policy);
  const rootedRequest = request?.requestRoot
    ? request
    : makeOppHttpReadonlyRequest({ policy, ...request });
  validateOppHttpReadonlyRequest(rootedRequest, policy);
  validateOppHttpConsumerBridgePlan(result.plan);
  if (result.error === 'OPP_NEGOTIATION_FAILED') {
    check(result.status === 'FAIL_CLOSED' && result.negotiation === null
      && result.consumerContract === null && result.observation === null
      && result.acceptance === null && typeof result.diagnostic === 'string'
      && result.diagnostic.length > 0, 'OPP_HTTP_CONSUMER_LIVE_NEGOTIATION_FAILURE_INVALID');
    return true;
  }
  check(result.error === null && result.negotiation !== null
    && result.consumerContract !== null && result.observation !== null
    && result.acceptance !== null && result.diagnostic === null, 'OPP_HTTP_CONSUMER_LIVE_RESULT_INVALID');
  check(result.observation.status === result.acceptance.status
    && result.status === result.acceptance.status, 'OPP_HTTP_CONSUMER_LIVE_STATUS_MISMATCH');
  const accepted = acceptOppHttpReadonlyConsumer({
    plan: result.plan,
    policy,
    request: rootedRequest,
    observation: result.observation,
    consumerContract: result.consumerContract,
  });
  check(accepted.status === result.acceptance.status
    && accepted.receipt.acceptanceRoot === result.acceptance.receipt.acceptanceRoot,
  'OPP_HTTP_CONSUMER_LIVE_ACCEPTANCE_ROOT_INVALID');
  validateOppHttpConsumerBridgeReceipt(result.acceptance.receipt, result.plan, policy, rootedRequest, result.consumerContract);
  return true;
}
