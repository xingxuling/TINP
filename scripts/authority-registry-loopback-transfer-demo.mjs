import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity, rootHash } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { createTlsLoopbackCertificates, removeTlsLoopbackCertificates } from '../tests/tls-loopback-certificates.mjs';

const workerUrl = new URL('../tests/authority-registry-loopback-transfer-worker.mjs', import.meta.url);
let callId = 0;
const workers = [];

function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => resolve();
    child.once('exit', done);
    child.kill();
  });
}

function ready(child, event, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(timeoutMessage)); }, 10000);
    const handler = message => {
      if (message?.event !== event) return;
      clearTimeout(timer); child.off('message', handler); resolve(message);
    };
    child.on('message', handler);
    child.once('error', error => { clearTimeout(timer); child.off('message', handler); reject(error); });
  });
}

function rpc(child, command, payload = {}) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('message', handler); reject(new Error(`loopback transfer ${command} timeout`));
    }, 30000);
    const handler = message => {
      if (message?.callId !== id) return;
      clearTimeout(timer); child.off('message', handler);
      if (message.error) {
        const error = new Error(message.error.code ?? message.error);
        error.code = message.error.code ?? message.error;
        reject(error);
      } else resolve(message.result);
    };
    child.on('message', handler);
    child.send({ ...payload, command, callId: id });
  });
}

function fixture() {
  const issuer = newIdentity();
  const member = newIdentity();
  const mirrors = ['mirror:alpha', 'mirror:beta', 'mirror:gamma'].map(mirrorId => ({ mirrorId, ...newIdentity() }));
  const now = Date.now();
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-loopback-transfer-demo',
    issuerId: 'registry:issuer-loopback-transfer-demo', publicKeyPem: issuer.publicKey });
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 3000 })];
  const makeBody = (sequence, previousRegistryRoot, issuedAtMs) => makeAuthorityRegistryBody({
    policy: registryPolicy, sequence, previousRegistryRoot, issuedAtMs,
    expiresAtMs: now + 60 * 60 * 1000, entries,
  });
  const registry1 = signAuthorityRegistry(makeBody(1, undefined, now - 2500), issuer.privateKey);
  const registry2 = signAuthorityRegistry(makeBody(2, registry1.root, now - 2000), issuer.privateKey);
  const registry3 = signAuthorityRegistry(makeBody(3, registry2.root, now - 1500), issuer.privateKey);
  const registry4 = signAuthorityRegistry(makeBody(4, registry3.root, now - 1000), issuer.privateKey);
  const alternateRegistry2 = signAuthorityRegistry(makeBody(2, registry1.root, now - 1900), issuer.privateKey);
  const alternateRegistry3 = signAuthorityRegistry(makeBody(3, alternateRegistry2.root, now - 1400), issuer.privateKey);
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-loopback-transfer-demo', registryId: registryPolicy.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(mirror => ({ mirrorId: mirror.mirrorId, publicKeySha256: publicKeyFingerprint(mirror.publicKey) })),
  });
  const makeBundle = (registry, issuedAtMs, selected = mirrors) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry, receipts: selected.map(mirror => signAuthorityRegistryDistributionReceipt(
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: mirror.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(mirror.publicKey), issuedAtMs,
        expiresAtMs: now + 30 * 60 * 1000 }), mirror.privateKey)),
  });
  const bundle1 = makeBundle(registry1, now - 2300);
  const bundle2 = makeBundle(registry2, now - 1800);
  const bundle3 = makeBundle(registry3, now - 1300);
  const bundle4 = makeBundle(registry4, now - 800);
  const alternateBundle2 = makeBundle(alternateRegistry2, now - 1700);
  const alternateBundle3 = makeBundle(alternateRegistry3, now - 1200);
  const driftBundle3 = makeBundle(registry3, now - 1250, mirrors.slice(1));
  const history1 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1] });
  const history2 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2] });
  const history3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2, bundle3] });
  const forkHistory3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, alternateBundle2, alternateBundle3] });
  const driftHistory3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, bundle2, driftBundle3] });
  const gapHistory = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, bundle2, bundle4] });
  const context = { distributionPolicy, registryPolicy,
    issuerKeyring: { [registryPolicy.issuerId]: { publicKeyPem: issuer.publicKey, revoked: false } },
    mirrorKeyring: Object.fromEntries(mirrors.map(mirror => [mirror.mirrorId,
      { publicKeyPem: mirror.publicKey, revoked: false }])), nowMs: now };
  return { now, context, history1, history2, history3, forkHistory3, driftHistory3, gapHistory };
}

