import {rootHash, TinpError, assertObject} from './canonical.mjs';

export const TINP_VERSION = '0.2.0-alpha.1';
export const TINP_PROTOCOL = 'taowind.tinp.v0.2';
export const MAGIC = Buffer.from('TINP');
export const WIRE_MAJOR = 0;
export const WIRE_MINOR = 2;
export const HEADER_BYTES = 12;

export const FRAME_TYPES = Object.freeze({
  HELLO: 1,
  OFFER: 2,
  GRANT: 3,
  INTENT: 4,
  RECEIPT: 5,
  REVOKE: 6,
  ERROR: 7,
  DATA: 8,
  DISCOVER: 9,
  ROUTE_ADVERT: 10,
  FORWARD: 11,
  MIGRATE: 12
});
export const FRAME_NAMES = Object.freeze(Object.fromEntries(Object.entries(FRAME_TYPES).map(([k,v]) => [v,k])));

export function encodeFrame(type, payload, {flags = 0} = {}) {
  const typeCode = typeof type === 'number' ? type : FRAME_TYPES[type];
  if (!FRAME_NAMES[typeCode]) throw new TinpError('FRAME_TYPE_UNKNOWN', {type});
  assertObject(payload, 'FRAME_PAYLOAD_REQUIRED');
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt8(WIRE_MAJOR, 4);
  header.writeUInt8(WIRE_MINOR, 5);
  header.writeUInt8(typeCode, 6);
  header.writeUInt8(flags & 0xff, 7);
  header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}

export function decodeFrame(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < HEADER_BYTES) throw new TinpError('FRAME_TRUNCATED');
  if (!buffer.subarray(0,4).equals(MAGIC)) throw new TinpError('FRAME_MAGIC');
  const major = buffer.readUInt8(4), minor = buffer.readUInt8(5);
  if (major !== WIRE_MAJOR) throw new TinpError('WIRE_MAJOR_UNSUPPORTED', {major});
  const type = buffer.readUInt8(6), flags = buffer.readUInt8(7), length = buffer.readUInt32BE(8);
  if (!FRAME_NAMES[type]) throw new TinpError('FRAME_TYPE_UNKNOWN', {type});
  if (buffer.length !== HEADER_BYTES + length) throw new TinpError('FRAME_LENGTH_MISMATCH', {declared:length, actual:buffer.length-HEADER_BYTES});
  let payload;
  try { payload = JSON.parse(buffer.subarray(HEADER_BYTES).toString('utf8')); }
  catch { throw new TinpError('FRAME_JSON_INVALID'); }
  assertObject(payload, 'FRAME_PAYLOAD_REQUIRED');
  return {major, minor, type, typeName: FRAME_NAMES[type], flags, payload};
}

export function makeHello({nodeId, subjectId, protocols=[TINP_PROTOCOL], payloadProfiles=[], securityProfiles=['none-test'], capabilities=[], authorityScopes=[]}) {
  const base = {
    format: 'tinp.hello.v0.2', protocol: TINP_PROTOCOL, nodeId, subjectId,
    protocols:[...new Set(protocols)].sort(), payloadProfiles:[...new Set(payloadProfiles)].sort(),
    securityProfiles:[...new Set(securityProfiles)].sort(), capabilities:[...new Set(capabilities)].sort(),
    authorityScopes:[...new Set(authorityScopes)].sort()
  };
  return {...base, helloRoot: rootHash(base)};
}

export function makeIntent({sessionId, subjectId, requestId, capability, purpose, payload, authorityScope, payloadProfile='application/json', evidenceRefs=[], branchRef=null, ttl=16}) {
  const base = {
    format:'tinp.intent.v0.2', protocol:TINP_PROTOCOL, sessionId, subjectId, requestId,
    capability, purpose, payloadProfile, payload, authorityScope,
    evidenceRefs:[...evidenceRefs], branchRef, ttl
  };
  return {...base, intentRoot:rootHash(base)};
}

export function makeReceipt({sessionId, requestId, status, providerId, intentRoot, resultRoot=null, evidenceRefs=[], previousReceiptRoot='0'.repeat(64), code='OK'}) {
  const base = {
    format:'tinp.receipt.v0.2', protocol:TINP_PROTOCOL, sessionId, requestId, status, code,
    providerId, intentRoot, resultRoot, evidenceRefs:[...evidenceRefs], previousReceiptRoot
  };
  return {...base, receiptRoot:rootHash(base)};
}
