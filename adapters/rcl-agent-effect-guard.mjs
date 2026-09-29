import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

export const AGENT_ACTION_EFFECTS = Object.freeze([
  'filesystem.read', 'filesystem.write', 'process.spawn', 'network.egress',
  'credential.read', 'package.install', 'scm.write',
]);

const effectField = Object.freeze({
  'filesystem.read': 'FilesystemRead',
  'filesystem.write': 'FilesystemWrite',
  'process.spawn': 'ProcessSpawn',
  'network.egress': 'NetworkEgress',
  'credential.read': 'CredentialRead',
  'package.install': 'PackageInstall',
  'scm.write': 'ScmWrite',
});

let compiled;
let sourceSha256;

function asSet(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  const set = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} contains invalid effect`);
    set.add(value.trim());
  }
  return set;
}

function snapshotFacts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  for (const key of ['receiptBindingVerified', 'evidenceContinuous']) {
    if (typeof input[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
  }
  const observed = asSet(input.observedEffects, 'observedEffects');
  const declared = asSet(input.declaredEffects, 'declaredEffects');
  const unknown = [...observed].filter((item) => !Object.hasOwn(effectField, item));
  const facts = {
    receiptBindingVerified: input.receiptBindingVerified,
    evidenceContinuous: input.evidenceContinuous,
    unknownObservedEffect: unknown.length > 0,
  };
  for (const effect of AGENT_ACTION_EFFECTS) {
    const suffix = effectField[effect];
    facts[`observed${suffix}`] = observed.has(effect);
    facts[`declared${suffix}`] = declared.has(effect);
  }
  return Object.freeze({facts: Object.freeze(facts), unknown: Object.freeze(unknown.sort())});
}

export async function evaluateAgentEffectGuard(input) {
  let snapshot;
  try { snapshot = snapshotFacts(input); }
  catch (error) { return { accepted: false, code: 'AGENT_EFFECT_GUARD_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/agent-action-effects.rcl', import.meta.url), 'utf8');
      compiled = compileReality(source);
      sourceSha256 = createHash('sha256').update(source).digest('hex');
    }
    const {facts, unknown} = snapshot;
    const result = await runReality(compiled, {
      hostAdapters: { observation: { invoke(request) {
        if (!Object.hasOwn(facts, request.capability) || request.args.length !== 0) throw new Error('Unexpected observation');
        return facts[request.capability];
      } } },
    });
    const accepted = result.state['gate.accepted'] === true;
    return {
      accepted,
      code: accepted ? 'AGENT_EFFECT_ACCEPTED' : (unknown.length ? 'AGENT_EFFECT_UNKNOWN' : 'AGENT_EFFECT_CONTRACT_VIOLATION'),
      unknownEffects: unknown,
      history: result.history,
      programRoot: result.programRoot,
      stateRoot: result.stateRoot,
      sourceSha256,
      factsRoot: createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      runtime: 'RCL canonical compiler and JavaScript semantic runtime',
      coverage: 'lowered-execution',
    };
  } catch (error) {
    return { accepted: false, code: 'AGENT_EFFECT_GUARD_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
