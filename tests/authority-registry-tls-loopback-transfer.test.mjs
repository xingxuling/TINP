import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LocalTransport } from '../src/transport.mjs';
import { newIdentity } from '../src/identity.mjs';
import { createTlsLoopbackCertificates, removeTlsLoopbackCertificates } from './tls-loopback-certificates.mjs';

function runDemo() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry-tls-loopback-transfer-demo.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) reject(new Error(`TLS loopback demo exited ${code}: ${stderr}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`TLS loopback demo emitted invalid JSON: ${error.message}\n${stdout}`)); }
      }
    });
  });
}

test('TINP TLS loopback transfers public history with certificate pinning', async () => {
  const result = await runDemo();
  assert.equal(result.status, 'VERIFIED_LOCAL_TINP_TLS_LOOPBACK_STATE_TRANSFER');
  assert.equal(result.transport, 'tls');
  assert.equal(result.frameType, 'DATA');
  assert.equal(result.encryptedTransport, true);
  assert.equal(result.tlsVersion, 'TLSv1.3');
  assert.match(result.tlsCipher, /^TLS_/);
  assert.ok(result.tlsHandshakes >= 2);
  assert.equal(result.peerCertificatePinned, true);
  assert.equal(result.peerAuthenticationConfigured, true);
  assert.equal(result.networkTransferOperation, 'appended');
  assert.equal(result.networkReplayOperation, 'unchanged');
  assert.equal(result.reverseNetworkTransferOperation, 'extended');
  assert.equal(result.tamperedTransferDetected, true);
  assert.equal(result.rejectedStateRetained, true);
  assert.equal(result.privateMaterialTransferred, false);
});

test('TLS loopback rejects a peer certificate outside the configured CA pin', async t => {
  const baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-tls-pin-test-'));
  const certificates = createTlsLoopbackCertificates(baseDirectory);
  const aIdentity = newIdentity(), bIdentity = newIdentity();
  const a = await new LocalTransport({ nodeId: 'a', identity: aIdentity, kind: 'tls', tlsOptions: certificates.certificates.a }).bind();
  const b = await new LocalTransport({ nodeId: 'b', identity: bIdentity, kind: 'tls', tlsOptions: certificates.certificates.b }).bind();
  t.after(async () => {
    await a.close(); await b.close();
    removeTlsLoopbackCertificates(certificates);
    fs.rmSync(baseDirectory, { recursive: true, force: true });
  });
  const wrongPinnedEndpoint = b.endpoint();
  wrongPinnedEndpoint.tls = { ...wrongPinnedEndpoint.tls, ca: certificates.certificates.a.ca };
  a.peers = { b: { publicKey: bIdentity.publicKey, endpoint: wrongPinnedEndpoint } };
  b.peers = { a: { publicKey: aIdentity.publicKey, endpoint: a.endpoint() } };
  b.handler = async () => ({ ok: true });
  await assert.rejects(a.request('b', { probe: true }, 3000), error => {
    const code = String(error?.code ?? error?.message ?? '');
    return /CERT|TLS|SSL|UNABLE|SELF_SIGNED|AUTHORITY/.test(code);
  });
  assert.equal(a.metrics.sentFrames, 0);
  assert.equal(b.metrics.receivedFrames, 0);
});
