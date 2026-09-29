import { createHash } from 'node:crypto';

export const OPP_AGENT_ACTION_PROFILE = 'opp.agent-action.v0.1';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function rootOf(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function verifyOppAgentActionContract(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return {verified:false, code:'OPP_AGENT_ACTION_INVALID'};
  if (document.profile !== OPP_AGENT_ACTION_PROFILE) return {verified:false, code:'OPP_AGENT_ACTION_PROFILE_UNSUPPORTED'};
  for (const field of ['actionId','reversibility','contractRoot']) if (typeof document[field] !== 'string' || !document[field]) return {verified:false, code:'OPP_AGENT_ACTION_INVALID'};
  for (const field of ['operations','authorities','sideEffects','targets','networkDestinations']) if (!Array.isArray(document[field]) || !document[field].every(x=>typeof x==='string'&&x.length>0)) return {verified:false, code:'OPP_AGENT_ACTION_INVALID'};
  if (typeof document.humanApprovalRequired !== 'boolean') return {verified:false, code:'OPP_AGENT_ACTION_INVALID'};
  if (document.authorityGranted !== false || document.executable !== false) return {verified:false, code:'OPP_AGENT_ACTION_AUTHORITY_CONFUSION'};
  const unsigned={
    profile:document.profile,actionId:document.actionId,operations:document.operations,
    authorities:document.authorities,sideEffects:document.sideEffects,targets:document.targets,
    networkDestinations:document.networkDestinations,reversibility:document.reversibility,
    humanApprovalRequired:document.humanApprovalRequired,
  };
  const expected=rootOf(unsigned);
  if (expected!==document.contractRoot) return {verified:false, code:'OPP_AGENT_ACTION_ROOT_MISMATCH', expectedRoot:expected};
  return {verified:true, code:'OPP_AGENT_ACTION_VERIFIED', contractRoot:expected, authorities:[...document.authorities], sideEffects:[...document.sideEffects]};
}
