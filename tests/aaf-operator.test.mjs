import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeOperatorPolicy, validateOperatorPolicy, verifyOperatorApproval } from '../adapters/aaf-operator.mjs';
import { generateEd25519Keypair, signObject } from '../vendor/aaf/src/signatures.mjs';
import { sealApproval } from '../vendor/aaf/src/contracts.mjs';
import { ProtocolError, rootHash } from '../src/identity.mjs';

const key = generateEd25519Keypair(), other = generateEd25519Keypair();
const signerId = 'fixture:independent-operator';
const nowMs = Date.parse('2026-09-10T12:00:00.000Z');
const challengeRoot = rootHash({ fixture: 'pending-retirement', request: 'unique' });
const policy = makeOperatorPolicy({ signerId, publicKeyPem: key.public_key_pem });
const keyring = { [signerId]: { publicKeyPem: key.public_key_pem, revoked: false } };
function receipt(overrides = {}, signingKey = key, signingId = signerId) {
  return signObject(sealApproval({ approval_id: 'fixture:approval:1', proposal_root: challengeRoot,
    approver_id: signerId, approver_roles: ['tinp.operator'], decision: 'approved',
    scopes: ['tinp.pending.retire'], conditions: [], issued_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + 60000).toISOString(), ...overrides }), signingKey.private_key_pem, signingId);
}
const verify = (approval = receipt(), overrides = {}) => verifyOperatorApproval({ policy, challengeRoot, approval, keyring, nowMs, ...overrides });
function denied(operation, code) {
  assert.throws(operation, error => error instanceof ProtocolError && error.code === code);
}

test('real AAF signature authorizes the exact bounded challenge through the external public key', () => {
  const approval = receipt();
  assert.equal(validateOperatorPolicy(policy), true);
  assert.deepEqual(verify(approval), { format: 'twni.external-operator-verification.v1',
    approvalRoot: approval.approval_root, signerId, publicKeySha256: policy.publicKeySha256,
    challengeRoot, authorizedAtMs: nowMs });
  assert.equal(JSON.stringify(policy).includes('PUBLIC KEY'), false);
  assert.equal(verify(receipt({ expires_at: new Date(nowMs + 600000).toISOString() })).authorizedAtMs, nowMs);
});

test('unsigned, cryptographically tampered, or incorrectly rooted approvals fail', () => {
  const unsigned = receipt(); delete unsigned.signature;
  denied(() => verify(unsigned), 'OPERATOR_APPROVAL_INVALID');
  const tampered = receipt(); tampered.signature.value = Buffer.alloc(64).toString('base64');
  denied(() => verify(tampered), 'OPERATOR_SIGNATURE_INVALID');
  const wrongRoot = receipt(); wrongRoot.approval_root = '0'.repeat(64);
  const resigned = signObject(wrongRoot, key.private_key_pem, signerId);
  denied(() => verify(resigned), 'OPERATOR_APPROVAL_ROOT_INVALID');
});

test('replacement keys cannot satisfy the pin even with a valid signature', () => {
  denied(() => verify(receipt({}, other), { keyring: { [signerId]: { publicKeyPem: other.public_key_pem, revoked: false } } }),
    'OPERATOR_KEY_FINGERPRINT_MISMATCH');
  denied(() => verify(receipt({}, other)), 'OPERATOR_SIGNATURE_INVALID');
  denied(() => verify(receipt(), { keyring: {} }), 'OPERATOR_KEY_NOT_CONFIGURED');
});

test('key revocation metadata must be explicit false and cannot carry inline private material', () => {
  for (const revoked of [true, null, 0, 'false']) {
    denied(() => verify(receipt(), { keyring: { [signerId]: { publicKeyPem: key.public_key_pem, revoked } } }), 'OPERATOR_KEY_REVOKED');
  }
  denied(() => verify(receipt(), { keyring: { [signerId]: { publicKeyPem: key.public_key_pem } } }), 'OPERATOR_KEYRING_INVALID');
  denied(() => verify(receipt(), { keyring: { [signerId]: { publicKeyPem: key.private_key_pem, revoked: false } } }), 'OPERATOR_KEY_INVALID');
});

test('challenge, signer, and approver bindings are independent hard gates', () => {
  denied(() => verify(receipt({ proposal_root: '0'.repeat(64) })), 'OPERATOR_CHALLENGE_MISMATCH');
  denied(() => verify(receipt({ approver_id: 'fixture:other' })), 'OPERATOR_SIGNER_MISMATCH');
  denied(() => verify(receipt({}, key, 'fixture:other')), 'OPERATOR_SIGNER_MISMATCH');
  denied(() => verify(receipt(), { challengeRoot: 'INVALID' }), 'OPERATOR_CHALLENGE_INVALID');
});

