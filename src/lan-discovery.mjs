import dgram from 'node:dgram';
import {encodeFrame,decodeFrame} from '../vendor/tinp/src/protocol.mjs';
import {authentic,seal,requireThat,ProtocolError} from './identity.mjs';
import {endpointPolicy,LOCAL_FIRST_POLICY} from './bearer-policy.mjs';

export const DEFAULT_DISCOVERY_GROUP='239.192.0.42';
export const DEFAULT_DISCOVERY_PORT=42688;
const MAX_DISCOVERY_BYTES=16384;

export function createLanAdvertisement({nodeId,subjectId,identity,endpoint,capabilities=[],authorityScopes=[],securityProfiles=[],ttlMs=15000,now=Date.now()}){
  requireThat(typeof nodeId==='string'&&nodeId.length>0,'DISCOVERY_NODE_ID_REQUIRED');
  requireThat(typeof subjectId==='string'&&subjectId.length>0,'DISCOVERY_SUBJECT_ID_REQUIRED');
  requireThat(endpointPolicy(endpoint,LOCAL_FIRST_POLICY).allowed,'DISCOVERY_ENDPOINT_NOT_LOCAL');
  const body={format:'tinp.lan-advertisement.v0.1',nodeId,subjectId,publicKey:identity.publicKey,endpoint,
    capabilities:[...new Set(capabilities)].sort(),authorityScopes:[...new Set(authorityScopes)].sort(),securityProfiles:[...new Set(securityProfiles)].sort(),
    issuedAtMs:now,expiresAtMs:now+ttlMs,transportScope:'local-lan',authorityGranted:false};
  return seal(body,identity.privateKey);
}

export function verifyLanAdvertisement(envelope,{trustedPeers={},policy=LOCAL_FIRST_POLICY,now=Date.now()}={}){
  const body=envelope?.body;
  requireThat(body?.format==='tinp.lan-advertisement.v0.1','DISCOVERY_FORMAT_INVALID');
  requireThat(typeof body.nodeId==='string'&&typeof body.publicKey==='string','DISCOVERY_IDENTITY_INVALID');
  requireThat(Number.isSafeInteger(body.expiresAtMs)&&body.expiresAtMs>now,'DISCOVERY_STALE');
  requireThat(body.transportScope==='local-lan'&&body.authorityGranted===false,'DISCOVERY_AUTHORITY_EXPANSION');
  const endpointDecision=endpointPolicy(body.endpoint,policy);requireThat(endpointDecision.allowed,'DISCOVERY_ENDPOINT_POLICY_DENIED');
  requireThat(authentic(envelope,body.publicKey),'DISCOVERY_SIGNATURE_INVALID');
  const expected=trustedPeers[body.nodeId];if(expected)requireThat(expected===body.publicKey,'DISCOVERY_PIN_CONFLICT');
  return {...body,trust:expected?'pinned':'unverified',advertisementRoot:envelope.root};
}

export function admitDiscoveredPeer(transport,candidate,{expectedPublicKey=null,allowExplicitTofu=false}={}){
  requireThat(candidate?.nodeId&&candidate?.endpoint&&candidate?.publicKey,'DISCOVERY_CANDIDATE_INVALID');
  if(expectedPublicKey)requireThat(expectedPublicKey===candidate.publicKey,'DISCOVERY_PIN_CONFLICT');
  else requireThat(allowExplicitTofu,'DISCOVERY_PEER_PIN_REQUIRED');
  transport.peers[candidate.nodeId]={publicKey:candidate.publicKey,endpoint:candidate.endpoint};
  return {nodeId:candidate.nodeId,trust:expectedPublicKey?'pinned':'explicit-tofu',endpoint:candidate.endpoint};
}

export class LanPeerDiscovery {
  constructor({nodeId,subjectId,identity,endpoint,capabilities=[],authorityScopes=[],securityProfiles=[],trustedPeers={},interfaceAddress,
    group=DEFAULT_DISCOVERY_GROUP,port=DEFAULT_DISCOVERY_PORT,ttlMs=15000,announceEveryMs=5000,policy=LOCAL_FIRST_POLICY}={}){
    requireThat(interfaceAddress,'DISCOVERY_INTERFACE_REQUIRED');
    this.options={nodeId,subjectId,identity,endpoint,capabilities,authorityScopes,securityProfiles,ttlMs};
    this.trustedPeers=trustedPeers;this.interfaceAddress=interfaceAddress;this.group=group;this.port=port;this.announceEveryMs=announceEveryMs;this.policy=policy;
    this.handlers=new Set();this.metrics={announced:0,received:0,rejected:0,candidates:0};this.closed=false;
  }
  onCandidate(handler){this.handlers.add(handler);return()=>this.handlers.delete(handler);}
  async start(){
    requireThat(!this.socket,'DISCOVERY_ALREADY_STARTED');this.socket=dgram.createSocket({type:'udp4',reuseAddr:true});
    this.socket.on('message',(message,rinfo)=>{if(message.length>MAX_DISCOVERY_BYTES){this.metrics.rejected++;return;}try{const frame=decodeFrame(message);if(frame.typeName!=='ROUTE_ADVERT')return;const candidate=verifyLanAdvertisement(frame.payload,{trustedPeers:this.trustedPeers,policy:this.policy});if(candidate.nodeId===this.options.nodeId)return;this.metrics.received++;this.metrics.candidates++;for(const h of this.handlers)h(candidate,rinfo);}catch{this.metrics.rejected++;}});
    await new Promise((resolve,reject)=>{this.socket.once('error',reject);this.socket.bind(this.port,'0.0.0.0',()=>{this.socket.off('error',reject);resolve();});});
    try{this.socket.addMembership(this.group,this.interfaceAddress);this.socket.setMulticastInterface(this.interfaceAddress);this.socket.setMulticastTTL(1);this.socket.setMulticastLoopback(false);}catch(error){await this.close();throw new ProtocolError('DISCOVERY_MULTICAST_UNAVAILABLE',error.message);}
    await this.announce();this.timer=setInterval(()=>this.announce().catch(()=>{this.metrics.rejected++;}),this.announceEveryMs);this.timer.unref?.();return this;
  }
  async announce(){requireThat(this.socket&&!this.closed,'DISCOVERY_NOT_STARTED');const advert=createLanAdvertisement(this.options);const bytes=encodeFrame('ROUTE_ADVERT',advert);requireThat(bytes.length<=MAX_DISCOVERY_BYTES,'DISCOVERY_FRAME_TOO_LARGE');await new Promise((resolve,reject)=>this.socket.send(bytes,this.port,this.group,error=>error?reject(error):resolve()));this.metrics.announced++;return advert;}
  async close(){this.closed=true;if(this.timer)clearInterval(this.timer);if(this.socket){const socket=this.socket;this.socket=null;await new Promise(resolve=>{try{socket.close(resolve);}catch{resolve();}});}}
}
