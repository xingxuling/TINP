import {ProtectedStore} from './protected-store.mjs';
import {newIdentity,seal,authentic,requireThat,rootHash} from './identity.mjs';
import {providerManifest,SUITE_VERSIONS} from './contract.mjs';
export function validateCacheEntries(entries,identity,nodeId){
  requireThat(Array.isArray(entries)&&entries.length<=10000,'RECOVERY_CACHE_INVALID');
  const keys=new Set(),anchors=new Set();let count=0;
  for(const entry of entries){
    const r=entry?.receipt?.body;
    requireThat(r && authentic(entry.receipt,identity.publicKey),'RECOVERY_CACHE_SIGNATURE_INVALID');
    requireThat(r.format==='twni.execution-receipt.v0.1'&&r.nodeId===nodeId&&r.status==='executed'&&r.classification==='observed-local','RECOVERY_CACHE_BINDING_INVALID');
    requireThat(entry.key===`${r.sessionId}|${r.requestId}`&&entry.anchorKey===`${r.sessionId}|${r.previousEvidenceRoot}`&&entry.requestRoot===r.requestRoot&&rootHash(r.result)===r.resultRoot,'RECOVERY_CACHE_BINDING_INVALID');
    requireThat(!keys.has(entry.key)&&!anchors.has(entry.anchorKey),'RECOVERY_CACHE_DUPLICATE');
    requireThat(r.executionCount===++count,'RECOVERY_CACHE_SEQUENCE_INVALID');
    keys.add(entry.key);anchors.add(entry.anchorKey);
  }
  return count;
}
export function openNodeState(directory,nodeId,allowCreate){
  const store=new ProtectedStore(directory,{purpose:`twni.node-state.v1:${nodeId}`});
  requireThat(store.exists||allowCreate,'RECOVERY_NODE_STATE_MISSING');
  const state=store.exists?store.load():{format:'twni.node-state.v1',nodeId,identity:newIdentity(),entries:[],executions:0,
    revoked:[],revocationEpoch:0,provider:providerManifest(nodeId),providerEnabled:true,versions:[...SUITE_VERSIONS],providerEpoch:0};
  requireThat(state.format==='twni.node-state.v1'&&state.nodeId===nodeId,'RECOVERY_NODE_BINDING_INVALID');
  requireThat(authentic(seal({probe:nodeId},state.identity.privateKey),state.identity.publicKey),'RECOVERY_NODE_KEY_INVALID');
  requireThat(validateCacheEntries(state.entries,state.identity,nodeId)===state.executions,'RECOVERY_CACHE_COUNT_INVALID');
  requireThat(Array.isArray(state.revoked)&&state.revoked.every(x=>typeof x==='string')&&Number.isSafeInteger(state.revocationEpoch)&&state.revocationEpoch>=0,'RECOVERY_REVOCATION_INVALID');
  if(!store.exists)store.save(state);
  return {store,state};
}
