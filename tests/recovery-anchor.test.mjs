import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InternetSuite } from '../src/suite.mjs';
import { ProtectedStore } from '../src/protected-store.mjs';
import { newIdentity, seal } from '../src/identity.mjs';

const signerUrl = new URL('./recovery-anchor-signer.mjs', import.meta.url);
function temp(prefix = 'tinp-recovery-anchor-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function stateStore(directory) { return new ProtectedStore(path.join(directory, 'private', 'coordinator'), { purpose: 'twni.coordinator-state.v1' }); }
function snapshot(directory) {
  return Object.fromEntries(['ledger.jsonl', 'private/coordinator/protected-state.dpapi', ...['A', 'B', 'C'].map(id => `private/nodes/${id}/protected-state.dpapi`)]
    .map(file => [file, fs.readFileSync(path.join(directory, file)).toString('base64')]));
}
function cloneDirectory(source) { const target = temp('tinp-recovery-anchor-snapshot-'); fs.cpSync(source, target, { recursive: true }); return target; }
function restoreDirectory(target, source) { fs.rmSync(target, { recursive: true, force: true }); fs.cpSync(source, target, { recursive: true }); }
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
async function closeSuite(suite) {
  if (!suite || suite.__anchorTestClosed) return;
  suite.__anchorTestClosed = true;
  const children = [...suite.nodes.values()].map(node => node.child);
  await suite.close().catch(() => {});
  await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); });
  })));
}
async function removeDirectory(directory) {
  let last;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { fs.rmSync(directory, { recursive: true, force: true }); return; }
    catch (error) { last = error; if (error.code !== 'EPERM') throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw last;
}
async function signerFor(t) {
  const child = fork(fileURLToPath(signerUrl), ['signer'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [], windowsHide: true });
  t.after(() => kill(child));
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('recovery anchor signer timeout')), 10000);
    child.once('message', message => { clearTimeout(timer); resolve(message); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  assert.equal(ready.event, 'signer-ready');
  let callId = 0;
  return { ...ready, async sign(body) {
    const id = ++callId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.off('message', handler); reject(new Error('recovery anchor signing timeout')); }, 10000);
      const handler = message => { if (message.callId !== id) return; clearTimeout(timer); child.off('message', handler); message.error ? reject(new Error(message.error)) : resolve(message.anchor); };
      child.on('message', handler); child.send({ command: 'sign', callId: id, body });
    });
  } };
}
async function setup(t) {
  const directory = temp(), signer = await signerFor(t), keyring = { [signer.signerId]: { publicKeyPem: signer.publicKeyPem, revoked: false } };
  let suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring: keyring, timeoutMs: 3000 });
  t.after(async () => { await closeSuite(suite); try { await removeDirectory(directory); } catch (error) { if (error.code !== 'EPERM') throw error; } });
  await suite.pinRecoveryAnchor({ signerId: signer.signerId, publicKeyPem: signer.publicKeyPem, confirmed: true });
  const draft = suite.recoveryAnchorDraft(), anchor = await signer.sign(draft.body);
  await suite.adoptRecoveryAnchor(anchor);
  return { directory, signer, keyring, suite, anchor };
}

test('external recovery anchor pins a public fingerprint, excludes keyring material, and survives restart', async t => {
  const { directory, signer, keyring, suite, anchor } = await setup(t);
  const saved = stateStore(directory).load();
  assert.equal(saved.recoveryAnchor.root, anchor.root);
  assert.equal(saved.recoveryAnchorPolicy.publicKeySha256.length, 64);
  assert.equal(Object.hasOwn(saved, 'recoveryAnchorKeyring'), false);
  assert.equal(JSON.stringify(saved).includes(signer.publicKeyPem), false);
  const before = snapshot(directory);
  await assert.rejects(suite.adoptRecoveryAnchor(anchor), /RECOVERY_ANCHOR_SEQUENCE_INVALID/);
  assert.deepEqual(snapshot(directory), before);
  await closeSuite(suite);
  const resumed = await InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: keyring, timeoutMs: 3000 });
  t.after(() => closeSuite(resumed));
  assert.equal(resumed.recoveryAnchorVerification.anchorRoot, anchor.root);
  assert.equal(resumed.recoveryAnchorVerification.sequence, 1);
});

