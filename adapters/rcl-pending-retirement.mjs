import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

const rootFields = ['expectedRequestRoot', 'actualRequestRoot'];
const truthFields = ['operatorAuthorized', 'leaseRevoked', 'allNodesAcknowledged', 'pendingPresent'];
export const RCL_PENDING_RETIREMENT_FIELDS = Object.freeze([...rootFields, ...truthFields]);
const hash = value => createHash('sha256').update(value).digest('hex');
let compiled;
let sourceSha256;

function snapshotPendingRetirement(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== RCL_PENDING_RETIREMENT_FIELDS.length || keys.some(key => !RCL_PENDING_RETIREMENT_FIELDS.includes(key))) throw new TypeError('Unexpected pending retirement fields');
  const facts = {};
  for (const field of RCL_PENDING_RETIREMENT_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Missing data field: ${field}`);
    facts[field] = descriptor.value;
  }
  for (const field of rootFields) if (typeof facts[field] !== 'string' || facts[field].length !== 64 || !/^[a-fA-F0-9]{64}$/.test(facts[field])) throw new TypeError(`Invalid request root: ${field}`);
  for (const field of truthFields) if (typeof facts[field] !== 'boolean') throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Host verifies durable revocation acknowledgements. Admission grants no execution or renewal. */
export async function evaluatePendingRetirementGuard(input) {
  let facts;
  try { facts = snapshotPendingRetirement(input); }
  catch (error) { return { allowed: false, code: 'RCL_PENDING_RETIREMENT_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/pending-retirement.rcl', import.meta.url), 'utf8');
      compiled = compileReality(source);
      sourceSha256 = hash(source);
    }
    const result = await runReality(compiled, { hostAdapters: { observation: { invoke(request) {
      if (!Object.hasOwn(facts, request.capability) || request.args.length !== 0) throw new Error('Unexpected pending retirement observation');
      return facts[request.capability];
    } } } });
    const allowed = result.state['retirement.allowed'] === true;
    return { allowed, code: allowed ? 'RCL_PENDING_RETIREMENT_ALLOWED' : 'RCL_PENDING_RETIREMENT_DENIED',
      history: result.history, programRoot: result.programRoot, stateRoot: result.stateRoot, sourceSha256,
      factsRoot: hash(JSON.stringify(facts)), runtime: 'RCL canonical compiler and JavaScript semantic runtime', coverage: 'lowered-execution' };
  } catch (error) {
    return { allowed: false, code: 'RCL_PENDING_RETIREMENT_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
