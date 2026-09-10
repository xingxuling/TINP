import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InternetSuite } from '../src/suite.mjs';
import { ProtectedStore } from '../src/protected-store.mjs';
import { verifyLedger } from '../src/evidence.mjs';

const transport = process.argv[2] ?? 'udp';
const signerUrl = new URL('../tests/recovery-anchor-signer.mjs', import.meta.url);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-recovery-anchor-demo-'));
const oldSnapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-recovery-anchor-demo-snapshot-'));
const newSnapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-recovery-anchor-demo-snapshot-'));
let signer;
let suite;
function copyInto(source, target) {
  fs.rmSync(target, { recursive: true, force: true }); fs.mkdirSync(target, { recursive: true }); fs.cpSync(source, target, { recursive: true });
}
function restore(source) { fs.rmSync(directory, { recursive: true, force: true }); fs.cpSync(source, directory, { recursive: true }); }
async function kill(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
async function closeSuite(value) {
  if (!value) return;
  const children = [...value.nodes.values()].map(node => node.child);
  await value.close().catch(() => {});
  await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => {
    const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); });
  })));
}
function signerReady() {
  signer = fork(fileURLToPath(signerUrl), ['signer'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [], windowsHide: true });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('recovery anchor signer timeout')), 10000);
    signer.once('message', message => { clearTimeout(timer); resolve(message); });
    signer.once('error', error => { clearTimeout(timer); reject(error); });
  });
}
function sign(body, callId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('recovery anchor signing timeout')), 10000);
    const handler = message => {
      if (message.callId !== callId) return;
      clearTimeout(timer); signer.off('message', handler); message.error ? reject(new Error(message.error)) : resolve(message.anchor);
    };
    signer.on('message', handler); signer.send({ command: 'sign', callId, body });
  });
}

try {
  const ready = await signerReady();
  const recoveryAnchorKeyring = { [ready.signerId]: { publicKeyPem: ready.publicKeyPem, revoked: false } };
  suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring, transport, timeoutMs: 3000 });
  await suite.pinRecoveryAnchor({ signerId: ready.signerId, publicKeyPem: ready.publicKeyPem, confirmed: true });
  const first = await sign(suite.recoveryAnchorDraft().body, 1); await suite.adoptRecoveryAnchor(first);
  await closeSuite(suite); suite = null; copyInto(directory, oldSnapshot);

  suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring, transport, timeoutMs: 3000 });
  suite.setLevel('Degraded', 'advance external recovery witness');
  const second = await sign(suite.recoveryAnchorDraft().body, 2); await suite.adoptRecoveryAnchor(second);
  await closeSuite(suite); suite = null; copyInto(directory, newSnapshot);

  restore(oldSnapshot);
  let rollbackDetected = false; let rollbackCode = null;
  try { await InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring, recoveryAnchor: second, transport, timeoutMs: 3000 }); }
  catch (error) { rollbackCode = error.code ?? error.message; rollbackDetected = /RECOVERY_ANCHOR_ROLLBACK|RECOVERY_ANCHOR_SEQUENCE/.test(rollbackCode); }
  restore(newSnapshot);
  suite = await InternetSuite.start({ directory, durable: true, recoveryAnchorKeyring, recoveryAnchor: second, transport, timeoutMs: 3000 });
  const events = suite.ledger.events, state = new ProtectedStore(path.join(directory, 'private', 'coordinator'), { purpose: 'twni.coordinator-state.v1' }).load();
  if (verifyLedger(events, { publicKey: suite.authority.publicKey }) !== suite.ledger.root) throw new Error('RECOVERY_ANCHOR_LEDGER_INVALID');
  const stats = await suite.stats();
  const preservedLedger = path.join(os.tmpdir(), `tinp-recovery-anchor-ledger-${process.pid}-${Date.now()}.jsonl`);
  fs.copyFileSync(suite.ledger.file, preservedLedger);
  const authorityPublicKey = suite.authority.publicKey;
  const result = {
    format: 'twni.recovery-anchor-demo.v1', status: 'VERIFIED_LOCAL_EXTERNAL_RECOVERY_ANCHOR', transport,
    signerPid: ready.pid, nodePids: stats.map(node => node.pid), firstAnchorRoot: first.root, secondAnchorRoot: second.root,
    firstSequence: first.body.sequence, secondSequence: second.body.sequence, rollbackDetected, rollbackCode,
    externalKeyringNotCheckpointed: !Object.hasOwn(state, 'recoveryAnchorKeyring'), leasePreserved: state.lease.root === second.body.leaseRoot,
    evidenceRoot: suite.ledger.root, authorityPublicKey, ledgerFile: preservedLedger,
    scope: 'Actual independent signer process and complete local directory replay. No production registry, trusted clock, hardware custody or cross-device anchor.',
  };
  if (!rollbackDetected) throw new Error('RECOVERY_ANCHOR_ROLLBACK_NOT_DETECTED');
  await closeSuite(suite); suite = null;
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.stack ?? error.message); process.exitCode = 1;
} finally {
  await closeSuite(suite); await kill(signer);
  for (const item of [directory, oldSnapshot, newSnapshot]) { try { fs.rmSync(item, { recursive: true, force: true }); } catch {} }
}
