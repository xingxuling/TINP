import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireDirectoryLease } from './directory-lease.mjs';
import { ProtocolError, rootHash } from './identity.mjs';
import { validateAuthorityRegistryConvergenceStoreState } from './authority-registry-convergence-store.mjs';

export const RESUMABLE_TRANSFER_FORMAT = 'twni.authority-registry-resumable-transfer.v1';
export const RESUMABLE_TRANSFER_JOURNAL_FORMAT = 'twni.authority-registry-resumable-transfer-journal.v1';
export const RESUMABLE_TRANSFER_CHUNK_BYTES = 2048;
export const RESUMABLE_TRANSFER_MAX_CHUNKS = 16384;
export const RESUMABLE_TRANSFER_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

const HASH = /^[a-f0-9]{64}$/;
const MANIFEST_KEYS = ['format', 'transferId', 'sourceNodeId', 'targetNodeId', 'stateRoot',
  'payloadSha256', 'totalChunks', 'chunkBytes'];
const CHUNK_KEYS = [...MANIFEST_KEYS.slice(0, 6), 'totalChunks', 'chunkBytes', 'index', 'data'];
const JOURNAL_KEYS = ['format', 'transferId', 'sourceNodeId', 'targetNodeId', 'stateRoot',
  'payloadSha256', 'totalChunks', 'chunkBytes', 'chunks', 'nextChunk', 'status',
  'committedOperation', 'updatedAtMs', 'committedAtMs'];
const OPERATIONS = new Set(['appended', 'extended', 'unchanged']);

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function plain(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  } catch { return false; }
}

function exact(value, fields, code) {
  check(plain(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)), code);
  for (const key of fields) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function strictArray(value, code) {
  check(Array.isArray(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(Object.getPrototypeOf(value) === Array.prototype && keys.length === value.length + 1
    && keys.includes('length') && keys.every(key => key === 'length' || (typeof key === 'string'
      && /^\d+$/.test(key) && Number(key) < value.length)), code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function hash(value) { return typeof value === 'string' && HASH.test(value); }
function safeNonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }

function noPrivateMaterial(value) {
  if (typeof value === 'string') return !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value);
  if (Array.isArray(value)) return value.every(noPrivateMaterial);
  if (plain(value)) return Reflect.ownKeys(value).every(key => noPrivateMaterial(value[key]));
  return true;
}

function base64Bytes(value, code) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 4 * 8192
    && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), code);
  let bytes;
  try { bytes = Buffer.from(value, 'base64'); } catch { fail(code); }
  check(bytes.length > 0 && bytes.toString('base64') === value, code);
  return bytes;
}

