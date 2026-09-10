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

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry.mjs', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('authority registry convergence store CLI appends, verifies and rejects rollback', async t => {
  const issuer = newIdentity(), mirror = newIdentity(), member = newIdentity(), now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-store-cli',
    issuerId: 'registry:issuer-convergence-store-cli', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
    publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-store-cli',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 1,
    mirrors: [{ mirrorId: 'mirror:cli', publicKeySha256: publicKeyFingerprint(mirror.publicKey) }] });
  const bundle = registry => makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry,
    receipts: [signAuthorityRegistryDistributionReceipt(makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy,
      registry, mirrorId: 'mirror:cli', mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs: now - 500,
      expiresAtMs: now + 1800000 }), mirror.privateKey)] });
  const history1 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle(registry1)] });
  const history2 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle(registry1), bundle(registry2)] });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-store-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = { policy: path.join(directory, 'registry-policy.json'), issuer: path.join(directory, 'issuer-keyring.json'),
    distribution: path.join(directory, 'distribution-policy.json'), mirrors: path.join(directory, 'mirror-keyring.json'),
    one: path.join(directory, 'history-one.json'), two: path.join(directory, 'history-two.json'), store: path.join(directory, 'store.json') };
  fs.writeFileSync(files.policy, JSON.stringify(registryPolicy));
  fs.writeFileSync(files.issuer, JSON.stringify({ [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } }));
  fs.writeFileSync(files.distribution, JSON.stringify(distributionPolicy));
  fs.writeFileSync(files.mirrors, JSON.stringify({ 'mirror:cli': { publicKeyPem: mirror.publicKey, revoked: false } }));
  fs.writeFileSync(files.one, JSON.stringify(history1)); fs.writeFileSync(files.two, JSON.stringify(history2));
  const common = ['--policy', files.policy, '--issuer-keyring', files.issuer, '--distribution-policy', files.distribution,
    '--mirror-keyring', files.mirrors, '--now-ms', String(now)];
  const first = await runCli(['convergence-store-append', files.one, ...common, '--store', files.store]);
  assert.equal(first.code, 0, first.stderr); assert.equal(JSON.parse(first.stdout).operation, 'appended');
  const extended = await runCli(['convergence-store-append', files.two, ...common, '--store', files.store]);
  assert.equal(extended.code, 0, extended.stderr); assert.equal(JSON.parse(extended.stdout).operation, 'extended');
  const verified = await runCli(['convergence-store-verify', files.store, ...common]);
  assert.equal(verified.code, 0, verified.stderr);
  const output = JSON.parse(verified.stdout);
  assert.equal(output.status, 'verified'); assert.equal(output.verification.firstSequence, 1); assert.equal(output.verification.lastSequence, 2);
  const rollback = await runCli(['convergence-store-append', files.one, ...common, '--store', files.store]);
  assert.equal(rollback.code, 2); assert.match(JSON.parse(rollback.stderr).code, /AUTHORITY_REGISTRY_CONVERGENCE_STORE_ROLLBACK/);
  const bad = await runCli(['convergence-store-verify', files.store, ...common, '--unexpected', 'x']);
  assert.equal(bad.code, 2); assert.match(JSON.parse(bad.stderr).code, /AUTHORITY_REGISTRY_COMMAND_INVALID/);
});
