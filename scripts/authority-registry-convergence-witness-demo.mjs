import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody } from '../src/authority-registry-distribution.mjs';
import { makeAuthorityRegistryConvergenceBundle } from '../src/authority-registry-convergence.mjs';
import { AuthorityRegistryConvergenceStore } from '../src/authority-registry-convergence-store.mjs';
import { authorityRegistryConvergenceWitnessBodyForStore, makeAuthorityRegistryConvergenceWitnessPolicy,
  verifyAuthorityRegistryConvergenceWitness } from '../src/authority-registry-convergence-witness.mjs';

const issuerUrl = new URL('../tests/authority-registry-signer.mjs', import.meta.url);
const mirrorUrl = new URL('../tests/authority-registry-distribution-signer.mjs', import.meta.url);
const witnessUrl = new URL('../tests/authority-registry-convergence-witness-signer.mjs', import.meta.url);
let issuer;
let witness;
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

function sign(child, body, timeoutMessage) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error(timeoutMessage)); }, 10000);
    const handler = message => {
      if (message.callId !== id) return;
      clearTimeout(timer); child.off('message', handler);
      message.error ? reject(new Error(message.error)) : resolve(message.registry ?? message.receipt ?? message.witness);
    };
    child.on('message', handler); child.send({ command: 'sign', callId: id, body });
  });
}

function witnessVerify({ policy, witness, keyring, state, context, savedWitness = null, nowMs }) {
  return verifyAuthorityRegistryConvergenceWitness({ policy, witness, keyring, state, savedWitness,
    ...context, nowMs });
}

