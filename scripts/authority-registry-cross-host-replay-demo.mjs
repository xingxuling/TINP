import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';

const issuerUrl = new URL('../tests/authority-registry-signer.mjs', import.meta.url);
const mirrorUrl = new URL('../tests/authority-registry-distribution-signer.mjs', import.meta.url);
const workerUrl = new URL('../tests/authority-registry-cross-host-replay-worker.mjs', import.meta.url);
let issuer;
let callId = 0;
const mirrors = [];
const hosts = [];

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
      child.off('message', handler); reject(new Error(`cross-host replay ${command} timeout`));
    }, 10000);
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

async function sign(child, body, label) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('message', handler); reject(new Error(`${label} signing timeout`));
    }, 10000);
    const handler = message => {
      if (message?.callId !== id) return;
      clearTimeout(timer); child.off('message', handler);
      if (message.error) reject(new Error(message.error));
      else resolve(message.registry ?? message.receipt);
    };
    child.on('message', handler);
    child.send({ command: 'sign', callId: id, body });
  });
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function startHost(id, directory, context) {
  const child = fork(fileURLToPath(workerUrl), [id], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
  });
  hosts.push(child);
  await ready(child, 'worker-ready', `${id} worker timeout`);
  const file = path.join(directory, 'history.json');
  await rpc(child, 'init', { file, context });
  return { id, child, directory, file };
}

function noPrivateMaterial(value) {
  return !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(JSON.stringify(value));
}

