import fs from 'node:fs';
import path from 'node:path';
import {operatorChallenge,verifyExternalRetirement} from './operator-authorization.mjs';
import {ProtectedStore} from './protected-store.mjs';
import {authentic,requireThat} from './identity.mjs';
import {evaluatePendingRetirementGuard} from '../adapters/rcl-pending-retirement.mjs';

export function verifyRetirementAcks(s,watermark,acks){
  const w=watermark?.body;
  requireThat(w&&authentic(watermark,s.authority.publicKey)&&w.format==='twni.revocation-watermark.v1'&&
    w.requestRoot===s.pending?.request.root&&w.leaseRoot===s.lease.root&&w.epoch===s.revocationEpoch&&
    Array.isArray(w.leaseIds)&&w.leaseIds.length===1&&w.leaseIds[0]===s.lease.body.leaseId&&s.revoked,'PENDING_RETIREMENT_INVALID');
  requireThat(Array.isArray(acks)&&acks.length===3&&new Set(acks.map(x=>x?.body?.nodeId)).size===3,'PENDING_RETIREMENT_INVALID');
  for(const nodeId of ['A','B','C']){
    const ack=acks.find(x=>x?.body?.nodeId===nodeId),a=ack?.body;
    requireThat(a&&authentic(ack,s.nodeKeys[nodeId])&&a.format==='twni.revocation-ack.v1'&&a.epoch===w.epoch&&
      a.watermarkRoot===watermark.root&&Array.isArray(a.leaseIds)&&a.leaseIds.length===1&&a.leaseIds[0]===s.lease.body.leaseId,'PENDING_RETIREMENT_INVALID');
  }
}
export async function findPendingRetirement(s){
  if(s.operatorPolicy)for(const event of s.ledger.events.filter(e=>e.type==='pending.retired'))verifyExternalRetirement(s,event);
  if(!s.pending)return null;
  const found=s.ledger.events.filter(e=>e.type==='pending.retired'&&e.detail?.requestRoot===s.pending.request.root);
  requireThat(found.length<=1,'PENDING_RETIREMENT_INVALID');if(!found.length)return null;
  const d=found[0].detail;
  requireThat(d.leaseRoot===s.lease.root&&d.revocationEpoch===s.revocationEpoch&&d.executionOutcome==='unknown'&&
    d.operatorBoundary===(s.operatorPolicy?'external-aaf-operator':'explicit-local-windows-user')&&d.recovery?.pendingRoot===s.pending.request.root,'PENDING_RETIREMENT_INVALID');
  verifyRetirementAcks(s,d.watermark,d.acknowledgements);
  const guard=await evaluatePendingRetirementGuard({expectedRequestRoot:d.requestRoot,actualRequestRoot:s.pending.request.root,
    operatorAuthorized:true,leaseRevoked:s.revoked,allNodesAcknowledged:true,pendingPresent:true});
  requireThat(guard.allowed&&d.guard?.allowed===true&&['code','factsRoot','programRoot','stateRoot','sourceSha256'].every(k=>d.guard[k]===guard[k]),'PENDING_RETIREMENT_INVALID');
  return found[0];
}

// This path never creates an identity, process, checkpoint or ledger event.
export async function inspectPending(directory,{operatorKeyring}={}){
  const stateFile=path.join(directory,'private','coordinator','protected-state.dpapi'),ledgerFile=path.join(directory,'ledger.jsonl');
  requireThat(fs.existsSync(stateFile)&&fs.existsSync(ledgerFile),'RECOVERY_STATE_NOT_FOUND');
  const beforeState=fs.readFileSync(stateFile),beforeLedger=fs.readFileSync(ledgerFile);
  const s={directory,operatorKeyring,store:new ProtectedStore(path.dirname(stateFile),{purpose:'twni.coordinator-state.v1'})};
  const {loadExistingRecovery}=await import('./coordinator-state.mjs');
  loadExistingRecovery(s);
  const terminal=await findPendingRetirement(s);
  requireThat(beforeState.equals(fs.readFileSync(stateFile))&&beforeLedger.equals(fs.readFileSync(ledgerFile)),'RECOVERY_SNAPSHOT_CHANGED_RETRY');
  const q=s.pending?.request;
  return {format:'twni.pending-inspection.v1',status:terminal?'retired-awaiting-finalization':q?'pending':s.revoked?'lease-revoked':'no-pending-request',
    requestRoot:q?.root??null,requestId:q?.body.requestId??null,targetNodeId:q?.body.targetNodeId??null,
    operatorPolicy:s.operatorPolicy,operatorChallenge:s.operatorPolicy&&q?operatorChallenge(s):null,
    leaseRoot:s.lease.root,leaseRevoked:s.revoked,leaseExpiresAtMs:s.lease.body.expiresAtMs,revocationEpoch:s.revocationEpoch,
    evidenceRoot:s.ledger.root,checkpointAuthenticated:true,nodeCacheVerified:false,
    executionOutcome:q?'unknown':null,
    lastRetirement:(()=>{const e=s.ledger.events.findLast(x=>x.type==='pending.retired');return e?{requestRoot:e.detail.requestRoot,executionOutcome:e.detail.executionOutcome,eventRoot:e.eventRoot}:null;})(),
    readOnly:true,authorityBoundary:'Windows current-user local fixture; no production operator identity'};
}
