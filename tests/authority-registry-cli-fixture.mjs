import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy, publicKeyFingerprint } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';

const signerUrl = new URL('./authority-registry-signer.mjs', import.meta.url);
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

export async function fixtureForCli(t) {
  const child = fork(fileURLToPath(signerUrl), ['issuer'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], windowsHide: true });
  t.after(() => stop(child));
  const issuer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('issuer timeout')), 10000);
    const onMessage = message => { if (message.event !== 'issuer-ready') return; clearTimeout(timer); child.off('message', onMessage); resolve(message); };
    child.on('message', onMessage); child.once('error', reject);
  });
  const callId = 1;
  const sign = body => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sign timeout')), 10000);
    const onMessage = message => {
      if (message.callId !== callId) return;
      clearTimeout(timer); child.off('message', onMessage); message.error ? reject(new Error(message.error)) : resolve(message.registry);
    };
    child.on('message', onMessage); child.send({ command: 'sign', callId, body });
  });
  const operatorV1 = newIdentity(), recoveryV1 = newIdentity(), now = Date.now();
  const policy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-cli', issuerId: issuer.issuerId, publicKeyPem: issuer.publicKeyPem });
  const body = makeAuthorityRegistryBody({ policy, sequence: 1, issuedAtMs: now - 500, expiresAtMs: now + 3600000, entries: [
    makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', publicKeySha256: publicKeyFingerprint(operatorV1.publicKey), roles: ['operator'], notBeforeMs: now - 1000 }),
    makeAuthorityRegistryEntry({ authorityId: 'recovery-witness', signerId: 'recovery:witness-v1', publicKeySha256: publicKeyFingerprint(recoveryV1.publicKey), roles: ['recovery-witness'], notBeforeMs: now - 1000 }),
  ] });
  return { policy, registry: await sign(body), issuerKeyring: { [issuer.issuerId]: { publicKeyPem: issuer.publicKeyPem, revoked: false } },
    memberKeyring: { 'operator:owner-v1': { publicKeyPem: operatorV1.publicKey, revoked: false }, 'recovery:witness-v1': { publicKeyPem: recoveryV1.publicKey, revoked: false } }, operatorV1, now };
}
