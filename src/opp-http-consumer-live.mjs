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
} from './opp-http-consumer-bridge.mjs';

export const OPP_HTTP_CONSUMER_LIVE_FORMAT = 'twni.opp-http-consumer-live-run.v1';
export const OPP_HTTP_CONSUMER_LIVE_BOUNDARY = 'One bounded live read-only observation joined to local OPP negotiation; no credentials, authority grant, retry, redirect or production interoperability claim';

const bridgeSpec = {
  capabilityId: 'opp-http-readonly',
  version: '1.0',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  authorityRequired: [],
};

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
  };
}
