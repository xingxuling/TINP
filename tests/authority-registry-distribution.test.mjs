import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt,
  validateAuthorityRegistryDistributionBundle, validateAuthorityRegistryDistributionPolicy,
  validateAuthorityRegistryDistributionReceipt, verifyAuthorityRegistryDistribution } from '../src/authority-registry-distribution.mjs';

function fixture() {
  const issuer = newIdentity();
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-distribution-test',
    issuerId: 'registry:issuer-distribution-test', publicKeyPem: issuer.publicKey });
  const member = newIdentity();
  const registryBody = makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 1000, expiresAtMs: now + 60 * 60 * 1000, entries: [makeAuthorityRegistryEntry({
      authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
      publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 1000,
    })] });
  const registry = signAuthorityRegistry(registryBody, issuer.privateKey);
  const mirrors = ['mirror:alpha', 'mirror:beta', 'mirror:gamma'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:distribution-test', registryId: registry.body.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const receipts = mirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
    makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
      mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs: now - 500, expiresAtMs: now + 30 * 60 * 1000 }),
    mirror.privateKey));
  const bundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts });
  const issuerKeyring = { 'registry:issuer-distribution-test': { publicKeyPem: issuer.publicKey, revoked: false } };
  const mirrorKeyring = Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId, { publicKeyPem: mirror.publicKey, revoked: false }]));
  return { now, issuer, registryPolicy, registry, mirrors, distributionPolicy, receipts, bundle, issuerKeyring, mirrorKeyring };
}

test('distribution policy and mirror quorum converge on one signed registry root', () => {
  const f = fixture();
  assert.equal(validateAuthorityRegistryDistributionPolicy(f.distributionPolicy), true);
  assert.equal(validateAuthorityRegistryDistributionBundle(f.bundle), true);
  assert.equal(validateAuthorityRegistryDistributionReceipt(f.receipts[0]), true);
  const result = verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now });
  assert.equal(result.sequence, 1);
  assert.deepEqual(result.acceptedMirrors, ['mirror:alpha', 'mirror:beta', 'mirror:gamma']);
  assert.equal(result.threshold, 2);
  assert.equal(JSON.stringify(f.bundle).includes('PRIVATE KEY'), false);
  assert.equal(JSON.stringify(f.bundle).includes(f.mirrors[0].privateKey), false);
});

test('validly signed conflicting mirror receipt is rejected as a deterministic fork', () => {
  const f = fixture();
  const forkBody = { ...f.receipts[0].body, registryRoot: 'f'.repeat(64) };
  const forkReceipt = signAuthorityRegistryDistributionReceipt(forkBody, f.mirrors[0].privateKey);
  const forkBundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy: f.distributionPolicy,
    registry: f.registry, receipts: [forkReceipt, f.receipts[1]] });
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: forkBundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED/);
  const sequenceFork = signAuthorityRegistryDistributionReceipt({ ...f.receipts[0].body, sequence: 2 }, f.mirrors[0].privateKey);
  const sequenceBundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy: f.distributionPolicy,
    registry: f.registry, receipts: [sequenceFork, f.receipts[1]] });
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: sequenceBundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED/);
});

test('quorum and receipt validity are bounded by caller time and threshold', () => {
  const f = fixture();
  const insufficient = makeAuthorityRegistryDistributionBundle({ distributionPolicy: f.distributionPolicy,
    registry: f.registry, receipts: [f.receipts[0]] });
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: insufficient,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_QUORUM_INSUFFICIENT/);
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now - 600 }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_NOT_YET_VALID/);
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: f.mirrorKeyring, nowMs: f.now + 31 * 60 * 1000 }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_EXPIRED/);
});

test('mirror key replacement, revocation, duplicate and ordering fail closed', () => {
  const f = fixture();
  const wrong = newIdentity();
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: { ...f.mirrorKeyring, 'mirror:alpha': { publicKeyPem: wrong.publicKey, revoked: false } }, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_KEY_MISMATCH/);
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: { ...f.mirrorKeyring, 'mirror:alpha': { publicKeyPem: f.mirrors[0].publicKey, revoked: true } }, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_MIRROR_REVOKED/);
  const duplicate = { ...f.bundle, receipts: [f.receipts[0], f.receipts[0]] };
  assert.throws(() => validateAuthorityRegistryDistributionBundle(duplicate), /AUTHORITY_REGISTRY_DISTRIBUTION_DUPLICATE_RECEIPT/);
  const unsorted = { ...f.bundle, receipts: [f.receipts[1], f.receipts[0], f.receipts[2]] };
  assert.throws(() => validateAuthorityRegistryDistributionBundle(unsorted), /AUTHORITY_REGISTRY_DISTRIBUTION_RECEIPTS_UNSORTED/);
});

test('strict object and private-key boundaries reject accessors and private mirror material', () => {
  const f = fixture();
  const getterPolicy = { ...f.distributionPolicy };
  delete getterPolicy.mirrors;
  Object.defineProperty(getterPolicy, 'mirrors', { enumerable: true, get() { return f.distributionPolicy.mirrors; } });
  assert.throws(() => validateAuthorityRegistryDistributionPolicy(getterPolicy), /AUTHORITY_REGISTRY_DISTRIBUTION_POLICY_INVALID/);
  const privateKeyring = { ...f.mirrorKeyring, 'mirror:alpha': { publicKeyPem: f.mirrors[0].privateKey, revoked: false } };
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: privateKeyring, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_PUBLIC_KEY_INVALID/);
  const inherited = Object.create(f.mirrorKeyring);
  assert.throws(() => verifyAuthorityRegistryDistribution({ distributionPolicy: f.distributionPolicy, bundle: f.bundle,
    registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring, mirrorKeyring: inherited, nowMs: f.now }),
  /AUTHORITY_REGISTRY_DISTRIBUTION_KEYRING_INVALID/);
});
