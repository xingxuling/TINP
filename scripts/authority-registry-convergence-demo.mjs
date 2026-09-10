import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle, verifyAuthorityRegistryConvergence } from '../src/authority-registry-convergence.mjs';

const issuerUrl = new URL('../tests/authority-registry-signer.mjs', import.meta.url);
const mirrorUrl = new URL('../tests/authority-registry-distribution-signer.mjs', import.meta.url);
let issuer;
const mirrors = [];
let callId = 0;

function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

function ready(child, event, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), 10000);
    const handler = message => {
      if (message.event !== event) return;
      clearTimeout(timer); child.off('message', handler); resolve(message);
    };
    child.on('message', handler);
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function sign(child, body) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error('convergence signing timeout')); }, 10000);
    const handler = message => {
      if (message.callId !== id) return;
      clearTimeout(timer); child.off('message', handler);
      message.error ? reject(new Error(message.error)) : resolve(message.receipt ?? message.registry);
    };
    child.on('message', handler); child.send({ command: 'sign', callId: id, body });
  });
}

try {
  issuer = fork(fileURLToPath(issuerUrl), ['issuer'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true });
  const issuerReady = await ready(issuer, 'issuer-ready', 'convergence issuer timeout');
  const now = Date.now();
  const issuerKeyring = { [issuerReady.issuerId]: { publicKeyPem: issuerReady.publicKeyPem, revoked: false } };
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-demo',
    issuerId: issuerReady.issuerId, publicKeyPem: issuerReady.publicKeyPem });
  const member = newIdentity();
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = await sign(issuer, makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 60 * 60 * 1000, entries }));
  const registry2 = await sign(issuer, makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 60 * 60 * 1000, entries }));
  for (const mirrorId of ['mirror:alpha', 'mirror:beta', 'mirror:gamma']) {
    const child = fork(fileURLToPath(mirrorUrl), ['mirror', mirrorId], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
    });
    mirrors.push(child); child.ready = await ready(child, 'mirror-ready', `convergence ${mirrorId} timeout`);
  }
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-convergence-demo', registryId: registryPolicy.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(child => ({ mirrorId: child.ready.mirrorId,
      publicKeySha256: publicKeyFingerprint(child.ready.publicKeyPem) })),
  });
  const mirrorKeyring = Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
    { publicKeyPem: child.ready.publicKeyPem, revoked: false }]));
  const buildBundle = async (registry, issuedAtMs, selected = mirrors) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry, receipts: await Promise.all(selected.map(async child => sign(child,
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry, mirrorId: child.ready.mirrorId,
        mirrorKeySha256: publicKeyFingerprint(child.ready.publicKeyPem), issuedAtMs,
        expiresAtMs: now + 30 * 60 * 1000 })) )) });
  const bundle1 = await buildBundle(registry1, now - 1500);
  const bundle2 = await buildBundle(registry2, now - 800);
  const history = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle2, bundle1] });
  const verification = verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle: history,
    registryPolicy, issuerKeyring, mirrorKeyring, nowMs: now });

  const forkRegistry = await sign(issuer, makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 900, expiresAtMs: now + 60 * 60 * 1000, entries }));
  const forkBundle = await buildBundle(forkRegistry, now - 700);
  const forkHistory = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, bundle2, forkBundle] });
  let forkCode = null;
  try { verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle: forkHistory,
    registryPolicy, issuerKeyring, mirrorKeyring, nowMs: now }); }
  catch (error) { forkCode = error.code ?? error.message; }

  const partial = await buildBundle(registry2, now - 800, mirrors.slice(0, 2));
  const driftHistory = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [bundle1, partial] });
  let driftCode = null;
  try { verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle: driftHistory,
    registryPolicy, issuerKeyring, mirrorKeyring, nowMs: now }); }
  catch (error) { driftCode = error.code ?? error.message; }

  console.log(JSON.stringify({
    format: 'twni.authority-registry-convergence-demo.v1',
    status: 'VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE',
    issuerPid: issuerReady.pid, mirrorPids: mirrors.map(child => child.ready.pid),
    firstSequence: verification.firstSequence, lastSequence: verification.lastSequence,
    registryRoots: verification.snapshots.map(snapshot => snapshot.registryRoot),
    historyRoot: verification.historyRoot, stableMirrors: verification.stableMirrors,
    forkDetected: forkCode === 'AUTHORITY_REGISTRY_CONVERGENCE_FORK_DETECTED', forkRejectionCode: forkCode,
    mirrorSetDrift: driftCode === 'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT', mirrorSetDriftCode: driftCode,
    keyMaterialPersisted: false,
    scope: 'Independent issuer and mirror child processes; contiguous offline registry history with per-snapshot quorum; no online transparency log, trusted clock or durable cross-host convergence.',
  }, null, 2));
} finally {
  await Promise.all([stop(issuer), ...mirrors.map(stop)]);
}
