import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileReality } from '../vendor/rcl/src/compiler.mjs';
import { runReality } from '../vendor/rcl/src/runtime.mjs';

export const AGENT_ACTION_AUTHORITIES = Object.freeze([
  'workspace.read', 'workspace.write', 'process.spawn', 'network.egress',
  'credential.read', 'package.install', 'scm.write',
]);

const authorityField = Object.freeze({
  'workspace.read': 'WorkspaceRead',
  'workspace.write': 'WorkspaceWrite',
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
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} contains invalid authority`);
    set.add(value.trim());
  }
  return set;
}

function snapshotFacts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Input must be an object');
  for (const key of ['contractVerified', 'subjectVerified', 'leaseActive', 'targetWithinWorkspace', 'networkDestinationAllowed']) {
    if (typeof input[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
  }
  const requested = asSet(input.requestedAuthorities, 'requestedAuthorities');
  const leased = asSet(input.leaseAuthorities, 'leaseAuthorities');
  const unknown = [...requested].filter((item) => !Object.hasOwn(authorityField, item));
  const facts = {
    contractVerified: input.contractVerified,
    subjectVerified: input.subjectVerified,
    leaseActive: input.leaseActive,
    unknownAuthority: unknown.length > 0,
    targetWithinWorkspace: input.targetWithinWorkspace,
    networkDestinationAllowed: input.networkDestinationAllowed,
  };
  for (const authority of AGENT_ACTION_AUTHORITIES) {
    const suffix = authorityField[authority];
    facts[`request${suffix}`] = requested.has(authority);
    facts[`lease${suffix}`] = leased.has(authority);
  }
  return Object.freeze({facts: Object.freeze(facts), unknown: Object.freeze(unknown.sort())});
}

export async function evaluateAgentActionGuard(input) {
  let snapshot;
  try { snapshot = snapshotFacts(input); }
  catch (error) { return { allowed: false, code: 'AGENT_ACTION_GUARD_INPUT_INVALID', reason: error.message, history: [] }; }
  try {
    if (!compiled) {
      const source = readFileSync(new URL('../rcl/agent-action.rcl', import.meta.url), 'utf8');
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
    const allowed = result.state['gate.allowed'] === true;
    return {
      allowed,
      code: allowed ? 'AGENT_ACTION_ALLOWED' : (unknown.length ? 'AGENT_ACTION_UNKNOWN_AUTHORITY' : 'AGENT_ACTION_DENIED'),
      unknownAuthorities: unknown,
      history: result.history,
      programRoot: result.programRoot,
      stateRoot: result.stateRoot,
      sourceSha256,
      factsRoot: createHash('sha256').update(JSON.stringify(facts)).digest('hex'),
      runtime: 'RCL canonical compiler and JavaScript semantic runtime',
      coverage: 'lowered-execution',
    };
  } catch (error) {
    return { allowed: false, code: 'AGENT_ACTION_GUARD_EXECUTION_FAILED', reason: error.code ?? error.message, sourceSha256, history: [] };
  }
}
