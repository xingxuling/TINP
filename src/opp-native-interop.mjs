import { ProtocolError, rootHash } from './identity.mjs';

export const OPP_NATIVE_INTEROP_RECEIPT_FORMAT = 'taowind.opp.interop-receipt.v0.1';
export const OPP_NATIVE_INTEROP_ACCEPTANCE_FORMAT = 'twni.opp-native-interop-acceptance.v1';
export const OPP_NATIVE_INTEROP_BOUNDARY = 'TINP binds one OPP-owned candidate interop receipt; it does not copy OPP runtime semantics, grant authority or claim production interoperability';

const HASH = /^[a-f0-9]{64}$/;
const RESULT_KEYS = ['receipt', 'producer', 'transformed', 'consumer', 'result'];
const RECEIPT_KEYS = ['format', 'version', 'runId', 'status', 'producerRequestRoot', 'producerReceiptRoot', 'bridgePlanRoot', 'transformedRoot', 'consumerReceiptRoot', 'finalResultRoot', 'error', 'authority', 'executionBoundary', 'boundary', 'receiptRoot'];
const INVOCATION_KEYS = ['format', 'version', 'specId', 'adapterKind', 'entrypoint', 'status', 'requestRoot', 'resultRoot', 'exitCode', 'timedOut', 'stdoutBytes', 'stderrBytes', 'targetStdout', 'targetStderr', 'error', 'authority', 'executionBoundary', 'boundary', 'durationMs', 'receiptRoot'];
const ACCEPTANCE_KEYS = ['format', 'interopReceiptRoot', 'status', 'finalResultRoot', 'authorityGranted', 'sideEffects', 'boundary', 'acceptanceRoot'];

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function exact(value, keys, code) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  let own;
  try { own = Reflect.ownKeys(value); } catch { fail(code); }
  check(own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key)), code);
  for (const key of keys) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function validateInvocation(receipt) {
  exact(receipt, INVOCATION_KEYS, 'OPP_NATIVE_INTEROP_INVOCATION_INVALID');
  check(receipt.format === 'taowind.opp.invocation-receipt.v0.1'
    && typeof receipt.version === 'string' && receipt.version.length > 0
    && typeof receipt.specId === 'string' && receipt.specId.length > 0
    && receipt.adapterKind === 'python-function'
    && typeof receipt.entrypoint === 'string' && receipt.entrypoint.length > 0
    && receipt.status === 'PASS'
    && HASH.test(receipt.requestRoot) && HASH.test(receipt.resultRoot)
    && receipt.exitCode === 0 && receipt.timedOut === false
    && Number.isSafeInteger(receipt.stdoutBytes) && receipt.stdoutBytes >= 0
    && Number.isSafeInteger(receipt.stderrBytes) && receipt.stderrBytes >= 0
    && typeof receipt.targetStdout === 'string' && typeof receipt.targetStderr === 'string'
    && receipt.error === null && receipt.authority?.promotionPerformed === false
    && receipt.authority?.inheritedFromEnvironment === false
    && receipt.executionBoundary?.explicitConsentRequired === true
    && receipt.executionBoundary?.shellUsed === false
    && receipt.executionBoundary?.environmentPolicy === 'sanitized'
    && receipt.executionBoundary?.cwdPolicy === 'ephemeral'
    && receipt.executionBoundary?.strongOsSandboxClaimed === false
    && Number.isFinite(receipt.durationMs) && receipt.durationMs >= 0
    && HASH.test(receipt.receiptRoot), 'OPP_NATIVE_INTEROP_INVOCATION_INVALID');
  // OPP computes invocation receiptRoot from the stable core before appending durationMs.
  const { receiptRoot, durationMs, ...body } = receipt;
  check(rootHash(body) === receiptRoot, 'OPP_NATIVE_INTEROP_INVOCATION_ROOT_INVALID');
}

