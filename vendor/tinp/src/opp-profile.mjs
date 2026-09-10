import {TINP_PROTOCOL} from './protocol.mjs';
import {rootHash,TinpError} from './canonical.mjs';
const intersect=(a=[],b=[])=>[...new Set(a)].filter(x=>new Set(b).has(x)).sort();

export function toOppChpOffer(hello,{issuedAt='1970-01-01T00:00:00.000Z',minimumConfidence=0}={}){
  const payload={phase:'offer',identity:{id:hello.nodeId,civilizationType:'service'},supportedProtocols:['opp.chp.v0.1',TINP_PROTOCOL,...hello.protocols],capabilities:hello.capabilities,authorityScopes:hello.authorityScopes,evidencePolicy:{minimumConfidence,acceptDerivedEvidence:false,requiredProtocols:['opp.chp.v0.1','opp.rep.v0.1']},extensions:{tinpHelloRoot:hello.helloRoot,subjectId:hello.subjectId}};
  const base={format:'taowind.opp.reality-envelope.v0.1',protocol:'opp.chp.v0.1',version:'0.1.0-candidate.1',kind:'protocol',id:`tinp-offer:${hello.nodeId}`,status:'candidate',issuedAt,issuer:{id:hello.nodeId,type:'runtime'},payload,constraints:['TINP projection does not authenticate remote identity or create authority'],evidenceRefs:[],extensions:{tinpHelloRoot:hello.helloRoot}};
  return {...base,projectionRoot:rootHash(base)};
}
export function toOppChpAgreement(localOffer,remoteOffer){
  const a=localOffer?.payload,b=remoteOffer?.payload;if(a?.phase!=='offer'||b?.phase!=='offer')throw new TinpError('OPP_CHP_OFFER_REQUIRED');
  const agreedProtocols=intersect(a.supportedProtocols,b.supportedProtocols),sharedCapabilities=intersect(a.capabilities,b.capabilities),authorityScopes=intersect(a.authorityScopes,b.authorityScopes);
  const accepted=agreedProtocols.includes('opp.chp.v0.1')&&agreedProtocols.includes(TINP_PROTOCOL);
  const payload={phase:accepted?'agreement':'reject',participants:[a.identity.id,b.identity.id].sort(),status:accepted?'accepted':'rejected',agreedProtocols,sharedCapabilities,authorityScopes,evidencePolicy:{minimumConfidence:Math.max(a.evidencePolicy.minimumConfidence??0,b.evidencePolicy.minimumConfidence??0),acceptDerivedEvidence:Boolean(a.evidencePolicy.acceptDerivedEvidence&&b.evidencePolicy.acceptDerivedEvidence)},reasons:accepted?[]:['NO_SHARED_TINP_PROTOCOL']};
  return {...payload,agreementRoot:rootHash(payload)};
}
