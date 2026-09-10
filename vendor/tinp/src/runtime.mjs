import crypto from 'node:crypto';
import {CapabilityRouter} from './router.mjs';
import {TINP_PROTOCOL, makeReceipt} from './protocol.mjs';
import {rootHash, TinpError, nowIso} from './canonical.mjs';

const intersect = (a=[],b=[]) => [...new Set(a)].filter(x=>new Set(b).has(x)).sort();

export class TinpRuntime {
  constructor({clock=()=>new Date(), router=new CapabilityRouter()}={}) {
    this.clock=clock; this.router=router; this.sessions=new Map(); this.receipts=[];
  }

  negotiate(sourceHello, targetHello, {requestedAuthorityScopes=[]}={}) {
    if (sourceHello.protocol !== TINP_PROTOCOL || targetHello.protocol !== TINP_PROTOCOL) throw new TinpError('PROTOCOL_MISMATCH');
    const agreedProtocols=intersect(sourceHello.protocols,targetHello.protocols);
    if (!agreedProtocols.includes(TINP_PROTOCOL)) throw new TinpError('TINP_NOT_SHARED');
    const sharedPayloadProfiles=intersect(sourceHello.payloadProfiles,targetHello.payloadProfiles);
    const sharedSecurityProfiles=intersect(sourceHello.securityProfiles,targetHello.securityProfiles);
    const sharedCapabilities=intersect(sourceHello.capabilities,targetHello.capabilities);
    const authorityIntersection=intersect(sourceHello.authorityScopes,targetHello.authorityScopes);
    const grantedScopes=requestedAuthorityScopes.length ? requestedAuthorityScopes.filter(x=>authorityIntersection.includes(x)).sort() : authorityIntersection;
    const base={format:'tinp.offer.v0.2',protocol:TINP_PROTOCOL,sourceNodeId:sourceHello.nodeId,targetNodeId:targetHello.nodeId,
      agreedProtocols,sharedPayloadProfiles,sharedSecurityProfiles,sharedCapabilities,authorityIntersection,grantedScopes,
      authorityExpanded:false};
    return {...base,offerRoot:rootHash(base)};
  }

  openSession({sourceHello,targetHello,requestedAuthorityScopes=[],expiresInMs=300000,securityProfile=null,payloadProfile=null,production=false}) {
    const offer=this.negotiate(sourceHello,targetHello,{requestedAuthorityScopes});
    const chosenSecurity=securityProfile ?? offer.sharedSecurityProfiles[0];
    const chosenPayload=payloadProfile ?? offer.sharedPayloadProfiles[0];
    if (!chosenSecurity) throw new TinpError('NO_SHARED_SECURITY_PROFILE');
    if (!chosenPayload) throw new TinpError('NO_SHARED_PAYLOAD_PROFILE');
    if (production && chosenSecurity==='none-test') throw new TinpError('INSECURE_PROFILE_FOR_PRODUCTION');
    if (!offer.sharedSecurityProfiles.includes(chosenSecurity)) throw new TinpError('SECURITY_PROFILE_NOT_NEGOTIATED');
    if (!offer.sharedPayloadProfiles.includes(chosenPayload)) throw new TinpError('PAYLOAD_PROFILE_NOT_NEGOTIATED');
    const sessionId='tinp:'+crypto.randomUUID();
    const issuedAt=nowIso(this.clock); const expiresAt=new Date(this.clock().getTime()+expiresInMs).toISOString();
    const base={format:'tinp.session-grant.v0.2',protocol:TINP_PROTOCOL,sessionId,sourceNodeId:sourceHello.nodeId,targetNodeId:targetHello.nodeId,
      sourceSubjectId:sourceHello.subjectId,targetSubjectId:targetHello.subjectId,grantedScopes:offer.grantedScopes,
      sharedCapabilities:offer.sharedCapabilities,securityProfile:chosenSecurity,payloadProfile:chosenPayload,offerRoot:offer.offerRoot,issuedAt,expiresAt,status:'open'};
    const grant={...base,grantRoot:rootHash(base)};
    this.sessions.set(sessionId,{grant,revoked:false,previousReceiptRoot:'0'.repeat(64)});
    return grant;
  }

