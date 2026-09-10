import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixtureForCli } from './authority-registry-cli-fixture.mjs';
import { InternetSuite } from '../src/suite.mjs';

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry.mjs', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('authority registry CLI verifies an external snapshot and derives a role keyring', async t => {
  const f = await fixtureForCli(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    policy: path.join(directory, 'policy.json'), registry: path.join(directory, 'registry.json'), issuer: path.join(directory, 'issuer-keyring.json'), member: path.join(directory, 'member-keyring.json'),
  };
  fs.writeFileSync(files.policy, JSON.stringify(f.policy)); fs.writeFileSync(files.registry, JSON.stringify(f.registry));
  fs.writeFileSync(files.issuer, JSON.stringify(f.issuerKeyring)); fs.writeFileSync(files.member, JSON.stringify(f.memberKeyring));
  const verified = await runCli(['verify', files.registry, '--policy', files.policy, '--issuer-keyring', files.issuer, '--now-ms', String(f.now)]);
  assert.equal(verified.code, 0, verified.stderr); assert.equal(JSON.parse(verified.stdout).status, 'verified');
  const derived = await runCli(['keyring', files.registry, '--policy', files.policy, '--issuer-keyring', files.issuer, '--member-keyring', files.member, '--role', 'operator', '--now-ms', String(f.now)]);
  assert.equal(derived.code, 0, derived.stderr); assert.equal(JSON.parse(derived.stdout).keyring['operator:owner-v1'].publicKeyPem, f.operatorV1.publicKey);
  const bad = await runCli(['verify', files.registry, '--policy', files.policy, '--issuer-keyring', files.issuer, '--unexpected', 'x']);
  assert.equal(bad.code, 2); assert.match(JSON.parse(bad.stderr).code, /AUTHORITY_REGISTRY_COMMAND_INVALID/);
});

test('recovery-anchor status can opt into the signed registry bridge', async t => {
  const f = await fixtureForCli(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-recovery-'));
  let suite;
  t.after(async () => { await suite?.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', timeoutMs: 3000 });
  await suite.pinRecoveryAnchor({ signerId: 'recovery:witness-v1', publicKeyPem: f.memberKeyring['recovery:witness-v1'].publicKeyPem, confirmed: true });
  await suite.close(); suite = null;
  const files = { policy: path.join(directory, 'policy.json'), registry: path.join(directory, 'registry.json'), issuer: path.join(directory, 'issuer-keyring.json'), member: path.join(directory, 'member-keyring.json') };
  fs.writeFileSync(files.policy, JSON.stringify(f.policy)); fs.writeFileSync(files.registry, JSON.stringify(f.registry));
  fs.writeFileSync(files.issuer, JSON.stringify(f.issuerKeyring)); fs.writeFileSync(files.member, JSON.stringify(f.memberKeyring));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/recovery-anchor.mjs', 'status', directory, '--keyring', files.member, '--registry', files.registry, '--registry-policy', files.policy, '--registry-issuer-keyring', files.issuer, '--registry-now-ms', String(f.now)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); }); child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.registryVerification.sequence, 1); assert.equal(output.status, 'no-pending-request');
});
