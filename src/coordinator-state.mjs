import fs from 'node:fs';
import path from 'node:path';
import {ProtectedStore} from './protected-store.mjs';
import {acquireDirectoryLease} from './directory-lease.mjs';
import {EvidenceLedger,GENESIS} from './evidence.mjs';
import {seal,authentic,requireThat,clone,rootHash} from './identity.mjs';
import {SUBJECT,CONTINUITY,WORLD} from './contract.mjs';
import {evaluateRecoveryGuard} from '../adapters/rcl-recovery-guard.mjs';

export function publicRecoveryState(s){return {session:s.session,lease:s.lease,currentSource:s.currentSource,
  revoked:s.revoked,revocationEpoch:s.revocationEpoch,pendingRoot:s.pending?.request.root??null};}
export function checkpoint(s){
  if(!s.durable||!s.store)return;
  s.directoryLease.assertHeld();
  s.store.save({format:'twni.coordinator-state.v1',authority:s.authority,subjectIdentity:s.subjectIdentity,
    ...publicRecoveryState(s),pending:s.pending,nodeKeys:s.nodeKeys,
    ledgerLength:s.ledger.events.length,ledgerRoot:s.ledger.root,lastSeenMs:Date.now()});
}
function verifyCore(s){
  requireThat(authentic(seal({probe:'authority'},s.authority.privateKey),s.authority.publicKey)&&
    authentic(seal({probe:'subject'},s.subjectIdentity.privateKey),s.subjectIdentity.publicKey),'RECOVERY_KEY_INVALID');
  const lease=s.lease?.body;
  requireThat(authentic(s.lease,s.authority.publicKey)&&lease.subjectId===SUBJECT&&lease.continuityRoot===CONTINUITY&&lease.worldId===WORLD,'RECOVERY_LEASE_INVALID');
  requireThat(Number.isSafeInteger(s.revocationEpoch)&&s.revocationEpoch>=0&&typeof s.revoked==='boolean','RECOVERY_REVOCATION_INVALID');
  requireThat(s.revoked===(s.revocationEpoch>0),'RECOVERY_REVOCATION_INVALID');
  if(s.session){const q=s.session.body;
    requireThat(authentic(s.session,s.authority.publicKey)&&q.leaseRoot===s.lease.root&&q.subjectId===lease.subjectId&&
      q.continuityRoot===lease.continuityRoot&&q.worldId===lease.worldId&&Number.isSafeInteger(q.expiresAtMs)&&q.expiresAtMs<=lease.expiresAtMs&&
      Array.isArray(q.scopes)&&q.scopes.every(x=>lease.scopes.includes(x)),'RECOVERY_SESSION_INVALID');
  }
  if(s.pending){const q=s.pending.request?.body,selection=s.pending.selection;
    requireThat(q&&authentic(s.pending.request,s.subjectIdentity.publicKey)&&q.sessionId===s.session?.body.sessionId&&
      q.session?.root===s.session.root&&q.lease?.root===s.lease.root&&q.subjectId===SUBJECT&&q.worldId===WORLD&&
      q.targetNodeId===selection?.target&&q.route&&selection?.route&&rootHash(q.route)===rootHash(selection.route)&&
      q.previousEvidenceRoot===q.session.body.expectedEvidenceRoot,'RECOVERY_PENDING_INVALID');
  }
}
export async function initializeRecovery(s){
  s.directoryLease=await acquireDirectoryLease(s.directory);
  s.store=new ProtectedStore(path.join(s.directory,'private','coordinator'),{purpose:'twni.coordinator-state.v1'});
  const exists=s.store.exists;
  if(exists){
    loadExistingRecovery(s);
  }else{
    const ledger=path.join(s.directory,'ledger.jsonl');
    requireThat(!fs.existsSync(ledger)||fs.statSync(ledger).size===0,'LEGACY_STATE_REQUIRES_MIGRATION');
    s.ledger=new EvidenceLedger(ledger,{identity:s.authority});s.nodeKeys={};checkpoint(s);
  }
}
export function loadExistingRecovery(s){
    const saved=s.store.load();s.savedRecovery=clone(saved);
    requireThat(saved.format==='twni.coordinator-state.v1'&&Number.isSafeInteger(saved.lastSeenMs)&&Date.now()>=saved.lastSeenMs,'RECOVERY_CLOCK_OR_FORMAT_INVALID');
    for(const k of ['authority','subjectIdentity','session','lease','currentSource','revoked','revocationEpoch','pending','nodeKeys'])s[k]=saved[k];
    requireThat(saved.pendingRoot===(s.pending?.request.root??null),'RECOVERY_PENDING_INVALID');
    verifyCore(s);
    s.ledger=new EvidenceLedger(path.join(s.directory,'ledger.jsonl'),{identity:s.authority});
    requireThat(Number.isSafeInteger(saved.ledgerLength)&&saved.ledgerLength>=0&&saved.ledgerLength<=s.ledger.events.length,'RECOVERY_CHECKPOINT_TRUNCATED');
    requireThat((saved.ledgerLength?s.ledger.events[saved.ledgerLength-1].eventRoot:GENESIS)===saved.ledgerRoot,'RECOVERY_CHECKPOINT_MISMATCH');
    for(const event of s.ledger.events.slice(saved.ledgerLength)){
      const recovery=event.detail?.recovery;
      requireThat(recovery&&recovery.pendingRoot===(s.pending?.request.root??null),'RECOVERY_SUFFIX_UNRESOLVED');
      requireThat(recovery.revocationEpoch>=s.revocationEpoch&&(!s.revoked||recovery.revoked),'RECOVERY_REVOCATION_ROLLBACK');
      for(const k of ['session','lease','currentSource','revoked','revocationEpoch'])s[k]=recovery[k];
      verifyCore(s);
    }
    requireThat(s.lease.root===saved.lease.root,'RECOVERY_LEASE_REISSUED');
    if(saved.session&&s.session){
      requireThat(s.session.body.sessionId===saved.session.body.sessionId&&s.session.body.expiresAtMs<=saved.session.body.expiresAtMs&&
        s.session.body.scopes.every(x=>saved.session.body.scopes.includes(x)),'RECOVERY_SESSION_EXPANSION');
    }
    s.recovering=true;
}
export async function admitRecovery(s,baseline=s.savedRecovery){
  if(!baseline)return null;
  verifyCore(s);
  const before=baseline.lease.body,after=s.lease.body;
  const guard=await evaluateRecoveryGuard({oldSubjectId:before.subjectId,newSubjectId:after.subjectId,
    oldContinuityRoot:before.continuityRoot,newContinuityRoot:after.continuityRoot,oldWorldId:before.worldId,newWorldId:after.worldId,
    oldExpiresAtMs:before.expiresAtMs,newExpiresAtMs:after.expiresAtMs,
    persistedRevocationEpoch:baseline.revocationEpoch,currentRevocationEpoch:s.revocationEpoch,
    persistedEvidenceRoot:baseline.ledgerRoot,recoveredEvidenceRoot:baseline.ledgerLength?s.ledger.events[baseline.ledgerLength-1]?.eventRoot:GENESIS,
    stateAuthenticated:true,cacheVerified:true});
  requireThat(guard.allowed,guard.code);return guard;
}
