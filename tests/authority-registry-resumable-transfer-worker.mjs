import { newIdentity, ProtocolError, rootHash } from '../src/identity.mjs';
import { LocalTransport } from '../src/transport.mjs';
import { AuthorityRegistryConvergenceStore, convergenceBundleFromStoreState } from '../src/authority-registry-convergence-store.mjs';
import { AuthorityRegistryResumableTransferJournal, RESUMABLE_TRANSFER_FORMAT,
  authorityRegistryResumableTransferState } from '../src/authority-registry-resumable-transfer.mjs';

if (!process.send) throw new Error('resumable transfer worker requires IPC');

let transport = null;
let store = null;
let journal = null;
let context = null;
let nodeId = null;
let identity = null;

function send(message) {
  try { process.send(message); } catch { process.exitCode = 1; }
}

function journalResult(result, sender) {
  return { status: result.status, complete: result.complete, sender,
    nextChunk: result.summary?.nextChunk, receivedChunks: result.summary?.receivedChunks,
    totalChunks: result.summary?.totalChunks, journalStatus: result.summary?.status,
    committedOperation: result.summary?.committedOperation,
    stateRoot: result.summary?.stateRoot };
}

async function receiveChunk(value, sender) {
  if (value?.format !== RESUMABLE_TRANSFER_FORMAT || !value.manifest || !value.chunk
    || value.manifest.format !== RESUMABLE_TRANSFER_FORMAT) {
    throw new ProtocolError('AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_INVALID');
  }
  const accepted = await journal.accept({ manifest: value.manifest, chunk: value.chunk,
    updatedAtMs: value.updatedAtMs ?? Date.now() });
  let operation = accepted.summary.committedOperation;
  if (accepted.complete && accepted.summary.status !== 'committed') {
    const state = authorityRegistryResumableTransferState(accepted.journal);
    const convergenceBundle = convergenceBundleFromStoreState(state);
    const stored = await store.append({ ...context, convergenceBundle,
      nowMs: value.nowMs ?? Date.now(), updatedAtMs: state.updatedAtMs,
      requireCurrent: value.requireCurrent ?? true });
    operation = stored.status;
    await journal.commit({ operation, updatedAtMs: value.updatedAtMs ?? Date.now(),
      committedAtMs: value.nowMs ?? Date.now() });
  }
  const summary = journal.summary();
  return { ...journalResult({ status: accepted.status, complete: summary.nextChunk === summary.totalChunks,
    summary }, sender), operation, stateRoot: summary.stateRoot };
}

process.on('message', async message => {
  const callId = message?.callId;
  try {
    if (message?.command === 'init') {
      if (typeof message.nodeId !== 'string' || typeof message.file !== 'string'
        || typeof message.journalFile !== 'string' || !message.context
        || typeof message.context !== 'object') throw new Error('AUTHORITY_REGISTRY_RESUMABLE_INIT_INVALID');
      nodeId = message.nodeId; identity = newIdentity(); context = message.context;
      store = new AuthorityRegistryConvergenceStore(message.file);
      journal = new AuthorityRegistryResumableTransferJournal(message.journalFile);
      transport = await new LocalTransport({ nodeId, identity, kind: message.kind ?? 'tls',
        tlsOptions: message.tls ?? null }).bind();
      transport.handler = receiveChunk;
      send({ callId, event: 'initialized', nodeId, pid: process.pid, file: store.file,
        journalFile: journal.file, endpoint: transport.endpoint(), publicKey: identity.publicKey });
      return;
    }
    if (!store || !journal || !transport || !context) throw new Error('AUTHORITY_REGISTRY_RESUMABLE_NOT_INITIALIZED');
    if (message.command === 'configure-peers') {
      transport.peers = message.peers;
      send({ callId, result: { configured: true, peers: Object.keys(transport.peers) } }); return;
    }
    if (message.command === 'append') {
      const result = await store.append({ ...context, convergenceBundle: message.convergenceBundle,
        nowMs: message.nowMs, updatedAtMs: message.updatedAtMs ?? message.nowMs,
        requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: { status: result.status, appendedBundles: result.appendedBundles,
        firstSequence: result.verification?.firstSequence, lastSequence: result.verification?.lastSequence,
        historyRoot: result.verification?.historyRoot, stateRoot: rootHash(result.state), state: result.state } }); return;
    }
    if (message.command === 'export') {
      const state = store.load(); send({ callId, result: { state, stateRoot: rootHash(state) } }); return;
    }
    if (message.command === 'send-chunk') {
      const result = await transport.request(message.peerId, { format: RESUMABLE_TRANSFER_FORMAT,
        manifest: message.manifest, chunk: message.chunk, nowMs: message.nowMs,
        updatedAtMs: message.updatedAtMs, requireCurrent: message.requireCurrent ?? true }, message.timeoutMs ?? 10000);
      send({ callId, result: { ...result, metrics: { sentFrames: transport.metrics.sentFrames,
        sentBytes: transport.metrics.sentBytes } } }); return;
    }
    if (message.command === 'progress') {
      send({ callId, result: journal.exists ? journal.summary() : { status: 'absent', receivedChunks: 0,
        nextChunk: 0, totalChunks: 0, committedOperation: null } }); return;
    }
    if (message.command === 'verify') {
      const result = store.verify({ ...context, nowMs: message.nowMs, requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: { firstSequence: result.firstSequence, lastSequence: result.lastSequence,
        historyRoot: result.historyRoot, currentLatest: result.currentLatest, stateRoot: rootHash(store.load()) } }); return;
    }
    if (message.command === 'stats') {
      send({ callId, result: { nodeId, pid: process.pid, endpoint: transport.endpoint(),
        metrics: transport.metrics, journal: journal.exists ? journal.summary() : null } }); return;
    }
    if (message.command === 'close') {
      await transport.close(); send({ callId, result: { closed: true } }); process.exit(0); return;
    }
    throw new ProtocolError('AUTHORITY_REGISTRY_RESUMABLE_COMMAND_UNKNOWN');
  } catch (error) {
    send({ callId, error: { code: error?.code ?? error?.message ?? 'AUTHORITY_REGISTRY_RESUMABLE_WORKER_FAILED' } });
  }
});

send({ event: 'worker-ready', pid: process.pid });
