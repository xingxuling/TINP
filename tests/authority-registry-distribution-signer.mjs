import { newIdentity } from '../src/identity.mjs';
import { signAuthorityRegistryDistributionReceipt } from '../src/authority-registry-distribution.mjs';

const [mode, mirrorId] = process.argv.slice(2);
if (mode !== 'mirror' || typeof mirrorId !== 'string' || mirrorId.length === 0) {
  throw new Error('unknown authority registry distribution signer mode');
}
if (!process.send) throw new Error('authority registry distribution signer requires IPC');

const keys = newIdentity();
process.send({ event: 'mirror-ready', mirrorId, publicKeyPem: keys.publicKey, pid: process.pid });
process.on('message', message => {
  if (message.command !== 'sign') return;
  try {
    process.send({ callId: message.callId,
      receipt: signAuthorityRegistryDistributionReceipt(message.body, keys.privateKey) });
  } catch (error) {
    process.send({ callId: message.callId, error: error.code ?? error.message });
  }
});
