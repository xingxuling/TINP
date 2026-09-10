import { createHash, createPublicKey } from 'node:crypto';
import { authentic, ProtocolError, rootHash, seal } from './identity.mjs';
import { validateAuthorityRegistry, verifyAuthorityRegistry } from './authority-registry.mjs';

export const DISTRIBUTION_POLICY_FORMAT = 'twni.authority-registry-distribution-policy.v1';
export const DISTRIBUTION_RECEIPT_FORMAT = 'twni.authority-registry-distribution-receipt.v1';
export const DISTRIBUTION_BUNDLE_FORMAT = 'twni.authority-registry-distribution.v1';
export const DISTRIBUTION_VERIFICATION_FORMAT = 'twni.authority-registry-distribution-verification.v1';
export const MAX_DISTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HASH = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['format', 'distributionId', 'registryId', 'registryPolicyRoot', 'threshold', 'mirrors', 'policyRoot'];
const MIRROR_KEYS = ['mirrorId', 'publicKeySha256'];
const RECEIPT_BODY_KEYS = ['format', 'distributionId', 'registryId', 'registryPolicyRoot',
  'distributionPolicyRoot', 'sequence', 'registryRoot', 'mirrorId', 'mirrorKeySha256', 'issuedAtMs', 'expiresAtMs'];
const BUNDLE_KEYS = ['format', 'distributionId', 'distributionPolicyRoot', 'registry', 'receipts'];

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

