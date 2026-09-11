import { ProtocolError, rootHash } from './identity.mjs';
import {
  OPP_HTTP_READONLY_OPP_COMMIT,
  OPP_HTTP_READONLY_OPP_REPOSITORY,
  validateOppHttpReadonlyPolicy,
  validateOppHttpReadonlyRequest,
  validateOppHttpReadonlyReceipt,
} from './opp-http-readonly.mjs';

export const OPP_HTTP_CONSUMER_BRIDGE_PLAN_FORMAT = 'twni.opp-http-consumer-bridge-plan.v1';
export const OPP_HTTP_CONSUMER_CONTRACT_FORMAT = 'twni.opp-http-consumer-contract.v1';
export const OPP_HTTP_CONSUMER_BRIDGE_RECEIPT_FORMAT = 'twni.opp-http-consumer-bridge-receipt.v1';
export const OPP_HTTP_CONSUMER_BRIDGE_BOUNDARY = 'Local OPP consumer acceptance only; no authority grant, third-party interoperability or production availability';

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const PLAN_KEYS = ['format', 'bridgeId', 'oppSource', 'capabilityId', 'responseFields', 'authorityGranted', 'boundary', 'planRoot'];
const SOURCE_KEYS = ['repository', 'commit', 'protocols'];
const CONTRACT_KEYS = ['format', 'contractId', 'capabilityId', 'version', 'responseFields', 'negotiation', 'authorityGranted', 'contractRoot'];
const RECEIPT_KEYS = ['format', 'planRoot', 'policyRoot', 'requestRoot', 'producerReceiptRoot', 'consumerContractRoot', 'responseRoot', 'status', 'error', 'authorityGranted', 'sideEffects', 'boundary', 'acceptanceRoot'];

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function plain(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  } catch { return false; }
}

