import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAuthorityRegistryBody, makeAuthorityRegistryEntry, makeAuthorityRegistryPolicy,
  publicKeyFingerprint, keyringFromAuthorityRegistry, signAuthorityRegistry, validateAuthorityRegistry,
  validateAuthorityRegistryPolicy, verifyAuthorityRegistry } from '../src/authority-registry.mjs';
import { newIdentity } from '../src/identity.mjs';

const signerUrl = new URL('./authority-registry-signer.mjs', import.meta.url);

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

async function fixture(t) {
  const issuerChild = fork(fileURLToPath(signerUrl), ['issuer'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [], windowsHide: true });
  t.after(() => stop(issuerChild));
  const issuer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('issuer ready timeout')), 10000);
    const handler = message => { if (message.event !== 'issuer-ready') return; clearTimeout(timer); issuerChild.off('message', handler); resolve(message); };
    issuerChild.on('message', handler); issuerChild.once('error', error => { clearTimeout(timer); reject(error); });
  });
  let callId = 0;
  const sign = body => {
    const id = ++callId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { issuerChild.off('message', handler); reject(new Error('issuer sign timeout')); }, 10000);
      const handler = message => {
        if (message.callId !== id) return;
        clearTimeout(timer); issuerChild.off('message', handler);
        message.error ? reject(new Error(message.error)) : resolve(message.registry);
      };
      issuerChild.on('message', handler); issuerChild.send({ command: 'sign', callId: id, body });
    });
  };
  const operatorV1 = newIdentity(), operatorV2 = newIdentity();
  const recoveryV1 = newIdentity(), recoveryV2 = newIdentity();
  const now = Date.now();
  const policy = makeAuthorityRegistryPolicy({ registryId: 'tinp:authority-registry-test', issuerId: issuer.issuerId, publicKeyPem: issuer.publicKeyPem });
  const entries = [
    makeAuthorityRegistryEntry({ authorityId: 'operator-owner', signerId: 'operator:owner-v1', publicKeySha256: publicKeyFingerprint(operatorV1.publicKey), roles: ['operator'], notBeforeMs: now - 1000 }),
    makeAuthorityRegistryEntry({ authorityId: 'recovery-witness', signerId: 'recovery:witness-v1', publicKeySha256: publicKeyFingerprint(recoveryV1.publicKey), roles: ['recovery-witness'], notBeforeMs: now - 1000 }),
  ];
  const issuerKeyring = { [issuer.issuerId]: { publicKeyPem: issuer.publicKeyPem, revoked: false } };
  const memberKeyring = {
    'operator:owner-v1': { publicKeyPem: operatorV1.publicKey, revoked: false },
    'operator:owner-v2': { publicKeyPem: operatorV2.publicKey, revoked: false },
    'recovery:witness-v1': { publicKeyPem: recoveryV1.publicKey, revoked: false },
    'recovery:witness-v2': { publicKeyPem: recoveryV2.publicKey, revoked: false },
  };
  const body = makeAuthorityRegistryBody({ policy, sequence: 1, entries, issuedAtMs: now - 500, expiresAtMs: now + 3600000 });
  const registry = await sign(body);
  const rotate = async ({ roles = ['operator'], member = operatorV2, signerId = 'operator:owner-v2', authorityId = 'operator-owner', predecessorSignerId = 'operator:owner-v1', keyEpoch = 2, issuedAtMs = now + 1 } = {}) => {
    const rotated = makeAuthorityRegistryEntry({ authorityId, signerId, publicKeySha256: publicKeyFingerprint(member.publicKey), roles, keyEpoch, predecessorSignerId, notBeforeMs: issuedAtMs });
    const revoked = entries[0].signerId === predecessorSignerId
      ? makeAuthorityRegistryEntry({ ...entries[0], status: 'revoked', revokedAtMs: issuedAtMs })
      : makeAuthorityRegistryEntry({ ...entries[1], status: 'revoked', revokedAtMs: issuedAtMs });
    return { revoked, rotated };
  };
  return { issuer, issuerKeyring, memberKeyring, policy, body, registry, entries, sign, rotate, now, operatorV1, operatorV2, recoveryV1, recoveryV2 };
}

