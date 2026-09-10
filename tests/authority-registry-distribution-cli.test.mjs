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

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry.mjs', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('authority registry distribution CLI verifies a quorum bundle and rejects unknown flags', async t => {
  const issuer = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-distribution-cli',
    issuerId: 'registry:issuer-distribution-cli', publicKeyPem: issuer.publicKey });
  const registry = signAuthorityRegistry(makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 1000, expiresAtMs: now + 3600000, entries: [makeAuthorityRegistryEntry({
      authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
      publicKeySha256: publicKeyFingerprint(issuer.publicKey), notBeforeMs: now - 1000,
    })] }), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({ distributionId: 'tinp:distribution-cli',
    registryId: registry.body.registryId, registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const receipts = mirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
    makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry,
      mirrorId: mirror.mirrorId, mirrorKeySha256: publicKeyFingerprint(mirror.publicKey),
      issuedAtMs: now - 500, expiresAtMs: now + 1800000 }), mirror.privateKey));
  const bundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-distribution-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    policy: path.join(directory, 'registry-policy.json'), bundle: path.join(directory, 'bundle.json'),
    issuer: path.join(directory, 'issuer-keyring.json'), distribution: path.join(directory, 'distribution-policy.json'),
    mirrors: path.join(directory, 'mirror-keyring.json'),
  };
  fs.writeFileSync(files.policy, JSON.stringify(registryPolicy)); fs.writeFileSync(files.bundle, JSON.stringify(bundle));
  fs.writeFileSync(files.issuer, JSON.stringify({ [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } }));
  fs.writeFileSync(files.distribution, JSON.stringify(distributionPolicy));
  fs.writeFileSync(files.mirrors, JSON.stringify(Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
    { publicKeyPem: mirror.publicKey, revoked: false }]))));
  const verified = await runCli(['distribution-verify', files.bundle, '--policy', files.policy,
    '--issuer-keyring', files.issuer, '--distribution-policy', files.distribution, '--mirror-keyring', files.mirrors,
    '--now-ms', String(now)]);
  assert.equal(verified.code, 0, verified.stderr);
  const output = JSON.parse(verified.stdout);
  assert.equal(output.status, 'verified');
  assert.deepEqual(output.verification.acceptedMirrors, ['mirror:alpha', 'mirror:beta']);
  const bad = await runCli(['distribution-verify', files.bundle, '--policy', files.policy,
    '--issuer-keyring', files.issuer, '--distribution-policy', files.distribution, '--mirror-keyring', files.mirrors,
    '--unexpected', 'x']);
  assert.equal(bad.code, 2);
  assert.match(JSON.parse(bad.stderr).code, /AUTHORITY_REGISTRY_COMMAND_INVALID/);
});
