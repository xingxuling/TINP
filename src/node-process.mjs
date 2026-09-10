import fs from 'node:fs';
import {LocalTransport} from './transport.mjs';
import {newIdentity,seal,authentic,rootHash,requireThat,ProtocolError} from './identity.mjs';
import {CAPABILITY,CONTRACT_ROOT,SECURITY_PROFILE,SUITE_VERSIONS,providerManifest} from './contract.mjs';
import {makeHello,TINP_PROTOCOL} from '../vendor/tinp/src/protocol.mjs';
import {forwardNext} from '../vendor/tinp/src/forwarding.mjs';
import {evaluateTransactionGuard} from '../adapters/rcl-guard.mjs';
import {evaluateRouteAdmissionGuard} from '../adapters/rcl-route-guard.mjs';

const nodeId=process.argv[2],kind=process.argv[3];
const identity=newIdentity();
const transport=await new LocalTransport({nodeId,identity,kind}).bind();
let config,provider=providerManifest(nodeId),providerEnabled=true,versions=[...SUITE_VERSIONS];
let executions=0,epoch=0;
const revoked=new Set(),cache=new Map(),consumedAnchors=new Set();
// Serialize the service admission/execute/cache sequence, including concurrent duplicates.
let executionQueue=Promise.resolve();
function serialize(fn){const p=executionQueue.then(fn);executionQueue=p.catch(()=>{});return p;}
function hello(){return makeHello({nodeId,subjectId:`subject:service-${nodeId}`,
  protocols:[TINP_PROTOCOL,'opp.chp.v0.1','opp.rep.v0.1'],payloadProfiles:['application/json'],
  capabilities:providerEnabled?[provider.capability.capabilityId]:[],authorityScopes:['text.read'],securityProfiles:[SECURITY_PROFILE]});}

