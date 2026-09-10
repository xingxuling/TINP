import crypto from 'node:crypto';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonicalize(value[k])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function rootHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

export function assertObject(value, code = 'OBJECT_REQUIRED') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TinpError(code);
}

export class TinpError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'TinpError';
    this.code = code;
    this.details = details;
  }
}