test('scope and role profiles reject wildcards, extra roles, and conditions', () => {
  for (const scopes of [['*'], ['tinp.*'], ['tinp.pending.retire', 'extra'], []])
    denied(() => verify(receipt({ scopes })), 'OPERATOR_SCOPE_INVALID');
  for (const approver_roles of [['owner'], ['tinp.operator', 'owner'], []])
    denied(() => verify(receipt({ approver_roles })), 'OPERATOR_ROLE_INVALID');
  denied(() => verify(receipt({ conditions: [{ type: 'invented-grant' }] })), 'OPERATOR_CONDITIONS_INVALID');
  denied(() => verify(receipt({ decision: 'denied' })), 'OPERATOR_APPROVAL_INVALID');
});

test('time windows reject future, expired, overlong, invalid and noncanonical timestamps', () => {
  const invalid = [
    { issued_at: new Date(nowMs + 1).toISOString() },
    { expires_at: new Date(nowMs).toISOString() },
    { expires_at: new Date(nowMs + 600001).toISOString() },
    { issued_at: 'not-a-time' }, { expires_at: '' },
    { issued_at: '2026-09-10T12:00:00Z' },
    { issued_at: '2026-09-10T20:00:00.000+08:00' },
    { issued_at: '2026-02-30T12:00:00.000Z' }
  ];
  for (const fields of invalid) denied(() => verify(receipt(fields)), 'OPERATOR_APPROVAL_TIME_INVALID');
  for (const time of [NaN, Infinity, -1, nowMs + 0.5, '2026'])
    denied(() => verify(receipt(), { nowMs: time }), 'OPERATOR_APPROVAL_TIME_INVALID');
});

test('historical authorization can be verified at its admission time but cannot renew current authority', () => {
  const approval = receipt();
  assert.equal(verify(approval).authorizedAtMs, nowMs);
  denied(() => verify(approval, { nowMs: nowMs + 60000 }), 'OPERATOR_APPROVAL_TIME_INVALID');
});

test('approval shape rejects inline keys, extra fields, accessors, and prototype fields', () => {
  for (const extra of [{ publicKeyPem: key.public_key_pem }, { privateKeyPem: key.private_key_pem }, { unused: true }])
    denied(() => verify({ ...receipt(), ...extra }), 'OPERATOR_APPROVAL_INVALID');
  const accessor = receipt();
  Object.defineProperty(accessor, 'approval_id', { enumerable: true, get() { throw new Error('must not evaluate'); } });
  denied(() => verify(accessor), 'OPERATOR_APPROVAL_INVALID');
  const inherited = Object.assign(Object.create({ fake: true }), receipt());
  denied(() => verify(inherited), 'OPERATOR_APPROVAL_INVALID');
  const sig = receipt(); sig.signature.inlineKey = key.public_key_pem;
  denied(() => verify(sig), 'OPERATOR_SIGNATURE_INVALID');
});

test('canonical signature encoding rejects extra bytes, whitespace, and altered algorithm', () => {
  for (const value of ['', 'garbage', receipt().signature.value + '\n', Buffer.alloc(65).toString('base64')]) {
    const approval = receipt(); approval.signature.value = value;
    denied(() => verify(approval), 'OPERATOR_SIGNATURE_INVALID');
  }
  const approval = receipt(); approval.signature.algorithm = 'RSA';
  denied(() => verify(approval), 'OPERATOR_SIGNER_MISMATCH');
});

test('policy validation rejects root drift, wildcard policy, public keys, and non-Ed25519 keys', () => {
  denied(() => validateOperatorPolicy({ ...policy, policyRoot: '0'.repeat(64) }), 'OPERATOR_POLICY_ROOT_INVALID');
  denied(() => validateOperatorPolicy({ ...policy, scope: '*' }), 'OPERATOR_POLICY_INVALID');
  denied(() => validateOperatorPolicy({ ...policy, publicKeyPem: key.public_key_pem }), 'OPERATOR_POLICY_INVALID');
  denied(() => makeOperatorPolicy({ signerId, publicKeyPem: key.private_key_pem }), 'OPERATOR_KEY_INVALID');
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' });
  denied(() => makeOperatorPolicy({ signerId, publicKeyPem: ec }), 'OPERATOR_KEY_TYPE_INVALID');
});

test('external keyring entry accessors are rejected without evaluation', () => {
  const supplied = {};
  Object.defineProperty(supplied, signerId, { enumerable: true, get() { throw new Error('must not evaluate'); } });
  denied(() => verify(receipt(), { keyring: supplied }), 'OPERATOR_KEY_NOT_CONFIGURED');
  const entry = { revoked: false };
  Object.defineProperty(entry, 'publicKeyPem', { enumerable: true, get() { throw new Error('must not evaluate'); } });
  denied(() => verify(receipt(), { keyring: { [signerId]: entry } }), 'OPERATOR_KEYRING_INVALID');
});

test('vendored AAF bytes match the recorded git HEAD provenance hashes', () => {
  const provenance = JSON.parse(readFileSync(new URL('../vendor/aaf/PROVENANCE.json', import.meta.url), 'utf8'));
  assert.equal(provenance.modified, false);
  assert.equal(provenance.files.length, 4);
  for (const file of provenance.files) {
    const bytes = readFileSync(new URL(`../vendor/aaf/${file.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
});
