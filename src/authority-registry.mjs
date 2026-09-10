import { createHash, createPublicKey } from 'node:crypto';
import { GENESIS } from './evidence.mjs';
import { authentic, ProtocolError, rootHash, seal } from './identity.mjs';

export const REGISTRY_POLICY_FORMAT = 'twni.authority-registry-policy.v1';
export const REGISTRY_FORMAT = 'twni.authority-registry.v1';
export const REGISTRY_VERIFICATION_FORMAT = 'twni.authority-registry-verification.v1';
export const REGISTRY_SCOPE = 'tinp.authority.registry';
export const REGISTRY_ISSUER_ROLE = 'tinp.registry.issuer';
export const REGISTRY_ROLES = Object.freeze(['operator', 'recovery-witness']);
export const MAX_REGISTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const HASH = /^[a-f0-9]{64}$/;
const POLICY_KEYS = ['format', 'registryId', 'issuerId', 'issuerKeySha256', 'scope', 'role', 'policyRoot'];
const BODY_KEYS = ['format', 'registryId', 'issuerId', 'policyRoot', 'sequence', 'previousRegistryRoot', 'issuedAtMs', 'expiresAtMs', 'entries'];
const ENTRY_KEYS = ['authorityId', 'signerId', 'publicKeySha256', 'roles', 'keyEpoch', 'status', 'predecessorSignerId', 'notBeforeMs', 'revokedAtMs'];

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

export function publicKeyFingerprint(publicKeyPem) {
  check(noPrivateKey(publicKeyPem), 'AUTHORITY_REGISTRY_PUBLIC_KEY_INVALID');
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail('AUTHORITY_REGISTRY_PUBLIC_KEY_INVALID'); }
  check(key.asymmetricKeyType === 'ed25519', 'AUTHORITY_REGISTRY_PUBLIC_KEY_TYPE_INVALID');
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

function signature(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value)
    && Buffer.from(value, 'base64').length === 64
    && Buffer.from(value, 'base64').toString('base64') === value, 'AUTHORITY_REGISTRY_SIGNATURE_INVALID');
}

function roles(value, code = 'AUTHORITY_REGISTRY_ENTRY_INVALID') {
  strictArray(value, code);
  check(value.length > 0 && value.every(role => typeof role === 'string' && REGISTRY_ROLES.includes(role)), code);
  const sorted = [...value].sort(compareText);
  check(sorted.length === new Set(sorted).size && sorted.every((role, index) => role === value[index]), code);
}

function validateEntry(entry) {
  exact(entry, ENTRY_KEYS, 'AUTHORITY_REGISTRY_ENTRY_INVALID');
  check(identifier(entry.authorityId) && identifier(entry.signerId) && entry.authorityId !== entry.signerId
    && hex(entry.publicKeySha256), 'AUTHORITY_REGISTRY_ENTRY_INVALID');
  roles(entry.roles);
  check(Number.isSafeInteger(entry.keyEpoch) && entry.keyEpoch > 0
    && ['active', 'revoked'].includes(entry.status)
    && (entry.predecessorSignerId === null || identifier(entry.predecessorSignerId))
    && entry.predecessorSignerId !== entry.signerId
    && safeNonNegative(entry.notBeforeMs)
    && (entry.revokedAtMs === null || safeNonNegative(entry.revokedAtMs)), 'AUTHORITY_REGISTRY_ENTRY_INVALID');
  if (entry.predecessorSignerId === null) check(entry.keyEpoch === 1, 'AUTHORITY_REGISTRY_ENTRY_EPOCH_INVALID');
  else check(entry.keyEpoch > 1, 'AUTHORITY_REGISTRY_ENTRY_EPOCH_INVALID');
  if (entry.status === 'active') check(entry.revokedAtMs === null, 'AUTHORITY_REGISTRY_ENTRY_STATUS_INVALID');
  else check(entry.revokedAtMs !== null && entry.revokedAtMs >= entry.notBeforeMs, 'AUTHORITY_REGISTRY_ENTRY_STATUS_INVALID');
  return true;
}

