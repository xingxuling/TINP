import path from 'node:path';
import {ProtectedStore} from './protected-store.mjs';
import {acquireDirectoryLease} from './directory-lease.mjs';
import {rootHash,ProtocolError} from './identity.mjs';

const FORMAT='twni.exact-action-replay-state.v1';
const MAX_ENTRIES=100000;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function fail(code){throw new ProtocolError(code);}
function check(ok,code){if(!ok)fail(code);}

function validateState(state,{policyRoot,nowMs=Date.now()}={}){
  check(state&&typeof state==='object'&&!Array.isArray(state),'EXACT_REPLAY_STATE_INVALID');
  check(state.format===FORMAT&&state.policyRoot===policyRoot,'EXACT_REPLAY_POLICY_MISMATCH');
  check(Number.isSafeInteger(state.lastSeenMs)&&state.lastSeenMs>=0&&nowMs>=state.lastSeenMs,'EXACT_REPLAY_CLOCK_ROLLBACK');
  check(Array.isArray(state.consumed)&&state.consumed.length<=MAX_ENTRIES,'EXACT_REPLAY_STATE_INVALID');
  const seen=new Set();
  for(const entry of state.consumed){
    check(entry&&typeof entry==='object'&&!Array.isArray(entry),'EXACT_REPLAY_STATE_INVALID');
    check(Object.keys(entry).sort().join('|')==='approvalRoot|challengeRoot|consumedAtMs','EXACT_REPLAY_STATE_INVALID');
    check(hex(entry.challengeRoot)&&hex(entry.approvalRoot)&&Number.isSafeInteger(entry.consumedAtMs)&&
      entry.consumedAtMs>=0&&entry.consumedAtMs<=state.lastSeenMs,'EXACT_REPLAY_STATE_INVALID');
    check(!seen.has(entry.challengeRoot),'EXACT_REPLAY_STATE_DUPLICATE');
    seen.add(entry.challengeRoot);
  }
  return seen;
}

/**
 * Windows protected persistent one-shot store.
 * A challenge is durably consumed before provider invocation.
 * This gives at-most-once authorization attempts, not exactly-once side effects.
 */
export class DurableExactActionReplayGuard{
  static async open({directory,policyRoot}={}){
    check(typeof directory==='string'&&directory.length>0,'EXACT_REPLAY_DIRECTORY_REQUIRED');
    check(hex(policyRoot),'EXACT_REPLAY_POLICY_ROOT_INVALID');
    const resolved=path.resolve(directory);
    const lease=await acquireDirectoryLease(resolved);
    try{
      const store=new ProtectedStore(path.join(resolved,'private'),{
        purpose:`twni.exact-action-replay.v1:${policyRoot}`,
      });
      const now=Date.now();
      let state;
      if(store.exists){
        state=store.load();
        validateState(state,{policyRoot,nowMs:now});
        if(now>state.lastSeenMs){
          state={...state,lastSeenMs:now};
          store.save(state);
        }
      }else{
        state={format:FORMAT,policyRoot,lastSeenMs:now,consumed:[]};
        store.save(state);
      }
      return new DurableExactActionReplayGuard({directory:resolved,policyRoot,lease,store,state});
    }catch(error){
      await lease.release().catch(()=>{});
      throw error;
    }
  }

  constructor({directory,policyRoot,lease,store,state}){
    this.directory=directory;
    this.policyRoot=policyRoot;
    this.lease=lease;
    this.store=store;
    this.state=structuredClone(state);
    this.consumed=validateState(this.state,{policyRoot,nowMs:Date.now()});
    this.closed=false;
  }

  #held(){
    check(!this.closed,'EXACT_REPLAY_STORE_CLOSED');
    this.lease.assertHeld();
  }

  consume(verification){
    this.#held();
    check(verification&&hex(verification.approvalRoot)&&hex(verification.challengeRoot),
      'EXACT_ACTION_VERIFICATION_INVALID');
    check(!this.consumed.has(verification.challengeRoot),'EXACT_ACTION_APPROVAL_REPLAY');
    check(this.state.consumed.length<MAX_ENTRIES,'EXACT_REPLAY_CAPACITY');
    const now=Date.now();
    check(now>=this.state.lastSeenMs,'EXACT_REPLAY_CLOCK_ROLLBACK');
    const next={
      ...this.state,
      lastSeenMs:now,
      consumed:[...this.state.consumed,{
        challengeRoot:verification.challengeRoot,
        approvalRoot:verification.approvalRoot,
        consumedAtMs:now,
      }],
    };
    this.store.save(next); // Commit replay protection before any provider side effect.
    this.state=next;
    this.consumed.add(verification.challengeRoot);
    return {
      consumed:true,durable:true,
      keyRoot:rootHash({policyRoot:this.policyRoot,challengeRoot:verification.challengeRoot}),
      stateRoot:rootHash(this.state),
    };
  }

  has(verification){
    this.#held();
    return Boolean(verification&&this.consumed.has(verification.challengeRoot));
  }

  get size(){this.#held();return this.consumed.size;}

  async close(){
    if(this.closed)return;
    this.closed=true;
    await this.lease.release();
  }
}

export async function openDurableExactActionReplayGuard(options){
  return DurableExactActionReplayGuard.open(options);
}
