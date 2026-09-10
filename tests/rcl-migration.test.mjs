import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSessionMigrationGuard } from '../adapters/rcl-guard.mjs';

function valid() {
  return {oldSubjectId:'alice',newSubjectId:'alice',oldContinuityRoot:'continuity:alice',newContinuityRoot:'continuity:alice',
    oldWorldId:'world:local',newWorldId:'world:local',oldExpiresAtMs:1000,newExpiresAtMs:1000,
    oldScopes:['text.read','image.read'],newScopes:['text.read']};
}

test('RCL admits scope attenuation, equal expiry and scope order independence', async () => {
  const a=await evaluateSessionMigrationGuard(valid());
  assert.equal(a.allowed,true,JSON.stringify(a));assert.equal(a.history.length,2);
  for(const patch of [{newScopes:[]},{newScopes:['image.read','text.read']},{newExpiresAtMs:999}]) {
    const b=await evaluateSessionMigrationGuard({...valid(),...patch});
    assert.equal(b.allowed,true);assert.equal(b.programRoot,a.programRoot);
  }
});

test('identity, continuity, world, expiry and scope expansion are independently denied in RCL', async () => {
  const a=await evaluateSessionMigrationGuard(valid());
  for(const patch of [{newSubjectId:'intruder'},{newContinuityRoot:'other'},{newWorldId:'other'},
    {newExpiresAtMs:1001},{newScopes:['text.read','world.write']},{oldScopes:[]}]) {
    const b=await evaluateSessionMigrationGuard({...valid(),...patch});
    assert.equal(b.code,'RCL_MIGRATION_DENIED',JSON.stringify(patch));assert.equal(b.allowed,false);
    assert.equal(b.programRoot,a.programRoot);
  }
});

test('missing fields, invalid timestamps and malformed scope sets fail closed', async () => {
  for(const field of Object.keys(valid())) {const v=valid();delete v[field];assert.equal((await evaluateSessionMigrationGuard(v)).code,'RCL_MIGRATION_INPUT_INVALID',field);}
  for(const patch of [{newScopes:['text.read','text.read']},{newScopes:[null]},{newScopes:'text.read'},
    {oldScopes:Array(2)},{newScopes:['']},{newExpiresAtMs:NaN},{newExpiresAtMs:Infinity},{oldExpiresAtMs:-1}]) {
    assert.equal((await evaluateSessionMigrationGuard({...valid(),...patch})).code,'RCL_MIGRATION_INPUT_INVALID');
  }
  const v=valid();Object.defineProperty(v.newScopes,'0',{get(){throw new Error('must not read accessor');}});
  assert.equal((await evaluateSessionMigrationGuard(v)).code,'RCL_MIGRATION_INPUT_INVALID');
});

test('scope snapshots and concurrent migration decisions remain isolated', async () => {
  const v=valid();const pending=evaluateSessionMigrationGuard(v);v.newScopes.push('world.write');
  assert.equal((await pending).allowed,true);
  const results=await Promise.all(Array.from({length:8},(_,i)=>evaluateSessionMigrationGuard({...valid(),newSubjectId:i%2?'other':'alice'})));
  assert.deepEqual(results.map(r=>r.allowed),[true,false,true,false,true,false,true,false]);
});