function validateBody(body) {
  exact(body, BODY_KEYS, 'AUTHORITY_REGISTRY_INVALID');
  check(body.format === REGISTRY_FORMAT && identifier(body.registryId) && identifier(body.issuerId)
    && hex(body.policyRoot) && Number.isSafeInteger(body.sequence) && body.sequence > 0
    && (body.previousRegistryRoot === GENESIS || hex(body.previousRegistryRoot))
    && safeNonNegative(body.issuedAtMs) && safeNonNegative(body.expiresAtMs)
    && body.expiresAtMs > body.issuedAtMs && body.expiresAtMs - body.issuedAtMs <= MAX_REGISTRY_TTL_MS, 'AUTHORITY_REGISTRY_INVALID');
  strictArray(body.entries, 'AUTHORITY_REGISTRY_ENTRIES_INVALID');
  check(body.entries.length > 0, 'AUTHORITY_REGISTRY_ENTRIES_INVALID');
  let previousSigner = null;
  const signerIds = new Set();
  const activeAuthorities = new Set();
  for (const entry of body.entries) {
    validateEntry(entry);
    check(!signerIds.has(entry.signerId), 'AUTHORITY_REGISTRY_DUPLICATE_SIGNER');
    signerIds.add(entry.signerId);
    if (previousSigner !== null) check(compareText(previousSigner, entry.signerId) < 0, 'AUTHORITY_REGISTRY_ENTRIES_UNSORTED');
    previousSigner = entry.signerId;
    if (entry.status === 'active') {
      check(!activeAuthorities.has(entry.authorityId), 'AUTHORITY_REGISTRY_MULTIPLE_ACTIVE_KEYS');
      activeAuthorities.add(entry.authorityId);
    }
    if (entry.revokedAtMs !== null) check(entry.revokedAtMs <= body.expiresAtMs, 'AUTHORITY_REGISTRY_ENTRY_STATUS_INVALID');
  }
  return true;
}

export function makeAuthorityRegistryPolicy({ registryId, issuerId, publicKeyPem } = {}) {
  check(identifier(registryId) && identifier(issuerId), 'AUTHORITY_REGISTRY_POLICY_INVALID');
  const body = { format: REGISTRY_POLICY_FORMAT, registryId, issuerId,
    issuerKeySha256: publicKeyFingerprint(publicKeyPem), scope: REGISTRY_SCOPE, role: REGISTRY_ISSUER_ROLE };
  return { ...body, policyRoot: rootHash(body) };
}

export function validateAuthorityRegistryPolicy(policy) {
  exact(policy, POLICY_KEYS, 'AUTHORITY_REGISTRY_POLICY_INVALID');
  check(policy.format === REGISTRY_POLICY_FORMAT && identifier(policy.registryId) && identifier(policy.issuerId)
    && hex(policy.issuerKeySha256) && policy.scope === REGISTRY_SCOPE && policy.role === REGISTRY_ISSUER_ROLE
    && hex(policy.policyRoot), 'AUTHORITY_REGISTRY_POLICY_INVALID');
  const { policyRoot, ...body } = policy;
  check(rootHash(body) === policyRoot, 'AUTHORITY_REGISTRY_POLICY_ROOT_INVALID');
  return true;
}

export function makeAuthorityRegistryEntry({ authorityId, signerId, publicKeySha256, roles: entryRoles,
  keyEpoch = 1, status = 'active', predecessorSignerId = null, notBeforeMs = Date.now(), revokedAtMs = null } = {}) {
  const entry = { authorityId, signerId, publicKeySha256, roles: [...(entryRoles ?? [])], keyEpoch, status,
    predecessorSignerId, notBeforeMs, revokedAtMs };
  validateEntry(entry);
  return entry;
}

