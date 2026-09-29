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

async function withLease(directory,operation){
  const lease=await acquireDirectoryLease(directory);
  try{return await operation(lease);}
  finally{await lease.release().catch(()=>{});}
}

/**
 * Windows protected persistent one-shot store.
 *
 * The inter-process directory lock is held only for each load/check/save transaction,
 * so sequential MCP server restarts do not retain a lifetime lock. A challenge is
 * durably consumed before provider invocation. This gives at-most-once authorization
 * attempts, not exactly-once side effects.
 */
export class DurableExactActionReplayGuard{
  static async open({directory,policyRoot}={}){
    check(typeof directory==='string'&&directory.length>0,'EXACT_REPLAY_DIRECTORY_REQUIRED');
    check(hex(policyRoot),'EXACT_REPLAY_POLICY_ROOT_INVALID');
    const resolved=path.resolve(directory);
    const store=new ProtectedStore(path.join(resolved,'private'),{
      purpose:`twni.exact-action-replay.v1:${policyRoot}`,
    });
    const state=await withLease(resolved,async lease=>{
      lease.assertHeld();
      const now=Date.now();
      if(store.exists){
        const loaded=store.load();
        validateState(loaded,{policyRoot,nowMs:now});
        if(now>loaded.lastSeenMs){
          const advanced={...loaded,lastSeenMs:now};
          store.save(advanced);
          return advanced;
        }
        return loaded;
      }
      const created={format:FORMAT,policyRoot,lastSeenMs:now,consumed:[]};
      store.save(created);
      return created;
    });
    return new DurableExactActionReplayGuard({directory:resolved,policyRoot,store,state});
  }

  constructor({directory,policyRoot,store,state}){
    this.directory=directory;
    this.policyRoot=policyRoot;
    this.store=store;
    this.state=structuredClone(state);
    this.consumed=validateState(this.state,{policyRoot,nowMs:Date.now()});
    this.closed=false;
  }

  #open(){check(!this.closed,'EXACT_REPLAY_STORE_CLOSED');}

  async #refreshLocked(lease){
    this.#open();
    lease.assertHeld();
    const now=Date.now();
    const loaded=this.store.load();
    this.consumed=validateState(loaded,{policyRoot:this.policyRoot,nowMs:now});
    this.state=loaded;
    return {now,loaded};
  }

  async consume(verification){
    this.#open();
    check(verification&&hex(verification.approvalRoot)&&hex(verification.challengeRoot),
      'EXACT_ACTION_VERIFICATION_INVALID');
    return withLease(this.directory,async lease=>{
      const {now,loaded}=await this.#refreshLocked(lease);
      check(!this.consumed.has(verification.challengeRoot),'EXACT_ACTION_APPROVAL_REPLAY');
      check(loaded.consumed.length<MAX_ENTRIES,'EXACT_REPLAY_CAPACITY');
      const next={
        ...loaded,lastSeenMs:now,
        consumed:[...loaded.consumed,{
          challengeRoot:verification.challengeRoot,
          approvalRoot:verification.approvalRoot,
          consumedAtMs:now,
        }],
      };
      this.store.save(next); // Durable commit before any provider side effect.
      this.state=next;
      this.consumed.add(verification.challengeRoot);
      return {
        consumed:true,durable:true,
        keyRoot:rootHash({policyRoot:this.policyRoot,challengeRoot:verification.challengeRoot}),
        stateRoot:rootHash(this.state),
      };
    });
  }

  async has(verification){
    this.#open();
    if(!verification||!hex(verification.challengeRoot))return false;
    return withLease(this.directory,async lease=>{
      await this.#refreshLocked(lease);
      return this.consumed.has(verification.challengeRoot);
    });
  }

  get size(){this.#open();return this.consumed.size;}

  async close(){this.closed=true;}
}

export async function openDurableExactActionReplayGuard(options){
  return DurableExactActionReplayGuard.open(options);
}
