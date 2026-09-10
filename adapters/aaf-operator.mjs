import { createHash, createPublicKey } from 'node:crypto';
import { verifyApproval } from '../vendor/aaf/src/contracts.mjs';
import { verifySignedObject } from '../vendor/aaf/src/signatures.mjs';
import { ProtocolError, rootHash } from '../src/identity.mjs';

const POLICY_FORMAT = 'twni.external-operator-policy.v1';
const SCOPE = 'tinp.pending.retire';
const ROLE = 'tinp.operator';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };
const plain = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function exact(value, fields, code) {
  check(plain(value), code);
  const keys = Reflect.ownKeys(value);
  check(keys.length === fields.length && keys.every(key => fields.includes(key)), code);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function exactArray(value, expected, code) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  check(Reflect.ownKeys(value).length === expected.length + 1 && value.length === expected.length, code);
  expected.forEach((entry, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === entry, code);
  });
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function fingerprint(publicKeyPem) {
  check(typeof publicKeyPem === 'string' && publicKeyPem.length <= 4096, 'OPERATOR_KEY_INVALID');
  // Reject private material, even though createPublicKey can derive a public key from it.
  check(publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')
    && publicKeyPem.trimEnd().endsWith('-----END PUBLIC KEY-----')
    && !publicKeyPem.includes('PRIVATE KEY'), 'OPERATOR_KEY_INVALID');
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail('OPERATOR_KEY_INVALID'); }
  check(key.asymmetricKeyType === 'ed25519', 'OPERATOR_KEY_TYPE_INVALID');
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

export function makeOperatorPolicy({ signerId, publicKeyPem }) {
  check(identifier(signerId), 'OPERATOR_POLICY_INVALID');
  const body = { format: POLICY_FORMAT, signerId, publicKeySha256: fingerprint(publicKeyPem), scope: SCOPE, role: ROLE };
  return { ...body, policyRoot: rootHash(body) };
}

export function validateOperatorPolicy(policy) {
  exact(policy, ['format', 'signerId', 'publicKeySha256', 'scope', 'role', 'policyRoot'], 'OPERATOR_POLICY_INVALID');
  check(policy.format === POLICY_FORMAT && identifier(policy.signerId)
    && hex(policy.publicKeySha256) && policy.scope === SCOPE && policy.role === ROLE
    && hex(policy.policyRoot), 'OPERATOR_POLICY_INVALID');
  const { policyRoot, ...body } = policy;
  check(rootHash(body) === policyRoot, 'OPERATOR_POLICY_ROOT_INVALID');
  return true;
}

function timestamp(value) {
  check(typeof value === 'string' && value.length === 24, 'OPERATOR_APPROVAL_TIME_INVALID');
  const ms = Date.parse(value);
  check(Number.isSafeInteger(ms) && new Date(ms).toISOString() === value, 'OPERATOR_APPROVAL_TIME_INVALID');
  return ms;
}

/** A bounded AAF receipt profile. This does not mint identities, leases, or RNCS grants. */
export function verifyOperatorApproval({ policy, challengeRoot, approval, keyring, nowMs }) {
  validateOperatorPolicy(policy);
  check(hex(challengeRoot), 'OPERATOR_CHALLENGE_INVALID');
  check(Number.isSafeInteger(nowMs) && nowMs >= 0, 'OPERATOR_APPROVAL_TIME_INVALID');
  exact(approval, ['format', 'approval_id', 'proposal_root', 'approver_id', 'approver_roles',
    'decision', 'scopes', 'conditions', 'issued_at', 'expires_at', 'approval_root', 'signature'], 'OPERATOR_APPROVAL_INVALID');
  check(approval.format === 'aaf.approval-receipt.v0.1' && identifier(approval.approval_id)
    && hex(approval.approval_root) && approval.decision === 'approved', 'OPERATOR_APPROVAL_INVALID');
  check(approval.proposal_root === challengeRoot, 'OPERATOR_CHALLENGE_MISMATCH');
  exactArray(approval.approver_roles, [ROLE], 'OPERATOR_ROLE_INVALID');
  exactArray(approval.scopes, [SCOPE], 'OPERATOR_SCOPE_INVALID');
  exactArray(approval.conditions, [], 'OPERATOR_CONDITIONS_INVALID');
  exact(approval.signature, ['algorithm', 'signer_id', 'value'], 'OPERATOR_SIGNATURE_INVALID');
  check(approval.signature.algorithm === 'Ed25519'
    && approval.signature.signer_id === policy.signerId
    && approval.approver_id === policy.signerId, 'OPERATOR_SIGNER_MISMATCH');
  const encoded = approval.signature.value;
  check(typeof encoded === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(encoded)
    && Buffer.from(encoded, 'base64').length === 64
    && Buffer.from(encoded, 'base64').toString('base64') === encoded, 'OPERATOR_SIGNATURE_INVALID');
  const issued = timestamp(approval.issued_at), expires = timestamp(approval.expires_at);
  check(issued <= nowMs && nowMs < expires && expires > issued && expires - issued <= 600000,
    'OPERATOR_APPROVAL_TIME_INVALID');
  check(plain(keyring), 'OPERATOR_KEYRING_INVALID');
  const entryDescriptor = Object.getOwnPropertyDescriptor(keyring, policy.signerId);
  check(entryDescriptor && Object.hasOwn(entryDescriptor, 'value') && entryDescriptor.enumerable,
    'OPERATOR_KEY_NOT_CONFIGURED');
  const entry = entryDescriptor.value;
  exact(entry, ['publicKeyPem', 'revoked'], 'OPERATOR_KEYRING_INVALID');
  check(entry.revoked === false, 'OPERATOR_KEY_REVOKED');
  check(fingerprint(entry.publicKeyPem) === policy.publicKeySha256, 'OPERATOR_KEY_FINGERPRINT_MISMATCH');
  let rootValid = false, signatureValid = false;
  try { rootValid = verifyApproval(approval); signatureValid = verifySignedObject(approval, entry.publicKeyPem); }
  catch { fail('OPERATOR_APPROVAL_INVALID'); }
  check(rootValid, 'OPERATOR_APPROVAL_ROOT_INVALID');
  check(signatureValid, 'OPERATOR_SIGNATURE_INVALID');
  return { format: 'twni.external-operator-verification.v1', approvalRoot: approval.approval_root,
    signerId: policy.signerId, publicKeySha256: policy.publicKeySha256, challengeRoot, authorizedAtMs: nowMs };
}