async function startWorker(id, file, context, { kind = 'tcp', tls = null } = {}) {
  const child = fork(fileURLToPath(workerUrl), [id], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
  });
  workers.push(child);
  await ready(child, 'worker-ready', `${id} loopback worker timeout`);
  const initialized = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(`${id} initialization timeout`)); }, 10000);
    const handler = message => {
      if (message?.event !== 'initialized') return;
      clearTimeout(timer); child.off('message', handler); resolve(message);
    };
    child.on('message', handler);
    child.send({ command: 'init', callId: ++callId, nodeId: id, file, context, kind, tls });
  });
  return { id, child, file, ...initialized };
}

function privateMaterialPresent(value) {
  return /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(JSON.stringify(value));
}

const f = fixture();
const transportKind = process.env.TINP_LOOPBACK_TRANSPORT ?? 'tcp';
if (!['tcp', 'tls'].includes(transportKind)) throw new Error('AUTHORITY_REGISTRY_LOOPBACK_TRANSPORT_UNSUPPORTED');
const baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-loopback-transfer-'));
const directoryA = path.join(baseDirectory, 'node-a');
const directoryB = path.join(baseDirectory, 'node-b');
fs.mkdirSync(directoryA); fs.mkdirSync(directoryB);
const tlsBundle = transportKind === 'tls' ? createTlsLoopbackCertificates(baseDirectory) : null;
const hostA = await startWorker('authority-node-a', path.join(directoryA, 'history.json'), f.context,
  { kind: transportKind, tls: tlsBundle?.certificates.a ?? null });
const hostB = await startWorker('authority-node-b', path.join(directoryB, 'history.json'), f.context,
  { kind: transportKind, tls: tlsBundle?.certificates.b ?? null });

