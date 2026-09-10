import { AuthorityRegistryConvergenceStore, writeAuthorityRegistryConvergenceStore } from '../src/authority-registry-convergence-store.mjs';

if (!process.send) throw new Error('cross-host replay worker requires IPC');

let store = null;
let context = null;

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

process.on('message', async message => {
  const callId = message?.callId;
  try {
    if (message?.command === 'init') {
      if (typeof message.file !== 'string' || !message.context || typeof message.context !== 'object') {
        throw new Error('CROSS_HOST_REPLAY_INIT_INVALID');
      }
      store = new AuthorityRegistryConvergenceStore(message.file);
      context = message.context;
      send({ callId, event: 'initialized', pid: process.pid, file: store.file });
      return;
    }
    if (!store || !context) throw new Error('CROSS_HOST_REPLAY_NOT_INITIALIZED');
    if (message.command === 'append') {
      const nowMs = message.nowMs;
      const appended = await store.append({ ...context, convergenceBundle: message.convergenceBundle,
        nowMs, updatedAtMs: message.updatedAtMs ?? nowMs, requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: resultSummary(appended) });
      return;
    }
    if (message.command === 'verify') {
      const verification = store.verify({ ...context, nowMs: message.nowMs, requireCurrent: message.requireCurrent ?? true });
      send({ callId, result: { firstSequence: verification.firstSequence, lastSequence: verification.lastSequence,
        historyRoot: verification.historyRoot, currentLatest: verification.currentLatest } });
      return;
    }
    if (message.command === 'export') {
      send({ callId, result: store.load() });
      return;
    }
    if (message.command === 'import') {
      writeAuthorityRegistryConvergenceStore(store.file, message.state);
      send({ callId, result: { imported: true, exists: store.exists } });
      return;
    }
    if (message.command === 'stop') {
      send({ callId, result: { stopped: true } });
      process.exit(0);
      return;
    }
    throw new Error('CROSS_HOST_REPLAY_COMMAND_UNKNOWN');
  } catch (error) {
    send({ callId, error: { code: error?.code ?? error?.message ?? 'CROSS_HOST_REPLAY_WORKER_FAILED' } });
  }
});

send({ event: 'worker-ready', pid: process.pid });