  requireSession(sessionId) {
    const state=this.sessions.get(sessionId); if(!state) throw new TinpError('SESSION_UNKNOWN');
    if(state.revoked || state.grant.status!=='open') throw new TinpError('SESSION_REVOKED');
    if(this.clock().getTime() >= Date.parse(state.grant.expiresAt)) throw new TinpError('SESSION_EXPIRED');
    return state;
  }

  async dispatch(intent) {
    const state=this.requireSession(intent.sessionId); const grant=state.grant;
    if(intent.subjectId!==grant.sourceSubjectId) throw new TinpError('SUBJECT_NOT_SESSION_SOURCE');
    if(!grant.sharedCapabilities.includes(intent.capability)) throw new TinpError('CAPABILITY_NOT_NEGOTIATED');
    if(!grant.grantedScopes.includes(intent.authorityScope)) throw new TinpError('AUTHORITY_SCOPE_NOT_GRANTED');
    if(intent.payloadProfile!==grant.payloadProfile) throw new TinpError('PAYLOAD_PROFILE_SESSION_MISMATCH');
    if(!Number.isInteger(intent.ttl) || intent.ttl<=0) throw new TinpError('TTL_EXHAUSTED');
    if(intent.payload?.providerId || intent.payload?.executable || intent.payload?.grantAuthority) throw new TinpError('PAYLOAD_CONTROL_PLANE_OVERRIDE');
    const provider=this.router.route(intent.capability,{payloadProfile:intent.payloadProfile,authorityScope:intent.authorityScope,securityProfile:grant.securityProfile});
    if(typeof provider.handler!=='function') throw new TinpError('PROVIDER_HANDLER_MISSING');
    const result=await provider.handler({intent,session:grant,provider:{...provider,handler:undefined}});
    const resultRoot=rootHash(result);
    const receipt=makeReceipt({sessionId:intent.sessionId,requestId:intent.requestId,status:'executed',providerId:provider.providerId,
      intentRoot:intent.intentRoot,resultRoot,evidenceRefs:result?.evidenceRefs??[],previousReceiptRoot:state.previousReceiptRoot});
    state.previousReceiptRoot=receipt.receiptRoot; this.receipts.push(receipt);
    return {result,resultRoot,receipt};
  }

  migrateSession(sessionId,{newSourceNodeId,newTargetNodeId,reason='endpoint-change'}={}) {
    const state=this.requireSession(sessionId); const old=state.grant;
    if(!newSourceNodeId&&!newTargetNodeId) throw new TinpError('MIGRATION_ENDPOINT_REQUIRED');
    const migratedAt=nowIso(this.clock);
    const base={format:'tinp.session-migration.v0.2',protocol:TINP_PROTOCOL,sessionId,sourceSubjectId:old.sourceSubjectId,targetSubjectId:old.targetSubjectId,
      previousSourceNodeId:old.sourceNodeId,previousTargetNodeId:old.targetNodeId,newSourceNodeId:newSourceNodeId??old.sourceNodeId,newTargetNodeId:newTargetNodeId??old.targetNodeId,
      previousGrantRoot:old.grantRoot,previousReceiptRoot:state.previousReceiptRoot,reason,migratedAt};
    const migration={...base,migrationRoot:rootHash(base)};
    const nextBase={...old,sourceNodeId:base.newSourceNodeId,targetNodeId:base.newTargetNodeId,migratedFromGrantRoot:old.grantRoot,migrationRoot:migration.migrationRoot,issuedAt:migratedAt};
    delete nextBase.grantRoot; const grant={...nextBase,grantRoot:rootHash(nextBase)};
    state.grant=grant; state.migrations=[...(state.migrations??[]),migration]; return {migration,grant};
  }

  revoke(sessionId, reason='revoked') {
    const state=this.sessions.get(sessionId); if(!state) throw new TinpError('SESSION_UNKNOWN');
    state.revoked=true; state.grant={...state.grant,status:'revoked',revokeReason:reason};
    const base={format:'tinp.revoke.v0.2',protocol:TINP_PROTOCOL,sessionId,reason,grantRoot:state.grant.grantRoot};
    return {...base,revokeRoot:rootHash(base)};
  }
}
