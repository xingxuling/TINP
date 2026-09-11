import { newIdentity, ProtocolError, rootHash } from '../src/identity.mjs';
import { LocalTransport } from '../src/transport.mjs';
import { AuthorityRegistryConvergenceStore, convergenceBundleFromStoreState } from '../src/authority-registry-convergence-store.mjs';

if (!process.send) throw new Error('loopback transfer worker requires IPC');

let transport = null;
let store = null;
let context = null;
let nodeId = null;
let identity = null;
let transportKind = null;

function send(message) {
  try { process.send(message); } catch { process.exitCode = 1; }
}

function resultSummary(result) {
  return {
    status: result.status,
    appendedBundles: result.appendedBundles,
    firstSequence: result.verification?.firstSequence,
    lastSequence: result.verification?.lastSequence,
    historyRoot: result.verification?.historyRoot,
  };
}

function hasPrivateMaterial(value) {
  return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(JSON.stringify(value));
}

async function receiveStateTransfer(value, sender) {
  if (value?.format !== 'twni.authority-registry-state-transfer.v1'
    || !value.state || typeof value.state !== 'object'
    || typeof value.stateRoot !== 'string' || value.stateRoot !== rootHash(value.state)
    || hasPrivateMaterial(value)) {
    throw new ProtocolError('AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID');
  }
  const convergenceBundle = convergenceBundleFromStoreState(value.state);
  const result = await store.append({ ...context, convergenceBundle,
    nowMs: value.nowMs, updatedAtMs: value.state.updatedAtMs,
    requireCurrent: value.requireCurrent ?? true });
  return { ...resultSummary(result), stateRoot: rootHash(value.state), sender };
}

process.on('message', async message => {
  const callId = message?.callId;
  try {
    if (message?.command === 'init') {
      if (typeof message.nodeId !== 'string' || typeof message.file !== 'string'
        || !message.context || typeof message.context !== 'object') {
        throw new Error('AUTHORITY_REGISTRY_LOOPBACK_INIT_INVALID');
      }
      nodeId = message.nodeId;
      identity = newIdentity();
      store = new AuthorityRegistryConvergenceStore(message.file);
      context = message.context;
      transportKind = message.kind ?? 'tcp';
      transport = await new LocalTransport({ nodeId, identity, kind: transportKind, tlsOptions: message.tls ?? null }).bind();
      transport.handler = receiveStateTransfer;
      send({ callId, event: 'initialized', nodeId, pid: process.pid, file: store.file,
        endpoint: transport.endpoint(), publicKey: identity.publicKey, transport: transportKind });
      return;
    }
    if (!store || !transport || !context) throw new Error('AUTHORITY_REGISTRY_LOOPBACK_NOT_INITIALIZED');
    if (message.command === 'configure-peers') {
      transport.peers = message.peers;
      send({ callId, result: { configured: true, peers: Object.keys(transport.peers) } });
      return;
    }
    if (message.command === 'append') {
      const nowMs = message.nowMs;
      const result = await store.append({ ...context, convergenceBundle: message.convergenceBundle,
        nowMs, updatedAtMs: message.updatedAtMs ?? nowMs, requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: resultSummary(result) });
      return;
    }
    if (message.command === 'verify') {
      const verification = store.verify({ ...context, nowMs: message.nowMs, requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: { firstSequence: verification.firstSequence, lastSequence: verification.lastSequence,
        historyRoot: verification.historyRoot, currentLatest: verification.currentLatest } });
      return;
    }
    if (message.command === 'export') {
      const state = store.load();
      send({ callId, result: { state, stateRoot: rootHash(state) } });
      return;
    }
    if (message.command === 'transfer') {
      const state = store.load();
      const transfer = { format: 'twni.authority-registry-state-transfer.v1',
        state: message.mutate === 'historyRoot' ? { ...state, historyRoot: 'f'.repeat(64) } : state,
        stateRoot: message.mutate === 'stateRoot' ? '0'.repeat(64) : rootHash(state),
        nowMs: message.nowMs, requireCurrent: message.requireCurrent ?? true };
      const result = await transport.request(message.peerId, transfer, message.timeoutMs ?? 4000);
      send({ callId, result: { ...result, sentStateRoot: rootHash(state),
        metrics: { sentFrames: transport.metrics.sentFrames, sentBytes: transport.metrics.sentBytes } } });
      return;
    }
    if (message.command === 'stats') {
      send({ callId, result: { nodeId, pid: process.pid, endpoint: transport.endpoint(),
        metrics: transport.metrics, peerIds: Object.keys(transport.peers) } });
      return;
    }
    if (message.command === 'close') {
      await transport.close();
      send({ callId, result: { closed: true } });
      process.exit(0);
      return;
    }
    throw new ProtocolError('AUTHORITY_REGISTRY_LOOPBACK_COMMAND_UNKNOWN');
  } catch (error) {
    send({ callId, error: { code: error?.code ?? error?.message ?? 'AUTHORITY_REGISTRY_LOOPBACK_WORKER_FAILED' } });
  }
});

send({ event: 'worker-ready', pid: process.pid });