function strictArray(value, code) {
  check(Array.isArray(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(Object.getPrototypeOf(value) === Array.prototype && keys.length === value.length + 1
    && keys.includes('length') && keys.every(key => key === 'length' || (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < value.length)), code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function hex(value) { return typeof value === 'string' && HASH.test(value); }
function safeNonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function noPrivateKey(value) {
  return typeof value === 'string' && value.length <= 4096
    && value.startsWith('-----BEGIN PUBLIC KEY-----')
    && value.trimEnd().endsWith('-----END PUBLIC KEY-----')
    && !value.includes('PRIVATE KEY');
}

function publicKeyFingerprint(publicKeyPem) {
  check(noPrivateKey(publicKeyPem), 'AUTHORITY_REGISTRY_DISTRIBUTION_PUBLIC_KEY_INVALID');
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail('AUTHORITY_REGISTRY_DISTRIBUTION_PUBLIC_KEY_INVALID'); }
  check(key.asymmetricKeyType === 'ed25519', 'AUTHORITY_REGISTRY_DISTRIBUTION_PUBLIC_KEY_TYPE_INVALID');
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

function signature(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value)
    && Buffer.from(value, 'base64').length === 64
    && Buffer.from(value, 'base64').toString('base64') === value, 'AUTHORITY_REGISTRY_DISTRIBUTION_SIGNATURE_INVALID');
}

function validateMirror(mirror) {
  exact(mirror, MIRROR_KEYS, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_INVALID');
  check(identifier(mirror.mirrorId) && hex(mirror.publicKeySha256), 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_INVALID');
}

function validatePolicyBody(policy) {
  exact(policy, POLICY_KEYS, 'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_INVALID');
  strictArray(policy.mirrors, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRRORS_INVALID');
  check(policy.mirrors.length > 0, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRRORS_INVALID');
  check(policy.format === DISTRIBUTION_POLICY_FORMAT && identifier(policy.distributionId)
    && identifier(policy.registryId) && hex(policy.registryPolicyRoot)
    && Number.isSafeInteger(policy.threshold) && policy.threshold > 0
    && policy.threshold <= policy.mirrors.length, 'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_INVALID');
  let previous = null;
  const seen = new Set();
  for (const mirror of policy.mirrors) {
    validateMirror(mirror);
    check(!seen.has(mirror.mirrorId), 'AUTHORITY_REGISTRY_DISTRIBUTION_DUPLICATE_MIRROR');
    seen.add(mirror.mirrorId);
    if (previous !== null) check(compareText(previous, mirror.mirrorId) < 0, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRRORS_UNSORTED');
    previous = mirror.mirrorId;
  }
  check(hex(policy.policyRoot), 'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_INVALID');
}

export function makeAuthorityRegistryDistributionPolicy({ distributionId, registryId, registryPolicyRoot, mirrors, threshold } = {}) {
  check(identifier(distributionId) && identifier(registryId) && hex(registryPolicyRoot), 'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_INVALID');
  check(Array.isArray(mirrors), 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRRORS_INVALID');
  const body = { format: DISTRIBUTION_POLICY_FORMAT, distributionId, registryId, registryPolicyRoot,
    threshold, mirrors: [...(mirrors ?? [])].map(mirror => ({ mirrorId: mirror?.mirrorId, publicKeySha256: mirror?.publicKeySha256 }))
      .sort((left, right) => compareText(left?.mirrorId ?? '', right?.mirrorId ?? '')) };
  validatePolicyBody({ ...body, policyRoot: rootHash(body) });
  return { ...body, policyRoot: rootHash(body) };
}

export function validateAuthorityRegistryDistributionPolicy(policy) {
  validatePolicyBody(policy);
  const { policyRoot, ...body } = policy;
  check(rootHash(body) === policyRoot, 'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_ROOT_INVALID');
  return true;
}

function validateReceiptBody(body) {
  exact(body, RECEIPT_BODY_KEYS, 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPT_INVALID');
  check(body.format === DISTRIBUTION_RECEIPT_FORMAT && identifier(body.distributionId)
    && identifier(body.registryId) && hex(body.registryPolicyRoot) && hex(body.distributionPolicyRoot)
    && Number.isSafeInteger(body.sequence) && body.sequence > 0 && hex(body.registryRoot)
    && identifier(body.mirrorId) && hex(body.mirrorKeySha256)
    && safeNonNegative(body.issuedAtMs) && safeNonNegative(body.expiresAtMs)
    && body.expiresAtMs > body.issuedAtMs && body.expiresAtMs - body.issuedAtMs <= MAX_DISTRIBUTION_TTL_MS,
  'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPT_INVALID');
  return true;
}

export function makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId,
  mirrorKeySha256, issuedAtMs = Date.now(), expiresAtMs = issuedAtMs + 60 * 60 * 1000 } = {}) {
  validateAuthorityRegistryDistributionPolicy(distributionPolicy);
  validateAuthorityRegistry(registry);
  check(identifier(mirrorId) && hex(mirrorKeySha256), 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPT_INVALID');
  const body = { format: DISTRIBUTION_RECEIPT_FORMAT, distributionId: distributionPolicy.distributionId,
    registryId: registry.body.registryId, registryPolicyRoot: registry.body.policyRoot,
    distributionPolicyRoot: distributionPolicy.policyRoot, sequence: registry.body.sequence,
    registryRoot: registry.root, mirrorId, mirrorKeySha256, issuedAtMs, expiresAtMs };
  validateReceiptBody(body);
  check(body.registryId === distributionPolicy.registryId && body.registryPolicyRoot === distributionPolicy.registryPolicyRoot,
    'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_MISMATCH');
  check(body.issuedAtMs >= registry.body.issuedAtMs && body.expiresAtMs <= registry.body.expiresAtMs,
    'AUTHORITY_REGISTRY_DISTRIBUTION_TIME_INVALID');
  return body;
}

export function signAuthorityRegistryDistributionReceipt(body, privateKeyPem) {
  validateReceiptBody(body);
  try { return seal(body, privateKeyPem); } catch { fail('AUTHORITY_REGISTRY_DISTRIBUTION_SIGN_FAILED'); }
}

export function validateAuthorityRegistryDistributionReceipt(receipt) {
  exact(receipt, ['body', 'root', 'signature'], 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPT_INVALID');
  validateReceiptBody(receipt.body);
  check(hex(receipt.root) && receipt.root === rootHash(receipt.body), 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPT_ROOT_INVALID');
  signature(receipt.signature);
  return true;
}

export function makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts } = {}) {
  validateAuthorityRegistryDistributionPolicy(distributionPolicy);
  validateAuthorityRegistry(registry);
  const bundle = { format: DISTRIBUTION_BUNDLE_FORMAT, distributionId: distributionPolicy.distributionId,
    distributionPolicyRoot: distributionPolicy.policyRoot, registry, receipts: [...(receipts ?? [])]
      .sort((left, right) => compareText(left?.body?.mirrorId ?? '', right?.body?.mirrorId ?? '')) };
  validateAuthorityRegistryDistributionBundle(bundle);
  return bundle;
}

export function validateAuthorityRegistryDistributionBundle(bundle) {
  exact(bundle, BUNDLE_KEYS, 'AUTHORITY_REGISTRY_DISTRIBUTION_INVALID');
  check(bundle.format === DISTRIBUTION_BUNDLE_FORMAT && identifier(bundle.distributionId)
    && hex(bundle.distributionPolicyRoot), 'AUTHORITY_REGISTRY_DISTRIBUTION_INVALID');
  validateAuthorityRegistry(bundle.registry);
  strictArray(bundle.receipts, 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPTS_INVALID');
  check(bundle.receipts.length > 0, 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPTS_INVALID');
  let previous = null;
  const seen = new Set();
  for (const receipt of bundle.receipts) {
    validateAuthorityRegistryDistributionReceipt(receipt);
    const mirrorId = receipt.body.mirrorId;
    check(!seen.has(mirrorId), 'AUTHORITY_REGISTRY_DISTRIBUTION_DUPLICATE_RECEIPT');
    seen.add(mirrorId);
    if (previous !== null) check(compareText(previous, mirrorId) < 0, 'AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPTS_UNSORTED');
    previous = mirrorId;
  }
  return true;
}

function resolveMirror(policy, mirrorKeyring, mirrorId, expectedFingerprint) {
  const pin = policy.mirrors.find(mirror => mirror.mirrorId === mirrorId);
  check(pin, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_NOT_PINNED');
  check(pin.publicKeySha256 === expectedFingerprint, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_FINGERPRINT_MISMATCH');
  check(plain(mirrorKeyring), 'AUTHORITY_REGISTRY_DISTRIBUTION_KEYRING_INVALID');
  const descriptor = Object.getOwnPropertyDescriptor(mirrorKeyring, mirrorId);
  check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_KEY_NOT_CONFIGURED');
  const entry = descriptor.value;
  exact(entry, ['publicKeyPem', 'revoked'], 'AUTHORITY_REGISTRY_DISTRIBUTION_KEYRING_INVALID');
  const publicKeyDescriptor = Object.getOwnPropertyDescriptor(entry, 'publicKeyPem');
  const revokedDescriptor = Object.getOwnPropertyDescriptor(entry, 'revoked');
  check(publicKeyDescriptor && Object.hasOwn(publicKeyDescriptor, 'value') && revokedDescriptor
    && Object.hasOwn(revokedDescriptor, 'value') && typeof revokedDescriptor.value === 'boolean',
  'AUTHORITY_REGISTRY_DISTRIBUTION_KEYRING_INVALID');
  check(revokedDescriptor.value === false, revokedDescriptor.value === true
    ? 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_REVOKED' : 'AUTHORITY_REGISTRY_DISTRIBUTION_KEYRING_INVALID');
  const publicKeyPem = publicKeyDescriptor.value;
  let fingerprint;
  try { fingerprint = publicKeyFingerprint(publicKeyPem); } catch { fail('AUTHORITY_REGISTRY_DISTRIBUTION_PUBLIC_KEY_INVALID'); }
  check(fingerprint === pin.publicKeySha256, 'AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_KEY_MISMATCH');
  return publicKeyPem;
}

export function verifyAuthorityRegistryDistribution({ distributionPolicy, bundle, registryPolicy, issuerKeyring,
  previousRegistry = null, mirrorKeyring, nowMs = Date.now(), requireCurrent = true } = {}) {
  validateAuthorityRegistryDistributionPolicy(distributionPolicy);
  validateAuthorityRegistryDistributionBundle(bundle);
  check(bundle.distributionId === distributionPolicy.distributionId && bundle.distributionPolicyRoot === distributionPolicy.policyRoot,
    'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_MISMATCH');
  const registry = bundle.registry;
  const registryVerification = verifyAuthorityRegistry({ policy: registryPolicy, registry,
    issuerKeyring, previousRegistry, nowMs, requireCurrent });
  check(registry.body.registryId === distributionPolicy.registryId
    && registry.body.policyRoot === distributionPolicy.registryPolicyRoot,
  'AUTHORITY_REGISTRY_DISTRIBUTION_REGISTRY_MISMATCH');
  check(Number.isSafeInteger(nowMs) && nowMs >= 0, 'AUTHORITY_REGISTRY_DISTRIBUTION_TIME_INVALID');
  const acceptedMirrors = [];
  const receiptExpiries = [];
  for (const receipt of bundle.receipts) {
    const body = receipt.body;
    check(body.distributionId === distributionPolicy.distributionId && body.registryId === registry.body.registryId
      && body.registryPolicyRoot === distributionPolicy.registryPolicyRoot
      && body.distributionPolicyRoot === distributionPolicy.policyRoot,
    'AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_MISMATCH');
    let publicKeyPem;
    try { publicKeyPem = resolveMirror(distributionPolicy, mirrorKeyring, body.mirrorId, body.mirrorKeySha256); }
    catch (error) { throw error; }
    let authenticReceipt = false;
    try { authenticReceipt = authentic(receipt, publicKeyPem); } catch { authenticReceipt = false; }
    check(authenticReceipt, 'AUTHORITY_REGISTRY_DISTRIBUTION_SIGNATURE_INVALID');
    check(body.registryRoot === registry.root && body.sequence === registry.body.sequence,
      'AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED');
    check(body.issuedAtMs >= registry.body.issuedAtMs && body.expiresAtMs <= registry.body.expiresAtMs,
      'AUTHORITY_REGISTRY_DISTRIBUTION_TIME_INVALID');
    if (requireCurrent) {
      check(body.issuedAtMs <= nowMs, 'AUTHORITY_REGISTRY_DISTRIBUTION_NOT_YET_VALID');
      check(nowMs < body.expiresAtMs, 'AUTHORITY_REGISTRY_DISTRIBUTION_EXPIRED');
    }
    acceptedMirrors.push(body.mirrorId);
    receiptExpiries.push(body.expiresAtMs);
  }
  check(acceptedMirrors.length >= distributionPolicy.threshold, 'AUTHORITY_REGISTRY_DISTRIBUTION_QUORUM_INSUFFICIENT');
  acceptedMirrors.sort(compareText);
  return {
    format: DISTRIBUTION_VERIFICATION_FORMAT,
    distributionId: distributionPolicy.distributionId,
    registryId: registry.body.registryId,
    registryRoot: registry.root,
    sequence: registry.body.sequence,
    distributionPolicyRoot: distributionPolicy.policyRoot,
    threshold: distributionPolicy.threshold,
    acceptedMirrors,
    observedAtMs: nowMs,
    expiresAtMs: Math.min(registry.body.expiresAtMs, ...receiptExpiries),
    registryVerification,
  };
}

export const authorityRegistryDistributionFormats = Object.freeze({
  policy: DISTRIBUTION_POLICY_FORMAT,
  receipt: DISTRIBUTION_RECEIPT_FORMAT,
  bundle: DISTRIBUTION_BUNDLE_FORMAT,
  verification: DISTRIBUTION_VERIFICATION_FORMAT,
});