export function validateOppNativeInteropResult(result) {
  exact(result, RESULT_KEYS, 'OPP_NATIVE_INTEROP_RESULT_INVALID');
  exact(result.receipt, RECEIPT_KEYS, 'OPP_NATIVE_INTEROP_RECEIPT_INVALID');
  const receipt = result.receipt;
  check(receipt.format === OPP_NATIVE_INTEROP_RECEIPT_FORMAT
    && typeof receipt.version === 'string' && receipt.version.length > 0
    && typeof receipt.runId === 'string' && receipt.runId.length > 0
    && receipt.status === 'PASS' && receipt.error === null
    && HASH.test(receipt.producerRequestRoot) && HASH.test(receipt.producerReceiptRoot)
    && HASH.test(receipt.bridgePlanRoot) && HASH.test(receipt.transformedRoot)
    && HASH.test(receipt.consumerReceiptRoot) && HASH.test(receipt.finalResultRoot)
    && receipt.authority?.promotionPerformed === false
    && receipt.authority?.environmentAuthorityInherited === false
    && receipt.executionBoundary?.explicitConsentRequired === true
    && receipt.executionBoundary?.strongOsSandboxClaimed === false
    && receipt.executionBoundary?.hiddenRetries === false
    && typeof receipt.boundary === 'string' && receipt.boundary.length > 0
    && HASH.test(receipt.receiptRoot), 'OPP_NATIVE_INTEROP_RECEIPT_INVALID');
  const { receiptRoot, ...body } = receipt;
  check(rootHash(body) === receiptRoot, 'OPP_NATIVE_INTEROP_RECEIPT_ROOT_INVALID');
  check(result.producer?.receipt && result.consumer?.receipt, 'OPP_NATIVE_INTEROP_RESULT_INVALID');
  validateInvocation(result.producer.receipt);
  validateInvocation(result.consumer.receipt);
  check(result.producer.receipt.receiptRoot === receipt.producerReceiptRoot
    && result.consumer.receipt.receiptRoot === receipt.consumerReceiptRoot
    && result.producer.result !== null && typeof result.producer.result === 'object'
    && rootHash(result.producer.result) === result.producer.receipt.resultRoot
    && result.consumer.result !== null && typeof result.consumer.result === 'object'
    && rootHash(result.consumer.result) === result.consumer.receipt.resultRoot
    && result.transformed !== null && typeof result.transformed === 'object'
    && rootHash(result.transformed) === receipt.transformedRoot
    && result.result !== null && typeof result.result === 'object'
    && rootHash(result.result) === receipt.finalResultRoot
    && result.consumer.receipt.resultRoot === receipt.finalResultRoot,
  'OPP_NATIVE_INTEROP_RESULT_ROOT_INVALID');
  check(result.producer.receipt.status === 'PASS' && result.consumer.receipt.status === 'PASS', 'OPP_NATIVE_INTEROP_RESULT_STATUS_INVALID');
  return true;
}

export function makeOppNativeInteropAcceptance({ interopResult } = {}) {
  validateOppNativeInteropResult(interopResult);
  const body = {
    format: OPP_NATIVE_INTEROP_ACCEPTANCE_FORMAT,
    interopReceiptRoot: interopResult.receipt.receiptRoot,
    status: 'PASS',
    finalResultRoot: interopResult.receipt.finalResultRoot,
    authorityGranted: false,
    sideEffects: false,
    boundary: OPP_NATIVE_INTEROP_BOUNDARY,
  };
  return { ...body, acceptanceRoot: rootHash(body) };
}

export function validateOppNativeInteropAcceptance(acceptance, { interopResult } = {}) {
  exact(acceptance, ACCEPTANCE_KEYS, 'OPP_NATIVE_INTEROP_ACCEPTANCE_INVALID');
  validateOppNativeInteropResult(interopResult);
  check(acceptance.format === OPP_NATIVE_INTEROP_ACCEPTANCE_FORMAT
    && acceptance.interopReceiptRoot === interopResult.receipt.receiptRoot
    && acceptance.status === 'PASS'
    && acceptance.finalResultRoot === interopResult.receipt.finalResultRoot
    && acceptance.authorityGranted === false && acceptance.sideEffects === false
    && acceptance.boundary === OPP_NATIVE_INTEROP_BOUNDARY
    && HASH.test(acceptance.acceptanceRoot), 'OPP_NATIVE_INTEROP_ACCEPTANCE_INVALID');
  const { acceptanceRoot, ...body } = acceptance;
  check(rootHash(body) === acceptanceRoot, 'OPP_NATIVE_INTEROP_ACCEPTANCE_ROOT_INVALID');
  return true;
}