try {
  await rpc(hostA.child, 'configure-peers', { peers: { [hostB.id]: { endpoint: hostB.endpoint, publicKey: hostB.publicKey } } });
  await rpc(hostB.child, 'configure-peers', { peers: { [hostA.id]: { endpoint: hostA.endpoint, publicKey: hostA.publicKey } } });
  if (privateMaterialPresent(f.context)) throw new Error('AUTHORITY_REGISTRY_LOOPBACK_CONTEXT_PRIVATE_MATERIAL');

  const aFirst = await rpc(hostA.child, 'append', { convergenceBundle: f.history1, nowMs: f.now, updatedAtMs: f.now });
  const aExtended = await rpc(hostA.child, 'append', { convergenceBundle: f.history2, nowMs: f.now + 1, updatedAtMs: f.now + 1 });
  const aBefore = await rpc(hostA.child, 'stats');
  const bBefore = await rpc(hostB.child, 'stats');
  const aToB = await rpc(hostA.child, 'transfer', { peerId: hostB.id, nowMs: f.now + 2, timeoutMs: 20000 });
  const bImported = await rpc(hostB.child, 'verify', { nowMs: f.now + 3 });
  const bReplay = await rpc(hostA.child, 'transfer', { peerId: hostB.id, nowMs: f.now + 4, timeoutMs: 20000 });
  const bExtended = await rpc(hostB.child, 'append', { convergenceBundle: f.history3, nowMs: f.now + 5, updatedAtMs: f.now + 5 });
  const bToA = await rpc(hostB.child, 'transfer', { peerId: hostA.id, nowMs: f.now + 6, timeoutMs: 20000 });
  const aAfterSync = await rpc(hostA.child, 'verify', { nowMs: f.now + 7 });
  const aAfter = await rpc(hostA.child, 'stats');
  const bAfter = await rpc(hostB.child, 'stats');

  const beforeConflict = fs.readFileSync(hostA.file);
  let forkCode = null;
  try { await rpc(hostA.child, 'append', { convergenceBundle: f.forkHistory3, nowMs: f.now + 8, updatedAtMs: f.now + 8 }); }
  catch (error) { forkCode = error.code ?? error.message; }
  const afterConflict = fs.readFileSync(hostA.file);
  let driftCode = null;
  try { await rpc(hostB.child, 'append', { convergenceBundle: f.driftHistory3, nowMs: f.now + 9, updatedAtMs: f.now + 9 }); }
  catch (error) { driftCode = error.code ?? error.message; }
  let gapCode = null;
  try { await rpc(hostB.child, 'append', { convergenceBundle: f.gapHistory, nowMs: f.now + 10, updatedAtMs: f.now + 10 }); }
  catch (error) { gapCode = error.code ?? error.message; }
  const beforeTamper = fs.readFileSync(hostB.file);
  let tamperCode = null;
  try { await rpc(hostA.child, 'transfer', { peerId: hostB.id, nowMs: f.now + 11, mutate: 'historyRoot', timeoutMs: 20000 }); }
  catch (error) { tamperCode = error.code ?? error.message; }
  const afterTamper = fs.readFileSync(hostB.file);
  const bAfterReject = await rpc(hostB.child, 'verify', { nowMs: f.now + 12 });
  const output = {
    format: 'twni.authority-registry-loopback-transfer-demo.v1',
    status: transportKind === 'tls' ? 'VERIFIED_LOCAL_TINP_TLS_LOOPBACK_STATE_TRANSFER' : 'VERIFIED_LOCAL_TINP_LOOPBACK_STATE_TRANSFER',
    transport: transportKind,
    frameType: 'DATA',
    encryptedTransport: transportKind === 'tls',
    independentProcesses: hostA.pid !== hostB.pid,
    independentDirectories: path.dirname(hostA.file) !== path.dirname(hostB.file),
    firstOperation: aFirst.status,
    localExtensionOperation: aExtended.status,
    networkTransferOperation: aToB.status,
    importedOnSecondNode: bImported.lastSequence === 2,
    networkReplayOperation: bReplay.status,
    secondNodeExtension: bExtended.status,
    reverseNetworkTransferOperation: bToA.status,
    firstSequence: aAfterSync.firstSequence,
    lastSequence: aAfterSync.lastSequence,
    historyRoot: aAfterSync.historyRoot,
    senderFrames: aAfter.metrics.sentFrames,
    receiverFrames: bAfter.metrics.receivedFrames,
    senderBytes: aAfter.metrics.sentBytes,
    receiverInvalidFrames: bAfter.metrics.invalidFrames,
    tlsVersion: transportKind === 'tls' ? aAfter.metrics.tlsVersion : null,
    tlsCipher: transportKind === 'tls' ? aAfter.metrics.tlsCipher : null,
    tlsHandshakes: transportKind === 'tls' ? aAfter.metrics.secureConnections + bAfter.metrics.secureConnections : 0,
    peerCertificatePinned: transportKind === 'tls'
      ? Boolean(hostA.endpoint.tls?.ca && hostB.endpoint.tls?.ca
        && hostA.endpoint.tls.servername === hostB.endpoint.tls.servername)
      : false,
    peerAuthenticationConfigured: aAfter.peerIds.includes(hostB.id) && bAfter.peerIds.includes(hostA.id),
    forkDetected: forkCode === 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH',
    forkRejectionCode: forkCode,
    mirrorSetDriftDetected: driftCode === 'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT',
    mirrorSetDriftRejectionCode: driftCode,
    sequenceGapDetected: gapCode === 'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP',
    sequenceGapRejectionCode: gapCode,
    tamperedTransferDetected: tamperCode === 'AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID',
    tamperedTransferRejectionCode: tamperCode,
    rejectedStateRetained: Buffer.compare(beforeConflict, afterConflict) === 0
      && Buffer.compare(beforeTamper, afterTamper) === 0
      && bAfterReject.historyRoot === aAfterSync.historyRoot && bAfterReject.lastSequence === 3,
    privateMaterialTransferred: privateMaterialPresent(f.context) || privateMaterialPresent(aToB) || privateMaterialPresent(bToA),
    scope: transportKind === 'tls'
      ? 'Actual TINP DATA framing over TLS 1.3 loopback between two independent local Node child processes and directories; peer certificates are caller-pinned and public convergence-store state is imported through the existing append validators. This is a local socket stress harness, not two physical hosts, production certificate custody, trusted time, online authority or production conflict consensus.'
      : 'Actual TINP DATA framing over TCP loopback between two independent local Node child processes and directories; public convergence-store state is imported through the existing append validators. This is a local socket stress harness, not two physical hosts, encrypted transport, trusted time, online authority or production conflict consensus.',
  };
  if (!output.independentProcesses || !output.independentDirectories || output.firstOperation !== 'appended'
    || output.localExtensionOperation !== 'extended' || output.networkTransferOperation !== 'appended'
    || !output.importedOnSecondNode || output.networkReplayOperation !== 'unchanged'
    || output.secondNodeExtension !== 'extended' || output.reverseNetworkTransferOperation !== 'extended'
    || output.lastSequence !== 3 || output.senderFrames < 2 || output.receiverFrames < 2
    || output.senderBytes <= 0 || output.receiverInvalidFrames !== 0 || !output.peerAuthenticationConfigured
    || !output.forkDetected || !output.mirrorSetDriftDetected || !output.sequenceGapDetected
    || !output.tamperedTransferDetected || !output.rejectedStateRetained || output.privateMaterialTransferred) {
    throw new Error(`AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_ASSERTION_FAILED:${JSON.stringify(output)}`);
  }
  if (transportKind === 'tls' && (!output.encryptedTransport || output.tlsVersion !== 'TLSv1.3'
    || !output.tlsCipher || output.tlsHandshakes < 2 || !output.peerCertificatePinned)) {
    throw new Error(`AUTHORITY_REGISTRY_TLS_LOOPBACK_ASSERTION_FAILED:${JSON.stringify(output)}`);
  }
  console.log(JSON.stringify(output, null, 2));
} finally {
  await Promise.all(workers.map(stop));
  removeTlsLoopbackCertificates(tlsBundle);
  fs.rmSync(baseDirectory, { recursive: true, force: true });
}
