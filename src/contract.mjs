import {rootHash} from './identity.mjs';
export const CAPABILITY = Object.freeze({
  capabilityId:'text.codepoint-count', version:'1.0.0',
  inputSchema:{type:'object',properties:{text:{type:'string',maxLength:4096}},required:['text'],additionalProperties:false},
  outputSchema:{type:'object',properties:{count:{type:'integer',minimum:0}},required:['count'],additionalProperties:false},
  authorityRequired:['text.read'],
  semantics:'Count Unicode code points exactly, including spaces and combining code points; no normalization.',
});
export const CONTRACT_ROOT = rootHash(CAPABILITY);
export const SUITE_VERSIONS = Object.freeze(['0.1.0','0.1.1']);
export const SECURITY_PROFILE = 'ed25519-pinned-local.v1';
export const WORLD = 'world:local-demonstration';
export const SUBJECT = 'subject:local-user';
export const CONTINUITY = rootHash({subjectId:SUBJECT,genesis:'local-demo.v1'});
export function providerManifest(nodeId, providerId = `${nodeId}:counter`) {
  return {nodeId,providerId,capability:CAPABILITY,contractRoot:CONTRACT_ROOT,
    region:'local',retentionSeconds:0,cost:1,latencyMs:1,energy:1,
    sla:{targetLatencyMs:1000,guaranteed:false},securityProfile:SECURITY_PROFILE};
}
