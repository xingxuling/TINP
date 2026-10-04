import { createHash } from 'node:crypto';
import { ProtocolError } from './identity.mjs';

export const OPP_NATIVE_BINARY64_PROFILE = 'opp.json-binary64.v1';

function invalid(code) { throw new ProtocolError(code); }

function typed(value) {
  if (value === null) return ['null'];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) invalid('CANONICAL_NUMBER_INVALID');
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(value === 0 ? 0 : value);
    return ['number', bytes.toString('hex')];
  }
  if (typeof value === 'string') {
    if (!value.isWellFormed()) invalid('CANONICAL_STRING_INVALID');
    return ['string', value];
  }
  if (Array.isArray(value)) return ['array', value.map(typed)];
  if (value !== null && typeof value === 'object') {
    return ['object', Object.keys(value).sort().map(key => { typed(key); return [key, typed(value[key])]; })];
  }
  invalid('CANONICAL_DATA_INVALID');
}

// Caller validates canonical JSON data before hashing. The profile wrapper
// separates these typed roots from legacy receipt hashes and ordinary objects.
export function canonicalOppNativeBinary64Json(value) {
  return JSON.stringify({ profile: OPP_NATIVE_BINARY64_PROFILE, value: typed(value) });
}

export function rootOppNativeBinary64(value) {
  return createHash('sha256').update(canonicalOppNativeBinary64Json(value), 'utf8').digest('hex');
}
