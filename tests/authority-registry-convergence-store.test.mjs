import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { AuthorityRegistryConvergenceStore, validateAuthorityRegistryConvergenceStoreState } from '../src/authority-registry-convergence-store.mjs';

function fixture() {
  const issuer = newIdentity(), member = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta', 'mirror:gamma'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-store-test',
    issuerId: 'registry:issuer-convergence-store-test', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-store-test',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const makeBundle = (registry, issuedAtMs, selectedMirrors = mirrors) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry, receipts: selectedMirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs, expiresAtMs: now + 1800000 }), mirror.privateKey)),
  });
  const bundle1 = makeBundle(registry1, now - 1500), bundle2 = makeBundle(registry2, now - 800);
  const context = { distributionPolicy, registryPolicy,
    issuerKeyring: { [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } },
    mirrorKeyring: Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
      { publicKeyPem: mirror.publicKey, revoked: false }])), nowMs: now };
  return { issuer, mirrors, now, registry1, registry2, bundle1, bundle2, makeBundle, context };
}

function histories(f) {
  return {
    one: makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.context.distributionPolicy, bundles: [f.bundle1] }),
    two: makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.context.distributionPolicy, bundles: [f.bundle1, f.bundle2] }),
  };
}

function tempStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new AuthorityRegistryConvergenceStore(path.join(directory, 'history.json'));
}

test('store persists the first verified history and reloads it', async t => {
  const f = fixture(), h = histories(f), store = tempStore(t);
  const result = await store.append({ ...f.context, convergenceBundle: h.one });
  assert.equal(result.status, 'appended');
  assert.equal(result.appendedBundles, 1);
  assert.equal(store.exists, true);
  validateAuthorityRegistryConvergenceStoreState(store.load());
  const verification = store.verify(f.context);
  assert.equal(verification.firstSequence, 1);
  assert.equal(verification.lastSequence, 1);
  assert.equal(fs.readFileSync(store.file, 'utf8').includes('PRIVATE KEY'), false);
});

test('store accepts an exact full-history extension and makes replay idempotent', async t => {
  const f = fixture(), h = histories(f), store = tempStore(t);
  await store.append({ ...f.context, convergenceBundle: h.one });
  const extended = await store.append({ ...f.context, convergenceBundle: h.two });
  assert.equal(extended.status, 'extended');
  assert.equal(extended.appendedBundles, 1);
  assert.equal(store.verify(f.context).lastSequence, 2);
  const beforeReplay = fs.readFileSync(store.file);
  const replay = await store.append({ ...f.context, convergenceBundle: h.two });
  assert.equal(replay.status, 'unchanged');
  assert.deepEqual(fs.readFileSync(store.file), beforeReplay);
});

test('store rejects rollback and prefix rewrite without changing durable bytes', async t => {
  const f = fixture(), h = histories(f), store = tempStore(t);
  await store.append({ ...f.context, convergenceBundle: h.two });
  const before = fs.readFileSync(store.file);
  await assert.rejects(store.append({ ...f.context, convergenceBundle: h.one }), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_ROLLBACK/);
  assert.deepEqual(fs.readFileSync(store.file), before);
  const alternateFirst = f.makeBundle(f.registry1, f.now - 1200);
  const rewritten = makeAuthorityRegistryConvergenceBundle({ distributionPolicy: f.context.distributionPolicy,
    bundles: [alternateFirst, f.bundle2] });
  await assert.rejects(store.append({ ...f.context, convergenceBundle: rewritten }), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH/);
  assert.deepEqual(fs.readFileSync(store.file), before);
});

test('store detects tampered history roots and malformed state before use', async t => {
  const f = fixture(), h = histories(f), store = tempStore(t);
  await store.append({ ...f.context, convergenceBundle: h.one });
  const validState = store.load();
  const tampered = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  tampered.historyRoot = 'f'.repeat(64);
  fs.writeFileSync(store.file, JSON.stringify(tampered));
  assert.throws(() => store.load(), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID/);
  const malformedChild = { ...validState, bundles: [null] };
  assert.throws(() => validateAuthorityRegistryConvergenceStoreState(malformedChild), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID/);
  const malformed = { format: 'twni.authority-registry-convergence-store.v1' };
  assert.throws(() => validateAuthorityRegistryConvergenceStoreState(malformed), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_INVALID/);
});

test('store rejects a changed policy and keeps the existing history', async t => {
  const f = fixture(), h = histories(f), store = tempStore(t);
  await store.append({ ...f.context, convergenceBundle: h.one });
  const before = fs.readFileSync(store.file);
  const other = fixture();
  await assert.rejects(store.append({ ...other.context, convergenceBundle: histories(other).one }), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_POLICY_MISMATCH|AUTHORITY_REGISTRY_CONVERGENCE_POLICY_MISMATCH/);
  assert.deepEqual(fs.readFileSync(store.file), before);
});
