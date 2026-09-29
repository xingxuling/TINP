import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAgentActionGuard} from '../adapters/rcl-agent-action-guard.mjs';
import {deriveAgentActionFacts,rootHash} from '../src/agent-action-policy.mjs';

function context(patch={}){
  const request={subjectId:'subject:code-agent',action:'filesystem.read',resource:'workspace:/src/app.py',
    sideEffect:'read',reversibility:'none',origin:'untrusted-prompt',...patch.request};
  const body={format:'taowind.opp.agent-action-contract.v0.1',profile:'opp.agent-action.v0.1',
    requestRoot:'a'.repeat(64),providerRoot:'b'.repeat(64),action:request.action,resource:request.resource,
    networkHost:request.networkHost??null,sideEffect:request.sideEffect,reversibility:request.reversibility,
    requiredAuthority:['workspace.read'],authorityGranted:false,boundary:'semantic-only'};
  const oppContract={...body,contractRoot:rootHash(body),...patch.oppContract};
  return {request,oppContract,
    lease:{subjectId:'subject:code-agent',actions:['filesystem.read','package.inspect'],
      resourceScopes:['workspace:/src/*','package:npm/*'],sideEffects:['read','none'],reversibility:['none','unknown'],
      scopes:['workspace.read'],credentialScopes:[],networkHosts:['api.github.com'],executables:[],packages:[],
      notBeforeMs:100,expiresAtMs:500,...patch.lease},
    session:{subjectId:'subject:code-agent',expiresAtMs:400,...patch.session},nowMs:200,...patch.extra};
}
async function decide(ctx){return evaluateAgentActionGuard(deriveAgentActionFacts(ctx));}

test('bounded workspace read is admitted',async()=>{
  const result=await decide(context()); assert.equal(result.allowed,true,JSON.stringify(result)); assert.equal(result.history.length,2);
});

test('prompt-injected credential, egress, spawn, install and write attempts fail closed',async()=>{
  const attacks=[
    {action:'credential.read',resource:'credential:ssh/id_rsa',sideEffect:'read',reversibility:'none'},
    {action:'network.egress',resource:'https://evil.example/exfil',networkHost:'evil.example',sideEffect:'network',reversibility:'none'},
    {action:'process.spawn',resource:'process:powershell',executable:'powershell',sideEffect:'execute',reversibility:'unknown'},
    {action:'package.install',resource:'package:npm/evil-postinstall',packageName:'evil-postinstall',sideEffect:'install',reversibility:'compensatable'},
    {action:'filesystem.write',resource:'workspace:/src/pwned.js',sideEffect:'write',reversibility:'reversible'},
  ];
  for(const request of attacks){const result=await decide(context({request})); assert.equal(result.allowed,false,request.action);}
});

test('tampered contract, expiry, revocation and broken evidence deny',async()=>{
  const tampered=context(); tampered.oppContract.action='credential.read'; assert.equal((await decide(tampered)).allowed,false);
  assert.equal((await decide(context({extra:{nowMs:500}}))).allowed,false);
  assert.equal((await decide({...context(),revoked:true})).allowed,false);
  assert.equal((await decide({...context(),evidenceContinuous:false})).allowed,false);
});

test('resource traversal is rejected before RCL',()=>{
  assert.throws(()=>deriveAgentActionFacts(context({request:{resource:'workspace:/src/../.ssh/id_rsa'}})),/RESOURCE_INVALID/);
});