export function makeAuthorityRegistryBody({ policy, sequence, previousRegistryRoot = GENESIS, entries,
  issuedAtMs = Date.now(), expiresAtMs = issuedAtMs + 60 * 60 * 1000 } = {}) {
  validateAuthorityRegistryPolicy(policy);
  const body = { format: REGISTRY_FORMAT, registryId: policy.registryId, issuerId: policy.issuerId,
    policyRoot: policy.policyRoot, sequence, previousRegistryRoot, issuedAtMs, expiresAtMs,
    entries: [...(entries ?? [])].sort((left, right) => compareText(left?.signerId ?? '', right?.signerId ?? '')) };
  validateBody(body);
  return body;
}

export function signAuthorityRegistry(body, privateKeyPem) {
  validateBody(body);
  try { return seal(body, privateKeyPem); } catch { fail('AUTHORITY_REGISTRY_SIGN_FAILED'); }
}

export function validateAuthorityRegistry(registry) {
  exact(registry, ['body', 'root', 'signature'], 'AUTHORITY_REGISTRY_INVALID');
  validateBody(registry.body);
  check(hex(registry.root) && registry.root === rootHash(registry.body), 'AUTHORITY_REGISTRY_ROOT_INVALID');
  signature(registry.signature);
  return true;
}

function resolveIssuer(policy, issuerKeyring) {
  check(plain(issuerKeyring), 'AUTHORITY_REGISTRY_ISSUER_KEYRING_INVALID');
  const descriptor = Object.getOwnPropertyDescriptor(issuerKeyring, policy.issuerId);
  check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'AUTHORITY_REGISTRY_ISSUER_KEY_NOT_CONFIGURED');
  const entry = descriptor.value;
  exact(entry, ['publicKeyPem', 'revoked'], 'AUTHORITY_REGISTRY_ISSUER_KEYRING_INVALID');
  const publicKeyDescriptor = Object.getOwnPropertyDescriptor(entry, 'publicKeyPem');
  const revokedDescriptor = Object.getOwnPropertyDescriptor(entry, 'revoked');
  check(publicKeyDescriptor && Object.hasOwn(publicKeyDescriptor, 'value') && revokedDescriptor && Object.hasOwn(revokedDescriptor, 'value'), 'AUTHORITY_REGISTRY_ISSUER_KEYRING_INVALID');
  check(revokedDescriptor.value === false, revokedDescriptor.value === true ? 'AUTHORITY_REGISTRY_ISSUER_KEY_REVOKED' : 'AUTHORITY_REGISTRY_ISSUER_KEYRING_INVALID');
  const publicKeyPem = publicKeyDescriptor.value;
  check(publicKeyFingerprint(publicKeyPem) === policy.issuerKeySha256, 'AUTHORITY_REGISTRY_ISSUER_KEY_MISMATCH');
  return publicKeyPem;
}

function immutableEntryEqual(left, right) {
  return left.authorityId === right.authorityId && left.publicKeySha256 === right.publicKeySha256
    && left.keyEpoch === right.keyEpoch && left.predecessorSignerId === right.predecessorSignerId
    && left.notBeforeMs === right.notBeforeMs && left.roles.length === right.roles.length
    && left.roles.every((role, index) => role === right.roles[index]);
}

