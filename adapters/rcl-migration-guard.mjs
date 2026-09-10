import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

const textFields = ['oldSubjectId', 'newSubjectId', 'oldContinuityRoot', 'newContinuityRoot', 'oldWorldId', 'newWorldId'];
const numberFields = ['oldExpiresAtMs', 'newExpiresAtMs'];
const scopeFields = ['oldScopes', 'newScopes'];
let compiled;
let sourceSha256;
const hash = value => createHash('sha256').update(value).digest('hex');

function snapshotMigration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  const facts = {};
  for (const field of [...textFields, ...numberFields, ...scopeFields]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Missing data field: ${field}`);
    facts[field] = descriptor.value;
  }
  for (const field of textFields) if (typeof facts[field] !== 'string' || facts[field].trim().length === 0 || facts[field].length > 4096) throw new TypeError(`Invalid text: ${field}`);
  for (const field of numberFields) if (!Number.isSafeInteger(facts[field]) || facts[field] < 0) throw new TypeError(`Invalid timestamp: ${field}`);
  for (const field of scopeFields) {
    const source = facts[field];
    if (!Array.isArray(source) || source.length > 128) throw new TypeError(`Invalid scope list: ${field}`);
    const values = [];
    for (let index = 0; index < source.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || descriptor.value.trim().length === 0 || descriptor.value.length > 512) throw new TypeError(`Invalid scope: ${field}`);
      values.push(descriptor.value);
    }
    if (new Set(values).size !== values.length) throw new TypeError(`Duplicate scope: ${field}`);
    facts[field] = Object.freeze(values);
  }
  // This is a data relation observation. The RCL program owns whether it admits migration.
  const previousScopes = new Set(facts.oldScopes);
  facts.scopeSubset = facts.newScopes.every(scope => previousScopes.has(scope));
  return Object.freeze(facts);
}

/** Compare authenticated prior session with a proposed replacement before signing it. */
export async function evaluateSessionMigrationGuard(input) {
  let facts;
  try { facts = snapshotMigration(input); }
  catch (error) { return { allowed: false, code: 'RCL_MIGRATION_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/migration.rcl', import.meta.url), 'utf8');
      const program = compileReality(source);
      sourceSha256 = hash(source);
      compiled = program;
    }
    const result = await runReality(compiled, { hostAdapters: { observation: { invoke(request) {
      if (![...textFields, ...numberFields, 'scopeSubset'].includes(request.capability) || request.args.length !== 0) throw new Error('Unexpected migration observation');
      return facts[request.capability];
    } } } });
    const allowed = result.state['migration.allowed'] === true;
    return { allowed, code: allowed ? 'RCL_MIGRATION_ALLOWED' : 'RCL_MIGRATION_DENIED',
      history: result.history, programRoot: result.programRoot, stateRoot: result.stateRoot, sourceSha256,
      factsRoot: hash(JSON.stringify(facts)), runtime: 'RCL canonical compiler and JavaScript semantic runtime', coverage: 'lowered-execution' };
  } catch (error) {
    return { allowed: false, code: 'RCL_MIGRATION_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
