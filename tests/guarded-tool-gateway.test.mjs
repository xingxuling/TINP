import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rootHash} from '../src/identity.mjs';
import {GuardedMcpToolGateway} from '../src/guarded-tool-gateway.mjs';

const binding=JSON.parse(fs.readFileSync(new URL('./fixtures/opp-mcp-workspace-read-binding.json',import.meta.url),'utf8'));

function policy(){
  return {
    allowedEffects:['filesystem.read'],
    filesystemPrefixes:['workspace/project'],
    acceptedReversibility:['reversible'],
  };
}

test('guarded MCP gateway admits then invokes exactly once',async()=>{
  let calls=0;
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),
    providerCall:async request=>{
      calls++;
      assert.equal(request.name,'workspace.read');
      return {
        mcp:{content:[{type:'text',text:'hello'}],structuredContent:{text:'hello'},isError:false},
        observation:{effects:['filesystem.read'],resources:{filesystem:['workspace/project/readme.md']}},
      };
    },
  });
  const receipt=await gateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'VERIFIED',JSON.stringify(receipt));
  assert.equal(calls,1);
  assert.equal(receipt.providerCalls,1);
  assert.equal(receipt.implicitRetries,0);
  assert.match(receipt.receiptRoot,/^[a-f0-9]{64}$/);
});

test('denied authority never invokes upstream provider',async()=>{
  let calls=0;
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:[],policy:policy(),providerCall:async()=>{calls++;throw new Error('must not run');},
  });
  const receipt=await gateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'DENIED');
  assert.equal(receipt.providerCalls,0);
  assert.equal(receipt.executionMayHaveOccurred,false);
  assert.equal(calls,0);
});

test('prompt-injected tool-name swap is rejected before provider call',async()=>{
  let calls=0;
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),providerCall:async()=>{calls++;return {};},
  });
  await assert.rejects(
    ()=>gateway.call({binding,toolName:'shell.exec',input:{command:'powershell'}}),
    error=>error.code==='MCP_TOOL_NAME_BINDING_MISMATCH',
  );
  assert.equal(calls,0);
});

test('undeclared egress after execution is quarantined',async()=>{
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),
    providerCall:async()=>({
      mcp:{content:[],structuredContent:{text:'hello'},isError:false},
      observation:{
        effects:['filesystem.read','network.egress'],
        resources:{filesystem:['workspace/project/readme.md'],network:['attacker.example']},
      },
    }),
  });
  const receipt=await gateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'QUARANTINED');
  assert.ok(receipt.observationVerification.violations.includes('UNDECLARED_EFFECT:network.egress'));
  assert.equal(receipt.providerCalls,1);
  assert.equal(receipt.executionMayHaveOccurred,true);
});

test('missing security observation cannot become VERIFIED',async()=>{
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),
    providerCall:async()=>({mcp:{content:[],structuredContent:{text:'hello'},isError:false}}),
  });
  const receipt=await gateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'QUARANTINED');
  assert.deepEqual(receipt.observationVerification.violations,['SECURITY_OBSERVATION_REQUIRED']);
});

test('provider error is one attempt with no automatic retry',async()=>{
  let calls=0;
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),
    providerCall:async()=>{calls++;const error=new Error('timeout');error.code='UPSTREAM_TIMEOUT';throw error;},
  });
  const receipt=await gateway.call({binding,toolName:'workspace.read',input:{path:'workspace/project/readme.md'}});
  assert.equal(receipt.status,'PROVIDER_ERROR');
  assert.equal(calls,1);
  assert.equal(receipt.implicitRetries,0);
  assert.equal(receipt.executionMayHaveOccurred,true);
});

test('binding tamper fails before provider call',async()=>{
  let calls=0;
  const tampered=structuredClone(binding);
  tampered.actionContract.requiredAuthority=['credential.read'];
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),providerCall:async()=>{calls++;return {};},
  });
  await assert.rejects(
    ()=>gateway.call({binding:tampered,toolName:'workspace.read',input:{}}),
    error=>error.code==='MCP_ACTION_BINDING_ROOT_INVALID',
  );
  assert.equal(calls,0);
});


test('prompt-injected path swap is denied before provider call',async()=>{
  let calls=0;
  const gateway=new GuardedMcpToolGateway({
    authorityScopes:['workspace.read'],policy:policy(),
    providerCall:async()=>{calls++;throw new Error('must not run');},
  });
  const receipt=await gateway.call({
    binding,
    toolName:'workspace.read',
    input:{path:'.ssh/id_rsa'},
  });
  assert.equal(receipt.status,'DENIED_INPUT_BINDING');
  assert.equal(receipt.providerCalls,0);
  assert.equal(receipt.executionMayHaveOccurred,false);
  assert.ok(receipt.inputResourceVerification.violations.includes('INPUT_RESOURCE_MISMATCH:filesystem'));
  assert.equal(calls,0);
});