try {
  issuer = fork(fileURLToPath(issuerUrl), ['issuer'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true });
  const issuerReady = await ready(issuer, 'issuer-ready', 'convergence witness issuer timeout');
  witness = fork(fileURLToPath(witnessUrl), ['witness'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true });
  const witnessReady = await ready(witness, 'witness-ready', 'convergence witness signer timeout');
  const now = Date.now();
  const issuerKeyring = { [issuerReady.issuerId]: { publicKeyPem: issuerReady.publicKeyPem, revoked: false } };
  const registryPolicy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-convergence-witness-demo',
    issuerId: issuerReady.issuerId, publicKeyPem: issuerReady.publicKeyPem });
  const member = newIdentity();
  const entries = [makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1',
    roles: ['operator'], publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 2000 })];
  const registry1 = await sign(issuer, makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 1,
    issuedAtMs: now - 2000, expiresAtMs: now + 60 * 60 * 1000, entries }), 'convergence witness issuer signing timeout');
  const registry2 = await sign(issuer, makeAuthorityRegistryBody({ policy: registryPolicy, sequence: 2,
    previousRegistryRoot: registry1.root, issuedAtMs: now - 1000, expiresAtMs: now + 60 * 60 * 1000, entries }), 'convergence witness issuer signing timeout');
  for (const mirrorId of ['mirror:alpha', 'mirror:beta', 'mirror:gamma']) {
    const child = fork(fileURLToPath(mirrorUrl), ['mirror', mirrorId], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
    });
    mirrors.push(child); child.ready = await ready(child, 'mirror-ready', `convergence witness ${mirrorId} timeout`);
  }
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:convergence-witness-demo', registryId: registryPolicy.registryId,
    registryPolicyRoot: registryPolicy.policyRoot, threshold: 2,
    mirrors: mirrors.map(child => ({ mirrorId: child.ready.mirrorId,
      publicKeySha256: publicKeyFingerprint(child.ready.publicKeyPem) })),
  });
  const mirrorKeyring = Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
    { publicKeyPem: child.ready.publicKeyPem, revoked: false }]));
  const buildBundle = async (registry, issuedAtMs) => makeAuthorityRegistryDistributionBundle({
    distributionPolicy, registry,
    receipts: await Promise.all(mirrors.slice(0, 2).map(child => sign(child,
      makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry,
        mirrorId: child.ready.mirrorId, mirrorKeySha256: publicKeyFingerprint(child.ready.publicKeyPem),
        issuedAtMs, expiresAtMs: now + 30 * 60 * 1000 }), 'convergence witness mirror signing timeout'))),
  });
  const bundle1 = await buildBundle(registry1, now - 1500);
  const bundle2 = await buildBundle(registry2, now - 800);
  const history1 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1] });
  const history2 = makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles: [bundle1, bundle2] });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-authority-registry-convergence-witness-'));
  try {
    const store = new AuthorityRegistryConvergenceStore(path.join(directory, 'history.json'));
    const context = { distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring };
    const first = await store.append({ ...context, convergenceBundle: history1, nowMs: now, updatedAtMs: now });
    const extended = await store.append({ ...context, convergenceBundle: history2, nowMs: now + 1, updatedAtMs: now + 1 });
    const stateOne = first.state;
    const stateTwo = extended.state;
    const witnessPolicy = makeAuthorityRegistryConvergenceWitnessPolicy({ signerId: witnessReady.signerId,
      publicKeyPem: witnessReady.publicKeyPem });
    const witnessKeyring = { [witnessReady.signerId]: { publicKeyPem: witnessReady.publicKeyPem, revoked: false } };
    const firstWitness = await sign(witness, authorityRegistryConvergenceWitnessBodyForStore({ policy: witnessPolicy,
      sequence: 1, state: stateOne, issuedAtMs: now }), 'convergence witness signing timeout');
    const firstVerification = witnessVerify({ policy: witnessPolicy, witness: firstWitness, keyring: witnessKeyring,
      state: stateOne, context, nowMs: now });
    const secondWitness = await sign(witness, authorityRegistryConvergenceWitnessBodyForStore({ policy: witnessPolicy,
      sequence: 2, previousWitnessRoot: firstWitness.root, state: stateTwo, issuedAtMs: now + 1 }), 'convergence witness signing timeout');
    const secondVerification = witnessVerify({ policy: witnessPolicy, witness: secondWitness, keyring: witnessKeyring,
      state: stateTwo, context, savedWitness: firstWitness, nowMs: now + 1 });

    let replacementStoreCode = null;
    try { witnessVerify({ policy: witnessPolicy, witness: firstWitness, keyring: witnessKeyring,
      state: stateTwo, context, nowMs: now + 1 }); }
    catch (error) { replacementStoreCode = error.code ?? error.message; }
    const replacementWitness = await sign(witness, authorityRegistryConvergenceWitnessBodyForStore({ policy: witnessPolicy,
      sequence: 2, previousWitnessRoot: firstWitness.root, state: stateTwo, issuedAtMs: now + 2 }), 'convergence witness signing timeout');
    let replacementWitnessCode = null;
    try { witnessVerify({ policy: witnessPolicy, witness: replacementWitness, keyring: witnessKeyring,
      state: stateTwo, context, savedWitness: secondWitness, nowMs: now + 2 }); }
    catch (error) { replacementWitnessCode = error.code ?? error.message; }
    let rollbackCode = null;
    try { witnessVerify({ policy: witnessPolicy, witness: firstWitness, keyring: witnessKeyring,
      state: stateOne, context, savedWitness: secondWitness, nowMs: now }); }
    catch (error) { rollbackCode = error.code ?? error.message; }
    const storeBytes = fs.readFileSync(store.file).length;
    console.log(JSON.stringify({
      format: 'twni.authority-registry-convergence-witness-demo.v1',
      status: 'VERIFIED_LOCAL_AUTHORITY_REGISTRY_CONVERGENCE_WITNESS',
      firstVerification: firstVerification.sequence === 1 && firstVerification.storeStateRoot === firstWitness.body.storeStateRoot,
      extensionVerification: secondVerification.sequence === 2 && secondVerification.storeStateRoot === secondWitness.body.storeStateRoot,
      firstSequence: secondVerification.firstSequence, lastSequence: secondVerification.lastSequence,
      historyRoot: secondVerification.historyRoot, firstWitnessRoot: firstWitness.root, secondWitnessRoot: secondWitness.root,
      replacementStoreDetected: replacementStoreCode === 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_STORE_MISMATCH',
      replacementStoreRejectionCode: replacementStoreCode,
      replacementWitnessDetected: replacementWitnessCode === 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_REPLACED',
      replacementWitnessRejectionCode: replacementWitnessCode,
      rollbackDetected: rollbackCode === 'AUTHORITY_REGISTRY_CONVERGENCE_WITNESS_SEQUENCE_ROLLBACK',
      rollbackRejectionCode: rollbackCode,
      storeWritten: store.exists && storeBytes > 0, storeBytes, keyMaterialPersisted: false,
      scope: 'Independent external signer binds the exact local convergence-store state and contiguous witness sequence; witness retention is caller supplied, with no online transparency log, trusted clock or durable cross-host consensus.',
    }, null, 2));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
} finally {
  await Promise.all([stop(issuer), stop(witness), ...mirrors.map(stop)]);
}