function payloadForState(state) {
  validateAuthorityRegistryConvergenceStoreState(state);
  check(noPrivateMaterial(state), 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PRIVATE_MATERIAL');
  let payload;
  try { payload = Buffer.from(JSON.stringify(state), 'utf8'); } catch { fail('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PAYLOAD_INVALID'); }
  check(payload.length > 0 && payload.length <= RESUMABLE_TRANSFER_MAX_PAYLOAD_BYTES,
    'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PAYLOAD_TOO_LARGE');
  return payload;
}

function bytesHash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function manifestFromFields(value, code = 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_INVALID') {
  exact(value, MANIFEST_KEYS, code);
  check(value.format === RESUMABLE_TRANSFER_FORMAT && identifier(value.transferId)
    && identifier(value.sourceNodeId) && identifier(value.targetNodeId)
    && value.sourceNodeId !== value.targetNodeId && hash(value.stateRoot) && hash(value.payloadSha256)
    && Number.isSafeInteger(value.totalChunks) && value.totalChunks > 0
    && value.totalChunks <= RESUMABLE_TRANSFER_MAX_CHUNKS
    && Number.isSafeInteger(value.chunkBytes) && value.chunkBytes > 0
    && value.chunkBytes <= 8192, code);
  return true;
}

export function validateAuthorityRegistryResumableTransferManifest(manifest) {
  return manifestFromFields(manifest);
}

export function makeAuthorityRegistryResumableTransferManifest({ state, transferId,
  sourceNodeId, targetNodeId, chunkBytes = RESUMABLE_TRANSFER_CHUNK_BYTES } = {}) {
  const payload = payloadForState(state);
  check(identifier(transferId) && identifier(sourceNodeId) && identifier(targetNodeId)
    && sourceNodeId !== targetNodeId && Number.isSafeInteger(chunkBytes) && chunkBytes > 0
    && chunkBytes <= 8192, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_BUILD_INVALID');
  const totalChunks = Math.ceil(payload.length / chunkBytes);
  check(totalChunks > 0 && totalChunks <= RESUMABLE_TRANSFER_MAX_CHUNKS,
    'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PAYLOAD_TOO_LARGE');
  const manifest = { format: RESUMABLE_TRANSFER_FORMAT, transferId, sourceNodeId, targetNodeId,
    stateRoot: rootHash(state), payloadSha256: bytesHash(payload), totalChunks, chunkBytes };
  manifestFromFields(manifest);
  return manifest;
}

function chunkMatchesManifest(chunk, manifest) {
  return chunk.format === manifest.format && chunk.transferId === manifest.transferId
    && chunk.sourceNodeId === manifest.sourceNodeId && chunk.targetNodeId === manifest.targetNodeId
    && chunk.stateRoot === manifest.stateRoot && chunk.payloadSha256 === manifest.payloadSha256
    && chunk.totalChunks === manifest.totalChunks && chunk.chunkBytes === manifest.chunkBytes;
}

export function validateAuthorityRegistryResumableTransferChunk(chunk, manifest) {
  manifestFromFields(manifest);
  exact(chunk, CHUNK_KEYS, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_INVALID');
  check(chunkMatchesManifest(chunk, manifest) && Number.isSafeInteger(chunk.index)
    && chunk.index >= 0 && chunk.index < manifest.totalChunks,
  'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_INVALID');
  const bytes = base64Bytes(chunk.data, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_INVALID');
  check(bytes.length <= manifest.chunkBytes, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_INVALID');
  return true;
}

export function encodeAuthorityRegistryResumableTransfer({ state, transferId,
  sourceNodeId, targetNodeId, chunkBytes = RESUMABLE_TRANSFER_CHUNK_BYTES } = {}) {
  const payload = payloadForState(state);
  const manifest = makeAuthorityRegistryResumableTransferManifest({ state, transferId,
    sourceNodeId, targetNodeId, chunkBytes });
  const chunks = [];
  for (let index = 0; index < manifest.totalChunks; index++) {
    const data = payload.subarray(index * manifest.chunkBytes, (index + 1) * manifest.chunkBytes);
    const chunk = { ...manifest, index, data: data.toString('base64') };
    validateAuthorityRegistryResumableTransferChunk(chunk, manifest);
    chunks.push(chunk);
  }
  return { manifest, chunks };
}

function journalManifest(journal) {
  return { format: RESUMABLE_TRANSFER_FORMAT, transferId: journal.transferId,
    sourceNodeId: journal.sourceNodeId, targetNodeId: journal.targetNodeId,
    stateRoot: journal.stateRoot, payloadSha256: journal.payloadSha256,
    totalChunks: journal.totalChunks, chunkBytes: journal.chunkBytes };
}

export function makeAuthorityRegistryResumableTransferJournal({ manifest, updatedAtMs = Date.now() } = {}) {
  manifestFromFields(manifest);
  check(safeNonNegative(updatedAtMs), 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  return { format: RESUMABLE_TRANSFER_JOURNAL_FORMAT, transferId: manifest.transferId,
    sourceNodeId: manifest.sourceNodeId, targetNodeId: manifest.targetNodeId,
    stateRoot: manifest.stateRoot, payloadSha256: manifest.payloadSha256,
    totalChunks: manifest.totalChunks, chunkBytes: manifest.chunkBytes,
    chunks: Array.from({ length: manifest.totalChunks }, () => null), nextChunk: 0,
    status: 'receiving', committedOperation: null, updatedAtMs, committedAtMs: null };
}

export function validateAuthorityRegistryResumableTransferJournal(journal) {
  exact(journal, JOURNAL_KEYS, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  check(journal.format === RESUMABLE_TRANSFER_JOURNAL_FORMAT, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  const manifest = journalManifest(journal);
  manifestFromFields(manifest, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  strictArray(journal.chunks, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  check(journal.chunks.length === journal.totalChunks && safeNonNegative(journal.updatedAtMs)
    && (journal.status === 'receiving' || journal.status === 'committed')
    && (journal.committedOperation === null || OPERATIONS.has(journal.committedOperation))
    && (journal.committedAtMs === null || safeNonNegative(journal.committedAtMs))
    && Number.isSafeInteger(journal.nextChunk) && journal.nextChunk >= 0
    && journal.nextChunk <= journal.totalChunks && noPrivateMaterial(journal),
  'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  let firstMissing = journal.totalChunks;
  for (let index = 0; index < journal.chunks.length; index++) {
    const value = journal.chunks[index];
    if (value === null) { if (firstMissing === journal.totalChunks) firstMissing = index; continue; }
    base64Bytes(value, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
    check(base64Bytes(value, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID').length <= journal.chunkBytes,
      'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  }
  check(firstMissing === journal.nextChunk, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  if (journal.status === 'receiving') {
    check(journal.committedOperation === null && journal.committedAtMs === null,
      'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  } else {
    check(firstMissing === journal.totalChunks && OPERATIONS.has(journal.committedOperation)
      && safeNonNegative(journal.committedAtMs), 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  }
  return true;
}

function sameManifest(left, right) {
  return MANIFEST_KEYS.every(key => left[key] === right[key]);
}

export function acceptAuthorityRegistryResumableTransferChunk({ journal, manifest, chunk,
  updatedAtMs = Date.now() } = {}) {
  validateAuthorityRegistryResumableTransferJournal(journal);
  manifestFromFields(manifest);
  validateAuthorityRegistryResumableTransferChunk(chunk, manifest);
  check(safeNonNegative(updatedAtMs), 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID');
  check(sameManifest(journalManifest(journal), manifest), 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT');
  if (journal.status === 'committed') {
    return { status: 'unchanged', complete: true, journal };
  }
  const existing = journal.chunks[chunk.index];
  if (existing !== null) {
    check(existing === chunk.data, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT');
    return { status: 'unchanged', complete: journal.nextChunk === journal.totalChunks, journal };
  }
  const next = { ...journal, chunks: [...journal.chunks], updatedAtMs };
  next.chunks[chunk.index] = chunk.data;
  while (next.nextChunk < next.totalChunks && next.chunks[next.nextChunk] !== null) next.nextChunk++;
  validateAuthorityRegistryResumableTransferJournal(next);
  return { status: 'received', complete: next.nextChunk === next.totalChunks, journal: next };
}

export function authorityRegistryResumableTransferState(journal) {
  validateAuthorityRegistryResumableTransferJournal(journal);
  check(journal.nextChunk === journal.totalChunks, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_INCOMPLETE');
  const bytes = Buffer.concat(journal.chunks.map(chunk => base64Bytes(chunk,
    'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_INVALID')));
  check(bytesHash(bytes) === journal.payloadSha256, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PAYLOAD_MISMATCH');
  let state;
  try { state = JSON.parse(bytes.toString('utf8')); } catch { fail('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_PAYLOAD_INVALID'); }
  validateAuthorityRegistryConvergenceStoreState(state);
  check(rootHash(state) === journal.stateRoot, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_STATE_ROOT_MISMATCH');
  return state;
}

export function commitAuthorityRegistryResumableTransferJournal({ journal, operation,
  updatedAtMs = Date.now(), committedAtMs = updatedAtMs } = {}) {
  validateAuthorityRegistryResumableTransferJournal(journal);
  check(OPERATIONS.has(operation) && safeNonNegative(updatedAtMs) && safeNonNegative(committedAtMs),
    'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_COMMIT_INVALID');
  check(journal.nextChunk === journal.totalChunks, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_INCOMPLETE');
  if (journal.status === 'committed') {
    check(journal.committedOperation === operation, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_COMMIT_CONFLICT');
    return journal;
  }
  const next = { ...journal, status: 'committed', committedOperation: operation,
    updatedAtMs, committedAtMs };
  validateAuthorityRegistryResumableTransferJournal(next);
  return next;
}

export function resumableTransferJournalSummary(journal) {
  validateAuthorityRegistryResumableTransferJournal(journal);
  return { format: journal.format, transferId: journal.transferId,
    sourceNodeId: journal.sourceNodeId, targetNodeId: journal.targetNodeId,
    stateRoot: journal.stateRoot, totalChunks: journal.totalChunks,
    receivedChunks: journal.chunks.reduce((count, value) => count + (value === null ? 0 : 1), 0),
    nextChunk: journal.nextChunk, status: journal.status,
    committedOperation: journal.committedOperation, updatedAtMs: journal.updatedAtMs,
    committedAtMs: journal.committedAtMs };
}

export function readAuthorityRegistryResumableTransferJournal(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > RESUMABLE_TRANSFER_MAX_PAYLOAD_BYTES) throw new Error();
    const journal = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateAuthorityRegistryResumableTransferJournal(journal);
    return journal;
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    fail('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_LOAD_FAILED');
  }
}

export function writeAuthorityRegistryResumableTransferJournal(file, journal) {
  validateAuthorityRegistryResumableTransferJournal(journal);
  let payload;
  try { payload = JSON.stringify(journal); } catch { fail('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_SAVE_FAILED'); }
  check(Buffer.byteLength(payload) <= RESUMABLE_TRANSFER_MAX_PAYLOAD_BYTES,
    'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_SAVE_FAILED');
  const target = path.resolve(file);
  const directory = path.dirname(target);
  const temporary = path.join(directory, `.authority-registry-transfer.${randomUUID()}.tmp`);
  let fd;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, payload, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, target);
  } catch { fail('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_SAVE_FAILED'); }
  finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    if (fs.existsSync(temporary)) { try { fs.unlinkSync(temporary); } catch {} }
  }
  return true;
}

export class AuthorityRegistryResumableTransferJournal {
  constructor(file) {
    check(typeof file === 'string' && file.length > 0, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_JOURNAL_PATH_INVALID');
    this.file = path.resolve(file); this.directory = path.dirname(this.file);
  }
  get exists() { return fs.existsSync(this.file); }
  load() { return readAuthorityRegistryResumableTransferJournal(this.file); }
  summary() { return resumableTransferJournalSummary(this.load()); }
  async accept({ manifest, chunk, updatedAtMs = Date.now() } = {}) {
    const lease = await acquireDirectoryLease(this.directory);
    try {
      const existing = this.exists ? this.load() : makeAuthorityRegistryResumableTransferJournal({ manifest, updatedAtMs });
      const result = acceptAuthorityRegistryResumableTransferChunk({ journal: existing, manifest, chunk, updatedAtMs });
      if (result.status !== 'unchanged' || !this.exists) writeAuthorityRegistryResumableTransferJournal(this.file, result.journal);
      return { ...result, file: this.file, summary: resumableTransferJournalSummary(result.journal) };
    } finally { await lease.release(); }
  }
  async commit({ operation, updatedAtMs = Date.now(), committedAtMs = updatedAtMs } = {}) {
    const lease = await acquireDirectoryLease(this.directory);
    try {
      const existing = this.load();
      const next = commitAuthorityRegistryResumableTransferJournal({ journal: existing, operation, updatedAtMs, committedAtMs });
      if (next !== existing) writeAuthorityRegistryResumableTransferJournal(this.file, next);
      return { journal: next, file: this.file, summary: resumableTransferJournalSummary(next) };
    } finally { await lease.release(); }
  }
}

export const authorityRegistryResumableTransferFormats = Object.freeze({
  transfer: RESUMABLE_TRANSFER_FORMAT, journal: RESUMABLE_TRANSFER_JOURNAL_FORMAT,
});
