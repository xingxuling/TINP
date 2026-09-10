import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ProtectedStore } from '../src/protected-store.mjs';

const windows = process.platform === 'win32';
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tinp-protected-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new ProtectedStore(directory, { purpose: 'TINP-test-state' }) };
}

test('protected storage rejects missing purpose and unsupported platforms', () => {
  if (!windows) {
    assert.throws(() => new ProtectedStore(tmpdir(), { purpose: 'test' }), /UNSUPPORTED_PLATFORM/);
  } else {
    assert.throws(() => new ProtectedStore(tmpdir()), /INVALID_PURPOSE/);
  }
});

test('actual current-user DPAPI roundtrip protects Ed25519 private keys on disk', { skip: !windows }, t => {
  const { directory, store } = fixture(t);
  assert.equal(store.exists, false);
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const value = { privateKey: key, session: 's-private-test-marker', revocations: ['cap-1'], unicode: '恢复' };
  store.save(value);
  assert.equal(store.exists, true);
  assert.deepEqual(store.load(), value);
  const bytes = readFileSync(store.file);
  assert.equal(bytes.includes(Buffer.from(key)), false);
  assert.equal(bytes.includes(Buffer.from('PRIVATE KEY')), false);
  assert.equal(bytes.includes(Buffer.from(value.session)), false);
  assert.deepEqual(readdirSync(directory), ['protected-state.dpapi']);
});

test('DPAPI purpose binding rejects a different state domain without changing ciphertext', { skip: !windows }, t => {
  const { directory, store } = fixture(t);
  store.save({ secret: 'domain-bound' });
  const before = readFileSync(store.file);
  assert.throws(() => new ProtectedStore(directory, { purpose: 'different-domain' }).load(), /LOAD_FAILED/);
  assert.deepEqual(readFileSync(store.file), before);
  assert.deepEqual(store.load(), { secret: 'domain-bound' });
});

test('corrupted header, ciphertext and truncation all fail closed', { skip: !windows }, t => {
  const { store } = fixture(t);
  store.save({ secret: 'tamper-test' });
  const original = readFileSync(store.file);
  for (const index of [0, 18, Math.floor(original.length / 2), original.length - 1]) {
    const damaged = Buffer.from(original);
    damaged[index] ^= 0x80;
    writeFileSync(store.file, damaged);
    assert.throws(() => store.load(), /LOAD_FAILED/);
  }
  writeFileSync(store.file, original.subarray(0, original.length - 20));
  assert.throws(() => store.load(), /LOAD_FAILED/);
});

test('atomic snapshot overwrite retains latest state and leaves no temporary files', { skip: !windows }, t => {
  const { directory, store } = fixture(t);
  store.save({ generation: 1 });
  store.save({ generation: 2, revoked: ['old-cap'] });
  assert.deepEqual(new ProtectedStore(directory, { purpose: store.purpose }).load(), { generation: 2, revoked: ['old-cap'] });
  assert.deepEqual(readdirSync(directory), ['protected-state.dpapi']);
});

test('DPAPI rejects modified protected content even when the outer checksum is recomputed', { skip: !windows }, t => {
  const { store } = fixture(t);
  store.save({ secret: 'authenticated-content-' + 'x'.repeat(512) });
  const damaged = readFileSync(store.file);
  const magicLength = Buffer.byteLength('TINP-DPAPI-v1\0');
  const ciphertextOffset = magicLength + 32;
  damaged[Math.floor((ciphertextOffset + damaged.length) / 2)] ^= 0x80;
  createHash('sha256').update(damaged.subarray(ciphertextOffset)).digest().copy(damaged, magicLength);
  writeFileSync(store.file, damaged);
  assert.throws(() => store.load(), /LOAD_FAILED/);
});

test('unavailable provider preserves last snapshot and never writes a plaintext fallback', { skip: !windows }, t => {
  const { directory, store } = fixture(t);
  store.save({ generation: 1 });
  const original = readFileSync(store.file);
  const previous = process.env.NEXT_INTERNET_PYTHON;
  try {
    process.env.NEXT_INTERNET_PYTHON = join(directory, 'python-does-not-exist.exe');
    assert.throws(() => store.save({ secret: 'NEVER-WRITE-THIS-PLAINTEXT' }), /SAVE_FAILED/);
    assert.throws(() => store.load(), /LOAD_FAILED/);
    assert.deepEqual(readFileSync(store.file), original);
    assert.deepEqual(readdirSync(directory), ['protected-state.dpapi']);
  } finally {
    if (previous === undefined) delete process.env.NEXT_INTERNET_PYTHON;
    else process.env.NEXT_INTERNET_PYTHON = previous;
  }
  assert.deepEqual(store.load(), { generation: 1 });
});

test('a fresh Node process recovers the same protected private key and session', { skip: !windows }, t => {
  const { directory, store } = fixture(t);
  const key = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  const value = { privateKey: key, session: { id: 'persisted-session', epoch: 2 } };
  store.save(value);
  const expected = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const moduleURL = new URL('../src/protected-store.mjs', import.meta.url).href;
  const script = `import {ProtectedStore} from ${JSON.stringify(moduleURL)};
    import {createHash} from 'node:crypto';
    const result = new ProtectedStore(process.argv[1], {purpose:process.argv[2]}).load();
    const actual = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    if(actual !== process.argv[3]) process.exit(1);
    process.stdout.write('RECOVERED');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, directory, store.purpose, expected], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, 'fresh process must recover protected state');
  assert.equal(result.stdout, 'RECOVERED');
  assert.equal(result.stderr, '');
});

test('invalid JSON payload inputs do not overwrite a healthy snapshot', { skip: !windows }, t => {
  const { store } = fixture(t);
  store.save({ generation: 1 });
  const circular = {};
  circular.self = circular;
  for (const input of [undefined, circular, { value: 1n }]) assert.throws(() => store.save(input), /SAVE_FAILED/);
  assert.deepEqual(store.load(), { generation: 1 });
});
