import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const MAGIC = Buffer.from('TINP-DPAPI-v1\0');
const MAX_BYTES = 32 * 1024 * 1024;
const BRIDGE = fileURLToPath(new URL('../adapters/dpapi-store.py', import.meta.url));
const fail = code => Object.assign(new Error(code), { code });
const digest = text => createHash('sha256').update(text).digest('hex');

function dpapi(action, purpose, data) {
  const result = spawnSync(process.env.NEXT_INTERNET_PYTHON || 'python', ['-X', 'utf8', BRIDGE], {
    input: JSON.stringify({ action, purpose, dataBase64: data.toString('base64') }),
    encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: MAX_BYTES * 2,
  });
  try {
    if (result.error || result.status !== 0) throw new Error();
    const response = JSON.parse(result.stdout);
    if (response.ok !== true || typeof response.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.dataBase64)) throw new Error();
    const decoded = Buffer.from(response.dataBase64, 'base64');
    if (!decoded.length || decoded.length > MAX_BYTES) throw new Error();
    return decoded;
  } catch {
    throw fail('PROTECTED_STORE_PROVIDER_FAILED');
  }
}

/** Platform provider only; callers retain canonical ownership and must serialize writers. */
export class ProtectedStore {
  constructor(directory, { purpose } = {}) {
    if (process.platform !== 'win32') throw fail('PROTECTED_STORE_UNSUPPORTED_PLATFORM');
    if (typeof purpose !== 'string' || !purpose || purpose.length > 1024) throw fail('PROTECTED_STORE_INVALID_PURPOSE');
    this.directory = resolve(directory);
    this.purpose = purpose;
    this.file = join(this.directory, 'protected-state.dpapi');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  get exists() { return existsSync(this.file); }

  load() {
    let plaintext;
    try {
      const stat = lstatSync(this.file);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error();
      const stored = readFileSync(this.file);
      if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error();
      const checksum = stored.subarray(MAGIC.length, MAGIC.length + 32);
      const ciphertext = stored.subarray(MAGIC.length + 32);
      if (!checksum.equals(createHash('sha256').update(ciphertext).digest())) throw new Error();
      plaintext = dpapi('unprotect', this.purpose, ciphertext);
      const envelope = JSON.parse(plaintext.toString('utf8'));
      if (envelope.version !== 1 || envelope.purpose !== this.purpose || typeof envelope.payload !== 'string' || envelope.sha256 !== digest(envelope.payload)) throw new Error();
      return JSON.parse(envelope.payload);
    } catch {
      throw fail('PROTECTED_STORE_LOAD_FAILED');
    } finally {
      plaintext?.fill(0);
    }
  }

  save(value) {
    let plaintext;
    let temp;
    let fd;
    try {
      const payload = JSON.stringify(value);
      if (typeof payload !== 'string') throw new Error();
      plaintext = Buffer.from(JSON.stringify({ version: 1, purpose: this.purpose, payload, sha256: digest(payload) }));
      if (plaintext.length > MAX_BYTES - 8192) throw new Error();
      const ciphertext = dpapi('protect', this.purpose, plaintext);
      temp = join(this.directory, `.protected-state.${randomUUID()}.tmp`);
      fd = openSync(temp, 'wx', 0o600);
      writeFileSync(fd, Buffer.concat([MAGIC, createHash('sha256').update(ciphertext).digest(), ciphertext]));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      // Same-directory rename replaces the previous snapshot only after ciphertext is flushed.
      renameSync(temp, this.file);
      temp = undefined;
    } catch {
      throw fail('PROTECTED_STORE_SAVE_FAILED');
    } finally {
      plaintext?.fill(0);
      if (fd !== undefined) closeSync(fd);
      if (temp) { try { unlinkSync(temp); } catch {} }
    }
  }
}
