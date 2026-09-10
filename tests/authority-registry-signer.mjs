import { newIdentity, seal } from '../src/identity.mjs';

const [mode] = process.argv.slice(2);
if (mode !== 'issuer') throw new Error('unknown authority registry signer mode');
const keys = newIdentity();
const issuerId = 'registry:issuer-test';
if (!process.send) throw new Error('authority registry signer requires IPC');
process.send({ event: 'issuer-ready', issuerId, publicKeyPem: keys.publicKey, pid: process.pid });
process.on('message', message => {
  if (message.command !== 'sign') return;
  try { process.send({ callId: message.callId, registry: seal(message.body, keys.privateKey) }); }
  catch (error) { process.send({ callId: message.callId, error: error.code ?? error.message }); }
});