try {
  issuer = fork(fileURLToPath(issuerUrl), ['issuer'], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
  });
  const issuerReady = await ready(issuer, 'issuer-ready', 'cross-host replay issuer timeout');
  const now = Date.now();
  const issuerKeyring = { [issuerReady.issuerId]: { publicKeyPem: issuerReady.publicKeyPem, revoked: false } };
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-cross-host-replay-demo',
    issuerId: issuerReady.issuerId, publicKeyPem: issuerReady.publicKeyPem });
  const member = newIdentity();
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 3000 })];
  const makeRegistry = (sequence, previousRegistryRoot, issuedAtMs) => makeAuthorityRegistryBody({
    policy: registryPolicy, sequence, previousRegistryRoot, issuedAtMs, expiresAtMs: now + 60 * 60 * 1000, entries,
  });
  const registry1 = await sign(issuer, makeRegistry(1, undefined, now - 2500), 'registry seq1');
  const registry2 = await sign(issuer, makeRegistry(2, registry1.root, now - 2000), 'registry seq2');
  const registry3 = await sign(issuer, makeRegistry(3, registry2.root, now - 1500), 'registry seq3');
  const registry4 = await sign(issuer, makeRegistry(4, registry3.root, now - 1000), 'registry seq4');
  const alternateRegistry2 = await sign(issuer, makeRegistry(2, registry1.root, now - 1900), 'alternate registry seq2');
  const alternateRegistry3 = await sign(issuer, makeRegistry(3, alternateRegistry2.root, now - 1400), 'alternate registry seq3');

  for (const mirrorId of ['mirror:alpha', 'mirror:beta', 'mirror:gamma']) {
    const child = fork(fileURLToPath(mirrorUrl), ['mirror', mirrorId], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
    });
    mirrors.push(child);
    child.ready = await ready(child, 'mirror-ready', `${mirrorId} signer timeout`);
  }
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-cross-host-replay-demo', registryId: registryPolicy.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(child => ({ mirrorId: child.ready.mirrorId,
      publicKeySha256: publicKeyFingerprint(child.ready.publicKeyPem) })),
  });
  const mirrorKeyring = Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
    { publicKeyPem: child.ready.publicKeyPem, revoked: false }]));
  const buildBundle = async (registry, issuedAtMs, selected = mirrors) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry,
    receipts: await Promise.all(selected.map(child => sign(child, makeAuthorityRegistryDistributionReceiptBody({
      distributionPolicy, registry, mirrorId: child.ready.mirrorId,
      mirrorKeySha256: publicKeyFingerprint(child.ready.publicKeyPem), issuedAtMs,
      expiresAtMs: now + 30 * 60 * 1000,
    }), `mirror ${child.ready.mirrorId}`))),
  });
  const bundle1 = await buildBundle(registry1, now - 2300);
  const bundle2 = await buildBundle(registry2, now - 1800);
  const bundle3 = await buildBundle(registry3, now - 1300);
  const bundle4 = await buildBundle(registry4, now - 800);
  const alternateBundle2 = await buildBundle(alternateRegistry2, now - 1700);
  const alternateBundle3 = await buildBundle(alternateRegistry3, now - 1200);
  const driftBundle3 = await buildBundle(registry3, now - 1250, mirrors.slice(1));
  const history1 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1] });
  const history2 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2] });
  const history3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2, bundle3] });
  const forkHistory3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, alternateBundle2, alternateBundle3] });
  const driftHistory3 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, bundle2, driftBundle3] });
  const gapHistory = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, bundle2, bundle4] });

  const context = { distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring };
  const inputForTransfer = { context, history1, history2, history3, forkHistory3, driftHistory3, gapHistory };
  if (!noPrivateMaterial(inputForTransfer)) throw new Error('CROSS_HOST_REPLAY_PRIVATE_MATERIAL');
  const baseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-cross-host-replay-'));
  const directoryA = path.join(baseDirectory, 'host-a');
  const directoryB = path.join(baseDirectory, 'host-b');
  fs.mkdirSync(directoryA); fs.mkdirSync(directoryB);
  const hostA = await startHost('host-a', directoryA, context);
  const hostB = await startHost('host-b', directoryB, context);
  try {
    const aFirst = await rpc(hostA.child, 'append', { convergenceBundle: history1, nowMs: now, updatedAtMs: now });
    const aExtended = await rpc(hostA.child, 'append', { convergenceBundle: history2, nowMs: now + 1, updatedAtMs: now + 1 });
    const aState = await rpc(hostA.child, 'export');
    const transferredState = JSON.parse(JSON.stringify(aState));
    await rpc(hostB.child, 'import', { state: transferredState });
    const bImported = await rpc(hostB.child, 'verify', { nowMs: now + 2 });
    const bReplay = await rpc(hostB.child, 'append', { convergenceBundle: history2, nowMs: now + 3, updatedAtMs: now + 3 });
    const bExtended = await rpc(hostB.child, 'append', { convergenceBundle: history3, nowMs: now + 4, updatedAtMs: now + 4 });
    const bState = await rpc(hostB.child, 'export');
    await rpc(hostA.child, 'import', { state: JSON.parse(JSON.stringify(bState)) });
    const aAfterSync = await rpc(hostA.child, 'verify', { nowMs: now + 5 });

    const beforeConflict = digest(hostA.file);
    let forkCode = null;
    try { await rpc(hostA.child, 'append', { convergenceBundle: forkHistory3, nowMs: now + 6, updatedAtMs: now + 6 }); }
    catch (error) { forkCode = error.code ?? error.message; }
    const afterConflict = digest(hostA.file);

    let driftCode = null;
    try { await rpc(hostB.child, 'append', { convergenceBundle: driftHistory3, nowMs: now + 7, updatedAtMs: now + 7 }); }
    catch (error) { driftCode = error.code ?? error.message; }
    let gapCode = null;
    try { await rpc(hostB.child, 'append', { convergenceBundle: gapHistory, nowMs: now + 8, updatedAtMs: now + 8 }); }
    catch (error) { gapCode = error.code ?? error.message; }
    const bAfterReject = await rpc(hostB.child, 'verify', { nowMs: now + 9 });
    const rejectedStateRetained = afterConflict === beforeConflict
      && bAfterReject.historyRoot === bState.historyRoot && bAfterReject.lastSequence === 3;
    const output = {
      format: 'twni.authority-registry-cross-host-replay-demo.v1',
      status: 'VERIFIED_LOCAL_MULTI_PROCESS_CROSS_HOST_REPLAY',
      independentProcesses: true,
      independentDirectories: true,
      hosts: [
        { id: hostA.id, pid: hostA.child.pid },
        { id: hostB.id, pid: hostB.child.pid },
      ],
      firstOperation: aFirst.status,
      extensionOperation: aExtended.status,
      importedOnSecondHost: bImported.lastSequence === 2,
      replayOperation: bReplay.status,
      secondHostExtension: bExtended.status,
      firstSequence: aAfterSync.firstSequence,
      lastSequence: aAfterSync.lastSequence,
      historyRoot: aAfterSync.historyRoot,
      forkDetected: forkCode === 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH',
      forkRejectionCode: forkCode,
      mirrorSetDriftDetected: driftCode === 'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT',
      mirrorSetDriftRejectionCode: driftCode,
      sequenceGapDetected: gapCode === 'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP',
      sequenceGapRejectionCode: gapCode,
      rejectedStateRetained,
      privateMaterialTransferred: false,
      scope: 'Two independent local Node child processes and directories exchange public convergence-store state and replay signed histories; this is a process/filesystem stress harness, not two physical hosts, online authority, trusted time or cross-host production consensus.',
    };
    if (output.firstOperation !== 'appended' || output.extensionOperation !== 'extended'
      || output.importedOnSecondHost !== true || output.replayOperation !== 'unchanged'
      || output.secondHostExtension !== 'extended' || output.forkDetected !== true
      || output.mirrorSetDriftDetected !== true || output.sequenceGapDetected !== true
      || output.rejectedStateRetained !== true) {
      throw new Error(`CROSS_HOST_REPLAY_ASSERTION_FAILED:${JSON.stringify(output)}`);
    }
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await Promise.all(hosts.map(stop));
    fs.rmSync(baseDirectory, { recursive: true, force: true });
  }
} finally {
  await Promise.all([stop(issuer), ...mirrors.map(stop)]);
}