function dataKeys(value, code) {
  check(plain(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.every(key => typeof key === 'string'), code);
  for (const key of keys) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
  return keys;
}

function exact(value, fields, code) {
  const keys = dataKeys(value, code);
  check(keys.length === fields.length && keys.every(key => fields.includes(key)), code);
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function strictArray(value, code) {
  let prototype;
  let length;
  try { prototype = Object.getPrototypeOf(value); length = value.length; } catch { fail(code); }
  check(Array.isArray(value) && prototype === Array.prototype && Number.isSafeInteger(length) && length >= 0, code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.length === length + 1 && keys.includes('length')
    && keys.every(key => key === 'length' || (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < length)), code);
  for (let index = 0; index < length; index++) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, String(index)); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function sortedUnique(values, code) {
  let previous = null;
  const seen = new Set();
  for (const value of values) {
    check(!seen.has(value) && (previous === null || previous < value), code);
    seen.add(value); previous = value;
  }
}

function validateSource(source, code) {
  exact(source, SOURCE_KEYS, code);
  strictArray(source.protocols, code);
  check(identifier(source.repository) && source.repository === OPP_HTTP_READONLY_OPP_REPOSITORY
    && COMMIT.test(source.commit) && source.commit === OPP_HTTP_READONLY_OPP_COMMIT, code);
  for (const protocol of source.protocols) check(identifier(protocol), code);
  sortedUnique(source.protocols, code);
}

function validatePlanBody(plan) {
  exact(plan, PLAN_KEYS, 'OPP_HTTP_CONSUMER_PLAN_INVALID');
  validateSource(plan.oppSource, 'OPP_HTTP_CONSUMER_SOURCE_INVALID');
  strictArray(plan.responseFields, 'OPP_HTTP_CONSUMER_FIELDS_INVALID');
  check(identifier(plan.bridgeId) && identifier(plan.capabilityId)
    && plan.authorityGranted === false && plan.boundary === OPP_HTTP_CONSUMER_BRIDGE_BOUNDARY,
  'OPP_HTTP_CONSUMER_PLAN_INVALID');
  for (const field of plan.responseFields) check(identifier(field), 'OPP_HTTP_CONSUMER_FIELDS_INVALID');
  sortedUnique(plan.responseFields, 'OPP_HTTP_CONSUMER_FIELDS_UNSORTED');
  check(HASH.test(plan.planRoot), 'OPP_HTTP_CONSUMER_PLAN_ROOT_INVALID');
}

export function makeOppHttpConsumerBridgePlan({ bridgeId, capabilityId, responseFields = [], oppSource = {} } = {}) {
  const body = {
    format: OPP_HTTP_CONSUMER_BRIDGE_PLAN_FORMAT,
    bridgeId,
    oppSource: {
      repository: oppSource.repository ?? OPP_HTTP_READONLY_OPP_REPOSITORY,
      commit: oppSource.commit ?? OPP_HTTP_READONLY_OPP_COMMIT,
      protocols: [...(oppSource.protocols ?? ['opp.chp.v0.1', 'opp.rcp.v0.1'])].sort(),
    },
    capabilityId,
    responseFields: [...responseFields].sort(),
    authorityGranted: false,
    boundary: OPP_HTTP_CONSUMER_BRIDGE_BOUNDARY,
  };
  const plan = { ...body, planRoot: rootHash(body) };
  validateOppHttpConsumerBridgePlan(plan);
  return plan;
}

export function validateOppHttpConsumerBridgePlan(plan) {
  validatePlanBody(plan);
  const { planRoot, ...body } = plan;
  check(rootHash(body) === planRoot, 'OPP_HTTP_CONSUMER_PLAN_ROOT_INVALID');
  return true;
}

function validateNegotiation(negotiation, plan) {
  check(plain(negotiation), 'OPP_HTTP_CONSUMER_NEGOTIATION_INVALID');
  check(negotiation.owner === 'OPP' && negotiation.upstreamCommit === OPP_HTTP_READONLY_OPP_COMMIT,
    'OPP_HTTP_CONSUMER_NEGOTIATION_OWNER_INVALID');
  check(plain(negotiation.handshake) && negotiation.handshake.protocol === 'opp.chp.v0.1'
    && negotiation.handshake.payload?.status === 'accepted', 'OPP_HTTP_CONSUMER_HANDSHAKE_NOT_ACCEPTED');
  const handshakeIntegrity = negotiation.handshake.integrity;
  // OPP's Python canonicalizer preserves `0.0` while JSON.parse normalizes it
  // to `0`; retain the upstream root as an opaque, shape-checked commitment.
  check(plain(handshakeIntegrity) && handshakeIntegrity.algorithm === 'sha256'
    && HASH.test(handshakeIntegrity.contentRoot),
    'OPP_HTTP_CONSUMER_HANDSHAKE_ROOT_INVALID');
  check(plain(negotiation.capability) && negotiation.capability.format === 'taowind.opp.capability-agreement.v0.1'
    && negotiation.capability.status === 'accepted'
    && negotiation.capability.capabilityId === plan.capabilityId
    && negotiation.capability.authorityGranted === false
    && HASH.test(negotiation.capability.contentRoot), 'OPP_HTTP_CONSUMER_CAPABILITY_NOT_ACCEPTED');
  const { contentRoot: capabilityRoot, ...capabilityBody } = negotiation.capability;
  check(rootHash(capabilityBody) === capabilityRoot, 'OPP_HTTP_CONSUMER_CAPABILITY_ROOT_INVALID');
  return true;
}

function validateContract(contract, plan) {
  exact(contract, CONTRACT_KEYS, 'OPP_HTTP_CONSUMER_CONTRACT_INVALID');
  strictArray(contract.responseFields, 'OPP_HTTP_CONSUMER_FIELDS_INVALID');
  check(contract.format === OPP_HTTP_CONSUMER_CONTRACT_FORMAT && identifier(contract.contractId)
    && identifier(contract.capabilityId) && contract.capabilityId === plan.capabilityId
    && identifier(contract.version) && contract.authorityGranted === false
    && JSON.stringify(contract.responseFields) === JSON.stringify(plan.responseFields),
  'OPP_HTTP_CONSUMER_CONTRACT_INVALID');
  sortedUnique(contract.responseFields, 'OPP_HTTP_CONSUMER_FIELDS_UNSORTED');
  validateNegotiation(contract.negotiation, plan);
  check(HASH.test(contract.contractRoot), 'OPP_HTTP_CONSUMER_CONTRACT_ROOT_INVALID');
  const { contractRoot, ...body } = contract;
  check(rootHash(body) === contractRoot, 'OPP_HTTP_CONSUMER_CONTRACT_ROOT_INVALID');
  return true;
}

export function makeOppHttpConsumerContract({ contractId, capabilityId, version = '1.0', responseFields = [], negotiation } = {}) {
  const body = {
    format: OPP_HTTP_CONSUMER_CONTRACT_FORMAT,
    contractId,
    capabilityId,
    version,
    responseFields: [...responseFields].sort(),
    negotiation,
    authorityGranted: false,
  };
  const contract = { ...body, contractRoot: rootHash(body) };
  return contract;
}

function makeReceipt({ plan, policy, request, producerReceiptRoot, consumerContractRoot, responseRoot, status, error }) {
  const body = {
    format: OPP_HTTP_CONSUMER_BRIDGE_RECEIPT_FORMAT,
    planRoot: plan.planRoot,
    policyRoot: policy.policyRoot,
    requestRoot: request.requestRoot,
    producerReceiptRoot,
    consumerContractRoot,
    responseRoot,
    status,
    error,
    authorityGranted: false,
    sideEffects: false,
    boundary: OPP_HTTP_CONSUMER_BRIDGE_BOUNDARY,
  };
  return { ...body, acceptanceRoot: rootHash(body) };
}

export function validateOppHttpConsumerBridgeReceipt(receipt, plan, policy, request, contract) {
  exact(receipt, RECEIPT_KEYS, 'OPP_HTTP_CONSUMER_RECEIPT_INVALID');
  validateOppHttpConsumerBridgePlan(plan);
  validateOppHttpReadonlyPolicy(policy);
  validateOppHttpReadonlyRequest(request, policy);
  validateContract(contract, plan);
  const { acceptanceRoot, ...body } = receipt;
  check(receipt.format === OPP_HTTP_CONSUMER_BRIDGE_RECEIPT_FORMAT
    && receipt.planRoot === plan.planRoot && receipt.policyRoot === policy.policyRoot
    && receipt.requestRoot === request.requestRoot && HASH.test(receipt.producerReceiptRoot)
    && HASH.test(receipt.consumerContractRoot) && (receipt.responseRoot === null || HASH.test(receipt.responseRoot))
    && ['PASS', 'FAIL_CLOSED'].includes(receipt.status) && (receipt.error === null || identifier(receipt.error))
    && receipt.authorityGranted === false && receipt.sideEffects === false
    && receipt.boundary === OPP_HTTP_CONSUMER_BRIDGE_BOUNDARY && HASH.test(acceptanceRoot)
    && rootHash(body) === acceptanceRoot, 'OPP_HTTP_CONSUMER_RECEIPT_INVALID');
  check(receipt.consumerContractRoot === contract.contractRoot, 'OPP_HTTP_CONSUMER_RECEIPT_INVALID');
  if (receipt.status === 'PASS') check(receipt.error === null && receipt.responseRoot !== null, 'OPP_HTTP_CONSUMER_RECEIPT_INVALID');
  else check(receipt.error !== null && receipt.responseRoot === null, 'OPP_HTTP_CONSUMER_RECEIPT_INVALID');
  return true;
}

export function acceptOppHttpReadonlyConsumer({ plan, policy, request, observation, consumerContract } = {}) {
  validateOppHttpConsumerBridgePlan(plan);
  validateOppHttpReadonlyPolicy(policy);
  validateOppHttpReadonlyRequest(request, policy);
  validateContract(consumerContract, plan);
  check(JSON.stringify(plan.responseFields) === JSON.stringify(policy.transport.responseFields),
    'OPP_HTTP_CONSUMER_FIELDS_MISMATCH');
  check(plain(observation), 'OPP_HTTP_CONSUMER_OBSERVATION_INVALID');
  check(observation.status === observation.receipt?.status, 'OPP_HTTP_CONSUMER_OBSERVATION_INVALID');
  validateOppHttpReadonlyReceipt(observation.receipt, policy, request);
  const producerReceiptRoot = observation.receipt.receiptRoot;
  if (observation.status !== 'PASS') {
    const receipt = makeReceipt({ plan, policy, request, producerReceiptRoot,
      consumerContractRoot: consumerContract.contractRoot, responseRoot: null,
      status: 'FAIL_CLOSED', error: 'OPP_HTTP_PRODUCER_FAILED' });
    validateOppHttpConsumerBridgeReceipt(receipt, plan, policy, request, consumerContract);
    return { status: receipt.status, response: null, receipt };
  }
  check(plain(observation.response), 'OPP_HTTP_CONSUMER_RESPONSE_INVALID');
  check(observation.receipt.responseRoot === rootHash(observation.response), 'OPP_HTTP_CONSUMER_RESPONSE_ROOT_INVALID');
  for (const field of plan.responseFields) check(Object.hasOwn(observation.response, field), 'OPP_HTTP_CONSUMER_RESPONSE_FIELD_MISSING');
  const receipt = makeReceipt({ plan, policy, request, producerReceiptRoot,
    consumerContractRoot: consumerContract.contractRoot, responseRoot: observation.receipt.responseRoot,
    status: 'PASS', error: null });
  validateOppHttpConsumerBridgeReceipt(receipt, plan, policy, request, consumerContract);
  return { status: receipt.status, response: observation.response, receipt };
}