test('authority registry policy and snapshot are signed by an independent issuer', async t => {
  const f = await fixture(t);
  assert.equal(validateAuthorityRegistryPolicy(f.policy), true);
  assert.equal(validateAuthorityRegistry(f.registry), true);
  const verification = verifyAuthorityRegistry({ policy: f.policy, registry: f.registry, issuerKeyring: f.issuerKeyring, nowMs: f.now });
  assert.equal(verification.sequence, 1);
  assert.deepEqual(verification.activeSigners, ['operator:owner-v1', 'recovery:witness-v1']);
  const operator = keyringFromAuthorityRegistry({ registry: f.registry, memberKeyring: f.memberKeyring, role: 'operator', nowMs: f.now });
  assert.equal(operator['operator:owner-v1'].publicKeyPem, f.operatorV1.publicKey);
  assert.equal(operator['operator:owner-v1'].revoked, false);
  assert.equal(JSON.stringify(f.policy).includes('PRIVATE KEY'), false);
  assert.equal(JSON.stringify(f.registry).includes('PRIVATE KEY'), false);
  assert.equal(JSON.stringify(f.registry).includes(f.operatorV1.privateKey), false);
});

test('append-only registry rotation revokes old members and cannot escalate roles', async t => {
  const f = await fixture(t);
  const time = f.now + 1;
  const operator = await f.rotate({ issuedAtMs: time });
  const recovery = await f.rotate({ roles: ['recovery-witness'], member: f.recoveryV2, signerId: 'recovery:witness-v2', authorityId: 'recovery-witness', predecessorSignerId: 'recovery:witness-v1', issuedAtMs: time });
  const secondBody = makeAuthorityRegistryBody({ policy: f.policy, sequence: 2, previousRegistryRoot: f.registry.root,
    entries: [operator.revoked, operator.rotated, recovery.revoked, recovery.rotated], issuedAtMs: time, expiresAtMs: f.now + 3600000 });
  const second = await f.sign(secondBody);
  const verification = verifyAuthorityRegistry({ policy: f.policy, registry: second, issuerKeyring: f.issuerKeyring, previousRegistry: f.registry, nowMs: time });
  assert.deepEqual(verification.revokedSigners, ['operator:owner-v1', 'recovery:witness-v1']);
  assert.deepEqual(verification.activeSigners, ['operator:owner-v2', 'recovery:witness-v2']);
  const derived = keyringFromAuthorityRegistry({ registry: second, memberKeyring: f.memberKeyring, role: 'recovery-witness', nowMs: time });
  assert.equal(derived['recovery:witness-v1'].revoked, true);
  assert.equal(derived['recovery:witness-v2'].revoked, false);
  const escalated = makeAuthorityRegistryBody({ policy: f.policy, sequence: 2, previousRegistryRoot: f.registry.root,
    entries: [operator.revoked, makeAuthorityRegistryEntry({ ...operator.rotated, roles: ['operator', 'recovery-witness'] }), recovery.revoked, recovery.rotated], issuedAtMs: time, expiresAtMs: f.now + 3600000 });
  const signedEscalated = await f.sign(escalated);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: signedEscalated, issuerKeyring: f.issuerKeyring, previousRegistry: f.registry, nowMs: time }), /AUTHORITY_REGISTRY_ROTATION_INVALID/);
});

test('registry chain rejects forged signatures, rollback and replaced predecessors', async t => {
  const f = await fixture(t);
  const forged = { ...f.registry, signature: (await f.sign({ ...f.body, sequence: 1 })).signature };
  const other = newIdentity();
  forged.signature = signAuthorityRegistry(f.body, other.privateKey).signature;
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: forged, issuerKeyring: f.issuerKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_SIGNATURE_INVALID/);
  const rollbackBody = makeAuthorityRegistryBody({ policy: f.policy, sequence: 2, entries: f.entries, issuedAtMs: f.now, expiresAtMs: f.now + 3600000 });
  const rollback = await f.sign(rollbackBody);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: rollback, issuerKeyring: f.issuerKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_CHAIN_INVALID/);
  const badPrevious = makeAuthorityRegistryBody({ policy: f.policy, sequence: 2, previousRegistryRoot: '1'.repeat(64), entries: f.entries, issuedAtMs: f.now, expiresAtMs: f.now + 3600000 });
  const bad = await f.sign(badPrevious);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: bad, issuerKeyring: f.issuerKeyring, previousRegistry: f.registry, nowMs: f.now }), /AUTHORITY_REGISTRY_CHAIN_INVALID/);
});

