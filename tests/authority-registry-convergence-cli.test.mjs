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

test('authority registry convergence CLI verifies a contiguous history', async t => {
  const issuer = newIdentity(), member = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-cli',
    issuerId: 'registry:issuer-convergence-cli', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
    publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:convergence-cli',
    registryId: registryPolicy.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const makeBundle = (registry, issuedAtMs) => makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry,
    receipts: mirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs, expiresAtMs: now + 1800000 }), mirror.privateKey)),
  });
  const convergence = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [makeBundle(registry1, now - 1500), makeBundle(registry2, now - 800)] });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = { policy: path.join(directory, 'registry-policy.json'), history: path.join(directory, 'history.json'),
    issuer: path.join(directory, 'issuer-keyring.json'), distribution: path.join(directory, 'distribution-policy.json'), mirrors: path.join(directory, 'mirror-keyring.json') };
  fs.writeFileSync(files.policy, JSON.stringify(registryPolicy)); fs.writeFileSync(files.history, JSON.stringify(convergence));
  fs.writeFileSync(files.issuer, JSON.stringify({ [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } }));
  fs.writeFileSync(files.distribution, JSON.stringify(distributionPolicy));
  fs.writeFileSync(files.mirrors, JSON.stringify(Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
    { publicKeyPem: mirror.publicKey, revoked: false }]))));
  const result = await runCli(['convergence-verify', files.history, '--policy', files.policy, '--issuer-keyring', files.issuer,
    '--distribution-policy', files.distribution, '--mirror-keyring', files.mirrors, '--now-ms', String(now)]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'verified');
  assert.equal(output.verification.firstSequence, 1);
  assert.equal(output.verification.lastSequence, 2);
  assert.deepEqual(output.verification.stableMirrors, ['mirror:alpha', 'mirror:beta']);
});
