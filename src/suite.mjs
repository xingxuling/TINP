import {fork} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newIdentity,seal,authentic,rootHash,id,requireThat,ProtocolError,clone} from './identity.mjs';
import {CAPABILITY,CONTRACT_ROOT,SECURITY_PROFILE,SUITE_VERSIONS,WORLD,SUBJECT,CONTINUITY} from './contract.mjs';
import {EvidenceLedger} from './evidence.mjs';
import {ConstrainedRoutes} from './routing.mjs';
import {NodeDirectory} from '../vendor/tinp/src/discovery.mjs';
import {makeCapabilityAddress} from '../vendor/tinp/src/addressing.mjs';
import {makeHello,TINP_PROTOCOL} from '../vendor/tinp/src/protocol.mjs';
import {makeForwardEnvelope} from '../vendor/tinp/src/forwarding.mjs';
import {negotiateOpp} from '../adapters/opp-bridge.mjs';
import {evaluateSessionMigrationGuard} from '../adapters/rcl-guard.mjs';
import {initializeRecovery,admitRecovery,checkpoint,publicRecoveryState} from './coordinator-state.mjs';

class NodeChild {
  constructor(nodeId,kind,privateDirectory,allowCreate=false){
    this.nodeId=nodeId;this.pending=new Map();this.logs='';
    this.child=fork(fileURLToPath(new URL('./node-process.mjs',import.meta.url)),[nodeId,kind,...(privateDirectory?[privateDirectory,allowCreate?'create':'restore']:[])],{
      stdio:['ignore','pipe','pipe','ipc'],execArgv:[],windowsHide:true,
    });
    for(const stream of [this.child.stdout,this.child.stderr])stream.on('data',x=>{this.logs=(this.logs+x.toString('utf8')).slice(-16000);});
    this.ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new ProtocolError('NODE_START_TIMEOUT',this.logs)),10000);
      this.child.on('message',m=>{
        if(m.ready){this.info=m;clearTimeout(timer);resolve(m);return;}
        const p=this.pending.get(m.callId);if(!p)return;
        this.pending.delete(m.callId);clearTimeout(p.timer);m.ok?p.resolve(m.result):p.reject(new ProtocolError(m.error));
      });
      this.child.once('error',e=>{clearTimeout(timer);reject(e);});
      this.child.once('exit',()=>{clearTimeout(timer);reject(new ProtocolError('NODE_EXIT',this.logs));
        for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new ProtocolError('NODE_EXIT'));}this.pending.clear();});
    });
  }
  call(command,value,timeoutMs=12000){
    requireThat(this.child.connected,'NODE_OFFLINE');const callId=id('control');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(callId);reject(new ProtocolError('CONTROL_TIMEOUT',this.logs));},timeoutMs);
      this.pending.set(callId,{resolve,reject,timer});
      this.child.send({callId,command,value},error=>{if(error){clearTimeout(timer);this.pending.delete(callId);reject(error);}});
    });
  }
  async stop(){if(this.child.connected)await this.call('close').catch(()=>{});if(this.child.exitCode===null)this.child.kill();}
  async kill(){if(this.child.exitCode!==null||this.child.signalCode!==null)return;await new Promise(resolve=>{this.child.once('exit',resolve);this.child.kill();});}
}

