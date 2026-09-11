import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function resolveOpenSsl() {
  const candidates = [
    process.env.TINP_OPENSSL,
    process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : null,
    process.platform === 'win32' ? 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe' : null,
    'openssl',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { execFileSync(candidate, ['version'], { stdio: 'ignore', windowsHide: true }); return candidate; } catch {}
  }
  const error = new Error('TLS_OPENSSL_UNAVAILABLE');
  error.code = 'TLS_OPENSSL_UNAVAILABLE';
  throw error;
}

export function createTlsLoopbackCertificates(parentDirectory = null) {
  const openssl = resolveOpenSsl();
  const directory = parentDirectory
    ? fs.mkdtempSync(path.join(parentDirectory, 'tls-'))
    : fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-tls-'));
  const certificates = {};
  try {
    for (const label of ['a', 'b']) {
      const keyPath = path.join(directory, `${label}.key.pem`);
      const certPath = path.join(directory, `${label}.cert.pem`);
      execFileSync(openssl, [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
        '-subj', `/CN=tinp-loopback-${label}`,
        '-addext', 'subjectAltName=DNS:tinp-loopback',
        '-keyout', keyPath, '-out', certPath,
      ], { stdio: 'ignore', windowsHide: true });
      certificates[label] = {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
        ca: fs.readFileSync(certPath, 'utf8'),
        servername: 'tinp-loopback',
      };
    }
    return { directory, certificates };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function removeTlsLoopbackCertificates(bundle) {
  if (bundle?.directory) fs.rmSync(bundle.directory, { recursive: true, force: true });
}
