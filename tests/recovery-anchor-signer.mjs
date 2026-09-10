import { newIdentity, seal } from '../src/identity.mjs';

const [mode] = process.argv.slice(2);
if (mode !== 'signer') throw new Error('unknown recovery anchor signer mode');
const keys = newIdentity();
process.send({ event: 'signer-ready', publicKeyPem: keys.publicKey, pid: process.pid, signerId: 'recovery:witness-test' });
process.on('message', message => {
  if (message.command !== 'sign') return;
  try { process.send({ callId: message.callId, anchor: seal(message.body, keys.privateKey) }); }
  catch (error) { process.send({ callId: message.callId, error: error.code ?? error.message }); }
});
