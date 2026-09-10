import { createPublicKey, createHash } from 'node:crypto';
import { GENESIS } from './evidence.mjs';
import { authentic, ProtocolError, rootHash, seal } from './identity.mjs';
import { CONVERGENCE_STORE_FORMAT, validateAuthorityRegistryConvergenceStoreState,
  verifyAuthorityRegistryConvergenceStore } from './authority-registry-convergence-store.mjs';

export const CONVERGENCE_WITNESS_POLICY_FORMAT = 'twni.authority-registry-convergence-witness-policy.v1';
export const CONVERGENCE_WITNESS_FORMAT = 'twni.authority-registry-convergence-witness.v1';
export const CONVERGENCE_WITNESS_VERIFICATION_FORMAT = 'twni.authority-registry-convergence-witness-verification.v1';
export const CONVERGENCE_WITNESS_SCOPE = 'tinp.authority-registry.convergence-store';

const HASH = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['format', 'signerId', 'publicKeySha256', 'scope', 'storeFormat', 'policyRoot'];
const BODY_KEYS = ['format', 'signerId', 'policyRoot', 'sequence', 'previousWitnessRoot', 'storeFormat',
  'distributionId', 'distributionPolicyRoot', 'registryId', 'historyRoot', 'firstSequence', 'lastSequence',
  'storeStateRoot', 'issuedAtMs'];

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function plain(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  } catch { return false; }
}

function exact(value, fields, code) {
  check(plain(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)), code);
  for (const key of fields) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function hash(value) { return typeof value === 'string' && HASH.test(value); }
function safeNonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }
function noPrivateMaterial(value) {
  if (typeof value === 'string') return !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value);
  if (Array.isArray(value)) return value.every(noPrivateMaterial);
  if (plain(value)) return Reflect.ownKeys(value).every(key => noPrivateMaterial(value[key]));
  return true;
}

function publicKeyFingerprint(publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    check(key.asymmetricKeyType === 'ed25519', 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_PUBLIC_KEY_INVALID');
    return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
  } catch { fail('AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_PUBLIC_KEY_INVALID'); }
}

