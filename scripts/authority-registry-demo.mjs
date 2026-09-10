import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, signAuthorityRegistry, verifyAuthorityRegistry, keyringFromAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';

const signerUrl = new URL('../tests/authority-registry-signer.mjs', import.meta.url);
let signer;
let callId = 0;

function kill(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

function ready() {
  signer = fork(fileURLToPath(signerUrl), ['issuer'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('authority registry issuer timeout')), 10000);
    const onMessage = message => { if (message.event !== 'issuer-ready') return; clearTimeout(timer); signer.off('message', onMessage); resolve(message); };
    signer.on('message', onMessage); signer.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function sign(body) {
  const id = ++callId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signer.off('message', handler); reject(new Error('authority registry signing timeout')); }, 10000);
    const handler = message => {
      if (message.callId !== id) return;
      clearTimeout(timer); signer.off('message', handler);
      message.error ? reject(new Error(message.error)) : resolve(message.registry);
    };
    signer.on('message', handler); signer.send({ command: 'sign', callId: id, body });
  });
}

try {
  const issuer = await ready();
  const operatorV1 = newIdentity(), operatorV2 = newIdentity();
  const recoveryV1 = newIdentity(), recoveryV2 = newIdentity();
  const now = Date.now();
  const policy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-demo', issuerId: issuer.issuerId, publicKeyPem: issuer.publicKeyPem });
  const firstEntries = [
    makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', publicKeySha256: publicKeyFingerprint(operatorV1.publicKey), roles: ['operator'], notBeforeMs: now - 1000 }),
    makeAuthorityRegistryEntry({ authorityId: 'recovery-witness', signerId: 'recovery:witness-v1', publicKeySha256: publicKeyFingerprint(recoveryV1.publicKey), roles: ['recovery-witness'], notBeforeMs: now - 1000 }),
  ];
  const firstBody = makeAuthorityRegistryBody({ policy, sequence: 1, entries: firstEntries, issuedAtMs: now - 500, expiresAtMs: now + 60 * 60 * 1000 });
  const firstRegistry = await sign(firstBody);
  const issuerKeyring = { [issuer.issuerId]: { publicKeyPem: issuer.publicKeyPem, revoked: false } };
  const memberKeyring = {
    'operator:owner-v1': { publicKeyPem: operatorV1.publicKey, revoked: false },
    'operator:owner-v2': { publicKeyPem: operatorV2.publicKey, revoked: false },
    'recovery:witness-v1': { publicKeyPem: recoveryV1.publicKey, revoked: false },
    'recovery:witness-v2': { publicKeyPem: recoveryV2.publicKey, revoked: false },
  };
  verifyAuthorityRegistry({ policy, registry: firstRegistry, issuerKeyring, nowMs: now });
  keyringFromAuthorityRegistry({ registry: firstRegistry, memberKeyring, role: 'operator', nowMs: now });
  keyringFromAuthorityRegistry({ registry: firstRegistry, memberKeyring, role: 'recovery-witness', nowMs: now });

  const rotationTime = now + 1;
  const secondEntries = [
    makeAuthorityRegistryEntry({ ...firstEntries[0], status: 'revoked', revokedAtMs: rotationTime }),
    makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v2', publicKeySha256: publicKeyFingerprint(operatorV2.publicKey), roles: ['operator'], keyEpoch: 2, predecessorSignerId: 'operator:owner-v1', notBeforeMs: rotationTime }),
    makeAuthorityRegistryEntry({ ...firstEntries[1], status: 'revoked', revokedAtMs: rotationTime }),
    makeAuthorityRegistryEntry({ authorityId: 'recovery-witness', signerId: 'recovery:witness-v2', publicKeySha256: publicKeyFingerprint(recoveryV2.publicKey), roles: ['recovery-witness'], keyEpoch: 2, predecessorSignerId: 'recovery:witness-v1', notBeforeMs: rotationTime }),
  ];
  const secondBody = makeAuthorityRegistryBody({ policy, sequence: 2, previousRegistryRoot: firstRegistry.root, entries: secondEntries, issuedAtMs: rotationTime, expiresAtMs: now + 60 * 60 * 1000 });
  const secondRegistry = await sign(secondBody);
  const verification = verifyAuthorityRegistry({ policy, registry: secondRegistry, issuerKeyring, previousRegistry: firstRegistry, nowMs: rotationTime });
  const derivedRecovery = keyringFromAuthorityRegistry({ registry: secondRegistry, memberKeyring, role: 'recovery-witness', nowMs: rotationTime });
  const derivedOperator = keyringFromAuthorityRegistry({ registry: secondRegistry, memberKeyring, role: 'operator', nowMs: rotationTime });
  const oldRecovery = derivedRecovery['recovery:witness-v1'];
  const oldOperator = derivedOperator['operator:owner-v1'];
  console.log(JSON.stringify({
    format: 'twni.authority-registry-demo.v1',
    status: 'VERIFIED_LOCAL_AUTHORITY_REGISTRY_LIFECYCLE',
    issuerPid: issuer.pid,
    firstRegistryRoot: firstRegistry.root,
    secondRegistryRoot: secondRegistry.root,
    firstSequence: 1,
    secondSequence: verification.sequence,
    rotatedSigners: ['operator:owner-v1 → operator:owner-v2', 'recovery:witness-v1 → recovery:witness-v2'],
    revokedSigners: verification.revokedSigners,
    activeRecoverySigner: verification.activeSigners.find(signerId => signerId === 'recovery:witness-v2'),
    activeOperatorSigner: verification.activeSigners.find(signerId => signerId === 'operator:owner-v2'),
    oldKeyDenied: oldRecovery?.revoked === true && oldOperator?.revoked === true,
    keyMaterialPersisted: false,
    scope: 'Independent issuer process; offline signed snapshots; no online registry/trusted clock/hardware/cross-device',
  }, null, 2));
} finally {
  await kill(signer);
}
