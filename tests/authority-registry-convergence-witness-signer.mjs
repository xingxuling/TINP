import { newIdentity } from '../src/identity.mjs';
import { signAuthorityRegistryConvergenceWitness } from '../src/authority-registry-convergence-witness.mjs';

const [mode] = process.argv.slice(2);
if (mode !== 'witness') throw new Error('unknown authority registry convergence witness signer mode');
const keys = newIdentity();
process.send({ event: 'witness-ready', publicKeyPem: keys.publicKey, pid: process.pid,
  signerId: 'witness:authority-registry-convergence-test' });
process.on('message', message => {
  if (message.command !== 'sign') return;
  try { process.send({ callId: message.callId,
    witness: signAuthorityRegistryConvergenceWitness(message.body, keys.privateKey) }); }
  catch (error) { process.send({ callId: message.callId, error: error.code ?? error.message }); }
});
