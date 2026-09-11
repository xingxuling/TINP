import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeAuthorityRegistryResumableTransfer } from '../src/authority-registry-resumable-transfer.mjs';
import { makeAuthorityRegistryConvergenceStoreState } from '../src/authority-registry-convergence-store.mjs';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity, rootHash } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { createTlsLoopbackCertificates, removeTlsLoopbackCertificates } from '../tests/tls-loopback-certificates.mjs';

const workerUrl = new URL('../tests/authority-registry-resumable-transfer-worker.mjs', import.meta.url);
let callId = 0;
const workers = [];

function fixture() {
  const issuer = newIdentity();
  const member = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta', 'mirror:gamma'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-resumable-demo',
    issuerId: 'registry:issuer-resumable-demo', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 5000 })];
  const body = (sequence, previousRegistryRoot, issuedAtMs) => makeAuthorityRegistryBody({
    policy: registryPolicy, sequence, previousRegistryRoot, issuedAtMs,
    expiresAtMs: now + 60 * 60 * 1000, entries });
  const registry1 = signAuthorityRegistry(body(1, undefined, now - 4500), issuer.privateKey);
  const registry2 = signAuthorityRegistry(body(2, registry1.root, now - 4000), issuer.privateKey);
  const registry3 = signAuthorityRegistry(body(3, registry2.root, now - 3500), issuer.privateKey);
  const registry4 = signAuthorityRegistry(body(4, registry3.root, now - 3000), issuer.privateKey);
  const alternateRegistry2 = signAuthorityRegistry(body(2, registry1.root, now - 3900), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-resumable-demo', registryId: registryPolicy.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const bundle = (registry, issuedAtMs) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry, receipts: mirrors.map(mirror => signAuthorityRegistryDistributionReceipt(
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs,
        expiresAtMs: now + 30 * 60 * 1000 }), mirror.privateKey)),
  });
  const bundles = [bundle(registry1, now - 4300), bundle(registry2, now - 3800),
    bundle(registry3, now - 3300), bundle(registry4, now - 2800)];
  const alternateBundle2 = bundle(alternateRegistry2, now - 3700);
  return {
    now,
    context: { distributionPolicy, registryPolicy,
      issuerKeyring: { [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } },
      mirrorKeyring: Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
        { publicKeyPem: mirror.publicKey, revoked: false }])), nowMs: now },
    history4: makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles }),
    forkHistory: makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
      bundles: [bundles[0], alternateBundle2, bundles[2], bundles[3]] }),
  };
}

function ready(child, event, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(message)); }, 10000);
    const handler = value => {
      if (value?.event !== event) return;
      clearTimeout(timer); child.off('message', handler); resolve(value);
    };
    child.on('message', handler); child.once('error', error => {
      clearTimeout(timer); child.off('message', handler); reject(error);
    });
  });
}

function rpc(child, command, payload = {}) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(`resumable ${command} timeout`)); }, 30000);
    const handler = value => {
      if (value?.callId !== id) return;
      clearTimeout(timer); child.off('message', handler);
      if (value.error) { const error = new Error(value.error.code ?? value.error); error.code = value.error.code ?? value.error; reject(error); }
      else resolve(value.result);
    };
    child.on('message', handler); child.send({ ...payload, command, callId: id });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

async function startWorker(id, file, journalFile, context, tls) {
  const child = fork(fileURLToPath(workerUrl), [id], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    execArgv: [], windowsHide: true });
  workers.push(child);
  await ready(child, 'worker-ready', `${id} worker did not start`);
  const initialized = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(`${id} init timeout`)); }, 10000);
    const handler = value => {
      if (value?.event !== 'initialized') return;
      clearTimeout(timer); child.off('message', handler); resolve(value);
    };
    child.on('message', handler);
    child.send({ command: 'init', callId: ++callId, nodeId: id, file, journalFile, context, kind: 'tls', tls });
  });
  return { id, child, file, journalFile, ...initialized };
}

function flipBase64(value) {
  const index = value.length > 8 ? 4 : 0;
  return `${value.slice(0, index)}${value[index] === 'A' ? 'B' : 'A'}${value.slice(index + 1)}`;
}

