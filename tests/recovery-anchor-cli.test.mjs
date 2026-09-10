import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InternetSuite } from '../src/suite.mjs';
import { newIdentity, seal } from '../src/identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
function run(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/recovery-anchor.mjs', ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    const timer = setTimeout(() => { child.kill(); reject(new Error(`recovery anchor CLI timeout: ${stderr}`)); }, 30000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
async function closeSuite(suite) { await suite?.close().catch(() => {}); }

test('recovery-anchor CLI exports a read-only request and imports an external signature', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-recovery-anchor-cli-')), key = newIdentity();
  const files = { keyring: path.join(directory, 'keyring.json'), anchor: path.join(directory, 'anchor.json') };
  t.after(async () => { try { fs.rmSync(directory, { recursive: true, force: true }); } catch {} });
  let suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', timeoutMs: 3000 });
  await suite.pinRecoveryAnchor({ signerId: 'recovery:cli-test', publicKeyPem: key.publicKey, confirmed: true });
  await closeSuite(suite); suite = null;
  fs.writeFileSync(files.keyring, JSON.stringify({ 'recovery:cli-test': { publicKeyPem: key.publicKey, revoked: false } }));
  const requested = await run('request', directory, '--keyring', files.keyring);
  assert.equal(requested.code, 0, requested.stderr);
  const request = JSON.parse(requested.stdout).request;
  assert.equal(request.body.format, 'twni.external-recovery-anchor.v1');
  assert.doesNotMatch(requested.stdout, /PRIVATE KEY|recoveryAnchorKeyring/);
  fs.writeFileSync(files.anchor, JSON.stringify(seal(request.body, key.privateKey)));
  const accepted = await run('accept', directory, '--keyring', files.keyring, '--anchor', files.anchor);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).status, 'anchored');
  const status = await run('status', directory, '--keyring', files.keyring);
  assert.equal(status.code, 0, status.stderr);
  const view = JSON.parse(status.stdout);
  assert.equal(view.recoveryAnchorVerification.sequence, 1);
  assert.equal(view.readOnly, true);
});
