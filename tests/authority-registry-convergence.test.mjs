import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle, validateAuthorityRegistryConvergenceBundle,
  verifyAuthorityRegistryConvergence } from '../src/authority-registry-convergence.mjs';

function fixture() {
  const issuer = newIdentity();
  const member = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta', 'mirror:gamma'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-test',
    issuerId: 'registry:issuer-convergence-test', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry3 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 3,
    previousRegistryRoot: registry2.root, issuedAtMs: now - 500, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-test',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const makeBundle = (registry, issuedAtMs, selectedMirrors = mirrors) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry, receipts: selectedMirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs, expiresAtMs: now + 1800000 }), mirror.privateKey)),
  });
  const bundle1 = makeBundle(registry1, now - 1500);
  const bundle2 = makeBundle(registry2, now - 800);
  const bundle3 = makeBundle(registry3, now - 400);
  const issuerKeyring = { [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } };
  const mirrorKeyring = Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId, { publicKeyPem: mirror.publicKey, revoked: false }]));
  return { issuer, member, mirrors, now, registryPolicy, registry1, registry2, registry3, distributionPolicy,
    bundle1, bundle2, bundle3, issuerKeyring, mirrorKeyring, makeBundle };
}

test('convergence bundle verifies a contiguous history with a stable mirror quorum', () => {
  const f = fixture();
  const convergence = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle2, f.bundle1] });
  assert.equal(validateAuthorityRegistryConvergenceBundle(convergence), true);
  const result = verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: convergence, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now });
  assert.equal(result.firstSequence, 1);
  assert.equal(result.lastSequence, 2);
  assert.equal(result.snapshots.length, 2);
  assert.deepEqual(result.stableMirrors, ['mirror:alpha', 'mirror:beta', 'mirror:gamma']);
  assert.equal(JSON.stringify(convergence).includes(f.issuer.privateKey), false);
  assert.equal(JSON.stringify(convergence).includes(f.mirrors[0].privateKey), false);
});

test('same-sequence alternate roots are rejected as a historical fork', () => {
  const f = fixture();
  const forkRegistry = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: f.registryPolicy, sequence: 2,
    previousRegistryRoot: f.registry1.root, issuedAtMs: f.now - 900, expiresAtMs: f.now + 3600000,
    entries: [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
      roles: ['operator'], publicKeySha256: publicKeyFingerprint(f.member.publicKey), notBeforeMs: f.now - 2000 })] }), f.issuer.privateKey);
  const forkBundle = f.makeBundle(forkRegistry, f.now - 700);
  const convergence = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle1, f.bundle2, forkBundle] });
  assert.throws(() => verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: convergence, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CONVERGENCE_FORK_DETECTED/);
});

test('missing sequence and broken predecessor are rejected before distributed history is accepted', () => {
  const f = fixture();
  const gap = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle1, f.bundle3] });
  assert.throws(() => verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: gap, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP/);
  const brokenRegistry = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: f.registryPolicy, sequence: 2,
    previousRegistryRoot: 'e'.repeat(64), issuedAtMs: f.now - 900, expiresAtMs: f.now + 3600000,
    entries: [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
      roles: ['operator'], publicKeySha256: publicKeyFingerprint(f.member.publicKey), notBeforeMs: f.now - 2000 })] }), f.issuer.privateKey);
  const broken = f.makeBundle(brokenRegistry, f.now - 700);
  const brokenHistory = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle1, broken] });
  assert.throws(() => verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: brokenHistory, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CONVERGENCE_FORK_DETECTED/);
});

test('mirror set drift is visible even when each snapshot individually reaches threshold', () => {
  const f = fixture();
  const partial = f.makeBundle(f.registry2, f.now - 800, f.mirrors.slice(0, 2));
  const convergence = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle1, partial] });
  assert.throws(() => verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: convergence, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT/);
});

test('duplicate snapshots, root drift and accessors fail closed', () => {
  const f = fixture();
  const duplicate = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.distributionPolicy,
    bundles: [f.bundle1, f.bundle1] });
  assert.throws(() => verifyAuthorityRegistryConvergence({ distributionPolicy: f.distributionPolicy,
    convergenceBundle: duplicate, registryPolicy: f.registryPolicy, issuerKeyring: f.issuerKeyring,
    mirrorKeyring: f.mirrorKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CONVERGENCE_DUPLICATE_SNAPSHOT/);
  assert.throws(() => validateAuthorityRegistryConvergenceBundle({ ...duplicate, historyRoot: '0'.repeat(64) }),
    /AUTHORITY_REGISTRY_CONVERGENCE_ROOT_INVALID/);
  const accessor = { ...duplicate };
  delete accessor.bundles;
  Object.defineProperty(accessor, 'bundles', { enumerable: true, get() { throw new Error('must not evaluate'); } });
  assert.throws(() => validateAuthorityRegistryConvergenceBundle(accessor), /AUTHORITY_REGISTRY_CONVERGENCE_INVALID/);
});