/** Local trust fixture and orchestration. Keys are ephemeral and never put in evidence. */
export class InternetSuite {
  static async start(options={}){const suite=new InternetSuite(options);try{await suite.start();return suite;}catch(e){await suite.close();throw e;}}
  constructor({directory=path.resolve('.runs',id('run').replace(':','-')),transport='udp',timeoutMs=1500,durable=false}={}){
    this.durable=durable;this.revocationEpoch=0;this.pending=null;this.nodeKeys={};
    this.directory=directory;fs.mkdirSync(directory,{recursive:true});this.kind=transport;this.timeoutMs=timeoutMs;
    this.ledger=durable?null:new EvidenceLedger(path.join(directory,'ledger.jsonl'));
    this.authority=newIdentity();this.subjectIdentity=newIdentity();this.nodes=new Map();this.session=null;
    this.directoryService=new NodeDirectory();this.advertisements=new Map();
    this.routes=new ConstrainedRoutes().connect('A','B').connect('B','C').connect('A','C',{cost:5});
    this.level='Full';this.currentSource='A';this.queue=Promise.resolve();
    const now=Date.now();
    this.lease=seal({format:'twni.authority-lease.v0.1',leaseId:id('lease'),subjectId:SUBJECT,continuityRoot:CONTINUITY,
      worldId:WORLD,capabilityId:CAPABILITY.capabilityId,scopes:['text.read'],notBeforeMs:now-1000,expiresAtMs:now+600000,
      region:'local',maxRetentionSeconds:0,maxCost:20,maxLatencyMs:1000,maxEnergy:20,securityProfile:SECURITY_PROFILE,delegable:false,
      purpose:'local read-only Unicode code point counting experiment'},this.authority.privateKey);
    this.revoked=false;
  }
  async start(){
    if(this.durable)await initializeRecovery(this);
    for(const nodeId of ['A','B','C'])this.nodes.set(nodeId,this.makeNode(nodeId));
    const infos=await Promise.all([...this.nodes.values()].map(n=>n.ready));
    await this.configureNodes();
    const recoveryGuard=this.durable?await admitRecovery(this):null;
    if(this.pending)await this.reconcilePending();
    this.record(this.recovering?'fixture.recovered':'fixture.started',{transport:this.kind,nodes:infos.map(({nodeId,pid,endpoint,publicKey})=>({nodeId,pid,endpoint,publicKey})),
      subjectId:SUBJECT,continuityRoot:CONTINUITY,authorityPublicKey:this.authority.publicKey,recoveryGuard,
      boundary:this.durable?'Windows current-user protected state; local process recovery only.':'Three independent local processes, pinned ephemeral fixture keys, loopback only; no production enrollment.'});
    if(this.durable)await Promise.all([...this.nodes.values()].map(n=>n.call('activate')));
    this.recovering=false;return this;
  }
  makeNode(nodeId){return new NodeChild(nodeId,this.kind,this.durable?path.join(this.directory,'private','nodes',nodeId):null,!this.nodeKeys[nodeId]);}
  revocationWatermark(){return seal({format:'twni.revocation-watermark.v1',epoch:this.revocationEpoch,leaseIds:this.revoked?[this.lease.body.leaseId]:[]},this.authority.privateKey);}
  record(type,detail){
    if(this.durable)this.directoryLease.assertHeld();
    const event=this.ledger.append(type,this.durable?{...detail,recovery:publicRecoveryState(this)}:detail);checkpoint(this);return event;
  }
  async configureNodes(){
    const infos=[...this.nodes.values()].filter(n=>n.child.connected).map(n=>n.info);
    for(const info of infos){
      if(this.nodeKeys[info.nodeId])requireThat(this.nodeKeys[info.nodeId]===info.publicKey,'RECOVERY_NODE_KEY_CHANGED');
      else this.nodeKeys[info.nodeId]=info.publicKey;
    }
    const peers=Object.fromEntries(infos.map(x=>[x.nodeId,{publicKey:x.publicKey,endpoint:x.endpoint}]));
    await Promise.all([...this.nodes].filter(([,n])=>n.child.connected).map(([nodeId,node])=>node.call('configure',{
      peers,authorityKey:this.authority.publicKey,subjectKeys:{[SUBJECT]:this.subjectIdentity.publicKey},
      neighbors:['A','B','C'].filter(x=>x!==nodeId),timeoutMs:this.timeoutMs,
      routePolicy:Object.fromEntries(this.routes.policy),
      cacheFile:path.join(this.directory,`${nodeId}-execution-cache.jsonl`),
      revocations:this.durable?this.revocationWatermark():null,
      expectedReceipts:this.durable?this.ledger.events.filter(e=>e.detail?.receipt?.body.nodeId===nodeId).map(e=>e.detail.receipt):[],
    })));
    if(!this.recovering)checkpoint(this);
  }
  async wire(target,payloadType,payload,route){
    if(this.durable)this.directoryLease.assertHeld();
    route??=this.routes.plan(this.currentSource,target);
    const forward=makeForwardEnvelope({route,payloadType,payload,ttl:6});
    return this.nodes.get(this.currentSource).call('send',{forward},this.timeoutMs*3+5000);
  }
  async discover(target='C',constraints={}){
    const route=this.routes.plan(this.currentSource,target,constraints);
    const advertisement=await this.wire(target,'DISCOVER',{capabilityId:CAPABILITY.capabilityId},route);
    requireThat(authentic(advertisement,this.nodes.get(target).info.publicKey),'DISCOVERY_SIGNATURE_INVALID');
    const a=advertisement.body;requireThat(a.nodeId===target&&a.expiresAtMs>Date.now(),'DISCOVERY_STALE');
    requireThat(a.provider,'PROVIDER_UNAVAILABLE');
    const p=a.provider;
    requireThat(p.contractRoot===rootHash(p.capability) && p.contractRoot===CONTRACT_ROOT,'PROVIDER_SEMANTIC_MISMATCH');
    requireThat(p.region===this.lease.body.region&&p.retentionSeconds<=this.lease.body.maxRetentionSeconds&&p.cost+route.cost<=this.lease.body.maxCost,'PROVIDER_POLICY_MISMATCH');
    const supported=SUITE_VERSIONS.filter(v=>a.versions.includes(v));requireThat(supported.length,'PROTOCOL_VERSION_UNSUPPORTED');
    const localHello=makeHello({nodeId:this.currentSource,subjectId:SUBJECT,
      protocols:[TINP_PROTOCOL,'opp.chp.v0.1','opp.rep.v0.1'],payloadProfiles:['application/json'],capabilities:[CAPABILITY.capabilityId],
      authorityScopes:this.lease.body.scopes,securityProfiles:[SECURITY_PROFILE]});
    const agreement=await negotiateOpp({localHello,remoteHello:a.hello,localCapability:CAPABILITY,remoteCapability:p.capability});
    requireThat(agreement.handshake.payload.status==='accepted'&&agreement.capability.status==='accepted','OPP_NEGOTIATION_REJECTED');
    requireThat(agreement.handshake.payload.authorityScopes.includes('text.read'),'OPP_SCOPE_UNAVAILABLE');
    this.directoryService.advertise({...a.hello,endpoints:[this.nodes.get(target).info.endpoint],ttlMs:a.expiresAtMs-Date.now(),metadata:{advertisementRoot:advertisement.root}});
    this.advertisements.set(target,advertisement);
    const capabilityAddress=makeCapabilityAddress({capability:CAPABILITY.capabilityId,authorityScope:'text.read',payloadProfile:'application/json'});
    this.record('capability.negotiated',{target,capabilityAddress,route,advertisement,agreement,version:supported.at(-1),authorityGrantedByNegotiation:false});
    return {target,route,advertisement,agreement,version:supported.at(-1)};
  }
  async bindSession(target){
    requireThat(!this.revoked,'LEASE_REVOKED');
    const old=this.session;
    const body={format:'twni.session.v0.1',sessionId:old?.body.sessionId??id('session'),subjectId:SUBJECT,
      continuityRoot:CONTINUITY,worldId:WORLD,sourceNodeId:this.currentSource,targetNodeId:target,
      leaseRoot:this.lease.root,scopes:[...this.lease.body.scopes],expiresAtMs:this.lease.body.expiresAtMs,
      expectedEvidenceRoot:this.ledger.root,previousSessionRoot:old?.root??null};
    if(old){
      const guard=await evaluateSessionMigrationGuard({oldSubjectId:old.body.subjectId,newSubjectId:body.subjectId,
        oldContinuityRoot:old.body.continuityRoot,newContinuityRoot:body.continuityRoot,oldWorldId:old.body.worldId,newWorldId:body.worldId,
        oldExpiresAtMs:old.body.expiresAtMs,newExpiresAtMs:body.expiresAtMs,oldScopes:old.body.scopes,newScopes:body.scopes});
      requireThat(guard.allowed,guard.code);body.migrationGuard={programRoot:guard.programRoot,stateRoot:guard.stateRoot,sourceSha256:guard.sourceSha256};
    }
    this.session=seal(body,this.authority.privateKey);checkpoint(this);return this.session;
  }
  async buildRequest(text,selection,{requestId=id('intent'),overrides={}}={}){
    const session=await this.bindSession(selection.target);
    return seal({format:'twni.execute.v0.1',version:selection.version,requestId,subjectId:SUBJECT,worldId:WORLD,
      capabilityId:CAPABILITY.capabilityId,capabilityVersion:CAPABILITY.version,contractRoot:CONTRACT_ROOT,
      targetNodeId:selection.target,sessionId:session.body.sessionId,session,lease:this.lease,
      authorityScope:'text.read',classification:'candidate-read-only',payload:{text},
      route:selection.route,previousEvidenceRoot:this.ledger.root,...overrides},this.subjectIdentity.privateKey);
  }
  verifyReceipt(receipt,request){
    const r=receipt?.body,q=request.body;
    requireThat(r && authentic(receipt,this.nodes.get(q.targetNodeId).info.publicKey),'RECEIPT_SIGNATURE_INVALID');
    requireThat(r.format==='twni.execution-receipt.v0.1'&&r.status==='executed'&&r.classification==='observed-local'&&
      r.worldId===q.worldId&&r.capabilityId===q.capabilityId&&r.capabilityVersion===q.capabilityVersion&&r.version===q.version&&
      r.nodeId===q.targetNodeId&&r.requestId===q.requestId&&rootHash(r.route)===rootHash(q.route.path)&&
      r.requestRoot===request.root&&r.previousEvidenceRoot===q.previousEvidenceRoot&&r.subjectId===q.subjectId&&
      r.continuityRoot===q.session.body.continuityRoot&&r.sessionId===q.sessionId&&r.contractRoot===q.contractRoot&&
      r.inputRoot===rootHash(q.payload)&&r.resultRoot===rootHash(r.result)&&r.leaseRoot===q.lease.root&&r.guard?.allowed===true&&r.routeGuard?.allowed===true,'RECEIPT_BINDING_INVALID');
    // Independently check this tiny pure capability's acceptance condition.
    requireThat(r.result.count===[...q.payload.text].length,'PROVIDER_RESULT_INCORRECT');
    return r;
  }
  async executeSelection(text,selection){
    requireThat(!this.pending,'PENDING_RECONCILIATION_REQUIRED');
    const request=await this.buildRequest(text,selection);
    if(this.durable){this.pending={request,selection};checkpoint(this);}
    let receipt,retries=0;
    try{receipt=await this.wire(selection.target,'INTENT',request,selection.route);}
    catch(error){
      if(!['TRANSPORT_TIMEOUT','TCP_TIMEOUT'].includes(error.code))throw error;
      // Reconcile an ambiguous response with the exact signed request and anchor.
      // The service's persistent deduplication returns the existing receipt if it executed.
      retries=1;receipt=await this.wire(selection.target,'INTENT',request,selection.route);
    }
    const verified=this.verifyReceipt(receipt,request);
    this.record('execution.verified',{receipt,requestRoot:request.root,level:this.level,exactRequestRetries:retries});
    if(this.durable){this.pending=null;checkpoint(this);}
    return {status:'executed',level:this.level,result:verified.result,receipt,request};
  }
  setLevel(level,reason){if(this.level!==level){this.level=level;this.record('continuity.degraded',{level,reason,subjectId:SUBJECT,continuityRoot:CONTINUITY,authorityExpanded:false});}}
  use(text){const p=this.queue.then(()=>this._use(text));this.queue=p.catch(()=>{});return p;}
  async _use(text){
    requireThat(typeof text==='string'&&[...text].length<=4096,'INPUT_INVALID');
    requireThat(!this.pending,'PENDING_RECONCILIATION_REQUIRED');
    if(this.revoked){this.record('request.denied',{code:'LEASE_REVOKED'});throw new ProtocolError('LEASE_REVOKED');}
    const targets=['C','B',this.currentSource].filter((v,i,a)=>a.indexOf(v)===i);
    let failures=[];
    for(const target of targets){
      try{
        const selection=await this.discover(target);
        if(target===this.currentSource)this.setLevel('Isolated','Only the pre-authorized local provider is reachable');
        else if(target!=='C')this.setLevel('Essential','Use the alternate contract-identical provider');
        else if(selection.route.path.length===2||selection.route.bandwidth<100000)this.setLevel('Reduced','Backup path or reduced link bandwidth');
        else this.setLevel('Full','Preferred route and provider available');
        if(this.session && this.session.body.targetNodeId!==target)this.record('session.migrating',{
          sessionId:this.session.body.sessionId,from:this.session.body.targetNodeId,to:target,subjectId:SUBJECT,continuityRoot:CONTINUITY,
          previousSessionRoot:this.session.root,previousEvidenceRoot:this.ledger.root});
        return await this.executeSelection(text,selection);
      }catch(error){
        failures.push({target,code:error.code??error.message});this.record('attempt.failed',failures.at(-1));
        if(this.pending)throw new ProtocolError('PENDING_RECONCILIATION_REQUIRED');
        if(['TRANSPORT_TIMEOUT','LINK_UNAVAILABLE','NODE_OFFLINE','NODE_EXIT','NO_ELIGIBLE_PATH','TCP_TIMEOUT','ECONNREFUSED'].includes(error.code)){
          // A timeout during execution is ambiguous. Pure read-only operation permits retry; not a side-effect transaction protocol.
          if(target!==this.currentSource && this.routes.policy.has(`${this.currentSource}|${target}`))this.routes.set(this.currentSource,target,{up:false});
          // Quarantine the failed primary relay for this bounded local topology.
          if(target==='C'&&this.currentSource==='A'&&this.routes.policy.get('A|B')?.up){
            this.routes.set('A','B',{up:false});this.routes.set('A','C',{up:true});
            try{const selection=await this.discover('C');this.setLevel('Reduced','Primary relay failed; authenticated alternate path');return await this.executeSelection(text,selection);}catch(e){failures.push({target:'C-backup',code:e.code??e.message});}
          }
        }else if(!['PROVIDER_UNAVAILABLE','PROVIDER_SEMANTIC_MISMATCH','PROTOCOL_VERSION_UNSUPPORTED','PROVIDER_POLICY_MISMATCH','OPP_PROFILE_VERSION_MISMATCH'].includes(error.code))throw error;
      }
    }
    this.setLevel('Survival','No callable provider; retain identity, lease, session and durable evidence');
    return {status:'deferred',level:this.level,reason:'NO_AUTHORIZED_PROVIDER',failures,subjectId:SUBJECT,continuityRoot:CONTINUITY,evidenceRoot:this.ledger.root};
  }
  async revoke(){
    this.revoked=true;this.revocationEpoch++;checkpoint(this);
    const outcomes=await Promise.allSettled([...this.nodes.values()].map(n=>n.call('revoke',this.durable?this.revocationWatermark():this.lease.body.leaseId)));
    this.record('authority.revoked',{leaseId:this.lease.body.leaseId,revocationEpoch:this.revocationEpoch,outcomes:outcomes.map(x=>x.status),offlineRevocationBoundary:'A disconnected node cannot learn a new revocation; reconnect loads signed watermark before execution.'});
  }
  async replaceProvider(nodeId,manifest){
    const old=this.advertisements.get(nodeId)?.body.provider;
    requireThat(old,'PROVIDER_PREVIOUS_MANIFEST_REQUIRED');
    try{
      requireThat(manifest.contractRoot===rootHash(manifest.capability)&&manifest.contractRoot===CONTRACT_ROOT,'PROVIDER_SEMANTIC_MISMATCH');
      await this.nodes.get(nodeId).call('provider',{manifest});
      await this.discover(nodeId);
      this.record('provider.replaced',{nodeId,oldProvider:old.providerId,newProvider:manifest.providerId,contractRoot:CONTRACT_ROOT});
    }catch(error){
      await this.nodes.get(nodeId).call('provider',{manifest:old});
      this.record('provider.rollback',{nodeId,restored:old.providerId,code:error.code??error.message});throw error;
    }
  }
  async migrateSource(nodeId){
    requireThat(this.nodes.has(nodeId)&&this.nodes.get(nodeId).child.connected,'SOURCE_NODE_UNAVAILABLE');
    const previous=this.currentSource;this.currentSource=nodeId;
    checkpoint(this);
    this.record('subject.body-migrated',{subjectId:SUBJECT,continuityRoot:CONTINUITY,previousNodeId:previous,newNodeId:nodeId,sessionId:this.session?.body.sessionId??null});
  }
  async reconcilePending(){
    if(!this.pending)return {status:'no-pending-request'};
    const {request,selection}=this.pending;
    const existing=this.ledger.events.find(e=>e.detail?.receipt?.body.requestRoot===request.root);
    const receipt=existing?.detail.receipt??await this.wire(selection.target,'RECEIPT_LOOKUP',request,selection.route);
    this.verifyReceipt(receipt,request);
    if(!existing)this.record('recovery.receipt-reconciled',{receipt,requestRoot:request.root,executionResent:false});
    this.pending=null;checkpoint(this);
    return {status:'reconciled',receipt,executionResent:false};
  }
  async restartNode(nodeId){
    requireThat(this.durable,'PERSISTENT_MODE_REQUIRED');this.directoryLease.assertHeld();
    const baseline={lease:clone(this.lease),revocationEpoch:this.revocationEpoch,ledgerLength:this.ledger.events.length,ledgerRoot:this.ledger.root};
    await this.nodes.get(nodeId).stop();
    const node=this.makeNode(nodeId);this.nodes.set(nodeId,node);await node.ready;
    await this.configureNodes();
    const recoveryGuard=await admitRecovery(this,baseline);
    this.record('node.recovered',{nodeId,pid:node.info.pid,publicKey:node.info.publicKey,recoveryGuard});
    await Promise.all([...this.nodes.values()].filter(n=>n.child.connected).map(n=>n.call('activate')));
    return node.info;
  }
  async stats(){return Promise.all([...this.nodes.values()].filter(n=>n.child.connected).map(n=>n.call('stats')));}
  async close(){await Promise.all([...this.nodes.values()].map(n=>n.stop()));await this.directoryLease?.release();}
}

export function parseLifeIntent(text){
  const match=/^我要使用字符计数能力完成[：:]([\s\S]*)$/.exec(text);
  requireThat(match,'INTENT_UNSUPPORTED');return {capabilityId:CAPABILITY.capabilityId,text:match[1]};
}
