import {TinpError,rootHash} from './canonical.mjs';
export function makeForwardEnvelope({route,payloadType,payload,ttl=16,trace=[]}){
  if(!route?.path?.length)throw new TinpError('FORWARD_ROUTE_REQUIRED');if(!Number.isInteger(ttl)||ttl<=0)throw new TinpError('TTL_EXHAUSTED');
  const base={format:'tinp.forward.v0.2',routeRoot:route.routeRoot,path:[...route.path],hopIndex:0,ttl,payloadType,payload,trace:[...trace]};return {...base,forwardRoot:rootHash(base)};
}
export function forwardNext(envelope,currentNodeId){
  if(envelope.ttl<=0)throw new TinpError('TTL_EXHAUSTED');if(envelope.path[envelope.hopIndex]!==currentNodeId)throw new TinpError('FORWARD_WRONG_HOP',{currentNodeId,expected:envelope.path[envelope.hopIndex]});
  if(envelope.hopIndex>=envelope.path.length-1)return {delivered:true,nextNodeId:null,envelope};
  const base={...envelope,hopIndex:envelope.hopIndex+1,ttl:envelope.ttl-1,trace:[...envelope.trace,currentNodeId]};delete base.forwardRoot;const next={...base,forwardRoot:rootHash(base)};return {delivered:false,nextNodeId:next.path[next.hopIndex],envelope:next};
}
