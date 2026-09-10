import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

const textFields = ['oldSubjectId', 'newSubjectId', 'oldContinuityRoot', 'newContinuityRoot', 'oldWorldId', 'newWorldId', 'persistedEvidenceRoot', 'recoveredEvidenceRoot'];
const numberFields = ['oldExpiresAtMs', 'newExpiresAtMs', 'persistedRevocationEpoch', 'currentRevocationEpoch'];
const truthFields = ['stateAuthenticated', 'cacheVerified'];
export const RCL_RECOVERY_FIELDS = Object.freeze([...textFields, ...numberFields, ...truthFields]);
const hash = value => createHash('sha256').update(value).digest('hex');
let compiled;
let sourceSha256;

function snapshotRecovery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== RCL_RECOVERY_FIELDS.length || keys.some(key => !RCL_RECOVERY_FIELDS.includes(key))) throw new TypeError('Unexpected recovery fields');
  const facts = {};
  for (const field of RCL_RECOVERY_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Missing data field: ${field}`);
    facts[field] = descriptor.value;
  }
  for (const field of textFields) if (typeof facts[field] !== 'string' || facts[field].trim().length === 0 || facts[field].length > 4096) throw new TypeError(`Invalid text: ${field}`);
  for (const field of numberFields) if (!Number.isSafeInteger(facts[field]) || facts[field] < 0) throw new TypeError(`Invalid integer: ${field}`);
  for (const field of truthFields) if (typeof facts[field] !== 'boolean') throw new TypeError(`Invalid truth: ${field}`);
  return Object.freeze(facts);
}

/** Host supplies verified local recovery facts; this gate never grants execution or renews a lease. */
export async function evaluateRecoveryGuard(input) {
  let facts;
  try { facts = snapshotRecovery(input); }
  catch (error) { return { allowed: false, code: 'RCL_RECOVERY_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/recovery.rcl', import.meta.url), 'utf8');
      compiled = compileReality(source);
      sourceSha256 = hash(source);
    }
    const result = await runReality(compiled, { hostAdapters: { observation: { invoke(request) {
      if (!Object.hasOwn(facts, request.capability) || request.args.length !== 0) throw new Error('Unexpected recovery observation');
      return facts[request.capability];
    } } } });
    const allowed = result.state['recovery.allowed'] === true;
    return { allowed, code: allowed ? 'RCL_RECOVERY_ALLOWED' : 'RCL_RECOVERY_DENIED',
      history: result.history, programRoot: result.programRoot, stateRoot: result.stateRoot, sourceSha256,
      factsRoot: hash(JSON.stringify(facts)), runtime: 'RCL canonical compiler and JavaScript semantic runtime', coverage: 'lowered-execution' };
  } catch (error) {
    return { allowed: false, code: 'RCL_RECOVERY_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
