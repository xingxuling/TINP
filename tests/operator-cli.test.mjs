import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('operator CLI imports an independently signed AAF approval and preserves the old revoked lease',async()=>{
  const r=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/operator-demo.mjs',import.meta.url))],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',x=>out+=x.toString('utf8'));child.stderr.on('data',x=>err+=x.toString('utf8'));
    child.once('error',reject);child.once('exit',code=>resolve({code,out,err}));
  });
  assert.equal(r.code,0,r.err);const result=JSON.parse(r.out);
  assert.equal(result.status,'VERIFIED_LOCAL_EXTERNAL_OPERATOR');assert.equal(result.booleanConfirmationDenied,true);
  assert.equal(result.zeroExecutions,true);assert.equal(result.externalKeyringNotCheckpointed,true);
  assert.ok(result.nodePids.every(pid=>pid!==result.signerPid));assert.equal(result.terminal.detail.operatorBoundary,'external-aaf-operator');
});
