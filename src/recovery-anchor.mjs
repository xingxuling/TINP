import { createHash, createPublicKey } from 'node:crypto';
import { GENESIS } from './evidence.mjs';
import { authentic, ProtocolError, requireThat, rootHash } from './identity.mjs';

const HASH = /^[a-f0-9]{64}$/;
const POLICY_FORMAT = 'twni.external-recovery-anchor-policy.v1';
const ANCHOR_FORMAT = 'twni.external-recovery-anchor.v1';
const PROJECTION_FORMAT = 'twni.recovery-state-projection.v1';
const POLICY_KEYS = ['format', 'signerId', 'publicKeySha256', 'scope', 'role', 'configurationRoot', 'policyRoot'];
const STATE_KEYS = ['subjectId', 'continuityRoot', 'worldId', 'leaseRoot', 'sessionRoot', 'pendingRoot', 'revoked', 'revocationEpoch', 'currentSource', 'operatorPolicyRoot'];
const BODY_KEYS = ['format', 'signerId', 'policyRoot', 'sequence', 'previousAnchorRoot', 'subjectId', 'continuityRoot', 'worldId', 'leaseRoot', 'sessionRoot', 'pendingRoot', 'revoked', 'revocationEpoch', 'ledgerLength', 'ledgerRoot', 'state', 'stateRoot', 'issuedAtMs'];

