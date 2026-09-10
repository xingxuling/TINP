import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';
import { makeAuthorityRegistryDistributionBundle, makeAuthorityRegistryDistributionPolicy,
  makeAuthorityRegistryDistributionReceiptBody, signAuthorityRegistryDistributionReceipt,
  verifyAuthorityRegistryDistribution } from '../src/authority-registry-distribution.mjs';

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
    const timer = setTimeout(() => { child.off('message', handler); reject(new Error('distribution signing timeout')); }, 10000);
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
  const issuerReady = await ready(issuer, 'issuer-ready', 'authority registry issuer timeout');
  const now = Date.now();
  const issuerKeyring = { [issuerReady.issuerId]: { publicKeyPem: issuerReady.publicKeyPem, revoked: false } };
  const policy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-distribution-demo',
    issuerId: issuerReady.issuerId, publicKeyPem: issuerReady.publicKeyPem });
  const member = newIdentity();
  const registryBody = makeAuthorityRegistryBody({ policy, sequence: 1, issuedAtMs: now - 1000,
    expiresAtMs: now + 60 * 60 * 1000, entries: [makeAuthorityRegistryEntry({
      authorityId: 'operator-owner', signerId: 'operator:owner-v1', roles: ['operator'],
      publicKeySha256: publicKeyFingerprint(member.publicKey), notBeforeMs: now - 1000,
    })] });
  const registry = await sign(issuer, registryBody);

  for (const mirrorId of ['mirror:alpha', 'mirror:beta', 'mirror:gamma']) {
    const child = fork(fileURLToPath(mirrorUrl), ['mirror', mirrorId], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true,
    });
    mirrors.push(child);
    child.ready = await ready(child, 'mirror-ready', `mirror ${mirrorId} timeout`);
  }
  const distributionPolicy = makeAuthorityRegistryDistributionPolicy({
    distributionId: 'tinp:authority-registry-distribution-demo', registryId: registry.body.registryId,
    registryPolicyRoot: policy.policyRoot, threshold: 2,
    mirrors: mirrors.map(child => ({ mirrorId: child.ready.mirrorId,
      publicKeySha256: publicKeyFingerprint(child.ready.publicKeyPem) })),
  });
  const receipts = [];
  for (const child of mirrors) {
    const body = makeAuthorityRegistryDistributionReceiptBody({ distributionPolicy, registry,
      mirrorId: child.ready.mirrorId, mirrorKeySha256: publicKeyFingerprint(child.ready.publicKeyPem),
      issuedAtMs: now - 500, expiresAtMs: now + 30 * 60 * 1000 });
    receipts.push(await sign(child, body));
  }
  const bundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts });
  const verification = verifyAuthorityRegistryDistribution({ distributionPolicy, bundle,
    registryPolicy: policy, issuerKeyring, mirrorKeyring: Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
      { publicKeyPem: child.ready.publicKeyPem, revoked: false }])), nowMs: now });

  const forkBody = { ...receipts[0].body, registryRoot: 'f'.repeat(64) };
  const forkReceipt = await sign(mirrors[0], forkBody);
  const forkBundle = makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry,
    receipts: [forkReceipt, receipts[1]] });
  let forkCode = null;
  try {
    verifyAuthorityRegistryDistribution({ distributionPolicy, bundle: forkBundle, registryPolicy: policy,
      issuerKeyring, mirrorKeyring: Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
        { publicKeyPem: child.ready.publicKeyPem, revoked: false }])), nowMs: now });
  } catch (error) { forkCode = error.code ?? error.message; }

  const insufficient = makeAuthorityRegistryDistributionBundle({ distributionPolicy, registry, receipts: [receipts[0]] });
  let insufficientCode = null;
  try {
    verifyAuthorityRegistryDistribution({ distributionPolicy, bundle: insufficient, registryPolicy: policy,
      issuerKeyring, mirrorKeyring: Object.fromEntries(mirrors.map(child => [child.ready.mirrorId,
        { publicKeyPem: child.ready.publicKeyPem, revoked: false }])), nowMs: now });
  } catch (error) { insufficientCode = error.code ?? error.message; }

  console.log(JSON.stringify({
    format: 'twni.authority-registry-distribution-demo.v1',
    status: 'VERIFIED_LOCAL_OFFLINE_DISTRIBUTION_QUORUM',
    issuerPid: issuerReady.pid, mirrorPids: mirrors.map(child => child.ready.pid),
    registryRoot: registry.root, sequence: registry.body.sequence,
    distributionPolicyRoot: distributionPolicy.policyRoot, threshold: distributionPolicy.threshold,
    acceptedMirrors: verification.acceptedMirrors, forkDetected: forkCode === 'AUTHORITY_REGISTRY_DISTRIBUTION_FORK_DETECTED',
    forkRejectionCode: forkCode, insufficientQuorum: insufficientCode === 'AUTHORITY_REGISTRY_DISTRIBUTION_QUORUM_INSUFFICIENT',
    insufficientQuorumCode: insufficientCode, keyMaterialPersisted: false,
    scope: 'Independent issuer and mirror child processes; signed offline receipts over one registry root; no online publication, trusted clock, transparent log or cross-device convergence.',
  }, null, 2));
} finally {
  await Promise.all([stop(issuer), ...mirrors.map(stop)]);
}