export function makeAuthorityRegistryConvergenceWitnessPolicy({ signerId, publicKeyPem } = {}) {
  check(identifier(signerId) && typeof publicKeyPem === 'string' && noPrivateMaterial(publicKeyPem),
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_POLICY_INVALID');
  const body = { format: CONVERGENCE_WITNESS_POLICY_FORMAT, signerId,
    publicKeySha256: publicKeyFingerprint(publicKeyPem), scope: CONVERGENCE_WITNESS_SCOPE,
    storeFormat: CONVERGENCE_STORE_FORMAT };
  return { ...body, policyRoot: rootHash(body) };
}

export function validateAuthorityRegistryConvergenceWitnessPolicy(policy) {
  exact(policy, POLICY_KEYS, 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_POLICY_INVALID');
  check(policy.format === CONVERGENCE_WITNESS_POLICY_FORMAT && identifier(policy.signerId)
    && hash(policy.publicKeySha256) && policy.scope === CONVERGENCE_WITNESS_SCOPE
    && policy.storeFormat === CONVERGENCE_STORE_FORMAT && hash(policy.policyRoot),
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_POLICY_INVALID');
  const { policyRoot, ...body } = policy;
  check(rootHash(body) === policyRoot, 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_POLICY_INVALID');
  return true;
}

function resolveWitnessKey(policy, keyring) {
  check(plain(keyring), 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEYRING_REQUIRED');
  const descriptor = Object.getOwnPropertyDescriptor(keyring, policy.signerId);
  check(descriptor && Object.hasOwn(descriptor, 'value'), 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEY_NOT_CONFIGURED');
  const entry = descriptor.value;
  exact(entry, ['publicKeyPem', 'revoked'], 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEYRING_INVALID');
  const publicKeyDescriptor = Object.getOwnPropertyDescriptor(entry, 'publicKeyPem');
  const revokedDescriptor = Object.getOwnPropertyDescriptor(entry, 'revoked');
  check(publicKeyDescriptor && Object.hasOwn(publicKeyDescriptor, 'value')
    && revokedDescriptor && Object.hasOwn(revokedDescriptor, 'value'),
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEYRING_INVALID');
  const publicKeyPem = publicKeyDescriptor.value;
  check(typeof publicKeyPem === 'string' && noPrivateMaterial(publicKeyPem) && revokedDescriptor.value === false,
    revokedDescriptor.value === true ? 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEY_REVOKED' : 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEYRING_INVALID');
  check(publicKeyFingerprint(publicKeyPem) === policy.publicKeySha256,
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEY_MISMATCH');
  return publicKeyPem;
}

function validateWitnessBody(body) {
  exact(body, BODY_KEYS, 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
  check(body.format === CONVERGENCE_WITNESS_FORMAT && identifier(body.signerId) && hash(body.policyRoot)
    && Number.isSafeInteger(body.sequence) && body.sequence > 0
    && (body.previousWitnessRoot === GENESIS || hash(body.previousWitnessRoot))
    && body.storeFormat === CONVERGENCE_STORE_FORMAT && identifier(body.distributionId)
    && hash(body.distributionPolicyRoot) && identifier(body.registryId) && hash(body.historyRoot)
    && Number.isSafeInteger(body.firstSequence) && body.firstSequence > 0
    && Number.isSafeInteger(body.lastSequence) && body.lastSequence >= body.firstSequence
    && hash(body.storeStateRoot) && safeNonNegative(body.issuedAtMs),
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
}

export function validateAuthorityRegistryConvergenceWitness(witness) {
  exact(witness, ['body', 'root', 'signature'], 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
  validateWitnessBody(witness.body);
  check(hash(witness.root) && typeof witness.signature === 'string' && witness.signature.length > 0,
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_INVALID');
  return true;
}

export function authorityRegistryConvergenceWitnessBodyForStore({ policy, sequence, previousWitnessRoot = GENESIS,
  state, issuedAtMs = Date.now() } = {}) {
  validateAuthorityRegistryConvergenceWitnessPolicy(policy);
  validateAuthorityRegistryConvergenceStoreState(state);
  check(Number.isSafeInteger(sequence) && sequence > 0
    && (previousWitnessRoot === GENESIS || hash(previousWitnessRoot)) && safeNonNegative(issuedAtMs),
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_BUILD_INVALID');
  const body = { format: CONVERGENCE_WITNESS_FORMAT, signerId: policy.signerId,
    policyRoot: policy.policyRoot, sequence, previousWitnessRoot, storeFormat: CONVERGENCE_STORE_FORMAT,
    distributionId: state.distributionId, distributionPolicyRoot: state.distributionPolicyRoot,
    registryId: state.registryId, historyRoot: state.historyRoot, firstSequence: state.firstSequence,
    lastSequence: state.lastSequence, storeStateRoot: rootHash(state), issuedAtMs };
  validateWitnessBody(body);
  return body;
}

export function signAuthorityRegistryConvergenceWitness(body, privateKey) {
  validateWitnessBody(body);
  check(typeof privateKey === 'string' && /PRIVATE KEY/.test(privateKey),
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SIGNING_KEY_INVALID');
  return seal(body, privateKey);
}

function compareSavedWitness(witness, savedWitness, publicKeyPem) {
  validateAuthorityRegistryConvergenceWitness(savedWitness);
  check(authentic(savedWitness, publicKeyPem), 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SAVED_SIGNATURE_INVALID');
  check(witness.body.signerId === savedWitness.body.signerId
    && witness.body.policyRoot === savedWitness.body.policyRoot
    && witness.body.storeFormat === savedWitness.body.storeFormat,
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_CHAIN_MISMATCH');
  check(witness.body.sequence >= savedWitness.body.sequence,
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK');
  if (witness.body.sequence === savedWitness.body.sequence) {
    check(witness.root === savedWitness.root, 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_REPLACED');
  } else {
    check(witness.body.sequence === savedWitness.body.sequence + 1,
      'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK');
    check(witness.body.previousWitnessRoot === savedWitness.root,
      'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK');
  }
}

/** Verify an external signature binds one exact local convergence-store state. */
export function verifyAuthorityRegistryConvergenceWitness({ policy, witness, keyring, savedWitness = null,
  state, distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring, nowMs = Date.now(),
  requireCurrent = true } = {}) {
  validateAuthorityRegistryConvergenceWitnessPolicy(policy);
  const publicKeyPem = resolveWitnessKey(policy, keyring);
  validateAuthorityRegistryConvergenceWitness(witness);
  const body = witness.body;
  check(body.signerId === policy.signerId && body.policyRoot === policy.policyRoot && authentic(witness, publicKeyPem),
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SIGNATURE_INVALID');
  validateAuthorityRegistryConvergenceStoreState(state);
  check(body.storeFormat === state.format && body.distributionId === state.distributionId
    && body.distributionPolicyRoot === state.distributionPolicyRoot && body.registryId === state.registryId
    && body.historyRoot === state.historyRoot && body.firstSequence === state.firstSequence
    && body.lastSequence === state.lastSequence && body.storeStateRoot === rootHash(state),
  'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_STORE_MISMATCH');
  check(Number.isSafeInteger(nowMs) && nowMs >= 0 && body.issuedAtMs <= nowMs,
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_TIME_INVALID');
  verifyAuthorityRegistryConvergenceStore({ state, distributionPolicy, registryPolicy, issuerKeyring,
    mirrorKeyring, nowMs, requireCurrent });
  if (savedWitness) compareSavedWitness(witness, savedWitness, publicKeyPem);
  else check(body.sequence === 1 && body.previousWitnessRoot === GENESIS,
    'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK');
  return { format: CONVERGENCE_WITNESS_VERIFICATION_FORMAT, witnessRoot: witness.root,
    signerId: body.signerId, publicKeySha256: policy.publicKeySha256, sequence: body.sequence,
    historyRoot: body.historyRoot, storeStateRoot: body.storeStateRoot, firstSequence: body.firstSequence,
    lastSequence: body.lastSequence, issuedAtMs: body.issuedAtMs, observedAtMs: nowMs };
}

export const authorityRegistryConvergenceWitnessFormats = Object.freeze({
  policy: CONVERGENCE_WITNESS_POLICY_FORMAT,
  witness: CONVERGENCE_WITNESS_FORMAT,
  verification: CONVERGENCE_WITNESS_VERIFICATION_FORMAT,
  scope: CONVERGENCE_WITNESS_SCOPE,
});