test('a newer externally signed anchor detects a complete older directory replay', async t => {
  const { directory, signer, keyring, suite, anchor: first } = await setup(t);
  await closeSuite(suite);
  const oldSnapshot = cloneDirectory(directory), newSnapshotCleanup = [];
  t.after(async () => { await removeDirectory(oldSnapshot); for (const item of newSnapshotCleanup) await removeDirectory(item); });
  let resumed = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring: keyring, timeoutMs: 3000 });
  t.after(async () => { await closeSuite(resumed); });
  resumed.setLevel('Degraded', 'advance beyond external anchor');
  const second = await signer.sign(resumed.recoveryAnchorDraft().body);
  await resumed.adoptRecoveryAnchor(second);
  await closeSuite(resumed); resumed = null;
  const newSnapshot = cloneDirectory(directory); newSnapshotCleanup.push(newSnapshot);
  restoreDirectory(directory, oldSnapshot);
  await assert.rejects(InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: keyring, recoveryAnchor: second, timeoutMs: 3000 }), /RECOVERY_ANCHOR_ROLLBACK/);
  restoreDirectory(directory, newSnapshot);
  const recovered = await InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: keyring, recoveryAnchor: second, timeoutMs: 3000 });
  t.after(() => closeSuite(recovered));
  assert.equal(recovered.recoveryAnchorVerification.anchorRoot, second.root);
  assert.equal(recovered.recoveryAnchorVerification.sequence, 2);
  assert.notEqual(first.root, second.root);
});

test('anchor policy and monotonic sequence reject replacement, stale, forged, and revoked trust inputs before writes', async t => {
  const { directory, signer, keyring, suite, anchor } = await setup(t);
  const replacement = newIdentity(), before = snapshot(directory);
  await assert.rejects(suite.pinRecoveryAnchor({ signerId: signer.signerId, publicKeyPem: replacement.publicKey, confirmed: true }), /RECOVERY_ANCHOR_POLICY_IMMUTABLE/);
  assert.deepEqual(snapshot(directory), before);
  const staleKeyring = { [signer.signerId]: { publicKeyPem: signer.publicKeyPem, revoked: true } };
  await closeSuite(suite);
  await assert.rejects(InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: staleKeyring, timeoutMs: 3000 }), /RECOVERY_ANCHOR_KEY_REVOKED/);
  const forged = { ...anchor, body: { ...anchor.body, ledgerRoot: 'f'.repeat(64) } };
  const restored = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring: keyring, timeoutMs: 3000 });
  t.after(() => closeSuite(restored));
  const beforeForgedAdoption = snapshot(directory);
  await assert.rejects(restored.adoptRecoveryAnchor(forged), /RECOVERY_ANCHOR_SEQUENCE_INVALID|RECOVERY_ANCHOR_SIGNATURE_INVALID/);
  assert.deepEqual(snapshot(directory), beforeForgedAdoption);
});

test('anchor verification rejects a lower external sequence and a mismatched signer without changing durable state', async t => {
  const { directory, signer, keyring, suite, anchor } = await setup(t);
  await closeSuite(suite);
  const stale = { ...anchor, body: { ...anchor.body, sequence: 0 } };
  const other = newIdentity();
  await assert.rejects(InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: keyring, recoveryAnchor: stale, timeoutMs: 3000 }), /RECOVERY_ANCHOR_INVALID|RECOVERY_ANCHOR_SEQUENCE_ROLLBACK|RECOVERY_ANCHOR_SIGNATURE_INVALID/);
  const invalidChain = await signer.sign({ ...anchor.body, sequence: 2, previousAnchorRoot: '1'.repeat(64) });
  await assert.rejects(InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: keyring, recoveryAnchor: invalidChain, timeoutMs: 3000 }), /RECOVERY_ANCHOR_SEQUENCE_ROLLBACK/);
  const mismatchedKeyring = { [signer.signerId]: { publicKeyPem: other.publicKey, revoked: false } };
  await assert.rejects(InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring: mismatchedKeyring, timeoutMs: 3000 }), /RECOVERY_ANCHOR_KEY_MISMATCH/);
  assert.deepEqual(stateStore(directory).load().recoveryAnchor.root, anchor.root);
});
