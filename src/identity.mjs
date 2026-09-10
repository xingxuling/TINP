import {generateKeyPairSync, sign, verify, randomUUID} from 'node:crypto';
import {rootHash, canonicalize} from '../vendor/tinp/src/canonical.mjs';

export {rootHash};
export const id = prefix => `${prefix}:${randomUUID()}`;
export const clone = value => structuredClone(value);
export class ProtocolError extends Error {
  constructor(code, detail = '') { super(`${code}${detail ? ': ' + detail : ''}`); this.code = code; }
}
export function requireThat(ok, code) { if (!ok) throw new ProtocolError(code); }
export function newIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return {publicKey: pair.publicKey.export({type:'spki',format:'pem'}),
    privateKey: pair.privateKey.export({type:'pkcs8',format:'pem'})};
}
export function seal(body, key) {
  // TINP's canonical hash is reused. Sign the digest, with domain separation.
  const root = rootHash(body);
  return {body:clone(body), root, signature:sign(null, Buffer.from(`twni.v1:${root}`), key).toString('base64')};
}
export function authentic(envelope, key) {
  try {
    return envelope.root === rootHash(envelope.body) &&
      verify(null, Buffer.from(`twni.v1:${envelope.root}`), key, Buffer.from(envelope.signature,'base64'));
  } catch { return false; }
}