const deny = code => { throw new ProtocolError(code); };
const exactKeys = (value, keys, code) => requireThat(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|'), code);
const hashOrNull = value => value === null || (typeof value === 'string' && HASH.test(value));
const nonEmpty = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
const safeNonNegative = value => Number.isSafeInteger(value) && value >= 0;
const fingerprint = publicKeyPem => {
  try {
    const key = createPublicKey(publicKeyPem);
    requireThat(key.asymmetricKeyType === 'ed25519', 'RECOVERY_ANCHOR_PUBLIC_KEY_INVALID');
    return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
  }
  catch { deny('RECOVERY_ANCHOR_PUBLIC_KEY_INVALID'); }
};
const noPrivateKey = value => typeof value === 'string' && !/BEGIN [^-]*PRIVATE KEY/.test(value);

export function makeRecoveryAnchorPolicy({ signerId, publicKeyPem, configurationRoot = null } = {}) {
  requireThat(nonEmpty(signerId) && typeof publicKeyPem === 'string' && noPrivateKey(publicKeyPem), 'RECOVERY_ANCHOR_POLICY_INVALID');
  requireThat(configurationRoot === null || HASH.test(configurationRoot), 'RECOVERY_ANCHOR_POLICY_INVALID');
  const body = { format: POLICY_FORMAT, signerId, publicKeySha256: fingerprint(publicKeyPem), scope: 'tinp.recovery.anchor', role: 'tinp.recovery.witness', configurationRoot };
  return { ...body, policyRoot: rootHash(body) };
}

export function validateRecoveryAnchorPolicy(policy) {
  exactKeys(policy, POLICY_KEYS, 'RECOVERY_ANCHOR_POLICY_INVALID');
  requireThat(policy.format === POLICY_FORMAT && nonEmpty(policy.signerId) && HASH.test(policy.publicKeySha256) &&
    policy.scope === 'tinp.recovery.anchor' && policy.role === 'tinp.recovery.witness' &&
    (policy.configurationRoot === null || HASH.test(policy.configurationRoot)) && HASH.test(policy.policyRoot), 'RECOVERY_ANCHOR_POLICY_INVALID');
  const { policyRoot, ...body } = policy;
  requireThat(rootHash(body) === policyRoot, 'RECOVERY_ANCHOR_POLICY_INVALID');
  return true;
}

function projectionValues(snapshot = {}) {
  const lease = snapshot.lease;
  const session = snapshot.session;
  const operatorPolicy = snapshot.operatorPolicy;
  return {
    subjectId: snapshot.subjectId ?? lease?.body?.subjectId ?? null,
    continuityRoot: snapshot.continuityRoot ?? lease?.body?.continuityRoot ?? null,
    worldId: snapshot.worldId ?? lease?.body?.worldId ?? null,
    leaseRoot: snapshot.leaseRoot ?? lease?.root ?? null,
    sessionRoot: snapshot.sessionRoot ?? session?.root ?? null,
    pendingRoot: snapshot.pendingRoot ?? snapshot.pending?.request?.root ?? null,
    revoked: Boolean(snapshot.revoked),
    revocationEpoch: snapshot.revocationEpoch,
    currentSource: snapshot.currentSource ?? null,
    operatorPolicyRoot: snapshot.operatorPolicyRoot ?? operatorPolicy?.policyRoot ?? null,
  };
}

export function recoveryStateRoot(snapshot = {}) {
  const values = projectionValues(snapshot);
  return rootHash({ format: PROJECTION_FORMAT, ...values });
}

function validateAnchorBody(body) {
  exactKeys(body, BODY_KEYS, 'RECOVERY_ANCHOR_INVALID');
  requireThat(body.format === ANCHOR_FORMAT && nonEmpty(body.signerId) && HASH.test(body.policyRoot) &&
    safeNonNegative(body.sequence) && body.sequence > 0 && (body.previousAnchorRoot === GENESIS || HASH.test(body.previousAnchorRoot)) &&
    nonEmpty(body.subjectId) && HASH.test(body.continuityRoot) && nonEmpty(body.worldId) && HASH.test(body.leaseRoot) &&
    hashOrNull(body.sessionRoot) && hashOrNull(body.pendingRoot) && typeof body.revoked === 'boolean' &&
    safeNonNegative(body.revocationEpoch) && safeNonNegative(body.ledgerLength) && HASH.test(body.ledgerRoot) &&
    HASH.test(body.stateRoot) && Number.isSafeInteger(body.issuedAtMs), 'RECOVERY_ANCHOR_INVALID');
  exactKeys(body.state, STATE_KEYS, 'RECOVERY_ANCHOR_INVALID');
  requireThat(nonEmpty(body.state.subjectId) && HASH.test(body.state.continuityRoot) && nonEmpty(body.state.worldId) && HASH.test(body.state.leaseRoot) &&
    hashOrNull(body.state.sessionRoot) && hashOrNull(body.state.pendingRoot) && typeof body.state.revoked === 'boolean' &&
    safeNonNegative(body.state.revocationEpoch) && nonEmpty(body.state.currentSource) && hashOrNull(body.state.operatorPolicyRoot) &&
    body.stateRoot === recoveryStateRoot(body.state) && body.state.subjectId === body.subjectId && body.state.continuityRoot === body.continuityRoot &&
    body.state.worldId === body.worldId && body.state.leaseRoot === body.leaseRoot && body.state.sessionRoot === body.sessionRoot &&
    body.state.pendingRoot === body.pendingRoot && body.state.revoked === body.revoked && body.state.revocationEpoch === body.revocationEpoch, 'RECOVERY_ANCHOR_INVALID');
  return true;
}

export function validateRecoveryAnchor(anchor) {
  exactKeys(anchor, ['body', 'root', 'signature'], 'RECOVERY_ANCHOR_INVALID');
  validateAnchorBody(anchor.body);
  requireThat(HASH.test(anchor.root) && typeof anchor.signature === 'string' && anchor.signature.length > 0, 'RECOVERY_ANCHOR_INVALID');
  return true;
}

function resolveKey(policy, keyring) {
  requireThat(keyring && typeof keyring === 'object' && !Array.isArray(keyring), 'RECOVERY_ANCHOR_KEYRING_REQUIRED');
  const descriptor = Object.getOwnPropertyDescriptor(keyring, policy.signerId);
  requireThat(descriptor && Object.hasOwn(descriptor, 'value'), 'RECOVERY_ANCHOR_KEY_NOT_CONFIGURED');
  const entry = descriptor.value;
  exactKeys(entry, ['publicKeyPem', 'revoked'], 'RECOVERY_ANCHOR_KEYRING_INVALID');
  const publicKeyDescriptor = Object.getOwnPropertyDescriptor(entry, 'publicKeyPem');
  const revokedDescriptor = Object.getOwnPropertyDescriptor(entry, 'revoked');
  requireThat(publicKeyDescriptor && Object.hasOwn(publicKeyDescriptor, 'value') &&
    revokedDescriptor && Object.hasOwn(revokedDescriptor, 'value'), 'RECOVERY_ANCHOR_KEYRING_INVALID');
  const publicKeyPem = publicKeyDescriptor.value;
  const revoked = revokedDescriptor.value;
  requireThat(typeof publicKeyPem === 'string' && noPrivateKey(publicKeyPem) && revoked === false,
    revoked === true ? 'RECOVERY_ANCHOR_KEY_REVOKED' : 'RECOVERY_ANCHOR_KEYRING_INVALID');
  requireThat(fingerprint(publicKeyPem) === policy.publicKeySha256, 'RECOVERY_ANCHOR_KEY_MISMATCH');
  return publicKeyPem;
}

function prefixProjection(anchor, snapshot) {
  const values = projectionValues(snapshot);
  for (const key of ['subjectId', 'continuityRoot', 'worldId', 'leaseRoot']) requireThat(anchor.body[key] === values[key], 'RECOVERY_ANCHOR_STATE_MISMATCH');
  requireThat(values.revocationEpoch <= anchor.body.revocationEpoch && (!values.revoked || anchor.body.revoked), 'RECOVERY_ANCHOR_STATE_MISMATCH');
}

/** Verify an externally signed anchor against a locally authenticated ledger prefix. */
export function verifyRecoveryAnchor({ policy, anchor, keyring, local, savedAnchor = null, requireCurrent = false } = {}) {
  validateRecoveryAnchorPolicy(policy);
  const publicKeyPem = resolveKey(policy, keyring);
  validateRecoveryAnchor(anchor);
  const body = anchor.body;
  requireThat(body.signerId === policy.signerId && body.policyRoot === policy.policyRoot && authentic(anchor, publicKeyPem), 'RECOVERY_ANCHOR_SIGNATURE_INVALID');
  const events = local?.ledger?.events ?? [];
  requireThat(body.ledgerLength > 0 && body.ledgerLength <= events.length, 'RECOVERY_ANCHOR_ROLLBACK');
  requireThat(events[body.ledgerLength - 1]?.eventRoot === body.ledgerRoot, 'RECOVERY_ANCHOR_ROLLBACK');
  const prefix = events[body.ledgerLength - 1]?.detail?.recovery;
  requireThat(prefix, 'RECOVERY_ANCHOR_PREFIX_UNRESOLVED');
  prefixProjection(anchor, prefix);
  const current = projectionValues(local);
  requireThat(current.leaseRoot === body.leaseRoot && current.subjectId === body.subjectId && current.continuityRoot === body.continuityRoot && current.worldId === body.worldId &&
    current.revocationEpoch >= body.revocationEpoch && (!body.revoked || current.revoked), 'RECOVERY_ANCHOR_CURRENT_STATE_INVALID');
  if (savedAnchor) {
    validateRecoveryAnchor(savedAnchor);
    requireThat(anchor.body.sequence >= savedAnchor.body.sequence, 'RECOVERY_ANCHOR_SEQUENCE_ROLLBACK');
    if (anchor.body.sequence === savedAnchor.body.sequence) requireThat(anchor.root === savedAnchor.root, 'RECOVERY_ANCHOR_REPLACED');
    else requireThat(anchor.body.previousAnchorRoot === savedAnchor.root, 'RECOVERY_ANCHOR_SEQUENCE_ROLLBACK');
  } else {
    requireThat(anchor.body.sequence === 1 && anchor.body.previousAnchorRoot === GENESIS, 'RECOVERY_ANCHOR_SEQUENCE_ROLLBACK');
  }
  if (requireCurrent) {
    requireThat(body.ledgerLength === events.length && body.ledgerRoot === local.ledger.root && body.stateRoot === recoveryStateRoot(local) &&
      body.sessionRoot === current.sessionRoot && body.pendingRoot === current.pendingRoot && body.revoked === current.revoked && body.revocationEpoch === current.revocationEpoch &&
      body.state.currentSource === current.currentSource && body.state.operatorPolicyRoot === current.operatorPolicyRoot, 'RECOVERY_ANCHOR_CURRENT_STATE_INVALID');
  }
  return { format: 'twni.external-recovery-anchor-verification.v1', anchorRoot: anchor.root, signerId: body.signerId, publicKeySha256: policy.publicKeySha256, sequence: body.sequence, ledgerLength: body.ledgerLength, ledgerRoot: body.ledgerRoot };
}

export function anchorBodyForState({ policy, sequence, previousAnchorRoot = GENESIS, state, issuedAtMs = Date.now() } = {}) {
  validateRecoveryAnchorPolicy(policy);
  const values = projectionValues(state);
  requireThat(safeNonNegative(sequence) && sequence > 0 && (previousAnchorRoot === GENESIS || HASH.test(previousAnchorRoot)), 'RECOVERY_ANCHOR_BUILD_INVALID');
  requireThat(values.subjectId && values.continuityRoot && values.worldId && HASH.test(values.leaseRoot) && safeNonNegative(values.revocationEpoch), 'RECOVERY_ANCHOR_BUILD_INVALID');
  requireThat(state?.ledger?.events?.length > 0 && HASH.test(state.ledger.root), 'RECOVERY_ANCHOR_BUILD_INVALID');
  return {
    format: ANCHOR_FORMAT, signerId: policy.signerId, policyRoot: policy.policyRoot, sequence, previousAnchorRoot,
    subjectId: values.subjectId, continuityRoot: values.continuityRoot, worldId: values.worldId, leaseRoot: values.leaseRoot,
    sessionRoot: values.sessionRoot, pendingRoot: values.pendingRoot, revoked: values.revoked, revocationEpoch: values.revocationEpoch,
    ledgerLength: state.ledger.events.length, ledgerRoot: state.ledger.root, state: values, stateRoot: recoveryStateRoot(values), issuedAtMs,
  };
}

export const recoveryAnchorFormats = Object.freeze({ policy: POLICY_FORMAT, anchor: ANCHOR_FORMAT, projection: PROJECTION_FORMAT });
