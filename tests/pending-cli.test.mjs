import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {InternetSuite} from '../src/suite.mjs';
import {checkpoint} from '../src/coordinator-state.mjs';
import {inspectPending} from '../src/pending-management.mjs';
const script=fileURLToPath(new URL('../scripts/pending.mjs',import.meta.url));
function cli(...args){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',x=>out+=x.toString('utf8'));child.stderr.on('data',x=>err+=x.toString('utf8'));child.once('error',reject);
  child.once('exit',code=>resolve({code,out,err}));
});}
for(const executed of [false,true])test(`pending CLI: ${executed?'retrieve executed receipt':'inspect then retire unsent pending'} without resending`,async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tinp-pending-cli-'));let suite=await InternetSuite.start({directory,durable:true});
  t.after(async()=>{await suite.close();fs.rmSync(directory,{recursive:true,force:true});});
  const selection=await suite.discover('C'),request=await suite.buildRequest('私有原文-不得输出-🌏',selection);
  suite.pending={request,selection};checkpoint(suite);
  if(executed)await suite.wire('C','INTENT',request,selection.route);
  await suite.close();
  const state=path.join(directory,'private/coordinator/protected-state.dpapi'),before=fs.readFileSync(state);
  const status=await cli('status',directory);assert.equal(status.code,0,status.err);assert.equal(JSON.parse(status.out).requestRoot,request.root);
  assert.ok(!status.out.includes('私有原文'));assert.ok(!status.out.includes('PRIVATE KEY'));assert.deepEqual(fs.readFileSync(state),before);
  const invalid=await cli('retire',directory);assert.equal(invalid.code,2);assert.deepEqual(fs.readFileSync(state),before);
  const lookup=await cli('reconcile',directory);
  if(executed){assert.equal(lookup.code,0,lookup.err);assert.equal(JSON.parse(lookup.out).executionOutcome,'executed');}
  else{
    assert.equal(lookup.code,2);assert.equal(JSON.parse(lookup.err).code,'RECEIPT_NOT_FOUND');assert.equal((await inspectPending(directory)).requestRoot,request.root);
    const retirement=await cli('retire',directory,'--request-root',request.root,'--confirm-retire-lease');assert.equal(retirement.code,0,retirement.err);
    assert.equal(JSON.parse(retirement.out).executionOutcome,'unknown');
  }
  suite=await InternetSuite.start({directory,durable:true});assert.equal(suite.pending,null);
  assert.equal((await suite.stats()).find(n=>n.nodeId==='C').executions,executed?1:0);
  if(!executed)await assert.rejects(suite.use('new intent'),/LEASE_REVOKED/);
});