async function execute(signedRequest,networkPath){
  const req=signedRequest?.body;
  requireThat(req && req.format==='twni.execute.v0.1','REQUEST_FORMAT_INVALID');
  const subjectKey=config.subjectKeys[req.subjectId];
  const lease=req.lease?.body,session=req.session?.body;
  requireThat(lease && session,'AUTHORITY_REQUIRED');
  requireThat(authentic(req.lease,config.authorityKey),'LEASE_SIGNATURE_INVALID');
  requireThat(authentic(req.session,config.authorityKey),'SESSION_SIGNATURE_INVALID');
  requireThat(versions.includes(req.version),'PROTOCOL_VERSION_UNSUPPORTED');
  requireThat(req.targetNodeId===nodeId && rootHash(req.route.path)===rootHash(networkPath),'ROUTE_BINDING_MISMATCH');
  const {routeRoot,...routeBody}=req.route;
  requireThat(rootHash(routeBody)===routeRoot && req.route.source===networkPath[0] && req.route.target===nodeId,'ROUTE_ROOT_INVALID');
  requireThat(session.sourceNodeId===networkPath[0],'SESSION_SOURCE_BINDING_MISMATCH');
  requireThat(session.targetNodeId===nodeId && session.sessionId===req.sessionId && session.leaseRoot===req.lease.root,'SESSION_BINDING_MISMATCH');
  requireThat(session.continuityRoot===lease.continuityRoot && session.worldId===lease.worldId,'CONTINUITY_BINDING_MISMATCH');
  requireThat(Number.isSafeInteger(session.expiresAtMs) && session.expiresAtMs<=lease.expiresAtMs,'SESSION_EXPIRY_EXPANSION');
  requireThat(Array.isArray(session.scopes)&&session.scopes.every(x=>lease.scopes.includes(x)),'AUTHORITY_EXPANSION');
  requireThat(req.classification==='candidate-read-only','AUTHORITATIVE_ACTION_UNSUPPORTED');
  requireThat(providerEnabled,'PROVIDER_UNAVAILABLE');
  requireThat(provider.region===lease.region && provider.retentionSeconds<=lease.maxRetentionSeconds && provider.cost<=lease.maxCost,'PROVIDER_POLICY_MISMATCH');
  requireThat(req.payload && Object.keys(req.payload).length===1 && typeof req.payload.text==='string' && [...req.payload.text].length<=4096,'PAYLOAD_INVALID');
  requireThat(typeof req.requestId==='string' && req.requestId.length>0 && req.requestId.length<=128,'REQUEST_ID_INVALID');
  let trustedRouteCost=0,trustedLatencyMs=0,trustedEnergy=0;
  for(let i=1;i<networkPath.length;i++){
    const edge=config.routePolicy[`${networkPath[i-1]}|${networkPath[i]}`];
    requireThat(edge && edge.region===lease.region,'ROUTE_POLICY_MISMATCH');trustedRouteCost+=edge.cost;trustedLatencyMs+=edge.latencyMs;trustedEnergy+=edge.energy;
  }
  requireThat(req.route.cost===trustedRouteCost,'ROUTE_POLICY_MISMATCH');
  const routeGuard=await evaluateRouteAdmissionGuard({routeCost:trustedRouteCost,providerCost:provider.cost,maxCost:lease.maxCost,
    routeLatencyMs:trustedLatencyMs+provider.latencyMs,maxLatencyMs:lease.maxLatencyMs,
    routeEnergy:trustedEnergy+provider.energy,maxEnergy:lease.maxEnergy,routeRegion:req.route.region,leaseRegion:lease.region,
    routeReachable:true,securityFloorMet:lease.securityProfile===SECURITY_PROFILE&&provider.securityProfile===SECURITY_PROFILE});
  requireThat(routeGuard.allowed,routeGuard.code);
  const guard=await evaluateTransactionGuard({
    subjectId:req.subjectId,sessionSubjectId:session.subjectId,leaseSubjectId:lease.subjectId,
    worldId:req.worldId,leaseWorldId:lease.worldId,capabilityId:req.capabilityId,leaseCapabilityId:lease.capabilityId,
    capabilityVersion:req.capabilityVersion,providerCapabilityVersion:provider.capability.version,
    contractRoot:req.contractRoot,providerContractRoot:provider.contractRoot,
    nowMs:Date.now(),notBeforeMs:lease.notBeforeMs,expiresAtMs:Math.min(lease.expiresAtMs,session.expiresAtMs),
    signatureVerified:Boolean(subjectKey)&&authentic(signedRequest,subjectKey),sessionVerified:true,
    revoked:revoked.has(lease.leaseId),scopeAllowed:lease.scopes.includes(req.authorityScope)&&session.scopes.includes(req.authorityScope)&&provider.capability.authorityRequired.every(s=>session.scopes.includes(s)),
    securityFloorMet:lease.securityProfile===SECURITY_PROFILE&&provider.securityProfile===SECURITY_PROFILE,
    evidenceContinuous:req.previousEvidenceRoot===session.expectedEvidenceRoot,
  });
  requireThat(guard.allowed,guard.code);
  const key=`${req.sessionId}|${req.requestId}`;
  if(cache.has(key)){
    const old=cache.get(key);requireThat(old.requestRoot===signedRequest.root,'REPLAY_CONFLICT');return old.receipt;
  }
  const anchorKey=`${req.sessionId}|${req.previousEvidenceRoot}`;
  requireThat(!consumedAnchors.has(anchorKey),'EVIDENCE_ANCHOR_CONSUMED');
  const result={count:[...req.payload.text].length};executions++;
  const receipt=seal({format:'twni.execution-receipt.v0.1',status:'executed',classification:'observed-local',
    subjectId:req.subjectId,continuityRoot:session.continuityRoot,worldId:req.worldId,nodeId,providerId:provider.providerId,
    capabilityId:req.capabilityId,capabilityVersion:provider.capability.version,contractRoot:provider.contractRoot,
    sessionId:req.sessionId,requestId:req.requestId,requestRoot:signedRequest.root,leaseRoot:req.lease.root,
    previousEvidenceRoot:req.previousEvidenceRoot,route:req.route.path,version:req.version,
    inputRoot:rootHash(req.payload),result,resultRoot:rootHash(result),time:new Date().toISOString(),
    guard:{allowed:guard.allowed,programRoot:guard.programRoot,stateRoot:guard.stateRoot,sourceSha256:guard.sourceSha256},
    routeGuard:{allowed:routeGuard.allowed,programRoot:routeGuard.programRoot,stateRoot:routeGuard.stateRoot,sourceSha256:routeGuard.sourceSha256},
    executionCount:executions,providerEpoch:epoch},identity.privateKey);
  const entry={key,anchorKey,requestRoot:signedRequest.root,receipt};
  // Pure computation only. Persist before acknowledgement; no general exactly-once side-effect claim.
  const fd=fs.openSync(config.cacheFile,'a');try{fs.writeSync(fd,JSON.stringify(entry)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  cache.set(key,entry);consumedAnchors.add(anchorKey);return receipt;
}

async function onOperation(operation,previousNode=null){
  requireThat(config,'NODE_NOT_CONFIGURED');
  const env=operation?.forward;
  requireThat(env && Array.isArray(env.path)&&env.path.length<=5 && new Set(env.path).size===env.path.length,'ROUTE_INVALID');
  const {forwardRoot,...base}=env;requireThat(rootHash(base)===forwardRoot,'FORWARD_ROOT_INVALID');
  requireThat(Number.isInteger(env.hopIndex)&&env.hopIndex>=0&&env.hopIndex<env.path.length,'HOP_INVALID');
  if(previousNode)requireThat(env.hopIndex>0&&env.path[env.hopIndex-1]===previousNode,'PREDECESSOR_INVALID');
  else requireThat(env.hopIndex===0 && env.path[0]===nodeId,'SOURCE_HOP_INVALID');
  const step=forwardNext(env,nodeId);
  if(!step.delivered){
    requireThat(config.neighbors.includes(step.nextNodeId),'UNREGISTERED_EDGE');
    return transport.request(step.nextNodeId,{forward:step.envelope},config.timeoutMs);
  }
  if(env.payloadType==='DISCOVER')return seal({format:'twni.discovery.v0.1',nodeId,hello:hello(),provider:providerEnabled?provider:null,
    versions,expiresAtMs:Date.now()+5000,epoch},identity.privateKey);
  if(env.payloadType==='INTENT')return serialize(()=>execute(env.payload,env.path));
  throw new ProtocolError('OPERATION_UNSUPPORTED');
}
transport.handler=onOperation;

process.on('message',async message=>{
  const {callId,command,value}=message;
  try{
    let result;
    if(command==='configure'){
      config=value;transport.peers=value.peers;
      if(fs.existsSync(config.cacheFile))for(const line of fs.readFileSync(config.cacheFile,'utf8').trimEnd().split('\n').filter(Boolean)){
        const entry=JSON.parse(line);cache.set(entry.key,entry);if(entry.anchorKey)consumedAnchors.add(entry.anchorKey);
      }
      result={configured:true};
    } else if(command==='send')result=await onOperation(value);
    else if(command==='provider'){
      providerEnabled=value.enabled??true;
      if(value.manifest){provider=value.manifest;epoch++;}
      result={providerEnabled,provider,epoch};
    }else if(command==='version'){versions=value;result=versions;}
    else if(command==='revoke'){revoked.add(value);result={revoked:value};}
    else if(command==='fault'){transport.blocked=new Set(value.blocked??[]);transport.bandwidth=value.bandwidth??0;result={applied:true};}
    else if(command==='stats')result={nodeId,pid:process.pid,executions,metrics:transport.metrics,cacheEntries:cache.size};
    else if(command==='close'){await transport.close();process.send({callId,ok:true,result:{closed:true}},()=>process.exit(0));return;}
    else throw new ProtocolError('CONTROL_COMMAND_UNKNOWN');
    process.send({callId,ok:true,result});
  }catch(error){process.send({callId,ok:false,error:error.code??error.message});}
});
process.on('disconnect',()=>{transport.close().finally(()=>process.exit(0));});
process.send({ready:true,nodeId,pid:process.pid,endpoint:transport.endpoint(),publicKey:identity.publicKey});