function checkRotation(previous, current, body) {
  const previousBySigner = new Map(previous.body.entries.map(entry => [entry.signerId, entry]));
  const currentBySigner = new Map(body.entries.map(entry => [entry.signerId, entry]));
  for (const oldEntry of previous.body.entries) {
    const nextEntry = currentBySigner.get(oldEntry.signerId);
    check(nextEntry && immutableEntryEqual(oldEntry, nextEntry), 'AUTHORITY_REGISTRY_APPEND_ONLY_VIOLATION');
    if (oldEntry.status === 'revoked') {
      check(nextEntry.status === 'revoked' && nextEntry.revokedAtMs === oldEntry.revokedAtMs, 'AUTHORITY_REGISTRY_REVOCATION_RESURRECTED');
    } else if (nextEntry.status === 'revoked') {
      check(nextEntry.revokedAtMs !== null && nextEntry.revokedAtMs >= oldEntry.notBeforeMs
        && nextEntry.revokedAtMs >= previous.body.issuedAtMs && nextEntry.revokedAtMs <= body.issuedAtMs, 'AUTHORITY_REGISTRY_REVOCATION_INVALID');
    } else check(nextEntry.revokedAtMs === null, 'AUTHORITY_REGISTRY_ENTRY_STATUS_INVALID');
  }
  for (const currentEntry of body.entries) {
    if (previousBySigner.has(currentEntry.signerId)) continue;
    const predecessor = currentEntry.predecessorSignerId && previousBySigner.get(currentEntry.predecessorSignerId);
    check(currentEntry.status === 'active' && predecessor, 'AUTHORITY_REGISTRY_ROTATION_INVALID');
    check(predecessor.status === 'active', 'AUTHORITY_REGISTRY_ROTATION_INVALID');
    const currentPredecessor = currentBySigner.get(predecessor.signerId);
    check(currentPredecessor?.status === 'revoked', 'AUTHORITY_REGISTRY_ROTATION_INVALID');
    check(currentEntry.authorityId === predecessor.authorityId && currentEntry.keyEpoch === predecessor.keyEpoch + 1
      && currentEntry.publicKeySha256 !== predecessor.publicKeySha256
      && currentEntry.roles.every(role => predecessor.roles.includes(role))
      && currentEntry.notBeforeMs <= body.issuedAtMs, 'AUTHORITY_REGISTRY_ROTATION_INVALID');
  }
  check(body.issuedAtMs >= previous.body.issuedAtMs, 'AUTHORITY_REGISTRY_TIME_REGRESSION');
}

export function verifyAuthorityRegistry({ policy, registry, issuerKeyring, previousRegistry = null,
  nowMs = Date.now(), requireCurrent = true } = {}) {
  validateAuthorityRegistryPolicy(policy);
  const issuerPublicKeyPem = resolveIssuer(policy, issuerKeyring);
  validateAuthorityRegistry(registry);
  const body = registry.body;
  check(body.registryId === policy.registryId && body.issuerId === policy.issuerId && body.policyRoot === policy.policyRoot,
    'AUTHORITY_REGISTRY_POLICY_MISMATCH');
  let authenticCurrent = false;
  try { authenticCurrent = authentic(registry, issuerPublicKeyPem); } catch { authenticCurrent = false; }
  check(authenticCurrent, 'AUTHORITY_REGISTRY_SIGNATURE_INVALID');
  if (previousRegistry) {
    validateAuthorityRegistry(previousRegistry);
    check(previousRegistry.body.registryId === body.registryId && previousRegistry.body.issuerId === body.issuerId
      && previousRegistry.body.policyRoot === body.policyRoot && previousRegistry.body.sequence + 1 === body.sequence
      && body.previousRegistryRoot === previousRegistry.root, 'AUTHORITY_REGISTRY_CHAIN_INVALID');
    let authenticPrevious = false;
    try { authenticPrevious = authentic(previousRegistry, issuerPublicKeyPem); } catch { authenticPrevious = false; }
    check(authenticPrevious, 'AUTHORITY_REGISTRY_PREVIOUS_SIGNATURE_INVALID');
    checkRotation(previousRegistry, registry, body);
  } else check(body.sequence === 1 && body.previousRegistryRoot === GENESIS, 'AUTHORITY_REGISTRY_CHAIN_INVALID');
  check(Number.isSafeInteger(nowMs) && nowMs >= 0, 'AUTHORITY_REGISTRY_TIME_INVALID');
  if (requireCurrent) {
    check(body.issuedAtMs <= nowMs, 'AUTHORITY_REGISTRY_NOT_YET_VALID');
    check(nowMs < body.expiresAtMs, 'AUTHORITY_REGISTRY_EXPIRED');
    for (const entry of body.entries) {
      if (entry.status === 'active') check(entry.notBeforeMs <= nowMs, 'AUTHORITY_REGISTRY_MEMBER_NOT_YET_VALID');
      else check(entry.revokedAtMs <= nowMs, 'AUTHORITY_REGISTRY_REVOCATION_NOT_YET_EFFECTIVE');
    }
  }
  return {
    format: REGISTRY_VERIFICATION_FORMAT, registryRoot: registry.root, registryId: body.registryId,
    sequence: body.sequence, issuerId: body.issuerId,
    activeSigners: body.entries.filter(entry => entry.status === 'active').map(entry => entry.signerId),
    revokedSigners: body.entries.filter(entry => entry.status === 'revoked').map(entry => entry.signerId),
    observedAtMs: nowMs, expiresAtMs: body.expiresAtMs,
  };
}

