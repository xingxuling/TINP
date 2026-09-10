import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { AuthorityRegistryConvergenceStore } from '../src/authority-registry-convergence-store.mjs';

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
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error('convergence store signing timeout')); }, 10000);
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
  const issuerReady = await ready(issuer, 'issuer-ready', 'convergence store issuer timeout');
  const now = Date.now();
  const issuerKeyring = { [issuerReady.issuerId]: { publicKeyPem: issuerReady.publicKeyPem, revoked: false } };
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-store-demo',
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
    mirrors.push(child); child.ready = await ready(child, 'mirror-ready', `convergence store ${mirrorId} timeout`);
  }
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-convergence-store-demo', registryId: registryPolicy.registryId,
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
  const history1 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1] });
  const history2 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2] });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-store-'));
  const store = new AuthorityRegistryConvergenceStore(path.join(directory, 'history.json'));
  const context = { distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring, nowMs: now };
  const first = await store.append({ ...context, convergenceBundle: history1, updatedAtMs: now });
  const extended = await store.append({ ...context, convergenceBundle: history2, updatedAtMs: now + 1 });
  const replay = await store.append({ ...context, convergenceBundle: history2, updatedAtMs: now + 2 });
  const verification = store.verify(context);
  let rollbackCode = null;
  try { await store.append({ ...context, convergenceBundle: history1, updatedAtMs: now + 3 }); }
  catch (error) { rollbackCode = error.code ?? error.message; }
  const alternateBundle1 = await buildBundle(registry1, now - 1200);
  const rewritten = makeAuthorityRegistryConvergenceBundle({ distributionPolicy,
    bundles: [alternateBundle1, bundle2] });
  let prefixRewriteCode = null;
  try { await store.append({ ...context, convergenceBundle: rewritten, updatedAtMs: now + 4 }); }
  catch (error) { prefixRewriteCode = error.code ?? error.message; }
  const storeBytes = fs.readFileSync(store.file).length;
  console.log(JSON.stringify({
    format: 'twni.authority-registry-convergence-store-demo.v1',
    status: 'VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE_STORE',
    firstOperation: first.status, extensionOperation: extended.status, replayOperation: replay.status,
    firstSequence: verification.firstSequence, lastSequence: verification.lastSequence,
    historyRoot: verification.historyRoot, stableMirrors: verification.stableMirrors,
    storeWritten: store.exists && storeBytes > 0, storeBytes,
    rollbackDetected: rollbackCode === 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_ROLLBACK', rollbackRejectionCode: rollbackCode,
    prefixRewriteDetected: prefixRewriteCode === 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH', prefixRewriteRejectionCode: prefixRewriteCode,
    keyMaterialPersisted: false,
    scope: 'Explicit local atomic store append with directory writer lease; finite caller-supplied history only, no online transparency log, trusted clock or durable cross-host consensus.',
  }, null, 2));
  fs.rmSync(directory, { recursive: true, force: true });
} finally {
  await Promise.all([stop(issuer), ...mirrors.map(stop)]);
}
