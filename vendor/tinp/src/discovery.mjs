import {rootHash,TinpError,nowIso} from './canonical.mjs';

export class NodeDirectory {
  constructor({clock=()=>new Date()}={}){this.clock=clock;this.nodes=new Map();}
  advertise({nodeId,subjectId,endpoints=[],capabilities=[],authorityScopes=[],payloadProfiles=[],securityProfiles=[],ttlMs=60000,metadata={}}){
    if(!nodeId||!subjectId)throw new TinpError('NODE_ADVERTISEMENT_ID_REQUIRED');
    const seenAt=nowIso(this.clock), expiresAt=new Date(this.clock().getTime()+ttlMs).toISOString();
    const base={format:'tinp.node-advertisement.v0.2',nodeId,subjectId,endpoints:[...endpoints],capabilities:[...new Set(capabilities)].sort(),authorityScopes:[...new Set(authorityScopes)].sort(),payloadProfiles:[...new Set(payloadProfiles)].sort(),securityProfiles:[...new Set(securityProfiles)].sort(),metadata,seenAt,expiresAt};
    const adv={...base,advertisementRoot:rootHash(base)};this.nodes.set(nodeId,adv);return adv;
  }
  get(nodeId){const x=this.nodes.get(nodeId);if(!x)return null;if(this.clock().getTime()>=Date.parse(x.expiresAt)){this.nodes.delete(nodeId);return null;}return x;}
  list(){return [...this.nodes.keys()].map(k=>this.get(k)).filter(Boolean).sort((a,b)=>a.nodeId.localeCompare(b.nodeId));}
  findCapability(capability,{authorityScope,payloadProfile,securityProfile}={}){return this.list().filter(n=>n.capabilities.includes(capability)&&(!authorityScope||n.authorityScopes.includes(authorityScope))&&(!payloadProfile||n.payloadProfiles.includes(payloadProfile))&&(!securityProfile||n.securityProfiles.includes(securityProfile)));}
}
