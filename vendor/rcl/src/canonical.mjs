import { createHash } from 'node:crypto';

export function canonicalReality(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalReality).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalReality(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

export function realityRoot(value) {
  return createHash('sha256').update(canonicalReality(value)).digest('hex');
}