function memberEntry(memberKeyring, signerId) {
  const descriptor = Object.getOwnPropertyDescriptor(memberKeyring, signerId);
  if (!descriptor) return null;
  check(Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID');
  const entry = descriptor.value;
  try { exact(entry, ['publicKeyPem', 'revoked'], 'AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID'); }
  catch (error) { if (error instanceof ProtocolError) throw error; fail('AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID'); }
  const publicDescriptor = Object.getOwnPropertyDescriptor(entry, 'publicKeyPem');
  const revokedDescriptor = Object.getOwnPropertyDescriptor(entry, 'revoked');
  check(publicDescriptor && Object.hasOwn(publicDescriptor, 'value') && revokedDescriptor && Object.hasOwn(revokedDescriptor, 'value')
    && typeof revokedDescriptor.value === 'boolean', 'AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID');
  return { publicKeyPem: publicDescriptor.value, revoked: revokedDescriptor.value };
}

export function keyringFromAuthorityRegistry({ registry, memberKeyring, role, nowMs = Date.now(), includeRevoked = true } = {}) {
  validateAuthorityRegistry(registry);
  check(REGISTRY_ROLES.includes(role), 'AUTHORITY_REGISTRY_ROLE_INVALID');
  check(plain(memberKeyring), 'AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID');
  check(Number.isSafeInteger(nowMs) && nowMs >= 0, 'AUTHORITY_REGISTRY_TIME_INVALID');
  check(typeof includeRevoked === 'boolean', 'AUTHORITY_REGISTRY_INCLUDE_REVOKED_INVALID');
  check(registry.body.issuedAtMs <= nowMs && nowMs < registry.body.expiresAtMs, 'AUTHORITY_REGISTRY_NOT_CURRENT');
  const output = Object.create(null);
  for (const entry of registry.body.entries) {
    if (!entry.roles.includes(role)) continue;
    if (entry.status === 'active') check(entry.notBeforeMs <= nowMs, 'AUTHORITY_REGISTRY_MEMBER_NOT_YET_VALID');
    if (entry.status === 'revoked' && !includeRevoked) continue;
    const member = memberEntry(memberKeyring, entry.signerId);
    if (!member) {
      if (entry.status === 'active') fail('AUTHORITY_REGISTRY_MEMBER_KEY_NOT_CONFIGURED');
      continue;
    }
    let fingerprint;
    try { fingerprint = publicKeyFingerprint(member.publicKeyPem); } catch { fail('AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID'); }
    check(fingerprint === entry.publicKeySha256, 'AUTHORITY_REGISTRY_MEMBER_KEY_MISMATCH');
    if (entry.status === 'active') check(member.revoked === false, member.revoked === true
      ? 'AUTHORITY_REGISTRY_MEMBER_KEY_REVOKED' : 'AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID');
    output[entry.signerId] = { publicKeyPem: member.publicKeyPem, revoked: entry.status === 'revoked' };
  }
  return output;
}

export const authorityRegistryFormats = Object.freeze({ policy: REGISTRY_POLICY_FORMAT, registry: REGISTRY_FORMAT, verification: REGISTRY_VERIFICATION_FORMAT });
