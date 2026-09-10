import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

export { evaluateSessionMigrationGuard } from './rcl-migration-guard.mjs';

const textFields = ['subjectId', 'sessionSubjectId', 'leaseSubjectId', 'worldId', 'leaseWorldId', 'capabilityId', 'leaseCapabilityId', 'capabilityVersion', 'providerCapabilityVersion', 'contractRoot', 'providerContractRoot'];
const numberFields = ['nowMs', 'notBeforeMs', 'expiresAtMs'];
const truthFields = ['signatureVerified', 'sessionVerified', 'revoked', 'scopeAllowed', 'securityFloorMet', 'evidenceContinuous'];
export const RCL_GUARD_FIELDS = Object.freeze([...textFields, ...numberFields, ...truthFields]);
let compiled;
let sourceSha256;

function snapshotFacts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  const facts = {};
  for (const field of RCL_GUARD_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Missing data field: ${field}`);
    facts[field] = descriptor.value;
  }
  for (const field of textFields) if (typeof facts[field] !== 'string' || facts[field].trim().length === 0 || facts[field].length > 4096) throw new TypeError(`Invalid text: ${field}`);
  for (const field of numberFields) if (!Number.isSafeInteger(facts[field]) || facts[field] < 0) throw new TypeError(`Invalid timestamp: ${field}`);
  for (const field of truthFields) if (typeof facts[field] !== 'boolean') throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Facts must originate from the authenticated server context, never raw client claims. */
export async function evaluateTransactionGuard(input) {
  let facts;
  try { facts = snapshotFacts(input); }
  catch (error) { return { allowed: false, code: 'RCL_GUARD_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/transaction.rcl', import.meta.url), 'utf8');
      const program = compileReality(source);
      sourceSha256 = createHash('sha256').update(source).digest('hex');
      compiled = program;
    }
    const result = await runReality(compiled, {
      hostAdapters: { observation: { invoke(request) {
        if (!Object.hasOwn(facts, request.capability) || request.args.length !== 0) throw new Error('Unexpected observation');
        return facts[request.capability];
      } } },
    });
    const allowed = result.state['gate.allowed'] === true;
    return {
      allowed, code: allowed ? 'RCL_GUARD_ALLOWED' : 'RCL_GUARD_DENIED',
      history: result.history, programRoot: result.programRoot, stateRoot: result.stateRoot, sourceSha256,
      factsRoot: createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      runtime: 'RCL canonical compiler and JavaScript semantic runtime',
      coverage: 'lowered-execution',
    };
  } catch (error) {
    return { allowed: false, code: 'RCL_GUARD_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
