import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProtocolError } from '../src/identity.mjs';
import { AuthorityRegistryResumableTransferJournal, RESUMABLE_TRANSFER_FORMAT,
  acceptAuthorityRegistryResumableTransferChunk, authorityRegistryResumableTransferState,
  commitAuthorityRegistryResumableTransferJournal, makeAuthorityRegistryResumableTransferJournal,
  resumableTransferJournalSummary, validateAuthorityRegistryResumableTransferChunk } from '../src/authority-registry-resumable-transfer.mjs';

const manifest = { format: RESUMABLE_TRANSFER_FORMAT, transferId: 'transfer:test',
  sourceNodeId: 'node:a', targetNodeId: 'node:b', stateRoot: 'a'.repeat(64),
  payloadSha256: 'b'.repeat(64), totalChunks: 2, chunkBytes: 4 };
const chunks = [
  { ...manifest, index: 0, data: Buffer.from('abcd').toString('base64') },
  { ...manifest, index: 1, data: Buffer.from('efgh').toString('base64') },
];

test('resumable transfer journal persists cursors and makes duplicate chunks idempotent', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-resumable-journal-'));
  const journalFile = path.join(directory, 'transfer.journal.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journal = new AuthorityRegistryResumableTransferJournal(journalFile);
  const first = await journal.accept({ manifest, chunk: chunks[0], updatedAtMs: 10 });
  assert.equal(first.status, 'received');
  assert.equal(first.summary.nextChunk, 1);
  assert.equal(first.summary.receivedChunks, 1);
  assert.equal(JSON.parse(fs.readFileSync(journalFile, 'utf8')).nextChunk, 1);
  const beforeDuplicate = fs.readFileSync(journalFile);
  const duplicate = await journal.accept({ manifest, chunk: chunks[0], updatedAtMs: 11 });
  assert.equal(duplicate.status, 'unchanged');
  assert.deepEqual(fs.readFileSync(journalFile), beforeDuplicate);
  const complete = await journal.accept({ manifest, chunk: chunks[1], updatedAtMs: 12 });
  assert.equal(complete.complete, true);
  assert.equal(complete.summary.nextChunk, 2);
  const committed = await journal.commit({ operation: 'appended', updatedAtMs: 13, committedAtMs: 13 });
  assert.equal(committed.summary.status, 'committed');
  assert.equal(committed.summary.committedOperation, 'appended');
  assert.equal(resumableTransferJournalSummary(journal.load()).receivedChunks, 2);
});

test('resumable transfer rejects altered chunks, manifests and incomplete commits without mutation', () => {
  let journal = makeAuthorityRegistryResumableTransferJournal({ manifest, updatedAtMs: 20 });
  journal = acceptAuthorityRegistryResumableTransferChunk({ journal, manifest, chunk: chunks[0], updatedAtMs: 21 }).journal;
  const conflictChunk = { ...chunks[0], data: Buffer.from('wxyz').toString('base64') };
  assert.throws(() => acceptAuthorityRegistryResumableTransferChunk({ journal, manifest, chunk: conflictChunk, updatedAtMs: 22 }),
    error => error instanceof ProtocolError && error.code === 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT');
  const alternateManifest = { ...manifest, stateRoot: 'c'.repeat(64) };
  const alternateChunk = { ...alternateManifest, index: 0, data: chunks[0].data };
  assert.throws(() => acceptAuthorityRegistryResumableTransferChunk({ journal, manifest: alternateManifest, chunk: alternateChunk, updatedAtMs: 23 }),
    error => error instanceof ProtocolError && error.code === 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT');
  assert.throws(() => commitAuthorityRegistryResumableTransferJournal({ journal, operation: 'appended', updatedAtMs: 24 }),
    error => error instanceof ProtocolError && error.code === 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_INCOMPLETE');
  assert.throws(() => validateAuthorityRegistryResumableTransferChunk({ ...chunks[0], index: 2 }, manifest),
    error => error instanceof ProtocolError && error.code === 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_INVALID');
  assert.equal(journal.nextChunk, 1);
  assert.equal(journal.status, 'receiving');
});

function runDemo() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry-resumable-transfer-demo.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) reject(new Error(`resumable transfer demo exited ${code}: ${stderr}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`resumable transfer demo emitted invalid JSON: ${error.message}\n${stdout}`)); }
      }
    });
  });
}

test('TLS resumable transfer resumes a durable public journal after receiver restart', async () => {
  const result = await runDemo();
  assert.equal(result.status, 'VERIFIED_LOCAL_TINP_TLS_RESUMABLE_STATE_TRANSFER');
  assert.equal(result.transport, 'tls');
  assert.equal(result.frameType, 'DATA');
  assert.equal(result.encryptedTransport, true);
  assert.equal(result.tlsVersion, 'TLSv1.3');
  assert.match(result.tlsCipher, /^TLS_/);
  assert.ok(result.tlsHandshakes >= 4);
  assert.equal(result.peerCertificatePinned, true);
  assert.equal(result.independentProcesses, true);
  assert.equal(result.independentDirectories, true);
  assert.equal(result.receiverRestarted, true);
  assert.ok(result.totalChunks >= 4);
  assert.equal(result.resumedFromChunk, result.interruptedAfterChunks);
  assert.equal(result.duplicateChunkOperation, 'unchanged');
  assert.equal(result.completedOperation, 'appended');
  assert.equal(result.committedAfterRestart, true);
  assert.equal(result.postCommitReplayOperation, 'unchanged');
  assert.equal(result.conflictDetected, true);
  assert.equal(result.conflictRejectionCode, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT');
  assert.equal(result.manifestConflictDetected, true);
  assert.equal(result.manifestConflictRejectionCode, 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT');
  assert.equal(result.stateRetainedAfterConflict, true);
  assert.equal(result.receiverInvalidFrames, 0);
  assert.equal(result.privateMaterialTransferred, false);
});
