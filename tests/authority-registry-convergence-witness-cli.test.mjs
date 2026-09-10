import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { makeAuthorityRegistryConvergenceStoreState, writeAuthorityRegistryConvergenceStore } from '../src/authority-registry-convergence-store.mjs';
import { authorityRegistryConvergenceWitnessBodyForStore, makeAuthorityRegistryConvergenceWitnessPolicy,
  signAuthorityRegistryConvergenceWitness } from '../src/authority-registry-convergence-witness.mjs';

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry.mjs', ...args], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('authority registry convergence witness CLI requests and verifies an external binding', async t => {
  const issuer = newIdentity(), mirror = newIdentity(), member = newIdentity(), witness = newIdentity();
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-witness-cli',
    issuerId: 'registry:issuer-convergence-witness-cli', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
    publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-witness-cli',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 1,
    mirrors: [{ mirrorId: 'mirror:cli', publicKeySha256: publicKeyFingerprint(mirror.publicKey) }] });
  const receipt = signAuthorityRegistryDistributionReceipt(makeAuthorityRegistryDistributionReceiptBody({
    distributionPolicy, registry, mirrorId: 'mirror:cli', mirrorKeySha256: publicKeyFingerprint(mirror.publicKey),
    issuedAtMs: now - 500, expiresAtMs: now + 1800000,
  }), mirror.privateKey);
  const convergenceBundle = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts: [receipt] })] });
  const state = makeAuthorityRegistryConvergenceStoreState({ convergenceBundle, updatedAtMs: now });
  const witnessPolicy = makeAuthorityRegistryConvergenceWitnessPolicy({
    signerId: 'witness:authority-registry-convergence-cli', publicKeyPem: witness.publicKey,
  });
  const witnessEnvelope = signAuthorityRegistryConvergenceWitness(authorityRegistryConvergenceWitnessBodyForStore({
    policy: witnessPolicy, sequence: 1, state, issuedAtMs: now,
  }), witness.privateKey);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-witness-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    store: path.join(directory, 'store.json'), witness: path.join(directory, 'witness.json'),
    witnessPolicy: path.join(directory, 'witness-policy.json'), witnessKeyring: path.join(directory, 'witness-keyring.json'),
    registryPolicy: path.join(directory, 'registry-policy.json'), issuerKeyring: path.join(directory, 'issuer-keyring.json'),
    distributionPolicy: path.join(directory, 'distribution-policy.json'), mirrorKeyring: path.join(directory, 'mirror-keyring.json'),
  };
  writeAuthorityRegistryConvergenceStore(files.store, state);
  fs.writeFileSync(files.witness, JSON.stringify(witnessEnvelope));
  fs.writeFileSync(files.witnessPolicy, JSON.stringify(witnessPolicy));
  fs.writeFileSync(files.witnessKeyring, JSON.stringify({ [witnessPolicy.signerId]: { publicKeyPem: witness.publicKey, revoked: false } }));
  fs.writeFileSync(files.registryPolicy, JSON.stringify(registryPolicy));
  fs.writeFileSync(files.issuerKeyring, JSON.stringify({ [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } }));
  fs.writeFileSync(files.distributionPolicy, JSON.stringify(distributionPolicy));
  fs.writeFileSync(files.mirrorKeyring, JSON.stringify({ 'mirror:cli': { publicKeyPem: mirror.publicKey, revoked: false } }));

  const request = await runCli(['convergence-witness-request', files.store, '--policy', files.witnessPolicy,
    '--sequence', '1', '--now-ms', String(now)]);
  assert.equal(request.code, 0, request.stderr);
  const requested = JSON.parse(request.stdout);
  assert.equal(requested.status, 'request');
  assert.equal(requested.body.storeStateRoot, witnessEnvelope.body.storeStateRoot);
  assert.doesNotMatch(request.stdout, /PRIVATE KEY/);

  const verified = await runCli(['convergence-witness-verify', files.witness, '--policy', files.witnessPolicy,
    '--witness-keyring', files.witnessKeyring, '--store', files.store, '--registry-policy', files.registryPolicy,
    '--issuer-keyring', files.issuerKeyring, '--distribution-policy', files.distributionPolicy,
    '--mirror-keyring', files.mirrorKeyring, '--now-ms', String(now)]);
  assert.equal(verified.code, 0, verified.stderr);
  const output = JSON.parse(verified.stdout);
  assert.equal(output.status, 'verified');
  assert.equal(output.verification.sequence, 1);
  assert.equal(output.verification.storeStateRoot, witnessEnvelope.body.storeStateRoot);

  const tampered = { ...witnessEnvelope, signature: 'AA==' };
  fs.writeFileSync(files.witness, JSON.stringify(tampered));
  const rejected = await runCli(['convergence-witness-verify', files.witness, '--policy', files.witnessPolicy,
    '--witness-keyring', files.witnessKeyring, '--store', files.store, '--registry-policy', files.registryPolicy,
    '--issuer-keyring', files.issuerKeyring, '--distribution-policy', files.distributionPolicy,
    '--mirror-keyring', files.mirrorKeyring, '--now-ms', String(now)]);
  assert.equal(rejected.code, 2);
  assert.match(JSON.parse(rejected.stderr).code, /AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SIGNATURE_INVALID/);

  const badFlag = await runCli(['convergence-witness-request', files.store, '--policy', files.witnessPolicy, '--unexpected', 'x']);
  assert.equal(badFlag.code, 2);
  assert.match(JSON.parse(badFlag.stderr).code, /AUTHORITY_REGISTRY_COMMAND_INVALID/);
});