test('issuer revocation, key replacement and missing member material fail closed', async t => {
  const f = await fixture(t);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: f.registry, issuerKeyring: { [f.issuer.issuerId]: { publicKeyPem: f.issuer.publicKeyPem, revoked: true } }, nowMs: f.now }), /AUTHORITY_REGISTRY_ISSUER_KEY_REVOKED/);
  const wrong = newIdentity();
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: f.registry, issuerKeyring: { [f.issuer.issuerId]: { publicKeyPem: wrong.publicKey, revoked: false } }, nowMs: f.now }), /AUTHORITY_REGISTRY_ISSUER_KEY_MISMATCH/);
  const missing = { 'recovery:witness-v1': f.memberKeyring['recovery:witness-v1'] };
  assert.throws(() => keyringFromAuthorityRegistry({ registry: f.registry, memberKeyring: missing, role: 'operator', nowMs: f.now }), /AUTHORITY_REGISTRY_MEMBER_KEY_NOT_CONFIGURED/);
  const mismatched = { ...f.memberKeyring, 'operator:owner-v1': { publicKeyPem: wrong.publicKey, revoked: false } };
  assert.throws(() => keyringFromAuthorityRegistry({ registry: f.registry, memberKeyring: mismatched, role: 'operator', nowMs: f.now }), /AUTHORITY_REGISTRY_MEMBER_KEY_MISMATCH/);
  const revoked = { ...f.memberKeyring, 'operator:owner-v1': { publicKeyPem: f.operatorV1.publicKey, revoked: true } };
  assert.throws(() => keyringFromAuthorityRegistry({ registry: f.registry, memberKeyring: revoked, role: 'operator', nowMs: f.now }), /AUTHORITY_REGISTRY_MEMBER_KEY_REVOKED/);
});

test('strict object and time boundaries reject accessors, resurrection and stale snapshots', async t => {
  const f = await fixture(t);
  const accessorPolicy = { ...f.policy };
  Object.defineProperty(accessorPolicy, 'issuerId', { enumerable: true, get() { return f.issuer.issuerId; } });
  assert.throws(() => validateAuthorityRegistryPolicy(accessorPolicy), /AUTHORITY_REGISTRY_POLICY_INVALID/);
  const accessorMembers = { ...f.memberKeyring };
  Object.defineProperty(accessorMembers, 'operator:owner-v1', { enumerable: true, get() { return f.memberKeyring['operator:owner-v1']; } });
  assert.throws(() => keyringFromAuthorityRegistry({ registry: f.registry, memberKeyring: accessorMembers, role: 'operator', nowMs: f.now }), /AUTHORITY_REGISTRY_MEMBER_KEYRING_INVALID/);
  const expiredBody = makeAuthorityRegistryBody({ policy: f.policy, sequence: 1, entries: f.entries, issuedAtMs: f.now - 3000, expiresAtMs: f.now - 1000 });
  const expired = await f.sign(expiredBody);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: expired, issuerKeyring: f.issuerKeyring, nowMs: f.now }), /AUTHORITY_REGISTRY_EXPIRED/);
  const time = f.now + 1;
  const rotation = await f.rotate({ issuedAtMs: time });
  const recovery = await f.rotate({ roles: ['recovery-witness'], member: f.recoveryV2, signerId: 'recovery:witness-v2', authorityId: 'recovery-witness', predecessorSignerId: 'recovery:witness-v1', issuedAtMs: time });
  const secondBody = makeAuthorityRegistryBody({ policy: f.policy, sequence: 2, previousRegistryRoot: f.registry.root,
    entries: [rotation.revoked, rotation.rotated, recovery.revoked, recovery.rotated], issuedAtMs: time, expiresAtMs: f.now + 3600000 });
  const second = await f.sign(secondBody);
  const resurrectionBody = makeAuthorityRegistryBody({ policy: f.policy, sequence: 3, previousRegistryRoot: second.root,
    entries: [makeAuthorityRegistryEntry({ ...f.entries[0], status: 'active' }), makeAuthorityRegistryEntry({ ...rotation.rotated, status: 'revoked', revokedAtMs: time + 1 }), recovery.revoked, recovery.rotated], issuedAtMs: time + 1, expiresAtMs: f.now + 3600000 });
  const resurrection = await f.sign(resurrectionBody);
  assert.throws(() => verifyAuthorityRegistry({ policy: f.policy, registry: resurrection, issuerKeyring: f.issuerKeyring, previousRegistry: second, nowMs: time + 1 }), /AUTHORITY_REGISTRY_REVOCATION_RESURRECTED|AUTHORITY_REGISTRY_APPEND_ONLY_VIOLATION/);
});