const f = fixture();
const baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-resumable-'));
const directoryA = path.join(baseDirectory, 'node-a');
const directoryB = path.join(baseDirectory, 'node-b');
fs.mkdirSync(directoryA); fs.mkdirSync(directoryB);
const fileA = path.join(directoryA, 'history.json');
const fileB = path.join(directoryB, 'history.json');
const journalA = path.join(directoryA, 'transfer.journal.json');
const journalB = path.join(directoryB, 'transfer.journal.json');
const certificates = createTlsLoopbackCertificates(baseDirectory);
let hostA = null;
let hostB = null;
try {
  hostA = await startWorker('authority-resumable-a', fileA, journalA, f.context, certificates.certificates.a);
  hostB = await startWorker('authority-resumable-b', fileB, journalB, f.context, certificates.certificates.b);
  await rpc(hostA.child, 'configure-peers', { peers: { [hostB.id]: { endpoint: hostB.endpoint, publicKey: hostB.publicKey } } });
  await rpc(hostB.child, 'configure-peers', { peers: { [hostA.id]: { endpoint: hostA.endpoint, publicKey: hostA.publicKey } } });

  const appended = await rpc(hostA.child, 'append', { convergenceBundle: f.history4, nowMs: f.now, updatedAtMs: f.now });
  const exported = await rpc(hostA.child, 'export');
  const encoded = encodeAuthorityRegistryResumableTransfer({ state: exported.state,
    transferId: 'transfer:authority-registry-resumable-demo', sourceNodeId: hostA.id,
    targetNodeId: hostB.id, chunkBytes: 1024 });
  const interruption = Math.max(2, Math.floor(encoded.chunks.length / 2));
  for (let index = 0; index < interruption; index++) {
    await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: encoded.manifest,
      chunk: encoded.chunks[index], nowMs: f.now + index + 1, updatedAtMs: f.now + index + 1 });
  }
  const beforeRestart = await rpc(hostB.child, 'progress');
  if (beforeRestart.status !== 'receiving' || beforeRestart.nextChunk !== interruption) throw new Error('RESUMABLE_INTERRUPTION_NOT_PERSISTED');
  const statsBeforeRestart = await rpc(hostB.child, 'stats');
  const journalBeforeRestart = fs.readFileSync(journalB);
  await stop(hostB.child);
  hostB = await startWorker('authority-resumable-b-restarted', fileB, journalB, f.context, certificates.certificates.b);
  await rpc(hostA.child, 'configure-peers', { peers: { [hostB.id]: { endpoint: hostB.endpoint, publicKey: hostB.publicKey } } });
  await rpc(hostB.child, 'configure-peers', { peers: { [hostA.id]: { endpoint: hostA.endpoint, publicKey: hostA.publicKey } } });
  const afterRestart = await rpc(hostB.child, 'progress');
  if (afterRestart.status !== 'receiving' || afterRestart.nextChunk !== interruption
    || afterRestart.receivedChunks !== beforeRestart.receivedChunks) throw new Error('RESUMABLE_RESTART_CURSOR_INVALID');

  const duplicate = await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: encoded.manifest,
    chunk: encoded.chunks[0], nowMs: f.now + 100, updatedAtMs: f.now + 100 });
  if (duplicate.status !== 'unchanged') throw new Error('RESUMABLE_DUPLICATE_NOT_IDEMPOTENT');
  const journalAfterDuplicate = fs.readFileSync(journalB);
  if (!journalAfterDuplicate.equals(journalBeforeRestart)) throw new Error('RESUMABLE_DUPLICATE_MUTATED_JOURNAL');

  let conflictCode = null;
  try {
    await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: encoded.manifest,
      chunk: { ...encoded.chunks[1], data: flipBase64(encoded.chunks[1].data) }, nowMs: f.now + 101, updatedAtMs: f.now + 101 });
  } catch (error) { conflictCode = error.code ?? error.message; }
  if (conflictCode !== 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_CHUNK_CONFLICT') throw new Error('RESUMABLE_CHUNK_CONFLICT_NOT_REJECTED');
  if (!fs.readFileSync(journalB).equals(journalAfterDuplicate)) throw new Error('RESUMABLE_CONFLICT_MUTATED_JOURNAL');

  let resumed = null;
  for (let index = afterRestart.nextChunk; index < encoded.chunks.length; index++) {
    resumed = await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: encoded.manifest,
      chunk: encoded.chunks[index], nowMs: f.now + 200 + index, updatedAtMs: f.now + 200 + index });
  }
  if (!resumed || resumed.operation !== 'appended' || resumed.journalStatus !== 'committed') throw new Error('RESUMABLE_TRANSFER_NOT_COMMITTED');
  const verified = await rpc(hostB.child, 'verify', { nowMs: f.now + 500 });
  const committed = await rpc(hostB.child, 'progress');
  if (committed.status !== 'committed' || committed.receivedChunks !== encoded.chunks.length
    || committed.stateRoot !== exported.stateRoot || verified.stateRoot !== exported.stateRoot) throw new Error('RESUMABLE_COMMIT_STATE_MISMATCH');

  const statsBeforeFinalRestart = await rpc(hostB.child, 'stats');
  await stop(hostB.child);
  hostB = await startWorker('authority-resumable-b-final-restart', fileB, journalB, f.context, certificates.certificates.b);
  await rpc(hostA.child, 'configure-peers', { peers: { [hostB.id]: { endpoint: hostB.endpoint, publicKey: hostB.publicKey } } });
  await rpc(hostB.child, 'configure-peers', { peers: { [hostA.id]: { endpoint: hostA.endpoint, publicKey: hostA.publicKey } } });
  const afterCommitRestart = await rpc(hostB.child, 'progress');
  const verifiedAfterRestart = await rpc(hostB.child, 'verify', { nowMs: f.now + 600 });
  if (afterCommitRestart.status !== 'committed' || verifiedAfterRestart.stateRoot !== exported.stateRoot) throw new Error('RESUMABLE_COMMITTED_RESTART_INVALID');
  const postCommitDuplicate = await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: encoded.manifest,
    chunk: encoded.chunks.at(-1), nowMs: f.now + 601, updatedAtMs: f.now + 601 });
  if (postCommitDuplicate.status !== 'unchanged' || postCommitDuplicate.journalStatus !== 'committed') throw new Error('RESUMABLE_COMMITTED_REPLAY_INVALID');

  const alternateState = makeAuthorityRegistryConvergenceStoreState({ convergenceBundle: f.forkHistory,
    updatedAtMs: f.now + 700 });
  const alternate = encodeAuthorityRegistryResumableTransfer({ state: alternateState,
    transferId: encoded.manifest.transferId, sourceNodeId: hostA.id, targetNodeId: hostB.id, chunkBytes: 1024 });
  let manifestConflictCode = null;
  try { await rpc(hostA.child, 'send-chunk', { peerId: hostB.id, manifest: alternate.manifest,
    chunk: alternate.chunks[0], nowMs: f.now + 701, updatedAtMs: f.now + 701 }); }
  catch (error) { manifestConflictCode = error.code ?? error.message; }
  if (manifestConflictCode !== 'AUTHORITY_REGISTRY_RESUMABLE_TRANSFER_MANIFEST_CONFLICT') throw new Error('RESUMABLE_MANIFEST_CONFLICT_NOT_REJECTED');

  const statsA = await rpc(hostA.child, 'stats');
  const statsB = await rpc(hostB.child, 'stats');
  const output = {
    format: 'twni.authority-registry-resumable-transfer-demo.v1',
    status: 'VERIFIED_LOCAL_TINP_TLS_RESUMABLE_STATE_TRANSFER',
    transport: 'tls', frameType: 'DATA', encryptedTransport: true,
    tlsVersion: statsA.metrics.tlsVersion ?? statsB.metrics.tlsVersion,
    tlsCipher: statsA.metrics.tlsCipher ?? statsB.metrics.tlsCipher,
    tlsHandshakes: (statsA.metrics.secureConnections ?? 0) + (statsBeforeRestart.metrics.secureConnections ?? 0)
      + (statsBeforeFinalRestart.metrics.secureConnections ?? 0) + (statsB.metrics.secureConnections ?? 0),
    peerCertificatePinned: true, peerAuthenticationConfigured: true,
    independentProcesses: true, independentDirectories: true, receiverRestarted: true,
    firstOperation: appended.status, transferId: encoded.manifest.transferId,
    stateRoot: encoded.manifest.stateRoot, payloadSha256: encoded.manifest.payloadSha256,
    chunkBytes: encoded.manifest.chunkBytes, totalChunks: encoded.manifest.totalChunks,
    interruptedAfterChunks: interruption, resumedFromChunk: afterRestart.nextChunk,
    duplicateChunkOperation: duplicate.status, completedOperation: resumed.operation,
    committedAfterRestart: afterCommitRestart.status === 'committed', postCommitReplayOperation: postCommitDuplicate.status,
    conflictDetected: true, conflictRejectionCode: conflictCode,
    manifestConflictDetected: true, manifestConflictRejectionCode: manifestConflictCode,
    stateRetainedAfterConflict: (await rpc(hostB.child, 'verify', { nowMs: f.now + 702 })).stateRoot === exported.stateRoot,
    senderFrames: statsA.metrics.sentFrames,
    receiverFrames: (statsBeforeRestart.metrics.receivedFrames ?? 0) + (statsBeforeFinalRestart.metrics.receivedFrames ?? 0)
      + (statsB.metrics.receivedFrames ?? 0),
    senderBytes: statsA.metrics.sentBytes,
    receiverInvalidFrames: (statsBeforeRestart.metrics.invalidFrames ?? 0) + (statsBeforeFinalRestart.metrics.invalidFrames ?? 0)
      + (statsB.metrics.invalidFrames ?? 0),
    journalBytes: fs.statSync(journalB).size, privateMaterialTransferred: false,
    scope: 'Actual TINP DATA framing over TLS 1.3 loopback with a durable public-state chunk journal; receiver interruption, restart, duplicate replay and chunk/manifest conflicts are exercised across independent local processes and directories. This is not two physical hosts, production certificate custody, trusted time, online authority or production conflict consensus.'
  };
  console.log(JSON.stringify(output));
} finally {
  for (const worker of workers.reverse()) await stop(worker);
  removeTlsLoopbackCertificates(certificates);
  fs.rmSync(baseDirectory, { recursive: true, force: true });
}
