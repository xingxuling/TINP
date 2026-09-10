import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity, ProtocolError } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { makeAuthorityRegistryConvergenceStoreState } from '../src/authority-registry-convergence-store.mjs';
import { authorityRegistryConvergenceWitnessBodyForStore, makeAuthorityRegistryConvergenceWitnessPolicy,
  signAuthorityRegistryConvergenceWitness, validateAuthorityRegistryConvergenceWitness,
  verifyAuthorityRegistryConvergenceWitness } from '../src/authority-registry-convergence-witness.mjs';

function fixture() {
  const issuer = newIdentity(), member = newIdentity(), witness = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-witness-test',
    issuerId: 'registry:issuer-convergence-witness-test', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-witness-test',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 1,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })) });
  const bundle = registry => makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry,
    receipts: [signAuthorityRegistryDistributionReceipt(makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy,
      registry, mirrorId: mirrors[0].mirrorId, mirrorKeySha256: publicKeyFingerprint(mirrors[0].publicKey),
      issuedAtMs: now - 500, expiresAtMs: now + 1800000 }), mirrors[0].privateKey)] });
  const one = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle(registry1)] });
  const two = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle(registry1), bundle(registry2)] });
  const context = { distributionPolicy, registryPolicy,
    issuerKeyring: { [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } },
    mirrorKeyring: Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
      { publicKeyPem: mirror.publicKey, revoked: false }])), nowMs: now };
  return { now, witness, witnessPolicy: makeAuthorityRegistryConvergenceWitnessPolicy({
    signerId: 'witness:authority-registry-convergence-test', publicKeyPem: witness.publicKey }),
    context, one, two, stateOne: makeAuthorityRegistryConvergenceStoreState({ convergenceBundle: one, updatedAtMs: now }),
    stateTwo: makeAuthorityRegistryConvergenceStoreState({ convergenceBundle: two, updatedAtMs: now + 1 }) };
}

function verifyArgs(f, state, witness, extra = {}) {
  return verifyAuthorityRegistryConvergenceWitness({ policy: f.witnessPolicy, witness,
    keyring: { [f.witnessPolicy.signerId]: { publicKeyPem: f.witness.publicKey, revoked: false } },
    state, ...f.context, ...extra });
}

test('external witness binds one exact convergence-store state', () => {
  const f = fixture();
  const body = authorityRegistryConvergenceWitnessBodyForStore({ policy: f.witnessPolicy, sequence: 1,
    state: f.stateOne, issuedAtMs: f.now });
  const witness = signAuthorityRegistryConvergenceWitness(body, f.witness.privateKey);
  assert.equal(validateAuthorityRegistryConvergenceWitness(witness), true);
  const result = verifyArgs(f, f.stateOne, witness);
  assert.equal(result.sequence, 1);
  assert.equal(result.historyRoot, f.stateOne.historyRoot);
  assert.equal(result.storeStateRoot, body.storeStateRoot);
});

test('witness chain accepts extension and rejects rollback or same-sequence replacement', () => {
  const f = fixture();
  const first = signAuthorityRegistryConvergenceWitness(authorityRegistryConvergenceWitnessBodyForStore({
    policy: f.witnessPolicy, sequence: 1, state: f.stateOne, issuedAtMs: f.now }), f.witness.privateKey);
  const secondBody = authorityRegistryConvergenceWitnessBodyForStore({ policy: f.witnessPolicy, sequence: 2,
    previousWitnessRoot: first.root, state: f.stateTwo, issuedAtMs: f.now });
  const second = signAuthorityRegistryConvergenceWitness(secondBody, f.witness.privateKey);
  assert.equal(verifyArgs(f, f.stateTwo, second, { savedWitness: first }).sequence, 2);
  assert.throws(() => verifyArgs(f, f.stateOne, first, { savedWitness: second }),
    /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK/);
  const replacement = signAuthorityRegistryConvergenceWitness({ ...secondBody, issuedAtMs: f.now + 1 }, f.witness.privateKey);
  assert.throws(() => verifyArgs(f, f.stateTwo, replacement, { savedWitness: second, nowMs: f.now + 1 }),
    /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_REPLACED/);
});

test('witness rejects a store replacement even when the replacement is structurally valid', () => {
  const f = fixture();
  const witness = signAuthorityRegistryConvergenceWitness(authorityRegistryConvergenceWitnessBodyForStore({
    policy: f.witnessPolicy, sequence: 1, state: f.stateOne, issuedAtMs: f.now }), f.witness.privateKey);
  assert.throws(() => verifyArgs(f, f.stateTwo, witness), /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_STORE_MISMATCH/);
  const tampered = structuredClone(f.stateOne);
  tampered.historyRoot = 'f'.repeat(64);
  assert.throws(() => verifyArgs(f, tampered, witness), /AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID/);
});

test('witness key, signature, time and object boundaries fail closed', () => {
  const f = fixture();
  const body = authorityRegistryConvergenceWitnessBodyForStore({ policy: f.witnessPolicy, sequence: 1,
    state: f.stateOne, issuedAtMs: f.now });
  const witness = signAuthorityRegistryConvergenceWitness(body, f.witness.privateKey);
  const wrongKey = newIdentity();
  assert.throws(() => verifyAuthorityRegistryConvergenceWitness({ ...f.context, policy: f.witnessPolicy,
    witness, keyring: { [f.witnessPolicy.signerId]: { publicKeyPem: wrongKey.publicKey, revoked: false } }, state: f.stateOne }),
    /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEY_MISMATCH/);
  assert.throws(() => verifyArgs(f, f.stateOne, { ...witness, signature: 'AA==' }),
    /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SIGNATURE_INVALID/);
  const future = signAuthorityRegistryConvergenceWitness({ ...body, issuedAtMs: f.now + 1000 }, f.witness.privateKey);
  assert.throws(() => verifyArgs(f, f.stateOne, future), /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_TIME_INVALID/);
  assert.throws(() => verifyArgs(f, f.stateOne, witness, { savedWitness: { ...witness, signature: 'AA==' } }),
    /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SAVED_SIGNATURE_INVALID/);
  const accessorKeyring = {};
  Object.defineProperty(accessorKeyring, f.witnessPolicy.signerId, { enumerable: true, get: () => ({ publicKeyPem: f.witness.publicKey, revoked: false }) });
  assert.throws(() => verifyAuthorityRegistryConvergenceWitness({ ...f.context, policy: f.witnessPolicy,
    witness, keyring: accessorKeyring, state: f.stateOne }), /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_KEY_NOT_CONFIGURED/);
  assert.throws(() => validateAuthorityRegistryConvergenceWitness({ ...witness, body: { ...body, private: '-----BEGIN PRIVATE KEY-----' } }),
    ProtocolError);
});
